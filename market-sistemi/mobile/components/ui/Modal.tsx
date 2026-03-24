/**
 * Market Yönetim Sistemi — Modal Bileşeni
 * Onay diyalogları, form modalleri ve bilgi ekranları için kullanılır.
 *
 * Kullanım:
 *   <Modal visible={goster} onClose={kapat} title="Başlık">
 *     <Text>İçerik</Text>
 *   </Modal>
 */

import React from 'react';
import {
  Modal as RNModal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { SPACING, RADIUS, MIN_TOUCH_SIZE } from '../../constants/spacing';
import { FONT_FAMILY, FONT_SIZE }          from '../../constants/typography';

interface ModalProps {
  // Görünürlük
  visible   : boolean;
  onClose   : () => void;

  // İçerik
  title?    : string;
  children  : React.ReactNode;

  // Boyut
  size?     : 'sm' | 'md' | 'lg' | 'full';

  // Dışarı tıklayınca kapat
  dismissable? : boolean;
}

export function Modal({
  visible,
  onClose,
  title,
  children,
  size        = 'md',
  dismissable = true,
}: ModalProps) {
  const { colors } = useTheme();

  // Modal genişliği
  const genislik = {
    sm  : 360,
    md  : 480,
    lg  : 640,
    full: '100%' as const,
  }[size];

  return (
    <RNModal
      visible          = {visible}
      transparent      = {true}
      animationType    = "fade"
      onRequestClose   = {onClose}
      statusBarTranslucent = {true}
    >
      {/* Arka plan overlay */}
      <TouchableOpacity
        style        = {styles.overlay}
        activeOpacity= {1}
        onPress      = {dismissable ? onClose : undefined}
      >
        <KeyboardAvoidingView
          behavior = {Platform.OS === 'ios' ? 'padding' : undefined}
          style    = {{ alignItems: 'center', justifyContent: 'center', flex: 1 }}
        >
          {/* Modal kutu — tıklamayı içerde tut */}
          <TouchableOpacity
            activeOpacity = {1}
            onPress       = {() => {}}
            style         = {[
              styles.kutu,
              {
                width           : genislik,
                backgroundColor : colors.bgSecondary,
                borderColor     : colors.border,
                maxHeight       : '85%',
              },
            ]}
          >
            {/* ── Başlık ── */}
            {title && (
              <View style={[styles.baslik, { borderBottomColor: colors.border }]}>
                <Text style={[styles.baslikMetin, { color: colors.textPrimary, fontFamily: FONT_FAMILY.heading }]}>
                  {title}
                </Text>
                <TouchableOpacity
                  onPress  = {onClose}
                  hitSlop  = {{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style    = {{ minWidth: MIN_TOUCH_SIZE, alignItems: 'center' }}
                >
                  <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.lg }}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── İçerik ── */}
            <ScrollView
              contentContainerStyle = {{ padding: SPACING.base }}
              showsVerticalScrollIndicator = {false}
              keyboardShouldPersistTaps = "handled"
            >
              {children}
            </ScrollView>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </RNModal>
  );
}

// ============================================================
// YARDIMCI ALT BİLEŞENLER
// ============================================================

/**
 * Modal alt bilgisi — genellikle eylem butonları için
 * Kullanım: <Modal.Footer> <Button ... /> </Modal.Footer>
 */
export function ModalFooter({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.footer, { borderTopColor: colors.border }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex            : 1,
    backgroundColor : 'rgba(0,0,0,0.6)',
    alignItems      : 'center',
    justifyContent  : 'center',
  },
  kutu: {
    borderRadius: RADIUS.modal,
    borderWidth : 1,
    overflow    : 'hidden',
    shadowColor : '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius : 16,
    elevation   : 8,
  },
  baslik: {
    flexDirection    : 'row',
    alignItems       : 'center',
    justifyContent   : 'space-between',
    paddingHorizontal: SPACING.base,
    paddingVertical  : SPACING.md,
    borderBottomWidth: 1,
  },
  baslikMetin: {
    fontSize: FONT_SIZE.md,
    flex    : 1,
  },
  footer: {
    flexDirection: 'row',
    gap          : SPACING.sm,
    padding      : SPACING.base,
    borderTopWidth: 1,
  },
});
