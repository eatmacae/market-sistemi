# 🏪 Market Yönetim Sistemi
## Geliştirme Hazırlık Dökümanı — Final v3.0

> **Geliştirici:** Erhan  
> **Geliştirme Aracı:** Claude Code  
> **Versiyon:** 3.0 — Mart 2026  

---

## 📌 Proje Vizyonu

Bu sistem; manuel veri girişini sıfıra indiren, PDF / Excel / Word faturalarını otomatik okuyarak stok ve fiyatları güncelleyen, market içindeki her kuruşun takibini saniyelik Audit Log ile sağlayan ve tamamen local çalışan profesyonel bir işletme yönetim aracıdır.

**Temel Felsefe:**
- Çalışan sadece işini yapsın, sistem geri kalanını halletsin
- Sıfır aylık maliyet (Claude API hariç)
- Tamamen offline çalışabilir
- Baştan çok şubeli yapıya hazır, tek tuşla aktif edilir
- Yazılım olarak satılabilir, lisanslı ürün

---

## 🛠️ Teknoloji Stack

| Katman | Teknoloji | Versiyon | Not |
|---|---|---|---|
| Mobil | React Native + Expo | SDK 51+ | iOS + Android tek codebase |
| UI | NativeWind (Tailwind RN) | 4.x | Tema desteği |
| State | Zustand | 4.x | Kasa & stok state |
| Backend | Python FastAPI | 0.111+ | Local bilgisayarda çalışır |
| Veritabanı | PostgreSQL | 15+ | Şubeli yapıya hazır |
| ORM | SQLAlchemy | 2.x | |
| Migration | Alembic | Latest | DB migration koruması |
| Offline Cache | SQLite | Built-in | Her tablette |
| Dosya İşleme | Pandas, ReportLab, python-docx | Latest | Fatura analizi |
| Zamanlayıcı | APScheduler | 3.x | Gece otomatik görevler |
| Güvenlik | JWT + AES-256 | | Oturum & yedek şifreleme |
| Mail | Gmail SMTP | Built-in | Ücretsiz |
| PDF Parse | Claude API (Anthropic) | Latest | Sadece fatura okuma |
| VPN | WireGuard | Latest | Uzak şube (opsiyonel) |

---

## 📁 Proje Klasör Yapısı

```
market-sistemi/
│
├── backend/
│   ├── main.py                    ← FastAPI app + scheduler
│   ├── database.py                ← PostgreSQL bağlantısı
│   ├── models.py                  ← SQLAlchemy modelleri
│   ├── schemas.py                 ← Pydantic şemaları
│   ├── .env                       ← Tüm credential'lar
│   ├── requirements.txt
│   │
│   ├── routes/
│   │   ├── products.py
│   │   ├── stock.py
│   │   ├── sales.py
│   │   ├── customers.py
│   │   ├── suppliers.py
│   │   ├── reports.py
│   │   ├── personnel.py
│   │   ├── campaigns.py
│   │   ├── display.py             ← Müşteri display WebSocket
│   │   └── settings.py
│   │
│   └── services/
│       ├── scraper.py             ← Fiyat takip
│       ├── mailer.py              ← Gmail SMTP
│       ├── backup.py              ← Otomatik yedek
│       ├── invoice_parser.py      ← PDF/Excel/Word fatura okuma
│       ├── audit_log.py           ← Denetim izi
│       └── license.py             ← Lisans doğrulama
│
├── mobile/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login.tsx
│   │   ├── (kasa)/
│   │   │   ├── index.tsx          ← Kasa ana ekranı
│   │   │   ├── payment.tsx        ← Ödeme ekranı
│   │   │   └── display.tsx        ← Müşteri display ekranı
│   │   ├── (tabs)/
│   │   │   ├── dashboard.tsx
│   │   │   ├── stock.tsx
│   │   │   ├── reports.tsx
│   │   │   └── settings.tsx
│   │   └── _layout.tsx
│   │
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Input.tsx
│   │   │   └── Modal.tsx
│   │   └── features/
│   │       ├── BarcodeScanner.tsx
│   │       ├── CartItem.tsx
│   │       ├── StockItem.tsx
│   │       └── CustomerDisplay.tsx
│   │
│   ├── stores/
│   │   ├── cartStore.ts
│   │   ├── stockStore.ts
│   │   ├── authStore.ts
│   │   └── settingsStore.ts       ← Tema tercihi
│   │
│   ├── services/
│   │   ├── api.ts                 ← Axios instance
│   │   └── storage.ts             ← SQLite offline cache
│   │
│   ├── hooks/
│   │   └── useTheme.ts            ← Light/Dark tema
│   │
│   └── constants/
│       ├── colors.ts              ← LightTheme + DarkTheme
│       ├── typography.ts
│       └── spacing.ts
│
└── docs/
    ├── market_yonetim_sistemi_v2.md   ← Tüm modüller & fazlar
    └── gelistirme_hazirlik.md          ← Bu dosya
```

