/**
 * Market Yönetim Sistemi — Button Komponenti
 * Tüm dokunma alanları min 48px — erişilebilirlik kuralı
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE } from '../../constants/typography';

// Buton varyantları
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
type Size    = 'sm' | 'md' | 'lg';

interface ButtonProps {
  onPress     : () => void;
  label       : string;
  variant?    : Variant;
  size?       : Size;
  loading?    : boolean;
  disabled?   : boolean;
  fullWidth?  : boolean;
  leftIcon?   : React.ReactNode;
  rightIcon?  : React.ReactNode;
  style?      : ViewStyle;
  labelStyle? : TextStyle;
}

export function Button({
  onPress,
  label,
  variant   = 'primary',
  size      = 'md',
  loading   = false,
  disabled  = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  style,
  labelStyle,
}: ButtonProps) {
  const { colors } = useTheme();

  // Varyanta göre renk belirle
  const bgRenk: Record<Variant, string> = {
    primary  : colors.blue,
    secondary: colors.bgTertiary,
    danger   : colors.danger,
    ghost    : 'transparent',
    success  : colors.success,
  };

  const metin_renk: Record<Variant, string> = {
    primary  : '#FFFFFF',
    secondary: colors.textPrimary,
    danger   : '#FFFFFF',
    ghost    : colors.blue,
    success  : '#FFFFFF',
  };

  const yukseklik: Record<Size, number> = {
    sm: MIN_TOUCH_SIZE,      // 48px minimum
    md: 52,
    lg: 58,
  };

  const yazı_boyutu: Record<Size, number> = {
    sm: FONT_SIZE.sm,
    md: FONT_SIZE.base,
    lg: FONT_SIZE.md,
  };

  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress     = {onPress}
      disabled    = {isDisabled}
      activeOpacity = {0.75}
      style={[
        styles.buton,
        {
          backgroundColor: bgRenk[variant],
          height          : yukseklik[size],
          minHeight       : MIN_TOUCH_SIZE,
          borderRadius    : RADIUS.button,
          opacity         : isDisabled ? 0.5 : 1,
          borderWidth     : variant === 'ghost' ? 1 : 0,
          borderColor     : variant === 'ghost' ? colors.blue : undefined,
        },
        fullWidth && styles.tamGenislik,
        style,
      ]}
      accessibilityRole  = "button"
      accessibilityLabel = {label}
      accessibilityState = {{ disabled: isDisabled, busy: loading }}
    >
      {/* Sol ikon */}
      {!loading && leftIcon && leftIcon}

      {/* Yükleniyor animasyonu */}
      {loading ? (
        <ActivityIndicator
          color = {metin_renk[variant]}
          size  = "small"
        />
      ) : (
        <Text
          style={[
            styles.metin,
            {
              color    : metin_renk[variant],
              fontSize : yazı_boyutu[size],
              fontFamily: FONT_FAMILY.bodySemiBold,
            },
            leftIcon || rightIcon ? styles.metinIkonlu : null,
            labelStyle,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}

      {/* Sağ ikon */}
      {!loading && rightIcon && rightIcon}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  buton: {
    flexDirection  : 'row',
    alignItems     : 'center',
    justifyContent : 'center',
    paddingHorizontal: SPACING.lg,
    gap            : SPACING.sm,
  },
  tamGenislik: {
    width: '100%',
  },
  metin: {
    letterSpacing: 0.2,
  },
  metinIkonlu: {
    marginHorizontal: SPACING.xs,
  },
});
