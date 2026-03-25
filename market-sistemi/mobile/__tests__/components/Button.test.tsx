/**
 * Market Yönetim Sistemi — Button Komponent Testleri
 * Render, loading state, disabled state, onPress
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Button } from '../../components/ui/Button';

// useTheme mock
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      blue        : '#4F8EF7',
      bgTertiary  : '#1A2235',
      textPrimary : '#F1F5F9',
      danger      : '#F04F4F',
      success     : '#12C98A',
    },
    isDark: true,
  }),
}));


describe('Button — Render', () => {
  test('label metni gösterilir', () => {
    render(<Button label="Kaydet" onPress={() => {}} />);
    expect(screen.getByText('Kaydet')).toBeTruthy();
  });

  test('loading=true iken label gizlenir', () => {
    render(<Button label="Gönder" onPress={() => {}} loading />);
    expect(screen.queryByText('Gönder')).toBeNull();
  });

  test('loading=true iken buton busy=true erişilebilirlik durumuna geçer', () => {
    render(<Button label="Gönder" onPress={() => {}} loading />);
    const buton = screen.getByRole('button');
    expect(buton.props.accessibilityState).toMatchObject({ busy: true });
  });

  test('disabled=true iken buton erişilebilir durumda değil', () => {
    render(<Button label="Gönder" onPress={() => {}} disabled />);
    const buton = screen.getByRole('button');
    expect(buton).toBeDisabled();
  });
});


describe('Button — Etkileşim', () => {
  test('basılınca onPress tetiklenir', () => {
    const onPress = jest.fn();
    render(<Button label="Tıkla" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('disabled=true iken onPress tetiklenmez', () => {
    const onPress = jest.fn();
    render(<Button label="Tıkla" onPress={onPress} disabled />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  test('loading=true iken onPress tetiklenmez', () => {
    const onPress = jest.fn();
    render(<Button label="Gönder" onPress={onPress} loading />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});


describe('Button — Erişilebilirlik (a11y)', () => {
  test('accessibilityLabel prop olarak label kullanılır', () => {
    render(<Button label="Ürün Ekle" onPress={() => {}} />);
    expect(screen.getByLabelText('Ürün Ekle')).toBeTruthy();
  });

  test('min yükseklik (48px) karşılanır', () => {
    render(<Button label="Test" onPress={() => {}} size="sm" />);
    const buton = screen.getByRole('button');
    // RNTL stil dizisini düzleştirir — objectContaining ile kontrol
    expect(buton.props.style).toEqual(
      expect.objectContaining({ minHeight: 48 })
    );
  });
});