---

## 🗄️ Veritabanı Şeması

Tüm tablolarda `branch_id` baştan mevcuttur. Tek şubede `branch_id=1` varsayılan gelir.

```sql
-- Şubeler (çok şubeli mod için)
CREATE TABLE branches (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    address     TEXT,
    phone       VARCHAR(20),
    active      BOOLEAN DEFAULT true,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Ürünler
CREATE TABLE products (
    id              SERIAL PRIMARY KEY,
    branch_id       INTEGER DEFAULT 1 REFERENCES branches(id),
    name            VARCHAR(200) NOT NULL,
    barcode         VARCHAR(50) UNIQUE,
    category_id     INTEGER REFERENCES categories(id),
    unit            VARCHAR(20) DEFAULT 'adet',
    price           DECIMAL(10,2) NOT NULL,
    cost            DECIMAL(10,2),
    stock_qty       INTEGER DEFAULT 0,
    min_stock       INTEGER DEFAULT 5,
    max_stock       INTEGER,
    vat_rate        INTEGER DEFAULT 1,
    shelf_location  VARCHAR(50),
    expiry_date     DATE,
    image_url       TEXT,
    is_deleted      BOOLEAN DEFAULT false,   -- Soft delete
    deleted_at      TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- Stok hareketleri
CREATE TABLE stock_movements (
    id          SERIAL PRIMARY KEY,
    branch_id   INTEGER DEFAULT 1,
    product_id  INTEGER REFERENCES products(id),
    type        VARCHAR(20),   -- sale, purchase, adjust, waste, transfer
    qty_before  INTEGER,
    qty_change  INTEGER,
    qty_after   INTEGER,
    note        TEXT,
    user_id     INTEGER REFERENCES personnel(id),
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Satışlar
CREATE TABLE sales (
    id              SERIAL PRIMARY KEY,
    branch_id       INTEGER DEFAULT 1,
    customer_id     INTEGER REFERENCES customers(id),
    cashier_id      INTEGER REFERENCES personnel(id),
    session_id      INTEGER REFERENCES sessions(id),
    total           DECIMAL(10,2),
    discount        DECIMAL(10,2) DEFAULT 0,
    vat_amount      DECIMAL(10,2),
    payment_type    VARCHAR(20),   -- cash, card, mixed
    cash_given      DECIMAL(10,2),
    change_given    DECIMAL(10,2),
    status          VARCHAR(20) DEFAULT 'completed',   -- completed, cancelled, refunded
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Satış kalemleri
CREATE TABLE sale_items (
    id          SERIAL PRIMARY KEY,
    sale_id     INTEGER REFERENCES sales(id),
    product_id  INTEGER REFERENCES products(id),
    qty         DECIMAL(10,3),
    unit_price  DECIMAL(10,2),
    discount    DECIMAL(10,2) DEFAULT 0,
    total       DECIMAL(10,2),
    campaign_id INTEGER REFERENCES campaigns(id)
);

-- Müşteriler
CREATE TABLE customers (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    phone           VARCHAR(20),
    address         TEXT,
    credit_limit    DECIMAL(10,2) DEFAULT 0,
    credit_balance  DECIMAL(10,2) DEFAULT 0,
    loyalty_points  INTEGER DEFAULT 0,
    birth_date      DATE,
    price_type      VARCHAR(20) DEFAULT 'retail',
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Tedarikçiler
CREATE TABLE suppliers (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    address     TEXT,
    phone       VARCHAR(20),
    email       VARCHAR(100),
    tax_no      VARCHAR(20),
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Personel
CREATE TABLE personnel (
    id          SERIAL PRIMARY KEY,
    branch_id   INTEGER DEFAULT 1,
    name        VARCHAR(100) NOT NULL,
    role        VARCHAR(20),   -- admin, cashier, warehouse
    pin         VARCHAR(6),
    email       VARCHAR(100),
    active      BOOLEAN DEFAULT true,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Vardiyalar
CREATE TABLE sessions (
    id              SERIAL PRIMARY KEY,
    branch_id       INTEGER DEFAULT 1,
    cashier_id      INTEGER REFERENCES personnel(id),
    opening_amount  DECIMAL(10,2),
    closing_amount  DECIMAL(10,2),
    opened_at       TIMESTAMP DEFAULT NOW(),
    closed_at       TIMESTAMP
);

-- *** DENETİM İZİ (AUDIT LOG) ***
CREATE TABLE audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    branch_id   INTEGER DEFAULT 1,
    user_id     INTEGER REFERENCES personnel(id),
    action_type VARCHAR(50) NOT NULL,
    table_name  VARCHAR(50),
    record_id   INTEGER,
    old_value   JSONB,
    new_value   JSONB,
    ip_address  VARCHAR(45),
    note        TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Kampanyalar
CREATE TABLE campaigns (
    id          SERIAL PRIMARY KEY,
    branch_id   INTEGER DEFAULT 1,
    name        VARCHAR(100),
    type        VARCHAR(30),   -- percent, fixed, buy_x_get_y
    value       DECIMAL(10,2),
    min_qty     INTEGER DEFAULT 1,
    free_qty    INTEGER DEFAULT 0,
    start_date  DATE,
    end_date    DATE,
    active      BOOLEAN DEFAULT true
);

-- Şubeler arası transfer
CREATE TABLE transfers (
    id              SERIAL PRIMARY KEY,
    from_branch_id  INTEGER REFERENCES branches(id),
    to_branch_id    INTEGER REFERENCES branches(id),
    product_id      INTEGER REFERENCES products(id),
    qty             INTEGER,
    status          VARCHAR(20) DEFAULT 'pending',   -- pending, approved, done
    note            TEXT,
    created_by      INTEGER REFERENCES personnel(id),
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Lisanslar (yazılım satışı için)
CREATE TABLE licenses (
    id              SERIAL PRIMARY KEY,
    customer_name   VARCHAR(100),
    email           VARCHAR(100),
    phone           VARCHAR(20),
    license_key     VARCHAR(50) UNIQUE,
    package         VARCHAR(20),   -- starter, pro, chain, lifetime
    branch_limit    INTEGER DEFAULT 1,
    device_limit    INTEGER DEFAULT 2,
    start_date      DATE,
    end_date        DATE,
    status          VARCHAR(20) DEFAULT 'active',
    created_at      TIMESTAMP DEFAULT NOW()
);
```

