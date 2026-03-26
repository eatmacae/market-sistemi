"""
Market Yönetim Sistemi — Kasa Oturumu (Vardiya) Testleri
Açılış, kapanış, Z raporu, çift oturum, RBAC
"""

import pytest
from models import Session as KasaSession, Sale


# ============================================================
# 1. AKTİF OTURUM SORGULA
# ============================================================

class TestAktifOturumSorgula:
    """GET /api/sessions/active"""

    def test_acik_oturum_yok(self, client, auth_headers, test_branch):
        """Oturum açılmamışsa active:False döner"""
        yanit = client.get(
            f"/api/sessions/active?branch_id={test_branch.id}",
            headers=auth_headers,
        )
        assert yanit.status_code == 200
        assert yanit.json()["active"] == False
        assert yanit.json()["session"] is None

    def test_acik_oturum_var(self, client, auth_headers, test_branch, cashier_user, db):
        """Açık oturum varsa active:True döner"""
        oturum = KasaSession(
            branch_id=test_branch.id,
            cashier_id=cashier_user.id,
            opening_amount=500.0,
        )
        db.add(oturum)
        db.commit()
        db.refresh(oturum)

        yanit = client.get(
            f"/api/sessions/active?branch_id={test_branch.id}",
            headers=auth_headers,
        )
        assert yanit.status_code == 200
        veri = yanit.json()
        assert veri["active"] == True
        assert veri["session"]["id"] == oturum.id
        assert float(veri["session"]["opening_amount"]) == 500.0

    def test_token_olmadan(self, client, test_branch):
        """Token olmadan → 401"""
        yanit = client.get(f"/api/sessions/active?branch_id={test_branch.id}")
        assert yanit.status_code == 401


# ============================================================
# 2. OTURUM AÇ
# ============================================================

class TestOturumAc:
    """POST /api/sessions"""

    def test_oturum_acilir(self, client, auth_headers, test_branch, cashier_user):
        """Oturum başarıyla açılır"""
        yanit = client.post("/api/sessions", headers=auth_headers, json={
            "branch_id"     : test_branch.id,
            "cashier_id"    : cashier_user.id,
            "opening_amount": 250.0,
        })
        assert yanit.status_code == 201
        veri = yanit.json()
        assert veri["branch_id"] == test_branch.id
        assert float(veri["opening_amount"]) == 250.0
        assert veri["closed_at"] is None

    def test_cift_oturum_acamaz(self, client, auth_headers, test_branch, cashier_user, db):
        """Açık oturum varken ikinci oturum → 400"""
        oturum = KasaSession(
            branch_id=test_branch.id,
            cashier_id=cashier_user.id,
            opening_amount=100.0,
        )
        db.add(oturum)
        db.commit()

        yanit = client.post("/api/sessions", headers=auth_headers, json={
            "branch_id"     : test_branch.id,
            "cashier_id"    : cashier_user.id,
            "opening_amount": 200.0,
        })
        assert yanit.status_code == 400

    def test_token_olmadan(self, client, test_branch, cashier_user):
        """Token olmadan → 401"""
        yanit = client.post("/api/sessions", json={
            "branch_id"     : test_branch.id,
            "cashier_id"    : cashier_user.id,
            "opening_amount": 100.0,
        })
        assert yanit.status_code == 401


# ============================================================
# 3. OTURUM KAPAT (Z Raporu)
# ============================================================

