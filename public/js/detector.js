/* Sentinel AI — AI obyekt aniqlash
 *
 * REAL rejim : TensorFlow.js + COCO-SSD modeli brauzerda ishga tushadi va
 *              kamera kadrlarida shaxs/transport/buyumlarni aniqlaydi.
 * DEMO rejim : simulyatsiya sahnasidagi obyektlar to'g'ridan-to'g'ri olinadi.
 *
 * Natija: har kamera uchun [{kind, label, conf, x, y, w, h, danger}] (0..1 koordinatalar)
 */

const COCO_LABELS_UZ = {
  person: 'SHAXS',
  car: 'AVTOMOBIL',
  truck: 'YUK MASHINASI',
  bus: 'AVTOBUS',
  motorcycle: 'MOTOTSIKL',
  bicycle: 'VELOSIPED',
  backpack: 'SUMKA',
  handbag: 'SUMKA',
  suitcase: 'JOMADON',
  knife: 'PICHOQ',
  scissors: 'QAYCHI',
  dog: 'IT',
  cat: 'MUSHUK',
};

const Detector = {
  model: null,
  loading: false,
  demo: true,

  async init(demo) {
    this.demo = demo;
    if (demo || this.model || this.loading) return;
    this.loading = true;
    try {
      await this._loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js');
      await this._loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
      this.model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      console.log('[detector] COCO-SSD modeli yuklandi');
    } catch (e) {
      console.warn('[detector] Model yuklanmadi, demo aniqlashga o\'tildi:', e.message);
    }
    this.loading = false;
  },

  _loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error(src + ' yuklanmadi'));
      document.head.appendChild(s);
    });
  },

  /** Bitta kamera oqimini tahlil qiladi. */
  async detect(stream, cam) {
    if (this.demo || !this.model) {
      // demo: sahna obyektlaridan foydalanish
      return (stream.objects || []).map((o) => ({
        kind: o.kind,
        label: o.kind === 'person' ? 'SHAXS' : 'AVTOMOBIL',
        conf: 88 + Math.floor(Math.random() * 11),
        x: o.x, y: o.y, w: o.w, h: o.h,
        danger: o.kind === 'person' && cam.restricted,
      }));
    }
    try {
      const preds = await this.model.detect(stream.canvas);
      return preds
        .filter((p) => p.score > 0.45)
        .map((p) => ({
          kind: p.class,
          label: COCO_LABELS_UZ[p.class] || p.class.toUpperCase(),
          conf: Math.round(p.score * 100),
          x: p.bbox[0] / stream.canvas.width,
          y: p.bbox[1] / stream.canvas.height,
          w: p.bbox[2] / stream.canvas.width,
          h: p.bbox[3] / stream.canvas.height,
          danger:
            (p.class === 'person' && cam.restricted) ||
            p.class === 'knife' ||
            p.class === 'scissors',
        }));
    } catch {
      return [];
    }
  },
};
