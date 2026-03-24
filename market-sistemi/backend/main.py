"""
Market Yönetim Sistemi — FastAPI Uygulama Giriş Noktası
Tüm route'lar, middleware'ler ve zamanlayıcı burada başlatılır.
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from dotenv import load_dotenv
import logging
import os

# Modelleri yükle — create_tables() çağrısından ÖNCE olmalı
import models  # noqa: tüm SQLAlchemy modelleri Base.metadata'ya kaydedilir

# Tüm route'ları import et
from routes.auth       import router as auth_router
from routes.categories import router as categories_router
from routes.products   import router as products_router
from routes.stock      import router as stock_router
from routes.invoices   import router as invoices_router
from routes.sessions   import router as sessions_router
from routes.customers  import router as customers_router
from routes.sales      import router as sales_router
from routes.reports    import router as reports_router
from routes.personnel  import router as personnel_router
from routes.campaigns  import router as campaigns_router
from routes.targets    import router as targets_router

from routes.suppliers  import router as suppliers_router
from routes.display    import router as display_router
from routes.settings   import router as settings_router

from database import create_tables

# Ortam değişkenlerini yükle
load_dotenv()

# Loglama ayarları
logging.basicConfig(
    level   = logging.INFO,
    format  = "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt = "%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("market_sistemi")

# APScheduler — gece otomatik görevler için
scheduler = BackgroundScheduler(timezone="Europe/Istanbul")


# ============================================================
# ZAMANLANMIŞ GÖREVLER (APScheduler)
# Faz 3'te dolduralacak — şimdilik iskelet hazır
# ============================================================

def gece_stok_raporu():
    """
    Her gece 23:00'da çalışır.
    Kritik stok seviyesindeki ürünleri tespit eder ve mail gönderir.
    """
    logger.info("Gece görevi: stok raporu kontrol ediliyor...")
    try:
        from database         import SessionLocal
        from models           import Product
        from services.mailer  import stok_uyari_maili

        db       = SessionLocal()
        alici    = os.getenv("REPORT_EMAIL", os.getenv("SMTP_EMAIL", ""))
        sube_adi = os.getenv("BRANCH_NAME", "Merkez")
        branch_id = int(os.getenv("BRANCH_ID", "1"))

        kritik = db.query(Product).filter(
            Product.branch_id  == branch_id,
            Product.is_deleted == False,
            Product.stock_qty  <= Product.min_stock,
        ).all()

        if kritik and alici:
            urunler = [
                {
                    "name"      : u.name,
                    "stock_qty" : u.stock_qty,
                    "min_stock" : u.min_stock,
                    "unit"      : u.unit,
                }
                for u in kritik
            ]
            stok_uyari_maili(alici, urunler, sube_adi)
            logger.info(f"Stok uyarı maili gönderildi: {len(kritik)} kritik ürün")
        else:
            logger.info("Kritik stok yok — mail gönderilmedi.")

        db.close()

    except Exception as e:
        logger.error(f"Gece stok raporu hatası: {e}", exc_info=True)


def gece_yedek_al():
    """
    Her gece 02:00'da çalışır.
    Veritabanını ZIP'ler (7-Zip ile AES-256 varsa), local arşive kaydeder ve mail gönderir.
    """
    logger.info("Gece görevi: otomatik yedekleme başlıyor...")
    try:
        from services.backup import yedek_al
        sonuc = yedek_al(mail_gonder=True)
        if sonuc["basarili"]:
            logger.info(f"Yedek tamamlandı: {sonuc['mesaj']}")
        else:
            logger.error(f"Yedek başarısız: {sonuc['mesaj']}")
    except Exception as e:
        logger.error(f"Yedekleme hatası: {e}", exc_info=True)


def skt_kontrol():
    """
    Her sabah 08:00'da çalışır.
    Son kullanma tarihi yaklaşan ürünleri kontrol eder ve mail gönderir.
    """
    logger.info("Sabah görevi: son kullanma tarihi kontrolü...")
    try:
        from database        import SessionLocal
        from models          import Product
        from services.mailer import skt_uyari_maili
        from datetime        import date, timedelta

        db        = SessionLocal()
        alici     = os.getenv("REPORT_EMAIL", os.getenv("SMTP_EMAIL", ""))
        sube_adi  = os.getenv("BRANCH_NAME", "Merkez")
        branch_id = int(os.getenv("BRANCH_ID", "1"))
        gun_sinir = int(os.getenv("SKT_UYARI_GUN", "30"))
        sinir_tarih = date.today() + timedelta(days=gun_sinir)

        yaklasan = db.query(Product).filter(
            Product.branch_id  == branch_id,
            Product.is_deleted == False,
            Product.expiry_date != None,
            Product.expiry_date <= sinir_tarih,
            Product.stock_qty   > 0,
        ).all()

        if yaklasan and alici:
            urunler = [
                {
                    "name"       : u.name,
                    "expiry_date": str(u.expiry_date),
                    "stock_qty"  : u.stock_qty,
                    "unit"       : u.unit,
                }
                for u in yaklasan
            ]
            skt_uyari_maili(alici, urunler, gun_sinir, sube_adi)
            logger.info(f"SKT uyarı maili gönderildi: {len(yaklasan)} ürün")
        else:
            logger.info("SKT yaklaşan ürün yok — mail gönderilmedi.")

        db.close()

    except Exception as e:
        logger.error(f"SKT kontrol hatası: {e}", exc_info=True)


def sabah_fiyat_tara():
    """
    Her sabah 06:00'da çalışır.
    Tedarikçi web sitelerini tarar, zam/indirim tespit eder.
    """
    logger.info("Sabah görevi: fiyat tarama başlıyor...")
    try:
        from database         import SessionLocal
        from services.scraper import fiyat_tara

        db    = SessionLocal()
        sonuc = fiyat_tara(db)
        db.close()

        logger.info(f"Fiyat tarama tamamlandı: {len(sonuc)} değişim tespit edildi.")

    except Exception as e:
        logger.error(f"Fiyat tarama hatası: {e}", exc_info=True)


# ============================================================
# UYGULAMA YAŞAM DÖNGÜSÜ
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Uygulama başlangıç ve kapanış işlemleri"""
    # Başlangıç
    logger.info("Market Yönetim Sistemi başlatılıyor...")

    # Geliştirme ortamında tabloları otomatik oluştur
    if os.getenv("APP_ENV", "development") == "development":
        create_tables()
        logger.info("Veritabanı tabloları hazır.")

    # APScheduler görevlerini kaydet ve başlat
    scheduler.add_job(gece_stok_raporu, CronTrigger(hour=23, minute=0),  id="stok_raporu")
    scheduler.add_job(gece_yedek_al,    CronTrigger(hour=2,  minute=0),  id="yedek_al")
    scheduler.add_job(skt_kontrol,      CronTrigger(hour=8,  minute=0),  id="skt_kontrol")
    scheduler.add_job(sabah_fiyat_tara, CronTrigger(hour=6,  minute=0),  id="fiyat_tara")
    scheduler.start()
    logger.info("APScheduler başlatıldı (4 zamanlanmış görev).")

    logger.info(
        f"Sunucu çalışıyor: http://{os.getenv('APP_HOST', '0.0.0.0')}:{os.getenv('APP_PORT', '8000')}"
    )
    logger.info(f"Şube: {os.getenv('BRANCH_NAME', 'Merkez')} (ID: {os.getenv('BRANCH_ID', '1')})")

    yield  # Uygulama çalışıyor

    # Kapanış — scheduler'ı düzgün durdur
    scheduler.shutdown()
    logger.info("Market Yönetim Sistemi kapatılıyor...")


