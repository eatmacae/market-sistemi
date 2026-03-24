# 🏪 Market Yönetim Sistemi

## Proje Tanımı
Tamamen local çalışan, sıfır aylık maliyetli, yazılım olarak satılabilen profesyonel market yönetim sistemi.

- **Mobil:** React Native + Expo SDK 51+
- **Backend:** Python FastAPI 0.111+
- **Veritabanı:** PostgreSQL 15+
- **Offline Cache:** SQLite (her tablette)

## Referans Dosyalar
- `docs/gelistirme_hazirlik_v3.md` → Teknik detaylar, DB şeması, API yapısı
- `docs/market_yonetim_sistemi_v2.md` → Tüm 53 modül ve 30 faz
- `docs/takım_rol_promptlari.md` → Her faz için görev listesi

## ✅ Kesin Kurallar — ASLA İhlal Edilmez

### Tema & Stil
- `useTheme()` hook zorunlu — hardcode renk **YASAK**
- `StyleSheet.create` ile stiller yazılır
- Light ve Dark temada test edilmeden teslim edilmez

### UX
- Min **48px** dokunma alanı (tüm butonlar)
- Her ekranda **loading state** zorunlu
- Her ekranda **empty state** zorunlu
- Her ekranda **error state** zorunlu
- Offline durumda `🔴 Offline · X işlem bekliyor` göstergesi

### Güvenlik & Veri
- Her kritik işlemde `audit_log.log_action()` zorunlu
- **Soft delete** kullanılır (`is_deleted`, `deleted_at`) — gerçek silme YASAK
- Her tabloda `branch_id` olacak (çok şubeli yapıya hazır)
- `.env` dışında credential olmayacak

### Kod Kalitesi
- TypeScript (frontend)
- Türkçe yorum satırları
- Her komponent ayrı dosyada
- Async/await (backend)

## 🎨 Design System

### Renkler
```
Aksent Blue  : #4F8EF7
Başarı       : #12C98A
Uyarı        : #F5A623
Tehlike      : #F04F4F
Purple       : #9B6EF7
Cyan         : #06C4D4
```

### Dark Tema
```
BG Primary   : #0A0E1A
BG Secondary : #111827 (kartlar)
BG Tertiary  : #1A2235 (yüzey)
Border       : #2A3A55
Text Primary : #F1F5F9
Text Muted   : #94A3B8
Text Hint    : #64748B
```

### Light Tema
```
BG Primary   : #FFFFFF
BG Secondary : #F8FAFC (kartlar)
BG Tertiary  : #F1F5F9
Border       : #E2E8F0
Text Primary : #0F172A
Text Muted   : #475569
Text Hint    : #94A3B8
```

### Spacing & Radius
```
Spacing : 4 / 8 / 12 / 16 / 20 / 24 / 32
Radius  : 8px (btn) | 12px (card) | 16px (modal) | 999px (badge)
```

### Stok Renk Kodlaması
```
🔴 Kritik  : #F04F4F + glow efekti
🟡 Eşik    : #F5A623
🟢 Yeterli : #12C98A
💤 Durgun  : #64748B
```

## 📋 Faz Durumu

- [x] Faz 0 — Altyapı & Güvenlik
- [x] Faz 1 — Fatura İşleme & Ürün
- [x] Faz 2 — Kasa & Satış
- [x] Faz 3 — Analiz & Yedekleme
- [x] Faz 4 — Personel, Müşteri & Kampanya
- [x] Faz 5 — Market Sahibi Paneli & Hedefler
- [x] Faz 6 — Sistem & Ayarlar
- [ ] Faz 7 — Çok Şubeli Mod (opsiyonel)
- [ ] Faz 8 — Yazılım Satış Altyapısı

## 🚀 Her Faz Başında

```
1. docs/takım_rol_promptlari.md dosyasını oku
2. İlgili faz görevlerini sırayla yaz
3. Her dosyayı tamamla, sonra bir sonrakine geç
4. Kalite kontrol listesini doldur
```

## 📦 Her Faz Sonunda — GitHub'a Yükle

```bash
cd ATM   # Repo kökü burası

# 1. Değişiklikleri stage'e al
git add .

# 2. Faz commit'i oluştur
git commit -m "feat: Faz X tamamlandı — [kısa açıklama]"

# 3. GitHub'a push et
git push
```

GitHub: https://github.com/eatmacae/market-sistemi

## ✅ Kalite Kontrol Listesi (Her Ekran)

```
□ Loading state var mı?
□ Empty state var mı?
□ Hata durumu handle ediliyor mu?
□ Offline durumda ne oluyor?
□ Audit log tetikleniyor mu?
□ Min 48px dokunma alanı?
□ Türkçe karakterler doğru mu?
□ Light ve Dark temada okunabilir mi?
□ useTheme() kullanılıyor, hardcode renk yok mu?
□ Mockup ile görsel uyum var mı?
```
