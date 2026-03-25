/**
 * Market Yönetim Sistemi — Badge Komponent Testleri
 * stokDurumBadge yardımcı fonksiyonu, stokDurumLabel ve render testi
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Badge, stokDurumBadge, stokDurumLabel } from '../../components/ui/Badge';

// useTheme hook'unu mock'la — gerçek AsyncStorage / settingsStore gerektirmez
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      bgTertiary  : '#1A2235',
      textMuted   : '#94A3B8',
      success     : '#12C98A',
      warning     : '#F5A623',
      danger      : '#F04F4F',
    },
    isDark: true,
  }),
}));


describe('stokDurumBadge — Varyant dönüştürücü', () => {
  test("'critical' → 'critical' varyant", () => {
    expect(stokDurumBadge('critical')).toBe('critical');
  });

  test("'threshold' → 'threshold' varyant", () => {
    expect(stokDurumBadge('threshold')).toBe('threshold');
  });

  test("'adequate' → 'adequate' varyant", () => {
    expect(stokDurumBadge('adequate')).toBe('adequate');
  });

  test("'dormant' → 'dormant' varyant", () => {
    expect(stokDurumBadge('dormant')).toBe('dormant');
  });

  test('bilinmeyen durum → info varyant', () => {
    expect(stokDurumBadge('bilinmeyen')).toBe('info');
  });
});


describe('stokDurumLabel — Türkçe etiket', () => {
  test("'critical' → '⚡ Kritik'", () => {
    expect(stokDurumLabel('critical')).toBe('⚡ Kritik');
  });

  test("'threshold' → '⚠️ Eşik'", () => {
    expect(stokDurumLabel('threshold')).toBe('⚠️ Eşik');
  });

  test("'adequate' → '✓ Yeterli'", () => {
    expect(stokDurumLabel('adequate')).toBe('✓ Yeterli');
  });

  test("'dormant' → '💤 Durgun'", () => {
    expect(stokDurumLabel('dormant')).toBe('💤 Durgun');
  });

  test('bilinmeyen durum girdiyi olduğu gibi döner', () => {
    expect(stokDurumLabel('xyz')).toBe('xyz');
  });
});


describe('Badge — Render', () => {
  test('label metni ekranda görünür', () => {
    render(<Badge label="Kritik Stok" variant="critical" />);
    expect(screen.getByText('Kritik Stok')).toBeTruthy();
  });

  test('varsayılan varyant (info) ile render edilir', () => {
    render(<Badge label="Bilgi" />);
    expect(screen.getByText('Bilgi')).toBeTruthy();
  });
});
