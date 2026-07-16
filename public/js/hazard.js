/* Sentinel AI — yong'in va tutun aniqlash (yordamchi heuristika)
 *
 * DIQQAT: bu brauzerdagi rang/harakat tahliliga asoslangan YORDAMCHI tizim.
 * U haqiqiy yong'in datchigi (sensor) o'rnini bosmaydi — qo'shimcha ogohlantirish
 * sifatida ishlaydi. Noto'g'ri signalni kamaytirish uchun bir necha kadr davomida
 * tasdiqlanganidan keyingina xavf deb belgilaydi.
 *
 * Yong'in belgilari : yorqin, qizil > yashil > ko'k piksellar + "miltillash" (flicker).
 * Tutun belgilari   : kulrang (past to'yinganlik), o'rta yorug'lik + harakatlanuvchi maydon.
 */

const Hazard = {
  enabled: true,
  _prev: {},   // camId -> {fireN, gray}
  _state: {},  // camId -> {fire, smoke} ketma-ket hisoblagich
  _cv: null,

  analyze(stream, cam) {
    if (!this.enabled || !stream || !stream.canvas) return [];
    const src = stream.canvas;
    if (!src.width || !src.height) return [];

    const W = 64, H = 36, total = W * H;
    const cv = this._cv || (this._cv = document.createElement('canvas'));
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    let data;
    try {
      ctx.drawImage(src, 0, 0, W, H);
      data = ctx.getImageData(0, 0, W, H).data;
    } catch { return []; }

    const gray = new Float32Array(total);
    let fireN = 0, fx0 = W, fy0 = H, fx1 = 0, fy1 = 0, smokeN = 0;

    for (let i = 0, p = 0; i < total; i++, p += 4) {
      const r = data[p], g = data[p + 1], b = data[p + 2];
      const bri = (r + g + b) / 3;
      gray[i] = bri;
      // olov: yorqin va qizil ustun
      if (r > 170 && r > g + 25 && g > b + 10 && b < 130 && bri > 120) {
        fireN++;
        const x = i % W, y = (i / W) | 0;
        if (x < fx0) fx0 = x; if (x > fx1) fx1 = x;
        if (y < fy0) fy0 = y; if (y > fy1) fy1 = y;
      }
      // tutun: kulrang (past to'yinganlik), o'rta yorug'lik
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      if (sat < 0.16 && bri > 70 && bri < 205) smokeN++;
    }

    const prev = this._prev[cam.id];
    const st = this._state[cam.id] || (this._state[cam.id] = { fire: 0, smoke: 0 });
    const dets = [];

    // --- yong'in: rang + miltillash (oldingi kadr bilan farq) ---
    const fireRatio = fireN / total;
    const flicker = prev && prev.fireN != null ? Math.abs(fireN - prev.fireN) : 0;
    if (fireRatio > 0.012 && fireN > 8 && (flicker > 2 || fireRatio > 0.05)) st.fire++;
    else st.fire = Math.max(0, st.fire - 1);
    if (st.fire >= 3) {
      dets.push({
        kind: 'fire', label: "YONG'IN XAVFI", danger: true,
        conf: Math.min(97, 62 + Math.round(fireRatio * 400)),
        x: fx0 / W, y: fy0 / H,
        w: Math.max(0.05, (fx1 - fx0 + 1) / W), h: Math.max(0.05, (fy1 - fy0 + 1) / H),
      });
    }

    // --- tutun: kulrang maydon + harakat (kadrlar farqi) ---
    let motion = 0;
    if (prev && prev.gray) {
      for (let i = 0; i < total; i++) if (Math.abs(gray[i] - prev.gray[i]) > 18) motion++;
    }
    const smokeRatio = smokeN / total, motionRatio = motion / total;
    if (smokeRatio > 0.35 && motionRatio > 0.06 && motionRatio < 0.6) st.smoke++;
    else st.smoke = Math.max(0, st.smoke - 1);
    if (st.smoke >= 4) {
      dets.push({
        kind: 'smoke', label: 'TUTUN (ehtimol)', danger: true, conf: 72,
        x: 0.08, y: 0.05, w: 0.84, h: 0.7,
      });
    }

    this._prev[cam.id] = { fireN, gray };
    return dets;
  },
};
