/*
 * Sentinel AI — lokal kamera ko'prigi (bridge) serveri
 *
 * Vazifalari:
 *  - public/ dagi webapp'ni servis qilish
 *  - Hikvision/NIKVision kameralarga RTSP orqali ulanib, jonli oqimni
 *    WebSocket orqali brauzerga MJPEG ko'rinishida uzatish (ffmpeg kerak)
 *  - ISAPI orqali snapshot olish va PTZ boshqaruvi (digest auth)
 *  - Telegram orqali ogohlantirish yuborish
 *  - Ixtiyoriy: Anthropic AI proxy (aqlli chat javoblari uchun)
 *
 * Ishga tushirish:  npm install && npm start  →  http://localhost:8080
 * Kameralar konfiguratsiyasi: server/cameras.json (namuna: cameras.example.json)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const CONFIG_PATH = path.join(__dirname, 'cameras.json');

// ---------------------------------------------------------------- config
function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(raw);
    cfg.demo = !Array.isArray(cfg.cameras) || cfg.cameras.length === 0;
    return cfg;
  } catch {
    return { demo: true, cameras: [], telegram: {}, anthropicApiKey: '' };
  }
}
let config = loadConfig();
fs.watchFile(CONFIG_PATH, { interval: 3000 }, () => {
  config = loadConfig();
  console.log('[config] cameras.json qayta yuklandi');
});

function findCamera(id) {
  return (config.cameras || []).find((c) => c.id === id);
}

function rtspUrl(cam) {
  const ch = cam.channel || 101;
  return `rtsp://${encodeURIComponent(cam.user)}:${encodeURIComponent(cam.password)}@${cam.ip}:${cam.port || 554}/Streaming/Channels/${ch}`;
}

// ------------------------------------------------- HTTP digest auth (ISAPI)
function md5(s) {
  return crypto.createHash('md5').update(s).digest('hex');
}

function parseDigestChallenge(header) {
  const out = {};
  const re = /(\w+)=("([^"]*)"|([^\s,]+))/g;
  let m;
  while ((m = re.exec(header))) out[m[1]] = m[3] !== undefined ? m[3] : m[4];
  return out;
}

function digestAuthHeader(method, uri, user, pass, challenge) {
  const c = parseDigestChallenge(challenge);
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  const ha1 = md5(`${user}:${c.realm}:${pass}`);
  const ha2 = md5(`${method}:${uri}`);
  let response;
  if (c.qop) {
    response = md5(`${ha1}:${c.nonce}:${nc}:${cnonce}:${c.qop}:${ha2}`);
  } else {
    response = md5(`${ha1}:${c.nonce}:${ha2}`);
  }
  let h = `Digest username="${user}", realm="${c.realm}", nonce="${c.nonce}", uri="${uri}", response="${response}"`;
  if (c.opaque) h += `, opaque="${c.opaque}"`;
  if (c.qop) h += `, qop=${c.qop}, nc=${nc}, cnonce="${cnonce}"`;
  return h;
}

/** ISAPI so'rovi — avval oddiy, 401 kelsa digest bilan qaytaradi. */
function isapiRequest(cam, method, uri, body, cb) {
  const opts = {
    host: cam.ip,
    port: cam.httpPort || 80,
    method,
    path: uri,
    timeout: 8000,
    headers: {},
  };
  if (body) opts.headers['Content-Type'] = 'application/xml';

  const attempt = (authHeader, done) => {
    const o = { ...opts, headers: { ...opts.headers } };
    if (authHeader) o.headers['Authorization'] = authHeader;
    const req = http.request(o, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => done(null, res, Buffer.concat(chunks)));
    });
    req.on('error', (e) => done(e));
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (body) req.write(body);
    req.end();
  };

  attempt(null, (err, res, buf) => {
    if (err) return cb(err);
    if (res.statusCode === 401 && res.headers['www-authenticate']) {
      const auth = digestAuthHeader(method, uri, cam.user, cam.password, res.headers['www-authenticate']);
      attempt(auth, (err2, res2, buf2) => (err2 ? cb(err2) : cb(null, res2, buf2)));
    } else {
      cb(null, res, buf);
    }
  });
}

// ---------------------------------------------------- RTSP → MJPEG oqimlari
/** Har kamera uchun bitta ffmpeg jarayoni; frame'lar barcha ws mijozlarga tarqatiladi. */
const streams = new Map(); // camId -> { proc, clients:Set, buf }

