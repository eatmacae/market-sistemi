# 🏪 Market Yönetim Sistemi — Proje Dökümanı

> **Versiyon:** 2.0  
> **Tarih:** Mart 2026  
> **Geliştirici:** Erhan  
> **Geliştirme Aracı:** Claude AI  

---

## 📋 İçindekiler

1. [Sistem Mimarisi](#sistem-mimarisi)
2. [Donanım](#donanım)
3. [Teknik Altyapı](#teknik-altyapı)
4. [Çok Şubeli Yapı](#çok-şubeli-yapı)
5. [Özellikler](#özellikler)
6. [Geliştirme Yol Haritası](#geliştirme-yol-haritası)
7. [Maliyet](#maliyet)

---

## Sistem Mimarisi

```
Ana Bilgisayar (Merkez veya Şube 1)
├── Python FastAPI (Backend)
├── PostgreSQL (Veritabanı — şubeli yapıya hazır)
├── APScheduler (Gece otomatik görevler)
└── Local Ağ / VPN
    ├── Tablet — Kasa 1
    ├── Tablet — Kasa 2
    ├── Tablet — Depo
    └── Şube 2, 3... (opsiyonel — VPN ile bağlanır)

Her Tablette
├── React Native Expo (Mobil Uygulama)
├── SQLite (Offline cache — internet kesilince buradan çalışır)
├── Barkod Okuyucu (Kamera / USB / Bluetooth)
├── Termal Yazıcı (Bluetooth)
└── Network Terazisi (TCP/IP)
```

---

## Donanım

| Donanım | Bağlantı | Protokol |
|---|---|---|
| Tablet kamerası | Dahili | Expo Camera |
| USB / Bluetooth barkod okuyucu | USB / BT | HID (klavye gibi) |
| Bluetooth termal yazıcı | Bluetooth | ESC/POS |
| Network terazisi | WiFi / Ethernet | TCP/IP |

---

## Teknik Altyapı

| Katman | Teknoloji | Açıklama |
|---|---|---|
| Mobil | React Native Expo | iOS + Android tek codebase |
| Backend | Python FastAPI | Local bilgisayarda çalışır |
| Veritabanı | PostgreSQL | Şubeli yapıya hazır, local |
| Offline Cache | SQLite | Her tablette, internet kesilince devreye girer |
| Zamanlayıcı | APScheduler | Gece otomatik görevler |
| Mail | Gmail SMTP | Ücretsiz |
| PDF Parse | Claude API | Sadece fatura okuma |
| VPN | WireGuard | Uzak şube bağlantısı (ücretsiz, opsiyonel) |
| Credential | .env dosyası | Şifre yönetimi |

> **Önemli:** Sistem tamamen offline çalışır. İnternet kesilince her tablet kendi SQLite cache'inden çalışmaya devam eder, bağlantı gelince merkeze otomatik sync eder. Claude API sadece PDF fatura parse için kullanılır, internet yoksa bu özellik atlanır.

---

## Çok Şubeli Yapı

### Temel Felsefe

Sistem baştan tek şube gibi çalışır. İstendiğinde tek bir ayarla çok şubeli moda geçilir, hiçbir şey yeniden yazılmaz.

```bash
# .env dosyasında tek satır
MULTI_BRANCH=false   # başta kapalı — tek şube gibi çalışır
MULTI_BRANCH=true    # açılınca tüm şube özellikleri aktif olur

BRANCH_ID=1          # bu şubenin ID'si
BRANCH_NAME=Merkez   # bu şubenin adı
```

### Veritabanı Yapısı

Her tabloda `branch_id` baştan mevcuttur, tek şubede `branch_id=1` varsayılan gelir, kimse fark etmez:

```sql
products    → branch_id  (hangi şubenin ürünü)
sales       → branch_id  (hangi şubede satıldı)
stock       → branch_id  (hangi şubede kaç adet)
personel    → branch_id  (hangi şubede çalışıyor)
transfers   → from_branch_id, to_branch_id  (şubeler arası transfer)
branches    → id, name, address, phone, active
```

### Şube Bağlantı Seçenekleri

**Aynı Bina / Yakın Mesafe:**
```
Ana Sunucu → Local WiFi/Kablo → Tüm tabletler
```

**Farklı Lokasyonlar:**
```
Ana Sunucu → WireGuard VPN → Uzak şube tabletleri
```

### Offline Sync Kuralı

```
Ağ bağlantısı var  → Ana PostgreSQL'e yaz
Ağ bağlantısı yok  → Local SQLite'a yaz + "Offline · X işlem bekliyor" uyarısı
Bağlantı geldi     → Otomatik sync → çakışma varsa son işlemi uygula
```

---

## Özellikler

---

### 📦 1. Ürün Yönetimi

- Ürün ekleme / düzenleme / silme
- Barkod ile arama
- Dahili barkod üretme (barkodu olmayan ürünler için)
- Kategori & alt kategori yönetimi
- Birim tanımlama (adet, kg, lt, gr)
- Ürün fotoğrafı
- KDV oranı tanımlama (%1, %10, %20)
- Son kullanma tarihi (SKT) takibi
- Min / max stok seviyesi tanımlama
- Raf yeri tanımlama
- Çoklu fiyat (perakende / toptan / veresiye / personel)
- Excel toplu import / export

---

### 📊 2. Stok Yönetimi

- Satış yapılınca stok otomatik düşer
- Barkod ile hızlı stok sayımı
- Fire & zayi kaydı
- SKT bazlı fire kaydı
- Stok düzeltme (sayım farkı)
- Yaklaşan SKT uyarısı (X gün kala)
- Stok hareket geçmişi
- **Çok şubeli modda:** ürün stokta yoksa diğer şubelerde otomatik arama

#### Akıllı Stok Listesi

Her ürüne otomatik **aciliyet puanı** hesaplanır:

```
Aciliyet Puanı =
    Satış Hızı (günlük ortalama)
  + Stok Kritikliği (mevcut / minimum oranı)
  + Son Satış Tarihi
```

| Öncelik | Durum | Renk | İkon |
|---|---|---|---|
| 1 | Kritik stok + çok satılan | 🔴 | ⚡ |
| 2 | Kritik stok + az satılan | 🔴 | — |
| 3 | Eşik altı + çok satılan | 🟡 | ⚡ |
| 4 | Eşik altı + az satılan | 🟡 | — |
| 5 | Yeterli + çok satılan | 🟢 | ⚡ |
| 6 | Yeterli + normal | 🟢 | — |
| 7 | Uzun süredir satılmayan | 🟢 | 💤 |

> Her satışta liste **anlık** olarak yeniden sıralanır.

#### Otomatik Sipariş Önerisi Algoritması

```
Günlük ortalama satış = Son 30 gün satış / 30
Hedef stok           = Günlük ortalama × 15 gün
Eksik miktar         = Hedef stok - Mevcut stok
Öneri                = Eksik miktar (min sipariş miktarına yuvarlanır)
```

---

### 🧾 3. Kasa & Satış

- Barkod ile hızlı satış
- Terazi entegrasyonu (ağırlık otomatik gelir)
- Sepet yönetimi
- Bekleyen sepet (müşteriyi beklat)
- Nakit / kredi kartı / karma ödeme
- Para üstü otomatik hesaplama
- Kasa açılış parası girişi
- Masraf / gider kaydı (kasadan nakit harcama)
- İskonto (ürün bazlı / sepet bazlı)
- Kampanya & promosyon otomatik uygulanır
- Çoklu fiyat (müşteri tipine göre otomatik seçilir)
- Fiş yazdırma (Bluetooth termal)
- Fiyat etiketi yazdırma
- Barkod etiketi yazdırma
- İptal / iade işlemi
- Kasa açılış / kapanış
- Kasa farkı otomatik hesaplanır & uyarı verilir
- Z raporu otomatik oluşturulur

---

### ⚖️ 4. Terazi Entegrasyonu

- Network terazisi TCP/IP bağlantısı
- Tartımlı ürün seçilince terazi otomatik bağlanır
- Ağırlık stabilize olunca otomatik okunur
- Ağırlık × fiyat otomatik hesaplanır → sepete eklenir
- Tartım fişi yazdırma
- Birden fazla terazi desteği
- Kalibrasyon tarihi geçmişse uyarı verilir

> **Not:** Terazi markası sonradan belirlenir. Her markanın TCP komut seti farklıdır, ilgili parser modülü o zaman eklenir.

---

### 👥 5. Personel & Vardiya

- Kullanıcı rolleri: **Yönetici / Kasiyer / Depocu**
- PIN ile hızlı kasa girişi
- Her rol için ayrı yetki tanımı
- Yetkisiz işlem girişimi loglanır & yöneticiye bildirilir
- Kasiyer bazlı satış takibi
- Vardiya açma / kapama
- Kasiyer giriş yaptığında vardiya otomatik başlar
- Vardiya kapanınca devir tutanağı otomatik oluşur & yazıcıdan çıkar
- Tüm işlemler loglanır (kullanıcı, zaman, işlem tipi)
- **Çok şubeli modda:** personel hangi şubede çalışıyor tanımlanır

---

### 🤝 6. Müşteri & Veresiye

- Müşteri kartı (ad, telefon, adres)
- Veresiye kayıt & tahsilat
- Veresiye limit tanımlama
- Limit aşılınca otomatik uyarı
- Müşteri bazlı satış geçmişi
- Müşteri bazlı özel fiyat tanımlama
- Sadakat puanı (otomatik birikir & uygulanır)
- Vadesi geçen veresiyeler otomatik üste çıkar
- **Çok şubeli modda:** müşteri ortak havuzda — herhangi şubede tanınır, veresiye & puan tüm şubelerde geçerli

---

### 💰 7. Kampanya & Çoklu Fiyat

- Kampanya tanımlama (tarih aralığı, kural, indirim)
- Esnek kural motoru:
  - 2 al 1 öde
  - % indirim
  - X₺ üstü indirim
  - Belirli kategoriye indirim
- Sepete ürün eklenince kampanya otomatik kontrol edilir & uygulanır
- Kampanya bitiş tarihi geçince otomatik kapanır
- Kampanya performans takibi
- Fiyat tipleri: perakende / toptan / veresiye / personel
- Müşteri tipine göre fiyat otomatik seçilir

---

### 🚚 8. Tedarikçi & Fatura

- Tedarikçi kartı (ad, adres, telefon, vergi no)
- Tedarikçi performans takibi (zamanında teslimat vb.)
- **PDF fatura yükleme → Claude AI otomatik okur**
- Ürünler barkod → isim → fuzzy match ile otomatik eşleştirilir
- Eşleşen ürünlerin stoku otomatik güncellenir
- Eşleşmeyen ürün varsa sadece o sorulur, bir kez eşleşince hatırlar
- Maliyet fiyatı değişince kâr marjı otomatik yeniden hesaplanır
- Alım geçmişi
- Otomatik sipariş önerisi (stok + satış hızı bazlı)

---

### 🔍 9. Fiyat Takip Sistemi

- Tedarikçi web siteleri her gece belirlenen saatte otomatik taranır
- Login gereken siteler için şifreler `.env` dosyasından okunur
- Zam / indirim otomatik tespit edilir
- Yüzdelik artış / düşüş hesaplanır
- Zam tespit edilince otomatik mail gider
- Sabah uygulama açılınca etiket güncelleme listesi hazır gelir
- "Tümünü Güncelle" butonuyla tek tuşta tüm etiketler güncellenir
- Fiyat geçmişi grafikleri
- Site bağlanamazsa veya login başarısız olursa hata maili gider

---

### 📈 10. Raporlama & Analitik

- Günlük / haftalık / aylık / yıllık satış raporları
- En çok / en az satılan ürünler
- X gündür satılmayan ürünler
- Saatlik satış yoğunluk haritası
- Kâr / zarar özeti
- KDV raporu (%1, %10, %20 bazında)
- Stok devir hızı
- Tedarikçi bazlı alım raporu
- Masraf / gider raporu
- Kasiyer performans raporu
- Satış hedefi takibi
- Kasa farkı geçmişi
- Tüm raporlar PDF olarak export edilebilir
- Haftalık rapor her Pazartesi otomatik oluşur
- Aylık rapor ay sonunda otomatik oluşur
- **Çok şubeli modda:** tüm şubeler tek raporda — şube filtresi ile kırılım yapılabilir

---

### 📱 11. Market Sahibi Mobil Paneli

- Aynı WiFi'da sunucuyu otomatik bulur (IP girmeden)
- Bağlantı kesilince otomatik yeniden bağlanır
- Veriler her 5 dakikada otomatik yenilenir
- **Bildirim yok** — istediğinde açıp bakar
- Veri dışarı çıkmaz, sadece local ağda çalışır

**Görüntülenen Bilgiler:**
- Anlık satış özeti (bugünkü ciro, işlem sayısı)
- Akıllı stok listesi (aynı renk & sıralama mantığı)
- Kritik ürünler
- Sipariş önerileri
- En çok / en az satılan ürünler
- Günlük hedef ilerleme çubuğu
- **Çok şubeli modda:** tüm şubeler özeti veya şube bazlı görünüm

---

### 💾 12. Gün Sonu & Otomatik Yedekleme

**Akış:**
```
"Kasa Kapat" butonuna basılır
        ↓
Z Raporu otomatik hesaplanır & PDF oluşturulur
        ↓
PostgreSQL DB otomatik ZIP'lenir (şifreli)
        ↓
Gmail'e otomatik gönderilir
├── 📎 z_raporu_GG_AA_YYYY.pdf
└── 📎 yedek_GG_AA_YYYY.zip
        ↓
Lokal yedeğe otomatik kopyalanır
```

**Kurallar:**
- Lokal 30 günlük yedek arşivi tutulur
- 30 günden eski yedekler otomatik silinir
- DB 20MB altı → direkt ek olarak gönderilir
- DB 20-25MB arası → sıkıştırma arttırılır
- DB 25MB üstü → sadece PDF gönderilir, "manuel yedek al" uyarısı eklenir

**ZIP İçeriği:**
```
yedek_GG_AA_YYYY.zip
├── market.db          ← tüm veri
├── config.json        ← sistem ayarları
└── README.txt         ← nasıl geri yüklenir (adım adım)
```

> Şifreler & credentiallar **hiçbir zaman** ZIP'e dahil edilmez.

---

### 🔄 13. Import / Export & Felaket Kurtarma

- Tam export (tüm veri tek ZIP)
- Seçici export (sadece ürünler, sadece satışlar vb.)
- Yeni bilgisayara import → 5 dakikada kaldığı yerden devam
- ZIP içinde "nasıl geri yüklenir" notu otomatik oluşturulur
- Import sırasında versiyon uyumluluğu otomatik kontrol edilir
- Çakışan kayıtlar otomatik tespit edilir, kullanıcıya sorulur
- Import tamamlanınca özet rapor gösterilir

---

### 🎯 14. Satış Hedefi

- Günlük / haftalık / aylık hedef tanımlama
- Görsel ilerleme çubuğu
- Hedefe %50 ulaşılınca bilgi notu gösterilir
- Hedefe ulaşılınca dashboard'da kutlama gösterilir
- Hedef bazlı raporlama
- **Çok şubeli modda:** şube bazlı ayrı hedef tanımlanabilir

---

### ⚙️ 15. Sistem & Ayarlar

- Market bilgileri (fiş başlığı, adres, telefon)
- Bluetooth yazıcı ayarları
- Terazi IP & port ayarı
- Gmail SMTP ayarları
- Tedarikçi login bilgileri yönetimi
- SKT uyarı süresi (kaç gün kala uyarsın)
- Çok şubeli mod açma/kapama (MULTI_BRANCH)
- Offline mod (internet yoksa Claude/scraping atlanır, kasa çalışmaya devam eder)
- Versiyon & güncelleme yönetimi (DB migration korumalı)
- Dokunmatik ekran optimizasyonu (büyük butonlar, klavye kontrolü)

---

### 🏪 16. Şube Yönetimi *(Çok Şubeli Mod — Opsiyonel)*

> `MULTI_BRANCH=true` yapılınca aktif olur.

- Şube kartı (ad, adres, telefon, sorumlu kişi)
- Şube bazlı stok takibi
- Her ürün için tüm şubelerdeki stok görünümü
- Şube bazlı fiyat farklılığı tanımlanabilir (opsiyonel)
- Şube aktif / pasif yönetimi

---

### 🔎 17. Şubeler Arası Stok Görünümü *(Çok Şubeli Mod — Opsiyonel)*

```
Kasiyer ürünü arar → Bu şubede stokta yok
        ↓
"Başka Şubede Ara" butonu
        ↓
Merkez    : 0 adet ❌
Bağcılar  : 5 adet ✅
Kadıköy   : 12 adet ✅
        ↓
Müşteriye bilgi verilir
Transfer talebi oluşturulabilir
```

- Tüm şubelerin stoğu anlık görünür
- Şube bazlı akıllı sıralama (en yakın şube önce)
- Stokta olmayan ürün için otomatik transfer önerisi

---

### 🔁 18. Şubeler Arası Transfer *(Çok Şubeli Mod — Opsiyonel)*

**Akış:**
```
Şube 1 transfer talebi oluşturur
        ↓
Şube 3 talebi görür & onaylar
        ↓
Şube 1 stok düşer (transfer çıkışı)
Şube 3 stok artar (transfer girişi)
        ↓
Transfer fişi her iki şubede yazılır
Transfer geçmişi kayıt altına alınır
```

**Özellikler:**
- Transfer talebi oluşturma (ürün, miktar, hedef şube)
- Talep onay / ret mekanizması
- Kısmi transfer (talep edilen miktarın bir kısmı gönderilebilir)
- Transfer fişi yazdırma (gönderen & alan şube için)
- Transfer geçmişi & takibi
- Bekleyen transfer uyarısı

---

### 📊 19. Merkezi Raporlama *(Çok Şubeli Mod — Opsiyonel)*

- Tüm şubelerin toplam cirosu tek ekranda
- Şube bazlı ciro karşılaştırması (grafik)
- En başarılı şube sıralaması
- Şube bazlı kâr / zarar
- Şube bazlı kasiyer performansı
- Tüm şubelerde en çok / en az satılan ürünler
- Şube bazlı KDV raporu
- Merkezi Z raporu (tüm şubeler birleşik)

---

### 👤 20. Müşteri Ortak Havuzu *(Çok Şubeli Mod — Opsiyonel)*

- Müşteri herhangi şubede tanınır
- Veresiye bakiyesi tüm şubelerde görünür
- Sadakat puanı tüm şubelerde geçerli & birikir
- Hangi şubeden ne aldığı görüntülenebilir
- Veresiye herhangi şubeden tahsil edilebilir

---

## Geliştirme Yol Haritası

### Tek Şube (Temel Sistem)

| Faz | İçerik | Süre |
|---|---|---|
| Faz 0 | PostgreSQL kurulumu + branch_id altyapısı | 2 gün |
| Faz 1 | Ürün & Stok + Akıllı Liste | 1 hafta |
| Faz 2 | Kasa & Satış + Fiş & Etiket | 1.5 hafta |
| Faz 3 | Terazi Entegrasyonu | 3 gün |
| Faz 4 | Personel & Vardiya | 4 gün |
| Faz 5 | Müşteri & Veresiye | 3 gün |
| Faz 6 | Kampanya & Çoklu Fiyat | 4 gün |
| Faz 7 | Raporlama & Dashboard | 1 hafta |
| Faz 8 | Tedarikçi & PDF Fatura | 4 gün |
| Faz 9 | Fiyat Takip & Mail | 1 hafta |
| Faz 10 | Market Sahibi Mobil Panel | 4 gün |
| Faz 11 | Z Raporu & Gmail Yedek | 3 gün |
| Faz 12 | Import / Export | 2 gün |
| Faz 13 | Satış Hedefi | 2 gün |
| Faz 14 | Test & Optimizasyon | 1 hafta |
| **Toplam** | | **~13-14 hafta** |

### Çok Şubeli Mod *(Opsiyonel — İstendiğinde Aktif)*

| Faz | İçerik | Süre |
|---|---|---|
| Faz 15 | Şube yönetimi (MULTI_BRANCH=true) | 3 gün |
| Faz 16 | Şubeler arası stok görünümü | 3 gün |
| Faz 17 | Şubeler arası transfer yönetimi | 4 gün |
| Faz 18 | Merkezi raporlama (tüm şubeler) | 4 gün |
| Faz 19 | Müşteri ortak havuzu | 2 gün |
| Faz 20 | VPN kurulumu & uzak şube bağlantısı | 2 gün |
| Faz 21 | Offline sync & çakışma yönetimi | 3 gün |
| Faz 22 | Çok şubeli test & optimizasyon | 1 hafta |
| **Ek Toplam** | | **~4 hafta** |

---

## Maliyet

### Geliştirme Maliyeti

| Kalem | Maliyet |
|---|---|
| React Native Expo | 0₺ |
| Python FastAPI | 0₺ |
| PostgreSQL | 0₺ |
| Gmail SMTP | 0₺ |
| APScheduler | 0₺ |
| WireGuard VPN | 0₺ |
| Claude API (geliştirme boyunca) | ~87₺ |
| **Toplam geliştirme** | **~87₺** |

### Aylık Süregelen Maliyet

| Durum | Aylık Maliyet |
|---|---|
| Tek şube | ~50-150₺ |
| Çok şube — aynı ağ | ~50-150₺ (ek yok) |
| Çok şube — WireGuard VPN | ~50-150₺ (WireGuard ücretsiz) |
| Çok şube — uzak lokasyon VPS | ~600-900₺ |

> 10 şubede VPS maliyeti şube başı ~60-90₺/ay — hâlâ piyasanın çok altında.

### Piyasa Karşılaştırması (5 Yıl)

| | Bu Sistem | Logo Tiger | Mikro | Hazır SaaS |
|---|---|---|---|---|
| Kurulum | ~87₺ | 15.000₺+ | 10.000₺+ | 0₺ |
| Aylık (tek şube) | ~100₺ | 500-2.000₺ | 400-1.500₺ | 300-800₺ |
| 5 yıl toplam | **~6.087₺** | ~135.000₺ | ~100.000₺ | ~48.000₺ |
| Veri sahipliği | ✅ Sende | ❌ | ❌ | ❌ |
| Offline çalışma | ✅ Tam | ⚠️ Kısmen | ⚠️ Kısmen | ❌ |
| Çok şube desteği | ✅ Opsiyonel | ✅ Ücretli | ✅ Ücretli | ⚠️ Sınırlı |
| Özelleştirme | ✅ Tam | ⚠️ Sınırlı | ⚠️ Sınırlı | ❌ |

---

*Bu döküman proje geliştikçe güncellenecektir. Versiyon 2.0 — Çok şubeli yapı & şubeler arası transfer yönetimi eklendi.*

---

### 🔐 21. Lisans Yönetim Sistemi *(Yazılım Satıcısı Modülü)*

> Bu modül senin admin sunucunda çalışır. Müşteriler göremez.

#### Lisans Üretim Akışı

```
Admin panelde müşteri bilgilerini gir
        ↓
"Üret ve Mail At" butonuna bas
        ↓
Sistem otomatik lisans anahtarı üretir
MYS-2026-AHMT-X7K9-P2M4-Q8W1
        ↓
Aktivasyon maili otomatik gönderilir
        ↓
Müşteri maildeki anahtarı uygulamaya girer
        ↓
Sistem açılır
```

#### Lisans Anahtar Yapısı

```
MYS - 2026 - AHMT - X7K9 - P2M4 - Q8W1
 │     │      │      │      │      │
 │     │      │      │      │      └── Doğrulama kodu (sistem üretir)
 │     │      │      │      └── Bitiş tarihi (şifreli, sistem üretir)
 │     │      │      └── Paket & şube bilgisi (şifreli, sistem üretir)
 │     │      └── Müşteri kodu (otomatik türetilir)
 │     └── Üretim yılı (otomatik)
 └── Ürün kodu (sabit)
```

> Anahtarın içindeki tüm bilgiler şifreli ve sistem tarafından otomatik üretilir. Sen sadece müşteri bilgilerini ve paketi seçersin.

#### Lisans Tipleri

| Tip | Açıklama |
|---|---|
| Aylık | Her ay otomatik hatırlatma & yenileme |
| Yıllık | Her yıl otomatik hatırlatma & yenileme |
| Ömür Boyu | Tek seferlik — sona erme tarihi yok |

#### Lisans Yenileme Akışı

```
Müşteri ödeme yapar
        ↓
Admin panelde "Yenile" butonuna bas
        ↓
Sistem yeni bitiş tarihini günceller
        ↓
Yenileme maili otomatik gönderilir
        ↓
Müşteri yeni anahtar girmek zorunda kalmaz
(sunucu tarafında otomatik güncellenir)
```

---

### 📧 22. Otomatik Lisans Hatırlatma Sistemi

#### Mail Takvimi

```
30 gün kala → 1. Mail — "Hizmetinizin bitmesine 1 ay kaldı"
23 gün kala → 2. Mail — "Hizmetinizin bitmesine 23 gün kaldı"
16 gün kala → 3. Mail — "Hizmetinizin bitmesine 16 gün kaldı"
 9 gün kala → 4. Mail — "Hizmetinizin bitmesine 9 gün kaldı"
 2 gün kala → 5. Mail — "Hizmetinizin bitmesine 2 gün kaldı — acil"
 Bitiş günü → 6. Mail — "Hizmetiniz bugün sona eriyor"
    +1 gün  → Sistem otomatik kitlenir
    +1 gün  → 7. Mail — "Sisteminiz durduruldu"
```

> 1 ay önceden başlar, her 7 günde bir tekrar eder, son 2 günde sıklaşır.

#### Sistem Kilit Kuralı

```
Lisans süresi doldu
        ↓
Müşteri sistemi sunucudan koparırsa
7 gün içinde sunucuya ulaşamazsa
        ↓
Uygulama otomatik kitlenir
Ekranda: "Lisansınız sona erdi.
          Yenilemek için: 0532 XXX XX XX"
```

#### Backup Dondurma Kuralı

```
Lisans sona erdi & ödeme yapılmadı
        ↓
Yeni backup alımı durdurulur
Mevcut backuplar sende saklanır
        ↓
Ödeme yapılınca
        ↓
Backuplar iade edilir + sistem anında açılır
```

---

### 🖥️ 23. Admin Yönetim Paneli *(Sadece Sen Kullanırsın)*

#### Özellikler

- Müşteri listesi & lisans durumları
- Tek tıkla lisans üretme & mail gönderme
- Lisans uzatma / durdurma / aktif etme
- Ödeme takibi & durum güncelleme
- Yaklaşan bitiş tarihleri uyarı listesi
- Müşteri bazlı backup arşivi görüntüleme
- Manuel hatırlatma maili gönderme
- Şube sayısı & paket değişikliği
- Güncelleme dağıtımı (tüm müşterilere veya seçiliye)

#### Paket Tanımları

| Paket | Şube | Kasa | Yıllık Fiyat | Ömür Boyu |
|---|---|---|---|---|
| Starter | 1 | 2 | 3.000-5.000₺ | 12.000-18.000₺ |
| Pro | 3 | 6 | 7.000-10.000₺ | — |
| Zincir | 10+ | Sınırsız | 15.000-25.000₺ | — |
| Kurulum Ücreti | — | — | 2.000-5.000₺ (tek seferlik) | — |


---

## Geliştirme Yol Haritası — Güncellenmiş Tam Liste

### Temel Sistem (Tek Şube)

| Faz | İçerik | Süre |
|---|---|---|
| Faz 0 | PostgreSQL kurulumu + branch_id altyapısı | 2 gün |
| Faz 1 | Ürün & Stok + Akıllı Liste | 1 hafta |
| Faz 2 | Kasa & Satış + Fiş & Etiket | 1.5 hafta |
| Faz 3 | Terazi Entegrasyonu | 3 gün |
| Faz 4 | Personel & Vardiya | 4 gün |
| Faz 5 | Müşteri & Veresiye | 3 gün |
| Faz 6 | Kampanya & Çoklu Fiyat | 4 gün |
| Faz 7 | Raporlama & Dashboard | 1 hafta |
| Faz 8 | Tedarikçi & PDF Fatura | 4 gün |
| Faz 9 | Fiyat Takip & Mail | 1 hafta |
| Faz 10 | Market Sahibi Mobil Panel | 4 gün |
| Faz 11 | Z Raporu & Gmail Yedek | 3 gün |
| Faz 12 | Import / Export | 2 gün |
| Faz 13 | Satış Hedefi | 2 gün |
| Faz 14 | Test & Optimizasyon | 1 hafta |
| **Toplam** | | **~13-14 hafta** |

### Çok Şubeli Mod (Opsiyonel)

| Faz | İçerik | Süre |
|---|---|---|
| Faz 15 | Şube yönetimi | 3 gün |
| Faz 16 | Şubeler arası stok görünümü | 3 gün |
| Faz 17 | Şubeler arası transfer yönetimi | 4 gün |
| Faz 18 | Merkezi raporlama | 4 gün |
| Faz 19 | Müşteri ortak havuzu | 2 gün |
| Faz 20 | VPN kurulumu & uzak şube bağlantısı | 2 gün |
| Faz 21 | Offline sync & çakışma yönetimi | 3 gün |
| Faz 22 | Çok şubeli test & optimizasyon | 1 hafta |
| **Ek Toplam** | | **~4 hafta** |

### Yazılım Satış Altyapısı

| Faz | İçerik | Süre |
|---|---|---|
| Faz 23 | Lisans doğrulama & kilit sistemi | 4 gün |
| Faz 24 | Backup → merkezi sunucu gönderimi | 3 gün |
| Faz 25 | Admin yönetim paneli | 1 hafta |
| Faz 26 | Otomatik lisans hatırlatma mailleri | 2 gün |
| Faz 27 | Otomatik güncelleme dağıtımı | 3 gün |
| **Ek Toplam** | | **~3 hafta** |

---

*Versiyon 2.1 — Lisans yönetim sistemi & admin paneli eklendi.*

---

### 🔄 24. Sürekli Lisans Kontrol Sistemi

#### Üç Katmanlı Kontrol

**1. Açılış Kontrolü**
```
Uygulama her açıldığında
        ↓
Sunucuya lisans sorgusu gönderilir
        ↓
Geçerli  → Sistem açılır
Geçersiz → Kilit ekranı gösterilir
```

**2. Günlük Kontrol**
```
Her gece 00:00'da otomatik
        ↓
Sunucuya "Ben aktifim" sinyali
        ↓
Onay gelir  → Devam eder
Onay gelmez → Ertesi sabah açılışta kilit
```

**3. Anlık Arka Plan Kontrolü**
```
Her 6 saatte bir sessizce kontrol
        ↓
Sunucudan "durdur" sinyali gelirse
        ↓
Uygulama anında kitlenir
(Admin panelden anlık durdurma yapılabilir)
```

#### Offline Tolerans Kuralı

```
Sunucuya ulaşılamıyor (internet / ağ yok)
        ↓
7 güne kadar çalışmaya devam eder
        ↓
7. günde hâlâ ulaşılamazsa
        ↓
Otomatik kilitlenir
Ekran: "Lisans doğrulanamadı. 
        İletişim: 0532 XXX XX XX"
```

---

### 📱 25. Yeni Cihaz & Lisans Hatırlatma

#### Müşteri Lisansını Unutursa

```
Yeni cihaza uygulama kurulur
        ↓
Giriş ekranında "Lisans Anahtarımı Unuttum" butonu
        ↓
Kayıtlı mail adresini girer
        ↓
Senin sunucuna istek gider
        ↓
Kayıtlı lisans bulunur
        ↓
Mevcut lisans bilgileri otomatik mail ile gönderilir
```

**Gönderilen Mail İçeriği:**
```
Konu: Lisans Bilgileriniz — [Market Adı]

Sayın [Yetkili Adı],

Mevcut lisans bilgileriniz:

Lisans Anahtarı : MYS-2026-AHMT-X7K9-P2M4-Q8W1
Paket           : Yıllık Pro
Şube Sayısı     : 3
Geçerlilik      : 22.03.2026 — 22.03.2027
Kalan Süre      : 187 gün

Bu işlemi siz yapmadıysanız
hemen iletişime geçin:
📞 0532 XXX XX XX
```

#### Cihaz Limiti — Kötüye Kullanım Önlemi

| Paket | Max Cihaz |
|---|---|
| Starter | 2 cihaz |
| Pro | 6 cihaz |
| Zincir | Sınırsız |

```
Limit aşılırsa
        ↓
"Bu lisans maksimum cihaz limitine ulaştı.
 Yeni cihaz eklemek için iletişime geçin:
 📞 0532 XXX XX XX"
```

> Sen admin panelden cihaz limitini artırabilir veya eski cihazı sistemden kaldırabilirsin.

#### Admin Paneli — Cihaz Takibi

- Müşteri bazlı aktif cihaz listesi
- Her cihazın son aktif olma tarihi
- Cihaz konumu (hangi şube, hangi kasa)
- Tek tıkla cihaz kaldırma
- Limit aşımı uyarısı


---

### 🧙 26. Kurulum Sihirbazı *(Faz 2 içinde)*

Teknik olmayan biri de sistemi kolayca kurabilsin:

```
Adım 1 → Market bilgileri (ad, adres, telefon, fiş başlığı)
Adım 2 → Yazıcı bağlantısı (Bluetooth termal yazıcı eşleştirme)
Adım 3 → Terazi bağlantısı (IP & port testi)
Adım 4 → İlk ürün yükleme (Excel import veya manuel)
Adım 5 → Test satışı (kurulumun doğru çalıştığını doğrula)
```

- Her adımda "Test Et" butonu
- Hata varsa açık Türkçe hata mesajı
- İstenen adım atlanabilir, sonradan tamamlanabilir
- Kurulum tamamlanınca özet ekranı

---

### ⏰ 27. Kasa Açık Kalma Uyarısı *(Faz 2 içinde)*

- Belirlenen saatten sonra kasa hâlâ açıksa otomatik mail gider
- "Kasa XX:XX itibarıyla açık kalmış, kontrol edin" mail içeriği
- Otomatik kapanış saati ayarı (opsiyonel)
- Kapanış saati ayarlar ekranından yapılandırılır

---

### 🎟️ 28. İndirim Kuponu *(Faz 6 içinde)*

- Kupon kodu tanımlama (örn: BAYRAM10, HOSGELDIN)
- Tek kullanımlık veya çok kullanımlık seçeneği
- Kişiye özel veya herkese açık
- Yüzde indirim veya sabit tutar indirimi
- Geçerlilik tarihi tanımlama
- Kasada "Kupon Kodu" butonu → kod girilince otomatik uygulanır
- Kupon kullanım raporu

---

### 🌅 29. Gün Başı Kontrol Listesi *(Faz 7 içinde)*

Sabah uygulama açılınca tek ekranda tüm önemli bilgiler:

```
Günaydın Ahmet! — 22 Mart 2026

⚠️  Kritik stok      → 3 ürün sipariş edilmeli
📅  SKT yaklaşan     → 5 ürün (7 gün içinde)
🔁  Bekleyen transfer → Şube 2'den 10 adet Süt 1L bekleniyor
💰  Fiyat güncellemesi → 8 üründe zam tespit edildi
🟢  Kasa              → Açılmaya hazır
```

- Her madde tıklanabilir, ilgili ekrana yönlendirir
- "Tümünü Gördüm" butonuyla geçilir
- Sorun yoksa direkt dashboard açılır

---

### 🔊 30. Barkod Ses & Titreşim Ayarı *(Faz 15 içinde)*

- Başarılı okuma sesi seçimi (bip, çift bip, özel ses)
- Hata sesi seçimi
- Ses seviyesi ayarı
- Titreşim açık / kapalı
- Sessiz mod (gürültüsüz ortam için)

---

### 🛟 31. Destek & Uzaktan Erişim *(Faz 25 içinde)*

**Müşteri Tarafında:**
- "Destek Talebi" butonu → açıklama yaz → mail gider
- AnyDesk veya TeamViewer ID görüntüleme ekranı

**Admin Panelinde:**
- Müşteri bazlı destek talebi listesi
- Her müşteri kartında AnyDesk ID alanı
- Talep durumu (bekliyor / çözüldü)
- Çözüm notu ekleme

---

### 📡 32. API Dokümantasyonu *(Faz 29 — En Son)*

Sistem tamamlandıktan sonra dışa açık API:

- REST API endpointleri (ürün, satış, stok, müşteri)
- Swagger UI arayüzü
- Muhasebe yazılımı entegrasyonu için
- E-ticaret entegrasyonu için
- API anahtarı ile güvenli erişim
- Her müşteri için ayrı API anahtarı

---

## Güncellenmiş Tam Faz Listesi (v2.1)

### Temel Sistem

| Faz | İçerik | Süre |
|---|---|---|
| Faz 0 | Altyapı kurulumu (PostgreSQL + branch_id) | 2 gün |
| Faz 1 | Ürün & Stok + Akıllı Liste | 1 hafta |
| Faz 2 | Kasa & Satış + Kurulum Sihirbazı + Kasa Açık Uyarısı | 2 hafta |
| Faz 3 | Terazi Entegrasyonu | 3 gün |
| Faz 4 | Personel & Vardiya | 4 gün |
| Faz 5 | Müşteri & Veresiye | 3 gün |
| Faz 6 | Kampanya & Çoklu Fiyat + İndirim Kuponu | 5 gün |
| Faz 7 | Raporlama + Gün Başı Kontrol Listesi | 1 hafta |
| Faz 8 | Tedarikçi & PDF Fatura | 4 gün |
| Faz 9 | Fiyat Takip & Mail | 1 hafta |
| Faz 10 | Market Sahibi Mobil Panel | 4 gün |
| Faz 11 | Z Raporu & Gmail Yedek | 3 gün |
| Faz 12 | Import / Export | 2 gün |
| Faz 13 | Satış Hedefi | 2 gün |
| Faz 14 | Test & Optimizasyon | 1 hafta |
| Faz 15 | Sistem & Ayarlar + Barkod Ses/Titreşim | 3 gün |
| **Toplam** | | **~15 hafta** |

### Çok Şubeli Mod (Opsiyonel)

| Faz | İçerik | Süre |
|---|---|---|
| Faz 16 | Şube Yönetimi | 3 gün |
| Faz 17 | Şubeler Arası Stok Görünümü | 3 gün |
| Faz 18 | Şubeler Arası Transfer | 4 gün |
| Faz 19 | Merkezi Raporlama | 4 gün |
| Faz 20 | Müşteri Ortak Havuzu | 2 gün |
| Faz 21 | VPN & Uzak Şube Bağlantısı | 2 gün |
| Faz 22 | Offline Sync & Çakışma Yönetimi | 3 gün |
| Faz 23 | Çok Şubeli Test & Optimizasyon | 1 hafta |
| **Ek Toplam** | | **~4 hafta** |

### Yazılım Satış Altyapısı

| Faz | İçerik | Süre |
|---|---|---|
| Faz 24 | Lisans Doğrulama & Kilit Sistemi | 4 gün |
| Faz 25 | Merkezi Backup + Destek & Uzaktan Erişim | 4 gün |
| Faz 26 | Admin Yönetim Paneli | 1 hafta |
| Faz 27 | Otomatik Lisans Hatırlatma Mailleri | 2 gün |
| Faz 28 | Güncelleme Dağıtım Sistemi | 3 gün |
| Faz 29 | API Dokümantasyonu | 1 hafta |
| **Ek Toplam** | | **~4 hafta** |

---

*Versiyon 2.2 — Kurulum sihirbazı, gün başı kontrol, kupon, ses ayarları, destek & API modülleri eklendi.*

---

### 💳 33. POS Entegrasyonu

#### Temel Felsefe

Her market farklı POS cihazı kullandığından sistem POS'tan tamamen bağımsız çalışır. Kasiyer iki cihazı paralel kullanır — bu Türkiye'deki tüm marketlerin mevcut çalışma şeklidir.

#### Kasada Akış

```
Ürünler tarandı → Toplam: 74,10₺
        ↓
Kasiyer ödeme tipini seçer (Nakit / Kart / Karma)
        ↓
Kart seçilirse ekranda büyük ve net gösterilir:
"POS'a şu tutarı girin: 74,10₺"
        ↓
Kasiyer POS'ta işlemi tamamlar
"Ödeme Alındı ✓" butonuna basar
        ↓
Sistem satışı kaydeder
```

#### Fiş Durumu

| Ödeme Tipi | Fiş Nereden Çıkar? |
|---|---|
| Nakit | Bizim Bluetooth termal yazıcıdan |
| Kart | POS cihazından (banka fişi) |
| Karma | Nakit kısım bizden + Kart kısım POS'tan |

#### Karma Ödeme Örneği

```
Toplam: 150₺
Nakit : 50₺ gir → Para üstü: 0₺
Kart  : 100₺  → POS'a 100₺ gir
        ↓
Ödeme Tamamlandı ✓
```

#### Ayarlar'da POS Seçeneği

```
POS Entegrasyonu:
● Entegrasyon yok — manuel (varsayılan, herkese uyar)
○ PAX ECR protokolü (ileride eklenebilir)
○ Ingenico protokolü (ileride eklenebilir)
○ Özel protokol (talep üzerine)
```

Başlangıçta herkes "Entegrasyon yok" ile çalışır. İleride belirli bir marka için entegrasyon eklenirse sadece o modül eklenir, sistem değişmez.


---

### 📦 33. Stok Sayım Modu *(Faz 1 içinde)*

Belirli aralıklarla tüm market taranarak stok sayımı yapılır. Sayım sırasında kasa çalışmaya devam eder.

```
Sayım Başlat
        ↓
Sistem mevcut stok rakamlarını kilitler
        ↓
Kasiyer / depocu barkod tarayarak sayar
        ↓
Sistem "beklenen vs sayılan" farkı hesaplar
        ↓
Fark raporu → onay → stok güncellenir
```

- Sayım sırasında kasa normal çalışır
- Kısmi sayım (sadece bir kategori)
- Sayım geçmişi & fark raporu
- Çoklu kişiyle eş zamanlı sayım (şubeli modda)

---

### 🎨 34. Ürün Varyantı *(Faz 1 içinde)*

Aynı ürünün farklı boyut veya özelliklerini tek ürün altında yönet:

```
Ana Ürün: Süt
├── Varyant 1: 500ml → 9,90₺
├── Varyant 2: 1L    → 18,90₺
└── Varyant 3: 2L    → 34,50₺
```

- Her varyantın ayrı barkodu
- Her varyantın ayrı stok takibi
- Her varyantın ayrı fiyatı
- Kasada varyant seçim ekranı

---

### 🗑️ 35. Çöp Kutusu (Soft Delete) *(Faz 1 içinde)*

Yanlışlıkla silinen veriler kaybolmaz:

- Ürün, müşteri, tedarikçi silinince çöp kutusuna gider
- 30 gün içinde geri alınabilir
- 30 gün sonra otomatik kalıcı silinir
- Çöp kutusu ekranı (ne zaman silindiği görünür)
- Toplu geri alma veya kalıcı silme

---

### ⚡ 36. Hızlı Ürün Butonları *(Faz 2 içinde)*

Kasada en çok satılan ürünler için tek dokunuş kısayolları:

```
┌────┬────┬────┬────┐
│🍞  │🥛  │💧  │🥚  │
│Ekmek│Süt │Su  │Yumurta│
├────┼────┼────┼────┤
│🧻  │🧴  │🍫  │    │
│Kağıt│Şamp│Çiko│+Ekle│
└────┴────┴────┴────┘
```

- 12 adede kadar hızlı buton
- Sürükle & bırak ile sıralama
- Ürün görseli veya emoji seçimi
- Kasiyerin kendisi düzenleyebilir

---

### 🖥️ 37. Müşteri Display Ekranı *(Faz 2 içinde)*

Kasada müşterinin karşısına bakan ikinci ekran:

- Tabletten HDMI veya WiFi ile bağlanır
- Müşteri sepetini ve toplamını görür
- Kampanya uygulandıysa gösterir
- Ödeme ekranında tutarı gösterir
- Boştayken market adı / logo / kampanya gösterir

---

### 🧮 38. Gün Sonu Kasa Sayım Ekranı *(Faz 2 içinde)*

Z raporundan önce kasadaki parayı say:

```
┌─────────────────────────────┐
│  Kasa Sayımı                │
├─────────────────────────────┤
│  200₺  × [  3  ] = 600₺   │
│  100₺  × [  5  ] = 500₺   │
│   50₺  × [  4  ] = 200₺   │
│   20₺  × [  7  ] = 140₺   │
│   10₺  × [ 12  ] = 120₺   │
│    5₺  × [  8  ] =  40₺   │
│    1₺  × [ 23  ] =  23₺   │
├─────────────────────────────┤
│  Toplam Sayılan : 1.623₺   │
│  Olması Gereken : 1.620₺   │
│  Fark           :    +3₺   │
└─────────────────────────────┘
```

- Her banknot için adet girişi
- Sistem toplamı otomatik hesaplar
- Beklenenle karşılaştırır
- Fark varsa nedeni not eklenebilir

---

### 🖨️ 39. Yazıcı Şablonu Özelleştirme *(Faz 2 içinde)*

Fişi markete özel tasarla:

- Fiş başlığı (market adı, adres, telefon)
- Fiş alt yazısı ("Teşekkürler! Güle güle")
- Sosyal medya hesabı ("Instagram: @marketim")
- Web sitesi
- Kampanya mesajı ("Cuma günleri %10 indirim!")
- Yazdırma önizleme (basmadan önce ekranda göster)
- 58mm / 80mm kağıt boyutu seçimi

---

### 🌐 40. Offline Mod Göstergesi *(Faz 2 içinde)*

Her ekranın köşesinde sürekli görünen durum çubuğu:

```
🟢 Çevrimiçi                 (normal)
🟡 Bağlanıyor...             (yeniden bağlanma)
🔴 Offline · 3 işlem bekliyor (internet yok)
```

- Bağlantı kesilince anında güncellenir
- Bekleyen işlem sayısı gösterilir
- Bağlantı gelince "Sync tamamlandı ✓" bildirimi
- Kasiyeri paniğe sokmayan sakin tasarım

---

### 💰 41. Tedarikçi Ödeme Takibi *(Faz 8 içinde)*

Tedarikçiye olan borç ve ödeme geçmişi:

- Vadeli alım kaydı (30 gün, 60 gün vb.)
- Tedarikçi bazlı borç özeti
- Ödeme kaydı ekleme
- Vade tarihi geçen borçlar üste çıkar
- Tedarikçi bazlı ödeme geçmişi
- Aylık tedarikçi borç raporu

---

### 📊 42. Ürün Fiyat Geçmişi *(Faz 7 içinde)*

Bir ürünün satış ve maliyet fiyatı zaman içinde nasıl değişti:

- Satış fiyatı geçmişi grafiği
- Maliyet fiyatı geçmişi grafiği
- Kâr marjı değişimi grafiği
- Fiyat değişikliği tarihleri listesi
- Kim değiştirdi, ne zaman (log)

---

### 🧾 43. e-Arşiv Fatura *(Yeni Faz 30)*

30.000₺ üzeri satışlarda GİB e-arşiv fatura zorunluluğu:

- Fatura kes butonu (kasada opsiyonel)
- Müşteri TC/Vergi No girişi
- GİB entegrasyonu veya entegratör API
- PDF fatura oluşturma & mail gönderme
- Fatura geçmişi & iptal

> **Not:** GİB entegrasyonu teknik açıdan karmaşık. Başlangıçta PDF fatura oluşturma, ileride GİB entegrasyonu eklenebilir.

---

### 🌍 44. Dil Desteği *(Faz 15 içinde)*

- Başlangıçta Türkçe
- Altyapı çok dile hazır kurulur (i18n)
- Ayarlardan dil seçimi
- İleride: İngilizce, Arapça, Rusça eklenebilir

---

### 💡 Küçük Ama Önemli Detaylar

**Kasa Ekranı Parlaklık Ayarı *(Faz 15 içinde)***
- Gündüz / gece modu
- Otomatik parlaklık (saat bazlı)
- Manuel parlaklık kaydırıcısı

---

## Güncellenmiş Tam Faz Listesi (v2.3)

### Temel Sistem

| Faz | İçerik | Süre |
|---|---|---|
| Faz 0 | Altyapı kurulumu | 2 gün |
| Faz 1 | Ürün & Stok + Varyant + Sayım Modu + Çöp Kutusu | 1.5 hafta |
| Faz 2 | Kasa & Satış + Kurulum Sihirbazı + Hızlı Butonlar + Display + Kasa Sayım + Yazıcı Şablonu + Offline Göstergesi + Yazdırma Önizleme | 2.5 hafta |
| Faz 3 | Terazi Entegrasyonu | 3 gün |
| Faz 4 | Personel & Vardiya | 4 gün |
| Faz 5 | Müşteri & Veresiye | 3 gün |
| Faz 6 | Kampanya & Çoklu Fiyat + İndirim Kuponu | 5 gün |
| Faz 7 | Raporlama + Gün Başı Kontrol + Fiyat Geçmişi | 1 hafta |
| Faz 8 | Tedarikçi & PDF Fatura + Ödeme Takibi | 5 gün |
| Faz 9 | Fiyat Takip & Mail | 1 hafta |
| Faz 10 | Market Sahibi Mobil Panel | 4 gün |
| Faz 11 | Z Raporu & Gmail Yedek | 3 gün |
| Faz 12 | Import / Export | 2 gün |
| Faz 13 | Satış Hedefi | 2 gün |
| Faz 14 | Test & Optimizasyon | 1 hafta |
| Faz 15 | Sistem & Ayarlar + Barkod Ses + Dil + Parlaklık | 4 gün |
| **Toplam** | | **~17 hafta** |

### Çok Şubeli Mod (Opsiyonel)

| Faz | İçerik | Süre |
|---|---|---|
| Faz 16 | Şube Yönetimi | 3 gün |
| Faz 17 | Şubeler Arası Stok | 3 gün |
| Faz 18 | Transfer Yönetimi | 4 gün |
| Faz 19 | Merkezi Raporlama | 4 gün |
| Faz 20 | Müşteri Ortak Havuzu | 2 gün |
| Faz 21 | VPN & Uzak Şube | 2 gün |
| Faz 22 | Offline Sync & Çakışma | 3 gün |
| Faz 23 | Çok Şubeli Test | 1 hafta |
| **Ek Toplam** | | **~4 hafta** |

### Yazılım Satış Altyapısı

| Faz | İçerik | Süre |
|---|---|---|
| Faz 24 | Lisans Doğrulama & Kilit | 4 gün |
| Faz 25 | Merkezi Backup + Destek & Uzaktan Erişim | 4 gün |
| Faz 26 | Admin Yönetim Paneli | 1 hafta |
| Faz 27 | Lisans Hatırlatma Mailleri | 2 gün |
| Faz 28 | Güncelleme Dağıtımı | 3 gün |
| Faz 29 | API Dokümantasyonu | 1 hafta |
| Faz 30 | e-Arşiv Fatura | 1 hafta |
| **Ek Toplam** | | **~5 hafta** |

---

*Versiyon 2.3 — Stok sayım, varyant, çöp kutusu, hızlı butonlar, display, kasa sayım, yazıcı şablonu, offline gösterge, tedarikçi ödeme takibi, fiyat geçmişi, e-arşiv, dil desteği eklendi.*

---

### 🎂 45. Müşteri Doğum Günü & Özel Gün *(Faz 5 içinde)*

- Müşteri kartına doğum günü alanı
- Doğum günü sabahı otomatik mail gönderilir
- "Size özel %10 indirim — iyi ki doğdunuz!" içeriği
- Otomatik kupon kodu oluşturulur & maile eklenir
- Kupon geçerlilik süresi (örn: 7 gün)
- Özel gün tanımlama (yıldönümü vb.)

---

### 📬 46. Kritik Stok & Günlük Özet Mail *(Faz 7 içinde)*

**Kritik Stok Alarm Maili:**
- Her sabah belirlenen saatte (örn: 08:00) otomatik çalışır
- Kritik stokta ürün varsa market sahibine mail gider
- Mail açılmadan içeriği anlaşılır konu satırı:
  "⚠️ 3 üründe kritik stok — 22 Mart 2026"

**Günlük Özet Maili:**
- Her gece Z raporundan sonra otomatik gönderilir
- Z raporundan farklı — daha sade ve okunabilir:
```
Bugünkü Özet — 22 Mart 2026

💰 Ciro         : 4.250₺
📦 İşlem Sayısı : 47
📈 En Çok Satan : Süt 1L (47 adet)
⚠️ Kritik Stok  : 3 ürün
```
- Hangi maillerin gönderileceği ayarlardan seçilir

---

### 🔒 47. Satış İptal Yetki Limiti *(Faz 4 içinde)*

- Yönetici, kasiyer için maksimum iade/iptal tutarı belirler
- Örn: 500₺ üzeri iade → yönetici PIN'i gerekir
- Limit ayarlardan yapılandırılır
- Limitin aşılması loglanır
- Yönetici onayı verince işlem tamamlanır
- Onay geçmişi raporlanabilir

---

### 🏷️ 48. Kasa Açılış Şifresi *(Faz 4 içinde)*

Yönetici onayı olmadan kasa açılmasın:

- Günlük kasa açılış şifresi (yönetici belirler)
- Her sabah yönetici şifreyi kasiyere söyler veya
- Yönetici uzaktan mobil panelden onay verir
- Şifresiz açılış girişimi loglanır
- Opsiyonel — ayarlardan açılıp kapatılabilir

---

### 🔍 49. Barkoddan Otomatik Ürün Bilgisi *(Faz 1 içinde)*

Barkod girilince ürün bilgileri otomatik dolar:

```
Barkod: 8690526085552 girildi
        ↓
Open Food Facts API sorgusu
        ↓
Ürün Adı : Sütaş Tam Yağlı Süt 1L  ← otomatik
Resim    : [ürün görseli]            ← otomatik
Kategori : Süt Ürünleri             ← otomatik
        ↓
Sadece fiyat & stok girilir
```

- Ücretsiz Open Food Facts API kullanılır
- Bulunamazsa manuel giriş yapılır
- Bulunan bilgiler düzenlenebilir
- Türkiye ürünlerinin büyük çoğunluğu veritabanında mevcut

---

### 🏷️ 50. Toplu Barkod Etiketi Yazdırma *(Faz 2 içinde)*

- Tüm ürünlerin veya seçili kategorinin etiketlerini toplu bas
- Yeni market kurulumunda tek seferde tüm etiketler
- Fiyat değişikliğinde sadece değişen ürünlerin etiketleri
- Kaç adet basılacağı seçilebilir (stok adedi kadar otomatik)
- 58mm / 80mm kağıt boyutuna göre şablon

---

### 💸 51. QR & Temassız Ödeme *(Faz 2 içinde)*

POS bağımsız alternatif ödeme seçeneği:

- Papara QR
- BKM Express
- Kasada "QR ile Öde" butonu
- Ekranda QR kodu gösterilir
- Müşteri telefonuyla okutup öder
- Ödeme onayı gelince sistem otomatik kaydeder
- Komisyon oranları ayarlardan tanımlanır

---

## Güncellenmiş Tam Faz Listesi (v2.4)

### Temel Sistem

| Faz | İçerik | Süre |
|---|---|---|
| Faz 0 | Altyapı kurulumu | 2 gün |
| Faz 1 | Ürün & Stok + Varyant + Sayım + Çöp Kutusu + Barkoddan Otomatik Bilgi | 2 hafta |
| Faz 2 | Kasa & Satış + Kurulum Sihirbazı + Hızlı Butonlar + Display + Kasa Sayım + Yazıcı Şablonu + Offline Gösterge + Toplu Etiket + QR Ödeme | 3 hafta |
| Faz 3 | Terazi Entegrasyonu | 3 gün |
| Faz 4 | Personel & Vardiya + İptal Yetki Limiti + Kasa Açılış Şifresi | 5 gün |
| Faz 5 | Müşteri & Veresiye + Doğum Günü Maili | 4 gün |
| Faz 6 | Kampanya & Çoklu Fiyat + İndirim Kuponu | 5 gün |
| Faz 7 | Raporlama + Gün Başı Kontrol + Fiyat Geçmişi + Kritik Stok & Günlük Özet Mail | 1.5 hafta |
| Faz 8 | Tedarikçi & PDF Fatura + Ödeme Takibi | 5 gün |
| Faz 9 | Fiyat Takip & Mail | 1 hafta |
| Faz 10 | Market Sahibi Mobil Panel | 4 gün |
| Faz 11 | Z Raporu & Gmail Yedek | 3 gün |
| Faz 12 | Import / Export | 2 gün |
| Faz 13 | Satış Hedefi | 2 gün |
| Faz 14 | Test & Optimizasyon | 1 hafta |
| Faz 15 | Sistem & Ayarlar + Barkod Ses + Dil + Parlaklık | 4 gün |
| **Toplam** | | **~19 hafta** |

### Çok Şubeli Mod (Opsiyonel)

| Faz | İçerik | Süre |
|---|---|---|
| Faz 16 | Şube Yönetimi | 3 gün |
| Faz 17 | Şubeler Arası Stok | 3 gün |
| Faz 18 | Transfer Yönetimi | 4 gün |
| Faz 19 | Merkezi Raporlama | 4 gün |
| Faz 20 | Müşteri Ortak Havuzu | 2 gün |
| Faz 21 | VPN & Uzak Şube | 2 gün |
| Faz 22 | Offline Sync & Çakışma | 3 gün |
| Faz 23 | Çok Şubeli Test | 1 hafta |
| **Ek Toplam** | | **~4 hafta** |

### Yazılım Satış Altyapısı

| Faz | İçerik | Süre |
|---|---|---|
| Faz 24 | Lisans Doğrulama & Kilit | 4 gün |
| Faz 25 | Merkezi Backup + Destek & Uzaktan Erişim | 4 gün |
| Faz 26 | Admin Yönetim Paneli | 1 hafta |
| Faz 27 | Lisans Hatırlatma Mailleri | 2 gün |
| Faz 28 | Güncelleme Dağıtımı | 3 gün |
| Faz 29 | API Dokümantasyonu | 1 hafta |
| Faz 30 | e-Arşiv Fatura | 1 hafta |
| **Ek Toplam** | | **~5 hafta** |

---

**Genel Toplam: ~28 hafta (~7 ay)**

| Aşama | Süre |
|---|---|
| Temel sistem | ~19 hafta |
| Çok şubeli mod | +4 hafta |
| Yazılım satış altyapısı | +5 hafta |
| **Toplam** | **~28 hafta** |

---

*Versiyon 2.4 — Doğum günü maili, kritik stok & günlük özet mail, iptal yetki limiti, kasa açılış şifresi, barkoddan otomatik ürün bilgisi, toplu etiket yazdırma, QR ödeme eklendi. Sistem tamamlandı.*

---

### 👔 52. Çalışan İzin & Devamsızlık Takibi *(Faz 4 içinde)*

- İzin talebi oluşturma (yıllık, mazeret, ücretsiz)
- Yönetici onay / ret mekanizması
- Günlük devam durumu (geldi / izinli / devamsız)
- Aylık çalışma saati özeti
- İzin bakiyesi takibi (yıllık izin hakkı - kullanılan)
- Devamsızlık geçmişi & raporu
- Bugün izinli olan personel → gün başı kontrol listesine otomatik eklenir

---

### 🏷️ 53. Barkod Etiket Tasarımcısı *(Faz 2 içinde)*

Marketçi etiketi istediği gibi tasarlasın:

**Etiket Üzerinde Gösterilebilecekler:**
- Ürün adı (yazı boyutu ayarlanabilir)
- Fiyat (büyük / orta / küçük seçimi)
- Barkod (göster / gizle)
- SKT tarihi (göster / gizle)
- Raf yeri (göster / gizle)
- Market logosu / adı
- KDV dahil / hariç gösterimi

**Tasarım Özellikleri:**
- Sürükle & bırak düzenleyici
- 58mm / 80mm kağıt boyutu şablonu
- Kayıtlı şablon (bir kez tasarla, hep kullan)
- Önizleme (basmadan ekranda gör)
- Birden fazla şablon (normal fiyat / indirimli fiyat / tartımlı ürün)

---

## Güncellenmiş Tam Faz Listesi (v2.5 — Final)

### Temel Sistem

| Faz | İçerik | Süre |
|---|---|---|
| Faz 0 | Altyapı kurulumu | 2 gün |
| Faz 1 | Ürün & Stok + Varyant + Sayım + Çöp Kutusu + Barkoddan Otomatik Bilgi | 2 hafta |
| Faz 2 | Kasa & Satış + Kurulum Sihirbazı + Hızlı Butonlar + Display + Kasa Sayım + Yazıcı Şablonu + Etiket Tasarımcısı + Offline Gösterge + Toplu Etiket + QR Ödeme | 3 hafta |
| Faz 3 | Terazi Entegrasyonu | 3 gün |
| Faz 4 | Personel & Vardiya + İptal Limiti + Kasa Şifresi + İzin & Devamsızlık | 1 hafta |
| Faz 5 | Müşteri & Veresiye + Doğum Günü Maili | 4 gün |
| Faz 6 | Kampanya & Çoklu Fiyat + İndirim Kuponu | 5 gün |
| Faz 7 | Raporlama + Gün Başı Kontrol + Fiyat Geçmişi + Kritik Stok & Günlük Özet Mail | 1.5 hafta |
| Faz 8 | Tedarikçi & PDF Fatura + Ödeme Takibi | 5 gün |
| Faz 9 | Fiyat Takip & Mail | 1 hafta |
| Faz 10 | Market Sahibi Mobil Panel | 4 gün |
| Faz 11 | Z Raporu & Gmail Yedek | 3 gün |
| Faz 12 | Import / Export | 2 gün |
| Faz 13 | Satış Hedefi | 2 gün |
| Faz 14 | Test & Optimizasyon | 1 hafta |
| Faz 15 | Sistem & Ayarlar + Barkod Ses + Dil + Parlaklık | 4 gün |
| **Toplam** | | **~20 hafta** |

### Çok Şubeli Mod (Opsiyonel)

| Faz | İçerik | Süre |
|---|---|---|
| Faz 16 | Şube Yönetimi | 3 gün |
| Faz 17 | Şubeler Arası Stok | 3 gün |
| Faz 18 | Transfer Yönetimi | 4 gün |
| Faz 19 | Merkezi Raporlama | 4 gün |
| Faz 20 | Müşteri Ortak Havuzu | 2 gün |
| Faz 21 | VPN & Uzak Şube | 2 gün |
| Faz 22 | Offline Sync & Çakışma | 3 gün |
| Faz 23 | Çok Şubeli Test | 1 hafta |
| **Ek Toplam** | | **~4 hafta** |

### Yazılım Satış Altyapısı

| Faz | İçerik | Süre |
|---|---|---|
| Faz 24 | Lisans Doğrulama & Kilit | 4 gün |
| Faz 25 | Merkezi Backup + Destek & Uzaktan Erişim | 4 gün |
| Faz 26 | Admin Yönetim Paneli | 1 hafta |
| Faz 27 | Lisans Hatırlatma Mailleri | 2 gün |
| Faz 28 | Güncelleme Dağıtımı | 3 gün |
| Faz 29 | API Dokümantasyonu | 1 hafta |
| Faz 30 | e-Arşiv Fatura | 1 hafta |
| **Ek Toplam** | | **~5 hafta** |

---

### 📊 Sistem Final Özeti

| | |
|---|---|
| Toplam Modül | 53 |
| Toplam Faz | 30 |
| Temel sistem | ~20 hafta |
| Çok şubeli mod | +4 hafta |
| Yazılım satış | +5 hafta |
| **Genel Toplam** | **~29 hafta (~7 ay)** |

---

*Versiyon 2.5 Final — Çalışan izin & devamsızlık takibi ve barkod etiket tasarımcısı eklendi. Sistem tamamlandı.*
