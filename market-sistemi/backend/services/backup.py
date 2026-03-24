"""
Market Yönetim Sistemi — Otomatik Yedekleme Servisi
PostgreSQL dump → ZIP (parola korumalı) → local arşiv → mail
"""

import os
import io
import json
import logging
import subprocess
import zipfile
from datetime  import date, datetime, timedelta
from pathlib   import Path
from typing    import Optional

logger = logging.getLogger("market_sistemi.backup")


# ============================================================
# YEDEK DİZİNİ
# ============================================================

def _yedek_dizini() -> Path:
    """Yedek dosyalarının saklandığı dizin (otomatik oluşturulur)."""
    dizin = Path(os.getenv("BACKUP_DIR", "./backups"))
    dizin.mkdir(parents=True, exist_ok=True)
    return dizin


# ============================================================
# DB DUMP
# ============================================================

def _pg_dump(cikti_yolu: Path) -> bool:
    """
    pg_dump ile PostgreSQL veritabanını .sql dosyasına yazar.
    DATABASE_URL ortam değişkeninden bağlantı bilgisini okur.
    """
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        logger.error("DATABASE_URL tanımlı değil — dump alınamaz.")
        return False

    # postgresql://user:pass@host:port/dbname ayrıştır
    # pg_dump için PGPASSWORD ortam değişkeni kullanılır
    try:
        env = os.environ.copy()

        # Basit URL ayrıştırma
        # Format: postgresql://kullanici:sifre@sunucu:port/veritabani
        db_url_temiz = db_url.replace("postgresql://", "").replace("postgres://", "")
        kullanici_sifre, sunucu_db = db_url_temiz.split("@", 1)

        if ":" in kullanici_sifre:
            kullanici, sifre = kullanici_sifre.split(":", 1)
            env["PGPASSWORD"] = sifre
        else:
            kullanici = kullanici_sifre

        sunucu_port, veritabani = sunucu_db.rsplit("/", 1)
        sunucu = sunucu_port.split(":")[0]
        port   = sunucu_port.split(":")[1] if ":" in sunucu_port else "5432"

        komut = [
            "pg_dump",
            "-h", sunucu,
            "-p", port,
            "-U", kullanici,
            "-F", "p",   # plain text format
            "-f", str(cikti_yolu),
            veritabani,
        ]

        sonuc = subprocess.run(
            komut,
            env            = env,
            capture_output = True,
            text           = True,
            timeout        = 300,   # 5 dakika timeout
        )

        if sonuc.returncode != 0:
            logger.error(f"pg_dump hatası: {sonuc.stderr}")
            return False

        logger.info(f"DB dump tamamlandı: {cikti_yolu} ({cikti_yolu.stat().st_size // 1024} KB)")
        return True

    except Exception as e:
        logger.error(f"pg_dump çalıştırılamadı: {e}", exc_info=True)
        return False


# ============================================================
# ZIP OLUŞTUR (Parola korumalı)
# ============================================================