---

## 📄 Akıllı Fatura & Veri Entegrasyonu

Sistemin en kritik modülü. Tedarikçi dökümanlarını analiz ederek stok ve fiyatları otomatik günceller.

### Desteklenen Formatlar

| Format | Nasıl İşlenir |
|---|---|
| PDF | Claude API ile otomatik parse |
| Excel (.xlsx) | Pandas ile tablo okuma |
| Word (.docx) | python-docx ile metin & tablo okuma |

### Akıllı Eşleştirme Algoritması

```python
# services/invoice_parser.py

def match_product(invoice_item):
    # 1. Barkod ile tam eşleşme (öncelikli)
    if invoice_item.get('barcode'):
        product = db.query(Product).filter(
            Product.barcode == invoice_item['barcode']
        ).first()
        if product:
            return product, 'barcode', 100

    # 2. Ürün adı ile fuzzy matching
    from rapidfuzz import process, fuzz
    products = db.query(Product).all()
    names = [(p.name, p.id) for p in products]

    match = process.extractOne(
        invoice_item['name'],
        [n[0] for n in names],
        scorer=fuzz.token_sort_ratio
    )

    if match and match[1] >= 80:   # %80 benzerlik eşiği
        product_id = names[[n[0] for n in names].index(match[0])][1]
        product = db.query(Product).get(product_id)
        return product, 'fuzzy', match[1]

    # 3. Eşleşme yok → manuel eşleştirme kuyruğuna ekle
    return None, 'unmatched', 0
```

