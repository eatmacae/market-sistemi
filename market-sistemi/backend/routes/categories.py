"""
Market Yönetim Sistemi — Kategori Route'ları
Ürün kategorileri ve alt kategori yönetimi
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List, Optional

from database import get_db
from models import Category, Product
from schemas import CategoryCreate, CategoryResponse
from routes.auth import get_current_user, require_role
from services import audit_log
from models import Personnel

router = APIRouter(prefix="/api/categories", tags=["Kategoriler"])


# ============================================================
# KATEGORİ LİSTESİ
# ============================================================

@router.get("", response_model=List[CategoryResponse])
async def list_categories(
    branch_id    : int = 1,
    parent_id    : Optional[int] = None,   # None → kök kategoriler, int → alt kategoriler
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """
    Kategori listesini döner.
    parent_id verilmezse kök kategoriler, verilirse o kategorinin alt kategorileri gelir.
    """
    query = db.query(Category).filter(Category.branch_id == branch_id)

    if parent_id is None:
        query = query.filter(Category.parent_id == None)
    else:
        query = query.filter(Category.parent_id == parent_id)

    return query.order_by(Category.name).all()


@router.get("/all", response_model=List[CategoryResponse])
async def list_all_categories(
    branch_id    : int = 1,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """Tüm kategorileri (hiyerarşi olmadan) listeler — select box için"""
    return (
        db.query(Category)
        .filter(Category.branch_id == branch_id)
        .order_by(Category.name)
        .all()
    )


# ============================================================
# KATEGORİ DETAY
# ============================================================

@router.get("/{category_id}", response_model=CategoryResponse)
async def get_category(
    category_id  : int,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(
            status_code = status.HTTP_404_NOT_FOUND,
            detail      = "Kategori bulunamadı.",
        )
    return category


# ============================================================
# KATEGORİ OLUŞTUR
# ============================================================

@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    request      : Request,
    data         : CategoryCreate,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin")),
):
    """Yeni kategori oluşturur. Sadece admin yapabilir."""
    # Aynı şubede aynı isimde kategori var mı?
    existing = db.query(Category).filter(
        Category.branch_id == data.branch_id,
        Category.name      == data.name,
        Category.parent_id == data.parent_id,
    ).first()

    if existing:
        raise HTTPException(
            status_code = status.HTTP_400_BAD_REQUEST,
            detail      = f"'{data.name}' adında bir kategori zaten mevcut.",
        )

    category = Category(**data.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)

    # Audit log
    audit_log.log_action(
        db          = db,
        action_type = "CATEGORY_CREATE",
        user_id     = current_user.id,
        table_name  = "categories",
        record_id   = category.id,
        new_value   = {"name": category.name, "parent_id": category.parent_id},
        ip_address  = request.client.host if request.client else None,
        branch_id   = current_user.branch_id,
    )

    return category


# ============================================================
# KATEGORİ GÜNCELLE
# ============================================================

@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id  : int,
    request      : Request,
    data         : CategoryCreate,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin")),
):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Kategori bulunamadı.")

    old = {"name": category.name, "parent_id": category.parent_id}
    category.name      = data.name
    category.parent_id = data.parent_id
    db.commit()
    db.refresh(category)

    audit_log.log_action(
        db          = db,
        action_type = "CATEGORY_UPDATE",
        user_id     = current_user.id,
        table_name  = "categories",
        record_id   = category.id,
        old_value   = old,
        new_value   = {"name": category.name, "parent_id": category.parent_id},
        ip_address  = request.client.host if request.client else None,
        branch_id   = current_user.branch_id,
    )

    return category


# ============================================================
# KATEGORİ SİL (Soft değil, gerçek — ama ürün varsa izin verme)
# ============================================================

@router.delete("/{category_id}")
async def delete_category(
    category_id  : int,
    request      : Request,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin")),
):
    """
    Kategoriyi siler. Alt kategorisi veya ürünü varsa silmeye izin verilmez.
    """
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Kategori bulunamadı.")

    # Alt kategori var mı?
    alt_sayi = db.query(Category).filter(Category.parent_id == category_id).count()
    if alt_sayi > 0:
        raise HTTPException(
            status_code = 400,
            detail      = f"Bu kategorinin {alt_sayi} alt kategorisi var. Önce alt kategorileri silin.",
        )

    # Bu kategoride ürün var mı?
    urun_sayi = db.query(Product).filter(
        Product.category_id == category_id,
        Product.is_deleted  == False,
    ).count()
    if urun_sayi > 0:
        raise HTTPException(
            status_code = 400,
            detail      = f"Bu kategoride {urun_sayi} ürün var. Önce ürünleri başka kategoriye taşıyın.",
        )

    audit_log.log_action(
        db          = db,
        action_type = "CATEGORY_DELETE",
        user_id     = current_user.id,
        table_name  = "categories",
        record_id   = category.id,
        old_value   = {"name": category.name},
        ip_address  = request.client.host if request.client else None,
        branch_id   = current_user.branch_id,
    )

    db.delete(category)
    db.commit()

    return {"success": True, "message": f"'{category.name}' kategorisi silindi."}
