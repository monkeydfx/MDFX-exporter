/**
 * TerminalIDGenerator - Generación de IDs únicos para terminales
 * 
 * Cuando no se pueda obtener el número de cuenta, genera un UID único
 * basado en características de la terminal (ruta, MQL version, etc.)
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const logger = require('../services/Logger');

class TerminalIDGenerator {
  /**
   * Genera un ID de terminal IDÉNTICO a como lo calcula el EA en MQL5
   * El EA usa: StringToUpperMQL5(StringSubstr(terminalPath, pathLen - 32, 32))
   * Esto toma los últimos 32 caracteres de la ruta y los convierte a mayúsculas
   * 
   * @param {string} terminalPath - Ruta completa de la terminal
   * @returns {string} - ID de terminal en formato usado por el EA
   */
  generateEATerminalID(terminalPath) {
    try {
      // Tomar los últimos 32 caracteres de la ruta y convertir a mayúsculas
      // Esto coincide exactamente con cómo el EA lo calcula
      const pathLength = terminalPath.length;
      let terminalID = '';
      
      if (pathLength >= 32) {
        terminalID = terminalPath.substring(pathLength - 32, pathLength).toUpperCase();
      } else {
        terminalID = terminalPath.toUpperCase();
      }
      
      logger.debug(`[TerminalIDGenerator] Terminal ID (EA algorithm):`, {
        path: terminalPath,
        pathLength: pathLength,
        lastChars: pathLength >= 32 ? terminalPath.substring(pathLength - 32) : terminalPath,
        terminalID: terminalID
      });
      
      return terminalID;
    } catch (err) {
      logger.error(`[TerminalIDGenerator] Error generando Terminal ID`, { error: err.message });
      throw err;
    }
  }

  /**
   * Genera un UID único para una terminal (fallback si no hay cuenta)
   * @param {string} terminalPath - Ruta completa de la terminal
   * @param {string} type - MT4 o MT5
   * @param {string} broker - Nombre del broker
   * @returns {string} - UID en formato DataBridge_MT4_XXXXXXXX o similar
   */
  generateTerminalUID(terminalPath, type, broker) {
    try {
      // Crear hash basado en: ruta + tipo + broker
      const hashInput = `${terminalPath}|${type}|${broker}`;
      const hash = crypto
        .createHash('sha256')
        .update(hashInput)
        .digest('hex')
        .substring(0, 16) // Tomar primeros 16 caracteres
        .toUpperCase();

      const uid = `UID_${hash}`;
      logger.info(`[TerminalIDGenerator] UID generado: ${uid}`, {
        terminalPath,
        type,
        broker
      });

      return uid;
    } catch (err) {
      logger.error(`[TerminalIDGenerator] Error generando UID`, { error: err.message });
      throw err;
    }
  }

  /**
   * Intenta extraer un UID de la terminal si existe un archivo anterior
   * @param {string} terminalPath - Ruta de la terminal
   * @param {string} type - Tipo de terminal (MT4 o MT5)
   * @returns {string|null} - UID encontrado o null
   */
  tryExtractExistingUID(terminalPath, type = 'MT5') {
    try {
      // Buscar archivos de configuración anteriores de DataBridge
      const mqlFolder = type === 'MT4' ? 'MQL4' : 'MQL5';
      const configDir = path.join(terminalPath, mqlFolder, 'Experts', 'DataBridge');
      const configFile = path.join(configDir, 'config.ini');

      if (fs.existsSync(configFile)) {
        const content = fs.readFileSync(configFile, 'utf8');
        const uidMatch = content.match(/uid\s*=\s*([A-Za-z0-9_]+)/i);
        
        if (uidMatch) {
          logger.debug(`[TerminalIDGenerator] UID existente encontrado: ${uidMatch[1]}`);
          return uidMatch[1];
        }
      }

      return null;
    } catch (err) {
      logger.debug(`[TerminalIDGenerator] Error extrayendo UID existente`, { error: err.message });
      return null;
    }
  }

  /**
   * Genera un identificador más legible cuando se tiene información parcial
   * @param {string} account - Número de cuenta (si existe)
   * @param {string} type - MT4 o MT5
   * @param {string} broker - Nombre del broker
   * @param {string} fallbackUID - UID de fallback si no hay cuenta
   * @returns {string} - Identificador para el nombre del archivo
   */
  generateConfigName(account, type, broker, fallbackUID) {
    try {
      const mtVersion = type === 'MT4' ? 'MT4' : 'MT5';

      // Si tenemos cuenta válida (8+ dígitos)
      if (account && account !== 'N/A' && /^\d{8,}$/.test(account)) {
        const name = `DataBridge_${mtVersion}_${account}_config`;
        logger.debug(`[TerminalIDGenerator] Config name con cuenta: ${name}`);
        return name;
      }

      // Si tenemos broker
      if (broker && broker !== 'N/A') {
        const name = `DataBridge_${mtVersion}_${broker}_${fallbackUID}_config`;
        logger.debug(`[TerminalIDGenerator] Config name con broker: ${name}`);
        return name;
      }

      // Fallback: solo UID
      const name = `DataBridge_${mtVersion}_${fallbackUID}_config`;
      logger.debug(`[TerminalIDGenerator] Config name fallback: ${name}`);
      return name;

    } catch (err) {
      logger.error(`[TerminalIDGenerator] Error generando config name`, { error: err.message });
      throw err;
    }
  }
}

module.exports = new TerminalIDGenerator();
