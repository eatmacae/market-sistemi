"""
Market Yönetim Sistemi — Satış Hedefleri Route'ları
Günlük / haftalık / aylık hedef tanımlama ve ilerleme takibi
"""

from fastapi       import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy    import func, cast, Date
from sqlalchemy.orm import Session
from pydantic      import BaseModel, condecimal
from typing        import Optional
from datetime      import date, timedelta
from decimal       import Decimal

from database      import get_db
from models        import SalesTarget, Sale, Personnel
from routes.auth   import get_current_user, require_role
from services      import audit_log

router = APIRouter(prefix="/api/targets", tags=["Satış Hedefleri"])


# ============================================================
# PYDANTIC ŞEMASI
# ============================================================

class TargetCreate(BaseModel):
    branch_id    : int     = 1
    type         : str                      # daily | weekly | monthly
    target_amount: Decimal
    period_start : date
    note         : Optional[str] = None


# ============================================================
# YARDIMCI: Dönem aralığı hesapla
# ============================================================

def _donem_araligi(tip: str, baslangic: date) -> tuple[date, date]:
    """Dönem başlangıcına göre bitiş tarihini hesaplar."""
    if tip == "daily":
        return baslangic, baslangic
    elif tip == "weekly":
        return baslangic, baslangic + timedelta(days=6)
    elif tip == "monthly":
        # Ayın son günü
        if baslangic.month == 12:
            son = baslangic.replace(day=31)
        else:
            son = baslangic.replace(month=baslangic.month + 1, day=1) - timedelta(days=1)
        return baslangic, son
    else:
        raise HTTPException(status_code=400, detail="Geçersiz hedef tipi. daily | weekly | monthly olmalı.")


def _gerceklesen_satis(db: Session, branch_id: int, baslangic: date, bitis: date) -> Decimal:
    """Verilen tarih aralığında gerçekleşen satış toplamını döner."""
    sonuc = (
        db.query(func.coalesce(func.sum(Sale.total), 0))
        .filter(
            Sale.branch_id == branch_id,
            Sale.status    == "completed",
            cast(Sale.created_at, Date) >= baslangic,
            cast(Sale.created_at, Date) <= bitis,
        )
        .scalar()
    )
    return Decimal(str(sonuc))


# ============================================================
# HEDEF LİSTESİ
# ============================================================

