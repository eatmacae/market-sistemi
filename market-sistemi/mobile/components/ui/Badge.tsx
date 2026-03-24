/**
 * Market Yönetim Sistemi — Badge Komponenti
 * Stok durumu, rol etiketi, sayı rozeti için
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { SPACING, RADIUS } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE } from '../../constants/typography';
import { STOCK_COLOR } from '../../constants/colors';

type BadgeVariant =
  | 'critical'   // 🔴 Kritik stok
  | 'threshold'  // 🟡 Eşik stok
  | 'adequate'   // 🟢 Yeterli stok
  | 'dormant'    // 💤 Durgun stok
  | 'info'       // Genel bilgi
  | 'success'
  | 'warning'
  | 'danger';

interface BadgeProps {
  label   : string;
  variant?: BadgeVariant;
  style?  : ViewStyle;
  glow?   : boolean;   // Kritik stok için kırmızı glow efekti
}

export function Badge({ label, variant = 'info', style, glow = false }: BadgeProps) {
  const { colors } = useTheme();

  // Her varyant için arka plan ve metin rengi
  const renkler: Record<BadgeVariant, { bg: string; text: string }> = {
    critical : { bg: STOCK_COLOR.critical,  text: '#FFFFFF' },
    threshold: { bg: STOCK_COLOR.threshold, text: '#FFFFFF' },
    adequate : { bg: STOCK_COLOR.adequate,  text: '#FFFFFF' },
    dormant  : { bg: STOCK_COLOR.dormant,   text: '#FFFFFF' },
    info     : { bg: colors.bgTertiary,     text: colors.textMuted },
    success  : { bg: colors.success,        text: '#FFFFFF' },
    warning  : { bg: colors.warning,        text: '#FFFFFF' },
    danger   : { bg: colors.danger,         text: '#FFFFFF' },
  };

  const { bg, text } = renkler[variant];

  return (
    <View
      style={[
        styles.rozet,
        { backgroundColor: bg },
        // Kritik stok glow efekti
        glow && variant === 'critical' && {
          shadowColor  : STOCK_COLOR.critical,
          shadowOpacity: 0.6,
          shadowRadius : 8,
          elevation    : 4,
        },
        style,
      ]}
    >
      <Text style={[styles.metin, { color: text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// Stok durumunu Badge varyantına çevir
export function stokDurumBadge(durum: string): BadgeVariant {
  switch (durum) {
    case 'critical' : return 'critical';
    case 'threshold': return 'threshold';
    case 'adequate' : return 'adequate';
    case 'dormant'  : return 'dormant';
    default         : return 'info';
  }
}

// Stok durumu Türkçe etiketi
export function stokDurumLabel(durum: string): string {
  switch (durum) {
    case 'critical' : return '⚡ Kritik';
    case 'threshold': return '⚠️ Eşik';
    case 'adequate' : return '✓ Yeterli';
    case 'dormant'  : return '💤 Durgun';
    default         : return durum;
  }
}

const styles = StyleSheet.create({
  rozet: {
    paddingHorizontal: SPACING.sm,
    paddingVertical  : SPACING.xs - 1,
    borderRadius     : RADIUS.badge,
    alignSelf        : 'flex-start',
    shadowOffset     : { width: 0, height: 0 },
  },
  metin: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemiBold,
    letterSpacing: 0.3,
  },
});
