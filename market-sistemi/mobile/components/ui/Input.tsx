/**
 * Market Yönetim Sistemi — Input Komponenti
 * Tüm metin girişleri için — Light/Dark tema destekli
 */

import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE } from '../../constants/typography';

interface InputProps extends TextInputProps {
  label?       : string;
  error?       : string;
  leftIcon?    : React.ReactNode;
  rightIcon?   : React.ReactNode;
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  error,
  leftIcon,
  rightIcon,
  containerStyle,
  style,
  ...props
}: InputProps) {
  const { colors }    = useTheme();
  const [odakli, setOdakli] = useState(false);

  const kenarRengi = error
    ? colors.danger
    : odakli
    ? colors.blue
    : colors.border;

  return (
    <View style={[styles.sarmalayici, containerStyle]}>
      {/* Etiket */}
      {label && (
        <Text style={[styles.etiket, { color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium }]}>
          {label}
        </Text>
      )}

      {/* Giriş alanı */}
      <View
        style={[
          styles.girisKutusu,
          {
            backgroundColor: colors.bgSecondary,
            borderColor    : kenarRengi,
          },
        ]}
      >
        {/* Sol ikon */}
        {leftIcon && <View style={styles.ikon}>{leftIcon}</View>}

        <TextInput
          {...props}
          onFocus = {(e) => { setOdakli(true);  props.onFocus?.(e); }}
          onBlur  = {(e) => { setOdakli(false); props.onBlur?.(e);  }}
          style={[
            styles.giris,
            {
              color     : colors.textPrimary,
              fontFamily: FONT_FAMILY.body,
              fontSize  : FONT_SIZE.base,
            },
            leftIcon  ? styles.girisIkonSol : null,
            rightIcon ? styles.girisIkonSag : null,
            style,
          ]}
          placeholderTextColor = {colors.textHint}
          cursorColor          = {colors.blue}
        />

        {/* Sağ ikon */}
        {rightIcon && <View style={styles.ikon}>{rightIcon}</View>}
      </View>

      {/* Hata mesajı */}
      {error && (
        <Text style={[styles.hata, { color: colors.danger, fontFamily: FONT_FAMILY.body }]}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sarmalayici: {
    gap: SPACING.xs,
  },
  etiket: {
    fontSize: FONT_SIZE.sm,
  },
  girisKutusu: {
    flexDirection : 'row',
    alignItems    : 'center',
    borderWidth   : 1.5,
    borderRadius  : RADIUS.button,
    minHeight     : MIN_TOUCH_SIZE,
    paddingHorizontal: SPACING.base,
  },
  giris: {
    flex       : 1,
    paddingVertical: SPACING.sm,
  },
  girisIkonSol: {
    paddingLeft: SPACING.xs,
  },
  girisIkonSag: {
    paddingRight: SPACING.xs,
  },
  ikon: {
    marginHorizontal: SPACING.xs,
  },
  hata: {
    fontSize: FONT_SIZE.xs,
  },
});
