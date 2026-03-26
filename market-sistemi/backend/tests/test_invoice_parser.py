"""
Market Yönetim Sistemi — Invoice Parser Birim Testleri
Excel parse, match_product, calculate_unit_cost, suggest_sale_price
PDF parse Claude API gerektirdiğinden test dışı bırakılmıştır.
"""

import pytest
import io


# ============================================================
# YARDIMCI
# ============================================================

def _excel_bytes(satirlar: list[dict]) -> bytes:
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    if satirlar:
        ws.append(list(satirlar[0].keys()))
        for s in satirlar:
            ws.append(list(s.values()))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ============================================================
# 1. EXCEL PARSE
# ============================================================

class TestExcelParse:
    """services.invoice_parser._parse_excel"""

    def test_temel_satirlar_okunur(self):
        """Türkçe sütun başlıklı Excel okunur"""
        from services.invoice_parser import _parse_excel
        xlsx = _excel_bytes([
            {"ürün adı": "Çay 500g", "miktar": 10, "birim fiyat": 8.5, "tutar": 85.0},
            {"ürün adı": "Şeker 1kg", "miktar": 5,  "birim fiyat": 12.0, "tutar": 60.0},
        ])
        satirlar = _parse_excel(xlsx)
        assert len(satirlar) == 2
        assert satirlar[0]["name"] == "Çay 500g"
        assert satirlar[0]["qty"] == 10.0
        assert satirlar[0]["unit_cost"] == 8.5
        assert satirlar[0]["line_total"] == 85.0

    def test_ingilizce_sutun_basligi(self):
        """İngilizce sütun başlıklı Excel de okunur"""
        from services.invoice_parser import _parse_excel
        xlsx = _excel_bytes([
            {"product": "Sugar", "quantity": 3, "unit price": 5.0, "total": 15.0},
        ])
        satirlar = _parse_excel(xlsx)
        assert len(satirlar) == 1
        assert satirlar[0]["name"] == "Sugar"
        assert satirlar[0]["qty"] == 3.0

    def test_bos_satirlar_atlanir(self):
        """Boş satırlar parse sonucuna dahil edilmez"""
        from services.invoice_parser import _parse_excel
        xlsx = _excel_bytes([
            {"ürün adı": "Ürün 1", "miktar": 1, "tutar": 5.0},
            {"ürün adı": "",        "miktar": 0, "tutar": 0.0},
            {"ürün adı": "Ürün 2", "miktar": 2, "tutar": 10.0},
        ])
        satirlar = _parse_excel(xlsx)
        assert len(satirlar) == 2

    def test_urun_adi_sutunu_yoksa_hata(self):
        """Ürün adı sütunu yoksa ValueError fırlatır"""
        from services.invoice_parser import _parse_excel
        xlsx = _excel_bytes([
            {"fiyat": 10.0, "miktar": 5},
        ])
        with pytest.raises(ValueError, match="ürün adı sütunu bulunamadı"):
            _parse_excel(xlsx)

    def test_barkod_okunur(self):
        """Barkod sütunu varsa okunur"""
        from services.invoice_parser import _parse_excel
        xlsx = _excel_bytes([
            {"ürün adı": "Test", "barkod": "8690001234567", "miktar": 1, "tutar": 5.0},
        ])
        satirlar = _parse_excel(xlsx)
        assert satirlar[0]["barcode"] == "8690001234567"

    def test_eksik_sutunlar_varsayilan(self):
        """Miktar / fiyat sütunu yoksa varsayılan değerler kullanılır"""
        from services.invoice_parser import _parse_excel
        xlsx = _excel_bytes([
            {"ürün adı": "Sadece İsim"},
        ])
        satirlar = _parse_excel(xlsx)
        assert len(satirlar) == 1
        assert satirlar[0]["qty"] == 1.0      # Varsayılan
        assert satirlar[0]["unit_cost"] == 0.0


# ============================================================
# 2. ÜRÜN EŞLEŞTİRME (match_product)
# ============================================================

class TestMatchProduct:
    """services.invoice_parser.match_product"""

    def test_barkod_eslesmesi(self, db, test_branch, test_product):
        """Barkodla tam eşleşme — match_type=barcode, confidence=100"""
        from services.invoice_parser import match_product
        satir = {"name": "Farklı Ad", "barcode": test_product.barcode}
        urun, tip, guven = match_product(db, satir, test_branch.id)
        assert urun is not None
        assert urun.id == test_product.id
        assert tip == "barcode"
        assert guven == 100

    def test_fuzzy_eslesmesi(self, db, test_branch, test_product):
        """İsim benzerliği yüksekse fuzzy eşleşme döner"""
        from services.invoice_parser import match_product
        # test_product.name ile çok benzer bir isim
        satir = {"name": test_product.name, "barcode": None}
        urun, tip, guven = match_product(db, satir, test_branch.id)
        assert urun is not None
        assert tip in ("barcode", "fuzzy")
        assert guven >= 80

    def test_eslesme_yok(self, db, test_branch):
        """Hiç eşleşme yoksa unmatched döner"""
        from services.invoice_parser import match_product
        satir = {"name": "XYZ123 Bilinmeyen Ürün QWERTY", "barcode": None}
        urun, tip, guven = match_product(db, satir, test_branch.id)
        assert urun is None
        assert tip == "unmatched"
        assert guven == 0

    def test_bos_veritabani(self, db, test_branch):
        """DB'de ürün yoksa unmatched döner"""
        from services.invoice_parser import match_product
        satir = {"name": "Herhangi Ürün", "barcode": "999999"}
        urun, tip, guven = match_product(db, satir, test_branch.id)
        assert urun is None
        assert tip == "unmatched"