function startStream(cam) {
  if (streams.has(cam.id)) return streams.get(cam.id);

  const entry = { proc: null, clients: new Set(), buf: Buffer.alloc(0) };
  streams.set(cam.id, entry);

  const args = [
    '-rtsp_transport', 'tcp',
    '-i', rtspUrl(cam),
    '-f', 'mjpeg',
    '-q:v', '6',
    '-r', '10',
    '-an',
    'pipe:1',
  ];
  console.log(`[stream] ${cam.id} uchun ffmpeg ishga tushmoqda`);
  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  entry.proc = proc;

  proc.stdout.on('data', (chunk) => {
    entry.buf = Buffer.concat([entry.buf, chunk]);
    // JPEG kadrlarni SOI (FFD8) / EOI (FFD9) markerlar bo'yicha ajratamiz
    let start;
    while ((start = entry.buf.indexOf(Buffer.from([0xff, 0xd8]))) !== -1) {
      const end = entry.buf.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
      if (end === -1) break;
      const frame = entry.buf.subarray(start, end + 2);
      entry.buf = entry.buf.subarray(end + 2);
      for (const ws of entry.clients) {
        if (ws.readyState === 1) ws.send(frame);
      }
    }
    if (entry.buf.length > 4 * 1024 * 1024) entry.buf = Buffer.alloc(0);
  });

  proc.stderr.on('data', () => {});
  proc.on('close', (code) => {
    console.log(`[stream] ${cam.id} ffmpeg yopildi (kod ${code})`);
    streams.delete(cam.id);
    for (const ws of entry.clients) {
      try { ws.close(); } catch {}
    }
  });
  return entry;
}

function stopStreamIfIdle(camId) {
  const entry = streams.get(camId);
  if (entry && entry.clients.size === 0 && entry.proc) {
    entry.proc.kill('SIGTERM');
    streams.delete(camId);
  }
}

// ---------------------------------------------------- Gemini TTS (sifatli ovoz)
/** Xom PCM (L16) ni brauzer o'qiy oladigan WAV ga o'rash */
function pcmToWav(pcm, rate = 24000, channels = 1) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * channels * 2, 28); h.writeUInt16LE(channels * 2, 32);
  h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const ttsCache = new Map(); // matn -> wav buffer (takroriy iboralar uchun)

