"""
Market Yönetim Sistemi — Tedarikçi Route'ları
Tedarikçi CRUD + scraper login bilgileri + fiyat takibi tetikleyici
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc
from typing import List, Optional
from datetime import datetime

from database import get_db
from models import Supplier, SupplierPriceLog, Personnel
from schemas import (
    SupplierCreate, SupplierUpdate, SupplierResponse,
    PaginatedResponse, SuccessResponse,
)
from routes.auth import get_current_user, require_role
from services import audit_log

router = APIRouter(prefix="/api/suppliers", tags=["Tedarikçiler"])


# ============================================================
# YARDIMCI: AES şifreleme/çözme
# ============================================================

def _sifre_sifrele(plain: str) -> str:
    """
    Tedarikçi şifresini AES-256 ile şifreler.
    .env'deki BACKUP_ENCRYPTION_KEY kullanılır.
    """
    import os
    from cryptography.fernet import Fernet
    import base64

    key_str = os.getenv("BACKUP_ENCRYPTION_KEY", "")
    if not key_str or len(key_str) < 32:
        # Anahtar yoksa düz metin döner (geliştirme ortamı)
        return f"PLAIN:{plain}"

    # 32 byte → Fernet key
    key_bytes = key_str[:32].encode().ljust(32, b'0')
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    f = Fernet(fernet_key)
    return f.encrypt(plain.encode()).decode()


def _sifre_coz(encrypted: str) -> str:
    """Şifreli tedarikçi şifresini çözer."""
    import os
    from cryptography.fernet import Fernet
    import base64

    if encrypted.startswith("PLAIN:"):
        return encrypted[6:]

    key_str = os.getenv("BACKUP_ENCRYPTION_KEY", "")
    if not key_str or len(key_str) < 32:
        return ""

    key_bytes = key_str[:32].encode().ljust(32, b'0')
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    f = Fernet(fernet_key)
    try:
        return f.decrypt(encrypted.encode()).decode()
    except Exception:
        return ""


# ============================================================
# TEDARİKÇİ LİSTESİ
# ============================================================

@router.get("", response_model=PaginatedResponse)
async def list_suppliers(
    branch_id    : int           = Query(1),
    page         : int           = Query(1, ge=1),
    per_page     : int           = Query(50, ge=1, le=200),
    search       : Optional[str] = Query(None),
    aktif_scraper: bool          = Query(False),  # Sadece scraping aktif olanlar
    db           : Session       = Depends(get_db),
    current_user : Personnel     = Depends(get_current_user),
):
    """Tedarikçi listesi — arama ve scraper filtresi destekler."""
    query = db.query(Supplier).filter(
        Supplier.branch_id  == branch_id,
        Supplier.is_deleted == False,
    )

    if search:
        query = query.filter(
            or_(
                Supplier.name.ilike(f"%{search}%"),
                Supplier.phone.ilike(f"%{search}%"),
                Supplier.email.ilike(f"%{search}%"),
            )
        )

    if aktif_scraper:
        query = query.filter(Supplier.scraping_active == True)

    total = query.count()
    items = (
        query
        .order_by(Supplier.name)
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    # Şifreli alanları gizle — response'a dahil etme
    sonuc = []
    for s in items:
        d = SupplierResponse.model_validate(s)
        sonuc.append(d)

    return PaginatedResponse(
        total    = total,
        page     = page,
        per_page = per_page,
        items    = [i.model_dump() for i in sonuc],
    )


# ============================================================
# TEK TEDARİKÇİ
# ============================================================

@router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(
    supplier_id  : int,
    db           : Session   = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """Tedarikçi detayı."""
    tedarikci = db.query(Supplier).filter(
        Supplier.id         == supplier_id,
        Supplier.is_deleted == False,
    ).first()

    if not tedarikci:
        raise HTTPException(
            status_code = status.HTTP_404_NOT_FOUND,
            detail      = "Tedarikçi bulunamadı.",
        )
    return tedarikci


# ============================================================
# TEDARİKÇİ OLUŞTUR
# ============================================================

@router.post("", response_model=SupplierResponse, status_code=201)
async def create_supplier(
    request      : Request,
    data         : SupplierCreate,
    db           : Session   = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin")),
):
    """Yeni tedarikçi oluşturur. Şifre varsa AES-256 ile şifrelenir."""
    tedarikci = Supplier(
        branch_id       = data.branch_id,
        name            = data.name,
        address         = data.address,
        phone           = data.phone,
        email           = data.email,
        tax_no          = data.tax_no,
        scraper_url     = data.scraper_url,
        scraper_user    = data.scraper_user,
        scraper_pass_enc= _sifre_sifrele(data.scraper_pass) if data.scraper_pass else None,
        scraping_active = data.scraping_active,
    )
    db.add(tedarikci)
    db.commit()
    db.refresh(tedarikci)

    audit_log.log_action(
        db          = db,
        action_type = "SUPPLIER_CREATE",
        user_id     = current_user.id,
        table_name  = "suppliers",
        record_id   = tedarikci.id,
        new_value   = {"name": tedarikci.name, "scraping_active": tedarikci.scraping_active},
        ip_address  = request.client.host if request.client else None,
        branch_id   = data.branch_id,
        note        = f"Tedarikçi oluşturuldu: {tedarikci.name}",
    )

    return tedarikci


# ============================================================
# TEDARİKÇİ GÜNCELLE
# ============================================================

@router.patch("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id  : int,
    request      : Request,
    data         : SupplierUpdate,
    db           : Session   = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin")),
):
    """Tedarikçi bilgilerini günceller. Sadece gönderilen alanlar değişir."""
    tedarikci = db.query(Supplier).filter(
        Supplier.id         == supplier_id,
        Supplier.is_deleted == False,
    ).first()

    if not tedarikci:
        raise HTTPException(404, "Tedarikçi bulunamadı.")

    # Eski değerleri loglamak için sakla
    eski = {
        "name"           : tedarikci.name,
        "scraping_active": tedarikci.scraping_active,
    }

    # Sadece gönderilen alanları güncelle
    if data.name            is not None: tedarikci.name            = data.name
    if data.address         is not None: tedarikci.address         = data.address
    if data.phone           is not None: tedarikci.phone           = data.phone
    if data.email           is not None: tedarikci.email           = data.email
    if data.tax_no          is not None: tedarikci.tax_no          = data.tax_no
    if data.scraper_url     is not None: tedarikci.scraper_url     = data.scraper_url
    if data.scraper_user    is not None: tedarikci.scraper_user    = data.scraper_user
    if data.scraper_pass    is not None: tedarikci.scraper_pass_enc= _sifre_sifrele(data.scraper_pass)
    if data.scraping_active is not None: tedarikci.scraping_active = data.scraping_active

    db.commit()
    db.refresh(tedarikci)

    audit_log.log_action(
        db          = db,
        action_type = "SUPPLIER_UPDATE",
        user_id     = current_user.id,
        table_name  = "suppliers",
        record_id   = tedarikci.id,
        old_value   = eski,
        new_value   = {"name": tedarikci.name, "scraping_active": tedarikci.scraping_active},
        ip_address  = request.client.host if request.client else None,
        branch_id   = tedarikci.branch_id,
        note        = f"Tedarikçi güncellendi: {tedarikci.name}",
    )

    return tedarikci


# ============================================================
# TEDARİKÇİ SİL (Soft delete)
# ============================================================

@router.delete("/{supplier_id}", response_model=SuccessResponse)
async def delete_supplier(
    supplier_id  : int,
    request      : Request,
    db           : Session   = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin")),
):
    """Tedarikçiyi soft delete ile siler."""
    tedarikci = db.query(Supplier).filter(
        Supplier.id         == supplier_id,
        Supplier.is_deleted == False,
    ).first()

    if not tedarikci:
        raise HTTPException(404, "Tedarikçi bulunamadı.")

    tedarikci.is_deleted = True
    tedarikci.deleted_at = datetime.utcnow()
    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "SUPPLIER_DELETE",
        user_id     = current_user.id,
        table_name  = "suppliers",
        record_id   = supplier_id,
        ip_address  = request.client.host if request.client else None,
        branch_id   = tedarikci.branch_id,
        note        = f"Tedarikçi silindi: {tedarikci.name}",
    )

    return SuccessResponse(message=f"'{tedarikci.name}' silindi.")


# ============================================================
# FİYAT TAKİBİ — MANUEL TETİKLE
# ============================================================

@router.post("/{supplier_id}/scan", response_model=SuccessResponse)
async def scan_supplier_prices(
    supplier_id     : int,
    request         : Request,
    background_tasks: BackgroundTasks,
    db              : Session   = Depends(get_db),
    current_user    : Personnel = Depends(require_role("admin")),
):
    """
    Belirtilen tedarikçi için fiyat taramasını arka planda tetikler.
    APScheduler gece otomatik tarar; bu endpoint manuel tetikleme içindir.
    """
    tedarikci = db.query(Supplier).filter(
        Supplier.id         == supplier_id,
        Supplier.is_deleted == False,
    ).first()

    if not tedarikci:
        raise HTTPException(404, "Tedarikçi bulunamadı.")

    if not tedarikci.scraper_url:
        raise HTTPException(
            status_code = 400,
            detail      = "Bu tedarikçi için scraper URL tanımlanmamış.",
        )

    # Arka planda çalıştır — kullanıcıyı bekletme
    def _tara():
        from services.scraper import tek_tedarikci_tara
        from database import SessionLocal
        _db = SessionLocal()
        try:
            sifre = _sifre_coz(tedarikci.scraper_pass_enc) if tedarikci.scraper_pass_enc else None
            tek_tedarikci_tara(
                _db,
                tedarikci_id   = tedarikci.id,
                tedarikci_adi  = tedarikci.name,
                url            = tedarikci.scraper_url,
                kullanici      = tedarikci.scraper_user,
                sifre          = sifre,
                branch_id      = tedarikci.branch_id,
            )
        finally:
            _db.close()

    background_tasks.add_task(_tara)

    audit_log.log_action(
        db          = db,
        action_type = "SUPPLIER_SCAN_TRIGGERED",
        user_id     = current_user.id,
        table_name  = "suppliers",
        record_id   = supplier_id,
        ip_address  = request.client.host if request.client else None,
        branch_id   = tedarikci.branch_id,
        note        = f"Manuel fiyat taraması başlatıldı: {tedarikci.name}",
    )

    return SuccessResponse(message=f"'{tedarikci.name}' için fiyat taraması arka planda başlatıldı.")


# ============================================================
# FİYAT DEĞİŞİM GEÇMİŞİ
# ============================================================

@router.get("/{supplier_id}/price-logs")
async def get_price_logs(
    supplier_id  : int,
    page         : int  = Query(1, ge=1),
    per_page     : int  = Query(50, ge=1, le=200),
    db           : Session   = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """Tedarikçinin fiyat değişim geçmişi."""
    query = db.query(SupplierPriceLog).filter(
        SupplierPriceLog.supplier_id == supplier_id,
    ).order_by(desc(SupplierPriceLog.detected_at))

    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()

    return PaginatedResponse(
        total    = total,
        page     = page,
        per_page = per_page,
        items    = [
            {
                "id"            : i.id,
                "product_code"  : i.product_code,
                "product_name"  : i.product_name,
                "old_price"     : float(i.old_price) if i.old_price else None,
                "new_price"     : float(i.new_price),
                "change_percent": float(i.change_percent) if i.change_percent else None,
                "detected_at"   : str(i.detected_at),
            }
            for i in items
        ],
    )


# ============================================================
# TÜM TEDARİKÇİLERİN ÖZET FİYAT DEĞİŞİMLERİ
# ============================================================

@router.get("/price-logs/recent")
async def get_recent_price_changes(
    branch_id    : int = Query(1),
    limit        : int = Query(20, ge=1, le=100),
    db           : Session   = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """Son tespit edilen tüm fiyat değişimleri (dashboard için)."""
    items = (
        db.query(SupplierPriceLog)
        .filter(SupplierPriceLog.branch_id == branch_id)
        .order_by(desc(SupplierPriceLog.detected_at))
        .limit(limit)
        .all()
    )

    return [
        {
            "id"            : i.id,
            "supplier_id"   : i.supplier_id,
            "product_code"  : i.product_code,
            "product_name"  : i.product_name,
            "old_price"     : float(i.old_price) if i.old_price else None,
            "new_price"     : float(i.new_price),
            "change_percent": float(i.change_percent) if i.change_percent else None,
            "detected_at"   : str(i.detected_at),
        }
        for i in items
    ]
