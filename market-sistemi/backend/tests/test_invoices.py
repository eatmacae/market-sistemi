"""
Market Yönetim Sistemi — Fatura Testleri
Fatura listeleme, önizleme (dosya yükleme), onay, rollback, RBAC
"""

import pytest
import io
from models import Invoice, Product


# ============================================================
# YARDIMCI: Minimal Excel dosyası oluştur (pandas gerektirmez)
# ============================================================

def _excel_bytes(rows: list[dict]) -> bytes:
    """
    Basit xlsx içeriği openpyxl ile üretir.
    rows: [{"ürün adı": "...", "miktar": 1, "birim fiyat": 10.0, "tutar": 10.0}]
    """
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    if rows:
        ws.append(list(rows[0].keys()))
        for row in rows:
            ws.append(list(row.values()))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ============================================================
# 1. FATURA LİSTELE
# ============================================================

class TestFaturaListele:
    """GET /api/invoices"""

    def test_bos_liste(self, client, auth_headers, test_branch):
        """Fatura yokken boş liste döner"""
        yanit = client.get(
            f"/api/invoices?branch_id={test_branch.id}",
            headers=auth_headers,
        )
        assert yanit.status_code == 200
        veri = yanit.json()
        assert "total" in veri
        assert "items" in veri
        assert veri["total"] == 0

    def test_faturalar_listelenir(self, client, auth_headers, test_branch, admin_user, db):
        """Oluşturulan faturalar listelenir"""
        fatura = Invoice(
            branch_id=test_branch.id,
            file_name="test.xlsx",
            file_type="xlsx",
            status="pending",
            uploaded_by=admin_user.id,
        )
        db.add(fatura)
        db.commit()

        yanit = client.get(
            f"/api/invoices?branch_id={test_branch.id}",
            headers=auth_headers,
        )
        assert yanit.status_code == 200
        assert yanit.json()["total"] >= 1

    def test_durum_filtresi(self, client, auth_headers, test_branch, admin_user, db):
        """status_filter parametresi çalışır"""
        for st in ("pending", "approved", "pending"):
            db.add(Invoice(
                branch_id=test_branch.id,
                file_name=f"f-{st}.xlsx",
                file_type="xlsx",
                status=st,
                uploaded_by=admin_user.id,
            ))
        db.commit()

        yanit = client.get(
            f"/api/invoices?branch_id={test_branch.id}&status_filter=pending",
            headers=auth_headers,
        )
        assert yanit.status_code == 200
        for item in yanit.json()["items"]:
            assert item["status"] == "pending"

    def test_token_olmadan(self, client, test_branch):
        """Token olmadan → 401"""
        yanit = client.get(f"/api/invoices?branch_id={test_branch.id}")
        assert yanit.status_code == 401


# ============================================================
# 2. FATURA ÖNİZLEME (Dosya yükleme)
# ============================================================

