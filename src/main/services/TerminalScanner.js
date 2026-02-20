/**
 * TerminalScanner Service - VERSIÓN MEJORADA v2.0
 * 
 * ✓ Detección automática de codificaciones
 * ✓ Búsqueda en múltiples ubicaciones (APPDATA, Program Files, Program Files x86)
 * ✓ Extracción robusta de cuentas en múltiples secciones
 * ✓ Generación de UID como fallback
 * ✓ Logs detallados con rutas completas
 */

const fs = require('fs');
const path = require('path');
const Terminal = require('../models/Terminal');
const logger = require('./Logger');
const EncodingDetector = require('../utils/EncodingDetector');
const TerminalIDGenerator = require('../utils/TerminalIDGenerator');
const PlatformPathManager = require('./PlatformPathManager');

class TerminalScanner {
  constructor() {
    this.searchPaths = this.initializeSearchPaths();
    this.foundTerminals = new Set();
  }

  /**
   * Inicializa las rutas de búsqueda según la plataforma (Windows, macOS, Linux)
   * @returns {array} - Array de rutas a buscar
   */
  initializeSearchPaths() {
    return PlatformPathManager.getTerminalSearchPaths();
  }

  async scanTerminals() {
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('🔍 INICIANDO ESCANEO DE TERMINALES (v2.0)');
    logger.info('═══════════════════════════════════════════════════════════');
    
    const terminals = [];
    this.foundTerminals.clear();

    logger.info(`📂 Rutas de búsqueda configuradas:`);
    this.searchPaths.forEach((p, i) => {
      logger.info(`   ${i + 1}. ${p}`);
    });
    logger.info('');

    try {
      // Buscar en todas las rutas configuradas
      for (const searchPath of this.searchPaths) {
        if (!fs.existsSync(searchPath)) {
          logger.warn(`⚠️  Ruta no existe: ${searchPath}`);
          continue;
        }

        logger.debug(`🔎 Buscando en: ${searchPath}`);
        await this.scanDirectory(searchPath, terminals);
      }

      // Log de resumen
      logger.info('');
      logger.info('═══════════════════════════════════════════════════════════');
      logger.success(`✓ ESCANEO COMPLETADO: ${terminals.length} terminal(es) encontrada(s)`);
      logger.info('═══════════════════════════════════════════════════════════');
      
      if (terminals.length === 0) {
        logger.warn('⚠️  No se encontraron terminales MT4/MT5');
      } else {
        terminals.forEach((t, idx) => {
          logger.info(`\n[Terminal ${idx + 1}]`);
          logger.info(`  Nombre: ${t.name}`);
          logger.info(`  Tipo: ${t.type}`);
          logger.info(`  Ruta: ${t.dataPath}`);
          logger.info(`  Broker: ${t.broker}`);
          logger.info(`  Cuenta: ${t.account}`);
          logger.info(`  Servidor: ${t.server}`);
          logger.info(`  EA Instalado: ${t.installed ? '✓' : '✗'}`);
        });
      }
      logger.info('');

      return terminals;
    } catch (err) {
      logger.error('❌ Error durante escaneo de terminales', { error: err.message });
      throw err;
    }
  }

