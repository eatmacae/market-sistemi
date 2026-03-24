'use strict';

/**
 * Market Yönetim Sistemi — Kurulum Sihirbazı
 * setup.js: Tüm kurulum mantığı
 *
 * Her adım onLog({ type, message, percent }) ile canlı log gönderir.
 * type: 'step' | 'ok' | 'error' | 'progress' | 'info' | 'warn'
 */

const { execSync, spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// ─── Sabitler ──────────────────────────────────────────────────────────────

const POSTGRES_SUPER_PASS = 'MktSys2026!';
const POSTGRES_PORTS = [5432];
const POSTGRES_VERSIONS = ['15', '16', '14', '13'];
const INSTALL_DIR_DEFAULT = 'C:\\MarketSistemi';

// PostgreSQL psql yolları (öncelik sırasına göre)
const PSQL_PATHS = POSTGRES_VERSIONS.map(
  (v) => `C:\\Program Files\\PostgreSQL\\${v}\\bin\\psql.exe`
);

// Python yürütücüler (öncelik sırasına göre)
const PYTHON_EXECUTABLES = ['py', 'python', 'python3', 'py -3'];

// ─── Yardımcı Fonksiyonlar ─────────────────────────────────────────────────

/**
 * Güvenli rastgele hex string üret
 */
function generateKey(length = 64) {
  return crypto.randomBytes(length / 2).toString('hex');
}

/**
 * Güçlü rastgele DB şifresi üret
 */
function generateDbPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let pass = '';
  const bytes = crypto.randomBytes(24);
  for (const byte of bytes) {
    pass += chars[byte % chars.length];
  }
  return pass;
}

/**
 * Komutu çalıştır ve sonucu döndür (timeout: 300 saniye)
 */
function runCmd(cmd, opts = {}) {
  try {
    const result = spawnSync('cmd.exe', ['/c', cmd], {
      encoding: 'utf8',
      timeout: opts.timeout || 300000,
      env: { ...process.env, ...opts.env },
      cwd: opts.cwd,
    });
    return {
      ok: result.status === 0,
      stdout: (result.stdout || '').trim(),
      stderr: (result.stderr || '').trim(),
      status: result.status,
    };
  } catch (err) {
    return { ok: false, stdout: '', stderr: err.message, status: -1 };
  }
}

/**
 * Komutu çalıştır ve çıktıyı satır satır onLog'a gönder
 */
function runCmdWithLog(cmd, onLog, opts = {}) {
  return new Promise((resolve) => {
    const proc = spawn('cmd.exe', ['/c', cmd], {
      env: { ...process.env, ...opts.env },
      cwd: opts.cwd,
      shell: false,
    });

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter((l) => l.trim());
      lines.forEach((line) =>
        onLog({ type: 'info', message: line.trim() })
      );
    });

    proc.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter((l) => l.trim());
      lines.forEach((line) =>
        onLog({ type: 'info', message: line.trim() })
      );
    });

    proc.on('close', (code) => {
      resolve({ ok: code === 0, status: code });
    });

    proc.on('error', (err) => {
      onLog({ type: 'warn', message: `Süreç hatası: ${err.message}` });
      resolve({ ok: false, status: -1 });
    });
  });
}

/**
 * Dosya/dizin var mı kontrol et
 */
function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Dizini recursive kopyala
 */
