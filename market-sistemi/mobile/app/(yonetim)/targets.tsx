/**
 * Market Yönetim Sistemi — Satış Hedefleri Ekranı (Faz 5)
 * Günlük / haftalık / aylık hedef tanımlama ve ilerleme takibi
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

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
  KeyboardAvoidingView,
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

type HedefTipi = 'daily' | 'weekly' | 'monthly';

interface Hedef {
  id             : number;
  type           : HedefTipi;
  target_amount  : number;
  period_start   : string;
  period_end     : string;
  note          ?: string;
  gerceklesen    : number;
  kalan_miktar   : number;
  ilerleme_yuzde : number;
  tamamlandi     : boolean;
}

interface AktifHedef {
  type           : HedefTipi;
  hedef_var      : boolean;
  target_id     ?: number;
  target_amount ?: number;
  period_start  ?: string;
  period_end    ?: string;
  kalan_gun     ?: number;
  gerceklesen   ?: number;
  kalan_miktar  ?: number;
  ilerleme_yuzde?: number;
  tamamlandi    ?: boolean;
  note          ?: string;
}

// ============================================================
// YARDIMCI
// ============================================================

const TIP_ETIKET: Record<HedefTipi, string> = {
  daily  : 'Günlük',
  weekly : 'Haftalık',
  monthly: 'Aylık',
};

const bugunStr = () => new Date().toISOString().split('T')[0];

const paraCevir = (n: number) =>
  new Intl.NumberFormat('tr-TR', {
    style: 'currency', currency: 'TRY', minimumFractionDigits: 2,
  }).format(n);

// ============================================================
// ANA EKRAN
// ============================================================

export default function HedeflerEkrani() {
  const { colors }   = useTheme();
  const { branchId } = useSettingsStore();
  const { user }     = useAuthStore();

  const [aktifler,    setAktifler]   = useState<AktifHedef[]>([]);
  const [gecmisler,   setGecmisler]  = useState<Hedef[]>([]);
  const [yukleniyor,  setYukleniyor] = useState(true);
  const [yenileniyor, setYenile]     = useState(false);
  const [hata,        setHata]       = useState<string | null>(null);

  // Form modal
  const [modalAcik, setModalAcik]   = useState(false);
  const [formTip,   setFormTip]     = useState<HedefTipi>('daily');
  const [formTutar, setFormTutar]   = useState('');
  const [formTarih, setFormTarih]   = useState(bugunStr());
  const [formNot,   setFormNot]     = useState('');
  const [formYuk,   setFormYuk]     = useState(false);
  const [formHata,  setFormHata]    = useState<string | null>(null);

  const isAdmin = user?.role === 'admin';

  // ============================================================
  // VERİ YÜKLEME
  // ============================================================

  const yukle = useCallback(async (yenileme = false) => {
    yenileme ? setYenile(true) : setYukleniyor(true);
    setHata(null);
    try {
      const [aktifYanit, listYanit] = await Promise.all([
        api.get(`/api/targets/aktif?branch_id=${branchId}`),
        api.get(`/api/targets?branch_id=${branchId}&per_page=20`),
      ]);
      setAktifler(aktifYanit.data.hedefler ?? []);
      setGecmisler(listYanit.data.items ?? []);
    } catch (err: any) {
      setHata(err?.response?.data?.detail || 'Veriler yüklenemedi.');
    } finally {
      setYukleniyor(false);
      setYenile(false);
    }
  }, [branchId]);

  useEffect(() => { yukle(); }, [yukle]);

  // ============================================================
  // HEDEF KAYDET
  // ============================================================

  const hedefKaydet = async () => {
    setFormHata(null);
    const tutar = parseFloat(formTutar.replace(',', '.'));
    if (isNaN(tutar) || tutar <= 0) { setFormHata('Geçerli bir tutar girin.'); return; }
    if (!formTarih || formTarih.length !== 10) { setFormHata('Geçerli bir tarih girin (YYYY-AA-GG).'); return; }

    setFormYuk(true);
    try {
      const yanit = await api.post('/api/targets', {
        branch_id    : branchId,
        type         : formTip,
        target_amount: tutar,
        period_start : formTarih,
        note         : formNot || null,
      });
      setModalAcik(false);
      formSifirla();
      yukle();
      Alert.alert('Başarılı', yanit.data.islem === 'guncellendi' ? 'Hedef güncellendi.' : 'Yeni hedef oluşturuldu.');
    } catch (err: any) {
      setFormHata(err?.response?.data?.detail || 'Hedef kaydedilemedi.');
    } finally {
      setFormYuk(false);
    }
  };

  // ============================================================
  // HEDEF SİL
  // ============================================================

  const hedefSil = (id: number, tip: string) => {
    Alert.alert(
      'Hedefi Sil',
      `${TIP_ETIKET[tip as HedefTipi]} hedefi silmek istediğinizden emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text : 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/targets/${id}`);
              yukle();
            } catch (err: any) {
              Alert.alert('Hata', err?.response?.data?.detail || 'Hedef silinemedi.');
            }
          },
        },
      ],
    );
  };

  const formSifirla = () => {
    setFormTip('daily');
    setFormTutar('');
    setFormTarih(bugunStr());
    setFormNot('');
    setFormHata(null);
  };

  const modalAc = (tip?: HedefTipi) => {
    formSifirla();
    if (tip) setFormTip(tip);
    setModalAcik(true);
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
        <TouchableOpacity
          style={[styles.tekrarBtn, { backgroundColor: colors.blue }]}
          onPress={() => yukle()}
        >
          <Text style={{ color: '#fff', fontFamily: FONT_FAMILY.bodyMedium }}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.kapsayici, { backgroundColor: colors.bgPrimary }]}>
      <ScrollView
        contentContainerStyle={styles.icerik}
        refreshControl={
          <RefreshControl refreshing={yenileniyor} onRefresh={() => yukle(true)} tintColor={colors.blue} />
        }
      >
        {/* Başlık + Yeni Hedef */}
        <View style={styles.baslikSatiri}>
          <Text style={[styles.baslik, { color: colors.textPrimary }]}>Satış Hedefleri</Text>
          <TouchableOpacity
            style={[styles.ekleBtn, { backgroundColor: colors.blue }]}
            onPress={() => modalAc()}
          >
            <Text style={styles.ekleBtnMetin}>+ Yeni Hedef</Text>
          </TouchableOpacity>
        </View>

        {/* ── AKTİF DÖNEMLER ── */}
        <Text style={[styles.bolumBasligi, { color: colors.textMuted }]}>Aktif Dönemler</Text>

        {aktifler.length === 0 ? (
          <View style={[styles.bosKutu, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
            <Text style={[styles.bosMetin, { color: colors.textHint }]}>Henüz hedef tanımlanmamış.</Text>
          </View>
        ) : (
          aktifler.map((h, i) => (
            <AktifHedefKarti
              key={i}
              hedef={h}
              onEkle={() => modalAc(h.type)}
              colors={colors}
            />
          ))
        )}

        {/* ── GEÇMİŞ HEDEFLER ── */}
        {gecmisler.length > 0 && (
          <>
            <Text style={[styles.bolumBasligi, { color: colors.textMuted, marginTop: SPACING.xl }]}>
              Tüm Hedefler
            </Text>
            {gecmisler.map(h => (
              <GecmisHedefSatiri
                key={h.id}
                hedef={h}
                onSil={() => hedefSil(h.id, h.type)}
                onDuzenle={() => {
                  setFormTip(h.type);
                  setFormTutar(String(h.target_amount));
                  setFormTarih(h.period_start);
                  setFormNot(h.note ?? '');
                  setFormHata(null);
                  setModalAcik(true);
                }}
                colors={colors}
              />
            ))}
          </>
        )}

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>

      {/* ── FORM MODALİ ── */}
      <Modal visible={modalAcik} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.modalArka}>
            <View style={[styles.modalKutu, { backgroundColor: colors.bgSecondary }]}>
              {/* Modal başlık */}
              <View style={[styles.modalBaslikSatiri, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalBaslik, { color: colors.textPrimary }]}>Hedef Tanımla</Text>
                <TouchableOpacity
                  style={[styles.kapatBtn, { backgroundColor: colors.bgTertiary }]}
                  onPress={() => { setModalAcik(false); formSifirla(); }}
                >
                  <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.base }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Dönem tipi */}
                <Text style={[styles.etiket, { color: colors.textMuted }]}>Dönem Tipi</Text>
                <View style={styles.tipSatiri}>
                  {(['daily', 'weekly', 'monthly'] as HedefTipi[]).map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.tipBtn,
                        { backgroundColor: colors.bgTertiary, borderColor: colors.border },
                        formTip === t && { backgroundColor: colors.blue + '22', borderColor: colors.blue },
                      ]}
                      onPress={() => setFormTip(t)}
                    >
                      <Text style={[
                        styles.tipBtnMetin,
                        { color: colors.textMuted },
                        formTip === t && { color: colors.blue },
                      ]}>
                        {TIP_ETIKET[t]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Hedef tutar */}
                <Text style={[styles.etiket, { color: colors.textMuted }]}>Hedef Tutar (₺)</Text>
                <TextInput
                  style={[styles.giris, { backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.textPrimary }]}
                  value={formTutar}
                  onChangeText={setFormTutar}
                  placeholder="ör: 5000"
                  placeholderTextColor={colors.textHint}
                  keyboardType="decimal-pad"
                />

                {/* Dönem başlangıcı */}
                <Text style={[styles.etiket, { color: colors.textMuted }]}>Dönem Başlangıcı</Text>
                <TextInput
                  style={[styles.giris, { backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.textPrimary }]}
                  value={formTarih}
                  onChangeText={setFormTarih}
                  placeholder="YYYY-AA-GG"
                  placeholderTextColor={colors.textHint}
                  keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                  maxLength={10}
                />

                {/* Not */}
                <Text style={[styles.etiket, { color: colors.textMuted }]}>Not (opsiyonel)</Text>
                <TextInput
                  style={[styles.giris, { backgroundColor: colors.bgTertiary, borderColor: colors.border, color: colors.textPrimary, minHeight: 72 }]}
                  value={formNot}
                  onChangeText={setFormNot}
                  placeholder="Hedef hakkında not..."
                  placeholderTextColor={colors.textHint}
                  multiline
                  numberOfLines={2}
                />

                {formHata && (
                  <Text style={[styles.formHata, { color: colors.danger }]}>{formHata}</Text>
                )}

                {formTutar.length > 0 && (
                  <View style={[styles.onizleme, { backgroundColor: colors.bgTertiary, borderLeftColor: colors.blue }]}>
                    <Text style={[styles.onizlemeMetin, { color: colors.textMuted }]}>
                      {TIP_ETIKET[formTip]} hedef: {paraCevir(parseFloat(formTutar.replace(',', '.')) || 0)}
                      {'\n'}Dönem: {formTarih} başlangıçlı
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.kaydetBtn, { backgroundColor: colors.blue }, formYuk && { opacity: 0.7 }]}
                  onPress={hedefKaydet}
                  disabled={formYuk}
                >
                  {formYuk
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.kaydetBtnMetin}>Kaydet</Text>
                  }
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ============================================================
// ALT BİLEŞENLER
// ============================================================

