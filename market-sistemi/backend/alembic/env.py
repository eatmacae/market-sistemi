"""
Market Yönetim Sistemi — Alembic Ortam Yapılandırması
Migration çalıştırmak için: alembic upgrade head
Yeni migration: alembic revision --autogenerate -m "açıklama"
"""

from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from dotenv import load_dotenv
import os
import sys

# Backend dizinini Python yoluna ekle — modelleri import edebilmek için
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Ortam değişkenlerini yükle
load_dotenv()

# Alembic Config nesnesi
config = context.config

# .env'den veritabanı URL'ini al
database_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/market_db")
config.set_main_option("sqlalchemy.url", database_url)

# Loglama yapılandırması
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Tüm modelleri import et — autogenerate için gerekli
from database import Base
import models  # noqa: tüm modeller burada tanımlı

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """
    Offline mod — veritabanı bağlantısı olmadan SQL dosyası üretir.
    Kullanım: alembic upgrade head --sql > migration.sql
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url                    = url,
        target_metadata        = target_metadata,
        literal_binds          = True,
        dialect_opts           = {"paramstyle": "named"},
        compare_type           = True,   # Kolon tipi değişikliklerini algıla
        compare_server_default = True,   # Default değer değişikliklerini algıla
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Online mod — gerçek veritabanına migration uygular.
    Kullanım: alembic upgrade head
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix        = "sqlalchemy.",
        poolclass     = pool.NullPool,  # Migration için bağlantı havuzu kullanma
    )

    with connectable.connect() as connection:
        context.configure(
            connection             = connection,
            target_metadata        = target_metadata,
            compare_type           = True,
            compare_server_default = True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
