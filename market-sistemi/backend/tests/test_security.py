"""
Market Yönetim Sistemi — Güvenlik Testleri
Yetkisiz erişim, şube izolasyonu, rol bazlı erişim kontrolü, soft delete bypass, idempotency
"""

import pytest


class TestYetkisizErisim:
    """Token olmadan hiçbir korumalı endpoint'e erişilemez"""

    def test_urunler_token_olmadan(self, client, test_branch):
        yanit = client.get(f"/api/products?branch_id={test_branch.id}")
        assert yanit.status_code == 401

    def test_stok_token_olmadan(self, client, test_branch):
        yanit = client.get(f"/api/stock/smart-list?branch_id={test_branch.id}")
        assert yanit.status_code == 401

    def test_satis_token_olmadan(self, client):
        yanit = client.post("/api/sales", json={})
        assert yanit.status_code == 401

    def test_musteri_token_olmadan(self, client, test_branch):
        yanit = client.get(f"/api/customers?branch_id={test_branch.id}")
        assert yanit.status_code == 401

    def test_rapor_token_olmadan(self, client, test_branch):
        yanit = client.get(f"/api/reports/summary?branch_id={test_branch.id}")
        assert yanit.status_code == 401

    def test_personel_token_olmadan(self, client, test_branch):
        yanit = client.get(f"/api/personnel?branch_id={test_branch.id}")
        assert yanit.status_code == 401


class TestRolErisimKontrolu:
    """Kasiyer admin işlemlerini yapamaz"""

    def test_kasiyer_urun_ekleyemez(self, client, cashier_headers, test_branch):
        """Kasiyer ürün ekleyemez → 403"""
        yanit = client.post("/api/products", headers=cashier_headers, json={
            "name"     : "İzinsiz Ürün",
            "unit"     : "adet",
            "price"    : 5.0,
            "stock_qty": 10,
            "min_stock": 2,
            "vat_rate" : 18,
            "branch_id": test_branch.id,
        })
        assert yanit.status_code == 403

    def test_kasiyer_urun_silemez(self, client, cashier_headers, test_product, test_branch):
        """Kasiyer ürün silemez → 403"""
        yanit = client.delete(
            f"/api/products/{test_product.id}?branch_id={test_branch.id}",
            headers=cashier_headers
        )
        assert yanit.status_code == 403

    def test_kasiyer_stok_ayarlayamaz(self, client, cashier_headers, test_product, test_branch):
        """Kasiyer stok düzeltmesi yapamaz → 403"""
        yanit = client.post(
            f"/api/stock/adjust?product_id={test_product.id}"
            f"&yeni_miktar=50&sebep=Test&branch_id={test_branch.id}",
            headers=cashier_headers
        )
        assert yanit.status_code == 403

    def test_kasiyer_personel_ekleyemez(self, client, cashier_headers, test_branch):
        """Kasiyer yeni personel ekleyemez → 403"""
        yanit = client.post("/api/personnel", headers=cashier_headers, json={
            "name"     : "Yeni Personel",
            "role"     : "cashier",
            "branch_id": test_branch.id,
        })
        assert yanit.status_code == 403

    def test_admin_her_seyi_yapabilir(self, client, auth_headers, test_branch, test_category):
        """Admin tüm işlemleri yapabilir"""
        yanit = client.post("/api/products", headers=auth_headers, json={
            "name"     : "Admin Ürünü",
            "unit"     : "adet",
            "price"    : 10.0,
            "stock_qty": 20,
            "min_stock": 3,
            "vat_rate" : 18,
            "branch_id": test_branch.id,
        })
        assert yanit.status_code == 201


class TestSubeIzolasyonu:
    """Şube A verisi Şube B'den erişilememeli"""

    def test_sube_listesi_izole(
        self, client, auth_headers, test_product, second_branch_product, test_branch
    ):
        """branch_id=1 sorgusu sadece şube 1 ürünlerini getirir"""
        yanit = client.get(
            f"/api/products?branch_id={test_branch.id}",
            headers=auth_headers
        )
        urunler = yanit.json()["items"]
        ids = [u["id"] for u in urunler]

        assert test_product.id in ids
        assert second_branch_product.id not in ids

    def test_baska_sube_urunu_guncellenmez(
        self, client, auth_headers, second_branch_product, test_branch
    ):
        """Şube 1 tokeni ile şube 2 ürünü güncellenemez → 404"""
        yanit = client.patch(
            f"/api/products/{second_branch_product.id}?branch_id={test_branch.id}",
            headers=auth_headers,
            json={"price": 999.0}
        )
        assert yanit.status_code == 404

    def test_baska_sube_urunu_silinemez(
        self, client, auth_headers, second_branch_product, test_branch
    ):
        """Şube 1 tokeni ile şube 2 ürünü silinemez → 404"""
        yanit = client.delete(
            f"/api/products/{second_branch_product.id}?branch_id={test_branch.id}",
            headers=auth_headers
        )
        assert yanit.status_code == 404


