'use strict';

/**
 * Market Yönetim Sistemi — Kurulum Sihirbazı
 * Preload: Güvenli IPC köprüsü
 *
 * contextIsolation: true ile birlikte çalışır.
 * Renderer süreci window.installer üzerinden bu API'ye erişir.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Renderer'a güvenli API sun
contextBridge.exposeInMainWorld('installer', {

  /**
   * Kurulumu başlat
   * @param {object} config - Kurulum yapılandırması
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  startInstall: (config) => ipcRenderer.invoke('start-install', config),

  /**
   * Yerel ağ IP adresini al
   * @returns {Promise<{success: boolean, ip: string}>}
   */
  getIP: () => ipcRenderer.invoke('get-ip'),

  /**
   * Belirtilen klasörü Dosya Gezgini'nde aç
   * @param {string} folderPath
   * @returns {Promise<{success: boolean}>}
   */
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),

  /**
   * Uygulamayı kapat
   */
  quit: () => ipcRenderer.invoke('quit-app'),

  /**
   * Kurulum log mesajlarını dinle
   * @param {function} callback - Log verisi alındığında çağrılır
   * @returns {function} - Dinleyiciyi kaldıran fonksiyon
   */
  onLog: (callback) => {
    const handler = (_event, logEntry) => callback(logEntry);
    ipcRenderer.on('install-log', handler);

    // Temizleme fonksiyonu döndür
    return () => {
      ipcRenderer.removeListener('install-log', handler);
    };
  },

});
