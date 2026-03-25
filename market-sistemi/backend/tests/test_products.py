"""
Market Yönetim Sistemi — Ürün CRUD Testleri
Ekle, listele, güncelle, soft delete, branch izolasyonu
"""

import pytest


class TestUrunListesi:
    """GET /api/products"""

    def test_bos_liste(self, client, auth_headers, test_branch):
        """Ürün yokken boş liste döner"""
        yanit = client.get(f"/api/products?branch_id={test_branch.id}", headers=auth_headers)
        assert yanit.status_code == 200
        veri = yanit.json()
        assert veri["total"] == 0
        assert veri["items"] == []

    def test_urun_listelenir(self, client, auth_headers, test_product, test_branch):
        """Eklenen ürün listede görünür"""
        yanit = client.get(f"/api/products?branch_id={test_branch.id}", headers=auth_headers)
        assert yanit.status_code == 200
        veri = yanit.json()
        assert veri["total"] == 1
        assert veri["items"][0]["name"] == "Test Ürün"

    def test_token_olmadan(self, client, test_branch):
        """Token olmadan → 401"""
        yanit = client.get(f"/api/products?branch_id={test_branch.id}")
        assert yanit.status_code == 401

    def test_arama_isler(self, client, auth_headers, test_product, test_branch):
        """İsim ile arama çalışır"""
        yanit = client.get(
            f"/api/products?branch_id={test_branch.id}&search=Test",
            headers=auth_headers
        )
        assert yanit.status_code == 200
        assert yanit.json()["total"] >= 1

    def test_arama_sonucsuz(self, client, auth_headers, test_product, test_branch):
        """Eşleşmeyen arama → boş"""
        yanit = client.get(
            f"/api/products?branch_id={test_branch.id}&search=YOKYOKYOK",
            headers=auth_headers
        )
        assert yanit.status_code == 200
        assert yanit.json()["total"] == 0


class TestUrunEkle:
    """POST /api/products"""

    def test_urun_ekle(self, client, auth_headers, test_branch, test_category):
        """Geçerli veriyle ürün eklenir"""
        yanit = client.post("/api/products", headers=auth_headers, json={
            "name"       : "Yeni Ürün",
            "barcode"    : "YU001",
            "category_id": test_category.id,
            "unit"       : "adet",
            "price"      : 15.50,
            "cost"       : 10.00,
            "stock_qty"  : 50,
            "min_stock"  : 5,
            "vat_rate"   : 18,
            "branch_id"  : test_branch.id,
        })
        assert yanit.status_code == 201
        veri = yanit.json()
        assert veri["name"]      == "Yeni Ürün"
        assert veri["barcode"]   == "YU001"
        assert float(veri["price"]) == 15.50
        assert veri["is_deleted"] == False

    def test_zorunlu_alan_eksik(self, client, auth_headers, test_branch):
        """Ürün adı olmadan → 422"""
        yanit = client.post("/api/products", headers=auth_headers, json={
            "price"    : 10.0,
            "branch_id": test_branch.id,
        })
        assert yanit.status_code == 422

    def test_fiyat_olmadan(self, client, auth_headers, test_branch):
        """Fiyatsız ürün → 422"""
        yanit = client.post("/api/products", headers=auth_headers, json={
            "name"     : "Fiyatsız Ürün",
            "branch_id": test_branch.id,
        })
        assert yanit.status_code == 422

    def test_barkod_otomatik_uretilir(self, client, auth_headers, test_branch):
        """Barkod verilmezse MYS ile başlayan oto barkod üretilir"""
        yanit = client.post("/api/products", headers=auth_headers, json={
            "name"     : "Barkodsuz Ürün",
            "unit"     : "adet",
            "price"    : 5.0,
            "stock_qty": 10,
            "min_stock": 2,
            "vat_rate" : 18,
            "branch_id": test_branch.id,
        })
        assert yanit.status_code == 201
        barkod = yanit.json().get("barcode", "")
        assert barkod.startswith("MYS")

    def test_kasiyer_urun_ekleyemez(self, client, cashier_headers, test_branch):
        """Kasiyerin ürün ekleme yetkisi yoktur → 403"""
        yanit = client.post("/api/products", headers=cashier_headers, json={
            "name"     : "Kasiyer Ürünü",
            "unit"     : "adet",
            "price"    : 5.0,
            "stock_qty": 10,
            "min_stock": 2,
            "vat_rate" : 18,
            "branch_id": test_branch.id,
        })
        assert yanit.status_code == 403


