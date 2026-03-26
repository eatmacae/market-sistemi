"""
Market Yönetim Sistemi — SQLAlchemy Modelleri
Tüm tablolar burada tanımlanır. Her tabloda branch_id mevcuttur.
Soft delete: is_deleted + deleted_at — gerçek silme YASAK
"""

from sqlalchemy import (
    Column, Integer, BigInteger, String, Text, Boolean,
    Numeric, Date, DateTime, ForeignKey, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


# ============================================================
# ŞUBELER
# ============================================================

class Branch(Base):
    """Şubeler tablosu — çok şubeli mod için"""
    __tablename__ = "branches"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(100), nullable=False)
    address    = Column(Text)
    phone      = Column(String(20))
    active     = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ============================================================
# KATEGORİLER
# ============================================================

class Category(Base):
    """Ürün kategorileri"""
    __tablename__ = "categories"

    id         = Column(Integer, primary_key=True, index=True)
    branch_id  = Column(Integer, ForeignKey("branches.id"), default=1)
    name       = Column(String(100), nullable=False)
    parent_id  = Column(Integer, ForeignKey("categories.id"), nullable=True)  # Alt kategori
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # İlişkiler
    products   = relationship("Product", back_populates="category")
    children   = relationship("Category", backref="parent", remote_side=[id])


# ============================================================
# PERSONEL
# ============================================================

class Personnel(Base):
    """
    Personel tablosu — admin, cashier (kasiyer), warehouse (depo) rolleri
    PIN: 6 haneli kasa girişi için, bcrypt ile hash'lenir
    """
    __tablename__ = "personnel"

    id         = Column(Integer, primary_key=True, index=True)
    branch_id  = Column(Integer, ForeignKey("branches.id"), default=1)
    name       = Column(String(100), nullable=False)
    role       = Column(String(20), nullable=False)   # admin | cashier | warehouse
    pin        = Column(String(200))                  # Kasa PIN'i (bcrypt hash — min 60 karakter)
    email      = Column(String(100), unique=True, nullable=True)
    password   = Column(String(200))                  # Yönetici şifresi (bcrypt)
    active     = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ============================================================
# ÜRÜNLER
# ============================================================

class Product(Base):
    """
    Ürünler tablosu
    Soft delete: is_deleted=True yapılır, gerçekten silinmez
    """
    __tablename__ = "products"

    id             = Column(Integer, primary_key=True, index=True)
    branch_id      = Column(Integer, ForeignKey("branches.id"), default=1)
    name           = Column(String(200), nullable=False, index=True)
    barcode        = Column(String(50), unique=True, nullable=True, index=True)
    category_id    = Column(Integer, ForeignKey("categories.id"), nullable=True)
    unit           = Column(String(20), default="adet")       # adet, kg, lt, gr
    units_per_case = Column(Integer, default=1)               # Koli başına adet (1 = koli yok)
    price          = Column(Numeric(10, 2), nullable=False)   # Perakende fiyat
    price_wholesale= Column(Numeric(10, 2))                   # Toptan fiyat
    price_credit   = Column(Numeric(10, 2))                   # Veresiye fiyat
    price_staff    = Column(Numeric(10, 2))                   # Personel fiyat
    cost           = Column(Numeric(10, 2))                   # Alış maliyeti
    margin_percent = Column(Numeric(5, 2), default=20)        # Kar marjı %
    stock_qty      = Column(Integer, default=0)               # Güncel stok
    min_stock      = Column(Integer, default=5)               # Minimum stok eşiği
    max_stock      = Column(Integer, nullable=True)           # Maksimum stok
    vat_rate       = Column(Integer, default=1)               # KDV oranı: 1, 10, 20
    shelf_location = Column(String(50))                       # Raf yeri (A3, B12 vb.)
    supplier_code  = Column(String(100), nullable=True)       # Tedarikçinin ürün kodu (scraper eşleşme için)
    expiry_date    = Column(Date, nullable=True)              # Son kullanma tarihi
    image_url      = Column(Text, nullable=True)              # Ürün fotoğrafı yolu
    is_deleted     = Column(Boolean, default=False)           # Soft delete
    deleted_at     = Column(DateTime(timezone=True), nullable=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())
    updated_at     = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # İlişkiler
    category       = relationship("Category", back_populates="products")
    stock_movements= relationship("StockMovement", back_populates="product")
    sale_items     = relationship("SaleItem", back_populates="product")