@router.get("")
async def list_targets(
    branch_id   : int            = Query(1),
    type        : Optional[str]  = Query(None),    # daily | weekly | monthly
    page        : int            = Query(1, ge=1),
    per_page    : int            = Query(20, ge=1, le=100),
    db          : Session        = Depends(get_db),
    current_user: Personnel      = Depends(get_current_user),
):
    """Satış hedefleri listesi — dönem tipine göre filtreli."""
    sorgu = db.query(SalesTarget).filter(SalesTarget.branch_id == branch_id)

    if type:
        if type not in ("daily", "weekly", "monthly"):
            raise HTTPException(status_code=400, detail="Geçersiz tip.")
        sorgu = sorgu.filter(SalesTarget.type == type)

    toplam = sorgu.count()
    items  = (
        sorgu
        .order_by(SalesTarget.period_start.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    # Her hedef için ilerleme hesapla
    sonuc = []
    for t in items:
        baslangic, bitis = _donem_araligi(t.type, t.period_start)
        gerceklesen      = _gerceklesen_satis(db, branch_id, baslangic, bitis)
        yuzde            = float(gerceklesen / t.target_amount * 100) if t.target_amount > 0 else 0.0

        sonuc.append({
            "id"           : t.id,
            "branch_id"    : t.branch_id,
            "type"         : t.type,
            "target_amount": float(t.target_amount),
            "period_start" : t.period_start.isoformat(),
            "period_end"   : bitis.isoformat(),
            "note"         : t.note,
            "created_at"   : t.created_at.isoformat() if t.created_at else None,
            "gerceklesen"  : float(gerceklesen),
            "ilerleme_yuzde": round(min(yuzde, 100), 1),
            "tamamlandi"   : yuzde >= 100,
        })

    return {"total": toplam, "page": page, "per_page": per_page, "items": sonuc}


# ============================================================
# AKTİF HEDEFLER (Bugün geçerli)
# ============================================================

@router.get("/aktif")
async def aktif_hedefler(
    branch_id   : int      = Query(1),
    db          : Session  = Depends(get_db),
    current_user: Personnel = Depends(get_current_user),
):
    """
    Bugün geçerli olan tüm hedefleri (daily, weekly, monthly) döner.
    Her biri için gerçekleşen satış ve ilerleme yüzdesi dahildir.
    """
    bugun   = date.today()
    sonuclar = []

    for tip in ("daily", "weekly", "monthly"):
        # Bu döneme ait en son hedefi bul
        hedef = (
            db.query(SalesTarget)
            .filter(
                SalesTarget.branch_id  == branch_id,
                SalesTarget.type       == tip,
                SalesTarget.period_start <= bugun,
            )
            .order_by(SalesTarget.period_start.desc())
            .first()
        )

        if not hedef:
            sonuclar.append({
                "type"          : tip,
                "hedef_var"     : False,
                "target_amount" : None,
                "gerceklesen"   : None,
                "ilerleme_yuzde": None,
                "tamamlandi"    : False,
            })
            continue

        baslangic, bitis = _donem_araligi(tip, hedef.period_start)

        # Dönem henüz bitmemişse bugüne kadar olan kısım
        etkin_bitis = min(bitis, bugun)

        gerceklesen = _gerceklesen_satis(db, branch_id, baslangic, etkin_bitis)
        yuzde       = float(gerceklesen / hedef.target_amount * 100) if hedef.target_amount > 0 else 0.0

        # Kalan gün
        kalan_gun = (bitis - bugun).days if bitis >= bugun else 0

        sonuclar.append({
            "type"           : tip,
            "hedef_var"      : True,
            "target_id"      : hedef.id,
            "target_amount"  : float(hedef.target_amount),
            "period_start"   : hedef.period_start.isoformat(),
            "period_end"     : bitis.isoformat(),
            "kalan_gun"      : kalan_gun,
            "gerceklesen"    : float(gerceklesen),
            "kalan_miktar"   : max(0.0, float(hedef.target_amount) - float(gerceklesen)),
            "ilerleme_yuzde" : round(min(yuzde, 100), 1),
            "tamamlandi"     : yuzde >= 100,
            "note"           : hedef.note,
        })

    return {"branch_id": branch_id, "tarih": bugun.isoformat(), "hedefler": sonuclar}


# ============================================================
# HEDEF DETAY
# ============================================================

@router.get("/{target_id}")
async def get_target(
    target_id   : int,
    db          : Session  = Depends(get_db),
    current_user: Personnel = Depends(get_current_user),
):
    """Tek hedef detayı + ilerleme."""
    hedef = db.query(SalesTarget).filter(SalesTarget.id == target_id).first()
    if not hedef:
        raise HTTPException(status_code=404, detail="Hedef bulunamadı.")

    baslangic, bitis = _donem_araligi(hedef.type, hedef.period_start)
    gerceklesen      = _gerceklesen_satis(db, hedef.branch_id, baslangic, bitis)
    yuzde            = float(gerceklesen / hedef.target_amount * 100) if hedef.target_amount > 0 else 0.0

    return {
        "id"            : hedef.id,
        "branch_id"     : hedef.branch_id,
        "type"          : hedef.type,
        "target_amount" : float(hedef.target_amount),
        "period_start"  : hedef.period_start.isoformat(),
        "period_end"    : bitis.isoformat(),
        "note"          : hedef.note,
        "created_at"    : hedef.created_at.isoformat() if hedef.created_at else None,
        "updated_at"    : hedef.updated_at.isoformat() if hedef.updated_at else None,
        "gerceklesen"   : float(gerceklesen),
        "kalan_miktar"  : max(0.0, float(hedef.target_amount) - float(gerceklesen)),
        "ilerleme_yuzde": round(min(yuzde, 100), 1),
        "tamamlandi"    : yuzde >= 100,
    }


# ============================================================
# HEDEF OLUŞTUR / GÜNCELLE (Upsert)
# ============================================================

@router.post("", status_code=201)
async def upsert_target(
    request     : Request,
    data        : TargetCreate,
    db          : Session  = Depends(get_db),
    current_user: Personnel = Depends(require_role("admin")),
):
    """
    Hedef oluşturur veya aynı tip + period_start için günceller.
    Upsert mantığı: aynı dönem için tek kayıt tutulur.
    """
    if data.type not in ("daily", "weekly", "monthly"):
        raise HTTPException(status_code=400, detail="Geçersiz tip. daily | weekly | monthly olmalı.")
    if data.target_amount <= 0:
        raise HTTPException(status_code=400, detail="Hedef tutarı sıfırdan büyük olmalıdır.")

    # Aynı dönem için mevcut hedef var mı?
    mevcut = (
        db.query(SalesTarget)
        .filter(
            SalesTarget.branch_id    == data.branch_id,
            SalesTarget.type         == data.type,
            SalesTarget.period_start == data.period_start,
        )
        .first()
    )

    if mevcut:
        # Güncelle
        eski_tutar    = float(mevcut.target_amount)
        mevcut.target_amount = data.target_amount
        mevcut.note          = data.note
        db.commit()
        db.refresh(mevcut)

        audit_log.log_action(
            db          = db,
            action_type = "TARGET_UPDATE",
            user_id     = current_user.id,
            table_name  = "sales_targets",
            record_id   = mevcut.id,
            old_value   = {"target_amount": eski_tutar},
            new_value   = {"target_amount": float(mevcut.target_amount)},
            ip_address  = request.client.host if request.client else None,
            branch_id   = data.branch_id,
        )
        return {"success": True, "islem": "guncellendi", "id": mevcut.id}

    # Yeni hedef oluştur
    yeni = SalesTarget(
        branch_id     = data.branch_id,
        type          = data.type,
        target_amount = data.target_amount,
        period_start  = data.period_start,
        note          = data.note,
        created_by    = current_user.id,
    )
    db.add(yeni)
    db.commit()
    db.refresh(yeni)

    audit_log.log_action(
        db          = db,
        action_type = "TARGET_CREATE",
        user_id     = current_user.id,
        table_name  = "sales_targets",
        record_id   = yeni.id,
        new_value   = {"type": yeni.type, "target_amount": float(yeni.target_amount), "period_start": str(yeni.period_start)},
        ip_address  = request.client.host if request.client else None,
        branch_id   = data.branch_id,
    )
    return {"success": True, "islem": "olusturuldu", "id": yeni.id}


# ============================================================
# HEDEF SİL
# ============================================================

@router.delete("/{target_id}")
async def delete_target(
    target_id   : int,
    request     : Request,
    db          : Session  = Depends(get_db),
    current_user: Personnel = Depends(require_role("admin")),
):
    """Hedefi siler (gerçek silme — hedefler soft delete gerektirmez)."""
    hedef = db.query(SalesTarget).filter(SalesTarget.id == target_id).first()
    if not hedef:
        raise HTTPException(status_code=404, detail="Hedef bulunamadı.")

    audit_log.log_action(
        db          = db,
        action_type = "TARGET_DELETE",
        user_id     = current_user.id,
        table_name  = "sales_targets",
        record_id   = target_id,
        old_value   = {"type": hedef.type, "target_amount": float(hedef.target_amount)},
        ip_address  = request.client.host if request.client else None,
        branch_id   = hedef.branch_id,
    )

    db.delete(hedef)
    db.commit()

    return {"success": True, "message": "Hedef silindi."}


# ============================================================
# ÖZET: Tüm dönemler karşılaştırma
# ============================================================

@router.get("/ozet/karsilastirma")
async def hedef_karsilastirma(
    branch_id   : int      = Query(1),
    ay          : int      = Query(None, ge=1, le=12),
    yil         : int      = Query(None, ge=2020, le=2100),
    db          : Session  = Depends(get_db),
    current_user: Personnel = Depends(get_current_user),
):
    """
    Belirtilen ay için tüm günlük hedeflerin özeti.
    Varsayılan: mevcut ay.
    """
    bugun = date.today()
    hedef_ay  = ay   or bugun.month
    hedef_yil = yil  or bugun.year

    ay_baslangic = date(hedef_yil, hedef_ay, 1)
    if hedef_ay == 12:
        ay_bitis = date(hedef_yil, 12, 31)
    else:
        ay_bitis = date(hedef_yil, hedef_ay + 1, 1) - timedelta(days=1)

    # Bu aydaki tüm günlük hedefler
    hedefler = (
        db.query(SalesTarget)
        .filter(
            SalesTarget.branch_id    == branch_id,
            SalesTarget.type         == "daily",
            SalesTarget.period_start >= ay_baslangic,
            SalesTarget.period_start <= ay_bitis,
        )
        .order_by(SalesTarget.period_start)
        .all()
    )

    gunler = []
    toplam_hedef      = Decimal("0")
    toplam_gerceklesen = Decimal("0")

    for h in hedefler:
        gerceklesen = _gerceklesen_satis(db, branch_id, h.period_start, h.period_start)
        yuzde       = float(gerceklesen / h.target_amount * 100) if h.target_amount > 0 else 0.0
        toplam_hedef       += h.target_amount
        toplam_gerceklesen += gerceklesen
        gunler.append({
            "tarih"          : h.period_start.isoformat(),
            "hedef"          : float(h.target_amount),
            "gerceklesen"    : float(gerceklesen),
            "ilerleme_yuzde" : round(min(yuzde, 100), 1),
            "tamamlandi"     : yuzde >= 100,
        })

    genel_yuzde = float(toplam_gerceklesen / toplam_hedef * 100) if toplam_hedef > 0 else 0.0

    return {
        "ay"                  : hedef_ay,
        "yil"                 : hedef_yil,
        "toplam_hedef"        : float(toplam_hedef),
        "toplam_gerceklesen"  : float(toplam_gerceklesen),
        "genel_ilerleme_yuzde": round(min(genel_yuzde, 100), 1),
        "gun_sayisi"          : len(gunler),
        "tamamlanan_gun"      : sum(1 for g in gunler if g["tamamlandi"]),
        "gunler"              : gunler,
    }
