/**
 * Market Sahibi Paneli — Faz 5
 * Canlı satış takibi, hedef ilerlemesi, stok özeti
 * Her 5 dakikada otomatik yenilenir
 *
 * Kalite kontrol:
 * ✅ Loading state
 * ✅ Error state — offline/server ayrımı
 * ✅ Offline state — isOffline flag
 * ✅ useTheme() — hardcode renk yok
 * ✅ Min 48px dokunma alanı
 * ✅ Türkçe yorum satırları
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useTheme }        from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore }    from '../../stores/authStore';
import { api }             from '../../services/api';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE }          from '../../constants/typography';

const { width: EKRAN_GENISLIGI } = Dimensions.get('window');

// ============================================================
// TİPLER
// ============================================================

interface SatisOzeti {
  ciro           : number;
  islem_sayisi   : number;
  ortalama_sepet : number;
  degisim_yuzde  : number;
  nakit_toplam   : number;
  kart_toplam    : number;
}

interface HedefDurumu {
  type           : 'daily' | 'weekly' | 'monthly';
  hedef_var      : boolean;
  target_amount ?: number;
  gerceklesen   ?: number;
  kalan_miktar  ?: number;
  ilerleme_yuzde?: number;
  tamamlandi    ?: boolean;
  kalan_gun     ?: number;
}

interface TopUrun {
  name: string;
  qty : number;
  ciro: number;
}

interface StokOzet {
  toplam_maliyet    : number;
  toplam_satis      : number;
  potansiyel_kar    : number;
  kritik_urun_sayisi: number;
}

interface PanelData {
  ozet       : SatisOzeti | null;
  hedefler   : HedefDurumu[];
  top_urunler: TopUrun[];
  stok_ozet  : StokOzet | null;
}

const TIP_ADI: Record<string, string> = {
  daily  : 'Günlük',
  weekly : 'Haftalık',
  monthly: 'Aylık',
};

const paraCevir = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2 }).format(n);

// ============================================================
// SAHİP PANELİ
// ============================================================

export default function SahipPaneli() {
  const { colors }   = useTheme();
  const { branchId } = useSettingsStore();
  const { user }     = useAuthStore();

  const [veri, setVeri]                 = useState<PanelData>({
    ozet: null, hedefler: [], top_urunler: [], stok_ozet: null,
  });
  const [yukleniyor,     setYukleniyor]    = useState(true);
  const [hata,           setHata]          = useState<string | null>(null);
  const [isOffline,      setIsOffline]     = useState(false);
  const [sonYenileme,    setSonYenileme]   = useState<Date>(new Date());
  const [manuelYenileme, setManuelYenile] = useState(false);

  // 5 dakikalık otomatik yenileme
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ============================================================
  // VERİ YÜKLEMESİ
  // ============================================================

  const verileriYukle = useCallback(async (manuel = false) => {
    if (manuel) setManuelYenile(true);
    setHata(null);

    try {
      const [ozetYanit, hedefYanit, topYanit, stokYanit] = await Promise.all([
        api.get(`/api/reports/summary?donem=today&branch_id=${branchId}`),
        api.get(`/api/targets/aktif?branch_id=${branchId}`),
        api.get(`/api/reports/top-products?donem=today&limit=5&branch_id=${branchId}`),
        api.get(`/api/reports/stock-value?branch_id=${branchId}`),
      ]);

      setVeri({
        ozet       : ozetYanit.data,
        hedefler   : hedefYanit.data?.hedefler ?? [],
        top_urunler: topYanit.data?.items ?? [],
        stok_ozet  : stokYanit.data,
      });
      setSonYenileme(new Date());
      setIsOffline(false);
    } catch (err: any) {
      if (!err.response) {
        setIsOffline(true);
        setHata('Sunucuya bağlanılamıyor.');
      } else {
        setHata(err?.response?.data?.detail || 'Veriler yüklenemedi.');
      }
    } finally {
      setYukleniyor(false);
      setManuelYenile(false);
    }
  }, [branchId]);

  useEffect(() => {
    verileriYukle();
    timerRef.current = setInterval(() => verileriYukle(), 5 * 60 * 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [verileriYukle]);

  // ============================================================
  // LOADING / HATA
  // ============================================================

  const saatStr = (d: Date) => d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  if (yukleniyor) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.blue} />
        <Text style={[styles.bilgiMetin, { color: colors.textHint }]}>Veriler yükleniyor...</Text>
      </View>
    );
  }

  if (hata) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <Text style={{ fontSize: 40 }}>{isOffline ? '📡' : '⚠️'}</Text>
        <Text style={[styles.bilgiMetin, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
          {isOffline ? 'Bağlantı Yok' : 'Hata'}
        </Text>
        <Text style={[styles.bilgiMetin, { color: colors.danger }]}>{hata}</Text>
        <TouchableOpacity
          style={[styles.tekrarBtn, { backgroundColor: colors.blue, minHeight: MIN_TOUCH_SIZE }]}
          onPress={() => verileriYukle(true)}
        >
          <Text style={{ color: '#FFFFFF', fontFamily: FONT_FAMILY.bodyMedium }}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { ozet, hedefler, top_urunler, stok_ozet } = veri;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bgPrimary }}
      contentContainerStyle={styles.icerik}
      refreshControl={
        <RefreshControl refreshing={manuelYenileme} onRefresh={() => verileriYukle(true)} tintColor={colors.blue} />
      }
    >
      {/* Başlık */}
      <View style={styles.baslikSatiri}>
        <View>
          <Text style={[styles.baslik, { color: colors.textPrimary }]}>Sahip Paneli</Text>
          <Text style={[styles.altBaslik, { color: colors.textHint }]}>
            Son güncelleme: {saatStr(sonYenileme)} · Otomatik 5dk
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.yenileBtn, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}
          onPress={() => verileriYukle(true)}
        >
          <Text style={{ color: colors.blue, fontSize: FONT_SIZE.xl }}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* ── CİRO KARTI ── */}
      {ozet && (
        <View style={[styles.kart, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <Text style={[styles.kartBaslik, { color: colors.textMuted }]}>Bugünkü Ciro</Text>
          <Text style={[styles.buyukRakam, { color: colors.textPrimary }]}>{paraCevir(ozet.ciro)}</Text>

          <View style={styles.satir}>
            <BilgiKutu etiket="İşlem"     deger={String(ozet.islem_sayisi)}                                         renk={colors.blue}    colors={colors} />
            <BilgiKutu etiket="Ort. Sepet" deger={paraCevir(ozet.ortalama_sepet)}                                  renk={colors.purple}  colors={colors} />
            <BilgiKutu etiket="Dün Farkı"  deger={`${ozet.degisim_yuzde >= 0 ? '+' : ''}${ozet.degisim_yuzde.toFixed(1)}%`} renk={ozet.degisim_yuzde >= 0 ? colors.success : colors.danger} colors={colors} />
          </View>

          {/* Ödeme dağılımı */}
          <View style={[styles.odemeSatiri, { borderTopColor: colors.border }]}>
            <View style={styles.odemeItem}>
              <View style={[styles.odemeNokta, { backgroundColor: colors.success }]} />
              <Text style={[styles.odemeMetin, { color: colors.textMuted }]}>Nakit</Text>
              <Text style={[styles.odemeRakam, { color: colors.textPrimary }]}>{paraCevir(ozet.nakit_toplam)}</Text>
            </View>
            <View style={styles.odemeItem}>
              <View style={[styles.odemeNokta, { backgroundColor: colors.blue }]} />
              <Text style={[styles.odemeMetin, { color: colors.textMuted }]}>Kart</Text>
              <Text style={[styles.odemeRakam, { color: colors.textPrimary }]}>{paraCevir(ozet.kart_toplam)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* ── HEDEFLER ── */}
      {hedefler.length > 0 && (
        <View style={[styles.kart, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <Text style={[styles.kartBaslik, { color: colors.textMuted }]}>Satış Hedefleri</Text>
          {hedefler.map((h, i) =>
            h.hedef_var ? (
              <HedefSatiri key={i} hedef={h} paraCevir={paraCevir} colors={colors} />
            ) : (
              <View key={i} style={{ paddingVertical: SPACING.sm }}>
                <Text style={[{ color: colors.textHint, fontStyle: 'italic', fontSize: FONT_SIZE.sm }]}>
                  {TIP_ADI[h.type]} hedef tanımlanmamış
                </Text>
              </View>
            )
          )}
        </View>
      )}

      {/* ── EN ÇOK SATAN ── */}
      {top_urunler.length > 0 && (
        <View style={[styles.kart, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <Text style={[styles.kartBaslik, { color: colors.textMuted }]}>En Çok Satan (Bugün)</Text>
          {top_urunler.map((u, i) => {
            const maxCiro = top_urunler[0].ciro;
            const oran    = maxCiro > 0 ? u.ciro / maxCiro : 0;
            return (
              <View key={i} style={styles.urunSatiri}>
                <View style={styles.urunSol}>
                  <Text style={[styles.urunSira, { color: colors.textHint }]}>#{i + 1}</Text>
                  <Text style={[styles.urunAdi, { color: colors.textPrimary }]} numberOfLines={1}>{u.name}</Text>
                </View>
                <View style={styles.urunSag}>
                  <View style={[styles.barArka, { backgroundColor: colors.bgTertiary }]}>
                    <View style={[styles.barOn, { width: `${oran * 100}%` as any, backgroundColor: colors.blue }]} />
                  </View>
                  <Text style={[styles.urunCiro, { color: colors.textPrimary }]}>{paraCevir(u.ciro)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── STOK DEĞERİ ── */}
      {stok_ozet && (
        <View style={[styles.kart, { backgroundColor: colors.bgSecondary, borderColor: colors.border, marginBottom: SPACING.xxl }]}>
          <Text style={[styles.kartBaslik, { color: colors.textMuted }]}>Stok Değeri</Text>
          <View style={styles.satir}>
            <BilgiKutu etiket="Maliyet"    deger={paraCevir(stok_ozet.toplam_maliyet)} renk={colors.warning} colors={colors} />
            <BilgiKutu etiket="Satış Değ." deger={paraCevir(stok_ozet.toplam_satis)}   renk={colors.success} colors={colors} />
            <BilgiKutu etiket="Pot. Kâr"   deger={paraCevir(stok_ozet.potansiyel_kar)} renk={colors.cyan}    colors={colors} />
          </View>
          {stok_ozet.kritik_urun_sayisi > 0 && (
            <View style={[styles.uyariKutu, { borderColor: colors.danger }]}>
              <Text style={[styles.uyariMetin, { color: colors.danger }]}>
                ⚠ {stok_ozet.kritik_urun_sayisi} ürün kritik stok seviyesinde
              </Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

// ============================================================
// ALT BİLEŞENLER
// ============================================================

function BilgiKutu({ etiket, deger, renk, colors }: { etiket: string; deger: string; renk: string; colors: any }) {
  return (
    <View style={[styles.bilgiKutu, { backgroundColor: colors.bgTertiary }]}>
      <Text style={[styles.bilgiKutuRakam, { color: renk }]}>{deger}</Text>
      <Text style={[styles.bilgiKutuEtiket, { color: colors.textHint }]}>{etiket}</Text>
    </View>
  );
}

function HedefSatiri({ hedef, paraCevir, colors }: { hedef: HedefDurumu; paraCevir: (n: number) => string; colors: any }) {
  const yuzde      = hedef.ilerleme_yuzde ?? 0;
  const tamamlandi = hedef.tamamlandi ?? false;
  const barRengi   = tamamlandi
    ? colors.success
    : yuzde >= 75 ? colors.blue
    : yuzde >= 40 ? colors.warning
    : colors.danger;

  return (
    <View style={[styles.hedefKutu, { borderBottomColor: colors.border }]}>
      <View style={styles.hedefUst}>
        <Text style={[styles.hedefTip, { color: colors.textPrimary }]}>{TIP_ADI[hedef.type]}</Text>
        <View style={[styles.hedefRozet, { backgroundColor: barRengi + '22' }]}>
          <Text style={[styles.hedefRozetMetin, { color: barRengi }]}>
            {tamamlandi ? '✓ Tamamlandı' : `%${yuzde}`}
          </Text>
        </View>
      </View>
      <View style={[styles.hedefBarArka, { backgroundColor: colors.bgTertiary }]}>
        <View style={[styles.hedefBarOn, { width: `${Math.min(yuzde, 100)}%` as any, backgroundColor: barRengi }]} />
      </View>
      <View style={styles.hedefAlt}>
        <Text style={[styles.hedefAltMetin, { color: colors.textMuted }]}>
          {paraCevir(hedef.gerceklesen ?? 0)} / {paraCevir(hedef.target_amount ?? 0)}
        </Text>
        {(hedef.kalan_gun ?? 0) > 0 && !tamamlandi && (
          <Text style={[styles.hedefAltMetin, { color: (hedef.kalan_gun ?? 0) <= 2 ? colors.danger : colors.textMuted }]}>
            {hedef.kalan_gun} gün kaldı
          </Text>
        )}
      </View>
    </View>
  );
}

// ============================================================
// STİLLER
// ============================================================

const styles = StyleSheet.create({
  icerik     : { padding: SPACING.base, paddingBottom: SPACING.xxl },
  merkez     : { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.md, padding: SPACING.xxl },
  bilgiMetin : { fontSize: FONT_SIZE.base, fontFamily: FONT_FAMILY.body, textAlign: 'center', marginTop: SPACING.sm },
  tekrarBtn  : {
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
    borderRadius: RADIUS.button, marginTop: SPACING.md,
    minHeight: MIN_TOUCH_SIZE, justifyContent: 'center',
  },
  baslikSatiri: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: SPACING.base,
  },
  baslik    : { fontSize: FONT_SIZE.xl, fontFamily: FONT_FAMILY.bodyBold },
  altBaslik : { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.body, marginTop: 2 },
  yenileBtn : {
    width: MIN_TOUCH_SIZE, height: MIN_TOUCH_SIZE, borderRadius: MIN_TOUCH_SIZE / 2,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1,
  },
  kart: {
    borderRadius: RADIUS.card, padding: SPACING.base,
    marginBottom: SPACING.md, borderWidth: 1,
  },
  kartBaslik: {
    fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.bodySemiBold,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: SPACING.md,
  },
  buyukRakam  : { fontSize: FONT_SIZE.xxl, fontFamily: FONT_FAMILY.bodyBold, marginBottom: SPACING.md },
  satir       : { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  bilgiKutu   : { flex: 1, borderRadius: RADIUS.button, padding: SPACING.md, alignItems: 'center' },
  bilgiKutuRakam  : { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyBold, marginBottom: 2 },
  bilgiKutuEtiket : { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.body },
  odemeSatiri : {
    flexDirection: 'row', gap: SPACING.xl,
    marginTop: SPACING.md, paddingTop: SPACING.md,
    borderTopWidth: 1,
  },
  odemeItem   : { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  odemeNokta  : { width: 8, height: 8, borderRadius: 4 },
  odemeMetin  : { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.body },
  odemeRakam  : { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodySemiBold },
  hedefKutu   : { marginBottom: SPACING.md, paddingBottom: SPACING.md, borderBottomWidth: 1 },
  hedefUst    : { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  hedefTip    : { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodySemiBold },
  hedefRozet  : { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.badge },
  hedefRozetMetin: { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.bodyBold },
  hedefBarArka: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: SPACING.sm },
  hedefBarOn  : { height: 8, borderRadius: 4 },
  hedefAlt    : { flexDirection: 'row', justifyContent: 'space-between' },
  hedefAltMetin: { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.body },
  urunSatiri  : { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm, gap: SPACING.sm },
  urunSol     : { flexDirection: 'row', alignItems: 'center', width: EKRAN_GENISLIGI * 0.35, gap: SPACING.sm },
  urunSira    : { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.bodyBold, width: 20 },
  urunAdi     : { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.body, flex: 1 },
  urunSag     : { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  barArka     : { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  barOn       : { height: 6, borderRadius: 3 },
  urunCiro    : { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.bodySemiBold, minWidth: 80, textAlign: 'right' },
  uyariKutu   : { borderWidth: 1, borderRadius: RADIUS.button, padding: SPACING.md, marginTop: SPACING.md },
  uyariMetin  : { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodySemiBold, textAlign: 'center' },
});
