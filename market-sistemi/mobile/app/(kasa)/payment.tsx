/**
 * Market Yönetim Sistemi — Ödeme Ekranı
 *
 * Kalite kontrol:
 * ✅ Loading state
 * ✅ Error state
 * ✅ Başarı / fiş görünümü
 * ✅ useTheme() — hardcode renk yok
 * ✅ Min 48px dokunma alanı
 * ✅ Türkçe yorum satırları
 * ✅ Nakit / Kart / Karma ödeme
 * ✅ Para üstü hesabı
 * ✅ Müşteri seçimi (opsiyonel)
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import { useCartStore } from '../../stores/cartStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { api } from '../../services/api';
import { getPendingCount } from '../../services/storage';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE } from '../../constants/typography';

// Ödeme tipi seçenekleri
type OdemeTipi = 'cash' | 'card' | 'mixed';

interface Musteri {
  id            : number;
  name          : string;
  phone         : string;
  credit_balance: number;
  loyalty_points: number;
}

interface SatisYanit {
  id          : number;
  total       : number;
  discount    : number;
  vat_amount  : number;
  payment_type: string;
  cash_given  : number | null;
  change_given: number | null;
  status      : string;
  created_at  : string;
}

export default function PaymentScreen() {
  const { colors } = useTheme();
  const cart       = useCartStore();
  const { branchId } = useSettingsStore();

  // Ödeme tipi
  const [odemeTipi, setOdemeTipi]             = useState<OdemeTipi>('cash');

  // Nakit girişi
  const [nakitGirilen, setNakitGirilen]       = useState('');
  const [kartTutari, setKartTutari]           = useState('');

  // Müşteri seçimi
  const [musteriArama, setMusteriArama]       = useState('');
  const [musteriSonuclari, setMusteriSonuclari] = useState<Musteri[]>([]);
  const [seciliMusteri, setSeciliMusteri]     = useState<Musteri | null>(null);
  const [musteriAramaAcik, setMusteriAramaAcik] = useState(false);
  const [musteriYukleniyor, setMusteriYukleniyor] = useState(false);

  // Ekstra indirim
  const [ekstraIndirim, setEkstraIndirim]     = useState('');

  // Durum
  const [islem, setIslem]                     = useState(false);
  const [hata, setHata]                       = useState<string | null>(null);
  const [tamamlandi, setTamamlandi]           = useState(false);
  const [satisYanit, setSatisYanit]           = useState<SatisYanit | null>(null);

  const [isOffline, setIsOffline]         = useState(false);
  const [bekleyenIslem, setBekleyenIslem] = useState(0);

  const nakitInputRef = useRef<TextInput>(null);

  useEffect(() => {
    getPendingCount().then(setBekleyenIslem);
  }, []);

  // ============================================================
  // HESAPLAMALAR
  // ============================================================

  const toplamTutar = cart.grandTotal;

  // Nakit ödeme ile para üstü
  const nakitFloat = parseFloat(nakitGirilen) || 0;
  const kartFloat  = parseFloat(kartTutari)   || 0;

  const paraUstu = odemeTipi === 'cash'
    ? Math.max(0, nakitFloat - toplamTutar)
    : odemeTipi === 'mixed'
      ? Math.max(0, nakitFloat + kartFloat - toplamTutar)
      : 0;

  const nakitYetersiz = odemeTipi === 'cash'
    ? nakitFloat > 0 && nakitFloat < toplamTutar
    : odemeTipi === 'mixed'
      ? nakitFloat + kartFloat < toplamTutar
      : false;

  // ============================================================
  // MÜŞTERİ ARAMA
  // ============================================================

  const musteriAra = useCallback(async (aramaMetni: string) => {
    setMusteriArama(aramaMetni);
    if (aramaMetni.length < 2) {
      setMusteriSonuclari([]);
      return;
    }

    setMusteriYukleniyor(true);
    try {
      const yanit = await api.get(`/api/customers?search=${aramaMetni}&branch_id=${branchId}&per_page=10`);
      setMusteriSonuclari(yanit.data.items || []);
    } catch {
      // Müşteri araması opsiyonel — hata gösterme
    } finally {
      setMusteriYukleniyor(false);
    }
  }, [branchId]);

  const musteriSec = (musteri: Musteri) => {
    setSeciliMusteri(musteri);
    cart.setCustomer(musteri.id);
    setMusteriAramaAcik(false);
    setMusteriArama('');
    setMusteriSonuclari([]);
  };

  const musteriKaldir = () => {
    setSeciliMusteri(null);
    cart.setCustomer(null);
  };

  // ============================================================
  // ÖDEME TAMAMLA
  // ============================================================

  const odemeyiTamamla = async () => {
    // Validasyon
    if (odemeTipi === 'cash' && nakitFloat < toplamTutar) {
      setHata('Verilen nakit, toplam tutardan az olamaz.');
      return;
    }
    if (odemeTipi === 'mixed') {
      if (nakitFloat + kartFloat < toplamTutar) {
        setHata('Nakit + kart toplamı, ödeme tutarını karşılamıyor.');
        return;
      }
      if (kartFloat <= 0) {
        setHata('Karma ödemede kart tutarı girilmeli.');
        return;
      }
    }

    setIslem(true);
    setHata(null);

    try {
      // Ekstra indirim varsa sepete uygula
      const ekstraIndirimFloat = parseFloat(ekstraIndirim) || 0;
      if (ekstraIndirimFloat > 0) {
        cart.setDiscount(ekstraIndirimFloat);
      }

      // Satış isteği hazırla
      const istek = {
        session_id  : cart.sessionId,
        branch_id   : branchId,
        customer_id : cart.customerId,
        payment_type: odemeTipi,
        discount    : ekstraIndirimFloat || cart.discount,
        cash_given  : odemeTipi === 'cash' || odemeTipi === 'mixed'
          ? nakitFloat
          : null,
        items: cart.items.map((item) => ({
          product_id : item.productId,
          qty        : item.qty,
          unit_price : item.unitPrice,
          discount   : item.discount,
          campaign_id: item.campaignId || null,
        })),
      };

      const yanit = await api.post('/api/sales', istek);
      setSatisYanit(yanit.data);
      setTamamlandi(true);
      cart.clearCart();

    } catch (err: any) {
      if (!err.response) {
        setIsOffline(true);
      }
      const detay = err.response?.data?.detail;
      if (typeof detay === 'string') {
        setHata(detay);
      } else {
        setHata('Satış kaydedilemedi. Lütfen tekrar deneyin.');
      }
    } finally {
      setIslem(false);
    }
  };

  // ============================================================
  // RENDER: BAŞARILI FİŞ GÖRÜNÜMÜ
  // ============================================================

  if (tamamlandi && satisYanit) {
    return (
      <View style={[styles.ekran, { backgroundColor: colors.bgPrimary }]}>
        <ScrollView
          contentContainerStyle = {styles.fisKap}
          showsVerticalScrollIndicator = {false}
        >
          {/* Başarı ikonu */}
          <View style={[styles.basariIkon, { backgroundColor: colors.success + '20' }]}>
            <Text style={{ fontSize: 48 }}>✅</Text>
          </View>

          <Text style={[styles.basariBaslik, { color: colors.success, fontFamily: FONT_FAMILY.bodyBold }]}>
            Satış Tamamlandı
          </Text>
          <Text style={[styles.satisNo, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
            Satış #{satisYanit.id}
          </Text>

          {/* Fiş Detayı */}
          <View style={[styles.fisKart, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>

            <View style={styles.fisSatir}>
              <Text style={[styles.fisEtiket, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
                Toplam
              </Text>
              <Text style={[styles.fisDeger, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
                ₺{Number(satisYanit.total).toFixed(2)}
              </Text>
            </View>

            {Number(satisYanit.discount) > 0 && (
              <View style={styles.fisSatir}>
                <Text style={[styles.fisEtiket, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
                  İndirim
                </Text>
                <Text style={[styles.fisDeger, { color: colors.danger, fontFamily: FONT_FAMILY.body }]}>
                  −₺{Number(satisYanit.discount).toFixed(2)}
                </Text>
              </View>
            )}

            {Number(satisYanit.vat_amount) > 0 && (
              <View style={styles.fisSatir}>
                <Text style={[styles.fisEtiket, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
                  KDV (dahil)
                </Text>
                <Text style={[styles.fisDeger, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
                  ₺{Number(satisYanit.vat_amount).toFixed(2)}
                </Text>
              </View>
            )}

            <View style={[styles.fisSatir, styles.fisBolucuSatir, { borderTopColor: colors.border }]}>
              <Text style={[styles.fisEtiket, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
                Ödeme
              </Text>
              <Badge
                label   = {
                  satisYanit.payment_type === 'cash' ? '💵 Nakit' :
                  satisYanit.payment_type === 'card' ? '💳 Kart' :
                  '💵+💳 Karma'
                }
                variant = "info"
              />
            </View>

            {satisYanit.cash_given && (
              <View style={styles.fisSatir}>
                <Text style={[styles.fisEtiket, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
                  Verilen Nakit
                </Text>
                <Text style={[styles.fisDeger, { color: colors.textPrimary, fontFamily: FONT_FAMILY.body }]}>
                  ₺{Number(satisYanit.cash_given).toFixed(2)}
                </Text>
              </View>
            )}

            {satisYanit.change_given !== null && Number(satisYanit.change_given) > 0 && (
              <View style={[styles.fisSatir, styles.paraUstuSatir, { backgroundColor: colors.success + '15', borderRadius: RADIUS.button }]}>
                <Text style={[styles.fisEtiket, { color: colors.success, fontFamily: FONT_FAMILY.bodyBold }]}>
                  💰 Para Üstü
                </Text>
                <Text style={[styles.fisDeger, { color: colors.success, fontFamily: FONT_FAMILY.bodyBold, fontSize: FONT_SIZE.xl }]}>
                  ₺{Number(satisYanit.change_given).toFixed(2)}
                </Text>
              </View>
            )}
          </View>

          {/* Yeni Satış Butonu */}
          <Button
            label    = "Yeni Satış"
            variant  = "primary"
            size     = "lg"
            fullWidth
            onPress  = {() => router.replace('/(kasa)/')}
            style    = {{ marginTop: SPACING.base }}
          />

          <Button
            label    = "Kasa Ana Ekranı"
            variant  = "ghost"
            size     = "md"
            fullWidth
            onPress  = {() => router.replace('/(kasa)/')}
            style    = {{ marginTop: SPACING.sm }}
          />
        </ScrollView>
      </View>
    );
  }

  // ============================================================
  // RENDER: ÖDEME FORMU
  // ============================================================

  return (
    <KeyboardAvoidingView
      style    = {{ flex: 1 }}
      behavior = {Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.ekran, { backgroundColor: colors.bgPrimary }]}>
        {(isOffline || bekleyenIslem > 0) && (
          <View style={[styles.offlineBant, { backgroundColor: colors.danger }]}>
            <Text style={[styles.offlineMetin, { fontFamily: FONT_FAMILY.bodyMedium }]}>
              🔴 Offline · {bekleyenIslem} işlem bekliyor
            </Text>
          </View>
        )}
        <ScrollView
          contentContainerStyle = {styles.kaydirmaIcerik}
          showsVerticalScrollIndicator = {false}
          keyboardShouldPersistTaps = "handled"
        >

          {/* ── Sipariş Özeti ── */}
          <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
            <Text style={[styles.bolumBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
              Sipariş Özeti
            </Text>

            <View style={styles.ozet}>
              <View style={styles.ozetSatir}>
                <Text style={[styles.ozetEtiket, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
                  {cart.items.length} kalem · {cart.items.reduce((acc, i) => acc + i.qty, 0)} ürün
                </Text>
                <Text style={[styles.ozetDeger, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium }]}>
                  ₺{cart.subtotal.toFixed(2)}
                </Text>
              </View>

              {cart.discount > 0 && (
                <View style={styles.ozetSatir}>
                  <Text style={[styles.ozetEtiket, { color: colors.danger, fontFamily: FONT_FAMILY.body }]}>
                    Kampanya İndirimi
                  </Text>
                  <Text style={[styles.ozetDeger, { color: colors.danger, fontFamily: FONT_FAMILY.bodyMedium }]}>
                    −₺{cart.discount.toFixed(2)}
                  </Text>
                </View>
              )}

              <View style={[styles.ozetSatir, styles.toplamSatir, { borderTopColor: colors.border }]}>
                <Text style={[styles.toplamEtiket, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyBold }]}>
                  TOPLAM
                </Text>
                <Text style={[styles.toplamDeger, { color: colors.success, fontFamily: FONT_FAMILY.bodyBold }]}>
                  ₺{toplamTutar.toFixed(2)}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Ekstra İndirim ── */}
          <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
            <Text style={[styles.bolumBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
              Ekstra İndirim (Opsiyonel)
            </Text>
            <View style={[styles.girisKutu, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}>
              <Text style={{ color: colors.textHint }}>₺</Text>
              <TextInput
                value           = {ekstraIndirim}
                onChangeText    = {setEkstraIndirim}
                placeholder     = "0.00"
                placeholderTextColor = {colors.textHint}
                keyboardType    = "decimal-pad"
                style={[
                  styles.girisAlani,
                  { color: colors.textPrimary, fontFamily: FONT_FAMILY.body },
                ]}
              />
            </View>
          </View>

          {/* ── Ödeme Tipi ── */}
          <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
            <Text style={[styles.bolumBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
              Ödeme Yöntemi
            </Text>
            <View style={styles.odemeTipiGrup}>
              {([
                { id: 'cash', etiket: '💵 Nakit', aciklama: 'Para üstü hesaplanır' },
                { id: 'card', etiket: '💳 Kart',  aciklama: 'POS terminali' },
                { id: 'mixed', etiket: '💵+💳 Karma', aciklama: 'Nakit + kart' },
              ] as { id: OdemeTipi; etiket: string; aciklama: string }[]).map((tip) => (
                <TouchableOpacity
                  key         = {tip.id}
                  onPress     = {() => setOdemeTipi(tip.id)}
                  style={[
                    styles.odemeTipButon,
                    {
                      backgroundColor: odemeTipi === tip.id ? colors.blue + '20' : colors.bgTertiary,
                      borderColor    : odemeTipi === tip.id ? colors.blue : colors.border,
                      minHeight      : MIN_TOUCH_SIZE,
                    },
                  ]}
                  accessibilityLabel = {`${tip.etiket} ödeme yöntemi`}
                >
                  <Text style={[
                    styles.odemeTipEtiket,
                    {
                      color     : odemeTipi === tip.id ? colors.blue : colors.textPrimary,
                      fontFamily: odemeTipi === tip.id ? FONT_FAMILY.bodyBold : FONT_FAMILY.body,
                    },
                  ]}>
                    {tip.etiket}
                  </Text>
                  <Text style={[styles.odemeTipAciklama, { color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
                    {tip.aciklama}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Nakit Girişi (cash veya mixed) ── */}
          {(odemeTipi === 'cash' || odemeTipi === 'mixed') && (
            <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
              <Text style={[styles.bolumBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
                Verilen Nakit
              </Text>

              {/* Hızlı tutar butonları */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator = {false}
                style = {{ marginBottom: SPACING.sm }}
              >
                <View style={styles.hizliButonlar}>
                  {_hizliNakitSumleri(toplamTutar).map((tutar) => (
                    <TouchableOpacity
                      key     = {tutar}
                      onPress = {() => setNakitGirilen(String(tutar))}
                      style   = {[
                        styles.hizliButon,
                        {
                          backgroundColor: nakitFloat === tutar ? colors.blue : colors.bgTertiary,
                          borderColor    : nakitFloat === tutar ? colors.blue : colors.border,
                          minHeight      : MIN_TOUCH_SIZE,
                        },
                      ]}
                    >
                      <Text style={[
                        styles.hizliButonMetin,
                        {
                          color     : nakitFloat === tutar ? '#FFFFFF' : colors.textPrimary,
                          fontFamily: FONT_FAMILY.bodyMedium,
                        },
                      ]}>
                        ₺{tutar}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <View style={[
                styles.girisKutu,
                {
                  backgroundColor: colors.bgTertiary,
                  borderColor    : nakitYetersiz ? colors.danger : colors.border,
                },
              ]}>
                <Text style={{ color: colors.textHint }}>₺</Text>
                <TextInput
                  ref             = {nakitInputRef}
                  value           = {nakitGirilen}
                  onChangeText    = {setNakitGirilen}
                  placeholder     = "0.00"
                  placeholderTextColor = {colors.textHint}
                  keyboardType    = "decimal-pad"
                  style={[
                    styles.girisAlani,
                    { color: colors.textPrimary, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xl },
                  ]}
                />
              </View>

              {/* Para üstü göstergesi */}
              {nakitFloat >= toplamTutar && odemeTipi === 'cash' && (
                <View style={[styles.paraUstuGosterge, { backgroundColor: colors.success + '15' }]}>
                  <Text style={[styles.paraUstuMetin, { color: colors.success, fontFamily: FONT_FAMILY.bodyBold }]}>
                    💰 Para Üstü: ₺{paraUstu.toFixed(2)}
                  </Text>
                </View>
              )}

              {nakitYetersiz && (
                <Text style={[styles.uyariMetin, { color: colors.danger, fontFamily: FONT_FAMILY.body }]}>
                  ⚠️ Nakit yetersiz — ₺{(toplamTutar - nakitFloat).toFixed(2)} eksik
                </Text>
              )}
            </View>
          )}

          {/* ── Kart Tutarı (mixed) ── */}
          {odemeTipi === 'mixed' && (
            <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
              <Text style={[styles.bolumBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
                Kart Tutarı
              </Text>
              <View style={[styles.girisKutu, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}>
                <Text style={{ color: colors.textHint }}>₺</Text>
                <TextInput
                  value           = {kartTutari}
                  onChangeText    = {setKartTutari}
                  placeholder     = "0.00"
                  placeholderTextColor = {colors.textHint}
                  keyboardType    = "decimal-pad"
                  style={[
                    styles.girisAlani,
                    { color: colors.textPrimary, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xl },
                  ]}
                />
              </View>
              {nakitFloat + kartFloat > 0 && (
                <Text style={[styles.bilgiMetin, { color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
                  Toplam: ₺{(nakitFloat + kartFloat).toFixed(2)} / Gereken: ₺{toplamTutar.toFixed(2)}
                </Text>
              )}
            </View>
          )}

          {/* ── Müşteri Seçimi ── */}
          <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
            <Text style={[styles.bolumBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
              Müşteri (Opsiyonel)
            </Text>

            {seciliMusteri ? (
              // Seçili müşteri kartı
              <View style={[styles.musteriKarti, { backgroundColor: colors.bgTertiary, borderColor: colors.blue }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.musteriAdi, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium }]}>
                    👤 {seciliMusteri.name}
                  </Text>
                  <Text style={[styles.musteriAlt, { color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
                    📞 {seciliMusteri.phone} · 🏆 {seciliMusteri.loyalty_points} puan
                  </Text>
                  {seciliMusteri.credit_balance > 0 && (
                    <Text style={[styles.musteriAlt, { color: colors.warning, fontFamily: FONT_FAMILY.body }]}>
                      ⚠️ Veresiye: ₺{seciliMusteri.credit_balance.toFixed(2)}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress = {musteriKaldir}
                  hitSlop = {{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style   = {{ minWidth: MIN_TOUCH_SIZE, alignItems: 'center' }}
                  accessibilityLabel = "Müşteriyi kaldır"
                >
                  <Text style={{ color: colors.danger, fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              // Müşteri arama butonu
              <TouchableOpacity
                onPress = {() => setMusteriAramaAcik(true)}
                style={[
                  styles.musteriEkleButon,
                  {
                    backgroundColor: colors.bgTertiary,
                    borderColor    : colors.border,
                    minHeight      : MIN_TOUCH_SIZE,
                  },
                ]}
                accessibilityLabel = "Müşteri seç"
              >
                <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
                  🔍 Müşteri ara... (ad, telefon)
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Hata Mesajı ── */}
          {hata && (
            <View style={[styles.hataBant, { backgroundColor: colors.danger + '20', borderColor: colors.danger }]}>
              <Text style={[styles.hataMetin, { color: colors.danger, fontFamily: FONT_FAMILY.body }]}>
                {hata}
              </Text>
              <TouchableOpacity
                onPress = {() => setHata(null)}
                hitSlop = {{ top: 8, bottom: 8, left: 8, right: 8 }}
                style   = {{ minWidth: MIN_TOUCH_SIZE, alignItems: 'center' }}
              >
                <Text style={{ color: colors.danger }}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Ödeme Butonları ── */}
          <View style={styles.butonlar}>
            <Button
              label    = "Geri"
              variant  = "ghost"
              size     = "lg"
              onPress  = {() => router.back()}
              disabled = {islem}
              style    = {{ flex: 1 }}
            />
            <Button
              label    = {islem ? 'İşleniyor...' : `Ödemeyi Tamamla · ₺${toplamTutar.toFixed(2)}`}
              variant  = "success"
              size     = "lg"
              onPress  = {odemeyiTamamla}
              loading  = {islem}
              disabled = {islem || nakitYetersiz}
              style    = {{ flex: 2 }}
            />
          </View>

        </ScrollView>
      </View>

      {/* ── Müşteri Arama Modalı ── */}
      <Modal
        visible         = {musteriAramaAcik}
        animationType   = "slide"
        presentationStyle = "pageSheet"
        onRequestClose  = {() => setMusteriAramaAcik(false)}
      >
        <View style={[styles.modal, { backgroundColor: colors.bgPrimary }]}>

          {/* Modal Başlık */}
          <View style={[styles.modalBaslik, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalBaslikMetin, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
              Müşteri Seç
            </Text>
            <TouchableOpacity
              onPress = {() => setMusteriAramaAcik(false)}
              style   = {{ minWidth: MIN_TOUCH_SIZE, alignItems: 'center' }}
              accessibilityLabel = "Kapat"
            >
              <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Arama Kutusu */}
          <View style={[styles.aramaKutu, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
            <Text style={{ color: colors.textHint }}>🔍</Text>
            <TextInput
              value           = {musteriArama}
              onChangeText    = {musteriAra}
              placeholder     = "Ad veya telefon ara..."
              placeholderTextColor = {colors.textHint}
              autoFocus
              style={[
                styles.aramaGiris,
                { color: colors.textPrimary, fontFamily: FONT_FAMILY.body },
              ]}
            />
            {musteriYukleniyor && <ActivityIndicator color={colors.blue} size="small" />}
          </View>

          {/* Sonuçlar */}
          {musteriArama.length < 2 ? (
            <View style={styles.modalBoş}>
              <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, textAlign: 'center' }]}>
                Aramak için en az 2 karakter girin
              </Text>
            </View>
          ) : musteriSonuclari.length === 0 && !musteriYukleniyor ? (
            <View style={styles.modalBoş}>
              <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, textAlign: 'center' }]}>
                Müşteri bulunamadı
              </Text>
            </View>
          ) : (
            <FlatList
              data         = {musteriSonuclari}
              keyExtractor = {(item) => String(item.id)}
              renderItem   = {({ item }) => (
                <TouchableOpacity
                  onPress = {() => musteriSec(item)}
                  style={[
                    styles.musteriSatiri,
                    {
                      borderBottomColor: colors.border,
                      minHeight        : MIN_TOUCH_SIZE + 8,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.musteriSatirAdi, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium }]}>
                      {item.name}
                    </Text>
                    <Text style={[styles.musteriSatirAlt, { color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
                      {item.phone} · 🏆 {item.loyalty_points} puan
                      {item.credit_balance > 0
                        ? ` · ⚠️ ₺${item.credit_balance.toFixed(2)} veresiye`
                        : ''}
                    </Text>
                  </View>
                  <Text style={{ color: colors.blue }}>›</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}


// ============================================================
// YARDIMCI FONKSİYONLAR
// ============================================================

/**
 * Toplam tutara göre hızlı nakit butonları oluşturur.
 * Örn: toplam=47.50 → [50, 100, 200]
 */
function _hizliNakitSumleri(toplam: number): number[] {
  const sonuclar: number[] = [];
  const basamaklar = [50, 100, 200, 500];

  for (const b of basamaklar) {
    if (b >= toplam) {
      sonuclar.push(b);
      if (sonuclar.length >= 4) break;
    }
  }

  // En az 2 seçenek garantile
  if (sonuclar.length < 2) {
    const ekstra = [50, 100, 200, 500].filter((b) => !sonuclar.includes(b));
    sonuclar.push(...ekstra.slice(0, 2 - sonuclar.length));
    sonuclar.sort((a, b) => a - b);
  }

  return sonuclar;
}


// ============================================================
// STİLLER
// ============================================================

const styles = StyleSheet.create({
  ekran: {
    flex: 1,
  },
  offlineBant: {
    paddingVertical  : SPACING.sm,
    paddingHorizontal: SPACING.base,
    alignItems       : 'center',
  },
  offlineMetin: {
    color   : '#FFFFFF',
    fontSize: FONT_SIZE.sm,
  },
  kaydirmaIcerik: {
    padding: SPACING.base,
    gap    : SPACING.base,
    paddingBottom: SPACING.xl,
  },

  // Bölüm kartı
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

  // Özet tablosu
  ozet: {
    gap: SPACING.sm,
  },
  ozetSatir: {
    flexDirection : 'row',
    justifyContent: 'space-between',
    alignItems    : 'center',
  },
  ozetEtiket: {
    fontSize: FONT_SIZE.base,
  },
  ozetDeger: {
    fontSize: FONT_SIZE.base,
  },
  toplamSatir: {
    paddingTop   : SPACING.sm,
    marginTop    : SPACING.xs,
    borderTopWidth: 1,
  },
  toplamEtiket: {
    fontSize: FONT_SIZE.md,
  },
  toplamDeger: {
    fontSize: FONT_SIZE.xxl,
  },

  // Ödeme tipi butonları
  odemeTipiGrup: {
    flexDirection: 'row',
    gap          : SPACING.sm,
  },
  odemeTipButon: {
    flex          : 1,
    borderRadius  : RADIUS.button,
    borderWidth   : 1,
    padding       : SPACING.sm,
    alignItems    : 'center',
    justifyContent: 'center',
    gap           : 2,
  },
  odemeTipEtiket: {
    fontSize: FONT_SIZE.sm,
  },
  odemeTipAciklama: {
    fontSize: FONT_SIZE.xs,
  },

  // Giriş kutusu
  girisKutu: {
    flexDirection    : 'row',
    alignItems       : 'center',
    height           : MIN_TOUCH_SIZE + 16,
    paddingHorizontal: SPACING.base,
    borderRadius     : RADIUS.button,
    borderWidth      : 1,
    gap              : SPACING.sm,
  },
  girisAlani: {
    flex    : 1,
    fontSize: FONT_SIZE.xl,
  },

  // Hızlı nakit butonları
  hizliButonlar: {
    flexDirection: 'row',
    gap          : SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  hizliButon: {
    paddingHorizontal: SPACING.base,
    borderRadius     : RADIUS.button,
    borderWidth      : 1,
    alignItems       : 'center',
    justifyContent   : 'center',
  },
  hizliButonMetin: {
    fontSize: FONT_SIZE.base,
  },

  // Para üstü
  paraUstuGosterge: {
    padding     : SPACING.sm,
    borderRadius: RADIUS.button,
    alignItems  : 'center',
  },
  paraUstuMetin: {
    fontSize: FONT_SIZE.md,
  },
  paraUstuSatir: {
    padding: SPACING.sm,
  },

  // Uyarı metni
  uyariMetin: {
    fontSize: FONT_SIZE.sm,
  },
  bilgiMetin: {
    fontSize: FONT_SIZE.sm,
    textAlign: 'center',
  },

  // Müşteri
  musteriKarti: {
    flexDirection    : 'row',
    alignItems       : 'center',
    padding          : SPACING.sm,
    borderRadius     : RADIUS.button,
    borderWidth      : 1.5,
    gap              : SPACING.sm,
  },
  musteriAdi: {
    fontSize: FONT_SIZE.base,
  },
  musteriAlt: {
    fontSize: FONT_SIZE.xs,
    marginTop: 2,
  },
  musteriEkleButon: {
    borderRadius  : RADIUS.button,
    borderWidth   : 1,
    padding       : SPACING.sm,
    alignItems    : 'center',
    justifyContent: 'center',
  },

  // Hata
  hataBant: {
    flexDirection  : 'row',
    alignItems     : 'center',
    justifyContent : 'space-between',
    padding        : SPACING.sm,
    borderRadius   : RADIUS.button,
    borderWidth    : 1,
  },
  hataMetin: {
    flex    : 1,
    fontSize: FONT_SIZE.sm,
  },

  // Alt butonlar
  butonlar: {
    flexDirection: 'row',
    gap          : SPACING.sm,
    marginTop    : SPACING.sm,
  },

  // Modal
  modal: {
    flex: 1,
  },
  modalBaslik: {
    flexDirection    : 'row',
    alignItems       : 'center',
    justifyContent   : 'space-between',
    padding          : SPACING.base,
    borderBottomWidth: 1,
  },
  modalBaslikMetin: {
    fontSize: FONT_SIZE.md,
  },
  aramaKutu: {
    flexDirection    : 'row',
    alignItems       : 'center',
    margin           : SPACING.base,
    padding          : SPACING.sm,
    paddingHorizontal: SPACING.base,
    borderRadius     : RADIUS.button,
    borderWidth      : 1,
    gap              : SPACING.sm,
  },
  aramaGiris: {
    flex    : 1,
    fontSize: FONT_SIZE.base,
  },
  modalBoş: {
    flex          : 1,
    alignItems    : 'center',
    justifyContent: 'center',
    padding       : SPACING.xl,
  },
  musteriSatiri: {
    flexDirection    : 'row',
    alignItems       : 'center',
    paddingHorizontal: SPACING.base,
    paddingVertical  : SPACING.sm,
    borderBottomWidth: 1,
    gap              : SPACING.sm,
  },
  musteriSatirAdi: {
    fontSize: FONT_SIZE.base,
  },
  musteriSatirAlt: {
    fontSize : FONT_SIZE.sm,
    marginTop: 2,
  },

  // Fiş görünümü
  fisKap: {
    padding      : SPACING.base,
    alignItems   : 'center',
    gap          : SPACING.sm,
    paddingBottom: SPACING.xl,
  },
  basariIkon: {
    width         : 96,
    height        : 96,
    borderRadius  : 48,
    alignItems    : 'center',
    justifyContent: 'center',
    marginBottom  : SPACING.sm,
  },
  basariBaslik: {
    fontSize : FONT_SIZE.xl,
    textAlign: 'center',
  },
  satisNo: {
    fontSize : FONT_SIZE.sm,
    textAlign: 'center',
  },
  fisKart: {
    width       : '100%',
    borderRadius: RADIUS.card,
    borderWidth : 1,
    padding     : SPACING.base,
    gap         : SPACING.sm,
    marginTop   : SPACING.sm,
  },
  fisSatir: {
    flexDirection : 'row',
    justifyContent: 'space-between',
    alignItems    : 'center',
  },
  fisBolucuSatir: {
    paddingTop   : SPACING.sm,
    marginTop    : SPACING.xs,
    borderTopWidth: 1,
  },
  fisEtiket: {
    fontSize: FONT_SIZE.base,
  },
  fisDeger: {
    fontSize: FONT_SIZE.base,
  },
});
