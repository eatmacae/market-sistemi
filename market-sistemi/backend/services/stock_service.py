"""
Market Yönetim Sistemi — Stok Servis Katmanı
Stok güncelleme mantığı burada — hem routes/stock.py hem services/invoice_parser.py kullanır.
Böylece routes → services tek yönlü kalır, döngüsel import oluşmaz.
"""

from sqlalchemy.orm import Session
from typing import Optional
from models import Product, StockMovement


def stok_guncelle(
    db          : Session,
    product     : Product,
    hareket_tipi: str,
    miktar      : int,    # Pozitif: giriş, Negatif: çıkış
    user_id     : int,
    branch_id   : int,
    note        : Optional[str] = None,
) -> StockMovement:
    """
    Stok miktarını günceller ve hareket kaydı oluşturur.
    Tüm stok değişimleri bu fonksiyon üzerinden geçer.

    Parametreler:
        db           : Veritabanı oturumu
        product      : Güncellenecek ürün nesnesi
        hareket_tipi : sale | purchase | adjust | waste | transfer
        miktar       : Pozitif=giriş, Negatif=çıkış
        user_id      : İşlemi yapan personelin ID'si
        branch_id    : Şube ID'si
        note         : Ek not (rollback için invoice_ID gibi)
    """
    onceki  = product.stock_qty
    sonraki = onceki + miktar

    if sonraki < 0:
        raise ValueError(
            f"Yetersiz stok. Mevcut: {onceki}, İstenen çıkış: {abs(miktar)}"
        )

    product.stock_qty = sonraki
    db.add(product)

    hareket = StockMovement(
        branch_id   = branch_id,
        product_id  = product.id,
        type        = hareket_tipi,
        qty_before  = onceki,
        qty_change  = miktar,
        qty_after   = sonraki,
        note        = note,
        user_id     = user_id,
    )
    db.add(hareket)

    return hareket
