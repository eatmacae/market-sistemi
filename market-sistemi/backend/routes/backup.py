"""
Market Yönetim Sistemi — Yedekleme Route'ları
Manuel yedek alma, yedek listesi, eski yedek silme
"""

from fastapi            import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from fastapi.responses  import FileResponse
from sqlalchemy.orm     import Session
from pathlib            import Path
from datetime           import datetime
import os

from database    import get_db
from models      import Personnel
from routes.auth import get_current_user, require_role
from services    import audit_log

router = APIRouter(prefix="/api/backup", tags=["Yedekleme"])


# ============================================================
# YEDEK LİSTESİ
# ============================================================

@router.get("")
async def yedek_listesi(
    current_user: Personnel = Depends(require_role("admin")),
):
    """
    Lokal yedek dizinindeki tüm ZIP dosyalarını listeler.
    Sadece admin erişebilir.
    """
    dizin = Path(os.getenv("BACKUP_DIR", "./backups"))
    if not dizin.exists():
        return {"yedekler": [], "toplam": 0}

    yedekler = []
    for dosya in sorted(dizin.glob("yedek_*.zip"), reverse=True):
        try:
            stat       = dosya.stat()
            boyut_mb   = stat.st_size / (1024 * 1024)
            degistirme = datetime.fromtimestamp(stat.st_mtime)
            yedekler.append({
                "dosya_adi"  : dosya.name,
                "boyut_mb"   : round(boyut_mb, 2),
                "tarih"      : degistirme.strftime("%Y-%m-%d %H:%M"),
                "indirilebilir": True,
            })
        except Exception:
            continue

    return {
        "yedekler"   : yedekler,
        "toplam"     : len(yedekler),
        "dizin"      : str(dizin.resolve()),
    }


# ============================================================
# MANUEL YEDEK AL
# ============================================================

@router.post("/manual")
async def manuel_yedek_al(
    background_tasks: BackgroundTasks,
    mail_gonder     : bool      = Query(True, description="Yedek tamamlanınca mail gönder"),
    current_user    : Personnel = Depends(require_role("admin")),
    db              : Session   = Depends(get_db),
):
    """
    Admin isteğiyle anlık yedek alır.
    İşlem arka planda çalışır — hemen 202 Accepted döner.
    """
    # Yedek başlatma audit log
    audit_log.log_action(
        db          = db,
        action_type = "BACKUP_MANUAL_START",
        user_id     = current_user.id,
        branch_id   = current_user.branch_id,
        table_name  = "backup",
        note        = f"mail_gonder={mail_gonder}",
    )

    def _arka_planda_yedek():
        from services.backup import yedek_al
        sonuc = yedek_al(mail_gonder=mail_gonder)
        if sonuc["basarili"]:
            import logging
            logging.getLogger("market_sistemi.backup").info(
                f"Manuel yedek tamamlandı: {sonuc['zip_yolu']} ({sonuc['boyut_mb']} MB)"
            )
        else:
            import logging
            logging.getLogger("market_sistemi.backup").error(
                f"Manuel yedek başarısız: {sonuc['mesaj']}"
            )

    background_tasks.add_task(_arka_planda_yedek)

    return {
        "success": True,
        "message": "Yedekleme arka planda başlatıldı. Tamamlandığında mail bildirim gönderilecek.",
        "mail_bildirim": mail_gonder,
    }


# ============================================================
# YEDEK DURUM (son yedek ne zaman alındı?)
# ============================================================

