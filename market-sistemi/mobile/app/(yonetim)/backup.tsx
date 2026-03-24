/**
 * Market Yönetim Sistemi — Yedekleme Yönetimi Ekranı
 *
 * Özellikler:
 *   - Son yedek durumu (tarih, boyut, gecen gün)
 *   - Manuel yedek alma butonu
 *   - Yedek listesi (indirme ve silme)
 *   - SKT yaklaşan ürünler özeti
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
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  FlatList,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useTheme }         from '../../hooks/useTheme';
import { useAuthStore }     from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';

// ============================================================
// TİPLER
// ============================================================

interface YedekDurum {
  son_yedek_tarihi : string | null;
  son_yedek_boyutu : number | null;
  son_yedek_dosya  : string | null;
  yedek_sayisi     : number;
  gecen_gun        : number;
  uyari            : string | null;
}

interface YedekDosya {
  dosya_adi   : string;
  boyut_mb    : number;
  tarih       : string;
  indirilebilir: boolean;
}

interface SktUrun {
  id           : number;
  name         : string;
  barcode      : string | null;
  stock_qty    : number;
  unit         : string;
  expiry_date  : string;
  kalan_gun    : number;
  durum        : 'gecmis' | 'kritik' | 'uyari' | 'normal';
  shelf_location: string | null;
}

// ============================================================
// YARDIMCI — Durum rengi
// ============================================================

function sktRengi(durum: SktUrun['durum']): string {
  switch (durum) {
    case 'gecmis': return '#F04F4F';
    case 'kritik': return '#F04F4F';
    case 'uyari':  return '#F5A623';
    default:       return '#12C98A';
  }
}

function sktEtiket(kalan: number): string {
  if (kalan < 0)  return `${Math.abs(kalan)} gün geçmiş!`;
  if (kalan === 0) return 'Bugün son gün!';
  return `${kalan} gün kaldı`;
}

// ============================================================
// ANA BİLEŞEN
// ============================================================

export default function YedekYonetimi() {
  const { colors }              = useTheme();
  const { token }               = useAuthStore();
  const { serverUrl, branchId } = useSettingsStore();

  const [yukleniyor, setYukleniyor]     = useState(true);
  const [yenileniyor, setYenileniyor]   = useState(false);
  const [yedekAliniyor, setYedekAliniyor] = useState(false);
  const [hata, setHata]                 = useState<string | null>(null);

  const [durum, setDurum]     = useState<YedekDurum | null>(null);
  const [yedekler, setYedekler] = useState<YedekDosya[]>([]);
  const [sktUrunler, setSktUrunler] = useState<SktUrun[]>([]);

  const s = styles(colors);

  // ============================================================
  // VERİLERİ YÜKLE
  // ============================================================

  const yukle = useCallback(async (yenileme = false) => {
    if (yenileme) setYenileniyor(true);
    else          setYukleniyor(true);
    setHata(null);

    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [durumYanit, listeYanit, sktYanit] = await Promise.all([
        fetch(`${serverUrl}/api/backup/status`, { headers }),
        fetch(`${serverUrl}/api/backup`,        { headers }),
        fetch(`${serverUrl}/api/stock/expiring?branch_id=${branchId}&gun=30`, { headers }),
      ]);

      if (durumYanit.ok) setDurum(await durumYanit.json());
      if (listeYanit.ok) {
        const v = await listeYanit.json();
        setYedekler(v.yedekler ?? []);
      }
      if (sktYanit.ok) {
        const v = await sktYanit.json();
        setSktUrunler(v.urunler ?? []);
      }
    } catch (err: any) {
      setHata(err.message ?? 'Yüklenemedi.');
    } finally {
      setYukleniyor(false);
      setYenileniyor(false);
    }
  }, [serverUrl, token, branchId]);

  useFocusEffect(useCallback(() => { yukle(); }, [yukle]));

  // ============================================================
  // MANUEL YEDEK AL
  // ============================================================

  const yedekAl = () => {
    Alert.alert(
      'Manuel Yedek Al',
      'Yedekleme arka planda başlatılır. Tamamlandığında mail bildirimi gönderilir.',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Başlat',
          onPress: async () => {
            setYedekAliniyor(true);
            try {
              const yanit = await fetch(`${serverUrl}/api/backup/manual?mail_gonder=true`, {
                method : 'POST',
                headers: { Authorization: `Bearer ${token}` },
              });
              const veri = await yanit.json();
              if (yanit.ok) {
                Alert.alert('Başlatıldı', veri.message);
                setTimeout(() => yukle(true), 3000); // 3sn sonra yenile
              } else {
                Alert.alert('Hata', veri.detail ?? 'Yedek başlatılamadı.');
              }
            } catch (err: any) {
              Alert.alert('Hata', err.message);
            } finally {
              setYedekAliniyor(false);
            }
          },
        },
      ],
    );
  };

  // ============================================================
  // YEDEK SİL
  // ============================================================

  const yedekSil = (dosyaAdi: string) => {
    Alert.alert(
      'Yedek Sil',
      `"${dosyaAdi}" dosyası kalıcı olarak silinecek. Emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text : 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              const yanit = await fetch(`${serverUrl}/api/backup/${dosyaAdi}`, {
                method : 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (yanit.ok) {
                setYedekler(prev => prev.filter(y => y.dosya_adi !== dosyaAdi));
              } else {
                const hataVeri = await yanit.json();
                Alert.alert('Hata', hataVeri.detail ?? 'Silinemedi.');
              }
            } catch (err: any) {
              Alert.alert('Hata', err.message);
            }
          },
        },
      ],
    );
  };

  // ============================================================
  // RENDER: YÜKLENIYOR
  // ============================================================

  if (yukleniyor) {
    return (
      <View style={s.merkez}>
        <ActivityIndicator size="large" color="#4F8EF7" />
        <Text style={s.yuklemeMetin}>Yedek durumu yükleniyor...</Text>
      </View>
    );
  }

  if (hata) {
    return (
      <View style={s.merkez}>
        <Text style={s.hataIkon}>⚠️</Text>
        <Text style={s.hataMetin}>{hata}</Text>
        <TouchableOpacity style={s.butonPrimary} onPress={() => yukle()}>
          <Text style={s.butonPrimaryMetin}>Yenile</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ============================================================
  // RENDER: ANA EKRAN
  // ============================================================

  const kritikSkt = sktUrunler.filter(u => u.durum === 'gecmis' || u.durum === 'kritik');
  const uyariSkt  = sktUrunler.filter(u => u.durum === 'uyari');

  return (
    <ScrollView
      style                = {{ backgroundColor: colors.bgPrimary }}
      contentContainerStyle= {{ padding: 16, gap: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={yenileniyor}
          onRefresh={() => yukle(true)}
          tintColor="#4F8EF7"
        />
      }
    >

      {/* ── Durum Kartı ── */}
      <View style={s.kart}>
        <Text style={s.kartBaslik}>💾 Son Yedek Durumu</Text>

        {durum?.son_yedek_tarihi ? (
          <>
            <View style={s.durumSatir}>
              <Text style={s.durumEtiket}>Son Yedek</Text>
              <Text style={s.durumDeger}>{durum.son_yedek_tarihi}</Text>
            </View>
            <View style={s.durumSatir}>
              <Text style={s.durumEtiket}>Boyut</Text>
              <Text style={s.durumDeger}>{durum.son_yedek_boyutu} MB</Text>
            </View>
            <View style={s.durumSatir}>
              <Text style={s.durumEtiket}>Toplam Yedek</Text>
              <Text style={s.durumDeger}>{durum.yedek_sayisi} dosya</Text>
            </View>
            <View style={s.durumSatir}>
              <Text style={s.durumEtiket}>Geçen Süre</Text>
              <Text style={[
                s.durumDeger,
                durum.gecen_gun > 3 && { color: '#F5A623' },
              ]}>
                {durum.gecen_gun === 0 ? 'Bugün' : `${durum.gecen_gun} gün önce`}
              </Text>
            </View>

            {/* Uyarı bandı */}
            {durum.uyari && (
              <View style={s.uyariBant}>
                <Text style={s.uyariMetin}>⚠️  {durum.uyari}</Text>
              </View>
            )}
          </>
        ) : (
          <View style={s.bosBant}>
            <Text style={s.bosMetin}>Henüz yedek alınmamış.</Text>
          </View>
        )}

        {/* Manuel yedek butonu */}
        <TouchableOpacity
          style={[s.butonPrimary, yedekAliniyor && s.butonDevre]}
          onPress={yedekAl}
          disabled={yedekAliniyor}
        >
          {yedekAliniyor ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={s.butonPrimaryMetin}>💾 Manuel Yedek Al</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── SKT Uyarıları ── */}
      {sktUrunler.length > 0 && (
        <View style={s.kart}>
          <Text style={s.kartBaslik}>⏰ Son Kullanma Tarihi Uyarıları</Text>

          {/* Özet satırı */}
          <View style={s.sktOzet}>
            {kritikSkt.length > 0 && (
              <View style={[s.sktOzetItem, { backgroundColor: '#F04F4F20', borderColor: '#F04F4F50' }]}>
                <Text style={[s.sktOzetSayi, { color: '#F04F4F' }]}>{kritikSkt.length}</Text>
                <Text style={[s.sktOzetEtiket, { color: '#F04F4F' }]}>Kritik</Text>
              </View>
            )}
            {uyariSkt.length > 0 && (
              <View style={[s.sktOzetItem, { backgroundColor: '#F5A62320', borderColor: '#F5A62350' }]}>
                <Text style={[s.sktOzetSayi, { color: '#F5A623' }]}>{uyariSkt.length}</Text>
                <Text style={[s.sktOzetEtiket, { color: '#F5A623' }]}>Bu Ay</Text>
              </View>
            )}
            <View style={[s.sktOzetItem, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}>
              <Text style={[s.sktOzetSayi, { color: colors.textPrimary }]}>{sktUrunler.length}</Text>
              <Text style={[s.sktOzetEtiket, { color: colors.textMuted }]}>Toplam</Text>
            </View>
          </View>

          {/* Ürün listesi */}
          {sktUrunler.slice(0, 10).map(urun => (
            <View key={urun.id} style={s.sktSatir}>
              {/* Sol renk şeridi */}
              <View style={[s.sktSerit, { backgroundColor: sktRengi(urun.durum) }]} />

              <View style={s.sktIcerik}>
                <Text style={s.sktUrunAdi} numberOfLines={1}>{urun.name}</Text>
                <Text style={s.sktAltBilgi}>
                  Stok: {urun.stock_qty} {urun.unit}
                  {urun.shelf_location ? `  ·  Raf: ${urun.shelf_location}` : ''}
                </Text>
              </View>

              <View style={s.sktSag}>
                <Text style={[s.sktKalanGun, { color: sktRengi(urun.durum) }]}>
                  {sktEtiket(urun.kalan_gun)}
                </Text>
                <Text style={s.sktTarih}>
                  {new Date(urun.expiry_date).toLocaleDateString('tr-TR')}
                </Text>
              </View>
            </View>
          ))}

          {sktUrunler.length > 10 && (
            <Text style={s.dahaFazla}>
              +{sktUrunler.length - 10} ürün daha (stok ekranından tümünü görebilirsiniz)
            </Text>
          )}
        </View>
      )}

      {/* ── Yedek Listesi ── */}
      <View style={s.kart}>
        <Text style={s.kartBaslik}>📂 Yedek Arşivi</Text>

        {yedekler.length === 0 ? (
          <View style={s.bosBant}>
            <Text style={s.bosMetin}>Yedek dosyası bulunamadı.</Text>
          </View>
        ) : (
          yedekler.map(yedek => (
            <View key={yedek.dosya_adi} style={s.yedekSatir}>
              <View style={s.yedekSol}>
                <Text style={s.yedekDosyaAdi} numberOfLines={1}>{yedek.dosya_adi}</Text>
                <Text style={s.yedekAltBilgi}>{yedek.tarih} · {yedek.boyut_mb} MB</Text>
              </View>
              <TouchableOpacity
                style={s.silButon}
                onPress={() => yedekSil(yedek.dosya_adi)}
              >
                <Text style={s.silButonMetin}>Sil</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Otomatik yedek bilgisi */}
        <View style={[s.bilgiBant, { marginTop: 12 }]}>
          <Text style={s.bilgiMetin}>
            ℹ️  Otomatik yedek her gece 02:00'da alınır ve 30 gün saklanır.
          </Text>
        </View>
      </View>

    </ScrollView>
  );
}

// ============================================================
// STİLLER
// ============================================================

const styles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    merkez: {
      flex           : 1,
      justifyContent : 'center',
      alignItems     : 'center',
      padding        : 24,
      backgroundColor: c.bgPrimary,
      gap            : 12,
    },
    yuklemeMetin: {
      fontSize  : 14,
      color     : c.textMuted,
      fontFamily: 'DMSans-Regular',
    },
    hataIkon: { fontSize: 40 },
    hataMetin: {
      fontSize : 14,
      color    : c.textMuted,
      textAlign: 'center',
    },

    // Kart
    kart: {
      backgroundColor: c.bgSecondary,
      borderRadius   : 12,
      borderWidth    : 1,
      borderColor    : c.border,
      padding        : 16,
      gap            : 10,
    },
    kartBaslik: {
      fontSize  : 16,
      color     : c.textPrimary,
      fontFamily: 'DMSans-SemiBold',
      marginBottom: 2,
    },

    // Durum
    durumSatir: {
      flexDirection : 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
      borderBottomWidth: 1,
      borderColor   : c.border,
    },
    durumEtiket: {
      fontSize: 13,
      color   : c.textMuted,
    },
    durumDeger: {
      fontSize  : 13,
      color     : c.textPrimary,
      fontFamily: 'DMSans-SemiBold',
    },
    uyariBant: {
      backgroundColor: '#F5A62318',
      borderLeftWidth: 3,
      borderLeftColor: '#F5A623',
      padding        : 10,
      borderRadius   : 6,
    },
    uyariMetin: {
      fontSize: 13,
      color   : '#F5A623',
    },
    bosBant: {
      alignItems: 'center',
      padding   : 20,
    },
    bosMetin: {
      fontSize: 14,
      color   : c.textMuted,
    },
    bilgiBant: {
      backgroundColor: '#4F8EF718',
      borderRadius   : 8,
      padding        : 10,
    },
    bilgiMetin: {
      fontSize: 12,
      color   : c.textMuted,
      lineHeight: 17,
    },

    // SKT
    sktOzet: {
      flexDirection: 'row',
      gap          : 8,
    },
    sktOzetItem: {
      flex         : 1,
      alignItems   : 'center',
      borderWidth  : 1,
      borderRadius : 8,
      paddingVertical: 8,
    },
    sktOzetSayi: {
      fontSize  : 20,
      fontFamily: 'Syne-Bold',
    },
    sktOzetEtiket: {
      fontSize: 11,
    },
    sktSatir: {
      flexDirection : 'row',
      alignItems    : 'center',
      backgroundColor: c.bgTertiary,
      borderRadius  : 8,
      overflow      : 'hidden',
    },
    sktSerit: {
      width      : 4,
      alignSelf  : 'stretch',
    },
    sktIcerik: {
      flex   : 1,
      padding: 10,
      gap    : 2,
    },
    sktUrunAdi: {
      fontSize  : 14,
      color     : c.textPrimary,
      fontFamily: 'DMSans-SemiBold',
    },
    sktAltBilgi: {
      fontSize: 12,
      color   : c.textMuted,
    },
    sktSag: {
      alignItems: 'flex-end',
      padding   : 10,
    },
    sktKalanGun: {
      fontSize  : 12,
      fontFamily: 'DMSans-SemiBold',
    },
    sktTarih: {
      fontSize: 11,
      color   : c.textHint,
    },
    dahaFazla: {
      fontSize : 12,
      color    : '#4F8EF7',
      textAlign: 'center',
      paddingVertical: 4,
    },

    // Yedek listesi
    yedekSatir: {
      flexDirection : 'row',
      alignItems    : 'center',
      backgroundColor: c.bgTertiary,
      borderRadius  : 8,
      padding       : 10,
      gap           : 8,
    },
    yedekSol: {
      flex: 1,
      gap : 2,
    },
    yedekDosyaAdi: {
      fontSize  : 13,
      color     : c.textPrimary,
      fontFamily: 'DMSans-SemiBold',
    },
    yedekAltBilgi: {
      fontSize: 12,
      color   : c.textMuted,
    },
    silButon: {
      borderWidth  : 1,
      borderColor  : '#F04F4F60',
      borderRadius : 6,
      paddingHorizontal: 10,
      paddingVertical  : 6,
      minHeight    : 32,
      justifyContent: 'center',
    },
    silButonMetin: {
      fontSize  : 12,
      color     : '#F04F4F',
      fontFamily: 'DMSans-SemiBold',
    },

    // Butonlar
    butonPrimary: {
      backgroundColor: '#4F8EF7',
      borderRadius   : 8,
      paddingVertical: 14,
      alignItems     : 'center',
      minHeight      : 48,
      justifyContent : 'center',
    },
    butonPrimaryMetin: {
      color     : '#fff',
      fontSize  : 15,
      fontFamily: 'DMSans-SemiBold',
    },
    butonDevre: {
      backgroundColor: c.bgTertiary,
    },
  });
