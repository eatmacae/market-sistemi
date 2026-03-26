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
  syncPendingOperations,
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

  test('UUID (operation_id) döner', async () => {
    const opId = await queueOperation('/api/sales', 'POST', { total: 100 });
    // RFC 4122 v4 UUID formatı: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(opId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  test('her çağrıda farklı UUID üretilir', async () => {
    const id1 = await queueOperation('/api/sales', 'POST');
    const id2 = await queueOperation('/api/sales', 'POST');
    expect(id1).not.toBe(id2);
  });

  test('payload JSON string olarak kaydedilir (4. parametre)', async () => {
    const payload = { productId: 1, qty: 3 };
    await queueOperation('/api/stock/adjust', 'POST', payload);

    const cagri = mockDb.runAsync.mock.calls[0];
    // Parametre sırası: [operation_id, endpoint, method, payload]
    expect(cagri[1][3]).toBe(JSON.stringify(payload));
  });

  test('operation_id SQL sorgusuna eklenir', async () => {
    await queueOperation('/api/sales', 'POST', { total: 50 });
    const cagri = mockDb.runAsync.mock.calls[0];
    expect(cagri[0]).toContain('operation_id');
  });

  test('payload olmadan null kaydedilir', async () => {
    await queueOperation('/api/health', 'GET');
    const cagri = mockDb.runAsync.mock.calls[0];
    expect(cagri[1][3]).toBeNull();
  });

  test('payload olmadan da hata fırlatmaz', async () => {
    await expect(queueOperation('/api/health', 'GET')).resolves.not.toThrow();
  });
});


describe('syncPendingOperations', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  test('bekleyen işlem yokken 0 synced döner', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    const sonuc = await syncPendingOperations('http://localhost:8000', 'token123');
    expect(sonuc.synced).toBe(0);
    expect(sonuc.failed).toBe(0);
  });

  test('başarılı istek sonrası kuyruktan siler', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: 1, operation_id: 'uuid-1', endpoint: '/api/sales', method: 'POST', payload: null },
    ]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const sonuc = await syncPendingOperations('http://localhost:8000', 'token123');
    expect(sonuc.synced).toBe(1);
    expect(sonuc.failed).toBe(0);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE'),
      [1]
    );
  });

  test('X-Idempotency-Key header gönderilir', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: 1, operation_id: 'test-uuid-abc', endpoint: '/api/sales', method: 'POST', payload: null },
    ]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await syncPendingOperations('http://localhost:8000', 'Bearer token');

    const fetchArgs = mockFetch.mock.calls[0];
    expect(fetchArgs[1].headers['X-Idempotency-Key']).toBe('test-uuid-abc');
  });

  test('duplicate (200 ok) — kuyruktan silinir, synced sayılır', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: 2, operation_id: 'dup-uuid', endpoint: '/api/sales', method: 'POST', payload: null },
    ]);
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const sonuc = await syncPendingOperations('http://localhost:8000', 'token');
    expect(sonuc.synced).toBe(1);
  });

  test('sunucu hatası (500) — retry_count artar', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: 3, operation_id: 'uuid-3', endpoint: '/api/sales', method: 'POST', payload: null },
    ]);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const sonuc = await syncPendingOperations('http://localhost:8000', 'token');
    expect(sonuc.failed).toBe(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('retry_count'),
      [3]
    );
  });

  test('ağ hatası — retry_count artar', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: 4, operation_id: 'uuid-4', endpoint: '/api/sales', method: 'POST', payload: null },
    ]);
    mockFetch.mockRejectedValueOnce(new Error('Network Error'));

    const sonuc = await syncPendingOperations('http://localhost:8000', 'token');
    expect(sonuc.failed).toBe(1);
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
