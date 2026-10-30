// 量一份存檔各部分佔多少字（v0.9.3；v0.9.21 認得差異層的新寫法）：node scripts/save-size.mjs 存檔.json
// 吃匯出的檔案（{ kind: 'xieyi-save', save }），也吃 localStorage 裡那一格的原文。localStorage 照字數算，Chromium 每個網頁約 518 萬字、八格共用
import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.log('用法：node scripts/save-size.mjs 存檔.json'); process.exit(1); }
const o = JSON.parse(fs.readFileSync(file, 'utf8'));
const s = o && o.kind === 'xieyi-save' ? o.save : o;
if (!s || (s.v !== 5 && s.v !== 6)) { console.log('這不是《山海有形》的存檔。'); process.exit(1); }
const QUOTA = 5177000, len = (v) => JSON.stringify(v === undefined ? null : v).length, total = JSON.stringify(s).length;
const parts = [];
for (const k of Object.keys(s)) if (k !== 'world' && k !== 'player') parts.push([k, len(s[k])]);
for (const k of Object.keys(s.world || {})) parts.push(['world.' + k, len(s.world[k])]);
for (const k of Object.keys(s.player || {})) parts.push(['player.' + k, len(s.player[k])]);
parts.sort((a, b) => b[1] - a[1]);
const pct = (n) => (n / total * 100).toFixed(1) + '%';
console.log('島 #' + s.seed + (o.kind === 'xieyi-save' ? '（' + (o.server || '') + '第 ' + o.slot + ' 格，匯出於 ' + o.exportedAt + '）' : ''));
console.log('總共 ' + total.toLocaleString() + ' 字，約佔瀏覽器空間的 ' + (total / QUOTA * 100).toFixed(1) + '%（八格共用）');
const w = s.world || {};
if (typeof w.ex === 'string') {   // 照 world.js 的 unpackExplored 走一遍，只數塊
  const str = w.ex, B = 0x4E00; let i = 0, acc = 0, n = 0, full = 0, part = 0;
  const get = (bits) => { let v = 0; for (let j = 0; j < bits; j++) { if (!n) { acc = str.charCodeAt(i++) - B; n = 15; } if (acc & 1) v |= 1 << j; acc >>= 1; n--; } return v; };
  while (i + 1 < str.length) { const f = (str.charCodeAt(i) - B) & 1; i += 2; if (f) { full++; continue; } part++; n = 0; for (let r = 0; r < 16; r++) { const t = get(2); if (t === 2) get(8); else if (t === 3) get(16); } n = 0; }
  console.log('走過的地圖：' + str.length.toLocaleString() + ' 字（走滿的塊 ' + full + '、沒走滿的 ' + part + '）');
}
else if (w.explored) console.log('走過的地圖：舊寫法 ' + Object.keys(w.explored).length + ' 塊（v0.9.3 以前；讀進來再存一次就變新寫法）');
if (typeof w.dz === 'string') {   // v0.9.21：差異層與計時器寫成兩串字（world.js 的 packWorld）
  const cells = [...w.dz.replace(/[\x00-\x7f]/g, '')].length, timers = w.tz ? w.tz.split(';').length : 0;
  console.log('改過的地（差異層）：' + cells.toLocaleString() + ' 格，寫成 ' + w.dz.length.toLocaleString() + ' 字；草木長回來的計時器 ' + timers.toLocaleString() + ' 個，寫成 ' + (w.tz || '').length.toLocaleString() + ' 字');
} else console.log('改過的地（差異層）：' + Object.keys(w.diff || {}).length.toLocaleString() + ' 格（v0.9.21 以前的寫法；讀進來再存一次就變新寫法）');
console.log('\n最大的幾項：');
for (const [k, n] of parts.slice(0, 15)) console.log('  ' + k.padEnd(24) + String(n.toLocaleString()).padStart(10) + '  ' + pct(n));
