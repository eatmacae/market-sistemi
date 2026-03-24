/**
 * Hedef Yönetimi Ekranı — Faz 5
 * Günlük / haftalık / aylık satış hedefi tanımlama ve takip
 * Admin yetkisi gerektirir
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { useTheme }  from "@/hooks/useTheme";
import { SPACING }   from "@/constants/spacing";
import { FONT_SIZE, FONT_FAMILY } from "@/constants/typography";
import { API_URL }   from "@/constants/api";
import { useAuthStore } from "@/store/authStore";

// ============================================================
// TİPLER
// ============================================================

type HedefTipi = "daily" | "weekly" | "monthly";

interface Hedef {
  id             : number;
  type           : HedefTipi;
  target_amount  : number;
  period_start   : string;
  period_end     : string;
  note           ?: string;
  gerceklesen    : number;
  kalan_miktar   : number;
  ilerleme_yuzde : number;
  tamamlandi     : boolean;
  created_at    ?: string;
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

const TIP_ETIKETLERI: Record<HedefTipi, string> = {
  daily  : "Günlük",
  weekly : "Haftalık",
  monthly: "Aylık",
};

const bugunStr = () => new Date().toISOString().split("T")[0];

const paraCevir = (n: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency", currency: "TRY", minimumFractionDigits: 2,
  }).format(n);


// ============================================================
// HEDEFLER EKRANI
// ============================================================

export default function HedeflerEkrani() {
  const { colors }      = useTheme();
  const { token, user } = useAuthStore();
  const s = styles(colors);

  const [aktifler,    setAktifler]    = useState<AktifHedef[]>([]);
  const [gecmisler,   setGecmisler]   = useState<Hedef[]>([]);
  const [yukleniyor,  setYukleniyor]  = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [hata,        setHata]        = useState<string | null>(null);

  // Form modal
  const [modalAcik, setModalAcik] = useState(false);
  const [formTip,   setFormTip]   = useState<HedefTipi>("daily");
  const [formTutar, setFormTutar] = useState("");
  const [formTarih, setFormTarih] = useState(bugunStr());
  const [formNot,   setFormNot]   = useState("");
  const [formYukleniyor, setFormYukleniyor] = useState(false);
  const [formHata,  setFormHata]  = useState<string | null>(null);

  const isAdmin = user?.role === "admin";

  // ============================================================
  // VERİ YÜKLEME
  // ============================================================

  const yukle = useCallback(async (yenileme = false) => {
    if (yenileme) setYenileniyor(true);
    else setYukleniyor(true);

    try {
      setHata(null);
      const h = { Authorization: `Bearer ${token}` };

      const [aktifRes, listRes] = await Promise.all([
        fetch(`${API_URL}/api/targets/aktif?branch_id=1`, { headers: h }),
        fetch(`${API_URL}/api/targets?branch_id=1&per_page=20`, { headers: h }),
      ]);

      if (aktifRes.ok) {
        const d = await aktifRes.json();
        setAktifler(d.hedefler ?? []);
      }
      if (listRes.ok) {
        const d = await listRes.json();
        setGecmisler(d.items ?? []);
      }
    } catch {
      setHata("Veriler yüklenemedi.");
    } finally {
      setYukleniyor(false);
      setYenileniyor(false);
    }
  }, [token]);

  useEffect(() => { yukle(); }, [yukle]);

  // ============================================================
  // HEDEF KAYDET
  // ============================================================

  const hedefKaydet = async () => {
    setFormHata(null);
    const tutar = parseFloat(formTutar.replace(",", "."));

    if (isNaN(tutar) || tutar <= 0) {
      setFormHata("Geçerli bir tutar girin.");
      return;
    }
    if (!formTarih || formTarih.length !== 10) {
      setFormHata("Geçerli bir tarih girin (YYYY-AA-GG).");
      return;
    }

    setFormYukleniyor(true);
    try {
      const res = await fetch(`${API_URL}/api/targets`, {
        method : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization : `Bearer ${token}`,
        },
        body: JSON.stringify({
          branch_id    : 1,
          type         : formTip,
          target_amount: tutar,
          period_start : formTarih,
          note         : formNot || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setFormHata(err.detail ?? "Hedef kaydedilemedi.");
        return;
      }

      const sonuc = await res.json();
      setModalAcik(false);
      _formSifirla();
      yukle();
      Alert.alert(
        "Başarılı",
        sonuc.islem === "guncellendi" ? "Hedef güncellendi." : "Yeni hedef oluşturuldu.",
      );
    } catch {
      setFormHata("Sunucuya bağlanılamadı.");
    } finally {
      setFormYukleniyor(false);
    }
  };

  // ============================================================
  // HEDEF SİL
  // ============================================================

  const hedefSil = (id: number, tip: string) => {
    Alert.alert(
      "Hedefi Sil",
      `${TIP_ETIKETLERI[tip as HedefTipi]} hedefi silmek istediğinizden emin misiniz?`,
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text : "Sil",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/api/targets/${id}`, {
                method : "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok) {
                yukle();
              } else {
                Alert.alert("Hata", "Hedef silinemedi.");
              }
            } catch {
              Alert.alert("Hata", "Sunucuya bağlanılamadı.");
            }
          },
        },
      ],
    );
  };

  // ============================================================
  // FORM SIFIRLA
  // ============================================================

  const _formSifirla = () => {
    setFormTip("daily");
    setFormTutar("");
    setFormTarih(bugunStr());
    setFormNot("");
    setFormHata(null);
  };

  const modalAc = (tip?: HedefTipi) => {
    _formSifirla();
    if (tip) setFormTip(tip);
    setModalAcik(true);
  };

  // ============================================================
  // YÜKLENİYOR / HATA
  // ============================================================

  if (yukleniyor) {
    return (
      <View style={[s.kapsayici, s.ortala]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={[s.kapsayici, s.ortala]}>
        <Text style={s.kilitIcon}>🔒</Text>
        <Text style={s.kilitMetin}>Bu ekrana sadece yöneticiler erişebilir.</Text>
      </View>
    );
  }

  if (hata) {
    return (
      <View style={[s.kapsayici, s.ortala]}>
        <Text style={[s.bilgiMetni, { color: colors.danger }]}>{hata}</Text>
        <TouchableOpacity style={s.yenileBton} onPress={() => yukle()}>
          <Text style={s.yenileBtonMetin}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.kapsayici}>
      <ScrollView
        contentContainerStyle={s.icerik}
        refreshControl={
          <RefreshControl
            refreshing={yenileniyor}
            onRefresh={() => yukle(true)}
            tintColor={colors.accent}
          />
        }
      >
        {/* Başlık */}
        <View style={s.baslikSatiri}>
          <Text style={s.baslik}>Satış Hedefleri</Text>
          <TouchableOpacity style={s.ekleBtn} onPress={() => modalAc()}>
            <Text style={s.ekleBtnMetin}>+ Yeni Hedef</Text>
          </TouchableOpacity>
        </View>

        {/* ── AKTİF HEDEFLER ── */}
        <Text style={s.bolumBasligi}>Aktif Dönemler</Text>

        {aktifler.length === 0 ? (
          <View style={s.bosKutu}>
            <Text style={s.bosMetin}>Henüz hedef tanımlanmamış.</Text>
          </View>
        ) : (
          aktifler.map((h, i) => (
            <_AktifHedefKarti
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
            <Text style={[s.bolumBasligi, { marginTop: SPACING[4] }]}>Tüm Hedefler</Text>
            {gecmisler.map((h) => (
              <_GecmisHedefSatiri
                key={h.id}
                hedef={h}
                onSil={() => hedefSil(h.id, h.type)}
                onDuzenle={() => {
                  setFormTip(h.type);
                  setFormTutar(String(h.target_amount));
                  setFormTarih(h.period_start);
                  setFormNot(h.note ?? "");
                  setFormHata(null);
                  setModalAcik(true);
                }}
                colors={colors}
              />
            ))}
          </>
        )}

        <View style={{ height: SPACING[8] }} />
      </ScrollView>

      {/* ── FORM MODALİ ── */}
      <Modal visible={modalAcik} transparent animationType="slide">
        <View style={s.modalArka}>
          <View style={s.modalKutu}>
            <View style={s.modalBaslikSatiri}>
              <Text style={s.modalBaslik}>Hedef Tanımla</Text>
              <TouchableOpacity
                style={s.kapat}
                onPress={() => { setModalAcik(false); _formSifirla(); }}
              >
                <Text style={s.kapatMetin}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Tip seçimi */}
              <Text style={s.etiket}>Dönem Tipi</Text>
              <View style={s.tipSatiri}>
                {(["daily", "weekly", "monthly"] as HedefTipi[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[s.tipBtn, formTip === t && s.tipBtnAktif]}
                    onPress={() => setFormTip(t)}
                  >
                    <Text style={[s.tipBtnMetin, formTip === t && s.tipBtnMetinAktif]}>
                      {TIP_ETIKETLERI[t]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Tutar */}
              <Text style={s.etiket}>Hedef Tutar (₺)</Text>
              <TextInput
                style={s.input}
                value={formTutar}
                onChangeText={setFormTutar}
                placeholder="ör: 5000"
                placeholderTextColor={colors.textHint}
                keyboardType="decimal-pad"
              />

              {/* Dönem başlangıcı */}
              <Text style={s.etiket}>Dönem Başlangıcı</Text>
              <TextInput
                style={s.input}
                value={formTarih}
                onChangeText={setFormTarih}
                placeholder="YYYY-AA-GG"
                placeholderTextColor={colors.textHint}
                keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
                maxLength={10}
              />

              {/* Not */}
              <Text style={s.etiket}>Not (opsiyonel)</Text>
              <TextInput
                style={[s.input, s.inputCok]}
                value={formNot}
                onChangeText={setFormNot}
                placeholder="Hedef hakkında not..."
                placeholderTextColor={colors.textHint}
                multiline
                numberOfLines={2}
              />

              {formHata && (
                <Text style={s.formHata}>{formHata}</Text>
              )}

              {/* Önizleme */}
              {formTutar.length > 0 && (
                <View style={s.onizleme}>
                  <Text style={s.onizlemeMetin}>
                    {TIP_ETIKETLERI[formTip]} hedef: {paraCevir(parseFloat(formTutar.replace(",", ".")) || 0)}
                    {"\n"}Dönem: {formTarih} başlangıçlı
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[s.kaydetBtn, formYukleniyor && { opacity: 0.7 }]}
                onPress={hedefKaydet}
                disabled={formYukleniyor}
              >
                {formYukleniyor
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.kaydetBtnMetin}>Kaydet</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}


// ============================================================
// ALT BİLEŞENLER
// ============================================================

function _AktifHedefKarti({
  hedef, onEkle, colors,
}: {
  hedef: AktifHedef; onEkle: () => void; colors: any;
}) {
  const s     = styles(colors);
  const yuzde = hedef.ilerleme_yuzde ?? 0;
  const barRengi = hedef.tamamlandi
    ? colors.success
    : yuzde >= 75 ? colors.accent
    : yuzde >= 40 ? colors.warning
    : colors.danger;

  return (
    <View style={s.aktifKart}>
      <View style={s.aktifKartUstt}>
        <View>
          <Text style={s.aktifTip}>{TIP_ETIKETLERI[hedef.type]}</Text>
          {hedef.period_end && (
            <Text style={s.aktifTarih}>
              {hedef.period_start} – {hedef.period_end}
              {(hedef.kalan_gun ?? 0) > 0 && ` · ${hedef.kalan_gun} gün kaldı`}
            </Text>
          )}
        </View>

        {hedef.hedef_var ? (
          <TouchableOpacity style={s.duzenleBtn} onPress={onEkle}>
            <Text style={s.duzenleBtnMetin}>Düzenle</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.duzenleBtn, { backgroundColor: colors.accent + "22" }]} onPress={onEkle}>
            <Text style={[s.duzenleBtnMetin, { color: colors.accent }]}>+ Hedef Ekle</Text>
          </TouchableOpacity>
        )}
      </View>

      {hedef.hedef_var ? (
        <>
          <View style={s.hedefBarArka}>
            <View style={[s.hedefBarOn, { width: `${yuzde}%` as any, backgroundColor: barRengi }]} />
          </View>
          <View style={s.aktifAlt}>
            <Text style={s.aktifAltMetin}>
              {paraCevir(hedef.gerceklesen ?? 0)} / {paraCevir(hedef.target_amount ?? 0)}
            </Text>
            <View style={[s.yuzdeRozet, { backgroundColor: barRengi + "22" }]}>
              <Text style={[s.yuzdeRozetMetin, { color: barRengi }]}>
                {hedef.tamamlandi ? "✓ Tamam" : `%${yuzde}`}
              </Text>
            </View>
          </View>
        </>
      ) : (
        <Text style={s.hedefYokMetin}>Bu dönem için henüz hedef tanımlanmamış.</Text>
      )}
    </View>
  );
}

function _GecmisHedefSatiri({
  hedef, onSil, onDuzenle, colors,
}: {
  hedef: Hedef; onSil: () => void; onDuzenle: () => void; colors: any;
}) {
  const s     = styles(colors);
  const yuzde = hedef.ilerleme_yuzde;
  const barRengi = hedef.tamamlandi ? colors.success
    : yuzde >= 75 ? colors.accent
    : yuzde >= 40 ? colors.warning
    : colors.danger;

  return (
    <View style={s.gecmisSatiri}>
      <View style={s.gecmisSol}>
        <View style={[s.tipRozet, { backgroundColor: barRengi + "22" }]}>
          <Text style={[s.tipRozetMetin, { color: barRengi }]}>
            {TIP_ETIKETLERI[hedef.type]}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.gecmisTarih}>{hedef.period_start} – {hedef.period_end}</Text>
          <Text style={s.gecmisTutar}>{paraCevir(hedef.target_amount)}</Text>
          {hedef.note && <Text style={s.gecmisNot} numberOfLines={1}>{hedef.note}</Text>}
        </View>
      </View>
      <View style={s.gecmisSag}>
        <Text style={[s.gecmisYuzde, { color: barRengi }]}>
          %{yuzde}
        </Text>
        <View style={s.aksiyonlar}>
          <TouchableOpacity style={s.aksBtn} onPress={onDuzenle}>
            <Text style={[s.aksBtnMetin, { color: colors.accent }]}>✎</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.aksBtn} onPress={onSil}>
            <Text style={[s.aksBtnMetin, { color: colors.danger }]}>✕</Text>
          </TouchableOpacity>
        </View>
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
    padding: SPACING[4],
  },
  ortala: {
    justifyContent: "center",
    alignItems    : "center",
    padding       : SPACING[8],
  },
  baslikSatiri: {
    flexDirection : "row",
    justifyContent: "space-between",
    alignItems    : "center",
    marginBottom  : SPACING[4],
  },
  baslik: {
    fontSize  : FONT_SIZE.xl,
    fontFamily: FONT_FAMILY.bold,
    color     : colors.textPrimary,
  },
  ekleBtn: {
    backgroundColor: colors.accent,
    paddingVertical: SPACING[2],
    paddingHorizontal: SPACING[3],
    borderRadius: 8,
    minHeight   : 48,
    justifyContent: "center",
  },
  ekleBtnMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.semiBold,
    color     : "#FFFFFF",
  },
  bolumBasligi: {
    fontSize    : FONT_SIZE.xs,
    fontFamily  : FONT_FAMILY.semiBold,
    color       : colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: SPACING[3],
  },
  // Aktif kart
  aktifKart: {
    backgroundColor: colors.bgSecondary,
    borderRadius   : 12,
    padding        : SPACING[4],
    marginBottom   : SPACING[3],
    borderWidth    : 1,
    borderColor    : colors.border,
  },
  aktifKartUstt: {
    flexDirection : "row",
    justifyContent: "space-between",
    alignItems    : "flex-start",
    marginBottom  : SPACING[3],
  },
  aktifTip: {
    fontSize  : FONT_SIZE.md,
    fontFamily: FONT_FAMILY.bold,
    color     : colors.textPrimary,
  },
  aktifTarih: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.regular,
    color     : colors.textHint,
    marginTop : 2,
  },
  duzenleBtn: {
    backgroundColor  : colors.bgTertiary,
    paddingVertical  : SPACING[2],
    paddingHorizontal: SPACING[3],
    borderRadius     : 8,
    borderWidth      : 1,
    borderColor      : colors.border,
    minHeight        : 48,
    justifyContent   : "center",
  },
  duzenleBtnMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.semiBold,
    color     : colors.textMuted,
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
  aktifAlt: {
    flexDirection : "row",
    justifyContent: "space-between",
    alignItems    : "center",
  },
  aktifAltMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.regular,
    color     : colors.textMuted,
  },
  yuzdeRozet: {
    paddingHorizontal: SPACING[2],
    paddingVertical  : 3,
    borderRadius     : 999,
  },
  yuzdeRozetMetin: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bold,
  },
  hedefYokMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.regular,
    color     : colors.textHint,
    fontStyle : "italic",
  },
  // Geçmiş satırı
  gecmisSatiri: {
    flexDirection  : "row",
    justifyContent : "space-between",
    alignItems     : "center",
    backgroundColor: colors.bgSecondary,
    borderRadius   : 10,
    padding        : SPACING[3],
    marginBottom   : SPACING[2],
    borderWidth    : 1,
    borderColor    : colors.border,
  },
  gecmisSol: {
    flexDirection: "row",
    alignItems   : "center",
    flex         : 1,
    gap          : SPACING[3],
  },
  tipRozet: {
    paddingHorizontal: SPACING[2],
    paddingVertical  : 4,
    borderRadius     : 8,
  },
  tipRozetMetin: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bold,
  },
  gecmisTarih: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.regular,
    color     : colors.textHint,
  },
  gecmisTutar: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.semiBold,
    color     : colors.textPrimary,
  },
  gecmisNot: {
    fontSize  : FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.regular,
    color     : colors.textHint,
    fontStyle : "italic",
  },
  gecmisSag: {
    alignItems: "flex-end",
    gap       : SPACING[2],
  },
  gecmisYuzde: {
    fontSize  : FONT_SIZE.md,
    fontFamily: FONT_FAMILY.bold,
  },
  aksiyonlar: {
    flexDirection: "row",
    gap          : SPACING[2],
  },
  aksBtn: {
    width          : 36,
    height         : 36,
    borderRadius   : 8,
    backgroundColor: colors.bgTertiary,
    justifyContent : "center",
    alignItems     : "center",
    borderWidth    : 1,
    borderColor    : colors.border,
  },
  aksBtnMetin: {
    fontSize  : FONT_SIZE.md,
    fontFamily: FONT_FAMILY.bold,
  },
  // Modal
  modalArka: {
    flex           : 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent : "flex-end",
  },
  modalKutu: {
    backgroundColor: colors.bgSecondary,
    borderTopLeftRadius : 20,
    borderTopRightRadius: 20,
    padding        : SPACING[5],
    maxHeight      : "85%",
  },
  modalBaslikSatiri: {
    flexDirection : "row",
    justifyContent: "space-between",
    alignItems    : "center",
    marginBottom  : SPACING[4],
  },
  modalBaslik: {
    fontSize  : FONT_SIZE.lg,
    fontFamily: FONT_FAMILY.bold,
    color     : colors.textPrimary,
  },
  kapat: {
    width          : 36,
    height         : 36,
    borderRadius   : 18,
    backgroundColor: colors.bgTertiary,
    justifyContent : "center",
    alignItems     : "center",
  },
  kapatMetin: {
    fontSize  : FONT_SIZE.md,
    color     : colors.textMuted,
    fontFamily: FONT_FAMILY.semiBold,
  },
  etiket: {
    fontSize    : FONT_SIZE.sm,
    fontFamily  : FONT_FAMILY.semiBold,
    color       : colors.textMuted,
    marginBottom: SPACING[2],
    marginTop   : SPACING[3],
  },
  tipSatiri: {
    flexDirection: "row",
    gap          : SPACING[2],
  },
  tipBtn: {
    flex             : 1,
    paddingVertical  : SPACING[3],
    borderRadius     : 8,
    backgroundColor  : colors.bgTertiary,
    alignItems       : "center",
    borderWidth      : 1,
    borderColor      : colors.border,
    minHeight        : 48,
    justifyContent   : "center",
  },
  tipBtnAktif: {
    backgroundColor: colors.accent + "22",
    borderColor    : colors.accent,
  },
  tipBtnMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.semiBold,
    color     : colors.textMuted,
  },
  tipBtnMetinAktif: {
    color: colors.accent,
  },
  input: {
    backgroundColor: colors.bgTertiary,
    borderRadius   : 8,
    borderWidth    : 1,
    borderColor    : colors.border,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[3],
    fontSize       : FONT_SIZE.md,
    fontFamily     : FONT_FAMILY.regular,
    color          : colors.textPrimary,
    minHeight      : 48,
  },
  inputCok: {
    minHeight  : 80,
    textAlignVertical: "top",
  },
  formHata: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.regular,
    color     : colors.danger,
    marginTop : SPACING[2],
  },
  onizleme: {
    backgroundColor: colors.bgTertiary,
    borderRadius   : 8,
    padding        : SPACING[3],
    marginTop      : SPACING[3],
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  onizlemeMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.regular,
    color     : colors.textMuted,
    lineHeight : 20,
  },
  kaydetBtn: {
    backgroundColor: colors.accent,
    borderRadius   : 10,
    paddingVertical: SPACING[4],
    alignItems     : "center",
    marginTop      : SPACING[4],
    marginBottom   : SPACING[2],
    minHeight      : 52,
    justifyContent : "center",
  },
  kaydetBtnMetin: {
    fontSize  : FONT_SIZE.md,
    fontFamily: FONT_FAMILY.bold,
    color     : "#FFFFFF",
  },
  // Boş durum
  bosKutu: {
    backgroundColor: colors.bgSecondary,
    borderRadius   : 12,
    padding        : SPACING[6],
    alignItems     : "center",
    borderWidth    : 1,
    borderColor    : colors.border,
    marginBottom   : SPACING[3],
  },
  bosMetin: {
    fontSize  : FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.regular,
    color     : colors.textHint,
  },
  // Genel
  bilgiMetni: {
    fontSize  : FONT_SIZE.md,
    fontFamily: FONT_FAMILY.regular,
    color     : colors.textMuted,
    textAlign : "center",
  },
  yenileBton: {
    marginTop        : SPACING[4],
    backgroundColor  : colors.accent,
    paddingVertical  : SPACING[3],
    paddingHorizontal: SPACING[6],
    borderRadius     : 8,
    minHeight        : 48,
    justifyContent   : "center",
  },
  yenileBtonMetin: {
    fontSize  : FONT_SIZE.md,
    fontFamily: FONT_FAMILY.semiBold,
    color     : "#FFFFFF",
  },
  kilitIcon: {
    fontSize    : 48,
    marginBottom: SPACING[3],
  },
  kilitMetin: {
    fontSize  : FONT_SIZE.md,
    fontFamily: FONT_FAMILY.regular,
    color     : colors.textMuted,
    textAlign : "center",
  },
});
