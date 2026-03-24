"""
Market Yönetim Sistemi — Personel Route'ları
Personel CRUD, PIN değiştirme, aktivasyon/deaktivasyon
"""

from fastapi  import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm  import Session
from passlib.context import CryptContext
from typing          import Optional

from database  import get_db
from models    import Personnel
from schemas   import PersonnelCreate, PersonnelResponse
from routes.auth import get_current_user, require_role
from services  import audit_log

router = APIRouter(prefix="/api/personnel", tags=["Personel"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ============================================================
# PERSONEL LİSTESİ
# ============================================================

@router.get("")
async def list_personnel(
    branch_id   : int            = Query(1),
    role        : Optional[str]  = Query(None),
    active      : Optional[bool] = Query(None),
    search      : Optional[str]  = Query(None),
    page        : int            = Query(1, ge=1),
    per_page    : int            = Query(50, ge=1, le=100),
    db          : Session        = Depends(get_db),
    current_user: Personnel      = Depends(require_role("admin")),
):
    """Personel listesi — rol ve aktiflik filtresi desteklenir."""
    sorgu = db.query(Personnel).filter(Personnel.branch_id == branch_id)

    if role:
        sorgu = sorgu.filter(Personnel.role == role)
    if active is not None:
        sorgu = sorgu.filter(Personnel.active == active)
    if search:
        sorgu = sorgu.filter(Personnel.name.ilike(f"%{search}%"))

    toplam = sorgu.count()
    items  = (
        sorgu
        .order_by(Personnel.name)
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "total"   : toplam,
        "page"    : page,
        "per_page": per_page,
        "items"   : [PersonnelResponse.model_validate(p) for p in items],
    }


# ============================================================
# PERSONEL DETAY
# ============================================================

@router.get("/{personnel_id}", response_model=PersonnelResponse)
async def get_personnel(
    personnel_id: int,
    db          : Session   = Depends(get_db),
    current_user: Personnel = Depends(require_role("admin")),
):
    """Tek personel detayı."""
    personel = db.query(Personnel).filter(Personnel.id == personnel_id).first()
    if not personel:
        raise HTTPException(status_code=404, detail="Personel bulunamadı.")
    return personel


# ============================================================
# PERSONEL OLUŞTUR
# ============================================================

@router.post("", response_model=PersonnelResponse, status_code=201)
async def create_personnel(
    request     : Request,
    data        : PersonnelCreate,
    db          : Session   = Depends(get_db),
    current_user: Personnel = Depends(require_role("admin")),
):
    """
    Yeni personel oluşturur.
    - Admin: email + şifre gerekli
    - Kasiyer / Depocu: PIN gerekli (6 haneli)
    """
    # E-posta benzersizliği kontrolü
    if data.email:
        mevcut = db.query(Personnel).filter(Personnel.email == data.email).first()
        if mevcut:
            raise HTTPException(
                status_code=400,
                detail="Bu e-posta adresi zaten kayıtlı.",
            )

    # Rol gereksinimleri
    if data.role == "admin" and not data.password:
        raise HTTPException(
            status_code=400,
            detail="Yönetici rolü için şifre zorunludur.",
        )
    if data.role in ("cashier", "warehouse") and not data.pin:
        raise HTTPException(
            status_code=400,
            detail="Kasiyer ve depocu rolü için PIN zorunludur.",
        )
    if data.pin and len(data.pin) != 6:
        raise HTTPException(
            status_code=400,
            detail="PIN tam olarak 6 haneli olmalıdır.",
        )

    personel = Personnel(
        branch_id = data.branch_id,
        name      = data.name,
        role      = data.role,
        email     = data.email,
        active    = data.active,
        pin       = pwd_context.hash(data.pin)      if data.pin      else None,
        password  = pwd_context.hash(data.password) if data.password else None,
    )
    db.add(personel)
    db.commit()
    db.refresh(personel)

    audit_log.log_action(
        db          = db,
        action_type = "PERSONNEL_CREATE",
        user_id     = current_user.id,
        table_name  = "personnel",
        record_id   = personel.id,
        new_value   = {"name": personel.name, "role": personel.role},
        ip_address  = request.client.host if request.client else None,
        branch_id   = data.branch_id,
    )

    return personel


# ============================================================
# PERSONEL GÜNCELLE
# ============================================================

@router.patch("/{personnel_id}", response_model=PersonnelResponse)
async def update_personnel(
    personnel_id: int,
    request     : Request,
    data        : PersonnelCreate,
    db          : Session   = Depends(get_db),
    current_user: Personnel = Depends(require_role("admin")),
):
    """Personel bilgilerini günceller. PIN ve şifre alanları opsiyonel."""
    personel = db.query(Personnel).filter(Personnel.id == personnel_id).first()
    if not personel:
        raise HTTPException(status_code=404, detail="Personel bulunamadı.")

    eski_deger = {"name": personel.name, "role": personel.role, "active": personel.active}

    # E-posta değişiyorsa benzersizlik kontrolü
    if data.email and data.email != personel.email:
        mevcut = db.query(Personnel).filter(
            Personnel.email == data.email,
            Personnel.id    != personnel_id,
        ).first()
        if mevcut:
            raise HTTPException(status_code=400, detail="Bu e-posta zaten kullanılıyor.")

    personel.name   = data.name
    personel.role   = data.role
    personel.email  = data.email
    personel.active = data.active

    # Şifre / PIN değişimi opsiyonel
    if data.password:
        personel.password = pwd_context.hash(data.password)
    if data.pin:
        if len(data.pin) != 6:
            raise HTTPException(status_code=400, detail="PIN tam olarak 6 haneli olmalıdır.")
        personel.pin = pwd_context.hash(data.pin)

    db.commit()
    db.refresh(personel)

    audit_log.log_action(
        db          = db,
        action_type = "PERSONNEL_UPDATE",
        user_id     = current_user.id,
        table_name  = "personnel",
        record_id   = personel.id,
        old_value   = eski_deger,
        new_value   = {"name": personel.name, "role": personel.role, "active": personel.active},
        ip_address  = request.client.host if request.client else None,
        branch_id   = personel.branch_id,
    )

    return personel


# ============================================================
# AKTİFLİK DEĞİŞTİR
# ============================================================

@router.patch("/{personnel_id}/toggle-active")
async def toggle_active(
    personnel_id: int,
    request     : Request,
    db          : Session   = Depends(get_db),
    current_user: Personnel = Depends(require_role("admin")),
):
    """Personeli aktif/pasif yapar. Kendini pasif yapamaz."""
    if personnel_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Kendi hesabınızı pasif yapamazsınız.",
        )

    personel = db.query(Personnel).filter(Personnel.id == personnel_id).first()
    if not personel:
        raise HTTPException(status_code=404, detail="Personel bulunamadı.")

    eski = personel.active
    personel.active = not personel.active
    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "PERSONNEL_TOGGLE",
        user_id     = current_user.id,
        table_name  = "personnel",
        record_id   = personel.id,
        old_value   = {"active": eski},
        new_value   = {"active": personel.active},
        ip_address  = request.client.host if request.client else None,
        branch_id   = personel.branch_id,
    )

    durum = "aktif" if personel.active else "pasif"
    return {
        "success": True,
        "message": f"{personel.name} {durum} yapıldı.",
        "active" : personel.active,
    }


