/**
 * Market Yönetim Sistemi — Sepet Store Testleri
 * addItem, updateQty, removeItem, indirim, KDV, toplamlar
 */

import { useCartStore } from '../../stores/cartStore';

// Her test öncesi sıfırla
beforeEach(() => {
  useCartStore.setState({
    items      : [],
    customerId : null,
    sessionId  : null,
    discount   : 0,
    subtotal   : 0,
    vatAmount  : 0,
    grandTotal : 0,
  });
});

// Tekrarlanan test verisini oluşturan yardımcı
const urunOlustur = (overrides = {}) => ({
  productId : 1,
  name      : 'Test Süt',
  barcode   : 'B001',
  unit      : 'adet',
  unitPrice : 10,
  qty       : 1,
  discount  : 0,
  ...overrides,
});


describe('addItem — Ürün ekleme', () => {
  test('yeni ürün sepete eklenir', () => {
    const { addItem } = useCartStore.getState();
    addItem(urunOlustur());

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].productId).toBe(1);
    expect(items[0].name).toBe('Test Süt');
  });

  test('ürün toplam fiyatı doğru hesaplanır', () => {
    const { addItem } = useCartStore.getState();
    addItem(urunOlustur({ qty: 3, unitPrice: 10, discount: 5 }));

    const { items } = useCartStore.getState();
    // total = qty * unitPrice - discount = 30 - 5 = 25
    expect(items[0].total).toBe(25);
  });

  test('aynı ürün tekrar eklenince miktar toplanır', () => {
    const { addItem } = useCartStore.getState();
    addItem(urunOlustur({ qty: 2 }));
    addItem(urunOlustur({ qty: 3 }));  // aynı productId: 1

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(5);
    expect(items[0].total).toBe(50); // 5 * 10
  });

  test('farklı ürünler ayrı satır olarak eklenir', () => {
    const { addItem } = useCartStore.getState();
    addItem(urunOlustur({ productId: 1 }));
    addItem(urunOlustur({ productId: 2, name: 'Ekmek', barcode: 'B002' }));

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(2);
  });

  test('sepet toplamı (subtotal ve grandTotal) güncellenir', () => {
    const { addItem } = useCartStore.getState();
    addItem(urunOlustur({ qty: 2, unitPrice: 15, discount: 0 }));

    const { subtotal, grandTotal } = useCartStore.getState();
    expect(subtotal).toBe(30);
    expect(grandTotal).toBe(30);
  });
});


describe('updateQty — Miktar güncelleme', () => {
  test('miktar değiştirilir', () => {
    const store = useCartStore.getState();
    store.addItem(urunOlustur({ qty: 1 }));
    store.updateQty(1, 5);

    const { items } = useCartStore.getState();
    expect(items[0].qty).toBe(5);
    expect(items[0].total).toBe(50); // 5 * 10
  });

  test('miktar 0 girilince ürün sepetten çıkar', () => {
    const store = useCartStore.getState();
    store.addItem(urunOlustur());
    store.updateQty(1, 0);

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(0);
  });

  test('negatif miktar girilince ürün sepetten çıkar', () => {
    const store = useCartStore.getState();
    store.addItem(urunOlustur());
    store.updateQty(1, -1);

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(0);
  });
});


describe('removeItem — Ürün çıkarma', () => {
  test('belirtilen ürün sepetten çıkarılır', () => {
    const store = useCartStore.getState();
    store.addItem(urunOlustur({ productId: 1 }));
    store.addItem(urunOlustur({ productId: 2, name: 'Ekmek', barcode: 'B002' }));
    store.removeItem(1);

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].productId).toBe(2);
  });

  test('çıkarılan ürün toplamı subtotal\'dan düşer', () => {
    const store = useCartStore.getState();
    store.addItem(urunOlustur({ qty: 3, unitPrice: 10 })); // 30
    store.removeItem(1);

    const { subtotal, grandTotal } = useCartStore.getState();
    expect(subtotal).toBe(0);
    expect(grandTotal).toBe(0);
  });
});


describe('setDiscount — İndirim uygulama', () => {
  test('indirim grandTotal\'dan düşülür', () => {
    const store = useCartStore.getState();
    store.addItem(urunOlustur({ qty: 3, unitPrice: 10 })); // subtotal = 30
    store.setDiscount(5);

    const { subtotal, grandTotal } = useCartStore.getState();
    expect(subtotal).toBe(30);    // subtotal değişmez
    expect(grandTotal).toBe(25);  // after = 30 - 5 = 25
  });

  test('indirim subtotal\'dan büyükse grandTotal sıfır olur (negatife düşmez)', () => {
    const store = useCartStore.getState();
    store.addItem(urunOlustur({ qty: 1, unitPrice: 10 })); // subtotal = 10
    store.setDiscount(50); // indirim > subtotal

    const { grandTotal } = useCartStore.getState();
    expect(grandTotal).toBe(0);
  });
});


describe('clearCart — Sepeti temizleme', () => {
  test('tüm ürünler ve hesaplamalar sıfırlanır', () => {
    const store = useCartStore.getState();
    store.addItem(urunOlustur({ qty: 3 }));
    store.setDiscount(5);
    store.setCustomer(42);
    store.clearCart();

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(0);
    expect(state.subtotal).toBe(0);
    expect(state.grandTotal).toBe(0);
    expect(state.discount).toBe(0);
    expect(state.customerId).toBeNull();
  });
});


describe('setCustomer / setSession', () => {
  test('müşteri ID kaydedilir', () => {
    useCartStore.getState().setCustomer(7);
    expect(useCartStore.getState().customerId).toBe(7);
  });

  test('oturum ID kaydedilir', () => {
    useCartStore.getState().setSession(99);
    expect(useCartStore.getState().sessionId).toBe(99);
  });
});