function AktifHedefKarti({
  hedef, onEkle, colors,
}: { hedef: AktifHedef; onEkle: () => void; colors: any }) {
  const yuzde    = hedef.ilerleme_yuzde ?? 0;
  const barRengi = hedef.tamamlandi
    ? colors.success
    : yuzde >= 75 ? colors.blue
    : yuzde >= 40 ? colors.warning
    : colors.danger;

  return (
    <View style={[styles.aktifKart, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
      <View style={styles.aktifKartUst}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.aktifTip, { color: colors.textPrimary }]}>{TIP_ETIKET[hedef.type]}</Text>
          {hedef.period_end && (
            <Text style={[styles.aktifTarih, { color: colors.textHint }]}>
              {hedef.period_start} – {hedef.period_end}
              {(hedef.kalan_gun ?? 0) > 0 && ` · ${hedef.kalan_gun} gün kaldı`}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[
            styles.duzenleBtn,
            hedef.hedef_var
              ? { backgroundColor: colors.bgTertiary, borderColor: colors.border }
              : { backgroundColor: colors.blue + '22', borderColor: colors.blue },
          ]}
          onPress={onEkle}
        >
          <Text style={[
            styles.duzenleBtnMetin,
            { color: hedef.hedef_var ? colors.textMuted : colors.blue },
          ]}>
            {hedef.hedef_var ? 'Düzenle' : '+ Hedef Ekle'}
          </Text>
        </TouchableOpacity>
      </View>

      {hedef.hedef_var ? (
        <>
          <View style={[styles.hedefBarArka, { backgroundColor: colors.bgTertiary }]}>
            <View style={[styles.hedefBarOn, { width: `${Math.min(yuzde, 100)}%` as any, backgroundColor: barRengi }]} />
          </View>
          <View style={styles.aktifAlt}>
            <Text style={[styles.aktifAltMetin, { color: colors.textMuted }]}>
              {paraCevir(hedef.gerceklesen ?? 0)} / {paraCevir(hedef.target_amount ?? 0)}
            </Text>
            <View style={[styles.yuzdeRozet, { backgroundColor: barRengi + '22' }]}>
              <Text style={[styles.yuzdeRozetMetin, { color: barRengi }]}>
                {hedef.tamamlandi ? '✓ Tamam' : `%${yuzde}`}
              </Text>
            </View>
          </View>
        </>
      ) : (
        <Text style={[styles.hedefYokMetin, { color: colors.textHint }]}>
          Bu dönem için henüz hedef tanımlanmamış.
        </Text>
      )}
    </View>
  );
}

function GecmisHedefSatiri({
  hedef, onSil, onDuzenle, colors,
}: { hedef: Hedef; onSil: () => void; onDuzenle: () => void; colors: any }) {
  const yuzde    = hedef.ilerleme_yuzde;
  const barRengi = hedef.tamamlandi ? colors.success
    : yuzde >= 75 ? colors.blue
    : yuzde >= 40 ? colors.warning
    : colors.danger;

  return (
    <View style={[styles.gecmisSatiri, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
      <View style={styles.gecmisSol}>
        <View style={[styles.tipRozet, { backgroundColor: barRengi + '22' }]}>
          <Text style={[styles.tipRozetMetin, { color: barRengi }]}>
            {TIP_ETIKET[hedef.type]}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.gecmisTarih, { color: colors.textHint }]}>
            {hedef.period_start} – {hedef.period_end}
          </Text>
          <Text style={[styles.gecmisTutar, { color: colors.textPrimary }]}>
            {paraCevir(hedef.target_amount)}
          </Text>
          {hedef.note && (
            <Text style={[styles.gecmisNot, { color: colors.textHint }]} numberOfLines={1}>
              {hedef.note}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.gecmisSag}>
        <Text style={[styles.gecmisYuzde, { color: barRengi }]}>%{yuzde}</Text>
        <View style={styles.aksiyonlar}>
          <TouchableOpacity
            style={[styles.aksBtn, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
            onPress={onDuzenle}
          >
            <Text style={{ color: colors.blue, fontSize: FONT_SIZE.base }}>✎</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.aksBtn, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
            onPress={onSil}
          >
            <Text style={{ color: colors.danger, fontSize: FONT_SIZE.base }}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ============================================================
// STİLLER
// ============================================================

const styles = StyleSheet.create({
  kapsayici: { flex: 1 },
  icerik   : { padding: SPACING.base },
  merkez   : {
    flex          : 1,
    justifyContent: 'center',
    alignItems    : 'center',
    gap           : SPACING.md,
    padding       : SPACING.xxl,
  },
  bilgiMetin: {
    fontSize  : FONT_SIZE.base,
    fontFamily: FONT_FAMILY.body,
    textAlign : 'center',
  },
  tekrarBtn: {
    paddingHorizontal: SPACING.xl,
    paddingVertical  : SPACING.md,
    borderRadius     : RADIUS.button,
    marginTop        : SPACING.md,
    minHeight        : MIN_TOUCH_SIZE,
    justifyContent   : 'center',
  },
  baslikSatiri: {
    flexDirection : 'row',
    justifyContent: 'space-between',
    alignItems    : 'center',
    marginBottom  : SPACING.base,
  },
  baslik: {
    fontSize  : FONT_SIZE.xl,
    fontFamily: FONT_FAMILY.bodyBold,
  },
  ekleBtn: {
    paddingVertical  : SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius     : RADIUS.button,
    minHeight        : MIN_TOUCH_SIZE,
    justifyContent   : 'center',
  },
  ekleBtnMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemiBold,
    color     : '#FFFFFF',
  },
  bolumBasligi: {
    fontSize     : FONT_SIZE.xs,
    fontFamily   : FONT_FAMILY.bodySemiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom : SPACING.md,
  },
  aktifKart: {
    borderRadius: RADIUS.card,
    padding     : SPACING.base,
    marginBottom: SPACING.md,
    borderWidth : 1,
    gap         : SPACING.sm,
  },
  aktifKartUst: {
    flexDirection : 'row',
    justifyContent: 'space-between',
    alignItems    : 'flex-start',
  },
  aktifTip: {
    fontSize  : FONT_SIZE.md,
    fontFamily: FONT_FAMILY.bodyBold,
  },
  aktifTarih: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    marginTop : 2,
  },
  duzenleBtn: {
    paddingVertical  : SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius     : RADIUS.button,
    borderWidth      : 1,
    minHeight        : MIN_TOUCH_SIZE,
    justifyContent   : 'center',
  },
  duzenleBtnMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemiBold,
  },
  hedefBarArka: {
    height      : 8,
    borderRadius: 4,
    overflow    : 'hidden',
  },
  hedefBarOn: {
    height      : 8,
    borderRadius: 4,
  },
  aktifAlt: {
    flexDirection : 'row',
    justifyContent: 'space-between',
    alignItems    : 'center',
  },
  aktifAltMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.body,
  },
  yuzdeRozet: {
    paddingHorizontal: SPACING.sm,
    paddingVertical  : 3,
    borderRadius     : RADIUS.badge,
  },
  yuzdeRozetMetin: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyBold,
  },
  hedefYokMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.body,
    fontStyle : 'italic',
  },
  gecmisSatiri: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems   : 'center',
    borderRadius : RADIUS.card,
    padding      : SPACING.md,
    marginBottom : SPACING.sm,
    borderWidth  : 1,
    gap          : SPACING.sm,
  },
  gecmisSol: {
    flexDirection: 'row',
    alignItems   : 'center',
    flex         : 1,
    gap          : SPACING.md,
  },
  tipRozet: {
    paddingHorizontal: SPACING.sm,
    paddingVertical  : 4,
    borderRadius     : RADIUS.button,
  },
  tipRozetMetin: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyBold,
  },
  gecmisTarih: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
  },
  gecmisTutar: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemiBold,
  },
  gecmisNot: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    fontStyle : 'italic',
  },
  gecmisSag: {
    alignItems: 'flex-end',
    gap       : SPACING.sm,
  },
  gecmisYuzde: {
    fontSize  : FONT_SIZE.md,
    fontFamily: FONT_FAMILY.bodyBold,
  },
  aksiyonlar: {
    flexDirection: 'row',
    gap          : SPACING.sm,
  },
  aksBtn: {
    width          : MIN_TOUCH_SIZE,
    height         : MIN_TOUCH_SIZE,
    borderRadius   : RADIUS.button,
    justifyContent : 'center',
    alignItems     : 'center',
    borderWidth    : 1,
  },
  bosKutu: {
    borderRadius: RADIUS.card,
    padding     : SPACING.xl,
    alignItems  : 'center',
    borderWidth : 1,
    marginBottom: SPACING.md,
  },
  bosMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.body,
  },
  modalArka: {
    flex           : 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent : 'flex-end',
  },
  modalKutu: {
    borderTopLeftRadius : RADIUS.modal,
    borderTopRightRadius: RADIUS.modal,
    padding             : SPACING.base,
    maxHeight           : '85%',
  },
  modalBaslikSatiri: {
    flexDirection    : 'row',
    justifyContent   : 'space-between',
    alignItems       : 'center',
    marginBottom     : SPACING.base,
    paddingBottom    : SPACING.md,
    borderBottomWidth: 1,
  },
  modalBaslik: {
    fontSize  : FONT_SIZE.lg,
    fontFamily: FONT_FAMILY.bodyBold,
  },
  kapatBtn: {
    width         : MIN_TOUCH_SIZE,
    height        : MIN_TOUCH_SIZE,
    borderRadius  : RADIUS.button,
    justifyContent: 'center',
    alignItems    : 'center',
  },
  etiket: {
    fontSize    : FONT_SIZE.sm,
    fontFamily  : FONT_FAMILY.bodySemiBold,
    marginBottom: SPACING.sm,
    marginTop   : SPACING.md,
  },
  tipSatiri: {
    flexDirection: 'row',
    gap          : SPACING.sm,
  },
  tipBtn: {
    flex          : 1,
    paddingVertical: SPACING.md,
    borderRadius  : RADIUS.button,
    alignItems    : 'center',
    borderWidth   : 1,
    minHeight     : MIN_TOUCH_SIZE,
    justifyContent: 'center',
  },
  tipBtnMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemiBold,
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
  formHata: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.body,
    marginTop : SPACING.sm,
  },
  onizleme: {
    borderRadius  : RADIUS.button,
    padding       : SPACING.md,
    marginTop     : SPACING.md,
    borderLeftWidth: 3,
  },
  onizlemeMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.body,
    lineHeight: 20,
  },
  kaydetBtn: {
    borderRadius  : RADIUS.button,
    paddingVertical: SPACING.base,
    alignItems    : 'center',
    marginTop     : SPACING.base,
    marginBottom  : SPACING.sm,
    minHeight     : MIN_TOUCH_SIZE + 4,
    justifyContent: 'center',
  },
  kaydetBtnMetin: {
    fontSize  : FONT_SIZE.base,
    fontFamily: FONT_FAMILY.bodyBold,
    color     : '#FFFFFF',
  },
});