# ============================================================
# PIN SIFIRLA (Admin tarafından)
# ============================================================

@router.post("/{personnel_id}/reset-pin")
async def reset_pin(
    personnel_id: int,
    request     : Request,
    yeni_pin    : str,
    db          : Session   = Depends(get_db),
    current_user: Personnel = Depends(require_role("admin")),
):
    """Kasiyer / depocu PIN'ini sıfırlar."""
    if len(yeni_pin) != 6 or not yeni_pin.isdigit():
        raise HTTPException(
            status_code=400,
            detail="PIN tam olarak 6 haneli rakam olmalıdır.",
        )

    personel = db.query(Personnel).filter(Personnel.id == personnel_id).first()
    if not personel:
        raise HTTPException(status_code=404, detail="Personel bulunamadı.")

    personel.pin = pwd_context.hash(yeni_pin)
    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "PIN_RESET",
        user_id     = current_user.id,
        table_name  = "personnel",
        record_id   = personel.id,
        new_value   = {"aciklama": "PIN sıfırlandı"},
        ip_address  = request.client.host if request.client else None,
        branch_id   = personel.branch_id,
    )

    return {"success": True, "message": f"{personel.name} PIN'i başarıyla sıfırlandı."}


# ============================================================
# PERSONEL SİL (Soft delete — sadece aktif değilse silinir)
# ============================================================

@router.delete("/{personnel_id}")
async def delete_personnel(
    personnel_id: int,
    request     : Request,
    db          : Session   = Depends(get_db),
    current_user: Personnel = Depends(require_role("admin")),
):
    """
    Personeli siler (soft delete).
    Kendini silemez. Aktif personel silinemez — önce pasif yapın.
    """
    if personnel_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Kendi hesabınızı silemezsiniz.",
        )

    personel = db.query(Personnel).filter(Personnel.id == personnel_id).first()
    if not personel:
        raise HTTPException(status_code=404, detail="Personel bulunamadı.")

    if personel.active:
        raise HTTPException(
            status_code=400,
            detail="Aktif personel silinemez. Önce pasif yapın.",
        )

    # Soft delete — gerçekte sil değil, adı değiştir
    from datetime import datetime, timezone
    personel.name  = f"[SİLİNDİ] {personel.name}"
    personel.email = None
    personel.pin   = None

    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "PERSONNEL_DELETE",
        user_id     = current_user.id,
        table_name  = "personnel",
        record_id   = personnel_id,
        old_value   = {"name": personel.name},
        ip_address  = request.client.host if request.client else None,
        branch_id   = personel.branch_id,
    )

    return {"success": True, "message": "Personel silindi."}
