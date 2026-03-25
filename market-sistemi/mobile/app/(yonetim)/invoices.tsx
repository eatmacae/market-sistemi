/**
 * Market Yönetim Sistemi — Fatura Yönetimi Ekranı
 * PDF / Excel / Word fatura yükleme → önizleme → onay akışı.
 *
 * Akış:
 *   liste → (dosya seç) → yukleniyor → onizleme → (onayla) → onaylaniyor → tamamlandi
 *                                                                          ↓ hata
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
  TextInput,
  RefreshControl,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect }   from 'expo-router';

import { useTheme }         from '../../hooks/useTheme';
import { useAuthStore }     from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { getPendingCount } from '../../services/storage';
import { SPACING } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE } from '../../constants/typography';
import { WHITE, ACCENT } from '../../constants/colors';

// ============================================================
// TİPLER
// ============================================================

type EslesmeTipi = 'barcode' | 'fuzzy' | 'unmatched';

interface OnizlemeSatiri {
  invoice_item  : {
    description ?: string;
    barcode     ?: string;
    qty          : number;
    unit        ?: string;
    unit_price  ?: number;
    line_total  ?: number;
  };
  product_id    : number | null;
  product_name  : string | null;
  match_type    : EslesmeTipi;
  confidence    : number;
  yeni_maliyet  : number;
  mevcut_maliyet: number | null;
  mevcut_fiyat  : number | null;
  oneri_fiyat   : number | null;
  // Kullanıcının üzerinde oynayabileceği alan
  onaylandi     : boolean;
}

interface OnizlemeSonucu {
  invoice_id  : number;
  dosya       : string;
  satir_sayisi: number;
  eslesen     : number;
  eslesmeyen  : number;
  onizleme    : OnizlemeSatiri[];
}

interface FaturaOzet {
  id         : number;
  file_name  : string;
  file_type  : string;
  status     : 'pending' | 'approved' | 'rolled_back';
  created_at : string;
  approved_at: string | null;
}

type Ekran =
  | 'liste'
  | 'yukleniyor'
  | 'onizleme'
  | 'onaylaniyor'
  | 'tamamlandi'
  | 'hata';

// ============================================================
// YARDIMCI FONKSİYONLAR
// ============================================================

function eslemeRengi(tip: EslesmeTipi, confidence: number): string {
  if (tip === 'unmatched') return ACCENT.danger;
  if (tip === 'barcode')   return ACCENT.success;
  // fuzzy
  return confidence >= 80 ? ACCENT.success : ACCENT.warning;
}

function eslemeEtiketi(tip: EslesmeTipi, confidence: number): string {
  if (tip === 'barcode')   return '✔ Barkod';
  if (tip === 'unmatched') return '✗ Eşleşmedi';
  return `~ Bulanık %${confidence}`;
}

function durumuCevir(status: string): string {
  switch (status) {
    case 'pending':     return 'Bekliyor';
    case 'approved':    return 'Onaylandı';
    case 'rolled_back': return 'Geri Alındı';
    default:            return status;
  }
}

function durumuRenk(status: string, colors: ReturnType<typeof useTheme>['colors']): string {
  switch (status) {
    case 'pending':     return ACCENT.warning;
    case 'approved':    return ACCENT.success;
    case 'rolled_back': return ACCENT.danger;
    default:            return colors.textMuted;
  }
}

// ============================================================
// ANA BİLEŞEN
// ============================================================

export default function FaturaYonetimi() {
  const { colors }             = useTheme();
  const { token }              = useAuthStore();
  const { serverUrl, branchId } = useSettingsStore();

  const [ekran, setEkran]                     = useState<Ekran>('liste');
  const [hataMesaji, setHataMesaji]           = useState('');
  const [isOffline, setIsOffline]         = useState(false);
  const [bekleyenIslem, setBekleyenIslem] = useState(0);
  const [faturaListesi, setFaturaListesi]     = useState<FaturaOzet[]>([]);
  const [listeYukleniyor, setListeYukleniyor] = useState(false);
  const [yenileniyor, setYenileniyor]         = useState(false);
  const [onizleme, setOnizleme]               = useState<OnizlemeSonucu | null>(null);
  const [satirlar, setSatirlar]               = useState<OnizlemeSatiri[]>([]);
  const [tamamlandiSonuc, setTamamlandiSonuc] = useState<{
    guncellenen: number;
    atlanmis   : number;
    invoice_id : number;
    dosya      : string;
  } | null>(null);
  const [carpanlar, setCarpanlar]             = useState({ koli: '', paket: '' });
  const [carpanlarAcik, setCarpanlarAcik]     = useState(false);

  const s = styles(colors);

  // ============================================================
  // FATURA LİSTESİNİ YÜKLEYİ
  // ============================================================

  const faturaListesiniYukle = useCallback(async (yenile = false) => {
    if (yenile) {
      setYenileniyor(true);
    } else {
      setListeYukleniyor(true);
    }

    try {
      const yanit = await fetch(
        `${serverUrl}/api/invoices?branch_id=${branchId}&per_page=30`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`);
      const veri = await yanit.json();
      setFaturaListesi(veri.items ?? []);
      setIsOffline(false);
    } catch (err: any) {
      if (!err.response && !(err instanceof Response)) setIsOffline(true);
      setHataMesaji(err.message ?? 'Fatura listesi yüklenemedi.');
      setEkran('hata');
    } finally {
      setListeYukleniyor(false);
      setYenileniyor(false);
    }
  }, [serverUrl, token, branchId]);

  useFocusEffect(
    useCallback(() => {
      faturaListesiniYukle();
      getPendingCount().then(setBekleyenIslem);
    }, [faturaListesiniYukle]),
  );

  // ============================================================
  // DOSYA SEÇ & YÜKLE
  // ============================================================

  const dosyaSec = async () => {
    try {
      const sonuc = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        copyToCacheDirectory: true,
      });

      // Kullanıcı iptal etti
      if (sonuc.canceled) return;

      const dosya = sonuc.assets[0];
      if (!dosya) return;

      await faturaYukle(dosya.uri, dosya.name ?? 'fatura', dosya.mimeType ?? 'application/pdf');
    } catch (err: any) {
      Alert.alert('Hata', 'Dosya seçilemedi: ' + (err.message ?? ''));
    }
  };

  const faturaYukle = async (uri: string, isim: string, mimeType: string) => {
    setEkran('yukleniyor');
    setHataMesaji('');

    try {
      // Çarpanları query string'e ekle
      let multiplierParam = '';
      const carpanObj: Record<string, string> = {};
      if (carpanlar.koli)  carpanObj['koli']  = carpanlar.koli;
      if (carpanlar.paket) carpanObj['paket'] = carpanlar.paket;
      if (Object.keys(carpanObj).length > 0) {
        multiplierParam = `&multipliers=${encodeURIComponent(JSON.stringify(carpanObj))}`;
      }

      // FormData ile dosya yükle
      const form = new FormData();
      form.append('file', {
        uri,
        name: isim,
        type: mimeType,
      } as any);

      const yanit = await fetch(
        `${serverUrl}/api/invoices/preview?branch_id=${branchId}${multiplierParam}`,
        {
          method : 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            // Content-Type'ı elle YAZMA — fetch otomatik boundary ekler
          },
          body: form,
        },
      );

      if (!yanit.ok) {
        const hata = await yanit.json();
        throw new Error(hata.detail ?? `HTTP ${yanit.status}`);
      }

      const veri: OnizlemeSonucu = await yanit.json();
      setOnizleme(veri);
      setSatirlar(veri.onizleme);
      setEkran('onizleme');
    } catch (err: any) {
      setHataMesaji(err.message ?? 'Fatura yüklenemedi.');
      setEkran('hata');
    }
  };

  // ============================================================
  // ONAYLA
  // ============================================================

  const onayla = async () => {
    if (!onizleme) return;

    // Kaç satır onaylandı?
    const onaylananlar = satirlar.filter(s => s.onaylandi && s.product_id !== null);
    if (onaylananlar.length === 0) {
      Alert.alert('Uyarı', 'Onaylanacak eşleşen ürün yok.');
      return;
    }

    Alert.alert(
      'Faturayı Onayla',
      `${onaylananlar.length} ürün için stok ve maliyet güncellenecek. Devam edilsin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text   : 'Onayla',
          style  : 'default',
          onPress: () => _onayla(onizleme.invoice_id),
        },
      ],
    );
  };

  const _onayla = async (invoiceId: number) => {
    setEkran('onaylaniyor');

    try {
      const yanit = await fetch(
        `${serverUrl}/api/invoices/${invoiceId}/approve`,
        {
          method : 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(satirlar),
        },
      );

      if (!yanit.ok) {
        const hata = await yanit.json();
        throw new Error(hata.detail ?? `HTTP ${yanit.status}`);
      }

      const sonuc = await yanit.json();
      setTamamlandiSonuc({
        guncellenen: sonuc.guncellenen,
        atlanmis   : sonuc.atlanmis,
        invoice_id : invoiceId,
        dosya      : onizleme?.dosya ?? '',
      });
      setEkran('tamamlandi');
      // Listeyi arka planda yenile
      faturaListesiniYukle(true);
    } catch (err: any) {
      setHataMesaji(err.message ?? 'Onay işlemi başarısız.');
      setEkran('hata');
    }
  };

  // ============================================================
  // ONAY DURUMU TOGGLE
  // ============================================================

  const satiriToggle = (index: number) => {
    setSatirlar(prev =>
      prev.map((s, i) =>
        i === index ? { ...s, onaylandi: !s.onaylandi } : s,
      ),
    );
  };

  // ============================================================
  // EKRANLAR
  // ============================================================

  // --- YÜKLEME SPİNNERİ ---
  if (ekran === 'yukleniyor' || ekran === 'onaylaniyor') {
    const mesaj = ekran === 'yukleniyor'
      ? 'Fatura okunuyor ve ürünler eşleştiriliyor...'
      : 'Stok ve fiyatlar güncelleniyor...';

    return (
      <View style={s.merkez}>
        <ActivityIndicator size="large" color="#4F8EF7" />
        <Text style={s.yuklemeMetin}>{mesaj}</Text>
        {ekran === 'yukleniyor' && (
          <Text style={s.altMetin}>
            PDF dosyalar AI ile analiz edilir, biraz sürebilir.
          </Text>
        )}
      </View>
    );
  }

  // --- TAMAMLANDI ---
  if (ekran === 'tamamlandi' && tamamlandiSonuc) {
    return (
      <ScrollView contentContainerStyle={s.merkez}>
        <Text style={s.basariIkon}>✅</Text>
        <Text style={s.basariBaslik}>Fatura Onaylandı</Text>
        <Text style={s.basariDosya}>{tamamlandiSonuc.dosya}</Text>

        <View style={s.sonucKart}>
          <View style={s.sonucSatir}>
            <Text style={s.sonucEtiket}>Güncellenen Ürün</Text>
            <Text style={[s.sonucDeger, { color: '#12C98A' }]}>
              {tamamlandiSonuc.guncellenen}
            </Text>
          </View>
          <View style={[s.sonucSatir, s.sonucSatirAra]}>
            <Text style={s.sonucEtiket}>Atlanan Satır</Text>
            <Text style={[s.sonucDeger, { color: '#F5A623' }]}>
              {tamamlandiSonuc.atlanmis}
            </Text>
          </View>
          <View style={s.sonucSatir}>
            <Text style={s.sonucEtiket}>Fatura No</Text>
            <Text style={s.sonucDeger}># {tamamlandiSonuc.invoice_id}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={s.butonPrimary}
          onPress={() => setEkran('liste')}
        >
          <Text style={s.butonPrimaryMetin}>Fatura Listesine Dön</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // --- HATA ---
  if (ekran === 'hata') {
    return (
      <View style={s.merkez}>
        <Text style={s.hataIkon}>⚠️</Text>
        <Text style={s.hataBaslik}>Bir Hata Oluştu</Text>
        <Text style={s.hataMesaj}>{hataMesaji}</Text>
        <TouchableOpacity
          style={s.butonPrimary}
          onPress={() => {
            setEkran('liste');
            faturaListesiniYukle();
          }}
        >
          <Text style={s.butonPrimaryMetin}>Geri Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- ÖNİZLEME ---
  if (ekran === 'onizleme' && onizleme) {
    const onaylananSayisi  = satirlar.filter(s => s.onaylandi && s.product_id).length;
    const eslesmeyen       = satirlar.filter(s => s.match_type === 'unmatched').length;

    return (
      <View style={s.kapsayici}>
        {/* Özet başlık */}
        <View style={s.onizlemeBaslik}>
          <Text style={s.onizlemeBaslikMetin} numberOfLines={1}>
            📄 {onizleme.dosya}
          </Text>
          <View style={s.onizlemeIstatistik}>
            <View style={s.istatistikItem}>
              <Text style={[s.istatistikSayi, { color: '#12C98A' }]}>
                {onizleme.eslesen}
              </Text>
              <Text style={s.istatistikEtiket}>Eşleşti</Text>
            </View>
            <View style={s.istatistikItem}>
              <Text style={[s.istatistikSayi, { color: '#F04F4F' }]}>
                {onizleme.eslesmeyen}
              </Text>
              <Text style={s.istatistikEtiket}>Eşleşmedi</Text>
            </View>
            <View style={s.istatistikItem}>
              <Text style={[s.istatistikSayi, { color: '#4F8EF7' }]}>
                {onizleme.satir_sayisi}
              </Text>
              <Text style={s.istatistikEtiket}>Toplam</Text>
            </View>
          </View>
        </View>

        {/* Eşleşmeyen uyarısı */}
        {eslesmeyen > 0 && (
          <View style={s.uyariSerit}>
            <Text style={s.uyariMetin}>
              ⚠️  {eslesmeyen} ürün eşleşmedi — bunlar stoka eklenmeyecek.
            </Text>
          </View>
        )}

        {/* Satır listesi */}
        <FlatList
          data={satirlar}
          keyExtractor={(_, i) => String(i)}
          style={{ flex: 1 }}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={[
                s.onizlemeSatir,
                !item.onaylandi && s.onizlemeSatirDevre,
              ]}
              onPress={() => satiriToggle(index)}
              activeOpacity={0.75}
            >
              {/* Sol renk çizgisi */}
              <View
                style={[
                  s.eslemeSerit,
                  { backgroundColor: eslemeRengi(item.match_type, item.confidence) },
                ]}
              />

              <View style={s.onizlemeSatirIcerik}>
                {/* Ürün adları */}
                <View style={s.urunAdlari}>
                  <Text style={s.faturadakiAd} numberOfLines={1}>
                    {item.invoice_item.description ?? '(Açıklama yok)'}
                  </Text>
                  {item.product_name ? (
                    <Text style={s.eslenenAd} numberOfLines={1}>
                      → {item.product_name}
                    </Text>
                  ) : (
                    <Text style={[s.eslenenAd, { color: '#F04F4F' }]}>
                      → Ürün bulunamadı
                    </Text>
                  )}
                </View>

                {/* Eşleme etiketi */}
                <View
                  style={[
                    s.eslemeEtiket,
                    { borderColor: eslemeRengi(item.match_type, item.confidence) },
                  ]}
                >
                  <Text
                    style={[
                      s.eslemeEtiketMetin,
                      { color: eslemeRengi(item.match_type, item.confidence) },
                    ]}
                  >
                    {eslemeEtiketi(item.match_type, item.confidence)}
                  </Text>
                </View>

                {/* Fiyat detayları */}
                <View style={s.fiyatSatir}>
                  <Text style={s.fiyatMetin}>
                    Miktar: {item.invoice_item.qty} {item.invoice_item.unit ?? 'adet'}
                  </Text>
                  {item.yeni_maliyet > 0 && (
                    <Text style={s.fiyatMetin}>
                      Maliyet: ₺{item.yeni_maliyet.toFixed(2)}
                      {item.mevcut_maliyet ? (
                        <Text style={s.eskiFiyat}>
                          {' '}(mevcut: ₺{item.mevcut_maliyet.toFixed(2)})
                        </Text>
                      ) : null}
                    </Text>
                  )}
                  {item.oneri_fiyat && (
                    <Text style={[s.fiyatMetin, { color: '#4F8EF7' }]}>
                      Öneri satış: ₺{item.oneri_fiyat.toFixed(2)}
                    </Text>
                  )}
                </View>
              </View>

              {/* Onay toggle */}
              <View
                style={[
                  s.toggleKutu,
                  {
                    backgroundColor: item.onaylandi && item.product_id
                      ? '#12C98A'
                      : colors.bgTertiary,
                    borderColor: item.onaylandi && item.product_id
                      ? '#12C98A'
                      : colors.border,
                  },
                ]}
              >
                {item.onaylandi && item.product_id && (
                  <Text style={s.toggleTik}>✓</Text>
                )}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={s.bosListeKapsayici}>
              <Text style={s.bosListeMetin}>Faturada satır bulunamadı.</Text>
            </View>
          }
        />

        {/* Alt onay çubuğu */}
        <View style={s.onayBar}>
          <View>
            <Text style={s.onayBarBilgi}>
              {onaylananSayisi} / {satirlar.length} satır onaylandı
            </Text>
          </View>
          <View style={s.onayBarButonlar}>
            <TouchableOpacity
              style={s.butonIkincil}
              onPress={() => setEkran('liste')}
            >
              <Text style={s.butonIkincilMetin}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                s.butonPrimary,
                s.butonPrimaryKompakt,
                onaylananSayisi === 0 && s.butonDevre,
              ]}
              onPress={onayla}
              disabled={onaylananSayisi === 0}
            >
              <Text style={s.butonPrimaryMetin}>Onayla →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // --- LİSTE (varsayılan) ---
  return (
    <View style={s.kapsayici}>

      {/* ── Offline Banner ── */}
      {(isOffline || bekleyenIslem > 0) && (
        <View style={[s.offlineBant, { backgroundColor: colors.danger }]}>
          <Text style={[s.offlineMetin, { fontFamily: FONT_FAMILY.bodyMedium }]}>
            🔴 Offline · {bekleyenIslem} işlem bekliyor
          </Text>
        </View>
      )}
      {/* Yeni fatura yükle kartı */}
      <View style={s.yukleKart}>
        <Text style={s.yukleBaslik}>Fatura Yükle</Text>
        <Text style={s.yukleAciklama}>
          PDF, Excel (.xlsx/.xls) veya Word (.docx) fatura yükleyebilirsiniz.
          Ürünler otomatik eşleştirilir.
        </Text>

        {/* Birim çarpanları (opsiyonel) */}
        <TouchableOpacity
          style={s.carpanToggle}
          onPress={() => setCarpanlarAcik(a => !a)}
        >
          <Text style={s.carpanToggleMetin}>
            {carpanlarAcik ? '▼' : '▶'} Birim çarpanları (opsiyonel)
          </Text>
        </TouchableOpacity>

        {carpanlarAcik && (
          <View style={s.carpanlar}>
            <View style={s.carpanItem}>
              <Text style={s.carpanEtiket}>1 koli =</Text>
              <TextInput
                style={s.carpanGirdi}
                value={carpanlar.koli}
                onChangeText={v => setCarpanlar(c => ({ ...c, koli: v }))}
                placeholder="24"
                placeholderTextColor={colors.textHint}
                keyboardType="numeric"
              />
              <Text style={s.carpanEtiket}>adet</Text>
            </View>
            <View style={s.carpanItem}>
              <Text style={s.carpanEtiket}>1 paket =</Text>
              <TextInput
                style={s.carpanGirdi}
                value={carpanlar.paket}
                onChangeText={v => setCarpanlar(c => ({ ...c, paket: v }))}
                placeholder="6"
                placeholderTextColor={colors.textHint}
                keyboardType="numeric"
              />
              <Text style={s.carpanEtiket}>adet</Text>
            </View>
          </View>
        )}

        <TouchableOpacity style={s.butonPrimary} onPress={dosyaSec}>
          <Text style={s.butonPrimaryMetin}>📂 Dosya Seç & Yükle</Text>
        </TouchableOpacity>
      </View>

      {/* Fatura listesi */}
      <Text style={s.listeBolumBaslik}>Son Faturalar</Text>

      {listeYukleniyor ? (
        <View style={s.listeSpin}>
          <ActivityIndicator color="#4F8EF7" />
        </View>
      ) : (
        <FlatList
          data={faturaListesi}
          keyExtractor={item => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={yenileniyor}
              onRefresh={() => faturaListesiniYukle(true)}
              tintColor="#4F8EF7"
            />
          }
          renderItem={({ item }) => (
            <View style={s.faturaItem}>
              <View style={s.faturaItemSol}>
                <Text style={s.faturaItemIkon}>
                  {item.file_type === 'pdf' ? '📄' :
                   item.file_type.startsWith('xls') ? '📊' : '📝'}
                </Text>
                <View>
                  <Text style={s.faturaItemAd} numberOfLines={1}>
                    {item.file_name}
                  </Text>
                  <Text style={s.faturaItemTarih}>
                    {new Date(item.created_at).toLocaleString('tr-TR', {
                      day   : '2-digit',
                      month : '2-digit',
                      year  : 'numeric',
                      hour  : '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
              <View
                style={[
                  s.durumEtiket,
                  { borderColor: durumuRenk(item.status, colors) },
                ]}
              >
                <Text style={[s.durumMetin, { color: durumuRenk(item.status, colors) }]}>
                  {durumuCevir(item.status)}
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={s.bosListeKapsayici}>
              <Text style={s.bosListeIkon}>📭</Text>
              <Text style={s.bosListeMetin}>Henüz fatura yüklenmemiş.</Text>
              <Text style={s.bosListeAlt}>
                Yukarıdaki butonu kullanarak ilk faturanızı yükleyin.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ============================================================
// STİLLER
// ============================================================

const styles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
  offlineBant: {
    paddingVertical  : SPACING.sm,
    paddingHorizontal: SPACING.base,
    alignItems       : 'center',
  },
  offlineMetin: {
    color   : WHITE,
    fontSize: FONT_SIZE.sm,
  },
    kapsayici: {
      flex           : 1,
      backgroundColor: c.bgPrimary,
    },
    merkez: {
      flex          : 1,
      justifyContent: 'center',
      alignItems    : 'center',
      padding       : 24,
      backgroundColor: c.bgPrimary,
    },

    // Yükleme ekranı
    yuklemeMetin: {
      marginTop : 16,
      fontSize  : 16,
      color     : c.textPrimary,
      textAlign : 'center',
      fontFamily: 'DMSans-SemiBold',
    },
    altMetin: {
      marginTop : 8,
      fontSize  : 13,
      color     : c.textMuted,
      textAlign : 'center',
    },

    // Hata ekranı
    hataIkon: {
      fontSize  : 48,
      marginBottom: 12,
    },
    hataBaslik: {
      fontSize  : 20,
      color     : '#F04F4F',
      fontFamily: 'DMSans-SemiBold',
      marginBottom: 8,
    },
    hataMesaj: {
      fontSize  : 14,
      color     : c.textMuted,
      textAlign : 'center',
      marginBottom: 24,
      lineHeight: 20,
    },

    // Tamamlandı ekranı
    basariIkon: {
      fontSize  : 60,
      marginBottom: 12,
    },
    basariBaslik: {
      fontSize  : 24,
      color     : '#12C98A',
      fontFamily: 'Syne-Bold',
      marginBottom: 4,
    },
    basariDosya: {
      fontSize  : 13,
      color     : c.textMuted,
      marginBottom: 24,
    },
    sonucKart: {
      backgroundColor: c.bgSecondary,
      borderRadius   : 12,
      padding        : 16,
      width          : '100%',
      marginBottom   : 24,
    },
    sonucSatir: {
      flexDirection : 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
    },
    sonucSatirAra: {
      borderTopWidth : 1,
      borderBottomWidth: 1,
      borderColor    : c.border,
    },
    sonucEtiket: {
      fontSize  : 14,
      color     : c.textMuted,
    },
    sonucDeger: {
      fontSize  : 16,
      color     : c.textPrimary,
      fontFamily: 'DMSans-SemiBold',
    },

    // Liste ekranı
    yukleKart: {
      backgroundColor: c.bgSecondary,
      margin         : 16,
      padding        : 16,
      borderRadius   : 12,
      borderWidth    : 1,
      borderColor    : c.border,
    },
    yukleBaslik: {
      fontSize  : 18,
      color     : c.textPrimary,
      fontFamily: 'DMSans-SemiBold',
      marginBottom: 6,
    },
    yukleAciklama: {
      fontSize  : 13,
      color     : c.textMuted,
      lineHeight: 18,
      marginBottom: 12,
    },
    carpanToggle: {
      marginBottom: 8,
      paddingVertical: 4,
    },
    carpanToggleMetin: {
      fontSize  : 13,
      color     : '#4F8EF7',
      fontFamily: 'DMSans-SemiBold',
    },
    carpanlar: {
      backgroundColor: c.bgTertiary,
      borderRadius   : 8,
      padding        : 12,
      marginBottom   : 12,
      gap            : 8,
    },
    carpanItem: {
      flexDirection: 'row',
      alignItems   : 'center',
      gap          : 8,
    },
    carpanEtiket: {
      fontSize: 13,
      color   : c.textMuted,
      width   : 60,
    },
    carpanGirdi: {
      flex           : 1,
      height         : 40,
      backgroundColor: c.bgSecondary,
      borderRadius   : 8,
      borderWidth    : 1,
      borderColor    : c.border,
      paddingHorizontal: 10,
      color          : c.textPrimary,
      fontFamily     : 'DMSans-Regular',
    },
    listeBolumBaslik: {
      fontSize     : 13,
      color        : c.textMuted,
      fontFamily   : 'DMSans-SemiBold',
      marginLeft   : 16,
      marginBottom : 4,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    listeSpin: {
      padding: 32,
      alignItems: 'center',
    },
    faturaItem: {
      flexDirection  : 'row',
      alignItems     : 'center',
      justifyContent : 'space-between',
      backgroundColor: c.bgSecondary,
      marginHorizontal: 16,
      marginBottom   : 8,
      padding        : 12,
      borderRadius   : 10,
      borderWidth    : 1,
      borderColor    : c.border,
    },
    faturaItemSol: {
      flexDirection: 'row',
      alignItems   : 'center',
      gap          : 10,
      flex         : 1,
      marginRight  : 8,
    },
    faturaItemIkon: {
      fontSize: 24,
    },
    faturaItemAd: {
      fontSize  : 14,
      color     : c.textPrimary,
      fontFamily: 'DMSans-SemiBold',
      maxWidth  : 200,
    },
    faturaItemTarih: {
      fontSize: 12,
      color   : c.textMuted,
      marginTop: 2,
    },
    durumEtiket: {
      borderWidth  : 1,
      borderRadius : 999,
      paddingHorizontal: 10,
      paddingVertical  : 4,
    },
    durumMetin: {
      fontSize  : 11,
      fontFamily: 'DMSans-SemiBold',
    },

    // Boş liste
    bosListeKapsayici: {
      alignItems: 'center',
      padding   : 40,
    },
    bosListeIkon: {
      fontSize    : 48,
      marginBottom: 12,
    },
    bosListeMetin: {
      fontSize  : 16,
      color     : c.textMuted,
      fontFamily: 'DMSans-SemiBold',
    },
    bosListeAlt: {
      fontSize  : 13,
      color     : c.textHint,
      textAlign : 'center',
      marginTop : 4,
    },

    // Önizleme ekranı
    onizlemeBaslik: {
      backgroundColor: c.bgSecondary,
      padding        : 12,
      borderBottomWidth: 1,
      borderColor    : c.border,
    },
    onizlemeBaslikMetin: {
      fontSize  : 14,
      color     : c.textPrimary,
      fontFamily: 'DMSans-SemiBold',
      marginBottom: 8,
    },
    onizlemeIstatistik: {
      flexDirection: 'row',
      gap          : 16,
    },
    istatistikItem: {
      alignItems: 'center',
    },
    istatistikSayi: {
      fontSize  : 20,
      fontFamily: 'Syne-Bold',
    },
    istatistikEtiket: {
      fontSize: 11,
      color   : c.textMuted,
    },
    uyariSerit: {
      backgroundColor: '#F5A623' + '22',
      borderLeftWidth: 3,
      borderLeftColor: '#F5A623',
      padding        : 10,
      marginHorizontal: 0,
    },
    uyariMetin: {
      fontSize: 13,
      color   : '#F5A623',
    },
    onizlemeSatir: {
      flexDirection  : 'row',
      alignItems     : 'center',
      backgroundColor: c.bgSecondary,
      borderBottomWidth: 1,
      borderColor    : c.border,
      minHeight      : 72,
    },
    onizlemeSatirDevre: {
      opacity: 0.45,
    },
    eslemeSerit: {
      width : 4,
      alignSelf: 'stretch',
    },
    onizlemeSatirIcerik: {
      flex   : 1,
      padding: 10,
      gap    : 4,
    },
    urunAdlari: {
      gap: 2,
    },
    faturadakiAd: {
      fontSize  : 14,
      color     : c.textPrimary,
      fontFamily: 'DMSans-SemiBold',
    },
    eslenenAd: {
      fontSize: 12,
      color   : c.textMuted,
    },
    eslemeEtiket: {
      alignSelf  : 'flex-start',
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    eslemeEtiketMetin: {
      fontSize  : 11,
      fontFamily: 'DMSans-SemiBold',
    },
    fiyatSatir: {
      flexDirection: 'row',
      flexWrap     : 'wrap',
      gap          : 8,
    },
    fiyatMetin: {
      fontSize: 12,
      color   : c.textMuted,
    },
    eskiFiyat: {
      fontSize: 11,
      color   : c.textHint,
    },
    toggleKutu: {
      width       : 28,
      height      : 28,
      borderRadius: 6,
      borderWidth : 2,
      margin      : 12,
      alignItems  : 'center',
      justifyContent: 'center',
    },
    toggleTik: {
      color     : WHITE,
      fontSize  : 14,
      fontFamily: 'DMSans-SemiBold',
    },
    onayBar: {
      flexDirection  : 'row',
      alignItems     : 'center',
      justifyContent : 'space-between',
      backgroundColor: c.bgSecondary,
      borderTopWidth : 1,
      borderColor    : c.border,
      padding        : 12,
    },
    onayBarBilgi: {
      fontSize  : 14,
      color     : c.textMuted,
      fontFamily: 'DMSans-SemiBold',
    },
    onayBarButonlar: {
      flexDirection: 'row',
      gap          : 8,
    },

    // Butonlar
    butonPrimary: {
      backgroundColor  : '#4F8EF7',
      borderRadius     : 8,
      paddingVertical  : 14,
      paddingHorizontal: 20,
      alignItems       : 'center',
      minHeight        : 48,
      justifyContent   : 'center',
      marginTop        : 8,
    },
    butonPrimaryKompakt: {
      paddingVertical: 10,
      marginTop      : 0,
    },
    butonPrimaryMetin: {
      color     : WHITE,
      fontSize  : 15,
      fontFamily: 'DMSans-SemiBold',
    },
    butonDevre: {
      backgroundColor: c.bgTertiary,
    },
    butonIkincil: {
      borderWidth    : 1,
      borderColor    : c.border,
      borderRadius   : 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      alignItems     : 'center',
      justifyContent : 'center',
      minHeight      : 48,
    },
    butonIkincilMetin: {
      color     : c.textMuted,
      fontSize  : 14,
      fontFamily: 'DMSans-SemiBold',
    },
  });
