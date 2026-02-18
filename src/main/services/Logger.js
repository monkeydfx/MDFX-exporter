/**
 * Logger Service
 * 
 * Servicio centralizado de logging con múltiples niveles:
 * - DEBUG: Información de depuración detallada
 * - INFO: Información general de operaciones
 * - SUCCESS: Operaciones completadas exitosamente
 * - WARN: Advertencias (operación parcial o riesgos)
 * - ERROR: Errores críticos que requieren atención
 * 
 * Características:
 * - Escritura a archivos en ~/.tfx-sync/logs/
 * - Envío de eventos a renderer (IPC)
 * - Formato JSON para fácil parsing
 * - Timestamp automático
 * - Stack traces para errores
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class Logger {
  constructor() {
    this.logDir = path.join(os.homedir(), '.tfx-sync', 'logs');
    this.mainWindow = null;
    this.ensureLogDir();
  }

  sanitizeMessage(message) {
    if (!message || typeof message !== 'string') return message;
    const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;
    const instRegex = /inst_[a-z0-9-]+/ig;
    return message.replace(emailRegex, '[redacted-email]').replace(instRegex, 'inst_[redacted]');
  }

  sanitizeData(data) {
    const sensitiveKeys = new Set([
      'email',
      'userEmail',
      'installationId',
      'terminalPath',
      'folderPath',
      'account',
      'broker',
      'server',
      'username',
      'hostname',
      'token',
      'apiKey',
      'authorization',
      'password',
      'secret'
    ]);

    const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;
    const instRegex = /inst_[a-z0-9-]+/ig;

    const walk = (value) => {
      if (value === null || value === undefined) return value;
      if (Array.isArray(value)) return value.map(walk);
      if (typeof value === 'object') {
        const out = {};
        for (const [key, val] of Object.entries(value)) {
          if (sensitiveKeys.has(key)) {
            out[key] = '[redacted]';
          } else {
            out[key] = walk(val);
          }
        }
        return out;
      }
      if (typeof value === 'string') {
        return value.replace(emailRegex, '[redacted-email]').replace(instRegex, 'inst_[redacted]');
      }
      return value;
    };

    return walk(data);
  }

  /**
   * Asegurar que la carpeta de logs existe
   */
  ensureLogDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (err) {
      console.error(`[Logger] No se pudo crear carpeta de logs: ${err.message}`);
    }
  }

  /**
   * Obtener ruta del archivo de log actual (por fecha)
   */
  getLogFile() {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logDir, `${dateStr}.log`);
  }

  /**
   * Registrar entrada de log
   * @param {string} level - Nivel: DEBUG, INFO, SUCCESS, WARN, ERROR
   * @param {string} message - Mensaje principal
   * @param {object} data - Datos adicionales (opcional)
   */
  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const safeMessage = this.sanitizeMessage(message);
    const safeData = this.sanitizeData(data);

    const entry = {
      timestamp,
      level,
      message: safeMessage,
      ...safeData
    };

    // Escribir a archivo en formato JSON (una línea por entrada)
    try {
      const logFile = this.getLogFile();
      fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
    } catch (err) {
      console.error(`[Logger] Error escribiendo a archivo: ${err.message}`);
    }

    // Enviar a renderer si window está disponible
    try {
      if (this.mainWindow && this.mainWindow.webContents) {
        this.mainWindow.webContents.send('log-entry', entry);
      }
    } catch (err) {
      console.error(`[Logger] Error enviando log a renderer: ${err.message}`);
    }

    // Siempre loguear a console también
    this.logToConsole(level, safeMessage, safeData);
  }

  /**
   * Formatear y enviar a console
   */
  logToConsole(level, message, data) {
    const timestamp = new Date().toLocaleTimeString('es-ES');
    const prefix = `[${timestamp}] [${level}]`;
    const hasData = Object.keys(data).length > 0;

    if (hasData) {
      console.log(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }

  /**
   * Log nivel DEBUG
   */
  debug(message, data = {}) {
    this.log('DEBUG', message, data);
  }

  /**
   * Log nivel INFO
   */
  info(message, data = {}) {
    this.log('INFO', message, data);
  }

  /**
   * Log nivel SUCCESS
   */
  success(message, data = {}) {
    this.log('SUCCESS', message, data);
  }

  /**
   * Log nivel WARN
   */
  warn(message, data = {}) {
    this.log('WARN', message, data);
  }

  /**
   * Log nivel ERROR con stack trace
   */
  error(message, data = {}) {
    this.log('ERROR', message, data);
  }

  /**
   * Establecer referencia a mainWindow para IPC
   */
  setMainWindow(mainWindow) {
    this.mainWindow = mainWindow;
  }

  /**
   * Obtener logs del día actual como array
   * @returns {array} Array de objetos de log
   */
  getTodayLogs() {
    try {
      const logFile = this.getLogFile();
      if (!fs.existsSync(logFile)) {
        return [];
      }
      
      const content = fs.readFileSync(logFile, 'utf8');
      return content
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (err) {
            return null;
          }
        })
        .filter(entry => entry !== null);
    } catch (err) {
      console.error(`[Logger] Error leyendo logs: ${err.message}`);
      return [];
    }
  }

  /**
   * Limpiar logs antiguos (> 30 días)
   */
  cleanupOldLogs(daysToKeep = 30) {
    try {
      const files = fs.readdirSync(this.logDir);
      const now = Date.now();
      const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const stat = fs.statSync(filePath);
        if (now - stat.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          this.info(`Log antiguo eliminado: ${file}`);
        }
      });
    } catch (err) {
      this.warn(`Error limpiando logs antiguos: ${err.message}`);
    }
  }
}

// Exportar como singleton
module.exports = new Logger();
