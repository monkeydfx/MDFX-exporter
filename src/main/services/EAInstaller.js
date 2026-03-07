/**
 * EAInstaller Service
 * 
 * Gestiona la instalación y desinstalación de Expert Advisors en terminales MT4/MT5
 * Crea archivos de configuración específicos por plataforma
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { app, dialog } = require('electron');
const { execSync } = require('child_process');
const ConfigManager = require('./ConfigManager');
const PlatformPathManager = require('./PlatformPathManager');
const logger = require('./Logger');

class EAInstaller {
  constructor() {
    this.isDev = !app.isPackaged;
    this.assetsPath = this.isDev
      ? path.join(__dirname, '..', '..', 'assets', 'ea')
      : path.join(process.resourcesPath, 'ea');

    // Endpoint y configuración por defecto
    this.endpointUrl = 'https://trading-journal-preprod.monkeydfx-trader.workers.dev';
    this.sendInterval = 300;  // 🆕 5 minutos en lugar de 60 segundos (trades sync instantáneamente)
    
    logger.debug('EAInstaller inicializado', {
      isDev: this.isDev,
      assetsPath: this.assetsPath
    });
  }

  /**
   * Instalar EA en una terminal
   * FLUJO 4 de especificación
   */
  async install(terminal, config) {
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('FLUJO 4: INSTALACIÓN DEL EA - INICIANDO');
    logger.info('═══════════════════════════════════════════════════════════');

    try {
      // ================== PASO 1: VALIDACIÓN ==================
      this.validateInstallation(terminal, config);
      
      // ================== PASO 2: RUTAS ==================
      const paths = this.preparePaths(terminal);
      
      // ================== PASO 3: COPIAR EA ==================
      this.copyEA(terminal, paths);
      
      // ================== PASO 4: CONFIG COMMON ==================
      this.createCommonConfig(terminal, config, paths);
      
      // ================== PASO 5: BACKUPS ==================
      this.createBackups(terminal, config, paths);
      
      // ================== PASO 6: RETORNAR RESULTADO ==================
      // 🔧 Ya no necesitamos auto-confirmar aquí
      // El EA se auto-confirmará cuando se inicie (RegisterInstallation)
      
      logger.info('═══════════════════════════════════════════════════════════');
      logger.success('✓ INSTALACIÓN COMPLETADA EXITOSAMENTE');
      logger.info('═══════════════════════════════════════════════════════════');

      return {
        success: true,
        eaPath: paths.targetEAPath,
        configPath: paths.configPath,
        configFileName: paths.configFileName,
        message: this.getPostInstallMessage(terminal, this.endpointUrl)
      };
    } catch (err) {
      logger.error('✗ ERROR EN INSTALACIÓN', { 
        error: err.message,
        stack: err.stack 
      });
      throw err;
    }
  }

  /**
   * PASO 1: Validación de datos de entrada
   */
  validateInstallation(terminal, config) {
    logger.info('PASO 1: VALIDACIÓN');
    logger.debug('Validando terminal y config', { terminal, config });

    // Validar tipo de terminal
    if (!['MT4', 'MT5'].includes(terminal.type)) {
      const msg = `Tipo de terminal inválido: "${terminal.type}". Debe ser "MT4" o "MT5".`;
      logger.error(msg);
      throw new Error(msg);
    }
    logger.success(`✓ Tipo de terminal válido: ${terminal.type}`);

    // Validar email
    const userEmail = config?.userEmail;
    if (!userEmail) {
      const msg = 'Email de usuario no configurado';
      logger.error(msg);
      throw new Error(msg);
    }
    logger.success(`✓ Email configurado: ${userEmail}`);

    // Validar propiedades del terminal
    const requiredProps = ['dataPath', 'broker', 'account', 'server'];
    for (const prop of requiredProps) {
      if (!terminal[prop]) {
        const msg = `Terminal.${prop} es requerido`;
        logger.error(msg);
        throw new Error(msg);
      }
    }
    logger.success('✓ Todas las propiedades del terminal son válidas');

    // Guardar email en config global
    try {
      ConfigManager.setUserEmail(userEmail);
      logger.success(`✓ Email guardado globalmente en config`);
    } catch (err) {
      logger.warn(`No se pudo guardar email globalmente`, { error: err.message });
    }
  }

  /**
   * PASO 2: Preparar rutas (multiplataforma: Windows, macOS, Linux)
   */
  preparePaths(terminal) {
    logger.info('PASO 2: PREPARAR RUTAS');

    const mqlFolder = terminal.mqlFolder || (terminal.type === 'MT4' ? 'MQL4' : 'MQL5');
    const eaExtension = terminal.type === 'MT4' ? 'ex4' : 'ex5';
    
    // Nombre del archivo de configuración
    // ✅ CRÍTICO: Pasar el account number si existe para que coincida con lo que el EA espera
    const accountNumber = terminal.account && terminal.account !== 'N/A' ? terminal.account : null;
    const configFileName = PlatformPathManager.getEAConfigFileName(terminal.type, terminal.id, accountNumber);

    // Rutas en la terminal (específicas de la plataforma)
    const commonPath = PlatformPathManager.getCommonFilesPath(terminal.dataPath, terminal.type);
    
    const paths = {
      mqlFolder,
      eaExtension,
      configFileName,
      
      // Rutas en terminal
      expertsPath: path.join(terminal.dataPath, mqlFolder, 'Experts'),
      filesPath: path.join(terminal.dataPath, mqlFolder, 'Files'),
      eaFileName: `DataBridge.${eaExtension}`,
      targetEAPath: path.join(
        terminal.dataPath,
        mqlFolder,
        'Experts',
        `DataBridge.${eaExtension}`
      ),
      
      // Ruta en Common (global para MT4 y MT5)
      commonPath: commonPath,
      configPath: path.join(commonPath, configFileName)
    };

    logger.debug('Rutas preparadas', {
      mqlFolder: paths.mqlFolder,
      eaExtension: paths.eaExtension,
      configFileName: paths.configFileName,
      accountNumber: accountNumber,
      terminalId: terminal.id,
      expertsPath: paths.expertsPath,
      commonPath: paths.commonPath,
      platform: PlatformPathManager.getPlatformName()
    });

    return paths;
  }

  /**
   * PASO 3: Copiar EA
   */
  copyEA(terminal, paths) {
    logger.info('PASO 3: COPIAR EXPERT ADVISOR');

    // Crear carpeta Experts si no existe
    if (!fs.existsSync(paths.expertsPath)) {
      try {
        fs.mkdirSync(paths.expertsPath, { recursive: true });
        logger.success(`✓ Carpeta Experts creada: ${paths.expertsPath}`);
      } catch (err) {
        if (['EACCES', 'EPERM'].includes(err.code)) {
          this.createWithElevation(paths.expertsPath);
          logger.success(`✓ Carpeta Experts creada (con permisos elevados): ${paths.expertsPath}`);
        } else {
          throw err;
        }
      }
    } else {
      logger.debug('Carpeta Experts ya existe');
    }

    // Verificar que el EA existe en assets
    const sourceEAPath = path.join(
      this.assetsPath,
      paths.eaFileName
    );
    if (!fs.existsSync(sourceEAPath)) {
      const msg = `EA no encontrado en assets: ${sourceEAPath}`;
      logger.error(msg);
      throw new Error(msg);
    }
    logger.debug('EA encontrado en assets', { path: sourceEAPath });

    // Copiar EA
    try {
      fs.copyFileSync(sourceEAPath, paths.targetEAPath);
      logger.success(`✓ EA copiado exitosamente`, {
        from: sourceEAPath,
        to: paths.targetEAPath
      });
    } catch (err) {
      if (['EACCES', 'EPERM'].includes(err.code)) {
        const isWin = process.platform === 'win32';
        const hint = isWin
          ? 'Ejecuta como Administrador.'
          : 'Verifica los permisos de la carpeta MQL5/Experts (dentro del Wine prefix).';
        const msg = `No hay permisos para copiar EA a ${paths.targetEAPath}. ${hint}`;
        logger.error(msg);
        throw new Error(msg);
      }
      throw err;
    }

    // Verificar que se copió correctamente
    if (!fs.existsSync(paths.targetEAPath)) {
      const msg = `Verificación fallida: EA no existe en destino`;
      logger.error(msg);
      throw new Error(msg);
    }
    logger.success(`✓ Verificación: EA existe en destino`);
  }

  /**
   * PASO 4: Crear configuración en Common
   */
  createCommonConfig(terminal, config, paths) {
    logger.info('PASO 4: CREAR CONFIGURACIÓN EN COMMON');
    logger.debug('Detalles de configuración', {
      configFileName: paths.configFileName,
      commonPath: paths.commonPath,
      configPath: paths.configPath
    });

    // Crear carpeta Common si no existe
    if (!fs.existsSync(paths.commonPath)) {
      try {
        fs.mkdirSync(paths.commonPath, { recursive: true });
        logger.success(`✓ Carpeta Common creada: ${paths.commonPath}`);
      } catch (err) {
        if (['EACCES', 'EPERM'].includes(err.code)) {
          this.createWithElevation(paths.commonPath);
          logger.success(`✓ Carpeta Common creada (con permisos elevados): ${paths.commonPath}`);
        } else {
          throw err;
        }
      }
    }

    // Generar contenido del config
    const configContent = this.generateConfigContent(
      this.endpointUrl,
      config.userEmail,
      this.sendInterval
    );
    logger.debug('Contenido de config generado', {
      lines: configContent.split('\n').length,
      size: configContent.length
    });

    // Escribir config
    try {
      // Convertir a buffer ASCII con line endings Windows
      const buffer = Buffer.from(configContent, 'ascii');
      fs.writeFileSync(paths.configPath, buffer);
      logger.success(`✓ Archivo de configuración escrito`, {
        path: paths.configPath,
        bytes: buffer.length
      });
    } catch (err) {
      if (['EACCES', 'EPERM'].includes(err.code)) {
        const isWin = process.platform === 'win32';
        const hint = isWin
          ? 'Ejecuta como Administrador.'
          : 'Verifica los permisos en la carpeta Terminal/Common/Files (dentro del Wine prefix).';
        const msg = `No hay permisos para escribir config en ${paths.configPath}. ${hint}`;
        logger.error(msg);
        throw new Error(msg);
      }
      throw err;
    }

    // Verificar que se escribió correctamente
    try {
      const written = fs.readFileSync(paths.configPath, 'ascii');
      
      if (written.length === 0) {
        throw new Error('Config file está vacío');
      }
      
      if (!written.includes('EndpointURL')) {
        throw new Error('Config file no contiene EndpointURL');
      }
      
      const actualFileName = path.basename(paths.configPath);
      if (actualFileName !== paths.configFileName) {
        throw new Error(
          `Nombre incorrecto: esperado ${paths.configFileName}, ` +
          `actual ${actualFileName}`
        );
      }
      
      logger.success(`✓ Verificación: config está bien formado`, {
        fileName: actualFileName,
        size: written.length
      });
    } catch (err) {
      logger.error(`Verificación de config falló: ${err.message}`);
      throw err;
    }
  }

  /**
   * PASO 5: Crear backups (opcional)
   */
  createBackups(terminal, config, paths) {
    logger.info('PASO 5: CREAR BACKUPS (OPCIONAL)');

    const backupContent = this.generateBackupContent(
      this.endpointUrl,
      config.userEmail,
      this.sendInterval,
      terminal.broker,
      terminal.account,
      terminal.server
    );

    // Backup en Experts
    try {
      const backupExpertsPath = path.join(paths.expertsPath, 'DataBridge.ini');
      fs.writeFileSync(backupExpertsPath, backupContent, 'utf8');
      logger.success(`✓ Backup creado en Experts`);
    } catch (err) {
      logger.warn(`No se pudo crear backup en Experts`, { error: err.message });
    }

    // Backup en Files
    try {
      if (!fs.existsSync(paths.filesPath)) {
        fs.mkdirSync(paths.filesPath, { recursive: true });
      }
      
      const backupFilesPath = path.join(paths.filesPath, 'DataBridge.ini');
      fs.writeFileSync(backupFilesPath, backupContent, 'utf8');
      logger.success(`✓ Backup creado en Files`);
    } catch (err) {
      logger.warn(`No se pudo crear backup en Files`, { error: err.message });
    }
  }

  /**
   * PASO 6: Auto-confirmar instalación en el Worker
   * Esto permite que el EA comience inmediatamente a sincronizar sin esperar al usuario
   */
  /**
   * Desinstalar EA de una terminal
   */
  async uninstall(terminal) {
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('DESINSTALACIÓN - INICIANDO');
    logger.info('═══════════════════════════════════════════════════════════');

    try {
      const mqlFolder = terminal.mqlFolder || (terminal.type === 'MT4' ? 'MQL4' : 'MQL5');
      const eaExtension = terminal.type === 'MT4' ? 'ex4' : 'ex5';
      
      // 🔧 IMPORTANTE: Solo borrar el config del tipo de terminal que se está desinstalando
      const configFileName = terminal.type === 'MT4'
        ? 'DataBridge_MT4_config.ini'
        : 'DataBridge_MT5_config.ini';

      const filesToRemove = [
        // EA
        {
          path: path.join(terminal.dataPath, mqlFolder, 'Experts', `DataBridge.${eaExtension}`),
          desc: `EA (DataBridge.${eaExtension})`
        },
        
        // Configs en Experts y Files
        {
          path: path.join(terminal.dataPath, mqlFolder, 'Experts', 'DataBridge.ini'),
          desc: 'Config en Experts'
        },
        {
          path: path.join(terminal.dataPath, mqlFolder, 'Files', 'DataBridge.ini'),
          desc: 'Config en Files'
        },
        
        // 🔧 Config ESPECÍFICO en Common para este tipo de terminal
        {
          path: path.join(
            PlatformPathManager.getCommonFilesPath(terminal.dataPath, terminal.type),
            configFileName
          ),
          desc: `Config Common ${terminal.type}`
        },
        
        // Otros (específicos de esta terminal)
        {
          path: path.join(terminal.dataPath, mqlFolder, 'Experts', 'DataBridge.set'),
          desc: 'Settings'
        }
      ];

      let removed = 0;
      const removedList = [];

      for (const file of filesToRemove) {
        if (fs.existsSync(file.path)) {
          try {
            fs.unlinkSync(file.path);
            removed++;
            removedList.push(file.desc);
            logger.success(`✓ Eliminado: ${file.desc}`);
          } catch (err) {
            if (['EACCES', 'EPERM'].includes(err.code)) {
              logger.warn(`⚠ Sin permisos para eliminar: ${file.desc}`);
            } else {
              logger.error(`Error eliminando ${file.desc}`, { error: err.message });
            }
          }
        } else {
          logger.debug(`No existe: ${file.desc}`);
        }
      }

      // 🔧 Limpiar archivos de ESTADO y CONFIG ESPECÍFICOS de esta terminal
      // Patrones que se borran:
      // 1. DataBridge_MT4/5_[TERMINAL_ID]_state (sin account)
      // 2. DataBridge_MT4/5_[TERMINAL_ID]_config (sin account)
      // 3. DataBridge_MT4/5_[TERMINAL_ID]_[ACCOUNT]_state (con account - cualquier número)
      // 4. DataBridge_MT4/5_[TERMINAL_ID]_[ACCOUNT]_config (con account - cualquier número)
      // 5. DataBridge_MT4/5_[TERMINAL_ID]_[ACCOUNT]_session (Set & Forget - config de sesión)
      // 6. DataBridge_MT4/5_[TERMINAL_ID]_[ACCOUNT]_lock (bloqueo diario)
      // 7. DataBridge_MT4/5_[TERMINAL_ID]_[ACCOUNT]_day (baseline diario)
      
      const terminalId = terminal.id || '';
      
      logger.debug(`🔍 Buscando archivos para limpiar ${terminal.type}:`, {
        terminalId
      });
      
      // Rutas donde buscar
      const pathsToClean = [
        path.join(terminal.dataPath, mqlFolder, 'Files'),  // Ruta específica del terminal
        path.join(terminal.dataPath, mqlFolder, 'Experts'), // Alternativa en terminal
        PlatformPathManager.getCommonFilesPath(terminal.dataPath, terminal.type) // Ruta COMÚN (multiplataforma)
      ];

      for (const filesPath of pathsToClean) {
        if (fs.existsSync(filesPath)) {
          try {
            const files = fs.readdirSync(filesPath);
            for (const file of files) {
              let isMatch = false;
              const prefix = `DataBridge_${terminal.type}_${terminalId}_`;
              
              // Verificar si comienza con el prefijo específico de esta terminal
              if (file.startsWith(prefix)) {
                const suffix = file.substring(prefix.length);
                
                // Caso 1: state o state.txt (sin account)
                if (suffix === 'state' || suffix === 'state.txt') {
                  isMatch = true;
                }
                
                // Caso 2: config o config.ini (sin account)
                if (suffix === 'config' || suffix === 'config.ini') {
                  isMatch = true;
                }
                
                // Caso 3: [NÚMEROS]_state o [NÚMEROS]_state.txt (con account desconocido)
                // El account es el número después del terminal ID
                if (/^\d+_state(\.txt)?$/.test(suffix)) {
                  isMatch = true;
                }
                
                // Caso 4: [NÚMEROS]_config o [NÚMEROS]_config.ini (con account desconocido)
                if (/^\d+_config(\.ini)?$/.test(suffix)) {
                  isMatch = true;
                }
                
                // Caso 5: [NÚMEROS]_session.txt (archivo de sesión - Set & Forget)
                if (/^\d+_session(\.txt)?$/.test(suffix)) {
                  isMatch = true;
                }
                
                // Caso 6: [NÚMEROS]_lock.txt (archivo de bloqueo diario)
                if (/^\d+_lock(\.txt)?$/.test(suffix)) {
                  isMatch = true;
                }
                
                // Caso 7: [NÚMEROS]_day.txt (archivo de baseline diario)
                if (/^\d+_day(\.txt)?$/.test(suffix)) {
                  isMatch = true;
                }
              }
              
              if (isMatch) {
                const fullPath = path.join(filesPath, file);
                try {
                  fs.unlinkSync(fullPath);
                  removed++;
                  removedList.push(file);
                  logger.success(`✓ Eliminado: ${file}`);
                } catch (err) {
                  logger.warn(`⚠ Sin permisos para eliminar: ${file}`, { error: err.message });
                }
              }
            }
          } catch (err) {
            logger.debug(`No se pudo limpiar archivos en ${filesPath}`, { error: err.message });
          }
        }
      }

      logger.info('═══════════════════════════════════════════════════════════');
      logger.success(`DESINSTALACIÓN COMPLETADA - ${removed} archivos eliminados`);
      logger.info('═══════════════════════════════════════════════════════════');

      return {
        success: true,
        filesRemoved: removed,
        removedFilesList: removedList
      };
    } catch (err) {
      logger.error('Error en desinstalación', { error: err.message, stack: err.stack });
      throw err;
    }
  }

  /**
   * Generar contenido del archivo config
   * @private
   */
  generateConfigContent(endpointUrl, userEmail, sendInterval) {
    return (
      `EndpointURL=${endpointUrl}\r\n` +
      `UserEmail=${userEmail}\r\n` +
      `SendInterval=${sendInterval}\r\n`
    );
  }

  /**
   * Generar contenido del archivo backup INI
   * @private
   */
  generateBackupContent(endpointUrl, userEmail, sendInterval, broker, account, server) {
    return (
      `; DataBridge Expert Advisor Configuration\r\n` +
      `; Generado por TFX-Sync\r\n` +
      `; Este archivo es leído por el EA DataBridge\r\n` +
      `\r\n` +
      `[Connection]\r\n` +
      `EndpointURL=${endpointUrl}\r\n` +
      `SendInterval=${sendInterval}\r\n` +
      `\r\n` +
      `[User]\r\n` +
      `Email=${userEmail || 'not-set'}\r\n` +
      `\r\n` +
      `[Account]\r\n` +
      `Broker=${broker}\r\n` +
      `Account=${account}\r\n` +
      `Server=${server}\r\n` +
      `\r\n` +
      `[Settings]\r\n` +
      `AutoStart=true\r\n` +
      `Debug=false\r\n`
    );
  }

  /**
   * Obtener mensaje post-instalación
   * @private
   */
  getPostInstallMessage(terminal, endpointUrl) {
    const baseMsg = `✅ EA instalado exitosamente en ${terminal.name}`;
    
    if (terminal.type === 'MT5') {
      return (
        baseMsg +
        `\n\n⚠️ IMPORTANTE para MT5:\n` +
        `Si recibe error 4014, agregue esta URL a WebRequest:\n` +
        `Tools → Options → Expert Advisors\n` +
        `Agregue: ${new URL(endpointUrl).origin}`
      );
    }
    
    return baseMsg;
  }

  /**
   * Crear directorio con permisos elevados (Windows) o mkdir -p (macOS/Linux)
   * @private
   */
  createWithElevation(dirPath) {
    if (process.platform === 'win32') {
      try {
        const psCommand = `New-Item -ItemType Directory -Force -Path "${dirPath}" | Out-Null`;
        execSync(`powershell -Command "${psCommand}"`, {
          encoding: 'utf8',
          windowsHide: true
        });
      } catch (err) {
        const msg = `No se pudo crear directorio (ni con elevación): ${dirPath}. Ejecuta como Administrador.`;
        logger.error(msg, { error: err.message });
        throw new Error(msg);
      }
    } else {
      // macOS / Linux: intentar con mkdir -p
      try {
        execSync(`mkdir -p "${dirPath}"`, { encoding: 'utf8' });
      } catch (err) {
        const msg = `No se pudo crear directorio: ${dirPath}. Verifica los permisos de la carpeta.`;
        logger.error(msg, { error: err.message });
        throw new Error(msg);
      }
    }
  }
}

module.exports = EAInstaller;
