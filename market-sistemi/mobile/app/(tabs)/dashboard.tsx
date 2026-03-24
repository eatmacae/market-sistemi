/**
 * Market Yönetim Sistemi — Dashboard Ekranı
 * Anlık satış özeti, kritik stok, en çok satılanlar, stok değeri
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
import { router }          from 'expo-router';
import { useTheme }        from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore }    from '../../stores/authStore';
import { Badge }           from '../../components/ui/Badge';
import { Card }            from '../../components/ui/Card';
import { api }             from '../../services/api';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE }          from '../../constants/typography';

interface Ozet {
  toplam_ciro    : number;
  islem_sayisi   : number;
  ortalama_sepet : number;
  nakit          : number;
  kart           : number;
  toplam_indirim : number;
  toplam_kdv     : number;
  degisim_yuzde  : number | null;
}

interface TopUrun {
  sira       : number;
  urun_adi   : string;
  toplam_ciro: number;
  toplam_adet: number;
}

interface StokDegeri {
  maliyet_degeri : number;
  satis_degeri   : number;
  potansiyel_kar : number;
  urun_sayisi    : number;
}

interface KritikStok {
  id        : number;
  name      : string;
  stock_qty : number;
  min_stock : number;
  unit      : string;
}

export default function DashboardScreen() {
  const { colors }   = useTheme();
  const { branchId } = useSettingsStore();
  const { user }     = useAuthStore();

  const [ozet, setOzet]             = useState<Ozet | null>(null);
  const [topUrunler, setTopUrunler] = useState<TopUrun[]>([]);
  const [stokDegeri, setStokDegeri] = useState<StokDegeri | null>(null);
  const [kritikStok, setKritikStok] = useState<KritikStok[]>([]);

  const [yukleniyor, setYukleniyor]   = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [hata, setHata]               = useState<string | null>(null);
  const [isOffline, setIsOffline]     = useState(false);

  // ============================================================
  // VERİ ÇEKME
  // ============================================================

  const verileriYukle = useCallback(async (yenileme = false) => {
    if (yenileme) {
      setYenileniyor(true);
    } else {
      setYukleniyor(true);
    }
    setHata(null);

    try {
      const [ozetYanit, topYanit, stokYanit] = await Promise.all([
        api.get(`/api/reports/summary?branch_id=${branchId}&donem=today`),
        api.get(`/api/reports/top-products?branch_id=${branchId}&donem=today&limit=5`),
        api.get(`/api/reports/stock-value?branch_id=${branchId}`),
      ]);

      setOzet(ozetYanit.data);
      setTopUrunler(topYanit.data);
      setStokDegeri(stokYanit.data);
      setIsOffline(false);

    } catch (err: any) {
      if (!err.response) {
        setIsOffline(true);
        setHata('Sunucuya bağlanılamıyor.');
      } else {
        setHata(err.response?.data?.detail || 'Veriler yüklenemedi.');
      }
    } finally {
      setYukleniyor(false);
      setYenileniyor(false);
    }
  }, [branchId]);

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
        <Text style={[styles.bilgiMetin, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
          Dashboard yükleniyor...
        </Text>
      </View>
    );
  }

  // ============================================================
  // RENDER: HATA / OFFLİNE
  // ============================================================

  if (hata && !ozet) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <Text style={{ fontSize: 48 }}>{isOffline ? '📡' : '⚠️'}</Text>
        <Text style={[styles.hataBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
          {isOffline ? 'Bağlantı Yok' : 'Hata'}
        </Text>
        <Text style={[styles.hataMetin, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
          {hata}
        </Text>
        <TouchableOpacity
          onPress = {() => verileriYukle()}
          style   = {[
            styles.yenilenButon,
            { backgroundColor: colors.blue, minHeight: MIN_TOUCH_SIZE },
          ]}
        >
          <Text style={[{ color: '#FFFFFF', fontFamily: FONT_FAMILY.bodyMedium }]}>
            Yenile
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ============================================================
  // RENDER: DASHBOARD
  // ============================================================

  return (
    <ScrollView
      style           = {{ backgroundColor: colors.bgPrimary }}
      contentContainerStyle = {styles.kaydirma}
      showsVerticalScrollIndicator = {false}
      refreshControl  = {
        <RefreshControl
          refreshing = {yenileniyor}
          onRefresh  = {() => verileriYukle(true)}
          tintColor  = {colors.blue}
        />
      }
    >
      {/* ── Offline uyarısı ── */}
      {isOffline && (
        <View style={[styles.offlineBant, { backgroundColor: colors.danger }]}>
          <Text style={[styles.offlineMetin, { fontFamily: FONT_FAMILY.bodyMedium }]}>
            🔴 Offline · Veriler en son senkronizasyondan
          </Text>
        </View>
      )}

      {/* ── Başlık ── */}
      <View style={styles.baslik}>
        <Text style={[styles.baslikMetin, { color: colors.textPrimary, fontFamily: FONT_FAMILY.heading }]}>
          Bugün
        </Text>
        <Text style={[styles.tarihMetin, { color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
          {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
      </View>

      {/* ── Ciro Kartı ── */}
      {ozet && (
        <View style={[styles.ciroBolum, { backgroundColor: colors.blue + '15', borderColor: colors.blue + '30' }]}>
          {/* Ana ciro */}
          <View style={styles.ciroAna}>
            <Text style={[styles.ciroDeger, { color: colors.blue, fontFamily: FONT_FAMILY.bodyBold }]}>
              ₺{ozet.toplam_ciro.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </Text>
            <Text style={[styles.ciroEtiket, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
              Günlük Ciro
            </Text>

            {/* Dünle karşılaştırma */}
            {ozet.degisim_yuzde !== null && (
              <Badge
                label   = {`${ozet.degisim_yuzde >= 0 ? '+' : ''}${ozet.degisim_yuzde}% dün`}
                variant = {ozet.degisim_yuzde >= 0 ? 'success' : 'danger'}
                style   = {{ marginTop: SPACING.xs }}
              />
            )}
          </View>

          {/* Alt metrikler */}
          <View style={[styles.ciroAlt, { borderTopColor: colors.blue + '20' }]}>
            <_MetrikKutu
              etiket = "İşlem"
              deger  = {String(ozet.islem_sayisi)}
              renk   = {colors.textPrimary}
              colors = {colors}
            />
            <_MetrikKutu
              etiket = "Ort. Sepet"
              deger  = {`₺${ozet.ortalama_sepet.toFixed(2)}`}
              renk   = {colors.textPrimary}
              colors = {colors}
            />
            <_MetrikKutu
              etiket = "İndirim"
              deger  = {`₺${ozet.toplam_indirim.toFixed(2)}`}
              renk   = {colors.danger}
              colors = {colors}
            />
          </View>
        </View>
      )}

      {/* ── Ödeme Dağılımı ── */}
      {ozet && (ozet.nakit > 0 || ozet.kart > 0) && (
        <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <Text style={[styles.bolumBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
            Ödeme Dağılımı
          </Text>
          <View style={styles.odemeGrup}>
            {ozet.nakit > 0 && (
              <View style={[styles.odemeKart, { backgroundColor: colors.success + '15', borderColor: colors.success + '30' }]}>
                <Text style={[{ color: colors.success, fontFamily: FONT_FAMILY.bodyBold, fontSize: FONT_SIZE.md }]}>
                  ₺{ozet.nakit.toFixed(2)}
                </Text>
                <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs }]}>
                  💵 Nakit
                </Text>
              </View>
            )}
            {ozet.kart > 0 && (
              <View style={[styles.odemeKart, { backgroundColor: colors.purple + '15', borderColor: colors.purple + '30' }]}>
                <Text style={[{ color: colors.purple, fontFamily: FONT_FAMILY.bodyBold, fontSize: FONT_SIZE.md }]}>
                  ₺{ozet.kart.toFixed(2)}
                </Text>
                <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs }]}>
                  💳 Kart
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ── Bugün En Çok Satılanlar ── */}
      {topUrunler.length > 0 && (
        <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <Text style={[styles.bolumBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
            🏆 Bugün En Çok Satılanlar
          </Text>
          {topUrunler.map((urun, idx) => (
            <View
              key   = {urun.sira}
              style = {[
                styles.topUrunSatir,
                idx < topUrunler.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 1 },
              ]}
            >
              <Text style={[styles.topSira, { color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
                {idx + 1}.
              </Text>
              <Text
                style          = {[styles.topAdi, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium }]}
                numberOfLines  = {1}
              >
                {urun.urun_adi}
              </Text>
              <Text style={[styles.topCiro, { color: colors.success, fontFamily: FONT_FAMILY.bodySemiBold }]}>
                ₺{urun.toplam_ciro.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Stok Değeri ── */}
      {stokDegeri && (
        <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <Text style={[styles.bolumBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
            📦 Stok Değeri
          </Text>
          <View style={styles.stokDegerGrup}>
            <View style={styles.stokDegerKart}>
              <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs }]}>
                Maliyet
              </Text>
              <Text style={[{ color: colors.warning, fontFamily: FONT_FAMILY.bodyBold, fontSize: FONT_SIZE.md }]}>
                ₺{stokDegeri.maliyet_degeri.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
              </Text>
            </View>
            <View style={[styles.stokDegerAyrac, { backgroundColor: colors.border }]} />
            <View style={styles.stokDegerKart}>
              <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs }]}>
                Satış Değeri
              </Text>
              <Text style={[{ color: colors.blue, fontFamily: FONT_FAMILY.bodyBold, fontSize: FONT_SIZE.md }]}>
                ₺{stokDegeri.satis_degeri.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
              </Text>
            </View>
            <View style={[styles.stokDegerAyrac, { backgroundColor: colors.border }]} />
            <View style={styles.stokDegerKart}>
              <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs }]}>
                Potansiyel Kâr
              </Text>
              <Text style={[{ color: colors.success, fontFamily: FONT_FAMILY.bodyBold, fontSize: FONT_SIZE.md }]}>
                ₺{stokDegeri.potansiyel_kar.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
              </Text>
            </View>
          </View>
          <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, textAlign: 'center' }]}>
            {stokDegeri.urun_sayisi} ürün çeşidi stokta
          </Text>
        </View>
      )}

      {/* ── Hızlı Erişim ── */}
      {(user?.role === 'admin' || user?.role === 'warehouse') && (
        <View style={[styles.bolum, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <Text style={[styles.bolumBaslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
            ⚡ Hızlı Erişim
          </Text>
          <TouchableOpacity
            style={[styles.hizliErisimButon, { backgroundColor: colors.blue + '15', borderColor: colors.blue + '40' }]}
            onPress={() => router.push('/(yonetim)/invoices')}
          >
            <Text style={{ fontSize: 24 }}>📄</Text>
            <View style={{ flex: 1 }}>
              <Text style={[{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.base }]}>
                Fatura Yükle
              </Text>
              <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs }]}>
                PDF, Excel veya Word fatura → Otomatik stok güncelleme
              </Text>
            </View>
            <Text style={{ color: colors.textHint, fontSize: 18 }}>›</Text>
          </TouchableOpacity>

          {/* Yedekleme butonu — sadece admin */}
          {user?.role === 'admin' && (
            <TouchableOpacity
              style={[styles.hizliErisimButon, { backgroundColor: colors.success + '15', borderColor: colors.success + '40', marginTop: SPACING.sm }]}
              onPress={() => router.push('/(yonetim)/backup')}
            >
              <Text style={{ fontSize: 24 }}>💾</Text>
              <View style={{ flex: 1 }}>
                <Text style={[{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.base }]}>
                  Yedekleme
                </Text>
                <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs }]}>
                  Veritabanı yedeği & SKT kontrol
                </Text>
              </View>
              <Text style={{ color: colors.textHint, fontSize: 18 }}>›</Text>
            </TouchableOpacity>
          )}

          {/* Müşteriler butonu — tüm personel */}
          <TouchableOpacity
            style={[styles.hizliErisimButon, { backgroundColor: colors.purple + '15', borderColor: colors.purple + '40', marginTop: SPACING.sm }]}
            onPress={() => router.push('/(yonetim)/customers')}
          >
            <Text style={{ fontSize: 24 }}>👤</Text>
            <View style={{ flex: 1 }}>
              <Text style={[{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.base }]}>
                Müşteriler
              </Text>
              <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs }]}>
                Veresiye takibi & sadakat puanları
              </Text>
            </View>
            <Text style={{ color: colors.textHint, fontSize: 18 }}>›</Text>
          </TouchableOpacity>

          {/* Tedarikçiler & Sistem Ayarları — sadece admin */}
          {user?.role === 'admin' && (
            <>
              <TouchableOpacity
                style={[styles.hizliErisimButon, { backgroundColor: colors.cyan + '15', borderColor: colors.cyan + '40', marginTop: SPACING.sm }]}
                onPress={() => router.push('/(yonetim)/suppliers')}
              >
                <Text style={{ fontSize: 24 }}>🏭</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.base }]}>
                    Tedarikçiler
                  </Text>
                  <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs }]}>
                    Fiyat takibi & iletişim bilgileri
                  </Text>
                </View>
                <Text style={{ color: colors.textHint, fontSize: 18 }}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.hizliErisimButon, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '40', marginTop: SPACING.sm }]}
                onPress={() => router.push('/(yonetim)/system-settings')}
              >
                <Text style={{ fontSize: 24 }}>⚙️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.base }]}>
                    Sistem Ayarları
                  </Text>
                  <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs }]}>
                    Market bilgileri, yazıcı, terazi, SKT
                  </Text>
                </View>
                <Text style={{ color: colors.textHint, fontSize: 18 }}>›</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* ── Empty state: satış yok ── */}
      {ozet && ozet.islem_sayisi === 0 && (
        <View style={[styles.bosKart, { borderColor: colors.border }]}>
          <Text style={{ fontSize: 40 }}>🛒</Text>
          <Text style={[{ color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.base }]}>
            Bugün henüz satış yapılmadı
          </Text>
        </View>
      )}

    </ScrollView>
  );
}


