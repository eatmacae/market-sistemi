"""
Market Yönetim Sistemi — Satış Testleri
Satış oluşturma, listeleme, iptal, stok düşümü, oturum kontrolü
"""

import pytest
from models import Session as KasaSession, Sale


# ============================================================
# FIXTURE — Kasa Oturumu
# ============================================================

@pytest.fixture
def kasa_oturumu(db, test_branch, cashier_user):
    """Açık kasa oturumu oluşturur"""
    oturum = KasaSession(
        branch_id      = test_branch.id,
        cashier_id     = cashier_user.id,
        opening_amount = 500.00,
    )
    db.add(oturum)
    db.commit()
    db.refresh(oturum)
    return oturum


# ============================================================
# 1. SATIŞ OLUŞTURMA
# ============================================================

class TestSatisOlustur:
    """POST /api/sales"""

    def test_gecerli_satis(self, client, cashier_headers, kasa_oturumu, test_product, test_branch):
        """Geçerli veriyle satış oluşturulur"""
        yanit = client.post("/api/sales", headers=cashier_headers, json={
            "session_id"  : kasa_oturumu.id,
            "branch_id"   : test_branch.id,
            "payment_type": "cash",
            "cash_given"  : 20.0,
            "items"       : [{
                "product_id": test_product.id,
                "qty"       : "1",
                "unit_price": str(test_product.price),
                "discount"  : "0",
            }],
        })
        assert yanit.status_code == 201
        veri = yanit.json()
        assert veri["status"] == "completed"
        assert float(veri["total"]) > 0

    def test_stok_dusuyor(self, client, cashier_headers, kasa_oturumu, test_product, test_branch, db):
        """Satış sonrası stok azalır"""
        stok_onceki = test_product.stock_qty

        client.post("/api/sales", headers=cashier_headers, json={
            "session_id"  : kasa_oturumu.id,
            "branch_id"   : test_branch.id,
            "payment_type": "cash",
            "cash_given"  : 30.0,
            "items"       : [{
                "product_id": test_product.id,
                "qty"       : "2",
                "unit_price": str(test_product.price),
                "discount"  : "0",
            }],
        })

        from models import Product
        db.expire_all()
        guncellendi = db.get(Product, test_product.id)
        assert guncellendi.stock_qty == stok_onceki - 2

    def test_kapali_oturum_satis_yapamaz(self, client, cashier_headers, test_product, test_branch):
        """Kapalı/olmayan oturum ile satış → 400"""
        yanit = client.post("/api/sales", headers=cashier_headers, json={
            "session_id"  : 99999,
            "branch_id"   : test_branch.id,
            "payment_type": "cash",
            "items"       : [{
                "product_id": test_product.id,
                "qty"       : "1",
                "unit_price": str(test_product.price),
                "discount"  : "0",
            }],
        })
        assert yanit.status_code == 400

    def test_yetersiz_stok(self, client, cashier_headers, kasa_oturumu, test_product, test_branch):
        """Stoktan fazla satış → 400"""
        yanit = client.post("/api/sales", headers=cashier_headers, json={
            "session_id"  : kasa_oturumu.id,
            "branch_id"   : test_branch.id,
            "payment_type": "cash",
            "items"       : [{
                "product_id": test_product.id,
                "qty"       : "9999",
                "unit_price": str(test_product.price),
                "discount"  : "0",
            }],
        })
        assert yanit.status_code == 400

    def test_olmayan_urun(self, client, cashier_headers, kasa_oturumu, test_branch):
        """Olmayan ürün ile satış → 400"""
        yanit = client.post("/api/sales", headers=cashier_headers, json={
            "session_id"  : kasa_oturumu.id,
            "branch_id"   : test_branch.id,
            "payment_type": "cash",
            "items"       : [{
                "product_id": 99999,
                "qty"       : "1",
                "unit_price": "10.0",
                "discount"  : "0",
            }],
        })
        assert yanit.status_code == 400

    def test_token_olmadan(self, client, kasa_oturumu, test_product, test_branch):
        """Token olmadan satış → 401"""
        yanit = client.post("/api/sales", json={
            "session_id"  : kasa_oturumu.id,
            "branch_id"   : test_branch.id,
            "payment_type": "cash",
            "items"       : [{
                "product_id": test_product.id,
                "qty"       : "1",
                "unit_price": str(test_product.price),
                "discount"  : "0",
            }],
        })
        assert yanit.status_code == 401

    def test_kart_odeme(self, client, cashier_headers, kasa_oturumu, test_product, test_branch):
        """Kart ödemeli satış"""
        yanit = client.post("/api/sales", headers=cashier_headers, json={
            "session_id"  : kasa_oturumu.id,
            "branch_id"   : test_branch.id,
            "payment_type": "card",
            "items"       : [{
                "product_id": test_product.id,
                "qty"       : "1",
                "unit_price": str(test_product.price),
                "discount"  : "0",
            }],
        })
        assert yanit.status_code == 201
        assert yanit.json()["payment_type"] == "card"


