# Market Yönetim Sistemi — İlerleme Günlüğü

> Bu dosyayı her oturum başında oku. Nerede kaldığımızı, ne bittiğini, sırada ne olduğunu gösterir.
> Son güncelleme: 2026-03-25

---

## 📁 Proje Yapısı

```
ATM/
├── market-sistemi/
│   ├── backend/          FastAPI + PostgreSQL
│   ├── mobile/           React Native + Expo SDK 51
│   └── installer/        Electron (Windows kurulum sihirbazı)
├── AGENTS/               Market projesi agent ekibi (10 agent)
├── AGENTS_OYUN/          Oyun projesi agentları (ileride kullanmak için saklandı)
├── docs/                 Teknik dökümanlar
├── CLAUDE.md             Proje kuralları (MUTLAKA OKU)
└── PROGRESS.md           ← Bu dosya
```

---

## ✅ Tamamlanan Fazlar

| Faz | Açıklama | Durum |
|-----|----------|-------|
| Faz 0 | Altyapı & Güvenlik | ✅ |
| Faz 1 | Fatura İşleme & Ürün | ✅ |
| Faz 2 | Kasa & Satış | ✅ |
| Faz 3 | Analiz & Yedekleme | ✅ |
| Faz 4 | Personel, Müşteri & Kampanya | ✅ |
| Faz 5 | Market Sahibi Paneli & Hedefler | ✅ |
| Faz 6 | Sistem & Ayarlar | ✅ |
| Faz 7 | Çok Şubeli Mod (opsiyonel) | ✅ |
| Faz 8 | Yazılım Satış Altyapısı (Electron) | ✅ |

---

## ✅ Bu Oturumda Tamamlananlar (2026-03-25)

### 1. AGENTS/ Klasörü Düzenlendi
- Oyun agentları temizlendi, market agentları yazıldı
- 10 agent oluşturuldu: ProjectManager, BackendDeveloper, LeadDeveloper, MobileDeveloper, DatabaseEngineer, UIDeveloper, SecurityEngineer, SalesInfrastructure, QAEngineer, DevOps
- Oyun agentları `AGENTS_OYUN/` altında korundu (ileride başka projeye kopyalanacak)

### 2. Eksik Mobil Ekranlar Tamamlandı
Aşağıdaki ekranlar sıfırdan yazıldı:

| Dosya | Açıklama |
|-------|----------|
| `mobile/app/(yonetim)/urun-form.tsx` | Ürün ekle/düzenle formu |
| `mobile/app/(yonetim)/stok-hareket.tsx` | Stok hareketi girişi (adjust/waste/receive) |
| `mobile/app/(yonetim)/musteri-form.tsx` | Müşteri ekle/düzenle formu |

### 3. Offline Banner — 15 Ekrana Eklendi
`🔴 Offline · X işlem bekliyor` göstergesi eksik olan tüm ekranlara eklendi:
- `(kasa)/payment.tsx`, `session-open.tsx`
- `(auth)/login.tsx`, `activate.tsx`
- `(tabs)/settings.tsx`
- `(yonetim)/backup.tsx`, `campaigns.tsx`, `customers.tsx`, `invoices.tsx`, `personnel.tsx`, `suppliers.tsx`, `system-settings.tsx`, `targets.tsx`, `transfers.tsx`, `branches.tsx`

### 4. Backend Pytest Testleri — 71/71 ✅

**Dosyalar:**
```
backend/tests/
├── __init__.py
├── conftest.py       SQLite in-memory test DB, tüm fixture'lar
├── test_auth.py      12 test — Login, PIN, token doğrulama
├── test_products.py  20 test — CRUD, soft delete, branch izolasyonu
├── test_stock.py     18 test — adjust, waste, receive, hareketler
└── test_security.py  21 test — RBAC, SQL injection, health check
```

**Çözülen sorunlar:**
- `APP_ENV=production` ile lifespan PostgreSQL bağlantısı skip edildi
- `BigInteger` primary key SQLite uyumsuzluğu → `audit_log.log_action` mock edildi
- `/api/health` endpoint `get_db` dependency injection kullanacak şekilde güncellendi

