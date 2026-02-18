/**
 * ConfigManager Service
 * 
 * Gestiona la configuración de la aplicación almacenada en:
 * ~/.tfx-sync/config.json
 * 
 * Estructura del config:
 * {
 *   installationId: "inst_xxxxx",
 *   installationDate: "2025-11-18T...",
 *   version: "1.0.0",
 *   userEmail: "user@example.com" (opcional),
 *   lastSync: "2025-11-18T..." (opcional)
 * }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const logger = require('./Logger');

class ConfigManager {
  constructor() {
    this.configDir = path.join(os.homedir(), '.tfx-sync');
    this.configFile = path.join(this.configDir, 'config.json');
    this.config = null;
    this.ensureConfigDir();
    this.load();
  }

  /**
   * Asegurar que la carpeta de config existe
   */
  ensureConfigDir() {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
        logger.info('Carpeta de configuración creada', { path: this.configDir });
      }
    } catch (err) {
      logger.error('Error creando carpeta de config', { error: err.message });
      throw err;
    }
  }

  /**
   * Cargar configuración del archivo
   * Si no existe, crear una nueva
   */
  load() {
    try {
      if (fs.existsSync(this.configFile)) {
        const content = fs.readFileSync(this.configFile, 'utf8');
        this.config = JSON.parse(content);
        logger.debug('Configuración cargada', { 
          hasEmail: !!this.config.userEmail,
          installationId: this.config.installationId
        });
      } else {
        // Primera instalación - crear config nueva
        this.config = {
          installationId: `inst_${uuidv4()}`,
          installationDate: new Date().toISOString(),
          version: '1.0.0',
          userEmail: null
        };
        this.save();
        logger.info('Nueva configuración creada', { 
          installationId: this.config.installationId 
        });
      }
    } catch (err) {
      logger.error('Error cargando configuración', { error: err.message });
      throw err;
    }
  }

  /**
   * Guardar configuración al archivo
   */
  save() {
    try {
      // Crear backup del anterior (opcional)
      if (fs.existsSync(this.configFile)) {
        const backupFile = this.configFile + '.backup';
        fs.copyFileSync(this.configFile, backupFile);
      }

      // Guardar en formato JSON con indentación
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf8');
      logger.debug('Configuración guardada');
    } catch (err) {
      logger.error('Error guardando configuración', { error: err.message });
      throw err;
    }
  }

  /**
   * Obtener ID de instalación (único por máquina)
   */
  getInstallationId() {
    if (!this.config || !this.config.installationId) {
      throw new Error('Installation ID no disponible');
    }
    return this.config.installationId;
  }

  /**
   * Obtener email del usuario
   */
  getUserEmail() {
    return this.config?.userEmail || null;
  }

  /**
   * Establecer email del usuario
   */
  setUserEmail(email) {
    if (!email || typeof email !== 'string') {
      throw new Error('Email inválido');
    }

    const trimmedEmail = email.trim().toLowerCase();
    
    // Validación básica de formato
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      throw new Error('Formato de email inválido');
    }

    this.config.userEmail = trimmedEmail;
    this.save();
    logger.success('Email configurado', { email: trimmedEmail });
    return trimmedEmail;
  }

  /**
   * Obtener configuración completa
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * Actualizar múltiples campos
   */
  update(updates = {}) {
    try {
      Object.assign(this.config, updates);
      this.save();
      logger.debug('Configuración actualizada', { fields: Object.keys(updates) });
    } catch (err) {
      logger.error('Error actualizando configuración', { error: err.message });
      throw err;
    }
  }

  /**
   * Resetear configuración (mantener installationId)
   */
  reset() {
    const installationId = this.config?.installationId || `inst_${uuidv4()}`;
    
    this.config = {
      installationId,
      installationDate: this.config?.installationDate || new Date().toISOString(),
      version: '1.0.0',
      userEmail: null
    };
    
    this.save();
    logger.warn('Configuración reseteada');
  }
}

// Exportar como singleton
module.exports = new ConfigManager();
