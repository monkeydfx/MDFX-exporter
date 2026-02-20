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
      // macOS: Applications y Library
      paths.push(path.join('/Applications', 'MetaTrader 4'));
      paths.push(path.join('/Applications', 'MetaTrader 5'));
      paths.push(path.join(this.homeDir, 'Library', 'Application Support', 'MetaTrader 4'));
      paths.push(path.join(this.homeDir, 'Library', 'Application Support', 'MetaTrader 5'));
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
      // En Mac, MetaTrader almacena datos en:
      // ~/Library/Application Support/MetaTrader 5/Terminal/Common/Files
      const supportPath = path.join(this.homeDir, 'Library', 'Application Support');
      
      if (type === 'MT4') {
        return path.join(supportPath, 'MetaTrader 4', 'Terminal', 'Common', 'Files');
      } else {
        return path.join(supportPath, 'MetaTrader 5', 'Terminal', 'Common', 'Files');
      }
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
