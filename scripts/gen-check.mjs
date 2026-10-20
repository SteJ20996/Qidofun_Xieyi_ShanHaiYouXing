// 多種子生成檢查：每座島都要「玩得下去」——出生點走得到基本資源、八處地標都在且走得到、五塊碑漲潮也走得到（v0.8.9）、漠島有綠洲雪島有溫泉（v0.8.9）、
// 山裡有煤有鐵、燈塔只有退潮走得到；v0.7 起另查：原本的陸地一格不動、陸地平均多四成五、外島五種都有。
// v0.8.4 起另查四方地界：陸的島心方圓 r 格都走得上去、上得了岸；水的方圓 r 格都是水、洞庭開得進船；不周山方圓 solid 格（v0.8.5 起 102）都是陸地、盆地走得出缺口。
// v0.8.27 起三個生成版本都查（第三版是大陸與島：陸地三成五到四成五、傳送點網的間距與地界外圈、一千二百格以上的陸塊）。
// v0.8.26 起兩個生成版本都查（舊存檔第一版、新開的島第二版）：第二版另查孤嶼——每座的中心是陸地、不碰本島方框外島地界與戰場；本島兩版一格不差；印整張紙的陸地比例。
// 不用瀏覽器，直接在 Node 裡載入 util／glyphs／world。
// 用法：node scripts/gen-check.mjs [種子數=40] [起始種子=1] [生成版本=兩版都查]
import vm from 'node:vm';
import fs from 'node:fs';
for (const f of ['util', 'glyphs', 'world']) vm.runInThisContext(fs.readFileSync(new URL('../src/' + f + '.js', import.meta.url), 'utf8'), { filename: f + '.js' });
const G = globalThis.G, World = globalThis.World, DB = G.DB, DAY = World.DAY;
const N = +process.argv[2] || 40, S0 = +process.argv[3] || 1, GENS = process.argv[4] ? [+process.argv[4]] : [1, 2, 3];
// v0.4 起島的面積加倍：可達範圍與礦的下限跟著加倍
const NEED = { '木林森': 30, '草': 60, '石山磊': 20, '礫': 8, '棉': 6, '麻': 3, '果': 4 }, ORE = { '煤': 32, '鐵': 32 }, REACH = 3000;
let bad = 0, sumOld = 0, sumNew = 0, gen = 1;

