'use strict';

/**
 * Market Yönetim Sistemi — Kurulum Sihirbazı
 * Electron ana süreç dosyası
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const os = require('os');
const { runInstall, getLocalIP } = require('./setup');

// Geliştirme modunda mı kontrol et
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow = null;

/**
 * Ana pencereyi oluştur
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 820,
    height: 620,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Market Sistemi Kurulum Sihirbazı',
    backgroundColor: '#0A0E1A',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    // Görev çubuğu ve pencere stili
    frame: true,
    titleBarStyle: 'default',
  });

  // İkon varsa yükle
  try {
    const iconPath = path.join(__dirname, 'assets', 'icon.ico');
    mainWindow.setIcon(iconPath);
  } catch (_) {
    // İkon bulunamazsa devam et
  }

  // Menüyü kaldır
  mainWindow.setMenuBarVisibility(false);

  // HTML dosyasını yükle
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Geliştirme modunda DevTools aç
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Uygulama hazır olduğunda pencereyi aç
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Tüm pencereler kapandığında uygulamayı kapat (Windows/Linux)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ─── IPC Handler: Kurulumu Başlat ──────────────────────────────────────────

/**
 * Renderer'dan kurulum başlatma isteği geldiğinde çalışır.
 * config = { marketAdi, adres, telefon, email, sifre, pin, installDir }
 */
ipcMain.handle('start-install', async (event, config) => {
  try {
    // Log gönderici: renderer'a canlı log mesajları ilet
    const onLog = (logEntry) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('install-log', logEntry);
      }
    };

    const result = await runInstall(config, onLog);
    return { success: true, data: result };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Bilinmeyen bir hata oluştu.',
    };
  }
});

// ─── IPC Handler: Yerel IP Al ──────────────────────────────────────────────

/**
 * Sunucu IP adresini döndürür (tablet bağlantısı için)
 */
ipcMain.handle('get-ip', async () => {
  try {
    const ip = getLocalIP();
    return { success: true, ip };
  } catch (err) {
    return { success: false, ip: '127.0.0.1' };
  }
});

// ─── IPC Handler: Klasör Aç ────────────────────────────────────────────────

/**
 * Belirtilen klasörü Dosya Gezgini'nde aç
 */
ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    await shell.openPath(folderPath || 'C:\\MarketSistemi');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── IPC Handler: Uygulamayı Kapat ────────────────────────────────────────

ipcMain.handle('quit-app', async () => {
  app.quit();
});

// ─── Beklenmeyen hata yönetimi ─────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  console.error('[ANA SÜREÇ] Beklenmeyen hata:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[ANA SÜREÇ] İşlenmemiş Promise reddi:', reason);
});
