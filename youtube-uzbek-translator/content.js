// YouTube O'zbek Tarjimon — content script
// YouTube pleerdagi subtitr matnini kuzatib, real vaqtda o'zbekchaga
// tarjima qiladi va video ustida ko'rsatadi.

(() => {
  'use strict';

  const TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';
  const CACHE_LIMIT = 800;

  const settings = {
    enabled: true,
    mode: 'dual',      // 'dual' = asl + o'zbekcha, 'replace' = faqat o'zbekcha
    fontSize: 22,      // px
    sourceLang: 'auto' // manba tili
  };

  const cache = new Map(); // matn -> tarjima
  let overlay = null;
  let observer = null;
  let debounceTimer = null;
  let lastText = '';
  let requestSeq = 0;

  // ---------- Sozlamalar ----------

  function loadSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(settings, (stored) => {
          Object.assign(settings, stored || {});
          resolve();
        });
      } catch (_) {
        resolve();
      }
    });
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (key in settings) settings[key] = newValue;
      }
      applySettingsToUI();
      if (!settings.enabled) hideOverlay();
    });
  } catch (_) {
    // storage mavjud bo'lmasa ham ishlashda davom etamiz
  }

  // ---------- Tarjima ----------

  function rememberInCache(key, value) {
    if (cache.size >= CACHE_LIMIT) {
      // eng eski yozuvni o'chiramiz
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
    cache.set(key, value);
  }

  async function translate(text) {
    const key = text.trim();
    if (!key) return '';
    if (cache.has(key)) return cache.get(key);

    const params = new URLSearchParams({
      client: 'gtx',
      sl: settings.sourceLang || 'auto',
      tl: 'uz',
      dt: 't',
      q: key
    });

    const res = await fetch(`${TRANSLATE_URL}?${params.toString()}`);
    if (!res.ok) throw new Error(`Tarjima xizmati javobi: ${res.status}`);
    const data = await res.json();
    const translated = (data && data[0])
      ? data[0].map((chunk) => (chunk && chunk[0]) || '').join('')
      : '';
    rememberInCache(key, translated);
    return translated;
  }

  // ---------- Ko'rinish (overlay) ----------

  function getPlayer() {
    return document.querySelector('#movie_player');
  }

  function ensureOverlay() {
    const player = getPlayer();
    if (!player) return null;
    if (overlay && player.contains(overlay)) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'uz-translate-overlay';
    overlay.setAttribute('aria-live', 'polite');
    player.appendChild(overlay);
    applySettingsToUI();
    return overlay;
  }

  function applySettingsToUI() {
    if (overlay) overlay.style.fontSize = `${settings.fontSize}px`;
    const player = getPlayer();
    if (player) {
      player.classList.toggle('uz-hide-original', settings.enabled && settings.mode === 'replace');
    }
  }

  function showOverlay(text) {
    const el = ensureOverlay();
    if (!el) return;
    el.textContent = text;
    el.style.display = text ? 'block' : 'none';
  }

  function hideOverlay() {
    if (overlay) overlay.style.display = 'none';
    const player = getPlayer();
    if (player) player.classList.remove('uz-hide-original');
  }

  // ---------- Subtitrlarni kuzatish ----------

  function readCaptionText() {
    const segments = document.querySelectorAll(
      '#movie_player .ytp-caption-window-container .ytp-caption-segment'
    );
    return Array.from(segments)
      .map((s) => s.textContent)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function onCaptionMaybeChanged() {
    if (!settings.enabled) return;

    const text = readCaptionText();
    if (text === lastText) return;
    lastText = text;

    if (!text) {
      showOverlay('');
      return;
    }

    const seq = ++requestSeq;
    try {
      const translated = await translate(text);
      // Eski (kechikkan) javoblar yangi subtitrni bosib ketmasin
      if (seq !== requestSeq) return;
      showOverlay(translated);
    } catch (err) {
      if (seq !== requestSeq) return;
      showOverlay('[tarjima xatosi — internetni tekshiring]');
    }
  }

  function scheduleUpdate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(onCaptionMaybeChanged, 120);
  }

  function attachObserver() {
    const player = getPlayer();
    if (!player) return false;

    if (observer) observer.disconnect();
    observer = new MutationObserver(scheduleUpdate);
    observer.observe(player, {
      childList: true,
      subtree: true,
      characterData: true
    });
    return true;
  }

  // ---------- Ishga tushirish ----------

  let attachRetryTimer = null;

  function boot() {
    lastText = '';
    hideOverlay();
    clearInterval(attachRetryTimer);

    // Pleer SPA sahifada kechroq paydo bo'lishi mumkin — topilguncha urinamiz
    attachRetryTimer = setInterval(() => {
      if (attachObserver()) {
        clearInterval(attachRetryTimer);
        ensureOverlay();
      }
    }, 1000);
  }

  loadSettings().then(() => {
    boot();
    // YouTube SPA: video almashganda qayta ulaymiz
    window.addEventListener('yt-navigate-finish', boot);
  });
})();