# ============================================================
# FASTAPI UYGULAMASI
# ============================================================

app = FastAPI(
    title       = "Market Yönetim Sistemi API",
    description = "Local çalışan, çok şubeli market yönetim sistemi backend API'si.",
    version     = "1.0.0",
    lifespan    = lifespan,
    docs_url    = "/api/docs",
    redoc_url   = "/api/redoc",
    openapi_url = "/api/openapi.json",
)


# ============================================================
# MIDDLEWARE'LER
# ============================================================

# CORS — React Native uygulaması local ağdan erişir
app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],    # Production'da tablet IP'leriyle sınırlandır
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Her HTTP isteğini loglar (sadece geliştirme ortamında detaylı)"""
    if os.getenv("DEBUG", "false").lower() == "true":
        logger.debug(f"{request.method} {request.url.path}")

    response = await call_next(request)

    # 4xx ve 5xx hataları her zaman logla
    if response.status_code >= 400:
        logger.warning(f"{request.method} {request.url.path} → {response.status_code}")

    return response


# ============================================================
# HATA YÖNETİMİ
# ============================================================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Yakalanmayan tüm hatalar için Türkçe hata mesajı döner"""
    logger.error(f"Beklenmeyen hata: {exc}", exc_info=True)
    return JSONResponse(
        status_code = 500,
        content     = {
            "success": False,
            "message": "Beklenmeyen bir hata oluştu. Lütfen sistem yöneticisiyle iletişime geçin.",
            "detail" : str(exc) if os.getenv("DEBUG", "false").lower() == "true" else None,
        },
    )


# ============================================================
# ROUTE'LAR
# ============================================================

app.include_router(auth_router)
app.include_router(categories_router)
app.include_router(products_router)
app.include_router(stock_router)
app.include_router(invoices_router)
app.include_router(sessions_router)
app.include_router(customers_router)
app.include_router(sales_router)
app.include_router(reports_router)
app.include_router(personnel_router)
app.include_router(campaigns_router)
app.include_router(targets_router)

app.include_router(suppliers_router)
app.include_router(display_router)
app.include_router(settings_router)


# ============================================================
# SAĞLIK KONTROLÜ
# ============================================================

@app.get("/api/health", tags=["Sistem"])
async def health_check():
    """Sunucu ve veritabanı sağlık kontrolü"""
    from database import engine
    from sqlalchemy import text

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception as e:
        db_status = f"hata: {str(e)}"

    return {
        "status"     : "ok" if db_status == "ok" else "hata",
        "version"    : "1.0.0",
        "branch_id"  : int(os.getenv("BRANCH_ID", "1")),
        "branch_name": os.getenv("BRANCH_NAME", "Merkez"),
        "database"   : db_status,
        "environment": os.getenv("APP_ENV", "development"),
    }


# ============================================================
# UYGULAMA BAŞLATMA
# ============================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host    = os.getenv("APP_HOST", "0.0.0.0"),
        port    = int(os.getenv("APP_PORT", "8000")),
        reload  = os.getenv("APP_ENV", "development") == "development",
        workers = 1,  # Local kullanım için tek worker yeterli
    )
