"""
Market Yönetim Sistemi — Lisans Sistemi Testleri
Lisans oluşturma, doğrulama, durum değiştirme, paket listesi, aktivasyon akışı
"""

import pytest


# ============================================================
# 1. PAKET LİSTESİ (public)
# ============================================================

class TestPaketListesi:
    """GET /api/licenses/packages — auth gerektirmez"""

    def test_paketler_listelenir(self, client, test_branch):
        """Paket listesi herkese açık"""
        yanit = client.get("/api/licenses/packages")
        assert yanit.status_code == 200
        veri = yanit.json()
        assert "paketler" in veri
        assert len(veri["paketler"]) >= 4

    def test_paket_alanlari_var(self, client, test_branch):
        """Her pakette zorunlu alanlar bulunur"""
        yanit = client.get("/api/licenses/packages")
        for paket in yanit.json()["paketler"]:
            assert "id"           in paket
            assert "ad"           in paket
            assert "fiyat"        in paket
            assert "branch_limit" in paket
            assert "ozellikler"   in paket

    def test_starter_paketi_var(self, client, test_branch):
        """starter paketi mevcut"""
        yanit = client.get("/api/licenses/packages")
        idler = [p["id"] for p in yanit.json()["paketler"]]
        assert "starter" in idler
        assert "pro"     in idler
        assert "chain"   in idler
        assert "lifetime" in idler


# ============================================================
# 2. LİSANS OLUŞTUR
# ============================================================

class TestLisansOlustur:
    """POST /api/licenses"""

    def test_lisans_olusturulur(self, client, auth_headers, test_branch):
        """Admin yeni lisans oluşturur"""
        yanit = client.post(
            "/api/licenses"
            "?customer_name=Ahmet+Market"
            "&email=ahmet@market.com"
            "&package=starter",
            headers=auth_headers,
        )
        assert yanit.status_code == 201
        veri = yanit.json()
        assert veri["success"] == True
        assert veri["license_key"].startswith("MYS-")
        assert veri["package"] == "starter"
        assert veri["customer"] == "Ahmet Market"

    def test_lisans_anahtari_formati(self, client, auth_headers, test_branch):
        """Anahtar MYS-YYYY-XXXX-XXXX-XXXX formatında"""
        yanit = client.post(
            "/api/licenses"
            "?customer_name=Format+Test"
            "&email=format@test.com"
            "&package=pro",
            headers=auth_headers,
        )
        key = yanit.json()["license_key"]
        parcalar = key.split("-")
        assert len(parcalar) == 5
        assert parcalar[0] == "MYS"
        assert len(parcalar[1]) == 4   # Yıl
        assert len(parcalar[2]) == 4
        assert len(parcalar[3]) == 4
        assert len(parcalar[4]) == 4

    def test_sureli_lisans(self, client, auth_headers, test_branch):
        """12 aylık lisans end_date içerir"""
        yanit = client.post(
            "/api/licenses"
            "?customer_name=Sureli+Market"
            "&email=sureli@market.com"
            "&package=pro"
            "&sureli_ay=12",
            headers=auth_headers,
        )
        assert yanit.status_code == 201
        assert yanit.json()["end_date"] != "Sınırsız"

    def test_lifetime_lisans_sinirssiz(self, client, auth_headers, test_branch):
        """Lifetime lisansın end_date'i Sınırsız"""
        yanit = client.post(
            "/api/licenses"
            "?customer_name=Omur+Market"
            "&email=omur@market.com"
            "&package=lifetime",
            headers=auth_headers,
        )
        assert yanit.status_code == 201
        assert yanit.json()["end_date"] == "Sınırsız"

    def test_gecersiz_paket(self, client, auth_headers, test_branch):
        """Bilinmeyen paket → 400"""
        yanit = client.post(
            "/api/licenses"
            "?customer_name=Hata+Test"
            "&email=hata@test.com"
            "&package=enterprise",
            headers=auth_headers,
        )
        assert yanit.status_code == 400

    def test_kasiyer_lisans_olusturamaz(self, client, cashier_headers, test_branch):
        """Kasiyer lisans oluşturamaz → 403"""
        yanit = client.post(
            "/api/licenses"
            "?customer_name=Izinsiz"
            "&email=izinsiz@test.com"
            "&package=starter",
            headers=cashier_headers,
        )
        assert yanit.status_code == 403

    def test_token_olmadan(self, client, test_branch):
        """Token olmadan → 401"""
        yanit = client.post(
            "/api/licenses"
            "?customer_name=Test"
            "&email=test@test.com"
            "&package=starter"
        )
        assert yanit.status_code == 401

    def test_her_lisans_farkli_anahtar(self, client, auth_headers, test_branch):
        """İki farklı lisans iki farklı anahtar alır"""
        def olustur(email):
            return client.post(
                f"/api/licenses?customer_name=Test&email={email}&package=starter",
                headers=auth_headers,
            ).json()["license_key"]

        k1 = olustur("a1@test.com")
        k2 = olustur("a2@test.com")
        assert k1 != k2


# ============================================================
# 3. LİSANS DOĞRULA / AKTİVASYON
# ============================================================

