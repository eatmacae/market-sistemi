# QA Hata Listesi — Market Yönetim Sistemi

> Son güncelleme: 2026-03-26
> Tüm fazlar tamamlandı. Bu liste emülatör testi + kod incelemesinden üretilmiştir.

---

## Sprint Final — Hata Listesi

| ID | Öncelik | Ekran/Modül | Açıklama | Durum |
|----|---------|-------------|----------|-------|
| 1  | 🟢 COSMETIC | `products.py:307` | `datetime.utcnow()` deprecated — `datetime.now(UTC)` kullanılmalı | ✅ Düzeltildi |
| 2  | 🟡 MINOR | `(kasa)/index` light tema | Offline banner "🔴 Offline · 0 işlem bekliyor" gösteriyor — 0 işlem varken banner gizlenmeli | ✅ Düzeltildi |
| 3  | 🟡 MINOR | `(sahip)/index` | Deep link sadece `/(sahip)/` formatıyla çalışıyor, `/sahip` çalışmıyor — dahili navigasyon ile erişilmeli | Bilgi |
| 4  | 🟢 COSMETIC | Tüm ekranlar | `76 pytest warning` — çoğu `DeprecationWarning`, işlevselliği etkilemiyor | ✅ Düzeltildi |

---

## ✅ Geçen Kontroller

### Ekran Kalite Kontrol (25/25 Ekran)

| Kriter | Sonuç |
|--------|-------|
| Loading state | ✅ 25/25 ekranda mevcut |
| Empty state | ✅ 25/25 ekranda mevcut |
| Error state | ✅ 25/25 ekranda mevcut |
| Offline banner | ✅ 25/25 ekranda mevcut |
| Min 48px dokunma | ✅ `MIN_TOUCH_SIZE` sabiti kullanılıyor |
| Türkçe karakterler | ✅ Emülatörde doğrulandı |
| `useTheme()` / hardcode renk yok | ✅ 29 dosyada temizlendi |
| Dark temada okunabilir | ✅ Tüm ekranlar test edildi |
| Light temada okunabilir | ✅ Tüm ekranlar test edildi (2026-03-25) |

### Backend Test Sonuçları

| Test Paketi | Sonuç |
|-------------|-------|
| `test_auth.py` (12 test) | ✅ Geçti |
| `test_products.py` (20 test) | ✅ Geçti |
| `test_stock.py` (18 test) | ✅ Geçti |
| `test_security.py` (21 test) | ✅ Geçti |
| **Toplam** | ✅ **71/71** |

### Güvenlik Kontrolleri

| Kontrol | Sonuç |
|---------|-------|
| SQL injection koruması | ✅ test_security.py ile doğrulandı |
| RBAC (rol tabanlı erişim) | ✅ test_security.py ile doğrulandı |
| Branch izolasyonu | ✅ test_products.py ile doğrulandı |
| Soft delete (gerçek silme yok) | ✅ test_products.py ile doğrulandı |
| Negatif fiyat reddi | ✅ `gt=0` validator mevcut |
| Credential .env dışında yok | ✅ Kod incelemesinde doğrulandı |

### Mobile Jest Testleri

| Test Paketi | Sonuç |
|-------------|-------|
| `cartStore.test.ts` (15 test) | ✅ Geçti |
| `stockStore.test.ts` (11 test) | ✅ Geçti |
| `authStore.test.ts` (8 test) | ✅ Geçti |
| `Badge.test.tsx` (12 test) | ✅ Geçti |
| `Button.test.tsx` (11 test) | ✅ Geçti |
| `storage.test.ts` (10 test) | ✅ Geçti |
| **Toplam** | ✅ **67/67** |

---

## ✅ Tamamlanan Fonksiyonel Geliştirmeler (2026-03-26)

| Geliştirme | Açıklama |
|------------|----------|
| `units_per_case` | Ürün modeli + schema + fatura parser + mobile form + SQLite cache |
| Offline idempotency | `operation_id` UUID + `syncPendingOperations()` + backend middleware + `idempotency_keys` tablosu |
| mDNS otomatik keşif | Backend zeroconf kaydı + Settings ekranı "Otomatik Bul" butonu |

## 📋 Bekleyen QA Görevleri

| Görev | Öncelik | Not |
|-------|---------|-----|
| E2E testler (Detox/Maestro) | Orta | Offline → kuyruk → sync akışı kritik |
| Backend coverage raporu | Düşük | `pytest --cov=. --cov-report=html` |
| Mobile test coverage | Düşük | `npm test -- --coverage` |
| CI/CD pipeline | Orta | GitHub Actions |
| Çok şube gerçek akış testi | Düşük | ✅ test_multibranch.py yazıldı (6 sınıf, 14 test) |
| Electron installer testi | Düşük | ✅ 10/10 Jest testi geçti (setup.test.js) |
