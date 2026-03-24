"""
Market Yönetim Sistemi — Raporlama Route'ları
Günlük/haftalık/aylık satış, kâr/zarar, KDV, kasiyer performansı vb.
"""

from fastapi  import APIRouter, Depends, Query
from sqlalchemy.orm  import Session as DBSession
from sqlalchemy      import func, case, and_
from datetime import date, timedelta
from typing   import Optional

from database import get_db
from models   import Sale, SaleItem, Product, Personnel, Session as KasaSession
from routes.auth import get_current_user, require_role

router = APIRouter(prefix="/api/reports", tags=["Raporlar"])


# ============================================================
# YARDIMCI — TARİH ARALIĞI
# ============================================================

def _aralik(donem: str, baslangic: Optional[date], bitis: Optional[date]):
    """
    Dönem parametresine göre başlangıç/bitiş tarihleri döner.
    donem: today | week | month | year | custom
    """
    bugun = date.today()

    if donem == "today":
        return bugun, bugun
    elif donem == "week":
        return bugun - timedelta(days=bugun.weekday()), bugun
    elif donem == "month":
        return bugun.replace(day=1), bugun
    elif donem == "year":
        return bugun.replace(month=1, day=1), bugun
    elif donem == "custom" and baslangic and bitis:
        return baslangic, bitis
    else:
        return bugun, bugun


# ============================================================
# ÖZET — SATIŞ GÖSTERGELERİ
# ============================================================

@router.get("/summary")
async def satis_ozeti(
    branch_id   : int            = Query(1),
    donem       : str            = Query("today", regex="^(today|week|month|year|custom)$"),
    baslangic   : Optional[date] = Query(None),
    bitis       : Optional[date] = Query(None),
    db          : DBSession      = Depends(get_db),
    current_user: Personnel      = Depends(get_current_user),
):
    """
    Satış özeti: toplam ciro, işlem sayısı, ortalama sepet,
    nakit/kart dağılımı, indirim ve KDV.
    """
    bas, bit = _aralik(donem, baslangic, bitis)

    sonuc = db.query(
        func.count(Sale.id)                               .label("islem_sayisi"),
        func.coalesce(func.sum(Sale.total),     0)        .label("toplam_ciro"),
        func.coalesce(func.sum(Sale.discount),  0)        .label("toplam_indirim"),
        func.coalesce(func.sum(Sale.vat_amount), 0)       .label("toplam_kdv"),
        func.coalesce(
            func.sum(case((Sale.payment_type == "cash",  Sale.total), else_=0)), 0
        ).label("nakit"),
        func.coalesce(
            func.sum(case((Sale.payment_type == "card",  Sale.total), else_=0)), 0
        ).label("kart"),
        func.coalesce(
            func.sum(case((Sale.payment_type == "mixed", Sale.total), else_=0)), 0
        ).label("karma"),
    ).filter(
        Sale.branch_id == branch_id,
        Sale.status    == "completed",
        func.date(Sale.created_at) >= bas,
        func.date(Sale.created_at) <= bit,
    ).first()

    toplam_ciro    = float(sonuc.toplam_ciro or 0)
    islem_sayisi   = int(sonuc.islem_sayisi or 0)
    ort_sepet      = round(toplam_ciro / islem_sayisi, 2) if islem_sayisi > 0 else 0

    # Dünkü aynı dönemle karşılaştırma (sadece "today" için)
    degisim_yuzde = None
    if donem == "today":
        dun = bugun = date.today() - timedelta(days=1)
        dun_sonuc = db.query(
            func.coalesce(func.sum(Sale.total), 0).label("toplam")
        ).filter(
            Sale.branch_id == branch_id,
            Sale.status    == "completed",
            func.date(Sale.created_at) == dun,
        ).first()

        dun_ciro = float(dun_sonuc.toplam or 0)
        if dun_ciro > 0:
            degisim_yuzde = round((toplam_ciro - dun_ciro) / dun_ciro * 100, 1)

    return {
        "donem"          : donem,
        "baslangic"      : str(bas),
        "bitis"          : str(bit),
        "toplam_ciro"    : round(toplam_ciro, 2),
        "islem_sayisi"   : islem_sayisi,
        "ortalama_sepet" : ort_sepet,
        "toplam_indirim" : round(float(sonuc.toplam_indirim or 0), 2),
        "toplam_kdv"     : round(float(sonuc.toplam_kdv     or 0), 2),
        "nakit"          : round(float(sonuc.nakit or 0), 2),
        "kart"           : round(float(sonuc.kart  or 0), 2),
        "karma"          : round(float(sonuc.karma or 0), 2),
        "degisim_yuzde"  : degisim_yuzde,  # Önceki günle % fark
    }


