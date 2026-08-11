/* Sentinel AI — asosiy ilova logikasi */

const App = {
  demo: true,
  loggedIn: false,
  serverOk: false,
  cameras: [],
  streams: new Map(), // camId -> DemoScene|RealStream
  detections: new Map(), // camId -> so'nggi aniqlangan obyektlar
  alerts: [],
  snapshots: [],
  screen: 'live',
  selAlert: 0,
  alertFilter: 'all',
  detailCam: null,
  gridSize: 2,
  muted: false,
  sirenaOn: true,
  _alertCooldown: new Map(), // camId -> timestamp
  _seq: 0,

  // ---------------------------------------------------------- ishga tushirish
  async init() {
    this.bindUi();
    this.startClock();
    await this.loadCameras();
    Detector.init(this.demo);
    this.buildStreams();
    this.renderAll();
    this.startUpdateChecker();
  },

  /** Yangi versiya chiqsa saytni avtomatik yangilaydi (kesh muammosini hal qiladi).
   *  Deploy paytida __BUILD__ o'rniga commit belgisi yoziladi; lokal serverda o'chiq. */
  startUpdateChecker() {
    const build = window.BUILD;
    if (!build || build === '__BUILD__') return;
    setInterval(async () => {
      try {
        const r = await fetch('version.json?ts=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) return;
        const v = await r.json();
        if (v.build && v.build !== build) {
          this.toast('Yangi versiya topildi', 'Sahifa 3 soniyada yangilanadi…', 'var(--accent)');
          setTimeout(() => location.reload(), 3000);
        }
      } catch {}
    }, 5 * 60 * 1000);
  },

  async loadCameras() {
    try {
      const st = await fetch('/api/status').then((x) => x.json());
      this.features = { ai: st.ai, telegram: st.telegram, tts: st.tts };
      const r = await fetch('/api/cameras');
      const data = await r.json();
      this.serverOk = true;
      if (data.demo || !data.cameras.length) {
        this.demo = true;
        this.cameras = DEMO_CAMERAS.map((c) => ({ ...c }));
      } else {
        this.demo = false;
        this.cameras = data.cameras.map((c) => ({ ...c, online: true, scene: 'entrance' }));
      }
    } catch {
      // server yo'q (masalan Firebase hostingdagi statik demo) — demo rejim
      this.serverOk = false;
      this.features = { ai: false, telegram: false, tts: false };
      this.demo = true;
      this.cameras = DEMO_CAMERAS.map((c) => ({ ...c }));
    }
    const pill = document.getElementById('aiPill');
    const pillText = document.getElementById('aiPillText');
    if (this.demo) {
      pill.classList.add('demo');
      pillText.textContent = 'AI FAOL · DEMO';
    } else {
      pillText.textContent = 'AI FAOL';
    }
  },

  buildStreams() {
    this.cameras.forEach((cam, i) => {
      if (!cam.online) return;
      const s = createStream(cam, i, this.demo);
      this.streams.set(cam.id, s);
      // Demo — darhol boshlaymiz (faqat canvas, WS yo'q).
      // Real oqimlar esa FAQAT login'dan keyin boshlanadi (enterApp -> reconnectStreams)
      // — token bilan. Aks holda login oynasi ortida noto'g'ri parolда konsол xato bilan to'ladi.
      if (this.demo) s.start();
    });
  },

  // ---------------------------------------------------------- UI bog'lash
  bindUi() {
    document.getElementById('loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      Session.submit();
    });
    document.getElementById('logoutBtn').addEventListener('click', () => Session.logout());
    document.getElementById('themeBtn').addEventListener('click', () => this.toggleTheme());
    document.getElementById('muteBtn').addEventListener('click', () => this.toggleMute());
    document.querySelectorAll('.nav-btn[data-screen]').forEach((b) => {
      b.addEventListener('click', () => this.go(b.dataset.screen));
    });
    document.getElementById('gridSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.gridSize = Number(b.dataset.g);
      document.querySelectorAll('#gridSeg button').forEach((x) => x.classList.toggle('on', x === b));
      document.getElementById('camGrid').className = 'cam-grid' + (this.gridSize === 3 ? ' g3' : this.gridSize === 4 ? ' g4' : '');
    });
    document.getElementById('alertFilters').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.alertFilter = b.dataset.f;
      document.querySelectorAll('#alertFilters button').forEach((x) => x.classList.toggle('on', x === b));
      this.renderAlerts();
    });
    document.getElementById('bellBtn').addEventListener('click', () => this.go('alerts'));
    document.getElementById('addCamBtn').addEventListener('click', () => {
      this.toast('Kamera qo\'shish', 'server/cameras.json fayliga yangi kamera kiriting — dastur avtomatik yuklaydi', 'var(--accent)');
    });
    document.getElementById('searchInput').addEventListener('input', (e) => this.search(e.target.value));
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('searchInput').focus();
      }
    });
  },

  /** Login/token muvaffaqiyatli bo'lgach ilova ichkarisini ochadi (Session chaqiradi) */
  enterApp(username) {
    const user = username || (document.getElementById('userInput').value.trim() || 'operator');
    const site = document.getElementById('siteSelect').value;
    document.getElementById('userName').textContent = user.split('.').map((s) => s[0]?.toUpperCase() + s.slice(1)).join(' ');
    document.getElementById('avatarInitials').textContent = user.slice(0, 2).toUpperCase();
    document.getElementById('siteLabel').textContent = site.toUpperCase();
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');
    document.getElementById('fabBtn').classList.remove('hidden');
    if (!this.loggedIn) {
      this.loggedIn = true;
      this.startDetectionLoop();
      if (this.demo) this.startDemoEvents();
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
    // Video oqimlari login'dan oldin (tokensiz) ochilgan bo'lsa — token bilan
    // darhol qayta ulaymiz, aks holda kameralar 4-8s kech ko'rinardi.
    if (!this.demo && window.Session && Session.token) this.reconnectStreams();
    Assistant.say(`Xush kelibsiz, ${user}! Tizim nazorat ostida. Menga buyruq berishingiz mumkin — masalan "holatni ayt" yoki "rasmga ol".`, false);
  },

  reconnectStreams() {
    this.streams.forEach((s) => {
      if (s.stop && s.start) { s.stop(); s._fails = 0; s.start(); }
    });
    this.startDiagLoop();
  },

  // Server yashirin ishlagani uchun — RTSP ulanish sababini brauzerда ko'rsatamiz.
  startDiagLoop() {
    if (this.demo || this._diagTimer) return;
    const poll = async () => {
      try {
        const d = await fetch('/api/diag').then((r) => r.json());
        this._diag = d.errors || {};
      } catch { this._diag = {}; }
    };
    poll();
    this._diagTimer = setInterval(poll, 4000);
  },

  // Har kadr chaqiriladi: video kelayotgan bo'lsa statusni yashiradi,
  // aks holda "ULANMOQDA…" yoki aniq xato sababini ko'rsatadi.
  _updateTileStatus(tile, camId) {
    const el = tile.querySelector('.cam-status');
    if (!el) return;
    if (this.demo) { el.style.display = 'none'; return; }
    const s = this.streams.get(camId);
    const hasVideo = s && s.video && s.video.videoWidth > 0 && s.video.readyState >= 2;
    if (hasVideo) { el.style.display = 'none'; return; }
    const err = this._diag && this._diag[camId];
    el.style.display = '';
    if (err) {
      el.textContent = '⚠ ' + err.msg;
      el.classList.add('err');
    } else {
      el.textContent = 'ULANMOQDA…';
      el.classList.remove('err');
    }
  },

  /** Chiqish UI qismi (Session tokenni tozalab, buni chaqiradi) */
  doLogoutUi() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('appShell').classList.add('hidden');
    document.getElementById('fabBtn').classList.add('hidden');
    document.getElementById('assistantPanel').classList.add('hidden');
  },

  toggleTheme() {
    const b = document.body;
    const dark = b.dataset.theme === 'dark';
    b.dataset.theme = dark ? 'light' : 'dark';
    document.getElementById('moonIcon').classList.toggle('hidden', dark);
    document.getElementById('sunIcon').classList.toggle('hidden', !dark);
  },

  toggleMute() {
    this.muted = !this.muted;
    document.getElementById('volIcon').classList.toggle('hidden', this.muted);
    document.getElementById('volOffIcon').classList.toggle('hidden', !this.muted);
  },

  _stopDetailStream() {
    // zoom/filtrni tozalaymiz — demo canvas grid'ga qaytса kichrayib/rangi o'zgarib qolmasin
    const feed = this._detailFeed && this._detailFeed.el;
    if (feed) { feed.style.transform = ''; feed.style.filter = ''; }
    this._zoomState = { z: 1, tx: 0, ty: 0 };
    if (this.detailStream) {
      try { this.detailStream.stop(); } catch {}
      this.detailStream = null;
    }
  },

  go(screen) {
    // batafsil ko'rinishдан chiqganда 8MP asosiy oqimni to'xtatamiz (resursni tejash)
    if (this.screen === 'detail' && screen !== 'detail') this._stopDetailStream();
    this.screen = screen;
    document.querySelectorAll('.nav-btn[data-screen]').forEach((b) =>
      b.classList.toggle('active', b.dataset.screen === screen)
    );
    ['live', 'alerts', 'analytics', 'detail', 'snapshots', 'cameras'].forEach((s) => {
      document.getElementById('screen-' + s).classList.toggle('hidden', s !== screen);
    });
    if (screen === 'alerts') this.renderAlerts();
    if (screen === 'analytics') this.renderAnalytics();
    if (screen === 'detail') this.renderDetail();
    if (screen === 'snapshots') this.renderSnapshots();
    if (screen === 'cameras') this.renderCamerasScreen();
    if (screen === 'live') this.renderLive();
  },

  search(q) {
    q = q.trim().toLowerCase();
    if (!q) return;
    const cam = this.cameras.find(
      (c) => c.id.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.zone.toLowerCase().includes(q)
    );
    if (cam) {
      this.detailCam = cam.id;
      this.go('detail');
    }
  },

  startClock() {
    const p = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const d = new Date();
      document.getElementById('clock').textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    };
    tick();
    setInterval(tick, 1000);
  },

  nowStr() {
    const p = (n) => String(n).padStart(2, '0');
    const d = new Date();
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  },

  // ---------------------------------------------------------- AI aniqlash sikli
  startDetectionLoop() {
    // Yengil rejim: har tickда faqat BITTA kamera tahlil qilinadi (navbat bilan).
    // Shu tufayli 8 kamera brauzerни sekinlashtirmaydi; har kamera ~har necha
    // soniyада tekshiriladi. Demo rejimда hammasini tez tekshiraveradi.
    let idx = 0;
    const perTick = this.demo ? 99 : 2; // demo — hammasi; real — navbat bilan (2 tadan)
    setInterval(async () => {
      const list = this.cameras.filter((c) => this.streams.get(c.id));
      if (!list.length) return;
      const batch = [];
      for (let k = 0; k < Math.min(perTick, list.length); k++) {
        batch.push(list[(idx + k) % list.length]);
      }
      idx = (idx + batch.length) % list.length;
      for (const cam of batch) {
        const stream = this.streams.get(cam.id);
        if (!stream) continue;
        const dets = await Detector.detect(stream, cam);
        // yong'in / tutun aniqlash (yordamchi heuristika)
        if (window.Hazard) {
          const hz = Hazard.analyze(stream, cam);
          if (hz.length) dets.push(...hz);
        }
        this.detections.set(cam.id, dets);
        const danger = dets.find((d) => d.danger);
        if (danger && this._canAlert(cam.id)) {
          const typeMap = {
            person: 'Ruxsatsiz kirish',
            fire: "🔥 YONG'IN XAVFI ANIQLANDI",
            smoke: '💨 TUTUN ANIQLANDI',
          };
          this.raiseAlert({
            type: typeMap[danger.kind] || `Xavfli obyekt: ${danger.label}`,
            cam: cam.id, zone: cam.zone, level: 'high', conf: danger.conf,
          });
        }
      }
      if (this.screen === 'live') this.updateLiveOverlays();
      if (this.screen === 'detail') this.updateDetailOverlays();
    }, this.demo ? 900 : 700);
    this.startOverlayLoop();
  },

  /** Ramka pozitsiyasini HAR KADRDA (60fps) jism bilan birga yangilaydi.
   *  Yorliq/ishonch sekin (detektor) sikldan, pozitsiya esa jonli oqimdan olinadi —
   *  shu tufayli ramka jismdan orqada qolmaydi. */
  startOverlayLoop() {
    if (this._overlayRunning) return;
    this._overlayRunning = true;
    const loop = () => {
      if (this.loggedIn) {
        if (this.screen === 'live') {
          document.querySelectorAll('#camGrid .cam-tile').forEach((tile) => {
            const cam = this.cameras.find((c) => c.id === tile.dataset.cam);
            if (cam && cam.online) this._renderBoxes(tile.querySelector('.boxes'), this._liveDetections(cam), !this.demo);
          });
        } else if (this.screen === 'detail') {
          const cam = this.cameras.find((c) => c.id === this.detailCam);
          if (cam && cam.online) this._renderBoxes(document.getElementById('bigBoxes'), this._liveDetections(cam), !this.demo);
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  /** Ramka uchun ma'lumot: demo'da jonli pozitsiya + keshdagi yorliq; real'da kesh. */
  _liveDetections(cam) {
    const cached = this.detections.get(cam.id) || [];
    const stream = this.streams.get(cam.id);
    if (this.demo && stream && Array.isArray(stream.objects)) {
      return stream.objects.map((o, i) => {
        const c = cached[i] || {};
        return {
          kind: o.kind,
          label: c.label || (o.kind === 'person' ? 'SHAXS' : 'AVTOMOBIL'),
          conf: c.conf || o.conf || 90,
          danger: !!c.danger,
          x: o.x, y: o.y, w: o.w, h: o.h,
        };
      });
    }
    return cached;
  },

  /** Ramkalarni DOM elementlarini qayta ishlatib chizadi (innerHTML qayta qurmaydi) —
   *  shu tufayli pozitsiya silliq yangilanadi. smooth=true bo'lsa CSS o'tish qo'shiladi. */
  _renderBoxes(container, dets, smooth) {
    if (!container) return;
    const boxes = container._boxes || (container._boxes = []);
    while (boxes.length < dets.length) {
      const el = document.createElement('div');
      el.className = 'det-box';
      const lbl = document.createElement('span');
      lbl.className = 'lbl';
      el.appendChild(lbl);
      container.appendChild(el);
      boxes.push(el);
    }
    while (boxes.length > dets.length) {
      const el = boxes.pop();
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    for (let i = 0; i < dets.length; i++) {
      const d = dets[i], el = boxes[i];
      const color = d.danger ? 'var(--hi)' : d.kind === 'person' ? 'var(--med)' : 'var(--accent-2)';
      el.classList.toggle('smooth', !!smooth);
      el.style.left = (d.x * 100).toFixed(2) + '%';
      el.style.top = (d.y * 100).toFixed(2) + '%';
      el.style.width = (d.w * 100).toFixed(2) + '%';
      el.style.height = (d.h * 100).toFixed(2) + '%';
      el.style.borderColor = color;
      el.style.color = color;
      const lbl = el.firstChild;
      lbl.style.background = color;
      lbl.textContent = `${d.label} · ${d.conf}%`;
    }
  },

  _canAlert(camId) {
    const last = this._alertCooldown.get(camId) || 0;
    if (Date.now() - last < 150000) return false;
    this._alertCooldown.set(camId, Date.now());
    return true;
  },

  startDemoEvents() {
    // demo ssenariy: dastlabki tarix + vaqti-vaqti bilan yangi hodisalar
    const now = Date.now();
    [3, 2, 1].forEach((h, i) => {
      const ev = DEMO_EVENTS[(i + 3) % DEMO_EVENTS.length];
      const cam = this.cameras[ev.camIdx];
      this.alerts.push(this._makeAlert({ type: ev.type, cam: cam.id, zone: cam.zone, level: ev.level, conf: ev.conf }, now - h * 27 * 60000, true));
    });
    this.updateAlertBadges();

    setInterval(() => {
      const ev = DEMO_EVENTS[Math.floor(Math.random() * DEMO_EVENTS.length)];
      const cam = this.cameras[ev.camIdx];
      if (!cam.online) return;
      if (ev.level === 'high' && !this._canAlert(cam.id)) return;
      this.raiseAlert({ type: ev.type, cam: cam.id, zone: cam.zone, level: ev.level, conf: ev.conf + Math.floor(Math.random() * 5) - 2 });
    }, 22000 + Math.random() * 12000);
  },

  // ---------------------------------------------------------- signallar
  _makeAlert(a, ts, silent) {
    return {
      id: ++this._seq,
      ts: ts || Date.now(),
      time: new Date(ts || Date.now()).toTimeString().slice(0, 8),
      snapshot: null,
      acked: Boolean(silent),
      ...a,
    };
  },

  raiseAlert(a) {
    const alert = this._makeAlert(a);
    // surat faqat yuqori xavfli vaziyatda avtomatik olinadi
    // (qolgan hollarda foydalanuvchi o'zi "rasmga ol" deb buyuradi)
    if (a.level === 'high') {
      const snap = this.captureFrame(a.cam);
      if (snap) {
        alert.snapshot = snap;
        this.addSnapshot(a.cam, snap, a.type, true);
      }
    }
    this.alerts.unshift(alert);
    if (this.alerts.length > 200) this.alerts.pop();
    this.updateAlertBadges();

    const L = LEVELS[a.level];
    this.toast(a.type, `${a.cam} · ${a.zone} · ishonch ${a.conf}%`, L.color);

    if (a.level === 'high') {
      this.playSiren();
      this.notifyBrowser(alert);
      this.notifyTelegram(alert);
      Assistant.onDanger(alert);
    } else if (a.level === 'med') {
      this.playBeep();
      this.notifyBrowser(alert);
    }

    if (this.screen === 'live') {
      this.renderEventRail();
      this.updateLiveSummary();
    }
    if (this.screen === 'alerts') this.renderAlerts();
    return alert;
  },

  updateLiveSummary() {
    const unacked = this.alerts.filter((a) => !a.acked).length;
    const online = this.cameras.filter((c) => c.online).length;
    const el = document.getElementById('liveSummary');
    if (el) el.innerHTML =
      `${this.cameras.length} kamera · <span style="color:var(--low)">${online} faol</span> · <span style="color:var(--hi)">${unacked} signal</span> · <span style="color:var(--text-3)">${this.cameras.length - online} oflayn</span>`;
  },

  updateAlertBadges() {
    const un = this.alerts.filter((a) => !a.acked).length;
    document.getElementById('alertCount').textContent = un;
    document.getElementById('bellBadge').textContent = un;
  },

  notifyBrowser(alert) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      new Notification('🚨 Sentinel AI: ' + alert.type, {
        body: `${alert.cam} · ${alert.zone} · ${alert.time} · ishonch ${alert.conf}%`,
        icon: undefined,
      });
    } catch {}
  },

  async notifyTelegram(alert) {
    if (!this.serverOk || !this.features?.telegram) return;
    try {
      await fetch('/api/notify/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `${alert.type}\nKamera: ${alert.cam} (${alert.zone})\nVaqt: ${alert.time}\nAI ishonch: ${alert.conf}%` }),
      });
    } catch {}
  },

  // ---------------------------------------------------------- ovoz
  _audioCtx() {
    if (!this._actx) this._actx = new (window.AudioContext || window.webkitAudioContext)();
    return this._actx;
  },

  playSiren() {
    if (this.muted || !this.sirenaOn) return;
    const ctx = this._audioCtx();
    const t0 = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(650, t0 + i * 0.6);
      o.frequency.linearRampToValueAtTime(950, t0 + i * 0.6 + 0.3);
      o.frequency.linearRampToValueAtTime(650, t0 + i * 0.6 + 0.6);
      g.gain.setValueAtTime(0.12, t0 + i * 0.6);
      g.gain.linearRampToValueAtTime(0.0001, t0 + i * 0.6 + 0.58);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + i * 0.6);
      o.stop(t0 + i * 0.6 + 0.6);
    }
  },

  playBeep() {
    if (this.muted) return;
    const ctx = this._audioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.09, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.36);
  },

  // ---------------------------------------------------------- suratlar
  captureFrame(camId) {
    // batafsil ko'rinish ochiq bo'lsa — undan (8MP) suratga olamiz
    let stream = (this.detailCam === camId && this._detailFeed) ? this._detailFeed : this.streams.get(camId);
    if (!stream || !stream.canvas) return null;
    try {
      if (stream.grab) stream.grab(); // joriy kadrni canvasga yangilaymiz
      return stream.canvas.toDataURL('image/jpeg', 0.92);
    } catch {
      return null;
    }
  },

  addSnapshot(camId, dataUrl, reason, auto) {
    const cam = this.cameras.find((c) => c.id === camId);
    this.snapshots.unshift({
      id: ++this._seq,
      cam: camId,
      zone: cam ? cam.zone : '',
      time: this.nowStr(),
      date: new Date().toLocaleDateString('uz-UZ'),
      reason: reason || (auto ? 'Avtomatik' : "Qo'lda olingan"),
      auto: Boolean(auto),
      url: dataUrl,
    });
    if (this.snapshots.length > 60) this.snapshots.pop();
    document.getElementById('snapCount').textContent = this.snapshots.length;
    if (this.screen === 'snapshots') this.renderSnapshots();
  },

  /** Yordamchi va tugmalar uchun: kameradan surat olish (+ yuklab olish) */
  takeSnapshot(camId, download) {
    camId = camId || this.detailCam || (this.cameras[0] && this.cameras[0].id);
    const url = this.captureFrame(camId);
    if (!url) return null;
    this.addSnapshot(camId, url, "Qo'lda olingan", false);
    if (download) this.downloadSnapshot(url, camId);
    this.toast('Surat olindi', `${camId} · ${this.nowStr()}`, 'var(--accent)');
    return url;
  },

  downloadSnapshot(url, camId) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentinel_${camId}_${Date.now()}.jpg`;
    a.click();
  },

  // ---------------------------------------------------------- toast
  toast(title, sub, color) {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.borderLeftColor = color || 'var(--hi)';
    el.innerHTML = `
      <div class="ic" style="background:${color || 'var(--hi)'}20">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="${(color || 'var(--hi)').startsWith('var') ? 'currentColor' : color}" stroke-width="1.8" style="color:${color}"><path d="M12 3l9.5 16.5H2.5z"/><path d="M12 10v4M12 17h.01"/></svg>
      </div>
      <div><div class="t"></div><div class="s"></div></div>`;
    el.querySelector('.t').textContent = title;
    el.querySelector('.s').textContent = sub;
    box.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  },

  // ---------------------------------------------------------- RENDER: umumiy
  renderAll() {
    this.renderLive();
    this.renderEventRail();
    this.updateSystemCard();
  },

  updateSystemCard() {
    const online = this.cameras.filter((c) => c.online).length;
    document.getElementById('sysCams').textContent = `${online}/${this.cameras.length}`;
    document.getElementById('sysLatency').innerHTML = `${this.demo ? 42 : 38 + Math.floor(Math.random() * 20)}<small>ms</small>`;
    document.getElementById('sysHealth').textContent = online === this.cameras.length ? "SOG'LOM" : online > 0 ? "QISMAN" : 'XATO';
  },

  // ---------------------------------------------------------- RENDER: jonli devor
  renderLive() {
    const grid = document.getElementById('camGrid');
    grid.innerHTML = '';
    this.updateLiveSummary();

    this.cameras.forEach((cam) => {
      const tile = document.createElement('div');
      tile.className = 'cam-tile';
      tile.dataset.cam = cam.id;
      const stream = this.streams.get(cam.id);

      tile.innerHTML += `
        <div class="vign"></div>
        ${cam.online ? '<div class="scanline"></div>' : ''}
        <div class="boxes"></div>
        <div class="cam-top">
          <div class="idz"><div class="cid">${cam.id}</div><div class="czone">${cam.zone}</div></div>
          ${cam.online ? `<span class="cam-badge"><span class="dot" style="background:var(--hi)"></span>LIVE</span>` : ''}
        </div>
        ${cam.online ? `
        <div class="cam-status">ULANMOQDA…</div>
        <div class="cam-bottom">
          <span class="cam-ts">${this.nowStr()}</span>
          <span class="chipwrap"></span>
        </div>` : `
        <div class="cam-offline">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--text-3)" stroke-width="1.6"><path d="M3 3l18 18M10.6 6.1A6 6 0 0121 12M7 8a6 6 0 00-1.6 2M12 20h.01"/></svg>
          <span class="t1">SIGNAL YO'Q</span>
          <span class="t2">${cam.id} · ${cam.zone}</span>
        </div>`}
      `;

      if (cam.online && stream) {
        // video/canvas elementini birinchi qilib qo'yamiz (innerHTML uni o'chirgan)
        tile.insertBefore(stream.el, tile.firstChild);
      }

      tile.addEventListener('click', () => {
        this.detailCam = cam.id;
        this.go('detail');
      });
      grid.appendChild(tile);
    });
    this.updateLiveOverlays();
  },

  updateLiveOverlays() {
    document.querySelectorAll('#camGrid .cam-tile').forEach((tile) => {
      const camId = tile.dataset.cam;
      const cam = this.cameras.find((c) => c.id === camId);
      if (!cam || !cam.online) return;
      this._updateTileStatus(tile, camId); // "ULANMOQDA…" / xato sababi
      const dets = this.detections.get(camId) || [];
      // Eslatma: ramkalar (.boxes) endi startOverlayLoop() da har kadrda chiziladi.
      const ts = tile.querySelector('.cam-ts');
      if (ts) ts.textContent = this.nowStr();
      const chipwrap = tile.querySelector('.chipwrap');
      if (chipwrap) {
        const danger = dets.find((d) => d.danger);
        chipwrap.innerHTML = danger
          ? `<span class="cam-chip" style="background:var(--hi)">▲ Ruxsatsiz kirish</span>` : '';
      }
      // xavf halqasi
      let ring = tile.querySelector('.cam-ring');
      const hasDanger = dets.some((d) => d.danger);
      if (hasDanger && !ring) {
        ring = document.createElement('div');
        ring.className = 'cam-ring';
        ring.style.borderColor = 'var(--hi)';
        ring.style.color = 'var(--hi)';
        tile.appendChild(ring);
      } else if (!hasDanger && ring) ring.remove();
    });
  },

  renderEventRail() {
    const rail = document.getElementById('eventRail');
    const ago = (ts) => {
      const s = Math.floor((Date.now() - ts) / 1000);
      if (s < 60) return 'hozir';
      if (s < 3600) return Math.floor(s / 60) + ' daq';
      return Math.floor(s / 3600) + ' soat';
    };
    rail.innerHTML = this.alerts.slice(0, 12).map((a) => {
      const L = LEVELS[a.level];
      return `<div class="rail-item">
        <div class="bar" style="background:${L.color}"></div>
        <div class="bd">
          <div class="r1"><span class="tag" style="color:${L.color};background:${L.soft}">${L.label}</span><span class="ago">${ago(a.ts)}</span></div>
          <div class="ty">${a.type}</div>
          <div class="loc">${a.cam} · ${a.zone}</div>
        </div>
      </div>`;
    }).join('') || '<div class="empty-note">Hodisalar yo\'q</div>';
  },

  // ---------------------------------------------------------- RENDER: signallar
  renderAlerts() {
    const list = document.getElementById('alertList');
    const filtered = this.alerts.filter((a) => this.alertFilter === 'all' || a.level === this.alertFilter);
    const un = this.alerts.filter((a) => !a.acked).length;
    document.getElementById('alertsSummary').innerHTML =
      `Bugun ${this.alerts.length} hodisa · <span style="color:var(--hi)">${un} hal etilmagan</span>`;

    if (!filtered.length) {
      list.innerHTML = '<div class="empty-note">Bu filtr bo\'yicha signal yo\'q</div>';
      document.getElementById('alertDetail').innerHTML = '';
      return;
    }
    if (this.selAlert >= filtered.length) this.selAlert = 0;

    list.innerHTML = filtered.map((a, i) => {
      const L = LEVELS[a.level];
      return `<div class="alert-row ${i === this.selAlert ? 'active' : ''}" data-i="${i}">
        <div class="alert-thumb">
          ${a.snapshot ? `<img src="${a.snapshot}" alt="">` : `<div class="bx" style="border-color:${L.color}"></div>`}
        </div>
        <div class="bd">
          <div class="r1"><span class="ty">${a.type}</span><span class="tagb" style="color:${L.color};background:${L.soft};border-color:${L.color}">${L.label}</span></div>
          <div class="loc">${a.cam} · ${a.zone} · ${a.time}</div>
        </div>
        <div class="cf"><div class="v" style="color:${L.color}">${a.conf}%</div><div class="l">ishonch</div></div>
      </div>`;
    }).join('');

    list.querySelectorAll('.alert-row').forEach((row) => {
      row.addEventListener('click', () => {
        this.selAlert = Number(row.dataset.i);
        this.renderAlerts();
      });
    });

    const a = filtered[this.selAlert];
    const L = LEVELS[a.level];
    document.getElementById('alertDetail').innerHTML = `
      <div class="detail-feed">
        ${a.snapshot
          ? `<img src="${a.snapshot}" alt="">`
          : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-3);font:500 11px var(--mono)">SURAT YO'Q</div>`}
        <div style="position:absolute;top:10px;left:12px;font:600 11px var(--mono);color:#D6E6F2;text-shadow:0 1px 3px #000">${a.cam} · ${a.zone}</div>
        <div style="position:absolute;top:10px;right:12px;display:flex;align-items:center;gap:5px;background:rgba(255,80,100,.85);color:#fff;font:600 9px var(--mono);padding:3px 7px;border-radius:5px"><span style="width:6px;height:6px;border-radius:50%;background:#fff;animation:blink 1.3s infinite"></span>REC</div>
        <div style="position:absolute;bottom:10px;left:12px;font:500 10px var(--mono);color:#C3D3E1;text-shadow:0 1px 2px #000">${new Date(a.ts).toLocaleDateString('uz-UZ')} · ${a.time}</div>
      </div>
      <div class="detail-body">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <h2>${a.type}</h2>
          <span class="tagb" style="color:${L.color};background:${L.soft};border-color:${L.color};font-size:10px;padding:3px 9px;border-radius:6px">${L.label} xavf</span>
        </div>
        <div class="detail-grid">
          <div class="mini-stat"><div class="l">KAMERA</div><div class="v">${a.cam}</div></div>
          <div class="mini-stat"><div class="l">ZONA</div><div class="v">${a.zone}</div></div>
          <div class="mini-stat"><div class="l">VAQT</div><div class="v">${a.time}</div></div>
          <div class="mini-stat"><div class="l">AI ISHONCH</div><div class="v" style="color:${L.color}">${a.conf}%</div></div>
        </div>
        <div class="chan-label">YETKAZILGAN KANALLAR</div>
        <div class="chan-row">
          <span class="chan"><span class="dot"></span>Push</span>
          <span class="chan"><span class="dot"></span>Telegram</span>
          <span class="chan"><span class="dot"></span>Brauzer</span>
          ${a.level === 'high' && !a.acked ? '<span class="chan alarm"><span class="dot"></span>Sirena faol</span>' : ''}
        </div>
        <div class="detail-actions">
          <button class="ack" id="ackBtn">${a.acked ? 'Tasdiqlangan ✓' : 'Tasdiqlash'}</button>
          <button class="watch" id="watchBtn">Kamerani ochish</button>
          <button class="dismiss" id="dismissBtn"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </div>
      </div>`;

    document.getElementById('ackBtn').addEventListener('click', () => {
      a.acked = true;
      this.updateAlertBadges();
      this.renderAlerts();
    });
    document.getElementById('watchBtn').addEventListener('click', () => {
      this.detailCam = a.cam;
      this.go('detail');
    });
    document.getElementById('dismissBtn').addEventListener('click', () => {
      const idx = this.alerts.indexOf(a);
      if (idx > -1) this.alerts.splice(idx, 1);
      this.updateAlertBadges();
      this.renderAlerts();
    });
  },

  // ---------------------------------------------------------- RENDER: analitika
  renderAnalytics() {
    const alerts = this.alerts;
    const high = alerts.filter((a) => a.level === 'high').length;
    const kpis = [
      { l: 'Bugungi signallar', v: String(alerts.length), s: `${high} yuqori xavf`, ac: 'var(--hi)', c: 'var(--accent)' },
      { l: "O'rtacha javob vaqti", v: '1m 24s', s: '−18s tezroq', ac: 'var(--low)', c: 'var(--accent-2)' },
      { l: 'Aniqlash aniqligi', v: '96.4%', s: "so'nggi 7 kun", ac: 'var(--text-3)', c: 'var(--low)' },
      { l: 'Faol kameralar', v: `${this.cameras.filter((c) => c.online).length}/${this.cameras.length}`, s: this.cameras.find((c) => !c.online)?.id + ' oflayn' || 'barchasi faol', ac: 'var(--med)', c: 'var(--med)' },
    ];
    document.getElementById('kpiGrid').innerHTML = kpis.map((k) => `
      <div class="kpi">
        <div class="orb" style="background:${k.c}"></div>
        <div class="l">${k.l}</div><div class="v">${k.v}</div>
        <div class="s" style="color:${k.ac}">${k.s}</div>
      </div>`).join('');

    // soatlar bo'yicha
    const hourCounts = {};
    alerts.forEach((a) => {
      const h = new Date(a.ts).getHours();
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
    const nowH = new Date().getHours();
    const hours = [];
    for (let i = 11; i >= 0; i--) {
      const h = (nowH - i + 24) % 24;
      hours.push({ h: String(h).padStart(2, '0'), v: hourCounts[h] || 0 });
    }
    const maxH = Math.max(1, ...hours.map((x) => x.v));
    document.getElementById('hourBars').innerHTML = hours.map((h) => `
      <div class="col"><div class="bar" style="height:${Math.round((h.v / maxH) * 100)}%"></div><span class="lb">${h.h}</span></div>`).join('');

    // turlar bo'yicha
    const typeCounts = {};
    alerts.forEach((a) => (typeCounts[a.type] = (typeCounts[a.type] || 0) + 1));
    const typeColors = ['var(--hi)', 'var(--med)', 'var(--accent)', 'var(--accent-2)', 'var(--info)', 'var(--low)', 'var(--hi)'];
    const types = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const maxT = Math.max(1, ...types.map((t) => t[1]));
    document.getElementById('typesTotal').textContent = alerts.length + ' jami';
    document.getElementById('typeBars').innerHTML = types.map(([t, n], i) => `
      <div class="hbar">
        <div class="r1"><span class="nm"><span class="sw" style="background:${typeColors[i]}"></span>${t}</span><span class="n">${n}</span></div>
        <div class="track"><div class="fill" style="width:${Math.round((n / maxT) * 100)}%;background:${typeColors[i]}"></div></div>
      </div>`).join('') || '<div class="empty-note">Ma\'lumot yo\'q</div>';

    // zonalar bo'yicha
    const zoneCounts = {};
    alerts.forEach((a) => (zoneCounts[a.zone] = (zoneCounts[a.zone] || 0) + 1));
    const zones = Object.entries(zoneCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxZ = Math.max(1, ...zones.map((z) => z[1]));
    document.getElementById('zoneBars').innerHTML = zones.map(([z, n], i) => `
      <div class="hbar">
        <div class="r1"><span class="nm">${z}</span><span class="n">${n}</span></div>
        <div class="track"><div class="fill" style="width:${Math.round((n / maxZ) * 100)}%;background:${typeColors[i]}"></div></div>
      </div>`).join('') || '<div class="empty-note">Ma\'lumot yo\'q</div>';
  },

  // ---------------------------------------------------------- RENDER: kamera batafsil
  renderDetail() {
    const cam = this.cameras.find((c) => c.id === this.detailCam) || this.cameras[0];
    if (!cam) return;
    this.detailCam = cam.id;
    const stream = this.streams.get(cam.id);
    const camAlerts = this.alerts.filter((a) => a.cam === cam.id).slice(0, 5);

    document.getElementById('detailContent').innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
        <button class="back-btn" id="backToLive"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M15 18l-6-6 6-6"/></svg></button>
        <div>
          <h1 style="margin:0;font-size:22px;font-weight:600">${cam.id} · ${cam.name}</h1>
          <div style="margin-top:4px;font:500 12px var(--mono);color:var(--text-2)">${cam.zone} · ${cam.model || 'IP kamera'} · 8MP · asosiy oqim</div>
        </div>
        <span style="margin-left:auto" class="live-pill"><span class="dot"></span>${cam.online ? 'LIVE · REC' : 'OFLAYN'}</span>
      </div>
      <div class="det-layout">
        <div>
          <div class="big-feed" id="bigFeed">
            <div class="vign"></div>
            ${cam.online ? '<div class="scanline"></div>' : `<div class="cam-offline"><span class="t1">SIGNAL YO'Q</span></div>`}
            <div class="boxes" id="bigBoxes"></div>
            <div style="position:absolute;top:12px;left:14px;font:600 12px var(--mono);color:#D6E6F2;text-shadow:0 1px 3px #000">${cam.id} · ${cam.zone}</div>
            <div style="position:absolute;top:12px;right:14px;display:flex;gap:7px">
              <span class="cam-badge">HD · 4MP</span>
              ${cam.online ? '<span class="cam-badge" style="background:rgba(255,80,100,.85);border:none"><span class="dot" style="background:#fff"></span>REC</span>' : ''}
            </div>
            <div style="position:absolute;bottom:12px;left:14px;font:500 11px var(--mono);color:#C3D3E1;text-shadow:0 1px 2px #000" id="bigTs"></div>
            <div class="ptz">
              <button id="enhanceBtn" title="Tiniqlashtirish — raqam o'qish (bosib rejim almashadi)">✨ Oddiy</button>
              <button id="snapBtn" title="Yuqori sifatli surat olish">📷</button>
              <button data-ptz="zoomout" title="Uzoqlashtirish">−</button>
              <button data-ptz="zoomin" title="Yaqinlashtirish">+</button>
            </div>
          </div>
          <div class="timeline-card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
              <span style="font-weight:600;font-size:13.5px">Yozuv vaqt jadvali</span>
              <span style="font:500 11px var(--mono);color:var(--text-3)">so'nggi 1 soat</span>
            </div>
            <div class="tl-track" id="tlTrack"></div>
            <div class="tl-labels" id="tlLabels"></div>
            <div class="tl-legend">
              <span><span class="sw" style="background:var(--hi)"></span>Yuqori</span>
              <span><span class="sw" style="background:var(--med)"></span>O'rta</span>
              <span><span class="sw" style="background:var(--low)"></span>Past</span>
            </div>
          </div>
        </div>
        <div class="side-col">
          <div class="side-card">
            <div class="head">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent)" stroke-width="1.7"><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><rect x="7" y="7" width="10" height="10" rx="2"/></svg>
              AI aniqlangan obyektlar
            </div>
            <div id="objList"><div class="empty-note" style="padding:14px">Aniqlanmoqda…</div></div>
          </div>
          <div class="side-card">
            <div class="head">Kamera ma'lumotlari</div>
            <div class="kv"><span class="k">IP manzil</span><span class="v">${cam.ip || '—'}</span></div>
            <div class="kv"><span class="k">Ruxsat</span><span class="v">2560×1440</span></div>
            <div class="kv"><span class="k">Kadr tezligi</span><span class="v">${cam.online ? '25 fps' : '0 fps'}</span></div>
            <div class="kv"><span class="k">AI modullar</span><span class="v">${(cam.ai || []).join(', ') || '—'}</span></div>
            <div class="kv"><span class="k">Cheklangan zona</span><span class="v" style="color:${cam.restricted ? 'var(--hi)' : 'var(--low)'}">${cam.restricted ? 'HA' : "YO'Q"}</span></div>
            <div class="kv"><span class="k">Holat</span><span class="v" style="color:${cam.online ? 'var(--low)' : 'var(--text-3)'}">● ${cam.online ? 'Onlayn · 99%' : 'Oflayn'}</span></div>
          </div>
          <div class="side-card">
            <div class="head">So'nggi hodisalar</div>
            ${camAlerts.map((a) => `
              <div class="ev-item"><span class="t" style="color:${LEVELS[a.level].color}">${a.time.slice(0, 5)}</span><span class="d">${a.type}</span></div>`).join('') || '<div class="empty-note" style="padding:10px">Hodisa yo\'q</div>'}
          </div>
        </div>
      </div>`;

    // Batafsil ko'rinishда TO'LIQ 8MP asosiy oqim (raqamlar o'qiladi) — alohida stream.
    // Demo rejimda esa mavjud demo stream'ni ishlatamiz.
    if (cam.online) {
      this._stopDetailStream();
      let feedStream = stream;
      if (!this.demo) {
        feedStream = createStream(cam, 0, false, 'main');
        feedStream.start();
        this.detailStream = feedStream;
      }
      this._detailFeed = feedStream;
      const bf = document.getElementById('bigFeed');
      if (bf && feedStream) bf.insertBefore(feedStream.el, bf.firstChild);
    }
    this._setupZoom(); // raqamli zoom (yaqinlashtirish)
    this._setupEnhance(); // tiniqlashtirish (raqam o'qish)
    document.getElementById('backToLive').addEventListener('click', () => this.go('live'));
    document.getElementById('snapBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.snapshotHiRes(cam.id); // yuqori sifatli (8MP) surat
    });
    document.querySelectorAll('[data-ptz]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        // + / − endi brauzerda raqamli yaqinlashtiradi (kameralar qo'zg'almas)
        this.zoomBy(b.dataset.ptz === 'zoomin' ? 1.5 : 1 / 1.5);
      });
    });

    // vaqt jadvali
    const track = document.getElementById('tlTrack');
    const hourAgo = Date.now() - 3600000;
    track.innerHTML = this.alerts
      .filter((a) => a.cam === cam.id && a.ts > hourAgo)
      .map((a) => {
        const pct = ((a.ts - hourAgo) / 3600000) * 100;
        return `<div class="tl-mark" style="left:${pct}%;background:${LEVELS[a.level].color};${a.level === 'high' ? 'width:3px;box-shadow:0 0 10px var(--hi)' : ''}"></div>`;
      }).join('') + '<div class="tl-cursor" style="left:99%"></div>';
    const lbl = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date(Date.now() - i * 15 * 60000);
      lbl.push(`<span>${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span>`);
    }
    document.getElementById('tlLabels').innerHTML = lbl.join('');
    this.updateDetailOverlays();
  },

  updateDetailOverlays() {
    const camId = this.detailCam;
    if (!camId) return;
    const dets = this.detections.get(camId) || [];
    // Eslatma: ramkalar (#bigBoxes) endi startOverlayLoop() da har kadrda chiziladi.
    const ts = document.getElementById('bigTs');
    if (ts) ts.textContent = new Date().toLocaleDateString('uz-UZ') + ' ' + this.nowStr();
    const objList = document.getElementById('objList');
    if (objList) {
      objList.innerHTML = dets.length
        ? dets.map((d) => {
            const color = d.danger ? 'var(--hi)' : 'var(--med)';
            const bg = d.danger ? 'var(--hi-soft)' : 'var(--panel-2)';
            return `<div class="obj-item" style="background:${bg};border-color:${d.danger ? 'rgba(255,80,100,.25)' : 'var(--line)'}">
              <div class="nm">${d.label}${d.danger ? ' · Ruxsatsiz kirish' : ''}</div>
              <div class="cf" style="color:${color}">${d.conf}%</div></div>`;
          }).join('')
        : '<div class="obj-item"><div class="nm" style="color:var(--text-2)">Obyekt aniqlanmadi</div><div class="cf" style="color:var(--text-3)">—</div></div>';
    }
  },

  // ---------------------------------------------------------- Raqamli zoom
  // Kameralar qo'zg'almas (motorli PTZ emas), shuning uchun yaqinlashtirish
  // brauzerda video ustida amalga oshiriladi — istalgan kamerada ishlaydi.
  _setupZoom() {
    this._zoomState = { z: 1, tx: 0, ty: 0 };
    const bf = document.getElementById('bigFeed');
    if (!bf) return;
    bf.style.overflow = 'hidden';
    bf.style.cursor = 'zoom-in';

    // sichqoncha g'ildiragi bilan zoom
    bf.onwheel = (e) => {
      e.preventDefault();
      const r = bf.getBoundingClientRect();
      this.zoomBy(e.deltaY < 0 ? 1.25 : 1 / 1.25, e.clientX - r.left, e.clientY - r.top);
    };
    // ikki marta bosish — asl holatga qaytarish
    bf.ondblclick = (e) => { e.preventDefault(); this._zoomState = { z: 1, tx: 0, ty: 0 }; this._applyZoom(); };
    // surib ko'chirish (pan) — yaqinlashtirilgan bo'lsa
    let drag = null;
    bf.onpointerdown = (e) => {
      if (this._zoomState.z <= 1) return;
      drag = { x: e.clientX, y: e.clientY, tx: this._zoomState.tx, ty: this._zoomState.ty };
      bf.setPointerCapture(e.pointerId);
      bf.style.cursor = 'grabbing';
    };
    bf.onpointermove = (e) => {
      if (!drag) return;
      this._zoomState.tx = drag.tx + (e.clientX - drag.x);
      this._zoomState.ty = drag.ty + (e.clientY - drag.y);
      this._applyZoom();
    };
    const endDrag = () => { drag = null; bf.style.cursor = this._zoomState.z > 1 ? 'grab' : 'zoom-in'; };
    bf.onpointerup = endDrag;
    bf.onpointercancel = endDrag;
  },

  zoomBy(factor, ox, oy) {
    const bf = document.getElementById('bigFeed');
    if (!bf) return;
    const W = bf.clientWidth, H = bf.clientHeight;
    if (ox == null) { ox = W / 2; oy = H / 2; } // markazga nisbatan
    const s = this._zoomState || (this._zoomState = { z: 1, tx: 0, ty: 0 });
    const oldZ = s.z;
    const z = Math.min(6, Math.max(1, oldZ * factor)); // 1x .. 6x
    // ko'rsatkich ostidagi nuqta joyida qolsin
    s.tx = ox - ((ox - s.tx) / oldZ) * z;
    s.ty = oy - ((oy - s.ty) / oldZ) * z;
    s.z = z;
    if (z === 1) { s.tx = 0; s.ty = 0; }
    this._applyZoom();
    bf.style.cursor = z > 1 ? 'grab' : 'zoom-in';
  },

  _applyZoom() {
    const bf = document.getElementById('bigFeed');
    if (!bf) return;
    const W = bf.clientWidth, H = bf.clientHeight;
    const s = this._zoomState;
    // chetlardan chiqib ketmasin (video doim ekranni qoplaydi)
    s.tx = Math.min(0, Math.max(W * (1 - s.z), s.tx));
    s.ty = Math.min(0, Math.max(H * (1 - s.z), s.ty));
    const t = `translate(${s.tx}px, ${s.ty}px) scale(${s.z})`;
    const feed = this._detailFeed && this._detailFeed.el;
    const boxes = document.getElementById('bigBoxes');
    [feed, boxes].forEach((el) => {
      if (el) { el.style.transformOrigin = '0 0'; el.style.transform = t; }
    });
  },

  // ---------------------------------------------------------- Tiniqlashtirish
  // Rasmni tiniqlashtiradi — ayniqsa tunda avtomobil raqamini o'qish uchun.
  // Bir necha tayyor rejim (preset) orasidan bosib almashtiriladi.
  _ENHANCE: [
    { name: 'Oddiy', filter: 'none' },
    { name: 'Tiniqroq', filter: 'contrast(1.28) saturate(1.1) url(#sharpen)' },
    { name: 'Tungi raqam', filter: 'brightness(0.82) contrast(1.7) url(#sharpen)' },
    { name: 'Qorong\'i joy', filter: 'brightness(1.5) contrast(1.25) url(#sharpen)' },
  ],
  _setupEnhance() {
    this._enhIdx = 0;
    this._applyEnhance();
    const btn = document.getElementById('enhanceBtn');
    if (btn) btn.onclick = (e) => {
      e.stopPropagation();
      this._enhIdx = (this._enhIdx + 1) % this._ENHANCE.length;
      this._applyEnhance();
    };
  },
  _applyEnhance() {
    const p = this._ENHANCE[this._enhIdx || 0];
    const feed = this._detailFeed && this._detailFeed.el;
    if (feed) feed.style.filter = p.filter === 'none' ? '' : p.filter;
    const btn = document.getElementById('enhanceBtn');
    if (btn) btn.textContent = '✨ ' + p.name;
  },

  // ---------------------------------------------------------- Yuqori sifatli surat
  // Detal ko'rinishida 📷 — kameradan TO'G'RIDAN-TO'G'RI 8MP JPEG oladi (ISAPI),
  // video kadridan emas. Shu tufayli avtomobil raqami eng aniq chiqadi.
  async snapshotHiRes(camId) {
    if (this.demo) return this.takeSnapshot(camId, true);
    this.toast('Surat olinmoqda…', `${camId} · yuqori sifat`, 'var(--accent-2)');
    try {
      const r = await fetch(`/api/snapshot/${encodeURIComponent(camId)}`);
      if (!r.ok) throw new Error('snapshot');
      const blob = await r.blob();
      const url = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
      this.addSnapshot(camId, url, "Qo'lda · yuqori sifat (8MP)", false);
      this.downloadSnapshot(url, camId);
      this.toast('Surat olindi', `${camId} · 8MP · ${this.nowStr()}`, 'var(--accent)');
      return url;
    } catch {
      // zaxira: video kadri
      return this.takeSnapshot(camId, true);
    }
  },

  // ---------------------------------------------------------- RENDER: suratlar
  renderSnapshots() {
    const grid = document.getElementById('snapGrid');
    const empty = document.getElementById('snapEmpty');
    empty.classList.toggle('hidden', this.snapshots.length > 0);
    grid.innerHTML = this.snapshots.map((s) => `
      <div class="snap-card">
        <img src="${s.url}" alt="${s.cam}">
        <div class="bd">
          <div class="t">${s.cam} · ${s.time}</div>
          <div class="s">${s.reason}${s.auto ? ' (avtomatik)' : ''} · ${s.date}</div>
          <span class="dl" data-id="${s.id}">⬇ Yuklab olish</span>
        </div>
      </div>`).join('');
    grid.querySelectorAll('.dl').forEach((b) => {
      b.addEventListener('click', () => {
        const s = this.snapshots.find((x) => x.id === Number(b.dataset.id));
        if (s) this.downloadSnapshot(s.url, s.cam);
      });
    });
  },

  // ---------------------------------------------------------- RENDER: kameralar
  renderCamerasScreen() {
    const online = this.cameras.filter((c) => c.online).length;
    const aiCount = new Set(this.cameras.flatMap((c) => c.ai || [])).size;
    document.getElementById('camsSummary').innerHTML =
      `${this.cameras.length} kamera · <span style="color:var(--low)">${online} onlayn</span> · ${aiCount} AI modul faol`;

    document.getElementById('camTable').innerHTML = this.cameras.map((c) => {
      const color = c.online ? 'var(--low)' : 'var(--text-3)';
      return `<div class="table-row" data-cam="${c.id}">
        <div class="cam-cell">
          <div class="cam-thumb"><span class="st" style="background:${color}"></span></div>
          <div><div class="cid">${c.id}</div><div class="cnm">${c.name}</div></div>
        </div>
        <span class="zone-cell">${c.zone}</span>
        <span class="ip-cell">${c.ip || '—'}</span>
        <div class="ai-tags">${(c.ai || []).map((m) => `<span class="ai-tag">${m}</span>`).join('')}</div>
        <div class="status-cell"><span class="status-pill" style="color:${color}"><span class="dot" style="background:${color}"></span>${c.online ? 'Onlayn' : 'Oflayn'}</span></div>
      </div>`;
    }).join('');
    document.querySelectorAll('#camTable .table-row').forEach((r) => {
      r.addEventListener('click', () => {
        this.detailCam = r.dataset.cam;
        this.go('detail');
      });
    });

    // xarita nuqtalari
    const spots = [[30, 30], [95, 55], [60, 185], [150, 215], [243, 70], [290, 55], [243, 200], [300, 235]];
    const recent = new Set(this.alerts.slice(0, 5).map((a) => a.cam));
    document.getElementById('mapDots').innerHTML = this.cameras.map((c, i) => {
      const [x, y] = spots[i % spots.length];
      const recentAlert = this.alerts.find((a) => a.cam === c.id && !a.acked);
      const color = !c.online ? 'var(--text-3)' : recentAlert ? (recentAlert.level === 'high' ? 'var(--hi)' : 'var(--med)') : 'var(--low)';
      const halo = recent.has(c.id) && c.online ? `<circle cx="${x}" cy="${y}" r="9" fill="${color}" opacity="0.25"/>` : '';
      return `${halo}<circle cx="${x}" cy="${y}" r="4.5" fill="${color}"><title>${c.id} · ${c.name}</title></circle>`;
    }).join('');
  },

  // ---------------------------------------------------------- yordamchi uchun holat
  statusSummary() {
    const online = this.cameras.filter((c) => c.online).length;
    const un = this.alerts.filter((a) => !a.acked);
    const high = un.filter((a) => a.level === 'high');
    let s = `Hozirgi holat: ${this.cameras.length} kameradan ${online} tasi onlayn. `;
    if (high.length) {
      s += `DIQQAT: ${high.length} ta yuqori xavfli signal bor — ${high.map((a) => `${a.type} (${a.cam})`).join(', ')}. `;
    } else if (un.length) {
      s += `${un.length} ta hal etilmagan signal bor, yuqori xavflisi yo'q. `;
    } else {
      s += 'Faol signal yo\'q, hammasi tinch. ';
    }
    const off = this.cameras.filter((c) => !c.online);
    if (off.length) s += `Oflayn kameralar: ${off.map((c) => c.id).join(', ')}.`;
    return s;
  },
};

window.addEventListener('DOMContentLoaded', async () => {
  await App.init();
  Session.boot(); // login holatini tekshiradi: token bo'lsa to'g'ridan-to'g'ri kiradi
});
