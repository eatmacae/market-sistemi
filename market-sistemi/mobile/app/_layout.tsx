/**
 * Market Yönetim Sistemi — Kök Layout
 *
 * Görevleri:
 * 1. Fontları yükle (DMSans + Syne)
 * 2. Splash screen'i sakla, fontlar hazır olunca göster
 * 3. Auth durumuna göre yönlendir:
 *    - Giriş yapılmadıysa → /(auth)/login
 *    - Giriş yapıldıysa   → /(tabs)/dashboard
 */

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../stores/authStore';
import { useTheme } from '../hooks/useTheme';
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  Syne_700Bold,
  Syne_600SemiBold,
} from '@expo-google-fonts/syne';

// Splash screen fontlar yüklenene kadar beklesin
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { isLoggedIn }     = useAuthStore();
  const { colors, isDark } = useTheme();

  // DMSans ve Syne fontlarını Google Fonts üzerinden yükle
  const [fontsLoaded, fontError] = useFonts({
    'DMSans-Regular'  : DMSans_400Regular,
    'DMSans-Medium'   : DMSans_500Medium,
    'DMSans-SemiBold' : DMSans_600SemiBold,
    'DMSans-Bold'     : DMSans_700Bold,
    'Syne-Bold'       : Syne_700Bold,
    'Syne-SemiBold'   : Syne_600SemiBold,
  });

  useEffect(() => {
    // Fontlar yüklenince veya hata olunca splash screen'i kapat
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Fontlar henüz yüklenmedi
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        {/* Kimlik doğrulama grubu */}
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />

        {/* Ana tab navigasyonu */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        {/* Kasa grubu */}
        <Stack.Screen name="(kasa)" options={{ headerShown: false }} />

        {/* Market sahibi paneli */}
        <Stack.Screen name="(sahip)" options={{ headerShown: false }} />

        {/* Yönetim ekranları */}
        <Stack.Screen name="(yonetim)" options={{ headerShown: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