function reach(w, sp, dig) {      // 從出生點能走到的格子（用遊戲自己的 walkable，所以潮汐算在內）；dig 時山石礦也算能過（有鎬）
  const seen = new Set([sp.x + ',' + sp.y]), q = [[sp.x, sp.y]], R = G.HOME_R + 10;   // v0.7 島擴了，照本島的範圍
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || Math.abs(nx) > R || Math.abs(ny) > R) continue;
      if (w.walkable(nx, ny) || (dig && '山磊煤鐵'.indexOf(w.get(nx, ny)) >= 0)) { seen.add(k); q.push([nx, ny]); }
    }
  }
  return seen;
}
function touches(set, x0, y0, w0, h0) {   // 可達集合是否貼著這塊地標
  for (let j = -1; j <= h0; j++) for (let i = -1; i <= w0; i++) if (set.has((x0 + i) + ',' + (y0 + j))) return true;
  return false;
}
// v0.8.4 四方地界
const DIRS = { '青龍': [1, 0], '修蛇': [1, 0], '白虎': [-1, 0], '封豨': [-1, 0], '朱雀': [0, 1], '大風': [0, 1], '玄武': [0, -1], '共工': [-1, -1] };
let zoneStat = { forced: 0, merged: 0 }, landStat = { share: 0, sk: 0 };
const homeRef = {};   // 第一版的本島（v0.8.26：第二版要一格不差）
const wet = (t) => DB[t].kind === 'water', walk = (t) => DB[t].walk > 0 && !wet(t);
function zoneProbs(seed, probs) {
  const zs = G.zones(seed);
  if (zs.length !== 8) probs.push('地界只有 ' + zs.length + ' 處');
  for (const z of zs) {
    const tag = '地界「' + z.name + '」', [ux, uy] = DIRS[z.id], T = (x, y) => G.baseTile(x, y, seed);
    if (z.forced) { zoneStat.forced++; probs.push(tag + '找不到外島碰不到的海，壓上去了'); }
    if (ux * z.x + uy * z.y < 0.6 * Math.hypot(z.x, z.y) * Math.hypot(ux, uy)) probs.push(tag + '不在' + (z.id === '共工' ? '西北' : '該在的方位') + '（' + z.x + ', ' + z.y + '）');
    if (Math.max(Math.abs(z.x), Math.abs(z.y)) + z.ext > G.WORLD_R || Math.max(Math.abs(z.x), Math.abs(z.y)) - z.ext < 170) probs.push(tag + '出了紙或碰到本島');
    for (const o of zs) if (o !== z && Math.hypot(z.x - o.x, z.y - o.y) < z.ext + o.ext) probs.push(tag + '和「' + o.name + '」疊在一起');
    const R = z.solid, reefKeys = new Set(z.type === 'deep' ? G.reefs(seed).flat().map(([x, y]) => x + ',' + y) : []); let bad = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) continue; const t = T(z.x + dx, z.y + dy);
      if (z.type === 'land' ? !walk(t) : z.type === 'peak' ? wet(t) : !wet(t) && !(z.type === 'deep' && reefKeys.has((z.x + dx) + ',' + (z.y + dy)))) bad++;   // 龍淵那一圈小礁（v0.8.24）不算
    }
    if (bad) probs.push(tag + '方圓 ' + R + ' 格裡有 ' + bad + ' 格不是' + (z.type === 'land' ? '走得上去的陸地' : z.type === 'peak' ? '陸地' : '水'));
    if (z.type === 'deep' && T(z.x, z.y) !== '淼') probs.push(tag + '中心不是深水');
    if (z.type === 'deep') {   // v0.8.24 龍淵的小礁：每個四到十格，都在十五到二十格那一圈，每個至少有一格放得了灶鼎；v0.8.25 起二到五個、彼此隔五格水
      const rs = G.reefs(seed); zoneStat.reefs = (zoneStat.reefs || 0) + rs.length;
      if (rs.length < G.REEF_MIN || rs.length > G.REEF_MAX) probs.push(tag + '小礁有 ' + rs.length + ' 個');
      rs.forEach((cells, i) => {
        if (cells.length < G.REEF_AREA[0] || cells.length > G.REEF_AREA[1]) probs.push(tag + '第 ' + (i + 1) + ' 個小礁 ' + cells.length + ' 格');
        if (cells.some(([x, y]) => { const d = Math.hypot(x - z.x, y - z.y); return d < G.REEF_RING[0] || d > G.REEF_RING[1]; })) probs.push(tag + '第 ' + (i + 1) + ' 個小礁出了那一圈');
        if (!cells.some(([x, y]) => { const k = G.DB[T(x, y)].kind; return k === 'ground' || k === 'plant'; })) probs.push(tag + '第 ' + (i + 1) + ' 個小礁沒有放得了灶鼎的地');
        rs.forEach((o, j) => { if (j > i && cells.some(([x, y]) => o.some(([u, v]) => Math.max(Math.abs(x - u), Math.abs(y - v)) <= G.REEF_GAP))) probs.push(tag + '第 ' + (i + 1) + '、' + (j + 1) + ' 個小礁隔不到五格水'); });
      });
    }
    // 走得通：陸的從島心走到岸邊（貼著水的格子）；洞庭從外海開方舟（三乘三都是水）進到湖心
    const ext = z.ext + 4, inside = (x, y) => (x - z.x) ** 2 + (y - z.y) ** 2 <= ext * ext;
    if (z.type === 'land' || z.type === 'peak') {
      const seen = new Set([z.x + ',' + z.y]), q = [[z.x, z.y]]; let shore = false;
      while (q.length && !shore) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (seen.has(k) || !inside(nx, ny)) continue; const t = T(nx, ny); if (wet(t) && t !== '湖' && t !== '池' && t !== '川') { shore = true; break; } if (walk(t)) { seen.add(k); q.push([nx, ny]); } } }
      if (!shore) probs.push(tag + '從島心走不到海邊');
      if (z.type === 'peak') { let m = 0; for (const isl of G.isles(seed)) if (Math.hypot(isl.cx - z.x, isl.cy - z.y) < z.ext + isl.R * 1.25) m++; zoneStat.merged += m; }
    }
    if (z.type === 'lake') {
      const open = (x, y) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (!wet(T(x + i, y + j))) return false; return true; };
      const sx = z.x + ext - 2, seen = new Set([sx + ',' + z.y]), q = [[sx, z.y]]; let core = false;
      if (!open(sx, z.y)) probs.push(tag + '外面不是開闊的海');
      while (q.length && !core) { const [x, y] = q.pop(); if (Math.hypot(x - z.x, y - z.y) < 10) { core = true; break; } for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (seen.has(k) || !inside(nx, ny)) continue; seen.add(k); if (open(nx, ny)) q.push([nx, ny]); } }
      if (!core) probs.push(tag + '方舟開不進湖心');
    }
  }
}
function gen3Probs(seed, probs) {   // v0.8.27 第三版：陸地比例（不連外海、二百格以下的小水算陸）、陸塊、傳送點網、地域
  const ST = 10, W = Math.ceil(2 * G.WORLD_R / ST), wt = new Uint8Array(W * W), lab = new Int32Array(W * W), q = new Int32Array(W * W);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) wt[j * W + i] = wet(G.natTile(-G.WORLD_R + i * ST, -G.WORLD_R + j * ST, seed)) ? 1 : 0;
  let sea = 0;
  for (let k0 = 0; k0 < W * W; k0++) { if (!wt[k0] || lab[k0]) continue; let qh = 0, qt = 0, edge = false; q[qt++] = k0; lab[k0] = 1;
    while (qh < qt) { const k = q[qh++], i = k % W, j = (k - i) / W; if (!i || !j || i === W - 1 || j === W - 1) edge = true; for (const nk of [i > 0 ? k - 1 : -1, i < W - 1 ? k + 1 : -1, j > 0 ? k - W : -1, j < W - 1 ? k + W : -1]) if (nk >= 0 && wt[nk] && !lab[nk]) { lab[nk] = 1; q[qt++] = nk; } }
    if (edge || qt * ST * ST > 200) sea += qt; }
  const share = 1 - sea / (W * W); landStat.share += share;
  if (share < 0.35 || share > 0.45) probs.push('陸地佔 ' + (share * 100).toFixed(1) + '%（要三成五到四成五）');
  const big = G.masses(seed).list.filter(m => m.area > G.MASS_MIN && !m.home && !m.zone); landStat.masses = (landStat.masses || 0) + big.length;
  if (big.length < 5) probs.push('一千二百格以上的陸塊只有 ' + big.length + ' 塊');
  const gs = G.gateNet(seed).list; landStat.gates = (landStat.gates || 0) + gs.length;
  if (!gs.some(g => g.home)) probs.push('原點附近沒有傳送點');
  let pair = 0, far = 0;
  for (const a of gs) { let nd = Infinity; for (const b of gs) if (a !== b) { const d = Math.hypot(a.x - b.x, a.y - b.y); nd = Math.min(nd, d); if (a.id < b.id && d < (a.type === 'sea' && b.type === 'sea' ? G.GATE_SEA_MIN : G.GATE_LAND_MIN)) pair++; }
    if (nd > (a.type === 'sea' ? G.GATE_SEA_MAX : G.GATE_LAND_MAX)) far++;
    const t = G.natTile(a.x, a.y, seed); if (a.type === 'land' ? !walk(t) : t !== '淼' && t !== '水') probs.push('傳送點 ' + a.id + ' 擺在「' + t + '」上');
    if (a.type === 'land' && !a.home) { const m = G.massAt(a.x, a.y, seed); if (!m || m.area <= G.MASS_MIN) probs.push('傳送點 ' + a.id + ' 不在一千二百格以上的陸塊上'); } }
  if (pair) probs.push(pair + ' 對傳送點太近');
  if (far) probs.push(far + ' 個傳送點最近的一個太遠');
  for (const z of G.zones(seed)) { const T = G.zoneTerr(z), n = gs.filter(g => { const d = Math.hypot(g.x - z.x, g.y - z.y); return d >= T && d <= T + G.GATE_RING; }).length; if (n < 1 || n > G.GATE_RING_MAX) probs.push('「' + z.name + '」外圈有 ' + n + ' 個傳送點'); if (gs.some(g => Math.hypot(g.x - z.x, g.y - z.y) < T)) probs.push('「' + z.name + '」的地界裡有傳送點'); }
  { const P = G.namePools(seed), all = P.mass.concat(P.land, P.sea);   // v0.8.28 地名池：陸塊、陸上、海上各比這張紙上要取名的多，三池不重複
    for (const k of ['mass', 'land', 'sea']) if (P[k].length < P.counts[k] + 12) probs.push('地名池「' + k + '」' + P[k].length + ' 個，要取名的有 ' + P.counts[k] + ' 個');
    if (new Set(all).size !== all.length) probs.push('地名池有重複的名字'); }
  const rg = G.isles(seed); if (!rg.some(i => i.kind === '火')) probs.push('沒有火山的地域（畢方）'); if (!rg.some(i => i.cx < -300)) probs.push('西邊沒有陸上的地域（鑿齒）');
}
function skerryProbs(seed, probs) {   // v0.8.26 孤嶼（只有第二版）
  const sk = G.skerries(seed), zs = G.zones(seed), isl = G.isles(seed); landStat.sk += sk.length;
  if (gen < 2) { if (sk.length) probs.push('第一版不該有孤嶼（有 ' + sk.length + ' 座）'); return; }
  if (sk.length < (gen >= 3 ? 100 : 1000)) probs.push('孤嶼只有 ' + sk.length + ' 座');
  let center = 0, home = 0, near = 0, zone = 0;
  for (const it of sk) {
    const t0 = G.baseTile(it.cx, it.cy, seed);   // 島心是陸地；泉嶼的島心是池，池邊一圈要有陸地
    if (it.kind === '泉' ? t0 !== '池' || ![[3, 0], [-3, 0], [0, 3], [0, -3]].some(([dx, dy]) => !wet(G.baseTile(it.cx + dx, it.cy + dy, seed))) : wet(t0)) center++;
    if (Math.max(Math.abs(it.cx), Math.abs(it.cy)) - it.r - G.SKERRY_SHOAL <= G.HOME_R + 10) home++;
    if (gen >= 3 ? [[0, 0], [it.r + 5, 0], [-it.r - 5, 0], [0, it.r + 5], [0, -it.r - 5]].some(([dx, dy]) => G.contLand(it.cx + dx, it.cy + dy, seed)) : isl.some(o => Math.hypot(it.cx - o.cx, it.cy - o.cy) < o.R * 1.25 + it.r + G.SKERRY_SHOAL)) near++;
    if (zs.some(z => Math.hypot(it.cx - z.x, it.cy - z.y) < Math.max(z.ext, z.ground || 0) + it.r + G.SKERRY_SHOAL)) zone++;
  }
  if (center) probs.push(center + ' 座孤嶼的島心是水（泉嶼是池邊沒有陸地）');
  if (home) probs.push(home + ' 座孤嶼碰到本島');
  if (near) probs.push(near + ' 座孤嶼貼進' + (gen >= 3 ? '大陸' : '外島的範圍'));
  if (zone) probs.push(zone + ' 座孤嶼進了地界或戰場');
}
for (const g of GENS) {
gen = G.setGen(g); sumOld = 0; sumNew = 0; zoneStat = { forced: 0, merged: 0 }; landStat = { share: 0, sk: 0 };
console.log('—— 第' + '一二三'.charAt(gen - 1) + '版生成（' + ['舊存檔', 'v0.8.26 開的存檔', '新開的島'][gen - 1] + '）——');
for (let seed = S0; seed < S0 + N; seed++) {
  const w = new World(seed), sp = w.findSpawn(), probs = [];
  if (w.places.length !== 8) probs.push('地標只有 ' + w.places.length + ' 處');
  w.time = DAY * 0.5; const low = reach(w, sp);
  w.time = DAY * 0.83; const high = reach(w, sp);
  if (low.size < REACH) probs.push('退潮可達範圍只有 ' + low.size + ' 格');
  // 可達範圍裡的資源（看底稿加差異層，灘以退潮算）
  const cnt = {}; for (const k of low) { const [x, y] = k.split(',').map(Number); for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = w.raw(x + dx, y + dy); for (const g in NEED) if (g.indexOf(c) >= 0) cnt[g] = (cnt[g] || 0) + 1; } }
  for (const g in NEED) if ((cnt[g] || 0) < NEED[g]) probs.push('可達的「' + g + '」只有 ' + (cnt[g] || 0) + '（要 ' + NEED[g] + '）');
  w.time = DAY * 0.5; const dug = reach(w, sp, true); for (const k of dug) { const c = w.raw(...k.split(',').map(Number)); if (ORE[c] !== undefined) cnt[c] = (cnt[c] || 0) + 1; }
  for (const g in ORE) if ((cnt[g] || 0) < ORE[g]) probs.push('挖得到的「' + g + '」只有 ' + (cnt[g] || 0) + '（要 ' + ORE[g] + '）');
  for (const pl of w.places) {
    const ok = pl.id === 'deng' ? touches(low, pl.x, pl.y, pl.w, pl.h) && !touches(high, pl.x, pl.y, pl.w, pl.h) : touches(low, pl.x, pl.y, pl.w, pl.h);
    if (!ok) probs.push(pl.id === 'deng' ? '燈塔不是「只有退潮走得到」（退潮 ' + touches(low, pl.x, pl.y, pl.w, pl.h) + '，漲潮 ' + touches(high, pl.x, pl.y, pl.w, pl.h) + '）' : '地標「' + pl.name + '」走不到');
  }
  if (w.steles.size !== 5) probs.push('碑只有 ' + w.steles.size + ' 塊');
  // v0.8.9：五塊碑漲潮時也走得到（走不到的開了一條路）；每座漠島有綠洲的池、每座雪島有溫泉
  for (const st of w.steles.values()) if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => high.has((st.x + dx) + ',' + (st.y + dy)))) probs.push('碑（' + st.x + ', ' + st.y + '）漲潮時走不到');
  for (const isl of G.isles(seed)) if ((isl.kind === '漠' || isl.kind === '雪') && !G.zoneAt(isl.cx, isl.cy, seed)) { const wl = G.isleWell(isl, seed), t = G.natTile(wl.x, wl.y, seed); if (G.zoneAt(wl.x, wl.y, seed)) continue; if (gen >= 3 && (!G.contLand(wl.x, wl.y, seed) || G.regionAt(wl.x, wl.y, seed) !== isl)) continue; if (t !== (isl.kind === '漠' ? '池' : '湯')) probs.push((isl.kind === '漠' ? '漠島沒有綠洲' : '雪島沒有溫泉') + '（' + wl.x + ', ' + wl.y + ' 是「' + t + '」）'); }
  // v0.7：原本的陸地一格不動；擴出去的陸地；外島
  let oldLand = 0, newLand = 0, moved = 0;
  let homeDiff = 0; const ref = homeRef[seed] || (gen === 1 ? (homeRef[seed] = []) : null);
  for (let y = -140, i = 0; y <= 140; y++) for (let x = -140; x <= 140; x++, i++) { const a = G.oldTile(x, y, seed), b = G.natTile(x, y, seed); if (DB[a].kind !== 'water') { oldLand++; if (a !== b) moved++; } if (DB[b].kind !== 'water') newLand++; if (gen === 1) ref[i] = b; else if (ref && ref[i] !== b) homeDiff++; }
  if (moved) probs.push('原本的陸地有 ' + moved + ' 格變了');
  if (homeDiff) probs.push('本島跟第一版有 ' + homeDiff + ' 格不同');
  if (gen < 3) { let n = 0, l = 0; for (let y = -G.WORLD_R; y < G.WORLD_R; y += 10) for (let x = -G.WORLD_R; x < G.WORLD_R; x += 10) { n++; if (!wet(G.baseTile(x, y, seed))) l++; } landStat.share += l / n; }
  else gen3Probs(seed, probs);
  skerryProbs(seed, probs);
  if (newLand < oldLand * 1.15) probs.push('陸地只多了 ' + Math.round((newLand / oldLand - 1) * 100) + '%');
  sumOld += oldLand; sumNew += newLand;
  const kinds = new Set(G.isles(seed).map(i => i.kind)); if (kinds.size < 5) probs.push('外島只有 ' + [...kinds].join('') + ' 幾種');
  zoneProbs(seed, probs);
  if (probs.length) { bad++; console.log('種子 ' + seed + '：' + probs.join('；')); }
  else console.log('種子 ' + seed + '：好。可達 ' + low.size + ' 格，木 ' + cnt['木林森'] + ' 草 ' + cnt['草'] + ' 石 ' + cnt['石山磊'] + ' 棉 ' + cnt['棉'] + ' 麻 ' + cnt['麻'] + ' 果 ' + cnt['果'] + ' 煤 ' + cnt['煤'] + ' 鐵 ' + cnt['鐵']);
}
const ratio = sumNew / sumOld;
console.log('v0.7 本島陸地平均：' + Math.round(sumOld / N) + ' → ' + Math.round(sumNew / N) + ' 格（×' + ratio.toFixed(3) + '）');
if (Math.abs(ratio - 1.45) > 0.05) { bad++; console.log('陸地平均多了 ' + Math.round((ratio - 1) * 100) + '%，不是四成五上下'); }
console.log('v0.8.4 四方地界：壓到外島的 ' + zoneStat.forced + ' 處；不周山平均併進 ' + (zoneStat.merged / N).toFixed(2) + ' 座外島');
console.log('v0.8.25 龍淵小礁：平均 ' + ((zoneStat.reefs || 0) / N).toFixed(2) + ' 個');
console.log('v0.8.26 整張紙的陸地：平均 ' + (landStat.share / N * 100).toFixed(1) + '%；孤嶼平均 ' + Math.round(landStat.sk / N) + ' 座' + (gen >= 3 ? '；v0.8.27 一千二百格以上的陸塊平均 ' + (landStat.masses / N).toFixed(1) + ' 塊、傳送點平均 ' + (landStat.gates / N).toFixed(1) + ' 個' : ''));
}
console.log(bad ? ('有 ' + bad + ' 座島有問題') : ('全部 ' + N + ' 座島都玩得下去'));
process.exit(bad ? 1 : 0);
