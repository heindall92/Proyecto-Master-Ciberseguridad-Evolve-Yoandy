document.getElementById('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const btn      = document.getElementById('btnLogin');
  const errorEl  = document.getElementById('errorMsg');

  btn.disabled = true;
  btn.textContent = '[ VERIFICANDO… ]';
  errorEl.classList.remove('show');

  try {
    const res  = await fetch('/api/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (res.ok) {
      // Store user info for the dashboard
      sessionStorage.setItem('valhalla_user', JSON.stringify(data.user));
      sessionStorage.setItem('valhalla_perms', JSON.stringify(data.permissions));
      window.location.href = '/';
    } else {
      errorEl.textContent = '// ERROR: ' + (data.error || 'Credenciales incorrectas');
      errorEl.classList.add('show');
      btn.disabled = false;
      btn.textContent = '[ ACCEDER ]';
    }
  } catch {
    errorEl.textContent = '// ERROR: No se puede conectar al servidor';
    errorEl.classList.add('show');
    btn.disabled = false;
    btn.textContent = '[ ACCEDER ]';
  }
});
