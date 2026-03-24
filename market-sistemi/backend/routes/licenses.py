"""
Market Yönetim Sistemi — Lisans Yönetimi Route'ları
Yazılım satışı, lisans doğrulama, aktivasyon, süre kontrolü
"""

from fastapi    import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from datetime   import date, datetime
from typing     import Optional
import secrets
import string
import os

from database   import get_db
from models     import License, Personnel
from routes.auth import get_current_user, require_role
from services   import audit_log

router = APIRouter(prefix="/api/licenses", tags=["Lisans"])


# ============================================================
# PAKET TANIMI
# ============================================================

PAKETLER = {
    "starter" : {"branch_limit": 1, "device_limit": 2,  "fiyat": 2500},
    "pro"     : {"branch_limit": 1, "device_limit": 5,  "fiyat": 4500},
    "chain"   : {"branch_limit": 5, "device_limit": 15, "fiyat": 9900},
    "lifetime": {"branch_limit": 3, "device_limit": 10, "fiyat": 14900},
}


# ============================================================
# YARDIMCI: Lisans anahtarı üret
# ============================================================

def _lisans_anahtari_uret() -> str:
    """
    MYS-YYYY-XXXX-XXXX-XXXX formatında benzersiz lisans anahtarı üretir.
    MYS = Market Yönetim Sistemi
    """
    alfasayisal = string.ascii_uppercase + string.digits
    bolum1 = ''.join(secrets.choice(alfasayisal) for _ in range(4))
    bolum2 = ''.join(secrets.choice(alfasayisal) for _ in range(4))
    bolum3 = ''.join(secrets.choice(alfasayisal) for _ in range(4))
    yil    = str(date.today().year)
    return f"MYS-{yil}-{bolum1}-{bolum2}-{bolum3}"


# ============================================================
# LİSANS LİSTESİ (admin)
# ============================================================

