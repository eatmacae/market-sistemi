/**
 * Market Yönetim Sistemi — Tipografi Sabitleri
 * DMSans: gövde metinleri | Syne: başlıklar
 */

export const FONT_FAMILY = {
  body        : 'DMSans-Regular',
  bodyMedium  : 'DMSans-Medium',
  bodySemiBold: 'DMSans-SemiBold',
  bodyBold    : 'DMSans-Bold',
  heading     : 'Syne-Bold',
  headingSemi : 'Syne-SemiBold',
} as const;

export const FONT_SIZE = {
  xs  : 11,
  sm  : 13,
  base: 15,
  md  : 17,
  lg  : 20,
  xl  : 24,
  xxl : 30,
  hero: 36,
} as const;

export const LINE_HEIGHT = {
  tight  : 1.2,
  normal : 1.5,
  relaxed: 1.75,
} as const;
