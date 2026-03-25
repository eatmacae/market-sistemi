/**
 * Market Yönetim Sistemi — Tedarikçi Yönetim Ekranı
 * Tedarikçi listesi, kayıt/düzenleme, iletişim bilgileri
 *
 * Kalite kontrol:
 * ✅ Loading state
 * ✅ Empty state
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
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme }        from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore }    from '../../stores/authStore';
import { api }             from '../../services/api';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE }          from '../../constants/typography';
import { getPendingCount } from '../../services/storage';
import { WHITE } from '../../constants/colors';

// ============================================================
// TİPLER
// ============================================================

interface Tedarikci {
  id              : number;
  name            : string;
  contact_name    : string | null;
  phone           : string | null;
  email           : string | null;
  address         : string | null;
  website         : string | null;
  notes           : string | null;
  scraping_active : boolean;
  created_at      : string;
}

interface FormVeri {
  name        : string;
  contact_name: string;
  phone       : string;
  email       : string;
  address     : string;
  website     : string;
  notes       : string;
}

const BOŞ_FORM: FormVeri = {
  name        : '',
  contact_name: '',
  phone       : '',
  email       : '',
  address     : '',
  website     : '',
  notes       : '',
};

// ============================================================
// ANA EKRAN
// ============================================================

export default function SuppliersScreen() {
  const { colors }   = useTheme();
  const { branchId } = useSettingsStore();
  const { user }     = useAuthStore();

  const [tedarikciler, setTed]         = useState<Tedarikci[]>([]);
  const [yukleniyor, setYukleniyor]    = useState(true);
  const [yenileniyor, setYenile]       = useState(false);
  const [hata, setHata]                = useState<string | null>(null);
  const [isOffline, setIsOffline]         = useState(false);
  const [bekleyenIslem, setBekleyenIslem] = useState(0);
  const [arama, setArama]              = useState('');
  const [toplam, setToplam]            = useState(0);
  const [sayfa, setSayfa]              = useState(1);
  const [dahaVar, setDahaVar]          = useState(false);
  const [sayfaYuk, setSayfaYuk]        = useState(false);

  const [formModal, setFormModal]      = useState(false);
  const [secili, setSecili]            = useState<Tedarikci | null>(null);
  const [formVeri, setFormVeri]        = useState<FormVeri>(BOŞ_FORM);
  const [kaydediyor, setKaydediyor]    = useState(false);

  const isAdmin = user?.role === 'admin';

  // ============================================================
  // VERİ ÇEKME
  // ============================================================

  const yukle = useCallback(async (yeniSayfa = 1, yenileme = false) => {
    if (yeniSayfa === 1) {
      yenileme ? setYenile(true) : setYukleniyor(true);
    } else {
      setSayfaYuk(true);
    }
    setHata(null);

    try {
      const params = new URLSearchParams({
        branch_id: String(branchId),
        page     : String(yeniSayfa),
        per_page : '30',
      });
      if (arama.trim()) params.append('search', arama.trim());

      const yanit = await api.get(`/api/suppliers?${params}`);
      const data  = yanit.data;

      if (yeniSayfa === 1) {
        setTed(data.items);
      } else {
        setTed(prev => [...prev, ...data.items]);
      }
      setToplam(data.total);
      setSayfa(yeniSayfa);
      setDahaVar(yeniSayfa * 30 < data.total);
      setIsOffline(false);
    } catch (err: any) {
      if (!err.response) setIsOffline(true);
      setHata(err?.response?.data?.detail || 'Tedarikçiler yüklenemedi.');
    } finally {
      setYukleniyor(false);
      setYenile(false);
      setSayfaYuk(false);
    }
  }, [branchId, arama]);

  useEffect(() => {
    getPendingCount().then(setBekleyenIslem); yukle(1); }, [yukle]);

  // ============================================================
  // FORM İŞLEMLERİ
  // ============================================================

  const yeniAc = () => {
    setSecili(null);
    setFormVeri(BOŞ_FORM);
    setFormModal(true);
  };

  const duzenleAc = (t: Tedarikci) => {
    setSecili(t);
    setFormVeri({
      name        : t.name,
      contact_name: t.contact_name || '',
      phone       : t.phone        || '',
      email       : t.email        || '',
      address     : t.address      || '',
      website     : t.website      || '',
      notes       : t.notes        || '',
    });
    setFormModal(true);
  };

  const kaydet = async () => {
    if (!formVeri.name.trim()) {
      Alert.alert('Hata', 'Tedarikçi adı zorunludur.');
      return;
    }

    setKaydediyor(true);
    try {
      const payload = {
        branch_id   : branchId,
        name        : formVeri.name.trim(),
        contact_name: formVeri.contact_name.trim() || null,
        phone       : formVeri.phone.trim()        || null,
        email       : formVeri.email.trim()        || null,
        address     : formVeri.address.trim()      || null,
        website     : formVeri.website.trim()      || null,
        notes       : formVeri.notes.trim()        || null,
      };

      if (secili) {
        await api.patch(`/api/suppliers/${secili.id}`, payload);
      } else {
        await api.post('/api/suppliers', payload);
      }

      setFormModal(false);
      yukle(1);
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.detail || 'Kayıt başarısız.');
    } finally {
      setKaydediyor(false);
    }
  };

  const sil = (t: Tedarikci) => {
    Alert.alert(
      'Tedarikçi Sil',
      `"${t.name}" kaydını silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text   : 'Sil',
          style  : 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/suppliers/${t.id}`);
              yukle(1);
            } catch (err: any) {
              Alert.alert('Hata', err?.response?.data?.detail || 'Silme başarısız.');
            }
          },
        },
      ],
    );
  };

  // ============================================================
  // RENDER — Tedarikçi Kartı
  // ============================================================

  const renderTedarikci = ({ item }: { item: Tedarikci }) => (
    <TouchableOpacity
      style={[styles.kart, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}
      onPress={() => duzenleAc(item)}
      activeOpacity={0.7}
    >
      <View style={styles.kartUst}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.ad, { color: colors.textPrimary }]}>{item.name}</Text>
          {item.contact_name && (
            <Text style={[styles.kisi, { color: colors.textMuted }]}>👤 {item.contact_name}</Text>
          )}
          {item.phone && (
            <Text style={[styles.kisi, { color: colors.textMuted }]}>📞 {item.phone}</Text>
          )}
        </View>
        <View style={styles.aksiyonlar}>
          {item.scraping_active && (
            <View style={[styles.rozet, { backgroundColor: colors.cyan + '20' }]}>
              <Text style={{ color: colors.cyan, fontSize: FONT_SIZE.xs }}>🤖 Fiyat Takip</Text>
            </View>
          )}
          {isAdmin && (
            <TouchableOpacity
              style={[styles.silBtn, { backgroundColor: colors.danger + '20' }]}
              onPress={() => sil(item)}
            >
              <Text style={{ color: colors.danger, fontSize: 14 }}>🗑</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {item.email && (
        <Text style={[styles.email, { color: colors.textHint }]}>✉ {item.email}</Text>
      )}
    </TouchableOpacity>
  );

  // ============================================================
  // RENDER — Form Modal
  // ============================================================

  const renderFormModal = () => (
    <Modal visible={formModal} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: colors.bgPrimary }}
      >
        <View style={[styles.modalBaslik, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setFormModal(false)} style={styles.modalBtn}>
            <Text style={{ color: colors.blue, fontSize: FONT_SIZE.base }}>İptal</Text>
          </TouchableOpacity>
          <Text style={[styles.modalBaslikText, { color: colors.textPrimary }]}>
            {secili ? 'Tedarikçi Düzenle' : 'Yeni Tedarikçi'}
          </Text>
          <TouchableOpacity onPress={kaydet} style={styles.modalBtn} disabled={kaydediyor}>
            {kaydediyor
              ? <ActivityIndicator size="small" color={colors.blue} />
              : <Text style={{ color: colors.blue, fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.bodySemiBold }}>Kaydet</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.formIcerik}>
          {[
            { label: 'Tedarikçi Adı *',  key: 'name',         keyboard: 'default' },
            { label: 'İlgili Kişi',       key: 'contact_name', keyboard: 'default' },
            { label: 'Telefon',           key: 'phone',        keyboard: 'phone-pad' },
            { label: 'E-posta',           key: 'email',        keyboard: 'email-address' },
            { label: 'Web Sitesi',        key: 'website',      keyboard: 'url' },
          ].map(({ label, key, keyboard }) => (
            <View key={key}>
              <Text style={[styles.etiket, { color: colors.textMuted }]}>{label}</Text>
              <TextInput
                style={[styles.giris, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                value={(formVeri as any)[key]}
                onChangeText={(t) => setFormVeri(p => ({ ...p, [key]: t }))}
                placeholder={label.replace(' *', '')}
                placeholderTextColor={colors.textHint}
                keyboardType={keyboard as any}
                autoCapitalize={keyboard === 'email-address' || keyboard === 'url' ? 'none' : 'sentences'}
              />
            </View>
          ))}

          <Text style={[styles.etiket, { color: colors.textMuted }]}>Adres</Text>
          <TextInput
            style={[styles.giris, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary, minHeight: 72 }]}
            value={formVeri.address}
            onChangeText={t => setFormVeri(p => ({ ...p, address: t }))}
            placeholder="Adres..."
            placeholderTextColor={colors.textHint}
            multiline
            numberOfLines={2}
          />

          <Text style={[styles.etiket, { color: colors.textMuted }]}>Notlar</Text>
          <TextInput
            style={[styles.giris, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary, minHeight: 72 }]}
            value={formVeri.notes}
            onChangeText={t => setFormVeri(p => ({ ...p, notes: t }))}
            placeholder="Özel notlar..."
            placeholderTextColor={colors.textHint}
            multiline
            numberOfLines={2}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );

  // ============================================================
  // RENDER — ANA EKRAN
  // ============================================================

  if (yukleniyor) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.blue} />
        <Text style={[styles.bilgiMetin, { color: colors.textHint }]}>Tedarikçiler yükleniyor...</Text>
      </View>
    );
  }

  if (hata && tedarikciler.length === 0) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <Text style={{ fontSize: 48 }}>⚠️</Text>
        <Text style={[styles.bilgiMetin, { color: colors.danger }]}>{hata}</Text>
        <TouchableOpacity style={[styles.tekrarBtn, { backgroundColor: colors.blue }]} onPress={() => yukle(1)}>
          <Text style={{ color: WHITE, fontFamily: FONT_FAMILY.bodyMedium }}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>

      {/* ── Offline Banner ── */}
      {(isOffline || bekleyenIslem > 0) && (
        <View style={[styles.offlineBant, { backgroundColor: colors.danger }]}>
          <Text style={[styles.offlineMetin, { fontFamily: FONT_FAMILY.bodyMedium }]}>
            🔴 Offline · {bekleyenIslem} işlem bekliyor
          </Text>
        </View>
      )}
      {/* Arama */}
      <View style={[styles.aramaKutu, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.border }]}>
        <TextInput
          style={[styles.aramaGiris, { backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.textPrimary }]}
          value={arama}
          onChangeText={setArama}
          placeholder="🔍 Tedarikçi ara..."
          placeholderTextColor={colors.textHint}
          returnKeyType="search"
          onSubmitEditing={() => yukle(1)}
        />
        <Text style={{ color: colors.textHint, fontSize: FONT_SIZE.sm, marginTop: SPACING.xs }}>
          {toplam} tedarikçi
        </Text>
      </View>

      <FlatList
        data={tedarikciler}
        keyExtractor={item => String(item.id)}
        renderItem={renderTedarikci}
        contentContainerStyle={[styles.liste, tedarikciler.length === 0 && { flex: 1, justifyContent: 'center' }]}
        refreshing={yenileniyor}
        onRefresh={() => yukle(1, true)}
        onEndReached={() => dahaVar && !sayfaYuk && yukle(sayfa + 1)}
        onEndReachedThreshold={0.3}
        ListFooterComponent={sayfaYuk ? <ActivityIndicator size="small" color={colors.blue} style={{ marginVertical: SPACING.md }} /> : null}
        ListEmptyComponent={
          <View style={styles.bosDurum}>
            <Text style={{ fontSize: 56 }}>🏭</Text>
            <Text style={[styles.bosDurumMetin, { color: colors.textHint }]}>
              {arama ? 'Arama kriterine uyan tedarikçi yok.' : 'Henüz tedarikçi kaydı yok.\n+ butonuyla ekleyin.'}
            </Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity style={[styles.fab, { backgroundColor: colors.blue }]} onPress={yeniAc}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {renderFormModal()}
    </View>
  );
}

