const { useState, useEffect, useRef } = React;

function App() {
  const [terminals, setTerminals] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [installing, setInstalling] = useState({});
  const [uninstalling, setUninstalling] = useState({});
  const [status, setStatus] = useState({});
  const [userEmail, setUserEmail] = useState('');
  const [expandedTerminal, setExpandedTerminal] = useState(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [modalKind, setModalKind] = useState('info');
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [confirmState, setConfirmState] = useState({
    open: false,
    title: 'Confirmar acción',
    message: '',
    confirmLabel: 'Confirmar',
    cancelLabel: 'Cancelar',
    onConfirm: null
  });
  const [installingManual, setInstallingManual] = useState(false);
  const emailInputRef = useRef(null);

  useEffect(() => {
    handleScan();
    // No auto-focus para que el usuario pueda escribir en cualquier campo
    (async () => {
      try {
        const res = await window.electronAPI?.getAdminStatus?.();
        if (res && res.success && res.isAdmin === false) {
          setShowAdminModal(true);
        }
      } catch (err) {
        // silent
      }
    })();
  }, []);

  // ✅ No forzar focus automáticamente - dejar que el usuario controle el foco
  useEffect(() => {
    const hasActiveOperations = Object.values(installing).some(v => v) || Object.values(uninstalling).some(v => v);
    // Simplemente no hacer nada con el focus
  }, [installing, uninstalling]);

  const handleScan = async () => {
    setScanning(true);
    try {
      // 🧹 LIMPIAR CACHÉ Y RESCANEAR DESDE CERO
      // Esto garantiza que obtenemos datos FRESCOS de todas las terminales
      const result = await window.electronAPI.clearCacheAndScan();
      if (result && result.success) {
        setTerminals(result.terminals || []);
      } else {
        showError('Error al escanear terminales');
      }
    } catch (err) {
      showError('Error: ' + err.message);
    } finally {
      setScanning(false);
    }
  };

  const handleOpenFolder = async (path) => {
    if (!path) return;
    try {
      const result = await window.electronAPI.openTerminalFolder(path);
      if (!result.success) {
        showError('Error abriendo carpeta: ' + result.error);
      }
    } catch (err) {
      showError('Error: ' + err.message);
    }
  };

  const showError = (message) => {
    const kind = message?.startsWith('✅')
      ? 'success'
      : message?.startsWith('⚠️')
        ? 'warning'
        : message?.startsWith('❌')
          ? 'error'
          : 'info';
    setModalKind(kind);
    setErrorMessage(message);
    setShowErrorModal(true);
  };

  const showConfirm = ({ title, message, confirmLabel, cancelLabel, onConfirm }) => {
    setConfirmState({
      open: true,
      title: title || 'Confirmar acción',
      message: message || '',
      confirmLabel: confirmLabel || 'Confirmar',
      cancelLabel: cancelLabel || 'Cancelar',
      onConfirm: onConfirm || null
    });
  };

  // ✅ VALIDACIÓN 1: Validar FORMATO email (RFC 5322 simplificado)
  // Reglas:
  // - Debe tener al menos 1 carácter antes del @
  // - Debe tener @ obligatorio
  // - Debe tener al menos 1 carácter entre @ y .
  // - Debe tener un . después del @
  // - No puede tener espacios
  const validateEmailFormat = (email) => {
    if (!email) return false;
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  // ✅ VALIDACIÓN 2: Validar email CON BASE DE DATOS
  // - Verifica si existe en BD
  // - Si es nuevo, lo crea automáticamente
  // - Retorna: { success: true/false, isNew: true/false, message: string }
  const validateEmailWithBackend = async (email) => {
    try {
      const result = await window.electronAPI.registerOrValidateEmail(email);
      
      if (!result.success) {
        const err = new Error(result.message || 'Email no existe en BD o no autorizado');
        err.errorCode = result.errorCode;
        throw err;
      }
      
      return result;
    } catch (err) {
      if (!err.errorCode && err.message) {
        err.errorCode = 'UNKNOWN';
      }
      throw err;
    }
  };

  const handleInstall = async (terminalId) => {
    const terminal = terminals.find(t => t.id === terminalId);
    let reservedInstallationId = null;
    
    // ✅ VALIDACIÓN 1: Verificar que hay email ingresado
    if (!userEmail) {
      showError('⚠️ Por favor ingresa un email\n\nEste email será vinculado a la terminal');
      return;
    }

    // ✅ VALIDACIÓN 2: Verificar FORMATO del email (rápido, local)
    if (!validateEmailFormat(userEmail)) {
      showError('❌ Email inválido\n\nFormato correcto: usuario@dominio.com');
      return;
    }

    // ✅ VALIDACIÓN 3: Verificar que la terminal no esté ya instalada
    if (terminal?.installed) {
      showError('⚠️ Esta terminal ya tiene EA instalado\n\nDesinstala primero si quieres cambiar de email');
      return;
    }

    // Evitar doble click
    if (installing[terminalId]) return;

    const executeInstall = async () => {
      setInstalling(prev => ({ ...prev, [terminalId]: true }));
      setStatus(prev => ({ ...prev, [terminalId]: '⏳ Validando email con servidor...' }));

      try {
        // ✅ VALIDACIÓN 4: Validar email CON BASE DE DATOS (servidor)
        // - Si existe → OK
        // - Si no existe → Crea automáticamente usuario
        const emailValidation = await validateEmailWithBackend(userEmail);

        if (!emailValidation.success) {
          throw new Error(emailValidation.message || 'Email no autorizado');
        }

        // ✅ 🔄 VALIDACIÓN 5: REFRESCAR datos de la terminal
        // ⚠️ CRÍTICO: El usuario puede haber cambiado de cuenta/broker en MT5
        // sin notificarle a la app. Refrescamos para obtener datos REALES.
        setStatus(prev => ({ ...prev, [terminalId]: '⏳ Refrescando datos de la terminal...' }));
        
        const freshResult = await window.electronAPI.scanSingleTerminal(terminalId);
        if (!freshResult.success) {
          throw new Error('Terminal no encontrada durante el refresh. Intenta nuevamente.');
        }

        const freshTerminal = freshResult.terminal;

        // Actualizar el estado con los datos frescos
        setTerminals(prev => prev.map(t => 
          t.id === terminalId ? { ...t, ...freshTerminal } : t
        ));

        // ✅ VALIDACIÓN 6: PRE-RESERVAR TERMINAL antes de instalar
        // Esto genera un ID único y marca la terminal como reservada en el backend
        setStatus(prev => ({ ...prev, [terminalId]: '⏳ Reservando terminal...' }));

        const reserveResult = await window.electronAPI.reserveInstallation(terminalId, userEmail);

        if (!reserveResult.success) {
          const reserveMessage = reserveResult.message || reserveResult.error || 'Error al reservar terminal';

          if (reserveResult.errorCode === 'INSTALLATION_ALREADY_CLAIMED') {
            const err = new Error('❌ Esta terminal ya está vinculada a otro usuario');
            err.errorCode = 'INSTALLATION_ALREADY_CLAIMED';
            throw err;
          }

          if (reserveResult.errorCode === 'USER_NOT_FOUND') {
            const err = new Error('❌ Usuario no encontrado');
            err.errorCode = 'USER_NOT_FOUND';
            throw err;
          }

          if (reserveResult.errorCode === 'RATE_LIMIT') {
            const err = new Error('⚠️ Demasiadas solicitudes. Intenta nuevamente en unos momentos.');
            err.errorCode = 'RATE_LIMIT';
            throw err;
          }

          const err = new Error(reserveMessage);
          err.errorCode = reserveResult.errorCode || 'RESERVE_FAILED';
          throw err;
        }

        reservedInstallationId = reserveResult.installationId || null;

        setStatus(prev => ({ ...prev, [terminalId]: '⏳ Instalando EA en MetaTrader...' }));

        // ✅ VALIDACIÓN 7: Instalar EA (todas las validaciones pasaron)
        const result = await window.electronAPI.installEA(terminalId, { userEmail });
        
        if (result.success) {
          setStatus(prev => ({ ...prev, [terminalId]: '✅ EA instalado correctamente\n\nEl MetaTrader completará el registro automáticamente' }));
          
          // Limpiar estado después de 3 segundos
          setTimeout(() => {
            setStatus(prev => ({ ...prev, [terminalId]: '' }));
            setInstalling(prev => ({ ...prev, [terminalId]: false }));
            handleScan();
            // Restaurar focus en el input
            setTimeout(() => {
              emailInputRef?.current?.focus();
            }, 200);
          }, 3000);
        } else {
          if (reservedInstallationId) {
            try {
              await window.electronAPI.unreserveInstallation(reservedInstallationId, userEmail, 'INSTALL_FAILED');
            } catch (unreserveErr) {
              // No bloquear el flujo por fallos de liberación
            }
          }
          const errorMsg = result.error || 'Error desconocido';
          setStatus(prev => ({ ...prev, [terminalId]: `❌ Error: ${errorMsg}` }));
          setInstalling(prev => ({ ...prev, [terminalId]: false }));
          
          // Restaurar focus en caso de error
          setTimeout(() => {
            emailInputRef?.current?.focus();
          }, 100);
        }
      } catch (err) {
        if (reservedInstallationId) {
          try {
            await window.electronAPI.unreserveInstallation(reservedInstallationId, userEmail, 'INSTALL_EXCEPTION');
          } catch (unreserveErr) {
            // No bloquear el flujo por fallos de liberación
          }
        }
        const errorMsg = err.message || 'Error desconocido';
        const errorCode = err.errorCode || 'UNKNOWN';
        
        // Mostrar mensajes de error específicos según el código
        let displayMsg = errorMsg;
        
        if (errorCode === 'EMAIL_NOT_FOUND') {
          displayMsg = '❌ Debes registrarte con este mail en la plataforma.\n\nEstado: No disponible.';
        } else if (errorCode === 'USER_NOT_AUTHORIZED') {
          displayMsg = '❌ Cuenta no autorizada\n\n' + errorMsg;
        } else if (errorCode === 'SERVER_ERROR') {
          displayMsg = '⚠️ El servidor no está disponible\n\n' + errorMsg;
        } else if (errorCode === 'UNAUTHORIZED') {
          displayMsg = '❌ Error de configuración\n\nContacta al administrador.';
        } else if (errorCode === 'RATE_LIMIT') {
          displayMsg = '⚠️ Demasiadas solicitudes\n\nEspera unos segundos y vuelve a intentar.';
        } else if (errorMsg.includes('no existe en BD')) {
          displayMsg = '❌ Debes registrarte con este mail en la plataforma.\n\nEstado: No disponible.';
        } else if (errorMsg.includes('Usuario inactivo')) {
          displayMsg = '❌ Usuario inactivo\n\nContacta al administrador';
        } else if (errorMsg.includes('Suscripción')) {
          displayMsg = '❌ Suscripción expirada\n\nRenueva tu suscripción para continuar';
        }
        
        setStatus(prev => ({ ...prev, [terminalId]: displayMsg }));
        setInstalling(prev => ({ ...prev, [terminalId]: false }));
        
        // Restaurar focus en caso de error
        setTimeout(() => {
          emailInputRef?.current?.focus();
        }, 100);
      }
    };

    showConfirm({
      title: 'Instalar EA',
      message: `¿Instalar EA en ${terminal?.name || 'esta terminal'}?\n\nSe vinculará al email: ${userEmail}`,
      confirmLabel: 'Sí, instalar',
      cancelLabel: 'Cancelar',
      onConfirm: executeInstall
    });
  };

  const handleUninstall = async (terminalId) => {
    showConfirm({
      title: 'Desinstalar EA',
      message: '¿Desinstalar EA de esta terminal?\n\nEsto eliminará el EA pero podrás reinstalarlo después.',
      confirmLabel: 'Sí, desinstalar',
      cancelLabel: 'Cancelar',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, open: false }));

        setUninstalling(prev => ({ ...prev, [terminalId]: true }));
        setStatus(prev => ({ ...prev, [terminalId]: '⏳ Desinstalando...' }));

        try {
          const result = await window.electronAPI.uninstallEA(terminalId);
          if (result.success) {
            const terminalToUnreserve = terminals.find(t => t.id === terminalId);
            const installationId = terminalToUnreserve
              ? `ID_${terminalToUnreserve.type}_${terminalToUnreserve.id}`.toUpperCase()
              : null;

            if (installationId && userEmail) {
              try {
                await window.electronAPI.unreserveInstallation(installationId, userEmail, 'UNINSTALL');
              } catch (unreserveErr) {
                // No bloquear el flujo por fallos de liberación
              }
            }

            setStatus(prev => ({ ...prev, [terminalId]: '✅ EA desinstalado correctamente' }));
            // Limpiar estado después de 2 segundos
            setTimeout(() => {
              setStatus(prev => ({ ...prev, [terminalId]: '' }));
              setUninstalling(prev => ({ ...prev, [terminalId]: false }));
              handleScan();
              // Asegurar que el focus vuelva al input
              setTimeout(() => {
                emailInputRef?.current?.focus();
              }, 200);
            }, 2000);
          } else {
            const errorMsg = result.error || 'Error desconocido';
            setStatus(prev => ({ ...prev, [terminalId]: `❌ Error: ${errorMsg}` }));
            setUninstalling(prev => ({ ...prev, [terminalId]: false }));
            // Restaurar focus en caso de error
            setTimeout(() => {
              emailInputRef?.current?.focus();
            }, 100);
          }
        } catch (err) {
          const errorMsg = err.message || 'Error desconocido';
          setStatus(prev => ({ ...prev, [terminalId]: `❌ ${errorMsg}` }));
          setUninstalling(prev => ({ ...prev, [terminalId]: false }));
          // Restaurar focus en caso de error
          setTimeout(() => {
            emailInputRef?.current?.focus();
          }, 100);
        }
      }
    });
  };

  const handleInstallManual = async () => {
    // ✅ 1. Validar que hay email
    if (!userEmail) {
      showError('⚠️ Por favor ingresa un email antes de instalar');
      return;
    }

    // ✅ 2. Validar formato de email
    if (!validateEmailFormat(userEmail)) {
      showError('⚠️ Email inválido\n\nFormato correcto: usuario@ejemplo.com');
      return;
    }

    // Evitar doble click
    if (installingManual) return;

    setInstallingManual(true);

    try {
      // ✅ 3. Seleccionar carpeta
      const folderResult = await window.electronAPI.selectFolder();
      if (!folderResult.filePath) {
        // Usuario canceló
        setInstallingManual(false);
        return;
      }

      const folderPath = folderResult.filePath;

      showConfirm({
        title: 'Instalación manual',
        message: `¿Instalar el EA en esta carpeta?\n\n${folderPath}\n\nEmail: ${userEmail}`,
        confirmLabel: 'Sí, instalar',
        cancelLabel: 'Cancelar',
        onConfirm: async () => {
          try {
            // ✅ 4. Validar email con backend
            const emailValidation = await window.electronAPI.registerOrValidateEmail(userEmail);
            if (!emailValidation.success) {
              showError(`❌ ${emailValidation.message || 'Email no válido'}`);
              setInstallingManual(false);
              return;
            }

            // ✅ 5. Instalar en la carpeta seleccionada
            const result = await window.electronAPI.installEAManual(folderPath, { userEmail });
            
            if (result.success) {
              showError(`✅ EA instalado correctamente\n\nCarpeta: ${folderPath}`);
              handleScan();
            } else {
              showError(`❌ Error: ${result.error || 'Error desconocido'}`);
            }
          } catch (err) {
            showError(`❌ Error: ${err.message || 'Error desconocido'}`);
          } finally {
            setInstallingManual(false);
            setTimeout(() => {
              emailInputRef?.current?.focus();
            }, 100);
          }
        }
      });
    } catch (err) {
      showError(`❌ Error: ${err.message || 'Error desconocido'}`);
      setInstallingManual(false);
      setTimeout(() => {
        emailInputRef?.current?.focus();
      }, 100);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      showError('✅ Copiado al portapapeles');
    });
  };

  const terminalCardStyle = {
    background: 'linear-gradient(180deg, rgba(15,23,36,0.95) 0%, rgba(11,18,32,0.98) 100%)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
    backdropFilter: 'blur(6px)'
  };

  const terminalHeaderStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
    gap: '12px'
  };

  return (
    <div style={{ backgroundColor: '#0b1220', color: '#e0e0e0', minHeight: '100vh', padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '40px', paddingBottom: '20px', borderBottom: '2px solid rgba(14,116,144,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ color: '#0e7490', fontSize: '28px', fontWeight: 'bold', margin: '0 0 10px 0' }}>TFX-Sync</h1>
            <p style={{ color: '#90a4ae', fontSize: '14px', margin: '0' }}>Instalador de Expert Advisors para MetaTrader </p>
          </div>
          <button
            onClick={() => setShowInfoModal(true)}
            style={{
              padding: '10px 16px',
              backgroundColor: 'rgba(100, 150, 255, 0.2)',
              border: '1px solid #6496ff',
              color: '#6496ff',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px',
              transition: 'all 0.3s ease'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = 'rgba(100, 150, 255, 0.3)';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = 'rgba(100, 150, 255, 0.2)';
            }}
          >
            ℹ️ Información
          </button>
        </div>

        {/* Email Input */}
        <div style={{ backgroundColor: '#0f1724', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '20px', marginBottom: '30px' }}>
          <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: '#0e7490', fontSize: '14px' }}>
            📧 Email registrado en tripulacionfx.com:
          </label>
          <input
            ref={emailInputRef}
            type="email"
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
            placeholder="usuario@dominio.com"
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#0b1220',
              border: userEmail ? (validateEmailFormat(userEmail) ? '2px solid #4caf50' : '2px solid #ff6b6b') : '1px solid rgba(255,255,255,0.12)',
              color: '#e0e0e0',
              borderRadius: '4px',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              fontSize: '14px',
              transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
              outline: 'none',
              boxShadow: userEmail && validateEmailFormat(userEmail) ? '0 0 10px rgba(76, 175, 80, 0.3)' : userEmail && !validateEmailFormat(userEmail) ? '0 0 10px rgba(255, 107, 107, 0.3)' : 'none'
            }}
            onFocus={(e) => {
              if (!userEmail) {
                e.target.style.borderColor = 'rgba(14,116,144,0.5)';
              }
            }}
            onBlur={(e) => {
              if (userEmail) {
                e.target.style.borderColor = validateEmailFormat(userEmail) ? '#4caf50' : '#ff6b6b';
              } else {
                e.target.style.borderColor = 'rgba(255,255,255,0.12)';
              }
            }}
          />
          
          {/* Indicador de validación */}
          <div style={{ marginTop: '8px', minHeight: '40px' }}>
            {!userEmail && (
              <p style={{ color: '#90a4ae', fontSize: '12px', margin: '0' }}>
                Ingresa un email válido para vincular con las terminales
              </p>
            )}
            {userEmail && !validateEmailFormat(userEmail) && (
              <p style={{ color: '#ff6b6b', fontSize: '12px', margin: '0', fontWeight: 'bold' }}>
                ❌ Email inválido
                <br />
                <span style={{ fontSize: '11px', fontWeight: 'normal' }}>Formato correcto: usuario@dominio.com</span>
              </p>
            )}
            {userEmail && validateEmailFormat(userEmail) && (
              <p style={{ color: '#4caf50', fontSize: '12px', margin: '0', fontWeight: 'bold' }}>
                ✅ Email válido (se verificará en servidor al instalar)
                <br />
                <span style={{ fontSize: '11px', fontWeight: 'normal' }}>La validación final ocurre cuando haces click en "Instalar EA"</span>
              </p>
            )}
          </div>
        </div>

        {/* Scan Button */}
        <div style={{ marginBottom: '30px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <button
            onClick={handleScan}
            disabled={scanning}
            style={{
              padding: '12px 24px',
              backgroundColor: scanning ? '#555' : '#0e7490',
              color: scanning ? '#ccc' : '#000',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: scanning ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              transition: 'all 0.3s ease',
              flex: 1,
              minWidth: '200px'
            }}
            onMouseOver={(e) => {
              if (!scanning) e.target.style.backgroundColor = '#1aa6c3';
            }}
            onMouseOut={(e) => {
              if (!scanning) e.target.style.backgroundColor = '#0e7490';
            }}
          >
            {scanning ? '⏳ Escaneando...' : '🔍 Escanear Terminales'}
          </button>

          {/* Botón de Instalación Manual SIEMPRE VISIBLE */}
          <button
            onClick={handleInstallManual}
            disabled={installingManual || !userEmail || !validateEmailFormat(userEmail)}
            style={{
              padding: '12px 24px',
              backgroundColor: installingManual ? '#555' : userEmail && validateEmailFormat(userEmail) ? '#6496ff' : '#444',
              color: installingManual ? '#ccc' : '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: (installingManual || !userEmail || !validateEmailFormat(userEmail)) ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              transition: 'all 0.3s ease',
              flex: 1,
              minWidth: '200px'
            }}
            onMouseOver={(e) => {
              if (userEmail && validateEmailFormat(userEmail) && !installingManual) {
                e.target.style.backgroundColor = '#7ba3ff';
              }
            }}
            onMouseOut={(e) => {
              if (userEmail && validateEmailFormat(userEmail) && !installingManual) {
                e.target.style.backgroundColor = '#6496ff';
              }
            }}
          >
            {installingManual ? '⏳ Instalando...' : '📁 Instalación Manual'}
          </button>
        </div>

        {/* Terminals Section */}
        <div style={{ backgroundColor: '#0f1724', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '20px', boxShadow: '0 12px 30px rgba(0,0,0,0.25)' }}>
          <h2 style={{ color: '#0e7490', fontSize: '18px', fontWeight: 'bold', margin: '0 0 15px 0' }}>
            📊 Terminales Detectadas ({terminals.length})
          </h2>

          {!terminals || terminals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#90a4ae' }}>
              <p style={{ fontSize: '16px' }}>No se encontraron terminales MT4/MT5</p>
              <p style={{ fontSize: '12px', marginTop: '10px' }}>Haz clic en "🔍 Escanear Terminales" para buscar</p>
              <p style={{ fontSize: '12px', marginTop: '10px', color: '#0e7490', fontWeight: 'bold' }}>O usa "📁 Instalación Manual" para especificar la carpeta manualmente</p>
            </div>
          ) : (
            terminals.map((terminal) => (
              <div
                key={terminal.id}
                style={{
                  ...terminalCardStyle,
                  border: expandedTerminal === terminal.id ? '1px solid rgba(14,116,144,0.55)' : '1px solid rgba(255,255,255,0.08)',
                  background: expandedTerminal === terminal.id
                    ? 'linear-gradient(180deg, rgba(14,116,144,0.12) 0%, rgba(11,18,32,0.98) 100%)'
                    : 'linear-gradient(180deg, rgba(15,23,36,0.95) 0%, rgba(11,18,32,0.98) 100%)'
                }}
                onClick={() => setExpandedTerminal(expandedTerminal === terminal.id ? null : terminal.id)}
              >
                {/* Terminal Header */}
                <div style={terminalHeaderStyle}>
                  <div>
                    <h3 style={{ color: '#0e7490', margin: '0 0 5px 0' }}>
                      {terminal.name === 'N/A' ? '⚠️ No detectado' : terminal.name}
                    </h3>
                    <p style={{ color: '#90a4ae', fontSize: '12px', fontFamily: 'monospace', margin: '0', wordBreak: 'break-all' }}>
                      📁 {terminal.dataPath || 'Sin ruta'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span style={{
                      padding: '4px 8px',
                      backgroundColor: terminal.type === 'MT4' ? 'rgba(147, 112, 219, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                      color: terminal.type === 'MT4' ? '#b794f6' : '#818cf8',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}>
                      {terminal.type}
                    </span>
                    <span style={{ color: '#90a4ae', fontSize: '14px' }}>
                      {terminal.installed ? '✅' : '❌'}
                    </span>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedTerminal === terminal.id && (
                  <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    {/* Info Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '15px', fontSize: '13px' }}>
                      <div>
                        <span style={{ color: '#90a4ae' }}>Tipo:</span>
                        <span style={{ marginLeft: '5px', fontWeight: 'bold' }}>{terminal.type}</span>
                      </div>
                      <div>
                        <span style={{ color: '#90a4ae' }}>Cuenta:</span>
                        <span style={{ marginLeft: '5px', fontWeight: 'bold' }}>{terminal.account}</span>
                      </div>
                      <div>
                        <span style={{ color: '#90a4ae' }}>Broker:</span>
                        <span style={{ marginLeft: '5px', fontWeight: 'bold' }}>{terminal.broker}</span>
                      </div>
                      <div>
                        <span style={{ color: '#90a4ae' }}>Servidor:</span>
                        <span style={{ marginLeft: '5px', fontWeight: 'bold' }}>{terminal.server || 'N/A'}</span>
                      </div>
                    </div>

                    {/* Status Message */}
                    {status[terminal.id] && (
                      <div style={{
                        padding: '10px',
                        backgroundColor: status[terminal.id].includes('❌') ? 'rgba(255, 107, 107, 0.1)' : status[terminal.id].includes('⏳') ? 'rgba(14, 116, 144, 0.1)' : 'rgba(76, 175, 80, 0.1)',
                        border: '1px solid ' + (status[terminal.id].includes('❌') ? 'rgba(255, 107, 107, 0.3)' : status[terminal.id].includes('⏳') ? 'rgba(14, 116, 144, 0.3)' : 'rgba(76, 175, 80, 0.3)'),
                        borderRadius: '4px',
                        marginBottom: '15px',
                        fontSize: '12px',
                        color: status[terminal.id].includes('❌') ? '#ff6b6b' : status[terminal.id].includes('⏳') ? '#0e7490' : '#4caf50'
                      }}>
                        {status[terminal.id]}
                      </div>
                    )}

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenFolder(terminal.dataPath);
                        }}
                        disabled={!terminal.dataPath}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: terminal.dataPath ? '#6496ff' : '#444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          cursor: terminal.dataPath ? 'pointer' : 'not-allowed',
                          opacity: terminal.dataPath ? 1 : 0.5,
                          transition: 'all 0.3s ease'
                        }}
                        onMouseOver={(e) => {
                          if (terminal.dataPath) e.target.style.backgroundColor = '#7ba3ff';
                        }}
                        onMouseOut={(e) => {
                          if (terminal.dataPath) e.target.style.backgroundColor = '#6496ff';
                        }}
                      >
                        📁 Abrir Carpeta
                      </button>

                      {terminal.installed && !uninstalling[terminal.id] ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUninstall(terminal.id);
                          }}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: '#ef4444',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease'
                          }}
                          onMouseOver={(e) => {
                            e.target.style.backgroundColor = '#ff6b6b';
                          }}
                          onMouseOut={(e) => {
                            e.target.style.backgroundColor = '#ef4444';
                          }}
                        >
                          🗑️ Desinstalar EA
                        </button>
                      ) : null}

                      {!terminal.installed && !installing[terminal.id] ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInstall(terminal.id);
                          }}
                          disabled={!userEmail || !validateEmailFormat(userEmail)}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: userEmail && validateEmailFormat(userEmail) ? '#0e7490' : '#555',
                            color: userEmail && validateEmailFormat(userEmail) ? '#000' : '#ccc',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            cursor: userEmail && validateEmailFormat(userEmail) ? 'pointer' : 'not-allowed',
                            transition: 'all 0.3s ease'
                          }}
                          onMouseOver={(e) => {
                            if (userEmail && validateEmailFormat(userEmail)) e.target.style.backgroundColor = '#1aa6c3';
                          }}
                          onMouseOut={(e) => {
                            if (userEmail && validateEmailFormat(userEmail)) e.target.style.backgroundColor = '#0e7490';
                          }}
                        >
                          ⬆️ Instalar EA
                        </button>
                      ) : null}

                      {installing[terminal.id] && (
                        <button
                          disabled
                          style={{
                            padding: '8px 12px',
                            backgroundColor: '#555',
                            color: '#ccc',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            cursor: 'not-allowed'
                          }}
                        >
                          ⏳ Instalando...
                        </button>
                      )}

                      {uninstalling[terminal.id] && (
                        <button
                          disabled
                          style={{
                            padding: '8px 12px',
                            backgroundColor: '#555',
                            color: '#ccc',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            cursor: 'not-allowed'
                          }}
                        >
                          ⏳ Desinstalando...
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ textAlign: 'center', color: '#90a4ae', fontSize: '12px', marginTop: '30px', marginBottom: '10px' }}>
        © 2025 tripulacionfx.com. Todos los derechos reservados.
      </div>

      {/* Modal de Confirmación */}
      {confirmState.open && (
        <div
          onClick={() => setConfirmState(prev => ({ ...prev, open: false }))}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}
        >
          <div
            className="modal-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#0f1724',
              border: '1px solid rgba(14, 116, 144, 0.45)',
              borderRadius: '12px',
              padding: '26px',
              maxWidth: '520px',
              width: '92%',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(14, 116, 144, 0.2)'
              }}>
                <span style={{ fontSize: '18px' }}>✅</span>
              </div>
              <h2 style={{ margin: 0, fontSize: '18px', color: '#22d3ee' }}>{confirmState.title}</h2>
            </div>
            <p style={{ color: '#e0e0e0', whiteSpace: 'pre-wrap', lineHeight: '1.6', marginBottom: '20px' }}>
              {confirmState.message}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setConfirmState(prev => ({ ...prev, open: false }))}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#1f2937',
                  color: '#e5e7eb',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  flex: 1
                }}
              >
                {confirmState.cancelLabel}
              </button>
              <button
                onClick={() => {
                  const fn = confirmState.onConfirm;
                  setConfirmState(prev => ({ ...prev, open: false }));
                  if (fn) fn();
                }}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#0e7490',
                  color: '#0b1220',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  flex: 1
                }}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Error */}
      {showErrorModal && (
        <div
          onClick={() => setShowErrorModal(false)}
          style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div
            className="modal-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#0f1724',
              border: `1px solid ${
                modalKind === 'success'
                  ? 'rgba(34, 197, 94, 0.35)'
                  : modalKind === 'warning'
                    ? 'rgba(14, 116, 144, 0.45)'
                    : modalKind === 'error'
                      ? 'rgba(255, 107, 107, 0.35)'
                      : 'rgba(148, 163, 184, 0.3)'
              }`,
              borderRadius: '12px',
              padding: '26px',
              maxWidth: '520px',
              width: '92%',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                display: 'grid',
                placeItems: 'center',
                background: modalKind === 'success'
                  ? 'rgba(34, 197, 94, 0.15)'
                  : modalKind === 'warning'
                    ? 'rgba(14, 116, 144, 0.2)'
                    : modalKind === 'error'
                      ? 'rgba(255, 107, 107, 0.2)'
                      : 'rgba(148, 163, 184, 0.18)'
              }}>
                <span style={{ fontSize: '18px' }}>
                  {modalKind === 'success' ? '✅' : modalKind === 'warning' ? '⚠️' : modalKind === 'error' ? '❌' : 'ℹ️'}
                </span>
              </div>
              <h2 style={{
                margin: 0,
                fontSize: '18px',
                color: modalKind === 'success'
                  ? '#22c55e'
                  : modalKind === 'warning'
                    ? '#22d3ee'
                    : modalKind === 'error'
                      ? '#ff6b6b'
                      : '#e2e8f0'
              }}>
                {modalKind === 'success' ? 'Listo' : modalKind === 'warning' ? 'Atención' : modalKind === 'error' ? 'Error' : 'Información'}
              </h2>
            </div>
            <p style={{ color: '#e0e0e0', whiteSpace: 'pre-wrap', lineHeight: '1.6', marginBottom: '20px' }}>
              {errorMessage}
            </p>
            <button
              onClick={() => {
                setShowErrorModal(false);
                // Auto-focus en el email input después de cerrar el modal
                setTimeout(() => {
                  emailInputRef?.current?.focus();
                }, 300);
              }}
              style={{
                padding: '10px 20px',
                backgroundColor: modalKind === 'success'
                  ? '#22c55e'
                  : modalKind === 'warning'
                    ? '#0e7490'
                    : modalKind === 'error'
                      ? '#ff6b6b'
                      : '#64748b',
                color: '#0b1220',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
                width: '100%',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => {
                e.target.style.filter = 'brightness(1.05)';
              }}
              onMouseOut={(e) => {
                e.target.style.filter = 'brightness(1)';
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {showAdminModal && (
        <div
          onClick={() => setShowAdminModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}
        >
          <div
            className="modal-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#0f1724',
              border: '1px solid rgba(14, 116, 144, 0.4)',
              borderRadius: '12px',
              padding: '26px',
              maxWidth: '560px',
              width: '92%',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(14, 116, 144, 0.2)'
              }}>
                <span style={{ fontSize: '18px' }}>🛡️</span>
              </div>
              <h2 style={{ margin: 0, fontSize: '18px', color: '#22d3ee' }}>Permisos recomendados</h2>
            </div>
            <p style={{ color: '#e0e0e0', lineHeight: '1.6', marginBottom: '16px' }}>
              Para evitar errores al instalar el EA, ejecuta TFX-Sync como Administrador.
            </p>
            <div style={{
              backgroundColor: '#0b1220',
              border: '1px solid rgba(14, 116, 144, 0.35)',
              borderRadius: '8px',
              padding: '12px',
              color: '#90a4ae',
              fontSize: '13px',
              marginBottom: '18px'
            }}>
              Clic derecho en el acceso directo → “Ejecutar como administrador”.
            </div>
            <button
              onClick={() => setShowAdminModal(false)}
              style={{
                padding: '10px 20px',
                backgroundColor: '#0e7490',
                color: '#0b1220',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Modal de Información */}
      {showInfoModal && (
        <div
          onClick={() => setShowInfoModal(false)}
          style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          overflowY: 'auto',
          padding: '20px'
        }}>
          <div
            className="modal-panel modal-scroll"
            style={{
            background: 'linear-gradient(180deg, rgba(15,23,36,0.98) 0%, rgba(11,18,32,0.98) 100%)',
            border: '1px solid rgba(14, 116, 144, 0.45)',
            borderRadius: '14px',
            padding: '28px',
            maxWidth: '680px',
            width: '100%',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.55)',
            maxHeight: '82vh',
            overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(14, 116, 144, 0.2)',
                border: '1px solid rgba(14, 116, 144, 0.35)'
              }}>
                <span style={{ fontSize: '20px' }}>📚</span>
              </div>
              <div>
                <h2 style={{ color: '#22d3ee', margin: 0, fontSize: '22px' }}>Guía rápida de instalación</h2>
                <p style={{ color: '#90a4ae', margin: '4px 0 0 0', fontSize: '13px' }}>
                  Te explicamos el paso a paso y cuándo usar la instalación manual.
                </p>
              </div>
            </div>

            <div style={{ color: '#e0e0e0', lineHeight: '1.8' }}>
              <h3 style={{ color: '#0e7490', marginTop: '20px', marginBottom: '10px' }}>Paso 1: Preparar Email</h3>
              <p style={{ marginBottom: '15px' }}>
                1️⃣ Ingresa tu email en el campo "📧 Email para sincronizar"<br/>
                2️⃣ Asegúrate que sea válido (ej: usuario@ejemplo.com)
              </p>

              <h3 style={{ color: '#0e7490', marginTop: '20px', marginBottom: '10px' }}>Paso 2: Escanear Terminales</h3>
              <p style={{ marginBottom: '15px' }}>
                1️⃣ Haz clic en "🔍 Escanear Terminales"<br/>
                2️⃣ Espera a que se detecten tus MT4/MT5
              </p>

              <div style={{
                backgroundColor: '#0b1220',
                border: '1px solid rgba(14, 116, 144, 0.25)',
                borderRadius: '10px',
                padding: '14px',
                margin: '10px 0 18px 0'
              }}>
                <h3 style={{ color: '#0e7490', marginTop: '0', marginBottom: '8px' }}>Instalación manual (para principiantes)</h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1' }}>
                  Úsala si la app no detecta tu terminal o si instalaste MetaTrader en una carpeta diferente.
                  Al pulsar "📁 Instalación Manual", selecciona la carpeta de datos de MetaTrader.
                  Si no sabes cuál es: abre MetaTrader → Archivo → Open Data Folder y elige esa carpeta.
                </p>
              </div>

              <h3 style={{ color: '#0e7490', marginTop: '20px', marginBottom: '10px' }}>Paso 3: Instalar EA</h3>
              <p style={{ marginBottom: '15px' }}>
                1️⃣ Haz clic en "⬆️ Instalar EA" en la terminal deseada<br/>
                2️⃣ Espera a que aparezca "✅ EA instalado correctamente"<br/>
                3️⃣ Ve a tu terminal MT4/MT5 y abre un gráfico
              </p>

              <h3 style={{ color: '#0e7490', marginTop: '20px', marginBottom: '10px' }}>Paso 4: Activar EA en MetaTrader</h3>
              <p style={{ marginBottom: '15px' }}>
                1️⃣ En el gráfico, ve a Archivo → Open Data Folder (o presiona Ctrl+Shift+D)<br/>
                2️⃣ Navega a: MQL4/Experts (o MQL5/Experts)<br/>
                3️⃣ Arrastra el archivo "DataBridge.ex4" (o .ex5) al gráfico<br/>
                4️⃣ Haz clic en "✓ OK" en la ventana que aparece
              </p>

              <h3 style={{ color: '#0e7490', marginTop: '20px', marginBottom: '10px' }}>⚠️ Error: URL No Permitida (4014)</h3>
              <p style={{ marginBottom: '10px' }}>Si ves este error en el Journal, necesitas agregar la URL a WebRequest:</p>
              <div style={{
                backgroundColor: '#0b1220',
                border: '1px solid rgba(14, 116, 144, 0.3)',
                borderRadius: '4px',
                padding: '12px',
                marginBottom: '10px',
                fontFamily: 'monospace',
                fontSize: '12px',
                wordBreak: 'break-all',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ color: '#90a4ae' }}>https://trading-journal-preprod.monkeydfx-trader.workers.dev</span>
                <button
                  onClick={() => copyToClipboard('https://trading-journal-preprod.monkeydfx-trader.workers.dev')}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#6496ff',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    marginLeft: '10px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  📋 Copiar
                </button>
              </div>
              <p style={{ fontSize: '13px', color: '#90a4ae' }}>
                Luego ve a Tools → Options → Expert Advisors → Permitir WebRequest y agrega la URL
              </p>
                
              <h3 style={{ color: '#0e7490', marginTop: '20px', marginBottom: '10px' }}>⚠️ MT4: No se sincronizan los trades</h3>
              <p style={{ marginBottom: '10px' }}>Si ves que no se sincronizan los trades de MT4 a tu journal, 
                necesitas ir a la pestaña de "Historial de cuentas", click derecho y pulsa "Todo el historial"</p>

              <h3 style={{ color: '#0e7490', marginTop: '20px', marginBottom: '10px' }}>✅ Instalación Completada</h3>
              <p style={{ marginBottom: '15px' }}>
                Una vez el EA esté corriendo en el gráfico:<br/>
                • Verás logs en el Journal (pestaña "Expertos")<br/>
                • Los trades se sincronizarán automáticamente<br/>
                • El EA se reinicia si cierras y abres MetaTrader
              </p>

              <h3 style={{ color: '#0e7490', marginTop: '20px', marginBottom: '10px' }}>❓ Preguntas Frecuentes</h3>
              <p style={{ marginBottom: '10px' }}>
                <strong>¿Puedo instalar en varias cuentas?</strong><br/>
                ✅ Sí, repite el proceso en cada cuenta con el MISMO email
              </p>
              <p style={{ marginBottom: '10px' }}>
                <strong>¿Se guardan los trades automáticamente?</strong><br/>
                ✅ Sí, cada 5 minutos o al instante cuando cierras un trade
              </p>
              <p style={{ marginBottom: '20px' }}>
                <strong>¿Qué pasa si desinstalo?</strong><br/>
                ✅ Se elimina el EA pero puedes reinstalarlo en cualquier momento
              </p>
            </div>

            <button
              onClick={() => setShowInfoModal(false)}
              style={{
                padding: '12px 20px',
                backgroundColor: '#0e7490',
                color: '#0b1220',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
                width: '100%',
                marginTop: '20px',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = '#1aa6c3';
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = '#0e7490';
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Exponer para que index.jsx pueda acceder
window.App = App;

// También para ES6 modules si es necesario
export default App;
