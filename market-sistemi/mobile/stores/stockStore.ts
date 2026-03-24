/**
 * Market Yönetim Sistemi — Stok Store
 * Ürün listesi ve offline cache yönetimi
 */

import { create } from 'zustand';

interface Product {
  id           : number;
  name         : string;
  barcode      : string | null;
  unit         : string;
  price        : number;
  cost         : number | null;
  stockQty     : number;
  minStock     : number;
  vatRate      : number;
  categoryId   : number | null;
  shelfLocation: string | null;
  isDeleted    : boolean;
}

// Stok durum tipi
type StockStatus = 'critical' | 'threshold' | 'adequate' | 'dormant';

interface StockState {
  products     : Product[];
  isLoading    : boolean;
  lastSyncedAt : string | null;

  // İşlemler
  setProducts  : (products: Product[]) => void;
  updateProduct: (id: number, data: Partial<Product>) => void;
  setLoading   : (loading: boolean) => void;
  setLastSynced: (date: string) => void;

  // Yardımcılar
  getByBarcode : (barcode: string) => Product | undefined;
  getStatus    : (product: Product) => StockStatus;
}

export const useStockStore = create<StockState>((set, get) => ({
  products    : [],
  isLoading   : false,
  lastSyncedAt: null,

  setProducts  : (products) => set({ products }),
  setLoading   : (isLoading) => set({ isLoading }),
  setLastSynced: (date) => set({ lastSyncedAt: date }),

  updateProduct: (id, data) => set((state) => ({
    products: state.products.map((p) =>
      p.id === id ? { ...p, ...data } : p
    ),
  })),

  // Barkod ile ürün bul
  getByBarcode: (barcode) =>
    get().products.find((p) => p.barcode === barcode && !p.isDeleted),

  // Stok durumu hesapla
  getStatus: (product): StockStatus => {
    if (product.stockQty <= 0)                      return 'critical';
    if (product.stockQty <= product.minStock)        return 'threshold';
    if (product.stockQty <= product.minStock * 1.5)  return 'adequate';
    return 'dormant';
  },
}));
