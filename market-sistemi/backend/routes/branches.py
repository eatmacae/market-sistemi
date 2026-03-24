"""
Market Yönetim Sistemi — Şube Route'ları
Şube listeleme, oluşturma, güncelleme, aktif/pasif
"""

from fastapi        import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from typing         import Optional

from database   import get_db
from models     import Branch, Personnel
from routes.auth import get_current_user, require_role
from services   import audit_log

router = APIRouter(prefix="/api/branches", tags=["Şubeler"])


# ============================================================
# ŞUBE LİSTESİ
# ============================================================

@router.get("")
async def sube_listesi(
    sadece_aktif : bool      = Query(True),
    db           : Session   = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """Tüm şubeleri listeler."""
    sorgu = db.query(Branch)
    if sadece_aktif:
        sorgu = sorgu.filter(Branch.active == True)

    subeler = sorgu.order_by(Branch.id).all()

    return {
        "total": len(subeler),
        "items": [
            {
                "id"      : s.id,
                "name"    : s.name,
                "address" : s.address,
                "phone"   : s.phone,
                "active"  : s.active,
            }
            for s in subeler
        ],
    }


# ============================================================
# ŞUBE OLUŞTUR
# ============================================================

@router.post("", status_code=201)
async def sube_olustur(
    request     : Request,
    name        : str,
    address     : Optional[str] = None,
    phone       : Optional[str] = None,
    db          : Session       = Depends(get_db),
    current_user: Personnel     = Depends(require_role("admin")),
):
    """Yeni şube oluşturur. Sadece admin."""
    mevcut = db.query(Branch).filter(Branch.name == name).first()
    if mevcut:
        raise HTTPException(status_code=400, detail=f"'{name}' adında şube zaten var.")

    sube = Branch(name=name, address=address, phone=phone, active=True)
    db.add(sube)
    db.commit()
    db.refresh(sube)

    audit_log.log_action(
        db          = db,
        action_type = "BRANCH_CREATE",
        user_id     = current_user.id,
        table_name  = "branches",
        record_id   = sube.id,
        new_value   = {"name": name},
        ip_address  = request.client.host if request.client else None,
        branch_id   = current_user.branch_id,
    )

    return {
        "success": True,
        "id"     : sube.id,
        "name"   : sube.name,
        "address": sube.address,
        "phone"  : sube.phone,
    }


# ============================================================
# ŞUBE GÜNCELLE
# ============================================================

@router.patch("/{sube_id}")
async def sube_guncelle(
    sube_id     : int,
    request     : Request,
    name        : Optional[str] = None,
    address     : Optional[str] = None,
    phone       : Optional[str] = None,
    active      : Optional[bool] = None,
    db          : Session       = Depends(get_db),
    current_user: Personnel     = Depends(require_role("admin")),
):
    """Şube bilgilerini günceller."""
    sube = db.query(Branch).filter(Branch.id == sube_id).first()
    if not sube:
        raise HTTPException(status_code=404, detail="Şube bulunamadı.")

    if sube_id == 1 and active is False:
        raise HTTPException(status_code=400, detail="Merkez şube deaktif edilemez.")

    eski = {"name": sube.name, "active": sube.active}

    if name    is not None: sube.name    = name
    if address is not None: sube.address = address
    if phone   is not None: sube.phone   = phone
    if active  is not None: sube.active  = active

    db.commit()
    db.refresh(sube)

    audit_log.log_action(
        db          = db,
        action_type = "BRANCH_UPDATE",
        user_id     = current_user.id,
        table_name  = "branches",
        record_id   = sube_id,
        old_value   = eski,
        new_value   = {"name": sube.name, "active": sube.active},
        ip_address  = request.client.host if request.client else None,
        branch_id   = current_user.branch_id,
    )

    return {
        "success": True,
        "id"     : sube.id,
        "name"   : sube.name,
        "address": sube.address,
        "phone"  : sube.phone,
        "active" : sube.active,
    }
