"""
Market Yönetim Sistemi — Vardiya (Kasa Oturumu) Route'ları
Kasa açılış/kapanış, Z raporu, kasa farkı hesabı
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime

from database import get_db
from models import Session as KasaSession, Personnel, Sale
from schemas import SessionCreate, SessionClose, SessionResponse
from routes.auth import get_current_user, require_role
from services import audit_log

router = APIRouter(prefix="/api/sessions", tags=["Vardiyalar"])


# ============================================================
# AKTİF OTURUM SORGULA
# ============================================================

@router.get("/active")
async def get_active_session(
    branch_id    : int = Query(1),
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """
    Şubede açık kasa oturumu var mı kontrol eder.
    Kasa ekranı açılışında çağrılır.
    """
    oturum = db.query(KasaSession).filter(
        KasaSession.branch_id  == branch_id,
        KasaSession.closed_at  == None,
    ).first()

    if not oturum:
        return {"active": False, "session": None}

    kasiyer = db.query(Personnel).filter(Personnel.id == oturum.cashier_id).first()

    return {
        "active" : True,
        "session": {
            "id"            : oturum.id,
            "cashier_id"    : oturum.cashier_id,
            "cashier_name"  : kasiyer.name if kasiyer else "—",
            "opening_amount": float(oturum.opening_amount),
            "opened_at"     : str(oturum.opened_at),
        },
    }


# ============================================================
# OTURUM AÇ (Kasa açılışı)
# ============================================================

@router.post("", response_model=SessionResponse, status_code=201)
async def open_session(
    request      : Request,
    data         : SessionCreate,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin", "cashier")),
):
    """
    Kasa oturumu açar.
    Zaten açık oturum varsa hata döner (aynı anda iki oturum açılamaz).
    """
    # Açık oturum var mı?
    acik = db.query(KasaSession).filter(
        KasaSession.branch_id == data.branch_id,
        KasaSession.closed_at == None,
    ).first()

    if acik:
        raise HTTPException(
            status_code = 400,
            detail      = f"Şubede zaten açık bir oturum var (ID: {acik.id}). Önce o oturumu kapatın.",
        )

    oturum = KasaSession(
        branch_id      = data.branch_id,
        cashier_id     = data.cashier_id,
        opening_amount = data.opening_amount,
    )
    db.add(oturum)
    db.commit()
    db.refresh(oturum)

    audit_log.log_action(
        db          = db,
        action_type = "SESSION_OPEN",
        user_id     = current_user.id,
        table_name  = "sessions",
        record_id   = oturum.id,
        new_value   = {"opening_amount": float(data.opening_amount)},
        ip_address  = request.client.host if request.client else None,
        branch_id   = data.branch_id,
        note        = f"Kasa açılışı — {current_user.name}",
    )

    return oturum


# ============================================================
# OTURUM KAPAT (Kasa kapanışı + Z Raporu)
# ============================================================

@router.post("/{session_id}/close")
async def close_session(
    session_id   : int,
    request      : Request,
    data         : SessionClose,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin", "cashier")),
):
    """
    Kasa oturumunu kapatır ve Z raporu üretir.
    Kasa farkı (açılış + satış toplamı - kapanış) hesaplanır.
    """
    oturum = db.query(KasaSession).filter(
        KasaSession.id        == session_id,
        KasaSession.closed_at == None,
    ).first()

    if not oturum:
        raise HTTPException(
            status_code = 404,
            detail      = "Açık oturum bulunamadı veya zaten kapatılmış.",
        )

    # Bu oturumdaki satış toplamları
    satis_ozet = db.query(
        func.count(Sale.id).label("toplam_satis"),
        func.coalesce(func.sum(Sale.total), 0).label("toplam_tutar"),
        func.coalesce(func.sum(Sale.discount), 0).label("toplam_indirim"),
        func.coalesce(func.sum(Sale.vat_amount), 0).label("toplam_kdv"),
    ).filter(
        Sale.session_id == session_id,
        Sale.status     == "completed",
    ).first()

    # Ödeme tipine göre dağılım
    nakit_toplam = db.query(
        func.coalesce(func.sum(Sale.total), 0)
    ).filter(
        Sale.session_id  == session_id,
        Sale.status      == "completed",
        Sale.payment_type == "cash",
    ).scalar() or 0

    kart_toplam = db.query(
        func.coalesce(func.sum(Sale.total), 0)
    ).filter(
        Sale.session_id  == session_id,
        Sale.status      == "completed",
        Sale.payment_type.in_(["card", "mixed"]),
    ).scalar() or 0

    # Kasa farkı: (açılış + nakit satış) - kapanış
    beklenen_kasa = float(oturum.opening_amount) + float(nakit_toplam)
    kasa_farki    = float(data.closing_amount) - beklenen_kasa

    # Oturumu kapat
    oturum.closing_amount = data.closing_amount
    oturum.closed_at      = datetime.utcnow()
    db.commit()

    z_raporu = {
        "session_id"     : session_id,
        "cashier_id"     : oturum.cashier_id,
        "acilis_tutari"  : float(oturum.opening_amount),
        "kapanis_tutari" : float(data.closing_amount),
        "toplam_satis"   : satis_ozet.toplam_satis,
        "toplam_tutar"   : float(satis_ozet.toplam_tutar),
        "toplam_indirim" : float(satis_ozet.toplam_indirim),
        "toplam_kdv"     : float(satis_ozet.toplam_kdv),
        "nakit_toplam"   : float(nakit_toplam),
        "kart_toplam"    : float(kart_toplam),
        "beklenen_kasa"  : beklenen_kasa,
        "kasa_farki"     : kasa_farki,
        "fark_uyarisi"   : abs(kasa_farki) > 5,   # 5₺'den fazla fark varsa uyarı
        "acilis_zamani"  : str(oturum.opened_at),
        "kapanis_zamani" : str(oturum.closed_at),
    }

    audit_log.log_action(
        db          = db,
        action_type = "SESSION_CLOSE",
        user_id     = current_user.id,
        table_name  = "sessions",
        record_id   = session_id,
        new_value   = z_raporu,
        ip_address  = request.client.host if request.client else None,
        branch_id   = oturum.branch_id,
        note        = f"Z Raporu — Fark: {kasa_farki:+.2f}₺",
    )

    return {
        "success" : True,
        "message" : "Oturum kapatıldı.",
        "z_raporu": z_raporu,
    }


# ============================================================
# OTURUM GEÇMİŞİ
# ============================================================

@router.get("")
async def list_sessions(
    branch_id    : int = Query(1),
    page         : int = Query(1, ge=1),
    per_page     : int = Query(20, ge=1, le=100),
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin")),
):
    """Kasa oturumu geçmişi — sadece admin görebilir."""
    query = db.query(KasaSession).filter(KasaSession.branch_id == branch_id)
    total = query.count()
    items = (
        query
        .order_by(KasaSession.opened_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "total"   : total,
        "page"    : page,
        "per_page": per_page,
        "items"   : [SessionResponse.model_validate(s) for s in items],
    }


# ============================================================
# Z RAPORU (Kapalı oturum için tekrar görüntüle)
# ============================================================

@router.get("/{session_id}/z-report")
async def get_z_report(
    session_id   : int,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin")),
):
    """Belirli bir oturumun Z raporunu döner."""
    oturum = db.query(KasaSession).filter(KasaSession.id == session_id).first()
    if not oturum:
        raise HTTPException(status_code=404, detail="Oturum bulunamadı.")

    satis_ozet = db.query(
        func.count(Sale.id).label("toplam_satis"),
        func.coalesce(func.sum(Sale.total), 0).label("toplam_tutar"),
        func.coalesce(func.sum(Sale.discount), 0).label("toplam_indirim"),
        func.coalesce(func.sum(Sale.vat_amount), 0).label("toplam_kdv"),
    ).filter(
        Sale.session_id == session_id,
        Sale.status     == "completed",
    ).first()

    nakit = db.query(func.coalesce(func.sum(Sale.total), 0)).filter(
        Sale.session_id == session_id, Sale.payment_type == "cash"
    ).scalar() or 0

    kart = db.query(func.coalesce(func.sum(Sale.total), 0)).filter(
        Sale.session_id == session_id, Sale.payment_type.in_(["card", "mixed"])
    ).scalar() or 0

    return {
        "session_id"    : session_id,
        "toplam_satis"  : satis_ozet.toplam_satis,
        "toplam_tutar"  : float(satis_ozet.toplam_tutar),
        "toplam_indirim": float(satis_ozet.toplam_indirim),
        "toplam_kdv"    : float(satis_ozet.toplam_kdv),
        "nakit_toplam"  : float(nakit),
        "kart_toplam"   : float(kart),
        "acilis_tutari" : float(oturum.opening_amount),
        "kapanis_tutari": float(oturum.closing_amount) if oturum.closing_amount else None,
        "acilis_zamani" : str(oturum.opened_at),
        "kapanis_zamani": str(oturum.closed_at) if oturum.closed_at else None,
    }