class TestFaturaOnizleme:
    """POST /api/invoices/preview"""

    def test_excel_onizleme(self, client, auth_headers, test_branch, test_product):
        """Excel fatura yükleme önizlemesi çalışır"""
        xlsx = _excel_bytes([{
            "ürün adı"  : "Test Ürünü",
            "miktar"    : 10,
            "birim fiyat": 5.0,
            "tutar"     : 50.0,
        }])

        yanit = client.post(
            f"/api/invoices/preview?branch_id={test_branch.id}",
            headers=auth_headers,
            files={"file": ("fatura.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert yanit.status_code == 200
        veri = yanit.json()
        assert "invoice_id" in veri
        assert "onizleme" in veri
        assert veri["satir_sayisi"] >= 1

    def test_gecersiz_dosya_turu(self, client, auth_headers, test_branch):
        """Desteklenmeyen dosya türü → 400"""
        yanit = client.post(
            f"/api/invoices/preview?branch_id={test_branch.id}",
            headers=auth_headers,
            files={"file": ("fatura.txt", b"test icerik", "text/plain")},
        )
        assert yanit.status_code == 400

    def test_bos_excel(self, client, auth_headers, test_branch):
        """Ürün adı sütunu olmayan Excel → 422"""
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["kol1", "kol2"])
        ws.append(["val1", "val2"])
        buf = io.BytesIO()
        wb.save(buf)

        yanit = client.post(
            f"/api/invoices/preview?branch_id={test_branch.id}",
            headers=auth_headers,
            files={"file": ("bos.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert yanit.status_code == 422

    def test_kasiyer_yukleme_yapamaz(self, client, cashier_headers, test_branch):
        """Kasiyer fatura yükleyemez → 403"""
        xlsx = _excel_bytes([{"ürün adı": "Test", "miktar": 1, "tutar": 10.0}])
        yanit = client.post(
            f"/api/invoices/preview?branch_id={test_branch.id}",
            headers=cashier_headers,
            files={"file": ("f.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert yanit.status_code == 403

    def test_token_olmadan(self, client, test_branch):
        """Token olmadan → 401"""
        xlsx = _excel_bytes([{"ürün adı": "Test", "miktar": 1, "tutar": 10.0}])
        yanit = client.post(
            f"/api/invoices/preview?branch_id={test_branch.id}",
            files={"file": ("f.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert yanit.status_code == 401

    def test_onizleme_esleme_sonuclari(self, client, auth_headers, test_branch, test_product, db):
        """Barkodlu satır barcode match döner"""
        xlsx = _excel_bytes([{
            "ürün adı": test_product.name,
            "barkod"  : test_product.barcode or "",
            "miktar"  : 5,
            "tutar"   : 25.0,
        }])

        yanit = client.post(
            f"/api/invoices/preview?branch_id={test_branch.id}",
            headers=auth_headers,
            files={"file": ("f.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert yanit.status_code == 200
        onizleme = yanit.json()["onizleme"]
        assert len(onizleme) >= 1

    def test_onizleme_invoice_kaydi_olusur(self, client, auth_headers, test_branch, test_product, db):
        """Önizleme sonrası Invoice kaydı DB'de oluşur"""
        xlsx = _excel_bytes([{"ürün adı": "Test", "miktar": 1, "tutar": 5.0}])
        yanit = client.post(
            f"/api/invoices/preview?branch_id={test_branch.id}",
            headers=auth_headers,
            files={"file": ("test.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert yanit.status_code == 200
        invoice_id = yanit.json()["invoice_id"]

        db.expire_all()
        fatura = db.get(Invoice, invoice_id)
        assert fatura is not None
        assert fatura.status == "pending"


# ============================================================
# 3. FATURA ONAYLA
# ============================================================

class TestFaturaOnayla:
    """POST /api/invoices/{id}/approve"""

    def _onizle(self, client, headers, branch_id, urun_adi="OnayTest"):
        xlsx = _excel_bytes([{"ürün adı": urun_adi, "miktar": 5, "tutar": 50.0}])
        yanit = client.post(
            f"/api/invoices/preview?branch_id={branch_id}",
            headers=headers,
            files={"file": ("f.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        return yanit.json()

    def test_onay_basarili(self, client, auth_headers, test_branch, test_product):
        """Fatura onaylanır"""
        oniz = self._onizle(client, auth_headers, test_branch.id, test_product.name)
        invoice_id = oniz["invoice_id"]

        # Eşleştirmeleri hazırla
        eslestirmeler = [
            {**s, "onaylandi": True, "yeni_fiyat": None}
            for s in oniz["onizleme"]
        ]

        yanit = client.post(
            f"/api/invoices/{invoice_id}/approve",
            headers=auth_headers,
            json=eslestirmeler,
        )
        assert yanit.status_code == 200
        assert yanit.json()["success"] == True

    def test_olmayan_fatura_onayi(self, client, auth_headers):
        """Olmayan fatura → 404"""
        yanit = client.post(
            "/api/invoices/99999/approve",
            headers=auth_headers,
            json=[],
        )
        assert yanit.status_code == 404

    def test_kasiyer_onaylayamaz(self, client, cashier_headers, auth_headers, test_branch, test_product):
        """Kasiyer fatura onaylayamaz → 403"""
        oniz = self._onizle(client, auth_headers, test_branch.id)
        invoice_id = oniz["invoice_id"]
        yanit = client.post(
            f"/api/invoices/{invoice_id}/approve",
            headers=cashier_headers,
            json=[],
        )
        assert yanit.status_code == 403


# ============================================================
# 4. FATURA GERİ AL (Rollback)
# ============================================================

class TestFaturaRollback:
    """POST /api/invoices/{id}/rollback"""

    def test_olmayan_fatura_rollback(self, client, auth_headers):
        """Olmayan fatura rollback → 404"""
        yanit = client.post(
            "/api/invoices/99999/rollback",
            headers=auth_headers,
        )
        assert yanit.status_code == 404

    def test_kasiyer_rollback_yapamaz(self, client, cashier_headers, auth_headers, test_branch, admin_user, db):
        """Kasiyer rollback yapamaz → 403"""
        fatura = Invoice(
            branch_id=test_branch.id,
            file_name="r.xlsx",
            file_type="xlsx",
            status="approved",
            uploaded_by=admin_user.id,
        )
        db.add(fatura)
        db.commit()
        db.refresh(fatura)

        yanit = client.post(
            f"/api/invoices/{fatura.id}/rollback",
            headers=cashier_headers,
        )
        assert yanit.status_code == 403

    def test_zaten_rollback_edilmis(self, client, auth_headers, test_branch, admin_user, db):
        """Zaten rollback edilmiş fatura → 400"""
        fatura = Invoice(
            branch_id=test_branch.id,
            file_name="r2.xlsx",
            file_type="xlsx",
            status="rolled_back",
            uploaded_by=admin_user.id,
        )
        db.add(fatura)
        db.commit()
        db.refresh(fatura)

        yanit = client.post(
            f"/api/invoices/{fatura.id}/rollback",
            headers=auth_headers,
        )
        assert yanit.status_code == 400
