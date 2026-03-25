/**
 * Market Yönetim Sistemi — SQLite Offline Storage Testleri
 * __mocks__/expo-sqlite.ts manual mock ile çalışır
 */

// Manual mock'ı aktive et — __mocks__/expo-sqlite.ts kullanılır
jest.mock('expo-sqlite');

import {
  getPendingCount,
  queueOperation,
  getCachedProducts,
  getCachedProductByBarcode,
} from '../../services/storage';

// Mock db metodlarına erişim
const { _mockDb: mockDb } = jest.requireMock('expo-sqlite');


// Her test öncesi mock çağrılarını sıfırla (default implementasyon korunur)
beforeEach(() => {
  jest.clearAllMocks();
});


describe('getPendingCount', () => {
  test('bekleyen işlem yokken 0 döner', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ count: 0 });
    const count = await getPendingCount();
    expect(count).toBe(0);
  });

  test('bekleyen işlem sayısını döner', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ count: 5 });
    const count = await getPendingCount();
    expect(count).toBe(5);
  });

  test('DB null döndüğünde güvenli şekilde 0 döner', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    const count = await getPendingCount();
    expect(count).toBe(0);
  });

  test('doğru SQL sorgusu ile çağrılır', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ count: 0 });
    await getPendingCount();
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining('pending_operations')
    );
  });
});


describe('queueOperation', () => {
  test('endpoint ve method ile kuyruğa eklenir', async () => {
    await queueOperation('/api/sales', 'POST', { total: 100 });
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
  });

  test('payload JSON string olarak kaydedilir', async () => {
    const payload = { productId: 1, qty: 3 };
    await queueOperation('/api/stock/adjust', 'POST', payload);

    const cagri = mockDb.runAsync.mock.calls[0];
    // 3. parametre JSON stringi içermeli
    expect(cagri[1][2]).toBe(JSON.stringify(payload));
  });

  test('payload olmadan da çalışır', async () => {
    await expect(queueOperation('/api/health', 'GET')).resolves.not.toThrow();
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
  });
});


describe('getCachedProducts', () => {
  test('tüm silinmemiş ürünleri döner', async () => {
    const mockUrunler = [
      { id: 1, name: 'Süt', is_deleted: 0 },
      { id: 2, name: 'Ekmek', is_deleted: 0 },
    ];
    mockDb.getAllAsync.mockResolvedValueOnce(mockUrunler);

    const urunler = await getCachedProducts();
    expect(urunler).toHaveLength(2);
  });

  test('is_deleted filtreli SQL sorgusu ile çağrılır', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    await getCachedProducts();
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('is_deleted = 0')
    );
  });
});


describe('getCachedProductByBarcode', () => {
  test('barkoda göre ürün bulur', async () => {
    const mockUrun = { id: 1, name: 'Süt', barcode: 'TEST001' };
    mockDb.getFirstAsync.mockResolvedValueOnce(mockUrun);

    const urun = await getCachedProductByBarcode('TEST001');
    expect(urun).toEqual(mockUrun);
  });

  test('barkod parametresi ile çağrılır', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    await getCachedProductByBarcode('BARKOD123');

    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      expect.any(String),
      ['BARKOD123']
    );
  });

  test('bulunamadığında null döner', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    const urun = await getCachedProductByBarcode('YOK999');
    expect(urun).toBeNull();
  });
});
