/**
 * Market Yönetim Sistemi — Kasa / Sepet Store
 * Aktif satıştaki ürünler, toplam tutar ve ödeme bilgisi
 */

import { create } from 'zustand';

interface CartItem {
  productId  : number;
  name       : string;
  barcode    : string | null;
  unit       : string;
  unitPrice  : number;
  qty        : number;
  discount   : number;
  total      : number;
  campaignId?: number;
}

interface CartState {
  items       : CartItem[];
  customerId  : number | null;
  sessionId   : number | null;
  discount    : number;  // Sepet geneli indirim

  // Hesaplanan değerler
  subtotal    : number;
  vatAmount   : number;
  grandTotal  : number;

  // İşlemler
  addItem       : (item: Omit<CartItem, 'total'>) => void;
  updateQty     : (productId: number, qty: number) => void;
  removeItem    : (productId: number) => void;
  setDiscount   : (amount: number) => void;
  setCustomer   : (id: number | null) => void;
  setSession    : (id: number) => void;
  clearCart     : () => void;
}

// KDV hesabı: miktarın %X'i (fiyata dahil)
function calculateVat(total: number, vatRate: number = 1): number {
  return parseFloat((total * vatRate / (100 + vatRate)).toFixed(2));
}

export const useCartStore = create<CartState>((set, get) => ({
  items     : [],
  customerId: null,
  sessionId : null,
  discount  : 0,
  subtotal  : 0,
  vatAmount : 0,
  grandTotal: 0,

  // Ürün ekle — aynı ürün varsa miktarı artır
  addItem: (item) => {
    const { items } = get();
    const existing  = items.find((i) => i.productId === item.productId);

    let updated: CartItem[];
    if (existing) {
      updated = items.map((i) =>
        i.productId === item.productId
          ? { ...i, qty: i.qty + item.qty, total: (i.qty + item.qty) * i.unitPrice - i.discount }
          : i
      );
    } else {
      const newItem: CartItem = {
        ...item,
        total: item.qty * item.unitPrice - item.discount,
      };
      updated = [...items, newItem];
    }

    set({ items: updated });
    _recalculate(set, get, updated);
  },

  // Miktar güncelle
  updateQty: (productId, qty) => {
    if (qty <= 0) {
      get().removeItem(productId);
      return;
    }
    const updated = get().items.map((i) =>
      i.productId === productId
        ? { ...i, qty, total: qty * i.unitPrice - i.discount }
        : i
    );
    set({ items: updated });
    _recalculate(set, get, updated);
  },

  // Ürün çıkar
  removeItem: (productId) => {
    const updated = get().items.filter((i) => i.productId !== productId);
    set({ items: updated });
    _recalculate(set, get, updated);
  },

  // Sepet indirimi
  setDiscount: (amount) => {
    set({ discount: amount });
    _recalculate(set, get, get().items);
  },

  setCustomer: (id) => set({ customerId: id }),
  setSession : (id) => set({ sessionId: id }),

  // Sepeti temizle (satış tamamlandı)
  clearCart: () => set({
    items     : [],
    customerId: null,
    discount  : 0,
    subtotal  : 0,
    vatAmount : 0,
    grandTotal: 0,
  }),
}));

// Toplam, KDV ve genel toplam hesaplama
function _recalculate(set: any, get: any, items: CartItem[]) {
  const subtotal  = items.reduce((acc, i) => acc + i.total, 0);
  const discount  = get().discount;
  const after     = Math.max(0, subtotal - discount);
  const vatAmount = calculateVat(after);

  set({
    subtotal,
    vatAmount,
    grandTotal: parseFloat(after.toFixed(2)),
  });
}