# ============================================================
# GÜNLİK SATIŞ — SON N GÜN
# ============================================================

@router.get("/daily")
async def gunluk_satis(
    branch_id   : int       = Query(1),
    gun         : int       = Query(30, ge=1, le=365),
    db          : DBSession = Depends(get_db),
    current_user: Personnel = Depends(get_current_user),
):
    """Son N günün günlük satış serisi (grafik için)."""
    bas = date.today() - timedelta(days=gun - 1)

    sonuclar = db.query(
        func.date(Sale.created_at)             .label("tarih"),
        func.count(Sale.id)                    .label("islem"),
        func.coalesce(func.sum(Sale.total), 0) .label("ciro"),
    ).filter(
        Sale.branch_id == branch_id,
        Sale.status    == "completed",
        func.date(Sale.created_at) >= bas,
    ).group_by(
        func.date(Sale.created_at)
    ).order_by(
        func.date(Sale.created_at)
    ).all()

    return [
        {
            "tarih" : str(s.tarih),
            "islem" : int(s.islem),
            "ciro"  : round(float(s.ciro), 2),
        }
        for s in sonuclar
    ]


# ============================================================
# SAATLİK DAĞILIM
# ============================================================

@router.get("/hourly")
async def saatlik_dagilim(
    branch_id   : int            = Query(1),
    donem       : str            = Query("today"),
    baslangic   : Optional[date] = Query(None),
    bitis       : Optional[date] = Query(None),
    db          : DBSession      = Depends(get_db),
    current_user: Personnel      = Depends(get_current_user),
):
    """Saatlik işlem yoğunluğu haritası (0-23)."""
    bas, bit = _aralik(donem, baslangic, bitis)

    sonuclar = db.query(
        func.extract("hour", Sale.created_at)  .label("saat"),
        func.count(Sale.id)                    .label("islem"),
        func.coalesce(func.sum(Sale.total), 0) .label("ciro"),
    ).filter(
        Sale.branch_id == branch_id,
        Sale.status    == "completed",
        func.date(Sale.created_at) >= bas,
        func.date(Sale.created_at) <= bit,
    ).group_by(
        func.extract("hour", Sale.created_at)
    ).order_by(
        func.extract("hour", Sale.created_at)
    ).all()

    # Tüm 24 saati döndür (veri olmayan saatler 0)
    saat_harita = {int(s.saat): s for s in sonuclar}

    return [
        {
            "saat"  : saat,
            "islem" : int(saat_harita[saat].islem)  if saat in saat_harita else 0,
            "ciro"  : round(float(saat_harita[saat].ciro), 2) if saat in saat_harita else 0.0,
        }
        for saat in range(24)
    ]


# ============================================================
# EN ÇOK SATILAN ÜRÜNLER
# ============================================================

