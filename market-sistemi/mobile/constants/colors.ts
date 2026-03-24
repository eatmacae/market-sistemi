/**
 * Market Yönetim Sistemi — Renk Sabitleri
 * Design System'e göre Light ve Dark tema renkleri
 * UYARI: Bu dosyadan renklere eriş. Hardcode renk YASAK.
 */

// Aksent ve durum renkleri (her iki temada aynı)
export const ACCENT = {
  blue   : '#4F8EF7', // Ana aksent
  success: '#12C98A', // Başarı / yeterli stok
  warning: '#F5A623', // Uyarı / eşik stok
  danger : '#F04F4F', // Tehlike / kritik stok
  purple : '#9B6EF7', // İkincil aksent
  cyan   : '#06C4D4', // Üçüncül aksent
} as const;

// Stok renk kodlaması
export const STOCK_COLOR = {
  critical : '#F04F4F', // 🔴 Kritik
  threshold: '#F5A623', // 🟡 Eşik
  adequate : '#12C98A', // 🟢 Yeterli
  dormant  : '#64748B', // 💤 Durgun
} as const;

// Dark tema
export const DarkTheme = {
  // Arka planlar
  bgPrimary  : '#0A0E1A',
  bgSecondary: '#111827', // Kartlar
  bgTertiary : '#1A2235', // Yüzey

  // Kenarlıklar
  border     : '#2A3A55',

  // Metinler
  textPrimary: '#F1F5F9',
  textMuted  : '#94A3B8',
  textHint   : '#64748B',

  // Aksent (temadan bağımsız)
  ...ACCENT,
} as const;

// Light tema
export const LightTheme = {
  // Arka planlar
  bgPrimary  : '#FFFFFF',
  bgSecondary: '#F8FAFC', // Kartlar
  bgTertiary : '#F1F5F9', // Yüzey

  // Kenarlıklar
  border     : '#E2E8F0',

  // Metinler
  textPrimary: '#0F172A',
  textMuted  : '#475569',
  textHint   : '#94A3B8',

  // Aksent (temadan bağımsız)
  ...ACCENT,
} as const;

// Tema tipi — useTheme hook'u için
export type ThemeColors = typeof DarkTheme;
