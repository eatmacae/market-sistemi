/**
 * Market Yönetim Sistemi — Kimlik Doğrulama Store
 * JWT token, kullanıcı bilgisi ve oturum yönetimi
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthUser {
  id       : number;
  name     : string;
  role     : 'admin' | 'cashier' | 'warehouse';
  branchId : number;
}

interface AuthState {
  // Oturum bilgisi
  token      : string | null;
  user       : AuthUser | null;
  isLoggedIn : boolean;

  // İşlemler
  login  : (token: string, user: AuthUser) => void;
  logout : () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token     : null,
      user      : null,
      isLoggedIn: false,

      // Giriş — token ve kullanıcı bilgisini kaydet
      login: (token, user) => set({
        token,
        user,
        isLoggedIn: true,
      }),

      // Çıkış — her şeyi temizle
      logout: () => set({
        token     : null,
        user      : null,
        isLoggedIn: false,
      }),
    }),
    {
      name   : 'market-auth',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
