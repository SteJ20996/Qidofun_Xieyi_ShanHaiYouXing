// world.js —— 一紙之島：程序生成的"底稿" + 玩家改動的"差異層" + 火勢/演替/復原模擬 + 潮汐、地標、探索迷霧、小路、灶與落囊
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const U = root.U, G = root.G, DB = G.DB;
  const CH = 16;                 // 區塊邊長（格）
  const STEP = 0.5;              // 模擬步長（秒）
  let DAY = 300;                 // 一晝夜（秒），潮汐隨之起落；一日從午夜算起（天亮 0.25、天黑 0.75）。v0.6.10 起看難度（簡單 420、一般 360、困難 300），game.js 開島或讀檔時用 World.setDay() 定
  const DEEP_R = 18;   // 深海離陸地與沙洲至少幾格（v0.9.18 使用者定）
  const HAIL_P = 0.05, HAIL_TERMS = [6, 13], HAIL_LEN = 1 / 12, HAIL_CROP = 0.3, HAIL_LAMP = 0.25, HAIL_SCARE = 0.25;   // 冰雹（v0.9.19 使用者定：夏季、極少）：立夏到處暑的雷雨，HAIL_P 的機會一起頭夾著一時辰的冰雹；屋外的苗秀三成砸死、熟的三成砸落成穗，燈、稻草人各四分之一砸壞
  const LOCUST_P = 0.025, LOCUST_MIN = 6, LOCUST_R = 8, LOCUST_FIRE = 6, LOCUST_TERMS = [10, 13];   // 蝗（v0.9.19）：小暑到處暑，自己種了六格以上，每日 LOCUST_P 起一群，隔天半夜落在方圓 LOCUST_R 格的田上；地上的燈火 LOCUST_FIRE 格內的田保得住
  // 打雀招蝗（v0.9.25 使用者定）：田邊 SPARROW_KILL_R 格內、SPARROW_KILL_DAYS 日內打死的雀過了 SPARROW_FREE 隻，每多一隻蝗起的機會多 SPARROW_LOCUST 倍，最多 SPARROW_LOCUST_MAX 倍，蝗群也專落那一帶的田；記最多 SPARROW_KEEP 筆
  const SPARROW_FREE = 3, SPARROW_LOCUST = 0.25, SPARROW_LOCUST_MAX = 2.5, SPARROW_KILL_R = 24, SPARROW_KILL_DAYS = 360, SPARROW_KEEP = 120;
  const MOUSE_P = 0.08, MOUSE_MAX = 2, CAT_R = 12;   // 田鼠（v0.9.19）：秀了、熟了的田每日 MOUSE_P 的機會被偷一把（最多 MOUSE_MAX），籬與稻草人擋不住，只有方圓 CAT_R 格內守田的狸
  const PECK_P = 0.15, PECK_MAX = 2, FENCE_ROOM = 400;   // 五穀（v0.9.18）：秀了、熟了的田沒有稻草人看著，每日 PECK_P 的機會被雀啄一口（收成少一把，最多 PECK_MAX）；籬圍起來 FENCE_ROOM 格以內不生獸
  const morning = (d) => (root.CAL ? root.CAL.dawn(d) : 0.25) + 0.01;   // 大清早：那天日出後一點（v0.9.16 以前固定 0.26；v0.9.17 起日出照節氣）
  // 牆的耐久（v0.6.2，不顯示，只計算）：野牛撞一下扣 1。磚 4，撞到剩一半就成了「墟」；墟（村裡的殘垣也是）2；窗、門 2，剩一半時字變色
  const KILN_T = 0.25, KILN_PULL = 1, JAR_CAP = 6, JAR_FILL = 1 / 16;   // 窯（v0.9.21）：一窯燒 t × KILN_T 日；燒的時候借火的灶每息多耗 KILN_PULL 息；缸最多 JAR_CAP 瓶，雨雪裡每 JAR_FILL 日接一瓶
  const WALL_HP = { '磚': 4, '甓': 6, '墟': 2, '窗': 2, '門': 2, '籬': 2, '扉': 2 };   // 籬與扉（v0.9.18）兩下就碎          // 開局、讀舊存檔時的時刻：大清早（天亮之後一點點）
  const EX_BASE = 0x4E00, EX_OFF = 8192;   // 走過的地圖存成一串字（v0.9.3，見 packExplored）：字從「一」起，塊的座標加 EX_OFF 免得是負數
  const STOVE_CAP = 999, SHELF_SLOTS = 4;   // 灶與鼎的火最多存 999 息（v0.5.1，原 900）；灶的柴架四格
  const NET_DUR = { 1: 30, 2: 90, 3: 240 };   // 漁網的耐久：小中大各能取幾條魚（v0.4.12），取完就破、不再進魚，棉麻加固回滿
  const TIDE_WET = 0.7;          // 灘一天裡有七成時間在水下（退潮 0.12–0.42）；放在灘上的網魚來得慢，間隔除以這個數
  const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  // 天氣：雨。一場雨下 RAIN_MIN–RAIN_MAX 秒，停後隔 RAIN_GAP_MIN–RAIN_GAP_MAX 秒再來（真隨機，不走種子）；
  // 下雨時屋外的燈每盞每息有 rainLampP 的真隨機機會被澆壞（預設 RAIN_LAMP_P；開局由 game.js 照難度改成 DIFF.*.lampP：簡單 1/4500、一般 1/2500、困難 1/800）；ROOM_LIMIT 格內被磚圍得住才算屋裡
  // 霧障：每日擲 FOG_ROLLS 次、每次 FOG_P 的真隨機機會起一片霧（每日最多兩片，第二日起）；一片 FOG_MIN–FOG_MAX 格、形狀隨機長；
  // 起在玩家 FOG_NEAR 格外的陸地上；放著不管 FOG_LIFE 後自己散
  const FOG_ROLLS = 2, FOG_P = 0.25, FOG_NEAR = [8, 28];
  let FOG_LIFE = DAY;
  const SEA_FOG_LIFE = 90;   // 蜃吐的海霧：九十息就散
  // v0.8.8：挖空的礦脈寫回白紙時，不寫回礦本身（先前鐵煤挖成石、再挖成白紙，幾分鐘就寫回原礦，繞過了七到十日才長回來的規則）
  const SPENT = { '鐵': '石', '煤': '石', '曜': '岩', '燧': '礫' };
  const ORE_DAYS = [7, 10], ORE_BACK = '石草白';   // 鑿掉的鐵礦七到十日（真隨機）後在原地長回來，那時那格是石、草或白紙才長得回，不然就沒了（v0.6.10 使用者定）
  const SCARE_DAYS = 45, SCARE_CAP = 60;   // 稻草人守幾天、續上最多幾天（v0.6.10 使用者定四十五天；續的上限照舊多三分之一：三十／四十 → 四十五／六十）
  // 霧的形（v0.6.4 使用者定）：一片霧是一塊連續的形，面積十八格上下（FOG_AREA），可圓可方（超橢圓的次方 2–6）、扁圓不一、斜著放，
  // 邊上再疊兩三道慢慢轉的起伏，次方、扁圓、角度也慢慢變，所以形狀一直在變。蓋到一格超過 FOG_COVER（5%）就算霧，最多算 FOG_CAP（30）格（蓋得最多的那些）。
  // 霧不進圍起來、裡面能走的格子不超過 FOG_ROOM（45）格的屋子；其餘山、海、林都飄得過去，不回頭（v0.6.5 使用者定）。
  // 碰到這種屋子，被擋掉的那一塊撐到屋外別處（形變了、面積不變，最多撐到 FOG_GROW_MAX 倍），方向也拐開繞過去。海霧的面積是 SEA_FOG_AREA。
  const FOG_AREA = [16, 20], SEA_FOG_AREA = [6, 10], FOG_COVER = 0.05, FOG_CAP = 30, FOG_ROOM = 45, FOG_SAMPLE = 5, FOG_GROW_MAX = 6, FOG_EDGE = 8;
  const SUPER_K = (() => {   // 超橢圓 |x|^n + |y|^n = 1 的面積，n = 2.0、2.1 … 6.0（n=2 是 π，越方越近 4）
    const t = []; for (let i = 0; i <= 40; i++) { const n = 2 + i / 10; let a = 0; const M = 720; for (let j = 0; j < M; j++) { const ph = (j + 0.5) / M * Math.PI * 2, r = Math.pow(Math.pow(Math.abs(Math.cos(ph)), n) + Math.pow(Math.abs(Math.sin(ph)), n), -1 / n); a += r * r; } t.push(a * Math.PI / M); }
    return (n) => { const f = (U.clamp(n, 2, 6) - 2) * 10, i = Math.min(39, Math.floor(f)); return t[i] + (t[i + 1] - t[i]) * (f - i); };
  })();
  const SHIPS = G.SHIPS;                                        // 船的兩種（孤帆、方舟）：大小、命、船頭首骨格數
  let RAIN_MIN = DAY * 0.25, RAIN_MAX = DAY * 1.0, RAIN_GAP_MIN = DAY * 1.0, RAIN_GAP_MAX = DAY * 4.0;
  const RAIN_LAMP_P = 1 / 2500, ROOM_LIMIT = 121;
  // v0.9.15 天氣（使用者定）：一場雨起時，一小部分成雪、一小部分成雷雨，其餘是雨（v0.9.16 起機會照節氣分，見 src/calendar.js 的 wxOdds()）；雨雷雪天有 GALE_P 的機會起狂風
  // （一天只往一個方向吹，雨雷雪停了就跟著停，最長 GALE_MAX 日）；晴天每日 BREEZE_P 的機會起和風。狂風每息把墟吹倒 GALE_RUIN_P、
  // 把稻草人吹走 GALE_SCARE_P（墟只看你方圓 GALE_RUIN_R 格內的，稻草人全紙）。HOUSE_MAX 格以內的屋子：雷打不進、風吹不著（game.js 用）
  // 屋有其用（v0.9.26 使用者定）：三十八格以內的屋子照擺了什麼認——居：床、灶，再有櫃或甕；丹房：鼎與燈（或鮫珠），沒有床；倉：只有櫃、甕，沒有床灶鼎窯
  // ROOM_FURN 是數得進去的擺設（貼著屋裡能走的格子、上下左右相鄰）；DECOR 是四樣擺設（屏、案、几、盆景），丹房的鼎每息只耗 DAN_FUEL 的柴
  const ROOM_FURN = '床灶櫃甕鼎燈珠窯缸屏案几盆', DECOR = '屏案几盆', DAN_FUEL = 0.75;
  function roomKind(h) {
    if (h['床'] && h['灶'] && (h['櫃'] || h['甕'])) return '居';
    if (h['鼎'] && (h['燈'] || h['珠']) && !h['床']) return '丹房';
    if ((h['櫃'] || h['甕']) && !h['床'] && !h['灶'] && !h['鼎'] && !h['窯']) return '倉';
    return '';
  }
  const GALE_P = 0.06, GALE_MAX = 3, BREEZE_P = 0.18, GALE_RUIN_P = 0.0002, GALE_SCARE_P = 0.003, GALE_RUIN_R = 40, HOUSE_MAX = 38;
  const DIR8 = [[0, -1, '北'], [1, -1, '東北'], [1, 0, '東'], [1, 1, '東南'], [0, 1, '南'], [-1, 1, '西南'], [-1, 0, '西'], [-1, -1, '西北']];   // 狂風把人往哪裡吹；風名照它從哪裡來（往南吹的是北風）
  const SEEN_STEP = 6;   // v0.9.6：走過的地圖每半息記一次、或離上回記的地方六格就記（船快 2.5 倍時半息能走九到十六格）
  // 一日多長（v0.6.10 看難度）：以日計的長度（霧障一日、雨四分之一到一日、雨停一到四日）跟著換
  const setDay = (sec) => { DAY = sec; FOG_LIFE = DAY; RAIN_MIN = DAY * 0.25; RAIN_MAX = DAY * 1.0; RAIN_GAP_MIN = DAY * 1.0; RAIN_GAP_MAX = DAY * 4.0; };
  // 小屋：磚與門圍起的小空間，裡面不生生靈、生靈也進不去。多小才算看難度，由 game 透過 roomLimitFor(type) 告訴世界：獸一個門檻、魄一個門檻
  // （簡單 28／18、一般 18／8、困難 10／0，0 ＝ 磚擋不住魄）；MAX_ROOM 是各門檻的最大值，漫延數到這裡就停
  const MAX_ROOM = 28;
  // 霧障會動（v0.6.4 起是連續地飄：每息 1/FOG_STEP 格，方向每 FOG_STEP 息上下重新定一次）。以下是 v0.4.13 的舊說明：每 FOG_STEP 息上下挪一格（v0.4.13 起間隔六到十四成之間抖動），速度慢；FOG_LIGHT_R 格內有光（燈、火、旺灶、玩家手裡的光）就往反方向躲，沒光就順著自己的風向慢慢飄，風向有慣性、偶爾轉；挪完偶爾換形（尾巴掉一格、前頭長一格）
  const FOG_STEP = 6, FOG_LIGHT_R = 10;

  // 存檔瘦身（v0.9.21 使用者定）：差異層與草木長回來的計時器原本是 {"x,y": …}，一格十幾二十個字；改成兩串字——
  //   dz 差異層：一列一列（y 由小到大），每列寫「跟上一列差幾列:」，再寫一段段「跟上一段的尾巴差幾格」＋這段連續的字；數字 36 進位
  //   tz 計時器：照長回來的時刻排，每個寫「x,y,跟上一個差幾（萬分之一息）」＋長成什麼＋原本什麼；用 ; 隔開
  //   dp 多字的字（例如雙字之物）用私用區的一個字代，這張表記怎麼換回來；單字的字照寫
  // 讀的時候 loosen() 換回舊的寫法；舊存檔（有 diff、timers）照舊讀
  const PU = 0xE000;
  function packWorld(diff, timers) {
    const dp = {}, inv = {}, code = (t) => { if (t.length === 1) return t; if (!(t in inv)) { const c = String.fromCharCode(PU + Object.keys(dp).length); inv[t] = c; dp[c] = t; } return inv[t]; };
    const rows = new Map(); for (const [k, v] of diff) { const i = k.indexOf(','), x = +k.slice(0, i), y = +k.slice(i + 1); let r = rows.get(y); if (!r) rows.set(y, r = []); r.push([x, v]); }
    const out = []; let py = 0;
    for (const y of [...rows.keys()].sort((a, b) => a - b)) {
      const r = rows.get(y).sort((a, b) => a[0] - b[0]); let s = (y - py).toString(36) + ':', px = 0, ex = null;
      for (const [x, v] of r) { if (ex !== null && x === ex) s += code(v); else s += (x - px).toString(36) + code(v); px = x + 1; ex = x + 1; }
      out.push(s); py = y;
    }
    const tl = []; for (const [k, v] of timers) { const i = k.indexOf(','); tl.push([+k.slice(0, i), +k.slice(i + 1), v.to, Math.round(v.at * 1e4), v.from || '灰']); }
    tl.sort((a, b) => a[3] - b[3]); let pt = 0;
    const tz = tl.map(([x, y, to, at, from]) => { const d = at - pt; pt = at; return x.toString(36) + ',' + y.toString(36) + ',' + d.toString(36) + code(to) + code(from); }).join(';');
    return { dz: out.join('|'), tz, dp };
  }
  function loosen(w) {   // 存檔裡的 dz、tz 換回 diff、timers（就地改；本來就是舊寫法的不動）
    if (!w || typeof w.dz !== 'string') return w;
    const dp = w.dp || {}, un = (c) => dp[c] || c, diff = {}, timers = {};
    let y = 0; for (const row of w.dz ? w.dz.split('|') : []) { const j = row.indexOf(':'); y += parseInt(row.slice(0, j), 36); let x = 0; const re = /(-?[0-9a-z]+)([^\x00-\x7f]+)/g; let m; while ((m = re.exec(row.slice(j + 1)))) { x += parseInt(m[1], 36); for (const c of m[2]) { diff[x + ',' + y] = un(c); x++; } } }
    let t = 0; for (const e of w.tz ? w.tz.split(';') : []) { const m = /^(-?[0-9a-z]+),(-?[0-9a-z]+),(-?[0-9a-z]+)([^\x00-\x7f])([^\x00-\x7f])$/.exec(e); if (!m) continue; t += parseInt(m[3], 36); timers[parseInt(m[1], 36) + ',' + parseInt(m[2], 36)] = [un(m[4]), t / 1e4, un(m[5])]; }
    w.diff = Object.assign(diff, w.diff || {}); w.timers = Object.assign(timers, w.timers || {}); delete w.dz; delete w.tz; delete w.dp; return w;   // 兩種寫法都有時（手改過的存檔），舊寫法那幾格蓋在上面
  }
  class World {
    constructor(seed) {
      this.seed = seed | 0;
      this.chunks = new Map();   // "cx,cy" -> 字符數組（底稿）
      this.diff = new Map();     // "x,y" -> 字（與底稿不同的格子）
      this.burn = new Map();     // "x,y" -> { t: 剩餘燃燒秒數, lvl: 火勢 }
      this.timers = new Map();   // "x,y" -> { from: 現在的字, to: 目標字, at: 世界時間 }（灰化土、草木長回來）
      this.scarecrows = new Map(); // "x,y" -> 稻草人失效的世界時間
      this.wild = new Map();       // 野生的苗田（v0.9.18）："x,y" -> 什麼穀；底稿是田的格子，生成底稿時一起算，不存檔
      this.crops = new Map();      // 種下的穀（v0.9.18）："x,y" -> { c 什麼穀, t 下種時刻, f 下種時的地力, pk 被雀啄幾口, rt 熟的時刻, shed 落成遺穗 }
      this.fert = new Map();       // 地力（v0.9.18）："x,y" -> { v 幾點, t 從幾時起空著, b 種著東西 }；沒記的照底稿（原本是田 3、鋤出來的 2）
      this.cropDay = -1; this.wildDay = -1; this.wildStage = {};
      this.hail = null; this.hailP = HAIL_P; this.onHail = null;   // 冰雹（v0.9.19）：{ until }；測試可以把 hailP 設 0
      this.locust = null;          // 要落下來的蝗群（v0.9.19）：{ x, y, at 幾時落, sp 雀打得太兇多出的隻數（v0.9.25） }
      this.sparrowKills = [];      // 打死的雀（v0.9.25）：[x, y, 第幾日]，只留一年內的
      this.cats = new Map();       // 守田的狸（v0.9.19）："x,y" -> { x, y, t 幾時留下的 }
      this.fenceCache = new Map(); this.fences = new Set(); this.onCrop = null;   // fences：放著籬、扉的格子（沒有就不用漫延）   // onCrop(type, x, y, rec)：遊戲端說一聲（凍死、落穗、雀啄）
      this.ores = new Map();       // "x,y" -> 鑿掉的鐵礦幾時長回來（世界時間）
      this.oreBlocked = () => false;   // 回調：那格上有人或生靈站著，等走開再長（免得把誰封在礦裡）
      this.chests = new Map();   // "x,y" -> 櫃、甕（v0.9.21）裡的東西
      this.kilns = new Map();    // "x,y" -> 窯裡燒著的那一窯 { out, left 還要幾息, done 燒好了 }（v0.9.21）
      this.jars = new Map();     // "x,y" -> 缸裡的水（瓶，帶小數）（v0.9.21）
      this.eaves = new Set();    // 蓋了瓦的磚、甓（v0.9.21）
      this.plaques = new Map();  // 門上的匾（v0.9.26）：門那格 "x,y" -> 匾上的字
      this.roomInfo = new Map(); this.roomInfoVer = -1;   // 屋有其用（v0.9.26）："x,y" -> 那間屋子（地上的字一變就重算）
      this.kilnT = KILN_T; this.jarCap = JAR_CAP;
      this.nets = new Map();     // 錨點 "x,y" -> { size, x, y, fish, t }：漁網（一乘一、二乘二、三乘三）
      this.netCells = new Map(); // 每一格 -> 錨點
      this.stoves = new Map();   // "x,y" -> 灶裡剩餘的柴火（秒）
      this.shelves = new Map();  // "x,y" -> 灶、鼎（v0.8.15）的柴架：最多四格 [{ n, c }]，存著的燃料點一下就燒
      this.shelfSlots = SHELF_SLOTS; this.stoveCap = STOVE_CAP;
      this.bags = new Map();     // "x,y" -> 落在地上的囊（物品列表）
      this.purses = new Map();   // "x,y" -> 死後的荷包 { until: 幾時沒了, was: 底下原本的字 }（v0.8.27：重生後十八日內）
      this.weirs = new Map();    // "x,y" -> 魚梁下一次有魚的時間
      this.steps = new Map();    // "x,y" -> 走過的次數（走多了就成路）
      this.explored = new Map(); // "cx,cy" -> 位圖：哪些格子被看見過
      this.steles = new Map();   // "x,y" -> { teach, hint }
      for (const s of G.stelePlan(this.seed)) this.steles.set(U.key(s.x, s.y), s);
      this.stelePaths = G.stelePaths(this.seed, [...this.steles.values()]);   // 走不到的碑，開一條路接上（v0.8.9）
      // 地標：大字佔地若干格；村按模板蓋印，只有井可讀
      const taken = new Set(this.steles.keys());
      this.places = G.placePlan(this.seed, taken);
      this.placeTiles = new Map(); // "x,y" -> { place, ch, big }
      for (const pl of this.places) {
        if (pl.template) {
          pl.template.forEach((row, j) => Array.from(row).forEach((ch, i) => { if (ch === '井') this.placeTiles.set(U.key(pl.x + i, pl.y + j), { place: pl, ch, big: false }); }));
        } else {
          for (let j = 0; j < pl.h; j++) for (let i = 0; i < pl.w; i++) this.placeTiles.set(U.key(pl.x + i, pl.y + j), { place: pl, ch: pl.ch, big: true });
        }
        pl.seen = false;
      }
      this.time = U.r4(DAY * morning(0)); // 世界時間（秒），從大清早開始（v0.9.17 起是立春那天的日出後）
      this.acc = 0; this.seenAcc = 0;
      this.rng = U.mulberry32(this.seed ^ 0x5bd1e995);
      this.onDiscover = null;    // 回調：首次看見某處地標
      this.lamps = new Set();    // "x,y"：玩家放的燈（雨會澆壞屋外的）
      this.rainUntil = 0;        // 雨下到幾時（0 = 沒下）
      this.nextRainAt = DAY * 1.5 + U.trueRand() * DAY * 2.5;   // 第一場雨不早於第二日
      this.rainAcc = 0; this.rainLampP = RAIN_LAMP_P;
      this.onWeather = null;     // 回調：雨起（true）／雨停（false）；第二個參數是哪一種（rain／snow／thunder，v0.9.15）
      this.wx = 'rain';          // 這一場是雨、雪還是雷雨（v0.9.15）
      this.dryCache = new Map(); // 哪一格是乾地（v0.9.17，照種子固定，算過就記著）
      this.deepCache = new Map(); // 哪一格是深海（v0.9.18）
      this.gale = null;          // 狂風：{ until, dir（DIR8 的第幾個）, day（定方向的那一日） }
      this.breezeDay = -1;       // 起和風的那一日
      this.snowP = 1; this.thunderP = 1; this.galeP = GALE_P; this.breezeP = BREEZE_P; this.galeRuinP = GALE_RUIN_P; this.galeScareP = GALE_SCARE_P;   // 測試可以改；snowP／thunderP 是乘在節氣機會上的倍率（v0.9.16），設 0 就不起
      this.onGale = null;        // 回調：狂風轉向（'turn'）、吹倒墟（'ruin', x, y）、吹走稻草人（'scare', x, y）
      this.onBreeze = null;      // 回調：今天起了和風
      this.houseCache = new Map();   // "x,y" -> 在不在 HOUSE_MAX 格以內的屋子裡（每步與每次改格清掉）
      this.galeRuins = null;     // 狂風要看的墟：{ x, y, t, list }（離上回掃的地方十格或三十息就重掃）
      this.onLampRuined = null;  // 回調：某盞燈被雨澆壞
      this.fogs = new Map();     // id -> { id, cells: Set("x,y"), until }：霧障
      this.fogCells = new Map(); // "x,y" -> id
      this.fogPlan = [];         // 今天還沒起的霧（世界時間）
      this.fogDay = Math.floor(this.time / DAY);   // 已經擲過的那一日（第一日不起霧）
      this.fogSeq = 0; this.fogP = FOG_P; this.fogStep = FOG_STEP;
      this.playerLit = () => false;   // 回調：玩家手裡（或帽上）有沒有光，霧障躲光用
      this.wallHp = new Map();        // 撞過的牆還剩多少耐久："x,y" -> 數（沒撞過的不記，照 WALL_HP）
      this.fogRoomCache = new Map();  // 霧進不進得去："x,y" -> 在不在四十五格以內的屋子裡（每步與地上的字一變就清）
      this.roomCache = new Map();     // "x,y" -> 圍起來的格數（超過 MAX_ROOM 記 MAX_ROOM+1，磚上門上水裡記 Infinity）；每步與每次改格清掉
      this.roomLimitFor = () => 0;    // 回調：某種生靈被多小的屋子擋住（0 ＝ 擋不住），game 依難度給
      this.onFog = null;         // 回調：起了一片霧
      this.ships = new Map();    // 錨點 "x,y" -> { kind, hp, skulls: [[首骨, 鎮到幾時]…], repairs, cells }：停著的船
      this.shipCells = new Map(); // 船身每一格 -> 錨點
    }

    chunk(cx, cy) {
      const k = U.key(cx, cy);
      let c = this.chunks.get(k);
      if (c) return c;
      c = new Array(CH * CH);
      const ox = cx * CH, oy = cy * CH;
      for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) c[j * CH + i] = G.baseTile(ox + i, oy + j, this.seed);
      const put = (x, y, ch) => { if (x >= ox && x < ox + CH && y >= oy && y < oy + CH) c[(y - oy) * CH + (x - ox)] = ch; };
      for (const [x, y, ch] of this.stelePaths) put(x, y, ch);
      for (const s of this.steles.values()) put(s.x, s.y, '碑');
      for (const pl of this.places) {
        if (pl.template) pl.template.forEach((row, j) => Array.from(row).forEach((ch, i) => put(pl.x + i, pl.y + j, ch)));
        else for (let j = 0; j < pl.h; j++) for (let i = 0; i < pl.w; i++) put(pl.x + i, pl.y + j, pl.ch);
      }
      for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {   // 野生的苗田（v0.9.18）：底稿是田的一片片；v0.9.19 起川原河湖邊、大漠綠洲邊的草地也有（照地域分，G.wildCrop）。稻、川原的都要兩格內有水（只看同一塊底稿裡的）
        const b0 = c[j * CH + i]; if (b0 !== '田' && b0 !== '草') continue;
        const kind = G.wildCrop(ox + i, oy + j, this.seed, b0); if (!kind) continue;
        if (kind === '稻' || (b0 === '草' && kind === '菽')) { let wet = false; for (let b = -2; b <= 2 && !wet; b++) for (let a = -2; a <= 2 && !wet; a++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < CH && jj < CH && DB[c[jj * CH + ii]].kind === 'water') wet = true; } if (!wet) continue; }
        this.wild.set(U.key(ox + i, oy + j), kind);
      }
      this.chunks.set(k, c);
      return c;
    }
    base(x, y) {
      const cx = Math.floor(x / CH), cy = Math.floor(y / CH);
      return this.chunk(cx, cy)[(y - cy * CH) * CH + (x - cx * CH)];
    }
    // 潮汐：灘在退潮時是沙，漲潮時是水
    tideLow() { const t = (this.time % DAY) / DAY; return t > 0.37 && t < 0.67; }   // 白天裡的一段退潮（v0.6.2 一日改從午夜算，跟著挪了 0.25）
    tideName() { return this.tideLow() ? '退潮' : '漲潮'; }
    get(x, y) {
      const k = U.key(x, y), d = this.diff.get(k);
      const b = d !== undefined ? d : this.base(x, y);
      if ((b === '田' || b === '草') && d === undefined && this.wild.size) { const wk = this.wild.get(k); if (wk) return this.wildGlyph(wk); }   // 野生的苗田照節氣（v0.9.18；v0.9.19 草地上的也算）
      return b === '灘' ? (this.tideLow() ? '沙' : '水') : b;
    }
    plain(x, y) { const k = U.key(x, y), d = this.diff.get(k), b = d !== undefined ? d : this.base(x, y); return b === '灘' ? (this.tideLow() ? '沙' : '水') : b; }   // 不算野生苗田的 get（找出生點用，跟 v0.9.17 以前一樣）
    // ---------- 五穀（v0.9.18） ----------
    dayIdx() { return Math.floor(this.time / DAY); }
    termNow() { return root.CAL.term(this.dayIdx()).k; }
    wildGlyph(kind) {   // 野生的苗田今天長到哪：照 CROPS[kind].wild 的四個節氣（苗、秀、熟、遺穗）輪一年
      const d = this.dayIdx();
      if (d !== this.wildDay) { this.wildDay = d; const t = root.CAL.term(d).k; this.wildStage = {}; for (const c in G.CROPS) { const b = G.CROPS[c].wild; let i = 3; for (let n = 0; n < 4; n++) { const a = b[n], z = b[(n + 1) % 4]; if (a <= z ? t >= a && t < z : t >= a || t < z) { i = n; break; } } this.wildStage[c] = ['苗', '秀', c, '穗'][i]; } }
      return this.wildStage[kind];
    }
    cropKind(x, y) { const k = U.key(x, y), r = this.crops.get(k); if (r) return r.c; this.base(x, y); return this.diff.has(k) ? null : this.wild.get(k) || null; }   // base() 先叫：那塊底稿還沒生成時，野生苗田也還沒算
    isWild(x, y) { const k = U.key(x, y); this.base(x, y); return !this.diff.has(k) && this.wild.has(k); }
    fertOf(x, y) {   // 地力：種著東西照下種時的；空著每 FERT_FALLOW 日回一點、回到 FERT_REST 為止（撒灰撒上去的四點不會掉回三）
      const k = U.key(x, y), r = this.fert.get(k);
      if (!r) return this.base(x, y) === '田' ? G.FERT_WILD : G.FERT_HOED;
      if (r.b || this.crops.has(k)) return r.v;
      return r.v >= G.FERT_REST ? r.v : Math.min(G.FERT_REST, r.v + Math.max(0, Math.floor((this.time - r.t) / (G.FERT_FALLOW * DAY))));
    }
    setFert(x, y, v, busy) { this.fert.set(U.key(x, y), { v: U.clamp(v, 0, G.FERT_MAX), t: U.r4(this.time), b: busy ? 1 : undefined }); }
    cropStage(r, term) {   // 1 苗、2 秀、3 熟；麥過冬，下種一百日以後、小滿到白露才熟
      const el = (this.time - r.t) / DAY;
      if (r.c === '麥') return el >= 100 && term >= 7 && term <= 14 ? 3 : el >= 80 && term >= 6 && term <= 14 ? 2 : 1;
      const g = G.CROPS[r.c].grow; return el >= g ? 3 : el >= g * 0.55 ? 2 : 1;
    }
    cropFrac(x, y) {   // 作物字寫到幾成（v0.9.21）：自種的照下種到熟的日數（麥照到來年小滿），野生的照節氣（苗那一節的頭一日到熟那一節的頭一日）；熟了是 1
      const k = U.key(x, y), r = this.crops.get(k), C = root.CAL;
      if (r) { const el = (this.time - r.t) / DAY; if (r.c === '麥') { const left = this.cropDaysLeft(r); return U.clamp(el / Math.max(1, el + left), 0, 1); } return U.clamp(el / G.CROPS[r.c].grow, 0, 1); }
      const kind = this.cropKind(x, y); if (!kind || !G.CROPS[kind]) return 1;
      const b = G.CROPS[kind].wild, S = C.START_DAY, Y = C.SOLAR, d = ((this.dayIdx() % Y) + Y) % Y, a = S[b[0]], span = ((S[b[2]] - a) % Y + Y) % Y || Y;
      return U.clamp((((d - a) % Y) + Y) % Y / span, 0, 1);
    }
    cropDaysLeft(r) {   // 還要幾日熟（給提示用；麥是到來年小滿）
      if (r.c !== '麥') return Math.max(0, Math.ceil(G.CROPS[r.c].grow - (this.time - r.t) / DAY));
      const d = this.dayIdx(); if (r._dl && r._dl[0] === d) return r._dl[1];
      const Y = root.CAL.YEAR || 360; let v = 0; for (let n = 0; n < Y * 2; n++) { const t = root.CAL.term(d + n).k; if (d + n - r.t / DAY >= 100 && t >= 7 && t <= 14) { v = n; break; } } r._dl = [d, v]; return v;
    }
    plant(x, y, kind) {   // 下種：地力照下種時記住
      const f = this.fertOf(x, y); this.crops.set(U.key(x, y), { c: kind, t: U.r4(this.time), f, pk: 0, ms: 0 }); this.setFert(x, y, f, true); this.set(x, y, '苗'); return f;
    }
    endCrop(x, y, cost) {   // 這一格的穀沒了（收了、凍死、被吃、拔了）：地力減 cost，從現在起算休耕
      const k = U.key(x, y), r = this.crops.get(k), f = r ? r.f : this.fertOf(x, y);
      this.crops.delete(k); if (r) this.setFert(x, y, f - (cost || 0), false);
      return r;
    }
    cropTick() {   // 換日（或時間跳過去）時：長、凍、落、雀啄
      const d = this.dayIdx(); if (d === this.cropDay) return; const days = this.cropDay < 0 ? 1 : Math.max(1, d - this.cropDay); this.cropDay = d;
      const term = root.CAL.term(d).k, frost = term >= G.CROP_FROST[0] || term < G.CROP_FROST[1], ev = root.CAL.events(d);   // ev：節氣事件（v0.9.21：寒露二候到立春雀不啄、清明二候田鼠不偷）
      for (const [k, r] of [...this.crops]) {
        const [x, y] = U.unkey(k), ch = this.get(x, y), cd = DB[ch];
        if (!cd || !cd.crop) { this.crops.delete(k); continue; }
        if (r.shed) continue;
        const st = this.cropStage(r, term);
        if (st < 3 && frost && r.c !== '麥') { this.endCrop(x, y, 0); this.set(x, y, '田'); if (this.onCrop) this.onCrop('frost', x, y, r); continue; }
        if (st === 3) { if (r.rt === undefined) r.rt = U.r4(r.c === '麥' ? this.time : Math.min(this.time, r.t + G.CROPS[r.c].grow * DAY)); if (this.time - r.rt >= G.CROP_HOLD * DAY) { r.shed = 1; this.set(x, y, '穗'); if (this.onCrop) this.onCrop('shed', x, y, r); continue; } }
        if (st >= 2 && !ev.sparrow && !this.scared(x, y) && !(this.peckLive && this.peckLive(x, y))) for (let i = 0; i < days && (r.pk || 0) < PECK_MAX; i++) if (U.trueRand() < PECK_P) { r.pk = (r.pk || 0) + 1; if (this.onCrop) this.onCrop('peck', x, y, r); }
        if (st >= 2 && !ev.noMouse && !this.catNear(x, y)) for (let i = 0; i < days && (r.ms || 0) < MOUSE_MAX; i++) if (U.trueRand() < MOUSE_P) { r.ms = (r.ms || 0) + 1; if (this.onCrop) this.onCrop('mouse', x, y, r); }   // 田鼠（v0.9.19）
        const want = st === 1 ? '苗' : st === 2 ? '秀' : r.c; if (ch !== want) this.set(x, y, want);
      }
      if (this.locust && this.time >= this.locust.at) this.locustLand();
      else if (!this.locust && term >= LOCUST_TERMS[0] && term <= LOCUST_TERMS[1] && this.crops.size >= LOCUST_MIN) {
        const b = this.locustBoost();   // 田邊雀打得太兇，蝗多（v0.9.25）
        if (U.trueRand() < 1 - Math.pow(1 - LOCUST_P * b.k, Math.min(days, 30))) {
          const live = b.at.length ? b.at : [...this.crops].filter(([, r]) => !r.shed).map(([k]) => k);
          if (live.length) { const [x, y] = U.unkey(live[Math.floor(Math.random() * live.length)]); this.locust = { x, y, at: U.r4((d + 1) * DAY) }; if (b.over) this.locust.sp = b.over; if (this.onCrop) this.onCrop('locust', x, y, this.locust); }
        }
      }
    }
    // 打死一隻雀（v0.9.25）：記下地方與日子，一年後忘掉；回傳這一帶一年內打死了幾隻
    sparrowKill(x, y) { const d = this.dayIdx(); this.sparrowKills.push([x, y, d]); this.pruneSparrows(); return this.sparrowNear(x, y); }
    pruneSparrows() { const d = this.dayIdx(); this.sparrowKills = this.sparrowKills.filter(k => d - k[2] < SPARROW_KILL_DAYS).slice(-SPARROW_KEEP); }
    sparrowNear(x, y) { const d = this.dayIdx(); let n = 0; for (const k of this.sparrowKills) if (d - k[2] < SPARROW_KILL_DAYS && U.cheb(x, y, k[0], k[1]) <= SPARROW_KILL_R) n++; return n; }
    // 蝗多幾倍（v0.9.25）：看每一格還沒落穗的自種田四周打死了幾隻雀，取最多的；過了 SPARROW_FREE 隻才算，at 是那幾格（蝗群專落那一帶）
    locustBoost() {
      let most = 0, at = []; if (!this.sparrowKills.length) return { k: 1, over: 0, n: 0, at };
      for (const [k, r] of this.crops) { if (r.shed) continue; const [x, y] = U.unkey(k), n = this.sparrowNear(x, y); if (n > most) { most = n; at = [k]; } else if (n === most && n) at.push(k); }
      const over = Math.max(0, most - SPARROW_FREE); return { k: Math.min(SPARROW_LOCUST_MAX, 1 + SPARROW_LOCUST * over), over, n: most, at: over ? at : [] };
    }
    locustLand() {   // 蝗群落下（v0.9.19）：方圓八格自己種的田吃光，地上的燈火六格內的保得住（《詩·小雅·大田》秉畀炎火）
      const L = this.locust; this.locust = null; let eaten = 0, saved = 0;
      for (const [k, r] of [...this.crops]) {
        const [x, y] = U.unkey(k); if (r.shed || U.cheb(x, y, L.x, L.y) > LOCUST_R) continue;
        if (this.lightNear(x, y, LOCUST_FIRE)) { saved++; continue; }
        this.endCrop(x, y, 0); this.set(x, y, '田'); eaten++;
      }
      if (this.onCrop) this.onCrop('locustLand', L.x, L.y, { eaten, saved, sp: L.sp || 0 });
    }
    // 雀落在田上啄一口（v0.9.21）：人在附近時看得見、趕得走的雀害；人不在附近的田照換日算（peckLive 由遊戲端給：人二十四格內的田換日不另算）
    peckAt(x, y) {
      const r = this.crops.get(U.key(x, y)); if (!r || r.shed || (r.pk || 0) >= PECK_MAX || this.scared(x, y) || root.CAL.events(this.dayIdx()).sparrow) return false;
      const cd = DB[this.get(x, y)]; if (!cd || !(cd.crop >= 2 && cd.crop <= 3)) return false;
      r.pk = (r.pk || 0) + 1; if (this.onCrop) this.onCrop('peck', x, y, r); return true;
    }
    catNear(x, y) { for (const c of this.cats.values()) if (U.cheb(x, y, c.x, c.y) <= CAT_R) return true; return false; }   // 方圓十二格內有守田的狸（v0.9.19）
    cropNear(x, y, r) { if (!this.crops.size) return false; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (this.crops.has(U.key(x + dx, y + dy))) return true; return false; }   // 附近有自己種的田
    // 籬圍起來的一片（v0.9.18）：從這格順著獸走得過的格子漫延（籬、扉、磚門窗都擋），FENCE_ROOM 格以內圍得住、四面至少有一格籬或扉，就不生獸
    fenced(x, y) {
      if (!this.fences.size) return false;
      const k0 = U.key(x, y), hit = this.fenceCache.get(k0); if (hit !== undefined) return hit;
      let near = false; for (const k of this.fences) { const [fx, fy] = U.unkey(k); if (Math.abs(fx - x) <= 25 && Math.abs(fy - y) <= 25) { near = true; break; } }
      if (!near) return false;
      const open = (cx, cy) => { const d = this.info(cx, cy); return d.walk > 0 && !d.gate && d.kind !== 'water'; };
      if (!open(x, y)) { this.fenceCache.set(k0, false); return false; }
      const seen = new Set([k0]), q = [[x, y]]; let fence = false, over = false;
      for (let h = 0; h < q.length && !over; h++) { const [cx, cy] = q[h]; for (const [dx, dy] of N4) { const nx = cx + dx, ny = cy + dy, k = U.key(nx, ny); if (seen.has(k)) continue; if (open(nx, ny)) { seen.add(k); q.push([nx, ny]); if (seen.size > FENCE_ROOM) { over = true; break; } } else if (this.info(nx, ny).fence) fence = true; } }
      const v = !over && fence; for (const k of seen) this.fenceCache.set(k, v); return v;
    }
    raw(x, y) { const d = this.diff.get(U.key(x, y)); return d !== undefined ? d : this.base(x, y); }
    info(x, y) { return DB[this.get(x, y)]; }
    set(x, y, ch) {
      const k = U.key(x, y), old = this.get(x, y);
      if (this.roomCache.size) this.roomCache.clear();
      if (this.fenceCache.size) this.fenceCache.clear();
      if (this.houseCache.size) this.houseCache.clear();
      if (this.fogRoomCache.size) this.fogRoomCache.clear();
      this.ver = (this.ver || 0) + 1;   // 地上的字變了：畫面那邊的視線快取看這個數失效（v0.6.4）
      if (old !== ch) this.wallHp.delete(k);   // 換了字，舊的耐久就不算了
      if (ch !== '門' && this.plaques.size && this.plaques.has(k)) { const nm = this.plaques.get(k); this.plaques.delete(k); if (this.onPlaqueLost) this.onPlaqueLost(x, y, nm); }   // 門撞壞了、被風吹倒了，匾跟著掉了（v0.9.26；自己拆門時先把匾收回來）
      if (ch === this.base(x, y) && !this.wild.has(k)) this.diff.delete(k); else this.diff.set(k, ch);   // 野生苗田那格動過就記著（v0.9.18），免得收了又照節氣長回來
      if (this.crops.size && !(DB[ch] && DB[ch].crop) && this.crops.has(k)) this.crops.delete(k);
      if (DB[ch] && DB[ch].fence) this.fences.add(k); else if (this.fences.size) this.fences.delete(k);
      if (DB[ch].flam <= 0) this.burn.delete(k);
      if ((old === '灶' || old === '鼎') && ch !== '灶' && ch !== '鼎') this.stoves.delete(k);
      if ((old === '灶' || old === '鼎') && ch !== old) this.shelves.delete(k);   // 柴架跟著灶、鼎（v0.8.15）走（拆下時遊戲端先把它記到囊裡那個灶、鼎上）
      if ((ch === '灶' || ch === '鼎') && !this.stoves.has(k)) this.stoves.set(k, 0);
      if ((old === '包' || old === '囊') && ch !== old) this.bags.delete(k);   // 荷包、小囊（v0.8）拿走了，裡面的記錄也清掉
      if (old === '偶' && ch !== '偶') this.scarecrows.delete(k);
      if ('網罟罾'.indexOf(old) >= 0 && '網罟罾'.indexOf(ch) < 0 && this.netCells.has(k)) { const rec = this.nets.get(this.netCells.get(k)); if (rec) this.removeNet(rec); }
      if ((old === '櫃' || old === '甕') && ch !== old) this.chests.delete(k);
      if (old === '窯' && ch !== '窯') this.kilns.delete(k);
      if (old === '缸' && ch !== '缸') this.jars.delete(k);
      if (this.eaves.size && this.eaves.has(k) && ch !== '磚' && ch !== '甓') this.eaves.delete(k);   // 磚塌了、拆了，瓦也沒了（拆的時候遊戲端先退瓦）
      if (ch === '燈') this.lamps.add(k); else if (old === '燈') this.lamps.delete(k);
      if (old === '舟' && ch !== '舟' && this.shipCells.has(k)) { const ak = this.shipCells.get(k); this.shipCells.delete(k); this.removeShip(ak); }   // 船身一格被改掉，整艘沒了
      if (old === '漁' && ch !== '漁') this.weirs.delete(k);
      if (ch === '漁' && !this.weirs.has(k)) this.weirs.set(k, this.time + 45);
    }
    walkable(x, y) { return this.info(x, y).walk > 0; }
    isBurning(x, y) { return this.burn.has(U.key(x, y)); }
    stele(x, y) { return this.steles.get(U.key(x, y)) || null; }
    placeAt(x, y) { const e = this.placeTiles.get(U.key(x, y)); return e ? e.place : null; }
    isBig(x, y) { const e = this.placeTiles.get(U.key(x, y)); return !!(e && e.big); }
    nearChar(x, y, ch, r) {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (this.get(x + i, y + j) === ch) return true;
      return false;
    }
    // 幾秒後若格子還是 from，就變成 to（灰化土、草木長回來）
    schedule(x, y, from, to, sec) { this.timers.set(U.key(x, y), { from, to, at: this.time + sec }); }
    // 稻草人：守 SCARE_DAYS 天（v0.6.10 從三十天改四十五天），前半十格、後半七格；再放一個續 SCARE_DAYS 天，從現在起最多 SCARE_CAP 天
    addScarecrow(x, y) {
      const k = U.key(x, y), now = this.time, cur = Math.max(now, this.scarecrows.get(k) || 0);
      this.scarecrows.set(k, Math.min(now + SCARE_CAP * DAY, cur + SCARE_DAYS * DAY));
    }
    // 鐵礦長回來（v0.6.10）：鑿掉時記下，七到十日後那格若是石、草或白紙就變回鐵礦；是別的（蓋了東西、成了土或田……）就長不回來，記錄也丟掉
    addOre(x, y) { this.ores.set(U.key(x, y), U.r4(this.time + (ORE_DAYS[0] + U.trueRand() * (ORE_DAYS[1] - ORE_DAYS[0])) * DAY)); }
    regrowOres() {
      for (const [k, at] of this.ores) {
        if (this.time < at) continue;
        const [x, y] = U.unkey(k), ch = this.get(x, y);
        if (ORE_BACK.indexOf(ch) < 0) { this.ores.delete(k); continue; }
        if (this.oreBlocked(x, y)) continue;
        this.set(x, y, '鐵'); this.ores.delete(k);
      }
    }
    scareDays(x, y) { const e = this.scarecrows.get(U.key(x, y)); return e ? Math.max(0, (e - this.time) / DAY) : 0; }
    scared(x, y) {
      for (const [k, e] of this.scarecrows) {
        const days = (e - this.time) / DAY; if (days <= 0) continue;
        const [sx, sy] = U.unkey(k);
        if (U.cheb(x, y, sx, sy) <= (days > SCARE_DAYS / 2 ? 10 : 7)) return true;
      }
      return false;
    }
    // 漁網：小網三條九十息一條，中網八條三十息一條，大網二十條十息一條；魚是懶算的
    addNet(x, y, size, now, dur, rf) {   // dur／rf：收回再放的網帶著原本的耐久與加固次數
      const key = U.key(x, y), rec = { size, x, y, fish: 0, t: now, under: [], dur: dur === undefined ? NET_DUR[size] : dur, rf: rf || 0 }, ch = size === 1 ? '網' : size === 2 ? '罟' : '罾';
      this.nets.set(key, rec);
      for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { rec.under.push(this.raw(x + i, y + j)); this.netCells.set(U.key(x + i, y + j), key); this.set(x + i, y + j, ch); }   // 記住網下原本的水，收網時還原
      rec.tidal = rec.under.indexOf('灘') >= 0;   // 有一格是灘就算灘上的網：魚來得慢三成
      return rec;
    }
    netDur(size) { return NET_DUR[size]; }
    netAt(x, y) { const a = this.netCells.get(U.key(x, y)); return a ? this.nets.get(a) || null : null; }
    netRule(size, tidal) { const r = size === 1 ? { cap: 3, every: 90 } : size === 2 ? { cap: 8, every: 30 } : { cap: 20, every: 10 }; return tidal ? { cap: r.cap, every: Math.round(r.every / TIDE_WET) } : r; }   // 灘上 129／43／14 息一條
    netFish(rec, now) {
      if (rec.dur !== undefined && rec.dur <= 0) { rec.t = now; return rec.fish; }   // 破網不進魚，裡面剩的還拿得走
      const r = this.netRule(rec.size, rec.tidal), n = Math.floor((now - rec.t) / r.every);
      if (n > 0) { rec.fish = Math.min(r.cap, rec.fish + n); rec.t += n * r.every; }
      if (rec.fish >= r.cap) rec.t = now;
      return rec.fish;
    }
    removeNet(rec) {
      const key = U.key(rec.x, rec.y); this.nets.delete(key);
      for (let j = 0; j < rec.size; j++) for (let i = 0; i < rec.size; i++) {
        const cx = rec.x + i, cy = rec.y + j; this.netCells.delete(U.key(cx, cy));
        const u = rec.under && rec.under[j * rec.size + i], b = this.base(cx, cy);
        this.set(cx, cy, u && u !== '網' && u !== '罟' && u !== '罾' ? u : (DB[b] && DB[b].kind === 'water' ? b : '水'));
      }
    }
    // 灶
    stoveFuel(x, y) { return this.stoves.get(U.key(x, y)) || 0; }
    stoveLit(x, y) { const c = this.get(x, y); return (c === '灶' || c === '鼎') && this.stoveFuel(x, y) > 0; }
    addFuel(x, y, sec) { const k = U.key(x, y); this.stoves.set(k, Math.min(STOVE_CAP, (this.stoves.get(k) || 0) + sec)); }
    stoveRoom(x, y) { return STOVE_CAP - this.stoveFuel(x, y); }   // 還能添幾息
    // 窯（v0.9.21）：借旁邊（八方）有火的灶；沒有就回 null
    kilnFire(x, y) { for (const [dx, dy] of N8) { const nx = x + dx, ny = y + dy; if (this.get(nx, ny) === '灶' && this.stoveFuel(nx, ny) > 0) return { x: nx, y: ny }; } return null; }
    kilnStove(x, y) { for (const [dx, dy] of N8) if (this.get(x + dx, y + dy) === '灶') return { x: x + dx, y: y + dy }; return null; }
    eaveNear(x, y) { if (!this.eaves.size) return false; if (this.eaves.has(U.key(x, y))) return true; for (const [dx, dy] of N8) if (this.eaves.has(U.key(x + dx, y + dy))) return true; return false; }   // 簷下（v0.9.21）
    jarWater(x, y) { return Math.floor((this.jars.get(U.key(x, y)) || 0) + 1e-9); }
    shelf(x, y) { const k = U.key(x, y); if (!this.shelves.has(k)) this.shelves.set(k, []); return this.shelves.get(k); }

    // ---------- 探索：看過的格子才會畫到地圖上 ----------
    seenBits(cx, cy) { const k = U.key(cx, cy); let b = this.explored.get(k); if (!b) { b = new Uint8Array(32); this.explored.set(k, b); } return b; }
    isSeen(x, y) {
      const cx = Math.floor(x / CH), cy = Math.floor(y / CH), b = this.explored.get(U.key(cx, cy));
      if (!b) return false;
      const i = (y - cy * CH) * CH + (x - cx * CH);
      return (b[i >> 3] & (1 << (i & 7))) !== 0;
    }
    markSeen(px, py, r) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = px + dx, y = py + dy, cx = Math.floor(x / CH), cy = Math.floor(y / CH);
        const i = (y - cy * CH) * CH + (x - cx * CH), b = this.seenBits(cx, cy);
        b[i >> 3] |= (1 << (i & 7));
      }
      for (const pl of this.places) {
        if (pl.seen) continue;
        const cxp = pl.x + (pl.w - 1) / 2, cyp = pl.y + (pl.h - 1) / 2;
        if (Math.hypot(cxp - px, cyp - py) <= r + Math.max(pl.w, pl.h) / 2) { pl.seen = true; if (this.onDiscover) this.onDiscover(pl); }
      }
    }
    revealAll(px, py) { this.markSeen(px, py, G.HOME_R); }   // 塔上看得見整座本島（v0.7 島擴了，照 HOME_R）
    // 存檔瘦身（v0.9.3 使用者定）：走過的地圖原本每塊寫 64 個十六進位字（加上鍵名約 76 字），走得多的存檔光這一項就上百萬字。
    // 改寫成一串字：每塊先兩個字記位置——第一字 = EX_BASE + ((cx + EX_OFF) × 2 + 走滿了沒)，第二字 = EX_BASE + cy + EX_OFF；
    // 走滿的塊就這兩個字。沒走滿的，十六列一列一列記（每字裝 15 位，一塊記完補齊到整字）：
    //   00 這列沒看過、01 整列看過、10 一段連著的（起點 4 位、長度減一 4 位）、11 其他（16 位照抄）。
    // 字都落在 U+4E00–U+CDFF（從「一」起），不碰代理對、引號、反斜線，JSON 與 localStorage 原樣存取。舊存檔的 explored 照舊讀得進來
    packExplored() {
      let out = '', acc = 0, n = 0;
      const put = (v, bits) => { for (let j = 0; j < bits; j++) { if (v & (1 << j)) acc |= 1 << n; if (++n === 15) { out += String.fromCharCode(EX_BASE + acc); acc = 0; n = 0; } } };
      for (const [k, b] of this.explored) {
        let any = false, full = true; for (let i = 0; i < 32; i++) { if (b[i]) any = true; if (b[i] !== 255) full = false; }
        if (!any) continue;
        const [cx, cy] = U.unkey(k);
        out += String.fromCharCode(EX_BASE + (cx + EX_OFF) * 2 + (full ? 1 : 0), EX_BASE + cy + EX_OFF);
        if (full) continue;
        for (let r = 0; r < 16; r++) {
          const v = b[r * 2] | (b[r * 2 + 1] << 8);
          if (v === 0) { put(0, 2); continue; }
          if (v === 0xffff) { put(1, 2); continue; }
          let st = 0; while (!((v >> st) & 1)) st++;
          const run = v >> st;
          if ((run & (run + 1)) === 0) { put(2, 2); put(st, 4); put(31 - Math.clz32(run), 4); }   // 31 − clz32 = 長度減一
          else { put(3, 2); put(v, 16); }
        }
        if (n) { out += String.fromCharCode(EX_BASE + acc); acc = 0; n = 0; }
      }
      return out;
    }
    unpackExplored(str) {
      const m = new Map(); let i = 0, acc = 0, n = 0;
      const get = (bits) => { let v = 0; for (let j = 0; j < bits; j++) { if (!n) { acc = str.charCodeAt(i++) - EX_BASE; n = 15; } if (acc & 1) v |= 1 << j; acc >>= 1; n--; } return v; };
      while (i + 1 < str.length) {
        const a = str.charCodeAt(i) - EX_BASE, cy = str.charCodeAt(i + 1) - EX_BASE - EX_OFF, full = a & 1, cx = (a >> 1) - EX_OFF; i += 2;
        const b = new Uint8Array(32);
        if (full) b.fill(255);
        else {
          n = 0;
          for (let r = 0; r < 16; r++) {
            const tag = get(2); let v = 0;
            if (tag === 1) v = 0xffff;
            else if (tag === 2) { const st = get(4), len = get(4) + 1; v = ((1 << len) - 1) << st; }
            else if (tag === 3) v = get(16);
            b[r * 2] = v & 255; b[r * 2 + 1] = (v >> 8) & 255;
          }
          n = 0;   // 一塊記完補齊到整字，下一塊從新的一字起
        }
        m.set(U.key(cx, cy), b);
      }
      return m;
    }
    seenCount() { let n = 0; for (const b of this.explored.values()) for (const v of b) { let x = v; while (x) { n += x & 1; x >>= 1; } } return n; }
    // 走的人多了，也便成了路
    trample(x, y) {
      const k = U.key(x, y), n = (this.steps.get(k) || 0) + 1;
      this.steps.set(k, n);
      if (n >= 6 && '草土沙花礫'.indexOf(this.raw(x, y)) >= 0 && !this.placeTiles.has(k)) this.set(x, y, '路');
    }

    // 點火：可燃格開始燃燒；火字本身也有壽命
    ignite(x, y, lvl) {
      const k = U.key(x, y), d = this.info(x, y);
      if (this.burn.has(k)) return false;
      if (d.kind === 'fire') { this.burn.set(k, { t: d.s * 2.2, lvl: d.s / 4 }); return true; }
      if (d.flam <= 0) return false;
      this.burn.set(k, { t: 5 + d.s * 0.45, lvl: lvl || 1 });
      return true;
    }
    extinguish(x, y) { this.burn.delete(U.key(x, y)); }

    // 兩格之間看不看得見（v0.6）：中間的格子（不算兩端）有擋光的字——磚、門、墟——就看不見；窗不擋
    clear(x0, y0, x1, y1) {
      let x = x0, y = y0; const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      while (true) {
        if (x === x1 && y === y1) return true;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x += sx; }
        if (e2 <= dx) { err += dx; y += sy; }
        if (x === x1 && y === y1) return true;
        const d = this.info(x, y); if (d && d.opaque) return false;
      }
    }
    // 某格附近是否有光（虎怕光）/ 有熱（人怕冷）；磚擋光：屋裡的燈照不出去（v0.6）
    lightNear(x, y, r) {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        const d = this.info(x + i, y + j);
        if ((d.light > 0 || this.isBurning(x + i, y + j) || this.stoveLit(x + i, y + j)) && this.clear(x + i, y + j, x, y)) return true;
      }
      return false;
    }
    // ---------- 霧障 ----------
    fogAt(x, y) { const id = this.fogCells.get(U.key(x, y)); return id ? this.fogs.get(id) : null; }
    fogLand(x, y) { const d = this.info(x, y); return d.walk > 0 && d.kind !== 'water' && DB[this.raw(x, y)].kind !== 'water'; }
    fogSea(x, y) { return DB[this.get(x, y)].kind === 'water' && DB[this.raw(x, y)].kind === 'water'; }
    // 這格在不在「圍起來、裡面能走的格子不超過 FOG_ROOM 格」的屋子裡（門算磚；四面要有人造的磚門窗墟，v0.6.7）；同一次漫延碰到的格子一起記下
    fogRoom(x, y) {
      const k0 = U.key(x, y), hit = this.fogRoomCache.get(k0); if (hit !== undefined) return hit;
      if (!this.passable(x, y)) { this.fogRoomCache.set(k0, false); return false; }
      const seen = new Set([k0]), q = [[x, y]]; let open = false, built = false;
      while (q.length) {
        if (seen.size > FOG_ROOM) { open = true; break; }
        const [cx, cy] = q.shift();
        for (const [dx, dy] of N4) {
          const nx = cx + dx, ny = cy + dy, k = U.key(nx, ny); if (seen.has(k)) continue;
          if (this.passable(nx, ny)) { seen.add(k); q.push([nx, ny]); } else if (DB[this.get(nx, ny)].kind === 'object') built = true;   // 四面有人造的磚、門、窗、墟才算屋子
        }
      }
      const room = !open && built;   // 山、水自己圍起來的小角落不算屋子，霧照樣飄進去（v0.6.7）
      for (const k of seen) this.fogRoomCache.set(k, room);
      return room;
    }
    static newFogShape(area) {   // 隨機一個霧的形：面積 area 格
      const R = U.trueRand, h = [];
      for (let i = 0, m = 2 + Math.floor(R() * 2); i < m; i++) h.push([2 + Math.floor(R() * 4), 0.04 + R() * 0.1, R() * 6.28, (R() - 0.5) * 0.08]);
      return { area, n: 2 + R() * 4, nA: 0.4 + R() * 0.8, nW: 0.004 + R() * 0.01, nP: R() * 6.28, q: 0.7 + R() * 0.6, qA: 0.1 + R() * 0.15, qW: 0.003 + R() * 0.008, qP: R() * 6.28, rot: R() * 6.28, rotW: (R() - 0.5) * 0.01, h };
    }
    // 霧在 (cx, cy)、霧齡 t 時的樣子：回傳「點 (dx, dy) 在不在霧裡」的判斷，與外框半徑
    fogForm(f, t, mul) {
      const sh = f.shape, n = U.clamp(sh.n + sh.nA * Math.sin(t * sh.nW + sh.nP), 2, 6), q = sh.q * (1 + sh.qA * Math.sin(t * sh.qW + sh.qP)), rot = sh.rot + t * sh.rotW;
      const sc = Math.sqrt(sh.area * (mul || 1) / SUPER_K(n)), a = sc * Math.sqrt(q), b = sc / Math.sqrt(q), c = Math.cos(rot), sn = Math.sin(rot);
      const hs = sh.h.map(([k, amp, ph, w]) => [k, amp, ph + w * t]);
      const edge = (cu, sv, ph) => {   // 方向 (cu, sv)（在形自己的座標裡）上的外框半徑
        let R = Math.pow(Math.pow(Math.abs(cu) / a, n) + Math.pow(Math.abs(sv) / b, n), -1 / n);
        if (hs.length) { let m = 1; for (const [k, amp, p0] of hs) m += amp * Math.sin(k * ph + p0); R *= m; }
        return R;
      };
      const inside = (dx, dy) => {
        const u = dx * c + dy * sn, v = -dx * sn + dy * c, r = Math.sqrt(u * u + v * v); if (r < 1e-6) return true;
        return r <= edge(u / r, v / r, hs.length ? Math.atan2(v, u) : 0);
      };
      let rmin = Infinity, rmax = 0;   // 外框最近、最遠的半徑（取 72 個方向，留一點餘裕）
      for (let i = 0; i < 72; i++) { const ph = i / 72 * Math.PI * 2, R = edge(Math.cos(ph), Math.sin(ph), ph); if (R < rmin) rmin = R; if (R > rmax) rmax = R; }
      return { inside, reach: rmax * 1.04, rmin: rmin * 0.96 };
    }
    // 霧蓋到哪些格、各蓋幾成（每格 5×5 個點），也記蓋到的那部分的中心（畫霧用）；只算這片霧能待的格子（不在四十五格以內的屋子裡、不是別的霧的格）。
    // 回傳的陣列另帶 area（能待的格子共蓋了幾格）、lost（被擋掉幾格）與被擋掉那一塊的中心 lx、ly
    fogCoverage(f, cx, cy, t, mul) {
      cx = cx === undefined ? f.x : cx; cy = cy === undefined ? f.y : cy; t = t === undefined ? f.age : t;
      const { inside, reach, rmin } = this.fogForm(f, t, mul), S = FOG_SAMPLE, out = [], R = Math.ceil(reach) + 1, reach2 = reach * reach, rmin2 = rmin * rmin;
      const ok = (x, y) => !this.fogRoom(x, y);
      let area = 0, lost = 0, lx = 0, ly = 0;
      for (let y = Math.floor(cy) - R; y <= Math.floor(cy) + R; y++) for (let x = Math.floor(cx) - R; x <= Math.floor(cx) + R; x++) {
        const nx = U.clamp(cx, x, x + 1) - cx, ny = U.clamp(cy, y, y + 1) - cy;          // 格子離中心最近的一點
        if (nx * nx + ny * ny > reach2) continue;                                         // 整格在外框外
        const fx = Math.max(Math.abs(x - cx), Math.abs(x + 1 - cx)), fy = Math.max(Math.abs(y - cy), Math.abs(y + 1 - cy));
        let n = 0, mx = 0, my = 0;
        if (fx * fx + fy * fy < rmin2) { n = S * S; mx = (x + 0.5) * n; my = (y + 0.5) * n; }   // 整格在裡面
        else for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const sx = x + (i + 0.5) / S, sy = y + (j + 0.5) / S; if (inside(sx - cx, sy - cy)) { n++; mx += sx; my += sy; } }
        if (!n) continue;
        const k = U.key(x, y), other = this.fogCells.get(k), c = n / (S * S);
        if ((other && other !== f.id) || !ok(x, y)) { lost += c; lx += (x + 0.5) * c; ly += (y + 0.5) * c; continue; }
        area += c; out.push({ x, y, k, c, mx: mx / n, my: my / n });
      }
      out.area = area; out.lost = lost; out.lx = lost ? lx / lost : cx; out.ly = lost ? ly / lost : cy;
      return out;
    }
    // 照形算格子；有一塊被屋子（或別的霧）擋掉，就把形撐大，讓能待的那部分面積仍是原本的：撐的倍數用二分法找（面積隨倍數遞增），最多 FOG_GROW_MAX 倍
    fogCover(f, cx, cy, t) {
      const want = f.shape.area, at = (m) => this.fogCoverage(f, cx, cy, t, m);
      let m0 = U.clamp(f.mul || 1, 1, FOG_GROW_MAX), cov = at(m0);
      if (Math.abs(cov.area - want) < 0.4 || (m0 <= 1 && cov.area >= want - 0.4)) { cov.mul = m0; return cov; }
      let lo, hi, cl = null, ch = null;
      if (cov.area < want) { lo = m0; cl = cov; hi = m0; while (hi < FOG_GROW_MAX) { hi = Math.min(FOG_GROW_MAX, hi * 2); ch = at(hi); if (ch.area >= want) break; lo = hi; cl = ch; } if (ch && ch.area < want) { ch.mul = hi; return ch; } }
      else { hi = m0; ch = cov; lo = m0; while (lo > 1) { lo = Math.max(1, lo / 2); cl = at(lo); if (cl.area <= want) break; hi = lo; ch = cl; } if (cl && cl.area > want) { cl.mul = lo; return cl; } }
      for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2, cm = at(mid); if (cm.area < want) { lo = mid; cl = cm; } else { hi = mid; ch = cm; } if (Math.abs(cm.area - want) < 0.4) { cm.mul = mid; return cm; } }
      const best = ch || cl; best.mul = ch ? hi : lo; return best;
    }
    fogCount(cov) { return cov.filter(e => e.c > FOG_COVER).sort((a, b) => b.c - a.c).slice(0, FOG_CAP); }   // 算作霧的格子：蓋過 5%、最多三十格
    setFogCells(f, cells) {
      for (const k of f.cells) if (this.fogCells.get(k) === f.id) this.fogCells.delete(k);
      f.cells = new Set(cells); for (const k of f.cells) this.fogCells.set(k, f.id);
    }
    // 起一片霧：給了形（shape）就照形算格子；只給格子（舊存檔、測試）就照那些格子，另配一個面積相當、中心在那裡的形，等它動了才照形重算
    addFog(cells, until, sea, shape, at) {
      const id = ++this.fogSeq, f = { id, cells: new Set(), until, sea: !!sea, moveAt: this.time + this.fogStep, dir: null, age: 0, ang: U.trueRand() * Math.PI * 2 };
      const list = [...(cells || [])];
      if (at) { f.x = at[0]; f.y = at[1]; } else if (list.length) { let sx = 0, sy = 0; for (const k of list) { const [x, y] = U.unkey(k); sx += x; sy += y; } f.x = sx / list.length + 0.5; f.y = sy / list.length + 0.5; } else { f.x = 0.5; f.y = 0.5; }
      f.shape = shape || World.newFogShape(Math.max(1, list.length));
      if (at && at[2] !== undefined) { f.age = at[2]; if (at[3] !== undefined) f.ang = at[3]; }
      this.fogs.set(id, f);
      if (list.length) this.setFogCells(f, list); else { const cov = this.fogCover(f); f.mul = cov.mul; this.setFogCells(f, this.fogCount(cov).map(e => e.k)); }
      f.base = f.cells.size; f.gx = f.x; f.gy = f.y;
      return f;
    }
    removeFog(id) { const f = this.fogs.get(id); if (!f) return; for (const k of f.cells) if (this.fogCells.get(k) === id) this.fogCells.delete(k); this.fogs.delete(id); }
    // 在玩家附近的陸地上起一片霧：找一處陸地當中心，配一個隨機的形；蓋得到的地太少（小島、棧上、屋邊）或壓到玩家身邊就換個地方（最多八次）
    spawnFog(px, py) {
      for (let attempt = 0; attempt < 8; attempt++) { const f = this.growFog(px, py); if (f) return f; }
      this.fogMiss = (this.fogMiss || 0) + 1;   // 都起不來：記一筆，測試與除錯用
      return null;
    }
    growFog(px, py) {
      const R = U.trueRand;
      let at = null;
      for (let i = 0; i < 80 && !at; i++) {
        const a = R() * Math.PI * 2, r = FOG_NEAR[0] + R() * (FOG_NEAR[1] - FOG_NEAR[0]);
        const x = px + Math.round(Math.cos(a) * r), y = py + Math.round(Math.sin(a) * r);
        if (this.fogLand(x, y) && !this.fogCells.has(U.key(x, y))) at = [x + 0.5, y + 0.5];
      }
      if (!at) { this.fogNoSeed = (this.fogNoSeed || 0) + 1; return null; }
      const shape = World.newFogShape(FOG_AREA[0] + R() * (FOG_AREA[1] - FOG_AREA[0]));
      const probe = { id: -1, shape, sea: false, age: 0 }, cells = this.fogCount(this.fogCover(probe, at[0], at[1], 0));
      if (cells.length < 10 || cells.some(e => Math.abs(e.x - px) <= 1 && Math.abs(e.y - py) <= 1)) return null;
      const f = this.addFog(null, this.time + FOG_LIFE, false, shape, at);
      if (this.onFog) this.onFog(f);
      return f;
    }
    // 蜃吐霧：在蜃與玩家之間的海面上起一片海霧（只蓋水，不蓋船、網、陸地）
    spawnSeaFog(mx, my, px, py) {
      const R = U.trueRand, dx = Math.sign(px - mx), dy = Math.sign(py - my);
      for (let i = 0; i < 30; i++) {
        const t = 2 + Math.floor(R() * 4), x = mx + dx * t + Math.round((R() - 0.5) * 4), y = my + dy * t + Math.round((R() - 0.5) * 4);
        if (!this.fogSea(x, y) || this.fogCells.has(U.key(x, y))) continue;
        const shape = World.newFogShape(SEA_FOG_AREA[0] + R() * (SEA_FOG_AREA[1] - SEA_FOG_AREA[0]));
        const probe = { id: -1, shape, sea: true, age: 0 }, cells = this.fogCount(this.fogCover(probe, x + 0.5, y + 0.5, 0));
        if (cells.length < 3 || cells.some(e => e.x === px && e.y === py)) continue;
        return this.addFog(null, this.time + SEA_FOG_LIFE, true, shape, [x + 0.5, y + 0.5]);
      }
      return null;
    }
    // ---------- 船 ----------
    shipAt(x, y) { const ak = this.shipCells.get(U.key(x, y)); return ak ? this.ships.get(ak) || null : null; }
    // v0.8.17 船身是一塊長方形：(ax, ay) 是左上角，dir 'v' 南北長、'h' 東西長；第一格是左上角
    shipFootprint(kind, ax, ay, dir) { const [W, H] = World.shipDims(kind, dir), out = []; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) out.push([ax + i, ay + j]); return out; }
    shipFits(kind, ax, ay, ok, dir) { return this.shipFootprint(kind, ax, ay, dir).every(([x, y]) => ok(x, y)); }
    addShip(ax, ay, rec) {              // 把船停在左上角 (ax, ay)：船身每格寫成「舟」
      rec.dir = World.shipDir(rec);
      const cells = this.shipFootprint(rec.kind, ax, ay, rec.dir), ak = U.key(ax, ay);
      rec.cells = cells; this.ships.set(ak, rec);
      for (const [x, y] of cells) { this.shipCells.set(U.key(x, y), ak); this.set(x, y, '舟'); }
      return rec;
    }
    removeShip(ak) {                    // 船開走或毀了：船身還原成底下的水
      const rec = this.ships.get(ak); if (!rec) return null;
      this.ships.delete(ak);
      for (const [x, y] of rec.cells) { const k = U.key(x, y); if (this.shipCells.get(k) === ak) { this.shipCells.delete(k); const b = this.base(x, y); if (this.get(x, y) === '舟') this.set(x, y, (DB[b] && DB[b].kind === 'water') || b === '灘' ? b : '水'); } }   // 停在沙洲上的船開走了：還原成灘，不變成水（v0.8.18）
      return rec;
    }
    shipCenter(rec) { let sx = 0, sy = 0; for (const [x, y] of rec.cells) { sx += x; sy += y; } return { x: sx / rec.cells.length + 0.5, y: sy / rec.cells.length + 0.5 }; }
    fogCenter(f) { let sx = 0, sy = 0; for (const k of f.cells) { const [x, y] = U.unkey(k); sx += x; sy += y; } return { x: sx / f.cells.size, y: sy / f.cells.size }; }
    // 最近的光：地上的燈、火場、旺灶，r 格內找最近的一處
    nearestLight(x, y, r) {
      let best = null;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        const d = this.info(x + i, y + j);
        if (!(d.light > 0 || this.isBurning(x + i, y + j) || this.stoveLit(x + i, y + j))) continue;
        const dist = Math.hypot(i, j); if (!best || dist < best.d) best = { x: x + i, y: y + j, d: dist };
      }
      return best;
    }
    // 霧障挪一格：FOG_LIGHT_R 格內有光就往反方向躲（燈火、旺灶、手裡有光的玩家，取最近的）；沒光就順著自己的風向飄。
    // 定方向（v0.4.13 起的規則照舊）：FOG_LIGHT_R 格內有光就背著光走（略帶偏）；沒光就順著自己的風向，風向慢慢轉、偶爾大轉
    steerFog(f, px, py) {
      const R = U.trueRand, c = { x: f.x - 0.5, y: f.y - 0.5 };
      let src = this.nearestLight(Math.round(c.x), Math.round(c.y), FOG_LIGHT_R);
      if (this.playerLit()) { const d = Math.hypot(px - c.x, py - c.y); if (d <= FOG_LIGHT_R && (!src || d < src.d)) src = { x: px, y: py, d }; }
      if (src) f.ang = Math.atan2(c.y - src.y, c.x - src.x) + (R() - 0.5) * 0.5;
      else if (typeof f.ang !== 'number') f.ang = R() * Math.PI * 2;
      else f.ang += (R() - 0.5) * (R() < 0.15 ? 2.4 : 0.7);
      return !!src;
    }
    // 把霧挪到 (x, y)、霧齡 t，重算算作霧的格子。山、海都飄得過去，不回頭（v0.6.5）；碰到四十五格以內的屋子，形撐開繞過去、方向拐開；
    // 飄到紙邊（方框 G.WORLD_R − FOG_EDGE 外；v0.7 前是離島心 113 格）就轉回島心那邊，免得飄出紙外
    placeFog(f, x, y, t) {
      const cov = this.fogCover(f, x, y, t), cells = this.fogCount(cov);
      const dx = x - f.gx, dy = y - f.gy; if (Math.abs(dx) + Math.abs(dy) > 1e-6) f.dir = [Math.sign(Math.round(dx * 10)), Math.sign(Math.round(dy * 10))];
      f.x = x; f.y = y; f.age = t; f.gx = x; f.gy = y; f.mul = cov.mul; this.setFogCells(f, cells.map(e => e.k));
      if (cov.lost > 0.3 && this.time >= (f.turnAt || 0)) {   // 碰上屋子：往屋子去的就拐成繞著走（偏外一點），四息內不再拐
        const oa = Math.atan2(cov.ly - y, cov.lx - x), d = Math.atan2(Math.sin(f.ang - oa), Math.cos(f.ang - oa));
        if (Math.abs(d) < Math.PI / 2) { f.ang = oa + (d >= 0 ? 1 : -1) * (Math.PI / 2 + 0.35); f.turnAt = this.time + 4; f.turned = (f.turned || 0) + 1; }
      }
      if (Math.max(Math.abs(x), Math.abs(y)) > G.WORLD_R - FOG_EDGE) { const home = Math.atan2(-y, -x), d = Math.atan2(Math.sin(f.ang - home), Math.cos(f.ang - home)); if (Math.abs(d) > Math.PI / 2) f.ang = home + (U.trueRand() - 0.5) * 0.8; }   // v0.7：紙的方框邊
      return true;
    }
    // 測試與舊介面：定方向後一口氣挪一格的距離
    moveFog(f, px, py) {
      this.steerFog(f, px, py);
      return this.placeFog(f, f.gx + Math.cos(f.ang), f.gy + Math.sin(f.ang), f.age);
    }
    // ---------- 天氣：雨、雪、雷雨、狂風、和風（v0.9.15） ----------
    // 全紙的天氣（一場雨雪雷雨起訖、狂風跟著它）：raining()／snowing()／thundering()／precip()；
    // 某一格實際怎樣看 wxAt(x, y)（v0.9.17）：大漠火山是乾地，雨雪不下，雷雨成乾雷（只打雷）
    raining() { return this.time < this.rainUntil && this.wx !== 'snow'; }   // 雨與雷雨：澆燈、雨聲、雨絲（雪不澆燈）
    snowing() { return this.time < this.rainUntil && this.wx === 'snow'; }
    thundering() { return this.time < this.rainUntil && this.wx === 'thunder'; }
    hailing() { return !!this.hail && this.time < this.hail.until && this.precip(); }   // 冰雹（v0.9.19）
    hailAt(x, y) { return this.hailing() && !this.dryAt(x, y); }
    startHail() {   // 冰雹一起頭就砸一回：屋外的田、燈、稻草人
      this.hail = { until: U.r4(this.time + HAIL_LEN * DAY) }; let crops = 0, lamps = 0, scares = 0;
      const out = (x, y) => !this.covered(x, y) && !this.dryAt(x, y) && !this.eaveNear(x, y);   // 瓦簷下砸不著（v0.9.21）
      for (const [k, r] of [...this.crops]) { const [x, y] = U.unkey(k), cd = DB[this.get(x, y)]; if (r.shed || !cd || !cd.crop || !out(x, y) || U.trueRand() >= HAIL_CROP) continue; if (cd.crop >= 3) { r.shed = 1; this.set(x, y, '穗'); } else { this.endCrop(x, y, 0); this.set(x, y, '田'); } crops++; }
      for (const k of [...this.lamps]) { const [x, y] = U.unkey(k); if (this.get(x, y) !== '燈' || !out(x, y) || U.trueRand() >= HAIL_LAMP) continue; this.set(x, y, '白'); lamps++; if (this.onLampRuined) this.onLampRuined(x, y); }
      for (const k of [...this.scarecrows.keys()]) { const [x, y] = U.unkey(k); if (this.get(x, y) !== '偶' || !out(x, y) || U.trueRand() >= HAIL_SCARE) continue; this.set(x, y, this.info(x, y).to || '白'); this.scarecrows.delete(k); scares++; }
      if (this.onHail) this.onHail({ crops, lamps, scares });
    }
    precip() { return this.time < this.rainUntil; }   // 雨雷雪
    // 深海（v0.9.18 使用者定）：「淼」，而且離陸地與沙洲（灘）至少 DEEP_R 格（照原本的地看，算圓）；算過的格子記著
    deepSea(x, y) {
      const k = U.key(x, y); let v = this.deepCache.get(k); if (v !== undefined) return v;
      if (this.deepCache.size > 40000) this.deepCache.clear();
      v = this.base(x, y) === '淼';
      for (let dy = -DEEP_R; dy <= DEEP_R && v; dy++) { const w = Math.floor(Math.sqrt(DEEP_R * DEEP_R - dy * dy)); for (let dx = -w; dx <= w; dx++) { const d = DB[this.base(x + dx, y + dy)]; if (!d || d.kind !== 'water') { v = false; break; } } }
      this.deepCache.set(k, v); return v;
    }
    dryAt(x, y) { const k = U.key(x, y); let v = this.dryCache.get(k); if (v === undefined) { if (this.dryCache.size > 20000) this.dryCache.clear(); v = G.dryAt(x, y, this.seed); this.dryCache.set(k, v); } return v; }
    wxAt(x, y) { if (!this.precip()) return ''; if (!this.dryAt(x, y)) return this.wx; return this.wx === 'thunder' ? 'dry' : ''; }   // '' 晴（或乾地上別處在下）、'rain'、'snow'、'thunder'、'dry' 乾雷
    galeOn() { return !!this.gale && this.precip() && this.time < this.gale.until; }
    breezeOn() { return !this.precip() && this.breezeDay === Math.floor(this.time / DAY); }
    galeDir() { return this.gale ? DIR8[this.gale.dir] : null; }   // [dx, dy, 往哪] ；風名是 DIR8[(dir + 4) % 8][2] + '風'
    galeName() { return this.gale ? DIR8[(this.gale.dir + 4) % 8][2] + '風' : ''; }
    newGale() { return { until: U.r4(this.time + (0.25 + U.trueRand() * (GALE_MAX - 0.25)) * DAY), dir: Math.floor(U.trueRand() * 8), day: Math.floor(this.time / DAY) }; }
    // 屋有其用（v0.9.26）：這格所在、自己蓋的三十八格以內的屋子——能走的格子（cells）、貼著牆內的擺設（has：字 -> 幾個）、門（doors）、認成什麼（kind：居、丹房、倉或空）；不在這樣的屋裡回 null
    houseRoom(x, y) {
      if (this.roomInfoVer !== this.ver) { this.roomInfo = new Map(); this.roomInfoVer = this.ver; }
      const k0 = U.key(x, y), hit = this.roomInfo.get(k0); if (hit !== undefined) return hit;
      if (!this.passable(x, y) || this.info(x, y).kind === 'water') { this.roomInfo.set(k0, null); return null; }
      const seen = new Set([k0]), q = [[x, y]], has = {}, doors = new Set(), touched = new Set(); let made = false, over = false;
      for (let h = 0; h < q.length; h++) {
        if (seen.size > HOUSE_MAX) { over = true; break; }
        const [cx, cy] = q[h];
        for (const [dx, dy] of N4) {
          const nx = cx + dx, ny = cy + dy, k = U.key(nx, ny); if (seen.has(k)) continue;
          if (this.passable(nx, ny)) { seen.add(k); q.push([nx, ny]); continue; }
          if (touched.has(k)) continue; touched.add(k);
          const ch = this.get(nx, ny); if ('磚甓門窗墟'.indexOf(ch) >= 0) made = true; if (ch === '門') doors.add(k);
          if (ROOM_FURN.indexOf(ch) >= 0) has[ch] = (has[ch] || 0) + 1;
        }
      }
      const r = !over && made ? { kind: roomKind(has), has, doors: [...doors], cells: [...seen], id: [...seen].sort()[0], decor: [...DECOR].filter(c => has[c]).length } : null;
      if (over) this.roomInfo.set(k0, null); else for (const k of seen) this.roomInfo.set(k, r);
      return r;
    }
    roomBy(x, y, kind) {   // 擺設（不能走的那格）貼著的屋子：上下左右哪一格在認得出的屋裡；給 kind 就只要那一種
      for (const [dx, dy] of N4) { const r = this.houseRoom(x + dx, y + dy); if (r && (!kind || r.kind === kind)) return r; }
      return null;
    }
    roomPlaque(r) { if (!r) return ''; for (const k of r.doors) if (this.plaques.has(k)) return this.plaques.get(k); return ''; }   // 屋子的匾（掛在哪一扇門上都算）
    // 三十八格以內的屋子（v0.9.15）：地標屋舍，或從這格順著能走的格子漫延、HOUSE_MAX 格以內圍得住、四面有人造的磚門窗墟；洞窟裡也算有頂
    smallHouse(x, y) {
      const d = this.info(x, y); if (d.shelter || d.cave) return true;
      if (!this.passable(x, y) || d.kind === 'water') return false;
      const k0 = U.key(x, y), hit = this.houseCache.get(k0); if (hit !== undefined) return hit;
      const seen = new Set([k0]), q = [[x, y]]; let made = false, over = false;
      while (q.length) {
        if (seen.size > HOUSE_MAX) { over = true; break; }
        const [cx, cy] = q.shift();
        for (const [dx, dy] of N4) { const nx = cx + dx, ny = cy + dy, k = U.key(nx, ny); if (seen.has(k)) continue; if (this.passable(nx, ny)) { seen.add(k); q.push([nx, ny]); } else if ('磚甓門窗墟'.indexOf(this.get(nx, ny)) >= 0) made = true; }
      }
      const r = !over && made;
      if (over) this.houseCache.set(k0, false); else for (const k of seen) this.houseCache.set(k, r);
      return r;
    }
    galeTick(px, py) {   // 狂風每一步（半息）：換日轉向；墟、稻草人照每息的機會吹倒、吹走
      const today = Math.floor(this.time / DAY), g = this.gale;
      if (g.day !== today) { g.day = today; g.dir = Math.floor(U.trueRand() * 8); if (this.onGale) this.onGale('turn'); }
      const pr = 1 - Math.pow(1 - this.galeRuinP, STEP), ps = 1 - Math.pow(1 - this.galeScareP, STEP);
      const R = this.galeRuins;
      if (!R || Math.max(Math.abs(px - R.x), Math.abs(py - R.y)) > 10 || this.time - R.t > 30) {
        const list = []; for (let y = py - GALE_RUIN_R; y <= py + GALE_RUIN_R; y++) for (let x = px - GALE_RUIN_R; x <= px + GALE_RUIN_R; x++) if (this.get(x, y) === '墟') list.push([x, y]);
        this.galeRuins = { x: px, y: py, t: this.time, list };
      }
      const gone = (x, y) => this.set(x, y, this.info(x, y).to || '白');   // 吹倒、吹走：跟拆掉一樣寫回底下的字
      for (const [x, y] of this.galeRuins.list) if (this.get(x, y) === '墟' && U.trueRand() < pr) { gone(x, y); if (this.onGale) this.onGale('ruin', x, y); }
      for (const k of [...this.scarecrows.keys()]) { const [x, y] = U.unkey(k); if (this.get(x, y) === '偶' && U.trueRand() < ps) { gone(x, y); this.scarecrows.delete(k); if (this.onGale) this.onGale('scare', x, y); } }
    }
    passable(x, y) { const d = this.info(x, y); return (d.walk > 0 && !d.gate) || !!d.fence; }   // 門雖能走，算磚；籬與扉（v0.9.18）不算屋子的四面
    // 屋裡：從這格四鄰出發順著能走的格子漫延，不可通行的字與門擋住；ROOM_LIMIT 格內圍得住才算屋裡
    covered(x, y) {
      const seen = new Set(), q = [];
      const push = (nx, ny) => { const k = U.key(nx, ny); if (!seen.has(k) && this.passable(nx, ny)) { seen.add(k); q.push([nx, ny]); } };
      for (const [dx, dy] of N4) push(x + dx, y + dy);
      while (q.length) {
        if (seen.size > ROOM_LIMIT) return false;
        const [cx, cy] = q.shift();
        for (const [dx, dy] of N4) push(cx + dx, cy + dy);
      }
      return true;
    }
    // 牆挨野牛撞一下：回傳 'broken'（塌了）、'ruined'（磚成了墟）、'cracked'（窗門剩一半，字變色）或 'hit'
    hitWall(x, y) {
      const ch = this.get(x, y), full = WALL_HP[ch]; if (!full) return null;
      const k = U.key(x, y), hp = (this.wallHp.has(k) ? this.wallHp.get(k) : full) - 1;
      if (hp <= 0) return 'broken';
      if ((ch === '磚' || ch === '甓') && hp <= full / 2) { this.set(x, y, '墟'); this.wallHp.set(k, hp); return 'ruined'; }
      this.wallHp.set(k, hp); return hp <= full / 2 && (ch === '窗' || ch === '門') ? 'cracked' : 'hit';
    }
    wallHurt(x, y) { const k = U.key(x, y), full = WALL_HP[this.get(x, y)]; return !!full && this.wallHp.has(k) && this.wallHp.get(k) <= full / 2; }   // 窗門剩一半：畫成另一個顏色
    // 圍住這格的屋子的四面（v0.6，算窗佔幾成）：從這格順著能走的格子漫延，碰到的不能走的格子就是四面，"x,y" -> 字；ROOM_LIMIT 格內圍不住回 null
    roomShell(x, y) {
      const seen = new Set([U.key(x, y)]), q = [[x, y]], shell = new Map();
      while (q.length) {
        if (seen.size > ROOM_LIMIT) return null;
        const [cx, cy] = q.shift();
        for (const [dx, dy] of N4) { const nx = cx + dx, ny = cy + dy, k = U.key(nx, ny); if (seen.has(k) || shell.has(k)) continue; if (this.passable(nx, ny)) { seen.add(k); q.push([nx, ny]); } else shell.set(k, this.get(nx, ny)); }
      }
      shell.area = seen.size;   // 屋內面積（能走的格數，含人站的那格）
      return shell;
    }
    // 小屋：從這格順著能走的格子四向漫延（門算磚），數圍起來有幾格；超過 MAX_ROOM 就回 MAX_ROOM+1，磚上、門上、水裡回 Infinity
    roomSize(x, y) {
      const k0 = U.key(x, y), hit = this.roomCache.get(k0);
      if (hit !== undefined) return hit;
      if (!this.passable(x, y)) { this.roomCache.set(k0, Infinity); return Infinity; }
      const seen = new Set([k0]), q = [[x, y]];
      let size = 0;
      while (q.length) {
        if (seen.size > MAX_ROOM) { size = MAX_ROOM + 1; break; }
        const [cx, cy] = q.shift();
        for (const [dx, dy] of N4) { const nx = cx + dx, ny = cy + dy, k = U.key(nx, ny); if (!seen.has(k) && this.passable(nx, ny)) { seen.add(k); q.push([nx, ny]); } }
      }
      if (!size) { size = seen.size; for (const k of seen) this.roomCache.set(k, size); }   // 同一間屋裡的格子一起記下
      else this.roomCache.set(k0, size);
      return size;
    }
    // 這格是不是「某種生靈進不來」的小屋裡：門檻由難度決定（type 是生靈的字；魄另一個門檻）
    sheltered(x, y, type) { const lim = this.roomLimitFor(type); return lim > 0 && this.roomSize(x, y) <= lim; }
    // 每息一次：屋外的燈各擲一次真隨機，中了就澆壞、消失
    rainLamps() {
      for (const k of Array.from(this.lamps)) {
        const [x, y] = U.unkey(k);
        if (this.get(x, y) !== '燈') { this.lamps.delete(k); continue; }
        if (this.covered(x, y) || this.dryAt(x, y) || this.eaveNear(x, y) || U.trueRand() >= this.rainLampP) continue;   // 乾地上不下雨（v0.9.17）；瓦簷下淋不著（v0.9.21）
        this.set(x, y, '白');
        if (this.onLampRuined) this.onLampRuined(x, y);
      }
    }
    heatNear(x, y, r) {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        const d = this.info(x + i, y + j);
        if (d.kind === 'fire' || d.heat || this.isBurning(x + i, y + j) || this.stoveLit(x + i, y + j)) return true;   // d.heat：熔岩、溫泉（v0.7）
      }
      return false;
    }

    tick(dt, px, py) {
      this.time += dt;
      if (this.fogs.size && this.fogStep < 1e6) {   // 霧障連續地飄：每息 1/fogStep 格；形狀照霧齡慢慢變（測試把 fogStep 設很大就停住）
        const v = 1 / this.fogStep, k = FOG_STEP / this.fogStep;
        for (const f of this.fogs.values()) { f.x += Math.cos(f.ang) * v * dt; f.y += Math.sin(f.ang) * v * dt; f.age += dt * k; }
      }
      this.acc += dt; this.seenAcc += dt;
      if (this.seenAcc >= 0.5 || Math.max(Math.abs(px - this.seenX), Math.abs(py - this.seenY)) >= SEEN_STEP) { this.seenAcc = 0; this.seenX = px; this.seenY = py; this.markSeen(px, py, 9); }   // v0.9.6 船快了：半息走不到六格才照時間記，免得走過的地圖斷成一顆一顆
      while (this.acc >= STEP) { this.acc -= STEP; this.step(px, py); }
    }

    step(px, py) {
      const rng = this.rng;
      // —— 天氣：雨起雨停（真隨機，不走種子）；下雨時每息看一次屋外的燈
      if (this.rainUntil > 0 && this.time >= this.rainUntil) { const was = this.wx; this.rainUntil = 0; this.gale = null; this.hail = null; this.nextRainAt = this.time + RAIN_GAP_MIN + U.trueRand() * (RAIN_GAP_MAX - RAIN_GAP_MIN); if (this.onWeather) this.onWeather(false, was); }
      else if (this.rainUntil <= 0 && this.time >= this.nextRainAt) {   // v0.9.15：這一場是雨、雪還是雷雨；雨雷雪天小機會起狂風
        this.rainUntil = this.time + RAIN_MIN + U.trueRand() * (RAIN_MAX - RAIN_MIN);
        const odd = root.CAL.wxOdds(Math.floor(this.time / DAY)), ps = odd.snow * this.snowP, pt = odd.thunder * this.thunderP;   // v0.9.16：雪在冬天與倒春寒、雷雨在春分二候到秋分之前
        const r = U.trueRand(); this.wx = r < ps ? 'snow' : r < ps + pt ? 'thunder' : 'rain';
        this.gale = U.trueRand() < this.galeP ? this.newGale() : null;
        if (this.onWeather) this.onWeather(true, this.wx);
        this.hail = null; if (this.wx === 'thunder') { const tk = root.CAL.term(Math.floor(this.time / DAY)).k; if (tk >= HAIL_TERMS[0] && tk <= HAIL_TERMS[1] && U.trueRand() < this.hailP) this.startHail(); }
      }
      if (this.raining()) { this.rainAcc += STEP; while (this.rainAcc >= 1) { this.rainAcc -= 1; this.rainLamps(); } } else this.rainAcc = 0;
      if (this.gale && !this.galeOn()) this.gale = null;   // 雨雷雪停了、到了時候，狂風跟著停
      if (this.gale) this.galeTick(px, py);
      if (this.ores.size) this.regrowOres();
      if (this.dayIdx() !== this.cropDay) this.cropTick();   // 五穀換日長（v0.9.18）
      // —— 霧障：到時的先起；換日擲兩次；放了一日的自己散
      for (let i = this.fogPlan.length - 1; i >= 0; i--) if (this.time >= this.fogPlan[i]) { this.fogPlan.splice(i, 1); this.spawnFog(px, py); }
      const today = Math.floor(this.time / DAY);
      if (today !== this.fogDay) {
        this.fogDay = today;
        if (!this.precip() && U.trueRand() < this.breezeP) { this.breezeDay = today; if (this.onBreeze) this.onBreeze(); }   // 晴天才起和風（v0.9.15）
        for (let i = 0; i < FOG_ROLLS; i++) if (U.trueRand() < this.fogP) this.fogPlan.push(today * DAY + U.trueRand() * DAY);
      }
      for (const [id, f] of this.fogs) if (this.time >= f.until) this.removeFog(id);
      this.fogRoomCache.clear();
      for (const f of this.fogs.values()) {   // 霧障：每 fogStep 息上下重新定方向（躲光、隨風），每一步照現在的位置與形狀重算格子
        if (this.time >= f.moveAt) { f.moveAt = this.time + this.fogStep * (0.6 + U.trueRand() * 0.8); this.steerFog(f, px, py); }
        if (this.fogStep < 1e6) this.placeFog(f, f.x, f.y, f.age);   // 每半息照此刻的位置與形狀重算
      }
      this.roomCache.clear(); this.houseCache.clear(); this.fenceCache.clear(); this.roomInfoVer = -1;
      // —— 灶裡的柴
      for (const [k, f] of this.stoves) { if (f > 0) { const [x, y] = U.unkey(k), dan = this.get(x, y) === '鼎' && this.roomBy(x, y, '丹房'); this.stoves.set(k, Math.max(0, f - STEP * (dan ? DAN_FUEL : 1))); } }   // 丹房裡的鼎省四分之一的柴（v0.9.26）
      // —— 窯（v0.9.21）：旁邊的灶有火才燒，燒的時候那個灶多耗一份柴
      for (const [k, r] of this.kilns) { if (r.done) continue; const [x, y] = U.unkey(k), f = this.kilnFire(x, y); if (!f) continue; r.left = U.r4(Math.max(0, r.left - STEP)); const fk = U.key(f.x, f.y); this.stoves.set(fk, Math.max(0, this.stoves.get(fk) - STEP * KILN_PULL)); if (r.left <= 0) { r.done = 1; if (this.onKiln) this.onKiln(x, y, r); } }
      // —— 缸（v0.9.21）：屋外下雨下雪就接水
      if (this.jars.size && this.precip()) for (const [k, v] of this.jars) { if (v >= JAR_CAP) continue; const [x, y] = U.unkey(k), wx = this.wxAt(x, y); if ((wx === 'rain' || wx === 'snow' || wx === 'thunder') && !this.covered(x, y)) this.jars.set(k, U.r4(Math.min(JAR_CAP, v + STEP / (JAR_FILL * DAY)))); }
      // —— 火勢蔓延
      const spread = [];
      for (const [k, b] of this.burn) {
        const [x, y] = U.unkey(k);
        b.t -= STEP;
        for (const [dx, dy] of N4) {
          const nx = x + dx, ny = y + dy, nd = this.info(nx, ny);
          // 蔓延概率：疏木裡的火大致自限，林與森裡的火才會失控（分支因子 ≈ 1 / 1.4 / 1.7）
          if (nd.flam > 0 && !this.burn.has(U.key(nx, ny)) && rng() < nd.flam * 0.05 * b.lvl) spread.push([nx, ny, b.lvl]);
        }
        if (b.t <= 0) {
          this.burn.delete(k);
          this.set(x, y, '灰');
          this.timers.set(k, { from: '灰', to: '土', at: this.time + 25 + rng() * 25 });
        }
      }
      for (const [x, y, lvl] of spread) this.ignite(x, y, Math.min(lvl, 1.5));
      // —— 定時演化（灰 → 土；取過的草木長回來）
      for (const [k, tm] of this.timers) {
        if (this.time >= tm.at) {
          this.timers.delete(k);
          const [x, y] = U.unkey(k);
          if (this.get(x, y) === (tm.from || '灰') && !this.placeTiles.has(k)) this.set(x, y, tm.to);
        }
      }
      // —— 隨機採樣演替：每步採樣 300 格（約佔範圍的 10%），所以下面的概率要除以 10 才是每半秒的真實概率
      for (let n = 0; n < 300; n++) {
        const x = px + Math.floor(rng() * 56) - 28, y = py + Math.floor(rng() * 56) - 28;
        const k = U.key(x, y);
        if (!this.diff.has(k)) continue;            // 只有被改動過的格子才會"演替"，底稿本身是穩定的
        const ch = this.diff.get(k);
        if (ch === '土') {
          if (rng() < 0.35 && this.countAround(x, y, '草木林森田竹花果棉') >= 1) this.set(x, y, '草');
        } else if (ch === '草' && (this.base(x, y) === '棉' || this.base(x, y) === '麻')) {
          if (rng() < 0.05) this.set(x, y, this.base(x, y));          // 採過的棉麻又長出來（v0.8.8：先前被下面那條搶先，一半以上長成了樹）
        } else if (ch === '草') {
          if (rng() < 0.12 && this.countAround(x, y, '木林森果') >= 2) this.set(x, y, '木');
        } else if (ch === '木' && this.base(x, y) === '果') {
          if (rng() < 0.05) this.set(x, y, '果');                       // 摘過的果樹又結果
        } else if (ch === '木') {
          if (rng() < 0.08 && this.countAround(x, y, '林森') >= 3) this.set(x, y, '林');
        } else if (ch === '白') {
          // 白紙慢慢被天地"寫回"原字——但不會在玩家腳邊突然長出山或水
          if (U.cheb(x, y, px, py) <= 1) continue;
          if (rng() < 0.04 && this.countAround(x, y, null) >= 5) this.set(x, y, this.rewriteBlank(x, y));
        }
      }
    }

    rewriteBlank(x, y) { const b = this.base(x, y); return SPENT[b] || (DB[b] && DB[b].kind === 'object' ? '土' : b); }   // 白紙寫回原字；原本是人造的（村裡的墟、門）不會自己長回來，成了土（v0.6.8）；挖過的礦寫回礦渣那一層（v0.8.8）
    // 統計周圍 8 格中屬於 set 的字數；set 為 null 時統計"非白紙、非水"的格子
    countAround(x, y, set) {
      let n = 0;
      for (const [dx, dy] of N8) {
        const c = this.get(x + dx, y + dy);
        if (set ? set.indexOf(c) >= 0 : (c !== '白' && DB[c].kind !== 'water')) n++;
      }
      return n;
    }

    // 出生點：從島心螺旋向外找一塊草地/田野
    findSpawn() {
      const good = '草田土沙';
      for (let r = 0; r < 200; r++) {
        for (let i = -r; i <= r; i++) for (const [x, y] of [[i, -r], [i, r], [-r, i], [r, i]]) {
          if (good.indexOf(this.plain(x, y)) >= 0 && this.countAround(x, y, '水淼山') === 0 && !this.placeTiles.has(U.key(x, y))) return { x, y };
        }
      }
      return { x: 0, y: 0 };
    }

    // ---------- 存檔：只存差異層，世界本身可以從種子重新長出來 ----------
    serialize() {
      const pk = packWorld(this.diff, this.timers);   // v0.9.21 存檔瘦身：差異層與計時器寫成兩串字
      const burn = {}; for (const [k, v] of this.burn) burn[k] = [U.r4(v.t), v.lvl];
      const scarecrows = {}; for (const [k, v] of this.scarecrows) scarecrows[k] = U.r4(v);
      const chests = {}; for (const [k, v] of this.chests) chests[k] = v;
      const shelves = {}; for (const [k, v] of this.shelves) if (v.length) shelves[k] = v.map(s => [s.n, s.c]);
      const kilns = {}; for (const [k, r] of this.kilns) kilns[k] = [r.out, U.r4(r.left), r.done ? 1 : 0];   // v0.9.21
      const jars = {}; for (const [k, v] of this.jars) jars[k] = U.r4(v);
      const nets = {}; for (const [k, v] of this.nets) nets[k] = [v.size, v.x, v.y, v.fish, U.r4(v.t), (v.under || []).join(''), v.dur === undefined ? NET_DUR[v.size] : v.dur, v.rf || 0];
      const stoves = {}; for (const [k, v] of this.stoves) stoves[k] = U.r4(v);
      const bags = {}; for (const [k, v] of this.bags) bags[k] = v;
      const weirs = {}; for (const [k, v] of this.weirs) weirs[k] = U.r4(v);
      const ex = this.packExplored();   // v0.9.3：走過的地圖改寫成一串字（見 packExplored），不再寫 explored
      const seen = this.places.filter(p => p.seen).map(p => p.id);
      const wallHp = {}; for (const [k, v] of this.wallHp) wallHp[k] = v;
      const crops = {}; for (const [k, r] of this.crops) crops[k] = [r.c, U.r4(r.t), r.f, r.pk || 0, r.rt === undefined ? -1 : U.r4(r.rt), r.shed ? 1 : 0, r.ms || 0];   // 五穀（v0.9.18）；田鼠偷了幾把（v0.9.19）
      const fert = {}; for (const [k, r] of this.fert) fert[k] = [r.v, U.r4(r.t), r.b ? 1 : 0];
      const cats = [...this.cats.values()].map(c => [c.x, c.y, U.r4(c.t)]);
      return { kilns, jars, eaves: [...this.eaves], plq: this.plaques.size ? [...this.plaques] : undefined, crops, fert, cats, locust: this.locust ? [this.locust.x, this.locust.y, U.r4(this.locust.at)].concat(this.locust.sp ? [this.locust.sp] : []) : undefined, sk: this.sparrowKills.length ? this.sparrowKills.map(k => k.slice()) : undefined, hail: this.hail ? U.r4(this.hail.until) : undefined, cropDay: this.cropDay, seed: this.seed, gen: G.GEN, wx: this.wx, gale: this.gale ? { until: U.r4(this.gale.until), dir: this.gale.dir, day: this.gale.day } : undefined, breezeDay: this.breezeDay, purses: Object.fromEntries(this.purses), dayLen: DAY, time: U.r4(this.time), wallHp, dz: pk.dz, tz: pk.tz, dp: Object.keys(pk.dp).length ? pk.dp : undefined, burn, stoves, shelves, bags, weirs, ex, seen, scarecrows, ores: Object.fromEntries([...this.ores].map(([k, v]) => [k, U.r4(v)])), chests, nets, rainUntil: U.r4(this.rainUntil), nextRainAt: U.r4(this.nextRainAt),
        fogs: [...this.fogs.values()].map(f => [U.r4(f.until), [...f.cells].join(';'), f.sea ? 1 : 0, f.shape, [U.r4(f.x), U.r4(f.y), U.r4(f.age || 0), U.r4(f.ang || 0)]]), fogPlan: this.fogPlan.map(U.r4), fogDay: this.fogDay,
        ships: Object.fromEntries([...this.ships].map(([k, v]) => [k, { kind: v.kind, hp: U.r4(v.hp), skulls: (v.skulls || []).map(([n, e]) => [n, U.r4(e)]), repairs: v.repairs || 0, cells: v.cells, fid: v.fid, dir: v.dir, t: v.t }])) };   // t：下水的時刻（v0.8.21）   // fid：洞庭那一場用過這艘（v0.8.16）
    }
    restore(s, briefDay) {
      const t0 = s.time || U.r4(DAY * morning(0)); this.time = t0; this.timeShift = 0;
      if (s.dayLen !== DAY && s.keepClock && s.dayLen > 0) {   // 遊戲裡改難度（v0.8.2）：第幾日、幾時都不變，只換一日的長度；存著的時刻跟著挪，倒數的息數不變
        const d = Math.floor(t0 / s.dayLen), frac = (t0 - d * s.dayLen) / s.dayLen;
        this.time = U.r4(d * DAY + frac * DAY); this.timeShift = U.r4(this.time - t0);
      } else if (s.dayLen !== DAY) {   // 舊存檔（一日長度不同）：日數不換算，時間設成那天的大清早（v0.6.2 使用者定）；存著的時刻跟著挪，倒數不變
        const d = briefDay > 0 ? briefDay - 1 : Math.floor(t0 / DAY);
        this.time = U.r4(d * DAY + DAY * morning(d)); this.timeShift = U.r4(this.time - t0);
      }
      const sh = (v) => typeof v === 'number' && v > 0 ? U.r4(v + this.timeShift) : v;
      loosen(s);   // v0.9.21 的兩串字換回來
      this.diff = new Map(Object.entries(s.diff || {})); this.ver = (this.ver || 0) + 1;
      for (const [k, v] of this.diff) if (v === '牆') this.diff.set(k, '墟'); else if (v === '橋') this.diff.set(k, '棧');   // v0.6.2 前的殘牆字；v0.8.22 橋與棧併成棧
      this.wallHp = new Map(Object.entries(s.wallHp || {}));
      this.lamps = new Set(); for (const [k, v] of this.diff) if (v === '燈') this.lamps.add(k);
      this.rainUntil = sh(s.rainUntil || 0) > this.time ? sh(s.rainUntil) : 0;
      this.nextRainAt = sh(s.nextRainAt) || (this.time + DAY + U.trueRand() * DAY * 2);
      this.wx = s.wx || 'rain'; this.breezeDay = s.breezeDay === undefined ? -1 : s.breezeDay;   // v0.9.15 天氣；舊存檔照雨
      this.gale = s.gale && sh(s.gale.until) > this.time ? { until: sh(s.gale.until), dir: s.gale.dir | 0, day: s.gale.day } : null; this.galeRuins = null;
      this.rainAcc = 0;
      this.fogs = new Map(); this.fogCells = new Map(); this.fogSeq = 0;
      for (const [u, cells, sea, shape, at] of s.fogs || []) { const until = sh(u); if (until > this.time && cells) this.addFog(cells.split(';'), until, sea, shape && shape.h ? shape : null, at); }   // v0.6.4 前的霧只有格子：照格子配一個形
      this.ships = new Map(); this.shipCells = new Map();
      for (const [k, v] of Object.entries(s.ships || {})) {
        if (Array.isArray(v)) {        // v0.4 的單格大船：當孤帆，船身找得到第二格水就留，找不到就沒了
          const [ax, ay] = U.unkey(k), old = { kind: '孤帆', hp: Math.min(v[0], SHIPS['孤帆'].hp), skulls: v[2] && v[1] > this.time ? [[v[2], v[1]]] : [], repairs: 0 };
          const water = (x, y) => { const t = this.get(x, y); return DB[t].kind === 'water' || t === '舟'; };
          const anchor = [[ax, ay], [ax, ay - 1]].find(([x, y]) => this.shipFits('孤帆', x, y, water));
          if (anchor) this.addShip(anchor[0], anchor[1], old); else { const b = this.base(ax, ay); this.set(ax, ay, DB[b].kind === 'water' ? b : '水'); }
          continue;
        }
        const rec = { kind: SHIPS[v.kind] ? v.kind : '孤帆', hp: v.hp, skulls: (v.skulls || []).map(([n, e]) => [n, sh(e)]).filter(x => x[1] > this.time), repairs: v.repairs || 0, cells: v.cells, fid: v.fid, t: v.t === undefined ? undefined : sh(v.t) }; rec.dir = v.dir || World.shipDir(rec);   // v0.8.17 前的船沒記擺向：照船身量
        this.ships.set(k, rec); for (const [x, y] of rec.cells) this.shipCells.set(U.key(x, y), k);
      }
      for (const [k, v] of this.diff) if (v === '舟' && !this.shipCells.has(k)) { const [x, y] = U.unkey(k), b = this.base(x, y); this.set(x, y, DB[b].kind === 'water' ? b : '水'); }   // 沒有記錄的舟字：還原成水
      this.movedShips = 0;
      for (const [ak, rec] of [...this.ships]) {   // v0.7 擴島：舊存檔的船若停在長出來的新陸地上，挪到最近的海
        if (rec.cells.every(([x, y]) => DB[this.base(x, y)].kind === 'water')) continue;
        const [ax, ay] = U.unkey(ak); this.removeShip(ak);
        for (const [x, y] of rec.cells) { const b = this.base(x, y); if (DB[b].kind !== 'water') this.set(x, y, b); }
        const ok = (x, y) => { const t = this.get(x, y); return DB[t].kind === 'water' && t !== '舟'; };
        let spot = null;
        for (let r = 1; r <= 60 && !spot; r++) for (let i = -r; i <= r && !spot; i++) for (const [x, y] of [[ax + i, ay - r], [ax + i, ay + r], [ax - r, ay + i], [ax + r, ay + i]]) if (!spot && this.shipFits(rec.kind, x, y, ok, rec.dir)) spot = [x, y];
        if (spot) { this.addShip(spot[0], spot[1], rec); this.movedShips++; }
      }
      this.resizedShips = 0; this.lostShips = [];
      for (const [ak, rec] of [...this.ships]) {   // v0.8.18 船改了大小（孤帆二乘二、方舟三乘三）：舊船照新大小重停，先找蓋得住原本左上角的擺法，再往外找；六十格內都停不下就交給遊戲端收進囊
        const [W, H] = World.shipDims(rec.kind, rec.dir); if (rec.cells.length === W * H) continue;
        const x0 = Math.min(...rec.cells.map(c => c[0])), y0 = Math.min(...rec.cells.map(c => c[1])), old = new Set(rec.cells.map(([x, y]) => U.key(x, y)));
        this.removeShip(ak); delete rec.cells;
        const ok = (x, y) => { const t = this.get(x, y); return DB[t].kind === 'water' && DB[this.raw(x, y)].kind === 'water' && !this.shipCells.has(U.key(x, y)); };
        let spot = null, best = -1;
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const ax = x0 - i, ay = y0 - j; if (!this.shipFits(rec.kind, ax, ay, ok, rec.dir)) continue; const n = this.shipFootprint(rec.kind, ax, ay, rec.dir).filter(([x, y]) => old.has(U.key(x, y))).length; if (n > best) { best = n; spot = [ax, ay]; } }
        for (let r = 1; r <= 60 && !spot; r++) for (let i = -r; i <= r && !spot; i++) for (const [x, y] of [[x0 + i, y0 - r], [x0 + i, y0 + r], [x0 - r, y0 + i], [x0 + r, y0 + i]]) if (!spot && this.shipFits(rec.kind, x, y, ok, rec.dir)) spot = [x, y];
        if (spot) { this.addShip(spot[0], spot[1], rec); this.resizedShips++; } else this.lostShips.push(rec);
      }
      this.fogPlan = (s.fogPlan || []).filter(t => typeof t === 'number').map(sh);
      this.fogDay = typeof s.fogDay === 'number' ? s.fogDay : Math.floor(this.time / DAY);
      this.burn = new Map(Object.entries(s.burn || {}).map(([k, v]) => [k, { t: v[0], lvl: v[1] }]));
      this.timers = new Map(Object.entries(s.timers || {}).map(([k, v]) => [k, { to: v[0], at: sh(v[1]), from: v[2] || '灰' }]));
      this.scarecrows = new Map(Object.entries(s.scarecrows || {}).map(([k, v]) => [k, sh(v)]));
      this.crops = new Map(Object.entries(s.crops || {}).map(([k, a]) => [k, { c: a[0], t: sh(a[1]) || a[1], f: a[2], pk: a[3] || 0, rt: a[4] >= 0 ? sh(a[4]) || a[4] : undefined, shed: a[5] ? 1 : 0, ms: a[6] || 0 }]));   // 五穀（v0.9.18）；舊存檔沒有
      this.fert = new Map(Object.entries(s.fert || {}).map(([k, a]) => [k, { v: a[0], t: sh(a[1]) || a[1], b: a[2] ? 1 : undefined }]));
      this.cropDay = s.cropDay === undefined ? -1 : s.cropDay; this.wildDay = -1; this.fenceCache = new Map();
      this.cats = new Map((s.cats || []).map(([x, y, t]) => [U.key(x, y), { x, y, t: sh(t) || t }]));   // 守田的狸（v0.9.19）
      this.hail = s.hail ? { until: sh(s.hail) || s.hail } : null;   // 冰雹（v0.9.19）
      this.locust = s.locust ? { x: s.locust[0], y: s.locust[1], at: sh(s.locust[2]) || s.locust[2] } : null;   // 要落下來的蝗群
      if (this.locust && s.locust[3]) this.locust.sp = s.locust[3];
      this.sparrowKills = (s.sk || []).map(k => [k[0], k[1], k[2]]);   // 打死的雀（v0.9.25）：記的是第幾日，換日長不用挪
      this.fences = new Set(); for (const [k, v] of this.diff) if (DB[v] && DB[v].fence) this.fences.add(k);
      this.ores = new Map(Object.entries(s.ores || {}).map(([k, v]) => [k, sh(v)]));
      this.chests = new Map(Object.entries(s.chests || {}));
      this.shelves = new Map(Object.entries(s.shelves || {}).map(([k, v]) => [k, v.map(([n, c]) => ({ n, c }))]));
      this.kilns = new Map(Object.entries(s.kilns || {}).map(([k, a]) => [k, { out: a[0], left: a[1], done: a[2] ? 1 : 0 }]));   // 窯、缸、瓦簷（v0.9.21）
      this.jars = new Map(Object.entries(s.jars || {})); this.eaves = new Set(s.eaves || []); this.plaques = new Map(s.plq || []);   // 門上的匾（v0.9.26）
      this.nets = new Map(); this.netCells = new Map();
      for (const [k, v] of Object.entries(s.nets || {})) { const rec = { size: v[0], x: v[1], y: v[2], fish: v[3], t: sh(v[4]), under: v[5] ? Array.from(v[5]) : [], dur: v[6] === undefined ? NET_DUR[v[0]] : v[6], rf: v[7] || 0 }; rec.tidal = rec.under.indexOf('灘') >= 0; this.nets.set(k, rec); for (let j = 0; j < rec.size; j++) for (let i = 0; i < rec.size; i++) this.netCells.set(U.key(rec.x + i, rec.y + j), k); }
      this.stoves = new Map(Object.entries(s.stoves || {}));
      this.bags = new Map(Object.entries(s.bags || {}));
      const reDay = (v) => typeof v === 'number' && v > 0 && s.dayLen > 0 && s.dayLen !== DAY ? U.r4(Math.round(v / s.dayLen) * DAY) : v;   // 荷包的期限是「第幾日」：一日的長度換了（換難度、舊存檔），照日數換算，不照息數（v0.9.14 自查：原本沒換算，簡單一般換來換去會早幾日或晚幾日沒了）
      this.purses = new Map(Object.entries(s.purses || {}).map(([k, r]) => [k, Object.assign({}, r, { until: reDay(r.until) }, r.deaths ? { deaths: r.deaths.map(d => Object.assign({}, d, { until: reDay(d.until), t: sh(d.t) })) } : {})]));   // v0.8.27 荷包的期限（舊存檔的荷包沒有期限）
      this.weirs = new Map(Object.entries(s.weirs || {}).map(([k, v]) => [k, sh(v)]));
      if (typeof s.ex === 'string') this.explored = this.unpackExplored(s.ex);   // v0.9.3 起的寫法
      else {   // v0.9.2 以前：每塊 64 個十六進位字
        this.explored = new Map();
        for (const [k, hex] of Object.entries(s.explored || {})) { const b = new Uint8Array(32); for (let i = 0; i < 32; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16) || 0; this.explored.set(k, b); }
      }
      const seen = new Set(s.seen || []);
      for (const pl of this.places) pl.seen = seen.has(pl.id);
    }
  }

  World.SHIPS = SHIPS;
  World.shipDims = (kind, dir) => { const k = SHIPS[kind] || SHIPS['孤帆']; return dir === 'h' ? [k.h, k.w] : [k.w, k.h]; };   // 船身寬、長（東西、南北各幾格）
  World.shipDir = (rec) => {   // 擺向：記著的就照記的，沒記的（v0.8.17 前）照船身量，量不出就是南北長
    if (rec.dir === 'h' || rec.dir === 'v') return rec.dir;
    const c = rec.cells; if (!c || !c.length) return 'v';
    const xs = c.map(a => a[0]), ys = c.map(a => a[1]);
    return Math.max(...xs) - Math.min(...xs) > Math.max(...ys) - Math.min(...ys) ? 'h' : 'v';
  };
  World.newShip = (kind) => ({ kind: SHIPS[kind] ? kind : '孤帆', hp: (SHIPS[kind] || SHIPS['孤帆']).hp, skulls: [], repairs: 0 });
  World.DEEP_R = DEEP_R;
  World.ROOM = { decor: DECOR, dan: DAN_FUEL, kind: roomKind };   // 屋有其用（v0.9.26）
  World.SPARROW = { free: SPARROW_FREE, k: SPARROW_LOCUST, max: SPARROW_LOCUST_MAX, r: SPARROW_KILL_R, days: SPARROW_KILL_DAYS };   // 打雀招蝗（v0.9.25）
  root.World = World;
  World.loosen = loosen; World.packWorld = packWorld;
  root.World.CH = CH;
  Object.defineProperty(root.World, 'DAY', { get: () => DAY, configurable: true });
  root.World.setDay = setDay;
  root.World.SCARE_DAYS = SCARE_DAYS; root.World.SCARE_CAP = SCARE_CAP;
  root.World.HOUSE_MAX = HOUSE_MAX; root.World.DIR8 = DIR8;
})();
