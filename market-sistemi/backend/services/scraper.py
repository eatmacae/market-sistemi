"""
Market Yönetim Sistemi — Fiyat Takip Scraper
Her gece tedarikçi web sitelerini tarar, zam/indirim tespit eder ve mail gönderir.
Tedarikçi spesifik parser'lar bu dosyada kayıt edilir.
"""

import os
import logging
import httpx
import asyncio
from datetime  import date, datetime
from typing    import Optional
from sqlalchemy.orm import Session

logger = logging.getLogger("market_sistemi.scraper")


# ============================================================
# VERİ YAPILARI
# ============================================================

class FiyatSonucu:
    """Bir tedarikçiden çekilen tek ürün fiyatı."""
    def __init__(
        self,
        tedarikci_id  : int,
        tedarikci_adi : str,
        urun_kodu     : str,
        urun_adi      : str,
        fiyat         : float,
        para_birimi   : str = "TRY",
        url           : str = "",
    ):
        self.tedarikci_id  = tedarikci_id
        self.tedarikci_adi = tedarikci_adi
        self.urun_kodu     = urun_kodu
        self.urun_adi      = urun_adi
        self.fiyat         = fiyat
        self.para_birimi   = para_birimi
        self.url           = url
        self.tarih         = date.today()


# ============================================================
# TEDARİKÇİ PARSER ARAYÜZÜ
# ============================================================

class TedarikciParser:
    """
    Her tedarikçi için bu sınıftan türetilmiş bir sınıf yazılır.
    Tedarikçi web sitesine özgü HTML yapısı alt sınıfta işlenir.
    """

    tedarikci_id  : int = 0
    tedarikci_adi : str = "Bilinmeyen Tedarikçi"
    base_url      : str = ""

    def __init__(self):
        self.oturum_cookie: Optional[str] = None

    async def giris_yap(self, client: httpx.AsyncClient) -> bool:
        """
        Login gerektiren siteler için override edilir.
        Kullanıcı adı / şifre .env'den okunur.
        """
        return True   # Varsayılan: giriş gerekmez

    async def fiyatlari_cek(self, client: httpx.AsyncClient) -> list[FiyatSonucu]:
        """
        Tedarikçi sitesinden güncel fiyatları çeker.
        Alt sınıfta override edilmeli.
        """
        raise NotImplementedError(
            f"{self.__class__.__name__} sınıfı fiyatlari_cek() metodunu uygulamalı."
        )


# ============================================================
# KAYITLI TEDARİKÇİ PARSER'LAR
# Faz 4'te gerçek tedarikçiler eklenir, her biri ayrı dosyada
# ============================================================

_KAYITLI_PARSERLAR: list[type[TedarikciParser]] = [
    # Örnek: MetroParser, MigrosCasinoParser, CarrefourParser vb.
    # Her parser: market-sistemi/backend/services/scrapers/metro.py gibi
]


# ============================================================
# DEĞİŞİM TESPİTİ
# ============================================================

def _degisim_hesapla(eski_fiyat: float, yeni_fiyat: float) -> float:
    """Yüzdelik fiyat değişimini hesaplar."""
    if eski_fiyat <= 0:
        return 0.0
    return round((yeni_fiyat - eski_fiyat) / eski_fiyat * 100, 2)


