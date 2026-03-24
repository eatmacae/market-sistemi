/**
 * Market Yönetim Sistemi — Boşluk ve Köşe Yarıçapı Sabitleri
 * Tüm margin, padding ve border-radius değerleri buradan gelir.
 */

export const SPACING = {
  xs  :  4,
  sm  :  8,
  md  : 12,
  base: 16,
  lg  : 20,
  xl  : 24,
  xxl : 32,
} as const;

export const RADIUS = {
  button: 8,   // Butonlar
  card  : 12,  // Kartlar
  modal : 16,  // Modallar
  badge : 999, // Rozetler (tam yuvarlak)
} as const;

// Min dokunma alanı — erişilebilirlik için zorunlu
export const MIN_TOUCH_SIZE = 48;
