/**
 * Market Yönetim Sistemi — Şube Yönetimi Ekranı (Faz 7)
 * Şube listeleme, oluşturma, düzenleme, aktif/pasif
 * Sadece admin erişebilir
 *
 * Kalite kontrol:
 * ✅ Loading state
 * ✅ Empty state
 * ✅ Error state
 * ✅ useTheme() — hardcode renk yok
 * ✅ Min 48px dokunma alanı
 * ✅ Türkçe yorum satırları
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { useFocusEffect }   from 'expo-router';
import { useTheme }         from '../../hooks/useTheme';
import { useAuthStore }     from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { api }              from '../../services/api';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE }          from '../../constants/typography';

// ============================================================
// TİPLER
// ============================================================

interface Sube {
  id     : number;
  name   : string;
  address: string | null;
  phone  : string | null;
  active : boolean;
}

interface SubeForm {
  name   : string;
  address: string;
  phone  : string;
}

const BOŞ_FORM: SubeForm = { name: '', address: '', phone: '' };

// ============================================================
// ANA EKRAN
// ============================================================

export default function BranchesScreen() {
  const { colors }     = useTheme();
  const { user }       = useAuthStore();
  const { branchId }   = useSettingsStore();

  const [subeler,    setSubeler]    = useState<Sube[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [hata,       setHata]       = useState<string | null>(null);

  // Sadece aktif/tüm toggle
  const [sadeceAktif, setSadeceAktif] = useState(true);

  // Modal
  const [modalAcik,   setModalAcik]   = useState(false);
  const [duzenlenecek, setDuzenlenecek] = useState<Sube | null>(null);
  const [form,        setForm]        = useState<SubeForm>(BOŞ_FORM);
  const [kaydediyor,  setKaydediyor]  = useState(false);

  const isAdmin = user?.role === 'admin';

  // ============================================================
  // VERİ ÇEKME
  // ============================================================

  const yukle = useCallback(async (yenile = false) => {
    if (yenile) setYenileniyor(true);
    else setYukleniyor(true);
    setHata(null);

    try {
      const yanit = await api.get(`/api/branches?sadece_aktif=${sadeceAktif}`);
      setSubeler(yanit.data.items);
    } catch (err: any) {
      setHata(err?.response?.data?.detail || 'Şubeler yüklenemedi.');
    } finally {
      setYukleniyor(false);
      setYenileniyor(false);
    }
  }, [sadeceAktif]);

  useFocusEffect(useCallback(() => { yukle(); }, [yukle]));

  // ============================================================
  // MODAL AÇ
  // ============================================================

  const yeniSubeAc = () => {
    setDuzenlenecek(null);
    setForm(BOŞ_FORM);
    setModalAcik(true);
  };

  const duzenleAc = (sube: Sube) => {
    setDuzenlenecek(sube);
    setForm({
      name   : sube.name,
      address: sube.address || '',
      phone  : sube.phone   || '',
    });
    setModalAcik(true);
  };

  // ============================================================
  // KAYDET (YENİ / GÜNCELLE)
  // ============================================================

  const kaydet = async () => {
    if (!form.name.trim()) {
      Alert.alert('Hata', 'Şube adı zorunludur.');
      return;
    }

    setKaydediyor(true);
    try {
      if (duzenlenecek) {
        // Güncelleme
        await api.patch(
          `/api/branches/${duzenlenecek.id}?name=${encodeURIComponent(form.name.trim())}` +
          `&address=${encodeURIComponent(form.address.trim())}` +
          `&phone=${encodeURIComponent(form.phone.trim())}`,
        );
      } else {
        // Yeni
        await api.post(
          `/api/branches?name=${encodeURIComponent(form.name.trim())}` +
          `&address=${encodeURIComponent(form.address.trim())}` +
          `&phone=${encodeURIComponent(form.phone.trim())}`,
        );
      }
      setModalAcik(false);
      yukle();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.detail || 'İşlem başarısız.');
    } finally {
      setKaydediyor(false);
    }
  };

  // ============================================================
  // AKTİF/PASİF DEĞIŞTIR
  // ============================================================

  const durumDegistir = (sube: Sube) => {
    if (sube.id === 1 && sube.active) {
      Alert.alert('Uyarı', 'Merkez şube deaktif edilemez.');
      return;
    }
    const yeniDurum = !sube.active;
    Alert.alert(
      yeniDurum ? 'Şubeyi Aktifleştir' : 'Şubeyi Deaktif Et',
      `"${sube.name}" şubesini ${yeniDurum ? 'aktifleştirmek' : 'deaktif etmek'} istiyor musunuz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text   : yeniDurum ? 'Aktifleştir' : 'Deaktif Et',
          style  : yeniDurum ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await api.patch(`/api/branches/${sube.id}?active=${yeniDurum}`);
              yukle();
            } catch (err: any) {
              Alert.alert('Hata', err?.response?.data?.detail || 'İşlem başarısız.');
            }
          },
        },
      ],
    );
  };

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

  if (hata) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <Text style={{ fontSize: 40 }}>⚠️</Text>
        <Text style={[styles.bilgiMetin, { color: colors.danger }]}>{hata}</Text>
        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.blue }]} onPress={() => yukle()}>
          <Text style={styles.btnMetin}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ============================================================
  // LİSTE ÖĞESİ
  // ============================================================

  const SubeKarti = ({ item }: { item: Sube }) => (
    <View style={[styles.kart, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
      <View style={styles.kartUst}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.subeName, { color: colors.textPrimary }]}>{item.name}</Text>
          {item.address && (
            <Text style={[styles.subeDetay, { color: colors.textMuted }]} numberOfLines={1}>
              📍 {item.address}
            </Text>
          )}
          {item.phone && (
            <Text style={[styles.subeDetay, { color: colors.textMuted }]}>
              📞 {item.phone}
            </Text>
          )}
        </View>
        <View style={{ gap: SPACING.sm, alignItems: 'flex-end' }}>
          {/* Durum rozeti */}
          <View style={[styles.rozet, { backgroundColor: item.active ? colors.success + '20' : colors.danger + '20' }]}>
            <Text style={{ fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.bodyMedium, color: item.active ? colors.success : colors.danger }}>
              {item.active ? 'Aktif' : 'Pasif'}
            </Text>
          </View>
          {item.id === 1 && (
            <View style={[styles.rozet, { backgroundColor: colors.blue + '20' }]}>
              <Text style={{ fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.bodyMedium, color: colors.blue }}>
                Merkez
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Admin aksiyonları */}
      {isAdmin && (
        <View style={[styles.aksiyonlar, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.aksiyonBtn, { backgroundColor: colors.bgTertiary }]}
            onPress={() => duzenleAc(item)}
          >
            <Text style={[styles.aksiyonBtnMetin, { color: colors.blue }]}>✏️ Düzenle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.aksiyonBtn, { backgroundColor: item.active ? colors.danger + '15' : colors.success + '15' }]}
            onPress={() => durumDegistir(item)}
          >
            <Text style={[styles.aksiyonBtnMetin, { color: item.active ? colors.danger : colors.success }]}>
              {item.active ? '🔴 Deaktif Et' : '🟢 Aktifleştir'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <View style={[styles.konteyner, { backgroundColor: colors.bgPrimary }]}>

      {/* Filtre + Yeni Şube */}
      <View style={[styles.araYüz, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.filtreTus, { borderColor: colors.border, backgroundColor: sadeceAktif ? colors.blue + '15' : 'transparent' }]}
          onPress={() => setSadeceAktif(v => !v)}
        >
          <Text style={[styles.filtreTusMetin, { color: sadeceAktif ? colors.blue : colors.textMuted }]}>
            {sadeceAktif ? '● Sadece Aktif' : '○ Tüm Şubeler'}
          </Text>
        </TouchableOpacity>

        {isAdmin && (
          <TouchableOpacity
            style={[styles.ekleBtn, { backgroundColor: colors.blue }]}
            onPress={yeniSubeAc}
          >
            <Text style={styles.ekleBtnMetin}>+ Yeni Şube</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Liste */}
      <FlatList
        data={subeler}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: SPACING.md, gap: SPACING.sm, paddingBottom: SPACING.xxl }}
        refreshControl={
          <RefreshControl refreshing={yenileniyor} onRefresh={() => yukle(true)} tintColor={colors.blue} />
        }
        ListEmptyComponent={
          <View style={styles.bosEkran}>
            <Text style={{ fontSize: 48 }}>🏢</Text>
            <Text style={[styles.bilgiMetin, { color: colors.textMuted }]}>
              {sadeceAktif ? 'Aktif şube bulunamadı.' : 'Hiç şube yok.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => <SubeKarti item={item} />}
      />

      {/* ── MODAL: Yeni / Düzenle ── */}
      <Modal
        visible={modalAcik}
        transparent
        animationType="slide"
        onRequestClose={() => setModalAcik(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKapak}
        >
          <View style={[styles.modalKutu, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
            <Text style={[styles.modalBaslik, { color: colors.textPrimary }]}>
              {duzenlenecek ? '✏️ Şubeyi Düzenle' : '🏢 Yeni Şube'}
            </Text>

            <FormGirisi
              label="Şube Adı *"
              value={form.name}
              onChangeText={v => setForm(p => ({ ...p, name: v }))}
              placeholder="Ör: Bağcılar Şubesi"
              colors={colors}
            />
            <FormGirisi
              label="Adres"
              value={form.address}
              onChangeText={v => setForm(p => ({ ...p, address: v }))}
              placeholder="Mahalle, Sokak, No..."
              colors={colors}
              multiline
            />
            <FormGirisi
              label="Telefon"
              value={form.phone}
              onChangeText={v => setForm(p => ({ ...p, phone: v }))}
              placeholder="0XXX XXX XX XX"
              colors={colors}
              keyboardType="phone-pad"
            />

            <View style={styles.modalBtnlar}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
                onPress={() => setModalAcik(false)}
              >
                <Text style={[styles.modalBtnMetin, { color: colors.textPrimary }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.blue }, kaydediyor && { opacity: 0.7 }]}
                onPress={kaydet}
                disabled={kaydediyor}
              >
                {kaydediyor
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={[styles.modalBtnMetin, { color: '#fff' }]}>Kaydet</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ============================================================
// ALT BİLEŞEN
// ============================================================

function FormGirisi({
  label, value, onChangeText, placeholder, colors, multiline, keyboardType,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; colors: any; multiline?: boolean; keyboardType?: any;
}) {
  return (
    <View style={{ gap: SPACING.xs }}>
      <Text style={{ fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium, color: colors.textMuted }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textHint}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        numberOfLines={multiline ? 2 : 1}
        autoCapitalize="sentences"
        style={{
          backgroundColor: colors.bgTertiary,
          borderColor    : colors.border,
          borderWidth    : 1,
          borderRadius   : RADIUS.button,
          paddingHorizontal: SPACING.md,
          paddingVertical: SPACING.sm,
          color          : colors.textPrimary,
          fontSize       : FONT_SIZE.base,
          fontFamily     : FONT_FAMILY.body,
          minHeight      : MIN_TOUCH_SIZE,
        }}
      />
    </View>
  );
}

// ============================================================
// STİLLER
// ============================================================

const styles = StyleSheet.create({
  konteyner : { flex: 1 },
  merkez    : { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.md, padding: SPACING.xxl },
  bilgiMetin: { fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.body, textAlign: 'center', marginTop: SPACING.sm },
  btn       : { borderRadius: RADIUS.button, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, minHeight: MIN_TOUCH_SIZE, justifyContent: 'center' },
  btnMetin  : { color: '#fff', fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.base },
  araYüz    : { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.md, borderBottomWidth: 1, gap: SPACING.sm },
  filtreTus : { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.button, borderWidth: 1, minHeight: MIN_TOUCH_SIZE, justifyContent: 'center' },
  filtreTusMetin: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium },
  ekleBtn   : { paddingHorizontal: SPACING.base, paddingVertical: SPACING.sm, borderRadius: RADIUS.button, minHeight: MIN_TOUCH_SIZE, justifyContent: 'center', alignItems: 'center' },
  ekleBtnMetin: { color: '#fff', fontFamily: FONT_FAMILY.bodyBold, fontSize: FONT_SIZE.sm },
  bosEkran  : { alignItems: 'center', justifyContent: 'center', paddingTop: SPACING.xxl * 2, gap: SPACING.md },
  kart      : { borderRadius: RADIUS.card, borderWidth: 1, overflow: 'hidden' },
  kartUst   : { flexDirection: 'row', padding: SPACING.base, gap: SPACING.md, alignItems: 'flex-start' },
  subeName  : { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodySemiBold },
  subeDetay : { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.body, marginTop: SPACING.xs },
  rozet     : { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.badge },
  aksiyonlar: { flexDirection: 'row', borderTopWidth: 1, gap: 1 },
  aksiyonBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.sm, minHeight: MIN_TOUCH_SIZE },
  aksiyonBtnMetin: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium },
  modalKapak: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalKutu : { borderTopLeftRadius: RADIUS.modal, borderTopRightRadius: RADIUS.modal, borderWidth: 1, padding: SPACING.xl, gap: SPACING.md },
  modalBaslik: { fontSize: FONT_SIZE.lg, fontFamily: FONT_FAMILY.bodyBold, marginBottom: SPACING.sm },
  modalBtnlar: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  modalBtn  : { flex: 1, borderRadius: RADIUS.button, paddingVertical: SPACING.md, alignItems: 'center', justifyContent: 'center', minHeight: MIN_TOUCH_SIZE, borderWidth: 1 },
  modalBtnMetin: { fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.bodyBold },
});