# ============================================================
# 2. SATIŞ LİSTELE / GETİR
# ============================================================

class TestSatisGetir:
    """GET /api/sales ve GET /api/sales/{id}"""

    def _satis_olustur(self, client, headers, oturum, urun, branch_id):
        yanit = client.post("/api/sales", headers=headers, json={
            "session_id"  : oturum.id,
            "branch_id"   : branch_id,
            "payment_type": "cash",
            "cash_given"  : 20.0,
            "items"       : [{
                "product_id": urun.id,
                "qty"       : "1",
                "unit_price": str(urun.price),
                "discount"  : "0",
            }],
        })
        return yanit.json()

    def test_satis_getir(self, client, cashier_headers, auth_headers, kasa_oturumu, test_product, test_branch):
        """Oluşturulan satış ID ile getirilir"""
        satis = self._satis_olustur(client, cashier_headers, kasa_oturumu, test_product, test_branch.id)
        yanit = client.get(f"/api/sales/{satis['id']}", headers=auth_headers)
        assert yanit.status_code == 200
        assert yanit.json()["id"] == satis["id"]

    def test_olmayan_satis(self, client, auth_headers):
        """Olmayan satış → 404"""
        yanit = client.get("/api/sales/99999", headers=auth_headers)
        assert yanit.status_code == 404

    def test_satis_listele(self, client, cashier_headers, auth_headers, kasa_oturumu, test_product, test_branch):
        """Satışlar listelenir"""
        self._satis_olustur(client, cashier_headers, kasa_oturumu, test_product, test_branch.id)
        yanit = client.get(
            f"/api/sales?branch_id={test_branch.id}",
            headers=auth_headers
        )
        assert yanit.status_code == 200
        assert len(yanit.json()) >= 1


# ============================================================
# 3. SATIŞ İPTAL
# ============================================================

class TestSatisIptal:
    """POST /api/sales/{id}/cancel"""

    def test_satis_iptal(self, client, cashier_headers, auth_headers, kasa_oturumu, test_product, test_branch, db):
        """Satış iptal edilir, stok geri gelir"""
        stok_onceki = test_product.stock_qty

        # Satış oluştur
        satis_yanit = client.post("/api/sales", headers=cashier_headers, json={
            "session_id"  : kasa_oturumu.id,
            "branch_id"   : test_branch.id,
            "payment_type": "cash",
            "cash_given"  : 20.0,
            "items"       : [{
                "product_id": test_product.id,
                "qty"       : "1",
                "unit_price": str(test_product.price),
                "discount"  : "0",
            }],
        })
        assert satis_yanit.status_code == 201
        satis_id = satis_yanit.json()["id"]

        # İptal et — sebep query param olarak gönderilir
        iptal = client.post(
            f"/api/sales/{satis_id}/cancel?sebep=Test+iptali",
            headers=auth_headers,
        )
        assert iptal.status_code == 200

        # Stok geri geldi mi?
        from models import Product
        db.expire_all()
        guncellendi = db.get(Product, test_product.id)
        assert guncellendi.stock_qty == stok_onceki
