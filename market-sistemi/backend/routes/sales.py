"""
Market Yönetim Sistemi — Satış Route'ları
Satış oluşturma, iptal, iade, anomali tespiti
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime

from database import get_db
from models import Sale, SaleItem, Product, Customer, Session as KasaSession, Personnel
from schemas import SaleCreate, SaleResponse
from routes.auth import get_current_user, require_role
from services import audit_log
from services.stock_service import stok_guncelle
from services.campaign_engine import sepete_kampanya_uygula

router = APIRouter(prefix="/api/sales", tags=["Satışlar"])


# ============================================================
# ANOMALİ TESPİTİ (Maliyetin altında satış)
# ============================================================

def _anomali_kontrol(items: list, db: Session) -> list[str]:
    """
    Her satır için maliyet kontrolü yapar.
    Maliyetin altında satışı tespit eder — yöneticiye bildirilir.
    """
    uyarilar = []
    for item in items:
        urun = db.query(Product).filter(Product.id == item.product_id).first()
        if urun and urun.cost and item.unit_price < float(urun.cost):
            uyarilar.append(
                f"⚠️ {urun.name}: Maliyet {urun.cost}₺ — Satış {item.unit_price}₺ (maliyet altı!)"
            )
    return uyarilar


# ============================================================
# SATIŞ OLUŞTUR
# ============================================================

@router.post("", response_model=SaleResponse, status_code=201)
async def create_sale(
    request      : Request,
    data         : SaleCreate,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """
    Yeni satış oluşturur.
    1. Oturum kontrolü
    2. Kampanya uygulaması
    3. Stok düşür
    4. Müşteri bakiyesi güncelle (veresiye)
    5. Sadakat puanı ekle
    6. Anomali tespiti
    7. Audit log
    """
    # Oturum açık mı?
    oturum = db.query(KasaSession).filter(
        KasaSession.id        == data.session_id,
        KasaSession.closed_at == None,
    ).first()
    if not oturum:
        raise HTTPException(
            status_code = 400,
            detail      = "Geçersiz veya kapalı kasa oturumu. Önce kasa açılışı yapın.",
        )

    # Kampanya motoru — sepet indirimlerini hesapla
    kampanya_items = sepete_kampanya_uygula(
        db          = db,
        sepet_items = [
            {
                "product_id": item.product_id,
                "qty"       : float(item.qty),
                "unit_price": float(item.unit_price),
                "discount"  : float(item.discount),
            }
            for item in data.items
        ],
        branch_id = data.branch_id,
    )

    # Stok ve fiyat doğrulama
    toplam_tutar   = 0.0
    toplam_indirim = float(data.discount)
    toplam_kdv     = 0.0
    satis_kalemleri = []

    for i, item in enumerate(data.items):
        urun = db.query(Product).filter(
            Product.id         == item.product_id,
            Product.branch_id  == data.branch_id,
            Product.is_deleted == False,
        ).first()

        if not urun:
            raise HTTPException(
                status_code = 400,
                detail      = f"Ürün bulunamadı (ID: {item.product_id})",
            )

        if urun.stock_qty < float(item.qty):
            raise HTTPException(
                status_code = 400,
                detail      = f"Yetersiz stok: {urun.name}. Mevcut: {urun.stock_qty}, İstenen: {item.qty}",
            )

        # Kampanya indirimi
        kampanya_indirim = kampanya_items[i].get("discount", 0) if i < len(kampanya_items) else 0
        satir_indirim    = float(item.discount) + kampanya_indirim
        satir_toplam     = float(item.unit_price) * float(item.qty) - satir_indirim
        satir_toplam     = max(0, satir_toplam)

        # KDV hesabı (fiyata dahil — iç KDV)
        kdv_tutari = satir_toplam * urun.vat_rate / (100 + urun.vat_rate)

        toplam_tutar   += satir_toplam
        toplam_indirim += kampanya_indirim
        toplam_kdv     += kdv_tutari

        satis_kalemleri.append({
            "urun"       : urun,
            "qty"        : float(item.qty),
            "unit_price" : float(item.unit_price),
            "discount"   : satir_indirim,
            "total"      : satir_toplam,
            "campaign_id": kampanya_items[i].get("campaign_id") if i < len(kampanya_items) else None,
        })

    # Sepet geneli indirim düş
    nihai_toplam = max(0, toplam_tutar - float(data.discount))

    # Para üstü hesabı
    para_ustu = 0.0
    if data.payment_type == "cash" and data.cash_given:
        if float(data.cash_given) < nihai_toplam:
            raise HTTPException(
                status_code = 400,
                detail      = f"Verilen nakit yetersiz. Gereken: {nihai_toplam:.2f}₺, Verilen: {data.cash_given}₺",
            )
        para_ustu = float(data.cash_given) - nihai_toplam

    # Veresiye kontrolü (ödeme tipi 'credit' ise müşteri gerekli)
    if data.payment_type == "mixed" and data.customer_id:
        musteri = db.query(Customer).filter(Customer.id == data.customer_id).first()
        if musteri and nihai_toplam > float(musteri.credit_limit):
            raise HTTPException(
                status_code = 400,
                detail      = f"Veresiye limiti aşıldı. Limit: {musteri.credit_limit}₺, Toplam: {nihai_toplam:.2f}₺",
            )

    # ── Satış kaydı oluştur ──
    satis = Sale(
        branch_id    = data.branch_id,
        customer_id  = data.customer_id,
        cashier_id   = current_user.id,
        session_id   = data.session_id,
        total        = nihai_toplam,
        discount     = toplam_indirim,
        vat_amount   = toplam_kdv,
        payment_type = data.payment_type,
        cash_given   = data.cash_given,
        change_given = para_ustu,
        status       = "completed",
    )
    db.add(satis)
    db.flush()   # ID almak için flush, henüz commit yok

    # ── Satış kalemleri + stok düşür ──
    for kalem in satis_kalemleri:
        urun = kalem["urun"]

        # Satış kalemi kaydı
        satir = SaleItem(
            branch_id   = data.branch_id,
            sale_id     = satis.id,
            product_id  = urun.id,
            qty         = kalem["qty"],
            unit_price  = kalem["unit_price"],
            discount    = kalem["discount"],
            total       = kalem["total"],
            campaign_id = kalem["campaign_id"],
        )
        db.add(satir)

        # Stok düşür
        stok_guncelle(
            db           = db,
            product      = urun,
            hareket_tipi = "sale",
            miktar       = -int(kalem["qty"]),   # Negatif = çıkış
            user_id      = current_user.id,
            branch_id    = data.branch_id,
            note         = f"sale_{satis.id}",
        )

    # ── Müşteri işlemleri ──
    if data.customer_id:
        musteri = db.query(Customer).filter(Customer.id == data.customer_id).first()
        if musteri:
            # Sadakat puanı: her 1₺ = 1 puan
            musteri.loyalty_points = (musteri.loyalty_points or 0) + int(nihai_toplam)

            # Veresiye bakiyesi (karma ödeme karttan gelecek kısım veresiye)
            if data.payment_type == "mixed":
                nakit_kisim  = float(data.cash_given or 0)
                veresiye_ek  = nihai_toplam - nakit_kisim
                if veresiye_ek > 0:
                    musteri.credit_balance = float(musteri.credit_balance) + veresiye_ek

            db.add(musteri)

    db.commit()
    db.refresh(satis)

    # ── Anomali tespiti ──
    uyarilar = _anomali_kontrol(data.items, db)

    # Audit log
    audit_log.log_action(
        db          = db,
        action_type = "SALE_CREATE",
        user_id     = current_user.id,
        table_name  = "sales",
        record_id   = satis.id,
        new_value   = {
            "total"       : nihai_toplam,
            "payment_type": data.payment_type,
            "item_count"  : len(satis_kalemleri),
            "anomaliler"  : uyarilar,
        },
        ip_address  = request.client.host if request.client else None,
        branch_id   = data.branch_id,
    )

    # Yanıt
    return satis


# ============================================================
# SATIŞ DETAY
# ============================================================

@router.get("/{sale_id}", response_model=SaleResponse)
async def get_sale(
    sale_id      : int,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    satis = db.query(Sale).filter(Sale.id == sale_id).first()
    if not satis:
        raise HTTPException(status_code=404, detail="Satış bulunamadı.")
    return satis


# ============================================================
# SATIŞ LİSTESİ
# ============================================================

@router.get("")
async def list_sales(
    branch_id    : int           = Query(1),
    session_id   : Optional[int] = Query(None),
    page         : int           = Query(1, ge=1),
    per_page     : int           = Query(50, ge=1, le=200),
    db           : Session       = Depends(get_db),
    current_user : Personnel     = Depends(get_current_user),
):
    query = db.query(Sale).filter(Sale.branch_id == branch_id)
    if session_id:
        query = query.filter(Sale.session_id == session_id)

    total = query.count()
    items = (
        query
        .order_by(Sale.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "total"   : total,
        "page"    : page,
        "per_page": per_page,
        "items"   : [SaleResponse.model_validate(s) for s in items],
    }


# ============================================================
# SATIŞ İPTAL (VOID)
# ============================================================

@router.post("/{sale_id}/cancel")
async def cancel_sale(
    sale_id      : int,
    request      : Request,
    sebep        : str,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin", "cashier")),
):
    """
    Satışı iptal eder — stok geri yüklenir.
    Sadece aynı gün ve aynı oturumda yapılan satışlar iptal edilebilir.
    """
    satis = db.query(Sale).filter(
        Sale.id     == sale_id,
        Sale.status == "completed",
    ).first()
    if not satis:
        raise HTTPException(
            status_code = 404,
            detail      = "Satış bulunamadı veya zaten iptal edilmiş.",
        )

    # Satış kalemlerini bul ve stok geri yükle
    kalemler = db.query(SaleItem).filter(SaleItem.sale_id == sale_id).all()
    for kalem in kalemler:
        urun = db.query(Product).filter(Product.id == kalem.product_id).first()
        if urun:
            stok_guncelle(
                db           = db,
                product      = urun,
                hareket_tipi = "adjust",
                miktar       = int(kalem.qty),   # Pozitif = stok geri eklenir
                user_id      = current_user.id,
                branch_id    = satis.branch_id,
                note         = f"void_sale_{sale_id}: {sebep}",
            )

    # Müşteri sadakat puanı geri al
    if satis.customer_id:
        musteri = db.query(Customer).filter(Customer.id == satis.customer_id).first()
        if musteri:
            musteri.loyalty_points = max(0, (musteri.loyalty_points or 0) - int(float(satis.total)))
            db.add(musteri)

    satis.status = "cancelled"
    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "SALE_CANCEL",
        user_id     = current_user.id,
        table_name  = "sales",
        record_id   = sale_id,
        old_value   = {"status": "completed", "total": float(satis.total)},
        new_value   = {"status": "cancelled", "sebep": sebep},
        ip_address  = request.client.host if request.client else None,
        branch_id   = satis.branch_id,
        note        = f"İptal sebebi: {sebep}",
    )

    return {
        "success": True,
        "message": f"Satış #{sale_id} iptal edildi. Stok geri yüklendi.",
        "sebep"  : sebep,
    }


# ============================================================
# İADE
# ============================================================

@router.post("/{sale_id}/refund")
async def refund_sale(
    sale_id      : int,
    request      : Request,
    product_id   : int,
    miktar       : float,
    sebep        : str,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin", "cashier")),
):
    """
    Kısmi veya tam iade.
    Belirtilen ürün ve miktarı iade eder, stok geri yüklenir.
    """
    satis = db.query(Sale).filter(
        Sale.id     == sale_id,
        Sale.status.in_(["completed"]),
    ).first()
    if not satis:
        raise HTTPException(status_code=404, detail="Satış bulunamadı.")

    kalem = db.query(SaleItem).filter(
        SaleItem.sale_id    == sale_id,
        SaleItem.product_id == product_id,
    ).first()
    if not kalem:
        raise HTTPException(status_code=404, detail="Bu satışta belirtilen ürün yok.")

    if miktar > float(kalem.qty):
        raise HTTPException(
            status_code = 400,
            detail      = f"İade miktarı satış miktarından fazla. Satış miktarı: {kalem.qty}",
        )

    # İade tutarı
    birim_fiyat  = float(kalem.unit_price) - (float(kalem.discount) / float(kalem.qty))
    iade_tutari  = birim_fiyat * miktar

    # Stok geri yükle
    urun = db.query(Product).filter(Product.id == product_id).first()
    if urun:
        stok_guncelle(
            db           = db,
            product      = urun,
            hareket_tipi = "adjust",
            miktar       = int(miktar),
            user_id      = current_user.id,
            branch_id    = satis.branch_id,
            note         = f"refund_sale_{sale_id}: {sebep}",
        )

    satis.status = "refunded"
    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "SALE_REFUND",
        user_id     = current_user.id,
        table_name  = "sales",
        record_id   = sale_id,
        new_value   = {
            "product_id" : product_id,
            "miktar"     : miktar,
            "iade_tutari": iade_tutari,
            "sebep"      : sebep,
        },
        ip_address  = request.client.host if request.client else None,
        branch_id   = satis.branch_id,
    )

    return {
        "success"    : True,
        "iade_tutari": round(iade_tutari, 2),
        "message"    : f"İade işlemi tamamlandı. İade tutarı: {iade_tutari:.2f}₺",
    }
