"""
Market Yönetim Sistemi — Akıllı Fatura Ayrıştırıcı
PDF / Excel / Word faturalarını okur, ürünleri otomatik eşleştirir,
stok ve fiyatları günceller. Hatalı yükleme audit log ile rollback edilir.
"""

from sqlalchemy.orm import Session
from typing import Optional
import io
import os


# ============================================================
# ANA FONKSİYON: Faturayı oku ve satır listesi döndür
# ============================================================

async def parse_invoice(
    db        : Session,
    file_bytes: bytes,
    file_type : str,   # "pdf" | "xlsx" | "docx"
    branch_id : int = 1,
) -> list[dict]:
    """
    Fatura dosyasını okur ve satır listesi döndürür.
    Her satır: {name, barcode, qty, unit, unit_cost, line_total}

    Döndürülen liste henüz onaylanmamıştır.
    Kullanıcı onayladıktan sonra apply_invoice() çağrılır.
    """
    if file_type == "pdf":
        return await _parse_pdf(file_bytes)
    elif file_type in ("xlsx", "xls"):
        return _parse_excel(file_bytes)
    elif file_type == "docx":
        return _parse_docx(file_bytes)
    else:
        raise ValueError(f"Desteklenmeyen dosya türü: {file_type}")


# ============================================================
# PDF PARSE (Claude API)
# ============================================================

async def _parse_pdf(file_bytes: bytes) -> list[dict]:
    """
    PDF faturayı Claude API ile ayrıştırır.
    Claude, tablolardaki ürün adı / barkod / miktar / fiyat sütunlarını çeker.
    """
    import anthropic
    import base64
    import json

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY bulunamadı. PDF parse için .env dosyasına ekleyin."
        )

    client  = anthropic.Anthropic(api_key=api_key)
    b64_pdf = base64.standard_b64encode(file_bytes).decode("utf-8")

    # Claude'a fatura formatını JSON olarak döndürmesini söyle
    prompt = """Bu fatura belgesindeki tüm ürün satırlarını JSON listesi olarak döndür.
Her satır için şu alanları çıkar:
- name: ürün adı (string)
- barcode: barkod varsa (string veya null)
- qty: miktar (sayı)
- unit: birim (adet/kg/lt/koli vb.)
- unit_cost: birim alış fiyatı (sayı)
- line_total: satır toplamı (sayı)

Sadece JSON array döndür, başka açıklama ekleme.
Örnek: [{"name":"Süt 1L","barcode":"8690123456789","qty":24,"unit":"adet","unit_cost":12.50,"line_total":300.00}]
"""

    yanit = client.messages.create(
        model      = "claude-opus-4-6",
        max_tokens = 4096,
        messages   = [{
            "role"   : "user",
            "content": [
                {
                    "type"  : "document",
                    "source": {
                        "type"      : "base64",
                        "media_type": "application/pdf",
                        "data"      : b64_pdf,
                    },
                },
                {"type": "text", "text": prompt},
            ],
        }],
    )

    json_metin = yanit.content[0].text.strip()

    # JSON temizle (bazen ```json ``` bloğu içinde gelir)
    if json_metin.startswith("```"):
        json_metin = json_metin.split("```")[1]
        if json_metin.startswith("json"):
            json_metin = json_metin[4:]

    satirlar = json.loads(json_metin)
    return satirlar


# ============================================================
# EXCEL PARSE (Pandas)
# ============================================================

