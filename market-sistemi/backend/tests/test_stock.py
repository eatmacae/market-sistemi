"""
Market Yönetim Sistemi — Stok Hareketi Testleri
Stok düzeltme, fire kaydı, stok girişi, audit log kontrolü
"""

import pytest
from models import Product, StockMovement


class TestStokDuzelt:
    """POST /api/stock/adjust — Sayım düzeltmesi"""

    def test_stok_arttir(self, client, auth_headers, test_product, test_branch, db):
        """Mevcut stoktan yüksek değer → stok artar"""
        yeni_miktar = test_product.stock_qty + 50

        yanit = client.post(
            f"/api/stock/adjust?product_id={test_product.id}"
            f"&yeni_miktar={yeni_miktar}&sebep=Sayım%20düzeltmesi&branch_id={test_branch.id}",
            headers=auth_headers
        )
        assert yanit.status_code == 200

        db.expire_all()
        urun = db.get(Product, test_product.id)
        assert urun.stock_qty == yeni_miktar

    def test_stok_dusur(self, client, auth_headers, test_product, test_branch, db):
        """Mevcut stoktan düşük değer → stok düşer"""
        yeni_miktar = 10

        yanit = client.post(
            f"/api/stock/adjust?product_id={test_product.id}"
            f"&yeni_miktar={yeni_miktar}&sebep=Sayım&branch_id={test_branch.id}",
            headers=auth_headers
        )
        assert yanit.status_code == 200

        db.expire_all()
        urun = db.get(Product, test_product.id)
        assert urun.stock_qty == yeni_miktar

    def test_ayni_miktar_degismez(self, client, auth_headers, test_product, test_branch, db):
        """Aynı miktar girilince stok değişmez"""
        mevcut = test_product.stock_qty
        yanit  = client.post(
            f"/api/stock/adjust?product_id={test_product.id}"
            f"&yeni_miktar={mevcut}&sebep=Test&branch_id={test_branch.id}",
            headers=auth_headers
        )
        assert yanit.status_code == 200
        veri = yanit.json()
        assert veri.get("fark", 0) == 0

    def test_olmayan_urun(self, client, auth_headers, test_branch):
        """Olmayan ürün ID → 404"""
        yanit = client.post(
            f"/api/stock/adjust?product_id=99999"
            f"&yeni_miktar=10&sebep=Test&branch_id={test_branch.id}",
            headers=auth_headers
        )
        assert yanit.status_code == 404

    def test_kasiyer_ayar_yapamaz(self, client, cashier_headers, test_product, test_branch):
        """Kasiyerin stok düzeltme yetkisi yoktur → 403"""
        yanit = client.post(
            f"/api/stock/adjust?product_id={test_product.id}"
            f"&yeni_miktar=50&sebep=Test&branch_id={test_branch.id}",
            headers=cashier_headers
        )
        assert yanit.status_code == 403

    def test_stok_hareketi_loglanir(self, client, auth_headers, test_product, test_branch, db):
        """Düzeltme sonrası StockMovement kaydı oluşur"""
        yeni_miktar = test_product.stock_qty + 20
        client.post(
            f"/api/stock/adjust?product_id={test_product.id}"
            f"&yeni_miktar={yeni_miktar}&sebep=Test%20sayım&branch_id={test_branch.id}",
            headers=auth_headers
        )
        hareket = db.query(StockMovement).filter(
            StockMovement.product_id == test_product.id,
            StockMovement.type       == "adjust",
        ).first()
        assert hareket is not None
        assert hareket.qty_after == yeni_miktar


