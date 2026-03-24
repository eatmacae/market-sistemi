/**
 * Market Sahibi Paneli — Faz 5
 * Canlı satış takibi, hedef ilerlemesi, stok özeti
 * Her 5 dakikada otomatik yenilenir
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useTheme }  from "@/hooks/useTheme";
import { SPACING }   from "@/constants/spacing";
import { FONT_SIZE, FONT_FAMILY } from "@/constants/typography";
import { API_URL }   from "@/constants/api";
import { useAuthStore } from "@/store/authStore";

const { width: EKRAN_GENISLIGI } = Dimensions.get("window");

// ============================================================
// TİPLER
// ============================================================

interface SatisOzeti {
  ciro         : number;
  islem_sayisi : number;
  ortalama_sepet: number;
  degisim_yuzde: number;
  nakit_toplam  : number;
  kart_toplam   : number;
}

interface HedefDurumu {
  type          : "daily" | "weekly" | "monthly";
  hedef_var     : boolean;
  target_amount ?: number;
  gerceklesen  ?: number;
  kalan_miktar ?: number;
  ilerleme_yuzde?: number;
  tamamlandi   ?: boolean;
  kalan_gun    ?: number;
}

interface TopUrun {
  name      : string;
  qty       : number;
  ciro      : number;
}

interface StokOzet {
  toplam_maliyet: number;
  toplam_satis  : number;
  potansiyel_kar: number;
  kritik_urun_sayisi: number;
}

interface PanelData {
  ozet       : SatisOzeti | null;
  hedefler   : HedefDurumu[];
  top_urunler: TopUrun[];
  stok_ozet  : StokOzet | null;
}

// ============================================================
// SAHİP PANELİ
// ============================================================

export default function SahipPaneli() {
  const { colors }  = useTheme();
  const { token, user } = useAuthStore();
  const s = styles(colors);

  const [veri, setVeri]         = useState<PanelData>({
    ozet: null, hedefler: [], top_urunler: [], stok_ozet: null,
  });
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata]             = useState<string | null>(null);
  const [sonYenileme, setSonYenileme] = useState<Date>(new Date());
  const [manuelYenileme, setManuelYenileme] = useState(false);

  // 5 dakikalık otomatik yenileme timer'ı
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ============================================================
  // VERİ YÜKLEMESİ
  // ============================================================

  const verileriYukle = useCallback(async (manuel = false) => {
    if (manuel) setManuelYenileme(true);

    try {
      setHata(null);
      const baslik = { Authorization: `Bearer ${token}` };

      const [ozetRes, hedefRes, topRes, stokRes] = await Promise.all([
        fetch(`${API_URL}/api/reports/summary?donem=today`, { headers: baslik }),
        fetch(`${API_URL}/api/targets/aktif?branch_id=1`,  { headers: baslik }),
        fetch(`${API_URL}/api/reports/top-products?donem=today&limit=5`, { headers: baslik }),
        fetch(`${API_URL}/api/reports/stock-value`,        { headers: baslik }),
      ]);

      const [ozetData, hedefData, topData, stokData] = await Promise.all([
        ozetRes.ok ? ozetRes.json() : null,
        hedefRes.ok ? hedefRes.json() : null,
        topRes.ok ? topRes.json() : null,
        stokRes.ok ? stokRes.json() : null,
      ]);

      setVeri({
        ozet       : ozetData,
        hedefler   : hedefData?.hedefler ?? [],
        top_urunler: topData?.items ?? [],
        stok_ozet  : stokData,
      });
      setSonYenileme(new Date());
    } catch (err) {
      setHata("Veriler yüklenemedi. İnternet bağlantısını kontrol edin.");
    } finally {
      setYukleniyor(false);
      setManuelYenileme(false);
    }
  }, [token]);

  // İlk yükleme + 5 dk zamanlayıcı
  useEffect(() => {
    verileriYukle();
    timerRef.current = setInterval(() => verileriYukle(), 5 * 60 * 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [verileriYukle]);

  // ============================================================
  // YARDIMCI FONKSİYONLAR
  // ============================================================

  const paraCevir = (n: number) =>
    new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 }).format(n);

  const saatStr = (d: Date) =>
    d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

  const tipAdi = (tip: string) =>
    tip === "daily" ? "Günlük" : tip === "weekly" ? "Haftalık" : "Aylık";

  // ============================================================
  // YÜKLENİYOR / HATA
  // ============================================================

  if (yukleniyor) {
    return (
      <View style={[s.kapsayici, s.ortala]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={s.bilgiMetni}>Veriler yükleniyor...</Text>
      </View>
    );
  }

  if (hata) {
    return (
      <View style={[s.kapsayici, s.ortala]}>
        <Text style={[s.bilgiMetni, { color: colors.danger }]}>{hata}</Text>
        <TouchableOpacity style={s.yenileBton} onPress={() => verileriYukle(true)}>
          <Text style={s.yenileBtonMetin}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { ozet, hedefler, top_urunler, stok_ozet } = veri;

  return (
    <ScrollView
      style={s.kapsayici}
      contentContainerStyle={s.icerik}
      refreshControl={
        <RefreshControl
          refreshing={manuelYenileme}
          onRefresh={() => verileriYukle(true)}
          tintColor={colors.accent}
        />
      }
    >
      {/* Başlık */}
      <View style={s.baslikSatiri}>
        <View>
          <Text style={s.baslik}>Sahip Paneli</Text>
          <Text style={s.altBaslik}>
            Son güncelleme: {saatStr(sonYenileme)} · Otomatik 5dk
          </Text>
        </View>
        <TouchableOpacity style={s.yenileBtonKucuk} onPress={() => verileriYukle(true)}>
          <Text style={s.yenileBtonKucukMetin}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* ── CİRO KARTI ── */}
      {ozet && (
        <View style={s.kart}>
          <Text style={s.kartBaslik}>Bugünkü Ciro</Text>
          <Text style={s.buyukRakam}>{paraCevir(ozet.ciro)}</Text>

          <View style={s.satir}>
            <_BilgiKutu
              etiket="İşlem"
              deger={String(ozet.islem_sayisi)}
              renk={colors.accent}
              colors={colors}
            />
            <_BilgiKutu
              etiket="Ort. Sepet"
              deger={paraCevir(ozet.ortalama_sepet)}
              renk={colors.purple}
              colors={colors}
            />
            <_BilgiKutu
              etiket="Dün Farkı"
              deger={`${ozet.degisim_yuzde >= 0 ? "+" : ""}${ozet.degisim_yuzde.toFixed(1)}%`}
              renk={ozet.degisim_yuzde >= 0 ? colors.success : colors.danger}
              colors={colors}
            />
          </View>

          {/* Ödeme dağılımı */}
          <View style={s.odemeSatiri}>
            <View style={s.odemeItem}>
              <View style={[s.odemeNokta, { backgroundColor: colors.success }]} />
              <Text style={s.odemeMetin}>Nakit</Text>
              <Text style={s.odemeRakam}>{paraCevir(ozet.nakit_toplam)}</Text>
            </View>
            <View style={s.odemeItem}>
              <View style={[s.odemeNokta, { backgroundColor: colors.accent }]} />
              <Text style={s.odemeMetin}>Kart</Text>
              <Text style={s.odemeRakam}>{paraCevir(ozet.kart_toplam)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* ── HEDEFLER ── */}
      {hedefler.length > 0 && (
        <View style={s.kart}>
          <Text style={s.kartBaslik}>Satış Hedefleri</Text>
          {hedefler.map((h, i) => (
            h.hedef_var ? (
              <_HedefSatiri key={i} hedef={h} tipAdi={tipAdi} paraCevir={paraCevir} colors={colors} />
            ) : (
              <View key={i} style={s.hedefYok}>
                <Text style={s.hedefYokMetin}>{tipAdi(h.type)} hedef tanımlanmamış</Text>
              </View>
            )
          ))}
        </View>
      )}

      {/* ── EN ÇOK SATAN ÜRÜNLER ── */}
      {top_urunler.length > 0 && (
        <View style={s.kart}>
          <Text style={s.kartBaslik}>En Çok Satan (Bugün)</Text>
          {top_urunler.map((u, i) => {
            const maxCiro = top_urunler[0].ciro;
            const oran    = maxCiro > 0 ? u.ciro / maxCiro : 0;
            return (
              <View key={i} style={s.urunSatiri}>
                <View style={s.urunSol}>
                  <Text style={s.urunSira}>#{i + 1}</Text>
                  <Text style={s.urunAdi} numberOfLines={1}>{u.name}</Text>
                </View>
                <View style={s.urunSag}>
                  <View style={s.barArka}>
                    <View style={[s.barOn, { width: `${oran * 100}%` as any, backgroundColor: colors.accent }]} />
                  </View>
                  <Text style={s.urunCiro}>{paraCevir(u.ciro)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── STOK ÖZETİ ── */}
      {stok_ozet && (
        <View style={[s.kart, { marginBottom: SPACING[8] }]}>
          <Text style={s.kartBaslik}>Stok Değeri</Text>
          <View style={s.satir}>
            <_BilgiKutu
              etiket="Maliyet"
              deger={paraCevir(stok_ozet.toplam_maliyet)}
              renk={colors.warning}
              colors={colors}
            />
            <_BilgiKutu
              etiket="Satış Değ."
              deger={paraCevir(stok_ozet.toplam_satis)}
              renk={colors.success}
              colors={colors}
            />
            <_BilgiKutu
              etiket="Pot. Kâr"
              deger={paraCevir(stok_ozet.potansiyel_kar)}
              renk={colors.cyan}
              colors={colors}
            />
          </View>
          {stok_ozet.kritik_urun_sayisi > 0 && (
            <View style={[s.uyariKutu, { borderColor: colors.danger }]}>
              <Text style={[s.uyariMetin, { color: colors.danger }]}>
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

function _BilgiKutu({
  etiket, deger, renk, colors,
}: {
  etiket: string; deger: string; renk: string; colors: any;
}) {
  const s = styles(colors);
  return (
    <View style={s.bilgiKutu}>
      <Text style={[s.bilgiKutuRakam, { color: renk }]}>{deger}</Text>
      <Text style={s.bilgiKutuEtiket}>{etiket}</Text>
    </View>
  );
}

function _HedefSatiri({
  hedef, tipAdi, paraCevir, colors,
}: {
  hedef: HedefDurumu; tipAdi: (t: string) => string; paraCevir: (n: number) => string; colors: any;
}) {
  const s           = styles(colors);
  const yuzde       = hedef.ilerleme_yuzde ?? 0;
  const tamamlandi  = hedef.tamamlandi ?? false;
  const barRengi    = tamamlandi
    ? colors.success
    : yuzde >= 75
    ? colors.accent
    : yuzde >= 40
    ? colors.warning
    : colors.danger;

  return (
    <View style={s.hedefKutu}>
      <View style={s.hedefUsust}>
        <Text style={s.hedefTip}>{tipAdi(hedef.type)}</Text>
        <View style={[s.hedefRozet, { backgroundColor: tamamlandi ? colors.success + "33" : barRengi + "22" }]}>
          <Text style={[s.hedefRozetMetin, { color: tamamlandi ? colors.success : barRengi }]}>
            {tamamlandi ? "✓ Tamamlandı" : `%${yuzde}`}
          </Text>
        </View>
      </View>

      {/* İlerleme çubuğu */}
      <View style={s.hedefBarArka}>
        <View style={[s.hedefBarOn, { width: `${yuzde}%` as any, backgroundColor: barRengi }]} />
      </View>

      <View style={s.hedefAlt}>
        <Text style={s.hedefAltMetin}>
          {paraCevir(hedef.gerceklesen ?? 0)} / {paraCevir(hedef.target_amount ?? 0)}
        </Text>
        {(hedef.kalan_gun ?? 0) > 0 && !tamamlandi && (
          <Text style={[s.hedefAltMetin, { color: (hedef.kalan_gun ?? 0) <= 2 ? colors.danger : colors.textMuted }]}>
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

const styles = (colors: any) => StyleSheet.create({
  kapsayici: {
    flex           : 1,
    backgroundColor: colors.bgPrimary,
  },
  icerik: {
    padding       : SPACING[4],
    paddingBottom : SPACING[8],
  },
  ortala: {
    justifyContent: "center",
    alignItems    : "center",
    padding       : SPACING[8],
  },
  baslikSatiri: {
    flexDirection  : "row",
    justifyContent : "space-between",
    alignItems     : "center",
    marginBottom   : SPACING[4],
    paddingVertical: SPACING[2],
  },
  baslik: {
    fontSize  : FONT_SIZE.xl,
    fontFamily: FONT_FAMILY.bold,
    color     : colors.textPrimary,
  },
  altBaslik: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.regular,
    color     : colors.textHint,
    marginTop : 2,
  },
  yenileBtonKucuk: {
    width          : 48,
    height         : 48,
    borderRadius   : 24,
    backgroundColor: colors.bgSecondary,
    justifyContent : "center",
    alignItems     : "center",
    borderWidth    : 1,
    borderColor    : colors.border,
  },
  yenileBtonKucukMetin: {
    fontSize  : FONT_SIZE.xl,
    color     : colors.accent,
    fontFamily: FONT_FAMILY.bold,
  },
  kart: {
    backgroundColor: colors.bgSecondary,
    borderRadius   : 12,
    padding        : SPACING[4],
    marginBottom   : SPACING[3],
    borderWidth    : 1,
    borderColor    : colors.border,
  },
  kartBaslik: {
    fontSize    : FONT_SIZE.sm,
    fontFamily  : FONT_FAMILY.semiBold,
    color       : colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom : SPACING[3],
  },
  buyukRakam: {
    fontSize  : FONT_SIZE.xxxl ?? 36,
    fontFamily: FONT_FAMILY.bold,
    color     : colors.textPrimary,
    marginBottom: SPACING[3],
  },
  satir: {
    flexDirection: "row",
    gap          : SPACING[2],
    marginTop    : SPACING[2],
  },
  bilgiKutu: {
    flex           : 1,
    backgroundColor: colors.bgTertiary,
    borderRadius   : 8,
    padding        : SPACING[3],
    alignItems     : "center",
  },
  bilgiKutuRakam: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bold,
    marginBottom: 2,
  },
  bilgiKutuEtiket: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.regular,
    color     : colors.textHint,
  },
  odemeSatiri: {
    flexDirection: "row",
    gap          : SPACING[4],
    marginTop    : SPACING[3],
    paddingTop   : SPACING[3],
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  odemeItem: {
    flexDirection: "row",
    alignItems   : "center",
    gap          : SPACING[2],
  },
  odemeNokta: {
    width       : 8,
    height      : 8,
    borderRadius: 4,
  },
  odemeMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.regular,
    color     : colors.textMuted,
  },
  odemeRakam: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.semiBold,
    color     : colors.textPrimary,
  },
  // Hedef
  hedefKutu: {
    marginBottom: SPACING[3],
    paddingBottom: SPACING[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  hedefUsust: {
    flexDirection : "row",
    justifyContent: "space-between",
    alignItems    : "center",
    marginBottom  : SPACING[2],
  },
  hedefTip: {
    fontSize  : FONT_SIZE.md,
    fontFamily: FONT_FAMILY.semiBold,
    color     : colors.textPrimary,
  },
  hedefRozet: {
    paddingHorizontal: SPACING[2],
    paddingVertical  : 4,
    borderRadius     : 999,
  },
  hedefRozetMetin: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bold,
  },
  hedefBarArka: {
    height         : 8,
    backgroundColor: colors.bgTertiary,
    borderRadius   : 4,
    overflow       : "hidden",
    marginBottom   : SPACING[2],
  },
  hedefBarOn: {
    height      : 8,
    borderRadius: 4,
  },
  hedefAlt: {
    flexDirection : "row",
    justifyContent: "space-between",
  },
  hedefAltMetin: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.regular,
    color     : colors.textMuted,
  },
  hedefYok: {
    paddingVertical: SPACING[2],
  },
  hedefYokMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.regular,
    color     : colors.textHint,
    fontStyle : "italic",
  },
  // Ürün listesi
  urunSatiri: {
    flexDirection : "row",
    alignItems    : "center",
    marginBottom  : SPACING[2],
    gap           : SPACING[2],
  },
  urunSol: {
    flexDirection: "row",
    alignItems   : "center",
    width        : EKRAN_GENISLIGI * 0.35,
    gap          : SPACING[2],
  },
  urunSira: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bold,
    color     : colors.textHint,
    width     : 20,
  },
  urunAdi: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.regular,
    color     : colors.textPrimary,
    flex      : 1,
  },
  urunSag: {
    flex         : 1,
    flexDirection: "row",
    alignItems   : "center",
    gap          : SPACING[2],
  },
  barArka: {
    flex           : 1,
    height         : 6,
    backgroundColor: colors.bgTertiary,
    borderRadius   : 3,
    overflow       : "hidden",
  },
  barOn: {
    height      : 6,
    borderRadius: 3,
  },
  urunCiro: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.semiBold,
    color     : colors.textPrimary,
    minWidth  : 80,
    textAlign : "right",
  },
  // Uyarı
  uyariKutu: {
    borderWidth  : 1,
    borderRadius : 8,
    padding      : SPACING[3],
    marginTop    : SPACING[3],
  },
  uyariMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.semiBold,
    textAlign : "center",
  },
  // Genel
  bilgiMetni: {
    fontSize  : FONT_SIZE.md,
    fontFamily: FONT_FAMILY.regular,
    color     : colors.textMuted,
    textAlign : "center",
    marginTop : SPACING[3],
  },
  yenileBton: {
    marginTop      : SPACING[4],
    backgroundColor: colors.accent,
    paddingVertical: SPACING[3],
    paddingHorizontal: SPACING[6],
    borderRadius   : 8,
    minHeight      : 48,
    justifyContent : "center",
  },
  yenileBtonMetin: {
    fontSize  : FONT_SIZE.md,
    fontFamily: FONT_FAMILY.semiBold,
    color     : "#FFFFFF",
  },
});
