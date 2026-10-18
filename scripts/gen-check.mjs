// 多種子生成檢查：每座島都要「玩得下去」——出生點走得到基本資源、八處地標都在且走得到、
// 山裡有煤有鐵、燈塔只有退潮走得到；v0.7 起另查：原本的陸地一格不動、陸地平均多四成五、外島五種都有。
// v0.8.4 起另查四方地界：陸的島心方圓 r 格都走得上去、上得了岸；水的方圓 r 格都是水、洞庭開得進船；不周山方圓 solid 格（v0.8.5 起 102）都是陸地、盆地走得出缺口。
// 不用瀏覽器，直接在 Node 裡載入 util／glyphs／world。
// 用法：node scripts/gen-check.mjs [種子數=40] [起始種子=1]
import vm from 'node:vm';
import fs from 'node:fs';
for (const f of ['util', 'glyphs', 'world']) vm.runInThisContext(fs.readFileSync(new URL('../src/' + f + '.js', import.meta.url), 'utf8'), { filename: f + '.js' });
const G = globalThis.G, World = globalThis.World, DB = G.DB, DAY = World.DAY;
const N = +process.argv[2] || 40, S0 = +process.argv[3] || 1;
// v0.4 起島的面積加倍：可達範圍與礦的下限跟著加倍
const NEED = { '木林森': 30, '草': 60, '石山磊': 20, '礫': 8, '棉': 6, '麻': 3, '果': 4 }, ORE = { '煤': 32, '鐵': 32 }, REACH = 3000;
let bad = 0, sumOld = 0, sumNew = 0;

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
let zoneStat = { forced: 0, merged: 0 };
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
    const R = z.solid; let bad = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) continue; const t = T(z.x + dx, z.y + dy);
      if (z.type === 'land' ? !walk(t) : z.type === 'peak' ? wet(t) : !wet(t)) bad++;
    }
    if (bad) probs.push(tag + '方圓 ' + R + ' 格裡有 ' + bad + ' 格不是' + (z.type === 'land' ? '走得上去的陸地' : z.type === 'peak' ? '陸地' : '水'));
    if (z.type === 'deep' && T(z.x, z.y) !== '淼') probs.push(tag + '中心不是深水');
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
  // v0.7：原本的陸地一格不動；擴出去的陸地；外島
  let oldLand = 0, newLand = 0, moved = 0;
  for (let y = -140; y <= 140; y++) for (let x = -140; x <= 140; x++) { const a = G.oldTile(x, y, seed), b = G.baseTile(x, y, seed); if (DB[a].kind !== 'water') { oldLand++; if (a !== b) moved++; } if (DB[b].kind !== 'water') newLand++; }
  if (moved) probs.push('原本的陸地有 ' + moved + ' 格變了');
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
console.log(bad ? ('有 ' + bad + ' 座島有問題') : ('全部 ' + N + ' 座島都玩得下去'));
process.exit(bad ? 1 : 0);