### Birim Dönüşümü

```python
# "1 Koli = 24 Adet" gibi çarpanlarla otomatik birim maliyet hesabı
def calculate_unit_cost(line_total, qty, unit, multipliers):
    if unit == 'koli' and 'koli' in multipliers:
        unit_count = multipliers['koli']   # örn: 24
        return line_total / (qty * unit_count)
    return line_total / qty
```

### Fiyat Motoru

```python
# Yeni alış fiyatına göre kar marjı ekleyerek satış fiyatı önerme
def suggest_sale_price(new_cost, product):
    margin = product.margin_percent or 20   # Varsayılan %20
    suggested = new_cost * (1 + margin / 100)
    return round(suggested, 2)
```

### Onay & Geri Al (Rollback)

```python
# Dosya okunduktan sonra değişiklikler listelenir
# Kullanıcı onay verince toplu güncelleme yapılır
# Hatalı yükleme tek tıkla rollback edilir

@router.post("/invoices/rollback/{invoice_id}")
async def rollback_invoice(invoice_id: int, user=Depends(get_current_user)):
    # Audit log'dan eski değerleri çek
    logs = db.query(AuditLog).filter(
        AuditLog.note == f"invoice_{invoice_id}"
    ).all()

    for log in logs:
        # Her değişikliği geri al
        product = db.query(Product).get(log.record_id)
        product.cost = log.old_value['cost']
        product.price = log.old_value['price']
        db.add(product)

    db.commit()
    return {"message": "Fatura etkileri geri alındı"}
```

---

## 🔍 Denetim İzi & Finansal Güvenlik (Audit Log)

Para işi döndüğü için her işlem saniyelik olarak kayıt altına alınır.

### Zorunlu Loglanan İşlemler

| İşlem | Tetikleyici |
|---|---|
| Fiyat değişimi | Ürün güncelleme |
| Satış iptali (VOID) | İptal butonu |
| Stok düzeltme | Manuel stok değişimi |
| Ürün silme | Soft delete |
| Personel girişi/çıkışı | Oturum açma/kapama |
| Yetki değişimi | Rol güncelleme |
| İndirim uygulaması | Kasada indirim |
| Fatura yükleme | Invoice parser |

### Log Detayı

```python
# services/audit_log.py

async def log_action(
    user_id: int,
    action_type: str,
    table_name: str,
    record_id: int,
    old_value: dict,
    new_value: dict,
    ip_address: str = None,
    note: str = None
):
    log = AuditLog(
        user_id=user_id,
        action_type=action_type,
        table_name=table_name,
        record_id=record_id,
        old_value=old_value,
        new_value=new_value,
        ip_address=ip_address,
        note=note
    )
    db.add(log)
    db.commit()
```

### Anomali Tespiti

