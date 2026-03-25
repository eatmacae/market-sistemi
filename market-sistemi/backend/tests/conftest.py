"""
Market Yönetim Sistemi — Pytest Test Konfigürasyonu
Her test izole bir SQLite (in-memory) veritabanında çalışır.
PostgreSQL gerektirmez — CI/CD ortamında da çalışır.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Proje modülleri
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# lifespan'ın create_tables() çağırmasını engelle — PostgreSQL gerekmez
os.environ.setdefault("APP_ENV", "production")

from database import Base, get_db
from main import app
from models import Branch, Personnel, Category, Product
from routes.auth import hash_password, hash_pin, create_access_token
import unittest.mock

# ============================================================
# TEST VERİTABANI — SQLite in-memory
# ============================================================

TEST_DB_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DB_URL,
    connect_args = {"check_same_thread": False},
    poolclass    = StaticPool,   # Tüm bağlantılar aynı in-memory DB'yi paylaşır
)

TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    """get_db dependency'sini test DB ile override eder"""
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


# FastAPI dependency override
app.dependency_overrides[get_db] = override_get_db


# ============================================================
# FIXTURES
# ============================================================

@pytest.fixture(autouse=True)
def mock_audit_log():
    """
    audit_log.log_action → no-op
    SQLite, BigInteger PRIMARY KEY'i auto-increment etmez;
    Audit log testlerden bağımsız olduğu için mock edilir.
    """
    with unittest.mock.patch("services.audit_log.log_action"):
        yield


@pytest.fixture(scope="function")
def db():
    """
    Her test fonksiyonu için temiz bir DB oturumu sağlar.
    Test bittikten sonra tüm tablolar temizlenir.
    """
    # Tabloları oluştur
    Base.metadata.create_all(bind=test_engine)

    db = TestSessionLocal()
    yield db
    db.close()

    # Temizle — bir sonraki test için sıfır veri
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def client(db):
    """FastAPI TestClient — her test için izole DB"""
    with TestClient(app) as c:
        yield c


# ============================================================
# TEST VERİSİ FACTORY'LERİ
# ============================================================

@pytest.fixture
def test_branch(db) -> Branch:
    """Test şubesi oluşturur"""
    sube = Branch(name="Test Şubesi", address="Test Adres", active=True)
    db.add(sube)
    db.commit()
    db.refresh(sube)
    return sube


@pytest.fixture
def admin_user(db, test_branch) -> Personnel:
    """Admin yetkili test kullanıcısı"""
    user = Personnel(
        branch_id = test_branch.id,
        name      = "Test Admin",
        role      = "admin",
        email     = "admin@test.com",
        password  = hash_password("Sifre1234!"),
        pin       = hash_pin("123456"),
        active    = True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def cashier_user(db, test_branch) -> Personnel:
    """Kasiyer yetkili test kullanıcısı"""
    user = Personnel(
        branch_id = test_branch.id,
        name      = "Test Kasiyer",
        role      = "cashier",
        email     = "kasiyer@test.com",
        password  = hash_password("Sifre1234!"),
        pin       = hash_pin("654321"),
        active    = True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_token(admin_user) -> str:
    """Admin JWT token'ı"""
    return create_access_token({
        "sub"      : str(admin_user.id),
        "role"     : admin_user.role,
        "branch_id": admin_user.branch_id,
    })


@pytest.fixture
def cashier_token(cashier_user) -> str:
    """Kasiyer JWT token'ı"""
    return create_access_token({
        "sub"      : str(cashier_user.id),
        "role"     : cashier_user.role,
        "branch_id": cashier_user.branch_id,
    })


@pytest.fixture
def auth_headers(admin_token) -> dict:
    """Admin Authorization header'ı"""
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def cashier_headers(cashier_token) -> dict:
    """Kasiyer Authorization header'ı"""
    return {"Authorization": f"Bearer {cashier_token}"}


@pytest.fixture
def test_category(db, test_branch) -> Category:
    """Test kategorisi"""
    kat = Category(branch_id=test_branch.id, name="Test Kategori")
    db.add(kat)
    db.commit()
    db.refresh(kat)
    return kat


@pytest.fixture
def test_product(db, test_branch, test_category) -> Product:
    """Test ürünü — yeterli stok"""
    urun = Product(
        branch_id   = test_branch.id,
        name        = "Test Ürün",
        barcode     = "TEST001",
        category_id = test_category.id,
        unit        = "adet",
        price       = 10.00,
        cost        = 7.00,
        stock_qty   = 100,
        min_stock   = 5,
        vat_rate    = 18,
        is_deleted  = False,
    )
    db.add(urun)
    db.commit()
    db.refresh(urun)
    return urun


@pytest.fixture
def low_stock_product(db, test_branch) -> Product:
    """Kritik stok seviyesindeki ürün"""
    urun = Product(
        branch_id  = test_branch.id,
        name       = "Kritik Stok Ürün",
        barcode    = "KRITIK001",
        unit       = "adet",
        price      = 5.00,
        cost       = 3.00,
        stock_qty  = 2,
        min_stock  = 10,
        vat_rate   = 18,
        is_deleted = False,
    )
    db.add(urun)
    db.commit()
    db.refresh(urun)
    return urun


@pytest.fixture
def second_branch(db) -> Branch:
    """İzolasyon testleri için ikinci şube"""
    sube = Branch(name="Şube 2", active=True)
    db.add(sube)
    db.commit()
    db.refresh(sube)
    return sube


@pytest.fixture
def second_branch_product(db, second_branch) -> Product:
    """Şube 2'ye ait ürün — şube 1 görememelidir"""
    urun = Product(
        branch_id  = second_branch.id,
        name       = "Şube 2 Ürünü",
        barcode    = "SUBE2-001",
        unit       = "adet",
        price      = 20.00,
        stock_qty  = 50,
        min_stock  = 5,
        vat_rate   = 18,
        is_deleted = False,
    )
    db.add(urun)
    db.commit()
    db.refresh(urun)
    return urun
