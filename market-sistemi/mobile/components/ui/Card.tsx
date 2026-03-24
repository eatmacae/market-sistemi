/**
 * Market Yönetim Sistemi — Card Komponenti
 * İçerik kartları — Light/Dark temada otomatik renk
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { SPACING, RADIUS } from '../../constants/spacing';

interface CardProps {
  children   : React.ReactNode;
  style?     : ViewStyle;
  elevated?  : boolean;   // Daha belirgin gölge
  padding?   : number;
}

export function Card({ children, style, elevated = false, padding = SPACING.base }: CardProps) {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        styles.kart,
        {
          backgroundColor: colors.bgSecondary,
          borderColor    : colors.border,
          padding        : padding,
          // Karanlık temada gölge yerine border kullan
          shadowColor    : isDark ? 'transparent' : '#000',
          shadowOpacity  : elevated ? 0.12 : 0.06,
          elevation      : elevated ? 6 : 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  kart: {
    borderRadius  : RADIUS.card,
    borderWidth   : 1,
    shadowOffset  : { width: 0, height: 2 },
    shadowRadius  : 8,
    overflow      : 'hidden',
  },
});