```python
# Alış fiyatının altında satış → yöneticiye mail
async def check_anomaly(sale_item):
    product = db.query(Product).get(sale_item.product_id)
    if sale_item.unit_price < product.cost:
        await send_anomaly_alert(
            f"⚠️ {product.name} maliyetin altında satıldı! "
            f"Maliyet: {product.cost}₺ | Satış: {sale_item.unit_price}₺"
        )
```

---

## 🎨 Design System

### Tema Sistemi

```typescript
// mobile/constants/colors.ts

export const LightTheme = {
  background: {
    primary:   '#FFFFFF',
    secondary: '#F8FAFC',
    tertiary:  '#F1F5F9',
    elevated:  '#EDF2F7',
  },
  border: {
    default: '#E2E8F0',
    medium:  '#CBD5E1',
    strong:  '#94A3B8',
  },
  text: {
    primary:   '#0F172A',
    secondary: '#475569',
    tertiary:  '#94A3B8',
    disabled:  '#CBD5E1',
  },
  status: {
    success: '#12C98A',
    warning: '#F5A623',
    danger:  '#F04F4F',
    info:    '#4F8EF7',
  },
  accent: {
    blue:   '#4F8EF7',
    cyan:   '#06C4D4',
    purple: '#9B6EF7',
  },
}

export const DarkTheme = {
  background: {
    primary:   '#0A0E1A',
    secondary: '#111827',
    tertiary:  '#1A2235',
    elevated:  '#212D42',
  },
  border: {
    default: '#2A3A55',
    medium:  '#3A4F72',
    strong:  '#4D6380',
  },
  text: {
    primary:   '#F1F5F9',
    secondary: '#94A3B8',
    tertiary:  '#64748B',
    disabled:  '#475569',
  },
  status: {
    success: '#12C98A',
    warning: '#F5A623',
    danger:  '#F04F4F',
    info:    '#4F8EF7',
  },
  accent: {
    blue:   '#4F8EF7',
    cyan:   '#06C4D4',
    purple: '#9B6EF7',
  },
}
```

### Tema Hook'u

```typescript
// mobile/hooks/useTheme.ts

import { useColorScheme } from 'react-native'
import { useSettingsStore } from '@/stores/settingsStore'
import { LightTheme, DarkTheme } from '@/constants/colors'

export const useTheme = () => {
  const systemScheme = useColorScheme()
  const { themePreference } = useSettingsStore()

  const activeTheme = themePreference === 'system'
    ? (systemScheme === 'dark' ? DarkTheme : LightTheme)
    : (themePreference === 'dark' ? DarkTheme : LightTheme)

  return { theme: activeTheme, isDark: activeTheme === DarkTheme }
}
```

### UX Kuralları

- Tüm butonlar minimum **48px** yükseklik (dokunmatik)
- Stok renk kodlaması: 🔴 Kritik · 🟡 Eşik · 🟢 Yeterli · 💤 Durgun
- Offline durumda ekranın köşesinde sürekli gösterge
- Her liste için empty state
- Her API çağrısı için loading state
- Türkçe karakter desteği tam

### Spacing & Radius

```typescript
export const Spacing = { xs:4, sm:8, md:12, lg:16, xl:20, xxl:24, xxxl:32 }
export const Radius  = { sm:8, md:12, lg:16, xl:20, full:999 }
```

---

## 📱 Müşteri Display (İkinci Tablet)

Kasada müşterinin karşısına bakan tablet. Aynı WiFi üzerinden WebSocket ile bağlanır.

### Çalışma Mantığı

```
Kasa Tableti → WebSocket → Müşteri Tableti
```

### Backend WebSocket

```python
# backend/routes/display.py

from fastapi import WebSocket
connected_displays = {}

@app.websocket("/ws/display/{branch_id}")
async def display_ws(websocket: WebSocket, branch_id: int):
    await websocket.accept()
    connected_displays[branch_id] = websocket
    try:
        while True:
            await websocket.receive_text()
    except:
        del connected_displays[branch_id]

async def update_display(branch_id: int, data: dict):
    if branch_id in connected_displays:
        await connected_displays[branch_id].send_json(data)
```

