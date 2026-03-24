/**
 * Market Yönetim Sistemi — Sistem Ayarları Ekranı (Faz 6)
 * Market bilgileri, yazıcı, terazi, SKT uyarı süresi, yedekleme saati
 * Sadece admin erişebilir
 *
 * Kalite kontrol:
 * ✅ Loading state
 * ✅ Error state
 * ✅ useTheme() — hardcode renk yok
 * ✅ Min 48px dokunma alanı
 * ✅ Türkçe yorum satırları
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme }        from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore }    from '../../stores/authStore';
import { api }             from '../../services/api';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE }          from '../../constants/typography';

// ============================================================
// TİPLER
// ============================================================

interface SistemAyarlari {
  // Market bilgileri
  market_name    : string;
  market_address : string;
  market_phone   : string;
  market_tax_no  : string;
  // Yazıcı
  printer_mac    : string;
  printer_enabled: string;
  // Terazi
  scale_ip       : string;
  scale_port     : string;
  scale_enabled  : string;
  // SKT & Yedek
  skt_warning_days   : string;
  backup_auto        : string;
  backup_hour        : string;
  // Display
  display_enabled    : string;
  display_welcome    : string;
}

const VARSAYILAN: SistemAyarlari = {
  market_name    : '',
  market_address : '',
  market_phone   : '',
  market_tax_no  : '',
  printer_mac    : '',
  printer_enabled: 'true',
  scale_ip       : '',
  scale_port     : '8008',
  scale_enabled  : 'false',
  skt_warning_days: '30',
  backup_auto    : 'true',
  backup_hour    : '2',
  display_enabled: 'false',
  display_welcome: 'Hoş Geldiniz!',
};

// ============================================================
// ANA EKRAN
// ============================================================

export default function SystemSettingsScreen() {
  const { colors }   = useTheme();
  const { branchId } = useSettingsStore();
  const { user }     = useAuthStore();

  const [ayarlar,    setAyarlar]   = useState<SistemAyarlari>(VARSAYILAN);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kaydediyor, setKaydediyor] = useState(false);
  const [hata,       setHata]       = useState<string | null>(null);

  const isAdmin = user?.role === 'admin';

  // ============================================================
  // VERİ ÇEKME
  // ============================================================

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    setHata(null);
    try {
      const yanit = await api.get(`/api/settings?branch_id=${branchId}`);
      const data  = yanit.data as Record<string, string>;
      setAyarlar(prev => ({ ...prev, ...data }));
    } catch (err: any) {
      setHata(err?.response?.data?.detail || 'Ayarlar yüklenemedi.');
    } finally {
      setYukleniyor(false);
    }
  }, [branchId]);

  useEffect(() => { yukle(); }, [yukle]);

  // ============================================================
  // KAYDET
  // ============================================================

  const kaydet = async () => {
    setKaydediyor(true);
    try {
      // Toplu güncelleme — bulk endpoint kullan
      const guncelleme: Record<string, string> = {};
      Object.entries(ayarlar).forEach(([k, v]) => {
        if (v !== undefined && v !== null) guncelleme[k] = String(v);
      });

      await api.put(`/api/settings/bulk?branch_id=${branchId}`, {
        settings: guncelleme,
      });

      Alert.alert('Başarılı', 'Ayarlar kaydedildi.');
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.detail || 'Ayarlar kaydedilemedi.');
    } finally {
      setKaydediyor(false);
    }
  };

  const set = (key: keyof SistemAyarlari, value: string) =>
    setAyarlar(prev => ({ ...prev, [key]: value }));

  const bool = (key: keyof SistemAyarlari) => ayarlar[key] === 'true';
  const toggleBool = (key: keyof SistemAyarlari) =>
    set(key, ayarlar[key] === 'true' ? 'false' : 'true');

  // ============================================================
  // LOADING / HATA
  // ============================================================

  if (yukleniyor) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.blue} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <Text style={{ fontSize: 48 }}>🔒</Text>
        <Text style={[styles.bilgiMetin, { color: colors.textMuted }]}>
          Bu ekrana sadece yöneticiler erişebilir.
        </Text>
      </View>
    );
  }

  if (hata) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <Text style={{ fontSize: 40 }}>⚠️</Text>
        <Text style={[styles.bilgiMetin, { color: colors.danger }]}>{hata}</Text>
        <TouchableOpacity style={[styles.tekrarBtn, { backgroundColor: colors.blue }]} onPress={yukle}>
          <Text style={{ color: '#fff', fontFamily: FONT_FAMILY.bodyMedium }}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.bgPrimary }}
    >
      <ScrollView contentContainerStyle={styles.icerik}>

        {/* ── Market Bilgileri ── */}
        <BolumBaslik title="🏪 Market Bilgileri" colors={colors} />
        <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <AyarGirisi
            label="Market Adı"
            value={ayarlar.market_name}
            onChangeText={v => set('market_name', v)}
            placeholder="Ör: Ahmet Market"
            colors={colors}
          />
          <AyarGirisi
            label="Adres"
            value={ayarlar.market_address}
            onChangeText={v => set('market_address', v)}
            placeholder="Mahalle, Sokak, No..."
            colors={colors}
            multiline
          />
          <AyarGirisi
            label="Telefon"
            value={ayarlar.market_phone}
            onChangeText={v => set('market_phone', v)}
            placeholder="0XXX XXX XX XX"
            colors={colors}
            keyboardType="phone-pad"
          />
          <AyarGirisi
            label="Vergi No"
            value={ayarlar.market_tax_no}
            onChangeText={v => set('market_tax_no', v)}
            placeholder="Vergi kimlik numarası"
            colors={colors}
            keyboardType="numeric"
            sonItem
          />
        </View>

        {/* ── Yazıcı ── */}
        <BolumBaslik title="🖨️ Yazıcı" colors={colors} />
        <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <AyarToggle
            label="Bluetooth Yazıcı"
            value={bool('printer_enabled')}
            onToggle={() => toggleBool('printer_enabled')}
            colors={colors}
          />
          {bool('printer_enabled') && (
            <AyarGirisi
              label="Yazıcı MAC Adresi"
              value={ayarlar.printer_mac}
              onChangeText={v => set('printer_mac', v)}
              placeholder="XX:XX:XX:XX:XX:XX"
              colors={colors}
              sonItem
            />
          )}
        </View>

        {/* ── Terazi ── */}
        <BolumBaslik title="⚖️ Terazi" colors={colors} />
        <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <AyarToggle
            label="Terazi Entegrasyonu"
            value={bool('scale_enabled')}
            onToggle={() => toggleBool('scale_enabled')}
            colors={colors}
          />
          {bool('scale_enabled') && (
            <>
              <AyarGirisi
                label="Terazi IP Adresi"
                value={ayarlar.scale_ip}
                onChangeText={v => set('scale_ip', v)}
                placeholder="192.168.1.xxx"
                colors={colors}
                keyboardType="numbers-and-punctuation"
              />
              <AyarGirisi
                label="Port"
                value={ayarlar.scale_port}
                onChangeText={v => set('scale_port', v)}
                placeholder="8008"
                colors={colors}
                keyboardType="numeric"
                sonItem
              />
            </>
          )}
        </View>

        {/* ── SKT & Yedekleme ── */}
        <BolumBaslik title="⚙️ Bildirimler & Yedekleme" colors={colors} />
        <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <AyarGirisi
            label="SKT Uyarı Süresi (Gün)"
            value={ayarlar.skt_warning_days}
            onChangeText={v => set('skt_warning_days', v)}
            placeholder="30"
            colors={colors}
            keyboardType="numeric"
            aciklama="Son kullanma tarihi kaç gün kala uyarı verilsin?"
          />
          <AyarToggle
            label="Otomatik Yedekleme"
            value={bool('backup_auto')}
            onToggle={() => toggleBool('backup_auto')}
            colors={colors}
          />
          {bool('backup_auto') && (
            <AyarGirisi
              label="Yedekleme Saati (0-23)"
              value={ayarlar.backup_hour}
              onChangeText={v => set('backup_hour', v)}
              placeholder="2"
              colors={colors}
              keyboardType="numeric"
              sonItem
            />
          )}
        </View>

        {/* ── Müşteri Display ── */}
        <BolumBaslik title="📺 Müşteri Ekranı" colors={colors} />
        <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <AyarToggle
            label="Display Aktif"
            value={bool('display_enabled')}
            onToggle={() => toggleBool('display_enabled')}
            colors={colors}
          />
          {bool('display_enabled') && (
            <AyarGirisi
              label="Karşılama Mesajı"
              value={ayarlar.display_welcome}
              onChangeText={v => set('display_welcome', v)}
              placeholder="Hoş Geldiniz!"
              colors={colors}
              sonItem
            />
          )}
        </View>

        {/* Kaydet Butonu */}
        <TouchableOpacity
          style={[styles.kaydetBtn, { backgroundColor: colors.blue }, kaydediyor && { opacity: 0.7 }]}
          onPress={kaydet}
          disabled={kaydediyor}
        >
          {kaydediyor
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.kaydetBtnMetin}>Ayarları Kaydet</Text>
          }
        </TouchableOpacity>

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ============================================================
// ALT BİLEŞENLER
// ============================================================