function copyDir(src, dest) {
  if (!exists(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Gereksiz dizinleri atla
    if (entry.isDirectory()) {
      if (['venv', '__pycache__', '.git', 'node_modules'].includes(entry.name)) {
        continue;
      }
      copyDir(srcPath, destPath);
    } else {
      // .pyc dosyalarını atla
      if (entry.name.endsWith('.pyc')) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Yerel ağ IP adresini bul
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (
        iface.family === 'IPv4' &&
        !iface.internal &&
        iface.address.startsWith('192.168.')
      ) {
        return iface.address;
      }
    }
  }
  // 192.168 bulunamazsa 10.x veya 172.x dene
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * Kullanılabilir psql.exe yolunu bul
 */
function findPsql() {
  for (const p of PSQL_PATHS) {
    if (exists(p)) return p;
  }
  // PATH üzerinde de dene
  const r = runCmd('where psql 2>nul');
  if (r.ok && r.stdout) return r.stdout.split('\n')[0].trim();
  return null;
}

/**
 * Kullanılabilir Python yürütücüsünü bul
 */
function findPython() {
  for (const exe of PYTHON_EXECUTABLES) {
    const r = runCmd(`${exe} --version`);
    if (r.ok) return exe;
  }
  return null;
}

// ─── Kurulum Adımları ──────────────────────────────────────────────────────

/**
 * Adım 1: Python 3.11 kontrolü ve kurulumu
 */
async function checkAndInstallPython(onLog) {
  onLog({ type: 'step', message: 'Python 3.11 kontrol ediliyor...', percent: 5 });

  const pyExe = findPython();
  if (pyExe) {
    const r = runCmd(`${pyExe} --version`);
    onLog({ type: 'ok', message: `Python mevcut: ${r.stdout}`, percent: 8 });
    return;
  }

  onLog({ type: 'info', message: 'Python bulunamadı, winget ile kuruluyor...', percent: 6 });

  const result = await runCmdWithLog(
    'winget install Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements',
    onLog,
    { timeout: 300000 }
  );

  if (!result.ok) {
    // winget başarısız olursa web'den indirme linki ver
    throw new Error(
      'Python kuruluму başarısız. Lütfen https://www.python.org/downloads/ adresinden Python 3.11 kurun ve tekrar deneyin.'
    );
  }

  onLog({ type: 'ok', message: 'Python 3.11 kurulumu tamamlandı.', percent: 8 });
}

/**
 * Adım 2: PostgreSQL 15 kontrolü ve kurulumu
 */
async function checkAndInstallPostgres(onLog) {
  onLog({ type: 'step', message: 'PostgreSQL kontrol ediliyor...', percent: 10 });

  const psqlPath = findPsql();
  if (psqlPath) {
    onLog({ type: 'ok', message: `PostgreSQL mevcut: ${psqlPath}`, percent: 15 });
    return;
  }

  onLog({ type: 'info', message: 'PostgreSQL bulunamadı, winget ile kuruluyor (bu işlem birkaç dakika sürebilir)...', percent: 11 });

  const result = await runCmdWithLog(
    `winget install PostgreSQL.PostgreSQL.15 --silent --accept-package-agreements --accept-source-agreements --override "--mode unattended --superpassword ${POSTGRES_SUPER_PASS} --serverport 5432"`,
    onLog,
    { timeout: 600000 }
  );

  if (!result.ok) {
    throw new Error(
      'PostgreSQL kurulumu başarısız. Lütfen https://www.postgresql.org/download/windows/ adresinden PostgreSQL 15 kurun ve tekrar deneyin.'
    );
  }

  // PostgreSQL servisini başlat
  await runCmdWithLog('net start postgresql-x64-15', onLog);
  onLog({ type: 'ok', message: 'PostgreSQL 15 kurulumu tamamlandı.', percent: 15 });
}

/**
 * Adım 3: Backend dosyalarını kopyala
 */
async function copyBackend(installDir, onLog) {
  onLog({ type: 'step', message: 'Backend dosyaları kopyalanıyor...', percent: 20 });

  const destBackend = path.join(installDir, 'backend');

  // Kaynak yolunu belirle (dev vs production)
  let srcBackend;
  if (process.resourcesPath && !process.env.NODE_ENV === 'development') {
    srcBackend = path.join(process.resourcesPath, 'backend');
  } else {
    // Geliştirme: installer/../backend
    srcBackend = path.join(__dirname, '..', 'backend');
  }

  // Electron paketi için daha güvenilir kaynak tespiti
  const resourcesBackend = process.resourcesPath
    ? path.join(process.resourcesPath, 'backend')
    : null;

  if (resourcesBackend && exists(resourcesBackend)) {
    srcBackend = resourcesBackend;
  } else if (!exists(srcBackend)) {
    throw new Error(`Backend kaynak dizini bulunamadı: ${srcBackend}`);
  }

  onLog({ type: 'info', message: `Kaynak: ${srcBackend}` });
  onLog({ type: 'info', message: `Hedef: ${destBackend}` });

  // Hedef dizini oluştur
  fs.mkdirSync(destBackend, { recursive: true });

  // Kopyala
  copyDir(srcBackend, destBackend);

  onLog({ type: 'ok', message: 'Backend dosyaları kopyalandı.', percent: 25 });
}

/**
 * Adım 4: PostgreSQL kullanıcısı ve veritabanı oluştur
 */
async function setupPostgres(dbPass, onLog) {
  onLog({ type: 'step', message: 'Veritabanı yapılandırılıyor...', percent: 30 });

  const psql = findPsql();
  if (!psql) {
    throw new Error('psql.exe bulunamadı. PostgreSQL kurulumu başarısız olmuş olabilir.');
  }

  const env = {
    ...process.env,
    PGPASSWORD: POSTGRES_SUPER_PASS,
  };

  // Kullanıcı zaten var mı kontrol et
  const checkUser = runCmd(
    `"${psql}" -U postgres -h 127.0.0.1 -c "SELECT 1 FROM pg_roles WHERE rolname='market_user';"`,
    { env }
  );

  if (!checkUser.ok) {
    onLog({ type: 'warn', message: 'PostgreSQL bağlantısı kuruluyor, servis başlatılıyor...' });
    // Servisi başlatmayı dene
    runCmd('net start postgresql-x64-15');
    runCmd('net start postgresql-x64-14');
    runCmd('net start postgresql-x64-16');
    // 3 saniye bekle
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Kullanıcı oluştur
  onLog({ type: 'info', message: 'market_user oluşturuluyor...' });
  const createUser = runCmd(
    `"${psql}" -U postgres -h 127.0.0.1 -c "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='market_user') THEN CREATE ROLE market_user WITH LOGIN PASSWORD '${dbPass}'; END IF; END $$;"`,
    { env }
  );

  if (!createUser.ok) {
    throw new Error(`Kullanıcı oluşturulamadı: ${createUser.stderr}`);
  }
  onLog({ type: 'info', message: 'market_user oluşturuldu (veya zaten mevcuttu).' });

  // Veritabanı oluştur
  onLog({ type: 'info', message: 'market_db oluşturuluyor...' });
  runCmd(
    `"${psql}" -U postgres -h 127.0.0.1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='market_db';"`,
    { env }
  );

  const createDb = runCmd(
    `"${psql}" -U postgres -h 127.0.0.1 -c "SELECT 1 FROM pg_database WHERE datname='market_db';" | find "1" || "${psql}" -U postgres -h 127.0.0.1 -c "CREATE DATABASE market_db OWNER market_user ENCODING 'UTF8';"`,
    { env }
  );

  // Alternatif: IF NOT EXISTS benzeri
  const checkDb = runCmd(
    `"${psql}" -U postgres -h 127.0.0.1 -c "SELECT datname FROM pg_database WHERE datname='market_db';"`,
    { env }
  );

  if (checkDb.ok && !checkDb.stdout.includes('market_db')) {
    const createDbResult = runCmd(
      `"${psql}" -U postgres -h 127.0.0.1 -c "CREATE DATABASE market_db OWNER market_user ENCODING 'UTF8' LC_COLLATE 'Turkish_Turkey.1254' LC_CTYPE 'Turkish_Turkey.1254' TEMPLATE template0;"`,
      { env }
    );
    if (!createDbResult.ok) {
      // Türkçe locale yoksa varsayılanla oluştur
      const fallback = runCmd(
        `"${psql}" -U postgres -h 127.0.0.1 -c "CREATE DATABASE market_db OWNER market_user ENCODING 'UTF8';"`,
        { env }
      );
      if (!fallback.ok) {
        throw new Error(`Veritabanı oluşturulamadı: ${fallback.stderr}`);
      }
    }
    onLog({ type: 'info', message: 'market_db veritabanı oluşturuldu.' });
  } else {
    onLog({ type: 'info', message: 'market_db zaten mevcut, kullanılıyor.' });
  }

  // Kullanıcıya tüm yetkiyi ver
  runCmd(
    `"${psql}" -U postgres -h 127.0.0.1 -c "GRANT ALL PRIVILEGES ON DATABASE market_db TO market_user; ALTER USER market_user CREATEDB;"`,
    { env }
  );

  onLog({ type: 'ok', message: 'Veritabanı yapılandırması tamamlandı.', percent: 40 });
}

/**
 * Adım 5: Python sanal ortam oluştur
 */
async function createVenv(installDir, onLog) {
  onLog({ type: 'step', message: 'Python sanal ortamı oluşturuluyor...', percent: 45 });

  const backendDir = path.join(installDir, 'backend');
  const venvDir = path.join(backendDir, 'venv');

  if (exists(path.join(venvDir, 'Scripts', 'python.exe'))) {
    onLog({ type: 'ok', message: 'Sanal ortam zaten mevcut.', percent: 48 });
    return;
  }

  const pyExe = findPython();
  if (!pyExe) {
    throw new Error('Python bulunamadı. Lütfen önce Python 3.11 kurun.');
  }

  const result = await runCmdWithLog(
    `${pyExe} -m venv "${venvDir}"`,
    onLog,
    { cwd: backendDir }
  );

  if (!result.ok) {
    throw new Error('Sanal ortam oluşturulamadı.');
  }

  onLog({ type: 'ok', message: 'Sanal ortam oluşturuldu.', percent: 50 });
}

/**
 * Adım 6: Paketleri yükle (pip install)
 */
async function installPackages(installDir, onLog) {
  onLog({ type: 'step', message: 'Python paketleri yükleniyor (bu işlem birkaç dakika sürebilir)...', percent: 52 });

  const backendDir = path.join(installDir, 'backend');
  const pipPath = path.join(backendDir, 'venv', 'Scripts', 'pip.exe');
  const reqPath = path.join(backendDir, 'requirements.txt');

  if (!exists(reqPath)) {
    throw new Error(`requirements.txt bulunamadı: ${reqPath}`);
  }

  // pip'i güncelle
  await runCmdWithLog(
    `"${pipPath}" install --upgrade pip --quiet`,
    onLog,
    { cwd: backendDir }
  );

  // Paketleri yükle
  const result = await runCmdWithLog(
    `"${pipPath}" install -r "${reqPath}"`,
    onLog,
    { cwd: backendDir, timeout: 600000 }
  );

  if (!result.ok) {
    throw new Error('Python paket kurulumu başarısız oldu. İnternet bağlantınızı kontrol edin.');
  }

  onLog({ type: 'ok', message: 'Python paketleri yüklendi.', percent: 65 });
}

/**
 * Adım 7: .env dosyası oluştur
 */
async function createEnvFile(installDir, config) {
  const backendDir = path.join(installDir, 'backend');
  const envPath = path.join(backendDir, '.env');

  const secretKey = generateKey(64);
  const backupKey = generateKey(32);
  const dbPass = config._dbPass;

  const envContent = [
    '# Market Yönetim Sistemi — Ortam Değişkenleri',
    `# Oluşturulma tarihi: ${new Date().toLocaleString('tr-TR')}`,
    '',
    '# Veritabanı',
    `DATABASE_URL=postgresql://market_user:${dbPass}@127.0.0.1:5432/market_db`,
    `DB_HOST=127.0.0.1`,
    `DB_PORT=5432`,
    `DB_NAME=market_db`,
    `DB_USER=market_user`,
    `DB_PASSWORD=${dbPass}`,
    '',
    '# Güvenlik',
    `SECRET_KEY=${secretKey}`,
    `BACKUP_KEY=${backupKey}`,
    `ALGORITHM=HS256`,
    `ACCESS_TOKEN_EXPIRE_MINUTES=480`,
    '',
    '# Sunucu',
    `HOST=0.0.0.0`,
    `PORT=8000`,
    `DEBUG=false`,
    '',
    '# Market Bilgileri',
    `MARKET_ADI=${config.marketAdi || 'Market'}`,
    `MARKET_ADRES=${config.adres || ''}`,
    `MARKET_TELEFON=${config.telefon || ''}`,
    '',
    '# Çok Şubeli Mod',
    `MULTI_BRANCH=false`,
    `DEFAULT_BRANCH_ID=1`,
    '',
    '# Yedekleme',
    `BACKUP_DIR=C:\\MarketSistemi\\yedekler`,
    `AUTO_BACKUP=true`,
    `BACKUP_HOUR=2`,
  ].join('\n');

  fs.writeFileSync(envPath, envContent, 'utf8');
}

/**
 * Adım 8: Alembic migrasyonlarını çalıştır
 */
async function runMigrations(installDir, onLog) {
  onLog({ type: 'step', message: 'Veritabanı şeması oluşturuluyor...', percent: 67 });

  const backendDir = path.join(installDir, 'backend');
  const alembicPath = path.join(backendDir, 'venv', 'Scripts', 'alembic.exe');

  // alembic.exe yoksa python -m alembic dene
  let cmd;
  if (exists(alembicPath)) {
    cmd = `"${alembicPath}" upgrade head`;
  } else {
    const pythonPath = path.join(backendDir, 'venv', 'Scripts', 'python.exe');
    cmd = `"${pythonPath}" -m alembic upgrade head`;
  }

  const result = await runCmdWithLog(cmd, onLog, { cwd: backendDir, timeout: 120000 });

  if (!result.ok) {
    throw new Error('Veritabanı şeması oluşturulamadı. Lütfen log mesajlarını kontrol edin.');
  }

  onLog({ type: 'ok', message: 'Veritabanı şeması oluşturuldu.', percent: 75 });
}

/**
 * Adım 9: Seed verilerini yükle
 * @returns {Promise<{email: string, password: string}>} - Admin bilgileri
 */
async function runSeed(installDir, config, onLog) {
  onLog({ type: 'step', message: 'Başlangıç verileri yükleniyor...', percent: 77 });

  const backendDir = path.join(installDir, 'backend');
  const pythonPath = path.join(backendDir, 'venv', 'Scripts', 'python.exe');
  const seedPath = path.join(backendDir, 'seed.py');

  if (!exists(seedPath)) {
    onLog({ type: 'warn', message: 'seed.py bulunamadı, bu adım atlanıyor.' });
    return { email: config.email, password: config.sifre };
  }

  // seed.py'ye admin bilgilerini çevre değişkeni olarak geç
  const env = {
    ...process.env,
    SEED_ADMIN_EMAIL: config.email || 'admin@market.com',
    SEED_ADMIN_PASSWORD: config.sifre || generateKey(8),
    SEED_ADMIN_PIN: config.pin || '123456',
    SEED_MARKET_ADI: config.marketAdi || 'Market',
  };

  return new Promise((resolve) => {
    let stdout = '';
    const proc = spawn('cmd.exe', ['/c', `"${pythonPath}" "${seedPath}"`], {
      env,
      cwd: backendDir,
    });

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      const lines = text.split('\n').filter((l) => l.trim());
      lines.forEach((line) => onLog({ type: 'info', message: line.trim() }));
    });

    proc.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter((l) => l.trim());
      lines.forEach((line) => onLog({ type: 'info', message: line.trim() }));
    });

    proc.on('close', (code) => {
      // stdout'tan admin bilgilerini parse et
      let email = config.email || 'admin@market.com';
      let password = config.sifre || '';

      const emailMatch = stdout.match(/Admin Email[:\s]+([^\s\n]+)/i);
      const passMatch = stdout.match(/Admin (Şifre|Sifre|Password)[:\s]+([^\s\n]+)/i);

      if (emailMatch) email = emailMatch[1];
      if (passMatch) password = passMatch[2];

      if (code !== 0) {
        onLog({ type: 'warn', message: 'Seed işlemi uyarıyla tamamlandı.' });
      }

      onLog({ type: 'ok', message: 'Başlangıç verileri yüklendi.', percent: 82 });
      resolve({ email, password });
    });

    proc.on('error', () => {
      onLog({ type: 'warn', message: 'Seed çalıştırılamadı, bu adım atlanıyor.' });
      resolve({ email: config.email, password: config.sifre });
    });
  });
}