### Display Ekran Durumları

| Durum | Ne Gösterir |
|---|---|
| `idle` | Market adı + dönen kampanyalar + saat |
| `cart` | Sepet içeriği + toplam (anlık güncellenir) |
| `payment` | "Lütfen Ödeyiniz — 74,10₺" |
| `thanks` | "Teşekkürler! İyi günler 😊" (3 sn) |

### Kurulum

Müşteri tabletine aynı uygulama yüklenir. Giriş ekranında **"Müşteri Display Modu"** seçilir. Aynı WiFi'a bağlı olması yeterli, IP otomatik bulunur.

---

## ⚡ Offline-First Mimari

```
Ağ var   → Ana PostgreSQL'e yaz
Ağ yok   → Local SQLite'a yaz + "🔴 Offline · X işlem bekliyor"
Ağ geldi → Otomatik sync → çakışma varsa son işlemi uygula
```

---

## ☁️ Yedekleme & Kurtarma

```
Her gece Z raporundan sonra:
        ↓
PostgreSQL DB → AES-256 ile şifrelenir
        ↓
ZIP'lenir → Gmail'e gönderilir
├── z_raporu_GG_AA_YYYY.pdf
└── yedek_GG_AA_YYYY.zip
        ↓
Lokal 30 günlük arşiv tutulur
```

**Garanti:** Sistem çökse dahi en fazla 24 saatlik veri kaybı ile tam kurtarma.

---

## 🔐 Lisans Sistemi

### Lisans Anahtar Yapısı

```
MYS-2026-AHMT-X7K9-P2M4-Q8W1
 │     │      │      │      │      └── Checksum (sistem üretir)
 │     │      │      │      └── Bitiş tarihi (şifreli)
 │     │      │      └── Paket & şube (şifreli)
 │     │      └── Müşteri kodu (otomatik)
 │     └── Üretim yılı
 └── Ürün kodu
```

### Lisans Kontrol Katmanları

```
1. Açılışta   → Sunucuya sorgu
2. Günlük     → Her gece 00:00 sinyal
3. Arka plan  → Her 6 saatte kontrol
4. Offline    → 7 gün tolerans, sonra kilit
```

### Paketler

| Paket | Şube | Cihaz | Yıllık | Ömür Boyu |
|---|---|---|---|---|
| Starter | 1 | 2 | 3.000-5.000₺ | 12.000-18.000₺ |
| Pro | 3 | 6 | 7.000-10.000₺ | — |
| Zincir | 10+ | Sınırsız | 15.000-25.000₺ | — |

---

## 🚀 Claude Code ile Geliştirme Rehberi

### Standart Prompt Şablonu

Her faz için Claude Code'a verilecek sistem promptu:

```
Sen bir senior full-stack geliştiricisin.
Market Yönetim Sistemi projesinde çalışıyoruz.

PROJE:
- React Native Expo (mobil)
- Python FastAPI (backend)
- PostgreSQL (veritabanı)
- Türkçe arayüz, karanlık/açık tema

DESIGN SYSTEM:
- Aksent:  #4F8EF7 | Başarı: #12C98A | Uyarı: #F5A623 | Hata: #F04F4F
- Dark BG: #0A0E1A | Kart: #111827 | Yüzey: #1A2235 | Border: #2A3A55
- Light BG: #FFFFFF | Kart: #F8FAFC | Border: #E2E8F0 | Metin: #0F172A
- Font: DMSans (body) + Syne (başlıklar)
- Radius: 12px (card) | 8px (button) | Spacing: 4/8/12/16/20/24/32

KURALLAR:
- TypeScript kullan
- useTheme() hook ile renklere eriş (hardcode renk yok)
- Min 48px dokunma alanı
- Her işlem audit_log'a kayıt
- Loading + empty + error state her ekranda
- Offline durumu handle et
- Türkçe yorum satırları
- Her komponent ayrı dosyada

GÖREV:
[FAZ GÖREVİ BURAYA]

Önce backend (model + route), sonra frontend (ekran + komponent).
Her dosyayı ayrı kod bloğunda ver.
```

