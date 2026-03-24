/**
 * Market Yönetim Sistemi — Kimlik Doğrulama Grup Layout
 * Giriş ekranını Stack navigasyonu içinde gösterir.
 */

import { Stack } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';

export default function AuthLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown     : false,
        contentStyle    : { backgroundColor: colors.bgPrimary },
        animation       : 'fade',
      }}
    />
  );
}