**Üretim kodunda düzeltilen güvenlik açıkları:**
- `GET/PATCH/DELETE /api/products/{id}` artık `current_user.branch_id` filtresi uyguluyor
- `ProductBase.price` → `gt=0` (negatif fiyat artık reddediliyor)
- `ProductBase.name` → `max_length=200` (çok uzun isim artık reddediliyor)

**Testleri çalıştırmak için:**
```bash
cd market-sistemi/backend
venv/Scripts/python.exe -m pytest tests/ -v
```

### 5. Mobile Jest Testleri — 67/67 ✅

**Dosyalar:**
```
mobile/
├── jest.setup.ts
├── __mocks__/
│   └── expo-sqlite.ts     SQLite manual mock
└── __tests__/
    ├── stores/
    │   ├── cartStore.test.ts    15 test
    │   ├── stockStore.test.ts   11 test
    │   └── authStore.test.ts     8 test
    ├── components/
    │   ├── Badge.test.tsx       12 test
    │   └── Button.test.tsx      11 test
    └── services/
        └── storage.test.ts     10 test
```

**Kurulum (package.json'a eklendi):**
- `jest-expo@51`, `@testing-library/react-native@13`, `@testing-library/jest-native`
- `react-test-renderer@18.2.0` (Expo SDK 51 uyumlu)
- `moduleNameMapper` ile AsyncStorage mock
- `__mocks__/expo-sqlite.ts` hoisting sorununu çözdü

**Testleri çalıştırmak için:**
```bash
cd market-sistemi/mobile
npm test
```

---

## 🔴 Bekleyen / Yapılmayan İşler

### Orta Öncelik
- [ ] **E2E testler** — Detox veya Maestro ile gerçek cihaz/emülatör testleri
- [ ] **Backend coverage raporu** — `pytest --cov=. --cov-report=html`
- [ ] **Mobile test coverage** — `npm test -- --coverage`
- [ ] **CI/CD pipeline** — GitHub Actions ile otomatik test + build

### Düşük Öncelik
- [ ] **Electron installer testi** — Windows kurulum sihirbazı son kontrol
- [ ] **Lisans sistemi testi** — Aktivasyon/doğrulama akışı
- [ ] **Çok şube gerçek test** — Farklı branch_id'lerle tam akış

### İsteğe Bağlı
- [ ] **Push notification** — Stok uyarısı, kampanya bildirimi
- [ ] **Barkod yazıcı entegrasyonu** — Bluetooth thermal printer
- [ ] **Muhasebe entegrasyonu** — Logo / Mikro export

---

## 🏗️ Teknik Referans

### Backend Çalıştırma
```bash
cd market-sistemi/backend
venv/Scripts/python.exe -m uvicorn main:app --reload
# http://localhost:8000/docs
```

### Mobile Çalıştırma
```bash
cd market-sistemi/mobile
npx expo start
# Tablet/emülatörde landscape modda çalışır
```

### Veritabanı
- Üretim: PostgreSQL 15 (`.env` içinde `DATABASE_URL`)
- Test: SQLite in-memory (otomatik, PostgreSQL gerekmez)
- Offline cache: SQLite (`market_offline.db` — tablette yerel)

### Önemli Ortam Değişkenleri (.env)
```
DATABASE_URL=postgresql://user:pass@localhost/market_db
SECRET_KEY=...
BRANCH_ID=1
BRANCH_NAME=Merkez
APP_ENV=production   # development → otomatik create_tables() çağırır
```

---

## 📋 Kod Kuralları (CLAUDE.md özeti)

- `useTheme()` zorunlu — hardcode renk YASAK
- Soft delete: `is_deleted`, `deleted_at` — gerçek silme YASAK
- Her tabloda `branch_id` olacak
- Her kritik işlemde `audit_log.log_action()` zorunlu
- Min 48px dokunma alanı
- Her ekranda loading / empty / error / offline state zorunlu
- `.env` dışında credential olmayacak
- Türkçe yorum satırları

---

## 🔗 GitHub

```
https://github.com/eatmacae/market-sistemi
```

Son commit: `feat: Windows kurulum sihirbazı (Electron) eklendi`
(Test dosyaları henüz commit edilmedi — bir sonraki oturumda push edilebilir)