@router.get("/top-products")
async def en_cok_satilan(
    branch_id   : int            = Query(1),
    donem       : str            = Query("month"),
    baslangic   : Optional[date] = Query(None),
    bitis       : Optional[date] = Query(None),
    limit       : int            = Query(20, ge=1, le=100),
    siralama    : str            = Query("ciro", regex="^(ciro|adet)$"),
    db          : DBSession      = Depends(get_db),
    current_user: Personnel      = Depends(get_current_user),
):
    """Belirtilen dönemde en çok satılan ürünler."""
    bas, bit = _aralik(donem, baslangic, bitis)

    sorgu = db.query(
        Product.id                              .label("urun_id"),
        Product.name                            .label("urun_adi"),
        Product.unit                            .label("birim"),
        func.coalesce(func.sum(SaleItem.qty),         0).label("toplam_adet"),
        func.coalesce(func.sum(SaleItem.total),        0).label("toplam_ciro"),
        func.coalesce(func.sum(SaleItem.discount),     0).label("toplam_indirim"),
        func.count(func.distinct(SaleItem.sale_id))     .label("islem_sayisi"),
    ).join(
        SaleItem, SaleItem.product_id == Product.id
    ).join(
        Sale, and_(
            Sale.id        == SaleItem.sale_id,
            Sale.status    == "completed",
            Sale.branch_id == branch_id,
            func.date(Sale.created_at) >= bas,
            func.date(Sale.created_at) <= bit,
        )
    ).filter(
        Product.branch_id  == branch_id,
        Product.is_deleted == False,
    ).group_by(
        Product.id, Product.name, Product.unit
    )

    if siralama == "ciro":
        sorgu = sorgu.order_by(func.sum(SaleItem.total).desc())
    else:
        sorgu = sorgu.order_by(func.sum(SaleItem.qty).desc())

    sonuclar = sorgu.limit(limit).all()

    return [
        {
            "sira"          : idx + 1,
            "urun_id"       : s.urun_id,
            "urun_adi"      : s.urun_adi,
            "birim"         : s.birim,
            "toplam_adet"   : round(float(s.toplam_adet),  3),
            "toplam_ciro"   : round(float(s.toplam_ciro),  2),
            "toplam_indirim": round(float(s.toplam_indirim), 2),
            "islem_sayisi"  : int(s.islem_sayisi),
        }
        for idx, s in enumerate(sonuclar)
    ]


# ============================================================
# EN AZ SATILAN / HIRSIZLANMAYAN ÜRÜNLER
# ============================================================

@router.get("/slow-products")
async def az_satilan(
    branch_id   : int       = Query(1),
    gun         : int       = Query(30, ge=7, le=365),
    limit       : int       = Query(20, ge=1, le=100),
    db          : DBSession = Depends(get_db),
    current_user: Personnel = Depends(get_current_user),
):
    """Son N gündür hiç satılmayan veya çok az satılan ürünler."""
    bas = date.today() - timedelta(days=gun)

    # Dönemde satışı olan ürün ID'leri
    satilan_idler = db.query(SaleItem.product_id).join(
        Sale, and_(
            Sale.id        == SaleItem.sale_id,
            Sale.status    == "completed",
            Sale.branch_id == branch_id,
            func.date(Sale.created_at) >= bas,
        )
    ).distinct().subquery()

    # Bu dönemde hiç satılmayan ürünler
    urunler = db.query(
        Product.id, Product.name, Product.unit,
        Product.stock_qty, Product.price, Product.cost,
    ).filter(
        Product.branch_id  == branch_id,
        Product.is_deleted == False,
        Product.stock_qty  > 0,
        ~Product.id.in_(satilan_idler),
    ).order_by(
        Product.stock_qty.desc()
    ).limit(limit).all()

    return [
        {
            "urun_id"  : u.id,
            "urun_adi" : u.name,
            "birim"    : u.unit,
            "stok"     : u.stock_qty,
            "fiyat"    : float(u.price),
            "maliyet"  : float(u.cost or 0),
            "beklenti" : round(float(u.stock_qty) * float(u.price), 2),
        }
        for u in urunler
    ]


# ============================================================
# KDV RAPORU
# ============================================================

