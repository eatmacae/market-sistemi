"""
Market Yönetim Sistemi — Kampanya Motoru
Sepete ürün eklendiğinde aktif kampanyaları kontrol eder ve otomatik uygular.
Desteklenen kampanya tipleri: percent, fixed, buy_x_get_y
"""

from sqlalchemy.orm import Session
from datetime import date
from typing import Optional


def aktif_kampanya_bul(
    db        : Session,
    product_id: int,
    branch_id : int,
    qty       : float,
) -> Optional[dict]:
    """
    Ürün için geçerli aktif kampanya varsa döner.
    Birden fazla kampanya varsa en yüksek indirim sağlayanı seçer.

    Dönüş: {campaign_id, type, value, indirim_tutari, aciklama} | None
    """
    from models import Campaign

    bugun = date.today()

    # Ürüne uygulanabilecek aktif kampanyaları bul
    # NOT: Faz 2'de kampanya–ürün ilişkisi henüz yoktur (Faz 4'te eklenecek)
    # Şimdilik tüm aktif kampanyaları dön (basit hali)
    kampanyalar = db.query(Campaign).filter(
        Campaign.branch_id  == branch_id,
        Campaign.active     == True,
        Campaign.is_deleted == False,
        Campaign.start_date <= bugun,
        Campaign.end_date   >= bugun,
    ).all()

    if not kampanyalar:
        return None

    en_iyi    = None
    max_indirim = 0

    for k in kampanyalar:
        indirim = _hesapla_indirim(k, qty)
        if indirim > max_indirim:
            max_indirim = indirim
            en_iyi = k

    if not en_iyi or max_indirim == 0:
        return None

    return {
        "campaign_id"   : en_iyi.id,
        "type"          : en_iyi.type,
        "value"         : float(en_iyi.value),
        "indirim_tutari": round(max_indirim, 2),
        "aciklama"      : _aciklama_uret(en_iyi),
    }


def _hesapla_indirim(kampanya, qty: float) -> float:
    """
    Kampanya tipine göre indirim tutarını hesaplar.
    Minimum miktar sağlanmıyorsa 0 döner.
    """
    if qty < kampanya.min_qty:
        return 0.0

    if kampanya.type == "percent":
        # Yüzde indirim — birim fiyat üzerinden hesaplanır
        # Gerçek tutar satış endpoint'inde hesaplanır
        return float(kampanya.value)   # % olarak döner

    elif kampanya.type == "fixed":
        # Sabit indirim tutarı
        return float(kampanya.value)

    elif kampanya.type == "buy_x_get_y":
        # X al Y öde: bedava adet sayısını döner
        set_sayisi = int(qty / kampanya.min_qty)
        return float(set_sayisi * kampanya.free_qty)

    return 0.0


def _aciklama_uret(kampanya) -> str:
    """Kampanya açıklaması oluşturur — fiş ve ekranda gösterilir."""
    if kampanya.type == "percent":
        return f"%{kampanya.value} indirim"
    elif kampanya.type == "fixed":
        return f"{kampanya.value}₺ indirim"
    elif kampanya.type == "buy_x_get_y":
        return f"{kampanya.min_qty} al {kampanya.min_qty - kampanya.free_qty} öde"
    return kampanya.name or "Kampanya"


def sepete_kampanya_uygula(
    db          : Session,
    sepet_items : list[dict],
    branch_id   : int,
) -> list[dict]:
    """
    Tüm sepet için kampanya kontrolü yapar.
    Her satır için {campaign_id, indirim_tutari} ekler.

    sepet_items formatı:
    [{product_id, qty, unit_price, ...}, ...]

    Dönen liste aynı formatta, indirim alanları doldurulmuş.
    """
    sonuc = []
    for item in sepet_items:
        kampanya = aktif_kampanya_bul(
            db         = db,
            product_id = item["product_id"],
            branch_id  = branch_id,
            qty        = item["qty"],
        )

        if kampanya:
            if kampanya["type"] == "percent":
                # Yüzde indirim: birim_fiyat × miktar × oran
                indirim = item["unit_price"] * item["qty"] * (kampanya["value"] / 100)
            elif kampanya["type"] == "buy_x_get_y":
                # Bedava adet × birim fiyat
                indirim = kampanya["indirim_tutari"] * item["unit_price"]
            else:
                indirim = kampanya["indirim_tutari"]

            item = {
                **item,
                "campaign_id"   : kampanya["campaign_id"],
                "discount"      : round(indirim, 2),
                "kampanya_aciklama": kampanya["aciklama"],
            }
        else:
            item = {**item, "campaign_id": None, "discount": item.get("discount", 0)}

        sonuc.append(item)

    return sonuc
