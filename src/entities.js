// entities.js —— 世界裡會動的東西：鳥、魚、鹿、虎、豹、狼、蛇、蛛、蟾、龜、野豬、野牛、龍，以及第十三夜起夜行的魄
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const U = root.U, G = root.G, DB = G.DB;
  const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  const SCARED = '虎豹狼蛇蛛蟾豬';         // 稻草人擋得住的（野豬也怕；野牛不怕）
  const HOSTILE = '虎豹狼蛇蛛蟾豬牛';       // 敵對獸：攻擊間隔放慢四分之一
  const FOREST = '林森竹';
  // 彈弓挑釁（v0.5.2）：被石子打過的獸 provoked 秒內，到玩家 PROVOKE_R 格內就直撲過來（不管光、稻草人嚇不嚇、晝夜），一步 CHARGE_STEP 秒
  const TIGER_GAP = 12;   // 一山不容二虎（v0.5.2）：兩隻虎相距至少十二格——生的時候避開，走的時候不往十二格內靠，已經太近的走開
  const PROVOKE_R = 7, CHARGE_STEP = 0.22, CHARGERS = '虎豹狼蛇蛛鷹豬牛', BITERS = '蛇蛛蟾';
  // v0.6：蜘蛛十隻一隻有毒（見人就撲、毒是蛇的一半），其餘無毒（惹了才咬、不中毒）；野豬五格內見人就衝，速度同豹；
  // 野牛不惹不動，惹了追著頂，腳程是狼的三分之二（狼追人一步 0.32 息），十格外或二十息後消氣；龜挨打就往最近的海逃，比平常快四成
  const VENOM_SPIDER = 0.1, BOAR_RANGE = 5, BOAR_STEP = 0.22, BISON_STEP = 0.32 * 1.5, BISON_CALM = 30, BISON_GIVEUP = 18, TURTLE_STEP = 1.5, TURTLE_FLEE = 1.4,   /* 龜一步一息半（v0.6 使用者裁定：腳程減到三分之二），逃命快四成 */ TURTLE_SEA_R = 40;
  // 磚擋眼（v0.6）：獸跟人之間隔著磚、門、墟就看不見，只能循氣味找，找得到的距離是看得見時的七成；窗不擋。
  // 惹惱的野牛記仇比別的獸遠（十八格、三十息），擋在路上的人造磚、門、窗與墟（村裡的殘垣也算）都撞，一下隔 RAM_GAP 息；耐久在 world.js 的 WALL_HP
  const FISH_RATE = 1.8, EAGLE_RATE = 1.25;   // 魚出現得多八成、鷹多兩成五（v0.6.10 使用者定）：附近的上限與刷新的機會一起放大
  const RILE_CALM = 20, RILE_GIVEUP = 12;   // 被惹的蛛、蟾：二十息後或人走出十二格就消氣（v0.7.3；鷹十二息、野牛三十息另算）
  const STAIRS = '台階', STAIR_SLOW = 1.5, FLIERS = '鳥龍鷹魄魚蜃雕朱雀';   // 獸也上得了階與台（v0.6.8 使用者定），一步多花一半時間
  const SMELL = 0.7, RAM_GAP = 1.6, RAMMABLE = '磚門窗墟';
  // 魄（v0.5 加強）：玩家身上的光（手裡的火把蠟燭、頭上的燈帽）只把魄逼到 GHOST_KEEP 格外，在 GHOST_HOVER 格內徘徊；
  // 地上的光（燈、火、旺灶）GHOST_BURN 格內、龍四格內才煙滅。玩家有光時每 GHOST_DASH_GAP 息，最近那隻撲上來 GHOST_DASH 息；
  // 魄在兩格內（GHOST_SNUFF_R），手裡的光每息有 snuffP 的機會被吹熄（game.ghostTouch）
  // 鑿齒（v0.8.5，小魔王）：盾在面朝的那邊，TOOTH_TURN 息才轉一回身；人在牠正面（夾角約六十七度內，就是面前三格）牠才撞得到，也只有正面打牠吃一成傷。
  // 白虎（v0.8.5，神獸）：伏在虎嶺，四十格內現身；沒帶虎符的人進了 TIGER_ROAR_R 格，每 TIGER_ROAR_GAP 息一聲嘯（震，遊戲端結算）
  // 蠱雕（v0.8.6，小魔王）：在人五到八格外盤旋；每 HARPY_DIVE 息撲下來抓一下（力），貼著停 HARPY_LINGER 息（出手的時候），再飛回六格外；
  // 十格內每 HARPY_CRY_GAP 息一聲啼（心，遊戲端結算）。朱雀（v0.8.6，神獸）：棲在丹穴，沒帶朱羽的人走進 PHOENIX_AWAY 格，牠就飛開
  const HARPY_RING = [5, 8], HARPY_DIVE = [6, 9], HARPY_LINGER = 0.9, HARPY_CRY_GAP = 9, HARPY_CRY_R = 10, HARPY_DIVE_STEP = 0.16, HARPY_RISE_STEP = 0.2, HARPY_SENSE = 16, PHOENIX_AWAY = 5;
  // 封豨（v0.8.7，大魔王）：二乘二，左上角在 (x, y)。追人一步 HOG.step 息；貼著撞（力）；豕突：蓄 HOG.wind 息（腳下揚塵、地上畫出衝的路），
  // 再直衝 HOG.len 格（力）；拱地：蓄 HOG.rootT 息，震一圈圈往外傳到 HOG.ringR 格（震，台橋棧船上不受）；命剩六成以下去吃桑（荐食）回命，
  // 吃的時候挨打超過命上限的 HOG.eatBreak 就吃不成；命剩一半起每 HOG.callGap 息叫兩頭野豬（群豕）。不離桑林島心 HOG.leash 格
  const HOG = { step: 0.42, melee: 20, meleeGap: 1.8, charge: 40, chargeStep: 0.08, len: 10, wind: 1.2, chargeGap: [7, 10], quake: 22, rootT: 1.0, ringR: 7, ringT: 1.4, quakeGap: [11, 14],
    eatAt: 0.6, eatT: 2.5, eatHeal: 0.05, eatGap: 20, eatBreak: 0.03, eatFind: 10, callAt: 0.5, callGap: 25, callN: 2, callCap: 4, leash: 40, stun: 1.5 };
  const HOG_FOOD = '木林森果竹';
  const TOOTH_TURN = 1.2, TOOTH_STEP = 0.36, TOOTH_GAP = 1.8, TOOTH_FRONT = 0.38, TOOTH_SENSE = 12, TIGER_SEE = 40, TIGER_ROAR_R = 6, TIGER_ROAR_GAP = 10;
  const GHOST_KEEP = 6, GHOST_HOVER = 9, GHOST_BURN = 3, GHOST_DASH = 2.5, GHOST_DASH_GAP = [8, 14], GHOST_DASH_STEP = 0.22, GHOST_SNUFF_R = 2;

  class Entities {
    constructor(world) {
      this.world = world;
      this.list = [];
      this.spawnAcc = 0;
      this.ghostAcc = 0;
      this.seaP = 1 / 160;       // 行船時每一點五息有這麼點機會浮上一頭蜃（平均約二百四十息一頭）
      this.toothP = 1 / 100;     // 人在西邊的外島上，每一點五息有這麼點機會走出一頭鑿齒（平均約一百五十息一頭，v0.8.5）
      this.harpyP = 1 / 100;     // 人在南邊的海上或外島上，每一點五息有這麼點機會飛來一頭蠱雕（v0.8.6）
      this.snuffP = 0.1;         // 魄兩格內，手裡的光每息被吹熄的機會
      this.dashT = GHOST_DASH_GAP[0];   // 下一次撲燈還有幾息（玩家身上有光的夜裡才倒數）
    }
    // 野牛一乘二（v0.7.2 使用者定）：頭在 (x, y)，身子沿著走的方向拖一格，尾在 (x − bx, y − by)；橫著走身子橫、縱著走身子直
    hogRect(e, x, y) { const ax = x === undefined ? e.x : x, ay = y === undefined ? e.y : y; return [[ax, ay], [ax + 1, ay], [ax, ay + 1], [ax + 1, ay + 1]]; }   // 封豨的四格
    rectDist(e, x, y) { return e.type === '豨' ? Math.max(Math.max(e.x - x, 0, x - e.x - 1), Math.max(e.y - y, 0, y - e.y - 1)) : U.cheb(e.x, e.y, x, y); }   // 到身子最近一格的距離
    tail(e) { return e.type === '牛' ? [e.x - (e.bx === undefined ? 1 : e.bx), e.y - (e.by || 0)] : null; }
    cellsOf(e) { if (e.type === '豨') return this.hogRect(e); const t = this.tail(e); return t ? [[e.x, e.y], t] : [[e.x, e.y]]; }
    covers(e, x, y) { if (e.x === x && e.y === y) return true; if (e.type === '豨') return x >= e.x && x <= e.x + 1 && y >= e.y && y <= e.y + 1; const t = this.tail(e); return !!t && t[0] === x && t[1] === y; }
    turn(e, dx, dy) { if (dx && dy) return e.bx ? [Math.sign(dx), 0] : [0, Math.sign(dy)]; return dx ? [Math.sign(dx), 0] : [0, Math.sign(dy)]; }   // 斜著走：身子照舊橫或直，換頭的朝向
    bodyFits(x, y, bx, by, night, self) { const tx = x - bx, ty = y - by; return this.canStand('牛', tx, ty, night) && !this.beastAt(tx, ty, self) && !(this.px === tx && this.py === ty); }   // 尾那一格站得上去、沒有別的獸、不是人
    bisonRoom(x, y, night) { for (const [bx, by] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.bodyFits(x, y, bx, by, night, null)) return [bx, by]; return null; }
    at(x, y) { for (const e of this.list) if (this.covers(e, x, y)) return e; return null; }
    beastAt(x, y, except) { for (const e of this.list) if (e !== except && this.covers(e, x, y) && DB[e.type].kind === 'beast' && e.type !== '魄' && e.type !== '龍' && !(e.type === '鷹' && e.tame)) return e; return null; }   // 龍與馴了的鷹不擋路
    inFront(e, x, y) { const vx = x - e.x, vy = y - e.y, l = Math.hypot(vx, vy), fl = Math.hypot(e.fx || 0, e.fy || 0); return !l || !fl || (vx * e.fx + vy * e.fy) / (l * fl) > TOOTH_FRONT; }   // (x, y) 在不在牠面前
    shielded(e, x, y) { return e.type === '齒' && this.inFront(e, x, y); }   // 從 (x, y) 打鑿齒，是不是打在盾上
    faceTo(e, x, y) { const fx = Math.sign(x - e.x), fy = Math.sign(y - e.y); if (fx || fy) { e.fx = fx; e.fy = fy; } }
    tamed() { return this.list.filter(e => e.type === '鷹' && e.tame); }
    sense(e, p, r) { return this.world.clear(e.x, e.y, p.x, p.y) ? r : r * SMELL; }   // 獸找得到人的距離：看得見照舊，隔著磚只靠氣味打七折
    ram(e, g, x, y) {      // 野牛撞牆：扣一點看不見的耐久；磚剩一半成墟，塌了就沒了
      if (e.atk > 0) return; e.atk = RAM_GAP;
      const r = this.world.hitWall(x, y); if (!r) return;
      if (r === 'broken') { if (g.wallBroken) g.wallBroken(e, x, y); } else if (g.wallRammed) g.wallRammed(e, x, y, r);
    }
    rammable(x, y) { const ch = this.world.get(x, y); return RAMMABLE.indexOf(ch) >= 0 && (ch === '墟' || this.world.base(x, y) !== ch); }   // 人造的磚門窗，與所有的墟
    riled(e) { return !!e.angry && (e.type === '蛛' || e.type === '蟾' || e.type === '牛' || (e.type === '鷹' && !e.tame)); }   // 半友好的被惹了（v0.7.3：畫面上發紅變大）
    isHostile(o) {           // 會主動找人的：虎豹狼蛇、野豬、毒蛛；惹了才找人的：無毒蛛、蟾、野牛、沒馴的鷹
      return '虎豹狼蛇豬齒雕豨'.indexOf(o.type) >= 0 || (o.type === '蛛' && o.venom) || (o.angry && (o.type === '蛛' || o.type === '蟾' || o.type === '牛' || (o.type === '鷹' && !o.tame)));
    }
    hostileNear(p, r) {      // 玩家 r 格內最近的敵對獸（鷹替你打的對象）
      let best = null, bd = Infinity;
      for (const o of this.list) {
        if (!this.isHostile(o) || o.hp <= 0) continue;
        const d = U.cheb(o.x, o.y, p.x, p.y); if (d <= r && d < bd) { bd = d; best = o; }
      }
      return best;
    }
    count(type) { let n = 0; for (const e of this.list) if (e.type === type) n++; return n; }
    add(type, x, y, extra) {
      const e = Object.assign({ type, x, y, rx: x, ry: y, moveT: Math.random(), calm: 0, atk: 0, angry: false, hp: DB[type].hp || 1, bob: Math.random() * 6 }, extra || {});
      if (type === '蟾' && e.venom === undefined) e.venom = Math.random() < 0.5;
      if (type === '蛛' && e.venom === undefined) e.venom = Math.random() < VENOM_SPIDER;   // 十隻一隻是毒蛛
      if (type === '鷹' && e.sta === undefined) e.sta = 100;
      if (type === '牛' && e.bx === undefined) { const o = this.bisonRoom(x, y, true) || [1, 0]; e.bx = o[0]; e.by = o[1]; }   // 野牛：找一個尾巴放得下的方向
      this.list.push(e);
      return e;
    }
    remove(e) { const i = this.list.indexOf(e); if (i >= 0) this.list.splice(i, 1); }
    nearWater(x, y) { for (const [dx, dy] of N4) if (DB[this.world.get(x + dx, y + dy)].kind === 'water') return true; return false; }
    nearWood(x, y) { for (const [dx, dy] of N4) if ('木林森竹'.indexOf(this.world.get(x + dx, y + dy)) >= 0) return true; return false; }

    // 出生地：各有各的家
    habitat(type, x, y, night) {
      const ch = this.world.get(x, y), d = DB[ch];
      if (SCARED.indexOf(type) >= 0 && this.world.scared(x, y)) return false;
      if (type === '鳥') return d.kind === 'plant' || d.kind === 'ground';
      if (type === '魚') return d.kind === 'water';
      if (this.world.sheltered(x, y, type)) return false;                  // 小屋裡不生生靈（多小才算看難度，魄另一個門檻）
      if (type === '蜃') return ch === '淼';                                // 蜃只從深海浮上來
      if (type === '齒') return d.walk > 0 && d.kind !== 'object' && d.kind !== 'water' && !d.bog;   // 鑿齒：外島的陸地上（哪座島由遊戲端判斷）
      if (type === '雕') return d.kind !== 'fire';                          // 蠱雕在天上：海上陸上都來得
      if (type === '鹿') return '林木草竹棉麻果'.indexOf(ch) >= 0;
      if (type === '虎') return ch === '森' || (night && ch === '林');
      if (type === '豹') return ch === '森' || ch === '林';
      if (type === '狼') return night && '草田沙棉麻漠'.indexOf(ch) >= 0;        // 漠島的夜裡也有狼（v0.7）
      if (type === '蛇') return (ch === '草' && this.nearWood(x, y)) || ch === '丘';   // 草木之交；漠島的沙丘裡也藏著（v0.7）
      if (type === '蛛') return ch === '窟';                                   // 洞窟裡的蜘蛛（v0.7；草裡的照舊是除草驚出來的）
      if (type === '豬') return '林竹'.indexOf(ch) >= 0 || (ch === '草' && this.nearWood(x, y));   // 林邊
      if (type === '牛') return ch === '草' && !this.nearWood(x, y) && !!this.bisonRoom(x, y, night);   // 開闊的草原，身子（一乘二）放得下
      if (type === '蟾' || type === '龜') return d.walk > 0 && d.kind !== 'object' && this.nearWater(x, y);
      if (type === '鷹') return d.kind !== 'water' && d.kind !== 'fire' && this.world.nearChar(x, y, '山', 2);
      if (type === '魄') return d.kind !== 'water' && d.kind !== 'fire' && !this.world.lightNear(x, y, 6);
      return d.walk > 0;
    }
    // 能不能站上去：獸進不了屋、過不了門、穿不過磚、不近稻草人；魄無形，什麼都穿
    canStand(type, x, y, night) {
      const ch = this.world.get(x, y), d = DB[ch];
      if (this.world.sheltered(x, y, type)) return false;                  // 小屋裡除了玩家誰也進不去；魄看難度（困難擋不住）
      if (type === '魄') return d.kind !== 'fire';
      if (type === '鳥' || type === '龍' || type === '鷹' || type === '雕') return d.kind !== 'fire';
      if (type === '朱雀') return d.kind !== 'water' && d.kind !== 'fire';   // 朱雀不離丹穴的陸地（v0.8.6）
      if (type === '豨') return d.walk > 0 && !d.shelter && !d.gate && !d.bog && d.kind !== 'water' && d.kind !== 'object' && d.kind !== 'place';   // 封豨：上不了台階，不進屋
      if (type === '魚' || type === '蜃') return d.kind === 'water';
      if (type === '青龍') return ch === '淼';   // 東海青龍只在深海上盤著（v0.8）
      if (type === '白虎' && d.kind === 'water') return false;
      if (d.walk <= 0 || d.shelter || d.gate) return false;
      if (d.bog && type !== '蟾') return false;                             // 沼澤：除了蟾，獸都不進
      if (SCARED.indexOf(type) >= 0 && this.world.scared(x, y)) return false;
      if ((type === '虎' || type === '豹') && !night) return d.kind === 'plant';   // 白天不出林
      return true;
    }

    tigerRoom(x, y, self) { for (const o of this.list) if (o !== self && o.type === '虎' && U.cheb(o.x, o.y, x, y) < TIGER_GAP) return false; return true; }   // 這格十二格內沒有別的虎
    tigerTooClose(e, x, y) {   // 虎走到這格會不會離別的虎不到十二格、而且比現在更近
      if (e.type !== '虎') return false;
      for (const o of this.list) if (o !== e && o.type === '虎') { const dn = U.cheb(x, y, o.x, o.y); if (dn < TIGER_GAP && dn < U.cheb(e.x, e.y, o.x, o.y)) return true; }
      return false;
    }
    // 各種生靈附近最多幾隻；魚、鷹的上限乘上 FISH_RATE／EAGLE_RATE，零頭照機率進位（魚平均 14.4、鷹 2.5）
    spawnCaps(night, bm) {
      const frac = (v) => Math.floor(v) + (Math.random() < v - Math.floor(v) ? 1 : 0);
      const caps = { '鳥': night ? 4 : 10, '鹿': 6, '魚': frac(8 * FISH_RATE), '虎': night ? Math.ceil(3 * bm) : 2, '豹': night ? Math.ceil(2 * bm) : 1, '狼': night ? Math.ceil(3 * bm) : 0, '蛇': Math.ceil(2 * bm), '蟾': 3 };
      caps['鷹'] = frac(2 * EAGLE_RATE); caps['龜'] = 1; caps['豬'] = 2; caps['牛'] = 2; caps['蛛'] = 2;   // 蛛：只在洞窟裡生（v0.7）
      return caps;
    }
    climbOk(e, nx, ny) { return this.world.get(nx, ny) !== '台' || STAIRS.indexOf(this.world.get(e.x, e.y)) >= 0; }   // 上台要從階或台上來（v0.6.8，跟人一樣）
    stepTo(e, tx, ty, away, night) {
      let best = null, bestD = away ? -1 : Infinity;
      for (const [dx, dy] of N8) {
        const nx = e.x + dx, ny = e.y + dy;
        if (!this.canStand(e.type, nx, ny, night) || !this.climbOk(e, nx, ny) || this.beastAt(nx, ny, e) || this.tigerTooClose(e, nx, ny)) continue;
        const o = e.type === '牛' ? this.turn(e, dx, dy) : null; if (o && !this.bodyFits(nx, ny, o[0], o[1], night, e)) continue;   // 野牛：尾巴也要放得下
        const d = U.dist(nx, ny, tx, ty) + Math.random() * 0.3;
        if (away ? d > bestD : d < bestD) { bestD = d; best = [nx, ny, o]; }
      }
      if (best) { e.x = best[0]; e.y = best[1]; if (best[2]) { e.bx = best[2][0]; e.by = best[2][1]; } return true; }
      return false;
    }
    wander(e, night, prefer) {
      const order = N8.slice().sort(() => Math.random() - 0.5);
      let fallback = null;
      for (const [dx, dy] of order) {
        const nx = e.x + dx, ny = e.y + dy;
        if (!this.canStand(e.type, nx, ny, night) || !this.climbOk(e, nx, ny) || this.beastAt(nx, ny, e) || this.tigerTooClose(e, nx, ny)) continue;
        const o = e.type === '牛' ? this.turn(e, dx, dy) : null; if (o && !this.bodyFits(nx, ny, o[0], o[1], night, e)) continue;
        if (!prefer || prefer.indexOf(this.world.get(nx, ny)) >= 0) { e.x = nx; e.y = ny; if (o) { e.bx = o[0]; e.by = o[1]; } return; }
        if (!fallback) fallback = [nx, ny, o];
      }
      if (fallback && Math.random() < 0.3) { e.x = fallback[0]; e.y = fallback[1]; if (fallback[2]) { e.bx = fallback[2][0]; e.by = fallback[2][1]; } }
    }
    hover(e, p, lo, hi) {   // 在玩家 lo–hi 格之間繞圈（魄在光的邊上徘徊）
      for (const [dx, dy] of N8.slice().sort(() => Math.random() - 0.5)) {
        const nx = e.x + dx, ny = e.y + dy, dd = U.cheb(nx, ny, p.x, p.y);
        if (dd < lo || dd > hi || !this.canStand(e.type, nx, ny, true)) continue;
        e.x = nx; e.y = ny; return true;
      }
      return false;
    }
    nearestPlace(x, y, chars, maxD) {
      let best = null, bd = maxD;
      for (const pl of this.world.places) {
        if (!pl.ch || chars.indexOf(pl.ch) < 0) continue;
        const d = U.dist(x, y, pl.x + (pl.w - 1) / 2, pl.y + (pl.h - 1) / 2);
        if (d < bd) { bd = d; best = pl; }
      }
      return best;
    }
    dragonNear(x, y, r) { for (const o of this.list) if (o.type === '龍' && U.cheb(o.x, o.y, x, y) <= r) return true; return false; }
    ghostNear(x, y, r) { for (const o of this.list) if (o.type === '魄' && (o.fade === undefined || o.fade >= 1) && U.cheb(o.x, o.y, x, y) <= r) return true; return false; }
    nearOf(type, x, y, r) { for (const o of this.list) if (o.type === type && U.cheb(o.x, o.y, x, y) <= r) return true; return false; }

    spawnNear(type, p, rMin, rMax, night, extra) {
      for (let n = 0; n < 8; n++) {
        const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
        const x = p.x + Math.round(Math.cos(a) * r), y = p.y + Math.round(Math.sin(a) * r);
        if (this.habitat(type, x, y, night) && !this.at(x, y) && (type !== '虎' || this.tigerRoom(x, y))) return this.add(type, x, y, extra);
      }
      return null;
    }
    // 除草時驚出的蜘蛛：出現在玩家旁邊一格
    spawnSpiderNear(x, y) {
      for (const [dx, dy] of N8.slice().sort(() => Math.random() - 0.5)) {
        const nx = x + dx, ny = y + dy;
        if (this.canStand('蛛', nx, ny, true) && !this.at(nx, ny)) return this.add('蛛', nx, ny, { moveT: 1 });
      }
      return null;
    }

    // 咬人與打人：由遊戲端結算
    maul(e, g, dt) {       // 近身撲咬：敵對獸間隔 1.6 秒（原 1.2 秒放慢四分之一），鷹 1.2 秒
      if (e.atk > 0) return;
      g.hit(e, DB[e.type].atk); e.atk = HOSTILE.indexOf(e.type) >= 0 ? 1.6 : 1.2;
    }
    bite(e, g) {           // 毒咬，間隔 2.67 秒（原 2 秒放慢四分之一）；無毒蛛只是咬一口
      if (e.atk > 0) return;
      if ((e.type === '蛛' || e.type === '蟾') && !e.venom) { g.hit(e, DB[e.type].nip); e.atk = 2.0 * 4 / 3; return; }   // 無毒的蛛、蟾：咬一口傷二、不中毒
      g.bite(e, DB[e.type].bite); e.atk = 2.0 * 4 / 3;
    }
    seaTarget(e) {         // 龜逃命的方向：最近的海（離島心夠遠的水，島裡的水塘不算）
      const R = G.ISLAND_R * 0.8; let best = null, bd = Infinity;
      for (let dy = -TURTLE_SEA_R; dy <= TURTLE_SEA_R; dy++) for (let dx = -TURTLE_SEA_R; dx <= TURTLE_SEA_R; dx++) {
        const x = e.x + dx, y = e.y + dy, dd = dx * dx + dy * dy; if (dd >= bd) continue;
        const dw = DB[this.world.get(x, y)]; if (dw.kind === 'water' && !dw.fresh && Math.hypot(x, y) > R) { bd = dd; best = { x, y }; }   // 河湖池是淡水，不算海（v0.7）
      }
      return best;
    }

    // ---------- 封豨（v0.8.7） ----------
    hogFits(e, x, y) {   // 四格都站得上去、沒有別的獸、不是人
      for (const [cx, cy] of this.hogRect(e, x, y)) { if (!this.canStand('豨', cx, cy, true) || (this.px === cx && this.py === cy)) return false; const o = this.beastAt(cx, cy, e); if (o) return false; }
      return true;
    }
    hogToward(e, tx, ty, away) {   // 往 (tx, ty) 走一步（away 就是走開）；擋路的人造磚門窗墟撞一下
      let best = null, bd = away ? -1 : Infinity;
      for (const [dx, dy] of N8) { const nx = e.x + dx, ny = e.y + dy; if (!this.hogFits(e, nx, ny)) continue; const dd = U.dist(nx + 0.5, ny + 0.5, tx, ty) + Math.random() * 0.2; if (away ? dd > bd : dd < bd) { bd = dd; best = [nx, ny]; } }
      if (best) { e.x = best[0]; e.y = best[1]; return true; }
      return false;
    }
    hogWall(e, g, dx, dy) {   // 前面那排有人造的磚門窗墟，撞一下
      for (const [cx, cy] of this.hogRect(e, e.x + dx, e.y + dy)) if (!this.covers(e, cx, cy) && this.rammable(cx, cy)) { this.ram(e, g, cx, cy); return true; }
      return false;
    }
    hogTimers(e, g, p, dt) {   // 不跟著步子走的倒數：招式的冷卻、蓄力、震圈、吃
      for (const k of ['chargeCD', 'quakeCD', 'eatCD', 'callCD', 'windT', 'rootT', 'stunT']) if (e[k] > 0) e[k] = Math.max(0, e[k] - dt);
      const ring = e.ring;
      if (ring) {   // 震一圈圈往外傳：圈走過人那一格的時候打一下
        ring.r += dt * HOG.ringR / HOG.ringT;
        const dd = Math.hypot(p.x + 0.5 - ring.cx, p.y + 0.5 - ring.cy);
        if (!ring.hit && Math.abs(dd - ring.r) < 0.75) { ring.hit = true; if (g.bossHit) g.bossHit(e, HOG.quake, '震', '拱地'); }
        if (ring.r > HOG.ringR + 0.5) e.ring = null;
      }
      if (e.state === 'eat') {
        e.eatLeft -= dt;
        if (e.hpAtEat - e.hp >= DB['豨'].hp * HOG.eatBreak) { e.state = 'chase'; e.eatCD = HOG.eatGap; if (g.hogEat) g.hogEat(e, false); }
        else if (e.eatLeft <= 0) {
          e.state = 'chase'; e.eatCD = HOG.eatGap; const [tx, ty] = e.food;
          if (HOG_FOOD.indexOf(this.world.get(tx, ty)) >= 0) { this.world.set(tx, ty, '土'); e.hp = Math.min(DB['豨'].hp, e.hp + DB['豨'].hp * HOG.eatHeal); if (g.hogEat) g.hogEat(e, true); }
        }
      }
      if (e.state === 'wind' && e.windT <= 0) { e.state = 'charge'; e.chargeLeft = HOG.len; e.chargeHit = false; e.moveT = 0; }
      if (e.state === 'root' && e.rootT <= 0) { e.state = 'chase'; e.ring = { r: 0, hit: false, cx: e.x + 1, cy: e.y + 1 }; if (g.hogQuake) g.hogQuake(e); }
    }
    hogFood(e) {   // 十格內最近的一棵樹（桑）
      let best = null, bd = Infinity;
      for (let dy = -HOG.eatFind; dy <= HOG.eatFind + 1; dy++) for (let dx = -HOG.eatFind; dx <= HOG.eatFind + 1; dx++) {
        const x = e.x + dx, y = e.y + dy; if (HOG_FOOD.indexOf(this.world.get(x, y)) < 0) continue; const dd = Math.abs(dx) + Math.abs(dy); if (dd < bd) { bd = dd; best = [x, y]; }
      }
      return best;
    }
    hogAct(e, g, p, night, sheltered) {
      const d = this.rectDist(e, p.x, p.y), den = g.hogDen, frac = e.hp / DB['豨'].hp, cx = e.x + 1, cy = e.y + 1;
      if (e.stunT > 0) { e.moveT = 0.2; return; }
      if (e.state === 'eat' || e.state === 'wind' || e.state === 'root') { e.moveT = 0.15; return; }
      if (e.state === 'charge') {   // 直衝：前面那排有人就撞上；撞到台上的人、磚、山就停下來（撞在台邊還暈一下）
        const nx = e.x + e.cdx, ny = e.y + e.cdy, rect = this.hogRect(e, nx, ny);
        if (rect.some(([x, y]) => x === p.x && y === p.y)) {
          if (this.world.get(p.x, p.y) === '台') { e.stunT = HOG.stun; if (g.hogStun) g.hogStun(e); }
          else if (!e.chargeHit) { e.chargeHit = true; if (g.bossHit) g.bossHit(e, HOG.charge, '力', '豕突'); }
          e.state = 'chase'; e.moveT = 0.6; return;
        }
        if (this.hogFits(e, nx, ny) && (!den || U.dist(nx + 1, ny + 1, den.x, den.y) <= HOG.leash)) { e.x = nx; e.y = ny; e.chargeLeft--; e.moveT = HOG.chargeStep; if (e.chargeLeft <= 0) { e.state = 'chase'; e.moveT = 0.6; } return; }
        this.hogWall(e, g, e.cdx, e.cdy); e.state = 'chase'; e.moveT = 0.6; return;
      }
      if (e.state === 'goeat') {
        const [tx, ty] = e.food;
        if (HOG_FOOD.indexOf(this.world.get(tx, ty)) < 0 || e.goLeft-- <= 0) { e.state = 'chase'; e.eatCD = 4; }
        else if (this.rectDist(e, tx, ty) <= 1) { e.state = 'eat'; e.eatLeft = HOG.eatT; e.hpAtEat = e.hp; if (g.hogEat) g.hogEat(e, null); e.moveT = 0.15; return; }
        else { e.moveT = HOG.step; if (!this.hogToward(e, tx + 0.5, ty + 0.5, false)) { e.state = 'chase'; e.eatCD = 4; } return; }
      }
      // 群豕：命剩一半起，隔一陣叫兩頭野豬
      if (frac <= HOG.callAt && !(e.callCD > 0) && this.count('豬') < HOG.callCap) {
        e.callCD = HOG.callGap; let n = 0;
        for (let k = 0; k < 12 && n < HOG.callN; k++) { const x = cx + Math.round((Math.random() - 0.5) * 6), y = cy + Math.round((Math.random() - 0.5) * 6); if (this.canStand('豬', x, y, night) && !this.at(x, y) && !(x === p.x && y === p.y)) { this.add('豬', x, y, { moveT: 0.5 }); n++; } }
        if (n && g.hogCall) g.hogCall(e, n);
      }
      if (frac < HOG.eatAt && !(e.eatCD > 0)) { const f = this.hogFood(e); if (f) { e.state = 'goeat'; e.food = f; e.goLeft = 30; e.moveT = 0.2; return; } e.eatCD = 6; }
      if (den && U.dist(cx, cy, den.x, den.y) > HOG.leash) { e.moveT = HOG.step; this.hogToward(e, den.x, den.y, false); return; }   // 不離桑林
      if (!(e.chargeCD > 0) && d >= 3 && d <= HOG.len && !sheltered) {   // 豕突：蓄力，衝的方向這時定下
        e.state = 'wind'; e.windT = HOG.wind; e.cdx = p.x < e.x ? -1 : p.x > e.x + 1 ? 1 : 0; e.cdy = p.y < e.y ? -1 : p.y > e.y + 1 ? 1 : 0;   // 人跟身子同一排就直著衝，不斜 e.chargeCD = HOG.chargeGap[0] + Math.random() * (HOG.chargeGap[1] - HOG.chargeGap[0]); e.moveT = 0.15; if (g.hogWind) g.hogWind(e); return;
      }
      if (!(e.quakeCD > 0) && d <= 6) { e.state = 'root'; e.rootT = HOG.rootT; e.quakeCD = HOG.quakeGap[0] + Math.random() * (HOG.quakeGap[1] - HOG.quakeGap[0]); e.moveT = 0.15; return; }
      if (d <= 1) { if (!(e.atk > 0) && g.bossHit) { g.bossHit(e, HOG.melee, '力', '撞'); e.atk = HOG.meleeGap; } e.moveT = 0.4; return; }
      e.moveT = HOG.step;
      if (!this.hogToward(e, p.x + 0.5, p.y + 0.5, false)) { const sx = Math.sign(p.x - e.x), sy = Math.sign(p.y - e.y); if (!this.hogWall(e, g, sx, sy)) this.hogWall(e, g, sx, 0) || this.hogWall(e, g, 0, sy); }
    }

    update(dt, g) {
      const p = g.player, w = this.world, night = g.darkness() > 0.5;
      // 魄撲燈：玩家身上有光的夜裡，每八到十四息，最近一隻徘徊的魄撲上來
      if (night && g.hasLight()) {
        this.dashT -= dt;
        if (this.dashT <= 0) {
          this.dashT = GHOST_DASH_GAP[0] + Math.random() * (GHOST_DASH_GAP[1] - GHOST_DASH_GAP[0]);
          let best = null, bd = GHOST_HOVER + 2;
          for (const o of this.list) if (o.type === '魄' && !o.frozen && !(o.fade < 1) && !(o.dash > 0)) { const dd = U.cheb(o.x, o.y, p.x, p.y); if (dd < bd) { bd = dd; best = o; } }
          if (best) { best.dash = GHOST_DASH; best.moveT = 0; }
        }
      }
      const dusk = g.duskSoon ? g.duskSoon() : false;
      // —— 獸的刷新
      this.spawnAcc += dt;
      if (this.spawnAcc > 1.5) {
        this.spawnAcc = 0;
        const bm = night && g.beastMult ? g.beastMult() : 1;   // 困難：夜裡狼虎豹蛇一倍半
        const caps = this.spawnCaps(night, bm);
        for (const type in caps) {
          const have = type === '鷹' ? this.list.filter(e => e.type === '鷹' && !e.tame).length : this.count(type);
          if (have >= caps[type]) continue;
          if (type === '蛇' && Math.random() > 0.25) continue;        // 蛇出沒機率偏低
          if (type === '狼' && Math.random() > 0.5) continue;
          if (type === '鷹' && Math.random() > 0.4 * EAGLE_RATE) continue;   // v0.6.10：四成 → 五成
          if (type === '龜' && Math.random() > 0.1) continue;         // 龜少見
          if (type === '豬' && Math.random() > 0.3) continue;
          if (type === '牛' && Math.random() > 0.25) continue;
          this.spawnNear(type, p, 14, 30, night);
          if (type === '魚' && Math.random() < FISH_RATE - 1 && this.count('魚') < caps['魚']) this.spawnNear('魚', p, 14, 30, night);   // 魚每回多八成的機會再刷一條（v0.6.10）
        }
        // 東海青龍（v0.8）：人到四十格內就在牠那片海上現身；走遠了跟別的生靈一樣散去（不存檔，回來再現）
        const az = g.azure; if (az && U.cheb(p.x, p.y, az.x, az.y) <= 40 && !this.list.some(e => e.type === '青龍')) this.add('青龍', az.x, az.y, { moveT: 2 });
        // 白虎（v0.8.5）：人到虎嶺四十格內，就在島心現身；走遠了散去
        const tz = g.tigerAt; if (tz && U.cheb(p.x, p.y, tz.x, tz.y) <= TIGER_SEE && !this.list.some(e => e.type === '白虎')) { const sp = this.canStand('白虎', tz.x, tz.y, night) ? [tz.x, tz.y] : null; if (sp) this.add('白虎', sp[0], sp[1], { moveT: 2, roarT: 2 }); }
        // 朱雀（v0.8.6）：人到丹穴四十格內，就在島心現身
        const bz = g.birdAt; if (bz && U.cheb(p.x, p.y, bz.x, bz.y) <= TIGER_SEE && !this.list.some(e => e.type === '朱雀') && this.canStand('朱雀', bz.x, bz.y, night)) this.add('朱雀', bz.x, bz.y, { moveT: 2 });
        // 蠱雕（v0.8.6）：人在南邊的海上或外島上，從十到十四格外的天上飛來；一次只一隻
        if (this.count('雕') === 0 && Math.random() < this.harpyP && g.harpySky && g.harpySky()) {
          const m = this.spawnNear('雕', p, 10, 14, night, { moveT: 1, mode: 'circle', diveT: HARPY_DIVE[0] + Math.random() * (HARPY_DIVE[1] - HARPY_DIVE[0]), cryT: 3 });
          if (m && g.harpyRose) g.harpyRose(m);
        }
        // 鑿齒（v0.8.5）：人在西邊的外島上，從八到十四格外的陸地走出來；一次只一隻
        if (!p.sailing && !p.swimming && this.count('齒') === 0 && Math.random() < this.toothP && g.toothLand && g.toothLand()) {
          const m = this.spawnNear('齒', p, 8, 14, night, { moveT: 1.5, turnT: TOOTH_TURN });
          if (m) { this.faceTo(m, p.x, p.y); if (g.toothRose) g.toothRose(m); }
        }
        // 蜃：只在玩家行船或落水時，從十到十六格外的深海浮上來；機率低，一次只一隻
        if ((p.sailing || p.swimming) && this.count('蜃') === 0 && Math.random() < this.seaP) {
          const m = this.spawnNear('蜃', p, 10, 16, night, { moveT: 1.5, fogT: 4 });
          if (m && g.seaMonsterRose) g.seaMonsterRose(m);
        }
      }
      // —— 魄：第十三夜起夜行
      this.ghostAcc += dt;
      if (this.ghostAcc > 2) {
        this.ghostAcc = 0;
        if (g.ghostNight() && !p.dead && this.count('魄') < g.ghostCap()) this.spawnNear('魄', p, 12, 20, true);
      }

      this.px = p.x; this.py = p.y;   // 野牛的尾巴不壓在人身上
      for (let i = this.list.length - 1; i >= 0; i--) {
        const e = this.list[i];
        const k = Math.min(1, dt * 11);
        e.rx += (e.x - e.rx) * k; e.ry += (e.y - e.ry) * k;
        const d = U.cheb(e.x, e.y, p.x, p.y);
        if (d <= 9) g.saw(e.type);
        if (!e.heard && d <= 8 && this.isHostile(e) && w.clear(e.x, e.y, p.x, p.y)) { e.heard = true; if (g.beastCall) g.beastCall(e); }   // 走近了先聽見牠（各有各的聲音）
        else if (e.heard && d > 14) e.heard = false;
        if (e.type !== '龍' && e.type !== '豨' && !e.tame && d > 48) { this.list.splice(i, 1); continue; }   // 封豨由遊戲端收（逃跑、死了、斃了）
        if (e.type === '鷹') {
          if (e.tame) { e.sta = Math.min(100, e.sta + dt); e.hp = Math.min(DB['鷹'].hp, e.hp + 0.3 * dt); }   // 體力每息回一點，傷慢慢好
          if (e.angryT > 0) { e.angryT -= dt; if (e.angryT <= 0) e.angry = false; }
        }
        if (e.type === '魚' && DB[w.get(e.x, e.y)].kind !== 'water') { this.list.splice(i, 1); continue; }
        if (e.type === '狼' && g.daylight() > 0.5) { this.list.splice(i, 1); continue; }                 // 狼天亮散去
        if (e.fade !== undefined && e.fade < 1) { e.fade -= dt * 1.2; if (e.fade <= 0) this.list.splice(i, 1); continue; }   // 正在煙滅
        if (e.type === '魄') {
          // 地上的光（燈、火、旺灶）三格內、龍四格內即煙滅；玩家身上的光只逼得退（見下面的行動）
          if (w.lightNear(e.x, e.y, GHOST_BURN) || this.dragonNear(e.x, e.y, 4)) { e.fade = 0.99; if (g.ghostBurned) g.ghostBurned(e); continue; }   // 遊戲端：屋外的夜裡長膽氣、燈帽少兩息（v0.6.5）
          if (g.daylight() > 0.3) {
            if (FOREST.indexOf(w.get(e.x, e.y)) >= 0) { e.frozen = true; continue; }     // 白日藏於林中，不動
            e.fade = 0.99; continue;                                                          // 不在林裡，天亮煙滅
          }
          e.frozen = false;
          if (e.dash > 0) e.dash = Math.max(0, e.dash - dt);
          if (d <= GHOST_SNUFF_R) g.ghostTouch(e, dt);                                     // 近身：吹手裡的燈
        }
        if (e.type === '蜃') {          // 吞吐霧障：每隔一陣往玩家那邊吐一片海霧
          e.fogT = (e.fogT === undefined ? 6 : e.fogT) - dt;
          if (e.fogT <= 0) { e.fogT = 16 + Math.random() * 10; if (d <= 16 && (p.sailing || p.swimming)) w.spawnSeaFog(e.x, e.y, p.x, p.y); }
        }
        if (e.type === '雕') {   // 啼聲與撲下來的倒數不跟著步子走
          e.cryT = (e.cryT === undefined ? 3 : e.cryT) - dt; if (e.cryT <= 0 && d <= HARPY_CRY_R) { e.cryT = HARPY_CRY_GAP + Math.random() * 2; if (g.harpyCry) g.harpyCry(e); }
          if (e.mode === 'circle') e.diveT = (e.diveT === undefined ? HARPY_DIVE[0] : e.diveT) - dt;
        }
        if (e.type === '豨') this.hogTimers(e, g, p, dt);
        if (e.type === '齒') { e.turnT = (e.turnT === undefined ? TOOTH_TURN : e.turnT) - dt; if (e.turnT <= 0) { e.turnT = TOOTH_TURN; this.faceTo(e, p.x, p.y); } }   // 一息多才轉一回身
        if (e.type === '白虎') {   // 沒帶虎符的人進了六格：一聲嘯，地跟著抖
          e.roarT = (e.roarT === undefined ? 2 : e.roarT) - dt;
          if (e.roarT <= 0 && d <= TIGER_ROAR_R && g.tigerRoar && g.tigerRoar(e)) e.roarT = TIGER_ROAR_GAP;
        }
        const rate = e.slowT > 0 ? 0.5 : 1;            // 撞在台邊：五息內行動與撲咬都慢一倍
        if (e.slowT > 0) e.slowT -= dt;
        if (e.provoked > 0) e.provoked -= dt;
        if (e.atk > 0) e.atk -= dt * rate;
        if (e.calm > 0) e.calm -= dt;
        e.moveT -= dt * rate * (STAIRS.indexOf(w.get(e.x, e.y)) >= 0 && FLIERS.indexOf(e.type) < 0 ? 1 / STAIR_SLOW : 1);   // 走在階、台上腳步慢半倍（v0.6.8）
        if (e.moveT > 0) continue;

        const sheltered = !!DB[w.get(p.x, p.y)].shelter;
        // 被鷹咬過的獸會反擊鷹：貼著就啄回去，否則照常
        if (e.foe) {
          if (!this.list.includes(e.foe) || e.foe.hp <= 0 || U.cheb(e.x, e.y, e.foe.x, e.foe.y) > 6) e.foe = null;
          else if (U.cheb(e.x, e.y, e.foe.x, e.foe.y) <= 1 && e.atk <= 0) {
            const dmg = DB[e.type].atk || U.r4((DB[e.type].bite || 2) * (DB[e.type].venomT || 5));   // 咬鷹：一口的毒全算上（蛇 13.5、毒蛛 6.75、蟾 10）
            e.foe.hp -= dmg; e.atk = HOSTILE.indexOf(e.type) >= 0 ? 1.6 : 1.2; e.moveT = 0.5;
            if (e.foe.hp <= 0) { g.companionDied(e.foe, e); e.foe = null; }
            continue;
          }
        }
        // 被彈弓打惱了：七格內直撲過來；七格外照常
        if (e.provoked > 0 && d <= PROVOKE_R && (CHARGERS.indexOf(e.type) >= 0 || (e.type === '蟾' && e.venom)) && !e.tame) {
          if (d <= 1) { if (BITERS.indexOf(e.type) >= 0) this.bite(e, g); else this.maul(e, g); e.moveT = 0.5; }   // 無毒蛛的 bite 只是咬一口
          else { e.moveT = CHARGE_STEP; this.stepTo(e, p.x, p.y, false, true); }   // 惱了連白天也出林
          continue;
        }
        if (e.type === '蜃') {
          const atSea = p.sailing || p.swimming, warded = p.sailing && g.shipWarded();
          const dShip = p.sailing ? Math.min(...g.shipCells().map(([x, y]) => U.cheb(e.x, e.y, x, y))) : d;   // 到船身最近一格
          if (atSea && warded && dShip <= 3) { e.moveT = 0.5; this.stepTo(e, p.x, p.y, true, night); if (!e.warned) { e.warned = true; g.message('船頭的' + g.shipSkullName() + '鎮著，蜃不敢近。'); } }
          else if (atSea && !warded && dShip <= 1) {
            if (e.atk <= 0) { e.atk = 2.5; if (p.sailing) g.ramShip(e); else g.hit(e, DB['蜃'].atk); }
            e.moveT = 0.6;
          } else if (atSea && d <= 14) { e.moveT = 0.4; this.stepTo(e, p.x, p.y, false, night); }
          else { e.moveT = 1 + Math.random() * 1.5; this.wander(e, night, null); }
          continue;
        }
        if (e.type === '齒') {     // 鑿齒：貼著時人在盾前才撞得到，在身側背後就等牠轉過身來；十二格內追過來
          if (d <= 1 && !sheltered) { if (this.inFront(e, p.x, p.y) && e.atk <= 0) { g.hit(e, DB['齒'].atk); e.atk = TOOTH_GAP; } e.moveT = 0.3; }
          else if (d <= this.sense(e, p, TOOTH_SENSE) && !sheltered) { e.moveT = TOOTH_STEP; const ox = e.x, oy = e.y; if (this.stepTo(e, p.x, p.y, false, night)) this.faceTo(e, e.x + (e.x - ox), e.y + (e.y - oy)); }
          else { e.moveT = 1 + Math.random() * 1.5; if (Math.random() < 0.5) this.wander(e, night, null); }
          continue;
        }
        if (e.type === '豨') { this.hogAct(e, g, p, night, sheltered); continue; }
        if (e.type === '雕') {     // 蠱雕：盤旋 → 撲下來抓一下、貼著停一會兒 → 飛回高處
          if (e.mode === 'dive') {
            if (d <= 1) { if (e.atk <= 0) { g.hit(e, DB['雕'].atk); e.atk = 1.2; } e.mode = 'rise'; e.moveT = HARPY_LINGER; }
            else if (sheltered || d > HARPY_SENSE) { e.mode = 'circle'; e.moveT = 0.4; }
            else { e.moveT = HARPY_DIVE_STEP; this.stepTo(e, p.x, p.y, false, night); }
          } else if (e.mode === 'rise') {
            e.moveT = HARPY_RISE_STEP; this.stepTo(e, p.x, p.y, true, night);
            if (U.cheb(e.x, e.y, p.x, p.y) >= HARPY_RING[0] + 1) { e.mode = 'circle'; e.diveT = HARPY_DIVE[0] + Math.random() * (HARPY_DIVE[1] - HARPY_DIVE[0]); }
          } else {
            if (e.diveT <= 0 && d <= HARPY_SENSE && !sheltered) { e.mode = 'dive'; e.moveT = 0.1; }
            else if (d > HARPY_RING[1]) { e.moveT = 0.3; this.stepTo(e, p.x, p.y, false, night); }
            else if (d < HARPY_RING[0]) { e.moveT = 0.3; this.stepTo(e, p.x, p.y, true, night); }
            else { e.moveT = 0.35 + Math.random() * 0.25; this.hover(e, p, HARPY_RING[0], HARPY_RING[1]); }
          }
          continue;
        }
        if (e.type === '朱雀') {   // 朱雀：沒帶朱羽、沒求教過的人走進五格，就飛開；否則在丹穴島心三格內，人來了四格內就落下來等
          const calm = g.phoenixCalm && g.phoenixCalm(), bz = g.birdAt;
          if (!calm && d < PHOENIX_AWAY) { e.moveT = 0.28; this.stepTo(e, p.x, p.y, true, night); if (g.phoenixShy) g.phoenixShy(e); continue; }
          e.moveT = 1.2 + Math.random() * 1.4;
          if (d <= 4) { continue; }
          if (bz && U.cheb(e.x, e.y, bz.x, bz.y) > 3) this.stepTo(e, bz.x, bz.y, false, night); else if (Math.random() < 0.4) this.wander(e, night, null);
          continue;
        }
        if (e.type === '白虎') {   // 伏在虎嶺島心三格內，不近人也不避人；人來了四格內就停下來
          e.moveT = 1.4 + Math.random() * 1.6; const tz = g.tigerAt;
          if (d <= 4) { this.faceTo(e, p.x, p.y); continue; }
          if (tz && U.cheb(e.x, e.y, tz.x, tz.y) > 3) this.stepTo(e, tz.x, tz.y, false, night); else if (Math.random() < 0.4) this.wander(e, night, null);
          continue;
        }
        if (e.type === '青龍') {   // 在自己那片海上盤著（離家三格內），不近人也不避人
          e.moveT = 1.2 + Math.random() * 1.5; const az = g.azure;
          if (d <= 4) continue;   // 人來了就停下來等（也免得壓在船上）
          if (az && U.cheb(e.x, e.y, az.x, az.y) > 3) this.stepTo(e, az.x, az.y, false, night); else if (Math.random() < 0.5) this.wander(e, night, null);
          continue;
        }
        if (e.type === '龍') {
          if (d > 4) { e.moveT = 0.22; this.stepTo(e, p.x, p.y, false, night); }
          else { e.moveT = 0.5 + Math.random() * 1.0; if (Math.random() < 0.5) this.wander(e, night, null); }
        } else if (e.type === '魄') {
          const sp = g.ghostSpeed(), lit = g.hasLight();   // 第廿夜起越來越快
          if (e.dash > 0) { e.moveT = GHOST_DASH_STEP / sp; if (d > 1) this.stepTo(e, p.x, p.y, false, true); }                 // 撲燈：直衝過來
          else if (lit && d <= GHOST_KEEP) { e.moveT = 0.45 / sp; this.stepTo(e, p.x, p.y, true, true); }                      // 身上有光：逼退到六格外
          else if (lit && d <= GHOST_HOVER) { e.moveT = (0.8 + Math.random() * 0.6) / sp; this.hover(e, p, GHOST_KEEP + 1, GHOST_HOVER); }   // 在光的邊上徘徊
          else if (d <= 14) { e.moveT = 0.45 / sp; if (d > 2) this.stepTo(e, p.x, p.y, false, true); }
          else { e.moveT = (0.8 + Math.random()) / sp; this.wander(e, true, null); }
        } else if (e.type === '鳥') {
          const home = dusk ? this.nearestPlace(e.x, e.y, '塔寺燈', 60) : null;
          if (d <= 3) { e.moveT = 0.18; this.stepTo(e, p.x, p.y, true, night); }
          else if (home && U.cheb(e.x, e.y, home.x, home.y) > 1) { e.moveT = 0.3; this.stepTo(e, home.x, home.y, false, night); }
          else if (home) { e.moveT = 3 + Math.random() * 4; }
          else { e.moveT = 0.5 + Math.random() * 1.6; if (Math.random() < 0.5) this.wander(e, night, '木林森竹'); }
        } else if (e.type === '鹿') {
          const spring = dusk ? this.nearestPlace(e.x, e.y, '泉', 45) : null;
          if (d <= 5) { e.moveT = 0.22; this.stepTo(e, p.x, p.y, true, night); }
          else if (spring && U.cheb(e.x, e.y, spring.x, spring.y) > 1) { e.moveT = 0.4; this.stepTo(e, spring.x, spring.y, false, night); }
          else if (spring) { e.moveT = 2 + Math.random() * 3; }
          else { e.moveT = 0.7 + Math.random() * 1.6; if (Math.random() < 0.6) this.wander(e, night, '林木草竹棉麻'); }
        } else if (e.type === '魚') {
          e.moveT = 0.5 + Math.random() * 1.2; if (Math.random() < 0.7) this.wander(e, night, '水');   // 魚愛在淺水游（v0.5.1，撒網撒得到）
        } else if (e.type === '虎' || e.type === '豹') {
          const sees = w.clear(e.x, e.y, p.x, p.y);   // 隔著磚看不見人，也看不見人身上的光
          const scared = w.lightNear(e.x, e.y, 2) || (sees && (w.lightNear(p.x, p.y, 2) || (g.hasLight() && night))) || this.dragonNear(e.x, e.y, 4);
          const range = (e.type === '豹' ? (night ? 9 : 6) : (night ? 8 : 4)) * (sees ? 1 : SMELL), speed = e.type === '豹' ? 0.22 : (night ? 0.24 : 0.3);
          if ((scared || sheltered) && d <= 4) { e.moveT = 0.3; this.stepTo(e, p.x, p.y, true, night); }
          else if (e.calm <= 0 && d <= range) {
            if (d <= 1) { this.maul(e, g); e.calm = e.type === '豹' ? 3 : 14; e.moveT = 0.6; }
            else { e.moveT = speed; this.stepTo(e, p.x, p.y, false, night); }
          } else {
            const rival = e.type === '虎' ? this.list.find(o => o !== e && o.type === '虎' && U.cheb(o.x, o.y, e.x, e.y) < TIGER_GAP) : null;
            if (rival) { e.moveT = 0.6; this.stepTo(e, rival.x, rival.y, true, night); }   // 一山不容二虎：太近就走開
            else { e.moveT = 0.6 + Math.random() * 1.4; if (Math.random() < 0.6) this.wander(e, night, night ? null : '森林'); }
          }
        } else if (e.type === '狼') {
          if (this.dragonNear(e.x, e.y, 4) && d <= 4) { e.moveT = 0.3; this.stepTo(e, p.x, p.y, true, true); }
          else if (e.calm <= 0 && d <= this.sense(e, p, 10) && !sheltered) {
            if (d <= 1) { this.maul(e, g); e.calm = 2; e.moveT = 0.5; }
            else { e.moveT = 0.32; this.stepTo(e, p.x, p.y, false, true); }
          } else { e.moveT = 0.7 + Math.random(); this.wander(e, true, null); }
        } else if (e.type === '蛇') {
          if (d <= 1 && !sheltered) { this.bite(e, g); e.moveT = 0.5; }
          else if (d <= this.sense(e, p, 5) && !sheltered) { e.moveT = 0.4; this.stepTo(e, p.x, p.y, false, night); }
          else { e.moveT = 1 + Math.random() * 2; if (Math.random() < 0.4) this.wander(e, night, '草木'); }
        } else if (e.type === '鷹') {
          if (e.tame) {
            const tgt = e.sta >= 6 ? this.hostileNear(p, 6) : null;
            if (tgt) {
              if (U.cheb(e.x, e.y, tgt.x, tgt.y) <= 1) {
                if (e.atk <= 0) { tgt.hp -= 20; tgt.angry = true; tgt.foe = e; e.sta -= 6; e.atk = 1.5; g.eagleHit(e, tgt); if (tgt.hp <= 0) g.kill(tgt); }
                e.moveT = 0.4;
              } else { e.moveT = 0.2; this.stepTo(e, tgt.x, tgt.y, false, night); }
            } else if (d > 3) { e.moveT = 0.2; this.stepTo(e, p.x, p.y, false, night); }
            else { e.moveT = 0.6 + Math.random(); if (Math.random() < 0.5) this.wander(e, night, null); }
          } else if (e.angry) {
            if (d <= 1) { this.maul(e, g); e.moveT = 0.6; }
            else if (d <= 8) { e.moveT = 0.25; this.stepTo(e, p.x, p.y, false, night); }
            else { e.angry = false; e.moveT = 1; }
          } else { e.moveT = 0.8 + Math.random() * 1.5; if (Math.random() < 0.5) this.wander(e, night, null); }
        } else if (e.type === '龜') {
          if (e.angry) {                 // 挨了打：往最近的海逃，比平常快四成；一下水就不見了
            if (e.flee === undefined) e.flee = this.seaTarget(e);
            const t = e.flee;
            if (t && U.cheb(e.x, e.y, t.x, t.y) <= 1) { this.list.splice(i, 1); if (g.turtleGone) g.turtleGone(e, d); continue; }
            e.moveT = TURTLE_STEP / TURTLE_FLEE;
            if (t) { if (!this.stepTo(e, t.x, t.y, false, night)) this.stepTo(e, p.x, p.y, true, night); } else this.stepTo(e, p.x, p.y, true, night);
          } else { e.moveT = (2 + Math.random() * 3) * 1.5; if (Math.random() < 0.5) this.wander(e, night, '草沙土'); }   // 閒晃也慢三分之一
        } else if (e.type === '豬') {    // 野豬：五格內見人就衝，速度同豹；不怕火光；撞一下退開三息
          if (this.dragonNear(e.x, e.y, 4) && d <= 4) { e.moveT = 0.3; this.stepTo(e, p.x, p.y, true, night); }
          else if (e.calm <= 0 && d <= this.sense(e, p, BOAR_RANGE) && !sheltered) {
            if (d <= 1) { this.maul(e, g); e.calm = 3; e.moveT = 0.6; }
            else { e.moveT = BOAR_STEP; this.stepTo(e, p.x, p.y, false, night); }
          } else { e.moveT = 0.8 + Math.random() * 1.4; if (Math.random() < 0.5) this.wander(e, night, '林竹草'); }
        } else if (e.type === '牛') {    // 野牛：不惹不動；惹了追著頂、記仇遠（十八格、三十息），躲進屋裡就撞磚
          if (e.angry && (d > this.sense(e, p, BISON_GIVEUP) || this.world.time - (e.angryAt || 0) > BISON_CALM)) e.angry = false;
          if (e.angry) {
            if (d <= 1) { this.maul(e, g); e.calm = 2; e.moveT = 0.8; }
            else {
              e.moveT = BISON_STEP;
              const nx = e.x + Math.sign(p.x - e.x), ny = e.y + Math.sign(p.y - e.y), ch = w.get(nx, ny);
              const wall = this.rammable(nx, ny);
              if (wall) { this.ram(e, g, nx, ny); e.moveT = 0.5; }
              else if (!this.stepTo(e, p.x, p.y, false, night)) {           // 卡住了：找旁邊擋路的人造磚撞
                let best = null, bd = Infinity;
                for (const [dx, dy] of N8) { const x = e.x + dx, y = e.y + dy; if (!this.rammable(x, y)) continue; const dd = U.dist(x, y, p.x, p.y); if (dd < bd) { bd = dd; best = [x, y]; } }
                if (best) { this.ram(e, g, best[0], best[1]); e.moveT = 0.5; }
              }
            }
          } else { e.moveT = 1.5 + Math.random() * 2; if (Math.random() < 0.5) this.wander(e, night, '草'); }
        } else if (e.type === '蛛' || e.type === '蟾') {
          if (e.angry && !(e.type === '蛛' && e.venom) && (this.world.time - (e.angryAt || 0) > RILE_CALM || d > RILE_GIVEUP)) e.angry = false;   // 惹了的消氣（v0.7.3）
          const hostile = (e.type === '蛛' && e.venom) || e.angry;     // 毒蛛見人就撲；其餘蛛、蟾被惹了才衝過來咬（v0.7.3 起無毒蟾也是）
          if (hostile && d <= 1) { this.bite(e, g); e.moveT = 0.5; }
          else if (hostile && d <= this.sense(e, p, 6)) { e.moveT = 0.35; this.stepTo(e, p.x, p.y, false, night); }
          else { e.moveT = 1 + Math.random() * 2; if (Math.random() < 0.4) this.wander(e, night, e.type === '蟾' ? '草沙土水' : null); }
        }
        // 山海衣：七格內主動攻擊的獸行動慢一倍
        if (g.totemNear && this.isHostile(e) && e.type !== '鷹' && e.type !== '豨' && g.totemNear(e.x, e.y)) e.moveT *= 2;   // 大魔王不吃山海衣這一套
      }
    }

    serialize() { return this.list.filter(e => e.type === '龍' || e.type === '蜃' || (e.type === '鷹' && e.tame)).map(e => ({ t: e.type, x: e.x, y: e.y, hp: e.hp, sta: e.sta, tame: e.tame })); }
    restore(arr) { for (const s of arr || []) { if (s.t === '蜃') continue; this.add(s.t, s.x, s.y, s.tame ? { hp: s.hp, sta: s.sta, tame: true } : {}); } }   // 蜃不跟著讀檔回來：沒解決的蜃由遊戲端扣膽氣
  }

  root.Entities = Entities;
})();
