"""
Market Yönetim Sistemi — Auth Testleri
Login, PIN, token doğrulama, yetkisiz erişim
"""

import pytest


class TestLogin:
    """Email + şifre ile giriş"""

    def test_basarili_login(self, client, admin_user):
        """Doğru kimlik bilgileriyle token alınmalı"""
        yanit = client.post("/api/auth/login", json={
            "email"   : "admin@test.com",
            "password": "Sifre1234!",
        })
        assert yanit.status_code == 200
        veri = yanit.json()
        assert "access_token" in veri
        assert veri["token_type"] == "bearer"
        assert len(veri["access_token"]) > 20

    def test_yanlis_sifre(self, client, admin_user):
        """Yanlış şifre → 401"""
        yanit = client.post("/api/auth/login", json={
            "email"   : "admin@test.com",
            "password": "YanlisŞifre",
        })
        assert yanit.status_code == 401

    def test_olmayan_email(self, client, test_branch):
        """Kayıtlı olmayan e-posta → 401"""
        yanit = client.post("/api/auth/login", json={
            "email"   : "yok@test.com",
            "password": "herhangi",
        })
        assert yanit.status_code == 401

    def test_bos_email(self, client, test_branch):
        """Boş e-posta → doğrulama hatası"""
        yanit = client.post("/api/auth/login", json={
            "email"   : "",
            "password": "Sifre1234!",
        })
        assert yanit.status_code in (401, 422)

    def test_pasif_kullanici(self, client, db, test_branch):
        """Pasif (active=False) kullanıcı giremez → 401"""
        from models import Personnel
        from routes.auth import hash_password
        pasif = Personnel(
            branch_id = test_branch.id,
            name      = "Pasif Kullanıcı",
            role      = "cashier",
            email     = "pasif@test.com",
            password  = hash_password("Sifre1234!"),
            active    = False,
        )
        db.add(pasif)
        db.commit()

        yanit = client.post("/api/auth/login", json={
            "email"   : "pasif@test.com",
            "password": "Sifre1234!",
        })
        assert yanit.status_code == 401


class TestPINLogin:
    """Kasiyer PIN ile giriş"""

    def test_basarili_pin_login(self, client, cashier_user, test_branch):
        """Doğru PIN ile token alınmalı"""
        yanit = client.post("/api/auth/login/pin", json={
            "pin"      : "654321",
            "branch_id": test_branch.id,
        })
        assert yanit.status_code == 200
        veri = yanit.json()
        assert "access_token" in veri

    def test_yanlis_pin(self, client, cashier_user, test_branch):
        """Yanlış PIN → 401"""
        yanit = client.post("/api/auth/login/pin", json={
            "pin"      : "000000",
            "branch_id": test_branch.id,
        })
        assert yanit.status_code == 401

    def test_yanlis_sube_pin(self, client, cashier_user, second_branch):
        """Doğru PIN ama yanlış şube → 401"""
        yanit = client.post("/api/auth/login/pin", json={
            "pin"      : "654321",
            "branch_id": second_branch.id,
        })
        assert yanit.status_code == 401


class TestTokenDogrulama:
    """JWT token ile korumalı endpoint erişimi"""

    def test_me_basarili(self, client, auth_headers, admin_user):
        """Geçerli token → kullanıcı bilgisi döner"""
        yanit = client.get("/api/auth/me", headers=auth_headers)
        assert yanit.status_code == 200
        veri = yanit.json()
        assert veri["email"] == "admin@test.com"
        assert veri["role"]  == "admin"

    def test_me_token_yok(self, client, test_branch):
        """Token olmadan → 401"""
        yanit = client.get("/api/auth/me")
        assert yanit.status_code == 401

    def test_me_gecersiz_token(self, client, test_branch):
        """Geçersiz token → 401"""
        yanit = client.get("/api/auth/me", headers={
            "Authorization": "Bearer bu.gecersiz.bir.token"
        })
        assert yanit.status_code == 401

    def test_me_bozuk_format(self, client, test_branch):
        """Bearer olmadan token → 401"""
        yanit = client.get("/api/auth/me", headers={
            "Authorization": "Token gecersizformat"
        })
        assert yanit.status_code == 401