# ============================================================
# STOK HAREKETLERİ
# ============================================================

class StockMovement(Base):
    """
    Her stok değişikliği burada loglanır (satış, alım, sayım, fire, transfer)
    Stok tarihçesi bu tablodan izlenir
    """
    __tablename__ = "stock_movements"

    id         = Column(Integer, primary_key=True, index=True)
    branch_id  = Column(Integer, ForeignKey("branches.id"), default=1)
    product_id = Column(Integer, ForeignKey("products.id"))
    type       = Column(String(20))   # sale | purchase | adjust | waste | transfer
    qty_before = Column(Integer)
    qty_change = Column(Integer)      # Pozitif: giriş, Negatif: çıkış
    qty_after  = Column(Integer)
    note       = Column(Text)
    user_id    = Column(Integer, ForeignKey("personnel.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # İlişkiler
    product    = relationship("Product", back_populates="stock_movements")


# ============================================================
# MÜŞTERİLER
# ============================================================

class Customer(Base):
    """Müşteriler — veresiye bakiyesi ve sadakat puanı takibi"""
    __tablename__ = "customers"

    id             = Column(Integer, primary_key=True, index=True)
    branch_id      = Column(Integer, ForeignKey("branches.id"), default=1)
    name           = Column(String(100), nullable=False)
    phone          = Column(String(20), unique=True, nullable=True, index=True)
    address        = Column(Text)
    credit_limit   = Column(Numeric(10, 2), default=0)    # Veresiye limiti
    credit_balance = Column(Numeric(10, 2), default=0)    # Mevcut veresiye bakiyesi
    loyalty_points = Column(Integer, default=0)            # Sadakat puanı
    birth_date     = Column(Date, nullable=True)
    price_type     = Column(String(20), default="retail")  # retail | wholesale | credit | staff
    is_deleted     = Column(Boolean, default=False)        # Soft delete
    deleted_at     = Column(DateTime(timezone=True), nullable=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())

    # İlişkiler
    sales          = relationship("Sale", back_populates="customer")


# ============================================================
# TEDARİKÇİLER
# ============================================================

class Supplier(Base):
    """Tedarikçiler — fatura entegrasyonu için"""
    __tablename__ = "suppliers"

    id              = Column(Integer, primary_key=True, index=True)
    branch_id       = Column(Integer, ForeignKey("branches.id"), default=1)
    name            = Column(String(100), nullable=False)
    address         = Column(Text)
    phone           = Column(String(20))
    email           = Column(String(100))
    tax_no          = Column(String(20))        # Vergi numarası
    scraper_url     = Column(String(500))       # Fiyat takip URL'i
    scraper_user    = Column(String(100))       # Giriş kullanıcı adı
    scraper_pass_enc= Column(Text)              # AES-256 şifreli şifre
    scraping_active = Column(Boolean, default=False)  # Bu tedarikçi takip ediliyor mu?
    is_deleted      = Column(Boolean, default=False)
    deleted_at      = Column(DateTime(timezone=True), nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())


# ============================================================
# VARDİYALAR (KASA OTURUMLARI)
# ============================================================

class Session(Base):
    """
    Kasiyer vardiyası — açılış/kapanış kasası takibi
    Açık oturum olmadan satış yapılamaz
    """
    __tablename__ = "sessions"

    id             = Column(Integer, primary_key=True, index=True)
    branch_id      = Column(Integer, ForeignKey("branches.id"), default=1)
    cashier_id     = Column(Integer, ForeignKey("personnel.id"))
    opening_amount = Column(Numeric(10, 2))   # Açılış kasası
    closing_amount = Column(Numeric(10, 2))   # Kapanış kasası
    opened_at      = Column(DateTime(timezone=True), server_default=func.now())
    closed_at      = Column(DateTime(timezone=True), nullable=True)

    # İlişkiler
    sales          = relationship("Sale", back_populates="session")


# ============================================================
# KAMPANYALAR
# ============================================================

class Campaign(Base):
    """Kampanyalar — yüzde indirim, sabit indirim, X al Y öde"""
    __tablename__ = "campaigns"

    id         = Column(Integer, primary_key=True, index=True)
    branch_id  = Column(Integer, ForeignKey("branches.id"), default=1)
    name       = Column(String(100))
    type       = Column(String(30))        # percent | fixed | buy_x_get_y
    value      = Column(Numeric(10, 2))    # İndirim değeri
    min_qty    = Column(Integer, default=1)
    free_qty   = Column(Integer, default=0)  # X al Y öde için bedava adet
    start_date = Column(Date)
    end_date   = Column(Date)
    active     = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)


# ============================================================
# SATIŞLAR
# ============================================================

class Sale(Base):
    """
    Satış başlığı — her satış için tek kayıt
    Detaylar SaleItem tablosunda
    """
    __tablename__ = "sales"

    id           = Column(Integer, primary_key=True, index=True)
    branch_id    = Column(Integer, ForeignKey("branches.id"), default=1)
    customer_id  = Column(Integer, ForeignKey("customers.id"), nullable=True)
    cashier_id   = Column(Integer, ForeignKey("personnel.id"))
    session_id   = Column(Integer, ForeignKey("sessions.id"))
    total        = Column(Numeric(10, 2))
    discount     = Column(Numeric(10, 2), default=0)
    vat_amount   = Column(Numeric(10, 2))
    payment_type = Column(String(20))       # cash | card | mixed
    cash_given   = Column(Numeric(10, 2))
    change_given = Column(Numeric(10, 2))
    status       = Column(String(20), default="completed")  # completed | cancelled | refunded
    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    # İlişkiler
    customer     = relationship("Customer", back_populates="sales")
    session      = relationship("Session", back_populates="sales")
    items        = relationship("SaleItem", back_populates="sale")


class SaleItem(Base):
    """Satış kalemleri — her satıştaki ürünler"""
    __tablename__ = "sale_items"

    id          = Column(Integer, primary_key=True, index=True)
    branch_id   = Column(Integer, ForeignKey("branches.id"), default=1)  # Çok şubeli yapıya hazır
    sale_id     = Column(Integer, ForeignKey("sales.id"))
    product_id  = Column(Integer, ForeignKey("products.id"))
    qty         = Column(Numeric(10, 3))      # Ondalıklı: kg için
    unit_price  = Column(Numeric(10, 2))
    discount    = Column(Numeric(10, 2), default=0)
    total       = Column(Numeric(10, 2))
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=True)

    # İlişkiler
    sale        = relationship("Sale", back_populates="items")
    product     = relationship("Product", back_populates="sale_items")