class TestLisansDogrula:
    """POST /api/licenses/validate — aktivasyon ekranı"""

    def _lisans_olustur(self, client, headers, email):
        yanit = client.post(
            f"/api/licenses?customer_name=Test+Market&email={email}&package=starter",
            headers=headers,
        )
        return yanit.json()["license_key"]

    def test_gecerli_lisans_dogrulanir(self, client, auth_headers, test_branch):
        """Aktif lisans doğrulanır"""
        key = self._lisans_olustur(client, auth_headers, "gecerli@test.com")
        yanit = client.post(f"/api/licenses/validate?license_key={key}")
        assert yanit.status_code == 200
        veri = yanit.json()
        assert veri["gecerli"] == True
        assert veri["package"] == "starter"

    def test_olmayan_anahtar(self, client, test_branch):
        """Olmayan anahtar → gecerli: False"""
        yanit = client.post("/api/licenses/validate?license_key=MYS-2026-XXXX-YYYY-ZZZZ")
        assert yanit.status_code == 200
        assert yanit.json()["gecerli"] == False

    def test_dogrulama_auth_gerektirmez(self, client, test_branch):
        """Doğrulama endpoint'i token olmadan çalışır"""
        yanit = client.post("/api/licenses/validate?license_key=MYS-2026-TEST-AAAA-BBBB")
        assert yanit.status_code == 200  # 401 değil

    def test_askiya_alinan_lisans_gecersiz(self, client, auth_headers, test_branch):
        """Askıya alınmış lisans geçersiz döner"""
        key = self._lisans_olustur(client, auth_headers, "ask@test.com")

        # Lisans ID'sini bul
        liste = client.get("/api/licenses", headers=auth_headers)
        lisans_id = next(l["id"] for l in liste.json()["items"] if l["license_key"] == key)

        # Askıya al
        client.patch(
            f"/api/licenses/{lisans_id}/status?yeni_durum=suspended",
            headers=auth_headers,
        )

        # Doğrula — geçersiz olmalı
        yanit = client.post(f"/api/licenses/validate?license_key={key}")
        assert yanit.json()["gecerli"] == False

    def test_gecerli_lisans_musteri_adini_doner(self, client, auth_headers, test_branch):
        """Doğrulama müşteri adını döner"""
        key = self._lisans_olustur(client, auth_headers, "musteri@test.com")
        yanit = client.post(f"/api/licenses/validate?license_key={key}")
        assert "customer_name" in yanit.json()


# ============================================================
# 4. LİSANS LİSTELE
# ============================================================

class TestLisansListele:
    """GET /api/licenses"""

    def test_lisans_listelenir(self, client, auth_headers, test_branch):
        """Admin lisansları listeler"""
        # Önce bir lisans oluştur
        client.post(
            "/api/licenses?customer_name=Liste+Test&email=liste@test.com&package=pro",
            headers=auth_headers,
        )
        yanit = client.get("/api/licenses", headers=auth_headers)
        assert yanit.status_code == 200
        veri = yanit.json()
        assert "total"  in veri
        assert "items"  in veri
        assert veri["total"] >= 1

    def test_kasiyer_goremez(self, client, cashier_headers, test_branch):
        """Kasiyer lisans listesine erişemez → 403"""
        yanit = client.get("/api/licenses", headers=cashier_headers)
        assert yanit.status_code == 403


# ============================================================
# 5. LİSANS DURUM DEĞİŞTİR
# ============================================================

class TestLisansDurum:
    """PATCH /api/licenses/{id}/status"""

    def _lisans_id_al(self, client, auth_headers, email):
        client.post(
            f"/api/licenses?customer_name=Durum+Test&email={email}&package=starter",
            headers=auth_headers,
        )
        liste = client.get("/api/licenses", headers=auth_headers)
        return liste.json()["items"][0]["id"]

    def test_askiya_al(self, client, auth_headers, test_branch):
        """Lisans askıya alınır"""
        lid = self._lisans_id_al(client, auth_headers, "ask2@test.com")
        yanit = client.patch(
            f"/api/licenses/{lid}/status?yeni_durum=suspended",
            headers=auth_headers,
        )
        assert yanit.status_code == 200
        assert yanit.json()["success"] == True

    def test_tekrar_aktifles(self, client, auth_headers, test_branch):
        """Askıya alınan lisans tekrar aktifleştirilir"""
        lid = self._lisans_id_al(client, auth_headers, "ask3@test.com")
        client.patch(f"/api/licenses/{lid}/status?yeni_durum=suspended", headers=auth_headers)
        yanit = client.patch(f"/api/licenses/{lid}/status?yeni_durum=active", headers=auth_headers)
        assert yanit.status_code == 200

    def test_gecersiz_durum(self, client, auth_headers, test_branch):
        """Geçersiz durum → 400"""
        lid = self._lisans_id_al(client, auth_headers, "ask4@test.com")
        yanit = client.patch(
            f"/api/licenses/{lid}/status?yeni_durum=deleted",
            headers=auth_headers,
        )
        assert yanit.status_code == 400

    def test_olmayan_lisans(self, client, auth_headers, test_branch):
        """Olmayan lisans → 404"""
        yanit = client.patch(
            "/api/licenses/99999/status?yeni_durum=active",
            headers=auth_headers,
        )
        assert yanit.status_code == 404
