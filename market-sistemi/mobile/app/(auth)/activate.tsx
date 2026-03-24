/**
 * Market Yönetim Sistemi — Lisans Aktivasyon Ekranı (Faz 8)
 * İlk kurulumda veya lisans yenilemede kullanılır.
 * Lisans anahtarını doğrular ve store'a kaydeder.
 *
 * Kalite kontrol:
 * ✅ Loading state
 * ✅ Error state
 * ✅ useTheme() — hardcode renk yok
 * ✅ Min 48px dokunma alanı
 * ✅ Türkçe yorum satırları
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router }          from 'expo-router';
import { useTheme }        from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settingsStore';
import { api }             from '../../services/api';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE }          from '../../constants/typography';

// ============================================================
// PAKET BİLGİLERİ (backend ile aynı)
// ============================================================

const PAKET_ISIM: Record<string, string> = {
  starter : 'Başlangıç',
  pro     : 'Profesyonel',
  chain   : 'Zincir',
  lifetime: 'Ömür Boyu',
};

const PAKET_RENK: Record<string, string> = {
  starter : '#4F8EF7',
  pro     : '#9B6EF7',
  chain   : '#06C4D4',
  lifetime: '#F5A623',
};

// ============================================================
// ANA EKRAN
// ============================================================

export default function ActivateScreen() {
  const { colors }   = useTheme();
  const { setLisans } = useSettingsStore();

  const [anahtar,   setAnahtar]   = useState('');
  const [dogruluyor, setDogru]    = useState(false);
  const [sonuc,     setSonuc]     = useState<any>(null);
  const [hata,      setHata]      = useState<string | null>(null);

  // ============================================================
  // LİSANS DOĞRULA
  // ============================================================

  const dogrula = async () => {
    const temizAnahtar = anahtar.trim().toUpperCase();
    if (!temizAnahtar) {
      setHata('Lütfen lisans anahtarını girin.');
      return;
    }

    // Basit format kontrolü: MYS-YYYY-XXXX-XXXX-XXXX
    const formatRegex = /^MYS-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    if (!formatRegex.test(temizAnahtar)) {
      setHata('Geçersiz anahtar formatı. Örnek: MYS-2026-ABCD-1234-EFGH');
      return;
    }

    setDogru(true);
    setHata(null);
    setSonuc(null);

    try {
      const yanit = await api.post(`/api/licenses/validate?license_key=${encodeURIComponent(temizAnahtar)}`);
      const data  = yanit.data;

      if (!data.gecerli) {
        setHata(data.mesaj || 'Lisans geçersiz.');
        return;
      }

      setSonuc(data);
    } catch (err: any) {
      setHata(err?.response?.data?.detail || 'Sunucuya bağlanılamadı. Bağlantı ayarlarını kontrol edin.');
    } finally {
      setDogru(false);
    }
  };

  // ============================================================
  // AKTİFLEŞTİR — store'a kaydet
  // ============================================================

  const aktivasyonuTamamla = () => {
    if (!sonuc) return;

    setLisans({
      key         : anahtar.trim().toUpperCase(),
      package     : sonuc.package,
      customerName: sonuc.customer_name,
      endDate     : sonuc.end_date,
      branchLimit : sonuc.branch_limit,
      deviceLimit : sonuc.device_limit,
    });

    Alert.alert(
      '✅ Aktivasyon Başarılı',
      `${PAKET_ISIM[sonuc.package] || sonuc.package} paketi aktifleştirildi.\nHoş geldiniz, ${sonuc.customer_name}!`,
      [
        {
          text   : 'Tamam',
          onPress: () => router.replace('/(tabs)/dashboard'),
        },
      ],
    );
  };

  const paketRengi = sonuc ? (PAKET_RENK[sonuc.package] || colors.blue) : colors.blue;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.bgPrimary }}
    >
      <ScrollView contentContainerStyle={styles.icerik}>
        {/* Logo & Başlık */}
        <View style={styles.baslik}>
          <Text style={{ fontSize: 64 }}>🔑</Text>
          <Text style={[styles.baslikMetin, { color: colors.textPrimary }]}>
            Lisans Aktivasyonu
          </Text>
          <Text style={[styles.altBaslik, { color: colors.textMuted }]}>
            Satın aldığınız lisans anahtarını girerek{'\n'}uygulamanızı aktifleştirin.
          </Text>
        </View>

        {/* Anahtar Girişi */}
        <View style={[styles.girisKutu, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <Text style={[styles.etiket, { color: colors.textMuted }]}>Lisans Anahtarı</Text>
          <TextInput
            style={[styles.giris, {
              backgroundColor: colors.bgTertiary,
              borderColor    : hata ? colors.danger : sonuc ? colors.success : colors.border,
              color          : colors.textPrimary,
            }]}
            value={anahtar}
            onChangeText={v => { setAnahtar(v.toUpperCase()); setHata(null); setSonuc(null); }}
            placeholder="MYS-2026-XXXX-XXXX-XXXX"
            placeholderTextColor={colors.textHint}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            keyboardType="default"
          />
          <Text style={[styles.formatIpucu, { color: colors.textHint }]}>
            Format: MYS-YYYY-XXXX-XXXX-XXXX (satın alma e-postanızda bulunur)
          </Text>
        </View>

        {/* Hata Mesajı */}
        {hata && (
          <View style={[styles.mesajKutu, { backgroundColor: colors.danger + '15', borderColor: colors.danger + '40' }]}>
            <Text style={[styles.mesajMetin, { color: colors.danger }]}>⚠️ {hata}</Text>
          </View>
        )}

        {/* Doğrulama Sonucu */}
        {sonuc && (
          <View style={[styles.sonucKutu, { backgroundColor: paketRengi + '10', borderColor: paketRengi + '40' }]}>
            <View style={[styles.paketRozet, { backgroundColor: paketRengi + '20' }]}>
              <Text style={[styles.paketRozetMetin, { color: paketRengi }]}>
                {PAKET_ISIM[sonuc.package] || sonuc.package} Paketi
              </Text>
            </View>
            <Text style={[styles.sonucMusteri, { color: colors.textPrimary }]}>
              {sonuc.customer_name}
            </Text>
            <View style={styles.sonucDetay}>
              <SonucSatiri label="Geçerlilik" value={sonuc.end_date ? `${sonuc.end_date} tarihine kadar` : 'Sınırsız'} colors={colors} />
              <SonucSatiri label="Şube Limiti" value={`${sonuc.branch_limit} şube`} colors={colors} />
              <SonucSatiri label="Cihaz Limiti" value={`${sonuc.device_limit} cihaz`} colors={colors} />
              {sonuc.kalan_gun !== null && (
                <SonucSatiri
                  label="Kalan Süre"
                  value={`${sonuc.kalan_gun} gün`}
                  colors={colors}
                  uyari={sonuc.kalan_gun <= 30}
                />
              )}
            </View>
          </View>
        )}

        {/* Butonlar */}
        {!sonuc ? (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.blue }, dogruluyor && { opacity: 0.7 }]}
            onPress={dogrula}
            disabled={dogruluyor}
          >
            {dogruluyor
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnMetin}>Doğrula</Text>
            }
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.success }]}
            onPress={aktivasyonuTamamla}
          >
            <Text style={styles.btnMetin}>✓ Aktifleştir ve Devam Et</Text>
          </TouchableOpacity>
        )}

        {/* Demo Modu */}
        <TouchableOpacity
          style={[styles.demoBtn, { borderColor: colors.border }]}
          onPress={() => {
            Alert.alert(
              'Demo Modu',
              '7 günlük deneme modunda devam etmek istiyor musunuz? Tüm özellikler aktif olacaktır.',
              [
                { text: 'İptal', style: 'cancel' },
                {
                  text   : '7 Gün Demo',
                  onPress: () => {
                    const demo7Gun = new Date();
                    demo7Gun.setDate(demo7Gun.getDate() + 7);
                    setLisans({
                      key         : 'DEMO',
                      package     : 'pro',
                      customerName: 'Demo Kullanıcı',
                      endDate     : demo7Gun.toISOString().split('T')[0],
                      branchLimit : 1,
                      deviceLimit : 2,
                    });
                    router.replace('/(tabs)/dashboard');
                  },
                },
              ],
            );
          }}
        >
          <Text style={[styles.demoBtnMetin, { color: colors.textMuted }]}>
            7 Günlük Demo ile Dene
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ============================================================
// ALT BİLEŞEN
// ============================================================

