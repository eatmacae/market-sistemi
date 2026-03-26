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
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_id TEXT    UNIQUE NOT NULL,  -- UUID — duplicate önler
      endpoint     TEXT    NOT NULL,
      method       TEXT    NOT NULL,
      payload      TEXT,                     -- JSON string
      created_at   TEXT    DEFAULT (datetime('now')),
      retry_count  INTEGER DEFAULT 0
    );

    -- Ürün cache
    CREATE TABLE IF NOT EXISTS products_cache (
      id             INTEGER PRIMARY KEY,
      name           TEXT NOT NULL,
      barcode        TEXT,
      unit           TEXT DEFAULT 'adet',
      units_per_case INTEGER DEFAULT 1,   -- Koli başına adet
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
): Promise<string> {
  /**
   * Offline durumdaki işlemi kuyruğa ekler.
   * Her işleme benzersiz UUID atanır — şarj bitip yeniden bağlanınca
   * backend duplicate işlemi reddeder (X-Idempotency-Key header).
   * Bağlantı gelince syncPendingOperations() ile gönderilir.
   * Dönen operation_id takip için kullanılabilir.
   */
  const operationId = generateUUID();
  await db.runAsync(
    `INSERT INTO pending_operations (operation_id, endpoint, method, payload) VALUES (?, ?, ?, ?)`,
    [operationId, endpoint, method, payload ? JSON.stringify(payload) : null]
  );
  return operationId;
}

function generateUUID(): string {
  // RFC 4122 v4 UUID — crypto.getRandomValues kullanır
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
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

export async function syncPendingOperations(
  serverUrl: string,
  token    : string,
): Promise<{ synced: number; failed: number }> {
  /**
   * Bekleyen tüm işlemleri backend'e gönderir.
   * Her istek X-Idempotency-Key header'ı ile gönderilir —
   * backend duplicate gördüğünde 200 döner, silme yapılır.
   * Bağlantı gelince çağrılır (NetInfo event listener'dan).
   */
  const bekleyenler = await getPendingOperations();
  let synced = 0;
  let failed = 0;

  for (const op of bekleyenler) {
    try {
      const response = await fetch(`${serverUrl}${op.endpoint}`, {
        method : op.method,
        headers: {
          'Content-Type'       : 'application/json',
          'Authorization'      : `Bearer ${token}`,
          'X-Idempotency-Key'  : op.operation_id,
        },
        body: op.payload ?? undefined,
      });

      if (response.ok || response.status === 200) {
        // Başarılı veya duplicate — her iki durumda da kuyruktan sil
        await deletePendingOperation(op.id);
        synced++;
      } else if (response.status >= 500) {
        // Sunucu hatası — retry_count artır
        await db.runAsync(
          `UPDATE pending_operations SET retry_count = retry_count + 1 WHERE id = ?`,
          [op.id]
        );
        failed++;
      } else {
        // 4xx — istemci hatası, kuyruktan sil (tekrar denemek anlamsız)
        await deletePendingOperation(op.id);
        failed++;
      }
    } catch {
      // Ağ hatası — retry_count artır, sonra tekrar dene
      await db.runAsync(
        `UPDATE pending_operations SET retry_count = retry_count + 1 WHERE id = ?`,
        [op.id]
      );
      failed++;
    }
  }

  return { synced, failed };
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
       (id, name, barcode, unit, units_per_case, price, cost, stock_qty, min_stock, vat_rate,
        category_id, shelf_location, is_deleted, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.id, p.name, p.barcode, p.unit, p.units_per_case ?? 1, p.price, p.cost,
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
