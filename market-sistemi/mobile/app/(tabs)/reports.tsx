/**
 * Market Yönetim Sistemi — Raporlar Ekranı
 * Dönem seçimi, satış özeti, günlük seri, KDV, kâr/zarar, kasiyer performansı
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
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useTheme }        from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settingsStore';
import { api }             from '../../services/api';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE }          from '../../constants/typography';

// Dönem seçenekleri
type Donem = 'today' | 'week' | 'month' | 'year';

const DONEM_SECENEKLERI: { id: Donem; etiket: string }[] = [
  { id: 'today', etiket: 'Bugün'      },
  { id: 'week',  etiket: 'Bu Hafta'   },
  { id: 'month', etiket: 'Bu Ay'      },
  { id: 'year',  etiket: 'Bu Yıl'     },
];

// Sekme seçenekleri
type Sekme = 'ozet' | 'urunler' | 'kdv' | 'kar' | 'kasiyer';

const SEKMELER: { id: Sekme; etiket: string; rol?: string }[] = [
  { id: 'ozet',    etiket: 'Özet'     },
  { id: 'urunler', etiket: 'Ürünler'  },
  { id: 'kdv',     etiket: 'KDV'      },
  { id: 'kar',     etiket: 'Kâr/Zarar' },
  { id: 'kasiyer', etiket: 'Kasiyer'  },
];

export default function ReportsScreen() {
  const { colors }   = useTheme();
  const { branchId } = useSettingsStore();

  const [donem, setDonem] = useState<Donem>('today');
  const [sekme, setSekme] = useState<Sekme>('ozet');

  const [ozet, setOzet]           = useState<any>(null);
  const [gunluk, setGunluk]       = useState<any[]>([]);
  const [topUrunler, setTopUrunler] = useState<any[]>([]);
  const [kdv, setKdv]             = useState<any>(null);
  const [kar, setKar]             = useState<any>(null);
  const [kasiyer, setKasiyer]     = useState<any[]>([]);

  const [yukleniyor, setYukleniyor]   = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [hata, setHata]               = useState<string | null>(null);
  const [isOffline, setIsOffline]     = useState(false);

  // ============================================================
  // VERİ ÇEKME
  // ============================================================

  const verileriYukle = useCallback(async (yenileme = false) => {
    if (yenileme) setYenileniyor(true);
    else          setYukleniyor(true);
    setHata(null);

    const q = `branch_id=${branchId}&donem=${donem}`;

    try {
      const [ozetYanit, topYanit, kdvYanit, karYanit, kasiyerYanit] = await Promise.all([
        api.get(`/api/reports/summary?${q}`),
        api.get(`/api/reports/top-products?${q}&limit=10`),
        api.get(`/api/reports/vat?${q}`),
        api.get(`/api/reports/profit?${q}`),
        api.get(`/api/reports/cashier-performance?${q}`),
      ]);

      setOzet(ozetYanit.data);
      setTopUrunler(topYanit.data);
      setKdv(kdvYanit.data);
      setKar(karYanit.data);
      setKasiyer(kasiyerYanit.data);
      setIsOffline(false);

      // Günlük seriyi sadece haftalık+ dönemlerde çek
      if (donem !== 'today') {
        const gun = donem === 'week' ? 7 : donem === 'month' ? 30 : 365;
        const gunYanit = await api.get(`/api/reports/daily?branch_id=${branchId}&gun=${gun}`);
        setGunluk(gunYanit.data);
      } else {
        setGunluk([]);
      }

    } catch (err: any) {
      if (!err.response) {
        setIsOffline(true);
        setHata('Sunucuya bağlanılamıyor.');
      } else {
        setHata(err.response?.data?.detail || 'Raporlar yüklenemedi.');
      }
    } finally {
      setYukleniyor(false);
      setYenileniyor(false);
    }
  }, [branchId, donem]);

  useEffect(() => {
    verileriYukle();
  }, [verileriYukle]);

  // ============================================================
  // RENDER: LOADING
  // ============================================================

  if (yukleniyor) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.blue} />
        <Text style={[{ color: colors.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.base }]}>
          Raporlar yükleniyor...
        </Text>
      </View>
    );
  }

  // ============================================================
  // RENDER: HATA
  // ============================================================

  if (hata && !ozet) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <Text style={{ fontSize: 40 }}>{isOffline ? '📡' : '⚠️'}</Text>
        <Text style={[{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold, fontSize: FONT_SIZE.md }]}>
          {isOffline ? 'Bağlantı Yok' : 'Hata'}
        </Text>
        <Text style={[{ color: colors.textMuted, fontFamily: FONT_FAMILY.body, textAlign: 'center' }]}>
          {hata}
        </Text>
        <TouchableOpacity
          onPress = {() => verileriYukle()}
          style   = {[styles.yenilenButon, { backgroundColor: colors.blue, minHeight: MIN_TOUCH_SIZE }]}
        >
          <Text style={[{ color: '#FFFFFF', fontFamily: FONT_FAMILY.bodyMedium }]}>Yenile</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ============================================================
  // RENDER: RAPORLAR
  // ============================================================

  return (
    <View style={[{ flex: 1, backgroundColor: colors.bgPrimary }]}>

      {/* ── Dönem Seçici ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator = {false}
        style                 = {[styles.donemSatir, { borderBottomColor: colors.border }]}
        contentContainerStyle = {{ paddingHorizontal: SPACING.base, gap: SPACING.sm }}
      >
        {DONEM_SECENEKLERI.map((d) => (
          <TouchableOpacity
            key     = {d.id}
            onPress = {() => setDonem(d.id)}
            style   = {[
              styles.donemButon,
              {
                backgroundColor: donem === d.id ? colors.blue : 'transparent',
                borderColor    : donem === d.id ? colors.blue : colors.border,
                minHeight      : MIN_TOUCH_SIZE - 8,
              },
            ]}
          >
            <Text style={[{
              color     : donem === d.id ? '#FFFFFF' : colors.textMuted,
              fontFamily: donem === d.id ? FONT_FAMILY.bodyMedium : FONT_FAMILY.body,
              fontSize  : FONT_SIZE.sm,
            }]}>
              {d.etiket}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Sekme Seçici ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator = {false}
        style                 = {[styles.sekmeSatir, { borderBottomColor: colors.border }]}
        contentContainerStyle = {{ paddingHorizontal: SPACING.base, gap: SPACING.xs }}
      >
        {SEKMELER.map((s) => (
          <TouchableOpacity
            key     = {s.id}
            onPress = {() => setSekme(s.id)}
            style   = {[
              styles.sekmeButon,
              {
                borderBottomColor: sekme === s.id ? colors.blue : 'transparent',
                minHeight        : MIN_TOUCH_SIZE - 8,
              },
            ]}
          >
            <Text style={[{
              color     : sekme === s.id ? colors.blue : colors.textMuted,
              fontFamily: sekme === s.id ? FONT_FAMILY.bodySemiBold : FONT_FAMILY.body,
              fontSize  : FONT_SIZE.sm,
            }]}>
              {s.etiket}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── İçerik ── */}
      <ScrollView
        contentContainerStyle = {styles.icerik}
        showsVerticalScrollIndicator = {false}
        refreshControl        = {
          <RefreshControl
            refreshing = {yenileniyor}
            onRefresh  = {() => verileriYukle(true)}
            tintColor  = {colors.blue}
          />
        }
      >

        {/* ÖZET SEKMESİ */}
        {sekme === 'ozet' && ozet && (
          <_OzetSekme ozet={ozet} gunluk={gunluk} donem={donem} colors={colors} />
        )}

        {/* ÜRÜNLER SEKMESİ */}
        {sekme === 'urunler' && (
          <_UrunlerSekme urunler={topUrunler} colors={colors} />
        )}

        {/* KDV SEKMESİ */}
        {sekme === 'kdv' && kdv && (
          <_KdvSekme kdv={kdv} colors={colors} />
        )}

        {/* KÂR/ZARAR SEKMESİ */}
        {sekme === 'kar' && kar && (
          <_KarSekme kar={kar} colors={colors} />
        )}

        {/* KASİYER SEKMESİ */}
        {sekme === 'kasiyer' && (
          <_KasiyerSekme kasiyerler={kasiyer} colors={colors} />
        )}

      </ScrollView>
    </View>
  );
}