@router.get("/vat")
async def kdv_raporu(
    branch_id   : int            = Query(1),
    donem       : str            = Query("month"),
    baslangic   : Optional[date] = Query(None),
    bitis       : Optional[date] = Query(None),
    db          : DBSession      = Depends(get_db),
    current_user: Personnel      = Depends(require_role("admin")),
):
    """KDV oranı bazında ayrıştırılmış satış ve KDV tutarları."""
    bas, bit = _aralik(donem, baslangic, bitis)

    # Ürün bazında KDV oranı ve satış toplamları
    sonuclar = db.query(
        Product.vat_rate                              .label("kdv_orani"),
        func.coalesce(func.sum(SaleItem.total),    0) .label("toplam_satis"),
        func.coalesce(func.sum(SaleItem.qty),      0) .label("toplam_adet"),
    ).join(
        SaleItem, SaleItem.product_id == Product.id
    ).join(
        Sale, and_(
            Sale.id        == SaleItem.sale_id,
            Sale.status    == "completed",
            Sale.branch_id == branch_id,
            func.date(Sale.created_at) >= bas,
            func.date(Sale.created_at) <= bit,
        )
    ).filter(
        Product.branch_id  == branch_id,
        Product.is_deleted == False,
    ).group_by(
        Product.vat_rate
    ).order_by(
        Product.vat_rate
    ).all()

    detay = []
    genel_toplam = 0.0
    genel_kdv    = 0.0

    for s in sonuclar:
        toplam   = float(s.toplam_satis)
        oran     = int(s.kdv_orani)
        # İç KDV: toplam × oran / (100 + oran)
        kdv_tutar = round(toplam * oran / (100 + oran), 2)
        kdv_haric = round(toplam - kdv_tutar, 2)

        detay.append({
            "kdv_orani"  : oran,
            "toplam_satis": round(toplam, 2),
            "kdv_haric"  : kdv_haric,
            "kdv_tutar"  : kdv_tutar,
            "toplam_adet": round(float(s.toplam_adet), 3),
        })
        genel_toplam += toplam
        genel_kdv    += kdv_tutar

    return {
        "donem"      : donem,
        "baslangic"  : str(bas),
        "bitis"      : str(bit),
        "toplam_satis": round(genel_toplam, 2),
        "toplam_kdv" : round(genel_kdv, 2),
        "kdv_haric"  : round(genel_toplam - genel_kdv, 2),
        "detay"      : detay,
    }


# ============================================================
# KASİYER PERFORMANSI
# ============================================================

@router.get("/cashier-performance")
async def kasiyer_performansi(
    branch_id   : int            = Query(1),
    donem       : str            = Query("month"),
    baslangic   : Optional[date] = Query(None),
    bitis       : Optional[date] = Query(None),
    db          : DBSession      = Depends(get_db),
    current_user: Personnel      = Depends(require_role("admin")),
):
    """Kasiyer bazında satış performansı."""
    bas, bit = _aralik(donem, baslangic, bitis)

    sonuclar = db.query(
        Personnel.id                                    .label("kasiyer_id"),
        Personnel.name                                  .label("kasiyer_adi"),
        func.count(Sale.id)                             .label("islem_sayisi"),
        func.coalesce(func.sum(Sale.total),     0)      .label("toplam_ciro"),
        func.coalesce(func.sum(Sale.discount),  0)      .label("toplam_indirim"),
        func.coalesce(func.avg(Sale.total),     0)      .label("ortalama_sepet"),
    ).join(
        Sale, Sale.cashier_id == Personnel.id
    ).filter(
        Sale.branch_id == branch_id,
        Sale.status    == "completed",
        func.date(Sale.created_at) >= bas,
        func.date(Sale.created_at) <= bit,
    ).group_by(
        Personnel.id, Personnel.name
    ).order_by(
        func.sum(Sale.total).desc()
    ).all()

    return [
        {
            "kasiyer_id"    : s.kasiyer_id,
            "kasiyer_adi"   : s.kasiyer_adi,
            "islem_sayisi"  : int(s.islem_sayisi),
            "toplam_ciro"   : round(float(s.toplam_ciro),    2),
            "toplam_indirim": round(float(s.toplam_indirim), 2),
            "ortalama_sepet": round(float(s.ortalama_sepet), 2),
        }
        for s in sonuclar
    ]


# ============================================================
# KÂR / ZARAR ÖZETİ
# ============================================================