def _parse_excel(file_bytes: bytes) -> list[dict]:
    """
    Excel faturayı pandas ile okur.
    Sütun başlıklarını otomatik tanır (Türkçe/İngilizce varyantları destekler).
    """
    import pandas as pd

    df = pd.read_excel(io.BytesIO(file_bytes))
    df.columns = df.columns.str.lower().str.strip()

    # Sütun eşlemesi — tedarikçiye göre farklı isimler gelebilir
    sutun_esleme = {
        "name"      : ["ürün adı", "ürün", "urun adi", "urun", "açıklama", "aciklama",
                        "product", "description", "name"],
        "barcode"   : ["barkod", "barkod no", "barcode", "ean", "gtin"],
        "qty"       : ["miktar", "adet", "qty", "quantity", "amount"],
        "unit"      : ["birim", "unit", "br"],
        "unit_cost" : ["birim fiyat", "birim fiyatı", "br fiyat", "unit price",
                        "fiyat", "price", "unit_cost"],
        "line_total": ["tutar", "toplam", "line total", "total", "line_total", "satır tutar"],
    }

    def _bul(alan):
        for aday in sutun_esleme[alan]:
            if aday in df.columns:
                return aday
        return None

    name_col       = _bul("name")
    barcode_col    = _bul("barcode")
    qty_col        = _bul("qty")
    unit_col       = _bul("unit")
    unit_cost_col  = _bul("unit_cost")
    line_total_col = _bul("line_total")

    if not name_col:
        raise ValueError(
            "Excel'de ürün adı sütunu bulunamadı. "
            "Beklenen sütun adları: 'Ürün Adı', 'Ürün', 'Açıklama', 'Product'"
        )

    satirlar = []
    for _, row in df.iterrows():
        ad = str(row[name_col]).strip() if name_col else ""
        if not ad or ad.lower() in ("nan", "none", ""):
            continue  # Boş satırları atla

        satir = {
            "name"      : ad,
            "barcode"   : str(row[barcode_col]).strip() if barcode_col and not _nan(row[barcode_col]) else None,
            "qty"       : float(row[qty_col])       if qty_col       and not _nan(row[qty_col])       else 1.0,
            "unit"      : str(row[unit_col]).strip() if unit_col      and not _nan(row[unit_col])      else "adet",
            "unit_cost" : float(row[unit_cost_col]) if unit_cost_col and not _nan(row[unit_cost_col]) else 0.0,
            "line_total": float(row[line_total_col]) if line_total_col and not _nan(row[line_total_col]) else 0.0,
        }
        satirlar.append(satir)

    return satirlar


def _nan(deger) -> bool:
    """Pandas NaN veya boş değer kontrolü"""
    import math
    try:
        return math.isnan(float(deger))
    except (TypeError, ValueError):
        return str(deger).lower() in ("nan", "none", "")


# ============================================================
# WORD PARSE (python-docx)
# ============================================================

def _parse_docx(file_bytes: bytes) -> list[dict]:
    """
    Word faturayı tablolar üzerinden okur.
    İlk tabloyu fatura tablosu olarak kabul eder.
    """
    from docx import Document

    doc    = Document(io.BytesIO(file_bytes))
    satirlar = []

    for tablo in doc.tables:
        if len(tablo.rows) < 2:
            continue

        # Başlık satırından sütun isimlerini al
        basliklar = [c.text.strip().lower() for c in tablo.rows[0].cells]

        # Ürün adı sütunu var mı?
        if not any(b in basliklar for b in ["ürün adı", "ürün", "açıklama", "product"]):
            continue

        # Sütun indekslerini bul
        def _idx(adaylar):
            for a in adaylar:
                if a in basliklar:
                    return basliklar.index(a)
            return None

        name_idx   = _idx(["ürün adı", "ürün", "açıklama", "product", "name"])
        bar_idx    = _idx(["barkod", "barcode", "ean"])
        qty_idx    = _idx(["miktar", "adet", "qty", "quantity"])
        unit_idx   = _idx(["birim", "unit"])
        price_idx  = _idx(["birim fiyat", "fiyat", "unit price", "price"])
        total_idx  = _idx(["tutar", "toplam", "total"])

        for satir in tablo.rows[1:]:
            huc = [c.text.strip() for c in satir.cells]

            ad = huc[name_idx].strip() if name_idx is not None else ""
            if not ad:
                continue

            def _sayi(idx):
                if idx is None:
                    return 0.0
                metin = huc[idx].replace("₺", "").replace(",", ".").strip()
                try:
                    return float(metin)
                except ValueError:
                    return 0.0

            satirlar.append({
                "name"      : ad,
                "barcode"   : huc[bar_idx].strip() if bar_idx is not None else None,
                "qty"       : _sayi(qty_idx) or 1.0,
                "unit"      : huc[unit_idx].strip() if unit_idx is not None else "adet",
                "unit_cost" : _sayi(price_idx),
                "line_total": _sayi(total_idx),
            })

        break  # İlk geçerli tablo yeterli

    return satirlar


