"""
Market Yönetim Sistemi — Pydantic Şemaları
API request/response doğrulama modelleri
"""

from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal
from enum import Enum


# ============================================================
# ENUM'LAR
# ============================================================

class UserRole(str, Enum):
    """Kullanıcı rolleri"""
    admin     = "admin"
    cashier   = "cashier"
    warehouse = "warehouse"


class PaymentType(str, Enum):
    """Ödeme türleri"""
    cash  = "cash"
    card  = "card"
    mixed = "mixed"


class SaleStatus(str, Enum):
    """Satış durumları"""
    completed = "completed"
    cancelled = "cancelled"
    refunded  = "refunded"


class StockMovementType(str, Enum):
    """Stok hareket türleri"""
    sale     = "sale"
    purchase = "purchase"
    adjust   = "adjust"
    waste    = "waste"
    transfer = "transfer"


class CampaignType(str, Enum):
    """Kampanya türleri"""
    percent    = "percent"
    fixed      = "fixed"
    buy_x_get_y = "buy_x_get_y"


# ============================================================
# TOKEN & AUTH
# ============================================================

class TokenResponse(BaseModel):
    """JWT token yanıtı"""
    access_token: str
    token_type:   str = "bearer"
    user_id:      int
    user_name:    str
    role:         str
    branch_id:    int


class LoginRequest(BaseModel):
    """Giriş isteği — email + şifre ile"""
    email:    EmailStr
    password: str


class PINLoginRequest(BaseModel):
    """Kasiyer PIN girişi"""
    pin:       str
    branch_id: int = 1


# ============================================================
# ŞUBELER
# ============================================================

class BranchBase(BaseModel):
    name:    str
    address: Optional[str] = None
    phone:   Optional[str] = None
    active:  bool = True


class BranchCreate(BranchBase):
    pass


class BranchResponse(BranchBase):
    id:         int
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# PERSONEL
# ============================================================

class PersonnelBase(BaseModel):
    name:      str
    role:      UserRole
    email:     Optional[EmailStr] = None
    branch_id: int = 1
    active:    bool = True


class PersonnelCreate(PersonnelBase):
    password: Optional[str] = None   # Yönetici için
    pin:      Optional[str] = None   # Kasiyer için


class PersonnelResponse(PersonnelBase):
    id:         int
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# KATEGORİLER
# ============================================================

class CategoryBase(BaseModel):
    name:      str
    parent_id: Optional[int] = None
    branch_id: int = 1


class CategoryCreate(CategoryBase):
    pass


class CategoryResponse(CategoryBase):
    id:         int
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# ÜRÜNLER
# ============================================================

class ProductBase(BaseModel):
    name:            str
    barcode:         Optional[str] = None
    category_id:     Optional[int] = None
    unit:            str = "adet"
    price:           Decimal
    price_wholesale: Optional[Decimal] = None
    price_credit:    Optional[Decimal] = None
    price_staff:     Optional[Decimal] = None
    cost:            Optional[Decimal] = None
    margin_percent:  Optional[Decimal] = None
    stock_qty:       int = 0
    min_stock:       int = 5
    max_stock:       Optional[int] = None
    vat_rate:        int = 1
    shelf_location:  Optional[str] = None
    expiry_date:     Optional[date] = None
    branch_id:       int = 1


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    """Kısmi güncelleme — sadece gönderilen alanlar güncellenir"""
    name:            Optional[str] = None
    barcode:         Optional[str] = None
    category_id:     Optional[int] = None
    price:           Optional[Decimal] = None
    price_wholesale: Optional[Decimal] = None
    cost:            Optional[Decimal] = None
    margin_percent:  Optional[Decimal] = None
    stock_qty:       Optional[int] = None
    min_stock:       Optional[int] = None
    vat_rate:        Optional[int] = None
    shelf_location:  Optional[str] = None
    expiry_date:     Optional[date] = None


class ProductResponse(ProductBase):
    id:         int
    image_url:  Optional[str] = None
    is_deleted: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# STOK HAREKETİ
# ============================================================

class StockMovementResponse(BaseModel):
    id:         int
    branch_id:  int
    product_id: int
    type:       str
    qty_before: int
    qty_change: int
    qty_after:  int
    note:       Optional[str] = None
    user_id:    Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# MÜŞTERİLER
# ============================================================

class CustomerBase(BaseModel):
    name:           str
    phone:          Optional[str] = None
    address:        Optional[str] = None
    credit_limit:   Decimal = Decimal("0")
    birth_date:     Optional[date] = None
    price_type:     str = "retail"
    branch_id:      int = 1


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    name:         Optional[str] = None
    phone:        Optional[str] = None
    address:      Optional[str] = None
    credit_limit: Optional[Decimal] = None
    price_type:   Optional[str] = None


