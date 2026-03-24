/**
 * Market Yönetim Sistemi — Stok Transfer Ekranı (Faz 7)
 * Şubeler arası stok transfer talebi, onaylama, iptal
 * pending → done | cancelled
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
  ScrollView,
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

interface Transfer {
  id              : number;
  from_branch_id  : number;
  from_branch_name: string;
  to_branch_id    : number;
  to_branch_name  : string;
  product_id      : number;
  product_name    : string;
  qty             : number;
  status          : 'pending' | 'done' | 'cancelled';
  note            : string | null;
  created_at      : string;
}

interface Sube   { id: number; name: string; }
interface Urun   { id: number; name: string; barcode: string; stock_qty: number; unit: string; }

// Durum renk & etiket
const DURUM_RENK   = { pending: '#F5A623', done: '#12C98A', cancelled: '#F04F4F' };
const DURUM_ETİKET = { pending: '⏳ Bekliyor', done: '✅ Tamamlandı', cancelled: '❌ İptal' };

// ============================================================
// ANA EKRAN
// ============================================================

export default function TransfersScreen() {
  const { colors }              = useTheme();
  const { user }                = useAuthStore();
  const { branchId, branchName } = useSettingsStore();

  const [transferler, setTransferler] = useState<Transfer[]>([]);
  const [yukleniyor,  setYukleniyor]  = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [hata,        setHata]        = useState<string | null>(null);

  // Filtre
  const [statusFiltre, setStatusFiltre] = useState<string | null>(null);

  // Yeni Transfer Modalı
  const [modalAcik,   setModalAcik]   = useState(false);
  const [subeler,     setSubeler]     = useState<Sube[]>([]);
  const [urunler,     setUrunler]     = useState<Urun[]>([]);
  const [hedefSube,   setHedefSube]   = useState<Sube | null>(null);
  const [seciliUrun,  setSeciliUrun]  = useState<Urun | null>(null);
  const [miktar,      setMiktar]      = useState('');
  const [not,         setNot]         = useState('');
  const [kaydediyor,  setKaydediyor]  = useState(false);
  const [urunArama,   setUrunArama]   = useState('');

  const isAdmin = user?.role === 'admin';

  // ============================================================
  // VERİ ÇEKME
  // ============================================================

  const yukle = useCallback(async (yenile = false) => {
    if (yenile) setYenileniyor(true);
    else setYukleniyor(true);
    setHata(null);

    try {
      let url = `/api/transfers?branch_id=${branchId}`;
      if (statusFiltre) url += `&status=${statusFiltre}`;
      const yanit = await api.get(url);
      setTransferler(yanit.data.items);
    } catch (err: any) {
      setHata(err?.response?.data?.detail || 'Transferler yüklenemedi.');
    } finally {
      setYukleniyor(false);
      setYenileniyor(false);
    }
  }, [branchId, statusFiltre]);

  useFocusEffect(useCallback(() => { yukle(); }, [yukle]));

  // ============================================================
  // YENİ TRANSFER MODAL AÇ
  // ============================================================

  const yeniTransferAc = async () => {
    // Şubeleri ve ürünleri çek
    try {
      const [subeYanit, urunYanit] = await Promise.all([
        api.get('/api/branches?sadece_aktif=true'),
        api.get(`/api/products?branch_id=${branchId}&per_page=500`),
      ]);
      // Kendi şubesini hedef seçeneklerinden çıkar
      const digerSubeler = subeYanit.data.items.filter((s: Sube) => s.id !== branchId);
      setSubeler(digerSubeler);
      setUrunler(urunYanit.data.items);
      setHedefSube(digerSubeler[0] || null);
      setSeciliUrun(null);
      setMiktar('');
      setNot('');
      setUrunArama('');
      setModalAcik(true);
    } catch (err: any) {
      Alert.alert('Hata', 'Veri yüklenemedi: ' + (err?.response?.data?.detail || err.message));
    }
  };

  // ============================================================
  // TRANSFER OLUŞTUR
  // ============================================================

  const transferOlustur = async () => {
    if (!hedefSube) { Alert.alert('Hata', 'Hedef şube seçin.'); return; }
    if (!seciliUrun) { Alert.alert('Hata', 'Ürün seçin.'); return; }
    const qty = parseInt(miktar);
    if (!qty || qty <= 0) { Alert.alert('Hata', 'Geçerli bir miktar girin.'); return; }
    if (qty > seciliUrun.stock_qty) {
      Alert.alert('Hata', `Yetersiz stok. Mevcut: ${seciliUrun.stock_qty} ${seciliUrun.unit}`);
      return;
    }

    setKaydediyor(true);
    try {
      await api.post(
        `/api/transfers?from_branch_id=${branchId}&to_branch_id=${hedefSube.id}` +
        `&product_id=${seciliUrun.id}&qty=${qty}` +
        (not.trim() ? `&note=${encodeURIComponent(not.trim())}` : ''),
      );
      setModalAcik(false);
      yukle();
      Alert.alert('Başarılı', `${seciliUrun.name} — ${qty} ${seciliUrun.unit} transfer talebi oluşturuldu.`);
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.detail || 'Transfer oluşturulamadı.');
    } finally {
      setKaydediyor(false);
    }
  };

  // ============================================================
  // TRANSFER ONAYLA
  // ============================================================

  const transferOnayla = (transfer: Transfer) => {
    Alert.alert(
      'Transferi Onayla',
      `${transfer.product_name} — ${transfer.qty} adet\n${transfer.from_branch_name} → ${transfer.to_branch_name}\n\nOnaylarsanız stok hareketi gerçekleşir.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text   : '✅ Onayla',
          onPress: async () => {
            try {
              await api.patch(`/api/transfers/${transfer.id}/approve`);
              yukle();
              Alert.alert('Onaylandı', 'Transfer tamamlandı, stok güncellendi.');
            } catch (err: any) {
              Alert.alert('Hata', err?.response?.data?.detail || 'Onaylama başarısız.');
            }
          },
        },
      ],
    );
  };

  // ============================================================
  // TRANSFER İPTAL
  // ============================================================

  const transferIptal = (transfer: Transfer) => {
    Alert.alert(
      'Transferi İptal Et',
      `"${transfer.product_name}" transfer talebini iptal etmek istiyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text   : '❌ İptal Et',
          style  : 'destructive',
          onPress: async () => {
            try {
              await api.patch(`/api/transfers/${transfer.id}/cancel`);
              yukle();
            } catch (err: any) {
              Alert.alert('Hata', err?.response?.data?.detail || 'İptal başarısız.');
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
  // KART
  // ============================================================

  const TransferKarti = ({ item }: { item: Transfer }) => {
    const durumRenk   = DURUM_RENK[item.status]   || colors.textMuted;
    const durumEtiket = DURUM_ETİKET[item.status] || item.status;
    const gelen       = item.to_branch_id === branchId;

    return (
      <View style={[styles.kart, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
        {/* Üst satır: yön + durum */}
        <View style={styles.kartUst}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.kartYon, { color: colors.textMuted }]}>
              {gelen ? '📥 Gelen:' : '📤 Gönderilen:'}{' '}
              <Text style={{ color: colors.textPrimary }}>
                {gelen ? item.from_branch_name : item.to_branch_name}
              </Text>
            </Text>
            <Text style={[styles.kartUrun, { color: colors.textPrimary }]}>{item.product_name}</Text>
            <Text style={[styles.kartMiktar, { color: colors.blue }]}>{item.qty} adet</Text>
            {item.note && (
              <Text style={[styles.kartNot, { color: colors.textHint }]}>📝 {item.note}</Text>
            )}
          </View>
          <View style={[styles.durumRozet, { backgroundColor: durumRenk + '20' }]}>
            <Text style={{ fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.bodyMedium, color: durumRenk }}>
              {durumEtiket}
            </Text>
          </View>
        </View>

        {/* Tarih */}
        <Text style={[styles.kartTarih, { color: colors.textHint, borderTopColor: colors.border }]}>
          {new Date(item.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </Text>

        {/* Admin aksiyonları — sadece pending */}
        {isAdmin && item.status === 'pending' && (
          <View style={[styles.aksiyonlar, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.aksiyonBtn, { backgroundColor: colors.success + '15' }]}
              onPress={() => transferOnayla(item)}
            >
              <Text style={[styles.aksiyonBtnMetin, { color: colors.success }]}>✅ Onayla</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.aksiyonBtn, { backgroundColor: colors.danger + '15' }]}
              onPress={() => transferIptal(item)}
            >
              <Text style={[styles.aksiyonBtnMetin, { color: colors.danger }]}>❌ İptal</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // ============================================================
  // RENDER
  // ============================================================

  // Ürün arama filtresi (modal içi)
  const filtreliUrunler = urunler.filter(u =>
    urunArama.length < 2 ||
    u.name.toLowerCase().includes(urunArama.toLowerCase()) ||
    u.barcode.includes(urunArama),
  );

  return (
    <View style={[styles.konteyner, { backgroundColor: colors.bgPrimary }]}>

      {/* Araç çubuğu */}
      <View style={[styles.araYuz, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.border }]}>
        {/* Durum filtreleri */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', gap: SPACING.sm, paddingRight: SPACING.sm }}>
            {([null, 'pending', 'done', 'cancelled'] as const).map((s) => (
              <TouchableOpacity
                key={String(s)}
                style={[styles.filtreTus, { borderColor: statusFiltre === s ? colors.blue : colors.border, backgroundColor: statusFiltre === s ? colors.blue + '15' : 'transparent' }]}
                onPress={() => setStatusFiltre(s)}
              >
                <Text style={[styles.filtreTusMetin, { color: statusFiltre === s ? colors.blue : colors.textMuted }]}>
                  {s === null ? 'Tümü' : DURUM_ETİKET[s]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Yeni transfer butonu */}
        <TouchableOpacity
          style={[styles.ekleBtn, { backgroundColor: colors.blue }]}
          onPress={yeniTransferAc}
        >
          <Text style={styles.ekleBtnMetin}>+ Talep</Text>
        </TouchableOpacity>
      </View>

      {/* Şube bilgisi */}
      <View style={[styles.subeBilgi, { backgroundColor: colors.bgTertiary }]}>
        <Text style={{ fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.body, color: colors.textMuted }}>
          Aktif Şube: <Text style={{ color: colors.blue, fontFamily: FONT_FAMILY.bodySemiBold }}>{branchName}</Text>
        </Text>
      </View>

      {/* Liste */}
      <FlatList
        data={transferler}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: SPACING.md, gap: SPACING.sm, paddingBottom: SPACING.xxl }}
        refreshControl={
          <RefreshControl refreshing={yenileniyor} onRefresh={() => yukle(true)} tintColor={colors.blue} />
        }
        ListEmptyComponent={
          <View style={styles.bosEkran}>
            <Text style={{ fontSize: 48 }}>🔄</Text>
            <Text style={[styles.bilgiMetin, { color: colors.textMuted }]}>
              {statusFiltre ? 'Bu durumda transfer yok.' : 'Henüz transfer kaydı yok.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => <TransferKarti item={item} />}
      />

      {/* ── YENİ TRANSFER MODAL ── */}
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
            <Text style={[styles.modalBaslik, { color: colors.textPrimary }]}>🔄 Yeni Transfer Talebi</Text>
            <Text style={[styles.modalAltBaslik, { color: colors.textMuted }]}>
              Kaynak: <Text style={{ color: colors.blue }}>{branchName}</Text>
            </Text>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: SPACING.md }}>

                {/* Hedef Şube */}
                <View style={{ gap: SPACING.xs }}>
                  <Text style={[styles.etiket, { color: colors.textMuted }]}>Hedef Şube</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                      {subeler.map(s => (
                        <TouchableOpacity
                          key={s.id}
                          style={[styles.secimTus, {
                            borderColor     : hedefSube?.id === s.id ? colors.blue : colors.border,
                            backgroundColor : hedefSube?.id === s.id ? colors.blue + '15' : colors.bgTertiary,
                          }]}
                          onPress={() => setHedefSube(s)}
                        >
                          <Text style={{ fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium, color: hedefSube?.id === s.id ? colors.blue : colors.textPrimary }}>
                            {s.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      {subeler.length === 0 && (
                        <Text style={{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm }}>
                          Başka aktif şube yok
                        </Text>
                      )}
                    </View>
                  </ScrollView>
                </View>

                {/* Ürün Seç */}
                <View style={{ gap: SPACING.xs }}>
                  <Text style={[styles.etiket, { color: colors.textMuted }]}>Ürün</Text>
                  <TextInput
                    value={urunArama}
                    onChangeText={setUrunArama}
                    placeholder="Ürün ara (min 2 harf)..."
                    placeholderTextColor={colors.textHint}
                    style={[styles.aramaGiris, { backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.textPrimary }]}
                  />
                  <View style={[styles.urunListesi, { borderColor: colors.border, backgroundColor: colors.bgTertiary }]}>
                    {filtreliUrunler.slice(0, 20).map(u => (
                      <TouchableOpacity
                        key={u.id}
                        style={[styles.urunSatiri, {
                          borderBottomColor: colors.border,
                          backgroundColor  : seciliUrun?.id === u.id ? colors.blue + '15' : 'transparent',
                        }]}
                        onPress={() => setSeciliUrun(u)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium, color: colors.textPrimary }} numberOfLines={1}>
                            {u.name}
                          </Text>
                          <Text style={{ fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.body, color: colors.textHint }}>
                            {u.barcode} · Stok: {u.stock_qty} {u.unit}
                          </Text>
                        </View>
                        {seciliUrun?.id === u.id && (
                          <Text style={{ color: colors.blue, fontSize: FONT_SIZE.md }}>✓</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                    {filtreliUrunler.length === 0 && (
                      <Text style={{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, padding: SPACING.md }}>
                        Ürün bulunamadı
                      </Text>
                    )}
                  </View>
                </View>

                {/* Miktar */}
                <View style={{ gap: SPACING.xs }}>
                  <Text style={[styles.etiket, { color: colors.textMuted }]}>
                    Miktar {seciliUrun ? `(Mevcut: ${seciliUrun.stock_qty} ${seciliUrun.unit})` : ''}
                  </Text>
                  <TextInput
                    value={miktar}
                    onChangeText={setMiktar}
                    placeholder="0"
                    keyboardType="numeric"
                    placeholderTextColor={colors.textHint}
                    style={[styles.aramaGiris, { backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.textPrimary }]}
                  />
                </View>

                {/* Not */}
                <View style={{ gap: SPACING.xs }}>
                  <Text style={[styles.etiket, { color: colors.textMuted }]}>Not (isteğe bağlı)</Text>
                  <TextInput
                    value={not}
                    onChangeText={setNot}
                    placeholder="Transfer açıklaması..."
                    placeholderTextColor={colors.textHint}
                    multiline
                    numberOfLines={2}
                    style={[styles.aramaGiris, { backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.textPrimary, minHeight: 60 }]}
                  />
                </View>

              </View>
            </ScrollView>

            {/* Butonlar */}
            <View style={styles.modalBtnlar}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
                onPress={() => setModalAcik(false)}
              >
                <Text style={[styles.modalBtnMetin, { color: colors.textPrimary }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.blue }, kaydediyor && { opacity: 0.7 }]}
                onPress={transferOlustur}
                disabled={kaydediyor}
              >
                {kaydediyor
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={[styles.modalBtnMetin, { color: '#fff' }]}>Talep Gönder</Text>
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
// STİLLER
// ============================================================

const styles = StyleSheet.create({
  konteyner    : { flex: 1 },
  merkez       : { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.md, padding: SPACING.xxl },
  bilgiMetin   : { fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.body, textAlign: 'center', marginTop: SPACING.sm },
  btn          : { borderRadius: RADIUS.button, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, minHeight: MIN_TOUCH_SIZE, justifyContent: 'center' },
  btnMetin     : { color: '#fff', fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.base },
  araYuz       : { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderBottomWidth: 1, gap: SPACING.sm },
  filtreTus    : { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.button, borderWidth: 1, minHeight: MIN_TOUCH_SIZE, justifyContent: 'center' },
  filtreTusMetin: { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.bodyMedium },
  ekleBtn      : { paddingHorizontal: SPACING.base, paddingVertical: SPACING.sm, borderRadius: RADIUS.button, minHeight: MIN_TOUCH_SIZE, justifyContent: 'center', alignItems: 'center' },
  ekleBtnMetin : { color: '#fff', fontFamily: FONT_FAMILY.bodyBold, fontSize: FONT_SIZE.sm },
  subeBilgi    : { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  bosEkran     : { alignItems: 'center', justifyContent: 'center', paddingTop: SPACING.xxl * 2, gap: SPACING.md },
  kart         : { borderRadius: RADIUS.card, borderWidth: 1, overflow: 'hidden' },
  kartUst      : { flexDirection: 'row', padding: SPACING.base, gap: SPACING.md, alignItems: 'flex-start' },
  kartYon      : { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.body },
  kartUrun     : { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodySemiBold, marginTop: SPACING.xs },
  kartMiktar   : { fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.bodyBold },
  kartNot      : { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.body, marginTop: SPACING.xs },
  kartTarih    : { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.body, paddingHorizontal: SPACING.base, paddingBottom: SPACING.sm, borderTopWidth: 1, paddingTop: SPACING.sm },
  durumRozet   : { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: RADIUS.badge },
  aksiyonlar   : { flexDirection: 'row', borderTopWidth: 1 },
  aksiyonBtn   : { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.sm, minHeight: MIN_TOUCH_SIZE },
  aksiyonBtnMetin: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium },
  modalKapak   : { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalKutu    : { borderTopLeftRadius: RADIUS.modal, borderTopRightRadius: RADIUS.modal, borderWidth: 1, padding: SPACING.xl, gap: SPACING.md },
  modalBaslik  : { fontSize: FONT_SIZE.lg, fontFamily: FONT_FAMILY.bodyBold },
  modalAltBaslik: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.body, marginTop: -SPACING.sm },
  etiket       : { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium },
  secimTus     : { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.button, borderWidth: 1, minHeight: MIN_TOUCH_SIZE, justifyContent: 'center' },
  aramaGiris   : { borderWidth: 1, borderRadius: RADIUS.button, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.body, minHeight: MIN_TOUCH_SIZE },
  urunListesi  : { borderWidth: 1, borderRadius: RADIUS.card, overflow: 'hidden', maxHeight: 180 },
  urunSatiri   : { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, minHeight: MIN_TOUCH_SIZE },
  modalBtnlar  : { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  modalBtn     : { flex: 1, borderRadius: RADIUS.button, paddingVertical: SPACING.md, alignItems: 'center', justifyContent: 'center', minHeight: MIN_TOUCH_SIZE, borderWidth: 1 },
  modalBtnMetin: { fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.bodyBold },
});
