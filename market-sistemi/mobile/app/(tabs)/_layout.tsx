/**
 * Market Yönetim Sistemi — Tab Bar Layout
 * Ana navigasyon: Dashboard, Stok, Raporlar, Müşteriler, Ayarlar
 * Auth kontrolü: Giriş yapılmamışsa login'e yönlendir
 */

import { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { Text, View, StyleSheet } from 'react-native';
import { useTheme }     from '../../hooks/useTheme';
import { useAuthStore } from '../../stores/authStore';
import { FONT_FAMILY, FONT_SIZE } from '../../constants/typography';
import { SPACING } from '../../constants/spacing';

// Tab icon bileşeni
function TabIcon({ emoji, label, focused, color }: {
  emoji  : string;
  label  : string;
  focused: boolean;
  color  : string;
}) {
  return (
    <View style={styles.ikonKutu}>
      <Text style={{ fontSize: focused ? 22 : 20 }}>{emoji}</Text>
      <Text style={[styles.ikonMetin, { color, fontFamily: focused ? FONT_FAMILY.bodyMedium : FONT_FAMILY.body }]}>
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const { colors, isDark } = useTheme();
  const { isLoggedIn }     = useAuthStore();

  // Giriş yapılmamışsa login'e yönlendir
  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/(auth)/login');
    }
  }, [isLoggedIn]);

  if (!isLoggedIn) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown          : false,
        tabBarStyle          : {
          backgroundColor   : colors.bgSecondary,
          borderTopColor    : colors.border,
          borderTopWidth    : 1,
          height            : 64,
          paddingBottom     : SPACING.sm,
        },
        tabBarActiveTintColor  : colors.blue,
        tabBarInactiveTintColor: colors.textHint,
        tabBarShowLabel        : false,  // Label'ı ikon içinde gösteriyoruz
      }}
    >
      <Tabs.Screen
        name    = "dashboard"
        options = {{
          title   : 'Dashboard',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon emoji="📊" label="Özet" focused={focused} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name    = "stock"
        options = {{
          title   : 'Stok',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon emoji="📦" label="Stok" focused={focused} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name    = "reports"
        options = {{
          title   : 'Raporlar',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon emoji="📈" label="Raporlar" focused={focused} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name    = "customers"
        options = {{
          title   : 'Müşteriler',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon emoji="👥" label="Müşteri" focused={focused} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name    = "settings"
        options = {{
          title   : 'Ayarlar',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon emoji="⚙️" label="Ayarlar" focused={focused} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  ikonKutu: {
    alignItems    : 'center',
    justifyContent: 'center',
    gap           : 2,
    paddingTop    : SPACING.xs,
  },
  ikonMetin: {
    fontSize: FONT_SIZE.xs,
  },
});
