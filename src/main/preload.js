const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload Script - Bridge seguro entre Electron Main y Renderer
 * 
 * Utiliza contextIsolation = true para seguridad
 * Expone solo APIs necesarias a través de electronAPI
 */

contextBridge.exposeInMainWorld('electronAPI', {
  // ========== TERMINALES ==========
  
  /**
   * Escanear terminales MT4/MT5 detectadas
   * @returns {Promise<{success, terminals}>}
   */
  scanTerminals: () => ipcRenderer.invoke('scan-terminals'),

  /**
   * 🧹 Limpiar caché y rescanear TODO
   * Fuerza lectura completa desde cero
   * @returns {Promise<{success, terminals}>}
   */
  clearCacheAndScan: () => ipcRenderer.invoke('clear-cache-and-scan'),

  /**
   * 🔄 Refrescar UNA terminal específica
   * Obtiene datos REALES actuales sin usar caché
   * @param {string} terminalId - ID del terminal a refrescar
   * @returns {Promise<{success, terminal}>}
   */
  scanSingleTerminal: (terminalId) => ipcRenderer.invoke('scan-single-terminal', terminalId),

  /**
   * Instalar EA en una terminal específica
   * @param {string} terminalId - ID del terminal
   * @param {object} config - Configuración (email, etc)
   * @returns {Promise<{success, eaPath, configPath, ...}>}
   */
  installEA: (terminalId, config) =>
    ipcRenderer.invoke('install-ea', terminalId, config),

  /**
   * Pre-reservar una terminal antes de instalar el EA
   * Genera un ID único y marca la terminal como reservada en el backend
   * @param {string} terminalId - ID del terminal
   * @param {string} userEmail - Email del usuario
   * @returns {Promise<{success, id, installationId, status, ...}>}
   */
  reserveInstallation: (terminalId, userEmail) =>
    ipcRenderer.invoke('reserve-installation', terminalId, userEmail),

  /**
   * Liberar una reserva de instalación
   * @param {string} installationId
   * @param {string} userEmail
   * @param {string|null} reason
   * @returns {Promise<{success, ...}>}
   */
  unreserveInstallation: (installationId, userEmail, reason = null) =>
    ipcRenderer.invoke('unreserve-installation', installationId, userEmail, reason),

  /**
   * Desinstalar EA de una terminal
   * @param {string} terminalId - ID del terminal
   * @returns {Promise<{success, filesRemoved, ...}>}
   */
  uninstallEA: (terminalId) =>
    ipcRenderer.invoke('uninstall-ea', terminalId),

  /**
   * Instalación manual: seleccionar carpeta
   * @returns {Promise<{filePath}>}
   */
  selectFolder: () =>
    ipcRenderer.invoke('select-folder'),

  /**
   * Instalar EA en ruta seleccionada manualmente
   * @param {string} folderPath - Ruta seleccionada
   * @param {object} config - Configuración (email, etc)
   * @returns {Promise<{success, ...}>}
   */
  installEAManual: (folderPath, config) =>
    ipcRenderer.invoke('install-ea-manual', folderPath, config),

  /**
   * Abrir carpeta de terminal en el explorador
   * @param {string} terminalPath - Ruta de la terminal
   * @returns {Promise<{success, ...}>}
   */
  openTerminalFolder: (terminalPath) =>
    ipcRenderer.invoke('open-terminal-folder', terminalPath),

  // ========== CONFIGURACIÓN ==========

  /**
   * Obtener estado de administrador (Windows)
   * @returns {Promise<{success, isAdmin}>}
   */
  getAdminStatus: () =>
    ipcRenderer.invoke('get-admin-status'),

  /**
   * Obtener configuración global
   * @returns {Promise<object>} - Config object
   */
  getConfig: () =>
    ipcRenderer.invoke('get-config'),

  /**
   * Establecer email del usuario
   * @param {string} email - Email a guardar
   * @returns {Promise<{success, ...}>}
   */
  setEmail: (email) =>
    ipcRenderer.invoke('set-email', email),

  /**
   * Registrar o validar email
   * @param {string} email - Email a registrar
   * @returns {Promise<{success, isNew, ...}>}
   */
  registerOrValidateEmail: (email) =>
    ipcRenderer.invoke('register-or-validate-email', email),

  // ========== CONECTIVIDAD ==========

  /**
   * Verificar conectividad con Worker
   * @returns {Promise<{success, status, ...}>}
   */
  checkConnectivity: () =>
    ipcRenderer.invoke('test-connectivity'),

  /**
   * Validar email (legacy)
   * @deprecated Usar registerOrValidateEmail
   */
  validateEmail: (email) =>
    ipcRenderer.invoke('validate-email', email),

  // ========== EVENT LISTENERS ==========

  /**
   * Escuchar progreso de instalación
   * @param {function} callback - Callback(data)
   * @returns {function} - Unsubscribe function
   */
  onInstallProgress: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('install-progress', listener);
    // Retornar función para unsubscribe
    return () => ipcRenderer.removeListener('install-progress', listener);
  },

  /**
   * Escuchar cambios en estado de logs
   * @param {function} callback - Callback(logEntry)
   * @returns {function} - Unsubscribe function
   */
  onLogEntry: (callback) => {
    const listener = (_, entry) => callback(entry);
    ipcRenderer.on('log-entry', listener);
    return () => ipcRenderer.removeListener('log-entry', listener);
  },

  /**
   * Escuchar cambios en estado de conectividad
   * @param {function} callback - Callback(status)
   * @returns {function} - Unsubscribe function
   */
  onConnectivityChange: (callback) => {
    const listener = (_, status) => callback(status);
    ipcRenderer.on('connectivity-change', listener);
    return () => ipcRenderer.removeListener('connectivity-change', listener);
  }
});
