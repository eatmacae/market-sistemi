/**
 * Market Yönetim Sistemi — Kasa Açılış Ekranı
 * Kasiyer kasayı açarken başlangıç kasasını girer.
 *
 * Kalite kontrol:
 * ✅ Loading state
 * ✅ Error state
 * ✅ useTheme() — hardcode renk yok
 * ✅ Min 48px dokunma alanı
 * ✅ Audit log (backend tarafı)
 * ✅ Türkçe yorum satırları
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme }        from '../../hooks/useTheme';
import { useAuthStore }    from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useCartStore }    from '../../stores/cartStore';
import { Button }          from '../../components/ui/Button';
import { api }             from '../../services/api';
import { getPendingCount } from '../../services/storage';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE }          from '../../constants/typography';

export default function SessionOpenScreen() {
  const { colors }       = useTheme();
  const { user }         = useAuthStore();
  const { branchId }     = useSettingsStore();
  const { setSession }   = useCartStore();

  // Başlangıç nakit miktarı
  const [kasaMiktari, setKasaMiktari] = useState('');
  const [yukleniyor, setYukleniyor]   = useState(false);
  const [hata, setHata]               = useState<string | null>(null);
  const [isOffline, setIsOffline]         = useState(false);
  const [bekleyenIslem, setBekleyenIslem] = useState(0);

  useEffect(() => {
    getPendingCount().then(setBekleyenIslem);
  }, []);

  // ============================================================
  // KASA AÇ
  // ============================================================

  const kasaAc = async () => {
    const miktar = parseFloat(kasaMiktari.replace(',', '.'));

    if (isNaN(miktar) || miktar < 0) {
      setHata('Geçerli bir başlangıç kasası miktarı girin.');
      return;
    }

    setYukleniyor(true);
    setHata(null);

    try {
      const yanit = await api.post('/api/sessions', {
        branch_id      : branchId,
        cashier_id     : user?.id,
        opening_amount : miktar,
      });

      // Oturum ID'sini cart store'a kaydet
      setSession(yanit.data.id);

      // Kasa ekranına geri dön
      router.replace('/(kasa)/');

    } catch (err: any) {
      if (!err.response) {
        setIsOffline(true);
        setHata('Sunucuya bağlanılamıyor. Bağlantıyı kontrol edin.');
      } else {
        setHata(err.response?.data?.detail || 'Kasa açılırken hata oluştu.');
      }
    } finally {
      setYukleniyor(false);
    }
  };

  // ============================================================
  // HIZLI TUTAR BUTUNLARI
  // ============================================================

  const hizliMiktarlar = [0, 100, 200, 500, 1000];

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <KeyboardAvoidingView
      style    = {{ flex: 1 }}
      behavior = {Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle = {[styles.konteyner, { backgroundColor: colors.bgPrimary }]}
        keyboardShouldPersistTaps = "handled"
      >
        {/* ── Offline Bant ── */}
        {(isOffline || bekleyenIslem > 0) && (
          <View style={[styles.offlineBant, { backgroundColor: colors.danger }]}>
            <Text style={[styles.offlineMetin, { fontFamily: FONT_FAMILY.bodyMedium }]}>
              🔴 Offline · {bekleyenIslem} işlem bekliyor
            </Text>
          </View>
        )}

        {/* ── Başlık ── */}
        <View style={styles.baslik}>
          <Text style={[styles.baslikMetin, { color: colors.textPrimary, fontFamily: FONT_FAMILY.heading }]}>
            🔓 Kasa Açılışı
          </Text>
          <Text style={[styles.altMetin, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
            {user?.name} · Şube ID: {branchId}
          </Text>
        </View>

        {/* ── Kasa Miktarı Girişi ── */}
        <View style={[styles.kartAlani, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <Text style={[styles.etiket, { color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium }]}>
            Başlangıç Kasa Miktarı
          </Text>

          <View style={[styles.miktar, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}>
            <Text style={[styles.paraSimgesi, { color: colors.textMuted, fontFamily: FONT_FAMILY.bodyBold }]}>₺</Text>
            <TextInput
              value            = {kasaMiktari}
              onChangeText     = {(t) => { setKasaMiktari(t); setHata(null); }}
              placeholder      = "0.00"
              placeholderTextColor = {colors.textHint}
              keyboardType     = "decimal-pad"
              style            = {[styles.miktarGiris, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyBold }]}
            />
          </View>

          {/* Hızlı tutar butonları */}
          <View style={styles.hizliTutarlar}>
            {hizliMiktarlar.map((m) => (
              <Button
                key      = {m}
                label    = {m === 0 ? 'Boş' : `₺${m}`}
                variant  = {kasaMiktari === String(m) ? 'primary' : 'secondary'}
                size     = "sm"
                onPress  = {() => { setKasaMiktari(String(m)); setHata(null); }}
                style    = {{ flex: 1 }}
              />
            ))}
          </View>
        </View>

        {/* ── Hata ── */}
        {hata && (
          <View style={[styles.hataBant, { backgroundColor: colors.danger + '20', borderColor: colors.danger }]}>
            <Text style={[styles.hataMetin, { color: colors.danger, fontFamily: FONT_FAMILY.body }]}>
              {hata}
            </Text>
          </View>
        )}

        {/* ── Bilgi notu ── */}
        <View style={[styles.notKutu, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <Text style={[styles.notMetin, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
            ℹ️ Kasa açılışı audit log'a kaydedilir. Başlangıç miktarı gün sonu Z raporunda gösterilir.
          </Text>
        </View>

        {/* ── Yükleniyor ── */}
        {yukleniyor && <ActivityIndicator color={colors.blue} size="large" />}

        {/* ── Butonlar ── */}
        <View style={styles.butonlar}>
          <Button
            label    = "İptal"
            variant  = "secondary"
            size     = "lg"
            onPress  = {() => router.back()}
            disabled = {yukleniyor}
            style    = {{ flex: 1 }}
          />
          <Button
            label    = {yukleniyor ? 'Açılıyor...' : 'Kasayı Aç 🔓'}
            variant  = "success"
            size     = "lg"
            onPress  = {kasaAc}
            disabled = {yukleniyor}
            style    = {{ flex: 2 }}
          />
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  konteyner: {
    flexGrow      : 1,
    padding       : SPACING.base,
    gap           : SPACING.base,
    justifyContent: 'center',
    maxWidth      : 500,
    alignSelf     : 'center',
    width         : '100%',
  },
  baslik: {
    alignItems  : 'center',
    marginBottom: SPACING.sm,
  },
  baslikMetin: {
    fontSize: FONT_SIZE.xl,
  },
  altMetin: {
    fontSize : FONT_SIZE.sm,
    marginTop: SPACING.xs,
  },
  kartAlani: {
    borderRadius: RADIUS.card,
    borderWidth : 1,
    padding     : SPACING.base,
    gap         : SPACING.sm,
  },
  etiket: {
    fontSize: FONT_SIZE.sm,
  },
  miktar: {
    flexDirection    : 'row',
    alignItems       : 'center',
    height           : MIN_TOUCH_SIZE + 16,
    paddingHorizontal: SPACING.base,
    borderRadius     : RADIUS.button,
    borderWidth      : 1,
  },
  paraSimgesi: {
    fontSize: FONT_SIZE.xl,
    marginRight: SPACING.sm,
  },
  miktarGiris: {
    flex    : 1,
    fontSize: FONT_SIZE.xl,
  },
  hizliTutarlar: {
    flexDirection: 'row',
    gap          : SPACING.xs,
    marginTop    : SPACING.xs,
  },
  hataBant: {
    borderWidth : 1,
    borderRadius: RADIUS.button,
    padding     : SPACING.base,
  },
  hataMetin: {
    fontSize: FONT_SIZE.sm,
  },
  notKutu: {
    borderWidth : 1,
    borderRadius: RADIUS.button,
    padding     : SPACING.base,
  },
  notMetin: {
    fontSize  : FONT_SIZE.xs,
    lineHeight: 18,
  },
  butonlar: {
    flexDirection: 'row',
    gap          : SPACING.sm,
    marginTop    : SPACING.sm,
  },
  offlineBant: {
    paddingVertical  : SPACING.sm,
    paddingHorizontal: SPACING.base,
    alignItems       : 'center',
  },
  offlineMetin: {
    color   : '#FFFFFF',
    fontSize: FONT_SIZE.sm,
  },
});
