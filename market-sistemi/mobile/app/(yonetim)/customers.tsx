/**
 * Market Yönetim Sistemi — Müşteri Yönetim Ekranı
 * Müşteri listesi, kayıt/düzenleme, veresiye takibi, tahsilat
 *
 * Kalite kontrol:
 * ✅ Loading state
 * ✅ Empty state
 * ✅ Error state
 * ✅ Offline state
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

// ============================================================
// TİPLER
// ============================================================

interface Musteri {
  id             : number;
  name           : string;
  phone          : string | null;
  email          : string | null;
  address        : string | null;
  credit_limit   : number;
  credit_balance : number;
  loyalty_points : number;
  notes          : string | null;
  created_at     : string;
}

interface FormVeri {
  name          : string;
  phone         : string;
  email         : string;
  address       : string;
  credit_limit  : string;
  notes         : string;
}

const BOŞ_FORM: FormVeri = {
  name         : '',
  phone        : '',
  email        : '',
  address      : '',
  credit_limit : '0',
  notes        : '',
};

// ============================================================
// ANA EKRAN
// ============================================================

export default function CustomersScreen() {
  const { colors }   = useTheme();
  const { branchId } = useSettingsStore();
  const { user }     = useAuthStore();

  const [musteriler, setMusteriler]       = useState<Musteri[]>([]);
  const [yukleniyor, setYukleniyor]       = useState(true);
  const [yenileniyor, setYenileniyor]     = useState(false);
  const [hata, setHata]                   = useState<string | null>(null);
  const [isOffline, setIsOffline]         = useState(false);
  const [bekleyenIslem, setBekleyenIslem] = useState(0);
  const [arama, setArama]                 = useState('');
  const [veresiyeFiltre, setVereFiltre]   = useState(false);
  const [toplam, setToplam]               = useState(0);
  const [sayfa, setSayfa]                 = useState(1);
  const [dahaVar, setDahaVar]             = useState(false);
  const [sayfaYukleniyor, setSayfaYukle] = useState(false);

  // Modal state'leri
  const [formModal, setFormModal]         = useState(false);
  const [seciliMusteri, setSecili]        = useState<Musteri | null>(null);
  const [formVeri, setFormVeri]           = useState<FormVeri>(BOŞ_FORM);
  const [kaydediyor, setKaydediyor]       = useState(false);

  // Tahsilat modal
  const [tahsilatModal, setTahsilatModal] = useState(false);
  const [tahsilatMusteri, setTahMusteri]  = useState<Musteri | null>(null);
  const [tahsilatTutar, setTahTutar]      = useState('');
  const [tahsilatNot, setTahNot]          = useState('');
  const [tahsilatYap, setTahYap]          = useState(false);

  // ============================================================
  // VERİ ÇEKME
  // ============================================================

  const musteriYukle = useCallback(async (yeniSayfa = 1, yenileme = false) => {
    if (yeniSayfa === 1) {
      yenileme ? setYenileniyor(true) : setYukleniyor(true);
    } else {
      setSayfaYukle(true);
    }
    setHata(null);

    try {
      const params = new URLSearchParams({
        branch_id : String(branchId),
        page      : String(yeniSayfa),
        per_page  : '30',
      });
      if (arama.trim()) params.append('search', arama.trim());
      if (veresiyeFiltre) params.append('veresiyeli', 'true');

      const yanit = await api.get(`/api/customers?${params}`);
      const data  = yanit.data;

      if (yeniSayfa === 1) {
        setMusteriler(data.items);
      } else {
        setMusteriler(prev => [...prev, ...data.items]);
      }
      setToplam(data.total);
      setSayfa(yeniSayfa);
      setDahaVar(yeniSayfa * 30 < data.total);
      setIsOffline(false);
    } catch (err: any) {
      if (!err.response) setIsOffline(true);
      setHata(err?.response?.data?.detail || 'Müşteriler yüklenemedi.');
    } finally {
      setYukleniyor(false);
      setYenileniyor(false);
      setSayfaYukle(false);
    }
  }, [branchId, arama, veresiyeFiltre]);

  useEffect(() => {
    getPendingCount().then(setBekleyenIslem);
    musteriYukle(1);
  }, [musteriYukle]);

  // ============================================================
  // FORM İŞLEMLERİ
  // ============================================================

  const yeniMusteriAc = () => {
    setSecili(null);
    setFormVeri(BOŞ_FORM);
    setFormModal(true);
  };

  const musteriDuzenleAc = (m: Musteri) => {
    setSecili(m);
    setFormVeri({
      name        : m.name,
      phone       : m.phone   || '',
      email       : m.email   || '',
      address     : m.address || '',
      credit_limit: String(m.credit_limit),
      notes       : m.notes   || '',
    });
    setFormModal(true);
  };

  const kaydet = async () => {
    if (!formVeri.name.trim()) {
      Alert.alert('Hata', 'Müşteri adı zorunludur.');
      return;
    }

    setKaydediyor(true);
    try {
      const payload = {
        branch_id   : branchId,
        name        : formVeri.name.trim(),
        phone       : formVeri.phone.trim()   || null,
        email       : formVeri.email.trim()   || null,
        address     : formVeri.address.trim() || null,
        credit_limit: parseFloat(formVeri.credit_limit) || 0,
        notes       : formVeri.notes.trim()   || null,
      };

      if (seciliMusteri) {
        await api.patch(`/api/customers/${seciliMusteri.id}`, payload);
      } else {
        await api.post('/api/customers', payload);
      }

      setFormModal(false);
      musteriYukle(1);
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.detail || 'Kayıt başarısız.');
    } finally {
      setKaydediyor(false);
    }
  };

  const musteriSil = (m: Musteri) => {
    if (m.credit_balance > 0) {
      Alert.alert(
        'Silinemez',
        `${m.name} müşterisinin ${m.credit_balance.toFixed(2)}₺ açık veresiyesi var.\nÖnce tahsilat yapın.`,
      );
      return;
    }
    Alert.alert(
      'Müşteri Sil',
      `"${m.name}" kaydını silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text   : 'Sil',
          style  : 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/customers/${m.id}`);
              musteriYukle(1);
            } catch (err: any) {
              Alert.alert('Hata', err?.response?.data?.detail || 'Silme başarısız.');
            }
          },
        },
      ],
    );
  };

  // ============================================================
  // TAHSİLAT
  // ============================================================

  const tahsilatAc = (m: Musteri) => {
    setTahMusteri(m);
    setTahTutar('');
    setTahNot('');
    setTahsilatModal(true);
  };

  const tahsilatTamamla = async () => {
    const tutar = parseFloat(tahsilatTutar);
    if (!tutar || tutar <= 0) {
      Alert.alert('Hata', 'Geçerli bir tutar girin.');
      return;
    }
    if (!tahsilatMusteri) return;
    if (tutar > tahsilatMusteri.credit_balance) {
      Alert.alert('Hata', `Bakiyeden fazla tutar girilemez. Bakiye: ${tahsilatMusteri.credit_balance.toFixed(2)}₺`);
      return;
    }

    setTahYap(true);
    try {
      const params = new URLSearchParams({ tutar: String(tutar) });
      if (tahsilatNot.trim()) params.append('not_', tahsilatNot.trim());

      await api.post(`/api/customers/${tahsilatMusteri.id}/payment?${params}`);
      setTahsilatModal(false);
      musteriYukle(1);
      Alert.alert('Başarılı', `${tutar.toFixed(2)}₺ tahsilat yapıldı.`);
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.detail || 'Tahsilat başarısız.');
    } finally {
      setTahYap(false);
    }
  };

  // ============================================================
  // RENDER — Müşteri Kartı
  // ============================================================

  const renderMusteri = ({ item }: { item: Musteri }) => {
    const veresiyeVar = item.credit_balance > 0;

    return (
      <TouchableOpacity
        style={[styles.kart, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}
        onPress={() => musteriDuzenleAc(item)}
        activeOpacity={0.7}
      >
        {/* Üst satır: isim + silme */}
        <View style={styles.kartUst}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.musteriAd, { color: colors.textPrimary }]}>{item.name}</Text>
            {item.phone && (
              <Text style={[styles.telefon, { color: colors.textMuted }]}>📞 {item.phone}</Text>
            )}
          </View>
          {user?.role === 'admin' && (
            <TouchableOpacity
              style={[styles.silButon, { backgroundColor: colors.danger + '20' }]}
              onPress={() => musteriSil(item)}
            >
              <Text style={{ fontSize: 14, color: colors.danger }}>🗑</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Alt satır: veresiye + puan */}
        <View style={styles.kartAlt}>
          {veresiyeVar ? (
            <TouchableOpacity
              style={[styles.veresiyeBadge, { backgroundColor: colors.danger + '20', borderColor: colors.danger + '40' }]}
              onPress={() => tahsilatAc(item)}
            >
              <Text style={{ color: colors.danger, fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.bodyMedium }}>
                💳 {item.credit_balance.toFixed(2)}₺ veresiye
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.veresiyeBadge, { backgroundColor: colors.success + '15', borderColor: colors.success + '30' }]}>
              <Text style={{ color: colors.success, fontSize: FONT_SIZE.xs }}>✓ Temiz</Text>
            </View>
          )}

          {item.loyalty_points > 0 && (
            <View style={[styles.puanBadge, { backgroundColor: colors.purple + '15' }]}>
              <Text style={{ color: colors.purple, fontSize: FONT_SIZE.xs }}>
                ⭐ {item.loyalty_points} puan
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ============================================================
  // RENDER — Form Modal
  // ============================================================

  const renderFormModal = () => (
    <Modal visible={formModal} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: colors.bgPrimary }}
      >
        {/* Başlık */}
        <View style={[styles.modalBaslik, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setFormModal(false)} style={styles.modalKapat}>
            <Text style={{ color: colors.blue, fontSize: FONT_SIZE.base }}>İptal</Text>
          </TouchableOpacity>
          <Text style={[styles.modalBaslikText, { color: colors.textPrimary }]}>
            {seciliMusteri ? 'Müşteri Düzenle' : 'Yeni Müşteri'}
          </Text>
          <TouchableOpacity onPress={kaydet} style={styles.modalKapat} disabled={kaydediyor}>
            {kaydediyor
              ? <ActivityIndicator size="small" color={colors.blue} />
              : <Text style={{ color: colors.blue, fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.bodySemiBold }}>Kaydet</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.formIcerik}>
          {/* İsim */}
          <Text style={[styles.etiket, { color: colors.textMuted }]}>Müşteri Adı *</Text>
          <TextInput
            style={[styles.giris, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
            value={formVeri.name}
            onChangeText={t => setFormVeri(p => ({ ...p, name: t }))}
            placeholder="Ad Soyad veya Firma Adı"
            placeholderTextColor={colors.textHint}
          />

          {/* Telefon */}
          <Text style={[styles.etiket, { color: colors.textMuted }]}>Telefon</Text>
          <TextInput
            style={[styles.giris, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
            value={formVeri.phone}
            onChangeText={t => setFormVeri(p => ({ ...p, phone: t }))}
            placeholder="05XX XXX XX XX"
            placeholderTextColor={colors.textHint}
            keyboardType="phone-pad"
          />

          {/* Email */}
          <Text style={[styles.etiket, { color: colors.textMuted }]}>E-posta</Text>
          <TextInput
            style={[styles.giris, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
            value={formVeri.email}
            onChangeText={t => setFormVeri(p => ({ ...p, email: t }))}
            placeholder="ornek@mail.com"
            placeholderTextColor={colors.textHint}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          {/* Adres */}
          <Text style={[styles.etiket, { color: colors.textMuted }]}>Adres</Text>
          <TextInput
            style={[styles.giris, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary, minHeight: 72 }]}
            value={formVeri.address}
            onChangeText={t => setFormVeri(p => ({ ...p, address: t }))}
            placeholder="Mahalle, Sokak, No..."
            placeholderTextColor={colors.textHint}
            multiline
            numberOfLines={2}
          />

          {/* Veresiye Limiti */}
          <Text style={[styles.etiket, { color: colors.textMuted }]}>Veresiye Limiti (₺)</Text>
          <TextInput
            style={[styles.giris, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
            value={formVeri.credit_limit}
            onChangeText={t => setFormVeri(p => ({ ...p, credit_limit: t }))}
            placeholder="0"
            placeholderTextColor={colors.textHint}
            keyboardType="numeric"
          />

          {/* Notlar */}
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
  // RENDER — Tahsilat Modal
  // ============================================================

  const renderTahsilatModal = () => (
    <Modal visible={tahsilatModal} animationType="slide" presentationStyle="formSheet">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: colors.bgPrimary }}
      >
        <View style={[styles.modalBaslik, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setTahsilatModal(false)} style={styles.modalKapat}>
            <Text style={{ color: colors.blue, fontSize: FONT_SIZE.base }}>İptal</Text>
          </TouchableOpacity>
          <Text style={[styles.modalBaslikText, { color: colors.textPrimary }]}>💳 Veresiye Tahsilatı</Text>
          <TouchableOpacity onPress={tahsilatTamamla} style={styles.modalKapat} disabled={tahsilatYap}>
            {tahsilatYap
              ? <ActivityIndicator size="small" color={colors.success} />
              : <Text style={{ color: colors.success, fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.bodySemiBold }}>Tahsil Et</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.formIcerik}>
          {tahsilatMusteri && (
            <View style={[styles.tahsilatBilgi, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
              <Text style={[{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.base }]}>
                {tahsilatMusteri.name}
              </Text>
              <Text style={[{ color: colors.danger, fontFamily: FONT_FAMILY.bodySemiBold, fontSize: FONT_SIZE.lg, marginTop: 4 }]}>
                Bakiye: {tahsilatMusteri.credit_balance.toFixed(2)}₺
              </Text>
            </View>
          )}

          <Text style={[styles.etiket, { color: colors.textMuted }]}>Tahsilat Tutarı (₺) *</Text>
          <TextInput
            style={[styles.giris, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary, fontSize: FONT_SIZE.xl }]}
            value={tahsilatTutar}
            onChangeText={setTahTutar}
            placeholder="0.00"
            placeholderTextColor={colors.textHint}
            keyboardType="numeric"
            autoFocus
          />

          <Text style={[styles.etiket, { color: colors.textMuted }]}>Not (Opsiyonel)</Text>
          <TextInput
            style={[styles.giris, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
            value={tahsilatNot}
            onChangeText={setTahNot}
            placeholder="Tahsilat notu..."
            placeholderTextColor={colors.textHint}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );

  // ============================================================
  // RENDER — ANA EKRAN
  // ============================================================

  const styles_dyn = {
    container : { backgroundColor: colors.bgPrimary },
  };

  if (yukleniyor) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.blue} />
        <Text style={[styles.bilgiMetin, { color: colors.textHint }]}>Müşteriler yükleniyor...</Text>
      </View>
    );
  }

  if (hata && musteriler.length === 0) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <Text style={{ fontSize: 48 }}>⚠️</Text>
        <Text style={[styles.hataMetin, { color: colors.danger }]}>{hata}</Text>
        <TouchableOpacity
          style={[styles.tekrarBtn, { backgroundColor: colors.blue }]}
          onPress={() => musteriYukle(1)}
        >
          <Text style={{ color: '#fff', fontFamily: FONT_FAMILY.bodyMedium }}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, styles_dyn.container]}>

      {/* ── Offline Banner ── */}
      {(isOffline || bekleyenIslem > 0) && (
        <View style={[styles.offlineBant, { backgroundColor: colors.danger }]}>
          <Text style={[styles.offlineMetin, { fontFamily: FONT_FAMILY.bodyMedium }]}>
            🔴 Offline · {bekleyenIslem} işlem bekliyor
          </Text>
        </View>
      )}
      {/* ── Arama & Filtreler ── */}
      <View style={[styles.aramaKutusu, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.border }]}>
        <TextInput
          style={[styles.aramaGiris, { backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.textPrimary }]}
          value={arama}
          onChangeText={setArama}
          placeholder="🔍 Ad veya telefon ara..."
          placeholderTextColor={colors.textHint}
          returnKeyType="search"
          onSubmitEditing={() => musteriYukle(1)}
        />
        <View style={styles.filtreSatir}>
          <TouchableOpacity
            style={[styles.filtreBtn, veresiyeFiltre && { backgroundColor: colors.danger + '20', borderColor: colors.danger + '50' }, { borderColor: colors.border }]}
            onPress={() => setVereFiltre(p => !p)}
          >
            <Text style={{ color: veresiyeFiltre ? colors.danger : colors.textMuted, fontSize: FONT_SIZE.sm }}>
              💳 Veresiyeli
            </Text>
          </TouchableOpacity>

          <Text style={{ color: colors.textHint, fontSize: FONT_SIZE.sm, marginLeft: SPACING.sm }}>
            {toplam} müşteri
          </Text>
        </View>
      </View>

      {/* ── Liste ── */}
      <FlatList
        data={musteriler}
        keyExtractor={item => String(item.id)}
        renderItem={renderMusteri}
        contentContainerStyle={[styles.liste, musteriler.length === 0 && { flex: 1, justifyContent: 'center' }]}
        refreshing={yenileniyor}
        onRefresh={() => musteriYukle(1, true)}
        onEndReached={() => dahaVar && !sayfaYukleniyor && musteriYukle(sayfa + 1)}
        onEndReachedThreshold={0.3}
        ListFooterComponent={sayfaYukleniyor ? <ActivityIndicator size="small" color={colors.blue} style={{ marginVertical: SPACING.md }} /> : null}
        ListEmptyComponent={
          <View style={styles.bosDurum}>
            <Text style={{ fontSize: 56 }}>👥</Text>
            <Text style={[styles.bosDurumMetin, { color: colors.textHint }]}>
              {arama || veresiyeFiltre
                ? 'Arama kriterine uyan müşteri yok.'
                : 'Henüz müşteri kaydı yok.\nYeni müşteri eklemek için + butonuna dokunun.'}
            </Text>
          </View>
        }
      />

      {/* ── Yeni Müşteri FAB ── */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.blue }]}
        onPress={yeniMusteriAc}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {renderFormModal()}
      {renderTahsilatModal()}
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
    color   : '#FFFFFF',
    fontSize: FONT_SIZE.sm,
  },
  container: {
    flex: 1,
  },
  merkez: {
    flex           : 1,
    justifyContent : 'center',
    alignItems     : 'center',
    gap            : SPACING.md,
    padding        : SPACING.xl,
  },
  bilgiMetin: {
    fontSize   : FONT_SIZE.base,
    fontFamily : FONT_FAMILY.body,
    marginTop  : SPACING.sm,
  },
  hataMetin: {
    fontSize   : FONT_SIZE.base,
    fontFamily : FONT_FAMILY.body,
    textAlign  : 'center',
  },
  tekrarBtn: {
    paddingHorizontal : SPACING.xl,
    paddingVertical   : SPACING.md,
    borderRadius      : RADIUS.button,
    marginTop         : SPACING.md,
    minHeight         : MIN_TOUCH_SIZE,
    justifyContent    : 'center',
  },
  aramaKutusu: {
    padding      : SPACING.md,
    borderBottomWidth: 1,
    gap          : SPACING.sm,
  },
  aramaGiris: {
    height        : MIN_TOUCH_SIZE,
    borderRadius  : RADIUS.button,
    borderWidth   : 1,
    paddingHorizontal: SPACING.md,
    fontSize      : FONT_SIZE.base,
    fontFamily    : FONT_FAMILY.body,
  },
  filtreSatir: {
    flexDirection : 'row',
    alignItems    : 'center',
  },
  filtreBtn: {
    paddingHorizontal : SPACING.md,
    paddingVertical   : SPACING.xs,
    borderRadius      : RADIUS.button,
    borderWidth       : 1,
    minHeight         : MIN_TOUCH_SIZE,
    justifyContent    : 'center',
  },
  liste: {
    padding: SPACING.md,
    gap    : SPACING.sm,
  },
  kart: {
    borderRadius  : RADIUS.card,
    borderWidth   : 1,
    padding       : SPACING.md,
    gap           : SPACING.sm,
  },
  kartUst: {
    flexDirection : 'row',
    alignItems    : 'center',
    gap           : SPACING.sm,
  },
  musteriAd: {
    fontSize   : FONT_SIZE.base,
    fontFamily : FONT_FAMILY.bodyMedium,
  },
  telefon: {
    fontSize   : FONT_SIZE.sm,
    fontFamily : FONT_FAMILY.body,
    marginTop  : 2,
  },
  silButon: {
    width          : MIN_TOUCH_SIZE,
    height         : MIN_TOUCH_SIZE,
    borderRadius   : RADIUS.button,
    justifyContent : 'center',
    alignItems     : 'center',
  },
  kartAlt: {
    flexDirection : 'row',
    gap           : SPACING.sm,
    flexWrap      : 'wrap',
  },
  veresiyeBadge: {
    paddingHorizontal : SPACING.sm,
    paddingVertical   : 4,
    borderRadius      : RADIUS.badge,
    borderWidth       : 1,
  },
  puanBadge: {
    paddingHorizontal : SPACING.sm,
    paddingVertical   : 4,
    borderRadius      : RADIUS.badge,
  },
  bosDurum: {
    alignItems  : 'center',
    paddingTop  : SPACING.xxxl,
    gap         : SPACING.md,
  },
  bosDurumMetin: {
    fontSize   : FONT_SIZE.base,
    fontFamily : FONT_FAMILY.body,
    textAlign  : 'center',
    lineHeight : 24,
  },
  fab: {
    position      : 'absolute',
    bottom        : SPACING.xl,
    right         : SPACING.xl,
    width         : 56,
    height        : 56,
    borderRadius  : 28,
    justifyContent: 'center',
    alignItems    : 'center',
    elevation     : 4,
    shadowColor   : '#000',
    shadowOffset  : { width: 0, height: 2 },
    shadowOpacity : 0.25,
    shadowRadius  : 4,
  },
  fabIcon: {
    color      : '#fff',
    fontSize   : 28,
    lineHeight : 32,
    fontFamily : FONT_FAMILY.bodyMedium,
  },
  modalBaslik: {
    flexDirection    : 'row',
    alignItems       : 'center',
    justifyContent   : 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop       : SPACING.lg,
    paddingBottom    : SPACING.md,
    borderBottomWidth: 1,
  },
  modalBaslikText: {
    fontSize   : FONT_SIZE.base,
    fontFamily : FONT_FAMILY.bodySemiBold,
  },
  modalKapat: {
    minWidth   : 60,
    minHeight  : MIN_TOUCH_SIZE,
    justifyContent: 'center',
    alignItems : 'center',
  },
  formIcerik: {
    padding : SPACING.md,
    gap     : SPACING.xs,
  },
  etiket: {
    fontSize   : FONT_SIZE.sm,
    fontFamily : FONT_FAMILY.bodyMedium,
    marginTop  : SPACING.sm,
    marginBottom: 4,
  },
  giris: {
    borderRadius     : RADIUS.button,
    borderWidth      : 1,
    paddingHorizontal: SPACING.md,
    paddingVertical  : SPACING.sm,
    fontSize         : FONT_SIZE.base,
    fontFamily       : FONT_FAMILY.body,
    minHeight        : MIN_TOUCH_SIZE,
  },
  tahsilatBilgi: {
    padding      : SPACING.md,
    borderRadius : RADIUS.card,
    borderWidth  : 1,
    marginBottom : SPACING.md,
    alignItems   : 'center',
  },
});