@router.get("/profit")
async def kar_zarar(
    branch_id   : int            = Query(1),
    donem       : str            = Query("month"),
    baslangic   : Optional[date] = Query(None),
    bitis       : Optional[date] = Query(None),
    db          : DBSession      = Depends(get_db),
    current_user: Personnel      = Depends(require_role("admin")),
):
    """Satış cirosu, maliyet ve kâr hesabı."""
    bas, bit = _aralik(donem, baslangic, bitis)

    sonuclar = db.query(
        func.coalesce(func.sum(SaleItem.total),                0).label("satis_toplam"),
        func.coalesce(
            func.sum(SaleItem.qty * func.coalesce(Product.cost, 0)), 0
        ).label("maliyet_toplam"),
    ).join(
        Product, Product.id == SaleItem.product_id
    ).join(
        Sale, and_(
            Sale.id        == SaleItem.sale_id,
            Sale.status    == "completed",
            Sale.branch_id == branch_id,
            func.date(Sale.created_at) >= bas,
            func.date(Sale.created_at) <= bit,
        )
    ).first()

    satis    = float(sonuclar.satis_toplam   or 0)
    maliyet  = float(sonuclar.maliyet_toplam or 0)
    kar      = satis - maliyet
    kar_orani = round(kar / satis * 100, 2) if satis > 0 else 0

    return {
        "donem"         : donem,
        "baslangic"     : str(bas),
        "bitis"         : str(bit),
        "satis_toplam"  : round(satis, 2),
        "maliyet_toplam": round(maliyet, 2),
        "kar"           : round(kar, 2),
        "kar_orani"     : kar_orani,
    }


# ============================================================
# STOK DEĞERİ
# ============================================================

@router.get("/stock-value")
async def stok_degeri(
    branch_id   : int       = Query(1),
    db          : DBSession = Depends(get_db),
    current_user: Personnel = Depends(require_role("admin")),
):
    """Mevcut stokun maliyet ve satış fiyatı bazında toplam değeri."""
    sonuc = db.query(
        func.coalesce(
            func.sum(Product.stock_qty * func.coalesce(Product.cost,  0)), 0
        ).label("maliyet_degeri"),
        func.coalesce(
            func.sum(Product.stock_qty * Product.price), 0
        ).label("satis_degeri"),
        func.count(Product.id).label("urun_sayisi"),
        func.sum(Product.stock_qty).label("toplam_adet"),
    ).filter(
        Product.branch_id  == branch_id,
        Product.is_deleted == False,
        Product.stock_qty  > 0,
    ).first()

    maliyet = float(sonuc.maliyet_degeri or 0)
    satis   = float(sonuc.satis_degeri   or 0)

    return {
        "maliyet_degeri": round(maliyet, 2),
        "satis_degeri"  : round(satis,   2),
        "potansiyel_kar": round(satis - maliyet, 2),
        "urun_sayisi"   : int(sonuc.urun_sayisi  or 0),
        "toplam_adet"   : int(sonuc.toplam_adet  or 0),
    }


# ============================================================
# KASA FARKI GEÇMİŞİ
# ============================================================

@router.get("/cash-difference")
async def kasa_farki_gecmisi(
    branch_id   : int       = Query(1),
    limit       : int       = Query(30, ge=1, le=100),
    db          : DBSession = Depends(get_db),
    current_user: Personnel = Depends(require_role("admin")),
):
    """Kapanan kasa oturumlarındaki kasa farkı geçmişi."""
    oturumlar = db.query(KasaSession).filter(
        KasaSession.branch_id  == branch_id,
        KasaSession.closed_at  != None,
    ).order_by(KasaSession.closed_at.desc()).limit(limit).all()

    return [
        {
            "oturum_id"      : o.id,
            "kasiyer_id"     : o.cashier_id,
            "acilis"         : str(o.created_at)  if o.created_at  else None,
            "kapanis"        : str(o.closed_at)   if o.closed_at   else None,
            "acilis_kasasi"  : float(o.opening_amount  or 0),
            "kapanis_kasasi" : float(o.closing_amount  or 0) if o.closing_amount  else None,
            "beklenen_kasa"  : float(o.expected_amount or 0) if hasattr(o, "expected_amount") else None,
            "kasa_farki"     : float(o.cash_difference or 0) if hasattr(o, "cash_difference") else None,
        }
        for o in oturumlar
    ]