class TestFireKaydi:
    """POST /api/stock/waste — Fire / zayi"""

    def test_fire_kaydi(self, client, auth_headers, test_product, test_branch, db):
        """Fire kaydedilir, stok düşer"""
        onceki_stok = test_product.stock_qty
        fire_miktar = 5

        yanit = client.post(
            f"/api/stock/waste?product_id={test_product.id}"
            f"&miktar={fire_miktar}&sebep=hasar&branch_id={test_branch.id}",
            headers=auth_headers
        )
        assert yanit.status_code == 200

        db.expire_all()
        urun = db.get(Product, test_product.id)
        assert urun.stock_qty == onceki_stok - fire_miktar

    def test_skt_fire(self, client, auth_headers, test_product, test_branch, db):
        """SKT geçmiş fire sebebi kabul edilir"""
        yanit = client.post(
            f"/api/stock/waste?product_id={test_product.id}"
            f"&miktar=3&sebep=skt_gecmis&branch_id={test_branch.id}",
            headers=auth_headers
        )
        assert yanit.status_code == 200

    def test_sifir_fire_reddedilir(self, client, auth_headers, test_product, test_branch):
        """Fire miktarı 0 → 400"""
        yanit = client.post(
            f"/api/stock/waste?product_id={test_product.id}"
            f"&miktar=0&sebep=hasar&branch_id={test_branch.id}",
            headers=auth_headers
        )
        assert yanit.status_code == 400

    def test_negatif_fire_reddedilir(self, client, auth_headers, test_product, test_branch):
        """Negatif fire miktarı → 400"""
        yanit = client.post(
            f"/api/stock/waste?product_id={test_product.id}"
            f"&miktar=-5&sebep=hasar&branch_id={test_branch.id}",
            headers=auth_headers
        )
        assert yanit.status_code == 400

    def test_fire_hareketi_loglanir(self, client, auth_headers, test_product, test_branch, db):
        """Fire sonrası 'waste' tipinde hareket kaydı oluşur"""
        client.post(
            f"/api/stock/waste?product_id={test_product.id}"
            f"&miktar=2&sebep=hasar&branch_id={test_branch.id}",
            headers=auth_headers
        )
        hareket = db.query(StockMovement).filter(
            StockMovement.product_id == test_product.id,
            StockMovement.type       == "waste",
        ).first()
        assert hareket is not None
        assert hareket.qty_change < 0  # Eksi hareket


class TestStokGirisi:
    """POST /api/stock/receive — Manuel stok girişi"""

    def test_stok_girisi(self, client, auth_headers, test_product, test_branch, db):
        """Stok girişi yapılır, miktar artar"""
        onceki = test_product.stock_qty
        yanit  = client.post(
            f"/api/stock/receive?product_id={test_product.id}"
            f"&miktar=30&branch_id={test_branch.id}",
            headers=auth_headers
        )
        assert yanit.status_code == 200

        db.expire_all()
        urun = db.get(Product, test_product.id)
        assert urun.stock_qty == onceki + 30

    def test_sifir_giris_reddedilir(self, client, auth_headers, test_product, test_branch):
        """Sıfır miktar girişi → 400"""
        yanit = client.post(
            f"/api/stock/receive?product_id={test_product.id}"
            f"&miktar=0&branch_id={test_branch.id}",
            headers=auth_headers
        )
        assert yanit.status_code == 400

    def test_giris_hareketi_loglanir(self, client, auth_headers, test_product, test_branch, db):
        """Giriş sonrası 'purchase' tipinde hareket kaydı oluşur"""
        client.post(
            f"/api/stock/receive?product_id={test_product.id}"
            f"&miktar=20&branch_id={test_branch.id}",
            headers=auth_headers
        )
        hareket = db.query(StockMovement).filter(
            StockMovement.product_id == test_product.id,
            StockMovement.type       == "purchase",
        ).first()
        assert hareket is not None
        assert hareket.qty_change == 20


class TestStokHareketListesi:
    """GET /api/stock/movements/{product_id}"""

    def test_hareket_listesi_bos(self, client, auth_headers, test_product):
        """Hiç hareket yokken boş liste"""
        yanit = client.get(
            f"/api/stock/movements/{test_product.id}",
            headers=auth_headers
        )
        assert yanit.status_code == 200
        assert yanit.json() == []

    def test_hareketler_listelenir(self, client, auth_headers, test_product, test_branch):
        """Düzeltme sonrası hareket listede görünür"""
        client.post(
            f"/api/stock/adjust?product_id={test_product.id}"
            f"&yeni_miktar=50&sebep=Test&branch_id={test_branch.id}",
            headers=auth_headers
        )
        yanit = client.get(
            f"/api/stock/movements/{test_product.id}",
            headers=auth_headers
        )
        assert yanit.status_code == 200
        assert len(yanit.json()) >= 1


class TestDusukStok:
    """Kritik stok uyarıları"""

    def test_dusuk_stok_filtresi(self, client, auth_headers, low_stock_product, test_branch):
        """dusuk_stok=true → yalnızca kritik stok ürünler gelir"""
        yanit = client.get(
            f"/api/products?branch_id={test_branch.id}&dusuk_stok=true",
            headers=auth_headers
        )
        assert yanit.status_code == 200
        urunler = yanit.json()["items"]
        assert any(u["id"] == low_stock_product.id for u in urunler)
