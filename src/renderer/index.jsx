// Esperar a que App.jsx esté disponible
if (window.App) {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(React.createElement(window.App));
  window.appLoaded = true;  // Marcar como cargado para error handling
  console.log('✅ Aplicación cargada correctamente');
} else {
  console.error('❌ ERROR: window.App no está disponible');
  console.error('App.jsx no se ejecutó correctamente');
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = '<div style="color: red; padding: 20px; text-align: center;">❌ Error: App.jsx no se encontró</div>';
  }
}