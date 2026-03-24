/**
 * Market Yönetim Sistemi — Sahip Paneli Grup Layout
 */

import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { useTheme }     from '../../hooks/useTheme';
import { useAuthStore } from '../../stores/authStore';

export default function SahipLayout() {
  const { colors }     = useTheme();
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
      <Stack.Screen
        name    = "index"
        options = {{ title: '👤 Sahip Paneli' }}
      />
    </Stack>
  );
}