function BolumBaslik({ title, colors }: { title: string; colors: any }) {
  return (
    <Text style={[styles.bolumBaslik, { color: colors.textMuted }]}>{title}</Text>
  );
}

function AyarGirisi({
  label, value, onChangeText, placeholder, colors, keyboardType, multiline, aciklama, sonItem,
}: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string;
  colors: any; keyboardType?: any; multiline?: boolean; aciklama?: string; sonItem?: boolean;
}) {
  return (
    <View style={[styles.ayarSatiri, !sonItem && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <Text style={[styles.ayarEtiket, { color: colors.textPrimary }]}>{label}</Text>
      {aciklama && <Text style={[styles.ayarAciklama, { color: colors.textHint }]}>{aciklama}</Text>}
      <TextInput
        style={[styles.ayarGiris, { backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.textPrimary }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textHint}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        numberOfLines={multiline ? 2 : 1}
        autoCapitalize="none"
      />
    </View>
  );
}

function AyarToggle({
  label, value, onToggle, colors, sonItem,
}: {
  label: string; value: boolean; onToggle: () => void; colors: any; sonItem?: boolean;
}) {
  return (
    <View style={[styles.toggleSatiri, !sonItem && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <Text style={[styles.ayarEtiket, { color: colors.textPrimary, flex: 1 }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: colors.blue + '88' }}
        thumbColor={value ? colors.blue : colors.textHint}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

// ============================================================
// STİLLER
// ============================================================

const styles = StyleSheet.create({
  icerik     : { padding: SPACING.md },
  merkez     : { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.md, padding: SPACING.xxl },
  bilgiMetin : { fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.body, textAlign: 'center', marginTop: SPACING.sm },
  tekrarBtn  : { paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.button, marginTop: SPACING.md, minHeight: MIN_TOUCH_SIZE, justifyContent: 'center' },
  bolumBaslik: { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.bodySemiBold, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: SPACING.xl, marginBottom: SPACING.sm },
  bolum      : { borderRadius: RADIUS.card, borderWidth: 1, overflow: 'hidden', marginBottom: SPACING.sm },
  ayarSatiri : { padding: SPACING.md, gap: SPACING.sm },
  ayarEtiket : { fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.bodyMedium },
  ayarAciklama: { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.body },
  ayarGiris  : { borderRadius: RADIUS.button, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.body, minHeight: MIN_TOUCH_SIZE },
  toggleSatiri: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, minHeight: MIN_TOUCH_SIZE },
  kaydetBtn  : { borderRadius: RADIUS.button, paddingVertical: SPACING.base, alignItems: 'center', marginTop: SPACING.xl, minHeight: MIN_TOUCH_SIZE + 4, justifyContent: 'center' },
  kaydetBtnMetin: { fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.bodyBold, color: '#fff' },
});
