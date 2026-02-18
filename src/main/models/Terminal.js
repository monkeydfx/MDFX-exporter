/**
 * Terminal Model
 * 
 * Representa una instancia de MetaTrader (MT4 o MT5)
 * con todas sus propiedades identificables
 */

const crypto = require('crypto');

class Terminal {
  constructor(data = {}) {
    // Propiedades identificables
    this.type = data.type; // 'MT4' o 'MT5'
    this.name = data.name; // Ej: "XM-Real-12345"
    this.broker = data.broker; // Ej: "XM"
    this.account = data.account; // Ej: "12345"
    this.server = data.server; // Ej: "XM-Real"
    
    // Rutas
    this.dataPath = data.dataPath; // Ruta completa a la carpeta de terminal
    this.mqlFolder = data.mqlFolder; // 'MQL4' o 'MQL5'
    
    // Estado
    this.installed = data.installed || false; // ¿EA instalado?
    
    // UID generado como fallback si no se puede obtener cuenta válida
    this.uid = data.uid || null; // Ej: "UID_A1B2C3D4E5F6G7H8"
    
    // ID único generado a partir de broker+server+account
    this.id = this.generateId();
  }

  /**
   * Generar ID único del terminal
   * ✓ MEJORADO: Extraer ID de la ruta del terminal (MetaTrader lo asigna automáticamente)
   * Ruta: C:\Users\...\MetaQuotes\Terminal\[ID_32_CHARS]
   * El MQL obtiene TERMINAL_DATA_PATH y extrae los mismos 32 caracteres
   */
  generateId() {
    // Extraer ID del terminal desde la ruta (últimos 32 caracteres = Terminal ID de MetaTrader)
    if (this.dataPath) {
      // El Terminal ID de MetaTrader está al final de la ruta (32 caracteres hex)
      const parts = this.dataPath.split(/[\\/]/);
      const lastPart = parts[parts.length - 1];
      
      // Si el último segmento tiene 32 caracteres hexadecimales, ese es el ID
      if (lastPart && /^[0-9A-Fa-f]{32}$/.test(lastPart)) {
        return lastPart.toUpperCase();
      }
      
      // Fallback: si no está en el formato esperado, extraer los últimos 32 caracteres
      if (this.dataPath.length >= 32) {
        return this.dataPath.slice(-32).toUpperCase();
      }
    }

    // Fallback si no tenemos dataPath
    if (this.broker && this.server && this.account && this.account !== 'N/A') {
      return `${this.broker}_${this.server}_${this.account}`.toUpperCase();
    }

    // Último recurso
    return crypto.randomBytes(16).toString('hex').toUpperCase();
  }

  /**
   * Validar que el terminal tiene datos obligatorios
   * ✓ Mejorada: Acepta N/A para campos si tenemos UID
   */
  validate() {
    const errors = [];

    if (!['MT4', 'MT5'].includes(this.type)) {
      errors.push('Type debe ser MT4 o MT5');
    }
    if (!this.name || typeof this.name !== 'string') {
      errors.push('Name es requerido');
    }
    if (!this.dataPath || typeof this.dataPath !== 'string') {
      errors.push('DataPath es requerido');
    }
    if (!this.mqlFolder || !['MQL4', 'MQL5'].includes(this.mqlFolder)) {
      errors.push('MqlFolder debe ser MQL4 o MQL5');
    }

    // Validación más flexible: o tenemos account válida O tenemos UID
    if ((!this.account || this.account === 'N/A') && !this.uid) {
      errors.push('Se necesita Account válida o UID generado');
    }

    if (errors.length > 0) {
      throw new Error(`Terminal validation errors: ${errors.join(', ')}`);
    }

    return true;
  }

  /**
   * Obtener representación como objeto plano
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      broker: this.broker,
      account: this.account,
      server: this.server,
      dataPath: this.dataPath,
      mqlFolder: this.mqlFolder,
      installed: this.installed,
      uid: this.uid
    };
  }

  /**
   * Obtener identificador único del terminal
   * Usa UID si no hay cuenta válida
   */
  getInstallationIdentifier() {
    if (this.account && this.account !== 'N/A') {
      return `${this.broker}_${this.server}_${this.account}`;
    }
    if (this.uid) {
      return this.uid;
    }
    return this.id;
  }

  /**
   * Obtener extensión del EA
   */
  getEAExtension() {
    return this.type === 'MT4' ? 'ex4' : 'ex5';
  }

  /**
   * Obtener nombre del archivo config específico para este terminal
   * ✓ MEJORADO: Usa Terminal ID de 32 caracteres de la ruta
   * Formato: DataBridge_MT5_09E52C8095636893A973F19570BF0562_config.ini
   */
  getConfigFileName() {
    const mtType = this.type === 'MT4' ? 'MT4' : 'MT5';
    
    // Usar Terminal ID (32 caracteres hex de la ruta)
    return `DataBridge_${mtType}_${this.id}_config.ini`;
  }

  /**
   * Obtener etiqueta visual para mostrar en la UI
   * Si el nombre es N/A, retorna la ruta; sino, retorna el nombre
   */
  getDisplayLabel() {
    if (this.name && this.name !== 'N/A') {
      return this.name;
    }
    // Extraer nombre de la carpeta de la ruta
    const pathParts = this.dataPath.split(require('path').sep);
    return pathParts[pathParts.length - 1] || this.dataPath;
  }

  /**
   * Obtener ruta completa para mostrar en tooltip o en la UI
   */
  getFullPath() {
    return this.dataPath;
  }
}

module.exports = Terminal;
