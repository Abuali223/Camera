/* Sentinel AI — login / sessiya boshqaruvi (mijoz tomoni)
 *
 * - Token localStorage'da saqlanadi → sahifa yangilanса yoki kesh (fayllar)
 *   tozalanса ham login saqlanib qoladi, qayta parol so'ralmaydi.
 * - Birinchi marta: parol o'rnatish (ro'yxatdan o'tish). Keyin: parol bilan kirish.
 * - Har bir /api so'roviga token avtomatik qo'shiladi (quyidagi fetch-patch).
 */

const Session = {
  KEY: 'sentinel_token',
  token: null,
  mode: 'login',       // 'login' yoki 'register'
  serverAuth: true,    // server auth mavjudmi (statik demo hostingda yo'q)

  _read() { try { return localStorage.getItem(this.KEY) || null; } catch { return null; } },
  _write(t) {
    try { t ? localStorage.setItem(this.KEY, t) : localStorage.removeItem(this.KEY); } catch {}
    this.token = t || null;
  },

  async boot() {
    this.token = this._read();
    let status;
    try {
      status = await fetch('/api/auth/status').then((r) => r.json());
    } catch {
      // server yo'q (masalan statik demo) — himoyasiz demo rejimga o'tamiz
      this.serverAuth = false;
      App.enterApp('operator');
      return;
    }
    if (!status.registered) {
      this.mode = 'register';
      this._showLogin();
      return;
    }
    // ro'yxatdan o'tilgan — saqlangan tokenni tekshiramiz
    if (this.token) {
      try {
        const s = await fetch('/api/auth/session').then((r) => r.json());
        if (s.valid) { App.enterApp(s.username); return; }
      } catch {}
    }
    this.mode = 'login';
    this._showLogin();
  },

  _showLogin() {
    const isReg = this.mode === 'register';
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('loginKicker', isReg ? 'YANGI HISOB' : 'TIZIMGA KIRISH');
    set('loginTitle', isReg ? 'Parol o\'rnating' : 'Xush kelibsiz');
    set('loginSub', isReg
      ? 'Birinchi kirish — nazorat markazi uchun maxfiy parol yarating.'
      : 'Nazorat markaziga kirish uchun parolingizni kiriting.');
    set('loginSubmitText', isReg ? 'Parolni saqlab, kirish' : 'Nazorat markaziga kirish');
    const hint = document.getElementById('loginHint');
    if (hint) hint.textContent = isReg ? 'Kamida 8 ta belgi. Buni eslab qoling — keyin shu parol bilan kirasiz.' : '';
    const err = document.getElementById('loginError');
    if (err) err.textContent = '';
    const pass = document.getElementById('passInput');
    if (pass) { pass.value = ''; pass.setAttribute('autocomplete', isReg ? 'new-password' : 'current-password'); }
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('appShell').classList.add('hidden');
    setTimeout(() => { if (pass) pass.focus(); }, 50);
  },

  async submit() {
    const err = document.getElementById('loginError');
    const btn = document.querySelector('#loginForm .btn-primary');
    const password = document.getElementById('passInput').value;
    const username = (document.getElementById('userInput').value || '').trim() || 'operator';
    if (err) err.textContent = '';

    if (!this.serverAuth) { App.enterApp(username); return; }
    if (!password) { if (err) err.textContent = 'Parolni kiriting.'; return; }

    if (btn) btn.disabled = true;
    const path = this.mode === 'register' ? '/api/auth/register' : '/api/auth/login';
    let r;
    try {
      r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }).then((x) => x.json());
    } catch {
      if (btn) btn.disabled = false;
      if (err) err.textContent = 'Serverga ulanib bo\'lmadi.';
      return;
    }
    if (btn) btn.disabled = false;

    if (r && r.ok && r.token) {
      this._write(r.token);
      App.enterApp(r.username || username);
    } else if (err) {
      err.textContent = (r && r.message) || 'Kirishda xatolik yuz berdi.';
    }
  },

  async logout() {
    if (this.serverAuth && this.token) {
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    }
    this._write(null);
    App.doLogoutUi();
    this.mode = 'login';
    this._showLogin();
  },
};

// --- Har bir /api so'roviga tokenni avtomatik qo'shamiz ---
(function patchFetch() {
  const orig = window.fetch;
  window.fetch = function (input, init) {
    try {
      const u = typeof input === 'string' ? input : (input && input.url) || '';
      if (u.indexOf('/api/') !== -1 && Session.token) {
        init = init || {};
        const h = new Headers((init && init.headers) || {});
        if (!h.has('Authorization')) h.set('Authorization', 'Bearer ' + Session.token);
        init.headers = h;
      }
    } catch {}
    return orig.call(this, input, init);
  };
})();

// tokenni darhol o'qib qo'yamiz (erta /api so'rovlar ham himoyalansin)
try { Session.token = localStorage.getItem(Session.KEY) || null; } catch {}
