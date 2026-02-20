/**
 * useTerminals Hook
 * 
 * Gestiona el estado y la lógica de terminales
 * Encapsula la comunicación con main process via IPC
 */

import { useState, useCallback } from 'react';

export function useTerminals() {
  const [terminals, setTerminals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Escanear terminales
   */
  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.scanTerminals();

      if (result.success) {
        setTerminals(result.terminals);
        return result.terminals;
      } else {
        throw new Error(result.error || 'Error escaneando terminales');
      }
    } catch (err) {
      const errorMsg = err.message || 'Error desconocido';
      setError(errorMsg);
      console.error('Error en useTerminals.scan:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Instalar EA en terminal específico
   */
  const install = useCallback(async (terminalId, email) => {
    setError(null);

    try {
      const result = await window.electronAPI.installEA(terminalId, {
        userEmail: email
      });

      if (result.success) {
        // Re-escanear después de instalar
        await scan();
        return result;
      } else {
        throw new Error(result.error || 'Error instalando EA');
      }
    } catch (err) {
      const errorMsg = err.message || 'Error desconocido';
      setError(errorMsg);
      console.error('Error en useTerminals.install:', err);
      throw err;
    }
  }, [scan]);

  /**
   * Desinstalar EA de terminal
   */
  const uninstall = useCallback(async (terminalId) => {
    setError(null);

    try {
      const result = await window.electronAPI.uninstallEA(terminalId);

      if (result.success) {
        // Re-escanear después de desinstalar
        await scan();
        return result;
      } else {
        throw new Error(result.error || 'Error desinstalando EA');
      }
    } catch (err) {
      const errorMsg = err.message || 'Error desconocido';
      setError(errorMsg);
      console.error('Error en useTerminals.uninstall:', err);
      throw err;
    }
  }, [scan]);

  /**
   * Seleccionar carpeta
   */
  const selectFolder = useCallback(async () => {
    try {
      const result = await window.electronAPI.selectFolder();
      
      if (result.filePath) {
        return result.filePath;
      }
      return null;
    } catch (err) {
      console.error('Error en useTerminals.selectFolder:', err);
      return null;
    }
  }, []);

  /**
   * Instalar EA en ruta manual
   */
  const installManual = useCallback(async (folderPath, email) => {
    setError(null);

    try {
      const result = await window.electronAPI.installEAManual(folderPath);

      if (result.success) {
        return result;
      } else {
        throw new Error(result.error || 'Error en instalación manual');
      }
    } catch (err) {
      const errorMsg = err.message || 'Error desconocido';
      setError(errorMsg);
      console.error('Error en useTerminals.installManual:', err);
      throw err;
    }
  }, []);

  return {
    terminals,
    loading,
    error,
    scan,
    install,
    uninstall,
    selectFolder,
    installManual
  };
}
