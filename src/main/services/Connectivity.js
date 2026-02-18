/**
 * Connectivity Service
 * 
 * Gestiona la comunicación con el Worker (Cloudflare)
 * - Test de conectividad
 * - Validación y registro de emails
 * - Caching de resultados (5 min)
 * - Manejo de timeouts y offline mode
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./Logger');

class Connectivity {
  constructor() {
    this.workerUrl = 'https://trading-journal-preprod.monkeydfx-trader.workers.dev';
    this.timeout = 10000; // 10 segundos
    
    this.cacheFile = path.join(
      os.homedir(),
      '.tfx-sync',
      'connectivity-cache.json'
    );
    this.cacheDuration = 5 * 60 * 1000; // 5 minutos
    
    logger.debug('Connectivity Service inicializado', { workerUrl: this.workerUrl });
  }

  /**
   * Test de conectividad básica con el Worker
   * Verifica endpoint /api/health
   */
  async testWorkerConnection(verbose = true) {
    return new Promise((resolve) => {
      try {
        if (verbose) {
          logger.info('🔍 Verificando conectividad con Worker...');
          logger.debug('URL:', { url: this.workerUrl });
        }

        // Verificar cache primero
        const cachedResult = this.getCachedResult();
        if (cachedResult !== null) {
          if (verbose) {
            const ageSeconds = Math.round((Date.now() - cachedResult.timestamp) / 1000);
            logger.info(`✓ Resultado en cache (${ageSeconds}s atrás)`, {
              status: cachedResult.status
            });
          }
          resolve(cachedResult.status === 'ok');
          return;
        }

        const url = new URL(this.workerUrl + '/api/health');
        
        const req = https.get(url, { timeout: this.timeout }, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            const isSuccess = res.statusCode >= 200 && res.statusCode < 500;
            
            this.cacheResult({
              status: isSuccess ? 'ok' : 'error',
              statusCode: res.statusCode,
              timestamp: Date.now()
            });

            if (verbose) {
              if (isSuccess) {
                logger.success(`✓ Worker disponible (HTTP ${res.statusCode})`);
              } else {
                logger.warn(`⚠️ Worker respondió HTTP ${res.statusCode}`);
              }
              
              try {
                const parsed = JSON.parse(data);
                logger.debug('Response:', parsed);
              } catch (e) {
                // Ignorar si no es JSON
              }
            }

            resolve(isSuccess);
          });
        });

        req.on('error', (err) => {
          this.cacheResult({
            status: 'error',
            error: err.message,
            timestamp: Date.now()
          });

          if (verbose) {
            logger.error('Error conectando:', { error: err.message });
          }
          resolve(false);
        });

        req.on('timeout', () => {
          if (verbose) {
            logger.error(`Timeout conectando (${this.timeout}ms)`);
          }
          req.destroy();
          resolve(false);
        });
      } catch (err) {
        if (verbose) {
          logger.error('Error al verificar conexión:', { error: err.message });
        }
        resolve(false);
      }
    });
  }

  /**
   * Validación completa del setup del Worker
   * Verifica: DNS, conectividad, SSL, endpoints
   */
  async validateWorkerSetup() {
    logger.info('🔧 Validando configuración...');

    const results = {
      connectivity: false,
      health: false,
      timestamp: new Date().toISOString(),
      checks: []
    };

    try {
      // Check 1: Conectividad básica
      logger.info('[1/3] Verificando conectividad...');
      const hasConnectivity = await this.testWorkerConnection(false);
      results.connectivity = hasConnectivity;
      results.checks.push({
        name: 'connectivity',
        status: hasConnectivity ? 'ok' : 'failed',
        message: hasConnectivity
          ? 'Conexión establecida'
          : 'No hay conexión'
      });

      if (!hasConnectivity) {
        logger.error('No se puede conectar');
        logger.error('   URL:', { url: this.workerUrl });
        logger.error('Posibles causas:');
        logger.error('   - No hay conexión a internet');
        logger.error('   - Worker está offline');
        logger.error('   - DNS no puede resolver');
        return results;
      }

      // Check 2: Endpoint /api/health
      logger.info('[2/3] Verificando EP..');
      const healthCheck = await this.testWorkerConnection(false);
      results.health = healthCheck;
      results.checks.push({
        name: 'ep_health',
        status: healthCheck ? 'ok' : 'failed',
        message: healthCheck
          ? 'EP respondiendo'
          : 'EP no disponible'
      });

      if (healthCheck) {
        logger.success('✓');
      } else {
        logger.warn('⚠️ ');
      }

      // Check 3: SSL/TLS
      logger.info('[3/3] Verificando SSL/TLS...');
      const hasSSL = this.workerUrl.startsWith('https://');
      results.checks.push({
        name: 'ssl',
        status: hasSSL ? 'ok' : 'warning',
        message: hasSSL ? 'Usando HTTPS (seguro)' : 'No usa HTTPS'
      });

      if (hasSSL) {
        logger.success('✓ Usando HTTPS (conexión segura)');
      } else {
        logger.warn('⚠️ No usa HTTPS');
      }

      // Resumen
      logger.info('\n📊 Resumen de validación:');
      results.checks.forEach(check => {
        const icon = check.status === 'ok' ? '✓' : 
                     check.status === 'warning' ? '⚠️' : '❌';
        logger.info(`${icon} ${check.name}: ${check.message}`);
      });

      return results;
    } catch (err) {
      logger.error('Error en validación', { error: err.message });
      throw err;
    }
  }

  /**
   * Registrar o validar email con el Worker
   * POST /api/register-email
   */
  async registerOrValidateEmail(email) {
    return new Promise((resolve) => {
      try {
        if (!email || typeof email !== 'string') {
          const msg = 'Email inválido o no proporcionado';
          logger.warn(msg);
          resolve({ success: false, message: msg });
          return;
        }

        logger.info(`📧 Registrando/validando email...`, { email });

        const url = new URL(this.workerUrl + '/api/register-email');
        const postData = JSON.stringify({ email });

        const options = {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout: this.timeout
        };

        const req = https.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              // Intentar parsear como JSON
              let response;
              try {
                response = JSON.parse(data);
              } catch (parseErr) {
                // Si no es JSON válido, crear objeto con el texto como mensaje
                logger.warn('Respuesta no es JSON válido, procesando como texto:', { data });
                response = {
                  message: data.substring(0, 100), // Primeros 100 caracteres
                  rawError: data
                };
              }

              if (res.statusCode === 200 || res.statusCode === 201) {
                const isNew = response.isNew === true;
                if (isNew) {
                  logger.success('✓ Email registrado (nuevo usuario)', { email });
                } else {
                  logger.success('✓ Email registrado', { email });
                }

                resolve({
                  success: true,
                  isNew,
                  message: response.message || 'Email registrado/validado correctamente'
                });
              } else if (res.statusCode === 404) {
                // Email NO existe en BD
                logger.warn(`Email no registrado: ${email}`);
                resolve({
                  success: false,
                  errorCode: 'EMAIL_NOT_FOUND',
                  message: 'Email no registrado. Debes registrarte primero en la plataforma web.'
                });
              } else if (res.statusCode === 403) {
                // Usuario inactivo o suscripción expirada
                logger.warn(`Usuario no autorizado (HTTP 403): ${email}`);
                const reason = response.message || 'Usuario inactivo o suscripción expirada';
                resolve({
                  success: false,
                  errorCode: 'USER_NOT_AUTHORIZED',
                  message: reason
                });
              } else if (res.statusCode === 500 || res.statusCode === 502 || res.statusCode === 503) {
                // Error del servidor
                logger.error(`Error del servidor (HTTP ${res.statusCode}):`, { message: response.message });
                resolve({
                  success: false,
                  errorCode: 'SERVER_ERROR',
                  message: '⚠️ El servidor de registro está temporalmente no disponible. Por favor intenta de nuevo en unos momentos.'
                });
              } else if (res.statusCode === 401) {
                // Error de autorización
                logger.error(`Error de autorización (HTTP ${res.statusCode}):`, { message: response.message });
                resolve({
                  success: false,
                  errorCode: 'UNAUTHORIZED',
                  message: 'Error de autorización. Verifique la configuración de la aplicación.'
                });
              } else {
                // Otros errores
                logger.error(`HTTP ${res.statusCode}: ${response.message || 'Error desconocido'}`);
                resolve({
                  success: false,
                  errorCode: `HTTP_${res.statusCode}`,
                  message: response.message || `Error del servidor (HTTP ${res.statusCode})`
                });
              }
            } catch (err) {
              logger.error('Error procesando respuesta:', { error: err.message, stack: err.stack });
              resolve({
                success: false,
                message: 'Error procesando respuesta del servidor'
              });
            }
          });
        });

        req.on('error', (err) => {
          logger.error('❌ Error conectando:', { error: err.message });
          resolve({
            success: false,
            message: 'No se puede conectar con el servidor'
          });
        });

        req.on('timeout', () => {
          logger.error(`❌ Timeout (${this.timeout}ms)`);
          req.destroy();
          resolve({
            success: false,
            message: 'Timeout: El servidor tardó demasiado en responder'
          });
        });

        req.write(postData);
        req.end();
      } catch (err) {
        logger.error('Error registrando email:', { error: err.message });
        resolve({
          success: false,
          message: err.message
        });
      }
    });
  }

  /**
   * Validar email (legacy)
   * Mantener por compatibilidad
   */
  async validateEmailWithWorker(email) {
    return this.registerOrValidateEmail(email);
  }

  /**
   * Guardar resultado en cache
   * @private
   */
  cacheResult(result) {
    try {
      const cacheDir = path.dirname(this.cacheFile);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      fs.writeFileSync(
        this.cacheFile,
        JSON.stringify(result, null, 2),
        'utf8'
      );
      logger.debug('Resultado cacheado');
    } catch (err) {
      logger.debug('No se pudo cachear:', { error: err.message });
    }
  }

  /**
   * Obtener resultado en cache si es válido
   * @private
   */
  getCachedResult() {
    try {
      if (!fs.existsSync(this.cacheFile)) {
        return null;
      }

      const cached = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
      const age = Date.now() - cached.timestamp;

      if (age < this.cacheDuration) {
        return cached;
      }

      // Cache expirado
      return null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Validar si una instalación es posible con este email
   * Llamada ANTES de instalar para validación temprana
   * @param {string} userEmail - Email del usuario
   * @returns {Promise<{success, message, ...}>}
   */
  validateInstallationEarly(userEmail) {
    return new Promise((resolve) => {
      try {
        if (!userEmail) {
          const msg = 'Email no proporcionado';
          logger.warn(msg);
          resolve({ success: false, message: msg });
          return;
        }

        logger.info(`🔍 Validando instalación temprana para: ${userEmail}`);

        const url = new URL(this.workerUrl + '/api/validate-installation');
        
        const postData = JSON.stringify({
          userEmail
        });

        const options = {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout: this.timeout
        };

        const req = https.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              let response;
              try {
                response = JSON.parse(data);
              } catch (parseErr) {
                response = { message: data.substring(0, 100) };
              }

              // Códigos exitosos
              if (res.statusCode === 200 || res.statusCode === 201) {
                logger.success('✓ Instalación validada', { userEmail });
                resolve({
                  success: true,
                  message: 'Usuario validado para instalar'
                });
              }
              // User inactivo o suscripción expirada
              else if (res.statusCode === 403) {
                const errorMsg = response.message || 'Usuario inactivo o suscripción expirada';
                logger.error(`❌ Instalación bloqueada (403):`, { userEmail, message: errorMsg });
                resolve({
                  success: false,
                  message: errorMsg
                });
              }
              // User not found
              else if (res.statusCode === 404) {
                const errorMsg = response.message || 'Usuario no encontrado';
                logger.error(`❌ Usuario no encontrado (404):`, { userEmail, message: errorMsg });
                resolve({
                  success: false,
                  message: errorMsg
                });
              }
              // Error del servidor
              else if (res.statusCode >= 500) {
                logger.error(`❌ Server error (HTTP ${res.statusCode}):`, { message: response.message });
                resolve({
                  success: false,
                  message: '⚠️ El servidor está temporalmente no disponible. Por favor intenta de nuevo.'
                });
              }
              // Otro error
              else {
                logger.error(`❌ HTTP ${res.statusCode}:`, { message: response.message });
                resolve({
                  success: false,
                  message: response.message || `Error del servidor (HTTP ${res.statusCode})`
                });
              }
            } catch (err) {
              logger.error('Error procesando respuesta:', { error: err.message });
              resolve({
                success: false,
                message: 'Error procesando respuesta del servidor'
              });
            }
          });
        });

        req.on('error', (err) => {
          logger.error('❌ Error conectando:', { error: err.message });
          resolve({
            success: false,
            message: 'No se puede conectar con el servidor'
          });
        });

        req.on('timeout', () => {
          logger.error(`❌ Timeout (${this.timeout}ms)`);
          req.destroy();
          resolve({
            success: false,
            message: 'Timeout: El servidor tardó demasiado en responder'
          });
        });

        req.write(postData);
        req.end();
      } catch (err) {
        logger.error('Error validando instalación:', { error: err.message });
        resolve({
          success: false,
          message: err.message
        });
      }
    });
  }

  /**
   * Validar que una combinación de broker/server/account está disponible para un usuario
   * Esto pasa ANTES de instalar el EA, para evitar que el usuario instale y luego falle
   * 
   * El worker buscará si existe installation_id en BD con diferente user_id
   */
  async validateTerminalAvailability(userEmail, broker, server, account) {
    return new Promise((resolve) => {
      try {
        if (!userEmail || !broker || !server || !account) {
          const msg = 'Email, broker, server o account no proporcionado';
          logger.warn(msg);
          resolve({ success: false, message: msg });
          return;
        }

        // Generar el installation_id candidato (mismo formato que el EA)
        const candidateInstallationId = `${broker}_${server}_${account}`;
        
        logger.info(`🔍 Validando disponibilidad de terminal...`, { 
          email: userEmail, 
          installationId: candidateInstallationId 
        });

        const url = new URL(this.workerUrl + '/api/validate-terminal-available');
        
        const postData = JSON.stringify({
          userEmail,
          installationId: candidateInstallationId
        });

        const options = {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: this.timeout
        };

        const req = https.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              let response;
              try {
                response = JSON.parse(data);
              } catch (parseErr) {
                response = { message: data.substring(0, 100) };
              }

              // ✅ Terminal disponible
              if (res.statusCode === 200) {
                logger.success('✓ Terminal disponible para instalar', { installationId: candidateInstallationId });
                resolve({
                  success: true,
                  message: 'Terminal disponible'
                });
              }
              // ❌ Terminal YA está vinculado a otro usuario
              else if (res.statusCode === 403) {
                const errorMsg = response.message || 'Esta instalación ya está vinculada a otro usuario. No puedes instalar aquí.';
                logger.error(`❌ Terminal rechazada (403):`, { installationId: candidateInstallationId, message: errorMsg });
                resolve({
                  success: false,
                  message: errorMsg,
                  errorCode: 'TERMINAL_ALREADY_CLAIMED'
                });
              }
              // User not found o inactivo
              else if (res.statusCode === 404) {
                const errorMsg = response.message || 'Usuario no encontrado o inactivo';
                logger.error(`❌ User not found (404):`, { email: userEmail, message: errorMsg });
                resolve({
                  success: false,
                  message: errorMsg,
                  errorCode: 'USER_NOT_FOUND'
                });
              }
              // Error del servidor
              else if (res.statusCode >= 500) {
                logger.error(`❌ Server error (HTTP ${res.statusCode}):`, { message: response.message });
                resolve({
                  success: false,
                  message: '⚠️ El servidor está temporalmente no disponible. Por favor intenta de nuevo.'
                });
              }
              // Otro error
              else {
                logger.error(`❌ HTTP ${res.statusCode}:`, { message: response.message });
                resolve({
                  success: false,
                  message: response.message || `Error del servidor (HTTP ${res.statusCode})`
                });
              }
            } catch (err) {
              logger.error('Error procesando respuesta:', { error: err.message });
              resolve({
                success: false,
                message: 'Error procesando respuesta del servidor'
              });
            }
          });
        });

        req.on('error', (err) => {
          logger.error('❌ Error conectando:', { error: err.message });
          resolve({
            success: false,
            message: 'No se puede conectar con el servidor'
          });
        });

        req.on('timeout', () => {
          logger.error(`❌ Timeout (${this.timeout}ms)`);
          req.destroy();
          resolve({
            success: false,
            message: 'Timeout: El servidor tardó demasiado en responder'
          });
        });

        req.write(postData);
        req.end();
      } catch (err) {
        logger.error('Error validando terminal:', { error: err.message });
        resolve({
          success: false,
          message: err.message
        });
      }
    });
  }

  /**
   * Validar disponibilidad de terminal ANTES de instalar
   * Comprueba que el usuario existe, está activo, y la terminal no está vinculada a otro usuario
   * @param {string} userEmail - Email del usuario
   * @param {string} broker - Broker (ej: "XM")
   * @param {string} server - Servidor (ej: "XMGlobal-MT4")
   * @param {string} account - Número de cuenta (ej: "12345678")
   * @returns {Promise<{success, message, installationId, ...}>}
   */
  async checkTerminalAvailability(userEmail, broker, server, account) {
    return new Promise((resolve) => {
      try {
        if (!userEmail || !broker || !server || !account) {
          const msg = 'Email, broker, server o account no proporcionado';
          logger.warn(msg);
          resolve({ success: false, message: msg });
          return;
        }

        logger.info(`🔍 Validando disponibilidad de terminal...`, { 
          email: userEmail, 
          broker,
          server,
          account
        });

        const url = new URL(this.workerUrl + '/api/check-terminal-available');
        
        const postData = JSON.stringify({
          userEmail,
          broker,
          server,
          account
        });

        const options = {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: this.timeout
        };

        const req = https.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              let response;
              try {
                response = JSON.parse(data);
              } catch (parseErr) {
                response = { message: data.substring(0, 100) };
              }

              // ✅ Terminal disponible
              if (res.statusCode === 200) {
                logger.success('✓ Terminal disponible para instalar', { 
                  broker, 
                  server, 
                  account 
                });
                resolve({
                  success: true,
                  message: 'Terminal disponible para instalar',
                  installationId: response.installationId
                });
              }
              // ❌ Terminal YA está vinculada a otro usuario
              else if (res.statusCode === 403) {
                const errorMsg = response.message || 'Esta terminal ya está vinculada a otro usuario';
                logger.error(`❌ Terminal rechazada (403):`, { broker, server, account, message: errorMsg });
                resolve({
                  success: false,
                  message: errorMsg,
                  errorCode: 'TERMINAL_ALREADY_CLAIMED'
                });
              }
              // User not found o inactivo
              else if (res.statusCode === 404) {
                const errorMsg = response.message || 'Usuario no encontrado o inactivo';
                logger.error(`❌ User not found (404):`, { email: userEmail, message: errorMsg });
                resolve({
                  success: false,
                  message: errorMsg,
                  errorCode: 'USER_NOT_FOUND'
                });
              }
              // Error del servidor
              else if (res.statusCode >= 500) {
                logger.error(`❌ Server error (HTTP ${res.statusCode}):`, { message: response.message });
                resolve({
                  success: false,
                  message: '⚠️ El servidor está temporalmente no disponible. Por favor intenta de nuevo.'
                });
              }
              // Otro error
              else {
                logger.error(`❌ HTTP ${res.statusCode}:`, { message: response.message });
                resolve({
                  success: false,
                  message: response.message || `Error del servidor (HTTP ${res.statusCode})`
                });
              }
            } catch (err) {
              logger.error('Error procesando respuesta:', { error: err.message });
              resolve({
                success: false,
                message: 'Error procesando respuesta del servidor'
              });
            }
          });
        });

        req.on('error', (err) => {
          logger.error('❌ Error conectando:', { error: err.message });
          resolve({
            success: false,
            message: 'No se puede conectar con el servidor'
          });
        });

        req.on('timeout', () => {
          logger.error(`❌ Timeout (${this.timeout}ms)`);
          req.destroy();
          resolve({
            success: false,
            message: 'Timeout: El servidor tardó demasiado en responder'
          });
        });

        req.write(postData);
        req.end();
      } catch (err) {
        logger.error('Error validando terminal:', { error: err.message });
        resolve({
          success: false,
          message: err.message
        });
      }
    });
  }

  /**
   * Reservar instalación ANTES de instalar el EA
   * Valida usuario y reserva el installation_id
   * @param {string} userEmail - Email del usuario
   * @param {string} broker - Broker (ej: "XM")
   * @param {string} server - Servidor (ej: "XMGlobal-MT4")
   * @param {string} account - Número de cuenta (ej: "12345678")
   * @returns {Promise<{success, installationId, ...}>}
   */
  async reserveInstallation(userEmail, terminalType, terminalId) {
    try {
      if (!userEmail || !terminalType || !terminalId) {
        const msg = 'Email, terminalType (MT4/MT5) o terminalId no proporcionado';
        logger.warn(msg);
        return { success: false, message: msg };
      }

      logger.info(`🔐 Reservando instalación...`, { 
        email: userEmail, 
        type: terminalType,
        terminalId
      });

      const url = new URL(this.workerUrl + '/api/reserve-installation');
      
      // 🔧 NUEVO FORMATO: ID_MT4/MT5_terminalId (sin broker/server/account)
      const postData = JSON.stringify({
        userEmail,
        type: terminalType.toUpperCase(),  // MT4 o MT5
        terminalId: terminalId.toUpperCase()
      });

      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: this.timeout
      };

      const sendRequest = () => new Promise((resolve) => {
        const req = https.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: data
            });
          });
        });

        req.on('error', (err) => {
          resolve({ error: err, statusCode: 0, headers: {}, body: '' });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ timeout: true, statusCode: 0, headers: {}, body: '' });
        });

        req.write(postData);
        req.end();
      });

      const maxAttempts = 3;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const result = await sendRequest();

        if (result.error) {
          logger.error('❌ Error conectando:', { error: result.error.message });
          return { success: false, message: 'No se puede conectar con el servidor' };
        }

        if (result.timeout) {
          logger.error(`❌ Timeout (${this.timeout}ms)`);
          return { success: false, message: 'Timeout: El servidor tardó demasiado en responder' };
        }

        let response;
        try {
          response = JSON.parse(result.body || '{}');
        } catch (parseErr) {
          response = { message: (result.body || '').substring(0, 100) };
        }

        if (result.statusCode === 429) {
          const retryAfterHeader = result.headers?.['retry-after'];
          const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10);
          const retryAfterMs = Number.isFinite(retryAfterSeconds)
            ? retryAfterSeconds * 1000
            : 1000 * attempt;

          logger.warn(`⚠️ Rate limit (HTTP 429) en reserva`, { attempt, retryAfterMs });

          if (attempt < maxAttempts) {
            await this.sleep(retryAfterMs);
            continue;
          }

          return {
            success: false,
            message: response.message || 'Demasiadas solicitudes. Intenta nuevamente en unos momentos.',
            errorCode: 'RATE_LIMIT'
          };
        }

        // ✅ Instalación reservada exitosamente
        if (result.statusCode === 200) {
          logger.success('✓ Instalación reservada', { 
            installationId: response.installationId,
            status: response.status
          });
          return {
            success: true,
            message: response.message || 'Instalación reservada',
            installationId: response.installationId,
            id: response.id,
            status: response.status
          };
        }
        // ❌ Instalación YA está vinculada a otro usuario
        if (result.statusCode === 403) {
          const errorMsg = response.message || 'Esta instalación ya está vinculada a otro usuario';
          logger.error(`❌ Instalación rechazada (403):`, { message: errorMsg });
          return {
            success: false,
            message: errorMsg,
            errorCode: 'INSTALLATION_ALREADY_CLAIMED'
          };
        }
        // User not found o inactivo
        if (result.statusCode === 404) {
          const errorMsg = response.message || 'Usuario no encontrado o inactivo';
          logger.error(`❌ User not found (404):`, { email: userEmail, message: errorMsg });
          return {
            success: false,
            message: errorMsg,
            errorCode: 'USER_NOT_FOUND'
          };
        }
        // Error del servidor
        if (result.statusCode >= 500) {
          logger.error(`❌ Server error (HTTP ${result.statusCode}):`, { message: response.message });
          return {
            success: false,
            message: '⚠️ El servidor está temporalmente no disponible. Por favor intenta de nuevo.'
          };
        }
        // Otro error
        logger.error(`❌ HTTP ${result.statusCode}:`, { message: response.message });
        return {
          success: false,
          message: response.message || `Error del servidor (HTTP ${result.statusCode})`
        };
      }

      return { success: false, message: 'Error inesperado reservando instalación' };
    } catch (err) {
      logger.error('Error reservando instalación:', { error: err.message });
      return { success: false, message: err.message };
    }
  }

  /**
   * Liberar instalación reservada
   * POST /api/unreserve-installation
   * @param {string} installationId
   * @param {string} userEmail
   * @param {string|null} reason
   * @returns {Promise<{success, message, errorCode, status, ...}>}
   */
  async unreserveInstallation(installationId, userEmail, reason = null) {
    try {
      if (!installationId || !userEmail) {
        const msg = 'installationId o userEmail no proporcionado';
        logger.warn(msg);
        return { success: false, message: msg };
      }

      logger.info('🔓 Liberando reserva...', { installationId, userEmail, reason });

      const url = new URL(this.workerUrl + '/api/unreserve-installation');
      const postData = JSON.stringify({
        installationId,
        userEmail,
        reason
      });

      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: this.timeout
      };

      const sendRequest = () => new Promise((resolve) => {
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: data
            });
          });
        });

        req.on('error', (err) => {
          resolve({ error: err, statusCode: 0, headers: {}, body: '' });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ timeout: true, statusCode: 0, headers: {}, body: '' });
        });

        req.write(postData);
        req.end();
      });

      const maxAttempts = 3;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const result = await sendRequest();

        if (result.error) {
          logger.error('❌ Error conectando:', { error: result.error.message });
          return { success: false, message: 'No se puede conectar con el servidor' };
        }

        if (result.timeout) {
          logger.error(`❌ Timeout (${this.timeout}ms)`);
          return { success: false, message: 'Timeout: El servidor tardó demasiado en responder' };
        }

        let response;
        try {
          response = JSON.parse(result.body || '{}');
        } catch (parseErr) {
          response = { message: (result.body || '').substring(0, 100) };
        }

        if (result.statusCode === 429) {
          const retryAfterHeader = result.headers?.['retry-after'];
          const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10);
          const retryAfterMs = Number.isFinite(retryAfterSeconds)
            ? retryAfterSeconds * 1000
            : 1000 * attempt;

          logger.warn('⚠️ Rate limit (HTTP 429) en unreserve', { attempt, retryAfterMs });

          if (attempt < maxAttempts) {
            await this.sleep(retryAfterMs);
            continue;
          }

          return {
            success: false,
            message: response.message || 'Demasiadas solicitudes. Intenta nuevamente en unos momentos.',
            errorCode: 'RATE_LIMIT'
          };
        }

        if (result.statusCode === 200) {
          logger.success('✓ Reserva liberada', { installationId });
          return {
            success: true,
            status: response.status || 'released',
            installationId: response.installationId || installationId,
            message: response.message || 'Reserva liberada'
          };
        }

        if (result.statusCode === 403) {
          return {
            success: false,
            errorCode: 'NOT_OWNER',
            message: response.message || 'Instalación pertenece a otro usuario'
          };
        }

        if (result.statusCode === 404) {
          return {
            success: false,
            errorCode: 'NOT_FOUND',
            message: response.message || 'Instalación no encontrada'
          };
        }

        if (result.statusCode === 409) {
          return {
            success: false,
            errorCode: 'CONFLICT',
            message: response.message || 'No se puede liberar esta instalación'
          };
        }

        if (result.statusCode >= 500) {
          return {
            success: false,
            errorCode: 'SERVER_ERROR',
            message: '⚠️ El servidor está temporalmente no disponible. Por favor intenta de nuevo.'
          };
        }

        return {
          success: false,
          errorCode: `HTTP_${result.statusCode}`,
          message: response.message || `Error del servidor (HTTP ${result.statusCode})`
        };
      }

      return { success: false, message: 'Error inesperado liberando instalación' };
    } catch (err) {
      logger.error('Error liberando instalación:', { error: err.message });
      return { success: false, message: err.message };
    }
  }

  /**
   * Limpiar cache
   */
  clearCache() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        fs.unlinkSync(this.cacheFile);
        logger.success('✓ Cache de conectividad eliminado');
      }
    } catch (err) {
      logger.warn('No se pudo limpiar cache:', { error: err.message });
    }
  }

  /**
   * Espera simple (ms)
   * @private
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Exportar como singleton con compatibilidad hacia atrás
const connectivity = new Connectivity();

module.exports = {
  testWorkerConnection: (verbose) => connectivity.testWorkerConnection(verbose),
  validateWorkerSetup: () => connectivity.validateWorkerSetup(),
  validateEmailWithWorker: (email) => connectivity.validateEmailWithWorker(email),
  registerOrValidateEmail: (email) => connectivity.registerOrValidateEmail(email),
  validateInstallationEarly: (email) => connectivity.validateInstallationEarly(email),
  checkTerminalAvailability: (email, broker, server, account) => connectivity.checkTerminalAvailability(email, broker, server, account),
  reserveInstallation: (email, terminalType, terminalId) => connectivity.reserveInstallation(email, terminalType, terminalId),
  unreserveInstallation: (installationId, userEmail, reason) => connectivity.unreserveInstallation(installationId, userEmail, reason),
  clearCache: () => connectivity.clearCache(),
  instance: connectivity
};
