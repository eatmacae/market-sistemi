/**
 * Market Yönetim Sistemi — Kasa Grup Layout
 * Kasa, ödeme ve kasa açılış ekranları bu grup altında.
 */

import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { useTheme }     from '../../hooks/useTheme';
import { useAuthStore } from '../../stores/authStore';

export default function KasaLayout() {
  const { colors }     = useTheme();
  const { isLoggedIn } = useAuthStore();

  // Giriş yapılmamışsa login'e yönlendir
  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/(auth)/login');
    }
  }, [isLoggedIn]);

  if (!isLoggedIn) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle      : { backgroundColor: colors.bgSecondary },
        headerTintColor  : colors.textPrimary,
        headerTitleStyle : { fontFamily: 'DMSans-SemiBold' },
        contentStyle     : { backgroundColor: colors.bgPrimary },
      }}
    >
      <Stack.Screen
        name    = "index"
        options = {{ title: '🏪 Kasa', headerShown: false }}
      />
      <Stack.Screen
        name    = "payment"
        options = {{ title: '💳 Ödeme', headerBackTitle: 'Kasa' }}
      />
      <Stack.Screen
        name    = "session-open"
        options = {{ title: '🔓 Kasa Aç', headerBackTitle: 'Geri' }}
      />
      <Stack.Screen
        name    = "session-close"
        options = {{ title: '🔒 Kasa Kapat & Z Raporu', headerBackTitle: 'Geri' }}
      />
    </Stack>
  );
}