@router.get("/status")
async def yedek_durumu(
    current_user: Personnel = Depends(require_role("admin")),
):
    """
    Son yedek dosyasının tarih ve boyutunu döner.
    Dashboard veya ayarlar ekranında göstermek için kullanılır.
    """
    dizin = Path(os.getenv("BACKUP_DIR", "./backups"))
    if not dizin.exists():
        return {
            "son_yedek_tarihi" : None,
            "son_yedek_boyutu" : None,
            "yedek_sayisi"     : 0,
            "uyari"            : "Yedek dizini henüz oluşturulmamış.",
        }

    dosyalar = sorted(dizin.glob("yedek_*.zip"), key=lambda f: f.stat().st_mtime, reverse=True)

    if not dosyalar:
        return {
            "son_yedek_tarihi" : None,
            "son_yedek_boyutu" : None,
            "yedek_sayisi"     : 0,
            "uyari"            : "Henüz yedek alınmamış.",
        }

    son   = dosyalar[0]
    stat  = son.stat()
    tarih = datetime.fromtimestamp(stat.st_mtime)

    # Son yedekten bu yana geçen gün
    gecen_gun = (datetime.now() - tarih).days

    return {
        "son_yedek_tarihi" : tarih.strftime("%d.%m.%Y %H:%M"),
        "son_yedek_boyutu" : round(stat.st_size / (1024 * 1024), 2),
        "son_yedek_dosya"  : son.name,
        "yedek_sayisi"     : len(dosyalar),
        "gecen_gun"        : gecen_gun,
        "uyari"            : "Son yedekten 3 günden fazla geçti!" if gecen_gun > 3 else None,
    }


# ============================================================
# YEDEK İNDİR
# ============================================================

@router.get("/download/{dosya_adi}")
async def yedek_indir(
    dosya_adi   : str,
    current_user: Personnel = Depends(require_role("admin")),
    db          : Session   = Depends(get_db),
):
    """
    Belirli bir yedek dosyasını indirir.
    Sadece 'yedek_' ile başlayan ZIP dosyaları indirilebilir (path traversal önlemi).
    """
    # Güvenlik: sadece 'yedek_' ile başlayan .zip dosyalarına izin ver
    if not dosya_adi.startswith("yedek_") or not dosya_adi.endswith(".zip"):
        raise HTTPException(
            status_code = 400,
            detail      = "Geçersiz dosya adı. Sadece yedek_*.zip dosyaları indirilebilir.",
        )

    # Path traversal önlemi: dizin ayırıcılar kabul edilmez
    if "/" in dosya_adi or "\\" in dosya_adi or ".." in dosya_adi:
        raise HTTPException(status_code=400, detail="Geçersiz dosya adı.")

    dizin = Path(os.getenv("BACKUP_DIR", "./backups"))
    dosya = dizin / dosya_adi

    if not dosya.exists():
        raise HTTPException(status_code=404, detail="Yedek dosyası bulunamadı.")

    # Yedek indirme audit log
    audit_log.log_action(
        db          = db,
        action_type = "BACKUP_DOWNLOAD",
        user_id     = current_user.id,
        branch_id   = current_user.branch_id,
        table_name  = "backup",
        note        = dosya_adi,
    )

    return FileResponse(
        path             = str(dosya),
        filename         = dosya_adi,
        media_type       = "application/zip",
    )


# ============================================================
# YEDEK SİL
# ============================================================

@router.delete("/{dosya_adi}")
async def yedek_sil(
    dosya_adi   : str,
    current_user: Personnel = Depends(require_role("admin")),
    db          : Session   = Depends(get_db),
):
    """Belirli bir yedek dosyasını siler. Sadece admin yapabilir."""
    if not dosya_adi.startswith("yedek_") or not dosya_adi.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Geçersiz dosya adı.")

    if "/" in dosya_adi or "\\" in dosya_adi or ".." in dosya_adi:
        raise HTTPException(status_code=400, detail="Geçersiz dosya adı.")

    dizin = Path(os.getenv("BACKUP_DIR", "./backups"))
    dosya = dizin / dosya_adi

    if not dosya.exists():
        raise HTTPException(status_code=404, detail="Yedek dosyası bulunamadı.")

    # Yedek silme audit log — kritik işlem
    audit_log.log_action(
        db          = db,
        action_type = "BACKUP_DELETE",
        user_id     = current_user.id,
        branch_id   = current_user.branch_id,
        table_name  = "backup",
        note        = dosya_adi,
    )

    dosya.unlink()
    return {"success": True, "message": f"{dosya_adi} silindi."}
