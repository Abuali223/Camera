/*
 * Sentinel AI — autentifikatsiya (login himoyasi)
 *
 * Maqsad: dasturga faqat parolni biladigan odam kira olsin.
 *  - Parol ochiq saqlanmaydi — scrypt + tasodifiy "salt" bilan hashlanadi.
 *  - Birinchi ishga tushirishда parol o'rnatiladi (ro'yxatdan o'tish).
 *  - Kirgandan keyin uzoq muddatli token beriladi (30 kun) → brauzer uni
 *    saqlaydi → sahifa yangilanса/kesh (fayllar) tozalanса ham login saqlanadi.
 *  - Brute-force himoya: bir IP'dan ko'p noto'g'ri urinish → vaqtincha bloklash.
 *
 * Ma'lumot server/auth.json faylida (gitignore — repo'ga chiqmaydi).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUTH_PATH = path.join(__dirname, 'auth.json');

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 kun
const MAX_FAILS = 5;                            // shuncha noto'g'ri urinishdan keyin
const LOCK_MS = 15 * 60 * 1000;                 // 15 daqiqa bloklash
const MIN_PASSWORD = 8;                         // eng kam parol uzunligi

// IP bo'yicha noto'g'ri urinishlar (xotirada — server o'chsa tozalanadi)
const attempts = new Map(); // ip -> { fails, lockUntil }

function load() {
  try {
    let raw = fs.readFileSync(AUTH_PATH, 'utf8');
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    return JSON.parse(raw);
  } catch {
    return { user: null, salt: null, hash: null, tokens: {} };
  }
}

function save(data) {
  try {
    fs.writeFileSync(AUTH_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[auth] saqlab bo\'lmadi:', e.message);
  }
}

let store = load();

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// Bir xil uzunlikdagi solishtirish — vaqt-hujumidan himoya
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Muddati o'tgan tokenlarni tozalash
function pruneTokens() {
  const now = Date.now();
  let changed = false;
  for (const t in store.tokens) {
    if (store.tokens[t] < now) { delete store.tokens[t]; changed = true; }
  }
  if (changed) save(store);
}

function issueToken() {
  pruneTokens();
  const token = newToken();
  store.tokens[token] = Date.now() + TOKEN_TTL_MS;
  save(store);
  return token;
}

// ---- ommaviy funksiyalar ----

function isRegistered() {
  return Boolean(store.hash);
}

function register(username, password) {
  if (isRegistered()) return { error: 'already_registered', code: 409 };
  username = String(username || '').trim() || 'operator';
  password = String(password || '');
  if (password.length < MIN_PASSWORD) {
    return { error: 'weak_password', code: 400,
      message: `Parol kamida ${MIN_PASSWORD} ta belgidan iborat bo'lsin.` };
  }
  const salt = crypto.randomBytes(16).toString('hex');
  store = { user: username, salt, hash: hashPassword(password, salt), tokens: {} };
  const token = issueToken();
  return { ok: true, token, username };
}

function login(password, ip) {
  const now = Date.now();
  const a = attempts.get(ip) || { fails: 0, lockUntil: 0 };
  if (a.lockUntil > now) {
    const mins = Math.ceil((a.lockUntil - now) / 60000);
    return { error: 'locked', code: 429,
      message: `Juda ko'p urinish. ${mins} daqiqadan keyin qayta urinib ko'ring.` };
  }
  if (!isRegistered()) return { error: 'not_registered', code: 400 };

  const hash = hashPassword(String(password || ''), store.salt);
  if (!safeEqual(hash, store.hash)) {
    a.fails += 1;
    if (a.fails >= MAX_FAILS) {
      a.lockUntil = now + LOCK_MS;
      a.fails = 0;
      attempts.set(ip, a);
      return { error: 'locked', code: 429,
        message: `Juda ko'p noto'g'ri urinish. ${Math.ceil(LOCK_MS / 60000)} daqiqa kuting.` };
    }
    attempts.set(ip, a);
    const left = MAX_FAILS - a.fails;
    return { error: 'bad_password', code: 401,
      message: `Parol noto'g'ri. Yana ${left} ta urinish qoldi.` };
  }
  attempts.delete(ip); // muvaffaqiyat — hisoblagichni tozalaymiz
  const token = issueToken();
  return { ok: true, token, username: store.user };
}

// Parolni almashtirish (eski parolni bilgan holda)
function changePassword(oldPassword, newPassword, ip) {
  const chk = login(oldPassword, ip);
  if (!chk.ok) return chk;
  if (String(newPassword || '').length < MIN_PASSWORD) {
    return { error: 'weak_password', code: 400,
      message: `Yangi parol kamida ${MIN_PASSWORD} ta belgidan iborat bo'lsin.` };
  }
  const salt = crypto.randomBytes(16).toString('hex');
  store.salt = salt;
  store.hash = hashPassword(newPassword, salt);
  store.tokens = {}; // barcha eski sessiyalar bekor bo'ladi
  const token = issueToken();
  save(store);
  return { ok: true, token, username: store.user };
}

function checkToken(token) {
  if (!token) return { valid: false };
  pruneTokens();
  const exp = store.tokens[token];
  if (exp && exp > Date.now()) return { valid: true, username: store.user };
  return { valid: false };
}

function logout(token) {
  if (token && store.tokens[token]) { delete store.tokens[token]; save(store); }
  return { ok: true };
}

// Authorization: Bearer <token> sarlavhasidan tokenni olish
function tokenFromReq(req) {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket.remoteAddress || 'local';
}

module.exports = {
  isRegistered, register, login, changePassword, checkToken, logout,
  tokenFromReq, clientIp,
};
