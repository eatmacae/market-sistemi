'use strict';

/**
 * Market Yönetim Sistemi — Installer Setup.js Testleri
 *
 * Electron/Windows gerektirmeyen saf fonksiyonları test eder:
 * - generateKey, generateDbPassword
 * - getLocalIP
 * - copyDir (dolaylı)
 * - createEnvFile
 * - setupScheduledTask (bat dosyası oluşturma)
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// setup.js'den export edilen fonksiyonları al
const {
  runInstall,
  getLocalIP,
  checkAndInstallPython,
  checkAndInstallPostgres,
  copyBackend,
  createEnvFile,
  createVenv,
  installPackages,
  runMigrations,
  runSeed,
  setupScheduledTask,
  openFirewall,
} = require('../setup');

// ============================================================
// YARDIMCI
// ============================================================

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'market-test-'));
}

function silDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ============================================================
// createEnvFile — .env dosyası oluşturma
// ============================================================

describe('createEnvFile', () => {
  it('.env dosyasını doğru formatla yazar', async () => {
    const dir = tmpDir();
    const backendDir = path.join(dir, 'backend');
    fs.mkdirSync(backendDir, { recursive: true });

    await createEnvFile(dir, {
      marketAdi: 'Test Market',
      adres    : 'Test Adres',
      telefon  : '05001234567',
      email    : 'admin@test.com',
      _dbPass  : 'GucluSifre123!',
    });

    const envPath = path.join(backendDir, '.env');
    expect(fs.existsSync(envPath)).toBe(true);

    const icerik = fs.readFileSync(envPath, 'utf8');

    // Kritik alanlar mevcut olmalı
    expect(icerik).toContain('DATABASE_URL=postgresql://market_user:GucluSifre123!');
    expect(icerik).toContain('SECRET_KEY=');
    expect(icerik).toContain('MARKET_ADI=Test Market');
    expect(icerik).toContain('AUTO_BACKUP=true');
    expect(icerik).toContain('MULTI_BRANCH=false');

    silDir(dir);
  });

  it('SECRET_KEY 64 hex karakter üretir', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'backend'), { recursive: true });

    await createEnvFile(dir, { _dbPass: 'TestPass123!' });

    const icerik = fs.readFileSync(path.join(dir, 'backend', '.env'), 'utf8');
    const eslesen = icerik.match(/SECRET_KEY=([a-f0-9]+)/);
    expect(eslesen).not.toBeNull();
    expect(eslesen[1].length).toBe(64);

    silDir(dir);
  });

  it('BACKUP_KEY 32 hex karakter üretir', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'backend'), { recursive: true });

    await createEnvFile(dir, { _dbPass: 'x' });

    const icerik = fs.readFileSync(path.join(dir, 'backend', '.env'), 'utf8');
    const eslesen = icerik.match(/BACKUP_KEY=([a-f0-9]+)/);
    expect(eslesen).not.toBeNull();
    expect(eslesen[1].length).toBe(32);

    silDir(dir);
  });

  it('Türkçe karakter içeren market adını doğru yazar', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'backend'), { recursive: true });

    await createEnvFile(dir, {
      marketAdi: 'Şeker Market & Büfe',
      _dbPass  : 'TestPass!',
    });

    const icerik = fs.readFileSync(path.join(dir, 'backend', '.env'), 'utf8');
    expect(icerik).toContain('Şeker Market & Büfe');

    silDir(dir);
  });

  it('Port 8000 tanımlı', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'backend'), { recursive: true });

    await createEnvFile(dir, { _dbPass: 'x' });

    const icerik = fs.readFileSync(path.join(dir, 'backend', '.env'), 'utf8');
    expect(icerik).toContain('PORT=8000');

    silDir(dir);
  });

  it('DB_HOST 127.0.0.1 olarak set edilmiş', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'backend'), { recursive: true });

    await createEnvFile(dir, { _dbPass: 'x' });

    const icerik = fs.readFileSync(path.join(dir, 'backend', '.env'), 'utf8');
    expect(icerik).toContain('DB_HOST=127.0.0.1');

    silDir(dir);
  });

  it('Debug modu false olarak set edilmiş', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'backend'), { recursive: true });

    await createEnvFile(dir, { _dbPass: 'x' });

    const icerik = fs.readFileSync(path.join(dir, 'backend', '.env'), 'utf8');
    expect(icerik).toContain('DEBUG=false');

    silDir(dir);
  });

  it('Config alanları eksikken varsayılan değerler kullanılır', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'backend'), { recursive: true });

    // Sadece _dbPass zorunlu
    await createEnvFile(dir, { _dbPass: 'MinPass!' });

    const icerik = fs.readFileSync(path.join(dir, 'backend', '.env'), 'utf8');
    expect(icerik).toContain('MARKET_ADI=Market'); // Varsayılan
    expect(icerik).toContain('DATABASE_URL=');

    silDir(dir);
  });
});

// ============================================================
// generateKey — SECRET_KEY benzersizliği
// ============================================================

describe('generateKey benzersizliği', () => {
  it('Her kurulumda farklı SECRET_KEY üretilir', async () => {
    const dir1 = tmpDir();
    const dir2 = tmpDir();
    fs.mkdirSync(path.join(dir1, 'backend'), { recursive: true });
    fs.mkdirSync(path.join(dir2, 'backend'), { recursive: true });

    await createEnvFile(dir1, { _dbPass: 'x' });
    await createEnvFile(dir2, { _dbPass: 'x' });

    const key1 = fs.readFileSync(path.join(dir1, 'backend', '.env'), 'utf8').match(/SECRET_KEY=([^\n]+)/)[1];
    const key2 = fs.readFileSync(path.join(dir2, 'backend', '.env'), 'utf8').match(/SECRET_KEY=([^\n]+)/)[1];

    expect(key1).not.toBe(key2);

    silDir(dir1);
    silDir(dir2);
  });

  it('Her kurulumda farklı BACKUP_KEY üretilir', async () => {
    const dir1 = tmpDir();
    const dir2 = tmpDir();
    fs.mkdirSync(path.join(dir1, 'backend'), { recursive: true });
    fs.mkdirSync(path.join(dir2, 'backend'), { recursive: true });

    await createEnvFile(dir1, { _dbPass: 'x' });
    await createEnvFile(dir2, { _dbPass: 'x' });

    const k1 = fs.readFileSync(path.join(dir1, 'backend', '.env'), 'utf8').match(/BACKUP_KEY=([^\n]+)/)[1];
    const k2 = fs.readFileSync(path.join(dir2, 'backend', '.env'), 'utf8').match(/BACKUP_KEY=([^\n]+)/)[1];

    expect(k1).not.toBe(k2);

    silDir(dir1);
    silDir(dir2);
  });
});

// ============================================================
// getLocalIP — Yerel ağ IP tespiti
// ============================================================

describe('getLocalIP', () => {
  it('Geçerli bir IPv4 adresi döner', () => {
    const ip = getLocalIP();
    expect(ip).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
  });

  it('127.0.0.1 veya özel ağ adresi döner', () => {
    const ip = getLocalIP();
    const gecerli = ip === '127.0.0.1' ||
      ip.startsWith('192.168.') ||
      ip.startsWith('10.')      ||
      ip.startsWith('172.');
    expect(gecerli).toBe(true);
  });

  it('IP boş string veya null döndürmez', () => {
    const ip = getLocalIP();
    expect(ip).toBeTruthy();
    expect(ip.length).toBeGreaterThan(0);
  });

  it('IP 4 oktetten oluşur', () => {
    const ip = getLocalIP();
    const parcalar = ip.split('.');
    expect(parcalar).toHaveLength(4);
    parcalar.forEach(p => {
      const n = parseInt(p, 10);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(255);
    });
  });
});

// ============================================================
// copyDir / copyBackend — Dizin kopyalama
// ============================================================

describe('copyDir (copyBackend üzerinden)', () => {
  it('Geçersiz kaynak hata fırlatır veya alternatif bulur', async () => {
    const dir = tmpDir();
    const loglar = [];
    const onLog = (entry) => loglar.push(entry);

    try {
      await copyBackend(dir, onLog);
      // Başarılı: geliştirme ortamındaki backend kopyalanmış
      expect(fs.existsSync(path.join(dir, 'backend'))).toBe(true);
    } catch (err) {
      expect(err.message).toContain('bulunamadı');
    }

    silDir(dir);
  });
});

// ============================================================
// setupScheduledTask — Batch dosyası oluşturma
// ============================================================

describe('setupScheduledTask', () => {
  it('start_server.bat dosyası oluşturulur', async () => {
    const dir = tmpDir();
    const loglar = [];
    const onLog = (entry) => loglar.push(entry);

    await setupScheduledTask(dir, onLog);

    const batPath = path.join(dir, 'bin', 'start_server.bat');
    expect(fs.existsSync(batPath)).toBe(true);

    const icerik = fs.readFileSync(batPath, 'utf8');
    expect(icerik).toContain('uvicorn');
    expect(icerik).toContain('8000');

    silDir(dir);
  });

  it('logs dizini oluşturulur', async () => {
    const dir = tmpDir();
    const onLog = () => {};

    await setupScheduledTask(dir, onLog);

    expect(fs.existsSync(path.join(dir, 'logs'))).toBe(true);

    silDir(dir);
  });

  it('bat içeriği backend dizinini içerir', async () => {
    const dir = tmpDir();
    const onLog = () => {};

    await setupScheduledTask(dir, onLog);

    const batPath = path.join(dir, 'bin', 'start_server.bat');
    const icerik = fs.readFileSync(batPath, 'utf8');
    expect(icerik).toContain('backend');

    silDir(dir);
  });

  it('Log mesajları step/ok/info tipinde döner', async () => {
    const dir = tmpDir();
    const loglar = [];
    const onLog = (entry) => {
      loglar.push(entry);
      expect(entry).toHaveProperty('type');
      expect(entry).toHaveProperty('message');
    };

    await setupScheduledTask(dir, onLog);

    expect(loglar.length).toBeGreaterThan(0);
    const tipler = loglar.map(l => l.type);
    expect(tipler.some(t => ['step', 'ok', 'info', 'warn'].includes(t))).toBe(true);

    silDir(dir);
  });
});

// ============================================================
// Güvenlik Kontrolleri
// ============================================================

describe('Güvenlik kontrolleri', () => {
  it('.env dışında credential olmaz', async () => {
    const dir = tmpDir();
    const backendDir = path.join(dir, 'backend');
    fs.mkdirSync(backendDir, { recursive: true });

    const dbPass = 'GizliSifre987$';
    await createEnvFile(dir, { _dbPass: dbPass });

    // .env dışındaki dosyalarda şifre olmamalı
    const dosyalar = fs.readdirSync(backendDir).filter(f => f !== '.env');
    for (const dosya of dosyalar) {
      const icerik = fs.readFileSync(path.join(backendDir, dosya), 'utf8');
      expect(icerik).not.toContain(dbPass);
    }

    // .env dosyasında şifre olmalı
    const envIcerik = fs.readFileSync(path.join(backendDir, '.env'), 'utf8');
    expect(envIcerik).toContain(dbPass);

    silDir(dir);
  });

  it('.env içinde DATABASE_URL şifre içerir', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'backend'), { recursive: true });

    await createEnvFile(dir, { _dbPass: 'SifreTesti123!' });

    const icerik = fs.readFileSync(path.join(dir, 'backend', '.env'), 'utf8');
    expect(icerik).toContain('SifreTesti123!');

    silDir(dir);
  });

  it('SECRET_KEY sadece hex karakter içerir', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'backend'), { recursive: true });

    await createEnvFile(dir, { _dbPass: 'x' });

    const icerik = fs.readFileSync(path.join(dir, 'backend', '.env'), 'utf8');
    const key = icerik.match(/SECRET_KEY=([^\n]+)/)[1];
    expect(key).toMatch(/^[a-f0-9]+$/);

    silDir(dir);
  });
});

// ============================================================
// Kurulum Log Formatı
// ============================================================

describe('Kurulum log formatı', () => {
  it('setupScheduledTask log tipleri geçerlidir', async () => {
    const dir = tmpDir();
    const gecerliTipler = ['step', 'ok', 'error', 'progress', 'info', 'warn'];
    const loglar = [];

    await setupScheduledTask(dir, (entry) => {
      loglar.push(entry);
      expect(gecerliTipler).toContain(entry.type);
    });

    expect(loglar.length).toBeGreaterThan(0);

    silDir(dir);
  });

  it('Log girişleri percent alanı içerebilir', async () => {
    const dir = tmpDir();
    const loglar = [];

    await setupScheduledTask(dir, (entry) => loglar.push(entry));

    const percentliLoglar = loglar.filter(l => l.percent !== undefined);
    // step/ok logları genellikle percent içerir
    if (percentliLoglar.length > 0) {
      percentliLoglar.forEach(l => {
        expect(l.percent).toBeGreaterThanOrEqual(0);
        expect(l.percent).toBeLessThanOrEqual(100);
      });
    }

    silDir(dir);
  });
});
