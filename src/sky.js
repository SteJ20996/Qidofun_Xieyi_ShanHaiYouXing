// sky.js —— 觀星（v0.9.16 使用者定）：按 T 抬頭，畫面從俯視地面轉成仰望天空；白天只有太陽，夜裡照天文。
// 星的位置、星等、顏色照真的星表（src/stars.js）；天怎麼轉照遊戲的日子與時辰：太陽的黃經照節氣（立春 315°），
// 恆星時 = 太陽赤經 + 太陽時角，所以夏夜看得到織女、牛郎與銀河，冬夜看得到參宿與天狼。人站在北緯 32 度（v0.9.16 是 34 度；v0.9.17 跟晝長一起改成 32 度，`CAL.LAT`），北極星高 32 度；太陽照節氣的赤緯走，夏天高、冬天低，日出日落跟遊戲的晝夜一致。
// 遊戲的晝夜是固定的（卯正天亮、酉正天黑，晝夜跟季節變還沒做），所以畫出來的太陽照赤緯 0 走——卯正從正東升起、酉正在正西落下，
// 跟地上的天光一致；星與月照真的黃道算。月相照曆法：初一朔、十五夜裡望。
(function () {
  'use strict';
  const U = window.U, CAL = window.CAL, D2R = Math.PI / 180, LAT = CAL.LAT * D2R, EPS = 23.4393 * D2R, SP = Math.sin(LAT), CP = Math.cos(LAT);
  const L = (s) => (window.I18N ? window.I18N.t(s) : s);
  const FONT = '"LXGW WenKai TC", "BiauKai", "DFKai-SB", "標楷體", "Kaiti TC", "Kaiti SC", "STKaiti", "KaiTi", "Noto Serif TC", "Noto Serif SC", serif';
  const HALF_FOV = 52 * D2R, ZOOM_MAX = 4, ALT_MIN = 4 * D2R, ALT_MAX = 89.5 * D2R;
  // 銀道 → 赤道（J2000）：赤道座標乘這個矩陣得銀道座標，反過來用它的轉置
  const GAL = [[-0.0548755604, -0.8734370902, -0.4838350155], [0.4941094279, -0.4448296300, 0.7469822445], [-0.8676661490, -0.1980763734, 0.4559837762]];
  const SIXIANG = [['東方蒼龍', [94, 196, 172]], ['北方玄武', [150, 162, 226]], ['西方白虎', [232, 234, 244]], ['南方朱雀', [240, 118, 90]]];
  const GOLD = [236, 204, 128], WESTC = [158, 188, 255];
  // 星的顏色照色指數（B−V）分八檔：藍白到橙紅
  const BV = [-0.3, 0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8], BVC = [[160, 186, 255], [196, 212, 255], [232, 236, 255], [255, 248, 236], [255, 233, 202], [255, 214, 164], [255, 194, 134], [255, 172, 112]];
  const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')', COLS = BVC.map(c => rgba(c, 1));
  const mixc = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  class Sky {
    constructor(cv) {
      this.cv = cv; this.ctx = cv.getContext('2d');
      const S = window.STARS; this.S = S;
      const n = S.n, bin = atob(S.data);
      this.n = n; this.x = new Float32Array(n); this.y = new Float32Array(n); this.z = new Float32Array(n); this.mag = new Float32Array(n); this.col = new Uint8Array(n); this.ph = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const o = i * 6, ra = ((bin.charCodeAt(o) << 8) | bin.charCodeAt(o + 1)) / 65535 * 2 * Math.PI, de = (((bin.charCodeAt(o + 2) << 8) | bin.charCodeAt(o + 3)) / 65535 * 180 - 90) * D2R;
        this.x[i] = Math.cos(de) * Math.cos(ra); this.y[i] = Math.cos(de) * Math.sin(ra); this.z[i] = Math.sin(de);
        this.mag[i] = bin.charCodeAt(o + 4) / 20 - 2;
        const bv = bin.charCodeAt(o + 5) / 100 - 0.5; let best = 0; for (let k = 1; k < BV.length; k++) if (Math.abs(BV[k] - bv) < Math.abs(BV[best] - bv)) best = k;
        this.col[i] = best; this.ph[i] = (U.hash2(i, 31, 7) & 1023) / 1023 * 6.2832;
      }
      this.names = S.names || {};
      this.sx = new Float32Array(n); this.sy = new Float32Array(n); this.su = new Float32Array(n); this.vis = new Uint8Array(n);
      this.makeSprites(); this.makeMilky();
      this.meteors = []; this.meteorT = 6; this.cloudA = 0; this.rainA = 0; this.snowA = 0;
      this.mwC = document.createElement('canvas'); this.mwX = this.mwC.getContext('2d'); this.mwKey = null; this.mwT = -1;   // 銀河畫在半解析度的一層，轉夠了才重畫
      const rr = U.mulberry32(9); this.ridgeP = [0, 1, 2].map(() => [rr() * 6.28, rr() * 6.28, rr() * 6.28, rr() * 6.28]);   // 遠山三層的起伏
    }
    makeSprites() {   // 每種星色一張光暈，亮星與銀河共用
      this.glow = BVC.map(c => {
        const k = document.createElement('canvas'); k.width = k.height = 64; const g = k.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, rgba(c, 0.9)); gr.addColorStop(0.35, rgba(c, 0.28)); gr.addColorStop(1, rgba(c, 0));
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return k;
      });
      const m = document.createElement('canvas'); m.width = m.height = 64; const g = m.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(205,214,255,1)'); gr.addColorStop(0.5, 'rgba(190,200,245,0.45)'); gr.addColorStop(1, 'rgba(180,190,240,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); this.mwSprite = m;
      const d = document.createElement('canvas'); d.width = d.height = 64; const h = d.getContext('2d'), dr = h.createRadialGradient(32, 32, 0, 32, 32, 32);
      dr.addColorStop(0, 'rgba(0,0,0,1)'); dr.addColorStop(1, 'rgba(0,0,0,0)'); h.fillStyle = dr; h.fillRect(0, 0, 64, 64); this.dustSprite = d;
    }
    // 銀河：照銀道座標撒一千八百團淡光，越近銀心（人馬座）越亮越厚；天鵝座到人馬座之間的暗帶（大裂縫）另外壓暗
    makeMilky() {
      const rnd = U.mulberry32(20260), pts = [], dust = [];
      const toEq = (l, b) => { const gx = Math.cos(b) * Math.cos(l), gy = Math.cos(b) * Math.sin(l), gz = Math.sin(b); return [GAL[0][0] * gx + GAL[1][0] * gy + GAL[2][0] * gz, GAL[0][1] * gx + GAL[1][1] * gy + GAL[2][1] * gz, GAL[0][2] * gx + GAL[1][2] * gy + GAL[2][2] * gz]; };
      const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += rnd(); return (s - 2) * 1.73; };
      const grain = [];
      for (let i = 0; i < 1500; i++) {
        const l = rnd() * 360, dl = Math.min(Math.abs(l), 360 - Math.abs(l)), core = Math.exp(-((dl / 55) ** 2)), cyg = Math.exp(-((((l - 78 + 540) % 360 - 180) / 22) ** 2));
        const sig = 3 + 6 * Math.exp(-((dl / 35) ** 2)), b = gauss() * sig, w = 0.3 + 0.7 * core + 0.35 * cyg;
        pts.push({ v: toEq(l * D2R, b * D2R), w: w * (0.55 + 0.45 * rnd()), r: (1.6 + 2.4 * rnd() + 2.6 * core) * D2R });
      }
      for (let i = 0; i < 3200; i++) {   // 顆粒：數不清的暗星，貼著銀道
        const l = rnd() * 360, dl = Math.min(Math.abs(l), 360 - Math.abs(l)), core = Math.exp(-((dl / 60) ** 2)), b = gauss() * (2.5 + 5 * Math.exp(-((dl / 35) ** 2)));
        grain.push({ v: toEq(l * D2R, b * D2R), w: (0.35 + 0.65 * core) * (0.4 + 0.6 * rnd()) });
      }
      for (let i = 0; i < 300; i++) { const l = 6 + rnd() * 76, b = 0.6 + gauss() * 1.5; dust.push({ v: toEq(l * D2R, b * D2R), w: 0.5 + 0.5 * rnd(), r: (1.2 + 2 * rnd()) * D2R }); }   // 大裂縫：天鵝座到人馬座那道暗帶
      this.mw = pts; this.mwDust = dust; this.mwGrain = grain;
    }
    resize(w, h, dpr) { if (this.cv.width !== Math.floor(w * dpr) || this.cv.height !== Math.floor(h * dpr)) { this.cv.width = Math.floor(w * dpr); this.cv.height = Math.floor(h * dpr); } this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px'; this.dpr = dpr; }
    // 鏡頭：看向方位 az（北起往東）、仰角 alt；zoom 放大。立體投影（stereographic），形狀不歪
    setView(az, alt, zoom) {
      this.az = az; this.alt = alt; this.zoom = zoom || 1;
      const W = this.cv.width, H = this.cv.height; this.W = W; this.H = H; this.cx = W / 2; this.cy = H / 2;
      this.F = (W / 2) / (2 * Math.tan(HALF_FOV / this.zoom / 2));
      const ca = Math.cos(az), sa = Math.sin(az), cl = Math.cos(alt), sl = Math.sin(alt);
      this.f = [cl * ca, cl * sa, sl]; this.r = [-sa, ca, 0]; this.u = [-sl * ca, -sl * sa, cl];   // 前、右、上（以北、東、天頂為軸）
    }
    altStart() { return 2 * Math.atan(-this.cy / (2 * this.F)); }   // 俯視時：地平線剛好在畫面最上緣
    horizonY(alt) { return this.cy + 2 * this.F * Math.tan(alt / 2); }
    proj(N, E, Up, out) {   // 地平座標（北、東、天頂）的單位向量 → 畫面；在背後就回 false
      const f = this.f, r = this.r, u = this.u, z = N * f[0] + E * f[1] + Up * f[2]; if (z < -0.35) return false;
      const k = 2 * this.F / (1 + z); out[0] = this.cx + k * (N * r[0] + E * r[1]); out[1] = this.cy - k * (N * u[0] + E * u[1] + Up * u[2]); out[2] = k; return true;
    }
    // 赤道 → 地平：恆星時 theta（弧度）
    hor(x, y, z, th, out) { const c = x * Math.cos(th) + y * Math.sin(th), s = x * Math.sin(th) - y * Math.cos(th); out[0] = CP * z - SP * c; out[1] = -s; out[2] = SP * z + CP * c; return out; }
    // 二十八宿此刻在哪（v0.9.21 見聞錄記當季看過的宿）：各宿星的平均方向換成地平座標；alt 高度（度）、south 在南半天、mer 離子午線多遠（東西分量，越小越接近中天）
    xiuNow(g) {
      const E = this.ephem(g), out = [], tmp = [0, 0, 0];
      for (const a of this.S.cn) { if (!(a.g >= 0) || !a.s || !a.s.length) continue; let x = 0, y = 0, z = 0; for (const i of a.s) { x += this.x[i]; y += this.y[i]; z += this.z[i]; }
        const n = Math.hypot(x, y, z) || 1; this.hor(x / n, y / n, z / n, E.th, tmp); out.push({ n: a.n, g: a.g, alt: Math.asin(Math.max(-1, Math.min(1, tmp[2]))) / D2R, south: tmp[0] < 0, mer: Math.abs(tmp[1]) }); }
      return out;
    }
    // 天上的位置：太陽黃經、恆星時、太陽、月（v0.9.17 起太陽照真的赤緯；時角照遊戲的時辰，正午在正南）
    ephem(g) {
      const w = g.world, DAY = window.XIEYI ? window.XIEYI.DAY : 360, t = w.time / DAY, dayT = g.dayT();
      const lam = CAL.sunLon(t) * D2R, raSun = Math.atan2(Math.cos(EPS) * Math.sin(lam), Math.cos(lam)), Hs = (dayT - 0.5) * 2 * Math.PI;
      const th = raSun + Hs, age = CAL.moonAge(t), lm = lam + age * 2 * Math.PI;
      const sun = this.hor(Math.cos(lam), Math.cos(EPS) * Math.sin(lam), Math.sin(EPS) * Math.sin(lam), th, [0, 0, 0]);   // 太陽在黃道上：夏至正午高 81.4°、冬至 34.6°
      const moon = this.hor(Math.cos(lm), Math.cos(EPS) * Math.sin(lm), Math.sin(EPS) * Math.sin(lm), th, [0, 0, 0]);
      return { th, sun, moon, age, illum: (1 - Math.cos(age * 2 * Math.PI)) / 2 };
    }

    draw(g, o) {
      const ctx = this.ctx, W = this.cv.width, H = this.cv.height, dpr = this.dpr || 1, now = o.now, dt = o.dt;
      this.setView(o.az, o.alt, o.zoom);
      const E = this.ephem(g), w = g.world, dayK = g.daylight(), night = 1 - dayK, tw = 1 - Math.abs(2 * dayK - 1);
      const lerp = (a, b, t) => a + (b - a) * t, k1 = Math.min(1, dt * 0.8);
      const wx = g.wxHere ? g.wxHere() : (w.precip() ? w.wx : '');   // 人站的這一格的天氣（v0.9.17：乾地上雨雪不下，乾雷有雲沒雨）
      this.cloudA = lerp(this.cloudA, wx ? 1 : 0, k1); this.rainA = lerp(this.rainA, wx === 'rain' || wx === 'thunder' ? 1 : 0, k1); this.snowA = lerp(this.snowA, wx === 'snow' ? 1 : 0, k1);
      const clear = 1 - this.cloudA, sunUp = E.sun[2], moonUp = E.moon[2] > 0 && night > 0.5, moonK = moonUp ? E.illum * night * clear : 0;
      const Yh = this.horizonY(this.alt), tmp = [0, 0, 0];
      // —— 天色：天頂到地平線一層漸層；白天藍、黃昏地平線暖、夜裡深藍近黑；陰天往灰裡收
      const zen = mixc(mixc([4, 6, 16], [42, 104, 178], dayK), [24, 34, 66], tw * 0.5), hzn = mixc(mixc([16, 26, 46], [186, 212, 234], dayK), [232, 150, 96], tw * 0.75);
      const gz = mixc(zen, mixc([12, 14, 18], [150, 158, 166], dayK), this.cloudA * 0.85), gh = mixc(hzn, mixc([22, 24, 28], [176, 182, 188], dayK), this.cloudA * 0.85);
      const Yz = this.cy - 2 * this.F * Math.tan((Math.PI / 2 - this.alt) / 2);
      const sky = ctx.createLinearGradient(0, Math.min(Yz, Yh - 1), 0, Yh); sky.addColorStop(0, rgba(gz, 1)); sky.addColorStop(0.7, rgba(mixc(gz, gh, 0.45), 1)); sky.addColorStop(1, rgba(gh, 1));
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      const sunP = [0, 0, 0], sunOn = this.proj(E.sun[0], E.sun[1], E.sun[2], sunP);
      if (sunOn && sunUp > -0.2 && clear > 0.05) {   // 太陽附近（與晨昏時那一側的地平線）亮一團
        const R = H * (0.55 + 0.4 * tw), gr = ctx.createRadialGradient(sunP[0], sunP[1], 0, sunP[0], sunP[1], R), wc = tw > 0.3 ? [255, 176, 110] : [255, 248, 228];
        gr.addColorStop(0, rgba(wc, 0.55 * clear * Math.max(dayK, tw))); gr.addColorStop(1, rgba(wc, 0)); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      }
      // —— 星能看到多暗：天越黑越多；月亮越圓越少；陰天全遮
      const lim = (-1.5 + 7.6 * sm(0.35, 1, night) - 1.7 * moonK) * clear + (clear < 0.08 ? -9 : 0);
      const th = E.th, fade = (u) => sm(-0.01, 0.22, u);   // 近地平線大氣厚，星淡
      // 全部的星先投影一次（連線、名字、指著時都用）
      for (let i = 0; i < this.n; i++) {
        this.hor(this.x[i], this.y[i], this.z[i], th, tmp); this.su[i] = tmp[2];
        this.vis[i] = tmp[2] > -0.02 && this.proj(tmp[0], tmp[1], tmp[2], tmp) && tmp[0] > -40 && tmp[1] > -40 && tmp[0] < W + 40 && tmp[1] < H + 40 ? 1 : 0;
        this.sx[i] = tmp[0]; this.sy[i] = tmp[1];
      }
      // —— 銀河：夜裡、沒月亮、晴才看得清
      const mwK = sm(0.6, 1, night) * clear * (1 - Math.min(1, moonK * 1.4));   // 月亮一圓，銀河就看不見了
      if (mwK > 0.01) {
        const key = [th, this.az, this.alt, this.zoom, W, H], k0 = this.mwKey, moved = !k0 ? 9 : Math.abs(key[0] - k0[0]) + Math.abs(key[1] - k0[1]) + Math.abs(key[2] - k0[2]) + Math.abs(key[3] - k0[3]) * 0.05 + (key[4] !== k0[4] || key[5] !== k0[5] ? 9 : 0);
        if (moved > 0.03 || (moved > 0.003 && now - this.mwT > 0.12) || now < this.mwT) { this.drawMilky(th); this.mwKey = key; this.mwT = now; }
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = mwK; ctx.imageSmoothingEnabled = true; ctx.drawImage(this.mwC, 0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
      }
      // —— 星：暗的是一點，亮的帶光暈；近地平線閃得厲害、也偏紅偏淡
      const zs = Math.sqrt(this.zoom), bright = [];
      if (lim > -1.5) {
        for (let i = 0; i < this.n; i++) {
          const m = this.mag[i]; if (m > lim) break;
          if (!this.vis[i] || this.su[i] <= 0) continue;
          const up = this.su[i], twk = 0.1 + 0.45 * (1 - up) * (1 - up), sc = 1 - twk * (0.5 + 0.5 * Math.sin(now * (2.3 + (i % 7) * 0.37) + this.ph[i]));
          const a = Math.min(1, (lim - m) / 1.6 + 0.08) * fade(up) * sc; if (a < 0.02) continue;
          if (m < 3.1) { bright.push(i, a); continue; }
          const sz = Math.max(1, (1.0 + (4.6 - Math.min(4.6, m)) * 0.45) * zs * dpr);
          ctx.globalAlpha = a; ctx.fillStyle = COLS[this.col[i]]; ctx.fillRect(this.sx[i] - sz / 2, this.sy[i] - sz / 2, sz, sz);
        }
        ctx.globalCompositeOperation = 'lighter';
        for (let j = 0; j < bright.length; j += 2) {
          const i = bright[j], a = bright[j + 1], m = this.mag[i], r = (1.3 + (3.1 - m) * 0.9) * zs * dpr, X = this.sx[i], Y = this.sy[i];
          ctx.globalAlpha = a * 0.85; ctx.drawImage(this.glow[this.col[i]], X - r * 4, Y - r * 4, r * 8, r * 8);
          if (m < 0.6) {   // 最亮的幾顆：細細的十字光芒
            ctx.globalAlpha = a * 0.35; ctx.strokeStyle = rgba(BVC[this.col[i]], 1); ctx.lineWidth = dpr; ctx.beginPath(); const L2 = r * (7 + 3 * Math.sin(now * 1.7 + i)); ctx.moveTo(X - L2, Y); ctx.lineTo(X + L2, Y); ctx.moveTo(X, Y - L2); ctx.lineTo(X, Y + L2); ctx.stroke();
          }
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      // —— 月：照月相畫亮面，暗面有一點地照
      if (moonUp && clear > 0.05) {
        const mp = [0, 0, 0];
        if (this.proj(E.moon[0], E.moon[1], E.moon[2], mp)) {
          const r = Math.max(7 * dpr, 0.55 * D2R * mp[2] * 1.6) * Math.min(2, zs), ang = Math.atan2(sunP[1] - mp[1], sunP[0] - mp[0]), il = E.illum, a = clear * sm(0.5, 0.9, night) * fade(E.moon[2]);
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * (0.25 + 0.5 * il);
          const halo = ctx.createRadialGradient(mp[0], mp[1], r * 0.8, mp[0], mp[1], r * 7); halo.addColorStop(0, 'rgba(230,236,255,0.5)'); halo.addColorStop(1, 'rgba(230,236,255,0)'); ctx.fillStyle = halo; ctx.fillRect(mp[0] - r * 7, mp[1] - r * 7, r * 14, r * 14);
          ctx.globalCompositeOperation = 'source-over';
          ctx.save(); ctx.translate(mp[0], mp[1]); ctx.rotate(ang); ctx.globalAlpha = a;
          ctx.fillStyle = 'rgba(70,78,98,0.85)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.fill();   // 暗面
          ctx.fillStyle = '#f1efe4'; ctx.beginPath(); ctx.moveTo(0, -r); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
          const ex = r * Math.abs(1 - 2 * il); ctx.ellipse(0, 0, Math.max(0.01, ex), r, 0, Math.PI / 2, -Math.PI / 2, il < 0.5); ctx.fill();
          ctx.globalAlpha = a * 0.25; ctx.fillStyle = 'rgba(150,150,140,1)'; for (const [dx, dy, rr] of [[0.25, -0.2, 0.22], [-0.1, 0.25, 0.16], [0.4, 0.3, 0.12]]) { ctx.beginPath(); ctx.arc(dx * r, dy * r, rr * r, 0, 6.2832); ctx.fill(); }   // 月面的海，一點斑
          ctx.restore();
        }
      }
      // —— 流星：夜裡晴天，二三十息一顆
      if (night > 0.75 && clear > 0.7 && o.live) {
        this.meteorT -= dt;
        if (this.meteorT <= 0) {
          this.meteorT = 12 + Math.random() * 26;
          const az = Math.random() * 6.2832, al = (30 + Math.random() * 50) * D2R, s0 = [Math.cos(al) * Math.cos(az), Math.cos(al) * Math.sin(az), Math.sin(al)];
          let t0 = [Math.random() - 0.5, Math.random() - 0.5, -0.6 - Math.random() * 0.5]; const dd = t0[0] * s0[0] + t0[1] * s0[1] + t0[2] * s0[2]; t0 = [t0[0] - dd * s0[0], t0[1] - dd * s0[1], t0[2] - dd * s0[2]]; const nn = Math.hypot(t0[0], t0[1], t0[2]); t0 = t0.map(v => v / nn);
          this.meteors.push({ s: s0, t: t0, len: (10 + Math.random() * 18) * D2R, dur: 0.6 + Math.random() * 0.7, age: 0 });
        }
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = this.meteors.length - 1; i >= 0; i--) {
        const mt = this.meteors[i]; mt.age += dt; if (mt.age > mt.dur) { this.meteors.splice(i, 1); continue; }
        const q = mt.age / mt.dur, head = mt.len * q, tail = Math.max(0, head - mt.len * 0.45), pt = (d) => { const c = Math.cos(d), s = Math.sin(d); return [mt.s[0] * c + mt.t[0] * s, mt.s[1] * c + mt.t[1] * s, mt.s[2] * c + mt.t[2] * s]; };
        const A = pt(tail), B = pt(head), pa = [0, 0, 0], pb = [0, 0, 0];
        if (!this.proj(A[0], A[1], A[2], pa) || !this.proj(B[0], B[1], B[2], pb)) continue;
        const gr = ctx.createLinearGradient(pa[0], pa[1], pb[0], pb[1]); gr.addColorStop(0, 'rgba(255,250,235,0)'); gr.addColorStop(1, 'rgba(255,250,235,' + (0.9 * Math.sin(q * Math.PI)).toFixed(3) + ')');
        ctx.globalAlpha = 1; ctx.strokeStyle = gr; ctx.lineWidth = 1.6 * dpr; ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      // —— 太陽：白天亮晃晃一團（陰天看不到）
      if (sunOn && sunUp > -0.03 && clear > 0.05) {
        const r = Math.max(14 * dpr, 0.55 * D2R * sunP[2] * 2.2), c = tw > 0.4 ? [255, 196, 130] : [255, 252, 240];
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clear;
        const gr = ctx.createRadialGradient(sunP[0], sunP[1], 0, sunP[0], sunP[1], r * 6); gr.addColorStop(0, rgba(c, 1)); gr.addColorStop(0.16, rgba(c, 0.9)); gr.addColorStop(0.22, rgba(c, 0.35)); gr.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = gr; ctx.fillRect(sunP[0] - r * 6, sunP[1] - r * 6, r * 12, r * 12);
        const g2 = ctx.createRadialGradient(sunP[0], sunP[1], r * 2, sunP[0], sunP[1], r * 16); g2.addColorStop(0, rgba(c, 0.22)); g2.addColorStop(1, rgba(c, 0));   // 外面一大圈柔光
        ctx.fillStyle = g2; ctx.fillRect(sunP[0] - r * 16, sunP[1] - r * 16, r * 32, r * 32);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = clear; ctx.fillStyle = rgba(mixc(c, [255, 255, 255], 0.7), 1); ctx.beginPath(); ctx.arc(sunP[0], sunP[1], r * 0.9, 0, 6.2832); ctx.fill();
      }
      // —— 星官／星座的連線與名字
      const lineK = sm(0.62, 0.95, night) * clear;   // 星出來了才連線寫名
      this.labels = [];
      if (o.culture !== 'none' && lineK > 0.02) {
        const set = o.culture === 'west' ? this.S.west : this.S.cn;
        ctx.lineWidth = 1.1 * dpr; ctx.lineCap = 'round';
        for (const a of set) {
          const c = o.culture === 'west' ? WESTC : a.g >= 0 ? SIXIANG[a.g][1] : GOLD, l = a.l;
          ctx.strokeStyle = rgba(c, 0.5 * lineK); ctx.beginPath(); let any = false;
          for (let j = 0; j < l.length; j += 2) { const p = l[j], q = l[j + 1]; if (this.su[p] <= 0 || this.su[q] <= 0 || (!this.vis[p] && !this.vis[q])) continue; ctx.moveTo(this.sx[p], this.sy[p]); ctx.lineTo(this.sx[q], this.sy[q]); any = true; }
          if (any) ctx.stroke();
          const mem = a.s || l; let X = 0, Y = 0, k = 0; for (const i of mem) if (this.su[i] > 0.02 && this.vis[i]) { X += this.sx[i]; Y += this.sy[i]; k++; }
          if (k && k >= Math.min(2, mem.length) * 0.5) this.labels.push({ x: X / k, y: Y / k, n: a.n, c, cn: o.culture !== 'west' });
        }
        ctx.font = Math.round(14 * dpr) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const b of this.labels) { ctx.globalAlpha = 0.85 * lineK; ctx.fillStyle = rgba(b.c, 1); ctx.fillText(L(b.n), b.x, b.y - 16 * dpr); }
        if (o.culture === 'cn') {   // 四象：二十八宿七宿一象，象名大字寫在那七宿中間
          ctx.font = Math.round(30 * dpr) + 'px ' + FONT;
          for (let gq = 0; gq < 4; gq++) {
            let vx = 0, vy = 0, vz = 0; for (const a of this.S.cn) if (a.g === gq) for (const i of a.s) { vx += this.x[i]; vy += this.y[i]; vz += this.z[i]; }
            this.hor(vx, vy, vz, th, tmp); const nn = Math.hypot(tmp[0], tmp[1], tmp[2]) || 1; if (tmp[2] / nn < 0.05) continue;
            if (!this.proj(tmp[0] / nn, tmp[1] / nn, tmp[2] / nn, tmp)) continue;
            ctx.globalAlpha = 0.32 * lineK; ctx.fillStyle = rgba(SIXIANG[gq][1], 1); ctx.fillText(L(SIXIANG[gq][0]), tmp[0], tmp[1]);
          }
        }
      }
      // —— 地：地平線以下是剛才俯視的那張地，照透視壓扁；抬頭時慢慢沉下去
      if (Yh < H + 60 * dpr) {
        o.glint = moonUp && clear > 0.3 ? { on: true, az: Math.atan2(E.moon[1], E.moon[0]), k: 0.4 + 0.6 * E.illum, day: false } : sunUp > 0 && clear > 0.3 ? { on: true, az: Math.atan2(E.sun[1], E.sun[0]), k: 0.6, day: true } : null;
        if (o.ground && o.groundA > 0.01) this.drawGround(o.ground, Yh, o, gh);
        this.drawHorizon(o, night, dayK, tw, gh);
      }
      // —— 方位：地平線上寫東南西北
      if (Yh < H + 40 * dpr) {
        ctx.font = Math.round(15 * dpr) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        const dirs = [['北', 0], ['東北', 45], ['東', 90], ['東南', 135], ['南', 180], ['西南', 225], ['西', 270], ['西北', 315]];
        for (const [nm, deg] of dirs) { const a = deg * D2R, al = 1.5 * D2R; if (!this.proj(Math.cos(al) * Math.cos(a), Math.cos(al) * Math.sin(a), Math.sin(al), tmp)) continue; ctx.globalAlpha = nm.length === 1 ? 0.8 : 0.45; ctx.fillStyle = night > 0.5 ? '#d8dcea' : '#33405a'; ctx.fillText(L(nm), tmp[0], tmp[1]); }
      }
      // —— 雨、雪、雷：仰頭看，雨絲雪花從天頂往四面落下來；雷雨天一閃一閃
      if (this.rainA > 0.02 || this.snowA > 0.02) {
        const zp = [0, 0, 0]; this.proj(0, 0, 1, zp); const R = Math.hypot(W, H);
        ctx.globalAlpha = 1; ctx.lineCap = 'round';
        if (this.rainA > 0.02) {
          ctx.strokeStyle = night > 0.5 ? 'rgba(200,210,230,' + (0.35 * this.rainA).toFixed(3) + ')' : 'rgba(70,84,110,' + (0.35 * this.rainA).toFixed(3) + ')'; ctx.lineWidth = 1.2 * dpr; ctx.beginPath();
          for (let i = 0; i < 160; i++) { const h = U.hash2(i, 11, 3), a = (h & 1023) / 1023 * 6.2832, sp = 0.6 + ((h >>> 10) & 255) / 255, d = ((now * 0.9 * sp + ((h >>> 18) & 255) / 255) % 1); const r0 = d * d * R, r1 = r0 + (8 + 40 * d) * dpr; ctx.moveTo(zp[0] + Math.cos(a) * r0, zp[1] + Math.sin(a) * r0); ctx.lineTo(zp[0] + Math.cos(a) * r1, zp[1] + Math.sin(a) * r1); }
          ctx.stroke();
        }
        if (this.snowA > 0.02) {
          ctx.fillStyle = 'rgba(245,247,252,' + (0.85 * this.snowA).toFixed(3) + ')'; ctx.beginPath();
          for (let i = 0; i < 220; i++) { const h = U.hash2(i, 17, 5), a = (h & 1023) / 1023 * 6.2832 + Math.sin(now * 0.7 + i) * 0.05, sp = 0.4 + ((h >>> 10) & 255) / 255 * 0.5, d = ((now * 0.12 * sp + ((h >>> 18) & 255) / 255) % 1), r0 = d * d * R, rr = (0.8 + 3.2 * d) * dpr; const X = zp[0] + Math.cos(a) * r0, Y = zp[1] + Math.sin(a) * r0; ctx.moveTo(X + rr, Y); ctx.arc(X, Y, rr, 0, 6.2832); }
          ctx.fill();
        }
      }
      if (this.cloudA > 0.02) {   // 雲：一層灰，幾團慢慢飄
        ctx.globalAlpha = 0.55 * this.cloudA; ctx.fillStyle = night > 0.5 ? '#0d0f13' : '#8c949c'; ctx.fillRect(0, 0, W, Math.max(0, Math.min(H, Yh)));
        for (let i = 0; i < 18; i++) { const h = U.hash2(i, 5, 9), X = ((h & 1023) / 1023 * W * 1.6 + now * (8 + (h >>> 20 & 15)) * dpr) % (W * 1.6) - W * 0.3, Y = ((h >>> 10) & 1023) / 1023 * Math.min(H, Yh), s = (120 + ((h >>> 3) & 127)) * dpr; ctx.globalAlpha = 0.18 * this.cloudA; ctx.drawImage(night > 0.5 ? this.dustSprite : this.mwSprite, X - s, Y - s * 0.5, s * 2, s); }
      }
      if (g.renderer && g.renderer.flash > 0) { ctx.globalAlpha = Math.min(0.6, g.renderer.flash); ctx.fillStyle = '#f6f6f0'; ctx.fillRect(0, 0, W, H); }
      // —— 指著哪顆星：寫名字（亮星多半有名）
      ctx.globalAlpha = 1; this.pick = null;
      if (o.mouse && lineK + night > 0.3) {
        const mx = o.mouse[0] * dpr, my = o.mouse[1] * dpr; let best = -1, bd = 14 * dpr;
        for (let i = 0; i < this.n && this.mag[i] <= Math.max(lim, 1); i++) { if (!this.vis[i] || this.su[i] <= 0) continue; const d = Math.hypot(this.sx[i] - mx, this.sy[i] - my) - (3 - Math.min(3, this.mag[i])) * dpr; if (d < bd) { bd = d; best = i; } }
        if (best >= 0) {
          const nm = this.names[best] || ''; this.pick = { i: best, name: nm, mag: this.mag[best] };
          const X = this.sx[best], Y = this.sy[best];
          ctx.strokeStyle = 'rgba(240,226,180,0.8)'; ctx.lineWidth = dpr; ctx.beginPath(); ctx.arc(X, Y, 9 * dpr, 0, 6.2832); ctx.stroke();
          const txt = (nm ? L(nm) + '　' : '') + L('星等 ') + this.mag[best].toFixed(1);
          ctx.font = Math.round(14 * dpr) + 'px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; const tw2 = ctx.measureText(txt).width;
          ctx.fillStyle = 'rgba(10,12,20,0.7)'; ctx.fillRect(X + 13 * dpr, Y - 12 * dpr, tw2 + 12 * dpr, 24 * dpr); ctx.fillStyle = '#efe6cc'; ctx.fillText(txt, X + 19 * dpr, Y);
        }
      }
      ctx.globalAlpha = 1;
      return { lim, moonK, illum: E.illum, age: E.age };
    }
    drawMilky(th) {   // 銀河一層（半解析度）：一團團淡光、細細的顆粒，再挖掉大裂縫
      const c = this.mwC, x = this.mwX, W = Math.ceil(this.W / 2), H = Math.ceil(this.H / 2), tmp = [0, 0, 0];
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.globalCompositeOperation = 'lighter';
      const fade = (u) => sm(-0.01, 0.25, u);
      for (const b of this.mw) { this.hor(b.v[0], b.v[1], b.v[2], th, tmp); const up = tmp[2]; if (up < -0.05 || !this.proj(tmp[0], tmp[1], tmp[2], tmp)) continue; const X = tmp[0] / 2, Y = tmp[1] / 2, s = b.r * tmp[2] / 2; if (X < -s || Y < -s || X > W + s || Y > H + s) continue; x.globalAlpha = 0.055 * b.w * fade(up); x.drawImage(this.mwSprite, X - s, Y - s, s * 2, s * 2); }
      x.fillStyle = '#cfd6f2';
      for (const b of this.mwGrain) { this.hor(b.v[0], b.v[1], b.v[2], th, tmp); const up = tmp[2]; if (up < 0 || !this.proj(tmp[0], tmp[1], tmp[2], tmp)) continue; const X = tmp[0] / 2, Y = tmp[1] / 2; if (X < 0 || Y < 0 || X > W || Y > H) continue; x.globalAlpha = 0.22 * b.w * fade(up); x.fillRect(X, Y, 1, 1); }
      x.globalCompositeOperation = 'destination-out';
      for (const b of this.mwDust) { this.hor(b.v[0], b.v[1], b.v[2], th, tmp); if (tmp[2] < -0.05 || !this.proj(tmp[0], tmp[1], tmp[2], tmp)) continue; const s = b.r * tmp[2] / 2; x.globalAlpha = 0.5 * b.w; x.drawImage(this.dustSprite, tmp[0] / 2 - s, tmp[1] / 2 - s, s * 2, s * 2); }
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    }
    // 抬頭的路上：地平線以下是剛才俯視的那張地，越近地平線壓得越扁、越暗、越霧（寬不縮，免得兩邊空出來）
    drawGround(src, Yh, o, hazeC) {
      const ctx = this.ctx, W = this.W, H = this.H, k = o.groundK, y0 = Math.max(0, Math.floor(Yh)), span = H - Yh, sw = src.width, shh = src.height, step = Math.max(1, Math.round(this.dpr || 1));
      const vOf = (t) => { if (k <= 1.0001) return t; const z = 1 / (t * (1 - 1 / k) + 1 / k); return 1 - (z - 1) / (k - 1); };
      ctx.globalAlpha = o.groundA; ctx.globalCompositeOperation = 'source-over';
      for (let y = y0; y < H; y += step) {
        const v0 = vOf(Math.max(0, (y - Yh) / span)), v1 = vOf(Math.min(1, (y + step - Yh) / span));
        ctx.drawImage(src, 0, Math.max(0, Math.min(shh - 1, v0 * shh)), sw, Math.max(1, (v1 - v0) * shh), 0, y, W, step);
      }
      const hz = ctx.createLinearGradient(0, Yh, 0, Yh + span * 0.6);   // 遠處罩一層霧
      hz.addColorStop(0, rgba(hazeC, 0.95)); hz.addColorStop(1, rgba(hazeC, 0)); ctx.fillStyle = hz; ctx.fillRect(0, y0, W, span * 0.6 + 2);
      ctx.globalAlpha = 1;
    }
    // 地平線：陸上三層水墨遠山（遠的淡、近的濃，山腳一抹霧），海上是一片平平的海與月光（日光）的倒影。
    // 山只畫在地平線上那一條；地平線以下，抬頭的路上是剛才那張地（drawGround），抬到頂了才換成實的地或海（groundA 越小越實）
    drawHorizon(o, night, dayK, tw, hazeC) {
      const ctx = this.ctx, W = this.W, H = this.H, dpr = this.dpr || 1, tmp = [0, 0, 0], a0 = o.horizonA === undefined ? 1 : o.horizonA, solid = 1 - (o.groundA || 0);
      const step = 1.5 * D2R, span = 110 * D2R / Math.min(2, this.zoom), azs = []; for (let a = this.az - span; a <= this.az + span + 1e-9; a += step) azs.push(a);
      const line = (hFn) => { const pts = []; for (const a of azs) { const h = hFn(a); if (this.proj(Math.cos(h) * Math.cos(a), Math.cos(h) * Math.sin(a), Math.sin(h), tmp)) pts.push(tmp[0], tmp[1]); else pts.push(NaN, NaN); } return pts; };
      const band = (top, bot, col, al) => {   // top、bot 兩條線之間填起來（bot 為 null 就填到畫面底）
        if (al <= 0.01) return; ctx.globalAlpha = al; ctx.fillStyle = rgba(col, 1); ctx.beginPath(); let open = false;
        for (let i = 0; i < top.length; i += 2) { if (isNaN(top[i])) continue; if (!open) { ctx.moveTo(top[i], top[i + 1]); open = true; } else ctx.lineTo(top[i], top[i + 1]); }
        if (!open) return;
        if (bot) { for (let i = bot.length - 2; i >= 0; i -= 2) if (!isNaN(bot[i])) ctx.lineTo(bot[i], bot[i + 1]); }
        else { let lx = 0, fx = 0; for (let i = top.length - 2; i >= 0; i -= 2) if (!isNaN(top[i])) { lx = top[i]; break; } for (let i = 0; i < top.length; i += 2) if (!isNaN(top[i])) { fx = top[i]; break; } ctx.lineTo(lx, H + 10 * dpr); ctx.lineTo(fx, H + 10 * dpr); }
        ctx.closePath(); ctx.fill();
      };
      const dusk = [92, 64, 86], ground = line(() => -0.4 * D2R);
      if (o.sea) {   // 海：一條平的海平線，底下一片海
        const sea = mixc(mixc([10, 18, 30], [70, 104, 136], dayK), dusk, tw * 0.4);
        band(line(() => 0), null, sea, solid);
        const lit = o.glint; if (lit && lit.on && solid > 0.05) {   // 月光（日光）在海上鋪一條碎銀，越近越寬
          ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = lit.day ? 'rgb(255,236,190)' : 'rgb(214,222,255)';
          for (let i = 0; i < 70; i++) { const h = U.hash2(i, 77, 3), d = (i + 0.5) / 70, al = -Math.pow(d, 1.6) * 30 * D2R; if (!this.proj(Math.cos(lit.az) * Math.cos(al), Math.sin(lit.az) * Math.cos(al), Math.sin(al), tmp)) continue; const w2 = (4 + 70 * d * d) * dpr * (0.4 + ((h & 255) / 255)), ph = Math.sin(o.now * 2.2 + i * 1.7); ctx.globalAlpha = solid * lit.k * 0.35 * (0.4 + 0.6 * (0.5 + 0.5 * ph)) * (1 - d * 0.5); ctx.fillRect(tmp[0] - w2 / 2 + ph * 5 * dpr * d, tmp[1], w2, (1 + 2 * d) * dpr); }
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.globalAlpha = 1; return;
      }
      const P = this.ridgeP, ridge = (a, p, amp, base) => (base + amp * (0.55 * Math.sin(a * 3 + p[0]) + 0.3 * Math.sin(a * 7 + p[1]) + 0.17 * Math.sin(a * 13 + p[2]) + 0.08 * Math.sin(a * 29 + p[3]))) * D2R;
      const far = mixc(mixc([30, 38, 58], [150, 168, 188], dayK), dusk, tw * 0.5), mid = mixc(mixc([19, 25, 38], [108, 126, 146], dayK), dusk, tw * 0.35), near = mixc(mixc([9, 12, 19], [64, 76, 90], dayK), dusk, tw * 0.2);
      band(ground, null, near, solid);   // 實的地
      band(line((a) => Math.max(0.3 * D2R, ridge(a, P[0], 2.2, 2.6))), ground, far, 0.85 * a0);
      band(line((a) => Math.max(0.2 * D2R, ridge(a, P[1], 1.2, 1.0))), ground, mixc(far, hazeC, 0.5), 0.5 * a0);   // 山腳的一抹霧
      band(line((a) => Math.max(0.2 * D2R, ridge(a, P[1], 1.5, 1.4))), ground, mid, 0.95 * a0);
      band(line((a) => Math.max(0.1 * D2R, ridge(a, P[2], 1.0, 0.5))), ground, near, a0);
      ctx.globalAlpha = 1;
    }
  }
  window.Sky = Sky;
})();