# ============================================================
# FATURALAR
# ============================================================

class Invoice(Base):
    """
    Yüklenen tedarikçi faturaları
    PDF/Excel/Word dosyaları parse edilerek stok güncellenir
    Hatalı yükleme rollback için audit_log kullanılır
    """
    __tablename__ = "invoices"

    id          = Column(Integer, primary_key=True, index=True)
    branch_id   = Column(Integer, ForeignKey("branches.id"), default=1)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    file_name   = Column(String(200))
    file_type   = Column(String(10))   # pdf | xlsx | docx
    total       = Column(Numeric(10, 2))
    status      = Column(String(20), default="pending")  # pending | approved | rolled_back
    uploaded_by = Column(Integer, ForeignKey("personnel.id"))
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    approved_at = Column(DateTime(timezone=True), nullable=True)


# ============================================================
# ŞUBELER ARASI TRANSFER
# ============================================================

class Transfer(Base):
    """Şubeler arası stok transferi"""
    __tablename__ = "transfers"

    id             = Column(Integer, primary_key=True, index=True)
    from_branch_id = Column(Integer, ForeignKey("branches.id"))
    to_branch_id   = Column(Integer, ForeignKey("branches.id"))
    product_id     = Column(Integer, ForeignKey("products.id"))
    qty            = Column(Integer)
    status         = Column(String(20), default="pending")  # pending | approved | done
    note           = Column(Text)
    created_by     = Column(Integer, ForeignKey("personnel.id"))
    created_at     = Column(DateTime(timezone=True), server_default=func.now())


# ============================================================
# DENETİM İZİ (AUDIT LOG)
# ============================================================

class AuditLog(Base):
    """
    Her kritik işlem burada loglanır — silinmez, değiştirilemez
    Kaydı kim yaptı, ne değişti, hangi IP'den, ne zaman
    """
    __tablename__ = "audit_logs"

    id          = Column(BigInteger, primary_key=True, index=True)
    branch_id   = Column(Integer, ForeignKey("branches.id"), default=1)
    user_id     = Column(Integer, ForeignKey("personnel.id"), nullable=True)
    action_type = Column(String(50), nullable=False)   # CREATE | UPDATE | DELETE | LOGIN | SALE vb.
    table_name  = Column(String(50))
    record_id   = Column(Integer, nullable=True)
    old_value   = Column(JSON, nullable=True)          # Değişmeden önceki değer
    new_value   = Column(JSON, nullable=True)          # Değişmeden sonraki değer
    ip_address  = Column(String(45))
    note        = Column(Text)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())