---

## 📋 Faz Bazlı Geliştirme Planı

### Faz 0 — Altyapı & Güvenlik (2 gün)

```
□ PostgreSQL kurulumu
□ Tüm tablolar (branch_id dahil)
□ Audit Log altyapısı
□ JWT yetkilendirme
□ Kullanıcı rolleri (Admin / Kasiyer / Depocu)
□ FastAPI iskelet
□ React Native Expo iskelet
□ useTheme() hook + LightTheme + DarkTheme
□ .env yapılandırması
```

### Faz 1 — Fatura İşleme & Ürün (2 hafta)

```
□ PDF / Excel / Word fatura okuma motoru
□ Fuzzy matching algoritması
□ Birim dönüşüm mantığı
□ Toplu fiyat güncelleme ekranı
□ Onay mekanizması
□ Rollback (geri al) sistemi
□ Ürün CRUD + barkoddan otomatik bilgi
□ Ürün varyantı
□ Soft delete (çöp kutusu)
□ Akıllı stok listesi (aciliyet puanı)
□ Stok sayım modu
□ SKT takibi
□ Excel import/export
```

### Faz 2 — Kasa & Satış (3 hafta)

```
□ Barkod ile hızlı satış
□ Terazi TCP/IP entegrasyonu
□ Müşteri display WebSocket
□ Offline mod (SQLite cache)
□ Nakit / Kart / Karma ödeme
□ POS bağımsız çalışma (tutar gösterimi)
□ Kasa açılış / kapanış
□ Z raporu otomatik oluşturma
□ Gün sonu kasa sayım ekranı
□ Kasa farkı hesaplama & uyarı
□ Fiş yazdırma (Bluetooth termal)
□ Fiyat etiketi + barkod etiketi
□ Barkod etiket tasarımcısı
□ Toplu etiket yazdırma
□ Hızlı ürün butonları (12 adet)
□ Bekleyen sepet
□ İptal / iade işlemi
□ QR & temassız ödeme
□ Kasa açık kalma uyarısı
□ Kurulum sihirbazı (5 adım)
□ Audit log entegrasyonu
```

### Faz 3 — Analiz & Yedekleme (1.5 hafta)

```
□ Günlük / aylık kar-zarar raporları
□ En çok / en az satılan ürünler
□ Saatlik satış yoğunluğu
□ KDV raporu
□ Kasiyer performans raporu
□ Stok devir hızı
□ Gün başı kontrol listesi
□ Kritik stok & günlük özet mail
□ Ürün fiyat geçmişi grafiği
□ PostgreSQL AES-256 şifreli yedek
□ Gmail otomatik gönderim (PDF + ZIP)
□ Lokal 30 günlük arşiv
□ Import / export & felaket kurtarma
```

### Faz 4 — Personel, Müşteri & Kampanya (2 hafta)

```
□ Personel rolleri + PIN girişi
□ Vardiya yönetimi + devir tutanağı
□ İzin & devamsızlık takibi
□ İptal yetki limiti
□ Kasa açılış şifresi
□ Müşteri kartı + veresiye + limit
□ Sadakat puanı
□ Doğum günü maili
□ Kampanya kural motoru
□ İndirim kuponu
□ Tedarikçi + ödeme takibi
```

### Faz 5 — Market Sahibi Paneli & Hedefler (1 hafta)

```
□ Mobil panel (WiFi otomatik bağlantı)
□ Anlık stok & satış görünümü
□ Satış hedefi takibi
□ Fiyat takip scraping (gece otomatik)
□ Zam tespiti + mail bildirimi
□ Sabah etiket güncelleme ekranı
```

### Faz 6 — Sistem & Ayarlar (4 gün)

