/**
 * IPC Handlers
 * 
 * Centraliza todos los manejadores de eventos IPC
 * Separa la lógica de main.js para mayor mantenibilidad
 */

const { ipcMain } = require('electron');
const { execSync } = require('child_process');
const TerminalScanner = require('./services/TerminalScanner');
const EAInstaller = require('./services/EAInstaller');
const Connectivity = require('./services/Connectivity');
const ConfigManager = require('./services/ConfigManager');
const logger = require('./services/Logger');

let terminalsCache = [];

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
 * Registrar todos los handlers IPC
 */
function registerHandlers(mainWindow) {
  logger.info('════════════════════════════════════════════════════════════');
  logger.info('Registrando IPC Handlers');
  logger.info('════════════════════════════════════════════════════════════');

  const scanner = new TerminalScanner();
  const installer = new EAInstaller();
  const connectivity = Connectivity.instance;

  // ==================== TERMINALES ====================

  ipcMain.handle('get-admin-status', async () => {
    try {
      const isAdmin = isRunningAsAdmin();
      return { success: true, isAdmin };
    } catch (err) {
      logger.error('IPC: get-admin-status (error)', { error: err.message });
      return { success: false, isAdmin: false, error: err.message };
    }
  });

  /**
   * scan-terminals
   * Escanear terminales MT4/MT5 disponibles
   */
  ipcMain.handle('scan-terminals', async () => {
    try {
      logger.info('IPC: scan-terminals (request)');
      terminalsCache = await scanner.scanTerminals();
      
      logger.success(`IPC: scan-terminals (response)`, {
        count: terminalsCache.length
      });

      return {
        success: true,
        terminals: terminalsCache.map(t => t.toJSON())
      };
    } catch (err) {
      logger.error('IPC: scan-terminals (error)', { error: err.message });
      return { success: false, error: err.message };
    }
  });

  /**
   * clear-cache-and-scan
   * 🧹 LIMPIAR CACHÉ Y RESCANEAR TODO
   * Fuerza lectura COMPLETA desde cero, sin usar datos en caché
   */
  ipcMain.handle('clear-cache-and-scan', async () => {
    try {
      logger.info('IPC: clear-cache-and-scan (request)');
      
      // 🧹 LIMPIAR CACHÉ
      terminalsCache = [];
      logger.info('🧹 Caché limpiado');
      
      // 📡 RESCANEAR DESDE CERO
      logger.info('📡 Re-escaneando todas las terminales...');
      terminalsCache = await scanner.scanTerminals();
      
      logger.success(`IPC: clear-cache-and-scan (response)`, {
        count: terminalsCache.length,
        cached: true
      });

      return {
        success: true,
        terminals: terminalsCache.map(t => t.toJSON())
      };
    } catch (err) {
      logger.error('IPC: clear-cache-and-scan (error)', { error: err.message });
      return { success: false, error: err.message };
    }
  });

  /**
   * install-ea
   * Instalar EA en terminal específico
   * ✅ Valida email con Worker ANTES de instalar
   * 
   * El Worker comprobará:
   * 1. Email existe
   * 2. Usuario activo
   * 3. Suscripción válida
   * 
   * DESPUÉS, cuando el EA intente registrarse, el worker validará
   * que el installation_id (valores reales de MetaTrader) no esté
   * vinculado a otro usuario.
   */
  ipcMain.handle('install-ea', async (event, terminalId, config) => {
    try {
      logger.info('IPC: install-ea (request)', { terminalId, email: config?.userEmail });

      // ✅ 1. Validar que terminal existe
      const terminal = terminalsCache.find(t => t.id === terminalId);
      if (!terminal) {
        throw new Error(`Terminal no encontrado: ${terminalId}`);
      }

      // ✅ 2. Validar que email se proporcionó
      const userEmail = config?.userEmail;
      if (!userEmail) {
        throw new Error('Email de usuario no proporcionado');
      }

      // ✅ 3. VALIDAR INSTALACIÓN CON WORKER (email existe, activo, suscripción válida)
      logger.info('Validando si instalación es posible con este email...');
      const installationValidation = await connectivity.validateInstallationEarly(userEmail);
      
      if (!installationValidation.success) {
        const errorMsg = installationValidation.message || 'Instalación no autorizada';
        logger.warn('Installation validation failed:', { email: userEmail, error: errorMsg });
        throw new Error(errorMsg);
      }
      
      logger.success('✓ Instalación validada para usuario', { 
        email: userEmail
      });

      // ✅ 4. INSTALAR EA (validación de instalación pasada)
      logger.info('Procediendo a instalar EA...', { terminal: terminal.name });
      const result = await installer.install(terminal, {
        userEmail: userEmail
      });

      // Re-escanear para actualizar estado
      terminalsCache = await scanner.scanTerminals();

      logger.success('IPC: install-ea (response)', { terminalId });
      return { success: true, ...result };
    } catch (err) {
      logger.error('IPC: install-ea (error)', { 
        error: err.message,
        terminalId 
      });
      return { success: false, error: err.message };
    }
  });

  /**
  /**
   * scan-single-terminal
   * 🔄 REFRESCAR datos de UNA terminal específica ANTES de instalar
   * 
   * ⚠️ CRÍTICO: El usuario puede haber cambiado de cuenta/broker en MT5
   * entre el último scan y ahora. Este endpoint fuerza la re-lectura
   * de broker, server, account REALES desde la terminal MT4/MT5.
   * 
   * Esto evita errores 400/403 cuando los datos en caché son obsoletos.
   */
  ipcMain.handle('scan-single-terminal', async (event, terminalId) => {
    try {
      logger.info('IPC: scan-single-terminal (request)', { terminalId });

      const freshTerminal = await scanner.scanSingleTerminal(terminalId);
      if (!freshTerminal) {
        throw new Error(`Terminal no encontrado: ${terminalId}`);
      }

      // ✅ Actualizar caché con datos frescos
      const cacheIndex = terminalsCache.findIndex(t => t.id === terminalId);
      if (cacheIndex >= 0) {
        terminalsCache[cacheIndex] = freshTerminal;
      } else {
        terminalsCache.push(freshTerminal);
      }

      logger.success('IPC: scan-single-terminal (response)', {
        terminalId,
        broker: freshTerminal.broker,
        server: freshTerminal.server,
        account: freshTerminal.account
      });

      return {
        success: true,
        terminal: freshTerminal.toJSON()
      };
    } catch (err) {
      logger.error('IPC: scan-single-terminal (error)', {
        error: err.message,
        terminalId
      });
      return { success: false, error: err.message };
    }
  });

  /**
   * reserve-installation
   * Pre-reservar una terminal antes de instalar el EA
   * 
   * NUEVO FORMATO de installation_id:
   * ID_{MT4|MT5}_{terminalId}_{accountNumber}
   * 
   * Al reservar: ID_{MT4|MT5}_{terminalId}
   * Al registrar: ID_{MT4|MT5}_{terminalId}_{accountNumber}
   */
  ipcMain.handle('reserve-installation', async (event, terminalId, userEmail) => {
    try {
      logger.info('IPC: reserve-installation (request)', { terminalId, email: userEmail });

      const terminal = terminalsCache.find(t => t.id === terminalId);
      if (!terminal) {
        throw new Error(`Terminal no encontrado: ${terminalId}`);
      }

      if (!userEmail) {
        throw new Error('Email de usuario no proporcionado');
      }

      // 🔑 NUEVO: Usar formato simple ID_MT4/MT5_terminalId
      // Sin broker/server/account (se agregan después)
      const result = await connectivity.reserveInstallation(
        userEmail,
        terminal.type,  // 'MT4' o 'MT5'
        terminalId
      );

      logger.info('IPC: reserve-installation (response)', { terminalId, result });
      return result;
    } catch (err) {
      logger.error('IPC: reserve-installation (error)', {
        error: err.message,
        terminalId
      });
      return { success: false, error: err.message };
    }
  });

  /**
   * check-terminal-available
   * Validar que una terminal está disponible para instalar ANTES de proceder
   * Valida: usuario existe, está activo, terminal no está vinculada a otro usuario
   */
  ipcMain.handle('check-terminal-available', async (event, terminalId, userEmail) => {
    try {
      logger.info('IPC: check-terminal-available (request)', { terminalId, email: userEmail });

      const terminal = terminalsCache.find(t => t.id === terminalId);
      if (!terminal) {
        throw new Error(`Terminal no encontrado: ${terminalId}`);
      }

      if (!userEmail) {
        throw new Error('Email no proporcionado');
      }

      // Llamar al worker para validar disponibilidad
      const result = await connectivity.checkTerminalAvailability(
        userEmail,
        terminal.broker,
        terminal.server,
        terminal.account
      );

      logger.info('IPC: check-terminal-available (response)', { terminalId, result });
      return result;
    } catch (err) {
      logger.error('IPC: check-terminal-available (error)', { 
        error: err.message,
        terminalId 
      });
      return { success: false, error: err.message };
    }
  });

  /**
   * uninstall-ea
   * Desinstalar EA de terminal
   */
  ipcMain.handle('uninstall-ea', async (event, terminalId) => {
    try {
      logger.info('IPC: uninstall-ea (request)', { terminalId });

      const terminal = terminalsCache.find(t => t.id === terminalId);
      if (!terminal) {
        throw new Error(`Terminal no encontrado: ${terminalId}`);
      }

      const result = await installer.uninstall(terminal);

      // Re-escanear para actualizar estado
      terminalsCache = await scanner.scanTerminals();

      logger.success('IPC: uninstall-ea (response)', { terminalId });
      return { success: true, ...result };
    } catch (err) {
      logger.error('IPC: uninstall-ea (error)', {
        error: err.message,
        terminalId
      });
      return { success: false, error: err.message };
    }
  });

  /**
   * unreserve-installation
   * Liberar una reserva en el backend
   */
  ipcMain.handle('unreserve-installation', async (event, installationId, userEmail, reason = null) => {
    try {
      const emailToUse = userEmail || ConfigManager.getUserEmail();

      if (!installationId) {
        throw new Error('installationId no proporcionado');
      }

      if (!emailToUse) {
        throw new Error('Email no proporcionado');
      }

      logger.info('IPC: unreserve-installation (request)', { installationId, email: emailToUse, reason });

      const result = await connectivity.unreserveInstallation(installationId, emailToUse, reason);

      logger.info('IPC: unreserve-installation (response)', { installationId, result });
      return result;
    } catch (err) {
      logger.error('IPC: unreserve-installation (error)', {
        error: err.message,
        installationId
      });
      return { success: false, error: err.message };
    }
  });

  /**
   * 🆕 reset-sync
   * Resetear la sincronización para una terminal
   * Borra archivos de estado para forzar sincronización completa del histórico
   * 
   * Útil para:
   * - Sincronizar histórico completo nuevamente
   * - Corregir desincronizaciones
   * - Después de cambios en la BD
   */
  ipcMain.handle('reset-sync', async (event, terminalId) => {
    try {
      logger.info('IPC: reset-sync (request)', { terminalId });

      const terminal = terminalsCache.find(t => t.id === terminalId);
      if (!terminal) {
        throw new Error(`Terminal no encontrado: ${terminalId}`);
      }

      const path = require('path');
      const fs = require('fs');

      const mqlFolder = terminal.mqlFolder || (terminal.type === 'MT4' ? 'MQL4' : 'MQL5');
      const filesPath = path.join(terminal.dataPath, mqlFolder, 'Files');

      let deletedCount = 0;
      const deletedFiles = [];

      // Buscar y eliminar archivos de ESTADO
      // Patrón: DataBridge_MT*_*_state.txt
      if (fs.existsSync(filesPath)) {
        try {
          const files = fs.readdirSync(filesPath);
          for (const file of files) {
            if (/^DataBridge_MT[45]_.*_state\.txt$/.test(file)) {
              const fullPath = path.join(filesPath, file);
              try {
                fs.unlinkSync(fullPath);
                deletedCount++;
                deletedFiles.push(file);
                logger.success(`✓ Borrado archivo de estado: ${file}`);
              } catch (err) {
                logger.warn(`⚠ No se pudo borrar: ${file}`, { error: err.message });
              }
            }
          }
        } catch (err) {
          logger.debug(`Error leyendo directorio de Files`, { error: err.message });
        }
      }

      logger.success('IPC: reset-sync (response)', { 
        terminalId,
        filesDeleted: deletedCount 
      });

      return { 
        success: true, 
        message: `Se eliminaron ${deletedCount} archivo(s) de estado. El próximo sync será completo.`,
        filesDeleted: deletedCount,
        deletedFiles: deletedFiles
      };
    } catch (err) {
      logger.error('IPC: reset-sync (error)', {
        error: err.message,
        terminalId
      });
      return { success: false, error: err.message };
    }
  });

  /**
   * select-folder
   * Abrir diálogo para seleccionar carpeta
   */
  ipcMain.handle('select-folder', async (event) => {
    try {
      logger.info('IPC: select-folder (request)');

      const { dialog } = require('electron');
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Selecciona la carpeta de tu terminal MetaTrader',
        message: 'Busca la carpeta que contiene terminal.exe o terminal64.exe'
      });

      if (result.canceled) {
        logger.info('IPC: select-folder (canceled)');
        return { filePath: null };
      }

      logger.success('IPC: select-folder (response)', {
        path: result.filePaths[0]
      });
      return { filePath: result.filePaths[0] };
    } catch (err) {
      logger.error('IPC: select-folder (error)', { error: err.message });
      return { filePath: null, error: err.message };
    }
  });

  /**
   * install-ea-manual
   * Instalar EA en ruta seleccionada manualmente
   * ✅ AHORA: Valida email con Worker ANTES de instalar
   */
  ipcMain.handle('install-ea-manual', async (event, folderPath, config) => {
    try {
      logger.info('IPC: install-ea-manual (request)', { folderPath });

      const fs = require('fs');
      const path = require('path');

      // ✅ Obtener email (del config o del ConfigManager)
      const userEmail = config?.userEmail || ConfigManager.getUserEmail();
      if (!userEmail) {
        throw new Error('Email de usuario no proporcionado');
      }

      // ✅ VALIDAR EMAIL CON WORKER antes de instalar
      logger.info('Validando email con Worker...');
      const emailValidation = await connectivity.registerOrValidateEmail(userEmail);
      
      if (!emailValidation.success) {
        const errorMsg = emailValidation.message || 'Email no válido o no registrado';
        logger.warn('Email validation failed:', { email: userEmail, error: errorMsg });
        throw new Error(errorMsg);
      }
      
      logger.success('✓ Email validado correctamente', { 
        email: userEmail, 
        isNew: emailValidation.isNew 
      });

      // Auto-detectar tipo de terminal
      const terminal4Path = path.join(folderPath, 'terminal.exe');
      const terminal5Path = path.join(folderPath, 'terminal64.exe');

      let type, mqlFolder;
      if (fs.existsSync(terminal4Path)) {
        type = 'MT4';
        mqlFolder = 'MQL4';
      } else if (fs.existsSync(terminal5Path)) {
        type = 'MT5';
        mqlFolder = 'MQL5';
      } else {
        type = 'MT5';
        mqlFolder = 'MQL5';
      }

      const manualTerminal = {
        id: 'manual_' + Date.now(),
        name: 'Manual Installation',
        type,
        mqlFolder,
        dataPath: folderPath,
        broker: 'Unknown',
        account: 'N/A',
        server: 'Unknown',
        installed: false
      };

      const result = await installer.install(manualTerminal, {
        userEmail: userEmail
      });

      logger.success('IPC: install-ea-manual (response)');
      return { success: true, ...result };
    } catch (err) {
      logger.error('IPC: install-ea-manual (error)', { error: err.message });
      return { success: false, error: err.message };
    }
  });

  // ==================== CONFIGURACIÓN ====================

  /**
   * get-config
   * Obtener configuración global
   */
  ipcMain.handle('get-config', async (event) => {
    try {
      logger.info('IPC: get-config (request)');

      const config = ConfigManager.getAll();
      logger.debug('IPC: get-config (response)', {
        hasEmail: !!config.userEmail
      });

      return { success: true, config };
    } catch (err) {
      logger.error('IPC: get-config (error)', { error: err.message });
      return { success: false, error: err.message };
    }
  });

  /**
   * set-email
   * Establecer email del usuario
   */
  ipcMain.handle('set-email', async (event, email) => {
    try {
      logger.info('IPC: set-email (request)', { email });

      const savedEmail = ConfigManager.setUserEmail(email);
      logger.success('IPC: set-email (response)');

      return { success: true, email: savedEmail };
    } catch (err) {
      logger.error('IPC: set-email (error)', { error: err.message });
      return { success: false, error: err.message };
    }
  });

  /**
   * register-or-validate-email
   * Registrar o validar email con el Worker
   */
  ipcMain.handle('register-or-validate-email', async (event, email) => {
    try {
      logger.info('IPC: register-or-validate-email (request)');

      const result = await connectivity.registerOrValidateEmail(email);

      if (result.success) {
        // Guardar email localmente si es exitoso
        try {
          ConfigManager.setUserEmail(email);
        } catch (err) {
          logger.warn('No se pudo guardar email localmente', { error: err.message });
        }

        logger.success('IPC: register-or-validate-email (response)', {
          isNew: result.isNew
        });
      } else {
        logger.warn('IPC: register-or-validate-email (failed)', {
          message: result.message
        });
      }

      return result;
    } catch (err) {
      logger.error('IPC: register-or-validate-email (error)', { error: err.message });
      return { success: false, message: err.message };
    }
  });

  /**
   * validate-email (legacy)
   * @deprecated Usar register-or-validate-email
   */
  ipcMain.handle('validate-email', async (event, email) => {
    logger.info('IPC: validate-email (request, DEPRECATED)');
    return connectivity.validateEmailWithWorker(email);
  });

  // ==================== CONECTIVIDAD ====================

  /**
   * test-connectivity
   * Verificar conectividad con Worker
   */
  ipcMain.handle('test-connectivity', async (event) => {
    try {
      logger.info('IPC: test-connectivity (request)');

      const isConnected = await connectivity.testWorkerConnection(true);

      logger.info('IPC: test-connectivity (response)', { isConnected });
      return { success: true, isConnected };
    } catch (err) {
      logger.error('IPC: test-connectivity (error)', { error: err.message });
      return { success: false, error: err.message };
    }
  });

  // ==================== UTILIDADES ====================

  /**
   * open-terminal-folder
   * Abre la carpeta de la terminal en el explorador del sistema
   */
  ipcMain.handle('open-terminal-folder', async (event, terminalPath) => {
    try {
      const { shell } = require('electron');
      
      if (!terminalPath) {
        return { success: false, error: 'Ruta no proporcionada' };
      }

      logger.info('IPC: open-terminal-folder (request)', { terminalPath });
      
      await shell.openPath(terminalPath);
      
      logger.success('IPC: open-terminal-folder (response)', { terminalPath });
      return { success: true };
    } catch (err) {
      logger.error('IPC: open-terminal-folder (error)', { 
        error: err.message,
        terminalPath
      });
      return { success: false, error: err.message };
    }
  });

  logger.success('✓ IPC Handlers registrados correctamente');
  logger.info('════════════════════════════════════════════════════════════');
}

module.exports = { registerHandlers };
