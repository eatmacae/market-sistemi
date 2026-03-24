/**
 * Market Yönetim Sistemi — Ayarlar Store
 * Tema tercihi, sunucu URL'i ve offline mod gibi global ayarlar
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemePreference = 'light' | 'dark' | 'system';

interface SettingsState {
  // Tema
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => void;

  // Sunucu bağlantısı
  serverUrl: string;
  setServerUrl: (url: string) => void;

  // Şube bilgisi
  branchId  : number;
  branchName: string;
  setBranch: (id: number, name: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  // persist: AsyncStorage'a kaydedilir — uygulama kapansa bile hatırlar
  persist(
    (set) => ({
      // Tema — varsayılan: sistem teması
      themePreference    : 'system',
      setThemePreference : (pref) => set({ themePreference: pref }),

      // Sunucu — varsayılan: local ağ
      serverUrl   : 'http://192.168.1.100:8000',
      setServerUrl: (url) => set({ serverUrl: url }),

      // Şube
      branchId  : 1,
      branchName: 'Merkez',
      setBranch : (id, name) => set({ branchId: id, branchName: name }),
    }),
    {
      name   : 'market-settings',      // AsyncStorage anahtarı
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
