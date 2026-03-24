/**
 * Market Yönetim Sistemi — Kasa Kapanışı & Z Raporu Ekranı
 *
 * Akış:
 * 1. Aktif oturum bilgilerini göster (kasiyer, açılış tutarı, başlangıç saati)
 * 2. Satış özetini canlı yükle (toplam, nakit, kart, işlem sayısı)
 * 3. Kasiyerin kapanış nakit tutarını girmesini iste
 * 4. Kasa farkını anlık hesapla
 * 5. "Kasayı Kapat" → /api/sessions/{id}/close çağır
 * 6. Z raporunu göster + (opsiyonel) yazdır
 *
 * Kalite kontrol:
 * ✅ Loading state
 * ✅ Error state — offline/server ayrımı
 * ✅ Offline state — isOffline flag
 * ✅ useTheme() — hardcode renk yok
 * ✅ Min 48px dokunma alanı
 * ✅ Audit log (backend tarafı)
 * ✅ Türkçe yorum satırları
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme }        from '../../hooks/useTheme';
import { useAuthStore }    from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useCartStore }    from '../../stores/cartStore';
import { Button }          from '../../components/ui/Button';
import { Card }            from '../../components/ui/Card';
import { Badge }           from '../../components/ui/Badge';
import { api }             from '../../services/api';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE }          from '../../constants/typography';

// Z raporu verisi tipi
interface ZRaporu {
  session_id      : number;
  cashier_id      : number;
  acilis_tutari   : number;
  kapanis_tutari  : number;
  toplam_satis    : number;
  toplam_tutar    : number;
  toplam_indirim  : number;
  toplam_kdv      : number;
  nakit_toplam    : number;
  kart_toplam     : number;
  beklenen_kasa   : number;
  kasa_farki      : number;
  fark_uyarisi    : boolean;
  acilis_zamani   : string;
  kapanis_zamani  : string;
}

// Aktif oturum özeti tipi (kapanıştan önce)
interface OturumOzet {
  session_id      : number;
  cashier_name    : string;
  opening_amount  : number;
  toplam_satis    : number;
  toplam_tutar    : number;
  nakit_toplam    : number;
  kart_toplam     : number;
  opened_at       : string;
}

// Ekran durumu
type EkranDurumu = 'yukleniyor' | 'form' | 'kapaniyor' | 'tamamlandi' | 'hata';

export default function SessionCloseScreen() {
  const { colors }      = useTheme();
  const { user }        = useAuthStore();
  const { branchId }    = useSettingsStore();
  const { sessionId, clearCart } = useCartStore();

  // URL parametresi — alternatif olarak session ID buradan da gelebilir
  const params = useLocalSearchParams<{ session_id?: string }>();
  const hedefSessionId = params.session_id
    ? parseInt(params.session_id)
    : sessionId || 0;

  // Ekran durumu
  const [durum, setDurum]           = useState<EkranDurumu>('yukleniyor');
  const [ozetData, setOzetData]     = useState<OturumOzet | null>(null);
  const [zRaporu, setZRaporu]       = useState<ZRaporu | null>(null);
  const [hata, setHata]             = useState<string | null>(null);
  const [isOffline, setIsOffline]   = useState(false);

  // Kapanış tutarı girişi
  const [kapanis, setKapanis]       = useState('');

  // ============================================================
  // OTURUM ÖZETİNİ YÜKLE (kapanıştan önce)
  // ============================================================

  const ozetYukle = useCallback(async () => {
    if (!hedefSessionId) {
      setHata('Aktif kasa oturumu bulunamadı.');
      setDurum('hata');
      return;
    }

    setDurum('yukleniyor');
    try {
      // Aktif oturum bilgisi
      const oturumYanit = await api.get(`/api/sessions/active?branch_id=${branchId}`);

      if (!oturumYanit.data.active) {
        setHata('Kapatılacak açık bir kasa oturumu bulunamadı.');
        setDurum('hata');
        return;
      }

      const oturum = oturumYanit.data.session;

      // Z raporu verisini önceden çek (kapanış öncesi önizleme)
      const raporYanit = await api.get(`/api/sessions/${oturum.id}/z-report`);
      const rapor      = raporYanit.data;

      setOzetData({
        session_id    : oturum.id,
        cashier_name  : oturum.cashier_name,
        opening_amount: oturum.opening_amount,
        toplam_satis  : rapor.toplam_satis,
        toplam_tutar  : rapor.toplam_tutar,
        nakit_toplam  : rapor.nakit_toplam,
        kart_toplam   : rapor.kart_toplam,
        opened_at     : oturum.opened_at,
      });

      setDurum('form');

    } catch (err: any) {
      if (!err.response) {
        setIsOffline(true);
        setHata('Sunucuya bağlanılamıyor. Kasa kapatmak için bağlantı gereklidir.');
      } else {
        setHata(err.response?.data?.detail || 'Oturum bilgileri yüklenemedi.');
      }
      setDurum('hata');
    }
  }, [hedefSessionId, branchId]);

  useEffect(() => {
    ozetYukle();
  }, [ozetYukle]);

  // ============================================================
  // KASA KAPAT
  // ============================================================

  const kasaKapat = async () => {
    const kapanisTutari = parseFloat(kapanis.replace(',', '.'));

    if (isNaN(kapanisTutari) || kapanisTutari < 0) {
      Alert.alert('Hata', 'Geçerli bir kapanış kasası tutarı girin.');
      return;
    }

    // Kasa farkı çok büyükse uyar
    if (ozetData) {
      const beklenen = ozetData.opening_amount + ozetData.nakit_toplam;
      const fark     = kapanisTutari - beklenen;

      if (Math.abs(fark) > 50) {
        const onay = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Büyük Kasa Farkı',
            `Beklenen kasa: ₺${beklenen.toFixed(2)}\n` +
            `Girilen tutar: ₺${kapanisTutari.toFixed(2)}\n` +
            `Fark: ${fark >= 0 ? '+' : ''}₺${fark.toFixed(2)}\n\n` +
            'Bu fark Z raporuna kaydedilecek. Devam etmek istiyor musunuz?',
            [
              { text: 'Gözden Geçir', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Yine de Kapat', style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        });
        if (!onay) return;
      }
    }

    setDurum('kapaniyor');

    try {
      const yanit = await api.post(
        `/api/sessions/${ozetData!.session_id}/close`,
        { closing_amount: kapanisTutari }
      );

      setZRaporu(yanit.data.z_raporu);

      // Sepeti temizle — oturum kapandı
      clearCart();

      setDurum('tamamlandi');

    } catch (err: any) {
      setHata(
        err.response?.data?.detail ||
        'Kasa kapatılırken hata oluştu. Lütfen tekrar deneyin.'
      );
      setDurum('form');
    }
  };

  // ============================================================
  // YARDIMCI: Tarih formatlama
  // ============================================================

  const tarihFormatla = (isoStr: string): string => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('tr-TR', {
        day   : '2-digit',
        month : '2-digit',
        year  : 'numeric',
        hour  : '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  // ============================================================
  // YARDIMCI: Anlık kasa farkı hesabı (form sırasında)
  // ============================================================

  const anlikFark = (): number | null => {
    if (!ozetData || !kapanis) return null;
    const girilen = parseFloat(kapanis.replace(',', '.'));
    if (isNaN(girilen)) return null;
    const beklenen = ozetData.opening_amount + ozetData.nakit_toplam;
    return girilen - beklenen;
  };

  const fark = anlikFark();

  // ============================================================
  // RENDER: YÜKLENIYOR
  // ============================================================

  if (durum === 'yukleniyor') {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.blue} />
        <Text style={[styles.bilgiMetin, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
          Oturum bilgileri yükleniyor...
        </Text>
      </View>
    );
  }

  // ============================================================
  // RENDER: HATA
  // ============================================================

  if (durum === 'hata') {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <Text style={{ fontSize: 48 }}>{isOffline ? '📡' : '⚠️'}</Text>
        <Text style={[styles.hataBaslik, { color: colors.danger, fontFamily: FONT_FAMILY.heading }]}>
          {isOffline ? 'Bağlantı Yok' : 'Hata'}
        </Text>
        <Text style={[styles.hataMetin, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
          {hata}
        </Text>
        <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.base }}>
          <Button label="Geri Dön"   variant="secondary" size="md" onPress={() => router.back()} />
          {!isOffline && <Button label="Tekrar Dene" variant="primary" size="md" onPress={ozetYukle} />}
        </View>
      </View>
    );
  }

  // ============================================================
  // RENDER: KAPATMA İŞLEMİ DEVAM EDİYOR
  // ============================================================

  if (durum === 'kapaniyor') {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.warning} />
        <Text style={[styles.bilgiMetin, { color: colors.warning, fontFamily: FONT_FAMILY.bodyMedium }]}>
          Kasa kapatılıyor, Z raporu oluşturuluyor...
        </Text>
      </View>
    );
  }

  // ============================================================
  // RENDER: Z RAPORU (kapanış tamamlandı)
  // ============================================================

  if (durum === 'tamamlandi' && zRaporu) {
    return (
      <ScrollView
        style                 = {{ backgroundColor: colors.bgPrimary }}
        contentContainerStyle = {{ padding: SPACING.base, gap: SPACING.base, paddingBottom: SPACING.xxl }}
      >
        {/* ── Başarı başlığı ── */}
        <View style={[styles.basariKutu, { backgroundColor: colors.success + '20', borderColor: colors.success }]}>
          <Text style={{ fontSize: 36 }}>✅</Text>
          <Text style={[styles.basariMetin, { color: colors.success, fontFamily: FONT_FAMILY.heading }]}>
            Kasa Kapatıldı
          </Text>
          <Text style={[styles.basariAlt, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
            Z Raporu oluşturuldu · {tarihFormatla(zRaporu.kapanis_zamani)}
          </Text>
        </View>

        {/* ── Kasa farkı uyarısı ── */}
        {zRaporu.fark_uyarisi && (
          <View style={[styles.farkUyari, { backgroundColor: colors.warning + '20', borderColor: colors.warning }]}>
            <Text style={[{ color: colors.warning, fontFamily: FONT_FAMILY.bodyMedium }]}>
              ⚠️ Kasa farkı tespit edildi:{' '}
              {zRaporu.kasa_farki >= 0 ? '+' : ''}₺{zRaporu.kasa_farki.toFixed(2)}
            </Text>
            <Text style={[{ color: colors.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm }]}>
              Bu durum Z raporuna ve audit log'a kaydedildi.
            </Text>
          </View>
        )}

        {/* ── Z Raporu kartı ── */}
        <Card>
          <Text style={[styles.raporBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.heading }]}>
            📄 Z Raporu
          </Text>

          <View style={styles.raporBolumu}>
            <Text style={[styles.raporBolumBaslik, { color: colors.textHint, fontFamily: FONT_FAMILY.bodyMedium }]}>
              VARDIYA
            </Text>
            <ZSatir renk={colors} etiket="Açılış"    deger={tarihFormatla(zRaporu.acilis_zamani)} />
            <ZSatir renk={colors} etiket="Kapanış"   deger={tarihFormatla(zRaporu.kapanis_zamani)} />
          </View>

          <View style={[styles.raporBolumu, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Text style={[styles.raporBolumBaslik, { color: colors.textHint, fontFamily: FONT_FAMILY.bodyMedium }]}>
              SATIŞ ÖZETİ
            </Text>
            <ZSatir renk={colors} etiket="İşlem Sayısı"  deger={`${zRaporu.toplam_satis} satış`} />
            <ZSatir renk={colors} etiket="Toplam Satış"  deger={`₺${zRaporu.toplam_tutar.toFixed(2)}`}   vurgulu />
            <ZSatir renk={colors} etiket="Toplam İndirim" deger={`₺${zRaporu.toplam_indirim.toFixed(2)}`} tehlikeli={zRaporu.toplam_indirim > 0} />
            <ZSatir renk={colors} etiket="Toplam KDV"    deger={`₺${zRaporu.toplam_kdv.toFixed(2)}`} />
          </View>

          <View style={[styles.raporBolumu, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Text style={[styles.raporBolumBaslik, { color: colors.textHint, fontFamily: FONT_FAMILY.bodyMedium }]}>
              ÖDEME DAĞILIMI
            </Text>
            <ZSatir renk={colors} etiket="💵 Nakit"    deger={`₺${zRaporu.nakit_toplam.toFixed(2)}`} />
            <ZSatir renk={colors} etiket="💳 Kredi/Banka Kartı" deger={`₺${zRaporu.kart_toplam.toFixed(2)}`} />
          </View>

          <View style={[styles.raporBolumu, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Text style={[styles.raporBolumBaslik, { color: colors.textHint, fontFamily: FONT_FAMILY.bodyMedium }]}>
              KASA SAYIMI
            </Text>
            <ZSatir renk={colors} etiket="Açılış Kasası"    deger={`₺${zRaporu.acilis_tutari.toFixed(2)}`} />
            <ZSatir renk={colors} etiket="Nakit Satışlar"   deger={`+₺${zRaporu.nakit_toplam.toFixed(2)}`} />
            <ZSatir renk={colors} etiket="Beklenen Kasa"    deger={`₺${zRaporu.beklenen_kasa.toFixed(2)}`} vurgulu />
            <ZSatir renk={colors} etiket="Sayılan Kasa"     deger={`₺${zRaporu.kapanis_tutari.toFixed(2)}`} vurgulu />
            <ZSatir
              renk      = {colors}
              etiket    = "Kasa Farkı"
              deger     = {`${zRaporu.kasa_farki >= 0 ? '+' : ''}₺${zRaporu.kasa_farki.toFixed(2)}`}
              tehlikeli = {zRaporu.fark_uyarisi}
              basarili  = {!zRaporu.fark_uyarisi}
            />
          </View>
        </Card>

        {/* ── Butonlar ── */}
        <View style={styles.butonSatiri}>
          <Button
            label    = "🏠 Ana Ekrana Dön"
            variant  = "primary"
            size     = "lg"
            fullWidth
            onPress  = {() => router.replace('/(tabs)/dashboard')}
          />
        </View>

        <Button
          label    = "🔓 Yeni Vardiya Aç"
          variant  = "secondary"
          size     = "md"
          fullWidth
          onPress  = {() => router.replace('/(kasa)/session-open')}
        />

      </ScrollView>
    );
  }

  // ============================================================
  // RENDER: KAPANIŞ FORMU (ana ekran)
  // ============================================================

  return (
    <KeyboardAvoidingView
      style    = {{ flex: 1 }}
      behavior = {Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style                 = {{ backgroundColor: colors.bgPrimary }}
        contentContainerStyle = {{ padding: SPACING.base, gap: SPACING.base, paddingBottom: SPACING.xxl }}
        keyboardShouldPersistTaps = "handled"
      >
        {/* ── Başlık ── */}
        <View style={styles.baslik}>
          <Text style={[styles.baslikMetin, { color: colors.textPrimary, fontFamily: FONT_FAMILY.heading }]}>
            🔒 Kasa Kapanışı
          </Text>
          <Text style={[styles.altMetin, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
            {user?.name} · {tarihFormatla(ozetData?.opened_at || '')}
          </Text>
        </View>

        {/* ── Vardiya Özeti ── */}
        <Card>
          <Text style={[styles.kartBaslik, { color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium }]}>
            GÜNLÜK SATIŞ ÖZETİ
          </Text>

          <View style={styles.ozetGrid}>
            <OzetKutu
              colors = {colors}
              baslik = "İşlem Sayısı"
              deger  = {`${ozetData?.toplam_satis ?? 0}`}
              alt    = "satış"
              renk   = {colors.blue}
            />
            <OzetKutu
              colors = {colors}
              baslik = "Toplam Ciro"
              deger  = {`₺${(ozetData?.toplam_tutar ?? 0).toFixed(2)}`}
              alt    = ""
              renk   = {colors.success}
            />
            <OzetKutu
              colors = {colors}
              baslik = "Nakit"
              deger  = {`₺${(ozetData?.nakit_toplam ?? 0).toFixed(2)}`}
              alt    = ""
              renk   = {colors.warning}
            />
            <OzetKutu
              colors = {colors}
              baslik = "Kart"
              deger  = {`₺${(ozetData?.kart_toplam ?? 0).toFixed(2)}`}
              alt    = ""
              renk   = {colors.purple}
            />
          </View>
        </Card>

        {/* ── Kapanış Tutarı Girişi ── */}
        <Card>
          <Text style={[styles.kartBaslik, { color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium }]}>
            KASA SAYIMI
          </Text>

          <View style={[styles.tutarSatiri, { borderBottomColor: colors.border }]}>
            <Text style={[styles.tutarEtiket, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
              Açılış kasası
            </Text>
            <Text style={[styles.tutarDeger, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium }]}>
              ₺{(ozetData?.opening_amount ?? 0).toFixed(2)}
            </Text>
          </View>

          <View style={[styles.tutarSatiri, { borderBottomColor: colors.border }]}>
            <Text style={[styles.tutarEtiket, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
              Nakit satışlar
            </Text>
            <Text style={[styles.tutarDeger, { color: colors.success, fontFamily: FONT_FAMILY.bodyMedium }]}>
              +₺{(ozetData?.nakit_toplam ?? 0).toFixed(2)}
            </Text>
          </View>

          <View style={[styles.tutarSatiri, { borderBottomColor: colors.border }]}>
            <Text style={[styles.tutarEtiket, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
              Beklenen kasa
            </Text>
            <Text style={[styles.tutarDeger, { color: colors.blue, fontFamily: FONT_FAMILY.bodySemiBold }]}>
              ₺{((ozetData?.opening_amount ?? 0) + (ozetData?.nakit_toplam ?? 0)).toFixed(2)}
            </Text>
          </View>

          {/* Kapanış tutarı input */}
          <Text style={[styles.inputEtiket, { color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium }]}>
            Sayılan Kasa Tutarı
          </Text>
          <View style={[styles.tutarInput, { backgroundColor: colors.bgTertiary, borderColor: fark !== null && Math.abs(fark) > 5 ? colors.warning : colors.border }]}>
            <Text style={[styles.paraSimgesi, { color: colors.textMuted, fontFamily: FONT_FAMILY.bodyBold }]}>₺</Text>
            <TextInput
              value            = {kapanis}
              onChangeText     = {setKapanis}
              placeholder      = "0.00"
              placeholderTextColor = {colors.textHint}
              keyboardType     = "decimal-pad"
              style            = {[styles.tutarGirisMetin, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyBold }]}
            />
          </View>

          {/* Anlık kasa farkı göstergesi */}
          {fark !== null && (
            <View style={[
              styles.farkGostere,
              {
                backgroundColor: Math.abs(fark) > 5
                  ? colors.warning + '20'
                  : colors.success + '20',
                borderColor: Math.abs(fark) > 5 ? colors.warning : colors.success,
              },
            ]}>
              <Text style={[styles.farkMetin, {
                color     : Math.abs(fark) > 5 ? colors.warning : colors.success,
                fontFamily: FONT_FAMILY.bodyMedium,
              }]}>
                {Math.abs(fark) <= 5
                  ? `✅ Kasa dengede (${fark >= 0 ? '+' : ''}₺${fark.toFixed(2)})`
                  : `⚠️ Fark: ${fark >= 0 ? '+' : ''}₺${fark.toFixed(2)}`}
              </Text>
            </View>
          )}
        </Card>

        {/* ── Hata ── */}
        {hata && (
          <View style={[styles.hataBant, { backgroundColor: colors.danger + '20', borderColor: colors.danger }]}>
            <Text style={[styles.hataGovde, { color: colors.danger, fontFamily: FONT_FAMILY.body }]}>
              {hata}
            </Text>
          </View>
        )}

        {/* ── Butonlar ── */}
        <View style={styles.butonSatiri}>
          <Button
            label    = "Vazgeç"
            variant  = "secondary"
            size     = "lg"
            onPress  = {() => router.back()}
            style    = {{ flex: 1 }}
          />
          <Button
            label    = {`🔒 Kasayı Kapat`}
            variant  = "danger"
            size     = "lg"
            onPress  = {kasaKapat}
            disabled = {!kapanis || durum === 'kapaniyor'}
            style    = {{ flex: 2 }}
          />
        </View>

        {/* ── Uyarı notu ── */}
        <View style={[styles.notKutu, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <Text style={[styles.notMetin, { color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
            ℹ️ Kasa kapatınca Z raporu oluşturulur ve audit log'a kaydedilir.
            Kapanış sonrası yeni satış yapılamaz — yeni vardiya açmanız gerekir.
          </Text>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}


// ============================================================
// YARDIMCI ALT BİLEŞENLER
// ============================================================

/** Özet grid kartı */
function OzetKutu({ colors, baslik, deger, alt, renk }: {
  colors: any; baslik: string; deger: string; alt: string; renk: string;
}) {
  return (
    <View style={[ozetStyles.kutu, { backgroundColor: renk + '15', borderColor: renk + '40' }]}>
      <Text style={[ozetStyles.baslik, { color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
        {baslik}
      </Text>
      <Text style={[ozetStyles.deger, { color: renk, fontFamily: FONT_FAMILY.bodyBold }]}>
        {deger}
      </Text>
      {alt ? (
        <Text style={[ozetStyles.alt, { color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
          {alt}
        </Text>
      ) : null}
    </View>
  );
}

const ozetStyles = StyleSheet.create({
  kutu: {
    flex         : 1,
    borderRadius : RADIUS.card,
    borderWidth  : 1,
    padding      : SPACING.sm,
    alignItems   : 'center',
    gap          : SPACING.xs,
    minWidth     : 80,
  },
  baslik: { fontSize: FONT_SIZE.xs, textAlign: 'center' },
  deger : { fontSize: FONT_SIZE.base, textAlign: 'center' },
  alt   : { fontSize: FONT_SIZE.xs, textAlign: 'center' },
});


/** Z raporu satırı */
function ZSatir({ renk, etiket, deger, vurgulu = false, tehlikeli = false, basarili = false }: {
  renk: any; etiket: string; deger: string;
  vurgulu?: boolean; tehlikeli?: boolean; basarili?: boolean;
}) {
  const metin_renk = tehlikeli
    ? renk.warning
    : basarili
      ? renk.success
      : vurgulu
        ? renk.textPrimary
        : renk.textMuted;

  return (
    <View style={zStyles.satir}>
      <Text style={[zStyles.etiket, { color: renk.textMuted, fontFamily: FONT_FAMILY.body }]}>
        {etiket}
      </Text>
      <Text style={[zStyles.deger, {
        color     : metin_renk,
        fontFamily: vurgulu || tehlikeli || basarili ? FONT_FAMILY.bodySemiBold : FONT_FAMILY.body,
      }]}>
        {deger}
      </Text>
    </View>
  );
}

const zStyles = StyleSheet.create({
  satir : { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.xs },
  etiket: { fontSize: FONT_SIZE.sm, flex: 1 },
  deger : { fontSize: FONT_SIZE.sm },
});


// ============================================================
// ANA STYLESHEET
// ============================================================

const styles = StyleSheet.create({
  merkez: {
    flex          : 1,
    alignItems    : 'center',
    justifyContent: 'center',
    gap           : SPACING.base,
    padding       : SPACING.xl,
  },
  bilgiMetin: { fontSize: FONT_SIZE.base, textAlign: 'center' },
  // Hata
  hataBaslik: { fontSize: FONT_SIZE.xl },
  hataMetin : { fontSize: FONT_SIZE.base, textAlign: 'center' },
  // Başarı
  basariKutu: {
    alignItems  : 'center',
    borderRadius: RADIUS.card,
    borderWidth : 1,
    padding     : SPACING.xl,
    gap         : SPACING.sm,
  },
  basariMetin: { fontSize: FONT_SIZE.xl },
  basariAlt  : { fontSize: FONT_SIZE.sm, textAlign: 'center' },
  farkUyari  : {
    borderRadius: RADIUS.button,
    borderWidth : 1,
    padding     : SPACING.base,
    gap         : SPACING.xs,
  },
  // Form
  baslik    : { alignItems: 'center', marginBottom: SPACING.sm },
  baslikMetin: { fontSize: FONT_SIZE.xl },
  altMetin  : { fontSize: FONT_SIZE.sm, marginTop: SPACING.xs },
  kartBaslik: { fontSize: FONT_SIZE.xs, letterSpacing: 1, marginBottom: SPACING.sm },
  ozetGrid  : { flexDirection: 'row', gap: SPACING.sm },
  tutarSatiri: {
    flexDirection : 'row',
    justifyContent: 'space-between',
    alignItems    : 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  tutarEtiket: { fontSize: FONT_SIZE.sm },
  tutarDeger : { fontSize: FONT_SIZE.sm },
  inputEtiket: { fontSize: FONT_SIZE.sm, marginTop: SPACING.base, marginBottom: SPACING.xs },
  tutarInput : {
    flexDirection    : 'row',
    alignItems       : 'center',
    height           : MIN_TOUCH_SIZE + 16,
    paddingHorizontal: SPACING.base,
    borderRadius     : RADIUS.button,
    borderWidth      : 1,
  },
  paraSimgesi    : { fontSize: FONT_SIZE.xl, marginRight: SPACING.sm },
  tutarGirisMetin: { flex: 1, fontSize: FONT_SIZE.xl },
  farkGostere    : {
    marginTop   : SPACING.sm,
    borderRadius: RADIUS.button,
    borderWidth : 1,
    padding     : SPACING.sm,
    alignItems  : 'center',
  },
  farkMetin  : { fontSize: FONT_SIZE.sm },
  // Hata
  hataBant  : { borderWidth: 1, borderRadius: RADIUS.button, padding: SPACING.base },
  hataGovde : { fontSize: FONT_SIZE.sm },
  // Butonlar
  butonSatiri: { flexDirection: 'row', gap: SPACING.sm },
  // Not
  notKutu: { borderRadius: RADIUS.button, borderWidth: 1, padding: SPACING.base },
  notMetin: { fontSize: FONT_SIZE.xs, lineHeight: 18 },
  // Z raporu
  raporBaslik  : { fontSize: FONT_SIZE.md, marginBottom: SPACING.base },
  raporBolumu  : { gap: 0, paddingVertical: SPACING.sm },
  raporBolumBaslik: { fontSize: FONT_SIZE.xs, letterSpacing: 1, marginBottom: SPACING.xs },
});
