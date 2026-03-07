/**
 * PlatformPathManager Service
 * 
 * Gestiona rutas multiplataforma (Windows, macOS, Linux) para:
 * - Búsqueda de terminales MetaTrader
 * - Almacenamiento de configuraciones
 * - Directorios de datos
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

class PlatformPathManager {
  constructor() {
    this.platform = process.platform; // 'win32', 'darwin', 'linux'
    this.homeDir = os.homedir();
  }

  /**
   * Obtiene las rutas de búsqueda para terminales MetaTrader según el SO
   */
  getTerminalSearchPaths() {
    const paths = [];

    if (this.isWindows()) {
      // Windows: APPDATA y Program Files
      const appData = process.env.APPDATA;
      const programFiles = process.env['ProgramFiles'];
      const programFilesX86 = process.env['ProgramFiles(x86)'];

      if (appData) {
        paths.push(path.join(appData, 'MetaQuotes', 'Terminal'));
        paths.push(path.join(appData, 'MetaQuotes'));
      }

      if (programFiles) {
        paths.push(path.join(programFiles, 'MetaTrader 4'));
        paths.push(path.join(programFiles, 'MetaTrader 5'));
      }

      if (programFilesX86) {
        paths.push(path.join(programFilesX86, 'MetaTrader 4'));
        paths.push(path.join(programFilesX86, 'MetaTrader 5'));
      }
    } else if (this.isMac()) {
      const supportPath = path.join(this.homeDir, 'Library', 'Application Support');
      const macUsername = os.userInfo().username;

      // ─── MT5 Instalador oficial MetaQuotes (Wine) ────────────────────────────
      // La carpeta de DATOS (MQL5, config...) vive en AppData del Wine prefix.
      // Ruta oficial: ~/Library/Application Support/net.metaquotes.wine.metatrader5/
      const mt5PrefixDriveC = path.join(supportPath, 'net.metaquotes.wine.metatrader5', 'drive_c');
      for (const wineUser of [macUsername, 'user']) {
        paths.push(path.join(mt5PrefixDriveC, 'users', wineUser, 'AppData', 'Roaming', 'MetaQuotes', 'Terminal'));
      }
      // Instalación directa en Program Files (dentro del Wine prefix)
      paths.push(path.join(mt5PrefixDriveC, 'Program Files'));

      // ─── MT4 Instalador oficial MetaQuotes (Wine, descontinuado) ────────────
      const mt4PrefixDriveC = path.join(supportPath, 'net.metaquotes.wine.metatrader4', 'drive_c');
      for (const wineUser of [macUsername, 'user']) {
        paths.push(path.join(mt4PrefixDriveC, 'users', wineUser, 'AppData', 'Roaming', 'MetaQuotes', 'Terminal'));
      }
      paths.push(path.join(mt4PrefixDriveC, 'Program Files'));

      // ─── CrossOver ──────────────────────────────────────────────────────────
      // CrossOver guarda los bottles en ~/Library/Application Support/CrossOver/Bottles/
      const crossoverBottlesPath = path.join(supportPath, 'CrossOver', 'Bottles');
      if (fs.existsSync(crossoverBottlesPath)) {
        try {
          const bottles = fs.readdirSync(crossoverBottlesPath, { withFileTypes: true });
          for (const bottle of bottles) {
            if (!bottle.isDirectory()) continue;
            const bottleDriveC = path.join(crossoverBottlesPath, bottle.name, 'drive_c');
            paths.push(path.join(bottleDriveC, 'Program Files'));
            for (const wineUser of [macUsername, 'user']) {
              paths.push(path.join(bottleDriveC, 'users', wineUser, 'AppData', 'Roaming', 'MetaQuotes', 'Terminal'));
            }
          }
        } catch (_) {
          // CrossOver no instalado o sin permisos
        }
      }

      // ─── PlayOnMac ──────────────────────────────────────────────────────────
      const pomPrefixPath = path.join(this.homeDir, 'Library', 'PlayOnMac', 'wineprefix');
      if (fs.existsSync(pomPrefixPath)) {
        try {
          const prefixes = fs.readdirSync(pomPrefixPath, { withFileTypes: true });
          for (const prefix of prefixes) {
            if (!prefix.isDirectory()) continue;
            const prefixDriveC = path.join(pomPrefixPath, prefix.name, 'drive_c');
            paths.push(path.join(prefixDriveC, 'Program Files'));
            for (const wineUser of [macUsername, 'user']) {
              paths.push(path.join(prefixDriveC, 'users', wineUser, 'AppData', 'Roaming', 'MetaQuotes', 'Terminal'));
            }
          }
        } catch (_) {
          // PlayOnMac no instalado
        }
      }

      // ─── Rutas legacy / fallback (instalaciones antiguas pre-Wine 8.0.1) ─────
      paths.push(path.join(supportPath, 'MetaTrader 5'));
      paths.push(path.join(supportPath, 'MetaTrader 4'));
      paths.push('/Applications');
    } else if (this.isLinux()) {
      // Linux: home directory y opt
      paths.push(path.join(this.homeDir, '.metatrader4'));
      paths.push(path.join(this.homeDir, '.metatrader5'));
      paths.push(path.join('/opt', 'MetaTrader4'));
      paths.push(path.join('/opt', 'MetaTrader5'));
    }

    return paths;
  }

  /**
   * Obtiene la ruta de configuración global (donde se almacenan los config.ini de los EAs)
   */
  getCommonFilesPath(terminalDataPath, type = 'MT5') {
    if (this.isWindows()) {
      return path.join(
        this.homeDir,
        'AppData',
        'Roaming',
        'MetaQuotes',
        'Terminal',
        'Common',
        'Files'
      );
    } else if (this.isMac()) {
      // Si tenemos el dataPath del terminal, derivamos el Common path de él.
      // Esto funciona para cualquier Wine prefix (oficial, CrossOver, PlayOnMac).
      if (terminalDataPath) {
        // Caso A: el terminal vive dentro de .../MetaQuotes/Terminal/[hash]
        // → Common está en .../MetaQuotes/Terminal/Common/Files
        const terminalDir = this._findMetaQuotesTerminalDir(terminalDataPath);
        if (terminalDir) {
          return path.join(terminalDir, 'Common', 'Files');
        }

        // Caso B: el terminal está en Program Files dentro de un Wine prefix
        // → derivamos AppData desde drive_c
        const driveCMatch = terminalDataPath.match(/(.*[\/\\]drive_c)/i);
        if (driveCMatch) {
          const driveC = driveCMatch[1];
          const wineUser = this._getMacWineUsername(driveC);
          return path.join(driveC, 'users', wineUser, 'AppData', 'Roaming', 'MetaQuotes', 'Terminal', 'Common', 'Files');
        }
      }

      // Fallback: usar el Wine prefix oficial de MetaQuotes
      const supportPath = path.join(this.homeDir, 'Library', 'Application Support');
      const macUsername = os.userInfo().username;
      const prefixName = type === 'MT4'
        ? 'net.metaquotes.wine.metatrader4'
        : 'net.metaquotes.wine.metatrader5';
      return path.join(
        supportPath, prefixName, 'drive_c',
        'users', macUsername, 'AppData', 'Roaming', 'MetaQuotes', 'Terminal', 'Common', 'Files'
      );
    } else if (this.isLinux()) {
      // Linux: ~/.metatrader5/Terminal/Common/Files
      if (type === 'MT4') {
        return path.join(this.homeDir, '.metatrader4', 'Terminal', 'Common', 'Files');
      } else {
        return path.join(this.homeDir, '.metatrader5', 'Terminal', 'Common', 'Files');
      }
    }
  }

  /**
   * Obtiene la ruta donde se almacenan los datos de configuración de TFX-Sync
   */
  getAppConfigPath() {
    const configDir = path.join(this.homeDir, '.tfx-sync');
    return configDir;
  }

  /**
   * Obtiene la ruta completa de un archivo de configuración de EA
   */
  getEAConfigPath(type, terminalId, accountNumber = null) {
    const filename = this.getEAConfigFileName(type, terminalId, accountNumber);
    const commonPath = this.getCommonFilesPath(null, type);
    return path.join(commonPath, filename);
  }

  /**
   * Obtiene el nombre del archivo de configuración según plataforma
   */
  getEAConfigFileName(type, terminalId, accountNumber = null) {
    if (accountNumber) {
      return `DataBridge_${type}_${terminalId}_${accountNumber}_config.ini`;
    } else {
      return `DataBridge_${type}_${terminalId}_config.ini`;
    }
  }

  /**
   * Dado un path dentro de un Wine prefix, encuentra el directorio
   * .../MetaQuotes/Terminal (padre de los hash-folders de terminal).
   * Devuelve null si no se puede determinar.
   * @private
   */
  _findMetaQuotesTerminalDir(terminalPath) {
    if (!terminalPath) return null;
    const normalized = terminalPath.replace(/\\/g, '/');
    // Buscar el segmento /MetaQuotes/Terminal en la ruta
    const marker = '/MetaQuotes/Terminal';
    const idx = normalized.indexOf(marker);
    if (idx === -1) return null;
    // Reconstruimos con los separadores originales del OS
    const rawSub = terminalPath.substring(0, idx);
    return rawSub + path.sep + path.join('MetaQuotes', 'Terminal');
  }

  /**
   * Dado el path de drive_c de un Wine prefix, detecta el nombre de usuario
   * real que se usó dentro de ese prefix.
   * @private
   */
  _getMacWineUsername(driveC) {
    const macUsername = os.userInfo().username;
    const usersPath = path.join(driveC, 'users');
    if (!fs.existsSync(usersPath)) return macUsername;
    try {
      const systemFolders = new Set(['Public', 'All Users', 'Default', 'Default User']);
      const users = fs.readdirSync(usersPath, { withFileTypes: true })
        .filter(e => e.isDirectory() && !systemFolders.has(e.name))
        .map(e => e.name);
      if (users.includes(macUsername)) return macUsername;
      if (users.includes('user')) return 'user';
      if (users.length > 0) return users[0];
    } catch (_) {
      // sin permisos o directorio vacío
    }
    return macUsername;
  }

  /**
   * Verifica si el SO es Windows
   */
  isWindows() {
    return this.platform === 'win32';
  }

  /**
   * Verifica si el SO es macOS
   */
  isMac() {
    return this.platform === 'darwin';
  }

  /**
   * Verifica si el SO es Linux
   */
  isLinux() {
    return this.platform === 'linux';
  }

  /**
   * Obtiene el nombre del SO en formato legible
   */
  getPlatformName() {
    if (this.isWindows()) return 'Windows';
    if (this.isMac()) return 'macOS';
    if (this.isLinux()) return 'Linux';
    return 'Unknown';
  }

  /**
   * Obtiene información de rutas para logging/debug
   */
  getPathInfo() {
    return {
      platform: this.getPlatformName(),
      homeDir: this.homeDir,
      searchPaths: this.getTerminalSearchPaths(),
      appConfigPath: this.getAppConfigPath(),
      commonFilesPath: this.getCommonFilesPath(null, 'MT5')
    };
  }
}

// Singleton
let instance = null;

function getPlatformPathManager() {
  if (!instance) {
    instance = new PlatformPathManager();
  }
  return instance;
}

module.exports = getPlatformPathManager();
