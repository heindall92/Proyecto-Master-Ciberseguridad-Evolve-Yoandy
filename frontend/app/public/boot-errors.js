// Pantalla de error de arranque: si la consola falla antes de pintarse, muestra el motivo
// en lugar de una página en blanco. Está en un fichero (no inline) para que la CSP del
// gateway pueda mantener `script-src 'self'` sin 'unsafe-inline'.
window.onerror = function(msg, url, line, col, error) {
  var pre = document.createElement('pre');
  pre.style.cssText = 'color:red;font-size:14px;padding:20px;z-index:999999;position:fixed;background:#000;top:0;left:0;width:100%;height:100%;overflow:auto;white-space:pre-wrap;';
  pre.textContent = 'ERROR: ' + String(msg) + '\nLine: ' + line + '\n' + (error && error.stack ? error.stack : '');
  document.body.replaceChildren(pre);
  return false;
};
window.addEventListener('unhandledrejection', function(event) {
  var pre = document.createElement('pre');
  pre.style.cssText = 'color:red;font-size:14px;padding:20px;z-index:999999;position:fixed;background:#000;top:0;left:0;width:100%;height:100%;overflow:auto;white-space:pre-wrap;';
  pre.textContent = 'PROMISE ERROR: ' + String(event.reason);
  document.body.replaceChildren(pre);
});
