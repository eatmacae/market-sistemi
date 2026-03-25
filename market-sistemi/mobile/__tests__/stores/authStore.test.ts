/**
 * Market Yönetim Sistemi — Auth Store Testleri
 * login, logout, oturum durumu
 */

import { useAuthStore } from '../../stores/authStore';

// Her test öncesi sıfırla
beforeEach(() => {
  useAuthStore.setState({ token: null, user: null, isLoggedIn: false });
});

const testKullanici = {
  id      : 1,
  name    : 'Test Admin',
  role    : 'admin' as const,
  branchId: 1,
};


describe('Başlangıç durumu', () => {
  test('başlangıçta kullanıcı giriş yapmamış', () => {
    const { token, user, isLoggedIn } = useAuthStore.getState();
    expect(token).toBeNull();
    expect(user).toBeNull();
    expect(isLoggedIn).toBe(false);
  });
});


describe('login', () => {
  test('token ve kullanıcı bilgisi kaydedilir', () => {
    useAuthStore.getState().login('test-jwt-token', testKullanici);

    const { token, user, isLoggedIn } = useAuthStore.getState();
    expect(token).toBe('test-jwt-token');
    expect(user?.name).toBe('Test Admin');
    expect(user?.role).toBe('admin');
    expect(isLoggedIn).toBe(true);
  });

  test('farklı kullanıcıyla tekrar login yapılabilir', () => {
    const kasiyer = { id: 2, name: 'Kasiyer Ali', role: 'cashier' as const, branchId: 1 };
    useAuthStore.getState().login('token-admin', testKullanici);
    useAuthStore.getState().login('token-kasiyer', kasiyer);

    const { token, user } = useAuthStore.getState();
    expect(token).toBe('token-kasiyer');
    expect(user?.name).toBe('Kasiyer Ali');
  });
});


describe('logout', () => {
  test('logout sonrası tüm durum sıfırlanır', () => {
    useAuthStore.getState().login('test-jwt-token', testKullanici);
    useAuthStore.getState().logout();

    const { token, user, isLoggedIn } = useAuthStore.getState();
    expect(token).toBeNull();
    expect(user).toBeNull();
    expect(isLoggedIn).toBe(false);
  });

  test('login → logout → login akışı çalışır', () => {
    useAuthStore.getState().login('ilk-token', testKullanici);
    useAuthStore.getState().logout();
    useAuthStore.getState().login('yeni-token', testKullanici);

    expect(useAuthStore.getState().isLoggedIn).toBe(true);
    expect(useAuthStore.getState().token).toBe('yeni-token');
  });
});
