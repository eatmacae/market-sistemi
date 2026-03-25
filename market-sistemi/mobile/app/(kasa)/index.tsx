/**
 * Market Yönetim Sistemi — Kasa Ana Ekranı
 *
 * Kalite kontrol:
 * ✅ Loading state
 * ✅ Empty state (boş sepet)
 * ✅ Error state
 * ✅ Offline state + bekleyen işlem göstergesi
 * ✅ useTheme() — hardcode renk yok
 * ✅ Min 48px dokunma alanı
 * ✅ Türkçe yorum satırları
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import { useCartStore } from '../../stores/cartStore';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { CartItem } from '../../components/features/CartItem';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { api } from '../../services/api';
import { getPendingCount, getCachedProductByBarcode } from '../../services/storage';
import { SPACING, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE } from '../../constants/typography';
import { WHITE } from '../../constants/colors';

export default function KasaScreen() {
  const { colors }    = useTheme();
  const cart          = useCartStore();
  const { user }      = useAuthStore();
  const { branchId }  = useSettingsStore();

  // Durum
  const [barkodGiris, setBarkodGiris]   = useState('');
  const [yukleniyor, setYukleniyor]     = useState(false);
  const [hata, setHata]                 = useState<string | null>(null);
  const [isOffline, setIsOffline]       = useState(false);
  const [bekleyen, setBekleyen]         = useState(0);
  const [aktifOturum, setAktifOturum]   = useState<any>(null);
  const [oturumYukleniyor, setOturumYukleniyor] = useState(true);

  const barkodInputRef = useRef<TextInput>(null);

  // ============================================================
  // OTURUM KONTROLÜ
  // ============================================================

  const oturumKontrol = useCallback(async () => {
    setOturumYukleniyor(true);
    try {
      const yanit = await api.get(`/api/sessions/active?branch_id=${branchId}`);
      setAktifOturum(yanit.data.active ? yanit.data.session : null);
      cart.setSession(yanit.data.session?.id || 0);
    } catch {
      setIsOffline(true);
    } finally {
      setOturumYukleniyor(false);
    }
  }, [branchId]);

  useEffect(() => {
    oturumKontrol();
    getPendingCount().then(setBekleyen);
  }, [oturumKontrol]);

  // Barkod alanına odaklan
  useEffect(() => {
    const timer = setTimeout(() => barkodInputRef.current?.focus(), 500);
    return () => clearTimeout(timer);
  }, []);

  // ============================================================
  // BARKOD İŞLEME
  // ============================================================

  const barkodIsle = useCallback(async (barkod: string) => {
    const temiz = barkod.trim();
    if (!temiz) return;

    setYukleniyor(true);
    setHata(null);
    setBarkodGiris('');

    try {
      let urun: any = null;

      if (isOffline) {
        // Offline: SQLite cache'den ara
        urun = await getCachedProductByBarcode(temiz);
        if (!urun) {
          setHata(`Barkod bulunamadı: ${temiz}`);
          return;
        }
        urun = { ...urun, price: urun.price };
      } else {
        const yanit = await api.get(`/api/products/barcode/${temiz}?branch_id=${branchId}`);
        urun = yanit.data;
      }

      // Sepete ekle
      cart.addItem({
        productId : urun.id,
        name      : urun.name,
        barcode   : urun.barcode,
        unit      : urun.unit,
        unitPrice : urun.price,
        qty       : 1,
        discount  : 0,
      });

    } catch (err: any) {
      if (!err.response) {
        setIsOffline(true);
        setHata('Sunucuya bağlanılamıyor. Offline modda çalışılıyor.');
      } else if (err.response.status === 404) {
        setHata(`Ürün bulunamadı: ${temiz}`);
      } else {
        setHata(err.response?.data?.detail || 'Ürün eklenirken hata oluştu.');
      }
    } finally {
      setYukleniyor(false);
      // Barkod alanına geri odaklan
      setTimeout(() => barkodInputRef.current?.focus(), 100);
    }
  }, [isOffline, branchId, cart]);

  // ============================================================
  // ÖDEME SAYFASINA GİT
  // ============================================================

  const odemeEkraninaGit = () => {
    if (cart.items.length === 0) {
      Alert.alert('Boş Sepet', 'Ödeme almak için sepete ürün ekleyin.');
      return;
    }
    if (!aktifOturum && !isOffline) {
      Alert.alert(
        'Kasa Açık Değil',
        'Satış yapabilmek için kasa açılışı yapın.',
        [
          { text: 'İptal', style: 'cancel' },
          { text: 'Kasa Aç', onPress: () => router.push('/(kasa)/session-open') },
        ]
      );
      return;
    }
    router.push('/(kasa)/payment');
  };

  // ============================================================
  // RENDER: OTURUM YÜKLENIYOR
  // ============================================================

  if (oturumYukleniyor) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.blue} />
        <Text style={[styles.bilgiMetin, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
          Kasa hazırlanıyor...
        </Text>
      </View>
    );
  }

  // ============================================================
  // RENDER: ANA KASA EKRANI
  // ============================================================

  return (
    <KeyboardAvoidingView
      style     = {{ flex: 1 }}
      behavior  = {Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.ekran, { backgroundColor: colors.bgPrimary }]}>

        {/* ── Offline / Oturum Uyarısı ── */}
        {(isOffline || bekleyen > 0) && (
          <View style={[styles.uyariBant, { backgroundColor: colors.danger }]}>
            <Text style={[styles.uyariMetin, { fontFamily: FONT_FAMILY.bodyMedium, color: WHITE }]}>
              🔴 Offline · {bekleyen} işlem bekliyor
            </Text>
          </View>
        )}

        {!aktifOturum && !isOffline && (
          <TouchableOpacity
            onPress = {() => router.push('/(kasa)/session-open')}
            style   = {[styles.oturumUyari, { backgroundColor: colors.warning }]}
          >
            <Text style={[styles.uyariMetin, { fontFamily: FONT_FAMILY.bodyMedium, color: WHITE }]}>
              ⚠️ Kasa açık değil — Açmak için dokun
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.icerik}>
          {/* ── SOL: Barkod + Sepet ── */}
          <View style={styles.sol}>

            {/* Barkod Giriş Alanı */}
            <View style={[styles.barkodKutu, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
              <Text style={{ color: colors.textHint, fontSize: 18 }}>🔍</Text>
              <TextInput
                ref              = {barkodInputRef}
                value            = {barkodGiris}
                onChangeText     = {setBarkodGiris}
                onSubmitEditing  = {(e) => barkodIsle(e.nativeEvent.text)}
                placeholder      = "Barkod tara veya yaz..."
                placeholderTextColor = {colors.textHint}
                returnKeyType    = "search"
                keyboardType     = "default"
                autoFocus        = {false}
                style={[
                  styles.barkodGiris,
                  { color: colors.textPrimary, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md },
                ]}
              />
              {yukleniyor && <ActivityIndicator color={colors.blue} size="small" />}
            </View>

            {/* Hata Mesajı */}
            {hata && (
              <View style={[styles.hataBant, { backgroundColor: colors.danger + '20', borderColor: colors.danger }]}>
                <Text style={[styles.hataMetin, { color: colors.danger, fontFamily: FONT_FAMILY.body }]}>
                  {hata}
                </Text>
                <TouchableOpacity
                  onPress = {() => setHata(null)}
                  hitSlop = {{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style   = {{ minWidth: MIN_TOUCH_SIZE, alignItems: 'center' }}
                >
                  <Text style={{ color: colors.danger }}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Sepet Listesi */}
            {cart.items.length === 0 ? (
              // Empty state
              <View style={[styles.bosSepet, { borderColor: colors.border }]}>
                <Text style={{ fontSize: 48 }}>🛒</Text>
                <Text style={[styles.bosSepetMetin, { color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium }]}>
                  Sepet boş
                </Text>
                <Text style={[styles.bosSepetAlt, { color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
                  Ürün eklemek için barkod tarayın
                </Text>
              </View>
            ) : (
              <FlatList
                data              = {cart.items}
                keyExtractor      = {(item) => String(item.productId)}
                renderItem        = {({ item }) => (
                  <CartItem
                    {...item}
                    onArtir = {(id) => cart.updateQty(id, item.qty + 1)}
                    onAzalt = {(id) => cart.updateQty(id, item.qty - 1)}
                    onSil   = {(id) => cart.removeItem(id)}
                  />
                )}
                style              = {{ flex: 1 }}
                contentContainerStyle = {{ paddingVertical: SPACING.sm }}
                showsVerticalScrollIndicator = {false}
                removeClippedSubviews = {true}
                initialNumToRender    = {10}
              />
            )}
          </View>

          {/* ── SAĞ: Toplam + Ödeme ── */}
          <View style={[styles.sag, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>

            {/* Kasa özeti + Kapat butonu */}
            {aktifOturum && (
              <View style={[styles.oturumBilgi, { borderBottomColor: colors.border }]}>
                <Text style={[styles.oturumMetin, { color: colors.textMuted, fontFamily: FONT_FAMILY.body, flex: 1 }]}>
                  👤 {aktifOturum.cashier_name}
                </Text>
                <TouchableOpacity
                  onPress  = {() => router.push('/(kasa)/session-close')}
                  hitSlop  = {{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style    = {{ minWidth: MIN_TOUCH_SIZE, alignItems: 'flex-end' }}
                >
                  <Text style={[{ color: colors.danger, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs }]}>
                    🔒 Kapat
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Tutar özeti */}
            <View style={styles.tutarOzet}>
              <View style={styles.tutarSatir}>
                <Text style={[styles.tutarEtiket, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
                  Ara Toplam
                </Text>
                <Text style={[styles.tutarDeger, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium }]}>
                  ₺{cart.subtotal.toFixed(2)}
                </Text>
              </View>

              {cart.discount > 0 && (
                <View style={styles.tutarSatir}>
                  <Text style={[styles.tutarEtiket, { color: colors.danger, fontFamily: FONT_FAMILY.body }]}>
                    İndirim
                  </Text>
                  <Text style={[styles.tutarDeger, { color: colors.danger, fontFamily: FONT_FAMILY.bodyMedium }]}>
                    −₺{cart.discount.toFixed(2)}
                  </Text>
                </View>
              )}

              <View style={styles.tutarSatir}>
                <Text style={[styles.tutarEtiket, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
                  KDV
                </Text>
                <Text style={[styles.tutarDeger, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
                  ₺{cart.vatAmount.toFixed(2)}
                </Text>
              </View>

              {/* Genel Toplam */}
              <View style={[styles.genelToplam, { borderTopColor: colors.border }]}>
                <Text style={[styles.genelTutarEtiket, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
                  TOPLAM
                </Text>
                <Text style={[styles.genelTutarDeger, { color: colors.success, fontFamily: FONT_FAMILY.bodyBold }]}>
                  ₺{cart.grandTotal.toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Ürün sayısı */}
            <Text style={[styles.urunSayisi, { color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
              {cart.items.reduce((acc, i) => acc + i.qty, 0)} ürün · {cart.items.length} kalem
            </Text>

            {/* Sepeti Temizle */}
            {cart.items.length > 0 && (
              <TouchableOpacity
                onPress  = {() => Alert.alert(
                  'Sepeti Temizle',
                  'Tüm ürünler sepetten çıkarılacak. Emin misiniz?',
                  [
                    { text: 'İptal', style: 'cancel' },
                    { text: 'Temizle', style: 'destructive', onPress: cart.clearCart },
                  ]
                )}
                style    = {[styles.temizleButon, { borderColor: colors.border, minHeight: MIN_TOUCH_SIZE }]}
              >
                <Text style={[{ color: colors.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm }]}>
                  🗑 Sepeti Temizle
                </Text>
              </TouchableOpacity>
            )}

            {/* Ödeme Butonu */}
            <Button
              label    = {cart.items.length === 0 ? 'Sepet Boş' : `Ödeme Al · ₺${cart.grandTotal.toFixed(2)}`}
              variant  = {cart.items.length === 0 ? 'secondary' : 'success'}
              size     = "lg"
              fullWidth
              onPress  = {odemeEkraninaGit}
              disabled = {cart.items.length === 0}
              style    = {{ marginTop: SPACING.sm }}
            />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
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
  },
  bilgiMetin: {
    fontSize: FONT_SIZE.base,
  },
  uyariBant: {
    paddingVertical  : SPACING.sm,
    paddingHorizontal: SPACING.base,
    alignItems       : 'center',
  },
  oturumUyari: {
    paddingVertical  : SPACING.sm,
    paddingHorizontal: SPACING.base,
    alignItems       : 'center',
  },
  uyariMetin: {
    // renk inline uygulanır — colored banner üzerinde sabit beyaz
    fontSize: FONT_SIZE.sm,
  },
  icerik: {
    flex         : 1,
    flexDirection: 'row',
    gap          : 0,
  },
  sol: {
    flex   : 1,
    padding: SPACING.sm,
    gap    : SPACING.sm,
  },
  barkodKutu: {
    flexDirection    : 'row',
    alignItems       : 'center',
    height           : MIN_TOUCH_SIZE + 8,
    paddingHorizontal: SPACING.base,
    borderRadius     : 12,
    borderWidth      : 1,
    gap              : SPACING.sm,
  },
  barkodGiris: {
    flex: 1,
  },
  hataBant: {
    flexDirection    : 'row',
    alignItems       : 'center',
    justifyContent   : 'space-between',
    padding          : SPACING.sm,
    borderRadius     : 8,
    borderWidth      : 1,
  },
  hataMetin: {
    flex    : 1,
    fontSize: FONT_SIZE.sm,
  },
  bosSepet: {
    flex          : 1,
    alignItems    : 'center',
    justifyContent: 'center',
    borderWidth   : 1,
    borderStyle   : 'dashed',
    borderRadius  : 12,
    gap           : SPACING.sm,
    margin        : SPACING.sm,
  },
  bosSepetMetin: {
    fontSize: FONT_SIZE.md,
  },
  bosSepetAlt: {
    fontSize : FONT_SIZE.sm,
    textAlign: 'center',
  },
  sag: {
    width       : 280,
    borderLeftWidth: 1,
    padding     : SPACING.base,
    gap         : SPACING.sm,
    justifyContent: 'flex-end',
  },
  oturumBilgi: {
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
  },
  oturumMetin: {
    fontSize: FONT_SIZE.sm,
  },
  tutarOzet: {
    gap: SPACING.sm,
  },
  tutarSatir: {
    flexDirection : 'row',
    justifyContent: 'space-between',
    alignItems    : 'center',
  },
  tutarEtiket: {
    fontSize: FONT_SIZE.base,
  },
  tutarDeger: {
    fontSize: FONT_SIZE.base,
  },
  genelToplam: {
    flexDirection : 'row',
    justifyContent: 'space-between',
    alignItems    : 'center',
    paddingTop    : SPACING.sm,
    marginTop     : SPACING.xs,
    borderTopWidth: 1,
  },
  genelTutarEtiket: {
    fontSize: FONT_SIZE.md,
  },
  genelTutarDeger: {
    fontSize: FONT_SIZE.xl,
  },
  urunSayisi: {
    textAlign: 'center',
    fontSize : FONT_SIZE.xs,
  },
  temizleButon: {
    alignItems    : 'center',
    justifyContent: 'center',
    borderWidth   : 1,
    borderRadius  : 8,
    paddingVertical: SPACING.sm,
  },
});