# ============================================================
# 3. BİRİM MALİYETİ (calculate_unit_cost)
# ============================================================

class TestCalculateUnitCost:
    """services.invoice_parser.calculate_unit_cost"""

    def test_direkt_birim(self):
        """Adet biriminde tutar / miktar"""
        from services.invoice_parser import calculate_unit_cost
        sonuc = calculate_unit_cost(line_total=100.0, qty=10, unit="adet", multipliers={})
        assert sonuc == pytest.approx(10.0)

    def test_koli_carpani(self):
        """Koli = 24 adet → birim maliyet = tutar / (qty × 24)"""
        from services.invoice_parser import calculate_unit_cost
        sonuc = calculate_unit_cost(
            line_total=240.0, qty=1, unit="koli",
            multipliers={"koli": 24}
        )
        assert sonuc == pytest.approx(10.0)   # 240 / (1×24)

    def test_paket_carpani(self):
        """Paket = 6 adet → 60 / (2×6) = 5.0"""
        from services.invoice_parser import calculate_unit_cost
        sonuc = calculate_unit_cost(
            line_total=60.0, qty=2, unit="paket",
            multipliers={"paket": 6}
        )
        assert sonuc == pytest.approx(5.0)

    def test_sifir_miktar_korumasi(self):
        """Miktar 0 ise sıfır döner (ZeroDivisionError olmaz)"""
        from services.invoice_parser import calculate_unit_cost
        sonuc = calculate_unit_cost(line_total=50.0, qty=0, unit="adet", multipliers={})
        assert sonuc == 0.0

    def test_bilinmeyen_birim_direkt_hesap(self):
        """Multipliers'da olmayan birim direkt tutar/miktar hesabı yapar"""
        from services.invoice_parser import calculate_unit_cost
        sonuc = calculate_unit_cost(
            line_total=90.0, qty=3, unit="kasa",
            multipliers={}   # kasa tanımlı değil
        )
        assert sonuc == pytest.approx(30.0)


# ============================================================
# 4. FİYAT MOTORU (suggest_sale_price)
# ============================================================

class TestSuggestSalePrice:
    """services.invoice_parser.suggest_sale_price"""

    def test_yuzde_yirmi_marj(self):
        """Varsayılan %20 marj"""
        from services.invoice_parser import suggest_sale_price
        sonuc = suggest_sale_price(new_cost=10.0)
        assert sonuc == pytest.approx(12.0)

    def test_ozel_marj(self):
        """%50 marj ile hesap"""
        from services.invoice_parser import suggest_sale_price
        sonuc = suggest_sale_price(new_cost=10.0, margin_percent=50.0)
        assert sonuc == pytest.approx(15.0)

    def test_sifir_maliyet(self):
        """Maliyet 0 ise fiyat 0 döner"""
        from services.invoice_parser import suggest_sale_price
        sonuc = suggest_sale_price(new_cost=0.0)
        assert sonuc == 0.0

    def test_yuvarlanma(self):
        """Sonuç 2 ondalıklı yuvarlanır — 3.33 * 1.20 = 3.996 → round → 4.0"""
        from services.invoice_parser import suggest_sale_price
        sonuc = suggest_sale_price(new_cost=3.33, margin_percent=20.0)
        assert sonuc == pytest.approx(4.0, abs=0.01)
        assert round(sonuc, 2) == sonuc  # 2 ondalık basamak garantisi


# ============================================================
# 5. NaN KONTROLÜ (_nan yardımcı)
# ============================================================

class TestNanKontrol:
    """services.invoice_parser._nan"""

    def test_float_nan(self):
        import math
        from services.invoice_parser import _nan
        assert _nan(math.nan) == True

    def test_gecerli_sayi(self):
        from services.invoice_parser import _nan
        assert _nan(10.5) == False

    def test_none_degeri(self):
        from services.invoice_parser import _nan
        assert _nan(None) == True

    def test_nan_string(self):
        from services.invoice_parser import _nan
        assert _nan("nan") == True

    def test_normal_string(self):
        """Normal string NaN değildir — False döner"""
        from services.invoice_parser import _nan
        assert _nan("test") == False   # "test" NaN/None/empty içinde değil


# ============================================================
# 6. DOSYA TÜRÜ YÖNLENDIRME (parse_invoice)
# ============================================================

class TestParseInvoice:
    """services.invoice_parser.parse_invoice — birim dönüşümü"""

    def test_gecersiz_tur_hata(self, db):
        """Geçersiz file_type → ValueError"""
        import asyncio
        from services.invoice_parser import parse_invoice
        with pytest.raises(ValueError, match="Desteklenmeyen"):
            asyncio.run(parse_invoice(db=db, file_bytes=b"", file_type="csv"))

    def test_excel_yonlendirilir(self, db, test_branch):
        """xlsx → _parse_excel çağrılır, satırlar döner"""
        import asyncio
        import openpyxl
        from services.invoice_parser import parse_invoice
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["ürün adı", "miktar", "tutar"])
        ws.append(["Test Ürün", 5, 50.0])
        buf = io.BytesIO()
        wb.save(buf)

        satirlar = asyncio.run(parse_invoice(
            db=db, file_bytes=buf.getvalue(),
            file_type="xlsx", branch_id=test_branch.id,
        ))
        assert len(satirlar) == 1
        assert satirlar[0]["name"] == "Test Ürün"