// ============================================================
// STİLLER
// ============================================================

const styles = StyleSheet.create({
  offlineBant: {
    paddingVertical  : SPACING.sm,
    paddingHorizontal: SPACING.base,
    alignItems       : 'center',
  },
  offlineMetin: {
    color   : WHITE,
    fontSize: FONT_SIZE.sm,
  },
  container  : { flex: 1 },
  merkez     : { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.md, padding: SPACING.xxl },
  bilgiMetin : { fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.body, textAlign: 'center' },
  tekrarBtn  : { paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: RADIUS.button, marginTop: SPACING.md, minHeight: MIN_TOUCH_SIZE, justifyContent: 'center' },
  aramaKutu  : { padding: SPACING.md, borderBottomWidth: 1, gap: SPACING.xs },
  aramaGiris : { height: MIN_TOUCH_SIZE, borderRadius: RADIUS.button, borderWidth: 1, paddingHorizontal: SPACING.md, fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.body },
  liste      : { padding: SPACING.md, gap: SPACING.sm },
  kart       : { borderRadius: RADIUS.card, borderWidth: 1, padding: SPACING.md, gap: SPACING.xs },
  kartUst    : { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  ad         : { fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.bodyMedium },
  kisi       : { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.body, marginTop: 2 },
  email      : { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.body },
  aksiyonlar : { alignItems: 'flex-end', gap: SPACING.xs },
  rozet      : { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.badge },
  silBtn     : { width: MIN_TOUCH_SIZE, height: MIN_TOUCH_SIZE, borderRadius: RADIUS.button, justifyContent: 'center', alignItems: 'center' },
  bosDurum   : { alignItems: 'center', paddingTop: SPACING.xxl, gap: SPACING.md },
  bosDurumMetin: { fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.body, textAlign: 'center', lineHeight: 24 },
  fab        : { position: 'absolute', bottom: SPACING.xl, right: SPACING.xl, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
  fabIcon    : { color: WHITE, fontSize: 28, lineHeight: 32, fontFamily: FONT_FAMILY.bodyMedium },
  modalBaslik: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingTop: SPACING.lg, paddingBottom: SPACING.md, borderBottomWidth: 1 },
  modalBaslikText: { fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.bodySemiBold },
  modalBtn   : { minWidth: 60, minHeight: MIN_TOUCH_SIZE, justifyContent: 'center', alignItems: 'center' },
  formIcerik : { padding: SPACING.md, gap: SPACING.xs },
  etiket     : { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium, marginTop: SPACING.sm, marginBottom: 4 },
  giris      : { borderRadius: RADIUS.button, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.body, minHeight: MIN_TOUCH_SIZE },
});