# ============================================================
# ÜRÜN EŞLEŞTİRME (Barkod → Fuzzy Match)
# ============================================================

def match_product(db: Session, invoice_item: dict, branch_id: int = 1):
    """
    Fatura satırını veritabanındaki ürünle eşleştirir.
    Önce barkod, sonra fuzzy match, bulamazsa unmatched döner.

    Dönüş: (product | None, match_type, confidence_score)
    """
    from models import Product
    from rapidfuzz import process, fuzz

    # 1. Barkod ile tam eşleşme (en güvenilir)
    barkod = (invoice_item.get("barcode") or "").strip()
    if barkod:
        urun = db.query(Product).filter(
            Product.barcode    == barkod,
            Product.branch_id  == branch_id,
            Product.is_deleted == False,
        ).first()
        if urun:
            return urun, "barcode", 100

    # 2. Fuzzy matching ile ürün adı karşılaştırması
    products = db.query(Product).filter(
        Product.branch_id  == branch_id,
        Product.is_deleted == False,
    ).all()

    if not products:
        return None, "unmatched", 0

    isimler  = [p.name for p in products]
    aranan   = invoice_item.get("name", "").strip()

    eslesen = process.extractOne(
        aranan,
        isimler,
        scorer=fuzz.token_sort_ratio,
    )

    if eslesen and eslesen[1] >= 80:   # %80 benzerlik eşiği
        idx  = isimler.index(eslesen[0])
        return products[idx], "fuzzy", eslesen[1]

    # 3. Eşleşme yok → kullanıcı manuel eşleştirecek
    return None, "unmatched", 0


# ============================================================
# BİRİM DÖNÜŞÜMÜ (Koli → Adet)
# ============================================================

def calculate_unit_cost(
    line_total : float,
    qty        : float,
    unit       : str,
    multipliers: dict,   # {"koli": 24, "paket": 6, ...}
) -> float:
    """
    Birim dönüşümlü birim maliyet hesabı.
    Örnek: 1 koli = 24 adet → birim_maliyet = tutar / (qty × 24)
    """
    unit_lower = unit.lower().strip()

    if unit_lower in multipliers:
        adet_carpani = multipliers[unit_lower]
        return line_total / (qty * adet_carpani)

    # Direkt birim (adet, kg, lt vb.)
    return line_total / qty if qty > 0 else 0.0


# ============================================================
# FİYAT MOTORU (Yeni maliyet → Satış fiyatı önerisi)
# ============================================================

def suggest_sale_price(new_cost: float, margin_percent: float = 20.0) -> float:
    """
    Yeni alış fiyatına göre kar marjı ekleyerek satış fiyatı önerir.
    Varsayılan kar marjı %20.
    """
    return round(new_cost * (1 + margin_percent / 100), 2)


# ============================================================
# FATURA UYGULA (Onaydan sonra stok + fiyat güncelleme)
# ============================================================

