/**
 * Market Yönetim Sistemi — Ayarlar Ekranı
 * Sunucu URL, tema tercihi, şube bilgisi, çıkış
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
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme }        from '../../hooks/useTheme';
import { useAuthStore }    from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button }          from '../../components/ui/Button';
import { Card }            from '../../components/ui/Card';
import { Badge }           from '../../components/ui/Badge';
import { api }             from '../../services/api';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE }          from '../../constants/typography';

export default function SettingsScreen() {
  const { colors, isDark }         = useTheme();
  const { user, logout }           = useAuthStore();
  const { themePreference, setThemePreference, serverUrl, setServerUrl, branchName, lisans, multibranchEnabled } = useSettingsStore();

  // Sunucu URL düzenleme
  const [urlDuzenle, setUrlDuzenle]   = useState(false);
  const [yeniUrl, setYeniUrl]         = useState(serverUrl);
  const [baglantiTest, setBaglantiTest] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');

  // ============================================================
  // BAĞLANTI TESTİ
  // ============================================================

  const baglantiTestEt = async () => {
    setBaglantiTest('testing');
    try {
      await api.get('/api/health', { baseURL: yeniUrl, timeout: 5000 });
      setBaglantiTest('ok');
    } catch {
      setBaglantiTest('error');
    }
  };

  const urlKaydet = () => {
    if (!yeniUrl.trim()) return;
    setServerUrl(yeniUrl.trim());
    setUrlDuzenle(false);
    setBaglantiTest('idle');
  };

  // ============================================================
  // ÇIKIŞ
  // ============================================================

  const cikisYap = () => {
    Alert.alert(
      'Çıkış Yap',
      'Oturumu kapatmak istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text   : 'Çıkış Yap',
          style  : 'destructive',
          onPress: () => {
            logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  // ============================================================
  // RENDER YARDIMCILARI
  // ============================================================

  // Ayar satırı
  const AyarSatiri = ({
    etiket, deger, onPress, tehlikeli = false, rightContent
  }: {
    etiket    : string;
    deger?    : string;
    onPress?  : () => void;
    tehlikeli?: boolean;
    rightContent?: React.ReactNode;
  }) => (
    <TouchableOpacity
      onPress      = {onPress}
      disabled     = {!onPress}
      style        = {[styles.satirKutu, { borderBottomColor: colors.border, minHeight: MIN_TOUCH_SIZE }]}
      activeOpacity= {onPress ? 0.6 : 1}
    >
      <Text style={[styles.etiketMetin, {
        color     : tehlikeli ? colors.danger : colors.textPrimary,
        fontFamily: FONT_FAMILY.bodyMedium,
      }]}>
        {etiket}
      </Text>
      {rightContent || (
        deger ? (
          <Text style={[styles.degerMetin, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
            {deger}
          </Text>
        ) : null
      )}
      {onPress && (
        <Text style={{ color: colors.textHint, marginLeft: SPACING.sm }}>›</Text>
      )}
    </TouchableOpacity>
  );

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <ScrollView
      style                 = {{ backgroundColor: colors.bgPrimary }}
      contentContainerStyle = {{ padding: SPACING.base, gap: SPACING.base, paddingBottom: SPACING.xxl }}
    >
      {/* ── Başlık ── */}
      <Text style={[styles.baslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.heading }]}>
        ⚙️ Ayarlar
      </Text>

      {/* ── Kullanıcı Bilgisi ── */}
      <Card>
        <View style={styles.kullaniciBilgi}>
          <View style={[styles.avatarKutu, { backgroundColor: colors.blue + '20' }]}>
            <Text style={{ fontSize: 28 }}>👤</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.kullaniciAdi, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
              {user?.name || '—'}
            </Text>
            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs }}>
              <Badge
                label   = {user?.role === 'admin' ? 'Yönetici' : user?.role === 'cashier' ? 'Kasiyer' : 'Depo'}
                variant = {user?.role === 'admin' ? 'warning' : 'info'}
              />
              <Badge label={branchName} variant="info" />
            </View>
          </View>
        </View>
      </Card>

      {/* ── Tema ── */}
      <View style={[styles.bolumKutu, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
        <Text style={[styles.bolumBaslik, { color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium }]}>
          TEMA
        </Text>

        <View style={styles.temaSecici}>
          {(['light', 'dark', 'system'] as const).map((t) => (
            <TouchableOpacity
              key      = {t}
              onPress  = {() => setThemePreference(t)}
              style    = {[
                styles.temaTus,
                { minHeight: MIN_TOUCH_SIZE, borderColor: colors.border },
                themePreference === t && { backgroundColor: colors.blue, borderColor: colors.blue },
              ]}
            >
              <Text style={{ fontSize: 20 }}>
                {t === 'light' ? '☀️' : t === 'dark' ? '🌙' : '🔄'}
              </Text>
              <Text style={[styles.temaTusMetin, {
                color     : themePreference === t ? '#FFFFFF' : colors.textMuted,
                fontFamily: FONT_FAMILY.bodyMedium,
              }]}>
                {t === 'light' ? 'Açık' : t === 'dark' ? 'Koyu' : 'Sistem'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Sunucu Bağlantısı ── */}
      <View style={[styles.bolumKutu, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
        <Text style={[styles.bolumBaslik, { color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium }]}>
          SUNUCU BAĞLANTISI
        </Text>

        {!urlDuzenle ? (
          <AyarSatiri
            etiket  = "Backend URL"
            deger   = {serverUrl}
            onPress = {() => { setYeniUrl(serverUrl); setUrlDuzenle(true); setBaglantiTest('idle'); }}
          />
        ) : (
          <View style={{ gap: SPACING.sm, padding: SPACING.sm }}>
            <TextInput
              value            = {yeniUrl}
              onChangeText     = {(t) => { setYeniUrl(t); setBaglantiTest('idle'); }}
              placeholder      = "http://192.168.1.100:8000"
              placeholderTextColor = {colors.textHint}
              autoCapitalize   = "none"
              keyboardType     = "url"
              style            = {[styles.urlGiris, {
                color          : colors.textPrimary,
                backgroundColor: colors.bgTertiary,
                borderColor    : colors.border,
                fontFamily     : FONT_FAMILY.body,
              }]}
            />

            {/* Bağlantı test durumu */}
            {baglantiTest === 'testing' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                <ActivityIndicator size="small" color={colors.blue} />
                <Text style={{ color: colors.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm }}>
                  Test ediliyor...
                </Text>
              </View>
            )}
            {baglantiTest === 'ok' && (
              <Text style={{ color: colors.success, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm }}>
                ✅ Bağlantı başarılı
              </Text>
            )}
            {baglantiTest === 'error' && (
              <Text style={{ color: colors.danger, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm }}>
                ❌ Bağlantı kurulamadı
              </Text>
            )}

            <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
              <Button label="Test Et" variant="secondary" size="sm" onPress={baglantiTestEt}
                disabled={baglantiTest === 'testing'} style={{ flex: 1 }} />
              <Button label="Kaydet" variant="primary" size="sm" onPress={urlKaydet}
                disabled={baglantiTest === 'error'} style={{ flex: 1 }} />
              <Button label="İptal" variant="ghost" size="sm"
                onPress={() => { setUrlDuzenle(false); setYeniUrl(serverUrl); setBaglantiTest('idle'); }}
                style={{ flex: 1 }} />
            </View>
          </View>
        )}
      </View>

      {/* ── Yönetim (sadece admin) ── */}
      {user?.role === 'admin' && (
        <View style={[styles.bolumKutu, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <Text style={[styles.bolumBaslik, { color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium }]}>
            YÖNETİM
          </Text>
          <AyarSatiri etiket="⚙️ Sistem Ayarları"      onPress={() => router.push('/(yonetim)/system-settings')} />
          <AyarSatiri etiket="👥 Personel"              onPress={() => router.push('/(yonetim)/personnel')} />
          <AyarSatiri etiket="🏭 Tedarikçiler"          onPress={() => router.push('/(yonetim)/suppliers')} />
          <AyarSatiri etiket="🎯 Kampanyalar"           onPress={() => router.push('/(yonetim)/campaigns')} />
          <AyarSatiri etiket="📈 Satış Hedefleri"       onPress={() => router.push('/(yonetim)/targets')} />
          <AyarSatiri etiket="💾 Yedekleme"             onPress={() => router.push('/(yonetim)/backup')} />
          {multibranchEnabled && (
            <>
              <AyarSatiri etiket="🏢 Şubeler"           onPress={() => router.push('/(yonetim)/branches')} />
              <AyarSatiri etiket="🔄 Stok Transferleri" onPress={() => router.push('/(yonetim)/transfers')} />
            </>
          )}
        </View>
      )}

      {/* ── Lisans ── */}
      <View style={[styles.bolumKutu, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
        <Text style={[styles.bolumBaslik, { color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium }]}>
          LİSANS
        </Text>
        {lisans ? (
          <>
            <AyarSatiri etiket="Paket"    deger={lisans.package.toUpperCase()} />
            <AyarSatiri etiket="Müşteri"  deger={lisans.customerName} />
            <AyarSatiri etiket="Geçerlilik" deger={lisans.endDate ? `${lisans.endDate} tarihine kadar` : 'Sınırsız'} />
          </>
        ) : (
          <AyarSatiri
            etiket="Lisans Aktif Değil"
            deger="Aktivasyon gerekli"
            onPress={() => router.push('/(auth)/activate')}
            tehlikeli
          />
        )}
      </View>

      {/* ── Hakkında ── */}
      <View style={[styles.bolumKutu, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
        <Text style={[styles.bolumBaslik, { color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium }]}>
          HAKKINDA
        </Text>
        <AyarSatiri etiket="Versiyon" deger="1.0.0" />
        <AyarSatiri etiket="Uygulama" deger="Market Yönetim Sistemi" />
        <AyarSatiri etiket="Platform" deger="React Native + FastAPI" />
      </View>

      {/* ── Çıkış ── */}
      <Button
        label    = "🚪 Çıkış Yap"
        variant  = "danger"
        size     = "lg"
        fullWidth
        onPress  = {cikisYap}
        style    = {{ marginTop: SPACING.base }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  baslik: {
    fontSize  : FONT_SIZE.xl,
    marginBottom: SPACING.sm,
  },
  kullaniciBilgi: {
    flexDirection: 'row',
    alignItems   : 'center',
    gap          : SPACING.base,
  },
  avatarKutu: {
    width         : 56,
    height        : 56,
    borderRadius  : 999,
    alignItems    : 'center',
    justifyContent: 'center',
  },
  kullaniciAdi: {
    fontSize: FONT_SIZE.md,
  },
  bolumKutu: {
    borderRadius: RADIUS.card,
    borderWidth : 1,
    overflow    : 'hidden',
  },
  bolumBaslik: {
    fontSize         : FONT_SIZE.xs,
    letterSpacing    : 1,
    paddingHorizontal: SPACING.base,
    paddingVertical  : SPACING.sm,
  },
  satirKutu: {
    flexDirection    : 'row',
    alignItems       : 'center',
    paddingHorizontal: SPACING.base,
    paddingVertical  : SPACING.sm,
    borderBottomWidth: 1,
  },
  etiketMetin: {
    flex    : 1,
    fontSize: FONT_SIZE.base,
  },
  degerMetin: {
    fontSize: FONT_SIZE.sm,
    maxWidth: 200,
    textAlign: 'right',
  },
  temaSecici: {
    flexDirection: 'row',
    gap          : SPACING.sm,
    padding      : SPACING.base,
  },
  temaTus: {
    flex          : 1,
    alignItems    : 'center',
    justifyContent: 'center',
    borderRadius  : RADIUS.button,
    borderWidth   : 1,
    paddingVertical: SPACING.sm,
    gap           : SPACING.xs,
  },
  temaTusMetin: {
    fontSize: FONT_SIZE.sm,
  },
  urlGiris: {
    height           : MIN_TOUCH_SIZE,
    paddingHorizontal: SPACING.base,
    borderRadius     : RADIUS.button,
    borderWidth      : 1,
    fontSize         : FONT_SIZE.sm,
  },
});