def _zip_olustur(
    sql_yolu  : Path,
    zip_yolu  : Path,
    parola    : Optional[str] = None,
) -> bool:
    """
    SQL dosyasını ZIP'e ekler.
    Python'un zipfile modülü şifreleme desteklemez (zayıf WinZip şifrelemesi var),
    bu yüzden sadece sıkıştırma yapılır. Güçlü şifreleme için 7za kullanılır.
    """
    try:
        # config.json — sistem bilgisi
        config = {
            "versiyon"        : "1.0.0",
            "olusturulma_tarihi": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "sube_id"         : int(os.getenv("BRANCH_ID", "1")),
            "sube_adi"        : os.getenv("BRANCH_NAME", "Merkez"),
            "geri_yukleme"    : (
                "1. PostgreSQL kurulu olduğundan emin olun.\n"
                "2. Boş bir veritabanı oluşturun: createdb market_db\n"
                "3. Dump'ı geri yükleyin: psql market_db < market.sql\n"
                "4. Backend .env dosyasını güncelleyin.\n"
                "5. Backend'i başlatın: python main.py"
            ),
        }

        if parola:
            # 7-Zip varsa güçlü AES-256 şifreleme kullan
            try:
                komut = [
                    "7za", "a",
                    f"-p{parola}",
                    "-mhe=on",     # başlıkları da şifrele
                    "-mx=9",       # maksimum sıkıştırma
                    str(zip_yolu),
                    str(sql_yolu),
                ]
                sonuc = subprocess.run(
                    komut,
                    capture_output = True,
                    text           = True,
                    timeout        = 120,
                )
                if sonuc.returncode == 0:
                    logger.info(f"7-Zip ile AES-256 şifreli ZIP oluşturuldu: {zip_yolu}")
                    return True
                else:
                    logger.warning(f"7za hatası: {sonuc.stderr} — standart ZIP'e geçiliyor")
            except FileNotFoundError:
                logger.warning("7za bulunamadı — standart ZIP oluşturulacak (şifresiz)")

        # Standart ZIP (7za yoksa veya parola belirtilmemişse)
        with zipfile.ZipFile(zip_yolu, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
            zf.write(sql_yolu, "market.sql")

            # config.json ekle
            zf.writestr(
                "config.json",
                json.dumps(config, ensure_ascii=False, indent=2),
            )

            # README.txt ekle
            readme = (
                "=== Market Yönetim Sistemi Yedek Dosyası ===\n\n"
                f"Oluşturulma: {config['olusturulma_tarihi']}\n"
                f"Şube: {config['sube_adi']}\n\n"
                "=== GERİ YÜKLEME ADIMLARI ===\n\n"
                f"{config['geri_yukleme']}\n"
            )
            zf.writestr("README.txt", readme)

        boyut_kb = zip_yolu.stat().st_size // 1024
        logger.info(f"ZIP oluşturuldu: {zip_yolu} ({boyut_kb} KB)")
        return True

    except Exception as e:
        logger.error(f"ZIP oluşturma hatası: {e}", exc_info=True)
        return False


# ============================================================
# ESKİ YEDEKLERİ TEMİZLE
# ============================================================

def _eski_yedekleri_sil(gun: int = 30) -> int:
    """30 günden eski yedek dosyalarını siler. Silinen dosya sayısını döner."""
    dizin  = _yedek_dizini()
    sinir  = datetime.now() - timedelta(days=gun)
    silinen = 0

    for dosya in dizin.glob("yedek_*.zip"):
        try:
            # Değiştirilme tarihi kontrol et
            if datetime.fromtimestamp(dosya.stat().st_mtime) < sinir:
                dosya.unlink()
                silinen += 1
                logger.info(f"Eski yedek silindi: {dosya.name}")
        except Exception as e:
            logger.warning(f"Yedek silinemedi: {dosya.name} — {e}")

    return silinen


# ============================================================
# ANA YEDEKLEME FONKSİYONU
# ============================================================

def yedek_al(mail_gonder: bool = True) -> dict:
    """
    Tam yedekleme işlemi:
    1. pg_dump ile SQL dump
    2. ZIP sıkıştır (+ parola)
    3. Local arşive kopyala
    4. 30 günden eski yedekleri temizle
    5. Mail gönder (opsiyonel)

    Returns:
        {basarili, zip_yolu, boyut_mb, mesaj}
    """
    bugun    = date.today().strftime("%d_%m_%Y")
    dizin    = _yedek_dizini()
    sql_yolu = dizin / f"market_{bugun}.sql"
    zip_yolu = dizin / f"yedek_{bugun}.zip"

    # ── 1. pg_dump ──
    logger.info("Yedekleme başladı...")
    if not _pg_dump(sql_yolu):
        return {
            "basarili": False,
            "zip_yolu": None,
            "boyut_mb": 0,
            "mesaj"   : "pg_dump başarısız oldu. Yedek alınamadı.",
        }

    # ── 2. ZIP ──
    parola = os.getenv("BACKUP_ENCRYPTION_KEY")
    if not _zip_olustur(sql_yolu, zip_yolu, parola):
        return {
            "basarili": False,
            "zip_yolu": None,
            "boyut_mb": 0,
            "mesaj"   : "ZIP oluşturma başarısız.",
        }

    # SQL dosyasını sil (ZIP'te var artık)
    try:
        sql_yolu.unlink()
    except Exception:
        pass

    # ── 3. Eski yedekleri temizle ──
    silinen = _eski_yedekleri_sil(gun=30)
    if silinen:
        logger.info(f"{silinen} eski yedek silindi.")

    boyut_mb = zip_yolu.stat().st_size / (1024 * 1024)
    logger.info(f"Yedek tamamlandı: {zip_yolu.name} ({boyut_mb:.1f} MB)")

    # ── 4. Mail gönder ──
    if mail_gonder:
        _yedek_maili_gonder(zip_yolu, boyut_mb)

    return {
        "basarili": True,
        "zip_yolu": str(zip_yolu),
        "boyut_mb": round(boyut_mb, 2),
        "mesaj"   : f"Yedek tamamlandı: {zip_yolu.name}",
    }


def _yedek_maili_gonder(zip_yolu: Path, boyut_mb: float) -> None:
    """Yedek tamamlandıktan sonra mail gönderir (hata olursa sadece loglar)."""
    try:
        from services.mailer      import yedek_maili
        from database             import get_db
        from sqlalchemy           import text

        # Günlük satış özeti
        ozet = {
            "tarih"       : date.today().strftime("%d.%m.%Y"),
            "toplam_satis": 0.0,
            "islem_sayisi": 0,
            "nakit"       : 0.0,
            "kart"        : 0.0,
        }

        try:
            from database import engine
            with engine.connect() as conn:
                bugun = date.today()
                sonuc = conn.execute(text("""
                    SELECT
                        COALESCE(SUM(total), 0) AS toplam,
                        COUNT(*)                AS islem,
                        COALESCE(SUM(CASE WHEN payment_type = 'cash'  THEN total ELSE 0 END), 0) AS nakit,
                        COALESCE(SUM(CASE WHEN payment_type = 'card'  THEN total ELSE 0 END), 0) AS kart
                    FROM sales
                    WHERE DATE(created_at) = :bugun
                      AND status = 'completed'
                """), {"bugun": bugun})
                satir = sonuc.fetchone()
                if satir:
                    ozet["toplam_satis"] = float(satir.toplam)
                    ozet["islem_sayisi"] = int(satir.islem)
                    ozet["nakit"]        = float(satir.nakit)
                    ozet["kart"]         = float(satir.kart)
        except Exception as e:
            logger.warning(f"Satış özeti sorgusu başarısız: {e}")

        alici   = os.getenv("REPORT_EMAIL", os.getenv("SMTP_EMAIL", ""))
        sube_adi = os.getenv("BRANCH_NAME", "Merkez")

        # Dosya boyutu sınırı: 20MB altıysa ek olarak gönder
        zip_eki = str(zip_yolu) if boyut_mb < 20 else None

        yedek_maili(
            alici    = alici,
            zip_yolu = zip_eki,
            z_raporu = None,
            ozet     = ozet,
            sube_adi = sube_adi,
        )

        if boyut_mb >= 20:
            logger.warning(
                f"Yedek dosyası {boyut_mb:.1f} MB — 20MB sınırını aşıyor. "
                "Ek olarak gönderilmedi, sadece özet maili gönderildi."
            )

    except Exception as e:
        logger.error(f"Yedek maili gönderilemedi: {e}", exc_info=True)
