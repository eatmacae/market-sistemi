/**
 * Market Yönetim Sistemi — Stok Store Testleri
 * getStatus, getByBarcode, setProducts, updateProduct
 */

import { useStockStore } from '../../stores/stockStore';

// Sıfırla
beforeEach(() => {
  useStockStore.setState({ products: [], isLoading: false, lastSyncedAt: null });
});

// Yardımcı: test ürünü oluşturur
const urunOlustur = (overrides = {}) => ({
  id           : 1,
  name         : 'Test Ürün',
  barcode      : 'TEST001',
  unit         : 'adet',
  price        : 10,
  cost         : 7,
  stockQty     : 50,
  minStock     : 10,
  vatRate      : 18,
  categoryId   : null,
  shelfLocation: null,
  isDeleted    : false,
  ...overrides,
});


describe('setProducts / updateProduct', () => {
  test('setProducts ürün listesini günceller', () => {
    const urunler = [urunOlustur({ id: 1 }), urunOlustur({ id: 2, name: 'İkinci Ürün' })];
    useStockStore.getState().setProducts(urunler);

    expect(useStockStore.getState().products).toHaveLength(2);
  });

  test('updateProduct yalnızca belirtilen ürünü günceller', () => {
    const urunler = [urunOlustur({ id: 1, price: 10 }), urunOlustur({ id: 2, price: 20 })];
    useStockStore.getState().setProducts(urunler);
    useStockStore.getState().updateProduct(1, { price: 15 });

    const { products } = useStockStore.getState();
    expect(products[0].price).toBe(15);
    expect(products[1].price).toBe(20); // değişmedi
  });

  test('setLoading durumu günceller', () => {
    useStockStore.getState().setLoading(true);
    expect(useStockStore.getState().isLoading).toBe(true);
  });

  test('setLastSynced tarihi kaydeder', () => {
    useStockStore.getState().setLastSynced('2026-03-25T10:00:00Z');
    expect(useStockStore.getState().lastSyncedAt).toBe('2026-03-25T10:00:00Z');
  });
});


describe('getByBarcode — Barkod ile arama', () => {
  beforeEach(() => {
    useStockStore.getState().setProducts([
      urunOlustur({ id: 1, barcode: 'ABC123', isDeleted: false }),
      urunOlustur({ id: 2, barcode: 'SIL001', isDeleted: true }),
    ]);
  });

  test('barkod ile aktif ürün bulunur', () => {
    const urun = useStockStore.getState().getByBarcode('ABC123');
    expect(urun).toBeDefined();
    expect(urun?.id).toBe(1);
  });

  test('silinmiş ürün barkodla bulunamaz', () => {
    const urun = useStockStore.getState().getByBarcode('SIL001');
    expect(urun).toBeUndefined();
  });

  test('olmayan barkod undefined döner', () => {
    const urun = useStockStore.getState().getByBarcode('YOKYOK');
    expect(urun).toBeUndefined();
  });
});


describe('getStatus — Stok durum hesabı', () => {
  const { getStatus } = useStockStore.getState();

  test('sıfır stok → critical', () => {
    expect(getStatus(urunOlustur({ stockQty: 0, minStock: 10 }))).toBe('critical');
  });

  test('negatif stok → critical', () => {
    expect(getStatus(urunOlustur({ stockQty: -5, minStock: 10 }))).toBe('critical');
  });

  test('minStock\'a eşit → threshold', () => {
    // stockQty <= minStock
    expect(getStatus(urunOlustur({ stockQty: 10, minStock: 10 }))).toBe('threshold');
  });

  test('minStock\'tan az ama sıfırdan büyük → threshold', () => {
    expect(getStatus(urunOlustur({ stockQty: 3, minStock: 10 }))).toBe('threshold');
  });

  test('minStock × 1.5\'e eşit → adequate', () => {
    // stockQty (15) <= minStock (10) * 1.5 (15) — adequate
    expect(getStatus(urunOlustur({ stockQty: 15, minStock: 10 }))).toBe('adequate');
  });

  test('minStock × 1.5\'i aşıyor → dormant', () => {
    // stockQty (16) > minStock (10) * 1.5 (15) — dormant
    expect(getStatus(urunOlustur({ stockQty: 16, minStock: 10 }))).toBe('dormant');
  });

  test('yüksek stok → dormant', () => {
    expect(getStatus(urunOlustur({ stockQty: 1000, minStock: 10 }))).toBe('dormant');
  });
});
