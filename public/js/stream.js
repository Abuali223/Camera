/* Sentinel AI — video oqimlari
 * DemoScene  : real kamera bo'lmaganda kanvasda simulyatsiya qilingan CCTV sahna
 * RealStream : lokal server orqali RTSP→MJPEG (WebSocket) jonli oqim
 * Ikkalasi ham bir xil interfeys: .canvas, .objects (aniqlangan obyektlar), .start(), .stop()
 */

const CAM_W = 640, CAM_H = 360;

/* ------------------------------------------------ DEMO sahna generatori */
class DemoScene {
  constructor(cam, idx) {
    this.cam = cam;
    this.idx = idx;
    this.canvas = document.createElement('canvas');
    this.canvas.width = CAM_W;
    this.canvas.height = CAM_H;
    this.canvas.className = 'feed';
    this.ctx = this.canvas.getContext('2d');
    this.t = idx * 137; // har kamera har xil fazada
    this.objects = []; // {kind:'person'|'car', x,y,w,h (0..1)}
    this.actors = this._makeActors();
    this.running = false;
  }

  _makeActors() {
    const rnd = (a, b) => a + Math.random() * (b - a);
    const actors = [];
    const n = this.cam.scene === 'parking' ? 0 : 1 + (this.idx % 2);
    for (let i = 0; i < n; i++) {
      actors.push({
        kind: 'person', x: rnd(0.15, 0.8), y: rnd(0.45, 0.7),
        vx: rnd(-0.0012, 0.0012) || 0.0008, sz: rnd(0.09, 0.13), phase: rnd(0, 6),
        conf: Math.round(rnd(88, 98)), // barqaror ishonch (pirpiramasligi uchun)
      });
    }
    if (this.cam.scene === 'parking' || this.cam.scene === 'loading') {
      actors.push({ kind: 'car', x: rnd(0.2, 0.6), y: 0.68, vx: 0.0003, sz: 0.2, phase: 0, conf: Math.round(rnd(84, 95)) });
    }
    return actors;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this._draw();
      this._raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  _draw() {
    const { ctx } = this;
    const W = CAM_W, H = CAM_H;
    this.t += 1;
    const t = this.t;

    // fon — tungi CCTV muhiti
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#141d26');
    g.addColorStop(1, '#080c11');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // shift chiroqlari
    ctx.fillStyle = 'rgba(120,160,190,0.06)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(W * (0.2 + i * 0.3), H * 0.1, 90, 26, 0, 0, 7);
      ctx.fill();
    }

    // pol chiziqlari (perspektiva)
    ctx.strokeStyle = 'rgba(120,150,180,0.09)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const y = H * 0.45 + (i * i * 2.2);
      if (y > H) break;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    for (let i = 0; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo(W * (i / 10), H * 0.45);
      ctx.lineTo(W * 0.5 + (W * (i / 10) - W * 0.5) * 2.4, H);
      ctx.stroke();
    }

    // sahnaga xos statik obyektlar
    ctx.fillStyle = 'rgba(40,58,74,0.8)';
    if (this.cam.scene === 'warehouse') {
      for (let i = 0; i < 3; i++) {
        const x = W * (0.06 + i * 0.34), y = H * 0.22;
        ctx.fillRect(x, y, W * 0.22, H * 0.3);
        ctx.strokeStyle = 'rgba(90,120,150,0.35)';
        ctx.strokeRect(x, y, W * 0.22, H * 0.3);
        for (let r = 1; r < 3; r++) { ctx.beginPath(); ctx.moveTo(x, y + r * H * 0.1); ctx.lineTo(x + W * 0.22, y + r * H * 0.1); ctx.stroke(); }
      }
    } else if (this.cam.scene === 'entrance') {
      ctx.fillRect(W * 0.4, H * 0.18, W * 0.2, H * 0.42); // eshik
      ctx.strokeStyle = 'rgba(90,120,150,0.4)';
      ctx.strokeRect(W * 0.4, H * 0.18, W * 0.2, H * 0.42);
      ctx.strokeRect(W * 0.47, H * 0.18, W * 0.06, H * 0.42);
    } else if (this.cam.scene === 'factory') {
      ctx.fillRect(W * 0.05, H * 0.4, W * 0.9, H * 0.08); // konveyer
      ctx.fillStyle = 'rgba(60,84,104,0.9)';
      for (let i = 0; i < 6; i++) {
        const bx = ((t * 0.8 + i * 110) % (W + 60)) - 30;
        ctx.fillRect(bx, H * 0.37, 34, H * 0.05);
      }
    } else if (this.cam.scene === 'parking') {
      ctx.strokeStyle = 'rgba(140,170,200,0.25)';
      for (let i = 0; i < 5; i++) {
        ctx.strokeRect(W * (0.06 + i * 0.19), H * 0.55, W * 0.15, H * 0.3);
      }
    } else if (this.cam.scene === 'loading') {
      ctx.fillRect(W * 0.65, H * 0.25, W * 0.3, H * 0.35); // yuk mashinasi orqa
      ctx.strokeStyle = 'rgba(90,120,150,0.4)';
      ctx.strokeRect(W * 0.65, H * 0.25, W * 0.3, H * 0.35);
    }

    // harakatlanuvchi aktyorlar
    this.objects = [];
    for (const a of this.actors) {
      a.x += a.vx;
      if (a.x < 0.05 || a.x > 0.88) a.vx *= -1;
      const bob = Math.sin(t * 0.08 + a.phase) * 0.006;

      if (a.kind === 'person') {
        const px = a.x * W, py = (a.y + bob) * H, s = a.sz * H;
        ctx.fillStyle = 'rgba(16,24,32,0.95)';
        // tana
        ctx.beginPath();
        ctx.roundRect(px - s * 0.28, py - s * 0.9, s * 0.56, s * 1.1, s * 0.2);
        ctx.fill();
        // bosh
        ctx.beginPath();
        ctx.arc(px, py - s * 1.05, s * 0.22, 0, 7);
        ctx.fill();
        // oyoqlar (yurish)
        const leg = Math.sin(t * 0.15 + a.phase) * s * 0.18;
        ctx.fillRect(px - s * 0.18 + leg, py + s * 0.2, s * 0.13, s * 0.5);
        ctx.fillRect(px + s * 0.05 - leg, py + s * 0.2, s * 0.13, s * 0.5);
        this.objects.push({ kind: 'person', x: a.x - a.sz * 0.35, y: a.y - a.sz * 1.35, w: a.sz * 0.75, h: a.sz * 2.1, conf: a.conf });
      } else {
        const px = a.x * W, py = a.y * H, s = a.sz * W;
        ctx.fillStyle = 'rgba(22,32,44,0.95)';
        ctx.beginPath();
        ctx.roundRect(px, py - s * 0.3, s, s * 0.32, 6);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(px + s * 0.15, py - s * 0.45, s * 0.55, s * 0.2, 5);
        ctx.fill();
        ctx.fillStyle = 'rgba(140,180,220,0.5)';
        ctx.beginPath(); ctx.arc(px + s * 0.15, py + 2, s * 0.07, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(px + s * 0.82, py + 2, s * 0.07, 0, 7); ctx.fill();
        this.objects.push({ kind: 'car', x: a.x, y: a.y - a.sz * 0.28, w: a.sz, h: a.sz * 0.42, conf: a.conf });
      }
    }

    // video shovqin (noise)
    ctx.fillStyle = 'rgba(255,255,255,0.018)';
    for (let i = 0; i < 40; i++) {
      ctx.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
    }

    // vinyetka
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
}

/* ------------------------------------------------ REAL oqim (WS MJPEG) */
class RealStream {
  constructor(cam) {
    this.cam = cam;
    this.canvas = document.createElement('canvas');
    this.canvas.width = CAM_W;
    this.canvas.height = CAM_H;
    this.canvas.className = 'feed';
    this.ctx = this.canvas.getContext('2d');
    this.objects = []; // real rejimda detector.js to'ldiradi
    this.running = false;
    this.connected = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/stream/${encodeURIComponent(this.cam.id)}`);
    this.ws.binaryType = 'blob';
    this.ws.onmessage = async (ev) => {
      if (typeof ev.data === 'string') return;
      this.connected = true;
      const bmp = await createImageBitmap(ev.data).catch(() => null);
      if (!bmp) return;
      this.ctx.drawImage(bmp, 0, 0, CAM_W, CAM_H);
      bmp.close();
    };
    this.ws.onclose = () => {
      this.connected = false;
      if (this.running) this._retry = setTimeout(() => this.start(), 4000);
      this.running = false;
    };
  }

  stop() {
    this.running = false;
    clearTimeout(this._retry);
    if (this.ws) try { this.ws.close(); } catch {}
  }
}

function createStream(cam, idx, demo) {
  return demo ? new DemoScene(cam, idx) : new RealStream(cam);
}
