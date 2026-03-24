/**
 * Market Yönetim Sistemi — Sepet Kalemi Komponenti
 * Miktar artır/azalt, ürün çıkar, kampanya rozeti göster
 */

import React, { memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { Badge } from '../ui/Badge';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE } from '../../constants/typography';

interface CartItemProps {
  productId         : number;
  name              : string;
  unit              : string;
  qty               : number;
  unitPrice         : number;
  discount          : number;
  total             : number;
  kampanyaAciklama? : string | null;
  onArtir           : (productId: number) => void;
  onAzalt           : (productId: number) => void;
  onSil             : (productId: number) => void;
}

export const CartItem = memo(function CartItem({
  productId,
  name,
  unit,
  qty,
  unitPrice,
  discount,
  total,
  kampanyaAciklama,
  onArtir,
  onAzalt,
  onSil,
}: CartItemProps) {
  const { colors } = useTheme();

  const indirimVar = discount > 0;

  return (
    <View
      style={[
        styles.kart,
        {
          backgroundColor: colors.bgSecondary,
          borderColor    : colors.border,
        },
      ]}
    >
      {/* ÜST BÖLÜM: Ürün adı + Sil */}
      <View style={styles.ust}>
        <Text
          style={[styles.urunAdi, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium }]}
          numberOfLines={2}
        >
          {name}
        </Text>
        <TouchableOpacity
          onPress  = {() => onSil(productId)}
          hitSlop  = {{ top: 8, bottom: 8, left: 8, right: 8 }}
          style    = {[styles.silButon, { minWidth: MIN_TOUCH_SIZE, minHeight: MIN_TOUCH_SIZE }]}
          accessibilityLabel = "Ürünü sepetten çıkar"
        >
          <Text style={{ color: colors.danger, fontSize: 18 }}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Kampanya rozeti */}
      {kampanyaAciklama && (
        <Badge
          label   = {`🎁 ${kampanyaAciklama}`}
          variant = "success"
          style   = {{ marginTop: 2 }}
        />
      )}

      {/* ALT BÖLÜM: Miktar kontrolü + Tutar */}
      <View style={styles.alt}>
        {/* Miktar Kontrolü */}
        <View style={styles.miktarKontrol}>
          <TouchableOpacity
            onPress = {() => onAzalt(productId)}
            style={[
              styles.miktarButon,
              {
                backgroundColor: colors.bgTertiary,
                borderColor    : colors.border,
                minWidth       : MIN_TOUCH_SIZE,
                minHeight      : MIN_TOUCH_SIZE,
              },
            ]}
            accessibilityLabel = "Miktarı azalt"
          >
            <Text style={[styles.miktarIkon, { color: colors.textPrimary }]}>−</Text>
          </TouchableOpacity>

          <View style={styles.miktarGosterge}>
            <Text style={[styles.miktarDeger, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
              {qty % 1 === 0 ? qty : qty.toFixed(3)}
            </Text>
            <Text style={[styles.birim, { color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
              {unit}
            </Text>
          </View>

          <TouchableOpacity
            onPress = {() => onArtir(productId)}
            style={[
              styles.miktarButon,
              {
                backgroundColor: colors.blue,
                borderColor    : colors.blue,
                minWidth       : MIN_TOUCH_SIZE,
                minHeight      : MIN_TOUCH_SIZE,
              },
            ]}
            accessibilityLabel = "Miktarı artır"
          >
            <Text style={[styles.miktarIkon, { color: '#FFFFFF' }]}>+</Text>{/* mavi buton üzerinde sabit beyaz */}
          </TouchableOpacity>
        </View>

        {/* Tutar Bilgisi */}
        <View style={styles.tutarBolum}>
          {/* Birim fiyat */}
          <Text style={[styles.birimFiyat, { color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
            {unitPrice.toFixed(2)}₺ × {qty % 1 === 0 ? qty : qty.toFixed(3)}
          </Text>

          {/* İndirim varsa göster */}
          {indirimVar && (
            <Text style={[styles.indirim, { color: colors.danger, fontFamily: FONT_FAMILY.body }]}>
              −{discount.toFixed(2)}₺
            </Text>
          )}

          {/* Satır toplamı */}
          <Text style={[styles.toplam, { color: colors.success, fontFamily: FONT_FAMILY.bodySemiBold }]}>
            {total.toFixed(2)}₺
          </Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  kart: {
    borderRadius : RADIUS.card,
    borderWidth  : 1,
    padding      : SPACING.base,
    marginBottom : SPACING.xs,
    gap          : SPACING.sm,
  },
  ust: {
    flexDirection : 'row',
    alignItems    : 'flex-start',
    justifyContent: 'space-between',
    gap           : SPACING.sm,
  },
  urunAdi: {
    flex    : 1,
    fontSize: FONT_SIZE.base,
  },
  silButon: {
    alignItems    : 'center',
    justifyContent: 'center',
  },
  alt: {
    flexDirection : 'row',
    alignItems    : 'center',
    justifyContent: 'space-between',
    gap           : SPACING.sm,
  },
  miktarKontrol: {
    flexDirection: 'row',
    alignItems   : 'center',
    gap          : SPACING.xs,
  },
  miktarButon: {
    borderRadius : RADIUS.button,
    borderWidth  : 1,
    alignItems   : 'center',
    justifyContent: 'center',
    width        : MIN_TOUCH_SIZE,
    height       : MIN_TOUCH_SIZE,
  },
  miktarIkon: {
    fontSize  : 22,
    fontFamily: FONT_FAMILY.bodyBold,
    lineHeight: 26,
  },
  miktarGosterge: {
    alignItems: 'center',
    minWidth  : 48,
  },
  miktarDeger: {
    fontSize: FONT_SIZE.md,
  },
  birim: {
    fontSize: FONT_SIZE.xs,
  },
  tutarBolum: {
    alignItems: 'flex-end',
    gap       : 2,
  },
  birimFiyat: {
    fontSize: FONT_SIZE.xs,
  },
  indirim: {
    fontSize: FONT_SIZE.xs,
  },
  toplam: {
    fontSize: FONT_SIZE.lg,
  },
});
