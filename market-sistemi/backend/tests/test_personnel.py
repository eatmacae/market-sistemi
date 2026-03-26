"""
Market Yönetim Sistemi — Personel Testleri
Listeleme, ekleme, güncelleme, aktif/pasif, PIN reset, soft delete, RBAC
"""

import pytest
from models import Personnel


# ============================================================
# 1. PERSONEL LİSTELE
# ============================================================

class TestPersonelListele:
    """GET /api/personnel"""

    def test_personel_listelenir(self, client, auth_headers, admin_user, test_branch):
        """Admin mevcut personeli listeler"""
        yanit = client.get(f"/api/personnel?branch_id={test_branch.id}", headers=auth_headers)
        assert yanit.status_code == 200
        assert len(yanit.json()) >= 1

    def test_token_olmadan(self, client, test_branch):
        """Token olmadan → 401"""
        yanit = client.get(f"/api/personnel?branch_id={test_branch.id}")
        assert yanit.status_code == 401

    def test_kasiyer_goremez(self, client, cashier_headers, test_branch):
        """Kasiyer personel listesini göremez — sadece admin"""
        yanit = client.get(f"/api/personnel?branch_id={test_branch.id}", headers=cashier_headers)
        assert yanit.status_code == 403


# ============================================================
# 2. PERSONEL EKLE
# ============================================================

class TestPersonelEkle:
    """POST /api/personnel"""

    def test_personel_ekle(self, client, auth_headers, test_branch):
        """Admin yeni personel ekler"""
        yanit = client.post("/api/personnel", headers=auth_headers, json={
            "name"     : "Yeni Personel",
            "role"     : "cashier",
            "email"    : "yeni@test.com",
            "password" : "Sifre1234!",
            "pin"      : "789012",
            "branch_id": test_branch.id,
        })
        assert yanit.status_code == 201
        veri = yanit.json()
        assert veri["name"]   == "Yeni Personel"
        assert veri["role"]   == "cashier"
        assert veri["active"] == True

    def test_kasiyer_personel_ekleyemez(self, client, cashier_headers, test_branch):
        """Kasiyer personel ekleyemez → 403"""
        yanit = client.post("/api/personnel", headers=cashier_headers, json={
            "name"     : "İzinsiz",
            "role"     : "cashier",
            "branch_id": test_branch.id,
        })
        assert yanit.status_code == 403

    def test_zorunlu_alan_eksik(self, client, auth_headers, test_branch):
        """İsim olmadan → 422"""
        yanit = client.post("/api/personnel", headers=auth_headers, json={
            "role"     : "cashier",
            "branch_id": test_branch.id,
        })
        assert yanit.status_code == 422

    def test_ayni_email_tekrar(self, client, auth_headers, admin_user, test_branch):
        """Aynı e-posta ile ikinci personel → 400 veya 422"""
        yanit = client.post("/api/personnel", headers=auth_headers, json={
            "name"     : "Kopya Admin",
            "role"     : "admin",
            "email"    : admin_user.email,
            "password" : "Sifre1234!",
            "pin"      : "111222",
            "branch_id": test_branch.id,
        })
        assert yanit.status_code in (400, 422)


# ============================================================
# 3. PERSONEL GETİR
# ============================================================

class TestPersonelGetir:
    """GET /api/personnel/{id}"""

    def test_personel_getirilir(self, client, auth_headers, admin_user):
        """ID ile personel getirilir"""
        yanit = client.get(f"/api/personnel/{admin_user.id}", headers=auth_headers)
        assert yanit.status_code == 200
        assert yanit.json()["id"] == admin_user.id

    def test_olmayan_personel(self, client, auth_headers):
        """Olmayan ID → 404"""
        yanit = client.get("/api/personnel/99999", headers=auth_headers)
        assert yanit.status_code == 404


# ============================================================
# 4. PERSONEL GÜNCELLE
# ============================================================

class TestPersonelGuncelle:
    """PATCH /api/personnel/{id}"""

    def test_isim_guncelle(self, client, auth_headers, admin_user, test_branch):
        """Admin personel adını günceller — tam PersonnelCreate body gerekir"""
        yanit = client.patch(
            f"/api/personnel/{admin_user.id}",
            headers=auth_headers,
            json={
                "name"     : "Güncellendi",
                "role"     : "admin",
                "branch_id": test_branch.id,
            }
        )
        assert yanit.status_code == 200
        assert yanit.json()["name"] == "Güncellendi"

    def test_kasiyer_guncelleyemez(self, client, cashier_headers, admin_user):
        """Kasiyer başkasını güncelleyemez → 403"""
        yanit = client.patch(
            f"/api/personnel/{admin_user.id}",
            headers=cashier_headers,
            json={"name": "Hack"}
        )
        assert yanit.status_code == 403


# ============================================================
# 5. AKTİF / PASİF TOGGLE
# ============================================================

class TestPersonelToggle:
    """PATCH /api/personnel/{id}/toggle-active"""

    def test_pasife_al(self, client, auth_headers, cashier_user):
        """Admin kasiyeri pasife alır"""
        yanit = client.patch(
            f"/api/personnel/{cashier_user.id}/toggle-active",
            headers=auth_headers
        )
        assert yanit.status_code == 200
        assert yanit.json()["active"] == False

    def test_tekrar_aktife_al(self, client, auth_headers, cashier_user):
        """İki kez toggle → tekrar aktif"""
        client.patch(f"/api/personnel/{cashier_user.id}/toggle-active", headers=auth_headers)
        yanit = client.patch(f"/api/personnel/{cashier_user.id}/toggle-active", headers=auth_headers)
        assert yanit.status_code == 200
        assert yanit.json()["active"] == True


# ============================================================
# 6. PIN SIFIRLAMA
# ============================================================

class TestPinSifirla:
    """POST /api/personnel/{id}/reset-pin"""

    def test_pin_sifirlanir(self, client, auth_headers, cashier_user):
        """Admin PIN'i sıfırlar — yeni_pin query param olarak gönderilir"""
        yanit = client.post(
            f"/api/personnel/{cashier_user.id}/reset-pin?yeni_pin=999888",
            headers=auth_headers,
        )
        assert yanit.status_code == 200

    def test_kasiyer_pin_sifirLayamaz(self, client, cashier_headers, admin_user):
        """Kasiyer başkasının PIN'ini sıfırlayamaz → 403"""
        yanit = client.post(
            f"/api/personnel/{admin_user.id}/reset-pin?yeni_pin=000000",
            headers=cashier_headers,
        )
        assert yanit.status_code == 403


# ============================================================
# 7. PERSONEL SİL (SOFT DELETE)
# ============================================================

class TestPersonelSil:
    """DELETE /api/personnel/{id}"""

    def test_soft_delete(self, client, auth_headers, cashier_user, test_branch, db):
        """Personel soft delete yapılır — önce pasife almak gerekir"""
        # Önce pasife al
        client.patch(
            f"/api/personnel/{cashier_user.id}/toggle-active",
            headers=auth_headers
        )

        # Sonra sil
        yanit = client.delete(
            f"/api/personnel/{cashier_user.id}",
            headers=auth_headers
        )
        assert yanit.status_code == 200

        db.expire_all()
        kisi = db.get(Personnel, cashier_user.id)
        assert kisi is not None
        assert kisi.name.startswith("[SİLİNDİ]")

    def test_kasiyer_silemez(self, client, cashier_headers, admin_user):
        """Kasiyer personel silemez → 403"""
        yanit = client.delete(
            f"/api/personnel/{admin_user.id}",
            headers=cashier_headers
        )
        assert yanit.status_code == 403
