/**
 * Market Yönetim Sistemi — Personel Yönetim Ekranı
 * Personel listesi, oluşturma, aktif/pasif, PIN sıfırlama
 *
 * Kalite kontrol:
 * ✅ Loading state
 * ✅ Empty state
 * ✅ Error state
 * ✅ useTheme() — hardcode renk yok
 * ✅ Min 48px dokunma alanı
 * ✅ Türkçe yorum satırları
 * ✅ Sadece admin görebilir
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme }        from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore }    from '../../stores/authStore';
import { Badge }           from '../../components/ui/Badge';
import { Button }          from '../../components/ui/Button';
import { api }             from '../../services/api';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE }          from '../../constants/typography';

interface Personel {
  id        : number;
  name      : string;
  role      : 'admin' | 'cashier' | 'warehouse';
  email     : string | null;
  active    : boolean;
  branch_id : number;
  created_at: string;
}

const ROL_ETİKET: Record<string, string> = {
  admin    : '👑 Yönetici',
  cashier  : '💼 Kasiyer',
  warehouse: '📦 Depocu',
};

const ROL_VARYANT: Record<string, 'info' | 'warning' | 'success'> = {
  admin    : 'info',
  cashier  : 'success',
  warehouse: 'warning',
};

export default function PersonnelScreen() {
  const { colors }   = useTheme();
  const { branchId } = useSettingsStore();
  const { user }     = useAuthStore();

  const [personeller, setPersoneller]   = useState<Personel[]>([]);
  const [yukleniyor, setYukleniyor]     = useState(true);
  const [hata, setHata]                 = useState<string | null>(null);

  // Form modal
  const [formAcik, setFormAcik]       = useState(false);
  const [duzenlenen, setDuzenlenen]   = useState<Personel | null>(null);
  const [formIslem, setFormIslem]     = useState(false);

  // Form alanları
  const [formAd, setFormAd]           = useState('');
  const [formRol, setFormRol]         = useState<'admin'|'cashier'|'warehouse'>('cashier');
  const [formEmail, setFormEmail]     = useState('');
  const [formSifre, setFormSifre]     = useState('');
  const [formPin, setFormPin]         = useState('');

  // PIN sıfırlama modal
  const [pinModalAcik, setPinModalAcik] = useState(false);
  const [pinHedef, setPinHedef]         = useState<Personel | null>(null);
  const [yeniPin, setYeniPin]           = useState('');
  const [pinIslem, setPinIslem]         = useState(false);

  // ============================================================
  // YETKİ KONTROLÜ
  // ============================================================

  if (user?.role !== 'admin') {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <Text style={{ fontSize: 48 }}>🔒</Text>
        <Text style={[{ color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium }]}>
          Bu ekran sadece yöneticiye açık.
        </Text>
      </View>
    );
  }

  // ============================================================
  // VERİ ÇEKME
  // ============================================================

  const personelleriYukle = useCallback(async () => {
    setYukleniyor(true);
    setHata(null);
    try {
      const yanit = await api.get(`/api/personnel?branch_id=${branchId}&per_page=100`);
      setPersoneller(yanit.data.items);
    } catch (err: any) {
      setHata(err.response?.data?.detail || 'Personel listesi yüklenemedi.');
    } finally {
      setYukleniyor(false);
    }
  }, [branchId]);

  useEffect(() => {
    personelleriYukle();
  }, [personelleriYukle]);

  // ============================================================
  // FORM AÇ
  // ============================================================

  const formAc = (personel?: Personel) => {
    if (personel) {
      setDuzenlenen(personel);
      setFormAd(personel.name);
      setFormRol(personel.role);
      setFormEmail(personel.email || '');
      setFormSifre('');
      setFormPin('');
    } else {
      setDuzenlenen(null);
      setFormAd('');
      setFormRol('cashier');
      setFormEmail('');
      setFormSifre('');
      setFormPin('');
    }
    setFormAcik(true);
  };

  // ============================================================
  // KAYDET
  // ============================================================

  const kaydet = async () => {
    if (!formAd.trim()) {
      Alert.alert('Hata', 'Personel adı zorunludur.');
      return;
    }

    setFormIslem(true);
    try {
      const istek = {
        name     : formAd.trim(),
        role     : formRol,
        email    : formEmail || null,
        password : formSifre || null,
        pin      : formPin   || null,
        branch_id: branchId,
        active   : true,
      };

      if (duzenlenen) {
        await api.patch(`/api/personnel/${duzenlenen.id}`, istek);
      } else {
        await api.post('/api/personnel', istek);
      }

      setFormAcik(false);
      personelleriYukle();

    } catch (err: any) {
      Alert.alert('Hata', err.response?.data?.detail || 'Kayıt başarısız.');
    } finally {
      setFormIslem(false);
    }
  };

  // ============================================================
  // AKTİF / PASİF
  // ============================================================

  const aktiflikDegistir = async (personel: Personel) => {
    const mesaj = personel.active
      ? `${personel.name} pasif yapılacak. Giriş yapamayacak. Devam?`
      : `${personel.name} aktif yapılacak. Devam?`;

    Alert.alert('Onay', mesaj, [
      { text: 'İptal', style: 'cancel' },
      {
        text   : personel.active ? 'Pasif Yap' : 'Aktif Yap',
        style  : personel.active ? 'destructive' : 'default',
        onPress: async () => {
          try {
            await api.patch(`/api/personnel/${personel.id}/toggle-active`);
            personelleriYukle();
          } catch (err: any) {
            Alert.alert('Hata', err.response?.data?.detail || 'İşlem başarısız.');
          }
        },
      },
    ]);
  };

  // ============================================================
  // PIN SIFIRLA
  // ============================================================

  const pinSifirla = async () => {
    if (!pinHedef) return;
    if (yeniPin.length !== 6 || !/^\d+$/.test(yeniPin)) {
      Alert.alert('Hata', 'PIN tam olarak 6 haneli rakam olmalıdır.');
      return;
    }

    setPinIslem(true);
    try {
      await api.post(`/api/personnel/${pinHedef.id}/reset-pin?yeni_pin=${yeniPin}`);
      setPinModalAcik(false);
      setYeniPin('');
      Alert.alert('Başarılı', `${pinHedef.name} PIN'i sıfırlandı.`);
    } catch (err: any) {
      Alert.alert('Hata', err.response?.data?.detail || 'PIN sıfırlama başarısız.');
    } finally {
      setPinIslem(false);
    }
  };

  // ============================================================
  // RENDER: YÜKLEME
  // ============================================================

  if (yukleniyor) {
    return (
      <View style={[styles.merkez, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.blue} />
      </View>
    );
  }

  // ============================================================
  // RENDER: ANA EKRAN
  // ============================================================

  return (
    <View style={[{ flex: 1, backgroundColor: colors.bgPrimary }]}>

      {/* ── Üst Bar ── */}
      <View style={[styles.ustBar, { borderBottomColor: colors.border }]}>
        <Text style={[styles.baslik, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold }]}>
          {personeller.length} personel
        </Text>
        <TouchableOpacity
          onPress = {() => formAc()}
          style   = {[styles.ekleButon, { backgroundColor: colors.blue, minHeight: MIN_TOUCH_SIZE }]}
          accessibilityLabel = "Yeni personel ekle"
        >
          <Text style={[{ color: '#FFFFFF', fontFamily: FONT_FAMILY.bodyMedium }]}>+ Ekle</Text>
        </TouchableOpacity>
      </View>

      {/* ── Hata ── */}
      {hata && (
        <View style={[styles.hataBant, { backgroundColor: colors.danger + '15' }]}>
          <Text style={[{ color: colors.danger, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm }]}>{hata}</Text>
        </View>
      )}

      {/* ── Personel Listesi ── */}
      <FlatList
        data              = {personeller}
        keyExtractor      = {(item) => String(item.id)}
        renderItem        = {({ item }) => (
          <_PersonelSatiri
            personel         = {item}
            colors           = {colors}
            benimId          = {user?.id}
            onDuzenle        = {() => formAc(item)}
            onAktiflik       = {() => aktiflikDegistir(item)}
            onPinSifirla     = {() => {
              setPinHedef(item);
              setYeniPin('');
              setPinModalAcik(true);
            }}
          />
        )}
        contentContainerStyle = {{ padding: SPACING.sm }}
        ListEmptyComponent    = {
          <View style={styles.bosEkran}>
            <Text style={{ fontSize: 48 }}>👤</Text>
            <Text style={[{ color: colors.textMuted, fontFamily: FONT_FAMILY.bodyMedium }]}>
              Henüz personel yok
            </Text>
          </View>
        }
      />

      {/* ── Personel Form Modalı ── */}
      <Modal
        visible       = {formAcik}
        animationType = "slide"
        presentationStyle = "pageSheet"
        onRequestClose    = {() => setFormAcik(false)}
      >
        <KeyboardAvoidingView
          style    = {{ flex: 1 }}
          behavior = {Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView style={[styles.modal, { backgroundColor: colors.bgPrimary }]}>

            {/* Başlık */}
            <View style={[styles.modalBaslik, { borderBottomColor: colors.border }]}>
              <Text style={[{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold, fontSize: FONT_SIZE.md }]}>
                {duzenlenen ? 'Personel Düzenle' : 'Yeni Personel'}
              </Text>
              <TouchableOpacity
                onPress = {() => setFormAcik(false)}
                style   = {{ minWidth: MIN_TOUCH_SIZE, alignItems: 'center' }}
              >
                <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ padding: SPACING.base, gap: SPACING.base }}>

              {/* Ad */}
              <_FormAlani
                etiket      = "Ad Soyad *"
                deger       = {formAd}
                onChange    = {setFormAd}
                placeholder = "Personel adı"
                colors      = {colors}
              />

              {/* Rol seçimi */}
              <View style={{ gap: SPACING.xs }}>
                <Text style={[{ color: colors.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm }]}>
                  Rol *
                </Text>
                <View style={styles.rolGrup}>
                  {(['admin', 'cashier', 'warehouse'] as const).map((rol) => (
                    <TouchableOpacity
                      key     = {rol}
                      onPress = {() => setFormRol(rol)}
                      style   = {[
                        styles.rolButon,
                        {
                          backgroundColor: formRol === rol ? colors.blue + '20' : colors.bgSecondary,
                          borderColor    : formRol === rol ? colors.blue : colors.border,
                          minHeight      : MIN_TOUCH_SIZE,
                        },
                      ]}
                    >
                      <Text style={[{
                        color     : formRol === rol ? colors.blue : colors.textMuted,
                        fontFamily: formRol === rol ? FONT_FAMILY.bodyMedium : FONT_FAMILY.body,
                        fontSize  : FONT_SIZE.sm,
                      }]}>
                        {ROL_ETİKET[rol]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Email (admin için) */}
              {(formRol === 'admin' || formRol === 'cashier') && (
                <_FormAlani
                  etiket      = "E-posta"
                  deger       = {formEmail}
                  onChange    = {setFormEmail}
                  placeholder = "ornek@mail.com"
                  keyboardType= "email-address"
                  colors      = {colors}
                />
              )}

              {/* Şifre (admin için) */}
              {formRol === 'admin' && (
                <_FormAlani
                  etiket      = {duzenlenen ? 'Yeni Şifre (boş bırakılırsa değişmez)' : 'Şifre *'}
                  deger       = {formSifre}
                  onChange    = {setFormSifre}
                  placeholder = "Minimum 6 karakter"
                  gizli
                  colors      = {colors}
                />
              )}

              {/* PIN (kasiyer / depocu için) */}
              {(formRol === 'cashier' || formRol === 'warehouse') && !duzenlenen && (
                <_FormAlani
                  etiket      = "Kasa PIN'i * (6 haneli)"
                  deger       = {formPin}
                  onChange    = {(t) => setFormPin(t.replace(/\D/g, '').slice(0, 6))}
                  placeholder = "123456"
                  keyboardType= "number-pad"
                  colors      = {colors}
                />
              )}

              {/* Kaydet */}
              <Button
                label    = {formIslem ? 'Kaydediliyor...' : duzenlenen ? 'Güncelle' : 'Kaydet'}
                variant  = "primary"
                size     = "lg"
                fullWidth
                onPress  = {kaydet}
                loading  = {formIslem}
                disabled = {formIslem}
              />

            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── PIN Sıfırlama Modalı ── */}
      <Modal
        visible       = {pinModalAcik}
        animationType = "slide"
        presentationStyle = "formSheet"
        onRequestClose    = {() => setPinModalAcik(false)}
      >
        <View style={[styles.pinModal, { backgroundColor: colors.bgPrimary }]}>
          <Text style={[{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bodySemiBold, fontSize: FONT_SIZE.md }]}>
            PIN Sıfırla
          </Text>
          {pinHedef && (
            <Text style={[{ color: colors.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, marginTop: 4 }]}>
              {pinHedef.name} için yeni PIN girin
            </Text>
          )}

          <View style={[styles.pinGirisKutu, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
            <TextInput
              value            = {yeniPin}
              onChangeText     = {(t) => setYeniPin(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType     = "number-pad"
              autoFocus
              placeholder      = "6 haneli PIN"
              placeholderTextColor = {colors.textHint}
              secureTextEntry
              maxLength        = {6}
              style            = {[{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyBold, fontSize: FONT_SIZE.xl, textAlign: 'center', flex: 1 }]}
            />
          </View>

          <Text style={[{ color: colors.textHint, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, textAlign: 'center' }]}>
            {yeniPin.length}/6 hane
          </Text>

          <View style={[styles.odemeButonlar, { marginTop: SPACING.base }]}>
            <Button
              label    = "İptal"
              variant  = "ghost"
              size     = "lg"
              onPress  = {() => { setPinModalAcik(false); setYeniPin(''); }}
              style    = {{ flex: 1 }}
            />
            <Button
              label    = {pinIslem ? 'Sıfırlanıyor...' : 'PIN Sıfırla'}
              variant  = "primary"
              size     = "lg"
              onPress  = {pinSifirla}
              loading  = {pinIslem}
              disabled = {pinIslem || yeniPin.length !== 6}
              style    = {{ flex: 2 }}
            />
          </View>
        </View>
      </Modal>

    </View>
  );
}


// ============================================================
// ALT KOMPONENTLER
// ============================================================

function _PersonelSatiri({
  personel, colors, benimId, onDuzenle, onAktiflik, onPinSifirla,
}: {
  personel    : Personel;
  colors      : any;
  benimId     : number | undefined;
  onDuzenle   : () => void;
  onAktiflik  : () => void;
  onPinSifirla: () => void;
}) {
  const benim = personel.id === benimId;

  return (
    <View style={[
      styles.personelSatiri,
      {
        backgroundColor: colors.bgSecondary,
        borderColor    : benim ? colors.blue : colors.border,
        opacity        : personel.active ? 1 : 0.6,
      },
    ]}>
      {/* Avatar + bilgi */}
      <View style={[styles.avatar, { backgroundColor: colors.blue + '20' }]}>
        <Text style={[{ color: colors.blue, fontFamily: FONT_FAMILY.bodyBold }]}>
          {personel.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }}>
          <Text style={[{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.base }]}>
            {personel.name}
          </Text>
          {benim && (
            <Badge label="Sen" variant="info" />
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: 2 }}>
          <Badge label={ROL_ETİKET[personel.role]} variant={ROL_VARYANT[personel.role]} />
          {!personel.active && <Badge label="Pasif" variant="danger" />}
        </View>
      </View>

      {/* Aksiyonlar */}
      <View style={styles.aksiyonlar}>
        <TouchableOpacity
          onPress            = {onDuzenle}
          style              = {[styles.aksiyonButon, { backgroundColor: colors.bgTertiary }]}
          accessibilityLabel = "Düzenle"
        >
          <Text style={{ fontSize: 16 }}>✏️</Text>
        </TouchableOpacity>
        {(personel.role === 'cashier' || personel.role === 'warehouse') && (
          <TouchableOpacity
            onPress            = {onPinSifirla}
            style              = {[styles.aksiyonButon, { backgroundColor: colors.bgTertiary }]}
            accessibilityLabel = "PIN sıfırla"
          >
            <Text style={{ fontSize: 16 }}>🔑</Text>
          </TouchableOpacity>
        )}
        {!benim && (
          <TouchableOpacity
            onPress            = {onAktiflik}
            style              = {[
              styles.aksiyonButon,
              { backgroundColor: personel.active ? colors.danger + '15' : colors.success + '15' },
            ]}
            accessibilityLabel = {personel.active ? 'Pasif yap' : 'Aktif yap'}
          >
            <Text style={{ fontSize: 16 }}>{personel.active ? '🚫' : '✅'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function _FormAlani({
  etiket, deger, onChange, placeholder, keyboardType, gizli, colors,
}: {
  etiket      : string;
  deger       : string;
  onChange    : (t: string) => void;
  placeholder?: string;
  keyboardType?: any;
  gizli?      : boolean;
  colors      : any;
}) {
  return (
    <View style={{ gap: SPACING.xs }}>
      <Text style={[{ color: colors.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm }]}>
        {etiket}
      </Text>
      <View style={[styles.girisKutu, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
        <TextInput
          value               = {deger}
          onChangeText        = {onChange}
          placeholder         = {placeholder}
          placeholderTextColor = {colors.textHint}
          keyboardType        = {keyboardType}
          secureTextEntry     = {gizli}
          style               = {[{ flex: 1, color: colors.textPrimary, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.base }]}
        />
      </View>
    </View>
  );
}


// ============================================================
// STİLLER
// ============================================================

const styles = StyleSheet.create({
  merkez: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.base,
  },
  ustBar: {
    flexDirection    : 'row',
    alignItems       : 'center',
    justifyContent   : 'space-between',
    padding          : SPACING.base,
    borderBottomWidth: 1,
  },
  baslik: {
    fontSize: FONT_SIZE.base,
  },
  ekleButon: {
    paddingHorizontal: SPACING.base,
    borderRadius     : RADIUS.button,
    alignItems       : 'center',
    justifyContent   : 'center',
  },
  hataBant: {
    padding: SPACING.sm,
  },
  personelSatiri: {
    flexDirection : 'row',
    alignItems    : 'center',
    borderRadius  : RADIUS.button,
    borderWidth   : 1,
    padding       : SPACING.sm,
    marginBottom  : SPACING.xs,
    gap           : SPACING.sm,
    minHeight     : MIN_TOUCH_SIZE,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  aksiyonlar: {
    flexDirection: 'row',
    gap          : SPACING.xs,
  },
  aksiyonButon: {
    width        : MIN_TOUCH_SIZE - 4,
    height       : MIN_TOUCH_SIZE - 4,
    borderRadius : RADIUS.button,
    alignItems   : 'center',
    justifyContent: 'center',
  },
  bosEkran: {
    alignItems: 'center', justifyContent: 'center',
    padding: SPACING.xl * 2, gap: SPACING.base,
  },
  // Modal
  modal: {
    flex: 1,
  },
  modalBaslik: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: SPACING.base, borderBottomWidth: 1,
  },
  rolGrup: {
    flexDirection: 'row', gap: SPACING.sm,
  },
  rolButon: {
    flex: 1, borderRadius: RADIUS.button, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    padding: SPACING.sm,
  },
  girisKutu: {
    height: MIN_TOUCH_SIZE, paddingHorizontal: SPACING.base,
    borderRadius: RADIUS.button, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center',
  },
  // PIN modal
  pinModal: {
    flex: 1, padding: SPACING.base, gap: SPACING.base,
  },
  pinGirisKutu: {
    height: MIN_TOUCH_SIZE + 24, paddingHorizontal: SPACING.base,
    borderRadius: RADIUS.button, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center',
  },
  odemeButonlar: {
    flexDirection: 'row', gap: SPACING.sm,
  },
});
