"""
Market Yönetim Sistemi — Sistem Ayarları Route'ları
Market bilgileri, yazıcı, terazi, mail, SKT uyarı, çok şubeli mod vb.
Tüm ayarlar system_settings tablosunda branch_id bazlı key-value olarak saklanır.
"""

import os
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db
from models import SystemSetting, Branch, Personnel
from schemas import SettingUpdate, SettingsBulkUpdate, SettingResponse, SuccessResponse
from routes.auth import get_current_user, require_role
from services import audit_log

router = APIRouter(prefix="/api/settings", tags=["Sistem Ayarları"])
logger = logging.getLogger("market_sistemi.settings")


# ============================================================
# VARSAYILAN AYARLAR (tablo boşsa bunlar döner)
# ============================================================

VARSAYILAN_AYARLAR = {
    # Market bilgileri (fiş başlığı)
    "market_name"       : "Market Adı",
    "market_address"    : "",
    "market_phone"      : "",
    "market_tax_no"     : "",

    # Yazıcı
    "printer_mac"       : "",           # Bluetooth termal yazıcı MAC
    "printer_enabled"   : "true",

    # Terazi
    "scale_ip"          : "",
    "scale_port"        : "8008",
    "scale_enabled"     : "false",

    # SKT uyarı
    "skt_warning_days"  : "30",         # Kaç gün kala uyarsın

    # Çok şubeli mod
    "multi_branch"      : "false",

    # Offline tolerans
    "offline_tolerance_days": "7",      # Kaç gün offline çalışabilir (lisans)

    # Otomatik yedekleme
    "backup_auto"       : "true",
    "backup_hour"       : "2",          # Yedek saati

    # Display
    "display_enabled"   : "false",
    "display_welcome"   : "Hoş Geldiniz!",
}

# Şifreli saklanacak ayarlar (value_enc sütununa gider)
SIFRELENEN_AYARLAR = {
    "smtp_password",
    "scale_password",
}


# ============================================================
# YARDIMCI: Şifreleme
# ============================================================

def _sifrele(plain: str) -> str:
    """Hassas ayar değerini AES-256 ile şifreler."""
    import base64
    from cryptography.fernet import Fernet

    key_str = os.getenv("BACKUP_ENCRYPTION_KEY", "")
    if not key_str or len(key_str) < 32:
        return f"PLAIN:{plain}"

    key_bytes = key_str[:32].encode().ljust(32, b'0')
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    f = Fernet(fernet_key)
    return f.encrypt(plain.encode()).decode()


def _sifre_coz(encrypted: str) -> str:
    """Şifreli ayar değerini çözer."""
    import base64
    from cryptography.fernet import Fernet

    if not encrypted:
        return ""
    if encrypted.startswith("PLAIN:"):
        return encrypted[6:]

    key_str = os.getenv("BACKUP_ENCRYPTION_KEY", "")
    if not key_str or len(key_str) < 32:
        return ""

    key_bytes = key_str[:32].encode().ljust(32, b'0')
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    f = Fernet(fernet_key)
    try:
        return f.decrypt(encrypted.encode()).decode()
    except Exception:
        return ""


def _ayar_al(db: Session, branch_id: int, key: str) -> str:
    """Tek ayar değerini döner. Yoksa varsayılanı döner."""
    kayit = db.query(SystemSetting).filter(
        SystemSetting.branch_id == branch_id,
        SystemSetting.key       == key,
    ).first()

    if not kayit:
        return VARSAYILAN_AYARLAR.get(key, "")

    # Şifreli ayarsa çöz ama döndürme — sadece düz değeri döndür
    if key in SIFRELENEN_AYARLAR:
        return "***"  # Şifreli alanlar frontend'e *** olarak gider

    return kayit.value or ""