class TestSoftDelete:
    """Soft delete bypass denemeleri"""

    def test_silinen_urun_listede_cikamaz(
        self, client, auth_headers, test_product, test_branch
    ):
        """Silinen ürün hiçbir liste sorgusunda görünmemeli"""
        # Sil
        client.delete(
            f"/api/products/{test_product.id}?branch_id={test_branch.id}",
            headers=auth_headers
        )

        # Listede yok
        liste = client.get(
            f"/api/products?branch_id={test_branch.id}",
            headers=auth_headers
        )
        assert liste.json()["total"] == 0

        # ID ile de yok
        detay = client.get(f"/api/products/{test_product.id}", headers=auth_headers)
        assert detay.status_code == 404

    def test_silinen_urun_db_de_var(
        self, client, auth_headers, test_product, test_branch, db
    ):
        """Silinen ürün fiziksel olarak DB'de bulunmalı (soft delete garantisi)"""
        client.delete(
            f"/api/products/{test_product.id}?branch_id={test_branch.id}",
            headers=auth_headers
        )

        from models import Product
        db.expire_all()
        urun = db.query(Product).filter(
            Product.id == test_product.id
        ).first()

        assert urun is not None, "Ürün fiziksel olarak silindi — SOFT DELETE İHLALİ!"
        assert urun.is_deleted == True
        assert urun.deleted_at is not None


class TestGecersizGirisler:
    """Kötü niyetli / hatalı girdiler reddedilmeli"""

    def test_sql_injection_girisimi(self, client, test_branch):
        """SQL injection denemesi → başarısız giriş, 401"""
        yanit = client.post("/api/auth/login", json={
            "email"   : "'; DROP TABLE personnel; --",
            "password": "herhangi",
        })
        assert yanit.status_code in (401, 422)

    def test_negatif_fiyat(self, client, auth_headers, test_branch):
        """Negatif fiyat → 422"""
        yanit = client.post("/api/products", headers=auth_headers, json={
            "name"     : "Negatif Fiyat",
            "unit"     : "adet",
            "price"    : -10.0,
            "stock_qty": 10,
            "min_stock": 2,
            "vat_rate" : 18,
            "branch_id": test_branch.id,
        })
        assert yanit.status_code == 422

    def test_cok_uzun_urun_adi(self, client, auth_headers, test_branch):
        """Çok uzun ürün adı → 422 veya 400"""
        yanit = client.post("/api/products", headers=auth_headers, json={
            "name"     : "A" * 1000,
            "unit"     : "adet",
            "price"    : 10.0,
            "stock_qty": 10,
            "min_stock": 2,
            "vat_rate" : 18,
            "branch_id": test_branch.id,
        })
        assert yanit.status_code in (400, 422)


class TestSaglikKontrolu:
    """Sistem sağlık endpoint'i"""

    def test_health_check(self, client, test_branch):
        """Health endpoint token gerektirmez ve 200 döner"""
        yanit = client.get("/api/health")
        assert yanit.status_code == 200
        veri = yanit.json()
        assert veri["status"] == "ok"
        assert "version" in veri


class TestIdempotencyMiddleware:
    """X-Idempotency-Key — Offline sync duplicate koruması"""

    def test_idempotency_key_olmadan_normal_istek(
        self, client, auth_headers, test_branch
    ):
        """Header olmadan istek normal işlenir"""
        yanit = client.post("/api/products", headers=auth_headers, json={
            "name"     : "Idempotency Test Ürün",
            "unit"     : "adet",
            "price"    : 10.0,
            "branch_id": test_branch.id,
        })
        assert yanit.status_code == 201

    def test_ayni_idempotency_key_ile_ikinci_istek_duplicate_donar(
        self, client, auth_headers, test_branch
    ):
        """Aynı X-Idempotency-Key ile gönderilen ikinci istek duplicate döner"""
        headers = {**auth_headers, "X-Idempotency-Key": "test-uuid-duplicate-001"}

        # İlk istek — işlenir
        yanit1 = client.post("/api/products", headers=headers, json={
            "name"     : "Idempotency Ürün",
            "unit"     : "adet",
            "price"    : 10.0,
            "branch_id": test_branch.id,
        })
        assert yanit1.status_code in (200, 201)

        # İkinci istek — aynı key, duplicate
        yanit2 = client.post("/api/products", headers=headers, json={
            "name"     : "Idempotency Ürün",
            "unit"     : "adet",
            "price"    : 10.0,
            "branch_id": test_branch.id,
        })
        assert yanit2.status_code == 200
        assert yanit2.json().get("duplicate") is True

    def test_farkli_idempotency_keyleri_farkli_islemler(
        self, client, auth_headers, test_branch
    ):
        """Farklı key'ler farklı işlemler — her ikisi de işlenir"""
        for i, key in enumerate(["key-aaa", "key-bbb"]):
            headers = {**auth_headers, "X-Idempotency-Key": key}
            yanit = client.post("/api/products", headers=headers, json={
                "name"     : f"Farklı Key Ürün {i}",
                "unit"     : "adet",
                "price"    : 10.0,
                "branch_id": test_branch.id,
            })
            assert yanit.status_code in (200, 201)
            assert yanit.json().get("duplicate") is not True

    def test_get_istegi_idempotency_kontrolune_girmez(
        self, client, auth_headers, test_branch
    ):
        """GET istekleri idempotency middleware'ini bypass eder"""
        headers = {**auth_headers, "X-Idempotency-Key": "get-key-xyz"}

        # İlk GET
        yanit1 = client.get(
            f"/api/products?branch_id={test_branch.id}", headers=headers
        )
        # İkinci GET — duplicate dönmemeli
        yanit2 = client.get(
            f"/api/products?branch_id={test_branch.id}", headers=headers
        )
        assert yanit1.status_code == 200
        assert yanit2.status_code == 200
        assert yanit2.json().get("duplicate") is not True
