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
  const emailInputRef = useRef(null);

  useEffect(() => {
    handleScan();
    // Auto-focus en el email input
    setTimeout(() => {
      emailInputRef?.current?.focus();
    }, 500);
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

  const handleScan = async () => {
    setScanning(true);
    try {
      const result = await window.electronAPI.scanTerminals();
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

  const handleInstall = async (terminalId) => {
    // ✅ Validación ANTES de intentar instalar
    if (!userEmail || !userEmail.includes('@')) {
      showError('⚠️ Por favor ingresa un email válido\n\nEjemplo: usuario@ejemplo.com');
      return;
    }

    // Evitar doble click
    if (installing[terminalId]) return;

    const executeInstall = async () => {
      setInstalling(prev => ({ ...prev, [terminalId]: true }));
      setStatus(prev => ({ ...prev, [terminalId]: '⏳ Instalando EA...' }));

      try {
        const result = await window.electronAPI.installEA(terminalId, { userEmail });
        if (result.success) {
          setStatus(prev => ({ ...prev, [terminalId]: '✅ EA instalado correctamente' }));
          // Limpiar estado después de 3 segundos
          setTimeout(() => {
            setStatus(prev => ({ ...prev, [terminalId]: '' }));
            setInstalling(prev => ({ ...prev, [terminalId]: false }));
            handleScan();
          }, 3000);
        } else {
          const errorMsg = result.error || 'Error desconocido';
          setStatus(prev => ({ ...prev, [terminalId]: `❌ Error: ${errorMsg}` }));
          setInstalling(prev => ({ ...prev, [terminalId]: false }));
        }
      } catch (err) {
        const errorMsg = err.message || 'Error desconocido';
        const displayMsg = errorMsg.includes('no existe en BD')
          ? '❌ Debes registrarte con este mail en la plataforma.\n\nEstado: No disponible.'
          : `❌ ${errorMsg}`;
        setStatus(prev => ({ ...prev, [terminalId]: displayMsg }));
        setInstalling(prev => ({ ...prev, [terminalId]: false }));
      }
    };

    showConfirm({
      title: 'Instalar EA',
      message: `¿Instalar EA en esta terminal?\n\nEmail: ${userEmail}`,
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
            setStatus(prev => ({ ...prev, [terminalId]: '✅ EA desinstalado correctamente' }));
            // Limpiar estado después de 2 segundos
            setTimeout(() => {
              setStatus(prev => ({ ...prev, [terminalId]: '' }));
              setUninstalling(prev => ({ ...prev, [terminalId]: false }));
              handleScan();
            }, 2000);
          } else {
            const errorMsg = result.error || 'Error desconocido';
            setStatus(prev => ({ ...prev, [terminalId]: `❌ Error: ${errorMsg}` }));
            setUninstalling(prev => ({ ...prev, [terminalId]: false }));
          }
        } catch (err) {
          const errorMsg = err.message || 'Error desconocido';
          setStatus(prev => ({ ...prev, [terminalId]: `❌ ${errorMsg}` }));
          setUninstalling(prev => ({ ...prev, [terminalId]: false }));
        }
      }
    });
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
            <p style={{ color: '#90a4ae', fontSize: '14px', margin: '0' }}>Instalador de Expert Advisors para MetaTrader</p>
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
            📧 Email para sincronizar:
          </label>
          <input
            ref={emailInputRef}
            type="email"
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                emailInputRef.current?.blur();
              }
            }}
            placeholder="tu@email.com"
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#0b1220',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#e0e0e0',
              borderRadius: '4px',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              fontSize: '14px',
              transition: 'border-color 0.3s ease',
              outline: 'none'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'rgba(14,116,144,0.5)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(255,255,255,0.12)';
            }}
          />
          {userEmail && !userEmail.includes('@') && (
            <p style={{ color: '#ff6b6b', fontSize: '12px', marginTop: '8px' }}>
              ⚠️ Email inválido
            </p>
          )}
        </div>

        {/* Scan Button */}
        <div style={{ marginBottom: '30px' }}>
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
              transition: 'all 0.3s ease'
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
                          disabled={!userEmail || !userEmail.includes('@')}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: userEmail && userEmail.includes('@') ? '#0e7490' : '#555',
                            color: userEmail && userEmail.includes('@') ? '#000' : '#ccc',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            cursor: userEmail && userEmail.includes('@') ? 'pointer' : 'not-allowed',
                            transition: 'all 0.3s ease'
                          }}
                          onMouseOver={(e) => {
                            if (userEmail && userEmail.includes('@')) e.target.style.backgroundColor = '#1aa6c3';
                          }}
                          onMouseOut={(e) => {
                            if (userEmail && userEmail.includes('@')) e.target.style.backgroundColor = '#0e7490';
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

window.App = App;
