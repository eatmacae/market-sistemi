/**
 * Market Yönetim Sistemi — Yönetim Ekranları Grup Layout
 * Personel, kampanya, hedef ekranları bu grup altında.
 */

import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { useTheme }     from '../../hooks/useTheme';
import { useAuthStore } from '../../stores/authStore';

export default function YonetimLayout() {
  const { colors }          = useTheme();
  const { isLoggedIn, user } = useAuthStore();

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/(auth)/login');
    }
  }, [isLoggedIn]);

  if (!isLoggedIn) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle     : { backgroundColor: colors.bgSecondary },
        headerTintColor : colors.textPrimary,
        headerTitleStyle: { fontFamily: 'DMSans-SemiBold' },
        contentStyle    : { backgroundColor: colors.bgPrimary },
      }}
    >
      <Stack.Screen name="personnel" options={{ title: '👥 Personel Yönetimi' }} />
      <Stack.Screen name="campaigns" options={{ title: '🎯 Kampanyalar' }} />
      <Stack.Screen name="targets"   options={{ title: '📈 Satış Hedefleri' }} />
      <Stack.Screen name="invoices"  options={{ title: '📄 Fatura Yönetimi', headerBackTitle: 'Geri' }} />
      <Stack.Screen name="backup"    options={{ title: '💾 Yedekleme',       headerBackTitle: 'Geri' }} />
    </Stack>
  );
}