# ============================================================
# LİSANSLAR (Yazılım satışı için)
# ============================================================

class License(Base):
    """Müşteri lisansları — starter, pro, chain, lifetime paketler"""
    __tablename__ = "licenses"

    id            = Column(Integer, primary_key=True, index=True)
    branch_id     = Column(Integer, ForeignKey("branches.id"), default=1)  # Çok şubeli yapıya hazır
    customer_name = Column(String(100))
    email         = Column(String(100))
    phone         = Column(String(20))
    license_key   = Column(String(50), unique=True, index=True)  # MYS-YYYY-XXXX-...
    package       = Column(String(20))     # starter | pro | chain | lifetime
    branch_limit  = Column(Integer, default=1)
    device_limit  = Column(Integer, default=2)
    start_date    = Column(Date)
    end_date      = Column(Date)
    status        = Column(String(20), default="active")  # active | expired | suspended
    created_at    = Column(DateTime(timezone=True), server_default=func.now())


# ============================================================
# SATIŞ HEDEFLERİ
# ============================================================

class SalesTarget(Base):
    """
    Günlük / haftalık / aylık satış hedefleri
    Her dönem için tek kayıt — upsert mantığıyla çalışır
    """
    __tablename__ = "sales_targets"

    id           = Column(Integer, primary_key=True, index=True)
    branch_id    = Column(Integer, ForeignKey("branches.id"), default=1)
    type         = Column(String(10), nullable=False)   # daily | weekly | monthly
    target_amount= Column(Numeric(12, 2), nullable=False)
    period_start = Column(Date, nullable=False)         # Dönemin başlangıç tarihi
    note         = Column(String(200), nullable=True)
    created_by   = Column(Integer, ForeignKey("personnel.id"), nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    updated_at   = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ============================================================
# SİSTEM AYARLARI (key-value deposu)
# ============================================================

class SystemSetting(Base):
    """
    Sistem ayarları — anahtar/değer deposu.
    Her şube kendi ayarlarını saklar (branch_id ile).
    Şifreli değerler (SMTP, terazi) AES-256 ile saklanır.
    """
    __tablename__ = "system_settings"

    id         = Column(Integer, primary_key=True, index=True)
    branch_id  = Column(Integer, ForeignKey("branches.id"), default=1)
    key        = Column(String(100), nullable=False)    # ayar anahtarı
    value      = Column(Text, nullable=True)            # düz metin değer
    value_enc  = Column(Text, nullable=True)            # AES-256 ile şifreli değer (şifreler için)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ============================================================
# TEDARİKÇİ FİYAT TAKİP KAYITLARI
# ============================================================

class SupplierPriceLog(Base):
    """
    Scraper'ın bulduğu tedarikçi fiyat değişimleri.
    Hangi ürünün fiyatı ne zaman değişti — geçmiş tutuluyor.
    """
    __tablename__ = "supplier_price_logs"

    id             = Column(Integer, primary_key=True, index=True)
    branch_id      = Column(Integer, ForeignKey("branches.id"), default=1)
    supplier_id    = Column(Integer, ForeignKey("suppliers.id"))
    product_code   = Column(String(100))    # Tedarikçinin ürün kodu
    product_name   = Column(String(200))
    old_price      = Column(Numeric(10, 2), nullable=True)
    new_price      = Column(Numeric(10, 2))
    change_percent = Column(Numeric(6, 2), nullable=True)  # % değişim
    detected_at    = Column(DateTime(timezone=True), server_default=func.now())
    notified       = Column(Boolean, default=False)  # Mail gönderildi mi?


# ============================================================
# İDEMPOTENCY ANAHTARLARI
# ============================================================

class IdempotencyKey(Base):
    """
    Offline sync güvenliği: aynı işlem iki kez işlenmesin.
    Tablet şarj bitip yeniden bağlandığında duplicate önler.
    """
    __tablename__ = "idempotency_keys"

    id           = Column(Integer, primary_key=True, index=True)
    operation_id = Column(String(36), unique=True, nullable=False, index=True)  # UUID
    endpoint     = Column(String(200), nullable=False)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