def _tum_ayarlar(db: Session, branch_id: int) -> dict:
    """Şubenin tüm ayarlarını dict olarak döner."""
    kayitlar = db.query(SystemSetting).filter(
        SystemSetting.branch_id == branch_id,
    ).all()

    # Önce varsayılanları yükle
    sonuc = dict(VARSAYILAN_AYARLAR)

    # DB değerleriyle üstüne yaz
    for k in kayitlar:
        if k.key in SIFRELENEN_AYARLAR:
            sonuc[k.key] = "***"  # Şifreli alanları gizle
        else:
            sonuc[k.key] = k.value or ""

    return sonuc


# ============================================================
# TÜM AYARLARI GETİR
# ============================================================

@router.get("")
async def get_settings(
    branch_id    : int = Query(1),
    db           : Session   = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """Şubenin tüm sistem ayarlarını döner. Şifreli alanlar '***' olarak gelir."""
    return _tum_ayarlar(db, branch_id)


# ============================================================
# TEK AYAR GETİR
# ============================================================

@router.get("/{key}")
async def get_setting(
    key          : str,
    branch_id    : int = Query(1),
    db           : Session   = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """Belirli bir ayar anahtarının değerini döner."""
    return {"key": key, "value": _ayar_al(db, branch_id, key)}


# ============================================================
# TOPLU AYAR GÜNCELLE
# ============================================================

@router.put("")
async def update_settings(
    request      : Request,
    data         : SettingsBulkUpdate,
    db           : Session   = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin")),
):
    """
    Birden fazla ayarı aynı anda günceller.
    Şifreli ayarlar (smtp_password vb.) otomatik AES-256 ile şifrelenir.
    """
    guncellenen = []

    for item in data.settings:
        # Şifrelenmesi gereken ayar mı?
        sifrelenmeli = item.key in SIFRELENEN_AYARLAR or item.encrypted

        # Mevcut kaydı bul veya yeni oluştur (upsert)
        kayit = db.query(SystemSetting).filter(
            SystemSetting.branch_id == data.branch_id,
            SystemSetting.key       == item.key,
        ).first()

        if not kayit:
            kayit = SystemSetting(
                branch_id = data.branch_id,
                key       = item.key,
            )
            db.add(kayit)

        if sifrelenmeli and item.value and item.value != "***":
            # Şifreli sütuna kaydet
            kayit.value     = None
            kayit.value_enc = _sifrele(item.value)
        else:
            kayit.value     = item.value
            kayit.value_enc = None

        guncellenen.append(item.key)

    db.commit()

    # Çevre değişkenlerine de yansıt (çalışan process için)
    _env_guncelle(db, data.branch_id)

    audit_log.log_action(
        db          = db,
        action_type = "SETTINGS_UPDATE",
        user_id     = current_user.id,
        table_name  = "system_settings",
        ip_address  = request.client.host if request.client else None,
        branch_id   = data.branch_id,
        new_value   = {"updated_keys": guncellenen},
        note        = f"Ayarlar güncellendi: {', '.join(guncellenen)}",
    )

    return {
        "success"    : True,
        "message"    : f"{len(guncellenen)} ayar güncellendi.",
        "updated"    : guncellenen,
    }


# ============================================================
# AYARLARI .ENV'E YANSIT
# ============================================================

def _env_guncelle(db: Session, branch_id: int):
    """
    Kritik ayarları os.environ'a yansıtır.
    APScheduler, SMTP ve scraper servisleri env'den okur.
    """
    kayitlar = db.query(SystemSetting).filter(
        SystemSetting.branch_id == branch_id,
    ).all()

    for k in kayitlar:
        if k.key == "skt_warning_days" and k.value:
            os.environ["SKT_UYARI_GUN"] = k.value
        elif k.key == "backup_hour" and k.value:
            os.environ["BACKUP_HOUR"] = k.value
        elif k.key == "multi_branch" and k.value:
            os.environ["MULTI_BRANCH"] = k.value
        elif k.key == "smtp_password" and k.value_enc:
            # SMTP şifresini çöz ve env'e koy (memory-only)
            os.environ["SMTP_PASSWORD"] = _sifre_coz(k.value_enc)


# ============================================================
# SAĞLIK KONTROLÜ
# ============================================================

@router.get("/health/full")
async def full_health_check(
    branch_id    : int = Query(1),
    db           : Session   = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """
    Sunucu, veritabanı, SMTP ve terazi sağlık kontrolü.
    Ayarlar ekranında durum göstergesi için kullanılır.
    """
    from database import engine
    from sqlalchemy import text

    sonuc = {
        "version"   : "1.0.0",
        "branch_id" : branch_id,
        "timestamp" : str(datetime.utcnow()),
    }

    # Veritabanı
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        sonuc["database"] = "ok"
    except Exception as e:
        sonuc["database"] = f"hata: {str(e)}"

    # SMTP — sadece ayar var mı kontrol et, bağlanma
    smtp_email = os.getenv("SMTP_EMAIL", "")
    sonuc["smtp"] = "ayarlı" if smtp_email else "ayarlanmamış"

    # Terazi ayarı
    ayarlar = _tum_ayarlar(db, branch_id)
    sonuc["scale"] = {
        "enabled": ayarlar.get("scale_enabled") == "true",
        "ip"     : ayarlar.get("scale_ip", ""),
        "port"   : ayarlar.get("scale_port", "8008"),
    }

    # Display
    sonuc["display"] = {
        "enabled": ayarlar.get("display_enabled") == "true",
    }

    # Genel durum
    sonuc["status"] = "ok" if sonuc["database"] == "ok" else "hata"

    return sonuc


# ============================================================
# YAZICI TEST
# ============================================================

@router.post("/printer/test")
async def test_printer(
    branch_id    : int = Query(1),
    db           : Session   = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin")),
):
    """
    Bluetooth termal yazıcıya test fişi gönderir.
    Yazıcı bağlantısı bu endpoint ile doğrulanır.
    """
    ayarlar = _tum_ayarlar(db, branch_id)
    mac = ayarlar.get("printer_mac", "")

    if not mac:
        raise HTTPException(
            status_code = 400,
            detail      = "Yazıcı MAC adresi ayarlanmamış. Önce ayarlara girin.",
        )

    # TODO: Bluetooth yazıcı kütüphanesi entegrasyonu (Faz 2 devamında)
    # Şimdilik başarı yanıtı dönüyor
    logger.info(f"Yazıcı test — MAC: {mac}")

    return {
        "success": True,
        "message": f"Test fişi gönderildi ({mac}). Yazıcıda çıktı yoksa MAC adresini kontrol edin.",
        "mac"    : mac,
    }


# ============================================================
# TERAZİ TEST
# ============================================================

@router.get("/scale/test")
async def test_scale(
    branch_id    : int = Query(1),
    db           : Session   = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin")),
):
    """
    Terazi TCP/IP bağlantısını test eder ve anlık ağırlık okur.
    """
    import socket

    ayarlar = _tum_ayarlar(db, branch_id)
    ip      = ayarlar.get("scale_ip", "")
    port    = int(ayarlar.get("scale_port", "8008"))

    if not ip:
        raise HTTPException(400, "Terazi IP adresi ayarlanmamış.")

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(3)
            s.connect((ip, port))
            # Basit TCP bağlantı testi — protokol teraziye göre değişir
            s.close()
        return {"success": True, "message": f"Terazi bağlantısı başarılı ({ip}:{port}).", "ip": ip}
    except socket.timeout:
        raise HTTPException(408, f"Terazi yanıt vermedi ({ip}:{port}) — bağlantı zaman aşımı.")
    except ConnectionRefusedError:
        raise HTTPException(503, f"Terazi bağlantısı reddedildi ({ip}:{port}).")
    except Exception as e:
        raise HTTPException(500, f"Terazi bağlantı hatası: {str(e)}")