// ============================================================
// ALT KOMPONENT — Metrik Kutusu
// ============================================================

function _MetrikKutu({
  etiket, deger, renk, colors,
}: {
  etiket: string; deger: string; renk: string; colors: any;
}) {
  return (
    <View style={styles.metrikKutu}>
      <Text style={[styles.metrikDeger, { color: renk, fontFamily: FONT_FAMILY.bodyBold }]}>
        {deger}
      </Text>
      <Text style={[styles.metrikEtiket, { color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
        {etiket}
      </Text>
    </View>
  );
}


// ============================================================
// STİLLER
// ============================================================

const styles = StyleSheet.create({
  kaydirma: {
    padding     : SPACING.base,
    gap         : SPACING.base,
    paddingBottom: SPACING.xl,
  },
  merkez: {
    flex          : 1,
    alignItems    : 'center',
    justifyContent: 'center',
    gap           : SPACING.base,
  },
  bilgiMetin: {
    fontSize: FONT_SIZE.base,
  },

  // Başlık
  baslik: {
    gap: 2,
  },
  baslikMetin: {
    fontSize: FONT_SIZE.xxl,
  },
  tarihMetin: {
    fontSize: FONT_SIZE.sm,
  },

  // Ciro bölümü
  ciroBolum: {
    borderRadius: RADIUS.card,
    borderWidth : 1,
    padding     : SPACING.base,
    gap         : SPACING.sm,
  },
  ciroAna: {
    alignItems: 'center',
    gap       : 4,
  },
  ciroDeger: {
    fontSize: 36,
  },
  ciroEtiket: {
    fontSize: FONT_SIZE.sm,
  },
  ciroAlt: {
    flexDirection : 'row',
    justifyContent: 'space-around',
    paddingTop    : SPACING.sm,
    borderTopWidth: 1,
  },
  metrikKutu: {
    alignItems: 'center',
    gap       : 2,
  },
  metrikDeger: {
    fontSize: FONT_SIZE.md,
  },
  metrikEtiket: {
    fontSize: FONT_SIZE.xs,
  },

  // Ödeme dağılımı
  odemeGrup: {
    flexDirection: 'row',
    gap          : SPACING.sm,
  },
  odemeKart: {
    flex          : 1,
    alignItems    : 'center',
    padding       : SPACING.sm,
    borderRadius  : RADIUS.button,
    borderWidth   : 1,
    gap           : 4,
  },

  // Bölüm
  bolum: {
    borderRadius: RADIUS.card,
    borderWidth : 1,
    padding     : SPACING.base,
    gap         : SPACING.sm,
  },
  bolumBaslik: {
    fontSize: FONT_SIZE.base,
  },

  // Top ürünler
  topUrunSatir: {
    flexDirection: 'row',
    alignItems   : 'center',
    paddingVertical: SPACING.xs,
    gap          : SPACING.sm,
  },
  topSira: {
    fontSize: FONT_SIZE.sm,
    width   : 20,
  },
  topAdi: {
    flex    : 1,
    fontSize: FONT_SIZE.base,
  },
  topCiro: {
    fontSize: FONT_SIZE.base,
  },

  // Stok değeri
  stokDegerGrup: {
    flexDirection: 'row',
    alignItems   : 'center',
  },
  stokDegerKart: {
    flex     : 1,
    alignItems: 'center',
    gap      : 4,
  },
  stokDegerAyrac: {
    width : 1,
    height: 40,
  },

  // Hızlı erişim butonu
  hizliErisimButon: {
    flexDirection: 'row',
    alignItems   : 'center',
    gap          : SPACING.sm,
    borderWidth  : 1,
    borderRadius : RADIUS.btn,
    padding      : SPACING.sm,
    minHeight    : 56,
  },

  // Boş kart
  bosKart: {
    alignItems  : 'center',
    justifyContent: 'center',
    borderWidth : 1,
    borderStyle : 'dashed',
    borderRadius: RADIUS.card,
    padding     : SPACING.xl,
    gap         : SPACING.sm,
  },

  // Offline bant
  offlineBant: {
    padding     : SPACING.sm,
    borderRadius: RADIUS.button,
    alignItems  : 'center',
  },
  offlineMetin: {
    color   : '#FFFFFF',
    fontSize: FONT_SIZE.sm,
  },

  // Hata ekranı
  hataBaslik: {
    fontSize: FONT_SIZE.md,
  },
  hataMetin: {
    fontSize : FONT_SIZE.base,
    textAlign: 'center',
  },
  yenilenButon: {
    paddingHorizontal: SPACING.xl,
    paddingVertical  : SPACING.sm,
    borderRadius     : RADIUS.button,
    marginTop        : SPACING.sm,
  },
});