@router.get("")
async def lisans_listesi(
    page        : int           = Query(1, ge=1),
    per_page    : int           = Query(50, ge=1, le=200),
    search      : Optional[str] = Query(None),
    status      : Optional[str] = Query(None),
    db          : Session       = Depends(get_db),
    current_user: Personnel     = Depends(require_role("admin")),
):
    """Tüm lisansları listeler. Sadece admin görebilir."""
    sorgu = db.query(License)

    if search:
        sorgu = sorgu.filter(
            License.customer_name.ilike(f"%{search}%") |
            License.email.ilike(f"%{search}%") |
            License.license_key.ilike(f"%{search}%")
        )
    if status:
        sorgu = sorgu.filter(License.status == status)

    toplam = sorgu.count()
    items  = (
        sorgu
        .order_by(License.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "total"   : toplam,
        "page"    : page,
        "per_page": per_page,
        "items"   : [
            {
                "id"           : l.id,
                "customer_name": l.customer_name,
                "email"        : l.email,
                "phone"        : l.phone,
                "license_key"  : l.license_key,
                "package"      : l.package,
                "branch_limit" : l.branch_limit,
                "device_limit" : l.device_limit,
                "start_date"   : str(l.start_date) if l.start_date else None,
                "end_date"     : str(l.end_date)   if l.end_date   else None,
                "status"       : l.status,
                "kalan_gun"    : (l.end_date - date.today()).days if l.end_date and l.status == "active" else None,
                "created_at"   : str(l.created_at),
            }
            for l in items
        ],
    }


# ============================================================
# LİSANS OLUŞTUR (yeni satış)
# ============================================================

@router.post("", status_code=201)
async def lisans_olustur(
    request      : Request,
    customer_name: str,
    email        : str,
    phone        : Optional[str] = None,
    package      : str = "starter",
    sureli_ay    : Optional[int] = None,   # None → sınırsız (lifetime)
    db           : Session  = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin")),
):
    """
    Yeni lisans satışı.
    package: starter | pro | chain | lifetime
    sureli_ay: kaç aylık lisans (None = lifetime)
    """
    if package not in PAKETLER:
        raise HTTPException(
            status_code=400,
            detail=f"Geçersiz paket. Seçenekler: {', '.join(PAKETLER)}",
        )

    paket_bilgi = PAKETLER[package]

    # Benzersiz anahtar üret
    while True:
        anahtar = _lisans_anahtari_uret()
        mevcut  = db.query(License).filter(License.license_key == anahtar).first()
        if not mevcut:
            break

    # Süre hesapla
    baslangic = date.today()
    if sureli_ay and package != "lifetime":
        from dateutil.relativedelta import relativedelta
        bitis = baslangic + relativedelta(months=sureli_ay)
    else:
        bitis = None  # Sınırsız

    lisans = License(
        customer_name = customer_name,
        email         = email,
        phone         = phone,
        license_key   = anahtar,
        package       = package,
        branch_limit  = paket_bilgi["branch_limit"],
        device_limit  = paket_bilgi["device_limit"],
        start_date    = baslangic,
        end_date      = bitis,
        status        = "active",
    )
    db.add(lisans)
    db.commit()
    db.refresh(lisans)

    audit_log.log_action(
        db          = db,
        action_type = "LICENSE_CREATE",
        user_id     = current_user.id,
        table_name  = "licenses",
        record_id   = lisans.id,
        new_value   = {"customer": customer_name, "package": package, "key": anahtar},
        ip_address  = request.client.host if request.client else None,
        branch_id   = 1,
    )

    return {
        "success"     : True,
        "license_key" : anahtar,
        "package"     : package,
        "customer"    : customer_name,
        "start_date"  : str(baslangic),
        "end_date"    : str(bitis) if bitis else "Sınırsız",
        "fiyat"       : paket_bilgi["fiyat"],
    }


# ============================================================
# LİSANS DOĞRULA (aktivasyon)
# ============================================================

@router.post("/validate")
async def lisans_dogrula(
    license_key: str,
    db         : Session = Depends(get_db),
):
    """
    Lisans anahtarını doğrular.
    Auth gerektirmez — aktivasyon ekranından çağrılır.
    """
    lisans = db.query(License).filter(License.license_key == license_key).first()

    if not lisans:
        return {"gecerli": False, "mesaj": "Lisans anahtarı bulunamadı."}

    if lisans.status == "suspended":
        return {"gecerli": False, "mesaj": "Bu lisans askıya alınmış."}

    if lisans.status == "expired":
        return {"gecerli": False, "mesaj": "Bu lisansın süresi dolmuş."}

    # Süre kontrolü
    if lisans.end_date and lisans.end_date < date.today():
        # Otomatik expire et
        lisans.status = "expired"
        db.commit()
        return {"gecerli": False, "mesaj": f"Lisans süresi {lisans.end_date} tarihinde dolmuş."}

    kalan_gun = None
    if lisans.end_date:
        kalan_gun = (lisans.end_date - date.today()).days

    return {
        "gecerli"     : True,
        "customer_name": lisans.customer_name,
        "package"     : lisans.package,
        "branch_limit": lisans.branch_limit,
        "device_limit": lisans.device_limit,
        "end_date"    : str(lisans.end_date) if lisans.end_date else None,
        "kalan_gun"   : kalan_gun,
        "mesaj"       : "Lisans geçerli." if not kalan_gun else f"Lisans geçerli. {kalan_gun} gün kaldı.",
    }


# ============================================================
# LİSANS DURAKLAT / AKTİFLEŞTİR
# ============================================================

@router.patch("/{lisans_id}/status")
async def lisans_durum_degistir(
    lisans_id   : int,
    request     : Request,
    yeni_durum  : str,
    db          : Session   = Depends(get_db),
    current_user: Personnel = Depends(require_role("admin")),
):
    """active | suspended | expired"""
    if yeni_durum not in ("active", "suspended", "expired"):
        raise HTTPException(status_code=400, detail="Geçersiz durum.")

    lisans = db.query(License).filter(License.id == lisans_id).first()
    if not lisans:
        raise HTTPException(status_code=404, detail="Lisans bulunamadı.")

    eski_durum    = lisans.status
    lisans.status = yeni_durum
    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "LICENSE_STATUS_CHANGE",
        user_id     = current_user.id,
        table_name  = "licenses",
        record_id   = lisans_id,
        old_value   = {"status": eski_durum},
        new_value   = {"status": yeni_durum},
        ip_address  = request.client.host if request.client else None,
        branch_id   = 1,
    )

    return {
        "success": True,
        "message": f"Lisans durumu '{yeni_durum}' olarak güncellendi.",
    }


# ============================================================
# PAKET LİSTESİ (public — satış sayfası için)
# ============================================================

@router.get("/packages")
async def paket_listesi():
    """Mevcut lisans paketlerini ve fiyatlarını döner."""
    return {
        "paketler": [
            {
                "id"          : k,
                "ad"          : {"starter": "Başlangıç", "pro": "Profesyonel", "chain": "Zincir", "lifetime": "Ömür Boyu"}[k],
                "branch_limit": v["branch_limit"],
                "device_limit": v["device_limit"],
                "fiyat"       : v["fiyat"],
                "para_birimi" : "TRY",
                "ozellikler"  : _paket_ozellikleri(k),
            }
            for k, v in PAKETLER.items()
        ]
    }


def _paket_ozellikleri(paket: str) -> list:
    temel = ["Ürün & stok yönetimi", "Kasa & satış", "Müşteri takibi", "Raporlama"]
    pro_ek = ["Fatura işleme (PDF/Excel)", "E-posta bildirimleri", "Otomatik yedekleme"]
    chain_ek = ["5 şubeye kadar", "Şubeler arası transfer", "Merkezi raporlama"]
    lifetime_ek = ["Ömür boyu güncelleme", "3 şubeye kadar", "Öncelikli destek"]

    return (
        temel + lifetime_ek if paket == "lifetime" else
        temel + chain_ek   if paket == "chain"    else
        temel + pro_ek     if paket == "pro"      else
        temel
    )