class TestOturumKapat:
    """POST /api/sessions/{id}/close"""

    @pytest.fixture
    def acik_oturum(self, db, test_branch, cashier_user):
        oturum = KasaSession(
            branch_id=test_branch.id,
            cashier_id=cashier_user.id,
            opening_amount=500.0,
        )
        db.add(oturum)
        db.commit()
        db.refresh(oturum)
        return oturum

    def test_oturum_kapatilir(self, client, auth_headers, acik_oturum):
        """Oturum başarıyla kapatılır, Z raporu döner"""
        yanit = client.post(
            f"/api/sessions/{acik_oturum.id}/close",
            headers=auth_headers,
            json={"closing_amount": 520.0},
        )
        assert yanit.status_code == 200
        veri = yanit.json()
        assert veri["success"] == True
        assert "z_raporu" in veri
        z = veri["z_raporu"]
        assert z["session_id"] == acik_oturum.id
        assert float(z["acilis_tutari"]) == 500.0
        assert float(z["kapanis_tutari"]) == 520.0

    def test_z_raporu_kasa_farki(self, client, auth_headers, acik_oturum):
        """Kasa farkı doğru hesaplanır (kapanış - beklenen)"""
        yanit = client.post(
            f"/api/sessions/{acik_oturum.id}/close",
            headers=auth_headers,
            json={"closing_amount": 490.0},  # 10₺ eksik
        )
        z = yanit.json()["z_raporu"]
        # Satış yok → beklenen = açılış (500), kapanış = 490 → fark = -10
        assert float(z["kasa_farki"]) == pytest.approx(-10.0, abs=0.01)
        assert z["fark_uyarisi"] == True  # |fark| > 5₺

    def test_kucuk_fark_uyari_yok(self, client, auth_headers, acik_oturum):
        """5₺ veya altındaki fark uyarı tetiklemez"""
        yanit = client.post(
            f"/api/sessions/{acik_oturum.id}/close",
            headers=auth_headers,
            json={"closing_amount": 503.0},  # +3₺
        )
        z = yanit.json()["z_raporu"]
        assert z["fark_uyarisi"] == False

    def test_kapali_oturum_tekrar_kapatamaz(self, client, auth_headers, acik_oturum):
        """Zaten kapalı oturum → 404"""
        client.post(
            f"/api/sessions/{acik_oturum.id}/close",
            headers=auth_headers,
            json={"closing_amount": 500.0},
        )
        # Tekrar kapat
        yanit = client.post(
            f"/api/sessions/{acik_oturum.id}/close",
            headers=auth_headers,
            json={"closing_amount": 500.0},
        )
        assert yanit.status_code == 404

    def test_olmayan_oturum(self, client, auth_headers):
        """Olmayan oturum → 404"""
        yanit = client.post(
            "/api/sessions/99999/close",
            headers=auth_headers,
            json={"closing_amount": 100.0},
        )
        assert yanit.status_code == 404


# ============================================================
# 4. OTURUM GEÇMİŞİ
# ============================================================

class TestOturumGecmisi:
    """GET /api/sessions"""

    def test_liste_bosken(self, client, auth_headers, test_branch):
        """Oturum yokken boş liste döner"""
        yanit = client.get(
            f"/api/sessions?branch_id={test_branch.id}",
            headers=auth_headers,
        )
        assert yanit.status_code == 200
        assert yanit.json()["total"] == 0

    def test_oturumlar_listelenir(self, client, auth_headers, test_branch, cashier_user, db):
        """Oturumlar listelenir"""
        for i in range(3):
            o = KasaSession(
                branch_id=test_branch.id,
                cashier_id=cashier_user.id,
                opening_amount=100.0 * (i + 1),
            )
            db.add(o)
        db.commit()

        yanit = client.get(
            f"/api/sessions?branch_id={test_branch.id}",
            headers=auth_headers,
        )
        assert yanit.status_code == 200
        assert yanit.json()["total"] == 3

    def test_kasiyer_goremez(self, client, cashier_headers, test_branch):
        """Kasiyer oturum geçmişine erişemez → 403"""
        yanit = client.get(
            f"/api/sessions?branch_id={test_branch.id}",
            headers=cashier_headers,
        )
        assert yanit.status_code == 403


# ============================================================
# 5. Z RAPORU (Kapalı oturum için)
# ============================================================

class TestZRaporu:
    """GET /api/sessions/{id}/z-report"""

    def test_z_raporu_getirilir(self, client, auth_headers, test_branch, cashier_user, db):
        """Kapalı oturumun Z raporu getirilir"""
        from datetime import datetime, timezone
        oturum = KasaSession(
            branch_id=test_branch.id,
            cashier_id=cashier_user.id,
            opening_amount=200.0,
            closing_amount=210.0,
            closed_at=datetime.now(timezone.utc),
        )
        db.add(oturum)
        db.commit()
        db.refresh(oturum)

        yanit = client.get(
            f"/api/sessions/{oturum.id}/z-report",
            headers=auth_headers,
        )
        assert yanit.status_code == 200
        veri = yanit.json()
        assert veri["session_id"] == oturum.id
        assert float(veri["acilis_tutari"]) == 200.0
        assert float(veri["kapanis_tutari"]) == 210.0

    def test_olmayan_oturum(self, client, auth_headers):
        """Olmayan oturum → 404"""
        yanit = client.get("/api/sessions/99999/z-report", headers=auth_headers)
        assert yanit.status_code == 404

    def test_kasiyer_erisemez(self, client, cashier_headers, test_branch, cashier_user, db):
        """Kasiyer Z raporuna erişemez → 403"""
        oturum = KasaSession(
            branch_id=test_branch.id,
            cashier_id=cashier_user.id,
            opening_amount=100.0,
        )
        db.add(oturum)
        db.commit()
        db.refresh(oturum)

        yanit = client.get(
            f"/api/sessions/{oturum.id}/z-report",
            headers=cashier_headers,
        )
        assert yanit.status_code == 403
