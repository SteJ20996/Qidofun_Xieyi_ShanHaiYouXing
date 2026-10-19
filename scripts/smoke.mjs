// 冒煙測試：無頭瀏覽器裡跑一遍核心玩法（採集、製作、磨礪、放置、戰鬥、睡覺、發酵、魄夜、毒、稻草人、愜意、膽氣、瓶酒、櫃、船、地標、潮汐、存檔），截圖並檢查報錯。
// 用法：先 `python3 -m http.server 8123`，再 `NODE_PATH=$(npm root -g) node scripts/smoke.mjs [url] [outdir]`
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;

const url = process.argv[2] || 'http://127.0.0.1:8123/index.html?autostart=1&seed=7';
const out = process.argv[3] || 'shots';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.XIEYI && !window.XIEYI.game.paused, null, { timeout: 15000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: out + '/01-day.png' });

const result = await page.evaluate(async () => {
  const g = XIEYI.game, p = g.player, w = g.world, DAY = XIEYI.DAY, checks = [], r = {};
  const ok = (name, cond, info) => checks.push((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : ''));
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const press = (code, ms) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); return sleep(ms || 30).then(() => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))); };
  const face = (dx, dy) => { p.fx = dx; p.fy = dy; };
  const T = () => ({ x: p.x + p.fx, y: p.y + p.fy });
  const hold = (n) => { if (g.isShip(n)) { p.holdSel = (p.hold || []).findIndex(s => s.n === n); g.holdSig = ''; return p.holdSel >= 0; }   // v0.8.19 船在船艙
    const ti = p.tools.findIndex(s => s.n === n); if (ti >= 0) { p.tool = ti; return true; } const i = p.bag.findIndex(s => s.n === n); p.sel = i < 0 ? 0 : i; return i >= 0; };
  const tool = (n) => p.tools.find(s => s.n === n);
  const unarm = () => { p.tool = -1; };
  const bag = () => p.bag.map(s => s.n + '×' + s.c + (s.dur !== undefined ? '(' + s.dur + ')' : '')).join(',');
  const clearBag = () => { p.bag = []; p.sel = 0; };
  const trim = (keep) => { p.bag = p.bag.filter(s => keep.indexOf(s.n) >= 0); p.sel = 0; g.barSig = ''; };
  const toasts = () => document.getElementById('toasts').textContent;
  const hidden = (id) => document.getElementById(id).classList.contains('hidden');
  const bagCells = () => [...document.querySelectorAll('#bagbar .slot')].reduce((a, e) => a + (+e.style.getPropertyValue('--span') || 1), 0);   // 船一艘一條寬格（v0.8.3），照寬算格數
  const takeYes = () => { if (!hidden('takeask')) document.getElementById('takeask-yes').click(); };   // 拆人造的東西會先問，測試裡直接答「拆」
  const calm = () => { p.san = 100; p.insane = false; p.ctrl = true; p.zeroSan = 0; p.hp = Math.max(p.hp, 60); p.knock = 0; setDay(0.53); g.ents.list = g.ents.list.filter(e => e.type !== '魄'); g.action = null; g.keys.clear(); };   // 測試裡真實時間會過，夜裡魄把愜意吸到零人就「手腳不聽使喚」；長等待之後先弄清醒
  const goNextTo = (x, y) => { w.set(x - 1, y, '草'); p.x = p.rx = x - 1; p.y = p.ry = y; face(1, 0); };
  const setDay = (frac) => { w.time = Math.floor(w.time / DAY) * DAY + DAY * frac; };
  const until = async (cond, ms) => { const t0 = performance.now(); while (!cond() && performance.now() - t0 < (ms || 8000)) await sleep(40); return cond(); };
  const gather = async (ch) => { face(0, 1); w.set(T().x, T().y, ch); g.action = null; g.pressGather(); await until(() => !g.action, 12000); };

  try {
  g.ents.seaP = 0;   // 蜃也是：專門的海上測試自己開
  g.ents.toothP = 0; g.ents.harpyP = 0; g.ents.birdP = 0;   // 鑿齒（v0.8.5）、蠱雕（v0.8.6）、畢方（v0.8.25）也是：專門的測試自己開
  w.fogP = 0;   // 霧障是真隨機的，測試途中跳出彈窗會把遊戲停住；專門的霧障測試自己開
  g.warnEnabled = false; w.fogStep = 1e9;   // 數值提醒的彈窗與霧障的挪動也先關掉，各自的測試再開
  g.ents.snuffP = 0; g.ents.dashT = 1e9;   // 魄吹燈與撲燈也是真隨機、真時間：專門的測試自己開
  // ============ A. 島與採集 ============
  ok('v0.7: the old island keeps radius 85; the paper is 2500×2500 and the sea around the home island is deep', G.ISLAND_R === 85 && G.WORLD_R === 1250 && w.get(0, 160) === '淼' && w.get(-170, 0) === '淼' && w.get(0, 1300) === '淼');
  ok('eight landmarks placed', w.places.length === 8, w.places.map(x => x.name).join(''));
  ok('five steles', w.steles.size === 5);
  const sp0 = [p.x, p.y]; await press('KeyD', 600); await sleep(300);
  ok('walked', p.x !== sp0[0] || p.y !== sp0[1]);
  clearBag();
  await gather('木');
  ok('gathering 木 gives 木 and leaves blank', g.count('木') === 1 && w.get(T().x, T().y) === '白', bag());
  await gather('棉');
  ok('gathering 棉 gives 棉×2, leaves 草', g.count('棉') === 2 && w.get(T().x, T().y) === '草', bag());
  await gather('礫');
  ok('gathering 礫 gives 石子×2, leaves 沙', g.count('石子') === 2 && w.get(T().x, T().y) === '沙', bag());
  await gather('石');
  ok('gathering 石 by hand takes 3 s', g.count('石') >= 1, bag());
  face(0, 1); w.set(T().x, T().y, '山'); g.pressGather(); await sleep(50);
  ok('山 needs a pickaxe', !g.action && w.get(T().x, T().y) === '山');
  await gather('果');
  const fruit = p.bag.find(s => s.n === '果');
  ok('gathering 果 stamps each piece with the day', fruit && fruit.c === 2 && Array.isArray(fruit.ds) && fruit.ds.length === 2 && fruit.ds.every(d => d === g.day()) && w.get(T().x, T().y) === '木', bag());
  p.food = 50; hold('果'); g.useItem();
  ok('fresh 果 is edible (+20)', Math.round(p.food) === 70 && g.count('果') === 1, [p.food, g.count('果')]);

  // ============ B. 製作與磨礪 ============
  clearBag(); g.addItem('土', 4); g.addItem('草', 6); g.addItem('木', 12); g.addItem('棉', 10); g.addItem('石', 12); g.addItem('石子', 8); g.addItem('竹', 12);
  p.sta = 100;
  g.craft('brick'); ok('brick recipe: 2 磚 for 2 土 1 草, 3 力', g.count('磚') === 2 && g.count('土') === 2 && g.count('草') === 5 && p.sta === 97, [bag(), p.sta]);
  g.craft('door'); g.craft('bed'); g.craft('stove'); g.craft('torch');
  g.removeItem('竹', 99); g.removeItem('棉', 99);   // 騰出格子
  g.craft('lamp');
  ok('door/bed/stove/torch(×4 from 石子1 草3 木2)/lamp crafted', g.count('門') === 1 && g.count('床') === 1 && g.count('灶') === 1 && g.count('火把') === 3 && g.count('燈') === 1, bag());
  g.removeItem('土', 99); g.removeItem('草', 99); g.removeItem('燈', 99); g.removeItem('火把', 99);   // 騰出格子，工具不疊
  g.craft('grind', '石劍'); g.craft('grind', '石鎬'); g.craft('grind', '石斧'); g.craft('grind', '石鋤');
  const sword = tool('石劍');
  ok('grinding makes tools with durability and they go to the tool bar', !!sword && sword.dur === 40 && tool('石鎬') && tool('石斧') && tool('石鋤') && p.tools.length === 4 && !p.bag.some(s => s.dur !== undefined), bag());
  const staBefore = p.sta; p.sta = 2; const bricks = g.count('磚'); g.craft('brick');
  ok('crafting needs stamina', g.count('磚') === bricks && p.sta === 2); p.sta = staBefore;
  sword.dur = 5; hold('石劍'); const pebbles = g.count('石子'); g.craft('regrind');
  ok('regrind restores durability for one 石子', sword.dur === 40 && g.count('石子') === pebbles - 1, [sword.dur, g.count('石子')]);
  await press('KeyC', 20); await sleep(30);
  ok('craft panel opens with C and lists recipes', !hidden('craft') && document.querySelectorAll('#craft-list .recipe').length === G.RECIPES.length);
  ok('sixteen bag slots', document.querySelectorAll('#bagbar .slot').length === 16);
  ok('craft panel has category buttons on the left, 全部 selected', document.querySelectorAll('#craft-cats button').length === G.CRAFT_CATS.length && document.querySelector('#craft-cats button.on').textContent.indexOf('全部') === 0);
  [...document.querySelectorAll('#craft-cats button')].find(b => b.textContent.indexOf('衣甲') === 0).click(); await sleep(30);
  ok('picking 衣甲 shows only armour recipes and digit keys follow the visible list', document.querySelectorAll('#craft-list .recipe').length === G.RECIPES.filter(r => r.cat === '衣甲').length && g.visibleRecipes()[0].id === 'lining' && [...document.querySelectorAll('#craft-list .recipe b')].every(b => b.textContent.indexOf('磚') < 0));
  ok('every recipe has a category', G.RECIPES.every(r => G.CRAFT_CATS.indexOf(r.cat) > 0));
  [...document.querySelectorAll('#craft-cats button')].find(b => b.textContent.indexOf('全部') === 0).click(); await sleep(30);
  ok('six tool slots', document.querySelectorAll('#toolbar .slot').length === 6 && document.querySelectorAll('#toolbar .slot.sel').length === 1);
  await press('KeyC', 20); await sleep(30); ok('craft panel closes', hidden('craft'));

  // ============ C. 放置、擋路、灶、鋤、鎬 ============
  face(1, 0); w.set(T().x, T().y, '白'); hold('磚'); g.pressPlace();
  ok('placed 磚 blocks beasts and ghosts', w.get(T().x, T().y) === '磚' && !g.ents.canStand('虎', T().x, T().y, true) && !g.ents.canStand('狼', T().x, T().y, true) && !g.pass(T().x, T().y), w.get(T().x, T().y));
  face(0, -1); w.set(T().x, T().y, '沙'); w.set(T().x, T().y, '木'); hold('門'); g.pressPlace();
  ok('cannot place on a tree before clearing it', w.get(T().x, T().y) === '木');
  w.set(T().x, T().y, '草'); const tr0 = U.trueRand; U.trueRand = () => 0.9; const grass0 = g.count('草'); g.pressPlace(); U.trueRand = tr0;
  ok('v0.6.2: a 門 goes straight onto grass; this time the grass is crushed', w.get(T().x, T().y) === '門' && g.count('草') === grass0 && g.msgText.indexOf('壓壞') >= 0, g.count('草'));
  ok('placed 門: player passes, ghosts do not', w.get(T().x, T().y) === '門' && g.pass(T().x, T().y) && !g.ents.canStand('狼', T().x, T().y, true) && !g.ents.canStand('虎', T().x, T().y, true));
  face(-1, 0); w.set(T().x, T().y, '花'); hold('床'); const fl0 = g.count('花'); U.trueRand = () => 0.1; g.pressPlace(); U.trueRand = tr0;
  const bed = T();
  ok('placed 床 sets home', w.get(bed.x, bed.y) === '床' && p.home && p.home.x === bed.x, p.home);
  ok('v0.6.2: a 床 on 花 — half the time the flower is picked up as it goes down', g.count('花') === fl0 + 1, [fl0, g.count('花')]);
  face(0, 1); w.set(T().x, T().y, '田'); hold('灶'); const stander = g.ents.add('鹿', T().x, T().y, { calm: 99, moveT: 99 }); g.pressPlace();
  ok('v0.6.2: nothing goes down on a tile a creature stands on', w.get(T().x, T().y) === '田' && g.count('灶') === 1 && g.msgText.indexOf('有生靈') >= 0);
  g.ents.list = g.ents.list.filter(e => e !== stander); w.set(T().x, T().y, '沙'); g.pressPlace();
  const stove = T();
  ok('placed 灶 is cold', w.get(stove.x, stove.y) === '灶' && !w.stoveLit(stove.x, stove.y));
  hold('木'); const wood0 = g.count('木'); g.pressPlace();
  ok('F facing a stove opens the stove panel and consumes nothing', !hidden('stove') && g.stoveAt === stove.x + ',' + stove.y && g.count('木') === wood0 && document.getElementById('stove-fire').textContent.indexOf('冷') >= 0);
  document.querySelector('#stove-fuel button[data-fuel="木"]').click();
  ok('wood fuels the stove from the panel', w.stoveLit(stove.x, stove.y) && g.count('木') === wood0 - 1 && document.getElementById('stove-fire').textContent.indexOf('火旺') >= 0, w.stoveFuel(stove.x, stove.y));
  g.addItem('魚', 1); g.buildStove(); document.querySelector('#stove-cook button[data-cook="魚"]').click();
  ok('魚 cooked in the stove panel becomes 烤魚', g.count('烤魚') === 1 && g.count('魚') === 0, bag());
  await press('KeyE', 30);
  ok('E closes the stove panel', hidden('stove') && !g.stoveAt);
  p.food = 50; hold('烤魚'); g.useItem();
  ok('eating 烤魚 +40', Math.round(p.food) === 90 && g.count('烤魚') === 0, p.food);
  w.set(stove.x, stove.y, '土'); hold('石鋤'); g.action = null; g.pressGather();
  ok('鋤 in hand turns 土 into 田 with E and wears', w.get(stove.x, stove.y) === '田' && tool('石鋤').dur === 39 && !g.action);
  w.set(stove.x, stove.y, '山'); hold('石鎬'); g.action = null; g.pressGather(); await until(() => !g.action, 12000);
  ok('鎬 mines 山 into 石 and yields 石×2', w.get(stove.x, stove.y) === '石' && g.count('石') >= 2, [w.get(stove.x, stove.y), g.count('石')]);
  w.set(stove.x, stove.y, '木'); hold('石斧'); g.action = null; g.pressGather();
  ok('斧 halves wood time', g.action && Math.abs(g.action.dur - 0.7) < 0.01, g.action && g.action.dur); g.action = null;

  // ============ D. 戰鬥 ============
  hold('石劍'); const sd0 = tool('石劍').dur;
  face(0, 1); w.set(T().x, T().y, '草'); g.ents.list = g.ents.list.filter(e => e.type !== '虎');
  const tiger = g.ents.add('虎', T().x, T().y, { calm: 9, moveT: 9 });
  g.pressGather(); ok('sword hits tiger for 40 (300 hp)', tiger.hp === 260, tiger.hp);
  g.pressGather(); ok('attack has a cooldown', tiger.hp === 260);
  for (let i = 0; i < 7; i++) { p.atkT = 0; tiger.x = T().x; tiger.y = T().y; g.pressGather(); }
  ok('eight blows kill the tiger, 肉×3, sword wears 8', !g.ents.list.includes(tiger) && g.count('肉') === 3 && tool('石劍').dur === sd0 - 8, bag());
  const deer = g.ents.add('鹿', T().x, T().y, { calm: 9, moveT: 9 }); p.atkT = 0; g.pressGather();
  ok('one blow kills a deer, 肉×2', !g.ents.list.includes(deer) && g.count('肉') === 5, g.count('肉'));
  const deer2 = g.ents.add('鹿', T().x, T().y, { calm: 9, moveT: 9 }); hold('木'); unarm(); p.atkT = 0; g.pressGather();
  ok('bare hands cannot attack', g.ents.list.includes(deer2) && deer2.hp === 30); g.ents.remove(deer2);

  // ============ E. 睡覺、發酵、醉果 ============
  g.ents.list = g.ents.list.filter(e => e.type !== '魄');
  setDay(0.83); const dayBefore = g.day(); p.warm = 40; p.sta = 20; g.sleep(); await sleep(30);
  ok('sleeping in a bed skips to morning', g.day() === dayBefore + 1 && p.warm === 100 && p.sta === p.staMax && g.stats.nights === 1, [g.day(), p.warm]);
  setDay(0.83); const ghost = g.ents.add('魄', p.x + 3, p.y, { moveT: 99 }); const t1 = w.time; g.sleep();
  ok('cannot sleep with a ghost nearby', w.time === t1, g.msgText); g.ents.remove(ghost);
  setDay(0.83); p.san = 50; g.sleep(); await sleep(30);
  ok('sleeping restores 20 sanity', Math.round(p.san) === 70, p.san);
  setDay(0.27); const tN = w.time; g.sleep();
  ok('no napping after sunrise', w.time === tN, g.msgText);
  setDay(0.53); g.removeItem('果', 99); g.removeItem('肉', 99); g.removeItem('磚', 99);
  g.addItem('果', 2); g.addItem('果', 3, { d: g.day() - 15 });
  const fstacks = () => p.bag.filter(s => s.n === '果'), dNow = g.day();
  ok('fruit picked on different days shares one stack, oldest first inside', fstacks().length === 1 && fstacks()[0].c === 5 && fstacks()[0].ds.join() === [dNow - 15, dNow - 15, dNow - 15, dNow, dNow].join(), JSON.stringify(fstacks()));
  w.time += DAY; await until(() => g.count('醉果') === 3, 3000);
  ok('only the fruit older than 15 nights ferments, the rest stays', g.count('醉果') === 3 && g.count('果') === 2 && fstacks()[0].ds.every(d => d === g.day() - 1), bag());
  g.addItem('果', 1, { d: g.day() - 5 }); p.food = 50; hold('果'); g.useItem();
  ok('eating takes the oldest fruit first', g.count('果') === 2 && fstacks()[0].ds.every(d => d === g.day() - 1) && g.msgText.indexOf('5 夜') >= 0, g.msgText);
  g.removeItem('醉果', 99);
  // ============ F. 魄夜、毒、豹狼、稻草人 ============
  p.hp = 100; p.poisonT = 0; p.san = 100;
  w.time = DAY * 12 + DAY * 0.93;   // 第 13 日的夜 → 第十三夜
  ok('night thirteen is ghost night', g.day() === 13 && g.nightNo() === 13 && g.ghostNight() && g.ghostCap() === 2, [g.day(), g.nightNo(), g.ghostCap()]);
  w.time = DAY * 9 + DAY * 0.93; ok('no ghosts on night ten any more', !g.ghostNight());
  w.time = DAY * 12 + DAY * 0.93;
  // 手裡沒光：魄四格內蝕心耗力
  for (const [k] of w.stoves) w.stoves.set(k, 0);
  for (let dx = -10; dx <= 10; dx++) for (let dy = -10; dy <= 10; dy++) if (w.info(p.x + dx, p.y + dy).light) w.set(p.x + dx, p.y + dy, '白');
  g.ents.list = g.ents.list.filter(e => '魄龍'.indexOf(e.type) < 0);
  trim(['木', '石', '石子', '草', '土', '石劍', '石鎬', '磚']); hold('木');
  const gh = g.ents.add('魄', p.x + 3, p.y, { moveT: 99 }); const san0 = p.san; p.sta = 0.5; p.hp = 100; p.food = 90; p.warm = 90;
  await sleep(1200);
  ok('ghost drains sanity and stamina without light', p.san < san0 - 1 && p.sta === 0 && g.ents.list.includes(gh), [san0 - p.san, p.sta]);
  ok('zero stamina bleeds hp', p.hp < 100, p.hp); p.sta = 80;
  w.set(p.x + 5, p.y + 5, '磚');
  ok('ghost passes bricks, wolves do not', g.ents.canStand('魄', p.x + 5, p.y + 5, true) && !g.ents.canStand('狼', p.x + 5, p.y + 5, true));
  // 手持火把：只把魄逼到六格外，不再煙滅（v0.5）
  g.addItem('火把', 1); hold('火把'); gh.moveT = 0; await until(() => U.cheb(gh.x, gh.y, p.x, p.y) > 6, 5000);
  ok('a held torch drives the ghost back beyond six tiles; it does not dissipate', g.ents.list.includes(gh) && !(gh.fade < 1) && U.cheb(gh.x, gh.y, p.x, p.y) > 6 && g.hasLight(), U.cheb(gh.x, gh.y, p.x, p.y));
  g.ents.remove(gh);
  g.removeItem('火把', 9); hold('木'); g.addItem('燈帽', 1);
  ok('a lamp hat in the bag gives no light until worn', g.lightRadius() === 0);
  hold('燈帽'); g.pressPlace(); const hat = p.worn['帽'];
  ok('worn on the head (beside the helmet) it lights with its 400-second candle', hat && hat.fuel === 400 && g.lightRadius() === 2 && p.worn['盔'] === null, hat && hat.fuel);
  hat.fuel = 0.3; await until(() => hat.fuel <= 0, 3000);
  ok('when the candle burns out the hat goes dark', hat.fuel === 0 && g.lightRadius() === 0);
  g.addItem('蠟燭', 1); hold('蠟燭'); g.useItem();
  ok('a candle refills the hat', hat.fuel === 400 && g.count('蠟燭') === 0 && g.lightRadius() === 2);
  hold('木'); hat.fuel = 300; w.set(p.x + 2, p.y + 2, '燈'); await sleep(400);
  ok('with another light within three tiles the hat candle does not burn', hat.fuel === 300, hat.fuel);
  w.set(p.x + 2, p.y + 2, '白'); await sleep(300);
  ok('away from other lights it burns again', hat.fuel < 300, hat.fuel);
  g.takeOff('帽'); g.removeItem('燈帽', 1); hold('木');
  // 白天：林裡凍住，林外煙滅
  w.time = DAY * 13 + DAY * 0.48;
  const g1 = g.ents.add('魄', p.x + 20, p.y + 20, { moveT: 99 }); w.set(p.x + 20, p.y + 20, '林');
  const g2 = g.ents.add('魄', p.x + 22, p.y + 22, { moveT: 99 }); w.set(p.x + 22, p.y + 22, '草');
  await until(() => !g.ents.list.includes(g2), 4000);
  ok('by day a ghost in the woods freezes, one outside dissipates', g.ents.list.includes(g1) && g1.frozen && !g.ents.list.includes(g2));
  g.ents.remove(g1);
  // 毒蛇：咬一口中毒九秒、每秒一點五（v0.6.1 起，原本五秒每秒三）；連咬十五口必死
  hold('木'); w.time = DAY * 13 + DAY * 0.53;
  face(1, 0); w.set(T().x, T().y, '草'); const snake = g.ents.add('蛇', T().x, T().y, { moveT: 0, atk: 0 }); p.hp = 100; p.biteN = 0; p.biteLast = -99;
  await until(() => p.poisonT > 0, 3000);
  ok('snake bite poisons (1.5/s for 9 s)', p.poisonT > 5 && p.poisonT <= 9 && p.poisonPer === 1.5 && p.biteN === 1, [p.poisonT, p.poisonPer, p.biteN]);
  ok('hostile beasts bite every 2.67 s and maul every 1.6 s (a quarter slower)', Math.abs(snake.atk - 2.0 * 4 / 3) < 0.3 && snake.hp === 90, [snake.atk, snake.hp]);
  const hpP = p.hp; await sleep(1000);
  ok('poison drains hp and screen tints green', p.hp < hpP && g.vignette().green > 0, [hpP - p.hp]);
  g.addItem('藥', 1); hold('藥'); g.useItem();
  ok('藥 cures poison', p.poisonT === 0 && p.poisonPer === 0);
  g.ents.remove(snake);
  p.hp = 100; p.biteN = 14; p.biteLast = w.time; p.cour = 100; const swd = tool('石劍'); if (swd) swd.dur = 20; const snake2 = g.ents.add('蛇', T().x, T().y, { moveT: 0, atk: 0 });
  await until(() => p.dead, 3000);
  ok('fifteenth consecutive bite kills', p.dead, [p.hp, p.biteN]);
  g.ents.remove(snake2); await press('Enter', 20); await sleep(80);
  ok('respawn keeps 40% of courage (100 → 40)', !p.dead && p.cour === 40, p.cour);
  ok('durable things in the 荷包 are halved', [...w.bags.values()].some(v => v.some(s => s.n === '石劍' && s.dur === 10)), [...w.bags.values()].flat().filter(s => s.dur !== undefined).map(s => s.n + s.dur).join(','));
  ok('belongings drop as one 荷包', w.bags.size >= 1 && [...w.bags.keys()].every(k => { const [x, y] = k.split(',').map(Number); return w.get(x, y) === '包'; }) && [...w.bags.values()].some(v => v.some(s => s.n === '石劍')), w.bags.size);
  // 蜘蛛不惹不咬；除草十分之一出蜘蛛
  w.set(T().x, T().y, '草'); g.ents.list = g.ents.list.filter(e => e.type !== '蛛');
  const spider = g.ents.add('蛛', p.x + 1, p.y + 1, { moveT: 0, atk: 0, venom: false }); p.poisonT = 0; await sleep(700);
  ok('spider leaves you alone unless provoked', p.poisonT === 0 && !spider.angry && g.ents.list.includes(spider));
  spider.x = p.x + 1; spider.y = p.y + 1; spider.moveT = 99;
  g.addItem('石劍', 1); hold('石劍'); face(1, 1); p.atkT = 0; g.pressGather();
  ok('attacking a spider makes it angry (90 hp − 40)', spider.angry && spider.hp === 50, spider.hp);
  g.ents.remove(spider);
  const rnd2 = Math.random; Math.random = () => 0.05; const spiders0 = g.ents.count('蛛');
  face(0, 1); w.set(T().x, T().y, '草'); hold('木'); g.action = null; g.pressGather(); await until(() => !g.action, 4000); Math.random = rnd2;
  ok('cutting grass can startle a spider (1/10)', g.ents.count('蛛') === spiders0 + 1);
  g.ents.list = g.ents.list.filter(e => e.type !== '蛛');
  // 豹：一撲十滴血
  w.time = DAY * 13 + DAY * 0.53; hold('木'); face(1, 0); w.set(T().x, T().y, '林');
  for (const [k] of w.stoves) w.stoves.set(k, 0);
  for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) if (w.info(p.x + dx, p.y + dy).light) w.set(p.x + dx, p.y + dy, '白');
  const leo = g.ents.add('豹', T().x, T().y, { moveT: 0, atk: 0, calm: 0 }); p.hp = 100; await until(() => p.hp < 100, 3000);
  ok('leopard hits for 10', Math.round(p.hp) === 90, p.hp); g.ents.remove(leo);
  // 稻草人：十格內獸不能站
  w.set(T().x, T().y, '土'); g.addItem('偶', 2); hold('偶'); g.pressPlace();
  const sc = T();
  ok('scarecrow placed with 45 days (v0.6.10; was 30)', w.get(sc.x, sc.y) === '偶' && Math.round(w.scareDays(sc.x, sc.y)) === 45, w.scareDays(sc.x, sc.y));
  for (const dx of [7, 8, 9, 10]) w.set(sc.x + dx, sc.y, '草');
  ok('beasts cannot come within ten tiles of a fresh scarecrow', !g.ents.canStand('虎', sc.x + 9, sc.y, true) && !g.ents.canStand('蛇', sc.x + 10, sc.y, true) && g.ents.canStand('鹿', sc.x + 9, sc.y, true) && g.ents.canStand('魄', sc.x + 9, sc.y, true));
  g.pressPlace();
  ok('a second scarecrow extends to sixty days at most (v0.6.10; was 40)', Math.round(w.scareDays(sc.x, sc.y)) === 60, w.scareDays(sc.x, sc.y));
  w.scarecrows.set(sc.x + ',' + sc.y, w.time + 23 * DAY); const front = !g.ents.canStand('虎', sc.x + 10, sc.y, true);
  w.scarecrows.set(sc.x + ',' + sc.y, w.time + 22 * DAY);
  ok('v0.6.10: ten tiles while more than 22.5 days are left, seven after', front && !g.ents.canStand('虎', sc.x + 7, sc.y, true) && g.ents.canStand('虎', sc.x + 8, sc.y, true));
  w.scarecrows.set(sc.x + ',' + sc.y, w.time + 10 * DAY);
  ok('in the last fifteen days the radius is seven', !g.ents.canStand('虎', sc.x + 7, sc.y, true) && g.ents.canStand('虎', sc.x + 8, sc.y, true));
  w.scarecrows.delete(sc.x + ',' + sc.y);

  // ============ H. 愜意、膽氣、力、瓶與酒、櫃、昏迷、船 ============
  // 愜意：製作 +8；歸零失控；回到 10 解除
  trim(['木', '石', '石子', '草', '土', '石劍', '石鎬', '磚']);
  p.san = 50; p.cour = 0; g.addItem('土', 2); g.addItem('草', 1); p.sta = 50; g.craft('brick');
  ok('crafting adds 8 sanity and courage equal to its stamina ×1.25 (normal difficulty bonus, kept to four decimals: 3.75)', p.san === 58 && p.cour === 3.75, [p.san, p.cour]);
  g.addItem('土', 8); g.addItem('草', 4); p.sta = 100; const sg = [];
  for (let i = 0; i < 4; i++) { const s0 = p.san; g.craft('brick'); sg.push(Math.round((p.san - s0) * 100) / 100); }
  ok('repeating the same recipe within 60 s gives 4, 2, 1, 1 sanity', sg.join(',') === '4,2,1,1', sg);
  p.san = 0; await sleep(300);
  ok('zero sanity makes you insane with blue tint', p.insane && g.vignette().blue > 0.5);
  const ctrl0 = p.ctrl; p.ctrlT = 0; await sleep(200);
  ok('control alternates while insane', p.ctrl !== ctrl0);
  p.san = 12; await sleep(200);
  ok('sanity above ten restores control', !p.insane && p.ctrl);
  // 膽氣：每 20 點一重，回復倍率
  p.cour = 45; g.addCourage(0);
  ok('courage level 2 gives 1.2x recovery', g.level() === 2 && Math.abs(g.mult() - 1.2) < 1e-9);
  ok('level thresholds grow as 20×(1+0.1n)², kept to four decimals (v0.6.2)', g.levelCost(0) === 20 && g.levelCost(1) === 24.2 && g.levelCost(2) === 28.8 && g.levelCost(3) === 33.8 && g.levelCost(4) === 39.2 && g.levelAt(1) === 20 && g.levelAt(2) === 44.2 && g.levelAt(8) === 300 && g.levelAt(10) === 437 && g.levelAt(31) === 4371, [g.levelAt(8), g.levelAt(10), g.levelAt(31)]);
  ok('ship recipe locked below level 8', (() => { g.addItem('木板', 8); g.addItem('船槳', 1); g.addItem('船帆', 1); p.sta = 100; g.craft('ship'); return g.count('孤帆') === 0; })());
  p.cour = 300; g.craft('ship');
  ok('a 孤帆 is craftable at level 8 for 8 planks, an oar and a sail', g.count('孤帆') === 1 && g.level() === 8 && g.count('木板') === 0, [g.count('孤帆'), g.level()]);
  g.addItem('木板', 36); g.addItem('船槳', 4); g.addItem('船帆', 3); g.addItem('鐵', 8); g.addItem('麻布', 6); g.addItem('鎢鋼', 2); p.sta = 100; g.craft('ark');
  ok('a 方舟 costs far more: 36 planks, 4 oars, 3 sails, 8 iron, 6 cloth, 2 tungsten steel', g.count('方舟') === 1 && g.count('木板') === 0 && g.count('鐵') === 0 && g.count('鎢鋼') === 0, [g.count('方舟'), g.count('木板')]);
  // 衣甲與山海衣：五件穿齊、至少一件鎢鋼、十六重膽氣才有獸紋；脫下一件就是普通衣甲
  p.cour = g.levelAt(16); trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']);
  g.addItem('內襯', 1); g.addItem('布褲', 1); g.addItem('布甲', 1); g.addItem('布帽', 1); g.addItem('布靴', 1); g.addItem('鎢鋼靴', 1);
  for (const n of ['內襯', '布褲', '布甲', '布帽']) { hold(n); g.pressPlace(); }
  ok('four cloth pieces worn: 9% less damage, no 山海衣 yet', Math.abs(g.armorRed() - 0.09) < 1e-9 && !g.totemOn() && g.wornList().length === 4 && g.dmgMult() === 1, g.armorRed());
  hold('布靴'); g.useItem();
  ok('five cloth pieces at level 16 are still plain clothes: a tungsten piece is required', !g.totemOn() && !g.totemReady() && g.wornList().length === 5 && Math.abs(g.armorRed() - 0.10) < 1e-9 && g.dmgMult() === 1, g.armorRed());
  hold('鎢鋼靴'); g.useItem();
  ok('swapping in 鎢鋼靴 wakes the 山海衣: attack ×1.15 (and the iron piece its 1/60), taken ×0.83 (17% armour)', g.totemOn() && Math.abs(g.armorRed() - 0.17) < 1e-9 && Math.abs(g.dmgMult() - 1.15 * (1 + 0.05 / 3)) < 1e-9 && Math.abs(g.takenMult() - 0.83) < 1e-9 && g.has('布靴'), [g.dmgMult(), g.takenMult()]);
  p.cour = g.levelAt(15); ok('at level 15 the same five pieces are plain clothes', !g.totemOn() && !g.totemReady() && Math.abs(g.dmgMult() - (1 + 0.05 / 3)) < 1e-9); p.cour = g.levelAt(16);
  document.getElementById('totemswitch').click();
  ok('the switch turns the 山海衣 off into plain clothes', p.totemOff && !g.totemOn() && g.totemReady() && Math.abs(g.dmgMult() - (1 + 0.05 / 3)) < 1e-9 && Math.abs(g.takenMult() - 0.83) < 1e-9);
  document.getElementById('totemswitch').click();
  ok('and back on', !p.totemOff && g.totemOn());
  p.cour = g.levelAt(22); ok('level 22 is still the first step', Math.abs(g.dmgMult() - 1.15 * (1 + 0.05 / 3)) < 1e-9 && Math.abs(g.takenMult() - 0.83) < 1e-9);
  p.cour = g.levelAt(23); ok('level 23: attack ×1.15², taken ÷1.15', Math.abs(g.dmgMult() - 1.15 * 1.15 * (1 + 0.05 / 3)) < 1e-9 && Math.abs(g.takenMult() - 0.83 / 1.15) < 1e-9);
  p.cour = g.levelAt(30); ok('level 30: attack ×1.15³, taken ÷1.15²', Math.abs(g.dmgMult() - Math.pow(1.15, 3) * (1 + 0.05 / 3)) < 1e-9 && Math.abs(g.takenMult() - 0.83 / 1.15 / 1.15) < 1e-9);
  p.cour = g.levelAt(16); p.hp = 100; p.hitWin = { start: -99, n: 0 }; g.hit({ type: '虎', x: p.x + 1, y: p.y }, 20);
  ok('near the 山海衣 beasts hit 5/3 harder; the armour still takes 17% off (20 × 5/3 × 0.83 = 27.6667)', Math.abs(p.hp - (100 - 27.6667)) < 1e-9, p.hp);
  for (let i = 1; i <= 3; i++) w.set(p.x + i, p.y, '草');   // 中間別擋著磚門墟：看不見人，虎白天只聞得到 2.8 格，不會撲（這項以前偶爾不過）
  const tt = g.ents.add('虎', p.x + 3, p.y, { moveT: 0, calm: 0, atk: 0 }); g.ents.update(0.01, g);
  ok('near the 山海衣 hostile beasts move at half speed', Math.abs(tt.moveT - 0.6) < 1e-6, tt.moveT); g.ents.remove(tt);
  g.takeOff('盔');
  ok('taking one piece off turns it back into plain clothes', !g.totemOn() && Math.abs(g.dmgMult() - (1 + 0.05 / 3)) < 1e-9 && Math.abs(g.takenMult() - 0.85) < 1e-9 && g.has('布帽'), g.takenMult());
  hold('布帽'); g.pressPlace();
  // 衣甲損耗：一百八十日；十五息內挨打加速且累加；五下碎
  const vest = p.worn['甲']; ok('armor lasts 180 days', Math.round(vest.dur / DAY) === 180 && vest.wm === 1, vest.dur / DAY);
  const d0 = vest.dur, tw0 = w.time; await sleep(400);
  ok('armor wears evenly while worn', vest.dur < d0 && Math.abs((d0 - vest.dur) - (w.time - tw0)) < 0.05, [d0 - vest.dur, w.time - tw0]);
  p.hitWin = { start: -99, n: 0 }; p.hp = 100;
  g.hit({ type: '狼', x: p.x + 1, y: p.y }, 1); g.hit({ type: '狼', x: p.x + 1, y: p.y }, 1);
  const d1 = vest.dur, tw1 = w.time; await sleep(400);
  ok('two hits within 15 s: armor wears ×1.12', p.hitWin.n === 2 && Math.abs((d1 - vest.dur) - 1.12 * (w.time - tw1)) < 0.05, [d1 - vest.dur, w.time - tw1]);
  w.time += 16; await sleep(80);
  ok('after 15 s the window closes and the speed-up sticks', p.hitWin.n === 0 && Math.abs(vest.wm - 1.12) < 1e-9, vest.wm);
  await sleep(60);
  ok('worn panel shows days left at the current wear rate', document.getElementById('worn1').textContent.indexOf(Math.ceil(vest.dur / 1.12 / DAY) + '日') >= 0, document.getElementById('worn1').textContent);
  for (let i = 0; i < 5; i++) g.hit({ type: '狼', x: p.x + 1, y: p.y }, 1);
  ok('five hits within 15 s shatter 甲, 襯 and 褲 but not 盔 and 靴', !p.worn['甲'] && !p.worn['襯'] && !p.worn['褲'] && p.worn['盔'] && p.worn['靴'] && !g.totemOn() && Math.abs(p.worn['盔'].wm - 1.12 * 1.5) < 1e-9, g.wornList().map(s => s.n + '@' + s.wm));
  p.worn['盔'].wm = 5; p.hitWin = { start: w.time, n: 4 }; w.time += 16; await sleep(80);
  ok('the wear multiplier caps at ×6', Math.abs(p.worn['盔'].wm - 6) < 1e-9 && p.hitWin.n === 0, p.worn['盔'].wm);
  g.addItem('麻布', 1); p.sta = 50; g.repairWorn('盔');
  ok('v0.7.1: a piece with more than half its life left cannot be patched yet', g.count('麻布') === 1 && p.sta === 50 && g.msgText.indexOf('用過一半才能修補') >= 0, g.msgText);
  p.worn['盔'].dur = g.lifeOf(p.worn['盔']) * 0.4; g.repairWorn('盔');
  ok('repairing with 麻布 restores 180 days and restarts wear at ×1.5', Math.round(p.worn['盔'].dur / DAY) === 180 && p.worn['盔'].wm === 1.5 && g.count('麻布') === 0 && p.sta === 46, [p.worn['盔'].wm, g.count('麻布')]);
  p.hp = 100; p.hurtT = 0; g.takeOff('盔'); g.takeOff('靴'); trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']);
  // 拆回自己放的東西不長膽氣；稻草人拆得回來
  p.cour = 0; face(0, -1); w.set(T().x, T().y, '土'); g.addItem('磚', 1); hold('磚'); g.pressPlace(); g.addItem('石鎬', 1); hold('石鎬'); g.action = null; g.pressGather(); takeYes(); await until(() => !g.action, 12000);
  ok('taking back a placed brick gives no courage', g.count('磚') >= 1 && p.cour === 0 && w.get(T().x, T().y) === '白', [p.cour, w.get(T().x, T().y)]);
  w.set(T().x, T().y, '土'); g.addItem('偶', 1); hold('偶'); g.pressPlace(); const sck = T().x + ',' + T().y; g.action = null; g.pressGather(); takeYes(); await until(() => !g.action, 4000);
  ok('scarecrow can be taken down', w.get(T().x, T().y) === '白' && !w.scarecrows.has(sck) && g.count('偶') === 1 && p.cour === 0, [w.get(T().x, T().y), g.count('偶')]);
  g.removeItem('偶', 9); w.set(T().x, T().y, '土');
  // 鐵甲：減傷三成、毒不侵、慢四分之一、攻擊加半成、飢愜力掉得快八分
  g.addItem('內襯', 1); g.addItem('布褲', 1); g.addItem('鐵甲', 1); g.addItem('鐵盔', 1); g.addItem('鐵靴', 1);
  for (const n of ['內襯', '布褲', '鐵甲', '鐵盔', '鐵靴']) { hold(n); g.pressPlace(); }
  p.cour = 0; await sleep(80);
  ok('worn panel shows the four live numbers', (() => { const t = document.getElementById('wornstats').textContent; return t.indexOf('傷害獲取70%') >= 0 && t.indexOf('移動速度75%') >= 0 && t.indexOf('傷害輸出105%') >= 0 && t.indexOf('現今蟲獸傷害輸出100%') >= 0 && document.querySelectorAll('#worn1 .slot').length === 3 && document.querySelectorAll('#worn2 .slot').length === 3; })(), document.getElementById('wornstats').textContent);
  ok('full iron (甲盔靴 + cloth lining and trousers): 30% less damage, poison immune, 25% slower, +5% attack, +8% drain', Math.abs(g.armorRed() - 0.30) < 1e-9 && g.ironFull() && Math.abs(g.ironSpeed() - 0.75) < 1e-9 && Math.abs(g.dmgMult() - 1.05) < 1e-9 && Math.abs(g.ironDrain() - 1.08) < 1e-9 && Math.abs(g.takenMult() - 0.7) < 1e-9, [g.armorRed(), g.dmgMult(), g.takenMult()]);
  p.poisonT = 0; p.poisonPer = 0; g.bite({ type: '蛇', x: p.x + 1, y: p.y }, 3);
  ok('iron-clad, a snake bite does not poison', p.poisonT === 0 && p.poisonPer === 0);
  const wornDown = (k) => { p.worn[k].dur = g.lifeOf(p.worn[k]) * 0.4; };   // v0.7.1：用過一半才能修補
  p.worn['甲'].wm = 3; g.removeItem('鐵', 99); g.addItem('鐵', 1); p.sta = 50; wornDown('甲'); g.repairWorn('甲');
  ok('iron pieces are repaired with 鐵: one the first time', p.worn['甲'].wm === 1.5 && g.count('鐵') === 0 && p.worn['甲'].rg === 1);
  g.addItem('鐵', 1); p.sta = 50; wornDown('甲'); g.repairWorn('甲'); const ironShort = g.count('鐵') === 1 && p.worn['甲'].rg === 1 && g.msgText.indexOf('鐵 2') >= 0;
  const ic = []; g.addItem('鐵', 30); for (let i = 0; i < 4; i++) { const c0 = g.count('鐵'); p.sta = 50; wornDown('甲'); g.repairWorn('甲'); ic.push(c0 - g.count('鐵')); }
  ok('v0.6.3: the same iron piece costs 鐵 1, 2, 4, 8, then 8 again; one 鐵 is not enough the second time', ironShort && ic.join(',') === '2,4,8,8' && p.worn['甲'].rg === 5, ic);
  g.removeItem('鐵', 99);
  for (const k of ['襯', '甲', '褲', '盔', '靴']) g.takeOff(k); trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']); p.hitWin = { start: -99, n: 0 };
  // 難度：魄幾夜起、受傷與攻擊倍率、夜裡獸量
  const tSave = w.time; p.cour = 0;
  g.diff = XIEYI.DIFF.hard; w.time = DAY * 8 + DAY * 0.93;
  ok('hard: ghosts from night 9, taken ×1.1, attack ×0.9, night beasts ×1.5', g.ghostNight() && Math.abs(g.takenMult() - 1.1) < 1e-9 && Math.abs(g.dmgMult() - 0.9) < 1e-9 && g.beastMult() === 1.5, [g.takenMult(), g.dmgMult()]);
  g.diff = XIEYI.DIFF.easy; w.time = DAY * 12 + DAY * 0.93; const e13 = g.ghostNight(); w.time = DAY * 20 + DAY * 0.93;
  ok('easy: no ghosts on night 13, ghosts from night 21, taken ×0.9, attack ×1.1', !e13 && g.ghostNight() && Math.abs(g.takenMult() - 0.9) < 1e-9 && Math.abs(g.dmgMult() - 1.1) < 1e-9 && g.beastMult() === 1);
  g.diff = XIEYI.DIFF.normal; w.time = tSave;
  // 錦囊：囊多兩格、具欄多一格，最多八個（v0.6.10；v0.4.13–v0.6.9 六個、更早四個）
  g.addItem('錦囊', 1); hold('錦囊'); g.useItem(); await sleep(60);
  ok('a pouch adds two bag slots and one tool slot', p.pouches === 1 && g.slots() === 18 && g.toolSlots() === 7 && bagCells() === 18 && document.querySelectorAll('#toolbar .slot').length === 7);
  p.pouches = 8; g.addItem('錦囊', 1); hold('錦囊'); g.useItem();
  ok('no more than eight pouches: 32 bag slots and 14 tool slots', p.pouches === 8 && g.count('錦囊') === 1 && g.slots() === 32 && g.toolSlots() === 14);
  g.removeItem('錦囊', 1); p.pouches = 0; g.barSig = '';
  // 同一類衣甲只留一件：再造只翻新
  g.addItem('內襯', 1); const lin = p.bag.find(s => s.n === '內襯'); lin.dur = 1000; lin.wm = 3; g.addItem('棉', 4); g.addItem('麻', 2); p.sta = 50; g.buildCraft();
  const marked = document.getElementById('craft-list').textContent.indexOf('已有') >= 0; g.craft('lining');
  ok('a second 內襯 only renews the one you have (craft panel says 已有)', marked && g.count('內襯') === 1 && Math.round(lin.dur / DAY) === 180 && lin.wm === 1 && g.count('棉') === 0, [marked, g.count('內襯'), lin.wm]);
  g.removeItem('內襯', 1);
  // 囊分食與物兩段
  g.addItem('果', 1); g.addItem('烤魚', 1); await sleep(60);
  const order = p.bag.map(s => (G.item(s.n).food ? 1 : 0)).join('');
  ok('edible items are grouped first, non-edible after', order.indexOf('01') < 0 && document.querySelectorAll('#bagbar .rowlabel').length === 2, order);
  g.removeItem('果', 9); g.removeItem('烤魚', 9);
  // 九閽鳴雷：卅一重可造可掄，三格內同受，隨身二日一減、下限廿五重
  p.cour = g.levelAt(31); g.addItem('鐵', 12); g.addItem('煤', 6); g.addItem('石子', 9); g.addItem('麻布', 2); g.addItem('果酒', 1); p.sta = 100; g.craft('hammer');
  ok('九閽鳴雷 craftable at level 31, durability 199, goes to the tool bar', tool('九閽鳴雷') && tool('九閽鳴雷').dur === 199, bag());
  ok('carrying it on normal: courage decays every three days down to level 27', g.hasGod() && g.decayDays() === 3 && g.decayFloor() === 27);
  hold('九閽鳴雷'); face(1, 0); for (const [dx, dy] of [[1, 0], [3, 2], [4, 0]]) w.set(p.x + dx, p.y + dy, '草');
  const h1 = g.ents.add('虎', p.x + 1, p.y, { moveT: 99, calm: 99 }), h2 = g.ents.add('狼', p.x + 3, p.y + 2, { moveT: 99, calm: 99 }), h3 = g.ents.add('鹿', p.x + 4, p.y, { moveT: 99 });
  p.atkT = 0; p.sta = 50; g.pressGather();
  ok('one swing hits every beast within three tiles for 120 (v0.8.10: +4% on normal, 124.8), not the deer four away', g.godDmg('九閽鳴雷') === 124.8 && Math.abs(h1.hp - (300 - 124.8)) < 1e-6 && Math.abs(h2.hp - (160 - 124.8)) < 1e-6 && h3.hp === 30 && tool('九閽鳴雷').dur === 198, [h1.hp, h2.hp, h3.hp]);
  ok('v0.8.20: a god-weapon hit angers what it strikes (a comment had swallowed this since v0.8.16)', h1.angry === true && h2.angry === true && !h3.angry, [h1.angry, h2.angry, h3.angry]);
  p.cour = g.levelAt(30); p.atkT = 0; g.pressGather();
  ok('below level 31 it cannot be swung', Math.abs(h1.hp - (300 - 124.8)) < 1e-6);
  for (const e of [h1, h2, h3]) g.ents.remove(e);
  { const tm = g.ents.add('鷹', p.x + 1, p.y, { moveT: 99 }), dr = g.ents.add('鹿', p.x - 2, p.y, { moveT: 99 }); tm.tame = true; tm.sta = 100; const th = tm.hp; p.cour = g.levelAt(31); p.atkT = 0; p.sta = 50; g.pressGather();
    const swung = dr.hp < 30 || !g.ents.list.includes(dr); g.ents.remove(dr); hold('石劍'); p.atkT = 0; g.attack(tm);
    ok('v0.8.21: no weapon hits your own pet — the 九閽鳴雷 swing passes over your eagle, and E with a sword does nothing to it (it stays yours)', swung && tm.hp === th && tm.tame && /下不了手/.test(g.msgText), [swung, tm.hp, g.msgText]); g.ents.remove(tm); }
  p.tools = p.tools.filter(s => s.n !== '九閽鳴雷'); p.tool = -1; hold('石劍'); p.cour = 0; p.decayAt = 0; g.barSig = '';
  // 鷹：半友好；魚可馴，第一隻 35%、第二隻 25%、第三隻起 10%；馴了替你打獸、餵魚回力；右邊顯示
  g.ents.list = g.ents.list.filter(e => e.type !== '鷹' && e.type !== '虎');
  ok('taming odds fall with each eagle already following', g.tameChance() === 0.35 && (() => { const a = g.ents.add('鷹', p.x + 9, p.y + 9, { tame: true, moveT: 99 }); const c1 = g.tameChance(); const b = g.ents.add('鷹', p.x + 9, p.y + 8, { tame: true, moveT: 99 }); const c2 = g.tameChance(); const c = g.ents.add('鷹', p.x + 8, p.y + 9, { tame: true, moveT: 99 }); const c3 = g.tameChance(); for (const e of [a, b, c]) g.ents.remove(e); return c1 === 0.25 && c2 === 0.10 && c3 === 0.10; })());
  face(1, 0); w.set(T().x, T().y, '草'); const eg = g.ents.add('鷹', T().x, T().y, { moveT: 99 });
  hold('石劍'); p.atkT = 0; g.pressGather();
  ok('a wild eagle gets angry when attacked (60 hp − 40)', eg.angry && eg.hp === 20, eg.hp);
  eg.hp = 60; eg.moveT = 0; eg.atk = 0; p.hp = 100; p.hurtT = 0; await until(() => p.hp < 100, 3000);
  ok('an angry eagle pecks for 12', Math.round(p.hp) === 88, p.hp); eg.moveT = 99; eg.x = T().x; eg.y = T().y;
  g.addItem('魚', 3); hold('魚'); const rnd3 = Math.random; Math.random = () => 0.5; g.pressPlace();
  ok('a failed fish calms it but does not tame', !eg.tame && !eg.angry && g.count('魚') === 2);
  Math.random = () => 0.1; g.pressPlace(); Math.random = rnd3;
  ok('a lucky fish tames it', eg.tame && g.count('魚') === 1 && g.tameCount() === 1);
  eg.sta = 30; g.pressPlace();
  ok('feeding a tamed eagle restores 40 stamina', eg.sta === 70 && g.count('魚') === 0, eg.sta);
  await sleep(80);
  ok('companion panel shows the eagle with two vertical bars', document.querySelectorAll('#companions .comp').length === 1 && document.querySelectorAll('#companions .vbars i').length === 2);
  eg.x = p.x + 3; eg.y = p.y + 3; eg.moveT = 0; eg.atk = 0; w.set(p.x + 5, p.y, '草'); const prey = g.ents.add('虎', p.x + 5, p.y, { moveT: 99, calm: 99, atk: 0 });
  await until(() => prey.hp < 300, 6000);
  ok('a tamed eagle attacks a hostile beast near you and spends stamina', prey.hp < 300 && eg.sta < 70 && prey.foe === eg, [prey.hp, eg.sta]);
  prey.moveT = 0; prey.atk = 0; const eh = eg.hp; await until(() => eg.hp < eh, 4000);
  ok('the beast fights back at the eagle', eg.hp < eh, [eh, eg.hp]);
  g.ents.remove(prey); eg.sta = 100;
  ok('tamed eagles are saved with the world', JSON.stringify(g.ents.serialize()).indexOf('鷹') >= 0);
  g.ents.remove(eg); g.addCourage(0);
  // 鼎與丹：蟾蜍肉分有無毒；前三顆 8%／12%，之後 1%／2%；前五十顆每顆命上限 +3，之後 +0.5
  trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']); g.addItem('鐵', 3); g.addItem('石', 4); g.addItem('鎢鋼', 1); g.addItem('精煤', 2); p.sta = 100; g.craft('cauldron');
  face(0, 1); w.set(T().x, T().y, '土'); hold('鼎'); g.pressPlace(); const ding = T();
  ok('a cauldron is crafted and placed, cold until fuelled', w.get(ding.x, ding.y) === '鼎' && !w.stoveLit(ding.x, ding.y));
  g.addItem('木', 1); hold('木'); g.pressPlace();
  ok('v0.8.14: F facing a 鼎 opens its panel like the stove — nothing is used up; cold, so the pills and the three brews are greyed out', !hidden('ding') && g.dingAt === ding.x + ',' + ding.y && g.count('木') === 1 && /冷/.test(document.getElementById('ding-fire').textContent) && document.querySelectorAll('#ding-pill button[disabled]').length === 2 && document.querySelectorAll('#ding-brew button').length === 3 && document.querySelectorAll('#ding-brew button[disabled]').length === 3, [hidden('ding'), g.dingAt, document.getElementById('ding-fire').textContent]);
  ok('v0.8.14: …the brew rows say what each needs (熬蜃珠、鑄虎符、煉朱羽, nine pieces, 83%)', ['熬蜃珠', '鑄虎符', '煉朱羽'].every(s => document.getElementById('ding-brew').textContent.indexOf(s) >= 0) && /蜃殘體 0\/9/.test(document.getElementById('ding-brew').textContent) && /83%/.test(document.getElementById('ding-brew').textContent), document.getElementById('ding-brew').textContent);
  document.querySelector('#ding-fuel button[data-fuel="木"]').click();
  ok('wood fuels the cauldron like a stove (clicked in the 鼎 panel)', w.stoveLit(ding.x, ding.y) && g.count('木') === 0 && /火旺/.test(document.getElementById('ding-fire').textContent));
  await press('KeyE', 30); ok('v0.8.14: E closes the 鼎 panel', hidden('ding') && !g.dingAt);
  g.ents.list = g.ents.list.filter(e => e.type !== '蟾'); face(1, 0); w.set(T().x, T().y, '草');
  const td = g.ents.add('蟾', T().x, T().y, { moveT: 99, venom: true }); hold('石劍'); for (let i = 0; i < 3; i++) { p.atkT = 0; g.pressGather(); }
  ok('a venomous toad drops 毒蟾肉', !g.ents.list.includes(td) && g.count('毒蟾肉') === 1, bag());
  g.addItem('蟾蜍肉', 5); p.pillsMade = 0; p.pillsEaten = 0; p.hpMax = 100;
  ok('pill odds: 8%/12% for the first three pills, then 1%/2%', g.pillChance('蟾蜍肉') === 0.08 && g.pillChance('毒蟾肉') === 0.12 && (() => { p.pillsMade = 3; const r = g.pillChance('蟾蜍肉') === 0.01 && g.pillChance('毒蟾肉') === 0.02; p.pillsMade = 0; return r; })());
  face(0, 1); hold('蟾蜍肉'); const rndP = Math.random; Math.random = () => 0.5; p.sta = 50; g.pressPlace(); g.dingMake('蟾蜍肉');
  ok('a failed refinement burns the meat', g.count('蟾蜍肉') === 4 && g.count('丹') === 0 && p.pillsMade === 0);
  await sleep(30); ok('v0.8.14: lit, with 蟾蜍肉 in the bag, the pill button is live and shows the odds', !document.querySelector('#ding-pill button[data-make="蟾蜍肉"]').disabled && /8%/.test(document.getElementById('ding-pill').textContent), document.getElementById('ding-pill').textContent);
  Math.random = () => 0.05; document.querySelector('#ding-pill button[data-make="蟾蜍肉"]').click(); Math.random = rndP; g.closeDing();
  ok('a successful refinement yields a 丹', g.count('丹') === 1 && p.pillsMade === 1 && g.count('蟾蜍肉') === 3);
  hold('丹'); g.useItem();
  ok('eating a pill raises max hp by 3 (first fifty)', p.hpMax === 103 && p.pillsEaten === 1, p.hpMax);
  p.pillsEaten = 50; p.hpMax = 250; g.addItem('丹', 2); hold('丹'); g.useItem(); const after51 = p.hpMax; hold('丹'); g.useItem();
  ok('from the fifty-first pill each adds half a point, not rounded (250.5, 251)', after51 === 250.5 && p.hpMax === 251 && p.pillsEaten === 52, [after51, p.hpMax]);
  p.hp = p.hpMax; await sleep(60);
  ok('hp bar and label follow the raised maximum', document.getElementById('hplabel').textContent.indexOf('251') >= 0, document.getElementById('hplabel').textContent);
  face(1, 0); p.cour = g.levelAt(16); g.addItem('內襯', 1); g.addItem('布褲', 1); g.addItem('布甲', 1); g.addItem('布帽', 1); g.addItem('鎢鋼靴', 1); for (const n of ['內襯', '布褲', '布甲', '布帽', '鎢鋼靴']) { hold(n); g.pressPlace(); }
  face(1, 0); w.set(T().x, T().y, '草'); const rt = g.ents.add('虎', T().x, T().y, { moveT: 99, calm: 99 }); hold('石劍'); p.atkT = 0; g.pressGather();
  ok('damage dealt keeps four decimals (40 × 1.15 × (1 + 0.05/3) = 46.7667)', Math.abs(rt.hp - (300 - 46.7667)) < 1e-9, rt.hp);
  p.hp = 100; g.hit({ type: '虎', x: p.x + 1, y: p.y }, 20);
  ok('damage taken keeps four decimals (20 × 5/3 × 0.83 = 27.6667)', Math.abs(p.hp - (100 - 27.6667)) < 1e-9, p.hp);
  g.ents.remove(rt); for (const k of ['襯', '褲', '甲', '盔', '靴']) g.takeOff(k); trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']); p.cour = 0; p.hp = 100; p.hurtT = 0;
  p.hpMax = 100; p.hp = 100; p.pillsEaten = 0; p.pillsMade = 0; g.removeItem('丹', 9); g.removeItem('蟾蜍肉', 9); g.removeItem('毒蟾肉', 9); w.set(ding.x, ding.y, '土');
  // 龜：少見不咬人，命二百五（v0.6）；龜甲卜之，吉則五日無魄
  face(1, 0); w.set(T().x, T().y, '草'); const tu = g.ents.add('龜', T().x, T().y, { moveT: 99 }); hold('石劍');
  for (let i = 0; i < 6; i++) { p.atkT = 0; g.pressGather(); }
  ok('a turtle takes seven sword blows (250 hp): six leave it at 10', tu.hp === 10 && g.ents.list.includes(tu), tu.hp);
  p.san = 80; p.atkT = 0; g.pressGather();
  ok('a slain turtle leaves a 龜甲', !g.ents.list.includes(tu) && g.count('龜甲') === 1);
  ok('killing a turtle is ill-omened: 愜意 −30', Math.abs(p.san - 50) < 1, p.san);
  hold('龜甲'); Math.random = () => 0.9; g.useItem();
  ok('a bad omen wastes the shell', g.count('龜甲') === 0 && g.peaceDays() === 0);
  g.addItem('龜甲', 1); hold('龜甲'); Math.random = () => 0.1; g.useItem(); Math.random = rnd3;
  ok('a good omen: five days without ghosts', g.peaceDays() === 5 && (() => { const t0 = w.time; w.time = Math.floor((p.noGhostUntil - DAY) / DAY) * DAY + DAY * 0.93; const inside = !g.ghostNight(); w.time = Math.floor(p.noGhostUntil / DAY) * DAY + DAY * 1.93; const after = g.ghostNight(); w.time = t0; return inside && after; })(), [g.peaceDays()]);
  p.noGhostUntil = 0;
  // 漁網：棉麻草織小網，四小成中，四中或十三小成大（v0.5.1 起是撒網）
  trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']); g.removeItem('草', 99); g.removeItem('魚', 99);
  g.addItem('棉', 26); g.addItem('麻', 26); g.addItem('草', 39);
  for (let i = 0; i < 13; i++) { p.sta = 100; g.craft('net'); }
  ok('thirteen small nets from cotton, hemp and grass', g.count('漁網') === 13 && g.count('棉') === 0 && g.count('麻') === 0 && g.count('草') === 0, bag());
  p.sta = 100; g.craft('bignet13');
  ok('thirteen small nets weave one big net', g.count('大漁網') === 1 && g.count('漁網') === 0);
  g.addItem('漁網', 16); for (let i = 0; i < 4; i++) { p.sta = 100; g.craft('midnet'); }
  ok('four small nets weave a medium net', g.count('中漁網') === 4 && g.count('漁網') === 0);
  p.sta = 100; g.craft('bignet');
  ok('four medium nets weave a big net', g.count('大漁網') === 2 && g.count('中漁網') === 0);
  // 撒網（v0.5.1）：拿著網走到水邊，水上浮出網影；F 瞬間撒出，網影裡的魚一網打盡；耐久照網到幾條扣：0 條 1、1 條 2、2 條 4、3 條以上 7
  {
    const PX = p.x, PY = p.y, area = [];
    for (let dx = -1; dx <= 4; dx++) for (let dy = -3; dy <= 3; dy++) { const x = PX + dx, y = PY + dy; area.push([x, y, w.raw(x, y)]); w.set(x, y, dx <= 0 ? '土' : '水'); }
    g.ents.list = g.ents.list.filter(e => e.type !== '魚'); p.cour = 0;
    const fishAt = (x, y) => g.ents.add('魚', x, y, { moveT: 99 }), shadow = () => { const cp = g.castPreview(); return cp ? cp.cells.map(c => (c[0] - PX) + ':' + (c[1] - PY)).sort().join(',') : ''; };
    face(-1, 0); hold('漁網'); g.addItem('漁網', 2); hold('漁網');
    ok('holding a small net by the water shows its shadow on the water, even facing inland', shadow() === '1:0', shadow());
    hold('木'); ok('holding anything else shows no shadow', g.castPreview() === null);
    face(1, 0); hold('大漁網');
    ok('the big net\'s shadow is three by three, out from the shore and centred, never over your feet', shadow() === '1:-1,1:0,1:1,2:-1,2:0,2:1,3:-1,3:0,3:1', shadow());
    const inside = [fishAt(PX + 1, PY), fishAt(PX + 2, PY + 1), fishAt(PX + 3, PY - 1)], outside = fishAt(PX + 4, PY), f0 = g.count('魚'), c0 = p.cour; g.msgText = '';
    g.pressPlace(); const big = g.held();
    ok('F casts the big net at once: the three fish in its shadow are caught, the one outside is not', g.count('魚') === f0 + 3 && inside.every(e => !g.ents.list.includes(e)) && g.ents.list.includes(outside) && g.msgText.indexOf('網到 3 條魚') >= 0, [g.count('魚') - f0, g.msgText]);
    ok('three or more fish cost 7 durability: one net is split off the pile and kept in hand (240 → 233)', big && big.n === '大漁網' && big.dur === 233 && big.c === 1 && g.count('大漁網') === 2 && g.durText(big) === '耐 233', [big && big.dur, bag()]);
    ok('each fish caught is a point of courage (3 × 1.25 = 3.75)', Math.abs(p.cour - c0 - 3.75) < 1e-9, p.cour - c0);
    g.pressPlace(); ok('an empty cast costs 1', big.dur === 232 && g.msgText.indexOf('空的') >= 0, [big.dur, g.msgText]);
    fishAt(PX + 2, PY); g.pressPlace(); ok('one fish costs 2', big.dur === 230, big.dur);
    fishAt(PX + 1, PY + 1); fishAt(PX + 3, PY); g.pressPlace(); ok('two fish cost 4', big.dur === 226, big.dur);
    for (let i = 0; i < 5; i++) fishAt(PX + 1 + (i % 3), PY - 1 + Math.floor(i / 3)); g.pressPlace(); ok('five fish still cost 7', big.dur === 219, big.dur);
    big.dur = 3; for (let i = 0; i < 3; i++) fishAt(PX + 1 + i, PY); g.msgText = ''; g.pressPlace();
    ok('a cast that costs more than is left tears the net (3 − 7 → 0), and the fish are still caught', big.dur === 0 && g.msgText.indexOf('網破了') >= 0, [big.dur, g.msgText]);
    const fT = g.count('魚'); fishAt(PX + 2, PY); g.msgText = ''; g.pressPlace();
    ok('a torn net cannot be cast', g.count('魚') === fT && g.msgText.indexOf('破了') >= 0 && g.castPreview().torn, g.msgText);
    g.msgText = ''; g.msgUntil = 0; g.updateHUD(); ok('the hint for a torn net in hand points to mending', document.getElementById('msg').textContent.indexOf('網破了') >= 0, document.getElementById('msg').textContent);
    g.ents.list = g.ents.list.filter(e => e.type !== '魚');
    // 加固：囊裡選中那張網在製作欄「加固」，同一張棉麻各 1、2、4、8、8
    g.removeItem('棉', 99); g.removeItem('麻', 99); g.addItem('棉', 30); g.addItem('麻', 30); p.sel = p.bag.indexOf(big);
    const mcost = []; for (let i = 0; i < 5; i++) { const c = g.count('棉'); big.dur = 1; p.sta = 50; g.craft('mendnet'); mcost.push(c - g.count('棉')); }
    ok('mending the same net from the craft panel costs 1, 2, 4, 8, 8 of each and fills it to 240', mcost.join(',') === '1,2,4,8,8' && big.dur === 240 && big.rf === 5 && g.count('麻') === 7, [mcost, big.dur, big.rf]);
    g.craftCat = '全部'; g.buildCraft(); const mrow = Array.from(document.querySelectorAll('#craft-list .recipe')).find(r => r.textContent.indexOf('加固') >= 0);
    ok('the craft row reads this net as its sixth mend at eight each', !!mrow && mrow.textContent.indexOf('第 6 次：棉麻各 8') >= 0, mrow && mrow.textContent);
    g.addItem('棉', 10); g.addItem('麻', 10); g.msgText = ''; g.craft('mendnet'); ok('a whole net is not mended', g.msgText.indexOf('不用加固') >= 0 && big.rf === 5, g.msgText);
    p.sel = p.bag.findIndex(x => x.n === '大漁網' && x.dur === undefined); g.msgText = ''; g.craft('mendnet'); ok('nor is a fresh one', g.msgText.indexOf('不用加固') >= 0, g.msgText);
    // 小網、灘、深水、朝北撒
    face(1, 0); hold('漁網'); fishAt(PX + 1, PY); const fS = g.count('魚'); g.pressPlace(); const small = g.held();
    ok('a small net catches the fish right in front: 30 − 2 = 28', g.count('魚') === fS + 1 && small.n === '漁網' && small.dur === 28, [g.count('魚') - fS, small && small.dur]);
    w.set(PX + 1, PY, '淼'); fishAt(PX + 1, PY); const fD = g.count('魚'); g.pressPlace();
    ok('a cast net works over deep water too', g.count('魚') === fD + 1, g.count('魚') - fD);
    w.set(PX + 1, PY, '灘'); setDay(0.83); ok('over the flats at high tide the shadow shows', shadow() === '1:0' && w.get(PX + 1, PY) === '水', shadow());
    setDay(0.53); ok('at low tide the flats are sand: no shadow, F says to find water', shadow() === '' && w.get(PX + 1, PY) === '沙' && (g.msgText = '', g.pressPlace(), g.msgText.indexOf('水邊') >= 0), [shadow(), g.msgText]);
    w.set(PX + 1, PY, '水'); w.set(PX, PY - 1, '水'); w.set(PX, PY - 2, '水'); face(0, -1); g.addItem('中漁網', 1); hold('中漁網');
    ok('a medium net facing north from the shore spreads north, not over your feet', shadow() === '0:-1,0:-2,1:-1,1:-2', shadow());
    g.ents.list = g.ents.list.filter(e => e.type !== '魚');
    // 舊存檔裡下在水上的網：照舊進魚、E 取魚，空網收回成撒網（帶著耐久）
    w.set(PX + 1, PY, '水'); face(1, 0); const old = w.addNet(PX + 1, PY, 1, w.time); const fL = g.count('魚'); w.time += 200; g.action = null; g.pressGather();
    ok('an old net left in the water still fills with fish (two in 200 s) and E takes them', w.get(PX + 1, PY) === '網' && g.count('魚') === fL + 2 && old.dur === 28, [g.count('魚') - fL, old.dur]);
    old.dur = 7; old.rf = 6; g.save(); const svn = JSON.parse(localStorage.getItem('xieyi.save.v5')); const nrec = Object.values(svn.world.nets).find(v => v[1] === PX + 1 && v[2] === PY);
    ok('the save keeps an old net\'s durability and mends', !!nrec && nrec[6] === 7 && nrec[7] === 6, nrec);
    g.load(svn); const old2 = w.netAt(PX + 1, PY); ok('and loading brings them back', !!old2 && old2.dur === 7 && old2.rf === 6, old2);
    const shipsTmp = p.bag.filter(x => G.item(x.n) && G.item(x.n).span); p.bag = p.bag.filter(x => !shipsTmp.includes(x));   // 船佔的格先挪開，免得囊滿（v0.8.3 起孤帆兩格、方舟五格）
    g.pressGather(); takeYes(); p.bag.push(...shipsTmp); g.barSig = '';
    ok('taken back, the old net becomes a cast net in the bag with its durability', w.get(PX + 1, PY) === '水' && p.bag.some(x => x.n === '漁網' && x.dur === 7 && x.rf === 6), bag());
    for (const [x, y, c] of area) w.set(x, y, c); g.ents.list = g.ents.list.filter(e => e.type !== '魚');
    g.removeItem('棉', 99); g.removeItem('麻', 99); p.cour = 0;
  }
  g.removeItem('魚', 99); g.removeItem('大漁網', 9); g.removeItem('漁網', 9); g.removeItem('中漁網', 9);
  // 雪域與熱氣（v0.4.12）：離雪五格內待過五息暖才多掉、越待越快；烤的東西給九十息熱氣、累積一百五十；有熱氣時凍不傷命。雨裡燈的損壞率看難度
  ok('lamp ruin odds per difficulty: easy 1/4500, normal 1/2500, hard 1/800; the world carries the current one', XIEYI.DIFF.easy.lampP === 1 / 4500 && XIEYI.DIFF.normal.lampP === 1 / 2500 && XIEYI.DIFF.hard.lampP === 1 / 800 && w.rainLampP === 1 / 2500, w.rainLampP);
  {
    const sx = p.x + 5, sy = p.y, keep = w.raw(sx, sy), lining = p.worn['襯']; p.worn['襯'] = null; setDay(0.53); hold('石子'); p.heatT = 0;
    const dwAt = (sec) => { p.snowT = sec; p.warm = 50; g.updateStats(1); return p.warm - 50; };
    const base = dwAt(0); w.set(sx, sy, '雪');
    ok('a snow tile five away counts as the snow zone; under five seconds the warmth changes as usual', w.nearChar(p.x, p.y, '雪', 5) && Math.abs(dwAt(3) - base) < 1e-6 && Math.abs(p.snowT - 4) < 1e-9, [dwAt(3), base, p.snowT]);
    const d6 = dwAt(5), d20 = dwAt(19), d60 = dwAt(60);
    ok('past five seconds it drops 1.1 more a second, 2.5 more at twenty, and tops out at 4 more', Math.abs((base - d6) - 1.1) < 1e-6 && Math.abs((base - d20) - 2.5) < 1e-6 && Math.abs((base - d60) - 4) < 1e-6 && toasts().indexOf('寒氣逼人') >= 0, [base - d6, base - d20, base - d60]);
    w.set(sx, sy, '雪'); w.set(p.x + 6, p.y, '雪'); w.set(sx, sy, keep);
    ok('six away is outside the zone: the timer resets', Math.abs(dwAt(30) - base) < 1e-6 && p.snowT === 0, [dwAt(30), base]); w.set(p.x + 6, p.y, w.base(p.x + 6, p.y) === '雪' ? '土' : w.base(p.x + 6, p.y));
    g.addItem('烤肉', 2); hold('烤肉'); p.food = 10; g.msgText = ''; g.useItem();
    ok('roast meat gives ninety seconds of heat', Math.abs(p.heatT - 90) < 1e-9 && g.msgText.indexOf('熱氣 90 息') >= 0, [p.heatT, g.msgText]);
    hold('烤肉'); p.food = 10; g.useItem();
    ok('a second helping tops it up to the cap of 150', Math.abs(p.heatT - 150) < 1e-9, p.heatT);
    g.addItem('烤魚', 1); hold('烤魚'); p.food = 10; g.useItem(); ok('roast fish counts too (still capped)', Math.abs(p.heatT - 150) < 1e-9, p.heatT);
    await sleep(60); ok('the 暖 label shows the heat', document.getElementById('warmlabel').textContent.indexOf('熱') >= 0, document.getElementById('warmlabel').textContent);
    setDay(0.93); p.warm = 0; p.hp = 50; p.food = 100; p.sta = 100; p.san = 100; p.hurtT = 0; p.poisonT = 0; g.updateStats(1);
    ok('with heat in the belly freezing costs no hp', p.hp >= 50 && p.heatT > 148 && p.heatT < 150 && p.warm === 0, [p.hp, p.heatT, p.warm]);
    p.heatT = 0; p.hp = 50; g.updateStats(1);
    ok('without it the cold takes three a second', Math.abs(p.hp - 47) < 1e-6, p.hp);
    p.heatT = 42; g.save(); const svh = JSON.parse(localStorage.getItem('xieyi.save.v5')); p.heatT = 0; g.load(svh);
    ok('heat survives a save and load', Math.abs(p.heatT - 42) < 1e-9, p.heatT);
    p.worn['襯'] = lining; setDay(0.53); p.warm = 100; p.hp = 100; p.heatT = 0; p.snowT = 0; g.removeItem('烤肉', 9); g.removeItem('烤魚', 9);
  }
  // v0.4.13：膽氣加成看難度；神兵減益看難度、兩件只算一重、困難掉力；錦囊六個；跨過燈；櫃裡自動歸類；回血門檻七成五含暖；霧障八方飄、會換形
  {
    const l0 = p.cour; p.cour = 0;
    g.diff = XIEYI.DIFF.hard; g.addCourage(20, 'kill'); const ch = p.cour; p.cour = 0;
    g.diff = XIEYI.DIFF.easy; g.addCourage(20, 'kill'); const ce = p.cour; p.cour = 0;
    g.diff = XIEYI.DIFF.normal; const cn = g.addCourage(20, 'kill');
    ok('courage gains scale by difficulty: 20 becomes 23 on hard, 28 on easy, 25 on normal (and addCourage returns it)', ch === 23 && ce === 28 && cn === 25 && p.cour === 25, [ch, ce, cn]);
    p.cour = l0;
    g.addItem('燭龍焚溟', 1);
    ok('燭龍焚溟 alone counts as a god weapon: on normal courage decays every three days down to 27', g.hasGod() && g.decayDays() === 3 && g.decayFloor() === 27);
    g.addItem('九閽鳴雷', 1);
    ok('both together are still one debuff', g.hasGod() && g.decayDays() === 3 && g.decayFloor() === 27);
    g.diff = XIEYI.DIFF.hard; ok('hard: two days, floor 26', g.decayDays() === 2 && g.decayFloor() === 26 && g.godText() === '攜神兵：廿六重以上二日一減', g.godText());
    g.diff = XIEYI.DIFF.easy; ok('easy: four days, floor 28', g.decayDays() === 4 && g.decayFloor() === 28);
    g.diff = XIEYI.DIFF.hard; setDay(0.53); p.sta = 50; p.swimming = false; const m0 = g.mult(); g.updateStats(1);
    ok('on hard a god weapon on you drains 0.3 stamina a second (net of the usual regen)', Math.abs(p.sta - (50 + 0.5 * m0 - 0.3)) < 1e-6, [p.sta, m0]);
    g.diff = XIEYI.DIFF.normal; p.sta = 50; g.updateStats(1);
    ok('on normal it does not', Math.abs(p.sta - (50 + 0.5 * m0)) < 1e-6, p.sta);
    g.removeItem('燭龍焚溟', 9); g.removeItem('九閽鳴雷', 9); p.tools = p.tools.filter(s => s.n !== '燭龍焚溟' && s.n !== '九閽鳴雷'); if (p.tool >= p.tools.length) p.tool = p.tools.length - 1; g.barSig = '';
    ok('without them the plain rule is back: three days, floor 31', !g.hasGod() && g.decayDays() === 3 && g.decayFloor() === 31);
    const pch = p.pouches; p.pouches = 8; g.addItem('錦囊', 1); hold('錦囊'); g.msgText = ''; g.useItem();
    ok('eight pouches is the cap (v0.6.10): 32 bag slots, 14 tool slots, a ninth is refused', p.pouches === 8 && g.slots() === 32 && g.toolSlots() === 14 && g.count('錦囊') === 1 && g.msgText.indexOf('八個') >= 0, [g.slots(), g.toolSlots(), g.msgText]);
    g.removeItem('錦囊', 9); p.pouches = pch; g.barSig = '';
    face(1, 0); const lx = T().x, ly = T().y, keepL = w.raw(lx, ly); w.set(lx, ly, '燈');
    ok('a lamp blocks beasts but not you', g.pass(lx, ly) && !g.ents.canStand('狼', lx, ly, true) && !g.ents.canStand('虎', lx, ly, true), [g.pass(lx, ly)]);
    const px0 = p.x, py0 = p.y; p.moveT = 0; g.tryStep(1, 0);
    ok('stepping east onto the lamp works', p.x === px0 + 1 && w.get(p.x, p.y) === '燈', [p.x - px0, w.get(p.x, p.y)]);
    p.x = p.rx = px0; p.y = p.ry = py0; p.moveT = 0; w.set(lx, ly, keepL);
    {
      face(0, 1); const cx = T().x, cy = T().y, keepC = w.raw(cx, cy); w.set(cx, cy, '櫃'); g.openChest(T());
      const box = w.chests.get(g.chestAt); box.length = 0;
      box.push({ n: '木', c: 3 }, { n: '烤魚', c: 1 }, { n: '布帽', c: 1, dur: 100 }, { n: '石', c: 2 }, { n: '木', c: 5 }, { n: '磚', c: 2 }, { n: '石刀', c: 1, dur: 10 });
      g.sortChest(box);
      ok('the chest merges the two 木 stacks and sorts tools, wear, building, food, then materials by strokes', box.map(s => s.n + (s.c > 1 ? s.c : '')).join(',') === '石刀,布帽,磚2,烤魚,木8,石2', box.map(s => s.n + s.c).join(','));
      g.addItem('木', 2); const wi = p.bag.findIndex(s => s.n === '木'), mv = p.bag[wi].c; g.moveStack('bag', wi);
      ok('moving more 木 in lands in the same stack', box.filter(s => s.n === '木').length === 1 && box.find(s => s.n === '木').c === 8 + mv, box.map(s => s.n + s.c).join(','));
      g.closeChest(); box.length = 0; w.chests.delete(cx + ',' + cy); w.set(cx, cy, keepC);
    }
    setDay(0.53); p.hp = 50; p.hurtT = 0; p.food = 76; p.san = 76; p.sta = 76; p.warm = 70; p.heatT = 0; p.poisonT = 0; g.updateStats(0.5);
    ok('warmth below 75 blocks regeneration even with the other three above it', p.hp <= 50 + 1e-9, p.hp);
    p.warm = 76; p.hp = 50; g.updateStats(0.5);
    ok('with all four at 75 or more hp regenerates', p.hp > 50, p.hp);
    p.hp = 100; p.food = 100; p.san = 100; p.sta = 100; p.warm = 100;
    { for (const id of [...w.fogs.keys()]) w.removeFog(id); const X = p.x, Y = p.y + 3;
      for (let dx = -7; dx <= 7; dx++) for (let dy = 0; dy <= 10; dy++) w.set(X + dx, Y + dy, '草');
      unarm(); p.worn['帽'] = null; g.removeItem('火把', 99); g.removeItem('蠟燭', 99); p.sel = 0;
      const fog = w.addFog(null, w.time + DAY, false, window.World.newFogShape(18), [X + 1.5, Y + 5.5]);
      const rel = () => { const cs = [...fog.cells].map(k => k.split(',').map(Number)), mx = Math.min(...cs.map(c => c[0])), my = Math.min(...cs.map(c => c[1])); return cs.map(([x, y]) => (x - mx) + ':' + (y - my)).sort().join('|'); };
      const dirs = new Set(); let sizes = true, land = true, moves = 0, morphs = 0, last = rel();
      for (let i = 0; i < 40; i++) {
        const gx = fog.gx, gy = fog.gy; w.moveFog(fog, X, Y - 30);
        if (fog.gx !== gx || fog.gy !== gy) { moves++; dirs.add((Math.round(Math.atan2(fog.gy - gy, fog.gx - gx) / (Math.PI / 4)) + 8) % 8); }
        const cells = [...fog.cells].map(k => k.split(',').map(Number)); if (cells.length < 5 || cells.length > 30) sizes = false; if (!cells.every(([x, y]) => w.fogLand(x, y))) land = false;
        fog.age += 90; const sh = rel(); if (sh !== last) morphs++; last = sh;
      }
      ok('with no light a fog drifts in several directions, keeps 5–30 cells, never turns back, and keeps changing shape', dirs.size >= 3 && moves === 40 && sizes && morphs >= 10, [[...dirs], moves, sizes, morphs]);
      w.removeFog(fog.id); }
  }
  // v0.5：魄加強——身上的光只逼得退、地上的光三格內才煙滅；撲燈、吹熄手裡的光、燈帽燒三倍；夜越深越多越快、蝕心更狠；屋外有魄而屋裡沒燈愜意緩掉
  {
    const tKeep = w.time, X = p.x, Y = p.y; w.time = DAY * 12 + DAY * 0.98;
    for (const [k] of w.stoves) w.stoves.set(k, 0);
    for (let dx = -12; dx <= 12; dx++) for (let dy = -12; dy <= 12; dy++) if (w.info(X + dx, Y + dy).light) w.set(X + dx, Y + dy, '白');
    g.ents.list = g.ents.list.filter(e => '魄龍'.indexOf(e.type) < 0); if (p.worn['帽']) g.takeOff('帽'); p.snuffT = 0; p.san = 100; p.insane = false; p.ctrl = true;
    const cheb = (e) => U.cheb(e.x, e.y, p.x, p.y), tick = () => g.ents.update(0.01, g);
    g.ents.dashT = 99; g.addItem('火把', 2); hold('火把');
    const ga = g.ents.add('魄', X + 3, Y, { moveT: 0 }); tick();
    ok('a held torch no longer burns a 魄: it steps back instead', !(ga.fade < 1) && cheb(ga) === 4, [ga.fade, cheb(ga)]);
    for (let i = 0; i < 6; i++) { ga.moveT = 0; tick(); }
    ok('it backs off to the edge of the light, seven to nine tiles away', cheb(ga) >= 7 && cheb(ga) <= 9 && g.ents.list.includes(ga), cheb(ga));
    let band = true; for (let i = 0; i < 12; i++) { ga.moveT = 0; tick(); if (cheb(ga) < 7 || cheb(ga) > 9) band = false; }
    ok('while you hold the light it hovers in that band', band && g.ents.list.includes(ga), cheb(ga));
    const sx = Math.sign(ga.x - X) || 1, lx = ga.x + 3 * sx, ly = ga.y, keepL = w.raw(lx, ly);
    for (let d = -2; d <= 3; d++) for (let e2 = -1; e2 <= 1; e2++) w.set(ga.x + d * sx, ga.y + e2, '草');   // 魄飄到哪是隨機的：先把那一帶清空，免得前面測試留下的磚擋了光
    w.set(lx, ly, '燈');
    const gb = g.ents.add('魄', ga.x - sx, ga.y, { moveT: 99 }); tick();
    ok('a lamp burns a 魄 within three tiles, not four', ga.fade < 1 && !(gb.fade < 1), [ga.fade, gb.fade]);
    w.set(lx, ly, keepL); g.ents.remove(ga); g.ents.remove(gb);
    g.ents.snuffP = 1; const gc = g.ents.add('魄', X + 2, Y, { moveT: 99 }); g.msgText = ''; tick();
    ok('a 魄 within two tiles blows out the torch in your hand: no light for eight seconds', p.snuffT === 8 && !g.hasLight() && g.msgText.indexOf('吹熄') >= 0 && toasts().indexOf('吹燈') >= 0, [p.snuffT, g.hasLight(), g.msgText]);
    g.ents.snuffP = 0; p.burn['火把'] = 0; g.updateStats(1);
    ok('a blown-out torch does not burn down', (p.burn['火把'] || 0) === 0 && Math.abs(p.snuffT - 7) < 1e-9 && !g.hasLight(), [p.burn['火把'], p.snuffT]);
    g.ents.remove(gc); p.snuffT = 0.5; g.msgText = ''; g.updateStats(1);
    ok('after the eight seconds it lights again', p.snuffT === 0 && g.hasLight() && g.msgText.indexOf('又點著了') >= 0, [p.snuffT, g.msgText]);
    hold('木'); g.addItem('燈帽', 1); hold('燈帽'); g.wearItem(p.sel); hold('木'); const hat = p.worn['帽']; hat.fuel = 300; p.san = 100;   // 手裡要空著光，燈帽才燒
    const gd = g.ents.add('魄', X + 1, Y + 1, { moveT: 99 }); g.updateStats(1);
    ok('a 魄 within two tiles makes the hat candle burn three times as fast', !!hat && Math.abs(hat.fuel - 297) < 1e-9, hat && hat.fuel);
    g.ents.remove(gd); g.updateStats(1);
    ok('without it the candle burns at the usual rate', Math.abs(hat.fuel - 296) < 1e-9, hat.fuel);
    g.takeOff('帽'); g.removeItem('燈帽', 9);
    hold('火把'); g.ents.dashT = 0; const ge = g.ents.add('魄', X + 8, Y, { moveT: 99 }); tick();
    ok('every eight to fourteen seconds the nearest hovering 魄 dashes in at the light', ge.dash > 2 && cheb(ge) === 7 && g.ents.dashT >= 8 && g.ents.dashT <= 14, [ge.dash, cheb(ge), g.ents.dashT]);
    for (let i = 0; i < 8; i++) { ge.moveT = 0; tick(); }
    ok('the dash runs right up to you', cheb(ge) <= 1, cheb(ge));
    ge.dash = 0; ge.moveT = 0; tick();
    ok('when the dash is over it backs off again', cheb(ge) === 2, cheb(ge));
    g.ents.remove(ge); g.ents.dashT = 1e9;
    w.time = DAY * 12 + DAY * 0.98; const cap13 = g.ghostCap(); w.time = DAY * 32 + DAY * 0.98; const cap33 = g.ghostCap();
    g.diff = XIEYI.DIFF.hard; w.time = DAY * 39 + DAY * 0.98; const capH = g.ghostCap(); g.diff = XIEYI.DIFF.normal;
    ok('the deeper the nights the more 魄: two on night 13, up to eight (ten on hard)', cap13 === 2 && cap33 === 8 && capH === 10, [cap13, cap33, capH]);
    const spAt = (n) => { w.time = DAY * (n - 1) + DAY * 0.98; return g.ghostSpeed(); };
    ok('from night twenty they get a tenth faster every four nights, up to double', spAt(19) === 1 && Math.abs(spAt(20) - 1.1) < 1e-9 && Math.abs(spAt(23) - 1.1) < 1e-9 && Math.abs(spAt(24) - 1.2) < 1e-9 && spAt(200) === 2, [spAt(19), spAt(20), spAt(24), spAt(200)]);
    w.time = DAY * 23 + DAY * 0.98; hold('木'); const gf = g.ents.add('魄', X + 5, Y, { moveT: 0 }); tick();
    ok('on night twenty-four a chasing 魄 steps every 0.375 s (0.45 ÷ 1.2)', Math.abs(gf.moveT - 0.375) < 1e-9 && cheb(gf) === 4, [gf.moveT, cheb(gf)]);
    g.ents.remove(gf);
    w.time = DAY * 12 + DAY * 0.98; const gg = g.ents.add('魄', X + 3, Y, { moveT: 99 }); p.san = 80; p.sta = 80; g.updateStats(1); const dropN = 80 - p.san;
    g.diff = XIEYI.DIFF.hard; p.san = 80; g.updateStats(1); const dropH = 80 - p.san; g.diff = XIEYI.DIFF.normal;
    ok('a 魄 within four tiles eats four 愜意 a second (five on hard)', dropN > 4 && dropN < 4.2 && dropH > 5 && dropH < 5.2, [dropN, dropH]);
    const lk = w.raw(X - 2, Y); w.set(X - 2, Y, '燈'); p.san = 80; g.updateStats(1);
    ok('a lamp within three tiles of you counts as light: no drain', 80 - p.san < 0.1, 80 - p.san);
    w.set(X - 2, Y, lk); g.ents.remove(gg);
    const ring = []; for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const x = X + dx, y = Y + dy; ring.push([x, y, w.raw(x, y)]); w.set(x, y, Math.max(Math.abs(dx), Math.abs(dy)) === 2 ? '磚' : '草'); }
    const gh2 = g.ents.add('魄', X + 6, Y, { moveT: 99 }); p.san = 80; g.updateStats(1); const dIn = 80 - p.san;
    ok('indoors without a lamp, a 魄 circling within eight tiles makes 愜意 seep away (0.5 a second)', g.indoors() && dIn > 0.5 && dIn < 0.6 && toasts().indexOf('屋外有魄') >= 0, dIn);
    w.set(X + 1, Y + 1, '燈'); p.san = 80; g.updateStats(1);
    ok('a lamp in the room stops it', 80 - p.san < 0.1, 80 - p.san);
    w.set(X - 1, Y, '床'); const dBefore = g.day(); g.msgText = ''; g.sleep(); await sleep(30);
    ok('with a lamp within three tiles of the bed you can sleep even with a 魄 outside', g.day() === dBefore + 1, [g.day(), g.msgText]);
    for (const [x, y, c] of ring) w.set(x, y, c); g.ents.remove(gh2);
    g.removeItem('火把', 9); p.snuffT = 0; w.time = tKeep; calm();
  }
  // 煤與鐵：山裡有礦；礦二煤一入旺灶煉鐵；煤是好柴
  let coal = 0, iron = 0; for (let x = -60; x <= 60; x++) for (let y = -60; y <= 60; y++) { const b = w.base(x, y); if (b === '煤') coal++; else if (b === '鐵') iron++; }
  ok('coal seams and iron veins spawn in the mountains', coal >= 5 && iron >= 3, [coal, iron]);
  g.addItem('石鎬', 1); face(0, 1); w.set(T().x, T().y, '鐵'); hold('石鎬'); g.action = null; g.pressGather(); await until(() => !g.action, 12000);
  ok('mining an iron vein with a pickaxe gives 鐵礦×2 and leaves 石', g.count('鐵礦') === 2 && w.get(T().x, T().y) === '石', bag());
  w.set(T().x, T().y, '灶'); w.addFuel(T().x, T().y, 100); g.pressPlace(); g.stoveCook('鐵礦');
  ok('ore without coal does not smelt', !hidden('stove') && g.count('鐵') === 0 && g.count('鐵礦') === 2);
  g.addItem('煤', 2); g.buildStove();
  ok('the panel lists 鐵礦 with its extra coal and the 煉 verb', (document.querySelector('#stove-cook button[data-cook="鐵礦"]') || {}).textContent.indexOf('煉') >= 0 && !document.querySelector('#stove-cook button[data-cook="鐵礦"]').disabled);
  g.stoveCook('鐵礦');
  ok('two ore and one coal on a lit stove smelt one 鐵', g.count('鐵') === 1 && g.count('鐵礦') === 0 && g.count('煤') === 1, bag());
  const f0 = w.stoveFuel(T().x, T().y); g.stoveFuel('煤');
  ok('coal is strong fuel (+150)', Math.abs(w.stoveFuel(T().x, T().y) - f0 - 150) < 1 && g.count('煤') === 0, w.stoveFuel(T().x, T().y) - f0);
  g.closeStove();
  w.set(T().x, T().y, '土'); hold('石劍'); p.hurtT = 0;
  // 鋼具與鎢鋼具：鐵二木一煤一鍛鋼具（140%）；鐵礦脈 1/18 真隨機出鎢礦（v0.6.3）；八煤成精煤；鎢礦一鐵礦二精煤一煉鎢鋼；鎢鋼具 150%／耐久 200%
  trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']); g.addItem('鐵', 2); g.addItem('木', 1); g.addItem('煤', 1); p.sta = 100; g.craft('forge', '鋼劍');
  ok('a steel sword: 56 damage and 56 durability (140% of stone)', !!tool('鋼劍') && tool('鋼劍').dur === 56 && G.ITEMS['鋼劍'].dmg === 56 && g.count('鐵') === 0, bag());
  { const sw = tool('鋼劍'); hold('鋼劍'); const peb0 = g.count('石子'), sc = []; g.addItem('鐵', 30);
    for (let i = 0; i < 5; i++) { const c0 = g.count('鐵'); sw.dur = 3; p.sta = 50; g.craft('regrind'); sc.push(c0 - g.count('鐵')); }
    ok('v0.6.3: a steel tool is mended with 鐵 1, 2, 4, 8, 8 — no pebbles', sc.join(',') === '1,2,4,8,8' && sw.dur === 56 && g.count('石子') === peb0, sc);
    g.removeItem('鐵', 99); }
  ok('v0.6.3: iron veins hide tungsten one time in eighteen, by true randomness', Math.abs(G.DB['鐵'].bonus['鎢礦'] - 1 / 18) < 1e-9 && G.DB['鐵'].trueBonus === true);
  const rndT = U.trueRand; U.trueRand = () => 0.9; face(0, 1); w.set(T().x, T().y, '鐵'); hold('石鎬'); g.action = null; g.pressGather(); await until(() => !g.action, 12000);
  const noLuck = g.count('鎢礦') === 0;
  U.trueRand = () => 0.05; w.set(T().x, T().y, '鐵'); g.action = null; g.pressGather(); await until(() => !g.action, 12000); U.trueRand = rndT;
  ok('a lucky swing (true random under 1/18) on an iron vein yields 鎢礦; an unlucky one does not', noLuck && g.count('鎢礦') === 1 && g.count('鐵礦') >= 4, bag());
  g.addItem('煤', 8); p.sta = 100; g.craft('coke');
  ok('eight coal make one refined coal', g.count('精煤') === 1 && g.count('煤') === 0);
  w.set(T().x, T().y, '灶'); w.addFuel(T().x, T().y, 100); g.removeItem('鎢礦', 9); g.removeItem('鐵礦', 9); g.addItem('鎢礦', 1); g.addItem('鐵礦', 2); g.pressPlace(); g.stoveCook('鎢礦'); g.closeStove();
  ok('tungsten ore + two iron ore + refined coal smelt one 鎢鋼', g.count('鎢鋼') === 1 && g.count('鎢礦') === 0 && g.count('鐵礦') === 0 && g.count('精煤') === 0, bag());
  g.addItem('鎢鋼', 1); g.addItem('木', 1); g.addItem('精煤', 1); p.sta = 100; p.food = 80; g.craft('forgew', '鎢鋼劍');
  ok('a tungsten-steel sword: 84 damage, 112 durability', !!tool('鎢鋼劍') && tool('鎢鋼劍').dur === 112 && G.ITEMS['鎢鋼劍'].dmg === 84, bag());
  tool('鎢鋼劍').dur = 5; hold('鎢鋼劍'); g.removeItem('鐵', 99); g.removeItem('鎢鋼', 99); g.addItem('鐵', 1); p.sta = 50; p.food = 50; g.craft('regrind');
  ok('regrinding tungsten steel costs 8 stamina and 10 food (and the first time 鐵 1)', tool('鎢鋼劍').dur === 112 && p.sta === 42 && Math.round(p.food) === 40 && g.count('鐵') === 0, [p.sta, p.food]);
  { const ws = tool('鎢鋼劍'), wc = []; g.addItem('鐵', 30); g.addItem('鎢鋼', 9);
    for (let i = 0; i < 4; i++) { const i0 = g.count('鐵'), t0 = g.count('鎢鋼'); ws.dur = 3; p.sta = 50; p.food = 50; g.craft('regrind'); wc.push((i0 - g.count('鐵')) + '+' + (t0 - g.count('鎢鋼'))); }
    ok('v0.6.3: a tungsten tool then costs 鐵 2; 鐵 3 + 鎢鋼 1; 鐵 6 + 鎢鋼 2; and 鐵 6 + 鎢鋼 2 from then on', wc.join(',') === '2+0,3+1,6+2,6+2' && ws.dur === 112, wc);
    g.removeItem('鐵', 99); g.removeItem('鎢鋼', 99); }
  w.set(T().x, T().y, '土');   // 面向灶按 F 是開灶，穿衣甲要先轉開
  g.addItem('鎢鋼甲', 1); hold('鎢鋼甲'); g.pressPlace(); const wv = p.worn['甲'];
  ok('tungsten armour: 22% (160% of iron, rounded) and 360 days', !!wv && Math.abs(G.ITEMS['鎢鋼甲'].red - 0.22) < 1e-9 && Math.round(wv.dur / DAY) === 360, wv && wv.dur / DAY);
  wv.wm = 3; wv.dur = 1000; g.addItem('鐵', 1); p.sta = 50; p.food = 50; g.repairWorn('甲');
  ok('repairing tungsten armour costs 12 stamina and 15 food; the first time 鐵 1', Math.round(wv.dur / DAY) === 360 && wv.wm === 1.5 && g.count('鐵') === 0 && p.sta === 38 && Math.round(p.food) === 35, [p.sta, p.food]);
  { const ac = []; g.addItem('鐵', 30); g.addItem('鎢鋼', 9);
    for (let i = 0; i < 4; i++) { const i0 = g.count('鐵'), t0 = g.count('鎢鋼'); wv.dur = 1000; p.sta = 50; p.food = 50; g.repairWorn('甲'); ac.push((i0 - g.count('鐵')) + '+' + (t0 - g.count('鎢鋼'))); }
    ok('v0.6.3: tungsten armour then costs 鐵 2; 鐵 3 + 鎢鋼 1; 鐵 6 + 鎢鋼 2; and so on', ac.join(',') === '2+0,3+1,6+2,6+2' && wv.rg === 5, ac);
    g.removeItem('鐵', 99); g.removeItem('鎢鋼', 99); }
  g.takeOff('甲'); g.removeItem('鎢鋼甲', 9); p.tools = p.tools.filter(s => s.n !== '鋼劍' && s.n !== '鎢鋼劍'); p.tool = -1; hold('石劍'); p.food = 80;
  w.set(T().x, T().y, '土');
  p.cour = g.levelAt(33) + 5; p.decayAt = 0; await sleep(150);
  ok('above level 31 a three-day decay timer starts', g.level() === 33 && p.decayAt > w.time && !hidden('courdecay'), [g.level(), p.decayAt - w.time]);
  w.time = p.decayAt + 0.5; await sleep(150);
  ok('three days later courage drops one level', g.level() === 32 && toasts().indexOf('膽氣衰減') >= 0, g.level());
  w.time = p.decayAt + 0.5; await sleep(150);
  ok('but never below level 31', g.level() === 31 && p.decayAt === 0 && hidden('courdecay'), g.level());
  p.cour = 0; p.decayAt = 0;
  document.getElementById('btn-pause').click(); const tp = w.time; await sleep(150);
  ok('pause button stops the world', g.paused && !hidden('pause') && w.time === tp);
  await press('Escape', 20); await sleep(60);
  ok('Esc resumes', !g.paused && hidden('pause'));
  document.getElementById('btn-map').click(); await sleep(60); const mo = !hidden('map'); document.getElementById('map-close').click(); await sleep(30);
  ok('map button opens the big map', mo && hidden('map'));
  const tl0 = p.tool; await press('KeyP', 20); await sleep(30);
  ok('P cycles the tool in hand', p.tools.length > 0 && p.tool !== tl0, [tl0, p.tool]); hold('石劍');
  ok('vital bars keep the same margin top and bottom', document.getElementById('hpfill').style.getPropertyValue('--p') !== '' && getComputedStyle(document.getElementById('hpfill')).height !== '');
  // 力：取一次 −1，打一下 −1，力盡掉血
  p.cour = 0; p.sta = 50; hold('木'); face(0, 1); w.set(T().x, T().y, '草'); g.action = null; g.pressGather(); await until(() => !g.action, 4000);
  ok('gathering costs one stamina', p.sta < 49.9 && p.sta > 48, p.sta);
  p.sta = 90; p.food = 90; p.san = 90; p.warm = 90; p.hp = 50; p.hurtT = 0; p.cour = 0; await until(() => p.hp > 50.3, 3000);
  ok('hp regenerates when food, warmth, sanity and stamina are at 75 or more', p.hp > 50.3, p.hp);
  // 瓶與酒
  calm();   // 真時間裡夜裡的魄會把人吸到神志不清，手腳不聽使喚就取不了水
  g.addItem('沙', 3); face(0, 1); w.set(T().x, T().y, '灶'); w.addFuel(T().x, T().y, 300); g.pressPlace(); g.stoveCook('沙'); g.closeStove();
  ok('three sand on a lit stove make two bottles', g.count('玻璃瓶') === 2 && g.count('沙') === 0, bag());
  face(1, 0); w.set(T().x, T().y, '水'); g.ents.list = g.ents.list.filter(e => !(e.x === T().x && e.y === T().y)); hold('玻璃瓶'); g.pressGather();   // 隨機刷出來的生靈若剛好站在面前，先挪開
  ok('empty bottle takes seawater', g.count('海水瓶') === 1 && g.count('玻璃瓶') === 1, [g.count('海水瓶'), g.count('玻璃瓶'), g.msgText, !!g.action, g.canAct(), (g.ents.at(T().x, T().y) || {}).type, w.get(T().x, T().y), g.held() && g.held().n]);
  face(0, 1); g.pressPlace(); g.stoveCook('海水瓶'); g.closeStove();
  ok('seawater distils on the stove', g.count('淡水瓶') === 1 && g.count('海水瓶') === 0);
  hold('玻璃瓶'); const quan = w.places.find(x => x.id === 'quan'); goNextTo(quan.x, quan.y); g.pressGather();
  ok('empty bottle at the spring takes fresh water', g.count('淡水瓶') === 2 && g.count('玻璃瓶') === 0);
  g.addItem('醉果', 2); p.sta = 50; g.craft('wine');
  ok('two drunk fruit and fresh water make wine', g.count('果酒') === 1 && g.count('醉果') === 0 && g.count('淡水瓶') === 1);
  p.food = 50; p.san = 50; hold('果酒'); g.useItem();
  ok('wine +12 food +20 sanity and returns the bottle', Math.round(p.food) === 62 && Math.round(p.san) === 70 && g.count('玻璃瓶') === 1, [p.food, p.san]);
  // 醉果：昏迷六十息、五倍速、周圍照常；醒來飽 +2 愜意 +1 力 −5
  g.addItem('醉果', 1); hold('醉果'); p.food = 50; p.san = 50; p.sta = 50; const t0k = w.time; g.useItem();
  ok('drunk fruit knocks you out', p.knock === 60 && !hidden('knock'));
  await sleep(1000);
  ok('knockout runs the world at the same pace as the countdown', p.knock < 59 && Math.abs((60 - p.knock) - (w.time - t0k)) < 0.3, [p.knock, w.time - t0k]);
  p.food = 50; p.san = 50; p.sta = 50; p.knock = 0.1; await until(() => p.knock <= 0, 3000);   // 醒來前重設，免得快慢不同的畫格數影響判定
  ok('waking gives +2 food +1 sanity −5 stamina', hidden('knock') && p.food > 51.7 && p.food <= 52.01 && p.san > 50.8 && p.san <= 51.01 && p.sta > 44.8 && p.sta < 45.6, [p.food, p.san, p.sta]);
  // 櫃
  face(0, -1); w.set(T().x, T().y, '土'); g.addItem('櫃', 1); hold('櫃'); g.pressPlace();
  ok('placed a chest', w.get(T().x, T().y) === '櫃' && w.chests.has(T().x + ',' + T().y));
  g.pressGather(); ok('chest opens', !hidden('chest') && g.chestAt);
  const nBag = p.bag.length; g.moveStack('bag', 0);
  ok('moving a stack into the chest', p.bag.length === nBag - 1 && w.chests.get(g.chestAt).length === 1);
  g.moveStack('chest', 0); ok('and back', p.bag.length === nBag && w.chests.get(g.chestAt).length === 0);
  g.removeItem('果', 99); g.addItem('果', 2, { d: g.day() - 7 }); g.moveStack('bag', p.bag.findIndex(s => s.n === '果')); const inChest = w.chests.get(g.chestAt)[0]; g.moveStack('chest', 0);
  ok('fruit keeps each piece\'s age through a chest', inChest.n === '果' && g.count('果') === 2 && p.bag.find(s => s.n === '果').ds.every(d => d === g.day() - 7), JSON.stringify(p.bag.find(s => s.n === '果')));
  g.removeItem('果', 99);
  g.addItem('石', 1); g.moveStack('bag', p.bag.findIndex(x => x.n === '石')); const ck2 = g.chestAt, inside2 = w.chests.get(ck2).length; document.getElementById('chest-take').click(); takeYes();
  const boxItem = p.bag.find(x => x.n === '櫃' && x.store);
  ok('a chest with things inside can be taken down and keeps them', hidden('chest') && !w.chests.has(ck2) && inside2 === 1 && !!boxItem && boxItem.store.length === 1 && boxItem.store[0].n === '石' && w.get(...ck2.split(',').map(Number)) === '白', boxItem && boxItem.store);
  g.addItem('櫃', 1); ok('a plain chest does not stack onto one that holds things', p.bag.filter(x => x.n === '櫃').length === 2 && boxItem.c === 1);
  p.sel = p.bag.indexOf(boxItem); face(0, -1); w.set(T().x, T().y, '土'); g.pressPlace();
  ok('placing it again puts the things back inside', w.get(T().x, T().y) === '櫃' && (w.chests.get(T().x + ',' + T().y) || []).length === 1 && w.chests.get(T().x + ',' + T().y)[0].n === '石' && !p.bag.includes(boxItem) && g.count('櫃') === 1);
  g.pressGather(); g.moveStack('chest', 0); document.getElementById('chest-take').click(); takeYes(); g.removeItem('石', 99);
  ok('an empty chest comes back as a plain chest', g.count('櫃') === 2 && !p.bag.some(x => x.n === '櫃' && x.store));
  // 船：放在淺水，上船，渡深水，到海邊渡海（先離開泉邊，免得面前是地標）
  p.x = p.rx = g.spawn.x; p.y = p.ry = g.spawn.y; g.closeRead();
  face(1, 0); for (let dy = -1; dy <= 2; dy++) for (let dx = 0; dx <= 2; dx++) w.set(T().x + dx, T().y + dy, '水'); hold('孤帆'); g.pressPlace();
  ok('a 孤帆 placed facing east is one by two lying east–west, starting at the tile in front (v0.8.21)', w.get(T().x, T().y) === '舟' && w.get(T().x + 1, T().y) === '舟' && w.get(T().x + 1, T().y + 1) !== '舟' && w.shipAt(T().x, T().y).cells.length === 2 && w.shipAt(T().x + 1, T().y) === w.shipAt(T().x, T().y) && w.shipAt(T().x, T().y).kind === '孤帆' && w.shipAt(T().x, T().y).dir === 'h');
  p.cour = g.levelAt(31); g.pressGather(); await sleep(300);
  ok('boarded the ship: both tiles are water again and you stand on the tile you faced', p.sailing && w.get(p.x, p.y) === '水' && w.get(p.x + 1, p.y) === '水' && w.ships.size === 0 && p.ship && p.ship.kind === '孤帆' && g.onDeck(p.x, p.y) && g.onDeck(p.x + 1, p.y) && !g.onDeck(p.x + 1, p.y + 1) && g.shipCells().length === 2);
  { const bx = p.ship.x0 + 2, deep = w.get(bx, p.y); w.set(bx, p.y, '淼'); p.moveT = 0; const ok1 = g.shipStep(1, 0); p.moveT = 0;
    ok('sailing passes deep water (the ship moves one tile with you aboard)', ok1 && g.onDeck(bx, p.y)); g.shipStep(-1, 0); p.moveT = 0; w.set(bx, p.y, deep); }
  g.jumpTo(0, G.SEA_EDGE + 1); await sleep(200);
  ok('v0.7: the old sea edge (113) is open water now, not the end of the paper', !p.crossed && hidden('voyage'), [p.crossed]);
  g.jumpTo(0, G.WORLD_R); await sleep(200);
  ok('reaching the edge of the 2500×2500 paper triggers the voyage ending', p.crossed && !hidden('voyage'));
  document.getElementById('voyage-back').click(); await sleep(50);
  ok('can turn back', g.paused === false && hidden('voyage'));
  let coastY = G.SEA_EDGE; while (coastY > 0 && G.DB[w.base(0, coastY)].kind === 'water') coastY--;   // 沿 +y 找到海岸，在岸外八格死
  const seaY = coastY + 8;
  p.x = p.rx = 0; p.y = p.ry = seaY; p.sailing = true; p.ship = { kind: '孤帆', hp: 120, skulls: [], repairs: 0 }; p.crossed = false; g.addItem('木', 1); p.hp = 0; await until(() => p.dead, 3000);
  const landBag = [...w.bags.keys()].some(k => { const [x, y] = k.split(',').map(Number); const b = w.base(x, y); return w.get(x, y) === '包' && U.dist(x, y, 0, seaY) < 30 && G.DB[b === '灘' ? '沙' : b].walk > 0 && G.DB[b].kind !== 'water'; });
  const shipLeft = [...w.diff.entries()].some(([k, v]) => v === '舟' && (() => { const [x, y] = k.split(',').map(Number); return U.dist(x, y, 0, seaY) < 30 && w.base(x, y) === '水'; })());
  ok('dying at sea drops the 荷包 on the nearest land and leaves the ship on shallow water', p.dead && landBag && shipLeft, [landBag, shipLeft]);
  await press('Enter', 20); await until(() => !p.dead, 2000); await sleep(80);
  ok('respawn after a sea death is back on land', !p.dead && !p.sailing && w.info(p.x, p.y).walk > 0, [p.dead, p.sailing, p.x, p.y, w.get(p.x, p.y), JSON.stringify(p.home), JSON.stringify(g.spawn)]);
  // 漲潮困在灘上可以涉水走到別的灘
  let beach = null; for (let r = G.ISLAND_R; r <= Math.round(G.ISLAND_R * 1.25) && !beach; r++) for (let a = 0; a < 360 && !beach; a += 2) { const x = Math.round(Math.cos(a * Math.PI / 180) * r), y = Math.round(Math.sin(a * Math.PI / 180) * r); if (w.raw(x, y) === '灘' && w.raw(x + 1, y) === '灘') beach = [x, y]; }
  if (beach) { p.x = p.rx = beach[0]; p.y = p.ry = beach[1]; setDay(0.83); ok('caught by the tide on the causeway you can wade to the next shoal', w.get(beach[0], beach[1]) === '水' && g.pass(beach[0] + 1, beach[1]), beach); p.x = p.rx = g.spawn.x; p.y = p.ry = g.spawn.y; }
  else ok('caught by the tide on the causeway you can wade to the next shoal (no causeway found to test)', true);
  if (beach) {   // 漲潮時灘看起來是水，但船與魚梁不能停在灘上，否則退潮會堵住去燈塔的路；棧可以（v0.8.22 橋併進棧）
    setDay(0.83); p.x = p.rx = beach[0] - 1; p.y = p.ry = beach[1]; face(1, 0); g.addItem('漁', 1); hold('漁'); g.pressPlace();
    const parked = g.parkShip(beach[0], beach[1], true, 60); const pk = parked ? w.base(parked[0], parked[1]) : null; if (parked) w.set(parked[0], parked[1], w.base(parked[0], parked[1]));
    ok('no ship parks and no weir gets built on the causeway at high tide', w.raw(beach[0], beach[1]) === '灘' && g.count('漁') === 1 && parked && pk === '水', [w.raw(beach[0], beach[1]), g.count('漁'), JSON.stringify(parked), pk]);
    g.removeItem('漁', 9);
    g.addItem('棧', 1); hold('棧'); g.pressPlace();
    const bridged = w.get(beach[0], beach[1]) === '棧'; setDay(0.48); const lowWalk = w.walkable(beach[0], beach[1]); setDay(0.83);
    g.action = null; g.pressGather(); takeYes(); await until(() => !g.action, 4000);
    ok('a 棧 may be laid on the causeway (v0.8.22: 橋 and 棧 are one), walkable at both tides, and taking it back leaves the causeway', bridged && lowWalk && w.raw(beach[0], beach[1]) === '灘' && g.count('棧') === 1, [bridged, lowWalk, w.raw(beach[0], beach[1]), g.count('棧'), g.msgText]);
    g.removeItem('棧', 9); p.x = p.rx = g.spawn.x; p.y = p.ry = g.spawn.y;
  }
  p.x = p.rx = g.spawn.x; p.y = p.ry = g.spawn.y; p.sailing = false; p.crossed = false;
  // 草木長回來（計時器）
  face(0, 1); w.set(T().x, T().y, '草'); hold('木'); g.action = null; g.pressGather(); await until(() => !g.action, 4000);
  const tk = T().x + ',' + T().y;
  ok('cut grass is scheduled to regrow in 30 s', w.get(T().x, T().y) === '白' && w.timers.has(tk) && Math.round(w.timers.get(tk).at - w.time) === 30, [w.timers.get(tk), w.get(T().x, T().y), g.msgText, (g.ents.at(T().x, T().y) || {}).type, !!g.action, g.canAct(), p.sailing, p.swimming, g.heldTool && g.heldTool(), g.held() && g.held().n]);
  w.time += 31; w.step(p.x, p.y);
  ok('and it does regrow', w.get(T().x, T().y) === '草');

  // ============ 海：獸首骨、船的命、蜃、落水、燭龍焚溟 ============
  {
    p.x = p.rx = g.spawn.x; p.y = p.ry = g.spawn.y; p.sailing = false; p.swimming = false; p.ship = null;
    trim(['木', '石', '石子', '草', '土', '磚']); for (const t of [...p.tools]) if (t.n !== '石劍') p.tools.splice(p.tools.indexOf(t), 1); p.tool = -1;
    const skull0 = g.skullP; g.skullP = 1; let n0 = g.count('虎首骨'); g.kill(g.ents.add('虎', p.x + 4, p.y, {}));
    const tk = g.count('虎首骨') - n0;
    ok('a slain tiger can leave one or two tiger skulls', tk >= 1 && tk <= 2, tk);
    g.kill(g.ents.add('狼', p.x + 4, p.y, {})); ok('so can a wolf (wolf skulls)', g.count('狼首骨') >= 1);
    g.skullP = 0; g.kill(g.ents.add('豹', p.x + 4, p.y, {})); ok('and no skull when the odds say no', g.count('豹首骨') === 0);
    ok('by default a tiger, leopard or wolf drops a skull 16% of the time', skull0 === 0.16, skull0); g.skullP = skull0; g.removeItem('肉', 99);
    const X = p.x, Y = p.y;
    for (let dx = -3; dx <= 5; dx++) for (let dy = -2; dy <= 2; dy++) w.set(X + dx, Y + dy, dx >= 1 ? '水' : '草');
    const ships0 = w.ships.size;   // 海上死亡的那場已經停了一艘
    w.set(X + 2, Y + 1, '草'); g.addItem('方舟', 1); hold('方舟'); face(1, 0); g.pressPlace();
    ok('a 方舟 needs the 3×3 in front to be water: one grass tile in it and it will not go down', w.ships.size === ships0 && g.count('方舟') === 1 && /三乘三/.test(g.msgText), g.msgText);
    w.set(X + 2, Y + 1, '水'); g.pressPlace();
    const rec = w.shipAt(X + 2, Y + 1);
    ok('with room it takes six 舟 tiles — two by three, facing east it lies east–west (v0.8.21) — and has 420 hp and five skull slots', w.ships.size === ships0 + 1 && rec && rec.kind === '方舟' && rec.hp === 420 && rec.cells.length === 6 && w.get(X + 1, Y) === '舟' && w.get(X + 3, Y + 1) === '舟' && w.get(X + 1, Y - 1) !== '舟' && w.get(X + 4, Y) !== '舟' && G.SHIPS['方舟'].slots === 5, JSON.stringify(rec && rec.cells));
    hold('虎首骨'); g.pressPlace();
    ok('a tiger skull on the bow wards the ship for three days', rec.skulls.length === 1 && rec.skulls[0][0] === '虎首骨' && g.wardDaysOf(rec) === 3);
    hold('狼首骨'); g.pressPlace();
    ok('a second skull wards on its own clock: two skulls, the ship stays warded until the tiger skull weathers (3 days)', rec.skulls.length === 2 && g.wardDaysOf(rec) === 3 && Math.round((rec.skulls[1][1] - w.time) / DAY) === 1);
    g.removeItem('狼首骨', 99); g.addItem('狼首骨', 4);   // 殺狼時三成掉兩個，囊裡先歸成剛好四個
    hold('狼首骨'); g.pressPlace(); g.pressPlace(); g.pressPlace(); const n5 = rec.skulls.length; g.pressPlace();
    ok('a 方舟 holds five skulls, a sixth is refused', n5 === 5 && rec.skulls.length === 5 && g.count('狼首骨') === 1, [n5, rec.skulls.length, g.msgText]);
    g.removeItem('狼首骨', 9);
    g.removeItem('鐵', 99); rec.hp = 100; g.addItem('木板', 3); g.addItem('鐵', 2); hold('木板'); g.pressPlace();
    ok('v0.8.19: the first mend of a 方舟 (plank in hand, F on it) takes 3 planks and 2 iron and brings it to 85% (357)', rec.hp === 357 && rec.repairs === 1 && g.count('木板') === 0 && g.count('鐵') === 0, [rec.hp, g.msgText]);
    rec.hp = 100; g.addItem('木板', 6); hold('木板'); g.pressPlace(); const hp1 = rec.hp; g.addItem('鐵', 6); hold('木板'); g.pressPlace();
    ok('v0.8.19: the second takes 6 planks and 6 iron — without the iron it is refused', hp1 === 100 && rec.hp === 357 && rec.repairs === 2 && g.count('木板') === 0 && g.count('鐵') === 0, [hp1, rec.hp, g.msgText]);
    rec.hp = 175; p.cour = g.levelAt(8);
    g.pressGather(); await sleep(250);
    ok('below level 31 boarding first asks whether to put to sea, in the name of the fearless', !hidden('seaask') && g.paused && !p.sailing && document.querySelector('#seaask h2').textContent.indexOf('敬勇者之無畏') >= 0 && document.getElementById('seaask-text').textContent.indexOf('神兵') >= 0);
    await press('KeyN', 20); await sleep(50);
    ok('N turns back', hidden('seaask') && !g.paused && !p.sailing && w.ships.size === ships0 + 1);
    g.pressGather(); await sleep(100); await press('KeyY', 20); await sleep(250);
    ok('Y puts to sea: hull hp, skulls and repairs come along, the six tiles are water again', p.sailing && p.ship && p.ship.kind === '方舟' && p.ship.hp === 175 && p.ship.skulls.length === 5 && p.ship.repairs === 2 && g.shipWarded() && w.ships.size === ships0 && w.get(X + 2, Y + 1) === '水');
    p.cour = g.levelAt(31);
    p.moveT = 0; g.shipStep(1, 0); const arkStep = p.stepDur; p.moveT = 0; g.jumpTo(X + 1, Y);
    ok('a 方舟 sails at 60% of a 孤帆\'s speed', Math.abs(arkStep - 0.14 / 0.6) < 1e-6, arkStep);
    w.time += 1.1 * DAY; g.update(0.01);
    ok('after a day the four wolf skulls weather away with a message and the tiger skull still wards the ship', p.ship.skulls.length === 1 && p.ship.skulls[0][0] === '虎首骨' && g.msgText.indexOf('風化') >= 0 && g.shipWarded(), [p.ship.skulls.length, g.msgText]);
    w.time -= 1.1 * DAY;
    let m = g.ents.add('蜃', X + 4, Y, { moveT: 0, atk: 0, fogT: 999 }); await sleep(1500);
    ok('the 蜃 will not ram a ship with a skull on the bow', p.ship.hp === 175 && g.ents.list.includes(m), p.ship.hp);
    p.ship.skulls = []; m.x = m.rx = X + 3; m.y = m.ry = Y; m.moveT = 0; m.atk = 0;
    await until(() => p.ship && p.ship.hp < 175, 5000);
    ok('without a ward the 蜃 rams the hull for 25', p.ship && p.ship.hp === 150, p.ship && p.ship.hp);
    p.ship.hp = 10; m.x = m.rx = X + 2; m.y = m.ry = Y; m.moveT = 0; m.atk = 0;
    await until(() => p.swimming, 6000); g.ents.remove(m);
    ok('when the ship breaks you fall into the sea with sixty breaths to reach land', p.swimming && !p.sailing && !p.ship && p.swimT > 50 && p.swimT <= 60, [p.swimming, p.swimT]);
    p.swimming = false; const dm = g.dmgMult(), dr = g.ironDrain(); p.swimming = true;
    ok('swimming: weapons ×0.75, food, ease and stamina drain ×2', Math.abs(g.dmgMult() - dm * 0.75) < 1e-9 && Math.abs(g.ironDrain() - dr * 2) < 1e-9);
    const st0 = p.sta; g.updateStats(1);
    ok('swimming: stamina falls instead of recovering', p.sta < st0, [st0, p.sta]);
    g.ents.list = g.ents.list.filter(e => !(e.x === X && e.y === Y)); w.set(X, Y, '草'); p.moveT = 0; const stepped = g.tryStep(-1, 0);
    ok('reaching land ends the swim', stepped && !p.swimming && w.info(p.x, p.y).kind !== 'water', [stepped, p.x, p.y, w.get(p.x, p.y)]);
    const keep = JSON.parse(JSON.stringify({ bag: p.bag, tools: p.tools, cour: p.cour }));
    const hpDrown = [p.hp, p.food, p.warm, p.sta, p.poisonT, JSON.stringify(p.lastHit)]; p.x = p.rx = X + 2; p.y = p.ry = Y; p.swimming = true; p.swimT = 0.3; await until(() => p.dead, 4000);
    const dtx = document.getElementById('dead-text').textContent;
    ok('not reaching land in time drowns you', p.dead && dtx.indexOf('溺死') >= 0, [dtx.slice(0, 40), hpDrown]);
    await press('Enter', 20); await until(() => !p.dead, 3000);
    for (const [k] of [...w.bags]) { const [bx, by] = k.split(',').map(Number); w.set(bx, by, '白'); }
    p.bag = keep.bag; p.tools = keep.tools; p.tool = -1; p.cour = keep.cour; g.barSig = '';
    ok('after drowning you wake on land, no longer swimming', !p.swimming && !p.sailing && w.info(p.x, p.y).kind !== 'water');
    g.ents.seaP = 1; await sleep(1800); const onLand = g.ents.count('蜃');
    p.x = p.rx = 0; p.y = p.ry = G.SEA_EDGE - 8; p.sailing = true; p.ship = { hp: 200, ward: 0, skull: '' };
    await until(() => g.ents.count('蜃') > 0, 5000); const rose = g.ents.count('蜃');
    g.ents.seaP = 0; g.ents.list = g.ents.list.filter(e => e.type !== '蜃');
    ok('a 蜃 rises only when you are at sea', onLand === 0 && rose === 1, [onLand, rose, g.paused, p.sailing, p.dead, p.x, p.y, w.get(p.x, p.y), g.ents.spawnAcc, g.ents.seaP, [...document.querySelectorAll('.overlay:not(.hidden)')].map(o => o.id).join(',')]);
    const sf = w.spawnSeaFog(0, G.SEA_EDGE - 4, 0, G.SEA_EDGE - 12);
    ok('the 蜃 breathes fog onto open water only', sf && sf.sea && [...sf.cells].every(k => { const [x, y] = k.split(',').map(Number); return w.fogSea(x, y); }), sf && sf.cells.size);
    if (sf) w.removeFog(sf.id);
    p.sailing = false; p.ship = null; p.x = p.rx = X; p.y = p.ry = Y; await sleep(100);
    p.cour = g.levelAt(31); for (const [n, c] of [['鎢鋼', 4], ['精煤', 6], ['火把', 4], ['海水瓶', 3]]) g.addItem(n, c); p.sta = 100; g.craft('seagod');
    ok('燭龍焚溟 is made at level 31 with tungsten steel, refined coal, torches and sea water; 120 damage, 199 durability', !!tool('燭龍焚溟') && tool('燭龍焚溟').dur === 199 && G.ITEMS['燭龍焚溟'].dmg === 120 && g.count('海水瓶') === 0);
    hold('燭龍焚溟'); face(1, 0);
    const sm = g.ents.add('蜃', X + 2, Y, { moveT: 99, atk: 9, fogT: 999 }), tg = g.ents.add('虎', X - 2, Y, { moveT: 99, calm: 99 });
    p.atkT = 0; p.sta = 100; g.pressGather();
    const full = U.r4(g.godDmg('燭龍焚溟') * g.dmgMult()), half = U.r4(g.godDmg('燭龍焚溟') * g.dmgMult() * 0.5);
    ok('燭龍焚溟 burns the 蜃 for full damage and a tiger for half (v0.8.10: the 蜃 has 1100 on normal; god weapons +4%)', Math.abs(sm.hp - (1100 - full)) < 1e-6 && Math.abs(tg.hp - (300 - half)) < 1e-6, [sm.hp, tg.hp, full, half]);
    p.sailing = true; p.ship = { kind: '孤帆', hp: 120, skulls: [], repairs: 0 }; p.atkT = 0; p.sta = 100; g.pressGather();
    ok('swung from the deck it scorches your own ship for a tenth', p.ship && Math.abs(p.ship.hp - (120 - U.r4(full * 0.1))) < 1e-6, p.ship && p.ship.hp);
    p.ship.hp = 5; p.atkT = 0; g.pressGather();
    ok('and can burn through your own hull', !p.sailing && p.swimming, [p.sailing, p.swimming]);
    p.swimming = false; p.swimT = 0;
    g.addItem('九閽鳴雷', 1); hold('九閽鳴雷'); p.atkT = 0; p.sta = 100; const s1 = sm.hp, t1 = tg.hp; g.pressGather();
    ok('九閽鳴雷 does only half to the 蜃 and full to the tiger', Math.abs(s1 - sm.hp - half) < 1e-6 && Math.abs(t1 - tg.hp - full) < 1e-6, [s1 - sm.hp, t1 - tg.hp]);
    g.ents.remove(sm); g.ents.remove(tg);
    for (const n of ['燭龍焚溟', '九閽鳴雷']) { const i = p.tools.findIndex(s => s.n === n); if (i >= 0) p.tools.splice(i, 1); g.removeItem(n, 9); }
    p.tool = -1; p.cour = 0; p.decayAt = 0;
    g.save(); const sv2 = JSON.parse(localStorage.getItem('xieyi.save.v5'));
    ok('ship records and swimming are saved', sv2.world.ships && 'ship' in sv2.player && sv2.player.swimming === false);
    // 沒解決的蜃：存檔裡有牠，讀檔後牠散了，膽氣減五重
    const mm = g.ents.add('蜃', X + 4, Y, { moveT: 99, fogT: 999 }); p.cour = g.levelAt(12) + 10; g.save(); const sv3 = JSON.parse(localStorage.getItem('xieyi.save.v5')); g.ents.remove(mm);
    ok('an unresolved 蜃 is written into the save', sv3.ents.some(e => e.t === '蜃'));
    g.ents.list = g.ents.list.filter(e => e.type !== '龍' && !e.tame); g.load(sv3);
    ok('loading drops the 蜃 and five courage levels, keeping the progress within the level', g.ents.count('蜃') === 0 && g.level() === 7 && Math.abs(p.cour - (g.levelAt(7) + 10 / g.levelCost(12) * g.levelCost(7))) < 1e-4, [g.level(), p.cour]);
    ok('vital bars carry three scale marks and tools wear a durability ring', getComputedStyle(document.querySelector('.bar'), '::after').backgroundPosition.split(',').length === 3 && (() => { g.addItem('石刀', 1); g.barSig = ''; g.buildBag(); return !!document.querySelector('#toolbar .slot.ringed .ring'); })());
    p.cour = 0;
    p.x = p.rx = g.spawn.x; p.y = p.ry = g.spawn.y;
  }

  // ============ 霧障：每日兩擲；走進去問要不要用扇子；不用就五樣各掉一成，不致命 ============
  {
    for (const id of [...w.fogs.keys()]) w.removeFog(id);
    const near1 = (f) => [...f.cells].some(k => { const [x, y] = k.split(',').map(Number); return Math.abs(x - p.x) <= 1 && Math.abs(y - p.y) <= 1; });
    const connected = (f) => { const all = [...f.cells], seen = new Set([all[0]]), q = [all[0]]; while (q.length) { const [x, y] = q.shift().split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + ',' + (y + dy); if (f.cells.has(k) && !seen.has(k)) { seen.add(k); q.push(k); } } } return seen.size === f.cells.size; };
    w.fogP = 1; w.fogPlan = []; const d0 = Math.floor(w.time / DAY); w.fogDay = d0; w.time = (d0 + 1) * DAY + 1; w.step(p.x, p.y);
    const planned = w.fogPlan.length; w.time = (d0 + 2) * DAY - 0.001; w.step(p.x, p.y); w.fogP = 0;   // 到當日最後一刻：兩場都該起了
    const fs = [...w.fogs.values()];
    ok('a new day rolls twice for fog (odds forced to 1): two patches of 10–30 tiles (v0.6.4: about eighteen tiles of area) rising on land, none on the player', planned === 2 && fs.length === 2 && fs.every(f => f.cells.size >= 10 && f.cells.size <= 30 && f.shape.area >= 16 && f.shape.area <= 20 && !near1(f) && w.fogLand(Math.floor(f.x), Math.floor(f.y))), [planned, fs.map(f => f.cells.size), w.fogMiss, w.fogNoSeed, p.x, p.y, w.get(p.x, p.y)]);
    const shapes = new Set(); for (let i = 0; i < 10; i++) { const f = w.spawnFog(p.x, p.y); if (!f) continue; const cs = [...f.cells].map(k => k.split(',').map(Number)), mx = Math.min(...cs.map(c => c[0])), my = Math.min(...cs.map(c => c[1])); shapes.add(cs.map(([x, y]) => (x - mx) + ':' + (y - my)).sort().join(' ')); }
    ok('fog shapes vary', shapes.size >= 4, shapes.size);
    for (const id of [...w.fogs.keys()]) w.removeFog(id);
    // 自己擺一片霧在東邊兩格
    const X = p.x, Y = p.y; for (let dx = 1; dx <= 4; dx++) w.set(X + dx, Y, '草');
    const mk = () => w.addFog([(X + 1) + ',' + Y, (X + 2) + ',' + Y], w.time + DAY);
    const stand = (x) => { p.x = p.rx = x; p.y = p.ry = Y; };
    const snap = () => ({ hp: p.hp, food: p.food, warm: p.warm, sta: p.sta, san: p.san });
    const tolled = (a, b) => ['hp', 'food', 'warm', 'sta', 'san'].every(k => Math.abs(b[k] - (a[k] - U.r4(a[k] * 0.1))) < 1e-6);
    p.knock = 0; p.sailing = false; p.inFog = 0; g.removeItem('扇', 99); p.hp = 80; p.food = 50; p.warm = 60; p.sta = 40; p.san = 70;
    let f1 = mk(); stand(X + 1); await until(() => !hidden('fogask'), 3000);
    const noFanText = document.getElementById('fogask-text').textContent;
    ok('walking into fog pops the question and pauses the world; without a fan only "walk through" is offered', !hidden('fogask') && g.paused && noFanText.indexOf('沒有扇子') >= 0 && hidden('fogask-use'), noFanText);
    let s0 = snap(); document.getElementById('fogask-no').click(); const s1 = snap();
    ok('without a fan: hp, food, warmth, stamina and ease each lose a tenth (to four decimals)', tolled(s0, s1) && !g.paused && p.inFog === f1.id, [JSON.stringify(s0), JSON.stringify(s1)]);
    stand(X + 2); await sleep(200);
    ok('moving about inside the same fog does not ask again', hidden('fogask'));
    stand(X); await sleep(150); g.addItem('扇', 2); stand(X + 1); await until(() => !hidden('fogask'), 3000);
    ok('leaving and walking back in asks again, now offering the fan', !hidden('fogask') && !hidden('fogask-use') && document.getElementById('fogask-use').textContent.indexOf('2') >= 0);
    s0 = snap(); document.getElementById('fogask-use').click(); const s2 = snap();
    ok('using a fan blows the whole fog away, costs one fan and nothing else', g.count('扇') === 1 && !w.fogs.has(f1.id) && !w.fogAt(X + 2, Y) && ['hp', 'food', 'warm', 'sta', 'san'].every(k => s2[k] === s0[k]) && !g.paused);
    stand(X); await sleep(150); f1 = mk(); stand(X + 1); await until(() => !hidden('fogask'), 3000);
    s0 = snap(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', bubbles: true })); const s3 = snap(); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyN', bubbles: true }));
    ok('N refuses: the fan is kept and the toll is paid', hidden('fogask') && g.count('扇') === 1 && tolled(s0, s3) && w.fogs.has(f1.id), [JSON.stringify(s0), JSON.stringify(s3)]);
    w.removeFog(f1.id); stand(X); await sleep(150); p.hp = 1; f1 = mk(); stand(X + 1); await until(() => !hidden('fogask'), 3000); await press('KeyN', 20); await sleep(30);
    ok('the fog toll is never lethal', p.hp >= 1 && !p.dead, p.hp);
    w.removeFog(f1.id); stand(X); p.hp = 80; await sleep(100);
    const f2 = w.addFog([(X + 3) + ',' + Y, (X + 4) + ',' + Y], w.time + DAY); hold('扇'); g.useItem();
    ok('a fan in hand blows away fog within three tiles (V)', !w.fogs.has(f2.id) && g.count('扇') === 0);
    g.addItem('草', 4); g.addItem('木', 1); p.sta = 100; g.craft('fan');
    ok('a fan is four grass and one wood', g.count('扇') === 1);
    const f3 = w.addFog([(X + 3) + ',' + Y], w.time + DAY), f4 = w.addFog([(X + 4) + ',' + Y], w.time + 1);
    const w2 = new window.World(w.seed); w2.restore(w.serialize());
    ok('fogs are saved and restored', w2.fogs.size === w.fogs.size && !!w2.fogAt(X + 3, Y), w2.fogs.size);
    w.time += 2; w.step(p.x, p.y);
    ok('a fog left alone fades after its time', !w.fogs.has(f4.id) && w.fogs.has(f3.id));
    w.removeFog(f3.id); g.removeItem('扇', 9);
  }

  // ============ G. 地標、碑、問路、潮汐、存檔 ============
  calm();
  const by = (id) => w.places.find(x => x.id === id);
  const ta = by('ta'); goNextTo(ta.x, ta.y); g.pressGather(); await sleep(30); await press('KeyE', 20);
  ok('塔 reveals the island', w.places.every(x => x.seen) && p.places.ta === 2);
  const ch = by('chuan'); goNextTo(ch.x, ch.y); g.pressGather(); await sleep(30); await press('KeyE', 20);
  ok('船 gives a raft', g.count('竹筏') === 1);
  const mu = by('mu'); goNextTo(mu.x, mu.y); const b0 = g.count('磚'); g.pressGather(); await sleep(30); await press('KeyE', 20);
  ok('墓 gives bricks and pebbles', g.count('磚') === b0 + 6 && g.count('石子') >= 3);
  const dong = by('dong'); goNextTo(dong.x, dong.y); g.pressGather(); await sleep(30); await press('KeyE', 20);
  ok('v0.8: 洞 no longer releases a dragon — it leaves a 青鱗 pointing to the east sea', g.count('青鱗') === 1 && p.scaleTaken && !p.dragon && !p.azure && !g.ents.list.some(e => e.type === '龍') && /青鱗|東海/.test(toasts()));
  { const az = g.ents.add('青龍', p.x - 2, p.y, { moveT: 99 }); face(1, 0);
    g.pressGather(); await sleep(30);
    ok('v0.8: without a 蜃珠 the 青龍 sends you off to slay a 蜃 first', !p.azure && !p.dragon && g.count('青鱗') === 1 && /蜃珠/.test(toasts()));
    g.addItem('蜃珠', 1); g.pressGather(); await sleep(30);
    { const tx = document.getElementById('talk-text').textContent, bl = [...document.querySelectorAll('#talk-row button')].map(b => b.textContent).join('|');
      ok('v0.8.22: with a 蜃珠 the 青龍 asks first — what it teaches, the cross-star (not a must), a button each for 生存之道 and 成就', !!g.talking && !p.azure && g.count('蜃珠') === 1 && /十字星/.test(tx) && /只靠自己/.test(tx) && /水性/.test(tx) && /領取/.test(bl) && /看生存之道/.test(bl) && /看成就/.test(bl), bl);
      g.talkPick(1); await sleep(30); const hp = document.getElementById('help'); const helpOpen = !hp.classList.contains('hidden'); hp.classList.add('hidden');
      g.pressGather(); await sleep(30); g.talkPick(2); await sleep(30); const jn = document.getElementById('journal');
      ok('v0.8.22: …生存之道 opens the help; 看成就 opens the journal at the achievements, with the line about relying on no one; the pearl is still yours', helpOpen && !jn.classList.contains('hidden') && !!document.getElementById('j-feats') && /誰都不靠、只靠自己/.test(document.getElementById('journal-body').textContent) && !p.azure && g.count('蜃珠') === 1);
      jn.classList.add('hidden'); g.pressGather(); await sleep(30); g.talkPick(3); const no = !p.azure && g.count('蜃珠') === 1; g.pressGather(); await sleep(30); g.talkPick(0); await sleep(30);
      ok('v0.8.22: 先不 keeps the pearl; 領取 takes it', no && p.azure); }
    ok('v0.8: with a 蜃珠 the 青龍 takes it (and the scale) and teaches ship mending', p.azure && g.count('蜃珠') === 0 && g.count('青鱗') === 0 && /求教青龍/.test(toasts()));
    await sleep(80);
    ok('v0.8.2: no small dragon follows (v0.8.22: the 龍魂 third stays uncoloured until 修蛇 falls, and a cross-star sits on it)', !p.dragon && !g.ents.list.some(e => e.type === '龍') && document.getElementById('soulring').classList.contains('sq') && !document.getElementById('soulring').classList.contains('q') && !document.getElementById('soulring').classList.contains('sb') && getComputedStyle(document.querySelector('#soulring .star.q')).display === 'block' && getComputedStyle(document.querySelector('#soulring .star.b')).display === 'none' && /^rgba\(28, ?26, ?23/.test(getComputedStyle(document.getElementById('soulring')).getPropertyValue('--q').trim()));   // v0.8.21：魂環是斃大魔王的戰利品，只求教過是淡色
    g.ents.remove(az); }
  { const dr = g.ents.add('龍', p.x + 2, p.y + 2, { moveT: 99 }); setDay(0.98);   // 龍的驅魄規則還留著（以後神獸護駕用得上），擺一條來測
    hold('木'); if (p.worn['帽']) g.takeOff('帽'); g.removeItem('燈帽', 9);
    const spot = [[6, 0], [-6, 0], [0, 6], [0, -6]].map(([dx, dy]) => [dr.x + dx, dr.y + dy]).find(([x, y]) => !w.lightNear(x, y, 7) && U.cheb(x, y, p.x, p.y) > 6);
    if (spot) {
      const dir = [Math.sign(spot[0] - dr.x), Math.sign(spot[1] - dr.y)];
      const gh5 = g.ents.add('魄', dr.x + dir[0] * 5, dr.y + dir[1] * 5, { moveT: 99 }), gh4 = g.ents.add('魄', dr.x + dir[0] * 4, dr.y + dir[1] * 4, { moveT: 99 }); dr.moveT = 99;
      await until(() => !g.ents.list.includes(gh4), 4000);
      ok('the dragon dispels 魄 within four tiles, not five', !g.ents.list.includes(gh4) && g.ents.list.includes(gh5), [g.ents.list.includes(gh4), g.ents.list.includes(gh5)]);
      g.ents.remove(gh5);
    } else ok('the dragon dispels 魄 within four tiles, not five (no dark spot to test here)', true);
    g.ents.remove(dr); }
  const cun = by('cun'); const gx = cun.x + 3, gy = cun.y;
  ok('the village is 7×7 with the well in the middle', cun.w === 7 && cun.h === 7 && w.get(cun.x + 3, cun.y + 3) === '井' && w.get(gx, gy) === '門'); w.set(gx, gy - 1, '草'); p.x = p.rx = gx; p.y = p.ry = gy - 1; face(0, 1);
  for (const pl of w.places) if (pl.id !== 'ta') p.places[pl.id] = 1;
  g.pressGather(); await sleep(30);
  ok('village gate gives directions', toasts().indexOf('問路') >= 0, toasts().slice(-30));
  const st = [...w.steles.values()][0]; goNextTo(st.x, st.y); const sm = p.staMax; g.pressGather(); await sleep(30);
  ok('stele raises stamina cap', p.staMax === sm + 10, p.staMax);
  const reach = () => { const sp = g.spawn, d = by('deng'); const seen = new Set([sp.x + ',' + sp.y]); const q = [[sp.x, sp.y]]; while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (seen.has(k)) continue; if (Math.abs(nx - d.x) <= 1 && Math.abs(ny - d.y) <= 1) return true; if (w.walkable(nx, ny)) { seen.add(k); q.push([nx, ny]); } } } reach.last = { n: seen.size, sp: sp.x + ',' + sp.y + ' ' + w.get(sp.x, sp.y), around: [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => w.get(sp.x + dx, sp.y + dy)).join('') }; return false; };
  setDay(0.48); const lo = reach(); setDay(0.83); const hi = reach();
  ok('lighthouse reachable only at low tide', lo && !hi, [lo, hi, JSON.stringify(reach.last)]);
  await press('KeyM', 20); await sleep(50); const mapOpen = !hidden('map'); await press('KeyM', 20); await sleep(30);
  ok('island map toggles', mapOpen && hidden('map'));
  await press('KeyJ', 20); await sleep(30); const jt = document.getElementById('journal-body').textContent; await press('KeyJ', 20);
  ok('journal has places and creatures', jt.indexOf('塔') >= 0 && jt.indexOf('龍') >= 0, jt.slice(jt.indexOf('生靈'), jt.indexOf('生靈') + 30));
  // —— 雨：屋外的燈會被澆壞，屋裡的不怕
  { const cx = p.x + 12, cy = p.y + 12;
    for (let dx = -8; dx <= 8; dx++) for (let dy = -5; dy <= 5; dy++) w.set(cx + dx, cy + dy, '土');
    for (let d = -2; d <= 2; d++) { w.set(cx - 6 + d, cy - 2, '磚'); w.set(cx - 6 + d, cy + 2, '磚'); w.set(cx - 8, cy + d, '磚'); w.set(cx - 4, cy + d, '磚'); }
    w.set(cx - 6, cy + 2, '門'); w.set(cx - 6, cy, '燈'); w.set(cx + 3, cy, '燈');
    ok('lamp in a walled room is covered, lamp in the open is not', w.covered(cx - 6, cy) && !w.covered(cx + 3, cy));
    w.rainUntil = w.time + 120; w.rainAcc = 0; g.hudSig = ''; g.updateHUD();
    ok('rain shows in the status line', w.raining() && document.getElementById('status').textContent.indexOf('雨') >= 0);
    w.rainLampP = 1; w.tick(1.0, p.x, p.y); await sleep(50);
    ok('rain ruins the lamp outside and spares the one indoors', w.get(cx + 3, cy) !== '燈' && w.get(cx - 6, cy) === '燈' && !w.lamps.has((cx + 3) + ',' + cy));
    const sw = w.serialize();
    ok('true random helper and weather save fields exist', typeof U.trueRand() === 'number' && U.trueRand() < 1 && typeof sw.rainUntil === 'number' && typeof sw.nextRainAt === 'number');
    w.rainLampP = XIEYI.DIFF.normal.lampP; w.rainUntil = 0; }
  // ============ v0.4.4：神兵成類、小屋、霧障會動、數值燈與提醒 ============
  calm();
  ok('god weapons have their own craft category 神兵', G.CRAFT_CATS.indexOf('神兵') > 0 && G.RECIPES.find(r => r.id === 'hammer').cat === '神兵' && G.RECIPES.find(r => r.id === 'seagod').cat === '神兵' && !G.RECIPES.some(r => r.cat === '工具' && (r.id === 'hammer' || r.id === 'seagod')));
  // —— 小屋：牆與門圍起的小空間擋獸、擋魄，多小才算看難度（獸／魄）：簡單 28／18、一般 18／8、困難 10／擋不住
  { const cx = p.x + 20, cy = p.y + 20, d0 = g.diff;
    const box = (x0, y0, iw, ih) => { for (let dx = -1; dx <= iw; dx++) for (let dy = -1; dy <= ih; dy++) w.set(x0 + dx, y0 + dy, (dx < 0 || dy < 0 || dx === iw || dy === ih) ? '磚' : '土'); };
    const clear = (x0, y0, iw, ih) => { for (let dx = -1; dx <= iw; dx++) for (let dy = -1; dy <= ih; dy++) w.set(x0 + dx, y0 + dy, '草'); };
    ok('room thresholds per difficulty: easy 28/18, normal 18/8, hard 10/0', XIEYI.DIFF.easy.room === 28 && XIEYI.DIFF.easy.ghostRoom === 18 && XIEYI.DIFF.normal.room === 18 && XIEYI.DIFF.normal.ghostRoom === 8 && XIEYI.DIFF.hard.room === 10 && XIEYI.DIFF.hard.ghostRoom === 0);
    box(cx, cy, 2, 4); w.set(cx, cy + 4, '門');   // 2×4 ＝ 8 格，南牆開一扇門
    ok('an 8-cell room counts 8 from any cell inside; the door and the outside are no room', w.roomSize(cx, cy) === 8 && w.roomSize(cx + 1, cy + 3) === 8 && !isFinite(w.roomSize(cx, cy + 4)) && w.roomSize(cx, cy + 6) > 28);
    g.diff = XIEYI.DIFF.normal;
    ok('normal: 8 cells keep out beasts, eagles, the dragon and the 魄; nothing spawns inside', !g.ents.habitat('魄', cx, cy, true) && !g.ents.habitat('鹿', cx, cy, false) && !g.ents.canStand('狼', cx, cy, true) && !g.ents.canStand('鷹', cx, cy, true) && !g.ents.canStand('龍', cx, cy, true) && !g.ents.canStand('魄', cx, cy, true) && g.ents.canStand('魄', cx, cy + 6, true));
    const gh = g.ents.add('魄', cx, cy + 6, { moveT: 99 }); let inside = false; for (let i = 0; i < 12; i++) { g.ents.stepTo(gh, cx, cy, false, true); if (w.sheltered(gh.x, gh.y, '魄')) inside = true; } g.ents.remove(gh);
    ok('a 魄 chasing the player never gets into the room', !inside, [gh.x - cx, gh.y - cy]);
    ok('tamed companions and the dragon are placed outside the room', (() => { const at = g.freeNear(cx, cy, true); return !w.sheltered(at.x, at.y, '鷹'); })());
    w.set(cx + 2, cy, '土');
    ok('knock out a wall and the room opens (the cache is cleared on every change)', !w.sheltered(cx, cy, '狼') && w.roomSize(cx, cy) > 28);
    clear(cx, cy, 2, 4);
    // 八間屋：8、9、10、11、18、19、28、29 格
    const rooms = { 8: [cx, cy, 2, 4], 9: [cx + 6, cy, 3, 3], 10: [cx + 12, cy, 2, 5], 11: [cx + 18, cy, 1, 11], 18: [cx + 22, cy, 3, 6], 19: [cx + 28, cy, 1, 19], 28: [cx + 32, cy, 4, 7], 29: [cx + 38, cy, 1, 29] };
    for (const r of Object.values(rooms)) box(...r);
    const at = (n, type) => w.sheltered(rooms[n][0], rooms[n][1], type);
    ok('rooms of 8…29 cells are counted right', Object.keys(rooms).every(n => w.roomSize(rooms[n][0], rooms[n][1]) === +n), Object.keys(rooms).map(n => w.roomSize(rooms[n][0], rooms[n][1])));
    g.diff = XIEYI.DIFF.normal;
    ok('normal: beasts stop at 18 cells, not 19; the 魄 stops at 8, not 9', at(18, '狼') && !at(19, '狼') && at(8, '魄') && !at(9, '魄'));
    g.diff = XIEYI.DIFF.hard;
    ok('hard: beasts stop at 10 cells, not 11; nothing but light stops the 魄', at(10, '狼') && !at(11, '狼') && !at(8, '魄') && !at(9, '鷹') === false && !g.ents.canStand('虎', rooms[10][0], rooms[10][1], true) && g.ents.canStand('魄', rooms[8][0], rooms[8][1], true));
    g.diff = XIEYI.DIFF.easy;
    ok('easy: beasts stop at 28 cells, not 29; the 魄 stops at 18, not 19', at(28, '狼') && !at(29, '狼') && at(18, '魄') && !at(19, '魄'));
    g.diff = d0;
    for (const r of Object.values(rooms)) clear(...r); }
  // —— 廿二重起只靠斃敵長膽氣；斃敵白日八成、夜裡加半成
  { const t0 = w.time, c0 = p.cour; trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']);
    p.cour = g.levelAt(21); g.addItem('土', 2); g.addItem('草', 1); p.sta = 50; g.craft('brick');
    ok('below level 22 crafting still gives courage (3 × 1.25 = 3.75)', Math.abs(p.cour - g.levelAt(21) - 3.75) < 1e-6, p.cour - g.levelAt(21));
    p.cour = g.levelAt(22); g.killOnlyHinted = false; g.addItem('土', 2); g.addItem('草', 1); p.sta = 50; g.craft('brick');
    ok('from level 22 crafting gives none (the brick is still made)', p.cour === g.levelAt(22) && g.count('磚') >= 2 && toasts().indexOf('膽氣不長了') >= 0);
    g.addCourage(5, 'other'); ok('nor do gathering, reading or fishing', p.cour === g.levelAt(22));
    setDay(0.53); face(1, 0); w.set(T().x, T().y, '草'); g.kill(g.ents.add('鹿', T().x, T().y, { moveT: 99 }));
    ok('a deer is not hostile: no courage at 22', p.cour === g.levelAt(22) && !g.isNight());
    g.kill(g.ents.add('虎', T().x, T().y, { moveT: 99 }));
    ok('a tiger by day: 30 × 0.8 × 1.25 = 30', p.cour === g.levelAt(22) + 30, p.cour - g.levelAt(22));
    setDay(0.93); p.cour = g.levelAt(22); g.kill(g.ents.add('虎', T().x, T().y, { moveT: 99 }));
    ok('a tiger by night: 30 × 1.05 × 1.25 = 39.375, kept to four decimals', g.isNight() && Math.abs(p.cour - (g.levelAt(22) + 39.375)) < 1e-6, p.cour - g.levelAt(22));
    p.cour = 0; g.kill(g.ents.add('狼', T().x, T().y, { moveT: 99 }));
    ok('the day/night factor applies at any level: a wolf by night gives 19.6875 (15 × 1.05 × 1.25)', p.cour === 19.6875, p.cour);
    setDay(0.53); p.cour = 0; g.kill(g.ents.add('鹿', T().x, T().y, { moveT: 99 }));
    ok('below 22 a deer still gives its 3 (×1.25 = 3.75), no day factor', p.cour === 3.75, p.cour);
    w.time = t0; p.cour = c0; for (const n of ['肉', '磚', '虎首骨', '狼首骨']) g.removeItem(n, 99); }
  // —— 霧障會動：慢慢挪，躲著光；沒光就亂飄
  { const X = p.x, Y = p.y; for (const id of [...w.fogs.keys()]) w.removeFog(id);
    for (let dx = -2; dx <= 18; dx++) for (let dy = -6; dy <= 6; dy++) w.set(X + dx, Y + dy, '草');
    unarm(); p.worn['帽'] = null; g.removeItem('火把', 99); g.removeItem('蠟燭', 99); p.sel = 0;   // 手裡頭上都沒光
    ok('a fresh world moves fog every six seconds', new window.World(3).fogStep === 6 && !g.hasLight());
    const fog = w.addFog(null, w.time + DAY, false, window.World.newFogShape(18), [X + 9.5, Y + 0.5]);
    w.set(X + 3, Y, '燈');
    const xa = fog.gx, moved1 = w.moveFog(fog, X, Y);
    ok('a lamp within ten tiles pushes the fog away: it moves about a tile east', moved1 && fog.gx > xa + 0.8, [xa, fog.gx]);
    w.set(X + 3, Y, '草'); p.x = p.rx = X + 15; p.y = p.ry = Y; g.addItem('火把', 1); hold('火把');
    const xb = fog.gx, moved2 = g.hasLight() && w.moveFog(fog, p.x, p.y);
    ok('a torch in the player\'s hand counts as light: the fog backs away west', moved2 && fog.gx < xb - 0.8, [xb, fog.gx]);
    unarm(); g.removeItem('火把', 9); p.sel = 0; p.x = p.rx = X; p.y = p.ry = Y;
    const before = [...fog.cells].join(';'); const moved3 = w.moveFog(fog, X, Y);
    ok('with no light around the fog still drifts', moved3 && [...fog.cells].join(';') !== before);
    fog.moveAt = w.time; w.fogStep = 1000; const ang0 = fog.ang; w.step(p.x, p.y);
    ok('the world tick turns fogs on the fog clock and winds it up again', fog.ang !== ang0 && fog.moveAt > w.time + 500 && fog.moveAt < w.time + 1500 && [...fog.cells].every(k => w.fogCells.get(k) === fog.id), fog.moveAt - w.time);
    w.fogStep = 6; fog.moveAt = w.time + 99; const fx0 = fog.x, fy0 = fog.y, gx0 = fog.gx; for (let i = 0; i < 10; i++) w.tick(0.2, p.x, p.y);
    const drift = Math.hypot(fog.x - fx0, fog.y - fy0);
    ok('v0.6.4: fog drifts continuously, a sixth of a tile per second, not a tile at a time', drift > 0.25 && drift < 0.42, drift);
    const w2 = new window.World(w.seed); w2.restore(w.serialize()); const f2 = [...w2.fogs.values()][0];
    ok('a restored fog gets a fresh move clock, and keeps its place and shape', !!f2 && f2.moveAt > w2.time && Math.abs(f2.x - fog.x) < 1e-3 && f2.shape.n === fog.shape.n && f2.cells.size === fog.cells.size, f2 && f2.moveAt - w2.time);
    w.fogStep = 1e9; w.removeFog(fog.id); }
  // —— 數值燈與提醒：不到五成亮燈，不到四分之一彈窗；困難只亮燈
  { const bar = (k) => document.getElementById(k + 'fill').parentNode, title = () => document.getElementById('warn-title').textContent;
    g.warnEnabled = true; p.warnLow = {}; p.hp = p.hpMax; p.food = 100; p.warm = 100; p.sta = p.staMax; p.san = 100; g.hudSig = ''; g.updateHUD(); await sleep(80);
    ok('all five full: nothing flashes, no popup; the old lamp dots are gone', !bar('hp').classList.contains('warn') && !bar('san').classList.contains('warn') && hidden('warn') && document.querySelectorAll('.bar .lamp').length === 0 && getComputedStyle(bar('hp')).animationName === 'none');
    p.hp = p.hpMax * 0.4; g.hudSig = ''; g.updateHUD(); await sleep(120);
    ok('命 at 40%: the bar\'s outline flashes once every two seconds (yellow), no popup yet', bar('hp').classList.contains('warn') && !bar('hp').classList.contains('low') && hidden('warn') && getComputedStyle(bar('hp')).animationName === 'warn-flash' && getComputedStyle(bar('hp')).animationDuration === '2s');
    p.hp = p.hpMax * 0.2; g.hudSig = ''; g.updateHUD(); await until(() => !hidden('warn'), 2000);
    ok('命 at 20%: the outline flashes every second (red) and a popup pauses the game and names 命', bar('hp').classList.contains('low') && getComputedStyle(bar('hp')).animationName === 'low-flash' && getComputedStyle(bar('hp')).animationDuration === '1s' && !hidden('warn') && g.paused && g.warnOpen && title().indexOf('命') >= 0, title());
    await press('Enter', 20); await sleep(80);
    ok('Enter closes the popup and the game runs on', hidden('warn') && !g.paused && !g.warnOpen);
    p.hp = p.hpMax * 0.15; await sleep(200);
    ok('still low: no second popup until 命 climbs back above half', hidden('warn'));
    p.hp = p.hpMax * 0.6; await sleep(150); p.hp = p.hpMax * 0.1; await until(() => !hidden('warn'), 2000);
    ok('after recovering above half, dropping again warns again', !hidden('warn')); g.closeWarn();
    p.hp = p.hpMax; p.food = 20; p.san = 20; p.warnLow = {}; await until(() => !hidden('warn'), 2000);
    ok('two stats at once: one popup naming both', title().indexOf('飽') >= 0 && title().indexOf('愜意') >= 0, title()); g.closeWarn();
    p.food = 100; p.san = 100; p.warnLow = {}; const d0 = g.diff; g.diff = XIEYI.DIFF.hard; p.warm = 10; g.hudSig = ''; g.updateHUD(); await sleep(250);
    ok('hard mode: the outline flashes but there is no popup', bar('warm').classList.contains('low') && hidden('warn') && !g.paused && XIEYI.DIFF.hard.warn === false && XIEYI.DIFF.normal.warn === true);
    g.diff = d0; p.warm = 100; p.warnLow = {}; g.warnEnabled = false; g.hudSig = ''; g.updateHUD(); }
  // ============ 手柄已封存（v0.5.8）：遊戲不載入 pad.js，介面上沒有手柄設定；幫助從暫停面板開時在最上面 ============
  { const top = () => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return e && e.closest('.overlay') && e.closest('.overlay').id; };
    ok('no gamepad code or settings in the game: no window.PAD, no 手柄設定 buttons, no pad panels', typeof window.PAD === 'undefined' && !document.getElementById('btn-pad') && !document.getElementById('pause-pad') && !document.getElementById('help-pad') && !document.getElementById('padset') && !document.getElementById('padmap') && !document.getElementById('pause-bars') && document.body.textContent.indexOf('手柄') < 0);
    g.togglePause(); document.getElementById('pause-help').click(); await sleep(30);
    ok('the help opened from the pause panel is on top of it', g.userPaused && !hidden('help') && top() === 'help', top());
    document.getElementById('help').classList.add('hidden'); g.togglePause(); }
  // ============ 拆人造的東西先問一聲；烤肉烤蛇回血 ============
  calm(); g.ents.list = g.ents.list.filter(e => e.tame || U.cheb(e.x, e.y, p.x, p.y) > 12);   // v0.8.25：先把附近的獸請走，免得剛好有隻虎站在面前，E 成了打虎（測試曾因此連錯十幾項）
  { face(0, 1); w.set(T().x, T().y, '燈'); unarm(); g.action = null; const lampAt = T();
    g.keys.add('KeyE'); g.pressGather();
    ok('E on a placed lamp asks first: popup up, world paused, no gather started, held E dropped', !hidden('takeask') && g.paused && !!g.takeAsk && !g.action && !g.keys.has('KeyE') && document.getElementById('takeask-text').textContent.indexOf('燈') >= 0);
    await press('KeyN', 20);
    ok('N keeps it: popup closed, lamp still there, world running', hidden('takeask') && !g.paused && w.get(lampAt.x, lampAt.y) === '燈');
    g.pressGather(); await press('KeyY', 20); await until(() => !g.action, 4000);
    ok('Y takes it down', w.get(lampAt.x, lampAt.y) === '白' && g.count('燈') >= 1, [w.get(lampAt.x, lampAt.y), g.count('燈')]);
    w.set(T().x, T().y, '木'); g.action = null; g.pressGather();
    ok('a tree is not man-made: no question, gathering starts at once', hidden('takeask') && !!g.action); g.action = null; w.set(T().x, T().y, '草');
    w.set(T().x, T().y, '偶'); g.pressGather(); const sText = document.getElementById('takeask-text').textContent; document.getElementById('takeask-no').click();
    ok('the scarecrow question mentions losing its days; the button says no', sText.indexOf('重計') >= 0 && hidden('takeask') && w.get(T().x, T().y) === '偶'); w.set(T().x, T().y, '草');
    const hp0 = 50; p.hp = hp0; g.addItem('烤肉', 1); hold('烤肉'); g.useItem();
    ok('烤肉 heals 10', Math.round(p.hp) === hp0 + 10, p.hp);
    p.hp = hp0; g.addItem('烤蛇', 1); hold('烤蛇'); g.useItem();
    ok('烤蛇 heals 8', Math.round(p.hp) === hp0 + 8, p.hp);
    p.hp = p.hpMax - 3; g.addItem('烤肉', 1); hold('烤肉'); g.useItem();
    ok('healing never passes the max', Math.round(p.hp) === p.hpMax); p.hp = p.hpMax;
    // 錦囊用滿八個：製作欄標「已用完」、鈕灰掉、再造被拒
    const pch0 = p.pouches; p.pouches = 8; g.craftCat = '全部'; g.buildCraft();
    const prow = [...document.querySelectorAll('#craft-list .recipe')].find(r => r.textContent.indexOf('錦囊') >= 0);
    ok('with eight pouches used the craft row says 已用完 and its button is disabled', !!prow && prow.textContent.indexOf('已用完') >= 0 && prow.classList.contains('cant') && prow.querySelector('button').disabled, prow && prow.textContent.slice(0, 40));
    g.addItem('麻布', 3); g.addItem('棉', 2); p.sta = 100; const pc0 = g.count('錦囊'); g.craft('pouch');
    ok('crafting a ninth pouch is refused', g.count('錦囊') === pc0 && g.count('麻布') >= 3 && g.msgText.indexOf('都用了') >= 0);
    g.addItem('錦囊', 1); hold('錦囊'); g.msgText = ''; g.msgUntil = 0; g.hudSig = ''; g.updateHUD();   // 清掉剛才的回饋訊息，提示列才會寫面前與手上的東西
    ok('the hint for a pouch in hand says they are all used', document.getElementById('msg').textContent.indexOf('已用完八個') >= 0, document.getElementById('msg').textContent.slice(0, 80));
    p.pouches = 1; g.buildCraft(); const prow2 = [...document.querySelectorAll('#craft-list .recipe')].find(r => r.textContent.indexOf('錦囊') >= 0);
    ok('with fewer used the row is craftable again', !!prow2 && prow2.textContent.indexOf('已用完') < 0 && !prow2.querySelector('button').disabled);
    // v0.6.10：已用的加囊裡的湊滿八個就不給織；囊裡那幾個照樣用得掉
    g.removeItem('錦囊', 9); p.pouches = 5; g.addItem('錦囊', 3); g.addItem('麻布', 3); g.addItem('棉', 2); p.sta = 100; g.buildCraft();
    const prow3 = [...document.querySelectorAll('#craft-list .recipe')].find(r => r.textContent.indexOf('錦囊') >= 0); g.msgText = ''; g.craft('pouch');
    ok('v0.6.10: five used + three carried = eight: no more weaving (row says 已夠八個), the cloth stays', g.count('錦囊') === 3 && g.count('麻布') >= 3 && g.msgText.indexOf('湊滿八個') >= 0 && !!prow3 && prow3.textContent.indexOf('已夠八個') >= 0 && prow3.querySelector('button').disabled, [g.count('錦囊'), g.msgText]);
    hold('錦囊'); g.useItem(); hold('錦囊'); g.useItem(); hold('錦囊'); g.useItem();
    ok('v0.6.10: …and the three carried ones can all still be used, up to eight', p.pouches === 8 && g.count('錦囊') === 0 && g.slots() === 32 && g.toolSlots() === 14, p.pouches);
    g.removeItem('錦囊', 9); p.pouches = 6; g.buildCraft(); g.msgText = ''; g.craft('pouch');
    ok('v0.6.10: six used and none carried: a seventh can be woven now', g.count('錦囊') === 1, g.msgText);
    p.pouches = pch0; g.removeItem('錦囊', 9); g.removeItem('麻布', 9); g.removeItem('棉', 9); g.barSig = ''; g.buildBag();
    // 重磨遞增：同一把 1、2、4、8、8；換一把從 1 起
    g.addItem('石劍', 1); const rsw = tool('石劍'); rsw.rg = 0; hold('石劍'); g.removeItem('石子', 99); g.addItem('石子', 30); p.sta = 100; p.food = 100;
    const costs = []; for (let i = 0; i < 5; i++) { const c0 = g.count('石子'); rsw.dur = 3; g.craft('regrind'); costs.push(c0 - g.count('石子')); }
    ok('regrinding the same tool costs 1, 2, 4, 8, 8 pebbles', costs.join(',') === '1,2,4,8,8' && rsw.rg === 5 && rsw.dur === 40, costs);
    g.buildCraft(); const rrow = [...document.querySelectorAll('#craft-list .recipe')].find(r => r.textContent.indexOf('重磨') >= 0);
    ok('the craft row shows the next cost for the tool in hand (6th: 8)', !!rrow && rrow.textContent.indexOf('第 6 次：石子 8') >= 0 && rrow.textContent.indexOf('石子 7/8') >= 0, rrow && rrow.textContent.slice(0, 80));
    g.removeItem('石子', 99); g.addItem('石子', 7); rsw.dur = 3; g.craft('regrind');
    ok('seven pebbles are not enough for an eight-pebble regrind', rsw.dur === 3 && g.count('石子') === 7 && g.msgText.indexOf('材料未備') >= 0);
    g.addItem('石鎬', 1); const rpk = tool('石鎬'); rpk.rg = 0; hold('石鎬'); rpk.dur = 3; g.craft('regrind');
    ok('another tool starts at one pebble again', rpk.dur === 40 && g.count('石子') === 6 && rpk.rg === 1);
    g.save(); const svr = JSON.parse(localStorage.getItem('xieyi.save.v5')); const savedSword = (svr.player.tools || []).concat(svr.player.bag || []).find(x => x.n === '石劍');
    ok('the regrind count is saved with the tool', !!savedSword && savedSword.rg === 5);
    g.removeItem('石子', 99); p.tools = p.tools.filter(x => x !== rsw && x !== rpk); p.tool = -1; g.barSig = ''; g.buildBag(); }
  // ============ 舊布當柴、舊鐵熔回鐵 ============
  calm();
  { face(0, 1); w.set(T().x, T().y, '灶'); for (const [k] of w.stoves) w.stoves.set(k, 0); const sx = T().x, sy = T().y;
    g.addItem('布甲', 1); g.addItem('鐵甲', 1); g.addItem('鎢鋼盔', 1); g.addItem('鋼劍', 1); g.addItem('石刀', 1); const iron0 = g.count('鐵'), w0 = g.count('鎢鋼');
    g.pressPlace();
    const fuelBtn = document.querySelector('#stove-fuel button[data-fuel="布甲"]');
    ok('an old cloth vest is listed as fuel worth 50 breaths', !!fuelBtn && fuelBtn.textContent.indexOf('+50 息') >= 0, fuelBtn && fuelBtn.textContent);
    const meltBefore = document.querySelector('#stove-cook button[data-melt="鐵甲"]');
    ok('iron armour is listed under 熔 but greyed while the stove is cold; a stone knife is not listed', !!meltBefore && meltBefore.disabled && !document.querySelector('#stove-cook button[data-melt="石刀"]'));
    fuelBtn.click();
    ok('burning the vest lights the stove for 50 breaths and the vest is gone', w.stoveLit(sx, sy) && Math.abs(w.stoveFuel(sx, sy) - 50) < 1.5 && g.count('布甲') === 0, w.stoveFuel(sx, sy));
    document.querySelector('#stove-cook button[data-melt="鐵甲"]').click();
    ok('melting 鐵甲 gives two iron (half of five, rounded down)', g.count('鐵') === iron0 + 2 && g.count('鐵甲') === 0);
    document.querySelector('#stove-cook button[data-melt="鋼劍"]').click();
    ok('a steel sword from the tool bar melts into one iron', g.count('鐵') === iron0 + 3 && !tool('鋼劍'));
    document.querySelector('#stove-cook button[data-melt="鎢鋼盔"]').click();
    ok('a tungsten helm melts into one tungsten steel', g.count('鎢鋼') === w0 + 1 && g.count('鎢鋼盔') === 0);
    ok('nothing left to melt: the 熔 buttons are gone, the knife stays', !document.querySelector('#stove-cook button[data-melt]') && !!tool('石刀'));
    g.closeStove(); w.set(sx, sy, '草'); g.removeItem('鐵', 99); g.removeItem('鎢鋼', 99); p.tools = p.tools.filter(x => x.n !== '石刀'); p.tool = -1; g.barSig = ''; g.buildBag(); }
  // ============ 新的燃料表、上限 999、灶的四格柴架（v0.5.1） ============
  calm();
  { face(0, 1); const sx = T().x, sy = T().y, key = sx + ',' + sy; w.set(sx, sy, '灶'); w.stoves.set(key, 0); w.shelves.delete(key);
    ok('fuel values: coal 150, grass 30, fruit 45, wood 105, cotton 75, refined coal 900; hemp 70, bamboo 60, old cloth 50; stone burns not', g.fuelOf('煤') === 150 && g.fuelOf('草') === 30 && g.fuelOf('果') === 45 && g.fuelOf('木') === 105 && g.fuelOf('棉') === 75 && g.fuelOf('精煤') === 900 && g.fuelOf('麻') === 70 && g.fuelOf('竹') === 60 && g.fuelOf('布甲') === 50 && g.fuelOf('石') === 0);
    g.removeItem('木', 999); g.removeItem('草', 999); g.removeItem('精煤', 99); g.removeItem('煤', 99); g.addItem('木', 70); g.addItem('草', 5); g.addItem('精煤', 2);
    g.pressPlace();
    ok('the stove panel shows four empty shelf slots', !hidden('stove') && document.querySelectorAll('#stove-shelf .shelfslot.empty').length === 4);
    const shelf = () => w.shelf(sx, sy).map(x => x.n + x.c).join(',');
    document.querySelector('#stove-fuel button[data-store="木"]').click();
    ok('「存」 moves the whole stack of wood onto the shelf: 64 in one slot, 6 in the next', shelf() === '木64,木6' && g.count('木') === 0, shelf());
    document.querySelector('#stove-fuel button[data-store="草"]').click(); document.querySelector('#stove-fuel button[data-store="精煤"]').click();
    ok('four slots filled: wood, wood, grass, refined coal', shelf() === '木64,木6,草5,精煤2' && document.querySelectorAll('#stove-shelf button.shelfslot').length === 4, shelf());
    g.addItem('煤', 3); g.buildStove(); g.msgText = ''; document.querySelector('#stove-fuel button[data-store="煤"]').click();
    ok('a fifth kind does not fit on the shelf', g.count('煤') === 3 && g.msgText.indexOf('滿了') >= 0, g.msgText);
    document.querySelector('#stove-shelf button[data-shelf="0"]').click();
    ok('clicking a shelf slot burns one: +105, 63 wood left', Math.abs(w.stoveFuel(sx, sy) - 105) < 0.5 && shelf() === '木63,木6,草5,精煤2', [w.stoveFuel(sx, sy), shelf()]);
    g.msgText = ''; document.querySelector('#stove-shelf button[data-shelf="3"]').click();
    ok('refined coal (+900) on top of 105 would pass the 999 cap: refused, nothing wasted', Math.abs(w.stoveFuel(sx, sy) - 105) < 0.5 && shelf().indexOf('精煤2') >= 0 && g.msgText.indexOf('999') >= 0, [w.stoveFuel(sx, sy), g.msgText]);
    w.stoves.set(key, 90); g.buildStove(); document.querySelector('#stove-shelf button[data-shelf="3"]').click();
    ok('with room for it, it burns: 90 + 900 = 990', Math.abs(w.stoveFuel(sx, sy) - 990) < 0.5 && shelf().indexOf('精煤1') >= 0, [w.stoveFuel(sx, sy), shelf()]);
    ok('coal from the bag is refused too when it would pass the cap', g.stoveFuel('煤') === false && g.count('煤') === 3);
    w.addFuel(sx, sy, 500); ok('the fire never stores more than 999', w.stoveFuel(sx, sy) === 999, w.stoveFuel(sx, sy));
    g.closeStove(); g.save(); const svs = JSON.parse(localStorage.getItem('xieyi.save.v5'));
    ok('the save keeps the shelf', JSON.stringify(svs.world.shelves[key]) === JSON.stringify([['木', 63], ['木', 6], ['草', 5], ['精煤', 1]]), svs.world.shelves[key]);
    w.shelves.delete(key); g.load(svs); ok('and loading brings it back', shelf() === '木63,木6,草5,精煤1', shelf());
    hold('石鎬'); g.action = null; p.sta = 50; g.msgText = ''; g.pressGather();
    ok('dismantling asks first and says the shelf goes with the stove', !hidden('takeask') && document.getElementById('takeask-text').textContent.indexOf('柴架上 4 格') >= 0, document.getElementById('takeask-text').textContent);
    takeYes(); await until(() => !g.action, 4000);
    const carried = p.bag.find(x => x.n === '灶' && x.store);
    ok('the stove comes back carrying its shelf', w.get(sx, sy) !== '灶' && !!carried && carried.store.map(x => x.n + x.c).join(',') === '木63,木6,草5,精煤1' && !w.shelves.has(key), [w.get(sx, sy), carried && carried.store]);
    p.sel = p.bag.indexOf(carried); g.pressPlace();
    ok('placed again, the shelf is still there', w.get(sx, sy) === '灶' && shelf() === '木63,木6,草5,精煤1' && !p.bag.includes(carried), [w.get(sx, sy), shelf()]);
    w.set(sx, sy, '草'); ok('when the stove is gone the shelf goes with it', !w.shelves.has(key));
    g.removeItem('煤', 99); g.removeItem('木', 999); g.removeItem('灶', 9); }
  // ============ v0.8.15：鼎也有四格柴架；面前是灶、鼎，不管手上拿什麼，F 都先開它，轉開了才處理手上的東西 ============
  { calm(); face(0, 1); const sx = T().x, sy = T().y, key = sx + ',' + sy; w.set(sx, sy, '鼎'); w.stoves.set(key, 0); w.shelves.delete(key);
    const msg = () => document.getElementById('msg').textContent, shelf = () => w.shelf(sx, sy).map(x => x.n + x.c).join(',');
    g.removeItem('木', 999); g.removeItem('煤', 99); g.addItem('木', 10); g.addItem('布甲', 1); hold('布甲'); const worn0 = p.worn['甲'];
    g.msgUntil = 0; await until(() => /開鼎/.test(msg()), 1500);
    ok('v0.8.15: holding armour and facing a 鼎, the hint says F opens the 鼎, not 穿上', /開鼎/.test(msg()) && !/穿上/.test(msg()), msg());
    g.pressPlace();
    ok('v0.8.15: …and F opens the 鼎 panel; the armour stays in the bag; the 鼎 has four empty shelf slots', !hidden('ding') && g.count('布甲') === 1 && p.worn['甲'] === worn0 && document.querySelectorAll('#ding-shelf .shelfslot.empty').length === 4);
    document.querySelector('#ding-fuel button[data-store="木"]').click();
    ok('v0.8.15: 「存」 puts the whole stack of wood on the 鼎 shelf', shelf() === '木10' && g.count('木') === 0, shelf());
    document.querySelector('#ding-shelf button[data-shelf="0"]').click();
    ok('v0.8.15: clicking the 鼎 shelf burns one: +105, nine left', Math.abs(w.stoveFuel(sx, sy) - 105) < 0.5 && shelf() === '木9' && /鼎下的火/.test(g.msgText), [w.stoveFuel(sx, sy), shelf(), g.msgText]);
    g.closeDing(); g.save(); const svd = JSON.parse(localStorage.getItem(XIEYI.Game.slotKey(g.slot)));
    ok('v0.8.15: the save keeps the 鼎 shelf', JSON.stringify(svd.world.shelves[key]) === JSON.stringify([['木', 9]]), svd.world.shelves[key]);
    hold('石鎬'); g.action = null; p.sta = 50; g.pressGather();
    ok('v0.8.15: taking the 鼎 down asks first and says its shelf goes with it', !hidden('takeask') && document.getElementById('takeask-text').textContent.indexOf('柴架上 1 格') >= 0, document.getElementById('takeask-text').textContent);
    takeYes(); await until(() => !g.action, 4000);
    const carried = p.bag.find(x => x.n === '鼎' && x.store);
    ok('v0.8.15: the 鼎 comes back carrying its shelf', w.get(sx, sy) !== '鼎' && !!carried && carried.store.map(x => x.n + x.c).join(',') === '木9' && !w.shelves.has(key), [w.get(sx, sy), carried && carried.store]);
    p.sel = p.bag.indexOf(carried); g.pressPlace();
    ok('v0.8.15: placed again, the 鼎 shelf is still there', w.get(sx, sy) === '鼎' && shelf() === '木9' && !p.bag.includes(carried), [w.get(sx, sy), shelf()]);
    w.set(sx, sy, '灶'); hold('布甲'); g.pressPlace();
    ok('v0.8.15: facing a 灶 with armour in hand, F opens the 灶 too', !hidden('stove') && g.count('布甲') === 1); g.closeStove();
    face(1, 0); w.set(T().x, T().y, '草'); hold('布甲'); g.pressPlace();
    ok('v0.8.15: turned away from it, F wears the armour', !!p.worn['甲'] && p.worn['甲'].n === '布甲' && hidden('ding') && hidden('stove'));
    g.takeOff('甲'); g.removeItem('布甲', 9); w.set(sx, sy, '草'); g.removeItem('鼎', 9); g.removeItem('木', 99); }
  // ============ v0.8.15 自查：裝著東西的櫃、灶、鼎不被當成空位、不在荷包小囊裡丟了內容；玄武鎖命時溺水，鎖照樣倒數 ============
  { calm(); const bag0 = p.bag, sel0 = p.sel; p.bag = [{ n: '鼎', c: 1, store: [{ n: '木', c: 9 }] }]; while (g.bagUsed() < g.slots()) p.bag.push({ n: '石', c: 64 });
    ok('v0.8.15 自查: a full bag whose only 鼎 carries its shelf has no room for another 鼎 (it used to count as a stack with room)', g.canAdd('鼎', 1) === false && g.canAdd('櫃', 1) === false);
    p.bag = []; const bk = U.key(p.x + 2, p.y + 2), bt = w.get(p.x + 2, p.y + 2); w.set(p.x + 2, p.y + 2, '包'); w.bags.set(bk, [{ n: '櫃', c: 1, store: [{ n: '石', c: 3 }] }, { n: '鼎', c: 1, store: [{ n: '煤', c: 2 }] }]);
    g.pickBag({ x: p.x + 2, y: p.y + 2 });
    const ch9 = p.bag.find(x => x.n === '櫃'), dg9 = p.bag.find(x => x.n === '鼎');
    ok('v0.8.15 自查: picking up a 荷包 gives back the 櫃 with its things and the 鼎 with its shelf', !!ch9 && !!ch9.store && ch9.store[0].n === '石' && !!dg9 && !!dg9.store && dg9.store[0].n === '煤', p.bag);
    const at9 = g.dropSack([{ n: '鼎', c: 1 }, { n: '鼎', c: 1, store: [{ n: '木', c: 4 }] }], true);
    const sk9 = [...w.bags.entries()].find(([k, v]) => v.some(x => x.n === '鼎' && x.store && x.store[0].c === 4));
    ok('v0.8.15 自查: a 小囊 does not fold a 鼎 that carries its shelf into a plain one', !!sk9 && sk9[1].filter(x => x.n === '鼎').length === 2, sk9 && sk9[1]);
    if (sk9) { const [sx9, sy9] = U.unkey(sk9[0]); w.set(sx9, sy9, '草'); }
    w.set(p.x + 2, p.y + 2, bt); p.bag = bag0; p.sel = sel0; g.barSig = '';
    const plank = g.count('木板'); g.removeItem('木板', 999); p.swimming = true; p.swimT = 0; p.trialLockT = 5; p.hp = 50; g.updateStats(1);
    ok('v0.8.15 自查: drowning while 玄武 holds your life — you live, and the lock still counts down', !p.dead && p.hp >= 1 && Math.abs(p.trialLockT - 4) < 0.01, [p.trialLockT, p.hp, p.dead]);
    p.swimming = false; p.swimT = 60; p.trialLockT = 0; p.hp = 100; if (plank) g.addItem('木板', plank); }
  // 飽暖力都九成以上：愜意慢慢回（v0.5.1）
  { calm(); const m = g.mult(); p.food = 95; p.warm = 95; p.sta = p.staMax; p.san = 50; g.sanAcc = 0; g.updateStats(1);
    ok('with food, warmth and stamina all at 90% or more, 愜意 creeps up (0.1 × the courage multiplier a second)', g.content() && Math.abs(p.san - (50 + 0.1 * m)) < 0.01, [p.san, m]);
    p.food = 85; p.san = 50; g.sanAcc = 0; g.updateStats(1);
    ok('one of them below 90% and it drains as usual', !g.content() && p.san < 50, p.san);
    p.food = 100; p.warm = 100; p.san = 100; }
  // ============ 彈弓、台與階、囊滿時烤不吞（v0.5.2） ============
  { calm(); const X = p.x, Y = p.y, area = [];
    for (let dx = -2; dx <= 11; dx++) for (let dy = -3; dy <= 3; dy++) { const x = X + dx, y = Y + dy; area.push([x, y, w.raw(x, y)]); if (dx || dy) w.set(x, y, '土'); }
    g.ents.list = g.ents.list.filter(e => '鹿虎豹狼蛇蛛蟾鷹龜蜃魚'.indexOf(e.type) < 0); p.cour = 0;
    for (const k of ['襯', '褲', '甲', '盔', '靴', '帽']) if (p.worn[k]) g.takeOff(k);
    const tAt = (x, y) => { p.x = p.rx = x; p.y = p.ry = y; };
    g.removeItem('木', 999); g.removeItem('麻', 99); g.addItem('木', 2); g.addItem('麻', 3); p.sta = 100; g.craft('sling');
    const sl = tool('彈弓');
    ok('a slingshot is two wood and three hemp; it goes to the tool bar with 80 durability', !!sl && sl.dur === 80 && g.count('麻') === 0 && g.count('木') === 0);
    p.tool = p.tools.indexOf(sl); face(1, 0);
    const tg = g.ents.add('虎', X + 8, Y, { moveT: 99, calm: 99 });
    ok('aiming east, the tiger eight tiles away is the target', g.slingTarget() === tg);
    face(-1, 0); ok('facing west there is nothing to shoot', g.slingTarget() === null); face(1, 0);
    tg.x = tg.rx = X + 10; ok('ten tiles is out of range', g.slingTarget() === null);
    tg.x = tg.rx = X + 9; ok('nine is in range', g.slingTarget() === tg);
    tg.x = tg.rx = X + 8;
    g.removeItem('石子', 999); g.msgText = ''; p.atkT = 0; g.action = null; g.pressGather();
    ok('no pebbles, no shot', tg.hp === 300 && g.msgText.indexOf('石子') >= 0, g.msgText);
    g.addItem('石子', 5); p.atkT = 0; p.sta = 50; g.msgText = ''; g.pressGather();
    ok('E shoots a pebble: 6 damage, one pebble and one durability spent, the tiger is provoked', tg.hp === 294 && g.count('石子') === 4 && sl.dur === 79 && tg.provoked > 19 && p.sta < 50 && g.msgText.indexOf('七格內') >= 0, [tg.hp, g.count('石子'), sl.dur, tg.provoked, g.msgText]);
    p.atkT = 0.5; g.pressGather(); ok('the next shot waits 0.8 s', tg.hp === 294 && g.count('石子') === 4);
    tg.moveT = 0; g.ents.update(0.01, g);
    ok('provoked but eight tiles away: it does not charge', tg.moveT >= 0.5, tg.moveT);
    tg.x = tg.rx = X + 6; tg.moveT = 0; const lk = w.raw(X + 6, Y + 1); w.set(X + 6, Y + 1, '燈'); g.ents.update(0.01, g);
    ok('within seven it charges straight at you, lamp or no lamp, by day', Math.abs(tg.moveT - 0.22) < 1e-6 && U.cheb(tg.x, tg.y, p.x, p.y) === 5, [tg.moveT, U.cheb(tg.x, tg.y, p.x, p.y)]);
    w.set(X + 6, Y + 1, lk);
    const quiet = g.ents.add('虎', X + 6, Y - 2, { moveT: 0, calm: 0 }); g.ents.update(0.01, g);
    ok('an unprovoked tiger six tiles off by day does not', quiet.moveT >= 0.5, quiet.moveT); g.ents.remove(quiet);
    tg.x = tg.rx = X + 8; tg.y = tg.ry = Y; w.set(X + 4, Y, '磚');
    ok('a brick wall in between blocks the shot', g.slingTarget() === null);
    // 台與階
    g.removeItem('磚', 999); g.removeItem('石', 999); g.addItem('磚', 8); g.addItem('石', 6); p.sta = 100; p.food = 5; g.msgText = ''; g.craft('platform');
    ok('a 台 costs food as well: too hungry, refused', g.count('台') === 0 && g.msgText.indexOf('太餓') >= 0, g.msgText);
    p.food = 50; g.craft('platform'); g.craft('steps');
    ok('台: six bricks, four stones, 12 stamina, 8 food; 階: two bricks, two stones, 6 stamina, 4 food', g.count('台') === 1 && g.count('階') === 1 && g.count('磚') === 0 && g.count('石') === 0 && Math.abs(p.food - 38) < 0.5 && p.sta === 82, [p.food, p.sta]);
    g.craftCat = '全部'; g.buildCraft(); const prow = [...document.querySelectorAll('#craft-list .recipe')].find(r => r.textContent.indexOf('台') === 0 || r.querySelector('b') && r.querySelector('b').textContent.indexOf('台') === 0);
    ok('the craft row shows the food cost', !!prow && prow.textContent.indexOf('飽 8') >= 0, prow && prow.textContent);
    face(1, 0); hold('階'); g.pressPlace(); w.set(X + 2, Y, '台');
    ok('the 階 is placed like any building', w.get(X + 1, Y) === '階' && g.count('階') === 0);
    ok('v0.6.8: beasts may stand on 階 and 台, but come onto the 台 only from a 階 or 台', g.ents.canStand('虎', X + 2, Y, true) && g.ents.canStand('狼', X + 1, Y, true) && !g.ents.climbOk({ x: X + 2, y: Y + 1 }, X + 2, Y) && g.ents.climbOk({ x: X + 1, y: Y }, X + 2, Y));
    { const wf = g.ents.add('牛', X + 1, Y, { moveT: 1, calm: 99 }); g.ents.update(0.3, g); const onStair = wf.moveT;
      ok('v0.6.8: a beast on the 階 steps half again as slowly (its move timer runs at two thirds)', Math.abs(onStair - (1 - 0.3 / 1.5)) < 1e-6, onStair); g.ents.remove(wf); }
    tAt(X + 2, Y + 1); ok('from the ground you cannot step onto the 台', !g.pass(X + 2, Y));
    tAt(X + 1, Y); ok('from the 階 you can', g.pass(X + 2, Y));
    p.moveT = 0; g.tryStep(1, 0); ok('and you walk up onto it', p.x === X + 2 && w.get(p.x, p.y) === '台', [p.x - X, w.get(p.x, p.y)]);
    ok('from the 台 you can jump down anywhere', g.pass(X + 2, Y + 1));
    face(1, 0); tg.x = tg.rx = X + 9; ok('on the 台 a pebble flies over the wall', g.slingTarget() === tg);
    tg.x = tg.rx = X + 3; tg.hp = 300; tg.slowT = 0; p.hp = 100; p.hurtT = 0; p.hitWin = { start: -99, n: 0 }; g.hit(tg, 20);
    ok('a beast pouncing at you on the 台 hits its edge: −30 (a tenth of 300) and slowed for 5 s', tg.hp === 270 && tg.slowT === 5 && p.hp < 100, [tg.hp, tg.slowT, p.hp]);
    tg.moveT = 1; tg.atk = 1; g.ents.update(0.2, g);
    ok('slowed: its move and pounce timers run at half speed', Math.abs(tg.moveT - 0.9) < 1e-6 && Math.abs(tg.atk - 0.9) < 1e-6, [tg.moveT, tg.atk]);
    const sn = g.ents.add('蛇', X + 2, Y + 1, { moveT: 99 }); g.bite(sn, 3); p.poisonT = 0; p.poisonPer = 0;
    ok('a snake biting you there loses 9 (a tenth of 90)', sn.hp === 81, sn.hp); g.ents.remove(sn);
    { const up = g.ents.add('狼', X + 1, Y, { moveT: 99, calm: 99 }); up.hp = 160; g.hit(up, 10);
      ok('v0.6.8: a beast that came up the 階 does not hit the platform edge', up.hp === 160, up.hp); g.ents.remove(up); p.hp = 100; }
    tAt(X, Y); tg.hp = 300; g.hit(tg, 20); ok('on the ground there is no such recoil', tg.hp === 300, tg.hp);
    g.ents.remove(tg); p.hp = 100;
    // 囊滿時：烤不了就不烤，肉不會少（v0.5.1 前烤好的會不見）；具欄裡的鋼劍熔了也要囊有地方放鐵
    face(0, 1); const sx = X, sy = Y + 1; w.set(sx, sy, '灶'); w.addFuel(sx, sy, 300);
    g.removeItem('烤肉', 99); g.removeItem('鐵', 99); g.addItem('肉', 3); g.addItem('鋼劍', 1);
    for (const n of ['土', '草', '沙', '花', '竹', '木', '石子', '棉', '麻', '鐵礦', '煤', '玻璃瓶', '麻布', '偶', '門', '床', '燈', '櫃', '扇', '蠟燭', '火把', '藥', '鎢鋼', '精煤', '龜甲', '磚', '石', '果']) { if (p.bag.length >= g.slots()) break; if (!g.has(n)) g.addItem(n, 1); }
    ok('(the bag is full)', p.bag.length === g.slots() && !!tool('鋼劍'), [p.bag.length, g.slots()]);
    g.pressPlace(); const m0 = g.count('肉'); g.msgText = ''; g.stoveCook('肉');
    ok('with a full bag the meat is not cooked away: refused, the meat is still there', g.count('肉') === m0 && g.count('烤肉') === 0 && g.msgText.indexOf('放不下') >= 0, [g.count('肉'), g.count('烤肉'), g.msgText]);
    g.msgText = ''; g.stoveMelt('鋼劍'); ok('nor is a steel sword in the tool bar melted into iron with nowhere to go', !!tool('鋼劍') && g.count('鐵') === 0 && g.msgText.indexOf('放不下') >= 0, g.msgText);
    const one = p.bag.find(x => x.c === 1 && x.n !== '肉'); g.removeItem(one.n, 1); g.stoveCook('肉');
    ok('with one slot free it cooks', g.count('烤肉') === 1 && g.count('肉') === m0 - 1);
    g.closeStove(); for (const [x, y, c] of area) w.set(x, y, c);
    trim(['木', '石', '石子', '草', '土', '磚', '孤帆', '方舟']); p.tools = p.tools.filter(x => x.n !== '彈弓' && x.n !== '鋼劍'); p.tool = p.tools.length ? 0 : -1; g.barSig = ''; g.buildBag(); tAt(X, Y); }
  // 一山不容二虎：兩隻虎相距至少十二格（v0.5.2）
  { calm(); setDay(0.93); const X = p.x + 20, Y = p.y, area = [];
    for (let dx = -2; dx <= 18; dx++) for (let dy = -3; dy <= 3; dy++) { const x = X + dx, y = Y + dy; area.push([x, y, w.raw(x, y)]); w.set(x, y, '草'); }
    g.ents.list = g.ents.list.filter(e => e.type !== '虎');
    const A = g.ents.add('虎', X, Y, { moveT: 99 }), B = g.ents.add('虎', X + 13, Y, { moveT: 99 });
    ok('no tiger may be born within twelve tiles of another', !g.ents.tigerRoom(X + 11, Y + 2) && !g.ents.tigerRoom(X + 6, Y) && g.ents.tigerRoom(X - 12, Y));   // X+6 離 A 六格、離 B 七格
    ok('a tiger thirteen away will not step to twelve-minus-one', !g.ents.tigerTooClose(B, X + 12, Y) && g.ents.tigerTooClose({ type: '虎', x: X + 12, y: Y }, X + 11, Y));
    B.x = B.rx = X + 12; for (let i = 0; i < 6; i++) { g.ents.stepTo(B, A.x, A.y, false, true); }
    ok('chasing toward the other tiger it stops at twelve', U.cheb(A.x, A.y, B.x, B.y) >= 12, U.cheb(A.x, A.y, B.x, B.y));
    B.x = B.rx = X + 5; B.y = B.ry = Y; B.moveT = 0; B.calm = 99; g.ents.update(0.01, g);
    ok('two tigers already too close: the idle one walks away', U.cheb(A.x, A.y, B.x, B.y) === 6, U.cheb(A.x, A.y, B.x, B.y));
    g.ents.remove(A); g.ents.remove(B); for (const [x, y, c] of area) w.set(x, y, c); calm(); }
  // ============ 神兵與彈弓各有專鍵（v0.5.7）：L 拿出／換神兵、P 收回；Y 拿出／收起彈弓 ============
  { calm(); const keepT = p.tools, keepB = p.bag, keepI = p.tool, keepSel = p.sel, held = () => g.activeTool() && g.activeTool().n;
    p.tools = [{ n: '石刀', c: 1, dur: 30 }, { n: '九閽鳴雷', c: 1, dur: 199 }]; p.bag = [{ n: '燭龍焚溟', c: 1, dur: 199 }, { n: '木', c: 3 }]; p.sel = 0; p.tool = 0; g.prevTool = null; g.barSig = ''; g.buildBag();
    await press('KeyL'); ok('L takes out the god weapon in the tool bar', held() === '九閽鳴雷' && g.msgText.indexOf('拿出「九閽鳴雷」') >= 0, g.msgText);
    await press('KeyL'); ok('L again switches to the other one, moving it from the bag into the tool bar', held() === '燭龍焚溟' && !p.bag.some(s => s.n === '燭龍焚溟') && p.tools.length === 3);
    await press('KeyL'); ok('and back again', held() === '九閽鳴雷');
    await press('KeyP'); ok('P puts the god weapon away: the stone knife held before is back in hand', held() === '石刀' && g.msgText.indexOf('收起「九閽鳴雷」') >= 0, g.msgText);
    await press('KeyP'); ok('v0.6.4: P with an ordinary weapon in hand cycles the weapons only (god weapons stay on L): the knife was the only one, so the hand is empty', !g.activeTool() && g.msgText.indexOf('空手') >= 0, g.msgText);
    p.tool = -1; await press('KeyL'); await press('KeyP'); ok('drawn from empty hands, P leaves them empty again', p.tool === -1 && g.msgText.indexOf('空手') >= 0, g.msgText);
    p.tool = 0; await press('KeyY'); ok('Y without a slingshot says how to make one and keeps the knife', held() === '石刀' && g.msgText.indexOf('沒有彈弓') >= 0, g.msgText);
    p.bag.push({ n: '彈弓', c: 1, dur: 80 }); g.barSig = ''; await press('KeyY'); ok('Y takes the slingshot from the bag into the hand', held() === '彈弓' && !p.bag.some(s => s.n === '彈弓'));
    await press('KeyL'); ok('L from the slingshot takes out a god weapon', held() === '九閽鳴雷');
    await press('KeyP'); ok('P puts it away back to the knife held before the slingshot', held() === '石刀');
    await press('KeyY'); const out = held(); await press('KeyY'); ok('Y twice: out, then put away back to the knife', out === '彈弓' && held() === '石刀' && g.msgText.indexOf('收起「彈弓」') >= 0, g.msgText);
    p.tools.length = 0; while (p.tools.length < g.toolSlots()) p.tools.push({ n: '石刀', c: 1, dur: 30 }); p.bag.push({ n: '彈弓', c: 1, dur: 80 }); p.tool = 0; g.barSig = '';
    await press('KeyY'); ok('with the tool bar full, Y says so and nothing changes', held() === '石刀' && p.bag.some(s => s.n === '彈弓') && g.msgText.indexOf('具欄滿了') >= 0, g.msgText);
    p.tools = keepT; p.bag = keepB; p.tool = keepI; p.sel = keepSel; g.prevTool = null; g.barSig = ''; g.buildBag(); }
  // ============ v0.6：毒蛛、龜、野豬、野牛、晝夜各半、磚擋光擋眼、窗、野牛撞磚、沼澤、製作欄的樹、各獸的聲音 ============
  { calm(); const E = g.ents, D = G.DB, X0 = p.x, Y0 = p.y, keepB = p.bag, keepT = p.tools, keepI = p.tool, mr = Math.random, tr = window.U.trueRand, area = [];
    for (const k of ['襯', '褲', '甲', '盔', '靴']) g.takeOff(k);
    const cx = 76, cy = 0, put = (x, y, c) => { area.push([x, y, w.get(x, y)]); w.set(x, y, c); };
    for (let dy = -9; dy <= 9; dy++) for (let dx = -13; dx <= 13; dx++) put(cx + dx, cy + dy, '草');
    E.list = []; p.x = cx; p.y = cy; p.rx = cx; p.ry = cy; p.bag = []; p.tools = []; p.tool = -1; p.sel = 0; g.barSig = ''; p.hp = 100;
    ok('v0.6.10: a day lasts 420 / 360 / 300 s for easy / normal / hard; this normal island runs 360 in both game and world', DAY === 360 && XIEYI.DIFF.easy.day === 420 && XIEYI.DIFF.normal.day === 360 && XIEYI.DIFF.hard.day === 300 && window.World.DAY === 360 && w.serialize().dayLen === 360, [DAY, window.World.DAY]);
    const night = (f) => { setDay(f); return g.isNight(); };
    ok('the day starts at midnight: night until 0.25, day 0.25–0.75, night again from 0.75', night(0.01) && night(0.24) && !night(0.25) && !night(0.74) && night(0.75) && night(0.99));
    setDay(0.25); const hDawn = g.shichen(); setDay(0.75); const hDusk = g.shichen(); setDay(0.01); const hMid = g.shichen();
    ok('dawn is 卯時 (6 o\'clock), dusk 酉時 (18), the start of the day 子時', hDawn === '卯時' && hDusk === '酉時' && hMid === '子時', [hDawn, hDusk, hMid]);
    setDay(0.53);
    // 蜘蛛：十隻一隻毒蛛，見人就撲、毒是蛇的一半；其餘無毒，惹了才咬、不中毒
    Math.random = () => 0.05; const vs = E.add('蛛', cx + 1, cy, { moveT: 99 }); Math.random = () => 0.5; const hs = E.add('蛛', cx - 1, cy, { moveT: 99 }); Math.random = mr;
    const hsCalm = !E.isHostile(hs); hs.angry = true;
    ok('one spider in ten is venomous: it hunts on sight; a harmless one only once angered', vs.venom === true && hs.venom === false && E.isHostile(vs) && hsCalm && E.isHostile(hs));
    p.poisonT = 0; p.poisonPer = 0; p.biteN = 0; vs.atk = 0; E.bite(vs, g);
    ok('a venomous spider poisons at half the snake rate: 0.75 a second, for the same 9 s', p.poisonPer === 0.75 && p.poisonT === 9 && D['蛇'].bite === 1.5 && D['蛇'].venomT === 9, [p.poisonPer, p.poisonT]);
    p.poisonT = 0; p.poisonPer = 0; p.hp = 100; hs.atk = 0; E.bite(hs, g);
    ok('a harmless spider only nips for 2, no poison', p.hp === 98 && p.poisonT === 0, [p.hp, p.poisonT]);
    E.remove(vs); E.remove(hs); p.hp = 100;
    // 龜：命二百五、一步一息半；挨打往最近的海逃，快四成，下水就不見
    put(cx + 5, cy + 2, '水'); const tt = E.add('龜', cx + 2, cy + 2, { moveT: 99 });
    ok('turtles have 250 hp', tt.hp === 250 && D['龜'].hp === 250);
    hold('石劍'); g.addItem('石劍', 1); hold('石劍'); p.atkT = 0; g.attack(tt); E.update(0.01, g);
    ok('hit, the turtle heads for the nearest sea at 1.4× its pace (a step every 1.07 s)', tt.hp < 250 && tt.flee && tt.flee.x === cx + 5 && tt.flee.y === cy + 2 && Math.abs(tt.moveT - 1.5 / 1.4) < 1e-6 && tt.x === cx + 3, [tt.flee, tt.moveT, tt.x]);
    for (let i = 0; i < 60 && E.list.includes(tt); i++) E.update(0.1, g);
    ok('reaching the water it dives and is gone', !E.list.includes(tt));
    // 野豬：命二百、一撞七點五、五格內見人就衝，速度同豹
    const boar = E.add('豬', cx + 3, cy, { moveT: 0 }); E.update(0.01, g);
    ok('野豬: 200 hp, hits for 7.5, charges within five tiles at leopard speed', D['豬'].hp === 200 && D['豬'].atk === 7.5 && D['豬'].name === '野豬' && boar.x === cx + 2 && Math.abs(boar.moveT - 0.22) < 1e-6 && E.isHostile(boar), [boar.x, boar.moveT]);
    p.hp = 100; g.hit(boar, D['豬'].atk);
    ok('a boar hit takes exactly 7.5 (not rounded to 8)', Math.abs((100 - p.hp) - 7.5 * g.takenMult()) < 0.06, p.hp);
    E.remove(boar); p.hp = 100;
    // 野牛：命四百五、一頂五、不惹不動；惹了追著撞，擋路的人造磚三下就碎
    const bison = E.add('牛', cx + 3, cy, { moveT: 0 }); for (let i = 0; i < 5; i++) E.update(0.5, g);
    ok('野牛: 450 hp, hits for 5, leaves you alone unprovoked', D['牛'].hp === 450 && D['牛'].atk === 5 && !E.isHostile(bison) && Math.max(Math.abs(bison.x - cx), Math.abs(bison.y - cy)) >= 2);
    for (const dy of [-1, 0, 1]) put(cx + 1, cy + dy, '磚');
    bison.x = cx + 2; bison.y = cy; bison.angry = true; bison.angryAt = w.time; bison.atk = 0; bison.moveT = 0;
    let ruined = false, rams = 0; for (let i = 0; i < 160 && w.get(cx + 1, cy) !== '白'; i++) { const a0 = bison.atk; E.update(0.1, g); if (bison.atk > a0 + 0.5) rams++; if (w.get(cx + 1, cy) === '墟') ruined = true; }
    ok('v0.6.2: an angered bison rams the brick: at half its hidden strength it turns to 墟, and it breaks on the fourth ram', ruined && rams === 4 && w.get(cx + 1, cy) === '白' && E.isHostile(bison), [w.get(cx + 1, cy), rams]);
    put(cx + 1, cy, '窗'); bison.x = cx + 2; bison.y = cy; bison.atk = 0; let red = false; rams = 0;
    for (let i = 0; i < 120 && w.get(cx + 1, cy) === '窗'; i++) { const a0 = bison.atk; E.update(0.1, g); if (bison.atk > a0 + 0.5) rams++; if (w.wallHurt(cx + 1, cy)) red = true; }
    ok('v0.6.2: a window has half a brick\'s strength: it turns red after one ram and breaks on the second', red && rams === 2 && w.get(cx + 1, cy) === '白', [w.get(cx + 1, cy), rams]);
    E.remove(bison);
    // 磚擋光擋眼；窗不擋
    put(cx - 6, cy, '燈'); for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) put(cx - 6 + dx, cy + dy, '磚');
    ok('bricks block light: a lamp ringed with bricks is not seen two tiles outside', w.lightNear(cx - 6, cy - 2, 3) === false && w.lightNear(cx - 6, cy, 3) === true);
    put(cx - 6, cy - 1, '窗');
    ok('a window lets the light through', w.lightNear(cx - 6, cy - 2, 3) === true && !w.clear(cx - 6, cy + 2, cx - 6, cy) && w.clear(cx - 6, cy - 2, cx - 6, cy));
    const tg = E.add('虎', cx + 4, cy, { moveT: 99 }); put(cx + 2, cy, '磚'); const hid = E.sense(tg, p, 10); put(cx + 2, cy, '窗'); const seen = E.sense(tg, p, 10);
    ok('a beast that sees you senses you at full range; behind bricks only by smell, at 70%', Math.abs(hid - 7) < 1e-9 && seen === 10, [hid, seen]);
    E.remove(tg); put(cx + 2, cy, '草');
    // 窗多的屋子睡得舒坦：一格的小屋，北南西三面磚、東邊是床
    const rx = cx - 3, ry = cy + 6; put(rx, ry, '草'); put(rx + 1, ry, '床'); put(rx, ry - 1, '磚'); put(rx, ry + 1, '磚'); put(rx - 1, ry, '磚');
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(rx + dx, ry + dy, '磚');
    p.x = rx; p.y = ry; p.rx = rx; p.ry = ry; E.list = [];
    setDay(0.93); p.san = 10; g.sleep(); const plain = p.san - 10;
    put(rx - 1, ry, '窗'); setDay(0.93); p.san = 10; g.sleep(); const lit = p.san - 10, share = g.windowShare();
    ok('v0.6.2: sleeping where windows ÷ room area is over 1/5: 愜意 +24 (20 × 1.2) instead of +20', plain === 20 && share === 1 && lit === 24, [plain, share, lit]);
    ok('v0.6.2: window tiers — over 1/9 +5%, over 1/7 +12%, over 1/5 +20%; exactly 1/9 gives nothing', g.windowBonus(1 / 9) === 0 && g.windowBonus(0.12) === 0.05 && g.windowBonus(1 / 6) === 0.12 && g.windowBonus(0.21) === 0.2 && g.windowBonus(0) === 0);
    ok('v0.6.2: a bright room also speeds every 愜意 gain by 5% for a whole day', p.sanBoostUntil > w.time + DAY - 2 && g.sanUp(10) === 10.5, [p.sanBoostUntil - w.time, g.sanUp(10)]);
    w.time = p.sanBoostUntil + 1; ok('…and the day-long boost wears off', g.sanUp(10) === 10); p.sanBoostUntil = 0;
    p.x = cx; p.y = cy; p.rx = cx; p.ry = cy; setDay(0.53);
    // 沼澤：獸除了蟾都不進；站在裡面掉力；搭上棧（v0.8.22 橋與棧併成一樣）
    put(cx + 3, cy - 4, '沼');
    ok('swamp: beasts keep out of it except toads', !E.canStand('虎', cx + 3, cy - 4, true) && !E.canStand('豬', cx + 3, cy - 4, true) && !E.canStand('牛', cx + 3, cy - 4, true) && E.canStand('蟾', cx + 3, cy - 4, true));
    put(cx, cy, '沼'); p.sta = 50; await sleep(700);
    ok('standing in a swamp drains 力 instead of resting it', p.sta < 50, p.sta);
    put(cx, cy, '草'); put(cx + 1, cy, '沼'); p.fx = 1; p.fy = 0; g.addItem('棧', 1); hold('棧'); g.pressPlace();
    ok('v0.8.22: a 棧 laid on the swamp you walk on as on flat ground (the plank no longer lays one)', w.get(cx + 1, cy) === '棧' && D['棧'].walk === 1 && g.count('棧') === 0 && !D['橋'] && G.RECIPES.find(r => r.id === 'bridge').out === '棧');
    { const b0 = w.base(cx + 1, cy); w.base = ((orig) => (x, y) => x === cx + 1 && y === cy ? '沼' : orig.call(w, x, y))(w.base); g.action = null; p.fx = 1; p.fy = 0; g.pressGather(); takeYes(); await until(() => g.count('棧') === 1, 4000); await sleep(30); const back = w.get(cx + 1, cy); delete w.base; w.set(cx + 1, cy, '沼');   // 底稿借來當沼（真的沼很少見）；還原時要在借用期間看
      ok('v0.8.22: …taking it back gives the 棧 back and leaves the swamp', back === '沼' && g.count('棧') === 1, [back, g.count('棧'), b0]); g.removeItem('棧', 9); }
    put(cx + 1, cy, '川'); g.addItem('木板', 1); hold('木板'); g.pressPlace(); const plankNo = w.get(cx + 1, cy) === '川'; g.addItem('棧', 1); hold('棧'); g.pressPlace();
    ok('v0.8.22: a 棧 goes on a river too; a plank does not', plankNo && w.get(cx + 1, cy) === '棧' && g.count('木板') === 1, w.get(cx + 1, cy)); w.set(cx + 1, cy, '草'); g.removeItem('木板', 9); g.removeItem('棧', 9);
    g.addItem('磚', 1); hold('磚'); put(cx + 1, cy, '沼'); g.pressPlace();
    ok('nothing else can be set down on a swamp', w.get(cx + 1, cy) === '沼' && g.count('磚') === 1);
    // 油脂（v0.8.3）：斃野豬野牛 35% 得一份（真隨機），要裝在麻布包裡（一包八份，包不會用掉）；棉一油脂一做三根蠟燭
    p.bag = []; g.barSig = '';
    const b0 = E.add('豬', cx + 4, cy + 4, { moveT: 99 }); window.U.trueRand = () => 0.1; g.kill(b0); window.U.trueRand = tr;
    ok('v0.8.3: with no 麻布包 the boar\'s fat cannot be carried and is lost', g.count('油脂') === 0 && /沒有空的麻布包/.test(g.msgText), g.msgText);
    p.bag = []; g.addItem('麻布', 2); g.addItem('麻', 1); p.sta = p.staMax; g.craft('oilbag'); const ob = () => p.bag.find(s => s.n === '麻布包');
    ok('v0.8.3: 麻布二、麻一 sew an empty 麻布包; the bag slot reads 油 0/8', g.count('麻布包') === 1 && ob().oil === 0 && g.count('麻布') === 0 && (() => { g.barSig = ''; g.buildBag(); return /油 0\/8/.test(document.getElementById('bagbar').textContent); })(), bag());
    const b2 = E.add('豬', cx + 4, cy + 4, { moveT: 99 }); window.U.trueRand = () => 0.34; g.kill(b2);
    const b3 = E.add('牛', cx + 4, cy + 4, { moveT: 99 }); g.kill(b3);
    const b4 = E.add('牛', cx + 4, cy + 4, { moveT: 99 }); window.U.trueRand = () => 0.36; g.kill(b4); window.U.trueRand = tr;
    ok('v0.8.3: boar and bison each give one portion of fat 35% of the time, into the 麻布包', g.count('肉') === 11 && g.count('油脂') === 2 && ob().oil === 2, bag());
    g.addItem('棉', 1); p.sta = p.staMax; g.craft('candle2');
    ok('棉一油脂一 makes three candles — the fat comes out of the bag, the bag stays', g.count('蠟燭') === 3 && g.count('油脂') === 1 && ob().oil === 1 && g.count('麻布包') === 1, bag());
    ob().oil = 8; ok('v0.8.3: a full bag takes no more fat', !g.canAdd('油脂', 1) && g.addItem('油脂', 1) === 1);
    // 製作欄：v0.6.10 起照配方表一條一條列，不畫衍生樹
    g.craftCat = '燈火'; const vr = g.visibleRecipes().map(r => r.id), want = G.RECIPES.filter(r => r.cat === '燈火').map(r => r.id);
    ok('v0.6.10: craft panel 燈火 lists its recipes in table order, no parent/child levels', vr.join() === want.join() && typeof g.craftTree !== 'function' && typeof g.craftParents !== 'function', vr);
    g.craftCat = '全部'; ok('v0.6.10: 全部 lists every recipe once, in table order', g.visibleRecipes().map(r => r.id).join() === G.RECIPES.map(r => r.id).join());
    g.craftCat = '燈火'; g.toggleCraft(); await sleep(30);
    ok('v0.6.10: the craft panel draws no tree lines or indented rows', document.querySelectorAll('#craft-list .recipe').length === want.length && !document.querySelector('#craft-list .tree, #craft-list .recipe.child, #craft-list .recipe.parent, #craft-list .from'));
    g.toggleCraft(); g.craftCat = '全部';
    ok('each of 虎豹狼蛇蛛 (and 野豬、野牛) has its own call', typeof SFX.beast === 'function' && ['虎', '豹', '狼', '蛇', '蛛', '豬', '牛'].every(t => SFX.beastTypes.indexOf(t) >= 0));
    ok('the help says 磚, not 牆, for walls', document.getElementById('help').textContent.indexOf('穿牆') < 0 && document.getElementById('help').textContent.indexOf('砌牆') < 0);
    for (let i = area.length - 1; i >= 0; i--) w.set(area[i][0], area[i][1], area[i][2]);
    E.list = []; p.x = X0; p.y = Y0; p.rx = X0; p.ry = Y0; p.bag = keepB; p.tools = keepT; p.tool = keepI; p.sel = 0; g.barSig = ''; g.buildBag(); Math.random = mr; calm(); }
  // ============ 簡體中文（v0.5.4）：只在顯示那一層轉字，程式、存檔、字庫的鍵一律繁體 ============
  { calm();
    ok('the converter: 字裡行間 → 字里行间; 乾坤 and 著名 kept as words; 穿著 → 穿着; 九閽鳴雷 → 九阍鸣雷', I18N.toHans('字裡行間 · 一紙之島') === '字里行间 · 一纸之岛' && I18N.toHans('乾坤') === '乾坤' && I18N.toHans('著名') === '著名' && I18N.toHans('穿著') === '穿着' && I18N.toHans('九閽鳴雷') === '九阍鸣雷');
    ok('traditional by default; the pause panel offers 简体中文', !I18N.hans && document.documentElement.lang === 'zh-TW' && document.getElementById('pause-lang').textContent === '简体中文');
    const lore = document.querySelector('#start .lore'), lore0 = lore.textContent, help = document.getElementById('help'), help0 = help.textContent;
    I18N.set('hans'); await sleep(30);
    ok('choosing 简体 converts the page (start page, help) and remembers the choice', I18N.hans && document.documentElement.lang === 'zh-CN' && document.documentElement.classList.contains('hans') && lore.textContent.indexOf('鸟栖于山') >= 0 && help.textContent.indexOf('胆气') >= 0 && help.textContent.indexOf('膽氣') < 0 && localStorage.getItem('xieyi.lang') === 'hans', lore.textContent.slice(0, 20));
    ok('the language options themselves stay as they are written', document.querySelector('[data-lang="hant"]').textContent === '繁體' && document.getElementById('pause-lang').textContent === '繁體中文' && document.querySelector('[data-lang="hans"]').classList.contains('on'));
    g.toast('測試標題', '櫃裡的鐵與鳥'); g.message('灶火還能燒 99 息。'); g.lastMsg = ''; g.updateHUD(); await sleep(30);
    ok('toasts and messages the game writes afterwards come out simplified', toasts().indexOf('柜里的铁与鸟') >= 0 && document.getElementById('msg').textContent.indexOf('灶火还能烧 99 息') >= 0, [toasts().slice(-20), document.getElementById('msg').textContent]);
    g.addItem('鐵', 1); g.barSig = ''; g.buildBag(); await sleep(30);
    const ironSlot = [...document.querySelectorAll('#bagbar .slot')].find(el => el.textContent.indexOf('铁') >= 0);
    ok('the bag shows 铁 with a simplified tooltip, while the game still counts 鐵', !!ironSlot && ironSlot.title.indexOf('铁') >= 0 && document.getElementById('bagbar').textContent.indexOf('鐵') < 0 && g.count('鐵') >= 1, ironSlot && ironSlot.title.slice(0, 20));
    g.renderer.atlas.delete('鸟|#123456'); g.renderer.glyph('鳥', '#123456');
    ok('glyphs drawn on the canvas are simplified too', g.renderer.atlas.has('鸟|#123456') && !g.renderer.atlas.has('鳥|#123456'));
    g.save(); const svh = JSON.parse(localStorage.getItem('xieyi.save.v5'));
    ok('the save stays in traditional keys', JSON.stringify(svh.player.bag).indexOf('鐵') >= 0 && JSON.stringify(svh.player.bag).indexOf('铁') < 0);
    I18N.set('hant'); await sleep(30);
    ok('back to 繁體: the original text is put back, including the toast written while simplified', !I18N.hans && document.documentElement.lang === 'zh-TW' && lore.textContent === lore0 && help.textContent === help0 && toasts().indexOf('櫃裡的鐵與鳥') >= 0 && localStorage.getItem('xieyi.lang') === 'hant', toasts().slice(-20));
    document.getElementById('pause-lang').click(); await sleep(20); const viaPause = I18N.hans; document.getElementById('pause-lang').click(); await sleep(20);
    ok('the pause-panel button switches back and forth', viaPause && !I18N.hans && document.getElementById('pause-lang').textContent === '简体中文');
    g.removeItem('鐵', 1); }
  // ============ v0.6.2：一日三百息從半夜起算、精確到四位、墟與補牆、草花田路上放東西、舊存檔 ============
  { ok('v0.6.2: a fresh island wakes in the early morning, just after dawn', new window.World(w.seed + 7).time === DAY * 0.26);
    const old = JSON.parse(JSON.stringify(w.serialize())); delete old.dayLen; old.time = 375 * 9 + 375 * 0.8; old.diff['3,3'] = '牆';
    old.scarecrows = { '0,0': old.time + 100 }; old.timers = { '1,1': ['苗', old.time + 50, '田'] };
    const w3 = new window.World(w.seed); w3.restore(old, 10);
    ok('v0.6.2: an old save keeps its day number and comes back at that day\'s early morning', w3.time === DAY * 9 + DAY * 0.26, w3.time / DAY);
    ok('…timers saved in it keep the same countdown, and its old 牆 reads 墟', Math.abs(w3.scarecrows.get('0,0') - (w3.time + 100)) < 1e-6 && Math.abs(w3.timers.get('1,1').at - (w3.time + 50)) < 1e-6 && w3.diff.get('3,3') === '墟');
    const w4 = new window.World(w.seed); w4.restore(w.serialize(), g.day());
    ok('v0.6.2: a save made now keeps its exact time', w4.time === U.r4(w.time) && w4.timeShift === 0, [w4.time, w.time]);
    ok('v0.6.2: 墟 replaces the village\'s broken walls (牆 is gone from the glyph table)', !!G.DB['墟'] && !G.DB['牆'] && G.DB['墟'].opaque && G.PLACES.find(q => q.id === 'cun').template.join('').indexOf('墟') >= 0 && G.PLACES.find(q => q.id === 'cun').template.join('').indexOf('牆') < 0);
    ok('v0.6.2: U.r4 keeps four decimals', U.r4(20 * 5 / 3 * 0.83) === 27.6667 && U.r4(1 / 3) === 0.3333 && U.r4(2.00004) === 2);
    face(1, 0); w.set(T().x, T().y, '磚'); const r1 = w.hitWall(T().x, T().y), r2 = w.hitWall(T().x, T().y);
    ok('v0.6.2: two hits on a brick: still 磚 after the first, 墟 after the second', r1 === 'hit' && r2 === 'ruined' && w.get(T().x, T().y) === '墟', [r1, r2]);
    g.addItem('磚', 1); hold('磚'); const b0 = g.count('磚'); g.pressPlace();
    ok('v0.6.2: a 磚 laid straight onto 墟 makes a whole brick again', w.get(T().x, T().y) === '磚' && !w.wallHp.has(U.key(T().x, T().y)) && g.count('磚') === b0 - 1);
    w.set(T().x, T().y, '墟'); const v1 = w.hitWall(T().x, T().y), v2 = w.hitWall(T().x, T().y);
    ok('v0.6.2: the village\'s own 墟 is weaker than a brick: two hits and it is gone', v1 === 'hit' && v2 === 'broken', [v1, v2]);
    w.set(T().x, T().y, '窗'); const c1 = w.hitWall(T().x, T().y);
    ok('v0.6.2: a window hit once is at half strength and turns red', c1 === 'cracked' && w.wallHurt(T().x, T().y));
    g.addItem('窗', 2); hold('窗'); const n0 = g.count('窗'); g.pressPlace();
    ok('v0.6.2: a 窗 put onto the red window replaces it', w.get(T().x, T().y) === '窗' && !w.wallHurt(T().x, T().y) && g.count('窗') === n0 - 1);
    g.pressPlace(); ok('…but a whole window is left alone', g.count('窗') === n0 - 1);
    g.removeItem('窗', 9); w.set(T().x, T().y, '草'); }
  // ============ v0.6.4：具欄分武器與農具、P 換武器 O 換農具、舊石器磨回石子、光照圖、雨裡的燈、霧順著飄 ============
  { const keepT = p.tools, keepI = p.tool; p.tools = []; p.tool = -1;
    for (const n of ['石鎬', '石劍', '石斧', '石刀']) p.tools.push({ n, c: 1, dur: 40 });
    g.barSig = ''; g.buildBag(); await sleep(30);
    const order = p.tools.map(s => s.n).join(''), labels = [...document.querySelectorAll('#toolbar .rowlabel')].map(l => l.textContent).join('');
    ok('v0.6.4: the tool bar has two parts — weapons first (武), then farm tools (農) — sharing the same six slots', order === '石劍石刀石鎬石斧' && labels === '武農' && document.querySelectorAll('#toolbar .slot').length === g.toolSlots(), [order, labels]);
    const seq = []; for (let i = 0; i < 3; i++) { await press('KeyP', 20); seq.push(g.activeTool() ? g.activeTool().n : '空'); }
    for (let i = 0; i < 3; i++) { await press('KeyO', 20); seq.push(g.activeTool() ? g.activeTool().n : '空'); }
    await press('KeyO', 20); await press('KeyP', 20); seq.push(g.activeTool() ? g.activeTool().n : '空');
    ok('v0.6.4: P goes through the weapons then empty hand; O through the farm tools; P from a farm tool picks the first weapon', seq.join(',') === '石劍,石刀,空,石鎬,石斧,空,石劍', seq);
    g.addItem('鋼鎬', 1); g.barSig = ''; g.buildBag();
    ok('v0.6.4: a new farm tool goes into the farm part, and the weapon in hand stays in hand', p.tools.map(s => s.n).join('') === '石劍石刀石鎬石斧鋼鎬' && g.activeTool().n === '石劍', p.tools.map(s => s.n));
    hold('石刀'); const peb0 = g.count('石子'); p.sta = 50; g.craft('crush');
    ok('v0.6.4: the stone knife in hand is ground back into two pebbles', !p.tools.some(s => s.n === '石刀') && g.count('石子') === peb0 + 2 && !g.activeTool());
    p.tools = p.tools.filter(s => s.n === '鋼鎬'); p.tool = 0; p.bag.push({ n: '石斧', c: 1, dur: 12 }); p.sta = 50; g.craft('crush');
    ok('v0.6.4: with no stone tool in hand, one from the bag is ground instead (the steel pick in hand is left alone)', g.count('石子') === peb0 + 4 && !p.bag.some(s => s.n === '石斧') && g.activeTool() && g.activeTool().n === '鋼鎬', bag());
    p.bag = p.bag.filter(s => ['石刀', '石鎬', '石鋤', '石劍', '石斧'].indexOf(s.n) < 0); p.tools = []; p.tool = -1; g.craft('crush');
    ok('v0.6.4: nothing to grind: a clear message and nothing taken', g.count('石子') === peb0 + 4 && g.msgText.indexOf('石器') >= 0);
    ok('v0.6.4: 研磨石器 sits in the 工具 recipes', G.RECIPES.find(r => r.id === 'crush').cat === '工具');
    p.tools = keepT; p.tool = keepI; g.barSig = ''; g.buildBag(); g.removeItem('石子', 4); }
  { const R = g.renderer, ax = p.x + 30, ay = p.y + 30;
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) w.set(ax + dx, ay + dy, '草');
    const open1 = R.sight(w, ax, ay, 4); w.set(ax + 2, ay, '磚'); const walled = R.sight(w, ax, ay, 4), again = R.sight(w, ax, ay, 4);
    const W = 9, at = (v, dx, dy) => v[(dy + 4) * W + dx + 4];
    ok('v0.6.4: light sight — nothing in the way means all lit; a brick hides what is behind it; the answer is cached until the ground changes', open1 === null && walled && at(walled, 2, 0) === 1 && at(walled, 3, 0) === 0 && at(walled, 0, 3) === 1 && again === walled, walled && [at(walled, 2, 0), at(walled, 3, 0)]);
    w.set(ax + 2, ay, '草'); ok('…and a changed ground invalidates it', R.sight(w, ax, ay, 4) === null);
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) w.set(ax + dx, ay + dy, w.base(ax + dx, ay + dy));
    const lx = p.x + 2, ly = p.y - 1, was = w.get(lx, ly); w.set(lx, ly, '燈'); setDay(0.5); w.rainUntil = w.time + DAY; await sleep(1900);
    const dayRain = R.lastLm; w.rainUntil = 0; const nr0 = w.nextRainAt; w.nextRainAt = w.time + DAY * 9; R.rainA = 0; await sleep(120); const dayDry = R.lastLm; w.nextRainAt = nr0;   // 天氣是真隨機：量乾天時先別讓雨自己下
    ok('v0.6.4: in daytime rain a lamp still glows faintly; on a dry day there is no light layer at all', !!dayRain && dayRain.glow && !dayDry, [!!dayRain, dayRain && dayRain.glow, !!dayDry]);
    setDay(0.9); await sleep(120); const nightLm = R.lastLm;
    ok('v0.6.4: at night the light map carries the darkness and the lamp\'s warm glow', !!nightLm && nightLm.glow && nightLm.cols > 0 && R.lmDark.width === nightLm.cols, nightLm && [nightLm.cols, nightLm.rows]);
    w.set(lx, ly, was); setDay(0.53); }
  { const fx = p.x - 16, fy = p.y; for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) w.set(fx + dx, fy + dy, '草');
    const ns = []; for (let i = 0; i < 40; i++) ns.push(window.World.newFogShape(18).n);
    ok('v0.6.4: fog shapes run from round (power near 2) to square (power near 6)', Math.min(...ns) < 2.8 && Math.max(...ns) > 5, [Math.min(...ns), Math.max(...ns)]);
    for (const id of [...w.fogs.keys()]) w.removeFog(id);
    const f = w.addFog(null, w.time + DAY, false, window.World.newFogShape(18), [fx + 0.5, fy + 0.5]), cov = w.fogCoverage(f, undefined, undefined, undefined, f.mul);
    const area = cov.reduce((a, e) => a + e.c, 0), counted = [...f.cells], byKey = new Map(cov.map(e => [e.k, e.c]));
    ok('v0.6.4: a fog covers about eighteen tiles of area; a tile counts once more than 5% of it is covered; at most thirty count', Math.abs(area - 18) < 1.6 && counted.length <= 30 && counted.length >= 18 && counted.every(k => byKey.get(k) > 0.05) && cov.filter(e => e.c > 0.05).length >= counted.length, [area, counted.length]);
    w.removeFog(f.id);
    const room = (half) => { for (let dy = -half - 1; dy <= half + 1; dy++) for (let dx = -half - 1; dx <= half + 1; dx++) w.set(fx + dx, fy + dy, Math.max(Math.abs(dx), Math.abs(dy)) === half + 1 ? '磚' : '草'); };
    room(2); const f5 = w.addFog(null, w.time + DAY, false, window.World.newFogShape(18), [fx + 0.5, fy + 0.5]);
    const inSmall = [...f5.cells].filter(k => { const [x, y] = k.split(',').map(Number); return Math.abs(x - fx) <= 2 && Math.abs(y - fy) <= 2; }).length;
    w.removeFog(f5.id); room(3); const f7 = w.addFog(null, w.time + DAY, false, window.World.newFogShape(18), [fx + 0.5, fy + 0.5]);
    const inBig = [...f7.cells].filter(k => { const [x, y] = k.split(',').map(Number); return Math.abs(x - fx) <= 3 && Math.abs(y - fy) <= 3; }).length;
    ok('v0.6.4: fog stays out of a walled room of 45 tiles or less (5×5 = 25), but drifts into a bigger one (7×7 = 49)', inSmall === 0 && inBig > 10, [inSmall, inBig]);
    w.removeFog(f7.id); room(4); for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) w.set(fx + dx, fy + dy, w.base(fx + dx, fy + dy));
    const fg = w.addFog(null, w.time + DAY, false, window.World.newFogShape(18), [p.x - 6.5, p.y + 0.5]);
    await sleep(100); const seen = g.renderer.fogSeen.has(fg.id) && (fg._cov || []).length > 0;
    w.removeFog(fg.id); await until(() => fg._fade < 1 || !g.renderer.fogSeen.has(fg.id), 1500); const fading = g.renderer.fogSeen.has(fg.id) && fg._fade < 1;   // 等到有一幀開始淡（慢的機器一幀可能超過八十毫秒）；淡完要一息
    ok('v0.6.4: the renderer draws the fog from its coverage, and a fog that is gone fades out instead of vanishing', seen && fading, [seen, fading]); }
  // ============ v0.6.5：霧障爬山渡海、繞著小屋走；魄煙滅長膽氣、燈帽少兩息；神兵修理是鎢鋼的兩倍 ============
  { const fx = p.x + 20, fy = p.y - 20, clear = (r, ch) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) w.set(fx + dx, fy + dy, ch); };
    clear(10, '草'); for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { w.set(fx + dx - 6, fy + dy, '水'); w.set(fx + dx + 6, fy + dy, '山'); }
    const fw = w.addFog(null, w.time + DAY, false, window.World.newFogShape(18), [fx - 5.5, fy + 0.5]), fm = w.addFog(null, w.time + DAY, false, window.World.newFogShape(18), [fx + 6.5, fy + 0.5]);
    const on = (f, ch) => [...f.cells].filter(k => { const [x, y] = k.split(',').map(Number); return w.get(x, y) === ch; }).length;
    ok('v0.6.5: fog goes over water and over mountains', on(fw, '水') >= 10 && on(fm, '山') >= 10, [on(fw, '水'), on(fm, '山')]);
    w.removeFog(fw.id); w.removeFog(fm.id); clear(10, '草');
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === 3) w.set(fx + dx, fy + dy, '磚');
    const fh = w.addFog(null, w.time + DAY, false, window.World.newFogShape(18), [fx - 5.5, fy + 0.5]); fh.ang = 0; fh.gx = fh.x; fh.gy = fh.y;
    let wrapped = true, inside = 0; for (let i = 0; i < 12; i++) { w.placeFog(fh, fh.gx + Math.cos(fh.ang) * 0.5, fh.gy + Math.sin(fh.ang) * 0.5, fh.age); const cv = w.fogCover(fh); if (Math.abs(cv.area - fh.shape.area) > 1.2) wrapped = false; inside += [...fh.cells].filter(k => { const [x, y] = k.split(',').map(Number); return Math.abs(x - fx) <= 2 && Math.abs(y - fy) <= 2; }).length; }
    { const ix = fx - 8, iy = fy + 7; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) w.set(ix + dx, iy + dy, Math.max(Math.abs(dx), Math.abs(dy)) === 2 ? '水' : '草');
      ok('v0.6.7: a little pocket ringed by water alone is not a house — fog may drift in', !w.fogRoom(ix, iy));
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) w.set(ix + dx, iy + dy, '草'); }
    ok('v0.6.5: meeting a small house the fog turns aside, wraps round it with the same area, and never enters', (fh.turned || 0) >= 1 && Math.abs(Math.cos(fh.ang)) < 0.9 && wrapped && inside === 0, [fh.turned, fh.ang, wrapped, inside]);
    w.removeFog(fh.id); clear(10, w.base(fx, fy));
    for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) w.set(fx + dx, fy + dy, w.base(fx + dx, fy + dy));
    const fe = w.addFog(null, w.time + DAY, false, window.World.newFogShape(18), [0.5, G.WORLD_R - 3.5]); fe.ang = Math.PI / 2; w.placeFog(fe, fe.x, fe.y, fe.age);
    ok('v0.6.5/v0.7: at the edge of the paper a fog turns back toward the island instead of drifting off', Math.sin(fe.ang) < 0, fe.ang);
    w.removeFog(fe.id); }
  { const gx = p.x + 3, gy = p.y + 3, keepT = []; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 4; dx++) { keepT.push([gx + dx, gy + dy, w.get(gx + dx, gy + dy)]); w.set(gx + dx, gy + dy, '草'); }
    w.set(gx, gy, '燈'); setDay(0.9); const hat0 = p.worn['帽']; p.worn['帽'] = { n: '燈帽', c: 1, fuel: 100 }; g.ents.list = g.ents.list.filter(e => e.type !== '魄');
    p.cour = g.levelAt(5) + 1; const c0 = p.cour, need5 = g.levelCost(5), out0 = !g.indoors();
    const gh = g.ents.add('魄', gx + 2, gy, { moveT: 99 }); g.ents.update(0.02, g);
    ok('v0.6.5: a ghost burned by a lamp at night while you stand outdoors gives 1% of this level (not points), and the lamp hat loses two seconds', out0 && gh.fade < 1 && Math.abs(p.cour - c0 - need5 * 0.01) < 1e-6 && Math.abs(p.worn['帽'].fuel - 98) < 0.01, [p.cour - c0, need5 * 0.01, p.worn['帽'].fuel]);
    const ind = g.indoors; g.indoors = () => true; const c1 = p.cour; const gh2 = g.ents.add('魄', gx + 2, gy + 1, { moveT: 99 }); g.ents.update(0.02, g); g.indoors = ind;
    ok('…indoors there is no courage for it, but the lamp hat still pays two seconds', gh2.fade < 1 && p.cour === c1 && Math.abs(p.worn['帽'].fuel - 96) < 0.01, [p.cour - c1, p.worn['帽'].fuel]);
    p.cour = g.levelAt(25) + 1; const c2 = p.cour; const gh3 = g.ents.add('魄', gx + 2, gy - 1, { moveT: 99 }); g.ents.update(0.02, g);
    ok('…past level 22 it still counts (a ghost is a foe), still 1% of the level', gh3.fade < 1 && Math.abs(p.cour - c2 - g.levelCost(25) * 0.01) < 1e-6, p.cour - c2);
    g.ents.list = g.ents.list.filter(e => e.type !== '魄'); p.worn['帽'] = hat0; p.cour = 0; for (const [x, y, ch] of keepT) w.set(x, y, ch); setDay(0.53); }
  { const keepT = p.tools, keepI = p.tool; p.tools = [{ n: '九閽鳴雷', c: 1, dur: 10 }]; p.tool = 0; g.removeItem('鐵', 99); g.removeItem('鎢鋼', 99); g.addItem('鐵', 40); g.addItem('鎢鋼', 12);
    const gc = []; let sf = true; for (let i = 0; i < 4; i++) { const i0 = g.count('鐵'), t0 = g.count('鎢鋼'); p.tools[0].dur = 3; p.sta = 50; p.food = 50; g.craft('regrind'); gc.push((i0 - g.count('鐵')) + '+' + (t0 - g.count('鎢鋼'))); if (p.sta !== 34 || Math.round(p.food) !== 30) sf = false; }
    ok('v0.6.5: mending a god weapon costs twice tungsten — 鐵 2; 鐵 4; 鐵 6 + 鎢鋼 2; 鐵 12 + 鎢鋼 4 — and 16 stamina, 20 food', gc.join(',') === '2+0,4+0,6+2,12+4' && sf && p.tools[0].dur === 199, [gc, p.sta, p.food]);
    p.tools = keepT; p.tool = keepI; g.removeItem('鐵', 99); g.removeItem('鎢鋼', 99); g.barSig = ''; g.buildBag(); }
  // —— v0.6.5／v0.6.6：滑鼠點遠處的格子，自己找路走到它旁邊（不踩上去）、面向它；點會動的生靈就跟著
  { const X = p.x, Y = p.y; g.ents.list = g.ents.list.filter(e => e.type === '龍' || e.type === '鷹'); unarm(); p.sailing = false; p.swimming = false;
    for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) w.set(X + dx, Y + dy, '草');
    const goTo = async (tx, ty, ms) => { g.walkTo(tx, ty); await until(() => !g.path && p.moveT <= 0, ms || 8000); };
    const faces = (tx, ty) => p.x + p.fx === tx && p.y + p.fy === ty && !(p.x === tx && p.y === ty);
    w.set(X + 5, Y, '木'); await goTo(X + 5, Y);
    ok('v0.6.6: clicking a tree five east stops on the nearest of its eight neighbours (four east), facing it — not on it', p.x === X + 4 && p.y === Y && faces(X + 5, Y), [p.x - X, p.y - Y, p.fx, p.fy]);
    w.set(X + 5, Y, '草'); p.x = p.rx = X; p.y = p.ry = Y; await goTo(X + 5, Y - 2);
    ok('v0.7.1: clicking open ground (a grass tile) walks right onto it', p.x === X + 5 && p.y === Y - 2 && !g.path, [p.x - X, p.y - Y]);
    ok('v0.7.1: what counts as open ground: bare ground, paper, grass, 棧 and steps — not swamp, trees, rock or a tile with a creature on it', (() => { const t = (ch) => { w.set(X - 8, Y - 8, ch); return g.openGround(X - 8, Y - 8); }; const res = ['白', '土', '沙', '路', '草', '花', '棧', '階', '漠'].every(t) && !['沼', '木', '林', '山', '石', '磚', '門'].some(t); w.set(X - 8, Y - 8, '草'); const cow = g.ents.add('牛', X - 8, Y - 8, { moveT: 99, calm: 99 }); const occ = g.openGround(X - 8, Y - 8); g.ents.remove(cow); return res && !occ; })());
    p.x = p.rx = X; p.y = p.ry = Y; for (let dy = -3; dy <= 3; dy++) w.set(X + 3, Y + dy, '磚');   // 一道南北向的磚，擋在東邊
    const path = g.findPath(X + 6, Y), last = path && path[path.length - 1];
    ok('v0.6.5: clicking a tile behind a wall finds a way round it (never through the bricks), ending beside the tile', !!path && path.length >= 6 && path.every(([x, y]) => w.get(x, y) !== '磚' && !(x === X + 6 && y === Y)) && U.cheb(last[0], last[1], X + 6, Y) === 1, path && path.length);
    w.set(X + 6, Y, '木'); await goTo(X + 6, Y);
    ok('…walks there step by step and faces the clicked tile, ready for E or F', U.cheb(p.x, p.y, X + 6, Y) === 1 && faces(X + 6, Y), [p.x - X, p.y - Y]);
    w.set(X + 1, Y + 5, '山'); await goTo(X + 1, Y + 5);
    ok('v0.6.5: clicking a tile you cannot stand on (a mountain) walks up beside it and faces it', U.cheb(p.x, p.y, X + 1, Y + 5) === 1 && faces(X + 1, Y + 5), [p.x - X, p.y - Y, p.fx, p.fy]);
    g.walkTo(X - 7, Y - 7); await sleep(250); await press('KeyD', 120);
    ok('v0.6.5: pressing a direction key drops the clicked walk', !g.path && !g.follow, g.path && g.path.length);
    for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) w.set(X - 5 + dx, Y + 5 + dy, '磚');
    w.set(X - 5, Y + 5, '草'); await until(() => p.moveT <= 0, 2000); const was = [p.x, p.y]; const r = g.walkTo(X - 5, Y + 5);
    ok('v0.6.5: a tile whose eight neighbours are all walls cannot be reached: a message, and no walking', !r && !g.path && g.msgText.indexOf('走不過去') >= 0 && p.x === was[0] && p.y === was[1]);
    for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) w.set(X + dx, Y + dy, '草');
    await until(() => p.moveT <= 0, 2000); p.x = p.rx = X; p.y = p.ry = Y; g.renderer.camInit = false; await sleep(80);
    const R = g.renderer, T = R.tile, cvs = document.getElementById('world'), at = (x, y) => [R.w / 2 - R.camX * T + (x + 0.5) * T, R.h / 2 - R.camY * T + (y + 0.5) * T];
    let [sxp, syp] = at(X - 4, Y);
    cvs.dispatchEvent(new MouseEvent('mousedown', { clientX: sxp, clientY: syp, button: 0, bubbles: true })); await sleep(30);
    ok('v0.6.5: a real left click on a tile four away starts the walk there', !!g.path && g.pathGoal && g.pathGoal.x === X - 4 && g.pathGoal.y === Y && !g.follow, g.pathGoal);
    cvs.dispatchEvent(new MouseEvent('mousemove', { clientX: sxp, clientY: syp, bubbles: true })); await sleep(30);
    ok('…the cell under the mouse and the path are drawn (mouse tracked)', !!g.mouse && g.mouse.x === sxp);
    await until(() => !g.path && p.moveT <= 0, 6000); g.mouse = null;
    ok('v0.7.1: …and since it is open grass, the click walks right onto it', p.x === X - 4 && p.y === Y, [p.x - X, p.y - Y]);
    p.x = p.rx = X; p.y = p.ry = Y; g.renderer.camInit = false; await sleep(80); w.set(X + 1, Y, '路'); [sxp, syp] = at(X + 1, Y);
    cvs.dispatchEvent(new MouseEvent('mousedown', { clientX: sxp, clientY: syp, button: 0, bubbles: true })); await until(() => !g.path && p.moveT <= 0, 3000);
    ok('v0.7.1: clicking the empty path tile right beside you steps onto it (nothing there to take)', p.x === X + 1 && p.y === Y, [p.x - X, p.y - Y]);
    p.x = p.rx = X; p.y = p.ry = Y; g.renderer.camInit = false; await sleep(80); w.set(X + 1, Y, '草'); g.action = null; [sxp, syp] = at(X + 1, Y);
    cvs.dispatchEvent(new MouseEvent('mousedown', { clientX: sxp, clientY: syp, button: 0, bubbles: true })); await sleep(30);
    ok('v0.7.1: clicking grass right beside you still gathers it, like E', p.x === X && !!g.action && g.action.ch === '草', [p.x - X, g.action && g.action.ch]);
    g.action = null; w.set(X + 1, Y, '草');
    p.x = p.rx = X; p.y = p.ry = Y; g.renderer.camInit = false; await sleep(80);
    const ox0 = g.ents.add('牛', X + 7, Y, { moveT: 99, calm: 99 }); await sleep(40); [sxp, syp] = at(ox0.rx, ox0.ry);
    cvs.dispatchEvent(new MouseEvent('mousedown', { clientX: sxp + 3, clientY: syp - 2, button: 2, bubbles: true })); await sleep(30);
    const following = g.follow === ox0;
    await sleep(500); ox0.x = ox0.rx = X + 6; ox0.y = ox0.ry = Y + 5;   // 走到一半，牛挪了
    await until(() => !g.follow && p.moveT <= 0, 8000);
    ok('v0.6.6: clicking a creature (either button) follows it, even when it moves, until it is right beside you and you face it', following && !g.follow && U.cheb(p.x, p.y, ox0.x, ox0.y) === 1 && faces(ox0.x, ox0.y) && g.msgText.indexOf('跟上了') >= 0, [following, p.x - X, p.y - Y, ox0.x - X, ox0.y - Y]);
    g.ents.remove(ox0);
    // v0.6.7：安全的路——先避開沼澤與霧障；繞不開才穿過去，並說一聲
    for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) w.set(X + dx, Y + dy, '草');
    p.x = p.rx = X; p.y = p.ry = Y; for (let dy = -4; dy <= 4; dy++) w.set(X + 3, Y + dy, '沼');
    const pb = g.findPath(X + 6, Y);
    ok('v0.6.7: the clicked path goes round a swamp rather than through it', !!pb && pb.every(([x, y]) => w.get(x, y) !== '沼') && pb.some(([x, y]) => Math.abs(y - Y) >= 5), pb && pb.length);
    for (let dy = -4; dy <= 4; dy++) w.set(X + 3, Y + dy, '草');
    const fogCells = []; for (let dy = -4; dy <= 4; dy++) fogCells.push((X + 3) + ',' + (Y + dy)); const fgw = w.addFog(fogCells, w.time + DAY);
    const pf = g.findPath(X + 6, Y);
    ok('v0.6.7: …and round a fog bank too', !!pf && pf.every(([x, y]) => !w.fogAt(x, y)), pf && pf.length);
    w.removeFog(fgw.id);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === 2) w.set(X + 6 + dx, Y + dy, '沼');
    w.set(X + 6, Y, '木'); const plan = g.planPath(X + 6, Y); await goTo(X + 6, Y);
    ok('v0.6.7: when every way crosses a swamp it still goes, and says so', !!plan && !plan.safe && U.cheb(p.x, p.y, X + 6, Y) === 1 && g.msgText.indexOf('只好穿過去') >= 0, [plan && plan.safe, p.x - X, p.y - Y]);
    for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) w.set(X + dx, Y + dy, w.base(X + dx, Y + dy)); p.x = p.rx = X; p.y = p.ry = Y; }
  // —— v0.6.7：= 捉、Q 餵、Shift+= 放大；Q 不再是囊往前一格；滑鼠左右鍵不分，點身旁一格跟 E 一樣
  { const X = p.x, Y = p.y; await until(() => p.moveT <= 0, 2000); g.ents.list = g.ents.list.filter(e => e.type === '龍');
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) w.set(X + dx, Y + dy, '草');
    face(1, 0); w.set(X + 1, Y, '水'); const fish = g.ents.add('魚', X + 1, Y, { moveT: 99 }); const rnd0 = Math.random; Math.random = () => 0.01; const f0 = g.count('魚');
    await press('Equal', 20); Math.random = rnd0;
    ok('v0.6.7: = catches the fish in front', g.count('魚') === f0 + 1 && !g.ents.list.includes(fish), [f0, g.count('魚')]);
    const t0 = g.renderer.tile; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Equal', shiftKey: true, bubbles: true })); await sleep(20); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Equal', bubbles: true }));
    ok('v0.6.7: Shift+= (the ＋ key) still zooms in', g.renderer.tile === Math.min(56, t0 + 4), [t0, g.renderer.tile]); g.renderer.tile = t0;
    w.set(X + 1, Y, '草'); const eg = g.ents.add('鷹', X + 1, Y, { moveT: 99, tame: true, sta: 20 }); g.addItem('魚', 1); const sel0 = p.sel, fish1 = g.count('魚');
    await press('KeyQ', 20);
    ok('v0.6.7: Q feeds the eagle in front a fish (and no longer steps the bag)', Math.abs(eg.sta - 60) < 1 && g.count('魚') === fish1 - 1 && p.sel === sel0, [eg.sta, g.count('魚'), p.sel, sel0]);
    g.ents.remove(eg); g.removeItem('魚', 99);
    g.addItem('磚', 1); hold('磚'); g.action = null; g.renderer.camInit = false; await sleep(80);
    const R = g.renderer, T = R.tile, cvs = document.getElementById('world'), cx = R.w / 2 - R.camX * T + (X + 1 + 0.5) * T, cy = R.h / 2 - R.camY * T + (Y + 0.5) * T;
    cvs.dispatchEvent(new MouseEvent('mousedown', { clientX: cx, clientY: cy, button: 2, bubbles: true })); await sleep(20);
    ok('v0.6.7: either mouse button on the tile beside you acts like E (gathers), never places', w.get(X + 1, Y) === '草' && !!g.action && g.action.type === 'gather', [w.get(X + 1, Y), g.action && g.action.type]);
    g.action = null; g.removeItem('磚', 9);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) w.set(X + dx, Y + dy, w.base(X + dx, Y + dy)); }
  // ============ v0.6.10：一日多長看難度（簡單 420、一般 360、困難 300） ============
  { const W = window.World, sv = JSON.parse(JSON.stringify(w.serialize())); sv.dayLen = 300; sv.time = 300 * 5 + 300 * 0.6; sv.scarecrows = { '0,0': sv.time + 100 };
    W.setDay(420); const we = new W(w.seed), fresh = we.time; we.restore(sv, 6); const keep = we.serialize().dayLen;
    W.setDay(360); const wn = new W(w.seed); wn.restore(w.serialize(), g.day());
    ok('v0.6.10: an easy island starts at 420 × 0.26; a 300-s save read into it keeps day 6 and wakes at that early morning, countdowns kept', fresh === U.r4(420 * 0.26) && we.time === U.r4(420 * 5 + 420 * 0.26) && Math.abs(we.scarecrows.get('0,0') - (we.time + 100)) < 1e-6 && keep === 420, [fresh, we.time]);
    ok('v0.6.10: a save made now at 360 reads back with its exact time', wn.time === U.r4(w.time) && wn.timeShift === 0 && W.DAY === DAY);
    const t0 = w.time; w.time = DAY * 3 + DAY * 0.5; const mid = g.dayT(), d4 = g.day(); w.time = DAY * 3 + 300; const notYet = g.day(); w.time = t0;
    ok('v0.6.10: the clock runs on 360-s days (300 s past day four\'s midnight is still day four)', mid === 0.5 && d4 === 4 && notYet === 4, [mid, d4, notYet]);
    const r0 = U.trueRand, cb = w.onWeather, ra = w.rainUntil, rn = w.nextRainAt; w.onWeather = null; U.trueRand = () => 0; w.rainUntil = 0; w.nextRainAt = w.time; w.step(p.x, p.y); const rainLen = w.rainUntil - w.time;
    U.trueRand = r0; w.onWeather = cb; w.rainUntil = ra; w.nextRainAt = rn;
    ok('v0.6.10: things counted in days follow the longer day (the shortest rain is a quarter of 360 = 90 s)', Math.abs(rainLen - 90) <= 0.5, rainLen); }
  // ============ v0.8.10：命照難度加、神兵傷害照難度加；大魔王的時限；經卷認一隻、取錯經卷；影子六成九成、不取人命；測試格 ============
  { const E = g.ents, p0 = { x: p.x, y: p.y }, DIFF = XIEYI.DIFF, dk = g.diff, z = G.zones(g.seed).find(o => o.id === '封豨'), put = (x, y) => { p.x = p.rx = x; p.y = p.ry = y; E.px = x; E.py = y; };
    const keep = { cour: p.cour, bag: p.bag.slice(), tools: p.tools.slice(), tool: p.tool, azure: p.azure, bai: p.bai, zhu: p.zhu, pouches: p.pouches }, hog = () => E.list.find(o => o.type === '豨' && !o.shade);
    const reset = () => { p.fight = null; p.bosses = {}; p.feats = []; p.inBoss = {}; p.jing = []; p.puppet = 0; p.bossBuff = 0; p.trialTries = {}; p.trophies = {}; p.jingFor = null; p.shade9 = {}; p.jingCour = {}; p.scrolls = []; p.trial = null; p.trialLockT = 0; p.lockT = 0; p.guardT = 0; E.list = E.list.filter(o => o.type !== '豨' && o.type !== '豬' && !o.shade); };
    const enter = () => { p.sailing = true; p.ship = World.newShip('孤帆'); put(z.x + 103, z.y); g.updateStats(0.05); put(z.x + 99, z.y); g.updateStats(0.05); };
    const out = () => { put(z.x + 120, z.y); g.updateStats(0.05); };
    // 命照難度加、四捨五入到百；神兵照難度加三到五分
    const hpRow = (k) => { g.diff = DIFF[k]; const r = [900, 650, 520, 2000, 1200, 1800].map(b => g.bigHp(b)).concat([g.godDmg('九閽鳴雷')]); g.diff = dk; return r.join(','); };
    ok('v0.8.10: life by difficulty, to the nearest hundred — 蜃 900 / 鑿齒 650 / 蠱雕 520 / 封豨 2000 / 六成影 1200 / 九成影 1800, and the god weapons +3/4/5%',
      hpRow('easy') === '1000,700,600,2200,1300,2000,123.6' && hpRow('normal') === '1100,800,700,2500,1500,2300,124.8' && hpRow('hard') === '1300,900,800,2900,1700,2600,126', [hpRow('easy'), hpRow('normal'), hpRow('hard')]);
    { const a = E.add('蜃', p.x + 30, p.y + 30, { moveT: 99 }), b = E.add('齒', p.x + 31, p.y + 30, { moveT: 99 }), c = E.add('雕', p.x + 32, p.y + 30, { moveT: 99, cryT: 99, diveT: 99 });
      ok('v0.8.10: the mini-bosses come out with the scaled life (normal: 1100, 800, 700)', a.hp === 1100 && a.max === 1100 && b.hp === 800 && c.hp === 700, [a.hp, b.hp, c.hp]); for (const e of [a, b, c]) E.remove(e); }
    { const a = E.add('蜃', p.x + 3, p.y + 3, { moveT: 99 }), c = E.add('雕', p.x + 5, p.y, { moveT: 99, cryT: 99, diveT: 99 }), far = E.add('齒', p.x + 25, p.y, { moveT: 99 }); a.hp = 550; g.miniSig = null; g.miniBars();   // v0.8.21 使用者定：小魔王一隻一條命條
      const mb = [...document.querySelectorAll('#minibars .minibar')], mbw = document.getElementById('minibars').getBoundingClientRect().width, a1 = mb.find(m => /蜃/.test(m.textContent));
      ok('v0.8.21: each mini-boss within twenty tiles has its own life bar (the 鑿齒 25 away has none), two thirds as long as the big boss bar, shrinking with its life', mb.length === 2 && !!a1 && /550／1100/.test(a1.textContent) && parseFloat(a1.querySelector('i').style.width) === 50 && Math.abs(mbw - Math.min(293, (innerWidth - 32) * 2 / 3)) < 2, [mb.length, mbw, a1 && a1.textContent]);
      a.hp = 0; g.kill(a); g.miniBars(); const az = [...document.querySelectorAll('#minibars .minibar')].find(m => /蜃/.test(m.textContent));
      ok('v0.8.21: slain, its bar drops to 0 and stays five seconds', !!az && az.classList.contains('dead') && /0／1100 · 斃了/.test(az.textContent) && parseFloat(az.querySelector('i').style.width) === 0 && g.miniZero[0].until - performance.now() > 4000, az && az.textContent);
      g.miniZero = []; E.remove(c); E.remove(far); g.miniBars(); ok('v0.8.21: …and with none near, no bars', document.querySelectorAll('#minibars .minibar').length === 0); }
    // 時限：連續在外 1800 息算認輸（一般），快到時先提醒
    reset(); p.jing = ['got']; p.jingFor = '封豨'; p.cour = 1000; enter(); g.bossYes(); out();
    const f1 = p.fight; ok('v0.8.10: walking out starts the clock — the toast gives 1800 in a row, 2880 in all, and the 7200 cap', !!f1 && f1.away && f1.awayAt !== undefined && /連續 1800 息/.test(toasts()) && /累積滿 2880 息/.test(toasts()) && /最多 7200 息/.test(toasts()));
    { const sz = g.bossZone('修蛇'), c0 = p.cour, zs = JSON.stringify(p.zones || null); put(sz.x, sz.y); g.updateStats(0.05);
      ok('v0.8.20: with the 封豨 fight hanging, 洞庭 opens no second fight (it used to drop the first one) — told to finish or yield, sent back out', p.fight === f1 && f1.away && !g.bossAsk && !E.list.some(o => o.type === '修蛇') && /戰事未了/.test(toasts()) && /先回桑林打完，或認輸/.test(toasts()) && Math.hypot(p.x - sz.x, p.y - sz.y) > 120, [p.x - sz.x, p.y - sz.y]); out(); p.cour = c0; p.zones = JSON.parse(zs); }   // 第一次到洞庭的膽氣不算進後面的帳
    g.bossSig = ''; g.bossBar(); const bbA = document.getElementById('bossbar');
    ok('v0.8.10: while away the bar stays up and counts — out N／1800, total N／2880, time left', !bbA.classList.contains('hidden') && bbA.classList.contains('away') && /在外 0／1800/.test(bbA.textContent) && /累積 0／2880/.test(bbA.textContent), bbA.textContent);
    w.time += 1500; g.updateStats(0.05); ok('v0.8.10: with less than a day to go it warns once', !!p.fight && /再不回桑林/.test(toasts()));
    w.time += 301; g.updateStats(0.05);
    ok('v0.8.10: 1800 breaths away in a row — counted as giving up: courage down three tenths (v0.8.13), the fight is over', !p.fight && p.cour === 700 && /逾時判負/.test(toasts()) && /連續 1800 息沒回桑林/.test(toasts()), p.cour);
    // 累積在外 2880 息
    reset(); p.jing = ['got']; p.jingFor = '封豨'; p.cour = 1000; enter(); g.bossYes();
    for (let i = 0; i < 2; i++) { out(); w.time += 1000; g.updateStats(0.05); put(z.x + 99, z.y); g.updateStats(0.05); }
    const sum2 = p.fight && p.fight.awaySum; out(); w.time += 879; g.updateStats(0.05); const still = !!p.fight; w.time += 2; g.updateStats(0.05);
    ok('v0.8.10: away 1000 + 1000 + 880 in all (never 1800 in a row) — 2880 is reached, counted as giving up', sum2 === 2000 && still && !p.fight && p.cour === 700 && /在地界外累積滿 2880 息/.test(toasts()), [sum2, still]);
    // 整場 7200 息
    reset(); p.jing = ['got']; p.jingFor = '封豨'; p.cour = 1000; enter(); g.bossYes(); w.time += 7201; g.updateStats(0.05);
    ok('v0.8.10: 7200 breaths after 進去 with no winner — the fight is lost (as giving up) and you are put outside', !p.fight && p.cour === 700 && /打了 7200 息還沒分出勝負/.test(toasts()) && p.x === z.x + 103, p.x - z.x);
    // v0.8.13 使用者定：死了也取消這一輪沒取經的加成與指定；死在魔王手上膽氣只減四成
    reset(); p.xuan = { day: 1 }; p.cour = 1000; enter(); g.bossYes(); g.bossYes(); const lay = !!p.fight && p.fight.penal && g.buffLayers() === 1 && p.bossBuff === 0 && g.beadOf('封豨') === 'fightNo';
    p.lastHit = { kind: '力', by: '封豨', big: true, t: w.time }; p.hp = 0; g.die('傷'); const dt13 = document.getElementById('dead-text').textContent;
    ok('v0.8.13: dying with the layer on cancels it — no layer, the black question mark wiped (v0.8.21); the fight is over', lay && p.bossBuff === 0 && g.buffLayers() === 0 && g.beadOf('封豨') === '' && !p.fight && /那一層取消了/.test(dt13) && p.deathKeep === 0.6, [lay, p.bossBuff, dt13.slice(-60)]);
    g.respawn(); ok('v0.8.13: …and courage loses four tenths (1000 → 600)', p.cour === 600, p.cour); p.sailing = false; p.ship = null;
    // 拿錯經卷（v0.8.21 使用者定：照樣加一層；紅色「確認」按兩次；認輸了那一卷還在。v0.8.22 使用者定：斃得了，斃了的那顆打黑叉，手上那一卷的紅圈不變）
    reset(); p.xuan = { day: 1 }; p.jingFor = '修蛇'; p.cour = 1000; enter();
    const wt = document.getElementById('bossask-title').textContent, wa = document.getElementById('bossask-text').textContent, yb = document.getElementById('bossask-yes');
    ok('v0.8.22: carrying another boss\'s scroll into 桑林 — 此卷非彼卷, which scroll you hold, +20%; slain it is a black cross and the scroll stays; a red 確認, two presses', /此卷非彼卷/.test(wt) && /你手上是修蛇卷/.test(wa) && !/打不死/.test(wa) && /打上黑叉；手上的修蛇卷還在/.test(wa) && /紅色的「確認」/.test(wa) && yb.textContent === '確認' && yb.classList.contains('red'), wa.slice(-160));
    g.bossYes(); const arm1 = !p.fight && yb.textContent === '再按一次確認'; g.bossYes();
    ok('v0.8.21: …two presses go in; the fight carries a layer (2500 → 3000), the 封豨 bead is a black question mark, the 修蛇 bead a red ring', arm1 && !!p.fight && p.fight.wrong && p.fight.penal && g.buffLayers() === 1 && hog().max === 3000 && g.beadOf('封豨') === 'fightNo' && g.beadOf('修蛇') === 'held' && p.jingFor === '修蛇', [arm1, g.buffLayers(), hog() && hog().max]);
    g.bossSig = ''; g.bossBar(); ok('v0.8.22: the life bar no longer says it will not die', !document.getElementById('bossbar').classList.contains('wrong') && !/打不死/.test(document.getElementById('bossbar').textContent));
    g.fleeButton(); g.fleeButton(); g.bossBar(); ok('v0.8.21: giving up takes the layer back; the 修蛇卷 is still held (red ring), the 封豨 bead grey again', !p.fight && g.buffLayers() === 0 && p.bossBuff === 0 && g.beadOf('封豨') === '' && g.beadOf('修蛇') === 'held' && p.jingFor === '修蛇');
    reset(); p.xuan = { day: 1 }; p.jingFor = '修蛇'; p.scrolls = [{ id: '修蛇', slot: 2, day: 1, k: 0.9 }]; p.cour = 1000; enter(); g.bossYes(); g.bossYes();
    { const hw = hog(); hw.hp = 0; g.kill(hw);
      ok('v0.8.22: with the wrong scroll 封豨 can be slain — its bead a black cross, the layer kept for the rest, the 修蛇卷 still held (red ring, not dust)', !E.list.includes(hw) && !!p.bosses['封豨'] && p.bosses['封豨'].jing === false && g.beadOf('封豨') === 'miss' && g.beadOf('修蛇') === 'held' && p.jingFor === '修蛇' && !p.scrolls[0].dust && p.bossBuff === 1 && !p.fight && /手上的修蛇卷還在/.test(toasts()), [g.beadOf('封豨'), p.bossBuff]); }
    // 影子：九成的；打不死人——命留一點、鎖命十五息、試煉沒過；鎖命時走進別的地界就不算了
    reset(); p.sailing = false; p.ship = null; p.xuan = { day: 1 }; const xz = G.zones(g.seed).find(o => o.id === '玄武'); put(xz.x + 3, xz.y);
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 16; dx++) if (G.DB[w.get(xz.x + dx, xz.y + dy)].walk <= 0) w.set(xz.x + dx, xz.y + dy, '草');
    g.startTrial('封豨', 0.9); const s9 = E.list.find(o => o.shade === '豨影');
    ok('v0.8.10: the 九成 shade has 2300 life on normal and hits at nine tenths', !!s9 && s9.hp === 2300 && s9.k === 0.9 && p.trial.k === 0.9, s9 && s9.hp);
    const c0 = p.cour, d0 = p.deaths; p.hp = 5; g.bossHit(s9, 40, '力', '撞');
    ok('v0.8.10: a shade never kills — at one life 玄武 takes the shade back, locks your life 15 breaths, the trial is failed: 不要氣餒，再接再厲', p.hp === 1 && !p.trial && !E.list.some(o => o.shade) && p.trialLockT === 15 && /不要氣餒，再接再厲/.test(toasts()) && !p.dead && p.deaths === d0 && p.cour === c0, [p.hp, p.trialLockT]);
    ok('v0.8.10: while locked nothing takes your life, and you cannot die', g.hurt(50, '力', { name: '虎' }) === 0 && (p.hp = 0, g.die('傷'), !p.dead && p.hp === 1));
    const tz = G.zones(g.seed).find(o => o.id === '白虎'); put(tz.x, tz.y); g.trialTick(0.01);
    ok('v0.8.10: stepping into another ground ends the lock', p.trialLockT === 0 && /不算了/.test(g.msgText), g.msgText); put(xz.x + 3, xz.y); p.hp = 100;
    g.startTrial('封豨', 0.9); g.kill(E.list.find(o => o.shade === '豨影'));
    g.bossSig = ''; g.bossBar(); { const bz = document.getElementById('bossbar'); ok('v0.8.20: a slain shade drops to 0 too, in the shade style', !bz.classList.contains('hidden') && bz.classList.contains('shade') && /豨影/.test(bz.textContent) && /^豨影0／/.test(bz.textContent), bz.textContent); g.bossZero.until = 0; g.bossBar(); ok('v0.8.20: …and goes', bz.classList.contains('hidden')); }
    ok('v0.8.10: slay the 九成 shade — the 封豨卷 is yours with no reminder', p.jingFor === '封豨' && p.shade9['封豨'] === true && p.scrolls.length === 1 && p.scrolls[0].k === 0.9, p.shade9);
    // v0.8.22 使用者定：有黑叉，影子每叉加兩成五；六成的隨你打，九成的一卷最多三回
    { p.bosses = { '修蛇': { diff: 'normal', solo: true, day: 1, jing: false } }; p.trialTries = {}; p.hp = 100; p.jingFor = null;
      g.jingTalk(); const jx = document.getElementById('talk-text').textContent, jl = [...document.querySelectorAll('#talk-row button')].map(b => b.textContent).join('|'); g.talkPick('last');
      ok('v0.8.22: with a black cross 玄武 says shades are +25% a cross; 六成 as often as you like, 九成 ten tries a boss scroll (v0.8.24; 共工 three)', /1 個黑叉/.test(jx) && /\+25%/.test(jx) && /六成的隨你打/.test(jx) && /最多試 10 回/.test(jx) && /只有 3 回/.test(jx) && /九成還剩 10 回/.test(jl), jx.slice(0, 200));
      g.pickShade('封豨'); const ps = [...document.querySelectorAll('#talk-row button')].map(b => b.textContent); g.talkPick('last');
      ok('v0.8.22: …and offers both, the 九成 with its tries left', ps.length === 3 && /六成/.test(ps[0]) && /九成.*還剩 10 回/.test(ps[1]), ps);
      g.startTrial('封豨', 0.6); const s6 = E.list.find(o => o.shade === '豨影');
      ok('v0.8.22: a 六成 shade with one cross: 2000 × 0.6 × 1.25 on normal → 1900, no try used', !!s6 && s6.k === 0.6 && s6.tk === 1.25 && s6.max === 1900 && !p.trialTries['封豨'], s6 && [s6.k, s6.tk, s6.max]);
      g.endTrial(); g.startTrial('封豨', 0.9); const sx = E.list.find(o => o.shade === '豨影');
      ok('v0.8.22: the 九成 shade: 2000 × 0.9 × 1.25 → 2800, one try used', !!sx && sx.k === 0.9 && sx.tk === 1.25 && sx.max === 2800 && p.trialTries['封豨'] === 1, sx && [sx.k, sx.tk, sx.max]);
      const dx = g.bossHit(sx, 20, '力', '撞'); ok('v0.8.22: …and hits at 0.9 × 1.25 (20 → 22.5, then armour)', Math.abs(dx - U.r4(22.5 * g.takenMult())) < 1e-6, dx); p.hp = 100;
      for (let i = 0; i < 9; i++) { g.endTrial(); g.startTrial('封豨', 0.9); } g.endTrial(); const n3 = p.trialTries['封豨']; g.startTrial('封豨', 0.9); const no9 = !p.trial && /試了 10 回，不給了/.test(g.msgText);
      g.pickShade('封豨'); const off9 = document.querySelectorAll('#talk-row button')[1].disabled; g.talkPick('last');
      g.startTrial('封豨', 0.6); const yes6 = !!p.trial && p.trial.k === 0.6;
      ok('v0.8.24: ten 九成 tries a boss scroll with a cross — the eleventh is refused (greyed in the dialog); the 六成 is still given; 共工\'s trial would have three', n3 === 10 && no9 && off9 && yes6 && g.trialCap('共工') === 3 && g.trialCap('修蛇') === 10, [n3, no9, off9, yes6]);
      g.endTrial(); p.bosses = {}; p.trialTries = {}; }
    // v0.8.22 使用者定：經卷一隻只取一次、一次只拿一卷；拿著這卷、拿著別卷、斃過的，影子都只是練手（不給經、不給膽氣）
    { p.bosses = {}; p.trialTries = {}; p.jingFor = '修蛇'; p.scrolls = [{ id: '修蛇', slot: 2, day: 1, k: 0.9 }]; p.jingCour = {}; p.shade9 = {}; p.hp = 100; const c0 = p.cour;
      g.jingTalk(); const jx = document.getElementById('talk-text').textContent, jl = [...document.querySelectorAll('#talk-row button')].map(b => b.textContent).join('|'); g.talkPick('last');
      ok('v0.8.22: holding the 修蛇卷, 玄武 says one scroll at a time; 封豨卷 can be swapped for or practised (v0.8.23)', /一次只拿一卷/.test(jx) && /要取別卷就得換/.test(jx) && /封豨卷（[^|]*　換或練手/.test(jl) && /修蛇卷（[^|]*拿著了，練手/.test(jl), jl);
      g.pickShade('封豨'); const pt = document.getElementById('talk-text').textContent, pb = [...document.querySelectorAll('#talk-row button')].map(b => b.textContent);
      ok('v0.8.23: 玄武 asks first whether to swap — the 修蛇卷 would be gone for good; 不換 comes first so Enter cannot swap by accident', /你手上還有修蛇卷/.test(pt) && /再也取不回來/.test(pt) && /不換，只練手/.test(pb[0]) && /換：斃了豨影就換成封豨卷/.test(pb[1]), pb);
      g.talkPick('first'); const pt2 = document.getElementById('talk-text').textContent; g.talkPick('last');
      g.startTrial('封豨', 0.9); const pr = p.trial && p.trial.give === false && /練手/.test(toasts()); g.kill(E.list.find(o => o.shade === '豨影'));
      ok('v0.8.22: a practice shade slain gives no scroll and no courage — still the 修蛇卷, one scroll on record; the 九成 is noted', /只是練手/.test(pt2) && pr && p.jingFor === '修蛇' && p.scrolls.length === 1 && p.cour === c0 && p.shade9['封豨'] === true && /練手一回/.test(toasts()), [pr, p.jingFor, p.cour - c0]);
      g.bossSig = ''; g.bossBar(); ok('v0.8.22: …its bar drops to 0 marked practice', /練手/.test(document.getElementById('bossbar').textContent), document.getElementById('bossbar').textContent); g.bossZero.until = 0; g.bossBar();
      p.jingFor = null; p.bosses = { '封豨': { diff: 'normal', solo: true, day: 1, jing: true } }; g.startTrial('封豨', 0.6); const gv = p.trial && p.trial.give; g.endTrial();
      ok('v0.8.22: 封豨 already slain — its shade is practice too', gv === false);
      // v0.8.23 換卷：說好了換，斃了影子就換成這一卷，手上那一卷散了、再也取不回來
      p.bosses = {}; p.jingFor = '修蛇'; p.scrolls = [{ id: '修蛇', slot: 2, day: 1, k: 0.9 }]; p.jingCour = {}; const c1 = p.cour;
      g.pickShade('封豨'); g.talkPick(1); const tier = document.getElementById('talk-text').textContent; g.talkPick('last'); g.startTrial('封豨', 0.6, true); const sw = p.trial && p.trial.give && p.trial.swap; g.kill(E.list.find(o => o.shade === '豨影'));
      ok('v0.8.23: …choosing to swap, the slain shade gives the 封豨卷; the 修蛇卷 is gone (recorded as lost), courage as usual', /手上的修蛇卷就散了/.test(tier) && sw && p.jingFor === '封豨' && p.scrolls.find(x => x.id === '修蛇').lost > 0 && p.cour > c1 && /修蛇卷散了，再也取不回來/.test(toasts()), [sw, p.jingFor, p.scrolls]);
      ok('v0.8.23: …the lost 修蛇卷 cannot be taken again — its shade is practice, and 玄武 marks it 取過了', g.jingTaken('修蛇') && !g.jingGives('修蛇', true) && !g.canSwap('修蛇') && (g.jingTalk(), /修蛇卷（[^|]*取過了，練手/.test([...document.querySelectorAll('#talk-row button')].map(b => b.textContent).join('|'))));
      g.talkPick('last');
      p.bosses = {}; p.jingFor = '封豨'; p.scrolls = [{ id: '封豨', slot: 0, day: 1, k: 0.9 }]; p.shade9 = { '封豨': true }; }   // 回到上面斃了九成豨影的樣子，下面存讀檔接著用
    // 存讀檔：經卷認哪一隻、斃過九成的、掛著的戰事帶時限
    p.fight = { id: '封豨', solo: true, at: U.r4(w.time - 100), away: true, awayAt: U.r4(w.time - 50), awaySum: 30, clock: 1 }; g.save(); const sv = JSON.parse(localStorage.getItem(XIEYI.Game.slotKey(g.slot))); p.jingFor = null; p.shade9 = {}; p.fight = null; g.load(sv);
    const tm = g.bossTimes(p.fight);
    ok('v0.8.10: the scroll\'s boss, the 九成 mark and the fight clock are saved and read back', p.jingFor === '封豨' && p.shade9['封豨'] && Math.abs(tm.sum - 80) < 0.1 && Math.abs(tm.all - 100) < 0.1, [tm.sum, tm.all]);
    // v0.8.9 的存檔：取過的經不認哪一隻（那時只有封豨卷）、掛著的戰事沒記在外的時刻
    const old = JSON.parse(JSON.stringify(sv)); delete old.player.jingFor; old.player.jing = ['got']; old.player.fight = { id: '封豨', solo: true, at: 0, away: true }; g.load(old);
    ok('v0.8.10: an older save — its scroll is read as 封豨卷, and a fight left hanging starts counting from now', p.jingFor === '封豨' && p.fight.awayAt === U.r4(w.time), p.jingFor);
    { const t9 = g.bossTimes(p.fight), lost = g.bossClock(p.fight);
      ok('v0.8.15 自查: a v0.8.9 fight (pressed 進去 at time 0, long ago) gets its one-fight clock from the load too — not judged lost on loading', p.fight && p.fight.clock === 1 && p.fight.at === U.r4(w.time) && t9.all === 0 && !lost, [t9.all, lost]); }
    reset();
    // 測試格（這裡把這一局暫時當成測試格；第六到八格開出來的在起始頁那段測）
    { const kb = p.bag, kt = p.tools, ktool = p.tool, kk = p.testKit; p.bag = []; p.tools = []; p.tool = -1; p.testKit = false; g.test = true; g.testKit();
      ok('v0.8.10 測試格: the pouches are full (32 + v0.8.14 的 30 = 62 in the bag, 14 tools), the god weapons are given (v0.8.25: all three), courage is ∞', g.slots() === 62 && g.toolSlots() === 14 && p.tools.some(s => s.n === '九閽鳴雷') && p.tools.some(s => s.n === '燭龍焚溟') && p.tools.some(s => s.n === '彤弓素矰') && p.testKit === 2 && g.level() === 99 && !!document.getElementById('testtag'));
      g.addItem('木', 3); g.addItem('木', 2); const wd = p.bag.filter(s => s.n === '木'); g.removeItem('木', 5);
      ok('v0.8.10 測試格: what you gather is ∞ (one stack) and using it takes none', g.count('木') === Infinity && wd.length === 1 && wd[0].inf && g.canAdd('木', 999));
      g.barSig = ''; g.buildBag(); ok('v0.8.10 測試格: the bag shows ∞', /∞/.test(document.getElementById('bagbar').textContent));
      const ck = U.key(p.x + 40, p.y + 40); w.chests.set(ck, []); g.chestAt = ck; g.moveStack('bag', p.bag.findIndex(s => s.n === '木')); const box = w.chests.get(ck);
      g.moveStack('chest', 0); ok('v0.8.10 測試格: in a chest it is still ∞, and comes back ∞', box.length === 0 && g.count('木') === Infinity); g.chestAt = null; w.chests.delete(ck);
      p.hp = p.hpMax; const dz = g.hurt(30, '力', { name: '虎' }); p.hp = 0; g.die('傷');
      ok('v0.8.10 測試格: a blow shows its number but takes no life; you cannot die', dz > 0 && !p.dead && p.hp === p.hpMax);
      p.food = 1; p.san = 3; g.updateStats(0.05); ok('v0.8.10 測試格: 飽暖力愜 stay full', p.food === 100 && p.warm === 100 && p.san === 100 && p.sta === p.staMax);
      const gt = p.tools.find(s => s.n === '九閽鳴雷'); p.tool = p.tools.indexOf(gt); const gd0 = gt.dur; g.wearTool(); g.addCourage(50);
      ok('v0.8.10 測試格: god weapons do not wear, courage stays ∞, the 鼎 never fails', gt.dur === gd0 && g.level() === 99 && g.pillChance('蟾蜍肉') === 1);
      g.save(); const ts = XIEYI.Game.readSave(g.slot); ok('v0.8.10 測試格: the save card says 膽氣第 ∞ 重', ts.test === true && XIEYI.Game.summary(ts).level === '∞');
      g.test = false; const tag = document.getElementById('testtag'); if (tag) tag.remove(); p.bag = kb; p.tools = kt; p.tool = ktool; p.testKit = kk; g.save(); }
    g.diff = dk; p.cour = keep.cour; p.bag = keep.bag; p.tools = keep.tools; p.tool = keep.tool; p.azure = keep.azure; p.bai = keep.bai; p.zhu = keep.zhu; p.pouches = keep.pouches; p.hp = 100; p.sailing = false; p.ship = null; p.xuan = undefined;
    p.creatures = p.creatures.filter(c => c !== '豨'); if (p.codex) delete p.codex['封豨']; reset(); g.barSig = ''; g.courSig = ''; g.bossSig = ''; put(p0.x, p0.y); }
  // ============ v0.8.9：沒取經闖地界的加成、指定先斃哪一隻、認輸；同屬性護駕；台擋不住封豨；戰利品；惜字亭換鎢鋼；碑的路、綠洲溫泉 ============
  { const E = g.ents, p0 = { x: p.x, y: p.y }, z = G.zones(g.seed).find(o => o.id === '封豨'), put = (x, y) => { p.x = p.rx = x; p.y = p.ry = y; E.px = x; E.py = y; };
    const keep = { cour: p.cour, bag: p.bag.slice(), tools: p.tools.slice(), tool: p.tool, azure: p.azure, bai: p.bai, zhu: p.zhu }, hog = () => E.list.find(o => o.type === '豨' && !o.shade);
    const reset = () => { p.fight = null; p.bosses = {}; p.feats = []; p.inBoss = {}; p.jing = []; p.puppet = 0; p.bossBuff = 0; p.trialTries = {}; p.trophies = {}; p.jingFor = null; p.shade9 = {}; p.trialLockT = 0; p.lockT = 0; p.guardT = 0; E.list = E.list.filter(o => o.type !== '豨' && o.type !== '豬'); };
    const enter = () => { p.sailing = true; p.ship = World.newShip('孤帆'); put(z.x + 103, z.y); g.updateStats(0.05); put(z.x + 99, z.y); g.updateStats(0.05); };
    reset(); p.xuan = { day: 1 }; enter(); const t1 = document.getElementById('bossask-title').textContent, a1 = document.getElementById('bossask-text').textContent;
    const yb0 = document.getElementById('bossask-yes');
    ok('v0.8.21: without the scroll the window asks 此去無經，當真要闖？ — +20% on it and every boss left, kept for good if slain, death or 認輸 takes it back; a black 確認, two presses', /當真要闖/.test(t1) && /加兩成/.test(a1) && /永久留著/.test(a1) && /這一層取消/.test(a1) && /黑色的「確認」/.test(a1) && yb0.textContent === '確認' && !yb0.classList.contains('red'), t1);
    g.bossYes(); const armedOnly = !p.fight && !hidden('bossask') && /再按一次確認/.test(yb0.textContent);
    ok('v0.8.10: without the scroll, the first 確認 only arms it — it takes two presses', armedOnly);
    g.bossYes(); const h = hog();
    ok('v0.8.21: going in without the scroll: +20% on this fight, base-additive (2000 × 1.25 = 2500 on normal → 3000); the layer rides on the fight until it is won; no boss to slay first', !!p.fight && p.fight.penal && !p.fight.wrong && p.bossBuff === 0 && g.buffLayers() === 1 && h && h.max === 3000 && h.hp === 3000, [g.buffLayers(), h && h.max]);
    g.courSig = ''; await sleep(150); ok('v0.8.21: …the first bead (封豨) is a black question mark', document.querySelectorAll('#jingbeads i')[0].className === 'fightNo', document.querySelectorAll('#jingbeads i')[0].className);
    p.sailing = false; p.ship = null; put(h.x + 2, h.y); w.set(p.x, p.y, '草'); p.hp = 100; p.bai = false; p.azure = false; p.zhu = false;
    const d1 = g.bossHit(h, 20, '力', '撞'); ok('v0.8.21: its blows carry the +20% too (20 → 24, then armour)', Math.abs(d1 - U.r4(24 * g.takenMult())) < 1e-6, d1);
    p.hp = 100; w.set(p.x, p.y, '台'); h.state = 'charge'; h.cdx = 1; h.cdy = 0; h.chargeHit = false; h.x = p.x - 3; h.y = p.y; h.moveT = 0; for (let i = 0; i < 4 && h.state === 'charge'; i++) { h.moveT = 0; E.hogAct(h, g, p, false, false); }
    ok('v0.8.9: a 台 does not stop the charge — no stun, you take it', p.hp < 100 && !(h.stunT > 0), [100 - p.hp]); w.set(p.x, p.y, '草'); p.hp = 100;
    // 走出去再進來：加成不再加；戰事掛著時玄武不給取經（v0.8.21）
    p.sailing = true; p.ship = World.newShip('孤帆'); put(z.x + 120, z.y); g.updateStats(0.05); g.jingTalk(); const jt = document.getElementById('talk-text').textContent; g.talkPick('last');
    ok('v0.8.21: while a fight hangs, 玄武 will not hand out a scroll', /還沒了結/.test(jt) && /認輸/.test(jt), jt);
    put(z.x + 99, z.y); g.updateStats(0.05); ok('v0.8.9: going back in the same fight adds no second layer', g.buffLayers() === 1 && hog() && hog().max === 3000);
    // 認輸：膽氣減三成、神兵耐久掉當下的兩成（v0.8.13）；這一輪的加成取消、問號抹掉；送回地界外
    g.bossZero = null; g.bossSig = null; g.bossBar(); const bbShown = !document.getElementById('bossbar').classList.contains('hidden');
    p.cour = 1000; p.tools = [{ n: '九閽鳴雷', c: 1, dur: 100 }]; p.tool = 0; g.fleeButton(); g.fleeButton();
    g.bossBar(); ok('v0.8.20: after 認輸 the life bar goes away (since v0.8.7 it stayed up after a fight ended without a kill)', bbShown && document.getElementById('bossbar').classList.contains('hidden'));
    ok('v0.8.9: 認輸 — courage down three tenths, a god weapon loses a fifth of its present durability (100 → 80; v0.8.13, it used to be a fifth of the full 199), the layer and the question mark are gone, back outside the ground (v0.8.16: to the last tile outside, where you came back in)', p.cour === 700 && Math.abs(p.tools[0].dur - 80) < 1e-6 && p.bossBuff === 0 && g.buffLayers() === 0 && g.beadOf('封豨') === '' && !p.fight && p.x === z.x + 120, [p.cour, p.tools[0].dur, p.bossBuff, p.x - z.x]);
    // 取了經再進去：不加；斃之得豨牙，給玄武看
    p.jingFor = '封豨'; p.inBoss = {}; put(z.x + 99, z.y); g.updateStats(0.05); const a3 = document.getElementById('bossask-text').textContent; g.bossYes();
    ok('v0.8.9: with the scroll taken there is no question and no layer (one press); the bead is a red question mark (v0.8.21)', !/當真要闖/.test(a3) && g.buffLayers() === 0 && hog().max === 2500 && g.beadOf('封豨') === 'fightJing');
    g.kill(hog()); ok('v0.8.21: slaying 封豨 with its scroll — a 豨牙 (no bag slot) for 玄武, the bead a solid vermilion dot, the 虎魄 third of the soul ring lights', p.trophies['封豨'] && p.trophies['封豨'].n === '豨牙' && !g.has('豨牙') && g.beadOf('封豨') === 'won' && p.bosses['封豨'].jing === true && /豨牙/.test(toasts()) && /虎魄亮了起來/.test(toasts()), p.trophies);
    { g.courSig = ''; await sleep(100); const rg = document.getElementById('soulring'), ft = p.feats[p.feats.length - 1].text;
      ok('v0.8.21: …the ring shows it in full colour, and the feat records the difficulty and that it was solo, with no layer', rg.classList.contains('b') && !rg.classList.contains('b1') && /禽封豨於桑林 · 一般 · 獨力$/.test(ft), [rg.className, ft]); }
    g.bossSig = ''; g.bossBar(); { const bz = document.getElementById('bossbar'); ok('v0.8.20: slain — the life bar drops to 0 and stays five seconds (v0.8.21)', !bz.classList.contains('hidden') && /^封豨/.test(bz.textContent) && /0／2500/.test(bz.textContent) && /斃了/.test(bz.textContent) && document.getElementById('bossbar-fill').style.width === '0%' && g.bossZero.until - performance.now() > 4000, bz.textContent);
      g.bossZero.until = 0; g.bossBar(); ok('v0.8.20: …then it goes', bz.classList.contains('hidden')); }
    g.jingTalk(); const jt2 = document.getElementById('talk-text').textContent; g.talkPick('last');
    ok('v0.8.9: 玄武 looks at the 豨牙 the next time you come', /豨牙/.test(jt2) && p.trophies['封豨'].shown, jt2.slice(0, 60));
    // 沒拿經斃了（v0.8.21 使用者定）：照樣得戰利品與魂環；珠打黑叉、這一層永久留著、玄武偶多一重、成就寫明加成
    reset(); enter(); g.bossYes(); g.bossYes(); g.kill(hog());
    ok('v0.8.21: slain without the scroll — 豨牙 and 虎魄 all the same; the bead a black cross; the layer stays for good (+20%); the 玄武偶 grows; the feat writes +20% and 無經', !!p.bosses['封豨'] && p.bosses['封豨'].jing === false && g.beadOf('封豨') === 'miss' && p.bossBuff === 1 && g.buffLayers() === 1 && !p.fight && p.puppet === 1 && /\+20%/.test(p.feats[0].text) && /無經/.test(p.feats[0].text) && !!p.trophies['封豨'] && /黑叉/.test(toasts()), p.feats[0] && p.feats[0].text);
    p.fight = { id: '修蛇', penal: true }; const k2 = g.buffK(); p.fight = null;
    ok('v0.8.21: layers add on the base, not multiply — one cross plus a fight without the scroll is ×1.4, not ×1.44', g.buffK() === 1.2 && Math.abs(k2 - 1.4) < 1e-9, k2);
    // 護駕：只有同一屬性的（封豨是白虎）
    reset(); p.jingFor = '封豨'; enter(); g.bossYes(); const h4 = hog(); p.sailing = false; p.ship = null; put(h4.x + 2, h4.y); p.azure = true; p.zhu = true; p.bai = false; g.diff = XIEYI.DIFF.normal; p.hp = 5; g.bossHit(h4, 40, '力', '豕突'); g.bossTick(1.6);
    ok('v0.8.9: only the guardian of the same quarter comes — 青龍 and 朱雀 do not guard against 封豨', !(p.guardT > 0) && !p.fight.guarded && /白虎沒來/.test(g.msgText), g.msgText);
    p.hp = 100; reset();
    // 存讀檔
    p.bossBuff = 2; p.trialTries = { '修蛇': 2 }; p.trophies = { '封豨': { n: '豨牙', day: 3 } }; g.save(); const sv = JSON.parse(localStorage.getItem(XIEYI.Game.slotKey(g.slot))); p.bossBuff = 0; p.trialTries = {}; p.trophies = {}; g.load(sv);
    ok('v0.8.21: the layers, the trial tries and the trophies are saved and read back', p.bossBuff === 2 && p.trialTries['修蛇'] === 2 && p.trophies['封豨'].n === '豨牙' && !('roundPenal' in sv.player) && !('bound' in sv.player));
    { const ov = JSON.parse(JSON.stringify(sv)); Object.assign(ov.player, { bossBuff: 2, roundPenal: true, bound: '封豨', jing: ['miss'], jingFor: null, bosses: { '修蛇': { diff: 'normal', solo: true, day: 3, buff: 1 } }, fight: { id: '封豨', solo: true, at: U.r4(w.time), away: true, awayAt: U.r4(w.time), clock: 1 } }); delete ov.player.trialTries; g.load(ov);
      ok('v0.8.21: an older save — beads become per boss (修蛇 slain without its scroll → black cross), the layer of the fight in hand moves onto the fight, no boss to slay first', p.bosses['修蛇'].jing === false && g.beadOf('修蛇') === 'miss' && p.bossBuff === 1 && p.fight.penal && g.buffLayers() === 2 && p.bound === undefined && p.roundPenal === undefined && g.beadOf('封豨') === 'fightNo' && Object.keys(p.trialTries).length === 0, [p.bossBuff, g.buffLayers()]); }
    reset();
    // 惜字亭：九塊殘體換兩塊鎢鋼（先燒求教過那隻的殘體）
    { const pv = { x: p0.x + 3, y: p0.y }, t0 = w.get(pv.x, pv.y); w.set(pv.x, pv.y, '亭'); put(pv.x - 1, pv.y); p.fx = 1; p.fy = 0; p.xuan = { day: 1 }; p.wish = { day: 2 };
      g.removeItem('蜃殘體', 99); g.removeItem('鑿齒殘體', 99); g.removeItem('蠱雕殘體', 99); g.removeItem('鎢鋼', 99); g.addItem('蜃殘體', 5); g.addItem('鑿齒殘體', 6); p.azure = true; p.bai = false;
      g.pressGather(); const offOk = !document.querySelector('#talk-row button').disabled; g.talkPick(0); const bt = document.getElementById('talk-text').textContent; g.talkPick(0);
      ok('v0.8.9: at the 惜字亭, nine 殘體 of any kind burn into two 鎢鋼 — the kind whose guardian you already met burns first, and it asks with the counts', offOk && /蜃殘體 5 塊/.test(bt) && /鑿齒殘體 4 塊（燒完剩 2）/.test(bt) && g.count('鎢鋼') === 2 && g.count('蜃殘體') === 0 && g.count('鑿齒殘體') === 2, bt);
      g.pressGather(); const dis = document.querySelector('#talk-row button').disabled; g.talkPick('last');
      ok('v0.8.9: with fewer than nine left, the burning cannot be chosen', dis);
      g.removeItem('鎢鋼', 99); g.removeItem('鑿齒殘體', 99); w.set(pv.x, pv.y, t0); p.wish = undefined; p.xuan = undefined; }
    // ============ v0.8.16 修蛇：洞庭的大魔王——只在水裡，頭與一串尾；潛蹤、長蛇纏舟、吞象、毒涎；方舟命上限三分之二；一場最多三艘船 ============
    { reset(); E.list = E.list.filter(o => o.type !== '修蛇'); const DB = G.DB, SN = window.Entities.SNAKE, dz = G.zones(g.seed).find(o => o.id === '修蛇'), dk = g.diff, DIFF = XIEYI.DIFF;
      const hpOf = (k) => { g.diff = DIFF[k]; const v = g.bigHp(DB['修蛇'].hp); g.diff = dk; return v; };
      ok('v0.8.16: 修蛇 has 2400 at base — 2700 / 3000 / 3500 by difficulty', DB['修蛇'].hp === 2400 && hpOf('easy') === 2700 && hpOf('normal') === 3000 && hpOf('hard') === 3500, [hpOf('easy'), hpOf('normal'), hpOf('hard')]);
      const seat = g.nearestTile(dz.x + 14, dz.y, (x, y) => [-2, -1, 0, 1, 2].every(d => w.get(x - 1 + d, y) === '湖' && w.get(x - 1 + d, y - 1) === '湖' && w.get(x - 1 + d, y + 1) === '湖'), 12);
      p.jing = ['got']; p.jingFor = '修蛇'; p.azure = false; p.bai = false; p.zhu = false; p.hp = 100;
      p.sailing = true; p.ship = World.newShip('方舟'); put(dz.x + 125, dz.y); g.updateStats(0.05); put(seat[0], seat[1]); g.updateStats(0.05);
      const ask = document.getElementById('bossask-text').textContent;
      ok('v0.8.16: sailing into 洞庭 (120 around the lake) asks first; it says the 修蛇 is only in water, the 方舟 cap, three ships, the tail', g.bossAsk === '修蛇' && /只在水裡/.test(ask) && /三分之二/.test(ask) && /3 艘船/.test(ask) && /打尾只吃四分之三/.test(ask), ask.slice(0, 80));
      g.bossYes(); const sk = g.bossEnt();
      ok('v0.8.16: with the 修蛇卷 one press goes in; the 修蛇 rises in the lake (3000 on normal)', !!p.fight && p.fight.id === '修蛇' && !!sk && sk.type === '修蛇' && sk.max === 3000 && DB[w.get(sk.x, sk.y)].kind === 'water' && /湖面一下子靜了/.test(toasts()), sk && [sk.max, w.get(sk.x, sk.y)]);
      ok('v0.8.16: the 方舟 you sailed in on is the first of three ships', p.fight.ships === 1 && p.ship.fid === p.fight.no, p.fight.ships);
      g.updateStats(0.05);
      ok('v0.8.16: inside the ground a 方舟 is capped at two thirds (420 → 280); a 孤帆 is not', g.shipMax(p.ship) === 280 && p.ship.hp === 280 && /方舟進了洞庭/.test(toasts()) && g.shipMax({ kind: '孤帆' }) === 120, [g.shipMax(p.ship), p.ship.hp]);
      p.ship = World.newShip('孤帆'); p.ship.fid = p.fight.no;
      const near = () => { const sc = g.shipCells(), lx = Math.min(...sc.map(c => c[0])) - 1; sk.x = sk.rx = lx; sk.y = sk.ry = p.y; sk.tail = [1, 2, 3, 4, 5, 6].map(i => [lx - i, p.y]); sk.under = false; sk.bubble = null; sk.state = 'swim'; sk.diveCD = sk.coilCD = sk.gapeCD = sk.spitCD = 99; sk.atk = 0; sk.moveT = 0; sk.spit = null; };
      near(); p.hp = 100; E.snakeAct(sk, g, p, false);
      ok('v0.8.16: right beside the ship it bites the one aboard (力 18, then armour)', Math.abs(100 - p.hp - U.r4(18 * g.takenMult())) < 1e-6, 100 - p.hp);
      near(); sk.coilCD = 0; E.snakeAct(sk, g, p, false); const s0 = p.ship.hp, moved = g.shipStep(1, 0) || g.shipStep(0, -1);
      ok('v0.8.16: 長蛇纏舟 — beside the ship it coils, and the ship cannot move', sk.state === 'coil' && !moved && /纏住了船/.test(toasts()), sk.state);
      E.snakeTimers(sk, g, p, 1);
      ok('v0.8.16: …each breath of the coil takes 8 off the ship (× difficulty)', Math.abs(s0 - p.ship.hp - U.r4(8 * g.diff.taken)) < 1e-6, s0 - p.ship.hp);
      const kt = p.tools, ktool = p.tool; p.tools = [{ n: '石劍', c: 1, dur: 60 }]; p.tool = 0; face(-1, 0); const base = U.r4(g.heldDmg() * g.dmgMult());
      let h0 = sk.hp; p.atkT = 0; g.attack(sk);
      ok('v0.8.16: while it coils its head is out — a blow on the head takes 1.5×', Math.abs(h0 - sk.hp - U.r4(base * 1.5)) < 1e-6, [h0 - sk.hp, base]);
      E.snakeTimers(sk, g, p, 4); ok('v0.8.16: after four breaths it lets go', sk.state === 'swim' && sk.coilCD > 0);
      sk.tail[0] = [p.x - 1, p.y]; sk.x = sk.rx = p.x - 2; h0 = sk.hp; p.atkT = 0; g.attack(sk);
      ok('v0.8.16: a blow on the tail takes three quarters', Math.abs(h0 - sk.hp - U.r4(base * 0.75)) < 1e-6, [h0 - sk.hp, base]);
      sk.hp = sk.max * 0.5; h0 = sk.hp; p.atkT = 0; g.attack(sk);
      ok('v0.8.16: at half life or less, the tail takes only a quarter', Math.abs(h0 - sk.hp - U.r4(base * 0.25)) < 1e-6, [h0 - sk.hp, base]);
      sk.hp = sk.max; p.tools = kt; p.tool = ktool;
      // 潛蹤：沉下去打不到；冒泡；浮上來撞船
      near(); sk.diveCD = 0; E.snakeAct(sk, g, p, false);
      ok('v0.8.16: 潛蹤 — it sinks out of reach: nothing to hit where it was', sk.under && !E.at(sk.x, sk.y) && E.rectDist(sk, p.x, p.y) === Infinity && /沉下去了/.test(g.msgText));
      sk.diveLeft = SN.bubbleT + 0.01; E.snakeTimers(sk, g, p, 0.02); const bb = sk.bubble;
      ok('v0.8.16: 1.5 breaths before it comes up, bubbles mark the spot — beside the ship', !!bb && Math.min(...g.shipCells().map(([x, y]) => U.cheb(x, y, bb.x, bb.y))) <= 1 && DB[w.get(bb.x, bb.y)].kind === 'water', bb);
      for (let i = 0; i < 12 && (sk.x !== bb.x || sk.y !== bb.y); i++) { sk.moveT = 0; E.snakeAct(sk, g, p, false); }
      { const sv0 = [sk.x, sk.y]; sk.x = p.x; sk.y = p.y; E.snakeUnstick(sk, g, p); ok('v0.8.16: if the ship has sailed over where it comes up, it surfaces beside the ship instead', !g.shipCells().some(([x, y]) => x === sk.x && y === sk.y) && DB[w.get(sk.x, sk.y)].kind === 'water', [sk.x - p.x, sk.y - p.y]); sk.x = sv0[0]; sk.y = sv0[1]; }
      const s1 = p.ship.hp; E.snakeTimers(sk, g, p, 2);
      ok('v0.8.16: …it comes up there and rams the ship (25 × difficulty)', !sk.under && Math.abs(s1 - p.ship.hp - U.r4(25 * g.diff.taken)) < 1e-6, s1 - p.ship.hp);
      // 吞象：頭抬起，紅線三格寬四格長，一息半後咬下去（溺）
      p.ship.hp = 120; near(); sk.x = sk.rx = p.x - 3; sk.gapeCD = 0; E.snakeAct(sk, g, p, false); const gc = E.gapeCells(sk);
      ok('v0.8.16: 吞象 — the head rises and marks a band three wide and four long, with you in it', sk.state === 'gape' && gc.length === 12 && gc.some(([x, y]) => x === p.x && y === p.y) && /吞象/.test(g.msgText), gc.length);
      p.hp = 100; E.snakeTimers(sk, g, p, 1.6);
      ok('v0.8.16: …and bites down after a breath and a half: 溺 30 (armour does not help)', Math.abs(100 - p.hp - U.r4(30 * g.baseTaken())) < 1e-6 && p.lastHit.kind === '溺', 100 - p.hp);
      p.azure = true; near(); sk.x = sk.rx = p.x - 3; sk.gapeCD = 0; E.snakeAct(sk, g, p, false); p.hp = 100; E.snakeTimers(sk, g, p, 1.6);
      ok('v0.8.16: …青龍\'s 水性 takes a quarter off 溺', Math.abs(100 - p.hp - U.r4(30 * g.baseTaken() * 0.75)) < 1e-6, 100 - p.hp); p.azure = false;
      // 毒涎：命剩一半起；落地一圈三格；照蛇毒；毒死算死在魔王手上
      near(); sk.hp = sk.max * 0.5; sk.spitCD = 0; sk.x = sk.rx = p.x - 4; E.snakeAct(sk, g, p, false); const sp = sk.spit;
      ok('v0.8.16: from half life it spits venom at where you stand', !!sp && sp.x === p.x && sp.y === p.y && /毒涎/.test(g.msgText), sp);
      p.hp = 100; p.poisonT = 0; p.poisonPer = 0; E.snakeTimers(sk, g, p, 1);
      ok('v0.8.16: …it lands: poisoned like a snake bite (1.5 a breath, nine breaths), a boss\'s poison', p.poisonT === 9 && p.poisonPer === 1.5 && !!p.poisonBy && p.poisonBy.big, [p.poisonT, p.poisonPer]);
      g.updateStats(1); ok('v0.8.16: …the poison counts as the 修蛇\'s blow (a death to it keeps more courage)', p.lastHit && p.lastHit.big && p.lastHit.by === '修蛇' && p.hp < 100, p.lastHit);
      p.poisonT = 0; p.poisonPer = 0; p.poisonBy = null; p.hp = 100; sk.hp = sk.max;
      // 燭龍焚溟：修蛇是海中之物，全傷
      p.tools = [{ n: '燭龍焚溟', c: 1, dur: 199 }]; p.tool = 0; p.cour = g.levelAt(31); near(); p.atkT = 0; h0 = sk.hp; g.fireStrike([sk]);
      ok('v0.8.16: 燭龍焚溟 burns the 修蛇 in full (it is of the sea); 九閽鳴雷 would be half', Math.abs(h0 - sk.hp - U.r4(g.godDmg('燭龍焚溟') * g.dmgMult())) < 1e-6, [h0 - sk.hp]);
      p.tools = kt; p.tool = ktool; p.cour = 0; p.ship.hp = 120;
      // 一場最多三艘船：第四艘上不去、落水撐不起來
      p.fight.ships = 3; const parked = { kind: '孤帆', hp: 120, skulls: [], repairs: 0 }; const before = g.fightShipOk(parked), refused = !g.fightShip(parked);
      p.swimming = true; p.sailing = false; const ship0 = p.ship; p.ship = null; g.addItem('孤帆', 1); g.msgText = ''; g.startDeploy('孤帆');
      ok('v0.8.16: three ships used in this fight — a fourth cannot be boarded, nor pushed out while in the water', !before && refused && !p.deploy && /最多 3 艘/.test(g.msgText), g.msgText);
      p.swimming = false; p.sailing = true; p.ship = ship0; g.removeItem('孤帆', 9); p.fight.ships = 1;
      // 斃之：修蛇骨、蛇肉、方舟的上限回來
      g.save(); const svk = JSON.parse(localStorage.getItem(XIEYI.Game.slotKey(g.slot)));
      ok('v0.8.16: the fight saves the 修蛇\'s life and place, and how many ships were used', svk.player.fight && svk.player.fight.id === '修蛇' && svk.player.fight.hp === sk.hp && svk.player.fight.ships === 1, svk.player.fight);
      sk.hp = 0; g.kill(sk);
      ok('v0.8.16: slain — 斷修蛇於洞庭, a 修蛇骨 kept for 玄武 (no bag slot), eight 蛇肉, the 修蛇 bead a vermilion dot and 龍魂 lights (v0.8.21)', (p.bosses || {})['修蛇'] && p.trophies['修蛇'].n === '修蛇骨' && /斷修蛇於洞庭/.test(toasts()) && /蛇肉/.test(toasts()) && g.beadOf('修蛇') === 'won' && /龍魂亮了起來/.test(toasts()) && !E.list.includes(sk), p.trophies);
      ok('v0.8.16: …and with it gone, a 方舟 in 洞庭 has its full 420 again', g.shipMax({ kind: '方舟', cells: [[seat[0], seat[1]]] }) === 420);
      g.removeItem('蛇肉', 99); p.sailing = false; p.ship = null; put(p0.x, p0.y); reset(); E.list = E.list.filter(o => o.type !== '修蛇'); }
    // 修蛇卷（v0.8.16 使用者選甲）：蛇影在玄洲岸邊的海上
    { const DB = G.DB, xz = g.turtleZone; reset(); p.xuan = { day: 1 }; put(xz.x + 2, xz.y); p.sailing = false; p.ship = null; g.startTrial('修蛇', 0.6); const se = g.shadeEnt();
      ok('v0.8.16: 修蛇卷 — 玄武 breathes the 蛇影 out into the sea off 玄洲\'s shore (60%: 1800 on normal), not into a lake on the island', !!se && se.type === '修蛇' && se.shade === '蛇影' && se.hp === 1800 && DB[w.get(se.x, se.y)].kind === 'water' && !DB[w.get(se.x, se.y)].fresh && Math.hypot(se.x - xz.x, se.y - xz.y) > xz.r, se && [se.hp, w.get(se.x, se.y)]);
      put(xz.x + xz.r + 20, xz.y); g.updateStats(0.05); ok('v0.8.16: the sea trial reaches 26 past the island — 20 out you are still in it', !!p.trial);
      put(xz.x + xz.r + 30, xz.y); g.updateStats(0.05); ok('v0.8.16: …30 out it scatters, no penalty', !p.trial && !g.shadeEnt());
      put(p0.x, p0.y); reset(); }
    // 馴好的鷹：從正面啄鑿齒也只吃一成；天上盤旋的蠱雕追不上
    { const th = E.add('齒', p.x + 3, p.y, { moveT: 99, fx: -1, fy: 0 }), eg = E.add('鷹', p.x + 2, p.y, { tame: true, sta: 50, moveT: 0, atk: 0 }), hp0 = th.hp; E.update(0.01, g);
      ok('v0.8.9: a tame eagle pecking a 鑿齒 from the front does a tenth (2)', hp0 - th.hp === 2, hp0 - th.hp); E.remove(th);
      const hr = E.add('雕', p.x + 4, p.y, { mode: 'circle', moveT: 99, cryT: 99, diveT: 99 }); ok('v0.8.9: a 蠱雕 circling high is not a target for the eagle', E.hostileNear(p, 6) !== hr); E.remove(hr); E.remove(eg); }
    // 生成：碑的路、綠洲、溫泉
    { const wl = G.isles(g.seed).filter(i => (i.kind === '漠' || i.kind === '雪') && !G.zoneAt(i.cx, i.cy, g.seed)).map(i => [i.kind, G.baseTile(G.isleWell(i, g.seed).x, G.isleWell(i, g.seed).y, g.seed)]);
      ok('v0.8.9: every desert isle has an oasis pool and every snow isle a hot spring at its well', wl.length > 0 && wl.every(([k, t]) => t === (k === '漠' ? '池' : '湯')), wl.filter(([k, t]) => t !== (k === '漠' ? '池' : '湯')));
      ok('v0.8.9: the world knows the paths opened to out-of-reach steles (stamped like the steles)', Array.isArray(w.stelePaths)); }
    p.cour = keep.cour; p.bag = keep.bag; p.tools = keep.tools; p.tool = keep.tool; p.azure = keep.azure; p.bai = keep.bai; p.zhu = keep.zhu; p.hp = 100; p.sailing = false; p.ship = null; reset(); g.barSig = ''; g.courSig = ''; put(p0.x, p0.y); }
  // ============ v0.8.8：自查修掉的錯；玄武取經（第一卷、豨影的試煉）、惜字亭與許願 ============
  { const E = g.ents, p0 = { x: p.x, y: p.y }, DB = G.DB, put = (x, y) => { p.x = p.rx = x; p.y = p.ry = y; E.px = x; E.py = y; };
    const keep = { cour: p.cour, bag: p.bag.slice(), tools: p.tools.slice(), tool: p.tool, hp: p.hp, deaths: p.deaths, home: p.home, bed: p.bed };
    p.fight = null; p.bosses = {}; p.feats = []; p.inBoss = {}; p.jing = []; p.puppet = 0; p.scrolls = []; p.xuan = undefined; p.wish = undefined; p.trial = null;
    // 封豨的豕突：蓄力時定下冷卻、揚塵，這一步就停（先前註解吃掉了半行，一直衝）
    { const X = p.x, Y = p.y; for (let dy = -3; dy <= 3; dy++) for (let dx = -2; dx <= 9; dx++) w.set(X + dx, Y + dy, '草');
      const h = E.add('豨', X + 6, Y, { den: { x: X + 7, y: Y + 1 }, state: 'chase', chargeCD: 0, quakeCD: 99, eatCD: 99, callCD: 99, moveT: 0, atk: 9 }); const fx0 = g.fx.length, hx = h.x;
      E.hogAct(h, g, p, false, false);
      ok('v0.8.8: winding up a charge sets its cooldown (7–10 breaths), raises dust, and the hog stays put that step', h.state === 'wind' && h.chargeCD >= 7 && h.chargeCD <= 10 && h.x === hx && g.fx.length > fx0, [h.state, h.chargeCD]);
      E.remove(h); }
    // 毒咬：畫面震一下、有獸的聲音（先前也被註解吃掉）
    { const sn = E.add('蛇', p.x + 1, p.y, { moveT: 99 }); g.renderer.shake = 0; p.hp = 100; g.bite(sn, 1.5); ok('v0.8.8: a venomous bite shakes the screen again', g.renderer.shake > 0, g.renderer.shake); E.remove(sn); p.poisonT = 0; p.poisonPer = 0; p.biteN = 0; p.hp = 100; }
    // 採過的棉、麻長回棉、麻，不會長成樹；挖空的礦脈寫回石、岩、礫，不寫回礦
    { const r0 = w.rng; let seq = 0; w.rng = () => [0.5, 0.5, 0.01][seq++ % 3];
      const regrow = (base) => { let at = null; for (let r = 0; r < 60 && !at; r++) for (let dy = -r; dy <= r && !at; dy++) for (let dx = -r; dx <= r && !at; dx++) if (w.base(p.x + dx, p.y + dy) === base) at = [p.x + dx, p.y + dy]; if (!at) return 'none';
        const [x, y] = at, keepN = []; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1]]) { keepN.push([x + dx, y + dy, w.get(x + dx, y + dy)]); w.set(x + dx, y + dy, '木'); }
        w.set(x, y, '草'); seq = 0; w.step(x, y); const got = w.get(x, y); w.set(x, y, base); for (const [a, b, c] of keepN) w.set(a, b, c); return got; };
      const c1 = regrow('棉'), c2 = regrow('麻'); w.rng = r0;
      ok('v0.8.8: harvested cotton and hemp grow back as cotton and hemp, not as trees (even with trees around)', c1 === '棉' && c2 === '麻', [c1, c2]);
      const find = (b) => { for (let r = 0; r < 120; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && w.base(dx, dy) === b) return [dx, dy]; return null; };
      const fe = find('鐵'), fc = find('煤');
      ok('v0.8.8: blank paper over a mined vein is written back as the stone under it — iron and coal do not come back in minutes', fe && fc && w.rewriteBlank(fe[0], fe[1]) === '石' && w.rewriteBlank(fc[0], fc[1]) === '石', [fe, fc]); }
    // 囊滿：多出來的不再憑空消失，用小囊包著擱在腳邊
    { const bag0 = p.bag; p.bag = []; while (g.bagUsed() < g.slots()) p.bag.push({ n: '石', c: 99 });
      const at = g.giveNear('燧石', 1), k = at && U.key(at.x, at.y);
      ok('v0.8.8: with a full bag, a find goes into a small sack at your feet instead of vanishing', !!at && w.get(at.x, at.y) === '囊' && w.bags.get(k).some(s => s.n === '燧石') && at.where === '腳邊', at);
      const tr = U.trueRand; U.trueRand = () => 0; const tg = E.add('虎', p.x + 1, p.y, { moveT: 99 }); g.kill(tg); U.trueRand = tr;
      ok('v0.8.8: …a tiger\'s meat and skull too', w.bags.get(k).some(s => s.n === '肉') && w.bags.get(k).some(s => s.n === '虎首骨'), w.bags.get(k).map(s => s.n));
      p.bag = [{ n: '玻璃瓶', c: 2 }]; while (g.bagUsed() < g.slots()) p.bag.push({ n: '石', c: 99 });
      const no = g.swapOk('玻璃瓶', '海水瓶'); p.bag[0].c = 1; const yes = g.swapOk('玻璃瓶', '海水瓶');
      ok('v0.8.8: a bottle is filled only when the full one has a place (no more losing the empty and the water)', !no && yes, [no, yes]);
      w.set(at.x, at.y, '草'); w.bags.delete(k); p.bag = bag0; }
    // 站在台上，小魔王與天上的撲下來不撞在台邊
    { const t0 = w.get(p.x, p.y); w.set(p.x, p.y, '台'); const th = E.add('齒', p.x + 1, p.y, { moveT: 99 }), hp0 = th.hp;
      ok('v0.8.8: a 鑿齒 or a diving bird does not lose a tenth of its life on your 台 (no standing still to wear it down)', g.platformRecoil(th) === 0 && th.hp === hp0); E.remove(th); w.set(p.x, p.y, t0); }
    // 人在屋裡：海上不算，磚圍起來的才算；蠱雕抓不進磚屋
    { const z = G.zones(g.seed).find(o => o.id === '青龍'); put(z.x, z.y); p.sailing = true; const sea = g.indoors(); p.sailing = false; put(p0.x, p0.y);
      const X = p.x, Y = p.y, old = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { old.push([X + dx, Y + dy, w.get(X + dx, Y + dy)]); w.set(X + dx, Y + dy, dx || dy ? '磚' : '草'); }
      const inHut = g.indoors(), hp = E.add('雕', X + 1, Y, { mode: 'dive', moveT: 0, atk: 0, cryT: 99 }); p.hp = 100; E.update(0.01, g);
      ok('v0.8.8: open sea is not "indoors" (it used to be, the deep water counting as walls); a brick hut is', !sea && inHut, [sea, inHut]);
      ok('v0.8.8: a 蠱雕 cannot claw you inside a closed brick hut', p.hp === 100 && hp.mode === 'rise', [p.hp, hp.mode]);
      E.remove(hp); for (const [a, b, c] of old) w.set(a, b, c); }
    // 死因：剛挨的那一下打死的就算傷，中著毒也一樣（死在魔王手上膽氣照樣只減一半）
    { const bags0 = new Set(w.bags.keys()); p.cour = 100; p.poisonT = 5; p.poisonPer = 1; p.lastHit = { kind: '力', by: '封豨', big: true, t: w.time }; p.hp = 0; g.updateStats(0.01);
      ok('v0.8.8: killed by a boss while poisoned still counts as wounds — four tenths of the courage lost (v0.8.13)', p.dead && p.deathKeep === 0.6, [p.dead, p.deathKeep]);
      const d0 = p.deaths, sv = JSON.parse(localStorage.getItem(XIEYI.Game.slotKey(g.slot)));
      ok('v0.8.8: the save made at death remembers it (dead, the words on the screen, six tenths kept)', sv.player.dead === true && /傷重而亡/.test(sv.player.deadText) && sv.player.deathKeep === 0.6);
      g.load(sv); g.showDead(); ok('v0.8.8: read back on the death screen, you are still dead — not killed a second time', p.dead && p.deaths === d0 && !hidden('dead') && /傷重而亡/.test(document.getElementById('dead-text').textContent), [p.deaths, d0]);
      g.respawn(); ok('v0.8.8: …and waking keeps six tenths (100 → 60)', p.cour === 60 && !p.dead, p.cour); p.poisonT = 0; p.poisonPer = 0; p.hp = 100;
      for (const k of [...w.bags.keys()]) if (!bags0.has(k)) { w.bags.delete(k); w.set(...U.unkey(k), '草'); } put(p0.x, p0.y); }
    // 打著仗不能睡
    { const bt = w.get(p.x + 1, p.y); w.set(p.x + 1, p.y, '床'); p.fight = { id: '封豨' }; g.msgText = ''; g.sleep();
      ok('v0.8.8: no sleeping in the middle of a boss fight', g.bedNear() && /兵戈未息，不得安眠/.test(g.msgText), g.msgText); p.fight = null; w.set(p.x + 1, p.y, bt); }
    // 地界外最後一格存進檔：讀進來按「先不」照樣退得出去；舊存檔沒記到的，走出地界前不再問
    { const z = G.zones(g.seed).find(o => o.id === '封豨'); p.sailing = true; p.ship = World.newShip('孤帆'); put(z.x + 103, z.y); g.updateStats(0.05); put(z.x + 99, z.y); g.updateStats(0.05);
      g.save(); const sv = JSON.parse(localStorage.getItem(XIEYI.Game.slotKey(g.slot))); g.closeBossAsk(); g.load(sv); g.updateStats(0.05);
      const asked = !hidden('bossask'); g.bossNo();
      ok('v0.8.8: saved while the boss question is open, read back, 先不 still steps you out (the last tile outside is saved)', asked && sv.player.bossOut && p.x === z.x + 103, [asked, p.x - z.x]);
      put(z.x + 99, z.y); p.inBoss = {}; p.bossOut = null; g.updateStats(0.05); g.bossNo(); g.updateStats(0.05);
      ok('v0.8.8: an old save inside the ground: 先不 stops the asking until you walk out (no trap)', hidden('bossask') && p.inBoss['封豨'] === true && /不再問/.test(g.msgText), g.msgText);
      p.inBoss = {}; p.sailing = false; p.ship = null; put(p0.x, p0.y); }
    // 遠海上死了：荷包落在出生點附近的空地，不蓋掉那裡原有的荷包
    { const ships0 = new Set(w.ships.keys()), sp = g.spawn, keepS = w.get(sp.x, sp.y), land = (x, y) => DB[w.get(x, y)].kind !== 'water';
      let z = null; for (const [ax, ay] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) for (let k = 0.3; k < 0.98 && !z; k += 0.04) { const x = Math.round(ax * k * G.WORLD_R), y = Math.round(ay * k * G.WORLD_R); if (!g.nearestTile(x, y, land, 82)) z = { x, y }; } w.set(sp.x, sp.y, '包'); w.bags.set(U.key(sp.x, sp.y), [{ n: '木', c: 20 }]);
      p.bag = [{ n: '果', c: 2, ds: [1, 1] }]; p.tools = []; p.tool = -1; put(z.x, z.y); p.sailing = true; p.ship = World.newShip('孤帆'); p.lastHit = null; p.hp = 0; g.die('溺');
      const old = w.bags.get(U.key(sp.x, sp.y)); let fresh = null; for (const [k, v] of w.bags) if (v.some(s => s.n === '果') && w.get(...U.unkey(k)) === '包') fresh = k;
      ok('v0.8.8: dying out at sea drops the purse on free land near your birthplace — the purse already there keeps its things', old && old.some(s => s.n === '木' && s.c === 20) && !!fresh && fresh !== U.key(sp.x, sp.y) && /出生的地方附近/.test(document.getElementById('dead-text').textContent), [fresh]);
      g.respawn(); if (fresh) { w.bags.delete(fresh); w.set(...U.unkey(fresh), '草'); } w.bags.delete(U.key(sp.x, sp.y)); w.set(sp.x, sp.y, keepS); for (const sh of [...w.ships.keys()]) if (!ships0.has(sh)) w.removeShip(sh); p.sailing = false; p.ship = null; put(p0.x, p0.y); }
    // 舊存檔櫃裡的散油、疊著的船，讀進來也照規矩改
    { g.save(); const sv = JSON.parse(localStorage.getItem(XIEYI.Game.slotKey(g.slot))); const ck = U.key(p.x + 2, p.y + 2); sv.world.chests = Object.assign(sv.world.chests || {}, { [ck]: [{ n: '油脂', c: 3 }, { n: '孤帆', c: 2 }] }); g.load(sv);
      const box = w.chests.get(ck) || [];
      ok('v0.8.8: an old chest with loose fat and stacked ships: the fat goes into a 麻布包, the ships one per row', box.some(s => s.n === '麻布包' && s.oil === 3) && box.filter(s => s.n === '孤帆').length === 2 && !box.some(s => s.n === '油脂'), box);
      w.chests.delete(ck); }
    // ---------- 玄武取經 ----------
    const xz = G.zones(g.seed).find(o => o.id === '玄武'); put(xz.x + 3, xz.y); for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 4; dx++) if (DB[w.get(xz.x + dx, xz.y + dy)].walk <= 0) w.set(xz.x + dx, xz.y + dy, '草');
    E.list = E.list.filter(o => o.type !== '玄武'); E.spawnAcc = 2; E.update(0.01, g); const tw = E.list.find(o => o.type === '玄武');
    ok('v0.8.8: on 玄洲, 玄武 shows at the island\'s heart — a black 龜 that does not move', !!tw && tw.x === xz.x && tw.y === xz.y, tw && [tw.x, tw.y]);
    put(xz.x + 2, xz.y); p.fx = -1; p.fy = 0; g.msgUntil = 0; g.lastMsg = null; await sleep(120);
    ok('v0.8.8: next to it the status line says 北方玄武 · E', /北方玄武/.test(document.getElementById('msg').textContent), document.getElementById('msg').textContent);
    g.pressGather(); const tt = document.getElementById('talk-text').textContent;
    ok('v0.8.8: the first talk tells why the paper tilts (共工), and sends you home to make a wish', !hidden('talk') && /共工/.test(tt) && /不周之山/.test(tt) && /惜字亭/.test(tt) && !!p.xuan, tt.slice(0, 80));
    const pv = p.pavilion, sp = g.spawn;
    ok('v0.8.8: a 惜字亭 now stands near your birthplace, on plain ground, with all eight cells around it walkable', !!pv && w.get(pv.x, pv.y) === '亭' && U.cheb(pv.x, pv.y, sp.x, sp.y) >= 3 && U.cheb(pv.x, pv.y, sp.x, sp.y) <= 12 && [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]].every(([dx, dy]) => DB[w.get(pv.x + dx, pv.y + dy)].walk > 0), pv);
    ok('v0.8.8: the 魔物誌 card for 玄武 opens', p.codex && p.codex['玄武'] >= 1);
    g.talkPick(0); const jt = document.getElementById('talk-row').textContent, offs = [...document.querySelectorAll('#talk-row button')].filter(b => b.disabled).length;
    ok('v0.8.8: 取經 offers the 封豨卷, (v0.8.16) the 修蛇卷 and (v0.8.25) the 大風卷, none of them shut', /封豨卷/.test(jt) && /修蛇卷/.test(jt) && /大風卷/.test(jt) && !/還沒寫成/.test(jt) && offs === 0, jt);
    g.talkPick(0); const pk = document.getElementById('talk-row').textContent, pkt = document.getElementById('talk-text').textContent;
    ok('v0.8.10: then 玄武 asks how strong a shade — 六成 (1500 on normal) or 九成 (2300); the real one has 2500', /六成的豨影/.test(pk) && /九成的豨影/.test(pk) && /1500/.test(pkt) && /2300/.test(pkt) && /2500/.test(pkt), pkt);
    g.talkPick(0); const sh = () => E.list.find(o => o.shade === '豨影');
    ok('v0.8.10: choosing 六成, 玄武 breathes out a 豨影 — 60% of 封豨 (2000 × 0.6 × 1.25 = 1500), the same moves', !!p.trial && p.trial.k === 0.6 && !!sh() && sh().hp === 1500 && sh().max === 1500 && sh().type === '豨' && /豨影/.test(toasts()), sh() && sh().hp);
    p.hp = 100; const d1 = g.bossHit(sh(), 20, '力', '撞');
    ok('v0.8.10: the 六成 shade hits at six tenths (撞 20 → 12, armour counts)', Math.abs(d1 - U.r4(12 * g.takenMult())) < 1e-6 && /豨影撞/.test(g.msgText), [d1, g.msgText]);
    g.bossSig = ''; await sleep(150); const bb = document.getElementById('bossbar');
    ok('v0.8.8: the life bar names the 豨影 and the trial', !bb.classList.contains('hidden') && /豨影/.test(bb.textContent) && /玄武的試煉/.test(bb.textContent) && bb.classList.contains('shade'), bb.textContent);
    { const s1 = sh(); s1.state = 'chase'; s1.callCD = 0; s1.eatCD = 99; s1.hp = 400; E.list = E.list.filter(o => o.type !== '豬'); E.hogAct(s1, g, p, false, false);
      ok('v0.8.8: its 群豕 are shades too', E.list.filter(o => o.type === '豬').length === 2 && E.list.filter(o => o.type === '豬').every(o => o.shade === '豕影'), E.list.filter(o => o.type === '豬').map(o => o.shade)); }
    const c0 = p.cour; put(xz.x + xz.r + 8, xz.y); g.updateStats(0.05);
    ok('v0.8.8: walking out of 玄洲 ends the trial — the shade and its boars melt, no penalty', !p.trial && !sh() && !E.list.some(o => o.shade) && /經未取成/.test(toasts()) && p.cour === c0);
    put(xz.x + 2, xz.y); g.jingTalk(); g.talkPick(0); g.talkPick(0); const s2 = sh(); g.kill(s2);
    ok('v0.8.8: slay the shade and the scroll is yours — the 封豨 bead a red ring (v0.8.21), courage up (v0.8.10: the scroll is 封豨\'s, and it says the 九成 one is still untried)', g.beadOf('封豨') === 'held' && p.jingFor === '封豨' && p.scrolls.length === 1 && p.scrolls[0].id === '封豨' && !p.trial && p.cour > c0 && /取得封豨卷/.test(toasts()) && /九成的還沒試過/.test(toasts()), [g.beadOf('封豨'), p.cour - c0]);
    g.courSig = ''; g.hudSig = ''; await sleep(150);
    ok('v0.8.8: …the bead shows it', document.querySelectorAll('#jingbeads i')[0].className === 'held', document.querySelectorAll('#jingbeads i')[0].className);
    g.jingTalk(); ok('v0.8.10: asking again, 玄武 says which scroll you hold (only the 六成 shade so far) and offers another', /你手上是封豨卷/.test(document.getElementById('talk-text').textContent) && /只斃過六成/.test(document.getElementById('talk-text').textContent) && /封豨卷/.test(document.getElementById('talk-row').textContent)); g.talkPick('last');
    g.journalTab = 'see'; g.toggleJournal(); const jn = document.getElementById('journal-body').textContent; g.toggleJournal();
    ok('v0.8.8: the journal keeps the scroll (經卷) and the wish line', /經卷/.test(jn) && /封豨卷/.test(jn) && /豕突/.test(jn) && /願/.test(jn), jn.slice(-160));
    // 進地界：取過就不提醒；沒取就提醒會錯過；斃了沒取的就打叉
    { const z = G.zones(g.seed).find(o => o.id === '封豨'); p.sailing = true; p.ship = World.newShip('孤帆'); put(z.x + 103, z.y); g.updateStats(0.05); put(z.x + 99, z.y); g.updateStats(0.05);
      const a1 = document.getElementById('bossask-text').textContent; g.bossNo();
      p.jing = []; p.jingFor = null; put(z.x + 99, z.y); g.updateStats(0.05); const a2 = document.getElementById('bossask-text').textContent; g.bossNo();
      ok('v0.8.8: entering 桑林 with the scroll taken there is no warning; without it, the window asks 確定要進去 (v0.8.9: the bead turns to a question mark)', !/當真要闖/.test(a1) && /還沒向玄武取封豨卷/.test(a2) && /當真要闖/.test(a2) && /黑叉/.test(a2), a2.slice(-80));
      ok('v0.8.10: …and with only the 六成 shade slain, the window reminds you the 九成 one is untried', /九成的還沒試過/.test(a1), a1.slice(-80));
      put(z.x + 99, z.y); g.updateStats(0.05); g.bossYes(); g.bossYes(); const hh = E.list.find(o => o.type === '豨' && !o.shade); g.kill(hh);
      ok('v0.8.8: slay 封豨 without the scroll — the 封豨 bead is a black cross, the 玄武偶 grows a level', g.beadOf('封豨') === 'miss' && p.puppet === 1 && /黑叉/.test(toasts()), [g.beadOf('封豨'), p.puppet]);
      p.bosses = {}; p.feats = []; p.jing = ['got']; p.jingFor = '封豨'; p.puppet = 0; p.inBoss = {}; put(z.x + 99, z.y); g.updateStats(0.05); g.bossYes(); g.kill(E.list.find(o => o.type === '豨' && !o.shade));
      ok('v0.8.8: slay it with the scroll taken — a vermilion dot (v0.8.10: the scroll is used up; v0.8.22: it crumbles to dust)', g.beadOf('封豨') === 'won' && !p.puppet && /封豨卷用上了，化作塵埃/.test(toasts()) && !p.jingFor && !!p.scrolls[p.scrolls.length - 1].dust, g.beadOf('封豨'));
      g.journalTab = 'see'; g.toggleJournal(); const jd = document.getElementById('journal-body').textContent; g.toggleJournal(); ok('v0.8.22: the journal says the scroll crumbled to dust', /化作塵埃/.test(jd));
      p.sailing = false; p.ship = null; p.inBoss = {}; }
    // 惜字亭：許願
    { put(pv.x + 1, pv.y); p.fx = -1; p.fy = 0; g.pressGather(); const wt = document.getElementById('talk-text').textContent;
      ok('v0.8.8: at the 惜字亭, E: the wish is offered (敬惜字紙)', !hidden('talk') && /敬惜字紙/.test(wt) && /許願/.test(document.getElementById('talk-row').textContent), wt.slice(0, 60));
      g.talkPick(0); ok('v0.8.8: making the wish — 「這張紙上的字，一個也不讓它化掉。」 — is recorded', !!p.wish && /一個也不讓它化掉/.test(toasts()) && hidden('talk'), p.wish);
      g.pressGather(); ok('v0.8.8: asked again, it reminds you of the wish and that it is redeemed after 共工', /許過願/.test(document.getElementById('talk-text').textContent) && /共工/.test(document.getElementById('talk-text').textContent)); g.talkPick('last'); }
    // 存讀檔：經卷、珠、願、亭都在；試煉不存檔
    { g.save(); const sv = JSON.parse(localStorage.getItem(XIEYI.Game.slotKey(g.slot))); p.trial = { id: '封豨', slot: 1, at: 0 }; g.load(sv);
      ok('v0.8.8: the scrolls, beads, wish and the pavilion are saved and read back; a trial is not', !!p.xuan && g.beadOf('封豨') === 'won' && p.scrolls.length === 1 && !!p.wish && p.pavilion && p.pavilion.x === pv.x && !p.trial && w.get(pv.x, pv.y) === '亭');
      const old = JSON.parse(JSON.stringify(sv)); old.player.bosses = { '封豨': { diff: 'normal', solo: true, day: 3 } }; delete old.player.jing; delete old.player.jingOld; p.jing = []; p.jingOld = undefined; g.load(old);
      ok('v0.8.8: an older save where 封豨 fell before 玄武 existed: that scroll is not counted as missed', p.bosses['封豨'].jing === true && g.beadOf('封豨') === 'won' && p.jingOld === true, g.beadOf('封豨')); }
    // 收拾
    w.set(pv.x, pv.y, '草'); E.list = E.list.filter(o => o.type !== '玄武' && !o.shade && o.type !== '豨' && o.type !== '豬');
    p.bosses = {}; p.feats = []; p.inBoss = {}; p.jing = []; p.puppet = 0; p.scrolls = []; p.xuan = undefined; p.wish = undefined; p.pavilion = undefined; p.trial = null; p.jingOld = undefined; p.fight = null; p.bossBuff = 0; p.trialTries = {}; p.trophies = {}; p.jingFor = null; p.shade9 = {}; p.jingCour = {}; p.trialLockT = 0;
    p.creatures = p.creatures.filter(c => c !== '豨' && c !== '玄武'); if (p.codex) { delete p.codex['封豨']; delete p.codex['玄武']; }
    p.cour = keep.cour; p.bag = keep.bag; p.tools = keep.tools; p.tool = keep.tool; p.hp = 100; p.home = keep.home; p.bed = keep.bed; g.barSig = ''; g.courSig = ''; g.hudSig = ''; put(p0.x, p0.y); }
  // ============ v0.8.7：封豨（大魔王）與戰鬥的規矩：進地界先問、鎖難度、逃跑、鎖血與神獸護駕、存讀檔接著打、獨力記成就 ============
  { const E = g.ents, p0 = { x: p.x, y: p.y }, DB = G.DB, DIFF = XIEYI.DIFF, z = G.zones(g.seed).find(o => o.id === '封豨'), put = (x, y) => { p.x = p.rx = x; p.y = p.ry = y; E.px = x; E.py = y; };
    const keep = { azure: p.azure, bai: p.bai, zhu: p.zhu, cour: p.cour, bag: p.bag.slice(), tools: p.tools.slice(), tool: p.tool }, dk = g.diff;
    const hog = () => E.list.find(o => o.type === '豨');
    p.fight = null; p.bosses = {}; p.feats = []; p.inBoss = {}; p.lockT = 0; p.guardT = 0; p.jing = ['got']; p.jingFor = '封豨'; p.bossBuff = 0; p.trialTries = {}; E.list = E.list.filter(o => o.type !== '豨' && o.type !== '豬');
    // 進地界先問
    p.sailing = true; p.ship = World.newShip('孤帆'); put(z.x + 103, z.y); g.updateStats(0.05); put(z.x + 98, z.y); g.updateStats(0.05);
    const ask = document.getElementById('bossask-text').textContent;
    ok('v0.8.7: sailing into 封豨\'s ground (桑林, radius 100) asks first — locked difficulty, the cost of giving up (認輸, v0.8.9), four tenths of courage on death (v0.8.13), the guard', !hidden('bossask') && /封豨/.test(ask) && /認輸/.test(ask) && /膽氣只減四成/.test(ask) && /獨力/.test(ask) && /白虎/.test(ask), ask);
    g.bossNo(); ok('v0.8.7: 先不 steps you back out', p.x === z.x + 103 && !p.fight && hidden('bossask'), [p.x, z.x]);
    put(z.x + 98, z.y); g.updateStats(0.05); g.bossYes(); const h = hog();
    ok('v0.8.7: 進去 starts the fight; 封豨 stands in its den, a two-by-two body (v0.8.10: 2000 life, 2500 on normal)', !!p.fight && !!h && E.at(h.x + 1, h.y + 1) === h && E.at(h.x, h.y + 1) === h && E.at(h.x + 1, h.y) === h && h.hp === 2500 && G.DB['豨'].hp === 2000 && U.dist(h.x + 1, h.y + 1, z.x, z.y) < 6, h && [h.x, h.y, z.x, z.y]);
    g.changeDiff('easy'); ok('v0.8.7: in a boss fight the difficulty cannot change', g.inBossFight() && /換不了難度/.test(g.msgText) && g.diff === dk);
    // 招式：撞（力）、拱地（震，台上不受）、豕突（力，蓄力一息多）
    p.sailing = false; p.ship = null; put(h.x + 2, h.y); w.set(p.x, p.y, '草'); p.hp = 100; p.azure = false; p.bai = false; p.zhu = false;
    const d1 = g.bossHit(h, 20, '力', '撞'); ok('v0.8.7: its blows are 力 — armour counts', Math.abs(d1 - U.r4(20 * g.takenMult())) < 1e-6 && /封豨撞（力）/.test(g.msgText), [d1, g.msgText]);
    const ringTo = () => { h.ring = { r: 0, hit: false, cx: p.x + 0.5 - 3, cy: p.y + 0.5 }; h.state = 'chase'; for (let k = 0; k < 40 && h.ring; k++) E.hogTimers(h, g, p, 0.05); };
    p.hp = 100; ringTo(); ok('v0.8.7: rooting the ground sends out a ring of 震 (22, armour does not count)', Math.abs(100 - p.hp - U.r4(22 * g.baseTaken())) < 1e-6, 100 - p.hp);
    w.set(p.x, p.y, '台'); p.hp = 100; ringTo(); ok('v0.8.9: 封豨 roots up a 台 too — the 震 reaches you on it (使用者定：台不管用)', Math.abs(100 - p.hp - U.r4(22 * g.baseTaken())) < 1e-6, g.msgText);
    w.set(p.x, p.y, '棧'); p.hp = 100; ringTo(); ok('v0.8.9: …a 棧 still carries you over it (v0.8.22: 橋 is 棧 now)', p.hp === 100 && /震不上來/.test(g.msgText), g.msgText); w.set(p.x, p.y, '草');
    p.hp = 100; for (let i = 3; i <= 7; i++) for (const dy of [0, 1]) w.set(h.x + i, h.y + dy, '草'); put(h.x + 7, h.y); h.state = 'chase'; h.chargeCD = 0; h.quakeCD = 99; h.callCD = 99; h.eatCD = 99; h.moveT = 0; h.atk = 9; E.update(0.01, g);
    ok('v0.8.7: from three to ten tiles off it winds up a charge (豕突), the path marked', h.state === 'wind' && h.cdx === 1 && h.cdy === 0, [h.state, h.cdx, h.cdy]);
    h.windT = 0; E.hogTimers(h, g, p, 0.01); for (let i = 0; i < 14 && h.state === 'charge'; i++) { h.moveT = 0; E.update(0.01, g); }
    ok('v0.8.7: …then charges straight in — 40, 力', Math.abs(100 - p.hp - U.r4(40 * g.takenMult())) < 1e-6 && /豕突/.test(g.msgText), [100 - p.hp, g.msgText]);
    // 護駕：一般命只剩一點時鎖血一息半，之後求教過的神獸擋六息；一場只一次；困難不鎖
    g.diff = DIFF.normal; p.bai = true; p.hp = 5; p.fight.locked = false; g.bossHit(h, 40, '力', '豕突');
    ok('v0.8.7: a killing blow on normal leaves you at 1 and locks you for 1.5 breaths', p.hp === 1 && p.lockT === 1.5 && /命懸一線/.test(toasts()), [p.hp, p.lockT]);
    ok('v0.8.7: while locked it cannot hurt you', g.bossHit(h, 40, '力', '撞') === 0 && p.hp === 1);
    g.bossTick(1.6); ok('v0.8.7: then 白虎 (the guard of the west, v0.8.9) comes to guard for 6 breaths, and the fight is no longer solo', p.guardT === 6 && !p.fight.solo && p.fight.guardBy === '白虎' && /白虎護駕/.test(toasts()), [p.guardT, p.fight.guardBy]);
    const hg = p.hp; ok('v0.8.7: …blocking 封豨 entirely', g.bossHit(h, 40, '力', '撞') === 0 && /擋下/.test(g.msgText));
    g.bossTick(1); ok('v0.8.7: …while your life comes back 4 a breath', Math.abs(p.hp - hg - 4) < 1e-6, p.hp - hg);
    p.guardT = 0; p.hp = 5; g.bossHit(h, 40, '力', '撞'); const once = p.hp; p.hp = 100;
    ok('v0.8.7: the lock comes only once a fight', once === 0);
    p.fight.locked = false; g.diff = DIFF.hard; p.hp = 5; g.bossHit(h, 40, '力', '撞'); const hardHp = p.hp; p.hp = 100; g.diff = dk;
    ok('v0.8.7: on hard there is no lock and no guard', hardHp === 0 && !(p.lockT > 0));
    g.bossSig = ''; await sleep(150); const bb = document.getElementById('bossbar');
    ok('v0.8.7: a life bar for 封豨 shows its name and whether you fight alone — no 鬃 marks beside the name (v0.8.20)', !bb.classList.contains('hidden') && /封豨/.test(bb.textContent) && !/鬃|尾/.test(bb.textContent) && /2500／2500/.test(bb.textContent) && /還剩 \d+ 息/.test(bb.textContent), bb.textContent);
    { const hk = h.hp; h.hp = 1250; g.bossSig = ''; await sleep(150); const wv = document.getElementById('bossbar-fill').style.width; h.hp = hk; g.bossSig = '';
      ok('v0.8.20: the life bar shrinks with the boss\'s hp (half hp → 50%)', parseFloat(wv) === 50, wv); }
    // 存讀檔接著打
    h.hp = 1700; p.fight.solo = true; g.save(); const sv = JSON.parse(localStorage.getItem(XIEYI.Game.slotKey(g.slot)));
    ok('v0.8.7: the fight is saved with 封豨\'s life and place', sv.player.fight && sv.player.fight.hp === 1700 && sv.player.fight.x === h.x);
    g.load(sv); g.updateStats(0.05); const h2 = hog();
    ok('v0.8.7: read back, the fight goes on — 封豨 returns with the life it had', !!p.fight && !!h2 && h2.hp === 1700 && h2.x === sv.player.fight.x, h2 && h2.hp);
    // 荐食、群豕
    { const fx = h2.x + 3, fy = h2.y; w.set(fx, fy, '木'); h2.state = 'eat'; h2.food = [fx, fy]; h2.eatLeft = 0.01; h2.hpAtEat = h2.hp; E.hogTimers(h2, g, p, 0.05);
      ok('v0.8.7: eating a mulberry (荐食) gives back 5% of its life and leaves bare earth (1700 + 125)', h2.hp === 1825 && w.get(fx, fy) === '土' && h2.state === 'chase', [h2.hp, w.get(fx, fy)]);
      w.set(fx, fy, '木'); h2.state = 'eat'; h2.food = [fx, fy]; h2.eatLeft = 2; h2.hpAtEat = h2.hp; h2.hp -= 100; E.hogTimers(h2, g, p, 0.05);
      ok('v0.8.7: hit hard while eating, it gets nothing', h2.hp === 1725 && w.get(fx, fy) === '木' && /打斷/.test(g.msgText), [h2.hp, g.msgText]);
      h2.state = 'chase'; h2.eatCD = 0; h2.callCD = 99; h2.hp = 1450; put(h2.x + 12, h2.y); E.hogAct(h2, g, p, false, false);
      ok('v0.8.7: below six tenths it goes for a tree', h2.state === 'goeat' && !!h2.food, h2.state);
      h2.state = 'chase'; h2.eatCD = 99; h2.hp = 1200; h2.callCD = 0; E.list = E.list.filter(o => o.type !== '豬'); E.hogAct(h2, g, p, false, false);
      ok('v0.8.7: from half its life it calls boars (群豕)', E.count('豬') === 2 && /群豕/.test(g.msgText), E.count('豬')); }
    // 認輸（v0.8.9，原本叫逃跑）：暫停面板按兩次——膽氣減兩成；走出地界不算認輸：魔王回窩養傷，戰事還掛著
    p.cour = 1000; g.togglePause(); const fb = document.getElementById('pause-flee');
    ok('v0.8.7: in a fight the pause panel has a 認輸 button, and says the difficulty is locked', !fb.classList.contains('hidden') && /認輸/.test(fb.textContent) && /換不了難度/.test(document.getElementById('pause-diff-note').textContent));
    fb.click(); ok('v0.8.7: the first press only arms it', !!p.fight && /再按一次/.test(fb.textContent));
    fb.click(); ok('v0.8.9: the second press gives up — courage down three tenths (v0.8.13), 封豨 goes home to heal', !p.fight && p.cour === 700 && !hog() && hidden('pause') && /認輸/.test(toasts()), p.cour);
    p.inBoss = {}; put(z.x + 98, z.y); g.updateStats(0.05); g.bossYes(); put(z.x + 120, z.y); g.updateStats(0.05);
    ok('v0.8.9: walking out of the ground is not giving up — 封豨 goes home to heal, the fight stays on (difficulty still locked)', !!p.fight && p.fight.away && !hog() && g.inBossFight() && p.cour === 700 && /走出了封豨的地界/.test(toasts()) && /連續 1800 息/.test(toasts()));
    put(z.x + 98, z.y); g.updateStats(0.05); ok('v0.8.9: walking back in, 封豨 comes out again at full life, no question asked', !!hog() && hog().hp === 2500 && !p.fight.away && hidden('bossask'));
    // 死在戰中：膽氣減半；v0.8.12 起死了這一場就結束（使用者定：不算同一場）
    p.cour = 100; p.lastHit = { kind: '力', by: '封豨', big: true, t: w.time }; p.hp = 0; g.die('傷');
    ok('v0.8.12: dying in the fight ends it (使用者定：死了不算同一場) — 封豨 goes home to heal, the difficulty lock is off; four tenths of the courage lost (v0.8.13)', !p.fight && !hog() && !g.inBossFight() && /封豨回桑林去了/.test(document.getElementById('dead-text').textContent) && /這一場算結束了/.test(document.getElementById('dead-text').textContent) && p.deathKeep === 0.6, document.getElementById('dead-text').textContent);
    g.respawn(); ok('v0.8.7: …courage 100 → 60', p.cour === 60, p.cour);
    // 獨力斃之：記成就（寫明難度）
    p.inBoss = {}; put(z.x + 98, z.y); g.updateStats(0.05); const asked2 = !hidden('bossask'); g.bossYes(); const h3 = hog(); const c0 = p.cour;
    ok('v0.8.12: going back after dying asks again — a new fight, the clock starts over', asked2 && !!h3 && p.fight && Math.abs(g.bossTimes(p.fight).all) < 1, [asked2, !!h3]);
    g.kill(h3);
    ok('v0.8.7: slain alone — recorded with the difficulty as a feat, courage up, meat', p.bosses['封豨'] && p.bosses['封豨'].solo && p.feats.length === 1 && /禽封豨於桑林 · 一般 · 獨力/.test(p.feats[0].text) && p.cour > c0 && !p.fight && /禽封豨於桑林/.test(toasts()) && /\+6%/.test(toasts()), p.feats);
    g.journalTab = 'see'; g.toggleJournal(); const jt = document.getElementById('journal-body').textContent; g.toggleJournal();
    ok('v0.8.7: the journal lists the boss and the feat', /大魔王/.test(jt) && /成就/.test(jt) && /獨力/.test(jt), jt.slice(-120));
    p.inBoss = {}; put(z.x + 98, z.y); g.updateStats(0.05); ok('v0.8.7: once slain, its ground no longer asks', hidden('bossask') && !p.fight);
    // 收拾
    p.azure = keep.azure; p.bai = keep.bai; p.zhu = keep.zhu; p.cour = keep.cour; p.bag = keep.bag; p.tools = keep.tools; p.tool = keep.tool; g.barSig = ''; g.courSig = '';
    p.bosses = {}; p.feats = []; p.inBoss = {}; p.fight = null; p.lockT = 0; p.guardT = 0; p.hp = 100; p.jing = []; p.puppet = 0; p.bossBuff = 0; p.trialTries = {}; p.trophies = {}; E.list = E.list.filter(o => o.type !== '豨' && o.type !== '豬');
    p.creatures = p.creatures.filter(c => c !== '豨'); if (p.codex) delete p.codex['封豨']; p.sailing = false; p.ship = null; put(p0.x, p0.y); }
  // ============ v0.8.6：心打愜意、懼；燧石、火蝕；蠱雕（啼、撲）、朱羽、朱雀（氣順、鳳翎） ============
  { const E = g.ents, p0 = { x: p.x, y: p.y }, DB = G.DB, zhu0 = p.zhu, put = (x, y) => { p.x = p.rx = x; p.y = p.ry = y; E.px = x; E.py = y; };
    E.list = E.list.filter(o => o.type !== '雕' && o.type !== '朱雀'); p.sailing = false; p.ship = null; p.swimming = false;
    // 心：打愜意不打命；朱雀的氣順減四分之一；懼：出不了手
    p.zhu = false; p.hp = 90; p.san = 80; const dz = g.hurt(10, '心', { name: '蠱雕' });
    ok('v0.8.6: 心 strikes sanity, not life', p.hp === 90 && Math.abs(p.san - (80 - dz)) < 1e-6 && dz > 0, [p.hp, p.san]);
    p.zhu = true; ok('v0.8.6: 朱雀\'s 氣順 takes a quarter off 心 and 窒', Math.abs(g.kindMult('心') - 0.75 * g.baseTaken()) < 1e-9 && Math.abs(g.kindMult('窒') - 0.75 * g.baseTaken()) < 1e-9); p.zhu = false;
    w.set(p.x + 1, p.y, '草'); const dummy = E.add('鹿', p.x + 1, p.y, { moveT: 99 }); g.addItem('石劍', 1); hold('石劍'); p.fearT = 1; p.atkT = 0; const h0 = dummy.hp; g.attack(dummy);
    ok('v0.8.6: while 懼 you cannot strike', dummy.hp === h0 && /懼/.test(g.msgText), g.msgText);
    g.updateStats(1.1); p.atkT = 0; g.attack(dummy); ok('v0.8.6: …and once it passes you can', dummy.hp < h0); E.remove(dummy);
    // 燧石：海邊與火島岩地上偶爾一格「燧」，本島原本的地不長；取之得燧石；鑿石頭五十分之一
    let flint = null; for (const isl of G.isles(g.seed).filter(i => i.kind === '火')) { const R = Math.ceil(isl.R); for (let dy = -R; dy <= R && !flint; dy++) for (let dx = -R; dx <= R && !flint; dx++) if (G.baseTile(isl.cx + dx, isl.cy + dy, g.seed) === '燧') flint = [isl.cx + dx, isl.cy + dy]; if (flint) break; }
    let oldFlint = 0; for (let y = -100; y <= 100; y += 2) for (let x = -100; x <= 100; x += 2) if (G.oldTile(x, y, g.seed) !== G.baseTile(x, y, g.seed) && DB[G.oldTile(x, y, g.seed)].kind !== 'water') oldFlint++;
    ok('v0.8.6: flint (燧) shows on a 火島, while the home island\'s original land is unchanged', !!flint && oldFlint === 0, [flint, oldFlint]);
    g.removeItem('燧石', 99); put(flint[0] - 1, flint[1]); w.set(p.x, p.y, '草'); face(1, 0); p.sta = 100; g.action = null; g.pressGather(); await until(() => !g.action, 6000);
    ok('v0.8.6: taking a 燧 gives a 燧石 and leaves gravel', g.count('燧石') === 1 && w.get(flint[0], flint[1]) === '礫', [g.count('燧石'), w.get(flint[0], flint[1])]);
    { const tr = U.trueRand; U.trueRand = () => 0; g.addItem('石鎬', 1); hold('石鎬'); w.set(p.x + 1, p.y, '石'); g.action = null; g.pressGather(); await until(() => !g.action, 8000); U.trueRand = tr;
      ok('v0.8.6: chiselling stone with a pick sometimes (1/50, true random) turns up a 燧石', g.count('燧石') === 2, g.count('燧石')); }
    // 火蝕：燧石一、火把一、油脂一份（從麻布包裡取）
    g.removeItem('火蝕', 9); g.addItem('火把', 1); g.addItem('麻布包', 1); g.addItem('油脂', 1); const oil0 = g.count('油脂'), fb0 = g.count('火把'); p.sta = 100; g.craft('huoshi');
    ok('v0.8.6: 燧石, a 火把 and a portion of fat make a 火蝕; the fat comes out of the 麻布包, the bag stays', g.count('火蝕') === 1 && g.count('燧石') === 1 && g.count('油脂') === oil0 - 1 && g.count('火把') === fb0 - 1 && g.count('麻布包') >= 1, [g.count('火蝕'), g.count('油脂'), g.count('火把')]);
    // 蠱雕：只在南邊（本島以南三百格外），丹穴、青丘裡不算
    const dz2 = G.zones(g.seed).find(z => z.id === '朱雀');
    put(p0.x, p0.y); const atHome = g.harpySky(); put(dz2.x, dz2.y); const atNest = g.harpySky(); put(dz2.x + 160, dz2.y - 140); const atSea = g.harpySky();
    ok('v0.8.6: the 蠱雕 flies only in the south — not at home, not over 丹穴', !atHome && !atNest && atSea, [atHome, atNest, atSea]);
    p.sailing = true; p.ship = World.newShip('孤帆'); E.harpyP = 1; for (let n = 0; n < 12 && !E.count('雕'); n++) { E.spawnAcc = 2; E.update(0.01, g); } E.harpyP = 0;
    const hp = E.list.find(o => o.type === '雕');
    ok('v0.8.6: over the southern sea a 蠱雕 comes, crying like a baby', !!hp && /蠱雕！/.test(toasts()), !!hp);
    p.san = 80; p.fearT = 0; hp.cryT = 0; hp.x = p.x + 6; hp.y = p.y; hp.moveT = 99; E.update(0.01, g);
    ok('v0.8.6: its cry is 心 — sanity −5 on normal (v0.8.9: 3／5／7) — and 懼 for two and a half breaths (1.5／2.5／4)', Math.abs(80 - p.san - U.r4(5 * g.baseTaken())) < 1e-6 && p.fearT >= 2.4 && /嬰兒/.test(g.msgText), [80 - p.san, p.fearT]);
    p.fearT = 0; hp.x = p.x + 1; hp.y = p.y; hp.mode = 'dive'; hp.moveT = 0; hp.atk = 0; hp.cryT = 99; p.hp = 100; E.update(0.01, g);
    ok('v0.8.6: diving down it claws (16, 力), then lingers before it rises', Math.abs(100 - p.hp - U.r4(16 * g.takenMult())) < 1e-6 && hp.mode === 'rise' && hp.moveT > 0.5, [100 - p.hp, hp.mode]);
    { const tr = U.trueRand; g.removeItem('蠱雕殘體', 99); U.trueRand = () => 0.5; g.kill(hp); U.trueRand = tr;
      ok('v0.8.6: a slain 蠱雕 leaves 蠱雕殘體; the 魔物誌 counts it', g.count('蠱雕殘體') === 1 && p.codex['蠱雕'] === 1 && /蠱雕斃/.test(toasts()), g.count('蠱雕殘體')); }
    p.sailing = false; p.ship = null;
    // 朱羽：九塊、精煤一、火蝕一
    { const tr = U.trueRand, kx = p0.x + 1, ky = p0.y, cnt = () => [g.count('蠱雕殘體'), g.count('精煤'), g.count('火蝕'), g.count('朱羽')].join('/');
      put(p0.x, p0.y); w.set(kx, ky, '鼎'); w.addFuel(kx, ky, 300); face(1, 0); p.sta = 100;
      g.removeItem('精煤', 99); g.removeItem('朱羽', 9); g.removeItem('蠱雕殘體', 99); g.addItem('蠱雕殘體', 9); g.addItem('精煤', 1);
      await until(() => { g.msgUntil = 0; hold('蠱雕殘體'); return /煉朱羽/.test(document.getElementById('msg').textContent); }, 1500);
      ok('v0.8.6: facing a lit 鼎 with 蠱雕殘體 in hand, the hint says what a 朱羽 needs', /煉朱羽（殘體 9\/9、精煤 1\/1、火蝕 1\/1，83%）/.test(document.getElementById('msg').textContent), document.getElementById('msg').textContent);
      U.trueRand = () => 0.9; hold('蠱雕殘體'); g.pressPlace(); g.dingMake('蠱雕殘體'); g.closeDing();
      ok('v0.8.6: a failed 朱羽 burns the coal and the 火蝕; the nine pieces come back', cnt() === '9/0/0/0' && /燒掉/.test(g.msgText), cnt());
      g.addItem('精煤', 1); g.addItem('火蝕', 1); U.trueRand = () => 0.5; hold('蠱雕殘體'); p.sta = 100; g.pressPlace(); g.dingMake('蠱雕殘體'); g.closeDing(); U.trueRand = tr;
      ok('v0.8.6: a good one (83%) makes a 朱羽', cnt() === '0/0/0/1' && /煉成一根朱羽/.test(toasts()), cnt());
      w.set(kx, ky, w.base(kx, ky)); }
    // 朱雀：丹穴四十格內現身；沒帶朱羽就飛開；帶著朱羽兩格內按 E 求教
    put(dz2.x + 8, dz2.y); E.spawnAcc = 2; E.update(0.01, g); const ph = E.list.find(o => o.type === '朱雀');
    ok('v0.8.6: near 丹穴 the 朱雀 appears', !!ph, !!ph);
    const fu = g.count('朱羽'); g.removeItem('朱羽', 9); ph.x = p.x - 3; ph.y = p.y; ph.moveT = 0; const d0 = U.cheb(ph.x, ph.y, p.x, p.y); E.update(0.01, g);
    ok('v0.8.6: without a 朱羽 it flies off when you come within five', U.cheb(ph.x, ph.y, p.x, p.y) > d0 && /飛開/.test(g.msgText), [d0, U.cheb(ph.x, ph.y, p.x, p.y)]);
    g.addItem('朱羽', fu || 1); ph.x = p.x - 2; ph.y = p.y; ph.moveT = 0; E.update(0.01, g);
    ok('v0.8.6: carrying a 朱羽 it stays', ph.x === p.x - 2 && ph.y === p.y);
    p.zhu = false; g.courSig = ''; face(-1, 0); g.pressGather(); const asked = !!g.talking && /十字星/.test(document.getElementById('talk-text').textContent) && !p.zhu; g.talkPick(0); const ring = document.getElementById('soulring'); await sleep(80);
    ok('v0.8.6: E within two tiles with a 朱羽: 朱雀 asks first (v0.8.22), then teaches 氣順 — a cross-star on the 鳳翎 third', asked && p.zhu === true && g.count('朱羽') === 0 && /求教朱雀/.test(toasts()) && ring.classList.contains('sz') && !ring.classList.contains('z') && /鳳翎（還沒斃大風；朱雀已求教，十字星）/.test(ring.title), ring.title);
    g.save(); ok('v0.8.6: having been taught by the 朱雀 is saved', JSON.parse(localStorage.getItem(XIEYI.Game.slotKey(g.slot))).player.zhu === true);
    p.zhu = zhu0; g.courSig = ''; E.list = E.list.filter(o => o.type !== '雕' && o.type !== '朱雀'); p.creatures = p.creatures.filter(c => c !== '雕' && c !== '朱雀'); delete p.codex['蠱雕'];
    for (const n of ['燧石', '火蝕', '石劍', '石鎬', '火把', '麻布包']) g.removeItem(n, 99); p.fearT = 0; put(p0.x, p0.y); }
  // ============ v0.8.5：傷害分質；鑿齒（盾）、虎符、白虎（嘯、抗震、虎魄）；死在神獸手上膽氣只掉一半 ============
  { const E = g.ents, p0 = { x: p.x, y: p.y }, DB = G.DB, cour0 = p.cour, hp0 = p.hp, bai0 = p.bai, put = (x, y) => { p.x = p.rx = x; p.y = p.ry = y; E.px = x; E.py = y; };
    E.list = E.list.filter(o => o.type !== '齒' && o.type !== '白虎');
    // 傷害分質
    p.bai = false; p.sailing = false; p.ship = null; p.swimming = false; w.set(p.x, p.y, '草');
    ok('v0.8.5: 力 is cut by armour (= takenMult), 震 is not — but nothing quakes up onto a 台, 橋, 棧 or a boat', g.kindMult('力') === g.takenMult() && g.kindMult('震') === g.baseTaken() && (() => { w.set(p.x, p.y, '台'); const k = g.kindMult('震'); w.set(p.x, p.y, '草'); return k === 0; })());
    p.bai = true; ok('v0.8.5: 白虎\'s 抗震 takes a quarter off 震', Math.abs(g.kindMult('震') - 0.75 * g.baseTaken()) < 1e-9); p.bai = false;
    p.hp = 80; const d1 = g.hurt(10, '震', { name: '白虎', big: true });
    ok('v0.8.5: hurt() takes the damage and remembers who dealt it', Math.abs(p.hp - (80 - d1)) < 1e-6 && d1 > 0 && p.lastHit.by === '白虎' && p.lastHit.big && p.lastHit.kind === '震');
    // 死在神獸手上：膽氣只掉一半；平常掉六成
    p.cour = 100; p.hp = 0.5; g.hurt(5, '震', { name: '白虎', big: true }); g.die('傷');
    ok('v0.8.5: killed by the 白虎 the death note says courage loses only four tenths (v0.8.13; it was half)', /死在白虎手上，膽氣只減四成/.test(document.getElementById('dead-text').textContent) && p.deathKeep === 0.6, document.getElementById('dead-text').textContent);
    g.respawn(); ok('v0.8.5: …and on waking courage is six tenths of what it was', p.cour === 60, p.cour);
    p.cour = 100; p.hp = 0.5; g.hurt(5, '力', { name: '狼' }); g.die('傷'); g.respawn();
    ok('v0.8.5: killed by an ordinary beast courage still falls by six tenths', Math.abs(p.cour - 40) < 1e-9, p.cour);
    p.cour = cour0; p.hp = 100; g.courSig = '';
    // 鑿齒：只在西邊的外島走出來
    const west = G.isles(g.seed).filter(i => i.cx < -350 && !G.zoneAt(i.cx, i.cy, g.seed)).sort((a, b) => b.R - a.R)[0];
    let spot = null; for (let r = 0; r < west.R && !spot; r++) for (let a = 0; a < 16 && !spot; a++) { const x = Math.round(west.cx + Math.cos(a / 8 * Math.PI) * r), y = Math.round(west.cy + Math.sin(a / 8 * Math.PI) * r); if (w.walkable(x, y) && DB[w.get(x, y)].kind !== 'water') spot = [x, y]; }
    put(p0.x, p0.y); const atHome = g.toothLand(); const tz = G.zones(g.seed).find(z => z.id === '白虎'); put(tz.x, tz.y); const atTiger = g.toothLand(); put(spot[0], spot[1]); const atWest = g.toothLand();
    ok('v0.8.5: the 鑿齒 only comes out on the western outer isles — not at home, not on 虎嶺', !atHome && !atTiger && atWest, [atHome, atTiger, atWest, west.name, west.cx]);
    E.toothP = 1; for (let n = 0; n < 12 && !E.count('齒'); n++) { E.spawnAcc = 2; E.update(0.01, g); } E.toothP = 0;
    ok('v0.8.5: on a western isle a 鑿齒 walks out, with a toast about the chisel sound and its shield', E.count('齒') === 1 && /鑿齒！/.test(toasts()) && /盾/.test(toasts()), E.count('齒'));
    // 盾：正面只吃一成，側面全吃；牠只撞得到正面的人
    E.list = E.list.filter(o => o.type !== '齒'); w.set(p.x + 1, p.y, '草'); w.set(p.x, p.y + 1, '草');
    const tt = E.add('齒', p.x + 1, p.y, { fx: -1, fy: 0, turnT: 99, moveT: 99 }); g.addItem('石劍', 1); hold('石劍'); p.sta = 100;
    let h0 = tt.hp; p.atkT = 0; g.attack(tt); const front = h0 - tt.hp;
    ok('v0.8.5: hitting the 鑿齒 from in front lands on the 盾 — a tenth of the damage', Math.abs(front - U.r4(G.ITEMS['石劍'].dmg * g.dmgMult() * 0.1)) < 1e-6 && /盾上/.test(g.msgText), [front, g.msgText]);
    tt.fx = 0; tt.fy = 1; h0 = tt.hp; p.atkT = 0; g.attack(tt); const side = h0 - tt.hp;
    ok('v0.8.5: from its side the blow goes round the shield — full damage', Math.abs(side - front * 10) < 1e-3 && /繞過盾/.test(g.msgText), [side, front]);
    p.hp = 100; tt.atk = 0; tt.moveT = 0; tt.turnT = 99; E.update(0.01, g); const sideHp = p.hp;
    tt.fx = -1; tt.fy = 0; tt.atk = 0; tt.moveT = 0; E.update(0.01, g); const frontHp = p.hp;
    ok('v0.8.6: it can only ram you when you stand in front of it (21, 力; 命 650)', DB['齒'].atk === 21 && DB['齒'].hp === 650 && sideHp === 100 && frontHp < 100 && Math.abs(100 - frontHp - U.r4(21 * g.takenMult())) < 1e-6, [sideHp, frontHp]);
    tt.fx = 0; tt.fy = 1; tt.turnT = 0.01; E.update(0.05, g); ok('v0.8.5: it turns to face you, a breath or so at a time', tt.fx === -1 && tt.fy === 0, [tt.fx, tt.fy]);
    // 斃之：殘體一或二塊
    { const tr = U.trueRand; g.removeItem('鑿齒殘體', 99); U.trueRand = () => 0.5; g.kill(tt); const one = g.count('鑿齒殘體'); U.trueRand = () => 0.1; g.kill(E.add('齒', p.x + 3, p.y + 3, { moveT: 99 })); U.trueRand = tr;
      ok('v0.8.5: a slain 鑿齒 leaves one 鑿齒殘體 (64%) or two (36%); the 魔物誌 counts it', one === 1 && g.count('鑿齒殘體') === 3 && p.codex['鑿齒'] === 2 && /鑿齒斃/.test(toasts()), [one, g.count('鑿齒殘體')]); }
    // 虎符：九塊、鐵三、鎢鋼一，火旺的鼎；八成三成
    { const tr = U.trueRand, kx = p.x + 1, ky = p.y, cnt = () => [g.count('鑿齒殘體'), g.count('鐵'), g.count('鎢鋼'), g.count('虎符')].join('/');
      w.set(kx, ky, '鼎'); w.addFuel(kx, ky, 300); face(1, 0); p.sta = 100;
      g.removeItem('鐵', 99); g.removeItem('鎢鋼', 99); g.removeItem('虎符', 9); g.removeItem('鑿齒殘體', 99); g.addItem('鑿齒殘體', 9); g.addItem('鐵', 3); hold('鑿齒殘體'); g.pressPlace(); g.dingMake('鑿齒殘體'); g.closeDing();
      ok('v0.8.5: without the 鎢鋼 nothing is used up', cnt() === '9/3/0/0' && /鎢鋼/.test(g.msgText), [cnt(), g.msgText]);
      g.addItem('鎢鋼', 1); await until(() => { g.msgUntil = 0; return /鑄虎符/.test(document.getElementById('msg').textContent); }, 1500); const hint = document.getElementById('msg').textContent;   // 雨停之類的訊息可能剛好蓋過去：等提示列換回來
      ok('v0.8.5: facing a lit 鼎 with 鑿齒殘體 in hand, the hint says what a 虎符 needs', /鑄虎符（殘體 9\/9、鐵 3\/3、鎢鋼 1\/1，83%）/.test(hint), hint);
      U.trueRand = () => 0.9; hold('鑿齒殘體'); g.pressPlace(); g.dingMake('鑿齒殘體'); g.closeDing();
      ok('v0.8.5: a failed casting melts the iron and 鎢鋼; the nine pieces come back', cnt() === '9/0/0/0' && /熔掉/.test(g.msgText), cnt());
      g.addItem('鐵', 3); g.addItem('鎢鋼', 1); U.trueRand = () => 0.5; hold('鑿齒殘體'); p.sta = 100; g.pressPlace(); g.dingMake('鑿齒殘體'); g.closeDing(); U.trueRand = tr;
      ok('v0.8.5: a good casting (83%) makes one 虎符', cnt() === '0/0/0/1' && /鑄成一枚虎符/.test(toasts()), cnt());
      w.set(kx, ky, w.base(kx, ky)); }
    // 白虎：虎嶺四十格內現身；沒帶虎符走近六格就嘯（震）；求教得抗震、虎魄
    put(tz.x + 5, tz.y); w.set(p.x, p.y, '草'); E.list = E.list.filter(o => o.type !== '白虎'); E.spawnAcc = 2; E.update(0.01, g);
    const bh = E.list.find(o => o.type === '白虎');
    ok('v0.8.5: near 虎嶺 the 白虎 appears at the heart of the island', !!bh && U.cheb(bh.x, bh.y, tz.x, tz.y) <= 3, bh && [bh.x, bh.y]);
    const fu = g.count('虎符'); g.removeItem('虎符', 9); p.hp = 100; bh.roarT = 0; E.update(0.01, g);
    const roared = 100 - p.hp, roarMsg = g.msgText;
    ok('v0.8.5: without a 虎符, inside six tiles it roars — 震, six on normal, and asks for the tally', Math.abs(roared - U.r4(6 * g.baseTaken())) < 1e-6 && /震/.test(roarMsg) && /拿虎符來/.test(roarMsg), [roared, roarMsg]);
    w.set(p.x, p.y, '台'); p.hp = 100; bh.roarT = 0; E.update(0.01, g);
    ok('v0.8.5: standing on a 台 the quake does not reach you', p.hp === 100 && /震不上來/.test(g.msgText), g.msgText); w.set(p.x, p.y, '草');
    g.addItem('虎符', fu || 1); p.hp = 100; bh.roarT = 0; E.update(0.01, g);
    ok('v0.8.5: carrying a 虎符, it does not roar', p.hp === 100);
    put(bh.x + 2, bh.y); w.set(p.x, p.y, '草'); p.bai = false; g.courSig = ''; g.pressGather(); const asked = !!g.talking && /抗震/.test(document.getElementById('talk-text').textContent) && !p.bai; g.talkPick(0);
    const ring = document.getElementById('soulring'); await sleep(80);
    ok('v0.8.5: E within two tiles with a 虎符: 白虎 asks first (v0.8.22), then teaches 抗震 — a cross-star on the 虎魄 third', asked && p.bai === true && g.count('虎符') === 0 && /求教白虎/.test(toasts()) && ring.classList.contains('sb') && /虎魄（還沒斃封豨；白虎已求教，十字星）/.test(ring.title), ring.title);
    g.save(); const sv = JSON.parse(localStorage.getItem(XIEYI.Game.slotKey(g.slot)));
    ok('v0.8.5: having been taught by the 白虎 is saved', sv.player.bai === true);
    p.bai = bai0; p.hp = hp0; g.courSig = ''; E.list = E.list.filter(o => o.type !== '白虎' && o.type !== '齒'); g.removeItem('鑿齒殘體', 99); g.removeItem('石劍', 9); p.creatures = p.creatures.filter(c => c !== '齒' && c !== '白虎'); delete p.codex['鑿齒']; put(p0.x, p0.y); }
  // ============ v0.8.4：四方地界（照規則種）；蜃碎片改叫蜃殘體 ============
  { const E = g.ents, p0 = { x: p.x, y: p.y }, zs = G.zones(g.seed), zone = (id) => zs.find(z => z.id === id), DB = G.DB, zones0 = p.zones, cour0 = p.cour;
    ok('v0.8.4: eight places on the four sides of the paper, each on its own side', zs.length === 8 && zone('青龍').x > 400 && zone('修蛇').x > 800 && zone('白虎').x < -400 && zone('封豨').x < -800 && zone('朱雀').y > 400 && zone('大風').y > 800 && zone('玄武').y < -400 && zone('共工').x < -700 && zone('共工').y < -700 && zs.map(z => z.name).join('') === '不周山洞庭桑林青丘龍淵虎嶺丹穴玄洲', zs.map(z => z.name + '(' + z.x + ',' + z.y + ')'));
    const ring = (z, r, test) => { let bad = 0; for (let a = 0; a < 64; a++) for (const k of [0.3, 0.7, 1]) { const x = Math.round(z.x + Math.cos(a / 64 * 2 * Math.PI) * r * k), y = Math.round(z.y + Math.sin(a / 64 * 2 * Math.PI) * r * k); if (!test(w.get(x, y))) bad++; } return bad; };
    const az = zone('青龍'), dt = zone('修蛇'), sl = zone('封豨'), bz = zone('共工');
    ok('v0.8.4: the 東海青龍 sits at the heart of 龍淵, nothing but water for 49 tiles around', g.azure.x === az.x && g.azure.y === az.y && w.get(az.x, az.y) === '淼' && ring(az, 49, (t) => DB[t].kind === 'water') === 0);
    ok('v0.8.4: 洞庭 is a fresh lake (湖) for 49 tiles around its heart, ringed by reefs', w.get(dt.x, dt.y) === '湖' && ring(dt, 49, (t) => t === '湖') === 0 && [...Array(360)].some((_, a) => [57, 59, 61].some(r => DB[w.get(Math.round(dt.x + Math.cos(a * Math.PI / 180) * r), Math.round(dt.y + Math.sin(a * Math.PI / 180) * r))].kind !== 'water')));
    ok('v0.8.4: 桑林\'s heart is solid walkable ground for 38 tiles around', ring(sl, 38, (t) => DB[t].walk > 0 && DB[t].kind !== 'water') === 0);
    ok('v0.8.5: 不周山 (radius 120) is land for 102 tiles around, with a ring of mountains round a basin', bz.r === 120 && bz.solid === 102 && ring(bz, 102, (t) => DB[t].kind !== 'water') === 0 && DB[w.get(bz.x, bz.y)].walk > 0 && ['山', '煤', '鐵', '磊'].indexOf(w.get(bz.x - 52, bz.y)) >= 0);
    // 登上桑林：記下來、長膽氣、狀態列寫地名
    p.inBoss = { '封豨': true };   // 桑林在封豨的地界裡（v0.8.7）：當作已經答過「進去」，這裡只測登島
    p.zones = {}; p.x = p.rx = sl.x; p.y = p.ry = sl.y; w.set(p.x, p.y, '草'); E.px = p.x; E.py = p.y; p.sailing = false; p.ship = null; p.swimming = false; const c0 = p.cour; g.updateStats(0.05);
    ok('v0.8.4: landing on 桑林 the first time: noted, courage up, and the 淮南子 line on it', p.zones['封豨'] === 1 && p.cour > c0 && /登上桑林/.test(toasts()) && /禽封豨於桑林/.test(toasts()) && /^桑林 · /.test(g.placeName()), [p.cour - c0, g.placeName()]);
    const c1 = p.cour; g.updateStats(0.05); ok('v0.8.4: …only the first time', p.cour === c1);
    // 開船進洞庭：狀態列寫「船上 · 洞庭」，進了湖才算到了
    p.inBoss['修蛇'] = true;   // 洞庭在修蛇的地界裡（v0.8.16）：當作已經答過「進去」，這裡只測到了洞庭
    p.x = p.rx = dt.x + 20; p.y = p.ry = dt.y; E.px = p.x; E.py = p.y; p.sailing = true; p.ship = World.newShip('孤帆'); g.updateStats(0.05); g.statusSig = ''; await sleep(400);
    ok('v0.8.4: sailing into 洞庭 counts as arriving; the status bar reads 船上 · 洞庭', p.zones['修蛇'] === 1 && /到了洞庭/.test(toasts()) && /船上 · 洞庭/.test(document.getElementById('status').textContent), document.getElementById('status').textContent);
    // 大地圖：到過的地界寫名字（畫得出來不出錯）
    g.toggleMap(); await sleep(150); const mv = g.renderer.mapView; g.toggleMap();
    ok('v0.8.4: the big map stretches out to 洞庭 once sailed there', !!mv && mv.ox + mv.N >= dt.x && mv.ox <= 0, mv);
    // 存讀檔：到過哪些地界記得住；舊存檔沒有 zoneNews 就說一聲紙的四方，蜃碎片改叫蜃殘體
    p.sailing = false; p.ship = null; p.x = p.rx = p0.x; p.y = p.ry = p0.y; E.px = p.x; E.py = p.y;
    g.save(); const sv = JSON.parse(localStorage.getItem(XIEYI.Game.slotKey(g.slot)));
    const old = JSON.parse(JSON.stringify(sv)); delete old.player.zones; delete old.player.zoneNews; old.player.bag = old.player.bag.concat([{ n: '蜃碎片', c: 5 }]);
    g.load(old);
    ok('v0.8.4: an old save hears about the four sides of the paper; its 蜃碎片 are now 蜃殘體', /紙的四方/.test(toasts()) && /不周山/.test(toasts()) && g.count('蜃殘體') >= 5 && g.count('蜃碎片') === 0 && p.zoneNews === true, g.count('蜃殘體'));
    g.load(sv);
    ok('v0.8.4: the places visited are kept across a save', p.zones && p.zones['封豨'] === 1 && p.zones['修蛇'] === 1);
    g.removeItem('蜃殘體', 99); p.inBoss = {}; p.zones = zones0 || {}; p.cour = cour0; g.courSig = ''; p.x = p.rx = p0.x; p.y = p.ry = p0.y; E.px = p.x; E.py = p.y; }
  // ============ v0.8.3：魂環隔開、玄武四顆珠；水性減半；船一艘一欄（兩格／五格）、落水放船下水；魔物誌十二張 ============
  { const E = g.ents, p0 = { x: p.x, y: p.y }, az = g.azure, az0 = p.azure, ring = document.getElementById('soulring'), bag0 = p.bag.slice();
    const rs = getComputedStyle(ring), mw = document.getElementById('mapwrap').getBoundingClientRect(), rr = ring.getBoundingClientRect();
    ok('v0.8.3: the soul ring sits about twelve points outside the courage ring (6-point band, 12-point gap)', rs.paddingTop === '18px' && Math.abs((mw.left - rr.left) - 18) < 1.5 && /radial-gradient/.test(getComputedStyle(ring, '::before').maskImage || getComputedStyle(ring, '::before').webkitMaskImage), [rs.paddingTop, mw.left - rr.left]);
    const beads = document.querySelectorAll('#jingbeads i');
    ok('v0.8.3: four beads (v0.8.21: 封豨、大風、修蛇、共工), all small grey dots until challenged', beads.length === 4 && [...beads].every(b => /^none$|^last none$|^none last$/.test(b.className) || b.className === 'none') && /封豨（還沒挑戰）、大風（還沒挑戰）、修蛇（還沒挑戰）、共工（還沒挑戰）/.test(document.getElementById('jingbeads').title), [...beads].map(b => b.className));
    { const st = document.getElementById('status').getBoundingClientRect(), br = document.getElementById('jingbeads').getBoundingClientRect(), r = [...beads].map(b => b.getBoundingClientRect());
      ok('v0.8.22: the beads sit in a row of their own — below the status line, above the ring, apart from both; the fourth stands off from the first three', br.top >= st.bottom + 6 && rr.top >= br.bottom + 6 && Math.abs(r[0].top - r[3].top) < 1 && (r[3].left - r[2].right) > (r[1].left - r[0].right) + 12 && document.getElementById('jingbeads').parentElement.id === 'topright', [br.top - st.bottom, rr.top - br.bottom, r[3].left - r[2].right, r[1].left - r[0].right]); }
    { const bs0 = p.bosses; p.bosses = { '封豨': { jing: true, day: 1 }, '修蛇': { jing: false, day: 2 } }; g.courSig = ''; await sleep(80);
      ok('v0.8.21: beads by boss — 封豨 slain with its scroll a vermilion dot, 修蛇 slain without one a black cross, 大風 still grey; both thirds of the ring in full colour', beads[0].className === 'won' && beads[1].className === 'none' && beads[2].className === 'miss' && beads[3].className === 'none' && /封豨（拿著經斃了）/.test(document.getElementById('jingbeads').title) && ring.classList.contains('b') && ring.classList.contains('q') && !ring.classList.contains('z'), [...beads].map(b => b.className));
      p.bosses = { '封豨': { jing: true, day: 1 }, '修蛇': { jing: false, day: 2 }, '大風': { jing: true, day: 3 } }; g.courSig = ''; await sleep(80);
      ok('v0.8.22: all three rings won — the fourth bead (共工) turns to a grey question mark', g.beadOf('共工') === 'ask' && beads[3].classList.contains('ask') && /共工（三個魂環集齊了/.test(document.getElementById('jingbeads').title), beads[3].className);
      p.jingFor = '共工'; g.courSig = ''; await sleep(80); const got = beads[3].classList.contains('got'); p.jingFor = null;
      p.fight = { id: '共工', jing: false }; const bk = g.beadOf('共工'); p.fight = null;   // 共工還沒寫成（沒有地界），不能真的掛著戰事跑一幀
      beads[3].className = bk; const bl = bk === 'fightNo blink' && /bead-blink/.test(getComputedStyle(beads[3]).animationName); g.courSig = '';
      ok('v0.8.22: …holding 共工\'s scroll a red dot; fighting 共工 without it a blinking black question mark (共工 is not written yet; only the rule)', got && bl, beads[3].className);
      p.bosses = bs0; }
    g.courSig = ''; p.azure = true; await sleep(80);
    ok('v0.8.3: the soul-ring thirds are called 龍魂, 鳳翎, 虎魄 (v0.8.22: taught by 青龍 is a cross-star on 龍魂, not a colour)', /龍魂（還沒斃修蛇；青龍已求教，十字星）/.test(ring.title) && /鳳翎/.test(ring.title) && /虎魄/.test(ring.title) && ring.classList.contains('sq') && !ring.classList.contains('q'), ring.title);
    ok('v0.8.22: the three thirds of the ring show gaps between them, each outlined on its own', /conic-gradient/.test(getComputedStyle(ring, '::before').backgroundImage) && /transparent|rgba\(0, 0, 0, 0\)/.test(getComputedStyle(ring, '::before').backgroundImage) && /conic-gradient/.test(getComputedStyle(ring, '::after').backgroundImage), getComputedStyle(ring, '::before').backgroundImage.slice(0, 120));
    // 水性：落水的減益減半
    p.x = p.rx = az.x - 30; p.y = p.ry = az.y; E.px = p.x; E.py = p.y; p.sailing = false; p.ship = null; p.swimming = true; p.swimT = 30;
    p.azure = false; const d0 = g.ironDrain() / (1 + 0.08 * g.ironCount() / 3), m0 = g.dmgMult(); let st0 = p.sta = 80; g.updateStats(1); const f0 = st0 - p.sta;
    p.azure = true; const d1 = g.ironDrain() / (1 + 0.08 * g.ironCount() / 3), m1 = g.dmgMult(); st0 = p.sta = 80; g.updateStats(1); const f1 = st0 - p.sta;
    ok('v0.8.3: with 水性 the swimming penalties are halved — drains ×1.5 not ×2, weapons ×0.875 not ×0.75, strength falls half as fast', Math.abs(d0 - 2) < 1e-6 && Math.abs(d1 - 1.5) < 1e-6 && Math.abs(m1 / m0 - 0.875 / 0.75) < 1e-6 && f1 < f0 && Math.abs(f0 - f1 - 0.25) < 0.05, [d0, d1, m1 / m0, f0, f1]);
    // v0.8.19 船艙：船不佔囊，最多帶三艘
    p.bag = []; p.hold = []; p.holdSel = -1; g.addItem('孤帆', 2); g.addItem('方舟', 1);
    ok('v0.8.19: ships go into the hold, not the bag — two 孤帆 and a 方舟 are three entries there and the bag stays empty', p.hold.length === 3 && p.bag.length === 0 && g.bagUsed() === 0 && g.count('孤帆') === 2 && g.count('方舟') === 1, [p.hold.map(s => s.n), g.bagUsed()]);
    ok('v0.8.19: the hold takes three at most — a fourth is refused', !g.canAdd('孤帆', 1) && g.addItem('孤帆', 1) === 1 && p.hold.length === 3);
    g.holdSig = ''; g.buildHold(); const hrows = document.querySelectorAll('#hold .hrow');
    ok('v0.8.19: the hold panel (bottom right) lists each ship with its hp, skulls and repairs', !document.getElementById('hold').classList.contains('hidden') && hrows.length === 3 && /命 120\/120/.test(hrows[0].textContent) && /船頭空著/.test(hrows[0].textContent) && /修 0\/4/.test(hrows[0].textContent) && /修 0\/3/.test(hrows[2].textContent) && /船艙 3\/3/.test(document.getElementById('hold').textContent), document.getElementById('hold').textContent);
    hrows[2].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); const clicked = p.holdSel;
    await press('KeyB', 20); const b1 = p.holdSel; await press('KeyB', 20); const b2 = p.holdSel;
    ok('v0.8.19: clicking a row selects that ship; B steps through them (and back to none)', clicked === 2 && b1 === -1 && b2 === 0, [clicked, b1, b2]);
    // 落水放船下水：一般撐四息，一動就重來，一回最多三艘
    p.bag = []; p.hold = []; g.addItem('孤帆', 1); g.addItem('方舟', 1); hold('孤帆'); p.swimShips = 0; p.deploy = null; g.pressPlace();
    ok('v0.8.3: swimming with a 孤帆 in hand, F starts setting it down — four breaths on normal', !!p.deploy && p.deploy.n === '孤帆' && Math.abs(p.deploy.t - 4) < 1e-6 && /撐住孤帆/.test(g.msgText), p.deploy);
    p.x += 1; g.tickDeploy(0.1); ok('v0.8.3: moving lets the hull drift off — start over', !p.deploy && /重新撐/.test(g.msgText)); p.x -= 1; p.rx = p.x;
    hold('孤帆'); g.pressPlace(); g.tickDeploy(4.01);
    ok('v0.8.3: after four breaths you are aboard a fresh 孤帆; the item is gone; one of three used', p.sailing && !p.swimming && p.ship && p.ship.kind === '孤帆' && p.ship.hp === 120 && g.count('孤帆') === 0 && p.swimShips === 1 && /上了船/.test(toasts()));
    p.sailing = false; p.ship = null; p.swimming = true; p.swimT = 30; p.swimShips = 3; hold('方舟'); g.pressPlace();
    ok('v0.8.3: three ships per fall — the fourth is refused', !p.deploy && /放過 3 艘/.test(g.msgText) && g.count('方舟') === 1, g.msgText);
    const dk = g.diff; g.diff = XIEYI.DIFF.easy; p.swimShips = 0; g.pressPlace(); const te = p.deploy && p.deploy.t; p.deploy = null; g.diff = XIEYI.DIFF.hard; g.pressPlace(); const th = p.deploy && p.deploy.t; p.deploy = null; g.diff = dk;
    ok('v0.8.3: easy three breaths, hard five', te === 3 && th === 5, [te, th]);
    // v0.8.17 放船、上船、在船上走、1234 開船；v0.8.18 孤帆二乘二、方舟三乘三、F 收船、沙洲漲潮過船（使用者定）：在本島外的海上圍一塊地方試
    {
      const keep = { x: p.x, y: p.y, cour: p.cour, bag: p.bag, sel: p.sel }, X = g.spawn.x + 300, Y = g.spawn.y + 300;
      p.swimming = false; p.swimT = 0; p.deploy = null; p.sailing = false; p.ship = null; p.swimShips = 0; g.keys.clear(); p.moveT = 0;
      const clearShips = () => { for (const k of [...w.ships.keys()]) { const rr = w.ships.get(k); if (rr.cells.some(([x, y]) => Math.abs(x - X) <= 9 && Math.abs(y - Y) <= 9)) w.removeShip(k); } };
      const sea = (t) => { clearShips(); for (let dx = -7; dx <= 7; dx++) for (let dy = -8; dy <= 7; dy++) w.set(X + dx, Y + dy, dy <= -1 ? t : '草'); g.ents.list = g.ents.list.filter(e => U.cheb(e.x, e.y, X, Y) > 10); };
      p.x = p.rx = X; p.y = p.ry = Y; p.bag = []; keep.hold = p.hold; p.hold = []; g.addItem('孤帆', 1); g.addItem('方舟', 1); p.cour = g.levelAt(31);
      sea('淼'); const ships0 = w.ships.size; w.set(X - 1, Y - 3, '石'); face(0, -1); hold('孤帆'); g.pressPlace();
      ok('v0.8.17: one rock anywhere in the 3×3 in front — even off the hull — and the ship will not go down', w.ships.size === ships0 && g.count('孤帆') === 1 && /三乘三/.test(g.msgText), g.msgText);
      w.set(X - 1, Y - 3, '淼'); g.pressPlace(); const r1 = w.shipAt(X, Y - 1);
      ok('v0.8.21: deep water counts; a 孤帆 is one by two — facing north it runs north–south from the tile in front', !!r1 && r1.cells.length === 2 && w.shipAt(X, Y - 2) === r1 && !w.shipAt(X + 1, Y - 1) && !w.shipAt(X, Y - 3) && r1.dir === 'v' && g.count('孤帆') === 0, r1 && JSON.stringify(r1.cells));
      g.tryStep(0, -1);
      ok('v0.8.17: walking onto the parked ship boards it, standing on the tile you stepped on', p.sailing && p.x === X && p.y === Y - 1 && p.ship.x0 === X && p.ship.y0 === Y - 2 && !w.shipAt(X, Y - 1), [p.x - X, p.y - Y, p.ship && p.ship.x0 - X, p.ship && p.ship.y0 - Y]);
      const walked = g.tryStep(0, -1);
      ok('v0.8.17: on board W walks you along the deck like on land; the ship stays put', walked && p.y === Y - 2 && p.ship.y0 === Y - 2 && Math.abs(p.stepDur - 0.17 / g.ironSpeed()) < 1e-6, [p.y - Y, p.ship.y0 - Y, p.stepDur]);
      ok('v0.8.17: walking off the deck into the water is not allowed', !g.tryStep(0, -1) && !g.tryStep(-1, 0) && p.sailing && p.y === Y - 2 && p.x === X);
      const key = async (k) => { await until(() => p.moveT <= 0, 2000); await press(k, 50); await until(() => p.moveT <= 0, 2000); };
      await key('Digit2');
      ok('v0.8.17: key 2 moves the whole ship (and you) north one tile', p.ship.y0 === Y - 3 && p.y === Y - 3 && p.ship.x0 === X, [p.ship.y0 - Y, p.y - Y]);
      await key('Digit4'); const east = p.ship.x0 - X; await key('Digit1'); const west = p.ship.x0 - X; await key('Digit3');
      ok('v0.8.17: 4 east, 1 west, 3 south (v0.8.21: 1 and 4 lay it east–west, 2 and 3 north–south, turning on the tile you stand on)', east === 1 && west === 0 && p.ship.y0 === Y - 2 && p.x === X && p.ship.dir === 'v', [east, west, p.ship.y0 - Y, p.ship.dir]);
      const sel0 = p.sel; await key('Digit3');
      ok('v0.8.17: the hull cannot run onto land — it stops at the shore', p.ship.y0 === Y - 2 && /靠岸/.test(g.msgText) && p.sel === sel0, [p.ship.y0 - Y, g.msgText]);
      g.tryStep(0, 1); g.tryStep(0, 1); const r2 = w.shipAt(X, Y - 2);
      ok('v0.8.17: walking off onto land leaves the ship parked right where it was', !p.sailing && !p.ship && p.y === Y && !!r2 && w.shipAt(X, Y - 1) === r2 && /下了船/.test(g.msgText), [p.y - Y, g.msgText]);
      g.addItem('石', 3); g.addItem('木', 3); p.sel = 0; await press('Digit2', 40);
      ok('v0.8.17: on land the number keys no longer pick bag slots (nor move anything)', p.sel === 0 && !p.sailing && p.y === Y && w.shipAt(X, Y - 2) === r2);
      // v0.8.18 F 收船：岸上面向它按 F 收回（命、首骨跟著）；船上碰到岸按 F 連人帶船收回；茫茫海上收不回
      r2.hp = 77; r2.skulls = [['狼首骨', w.time + 5 * DAY]]; face(0, -1); g.pressPlace();
      ok('v0.8.19: F on a parked ship first asks 收船？', !hidden('takeask') && /收船/.test(document.querySelector('#takeask h2').textContent) && !!w.shipAt(X, Y - 1));
      takeYes();
      const stowed = p.hold.find(x => x.n === '孤帆');
      ok('v0.8.18: facing the parked ship, F takes it back (into the hold, v0.8.19) with its hp and skulls; the water is water again', !w.shipAt(X, Y - 1) && w.get(X, Y - 1) === '淼' && !!stowed && stowed.ship && stowed.ship.hp === 77 && stowed.ship.skulls.length === 1 && /收回/.test(g.msgText), [stowed && JSON.stringify(stowed.ship), g.msgText]);
      g.barSig = ''; g.buildBag(); g.holdSig = ''; g.buildHold();
      ok('v0.8.19: the hold shows the ship\'s own hp (77/120) and skulls; the bag cells carry no number keys', /命 77\/120/.test(document.getElementById('hold').textContent) && /骨 狼/.test(document.getElementById('hold').textContent) && !document.querySelector('#bagbar .slot .num'), document.getElementById('bagbar').textContent.slice(0, 80));
      hold('孤帆'); g.pressPlace(); const r4 = w.shipAt(X, Y - 1);
      ok('v0.8.18: F again puts the same ship back on the water — hp and skulls as they were', !!r4 && r4.hp === 77 && r4.skulls.length === 1 && g.count('孤帆') === 0, r4 && [r4.hp, r4.skulls.length]);
      g.tryStep(0, -1); p.moveT = 0; g.shipStep(0, -1); p.moveT = 0; g.shipStep(0, -1); p.moveT = 0; g.shipStep(0, -1); p.moveT = 0;
      g.pressPlace();
      ok('v0.8.18: out on open water F cannot stow the ship — it must touch the shore', p.sailing && !!p.ship && g.count('孤帆') === 0 && /茫茫海上/.test(g.msgText), g.msgText);
      g.shipStep(0, 1); p.moveT = 0; g.shipStep(0, 1); p.moveT = 0; g.shipStep(0, 1); p.moveT = 0;
      g.pressPlace(); takeYes();
      ok('v0.8.18: back against the shore, F aboard stows the ship and sets you on the nearest land (straight ahead, not a corner)', !p.sailing && !p.ship && g.count('孤帆') === 1 && p.x === X && p.y === Y && !w.shipAt(X, Y - 1), [p.x - X, p.y - Y, w.get(p.x, p.y)]);
      p.x = p.rx = X; p.y = p.ry = Y;
      // 方舟：面朝西，三乘三正好蓋滿面前的三乘三；甲板九格都走得到
      sea('湖'); for (let dx = 1; dx <= 3; dx++) for (let dy = -1; dy <= 1; dy++) w.set(X - dx, Y + dy, '湖');
      face(-1, 0); hold('方舟'); g.pressPlace(); const r3 = w.shipAt(X - 1, Y);
      ok('v0.8.21: lakes count too; a 方舟 is two by three — facing west it lies east–west, three long', !!r3 && r3.cells.length === 6 && w.shipAt(X - 3, Y + 1) === r3 && w.shipAt(X - 1, Y) === r3 && !w.shipAt(X - 1, Y - 1) && !w.shipAt(X - 4, Y) && r3.dir === 'h', r3 && JSON.stringify(r3.cells));
      g.pressGather(); await sleep(250);
      const diag = g.tryStep(-1, 1), back = g.tryStep(-1, 0);
      ok('v0.8.17: E boards it too; aboard a 方舟 you can walk anywhere on its deck', p.sailing && diag && back && p.x === X - 3 && p.y === Y + 1 && p.ship.x0 === X - 3 && p.ship.y0 === Y, [p.x - X, p.y - Y]);
      g.save(); const sv2 = JSON.parse(localStorage.getItem(XIEYI.Game.slotKey(g.slot)));
      ok('v0.8.17: the hull position is saved', sv2.player.ship.x0 === X - 3 && sv2.player.ship.y0 === Y && sv2.player.ship.dir === 'h');
      const ps = p.ship; p.ship = { kind: '方舟', hp: 300, skulls: [], repairs: 0 };
      ok('v0.8.18: an old save aboard a 方舟 (no hull position) stands you on its left-middle tile (v0.8.21: of a 2×3)', g.shipCells().length === 6 && p.ship.x0 === p.x && p.ship.y0 === p.y - 1 && g.onDeck(p.x + 1, p.y + 1) && !g.onDeck(p.x + 2, p.y));
      p.ship = ps; const j0 = [p.ship.x0, p.ship.y0]; g.jumpTo(p.x, p.y - 2);
      ok('v0.8.17: sent back out of a boss ground, the ship comes along with you', p.ship.x0 === j0[0] && p.ship.y0 === j0[1] - 2 && g.onDeck(p.x, p.y));
      // v0.8.19 共邊、船艙滿、修船、深水、7/8/9
      p.sailing = false; p.ship = null; p.hold = []; p.holdSel = -1; sea('淼'); p.x = p.rx = X; p.y = p.ry = Y; g.addItem('孤帆', 1); face(0, -1); hold('孤帆'); g.pressPlace();
      const r6 = w.shipAt(X, Y - 1); p.x = p.rx = X - 1; p.y = p.ry = Y;
      ok('v0.8.19: you cannot step onto a ship across a corner', !g.tryStep(1, -1) && !p.sailing && /斜著/.test(g.msgText), g.msgText);
      p.x = p.rx = X + 1; face(-1, -1); g.pressGather(); await sleep(50);
      ok('v0.8.19: nor board it with E while facing it across a corner', !p.sailing && !!w.shipAt(X, Y - 1));
      p.x = p.rx = X; face(0, -1); g.pressGather(); await sleep(250); p.moveT = 0; g.shipStep(0, -1); p.moveT = 0; g.shipStep(0, -1); p.moveT = 0;
      w.set(X + 1, Y - 2, '草'); g.pressPlace();
      ok('v0.8.19: land only at a corner of the hull is not a shore — F aboard cannot stow', p.sailing && g.landBeside(g.shipCells()).length === 0 && /茫茫海上/.test(g.msgText), [g.shipCells().join(';'), g.msgText]);
      w.set(X + 1, Y - 2, '淼');
      p.moveT = 0; g.shipStep(0, 1); p.moveT = 0; g.shipStep(0, 1); p.moveT = 0;
      ok('v0.8.19: aboard and touching the shore by an edge — you cannot walk off across a corner', !g.tryStep(-1, 1) && p.sailing, [p.x - X, p.y - Y]);
      g.addItem('方舟', 1); g.addItem('孤帆', 1); g.addItem('孤帆', 1); g.pressPlace();
      ok('v0.8.19: with three ships already in the hold, F aboard says the hold is full and keeps sailing', p.sailing && /船艙滿了/.test(g.msgText) && hidden('takeask'), g.msgText);
      p.hold = [];
      // 修船：孤帆四次、方舟三次
      const fx0 = g.diff; g.diff = XIEYI.DIFF.normal; p.ship.hp = 30; p.ship.repairs = 0; trim([]); g.addItem('木板', 30); g.addItem('鐵', 20); g.addItem('鎢鋼', 3);
      document.getElementById('craft').classList.remove('hidden'); g.buildCraft(); const fixRow = document.querySelector('#craft-list .recipe.shipfix');
      ok('v0.8.19: aboard, the craft panel (C) starts with a row to mend this ship', !!fixRow && /修孤帆/.test(fixRow.textContent) && /木板/.test(fixRow.textContent), fixRow && fixRow.textContent);
      fixRow.querySelector('button').click(); document.getElementById('craft').classList.add('hidden');
      ok('v0.8.19: the first mend of a 孤帆 takes two planks and brings it to 90% (108/120)', p.ship.hp === 108 && p.ship.repairs === 1 && g.count('木板') === 28, [p.ship.hp, p.ship.repairs, g.count('木板')]);
      g.repairShip(p.ship); ok('v0.8.19: above 90% there is nothing to mend', p.ship.repairs === 1 && /用不著修/.test(g.msgText));
      const mats = []; for (let k = 2; k <= 4; k++) { p.ship.hp = 20; const b0 = g.count('木板'), i0 = g.count('鐵'), t0 = g.count('鎢鋼'); g.repairShip(p.ship); mats.push([b0 - g.count('木板'), i0 - g.count('鐵'), t0 - g.count('鎢鋼')].join('/')); }
      p.ship.hp = 20; g.repairShip(p.ship);
      ok('v0.8.19: mends two to four take 4 planks + 1 iron, 5 + 3, 7 + 5 + 1 tungsten; a fifth is refused', mats.join(' ') === '4/1/0 5/3/0 7/5/1' && p.ship.hp === 20 && /修不了了/.test(g.msgText), [mats, g.msgText]);
      g.addItem('木板', 30); g.addItem('鐵', 20); g.addItem('鎢鋼', 2);
      g.diff = XIEYI.DIFF.hard; const arc = { kind: '方舟', hp: 50, skulls: [], repairs: 0 }; g.repairShip(arc); const a1 = [arc.hp, arc.repairs];
      g.diff = XIEYI.DIFF.normal; arc.hp = 50; g.repairShip(arc); const a2 = [arc.hp, arc.repairs]; arc.hp = 50; g.repairShip(arc); arc.hp = 50; g.repairShip(arc);
      ok('v0.8.19: a 方舟 mends to 70% on hard (294) and 85% on normal (357), three times at most', a1[0] === 294 && a1[1] === 1 && a2[0] === 357 && a2[1] === 2 && arc.repairs === 3 && arc.hp === 50 && /修不了了/.test(g.msgText), [a1, a2, arc.repairs]);
      g.diff = fx0;
      // v0.8.20 深水上、船頭有獸首骨鎮著時快一點八倍；沒有首骨、或在還沒斃的大魔王地界裡就不快
      p.ship.skulls = []; p.moveT = 0; g.shipStep(0, -1); const plain = p.stepDur; p.moveT = 0;
      p.ship.skulls = [['狼首骨', w.time + DAY]]; const sm = g.ents.add('蜃', p.x + 12, p.y - 12, { moveT: 99, atk: 99, fogT: 999 }); g.shipStep(0, -1); const fast = p.stepDur; p.moveT = 0; g.ents.remove(sm);
      const sn = g.ents.add('蜃', p.x + 6, p.y - 5, { moveT: 99, atk: 99, fogT: 999 }); g.shipStep(0, 1); const near7 = p.stepDur; p.moveT = 0; g.ents.remove(sn);
      ok('v0.8.21: …but with a 蜃 within seven tiles it is not', Math.abs(near7 - 0.14 / g.ironSpeed()) < 1e-6, near7); g.shipStep(0, -1); p.moveT = 0;
      const ib = g.inBossLand; g.inBossLand = () => true; g.shipStep(0, 1); const inBoss = p.stepDur; p.moveT = 0; g.inBossLand = ib;
      const pb5 = p.bosses; p.bosses = {}; const z5 = g.bossZone('修蛇'), bossIn = g.inBossLand(z5.x, z5.y), bossOut = g.inBossLand(z5.x + 120 + 5, z5.y); p.bosses = { '修蛇': 1 }; const slain = g.inBossLand(z5.x, z5.y); p.bosses = pb5;
      ok('v0.8.20: on deep water a skull on the bow makes the ship 1.8× as fast (v0.8.21: a 蜃 twelve away does not matter); with no skull, or inside the ground of a boss not yet slain, it is not', Math.abs(fast - 0.14 / 1.8 / g.ironSpeed()) < 1e-6 && Math.abs(plain - 0.14 / g.ironSpeed()) < 1e-6 && Math.abs(inBoss - 0.14 / g.ironSpeed()) < 1e-6 && bossIn && !bossOut && !slain, [plain, fast, inBoss, bossIn, bossOut, slain]);
      p.ship.skulls = [];
      // 7、8、9：各拿一件神兵
      const tk = p.tools; p.tools = [{ n: '石刀', c: 1, dur: 30 }]; p.tool = 0; g.addItem('九閽鳴雷', 1); g.addItem('燭龍焚溟', 1);
      await press('Digit7', 20); const k7 = g.activeTool() && g.activeTool().n; await press('Digit8', 20); const k8 = g.activeTool() && g.activeTool().n; await press('Digit9', 20); const m9 = g.msgText;
      g.addItem('彤弓素矰', 1); await press('Digit9', 20); const k9 = g.activeTool() && g.activeTool().n;
      ok('v0.8.19: 7 takes out 九閽鳴雷, 8 燭龍焚溟; v0.8.25: 9 takes out 彤弓素矰 (and says so when you have none)', k7 === '九閽鳴雷' && k8 === '燭龍焚溟' && /沒有「彤弓素矰」/.test(m9) && k9 === '彤弓素矰', [k7, k8, m9, k9]);
      p.tools = tk; p.tool = -1; g.removeItem('九閽鳴雷', 9); g.removeItem('燭龍焚溟', 9); g.removeItem('彤弓素矰', 9);
      // 走位：打完一下，退開或橫挪
      const rnd0 = Math.random; Math.random = () => 0.1;
      const sh = g.ents.add('蜃', p.x, p.y - 4, { moveT: 0, atk: 1, fogT: 999 }); const shipC = g.shipCells(); sh.y = sh.ry = Math.min(...shipC.map(c => c[1])) - 1; sh.x = sh.rx = shipC[0][0];
      const s0 = [sh.x, sh.y]; g.ents.update(0.01, g); const s1 = [sh.x, sh.y];
      Math.random = rnd0; g.ents.remove(sh);
      ok('v0.8.19: a 蜃 beside the ship, waiting for its next ram, steps back or sideways instead of sitting still', (s1[0] !== s0[0] || s1[1] !== s0[1]) && !shipC.some(([x, y]) => x === s1[0] && y === s1[1]), [s0, s1]);
      p.sailing = false; p.ship = null; p.hold = [];
      // 漲潮淹了的沙洲：過得了船、放不得
      { const bx = X - 3, by = Y - 3; w.set(bx, by, '灘'); const t0 = w.time; setDay(0.83);
        ok('v0.8.19: a flooded sandbar lets a ship pass but not be set down', g.shipWater(bx, by) && !g.launchWater(bx, by)); w.time = t0; w.set(bx, by, '淼'); }
      // 落水撐船：你這格當船尾，船頭朝面前
      p.sailing = false; p.ship = null; sea('水'); p.x = p.rx = X; p.y = p.ry = Y - 1; p.swimming = true; p.swimT = 50; p.swimShips = 0; p.deploy = null;
      g.addItem('孤帆', 1); face(0, -1); hold('孤帆'); g.pressPlace(); g.tickDeploy(5);
      ok('v0.8.21: a ship set down while swimming lies either way at random, over your tile, all of it on water', p.sailing && g.onDeck(p.x, p.y) && g.shipCells().length === 2 && g.shipCells().every(([x, y]) => G.DB[w.raw(x, y)].kind === 'water') && p.y === Y - 1, p.ship && [p.ship.x0 - X, p.ship.y0 - Y, p.ship.dir]);
      p.sailing = false; p.ship = null; p.swimming = false; p.swimT = 0; p.swimShips = 0; clearShips();
      for (let dx = -7; dx <= 7; dx++) for (let dy = -8; dy <= 7; dy++) w.set(X + dx, Y + dy, w.base(X + dx, Y + dy));
      // 沙洲：漲潮時船過得去；退潮時壓在沙洲上的船瞬移到最近的水
      let bar = null;
      for (let y = -150; y <= 150 && !bar; y++) for (let x = -150; x <= 150 && !bar; x++) {
        if (w.raw(x, y) !== '灘' || w.base(x, y) !== '灘') continue;
        const cells = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
        if (cells.every(([cx, cy]) => (w.raw(cx, cy) === '灘' || G.DB[w.raw(cx, cy)].kind === 'water') && !w.placeAt(cx, cy) && !w.shipCells.has(cx + ',' + cy))) bar = [x, y];
      }
      if (bar) {
        const [bx, by] = bar, t0 = w.time; setDay(0.83);
        ok('v0.8.18: at high tide a flooded sandbar takes a ship; at low tide it does not', g.shipWater(bx, by) && (setDay(0.5), !g.shipWater(bx, by)), bar);
        setDay(0.83); const rec = Object.assign(World.newShip('孤帆'), { hp: 66 }); w.addShip(bx, by, rec);
        setDay(0.5); g.tideShips(); const moved = [...w.ships.values()].find(x => x === rec);
        ok('v0.8.18: the tide goes out under a parked ship — it jumps to the nearest water and the sandbar is sand again', !!moved && moved.cells.every(([x, y]) => g.shipWater(x, y) || w.shipAt(x, y) === moved) && moved.cells.every(([x, y]) => w.base(x, y) !== '灘' || w.raw(x, y) === '水') && w.raw(bx, by) === '灘' && moved.hp === 66, moved && JSON.stringify(moved.cells));
        w.removeShip(w.shipCells.get(moved.cells[0][0] + ',' + moved.cells[0][1]));
        setDay(0.83); p.sailing = true; p.swimming = false; p.ship = Object.assign(World.newShip('孤帆'), { x0: bx, y0: by, dir: 'v' }); p.x = p.rx = bx; p.y = p.ry = by + 1;
        setDay(0.5); g.tideShips();
        ok('v0.8.18: …and if you are aboard, the ship carries you along to the water', p.sailing && g.shipCells().every(([x, y]) => g.shipWater(x, y)) && g.onDeck(p.x, p.y) && (p.ship.x0 !== bx || p.ship.y0 !== by), [p.ship.x0 - bx, p.ship.y0 - by]);
        p.sailing = false; p.ship = null; w.time = t0;
      } else ok('v0.8.18: sandbar tide test (no sandbar found to test)', true);
      { // v0.8.19 遠處指路：離龍淵兩百五十格內說一聲方位，大地圖畫一圈
        const z = G.zones(g.seed).find(q => q.id === '青龍'); p.nestHints = {}; p.zones = Object.assign({}, p.zones); delete p.zones['青龍'];
        p.x = p.rx = z.x - 240; p.y = p.ry = z.y; document.getElementById('toasts').innerHTML = ''; g.nestHints();
        ok('v0.8.19: about 240 tiles out, a note says which way the 青龍\'s nest (龍淵) lies; once only', p.nestHints['青龍'] === 1 && /龍淵在東/.test(toasts()) && /青龍的巢穴/.test(toasts()), toasts().slice(0, 80));
        document.getElementById('toasts').innerHTML = ''; g.nestHints(); ok('v0.8.19: …and it is not said again', !/龍淵/.test(toasts()));
        g.renderer.drawBigMap(g, document.getElementById('bigmap')); const mv = g.renderer.mapView;
        ok('v0.8.19: the big map widens to show the heard-of nest', mv.ox <= z.x - z.r && mv.ox + mv.N >= z.x + z.r, mv);
      }
      { // v0.8.19 封豨打完一下會退開或橫挪
        const hx = X + 40, hy = Y + 40; for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) w.set(hx + dx, hy + dy, '草');
        p.x = p.rx = hx; p.y = p.ry = hy; const rnd0 = Math.random; Math.random = () => 0.1;
        const hg = g.ents.add('豨', hx + 1, hy - 1, { hp: 2000, max: 2000, atk: 1, moveT: 0, state: 'chase', chargeCD: 99, quakeCD: 99, eatCD: 99, callCD: 99 });
        const h0 = [hg.x, hg.y]; g.ents.hogAct(hg, g, p, false, false); const h1 = [hg.x, hg.y]; Math.random = rnd0; g.ents.remove(hg);
        ok('v0.8.19: 封豨 right beside you, waiting for its next blow, backs off or slides sideways', (h1[0] !== h0[0] || h1[1] !== h0[1]) && g.ents.rectDist({ type: '豨', x: h1[0], y: h1[1] }, p.x, p.y) >= 1, [h0, h1]);
        for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) w.set(hx + dx, hy + dy, w.base(hx + dx, hy + dy));
      }
      p.x = p.rx = keep.x; p.y = p.ry = keep.y; p.cour = keep.cour; p.bag = keep.bag; p.sel = keep.sel; p.hold = keep.hold || []; p.holdSel = -1; g.keys.clear(); g.barSig = ''; g.buildBag();
    }
    // 舊存檔：疊著的船拆成一艘一欄，散的油脂裝進麻布包
    g.save(); const sv = JSON.parse(localStorage.getItem(XIEYI.Game.slotKey(g.slot)));
    const old = JSON.parse(JSON.stringify(sv)); old.player.bag = [{ n: '孤帆', c: 3 }, { n: '油脂', c: 10 }, { n: '木', c: 5 }]; delete old.player.hold; old.player.swimming = false; old.player.sailing = false;
    g.load(old);
    ok('v0.8.3: an old save — a stack of three 孤帆 becomes three ships (in the hold, v0.8.19), ten loose fat go into two 麻布包 (8 + 2)', p.hold.filter(s => s.n === '孤帆').length === 3 && !p.bag.some(s => s.n === '孤帆') && p.bag.filter(s => s.n === '麻布包').map(s => s.oil).sort((a, b) => b - a).join(',') === '8,2' && g.count('油脂') === 10 && !p.bag.some(s => s.n === '油脂'), p.bag.map(s => s.n + s.c + (s.oil !== undefined ? 'o' + s.oil : '')));
    { // v0.8.18–v0.8.20 的舊存檔：停著的方舟是三乘三，讀進來照二乘三（v0.8.21 改回來）縮在原本的地方
      const X = g.spawn.x + 320, Y = g.spawn.y + 320; g.save(); const sv3 = JSON.parse(localStorage.getItem(XIEYI.Game.slotKey(g.slot)));
      const o3 = JSON.parse(JSON.stringify(sv3)); o3.world.ships = o3.world.ships || {};
      o3.world.ships[X + ',' + (Y - 1)] = { kind: '方舟', hp: 300, skulls: [], repairs: 1, dir: 'v', cells: [[X, Y - 1], [X + 1, Y - 1], [X + 2, Y - 1], [X, Y], [X + 1, Y], [X + 2, Y], [X, Y + 1], [X + 1, Y + 1], [X + 2, Y + 1]] };
      o3.world.diff = o3.world.diff || {}; for (const [x, y] of o3.world.ships[X + ',' + (Y - 1)].cells) o3.world.diff[x + ',' + y] = '舟';
      for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) if (!o3.world.diff[(X + dx) + ',' + (Y + dy)]) o3.world.diff[(X + dx) + ',' + (Y + dy)] = '淼';
      const deep = Object.keys(o3.world.diff).length; g.load(o3);
      const r5 = [...w.ships.values()].find(r => r.kind === '方舟' && r.hp === 300 && r.repairs === 1);
      ok('v0.8.21: an older save\'s parked 3×3 方舟 is re-parked as 2×3 inside where it was, hp and repairs kept, with a notice', !!r5 && r5.cells.length === 6 && r5.cells.every(([x, y]) => x >= X && x <= X + 2 && y >= Y - 1 && y <= Y + 1) && /船改了大小/.test(toasts()), [deep, r5 && JSON.stringify(r5.cells)]);
      if (r5) w.removeShip(w.shipCells.get(r5.cells[0][0] + ',' + r5.cells[0][1]));
    }
    { // v0.8.21 船（使用者定）：照開的方向轉身、斜著開隨機定向、船的介面、首骨拿下放回、方圓三十格最多四艘、人在水裡收不了船、測試格的船不掉命、首骨把蜃嚇到八格外
      const X = g.spawn.x + 340, Y = g.spawn.y + 340, dk0 = g.diff, az0 = p.azure; g.diff = XIEYI.DIFF.normal; p.azure = false;   // 青龍的水性會讓船自己回命，這一段要看船命，先拿掉
      for (const k of [...w.ships.keys()]) { const rr = w.ships.get(k); if (rr.cells.some(([x, y]) => Math.abs(x - X) <= 45 && Math.abs(y - Y) <= 45)) w.removeShip(k); }
      for (let dx = -14; dx <= 14; dx++) for (let dy = -14; dy <= 14; dy++) w.set(X + dx, Y + dy, '淼');
      g.ents.list = g.ents.list.filter(e => U.cheb(e.x, e.y, X, Y) > 16); g.keys.clear();
      p.swimming = false; p.sailing = true; p.ship = Object.assign(World.newShip('方舟'), { dir: 'v', x0: X, y0: Y }); p.x = p.rx = X + 1; p.y = p.ry = Y + 2; g.ents.px = p.x; g.ents.py = p.y; p.moveT = 0;
      g.shipStep(1, 0); p.moveT = 0; const xs = g.shipCells().map(c => c[0]);
      ok('v0.8.21: key 4 on a north–south 方舟 turns it east–west around the tile you stand on, then moves one east', p.ship.dir === 'h' && g.shipCells().length === 6 && g.onDeck(p.x, p.y) && p.x === X + 2 && p.y === Y + 2 && Math.max(...xs) - Math.min(...xs) === 2, [p.ship.dir, p.ship.x0 - X, p.ship.y0 - Y, p.x - X, p.y - Y]);
      { const rnd0 = Math.random; g.keys.add('Digit3'); g.keys.add('Digit4'); Math.random = () => 0.9; p.moveT = 0; g.handleMove(0.016); const d1 = p.ship.dir;
        Math.random = () => 0.1; p.moveT = 0; g.handleMove(0.016); const d2 = p.ship.dir;
        g.keys.delete('Digit3'); p.moveT = 0; g.handleMove(0.016); const d3 = p.ship.dir, cleared = !g.shipDiag; g.keys.clear(); Math.random = rnd0; p.moveT = 0;
        ok('v0.8.21: two keys at once sail diagonally; which way the hull lies is drawn at random and kept until a key is let go', d1 === 'v' && d2 === 'v' && d3 === 'h' && cleared, [d1, d2, d3, cleared]); }
      // 船的介面
      p.ship.skulls = [['虎首骨', w.time + 2.5 * DAY]]; p.ship.hp = 200; p.ship.repairs = 0; g.removeItem('虎首骨', 99);
      await press('KeyC', 20); const sui = document.getElementById('shipui');
      ok('v0.8.21: on board, C opens the ship panel — hp, the next mend (materials, how far it mends), the skulls on the bow', !hidden('shipui') && /命 200／420/.test(sui.textContent) && /第 1 次修/.test(sui.textContent) && /木板/.test(sui.textContent) && /虎首骨/.test(sui.textContent) && /還鎮 3 日/.test(sui.textContent), sui.textContent.slice(0, 200));
      { const b = sui.querySelector('button[data-act="off"]'); if (b) b.click(); }
      const sk = p.bag.find(x => x.n === '虎首骨' && x.dur !== undefined);
      ok('v0.8.21: a skull taken down goes into the bag with the days it had left (2.5), shown as 鎮3日', p.ship.skulls.length === 0 && !!sk && Math.abs(sk.dur - 2.5) < 1e-3 && g.durText(sk) === '鎮3日', sk && [sk.dur, g.durText(sk)]);
      { const b = [...sui.querySelectorAll('button[data-act="on"]')].find(x => /虎首骨/.test(x.textContent)); if (b) b.click(); }
      ok('v0.8.21: …put back, it wards for what it had left, not a fresh three days', p.ship.skulls.length === 1 && Math.abs((p.ship.skulls[0][1] - w.time) / DAY - 2.5) < 1e-3 && !p.bag.some(x => x.n === '虎首骨'), p.ship.skulls);
      await press('KeyC', 20); const cyc1 = hidden('shipui') && !hidden('craft'); await press('KeyC', 20); const cyc2 = hidden('shipui') && hidden('craft');
      ok('v0.8.23: on board C goes round — the ship panel, then the craft panel, then back to the game', cyc1 && cyc2, [cyc1, cyc2]);
      // 首骨把蜃嚇到八格外
      { const m = g.ents.add('蜃', p.x + 4, p.y, { moveT: 0, atk: 0, fogT: 999 }); for (let i = 0; i < 6; i++) { m.moveT = 0; g.ents.update(0.6, g); }
        const dm = Math.min(...g.shipCells().map(([x, y]) => U.cheb(m.x, m.y, x, y)));
        ok('v0.8.21: a skull on the bow keeps a 蜃 out past eight tiles — it backs away', dm > 6 && p.ship.hp === 200, [dm, p.ship.hp]); g.ents.remove(m); }
      p.ship.skulls = [];
      // 測試格：船不掉命
      { const t0 = g.test, m = g.ents.add('蜃', p.x + 9, p.y + 9, { moveT: 99, atk: 99, fogT: 999 }); g.test = true; const h0 = p.ship.hp; g.ramShip(m); const h1 = p.ship.hp; g.test = t0; g.ramShip(m); const h2 = p.ship.hp; g.ents.remove(m);
        ok('v0.8.21 測試格: a ship there takes no damage (outside it still does)', h1 === h0 && h2 < h0, [h0, h1, h2]); }
      // 方圓三十格最多停四艘：再放一艘先問，最早下水的那艘消失
      p.sailing = false; p.ship = null; p.x = p.rx = X; p.y = p.ry = Y; for (let dx = -2; dx <= 2; dx++) for (let dy = 0; dy <= 2; dy++) w.set(X + dx, Y + dy, '草');
      for (let i = 0; i < 4; i++) w.addShip(X - 10 + i * 4, Y - 10, Object.assign(World.newShip('孤帆'), { dir: 'v', t: 100 + i }));
      const oldest = w.shipAt(X - 10, Y - 10); p.hold = []; g.addItem('孤帆', 1); p.holdSel = 0; face(0, -1); g.pressPlace();
      ok('v0.8.21: with four ships parked within thirty tiles, F first warns that the earliest launched one will vanish', !hidden('takeask') && /最早下水的那艘孤帆/.test(document.getElementById('takeask').textContent) && w.shipAt(X - 10, Y - 10) === oldest, document.getElementById('takeask').textContent.slice(0, 160));
      takeYes(); const near30 = [...w.ships.values()].filter(r => { const c = w.shipCenter(r); return Math.hypot(c.x - X, c.y - Y) <= 30; }).length;
      ok('v0.8.21: …yes: the new one goes down and the earliest one is gone, four in all', !w.shipAt(X - 10, Y - 10) && !!w.shipAt(X, Y - 1) && near30 === 4, near30);
      p.swimming = true; p.x = p.rx = X + 1; p.y = p.ry = Y - 1; g.stowShip(w.shipAt(X, Y - 1));
      ok('v0.8.21: in the water you cannot stow a ship', /人在水裡，收不了船/.test(g.msgText) && !!w.shipAt(X, Y - 1), g.msgText); p.swimming = false;
      for (const k of [...w.ships.keys()]) { const rr = w.ships.get(k); if (rr.cells.some(([x, y]) => Math.abs(x - X) <= 45 && Math.abs(y - Y) <= 45)) w.removeShip(k); }
      for (let dx = -14; dx <= 14; dx++) for (let dy = -14; dy <= 14; dy++) w.set(X + dx, Y + dy, w.base(X + dx, Y + dy));
      g.diff = dk0; p.azure = az0;
    }
    { // v0.8.21 傳送（使用者定）：第一次登上地界立樹；符紙一、力十、飽八；水上要選船；還沒斃的大魔王的地界傳不進去
      const gk = p.gates, pb = p.bosses, hold0 = p.hold, pos0 = { x: p.x, y: p.y }; p.gates = {}; p.bosses = {}; p.hold = []; p.fight = null; p.trial = null; p.sailing = false; p.ship = null; p.swimming = false;
      const zx = G.zones(g.seed).find(z => z.id === '玄武'), zl = G.zones(g.seed).find(z => z.id === '青龍'), zh = G.zones(g.seed).find(z => z.id === '封豨');
      const gx = g.zoneGate(zx), gw = g.zoneGate(zl), gh = g.zoneGate(zh);
      ok('v0.8.21: first time on 玄洲 a 建木 stands near the island heart; 龍淵 gets a point on the water (no tree); 桑林 a 若木', !!gx && gx.name === '建木' && w.get(gx.x, gx.y) === '建' && Math.hypot(gx.x - zx.x, gx.y - zx.y) >= 4 && !!gw && gw.water && !!gh && gh.name === '若木' && w.get(gh.x, gh.y) === '若', [gx, gw, gh]);
      trim([]); g.addItem('竹', 2); g.addItem('麻布', 1); g.addItem('煤', 1); g.addItem('花', 1); p.sta = 100; g.craft('talisman');
      ok('v0.8.21: 符紙 — 竹二、麻布一、煤一、花一 make two', g.count('符紙') === 2, g.count('符紙'));
      p.x = p.rx = g.spawn.x; p.y = p.ry = g.spawn.y; p.sta = 100; p.food = 100;
      g.openTele('home'); const tl = document.getElementById('tele-list').textContent, shut = [...document.querySelectorAll('#tele-list button')].find(b => /桑林/.test(b.textContent));
      ok('v0.8.21: the list shows the places been to; 桑林 is shut while 封豨 lives', /玄洲的建木/.test(tl) && /龍淵（水上/.test(tl) && !!shut && shut.disabled && /還沒斃封豨/.test(shut.textContent), tl.slice(0, 160));
      [...document.querySelectorAll('#tele-list button')].find(b => /玄洲的建木/.test(b.textContent)).click();
      ok('v0.8.21: writing 玄洲 takes you next to its 建木 for one 符紙, 10 力 and 8 飽', U.cheb(p.x, p.y, gx.x, gx.y) <= 1 && g.count('符紙') === 1 && p.sta === 90 && p.food === 92 && hidden('tele'), [p.x - gx.x, p.y - gx.y, g.count('符紙'), p.sta, p.food]);
      document.getElementById('toasts').innerHTML = ''; g.openTele(g.gateKeyAt(gx.x, gx.y)); [...document.querySelectorAll('#tele-list button')].find(b => /龍淵/.test(b.textContent)).click();
      ok('v0.8.21: a water place with no ship in the hold — told to bring one, no 符紙 spent', /要帶船/.test(toasts()) && g.count('符紙') === 1 && !p.sailing, toasts().slice(0, 80));
      g.addItem('孤帆', 1); g.openTele(g.gateKeyAt(gx.x, gx.y)); [...document.querySelectorAll('#tele-list button')].find(b => /龍淵/.test(b.textContent)).click();
      const tt = document.getElementById('talk-text').textContent; g.talkPick(0);
      ok('v0.8.21: …with a ship: choose it, and you arrive aboard in the middle of 龍淵', /選一艘/.test(tt) && p.sailing && !!p.ship && p.ship.kind === '孤帆' && Math.hypot(p.x - zl.x, p.y - zl.y) < 10 && g.count('符紙') === 0 && g.count('孤帆') === 0, [p.x - zl.x, p.y - zl.y]);
      ok('v0.8.21: on board you cannot write a place', g.gateBlock() === '在船上傳不了，先上岸。', g.gateBlock());
      g.save(); const sv = JSON.parse(localStorage.getItem(XIEYI.Game.slotKey(g.slot))); ok('v0.8.21: the places are saved', sv.player.gates && sv.player.gates['z:玄武'] && sv.player.gates['z:青龍'].water);
      p.sailing = false; p.ship = null; p.bosses = pb; p.hold = hold0; p.gates = gk || {}; w.set(gx.x, gx.y, w.base(gx.x, gx.y)); w.set(gh.x, gh.y, w.base(gh.x, gh.y)); p.x = p.rx = pos0.x; p.y = p.ry = pos0.y; g.ents.px = p.x; g.ents.py = p.y; trim([]);
    }
    // 魔物誌：十二張，分四組，沒遇過的蓋著
    p.codex = { '蜃': 1 }; if (p.creatures.indexOf('青龍') < 0) p.creatures.push('青龍'); g.journalTab = 'codex'; g.toggleJournal();
    const cards = document.querySelectorAll('#journal-body .codex-card'), locked = document.querySelectorAll('#journal-body .codex-card.locked'), heads = [...document.querySelectorAll('#journal-body h3')].map(h => h.textContent).join('');
    ok('v0.8.3: the 魔物誌 has all twelve large monsters in four groups; the ones not met yet are covered with a hint', cards.length === 12 && locked.length === 10 && heads === '小魔王神獸大魔王終極' && /魔物誌（2／12）/.test(document.getElementById('journal-tabs').textContent) && /東極那片大水裡/.test(document.getElementById('journal-body').textContent));
    const cr = [...cards].map(c => c.getBoundingClientRect()), panel = document.querySelector('#journal .panel').getBoundingClientRect();
    ok('v0.8.3: the cards sit in neat columns inside the panel (no card spills over)', cr.every(r => r.left >= panel.left && r.right <= panel.right + 1) && new Set(cr.map(r => Math.round(r.width))).size === 1, cr.slice(0, 3).map(r => Math.round(r.width)));
    document.querySelector('#journal-tabs button[data-tab="see"]').click();
    ok('v0.8.3: the 見聞 tab still lists places, creatures and days', /地方/.test(document.getElementById('journal-body').textContent) && /日子/.test(document.getElementById('journal-body').textContent));
    g.toggleJournal(); g.journalTab = 'see';
    g.load(sv); p.bag = bag0; p.azure = az0; p.swimming = false; p.swimT = 0; p.sailing = false; p.ship = null; p.x = p.rx = p0.x; p.y = p.ry = p0.y; E.px = p.x; E.py = p.y; g.barSig = ''; }
  // ============ v0.8.2：落水的倒數框、木板多撐八息、青龍的水性；魔物誌 ============
  { const E = g.ents, p0 = { x: p.x, y: p.y }, az = g.azure, az0 = p.azure, db = document.getElementById('debuffs');
    E.list = E.list.filter(e => e.type !== '蜃' && e.type !== '青龍');
    p.x = p.rx = az.x - 30; p.y = p.ry = az.y; E.px = p.x; E.py = p.y; p.sailing = false; p.ship = null; p.azure = false; p.hp = Math.max(p.hp, 80);
    g.removeItem('木板', 99); g.addItem('木板', 2); p.swimming = true; p.swimT = 30; await sleep(150);
    ok('v0.8.2: swimming shows a red flashing 溺 countdown at the lower right, with the planks you carry', !db.classList.contains('hidden') && /溺/.test(db.textContent) && /還有 \d+ 息/.test(db.textContent) && /木板 ×2（\+16 息）/.test(db.textContent) && getComputedStyle(db).animationName === 'low-flash', db.textContent);
    p.swimT = 0.05; await until(() => g.count('木板') === 1, 2000);
    ok('v0.8.2: when the countdown runs out, a plank from the bag buys eight more breaths', !p.dead && p.swimming && g.count('木板') === 1 && p.swimT > 7 && p.swimT <= 8, [p.swimT, g.count('木板')]);
    p.swimT = 30; g.updateStats(1); const plain = 30 - p.swimT;   // 同一段同步的程式裡不會插進畫面更新，量得準
    p.azure = true; p.swimT = 30; g.updateStats(1); const taught = 30 - p.swimT;
    ok('v0.8.2: taught by the 青龍 (水性), the drowning countdown runs a quarter slower', Math.abs(plain - 1) < 1e-6 && Math.abs(taught - 0.75) < 1e-6, [plain, taught]);
    p.swimming = false; p.swimT = 0; p.azure = az0; p.x = p.rx = p0.x; p.y = p.ry = p0.y; E.px = p.x; E.py = p.y; g.removeItem('木板', 99); await sleep(120);
    ok('v0.8.2: back on land the 溺 box goes away', db.classList.contains('hidden'));
    // 魔物誌：斃了第一頭蜃才翻開
    p.codex = undefined; const jt0 = () => { g.journalTab = 'codex'; g.toggleJournal(); const t = document.getElementById('journal-tabs').textContent + document.getElementById('journal-body').textContent; g.toggleJournal(); g.journalTab = 'see'; return t; };
    const before = jt0(); g.kill(E.add('蜃', p.x + 3, p.y + 3, { moveT: 99, fogT: 999 })); g.removeItem('蜃殘體', 99); const after = jt0();
    ok('v0.8.2: the 魔物誌 opens in the journal only after the first 蜃 is slain, with a card for it', before.indexOf('魔物誌') < 0 && after.indexOf('魔物誌') >= 0 && /海旁蜃氣象樓臺/.test(after) && p.codex['蜃'] === 1, after.slice(after.indexOf('魔物誌'), after.indexOf('魔物誌') + 60));
    ok('v0.8.2: …and the 東海青龍 you met has a card too; ones you never met stay hidden', /東海青龍/.test(after) && /左青龍而右白虎/.test(after) && /未遇/.test(after)); }
  // ============ v0.8：八格存檔、暫停面板「存到」別格；東海青龍、蜃珠、船自己回命、舊存檔的龍換青鱗 ============
  { const E = g.ents, p0 = { x: p.x, y: p.y }, slot0 = g.slot, GK = XIEYI.Game, sb = (n) => document.querySelector('#saveas .saveas-slot[data-slot="' + n + '"]');
    ok('v0.8: eight save slots — slot 1 keeps the old key, slot 8 is xieyi.save.v5.8', GK.slotKey(1) === 'xieyi.save.v5' && GK.slotKey(8) === 'xieyi.save.v5.8');
    for (let n = 2; n <= 8; n++) if (n !== slot0) GK.clearSave(n);
    g.togglePause();
    ok('v0.8: the pause panel lists eight slots to save to, this game’s own slot marked', document.querySelectorAll('#saveas .saveas-slot').length === 8 && document.querySelector('#saveas .saveas-slot.on').dataset.slot === String(slot0) && !hidden('pause'));
    const t1 = w.time; sb(2).click(); const s2 = GK.readSave(2);
    ok('v0.8: clicking slot 2 copies this moment there; the game keeps its own slot for autosaves', !!s2 && s2.seed === g.seed && Math.abs(s2.world.time - t1) < 1e-3 && g.slot === slot0 && /抄到了第二格/.test(document.getElementById('saveas-note').textContent) && /這一局/.test(sb(slot0).textContent), document.getElementById('saveas-note').textContent);
    g.togglePause(); w.time += 5; g.save();
    g.togglePause(); sb(3).click(); g.togglePause();
    const s2b = GK.readSave(2), s3 = GK.readSave(3), s1 = GK.readSave(slot0);
    ok('v0.8: later, slot 3 holds the later moment, slot 2 still the earlier one, and autosave went to the own slot', Math.abs(s2b.world.time - t1) < 1e-3 && Math.abs(s3.world.time - (t1 + 5)) < 1e-3 && Math.abs(s1.world.time - (t1 + 5)) < 1e-3, [s2b.world.time - t1, s3.world.time - t1, s1.world.time - t1]);
    const other = JSON.parse(JSON.stringify(s3)); other.seed = 4242; localStorage.setItem(GK.slotKey(4), JSON.stringify(other));
    g.togglePause(); sb(4).click(); const armedText = sb(4).textContent, still = GK.readSave(4).seed; sb(4).click(); const after = GK.readSave(4).seed;
    sb(3).click(); const again3 = GK.readSave(3).world.time; g.togglePause();
    ok('v0.8: another island’s save needs a second click to overwrite; a slot this game copied to a moment ago takes one', /再按一次/.test(armedText) && still === 4242 && after === g.seed && Math.abs(again3 - w.time) < 1e-3, [armedText, still, after]);
    for (let n = 2; n <= 8; n++) if (n !== slot0) GK.clearSave(n);
    // 東海青龍：本島往東約六百格的深海上；四十格內現身；兩格內 E 求教
    const az = g.azure; let open = true; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (w.get(az.x + dx, az.y + dy) !== '淼') open = false;
    ok('v0.8: the 青龍 lives on open deep sea about six hundred tiles east of the island', az.x >= 560 && az.x <= 720 && Math.abs(az.y) <= 220 && open, az);
    E.list = E.list.filter(e => e.type === '龍' || e.tame);
    p.x = p.rx = az.x - 20; p.y = p.ry = az.y; p.sailing = true; p.swimming = false; p.ship = { kind: '孤帆', hp: 60, skulls: [], repairs: 0 }; E.px = p.x; E.py = p.y;
    await until(() => E.list.some(e => e.type === '青龍'), 5000);
    const dr = E.list.find(e => e.type === '青龍');
    ok('v0.8: sailing within forty tiles, the 青龍 shows up on its own patch of sea', !!dr && U.cheb(dr.x, dr.y, az.x, az.y) <= 3, dr && [dr.x - az.x, dr.y - az.y]);
    if (dr) { p.x = p.rx = dr.x - 2; p.y = p.ry = dr.y; face(1, 0); g.msgUntil = 0; await sleep(120);
      ok('v0.8: two tiles from it the hint line names the 東海青龍', /東海青龍/.test(document.getElementById('msg').textContent), document.getElementById('msg').textContent);
      g.pressGather(); ok('v0.8: once taught, E only gets a word from the 青龍 (never an attack)', /去吧/.test(g.msgText) && dr.hp === G.DB['青龍'].hp, g.msgText); }
    const hp0 = p.ship.hp; g.mendShips(DAY);
    ok('v0.8: taught by the 青龍, a 孤帆 mends itself — half its hull a day, full in two', Math.abs(p.ship.hp - Math.min(120, hp0 + 60)) < 1e-3, p.ship.hp);
    const pk = w.addShip(az.x - 12, az.y + 6, { kind: '方舟', hp: 20, skulls: [], repairs: 0 }); g.mendShips(DAY / 2);
    ok('v0.8: …and a parked ship mends too (方舟: a quarter of 420 in half a day)', Math.abs(pk.hp - (20 + 105)) < 1e-3, pk.hp); w.removeShip(U.key(az.x - 12, az.y + 6));
    g.toggleMap(); await sleep(60); const mv = g.renderer.mapView; g.toggleMap();
    ok('v0.8: with the scale (or once taught) the big map reaches out to mark the 青龍', !!mv && az.x >= mv.ox && az.x <= mv.ox + mv.N && az.y >= mv.oy && az.y <= mv.oy + mv.N, mv);
    // v0.8.1：蜃死掉蜃殘體一或二片（64%／36%，真隨機），不再直接掉蜃珠
    { const tr = U.trueRand; g.removeItem('蜃殘體', 99); g.removeItem('蜃珠', 9);
      U.trueRand = () => 0.5; g.kill(E.add('蜃', p.x + 4, p.y + 3, { moveT: 99, fogT: 999 })); const one = g.count('蜃殘體');
      U.trueRand = () => 0.2; g.kill(E.add('蜃', p.x + 4, p.y + 3, { moveT: 99, fogT: 999 })); U.trueRand = tr;
      ok('v0.8.1: a slain 蜃 drops one 蜃殘體 (64%) or two (36%), not a whole pearl', one === 1 && g.count('蜃殘體') === 3 && g.count('蜃珠') === 0 && /蜃殘體/.test(toasts()), [one, g.count('蜃殘體')]); }
    p.sailing = false; p.ship = null; E.list = E.list.filter(e => e.type !== '青龍');
    // v0.8.1：九塊蜃殘體加海水瓶三，在火旺的鼎裡熬一顆蜃珠，八成三成；不成退殘體（困難只退八塊），海水瓶不退
    p.x = p.rx = p0.x; p.y = p.ry = p0.y; E.px = p.x; E.py = p.y;
    { const tr = U.trueRand, kx = p0.x + 1, ky = p0.y, cnt = () => [g.count('蜃殘體'), g.count('海水瓶'), g.count('蜃珠')].join('/');
      w.set(kx, ky, '鼎'); w.addFuel(kx, ky, 300); face(1, 0); p.sta = 100;
      const jar = () => g.count('淡水瓶') + ':' + g.count('玻璃瓶');
      g.removeItem('海水瓶', 99); g.removeItem('淡水瓶', 99); g.removeItem('玻璃瓶', 99); g.removeItem('蜃殘體', 99); g.addItem('蜃殘體', 9); g.addItem('海水瓶', 3); hold('蜃殘體'); g.pressPlace(); g.dingMake('蜃殘體'); g.closeDing();
      ok('v0.8.2: without the bottle of fresh water (熬 has four dots: three brine, one fresh) nothing is used up', cnt() === '9/3/0' && /淡水瓶/.test(g.msgText), [cnt(), g.msgText]);
      g.removeItem('蜃殘體', 1); g.addItem('淡水瓶', 1); hold('蜃殘體'); g.pressPlace(); g.dingMake('蜃殘體'); g.closeDing();
      ok('v0.8.1: eight shards are not enough — nothing is used up', cnt() === '8/3/0' && jar() === '1:0' && /9/.test(g.msgText), [cnt(), g.msgText]);
      g.msgUntil = 0; await sleep(80); const hint = document.getElementById('msg').textContent;
      ok('v0.8.2: facing a lit 鼎 with shards in hand, the hint says what brewing needs and the odds', /熬蜃珠（殘體 8\/9、海水瓶 3\/3、淡水瓶 1\/1，83%）/.test(hint), hint);
      g.addItem('蜃殘體', 2); hold('蜃殘體'); U.trueRand = () => 0.9; g.pressPlace(); g.dingMake('蜃殘體'); g.closeDing();
      ok('v0.8.2: a failed brew (17%) blows up — all four bottles are gone, the nine shards come back on normal', cnt() === '10/0/0' && jar() === '0:0' && /炸/.test(g.msgText), [cnt(), jar()]);
      const dk = g.diff; g.diff = XIEYI.DIFF.hard; g.addItem('海水瓶', 3); g.addItem('淡水瓶', 1); hold('蜃殘體'); p.sta = 100; g.pressPlace(); g.dingMake('蜃殘體'); g.closeDing(); g.diff = dk;
      ok('v0.8.1: on hard a failed brew gives back only eight', cnt() === '9/0/0', cnt());
      g.addItem('海水瓶', 3); g.addItem('淡水瓶', 1); hold('蜃殘體'); p.sta = 100; U.trueRand = () => 0.5; g.pressPlace(); g.dingMake('蜃殘體'); g.closeDing(); U.trueRand = tr;
      ok('v0.8.2: a successful brew (83%) turns nine shards and four bottles of water into one 蜃珠 and gives the four empty bottles back', cnt() === '0/0/1' && jar() === '0:4' && /熬成一顆蜃珠/.test(toasts()), [cnt(), jar()]);
      g.removeItem('玻璃瓶', 9);
      w.set(kx, ky, w.base(kx, ky)); g.removeItem('蜃珠', 9); }
    // 舊存檔：龍跟著、沒求教過、囊滿了、睡過一張床——龍回東海，青鱗用小囊包著擱在床邊
    const bx = p0.x + 5, by = p0.y + 5; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) w.set(bx + dx, by + dy, '草'); w.set(bx, by, '床');
    g.save(); const sv = JSON.parse(localStorage.getItem(GK.slotKey(g.slot))), old = JSON.parse(JSON.stringify(sv));
    old.player.azure = undefined; old.player.scaleTaken = undefined; old.player.dragon = true; old.player.bed = { x: bx, y: by };
    old.player.bag = Array.from({ length: g.slots() }, () => ({ n: '石子', c: 1 })); old.ents = (old.ents || []).filter(e => e.t !== '龍').concat([{ t: '龍', x: p.x + 1, y: p.y, hp: 500 }]);
    p.azure = false; p.scaleTaken = false; g.load(old);
    const ring = (cx, cy) => { const a = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) a.push([cx + dx, cy + dy]); return a; };
    const sack = ring(bx, by).find(([x, y]) => w.get(x, y) === '囊'), inSack = sack ? (w.bags.get(U.key(sack[0], sack[1])) || []) : [];
    ok('v0.8: an old save’s dragon flies home to the east sea — gone, and the scale counts as taken', !p.dragon && !E.list.some(e => e.type === '龍') && p.scaleTaken && !p.azure);
    ok('v0.8: …leaving a 青鱗; the bag is full, so a 小囊 by the last bed slept in holds it', !!sack && inSack.some(it => it.n === '青鱗') && g.count('青鱗') === 0, [sack, inSack]);
    ok('v0.8: …and a toast says where the 青龍 is and that it wants a 蜃珠', /龍回東海去了/.test(toasts()) && /蜃珠/.test(toasts()));
    if (sack) { p.bag.pop(); const st = ring(sack[0], sack[1]).find(([x, y]) => w.get(x, y) === '草'); p.x = p.rx = st[0]; p.y = p.ry = st[1]; face(sack[0] - st[0], sack[1] - st[1]); g.msgUntil = 0; await sleep(120);
      const hint = document.getElementById('msg').textContent; g.pressGather();
      ok('v0.8: the hint names what is in the 小囊; E takes the 青鱗 and the sack is gone', /小囊（青鱗）/.test(hint) && g.count('青鱗') === 1 && w.get(sack[0], sack[1]) !== '囊' && !w.bags.has(U.key(sack[0], sack[1])), hint); }
    const n0 = w.ver; g.load(sv); p.x = p.rx = p0.x; p.y = p.ry = p0.y;
    ok('v0.8: a save made after the teaching keeps the teaching', p.azure && !p.dragon && !E.list.some(e => e.type === '龍'));
    { const v42 = JSON.parse(JSON.stringify(sv)); v42.player.dragon = true; v42.ents = (v42.ents || []).concat([{ t: '龍', x: p.x + 1, y: p.y, hp: 500 }]); g.load(v42);
      ok('v0.8.2: a v0.8/v0.8.1 save whose small dragon followed after the teaching — the dragon merges into the soul ring', p.azure && !p.dragon && !E.list.some(e => e.type === '龍') && /小龍入了魂環/.test(toasts())); }
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) w.set(bx + dx, by + dy, w.base(bx + dx, by + dy)); }
  // ============ v0.7.3：半友好的（無毒蛛、蟾、沒馴的鷹、野牛）被惹了發紅、變大、衝過來；不惹不打 ============
  { const E = g.ents, X = p.x + 46, Y = p.y + 8, p0 = { x: p.x, y: p.y }; for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) w.set(X + dx, Y + dy, '草');
    E.list = E.list.filter(e => e.type === '龍' || e.tame); p.x = p.rx = X; p.y = p.ry = Y; E.px = p.x; E.py = p.y; calm();
    const ad = (t, dx, dy, ex) => E.add(t, X + dx, Y + dy, Object.assign({ moveT: 99, calm: 99 }, ex || {}));
    const sp = ad('蛛', -3, 0, { venom: false }), td = ad('蟾', 3, 0, { venom: false }), eg = ad('鷹', 0, -3), cow = ad('牛', 0, 4, { bx: 1, by: 0 }), tm = ad('鷹', -3, -3, { tame: true, angry: true }), dr = ad('鹿', 3, 3);
    ok('v0.7.3: unprovoked, none of them counts as riled', ![sp, td, eg, cow].some(e => E.riled(e)));
    for (const e of [sp, td, eg, cow, dr]) { e.angry = true; e.angryAt = w.time; } eg.angryT = 12;
    ok('v0.7.3: provoked, the harmless spider, the toad, the wild eagle and the bison are riled; a tame eagle or a deer never is', [sp, td, eg, cow].every(e => E.riled(e)) && !E.riled(tm) && !E.riled(dr));
    const R = g.renderer, calls = [], dg = R.drawGlyph; R.drawGlyph = function (ch, color, px, py, size, rot, alpha, kx, ky) { calls.push({ ch, color, size: size / R.tile, kx: kx || 1 }); return dg.apply(this, arguments); };
    R.camInit = false; await sleep(120); calls.length = 0; await sleep(60); R.drawGlyph = dg;
    const look = (ch) => calls.filter(c => c.ch === ch);
    const allRed = (ch, size) => look(ch).length > 0 && look(ch).every(c => c.color === G.INK.red && Math.abs(c.size - size) < 1e-6);
    ok('v0.7.3: riled, the spider, toad and eagle are drawn red and a size up (0.85)', allRed('蛛', 0.85) && allRed('蟾', 0.85) && look('鷹').some(c => c.color === G.INK.red && Math.abs(c.size - 0.85) < 1e-6), calls.filter(c => '蛛蟾鷹'.indexOf(c.ch) >= 0).slice(0, 6).map(c => c.ch + c.size.toFixed(2) + c.color));
    ok('v0.7.3: …and the bison red and an eighth bigger', look('牛').some(c => c.color === G.INK.red && Math.abs(c.size - 0.95 * 1.12) < 1e-6), look('牛').slice(0, 2));
    // 無毒蟾惹了衝過來咬：傷二、不中毒
    for (const e of [sp, eg, cow, tm, dr]) E.remove(e); td.x = td.rx = X + 4; td.y = td.ry = Y; td.moveT = 0; td.calm = 0; td.atk = 0; const tx0 = td.x;
    const hp0 = p.hp; p.poisonT = 0; p.poisonPer = 0; await until(() => U.cheb(td.x, td.y, p.x, p.y) <= 1, 4000); await until(() => p.hp < hp0, 3000);
    ok('v0.7.3: a provoked harmless toad charges and bites (2, no poison)', td.x < tx0 && Math.abs((hp0 - p.hp) - 2 * g.takenMult()) < 0.6 && p.poisonT === 0, [tx0 - td.x, hp0 - p.hp, p.poisonT]);
    td.angryAt = w.time - 21; td.moveT = 0; E.update(0.01, g);
    ok('v0.7.3: twenty breaths later it calms down — no longer red, back to its own size', !td.angry && !E.riled(td));
    E.remove(td); p.hp = Math.max(p.hp, 80);
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) w.set(X + dx, Y + dy, w.base(X + dx, Y + dy)); p.x = p.rx = p0.x; p.y = p.ry = p0.y; }
  // ============ v0.7.2：野牛一乘二（橫著走拉扁、縱著走拉長）；主動找人的獸字大一號 ============
  { const X = p.x + 40, Y = p.y - 6, E = g.ents; for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) w.set(X + dx, Y + dy, '草');
    E.list = E.list.filter(e => e.type === '龍' || e.tame); const p0 = { x: p.x, y: p.y }; p.x = p.rx = X - 5; p.y = p.ry = Y + 5; E.px = p.x; E.py = p.y;
    const ox = E.add('牛', X, Y, { bx: 1, by: 0, moveT: 99, calm: 99 });
    ok('v0.7.2: a bison takes two tiles — head and the tile behind it', E.at(X, Y) === ox && E.at(X - 1, Y) === ox && E.beastAt(X - 1, Y) === ox && !E.at(X + 1, Y) && E.cellsOf(ox).length === 2);
    p.x = p.rx = X - 2; p.y = p.ry = Y; face(1, 0);
    ok('v0.7.2: you cannot walk into its hind tile', !g.tryStep(1, 0) && p.x === X - 2);
    const hp0 = ox.hp; g.addItem('石劍', 1); hold('石劍'); p.atkT = 0; g.pressGather(); p.x = p.rx = X - 5; p.y = p.ry = Y + 5; E.px = p.x; E.py = p.y;
    ok('v0.7.2: …but you can hit it there', ox.hp < hp0, [hp0, ox.hp]);
    const rr0 = Math.random; Math.random = () => 0; E.stepTo(ox, X + 5, Y, false, false);
    ok('v0.7.2: walking east it lies east–west, the hind tile trailing behind', ox.x === X + 1 && ox.y === Y && ox.bx === 1 && ox.by === 0 && E.at(X, Y) === ox, [ox.x - X, ox.y - Y, ox.bx, ox.by]);
    E.stepTo(ox, ox.x, Y - 6, false, false); Math.random = rr0;
    ok('v0.7.2: turning north it lies north–south, the hind tile below its head', ox.x === X + 1 && ox.y === Y - 1 && ox.bx === 0 && ox.by === -1 && E.at(X + 1, Y) === ox, [ox.x - X, ox.y - Y, ox.bx, ox.by]);
    ox.x = X; ox.y = Y; ox.bx = 1; ox.by = 0; w.set(X - 2, Y + 1, '磚'); w.set(X - 1, Y + 1, '磚'); w.set(X, Y + 1, '草');
    const okDown = E.bodyFits(X, Y + 1, 0, 1, false, ox), blocked = (() => { w.set(X, Y, '草'); w.set(X - 1, Y + 2, '磚'); return !E.bodyFits(X - 1, Y + 3, 0, 1, false, ox); })();
    ok('v0.7.2: a tile is only good for it if the tile behind its head is free too (a brick there blocks it)', okDown && blocked, [okDown, blocked]);
    // 畫法：攔下 drawGlyph 看大小與拉長
    const R = g.renderer, calls = []; const dg = R.drawGlyph; R.drawGlyph = function (ch, color, px, py, size, rot, alpha, kx, ky) { calls.push({ ch, size: size / R.tile, kx: kx || 1, ky: ky || 1 }); return dg.apply(this, arguments); };
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) w.set(p.x + dx, p.y + dy, '草');
    const add = (t, dx, dy, ex) => E.add(t, p.x + dx, p.y + dy, Object.assign({ moveT: 99, calm: 99 }, ex || {}));
    const show = [add('虎', 2, 0), add('豹', -2, 0), add('狼', 0, 2), add('豬', 0, -2), add('蛇', 2, 2), add('蛛', -2, -2, { venom: true }), add('蛛', 2, -2, { venom: false })];
    ox.x = ox.rx = p.x - 2; ox.y = ox.ry = p.y + 2; ox.bx = 1; ox.by = 0; ox.rbx = 1; ox.rby = 0;
    const tDay = w.time; setDay(0.9);   // 狼只在夜裡：白天會散
    R.camInit = false; await sleep(120); calls.length = 0; await sleep(60);   // 讓相機跟上、再收一兩幀
    const sz = (t) => calls.filter(c => c.ch === t).map(c => c.size);
    const one = (t) => (calls.find(c => c.ch === t) || {}).size, cow = calls.find(c => c.ch === '牛');
    ok('v0.7.2: leopards, wolves, boars and venomous spiders are drawn a size up (0.85), still a little smaller than the tiger (0.95); snakes and harmless spiders stay as they were', Math.abs(one('虎') - 0.95) < 1e-6 && Math.abs(one('豹') - 0.85) < 1e-6 && Math.abs(one('狼') - 0.85) < 1e-6 && Math.abs(one('豬') - 0.85) < 1e-6 && Math.abs(one('蛇') - 0.55) < 1e-6 && [...new Set(sz('蛛').map(v => v.toFixed(2)))].sort().join() === '0.55,0.85', calls.filter(c => '虎豹狼豬蛇蛛'.indexOf(c.ch) >= 0).map(c => c.ch + c.size.toFixed(2)).join(' '));
    ok('v0.7.2: a bison walking east–west is drawn stretched wide and flat', !!cow && cow.kx > 1.8 && cow.ky < 0.9, cow);
    ox.bx = 0; ox.by = 1; ox.rbx = 0; ox.rby = 1; calls.length = 0; await sleep(60); const cow2 = calls.find(c => c.ch === '牛');
    ok('v0.7.2: …and walking north–south, tall and narrow', !!cow2 && cow2.ky > 1.8 && cow2.kx < 0.9, cow2);
    R.drawGlyph = dg; w.time = tDay; calm(); for (const e of show) E.remove(e); E.remove(ox); g.removeItem('石劍', 9); p.tools = p.tools.filter(t => t.n !== '石劍'); p.tool = -1;
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) w.set(X + dx, Y + dy, w.base(X + dx, Y + dy));
    p.x = p.rx = p0.x; p.y = p.ry = p0.y; }
  // ============ v0.7.1：有耐久的東西用過一半才能翻新；已有更好的衣甲，低一等的那列標出來 ============
  { trim(['木', '石', '石子', '草', '土', '磚']); for (const k of ['襯', '甲', '褲', '盔', '靴', '帽']) g.takeOff(k); trim(['木', '石', '石子', '草', '土', '磚']);
    g.addItem('布甲', 1); hold('布甲'); g.pressPlace(); const vest = p.worn['甲'];
    g.addItem('麻布', 9); g.addItem('棉', 9); p.sta = 100; const mb0 = g.count('麻布'); g.craft('vest');
    ok('v0.7.1: re-making a 布甲 you wear with more than half its life left is refused (還新)', vest.dur > g.lifeOf(vest) * 0.5 && g.count('麻布') === mb0 && g.msgText.indexOf('用過一半才能翻新') >= 0, g.msgText);
    g.toggleCraft(); g.craftCat = '全部'; g.buildCraft(); await sleep(30);
    const row = (n) => [...document.querySelectorAll('#craft-list .recipe')].find(r => r.querySelector('b').textContent.indexOf(n) === 0);
    const r1 = row('布甲'); ok('v0.7.1: its craft row says 還新 and the 翻新 button is greyed out', !!r1 && r1.textContent.indexOf('還新') >= 0 && r1.textContent.indexOf('用過一半才能翻新') >= 0 && r1.querySelector('button').disabled, r1 && r1.textContent.slice(0, 60));
    vest.dur = g.lifeOf(vest) * 0.45; g.buildCraft(); const r2 = row('布甲');
    ok('v0.7.1: once more than half is worn the row offers 翻新 again', !!r2 && !r2.querySelector('button').disabled && r2.textContent.indexOf('還新') < 0);
    p.sta = 100; g.craft('vest');
    ok('v0.7.1: and re-making it renews it to full life', Math.abs(vest.dur - g.lifeOf(vest)) < 1e-6 && g.count('麻布') < mb0, vest.dur / DAY);
    g.addItem('鐵盔', 1); g.buildCraft(); const r3 = row('布帽'), r4 = row('內襯'), r5 = row('鐵盔'), r6 = row('鎢鋼盔');
    ok('v0.7.1: with a 鐵盔 in the bag the 布帽 row says 已有更好的「鐵盔」！; 鐵盔 itself and the stronger 鎢鋼盔 do not', !!r3 && r3.textContent.indexOf('已有更好的「鐵盔」！') >= 0 && (!r5 || r5.textContent.indexOf('已有更好的') < 0) && (!r6 || r6.textContent.indexOf('已有更好的') < 0), r3 && r3.textContent.slice(0, 40));
    ok('v0.7.1: 內襯 has nothing stronger, so it never gets that label', !!r4 && r4.textContent.indexOf('已有更好的') < 0 && g.betterPiece('內襯') === null && g.betterPiece('布褲') === null);
    g.toggleCraft();
    // 工具與漁網
    g.addItem('石刀', 1); const knife = p.tools.find(t => t.n === '石刀'); p.tool = p.tools.indexOf(knife); knife.dur = 30; g.addItem('石子', 9); const sz0 = g.count('石子'); p.sta = 100; g.craft('regrind');
    ok('v0.7.1: a 石刀 with 30 of 40 left cannot be reground yet', knife.dur === 30 && g.count('石子') === sz0 && g.msgText.indexOf('用過一半才能重磨') >= 0, g.msgText);
    knife.dur = 19; g.craft('regrind'); ok('v0.7.1: with 19 of 40 left it can', knife.dur === 40 && g.count('石子') < sz0);
    p.tools.splice(p.tools.indexOf(knife), 1); p.tool = -1;
    g.addItem('漁網', 1); g.addItem('棉', 9); g.addItem('麻', 9); const net = p.bag.find(x => x.n === '漁網'); net.dur = 20; hold('漁網'); const cm0 = g.count('棉'); p.sta = 100; g.craft('mendnet');
    ok('v0.7.1: a net with 20 of 30 left cannot be reinforced yet', net.dur === 20 && g.count('棉') === cm0 && g.msgText.indexOf('用過一半才能加固') >= 0, g.msgText);
    net.dur = 14; g.craft('mendnet'); ok('v0.7.1: with 14 of 30 left it can', net.dur === 30 && g.count('棉') < cm0);
    ok('v0.7.1: never-used things count as new; 竹筏 and other things without durability are not affected', g.leftFrac({ n: '漁網' }) === 1 && g.leftFrac({ n: '竹筏', c: 1 }) === null && g.canRenew({ n: '竹筏', c: 1 }));
    for (const k of ['甲']) g.takeOff(k); trim(['木', '石', '石子', '草', '土', '磚']); }
  // ============ v0.7：本島往外擴四成五（原本的地一格不動）、2500×2500 的紙與外島、新地形 ============
  { const sd = w.seed, home0 = { x: p.x, y: p.y }, il = G.islet(sd);
    let same = true, oldLand = 0, newLand = 0, inner = true, isletSame = true;
    for (let y = -125; y <= 125; y++) for (let x = -125; x <= 125; x++) {
      const a = G.oldTile(x, y, sd), b = G.baseTile(x, y, sd), la = G.DB[a].kind !== 'water';
      if (la) { oldLand++; if (a !== b) same = false; }
      if (G.DB[b].kind !== 'water') newLand++;
      if (!la && Math.hypot(x, y) < 0.55 * 85 && a !== b) inner = false;
      if (Math.hypot(x - il.cx, y - il.cy) <= 14 && a !== b) isletSame = false;
    }
    ok('v0.7: every tile of the old island stays exactly as it was (old saves keep their land)', same, oldLand);
    ok('v0.7: the island grows outward (seed 7: ' + oldLand + ' → ' + newLand + ' land tiles)', newLand / oldLand > 1.2 && newLand / oldLand < 1.9, newLand / oldLand);
    ok('v0.7: ponds deep inside the island and the lighthouse islet with its causeway are untouched', inner && isletSame);
    const pls = w.places.map(q => q.id + '@' + q.x + ',' + q.y).join(' ');
    ok('v0.7: landmarks, steles and the spawn sit exactly where they were before', pls === 'ta@-12,14 si@-31,-17 cun@-26,-21 chuan@-53,-27 quan@18,23 mu@-29,-2 dong@20,33 deng@-93,-27' && [...w.steles.keys()].join(' ') === '21,0 -7,35 -43,20 -33,-49 47,-12' && g.spawn.x === 3 && g.spawn.y === -1, [pls, g.spawn]);
    const all = G.isles(sd), kinds = {}; for (const i of all) kinds[i.kind] = (kinds[i.kind] || 0) + 1;
    ok('v0.7: about seventy outer islands of five kinds dot the 2500×2500 sea, none near home', all.length >= 50 && all.length <= 95 && Object.keys(kinds).length === 5 && all.every(i => G.isleOf(i.cx, i.cy, sd) === i && Math.hypot(i.cx, i.cy) >= 330), [all.length, kinds]);
    const sig = { '漠': '漠丘池棗', '火': '熔岩曜', '川': '川湖', '雪': '窟湯', '青': '草木' }, found = {};
    for (const k in sig) { const i = all.filter(q => q.kind === k).sort((a, b) => b.R - a.R)[0]; const got = new Set(); for (let y = Math.floor(i.cy - i.R); y <= i.cy + i.R; y++) for (let x = Math.floor(i.cx - i.R); x <= i.cx + i.R; x++) got.add(G.baseTile(x, y, sd)); found[k] = [...sig[k]].filter(c => got.has(c)).join(''); }
    ok('v0.7: each kind of island has its own terrain (漠丘池棗 / 熔岩曜 / 川湖 / 窟 / 草木)', found['漠'].length >= 3 && found['火'] === '熔岩曜' && found['川'] === '川湖' && found['雪'].indexOf('窟') >= 0 && found['青'] === '草木', found);
    // 登上一座外島
    const ri = all.filter(q => q.kind === '火').sort((a, b) => b.R - a.R)[0]; let spot = null;
    for (let r = 0; r < ri.R && !spot; r++) for (let a = 0; a < 360 && !spot; a += 10) { const x = Math.round(ri.cx + Math.cos(a * Math.PI / 180) * r), y = Math.round(ri.cy + Math.sin(a * Math.PI / 180) * r), d = G.DB[w.get(x, y)]; if (d.walk > 0 && d.kind !== 'water' && !w.nearChar(x, y, '熔', 2)) spot = [x, y]; }
    const c0 = p.cour, n0 = Object.keys(p.isles || {}).length;
    p.x = p.rx = spot[0]; p.y = p.ry = spot[1]; p.sailing = false; p.swimming = false; g.updateStats(0.01);
    ok('v0.7: stepping onto an outer island for the first time names it and gives courage', (p.isles || {})[ri.id] === 1 && Object.keys(p.isles).length === n0 + 1 && p.cour > c0 && toasts().indexOf('登上火島') >= 0, [p.cour - c0, spot]);
    g.hudSig = ''; g.updateHUD(); ok('v0.7: the status bar says which island you are on', document.getElementById('status').textContent.indexOf('火島 · ') >= 0, document.getElementById('status').textContent.slice(0, 80));
    w.markSeen(p.x, p.y, 9); const tb = performance.now(); g.renderer.drawBigMap(g, document.getElementById('bigmap')); const mapMs = performance.now() - tb, mv = g.renderer.mapView;
    ok('v0.7: the big map widens to take in the far island and the home island, and draws quickly', mv.N > 400 && mv.ox <= -G.HOME_R && mv.ox + mv.N >= p.x && mapMs < 400, [mv, Math.round(mapMs)]);
    p.cour = c0; delete p.isles[ri.id]; p.x = p.rx = home0.x; p.y = p.ry = home0.y; g.renderer.drawBigMap(g, document.getElementById('bigmap'));
    w.revealAll(0, 0); ok('v0.7: from the tower you see the whole grown island', w.isSeen(G.HOME_R - 3, 0) && w.isSeen(0, -(G.HOME_R - 3)));
    // 新地形：在家附近鋪一小塊試
    const X = home0.x + 34, Y = home0.y + 4, patch = (ch) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) w.set(X + dx, Y + dy, ch); };
    patch('草'); p.x = p.rx = X; p.y = p.ry = Y; p.sailing = false; p.swimming = false; calm(); p.caveK = 0; p.heatT = 0; p.poisonT = 0;
    w.set(X, Y, '漠'); setDay(0.5); p.sta = 50; g.updateStats(1); const staD = 50 - p.sta;
    ok('v0.7: in the desert by day stamina drains (−0.4 a second) instead of recovering', Math.abs(staD - 0.4) < 0.02, staD);
    setDay(0.9); const fw = (g.wornWarm() ? 0.5 : 1) * (g.torchLit() ? 0.4 : 1); p.warm = 60; g.updateStats(1); const wD = 60 - p.warm;
    w.set(X, Y, '草'); p.warm = 60; g.updateStats(1); const wG = 60 - p.warm;
    ok('v0.7: and at night the desert is colder than grass (warmth −0.8 a second more)', Math.abs((wD - wG) - 0.8 * fw) < 0.02, [wD, wG, fw]);
    setDay(0.5); calm(); w.set(X + 1, Y, '熔'); p.hp = 80; p.hurtT = 0; p.warm = 50; g.updateStats(1);
    ok('v0.7: right next to lava you get burned (−1.5 a second) but it keeps you warm', Math.abs(p.hp - 78.5) < 0.02 && p.warm > 53, [p.hp, p.warm]);
    w.set(X + 1, Y, '草'); w.set(X, Y, '湯'); p.hp = 50; p.san = 50; p.warm = 50; p.hurtT = 0; g.updateStats(1);
    ok('v0.7: soaking in a hot spring warms you and restores life and calm', p.hp > 50.9 && p.san > 50.15 && p.warm > 53, [p.hp, p.san, p.warm]);
    w.set(X, Y, '窟'); for (let i = 0; i < 6; i++) g.updateStats(0.5); const cd = g.viewDark(), dd0 = g.darkness();
    w.set(X, Y, '草'); for (let i = 0; i < 6; i++) g.updateStats(0.5);
    ok('v0.7: in a cave it is dark even at noon and light again outside (ghosts and beasts still go by the sun)', dd0 < 0.05 && cd > 0.8 && g.viewDark() < 0.1, [dd0, cd, g.viewDark()]);
    face(1, 0); w.set(X + 1, Y, '川'); g.addItem('玻璃瓶', 1); hold('玻璃瓶'); const fw0 = g.count('淡水瓶'), sw0 = g.count('海水瓶'); g.action = null; g.pressGather();
    ok('v0.7: a bottle dipped in a river comes up with fresh water, not sea water', g.count('淡水瓶') === fw0 + 1 && g.count('海水瓶') === sw0, g.msgText);
    g.addItem('竹筏', 1); ok('v0.7: a raft floats on rivers and lakes too', g.pass(X + 1, Y)); g.removeItem('竹筏', 1);
    w.set(X + 1, Y, '曜'); g.finishGather({ x: X + 1, y: Y, ch: '曜', t: 0, dur: 0 });
    ok('v0.7: an obsidian vein gives 黑曜石 and leaves 岩', g.count('黑曜石') === 1 && w.get(X + 1, Y) === '岩');
    g.addItem('黑曜石', 1); g.addItem('木', 1); g.addItem('麻', 1); p.sta = 100; g.craft('obsidian'); const ob = p.tools.find(t => t.n === '曜刃');
    ok('v0.7: two 黑曜石, a 木 and a 麻 make an 曜刃 that hits for 60', !!ob && G.ITEMS['曜刃'].dmg === 60 && G.ITEMS['曜刃'].tool === '刀' && g.count('黑曜石') === 0, ob);
    if (ob) { p.tool = p.tools.indexOf(ob); ob.dur = 3; g.addItem('石子', 2); const st0 = g.count('石子'); g.craft('regrind'); ok('v0.7: an 曜刃 cannot be reground — it is brittle', ob.dur === 3 && g.count('石子') === st0 && g.msgText.indexOf('磨不回來') >= 0, g.msgText); p.tools.splice(p.tools.indexOf(ob), 1); p.tool = -1; g.removeItem('石子', 2); }
    g.addItem('棗', 1); hold('棗'); p.food = 50; g.useItem(); ok('v0.7: a date is food (+15) and never ferments', Math.abs(p.food - 65) < 0.01 && !G.ITEMS['棗'].ferment, p.food);
    w.set(X + 2, Y, '窟'); const spi = g.ents.habitat('蛛', X + 2, Y, false); w.set(X + 2, Y, '丘'); const sna = g.ents.habitat('蛇', X + 2, Y, false); w.set(X + 2, Y, '漠'); const wol = g.ents.habitat('狼', X + 2, Y, true);
    ok('v0.7: spiders live in caves, snakes in dunes, and wolves roam the desert at night', spi && sna && wol, [spi, sna, wol]);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) w.set(X + dx, Y + dy, w.base(X + dx, Y + dy));
    g.removeItem('淡水瓶', 9); g.removeItem('玻璃瓶', 9); g.removeItem('黑曜石', 9); g.removeItem('木', 1); g.removeItem('麻', 1); p.x = p.rx = home0.x; p.y = p.ry = home0.y; calm(); p.food = 100; p.warm = 100;
    // 舊存檔：船停在長出來的新陸地上 → 挪到最近的海
    let ext = null; for (let r = 60; r < 125 && !ext; r++) for (let a = 0; a < 360 && !ext; a += 3) { const x = Math.round(Math.cos(a * Math.PI / 180) * r), y = Math.round(Math.sin(a * Math.PI / 180) * r); if (G.DB[G.oldTile(x, y, sd)].kind === 'water' && G.DB[G.oldTile(x, y + 1, sd)].kind === 'water' && G.DB[G.baseTile(x, y, sd)].kind !== 'water' && G.DB[G.baseTile(x, y + 1, sd)].kind !== 'water') ext = [x, y]; }
    const sv = JSON.parse(JSON.stringify(w.serialize())); sv.ships = { [ext[0] + ',' + ext[1]]: { kind: '孤帆', hp: 100, skulls: [], repairs: 0, cells: [[ext[0], ext[1]], [ext[0], ext[1] + 1]] } }; sv.diff[ext[0] + ',' + ext[1]] = '舟'; sv.diff[ext[0] + ',' + (ext[1] + 1)] = '舟';
    const w6 = new window.World(sd); w6.restore(sv, g.day()); const sh = [...w6.ships.values()][0];
    ok('v0.7: a ship an old save left where new land grew is moved to the nearest sea, the land under it restored', w6.movedShips === 1 && !!sh && sh.cells.every(([x, y]) => G.DB[w6.base(x, y)].kind === 'water') && w6.get(ext[0], ext[1]) === G.baseTile(ext[0], ext[1], sd), [w6.movedShips, sh && sh.cells, ext]);
    g.save(); const svo = JSON.parse(localStorage.getItem('xieyi.save.v5')); delete svo.player.isleNews; g.load(svo);
    ok('v0.7: loading a save from before the expansion tells you the island grew and the sea filled with islands', toasts().indexOf('島長大了') >= 0 && p.isleNews === true);
  }
  // ============ v0.6.10：鑿掉的鐵礦七到十日後在原地長回來（那時是石、草、白紙才行） ============
  { const X = p.x + 22, Y = p.y + 22, K = (x, y) => x + ',' + y, c0 = p.cour, r0 = U.trueRand;
    for (let i = 0; i < 4; i++) w.set(X + i, Y, '鐵');
    U.trueRand = () => 0; g.finishGather({ x: X, y: Y, ch: '鐵', t: 0, dur: 0 }); const lo = (w.ores.get(K(X, Y)) - w.time) / DAY;
    U.trueRand = () => 0.9999; g.finishGather({ x: X + 1, y: Y, ch: '鐵', t: 0, dur: 0 }); const hi = (w.ores.get(K(X + 1, Y)) - w.time) / DAY;
    U.trueRand = r0; g.finishGather({ x: X + 2, y: Y, ch: '鐵', t: 0, dur: 0 }); g.finishGather({ x: X + 3, y: Y, ch: '鐵', t: 0, dur: 0 });
    ok('v0.6.10: a mined iron vein turns to 石 and is booked to grow back in 7–10 days (true random)', w.get(X, Y) === '石' && w.ores.size >= 4 && Math.abs(lo - 7) < 1e-3 && Math.abs(hi - 10) < 1e-2, [lo, hi]);
    w.set(X + 1, Y, '草'); w.set(X + 2, Y, '白'); w.set(X + 3, Y, '磚');
    const sv = w.serialize(), w5 = new window.World(w.seed); w5.restore(JSON.parse(JSON.stringify(sv)), g.day());
    ok('v0.6.10: the regrowth times are saved and read back', w5.ores.size === w.ores.size && Math.abs(w5.ores.get(K(X, Y)) - w.ores.get(K(X, Y))) < 1e-3);
    w.set(X + 5, Y, '石'); w.ores.set(K(X + 5, Y), w.time + DAY); w.regrowOres();
    ok('v0.6.10: nothing grows back before its time', w.get(X + 5, Y) === '石' && w.ores.has(K(X + 5, Y)));
    for (const k of [K(X, Y), K(X + 1, Y), K(X + 2, Y), K(X + 3, Y)]) w.ores.set(k, w.time - 1);
    const ob = w.oreBlocked; w.oreBlocked = (x, y) => x === X && y === Y; w.regrowOres();
    ok('v0.6.10: on time, 草 and 白紙 turn back into iron; a 磚 built there stops it for good', w.get(X + 1, Y) === '鐵' && w.get(X + 2, Y) === '鐵' && w.get(X + 3, Y) === '磚' && !w.ores.has(K(X + 1, Y)) && !w.ores.has(K(X + 3, Y)), [w.get(X + 1, Y), w.get(X + 2, Y), w.get(X + 3, Y)]);
    ok('v0.6.10: someone standing on the 石 makes it wait instead of walling them in', w.get(X, Y) === '石' && w.ores.has(K(X, Y)));
    w.oreBlocked = ob; w.regrowOres();
    ok('v0.6.10: once they step off, the 石 turns back into iron', w.get(X, Y) === '鐵' && !w.ores.has(K(X, Y)));
    w.ores.clear(); for (let i = 0; i < 6; i++) w.set(X + i, Y, '草'); g.removeItem('鐵礦', 99); g.removeItem('鎢礦', 99); p.cour = c0; }
  // ============ v0.6.10：簡單餓得慢兩成 ============
  { const d0 = g.diff, f0 = p.food; p.food = 50; g.diff = XIEYI.DIFF.normal; g.updateStats(1); const dn = 50 - p.food; p.food = 50; g.diff = XIEYI.DIFF.easy; g.updateStats(1); const de = 50 - p.food; p.food = 50; g.diff = XIEYI.DIFF.hard; g.updateStats(1); const dh = 50 - p.food; g.diff = d0; p.food = f0;
    ok('v0.6.10: on easy hunger falls 20% slower than normal (hard as normal)', Math.abs(de - dn * 0.8) < 1e-3 && Math.abs(dh - dn) < 1e-3 && Math.abs(dn - 0.14 * g.ironDrain()) < 1e-3 && XIEYI.DIFF.easy.hunger === 0.8, [dn, de, dh]); }
  // ============ v0.6.10：魚多八成、鷹多兩成五 ============
  { const r0 = Math.random; Math.random = () => 0.99; const lo = g.ents.spawnCaps(false, 1); Math.random = () => 0.01; const hi = g.ents.spawnCaps(false, 1); Math.random = r0;
    let fs = 0, es = 0; for (let i = 0; i < 4000; i++) { const c = g.ents.spawnCaps(false, 1); fs += c['魚']; es += c['鷹']; }
    ok('v0.6.10: nearby fish cap 8 → 14.4 on average (14 or 15), eagles 2 → 2.5 (2 or 3)', lo['魚'] === 14 && hi['魚'] === 15 && lo['鷹'] === 2 && hi['鷹'] === 3 && Math.abs(fs / 4000 - 14.4) < 0.06 && Math.abs(es / 4000 - 2.5) < 0.06, [fs / 4000, es / 4000]); }
  // ============ v0.6.9／v0.6.10：製作欄各欄每列對齊（v0.6.10 拿掉衍生樹，品名全在同一欄） ============
  { g.addItem('燈帽', 1); g.toggleCraft(); g.craftCat = '全部'; g.buildCraft(); await sleep(60);
    const rows = [...document.querySelectorAll('#craft-list .recipe')], info = rows.map(r => ({ x: Math.round(r.querySelector('b').getBoundingClientRect().left), sta: Math.round(r.querySelector('.sta').getBoundingClientRect().left), choose: r.classList.contains('choose'), btn: Math.round(r.querySelector('.btns').getBoundingClientRect().left) }));
    ok('v0.6.10: every item name starts in the same column (1 and 10 alike), no level indents', rows.length === G.RECIPES.length && new Set(info.map(r => r.x)).size === 1, [...new Set(info.map(r => r.x))]);
    ok('v0.6.9: the stamina and button columns line up on every row (a wider 翻新 button no longer pushes them)', new Set(info.map(r => r.sta)).size === 1 && new Set(info.filter(r => !r.choose).map(r => r.btn)).size === 1, [[...new Set(info.map(r => r.sta))], [...new Set(info.filter(r => !r.choose).map(r => r.btn))]]);
    ok('v0.6.9: the forge rows are named for what they make', G.RECIPES.find(r => r.id === 'forge').title === '鍛鋼具' && G.RECIPES.find(r => r.id === 'forgew').title === '鍛鎢鋼具');
    g.toggleCraft(); g.removeItem('燈帽', 9); }
  // ============ v0.6.9：光是從燈芯射出去的線，碰到牆角斜斜地切開，不是一格一格的方塊 ============
  { const R = g.renderer, lx = p.x - 30, ly = p.y - 30; for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) w.set(lx + dx, ly + dy, '草');
    for (let dx = -1; dx <= 1; dx++) w.set(lx + dx, ly - 2, '磚');
    const sh = R.lightShape(w, lx + 0.5, ly + 0.5, 6);
    const inside = (x, y) => { const pl = sh.poly; let c = false; for (let i = 0, j = pl.length - 2; i < pl.length; j = i, i += 2) { const xi = pl[i], yi = pl[i + 1], xj = pl[j], yj = pl[j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    const behind = inside(lx + 0.5, ly - 3.5), pastEnd = inside(lx + 5.5, ly - 3.5), near = inside(lx + 0.5, ly + 2.5), split = !inside(lx + 4.05, ly - 3.2) && inside(lx + 4.6, ly - 3.2);   // 斜邊從牆的右下角 45° 射出去：在 lx+4.2 處把同一格切開
    ok('v0.6.9: a lamp\'s light is a polygon cast from the wick: right behind a wall is dark, past the wall\'s end the slanting ray gets through', !!sh && sh.poly.length > 16 && !behind && pastEnd && near && sh.rects.length >= 3, [behind, pastEnd, near, sh && sh.rects.length]);
    ok('…and the shadow edge runs on the slant from the wall\'s corner, cutting through a tile rather than along tile lines', split, [inside(lx + 4.05, ly - 3.2), inside(lx + 4.6, ly - 3.2)]);
    const again = R.lightShape(w, lx + 0.5, ly + 0.5, 6); w.set(lx + 5, ly + 5, '石'); const fresh = R.lightShape(w, lx + 0.5, ly + 0.5, 6);
    ok('…cached until the ground changes', again === sh && fresh !== sh);
    for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) w.set(lx + dx, ly + dy, w.base(lx + dx, ly + dy)); }
  // ============ v0.6.8：玩家看得到的數一律整數，零頭攢著補（每下 53.13 → −53 −53 −53 −53 −54 …） ============
  { const pd = g.ents.add('豹', p.x + 30, p.y + 30, { moveT: 99, calm: 99 }); pd.hp = 1000; const seq = [];
    for (let i = 0; i < 8; i++) { pd.hp -= 53.13; seq.push(g.shown('dmg', 53.13, pd)); }
    const sumShown = seq.reduce((a, b) => a + b, 0);
    ok('v0.6.8: a 53.13 hit shows −53 four times, then −54 (the four 0.13s made 0.52), and the over-shown 0.48 is taken back later', seq.slice(0, 5).join(',') === '53,53,53,53,54' && seq.every(Number.isInteger) && Math.abs(sumShown - 53.13 * 8) < 0.5, seq);
    ok('…and the beast\'s shown remaining life is its life minus the numbers you saw', g.shownHp(pd) === 1000 - sumShown, [g.shownHp(pd), 1000 - sumShown]);
    g.ents.remove(pd);
    const halves = []; for (let i = 0; i < 6; i++) halves.push(g.shown('test-half', 0.5));
    ok('…half points alternate 1, 0, 1, 0 so they add up right', halves.join(',') === '1,0,1,0,1,0', halves);
    const keepT2 = p.tools, keepI2 = p.tool; p.tools = [{ n: '石劍', c: 1, dur: 40 }]; p.tool = 0;
    const near2 = (e) => e.type !== '龍' && U.cheb(e.x, e.y, p.x, p.y) <= 2; g.ents.list = g.ents.list.filter(e => !near2(e));   // 身邊別的生靈先請走，免得打到別隻
    const tg2 = g.ents.add('虎', p.x + 1, p.y, { moveT: 99, calm: 99 }); face(1, 0); p.atkT = 0; g.pressGather(); await sleep(30);
    const floats = g.fx.filter(f => f.type === 'float').map(f => f.text);
    ok('v0.6.8: damage floats and the facing hint show whole numbers only', floats.length > 0 && floats.every(t => !/\d\.\d/.test(t)) && !/\d\.\d/.test(document.getElementById('msg').textContent), [floats.slice(-2), document.getElementById('msg').textContent.slice(0, 40)]);
    g.ents.remove(tg2); g.ents.list = g.ents.list.filter(e => !near2(e)); p.tools = keepT2; p.tool = keepI2; g.barSig = ''; g.buildBag(); }
  // ============ v0.6.8：裝著東西的櫃放得進櫃、拿得回來；磚旁邊亮的磚也亮；村裡的墟、門不會自己長回來 ============
  { const X = p.x, Y = p.y; face(1, 0); const cx = X + 1, cy = Y, keep = w.get(cx, cy); w.set(cx, cy, '櫃'); w.chests.set(cx + ',' + cy, []);
    p.bag.push({ n: '櫃', c: 1, store: [{ n: '石', c: 3 }, { n: '木', c: 2 }] }); g.barSig = ''; g.openChest({ x: cx, y: cy }); await sleep(30);
    const bi = p.bag.findIndex(s => s.n === '櫃' && s.store); g.moveStack('bag', bi); const box = w.chests.get(cx + ',' + cy), inBox = box.find(s => s.n === '櫃');
    ok('v0.6.8: a 櫃 with things in it goes into another 櫃, things and all, and the panel says how many', !!inBox && inBox.store.length === 2 && !p.bag.some(s => s.n === '櫃' && s.store) && [...document.querySelectorAll('#chest-grid .slot')].some(el => el.textContent.indexOf('2樣') >= 0));
    g.moveStack('chest', box.indexOf(inBox)); const back = p.bag.find(s => s.n === '櫃' && s.store);
    ok('…and comes back out with its things still inside', !!back && back.store.length === 2 && back.store[0].n === '石' && !box.some(s => s.n === '櫃'));
    g.closeChest(); p.bag.splice(p.bag.indexOf(back), 1); w.chests.delete(cx + ',' + cy); w.set(cx, cy, keep); g.barSig = ''; g.buildBag(); }
  { const R = g.renderer, lx = p.x - 20, ly = p.y + 20; for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) w.set(lx + dx, ly + dy, Math.max(Math.abs(dx), Math.abs(dy)) === 3 ? '磚' : '草');
    w.set(lx, ly, '燈'); const vis = R.sight(w, lx, ly, 6), W = 13, at = (dx, dy) => vis[(dy + 6) * W + dx + 6];
    let ring = true, out = false; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === 3 && !at(dx, dy)) ring = false;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === 4 && at(dx, dy)) out = true;
    ok('v0.6.8: a lamp in a brick room lights every brick of its walls (a brick next to a lit tile is lit), but nothing beyond them', !!vis && ring && !out, [ring, out]);
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) w.set(lx + dx, ly + dy, w.base(lx + dx, ly + dy)); }
  { const vil = w.places.find(q => q.id === 'cun'); let rx = null, ry = null;
    if (vil) for (let dy = 0; dy < vil.h && rx === null; dy++) for (let dx = 0; dx < vil.w; dx++) if (w.base(vil.x + dx, vil.y + dy) === '墟') { rx = vil.x + dx; ry = vil.y + dy; break; }
    ok('v0.6.8: blank paper over a village 墟 is written back as earth, not as the ruin again (墟 never mends itself)', rx !== null && w.rewriteBlank(rx, ry) === '土' && w.rewriteBlank(p.x, p.y) === w.base(p.x, p.y), [rx, ry]); }
  g.save(); const sv = JSON.parse(localStorage.getItem('xieyi.save.v5'));
  ok('save v5 keeps sanity, courage, scarecrows and chests', sv && sv.v === 5 && typeof sv.player.san === 'number' && typeof sv.player.cour === 'number' && sv.world.scarecrows && sv.world.chests && sv.player.places.ta === 2);
  // —— 三格存檔：第一格沿用舊鍵；每格帶摘要
  ok('eight save slots: slot 1 keeps the old key, slots 2–8 get suffixes, autostart plays slot 1', XIEYI.Game.slotKey(1) === 'xieyi.save.v5' && XIEYI.Game.slotKey(2) === 'xieyi.save.v5.2' && XIEYI.Game.slotKey(3) === 'xieyi.save.v5.3' && XIEYI.Game.slotKey(8) === 'xieyi.save.v5.8' && g.slot === 1);
  ok('the save carries a brief: day, night, level, deaths, slept nights', !!sv.brief && sv.brief.day === g.day() && sv.brief.night === g.nightNo() && sv.brief.level === g.level() && typeof sv.brief.deaths === 'number' && typeof sv.brief.nights === 'number', sv.brief);
  { const m = XIEYI.Game.summary(sv);
    ok('summary of a save names island, difficulty, day, night, level and time', m.seed === g.seed && m.diff === g.diff.name && m.day === g.day() && m.level === g.level() && /^第 \d+ 日$/.test(m.dayText) && /\d\d\/\d\d \d\d:\d\d/.test(m.whenText), m);
    const old = JSON.parse(JSON.stringify(sv)); delete old.brief; const mo = XIEYI.Game.summary(old);
    ok('an old save without a brief still gets day, night and level from time and courage', mo.day === m.day && mo.night === m.night && mo.level === m.level && mo.deaths === p.deaths);
    const t0 = w.time; w.time = 0; ok('v0.6.10: a save card names only the day — 第 N 日, no night', (() => { const at = (tt) => { w.time = tt; return XIEYI.Game.summary({ world: { time: tt }, player: {}, savedAt: 1 }).dayText; }; return at(0) === '第 1 日' && at(DAY * 0.83) === '第 1 日' && at(DAY * 1.4) === '第 2 日' && at(DAY * 1.1) === '第 2 日'; })()); w.time = t0;
    g.slot = 2; g.save(); const s2 = XIEYI.Game.readSave(2); g.slot = 1;
    ok('saving while in slot 2 writes slot 2 only and leaves slot 1 as it was', !!s2 && s2.seed === g.seed && XIEYI.Game.readSave(1).savedAt === sv.savedAt && XIEYI.Game.readSave(3) === null);
    XIEYI.Game.clearSave(2); ok('clearing slot 2 empties only slot 2', XIEYI.Game.readSave(2) === null && !!XIEYI.Game.readSave(1));
    g.toggleJournal(); const jslot = document.getElementById('journal-body').textContent.indexOf('存檔第一格') >= 0; g.toggleJournal();
    ok('the journal says which slot this game is saved in', jslot); }

  // ============ v0.8.22：神兵在製作欄「神兵」那一類就修得到（不必拿在手上），用過一半才修，料是鎢鋼的兩倍 ============
  { const keepB = p.bag, keepT = p.tools, keepI = p.tool, sta0 = p.sta, food0 = p.food, cat0 = g.craftCat;
    p.tools = [{ n: '石刀', c: 1, dur: 30 }]; p.tool = 0; p.bag = [{ n: '燭龍焚溟', c: 1, dur: 150 }, { n: '鐵', c: 10 }]; p.sta = 100; p.food = 100;
    g.craftCat = '神兵'; g.toggleCraft(); let row = document.querySelector('#craft-list .recipe.godfix');
    ok('v0.8.22: under 神兵 the first row mends a god weapon you are not holding — not yet, it is barely used', !!row && /修燭龍焚溟/.test(row.textContent) && /耐久 150／199/.test(row.textContent) && row.querySelector('button').disabled && /用過一半才能修/.test(row.textContent), row && row.textContent);
    p.bag[0].dur = 80; g.buildCraft(); row = document.querySelector('#craft-list .recipe.godfix'); row.querySelector('button').click();
    ok('v0.8.22: …used past half: one press mends it to full for 鐵 2 (twice the tungsten rate), 力 16, 飽 20; next time 鐵 4', p.bag[0].dur === 199 && p.bag[0].rg === 1 && g.count('鐵') === 8 && p.sta === 84 && p.food === 80 && /下次要鐵 4/.test(g.msgText), [p.bag[0].dur, g.count('鐵'), p.sta, p.food, g.msgText]);
    g.toggleCraft(); g.craftCat = cat0; p.bag = keepB; p.tools = keepT; p.tool = keepI; p.sta = sta0; p.food = food0; g.barSig = ''; }
  // ============ v0.8.22：「服了？服了！」的條件——全程困難（換過別的難度就不算）、一顆十字星都沒拿；開局暗示一句 ============
  { const keepH = p.hardOnly, rd = () => JSON.parse(localStorage.getItem(XIEYI.Game.slotKey(g.slot))).player.hardOnly;
    p.hardOnly = true; g.save(); const s1 = rd(); p.hardOnly = false; g.save(); const s0 = rd();
    ok('v0.8.22: the save carries the "hard all the way" flag', s1 === true && s0 === false, [s1, s0, !!g.frozen, p.dead, g.slot]);
    const sv = JSON.parse(localStorage.getItem(XIEYI.Game.slotKey(g.slot))), dk = g.diff; delete sv.player.hardOnly; sv.diff = 'hard'; g.diff = XIEYI.DIFF.hard; g.load(sv); const oldHard = p.hardOnly;
    sv.player.hardOnly = true; g.diff = XIEYI.DIFF.normal; g.load(sv); const offHard = p.hardOnly; g.diff = dk;
    ok('v0.8.22: an older save on hard counts as hard so far (we cannot know); read on another difficulty, it is lost', oldHard === true && offHard === false, [oldHard, offHard]);
    p.hardOnly = keepH; }
  // ============ v0.8.23：共工的加成＝公式＋獨力（相加不相乘）；成就頁列「服了？服了！」的條件；第四顆珠輸了的樣子；困難存檔換難度時的暗示 ============
  { const keep = { bosses: p.bosses, azure: p.azure, bai: p.bai, zhu: p.zhu, hardOnly: p.hardOnly, jingFor: p.jingFor, gongLost: p.gongLost };
    p.bosses = { '封豨': { jing: false, solo: true }, '大風': { jing: false, solo: true }, '修蛇': { jing: false, solo: true } };
    ok('v0.8.23: 共工 after three crosses, all three slain alone: with its scroll 1.6 + 0.3 = 1.9; without, 1.6 × 1.2⁴ + 0.3 ≈ 3.6178 (added, not multiplied)', g.gongK(true) === 1.9 && Math.abs(g.gongK(false) - (1.6 * Math.pow(1.2, 4) + 0.3)) < 1e-4, [g.gongK(true), g.gongK(false)]);
    p.bosses = { '封豨': { jing: true, solo: false } }; ok('v0.8.23: …no cross, one slain with a guard: with the scroll ×1, without ×1.2', g.gongK(true) === 1 && g.gongK(false) === 1.2, [g.gongK(true), g.gongK(false)]);
    p.hardOnly = true; p.azure = false; p.bai = false; p.zhu = false; p.bosses = { '修蛇': { jing: false } }; p.jingFor = null; p.gongLost = undefined;
    const t = document.createElement('div'); t.innerHTML = g.teaseHtml(); const li = [...t.querySelectorAll('li')];
    ok('v0.8.23: the achievements list the conditions — hard all the way, no cross-star, the three slain without scrolls (1／3), no 共工 scroll, slay 共工 — and leave it a riddle', li.length === 5 && li.every(x => x.className === 'ok') && /1／3/.test(li[2].textContent) && /是不是最後藏著的那一件/.test(t.textContent), li.map(x => x.className + ':' + x.textContent));
    p.hardOnly = false; p.bai = true; p.bosses = { '修蛇': { jing: true } }; t.innerHTML = g.teaseHtml(); const li2 = [...t.querySelectorAll('li')];
    ok('v0.8.23: …the ones already broken are struck out (difficulty changed, a star taken, one slain with its scroll)', li2[0].className === 'no' && li2[1].className === 'no' && li2[2].className === 'no' && li2[3].className === 'ok', li2.map(x => x.className));
    p.bosses = { '封豨': { jing: false }, '大風': { jing: false }, '修蛇': { jing: false } }; p.gongLost = 'none'; const b1 = g.beadOf('共工'); p.jingFor = '共工'; p.gongLost = 'jing'; const b2 = g.beadOf('共工'); p.gongLost = undefined; const b3 = g.beadOf('共工'); p.jingFor = null; const b4 = g.beadOf('共工');
    ok('v0.8.23: the fourth bead — beaten by 共工 without its scroll, a small grey dot; beaten holding it, the red question mark stays; holding it, a red dot; otherwise a grey question mark', b1 === '' && b2 === 'trialOn' && b3 === 'got' && b4 === 'ask', [b1, b2, b3, b4]);
    Object.assign(p, keep); g.courSig = ''; }
  { const keepH = p.hardOnly, other = g.diff.key === 'easy' ? 'normal' : 'easy', hn = () => document.getElementById('pause-diff-hint');
    p.hardOnly = true; g.togglePause(); const before = hn().classList.contains('hidden'); g.changeDiff(other); const after = !hn().classList.contains('hidden') && /誰也不靠/.test(hn().textContent);
    g.togglePause(); g.togglePause(); const reset = hn().classList.contains('hidden'); g.togglePause();
    p.hardOnly = false; g.togglePause(); g.changeDiff(other); const notShown = hn().classList.contains('hidden'); g.togglePause(); clearTimeout(g.diffArmT); g.diffArm = null; p.hardOnly = keepH;
    ok('v0.8.23: in a save that has stayed on hard, arming another difficulty pops the same hint; not in other saves', before && after && reset && notShown, [before, after, reset, notShown]); }

  // ============ v0.8.24：大地圖放大縮小；龍淵十五到二十格那一圈的小礁 ============
  { const cv = document.getElementById('bigmap'); g.mapZoom = 0; g.toggleMap(); await sleep(60); const v1 = Object.assign({}, g.renderer.mapView), lab1 = document.getElementById('map-zoom').textContent;
    await press('Equal', 20); await sleep(30); const v2 = Object.assign({}, g.renderer.mapView);
    ok('v0.8.24: the big map zooms — + doubles it around you (×1 is everything you have walked)', v1.zoom === 1 && lab1 === '全圖' && v2.zoom === 2 && v2.N === Math.max(60, Math.round(v1.fitN / 2)) && Math.abs(v2.ox + v2.N / 2 - p.x) <= 1 && Math.abs(v2.oy + v2.N / 2 - p.y) <= 1 && document.getElementById('map-zoom').textContent === '×2', [v1.N, v2.N, v2.ox, p.x]);
    for (let i = 0; i < 14; i++) cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    const v3 = Object.assign({}, g.renderer.mapView);
    ok('v0.8.24: the wheel zooms too, halving the range each step, however far you have walked; v0.8.25: all the way in you see only the round thirty tiles about you (paper over the rest), written in glyphs', v3.N === 60 && v3.circle === 30 && !v2.circle && v3.zoom === Math.pow(2, g.mapZoom) && g.mapZoom === Math.ceil(Math.log2(v1.fitN / 60)) && v3.px >= 10 && document.getElementById('map-in').disabled && document.getElementById('map-zoom').textContent === '×' + v3.zoom, [v1.fitN, g.mapZoom, v3.N, v3.px, v3.circle]);
    const ox0 = g.renderer.mapView.ox; await press('ArrowRight', 20); const ox1 = g.renderer.mapView.ox; const px0 = p.x;
    ok('v0.8.24: zoomed in, the arrow keys move the map (not you)', ox1 - ox0 === Math.round(v3.N / 6) && p.x === px0, [ox0, ox1]);
    for (let i = 0; i < 14; i++) await press('Minus', 10); const v4 = g.renderer.mapView;
    ok('v0.8.24: − all the way back is the whole map again', v4.zoom === 1 && v4.N === v1.N && v4.ox === v1.ox && document.getElementById('map-out').disabled, [v4.N, v1.N]);
    g.toggleMap(); }
  { const zl = G.zones(g.seed).find(z => z.id === '青龍'), rs = G.reefs(g.seed), all = rs.flat(), T = (x, y) => G.baseTile(x, y, g.seed);
    const gap = rs.every((c, i) => rs.every((o, j) => j <= i || c.every(([x, y]) => o.every(([u, v]) => Math.max(Math.abs(x - u), Math.abs(y - v)) > 5))));
    ok('v0.8.24: 龍淵 has small reefs, four to ten tiles each, all fifteen to twenty tiles from its heart, which stays deep water; v0.8.25: two to five of them, five tiles of water apart at least', rs.length >= 2 && rs.length <= 5 && gap && rs.every(c => c.length >= 4 && c.length <= 10) && all.every(([x, y]) => { const d = Math.hypot(x - zl.x, y - zl.y); return d >= 15 && d <= 20 && G.DB[T(x, y)].kind !== 'water'; }) && T(zl.x, zl.y) === '淼' && T(zl.x + 10, zl.y) === '淼', rs.map(c => c.length));
    const keep = { x: p.x, y: p.y, fx: p.fx, fy: p.fy, sailing: p.sailing, ship: p.ship, swimming: p.swimming }, c0 = rs[0][0], nb = rs[0].find(([x, y]) => Math.abs(x - c0[0]) + Math.abs(y - c0[1]) === 1);
    p.sailing = false; p.ship = null; p.swimming = false; p.x = p.rx = nb[0]; p.y = p.ry = nb[1]; g.ents.px = p.x; g.ents.py = p.y; p.fx = c0[0] - nb[0]; p.fy = c0[1] - nb[1]; g.ents.list = g.ents.list.filter(e => !(e.x === c0[0] && e.y === c0[1]));
    g.addItem('灶', 1); hold('灶'); g.pressPlace(); const placed = w.get(c0[0], c0[1]) === '灶';
    ok('v0.8.24: …and on a reef you can set down a 灶 (the first tile of each reef is sand)', T(c0[0], c0[1]) === '沙' && placed, [T(c0[0], c0[1]), w.get(c0[0], c0[1]), g.msgText]);
    w.set(c0[0], c0[1], '沙'); g.removeItem('灶', 9); Object.assign(p, keep); p.rx = p.x; p.ry = p.y; g.ents.px = p.x; g.ents.py = p.y; }

  // ============ v0.8.25：存檔寫不進去要說一聲 ============
  { const toasts = () => [...document.querySelectorAll('#toasts .toast b')].filter(b => b.textContent === '存檔沒存進去').length, n0 = toasts(), real = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); };
    let r1, r2; try { g.saveBad = 0; r1 = g.save(); r2 = g.save(); } finally { Storage.prototype.setItem = real; }
    const n1 = toasts(), body = [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).find(t => t.indexOf('存檔沒存進去') === 0) || '';
    const r3 = g.save();
    ok('v0.8.25: when the browser will not take the save, a note says so once (space full: delete unused slots), not on every autosave; the next good save clears it', r1 === false && r2 === false && n1 - n0 === 1 && /空間滿了/.test(body) && r3 === true && g.saveBad === 0, [r1, r2, n1 - n0, body.slice(0, 40), r3, g.saveBad]); }

  // ============ v0.8.25：畢方、對空神兵彤弓素矰、大風（大魔王）與大風卷、窒與亂 ============
  { const E = g.ents, DB = G.DB, keep = { x: p.x, y: p.y, fx: p.fx, fy: p.fy }, cour0 = p.cour, tk = p.tools, tl = p.tool, hpm = p.hpMax;
    const put = (x, y) => { p.sailing = false; p.ship = null; p.swimming = false; p.x = p.rx = x; p.y = p.ry = y; E.px = x; E.py = y; p.moveT = 0; };
    const clear = (cx, cy, r) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) w.set(cx + i, cy + j, '土'); };
    E.list = E.list.filter(e => e.tame); g.paused = true;
    // —— 畢方
    const fire = G.isles(g.seed).find(i => i.kind === '火'), land = fire && g.nearestTile(fire.cx, fire.cy, (x, y) => { const d = DB[w.get(x, y)]; return d.walk > 0 && d.kind !== 'water' && !d.bog && !G.zoneAt(x, y, g.seed); }, 60);
    if (land) put(land[0], land[1]); const onFire = g.fireIsle(); put(keep.x, keep.y); const atHome = g.fireIsle();
    ok('v0.8.25: 畢方 comes only on a 火島 (on land), not at home', !!land && onFire && !atHome, [fire && fire.name, onFire, atHome]);
    clear(p.x, p.y, 6); p.hpMax = Math.max(p.hpMax, 100); p.hp = p.hpMax;
    const bd = E.add('畢', p.x + 3, p.y, { moveT: 99, cryT: 99 });
    ok('v0.8.25: 畢方 has 600 at base, by difficulty like the other mini bosses (800 on 一般)', DB['畢'].hp === 600 && bd.max === g.bigHp(600) && (g.diff.key !== 'normal' || bd.max === 800), [bd.max]);
    g.fires = []; const b0 = [bd.x, bd.y]; E.birdHop(bd, g, p, false, false);
    ok('v0.8.25: it hops two at a time, and where it lands a 訛火 starts', U.cheb(bd.x, bd.y, b0[0], b0[1]) === 2 && g.fires.some(f => f.x === bd.x && f.y === bd.y), [b0, [bd.x, bd.y], g.fires]);
    p.hp = 50; g.fires = [{ x: p.x, y: p.y, t: 7 }]; g.fireTick(1); const burnt = U.r4(50 - p.hp); g.fireTick(7);
    ok('v0.8.25: standing in 訛火 burns 3 a breath (灼, not lessened); it dies out after seven', burnt === 3 && g.fires.length === 0, [burnt, g.fires.length]);
    g.fireMarks = []; g.fires = []; g.birdCry(bd); const mk = g.fireMarks.length, mine = g.fireMarks.some(m => m.x === p.x && m.y === p.y); g.fireTick(1.05);
    ok('v0.8.25: its cry rings three cells about you (yours too); a breath later they burn', mk === 3 && mine && g.fires.length === 3 && g.fireMarks.length === 0, [mk, mine, g.fires.length]);
    g.miniSig = null; g.miniBars(); const mb = document.getElementById('minibars').textContent;
    ok('v0.8.25: it gets a mini-boss bar of its own', /畢方/.test(mb), mb);
    p.hp = p.hpMax; g.removeItem('畢方羽', 99); g.kill(bd); const fe = g.count('畢方羽');
    ok('v0.8.25: slain, it leaves one or two 畢方羽 and its fires go out', (fe === 1 || fe === 2) && g.fires.length === 0 && p.codex['畢方'] >= 1, [fe, g.fires.length]);
    g.removeItem('畢方羽', 99);
    // —— 彤弓素矰
    const rc = G.RECIPES.find(r => r.out === '彤弓素矰');
    ok('v0.8.25: the sky god weapon 彤弓素矰 is a 神兵 recipe — 畢方羽 6, 鎢鋼 3, 竹 6, 麻布 3, at 卅一重', !!rc && rc.cat === '神兵' && rc.need['畢方羽'] === 6 && rc.need['鎢鋼'] === 3 && rc.need['竹'] === 6 && rc.need['麻布'] === 3 && rc.level === 31, rc && rc.need);
    p.cour = 99999; g.courSig = ''; p.tools = [{ n: '彤弓素矰', c: 1, dur: 199 }]; p.tool = 0; p.fx = 1; p.fy = 0;
    const full = U.r4(g.godDmg('彤弓素矰') * g.dmgMult());
    const hp1 = E.add('雕', p.x + 6, p.y, { mode: 'circle', moveT: 99, diveT: 99, cryT: 99 }); p.atkT = 0; const tg = g.skyTarget(), h0 = hp1.hp; g.pressGather(); const dSky = U.r4(h0 - hp1.hp);
    ok('v0.8.25: E with 彤弓素矰 shoots the 蠱雕 circling six away — full 120 (by difficulty) — and the silk ties it down (繳)', tg === hp1 && Math.abs(dSky - full) < 0.01 && hp1.mode === 'tied' && hp1.tiedT === 2.5 && !!E.at(hp1.x, hp1.y), [dSky, full, hp1.mode]);
    hp1.mode = 'circle'; hp1.tiedT = 0; p.atkT = 0; g.pressGather();
    ok('v0.8.25: the same one cannot be tied again for ten breaths', hp1.mode === 'circle' && hp1.tieCD > 0, [hp1.mode, hp1.tieCD]);
    E.remove(hp1); const tg2 = E.add('虎', p.x + 4, p.y, { moveT: 99, calm: 99 }); p.atkT = 0; const t0 = tg2.hp; g.pressGather(); const dGround = U.r4(t0 - tg2.hp);
    ok('v0.8.25: on a beast on the ground it does only a tenth (the user: a bow would be turned on land and sea)', Math.abs(dGround - U.r4(full * 0.1)) < 0.01, [dGround, full]);
    E.remove(tg2); p.tools = [{ n: '九閽鳴雷', c: 1, dur: 199 }]; p.tool = 0;
    const hx = E.add('雕', p.x + 1, p.y, { mode: 'dive', moveT: 99, cryT: 99 }); p.atkT = 0; const hh = hx.hp; g.pressGather(); const dH = U.r4(hh - hx.hp);
    ok('v0.8.25: 九閽鳴雷 now does half to what flies (蠱雕), as 燭龍焚溟 does', Math.abs(dH - U.r4(g.godDmg('九閽鳴雷') * g.dmgMult() * 0.5)) < 0.01, [dH]); E.remove(hx);
    // —— 大風
    const z = g.bossZone('大風'), kW = g.windK();
    ok('v0.8.25: 陸海比 — the sea share of 青丘 (as first generated) cuts 大風 by up to 14%', kW >= 0.86 && kW < 1, kW);
    put(z.x, z.y); clear(z.x, z.y, 8); p.inBoss = p.inBoss || {}; p.inBoss['大風'] = true; p.hp = p.hpMax; p.sta = p.staMax; p.lockT = 0; p.guardT = 0;
    g.startFight('大風', 'jing'); const wd = g.bossEnt();
    ok('v0.8.25: in 青丘 the fight with 大風 starts; it is up in the sky; its life is 1600 by difficulty × 加成 × 陸海比', !!wd && wd.type === '大風' && wd.state === 'sky' && Math.abs(wd.max - U.r4(g.bigHp(1600) * g.buffK() * kW)) < 0.01, [wd && wd.max, kW]);
    Object.assign(wd, { x: p.x + 1, y: p.y, rx: p.x + 1, ry: p.y, moveT: 99, diveCD: 99, whirlCD: 99, galeCD: 99, sandCD: 99 });
    ok('v0.8.25: up in the sky it cannot be struck by hand nor by the 3-cell god weapons, even right overhead', !E.at(p.x + 1, p.y) && E.rectDist(wd, p.x, p.y) === Infinity && !E.beastAt(p.x + 1, p.y));
    p.tools = [{ n: '彤弓素矰', c: 1, dur: 199 }]; p.tool = 0; wd.x = wd.rx = p.x + 6; p.atkT = 0; const w0 = wd.hp; g.pressGather();
    ok('v0.8.25: 彤弓素矰 hits it in the sky in full and ties it down (繳) — then it can be struck by hand', Math.abs(w0 - wd.hp - full) < 0.01 && wd.state === 'tied' && E.at(wd.x, wd.y) === wd, [w0 - wd.hp, wd.state]);
    wd.state = 'perch'; wd.claws = 0; wd.x = wd.rx = p.x + 1; p.hp = p.hpMax; p.fearT = 0; p.chokeT = 0;
    g.windClaw(wd); const c1 = p.chokeT, f1 = p.fearT; g.windClaw(wd); const f2 = p.fearT; g.windClaw(wd); const f3 = p.fearT;
    ok('v0.8.25: 入木三分 — each claw chokes you (窒, 4 breaths); the second adds 懼 1.5, the third deep 懼 3', c1 === 4 && !f1 && f2 === 1.5 && f3 === 3 && wd.claws === 3, [c1, f1, f2, f3]);
    p.sta = 50; const san0 = p.san; g.chokeTick(1); const dSta = U.r4(50 - p.sta);
    g.addItem('果', 1); p.sel = p.bag.findIndex(s2 => s2.n === '果'); const fr0 = g.count('果'); g.useItem(); const ate = g.count('果') !== fr0, eatMsg = g.msgText;
    ok('v0.8.25: 窒 — 力 drains 3 a breath (by difficulty; 朱雀 lessens it), 愜意 half that; you cannot eat while choked', Math.abs(dSta - U.r4(3 * g.kindMult('窒') * g.buffK() * kW)) < 0.01 && p.san < san0 && !ate && /咽不下/.test(eatMsg), [dSta, eatMsg]);
    g.removeItem('果', 9); p.chokeT = 0; p.chokePer = 0; p.fearT = 0; p.sta = p.staMax; p.hp = p.hpMax;
    const pz = [p.x, p.y]; g.windWhirl(wd, { x: p.x - 1, y: p.y, t: 0 });
    ok('v0.8.25: 扶搖 — standing in the whirl you are thrown away and dizzy (亂, 2.5)', U.cheb(p.x, p.y, pz[0], pz[1]) >= 2 && p.confuseT === 2.5, [pz, [p.x, p.y], p.confuseT]);
    const bx0 = p.x, by0 = p.y; g.keys.clear(); g.keys.add('KeyW'); p.moveT = 0; g.handleMove(0.016); g.keys.clear();
    ok('v0.8.25: 亂 — the arrow keys are turned 90°: W goes east', p.x === bx0 + 1 && p.y === by0, [[bx0, by0], [p.x, p.y]]);
    p.confuseT = 0; p.moveT = 0; p.rx = p.x; p.ry = p.y; clear(p.x, p.y, 6);
    const gx = p.x, gy = p.y; w.set(gx + 3, gy, '磚'); w.set(gx + 4, gy + 1, '木'); p.hp = p.hpMax; const hpG = p.hp;
    g.windGale(wd, { x: gx - 2, y: gy, dx: 1, dy: 0 }, E.galeCells({ x: gx - 2, y: gy, dx: 1, dy: 0 }));
    ok('v0.8.25: 摧屋拔木 — the gale blows a brick into 墟, uproots a tree, strikes you and pushes you two along', w.get(gx + 3, gy) === '墟' && w.get(gx + 4, gy + 1) === '土' && p.hp < hpG && p.x === gx + 2 && p.y === gy, [w.get(gx + 3, gy), w.get(gx + 4, gy + 1), [p.x - gx, p.y - gy]]);
    p.hp = p.hpMax; const hpS = p.hp; g.windSand(wd, [[p.x, p.y]]); const sandHit = p.hp < hpS; p.hp = p.hpMax; const rn = g.roofedNow; g.roofedNow = () => true; g.windSand(wd, [[p.x, p.y]]); const sandRoof = p.hp === p.hpMax; g.roofedNow = rn;
    ok('v0.8.25: 飛沙走石 — a stone on your cell strikes you; a roof keeps it off', sandHit && sandRoof, [sandHit, sandRoof]);
    const f = p.fight; E.remove(wd); f.x = gx + 5; f.y = gy - 3; g.bossTick(0.01); const wd2 = g.bossEnt();
    ok('v0.8.25: gone from the field (as after loading a save), it comes back up in the sky where it was', !!wd2 && wd2.state === 'sky' && wd2.x === gx + 5 && wd2.y === gy - 3, wd2 && [wd2.x - gx, wd2.y - gy, wd2.state]);
    const tro = Object.assign({}, p.trophies || {}), feats = (p.feats || []).length; wd2.hp = 1; p.atkT = 0; g.kill(wd2); g.courSig = ''; g.updateHUD();
    ok('v0.8.25: slain, 大風 gives 風羽 and lights 鳳翎 on the soul ring; with its scroll the bead is red', !!(p.bosses || {})['大風'] && p.trophies['大風'].n === '風羽' && document.getElementById('soulring').classList.contains('z') && g.beadOf('大風') === 'won' && !p.fight, [p.trophies['大風'], g.beadOf('大風')]);
    delete p.bosses['大風']; p.trophies = tro; p.feats.length = feats; if (p.codex) delete p.codex['大風']; p.scrolls = (p.scrolls || []).filter(x => x.id !== '大風');
    // —— 大風卷
    const xz = g.turtleZone; put(xz.x, xz.y + 2); clear(xz.x, xz.y + 2, 3); p.trial = null; p.jingFor = null;
    g.startTrial('大風', 0.6); const sd = E.list.find(o => o.shade === '風影');
    ok('v0.8.25: 玄武\'s 大風卷 — a 風影 (60%) comes up in the sky over 玄洲, 6–12 from you', !!sd && sd.type === '大風' && sd.state === 'sky' && Math.hypot(sd.x - xz.x, sd.y - xz.y) <= xz.r && U.cheb(sd.x, sd.y, p.x, p.y) >= 6 && sd.max === g.bigHp(1600 * 0.6 * g.trialK()), sd && [sd.max, sd.state]);
    g.endTrial(); p.trialTries = {};
    g.paused = false; p.tools = tk; p.tool = tl; p.cour = cour0; g.courSig = ''; p.hpMax = hpm; p.hp = p.hpMax; p.chokeT = 0; p.confuseT = 0; p.fearT = 0; g.fires = []; g.fireMarks = [];
    put(keep.x, keep.y); p.fx = keep.fx; p.fy = keep.fy; E.list = E.list.filter(e => e.tame); }

  } catch (e) { checks.push('CRASH ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' | ')); }

  let frames = 0; const t0 = performance.now(); await new Promise((res) => { const tick = () => { frames++; if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
  r.fps = Math.round(frames / ((performance.now() - t0) / 1000));
  r.checks = checks; r.failed = checks.filter(c => c.startsWith('FAIL')).length;
  return r;
});
// ============ 起始頁：三格存檔（要重開頁面，所以在 evaluate 外面跑） ============
const checks2 = [];
const ok2 = (name, cond, info) => checks2.push((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : ''));
const started = () => page.waitForFunction(() => window.XIEYI && !window.XIEYI.game.paused, null, { timeout: 15000 });
try {
  const base = url.replace(/\?.*$/, '');
  await page.evaluate(() => { const g = XIEYI.game; g.slot = 1; g.save(); const s = JSON.parse(localStorage.getItem('xieyi.save.v5')), s3 = JSON.parse(JSON.stringify(s)); s3.seed = 99; s3.savedAt = s.savedAt - 60000; s3.diff = 'hard'; s3.brief.level = 5; localStorage.setItem('xieyi.save.v5.3', JSON.stringify(s3)); localStorage.removeItem('xieyi.save.v5.2'); localStorage.removeItem('xieyi.slot'); });
  await page.goto(base, { waitUntil: 'load' });
  const cards = await page.$$eval('.save-card', (cs) => cs.map(c => ({ slot: c.dataset.slot, on: c.classList.contains('on'), empty: c.classList.contains('empty'), text: c.textContent })));
  ok2('v0.8: start page shows eight save cards, four to a row', cards.length === 8 && cards.map(c => c.slot).join('') === '12345678' && await page.$eval('#saves', e => getComputedStyle(e).gridTemplateColumns.split(' ').length) === 4);
  ok2('the newest save (slot 1) is selected by default', cards[0].on && cards.slice(1).every(c => !c.on));
  ok2('an occupied card tells island, difficulty, day, courage and time (no night, no slept-nights — v0.6.10)', /島 #7/.test(cards[0].text) && /一般/.test(cards[0].text) && /第 \d+ 日/.test(cards[0].text) && !/夜/.test(cards[0].text) && /膽氣第 \d+ 重/.test(cards[0].text) && !/睡過/.test(cards[0].text) && /存於 \d\d\/\d\d/.test(cards[0].text), cards[0].text);
  ok2('slot 3 shows its own island, difficulty and courage', /島 #99/.test(cards[2].text) && /困難/.test(cards[2].text) && /膽氣第 5 重/.test(cards[2].text), cards[2].text);
  ok2('slot 2 is empty and says so', cards[1].empty && /空格/.test(cards[1].text) && !/繼續/.test(cards[1].text));
  await page.click('.save-card[data-slot="3"] .save-no');
  ok2('clicking a card selects it and the hint warns that 落筆 would overwrite', await page.$eval('.save-card.on', c => c.dataset.slot) === '3' && /覆蓋/.test(await page.$eval('#new-hint', e => e.textContent)));
  await page.keyboard.press('Enter'); await started();
  const r1 = await page.evaluate(() => ({ slot: XIEYI.game.slot, seed: XIEYI.game.seed, diff: XIEYI.game.diff.key, last: localStorage.getItem('xieyi.slot'), day: XIEYI.DAY, wday: window.World.DAY, d: XIEYI.game.day(), bday: JSON.parse(localStorage.getItem('xieyi.save.v5.3')).brief.day }));
  ok2('Enter continues the selected slot: slot 3, island 99, hard', r1.slot === 3 && r1.seed === 99 && r1.diff === 'hard' && r1.last === '3', r1);
  ok2('v0.6.10: the hard island runs 300-s days; the save made on 360-s days keeps its day number', r1.day === 300 && r1.wday === 300 && r1.d === r1.bday, r1);
  await page.goto(base, { waitUntil: 'load' });
  ok2('the last played slot is selected after reload', await page.$eval('.save-card.on', c => c.dataset.slot) === '3');
  { await page.click('.diffrow button[data-diff="easy"]'); const de = await page.$eval('#diff-desc', e => e.textContent); await page.click('.diffrow button[data-diff="hard"]'); const dh = await page.$eval('#diff-desc', e => e.textContent); await page.click('.diffrow button[data-diff="normal"]'); const dn = await page.$eval('#diff-desc', e => e.textContent);
    ok2('v0.6.10: the difficulty note tells how long a day is (四百二十／三百六十／三百息)', /一日四百二十息/.test(de) && /一日三百六十息/.test(dn) && /一日三百息/.test(dh), [de, dn, dh]);
    const hint = await page.$eval('#diff-hint', e => ({ t: e.textContent, vis: getComputedStyle(e).display !== 'none', hard: e.classList.contains('hard') }));
    ok2('v0.8.23: choosing a difficulty, the hint is always there (its own line, brighter on 困難) — someone who stays on hard and leans on no one may meet a good thing', /誰也不靠/.test(hint.t) && hint.vis && !hint.hard && !/誰也不靠/.test(dh), hint); }
  await page.click('.save-card[data-slot="2"] .save-no'); await page.fill('#seed', '123'); await page.click('#btn-new'); await started();
  const r2 = await page.evaluate(() => { XIEYI.game.save(); return { slot: XIEYI.game.slot, seed: XIEYI.game.seed, s2: JSON.parse(localStorage.getItem('xieyi.save.v5.2')).seed, s1: JSON.parse(localStorage.getItem('xieyi.save.v5')).seed, s3: JSON.parse(localStorage.getItem('xieyi.save.v5.3')).seed, dl: JSON.parse(localStorage.getItem('xieyi.save.v5.2')).world.dayLen }; });
  ok2('落筆 on an empty slot starts island 123 in slot 2 and leaves slots 1 and 3 alone', r2.slot === 2 && r2.seed === 123 && r2.s2 === 123 && r2.s1 === 7 && r2.s3 === 99, r2);
  ok2('v0.8.22: a new island begun on 一般 is not "hard all the way"', await page.evaluate(() => XIEYI.game.diff.key === 'normal' && XIEYI.game.player.hardOnly === false));
  ok2('v0.6.10: a new normal island saves 360-s days', r2.dl === 360, r2);
  await page.goto(base, { waitUntil: 'load' });
  await page.click('.save-card[data-slot="1"] .save-no'); await page.click('#btn-new'); await page.waitForTimeout(150);
  const armed = await page.evaluate(() => ({ started: !!window.XIEYI, text: document.getElementById('btn-new').textContent }));
  ok2('落筆 on an occupied slot asks first instead of overwriting', !armed.started && /覆蓋第一格/.test(armed.text), armed);
  await page.click('.save-card[data-slot="3"] .save-del'); await page.waitForTimeout(100);
  ok2('arming 刪 drops the overwrite question and asks 真的刪？', await page.$eval('#btn-new', b => b.textContent) === '落筆' && /真的刪/.test(await page.$eval('.save-card[data-slot="3"] .save-del', b => b.textContent)));
  await page.click('.save-card[data-slot="3"] .save-del'); await page.waitForTimeout(100);
  const after = await page.evaluate(() => ({ gone: !localStorage.getItem('xieyi.save.v5.3'), empty: document.querySelector('.save-card[data-slot="3"]').classList.contains('empty'), n: document.querySelectorAll('.save-card').length, still1: !!localStorage.getItem('xieyi.save.v5'), still2: !!localStorage.getItem('xieyi.save.v5.2') }));
  ok2('second 刪 clears slot 3 only and the card turns empty', after.gone && after.empty && after.n === 8 && after.still1 && after.still2, after);
  await page.click('.save-card[data-slot="1"] .save-no'); await page.fill('#seed', '55'); await page.click('#btn-new'); await page.waitForTimeout(100); await page.click('#btn-new'); await started();
  const r3 = await page.evaluate(() => { XIEYI.game.save(); return { slot: XIEYI.game.slot, seed: XIEYI.game.seed, s1: JSON.parse(localStorage.getItem('xieyi.save.v5')).seed, cour: XIEYI.game.player.cour }; });
  ok2('second 落筆 overwrites slot 1 with island 55', r3.slot === 1 && r3.seed === 55 && r3.s1 === 55, r3);
  await page.evaluate(() => { localStorage.setItem('xieyi.carry', '500@2'); });
  await page.goto(base + '?autostart=1&seed=8&slot=1', { waitUntil: 'load' }); await started();
  const c1 = await page.evaluate(() => ({ slot: XIEYI.game.slot, cour: XIEYI.game.player.cour, carry: localStorage.getItem('xieyi.carry') }));
  await page.goto(base + '?autostart=1&seed=9&slot=2', { waitUntil: 'load' }); await started();
  const c2 = await page.evaluate(() => ({ slot: XIEYI.game.slot, cour: XIEYI.game.player.cour, carry: localStorage.getItem('xieyi.carry') }));
  ok2('courage carried over the sea waits for its own slot: slot 1 gets none, slot 2 gets 500 and the note is spent', c1.slot === 1 && c1.cour === 0 && c1.carry === '500@2' && c2.slot === 2 && c2.cour === 500 && c2.carry === null, { c1, c2 });
  // v0.8.10 測試服：伺服器設定（src/server.js）列的格是測試格；正式服沒有
  { await page.goto(base, { waitUntil: 'load' });
    const tc = await page.evaluate(() => ({ server: window.XIEYI_SERVER || null, tests: [...document.querySelectorAll('.save-card.test')].map(c => c.dataset.slot).join('') }));
    if (tc.server && tc.server.test && tc.server.test.length) {
      ok2('v0.8.10 測試服: the start page marks slots 6–8 as 測試', tc.tests === '678' && /測試/.test(await page.$eval('.save-card[data-slot="6"]', c => c.textContent)), tc);
      await page.click('.save-card[data-slot="6"] .save-no'); await page.fill('#seed', '66'); await page.click('#btn-new'); await started();
      const t6 = await page.evaluate(() => { const g = XIEYI.game, p = g.player; g.addItem('木', 2); const r = { test: g.test, slot: g.slot, slots: g.slots(), tools: g.toolSlots(), gods: p.tools.map(s => s.n).join(','), lv: g.level(), inf: g.count('木') === Infinity, tag: !!document.getElementById('testtag') };
        g.togglePause(); r.toNormal = document.querySelector('.saveas-slot[data-slot="1"]').disabled; r.toTest = document.querySelector('.saveas-slot[data-slot="7"]').disabled; g.togglePause(); g.save(); return r; });
      ok2('v0.8.10 測試服: 落筆 in slot 6 starts a test game — 62 bag slots (v0.8.14: 32 + 30), 14 tools, both god weapons, courage ∞, gathered wood ∞, the corner tag', t6.test && t6.slot === 6 && t6.slots === 62 && t6.tools === 14 && /九閽鳴雷/.test(t6.gods) && /燭龍焚溟/.test(t6.gods) && t6.lv === 99 && t6.inf && t6.tag, t6);
      ok2('v0.8.10 測試服: a test game cannot be saved into a normal slot (only into 6–8)', t6.toNormal === true && t6.toTest === false, t6);
      await page.goto(base, { waitUntil: 'load' });
      ok2('v0.8.10 測試服: its card reads 膽氣第 ∞ 重', /膽氣第 ∞ 重/.test(await page.$eval('.save-card[data-slot="6"]', c => c.textContent)));
      await page.evaluate(() => localStorage.removeItem('xieyi.save.v5.6'));
    } else ok2('正式服: no test slots on the start page', tc.tests === '', tc);
  }
  // v0.8.2：遊戲裡換難度——按兩次、存檔、重新讀進來，第幾日幾時照舊，只換一日多長
  { await page.goto(base + '?autostart=1&seed=31&slot=4', { waitUntil: 'load' }); await started();
    const b0 = await page.evaluate(() => { const g = XIEYI.game; g.world.time = XIEYI.DAY * 2 + XIEYI.DAY * 0.4; g.togglePause(); const r = { day: g.day(), frac: g.dayT(), diff: g.diff.key, buttons: document.querySelectorAll('#pause-diff button').length, on: document.querySelector('#pause-diff button.on').dataset.diff }; document.querySelector('#pause-diff button[data-diff="easy"]').click(); r.armed = document.querySelector('#pause-diff button[data-diff="easy"]').textContent; r.still = g.diff.key; return r; });
    ok2('v0.8.2: the pause panel has the three difficulties, this one marked; the first click only asks', b0.buttons === 3 && b0.on === 'normal' && /再按一次換成簡單/.test(b0.armed) && b0.still === 'normal', b0);
    await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.evaluate(() => document.querySelector('#pause-diff button[data-diff="easy"]').click())]); await started();
    const b1 = await page.evaluate(() => { const g = XIEYI.game; return { slot: g.slot, seed: g.seed, diff: g.diff.key, DAY: XIEYI.DAY, day: g.day(), frac: g.dayT(), toast: document.getElementById('toasts').textContent, saved: JSON.parse(localStorage.getItem('xieyi.save.v5.4')).diff, resume: localStorage.getItem('xieyi.resume') }; });
    ok2('v0.8.2: the second click saves, reloads and goes straight back in — same slot and island, now easy with 420-s days', b1.slot === 4 && b1.seed === 31 && b1.diff === 'easy' && b1.DAY === 420 && b1.saved === 'easy' && b1.resume === null, b1);
    ok2('v0.8.2: …the day and the time of day stay as they were, and a toast says so', b1.day === b0.day && Math.abs(b1.frac - b0.frac) < 0.01 && /難度換成了簡單/.test(b1.toast), [b0.day, b0.frac, b1.day, b1.frac]); }
  // 起始頁上的「生存之道」在起始頁上面（v0.5.6 前被起始頁蓋住）；起始頁沒有手柄設定
  await page.goto(base, { waitUntil: 'load' });
  const ptop = () => page.evaluate(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return e && e.closest('.overlay') && e.closest('.overlay').id; });
  ok2('the start page has no 手柄設定 button', await page.evaluate(() => !document.getElementById('btn-pad') && document.getElementById('start').textContent.indexOf('手柄') < 0));
  await page.click('#btn-help'); await page.waitForTimeout(80);
  ok2('生存之道 on the start page shows on top of it', await ptop() === 'help', await ptop());
  await page.click('#help-close'); await page.waitForTimeout(50);
  // 起始頁的文字選項：點简体整頁轉簡體，重開仍是簡體；點繁體轉回來
  await page.goto(base, { waitUntil: 'load' }); await page.click('[data-lang="hans"]'); await page.waitForTimeout(80);
  const hz = await page.evaluate(() => ({ sub: document.querySelector('#start .sub').textContent, diff: document.querySelector('.diffrow').textContent, stored: localStorage.getItem('xieyi.lang') }));
  ok2('the start page has 繁體／简体; 简体 turns the page simplified', hz.sub === '字里行间 · 一纸之岛' && hz.diff.indexOf('难度') >= 0 && hz.stored === 'hans', hz);
  await page.goto(base, { waitUntil: 'load' }); await page.waitForTimeout(80);
  const hz2 = await page.evaluate(() => ({ sub: document.querySelector('#start .sub').textContent, lang: document.documentElement.lang, cards: document.getElementById('saves').textContent }));
  ok2('reloading keeps 简体, the save cards included', hz2.sub === '字里行间 · 一纸之岛' && hz2.lang === 'zh-CN' && /岛 #|空/.test(hz2.cards) && !/島 #/.test(hz2.cards), hz2);
  await page.click('[data-lang="hant"]'); await page.waitForTimeout(80);
  ok2('繁體 turns it back', await page.$eval('#start .sub', e => e.textContent) === '字裡行間 · 一紙之島' && await page.evaluate(() => localStorage.getItem('xieyi.lang')) === 'hant');
} catch (e) { checks2.push('CRASH start page: ' + e.message); }
result.checks.push(...checks2); result.failed = result.checks.filter(c => c.startsWith('FAIL') || c.startsWith('CRASH')).length;
console.log(result.checks.join('\n'));
console.log('fps', result.fps, 'failed', result.failed, 'of', result.checks.length);
await page.screenshot({ path: out + '/02-end.png' });
console.log('ERRORS', JSON.stringify(errors));
await browser.close();
process.exit(errors.length || result.failed ? 1 : 0);