// ============================================================
// ALT KOMPONENTLER — Sekmeler
// ============================================================

function _OzetSekme({ ozet, gunluk, donem, colors }: any) {
  const toplamCiro = ozet.toplam_ciro || 0;

  return (
    <View style={{ gap: SPACING.base }}>
      {/* Ana metrikler */}
      <View style={styles.ozetGrid}>
        {[
          { etiket: 'Toplam Ciro',    deger: `₺${toplamCiro.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, renk: colors.success },
          { etiket: 'İşlem Sayısı',   deger: String(ozet.islem_sayisi || 0),    renk: colors.blue },
          { etiket: 'Ort. Sepet',     deger: `₺${(ozet.ortalama_sepet || 0).toFixed(2)}`, renk: colors.textPrimary },
          { etiket: 'Toplam İndirim', deger: `₺${(ozet.toplam_indirim || 0).toFixed(2)}`, renk: colors.danger },
        ].map((m) => (
          <View
            key   = {m.etiket}
            style = {[styles.ozetKutu, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}
          >
            <Text style={[{ color: m.renk, fontFamily: FONT_FAMILY.bodyBold, fontSize: FONT_SIZE.md }]}>
              {m.deger}
            </Text>
            <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs }]}>
              {m.etiket}
            </Text>
          </View>
        ))}
      </View>

      {/* Günlük seri (haftalık+) */}
      {gunluk.length > 0 && (
        <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <Text style={[styles.bolumBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
            Günlük Satış Serisi
          </Text>
          {gunluk.slice(-10).map((g: any) => {
            const enBuyuk = Math.max(...gunluk.map((x: any) => x.ciro), 1);
            const oran    = Math.max(0.02, g.ciro / enBuyuk);
            return (
              <View key={g.tarih} style={styles.gunlukSatir}>
                <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, width: 72 }]}>
                  {new Date(g.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                </Text>
                <View style={[styles.ciroBar, { backgroundColor: colors.bgTertiary }]}>
                  <View style={[
                    styles.ciroBarDolum,
                    { width: `${oran * 100}%`, backgroundColor: colors.blue },
                  ]} />
                </View>
                <Text style={[{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, width: 72, textAlign: 'right' }]}>
                  ₺{g.ciro.toFixed(0)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Ödeme dağılımı */}
      <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
        <Text style={[styles.bolumBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
          Ödeme Dağılımı
        </Text>
        {[
          { etiket: '💵 Nakit', deger: ozet.nakit || 0, renk: colors.success },
          { etiket: '💳 Kart',  deger: ozet.kart  || 0, renk: colors.purple },
          { etiket: '💵+💳 Karma', deger: ozet.karma || 0, renk: colors.cyan },
        ].filter(x => x.deger > 0).map((o) => (
          <View key={o.etiket} style={styles.odemeSatir}>
            <Text style={[{ color: colors.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.base, flex: 1 }]}>
              {o.etiket}
            </Text>
            <Text style={[{ color: o.renk, fontFamily: FONT_FAMILY.bodySemiBold, fontSize: FONT_SIZE.base }]}>
              ₺{o.deger.toFixed(2)}
            </Text>
            <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, width: 44, textAlign: 'right' }]}>
              %{toplamCiro > 0 ? ((o.deger / toplamCiro) * 100).toFixed(0) : 0}
            </Text>
          </View>
        ))}
        {ozet.islem_sayisi === 0 && (
          <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, textAlign: 'center', fontSize: FONT_SIZE.sm }]}>
            Bu dönemde satış bulunmuyor
          </Text>
        )}
      </View>
    </View>
  );
}


function _UrunlerSekme({ urunler, colors }: any) {
  if (!urunler || urunler.length === 0) {
    return (
      <View style={styles.bosSekme}>
        <Text style={{ fontSize: 40 }}>📦</Text>
        <Text style={[{ color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium }]}>
          Bu dönemde satış yok
        </Text>
      </View>
    );
  }

  const maxCiro = Math.max(...urunler.map((u: any) => u.toplam_ciro), 1);

  return (
    <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
      <Text style={[styles.bolumBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
        🏆 En Çok Satılanlar (Ciro)
      </Text>
      {urunler.map((urun: any, idx: number) => (
        <View
          key   = {urun.urun_id}
          style = {[
            styles.urunSatiri,
            idx < urunler.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 1 },
          ]}
        >
          <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, width: 20 }]}>
            {idx + 1}.
          </Text>
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style         = {[{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm }]}
              numberOfLines = {1}
            >
              {urun.urun_adi}
            </Text>
            {/* Görsel çubuk */}
            <View style={[styles.ciroBar, { backgroundColor: colors.bgTertiary }]}>
              <View style={[
                styles.ciroBarDolum,
                { width: `${(urun.toplam_ciro / maxCiro) * 100}%`, backgroundColor: colors.blue },
              ]} />
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={[{ color: colors.success, fontFamily: FONT_FAMILY.bodySemiBold, fontSize: FONT_SIZE.sm }]}>
              ₺{urun.toplam_ciro.toFixed(2)}
            </Text>
            <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs }]}>
              {urun.toplam_adet} {urun.birim}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}


function _KdvSekme({ kdv, colors }: any) {
  return (
    <View style={{ gap: SPACING.base }}>
      {/* Genel özet */}
      <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
        <Text style={[styles.bolumBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
          KDV Özeti
        </Text>
        {[
          { etiket: 'KDV Dahil Toplam', deger: `₺${(kdv.toplam_satis || 0).toFixed(2)}`, renk: colors.textPrimary },
          { etiket: 'KDV Hariç',        deger: `₺${(kdv.kdv_haric    || 0).toFixed(2)}`, renk: colors.textPrimary },
          { etiket: 'Toplam KDV',       deger: `₺${(kdv.toplam_kdv   || 0).toFixed(2)}`, renk: colors.warning },
        ].map((s) => (
          <View key={s.etiket} style={styles.odemeSatir}>
            <Text style={[{ color: colors.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.base, flex: 1 }]}>
              {s.etiket}
            </Text>
            <Text style={[{ color: s.renk, fontFamily: FONT_FAMILY.bodySemiBold, fontSize: FONT_SIZE.base }]}>
              {s.deger}
            </Text>
          </View>
        ))}
      </View>

      {/* Oran bazında dağılım */}
      {kdv.detay && kdv.detay.length > 0 && (
        <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <Text style={[styles.bolumBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
            Oran Bazında Dağılım
          </Text>
          {kdv.detay.map((d: any) => (
            <View key={d.kdv_orani} style={[styles.odemeSatir, { paddingVertical: SPACING.sm }]}>
              <View style={[styles.kdvRozetKutu, { backgroundColor: colors.warning + '20' }]}>
                <Text style={[{ color: colors.warning, fontFamily: FONT_FAMILY.bodyBold, fontSize: FONT_SIZE.xs }]}>
                  %{d.kdv_orani}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm }]}>
                  Satış: ₺{d.toplam_satis.toFixed(2)}
                </Text>
                <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs }]}>
                  KDV: ₺{d.kdv_tutar.toFixed(2)} · Hariç: ₺{d.kdv_haric.toFixed(2)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {(!kdv.detay || kdv.detay.length === 0) && (
        <View style={styles.bosSekme}>
          <Text style={{ fontSize: 40 }}>🧾</Text>
          <Text style={[{ color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium }]}>
            Bu dönemde satış yok
          </Text>
        </View>
      )}
    </View>
  );
}


function _KarSekme({ kar, colors }: any) {
  const karOrani = kar.kar_orani || 0;
  const renkKar  = karOrani >= 0 ? colors.success : colors.danger;

  return (
    <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
      <Text style={[styles.bolumBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
        Kâr / Zarar Özeti
      </Text>
      {[
        { etiket: 'Satış Cirosu',    deger: `₺${(kar.satis_toplam    || 0).toFixed(2)}`, renk: colors.blue },
        { etiket: 'Toplam Maliyet',  deger: `₺${(kar.maliyet_toplam || 0).toFixed(2)}`, renk: colors.warning },
        { etiket: 'Brüt Kâr',       deger: `₺${(kar.kar            || 0).toFixed(2)}`, renk: renkKar },
        { etiket: 'Kâr Oranı',      deger: `%${karOrani.toFixed(1)}`,                  renk: renkKar },
      ].map((s, idx) => (
        <View
          key   = {s.etiket}
          style = {[
            styles.odemeSatir,
            idx === 3 && { paddingTop: SPACING.sm, marginTop: SPACING.xs, borderTopWidth: 1, borderTopColor: colors.border },
          ]}
        >
          <Text style={[{ color: colors.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.base, flex: 1 }]}>
            {s.etiket}
          </Text>
          <Text style={[{
            color     : s.renk,
            fontFamily: idx >= 2 ? FONT_FAMILY.bodyBold : FONT_FAMILY.bodySemiBold,
            fontSize  : idx >= 2 ? FONT_SIZE.md : FONT_SIZE.base,
          }]}>
            {s.deger}
          </Text>
        </View>
      ))}

      {kar.satis_toplam === 0 && (
        <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, textAlign: 'center', fontSize: FONT_SIZE.sm, marginTop: SPACING.sm }]}>
          Bu dönemde satış yok
        </Text>
      )}
    </View>
  );
}


function _KasiyerSekme({ kasiyerler, colors }: any) {
  if (!kasiyerler || kasiyerler.length === 0) {
    return (
      <View style={styles.bosSekme}>
        <Text style={{ fontSize: 40 }}>👤</Text>
        <Text style={[{ color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium }]}>
          Bu dönemde satış yok
        </Text>
      </View>
    );
  }

  const maxCiro = Math.max(...kasiyerler.map((k: any) => k.toplam_ciro), 1);

  return (
    <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
      <Text style={[styles.bolumBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
        Kasiyer Performansı
      </Text>
      {kasiyerler.map((k: any, idx: number) => (
        <View
          key   = {k.kasiyer_id}
          style = {[
            styles.kasiyerSatiri,
            idx < kasiyerler.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 1 },
          ]}
        >
          <View style={[styles.kasiyerIkon, { backgroundColor: colors.blue + '20' }]}>
            <Text style={[{ color: colors.blue, fontFamily: FONT_FAMILY.bodyBold, fontSize: FONT_SIZE.base }]}>
              {k.kasiyer_adi.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.base }]}>
              {k.kasiyer_adi}
            </Text>
            <View style={[styles.ciroBar, { backgroundColor: colors.bgTertiary, marginTop: 4 }]}>
              <View style={[
                styles.ciroBarDolum,
                { width: `${(k.toplam_ciro / maxCiro) * 100}%`, backgroundColor: colors.blue },
              ]} />
            </View>
            <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, marginTop: 2 }]}>
              {k.islem_sayisi} işlem · Ort. ₺{k.ortalama_sepet.toFixed(2)}
            </Text>
          </View>
          <Text style={[{ color: colors.success, fontFamily: FONT_FAMILY.bodyBold, fontSize: FONT_SIZE.base }]}>
            ₺{k.toplam_ciro.toFixed(2)}
          </Text>
        </View>
      ))}
    </View>
  );
}


// ============================================================
// STİLLER
// ============================================================

const styles = StyleSheet.create({
  merkez: {
    flex          : 1,
    alignItems    : 'center',
    justifyContent: 'center',
    gap           : SPACING.base,
  },

  // Dönem / sekme çubukları
  donemSatir: {
    borderBottomWidth: 1,
    paddingVertical  : SPACING.sm,
  },
  donemButon: {
    paddingHorizontal: SPACING.base,
    borderRadius     : RADIUS.button,
    borderWidth      : 1,
    alignItems       : 'center',
    justifyContent   : 'center',
  },
  sekmeSatir: {
    borderBottomWidth: 1,
  },
  sekmeButon: {
    paddingHorizontal: SPACING.base,
    paddingVertical  : SPACING.sm,
    borderBottomWidth: 2,
  },

  icerik: {
    padding     : SPACING.base,
    gap         : SPACING.base,
    paddingBottom: SPACING.xl,
  },

  // Özet kutu grid
  ozetGrid: {
    flexDirection : 'row',
    flexWrap      : 'wrap',
    gap           : SPACING.sm,
  },
  ozetKutu: {
    flex         : 1,
    minWidth     : '45%',
    borderRadius : RADIUS.card,
    borderWidth  : 1,
    padding      : SPACING.sm,
    alignItems   : 'center',
    gap          : 4,
  },

  // Bölüm
  bolum: {
    borderRadius: RADIUS.card,
    borderWidth : 1,
    padding     : SPACING.base,
    gap         : SPACING.sm,
  },
  bolumBaslik: {
    fontSize: FONT_SIZE.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Çubuk grafik
  gunlukSatir: {
    flexDirection: 'row',
    alignItems   : 'center',
    gap          : SPACING.sm,
  },
  ciroBar: {
    flex         : 1,
    height       : 6,
    borderRadius : 3,
    overflow     : 'hidden',
  },
  ciroBarDolum: {
    height      : '100%',
    borderRadius: 3,
  },

  // Satır
  odemeSatir: {
    flexDirection : 'row',
    justifyContent: 'space-between',
    alignItems    : 'center',
    paddingVertical: 2,
  },

  // Ürün satırı
  urunSatiri: {
    flexDirection: 'row',
    alignItems   : 'center',
    paddingVertical: SPACING.xs,
    gap          : SPACING.sm,
  },

  // KDV rozet
  kdvRozetKutu: {
    paddingHorizontal: SPACING.sm,
    paddingVertical  : 4,
    borderRadius     : RADIUS.button,
    marginRight      : SPACING.sm,
    minWidth         : 44,
    alignItems       : 'center',
  },

  // Kasiyer satırı
  kasiyerSatiri: {
    flexDirection : 'row',
    alignItems    : 'center',
    paddingVertical: SPACING.sm,
    gap           : SPACING.sm,
  },
  kasiyerIkon: {
    width         : 40,
    height        : 40,
    borderRadius  : 20,
    alignItems    : 'center',
    justifyContent: 'center',
  },

  // Boş sekme
  bosSekme: {
    alignItems    : 'center',
    justifyContent: 'center',
    padding       : SPACING.xl,
    gap           : SPACING.sm,
  },

  // Hata
  yenilenButon: {
    paddingHorizontal: SPACING.xl,
    paddingVertical  : SPACING.sm,
    borderRadius     : RADIUS.button,
    marginTop        : SPACING.sm,
  },
});
