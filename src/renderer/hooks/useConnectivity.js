/**
 * useConnectivity Hook
 * 
 * Gestiona la conectividad con el Worker
 */

// Usar React global (no import)
const { useState, useCallback, useEffect } = window.React;

function useConnectivity() {
  const [isConnected, setIsConnected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Verificar conectividad
   */
  const checkConnectivity = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.checkConnectivity();

      if (result.success) {
        setIsConnected(result.isConnected);
        return result.isConnected;
      } else {
        throw new Error(result.error || 'Error verificando conectividad');
      }
    } catch (err) {
      const errorMsg = err.message || 'Error desconocido';
      setError(errorMsg);
      console.error('Error en useConnectivity.checkConnectivity:', err);
      setIsConnected(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Verificar conectividad al montar
   */
  useEffect(() => {
    checkConnectivity();

    // Re-verificar cada 5 minutos
    const interval = setInterval(checkConnectivity, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [checkConnectivity]);

  /**
   * Escuchar cambios en conectividad
   */
  useEffect(() => {
    const unsubscribe = window.electronAPI.onConnectivityChange((status) => {
      setIsConnected(status.isConnected);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return {
    isConnected,
    loading,
    error,
    checkConnectivity
  };
}

// ✅ Asignar a window para acceso global
window.useConnectivity = useConnectivity;