class CustomerResponse(CustomerBase):
    id:             int
    credit_balance: Decimal
    loyalty_points: int
    is_deleted:     bool
    created_at:     datetime

    class Config:
        from_attributes = True


# ============================================================
# TEDARİKÇİLER
# ============================================================

class SupplierBase(BaseModel):
    name:            str
    address:         Optional[str] = None
    phone:           Optional[str] = None
    email:           Optional[EmailStr] = None
    tax_no:          Optional[str] = None
    scraper_url:     Optional[str] = None
    scraping_active: bool = False
    branch_id:       int = 1


class SupplierCreate(SupplierBase):
    scraper_user: Optional[str] = None
    scraper_pass: Optional[str] = None   # Düz gelir, backend'de şifrelenir


class SupplierUpdate(BaseModel):
    """Kısmi güncelleme"""
    name:            Optional[str] = None
    address:         Optional[str] = None
    phone:           Optional[str] = None
    email:           Optional[EmailStr] = None
    tax_no:          Optional[str] = None
    scraper_url:     Optional[str] = None
    scraper_user:    Optional[str] = None
    scraper_pass:    Optional[str] = None
    scraping_active: Optional[bool] = None


class SupplierResponse(SupplierBase):
    id:            int
    scraper_user:  Optional[str] = None
    is_deleted:    bool
    created_at:    datetime

    class Config:
        from_attributes = True


# ============================================================
# SİSTEM AYARLARI
# ============================================================

class SettingUpdate(BaseModel):
    """Tek ayar güncelleme"""
    key:       str
    value:     Optional[str] = None
    encrypted: bool = False   # True ise value AES ile şifrelenir


class SettingsBulkUpdate(BaseModel):
    """Toplu ayar güncelleme — form submit için"""
    settings:  List[SettingUpdate]
    branch_id: int = 1


class SettingResponse(BaseModel):
    key:        str
    value:      Optional[str] = None
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# SATIŞ
# ============================================================

class SaleItemCreate(BaseModel):
    product_id:  int
    qty:         Decimal
    unit_price:  Decimal
    discount:    Decimal = Decimal("0")
    campaign_id: Optional[int] = None


class SaleCreate(BaseModel):
    """Yeni satış oluşturma isteği"""
    customer_id:  Optional[int] = None
    session_id:   int
    items:        List[SaleItemCreate]
    payment_type: PaymentType
    cash_given:   Optional[Decimal] = None
    discount:     Decimal = Decimal("0")
    branch_id:    int = 1


class SaleItemResponse(BaseModel):
    id:          int
    product_id:  int
    qty:         Decimal
    unit_price:  Decimal
    discount:    Decimal
    total:       Decimal
    campaign_id: Optional[int] = None

    class Config:
        from_attributes = True


class SaleResponse(BaseModel):
    id:           int
    branch_id:    int
    customer_id:  Optional[int] = None
    cashier_id:   int
    session_id:   int
    total:        Decimal
    discount:     Decimal
    vat_amount:   Optional[Decimal] = None
    payment_type: str
    cash_given:   Optional[Decimal] = None
    change_given: Optional[Decimal] = None
    status:       str
    created_at:   datetime
    items:        List[SaleItemResponse] = []

    class Config:
        from_attributes = True


# ============================================================
# VARDİYA
# ============================================================

class SessionCreate(BaseModel):
    cashier_id:     int
    opening_amount: Decimal
    branch_id:      int = 1


class SessionClose(BaseModel):
    closing_amount: Decimal


class SessionResponse(BaseModel):
    id:             int
    branch_id:      int
    cashier_id:     int
    opening_amount: Decimal
    closing_amount: Optional[Decimal] = None
    opened_at:      datetime
    closed_at:      Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# AUDIT LOG
# ============================================================

class AuditLogResponse(BaseModel):
    id:          int
    branch_id:   int
    user_id:     Optional[int] = None
    action_type: str
    table_name:  Optional[str] = None
    record_id:   Optional[int] = None
    old_value:   Optional[dict] = None
    new_value:   Optional[dict] = None
    ip_address:  Optional[str] = None
    note:        Optional[str] = None
    created_at:  datetime

    class Config:
        from_attributes = True


# ============================================================
# GENEL YANIT SARMALAYICILARI
# ============================================================

class SuccessResponse(BaseModel):
    """Başarı yanıtı"""
    success: bool = True
    message: str


class ErrorResponse(BaseModel):
    """Hata yanıtı"""
    success: bool = False
    message: str
    detail:  Optional[str] = None


class PaginatedResponse(BaseModel):
    """Sayfalandırılmış liste yanıtı"""
    total:    int
    page:     int
    per_page: int
    items:    list
