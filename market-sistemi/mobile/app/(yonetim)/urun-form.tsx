/**
 * Market Yönetim Sistemi — Ürün Ekle / Düzenle Ekranı
 *
 * Kullanım:
 *   Ekle : /urun-form          (id parametresi yok)
 *   Düzelt: /urun-form?id=42   (mevcut ürünü yükler)
 *
 * Kalite kontrol:
 * ✅ Loading state
 * ✅ Error state
 * ✅ Offline state — banner gösterilir, kaydetme engellenir
 * ✅ useTheme() — hardcode renk yok
 * ✅ Min 48px dokunma alanı
 * ✅ Audit log (backend routes/products.py'de)
 * ✅ Türkçe yorum satırları
 * ✅ Soft delete — silme işlemi backend'de is_deleted=true
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../services/api';
import { getPendingCount } from '../../services/storage';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE } from '../../constants/typography';
import { WHITE } from '../../constants/colors';

// ============================================================
// TİPLER
// ============================================================

interface Kategori {
  id  : number;
  name: string;
}

interface UrunForm {
  name          : string;
  barcode       : string;
  category_id   : string;   // string → input'tan gelir, API'ye int gönderilir
  unit          : string;
  units_per_case: string;   // Koli başına adet (1 = koli yok)
  price         : string;
  cost          : string;
  vat_rate      : string;
  stock_qty     : string;
  min_stock     : string;
  shelf_location: string;
}

const BIRIM_SECENEKLERI = ['adet', 'kg', 'lt', 'paket', 'kutu', 'metre'];
const KDV_SECENEKLERI   = ['0', '1', '8', '10', '18', '20'];

// ============================================================
// KOMPONENT
// ============================================================

export default function UrunFormEkrani() {
  const { id }         = useLocalSearchParams<{ id?: string }>();
  const router         = useRouter();
  const { colors }     = useTheme();
  const { branchId }   = useSettingsStore();
  const { token }      = useAuthStore();

  const duzenlemeModu  = Boolean(id);

  // ── Genel durum ──
  const [yukleniyor, setYukleniyor]       = useState(duzenlemeModu);
  const [kaydediliyor, setKaydediliyor]   = useState(false);
  const [hata, setHata]                   = useState<string | null>(null);
  const [isOffline, setIsOffline]         = useState(false);
  const [bekleyenIslem, setBekleyenIslem] = useState(0);
  const [kategoriler, setKategoriler]     = useState<Kategori[]>([]);

  // ── Form alanları ──
  const [form, setForm] = useState<UrunForm>({
    name          : '',
    barcode       : '',
    category_id   : '',
    unit          : 'adet',
    units_per_case: '1',
    price         : '',
    cost          : '',
    vat_rate      : '18',
    stock_qty     : '0',
    min_stock     : '5',
    shelf_location: '',
  });

  // ── Doğrulama hataları ──
  const [dogrulamaHatalari, setDogrulamaHatalari] = useState<Partial<Record<keyof UrunForm, string>>>({});

  // ============================================================
  // VERİ YÜKLEME
  // ============================================================

  const kategoriYukle = useCallback(async () => {
    try {
      const yanit = await api.get(`/api/categories?branch_id=${branchId}&limit=100`);
      setKategoriler(yanit.data?.items ?? yanit.data ?? []);
    } catch {
      // Kategori yüklenemezse boş liste — engelleme yapma
    }
  }, [branchId]);

  const urunYukle = useCallback(async () => {
    if (!id) return;
    setYukleniyor(true);
    setHata(null);
    try {
      const yanit = await api.get(`/api/products/${id}`);
      const u     = yanit.data;
      setForm({
        name          : u.name           ?? '',
        barcode       : u.barcode        ?? '',
        category_id   : u.category_id != null ? String(u.category_id) : '',
        unit          : u.unit           ?? 'adet',
        units_per_case: u.units_per_case != null ? String(u.units_per_case) : '1',
        price         : u.price          != null ? String(u.price)     : '',
        cost          : u.cost           != null ? String(u.cost)      : '',
        vat_rate      : u.vat_rate       != null ? String(u.vat_rate)  : '18',
        stock_qty     : u.stock_qty      != null ? String(u.stock_qty) : '0',
        min_stock     : u.min_stock      != null ? String(u.min_stock) : '5',
        shelf_location: u.shelf_location ?? '',
      });
      setIsOffline(false);
    } catch (err: any) {
      if (!err.response) {
        setIsOffline(true);
        setHata('Sunucuya ulaşılamıyor. Bağlantınızı kontrol edin.');
      } else {
        setHata(err.response?.data?.detail ?? 'Ürün yüklenemedi.');
      }
    } finally {
      setYukleniyor(false);
    }
  }, [id]);

  useEffect(() => {
    kategoriYukle();
    urunYukle();
    getPendingCount().then(setBekleyenIslem);
  }, [kategoriYukle, urunYukle]);

  // ============================================================
  // FORM YARDIMCILARI
  // ============================================================

  const alaniGuncelle = (alan: keyof UrunForm, deger: string) => {
    setForm((prev) => ({ ...prev, [alan]: deger }));
    // Alan düzeltilince doğrulama hatasını temizle
    if (dogrulamaHatalari[alan]) {
      setDogrulamaHatalari((prev) => ({ ...prev, [alan]: undefined }));
    }
  };

  const dogrula = (): boolean => {
    const hatalar: Partial<Record<keyof UrunForm, string>> = {};

    if (!form.name.trim()) {
      hatalar.name = 'Ürün adı zorunludur.';
    }
    if (!form.price.trim() || isNaN(Number(form.price)) || Number(form.price) < 0) {
      hatalar.price = 'Geçerli bir satış fiyatı girin.';
    }
    if (form.cost && (isNaN(Number(form.cost)) || Number(form.cost) < 0)) {
      hatalar.cost = 'Geçerli bir alış fiyatı girin.';
    }
    if (isNaN(Number(form.stock_qty))) {
      hatalar.stock_qty = 'Geçerli bir stok miktarı girin.';
    }
    if (isNaN(Number(form.min_stock)) || Number(form.min_stock) < 0) {
      hatalar.min_stock = 'Geçerli bir minimum stok girin.';
    }

    setDogrulamaHatalari(hatalar);
    return Object.keys(hatalar).length === 0;
  };

  // ============================================================
  // KAYDET
  // ============================================================

  const kaydet = async () => {
    if (!dogrula()) return;
    if (isOffline) {
      Alert.alert('Offline', 'Bağlantı olmadan ürün kaydedilemez.');
      return;
    }

    setKaydediliyor(true);
    setHata(null);

    const veri: Record<string, any> = {
      name          : form.name.trim(),
      barcode       : form.barcode.trim() || undefined,
      category_id   : form.category_id ? parseInt(form.category_id) : undefined,
      unit          : form.unit,
      units_per_case: parseInt(form.units_per_case) || 1,
      price         : parseFloat(form.price),
      cost          : form.cost ? parseFloat(form.cost) : undefined,
      vat_rate      : parseInt(form.vat_rate),
      stock_qty     : parseInt(form.stock_qty),
      min_stock     : parseInt(form.min_stock),
      shelf_location: form.shelf_location.trim() || undefined,
      branch_id     : branchId,
    };

    try {
      if (duzenlemeModu) {
        await api.patch(`/api/products/${id}`, veri);
      } else {
        await api.post('/api/products', veri);
      }
      router.back();
    } catch (err: any) {
      if (!err.response) {
        setIsOffline(true);
        setHata('Sunucuya ulaşılamıyor.');
      } else {
        setHata(err.response?.data?.detail ?? 'Kaydedilemedi. Tekrar deneyin.');
      }
    } finally {
      setKaydediliyor(false);
    }
  };

  // ============================================================
  // SİL (sadece düzenleme modunda)
  // ============================================================

  const sil = () => {
    Alert.alert(
      'Ürünü Sil',
      `"${form.name}" ürününü silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text   : 'Sil',
          style  : 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/products/${id}?branch_id=${branchId}`);
              router.back();
            } catch (err: any) {
              Alert.alert('Hata', err.response?.data?.detail ?? 'Silinemedi.');
            }
          },
        },
      ]
    );
  };

  // ============================================================
  // RENDER: LOADING
  // ============================================================

  if (yukleniyor) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.blue} />
        <Text style={[styles.yukleniyorMetin, { color: colors.textMuted, fontFamily: FONT_FAMILY.body }]}>
          Ürün yükleniyor...
        </Text>
      </View>
    );
  }

  // ============================================================
  // RENDER: ANA FORM
  // ============================================================

  return (
    <KeyboardAvoidingView
      style             = {{ flex: 1 }}
      behavior          = {Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset = {80}
    >
      <View style={[styles.ekran, { backgroundColor: colors.bgPrimary }]}>

        {/* ── Offline Banner ── */}
        {(isOffline || bekleyenIslem > 0) && (
          <View style={[styles.offlineBant, { backgroundColor: colors.danger }]}>
            <Text style={[styles.offlineMetin, { fontFamily: FONT_FAMILY.bodyMedium }]}>
              🔴 Offline · {bekleyenIslem} işlem bekliyor
            </Text>
          </View>
        )}

        {/* ── Genel hata mesajı ── */}
        {hata && (
          <View style={[styles.hataBant, { backgroundColor: colors.danger + '22', borderColor: colors.danger }]}>
            <Text style={[styles.hataBantMetin, { color: colors.danger, fontFamily: FONT_FAMILY.body }]}>
              ⚠️ {hata}
            </Text>
          </View>
        )}

        <ScrollView
          contentContainerStyle = {{ padding: SPACING.base, paddingBottom: SPACING.xxl * 2 }}
          keyboardShouldPersistTaps = "handled"
          showsVerticalScrollIndicator = {false}
        >
          {/* ── ÜRÜN ADI ── */}
          <AlanBasligi label="Ürün Adı *" colors={colors} />
          <TextInput
            value            = {form.name}
            onChangeText     = {(v) => alaniGuncelle('name', v)}
            placeholder      = "Örn: Süt 1L"
            placeholderTextColor = {colors.textHint}
            style={[
              styles.giris,
              {
                backgroundColor: colors.bgSecondary,
                borderColor    : dogrulamaHatalari.name ? colors.danger : colors.border,
                color          : colors.textPrimary,
                fontFamily     : FONT_FAMILY.body,
              },
            ]}
          />
          {dogrulamaHatalari.name && (
            <Text style={[styles.hataMesaji, { color: colors.danger }]}>{dogrulamaHatalari.name}</Text>
          )}

          {/* ── BARKOD ── */}
          <AlanBasligi label="Barkod" colors={colors} />
          <TextInput
            value            = {form.barcode}
            onChangeText     = {(v) => alaniGuncelle('barcode', v)}
            placeholder      = "Boş bırakılırsa otomatik üretilir"
            placeholderTextColor = {colors.textHint}
            keyboardType     = "numeric"
            style={[
              styles.giris,
              { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary, fontFamily: FONT_FAMILY.body },
            ]}
          />

          {/* ── KATEGORİ ── */}
          <AlanBasligi label="Kategori" colors={colors} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator = {false}
            contentContainerStyle          = {{ gap: SPACING.sm, paddingVertical: SPACING.xs }}
          >
            <KategoriButon
              label    = "Seçilmedi"
              secili   = {form.category_id === ''}
              onPress  = {() => alaniGuncelle('category_id', '')}
              colors   = {colors}
            />
            {kategoriler.map((k) => (
              <KategoriButon
                key      = {String(k.id)}
                label    = {k.name}
                secili   = {form.category_id === String(k.id)}
                onPress  = {() => alaniGuncelle('category_id', String(k.id))}
                colors   = {colors}
              />
            ))}
          </ScrollView>

          {/* ── BİRİM ── */}
          <AlanBasligi label="Birim" colors={colors} />
          <View style={styles.satirSecenekler}>
            {BIRIM_SECENEKLERI.map((b) => (
              <SecenekButon
                key    = {b}
                label  = {b}
                secili = {form.unit === b}
                onPress= {() => alaniGuncelle('unit', b)}
                colors = {colors}
              />
            ))}
          </View>

          {/* ── KOLİ ADEDI ── */}
          <AlanBasligi label="Koli Başına Adet" colors={colors} />
          <TextInput
            value            = {form.units_per_case}
            onChangeText     = {(v) => alaniGuncelle('units_per_case', v)}
            placeholder      = "1 (koli yoksa 1 bırak)"
            placeholderTextColor = {colors.textHint}
            keyboardType     = "number-pad"
            style={[
              styles.giris,
              { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary, fontFamily: FONT_FAMILY.body },
            ]}
          />

          {/* ── FİYATLAR ── */}
          <View style={styles.satirIkiSutun}>
            <View style={{ flex: 1 }}>
              <AlanBasligi label="Satış Fiyatı (₺) *" colors={colors} />
              <TextInput
                value            = {form.price}
                onChangeText     = {(v) => alaniGuncelle('price', v)}
                placeholder      = "0.00"
                placeholderTextColor = {colors.textHint}
                keyboardType     = "decimal-pad"
                style={[
                  styles.giris,
                  {
                    backgroundColor: colors.bgSecondary,
                    borderColor    : dogrulamaHatalari.price ? colors.danger : colors.border,
                    color          : colors.textPrimary,
                    fontFamily     : FONT_FAMILY.body,
                  },
                ]}
              />
              {dogrulamaHatalari.price && (
                <Text style={[styles.hataMesaji, { color: colors.danger }]}>{dogrulamaHatalari.price}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <AlanBasligi label="Alış Fiyatı (₺)" colors={colors} />
              <TextInput
                value            = {form.cost}
                onChangeText     = {(v) => alaniGuncelle('cost', v)}
                placeholder      = "0.00"
                placeholderTextColor = {colors.textHint}
                keyboardType     = "decimal-pad"
                style={[
                  styles.giris,
                  {
                    backgroundColor: colors.bgSecondary,
                    borderColor    : dogrulamaHatalari.cost ? colors.danger : colors.border,
                    color          : colors.textPrimary,
                    fontFamily     : FONT_FAMILY.body,
                  },
                ]}
              />
              {dogrulamaHatalari.cost && (
                <Text style={[styles.hataMesaji, { color: colors.danger }]}>{dogrulamaHatalari.cost}</Text>
              )}
            </View>
          </View>

          {/* ── KDV ORANI ── */}
          <AlanBasligi label="KDV Oranı (%)" colors={colors} />
          <View style={styles.satirSecenekler}>
            {KDV_SECENEKLERI.map((k) => (
              <SecenekButon
                key    = {k}
                label  = {`%${k}`}
                secili = {form.vat_rate === k}
                onPress= {() => alaniGuncelle('vat_rate', k)}
                colors = {colors}
              />
            ))}
          </View>

          {/* ── STOK ── */}
          <View style={styles.satirIkiSutun}>
            <View style={{ flex: 1 }}>
              <AlanBasligi label="Mevcut Stok" colors={colors} />
              <TextInput
                value            = {form.stock_qty}
                onChangeText     = {(v) => alaniGuncelle('stock_qty', v)}
                placeholder      = "0"
                placeholderTextColor = {colors.textHint}
                keyboardType     = "numeric"
                editable         = {!duzenlemeModu}   // Düzenlemede stok doğrudan değiştirilemez
                style={[
                  styles.giris,
                  {
                    backgroundColor: duzenlemeModu ? colors.bgTertiary : colors.bgSecondary,
                    borderColor    : dogrulamaHatalari.stock_qty ? colors.danger : colors.border,
                    color          : duzenlemeModu ? colors.textHint : colors.textPrimary,
                    fontFamily     : FONT_FAMILY.body,
                  },
                ]}
              />
              {duzenlemeModu && (
                <Text style={[styles.ipucuMetin, { color: colors.textHint, fontFamily: FONT_FAMILY.body }]}>
                  Stok değişikliği için Stok Hareketi kullanın
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <AlanBasligi label="Min. Stok Uyarısı" colors={colors} />
              <TextInput
                value            = {form.min_stock}
                onChangeText     = {(v) => alaniGuncelle('min_stock', v)}
                placeholder      = "5"
                placeholderTextColor = {colors.textHint}
                keyboardType     = "numeric"
                style={[
                  styles.giris,
                  {
                    backgroundColor: colors.bgSecondary,
                    borderColor    : dogrulamaHatalari.min_stock ? colors.danger : colors.border,
                    color          : colors.textPrimary,
                    fontFamily     : FONT_FAMILY.body,
                  },
                ]}
              />
            </View>
          </View>

          {/* ── RAF KONUMU ── */}
          <AlanBasligi label="Raf Konumu" colors={colors} />
          <TextInput
            value            = {form.shelf_location}
            onChangeText     = {(v) => alaniGuncelle('shelf_location', v)}
            placeholder      = "Örn: A-3, Soğuk Raf"
            placeholderTextColor = {colors.textHint}
            style={[
              styles.giris,
              { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary, fontFamily: FONT_FAMILY.body },
            ]}
          />

          {/* ── KAYDET BUTONU ── */}
          <TouchableOpacity
            onPress  = {kaydet}
            disabled = {kaydediliyor || isOffline}
            style={[
              styles.kaydetButon,
              {
                backgroundColor: isOffline ? colors.textHint : colors.blue,
                minHeight      : MIN_TOUCH_SIZE,
                marginTop      : SPACING.xl,
              },
            ]}
          >
            {kaydediliyor ? (
              <ActivityIndicator color={WHITE} />
            ) : (
              <Text style={[styles.kaydetButonMetin, { fontFamily: FONT_FAMILY.bodyMedium }]}>
                {duzenlemeModu ? '💾 Değişiklikleri Kaydet' : '➕ Ürün Ekle'}
              </Text>
            )}
          </TouchableOpacity>

          {/* ── SİL BUTONU (sadece düzenleme modunda) ── */}
          {duzenlemeModu && (
            <TouchableOpacity
              onPress = {sil}
              style={[
                styles.silButon,
                { borderColor: colors.danger, minHeight: MIN_TOUCH_SIZE, marginTop: SPACING.md },
              ]}
            >
              <Text style={[styles.silButonMetin, { color: colors.danger, fontFamily: FONT_FAMILY.bodyMedium }]}>
                🗑️ Ürünü Sil
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ============================================================
// YARDIMCI KOMPONENTLEr
// ============================================================

function AlanBasligi({ label, colors }: { label: string; colors: any }) {
  return (
    <Text style={[alanBasligiStil, { color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium }]}>
      {label}
    </Text>
  );
}
const alanBasligiStil: any = {
  fontSize    : FONT_SIZE.sm,
  marginTop   : SPACING.base,
  marginBottom: SPACING.xs,
};

function KategoriButon({ label, secili, onPress, colors }: {
  label  : string;
  secili : boolean;
  onPress: () => void;
  colors : any;
}) {
  return (
    <TouchableOpacity
      onPress = {onPress}
      style={[
        styles.kucukSecenekButon,
        {
          backgroundColor: secili ? colors.blue : colors.bgSecondary,
          borderColor    : secili ? colors.blue : colors.border,
          minHeight      : MIN_TOUCH_SIZE,
        },
      ]}
    >
      <Text style={{ color: secili ? WHITE : colors.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SecenekButon({ label, secili, onPress, colors }: {
  label  : string;
  secili : boolean;
  onPress: () => void;
  colors : any;
}) {
  return (
    <TouchableOpacity
      onPress = {onPress}
      style={[
        styles.kucukSecenekButon,
        {
          backgroundColor: secili ? colors.blue : colors.bgSecondary,
          borderColor    : secili ? colors.blue : colors.border,
          minHeight      : MIN_TOUCH_SIZE,
        },
      ]}
    >
      <Text style={{ color: secili ? WHITE : colors.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ============================================================
// STİLLER
// ============================================================

const styles = StyleSheet.create({
  ekran: {
    flex: 1,
  },
  merkez: {
    flex          : 1,
    alignItems    : 'center',
    justifyContent: 'center',
    gap           : SPACING.base,
  },
  yukleniyorMetin: {
    fontSize : FONT_SIZE.base,
    marginTop: SPACING.sm,
  },
  offlineBant: {
    paddingVertical  : SPACING.sm,
    paddingHorizontal: SPACING.base,
    alignItems       : 'center',
  },
  offlineMetin: {
    color   : WHITE,
    fontSize: FONT_SIZE.sm,
  },
  hataBant: {
    margin      : SPACING.base,
    padding     : SPACING.base,
    borderRadius: RADIUS.card,
    borderWidth : 1,
  },
  hataBantMetin: {
    fontSize: FONT_SIZE.sm,
  },
  giris: {
    borderWidth  : 1,
    borderRadius : RADIUS.button,
    paddingHorizontal: SPACING.base,
    paddingVertical  : SPACING.md,
    fontSize     : FONT_SIZE.base,
    minHeight    : MIN_TOUCH_SIZE,
  },
  hataMesaji: {
    fontSize  : FONT_SIZE.xs,
    marginTop : SPACING.xs,
  },
  ipucuMetin: {
    fontSize  : FONT_SIZE.xs,
    marginTop : SPACING.xs,
  },
  satirIkiSutun: {
    flexDirection: 'row',
    gap          : SPACING.sm,
  },
  satirSecenekler: {
    flexDirection : 'row',
    flexWrap      : 'wrap',
    gap           : SPACING.sm,
  },
  kucukSecenekButon: {
    paddingHorizontal: SPACING.base,
    paddingVertical  : SPACING.sm,
    borderRadius     : RADIUS.badge,
    borderWidth      : 1,
    alignItems       : 'center',
    justifyContent   : 'center',
  },
  kaydetButon: {
    borderRadius : RADIUS.button,
    alignItems   : 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
  },
  kaydetButonMetin: {
    color   : WHITE,
    fontSize: FONT_SIZE.base,
  },
  silButon: {
    borderRadius : RADIUS.button,
    borderWidth  : 1,
    alignItems   : 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
  },
  silButonMetin: {
    fontSize: FONT_SIZE.base,
  },
});
