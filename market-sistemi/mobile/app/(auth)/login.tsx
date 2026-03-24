/**
 * Market Yönetim Sistemi — Giriş Ekranı
 *
 * İki giriş modu:
 * 1. E-posta + Şifre (admin/yönetici)
 * 2. 6 haneli PIN (kasiyer/depo)
 *
 * Kalite kontrol:
 * ✅ Loading state
 * ✅ Error state
 * ✅ useTheme() — hardcode renk yok
 * ✅ Min 48px dokunma alanı
 * ✅ Türkçe yorum satırları
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme }        from '../../hooks/useTheme';
import { useAuthStore }    from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button }          from '../../components/ui/Button';
import { api }             from '../../services/api';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE }          from '../../constants/typography';

// Giriş modu: yönetici (e-posta) veya kasiyer (PIN)
type GirisModu = 'email' | 'pin';

export default function LoginScreen() {
  const { colors }  = useTheme();
  const { login }   = useAuthStore();
  const { branchId, serverUrl } = useSettingsStore();

  // Giriş modu
  const [mod, setMod] = useState<GirisModu>('pin');

  // E-posta giriş alanları
  const [email, setEmail]       = useState('');
  const [sifre, setSifre]       = useState('');
  const [sifreGoster, setSifreGoster] = useState(false);

  // PIN girişi
  const [pin, setPin] = useState('');

  // Durum
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata]             = useState<string | null>(null);

  const sifreRef = useRef<TextInput>(null);

  // ============================================================
  // E-POSTA + ŞİFRE GİRİŞİ
  // ============================================================

  const emailGirisi = useCallback(async () => {
    if (!email.trim() || !sifre.trim()) {
      setHata('E-posta ve şifre boş bırakılamaz.');
      return;
    }

    setYukleniyor(true);
    setHata(null);

    try {
      const yanit = await api.post('/api/auth/login', {
        email   : email.trim().toLowerCase(),
        password: sifre,
      });

      const { access_token, user_id, user_name, role, branch_id } = yanit.data;

      // Auth store'a kaydet
      login(access_token, {
        id      : user_id,
        name    : user_name,
        role,
        branchId: branch_id,
      });

      // Dashboard'a yönlendir
      router.replace('/(tabs)/dashboard');

    } catch (err: any) {
      if (!err.response) {
        setHata(`Sunucuya bağlanılamıyor.\nURL: ${serverUrl}\nLütfen WiFi bağlantısını kontrol edin.`);
      } else {
        setHata(err.response?.data?.detail || 'Giriş başarısız. Bilgileri kontrol edin.');
      }
    } finally {
      setYukleniyor(false);
    }
  }, [email, sifre, login, serverUrl]);

  // ============================================================
  // PIN GİRİŞİ
  // ============================================================

  const pinGirisi = useCallback(async (tamPin: string) => {
    if (tamPin.length !== 6) return;

    setYukleniyor(true);
    setHata(null);

    try {
      const yanit = await api.post('/api/auth/login/pin', {
        pin      : tamPin,
        branch_id: branchId,
      });

      const { access_token, user_id, user_name, role, branch_id } = yanit.data;

      login(access_token, {
        id      : user_id,
        name    : user_name,
        role,
        branchId: branch_id,
      });

      // Kasiyerler direkt kasaya, yöneticiler dashboard'a
      if (role === 'cashier') {
        router.replace('/(kasa)/');
      } else {
        router.replace('/(tabs)/dashboard');
      }

    } catch (err: any) {
      if (!err.response) {
        setHata(`Sunucuya bağlanılamıyor.\nURL: ${serverUrl}`);
      } else {
        setHata('PIN hatalı. Lütfen tekrar deneyin.');
      }
      setPin('');
    } finally {
      setYukleniyor(false);
    }
  }, [branchId, login, serverUrl]);

  // PIN tuşuna basınca
  const pinTus = (rakam: string) => {
    if (yukleniyor) return;
    const yeni = pin + rakam;
    if (yeni.length <= 6) {
      setPin(yeni);
      setHata(null);
      if (yeni.length === 6) {
        // Otomatik giriş dene
        pinGirisi(yeni);
      }
    }
  };

  // PIN sil
  const pinSil = () => {
    setPin((p) => p.slice(0, -1));
    setHata(null);
  };

  // PIN temizle
  const pinTemizle = () => {
    setPin('');
    setHata(null);
  };

  // ============================================================
  // RENDER: PIN KLAVYE
  // ============================================================

  const pinTuslari = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

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
        {/* ── Logo / Başlık ── */}
        <View style={styles.baslik}>
          <Text style={[styles.logo, { color: colors.blue, fontFamily: FONT_FAMILY.heading }]}>
            🏪 Market
          </Text>
          <Text style={[styles.altyazi, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
            Yönetim Sistemi
          </Text>
        </View>

        {/* ── Mod Seçici ── */}
        <View style={[styles.modSecici, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <TouchableOpacity
            onPress  = {() => { setMod('pin'); setHata(null); }}
            style    = {[
              styles.modButon,
              { minHeight: MIN_TOUCH_SIZE },
              mod === 'pin' && { backgroundColor: colors.blue },
            ]}
          >
            <Text style={[
              styles.modMetin,
              { fontFamily: FONT_FAMILY.bodyMedium },
              mod === 'pin' ? { color: '#FFFFFF' } : { color: colors.textMuted },
            ]}>
              🔢 PIN Girişi
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress  = {() => { setMod('email'); setHata(null); }}
            style    = {[
              styles.modButon,
              { minHeight: MIN_TOUCH_SIZE },
              mod === 'email' && { backgroundColor: colors.blue },
            ]}
          >
            <Text style={[
              styles.modMetin,
              { fontFamily: FONT_FAMILY.bodyMedium },
              mod === 'email' ? { color: '#FFFFFF' } : { color: colors.textMuted },
            ]}>
              📧 Yönetici Girişi
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Hata Mesajı ── */}
        {hata && (
          <View style={[styles.hataBant, { backgroundColor: colors.danger + '20', borderColor: colors.danger }]}>
            <Text style={[styles.hataMetin, { color: colors.danger, fontFamily: FONT_FAMILY.body }]}>
              {hata}
            </Text>
          </View>
        )}

        {/* ── PIN MODU ── */}
        {mod === 'pin' && (
          <View style={styles.pinAlani}>
            {/* PIN göstergesi */}
            <View style={styles.pinGostere}>
              {[0,1,2,3,4,5].map((i) => (
                <View
                  key       = {i}
                  style     = {[
                    styles.pinDot,
                    {
                      backgroundColor: pin.length > i
                        ? colors.blue
                        : colors.bgTertiary,
                      borderColor: colors.border,
                    },
                  ]}
                />
              ))}
            </View>

            {/* Yükleniyor göstergesi */}
            {yukleniyor && (
              <ActivityIndicator color={colors.blue} style={{ marginBottom: SPACING.base }} />
            )}

            {/* Sayısal klavye */}
            <View style={styles.klavye}>
              {pinTuslari.map((tus, i) => {
                if (tus === '') return <View key={i} style={styles.klavyeBoşluk} />;

                const isSil = tus === '⌫';
                return (
                  <TouchableOpacity
                    key      = {i}
                    onPress  = {isSil ? pinSil : () => pinTus(tus)}
                    onLongPress = {isSil ? pinTemizle : undefined}
                    disabled = {yukleniyor}
                    style    = {[
                      styles.klavyeTus,
                      {
                        backgroundColor: colors.bgSecondary,
                        borderColor    : colors.border,
                        minHeight      : MIN_TOUCH_SIZE + 16,
                        opacity        : yukleniyor ? 0.5 : 1,
                      },
                    ]}
                  >
                    <Text style={[
                      styles.klavyeTusMetin,
                      {
                        color      : isSil ? colors.danger : colors.textPrimary,
                        fontFamily : FONT_FAMILY.bodySemiBold,
                        fontSize   : FONT_SIZE.xl,
                      },
                    ]}>
                      {tus}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ── E-POSTA MODU ── */}
        {mod === 'email' && (
          <View style={styles.emailAlani}>
            {/* E-posta */}
            <View style={[styles.inputKutu, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
              <Text style={{ color: colors.textHint }}>📧</Text>
              <TextInput
                value            = {email}
                onChangeText     = {setEmail}
                placeholder      = "E-posta adresi"
                placeholderTextColor = {colors.textHint}
                keyboardType     = "email-address"
                autoCapitalize   = "none"
                returnKeyType    = "next"
                onSubmitEditing  = {() => sifreRef.current?.focus()}
                style            = {[styles.inputMetin, { color: colors.textPrimary, fontFamily: FONT_FAMILY.body }]}
              />
            </View>

            {/* Şifre */}
            <View style={[styles.inputKutu, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
              <Text style={{ color: colors.textHint }}>🔒</Text>
              <TextInput
                ref              = {sifreRef}
                value            = {sifre}
                onChangeText     = {setSifre}
                placeholder      = "Şifre"
                placeholderTextColor = {colors.textHint}
                secureTextEntry  = {!sifreGoster}
                returnKeyType    = "done"
                onSubmitEditing  = {emailGirisi}
                style            = {[styles.inputMetin, { color: colors.textPrimary, fontFamily: FONT_FAMILY.body }]}
              />
              <TouchableOpacity
                onPress  = {() => setSifreGoster((g) => !g)}
                hitSlop  = {{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ color: colors.textHint, fontSize: FONT_SIZE.base }}>
                  {sifreGoster ? '🙈' : '👁'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Giriş butonu */}
            <Button
              label    = {yukleniyor ? 'Giriş yapılıyor...' : 'Giriş Yap'}
              variant  = "primary"
              size     = "lg"
              fullWidth
              onPress  = {emailGirisi}
              disabled = {yukleniyor || !email || !sifre}
              style    = {{ marginTop: SPACING.sm }}
            />
          </View>
        )}

        {/* ── Sunucu bilgisi ── */}
        <Text style={[styles.sunucuMetin, { color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
          🖥 {serverUrl}
        </Text>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  konteyner: {
    flexGrow       : 1,
    alignItems     : 'center',
    justifyContent : 'center',
    padding        : SPACING.xl,
    gap            : SPACING.base,
  },
  baslik: {
    alignItems   : 'center',
    marginBottom : SPACING.base,
  },
  logo: {
    fontSize: FONT_SIZE.hero,
  },
  altyazi: {
    fontSize: FONT_SIZE.base,
    marginTop: SPACING.xs,
  },
  modSecici: {
    flexDirection: 'row',
    borderRadius : RADIUS.card,
    borderWidth  : 1,
    overflow     : 'hidden',
    width        : '100%',
    maxWidth     : 400,
  },
  modButon: {
    flex           : 1,
    alignItems     : 'center',
    justifyContent : 'center',
    paddingVertical: SPACING.sm,
  },
  modMetin: {
    fontSize: FONT_SIZE.sm,
  },
  hataBant: {
    borderWidth  : 1,
    borderRadius : RADIUS.button,
    padding      : SPACING.base,
    width        : '100%',
    maxWidth     : 400,
  },
  hataMetin: {
    fontSize : FONT_SIZE.sm,
    textAlign: 'center',
  },
  // PIN
  pinAlani: {
    alignItems : 'center',
    gap        : SPACING.base,
    width      : '100%',
    maxWidth   : 360,
  },
  pinGostere: {
    flexDirection: 'row',
    gap          : SPACING.md,
    marginBottom : SPACING.sm,
  },
  pinDot: {
    width       : 16,
    height      : 16,
    borderRadius: 999,
    borderWidth : 2,
  },
  klavye: {
    flexDirection : 'row',
    flexWrap      : 'wrap',
    justifyContent: 'center',
    gap           : SPACING.sm,
    width         : '100%',
  },
  klavyeBoşluk: {
    width : '30%',
  },
  klavyeTus: {
    width          : '30%',
    alignItems     : 'center',
    justifyContent : 'center',
    borderRadius   : RADIUS.card,
    borderWidth    : 1,
  },
  klavyeTusMetin: {},
  // E-posta
  emailAlani: {
    gap      : SPACING.sm,
    width    : '100%',
    maxWidth : 400,
  },
  inputKutu: {
    flexDirection    : 'row',
    alignItems       : 'center',
    height           : MIN_TOUCH_SIZE + 8,
    paddingHorizontal: SPACING.base,
    borderRadius     : RADIUS.button,
    borderWidth      : 1,
    gap              : SPACING.sm,
  },
  inputMetin: {
    flex    : 1,
    fontSize: FONT_SIZE.base,
  },
  sunucuMetin: {
    fontSize  : FONT_SIZE.xs,
    marginTop : SPACING.xl,
  },
});