```
□ Tema seçimi (Açık / Karanlık / Sistem)
□ Barkod ses & titreşim ayarı
□ Yazıcı şablonu özelleştirme
□ Yazdırma önizleme
□ Dil desteği altyapısı (i18n)
□ Ekran parlaklık ayarı
□ Offline mod göstergesi
□ POS entegrasyon ayarı
```

### Faz 7 — Çok Şubeli Mod (4 hafta, opsiyonel)

```
□ MULTI_BRANCH=true ile aktif etme
□ Şube yönetimi
□ Şubeler arası stok görünümü
□ Transfer talebi + onay
□ Merkezi raporlama
□ Müşteri ortak havuzu
□ WireGuard VPN kurulumu
□ Offline sync & çakışma yönetimi
```

### Faz 8 — Yazılım Satış Altyapısı (5 hafta)

```
□ Lisans üretim & kilit sistemi
□ Cihaz limiti & yeni cihaz kaydı
□ Merkezi backup (satıcıya gönderim)
□ Admin yönetim paneli
□ Otomatik hatırlatma mailleri
□ Güncelleme dağıtım sistemi
□ Destek & uzaktan erişim
□ e-Arşiv fatura
□ API dokümantasyonu (Swagger)
```

---

## ⚙️ Kurulum Adımları

### 1. PostgreSQL

```bash
# Windows
winget install PostgreSQL.PostgreSQL

psql -U postgres
CREATE DATABASE market_db;
CREATE USER market_user WITH PASSWORD 'guclu_sifre';
GRANT ALL PRIVILEGES ON DATABASE market_db TO market_user;
```

### 2. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# .env içini doldur
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Mobile

```bash
cd mobile
npm install
npx expo start
# Tablette Expo Go uygulamasıyla QR okut
```

### 4. .env Şablonu

```bash
# Veritabanı
DATABASE_URL=postgresql://market_user:sifre@localhost/market_db

# Çok şubeli mod
MULTI_BRANCH=false
BRANCH_ID=1
BRANCH_NAME=Merkez

# Mail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=market@gmail.com
SMTP_PASSWORD=xxxx_xxxx_xxxx_xxxx
MAIL_TO=sahip@gmail.com

# Claude API
ANTHROPIC_API_KEY=sk-ant-xxxx

# Tedarikçi girişleri
METRO_USERNAME=
METRO_PASSWORD=

# Güvenlik
SECRET_KEY=cok_gizli_anahtar
AES_KEY=32_karakter_sifreleme_anahtari

# Lisans sunucusu (yazılım satışı)
LICENSE_SERVER_URL=https://lisans.sizinfirma.com
LICENSE_SECRET=lisans_gizli_anahtar
```

### 5. requirements.txt

```
fastapi==0.111.0
uvicorn==0.30.0
sqlalchemy==2.0.30
alembic==1.13.1
psycopg2-binary==2.9.9
python-dotenv==1.0.1
apscheduler==3.10.4
anthropic==0.28.0
requests==2.32.3
beautifulsoup4==4.12.3
reportlab==4.2.0
python-docx==1.1.2
openpyxl==3.1.4
pandas==2.2.2
rapidfuzz==3.9.0
python-multipart==0.0.9
pydantic==2.7.1
python-jose==3.3.0
passlib==1.7.4
cryptography==42.0.8
websockets==12.0
```

---

## ✅ Kalite Kontrol Listesi

Her ekran teslim edilmeden önce kontrol edilecekler:

```
□ Loading state var mı?
□ Empty state var mı?
□ Hata durumu handle ediliyor mu?
□ Offline durumda ne oluyor?
□ Audit log tetikleniyor mu? (kritik işlemlerde)
□ Dokunma alanları min 48px mi?
□ Türkçe karakterler doğru mu?
□ Light ve Dark temada okunabilir mi?
□ useTheme() kullanılıyor, hardcode renk yok mu?
□ Mockup ile görsel uyum var mı?
```

---

*Versiyon 3.0 Final — Mart 2026*  
*Audit Log, Fatura Motoru, Müşteri Display, Tema Sistemi, Lisans Altyapısı dahil*
