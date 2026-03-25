/**
 * Market Yönetim Sistemi — Akıllı Stok Listesi Ekranı
 *
 * Kalite kontrol:
 * ✅ Loading state
 * ✅ Empty state
 * ✅ Error state
 * ✅ Offline state
 * ✅ useTheme() — hardcode renk yok
 * ✅ Min 48px dokunma alanı (StockItem)
 * ✅ Audit log (stok işlemleri routes/stock.py'de)
 * ✅ Türkçe yorum satırları
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';
import { StockItem } from '../../components/features/StockItem';
import { Button } from '../../components/ui/Button';
import { api } from '../../services/api';
import { getPendingCount } from '../../services/storage';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE } from '../../constants/typography';
import { WHITE } from '../../constants/colors';

// Filtre seçenekleri
type Filtre = 'hepsi' | 'critical' | 'threshold' | 'adequate';

// Stok özet tipi
interface StokOzet {
  id            : number;
  name          : string;
  barcode       : string | null;
  unit          : string;
  stock_qty     : number;
  min_stock     : number;
  price         : number;
  cost          : number | null;
  shelf_location: string | null;
  durum         : 'critical' | 'threshold' | 'adequate' | 'dormant';
  aciliyet_puani: number;
  gunluk_satis  : number;
  skt_uyarisi   : 'critical' | 'warning' | null;
  expiry_date   : string | null;
}

export default function StockScreen() {
  const { colors }         = useTheme();
  const { branchId }       = useSettingsStore();
  const { token }          = useAuthStore();
  const router             = useRouter();

  // Durum
  const [stoklar, setStoklar]         = useState<StokOzet[]>([]);
  const [filtreli, setFiltreli]       = useState<StokOzet[]>([]);
  const [aktifFiltre, setAktifFiltre] = useState<Filtre>('hepsi');
  const [arama, setArama]             = useState('');
  const [yukleniyor, setYukleniyor]   = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [hata, setHata]               = useState<string | null>(null);
  const [bekleyenIslem, setBekleyenIslem] = useState(0);
  const [isOffline, setIsOffline]     = useState(false);

  // ============================================================
  // VERİ YÜKLEME
  // ============================================================

  const yukle = useCallback(async (yenileme = false) => {
    if (yenileme) {
      setYenileniyor(true);
    } else {
      setYukleniyor(true);
    }
    setHata(null);

    try {
      const yanit = await api.get(`/api/stock/smart-list?branch_id=${branchId}&limit=200`);
      setStoklar(yanit.data);
      setIsOffline(false);
    } catch (err: any) {
      // Ağ hatası — offline moda geç
      if (!err.response) {
        setIsOffline(true);
        // SQLite cache'den yükle
        const { getCachedProducts } = await import('../../services/storage');
        const cacheUrunler = await getCachedProducts();
        if (cacheUrunler.length > 0) {
          // Cache'i akıllı stok formatına dönüştür
          const donusturulen = cacheUrunler.map((p: any) => ({
            id            : p.id,
            name          : p.name,
            barcode       : p.barcode,
            unit          : p.unit,
            stock_qty     : p.stock_qty,
            min_stock     : p.min_stock,
            price         : p.price,
            cost          : p.cost,
            shelf_location: p.shelf_location,
            durum         : p.stock_qty <= 0 ? 'critical'
                          : p.stock_qty <= p.min_stock ? 'threshold'
                          : p.stock_qty <= p.min_stock * 1.5 ? 'adequate'
                          : 'dormant',
            aciliyet_puani: 0,
            gunluk_satis  : 0,
            skt_uyarisi   : null,
            expiry_date   : null,
          }));
          setStoklar(donusturulen as StokOzet[]);
        }
      } else {
        setHata(
          err.response?.data?.detail ||
          'Stok listesi yüklenemedi. Lütfen tekrar deneyin.'
        );
      }
    } finally {
      setYukleniyor(false);
      setYenileniyor(false);
    }
  }, [branchId]);

  // Bekleyen işlem sayısını güncelle
  const bekleyenSayiGuncelle = useCallback(async () => {
    const sayi = await getPendingCount();
    setBekleyenIslem(sayi);
  }, []);

  useEffect(() => {
    yukle();
    bekleyenSayiGuncelle();
  }, [yukle, bekleyenSayiGuncelle]);

  // ============================================================
  // FİLTRELEME
  // ============================================================

  useEffect(() => {
    let liste = stoklar;

    // Durum filtresi
    if (aktifFiltre !== 'hepsi') {
      liste = liste.filter((s) => s.durum === aktifFiltre);
    }

    // Metin araması
    if (arama.trim()) {
      const aranan = arama.trim().toLowerCase();
      liste = liste.filter(
        (s) =>
          s.name.toLowerCase().includes(aranan) ||
          (s.barcode && s.barcode.toLowerCase().includes(aranan)) ||
          (s.shelf_location && s.shelf_location.toLowerCase().includes(aranan))
      );
    }

    setFiltreli(liste);
  }, [stoklar, aktifFiltre, arama]);

  // ============================================================
  // RENDER: LOADING
  // ============================================================

  if (yukleniyor) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.blue} />
        <Text style={[styles.yukleniyorMetin, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
          Stok listesi yükleniyor...
        </Text>
      </View>
    );
  }

  // ============================================================
  // RENDER: HATA
  // ============================================================

  if (hata && !isOffline) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <Text style={[styles.hataBas, { color: colors.danger, fontFamily: FONT_FAMILY.bodyMedium }]}>
          ⚠️ Hata
        </Text>
        <Text style={[styles.hataAciklama, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
          {hata}
        </Text>
        <Button
          label    = "Tekrar Dene"
          variant  = "primary"
          onPress  = {() => yukle()}
          style    = {{ marginTop: SPACING.lg }}
        />
      </View>
    );
  }

  // ============================================================
  // RENDER: EMPTY STATE
  // ============================================================

  const EmptyState = () => (
    <View style={[styles.merkez, { paddingTop: SPACING.xxl * 2 }]}>
      <Text style={{ fontSize: 48 }}>📦</Text>
      <Text style={[styles.bosBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium }]}>
        {arama ? 'Arama sonucu bulunamadı' : 'Stok listesi boş'}
      </Text>
      <Text style={[styles.bosAciklama, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
        {arama
          ? `"${arama}" ile eşleşen ürün yok`
          : aktifFiltre !== 'hepsi'
          ? 'Bu filtrede ürün yok'
          : 'Henüz ürün eklenmemiş'}
      </Text>
    </View>
  );

  // ============================================================
  // RENDER: ANA EKRAN
  // ============================================================

  const kritikSayi    = stoklar.filter((s) => s.durum === 'critical').length;
  const esikSayi      = stoklar.filter((s) => s.durum === 'threshold').length;
  const sktUyariSayi  = stoklar.filter((s) => s.skt_uyarisi).length;

  return (
    <View style={[styles.ekran, { backgroundColor: colors.bgPrimary }]}>

      {/* ── Offline Göstergesi ── */}
      {(isOffline || bekleyenIslem > 0) && (
        <View style={[styles.offlineBant, { backgroundColor: colors.danger }]}>
          <Text style={[styles.offlineMetin, { fontFamily: FONT_FAMILY.bodyMedium }]}>
            🔴 Offline · {bekleyenIslem} işlem bekliyor
          </Text>
        </View>
      )}

      {/* ── Başlık + Özet + Aksiyon Butonları ── */}
      <View style={[styles.baslik, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.baslikMetin, { color: colors.textPrimary, fontFamily: FONT_FAMILY.heading }]}>
            Stok Yönetimi
          </Text>
          <Text style={[styles.ozet, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
            {stoklar.length} ürün
            {kritikSayi > 0 && ` · 🔴 ${kritikSayi} kritik`}
            {sktUyariSayi > 0 && ` · ⚠️ ${sktUyariSayi} SKT`}
          </Text>
        </View>
        {/* Ürün ekle butonu */}
        <TouchableOpacity
          onPress = {() => router.push('/(yonetim)/urun-form')}
          style={[styles.ekleButon, { backgroundColor: colors.blue, minHeight: MIN_TOUCH_SIZE }]}
        >
          <Text style={[{ color: WHITE, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm }]}>
            + Ürün Ekle
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Arama ── */}
      <View style={[styles.aramaKutusu, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
        <Text style={{ color: colors.textHint, fontSize: 16 }}>🔍</Text>
        <TextInput
          value            = {arama}
          onChangeText     = {setArama}
          placeholder      = "Ürün adı veya barkod ara..."
          placeholderTextColor = {colors.textHint}
          style={[
            styles.aramaGiris,
            { color: colors.textPrimary, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.base },
          ]}
          returnKeyType    = "search"
          clearButtonMode  = "while-editing"
        />
        {arama.length > 0 && (
          <TouchableOpacity
            onPress  = {() => setArama('')}
            hitSlop  = {{ top: 12, bottom: 12, left: 12, right: 12 }}
            style    = {{ minWidth: MIN_TOUCH_SIZE, alignItems: 'center' }}
          >
            <Text style={{ color: colors.textHint, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Filtre Butonları ── */}
      <View style={styles.filtreler}>
        {([
          { key: 'hepsi',     label: `Tümü (${stoklar.length})` },
          { key: 'critical',  label: `🔴 Kritik (${kritikSayi})` },
          { key: 'threshold', label: `🟡 Eşik (${esikSayi})` },
        ] as { key: Filtre; label: string }[]).map(({ key, label }) => (
          <TouchableOpacity
            key     = {key}
            onPress = {() => setAktifFiltre(key)}
            style={[
              styles.filtreButon,
              {
                backgroundColor: aktifFiltre === key ? colors.blue : colors.bgSecondary,
                borderColor    : aktifFiltre === key ? colors.blue : colors.border,
              },
              { minHeight: MIN_TOUCH_SIZE },
            ]}
          >
            <Text style={[
              styles.filtreMetin,
              {
                color     : aktifFiltre === key ? WHITE : colors.textMuted,
                fontFamily: FONT_FAMILY.bodyMedium,
                fontSize  : FONT_SIZE.sm,
              },
            ]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Stok Listesi ── */}
      <FlatList
        data              = {filtreli}
        keyExtractor      = {(item) => String(item.id)}
        renderItem        = {({ item }) => (
          <StockItem
            {...item}
            onPress = {(id) => router.push(`/(yonetim)/urun-form?id=${id}`)}
          />
        )}
        ListEmptyComponent = {<EmptyState />}
        refreshControl = {
          <RefreshControl
            refreshing    = {yenileniyor}
            onRefresh     = {() => yukle(true)}
            tintColor     = {colors.blue}
            colors        = {[colors.blue]}
          />
        }
        contentContainerStyle = {{ paddingBottom: SPACING.xxl }}
        showsVerticalScrollIndicator = {false}
        // Performans optimizasyonu — büyük listeler için
        removeClippedSubviews = {true}
        initialNumToRender    = {15}
        maxToRenderPerBatch   = {10}
        windowSize            = {5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ekran: {
    flex: 1,
  },
  merkez: {
    flex          : 1,
    alignItems    : 'center',
    justifyContent: 'center',
    gap           : SPACING.base,
    padding       : SPACING.xl,
  },
  yukleniyorMetin: {
    fontSize: FONT_SIZE.base,
    marginTop: SPACING.sm,
  },
  hataBas: {
    fontSize: FONT_SIZE.lg,
  },
  hataAciklama: {
    fontSize  : FONT_SIZE.base,
    textAlign : 'center',
  },
  bosBaslik: {
    fontSize  : FONT_SIZE.lg,
    marginTop : SPACING.base,
    textAlign : 'center',
  },
  bosAciklama: {
    fontSize : FONT_SIZE.base,
    textAlign: 'center',
  },
  offlineBant: {
    paddingVertical  : SPACING.sm,
    paddingHorizontal: SPACING.base,
    alignItems       : 'center',
  },
  offlineMetin: {
    color   : WHITE,
    fontSize: FONT_SIZE.sm,
  },
  baslik: {
    flexDirection: 'row',
    alignItems   : 'center',
    padding      : SPACING.base,
    borderBottomWidth: 1,
    gap          : SPACING.sm,
  },
  ekleButon: {
    paddingHorizontal: SPACING.base,
    paddingVertical  : SPACING.sm,
    borderRadius     : RADIUS.button,
    alignItems       : 'center',
    justifyContent   : 'center',
  },
  baslikMetin: {
    fontSize: FONT_SIZE.xl,
  },
  ozet: {
    fontSize : FONT_SIZE.sm,
    marginTop: 2,
  },
  aramaKutusu: {
    flexDirection    : 'row',
    alignItems       : 'center',
    margin           : SPACING.base,
    paddingHorizontal: SPACING.base,
    borderRadius     : 12,
    borderWidth      : 1,
    height           : MIN_TOUCH_SIZE + 4,
    gap              : SPACING.sm,
  },
  aramaGiris: {
    flex: 1,
  },
  filtreler: {
    flexDirection    : 'row',
    paddingHorizontal: SPACING.base,
    gap              : SPACING.sm,
    marginBottom     : SPACING.sm,
  },
  filtreButon: {
    paddingHorizontal: SPACING.base,
    borderRadius     : 20,
    borderWidth      : 1,
    alignItems       : 'center',
    justifyContent   : 'center',
  },
  filtreMetin: {
    paddingVertical: SPACING.sm,
  },
});
