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
   * ✅ CRÍTICO: Debe ser IDÉNTICO a cómo lo calcula el EA en MQL5
   * El EA usa: StringToUpperMQL5(StringSubstr(terminalPath, pathLen - 32, 32))
   * Es decir: tomar los últimos 32 caracteres de la ruta y convertir a mayúsculas
   */
  generateId() {
    // ALGORITMO DEL EA: Últimos 32 caracteres de dataPath en mayúsculas
    if (this.dataPath && this.dataPath.length >= 32) {
      const id = this.dataPath.substring(this.dataPath.length - 32).toUpperCase();
      return id;
    } else if (this.dataPath) {
      // Si la ruta es menor a 32 caracteres, usar toda en mayúsculas
      return this.dataPath.toUpperCase();
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
