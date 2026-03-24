"""
Market Yönetim Sistemi — Veritabanı Bağlantısı
PostgreSQL + SQLAlchemy 2.x sync engine
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base  # SQLAlchemy 2.x yolu
from dotenv import load_dotenv
import os

# Ortam değişkenlerini yükle
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/market_db")

# SQLAlchemy engine oluştur
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,       # Bağlantı kontrolü — kopuk bağlantıları otomatik yenile
    pool_size=10,             # Havuz boyutu
    max_overflow=20,          # Maksimum ekstra bağlantı
    echo=os.getenv("DEBUG", "false").lower() == "true",  # SQL sorgularını logla (sadece dev)
)

# Oturum fabrikası
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Tüm modeller bu Base sınıfından türer
Base = declarative_base()


def get_db():
    """
    FastAPI dependency injection için veritabanı oturumu sağlar.
    Her request'te yeni oturum açar, bittikten sonra kapatır.
    Kullanım: db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """
    Tüm tabloları oluşturur (geliştirme ortamı için).
    Production'da Alembic migration kullanılır.
    """
    Base.metadata.create_all(bind=engine)
