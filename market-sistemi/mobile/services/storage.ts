/**
 * Market Yönetim Sistemi — SQLite Offline Cache Servisi
 * İnternet kesildiğinde bu servis devreye girer.
 * Bağlantı gelince otomatik sync yapılır.
 */

import * as SQLite from 'expo-sqlite';

// SQLite veritabanını aç (yoksa oluştur)
const db = SQLite.openDatabaseSync('market_offline.db');

// ============================================================
// VERİTABANI BAŞLATMA
// ============================================================

export async function initOfflineDB(): Promise<void> {
  /**
   * Offline cache tablolarını oluşturur.
   * Uygulama açılışında çağrılır.
   */
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    -- Bekleyen işlemler kuyruğu
    CREATE TABLE IF NOT EXISTS pending_operations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint    TEXT    NOT NULL,
      method      TEXT    NOT NULL,
      payload     TEXT,           -- JSON string
      created_at  TEXT    DEFAULT (datetime('now')),
      retry_count INTEGER DEFAULT 0
    );

    -- Ürün cache
    CREATE TABLE IF NOT EXISTS products_cache (
      id             INTEGER PRIMARY KEY,
      name           TEXT NOT NULL,
      barcode        TEXT,
      unit           TEXT DEFAULT 'adet',
      price          REAL NOT NULL,
      cost           REAL,
      stock_qty      INTEGER DEFAULT 0,
      min_stock      INTEGER DEFAULT 5,
      vat_rate       INTEGER DEFAULT 1,
      category_id    INTEGER,
      shelf_location TEXT,
      is_deleted     INTEGER DEFAULT 0,
      synced_at      TEXT
    );

    -- Müşteri cache
    CREATE TABLE IF NOT EXISTS customers_cache (
      id             INTEGER PRIMARY KEY,
      name           TEXT NOT NULL,
      phone          TEXT,
      credit_balance REAL DEFAULT 0,
      loyalty_points INTEGER DEFAULT 0,
      price_type     TEXT DEFAULT 'retail',
      synced_at      TEXT
    );
  `);
}

// ============================================================
// BEKLEYEN İŞLEMLER (OFFLINE KUYRUK)
// ============================================================

export async function queueOperation(
  endpoint: string,
  method  : string,
  payload?: object,
): Promise<void> {
  /**
   * Offline durumdaki işlemi kuyruğa ekler.
   * Bağlantı gelince syncPendingOperations() ile gönderilir.
   */
  await db.runAsync(
    `INSERT INTO pending_operations (endpoint, method, payload) VALUES (?, ?, ?)`,
    [endpoint, method, payload ? JSON.stringify(payload) : null]
  );
}

export async function getPendingCount(): Promise<number> {
  /**
   * Bekleyen işlem sayısını döner.
   * Offline göstergesi için: "🔴 Offline · X işlem bekliyor"
   */
  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM pending_operations`
  );
  return result?.count ?? 0;
}

export async function getPendingOperations(): Promise<any[]> {
  return await db.getAllAsync(`SELECT * FROM pending_operations ORDER BY created_at ASC`);
}

export async function deletePendingOperation(id: number): Promise<void> {
  await db.runAsync(`DELETE FROM pending_operations WHERE id = ?`, [id]);
}

// ============================================================
// ÜRÜN CACHE
// ============================================================

export async function cacheProducts(products: any[]): Promise<void> {
  /**
   * Sunucudan gelen ürünleri SQLite'a kaydeder.
   * Her sync'ten sonra çağrılır.
   */
  const now = new Date().toISOString();

  for (const p of products) {
    await db.runAsync(
      `INSERT OR REPLACE INTO products_cache
       (id, name, barcode, unit, price, cost, stock_qty, min_stock, vat_rate,
        category_id, shelf_location, is_deleted, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.id, p.name, p.barcode, p.unit, p.price, p.cost,
        p.stock_qty, p.min_stock, p.vat_rate,
        p.category_id, p.shelf_location, p.is_deleted ? 1 : 0, now,
      ]
    );
  }
}

export async function getCachedProducts(): Promise<any[]> {
  return await db.getAllAsync(
    `SELECT * FROM products_cache WHERE is_deleted = 0`
  );
}

export async function getCachedProductByBarcode(barcode: string): Promise<any | null> {
  return await db.getFirstAsync(
    `SELECT * FROM products_cache WHERE barcode = ? AND is_deleted = 0`,
    [barcode]
  );
}
