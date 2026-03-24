/**
 * Market Yönetim Sistemi — Akıllı Stok Listesi Elemanı
 * Renk kodlaması, aciliyet puanı, SKT uyarısı gösterir
 */

import React, { memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { Badge, stokDurumBadge, stokDurumLabel } from '../ui/Badge';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE } from '../../constants/typography';
import { STOCK_COLOR } from '../../constants/colors';

interface StockItemProps {
  id            : number;
  name          : string;
  barcode?      : string | null;
  unit          : string;
  stock_qty     : number;
  min_stock     : number;
  price         : number;
  cost?         : number | null;
  shelf_location?: string | null;
  durum         : 'critical' | 'threshold' | 'adequate' | 'dormant';
  aciliyet_puani: number;
  gunluk_satis  : number;
  skt_uyarisi?  : 'critical' | 'warning' | null;
  expiry_date?  : string | null;
  onPress?      : (id: number) => void;
  onLongPress?  : (id: number) => void;
}

// memo: yeniden render'ı önle — stok listesi çok büyük olabilir
export const StockItem = memo(function StockItem({
  id,
  name,
  barcode,
  unit,
  stock_qty,
  min_stock,
  price,
  cost,
  shelf_location,
  durum,
  aciliyet_puani,
  gunluk_satis,
  skt_uyarisi,
  expiry_date,
  onPress,
  onLongPress,
}: StockItemProps) {
  const { colors } = useTheme();

  // Sol kenar rengi stok durumuna göre
  const kenar_rengi = {
    critical : STOCK_COLOR.critical,
    threshold: STOCK_COLOR.threshold,
    adequate : STOCK_COLOR.adequate,
    dormant  : STOCK_COLOR.dormant,
  }[durum];

  // Kar marjı hesapla
  const kar_marji = cost && cost > 0
    ? Math.round(((price - cost) / cost) * 100)
    : null;

  return (
    <TouchableOpacity
      onPress     = {() => onPress?.(id)}
      onLongPress = {() => onLongPress?.(id)}
      activeOpacity = {0.7}
      style={[
        styles.kart,
        {
          backgroundColor: colors.bgSecondary,
          borderColor    : colors.border,
          borderLeftColor: kenar_rengi,
        },
        // Kritik stok için hafif glow
        durum === 'critical' && {
          shadowColor  : STOCK_COLOR.critical,
          shadowOpacity: 0.25,
          shadowRadius : 8,
          elevation    : 4,
        },
      ]}
      accessibilityRole  = "button"
      accessibilityLabel = {`${name}, stok: ${stock_qty} ${unit}`}
    >
      {/* ÜST BÖLÜM: İsim + Durum */}
      <View style={styles.ust}>
        <View style={styles.isimBolum}>
          <Text
            style={[styles.isim, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium }]}
            numberOfLines={2}
          >
            {name}
          </Text>
          {barcode && (
            <Text style={[styles.barkod, { color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
              {barcode}
            </Text>
          )}
        </View>

        {/* Durum rozeti */}
        <Badge
          label   = {stokDurumLabel(durum)}
          variant = {stokDurumBadge(durum)}
          glow    = {durum === 'critical'}
        />
      </View>

      {/* ORTA BÖLÜM: Stok + Fiyat */}
      <View style={styles.orta}>
        {/* Stok miktarı */}
        <View style={styles.bilgiKart}>
          <Text style={[styles.bilgiEtiket, { color: colors.textHint }]}>Stok</Text>
          <Text style={[
            styles.bilgiDeger,
            { color: durum === 'critical' ? STOCK_COLOR.critical : colors.textPrimary },
            { fontFamily: FONT_FAMILY.bodySemiBold },
          ]}>
            {stock_qty} <Text style={styles.birim}>{unit}</Text>
          </Text>
          <Text style={[styles.bilgiAlt, { color: colors.textHint }]}>
            Min: {min_stock}
          </Text>
        </View>

        {/* Satış fiyatı */}
        <View style={styles.bilgiKart}>
          <Text style={[styles.bilgiEtiket, { color: colors.textHint }]}>Satış</Text>
          <Text style={[styles.bilgiDeger, { color: colors.success, fontFamily: FONT_FAMILY.bodySemiBold }]}>
            ₺{price.toFixed(2)}
          </Text>
          {kar_marji !== null && (
            <Text style={[styles.bilgiAlt, { color: colors.textHint }]}>
              Kar: %{kar_marji}
            </Text>
          )}
        </View>

        {/* Günlük satış hızı */}
        <View style={styles.bilgiKart}>
          <Text style={[styles.bilgiEtiket, { color: colors.textHint }]}>Günlük</Text>
          <Text style={[styles.bilgiDeger, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
            {gunluk_satis.toFixed(1)}
          </Text>
          <Text style={[styles.bilgiAlt, { color: colors.textHint }]}>adet/gün</Text>
        </View>

        {/* Aciliyet puanı */}
        {aciliyet_puani > 0 && (
          <View style={styles.bilgiKart}>
            <Text style={[styles.bilgiEtiket, { color: colors.textHint }]}>Aciliyet</Text>
            <Text style={[
              styles.bilgiDeger,
              { color: aciliyet_puani >= 40 ? STOCK_COLOR.critical : colors.warning },
              { fontFamily: FONT_FAMILY.bodySemiBold },
            ]}>
              {aciliyet_puani}
            </Text>
          </View>
        )}
      </View>

      {/* ALT BÖLÜM: Raf yeri + SKT uyarısı */}
      {(shelf_location || skt_uyarisi) && (
        <View style={styles.alt}>
          {shelf_location && (
            <View style={[styles.rafEtiketi, { backgroundColor: colors.bgTertiary }]}>
              <Text style={[styles.rafMetin, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
                📦 Raf: {shelf_location}
              </Text>
            </View>
          )}

          {skt_uyarisi && expiry_date && (
            <Badge
              label   = {`⚠️ SKT: ${expiry_date}`}
              variant = {skt_uyarisi === 'critical' ? 'danger' : 'warning'}
            />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  kart: {
    borderRadius  : RADIUS.card,
    borderWidth   : 1,
    borderLeftWidth: 4,    // Sol renk şeridi
    padding       : SPACING.base,
    marginHorizontal: SPACING.base,
    marginVertical : SPACING.xs,
    minHeight     : MIN_TOUCH_SIZE,
    shadowOffset  : { width: 0, height: 2 },
    gap           : SPACING.sm,
  },
  ust: {
    flexDirection : 'row',
    alignItems    : 'flex-start',
    justifyContent: 'space-between',
    gap           : SPACING.sm,
  },
  isimBolum: {
    flex: 1,
    gap : 2,
  },
  isim: {
    fontSize: FONT_SIZE.base,
  },
  barkod: {
    fontSize: FONT_SIZE.xs,
  },
  orta: {
    flexDirection : 'row',
    gap           : SPACING.sm,
    flexWrap      : 'wrap',
  },
  bilgiKart: {
    minWidth: 60,
    gap     : 1,
  },
  bilgiEtiket: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
  },
  bilgiDeger: {
    fontSize: FONT_SIZE.md,
  },
  bilgiAlt: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
  },
  birim: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.body,
  },
  alt: {
    flexDirection: 'row',
    alignItems   : 'center',
    gap          : SPACING.sm,
    flexWrap     : 'wrap',
  },
  rafEtiketi: {
    paddingHorizontal: SPACING.sm,
    paddingVertical  : SPACING.xs - 1,
    borderRadius     : RADIUS.button,
  },
  rafMetin: {
    fontSize: FONT_SIZE.xs,
  },
});
