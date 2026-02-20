// Verificar disponibilidad de globals antes de montar
console.log('🔍 Verificando globales...');
console.log('  - window.React:', typeof window.React);
console.log('  - window.ReactDOM:', typeof window.ReactDOM);
console.log('  - window.App:', typeof window.App);
console.log('  - window.useTerminals:', typeof window.useTerminals);
console.log('  - window.useConfig:', typeof window.useConfig);
console.log('  - window.useConnectivity:', typeof window.useConnectivity);
console.log('  - window.electronAPI:', typeof window.electronAPI);

// Esperar a que App esté disponible
if (window.App) {
  try {
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(window.App));
    window.appLoaded = true;  // Marcar como cargado para error handling
    console.log('✅ Aplicación montada correctamente en el DOM');
  } catch (error) {
    console.error('❌ ERROR al montar la aplicación:', error);
    window.appLoaded = false;
  }
} else {
  console.error('❌ ERROR: window.App no está disponible');
  console.error('App.js no se ejecutó correctamente');
  window.appLoaded = false;
}