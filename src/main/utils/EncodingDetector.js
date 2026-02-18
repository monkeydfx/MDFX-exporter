/**
 * EncodingDetector - Detección automática de codificaciones
 * 
 * Detecta automáticamente la codificación de archivos .ini
 * Soporta: UTF-8, UTF-16LE, Latin1, Windows-1252, ASCII
 */

const fs = require('fs');
const iconv = require('iconv-lite');
const logger = require('../services/Logger');

class EncodingDetector {
  constructor() {
    // Orden de prioridad de codificaciones (más comunes primero)
    this.encodings = [
      'UTF-8',
      'UTF-16LE',
      'Windows-1252',
      'Latin1',
      'ASCII'
    ];
  }

  /**
   * Detecta BOM (Byte Order Mark)
   * @param {Buffer} buffer - Buffer del archivo
   * @returns {string|null} - Encoding detectado o null
   */
  detectBOM(buffer) {
    if (buffer.length < 2) return null;

    // UTF-16LE BOM
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return 'UTF-16LE';
    }

    // UTF-16BE BOM
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      return 'UTF-16BE';
    }

    // UTF-8 BOM
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      return 'UTF-8';
    }

    return null;
  }

  /**
   * Valida si el contenido es un INI válido
   * @param {string} content - Contenido decodificado
   * @returns {boolean}
   */
  isValidIni(content) {
    // Verificar que tenga estructura básica de INI
    // Debe tener al menos una sección [xxx] o claves key=value
    const hasSections = /\[.+\]/m.test(content);
    const hasKeyValues = /^[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*(.+)?$/m.test(content);
    
    return hasSections || hasKeyValues;
  }

  /**
   * Detecta automáticamente la codificación de un archivo
   * @param {string} filePath - Ruta del archivo
   * @returns {object} - { encoding: string, content: string, confidence: number }
   */
  detectEncoding(filePath) {
    try {
      const buffer = fs.readFileSync(filePath);
      const results = [];

      // Primero intentar detectar BOM
      const bomEncoding = this.detectBOM(buffer);
      if (bomEncoding) {
        try {
          const content = iconv.decode(buffer, bomEncoding);
          
          if (this.isValidIni(content)) {
            logger.debug(`[EncodingDetector] BOM detectado: ${bomEncoding} en ${filePath}`);
            return {
              encoding: bomEncoding,
              content: content.trim(),
              confidence: 100,
              method: 'BOM detection'
            };
          }
        } catch (err) {
          logger.debug(`[EncodingDetector] Fallo decodificación con BOM ${bomEncoding}`);
        }
      }

      // Probar cada encoding
      for (const encoding of this.encodings) {
        try {
          const content = iconv.decode(buffer, encoding);

          // Validar que el contenido sea un INI válido
          if (this.isValidIni(content)) {
            // Calcular confianza basada en caracteres válidos y ausencia de corrupción
            const confidence = this.calculateConfidence(content, encoding);
            
            results.push({
              encoding,
              content: content.trim(),
              confidence,
              method: 'Encoding detection'
            });

            logger.debug(`[EncodingDetector] Encoding válido encontrado: ${encoding} (confianza: ${confidence}%)`);
          }
        } catch (err) {
          logger.debug(`[EncodingDetector] Encoding ${encoding} falló para ${filePath}`);
        }
      }

      // Retornar el de mayor confianza
      if (results.length > 0) {
        results.sort((a, b) => b.confidence - a.confidence);
        const best = results[0];
        
        logger.debug(`[EncodingDetector] Mejor encoding: ${best.encoding} (${best.confidence}% confianza) en ${filePath}`);
        return best;
      }

      // Fallback: UTF-8 forzado
      logger.warn(`[EncodingDetector] No se pudo detectar encoding válido en ${filePath}, usando UTF-8 como fallback`);
      return {
        encoding: 'UTF-8',
        content: iconv.decode(buffer, 'UTF-8').trim(),
        confidence: 0,
        method: 'Fallback UTF-8'
      };

    } catch (err) {
      logger.error(`[EncodingDetector] Error detectando encoding en ${filePath}`, { error: err.message });
      throw err;
    }
  }

  /**
   * Calcula confianza en base a caracteres válidos
   * @param {string} content - Contenido decodificado
   * @param {string} encoding - Encoding usado
   * @returns {number} - Porcentaje de confianza 0-100
   */
  calculateConfidence(content, encoding) {
    let confidence = 100;
    const suspiciousChars = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g;
    const matches = content.match(suspiciousChars);

    if (matches) {
      const ratio = matches.length / content.length;
      confidence = Math.max(0, 100 - (ratio * 1000));
    }

    // UTF-16LE suele tener mejor confianza si se decodifica correctamente
    if (encoding === 'UTF-16LE' && confidence > 80) {
      confidence += 5;
    }

    return Math.round(confidence);
  }

  /**
   * Lee un archivo INI con detección automática de codificación
   * @param {string} filePath - Ruta del archivo
   * @returns {string} - Contenido del archivo
   */
  readIniFile(filePath) {
    const result = this.detectEncoding(filePath);
    return result.content;
  }
}

module.exports = new EncodingDetector();
