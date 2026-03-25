/**
 * Market Yönetim Sistemi — Stok Hareketi Gir Ekranı
 *
 * Kullanım:
 *   /stok-hareket?product_id=42   (belirli ürün için)
 *   /stok-hareket                 (ürün arama ile)
 *
 * Desteklenen hareket tipleri:
 *   adjust  → Sayım düzeltmesi (yeni_miktar gönderilir)
 *   waste   → Fire / zayi (miktar düşer)
 *   receive → Manuel stok girişi (miktar artar)
 *
 * Kalite kontrol:
 * ✅ Loading state
 * ✅ Error state
 * ✅ Empty state — ürün bulunamadı
 * ✅ Offline state — banner gösterilir, işlem engellenir
 * ✅ useTheme() — hardcode renk yok
 * ✅ Min 48px dokunma alanı
 * ✅ Audit log (backend routes/stock.py'de)
 * ✅ Türkçe yorum satırları
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settingsStore';
import { api } from '../../services/api';
import { getPendingCount } from '../../services/storage';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE } from '../../constants/typography';
import { WHITE } from '../../constants/colors';

// ============================================================
// TİPLER
// ============================================================

type HareketTipi = 'adjust' | 'waste' | 'receive';

interface UrunOzet {
  id       : number;
  name     : string;
  barcode  : string | null;
  unit     : string;
  stock_qty: number;
  min_stock: number;
}

// Fire sebepleri (waste tipi için)
const FIRE_SEBEPLERI = [
  { key: 'skt_gecmis', label: 'SKT Geçmiş' },
  { key: 'hasar',      label: 'Hasarlı / Kırık' },
  { key: 'calinan',    label: 'Kayıp / Çalınan' },
  { key: 'diger',      label: 'Diğer' },
];

// ============================================================
// KOMPONENT
// ============================================================

export default function StokHareketEkrani() {
  const { product_id }  = useLocalSearchParams<{ product_id?: string }>();
  const router          = useRouter();
  const { colors }      = useTheme();
  const { branchId }    = useSettingsStore();

  // ── Genel durum ──
  const [yukleniyor, setYukleniyor]       = useState(Boolean(product_id));
  const [kaydediliyor, setKaydediliyor]   = useState(false);
  const [hata, setHata]                   = useState<string | null>(null);
  const [isOffline, setIsOffline]         = useState(false);
  const [bekleyenIslem, setBekleyenIslem] = useState(0);

  // ── Ürün arama ──
  const [aramaMetni, setAramaMetni]   = useState('');
  const [aramaYukleniyor, setAramaYukleniyor] = useState(false);
  const [aramaUrunler, setAramaUrunler]       = useState<UrunOzet[]>([]);

  // ── Seçili ürün ──
  const [urun, setUrun] = useState<UrunOzet | null>(null);

  // ── Hareket formu ──
  const [tip, setTip]               = useState<HareketTipi>('adjust');
  const [miktar, setMiktar]         = useState('');
  const [yeniMiktar, setYeniMiktar] = useState('');
  const [fireSebebi, setFireSebebi] = useState('skt_gecmis');
  const [not_, setNot]              = useState('');

  // ============================================================
  // VERİ YÜKLEME
  // ============================================================

  const urunYukle = useCallback(async (id: string) => {
    setYukleniyor(true);
    setHata(null);
    try {
      const yanit = await api.get(`/api/products/${id}`);
      setUrun(yanit.data);
      setYeniMiktar(String(yanit.data.stock_qty));
      setIsOffline(false);
    } catch (err: any) {
      if (!err.response) {
        setIsOffline(true);
        setHata('Sunucuya ulaşılamıyor.');
      } else {
        setHata(err.response?.data?.detail ?? 'Ürün yüklenemedi.');
      }
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => {
    if (product_id) urunYukle(product_id);
    getPendingCount().then(setBekleyenIslem);
  }, [product_id, urunYukle]);

  // ── Ürün arama ──
  const aramaYap = useCallback(async (metin: string) => {
    if (metin.trim().length < 2) {
      setAramaUrunler([]);
      return;
    }
    setAramaYukleniyor(true);
    try {
      const yanit = await api.get(
        `/api/products?branch_id=${branchId}&search=${encodeURIComponent(metin)}&per_page=20`
      );
      setAramaUrunler(yanit.data?.items ?? []);
    } catch {
      setAramaUrunler([]);
    } finally {
      setAramaYukleniyor(false);
    }
  }, [branchId]);

  useEffect(() => {
    const zamanlayici = setTimeout(() => aramaYap(aramaMetni), 300);
    return () => clearTimeout(zamanlayici);
  }, [aramaMetni, aramaYap]);

  // ── Ürün seç ──
  const urunSec = (secilen: UrunOzet) => {
    setUrun(secilen);
    setYeniMiktar(String(secilen.stock_qty));
    setAramaMetni('');
    setAramaUrunler([]);
  };

  // ============================================================
  // KAYDET
  // ============================================================

  const kaydet = async () => {
    if (!urun) {
      Alert.alert('Hata', 'Lütfen bir ürün seçin.');
      return;
    }
    if (isOffline) {
      Alert.alert('Offline', 'Bağlantı olmadan stok hareketi kaydedilemez.');
      return;
    }

    // Değer doğrulama
    if (tip === 'adjust') {
      if (!yeniMiktar.trim() || isNaN(Number(yeniMiktar)) || Number(yeniMiktar) < 0) {
        Alert.alert('Hata', 'Geçerli bir yeni miktar girin.');
        return;
      }
    } else {
      if (!miktar.trim() || isNaN(Number(miktar)) || Number(miktar) <= 0) {
        Alert.alert('Hata', 'Geçerli bir miktar girin (0\'dan büyük).');
        return;
      }
    }

    setKaydediliyor(true);
    setHata(null);

    try {
      if (tip === 'adjust') {
        // Sayım düzeltmesi — yeni_miktar gönderilir
        await api.post(
          `/api/stock/adjust?product_id=${urun.id}&yeni_miktar=${Number(yeniMiktar)}&sebep=${encodeURIComponent(not_ || 'Manuel sayım düzeltmesi')}&branch_id=${branchId}`
        );
      } else if (tip === 'waste') {
        // Fire / zayi — miktar düşer
        await api.post(
          `/api/stock/waste?product_id=${urun.id}&miktar=${Number(miktar)}&sebep=${fireSebebi}&branch_id=${branchId}`
        );
      } else {
        // Manuel stok girişi — miktar artar
        await api.post(
          `/api/stock/receive?product_id=${urun.id}&miktar=${Number(miktar)}&not_=${encodeURIComponent(not_)}&branch_id=${branchId}`
        );
      }
      Alert.alert('Başarılı', 'Stok hareketi kaydedildi.', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      if (!err.response) {
        setIsOffline(true);
        setHata('Sunucuya ulaşılamıyor.');
      } else {
        setHata(err.response?.data?.detail ?? 'Kaydedilemedi. Tekrar deneyin.');
      }
    } finally {
      setKaydediliyor(false);
    }
  };

  // ============================================================
  // RENDER: LOADING
  // ============================================================

  if (yukleniyor) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.blue} />
        <Text style={[styles.yukleniyorMetin, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
          Ürün yükleniyor...
        </Text>
      </View>
    );
  }

  // ============================================================
  // RENDER: ANA EKRAN
  // ============================================================

  const stokDurumRengi = urun
    ? urun.stock_qty <= 0           ? colors.danger
    : urun.stock_qty <= urun.min_stock ? colors.warning
    : colors.success
    : colors.textMuted;

  return (
    <KeyboardAvoidingView
      style    = {{ flex: 1 }}
      behavior = {Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset = {80}
    >
      <View style={[styles.ekran, { backgroundColor: colors.bgPrimary }]}>

        {/* ── Offline Banner ── */}
        {(isOffline || bekleyenIslem > 0) && (
          <View style={[styles.offlineBant, { backgroundColor: colors.danger }]}>
            <Text style={[styles.offlineMetin, { fontFamily: FONT_FAMILY.bodyMedium }]}>
              🔴 Offline · {bekleyenIslem} işlem bekliyor
            </Text>
          </View>
        )}

        <ScrollView
          contentContainerStyle       = {{ padding: SPACING.base, paddingBottom: SPACING.xxl * 2 }}
          keyboardShouldPersistTaps   = "handled"
          showsVerticalScrollIndicator= {false}
        >

          {/* ── HATA MESAJI ── */}
          {hata && (
            <View style={[styles.hataBant, { backgroundColor: colors.danger + '22', borderColor: colors.danger }]}>
              <Text style={[{ color: colors.danger, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm }]}>
                ⚠️ {hata}
              </Text>
            </View>
          )}

          {/* ── ÜRÜN ARAMA (product_id yoksa göster) ── */}
          {!urun && (
            <>
              <Text style={[styles.bolumBasligi, { color: colors.textPrimary, fontFamily: FONT_FAMILY.heading }]}>
                Ürün Seç
              </Text>
              <View style={[styles.aramaKutusu, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
                <Text style={{ color: colors.textHint, fontSize: 16 }}>🔍</Text>
                <TextInput
                  value                = {aramaMetni}
                  onChangeText         = {setAramaMetni}
                  placeholder          = "Ürün adı veya barkod..."
                  placeholderTextColor = {colors.textHint}
                  style={[styles.aramaGiris, { color: colors.textPrimary, fontFamily: FONT_FAMILY.body }]}
                />
                {aramaYukleniyor && <ActivityIndicator size="small" color={colors.blue} />}
              </View>

              {/* Arama sonuçları */}
              {aramaUrunler.length > 0 && (
                <View style={[styles.aramaListesi, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
                  {aramaUrunler.map((u) => (
                    <TouchableOpacity
                      key     = {String(u.id)}
                      onPress = {() => urunSec(u)}
                      style={[styles.aramaItem, { borderBottomColor: colors.border, minHeight: MIN_TOUCH_SIZE }]}
                    >
                      <Text style={[{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.base }]}>
                        {u.name}
                      </Text>
                      <Text style={[{ color: colors.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm }]}>
                        {u.barcode ?? 'Barkod yok'} · Stok: {u.stock_qty} {u.unit}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {aramaMetni.length >= 2 && aramaUrunler.length === 0 && !aramaYukleniyor && (
                <Text style={[styles.bosArama, { color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
                  "{aramaMetni}" ile eşleşen ürün bulunamadı
                </Text>
              )}
            </>
          )}

          {/* ── SEÇİLİ ÜRÜN BİLGİSİ ── */}
          {urun && (
            <View style={[styles.urunKart, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md }]}>
                  {urun.name}
                </Text>
                <Text style={[{ color: colors.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, marginTop: 2 }]}>
                  {urun.barcode ?? 'Barkod yok'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[{ color: stokDurumRengi, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md }]}>
                  {urun.stock_qty} {urun.unit}
                </Text>
                <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs }]}>
                  min: {urun.min_stock}
                </Text>
              </View>
              {!product_id && (
                <TouchableOpacity
                  onPress  = {() => { setUrun(null); setMiktar(''); setYeniMiktar(''); }}
                  hitSlop  = {{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style    = {{ marginLeft: SPACING.sm, minWidth: MIN_TOUCH_SIZE, alignItems: 'center' }}
                >
                  <Text style={{ color: colors.textHint, fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── HAREKET TİPİ ── */}
          {urun && (
            <>
              <Text style={[styles.bolumBasligi, { color: colors.textPrimary, fontFamily: FONT_FAMILY.heading, marginTop: SPACING.xl }]}>
                Hareket Tipi
              </Text>
              <View style={styles.tipSecenekler}>
                {([
                  { key: 'adjust',  label: '📊 Sayım Düzelt', aciklama: 'Yeni stok miktarını gir' },
                  { key: 'receive', label: '📥 Stok Giriş',   aciklama: 'Stoka miktar ekle'       },
                  { key: 'waste',   label: '🗑️ Fire / Zayi',  aciklama: 'Stoktan miktar düş'      },
                ] as { key: HareketTipi; label: string; aciklama: string }[]).map((t) => (
                  <TouchableOpacity
                    key     = {t.key}
                    onPress = {() => setTip(t.key)}
                    style={[
                      styles.tipButon,
                      {
                        backgroundColor: tip === t.key ? colors.blue + '22' : colors.bgSecondary,
                        borderColor    : tip === t.key ? colors.blue         : colors.border,
                        minHeight      : MIN_TOUCH_SIZE,
                      },
                    ]}
                  >
                    <Text style={[{ color: tip === t.key ? colors.blue : colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.base }]}>
                      {t.label}
                    </Text>
                    <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, marginTop: 2 }]}>
                      {t.aciklama}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ── MİKTAR ALANI ── */}
              <Text style={[alanBasligiStil, { color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium, marginTop: SPACING.xl }]}>
                {tip === 'adjust' ? 'Yeni Stok Miktarı *' : 'Miktar *'}
              </Text>
              <TextInput
                value            = {tip === 'adjust' ? yeniMiktar : miktar}
                onChangeText     = {tip === 'adjust' ? setYeniMiktar : setMiktar}
                placeholder      = {tip === 'adjust' ? `Mevcut: ${urun.stock_qty} ${urun.unit}` : '0'}
                placeholderTextColor = {colors.textHint}
                keyboardType     = "decimal-pad"
                style={[
                  styles.giris,
                  { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary, fontFamily: FONT_FAMILY.body },
                ]}
              />

              {/* ── FİRE SEBEBİ (sadece waste tipinde) ── */}
              {tip === 'waste' && (
                <>
                  <Text style={[alanBasligiStil, { color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium, marginTop: SPACING.base }]}>
                    Fire Sebebi *
                  </Text>
                  <View style={styles.satirSecenekler}>
                    {FIRE_SEBEPLERI.map((s) => (
                      <TouchableOpacity
                        key     = {s.key}
                        onPress = {() => setFireSebebi(s.key)}
                        style={[
                          styles.kucukSecenekButon,
                          {
                            backgroundColor: fireSebebi === s.key ? colors.danger + '22' : colors.bgSecondary,
                            borderColor    : fireSebebi === s.key ? colors.danger         : colors.border,
                            minHeight      : MIN_TOUCH_SIZE,
                          },
                        ]}
                      >
                        <Text style={{ color: fireSebebi === s.key ? colors.danger : colors.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm }}>
                          {s.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* ── NOT ── */}
              <Text style={[alanBasligiStil, { color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium, marginTop: SPACING.base }]}>
                Not (opsiyonel)
              </Text>
              <TextInput
                value            = {not_}
                onChangeText     = {setNot}
                placeholder      = "Açıklama veya ek bilgi..."
                placeholderTextColor = {colors.textHint}
                multiline
                numberOfLines    = {3}
                style={[
                  styles.giris,
                  { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary, fontFamily: FONT_FAMILY.body, height: 80, textAlignVertical: 'top' },
                ]}
              />

              {/* ── KAYDET ── */}
              <TouchableOpacity
                onPress   = {kaydet}
                disabled  = {kaydediliyor || isOffline}
                style={[
                  styles.kaydetButon,
                  {
                    backgroundColor: isOffline ? colors.textHint : tip === 'waste' ? colors.danger : colors.blue,
                    minHeight      : MIN_TOUCH_SIZE,
                    marginTop      : SPACING.xl,
                  },
                ]}
              >
                {kaydediliyor ? (
                  <ActivityIndicator color={WHITE} />
                ) : (
                  <Text style={[styles.kaydetButonMetin, { fontFamily: FONT_FAMILY.bodyMedium }]}>
                    {tip === 'adjust'  ? '📊 Düzeltmeyi Kaydet'
                   : tip === 'receive' ? '📥 Stok Girişini Kaydet'
                                       : '🗑️ Fireyi Kaydet'}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ============================================================
// STİLLER
// ============================================================

const alanBasligiStil: any = {
  fontSize    : FONT_SIZE.sm,
  marginBottom: SPACING.xs,
};

const styles = StyleSheet.create({
  ekran: { flex: 1 },
  merkez: {
    flex          : 1,
    alignItems    : 'center',
    justifyContent: 'center',
    gap           : SPACING.base,
  },
  yukleniyorMetin: { fontSize: FONT_SIZE.base, marginTop: SPACING.sm },
  offlineBant: {
    paddingVertical  : SPACING.sm,
    paddingHorizontal: SPACING.base,
    alignItems       : 'center',
  },
  offlineMetin: { color: WHITE, fontSize: FONT_SIZE.sm },
  hataBant: {
    margin      : SPACING.base,
    padding     : SPACING.base,
    borderRadius: RADIUS.card,
    borderWidth : 1,
  },
  bolumBasligi: { fontSize: FONT_SIZE.lg, marginBottom: SPACING.sm },
  aramaKutusu: {
    flexDirection    : 'row',
    alignItems       : 'center',
    paddingHorizontal: SPACING.base,
    borderRadius     : RADIUS.card,
    borderWidth      : 1,
    height           : MIN_TOUCH_SIZE + 4,
    gap              : SPACING.sm,
  },
  aramaGiris: { flex: 1, fontSize: FONT_SIZE.base },
  aramaListesi: {
    borderRadius: RADIUS.card,
    borderWidth : 1,
    marginTop   : SPACING.xs,
    overflow    : 'hidden',
  },
  aramaItem: {
    padding         : SPACING.base,
    borderBottomWidth: 1,
    justifyContent  : 'center',
  },
  bosArama: {
    textAlign: 'center',
    marginTop: SPACING.base,
    fontSize : FONT_SIZE.sm,
  },
  urunKart: {
    flexDirection: 'row',
    alignItems   : 'center',
    padding      : SPACING.base,
    borderRadius : RADIUS.card,
    borderWidth  : 1,
  },
  tipSecenekler: { gap: SPACING.sm },
  tipButon: {
    padding     : SPACING.base,
    borderRadius: RADIUS.card,
    borderWidth : 1,
  },
  giris: {
    borderWidth      : 1,
    borderRadius     : RADIUS.button,
    paddingHorizontal: SPACING.base,
    paddingVertical  : SPACING.md,
    fontSize         : FONT_SIZE.base,
    minHeight        : MIN_TOUCH_SIZE,
  },
  satirSecenekler: {
    flexDirection: 'row',
    flexWrap     : 'wrap',
    gap          : SPACING.sm,
  },
  kucukSecenekButon: {
    paddingHorizontal: SPACING.base,
    paddingVertical  : SPACING.sm,
    borderRadius     : RADIUS.badge,
    borderWidth      : 1,
    alignItems       : 'center',
    justifyContent   : 'center',
  },
  kaydetButon: {
    borderRadius  : RADIUS.button,
    alignItems    : 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
  },
  kaydetButonMetin: { color: WHITE, fontSize: FONT_SIZE.base },
});
