/* Sentinel AI — ovozli/matnli yordamchi
 * Web Speech API: ovozli buyruqlar (SpeechRecognition) + ovozli javob (speechSynthesis).
 * Buyruqlar avval lokal qoidalar bilan tushuniladi; mos kelmasa va serverda AI kaliti
 * sozlangan bo'lsa — Claude'ga yuboriladi.
 */

const Assistant = {
  open: false,
  listening: false,
  voiceEnabled: true,
  recog: null,

  init() {
    document.getElementById('fabBtn').addEventListener('click', () => this.toggle(true));
    document.getElementById('assistantClose').addEventListener('click', () => {
      this.userClosed = true;
      this.toggle(false);
    });
    document.getElementById('sendBtn').addEventListener('click', () => this.submit());
    document.getElementById('chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submit();
    });
    document.getElementById('micBtn').addEventListener('click', () => this.toggleMic());
    document.getElementById('chatHints').addEventListener('click', (e) => {
      const h = e.target.closest('.hint');
      if (h) {
        document.getElementById('chatInput').value = h.textContent;
        this.submit();
      }
    });
    this._setupRecognition();
  },

  toggle(open) {
    this.open = open === undefined ? !this.open : open;
    document.getElementById('assistantPanel').classList.toggle('hidden', !this.open);
    if (this.open) document.getElementById('chatInput').focus();
  },

  // ------------------------------------------------------------- ovoz tanish
  _setupRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      document.getElementById('micBtn').title = 'Bu brauzer ovozni tanishni qo\'llamaydi (Chrome tavsiya etiladi)';
      return;
    }
    this.recog = new SR();
    this.recog.lang = 'uz-UZ'; // qo'llanmasa brauzer eng yaqiniga tushadi
    this.recog.interimResults = false;
    this.recog.maxAlternatives = 1;

    this.recog.onresult = (e) => {
      const text = e.results[0][0].transcript;
      document.getElementById('chatInput').value = text;
      this.submit();
    };
    this.recog.onend = () => {
      this.listening = false;
      document.getElementById('micBtn').classList.remove('listening');
      document.getElementById('assistantStatus').textContent = 'Buyruq bering — matn yoki ovoz orqali';
    };
    this.recog.onerror = (e) => {
      this.listening = false;
      document.getElementById('micBtn').classList.remove('listening');
      if (e.error === 'language-not-supported') {
        this.recog.lang = 'ru-RU';
        this.addMsg('bot', "O'zbek tili ovoz tanishda qo'llab-quvvatlanmadi — rus tiliga o'tdim. Buyruqni ruscha yoki matn bilan bering.");
      } else if (e.error === 'not-allowed') {
        this.addMsg('bot', 'Mikrofonga ruxsat berilmadi. Brauzer sozlamalaridan ruxsat bering.');
      }
    };
  },

  toggleMic() {
    if (!this.recog) {
      this.addMsg('bot', "Bu brauzer ovozli buyruqni qo'llamaydi. Chrome yoki Edge ishlating.");
      return;
    }
    if (this.listening) {
      this.recog.stop();
      return;
    }
    this.listening = true;
    document.getElementById('micBtn').classList.add('listening');
    document.getElementById('assistantStatus').textContent = '🎙 Eshitmoqdaman…';
    try { this.recog.start(); } catch {}
  },

  speak(text) {
    if (!this.voiceEnabled || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      // uz ovozi kam uchraydi — mavjud bo'lsa uz, bo'lmasa tr/ru yaqin talaffuz beradi
      const voices = speechSynthesis.getVoices();
      const v = voices.find((x) => x.lang.startsWith('uz')) ||
                voices.find((x) => x.lang.startsWith('tr')) ||
                voices.find((x) => x.lang.startsWith('ru'));
      if (v) u.voice = v;
      u.rate = 1.02;
      speechSynthesis.speak(u);
    } catch {}
  },

  // ------------------------------------------------------------- chat UI
  addMsg(who, text, imgUrl) {
    const log = document.getElementById('chatLog');
    const el = document.createElement('div');
    el.className = 'msg ' + who;
    el.textContent = text;
    if (imgUrl) {
      const wrap = document.createElement('div');
      wrap.className = 'snap-preview';
      const img = document.createElement('img');
      img.src = imgUrl;
      wrap.appendChild(img);
      el.appendChild(wrap);
    }
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  },

  say(text, speak = true) {
    this.addMsg('bot', text);
    if (speak) this.speak(text);
  },

  onDanger(alert) {
    if (!this.open && !this.userClosed) this.toggle(true);
    this.say(`⚠️ Diqqat! ${alert.type} aniqlandi — ${alert.cam}, ${alert.zone} zonasi. Ishonch ${alert.conf} foiz. Surat avtomatik olindi.`, true);
  },

  submit() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    this.addMsg('user', text);
    this.handle(text.toLowerCase());
  },

  // ------------------------------------------------------------- buyruqlar
  async handle(t) {
    const has = (...words) => words.some((w) => t.includes(w));

    // --- surat olish ---
    if (has('rasm', 'surat', 'скрин', 'skrin', 'фото', 'foto', 'screenshot', 'снимок')) {
      const camMatch = t.match(/(?:kamera|cam|камера)[\s-]*(\d+)/);
      const camId = camMatch ? this._camByNum(camMatch[1]) : (App.screen === 'detail' ? App.detailCam : App.cameras[0]?.id);
      const url = App.takeSnapshot(camId, false);
      if (url) {
        this.say(`Surat olindi: ${camId}, ${App.nowStr()}. "Suratlar" bo'limida saqlandi.`, true);
        this.addMsg('bot', '', url);
      } else {
        this.say('Kechirasiz, bu kameradan surat olib bo\'lmadi — u oflayn bo\'lishi mumkin.');
      }
      return;
    }

    // --- holat ---
    if (has('holat', 'ahvol', 'vaziyat', 'hisobot', 'status', 'статус', 'nima gap', "nima bo'lyapti")) {
      this.say(App.statusSummary(), true);
      return;
    }

    // --- navigatsiya ---
    if (has('signal', 'ogohlantirish', 'alert', 'тревог')) {
      if (has("o'chir", 'uchir', 'toxtat', "to'xtat")) {
        App.sirenaOn = false;
        this.say('Sirena o\'chirildi. Yangi yuqori xavfli signallarda ovoz chalinmaydi.');
        return;
      }
      App.go('alerts');
      const un = App.alerts.filter((a) => !a.acked).length;
      this.say(`Signallar ochildi. Hal etilmagan: ${un} ta.`);
      return;
    }
    if (has('analitika', 'statistika', 'tahlil', 'аналитик')) {
      App.go('analytics');
      this.say('Analitika paneli ochildi.');
      return;
    }
    if (has('jonli', 'devor', 'live', 'monitoring')) {
      App.go('live');
      this.say('Jonli kuzatuv devori ochildi.');
      return;
    }
    if (has('suratlar', 'galereya', 'arxiv')) {
      App.go('snapshots');
      this.say(`Suratlar bo'limi ochildi. Jami ${App.snapshots.length} ta surat bor.`);
      return;
    }

    // --- kamera ochish ---
    const camMatch = t.match(/(?:kamera|cam|камера)[\s-]*(\d+)/);
    if (camMatch && has('och', 'ko\'rsat', 'korsat', 'открой', 'покажи', 'ochib')) {
      const camId = this._camByNum(camMatch[1]);
      if (camId) {
        App.detailCam = camId;
        App.go('detail');
        const cam = App.cameras.find((c) => c.id === camId);
        this.say(`${camId} — ${cam.name} ochildi. ${cam.online ? 'Jonli oqim faol.' : 'Kamera hozir oflayn!'}`);
      } else {
        this.say('Bunday raqamli kamera topilmadi.');
      }
      return;
    }
    if (has('kameralar', 'boshqaruv')) {
      App.go('cameras');
      this.say('Kameralar boshqaruvi ochildi.');
      return;
    }

    // --- sirena/ovoz ---
    if (has('sirena', 'сирен', 'ovoz')) {
      if (has("o'chir", 'uchir', 'выключ', "to'xtat", 'toxtat')) {
        App.sirenaOn = false;
        this.say('Sirena o\'chirildi.');
      } else if (has('yoq', 'включ', 'ishga')) {
        App.sirenaOn = true;
        this.say('Sirena yoqildi. Yuqori xavfda ovozli ogohlantirish beriladi.');
      } else {
        this.say(`Sirena hozir ${App.sirenaOn ? 'yoqilgan' : "o'chirilgan"}. "Sirena o'chir" yoki "sirena yoq" deng.`);
      }
      return;
    }

    // --- rejim ---
    if (has('qorong', 'tungi', 'dark', 'тёмн', 'temn')) {
      document.body.dataset.theme = 'dark';
      this.say('Tungi rejim yoqildi.');
      return;
    }
    if (has('yorug', 'kunduzgi', 'light', 'светл')) {
      document.body.dataset.theme = 'light';
      this.say('Kunduzgi rejim yoqildi.');
      return;
    }

    // --- tasdiqlash ---
    if (has('tasdiqla', 'подтверд', 'hal qilindi', 'ok qil')) {
      App.alerts.forEach((a) => (a.acked = true));
      App.updateAlertBadges();
      if (App.screen === 'alerts') App.renderAlerts();
      this.say('Barcha signallar tasdiqlandi.');
      return;
    }

    // --- yordam ---
    if (has('yordam', 'help', 'nima qila olasan', 'buyruqlar')) {
      this.say(
        'Men quyidagilarni qila olaman:\n' +
        '• "rasmga ol" / "kamera 3 ni rasmga ol" — surat olish\n' +
        '• "holatni ayt" — umumiy xavfsizlik hisoboti\n' +
        '• "kamera 2 ni och" — kamerani ochish\n' +
        '• "signallarni ko\'rsat", "analitika", "jonli devor" — bo\'limlar\n' +
        '• "sirena o\'chir / yoq" — ovozli ogohlantirish\n' +
        '• "hammasini tasdiqla" — signallarni yopish\n' +
        '• "qorong\'i / yorug\' rejim" — mavzu\n' +
        'Xavfli vaziyat aniqlansa o\'zim ogohlantiraman va surat olaman.', false);
      return;
    }

    // --- lokal qoida topilmadi → server AI (agar sozlangan bo'lsa) ---
    if (!App.features?.ai) {
      this.say("Buyruqni tushunmadim. \"yordam\" deb yozing — barcha buyruqlar ro'yxatini ko'rsataman.");
      return;
    }
    try {
      const r = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: t, context: App.statusSummary() }),
      });
      const data = await r.json();
      if (r.ok && data.text) {
        this.say(data.text, true);
        return;
      }
    } catch {}
    this.say("Buyruqni tushunmadim. \"yordam\" deb yozing — barcha buyruqlar ro'yxatini ko'rsataman.");
  },

  _camByNum(n) {
    const id = 'CAM-' + String(n).padStart(2, '0');
    const cam = App.cameras.find((c) => c.id === id);
    return cam ? cam.id : null;
  },
};

window.addEventListener('DOMContentLoaded', () => Assistant.init());
