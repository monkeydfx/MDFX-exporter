const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { execSync } = require('child_process');
const { autoUpdater } = require('electron-updater');
require('dotenv').config();

// Importar servicios
const logger = require('./services/Logger');
const ConfigManager = require('./services/ConfigManager');
const { registerHandlers } = require('./ipcHandlers');

let mainWindow;

/**
 * Verificar si se ejecuta como administrador en Windows
 */
function isRunningAsAdmin() {
  if (process.platform !== 'win32') return true;
  try {
    execSync('net session', { stdio: 'pipe' });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Crear ventana principal
 */
function createWindow() {
  logger.info('═══════════════════════════════════════════════════════════');
  logger.info('Creando ventana principal');
  logger.info('═══════════════════════════════════════════════════════════');

  // Advertencia si no es admin en Windows (se muestra en renderer con estilo)
  const isAdmin = isRunningAsAdmin();
  if (process.platform === 'win32' && !isAdmin) {
    logger.warn('⚠️ La aplicación no se ejecuta como Administrador');
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      // macOS: Asegurar que las rutas relativas resuelvan correctamente
      webSecurity: true
    },
    // macOS: Usar icono PNG como fallback si .icns no está disponible
    icon: process.platform === 'darwin' 
      ? undefined  // macOS usa el icono de .app automáticamente
      : path.join(__dirname, '..', 'assets', 'icons', 'icon.png')
  });

  // Conectar logger a mainWindow para IPC
  logger.setMainWindow(mainWindow);

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  logger.success('✓ Ventana principal creada');
}

/**
 * App Ready - Inicialización
 */
app.whenReady().then(() => {
  logger.info('═══════════════════════════════════════════════════════════');
  logger.info('TFX-SYNC - INICIANDO');
  logger.info('═══════════════════════════════════════════════════════════');

  try {
    // Crear ventana
    createWindow();

    // 🆕 Configurar electron-updater
    setupAutoUpdater();

    // Registrar handlers IPC
    registerHandlers(mainWindow);

    // Limpiar logs antiguos
    logger.cleanupOldLogs(30);

    // Verificar config inicial
    try {
      const installationId = ConfigManager.getInstallationId();
      logger.info('Configuración cargada', { installationId });
    } catch (err) {
      logger.error('Error cargando configuración', { error: err.message });
    }

    logger.success('✓ TFX-SYNC listo');
    logger.info('═══════════════════════════════════════════════════════════');
  } catch (err) {
    logger.error('Error crítico en inicialización', { 
      error: err.message,
      stack: err.stack 
    });
    app.quit();
  }

  // Re-crear ventana si se activa la aplicación
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * Cerrar app cuando se cierren todas las ventanas
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    logger.info('Cerrando aplicación');
    app.quit();
  }
});

/**
 * Manejo de excepciones no capturadas
 */
process.on('uncaughtException', (err) => {
  logger.error('❌ Excepción no capturada', { 
    error: err.message,
    stack: err.stack 
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ Promise rechazada no manejada', { 
    reason: String(reason),
    promise: String(promise)
  });
});

/**
 * 🆕 Configurar auto-updates con electron-updater
 */
function setupAutoUpdater() {
  try {
    // Configurar electron-updater
    autoUpdater.checkForUpdatesAndNotify();
    
    // Event: Nueva versión disponible
    autoUpdater.on('update-available', (info) => {
      logger.info('🆕 Nueva versión disponible:', { version: info.version });
      if (mainWindow) {
        mainWindow.webContents.send('update-available', info);
      }
    });

    // Event: Update descargado
    autoUpdater.on('update-downloaded', (info) => {
      logger.info('✅ Update descargado. Se aplicará al reiniciar.', { version: info.version });
      if (mainWindow) {
        mainWindow.webContents.send('update-downloaded', info);
      }
    });

    // Event: Error en actualizacion
    autoUpdater.on('error', (err) => {
      logger.warn('⚠️ Error en auto-updater', { error: err.message });
    });

    logger.success('✓ Auto-updater configurado');
  } catch (err) {
    logger.warn('⚠️ No se pudo configurar auto-updater', { error: err.message });
  }
}


