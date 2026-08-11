/*
 * Sentinel AI — NVR (kamera) parolini cameras.json ga yozadi.
 * Ishlatilishi:  node server/set-nvr-pass.js "<yangi_parol>" ["<user>"]
 * Mavjud sozlamalar (API kalit, telegram va h.k.) saqlanadi — faqat parol o'zgaradi.
 */
const fs = require('fs');
const path = require('path');

const P = path.join(__dirname, 'cameras.json');
const EX = path.join(__dirname, 'cameras.example.json');

const pw = process.argv[2];
if (!pw) { console.error('Parol berilmadi.'); process.exit(1); }

let cfg;
try {
  const src = fs.existsSync(P) ? P : EX;
  let raw = fs.readFileSync(src, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // BOM
  cfg = JSON.parse(raw);
} catch {
  cfg = { nvr: { ip: '192.168.1.100', port: 554, httpPort: 80, user: 'admin' },
    cameras: [{}, {}, {}, {}, {}, {}, {}, {}] };
}

cfg.nvr = cfg.nvr || {};
cfg.nvr.password = pw;
if (process.argv[3]) cfg.nvr.user = process.argv[3];

fs.writeFileSync(P, JSON.stringify(cfg, null, 2)); // BOM'siz, toza JSON
console.log('OK — kamera paroli yangilandi.');