/**
 * Adım 10: Windows Task Scheduler'a görev ekle
 */
async function setupScheduledTask(installDir, onLog) {
  onLog({ type: 'step', message: "Windows Görev Zamanlayıcı'ya ekleniyor...", percent: 84 });

  const backendDir = path.join(installDir, 'backend');
  const pythonPath = path.join(backendDir, 'venv', 'Scripts', 'python.exe');
  const mainPath = path.join(backendDir, 'main.py');

  // Mevcut görevi sil (varsa)
  runCmd('schtasks /delete /tn "MarketSistemi" /f');

  // Başlangıç batch dosyası oluştur
  const batContent = [
    '@echo off',
    `cd /d "${backendDir}"`,
    `"${pythonPath}" -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2 >> "${installDir}\\logs\\server.log" 2>&1`,
  ].join('\r\n');

  const batDir = path.join(installDir, 'bin');
  const batPath = path.join(batDir, 'start_server.bat');
  fs.mkdirSync(batDir, { recursive: true });
  fs.writeFileSync(batPath, batContent, 'utf8');

  // Log dizini oluştur
  fs.mkdirSync(path.join(installDir, 'logs'), { recursive: true });

  // Task Scheduler görevi oluştur
  const result = runCmd(
    `schtasks /create /tn "MarketSistemi" /tr "${batPath}" /sc ONSTART /ru SYSTEM /rl HIGHEST /f`
  );

  if (!result.ok) {
    onLog({ type: 'warn', message: `Görev zamanlayıcı uyarısı: ${result.stderr}` });
    // Hata değil uyarı — kuruluma devam et
  } else {
    onLog({ type: 'info', message: 'Görev Zamanlayıcı görevi oluşturuldu.' });
  }

  // Servisi hemen başlat
  onLog({ type: 'info', message: 'Sunucu başlatılıyor...' });
  spawn('cmd.exe', ['/c', `"${batPath}"`], {
    detached: true,
    stdio: 'ignore',
  }).unref();

  onLog({ type: 'ok', message: 'Sunucu arka planda başlatıldı.', percent: 90 });
}

