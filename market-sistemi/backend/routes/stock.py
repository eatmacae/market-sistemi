"""
Market Yönetim Sistemi — Stok Route'ları
Stok hareketleri, düzeltme, fire kaydı, akıllı stok listesi, sipariş önerisi
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, date, timedelta

from database import get_db
from models import Product, StockMovement, Personnel
from schemas import StockMovementResponse
from routes.auth import get_current_user, require_role
from services import audit_log
from services.stock_service import stok_guncelle

router = APIRouter(prefix="/api/stock", tags=["Stok"])


# _stok_guncelle → services/stock_service.py'de merkezi tanım
# Hem bu dosya hem invoice_parser.py aynı servisi kullanır (döngüsel import yok)


# ============================================================
# AKİLLİ STOK LİSTESİ (aciliyet puanı ile sıralı)
# ============================================================

@router.get("/smart-list")
async def smart_stock_list(
    branch_id    : int  = Query(1),
    limit        : int  = Query(100, ge=1, le=500),
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """
    Akıllı stok listesi — her ürüne aciliyet puanı hesaplanır.
    Kritik + çok satılan ürünler en üstte.

    Aciliyet Puanı:
        - Stok kritikliği: (min_stock - stock_qty) / max(min_stock, 1) × 50
        - Satış hızı (son 30 gün): günlük ortalama satış × 30
        - Toplam puan → büyükten küçüğe sıralanır
    """
    from sqlalchemy import select

    products = db.query(Product).filter(
        Product.branch_id  == branch_id,
        Product.is_deleted == False,
    ).all()

    # Son 30 günlük satış hızı hesabı
    otuz_gun_once = datetime.utcnow() - timedelta(days=30)
    satis_hizi = dict(
        db.query(
            StockMovement.product_id,
            func.sum(func.abs(StockMovement.qty_change)).label("toplam"),
        )
        .filter(
            StockMovement.type       == "sale",
            StockMovement.branch_id  == branch_id,
            StockMovement.created_at >= otuz_gun_once,
        )
        .group_by(StockMovement.product_id)
        .all()
    )

    sonuclar = []
    for p in products:
        stok     = p.stock_qty
        min_stok = max(p.min_stock, 1)
        gunluk_satis = (satis_hizi.get(p.id, 0) or 0) / 30

        # Stok durumu
        if stok <= 0:
            durum = "critical"
        elif stok <= min_stok:
            durum = "threshold"
        elif stok <= min_stok * 1.5:
            durum = "adequate"
        else:
            durum = "dormant"

        # Aciliyet puanı hesabı
        kritiklik   = max(0, (min_stok - stok) / min_stok) * 50
        hiz_puani   = min(gunluk_satis * 10, 50)   # Maks 50 puan
        aciliyet    = round(kritiklik + hiz_puani, 1)

        # SKT kontrolü
        skt_uyarisi = None
        if p.expiry_date:
            kalan_gun = (p.expiry_date - date.today()).days
            if kalan_gun <= 7:
                skt_uyarisi = "critical"
            elif kalan_gun <= 30:
                skt_uyarisi = "warning"

        sonuclar.append({
            "id"            : p.id,
            "name"          : p.name,
            "barcode"       : p.barcode,
            "unit"          : p.unit,
            "stock_qty"     : stok,
            "min_stock"     : p.min_stock,
            "price"         : float(p.price),
            "cost"          : float(p.cost) if p.cost else None,
            "shelf_location": p.shelf_location,
            "durum"         : durum,
            "aciliyet_puani": aciliyet,
            "gunluk_satis"  : round(gunluk_satis, 2),
            "skt_uyarisi"   : skt_uyarisi,
            "expiry_date"   : str(p.expiry_date) if p.expiry_date else None,
        })

    # Aciliyet puanına göre sırala
    sonuclar.sort(key=lambda x: x["aciliyet_puani"], reverse=True)

    return sonuclar[:limit]


# ============================================================
# STOK HAREKETİ GEÇMİŞİ
# ============================================================

@router.get("/movements/{product_id}", response_model=List[StockMovementResponse])
async def get_movements(
    product_id   : int,
    limit        : int = Query(50, ge=1, le=200),
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """Ürünün stok hareket geçmişini döner (yeniden eskiye)."""
    return (
        db.query(StockMovement)
        .filter(StockMovement.product_id == product_id)
        .order_by(StockMovement.created_at.desc())
        .limit(limit)
        .all()
    )


# ============================================================
# STOK DÜZELTME (Manuel sayım farkı)
# ============================================================

@router.post("/adjust")
async def adjust_stock(
    request      : Request,
    product_id   : int,
    yeni_miktar  : int,
    sebep        : str,
    branch_id    : int = Query(1),
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin", "warehouse")),
):
    """
    Stok sayımı sonucu manuel düzeltme.
    Fark pozitif veya negatif olabilir.
    Audit log'a kaydedilir.
    """
    product = db.query(Product).filter(
        Product.id         == product_id,
        Product.branch_id  == branch_id,
        Product.is_deleted == False,
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı.")

    eski_miktar = product.stock_qty
    fark        = yeni_miktar - eski_miktar

    if fark == 0:
        return {"success": True, "message": "Stok değişmedi.", "fark": 0}

    hareket = stok_guncelle(
        db           = db,
        product      = product,
        hareket_tipi = "adjust",
        miktar       = fark,
        user_id      = current_user.id,
        branch_id    = branch_id,
        note         = f"Stok düzeltme: {sebep}",
    )
    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "STOCK_ADJUST",
        user_id     = current_user.id,
        table_name  = "products",
        record_id   = product_id,
        old_value   = {"stock_qty": eski_miktar},
        new_value   = {"stock_qty": yeni_miktar, "fark": fark},
        ip_address  = request.client.host if request.client else None,
        branch_id   = branch_id,
        note        = sebep,
    )

    return {
        "success"    : True,
        "eski_miktar": eski_miktar,
        "yeni_miktar": yeni_miktar,
        "fark"       : fark,
        "message"    : f"Stok {'+' if fark > 0 else ''}{fark} adet güncellendi.",
    }


# ============================================================
# FİRE & ZAYİ KAYDI
# ============================================================

@router.post("/waste")
async def record_waste(
    request      : Request,
    product_id   : int,
    miktar       : int,
    sebep        : str,    # skt_gecmis | hasar | calinan | diger
    branch_id    : int = Query(1),
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin", "warehouse")),
):
    """
    Fire/zayi kaydı — stok düşer, hareket 'waste' tipinde loglanır.
    SKT bazlı fire için sebep='skt_gecmis' gönderilir.
    """
    if miktar <= 0:
        raise HTTPException(status_code=400, detail="Fire miktarı pozitif olmalıdır.")

    product = db.query(Product).filter(
        Product.id         == product_id,
        Product.branch_id  == branch_id,
        Product.is_deleted == False,
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı.")

    if product.stock_qty < miktar:
        raise HTTPException(
            status_code = 400,
            detail      = f"Yetersiz stok. Mevcut: {product.stock_qty}, Fire: {miktar}",
        )

    stok_guncelle(
        db           = db,
        product      = product,
        hareket_tipi = "waste",
        miktar       = -miktar,
        user_id      = current_user.id,
        branch_id    = branch_id,
        note         = f"Fire/zayi: {sebep}",
    )
    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "STOCK_WASTE",
        user_id     = current_user.id,
        table_name  = "products",
        record_id   = product_id,
        old_value   = {"stock_qty": product.stock_qty + miktar},
        new_value   = {"stock_qty": product.stock_qty, "fire_miktar": miktar, "sebep": sebep},
        ip_address  = request.client.host if request.client else None,
        branch_id   = branch_id,
        note        = f"Fire: {sebep} — {product.name}",
    )

    return {
        "success": True,
        "message": f"{product.name} → {miktar} adet fire/zayi kaydedildi. Yeni stok: {product.stock_qty}",
    }


# ============================================================
# OTOMATİK SİPARİŞ ÖNERİSİ
# ============================================================

@router.get("/order-suggestions")
async def order_suggestions(
    branch_id    : int = Query(1),
    hedef_gun    : int = Query(15),   # Kaç günlük stok hedefleniyor
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """
    Günlük ortalama satış ve hedef stok gününe göre sipariş önerisi hesaplar.

    Algoritma:
        Günlük ortalama = Son 30 gün satış / 30
        Hedef stok      = Günlük ortalama × hedef_gun
        Eksik miktar    = Hedef stok - Mevcut stok
        Öneri           = Eksik miktar (sadece pozitifler)
    """
    otuz_gun_once = datetime.utcnow() - timedelta(days=30)

    # Son 30 günlük satış hızı
    satis_hizi = dict(
        db.query(
            StockMovement.product_id,
            func.sum(func.abs(StockMovement.qty_change)).label("toplam"),
        )
        .filter(
            StockMovement.type       == "sale",
            StockMovement.branch_id  == branch_id,
            StockMovement.created_at >= otuz_gun_once,
        )
        .group_by(StockMovement.product_id)
        .all()
    )

    # Sadece min_stock eşiğinin altındaki ürünleri dahil et
    products = db.query(Product).filter(
        Product.branch_id  == branch_id,
        Product.is_deleted == False,
        Product.stock_qty  <= Product.min_stock,
    ).all()

    oneriler = []
    for p in products:
        gunluk = (satis_hizi.get(p.id, 0) or 0) / 30
        hedef  = gunluk * hedef_gun
        eksik  = max(0, int(hedef) - p.stock_qty)

        if eksik > 0:
            oneriler.append({
                "product_id"    : p.id,
                "product_name"  : p.name,
                "barcode"       : p.barcode,
                "stock_qty"     : p.stock_qty,
                "min_stock"     : p.min_stock,
                "gunluk_satis"  : round(gunluk, 2),
                "hedef_stok"    : int(hedef),
                "siparis_onerisi": eksik,
                "unit"          : p.unit,
            })

    # En acil önce
    oneriler.sort(key=lambda x: x["stock_qty"] / max(x["min_stock"], 1))

    return {"total": len(oneriler), "items": oneriler}


# ============================================================
# STOK GİRİŞİ (Alım — fatura dışı manuel)
# ============================================================

@router.post("/receive")
async def receive_stock(
    request      : Request,
    product_id   : int,
    miktar       : int,
    maliyet      : Optional[float] = None,   # Birim alış fiyatı (opsiyonel güncelleme)
    not_          : Optional[str]  = None,
    branch_id    : int = Query(1),
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin", "warehouse")),
):
    """Manuel stok girişi — alım faturası dışında doğrudan stok arttırma."""
    if miktar <= 0:
        raise HTTPException(status_code=400, detail="Miktar pozitif olmalıdır.")

    product = db.query(Product).filter(
        Product.id         == product_id,
        Product.branch_id  == branch_id,
        Product.is_deleted == False,
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı.")

    eski_maliyet = float(product.cost) if product.cost else None

    # Maliyet güncellemesi varsa uygula
    if maliyet is not None and maliyet > 0:
        product.cost = maliyet

    stok_guncelle(
        db           = db,
        product      = product,
        hareket_tipi = "purchase",
        miktar       = miktar,
        user_id      = current_user.id,
        branch_id    = branch_id,
        note         = not_ or "Manuel stok girişi",
    )
    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "STOCK_RECEIVE",
        user_id     = current_user.id,
        table_name  = "products",
        record_id   = product_id,
        new_value   = {"miktar": miktar, "maliyet": maliyet},
        ip_address  = request.client.host if request.client else None,
        branch_id   = branch_id,
    )

    return {
        "success"    : True,
        "yeni_stok"  : product.stock_qty,
        "message"    : f"{product.name} → +{miktar} adet girildi. Toplam stok: {product.stock_qty}",
    }
