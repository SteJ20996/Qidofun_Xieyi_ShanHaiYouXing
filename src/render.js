// render.js —— 水墨渲染：宣紙、滲墨的字、晝夜、小地圖
(function () {
  'use strict';
  const U = window.U, G = window.G, DB = G.DB;
  const FONT = '"LXGW WenKai TC", "BiauKai", "DFKai-SB", "標楷體", "Kaiti TC", "Kaiti SC", "STKaiti", "KaiTi", "Noto Serif TC", "Noto Serif SC", "Noto Serif CJK TC", "PingFang TC", "WenQuanYi Zen Hei", serif';   // 簡體字霞鶩文楷 TC 也有，缺的幾個落到 SC 字型
  const L = (s) => (window.I18N ? window.I18N.t(s) : s);   // 畫布上的字：選了簡體就轉（v0.5.4）
  const MAP_VIEW_R = 30, MAP_MIN_N = MAP_VIEW_R * 2, MAP_GLYPH_PX = 10, MAP_FONT_MAX = 30;   // 大地圖放大（v0.8.24）；v0.8.25 使用者改：放到最大只看得見方圓三十格的圓；一格大過十點就寫字
  const MINI = {
    '淼': '#4a6f8f', '水': '#6f93b0', '沙': '#d9c89a', '石': '#9c9a93', '山': '#6e6c75', '雪': '#e8ecf2',
    '草': '#b9c98f', '花': '#d29b8e', '木': '#8aa86f', '林': '#5e8a55', '森': '#3b5f3a', '竹': '#7fa36b', '田': '#d1c572',
    '土': '#a98a62', '灰': '#8d8781', '白': '#f3ebd8', '火': '#d9593c', '炎': '#d9593c', '焱': '#d9593c',
    '明': '#f0c54a', '休': '#9a6b45', '困': '#7a5a3e', '碑': '#2a2724', '亭': '#8a3a2a', '桑': '#3a7a52', '若': '#a2552f', '建': '#5a4a2a', '日': '#e07a4a', '月': '#e3c35a',
    '果': '#c9654a', '灶': '#d9593c', '鼎': '#b4452c', '包': '#2a2724', '囊': '#5a3e2b', '煤': '#2a2724', '鐵': '#8a5a3a', '網': '#5a86a8', '罟': '#4f7a9c', '罾': '#446e90', '路': '#c9b27a', '門': '#9a7a55', '井': '#4a6f8f',
    '棉': '#e8e2d0', '礫': '#b9b4a8', '磚': '#9a5a40', '墟': '#8a8378', '窗': '#c09a6a', '沼': '#6b6a3c', '棧': '#9a6b45', '床': '#a06a4a', '漁': '#5a86a8', '麻': '#a9b07a', '偶': '#b08a5a', '櫃': '#7a4e2d', '舟': '#7a4e2d',
    '塔': '#2a2724', '寺': '#5a3e2b', '船': '#5a3e2b', '泉': '#4a6f8f', '墓': '#6e6c75', '洞': '#2a2724', '燈': '#e0a020',
    '漠': '#e3cf98', '丘': '#d6bb7a', '池': '#5f9cc0', '棗': '#7d9a55', '熔': '#d2502a', '岩': '#5d5a62', '燧': '#2a2622', '曜': '#2b2133', '川': '#5f9cc0', '湖': '#5a92b8', '湯': '#8cc3d0', '窟': '#3a3028'   // v0.7
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
      const a = alpha === undefined ? 1 : alpha;
      if (a < 1) ctx.globalAlpha = a;
      ctx.drawImage(this.glyph(ch, color), -size * 0.65, -size * 0.65, size * 1.3, size * 1.3);
      if (a < 1) ctx.globalAlpha = 1;
      ctx.setTransform(s, 0, 0, s, 0, 0);
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
      if (this.shake > 0) { this.shake -= dt; ox += (Math.random() - 0.5) * 10 * this.shake; oy += (Math.random() - 0.5) * 10 * this.shake; }

      // —— 宣紙隨世界滾動
      if (!this.pattern) this.pattern = ctx.createPattern(this.paper, 'repeat');
      ctx.save(); ctx.translate(ox, oy); ctx.fillStyle = this.pattern; ctx.fillRect(-ox - 2, -oy - 2, w + 4, h + 4); ctx.restore();

      const x0 = Math.floor(-ox / T) - 1, x1 = Math.floor((w - ox) / T) + 1;
      const y0 = Math.floor(-oy / T) - 1, y1 = Math.floor((h - oy) / T) + 1;
      const lights = [];
      const act = g.action;

      // —— 地上的字
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const ch = world.get(x, y);
        const burning = world.isBurning(x, y);
        const d = DB[ch];
        const lit = ch === '灶' && world.stoveLit(x, y);
        const lr = ch === '燈' && world.isBig(x, y) ? 10 : d.light;   // 島外那盞燈塔照得最遠（v0.6.10 起燈都多照一格：燈 6、燈塔 10）
        let lavaSkip = false;   // 熔岩連成一片：每二乘二只點一盞（那一塊裡第一格熔岩，半徑 4），光差不多、算得少到四分之一；落單的熔岩照樣亮（v0.7）
        if (d.lava) { const bx = x & ~1, by = y & ~1; for (const [cx, cy] of [[bx, by], [bx + 1, by], [bx, by + 1], [bx + 1, by + 1]]) if (DB[world.get(cx, cy)].lava) { lavaSkip = cx !== x || cy !== y; break; } }
        if (!lavaSkip && (lr > 0 || burning || lit)) lights.push({ x, y, r: Math.max(d.lava ? 4 : lr, burning ? 2.5 : 0, lit ? 3 : 0), c: burning || d.kind === 'fire' || d.lava ? FIRE : lit ? STOVE : lr >= 9 ? BEACON : LAMP });
        if (ch === '白' || world.isBig(x, y) || (ch === '舟' && world.shipCells.has(U.key(x, y)))) continue;      // 大字地標、停著的船整體另畫
        const r = U.hash2(x, y, 99);
        let rot = ((r & 255) / 255 - 0.5) * 0.16, scale = (0.84 + ((r >>> 8) & 255) / 255 * 0.16) * d.vis[0];
        let dx = ((r >>> 16) & 255) / 255 * 4 - 2, dy = ((r >>> 24) & 255) / 255 * 4 - 2, alpha = d.vis[1];
        if (d.kind === 'water') dy += Math.sin(now * 1.6 + x * 0.9 + y * 1.3) * 1.8;
        if (d.kind === 'fire' || burning) { scale *= 1 + 0.1 * Math.sin(now * 15 + r); rot += Math.sin(now * 9 + (r & 31)) * 0.06; }
        if (ch === '明' || ch === '日') scale *= 1 + 0.04 * Math.sin(now * 3 + r);
        if (burning) alpha = 1;
        if (act && act.type === 'gather' && act.x === x && act.y === y) { const pr = act.t / act.dur; alpha *= 1 - pr * 0.85; scale *= 1 - pr * 0.35; rot += pr * 0.5; }
        const color = burning && d.kind !== 'fire' ? G.INK.red : (ch === '灶' && !lit ? G.INK.ash : (ch === '窗' || ch === '門') && world.wallHurt(x, y) ? G.INK.red : d.ink);   // 窗門撞剩一半：字變紅
        if (ch.length > 1) {   // 雙字之物（木屋）：兩個字並排寫小一點
          this.drawGlyph(ch[0], color, ox + x * T + T * 0.3, oy + y * T + T / 2 + dy, T * scale * 0.62, rot, alpha);
          this.drawGlyph(ch[1], color, ox + x * T + T * 0.7, oy + y * T + T / 2 + dy, T * scale * 0.62, rot, alpha);
        } else this.drawGlyph(ch, color, ox + x * T + T / 2 + dx, oy + y * T + T / 2 + dy, T * scale, rot, alpha);
        if ((burning && d.kind !== 'fire') || lit) this.drawGlyph('火', G.INK.red, ox + x * T + T * 0.74, oy + y * T + T * 0.3, T * 0.45 * (1 + 0.15 * Math.sin(now * 13 + r)), rot, 0.95);
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
          if (e.mode === 'tied') this.drawGlyph('繳', G.INK.red, px + T * 0.7, py - T * 0.6, T * 0.45, 0, 0.9);   // 被彤弓素矰的絲纏住（v0.8.25）
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
          const rl = g.ents.riled(e), big = rl ? 1.12 : 1;   // 惹了：發紅、大一圈（v0.7.3）
          this.drawGlyph('牛', rl ? G.INK.red : d.ink, cx, cy, T * 0.95 * big, 0, 1, 0.8 + 1.15 * hw, 0.8 + 1.15 * (1 - hw));
          if (e.provoked > 0 && U.cheb(e.x, e.y, p.x, p.y) <= 7) { ctx.save(); ctx.fillStyle = G.INK.red; ctx.font = 'bold ' + Math.round(T * 0.42) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('怒', px + T * 0.4, py - T * 0.42); ctx.restore(); }
          continue;
        }
        // 主動找人的獸（v0.7.2）：豹、狼、野豬、毒蛛畫大一號，比虎小一點；蛇照舊。半友好的（無毒蛛、蟾、沒馴的鷹）被惹了也發紅、大一號（v0.7.3）
        const riled = g.ents.riled(e);
        const size = e.type === '虎' ? 0.95 : e.type === '龍' ? 1.1 : (e.type === '豹' || e.type === '狼' || e.type === '豬' || (e.type === '蛛' && e.venom) || riled) ? 0.85 : e.type === '鹿' ? 0.8 : e.type === '魚' ? 0.6 : 0.55;
        const bobY = e.type === '鳥' ? Math.sin(now * 5 + e.bob) * 3 : e.type === '龍' ? Math.sin(now * 3 + e.bob) * 4 : e.type === '魚' ? Math.sin(now * 2 + e.bob) * 1.5 : 0;
        if (e.type === '龍') lights.push({ x: e.x, y: e.y, cx: e.rx + 0.5, cy: e.ry + 0.5, r: 3, c: DRAGON });
        const rot = e.type === '魚' ? Math.sin(now * 2 + e.bob) * 0.2 : 0;
        if (e.type === '虎' && e.calm <= 0 && U.cheb(e.x, e.y, p.x, p.y) <= 8) {
          ctx.save(); ctx.fillStyle = 'rgba(180,57,42,0.12)'; ctx.beginPath(); ctx.arc(px, py, T * 0.6, 0, 7); ctx.fill(); ctx.restore();
        }
        this.drawGlyph(e.type, ((e.type === '蟾' || e.type === '蛛') && e.venom) || riled ? G.INK.red : d.ink, px, py + bobY, T * size, rot, 1);
        if (e.provoked > 0 && U.cheb(e.x, e.y, p.x, p.y) <= 7) { ctx.save(); ctx.fillStyle = G.INK.red; ctx.font = 'bold ' + Math.round(T * 0.42) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('怒', px + T * 0.4, py - T * 0.42); ctx.restore(); }   // 被彈弓惹惱、七格內要撲過來的
      }
      // —— 彈弓的準星：手持彈弓時，面前九格內會被打到的那隻
      { const st = (g.slingTarget && g.slingTarget()) || (g.skyTarget && g.skyTarget());   // v0.8.25：彤弓素矰也畫準星
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
        if (f.type === 'write') {
          this.drawGlyph(f.ch, f.color, px, py, T * (1.6 - 0.6 * pr), (1 - pr) * 0.4, pr * 0.9);
          ctx.save(); ctx.strokeStyle = 'rgba(180,57,42,' + (0.6 * (1 - pr)) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, T * (0.3 + 0.5 * pr), 0, 7); ctx.stroke(); ctx.restore();
        } else if (f.type === 'shot' && f.arrow) {   // 彤弓素矰的矰（v0.8.25）：一道朱紅的線，後面拖著白絲
          const ax = ox + f.x * T + T / 2, ay = oy + f.y * T + T / 2, qx = ox + (f.x + (f.x1 - f.x) * pr) * T + T / 2, qy = oy + (f.y + (f.y1 - f.y) * pr) * T + T / 2;
          ctx.save(); ctx.strokeStyle = 'rgba(240,236,226,0.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(qx, qy); ctx.stroke();
          const ang = Math.atan2(qy - ay, qx - ax); ctx.strokeStyle = G.INK.red; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(qx - Math.cos(ang) * T * 0.45, qy - Math.sin(ang) * T * 0.45); ctx.lineTo(qx, qy); ctx.stroke(); ctx.restore();
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

      // —— 霧障：一片片白霧順著風飄
      if (world.fogs.size || this.fogSeen.size) this.drawFog(g, ox, oy, x0, x1, y0, y1, dt, now);
      // —— 夜色與光：光照圖平滑放大蓋上去；光源再點一個亮芯
      const dark = g.viewDark();   // 洞窟裡白天也黑（v0.7）
      this.rainA = (this.rainA || 0) + ((world.raining() ? 1 : 0) - (this.rainA || 0)) * Math.min(1, dt / 1.5);   // 起雨收雨各淡入淡出一息半
      const glowK = Math.max(dark, 0.55 * this.rainA);   // 下雨的白天，燈也透出一點微光（v0.6.4）
      if (g.torchLit()) lights.push({ x: p.x, y: p.y, cx: p.rx + 0.5, cy: p.ry + 0.5, r: 3, c: TORCH });
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
      for (const z of heard) { const r = (z.ext || z.r) + 10; x0 = Math.min(x0, z.x - r); y0 = Math.min(y0, z.y - r); x1 = Math.max(x1, z.x + r); y1 = Math.max(y1, z.y + r); }
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
      // 北、比例
      m.font = F(3.5, 14); m.fillStyle = '#4a4238'; m.fillText('北', S - 22, 20);
      m.strokeStyle = '#4a4238'; m.lineWidth = 1.5; m.beginPath(); m.moveTo(S - 22, 32); m.lineTo(S - 22, 52); m.stroke();
      const bar = [10, 25, 50, 100, 250, 500].find(v => v * px >= 50) || 500;
      m.beginPath(); m.moveTo(14, S - 16); m.lineTo(14 + bar * px, S - 16); m.stroke(); m.font = '12px ' + FONT; m.textAlign = 'left'; m.fillText(bar + ' 格', 14, S - 28);
    }
  }

  window.Renderer = Renderer;
})();