class TestUrunGetir:
    """GET /api/products/{id}"""

    def test_urun_getirilir(self, client, auth_headers, test_product):
        """ID ile ürün getirilir"""
        yanit = client.get(f"/api/products/{test_product.id}", headers=auth_headers)
        assert yanit.status_code == 200
        assert yanit.json()["id"] == test_product.id

    def test_olmayan_urun(self, client, auth_headers, test_branch):
        """Olmayan ID → 404"""
        yanit = client.get("/api/products/99999", headers=auth_headers)
        assert yanit.status_code == 404

    def test_barkodla_arama(self, client, auth_headers, test_product):
        """Barkod ile ürün bulunur"""
        yanit = client.get(f"/api/products/barcode/TEST001", headers=auth_headers)
        assert yanit.status_code == 200
        assert yanit.json()["barcode"] == "TEST001"

    def test_olmayan_barkod(self, client, auth_headers, test_branch):
        """Olmayan barkod → 404"""
        yanit = client.get("/api/products/barcode/YOKYOKYOK", headers=auth_headers)
        assert yanit.status_code == 404


class TestUrunGuncelle:
    """PATCH /api/products/{id}"""

    def test_fiyat_guncelle(self, client, auth_headers, test_product, test_branch):
        """Fiyat güncellenir"""
        yanit = client.patch(
            f"/api/products/{test_product.id}?branch_id={test_branch.id}",
            headers=auth_headers,
            json={"price": 99.99}
        )
        assert yanit.status_code == 200
        assert float(yanit.json()["price"]) == 99.99

    def test_kismi_guncelleme(self, client, auth_headers, test_product, test_branch):
        """Sadece gönderilen alanlar güncellenir"""
        yanit = client.patch(
            f"/api/products/{test_product.id}?branch_id={test_branch.id}",
            headers=auth_headers,
            json={"shelf_location": "A-5"}
        )
        assert yanit.status_code == 200
        veri = yanit.json()
        assert veri["shelf_location"] == "A-5"
        assert veri["name"] == "Test Ürün"  # Değişmedi

    def test_olmayan_urun_guncelle(self, client, auth_headers, test_branch):
        """Olmayan ürün güncelleme → 404"""
        yanit = client.patch(
            f"/api/products/99999?branch_id={test_branch.id}",
            headers=auth_headers,
            json={"price": 10.0}
        )
        assert yanit.status_code == 404


class TestUrunSil:
    """DELETE /api/products/{id} — Soft Delete"""

    def test_soft_delete(self, client, auth_headers, test_product, test_branch, db):
        """Silinen ürün DB'den gitmez, is_deleted=True olur"""
        yanit = client.delete(
            f"/api/products/{test_product.id}?branch_id={test_branch.id}",
            headers=auth_headers
        )
        assert yanit.status_code == 200

        # DB'de hâlâ var ama silinmiş işaretli
        from models import Product
        db.expire_all()
        urun = db.query(Product).filter(Product.id == test_product.id).first()
        assert urun is not None
        assert urun.is_deleted == True
        assert urun.deleted_at is not None

    def test_silinen_listede_gorunmez(self, client, auth_headers, test_product, test_branch):
        """Soft delete sonrası ürün listede çıkmaz"""
        client.delete(
            f"/api/products/{test_product.id}?branch_id={test_branch.id}",
            headers=auth_headers
        )
        yanit = client.get(f"/api/products?branch_id={test_branch.id}", headers=auth_headers)
        assert yanit.json()["total"] == 0

    def test_silinen_getirilemez(self, client, auth_headers, test_product, test_branch):
        """Silinen ürün ID ile getirilince 404"""
        client.delete(
            f"/api/products/{test_product.id}?branch_id={test_branch.id}",
            headers=auth_headers
        )
        yanit = client.get(f"/api/products/{test_product.id}", headers=auth_headers)
        assert yanit.status_code == 404


class TestBranchIzolasyonu:
    """Şube izolasyonu — Şube A verisi Şube B'den görülmez"""

    def test_baska_sube_urunu_gorulemez(
        self, client, auth_headers, second_branch_product, test_branch
    ):
        """Şube 1 tokeni ile şube 2 ürünü listede görünmez"""
        yanit = client.get(
            f"/api/products?branch_id={test_branch.id}",
            headers=auth_headers
        )
        urun_adlari = [u["name"] for u in yanit.json()["items"]]
        assert "Şube 2 Ürünü" not in urun_adlari

    def test_baska_sube_id_ile_getirilemez(
        self, client, auth_headers, second_branch_product
    ):
        """Şube 2 ürününü ID ile getirmeye çalışınca 404"""
        yanit = client.get(
            f"/api/products/{second_branch_product.id}",
            headers=auth_headers
        )
        assert yanit.status_code == 404
