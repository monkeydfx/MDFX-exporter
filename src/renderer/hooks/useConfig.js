/**
 * useConfig Hook
 * 
 * Gestiona la configuración global de la aplicación
 * Email, installationId, etc.
 */

import { useState, useCallback, useEffect } from 'react';

export function useConfig() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Obtener configuración
   */
  const getConfig = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.getConfig();

      if (result.success) {
        setConfig(result.config);
        return result.config;
      } else {
        throw new Error(result.error || 'Error obteniendo config');
      }
    } catch (err) {
      const errorMsg = err.message || 'Error desconocido';
      setError(errorMsg);
      console.error('Error en useConfig.getConfig:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Establecer email
   */
  const setEmail = useCallback(async (email) => {
    setError(null);

    try {
      const result = await window.electronAPI.setEmail(email);

      if (result.success) {
        // Actualizar config local
        setConfig(prev => ({
          ...prev,
          userEmail: result.email
        }));
        return result.email;
      } else {
        throw new Error(result.error || 'Error estableciendo email');
      }
    } catch (err) {
      const errorMsg = err.message || 'Error desconocido';
      setError(errorMsg);
      console.error('Error en useConfig.setEmail:', err);
      throw err;
    }
  }, []);

  /**
   * Registrar o validar email
   */
  const registerOrValidateEmail = useCallback(async (email) => {
    setError(null);

    try {
      const result = await window.electronAPI.registerOrValidateEmail(email);

      if (result.success) {
        // Actualizar config local
        setConfig(prev => ({
          ...prev,
          userEmail: email
        }));
        return result;
      } else {
        throw new Error(result.message || 'Error registrando email');
      }
    } catch (err) {
      const errorMsg = err.message || 'Error desconocido';
      setError(errorMsg);
      console.error('Error en useConfig.registerOrValidateEmail:', err);
      throw err;
    }
  }, []);

  /**
   * Cargar config al montar
   */
  useEffect(() => {
    getConfig();
  }, []);

  /**
   * Obtener email actual
   */
  const getUserEmail = useCallback(() => {
    return config?.userEmail || null;
  }, [config]);

  /**
   * Obtener installation ID
   */
  const getInstallationId = useCallback(() => {
    return config?.installationId || null;
  }, [config]);

  return {
    config,
    loading,
    error,
    getConfig,
    setEmail,
    registerOrValidateEmail,
    getUserEmail,
    getInstallationId
  };
}
