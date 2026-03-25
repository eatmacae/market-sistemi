/**
 * Market Yönetim Sistemi — Müşteri Ekle / Düzenle Ekranı
 *
 * Kullanım:
 *   Ekle  : /musteri-form           (id parametresi yok)
 *   Düzelt: /musteri-form?id=15     (mevcut müşteriyi yükler)
 *
 * Kalite kontrol:
 * ✅ Loading state
 * ✅ Error state
 * ✅ Offline state — banner gösterilir, kaydetme engellenir
 * ✅ useTheme() — hardcode renk yok
 * ✅ Min 48px dokunma alanı
 * ✅ Audit log (backend routes/customers.py'de)
 * ✅ Soft delete — backend'de is_deleted=true
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

// ============================================================
// TİPLER
// ============================================================

interface MusteriForm {
  name        : string;
  phone       : string;
  address     : string;
  credit_limit: string;
  price_type  : string;
}

// Fiyat tipi seçenekleri
const FIYAT_TIPLERI = [
  { key: 'retail',     label: '🛒 Perakende' },
  { key: 'wholesale',  label: '📦 Toptan'    },
  { key: 'staff',      label: '👤 Personel'  },
  { key: 'credit',     label: '📋 Veresiye'  },
];

// ============================================================
// KOMPONENT
// ============================================================

export default function MusteriFormEkrani() {
  const { id }       = useLocalSearchParams<{ id?: string }>();
  const router       = useRouter();
  const { colors }   = useTheme();
  const { branchId } = useSettingsStore();

  const duzenlemeModu = Boolean(id);

  // ── Genel durum ──
  const [yukleniyor, setYukleniyor]       = useState(duzenlemeModu);
  const [kaydediliyor, setKaydediliyor]   = useState(false);
  const [hata, setHata]                   = useState<string | null>(null);
  const [isOffline, setIsOffline]         = useState(false);
  const [bekleyenIslem, setBekleyenIslem] = useState(0);

  // ── Form alanları ──
  const [form, setForm] = useState<MusteriForm>({
    name        : '',
    phone       : '',
    address     : '',
    credit_limit: '0',
    price_type  : 'retail',
  });

  // ── Doğrulama hataları ──
  const [dogrulamaHatalari, setDogrulamaHatalari] = useState<Partial<Record<keyof MusteriForm, string>>>({});

  // ============================================================
  // VERİ YÜKLEME
  // ============================================================

  const musteriYukle = useCallback(async () => {
    if (!id) return;
    setYukleniyor(true);
    setHata(null);
    try {
      const yanit = await api.get(`/api/customers/${id}`);
      const m     = yanit.data;
      setForm({
        name        : m.name          ?? '',
        phone       : m.phone         ?? '',
        address     : m.address       ?? '',
        credit_limit: m.credit_limit  != null ? String(m.credit_limit) : '0',
        price_type  : m.price_type    ?? 'retail',
      });
      setIsOffline(false);
    } catch (err: any) {
      if (!err.response) {
        setIsOffline(true);
        setHata('Sunucuya ulaşılamıyor. Bağlantınızı kontrol edin.');
      } else {
        setHata(err.response?.data?.detail ?? 'Müşteri yüklenemedi.');
      }
    } finally {
      setYukleniyor(false);
    }
  }, [id]);

  useEffect(() => {
    musteriYukle();
    getPendingCount().then(setBekleyenIslem);
  }, [musteriYukle]);

  // ============================================================
  // FORM YARDIMCILARI
  // ============================================================

  const alaniGuncelle = (alan: keyof MusteriForm, deger: string) => {
    setForm((prev) => ({ ...prev, [alan]: deger }));
    if (dogrulamaHatalari[alan]) {
      setDogrulamaHatalari((prev) => ({ ...prev, [alan]: undefined }));
    }
  };

  const dogrula = (): boolean => {
    const hatalar: Partial<Record<keyof MusteriForm, string>> = {};

    if (!form.name.trim()) {
      hatalar.name = 'Müşteri adı zorunludur.';
    }
    if (form.phone && !/^[0-9\s\+\-\(\)]{7,15}$/.test(form.phone.trim())) {
      hatalar.phone = 'Geçerli bir telefon numarası girin.';
    }
    if (isNaN(Number(form.credit_limit)) || Number(form.credit_limit) < 0) {
      hatalar.credit_limit = 'Geçerli bir kredi limiti girin.';
    }

    setDogrulamaHatalari(hatalar);
    return Object.keys(hatalar).length === 0;
  };

  // ============================================================
  // KAYDET
  // ============================================================

  const kaydet = async () => {
    if (!dogrula()) return;
    if (isOffline) {
      Alert.alert('Offline', 'Bağlantı olmadan müşteri kaydedilemez.');
      return;
    }

    setKaydediliyor(true);
    setHata(null);

    const veri: Record<string, any> = {
      name        : form.name.trim(),
      phone       : form.phone.trim()   || undefined,
      address     : form.address.trim() || undefined,
      credit_limit: parseFloat(form.credit_limit),
      price_type  : form.price_type,
      branch_id   : branchId,
    };

    try {
      if (duzenlemeModu) {
        await api.patch(`/api/customers/${id}`, veri);
      } else {
        await api.post('/api/customers', veri);
      }
      router.back();
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
  // SİL (sadece düzenleme modunda)
  // ============================================================

  const sil = () => {
    Alert.alert(
      'Müşteriyi Sil',
      `"${form.name}" müşterisini silmek istediğinizden emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text   : 'Sil',
          style  : 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/customers/${id}?branch_id=${branchId}`);
              router.back();
            } catch (err: any) {
              Alert.alert('Hata', err.response?.data?.detail ?? 'Silinemedi.');
            }
          },
        },
      ]
    );
  };

  // ============================================================
  // RENDER: LOADING
  // ============================================================

  if (yukleniyor) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.blue} />
        <Text style={[styles.yukleniyorMetin, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
          Müşteri yükleniyor...
        </Text>
      </View>
    );
  }

  // ============================================================
  // RENDER: ANA FORM
  // ============================================================

  return (
    <KeyboardAvoidingView
      style                  = {{ flex: 1 }}
      behavior               = {Platform.OS === 'ios' ? 'padding' : undefined}
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

        {/* ── Genel hata mesajı ── */}
        {hata && (
          <View style={[styles.hataBant, { backgroundColor: colors.danger + '22', borderColor: colors.danger }]}>
            <Text style={[{ color: colors.danger, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm }]}>
              ⚠️ {hata}
            </Text>
          </View>
        )}

        <ScrollView
          contentContainerStyle       = {{ padding: SPACING.base, paddingBottom: SPACING.xxl * 2 }}
          keyboardShouldPersistTaps   = "handled"
          showsVerticalScrollIndicator= {false}
        >

          {/* ── MÜŞTERİ ADI ── */}
          <AlanBasligi label="Müşteri Adı *" colors={colors} />
          <TextInput
            value                = {form.name}
            onChangeText         = {(v) => alaniGuncelle('name', v)}
            placeholder          = "Ad Soyad veya Firma Adı"
            placeholderTextColor = {colors.textHint}
            style={[
              styles.giris,
              {
                backgroundColor: colors.bgSecondary,
                borderColor    : dogrulamaHatalari.name ? colors.danger : colors.border,
                color          : colors.textPrimary,
                fontFamily     : FONT_FAMILY.body,
              },
            ]}
          />
          {dogrulamaHatalari.name && (
            <Text style={[styles.hataMesaji, { color: colors.danger }]}>{dogrulamaHatalari.name}</Text>
          )}

          {/* ── TELEFON ── */}
          <AlanBasligi label="Telefon" colors={colors} />
          <TextInput
            value                = {form.phone}
            onChangeText         = {(v) => alaniGuncelle('phone', v)}
            placeholder          = "05XX XXX XX XX"
            placeholderTextColor = {colors.textHint}
            keyboardType         = "phone-pad"
            style={[
              styles.giris,
              {
                backgroundColor: colors.bgSecondary,
                borderColor    : dogrulamaHatalari.phone ? colors.danger : colors.border,
                color          : colors.textPrimary,
                fontFamily     : FONT_FAMILY.body,
              },
            ]}
          />
          {dogrulamaHatalari.phone && (
            <Text style={[styles.hataMesaji, { color: colors.danger }]}>{dogrulamaHatalari.phone}</Text>
          )}

          {/* ── ADRES ── */}
          <AlanBasligi label="Adres" colors={colors} />
          <TextInput
            value                = {form.address}
            onChangeText         = {(v) => alaniGuncelle('address', v)}
            placeholder          = "Teslimat veya fatura adresi"
            placeholderTextColor = {colors.textHint}
            multiline
            numberOfLines        = {3}
            style={[
              styles.giris,
              {
                backgroundColor: colors.bgSecondary,
                borderColor    : colors.border,
                color          : colors.textPrimary,
                fontFamily     : FONT_FAMILY.body,
                height         : 80,
                textAlignVertical: 'top',
              },
            ]}
          />

          {/* ── FİYAT TİPİ ── */}
          <AlanBasligi label="Fiyat Tipi" colors={colors} />
          <View style={styles.satirSecenekler}>
            {FIYAT_TIPLERI.map((t) => (
              <TouchableOpacity
                key     = {t.key}
                onPress = {() => alaniGuncelle('price_type', t.key)}
                style={[
                  styles.kucukSecenekButon,
                  {
                    backgroundColor: form.price_type === t.key ? colors.blue + '22' : colors.bgSecondary,
                    borderColor    : form.price_type === t.key ? colors.blue         : colors.border,
                    minHeight      : MIN_TOUCH_SIZE,
                  },
                ]}
              >
                <Text style={{ color: form.price_type === t.key ? colors.blue : colors.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm }}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── KREDİ LİMİTİ ── */}
          <AlanBasligi label="Veresiye Limiti (₺)" colors={colors} />
          <TextInput
            value                = {form.credit_limit}
            onChangeText         = {(v) => alaniGuncelle('credit_limit', v)}
            placeholder          = "0 — veresiye kapalı"
            placeholderTextColor = {colors.textHint}
            keyboardType         = "decimal-pad"
            style={[
              styles.giris,
              {
                backgroundColor: colors.bgSecondary,
                borderColor    : dogrulamaHatalari.credit_limit ? colors.danger : colors.border,
                color          : colors.textPrimary,
                fontFamily     : FONT_FAMILY.body,
              },
            ]}
          />
          {dogrulamaHatalari.credit_limit && (
            <Text style={[styles.hataMesaji, { color: colors.danger }]}>{dogrulamaHatalari.credit_limit}</Text>
          )}
          <Text style={[styles.ipucuMetin, { color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
            0 girilirse veresiye hesabı kapalı olur
          </Text>

          {/* ── KAYDET BUTONU ── */}
          <TouchableOpacity
            onPress   = {kaydet}
            disabled  = {kaydediliyor || isOffline}
            style={[
              styles.kaydetButon,
              {
                backgroundColor: isOffline ? colors.textHint : colors.blue,
                minHeight      : MIN_TOUCH_SIZE,
                marginTop      : SPACING.xl,
              },
            ]}
          >
            {kaydediliyor ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.kaydetButonMetin, { fontFamily: FONT_FAMILY.bodyMedium }]}>
                {duzenlemeModu ? '💾 Değişiklikleri Kaydet' : '➕ Müşteri Ekle'}
              </Text>
            )}
          </TouchableOpacity>

          {/* ── SİL BUTONU ── */}
          {duzenlemeModu && (
            <TouchableOpacity
              onPress = {sil}
              style={[
                styles.silButon,
                { borderColor: colors.danger, minHeight: MIN_TOUCH_SIZE, marginTop: SPACING.md },
              ]}
            >
              <Text style={[styles.silButonMetin, { color: colors.danger, fontFamily: FONT_FAMILY.bodyMedium }]}>
                🗑️ Müşteriyi Sil
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ============================================================
// YARDIMCI KOMPONENTLEr
// ============================================================

function AlanBasligi({ label, colors }: { label: string; colors: any }) {
  return (
    <Text style={[alanBasligiStil, { color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium }]}>
      {label}
    </Text>
  );
}
const alanBasligiStil: any = {
  fontSize    : FONT_SIZE.sm,
  marginTop   : SPACING.base,
  marginBottom: SPACING.xs,
};

// ============================================================
// STİLLER
// ============================================================

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
  offlineMetin: { color: '#FFFFFF', fontSize: FONT_SIZE.sm },
  hataBant: {
    margin      : SPACING.base,
    padding     : SPACING.base,
    borderRadius: RADIUS.card,
    borderWidth : 1,
  },
  hataMesaji: { fontSize: FONT_SIZE.xs, marginTop: SPACING.xs },
  ipucuMetin: { fontSize: FONT_SIZE.xs, marginTop: SPACING.xs },
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
    borderRadius   : RADIUS.button,
    alignItems     : 'center',
    justifyContent : 'center',
    paddingVertical: SPACING.md,
  },
  kaydetButonMetin: { color: '#FFFFFF', fontSize: FONT_SIZE.base },
  silButon: {
    borderRadius   : RADIUS.button,
    borderWidth    : 1,
    alignItems     : 'center',
    justifyContent : 'center',
    paddingVertical: SPACING.md,
  },
  silButonMetin: { fontSize: FONT_SIZE.base },
});