async def apply_invoice(
    db          : Session,
    invoice_id  : int,
    eslestirmeler: list[dict],   # match_product sonuçları + onaylı eşleşmeler
    user_id     : int,
    branch_id   : int,
    multipliers : dict = None,   # Birim dönüşüm çarpanları
) -> dict:
    """
    Onaylanan fatura satırlarını uygular:
    1. Stok miktarını artırır (purchase hareketi)
    2. Alış maliyetini günceller
    3. Satış fiyatı önerisini kayıt altına alır
    4. Her değişikliği audit log'a yazar (rollback için)

    eslestirmeler listesi formatı:
    [{
        "invoice_item": {...},
        "product_id": 5,         # Eşleştirilen ürün ID
        "onaylandi": True,
        "yeni_maliyet": 12.50,   # Birim maliyet
        "yeni_fiyat": 15.00,     # Onaylanan satış fiyatı
        "multiplier": 24,        # Koli ise çarpan
    }]
    """
    from models import Product
    from services.stock_service import stok_guncelle
    from services import audit_log as al

    if multipliers is None:
        multipliers = {}

    guncellenen  = 0
    eklenen      = 0
    atlanmis     = 0

    for eslestirme in eslestirmeler:
        if not eslestirme.get("onaylandi"):
            atlanmis += 1
            continue

        product_id = eslestirme.get("product_id")
        if not product_id:
            atlanmis += 1
            continue

        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            atlanmis += 1
            continue

        item        = eslestirme["invoice_item"]
        yeni_maliyet= eslestirme.get("yeni_maliyet")
        yeni_fiyat  = eslestirme.get("yeni_fiyat")
        miktar      = int(item.get("qty", 1))

        # Koli ise çarpa
        multiplier = eslestirme.get("multiplier", 1)
        gercek_miktar = miktar * multiplier

        # Eski değerleri kaydet (rollback için)
        eski_deger = {
            "stock_qty": product.stock_qty,
            "cost"     : float(product.cost) if product.cost else None,
            "price"    : float(product.price),
        }

        # Stok girişi
        stok_guncelle(
            db           = db,
            product      = product,
            hareket_tipi = "purchase",
            miktar       = gercek_miktar,
            user_id      = user_id,
            branch_id    = branch_id,
            note         = f"invoice_{invoice_id}",
        )

        # Maliyet güncellemesi
        if yeni_maliyet and yeni_maliyet > 0:
            product.cost = yeni_maliyet

        # Fiyat güncellemesi (kullanıcı onayladıysa)
        if yeni_fiyat and yeni_fiyat > 0:
            product.price = yeni_fiyat

        db.add(product)

        # Audit log — rollback için invoice_ID notu zorunlu
        al.log_action(
            db          = db,
            action_type = "INVOICE_APPLY",
            user_id     = user_id,
            table_name  = "products",
            record_id   = product.id,
            old_value   = eski_deger,
            new_value   = {
                "stock_qty": product.stock_qty,
                "cost"     : float(product.cost) if product.cost else None,
                "price"    : float(product.price),
            },
            branch_id   = branch_id,
            note        = f"invoice_{invoice_id}",   # Rollback bu nota göre yapılır
        )

        guncellenen += 1

    db.commit()

    return {
        "guncellenen": guncellenen,
        "atlanmis"   : atlanmis,
        "invoice_id" : invoice_id,
    }


# ============================================================
# ROLLBACK (Hatalı fatura geri al)
# ============================================================

async def rollback_invoice(
    db         : Session,
    invoice_id : int,
    user_id    : int,
    branch_id  : int,
) -> dict:
    """
    Fatura uygulamasını geri alır.
    Audit log'daki 'invoice_{invoice_id}' notlu kayıtları bulur,
    eski değerleri geri yükler.
    """
    from models import Product, AuditLog
    from services import audit_log as al

    # Bu faturaya ait tüm değişiklik loglarını bul
    loglar = db.query(AuditLog).filter(
        AuditLog.note      == f"invoice_{invoice_id}",
        AuditLog.action_type == "INVOICE_APPLY",
        AuditLog.branch_id == branch_id,
    ).all()

    if not loglar:
        raise ValueError(
            f"invoice_{invoice_id} için audit log bulunamadı. "
            "Fatura daha önce geri alınmış olabilir."
        )

    geri_alinan = 0
    for log in loglar:
        product = db.query(Product).filter(Product.id == log.record_id).first()
        if not product or not log.old_value:
            continue

        # Eski değerleri geri yükle
        product.stock_qty = log.old_value.get("stock_qty", product.stock_qty)
        if log.old_value.get("cost")  is not None:
            product.cost  = log.old_value["cost"]
        if log.old_value.get("price") is not None:
            product.price = log.old_value["price"]

        db.add(product)

        al.log_action(
            db          = db,
            action_type = "INVOICE_ROLLBACK",
            user_id     = user_id,
            table_name  = "products",
            record_id   = product.id,
            old_value   = log.new_value,
            new_value   = log.old_value,
            branch_id   = branch_id,
            note        = f"rollback_invoice_{invoice_id}",
        )

        geri_alinan += 1

    db.commit()

    return {
        "success"    : True,
        "geri_alinan": geri_alinan,
        "invoice_id" : invoice_id,
        "message"    : f"Fatura {invoice_id} geri alındı. {geri_alinan} ürün eski değerlerine döndü.",
    }
