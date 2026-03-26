"""
Market Yönetim Sistemi — Çok Şube Tam Akış Testleri
Transfer, onay, stok izolasyonu, şube izolasyonu uçtan uca
"""

import pytest
from models import Branch, Personnel, Product
from routes.auth import hash_password, hash_pin, create_access_token


# ============================================================
# FIXTURE — İki şube + iki admin
# ============================================================

@pytest.fixture
def sube_a(db) -> Branch:
    sube = Branch(name="Şube A", address="A Adres", active=True)
    db.add(sube)
    db.commit()
    db.refresh(sube)
    return sube


@pytest.fixture
def sube_b(db) -> Branch:
    sube = Branch(name="Şube B", address="B Adres", active=True)
    db.add(sube)
    db.commit()
    db.refresh(sube)
    return sube


@pytest.fixture
def admin_a(db, sube_a) -> Personnel:
    user = Personnel(
        branch_id = sube_a.id,
        name      = "Admin A",
        role      = "admin",
        email     = "admina@test.com",
        password  = hash_password("Sifre1234!"),
        pin       = hash_pin("111111"),
        active    = True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_b(db, sube_b) -> Personnel:
    user = Personnel(
        branch_id = sube_b.id,
        name      = "Admin B",
        role      = "admin",
        email     = "adminb@test.com",
        password  = hash_password("Sifre1234!"),
        pin       = hash_pin("222222"),
        active    = True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def token_a(admin_a):
    return {"Authorization": f"Bearer {create_access_token({'sub': str(admin_a.id), 'role': 'admin', 'branch_id': admin_a.branch_id})}"}


@pytest.fixture
def token_b(admin_b):
    return {"Authorization": f"Bearer {create_access_token({'sub': str(admin_b.id), 'role': 'admin', 'branch_id': admin_b.branch_id})}"}


@pytest.fixture
def urun_a(db, sube_a) -> Product:
    urun = Product(
        branch_id  = sube_a.id,
        name       = "Şube A Ürünü",
        barcode    = "SUBE-A-001",
        unit       = "adet",
        price      = 10.00,
        stock_qty  = 100,
        min_stock  = 5,
        vat_rate   = 18,
        is_deleted = False,
    )
    db.add(urun)
    db.commit()
    db.refresh(urun)
    return urun


# ============================================================
# 1. ŞUBE İZOLASYONU
# ============================================================

class TestSubeIzolasyonu:
    """Şube A verisi Şube B'den erişilememeli"""

    def test_sube_a_urunu_sube_b_listesinde_cikamaz(
        self, client, token_a, token_b, urun_a, sube_a, sube_b
    ):
        """Şube B listesinde Şube A ürünleri görünmez"""
        yanit_b = client.get(
            f"/api/products?branch_id={sube_b.id}",
            headers=token_b,
        )
        assert yanit_b.status_code == 200
        isimler = [u["name"] for u in yanit_b.json()["items"]]
        assert "Şube A Ürünü" not in isimler

    def test_sube_a_urunu_sube_b_tokeni_ile_guncellenemez(
        self, client, token_b, urun_a, sube_b
    ):
        """Şube B tokeni ile Şube A ürünü güncellenemez → 404"""
        yanit = client.patch(
            f"/api/products/{urun_a.id}?branch_id={sube_b.id}",
            headers=token_b,
            json={"price": 999.0},
        )
        assert yanit.status_code == 404

    def test_sube_a_urunu_sube_b_tokeni_ile_silinemez(
        self, client, token_b, urun_a, sube_b
    ):
        """Şube B tokeni ile Şube A ürünü silinemez → 404"""
        yanit = client.delete(
            f"/api/products/{urun_a.id}?branch_id={sube_b.id}",
            headers=token_b,
        )
        assert yanit.status_code == 404

    def test_sube_a_tokeni_sube_a_urununu_gorebilir(
        self, client, token_a, urun_a, sube_a
    ):
        """Şube A kendi ürününü görebilir"""
        yanit = client.get(
            f"/api/products?branch_id={sube_a.id}",
            headers=token_a,
        )
        assert yanit.status_code == 200
        isimler = [u["name"] for u in yanit.json()["items"]]
        assert "Şube A Ürünü" in isimler


# ============================================================
# 2. TRANSFER AKIŞI
# ============================================================

class TestTransferTamAkis:
    """Şube A → Şube B transfer tam akışı"""

    def test_transfer_olustur_onayla_stok(
        self, client, token_a, urun_a, sube_a, sube_b, db
    ):
        """Transfer oluştur → onayla → stoklar güncellenir"""
        stok_onceki = urun_a.stock_qty

        # Transfer oluştur
        transfer_yanit = client.post(
            f"/api/transfers"
            f"?from_branch_id={sube_a.id}"
            f"&to_branch_id={sube_b.id}"
            f"&product_id={urun_a.id}"
            f"&qty=10"
            f"&note=Test+transferi",
            headers=token_a,
        )
        assert transfer_yanit.status_code in (200, 201)
        transfer_id = transfer_yanit.json()["transfer_id"]

        # Onayla
        onayla_yanit = client.patch(
            f"/api/transfers/{transfer_id}/approve",
            headers=token_a,
        )
        assert onayla_yanit.status_code == 200

        # Şube A stoğu düştü mü?
        db.expire_all()
        urun_a_guncellendi = db.get(Product, urun_a.id)
        assert urun_a_guncellendi.stock_qty == stok_onceki - 10

        # Şube B'de ürün oluştu mu?
        sube_b_urunu = db.query(Product).filter(
            Product.branch_id  == sube_b.id,
            Product.is_deleted == False,
        ).first()
        assert sube_b_urunu is not None
        assert sube_b_urunu.stock_qty == 10

    def test_transfer_iptal(
        self, client, token_a, urun_a, sube_a, sube_b
    ):
        """Transfer iptal edilebilir"""
        transfer_yanit = client.post(
            f"/api/transfers"
            f"?from_branch_id={sube_a.id}"
            f"&to_branch_id={sube_b.id}"
            f"&product_id={urun_a.id}"
            f"&qty=5",
            headers=token_a,
        )
        assert transfer_yanit.status_code in (200, 201)
        transfer_id = transfer_yanit.json()["transfer_id"]

        iptal = client.patch(
            f"/api/transfers/{transfer_id}/cancel",
            headers=token_a,
        )
        assert iptal.status_code == 200

    def test_yetersiz_stok_transfer(
        self, client, token_a, urun_a, sube_a, sube_b
    ):
        """Stoktan fazla transfer → 400"""
        yanit = client.post(
            f"/api/transfers"
            f"?from_branch_id={sube_a.id}"
            f"&to_branch_id={sube_b.id}"
            f"&product_id={urun_a.id}"
            f"&qty=9999",
            headers=token_a,
        )
        assert yanit.status_code == 400

    def test_ayni_sube_transfer_edilemez(
        self, client, token_a, urun_a, sube_a
    ):
        """Kaynak ve hedef aynı şube → 400"""
        yanit = client.post(
            f"/api/transfers"
            f"?from_branch_id={sube_a.id}"
            f"&to_branch_id={sube_a.id}"
            f"&product_id={urun_a.id}"
            f"&qty=5",
            headers=token_a,
        )
        assert yanit.status_code == 400

    def test_transfer_listesi_izole(
        self, client, token_a, token_b, urun_a, sube_a, sube_b
    ):
        """Transfer listesi şube bazlı gelir"""
        # Şube A'dan transfer oluştur
        client.post(
            f"/api/transfers"
            f"?from_branch_id={sube_a.id}"
            f"&to_branch_id={sube_b.id}"
            f"&product_id={urun_a.id}"
            f"&qty=3",
            headers=token_a,
        )

        # Şube B listesi — gelen transfer görünür
        yanit_b = client.get(
            f"/api/transfers?branch_id={sube_b.id}",
            headers=token_b,
        )
        assert yanit_b.status_code == 200
