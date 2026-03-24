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
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useTheme } from '../hooks/useTheme';

// Splash screen fontlar yüklenene kadar beklesin
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { isLoggedIn }  = useAuthStore();
  const { colors, isDark } = useTheme();

  // DMSans ve Syne fontlarını yükle
  const [fontsLoaded, fontError] = useFonts({
    'DMSans-Regular'  : require('../assets/fonts/DMSans-Regular.ttf'),
    'DMSans-Medium'   : require('../assets/fonts/DMSans-Medium.ttf'),
    'DMSans-SemiBold' : require('../assets/fonts/DMSans-SemiBold.ttf'),
    'DMSans-Bold'     : require('../assets/fonts/DMSans-Bold.ttf'),
    'Syne-Bold'       : require('../assets/fonts/Syne-Bold.ttf'),
    'Syne-SemiBold'   : require('../assets/fonts/Syne-SemiBold.ttf'),
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