/**
 * Adım 11: Güvenlik duvarı — port 8000 aç
 */
async function openFirewall(onLog) {
  onLog({ type: 'step', message: 'Güvenlik duvarı kuralı ekleniyor (Port 8000)...', percent: 92 });

  // Mevcut kuralı sil (varsa)
  runCmd('netsh advfirewall firewall delete rule name="MarketSistemi-API" 2>nul');

  // Yeni kural ekle
  const result = runCmd(
    'netsh advfirewall firewall add rule name="MarketSistemi-API" dir=in action=allow protocol=TCP localport=8000 profile=private,domain'
  );

  if (!result.ok) {
    onLog({ type: 'warn', message: 'Güvenlik duvarı kuralı eklenemedi. Manuel olarak Port 8000\'i açmanız gerekebilir.' });
  } else {
    onLog({ type: 'ok', message: 'Güvenlik duvarı kuralı eklendi. Port 8000 açık.', percent: 95 });
  }
}

// ─── Ana Kurulum Fonksiyonu ────────────────────────────────────────────────

/**
 * Tüm kurulum adımlarını sırayla çalıştır
 *
 * @param {object} config - Kullanıcı girdileri
 * @param {function} onLog - Log gönderici: ({type, message, percent}) => void
 * @returns {Promise<object>} - Kurulum sonucu
 */