def _degisimleri_kaydet(db: Session, sonuclar: list[FiyatSonucu]) -> list[dict]:
    """
    Yeni fiyatları mevcut fiyatlarla karşılaştırır.
    Değişim varsa fiyat tarihçesini kaydeder ve bildirim listesi döner.

    Returns:
        [{tedarikci, urun, eski_fiyat, yeni_fiyat, degisim_yuzde}, ...]
    """
    from models import Supplier   # circular import önlemi
    from services.audit_log import log_action

    degisimler = []

    for sonuc in sonuclar:
        try:
            # Tedarikçiyi bul
            tedarikci = db.query(Supplier).filter(
                Supplier.id         == sonuc.tedarikci_id,
                Supplier.is_deleted == False,
            ).first()

            if not tedarikci:
                continue

            # Ürünü bul (tedarikçi kodu ile)
            from models import Product
            urun = db.query(Product).filter(
                Product.supplier_code == sonuc.urun_kodu,
                Product.is_deleted    == False,
            ).first()

            if not urun:
                continue

            # Mevcut maliyet fiyatı ile karşılaştır
            eski_fiyat = float(urun.cost or 0)
            degisim    = _degisim_hesapla(eski_fiyat, sonuc.fiyat)

            # %1'den az değişimi görmezden gel (gürültü)
            if abs(degisim) < 1.0:
                continue

            # Audit log
            log_action(
                db          = db,
                action_type = "PRICE_SCRAPE",
                user_id     = None,
                table_name  = "products",
                record_id   = urun.id,
                old_value   = {"cost": eski_fiyat},
                new_value   = {"cost": sonuc.fiyat, "kaynak": sonuc.url},
                note        = f"Otomatik fiyat takibi: {sonuc.tedarikci_adi}",
                branch_id   = urun.branch_id,
            )

            degisimler.append({
                "tedarikci"      : sonuc.tedarikci_adi,
                "urun"           : urun.name,
                "eski_fiyat"     : eski_fiyat,
                "yeni_fiyat"     : sonuc.fiyat,
                "degisim_yuzde"  : degisim,
            })

        except Exception as e:
            logger.error(f"Fiyat kaydı hatası ({sonuc.urun_adi}): {e}", exc_info=True)

    db.commit()
    return degisimler


# ============================================================
# ANA SCRAPING FONKSİYONU
# ============================================================

async def tum_tedarikci_fiyatlarini_cek(db: Session) -> list[dict]:
    """
    Tüm kayıtlı tedarikçi parser'larını çalıştırır.
    Değişimleri kaydeder ve bildirim listesi döner.
    """
    if not _KAYITLI_PARSERLAR:
        logger.info("Kayıtlı tedarikçi parser'ı yok — scraping atlanıyor.")
        return []

    tum_sonuclar: list[FiyatSonucu] = []

    async with httpx.AsyncClient(
        timeout    = httpx.Timeout(30.0),
        follow_redirects = True,
        headers    = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        },
    ) as client:
        for ParserSinifi in _KAYITLI_PARSERLAR:
            parser = ParserSinifi()
            try:
                # Giriş yap (gerekiyorsa)
                giris_ok = await parser.giris_yap(client)
                if not giris_ok:
                    logger.warning(f"{parser.tedarikci_adi}: Giriş başarısız — atlanıyor")
                    _hata_maili_gonder(parser.tedarikci_adi, "Login başarısız")
                    continue

                # Fiyatları çek
                sonuclar = await parser.fiyatlari_cek(client)
                tum_sonuclar.extend(sonuclar)
                logger.info(f"{parser.tedarikci_adi}: {len(sonuclar)} ürün fiyatı çekildi")

            except httpx.ConnectError:
                mesaj = f"{parser.tedarikci_adi}: Siteye bağlanılamadı"
                logger.error(mesaj)
                _hata_maili_gonder(parser.tedarikci_adi, "Bağlantı hatası")

            except httpx.TimeoutException:
                mesaj = f"{parser.tedarikci_adi}: Bağlantı zaman aşımı"
                logger.error(mesaj)
                _hata_maili_gonder(parser.tedarikci_adi, "Zaman aşımı")

            except Exception as e:
                logger.error(f"{parser.tedarikci_adi}: Beklenmeyen hata — {e}", exc_info=True)
                _hata_maili_gonder(parser.tedarikci_adi, str(e))

            # Tedarikçiler arası bekleme (bot tespiti önlemi)
            await asyncio.sleep(2)

    if not tum_sonuclar:
        logger.info("Hiçbir tedarikçiden fiyat çekilemedi.")
        return []

    # Değişimleri kaydet ve bildirim listesi al
    degisimler = _degisimleri_kaydet(db, tum_sonuclar)

    logger.info(
        f"Scraping tamamlandı: {len(tum_sonuclar)} fiyat kontrol edildi, "
        f"{len(degisimler)} değişim tespit edildi."
    )

    # Değişimler varsa mail gönder
    if degisimler:
        try:
            from services.mailer import fiyat_zammi_maili
            alici    = os.getenv("REPORT_EMAIL", os.getenv("SMTP_EMAIL", ""))
            sube_adi = os.getenv("BRANCH_NAME", "Merkez")
            fiyat_zammi_maili(alici, degisimler, sube_adi)
        except Exception as e:
            logger.error(f"Fiyat değişim maili gönderilemedi: {e}")

    return degisimler


