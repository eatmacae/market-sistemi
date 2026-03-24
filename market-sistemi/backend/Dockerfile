# ============================================================
# Market Yönetim Sistemi — Backend Dockerfile
# Python 3.12 slim tabanlı, production için optimize edilmiş
# ============================================================

FROM python:3.12-slim

# Çalışma dizini
WORKDIR /app

# Sistem bağımlılıkları (psycopg2 için libpq-dev)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python bağımlılıkları — önce requirements.txt kopyala (layer cache için)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Uygulama kodunu kopyala
COPY . .

# Yedek dizinini oluştur
RUN mkdir -p /app/backups

# Port
EXPOSE 8000

# Sağlık kontrolü
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Başlangıç komutu
# Önce migration çalıştırır, sonra sunucuyu başlatır
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1"]
