# 🏪 Market Yönetim Sistemi — Kurulum Kılavuzu

> Local çalışan, sıfır aylık maliyetli market yönetim sistemi.

---

## Gereksinimler

| Bileşen | Minimum | Önerilen |
|---|---|---|
| İşlemci | Çift çekirdek | Dört çekirdek |
| RAM | 2 GB | 4 GB |
| Disk | 20 GB | 50 GB |
| İşletim Sistemi | Windows 10 / Ubuntu 22.04 | Ubuntu 22.04 LTS |
| Tablet (kasa) | Android 10+ veya iOS 14+ | Android 12+ |
| Ağ | Yerel Wi-Fi | Gigabit LAN |

---

## Seçenek A — Docker ile Kurulum (Önerilen)

En kolay yöntem. Docker kurulu olan her sisteme 3 komutla çalışır.

### 1. Docker'ı Kur

**Windows:** https://docs.docker.com/desktop/install/windows-install/
**Linux (Ubuntu):**
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

### 2. Projeyi İndir

```bash
# USB ile kopyala veya git clone yap
cd /opt
git clone https://github.com/KULLANICI/market-sistemi.git
cd market-sistemi
```

### 3. Ortam Dosyasını Hazırla

```bash
cp backend/.env.example backend/.env
nano backend/.env   # veya notepad backend\.env (Windows'ta)
```

**Mutlaka değiştirin:**
```env
BRANCH_NAME=Mahallem Market        # Kendi market adınız
SECRET_KEY=...                     # python -c "import secrets; print(secrets.token_hex(32))"
BACKUP_ENCRYPTION_KEY=...          # python -c "import secrets; print(secrets.token_hex(32))"
SMTP_EMAIL=market@gmail.com        # E-posta bildirimleri için (opsiyonel)
SMTP_PASSWORD=xxxx xxxx xxxx xxxx  # Gmail uygulama şifresi (opsiyonel)
ANTHROPIC_API_KEY=sk-ant-...       # PDF fatura okuma için (opsiyonel)
```

### 4. Çalıştır

```bash
docker-compose up -d
```

İlk açılışta PostgreSQL + backend başlar, migration otomatik uygulanır.

### 5. İlk Veriyi Ekle

```bash
docker-compose exec backend python seed.py
```

Çıktıda giriş bilgilerini göreceksiniz:
```
E-posta : admin@market.local
Şifre   : admin123   ← HEMEN DEĞİŞTİRİN
PIN     : 123456     ← HEMEN DEĞİŞTİRİN
```

### 6. API Durumunu Kontrol Et

```bash
curl http://localhost:8000/api/health
# {"status":"ok","version":"1.0.0",...}
```

Tarayıcıdan: **http://sunucu-ip:8000/api/docs**

---

## Seçenek B — Manuel Kurulum (Docker olmadan)

### 1. Python 3.12 Kur

**Windows:** https://www.python.org/downloads/
**Linux:** `sudo apt install python3.12 python3.12-venv`

### 2. PostgreSQL 15 Kur

**Windows:** https://www.postgresql.org/download/windows/
**Linux:**
```bash
sudo apt install postgresql-15
sudo -u postgres psql -c "CREATE USER market_user WITH PASSWORD 'sifreniz';"
sudo -u postgres psql -c "CREATE DATABASE market_db OWNER market_user;"
```

### 3. Backend Bağımlılıklarını Kur

```bash
cd market-sistemi/backend

# Sanal ortam oluştur (önerilen)
python -m venv .venv
source .venv/bin/activate      # Linux/Mac
.venv\Scripts\activate         # Windows

pip install -r requirements.txt
```

### 4. Ortam Dosyasını Hazırla

```bash
cp .env.example .env
# .env dosyasını düzenle — DATABASE_URL, SECRET_KEY, BACKUP_ENCRYPTION_KEY
```

### 5. Veritabanı Tablolarını Oluştur

```bash
alembic upgrade head
```

### 6. İlk Veriyi Ekle

```bash
python seed.py
```

### 7. Sunucuyu Başlat

```bash
python main.py
# veya:
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

---

## Tablet Uygulamasını Yükle

### Geliştirme / Test Ortamı

```bash
cd market-sistemi/mobile
npm install
npx expo start
# QR kodu Expo Go uygulamasıyla okutun
```

### Production (APK / IPA)

```bash
cd market-sistemi/mobile

# Android APK
npx expo build:android

# iOS IPA (Mac gerektirir)
npx expo build:ios
```

### Tablet Ayarları

1. Uygulamayı açın
2. **Ayarlar** → Sunucu URL'i: `http://192.168.1.x:8000`
   (Sunucu bilgisayarın yerel IP'si — `ipconfig` / `ip a` ile bulun)
3. `admin@market.local` / `admin123` ile giriş yapın
4. Şifreyi ve PIN'i hemen değiştirin!

---

## Ağ Yapılandırması

```
Yerel Ağ (Wi-Fi/LAN)
┌─────────────────────────────────────────┐
│                                         │
│  [Sunucu/PC]          [Tablet — Kasa]   │
│  192.168.1.100:8000 ←→ Expo App         │
│                                         │
│  [Tablet — Müşteri]   [Tablet — Depo]  │
│  Müşteri Ekranı       Stok/Raporlar     │
└─────────────────────────────────────────┘
```

Sunucu sabit IP almalıdır:
- **Windows:** Ağ Ayarları → Adaptör Özellikleri → IPv4 → Elle girin
- **Linux:** `/etc/netplan/` veya router'da MAC ile rezervasyon

---

## Güncelleme

### Docker ile:
```bash
git pull
docker-compose down
docker-compose up -d --build
```

### Manuel:
```bash
git pull
cd backend
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
# Sunucuyu yeniden başlat
```

---

## Olası Sorunlar

### "Sunucuya bağlanılamıyor" (Tablette)
- Sunucu ve tablet aynı Wi-Fi ağında mı?
- Sunucu IP'si doğru mu? (`ipconfig` ile kontrol)
- Güvenlik duvarı 8000 portunu engelliyor mu?
  ```bash
  # Windows: Gelen bağlantılara 8000 portu izni ver
  netsh advfirewall firewall add rule name="Market API" dir=in action=allow protocol=TCP localport=8000
  # Linux:
  sudo ufw allow 8000
  ```

### "alembic: command not found"
```bash
source .venv/bin/activate   # Sanal ortamı aktive et
pip install alembic
```

### PostgreSQL bağlantı hatası
```bash
# Servis çalışıyor mu?
sudo systemctl status postgresql
# Kullanıcı/şifre doğru mu?
psql -U market_user -d market_db -h localhost
```

### Docker "port already in use"
```bash
# 5432 portunu kullanan process'i bul
sudo lsof -i :5432
# Docker container'ı yeniden başlat
docker-compose down && docker-compose up -d
```

---

## Yedekleme

Otomatik yedekleme her gece 02:00'da çalışır.
Manuel yedek almak için:

```bash
# Docker ile:
docker-compose exec backend python -c "from services.backup import yedek_al; print(yedek_al())"

# Manuel:
cd backend && python -c "from services.backup import yedek_al; print(yedek_al())"
```

Yedekler `backend/backups/` dizinine kaydedilir.

---

## Destek

Sorun yaşarsanız sunucu loglarını inceleyin:

```bash
# Docker:
docker-compose logs backend --tail=50

# Manuel:
tail -f /var/log/market-sistemi.log
```

---

*Market Yönetim Sistemi v1.0 — Tüm hakları saklıdır.*