async function runInstall(config, onLog) {
  const installDir = config.installDir || INSTALL_DIR_DEFAULT;

  onLog({ type: 'step', message: '━━━ Market Sistemi Kurulumu Başlıyor ━━━', percent: 0 });
  onLog({ type: 'info', message: `Kurulum dizini: ${installDir}` });

  // Kurulum dizinini oluştur
  fs.mkdirSync(installDir, { recursive: true });

  // Otomatik DB şifresi üret (kullanıcıya gösterilmez)
  const dbPass = generateDbPassword();
  config._dbPass = dbPass;

  try {
    // 1. Python
    await checkAndInstallPython(onLog);

    // 2. PostgreSQL
    await checkAndInstallPostgres(onLog);

    // 3. Backend kopyala
    await copyBackend(installDir, onLog);

    // 4. PostgreSQL yapılandır
    await setupPostgres(dbPass, onLog);

    // 5. .env oluştur (venv öncesi — migration için gerekli)
    onLog({ type: 'step', message: 'Yapılandırma dosyası oluşturuluyor...', percent: 43 });
    await createEnvFile(installDir, config);
    onLog({ type: 'ok', message: '.env dosyası oluşturuldu.', percent: 45 });

    // 6. Venv oluştur
    await createVenv(installDir, onLog);

    // 7. Paketleri yükle
    await installPackages(installDir, onLog);

    // 8. Migration
    await runMigrations(installDir, onLog);

    // 9. Seed
    const adminInfo = await runSeed(installDir, config, onLog);

    // 10. Task Scheduler
    await setupScheduledTask(installDir, onLog);

    // 11. Güvenlik duvarı
    await openFirewall(onLog);

    // IP al
    const serverIP = getLocalIP();

    onLog({ type: 'ok', message: '━━━ Kurulum Başarıyla Tamamlandı! ━━━', percent: 100 });

    return {
      installDir,
      serverIP,
      serverPort: 8000,
      adminEmail: adminInfo.email,
      adminPassword: adminInfo.password,
      dbPass,
    };
  } catch (err) {
    onLog({ type: 'error', message: `Kurulum hatası: ${err.message}` });
    throw err;
  }
}

// ─── Export ────────────────────────────────────────────────────────────────

module.exports = {
  runInstall,
  getLocalIP,
  checkAndInstallPython,
  checkAndInstallPostgres,
  copyBackend,
  setupPostgres,
  createVenv,
  installPackages,
  createEnvFile,
  runMigrations,
  runSeed,
  setupScheduledTask,
  openFirewall,
};
