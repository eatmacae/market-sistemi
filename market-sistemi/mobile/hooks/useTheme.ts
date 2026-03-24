/**
 * Market Yönetim Sistemi — Tema Hook'u
 * Tüm komponetlerde renklere bu hook ile erişilir.
 * Hardcode renk YASAK — her zaman useTheme() kullan.
 *
 * Kullanım:
 *   const { colors, isDark } = useTheme();
 *   style={{ backgroundColor: colors.bgPrimary }}
 */

import { useColorScheme } from 'react-native';
import { DarkTheme, LightTheme, ThemeColors } from '../constants/colors';
import { useSettingsStore } from '../stores/settingsStore';

interface ThemeResult {
  colors: ThemeColors;
  isDark : boolean;
}

export function useTheme(): ThemeResult {
  // Kullanıcı tercihini settings store'dan al
  const themePreference = useSettingsStore((state) => state.themePreference);

  // Sistem temasını al
  const systemScheme = useColorScheme();

  // Tema belirleme: önce kullanıcı tercihi, yoksa sistem teması
  const isDark =
    themePreference === 'dark'  ? true  :
    themePreference === 'light' ? false :
    systemScheme === 'dark';    // 'system' veya undefined ise sistem teması

  const colors = isDark ? DarkTheme : LightTheme;

  return { colors, isDark };
}
