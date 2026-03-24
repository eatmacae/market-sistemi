"""
Market Yönetim Sistemi — Müşteri Route'ları
Müşteri CRUD, veresiye kayıt/tahsilat, sadakat puanı
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from datetime import datetime

from database import get_db
from models import Customer, Sale, Personnel
from schemas import CustomerCreate, CustomerUpdate, CustomerResponse, PaginatedResponse
from routes.auth import get_current_user, require_role
from services import audit_log

router = APIRouter(prefix="/api/customers", tags=["Müşteriler"])


# ============================================================
# MÜŞTERİ LİSTESİ
# ============================================================

@router.get("", response_model=PaginatedResponse)
async def list_customers(
    branch_id    : int           = Query(1),
    page         : int           = Query(1, ge=1),
    per_page     : int           = Query(50, ge=1, le=200),
    search       : Optional[str] = Query(None),
    veresiyeli   : bool          = Query(False),   # Sadece bakiyeli müşteriler
    db           : Session       = Depends(get_db),
    current_user : Personnel     = Depends(get_current_user),
):
    """Müşteri listesi — arama ve veresiye filtresi destekler."""
    query = db.query(Customer).filter(
        Customer.branch_id  == branch_id,
        Customer.is_deleted == False,
    )

    if search:
        query = query.filter(
            or_(
                Customer.name.ilike(f"%{search}%"),
                Customer.phone.ilike(f"%{search}%"),
            )
        )

    if veresiyeli:
        query = query.filter(Customer.credit_balance > 0)

    total = query.count()
    items = (
        query
        .order_by(Customer.name)
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return PaginatedResponse(
        total    = total,
        page     = page,
        per_page = per_page,
        items    = [CustomerResponse.model_validate(c) for c in items],
    )


# ============================================================
# TELEFON İLE HIZLI ARAMA (Kasa için)
# ============================================================

@router.get("/phone/{phone}")
async def find_by_phone(
    phone        : str,
    branch_id    : int = Query(1),
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """Telefon numarasıyla müşteri bulur — kasa ekranında hızlı arama için."""
    musteri = db.query(Customer).filter(
        Customer.phone      == phone,
        Customer.branch_id  == branch_id,
        Customer.is_deleted == False,
    ).first()

    if not musteri:
        return {"found": False, "customer": None}

    return {"found": True, "customer": CustomerResponse.model_validate(musteri)}


# ============================================================
# MÜŞTERİ DETAY
# ============================================================

@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id  : int,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    musteri = db.query(Customer).filter(
        Customer.id         == customer_id,
        Customer.is_deleted == False,
    ).first()

    if not musteri:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")
    return musteri


# ============================================================
# MÜŞTERİ OLUŞTUR
# ============================================================

@router.post("", response_model=CustomerResponse, status_code=201)
async def create_customer(
    request      : Request,
    data         : CustomerCreate,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """Yeni müşteri kaydı. Tüm personel yapabilir."""
    if data.phone:
        mevcut = db.query(Customer).filter(
            Customer.phone      == data.phone,
            Customer.branch_id  == data.branch_id,
            Customer.is_deleted == False,
        ).first()
        if mevcut:
            raise HTTPException(
                status_code = 400,
                detail      = f"Bu telefon numarası zaten kayıtlı: {mevcut.name}",
            )

    musteri = Customer(**data.model_dump())
    db.add(musteri)
    db.commit()
    db.refresh(musteri)

    audit_log.log_action(
        db          = db,
        action_type = "CUSTOMER_CREATE",
        user_id     = current_user.id,
        table_name  = "customers",
        record_id   = musteri.id,
        new_value   = {"name": musteri.name, "phone": musteri.phone},
        ip_address  = request.client.host if request.client else None,
        branch_id   = current_user.branch_id,
    )

    return musteri


# ============================================================
# MÜŞTERİ GÜNCELLE
# ============================================================

@router.patch("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id  : int,
    request      : Request,
    data         : CustomerUpdate,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    musteri = db.query(Customer).filter(
        Customer.id         == customer_id,
        Customer.is_deleted == False,
    ).first()
    if not musteri:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    guncelleme = data.model_dump(exclude_none=True)
    for alan, deger in guncelleme.items():
        setattr(musteri, alan, deger)
    db.commit()
    db.refresh(musteri)

    audit_log.log_action(
        db          = db,
        action_type = "CUSTOMER_UPDATE",
        user_id     = current_user.id,
        table_name  = "customers",
        record_id   = customer_id,
        new_value   = guncelleme,
        ip_address  = request.client.host if request.client else None,
        branch_id   = current_user.branch_id,
    )

    return musteri


# ============================================================
# MÜŞTERİ SİL (Soft Delete)
# ============================================================

@router.delete("/{customer_id}")
async def delete_customer(
    customer_id  : int,
    request      : Request,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin")),
):
    musteri = db.query(Customer).filter(
        Customer.id         == customer_id,
        Customer.is_deleted == False,
    ).first()
    if not musteri:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    if musteri.credit_balance > 0:
        raise HTTPException(
            status_code = 400,
            detail      = f"Müşterinin {musteri.credit_balance}₺ açık veresiyesi var. Önce tahsilat yapın.",
        )

    musteri.is_deleted = True
    musteri.deleted_at = datetime.utcnow()
    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "CUSTOMER_DELETE",
        user_id     = current_user.id,
        table_name  = "customers",
        record_id   = customer_id,
        old_value   = {"name": musteri.name, "phone": musteri.phone},
        ip_address  = request.client.host if request.client else None,
        branch_id   = current_user.branch_id,
    )

    return {"success": True, "message": f"'{musteri.name}' müşteri kaydı silindi."}


# ============================================================
# VERESİYE TAHSİLAT
# ============================================================

@router.post("/{customer_id}/payment")
async def collect_credit(
    customer_id  : int,
    request      : Request,
    tutar        : float,
    not_         : Optional[str] = None,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """
    Müşteriden veresiye tahsilatı.
    Bakiyeyi düşürür, audit log'a kaydeder.
    """
    if tutar <= 0:
        raise HTTPException(status_code=400, detail="Tahsilat tutarı pozitif olmalıdır.")

    musteri = db.query(Customer).filter(
        Customer.id         == customer_id,
        Customer.is_deleted == False,
    ).first()
    if not musteri:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı.")

    if tutar > float(musteri.credit_balance):
        raise HTTPException(
            status_code = 400,
            detail      = f"Tahsilat tutarı bakiyeden fazla. Bakiye: {musteri.credit_balance}₺",
        )

    eski_bakiye          = float(musteri.credit_balance)
    musteri.credit_balance = float(musteri.credit_balance) - tutar
    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "CREDIT_PAYMENT",
        user_id     = current_user.id,
        table_name  = "customers",
        record_id   = customer_id,
        old_value   = {"credit_balance": eski_bakiye},
        new_value   = {"credit_balance": float(musteri.credit_balance), "tahsilat": tutar},
        ip_address  = request.client.host if request.client else None,
        branch_id   = current_user.branch_id,
        note        = not_ or f"Veresiye tahsilatı: {musteri.name}",
    )

    return {
        "success"      : True,
        "tahsilat"     : tutar,
        "eski_bakiye"  : eski_bakiye,
        "yeni_bakiye"  : float(musteri.credit_balance),
        "message"      : f"{musteri.name} — {tutar}₺ tahsilat yapıldı.",
    }


# ============================================================
# MÜŞTERİ SATIŞ GEÇMİŞİ
# ============================================================

@router.get("/{customer_id}/sales")
async def customer_sales(
    customer_id  : int,
    page         : int = Query(1, ge=1),
    per_page     : int = Query(20, ge=1, le=100),
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """Müşterinin satış geçmişi."""
    query = db.query(Sale).filter(Sale.customer_id == customer_id)
    total = query.count()
    items = (
        query
        .order_by(Sale.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "total"   : total,
        "page"    : page,
        "per_page": per_page,
        "items"   : [
            {
                "id"          : s.id,
                "total"       : float(s.total),
                "payment_type": s.payment_type,
                "status"      : s.status,
                "created_at"  : str(s.created_at),
            }
            for s in items
        ],
    }