def _hata_maili_gonder(tedarikci: str, hata: str) -> None:
    """Scraping hatası olduğunda sessizce mail gönderir."""
    try:
        from services.mailer import mail_gonder
        alici    = os.getenv("REPORT_EMAIL", os.getenv("SMTP_EMAIL", ""))
        sube_adi = os.getenv("BRANCH_NAME", "Merkez")

        if not alici:
            return

        mail_gonder(
            alici      = alici,
            konu       = f"[{sube_adi}] ⚠️ Fiyat Takip Hatası: {tedarikci}",
            govde_html = f"<p>Tedarikçi: <b>{tedarikci}</b><br>Hata: {hata}</p>",
            govde_duz  = f"Tedarikçi: {tedarikci}\nHata: {hata}",
        )
    except Exception:
        pass  # Mail hatası kritik değil, sadece logla


# ============================================================
# SYNC WRAPPER (APScheduler sync scheduler için)
# ============================================================

def fiyat_tara(db: Session) -> list[dict]:
    """Senkron çağrı için async wrapper (APScheduler kullanır)."""
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        sonuc = loop.run_until_complete(tum_tedarikci_fiyatlarini_cek(db))
        return sonuc
    finally:
        loop.close()


def tek_tedarikci_tara(
    db          : Session,
    tedarikci_id: int,
    tedarikci_adi: str,
    url         : str,
    kullanici   : Optional[str] = None,
    sifre       : Optional[str] = None,
    branch_id   : int = 1,
) -> list[dict]:
    """
    Tek tedarikçi için manuel fiyat taraması — arka planda çağrılır.
    suppliers.py /scan endpoint'i bu fonksiyonu tetikler.

    Kayıtlı parser varsa onu kullanır, yoksa genel HTTP GET dener.
    """
    async def _calistir():
        # Kayıtlı parser var mı?
        for ParserSinifi in _KAYITLI_PARSERLAR:
            parser = ParserSinifi()
            if parser.tedarikci_id == tedarikci_id:
                async with httpx.AsyncClient(
                    timeout          = httpx.Timeout(30.0),
                    follow_redirects = True,
                ) as client:
                    giris_ok = await parser.giris_yap(client)
                    if not giris_ok:
                        logger.warning(f"{tedarikci_adi}: Giriş başarısız.")
                        return []
                    sonuclar = await parser.fiyatlari_cek(client)
                    return _degisimleri_kaydet(db, sonuclar)

        # Parser bulunamadı — genel HTTP GET dene (sadece bağlantı testi)
        logger.info(f"{tedarikci_adi}: Kayıtlı parser yok, bağlantı testi yapılıyor...")
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
                yanit = await client.get(url)
                logger.info(f"{tedarikci_adi}: HTTP {yanit.status_code}")
        except Exception as e:
            logger.error(f"{tedarikci_adi}: Bağlantı hatası — {e}")

        return []

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        sonuc = loop.run_until_complete(_calistir())
        return sonuc
    finally:
        loop.close()
