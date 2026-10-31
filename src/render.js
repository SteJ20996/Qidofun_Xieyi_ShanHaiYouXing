// render.js —— 水墨渲染：宣紙、滲墨的字、晝夜、小地圖
(function () {
  'use strict';
  const U = window.U, G = window.G, DB = G.DB;
  const FONT = '"LXGW WenKai TC", "BiauKai", "DFKai-SB", "標楷體", "Kaiti TC", "Kaiti SC", "STKaiti", "KaiTi", "Noto Serif TC", "Noto Serif SC", "Noto Serif CJK TC", "PingFang TC", "WenQuanYi Zen Hei", serif';   // 簡體字霞鶩文楷 TC 也有，缺的幾個落到 SC 字型
  const L = (s) => (window.I18N ? window.I18N.t(s) : s);   // 畫布上的字：選了簡體就轉（v0.5.4）
  const GONG_LOW = '#45204f';   // 共工命剩三成起的黑紫（v0.9.1）
  const MAP_VIEW_R = 30, MAP_MIN_N = MAP_VIEW_R * 2, MAP_GLYPH_PX = 10, MAP_FONT_MAX = 30;   // 大地圖放大（v0.8.24）；v0.8.25 使用者改：放到最大只看得見方圓三十格的圓；一格大過十點就寫字
  const MINI = {
    '淼': '#4a6f8f', '水': '#6f93b0', '沙': '#d9c89a', '石': '#9c9a93', '山': '#6e6c75', '雪': '#e8ecf2',
    '草': '#b9c98f', '花': '#d29b8e', '木': '#8aa86f', '林': '#5e8a55', '森': '#3b5f3a', '竹': '#7fa36b', '田': '#d1c572',
    '土': '#a98a62', '灰': '#8d8781', '白': '#f3ebd8', '火': '#d9593c', '炎': '#d9593c', '焱': '#d9593c',
    '明': '#f0c54a', '休': '#9a6b45', '困': '#7a5a3e', '碑': '#2a2724', '亭': '#8a3a2a', '桑': '#3a7a52', '若': '#a2552f', '建': '#5a4a2a', '日': '#e07a4a', '月': '#e3c35a',
    '果': '#c9654a', '灶': '#d9593c', '鼎': '#b4452c', '包': '#2a2724', '囊': '#5a3e2b', '煤': '#2a2724', '鐵': '#8a5a3a', '網': '#5a86a8', '罟': '#4f7a9c', '罾': '#446e90', '路': '#c9b27a', '門': '#9a7a55', '井': '#4a6f8f',
    '棉': '#e8e2d0', '礫': '#b9b4a8', '磚': '#9a5a40', '甓': '#5b6770', '窯': '#b4452c', '甕': '#7a5a3a', '缸': '#4f7a8a', '墟': '#8a8378', '窗': '#c09a6a', '沼': '#6b6a3c', '棧': '#9a6b45', '床': '#a06a4a', '漁': '#5a86a8', '麻': '#a9b07a', '偶': '#b08a5a', '櫃': '#7a4e2d', '舟': '#7a4e2d',
    '塔': '#2a2724', '寺': '#5a3e2b', '船': '#5a3e2b', '泉': '#4a6f8f', '墓': '#6e6c75', '洞': '#2a2724', '燈': '#e0a020',
    '漠': '#e3cf98', '丘': '#d6bb7a', '池': '#5f9cc0', '棗': '#7d9a55', '熔': '#d2502a', '岩': '#5d5a62', '燧': '#2a2622', '曜': '#2b2133', '川': '#5f9cc0', '湖': '#5a92b8', '湯': '#8cc3d0', '窟': '#3a3028',   // v0.7
    '苗': '#8fb06a', '秀': '#b5b05a', '稻': '#d9b54a', '黍': '#d9b54a', '稷': '#d9b54a', '麥': '#d9b54a', '菽': '#d9b54a', '穗': '#cdbb88', '籬': '#8a6a45', '扉': '#8a6a45'   // v0.9.18 五穀、籬
  };

  // 光照（v0.6.4；v0.6.9 改成射線）：每道光從燈芯往外射線，碰到磚、門、墟的邊就停，圍出一個多邊形——影子的邊沿著牆角斜斜射出去，不是一格一格的方塊。
  // 夜色與暖光畫在一張每格 LM_PX 點的小畫布上（多邊形裁切＋放射漸層），再平滑放大蓋上去；多邊形按地上的字的版本（world.ver）與燈芯位置快取。各種光的顏色：
  const LM_PX = 10, LAMP = [255, 192, 96], BEACON = [255, 214, 130], FIRE = [255, 138, 58], STOVE = [255, 158, 70], TORCH = [255, 172, 82], DRAGON = [236, 214, 160], AZURE = [150, 230, 205];
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

  class Renderer {
    constructor(canvas, mini) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.mini = mini; this.mctx = mini.getContext('2d');
      this.tile = 40;
      this.atlas = new Map();
      this.paper = this.makePaper();
      this.pattern = null;
      this.lmDark = document.createElement('canvas'); this.lmGlow = document.createElement('canvas');   // 光照圖：夜色、暖光
      this.lmDarkCtx = this.lmDark.getContext('2d'); this.lmGlowCtx = this.lmGlow.getContext('2d');
      this.sightCache = new Map(); this.shapeCache = new Map(); this.fogSeen = new Map();
      this.puff = this.makeSprite(64, [[0, 'rgba(248,247,242,1)'], [0.6, 'rgba(240,238,232,0.56)'], [1, 'rgba(240,238,232,0)']]);   // 一團霧
      this.bloom = this.makeSprite(64, [[0, 'rgba(255,236,190,0.9)'], [0.35, 'rgba(255,200,120,0.45)'], [1, 'rgba(255,180,90,0)']]);  // 光源的芯
      this.camX = 0; this.camY = 0; this.camInit = false;
      this.shake = 0; this.miniAcc = 1;
      this.resize();
      window.addEventListener('resize', () => this.resize());
      // 書法字體加載完成後，重建字形緩存
      if (document.fonts) {
        document.fonts.load('32px "LXGW WenKai TC"').then(() => this.atlas.clear()).catch(() => {});
        document.fonts.addEventListener('loadingdone', () => this.atlas.clear());
      }
    }
    resize() {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = window.innerWidth; this.h = window.innerHeight;
      this.cv.width = Math.floor(this.w * this.dpr); this.cv.height = Math.floor(this.h * this.dpr);
      this.cv.style.width = this.w + 'px'; this.cv.style.height = this.h + 'px';
    }

    // 宣紙：暖色底 + 細碎噪點 + 若干纖維
    makePaper() {
      const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
      const x = c.getContext('2d');
      x.fillStyle = '#efe5cf'; x.fillRect(0, 0, S, S);
      const img = x.getImageData(0, 0, S, S), d = img.data, rnd = U.mulberry32(7);
      for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8; }
      x.putImageData(img, 0, 0);
      x.strokeStyle = 'rgba(120, 95, 60, 0.07)'; x.lineWidth = 1;
      for (let i = 0; i < 160; i++) {
        const ax = rnd() * S, ay = rnd() * S, a = rnd() * Math.PI * 2, l = 10 + rnd() * 40;
        x.beginPath(); x.moveTo(ax, ay); x.quadraticCurveTo(ax + Math.cos(a + 0.5) * l * 0.5, ay + Math.sin(a + 0.5) * l * 0.5, ax + Math.cos(a) * l, ay + Math.sin(a) * l); x.stroke();
      }
      for (let i = 0; i < 60; i++) { x.fillStyle = 'rgba(90, 70, 40,' + (0.03 + rnd() * 0.05) + ')'; x.beginPath(); x.arc(rnd() * S, rnd() * S, 1 + rnd() * 2, 0, 7); x.fill(); }
      return c;
    }

    makeSprite(S, stops) {   // 一張放射漸層的小圖，之後只做 drawImage（比每幀造漸層省）
      const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), gr = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      for (const [o, col] of stops) gr.addColorStop(o, col);
      x.fillStyle = gr; x.fillRect(0, 0, S, S); return c;
    }
    // 光源 (lx, ly) 半徑 R 內哪些格子看得見：附近沒有擋光的字回 null（全看得見），否則回一張 (2R+1)² 的表；地上的字沒變就用快取
    sight(world, lx, ly, R) {
      const key = lx + ',' + ly + ',' + R, ver = world.ver || 0, c = this.sightCache.get(key);
      if (c && c.ver === ver) return c.vis;
      let any = false;
      for (let dy = -R; dy <= R && !any; dy++) for (let dx = -R; dx <= R; dx++) { const d = DB[world.get(lx + dx, ly + dy)]; if (d && d.opaque) { any = true; break; } }
      let vis = null;
      if (any) {
        const W = 2 * R + 1, R2 = (R + 0.5) * (R + 0.5); vis = new Uint8Array(W * W);
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= R2 && world.clear(lx, ly, lx + dx, ly + dy)) vis[(dy + R) * W + dx + R] = 1;
        // 擋光的字（磚、門、墟）：旁邊（八鄰）有一格看得見、不擋光的亮處，它朝光的那一面就亮（v0.6.8）
        const lit = []; const op = (dx, dy) => { const d = DB[world.get(lx + dx, ly + dy)]; return !!(d && d.opaque); };
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
          const i = (dy + R) * W + dx + R; if (vis[i] || dx * dx + dy * dy > R2 || !op(dx, dy)) continue;
          for (let j = -1; j <= 1 && !vis[i]; j++) for (let k = -1; k <= 1; k++) { const nx = dx + k, ny = dy + j; if ((j || k) && Math.abs(nx) <= R && Math.abs(ny) <= R && vis[(ny + R) * W + nx + R] && !op(nx, ny)) { lit.push(i); break; } }
        }
        for (const i of lit) vis[i] = 1;
      }
      if (this.sightCache.size > 600) this.sightCache.clear();
      this.sightCache.set(key, { ver, vis }); return vis;
    }
    // 一道光照得到的範圍（v0.6.9）：從燈芯 (cx, cy) 對每個牆角射三條線（正中與左右各偏一點），找最近碰到的擋光邊，連成多邊形；
    // 被照到的擋光格子本身（旁邊有看得見的亮處）另記成方塊一起照亮。附近沒有擋光的字就回 null（整個圓都亮）
    lightShape(world, cx, cy, r) {
      const key = Math.round(cx * 8) + ',' + Math.round(cy * 8) + ',' + Math.ceil(r), ver = world.ver || 0, hit = this.shapeCache.get(key);
      if (hit && hit.ver === ver) return hit.shape;
      const R = Math.ceil(r) + 1, lx = Math.floor(cx), ly = Math.floor(cy);
      const op = (x, y) => { const d = DB[world.get(x, y)]; return !!(d && d.opaque); };
      const hs = new Map(), vs = new Map();   // 擋光格子的外緣：橫的照 y、直的照 x 分組，之後把相連的併成一條
      const addH = (y, x, side) => { const k = y + ':' + side; if (!hs.has(k)) hs.set(k, []); hs.get(k).push(x); };
      const addV = (x, y, side) => { const k = x + ':' + side; if (!vs.has(k)) vs.set(k, []); vs.get(k).push(y); };
      for (let y = ly - R; y <= ly + R; y++) for (let x = lx - R; x <= lx + R; x++) {
        if (!op(x, y)) continue;
        if (!op(x, y - 1)) addH(y, x, 0); if (!op(x, y + 1)) addH(y + 1, x, 1);
        if (!op(x - 1, y)) addV(x, y, 0); if (!op(x + 1, y)) addV(x + 1, y, 1);
      }
      let shape = null;
      if (hs.size || vs.size) {
        const segs = [], merge = (list) => { list.sort((a, b) => a - b); const out = []; let s0 = list[0], e0 = list[0] + 1; for (let i = 1; i < list.length; i++) { if (list[i] === e0) e0++; else { out.push([s0, e0]); s0 = list[i]; e0 = list[i] + 1; } } out.push([s0, e0]); return out; };
        for (const [k, list] of hs) { const y = +k.split(':')[0]; for (const [a, b] of merge(list)) segs.push([a, y, b, y]); }
        for (const [k, list] of vs) { const x = +k.split(':')[0]; for (const [a, b] of merge(list)) segs.push([x, a, x, b]); }
        const B = r + 1.5, bx0 = cx - B, by0 = cy - B, bx1 = cx + B, by1 = cy + B;   // 外框：射線最遠到這裡
        segs.push([bx0, by0, bx1, by0], [bx1, by0, bx1, by1], [bx1, by1, bx0, by1], [bx0, by1, bx0, by0]);
        const angs = []; const seen = new Set();
        for (const sg of segs) for (const [px, py] of [[sg[0], sg[1]], [sg[2], sg[3]]]) { const k = px + ',' + py; if (seen.has(k)) continue; seen.add(k); const a = Math.atan2(py - cy, px - cx); angs.push(a - 1e-4, a, a + 1e-4); }
        angs.sort((a, b) => a - b);
        const poly = new Float64Array(angs.length * 2);
        for (let i = 0; i < angs.length; i++) {
          const dx = Math.cos(angs[i]), dy = Math.sin(angs[i]); let best = Infinity;
          for (const sg of segs) {   // 射線與線段的交點：原點 + t·方向 = 線段起點 + u·（終點 − 起點）
            const ex = sg[2] - sg[0], ey = sg[3] - sg[1], den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) continue;
            const qx = sg[0] - cx, qy = sg[1] - cy, t = (qx * ey - qy * ex) / den, u = (qx * dy - qy * dx) / den;
            if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9 && t < best) best = t;
          }
          if (!isFinite(best)) best = B; poly[i * 2] = cx + dx * best; poly[i * 2 + 1] = cy + dy * best;
        }
        const vis = this.sight(world, lx, ly, R), W = 2 * R + 1, rects = [];   // 被照到的擋光格子：整格亮
        if (vis) for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) if (vis[(j + R) * W + i + R] && op(lx + i, ly + j)) rects.push(lx + i, ly + j);
        shape = { poly, rects };
      }
      if (this.shapeCache.size > 400) this.shapeCache.clear();
      this.shapeCache.set(key, { ver, shape }); return shape;
    }
    // 光照圖：夜色那張先鋪滿夜色，每道光在它照得到的多邊形裡挖一個放射漸層的洞（多道光一層層挖，跟以前一樣）；暖光那張照同樣的形狀塗上光的顏色
    lightMap(g, ox, oy, x0, x1, y0, y1, lights, dark, glowK, now) {
      const T = this.tile, P = LM_PX, world = g.world, p = g.player;
      const cols = (x1 - x0 + 1) * P, rows = (y1 - y0 + 1) * P;
      if (this.lmDark.width !== cols || this.lmDark.height !== rows) for (const c of [this.lmDark, this.lmGlow]) { c.width = cols; c.height = rows; }
      const dc = this.lmDarkCtx, gc = this.lmGlowCtx, toX = (x) => (x - x0) * P, toY = (y) => (y - y0) * P;
      const clipTo = (c, sh) => {   // 照得到的形：多邊形加上被照到的牆格（同一個繞向，合起來就是聯集）
        c.beginPath(); const pl = sh.poly; c.moveTo(toX(pl[0]), toY(pl[1])); for (let i = 2; i < pl.length; i += 2) c.lineTo(toX(pl[i]), toY(pl[i + 1])); c.closePath();
        for (let i = 0; i < sh.rects.length; i += 2) c.rect(toX(sh.rects[i]), toY(sh.rects[i + 1]), P, P);
        c.clip();
      };
      const spot = (c, cx, cy, r, stops) => { const X = toX(cx), Y = toY(cy), Rr = r * P, gr = c.createRadialGradient(X, Y, 0, X, Y, Rr); for (const [o, col] of stops) gr.addColorStop(o, col); c.fillStyle = gr; c.fillRect(X - Rr, Y - Rr, Rr * 2, Rr * 2); };
      const CUT = [[0, 'rgba(0,0,0,1)'], [0.55, 'rgba(0,0,0,0.7)'], [0.75, 'rgba(0,0,0,0.33)'], [0.9, 'rgba(0,0,0,0.08)'], [1, 'rgba(0,0,0,0)']];
      const each = (fn) => {   // 每道光（含人身邊看得見的那一圈）：照得到的形與畫法
        fn(p.rx + 0.5, p.ry + 0.5, g.playerLight(), null);
        for (const l of lights) fn(l.cx === undefined ? l.x + 0.5 : l.cx, l.cy === undefined ? l.y + 0.5 : l.cy, l.r + 0.25 * Math.sin(now * 6 + l.x * 3 + l.y), l.c || LAMP);
      };
      const inView = (cx, cy, r) => cx + r >= x0 && cx - r <= x1 + 1 && cy + r >= y0 && cy - r <= y1 + 1;
      if (dark > 0.02) {
        dc.globalCompositeOperation = 'source-over'; dc.clearRect(0, 0, cols, rows); dc.fillStyle = 'rgba(12,16,36,' + (0.8 * dark) + ')'; dc.fillRect(0, 0, cols, rows);
        dc.globalCompositeOperation = 'destination-out';
        each((cx, cy, r) => { if (r <= 0 || !inView(cx, cy, r)) return; const sh = this.lightShape(world, cx, cy, r); dc.save(); if (sh) clipTo(dc, sh); spot(dc, cx, cy, r, CUT); dc.restore(); });
        dc.globalCompositeOperation = 'source-over';
      }
      gc.clearRect(0, 0, cols, rows); let glow = false;
      each((cx, cy, r, col) => {
        if (!col || r <= 0 || !inView(cx, cy, r)) return; glow = true;
        const sh = this.lightShape(world, cx, cy, r), c = col[0] + ',' + col[1] + ',' + col[2];
        gc.save(); if (sh) clipTo(gc, sh); spot(gc, cx, cy, r, [[0, 'rgba(' + c + ',0.24)'], [0.35, 'rgba(' + c + ',0.14)'], [0.7, 'rgba(' + c + ',0.045)'], [1, 'rgba(' + c + ',0)']]); gc.restore();
      });
      return { cols, rows, x: ox + x0 * T, y: oy + y0 * T, w: (x1 - x0 + 1) * T, h: (y1 - y0 + 1) * T, glow, px: P / T };
    }
    // 霧障（v0.6.4）：霧是一塊連續的形，每幀照它此刻的位置與形狀算出每格蓋了幾成，蓋得多的格子濃、邊上蓋一點的淡，
    // 那一團霧畫在蓋到的部分的中心，所以看起來是整片順著風飄過去、邊緣一直在變；新起的霧淡入，散掉或吹散的霧淡出
    drawFog(g, ox, oy, x0, x1, y0, y1, dt, now) {
      const ctx = this.ctx, T = this.tile, world = g.world, seen = this.fogSeen;
      for (const [id, f] of world.fogs) seen.set(id, f);
      for (const [id, f] of seen) {
        const alive = world.fogs.get(id) === f;
        f._fade = alive ? Math.min(1, (f._fade === undefined ? 0 : f._fade) + dt / 1.2) : (f._fade === undefined ? 1 : f._fade) - dt / 1.2;
        if (!alive && f._fade <= 0) { seen.delete(id); continue; }
        if (f.x + 8 < x0 || f.x - 8 > x1 + 1 || f.y + 8 < y0 || f.y - 8 > y1 + 1) continue;
        const cov = alive ? (f._cov = world.fogCoverage(f, undefined, undefined, undefined, f.mul)) : (f._cov || []);   // 撐的倍數用世界每半息算好的那個
        const left = Math.min(1, Math.max(0, (f.until - world.time) / 20)) * f._fade;     // 快散時淡下去
        let mx = 0, my = 0, mw = 0;
        for (const e of cov) {
          mx += e.mx * e.c; my += e.my * e.c; mw += e.c;
          const a = 0.62 * left * Math.min(1, e.c * 1.6); if (a <= 0.01) continue;
          for (let i = 0; i < 3; i++) {
            const r = U.hash2(e.x, e.y, 300 + i), ph = (r & 1023) / 1023 * 6.28, pull = 0.35 + 0.65 * e.c;   // 蓋得少的格子，那團霧靠向蓋到的角落
            const fx = e.x + 0.5 + (e.mx - e.x - 0.5) * (1 - pull), fy = e.y + 0.5 + (e.my - e.y - 0.5) * (1 - pull);
            const px = ox + fx * T + Math.sin(now * 0.35 + ph) * T * 0.22, py = oy + fy * T + Math.cos(now * 0.27 + ph * 1.3) * T * 0.18;
            const rad = T * (0.55 + 0.45 * Math.sqrt(e.c)) * (0.85 + ((r >>> 10) & 255) / 255 * 0.4);
            ctx.globalAlpha = a; ctx.drawImage(this.puff, px - rad, py - rad, rad * 2, rad * 2);
          }
        }
        ctx.globalAlpha = 1;
        if (mw > 0) { const cx = ox + (mx / mw) * T, cy = oy + (my / mw) * T; if (cx > -T && cy > -T && cx < this.w + T && cy < this.h + T) this.drawGlyph('霧', G.INK.ash, cx, cy, T * 0.9, 0, 0.35 * left); }
      }
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    // 字形緩存：每個字按顏色渲染一次（帶一層模糊的"滲墨"），之後只做 drawImage
    glyph(ch, color) {
      ch = L(ch);   // 選了簡體：畫簡體字（字形各自快取）
      const key = ch + '|' + color;
      let c = this.atlas.get(key);
      if (c) return c;
      const S = 128; c = document.createElement('canvas'); c.width = c.height = S;
      const x = c.getContext('2d');
      x.font = Math.round(S * 0.72) + 'px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color;
      if ('filter' in x) { x.filter = 'blur(3px)'; x.globalAlpha = 0.32; x.fillText(ch, S / 2, S / 2 + 4); x.filter = 'none'; }
      x.globalAlpha = 1; x.fillText(ch, S / 2, S / 2 + 4);
      this.atlas.set(key, c);
      return c;
    }
    // 作物字一筆一筆長（v0.9.21）：照 G.STROKES 的中線刷一道粗筆當遮罩，字形只露出前 n 筆；快取同 glyph()
    partGlyph(ch, color, n) {
      const key = ch + '|' + color + '|' + n; let c = this.atlas.get(key); if (c) return c;
      const S = 128, full = this.glyph(ch, color), list = G.STROKES[ch]; c = document.createElement('canvas'); c.width = c.height = S;
      const m = document.createElement('canvas'); m.width = m.height = S; const mx = m.getContext('2d');   // 先把寫到的幾筆刷在另一張上（聯集），再一次蓋上去當遮罩
      mx.strokeStyle = '#000'; mx.lineCap = 'round'; mx.lineJoin = 'round'; mx.lineWidth = S * 0.72 * 0.14;
      const at = (g) => (g / 10 * 64 - 320) / 576 * S * 0.72;   // 描的時候字身 576 點、置中在 320；這裡字身 S×0.72、中心 (S/2, S/2+4)
      for (let i = 0; i < Math.min(n, list.length); i++) { const st = list[i]; mx.beginPath(); mx.moveTo(S / 2 + at(st[0]), S / 2 + 4 + at(st[1])); for (let j = 2; j < st.length; j += 2) mx.lineTo(S / 2 + at(st[j]), S / 2 + 4 + at(st[j + 1])); mx.stroke(); }
      const x = c.getContext('2d'); x.drawImage(full, 0, 0); x.globalCompositeOperation = 'destination-in'; x.drawImage(m, 0, 0);
      this.atlas.set(key, c); return c;
    }
    drawShip(cx, cy, rec, now, warded, aboard) {   // v0.8.17：船身一塊長方形（東西長或南北長），淡淡的甲板，上頭一個拉長的「舟」字（跟野牛一樣，橫躺拉扁、直立拉長）
      const T = this.tile, k = G.SHIPS[rec.kind] || G.SHIPS['孤帆'], h = rec.dir === 'h', W = h ? k.h : k.w, H = h ? k.w : k.h, hurt = rec.hp / k.hp;
      const ctx = this.ctx, bob = Math.sin(now * 1.5) * 2, bw = W * T - 4, bh = H * T - 4;
      ctx.save(); ctx.fillStyle = 'rgba(47,88,120,0.18)'; ctx.beginPath(); ctx.ellipse(cx, cy + bh * 0.42, bw * 0.55, Math.max(T * 0.18, bh * 0.12), 0, 0, 7); ctx.fill();
      ctx.translate(0, bob); ctx.fillStyle = aboard ? 'rgba(154,107,69,0.32)' : 'rgba(154,107,69,0.2)'; ctx.strokeStyle = hurt < 0.34 ? 'rgba(180,57,42,0.6)' : 'rgba(110,72,45,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, T * 0.3); else ctx.rect(cx - bw / 2, cy - bh / 2, bw, bh); ctx.fill(); ctx.stroke(); ctx.restore();
      const side = Math.min(W, H), size = T * side * 0.95;
      this.drawGlyph('舟', hurt < 0.34 ? G.INK.red : G.INK.brown, cx, cy + bob, size, Math.sin(now * 1.5) * 0.04, aboard ? 0.6 : 0.95, W / side, H / side);
      if (warded) this.drawGlyph('骨', G.INK.red, cx, cy - bh / 2 + T * 0.1, T * 0.42, 0, 0.9);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    drawGlyph(ch, color, px, py, size, rot, alpha, kx, ky) {   // kx、ky：橫、縱拉長幾倍（野牛的身子，v0.7.2）
      const ctx = this.ctx, s = this.dpr, c = rot ? Math.cos(rot) : 1, sn = rot ? Math.sin(rot) : 0, ax = kx || 1, ay = ky || 1;
      ctx.setTransform(s * c * ax, s * sn * ax, -s * sn * ay, s * c * ay, px * s, py * s);
      const a = alpha === undefined ? 1 : alpha, a0 = ctx.globalAlpha;   // v0.9.14 自查：乘在外面已有的透明度上（原本直接蓋成 a、畫完設回 1，墨影外層的半透明被蓋掉）
      if (a < 1) ctx.globalAlpha = a0 * a;
      ctx.drawImage(this.glyph(ch, color), -size * 0.65, -size * 0.65, size * 1.3, size * 1.3);
      if (a < 1) ctx.globalAlpha = a0;
      ctx.setTransform(s, 0, 0, s, 0, 0);
    }
    // ---------- 神兵的招牌特效（v0.8.31） ----------
    fxRnd(sd, i) { const v = Math.sin(i * 12.9898 + sd * 78.233) * 43758.5453; return v - Math.floor(v); }   // 特效裡的亂數：同一下每一幀都一樣
    // 落雷（v0.9.15）：一道主幹帶三條岔枝從畫面頂上劈下，先閃一下、暗一瞬、再劈一次（回擊），之後餘光變細淡去；
    // 落點三乘三照傷害分三檔亮起（正中、十字、四角），兩圈衝擊波、四散的火星、一團亮光，「雷」字砸下來
    boltPath(seed, x0, y0, x1, y1, n, amp) {
      const pts = [];
      for (let i = 0; i <= n; i++) { const k = i / n, r = U.hash2(seed, i, 59), sway = Math.sin(Math.PI * k);   // 兩端收、中間擺得開
        pts.push([x0 + (x1 - x0) * k + (i && i < n ? ((r & 1023) / 1023 - 0.5) * amp * (0.35 + sway) : 0), y0 + (y1 - y0) * k + (i && i < n ? (((r >>> 10) & 255) / 255 - 0.5) * amp * 0.3 : 0)]); }
      return pts;
    }
    drawBoltWarn(f, px, py, pr, T, dark, now) {
      const ctx = this.ctx, night = dark > 0.5, beat = 0.55 + 0.45 * Math.abs(Math.sin(now * (10 + 8 * pr)));   // 越近落下閃得越急
      ctx.save();
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const tier = Math.abs(i) + Math.abs(j), k = [0.42, 0.26, 0.11][tier] * beat * (0.45 + 0.55 * pr);
        ctx.fillStyle = (night ? 'rgba(243,239,216,' : 'rgba(201,162,39,') + k + ')'; ctx.fillRect(px + (i - 0.5) * T + 1, py + (j - 0.5) * T + 1, T - 2, T - 2);
      }
      ctx.globalAlpha = beat * (0.4 + 0.6 * pr); ctx.strokeStyle = night ? '#f3efd8' : '#a8801a'; ctx.lineWidth = 2; ctx.setLineDash([T * 0.25, T * 0.18]); ctx.strokeRect(px - T * 1.5, py - T * 1.5, T * 3, T * 3);
      ctx.setLineDash([]); ctx.lineWidth = 2.5; ctx.strokeRect(px - T * 0.5, py - T * 0.5, T, T);   // 正中那格描實線
      if (pr > 0.6) {   // 落下前一刻：天上垂下一縷細細的先導
        const q = (pr - 0.6) / 0.4, pts = this.boltPath((f.x * 31 + f.y * 17) | 0, px, -T, px, py, 9, T * 1.2), m = Math.max(1, Math.round(pts.length * q));
        ctx.globalAlpha = 0.5 * q; ctx.strokeStyle = night ? 'rgba(220,228,255,0.9)' : 'rgba(60,64,80,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath();
        pts.slice(0, m).forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.restore();
    }
    drawLocust(L, ox, oy, T, now) {   // 蝗群：十幾個小「蝗」字繞著要落的那片田亂飛（v0.9.19）
      const ctx = this.ctx, cx = ox + (L.x + 0.5) * T, cy = oy + (L.y + 0.5) * T;
      if (cx < -8 * T || cy < -8 * T || cx > this.w + 8 * T || cy > this.h + 8 * T) return;
      ctx.save(); ctx.globalAlpha = 0.8;
      for (let i = 0; i < 16; i++) { const a = now * (0.6 + (i % 5) * 0.17) + i * 2.4, r = T * (1.2 + (i % 7) * 0.45 + 0.4 * Math.sin(now * 1.7 + i)); this.drawGlyph('蝗', '#8a6d1e', cx + Math.cos(a) * r, cy + Math.sin(a * 1.3) * r * 0.7, T * 0.36); }
      ctx.restore();
    }
    drawBoltScar(f, px, py, pr, T) {   // 燒焦的地：照三檔深淺，正中有裂紋；最後四成慢慢淡掉
      const ctx = this.ctx, fade = pr < 0.6 ? 1 : (1 - pr) / 0.4; if (fade <= 0) return;
      ctx.save();
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const k = [0.42, 0.24, 0.1][Math.abs(i) + Math.abs(j)] * fade; ctx.fillStyle = 'rgba(28,24,20,' + k + ')'; ctx.fillRect(px + (i - 0.5) * T + 2, py + (j - 0.5) * T + 2, T - 4, T - 4); }
      ctx.strokeStyle = 'rgba(20,16,12,' + 0.7 * fade + ')'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let n = 0; n < 6; n++) { const r = U.hash2(f.seed || 1, n, 7), a = n / 6 * Math.PI * 2 + (r & 255) / 255, len = T * (0.5 + ((r >>> 8) & 255) / 255 * 0.8); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * len * 0.5 + ((r >>> 16) & 15) - 7, py + Math.sin(a) * len * 0.5); ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); }
      ctx.stroke(); ctx.restore();
    }
    drawBolt(f, px, py, pr, T, dark) {
      const ctx = this.ctx, t = f.t, night = dark > 0.5, seed = f.seed || ((f.x * 7 + f.y * 13) | 0);
      // 主幹的亮度：0–0.12 劈下、0.12–0.2 暗一瞬、0.2–0.32 回擊、0.32–0.75 餘光淡去
      const a = t < 0.12 ? 1 : t < 0.2 ? 0.18 : t < 0.32 ? 1 : Math.max(0, 1 - (t - 0.32) / 0.43);
      if (t >= 0.2 && !f.re) { f.re = true; this.flash = Math.max(this.flash || 0, 0.32); }   // 回擊再白一下
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (a > 0) {
        const main = this.boltPath(seed + (t >= 0.2 ? 1 : 0), px + ((seed & 63) - 32) / 32 * T * 2, -T, px, py, Math.max(7, Math.round((py + T) / (T * 0.9))), T * 1.6);
        const thin = t >= 0.32 ? Math.max(0.35, a) : 1, forks = [];
        for (let b = 0; b < 3; b++) {   // 三條岔枝：從主幹四成到八成五的地方岔出去，斜斜往下
          const r = U.hash2(seed, b, 97), at = Math.floor(main.length * (0.4 + ((r & 255) / 255) * 0.45)), [bx, by] = main[at], side = (r >>> 8) & 1 ? 1 : -1, len = T * (1.6 + ((r >>> 9) & 255) / 255 * 2.2);
          forks.push(this.boltPath(seed * 3 + b + (t >= 0.2 ? 5 : 0), bx, by, bx + side * len * 0.9, by + len, 5, T * 0.8));
        }
        const day = !night, layers = day ? [[T * 0.36, 'rgba(28,26,23,' + 0.6 * a + ')'], [T * 0.18, 'rgba(201,162,39,' + a + ')'], [T * 0.07, 'rgba(255,253,240,' + a + ')']]   // 白天紙上：墨邊、金身、白芯
          : [[T * 0.55, 'rgba(150,175,255,' + 0.3 * a + ')'], [T * 0.22, 'rgba(200,215,255,' + 0.55 * a + ')'], [T * 0.08, 'rgba(255,255,250,' + a + ')']];
        const line = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); };
        for (const [lw, col] of layers) { ctx.strokeStyle = col; ctx.lineWidth = lw * thin; line(main); if (a > 0.5 || t < 0.32) { ctx.lineWidth = lw * 0.45 * thin; for (const fk of forks) line(fk); } }
      }
      ctx.restore();
      // 落點：三檔亮格、衝擊波、火星、一團光
      const q = Math.min(1, t / 0.5), glow = Math.max(0, 1 - t / 0.7);
      ctx.save();
      if (glow > 0) {
        if (night) ctx.globalCompositeOperation = 'lighter';
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const k = [0.8, 0.5, 0.24][Math.abs(i) + Math.abs(j)] * glow; ctx.fillStyle = (night ? 'rgba(200,215,255,' : 'rgba(255,214,90,') + k + ')'; ctx.fillRect(px + (i - 0.5) * T + 1, py + (j - 0.5) * T + 1, T - 2, T - 2); }
        const rg = ctx.createRadialGradient(px, py, 0, px, py, T * 2.2); rg.addColorStop(0, (night ? 'rgba(235,240,255,' : 'rgba(255,248,220,') + 0.9 * glow + ')'); rg.addColorStop(1, 'rgba(255,248,220,0)');
        ctx.fillStyle = rg; ctx.fillRect(px - T * 2.2, py - T * 2.2, T * 4.4, T * 4.4); ctx.globalCompositeOperation = 'source-over';
      }
      for (const [d0, wgt] of [[0, 3], [0.12, 1.8]]) {   // 兩圈衝擊波
        const qq = Math.min(1, Math.max(0, (t - d0) / 0.5)); if (qq <= 0 || qq >= 1) continue;
        ctx.strokeStyle = (night ? 'rgba(220,230,255,' : 'rgba(90,70,20,') + 0.75 * (1 - qq) + ')'; ctx.lineWidth = wgt * (1 - qq) + 0.5; ctx.beginPath(); ctx.arc(px, py, T * (0.4 + 2.1 * qq), 0, 6.2832); ctx.stroke();
      }
      if (q < 1) {   // 十二點火星往外飛
        ctx.strokeStyle = night ? 'rgba(255,240,200,' + (1 - q) + ')' : 'rgba(201,120,20,' + (1 - q) + ')'; ctx.lineWidth = 1.6; ctx.beginPath();
        for (let n = 0; n < 12; n++) { const r = U.hash2(seed, n, 13), ang = (r & 1023) / 1023 * 6.2832, sp = 0.8 + ((r >>> 10) & 255) / 255, d1 = T * (0.3 + 1.7 * q * sp), d2 = d1 + T * 0.35 * (1 - q); ctx.moveTo(px + Math.cos(ang) * d1, py + Math.sin(ang) * d1 + q * q * T * 0.6); ctx.lineTo(px + Math.cos(ang) * d2, py + Math.sin(ang) * d2 + q * q * T * 0.6); }
        ctx.stroke();
      }
      ctx.restore();
      const drop = Math.min(1, t / 0.18);   // 「雷」字從大砸到落點
      this.drawGlyph('雷', night ? '#f3efd8' : '#b8860b', px, py, T * (2.4 - 0.9 * drop), (1 - drop) * 0.25, Math.max(0, 1 - pr * 1.1));
    }
    drawThunder(f, px, py, pr, T, ox, oy) {   // 九閽鳴雷：大「雷」字砸下、三圈方折的雷紋（青銅器上的回紋）往外擴散到三格外，一道道閃電劈到挨打的獸身上
      const ctx = this.ctx, R = f.r || 3, land = Math.min(1, pr / 0.18);
      this.drawGlyph('雷', G.INK.red, px, py - T * 0.9 * (1 - land), T * (2.6 - 1.1 * land), 0, pr < 0.5 ? 1 : Math.max(0, 1 - (pr - 0.5) / 0.5));
      ctx.save(); ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
      for (let k = 0; k < 3; k++) {
        const q = (pr - 0.1 - k * 0.13) / 0.6; if (q <= 0 || q >= 1) continue;
        const rad = T * (0.7 + (R + 0.3) * q), tooth = T * 0.18, n = 2 * (14 + k * 4), rot = this.fxRnd(f.sd, k) * Math.PI;
        for (const [off, wd, al] of [[0, 2.4, 0.85], [tooth * 1.6, 1.2, 0.5]]) {   // 雙線：外一道粗、裡一道細
          ctx.strokeStyle = 'rgba(180,57,42,' + (al * (1 - q)) + ')'; ctx.lineWidth = wd; ctx.beginPath();
          for (let j = 0; j <= n; j++) {   // 方波繞一圈：一段在外、一段在裡，轉角都是直角
            const a0 = rot + j * Math.PI * 2 / n, a1 = rot + (j + 1) * Math.PI * 2 / n, r = rad - off - (j % 2 ? tooth : 0), r2 = rad - off - (j % 2 ? 0 : tooth);
            if (j === 0) ctx.moveTo(px + Math.cos(a0) * r, py + Math.sin(a0) * r); else ctx.lineTo(px + Math.cos(a0) * r, py + Math.sin(a0) * r);
            ctx.lineTo(px + Math.cos(a1) * r, py + Math.sin(a1) * r); if (j < n) ctx.lineTo(px + Math.cos(a1) * r2, py + Math.sin(a1) * r2);
          }
          ctx.stroke();
        }
      }
      if (pr < 0.55) {   // 閃電：一閃一閃換形
        const fl = Math.floor(pr * 14), a = 1 - pr / 0.55;
        (f.tg || []).forEach(([tx, ty], i) => {
          const qx = ox + tx * T + T / 2, qy = oy + ty * T + T / 2, dx = qx - px, dy = qy - py, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, pts = [[px, py]];
          for (let s = 1; s < 6; s++) { const o = (this.fxRnd(f.sd + fl, i * 7 + s) - 0.5) * T * 0.7; pts.push([px + dx * s / 6 + nx * o, py + dy * s / 6 + ny * o]); }
          pts.push([qx, qy]);
          for (const [col, wd] of [['rgba(180,57,42,' + (0.3 * a) + ')', 11], ['rgba(156,109,18,' + (0.8 * a) + ')', 6], ['rgba(255,214,120,' + a + ')', 2.5]]) { ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.beginPath(); pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
        });
      }
      ctx.restore();
    }
    drawScorch(f, px, py, pr, T, now) {   // 燭龍焚溟：從身邊往外燒出一道道熔痕，先是金紅的亮線、再冷成暗紅焦黑；v0.8.32：落在水上的那幾段一亮就淬黑，冒帶墨邊的白汽、盪開水紋，白天也看得出燒進了水裡
      const ctx = this.ctx, grow = Math.min(1, pr / 0.12), cool = Math.max(0, (pr - 0.12) / 0.88);
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const m of f.marks || []) {
        const pts = m.pts, segs = pts.length - 1, upto = grow * segs, wet = m.wet || [];
        const path = (w) => { let any = false; ctx.beginPath();   // 只畫地上（w 假）或水上（w 真）的那幾段；一段算哪邊看它的終點
          for (let i = 1; i <= segs; i++) { const t = Math.min(1, upto - (i - 1)); if (t <= 0) break; if (!!wet[i] !== w) continue; const [ax, ay] = pts[i - 1], [bx, by] = pts[i]; ctx.moveTo(px + ax * T, py + ay * T); ctx.lineTo(px + (ax + (bx - ax) * t) * T, py + (ay + (by - ay) * t) * T); any = true; }
          return any; };
        for (const w of [false, true]) {
          const c = w ? Math.min(1, cool * 3.5) : cool, hot = 1 - c;   // 水上的淬得快
          if (!path(w)) continue;
          ctx.strokeStyle = 'rgba(180,57,42,' + (0.6 * (1 - 0.7 * c)) + ')'; ctx.lineWidth = T * (0.12 + 0.12 * hot); ctx.stroke();
          if (c > 0.35) { path(w); ctx.strokeStyle = (w ? 'rgba(28,30,36,' : 'rgba(40,24,18,') + Math.min(1, Math.min(w ? 0.8 : 0.55, (c - 0.35) * 1.5) * (1 - pr) * 2) + ')'; ctx.lineWidth = T * (w ? 0.1 : 0.07); ctx.stroke(); }
          if (hot > 0.05) { ctx.globalCompositeOperation = 'lighter'; path(w); ctx.strokeStyle = 'rgba(255,186,84,' + (0.95 * hot) + ')'; ctx.lineWidth = T * 0.07; ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; }
        }
        wet.forEach((on, i) => {
          if (!on || i === 0 || i > upto) return;
          const sx = px + pts[i][0] * T, sy = py + pts[i][1] * T, t0 = 0.12 * i / segs, q = (pr - t0) / (1 - t0);
          for (let k = 0; k < 2; k++) { const rq = (q - k * 0.18) / 0.45; if (rq <= 0 || rq >= 1) continue;   // 兩圈水紋盪開
            ctx.strokeStyle = 'rgba(38,66,96,' + (0.55 * (1 - rq)) + ')'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(sx, sy, T * (0.15 + 0.75 * rq), T * (0.1 + 0.45 * rq), 0, 0, 7); ctx.stroke(); }
          for (let k = 0; k < 4; k++) {   // 白汽：白裡帶一圈墨邊，米色的紙上也看得見
            const rise = (pr * 1.4 + k / 4) % 1, al = 0.75 * (1 - rise) * (1 - pr * 0.6), x = sx + Math.sin(now * 3 + i * 2 + k) * T * 0.12 + (k - 1.5) * T * 0.08, y = sy - rise * T, r = T * (0.09 + 0.16 * rise);
            ctx.fillStyle = 'rgba(240,238,232,' + al + ')'; ctx.strokeStyle = 'rgba(62,70,82,' + (al * 0.7) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
          }
        });
      }
      ctx.restore();
    }
    drawFeather(f, px, py, pr, T, ox, oy) {   // 青冥落羽：射中的一刻一圈青光、箭過處留一道青痕，幾片「羽」字左右擺著飄落
      const ctx = this.ctx;
      ctx.save();
      if (f.fx0 !== undefined && pr < 0.3) { const a = 1 - pr / 0.3; ctx.strokeStyle = 'rgba(42,111,122,' + (0.65 * a) + ')'; ctx.lineWidth = 0.5 + 3 * a; ctx.beginPath(); ctx.moveTo(ox + f.fx0 * T + T / 2, oy + f.fy0 * T + T / 2); ctx.lineTo(px, py); ctx.stroke(); }
      for (const [k, w0] of [[0, 2.6], [0.12, 1.4]]) { const q = (pr - k) / 0.35; if (q <= 0 || q >= 1) continue; ctx.strokeStyle = 'rgba(42,111,122,' + (0.9 * (1 - q)) + ')'; ctx.lineWidth = w0; ctx.beginPath(); ctx.arc(px, py, T * (0.3 + 1.0 * q), 0, 7); ctx.stroke(); }   // 兩圈青光
      if (pr < 0.25) { const q = pr / 0.25; ctx.strokeStyle = 'rgba(42,111,122,' + (0.8 * (1 - q)) + ')'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath();   // 羽枝一下子散開
        for (let i = 0; i < 8; i++) { const a = this.fxRnd(f.sd, i + 40) * 0.6 + i * Math.PI / 4, r0 = T * (0.35 + 0.5 * q), r1 = r0 + T * 0.3; ctx.moveTo(px + Math.cos(a) * r0, py + Math.sin(a) * r0); ctx.lineTo(px + Math.cos(a) * r1, py + Math.sin(a) * r1); }
        ctx.stroke(); }
      ctx.restore();
      const n = f.n || 3;
      ctx.save(); ctx.shadowColor = 'rgba(248,244,234,0.95)'; ctx.shadowBlur = 5 * this.dpr;   // v0.8.32：羽由左往右散開不疊；字外一圈白暈，草地水上都看得清（不再墊一個大一號的白字，免得筆畫錯開成一團）
      for (let i = 0; i < n; i++) {
        const r = this.fxRnd(f.sd, i), r2 = this.fxRnd(f.sd, i + 17), delay = r * 0.15, q = Math.max(0, (pr - delay) / (1 - delay)), al = 1 - q * q;
        const side = n > 1 ? i / (n - 1) - 0.5 : 0, out = 1 - Math.pow(1 - Math.min(1, q * 2.2), 2);   // 由左到右散開，先快後慢
        const x = px + side * T * 3.2 * out + (r - 0.5) * T * 0.3 + Math.sin(q * 6 + r * 9) * T * 0.3, y = py - T * 0.3 + q * T * (1.2 + 1.2 * r2), size = T * (0.56 + 0.16 * r2), rot = Math.sin(q * 5 + r * 7) * 0.6;
        this.drawGlyph('羽', G.INK.qing, x, y, size, rot, al); this.drawGlyph('羽', G.INK.qing, x, y, size, rot, al);   // 畫兩次，白暈濃一點
      }
      ctx.restore();
    }
    drawGoldGlyph(ch, px, py, size, rot, now) {   // 金色的字（v0.8.21）：一圈呼吸的金光、一道亮光從左上掃到右下、四顆星繞著閃
      const ctx = this.ctx, s = this.dpr, n = Math.ceil(size * 1.3 * s), c = this._goldC || (this._goldC = document.createElement('canvas')); c.width = c.height = n;
      const g = c.getContext('2d'); g.clearRect(0, 0, n, n); g.drawImage(this.glyph(ch, '#8f6206'), 0, 0, n, n);
      g.globalCompositeOperation = 'source-atop';
      const t = (now * 0.55) % 1.6 - 0.3, lg = g.createLinearGradient(n * (t - 0.35), n * (t - 0.35), n * (t + 0.35), n * (t + 0.35));
      lg.addColorStop(0, 'rgba(255,236,160,0)'); lg.addColorStop(0.5, 'rgba(255,246,200,0.8)'); lg.addColorStop(1, 'rgba(255,236,160,0)');
      g.fillStyle = 'rgba(214,160,24,0.6)'; g.fillRect(0, 0, n, n); g.fillStyle = lg; g.fillRect(0, 0, n, n); g.globalCompositeOperation = 'source-over';
      ctx.save();
      const pulse = 0.5 + 0.5 * Math.sin(now * 2.4), halo = ctx.createRadialGradient(px, py, size * 0.1, px, py, size * (0.85 + 0.12 * pulse));
      halo.addColorStop(0, 'rgba(255,212,80,' + (0.2 + 0.14 * pulse) + ')'); halo.addColorStop(1, 'rgba(255,215,90,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(px, py, size * (0.85 + 0.12 * pulse), 0, 7); ctx.fill();
      for (let i = 0; i < 4; i++) {   // 四顆小星繞著轉、輪流閃
        const a = now * 0.9 + i * Math.PI / 2, r = size * 0.62, tw = Math.max(0, Math.sin(now * 3.1 + i * 1.7)), x = px + Math.cos(a) * r, y = py + Math.sin(a) * r * 0.8, k = size * 0.09 * (0.4 + tw);
        ctx.globalAlpha = 0.25 + 0.75 * tw; ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.moveTo(x, y - k * 2); ctx.lineTo(x + k * 0.5, y - k * 0.5); ctx.lineTo(x + k * 2, y); ctx.lineTo(x + k * 0.5, y + k * 0.5); ctx.lineTo(x, y + k * 2); ctx.lineTo(x - k * 0.5, y + k * 0.5); ctx.lineTo(x - k * 2, y); ctx.lineTo(x - k * 0.5, y - k * 0.5); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      const cs = rot ? Math.cos(rot) : 1, sn = rot ? Math.sin(rot) : 0;
      ctx.save(); ctx.shadowColor = 'rgba(110,70,0,0.55)'; ctx.shadowBlur = 3 * s; ctx.setTransform(s * cs, s * sn, -s * sn, s * cs, px * s, py * s); ctx.drawImage(c, -size * 0.65, -size * 0.65, size * 1.3, size * 1.3); ctx.restore(); ctx.setTransform(s, 0, 0, s, 0, 0);
    }
    brushRect(x, y, s, color, lw) {
      const ctx = this.ctx; ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw || 2; ctx.lineCap = 'round';
      const j = () => (Math.random() - 0.5) * 1.5;
      ctx.beginPath(); ctx.moveTo(x + j(), y + j()); ctx.lineTo(x + s + j(), y + j()); ctx.lineTo(x + s + j(), y + s + j()); ctx.lineTo(x + j(), y + s + j()); ctx.closePath(); ctx.stroke(); ctx.restore();
    }

    draw(g, dt, now) {
      const ctx = this.ctx, T = this.tile, w = this.w, h = this.h, world = g.world, p = g.player;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      // —— 相機：跟著玩家，略帶遲滯
      const cx = p.rx + 0.5, cy = p.ry + 0.5;
      if (!this.camInit) { this.camX = cx; this.camY = cy; this.camInit = true; }
      const k = Math.min(1, dt * 7);
      this.camX += (cx - this.camX) * k; this.camY += (cy - this.camY) * k;
      let ox = w / 2 - this.camX * T, oy = h / 2 - this.camY * T;
      if (this.shake > 0 && dt > 0) { this.shake -= dt; ox += (Math.random() - 0.5) * 10 * this.shake; oy += (Math.random() - 0.5) * 10 * this.shake; }

      // —— 宣紙隨世界滾動
      if (!this.pattern) this.pattern = ctx.createPattern(this.paper, 'repeat');
      ctx.save(); ctx.translate(ox, oy); ctx.fillStyle = this.pattern; ctx.fillRect(-ox - 2, -oy - 2, w + 4, h + 4); ctx.restore();

      const x0 = Math.floor(-ox / T) - 1, x1 = Math.floor((w - ox) / T) + 1;
      const y0 = Math.floor(-oy / T) - 1, y1 = Math.floor((h - oy) / T) + 1;
      const lights = [];
      const act = g.action;

      // —— 地上的字
      const gong = g.ents.list.find(o => o.type === '共工'), lean = gong && gong.mode === 'land' && !(gong.shiftT > 0) ? g.ents.gongCells(gong) : null;   // 共工的陸（v0.9）：九格內地上的字斜向他
      let sub = null;   // 共工的地（v0.9）：游過、鑽出來的淖（凝成泥）、隕石砸過的焦，蓋掉原字
      if ((g.mud && g.mud.size) || (g.burns && g.burns.length)) { sub = new Map(); for (const m of (g.mud || new Map()).values()) sub.set(U.key(m.x, m.y), g.mudAt(m.x, m.y)); for (const b of g.burns || []) sub.set(U.key(b.x, b.y), '焦'); }
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const ch = world.get(x, y);
        const burning = world.isBurning(x, y);
        const d = DB[ch];
        const lit = ch === '灶' && world.stoveLit(x, y);
        const lr = ch === '燈' && world.isBig(x, y) ? 10 : d.light;   // 島外那盞燈塔照得最遠（v0.6.10 起燈都多照一格：燈 6、燈塔 10）
        let lavaSkip = false;   // 熔岩連成一片：每二乘二只點一盞（那一塊裡第一格熔岩，半徑 4），光差不多、算得少到四分之一；落單的熔岩照樣亮（v0.7）
        if (d.lava) { const bx = x & ~1, by = y & ~1; for (const [cx, cy] of [[bx, by], [bx + 1, by], [bx, by + 1], [bx + 1, by + 1]]) if (DB[world.get(cx, cy)].lava) { lavaSkip = cx !== x || cy !== y; break; } }
        if (!lavaSkip && (lr > 0 || burning || lit)) lights.push({ x, y, r: Math.max(d.lava ? 4 : lr, burning ? 2.5 : 0, lit ? 3 : 0), c: burning || d.kind === 'fire' || d.lava ? FIRE : lit ? STOVE : lr >= 9 ? BEACON : LAMP });
        const gs = sub && sub.get(U.key(x, y));
        if (gs) {   // 淖：褐、微微晃；泥：淡褐；焦：焦黑帶一點火光
          ctx.fillStyle = gs === '淖' ? 'rgba(110,84,52,0.32)' : gs === '泥' ? 'rgba(140,112,78,0.18)' : 'rgba(58,36,24,' + (0.3 + 0.06 * Math.sin(now * 9 + x * 3 + y)) + ')'; ctx.fillRect(ox + x * T, oy + y * T, T, T);
          this.drawGlyph(gs, gs === '焦' ? '#3a2418' : gs === '淖' ? '#5a4632' : '#7a6448', ox + x * T + T / 2, oy + y * T + T / 2 + (gs === '淖' ? Math.sin(now * 2 + x + y) * 1.5 : 0), T * 0.92, gs === '淖' ? Math.sin(now * 1.3 + x) * 0.05 : 0, 0.92);
          if (gs === '焦') this.drawGlyph('火', '#d0451b', ox + x * T + T * 0.76, oy + y * T + T * 0.28, T * 0.36 * (1 + 0.15 * Math.sin(now * 13 + x)), 0, 0.7);
          continue;
        }
        if (ch === '白' || world.isBig(x, y) || (ch === '舟' && world.shipCells.has(U.key(x, y)))) continue;      // 大字地標、停著的船整體另畫
        const r = U.hash2(x, y, 99);
        let rot = ((r & 255) / 255 - 0.5) * 0.16, scale = (0.84 + ((r >>> 8) & 255) / 255 * 0.16) * d.vis[0];
        let dx = ((r >>> 16) & 255) / 255 * 4 - 2, dy = ((r >>> 24) & 255) / 255 * 4 - 2, alpha = d.vis[1];
        if (lean) {   // 地在傾：越近斜得越厲害、也往他那邊挪一點
          let bx = 0, by = 0, bd = 99; for (const [cx2, cy2] of lean) { const dd = Math.max(Math.abs(cx2 - x), Math.abs(cy2 - y)); if (dd < bd) { bd = dd; bx = cx2 - x; by = cy2 - y; } }
          if (bd > 0 && bd <= 9) { const k = 1 - (bd - 1) / 9, n = Math.hypot(bx, by); rot += 0.34 * k * bx / n; dx += T * 0.1 * k * bx / n; dy += T * 0.1 * k * by / n; }
        }
        if (d.kind === 'water') dy += Math.sin(now * 1.6 + x * 0.9 + y * 1.3) * 1.8;
        if (d.kind === 'fire' || burning) { scale *= 1 + 0.1 * Math.sin(now * 15 + r); rot += Math.sin(now * 9 + (r & 31)) * 0.06; }
        if (ch === '明' || ch === '日') scale *= 1 + 0.04 * Math.sin(now * 3 + r);
        if (burning) alpha = 1;
        if (ch === '田') alpha = Math.min(1, alpha * (0.55 + 0.13 * world.fertOf(x, y)));   // 地力越厚墨越深（v0.9.18）
        if (act && act.type === 'gather' && act.x === x && act.y === y) { const pr = act.t / act.dur; alpha *= 1 - pr * 0.85; scale *= 1 - pr * 0.35; rot += pr * 0.5; }
        const color = burning && d.kind !== 'fire' ? G.INK.red : (ch === '灶' && !lit ? G.INK.ash : (ch === '窗' || ch === '門') && world.wallHurt(x, y) ? G.INK.red : d.ink);   // 窗門撞剩一半：字變紅
        const ck = d.crop && d.crop <= 2 ? world.cropKind(x, y) : null, strokes = ck && G.STROKES[ck];
        if (strokes && L(ck) === ck) {   // 作物字一筆一筆長（v0.9.21）：苗、秀寫那種穀的字，照長了幾成寫到第幾筆；角上小字寫苗或秀（簡體的麥字形不同，照舊畫）
          const N = strokes.length, nS = Math.max(1, Math.min(N - 1, Math.ceil(world.cropFrac(x, y) * (N - 1))));
          ctx.save(); const s0 = this.dpr; ctx.setTransform(s0 * Math.cos(rot) * 1, s0 * Math.sin(rot), -s0 * Math.sin(rot), s0 * Math.cos(rot), (ox + x * T + T / 2 + dx) * s0, (oy + y * T + T / 2 + dy) * s0); ctx.globalAlpha = alpha;
          const sz = T * scale; ctx.drawImage(this.partGlyph(ck, color, nS), -sz * 0.65, -sz * 0.65, sz * 1.3, sz * 1.3); ctx.restore(); ctx.setTransform(s0, 0, 0, s0, 0, 0);
          this.drawGlyph(L(ch), color, ox + x * T + T * 0.82, oy + y * T + T * 0.8, T * 0.3, 0, 0.75 * alpha);
        }
        else if (ch.length > 1) {   // 雙字之物（木屋）：兩個字並排寫小一點
          this.drawGlyph(ch[0], color, ox + x * T + T * 0.3, oy + y * T + T / 2 + dy, T * scale * 0.62, rot, alpha);
          this.drawGlyph(ch[1], color, ox + x * T + T * 0.7, oy + y * T + T / 2 + dy, T * scale * 0.62, rot, alpha);
        } else this.drawGlyph(ch, color, ox + x * T + T / 2 + dx, oy + y * T + T / 2 + dy, T * scale, rot, alpha);
        if (d.crop && d.crop !== 3 && !(strokes && L(ck) === ck)) { const ck = world.cropKind(x, y); if (ck) this.drawGlyph(L(ck), '#6a5a24', ox + x * T + T * 0.8, oy + y * T + T * 0.8, T * 0.34, 0, 0.8 * alpha); }   // 苗、秀、遺穗角上寫是什麼穀（v0.9.18）
        if ((burning && d.kind !== 'fire') || lit) this.drawGlyph('火', G.INK.red, ox + x * T + T * 0.74, oy + y * T + T * 0.3, T * 0.45 * (1 + 0.15 * Math.sin(now * 13 + r)), rot, 0.95);
        if (world.eaves.size && world.eaves.has(U.key(x, y))) {   // 瓦簷（v0.9.21）：磚上一道青灰的瓦脊，兩頭翹
          const ex = ox + x * T, ey = oy + y * T; ctx.save(); ctx.fillStyle = 'rgba(70,82,92,0.88)'; ctx.beginPath(); ctx.moveTo(ex - T * 0.06, ey + T * 0.02); ctx.quadraticCurveTo(ex + T / 2, ey + T * 0.2, ex + T * 1.06, ey + T * 0.02); ctx.lineTo(ex + T * 0.94, ey + T * 0.17); ctx.quadraticCurveTo(ex + T / 2, ey + T * 0.3, ex + T * 0.06, ey + T * 0.17); ctx.closePath(); ctx.fill(); ctx.restore();
        }
        if (ch === '窯') { const kr = world.kilns.get(U.key(x, y)); if (kr && !kr.done && world.kilnFire(x, y)) { lights.push({ x, y, r: 2.5, c: STOVE }); this.drawGlyph('火', G.INK.red, ox + x * T + T * 0.74, oy + y * T + T * 0.3, T * 0.4 * (1 + 0.15 * Math.sin(now * 11 + r)), rot, 0.9); } else if (kr && kr.done) this.drawGlyph('成', '#6a5a24', ox + x * T + T * 0.78, oy + y * T + T * 0.26, T * 0.32, 0, 0.85); }   // 窯燒著冒火、燒好了寫「成」（v0.9.21）
        if (ch === '缸' && world.jarWater(x, y) >= 1) this.drawGlyph('水', G.INK.water, ox + x * T + T * 0.78, oy + y * T + T * 0.76, T * 0.3, 0, 0.8);   // 缸裡有水
      }

      // —— 大字地標：一個字佔好幾格
      for (const pl of world.places) {
        if (pl.template || pl.x + pl.w < x0 || pl.x > x1 || pl.y + pl.h < y0 || pl.y > y1) continue;
        const r = U.hash2(pl.x, pl.y, 7), rot = ((r & 255) / 255 - 0.5) * 0.08;
        const cx2 = ox + (pl.x + pl.w / 2) * T, cy2 = oy + (pl.y + pl.h / 2) * T, size = T * Math.max(pl.w, pl.h) * 0.92;
        if (pl.ch === '燈') { ctx.save(); ctx.fillStyle = 'rgba(224,160,32,' + (0.10 + 0.08 * Math.sin(now * 2)) + ')'; ctx.beginPath(); ctx.arc(cx2, cy2, size * 0.9, 0, 7); ctx.fill(); ctx.restore(); }
        this.drawGlyph(pl.ch, DB[pl.ch].ink, cx2, cy2, size, rot, pl.ch === '寺' ? 0.85 : 1);
      }
      // —— 停著的船：一個「舟」字佔整個船身，船頭有首骨就寫個小「骨」
      for (const rec of world.ships.values()) {
        const c = world.shipCenter(rec);
        if (c.x + 2 < x0 || c.x - 2 > x1 || c.y + 2 < y0 || c.y - 2 > y1) continue;
        this.drawShip(ox + c.x * T, oy + c.y * T, rec, now, g.shipSkulls(rec).length > 0);
      }
      // —— 海上的傳送點（v0.8.27 第三版）：水面上一個「津」，點亮的墨色、沒點亮的淡
      if (G.GEN >= 3) for (const gt of G.gateNet(world.seed).list) {
        if (gt.type !== 'sea' || gt.x < x0 || gt.x > x1 || gt.y < y0 || gt.y > y1) continue;
        const lit = !!(g.player.gates || {})['n:' + gt.id], gx = ox + gt.x * T + T / 2, gy = oy + gt.y * T + T / 2;
        ctx.save(); ctx.strokeStyle = lit ? 'rgba(30,70,110,0.7)' : 'rgba(30,70,110,0.3)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(gx, gy, T * (0.55 + 0.05 * Math.sin(now * 2)), 0, 7); ctx.stroke(); ctx.restore();
        this.drawGlyph('津', '#1e466e', gx, gy, T * 0.8, 0, lit ? 0.95 : 0.45);
      }
      // —— 畢方的訛火（v0.8.25）：燒著的格子一團跳動的「火」、帶著光；要燒起來的地方先畫一個紅圈
      for (const f of g.fires || []) {
        if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) continue;
        const fx = ox + f.x * T + T / 2, fy = oy + f.y * T + T / 2, fl = Math.min(1, f.t / 1.5);
        ctx.save(); ctx.fillStyle = 'rgba(214,92,40,' + (0.16 * fl) + ')'; ctx.fillRect(ox + f.x * T, oy + f.y * T, T, T); ctx.restore();
        this.drawGlyph('火', '#d0451b', fx + Math.sin(now * 11 + f.x) * 1.5, fy - T * 0.05, T * (0.72 + 0.1 * Math.sin(now * 13 + f.y)), Math.sin(now * 7 + f.x) * 0.08, 0.9 * fl);
        lights.push({ x: f.x, y: f.y, r: 2, c: FIRE });
      }
      for (const m of g.fireMarks || []) {
        if (m.x < x0 || m.x > x1 || m.y < y0 || m.y > y1) continue;
        ctx.save(); ctx.strokeStyle = 'rgba(208,69,27,0.85)'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.lineDashOffset = -now * 14; ctx.beginPath(); ctx.arc(ox + m.x * T + T / 2, oy + m.y * T + T / 2, T * (0.25 + 0.2 * (1 - m.t)), 0, 7); ctx.stroke(); ctx.restore();
      }
      // —— 實體
      for (const e of g.ents.list) {
        if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
        const px = ox + e.rx * T + T / 2, py = oy + e.ry * T + T / 2, d = DB[e.type];
        if (e.type === '魄') {
          // 魄：半透明、搖曳、腳下沒影子；煙滅時散開
          const wob = Math.sin(now * 6 + e.bob) * 0.12, fade = e.fade !== undefined ? e.fade : 1;
          ctx.save(); ctx.fillStyle = 'rgba(59,53,80,' + (0.16 * fade) + ')'; ctx.beginPath(); ctx.arc(px, py, T * (0.62 + (1 - fade) * 0.8), 0, 7); ctx.fill(); ctx.restore();
          this.drawGlyph('魄', d.ink, px, py + Math.sin(now * 3 + e.bob) * 3 - (1 - fade) * T * 0.6, T * (1.0 + (1 - fade) * 0.5), wob, (e.frozen ? 0.5 : 0.78) * fade);
          continue;
        }
        if (e.type === '青龍') {     // 東海青龍（v0.8）：比蜃還大的青字，身下一圈青水旋著，自己帶著光
          ctx.save(); ctx.strokeStyle = 'rgba(36,118,107,0.4)'; ctx.lineWidth = 2.5;
          for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(px, py, T * (0.9 + i * 0.3), -now * (0.6 + i * 0.2) + i, -now * (0.6 + i * 0.2) + i + 3.6); ctx.stroke(); }
          ctx.restore();
          lights.push({ x: e.x, y: e.y, cx: e.rx + 0.5, cy: e.ry + 0.5, r: 4, c: AZURE });
          this.drawGlyph('龍', d.ink, px, py + Math.sin(now * 0.9 + e.bob) * 4, T * 1.9, Math.sin(now * 0.5 + e.bob) * 0.05, 1);
          continue;
        }
        if (e.type === '齒') {       // 鑿齒（v0.8.5）：大字「齒」，面朝的那邊一面「盾」；盾跟著轉身
          const kk = Math.min(1, dt * 8); e.rfx = e.rfx === undefined ? (e.fx || 1) : e.rfx + ((e.fx || 0) - e.rfx) * kk; e.rfy = e.rfy === undefined ? (e.fy || 0) : e.rfy + ((e.fy || 0) - e.rfy) * kk;
          const fl = Math.hypot(e.rfx, e.rfy) || 1, sx = e.rfx / fl, sy = e.rfy / fl, bob = Math.sin(now * 2 + e.bob) * 1.5;
          this.drawGlyph('齒', d.ink, px - sx * T * 0.1, py + bob, T * 1.3, 0, 1);
          this.drawGlyph('盾', '#8a6a3c', px + sx * T * 0.62, py + sy * T * 0.62 + bob, T * 0.72, Math.atan2(sy, sx) * 0.15, 0.95);
          continue;
        }
        if (e.type === '豨') {       // 封豨（v0.8.7）：二乘二的「豨」，頭上一圈「鬃」（三、五、六個，剩三成全紅）；蓄力時地上畫出要衝的路；拱地時一圈震往外傳
          const cx = ox + (e.rx + 1) * T, cy = oy + (e.ry + 1) * T, frac = e.hp / (e.max || d.hp), mane = frac > 0.5 ? 3 : frac > 0.3 ? 5 : 6, red = frac <= 0.3, shade = !!e.shade;   // 玄武吐的豨影（v0.8.8）：墨灰、半透，鬃不變紅
          if (shade) { ctx.save(); ctx.globalAlpha = 0.72; }
          if (e.state === 'wind') { ctx.save(); ctx.fillStyle = 'rgba(180,57,42,0.15)'; for (let k = 1; k <= 10; k++) for (const [ax, ay] of g.ents.hogRect(e, e.x + e.cdx * k, e.y + e.cdy * k)) ctx.fillRect(ox + ax * T, oy + ay * T, T, T); ctx.restore(); }
          if (e.ring) { ctx.save(); ctx.strokeStyle = 'rgba(90,62,43,0.55)'; ctx.lineWidth = T * 0.25; ctx.beginPath(); ctx.arc(ox + e.ring.cx * T, oy + e.ring.cy * T, Math.max(0.1, e.ring.r * T), 0, 7); ctx.stroke(); ctx.restore(); }
          const sh = (e.state === 'wind' || e.state === 'root') ? Math.sin(now * 40) * 2 : 0;
          for (let k = 0; k < mane; k++) { const a = Math.PI * (1.05 + 0.9 * k / Math.max(1, mane - 1)); this.drawGlyph('鬃', shade ? '#55535c' : red ? G.INK.red : '#3d2a1c', cx + Math.cos(a) * T * 1.3, cy + Math.sin(a) * T * 1.2, T * 0.62, a + Math.PI / 2, 0.95); }
          this.drawGlyph('豨', shade ? '#2b2a30' : red ? '#8f2c20' : d.ink, cx + sh, cy, T * 2.1, 0, 1);
          if (e.state === 'eat') this.drawGlyph('食', G.INK.plant, cx + T * 1.1, cy - T * 1.1, T * 0.55, 0, 0.9);
          if (shade) { this.drawGlyph('影', '#55535c', cx + T * 1.15, cy + T * 0.95, T * 0.5, 0, 0.9); ctx.restore(); }
          continue;
        }
        if (e.type === '修蛇') {     // 修蛇（v0.8.16）：大字「蛇」當頭，後面一串「尾」越後越小；潛下去只剩水紋，要浮上來的地方先冒「泡」；吞象畫出紅線、毒涎畫出落點；纏舟時尾巴圍著船
          const shade = !!e.shade, ink = shade ? '#2b2a30' : d.ink, tailInk = shade ? '#55535c' : '#3a4a36', SN = g.ents.constructor.SNAKE;
          if (shade) { ctx.save(); ctx.globalAlpha = 0.72; }
          if (e.state === 'gape') { ctx.save(); ctx.fillStyle = 'rgba(180,57,42,' + (0.14 + 0.08 * Math.sin(now * 12)) + ')'; for (const [cx2, cy2] of g.ents.gapeCells(e)) ctx.fillRect(ox + cx2 * T, oy + cy2 * T, T, T); ctx.restore(); }
          if (e.spit) { ctx.save(); ctx.fillStyle = 'rgba(77,110,58,0.2)'; ctx.fillRect(ox + (e.spit.x - 1) * T, oy + (e.spit.y - 1) * T, T * 3, T * 3); ctx.restore(); this.drawGlyph('涎', G.INK.plant, ox + e.spit.x * T + T / 2, oy + e.spit.y * T + T / 2, T * 0.7, 0, 0.85); }
          if (e.under) {
            ctx.save(); ctx.strokeStyle = 'rgba(47,88,120,0.35)'; ctx.lineWidth = 1.5;
            for (let i = 0; i < 2; i++) { const k = (now * 0.7 + i * 0.5) % 1; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(px, py, T * (0.4 + k * 0.9), T * (0.16 + k * 0.36), 0, 0, 7); ctx.stroke(); }
            ctx.restore();
            if (e.bubble) { const bx = ox + e.bubble.x * T + T / 2, by = oy + e.bubble.y * T + T / 2; for (let i = 0; i < 3; i++) this.drawGlyph('泡', G.INK.water, bx + Math.sin(now * 5 + i * 2) * T * 0.25, by - ((now * 1.5 + i / 3) % 1) * T * 0.5, T * (0.42 + 0.12 * i), 0, 0.9); }
          } else {
            const tail = e.tail || [], coil = e.state === 'coil' && p.sailing, box = coil && g.shipBox();   // 纏舟：尾巴繞著整艘船（v0.8.17）
            for (let i = tail.length - 1; i >= 0; i--) {
              let tx2, ty2;
              if (coil) { const a = now * 1.5 + i / tail.length * Math.PI * 2, cx = box ? box.x : p.rx + 0.5, cy = box ? box.y : p.ry + 0.5, rx = box ? box.W / 2 + 0.9 : 1.4, ry = box ? box.H / 2 + 0.7 : 1.2; tx2 = ox + cx * T + Math.cos(a) * T * rx; ty2 = oy + cy * T + Math.sin(a) * T * ry; }
              else { tx2 = ox + tail[i][0] * T + T / 2; ty2 = oy + tail[i][1] * T + T / 2 + Math.sin(now * 2 + i) * 1.5; }
              this.drawGlyph('尾', tailInk, tx2, ty2, T * Math.max(0.5, 1.0 - i * 0.08), Math.sin(now * 1.5 + i) * 0.15, 0.95);
            }
            const red = !shade && e.hp / (e.max || d.hp) <= SN.spitAt, rise = e.state === 'gape' ? -T * 0.25 : 0;
            if (coil) { ctx.save(); ctx.strokeStyle = 'rgba(180,57,42,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -now * 12; ctx.beginPath(); ctx.arc(px, py, T * 0.95, 0, 7); ctx.stroke(); ctx.restore(); }
            this.drawGlyph('蛇', red ? '#5b2a20' : ink, px, py + rise + Math.sin(now * 1.6 + e.bob) * 2, T * 1.6, Math.sin(now * 0.9 + e.bob) * 0.06, 1);
          }
          if (shade) { this.drawGlyph('影', '#55535c', px + T * 0.85, py + T * 0.75, T * 0.5, 0, 0.9); ctx.restore(); }
          continue;
        }
        if (e.type === '畢') {       // 畢方（v0.8.25）：青底朱紋的「畢」，一隻腳跳著走——跳的時候往上一彈，身上幾點朱紅
          const hop = Math.abs(Math.sin(now * 4.2 + e.bob)) * T * 0.16, bx = px, by = py - hop;
          ctx.save(); ctx.fillStyle = 'rgba(28,26,23,0.14)'; ctx.beginPath(); ctx.ellipse(px, py + T * 0.36, T * 0.32, T * 0.1, 0, 0, 7); ctx.fill(); ctx.restore();
          this.drawGlyph('畢', d.ink, bx, by, T * 1.15, Math.sin(now * 4.2 + e.bob) * 0.05, 1);
          ctx.save(); ctx.fillStyle = '#c23b22'; for (const [ax, ay] of [[-0.22, -0.18], [0.2, -0.05], [-0.05, 0.2]]) { ctx.beginPath(); ctx.arc(bx + ax * T, by + ay * T, Math.max(1.5, T * 0.05), 0, 7); ctx.fill(); } ctx.restore();   // 赤文
          continue;
        }
        if (e.type === '共工') {     // 共工（v0.9，設計稿〈七〉）：本相三乘三（「共」、頂上朱髮「彡」、一圈「己」）；海潛在地裡只見朱髮劃過、鑽出來寫「共」；陸立成三格高的「工」；空倒懸一個「天」、地上一團影子
          const shade = !!e.shade, hair = shade ? '#55535c' : '#c23b22', GG = g.ents.constructor.GONG, ink = shade ? '#2b2a30' : e.hp / (e.max || d.hp) <= 0.3 ? GONG_LOW : d.ink;   // 命剩三成起整個人變黑紫（v0.9.1 使用者定：他本來就是朱紅，變紅看不出來）；立極的共工影（v0.9.10）墨灰、半透
          if (e.dig) { const qx = ox + e.dig.x * T + T / 2, qy = oy + e.dig.y * T + T / 2; ctx.save(); ctx.fillStyle = 'rgba(110,84,52,' + (0.18 + 0.1 * Math.sin(now * 14)) + ')'; ctx.fillRect(qx - T * 1.5, qy - T * 1.5, T * 3, T * 3); ctx.restore(); for (let i = 0; i < 3; i++) { const k = (now * 1.4 + i / 3) % 1; this.drawGlyph('氵', G.INK.water, qx, qy, T * (0.5 + k * 0.9), 0, 0.9 * (1 - k)); } }   // 入地如入水：腳下翻起來
          if (e.meteor) for (const [mx, my] of e.meteor.cells) { const qx = ox + mx * T + T / 2, qy = oy + my * T + T / 2, k = 1 - e.meteor.t / GG.meteorT; this.drawGlyph('◎', G.INK.red, qx, qy, T * (0.9 + 0.08 * Math.sin(now * 12)), 0, 0.85); if (k > 0.4) this.drawGlyph('隕', '#5a3e2b', qx, qy - (1 - k) * T * 3, T * (0.6 + 0.4 * k), 0, k); }   // 隕石：先標「◎」，「隕」從天上落下來
          if (e.press) { const qx = ox + e.press.x * T + T / 2, qy = oy + e.press.y * T + T / 2, R = (GG.pressR + 0.5) * T, k = 1 - e.press.t / GG.pressT; ctx.save(); ctx.fillStyle = 'rgba(59,58,64,' + (0.08 + 0.12 * k) + ')'; ctx.beginPath(); ctx.arc(qx, qy, R, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(59,58,64,0.6)'; ctx.setLineDash([6, 4]); ctx.lineDashOffset = now * 10; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + now * 0.4; this.drawGlyph('壓', '#3b3a40', qx + Math.cos(a) * R * 0.78, qy + Math.sin(a) * R * 0.78, T * 0.55, 0, 0.35 + 0.45 * k); } }   // 力壓千鈞：一圈「壓」
          if (shade) { ctx.save(); ctx.globalAlpha = 0.72; }
          if (e.shiftT > 0) {   // 本相
            const sh = Math.sin(now * 30) * 1.5;
            for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + now * 0.5; this.drawGlyph('己', '#3d2a1c', px + Math.cos(a) * T * 1.25, py + Math.sin(a) * T * 1.15, T * 0.7, a + Math.PI / 2, 0.9); }
            this.drawGlyph('彡', hair, px, py - T * 1.05, T * 1.0, 0, 0.95);
            this.drawGlyph('共', ink, px + sh, py + T * 0.1, T * 1.9, 0, 1);
            if (e.shiftT <= GG.hintAt) {   // 後四息：地上浮「氵」紋、揚「土」塵、捲「風」字
              const h = { sea: '氵', land: '土', sky: '風' }[e.next || e.mode];
              for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + now * (h === '風' ? 2.2 : 0.3), rr = T * (1.9 + 0.3 * Math.sin(now * 3 + i)); this.drawGlyph(h, h === '氵' ? G.INK.water : h === '土' ? '#8a6a3c' : '#5b6b7a', px + Math.cos(a) * rr, py + Math.sin(a) * rr * 0.7 - (h === '土' ? ((now + i / 5) % 1) * T * 0.4 : 0), T * 0.7, h === '風' ? now * 4 : 0, 0.75); }
            }
          } else if (e.mode === 'sea') {
            if (e.under) {
              ctx.save(); ctx.strokeStyle = 'rgba(110,84,52,0.45)'; ctx.lineWidth = 1.5; for (let i = 0; i < 2; i++) { const k = (now * 0.8 + i * 0.5) % 1; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(px, py, T * (0.4 + k * 0.8), T * (0.16 + k * 0.32), 0, 0, 7); ctx.stroke(); } ctx.restore();
              for (let i = 0; i < 3; i++) this.drawGlyph('彡', hair, px + (i - 1) * T * 0.22, py - T * 0.1 + Math.sin(now * 6 + i) * 2, T * 0.75, (i - 1) * 0.25, 0.9);
            } else { this.drawGlyph('彡', hair, px, py - T * 0.85, T * 0.8, 0, 0.95); this.drawGlyph('共', ink, px, py, T * 1.5, Math.sin(now * 2) * 0.05, 1); }
          } else if (e.mode === 'land') {   // 三格高的「工」：他扛著的斷天柱
            this.drawGlyph('彡', hair, px, py - T * 1.75, T * 0.8, 0, 0.95);
            this.drawGlyph('工', ink, px, py, T * 1.25, 0, 1, 1.1, 2.3);
            if (g.world.time < (e.noPullAt || 0)) this.drawGlyph('雷', '#c9a227', px + T * 0.85, py - T * 1.3, T * 0.5, 0, 0.85);   // 九閽鳴雷壓著：拖不動你
          } else {   // 空：倒懸的「天」、地上的影子
            ctx.save(); ctx.fillStyle = 'rgba(28,26,23,0.16)'; ctx.beginPath(); ctx.ellipse(px, py + T * 0.3, T * 0.9, T * 0.26, 0, 0, 7); ctx.fill(); ctx.restore();
            const lift = T * 1.0 + Math.sin(now * 1.2 + e.bob) * 3;
            this.drawGlyph('彡', hair, px, py - lift + T * 0.95, T * 0.8, Math.PI, 0.9);
            this.drawGlyph('天', ink, px, py - lift, T * 1.9, Math.PI, 0.85);
          }
          if (shade) { this.drawGlyph('影', '#55535c', px + T * 0.95, py + T * 0.75, T * 0.5, 0, 0.9); ctx.restore(); }
          continue;
        }
        if (e.type === '大風') {     // 大風（v0.8.25）：在天上時地上一團影子，上方半透明的大字「風」；撲下來寫成「鳳」，左右各兩三個「羽」當翅膀
          const shade = !!e.shade, low = e.state === 'perch' || e.state === 'tied' ? 0 : e.state === 'dive' ? 0.35 : 1, kk = Math.min(1, dt * 5);
          e.alt = e.alt === undefined ? low : e.alt + (low - e.alt) * kk;
          if (shade) { ctx.save(); ctx.globalAlpha = 0.72; }
          if (e.whirl) { const wx = ox + e.whirl.x * T, wy = oy + e.whirl.y * T; ctx.save(); ctx.fillStyle = 'rgba(91,107,122,' + (0.12 + 0.08 * Math.sin(now * 10)) + ')'; ctx.fillRect(wx - T, wy - T, T * 3, T * 3); ctx.restore(); this.drawGlyph('旋', '#5b6b7a', wx + T / 2, wy + T / 2, T * 0.9, now * 6, 0.85); }
          if (e.gale) { ctx.save(); ctx.fillStyle = 'rgba(91,107,122,' + (0.12 + 0.06 * Math.sin(now * 12)) + ')'; for (const [gx, gy] of g.ents.galeCells(e.gale)) ctx.fillRect(ox + gx * T, oy + gy * T, T, T); ctx.restore(); }
          if (e.sand) for (const [sx, sy] of e.sand.cells) { ctx.save(); ctx.strokeStyle = 'rgba(107,90,72,0.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ox + sx * T + T / 2, oy + sy * T + T / 2, T * (0.2 + 0.25 * (1 - e.sand.t)), 0, 7); ctx.stroke(); ctx.restore(); }
          const lift = e.alt * T * 0.9, ink = shade ? '#2b2a30' : d.ink, wing = shade ? '#55535c' : '#7d8a96', red = !shade && e.hp / (e.max || d.hp) <= 0.3;
          ctx.save(); ctx.fillStyle = 'rgba(28,26,23,' + (0.1 + 0.12 * (1 - e.alt)) + ')'; ctx.beginPath(); ctx.ellipse(px, py + T * 0.3, T * (1.1 - e.alt * 0.35), T * 0.3, 0, 0, 7); ctx.fill(); ctx.restore();   // 地上的影子
          if (e.alt > 0.6) this.drawGlyph('風', ink, px, py - lift + Math.sin(now * 1.4 + e.bob) * 3, T * 2.0, Math.sin(now * 0.9 + e.bob) * 0.08, 0.42 + 0.3 * (1 - e.alt));   // 天上：半透明的風
          else {
            const n = e.hp / (e.max || d.hp) > 0.5 ? 2 : 3, flap = Math.sin(now * 9 + e.bob) * 0.2;
            for (let k = 0; k < n; k++) for (const sgn of [-1, 1]) this.drawGlyph('羽', wing, px + sgn * T * (1.0 + k * 0.62), py - lift - T * (0.18 + k * 0.14) + Math.sin(now * 9 + k) * 2, T * (0.8 - k * 0.1), sgn * (0.35 + flap + k * 0.12), 0.95);
            this.drawGlyph('鳳', red ? '#8f2c20' : ink, px, py - lift, T * 1.7, 0, 1);
          }
          if (e.state === 'tied') this.drawGlyph('繳', G.INK.red, px + T * 0.9, py - T * 0.7, T * 0.5, 0, 0.9);
          if (shade) { this.drawGlyph('影', '#55535c', px + T * 0.95, py + T * 0.75, T * 0.5, 0, 0.9); ctx.restore(); }
          continue;
        }
        if (e.type === '雕') {       // 蠱雕（v0.8.6）：灰黑的「雕」字頭上一點角；在高處盤旋時畫得高、地上一團影子，撲下來時落到地面
          const k = Math.min(1, dt * 6), want = e.mode === 'circle' ? 1 : e.mode === 'rise' ? 0.6 : 0; e.alt = e.alt === undefined ? want : e.alt + (want - e.alt) * k;
          const lift = e.alt * T * 0.55, flap = Math.sin(now * 7 + e.bob) * 0.08;
          ctx.save(); ctx.fillStyle = 'rgba(28,26,23,' + (0.12 + 0.1 * (1 - e.alt)) + ')'; ctx.beginPath(); ctx.ellipse(px, py + T * 0.3, T * (0.5 - e.alt * 0.15), T * 0.16, 0, 0, 7); ctx.fill(); ctx.restore();
          this.drawGlyph('雕', d.ink, px, py - lift, T * 1.2, flap, 1);
          if (e.mode === 'tied') this.drawGlyph('繳', G.INK.red, px + T * 0.7, py - T * 0.6, T * 0.45, 0, 0.9);   // 被青冥落羽的絲纏住（v0.8.25）
          ctx.save(); ctx.strokeStyle = '#2b2d33'; ctx.lineWidth = Math.max(2, T * 0.07); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px + T * 0.05, py - lift - T * 0.62); ctx.lineTo(px + T * 0.16, py - lift - T * 0.86); ctx.stroke(); ctx.restore();   // 頭上一隻角
          continue;
        }
        if (e.type === '朱雀') {     // 南方朱雀（v0.8.6）：朱紅的大字「雀」，左右各一個「翎」字跟著拍；自己帶著暖光
          const bob = Math.sin(now * 1.1 + e.bob) * 3, flap = Math.sin(now * 3 + e.bob) * 0.18;
          lights.push({ x: e.x, y: e.y, cx: e.rx + 0.5, cy: e.ry + 0.5, r: 3, c: FIRE });
          this.drawGlyph('翎', '#d9822b', px - T * 0.95, py + bob - T * 0.1, T * 0.7, -0.35 - flap, 0.95);
          this.drawGlyph('翎', '#d9822b', px + T * 0.95, py + bob - T * 0.1, T * 0.7, 0.35 + flap, 0.95);
          this.drawGlyph('雀', d.ink, px, py + bob, T * 1.7, 0, 1);
          continue;
        }
        if (e.type === '玄武') {     // 北方玄武（v0.8.8）：墨黑的大字「龜」，像一塊石頭；一個墨綠的「蛇」字繞著牠慢慢轉
          const S = T * 1.8, a = now * 0.7 + e.bob;
          ctx.save(); ctx.fillStyle = 'rgba(28,26,23,0.16)'; ctx.beginPath(); ctx.ellipse(px, py + T * 0.55, T * 0.95, T * 0.28, 0, 0, 7); ctx.fill(); ctx.restore();
          const back = Math.sin(a) < 0, snake = () => this.drawGlyph('蛇', '#2c3b2a', px + Math.cos(a) * T * 1.05, py + Math.sin(a) * T * 0.5 - T * 0.15, T * 0.6, Math.cos(a) * 0.4, 0.95);
          if (back) snake();
          this.drawGlyph('龜', d.ink, px, py, S, 0, 1);
          if (!back) snake();
          continue;
        }
        if (e.type === '白虎') {     // 西方白虎（v0.8.5）：比青龍還大的白字，墨線描邊，背上幾個「斑」字
          const bob = Math.sin(now * 0.8 + e.bob) * 3, S = T * 1.9;
          for (const [ox2, oy2] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1.4, -1.4], [1.4, 1.4], [-1.4, 1.4], [1.4, -1.4]]) this.drawGlyph('虎', '#2f2a24', px + ox2, py + bob + oy2, S, 0, 0.85);
          this.drawGlyph('虎', d.ink, px, py + bob, S, 0, 1);
          for (const [bx, by, k] of [[-0.55, -0.85, 0.42], [0.1, -1.0, 0.36], [0.62, -0.78, 0.4]]) this.drawGlyph('斑', '#3a332b', px + bx * T, py + by * T + bob + Math.sin(now * 1.3 + bx * 4) * 1.5, T * k, 0, 0.8);
          continue;
        }
        if (e.type === '蜃') {       // 蜃：一個大字，身下一圈暗水旋著
          ctx.save(); ctx.strokeStyle = 'rgba(34,63,90,0.35)'; ctx.lineWidth = 2;
          for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(px, py, T * (0.7 + i * 0.25), now * (1 + i * 0.3) + i, now * (1 + i * 0.3) + i + 4); ctx.stroke(); }
          ctx.restore();
          this.drawGlyph('蜃', d.ink, px, py + Math.sin(now * 1.2 + e.bob) * 3, T * 1.45, Math.sin(now * 0.8 + e.bob) * 0.06, 1);
          continue;
        }
        if (e.type === '牛') {       // 野牛一乘二（v0.7.2）：字跟著身子拉——橫著走拉扁、縱著走拉長；轉身時在兩樣之間漸變
          const kk = Math.min(1, dt * 10); e.rbx = e.rbx === undefined ? e.bx : e.rbx + (e.bx - e.rbx) * kk; e.rby = e.rby === undefined ? e.by : e.rby + (e.by - e.rby) * kk;
          const hw = Math.abs(e.rbx) / Math.max(1e-6, Math.abs(e.rbx) + Math.abs(e.rby)), cx = px - e.rbx * T / 2, cy = py - e.rby * T / 2;
          const rl = g.ents.riled(e), wn = e.warnT > 0, big = wn ? 0.85 : rl ? 1.12 : 1;   // 惹了：發紅、大一圈（v0.7.3）；要撲之前縮一成五、發紅（v0.9.24）
          this.drawGlyph('牛', rl || wn ? G.INK.red : d.ink, cx, cy, T * 0.95 * big, 0, 1, 0.8 + 1.15 * hw, 0.8 + 1.15 * (1 - hw));
          if (e.provoked > 0 && U.cheb(e.x, e.y, p.x, p.y) <= 7) { ctx.save(); ctx.fillStyle = G.INK.red; ctx.font = 'bold ' + Math.round(T * 0.42) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('怒', px + T * 0.4, py - T * 0.42); ctx.restore(); }
          continue;
        }
        // 主動找人的獸（v0.7.2）：豹、狼、野豬、毒蛛畫大一號，比虎小一點；蛇照舊。半友好的（無毒蛛、蟾、沒馴的鷹）被惹了也發紅、大一號（v0.7.3）
        const riled = g.ents.riled(e);
        const size = e.type === '虎' ? 0.95 : e.type === '龍' ? 1.1 : (e.type === '豹' || e.type === '狼' || e.type === '豬' || (e.type === '蛛' && e.venom) || riled) ? 0.85 : e.type === '鹿' ? 0.8 : e.type === '狸' ? 0.7 : e.type === '鮫' ? 0.8 : e.type === '魚' ? 0.6 : 0.55;
        const bobY = e.type === '雀' ? Math.sin(now * 5 + e.bob) * 3 : e.type === '龍' ? Math.sin(now * 3 + e.bob) * 4 : e.type === '魚' ? Math.sin(now * 2 + e.bob) * 1.5 : 0;
        if (e.type === '龍') lights.push({ x: e.x, y: e.y, cx: e.rx + 0.5, cy: e.ry + 0.5, r: 3, c: DRAGON });
        const rot = e.type === '魚' ? Math.sin(now * 2 + e.bob) * 0.2 : 0;
        if (e.type === '虎' && e.calm <= 0 && U.cheb(e.x, e.y, p.x, p.y) <= 8) {
          ctx.save(); ctx.fillStyle = 'rgba(180,57,42,0.12)'; ctx.beginPath(); ctx.arc(px, py, T * 0.6, 0, 7); ctx.fill(); ctx.restore();
        }
        const warn = e.warnT > 0, sz = size * (warn ? 0.85 : 1) * (e.trapT > 0 ? 0.75 : 1);   // 要撲之前縮一成五、發紅；掉在阱裡縮小一圈（v0.9.24）
        if (e.trapT > 0) { ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = this.pattern || '#efe6d2'; ctx.fillRect(px - T * 0.46, py - T * 0.46, T * 0.92, T * 0.92); ctx.restore(); }   // 掉在阱裡：蓋住底下的「阱」字，免得疊成一團
        this.drawGlyph(e.type, ((e.type === '蟾' || e.type === '蛛') && e.venom) || riled || warn ? G.INK.red : d.ink, px, py + bobY, T * sz, rot, 1);
        if (e.trapT > 0) { ctx.save(); ctx.fillStyle = G.INK.red; ctx.font = 'bold ' + Math.round(T * 0.38) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.fillText(L('陷'), px + T * 0.4, py - T * 0.38); ctx.restore(); }   // 標一個「陷」
        if (e.type === '鮫') this.drawGlyph(L('機'), '#5a4632', px + T * 0.62, py + T * 0.12 + Math.sin(now * 4) * 1.2, T * 0.42, Math.sin(now * 4) * 0.08, 0.85);   // 鮫人膝上的機（v0.9.21），梭子一來一回
        if (e.provoked > 0 && U.cheb(e.x, e.y, p.x, p.y) <= 7) { ctx.save(); ctx.fillStyle = G.INK.red; ctx.font = 'bold ' + Math.round(T * 0.42) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('怒', px + T * 0.4, py - T * 0.42); ctx.restore(); }   // 被彈弓惹惱、七格內要撲過來的
      }
      // —— 彈弓的準星：手持彈弓時，面前九格內會被打到的那隻
      { const st = (g.slingTarget && g.slingTarget()) || (g.skyTarget && g.skyTarget());   // v0.8.25：青冥落羽也畫準星
        if (st) { const sx = ox + st.rx * T + T / 2, sy = oy + st.ry * T + T / 2; ctx.save(); ctx.strokeStyle = 'rgba(180,57,42,0.75)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -now * 10; ctx.beginPath(); ctx.arc(sx, sy, T * 0.62, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(sx - T * 0.8, sy); ctx.lineTo(sx - T * 0.45, sy); ctx.moveTo(sx + T * 0.45, sy); ctx.lineTo(sx + T * 0.8, sy); ctx.moveTo(sx, sy - T * 0.8); ctx.lineTo(sx, sy - T * 0.45); ctx.moveTo(sx, sy + T * 0.45); ctx.lineTo(sx, sy + T * 0.8); ctx.stroke(); ctx.restore(); } }

      // —— 玩家：一個「人」字
      {
        const px = ox + p.rx * T + T / 2, py = oy + p.ry * T + T / 2;
        const moving = p.moveT > 0;
        const rot = moving ? Math.sin(now * 14) * 0.14 : Math.sin(now * 1.5) * 0.02;
        // 一圈留白讓「人」從字海里浮出來，腳邊一點硃砂像印章
        ctx.save();
        const halo = ctx.createRadialGradient(px, py, T * 0.2, px, py, T * 0.78);
        halo.addColorStop(0, 'rgba(243,235,216,0.92)'); halo.addColorStop(0.7, 'rgba(243,235,216,0.7)'); halo.addColorStop(1, 'rgba(243,235,216,0)');
        ctx.fillStyle = halo; ctx.fillRect(px - T, py - T, T * 2, T * 2);
        ctx.fillStyle = 'rgba(30,20,10,0.16)'; ctx.beginPath(); ctx.ellipse(px, py + T * 0.44, T * 0.32, T * 0.1, 0, 0, 7); ctx.fill();
        ctx.restore();
        if (p.sailing && p.ship) {   // 身下的船（v0.8.17）：船身照左上角 x0、y0 畫；開船時跟著人一起滑過去，人在船上走時船不動
          const s = g.shipNow(), k = G.SHIPS[s.kind] || G.SHIPS['孤帆'], h = s.dir === 'h', W = h ? k.h : k.w, H = h ? k.w : k.h;
          const sx = p.shipMove ? p.rx - p.x : 0, sy = p.shipMove ? p.ry - p.y : 0;
          this.drawShip(ox + (s.x0 + sx + W / 2) * T, oy + (s.y0 + sy + H / 2) * T, s, now, g.shipWarded(), true);
        }
        if (g.totemOn && g.totemOn()) { ctx.save(); ctx.strokeStyle = 'rgba(180,57,42,.3)'; ctx.lineWidth = 2; ctx.setLineDash([8, 10]); ctx.lineDashOffset = -now * 20; ctx.strokeRect(px - T * 7.5, py - T * 7.5, T * 15, T * 15); ctx.restore(); }   // 七格內（方框，與判定一致）
        if (p.swimming) {            // 落水：一圈圈水紋，人只露半身
          ctx.save(); ctx.strokeStyle = 'rgba(47,88,120,0.5)'; ctx.lineWidth = 1.5;
          for (let i = 0; i < 2; i++) { const r = T * (0.35 + ((now * 0.8 + i * 0.5) % 1) * 0.45); ctx.globalAlpha = 1 - ((now * 0.8 + i * 0.5) % 1); ctx.beginPath(); ctx.ellipse(px, py + T * 0.25, r, r * 0.4, 0, 0, 7); ctx.stroke(); }
          ctx.restore();
        }
        if (p.guardT > 0 && p.fight && p.fight.guardBy) {   // 神獸護駕（v0.8.7）：擋在你身邊，一圈光
          const gk = { '青龍': ['龍', G.INK.azure], '白虎': ['虎', '#7f8ea3'], '朱雀': ['雀', '#c23b22'] }[p.fight.guardBy] || ['龍', G.INK.azure];
          ctx.save(); ctx.strokeStyle = gk[1]; ctx.globalAlpha = 0.35 + 0.2 * Math.sin(now * 4); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py, T * 1.1, 0, 7); ctx.stroke(); ctx.restore();
          this.drawGlyph(gk[0], gk[1], px - T * 0.95, py - T * 0.55 + Math.sin(now * 2) * 3, T * 1.1, 0, 0.9);
        }
        { const gy = py - (p.sailing ? T * 0.12 : 0) + (p.swimming ? T * 0.12 + Math.sin(now * 3) * 2 : 0);   // v0.8.21 使用者定：斃了共工又拿到隱藏成就「服了？服了！」，回到大陸以後「人」是動態的金色（p.gold；共工還沒做，先畫好）
          if (p.gold) this.drawGoldGlyph('人', px, gy, T * 1.18, rot, now); else this.drawGlyph('人', G.INK.black, px, gy, T * 1.18, rot, p.swimming ? 0.8 : 1); }
        ctx.save(); ctx.fillStyle = G.INK.red; ctx.beginPath(); ctx.arc(px + T * 0.34, py + T * 0.36, T * 0.07, 0, 7); ctx.fill(); ctx.restore();
      }
      // —— 撒網的網影：手裡拿著網、站在水邊，淺色畫出撒得到的格子（還沒撒）
      {
        const cp = g.castPreview && g.castPreview();
        if (cp) {
          let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
          for (const [x, y] of cp.cells) {
            mx = Math.min(mx, x); my = Math.min(my, y); Mx = Math.max(Mx, x); My = Math.max(My, y);
            this.drawGlyph(cp.ch, cp.torn ? G.INK.black : G.INK.water, ox + x * T + T / 2, oy + y * T + T / 2, T * 0.9, 0, cp.torn ? 0.12 : 0.26 + 0.06 * Math.sin(now * 4));
          }
          ctx.save(); ctx.strokeStyle = cp.torn ? 'rgba(60,55,50,0.35)' : 'rgba(47,88,120,0.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -now * 12;
          ctx.strokeRect(ox + mx * T + 2, oy + my * T + 2, (Mx - mx + 1) * T - 4, (My - my + 1) * T - 4); ctx.restore();
        }
      }
      // —— 垂釣（v0.9.17）：竿梢到浮子一條線，浮子「浮」漂在水上；咬鉤時沉下去、盪開水紋；上了鉤線越繃越紅，浮子上頭一條線繃的長條
      if (g.fishing) {
        const f = g.fishing, px = ox + p.rx * T + T / 2, py = oy + p.ry * T + T / 2, bx = ox + f.x * T + T / 2, bite = f.phase === 'bite', hook = f.phase === 'hook', ten = hook ? Math.min(1, f.ten) : 0;
        const by = oy + f.y * T + T / 2 + (bite ? T * 0.16 : Math.sin(now * 2.2) * T * 0.04) + (hook ? Math.sin(now * 23) * T * 0.05 * (0.3 + ten) : 0);
        const sx = px + Math.sign(p.fx || 0) * T * 0.42, sy = py - T * 0.42 + Math.sign(p.fy || 0) * T * 0.2;   // 竿梢
        ctx.save();
        ctx.strokeStyle = hook ? 'rgba(' + Math.round(60 + 150 * ten) + ',' + Math.round(70 - 30 * ten) + ',' + Math.round(80 - 40 * ten) + ',0.85)' : 'rgba(60,64,72,0.6)'; ctx.lineWidth = hook ? 1.2 + ten : 1;
        ctx.beginPath(); ctx.moveTo(sx, sy); const sag = hook ? T * 0.05 * (1 - ten) : T * 0.35; ctx.quadraticCurveTo((sx + bx) / 2, Math.max(sy, by) + sag, bx, by - T * 0.12); ctx.stroke();
        if (bite || hook) { ctx.strokeStyle = 'rgba(47,88,120,' + (0.55 - 0.4 * ((now * 1.6) % 1)) + ')'; ctx.lineWidth = 1.2; for (let i = 0; i < 2; i++) { const r = T * (0.2 + 0.45 * (((now * 1.6) + i * 0.5) % 1)); ctx.beginPath(); ctx.ellipse(bx, by + T * 0.06, r, r * 0.45, 0, 0, 7); ctx.stroke(); } }
        ctx.restore();
        this.drawGlyph('浮', bite ? G.INK.red : G.INK.water, bx, by, T * (bite ? 0.55 : 0.62), 0, bite ? 0.95 : 0.85);
        if (hook) {
          const w0 = T * 1.7, h0 = Math.max(4, T * 0.13), x0 = bx - w0 / 2, y0 = by - T * 0.78;
          ctx.save(); ctx.fillStyle = 'rgba(255,250,240,0.7)'; ctx.fillRect(x0 - 1, y0 - 1, w0 + 2, h0 + 2);
          ctx.fillStyle = ten > 0.7 ? '#b4392a' : ten > 0.45 ? '#c9822a' : '#2f5878'; ctx.fillRect(x0, y0, w0 * ten, h0);
          ctx.fillStyle = 'rgba(40,40,40,0.75)'; ctx.font = Math.round(T * 0.38) + 'px serif'; ctx.textAlign = 'center'; ctx.fillText(L('收') + ' ' + f.done + '／' + f.need, bx, y0 - T * 0.1); ctx.restore();
        }
      }
      // —— 滑鼠（v0.6.5）：指著的格子淡淡框一下；點過的路畫成一串小點，點的那格（或跟著的生靈）一個圈
      if (g.mouse) {
        const mx = Math.floor((g.mouse.x - ox) / T), my = Math.floor((g.mouse.y - oy) / T), far = U.cheb(mx, my, p.x, p.y) > 1;
        ctx.save(); ctx.strokeStyle = far ? 'rgba(47,88,120,0.45)' : 'rgba(180,57,42,0.4)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]); ctx.strokeRect(ox + mx * T + 4, oy + my * T + 4, T - 8, T - 8); ctx.restore();
      }
      if ((g.path || g.follow) && g.pathGoal) {
        ctx.save(); ctx.fillStyle = 'rgba(47,88,120,0.5)';
        for (const [x, y] of g.path || []) { ctx.beginPath(); ctx.arc(ox + x * T + T / 2, oy + y * T + T / 2, T * 0.07, 0, 7); ctx.fill(); }
        const fe = g.follow, gx = ox + (fe ? fe.rx : g.pathGoal.x) * T + T / 2, gy = oy + (fe ? fe.ry : g.pathGoal.y) * T + T / 2;   // 跟著的生靈：圈跟著牠走
        ctx.strokeStyle = 'rgba(47,88,120,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(gx, gy, T * (0.3 + 0.04 * Math.sin(now * 5)), 0, 7); ctx.stroke(); ctx.restore();
      }
      // —— 面前的格子
      {
        const tx = p.x + p.fx, ty = p.y + p.fy;
        this.brushRect(ox + tx * T + 3, oy + ty * T + 3, T - 6, 'rgba(180,57,42,0.55)', 1.5);
        if (act && act.type === 'gather') {
          const pr = act.t / act.dur, ccx = ox + act.x * T + T / 2, ccy = oy + act.y * T + T / 2;
          ctx.save(); ctx.strokeStyle = 'rgba(180,57,42,0.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(ccx, ccy, T * 0.58, -Math.PI / 2, -Math.PI / 2 + pr * Math.PI * 2); ctx.stroke(); ctx.restore();
        }
      }
      // —— 特效
      for (const f of g.fx) {
        const pr = Math.min(1, f.t / f.dur), px = ox + f.x * T + T / 2, py = oy + f.y * T + T / 2;
        if (f.type === 'boltScar') { this.drawBoltScar(f, px, py, pr, T); continue; }   // 落雷燒焦的地（v0.9.15）：畫在地上那一層，夜色蓋得住
        if (f.type === 'write') {
          this.drawGlyph(f.ch, f.color, px, py, T * (1.6 - 0.6 * pr), (1 - pr) * 0.4, pr * 0.9);
          ctx.save(); ctx.strokeStyle = 'rgba(180,57,42,' + (0.6 * (1 - pr)) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, T * (0.3 + 0.5 * pr), 0, 7); ctx.stroke(); ctx.restore();
        } else if (f.type === 'shot' && f.arrow) {   // 青冥落羽的矰（v0.8.25；v0.8.31 改青色）：一道青色的線，後面拖著白絲
          const ax = ox + f.x * T + T / 2, ay = oy + f.y * T + T / 2, qx = ox + (f.x + (f.x1 - f.x) * pr) * T + T / 2, qy = oy + (f.y + (f.y1 - f.y) * pr) * T + T / 2;
          ctx.save(); ctx.strokeStyle = 'rgba(240,236,226,0.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(qx, qy); ctx.stroke();
          const ang = Math.atan2(qy - ay, qx - ax); ctx.strokeStyle = G.INK.qing; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(qx - Math.cos(ang) * T * 0.45, qy - Math.sin(ang) * T * 0.45); ctx.lineTo(qx, qy); ctx.stroke(); ctx.restore();
        } else if (f.type === 'shot') {          // 彈弓的石子：一顆小黑點飛過去
          const qx = ox + (f.x + (f.x1 - f.x) * pr) * T + T / 2, qy = oy + (f.y + (f.y1 - f.y) * pr) * T + T / 2 - Math.sin(pr * Math.PI) * T * 0.3;
          ctx.save(); ctx.fillStyle = G.INK.black; ctx.beginPath(); ctx.arc(qx, qy, T * 0.09, 0, 7); ctx.fill(); ctx.restore();
        } else if (f.type === 'cast') {          // 撒網：網字一閃落下
          this.drawGlyph(f.ch, G.INK.water, px, py, T * (1.25 - 0.3 * pr), 0, 0.85 * (1 - pr));
        } else if (f.type === 'fail') {
          ctx.save(); ctx.fillStyle = 'rgba(60,55,50,' + (0.35 * (1 - pr)) + ')'; ctx.beginPath(); ctx.ellipse(px, py, T * (0.3 + 0.3 * pr), T * (0.2 + 0.15 * pr), 0.4, 0, 7); ctx.fill(); ctx.restore();
        } else if (f.type === 'float') {
          ctx.save(); ctx.globalAlpha = 1 - pr; ctx.fillStyle = f.color || G.INK.black; ctx.font = 'bold ' + Math.round(T * 0.5) + 'px ' + FONT; ctx.textAlign = 'center';
          ctx.fillText(L(f.text), px, py - T * 0.3 - pr * T * 0.9); ctx.restore();
        }
      }

      if (world.locust) this.drawLocust(world.locust, ox, oy, T, now);   // 要落下來的蝗群（v0.9.19）在田上空盤旋
      // —— 霧障：一片片白霧順著風飄
      if (world.fogs.size || this.fogSeen.size) this.drawFog(g, ox, oy, x0, x1, y0, y1, dt, now);
      // —— 夜色與光：光照圖平滑放大蓋上去；光源再點一個亮芯
      const dark = g.viewDark();   // 洞窟裡白天也黑（v0.7）
      const wxHere = g.wxHere ? g.wxHere() : '';   // 人站的這一格的天氣：乾地上不畫雨雪（v0.9.17）
      this.rainA = (this.rainA || 0) + ((wxHere === 'rain' || wxHere === 'thunder' ? 1 : 0) - (this.rainA || 0)) * Math.min(1, dt / 1.5);   // 起雨收雨各淡入淡出一息半
      const glowK = Math.max(dark, 0.55 * this.rainA);   // 下雨的白天，燈也透出一點微光（v0.6.4）
      if (g.torchLit()) lights.push({ x: p.x, y: p.y, cx: p.rx + 0.5, cy: p.ry + 0.5, r: 3, c: TORCH });
      if (g.pearlShip && g.pearlShip()) lights.push({ x: p.x, y: p.y, cx: p.rx + 0.5, cy: p.ry + 0.5, r: 3, c: AZURE });   // 行船帶著鮫珠（v0.9.21）
      for (const e of g.ents.list) if (e.type === '鮫') lights.push({ x: e.x, y: e.y, r: 1.5, c: AZURE });   // 鮫人身邊微微發光
      const lm = dark > 0.02 || (glowK > 0.02 && lights.length) ? this.lightMap(g, ox, oy, x0, x1, y0, y1, lights, dark, glowK, now) : null;
      this.lastLm = lm;   // 測試看得到這一幀有沒有夜色、暖光
      if (lm) {
        ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';   // 雙線性就夠平滑；'high' 在軟體繪圖下很慢
        if (dark > 0.02) ctx.drawImage(this.lmDark, 0, 0, lm.cols, lm.rows, lm.x, lm.y, lm.w, lm.h);
        if (lm.glow) {
          if (dark > 0.02) { ctx.globalAlpha = glowK; ctx.drawImage(this.lmGlow, 0, 0, lm.cols, lm.rows, lm.x, lm.y, lm.w, lm.h); }   // 白天下雨只在雨幕上透一層（見下）
          ctx.globalCompositeOperation = 'lighter';
          for (const l of lights) {
            const px = ox + (l.cx === undefined ? l.x + 0.5 : l.cx) * T, py = oy + (l.cy === undefined ? l.y + 0.5 : l.cy) * T;
            if (px < -T || py < -T || px > w + T || py > h + T) continue;
            const rad = T * (0.85 + 0.06 * Math.sin(now * 7 + l.x * 5 + l.y * 3)) * (l.r >= 9 ? 1.6 : 1);
            ctx.globalAlpha = Math.min(1, 0.3 * glowK); ctx.drawImage(this.bloom, px - rad, py - rad, rad * 2, rad * 2);
          }
        }
        ctx.restore();
      }
      // —— 神兵的招牌特效（v0.8.31 使用者要的）：畫在夜色上面，晚上也亮
      for (const f of g.fx) {
        if ((f.type !== 'thunder' && f.type !== 'scorch' && f.type !== 'feather' && f.type !== 'stars' && f.type !== 'bolt' && f.type !== 'boltWarn' && f.type !== 'geese') || f.t < 0) continue;
        const pr = Math.min(1, f.t / f.dur), px = ox + f.x * T + T / 2, py = oy + f.y * T + T / 2;
        if (f.type === 'stars') { const cx2 = ox + p.rx * T + T / 2, cy2 = oy + p.ry * T + T / 2; for (let i = 0; i < 5; i++) { const a = pr * Math.PI * 2 + i / 5 * Math.PI * 2; this.drawGlyph('星', '#c9a227', cx2 + Math.cos(a) * T * 1.3, cy2 + Math.sin(a) * T * 1.0, T * 0.6, a, Math.min(1, (1 - pr) * 2.5)); } }   // 星移斗轉（v0.9）：星字繞你轉一圈
        else if (f.type === 'geese') {   // 鴻雁來（v0.9.19）：一行「雁」排成人字從畫面上方飛過
          const lead = f.dir > 0 ? -T * 3 + (w + T * 6) * pr : w + T * 3 - (w + T * 6) * pr, gy = h * 0.16 + Math.sin(pr * 6) * T * 0.2, a = pr < 0.1 ? pr / 0.1 : pr > 0.9 ? (1 - pr) / 0.1 : 1;
          for (let i = 0; i < 7; i++) { const rank = Math.ceil(i / 2), side = i % 2 ? 1 : -1; this.drawGlyph('雁', '#3a3a3a', lead - f.dir * rank * T * 0.9, gy + side * rank * T * 0.55 + Math.sin(now * 6 + i) * 2, T * 0.42, 0, 0.75 * a); }
        }
        else if (f.type === 'kun') {   // 鯤（v0.9.21）：海面下一道影子游過去，一次比一次大
          const LL = f.size * T, mv = (pr - 0.5) * T * (3 + f.size * 0.6), cx3 = px + T / 2 + Math.cos(f.ang) * mv, cy3 = py + T / 2 + Math.sin(f.ang) * mv, a = Math.sin(Math.PI * pr) * 0.42;
          ctx.save(); ctx.translate(cx3, cy3); ctx.rotate(f.ang); ctx.globalAlpha = a; ctx.fillStyle = '#14202a'; ctx.beginPath(); ctx.ellipse(0, 0, LL * 0.55, LL * 0.2, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.moveTo(-LL * 0.5, 0); ctx.lineTo(-LL * 0.78, -LL * 0.16); ctx.lineTo(-LL * 0.78, LL * 0.16); ctx.closePath(); ctx.fill(); ctx.restore();
          if (f.size <= 12) this.drawGlyph(L('鯤'), '#d9e4ea', cx3, cy3, Math.min(T * 1.2, LL * 0.3), f.ang, a * 0.8);
        }
        else if (f.type === 'peng') {   // 化而為鵬（v0.9.21）：比畫面還大的「鵬」字影子，從北往南掠過；rise 是從水裡起來
          const S = Math.max(w, h) * 1.6, cy3 = -S * 0.5 + (h + S) * pr, a = (pr < 0.15 ? pr / 0.15 : pr > 0.85 ? (1 - pr) / 0.15 : 1) * 0.55;
          if (f.rise && pr < 0.3) { ctx.save(); ctx.globalAlpha = (0.3 - pr) * 1.5; ctx.fillStyle = '#e8eef2'; for (let i = 0; i < 14; i++) { const sx = (i / 14) * w + Math.sin(now * 3 + i) * 20; ctx.fillRect(sx, h * (0.2 + 0.6 * ((i * 37) % 10) / 10), T * 2.4, 2); } ctx.restore(); }
          ctx.save(); ctx.globalAlpha = a; this.drawGlyph(L('鵬'), '#0f1418', w / 2 + Math.sin(pr * 3) * T, cy3, S, Math.sin(now * 0.7) * 0.03, a); ctx.restore();
        }
        else if (f.type === 'bolt') this.drawBolt(f, px, py, pr, T, dark);   // 雷雨的落雷（v0.9.15）
        else if (f.type === 'boltWarn') this.drawBoltWarn(f, px, py, pr, T, dark, now);   // 雷要落的三乘三先亮：正中最亮、十字次之、四角最淡
        else if (f.type === 'thunder') this.drawThunder(f, px, py, pr, T, ox, oy);
        else if (f.type === 'scorch') this.drawScorch(f, px, py, pr, T, now);
        else this.drawFeather(f, px, py, pr, T, ox, oy);
      }
      // —— 雨：一層淡墨與斜斜的雨絲，跟著世界滾動；燈火照得到的雨絲染上暖色，燈光微微透過雨幕
      if (this.rainA > 0.02) {
        const pm = (a, m) => ((a % m) + m) % m;
        ctx.save(); ctx.globalAlpha = this.rainA;
        ctx.fillStyle = 'rgba(70,80,100,' + (0.12 + 0.06 * dark) + ')'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = dark > 0.5 ? 'rgba(210,220,240,0.6)' : 'rgba(40,50,75,0.6)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
        const warm = [], lit = lm && lm.glow ? lm : null, lcols = lit ? lit.cols : 0, lrows = lit ? lit.rows : 0, gpx = lit ? this.lmGlowCtx.getImageData(0, 0, lcols, lrows).data : null;   // 雨絲照不照得到燈：看暖光那張的濃淡
        ctx.beginPath();
        const n = Math.min(380, Math.floor(w * h / 3000)), span = h + 60, wide = w + 80, drift = now * 520;
        for (let i = 0; i < n; i++) {
          const r = U.hash2(i, 131, 7), len = 9 + (r & 15);
          const by = ((r >>> 16) & 4095) / 4096 * span, bx = ((r >>> 4) & 4095) / 4096 * wide;
          const yy = pm(by + drift * (0.85 + (r & 7) / 24) + oy * 0.5, span) - 30;
          const px = pm(bx - yy * 0.22 + ox * 0.5, wide) - 40;
          if (lit) { const li = Math.floor((px - lit.x) * lit.px), lj = Math.floor((yy - lit.y) * lit.px); if (li >= 0 && lj >= 0 && li < lcols && lj < lrows && gpx[(lj * lcols + li) * 4 + 3] > 16) { warm.push(px, yy, len); continue; } }
          ctx.moveTo(px, yy); ctx.lineTo(px - len * 0.22, yy + len);
        }
        ctx.stroke();
        if (warm.length) {
          ctx.strokeStyle = 'rgba(255,206,128,' + (0.45 + 0.35 * glowK) + ')'; ctx.beginPath();
          for (let i = 0; i < warm.length; i += 3) { ctx.moveTo(warm[i], warm[i + 1]); ctx.lineTo(warm[i] - warm[i + 2] * 0.22, warm[i + 1] + warm[i + 2]); }
          ctx.stroke();
        }
        if (lit) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (dark > 0.02 ? 0.5 : 0.9) * this.rainA * glowK; ctx.imageSmoothingEnabled = true; ctx.drawImage(this.lmGlow, 0, 0, lit.cols, lit.rows, lit.x, lit.y, lit.w, lit.h); }
        ctx.restore();
      }
      // —— 雪（v0.9.15）：慢慢飄的雪點，白天是淡墨點、晚上是白點；狂風天跟著風斜著走
      const gale = world.galeOn() ? world.galeDir() : null;
      this.snowA = (this.snowA || 0) + ((wxHere === 'snow' ? 1 : 0) - (this.snowA || 0)) * Math.min(1, dt / 2);
      if (this.snowA > 0.02) {
        const pm = (a, m) => ((a % m) + m) % m, span = h + 40, wide = w + 40, n = Math.min(300, Math.floor(w * h / 3800));
        ctx.save(); ctx.globalAlpha = this.snowA; ctx.fillStyle = 'rgba(232,238,246,' + (0.1 + 0.04 * dark) + ')'; ctx.fillRect(0, 0, w, h);
        const day = dark <= 0.5; ctx.fillStyle = day ? 'rgba(255,255,255,0.95)' : 'rgba(244,246,250,0.85)'; ctx.strokeStyle = 'rgba(60,72,98,0.55)'; ctx.lineWidth = 1; ctx.beginPath();   // 白天紙上：白點描一圈淡墨才看得見
        const gx = gale ? gale[0] * 90 : 0, gy = gale ? gale[1] * 40 : 0;
        for (let i = 0; i < n; i++) {
          const r = U.hash2(i, 977, 13), sp = 0.6 + (r & 7) / 10, rad = (day ? 1.8 : 1.2) + ((r >>> 3) & 3) * 0.5;
          const yy = pm(((r >>> 16) & 4095) / 4096 * span + now * (34 + gy) * sp + oy * 0.6, span) - 20;
          const xx = pm(((r >>> 4) & 4095) / 4096 * wide + Math.sin(now * 1.1 + i) * 9 + now * gx * sp + ox * 0.6, wide) - 20;
          ctx.moveTo(xx + rad, yy); ctx.arc(xx, yy, rad, 0, 6.2832);
        }
        if (day) ctx.stroke(); ctx.fill(); ctx.restore();
      }
      // —— 冰雹（v0.9.19）：又密又快的白粒斜著砸下，落地彈一下
      this.hailA = (this.hailA || 0) + ((g.hailing && g.hailing() ? 1 : 0) - (this.hailA || 0)) * Math.min(1, dt / 0.8);
      if (this.hailA > 0.02) {
        const pm = (a, m) => ((a % m) + m) % m, span = h + 40, wide = w + 40, n = Math.min(220, Math.floor(w * h / 5200)), day = dark <= 0.5;
        ctx.save(); ctx.globalAlpha = this.hailA; ctx.fillStyle = day ? 'rgba(250,252,255,0.95)' : 'rgba(236,240,246,0.9)'; ctx.strokeStyle = 'rgba(52,62,84,0.6)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const r = U.hash2(i, 431, 29), sp = 0.8 + (r & 7) / 14, rad = 1.6 + ((r >>> 3) & 3) * 0.45;
          const yy = pm(((r >>> 16) & 4095) / 4096 * span + now * 260 * sp, span) - 20, xx = pm(((r >>> 4) & 4095) / 4096 * wide + now * 40 * sp, wide) - 20;
          ctx.moveTo(xx + rad, yy); ctx.arc(xx, yy, rad, 0, 6.2832);
        }
        if (day) ctx.stroke(); ctx.fill(); ctx.restore();
      }
      // —— 風（v0.9.15）：狂風是一道道順著風向掠過的長絲；和風是幾縷慢慢飄的短絲
      const breeze = !gale && world.breezeOn();
      if (gale || breeze) {
        const pm = (a, m) => ((a % m) + m) % m, ddx = gale ? gale[0] : 1, ddy = gale ? gale[1] : -0.15, nn = Math.hypot(ddx, ddy), ux = ddx / nn, uy = ddy / nn;
        const n = gale ? Math.min(70, Math.floor(w * h / 14000)) : Math.min(14, Math.floor(w * h / 60000) + 4), sp = gale ? 760 : 110, span = Math.max(w, h) + 300;
        ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = dark > 0.5 ? 'rgba(225,230,240,' + (gale ? 0.32 : 0.22) + ')' : 'rgba(55,66,88,' + (gale ? 0.3 : 0.18) + ')'; ctx.lineWidth = gale ? 1.3 : 1.1; ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const r = U.hash2(i, 313, 29), len = gale ? 60 + (r & 63) : 26 + (r & 15), a = ((r >>> 4) & 4095) / 4096 * span - 150, b = ((r >>> 16) & 4095) / 4096 * span - 150;
          const t = pm(a + now * sp * (0.8 + (r & 7) / 20), span) - 150;   // 沿著風向走的那一段
          const cx = w / 2 + ux * (t - span / 2 + 150) - uy * (b - span / 2 + 150), cy = h / 2 + uy * (t - span / 2 + 150) + ux * (b - span / 2 + 150);
          if (gale) { ctx.moveTo(cx, cy); ctx.lineTo(cx - ux * len, cy - uy * len); }
          else { const wv = Math.sin(now * 2 + i) * 4; ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx - ux * len / 2 - uy * wv, cy - uy * len / 2 + ux * wv, cx - ux * len, cy - uy * len); }
        }
        ctx.stroke(); ctx.restore();
      }
      // —— 雷光（v0.9.15）：落雷那一下整個畫面一白
      if (this.flash > 0) { ctx.save(); ctx.fillStyle = 'rgba(250,250,244,' + Math.min(0.55, this.flash) + ')'; ctx.fillRect(0, 0, w, h); ctx.restore(); this.flash -= dt; }
      // —— 紙邊的舊色，以及身體的訊號：掉血泛紅、中毒泛綠、神志不清泛藍
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(80,60,30,0)'); vg.addColorStop(1, 'rgba(80,60,30,0.32)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
      const vig = g.vignette ? g.vignette() : null;
      if (vig) {
        const tints = [['180,40,30', vig.red], ['60,140,60', vig.green], ['50,80,180', vig.blue]];
        for (const [rgb, a] of tints) {
          if (a <= 0.01) continue;
          const pulse = 0.85 + 0.15 * Math.sin(now * 3);
          const gr = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
          gr.addColorStop(0, 'rgba(' + rgb + ',0)'); gr.addColorStop(1, 'rgba(' + rgb + ',' + (a * pulse) + ')');
          ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
        }
      }

      // —— 小地圖
      this.miniAcc += dt;
      if (this.miniAcc > 0.25 && !this.mini.classList.contains('hidden')) { this.miniAcc = 0; this.drawMini(g); }
    }

    drawMini(g) {
      const m = this.mctx, S = this.mini.width, N = 50, px = S / N, p = g.player;
      m.fillStyle = '#efe5cf'; m.fillRect(0, 0, S, S);
      const half = N >> 1;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = p.x - half + i, y = p.y - half + j;
        if (!g.world.isSeen(x, y)) continue;                    // 沒看過的地方還是白紙
        const ch = g.world.get(x, y);
        m.fillStyle = g.world.isBurning(x, y) ? MINI['火'] : (MINI[ch] || '#999');
        m.fillRect(i * px, j * px, px + 0.5, px + 0.5);
      }
      m.font = '11px ' + FONT; m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillStyle = '#1c1a17';
      for (const pl of g.world.places) {
        if (!pl.seen) continue;
        const i = pl.x + (pl.w - 1) / 2 - p.x + half, j = pl.y + (pl.h - 1) / 2 - p.y + half;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        m.fillText(L(pl.ch || pl.name), i * px + px / 2, j * px + px / 2);
      }
      m.fillStyle = 'rgba(200,198,192,0.85)';
      for (const f of g.world.fogs.values()) for (const k of f.cells) { const [x, y] = U.unkey(k), i = x - p.x + half, j = y - p.y + half; if (i >= 0 && j >= 0 && i < N && j < N && g.world.isSeen(x, y)) m.fillRect(i * px, j * px, px + 0.5, px + 0.5); }
      for (const e of g.ents.list) {
        const i = e.x - p.x + half, j = e.y - p.y + half;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        if (e.type === '虎') { m.fillStyle = '#b4392a'; m.fillRect(i * px - 1, j * px - 1, px + 2, px + 2); }
        else if (e.type === '魄') { m.fillStyle = '#3b3550'; m.fillRect(i * px - 1, j * px - 1, px + 2, px + 2); }
        else if (e.type === '蜃') { m.fillStyle = '#223f5a'; m.fillRect(i * px - 2, j * px - 2, px + 4, px + 4); }
        else if (e.type === '青龍') { m.fillStyle = '#24766b'; m.fillRect(i * px - 2, j * px - 2, px + 4, px + 4); }
        else if (e.type === '白虎') { m.fillStyle = '#f6f1e4'; m.fillRect(i * px - 2, j * px - 2, px + 4, px + 4); m.strokeStyle = '#2f2a24'; m.strokeRect(i * px - 2, j * px - 2, px + 4, px + 4); }
        else if (e.type === '齒') { m.fillStyle = '#6b4a2f'; m.fillRect(i * px - 1, j * px - 1, px + 2, px + 2); }
        else if (e.type === '豨') { m.fillStyle = '#5a3e2b'; m.fillRect(i * px - 2, j * px - 2, px * 2 + 4, px * 2 + 4); }
        else if (e.type === '修蛇') { if (!e.under) { m.fillStyle = '#2c3b2a'; m.fillRect(i * px - 2, j * px - 2, px + 4, px + 4); } }
        else if (e.type === '雕') { m.fillStyle = '#4a4f5c'; m.fillRect(i * px - 1, j * px - 1, px + 2, px + 2); }
        else if (e.type === '畢') { m.fillStyle = '#24766b'; m.fillRect(i * px - 1, j * px - 1, px + 2, px + 2); }
        else if (e.type === '大風') { m.fillStyle = '#5b6b7a'; m.fillRect(i * px - 2, j * px - 2, px + 4, px + 4); }
        else if (e.type === '共工') { if (!e.under || e.shiftT > 0) { m.fillStyle = e.shade ? '#55535c' : '#b4392a'; m.fillRect(i * px - px - 2, j * px - px - 2, px * 3 + 4, px * 3 + 4); } }   // v0.9
        else if (e.type === '朱雀') { m.fillStyle = '#c23b22'; m.fillRect(i * px - 2, j * px - 2, px + 4, px + 4); }
        else if (e.type === '玄武') { m.fillStyle = '#1c1a17'; m.fillRect(i * px - 2, j * px - 2, px + 4, px + 4); }
        else if (e.type === '豹' || e.type === '狼' || e.type === '蛇') { m.fillStyle = '#8a2a1a'; m.fillRect(i * px, j * px, px + 1, px + 1); }
      }
      m.fillStyle = '#1c1a17'; m.beginPath(); m.arc(half * px + px / 2, half * px + px / 2, 3, 0, 7); m.fill();
      if (g.player.home) {
        const i = g.player.home.x - p.x + half, j = g.player.home.y - p.y + half;
        if (i >= 0 && j >= 0 && i < N && j < N) { m.fillStyle = '#9a6b45'; m.beginPath(); m.arc(i * px + px / 2, j * px + px / 2, 2.5, 0, 7); m.fill(); }
      }
      // 淡淡的夜色
      const dk = g.darkness(); if (dk > 0.02) { m.fillStyle = 'rgba(12,16,36,' + (0.35 * dk) + ')'; m.fillRect(0, 0, S, S); }
    }

    // 全圖：走過的地方才有墨，地標蓋朱印（v0.7：紙大到 2500×2500，地圖照走過的範圍縮放——只在本島時跟以前一樣大，出了海就拉遠）
    drawBigMap(g, cv) {
      const w = g.world, p = g.player, S = cv.width, m = cv.getContext('2d'), CHK = 16;
      let x0 = -G.HOME_R, y0 = -G.HOME_R, x1 = G.HOME_R, y1 = G.HOME_R;
      for (const k of w.explored.keys()) { const [cx, cy] = U.unkey(k); x0 = Math.min(x0, cx * CHK); y0 = Math.min(y0, cy * CHK); x1 = Math.max(x1, cx * CHK + CHK - 1); y1 = Math.max(y1, cy * CHK + CHK - 1); }
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      const az = (p.scaleTaken || p.azure) && g.azure;   // 拿到青鱗以後，東海青龍的所在也畫進來（v0.8）
      if (az) { x0 = Math.min(x0, az.x - 12); y0 = Math.min(y0, az.y - 12); x1 = Math.max(x1, az.x + 12); y1 = Math.max(y1, az.y + 12); }
      const heard = G.zones(w.seed).filter(z => (p.nestHints || {})[z.id] && !(p.zones || {})[z.id]);   // v0.8.19 聽說了、還沒到過的巢穴：畫一圈，圖也拉大到看得見
      const foc = g.mapFocus ? G.zones(w.seed).find(z => z.id === g.mapFocus) : null;   // v0.9.8 主動指路：點了的那一處也拉進圖裡
      for (const z of foc ? heard.concat([foc]) : heard) { const r = (z.ext || z.r) + 10; x0 = Math.min(x0, z.x - r); y0 = Math.min(y0, z.y - r); x1 = Math.max(x1, z.x + r); y1 = Math.max(y1, z.y + r); }
      let N = Math.min(2 * G.WORLD_R, Math.ceil(Math.max(x1 - x0, y1 - y0) * 1.06) + 8), ox = Math.round((x0 + x1) / 2 - N / 2), oy = Math.round((y0 + y1) / 2 - N / 2);
      const zm = Math.pow(2, g.mapZoom || 0), fitN = N;   // v0.8.24 使用者要的放大縮小：第 0 檔看得到走過的全部，每放大一檔範圍減半；放大時以你為中心（拖曳、方向鍵挪 g.mapPan）
      if (zm > 1) { N = Math.max(MAP_MIN_N, Math.round(fitN / zm)); const pan = g.mapPan || { x: 0, y: 0 }; ox = Math.round(p.x + pan.x - N / 2); oy = Math.round(p.y + pan.y - N / 2); }
      const px = S / N;
      const X = (x) => (x - ox) * px, Y = (y) => (y - oy) * px, F = (k, min) => Math.max(min, Math.min(MAP_FONT_MAX, Math.round(px * k))) + 'px ' + FONT;   // v0.8.24：放大時地標、人、北這些字不跟著無限變大
      this.mapView = { ox, oy, N, px, zoom: zm, fitN };   // 測試看得到這張圖畫了多大的範圍
      // 底：走過的地形畫在一張快取的畫布上，範圍、看過的格數、地上的字一變才重畫
      const key = ox + ',' + oy + ',' + N + ',' + S + ',' + w.explored.size + ',' + w.ver + ',' + (window.I18N && window.I18N.hans ? 1 : 0);   // 同一塊裡多看見幾格不會改 key，所以另外每兩秒重畫一次
      if (!this.mapBase || this.mapBase.width !== S) { this.mapBase = document.createElement('canvas'); this.mapBase.width = this.mapBase.height = S; this.mapKey = ''; }
      if (this.mapKey !== key || (this.mapAt || 0) + 2000 < performance.now()) {
        this.mapKey = key; this.mapAt = performance.now();
        const b = this.mapBase.getContext('2d'), step = px >= 1 ? 1 : px >= 0.5 ? 2 : px >= 0.25 ? 4 : 8, glyphs = px >= MAP_GLYPH_PX;   // 放得夠大就寫字，跟走在島上看到的一樣
        b.fillStyle = '#efe5cf'; b.fillRect(0, 0, S, S); b.globalAlpha = 0.9;
        if (glyphs) { b.textAlign = 'center'; b.textBaseline = 'middle'; b.font = Math.round(px * 0.9) + 'px ' + FONT; }
        for (const [k, bits] of w.explored) {
          const [cx, cy] = U.unkey(k), bx = cx * CHK, by = cy * CHK;
          if (bx + CHK < ox || by + CHK < oy || bx > ox + N || by > oy + N) continue;
          for (let j = 0; j < CHK; j += step) for (let i = 0; i < CHK; i += step) {
            const ii = Math.min(CHK - 1, i + (step >> 1)), jj = Math.min(CHK - 1, j + (step >> 1)), n = jj * CHK + ii;
            if (!(bits[n >> 3] & (1 << (n & 7)))) continue;
            const ch = w.get(bx + ii, by + jj);
            if (glyphs) { const d = DB[ch]; b.fillStyle = 'rgba(' + (d && d.kind === 'water' ? '120,160,190' : '210,196,166') + ',0.35)'; b.fillRect(X(bx + i), Y(by + j), px + 0.4, px + 0.4); b.fillStyle = (d && d.ink) || MINI[ch] || '#999'; b.fillText(L(ch), X(bx + i) + px / 2, Y(by + j) + px / 2); continue; }
            b.fillStyle = MINI[ch] || '#999';
            b.fillRect(X(bx + i), Y(by + j), step * px + 0.4, step * px + 0.4);
          }
        }
        b.globalAlpha = 1;
      }
      m.drawImage(this.mapBase, 0, 0);
      m.fillStyle = 'rgba(200,198,192,0.85)';
      for (const f of w.fogs.values()) for (const k of f.cells) { const [x, y] = U.unkey(k); if (w.isSeen(x, y)) m.fillRect(X(x), Y(y), px + 0.4, px + 0.4); }
      m.textAlign = 'center'; m.textBaseline = 'middle';
      // 外島：登上過的寫島名（v0.7）
      for (const id in (p.isles || {})) { const [ci, cj] = U.unkey(id), isl = G.isleAt(ci, cj, w.seed); if (!isl) continue; m.font = F(5, 12); m.fillStyle = 'rgba(28,26,23,0.8)'; m.fillText(L(isl.name), X(isl.cx), Y(isl.cy - isl.R * 0.85)); }
      // v0.8.27 第三版：登上過的陸塊寫玩家取的名字；點亮的傳送點畫一個小圈
      if (G.GEN >= 3) {
        const ms = G.masses(w.seed).list; m.font = F(7, 14); m.fillStyle = 'rgba(28,26,23,0.82)';
        for (const id in (p.masses || {})) { const mm = ms[id]; if (mm) m.fillText(L(g.massName(+id)), X(mm.cx), Y(mm.cy)); }
        for (const k in (p.gates || {})) { const t = p.gates[k]; m.save(); m.fillStyle = t.water ? 'rgba(30,70,110,0.85)' : 'rgba(46,110,58,0.9)'; m.beginPath(); m.arc(X(t.x + 0.5), Y(t.y + 0.5), Math.max(2.5, px * 1.5), 0, 7); m.fill(); m.restore(); }
      }
      // 四方地界：到過的寫名字，水的藍字、陸的赭字（v0.8.4）
      for (const z of G.zones(w.seed)) {
        if (!(p.zones || {})[z.id]) continue;
        const wet = z.type === 'deep' || z.type === 'lake', dy = z.type === 'lake' ? 0 : z.type === 'deep' ? -18 : z.type === 'peak' ? -z.r * 0.8 : -(z.r + 16);
        m.font = F(z.type === 'peak' ? 9 : 6, 13); m.fillStyle = wet ? 'rgba(30,70,110,0.85)' : 'rgba(122,52,34,0.85)'; m.fillText(L(z.name), X(z.x + 0.5), Y(z.y + dy));
      }
      for (const z of heard) {   // 聽說了的巢穴：虛線圈＋名字打問號
        m.save(); m.setLineDash([6, 6]); m.strokeStyle = 'rgba(122,52,34,0.6)'; m.lineWidth = 1.5; m.beginPath(); m.arc(X(z.x + 0.5), Y(z.y + 0.5), Math.max(6, (z.ext || z.r) * px), 0, 7); m.stroke(); m.restore();
        m.font = F(6, 12); m.fillStyle = 'rgba(122,52,34,0.75)'; m.fillText(L(z.name + '？'), X(z.x + 0.5), Y(z.y + 0.5));
      }
      if (foc) {   // 指路（v0.9.8）：朱紅實線圈住那一處，從你這裡拉一條虛線過去
        const fx = X(foc.x + 0.5), fy = Y(foc.y + 0.5), R = Math.max(9, (foc.ext || foc.r) * px);
        m.save(); m.strokeStyle = 'rgba(180,57,42,0.9)'; m.lineWidth = 2.5; m.beginPath(); m.arc(fx, fy, R, 0, 7); m.stroke();
        m.setLineDash([5, 5]); m.lineWidth = 1.6; m.beginPath(); m.moveTo(X(p.x + 0.5), Y(p.y + 0.5)); m.lineTo(fx, fy); m.stroke(); m.restore();
      }
      // 碑
      m.font = F(2.6, 9); m.fillStyle = '#1c1a17';
      for (const s of w.steles.values()) if (w.isSeen(s.x, s.y)) m.fillText('碑', X(s.x + 0.5), Y(s.y + 0.5));
      // 地標：大字 + 朱印名
      const k2 = Math.max(1, 3 / Math.max(px, 0.01));   // 拉遠時地標別縮到看不見
      for (const pl of w.places) {
        if (!pl.seen) continue;
        const cx = X(pl.x + pl.w / 2), cy = Y(pl.y + pl.h / 2), u = Math.max(px, 0.75);
        m.font = F(4.2, 11); m.fillStyle = pl.ch ? (DB[pl.ch].ink) : '#5a3e2b';
        m.fillText(L(pl.ch || '村'), cx, cy);
        if (k2 > 3.5) continue;   // 拉得很遠時只寫地標字，不蓋印
        const read = p.places && p.places[pl.id] === 2;
        m.fillStyle = read ? '#b4392a' : 'rgba(180,57,42,0.45)'; m.fillRect(cx + u * 2.4, cy - u * 2.2, u * 3.2, u * 3.2);
        m.fillStyle = '#f7efe0'; m.font = F(2.4, 8); m.fillText(L(pl.name), cx + u * 4.0, cy - u * 0.5);
      }
      if (az) { m.font = F(6, 16); m.fillStyle = '#24766b'; m.fillText(L('龍'), X(az.x + 0.5), Y(az.y + 0.5)); m.font = F(3, 11); m.fillText(L(p.azure ? '青龍' : '青龍（帶蜃珠來）'), X(az.x + 0.5), Y(az.y + 0.5) + Math.max(14, px * 5)); }
      // 家、人
      if (p.home) { m.fillStyle = '#9a6b45'; m.beginPath(); m.arc(X(p.home.x + 0.5), Y(p.home.y + 0.5), Math.min(8, Math.max(2.5, px * 1.2)), 0, 7); m.fill(); }
      m.font = F(4, 13); m.fillStyle = '#1c1a17'; m.fillText('人', X(p.x + 0.5), Y(p.y + 0.5));
      m.fillStyle = '#b4392a'; m.beginPath(); m.arc(X(p.x + 0.5) + Math.min(9, Math.max(4, px * 0.8)), Y(p.y + 0.5) + Math.min(9, Math.max(4, px * 0.8)), Math.min(5, Math.max(2, px * 0.6)), 0, 7); m.fill();
      if (zm > 1 && N <= MAP_MIN_N) {   // 放到最大：圓外蓋一層紙，只看得見方圓三十格（v0.8.25 使用者定）
        const r = MAP_VIEW_R * px; this.mapView.circle = MAP_VIEW_R; m.save(); m.beginPath(); m.rect(0, 0, S, S); m.arc(S / 2, S / 2, r, 0, Math.PI * 2, true); m.fillStyle = 'rgba(239,229,207,0.94)'; m.fill('evenodd');
        m.strokeStyle = 'rgba(74,66,56,0.55)'; m.lineWidth = 1.5; m.beginPath(); m.arc(S / 2, S / 2, r, 0, Math.PI * 2); m.stroke(); m.restore();
      }
      if (p.redeemed) {   // 還願以後（v0.9.10）：紙平了，四角有四象壓著——大地圖四邊各壓一塊鎮紙（北龜、東龍、南雀、西虎）
        const B = Math.round(Math.max(22, Math.min(34, S * 0.06))), e = B * 0.62;
        for (const [ch, fill, ink, x, y] of [['龜', '#1c1a17', '#efe5cf', S / 2, e], ['龍', '#24766b', '#efe5cf', S - e, S / 2], ['雀', '#c23b22', '#efe5cf', S / 2, S - e], ['虎', '#f6f1e4', '#2f2a24', e, S / 2]]) {
          m.save(); m.globalAlpha = 0.92; m.fillStyle = fill; m.strokeStyle = '#2f2a24'; m.lineWidth = 1.5; m.beginPath();
          if (m.roundRect) m.roundRect(x - B / 2, y - B / 2, B, B, 4); else m.rect(x - B / 2, y - B / 2, B, B); m.fill(); m.stroke();
          m.globalAlpha = 1; m.fillStyle = ink; m.font = 'bold ' + Math.round(B * 0.7) + 'px ' + FONT; m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillText(L(ch), x, y + 1); m.restore();
        }
      }
      // 北、比例
      m.font = F(3.5, 14); m.fillStyle = '#4a4238'; m.fillText('北', S - 22, 20);
      m.strokeStyle = '#4a4238'; m.lineWidth = 1.5; m.beginPath(); m.moveTo(S - 22, 32); m.lineTo(S - 22, 52); m.stroke();
      const bar = [10, 25, 50, 100, 250, 500].find(v => v * px >= 50) || 500;
      m.beginPath(); m.moveTo(14, S - 16); m.lineTo(14 + bar * px, S - 16); m.stroke(); m.font = '12px ' + FONT; m.textAlign = 'left'; m.fillText(bar + ' 格', 14, S - 28);
    }
  }

  window.Renderer = Renderer;
})();