  /**
   * Escanea recursivamente un directorio
   * @param {string} dirPath - Ruta del directorio
   * @param {array} terminals - Array de terminales encontradas
   */
  async scanDirectory(dirPath, terminals) {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const fullPath = path.join(dirPath, entry.name);

        // Detectar si es una terminal MT4/MT5
        const terminalType = this.detectTerminalType(fullPath);
        
        if (terminalType) {
          if (!this.foundTerminals.has(fullPath)) {
            logger.debug(`\n✓ Terminal ${terminalType} detectada en: ${fullPath}`);
            this.foundTerminals.add(fullPath);

            try {
              const terminal = await this.getTerminalInfo(fullPath, terminalType);
              if (terminal) {
                terminal.validate();
                terminals.push(terminal);
              }
            } catch (err) {
              logger.warn(`⚠️  Error procesando terminal en ${fullPath}`, {
                error: err.message
              });
            }
          }
        }

        // Búsqueda recursiva (máximo 2 niveles)
        const depth = fullPath.split(path.sep).length;
        if (depth < 20) {
          try {
            await this.scanDirectory(fullPath, terminals);
          } catch (err) {
            logger.debug(`Error en búsqueda recursiva en ${fullPath}`, { error: err.message });
          }
        }
      }
    } catch (err) {
      logger.debug(`Error leyendo directorio ${dirPath}`, { error: err.message });
    }
  }

  /**
   * Detecta si un directorio contiene una terminal MT4 o MT5
   * @param {string} terminalPath - Ruta a verificar
   * @returns {string|null} - 'MT4', 'MT5', o null
   */
  detectTerminalType(terminalPath) {
    try {
      const dirName = path.basename(terminalPath).toLowerCase();
      
      // ✅ MEJORA: Detectar también por nombre del directorio
      if (dirName.includes('metatrader 5') || dirName.includes('metatrader5')) {
        return 'MT5';
      }
      if (dirName.includes('metatrader 4') || dirName.includes('metatrader4')) {
        return 'MT4';
      }

      // También buscar por carpetas internas
      const hasMQL4 = fs.existsSync(path.join(terminalPath, 'MQL4'));
      const hasMQL5 = fs.existsSync(path.join(terminalPath, 'MQL5'));
      const hasTerminal = fs.existsSync(path.join(terminalPath, 'terminal.exe')) ||
                          fs.existsSync(path.join(terminalPath, 'terminal64.exe'));

      // Si tiene MQL5 o terminal64, es MT5
      if (hasMQL5 || (hasTerminal && !hasMQL4)) return 'MT5';
      if (hasMQL4) return 'MT4';
      
      return null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Extrae información completa de una terminal
   * Implementa detección robusta de cuenta con manejo de codificaciones
   */
  async getTerminalInfo(terminalPath, type) {
    logger.debug(`\n📋 Extrayendo información de terminal ${type}`);
    logger.debug(`   Ruta: ${terminalPath}`);

    let account = 'N/A';
    let server = 'N/A';
    let broker = 'N/A';
    let displayName = 'Terminal';
    const accountSources = [];

    try {
      // 🔑 PASO CRÍTICO: Detectar si es MT4 o MT5 y aplicar lógica correspondiente
      logger.debug('   [CRÍTICO] Detectando tipo de terminal (MT4 vs MT5)...');
      
      // ✅ MEJORA: Si está en Program Files, buscar datos en AppData
      let dataPath = terminalPath;
      const isInProgramFiles = terminalPath.includes('Program Files');
      if (isInProgramFiles) {
        logger.debug('   → Terminal detectada en Program Files, buscando datos en AppData...');
        const appDataPath = path.join(process.env.APPDATA, 'MetaQuotes', 'Terminal');
        if (fs.existsSync(appDataPath)) {
          dataPath = appDataPath;
          logger.debug(`   → Usando ruta de datos: ${dataPath}`);
        }
      }
      
      const commonPath = path.join(dataPath, 'config', 'common.ini');
      let isMT5 = false;
      
      // Detectar MT5: Buscar carpeta /MQL5 o archivo con estructura UTF-16
      if (fs.existsSync(path.join(terminalPath, 'MQL5'))) {
        isMT5 = true;
        logger.debug('   → Detectado: MT5 (carpeta MQL5 encontrada)');
      } else if (fs.existsSync(commonPath)) {
        const buffer = fs.readFileSync(commonPath);
        if (buffer.length > 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
          isMT5 = true;
          logger.debug('   → Detectado: MT5 (BOM UTF-16 LE encontrado)');
        } else {
          logger.debug('   → Detectado: MT4 (archivo ANSI/UTF-8)');
        }
      } else {
        logger.debug('   → No se pudo detectar, asumiendo MT5');
        isMT5 = true;
      }

      // ═══════════════════════════════════════════════════════════
      // LÓGICA MT5: Buscar ÚLTIMA sección [Common]
      // ═══════════════════════════════════════════════════════════
      if (isMT5) {
        logger.debug('   [MT5] Leyendo common.ini - buscando ÚLTIMA sección [Common]...');
        
        if (fs.existsSync(commonPath)) {
          try {
            const buffer = fs.readFileSync(commonPath);
            let content = '';
            
            // UTF-16 LE
            if (buffer.length > 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
              content = buffer.toString('utf16le');
            } else {
              content = buffer.toString('utf8');
            }

            // Buscar TODAS las secciones [Common] y usar LA ÚLTIMA
            const commonMatches = [...content.matchAll(/\[Common\]([\s\S]*?)(?=\[|$)/gi)];
            
            if (commonMatches.length > 0) {
              const lastCommonSection = commonMatches[commonMatches.length - 1][1];
              logger.debug(`        → ${commonMatches.length} sección(es) [Common] encontrada(s), usando LA ÚLTIMA`);
              
              // Extraer Server
              const serverMatch = lastCommonSection.match(/Server\s*=\s*([^\r\n]+)/i);
              if (serverMatch) {
                server = serverMatch[1].trim();
                broker = this.extractBroker(server);
                logger.debug(`        ✅ Servidor (MT5): ${server} → Broker: ${broker}`);
              }
              
              // Extraer Login
              const loginMatch = lastCommonSection.match(/Login\s*=\s*(\d+)/i);
              if (loginMatch && loginMatch[1].length >= 8) {
                account = loginMatch[1];
                logger.debug(`        ✅ Cuenta (MT5): ${account}`);
              }
            }
          } catch (err) {
            logger.warn(`        ⚠️  Error leyendo common.ini (MT5)`, { error: err.message });
          }
        }
      } 
      // ═══════════════════════════════════════════════════════════
      // LÓGICA MT4: Usar búsqueda en profiles, carpetas, etc
      // ═══════════════════════════════════════════════════════════
      else {
        logger.debug('   [MT4] Usando lógica de búsqueda MT4...');
        
        // PASO 1: Leer terminal.ini (MT4)
        logger.debug('   [1/4] Leyendo terminal.ini...');
        const terminalIniPath = path.join(dataPath, 'config', 'terminal.ini');
        
        if (fs.existsSync(terminalIniPath)) {
          try {
            const content = EncodingDetector.readIniFile(terminalIniPath);
            logger.debug(`        ✓ terminal.ini leído`);

            // Nombre del terminal
            const nameMatch = content.match(/Name\s*=\s*([^\r\n]+)/i);
            if (nameMatch) {
              const rawName = nameMatch[1].trim();
              if (this.isValidTerminalName(rawName)) {
                displayName = rawName;
                logger.debug(`        → Nombre: ${displayName}`);
              }
            }

            // Intentar sacar cuenta del nombre
            const accountMatch = displayName.match(/^(\d+)/);
            if (account === 'N/A' && accountMatch && accountMatch[1].length >= 8) {
              account = accountMatch[1];
              logger.debug(`        → Cuenta del nombre: ${account}`);
            }

            // Buscar en Settings → LastBuildDataPath
            if (account === 'N/A') {
              const settingsMatch = content.match(/\[Settings\]([\s\S]*?)(?:\[|$)/i);
              if (settingsMatch) {
                const buildPathMatch = settingsMatch[1].match(/LastBuildDataPath\s*=\s*(\d+)/i);
                if (buildPathMatch && buildPathMatch[1].length >= 8) {
                  account = buildPathMatch[1];
                  logger.debug(`        → Cuenta en LastBuildDataPath: ${account}`);
                }
              }
            }
          } catch (err) {
            logger.warn(`        ⚠️  Error leyendo terminal.ini`, { error: err.message });
          }
        }

        // PASO 2: Leer common.ini (MT4 - ANSI)
        logger.debug('   [2/4] Leyendo common.ini...');
        const commonPathMT4 = path.join(dataPath, 'config', 'common.ini');
        
        if (fs.existsSync(commonPathMT4)) {
          try {
            const content = EncodingDetector.readIniFile(commonPathMT4);
            logger.debug(`        ✓ common.ini leído`);

            // Buscar Login
            if (account === 'N/A') {
              const loginMatch = content.match(/Login\s*=\s*(\d+)/i);
              if (loginMatch && loginMatch[1].length >= 8) {
                account = loginMatch[1];
                logger.debug(`        → Cuenta en Login: ${account}`);
              }
            }

            // Buscar Server
            if (server === 'N/A') {
              const serverMatch = content.match(/Server\s*=\s*([^\r\n]+)/i);
              if (serverMatch) {
                server = serverMatch[1].trim();
                broker = this.extractBroker(server);
                logger.debug(`        → Servidor: ${server} (Broker: ${broker})`);
              }
            }
          } catch (err) {
            logger.warn(`        ⚠️  Error leyendo common.ini`, { error: err.message });
          }
        }

        // PASO 3: Leer profiles.ini
        logger.debug('   [3/4] Leyendo profiles.ini...');
        const profilesPath = path.join(dataPath, 'config', 'profiles.ini');
        
        if (fs.existsSync(profilesPath)) {
          try {
            const content = EncodingDetector.readIniFile(profilesPath);
            logger.debug(`        ✓ profiles.ini leído`);

            if (server === 'N/A') {
              const serverMatch = content.match(/Server\s*=\s*([^\r\n]+)/i);
              if (serverMatch) {
                server = serverMatch[1].trim();
                broker = this.extractBroker(server);
                logger.debug(`        → Servidor en profiles.ini: ${server} (Broker: ${broker})`);
              }
            }

            if (account === 'N/A') {
              const loginMatch = content.match(/Login\s*=\s*(\d+)/i);
              if (loginMatch && loginMatch[1].length >= 8) {
                account = loginMatch[1];
                logger.debug(`        → Cuenta en profiles.ini: ${account}`);
              }
            }
          } catch (err) {
            logger.warn(`        ⚠️  Error leyendo profiles.ini`, { error: err.message });
          }
        }

        // PASO 4: Buscar en carpetas de bases
        logger.debug('   [4/4] Buscando en carpetas...');
        const basesPath = path.join(dataPath, 'bases');
        if (account === 'N/A' && fs.existsSync(basesPath)) {
          try {
            const folders = fs.readdirSync(basesPath, { withFileTypes: true });
            for (const folder of folders) {
              if (folder.isDirectory() && /^\d{8,}$/.test(folder.name)) {
                account = folder.name;
                logger.debug(`        → Cuenta en /bases: ${account}`);
                break;
              }
            }
          } catch (err) {
            logger.debug(`        ⚠️  Error leyendo /bases`);
          }
        }
      }

      // Continuar con los datos finales (common para MT4/MT5)
      let terminalUID = null;
      if (account === 'N/A') {
        logger.debug('   ⚠️  No se pudo detectar cuenta válida, generando UID...');
        terminalUID = TerminalIDGenerator.generateTerminalUID(terminalPath, type, broker);
        logger.debug(`   ✓ UID generado: ${terminalUID}`);
      }

      // Mejorar nombre de terminal - LÓGICA MEJORADA
      if (displayName === 'Terminal' || displayName === 'N/A') {
        if (account !== 'N/A') {
          // Si tenemos cuenta, usar: Broker - Cuenta
          displayName = `${broker !== 'N/A' && broker !== 'Unknown' ? broker + ' - ' : ''}${account}`;
        } else if (broker !== 'N/A' && broker !== 'Unknown') {
          // Si tenemos broker, usarlo
          displayName = broker;
        } else {
          // Si no tenemos nada, mostrar N/A (se mostrará ruta en la UI)
          displayName = 'N/A';
        }
      }

      // Verificar si EA está instalado
      const mqlFolder = type === 'MT4' ? 'MQL4' : 'MQL5';
      const expertsPath = path.join(terminalPath, mqlFolder, 'Experts');
      const eaExtension = type === 'MT4' ? 'ex4' : 'ex5';
      const eaPath = path.join(expertsPath, `DataBridge.${eaExtension}`);
      const installed = fs.existsSync(eaPath);

      // Log de resumen
      logger.info(`\n   ✓ Terminal procesada exitosamente`);
      logger.info(`     - Nombre: ${displayName}`);
      logger.info(`     - Tipo: ${type}`);
      logger.info(`     - Ruta: ${terminalPath}`);
      logger.info(`     - Broker: ${broker}`);
      logger.info(`     - Cuenta: ${account}${terminalUID ? ` (UID: ${terminalUID})` : ''}`);
      logger.info(`     - Servidor: ${server}`);
      if (accountSources.length > 0) {
        logger.info(`     - Fuentes: ${accountSources.join(', ')}`);
      }
      logger.info(`     - EA Instalado: ${installed ? '✓' : '✗'}`);

      const terminal = new Terminal({
        type,
        name: displayName,
        broker,
        account,
        server,
        dataPath: terminalPath,
        mqlFolder,
        installed,
        uid: terminalUID
      });

      return terminal;

    } catch (err) {
      logger.error(`❌ Error crítico procesando terminal en ${terminalPath}`, {
        error: err.message
      });
      throw err;
    }
  }

  /**
   * Valida que un nombre de terminal sea legítimo
   * Descarta basura como "M5 Horizontal Line 23443|color=9639167|style=1|value1=1.168570|"
   */
  isValidTerminalName(name) {
    if (!name || name === 'N/A' || name === 'Terminal') {
      return false;
    }

    // Descartar si contiene caracteres de configuración
    if (name.includes('|') || name.includes('=') || name.includes('[') || name.includes(']')) {
      return false;
    }

    // Descartar si parece ser datos de gráficos (contiene patterns típicos)
    if (name.match(/color|style|value|width|symbol|period/i)) {
      return false;
    }

    // Debe tener al menos 3 caracteres y ser razonable (< 100)
    if (name.length < 3 || name.length > 100) {
      return false;
    }

    return true;
  }

  /**
   * 🔄 scanSingleTerminal - REFRESCAR datos de UNA terminal
   * 
   * ⚠️ CRÍTICO para evitar cambios de broker/server/account sin detectar
   * 
   * El usuario puede:
   * 1. Hacer un scan inicial → Obtiene terminal FUNDINGPIPS2
   * 2. Cambiar en MT5 → Ahora está FTMO
   * 3. Sin este método → App sigue usando FUNDINGPIPS2 (ERROR)
   * 4. Con este método → Refrescamos y obtenemos FTMO (OK)
   */
  async scanSingleTerminal(terminalId) {
    logger.info(`🔄 REFRESCANDO terminal ${terminalId}...`);
    
    try {
      // PASO 1: Buscar todos los terminales
      const terminals = await this.scanTerminals();
      
      // PASO 2: Encontrar el específico
      const terminal = terminals.find(t => t.id === terminalId);
      
      if (!terminal) {
        logger.warn(`⚠️  Terminal no encontrado: ${terminalId}`);
        return null;
      }

      logger.success(`✓ Terminal refrescado`, {
        id: terminalId,
        broker: terminal.broker,
        server: terminal.server,
        account: terminal.account,
        installed: terminal.installed
      });

      return terminal;
    } catch (err) {
      logger.error(`❌ Error refrescando terminal ${terminalId}`, {
        error: err.message
      });
      return null;
    }
  }

  extractBroker(server) {
    if (!server) return 'Unknown';
    const serverWithoutPort = server.split(':')[0].trim();
    const parts = serverWithoutPort.split('-');
    if (parts.length > 0) {
      return parts[0].trim();
    }
    return serverWithoutPort.split('.')[0] || 'Unknown';
  }

  async findTerminal(terminalId) {
    const terminals = await this.scanTerminals();
    return terminals.find(t => t.id === terminalId) || null;
  }

  async findTerminalsByBroker(broker) {
    const terminals = await this.scanTerminals();
    return terminals.filter(t => t.broker === broker);
  }

  async getInstallationStatus() {
    const terminals = await this.scanTerminals();
    return {
      total: terminals.length,
      installed: terminals.filter(t => t.installed).length,
      notInstalled: terminals.filter(t => !t.installed).length,
      terminals
    };
  }
}

module.exports = TerminalScanner;