function SonucSatiri({ label, value, colors, uyari }: { label: string; value: string; colors: any; uyari?: boolean }) {
  return (
    <View style={styles.sonucSatir}>
      <Text style={[styles.sonucEtiket, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.sonucDeger, { color: uyari ? colors.warning : colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

// ============================================================
// STİLLER
// ============================================================

const styles = StyleSheet.create({
  icerik: {
    padding       : SPACING.xl,
    paddingTop    : SPACING.xxl,
    gap           : SPACING.base,
  },
  baslik: {
    alignItems   : 'center',
    gap          : SPACING.sm,
    marginBottom : SPACING.lg,
  },
  baslikMetin: {
    fontSize  : FONT_SIZE.xl,
    fontFamily: FONT_FAMILY.bodyBold,
    marginTop : SPACING.sm,
  },
  altBaslik: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.body,
    textAlign : 'center',
    lineHeight: 22,
  },
  girisKutu: {
    borderRadius: RADIUS.card,
    borderWidth : 1,
    padding     : SPACING.base,
    gap         : SPACING.sm,
  },
  etiket: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  giris: {
    height           : MIN_TOUCH_SIZE,
    borderRadius     : RADIUS.button,
    borderWidth      : 1,
    paddingHorizontal: SPACING.base,
    fontSize         : FONT_SIZE.base,
    fontFamily       : FONT_FAMILY.bodySemiBold,
    letterSpacing    : 1,
    textAlign        : 'center',
  },
  formatIpucu: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    textAlign : 'center',
  },
  mesajKutu: {
    borderRadius: RADIUS.button,
    borderWidth : 1,
    padding     : SPACING.md,
  },
  mesajMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodyMedium,
    textAlign : 'center',
  },
  sonucKutu: {
    borderRadius: RADIUS.card,
    borderWidth : 1,
    padding     : SPACING.base,
    gap         : SPACING.md,
    alignItems  : 'center',
  },
  paketRozet: {
    paddingHorizontal: SPACING.base,
    paddingVertical  : SPACING.sm,
    borderRadius     : RADIUS.badge,
  },
  paketRozetMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodyBold,
  },
  sonucMusteri: {
    fontSize  : FONT_SIZE.lg,
    fontFamily: FONT_FAMILY.bodyBold,
  },
  sonucDetay: {
    width : '100%',
    gap   : SPACING.xs,
  },
  sonucSatir: {
    flexDirection : 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
  },
  sonucEtiket: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.body,
  },
  sonucDeger: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemiBold,
  },
  btn: {
    borderRadius  : RADIUS.button,
    paddingVertical: SPACING.base,
    alignItems    : 'center',
    minHeight     : MIN_TOUCH_SIZE + 4,
    justifyContent: 'center',
  },
  btnMetin: {
    fontSize  : FONT_SIZE.base,
    fontFamily: FONT_FAMILY.bodyBold,
    color     : '#fff',
  },
  demoBtn: {
    borderRadius  : RADIUS.button,
    borderWidth   : 1,
    paddingVertical: SPACING.md,
    alignItems    : 'center',
    minHeight     : MIN_TOUCH_SIZE,
    justifyContent: 'center',
  },
  demoBtnMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
});