async function geminiTts(text, key, voice) {
  if (ttsCache.has(text)) return ttsCache.get(text);
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `O'zbek tilida tabiiy, xotirjam va ishonchli ohangda o'qib ber: ${text}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || 'Leda' } } },
        },
      }),
    }
  );
  const data = await r.json();
  if (!r.ok) throw new Error((data.error && data.error.message) || 'TTS xatosi');
  const b64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error('Audio qaytmadi');
  const wav = pcmToWav(Buffer.from(b64, 'base64'));
  if (ttsCache.size > 40) ttsCache.delete(ttsCache.keys().next().value);
  ttsCache.set(text, wav);
  return wav;
}

// ---------------------------------------------------------------- yordamchi
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (d) => {
      chunks.push(d);
      if (Buffer.concat(chunks).length > 2 * 1024 * 1024) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// ---------------------------------------------------------------- HTTP server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    // --- API ---
    if (p === '/api/status') {
      return sendJson(res, 200, {
        ok: true,
        demo: config.demo,
        cameras: (config.cameras || []).length,
        ai: Boolean(config.anthropicApiKey || config.geminiApiKey || process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY),
        tts: Boolean(config.geminiApiKey || process.env.GEMINI_API_KEY),
        telegram: Boolean(config.telegram && config.telegram.botToken),
      });
    }

    if (p === '/api/tts' && req.method === 'POST') {
      const gkey = config.geminiApiKey || process.env.GEMINI_API_KEY;
      if (!gkey) return sendJson(res, 400, { error: 'Gemini kaliti sozlanmagan (cameras.json → geminiApiKey)' });
      const body = JSON.parse((await readBody(req)) || '{}');
      const text = String(body.text || '').slice(0, 600);
      if (!text) return sendJson(res, 400, { error: 'Matn berilmadi' });
      try {
        const wav = await geminiTts(text, gkey, (config.tts && config.tts.voice) || 'Leda');
        res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' });
        return res.end(wav);
      } catch (e) {
        return sendJson(res, 502, { error: 'TTS xatosi: ' + e.message });
      }
    }

    if (p === '/api/cameras') {
      // parol va login brauzerga yuborilmaydi
      const safe = (config.cameras || []).map((c) => ({
        id: c.id, name: c.name, zone: c.zone, ip: c.ip, model: c.model,
        restricted: Boolean(c.restricted), ai: c.ai || [],
      }));
      return sendJson(res, 200, { demo: config.demo, cameras: safe });
    }

    if (p.startsWith('/api/snapshot/')) {
      const cam = findCamera(decodeURIComponent(p.split('/').pop()));
      if (!cam) return sendJson(res, 404, { error: 'Kamera topilmadi' });
      const ch = cam.channel || 101;
      return isapiRequest(cam, 'GET', `/ISAPI/Streaming/channels/${ch}/picture`, null, (err, r, buf) => {
        if (err || r.statusCode !== 200) {
          return sendJson(res, 502, { error: 'Snapshot olinmadi: ' + (err ? err.message : r.statusCode) });
        }
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(buf);
      });
    }

    if (p.startsWith('/api/ptz/') && req.method === 'POST') {
      const cam = findCamera(decodeURIComponent(p.split('/').pop()));
      if (!cam) return sendJson(res, 404, { error: 'Kamera topilmadi' });
      const body = JSON.parse((await readBody(req)) || '{}');
      // pan/tilt/zoom: -100..100, 0 = to'xtatish
      const xml = `<?xml version="1.0" encoding="UTF-8"?><PTZData><pan>${body.pan | 0}</pan><tilt>${body.tilt | 0}</tilt><zoom>${body.zoom | 0}</zoom></PTZData>`;
      const ch = Math.floor((cam.channel || 101) / 100) || 1;
      return isapiRequest(cam, 'PUT', `/ISAPI/PTZCtrl/channels/${ch}/continuous`, xml, (err, r) => {
        if (err) return sendJson(res, 502, { error: err.message });
        sendJson(res, 200, { ok: r.statusCode === 200 });
      });
    }

    if (p === '/api/notify/telegram' && req.method === 'POST') {
      const t = config.telegram || {};
      if (!t.botToken || !t.chatId) return sendJson(res, 400, { error: 'Telegram sozlanmagan (cameras.json)' });
      const body = JSON.parse((await readBody(req)) || '{}');
      const text = `🚨 SENTINEL AI\n${body.text || 'Ogohlantirish'}`;
      const r = await fetch(`https://api.telegram.org/bot${t.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: t.chatId, text }),
      });
      return sendJson(res, r.ok ? 200 : 502, { ok: r.ok });
    }

    if (p === '/api/ai' && req.method === 'POST') {
      const akey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
      const gkey = config.geminiApiKey || process.env.GEMINI_API_KEY;
      if (!akey && !gkey) return sendJson(res, 400, { error: 'AI kaliti sozlanmagan' });
      const body = JSON.parse((await readBody(req)) || '{}');
      const system =
        "Sen Sentinel AI — video xavfsizlik nazorat tizimining yordamchisisan. O'zbek tilida qisqa (2-3 gap), aniq va do'stona javob ber. " +
        'Tizim holati: ' + (body.context || '');

      if (akey) {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': akey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 600,
            system,
            messages: [{ role: 'user', content: String(body.message || '') }],
          }),
        });
        const data = await r.json();
        const text = data && data.content && data.content[0] ? data.content[0].text : 'Javob olinmadi';
        return sendJson(res, 200, { text });
      }

      // Gemini orqali javob
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${encodeURIComponent(gkey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ parts: [{ text: String(body.message || '') }] }],
          }),
        }
      );
      const data = await r.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Javob olinmadi';
      return sendJson(res, 200, { text });
    }

    // --- statik fayllar ---
    let filePath = path.normalize(path.join(PUBLIC_DIR, p === '/' ? 'index.html' : p));
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Topilmadi');
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
        // lokal ishlatishda kesh o'chirilgan — o'zgarishlar darhol ko'rinadi
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
});

// -------------------------------------------------------------- WebSocket
const wss = new WebSocketServer({ server, path: undefined });
wss.on('connection', (ws, req) => {
  const m = req.url.match(/^\/stream\/([^/?]+)/);
  if (!m) return ws.close();
  const cam = findCamera(decodeURIComponent(m[1]));
  if (!cam) {
    ws.send(JSON.stringify({ error: 'Kamera topilmadi yoki demo rejim' }));
    return ws.close();
  }
  const entry = startStream(cam);
  entry.clients.add(ws);
  ws.on('close', () => {
    entry.clients.delete(ws);
    setTimeout(() => stopStreamIfIdle(cam.id), 5000);
  });
});

server.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  SENTINEL AI — video nazorat platformasi          ║');
  console.log(`║  http://localhost:${PORT}                            ║`);
  console.log(`║  Rejim: ${config.demo ? 'DEMO (cameras.json topilmadi)      ' : 'REAL — ' + config.cameras.length + ' kamera ulangan        '}  ║`);
  console.log('╚══════════════════════════════════════════════════╝');
});
