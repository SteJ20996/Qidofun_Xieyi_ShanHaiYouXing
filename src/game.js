// game.js —— 主迴圈、輸入、取／攻擊／放／製作／吃／睡／上船、命飽暖力愜與膽氣、毒與魄、死亡與復活、見聞錄、HUD、存檔
(function () {
  'use strict';
  const U = window.U, G = window.G, DB = G.DB, ITEMS = G.ITEMS, CAL = window.CAL;
  // 八格存檔（v0.8 從三格加到八格）：第一格沿用舊鍵 xieyi.save.v5（舊存檔照讀），第二到八格是 xieyi.save.v5.2…v5.8；xieyi.slot 記上次玩的是哪一格；xieyi.carry 是渡海帶走的膽氣（值@格）
  // 暫停面板可以「存到」任一格（另存）：存進去以後就改玩那一格，之後的自動存檔寫那格，原來那格停在存的那一刻
  const BACKUP_KEY = 'xieyi.backup';   // 改版前的存檔抄過備份了沒（v0.9.20；值是抄的那一版）
  const RESUME_KEY = 'xieyi.resume';   // 遊戲裡換了難度、重新讀檔：記下要直接接著玩哪一格（讀過就刪，v0.8.2）
  const SAVE_KEY = 'xieyi.save.v5', CARRY_KEY = 'xieyi.carry', SLOT_KEY = 'xieyi.slot', SAVE_SLOTS = 8, SLOT_NAMES = ['', '一', '二', '三', '四', '五', '六', '七', '八'];
  // v0.8.10 測試服（使用者定）：這一份遊戲是哪一服由 src/server.js 定（正式服沒有測試格）。測試服的第六、七、八格是測試格：錦囊用滿、送神兵（不掉耐久）、
  // 膽氣無窮（TEST_LEVEL，顯示 ∞；山海衣的攻擊照卅一重算）、命飽暖力愜一直是滿的、挨打只有特效不掉命、採到的東西在囊裡櫃裡都是無數個、灶鼎手工做的都是滿級（成不成的一律成、不掉耐久）
  const GAME_VER = 'v0.9.20';   // 版號（吐槽時附上；每次改版號跟著改）
  const SERVER = window.XIEYI_SERVER || { name: '', test: [] }, TEST_SLOTS = (SERVER.test || []).filter(n => n >= 1 && n <= SAVE_SLOTS), TEST_LEVEL = 99, TEST_BAG = 30;   // TEST_BAG：測試格的囊多三十格（v0.8.14）
  const num = (c) => (c === Infinity ? '∞' : c);   // 測試格的無數個顯示成 ∞
  let DAY = 300;   // 一晝夜幾個現實世界秒：v0.6.10 起看難度（DIFF.*.day：簡單 420、一般 360、困難 300；v0.6.2–v0.6.9 一律 300），開島或讀檔時連 world.js 一起定下（World.setDay），之後換難度也不變
  // 一日從午夜算起（v0.6.2）：天亮、天黑各在一個點，夜色在前後各 0.06 裡漸變。v0.6.2–v0.9.16 固定在 0.25、0.75（卯正、酉正）；
  // v0.9.17 起照節氣與北緯 32 度變（`CAL.dawn()`／`dusk()`：夏至日出約 0.206、日落 0.794，冬至 0.294、0.706，春秋分 0.25、0.75）
  const TWILIGHT = 0.06;
  const SHICHEN = '子丑寅卯辰巳午未申酉戌亥';
  const DIRS = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  const MAP_MIN_N = 60;   // 大地圖放大（v0.8.24 使用者要的）：每放大一檔範圍減半；v0.8.25 起最近看到方圓三十格（跟 render.js 的一樣）
  const SHIP_KEYS = { Digit1: [-1, 0], Digit2: [0, -1], Digit3: [0, 1], Digit4: [1, 0] };   // v0.8.17 使用者定：在船上 1 左 2 上 3 下 4 右開船（WASD 是人在船上走）
  const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  const BASE_SLOTS = 16, STACK = 64, CHEST_SLOTS = 24, BASE_TOOLS = 6, MAX_POUCHES = 8, FERMENT_NIGHTS = 15, SHIP_LEVEL = 8, TOTEM_LEVEL = 16, DECAY_LEVEL = 31, DECAY_DAYS = 3;   // TOTEM_LEVEL：山海衣的門檻（v0.4.11 從十重改十六重，另要至少一件鎢鋼護具）
  // 難度：一日幾息（day，v0.6.10）、飽掉得多快（hunger，v0.6.10：簡單慢兩成）、魄從第幾夜起、受傷與攻擊倍率、夜裡狼虎豹蛇的數量倍率
  // warn：數值不到四分之一要不要彈窗提醒（困難只閃不彈）；room／ghostRoom：磚與門圍起不超過幾格的小屋擋得住獸／魄（0 ＝ 磚擋不住魄，只有光）
  const DIFF = { easy: { key: 'easy', name: '簡單', day: 420, hunger: 0.8, ghost: 21, taken: 0.9, dmg: 1.1, beasts: 1, warn: true, room: 28, ghostRoom: 18, ghostMax: 8, ghostSan: 4, lampP: 1 / 4500, cour: 1.4, god: { days: 4, floor: 28, sta: 0 }, bossHp: 1.12, godDmg: 1.03, bossT: { away: 2100, sum: 3360, cap: 8400 } }, normal: { key: 'normal', name: '一般', day: 360, hunger: 1, ghost: 13, taken: 1, dmg: 1, beasts: 1, warn: true, room: 18, ghostRoom: 8, ghostMax: 8, ghostSan: 4, lampP: 1 / 2500, cour: 1.25, god: { days: 3, floor: 27, sta: 0 }, bossHp: 1.25, godDmg: 1.04, bossT: { away: 1800, sum: 2880, cap: 7200 } }, hard: { key: 'hard', name: '困難', day: 300, hunger: 1, ghost: 9, taken: 1.1, dmg: 0.9, beasts: 1.5, warn: false, room: 10, ghostRoom: 0, ghostMax: 10, ghostSan: 5, lampP: 1 / 800, cour: 1.15, god: { days: 2, floor: 26, sta: 0.3 }, bossHp: 1.45, godDmg: 1.05, bossT: { away: 1500, sum: 2400, cap: 6000 } } };
  // ghostMax：魄最多幾隻；ghostSan：魄四格內、身邊無光時每息蝕多少愜意（v0.5：一般簡單 4、困難 5，原本一律 3）
  // lampP：下雨時屋外每盞燈每息被澆壞的機率（v0.4.12 分難度：簡單 1/4500、一般 1/2500、困難 1/800）
  // cour：膽氣所有來源的加成（v0.4.13：簡單 ×1.4、一般 ×1.25、困難 ×1.15，乘完一次取整）
  // god：身上帶著神兵（九閽鳴雷、燭龍焚溟、青冥落羽，幾件也只算一重減益）時膽氣幾日一減、下限幾重、每息另掉多少力（只有困難掉力）
  // bossHp：小魔王、大魔王、共工與影子的命（v0.8.10 使用者定：簡單 ×1.12、一般 ×1.25、困難 ×1.45，四捨五入到百）；godDmg：神兵的傷害（×1.03／1.04／1.05）
  // bossT：大魔王的時限（v0.8.10 使用者定，單位息）：走出地界連續 away、或在外累積 sum 沒回來算認輸；一場從按「進去」起最多 cap（都是五日、八日、二十日）
  // 九閽鳴雷：卅一重方可造、可掄；三格內諸獸同受其傷；隨身則膽氣二日一減、下限廿五重
  const HAMMER = '九閽鳴雷', HAMMER_LEVEL = 31, HAMMER_RANGE = 3, GODS = ['九閽鳴雷', '燭龍焚溟', '青冥落羽'];
  // 對空神兵（v0.8.25）：青冥落羽，面前 BOW_RANGE 格內一隻；天上的全傷，陸上海中的只有 BOW_GROUND（使用者說過弓箭會拿去打陸海、不平衡）；
  // 射中天上的，矰尾的絲纏住牠 BOW_TIE 息（繳），落在地上近得了身，同一隻 BOW_TIE_GAP 息內纏不了第二回。九閽鳴雷打天上的也減半（v0.8.25，使用者早先定的方向）
  const BOW = '青冥落羽', BOW_RANGE = 10, BOW_GROUND = 0.1, BOW_TIE = 2.5, BOW_TIE_GAP = 10;
  // 畢方的訛火（v0.8.25）：落腳的地方燒 FIRE_T 息，踩上去每息灼 FIRE_BURN；一聲鳴，你身邊 FIRE_RAIN_N 處先冒圈、FIRE_MARK_T 息後燒起來
  const FIRE_T = 7, FIRE_BURN = 3, FIRE_MARK_T = 1, FIRE_RAIN_N = 3;
  const WIND_SEA_CUT = 0.14;   // 大風的陸海比（設計稿〈六〉）：照開島時的原始地形，青丘地界裡海佔幾成，就減幾成的 14%（命與傷害）   // 神兵隨身的減益看難度 DIFF.*.god（v0.4.13 前固定二日一減、下限廿五重、只看九閽鳴雷）
  // 農書（v0.9.19 使用者定）：四頁；物候冊來作客的、天象初見；晴耕雨讀一場雨愜意 +RAIN_READ；春分睡在有窗的屋子燕來 +SWALLOW_SAN；白露、寒露初候白天在屋外每息 GEESE_P 見雁
  const NONG_TABS = [['season', '時令'], ['grain', '五穀'], ['cook', '料理'], ['wuhou', '物候冊']], RAIN_READ = 8, SWALLOW_SAN = 6, GEESE_P = 0.02, HAIL_TERMS = [6, 13];
  const VISITORS = [
    { k: '獺', name: '獺祭魚', when: '雨水初候', text: '獺把魚一條條擺在岸上，留了兩條給你。', hint: '雨水初候，白天在水邊。' },
    { k: '燕', name: '玄鳥至', when: '春分', text: '燕子在屋簷下銜泥築巢。', hint: '春分，睡在有窗的屋子裡。' },
    { k: '雁', name: '鴻雁來', when: '白露、寒露初候', text: '一行雁從北邊飛過，排成人字。', hint: '白露或寒露初候，白天在屋外抬頭。' }
  ];
  const FIRSTS = [['snow', '初雪'], ['thunder', '初雷'], ['hail', '冰雹'], ['gale', '狂風'], ['breeze', '和風']];
  const TUTORS = { farm: [
    ['下種', '<p>五穀就是種。選中囊裡的穀，面向<b>田</b>按 <kbd>F</kbd> 下種——原生的田，或拿鋤面向土、草按 <kbd>E</kbd> 鋤出來的田。</p><p>每種穀有自己的節氣：黍清明到小暑、稷穀雨到大暑、菽立夏到立秋、稻芒種到大暑（田邊要有水）、麥秋分到霜降（過冬，來年小滿熟）。狀態列寫著今天的節氣。</p>'],
    ['地力', '<p>田有<b>地力</b>，墨色越深越厚，最多四。原生的田三、鋤出來的二；稻麥要二，黍稷菽要一。</p><p>收一次減一（菽反而加一）；空著每十五日回一點；火燒過的焦土（灰）取得草木灰，撒在田裡 +1。下種時地力三多收一把，四再多一把。</p>'],
    ['看田', '<p>秀了、熟了，<b>雀</b>白天來啄（稻草人看得住），<b>田鼠</b>夜裡來偷（籬、稻草人都不管用，要<b>狸</b>：林竹間見人就躲，投一條魚也許跟你走，帶到田邊就留下守田）。</p><p>鹿、野豬、野牛走進田裡會啃：圍<b>籬</b>、開口放一扇<b>扉</b>。小暑到處暑偶有<b>蝗</b>，前一天說，田邊點燈生火保得住。霜降以後還沒熟的凍死，麥不怕。</p>'],
    ['收成與時令', '<p>熟了按 <kbd>E</kbd> 收，得穀二到四把與一把草；熟了十五日不收就落穗。</p><p>穀記著收了幾日：四十五日內是<b>新穀</b>，放過一百八十日成<b>陳穀</b>，做成的菜增益不一樣。做菜先用最陳的。</p>'],
    ['做菜', '<p>帶著<b>釜</b>（鐵二）、<b>甑</b>（鐵一竹二），火旺的灶的界面就多一欄：煮粥羹、蒸飯糕餅，五穀的菜各有<b>一頓</b>的小增益，一次只有一頓。</p><p>一時辰內配著肉、魚、果、豉吃，算<b>調和</b>，那一頓長一半。</p><p>這些都寫在右上角的「<b>農書</b>」（<kbd>K</kbd>）裡，隨時翻得到；生存之道也有。</p>']
  ] };
  const HAIL_GAP = 2, HAIL_HURT = 2;   // 冰雹（v0.9.19）：屋外每兩息挨一下
  const IDLE_KEYS = [['ghost', '魄不再越來越快'], ['purse', '荷包不過期'], ['death', '死了不減膽氣']];   // 閒遊（v0.9.19）
  const CAT_TAME = 0.5, CAT_MAX = 6;   // 狸（v0.9.19）：投一條魚一半機會跟你走；守田的最多六隻
  const TAME_CHANCE = [0.35, 0.25, 0.10], EAGLE_FEED = 40, TURTLE_PEACE_DAYS = 5;   // 馴鷹的機率看已經跟著幾隻；餵魚回力；龜卜吉兆幾日無魄
  // 膽氣：第 n 重升到 n+1 重要 20×(1+0.1n)² 點：20、24.2、28.8、33.8、39.2……八重共 300，十重 437，卅一重 4371
  const LEVEL_UNIT = 20;
  const rnd = (x) => (x < 0 ? -Math.round(-x) : Math.round(x));   // 四捨五入（負數也是「五入」到離零遠的那邊，零頭來回才不偏）
  const fmt = (n) => String(rnd(n));   // 顯示用：玩家看得到的數一律整數（v0.6.8 使用者定）；計算一律精確到小數點後四位（U.r4）；一再出現的數（傷害、回復、膽氣）走 game.shown() 把零頭攢著
  const levelCost = (n) => U.r4(LEVEL_UNIT * (1 + 0.1 * n) * (1 + 0.1 * n));   // v0.6.2 起不取整：20、24.2、28.8、33.8、39.2、45、51.2……   // 四捨五入到個位：20、24、29、34、39、45、51、58、65、72、80……
  const CUM = [0]; for (let n = 0; n < 120; n++) CUM.push(U.r4(CUM[n] + levelCost(n)));
  // 衣甲：五件一套，一百八十日勻速穿破；十五息內挨打越多壞得越快，且會累加
  const SLOT_ORDER = ['襯', '褲', '甲', '盔', '靴', '帽'], ARMOR_SLOTS = ['襯', '褲', '甲', '盔', '靴'], ARMOR_LIFE = 180, HIT_MULT = [1, 1.05, 1.12, 1.2, 1.5];
  // 一件燒幾息（v0.5.1 重訂：使用者給煤 150、草 30、果 45、木 105、棉 75、精煤 900，其餘照比例往下調）；灶與鼎的火最多存 999 息
  const FUEL = { '煤': 150, '精煤': 900, '木': 105, '竹': 60, '果': 45, '棉': 75, '麻': 70, '草': 30, '花': 25, '棧': 90 };   // v0.8.22 橋併進棧
  const TURTLE_SAN = 30;                      // 殺龜不祥：愜意掉三十
  // 雪域（v0.4.12）：離雪 SNOW_R 格內待超過 SNOW_GRACE 息，暖開始多掉，越待掉越快（起步每息 SNOW_RATE，每多待一息再加 SNOW_RAMP，封頂 SNOW_MAX）；
  // 烤的東西下肚有熱氣：HEAT_PER_MEAL 息內凍不傷命，累積到 HEAT_CAP 為止
  // v0.7 外島的地形：漠白天力不回反掉、夜裡更冷；熔岩一格內燙傷；溫泉泡著回命回愜意；洞窟白天也黑；第一次登上一座外島長膽氣
  const DESERT_STA = 0.4, DESERT_COLD = 0.8, LAVA_BURN = 1.5, SPRING_HP = 1, SPRING_SAN = 0.3, CAVE_DARK = 0.88, ISLE_COUR = 10;
  // v0.8.4 四方地界：第一次到的時候說的話（地方怎麼種見 glyphs.js 的 ZONE_DEFS）
  const ZONE_TEXT = {
    '青龍': '方圓幾十格不見一塊地，水深得發黑。東海青龍就盤在這裡。',
    '修蛇': '一圈礁石圍著一大片湖，水是淡的，礁上留了四個口子給船進出。《淮南子·本經訓》說羿「斷修蛇於洞庭」。',
    '封豨': '桑樹成林，林心一塊空地，地上有很深的蹄印。《淮南子·本經訓》：「禽封豨於桑林。」',
    '大風': '高原草野，島邊一片澤，風颳得人站不穩。《淮南子·本經訓》：「繳大風於青丘之澤。」',
    '白虎': '白石嶙峋的嶺，嶺上有鐵。夜裡聽得見虎嘯，卻不見虎。',
    '朱雀': '滿地紅花，外圍有溫泉。〈南山經〉說丹穴之山有鳥，「五采而文，名曰鳳皇」。',
    '玄武': '北海上的一座洲，林深，水邊有淡水的潭；島心一塊石頭很久沒動。',
    '共工': '一圈大山圍著一塊盆地，東南缺了一口，像被什麼撞斷的。《淮南子·天文訓》：「怒而觸不周之山，天柱折，地維絕。」',
  };
  const SNOW_R = 5, SNOW_GRACE = 5, SNOW_RATE = 1, SNOW_RAMP = 0.1, SNOW_MAX = 4, HEAT_PER_MEAL = 90, HEAT_CAP = 150;
  // v0.9.15 天氣（使用者定；天氣本身在 world.js）：雪天在屋外站著不動 SNOW_STILL 息，暖每息多掉 SNOW_STILL_WARM、力不回反掉 SNOW_STILL_STA（屋裡、火邊不算）；
  // 和風（只在晴天）在三十八格以內的屋子外面每 BREEZE_GAP 息愜意 +BREEZE_SAN；狂風每息 GALE_PUSH_P 的機會把人往風向吹一格（海上 GALE_SEA 格、地界裡一樣），
  // 每 GALE_WINDOW 息最多 GALE_MAX_PUSH 回，三十八格以內的屋子裡吹不著；雷雨每 BOLT_GAP 息在你方圓 BOLT_R 格內落一道雷（先亮 BOLT_WARN 息），
  // 三乘三內：魄煙滅、人挨 BOLT_HURT（灼，衣甲不減）、獸挨 BOLT_DMG（劈死的什麼也不留；大魔王、小魔王、影子只傷不死；神獸不挨）；三十八格以內的屋子、洞窟裡打不到
  const SNOW_STILL = 20, SNOW_STILL_WARM = 2, SNOW_STILL_STA = 0.4, BREEZE_GAP = 5, BREEZE_SAN = 2, GALE_PUSH_P = 0.05, GALE_WINDOW = 10, GALE_MAX_PUSH = 2, GALE_SEA = 2;
  const BOLT_GAP = [3, 7], BOLT_R = 14, BOLT_WARN = 1, BOLT_HURT = 20, BOLT_DMG = 60, GODS4 = ['青龍', '白虎', '朱雀', '玄武'];
  const BOLT_TIER = [1, 0.6, 0.3], BOLT_TIER_NAME = ['正中', '十字', '四角'];   // 落雷分三檔（v0.9.15 使用者定）：正中、上下左右、四角；人 20／12／6、獸 60／36／18，魄不分檔一律煙滅
  const boltTier = (dx, dy) => { const ax = Math.abs(dx), ay = Math.abs(dy); return ax > 1 || ay > 1 ? -1 : ax + ay; };   // 0 正中、1 十字、2 四角、-1 不在三乘三裡
  // v0.9.16 觀星（使用者定）：T 抬頭，畫面從俯視地面轉成仰望天空（GAZE_T 息的動畫，低頭反過來）；屋裡、洞裡、水裡、戰中看不了；
  // 挨了打就低頭；夜裡晴天看著星，每 GAZE_SAN_GAP 息愜意 +GAZE_SAN
  const GAZE_T = 1.6, GAZE_ALT = 52 * Math.PI / 180, GAZE_ALT_MIN = 4 * Math.PI / 180, GAZE_ALT_MAX = 89.5 * Math.PI / 180, GAZE_PAN = 70 * Math.PI / 180, GAZE_SAN = 1, GAZE_SAN_GAP = 5;
  const GAZE_CULTURES = [['cn', '星官'], ['west', '星座'], ['none', '不連線']];
  // v0.9.17 垂釣（使用者定：撒網只撈淺水，垂釣釣中層與深海，兩樣不重疊）：浮子落在面前 ROD_REACH 格內的第二格水上（沒有就第一格）；
  // 離岸 ROD_SHORE 格內的海、池、湯算淺水，竿不拋；等 ROD_WAIT 息（晨昏快四成、下雨快一成五）浮子沉 ROD_BITE 息，這時按 F 才上鉤；
  // 要收幾下的魚：每下耗力 ROD_STA、線繃 +ROD_PRESS，魚每 ROD_PULL 息扯一回 +ROD_TUG，線繃每息退 ROD_EASE，繃到 1 線斷（竿耗 ROD_BREAK），
  // ROD_IDLE 息不收魚就掙脫。雷雨天拿著竿，落雷有 ROD_BOLT_P 的機會落在你頭上。夜裡在深海行船，每 FLY_GAP 息有 FLY_P 的機會一尾文鰩魚飛上船
  const GRAIN_NEW = 45, GRAIN_OLD = 180, CUT_NEW = 0.7, CUT_OLD = 0.85;   // 時令（v0.9.19）：收了不到四十五日的穀是新穀，菜的增益少三成；放過一百八十日是陳穀，只少一成五（「不時，不食」）
  const MEAL_FU_CAP = 15;   // v0.9.19 使用者定：「服了？服了！」只容十五頓增益（烤奇魚、五穀的菜），吃第十六頓前要按兩次
  const SNOW_CALM_NIGHTS = 10;   // v0.9.18：開局頭十天下雪的夜裡沒有魄（`snowCalm()`）
  const ROD_REACH = 4, ROD_SHORE = 2, ROD_WAIT = [5, 12], ROD_BITE = 1.2, ROD_STA = 3, ROD_PRESS = 0.34, ROD_PULL = [1.2, 2.8], ROD_TUG = [0.2, 0.38], ROD_EASE = 0.45, ROD_IDLE = 6, ROD_BREAK = 8, ROD_BOLT_P = 0.5;
  const DEEP_PLAIN = 0.75, PLAIN_FISH = { n: '魚', reels: 1 };   // v0.9.18：深海垂釣七成五是淺水的魚、兩成五是深海魚
  const ROD_SAN = 1, FLY_GAP = 20, FLY_P = 0.04, LAYER_NAME = { shallow: '近岸的淺水', mid: '中層', deep: '深海' };
  const GALE_TEXT = '人會被往風向吹（陸上一格、海上兩格，每十息最多兩回），墟可能被吹倒、稻草人可能被吹走；三十八格以內的屋子裡吹不著。';
  // 魄（v0.5）：手裡的光被吹熄後 SNUFF_TIME 息才點得著；魄兩格內燈帽的蠟燭燒 HAT_GHOST_BURN 倍；
  // 屋裡（covered）沒燈、ROOM_DREAD_R 格內有魄，愜意每息掉 ROOM_DREAD；第 GHOST_FAST_NIGHT 夜起每四夜魄快一成，最多快 GHOST_FAST_MAX 倍
  const SNUFF_TIME = 8, HAT_GHOST_BURN = 3, ROOM_DREAD = 0.5, ROOM_DREAD_R = 8, GHOST_FAST_NIGHT = 20, GHOST_FAST_MAX = 2;
  // 彈弓（v0.5.2）：九格內、面前五十度、一下六（再乘攻擊倍率）、間隔 0.8 息、一顆石子；被打的獸惱 PROVOKE_TIME 息；站在台上越得過磚
  // 台：撲上來的獸撞在台邊，掉命上限的 PLATFORM_RECOIL、慢 PLATFORM_SLOW 息
  const SLING_RANGE = 9, SLING_DMG = 6, SLING_CD = 0.8, SLING_PREY = '鹿狸虎豹狼蛇蛛蟾鷹龜蜃豬牛齒雕豨畢', PROVOKE_TIME = 20, PLATFORM_RECOIL = 0.1, PLATFORM_SLOW = 5;
  const SAN_REST = 0.1, CONTENT_AT = 90;   // 飽、暖、力都在九成以上：愜意不掉，反而每息回 0.1×倍率（v0.5.1）
  const CRUSH_PEBBLES = 2, STONE_TOOLS = ['石刀', '石鎬', '石鋤', '石劍', '石斧'];   // 舊石器磨回石子（v0.6.4）
  const FARM_KINDS = '鎬鋤斧';
  const PATH_R = 40, PATH_NODES = 6000;   // 滑鼠點格子走過去（v0.6.5）：找路只在人四十格內、最多試六千格   // 具欄分兩段（v0.6.4）：武器（刀、劍、彈弓、神兵）在前、農具（鎬、鋤、斧）在後，共用原來的格數；P 換武器、O 換農具
  const REGRIND_CAP = 8, MEND_STA = 3, CAST_COST = [1, 2, 4, 7];   // CAST_COST：撒一網網到 0／1／2／3 條以上各耗幾點耐久   // 1、2、4、8 法則的上限：重磨的石子、加固漁網的棉麻（MEND_STA 是面向網按 F 加固的耗力）                      // 同一把工具重磨：第一次石子一、再來二、四、八，八為上限（rg 記在那把工具上）
  const CLOTH_FUEL = 50;                      // 舊布製品（內襯、布褲、布甲、布帽、布靴）丟進灶裡當柴：一件五十息（v0.5.1 前一百二十）
  const FAT_P = 0.35, OIL_PER_BAG = 8;   // 斃野豬、野牛得一份油脂的機會（真隨機；v0.6 是 25%，v0.8.3 改 35%）；油脂要裝在麻布包裡，一包八份
  // 沼澤（v0.6）：站在沼上力每息多掉 BOG_STA（扣掉平常的回復，淨掉約一點五）、暖掉 BOG_WARM；力耗光就跟累倒一樣掉命。搭上棧就沒事
  const BOG_STA = 2.0, BOG_WARM = 0.6;
  // 窗（v0.6）：睡覺的屋子四面磚門窗裡，窗佔的比例到這幾檔，睡一覺愜意多回幾成（基本 +20）；比例由使用者裁定
  // v0.6.2 使用者定：窗數 ÷ 屋內面積大於 1/9、1/7、1/5，當次睡眠愜意多回 5%、12%、20%；而且之後一整天愜意回得快 5%（SAN_BOOST）
  // 人造物可以直接放在草、花、田、路上（v0.6.2）：一半機會順手收到底下的草、花或土
  const GREEN = '草花田路', GREEN_P = 0.5, GREEN_YIELD = { '草': '草', '花': '花', '田': '土', '路': '土' };
  const SLEEP_SAN = 20, WINDOW_SAN = [[1 / 5, 0.20], [1 / 7, 0.12], [1 / 9, 0.05]], SAN_BOOST = 0.05;
  const KILL_ONLY_LEVEL = 22, KILL_DAY = 0.8, KILL_NIGHT = 1.05;   // 廿二重起膽氣只從斃敵對生靈得來（製作採集讀碑都不長）；斃敵的膽氣白日八成、夜裡加半成（四捨五入）
  const WARN_LIGHT = 0.5, WARN_POP = 0.25;    // 五條數值不到五成亮燈、不到四分之一彈窗提醒（回到五成以上才會再提醒）
  const WEAR_CAP = 6, REPAIR_WM = 1.5, HAT_FUEL = 400;
  const RENEW_AT = 0.5;   // 有耐久的東西（衣甲、工具、漁網、燈帽）要用過一半（剩不到五成）才能翻新、修補、重磨、加固（v0.7.1 使用者定）
  // 修鐵器與鎢鋼器（v0.6.3 使用者定）：同一件第 n 次修。鐵器（鐵甲盔靴、鋼具）鐵 1、2、4、8；鎢鋼器（鎢鋼甲盔靴、鎢鋼具）鐵一、鐵二、鐵三鎢鋼一、鐵六鎢鋼二；之後都照最後一檔
  const IRON_FIX = [1, 2, 4, 8], TUNG_FIX = [{ '鐵': 1 }, { '鐵': 2 }, { '鐵': 3, '鎢鋼': 1 }, { '鐵': 6, '鎢鋼': 2 }], GOD_FIX = 2;   // 神兵修理是鎢鋼的兩倍（料、力、飽，v0.6.5）
  // 魄煙滅（v0.6.5 使用者定）：夜裡人在屋外，地上的光或龍每煙滅一隻魄，膽氣長「這一重」的 1%（比例，不乘難度）；燈帽每煙滅一隻少兩息
  const GHOST_COUR = 0.01, GHOST_HAT_COST = 2;
  const FOG_TOLL = 0.1, FAN_REACH = 3;
  // 海：船分孤帆與方舟（大小、命、船頭首骨格數在 G.SHIPS）。修船每次回滿命的 SHIP_REPAIR_FRAC，第 n 次修要 n 塊木板。
  // 船毀了落水，SWIM_TIME 息內游上岸，否則溺死；游泳時飽、愜意、力的消耗 ×SWIM_DRAIN、力不回反掉，武器傷害 ×SWIM_DMG。
  // 燭龍焚溟在船上揮，自己的船也挨傷害的 GOD_SELF；膽氣不滿 SEA_WARN_LEVEL 重（卅一重，神兵的門檻）出海先問；讀檔時海上還有沒解決的蜃，膽氣減 SEA_PENALTY 重
  // v0.8 東海青龍：帶蜃珠求教過，孤帆、方舟（停著的也算）自己回命，SHIP_MEND_DAYS 日回滿
  const SHIP_MEND_DAYS = 2;
  // v0.8.2（使用者定）：小龍、小虎、雛鳳不是跟著走的生靈，是右上角膽氣環外面那圈「魂環」的三分之一（青龍、朱雀、白虎各一）；
  // 青龍另給「水性」：落水的倒數走得慢四分之一（SWIM_AZURE，六十息撐八十息）；以後魔王戰的溺傷也減四分之一
  const SWIM_AZURE = 0.75;   // v0.8.3：水性另把落水的減益減半（swimK()：三項掉得快的倍數、力往下掉、步子慢、武器打折都只算一半）
  // v0.8.2 落水：倒數歸零時，囊裡有木板就抱一塊，多撐 PLANK_SWIM 息（一塊一塊用）
  const PLANK_SWIM = 8;
  // v0.8.3 落水時放船下水（使用者定）：選中囊裡的孤帆或方舟按 F，撐 DEPLOY_SEC 息（簡單三、一般四、困難五）才上得了船，這段時間照樣倒數、一動就前功盡棄；
  // 一回落水（到上岸為止）最多放 DEPLOY_MAX 艘；船身每格都要是水、沒被別的船佔著
  const DEPLOY_SEC = { easy: 3, normal: 4, hard: 5 }, DEPLOY_MAX = 3;
  // v0.8.19 使用者定：船不佔囊，放在右下角的船艙，身上最多帶 HOLD_MAX 艘（在海上也一樣）；修船照 SHIP_FIX：第 n 次的料、最多幾次、每次修回命上限的幾成（簡單照一般）
  // v0.8.21 使用者定：深水加速還要方圓 SEA_CLEAR 格裡沒有蜃（獸首骨把蜃嚇到八格外）；方圓 SHIP_CAP_R 格裡最多停 SHIP_CAP 艘船、大魔王地界裡最多 SHIP_CAP_BOSS 艘，再放一艘就是最早下水的那艘消失（先說一聲）
  const SEA_CLEAR = 7, SHIP_CAP = 4, SHIP_CAP_R = 30, SHIP_CAP_BOSS = 3;
  // v0.8.21 使用者定：傳送。第一次親自踏上一處地界或外島，就在島心附近立一棵（東邊的地界扶桑、西邊的若木，其餘建木；龍淵、洞庭這種全是水的，傳送點在水的正中、沒有樹）；
  // 惜字亭與各處的樹互傳：面向按 E 選一處，耗符紙一、力十、飽八；魔王戰中、試煉中、落水、在船上不能傳；還沒斃的大魔王的地界傳不進去；傳到水上要從船艙選一艘船
  const GATE_COST = { sta: 10, food: 8 }, GATE_GLYPH = { '扶桑': '桑', '若木': '若', '建木': '建' }, GATE_EAST = ['修蛇', '青龍'], GATE_WEST = ['封豨', '白虎'];
  const RENAMED = { '大船': '孤帆', '蜃碎片': '蜃殘體', '橋': '棧', '彤弓素矰': '青冥落羽' };   // v0.4 的大船就是現在的孤帆；v0.8.4 蜃碎片改叫蜃殘體；v0.8.22 橋併進棧；v0.8.31 對空神兵改名
  const renameItems = (list) => { for (const it of list || []) if (it) { if (RENAMED[it.n]) it.n = RENAMED[it.n]; if (it.store) renameItems(it.store); } };   // 櫃與灶裡裝著的也一併改
  const SAIL_FAST = 2.5, SHEN_NEAR = 48;   // v0.9.6 使用者定：船快 2.5 倍；海上浮著一頭蜃（四十八格內，走遠到這麼外蜃就散了）就退回原本的速度；還沒斃的大魔王地界裡也不快（照 DEEP_SAIL 的規矩）
  const WALK_FAST = 1.5, WALK_SAFE_R = 4;   // v0.9.8 使用者定：方圓四格裡沒有敵對生靈、不在還沒斃的大魔王地界裡，走路快五成（石頭樹木這些慢的地上也照乘）
  const HOLD_MAX = 3, DEEP_SAIL = 1.8, NEST_HINT_R = 160;   // v0.9.5 紙縮成 1600：遠處指路從二百五十格縮成一百六十格（照紙的比例）
    // DEEP_SAIL：深水上、船頭有獸首骨鎮著、不在大魔王地界裡時船快幾倍（v0.8.20）；NEST_HINT_R：離巢穴這麼遠就先說在哪個方位（至少是地界的兩倍遠）
  // v0.8.27 使用者定：荷包一律落在原點附近，重生後 PURSE_DAYS 日內（不算死的那一天）沒取就沒了；第三版的傳送點走到 GATE_LIGHT 格內點亮；
  //   v0.8.28 使用者定：荷包五日內（PURSE_MERGE）又死一回，這回的東西併進那個荷包，一個荷包最多 PURSE_KEEP 回的遺物（多了擠掉最早那回）；每點亮一處傳送點膽氣 GATE_COUR；
  //   v0.8.29 使用者定：五日照死的日期比；大陸塊不再給膽氣，傳送點只給 GATE_COUR=6、廿二重以後也給；地界外那一圈第一個點亮的傳送點就叫那處地界的名字，第二個才挑；
  //   陸塊與傳送點不打字取名，從 glyphs.js 的地名池（namePools）挑——陸塊的池子先放《海內十洲記》的十洲三島（玄洲是玄武的地界，不放）；池子用完了照地貌取「赤島二」這類
  const PURSE_DAYS = 18, PURSE_MERGE = 5, PURSE_KEEP = 3, GATE_COUR = 6, GATE_LIGHT = 3, GATE_NAMES = { '建': '建木', '桑': '扶桑', '若': '若木', '津': '海津' };
  const MASS_KIND_NAME = { '漠': '沙', '火': '赤', '川': '川', '雪': '雪', '青': '青' }, NAME_PICK = 12;   // NAME_PICK：取名框一批給幾個名字（v0.8.28 八個；v0.8.29 使用者要多一些）
  const PANELS = ['help', 'craft', 'map', 'journal', 'read', 'chest', 'stove', 'ding', 'purse', 'tele', 'shipui', 'nong', 'tutor', 'xfer'];   // 開著就停住遊戲的面板（v0.8.30）；彈窗與說話視窗本來就停
  const NAME_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'], NAME_KEY_LABEL = '1234567890-='.split('');   // 一批十二個對著鍵盤最上一排
  const SHIP_FIX = {
    '孤帆': { cost: [{ '木板': 2 }, { '木板': 4, '鐵': 1 }, { '木板': 5, '鐵': 3 }, { '木板': 7, '鐵': 5, '鎢鋼': 1 }], to: { easy: 0.9, normal: 0.9, hard: 0.75 } },
    '方舟': { cost: [{ '木板': 3, '鐵': 2 }, { '木板': 6, '鐵': 6 }, { '木板': 10, '鐵': 7, '鎢鋼': 1 }], to: { easy: 0.85, normal: 0.85, hard: 0.7 } },
  };
  // 魔物誌（v0.8.2 起；v0.8.3 使用者定：所有大型魔物都寫進去，一隻一張卡）：斃了第一頭蜃才翻開；遇過的卡寫出處一句、本事三句、在哪，
  // 沒遇過的蓋著，只留一句聽來的話。不寫盡，留點神祕。分四組：小魔王、神獸、大魔王、終極
  const seenIt = (t) => (p) => p.creatures.indexOf(t) >= 0;
  const CODEX = [
    { id: '蜃', ch: '蜃', ink: '#b4392a', name: '蜃', group: '小魔王', seen: (p) => !!(p.codex && p.codex['蜃']), from: '《史記·天官書》：「海旁蜃氣象樓臺。」', note: ['海上的大蜃，吐氣成霧，霧裡見樓臺。', '撞船；船頭的獸首骨鎮得住牠。', '斃之得蜃殘體，九塊在鼎裡熬成蜃珠。'], where: '行船時從深海浮上來', hint: '海上起霧的時候。' },
    { id: '鑿齒', ch: '齒', ink: '#6b4a2f', name: '鑿齒', group: '小魔王', seen: seenIt('齒'), from: '〈海外南經〉：「羿與鑿齒戰於壽華之野……羿持弓矢，鑿齒持盾。」', note: ['齒長如鑿，手裡一面盾；命六百五十（照難度加到七百至九百），一撞二十一。', '面朝哪邊盾就在哪邊：正面三格打上去只有一成傷。牠一息多才轉一回身，繞到身側背後打。', '斃之得鑿齒殘體一或二塊，九塊加鐵三、鎢鋼一，在鼎裡鑄成虎符。'], where: '西邊的陸上（那一塊地域的中心在本島以西一百九十格外）', hint: '西邊的島上有鑿石頭的聲音，那不是人。' },
    { id: '蠱雕', ch: '雕', ink: '#4a4f5c', name: '蠱雕', group: '小魔王', seen: seenIt('雕'), from: '〈南山經〉：「其狀如雕而有角，其音如嬰兒之音，是食人。」', note: ['像雕，頭上有角；命五百二十（照難度加到六百至八百）。', '啼聲像嬰兒，聽了心裡發慌（心：愜意掉，懼得一息多出不了手）。', '從天上撲下來抓人（力十六），抓完又飛回高處；撲下來貼著你時才打得到，天上只有彈弓。斃之得蠱雕殘體，九塊加精煤一、火蝕一煉成朱羽。'], where: '南邊的海上與陸上空（本島以南一百九十格外）', hint: '南海上，有嬰兒在哭。' },
    { id: '畢方', ch: '畢', ink: '#24766b', name: '畢方', group: '小魔王', seen: seenIt('畢'), from: '〈西山經〉：「其狀如鶴，一足，赤文青質而白喙……見則其邑有訛火。」', note: ['像鶴，一隻腳，青底朱紋；一跳兩格，命六百（照難度加到七百至九百），貼著啄一下十四。', '落腳的地方就起訛火，踩上去灼傷（每息三，七息後熄）；隔一陣一聲鳴，你身邊三處先冒圈，一息後燒起來。', '斃之得畢方羽一或二根：畢方羽六、鎢鋼三、竹六、麻布三，膽氣卅一重造得出對空神兵青冥落羽。'], where: '火島；大陸上火山的地域', hint: '火島上的火，有時不是熔岩燒的。' },
    { id: '青龍', ch: '龍', ink: '#24766b', name: '東海青龍', group: '神獸', seen: seenIt('青龍'), from: '《禮記·曲禮上》：「行，前朱鳥而後玄武，左青龍而右白虎。」', note: ['四象之東，盤在東海。', '要一顆蜃珠才肯教。', '教的是水性：船自己回命，落了水撐得久、苦頭減半。'], where: '龍淵，本島往東約三百八十格的深海', hint: '洞裡留下的那片青鱗，指著東方。' },
    { id: '白虎', ch: '虎', ink: '#7f8ea3', name: '西方白虎', group: '神獸', seen: seenIt('白虎'), from: '《禮記·曲禮上》：「左青龍而右白虎。」', note: ['四象之西，伏在虎嶺島心。', '認的是虎符；沒帶虎符走到六格內，牠一聲嘯，地跟著抖（震）。', '教的是抗震：從地上傳來的震少四分之一；魂環的虎魄上多一顆十字星。'], where: '西方的虎嶺', hint: '西邊有一聲嘯，地跟著抖。' },
    { id: '朱雀', ch: '雀', ink: '#c0392b', name: '南方朱雀', group: '神獸', seen: seenIt('朱雀'), from: '《禮記·曲禮上》：「前朱鳥而後玄武。」朱鳥就是朱雀。', note: ['四象之南，棲在丹穴。', '認的是朱羽；沒帶朱羽，牠就飛開，總離人五格以上。', '教的是氣順：窒與心的傷害少四分之一；魂環的鳳翎上多一顆十字星。'], where: '南方的丹穴', hint: '南邊的火裡，有一團不燙人的紅。' },
    { id: '玄武', ch: '龜', ink: '#1c1a17', name: '北方玄武', group: '神獸', seen: seenIt('玄武'), from: '《禮記·曲禮上》：「前朱鳥而後玄武。」', note: ['四象之北，龜與蛇。', '不收信物，要你去取經，四次。', '知道這張紙為什麼歪。'], where: '北海的玄洲', hint: '北海上的洲，島心有一塊石頭很久沒動。' },
    { id: '修蛇', ch: '蛇', ink: '#2c3b2a', name: '修蛇', group: '大魔王', seen: seenIt('修蛇'), from: '《淮南子·本經訓》：「斷修蛇於洞庭。」', note: ['一個蛇頭，後面拖著六個尾；命二千四（照難度加到二千七至三千五）。打尾只吃四分之三，牠命剩一半以下只剩四分之一。', '潛蹤：潛下去打不到；冒泡的地方，一息半後牠浮上來撞船。長蛇纏舟：船四息動不了，纏著時打頭多吃五成。', '吞象：面前三格寬、四格長一口（溺），岸上離水兩格也搆得到；命剩一半起吐毒涎。方舟進洞庭命上限降到三分之二，一場最多三艘船。'], where: '東極的洞庭', hint: '東極那片大水裡，有東西在纏船。' },
    { id: '封豨', ch: '豨', ink: '#5a3e2b', name: '封豨', group: '大魔王', seen: (p) => p.creatures.indexOf('豨') >= 0 || !!(p.codex && p.codex['封豨']), from: '《淮南子·本經訓》：「禽封豨於桑林。」', note: ['二乘二的大豬，命二千（照難度加到二千二至二千九），頭上一圈鬃，越惱鬃越多（三、五、六個，剩三成全紅）。', '豕突：蓄一息多、直衝十格（力四十）；拱地：震一圈圈傳開（震二十二，棧與船上不受）；貼著撞（力二十）。台擋不住牠：牠拱得動台。', '命剩六成去吃桑回命，吃的時候打牠就吃不成；剩一半起叫野豬（群豕）。'], where: '西極的桑林（地界方圓一百格）', hint: '西極的桑林裡，地在抖。' },
    { id: '大風', ch: '風', ink: '#5b6b7a', name: '大風', group: '大魔王', seen: seenIt('大風'), from: '《淮南子·本經訓》：「繳大風於青丘之澤。」', note: ['在天上是風，撲下來是鳥；命一千六（照難度加到一千八至二千三），在天上只有彈弓與青冥落羽打得到，撲下來貼著你那一下才近得了身。', '入木三分：一抓一分——鎖喉（窒）、再加懼、深懼；扶搖把人拋出去、轉暈（亂）。', '摧屋拔木：一陣狂風吹垮屋子、拔起樹；命剩一半起飛沙走石。青丘海多，牠就弱一點（陸海比，最多少一成四）。'], where: '南方的青丘之澤（地界方圓一百格）', hint: '南邊的沼澤上，屋頂一片片掀起來。' },
    { id: '共工', ch: '共', ink: '#b4392a', name: '共工', group: '終極', seen: seenIt('共工'), from: '《淮南子·天文訓》：「怒而觸不周之山，天柱折，地維絕。」', note: ['人面蛇身，朱髮。三副樣子：入地如水、扛柱吸人、壓天亂心；換的時候現出本相。', '古書各記一段，誰因誰果說不準；這張紙上，玄武說紙是他撞歪的。', '凡鐵只傷得了他三分之一；三副樣子各要對的神兵。'], where: '西北的不周山', hint: '紙往西北翹起來了。' }
  ];
  const CODEX_GROUPS = ['小魔王', '神獸', '大魔王', '終極'];
  // v0.8.5 傷害分質（設計稿〈一〉）：力是近身的撲咬撞啄，衣甲減；震從地面一圈圈傳來，隔著磚也到，站在台、棧或船上不受，白虎的抗震減四分之一；
  // 窒、心（以後的大風、共工）朱雀的氣順減四分之一；溺青龍的水性減四分之一；灼是熔岩、訛火。死在神獸、魔王、共工手上，膽氣只掉四成（BIG_DEATH；v0.8.5–v0.8.12 是一半）。
  const HURT_KINDS = '力震窒心溺灼', QUAKE_SAFE = '台棧', RESIST = 0.25, BIG_DEATH = 0.6, DEATH_KEEP = 0.4, LAST_HIT_T = 5;
  // 玄甲（v0.8.34 使用者定）：斃了一隻大魔王的影子、取到牠的經，玄武給一層玄甲，罩在衣甲外；每層震窒心溺灼各減 XUAN_STEP，三隻最多三層。拿了玄甲就沒有「服了？服了！」
  const XUAN_STEP = 0.05;
  const SHIP_REPAIR_FRAC = 0.25, SWIM_TIME = 60, SWIM_DRAIN = 2, SWIM_DMG = 0.75, SWIM_STEP = 0.32, GOD_SELF = 0.1, SEA_WARN_LEVEL = 31, SEA_PENALTY = 5;
  // 獸首骨：殺虎豹狼有 SKULL_P 的機會掉，掉一個或兩個（SKULL_TWO 的機會兩個）；放在船頭鎮船，日數見 ITEMS 的 ward，各鎮各的、到期風化，船頭格數見 G.SHIPS
  const SKULL_P = 0.16, SKULL_TWO = 0.3;   // v0.5.1：掉首骨的機會 16%、真隨機（原 35%）
  // v0.8.1 蜃珠（使用者定）：斃蜃掉蜃殘體一或二塊（SHARD_TWO 的機會兩塊，真隨機）；九塊加配料在火旺的鼎裡熬一顆蜃珠，PEARL_P 的機會成（真隨機）；
  // 不成就退回殘體（困難只退八塊），配料不退。v0.8.2：「熬」字底下四點——海水瓶三（PEARL_BRINE）、淡水瓶一（PEARL_FRESH）；
  // 成了四個空瓶退回來，不成鼎裡炸了、四個瓶都碎
  const SHARD_TWO = 0.36, PEARL_SHARDS = 9, PEARL_P = 0.83, PEARL_BRINE = 3, PEARL_FRESH = 1, PEARL_STA = 6;
  // v0.8.5 白虎這一路：鑿齒在西邊的外島（島心在本島以西 TOOTH_WEST 格外）走出來；正面打在盾上只吃 TOOTH_SHIELD；
  // 鑿齒殘體九塊加鐵三、鎢鋼一，在火旺的鼎裡鑄虎符（成不成同蜃珠）；白虎沒見到虎符就嘯，震傷看難度
  const TOOTH_WEST = 190;   // v0.9.5 紙縮成 1600：鑿齒的西邊從三百格外改成一百九十格外（使用者定）
  const TOOTH_SHIELD = 0.1, TALLY_IRON = 3, TALLY_TUNG = 1, TALLY_STA = 6, TIGER_ROAR = { easy: 4, normal: 6, hard: 8 };
  // v0.8.6 朱雀這一路：蠱雕在南邊（人在本島以南 HARPY_SOUTH 格外）的海上與外島上空；啼一聲是心（愜意掉、懼 HARPY_FEAR 息出不了手）；
  // 鑿石頭 FLINT_P 的機會出燧石；殘體九塊加料在火旺的鼎裡煉信物（TOKENS，成不成同蜃珠）
  // v0.8.7 大魔王與戰鬥的規矩（設計稿〈三〉〈四〉）：走進魔王的地界（BOSSES[].r）先問一聲；戰中鎖難度；護駕：簡單、一般命只剩一點時鎖血 GUARD.lock 息
  // （一場一次，只認魔王打的），鎖完同一屬性、求教過的神獸（BOSSES[].guard）擋 GUARD.guard 息（魔王打不到你，命每息回 GUARD_REGEN）——靠了神獸就不算獨力；
  // 獨力斃大魔王記成就（寫明難度與加成），將來的共工照獨力斃了幾隻加強 SOLO_BUFF。
  // v0.8.9 使用者定：取經只是不讓大魔王變強。這一輪沒取經就闖地界（按「進去」），剩下的大魔王都加 BUFF_STEP（照最初的數值加，不連乘；這一輪只加一次，永久累積），
  // 指定要先斃這一隻：別的大魔王打不死（命鎖在一點）、玄武也不給取經；只有認輸（暫停面板按兩次）才取消這一層（v0.8.13 起死了也取消）——認輸膽氣剩 SURRENDER_KEEP、神兵耐久掉 GOD_WEAR，
  // 送回地界外。走出地界不算認輸：魔王回窩養傷，戰事還掛著（難度照樣鎖著）。斃了大魔王得戰利品（BOSSES[].trophy，不佔囊，帶給玄武看）
  // v0.8.10 使用者定：一場挑戰從按「進去」起算，認輸才散（走出地界還掛著）；時限見 DIFF.*.bossT，到了照認輸罰（判負）。v0.8.12 使用者定：死了這一場就結束（不算同一場）
  const BOSSES = { '封豨': { zone: '封豨', glyph: '豨', r: 100, cour: 200, place: '桑林', feat: '禽封豨於桑林', line: '「禽封豨於桑林。」（《淮南子·本經訓》）', guard: 'bai', noPlatform: true, trophy: '豨牙', trophyUnit: '枚', trophyText: '封豨的一枚獠牙，比人的手臂還長。', meat: ['肉', 8], enter: '地在抖，林子深處有東西在刨土。' },
    '修蛇': { zone: '修蛇', glyph: '修蛇', r: 120, cour: 200, place: '洞庭', feat: '斷修蛇於洞庭', line: '「斷修蛇於洞庭。」（《淮南子·本經訓》）', guard: 'azure', water: true, trophy: '修蛇骨', trophyUnit: '節', trophyText: '修蛇的一節脊骨，比船槳還長。', meat: ['蛇肉', 8], enter: '湖面一下子靜了，水底下有一長條影子在動。' },
    '共工': { zone: '共工', glyph: '共工', r: 150, cour: 400, place: '不周山', feat: '立四極', line: '「怒而觸不周之山，天柱折，地維絕。」（《淮南子·天文訓》）', guard: 'mode', gong: true, trophy: '朱髮', trophyUnit: '綹', trophyText: '共工頭上的一綹朱髮，捏在手裡還是燙的。', meat: null, enter: '盆地裡一點風也沒有，地在腳底下慢慢翻身。' },   // v0.9（設計稿〈七〉〈十四〉）：終極魔王；三魂環集齊才進得去；護駕照當下的模式換；命與傷害乘 gongK()
    '大風': { zone: '大風', glyph: '大風', r: 100, cour: 200, place: '青丘', feat: '繳大風於青丘之澤', line: '「繳大風於青丘之澤。」（《淮南子·本經訓》）', guard: 'zhu', sky: true, trophy: '風羽', trophyUnit: '根', trophyText: '大風的一根翎羽，比人還高，拿在手裡自己會動。', meat: ['肉', 8], enter: '澤上的草一齊倒向一邊，天上有一團影子在轉。' } };   // v0.8.25 大風：在天上，sky 的魔王在天上生、只有彈弓與對空神兵打得到天上的牠   // v0.8.16 修蛇：只在水裡；water 的魔王在水裡生、方舟進來命上限降到三分之二、一場最多三艘船
  const SNAKE_SHIPS = 3, ARK_CAP = 2 / 3;   // v0.8.16 使用者定：洞庭這一場最多用三艘船；方舟進了修蛇的地界，命上限降到三分之二（孤帆不變）
  // v0.8.21 使用者定：每一回沒拿這一隻的經就闖（沒經、拿錯經），牠與剩下的大魔王都加 BUFF_STEP（兩成，照最初的數值加，斃了就永久留著，死了或認輸取消這一層）；
  // 沒經照樣斃得了、得戰利品與魂環，那顆珠打黑叉；v0.8.22 使用者定：拿錯經也斃得了，斃了的那顆打黑叉，手上那一卷的紅圈不變。
  // 玄武的試煉：每一個黑叉影子加 TRIAL_STEP（v0.8.22 從三成降到兩成五）；六成的影子隨你打幾回，九成的有黑叉時一卷最多 TRIAL_TRIES 回（v0.8.24 使用者定：三隻大魔王的卷 TRIAL_TRIES_BOSS 十回，共工的立極（v0.8.34 起叫這個名字，原本暫名究極試煉） TRIAL_TRIES 三回）。
  // v0.8.22 使用者定：經卷一隻只取一次、一次只拿一卷，拿著它斃了那一隻就化作塵埃；取過經、斃過的，影子照樣能打（練手，不給經、不給膽氣）。
  // 四顆珠照魔王排（BEADS：封豨、大風、修蛇、共工）；魂環是斃大魔王的戰利品（RING：修蛇龍魂、封豨虎魄、大風鳳翎）
  const BOSS_EXIT = 6, BUFF_STEP = 0.2, TRIAL_STEP = 0.25, TRIAL_TRIES = 3, TRIAL_TRIES_BOSS = 10, SURRENDER_KEEP = 0.7, GOD_WEAR = 0.2, GUARD = { easy: { lock: 3, guard: 10 }, normal: { lock: 1.5, guard: 6 } }, GUARD_REGEN = 4, SOLO_BUFF = [0, 6, 15, 30];
  const GUARD_NAMES = { azure: ['青龍', '龍'], bai: ['白虎', '虎'], zhu: ['朱雀', '雀'] };
  // 共工（v0.9，使用者定，設計稿〈十四〉）：時限是大魔王的 GONG_TIME 倍；護駕照當下的模式（GONG_GUARD）；對的神兵（GONG_GOD）全傷、錯的 GONG_WRONG、非神兵 GONG_IRON；
  // 換模式的本相那幾息，對的 GONG_SHIFT_RIGHT、錯的照舊、非神兵 GONG_SHIFT_IRON。九閽鳴雷打中他，GONG_NOPULL 息內拖不動你。
  // 海模式游過的地化成淖：MUD_T 息淖、MUD_DRY 息泥，再回原字；站在淖上慢 MUD_SLOW（像沼）、武器打七五折、命頭三息每息 −1、再三息 −2、之後 −3（溺；設計稿〈一〉液化的地）
  const GONG_TIME = 1.25, GONG_GUARD = { sea: 'azure', land: 'bai', sky: 'zhu' }, GONG_GOD = { sea: '焚', land: '鎚', sky: '弋' }, GONG_MODE_NAME = { sea: '海', land: '陸', sky: '空' };
  const GONG_WRONG = 0.3, GONG_IRON = 1 / 3, GONG_SHIFT_RIGHT = 1.5, GONG_SHIFT_IRON = 0.1, GONG_NOPULL = 7, GONG_HINT = { sea: '氵', land: '土', sky: '風' };
  const MUD_T = 12, MUD_DRY = 6, MUD_SLOW = 0.35, MUD_ATK = 0.75, MUD_HURT = [[3, 1], [6, 2], [Infinity, 3]], MUD_REST = 2, BURN_T = 20, GONG_TILT = 3;
  const ZERO_MS = 5000, MINI_TYPES = '蜃齒雕畢', MINI_BAR_R = 20;   // v0.8.21 使用者定：斃了命條歸零停五秒；小魔王（蜃、鑿齒、蠱雕）各自一條命條，二十格內的才列
  const GONG_ABSENT = 1.2, BEADS = ['封豨', '大風', '修蛇', '共工'], RING = { '修蛇': ['q', '龍魂', '青龍', 'azure'], '大風': ['z', '鳳翎', '朱雀', 'zhu'], '封豨': ['b', '虎魄', '白虎', 'bai'] };   // v0.8.21 使用者定   // 修蛇是青龍、封豨是白虎、大風是朱雀（v0.8.9：同一屬性的才護駕）
  // v0.8.8 玄武取經（設計稿〈五〉）：玄武伏在玄洲島心，兩格內按 E 取經。四顆珠照順序用：斃了幾隻大魔王就輪到第幾顆；斃之前取過這一卷是朱紅，
  // 沒取就打叉，p.puppet 記錯過幾卷（v0.8.33 使用者定：原本的「玄武偶」就是後來的影子，不另做，錯過的卷數照黑叉加在影子上）。取經是一場試煉：照你要去打的那隻，玄武吐一個墨寫的影子（命與傷人照真身打折，v0.8.10 起見下；招式照真身），
  // 斃了影子這一卷才算取到；走出玄洲 JING_EXIT 格外就算沒取成，不罰。第一次見玄武，牠說紙在歪，叫你回出生的地方許願：
  // 出生點 PAVILION_R 格內立起一座惜字亭（照原本的底稿找平地、四周八格都走得過，不擋路），面向它按 E 許願
  // v0.8.10 使用者定：經卷認一隻（p.jingFor），拿錯了進地界先提醒、執意闖入算沒取經（按兩次）；再取一卷就換成新的那一卷。影子分六成、九成（SHADE_K：命與傷人都照真身），
  // 只斃了六成的也取得到經，取到時與進那隻的地界時各提醒一聲（p.shade9 記斃過九成的）。影子不取人命：命剩一點時玄武收了影子、鎖命 TRIAL_LOCK 息（走進任何地界就不算），這一回沒過
  const JING = { '封豨': { scroll: '封豨卷', shade: '豨影', glyph: '豨', lines: [
    '豕突：腳下揚塵一息多，地上畫出要衝的那條路，就往旁邊讓。台擋不住牠：站在台上照樣撞上。',
    '拱地：蓄一息，震一圈圈傳到七格。牠拱得動台，站在台上照樣挨震；棧、船上不受；白虎教的抗震再少四分之一。',
    '荐食：命剩六成以下去啃樹回命。牠吃的時候，打掉牠命上限的百分之三就吃不成；先把附近的林子砍稀了，牠就沒得吃。',
    '群豕：命剩一半起叫野豬來，最多四頭。',
    '牠上不了台階、進不了屋；擋路的磚，牠會撞。'] },
    '修蛇': { scroll: '修蛇卷', shade: '蛇影', glyph: '修蛇', sea: true, lines: [   // v0.8.16 使用者選甲：蛇影在玄洲岸邊的海上，開船去打（岸上也打得到）
    '潛蹤：沉下去就打不到、看不見；冒「泡」的地方，牠一息半後浮上來撞船（船掉二十五）或撞人。看見泡就把船開走。',
    '長蛇纏舟：貼著船就纏上來，船四息動不了、每息掉八。纏著時頭露在外面，打頭多吃五成。',
    '吞象：頭抬起來，面前畫出一條三格寬、四格長的紅線，一息半後咬下去（溺，三十）；岸上離水兩格內也搆得到。',
    '毒涎：命剩一半起，六格內吐一口，落地一圈三格，中了照蛇毒。',
    '打尾只吃四分之三；命剩一半以下，打尾只剩四分之一——打頭。方舟進了洞庭，命上限降到三分之二；一場最多用三艘船。'] },
    '大風': { scroll: '大風卷', shade: '風影', glyph: '大風', sky: true, lines: [   // v0.8.25：風影在玄洲的天上
    '在天上：繞著你六到十格盤旋，近身的、九閽鳴雷與燭龍焚溟都搆不到，只有彈弓與青冥落羽打得到。青冥落羽射中，絲纏住牠兩息半（繳），落在地上，這時近得了身。',
    '俯衝：隔七到十息撲下來抓一下（力），抓完貼著你停一息多——那是近身打牠的時候。入木三分：一抓一分。一分鎖喉（窒：力與愜意一直掉，力光了掉命，窒著不能吃也不能睡），二分再加懼，三分深懼；十四息不再抓就從頭算。朱雀教的氣順少四分之一。',
    '扶搖：你腳下先捲起一團旋風（三乘三），一息多後把人拋出三格、轉得暈頭（亂：方向鍵轉九十度，兩息半）。看見腳下起旋，就走開。',
    '摧屋拔木：朝你吹一陣狂風，九格長、三格寬，先畫出風路，一息後吹到：人造的磚門窗墟吹垮、樹連根拔起，人在風裡挨一下、被推開兩格，坐在船上就打船。躲進屋裡，牠撲不下來，改吹屋子，吹得快一倍。',
    '命剩一半起，飛沙走石：你身邊三格內落五顆石，先畫出落點，一息內走開；屋頂擋得住。'] },
    '共工': { scroll: '立極卷', shade: '共工影', glyph: '共工', gong: true, lines: [   // v0.9.10 使用者定：立極是三段，共工影照命分三段，海 → 陸 → 空；三段打完才取到
    '換模式：真身每四十到六十息現一回本相（三乘三，八息不出招），後四息地上浮出提示——「氵」要換成海、「土」陸、「風」空。本相時換對神兵打，一倍半；凡兵只吃一成。百分之一換回原樣。',
    '海（氵）：潛在地裡游，地上只見朱髮劃過，身後兩格寬化成淖。貼著你時，你腳下先翻一息多，再從底下鑽出來（溺）、一格內翻身一撞（力）——腳下一翻就走開。鑽出來露在外面兩息，近身打。燭龍焚溟全傷。',
    '陸（土）：立成三格高的「工」。九格內每一息半把你往他那邊拖一格；九閽鳴雷打中他，七息拖不動你。兩格內頭觸（力）；每七息落三顆隕石，地上先畫「◎」，一息半後砸下（震），砸過的地焦二十息、踩上去灼。九閽鳴雷全傷。',
    '空（風）：浮在三到五格外，畫面跟著斜。力壓千鈞：地上一圈「壓」，兩息後還在圈裡就窒四息；星移斗轉：心，再亂三息。青冥落羽全傷。',
    '神兵不對只吃三成，凡兵只吃三分之一。淖上走得慢、兵器只剩七成五，站越久命掉得越快；淖十二息後凝成泥就不礙事。'] } };
  const SHARD_KINDS = ['蜃殘體', '鑿齒殘體', '蠱雕殘體'], BURN_SHARDS = 9, BURN_TUNG = 2;   // 惜字亭：九塊殘體換兩塊鎢鋼（v0.8.9 使用者定）
  const JING_LATER = {}, JING_SEA = 26, JING_EXIT = 6, SHADE_K = [0.6, 0.9], TRIAL_LOCK = 15, JING_COUR = 60, WISH_COUR = 20, PAVILION_R = [3, 12], WISH_TEXT = '「這張紙上的字，一個也不讓它化掉。」';
  const KEY2 = { name: '地維', unit: '截', line: '〈天文訓〉：「天柱折，地維絕。」' };   // 下一章的鑰（v0.9.11 使用者定：打完共工的都拿得到，還不還願都一樣；v0.9.12 使用者定名「地維」，入口在不周山）
  // 天柱下的碑（v0.9.13 使用者定：紙背照天圓地方的框架，經碑轉述——那孩子記先生的話；字由我擬，等使用者改）。斃了共工才立在不周山的盆地裡，讀起來是一張拓本：黑紙白字
  const PILLAR_STELE = { title: '天柱下', text: '先生說：天道曰圓，地道曰方。我問：天是圓的，紙是方的，四個角不就蓋不住了？先生笑了，說從前也有人拿這話去問曾子，曾子說：「如誠天圓而地方，則是四角之不揜也。」所以方圓講的不是樣子，是道理：圓的主明，方的主幽；明的吐氣，往外照，像火，像太陽；幽的含氣，收在裡頭，像水，像銅鏡。我把紙翻過來看。正面朝著天，紙白字黑；背面背著天，紙黑字白，像先生從碑上拓下來的那一張。這裡原本有一根柱子撐著天。柱子斷了，紙裂開一道縫，往背面去。我不敢下去。' };
  const NTH = '一二三四', GONG_GOD_NAME = { sea: '燭龍焚溟', land: '九閽鳴雷', sky: '青冥落羽' };
  const HARPY_SOUTH = 190;   // v0.9.5 紙縮成 1600：蠱雕的南邊從三百格外改成一百九十格外（使用者定）
  const HARPY_CRY = { easy: 3, normal: 5, hard: 7 }, HARPY_FEAR = { easy: 1.5, normal: 2.5, hard: 4 }, FLINT_P = 1 / 50;   // v0.8.9 使用者定：啼 3／5／7、懼 1.5／2.5／4 息
  const TOKENS = {
    '鑿齒殘體': { out: '虎符', need: { '鐵': TALLY_IRON, '鎢鋼': TALLY_TUNG }, verb: '鑄', unit: '枚', mark: '符', god: '白虎', place: '虎嶺', learned: 'bai', look: '一隻伏著的虎。', fail: '鼎裡的鐵水翻了，符沒鑄成', lost: '鐵與鎢鋼都熔掉了', hard: '熔壞' },
    '蠱雕殘體': { out: '朱羽', need: { '精煤': 1, '火蝕': 1 }, verb: '煉', unit: '根', mark: '羽', god: '朱雀', place: '丹穴', learned: 'zhu', look: '一根朱紅的羽，摸上去是溫的。', fail: '鼎裡騰起一團火，羽沒煉成', lost: '精煤與火蝕都燒掉了', hard: '燒壞' },
  };
  const SEA_GOD = '燭龍焚溟', SEA_FOLK = '蜃龜';   // 海中之物：燭龍焚溟全傷、九閽鳴雷減半；其餘反過來   // 霧障：不吹散就五樣數值各掉當前的一成（四捨五入，命不低於一）；扇子選中按 V 吹得到三格   // 衣甲損耗倍率封頂；修補後從 1.5 倍起算；燈帽一根蠟燭四百息
  const $ = (id) => document.getElementById(id);

  class Game {
    constructor(seed, save, diff, slot) {
      this.seed = seed | 0;
      this.slot = Math.min(SAVE_SLOTS, Math.max(1, (slot | 0) || 1));   // 存在哪一格
      this.test = TEST_SLOTS.indexOf(this.slot) >= 0 && (!save || !!save.test) && !(!save && Game.carryReal(this.slot));   // v0.9.14 自查：正式的一局在測試格渡海，開出來的新島照舊是正式的（帶過去的膽氣才算數）   // 測試格（v0.8.10）。v0.9.2：格子原本就有的正式存檔（沒帶 test）照常玩，不會變成測試格——正式服把第八格改成測試格時，玩家原本存在第八格的進度不受影響
      this.savedTo = {}; this.saveArm = 0;   // 暫停面板「存到」：這一局抄過的格與它的存檔時刻、等第二下的格
      this.diff = DIFF[(save && save.diff) || diff] || DIFF.normal;
      DAY = this.diff.day; World.setDay(DAY);   // 一日多長看這座島的難度（v0.6.10）；舊存檔的一日長度不同，讀進來由 world.restore() 換算
      this.moved = save ? Game.movePaper(save) : null;   // v0.9.5 使用者定：舊存檔（第一到第三版、2500 的紙）讀進來一律搬到第四版（1600 的紙）
      G.setGen(save ? ((save.world && save.world.gen) || 1) : G.GEN_NEW);   // v0.8.26 使用者定：舊存檔（沒寫 gen）照第一版生成；新開的島（含渡海開的新紙）用第二版（外島大一些、海上有孤嶼）
      this.world = new World(this.seed);
      this.ents = new Entities(this.world);
      this.world.playerLit = () => this.hasLight();   // 霧障躲光：玩家手裡或帽上的光也算
      this.world.roomLimitFor = (type) => type === '魄' ? this.diff.ghostRoom : this.diff.room;   // 小屋多小才擋得住，看難度
      this.world.rainLampP = this.diff.lampP;
      this.ents.bigHp = (b) => this.bigHp(b);   // 小魔王的命照難度加（v0.8.10）
      this.world.oreBlocked = (x, y) => (this.player.x === x && this.player.y === y) || !!this.ents.at(x, y);   // 鐵礦長回來時那格有人或生靈就等一等   // 雨裡屋外的燈多容易壞，看難度
      this.world.onDiscover = (pl) => this.discover(pl);
      this.world.onHail = (r) => {   // 冰雹（v0.9.19）：一起頭就說，砸壞了什麼一併說
        if (this.world.dryAt(this.player.x, this.player.y)) return;
        const lost = [r.crops ? '田 ' + r.crops + ' 格' : '', r.lamps ? '燈 ' + r.lamps + ' 盞' : '', r.scares ? '稻草人 ' + r.scares + ' 個' : ''].filter(Boolean);
        this.toast('冰雹', '雷雨裡夾著冰雹砸下來，一時辰才停：在屋外每兩息挨一下，快進屋（三十八格以內的屋子、洞窟砸不到）。' + (lost.length ? '屋外砸壞了：' + lost.join('、') + '。' : ''), 10000); SFX.fail();
      };
      this.world.onWeather = (on, kind) => {   // v0.9.15：雨、雪、雷雨，帶著狂風
        const W = this.world;
        const here = this.wxHere();
        if (W.dryAt(this.player.x, this.player.y)) {   // 人在乾地（大漠、火山）：雨雪不下，雷雨只打乾雷（v0.9.17）
          if (on && kind === 'thunder') this.toast('乾雷', '這一帶是乾地（大漠、火山），雨雪都不下，只打雷：雷照樣落在屋外，地上先亮一圈，一息後劈下來——看見就躲開。燈不會被澆壞。', 9000);
          else this.message(on ? '別處下起' + (kind === 'snow' ? '雪' : '雨') + '來；這一帶是乾地，滴' + (kind === 'snow' ? '雪' : '雨') + '不下。' : (kind === 'thunder' ? '乾雷停了。' : '別處的' + (kind === 'snow' ? '雪' : '雨') + '停了。'));
          this.wxLast = here; this.wxRain = W.rainUntil; return;
        }
        this.wxLast = here; this.wxRain = W.rainUntil;
        if (on) this.toast(kind === 'snow' ? '下雪了' : kind === 'thunder' ? '雷雨' : '下雨了', (kind === 'snow' ? '雪不澆燈；在屋外站著不動二十息，就開始掉暖、掉力，走動走動就好。' : kind === 'thunder' ? '雨會澆壞屋外的燈。雷落在屋外：地上先亮一圈，一息後劈下來，三乘三內的生靈都挨得到——看見就躲開；三十八格以內的屋子裡、洞窟裡打不到。' : '雨會澆壞屋外的燈，四面有磚的屋裡不怕。') + (W.galeOn() ? '<br>起狂風了（' + W.galeName() + '）：' + GALE_TEXT : ''), 9000);
        else this.message(kind === 'snow' ? '雪停了。' : kind === 'thunder' ? '雷雨停了。' : '雨停了。');
      };
      this.world.onGale = (what, x, y) => {   // 狂風（v0.9.15）
        const p = this.player;
        if (what === 'turn') this.message('狂風轉了向：' + this.world.galeName() + '。');
        else if (what === 'ruin') { if (U.cheb(x, y, p.x, p.y) <= 20) { this.fx.push({ type: 'write', x, y, ch: '倒', color: G.INK.ash || G.INK.black, t: 0, dur: 0.8 }); this.message('一陣狂風，吹倒了一處墟。'); } }
        else if (what === 'scare') { this.fx.push({ type: 'write', x, y, ch: '飛', color: G.INK.brown || G.INK.black, t: 0, dur: 0.8 }); this.toast('稻草人被吹走了', '狂風把（' + x + ', ' + y + '）那裡的稻草人吹得無影無蹤。', 7000); }
      };
      this.world.onCrop = (type, x, y, r) => this.cropNews(type, x, y, r);   // 五穀（v0.9.18）：凍死、落穗、雀啄
      this.world.onBreeze = () => this.message('今天有和風：在屋外（三十八格以內的屋子外面）每五息愜意 +' + BREEZE_SAN + '。');
      this.galePushP = GALE_PUSH_P; this.bolts = [];
      this.world.onFog = (f) => { const c = this.world.fogCenter(f), p = this.player, dx = c.x - p.x, dy = c.y - p.y; this.toast('起霧了', this.dirName(dx, dy) + '約 ' + Math.round(Math.hypot(dx, dy)) + ' 步起了一片霧障（' + f.cells.size + ' 格）。走進去，命飽暖力愜意各掉一成；帶著扇子可以吹散。'); };
      this.world.onLampRuined = (x, y) => { this.toast('雨澆壞了一盞燈', '在 (' + x + ', ' + y + ')，燈沒了。屋外的燈淋著雨，每盞每息有 1/' + Math.round(1 / this.world.rainLampP) + ' 的機會淋壞；四面有磚的屋裡不怕。'); SFX.fail(); };
      this.renderer = new Renderer($('world'), $('minimap'));
      this.sky = window.Sky && window.STARS ? new window.Sky($('sky')) : null; this.gaze = null; this.gazeCulture = 'cn';   // 觀星（v0.9.16）
      this.mapAcc = 0;
      this.player = { x: 0, y: 0, rx: 0, ry: 0, fx: 0, fy: 1, fromX: 0, fromY: 0, moveT: 0, stepDur: 0.2,
        hp: 100, hpMax: 100, food: 100, warm: 100, sta: 100, staMax: 100, san: 100, cour: 0, pillsMade: 0, pillsEaten: 0,
        hurtT: 0, atkT: 0, bag: [], sel: 0, tools: [], tool: -1, worn: { '襯': null, '褲': null, '甲': null, '盔': null, '靴': null, '帽': null }, hitWin: { start: -99, n: 0 }, totemOff: false, craftLog: {}, pouches: 0, noGhostUntil: 0, inFog: 0, ship: null, hold: [], holdSel: -1, swimming: false, swimT: 0, home: null, readSteles: [], isles: {}, isleNews: true, zones: {}, zoneNews: true, places: {}, creatures: [], raftTaken: false, dragon: false, azure: false, scaleTaken: false, bed: null, finished: false,
        deaths: 0, dead: false, warned: {}, warnLow: {}, burn: {}, lastDay: 1,
        poisonT: 0, poisonPer: 0, heatT: 0, snowT: 0, snuffT: 0, biteN: 0, biteLast: -99, zeroSan: 0, insane: false, ctrl: true, ctrlT: 0, knock: 0, sailing: false, crossed: false, decayAt: 0 };
      this.player.hardOnly = this.diff.key === 'hard';   // v0.8.22：從頭到尾都在困難（「服了？服了！」的條件之一）；換過別的難度就永遠是 false
      this.stats = { gathered: 0, crafted: 0, kills: 0, read: 0, nights: 0, bites: 0 };
      this.keys = new Set();
      this.action = null;
      this.fx = [];
      this.paused = true;
      this.saveAcc = 0; this.sanAcc = 0;
      this.last = 0;
      this.msgText = ''; this.hudSig = ''; this.barSig = ''; this.courSig = '';
      this.chestAt = null; this.userPaused = false; this.craftCat = '全部'; this.fogAsk = null; this.seaAsk = null; this.skullP = SKULL_P;
      this.stoveAt = null; this.stoveSig = ''; this.dingAt = null; this.dingSig = ''; this.warnOpen = false; this.warnEnabled = true;   // warnEnabled：煙霧測試關掉，免得途中彈窗把遊戲停住
      this.takeAsk = null; this.takeOk = false;   // 拆人造的東西先問一聲：takeAsk 是正在問的那格，takeOk 是問過了、這次照拆
      this.spawn = this.world.findSpawn();
      this.azure = G.azureAt(seed);   // v0.8 東海青龍盤著的地方
      { const tz = G.zones(seed).find(z => z.id === '白虎'); this.tigerAt = { x: tz.x, y: tz.y }; }   // v0.8.5 白虎伏在虎嶺島心
      { const bz = G.zones(seed).find(z => z.id === '朱雀'); this.birdAt = { x: bz.x, y: bz.y }; }    // v0.8.6 朱雀棲在丹穴島心
      { const xz = G.zones(seed).find(z => z.id === '玄武'); this.turtleZone = xz; this.turtleAt = { x: xz.x, y: xz.y }; }   // v0.8.8 玄武伏在玄洲島心
      { const hz = G.zones(seed).find(z => z.id === '封豨'); this.hogDen = { x: hz.x, y: hz.y }; }   // v0.8.7 封豨的窩在桑林島心
      this.bossAsk = null; this.fleeArm = 0; this.talking = null;
      if (save) this.load(save);
      else {
        this.player.x = this.player.rx = this.spawn.x; this.player.y = this.player.ry = this.spawn.y;
        try {   // 渡海帶來的膽氣：值@格；沒寫格（舊格式）就誰先開新島誰拿
          const raw = localStorage.getItem(CARRY_KEY) || '', at = raw.indexOf('@'), forSlot = at >= 0 ? parseInt(raw.slice(at + 1), 10) : 0, c = parseInt(raw, 10);
          if (c > 0 && (!forSlot || forSlot === this.slot)) { this.player.cour = c; localStorage.removeItem(CARRY_KEY); }
        } catch (e) { /* ignore */ }
      }
      if (!save && G.GEN >= 3) this.gatesFill();   // v0.8.27 第三版：原點的傳送點一開始就亮著
      if (this.moved) this.afterMove(this.moved);
      if (this.test) this.testKit();
      this.bindInput();
      this.buildBag();
      requestAnimationFrame((t) => this.frame(t));
    }

    // ---------- 測試格（v0.8.10 使用者定） ----------
    testKit() {          // 一上來錦囊用滿（囊三十二格加測試格的三十格＝六十二格、具欄十四格），送神兵一次；角上掛「測試服」
      const p = this.player; p.pouches = MAX_POUCHES;
      if (p.testKit !== 2) { p.testKit = 2; for (const n of GODS) if (!p.tools.some(s => s.n === n) && !p.bag.some(s => s.n === n)) this.addItem(n, 1); }   // v0.8.25：第三件青冥落羽做出來了，舊的測試格也補一件（p.testKit 記成 2）
      this.fillTest();
      if (!$('testtag')) { const el = document.createElement('div'); el.id = 'testtag'; el.textContent = (SERVER.name && SERVER.name !== '正式服' ? SERVER.name : '測試格') + ' · 第' + SLOT_NAMES[this.slot] + '格'; el.title = '測試格：不會死、膽氣無窮、採到的東西無數個、做的都是滿級。'; document.body.appendChild(el); }
    }
    fillTest() {         // 命飽暖力愜都滿；毒、落水的倒數也不算
      const p = this.player; p.hp = p.hpMax; p.food = 100; p.warm = 100; p.sta = p.staMax; p.san = 100;
      p.poisonT = 0; p.poisonPer = 0; p.insane = false; p.ctrl = true; p.zeroSan = 0; p.biteN = 0; if (p.swimming) p.swimT = Math.max(p.swimT || 0, SWIM_TIME);
    }
    infOk(n, extra) {    // 測試格：這樣東西進囊會不會變成無數個（衣甲、工具、網、船、包、裝著東西的櫃不會）
      const it = G.item(n); if (!this.test || !it || it.dur || it.single || it.slot || (it.span || 1) > 1) return false;
      if (it.tile && DB[it.tile] && DB[it.tile].net) return false;
      return !(extra && (extra.dur !== undefined || extra.store));
    }
    addInf(n, c) {
      const p = this.player, bag = p.bag, same = bag.filter(s => s.n === n && s.dur === undefined && !s.store);
      if (same.length) { const s = same[0]; s.inf = true; s.c = 1; delete s.ds; delete s.d; for (const o of same.slice(1)) bag.splice(bag.indexOf(o), 1); if (p.sel >= bag.length) p.sel = Math.max(0, bag.length - 1); this.barSig = ''; return 0; }
      if (this.bagUsed() >= this.slots()) return c;
      bag.push({ n, c: 1, inf: true }); this.barSig = ''; return 0;
    }
    infOf(n) { return this.player.bag.some(s => s.inf && (s.n === n || (n === '油脂' && s.n === '麻布包'))); }

    // ---------- 晝夜、潮汐、魄夜、膽氣 ----------
    dayT() { return (this.world.time % DAY) / DAY; }
    day() { return Math.floor(this.world.time / DAY) + 1; }
    sunDay() { const d = Math.floor(this.world.time / DAY), c = this.sunC; if (c && c.d === d) return c; return (this.sunC = { d, dawn: CAL.dawn(d), dusk: CAL.dusk(d) }); }   // 今天的日出日落（一天算一次，v0.9.17）
    dawnT() { return this.sunDay().dawn; }
    duskT() { return this.sunDay().dusk; }
    nightNo() { return this.dayT() >= this.duskT() ? this.day() : this.day() - 1; }
    daylight() { const t = this.dayT(), s = this.sunDay(); return U.smoothstep(s.dawn - TWILIGHT, s.dawn + TWILIGHT, t) * (1 - U.smoothstep(s.dusk - TWILIGHT, s.dusk + TWILIGHT, t)); }
    duskSoon() { const t = this.dayT(), d = this.duskT(); return t > d - 0.12 && t < d; }   // 黃昏：鳥歸巢、鹿往泉走
    darkness() { return 1 - this.daylight(); }
    viewDark() { return Math.max(this.darkness(), (this.player.caveK || 0) * CAVE_DARK); }   // 看得見多少：洞窟裡白天也黑（v0.7）；魄、獸的晝夜照 darkness()
    isNight() { const t = this.dayT(), s = this.sunDay(); return t >= s.dusk || t < s.dawn; }   // 凌晨與晚上：與 daylight() 過半的界線一致
    ghostNight() { return this.darkness() > 0.5 && this.nightNo() >= this.diff.ghost && this.world.time >= (this.player.noGhostUntil || 0) && !this.snowCalm(); }
    snowCalm() { return this.nightNo() <= SNOW_CALM_NIGHTS && this.wxHere() === 'snow'; }   // v0.9.18 使用者定：開局頭十天（第十夜以前）下著雪，魄不出來，所有難度一樣
    peaceDays() { const left = (this.player.noGhostUntil || 0) - this.world.time; return left > 0 ? Math.ceil(left / DAY - 1e-6) : 0; }
    tameCount() { return this.ents.tamed().length; }
    tameChance() { return TAME_CHANCE[Math.min(TAME_CHANCE.length - 1, this.tameCount())]; }
    feedEagle(e) {      // 手持魚面向鷹按 F：野的投魚馴，馴了的餵魚回力
      this.removeItem('魚', 1);
      if (e.tame) { e.sta = Math.min(100, e.sta + EAGLE_FEED); e.hp = Math.min(DB['鷹'].hp, e.hp + 10); this.message('鷹吃了魚，力 +' + EAGLE_FEED + '（' + Math.round(e.sta) + '）。'); SFX.absorb(); return; }
      const chance = this.tameChance(); e.angry = false; e.angryT = 0;
      if (Math.random() < chance) { e.tame = true; e.sta = e.sta === undefined ? 100 : e.sta; e.foe = null; this.toast('鷹馴了', '牠跟你走了，替你打獸；餵魚回力。現在跟著你的鷹：' + this.tameCount() + ' 隻。'); SFX.learn(); this.addCourage(5); }
      else this.message('鷹吃了魚，還是不肯跟你走（這次 ' + Math.round(chance * 100) + '%）。');
      this.barSig = '';
    }
    // ---------- 狸（v0.9.19）：投魚馴，跟著人走，到了自己種的田邊就留下守田（田鼠不敢來偷穗） ----------
    feedCat(e) {
      const w = this.world; this.removeItem('魚', 1);
      if (e.tame && e.home) { w.cats.delete(e.home); delete e.home; this.message('狸吃了魚，從田邊跟著你走了。帶到別處自己種的田邊，牠會再留下來。'); SFX.absorb(); return; }
      if (e.tame) { this.message('狸吃了魚，蹭了蹭你的腳。帶到自己種的田邊，牠就留下來守著。'); SFX.absorb(); return; }
      if (U.trueRand() < CAT_TAME) { e.tame = true; this.toast('狸跟你走了', '帶牠到自己種的田邊（三格內），牠就留下來守著，方圓十二格的田鼠不敢來偷穗。想換個地方守，再餵牠一條魚，牠就跟你走。'); SFX.learn(); this.addCourage(2); }
      else this.message('狸叼了魚，躲到一邊吃了，還不肯跟你走（一半一半）。');
    }
    catSettle(e) {
      const w = this.world, p = this.player;
      if (w.cats.size >= CAT_MAX) { if (!this.catFullSaid) { this.catFullSaid = true; this.message('守田的狸已經有 ' + CAT_MAX + ' 隻了，這隻只跟著你。'); } return; }
      const k = U.key(e.x, e.y); w.cats.set(k, { x: e.x, y: e.y, t: U.r4(w.time) }); e.home = k;
      if (U.cheb(e.x, e.y, p.x, p.y) <= 14) { this.message('狸在田邊找了個地方趴下，不走了：方圓十二格的田，田鼠不敢來偷。'); this.fx.push({ type: 'float', x: e.x, y: e.y, text: '守', color: G.INK.gold, t: 0, dur: 1.4 }); }
    }
    catLost(e) {   // 跟著人的狸落得太遠（坐船、傳送）：人上了岸，牠自己找來
      const p = this.player; if (p.sailing || p.swimming) { e.moveT = 3; return; }
      const at = this.ents.catSpot(p.x, p.y, this.isNight()); if (!at) { e.moveT = 3; return; }
      e.x = e.rx = at[0]; e.y = e.ry = at[1]; e.moveT = 1;
    }
    eagleHit(e, t) { this.fx.push({ type: 'float', x: t.x, y: t.y, text: '−20', color: G.INK.red, t: 0, dur: 0.7 }); }
    companionDied(e, killer) { this.ents.remove(e); this.toast('鷹死了', (killer ? '「' + killer.type + '」殺了你的鷹。' : '你的鷹死了。')); SFX.fail(); }
    gatherCompanions() { const p = this.player; for (const e of this.ents.tamed()) { const at = this.freeNear(p.x, p.y, true); e.x = e.rx = at.x; e.y = e.ry = at.y; } }
    ghostCap() { return Math.min(this.diff.ghostMax, 2 + Math.floor((this.nightNo() - this.diff.ghost) / 2)); }   // 一般簡單最多八隻、困難十隻（v0.5 前六隻）
    ghostSpeed() { const n = this.nightNo(); return n < GHOST_FAST_NIGHT || this.idleOn('ghost') ? 1 : Math.min(GHOST_FAST_MAX, 1 + 0.1 * (Math.floor((n - GHOST_FAST_NIGHT) / 4) + 1)); }   // 第廿夜 1.1、廿四夜 1.2……最多兩倍
    // ---------- 觀星（v0.9.16） ----------
    gazeBlock() {   // 看不了天的理由（空字串就是看得了）
      const p = this.player, w = this.world;
      if (p.dead || p.knock > 0) return '…';
      if (p.swimming) return '在水裡，顧不上看天。';
      if (this.inBossFight() || p.trial) return '正打著，哪有空看天。';
      if (!p.sailing && (this.indoors() || w.smallHouse(p.x, p.y) || DB[w.get(p.x, p.y)].cave || (p.caveK || 0) > 0.5)) return '頭上有頂，看不到天——到屋外去。';
      return '';
    }
    toggleGaze() {
      if (this.gaze) { this.gaze.dir = -1; return; }
      if (!this.sky) return;
      const why = this.gazeBlock(); this.gazeWhy = why; if (why) { if (why !== '…') this.message(why); return; }
      const p = this.player;
      this.gaze = { s: 0, dir: 1, az: Math.atan2(p.fx || 0, -(p.fy === undefined ? -1 : p.fy || 0)), alt: GAZE_ALT, zoom: 1, held: new Set(), hit: this.hitN || 0, acc: 0, mouse: null, drag: null, infoT: 0 };
      this.stopWalk(); this.keys.clear(); this.action = null;
      document.body.classList.add('gazing'); $('sky').classList.remove('hidden'); $('gazebar').classList.remove('hidden');
      if (!this.gazeIntro) { this.gazeIntro = true; this.toast('觀天', '抬頭看天：WASD 或拖曳轉頭，滾輪遠近，空白鍵換星官、西洋星座或不連線，指著星看名字；T 或 Esc 低頭。白天只看得到太陽；夜裡晴天，星的位置照真的天文——夏夜有銀河、織女牛郎，冬夜有參宿、天狼。看著星空，愜意慢慢回來。挨了打會回過神來。', 12000); }
    }
    gazeZoom(d) { const g = this.gaze; if (g) g.zoom = Math.max(1, Math.min(4, g.zoom * (d > 0 ? 1.18 : 1 / 1.18))); }
    gazeKey(ev) {
      const g = this.gaze, c = ev.code; ev.preventDefault();
      if (c === 'KeyT' || c === 'Escape' || c === 'Enter') g.dir = -1;
      else if (DIRS[c]) g.held.add(c);
      else if (c === 'Space') { const i = GAZE_CULTURES.findIndex(x => x[0] === this.gazeCulture); this.gazeCulture = GAZE_CULTURES[(i + 1) % GAZE_CULTURES.length][0]; g.infoT = 0; }
      else if (c === 'Equal' || c === 'NumpadAdd') this.gazeZoom(1);
      else if (c === 'Minus' || c === 'NumpadSubtract') this.gazeZoom(-1);
      else if (c === 'KeyN') this.message(SFX.toggle() ? '已靜音' : '聲音已開');
    }
    gazeEnd(why) { if (this.gaze && this.gaze.dir > 0) { this.gaze.dir = -1; if (why) this.message(why); } }
    moonPhase(d) { const n = (d % 30) + 1; return n === 1 ? '朔' : n <= 6 ? '蛾眉月' : n <= 8 ? '上弦月' : n <= 14 ? '盈凸月' : n <= 16 ? '望（滿月）' : n <= 22 ? '虧凸月' : n <= 24 ? '下弦月' : n <= 29 ? '殘月' : '晦'; }
    gazeTick(dt, live) {
      const g = this.gaze, p = this.player, R = this.renderer, sky = this.sky;
      g.s = Math.max(0, Math.min(1, g.s + g.dir * dt / GAZE_T));
      if (g.dir < 0 && g.s <= 0) {   // 低頭完了：回到地上
        this.gaze = null; document.body.classList.remove('gazing'); $('sky').classList.add('hidden'); $('gazebar').classList.add('hidden'); return;
      }
      if (live && g.dir > 0) {   // 挨了打、落水、打起來、走進屋裡：回過神來低頭
        const why = (this.hitN || 0) !== g.hit ? '挨了一下，回過神來。' : this.gazeBlock();
        if (why) { this.gazeWhy = why; this.gazeEnd(why === '…' ? '' : why); }
      }
      if (live && g.s >= 1) {   // 轉頭
        const az = (g.held.has('KeyD') || g.held.has('ArrowRight') ? 1 : 0) - (g.held.has('KeyA') || g.held.has('ArrowLeft') ? 1 : 0), al = (g.held.has('KeyW') || g.held.has('ArrowUp') ? 1 : 0) - (g.held.has('KeyS') || g.held.has('ArrowDown') ? 1 : 0);
        g.az += az * GAZE_PAN * dt / g.zoom; g.alt = Math.max(GAZE_ALT_MIN, Math.min(GAZE_ALT_MAX, g.alt + al * GAZE_PAN * 0.7 * dt / g.zoom));
      }
      sky.resize(R.w, R.h, R.dpr || 1); sky.setView(0, 0, g.zoom);
      const e = U.smoothstep(0, 1, g.s), a0 = sky.altStart(), alt = a0 + (g.alt - a0) * e, sG = Math.max(0, Math.min(1, (alt - a0) / (0 - a0)));   // 鏡頭從看著地（地平線在畫面頂上）仰到看著天
      const tile = DB[this.world.get(p.x, p.y)], sea = !!(p.sailing || p.swimming || (tile && tile.kind === 'water'));
      sky.draw(this, { az: g.az, alt, zoom: g.zoom, culture: this.gazeCulture, now: this.animT || 0, dt, live, ground: $('world'), groundK: 1 + 3 * sG, groundA: 1 - U.smoothstep(0.55, 0.95, g.s), horizonA: U.smoothstep(0.1, 0.55, g.s), sea, mouse: g.mouse });
      const w = this.world, night = this.darkness(), wx = this.wxHere(), clear = !wx;
      if (live && g.s >= 1 && night > 0.7 && clear) {   // 夜裡晴天看著星：愜意慢慢回來
        g.acc += dt; while (g.acc >= GAZE_SAN_GAP) { g.acc -= GAZE_SAN_GAP; if (p.san < 100) { p.san = Math.min(100, U.r4(p.san + GAZE_SAN)); this.fx.push({ type: 'float', x: p.x, y: p.y, text: '星 愜 +' + GAZE_SAN, color: '#c9a227', t: 0, dur: 0.9 }); } }
      }
      g.infoT -= dt;
      if (g.infoT <= 0) {
        g.infoT = 0.5; const d0 = this.day() - 1, cul = GAZE_CULTURES.find(x => x[0] === this.gazeCulture)[1];
        const sky2 = !clear ? (wx === 'snow' ? '下著雪，雲遮住了天。' : wx === 'dry' ? '乾雷，雲遮住了天。' : '下著雨，雲遮住了天。') : night < 0.35 ? '白天，天上只有太陽。' : night < 0.75 ? '天色將暗未暗，亮星一顆一顆出來。' : '';
        $('gaze-info').textContent = CAL.longLabel(d0) + ' · ' + this.shichen() + ' · 月相：' + this.moonPhase(d0) + ' · ' + cul + (sky2 ? ' · ' + sky2 : '');
      }
    }
    // ---------- 天氣（v0.9.15）：雪天站著不動、和風、狂風、落雷 ----------
    wxHere() { const p = this.player; return this.world.wxAt(p.x, p.y); }   // 人站的這一格的天氣（v0.9.17：乾地上雨雪不下、雷雨成乾雷）
    hailing() { return this.world.hailAt(this.player.x, this.player.y); }   // 人站的這格在下冰雹（v0.9.19）
    weatherLabel() { const w = this.world, wx = this.wxHere(); return (this.hailing() ? '冰雹' : { snow: '雪', thunder: '雷雨', dry: '乾雷', rain: '雨' }[wx] || '') + (w.galeOn() ? ' 狂風（' + w.galeName() + '）' : w.breezeOn() ? ' 和風' : ''); }
    weatherTick(dt) {
      const p = this.player, w = this.world;
      if (p.x === p.stillX && p.y === p.stillY) p.stillT = (p.stillT || 0) + dt; else { p.stillX = p.x; p.stillY = p.y; p.stillT = 0; }   // 站著不動多久（雪天用）
      if (p.dead) return;
      const house = w.smallHouse(p.x, p.y);
      if (w.breezeOn() && !house) {   // 和風：三十八格以內的屋子外面，每五息愜意 +2
        this.breezeAcc = (this.breezeAcc || 0) + dt;
        while (this.breezeAcc >= BREEZE_GAP) { this.breezeAcc -= BREEZE_GAP; if (p.san < 100) { p.san = Math.min(100, U.r4(p.san + BREEZE_SAN)); this.fx.push({ type: 'float', x: p.x, y: p.y, text: '風 愜 +' + BREEZE_SAN, color: '#5f7d4e', t: 0, dur: 0.9 }); } }
      } else this.breezeAcc = 0;
      if (w.galeOn()) {   // 狂風：每息看一次，十息內最多吹兩回
        this.galeAcc = (this.galeAcc || 0) + dt; this.galeShoves = (this.galeShoves || []).filter(t => w.time - t < GALE_WINDOW);
        while (this.galeAcc >= 1) {
          this.galeAcc -= 1;
          if (house || this.galeShoves.length >= GALE_MAX_PUSH || !(U.trueRand() < this.galePushP)) continue;
          const d = w.galeDir(), n = this.galeShove(d[0], d[1]);
          if (n) { this.galeShoves.push(w.time); this.fx.push({ type: 'write', x: p.x, y: p.y, ch: '風', color: '#5b6b7a', t: 0, dur: 0.7 }); this.message('一陣' + w.galeName() + '，把你往' + d[2] + '吹了 ' + n + ' 格。'); }
        }
      } else { this.galeAcc = 0; this.galeShoves = []; }
      if (this.hailing() && !house) {   // 冰雹（v0.9.19）：屋外每兩息挨一下（力，衣甲減得了）；三十八格以內的屋子、洞窟裡砸不到
        this.hailAcc = (this.hailAcc || 0) + dt;
        while (this.hailAcc >= HAIL_GAP) { this.hailAcc -= HAIL_GAP; this.hurt(HAIL_HURT, '力', { name: '冰雹' }); p.hurtT = Math.max(p.hurtT || 0, 1); this.fx.push({ type: 'float', x: p.x, y: p.y, text: '雹', color: '#5b6b7a', t: 0, dur: 0.7 }); }
      } else this.hailAcc = 0;
      const here = w.wxAt(p.x, p.y);
      if (this.wxLast !== undefined && here !== this.wxLast && w.precip() && this.wxRain === w.rainUntil) {   // 下著雨雪時走進、走出乾地（v0.9.17）
        const nm = { rain: '雨', snow: '雪', thunder: '雷雨' }[w.wx];
        if (w.dryAt(p.x, p.y)) this.message('走進乾地：這一帶' + nm + (w.wx === 'thunder' ? '只剩乾雷，雷照樣落。' : '不下。'));
        else this.message('走出乾地，' + nm + '又落在身上了。');
      }
      this.wxLast = here; this.wxRain = w.rainUntil;
      if (here === 'thunder' || here === 'dry') {   // 雷雨與乾雷：每三到七息在你方圓十四格內落一道雷，先亮一圈
        if (this.boltT === undefined) this.boltT = BOLT_GAP[0] + U.trueRand() * (BOLT_GAP[1] - BOLT_GAP[0]);
        this.boltT -= dt;
        if (this.boltT <= 0) {
          this.boltT = BOLT_GAP[0] + U.trueRand() * (BOLT_GAP[1] - BOLT_GAP[0]);
          if (this.fishing && !w.smallHouse(p.x, p.y) && U.trueRand() < ROD_BOLT_P) { this.boltWarn(p.x, p.y); if (!p.warned.rodBolt) { p.warned.rodBolt = true; this.message('雷雨天拿著竿，雷衝著你來了！收竿（F）、走開。'); } }   // 釣竿招雷（v0.9.17）
          else for (let k = 0; k < 8; k++) { const x = p.x + Math.round((U.trueRand() * 2 - 1) * BOLT_R), y = p.y + Math.round((U.trueRand() * 2 - 1) * BOLT_R); if (w.smallHouse(x, y)) continue; this.boltWarn(x, y); break; }
        }
      } else this.boltT = undefined;
      for (let i = this.bolts.length - 1; i >= 0; i--) { const b = this.bolts[i]; b.t -= dt; if (b.t <= 0) { this.bolts.splice(i, 1); this.boltStrike(b.x, b.y); } }
    }
    boltWarn(x, y) { this.bolts.push({ x, y, t: BOLT_WARN }); this.fx.push({ type: 'boltWarn', x, y, t: 0, dur: BOLT_WARN }); }   // 雷要落的那一格先亮一圈
    boltStrike(x, y) {   // 一道雷：三乘三內魄煙滅、人與獸挨打；三十八格以內的屋子裡、洞窟裡的不挨
      const p = this.player, w = this.world, E = this.ents;
      const seed = Math.floor(U.trueRand() * 1e9);
      this.fx.push({ type: 'bolt', x, y, t: 0, dur: 1.1, seed }, { type: 'boltScar', x, y, t: 0, dur: 7, seed }); this.renderer.flash = 0.5; SFX.thunder();
      if (U.cheb(p.x, p.y, x, y) <= 6) this.renderer.shake = Math.max(this.renderer.shake || 0, 0.3);
      let ghosts = 0;
      for (const o of E.list.slice()) {
        if (E.list.indexOf(o) < 0) continue;
        if (E.rectDist(o, x, y) > 1 || w.smallHouse(o.x, o.y)) continue;   // 天上高處的大風、潛在地裡的搆不到
        if (o.type === '魄') { E.remove(o); ghosts++; this.fx.push({ type: 'write', x: o.x, y: o.y, ch: '滅', color: G.INK.azure, t: 0, dur: 0.7 }); continue; }
        if (GODS4.indexOf(o.type) >= 0 || o.type === '龍') continue;   // 神獸不挨雷
        const tier = Math.min(...E.cellsOf(o).map(([cx, cy]) => boltTier(cx - x, cy - y)).filter(t => t >= 0).concat([2]));   // 大身子照最靠近正中的那一格算
        const tough = !!o.shade || !!this.bossGlyph(o.type) || MINI_TYPES.indexOf(o.type) >= 0;
        o.hp = U.r4(o.hp - BOLT_DMG * BOLT_TIER[tier]);
        if (o.hp <= 0) {
          if (tough) o.hp = 1;   // 大魔王、小魔王、影子：雷只傷不死
          else { this.fx.push({ type: 'write', x: o.x, y: o.y, ch: '焦', color: G.INK.black, t: 0, dur: 0.8 }); if (o.tame) this.companionDied(o, { type: '雷' }); else E.remove(o); }   // 劈死的什麼也不留
        }
      }
      const pt = boltTier(p.x - x, p.y - y);
      if (pt >= 0 && !w.smallHouse(p.x, p.y)) { this.hurt(BOLT_HURT * BOLT_TIER[pt], '灼', { name: '雷' }); p.hurtT = Math.max(p.hurtT || 0, 2); this.renderer.shake = Math.max(this.renderer.shake || 0, pt ? 0.45 : 0.7); this.message(pt ? '雷劈在身邊（' + BOLT_TIER_NAME[pt] + '）！' : '雷正劈在你頭上！'); }
      else if (ghosts) this.message('雷落下來，煙滅了 ' + ghosts + ' 隻魄。');
    }
    galeShove(dx, dy) {   // 狂風把人往風向吹：陸上一格、海上（船上或水裡）兩格；碰到擋路的就停在前一格
      const p = this.player, w = this.world, sea = p.sailing || p.swimming, n = sea ? GALE_SEA : 1; let moved = 0;
      for (let k = 0; k < n; k++) {
        const x = p.x + dx, y = p.y + dy;
        if (p.sailing) {   // 連船一起吹（修蛇纏著時吹不動；前面是岸、別的船、獸就停）
          const s = this.shipNow(); if (!s || this.coiled()) break;
          if (!w.shipFootprint(s.kind, s.x0 + dx, s.y0 + dy, s.dir || 'v').every(([i, j]) => this.shipWater(i, j) && !w.shipCells.has(U.key(i, j)) && !((e) => e && e.type !== '魚')(this.ents.beastAt(i, j)))) break;
          s.x0 += dx; s.y0 += dy;
        } else if (p.swimming) { if (DB[w.get(x, y)].kind !== 'water' || this.ents.at(x, y)) break; }   // 水裡只順著水漂
        else if (!this.pass(x, y) || this.ents.at(x, y) || DB[w.get(x, y)].bog) break;
        p.x = p.rx = x; p.y = p.ry = y; moved++;
      }
      if (moved) { this.stopWalk(); p.fromX = p.x; p.fromY = p.y; p.shipMove = false; this.ents.px = p.x; this.ents.py = p.y; p.moveT = 0; }
      return moved;
    }
    indoors() {          // 屋裡：地標屋舍，或磚圍得住（跟雨淋不淋燈同一個判定）；v0.8.8：站在水上不算，四周得有人造的磚門窗墟（先前海上四面深水也算圍住了）
      const p = this.player, w = this.world, d = DB[w.get(p.x, p.y)]; if (d && d.shelter) return true;
      if (!d || d.kind === 'water' || !(d.walk > 0) || !w.covered(p.x, p.y)) return false;
      const sh = w.roomShell(p.x, p.y); return !!sh && [...sh.values()].some(c => '磚門窗墟'.indexOf(c) >= 0);
    }
    ghostTouch(e, dt) {   // 魄兩格內：手裡的光每息有 ents.snuffP 的機會被吹熄，SNUFF_TIME 息後才點得著（燈帽吹不熄，蠟燭燒得快，見 updateStats）
      const p = this.player, s = this.held(), it = s && ITEMS[s.n];
      if (!it || !it.light || it.slot || p.snuffT > 0 || this.darkness() <= 0.5) return;
      if (Math.random() >= 1 - Math.pow(1 - this.ents.snuffP, dt)) return;
      p.snuffT = SNUFF_TIME; this.message('魄撲上來，吹熄了手裡的「' + s.n + '」。' + SNUFF_TIME + ' 息後才點得著。'); SFX.fail();
      if (!p.warned.snuff) { p.warned.snuff = true; this.toast('吹燈', '魄會撲上來吹熄手裡的光，' + SNUFF_TIME + ' 息後才點得著。燈帽吹不熄，但魄近身時蠟燭燒三倍快；地上的燈、火、旺灶三格內才燒得死魄。', 7000); }
    }
    shichen() { const hour = (this.dayT() * 24) % 24; return SHICHEN[Math.floor(((hour + 1) % 24) / 2)] + '時'; }
    slots() { return BASE_SLOTS + 2 * this.player.pouches + (this.test ? TEST_BAG : 0); }          // 錦囊：每個多兩格；測試格另多三十格（v0.8.14）
    toolSlots() { return BASE_TOOLS + this.player.pouches; }           // 錦囊：每個多一格具欄
    pouchFull() { return this.player.pouches + this.count('錦囊') >= MAX_POUCHES; }   // 錦囊上限八個（v0.6.10）：已用的加上囊裡的湊滿八個就不給再織
    beastMult() { return this.diff.beasts; }
    hasGod() { const is = (s) => GODS.indexOf(s.n) >= 0; return this.player.tools.some(is) || this.player.bag.some(is); }   // 身上帶著神兵（具欄或囊；幾件都只算一重減益）
    hasHammer() { return this.hasGod(); }
    decayFloor() { return this.hasGod() ? this.diff.god.floor : DECAY_LEVEL; }
    decayDays() { return this.hasGod() ? this.diff.god.days : DECAY_DAYS; }
    godText() { const cn = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']; return '攜神兵：廿' + cn[this.diff.god.floor - 20] + '重以上' + cn[this.diff.god.days] + '日一減'; }
    level() { return this.test ? TEST_LEVEL : Game.levelOf(this.player.cour); }   // 測試格：膽氣無窮（v0.8.10）
    levelAt(l) { return CUM[Math.max(0, Math.min(CUM.length - 1, l))]; }     // 到第 l 重要累積多少膽氣
    levelCost(n) { return levelCost(n); }
    levelFrac() { if (this.test) return 1; const l = this.level(); return U.clamp((this.player.cour - CUM[l]) / levelCost(l), 0, 1); }
    mult() { return 1 + Math.min(10, this.level()) / 10; }                 // 膽氣越高回得越快，十重兩倍
    // 衣甲
    wornList() { const w = this.player.worn; return SLOT_ORDER.map(k => w[k]).filter(Boolean); }
    wornFull() { return ARMOR_SLOTS.every(k => this.player.worn[k]); }
    ownedPiece(n) { return this.wornList().find(s => s.n === n) || this.player.bag.find(s => s.n === n) || null; }   // 同一類衣甲只留一件
    betterPiece(n) {     // 身上或囊裡同一格、更強（減傷更多）的衣甲（v0.7.1：製作欄標「已有更好的…」）；內襯、布褲這種沒有更高一等的就沒有
      const it = ITEMS[n]; if (!it || !it.slot || it.light) return null;
      return this.wornList().concat(this.player.bag).filter(s => { const o = ITEMS[s.n]; return o && o.slot === it.slot && !o.light && (o.red || 0) > (it.red || 0); }).sort((a, b) => ITEMS[b.n].red - ITEMS[a.n].red)[0] || null;
    }
    leftFrac(s) {        // 這件還剩幾成：衣甲照壽命、燈帽照蠟燭、漁網照網的耐久、工具照耐久；沒用過的算全新；沒有耐久的回 null
      const it = ITEMS[s.n] || {};
      if (it.slot && it.light) return (s.fuel || 0) / HAT_FUEL;
      if (it.slot) return s.dur === undefined ? 1 : s.dur / this.lifeOf(s);
      if (it.tile && DB[it.tile] && DB[it.tile].net) return s.dur === undefined ? 1 : s.dur / this.world.netDur(DB[it.tile].net);
      if (it.dur) return s.dur === undefined ? 1 : s.dur / it.dur;
      return null;
    }
    canRenew(s) { const f = s ? this.leftFrac(s) : null; return f === null || f < RENEW_AT; }   // 用過一半才能翻新（v0.7.1）
    tooNew(s, verb) { const f = this.leftFrac(s); this.message('「' + s.n + '」還新（還剩 ' + Math.round(f * 100) + '%），用過一半才能' + verb + '。'); SFX.fail(); }
    ironCount() { return this.wornList().filter(s => ITEMS[s.n].iron).length; }
    ironFull() { return this.ironCount() === 3; }                                                // 鐵甲鐵盔鐵靴齊：毒不侵
    armorRed() { return this.wornList().reduce((a, s) => a + (ITEMS[s.n].red || 0), 0); }      // 減傷：布五件一成，鐵三件加內襯布褲三成
    ironSpeed() { return 1 - 0.25 * this.ironCount() / 3; }                                      // 三件鐵慢四分之一
    ironAtk() { return 1 + 0.05 * this.ironCount() / 3; }                                        // 三件鐵攻擊加半成
    swimK() { return this.player.azure ? 0.5 : 1; }   // 落水的減益算幾成：青龍的水性減半（v0.8.3）
    workDrain() { return this.ironDrain() * this.mealK('麥'); }   // 採、鑿、出手耗的力：吃了麥餅那一頓少四分之一（v0.9.18）
    ironDrain() { return (1 + 0.08 * this.ironCount() / 3) * (this.player.swimming ? 1 + (SWIM_DRAIN - 1) * this.swimK() : 1); }   // 落水游泳時再翻倍                                      // 三件鐵飢愜力掉得快八分
    wornWarm() { return this.wornList().some(s => ITEMS[s.n].warm); }
    // 山海衣：五件穿齊、至少一件鎢鋼護具、十六重膽氣，衣上浮出獸紋；脫下任何一件即隱
    wornTung() { return ARMOR_SLOTS.some(k => { const s = this.player.worn[k]; return s && ITEMS[s.n] && ITEMS[s.n].tung; }); }   // 身上有沒有鎢鋼護具
    totemReady() { return this.level() >= TOTEM_LEVEL && this.wornFull() && this.wornTung(); }   // 山海衣：十六重、五件穿齊、至少一件鎢鋼
    totemOn() { return this.totemReady() && !this.player.totemOff; }
    toggleTotem() {
      const p = this.player; p.totemOff = !p.totemOff; this.barSig = '';
      if (!this.totemReady()) this.message(p.totemOff ? '開關撥到「關」。' : '開關撥到「開」，但要五件穿齊、其中至少一件鎢鋼、膽氣十六重，獸紋才會顯。');
      else this.message(p.totemOff ? '山海衣收起獸紋，暫作普通服。' : '山海衣獸紋再現。'); SFX.toggle(); SFX.toggle();
    }
    ladder() { return this.totemOn() ? Math.floor(((this.test ? DECAY_LEVEL : this.level()) - TOTEM_LEVEL) / 7) : -1; }     // 十六至二十二重 0，二十三重 1，三十重 2……
    dmgMult() { const k = this.ladder(); return (k < 0 ? 1 : Math.pow(1.15, k + 1)) * this.ironAtk() * this.diff.dmg * (this.player.swimming ? 1 - (1 - SWIM_DMG) * this.swimK() : 1) * (this.onMud() ? MUD_ATK : 1); }        // 造成的傷害（v0.9 站在淖上七成五）
    baseTaken() { const k = this.ladder(); return (k < 0 ? 1 : Math.pow(1.15, -k)) * this.diff.taken; }   // 受到的傷害：山海衣的階、難度（不算衣甲）
    takenMult() { return this.baseTaken() * (1 - this.armorRed()); }  // 受到的「力」：再算衣甲
    quakeSafe(noPlat) { const p = this.player, t = this.world.get(p.x, p.y); return p.sailing || (QUAKE_SAFE.indexOf(t) >= 0 && !(noPlat && t === '台')); }   // 震傳不上台、棧與船；封豨拱得動台（noPlat，v0.8.9）
    kindMult(kind, noPlat) {   // 各質的傷害打幾折（v0.8.5）
      const p = this.player;
      if (kind === '力') return this.takenMult();
      const xk = this.xuanK();   // 玄甲：力以外的每一質都減（v0.8.34）
      if (kind === '震') return this.quakeSafe(noPlat) ? 0 : this.baseTaken() * (p.bai ? 1 - RESIST : 1) * xk * this.mealK('鯥');
      if (kind === '窒' || kind === '心') return this.baseTaken() * (p.zhu ? 1 - RESIST : 1) * xk * (kind === '心' ? this.mealK('冉遺') * this.mealK('黍') : 1);
      if (kind === '溺') return this.baseTaken() * (p.azure ? 1 - RESIST : 1) * xk;
      return xk * this.mealK('鰼鰼');           // 灼：難度與山海衣都不打折，只有玄甲減（v0.9.17 烤鰼鰼魚少四分之一）
    }
    xuanLayers() { const x = this.player.xuanjia || {}; return Object.keys(x).filter(id => RING[id]).length; }   // 玄甲幾層：從哪幾隻大魔王的影子身上取過經（只算三隻大魔王，立極那一卷不給）
    xuanK() { return U.r4(1 - XUAN_STEP * this.xuanLayers()); }
    hurt(dmg, kind, src) {   // 一切打在人身上、會掉命的傷害都走這裡（v0.8.5）；src = { name, big }，big 是神獸、魔王、共工
      const p = this.player, d = U.r4(dmg * this.kindMult(kind, src && src.noPlat));
      if (d <= 0) return 0;
      this.hitN = (this.hitN || 0) + 1;   // 挨了幾下（觀天時看這個回過神來；餓、凍掉的命不算，v0.9.16）
      if (this.test) { p.lastHit = { kind, by: src ? src.name : '', big: !!(src && src.big), t: this.world.time }; return d; }   // 測試格：只有特效，命與愜意都不掉（v0.8.10）
      if (kind === '心') { p.san = Math.max(0, p.san - d); return d; }   // 心直接打愜意，不掉命（v0.8.6）
      if (p.trialLockT > 0) return 0;   // 試煉沒過，玄武替你鎖著命（v0.8.10）
      if (p.trial && p.hp - d < 1) { const left = U.r4(p.hp - 1); this.trialSave(); return left; }   // 影子不取人命：命只剩一點，這一回試煉沒過
      p.hp = Math.max(0, p.hp - d);
      p.lastHit = { kind, by: src ? src.name : '', big: !!(src && src.big), t: this.world.time };
      return d;
    }
    totemNear(x, y) { return this.totemOn() && U.cheb(x, y, this.player.x, this.player.y) <= 7; }
    lifeOf(s) { const it = ITEMS[s.n] || {}; return (it.life || ARMOR_LIFE) * DAY; }     // 衣甲壽命：一般一百八十日，鎢鋼三百六十日
    durText(s) { if (s.dur !== undefined && ITEMS[s.n] && ITEMS[s.n].ward) return '鎮' + Math.max(1, Math.ceil(s.dur - 1e-6)) + '日';   // 從船頭拿下來的首骨（v0.8.21）
      if (s.store && s.store.length) return s.store.length + '樣'; if (s.dur === undefined) return s.inf ? '∞' : '×' + s.c; const it = ITEMS[s.n] || {}; return it.slot ? Math.max(1, Math.ceil(s.dur / DAY)) + ' 日' : '耐 ' + Math.ceil(s.dur); }   // 耐久對折後可能有半點：顯示往上取整（真能再用幾次）
    wearRate(s) { return (s.wm || 1) * (HIT_MULT[this.player.hitWin.n] || 1); }                 // 這件現在的損耗速度
    effDays(s) { return Math.max(1, Math.ceil(s.dur / this.wearRate(s) / DAY)); }              // 照目前速度還能穿幾日
    wearItem(i) {        // 把囊裡第 i 格的衣甲穿上，原來那件回囊
      const p = this.player, s = p.bag[i]; if (!s) return false;
      const it = ITEMS[s.n]; if (!it || !it.slot) return false;
      const was = this.totemOn(), old = p.worn[it.slot];
      let piece;
      if (s.c > 1 && s.dur === undefined) { s.c--; piece = { n: s.n, c: 1 }; } else { p.bag.splice(i, 1); piece = s; }
      if (piece.dur === undefined && !it.light) piece.dur = this.lifeOf(piece);
      if (piece.wm === undefined) piece.wm = 1;
      p.worn[it.slot] = piece;
      if (old) p.bag.splice(Math.min(i, p.bag.length), 0, old);
      if (p.sel >= p.bag.length) p.sel = Math.max(0, p.bag.length - 1);
      this.barSig = ''; this.buildBag(); SFX.write();
      this.message(it.light ? '戴上「' + piece.n + '」。' : '穿上「' + piece.n + '」' + (old ? '，脫下「' + old.n + '」' : '') + '。減傷 ' + Math.round(this.armorRed() * 100) + '%。');
      if (this.totemOn() && !was) this.toast('山海衣', '五件穿齊、一件鎢鋼、十六重膽氣，衣上浮出山海經裡的獸紋。七格內的獸慢一倍卻狠三分之二；你的攻擊 ' + Math.round(this.dmgMult() * 100) + '%、受傷 ' + Math.round(this.takenMult() * 100) + '%。');
      return true;
    }
    metalOf(n) { const it = ITEMS[n] || {}; return GODS.indexOf(n) >= 0 ? 'god' : it.tung ? 'tung' : it.iron || (it.kind === 'tool' && n.charAt(0) === '鋼') ? 'iron' : ''; }   // 神兵、鎢鋼器、鐵器（鐵甲盔靴與鋼具）；其餘是石、布
    fixCost(s) {   // 這一件下一次修要什麼：鐵器、鎢鋼器照修過幾次（s.rg）加價；石具、布件、神兵回 null
      const m = s && this.metalOf(s.n); if (!m) return null; const k = Math.min(s.rg || 0, 3);
      if (m === 'god') { const d = {}; for (const n in TUNG_FIX[k]) d[n] = TUNG_FIX[k][n] * GOD_FIX; return d; }   // 神兵：鎢鋼的兩倍
      return m === 'tung' ? Object.assign({}, TUNG_FIX[k]) : { '鐵': IRON_FIX[k] };
    }
    matText(d) { return Object.keys(d).map(n => n + ' ' + d[n]).join('、'); }
    hasAll(d) { for (const n in d) if (this.count(n) < d[n]) return false; return true; }
    godWhere(n) {        // v0.8.27：這件神兵世上還有沒有一把（身上、囊裡、櫃裡、地上的囊與荷包，裝在櫃裡的櫃也算）；有就說在哪
      const p = this.player, w = this.world, has = (list) => (list || []).some(s => s && (s.n === n || has(s.store)));
      if (has(p.tools)) return '具欄裡'; if (has(p.bag)) return '囊裡';
      for (const v of w.chests.values()) if (has(v)) return '櫃裡';
      for (const [k, v] of w.bags) if (has(v)) return w.purses.has(k) ? '荷包裡' : '地上的囊裡';
      return '';
    }
    godsOwned() { const p = this.player; return p.tools.concat(p.bag).filter(s => s && GODS.indexOf(s.n) >= 0); }   // 具欄與囊裡的神兵
    godFix(s) {          // 修神兵（v0.8.22 使用者說：按 C 在「神兵」那一類就修得到，不必先拿在手上）：照重磨的規矩，用過一半才修；料是鎢鋼的兩倍，力十六、飽二十
      const p = this.player; if (!s || !this.canAct()) return;
      if (p.swimming) { this.message('身在水中，無從下手；先上岸。'); return; }
      if (!this.canRenew(s)) { this.tooNew(s, '修'); return; }
      const r = G.RECIPES.find(x => x.id === 'regrind'), sta = (r.sta + 5) * GOD_FIX, food = 10 * GOD_FIX, need = this.fixCost(s);
      if (!this.hasAll(need)) { this.message('修「' + s.n + '」' + (s.rg ? '（修過 ' + s.rg + ' 次）' : '') + '要' + this.matText(need) + '，力 ' + sta + '、飽 ' + food + '。'); SFX.fail(); return; }
      if (p.sta < sta) { this.message('力有未逮，且歇一歇（修神兵要力 ' + sta + '）。'); SFX.fail(); return; }
      if (p.food < food) { this.message('太餓了，修不動神兵。'); SFX.fail(); return; }
      for (const n in need) this.removeItem(n, need[n]); s.rg = (s.rg || 0) + 1;
      p.sta -= sta; p.food -= food; s.dur = ITEMS[s.n].dur; this.barSig = ''; this.afterCraft(r);
      this.message('「' + s.n + '」修好了，用了' + this.matText(need) + '；下次要' + this.matText(this.fixCost(s)) + '。'); SFX.fuse(); this.buildCraft(); this.buildBag();
    }
    repairWorn(slot) {   // 布件用麻布一；鐵件、鎢鋼件照 fixCost 加價（力 4；鎢鋼力 12、飽 15）：壽命回滿，損耗從 1.5 倍重新起算；燈帽則是續蠟燭
      const p = this.player, s = p.worn[slot]; if (!s || !this.canAct()) return false;
      if (slot === '帽') { if (this.count('蠟燭') < 1) { this.message('續燈帽要一根蠟燭。'); SFX.fail(); return false; } this.removeItem('蠟燭', 1); s.fuel = HAT_FUEL; this.barSig = ''; this.buildBag(); this.message('燈帽續上一根蠟燭：四百息。'); SFX.write(); return true; }
      if (!this.canRenew(s)) { this.tooNew(s, '修補'); return false; }
      const it = ITEMS[s.n], need = this.fixCost(s) || { '麻布': 1 }, sta = it.tung ? 12 : 4, food = it.tung ? 15 : 0;   // 鎢鋼件修補耗力也耗飽
      if (!this.hasAll(need)) { this.message('修補「' + s.n + '」' + (s.rg ? '（修過 ' + s.rg + ' 次）' : '') + '要' + this.matText(need) + (food ? '，力 ' + sta + '、飽 ' + food : '') + '。'); SFX.fail(); return false; }
      if (food && p.food < food) { this.message('太餓了，修不動鎢鋼。'); SFX.fail(); return false; }
      if (!this.spendSta(sta)) return false;
      if (food) p.food -= food;
      for (const n in need) this.removeItem(n, need[n]);
      if (this.metalOf(s.n)) s.rg = (s.rg || 0) + 1;
      s.dur = this.lifeOf(s); s.wm = REPAIR_WM; this.barSig = ''; this.buildBag(); SFX.fuse();
      const next = this.fixCost(s);
      this.message('「' + s.n + '」修補好了，用了' + this.matText(need) + '：壽命回滿，損耗從 150% 起算。' + (next ? '下次要' + this.matText(next) + '。' : '')); return true;
    }
    takeOff(slot) {
      const p = this.player, s = p.worn[slot]; if (!s) return;
      if (this.bagUsed() >= this.slots()) { this.message('囊已滿。'); SFX.fail(); return; }
      const was = this.totemOn();
      p.worn[slot] = null; p.bag.push(s); this.barSig = ''; this.buildBag(); SFX.write();
      this.message('脫下「' + s.n + '」。' + (was ? '山海衣的獸紋隱去。' : ''));
    }
    armorHit() {         // 挨了一下：十五息內算同一輪，一下 1.05、兩下 1.12、三下 1.2、四下 1.5，五下甲襯褲碎
      const p = this.player, win = p.hitWin, now = this.world.time, worn = this.wornList();
      if (!worn.length || this.test) return;
      if (win.n && now - win.start > 15) { for (const s of worn) s.wm = Math.min(WEAR_CAP, (s.wm || 1) * HIT_MULT[win.n]); win.n = 0; }
      if (!win.n) win.start = now;
      win.n++;
      if (win.n >= 5) {
        for (const s of worn) s.wm = Math.min(WEAR_CAP, (s.wm || 1) * HIT_MULT[4]);
        const gone = [];
        for (const k of ['甲', '襯', '褲']) if (p.worn[k]) { gone.push(p.worn[k].n); p.worn[k] = null; }
        win.n = 0; this.barSig = '';
        if (gone.length) { this.toast('衣甲盡碎', '十五息內挨了五下，' + gone.join('、') + '都碎了。'); SFX.fail(); }
      }
    }
    addCourage(n, src) {   // src 'kill'：斃敵對生靈；'ghost'：魄煙滅（比例，不乘難度）；'gate'：點亮傳送點（v0.8.29，廿二重以後也給；v0.8.30 固定 +6 不乘難度）；其餘（製作、採集、讀碑、捕魚、煉丹）廿二重起就不長了。回傳實際加了多少
      const p = this.player, l0 = this.level();
      if (this.test) return n > 0 ? U.r4(n * (src === 'ghost' || src === 'gate' ? 1 : this.diff.cour || 1)) : 0;   // 測試格：膽氣無窮，不加不減
      if (src !== 'kill' && src !== 'ghost' && src !== 'gate' && l0 >= KILL_ONLY_LEVEL) { if (n > 0 && !this.killOnlyHinted) { this.killOnlyHinted = true; this.toast('膽氣不長了', '廿二重起，膽氣只從斃敵對的生靈得來：白日八成、夜裡加半成。'); } return 0; }
      if (n > 0 && src !== 'ghost' && src !== 'gate') n = U.r4(n * (this.diff.cour || 1));   // 傳送點固定 +6，不乘難度（v0.8.30 使用者定）   // 難度加成：簡單 ×1.4、一般 ×1.25、困難 ×1.15（魄煙滅是這一重的比例，不乘）
      p.cour += n;
      const l = this.level();
      if (l > l0) {
        let extra = '';
        if (l === SHIP_LEVEL) extra = '可以造孤帆與方舟了。';
        else if (l === TOTEM_LEVEL) extra = '五件衣甲穿齊、其中至少一件鎢鋼，衣上便浮出山海衣的獸紋：七格內獸慢而狠，你的攻擊 ×1.15。';
        else if (l > TOTEM_LEVEL && (l - TOTEM_LEVEL) % 7 === 0) extra = '山海衣再深一層：攻擊再 ×1.15，受傷再 ÷1.15。';
        else if (l === KILL_ONLY_LEVEL) extra = '從此膽氣只從斃敵對的生靈得來：白日八成、夜裡加半成。';
        else if (l === DECAY_LEVEL + 1) extra = '過了卅一重，三日一減，不低於卅一重。';
        this.toast('膽氣又進一重', '第 ' + l + ' 重：回復 ' + Math.round(this.mult() * 100) + '%。' + extra); SFX.learn();
        this.barSig = '';
      }
      return n;
    }
    dropLevels(n) {          // 直接掉 n 重，保留這一重裡的進度比例
      const p = this.player, l = this.level(); if (l <= 0 || this.test) return;
      const frac = this.levelFrac(), nl = Math.max(0, l - n);
      p.cour = U.r4(this.levelAt(nl) + frac * levelCost(nl)); p.decayAt = 0; this.courSig = '';
    }
    decayCourage() {
      const p = this.player, l = this.level(); if (l <= this.decayFloor()) return;
      const frac = (p.cour - CUM[l]) / levelCost(l);
      p.cour = Math.min(U.r4(CUM[l] - 1e-4), U.r4(CUM[l - 1] + frac * levelCost(l - 1)));
      this.toast('膽氣衰減', (this.hasGod() ? '身攜神兵，' + ['', '一', '二', '三', '四'][this.decayDays()] + '日一減' : '過了卅一重，三日一減') + '：現在第 ' + this.level() + ' 重。', 6000);
    }
    // 照明：手裡的火把或蠟燭、頭上的燈帽
    heldLight() { if (this.player.snuffT > 0) return 0; const s = this.held(); const it = s && ITEMS[s.n]; return it && it.light ? it.light : 0; }   // 被魄吹熄時手裡的光不算
    hat() { return this.player.worn['帽'] || null; }                                     // 戴在頭上的燈帽才亮
    anyHat() { return this.player.worn['帽'] || this.player.bag.find(s => s.n === '燈帽') || null; }
    hatLight() { const h = this.hat(); return h && h.fuel > 0 ? ITEMS['燈帽'].light : 0; }
    lightRadius() { return Math.max(this.heldLight(), this.hatLight()); }
    hasLight() { return this.lightRadius() > 0; }
    torchLit() { return this.viewDark() > 0.5 && this.hasLight(); }
    playerLight() { return 4.5 - 1.5 * this.viewDark() + this.lightRadius(); }
    canAct() { const p = this.player; return !p.dead && p.knock <= 0 && p.ctrl; }
    vignette() {
      const p = this.player;
      return { red: p.hp < p.hpMax / 2 ? (1 - p.hp / (p.hpMax / 2)) * 0.6 : 0, green: p.poisonT > 0 ? 0.45 : 0, blue: p.insane ? 0.55 : p.swimming ? 0.4 : (p.san < 20 ? 0.25 : 0) };
    }

    // ---------- 主迴圈 ----------
    panelOpen() {   // v0.8.30 使用者定：面板一打開遊戲就停（野外開著面板不安全）——製作、地圖、見聞錄、生存之道、碑文、櫃、灶、鼎、荷包、傳送、船
      if (!this.panelEls) this.panelEls = PANELS.map(id => $(id)).filter(Boolean);
      return this.panelEls.some(e => !e.classList.contains('hidden'));
    }
    frame(ts) {
      const dt = Math.min(0.05, (ts - this.last) / 1000 || 0.016); this.last = ts;
      const p = this.player, halt = this.paused || this.panelOpen();
      if (halt !== this.halted) { this.halted = halt; document.body.classList.toggle('halted', halt); }   // v0.9.4：停著時 HUD 上一閃一閃的也停（style.css 的 body.halted）
      if (!halt) {
        this.animT = (this.animT || 0) + dt;   // 畫面動畫的鐘（v0.9.4）：只在遊戲走的時候走
        if (p.knock > 0) {                       // 昏迷：五倍速過一刻，周圍照常
          const step = Math.min(dt * 5, p.knock);
          this.keys.clear(); this.action = null;
          this.update(step);
          p.knock -= step;
          $('knock-left').textContent = '還有 ' + Math.ceil(p.knock) + ' 息';
          if (p.knock <= 0) this.wake();
        } else this.update(dt);
      }
      const rdt = halt ? 0 : dt;   // v0.9.4 使用者定：開著任何介面（製作、大地圖、灶、鼎……）或暫停時，連畫面也停住——雨絲、水光、火苗、字的晃動都不動
      this.tiltTick(rdt);   // 共工的空：畫面斜三度（v0.9）
      this.renderer.draw(this, rdt, this.animT || 0);
      if (this.gaze) this.gazeTick(rdt, !halt);   // 觀星：天空畫在地上那張上面（v0.9.16）
      { const wx = this.wxHere(); SFX.rain(!halt && (wx === 'rain' || wx === 'thunder')); }   // 乾地上聽不到雨（v0.9.17）
      if (!$('map').classList.contains('hidden')) { this.mapAcc += dt; if (this.mapAcc > 0.5) { this.mapAcc = 0; this.renderer.drawBigMap(this, $('bigmap')); } }
      requestAnimationFrame((t) => this.frame(t));
    }
    update(dt) {
      const p = this.player;
      this.world.tick(dt, p.x, p.y);
      if (this.day() !== p.lastDay) this.newDay();
      this.handleMove(dt);
      if (p.sailing && p.ship && p.ship.skulls && p.ship.skulls.length) {   // 船頭的首骨到期風化
        const gone = p.ship.skulls.filter(x => x[1] <= this.world.time).map(x => x[0]);
        if (gone.length) { this.shipSkulls(p.ship); this.message('船頭的' + gone.join('、') + '風化了' + (p.ship.skulls.length ? '，還有' + p.ship.skulls.map(x => x[0]).join('、') + '鎮著。' : '，船頭空了。')); }
      }
      this.checkFog();
      this.checkWarn();
      this.tickStove(); this.tickDing();
      this.updateAction(dt);
      this.ents.update(dt, this);
      if (this.player.azure) { this.mendAcc = (this.mendAcc || 0) + dt; if (this.mendAcc >= 1) { this.mendShips(this.mendAcc); this.mendAcc = 0; } }
      this.weatherTick(dt);
      this.fishTick(dt);   // 垂釣（v0.9.17）
      this.wuhouTick(dt);   // 物候冊（v0.9.19）
      this.updateStats(dt);
      for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.t += dt; if (f.t >= f.dur) this.fx.splice(i, 1); }
      this.saveAcc += dt; if (this.saveAcc > 20) { this.saveAcc = 0; this.save(); }
      this.updateHUD();
    }
    newDay() {
      const p = this.player; p.lastDay = this.day();
      let fermented = 0;
      for (let i = p.bag.length - 1; i >= 0; i--) {
        const s = p.bag[i];
        if (s.n !== '果' || s.inf) continue;
        const ds = this.fruitDays(s);
        let k = 0; while (k < ds.length && p.lastDay - ds[k] >= FERMENT_NIGHTS) k++;   // 由陳到新，前面幾顆放滿了十五夜
        if (!k) continue;
        ds.splice(0, k); s.c -= k; fermented += k;
        if (s.c <= 0) p.bag.splice(i, 1);
      }
      if (fermented) {
        const left = this.addItem('醉果', fermented);
        if (left > 0) this.addItem('果', left, { d: p.lastDay - FERMENT_NIGHTS });   // 囊滿放不下的，先留在果裡，明天再醉
        this.toast('果子醉了', (fermented - left) + ' 顆放滿十五夜的果變成了醉果' + (left > 0 ? '，囊滿，還有 ' + left + ' 顆沒處放' : '') + '。吃了昏迷一刻；二醉果合一淡水成酒。');
      }
      this.buildBag();
    }

    // ---------- 生存數值：命、飽、暖、力、愜意 ----------
    content() { const p = this.player; return p.food >= CONTENT_AT && p.warm >= CONTENT_AT && p.sta >= p.staMax * CONTENT_AT / 100; }   // 飽暖力都九成以上
    snowDrain() { const p = this.player; return p.snowT > SNOW_GRACE ? Math.min(SNOW_MAX, SNOW_RATE + SNOW_RAMP * (p.snowT - SNOW_GRACE)) : 0; }   // 雪域每息多掉的暖：第六息 1.1、第二十息 2.5、三十五息起封頂 4
    updateStats(dt) {
      const p = this.player, w = this.world, m = this.mult();
      if (this.test) this.fillTest();
      const tile = w.get(p.x, p.y), td = DB[tile];
      p.caveK = U.clamp((p.caveK || 0) + ((td.cave ? 1 : 0) - (p.caveK || 0)) * Math.min(1, dt * 1.5), 0, 1);   // 進出洞窟，眼前一兩息內暗下來、亮回去
      const dark = this.viewDark(), desert = td.desert && !p.sailing;
      const drain = this.ironDrain();
      p.food = Math.max(0, p.food - dt * 0.14 * drain * this.diff.hunger * this.mealK('稷'));   // 簡單餓得慢兩成（v0.6.10）；稷粥那一頓慢四分之一（v0.9.18）
      const nearSnow = w.nearChar(p.x, p.y, '雪', SNOW_R);   // 雪域：五格內待久了越來越冷
      p.snowT = nearSnow ? (p.snowT || 0) + dt : 0; if (!nearSnow) p.warned.snow = false;
      p.heatT = Math.max(0, (p.heatT || 0) - dt);            // 烤食的熱氣慢慢散
      const snowHere = w.wxAt(p.x, p.y) === 'snow', snowStill = snowHere && (p.stillT || 0) >= SNOW_STILL && !td.shelter && !w.heatNear(p.x, p.y, 2) && !this.indoors();   // 雪天在屋外站著不動（v0.9.15）
      if (!snowHere) p.warned.snowStill = false;
      let dw;
      if (td.shelter) dw = 5;
      else if (w.heatNear(p.x, p.y, 2)) dw = 4;
      else {
        dw = dark > 0.5 ? -0.7 : 1.5;
        if (tile === '雪') dw -= 1.2;
        if (desert && dark > 0.5) { dw -= DESERT_COLD; if (!p.warned.desertNight) { p.warned.desertNight = true; this.toast('大漠夜寒', '太陽一落，沙漠冷得刺骨，暖每息再 −' + DESERT_COLD + '。生個火、穿上內襯。'); } }
        if (p.snowT > SNOW_GRACE) { dw -= this.snowDrain(); if (!p.warned.snow) { p.warned.snow = true; this.toast('寒氣逼人', '離雪域太近，暖越掉越快。離遠些、生個火；或吃口烤的，熱氣九十息內凍不傷命。'); } }
        if (td.kind === 'water') dw -= 1.0;
        if (snowStill) { dw -= SNOW_STILL_WARM; if (!p.warned.snowStill) { p.warned.snowStill = true; this.toast('站著挨凍', '雪天在屋外站了二十息不動：暖每息多掉 ' + SNOW_STILL_WARM + '、力不回反掉（每息 −' + SNOW_STILL_STA + '）。走動走動、進屋、靠著火就好。'); } }
        if (dw < 0) { if (this.wornWarm()) dw *= 0.5; if (this.torchLit()) dw *= 0.4; dw *= this.mealK('菽'); }   // 豆羹那一頓暖掉得慢四分之一（v0.9.18）
      }
      p.warm = U.clamp(p.warm + dw * dt, 0, 100);
      if (w.nearChar(p.x, p.y, '泉', 1)) { p.hp = Math.min(p.hpMax, p.hp + 2 * dt); p.warm = Math.min(100, p.warm + 1.5 * dt); }
      if (tile === '湯') {           // 泡溫泉：暖（旁邊兩格就暖，見 heatNear）、命、愜意都回
        p.hp = Math.min(p.hpMax, p.hp + SPRING_HP * dt); p.san = Math.min(100, p.san + this.sanUp(SPRING_SAN * dt));
        if (!p.warned.spring) { p.warned.spring = true; this.toast('泡溫泉', '暖烘烘的：命每息 +' + SPRING_HP + '、愜意 +' + SPRING_SAN + '，旁邊兩格也暖。'); }
      }
      if (!p.sailing && w.nearChar(p.x, p.y, '熔', 1)) {   // 貼著熔岩：燙傷
        this.hurt(LAVA_BURN * dt, '灼', { name: '熔岩' }); p.hurtT = Math.max(p.hurtT, 1);
        if (!p.warned.lava) { p.warned.lava = true; this.toast('燙！', '貼著熔岩站，命每息 −' + LAVA_BURN + '。退開一格就好；兩格內取暖倒是不錯。'); }
      } else if (p.warned.lava && !w.nearChar(p.x, p.y, '熔', 3)) p.warned.lava = false;
      // 手裡的光會燒
      const hs = this.held(), hit = hs && ITEMS[hs.n];
      if (p.fearT > 0) p.fearT = Math.max(0, p.fearT - dt * (this.mealOn('文鰩') ? 2 : this.mealOn('黍') ? 1 / this.mealCut() : 1));   // 黍糕那一頓懼消得快（v0.9.18）   // 懼（v0.8.6）：出不了手；烤文鰩魚消得快一倍（v0.9.17）
      if (p.confuseT > 0) { p.confuseT = Math.max(0, p.confuseT - dt * (this.mealOn('文鰩') ? 2 : 1)); if (!p.confuseT) this.message('頭不暈了，方向回來了。'); }   // 亂（v0.8.25）：方向鍵轉九十度
      if (p.snuffT > 0) { p.snuffT = Math.max(0, p.snuffT - dt); if (!p.snuffT && hit && hit.light) this.message('手裡的「' + hs.n + '」又點著了。'); }
      if (dark > 0.5 && hit && hit.light && hit.life && !(p.snuffT > 0)) {
        p.burn[hs.n] = (p.burn[hs.n] || 0) + dt;
        if (p.burn[hs.n] >= hit.life) { p.burn[hs.n] = 0; this.removeItem(hs.n, 1); this.message('一支' + hs.n + '燃盡了。'); }
      }
      const hat = this.hat();
      const otherLight = w.lightNear(p.x, p.y, 3) || this.heldLight() > 0 || this.ents.dragonNear(p.x, p.y, 3);   // 三格內有別的光，燈帽先熄著
      if (dark > 0.5 && hat && hat.fuel > 0 && !otherLight) { hat.fuel = Math.max(0, hat.fuel - dt * (this.ents.ghostNear(p.x, p.y, 2) ? HAT_GHOST_BURN : 1));   // 魄兩格內：蠟燭燒三倍快
        if (hat.fuel <= 0) { this.toast('燈帽暗了', '蠟燭燒完了。選中蠟燭按 V 續上。'); this.barSig = ''; } }
      // 力：每兩息回一點；愜意：每十五息掉一點
      if (p.swimming) p.sta = Math.max(0, p.sta - 0.5 * this.swimK() * dt);       // 游泳：力不回，反而每息掉 0.5（水性減半）
      else if (desert && dark <= 0.5 && !this.indoors() && !this.mealOn('鰼鰼')) {   // 大漠的白天：烈日當頭，力不回反掉（烤鰼鰼魚：食之不癉，v0.9.17）
        p.sta = Math.max(0, p.sta - DESERT_STA * dt);
        if (!p.warned.desertDay) { p.warned.desertDay = true; this.toast('烈日當頭', '大漠的白天，力不回反掉（每息 −' + DESERT_STA + '）。找綠洲、走陰涼的岩丘，或趁夜趕路——夜裡又冷。'); }
      }
      else if (snowStill) p.sta = Math.max(0, p.sta - SNOW_STILL_STA * dt);   // 雪天站著不動：力不回反掉（v0.9.15）
      else p.sta = Math.min(p.staMax, p.sta + 0.5 * m * dt);
      if (!desert) { p.warned.desertDay = false; p.warned.desertNight = false; }
      if (this.diff.god.sta && this.hasGod()) p.sta = Math.max(0, p.sta - this.diff.god.sta * dt);   // 困難：神兵壓身，力慢慢掉
      if (p.swimming) {
        p.swimT -= dt * (p.azure ? SWIM_AZURE : 1) * this.mealK('陵魚') * this.mealK('稻');   // 烤陵魚：撐得久四分之一（v0.9.17）   // 青龍教的水性：倒數慢四分之一（v0.8.2）
        if (p.swimT <= 0 && this.has('木板')) { this.removeItem('木板', 1); p.swimT += PLANK_SWIM; this.buildBag(); this.message('抱住一塊木板，多撐 ' + PLANK_SWIM + ' 息。' + (this.has('木板') ? '還有 ' + this.count('木板') + ' 塊。' : '最後一塊了。')); }
        this.tickDeploy(dt);
        if (p.swimming && p.swimT <= 0) { p.hp = 0; this.die('溺'); if (!p.dead) this.trialTick(dt); return; }   // 玄武鎖著命時溺不死，但鎖照樣倒數（v0.8.15 自查）
      }
      if (tile === '沼' && !p.sailing) {           // 陷在沼裡：力不回反掉、身子發冷；力耗光就跟累倒一樣掉命
        p.sta = Math.max(0, p.sta - BOG_STA * dt); p.warm = Math.max(0, p.warm - BOG_WARM * dt);
        if (!p.warned.bog) { p.warned.bog = true; this.toast('陷進沼澤', '一步一拖，力一直掉、身子發冷，力耗光就要掉命。退出去，或選中棧面向沼按 F 搭上棧（木四成棧二）。'); }
      } else if (p.warned.bog) p.warned.bog = false;
      if (this.content()) p.san = Math.min(100, p.san + this.sanUp(SAN_REST * m * dt));   // 吃飽穿暖有力氣：心裡踏實，愜意慢慢回
      else p.san = Math.max(0, p.san - dt / 15 * drain);
      this.sanAcc += dt;
      if (this.sanAcc >= 60) {                     // 每分鐘：鹿呦、鳥鳴、海浪各 +1
        this.sanAcc = 0; const heard = [];
        if (this.ents.nearOf('鹿', p.x, p.y, 10)) heard.push('鹿呦');
        if (this.ents.nearOf('鳥', p.x, p.y, 10)) heard.push('鳥鳴');
        if (w.nearChar(p.x, p.y, '淼', 8)) heard.push('海浪');
        if (heard.length) { p.san = Math.min(100, p.san + this.sanUp(heard.length * m)); this.fx.push({ type: 'float', x: p.x, y: p.y, text: heard.join(' ') + ' +' + heard.length, color: G.INK.water, t: 0, dur: 1.4 }); }
      }
      // 魄：四格內、身上與三格內都無光，蝕心耗力（一般簡單每息 −4、困難 −5）；屋裡沒燈而八格內有魄繞著，愜意也緩緩掉
      const unlit = dark > 0.5 && !this.hasLight() && !w.lightNear(p.x, p.y, 3);
      if (unlit && !this.ents.ghostNear(p.x, p.y, 4) && this.ents.ghostNear(p.x, p.y, ROOM_DREAD_R) && this.indoors()) {
        p.san = Math.max(0, p.san - ROOM_DREAD * dt);
        if (!p.warned.dread) { p.warned.dread = true; this.toast('屋外有魄', '屋裡沒燈，心裡發毛，愜意慢慢掉。屋裡點一盞燈（三格內），魄就近不了。', 7000); }
      }
      if (unlit && this.ents.ghostNear(p.x, p.y, 4)) { p.san = Math.max(0, p.san - this.diff.ghostSan * dt * this.mealK('冉遺')); p.sta = Math.max(0, p.sta - 2 * dt * drain); if (!p.warned.drain) { p.warned.drain = true; this.toast('魄近身', '心裡發涼，手腳發軟。點亮火把或蠟燭。'); } }
      this.chokeTick(dt);   // 窒（v0.8.25）：鎖喉，力與愜意掉，力光了照力盡掉命
      this.fireTick(dt);    // 畢方的訛火（v0.8.25）
      this.gongTick(dt);    // 共工的淖、泥、焦（v0.9）
      // 毒
      if (p.poisonT > 0) { p.poisonT -= dt; const pk = this.mealK('何羅'); if (p.poisonBy) this.bossPoison(p.poisonPer * dt * pk); else p.hp = Math.max(0, p.hp - p.poisonPer * dt * pk); if (p.poisonT <= 0) { p.poisonPer = 0; p.poisonBy = null; this.message('毒勁過了。'); } }
      p.hurtT = Math.max(0, p.hurtT - dt); p.atkT = Math.max(0, p.atkT - dt);
      // 命：飽、暖、力、愜意都在七成五以上才回（v0.4.13 前是飽愜力八成）；餓、凍、力盡都耗。先看是不是已經沒命了，免得回血把零命救回來
      if (p.hp <= 0) { this.die(this.deathCause()); return; }
      let dh = 0;
      if (p.food <= 0) dh -= 2;
      if (p.warm <= 0 && p.heatT <= 0) dh -= 3;   // 有熱氣時凍不傷命
      if (p.sta <= 0) dh -= 2;
      if (dh === 0 && p.hurtT <= 0 && p.food >= 75 && p.warm >= 75 && p.san >= 75 && p.sta >= 75) dh = 1 * m * (this.mealOn('赤鱬') ? 1 / this.mealCut() : 1);   // 烤赤鱬：回命快（v0.9.17）
      p.hp = U.clamp(p.hp + dh * dt, 0, p.hpMax);
      // 神志：愜意歸零則時能控時失控，失控越來越長
      if (p.san <= 0) {
        if (!p.insane) { p.insane = true; p.ctrl = true; p.ctrlT = 2; p.zeroSan = 0; this.toast('神志不清', '畫面泛藍，手腳不聽使喚。做點東西、吃點好的、睡一覺。'); }
        p.zeroSan += dt; p.ctrlT -= dt;
        if (p.ctrlT <= 0) { p.ctrl = !p.ctrl; p.ctrlT = p.ctrl ? 2 : Math.min(8, 2 + p.zeroSan / 10); if (!p.ctrl) this.action = null; }
      } else if (p.insane && p.san >= 10) { p.insane = false; p.ctrl = true; p.zeroSan = 0; this.message('神志清明了些。'); }
      // 提醒
      if (p.food < 25 && !p.warned.food) { p.warned.food = true; this.toast('腹中空空', '摘野果、捉魚、獵鹿。生食傷身，灶上烤之。'); }
      if (p.food >= 40) p.warned.food = false;
      if (p.warm < 30 && !p.warned.warm) { p.warned.warm = true; this.toast('寒意侵身', '六石成灶，添木取暖；棉可為衣。'); }
      if (p.warm >= 50) p.warned.warm = false;
      if (p.san < 25 && !p.warned.san) { p.warned.san = true; this.toast('鬱鬱寡歡', '愜意快盡了。做點東西 +8，睡床 +20，果酒 +20，聽聽鹿呦鳥鳴海浪。'); }
      if (p.san >= 40) p.warned.san = false;
      const nn = this.nightNo();
      if (nn === this.diff.ghost - 1 && dark > 0.5 && !p.warned.eve) { p.warned.eve = true; this.toast('第 ' + nn + ' 夜', '明晚起，魄夜行。備好火把、蠟燭或燈帽。', 8000); }
      if (this.snowCalm() && this.darkness() > 0.5 && nn >= this.diff.ghost && !p.warned['s' + nn]) { p.warned['s' + nn] = true; this.toast('雪夜', '第 ' + nn + ' 夜下著雪。開局頭十天，雪夜裡魄不出來；雪一停，魄照樣來。'); }
      if (this.ghostNight() && !p.warned['g' + nn]) { p.warned['g' + nn] = true; this.toast('第 ' + nn + ' 夜', '魄來了。牠們穿得過磚；身上的光只逼得退，牠們會撲上來吹燈。燈、火、旺灶三格內才燒得死。', 8000); }
      // 衣甲：一百八十日勻速穿破；挨打那一輪過了十五息，加速便固定下來
      const win = p.hitWin;
      if (win.n && w.time - win.start > 15) { for (const s of this.wornList()) s.wm = Math.min(WEAR_CAP, (s.wm || 1) * HIT_MULT[win.n]); win.n = 0; }
      const wearRate = HIT_MULT[win.n] || 1;
      for (const k of SLOT_ORDER) {
        const s = p.worn[k]; if (!s || s.dur === undefined || this.test) continue;   // 測試格：衣甲不舊
        s.dur -= dt * (s.wm || 1) * wearRate;
        if (s.dur <= 0) { p.worn[k] = null; this.barSig = ''; this.toast('「' + s.n + '」穿破了', '壽命到頭了。'); SFX.fail(); }
      }
      // 膽氣過了卅一重，三日一減，不低於卅一重
      if (!this.test && this.level() > this.decayFloor()) {
        if (!p.decayAt) p.decayAt = w.time + this.decayDays() * DAY;
        else if (w.time >= p.decayAt) { this.decayCourage(); p.decayAt = w.time + this.decayDays() * DAY; }
      } else p.decayAt = 0;
      // 渡海：開出這張紙（v0.7 起 2500×2500，v0.9.5 第四版 1600×1600）
      if (p.sailing && !p.crossed && (p.x < -G.WORLD_R || p.y < -G.WORLD_R || p.x >= G.WORLD_R || p.y >= G.WORLD_R)) this.crossSea();   // v0.7：整張紙 2500×2500（v0.9.5 起 1600×1600），開出方框才是渡海
      { const z = G.zoneAt(p.x, p.y, this.seed), wet = z && (z.type === 'deep' || z.type === 'lake'), onLand = !p.sailing && !p.swimming && td.kind !== 'water';   // v0.8.4 四方地界：水的開進方圓 r 格、陸的登上島就算到了
        if (z && !(p.zones || {})[z.id] && (wet ? Math.hypot(p.x - z.x, p.y - z.y) <= z.r : onLand)) this.enterZone(z);
        if (onLand && !(z && !wet)) {
          if (G.GEN >= 3) { const m = G.massAt(p.x, p.y, this.seed); if (m && m.area > G.MASS_MIN && !m.home && !m.zone && !(p.masses || {})[m.id]) this.landMass(m); }   // v0.8.27：第三版是陸塊
          else { const isl = G.isleOf(p.x, p.y, this.seed); if (isl && !(p.isles || {})[isl.id]) this.landIsle(isl); } }
        if (G.GEN >= 3) this.netGates(); }
      this.purseAcc = (this.purseAcc || 0) + dt; if (this.purseAcc >= 1) { this.purseAcc = 0; this.purseTick(); }   // v0.8.27 荷包的期限
      this.bossTick(dt);   // v0.8.7 魔王的地界與戰事
      this.trialTick(dt);  // v0.8.8 玄武的試煉
      if (this.test) this.fillTest();
      if (p.hp <= 0) this.die(this.deathCause());
    }
    deathCause() {      // 死因：剛挨的那一下（半息內）打死的就是傷——中著毒、餓著時死在魔王手上，膽氣照樣只減四成（v0.8.13；原本一半）（v0.8.8）
      const p = this.player, lh = p.lastHit; if (lh && this.world.time - lh.t <= 0.5) return '傷';
      return p.food <= 0 ? '餓' : p.warm <= 0 ? '凍' : p.sta <= 0 ? '累' : p.poisonT > 0 ? '毒' : '傷';
    }
    die(cause) {
      const p = this.player, w = this.world;
      if (this.test) { this.fillTest(); return; }   // 測試格不會死（v0.8.10）
      if (p.trial || p.trialLockT > 0) { p.hp = Math.max(p.hp, 1); if (p.trial) this.trialSave(); return; }   // 影子不取人命（v0.8.10）：試煉中、玄武鎖著命時死不了
      p.dead = true; p.deaths++; p.knock = 0; $('knock').classList.add('hidden');
      const lh = p.lastHit, big = !!(lh && lh.big && w.time - lh.t <= LAST_HIT_T && cause === '傷');   // 死在神獸、魔王、共工手上：膽氣只掉四成（v0.8.13；v0.8.5 起原本是一半）
      p.deathKeep = this.idleOn('death') ? 1 : big ? BIG_DEATH : DEATH_KEEP;   // 閒遊（v0.9.19）：死了不減膽氣
      const fought = p.fight && !p.fight.away ? BOSSES[p.fight.id] : null, hung = p.fight && p.fight.away ? BOSSES[p.fight.id] : null;
      const f0 = p.fight; if (f0) { this.endFight(); this.ents.list = this.ents.list.filter(o => !(o.type === '豬' && o.callBy)); }   // 死了這一場就結束（v0.8.12 使用者定，不算同一場）：魔王回窩養好傷，時限下一場重算
      const cancel = this.cancelRound(f0);   // v0.8.13 使用者定：死了也取消這一輪沒取經的加成與指定
      if (p.trial) this.endTrial();   // 試煉中死了：影子散了（v0.8.8）
      const drop = p.bag.concat(p.tools, this.wornList(), p.hold || []);   // 船艙裡的船也落在荷包裡（v0.8.19）
      for (const s of drop) if (s.dur !== undefined) s.dur = Math.max(1, U.r4(s.dur / 2));   // 留下的東西，有耐久的全打對折（可修）
      const landOk = (x, y) => { const d = w.info(x, y); return d.walk > 0 && d.kind !== 'object' && d.kind !== 'place' && !w.stele(x, y) && DB[w.raw(x, y)].kind !== 'water' && w.raw(x, y) !== '灘'; };
      if (p.sailing) {           // 船停在最近的淺水上
        const sv = this.shipNow();
        if (!this.parkShip(p.x, p.y, true, 60) && sv) { const keep = { hp: U.r4(sv.hp), skulls: this.shipSkulls(sv), repairs: sv.repairs || 0 }; drop.push({ n: sv.kind, c: 1, ship: keep }); p.ship = null; }   // v0.9.14 自查：遠海六十格內沒有淺水停，就跟船艙裡的船一樣落進荷包（原本整艘沒了）
        p.sailing = false;
      }
      let purse = null;
      if (drop.length) {   // v0.8.27 使用者定：不管死在哪裡（魔王戰裡也一樣），荷包一律落在原點附近的空地，不蓋掉那裡的荷包、櫃；重生後十八日內（不算死的那一天）沒取就沒了
        const today = Math.floor(w.time / DAY) + 1, day = today + PURSE_DAYS, until = U.r4(day * DAY), z = p.deaths, prev = this.pursePrev(today);
        for (const s of drop) s.dz = z;   // 每一回的遺物記是第幾回死的（併進同一個荷包以後，擠掉、過期都照這個分）
        if (prev) {   // v0.8.28 使用者定：上一回死不到五日、那個荷包還在地上，這回的東西併進去；一個荷包最多三回的遺物，多了擠掉最早那回
          const [k, r] = prev; let out = null;
          const was = this.deathDay(r.deaths[r.deaths.length - 1]); w.bags.get(k).push(...drop); r.deaths.push({ t: U.r4(w.time), day: today, z, until });
          while (r.deaths.length > PURSE_KEEP) { out = r.deaths.shift(); w.bags.set(k, w.bags.get(k).filter(s => s.dz !== out.z)); }
          r.until = Math.max(...r.deaths.map(d => d.until)); const [x, y] = U.unkey(k);
          purse = { x, y, day, merged: r.deaths.length, first: Math.round(Math.min(...r.deaths.map(d => d.until)) / DAY), out, was, today };
        } else {
          const spot = this.nearestTile(0, 0, landOk, 60) || this.nearestTile(this.spawn.x, this.spawn.y, landOk, 60) || [this.spawn.x, this.spawn.y];
          const sk = U.key(spot[0], spot[1]), was = w.get(spot[0], spot[1]);
          w.set(spot[0], spot[1], '包'); w.bags.set(sk, drop); w.purses.set(sk, { until, was, deaths: [{ t: U.r4(w.time), day: today, z, until }] });
          purse = { x: spot[0], y: spot[1], day };
        }
        p.bag = []; p.tools = []; p.tool = -1; p.hold = []; p.holdSel = -1; for (const k of SLOT_ORDER) p.worn[k] = null;
      }
      this.paused = true;
      p.deadText = '第 ' + this.day() + ' 日，你' + ({ '餓': '餓死了', '凍': '凍死了', '傷': '傷重而亡', '毒': '毒發身亡', '累': '力竭而亡', '溺': '沒能游上岸，溺死了' })[cause] + (big ? '（' + lh.by + '）' : '') + '。<br>' + (!purse ? '' : purse.merged ? '第 ' + purse.was + ' 日死時的荷包還在原點附近（' + purse.x + ', ' + purse.y + '），跟今日（第 ' + purse.today + ' 日）相差不過五日，這回的東西併了進去（有耐久的都折了一半），裡頭現在有 ' + purse.merged + ' 回的遺物、分 ' + purse.merged + ' 檔' + (purse.out ? '；一個荷包最多三回，最早那回的擠出去、沒了' : '') + '。每一回的遺物各自十八日：最早到期的那份在第 ' + purse.first + ' 日過完以前要取，這回的到第 ' + purse.day + ' 日。' : '荷包落在原點附近（' + purse.x + ', ' + purse.y + '），有耐久的東西都折了一半。重生後十八日內（第 ' + purse.day + ' 日過完以前）去取，過了就沒了。') + (big ? '死在' + lh.by + '手上，膽氣只減四成。' : '膽氣減六成。') + (fought ? fought.zone + '回' + fought.place + '去了，養回滿命；這一場算結束了。' : hung ? '跟' + hung.zone + '那一場也算結束了。' : '') + (cancel ? '<br>' + cancel : '');
      this.showDead();
      this.save();
    }
    pursePrev(today) {   // v0.8.29 使用者定：照死的日期比（不看幾時）——上一回死的那日到今日相差五日以內（PURSE_MERGE）、荷包還在地上的那一個（不只一個就挑最近死的）；回傳 [key, 紀錄] 或 null
      const w = this.world; let best = null;
      for (const [k, r0] of w.purses) {
        const [x, y] = U.unkey(k); if (w.get(x, y) !== '包' || !w.bags.has(k)) continue;
        const r = this.purseRec(k, r0), last = r.deaths[r.deaths.length - 1];
        if (last && today - this.deathDay(last) <= PURSE_MERGE && (!best || last.t > best[2])) best = [k, r, last.t];
      }
      return best ? [best[0], best[1]] : null;
    }
    deathDay(d) { return d.day || Math.floor(d.t / DAY) + 1; }   // 第幾日死的（v0.8.28 的紀錄沒寫 day，從時刻算）
    purseRec(k, r) {     // v0.8.27 的荷包沒記是哪一回死的：當作一回、死在到期前十九日的清早
      if (!r.deaths) { r.deaths = [{ t: U.r4(r.until - (PURSE_DAYS + 1) * DAY), z: -1, until: r.until }]; for (const s of this.world.bags.get(k) || []) if (s.dz === undefined) s.dz = -1; }
      return r;
    }
    purseTick() {        // 荷包取走了就不記；每一回的遺物各自過了十八日就沒了，全沒了荷包也沒了（v0.8.27；v0.8.28 一個荷包裝得下幾回）
      const w = this.world; if (this.idleOn('purse')) return;   // 閒遊（v0.9.19）：荷包不過期
      for (const [k, r0] of [...w.purses]) {
        const [x, y] = U.unkey(k);
        if (w.get(x, y) !== '包' || !w.bags.has(k)) { w.purses.delete(k); continue; }
        if (w.time < Math.min(r0.until, ...(r0.deaths || []).map(d => d.until))) continue;
        const r = this.purseRec(k, r0), gone = new Set(r.deaths.filter(d => w.time >= d.until).map(d => d.z));
        const rest = w.bags.get(k).filter(s => !gone.has(s.dz === undefined ? -1 : s.dz)); r.deaths = r.deaths.filter(d => !gone.has(d.z));
        if (!rest.length || !r.deaths.length) {
          w.bags.delete(k); w.set(x, y, r.was && r.was !== '包' ? r.was : '草'); w.purses.delete(k);
          this.toast('荷包沒了', '原點附近（' + x + ', ' + y + '）那個荷包過了十八日沒人來取，連東西一起散了。', 8000); SFX.fail();
        } else {
          w.bags.set(k, rest); r.until = Math.max(...r.deaths.map(d => d.until));
          this.toast('荷包裡少了一份', '原點附近（' + x + ', ' + y + '）那個荷包，最早那回的遺物過了十八日，散了；其餘的還在，最早到期的在第 ' + Math.ceil(Math.min(...r.deaths.map(d => d.until)) / DAY) + ' 日過完以前要取。', 8000); SFX.fail();
        }
      }
    }
    purseLeft(x, y) { const r = this.world.purses.get(U.key(x, y)); return r ? Math.max(0, Math.ceil((Math.min(r.until, ...(r.deaths || []).map(d => d.until)) - this.world.time) / DAY)) : null; }   // 這個荷包最早到期的那份還剩幾日（沒有期限的是 null）
    showDead() { this.paused = true; $('dead-text').innerHTML = this.player.deadText || '你死了。'; $('dead').classList.remove('hidden'); }   // v0.8.8：死了的那一刻存了檔，讀進來照樣停在這一幕，不再死第二回
    respawn() {
      const p = this.player, w = this.world;
      const h = p.home, homeOk = h && w.get(h.x, h.y) === '床';
      let at = homeOk ? this.freeNear(h.x, h.y) : this.spawn;
      const landOk = (x, y) => w.walkable(x, y) && DB[w.get(x, y)].kind !== 'water';
      if (!landOk(at.x, at.y)) { const t = this.nearestTile(at.x, at.y, landOk, 40); if (t) at = { x: t[0], y: t[1] }; }   // 出生點被蓋住或淹了，就找最近能站的地
      p.x = p.rx = at.x; p.y = p.ry = at.y; p.moveT = 0;
      p.hp = Math.min(p.hpMax, 60); p.food = 60; p.warm = 60; p.sta = p.staMax; p.san = Math.max(p.san, 50); p.cour = U.r4(p.cour * (p.deathKeep || DEATH_KEEP)); p.deathKeep = 0; p.decayAt = 0; p.hitWin = { start: -99, n: 0 };
      p.swimming = false; p.swimT = 0; p.ship = null; p.deploy = null; p.swimShips = 0;
      p.hurtT = 0; p.dead = false; p.deadText = ''; p.warned = {}; p.poisonT = 0; p.poisonPer = 0; p.poisonBy = null; p.biteN = 0; p.chokeT = 0; p.fearT = 0; p.confuseT = 0; p.insane = false; p.ctrl = true; p.zeroSan = 0; p.sailing = false; p.crossed = false;
      this.action = null;
      { const d = Math.floor(w.time / DAY) + 1; w.time = d * DAY + DAY * (CAL.dawn(d) + 0.01); }   // 復活在次日清晨（日出照節氣，v0.9.17）
      this.ents.list = this.ents.list.filter(e => '虎豹狼蛇蛛魄豬'.indexOf(e.type) < 0);
      this.gatherCompanions();
      $('dead').classList.add('hidden');
      this.paused = false;
      this.toast('一夢方覺，已是清晨', homeOk ? '在你的床邊。' : '在最初的地方。');
      this.buildBag();
    }
    // ---------- 海：船的命、首骨鎮船、蜃、落水 ----------
    shipMax(s) {         // 船的命上限；方舟在還沒斃的修蛇的地界裡只有三分之二（v0.8.16）
      const base = (G.SHIPS[s && s.kind] || G.SHIPS['孤帆']).hp; if (!s || s.kind !== '方舟') return base;
      const at = s === this.player.ship ? this.player : s.cells && s.cells[0] ? { x: s.cells[0][0], y: s.cells[0][1] } : null;
      return at && this.snakeGround(at.x, at.y) ? U.r4(base * ARK_CAP) : base;
    }
    shipSkulls(s) { const now = this.world.time; s.skulls = (s.skulls || []).filter(x => x[1] > now); return s.skulls; }   // 到期的首骨風化、自己掉
    shipWarded() { const s = this.player.ship; return !!(s && this.shipSkulls(s).length); }
    wardDaysOf(s) { const a = this.shipSkulls(s); return a.length ? Math.max(0, Math.ceil((Math.max(...a.map(x => x[1])) - this.world.time) / DAY - 1e-6)) : 0; }   // 鎮到最晚風化的那一個
    wardDays() { return this.player.ship ? this.wardDaysOf(this.player.ship) : 0; }
    shipSkullName() { const s = this.player.ship, a = s ? this.shipSkulls(s) : []; return a.length ? a[0][0] : ''; }
    // v0.8.17 船（使用者定）：船身是一塊長方形（左上角 x0、y0；dir 'v' 南北長、'h' 東西長），人站在船身哪一格都行、用 WASD 走，跟陸上一樣；1 左 2 上 3 下 4 右開船
    shipNow() {   // 身下的船；v0.8.17 前的（或直接給的）還沒有船身位置：人站在錨點（孤帆的船頭、方舟的左邊中間），船身南北長
      const p = this.player, s = p.ship; if (!s) return null;
      if (s.x0 === undefined && p.sailing) { s.dir = s.dir || 'v'; s.x0 = p.x; s.y0 = p.y - (s.kind === '方舟' && s.dir === 'v' ? 1 : 0); }
      return s;
    }
    shipBox() { const s = this.shipNow(); if (!s) return null; const [W, H] = World.shipDims(s.kind, s.dir); return { x: s.x0 + W / 2, y: s.y0 + H / 2, W, H }; }   // 船身的中心（格）與寬長
    shipCells() { const s = this.shipNow(); return s ? this.world.shipFootprint(s.kind, s.x0, s.y0, s.dir) : []; }   // 行船時船身在哪幾格
    onDeck(x, y) { const p = this.player, s = this.shipNow(); if (!p.sailing || !s) return false; const [W, H] = World.shipDims(s.kind, s.dir); return x >= s.x0 && x < s.x0 + W && y >= s.y0 && y < s.y0 + H; }
    shipWater(x, y) { const w = this.world, t = w.get(x, y), r = w.raw(x, y); return (DB[r].kind === 'water' || r === '灘') && DB[t].kind === 'water' && !w.shipCells.has(U.key(x, y)) && !w.placeAt(x, y) && !w.netAt(x, y); }   // v0.8.18 使用者定：漲潮時淹了的沙洲（灘）也過得了船，退潮時 tideShips() 把船挪回海裡   // 船開得上、停得住的水：淺水、深水、湖、河、池都算；灘漲潮也不算（退潮會擱淺）
    shipSize(kind, dir) { const [W, H] = World.shipDims(kind, dir), cn = ['', '一', '二', '三']; return W === H ? cn[W] + '乘' + cn[H] : (dir === 'h' ? '東西長' : '南北長') + '（東西 ' + cn[W] + '、南北 ' + cn[H] + ' 格）'; }   // v0.8.18 起兩種船都是方的
    shipRec(s) { return { kind: s.kind, hp: s.hp, skulls: s.skulls || [], repairs: s.repairs || 0, fid: s.fid, dir: s.dir || 'v', t: s.t }; }   // t：下水的時刻（v0.8.21，船數上限照它找最早的）   // 身下的船停下來時寫進世界的那一份
    frontBlock() { const p = this.player, cx = p.x + 2 * p.fx, cy = p.y + 2 * p.fy, out = []; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) out.push([cx + i, cy + j]); return out; }   // 面前三乘三：從面前那格往前數三格、左右各一格
    frontShip(kind) {   // 放船：船頭朝面對的方向（面朝東西就東西長、朝南北或斜著就南北長），擺在面前三乘三裡、貼著面前那格
      const p = this.player, fx = p.fx, fy = p.fy, dir = fx && !fy ? 'h' : 'v', [W, H] = World.shipDims(kind, dir);
      return { dir, x0: fx > 0 ? p.x + 1 : fx < 0 ? p.x - W : p.x - ((W - 1) >> 1), y0: fy > 0 ? p.y + 1 : fy < 0 ? p.y - H : p.y - ((H - 1) >> 1) };   // 側邊照中間擺：方舟三格寬正好蓋滿三乘三，孤帆二格寬往東（往南）多一格
    }
    sternShip(kind) {   // 落水撐船：人那格是船尾，船頭朝面對的方向
      const p = this.player, fx = p.fx, fy = p.fy, dir = fx && !fy ? 'h' : 'v', [W, H] = World.shipDims(kind, dir);
      return { dir, x0: fx < 0 ? p.x - W + 1 : fx > 0 ? p.x : p.x - ((W - 1) >> 1), y0: fy < 0 ? p.y - H + 1 : fy > 0 ? p.y : p.y - ((H - 1) >> 1) };
    }
    shipStep(dx, dy, want) {   // 1 左 2 上 3 下 4 右：整艘船連人挪一格（v0.8.17）；v0.8.21 使用者定：1、4 東西長，2、3 南北長（斜著開照 want，按下時隨機定的）
      const p = this.player, s = this.shipNow(), w = this.world; if (!p.sailing || !s) return false;
      if (this.coiled()) { this.hintOnce('修蛇纏著船，動不了——打牠的頭（纏著時多吃五成）。'); return false; }   // 長蛇纏舟（v0.8.16）
      const dir = want || (dx && !dy ? 'h' : !dx && dy ? 'v' : s.dir || 'v');
      let x0 = s.x0, y0 = s.y0; if (dir !== (s.dir || 'v')) { const rx = p.x - s.x0, ry = p.y - s.y0; x0 = p.x - ry; y0 = p.y - rx; }   // 轉身：以人站的那格為軸，船身轉九十度
      const badOf = (cells) => cells.find(([x, y]) => !this.onDeck(x, y) && !this.shipWater(x, y)), hit = (cells) => cells.some(([x, y]) => { const e = this.ents.beastAt(x, y); return e && e.type !== '魚'; });   // 撞上獸、蜃、修蛇：過不去（魚從船底下游過）
      let cells = w.shipFootprint(s.kind, x0 + dx, y0 + dy, dir), bad = badOf(cells), turnOnly = false;
      if ((bad || hit(cells)) && dir !== (s.dir || 'v')) { const c2 = w.shipFootprint(s.kind, x0, y0, dir); if (!badOf(c2) && !hit(c2)) { cells = c2; bad = null; turnOnly = true; } }   // 轉了身過不去：原地轉身也算一步
      if (bad) {
        const t = w.raw(bad[0], bad[1]);
        this.hintOnce(w.shipCells.has(U.key(bad[0], bad[1])) ? '前面停著別的船，繞開。' : dir !== (s.dir || 'v') && !turnOnly ? '這裡太窄，' + s.kind + '轉不過身（' + (dir === 'h' ? '往東西開要東西長' : '往南北開要南北長') + '）。' : DB[t].kind !== 'water' || w.placeAt(bad[0], bad[1]) ? '船靠岸了：用 WASD 從船上走下去，船停在原地。' : s.kind + '的船身' + this.shipSize(s.kind, dir) + '，這邊過不去，找寬一點的水。');
        return false;
      }
      if (!turnOnly && hit(cells)) return false;
      s.dir = dir; s.x0 = x0 + (turnOnly ? 0 : dx); s.y0 = y0 + (turnOnly ? 0 : dy);
      p.fromX = p.x; p.fromY = p.y; if (!turnOnly) { p.x += dx; p.y += dy; } p.shipMove = true;
      const deep = cells.every(([x, y]) => w.get(x, y) === '淼') && this.shipWarded() && !this.inBossLand(p.x, p.y) && !this.seaNear(SEA_CLEAR);   // v0.8.20 使用者定：深水上、船頭有獸首骨鎮著時船快 1.8 倍，在（還沒斃的）大魔王地界裡不算；v0.8.21：方圓七格裡還要沒有蜃
      const fast = !this.inBossLand(p.x, p.y) && !this.seaNear(SHEN_NEAR);   // v0.9.6：遇到蜃就是原本的速度（深水加速照舊看方圓七格）
      p.stepDur = 0.14 / ((G.SHIPS[s.kind] || G.SHIPS['孤帆']).speed || 1) * (dx && dy ? 1.3 : 1) / this.ironSpeed() / (deep ? DEEP_SAIL : 1) / (fast ? SAIL_FAST : 1);
      p.moveT = p.stepDur + Math.max(-p.stepDur / 2, Math.min(0, p.moveT || 0));   // v0.9.6：上一步多過的那一點時間接著算——船一幀最多走一格，不接著算的話快了的船會被畫面的幀數卡慢（最多接半步，切出去再回來不會一下竄出去）
      return true;
    }
    shipLoss(s, d) { if (this.test || !s) return; s.hp = Math.max(0, U.r4(s.hp - d)); }   // 船掉命；測試服的測試格船不掉命（v0.8.21 使用者定）
    seaNear(r) { const p = this.player; return this.ents.list.some(e => e.type === '蜃' && U.cheb(e.x, e.y, p.x, p.y) <= r); }   // 方圓 r 格裡有沒有蜃
    // v0.8.18 使用者定：退潮的那一刻船還壓在沙洲上，就瞬移到最近的水（淺水、深水、湖、河都算）；船上的人跟著船走
    tideShips() {
      const w = this.world, p = this.player; if (!w.tideLow()) return;
      const onBar = (cells) => cells.some(([x, y]) => w.base(x, y) === '灘' && w.raw(x, y) !== '水');
      const spotFor = (kind, dir, x0, y0) => { const fits = (i, j) => w.shipFits(kind, i, j, (a, b) => this.shipWater(a, b), dir); return this.nearestTile(x0, y0, fits, 60); };
      for (const [ak, rec] of [...w.ships]) {
        if (!onBar(rec.cells)) continue;
        const x0 = Math.min(...rec.cells.map(c => c[0])), y0 = Math.min(...rec.cells.map(c => c[1])); w.removeShip(ak);
        const at = spotFor(rec.kind, rec.dir, x0, y0); if (at) w.addShip(at[0], at[1], rec); else w.addShip(x0, y0, rec);
        if (at && U.cheb(x0, y0, p.x, p.y) < 30) this.message('退潮了，停在沙洲上的' + rec.kind + '漂回了水裡。');
      }
      const s = p.sailing && this.shipNow();
      if (s && onBar(this.shipCells())) {
        const at = spotFor(s.kind, s.dir, s.x0, s.y0); if (!at) return;
        const ox = p.x - s.x0, oy = p.y - s.y0; s.x0 = at[0]; s.y0 = at[1];
        p.x = p.rx = at[0] + ox; p.y = p.ry = at[1] + oy; p.fromX = p.x; p.fromY = p.y; p.moveT = 0; p.shipMove = false; this.ents.px = p.x; this.ents.py = p.y; this.stopWalk();
        this.toast('退潮了', '沙洲露出水面，' + s.kind + '連人一起漂回了最近的水裡。', 6000);
      }
    }
    jumpTo(x, y) {   // 把人挪到 (x, y)（認輸、退出地界送回地界外）；在船上就連船一起挪，船放不下就換個擺法圍住人
      const p = this.player, s = p.sailing && this.shipNow();
      if (s) { s.x0 += x - p.x; s.y0 += y - p.y; }
      p.x = p.rx = x; p.y = p.ry = y; this.ents.px = x; this.ents.py = y; p.moveT = 0;
      if (s && !this.shipCells().every(([i, j]) => this.shipWater(i, j))) {
        for (const dir of [s.dir, s.dir === 'h' ? 'v' : 'h']) { const [W, H] = World.shipDims(s.kind, dir); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (this.world.shipFits(s.kind, x - i, y - j, (a, b) => this.shipWater(a, b), dir)) { s.dir = dir; s.x0 = x - i; s.y0 = y - j; return; } }
      }
    }
    shipText(s) { const a = this.shipSkulls(s), k = G.SHIPS[s.kind] || G.SHIPS['孤帆']; return s.kind + ' · 命 ' + Math.round(s.hp) + '/' + Math.round(this.shipMax(s)) + ' · 船頭' + (a.length ? a.map(x => x[0]).join('、') + '（' + a.length + '/' + k.slots + '）還鎮 ' + this.wardDaysOf(s) + ' 日' : '空著（放得下 ' + k.slots + ' 個首骨）'); }
    mountSkull(rec, name, st) {   // st：囊裡那一疊（v0.8.21：取下來的首骨帶著還剩幾日，放回去照剩的算）
      if (!rec) return;
      const p = this.player, now = this.world.time, alive = this.shipSkulls(rec), slots = (G.SHIPS[rec.kind] || G.SHIPS['孤帆']).slots;
      if (alive.length >= slots) { this.message(rec.kind + '的船頭只放得下 ' + slots + ' 個首骨，都放滿了：' + alive.map(a => a[0]).join('、') + '。'); SFX.fail(); return; }
      st = st && st.n === name && p.bag.includes(st) ? st : p.bag.find(x => x.n === name && x.dur === undefined) || p.bag.find(x => x.n === name); if (!st) return;
      const days = st.dur !== undefined ? st.dur : ITEMS[name].ward;
      alive.push([name, U.r4(now + days * DAY)]);   // 各鎮各的：從放上去那一刻算，到期風化
      if (st.c > 1 && !st.inf) st.c--; else if (!st.inf) this.takeStack(st); this.barSig = ''; this.buildBag(); SFX.learn(); this.holdSig = ''; this.shipUISig = '';
      this.message('船頭放上' + name + '（' + alive.length + '/' + slots + '）：鎮 ' + Math.max(1, Math.ceil(days - 1e-6)) + ' 日後風化；船頭最久鎮到 ' + this.wardDaysOf(rec) + ' 日後，這段時間蜃不敢近到八格內。');
    }
    unmountSkull(rec, i) {   // v0.8.21 使用者定：放上船頭的首骨也拿得下來；帶著還剩的日子回囊（自成一疊）
      const p = this.player, a = this.shipSkulls(rec), sk = a[i]; if (!sk) return;
      if (this.bagUsed() + 1 > this.slots()) { this.message('囊滿了，拿不下' + sk[0] + '。'); SFX.fail(); return; }
      const left = U.r4(Math.max(0, (sk[1] - this.world.time) / DAY)); a.splice(i, 1);
      p.bag.push({ n: sk[0], c: 1, dur: left }); this.barSig = ''; this.buildBag(); this.holdSig = ''; this.shipUISig = ''; SFX.write();
      this.message('把' + sk[0] + '從船頭拿下來，收進囊（還能鎮 ' + Math.max(1, Math.ceil(left - 1e-6)) + ' 日；放回去照剩的算）。');
    }
    // v0.8.21 使用者定：船的介面（跟灶、鼎一樣）：船上按 C；命、修船的料與成數、船頭的首骨放上拿下
    openShipUI() { const p = this.player; if (!p.sailing || !p.ship) return; this.shipUIOpen = true; this.shipUISig = ''; $('shipui').classList.remove('hidden'); this.keys.clear(); this.action = null; this.buildShipUI(); }
    closeShipUI() { $('shipui').classList.add('hidden'); this.shipUIOpen = false; }
    buildShipUI() {
      if (!this.shipUIOpen) return; const p = this.player, s = p.sailing && p.ship; if (!s) { this.closeShipUI(); return; }
      const k = G.SHIPS[s.kind] || G.SHIPS['孤帆'], f = SHIP_FIX[s.kind] || SHIP_FIX['孤帆'], n = s.repairs || 0, need = this.shipFixCost(s), max = this.shipMax(s), to = this.shipFixTo(s), now = this.world.time, sk = this.shipSkulls(s);
      const bagSk = p.bag.map((x, i) => [x, i]).filter(([x]) => ITEMS[x.n] && ITEMS[x.n].ward);
      const sig = [s.kind, Math.round(s.hp), n, sk.map(x => x[0] + Math.ceil((x[1] - now) / DAY - 1e-6)).join(','), bagSk.map(([x]) => x.n + x.c + (x.dur || '')).join(','), need ? Object.keys(need).map(m => this.count(m)).join(',') : ''].join('|');
      if (sig === this.shipUISig) return; this.shipUISig = sig;
      const pct = (v) => Math.round(v / max * 100) + '%';
      $('shipui-title').textContent = s.kind;
      $('shipui-stat').innerHTML = '命 <b>' + (this.test ? '∞（測試格的船不掉命）' : Math.round(s.hp) + '／' + Math.round(max)) + '</b> · 船身' + this.shipSize(s.kind, s.dir) + ' · 船快' + (k.speed < 1 ? '是孤帆的' + Math.round(k.speed * 10) + '成' : '一倍') + ' · 船頭放得下 ' + k.slots + ' 個首骨';
      $('shipui-fixnote').textContent = '修過 ' + n + '／' + f.cost.length + ' 次；每次修回命上限的' + Math.round((f.to[this.diff.key] || f.to.normal) * 100) + '%（' + this.diff.name + '）';
      $('shipui-fix').innerHTML = need ? '<button data-act="fix"' + (this.hasAll(need) && s.hp < to ? '' : ' disabled') + '><span class="ch">第 ' + (n + 1) + ' 次修</span> <small>' + Object.keys(need).map(m => '<span' + (this.count(m) >= need[m] ? '' : ' class="lack"') + '>' + m + ' ' + num(this.count(m)) + '/' + need[m] + '</span>').join('、') + '，修回到 ' + Math.round(to) + '（' + pct(to) + '）' + (s.hp >= to ? '；船身還好，用不著修' : '') + '</small></button>' + f.cost.slice(n + 1).map((c, i) => '<span class="shelfslot empty">第 ' + (n + 2 + i) + ' 次：' + this.matText(c) + '</span>').join('') : '<span class="shelfslot empty">修滿 ' + f.cost.length + ' 次了，修不了了</span>';
      $('shipui-skullnote').textContent = sk.length + '／' + k.slots + '；有首骨鎮著，蜃不敢近到八格內、深水上船快一點八倍（還沒斃的大魔王地界裡、方圓七格有蜃時不算）';
      $('shipui-skulls').innerHTML = sk.map((x, i) => '<button data-act="off" data-i="' + i + '"><span class="ch">' + x[0] + '</span> <small>還鎮 ' + Math.max(1, Math.ceil((x[1] - now) / DAY - 1e-6)) + ' 日 · 拿下來</small></button>').join('') + Array.from({ length: Math.max(0, k.slots - sk.length) }, () => '<span class="shelfslot empty">空著</span>').join('');
      $('shipui-bag').innerHTML = bagSk.length ? bagSk.map(([x, i]) => '<button data-act="on" data-b="' + i + '"' + (sk.length < k.slots ? '' : ' disabled') + '><span class="ch">' + x.n + '</span> ×' + num(x.c) + ' <small>放上船頭，鎮 ' + Math.max(1, Math.ceil((x.dur !== undefined ? x.dur : ITEMS[x.n].ward) - 1e-6)) + ' 日</small></button>').join('') : '<span class="shelfslot empty">囊裡沒有獸首骨（殺虎、豹、狼有時會掉）</span>';
      $('shipui').querySelectorAll('button[data-act]').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.act; if (a === 'fix') this.repairShip(s); else if (a === 'off') this.unmountSkull(s, +b.dataset.i); else if (a === 'on') { const st = p.bag[+b.dataset.b]; if (st) this.mountSkull(s, st.n, st); }
        this.shipUISig = ''; this.buildShipUI();
      }));
    }
    shipFixCost(rec) { const f = SHIP_FIX[rec.kind] || SHIP_FIX['孤帆'], n = rec.repairs || 0; return n < f.cost.length ? f.cost[n] : null; }   // 下一次修要什麼料；修滿了回 null
    shipFixTo(rec) { const f = SHIP_FIX[rec.kind] || SHIP_FIX['孤帆']; return U.r4(this.shipMax(rec) * (f.to[this.diff.key] || f.to.normal)); }   // 修一次回到多少命
    repairShip(rec) {          // v0.8.19 使用者定：孤帆最多修四次、方舟三次，料照 SHIP_FIX；每次修回命上限的九成／七成五（方舟八成五／七成，困難是後者）
      if (!rec) return;
      const f = SHIP_FIX[rec.kind] || SHIP_FIX['孤帆'], n = rec.repairs || 0, max = this.shipMax(rec), to = this.shipFixTo(rec), need = this.shipFixCost(rec);
      if (!need) { this.message('這艘' + rec.kind + '已經修過 ' + n + ' 次，修不了了（最多 ' + f.cost.length + ' 次）。'); SFX.fail(); return; }
      if (rec.hp >= to) { this.message('船身還有 ' + Math.round(rec.hp) + '/' + Math.round(max) + '，修也只修到 ' + Math.round(to) + '，用不著修。'); return; }
      if (!this.hasAll(need)) { this.message('第 ' + (n + 1) + ' 次修' + rec.kind + '要' + this.matText(need) + '。'); SFX.fail(); return; }
      for (const m in need) this.removeItem(m, need[m]);
      rec.hp = to; rec.repairs = n + 1; this.buildBag(); this.holdSig = ''; SFX.write();
      const next = this.shipFixCost(rec);
      this.message(rec.kind + '修好了：命 ' + Math.round(to) + '/' + Math.round(max) + '（第 ' + (n + 1) + '/' + f.cost.length + ' 次）。' + (next ? '下次要' + this.matText(next) + '。' : '這是最後一次了。'));
    }
    // v0.8.18 收船（使用者定）：F 放下水，再按 F 收回囊裡；只有船身碰到岸才收得回，茫茫海上收不回
    shipCapList(x0, y0) {   // 放一艘到 (x0, y0) 會算進哪一堆：大魔王地界裡的那一堆（三艘），或方圓三十格的那一堆（四艘）
      const w = this.world, boss = Object.keys(BOSSES).find(id => !((this.player.bosses || {})[id]) && (() => { const z = this.bossZone(id); return z && Math.hypot(x0 - z.x, y0 - z.y) <= BOSSES[id].r; })());
      const ships = [...w.ships.entries()].filter(([, r]) => { const c = w.shipCenter(r); if (boss) { const z = this.bossZone(boss); return Math.hypot(c.x - z.x, c.y - z.y) <= BOSSES[boss].r; } return Math.hypot(c.x - x0, c.y - y0) <= SHIP_CAP_R; });
      return { cap: boss ? SHIP_CAP_BOSS : SHIP_CAP, where: boss ? BOSSES[boss].zone + '的地界' : '方圓 ' + SHIP_CAP_R + ' 格', ships: ships.sort((a, b) => (a[1].t || 0) - (b[1].t || 0)) };
    }
    shipCapNote(x0, y0) { const c = this.shipCapList(x0, y0); if (c.ships.length < c.cap) return ''; const o = c.ships[0][1]; return c.where + '裡已經停了 ' + c.ships.length + ' 艘船（最多 ' + c.cap + ' 艘）：再放一艘，最早下水的那艘' + o.kind + '（命 ' + Math.round(o.hp) + (this.shipSkulls(o).length ? '，船頭' + o.skulls.map(x => x[0]).join('、') : '') + '）就會消失，收不回來。'; }
    shipCap(x0, y0) { const c = this.shipCapList(x0, y0); let n = c.ships.length; for (const [ak, o] of c.ships) { if (n < c.cap) break; this.world.removeShip(ak); n--; this.message('最早下水的那艘' + o.kind + '消失了（' + c.where + '最多停 ' + c.cap + ' 艘）。'); } }   // 超過上限：從最早下水的開始消失（v0.8.21 使用者定）
    landBeside(cells) {   // 船身四邊（共邊，不算斜角；v0.8.19 使用者定）站得住人的陸地（灘漲潮也算），沒有就是沒碰到岸
      const w = this.world, seen = new Set(cells.map(([x, y]) => U.key(x, y))), out = [];
      for (const [x, y] of cells) for (const [dx, dy] of N4) {
        const ax = x + dx, ay = y + dy, k = U.key(ax, ay); if (seen.has(k)) continue; seen.add(k);
        const d = w.info(ax, ay); if (((d.walk > 0 && d.kind !== 'water') || w.raw(ax, ay) === '灘') && !w.shipCells.has(k) && !this.ents.beastAt(ax, ay)) out.push([ax, ay]);
      }
      return out;
    }
    stowShip(rec) {   // rec：岸上面向的那艘停著的船；不給就是身下這艘（收了人站到最近的岸上）
      const p = this.player, w = this.world, aboard = !rec, s = aboard ? this.shipNow() : rec; if (!s) return;
      if (p.swimming) { this.message('人在水裡，收不了船：先上船或上岸。'); SFX.fail(); return; }   // v0.8.21 使用者定
      const cells = aboard ? this.shipCells() : rec.cells, land = this.landBeside(cells), k = G.SHIPS[s.kind] || G.SHIPS['孤帆'];
      if (!land.length) { this.message(aboard ? '茫茫海上收不回船：船身碰到岸才收得回，開到岸邊再按 F。' : '這艘' + s.kind + '沒靠著岸，收不回。'); SFX.fail(); return; }
      if (!this.canAdd(s.kind, 1)) { this.message('船艙滿了（最多帶 ' + HOLD_MAX + ' 艘），收不了這艘' + s.kind + '。'); SFX.fail(); return; }
      if (!this.takeOk) {   // v0.8.19 使用者定：收之前先問一句
        const sk = this.shipSkulls(s), at = aboard ? { x: p.x, y: p.y } : { x: rec.cells[0][0], y: rec.cells[0][1] };
        this.askTake(at, '舟', () => this.confirmed(() => this.stowShip(rec)), '把這艘<b>' + s.kind + '</b>收回船艙（現在帶著 ' + (p.hold || []).length + '/' + HOLD_MAX + ' 艘）：命 ' + Math.round(s.hp) + '/' + Math.round(this.shipMax(s)) + (sk.length ? '，船頭' + sk.map(x => x[0]).join('、') + '照樣鎮著' : '') + '，修過 ' + (s.repairs || 0) + ' 次。' + (aboard ? '人會從船邊走上岸。' : '') + '<br>真的收？');
        return;
      }
      const keep = { hp: U.r4(s.hp), skulls: this.shipSkulls(s), repairs: s.repairs || 0 }; if (s.fid !== undefined) keep.fid = s.fid;   // 船的命、首骨、修過幾次跟著進船艙，再放下水照舊
      if (aboard) {
        const at = land.sort((a, b) => Math.hypot(a[0] - p.x, a[1] - p.y) - Math.hypot(b[0] - p.x, b[1] - p.y))[0];   // 最近的岸，正前方比斜角先
        p.sailing = false; p.ship = null; p.shipMove = false; p.fromX = p.x; p.fromY = p.y; p.x = at[0]; p.y = at[1]; p.moveT = p.stepDur = 0.2;
      } else w.removeShip(w.shipCells.get(U.key(rec.cells[0][0], rec.cells[0][1])));
      this.addItem(s.kind, 1, { ship: keep }); this.barSig = ''; this.buildBag(); SFX.write();
      this.message('把' + s.kind + '收回船艙（命 ' + Math.round(keep.hp) + '/' + k.hp + (keep.skulls.length ? '，船頭' + keep.skulls.map(x => x[0]).join('、') + '照樣鎮著' : '') + '）。' + (aboard ? '人上了岸。' : ''));
    }
    newShipFrom(st, kind) { return Object.assign(World.newShip(kind), st && st.ship ? JSON.parse(JSON.stringify(st.ship)) : {}); }   // 從船艙那一艘放下水：帶著收船時的命與首骨
    fixHoldSel() { const p = this.player; if (p.holdSel >= (p.hold || []).length) p.holdSel = -1; this.holdSig = ''; }
    takeStack(st) { const p = this.player, hi = (p.hold || []).indexOf(st); if (hi >= 0) { p.hold.splice(hi, 1); this.fixHoldSel(); return true; } const i = p.bag.indexOf(st); if (i < 0) return false; p.bag.splice(i, 1); if (p.sel >= p.bag.length) p.sel = Math.max(0, p.bag.length - 1); this.barSig = ''; return true; }   // 拿掉囊裡這一疊（不是頭一個同名的）
    // 放船（v0.8.17 使用者定：面前三乘三都是水、船頭朝面前；v0.8.19：船從船艙放、要正對著水、漲潮淹了的沙洲放不得）
    launchWater(x, y) { return this.shipWater(x, y) && this.world.raw(x, y) !== '灘'; }
    launchShip(st) {
      const p = this.player, w = this.world, kind = st.n, k = G.SHIPS[kind] || G.SHIPS['孤帆'], t = this.facing(), fail = () => this.fx.push({ type: 'fail', x: t.x, y: t.y, t: 0, dur: 0.6 });
      if (p.fx && p.fy) { this.message('放船要正對著水（上下左右），不能斜著放。'); fail(); return; }
      if (this.frontBlock().some(([x, y]) => !this.launchWater(x, y))) { this.message('放' + kind + '要面前三乘三九格都是水（淺水、深水、湖、河都算；灘——漲潮淹了也不算——、棧、別的船不算）。往水邊站、面向開闊的水再放。'); fail(); return; }
      const r = this.frontShip(kind), cap = this.shipCapNote(r.x0, r.y0);
      { const b = w.shipFootprint(kind, r.x0, r.y0, r.dir).map(([x, y]) => this.ents.beastAt(x, y)).find(e => e && e.type !== '魚'); if (b) { this.message('船身要落的地方有' + this.beastName(b) + '，先把牠趕開再放船。'); fail(); return; } }   // v0.9.8 自查：船不放在生靈頭上（魚在船底下不算）
      if (cap && !this.takeOk) { this.askTake(t, '舟', () => this.confirmed(() => this.launchShip(st)), cap + '<br>還要放嗎？', ['再放一艘？', '放下水', '先不']); return; }   // v0.8.21 使用者定：再放一艘會讓最早下水的那艘消失，先說一聲
      this.shipCap(r.x0, r.y0);
      const nr = Object.assign(this.newShipFrom(st, kind), { dir: r.dir, t: U.r4(w.time) }); w.addShip(r.x0, r.y0, nr); this.takeStack(st); p.holdSel = -1;
      this.toast(kind + '下水了', '船身' + this.shipSize(kind, r.dir) + '，命 ' + Math.round(nr.hp) + '/' + k.hp + '。從船邊正面走上去或面向它按 E 上船；面向它再按 F 收回船艙（船身要有一邊靠著岸才收得回）。在船上 WASD 走動，1 左、2 上、3 下、4 右開船（往東西開就東西長、往南北開就南北長），靠了岸按 F 連人帶船收回；C 開船的介面（修船、放取首骨）。船頭放得下 ' + k.slots + ' 個首骨。深水亦可渡；海上散著' + (G.GEN >= 3 ? '大陸、島與孤嶼' : '七十來座外島' + (G.GEN >= 2 ? '與千來座孤嶼' : '')) + '，開出這張紙的邊（1600 格見方）便渡海而去。', 9000); SFX.write();
      const c = w.shipCenter(w.ships.get(U.key(r.x0, r.y0)));
      this.fx.push({ type: 'write', x: c.x - 0.5, y: c.y - 0.5, ch: '舟', color: DB['舟'].ink, t: 0, dur: 0.35 }); this.holdSig = '';
    }
    cycleHold() {   // B：船艙裡換一艘（不選 → 第一艘 → … → 不選）
      const p = this.player, h = p.hold || []; if (!h.length) { this.message('船艙是空的。'); return; }
      p.holdSel = p.holdSel + 1 >= h.length ? -1 : p.holdSel + 1; this.holdSig = '';
      this.message(p.holdSel < 0 ? '不選船。' : '選了船艙裡的' + h[p.holdSel].n + '：面向開闊的水按 F 放下水。');
    }
    buildHold() {   // 船艙（v0.8.19 使用者定）：右下角列出帶著的船（最多三艘），每艘的命、首骨、修過幾次；點一下選中，F 放下水
      const p = this.player, el = $('hold'); if (!el) return;
      const now = this.world.time, list = p.hold || [], fixN = (kind) => (SHIP_FIX[kind] || SHIP_FIX['孤帆']).cost.length;
      const info = (kind, d) => { const k = G.SHIPS[kind] || G.SHIPS['孤帆'], sk = (d.skulls || []).filter(x => x[1] > now); return { hp: Math.round(d.hp === undefined ? k.hp : d.hp), max: k.hp, sk: sk.map(x => x[0].replace('首骨', '') + Math.max(1, Math.ceil((x[1] - now) / DAY - 1e-6)) + '日'), fix: (d.repairs || 0) + '/' + fixN(kind) }; };
      const cur = p.sailing && p.ship ? info(p.ship.kind, p.ship) : null;
      const sig = list.map(st => st.n + JSON.stringify(info(st.n, st.ship || {}))).join('|') + '#' + p.holdSel + '#' + (cur ? p.ship.kind + JSON.stringify(cur) : '');
      if (sig === this.holdSig) return; this.holdSig = sig;
      el.classList.toggle('hidden', !list.length && !cur);
      const row = (name, d, i) => '<div class="hrow' + (i === p.holdSel ? ' sel' : '') + (i < 0 ? ' cur' : '') + '"' + (i >= 0 ? ' data-i="' + i + '"' : '') + '><b>' + name + '</b><span class="hp' + (d.hp / d.max < 0.34 ? ' low' : '') + '">命 ' + d.hp + '/' + d.max + '</span><span class="sk">' + (d.sk.length ? '骨 ' + d.sk.join('·') : '船頭空著') + '</span><span class="fx">修 ' + d.fix + '</span></div>';
      el.innerHTML = '<div class="hhead">船艙 ' + list.length + '/' + HOLD_MAX + '<small>點選 · <kbd>B</kbd> 換 · <kbd>F</kbd> 放下水</small></div>' + (cur ? row('身下 · ' + p.ship.kind, cur, -1) : '') + list.map((st, i) => row(st.n, info(st.n, st.ship || {}), i)).join('');
      el.querySelectorAll('.hrow[data-i]').forEach(r => r.addEventListener('mousedown', (ev) => { ev.stopPropagation(); const i = +r.dataset.i; p.holdSel = p.holdSel === i ? -1 : i; this.holdSig = ''; this.buildHold(); }));
    }
    // v0.8.3 落水時放船下水
    startDeploy(kind, st) {
      const p = this.player;
      if (p.deploy) { this.message('正撐著' + p.deploy.n + '，還要 ' + Math.ceil(p.deploy.t) + ' 息。'); return; }
      if ((p.swimShips || 0) >= DEPLOY_MAX) { this.message('這一回落水已經放過 ' + DEPLOY_MAX + ' 艘船了，游上岸吧。'); SFX.fail(); return; }
      if (!this.fightShipOk(null)) { this.message(this.shipLimitText() + '游上岸吧。'); SFX.fail(); return; }   // 洞庭這一場最多三艘（v0.8.16）
      const plan = this.deployPlan(kind); if (!plan) { this.message('這裡放不下' + kind + '的船身（' + this.shipSize(kind, 'v') + '，蓋住你這格、每格都要是水）。往寬一點的水游。'); SFX.fail(); return; }
      const cap = this.shipCapNote(plan.x0, plan.y0); if (cap) this.toast('船太多了', cap, 8000);   // 落水來不及問，撐之前說一聲（v0.8.21）
      const sec = DEPLOY_SEC[this.diff.key] || 4;
      p.deploy = { n: kind, t: sec, x: p.x, y: p.y, st: st || null, r: plan };
      this.message('撐住' + kind + '的船身，' + sec + ' 息後上得了船；別亂動，一動就得重來。'); SFX.write();
    }
    shipFitsHere(kind) { return !!this.deployPlan(kind); }
    deployPlan(kind) {   // 落水撐船（v0.8.21 使用者定）：擺向隨機，船身蓋住你那格、每格都是水就行
      const p = this.player, w = this.world, out = [];
      for (const dir of ['h', 'v']) { const [W, H] = World.shipDims(kind, dir); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (w.shipFits(kind, p.x - i, p.y - j, (x, y) => this.shipWater(x, y), dir)) out.push({ dir, x0: p.x - i, y0: p.y - j }); }
      return out.length ? out[Math.floor(Math.random() * out.length)] : null;
    }
    tickDeploy(dt) {
      const p = this.player, d = p.deploy; if (!d) return;
      if (!p.swimming || p.x !== d.x || p.y !== d.y) { p.deploy = null; if (p.swimming) this.message('一動，船身又漂開了，得重新撐。'); return; }
      d.t -= dt; if (d.t > 0) return;
      p.deploy = null;
      const h = p.hold || [], st = d.st && h.includes(d.st) ? d.st : h.find(x => x.n === d.n); if (!st) return;
      let r = d.r && this.world.shipFits(d.n, d.r.x0, d.r.y0, (x, y) => this.shipWater(x, y), d.r.dir) ? d.r : this.deployPlan(d.n);
      if (!r) { this.message('船身放不下了，換個地方再撐。'); SFX.fail(); return; }
      if (!this.fightShipOk(null)) { this.message(this.shipLimitText()); SFX.fail(); return; }
      r = { dir: r.dir, x0: r.x0, y0: r.y0 }; this.shipCap(r.x0, r.y0);
      this.takeStack(st); p.swimming = false; p.swimT = 0; p.sailing = true; p.ship = Object.assign(this.newShipFrom(st, d.n), r, { t: U.r4(this.world.time) }); p.shipMove = false; p.swimShips = (p.swimShips || 0) + 1; this.fightShip(p.ship);
      this.toast('上了船', '把' + d.n + '撐下水，翻身上了船。這一回落水放了 ' + p.swimShips + '/' + DEPLOY_MAX + ' 艘（上岸才重算）。', 7000); SFX.learn(); this.buildBag();
    }
    mendShips(sec) {   // v0.8：求教過青龍，身下這艘與停著的船自己回命，SHIP_MEND_DAYS 日回滿
      const k = sec / (SHIP_MEND_DAYS * DAY), mend = (s) => { const max = this.shipMax(s); if (s.hp < max) s.hp = Math.min(max, U.r4(s.hp + max * k)); };
      if (this.player.ship) mend(this.player.ship);
      for (const rec of this.world.ships.values()) mend(rec);
    }
    hintOnce(text) { if (this.msgText.indexOf(text) < 0) this.message(text); }
    // ---------- 大魔王與戰鬥的規矩（v0.8.7；v0.8.9 使用者定：沒取經的加成、指定、認輸） ----------
    bossZone(id) { return G.zones(this.seed).find(z => z.id === BOSSES[id].zone); }
    bossEnt() { const f = this.player.fight; return f ? this.ents.list.find(o => o.type === BOSSES[f.id].glyph && !o.shade) || null : null; }
    bossGlyph(t) { return Object.values(BOSSES).some(b => b.glyph === t); }   // 這個字是不是大魔王（封豨、修蛇……）
    seaFolk(o) { return SEA_FOLK.indexOf(o.type) >= 0 || o.type === '修蛇'; }   // 海中之物：燭龍焚溟全傷、九閽鳴雷減半（v0.8.16 修蛇也算）
    skyFolk(o) { return o.type === '雕' || o.type === '大風' || (o.type === '鷹' && !o.tame) || (o.type === '共工' && this.ents.aloft(o)); }   // 天上之物（v0.8.25）：青冥落羽全傷，九閽鳴雷、燭龍焚溟減半
    windK() {            // 大風的陸海比（設計稿〈六〉，v0.8.25）：照開島時的原始地形（底稿），青丘地界裡海佔幾成，大風的命與傷害就少幾成的 14%
      if (this.windKv !== undefined) return this.windKv;
      const z = this.bossZone('大風'), r = BOSSES['大風'].r; let sea = 0, all = 0;
      if (z) for (let dy = -r; dy <= r; dy += 3) for (let dx = -r; dx <= r; dx += 3) { if (dx * dx + dy * dy > r * r) continue; all++; if (DB[G.baseTile(z.x + dx, z.y + dy, this.seed)].kind === 'water') sea++; }
      return (this.windKv = U.r4(1 - WIND_SEA_CUT * (all ? sea / all : 0)));
    }
    snakeGround(x, y) { const p = this.player; if ((p.bosses || {})['修蛇']) return false; const z = this.bossZone('修蛇'); return !!z && Math.hypot(x - z.x, y - z.y) <= BOSSES['修蛇'].r; }   // 還沒斃的修蛇的地界
    fightShipOk(s) { const f = this.player.fight; return !f || f.id !== '修蛇' || f.away || (s && s.fid === f.no) || (f.ships || 0) < SNAKE_SHIPS; }   // 洞庭這一場還用得了這艘船嗎（v0.8.16：一場最多三艘）
    fightShip(s) { const f = this.player.fight; if (!f || f.id !== '修蛇' || f.away || !s || s.fid === f.no) return true; if ((f.ships || 0) >= SNAKE_SHIPS) return false; f.ships = (f.ships || 0) + 1; s.fid = f.no; return true; }
    capArks() {          // 方舟進了修蛇的地界：命上限降到三分之二，多的命去掉（v0.8.16 使用者定；孤帆不變）
      const p = this.player, cap = (s) => { const m = this.shipMax(s); if (s.hp > m) { s.hp = m; return true; } return false; };
      if (p.ship && p.ship.kind === '方舟' && cap(p.ship) && !p.arkNote) { p.arkNote = true; this.toast('方舟進了洞庭', '修蛇的地界裡，方舟的命上限降到三分之二（' + Math.round(this.shipMax(p.ship)) + '）；孤帆不受影響。斃了修蛇才回得去。', 8000); }
      if (p.ship && p.ship.kind === '方舟' && !this.snakeGround(p.x, p.y)) p.arkNote = false;
      for (const rec of this.world.ships.values()) if (rec.kind === '方舟') cap(rec);
    }
    shipLimitText() { return '洞庭這一場已經用了 ' + SNAKE_SHIPS + ' 艘船（一場最多 ' + SNAKE_SHIPS + ' 艘），這一艘上不了。'; }
    guardKey(id) { const p = this.player; id = id || (p.fight && p.fight.id) || '封豨'; const k = BOSSES[id].guard; if (k !== 'mode') return k; const e = this.bossEnt(); return GONG_GUARD[e ? e.mode : 'land']; }   // 共工（v0.9）：照他當下的模式換
    guardOf(id) { const p = this.player, k = this.guardKey(id); return k && p[k] ? [k].concat(GUARD_NAMES[k]) : null; }   // 只有同一屬性的神獸來護駕（v0.8.9：封豨是白虎）
    buffLayers() { const p = this.player, f = p.fight; return (p.bossBuff || 0) + (f && f.penal ? 1 : 0); }   // 幾層：斃了留下的（p.bossBuff）＋這一場沒拿這一隻的經闖進來的那一層（v0.8.21）
    buffK() { return 1 + BUFF_STEP * this.buffLayers(); }
    bossK(e) {           // 魔王的命與傷害乘幾倍（v0.9 把散在各處的算法收在一起）：墨影照成數與黑叉；共工照 gongK()；大魔王照加成，大風再乘陸海比
      if (e && e.shade) return this.shadeK(e);
      if (e && e.type === '共工') { const f = this.player.fight; return this.gongK(!!(f && f.jing)); }
      return this.buffK() * (e && e.type === '大風' ? this.windK() : 1);
    }   // 大魔王的加成：照最初的數值，一層加兩成（v0.8.21；原本一成），不連乘
    gotJing(id) { const p = this.player; return !!p.jingFor && (!id || p.jingFor === id); }   // 手上有沒有這一隻的經卷（v0.8.10 起經卷認一隻：p.jingFor）
    entryKind(id) { const p = this.player; return this.gotJing(id) ? 'jing' : id !== '共工' && p.jingFor && JING[p.jingFor] ? 'wrong' : 'none'; }   // 共工只有拿著立極卷或沒拿（v0.9）   // 進地界時：拿著牠的經、拿錯經、沒經（v0.8.21）
    missCount() { const b = this.player.bosses || {}; return Object.keys(RING).filter(id => b[id] && b[id].jing === false).length; }   // 幾個黑叉：沒拿牠的經就斃了的大魔王
    trialK() { return 1 + TRIAL_STEP * this.missCount(); }   // 玄武的試煉：每個黑叉影子加兩成五（v0.8.21 三成；v0.8.22 使用者定兩成五：九成的影子三叉是 1.575 倍，低於共工真身的 1.6）
    jingTaken(id) { const p = this.player; return p.jingFor === id || (p.scrolls || []).some(x => x.id === id && (x.lost || x.dust)); }   // 這一卷取過了沒（拿著、用了化作塵埃、換掉散了；v0.8.22 前換掉的不算，那時可以隨換隨取）
    jingGives(id, swap) { const p = this.player; return !(p.bosses || {})[id] && !this.jingTaken(id) && (!p.jingFor || !!swap); }   // 這一回斃了影子給不給經（v0.8.22 使用者定：一卷只取一次、斃了的那一隻不給；v0.8.23：手上有別卷，說好了換才給）
    canSwap(id) { const p = this.player; return !!p.jingFor && p.jingFor !== id && !(p.bosses || {})[id] && !this.jingTaken(id); }   // 手上有別卷、這一卷還取得到：先問要不要換（v0.8.23）
    practiceWhy(id) {    // 這一回為什麼只是練手
      const p = this.player, z = BOSSES[id].zone;
      return (p.bosses || {})[id] ? '你已經斃了' + z + '，這一回只是練手：不給經，也不給膽氣。' : p.jingFor === id ? '這一卷你已經拿著了，這一回只是練手：不給經，也不給膽氣。'
        : this.jingTaken(id) ? '這一卷你取過了（換成別卷時散了），一卷只取一次。這一回只是練手：不給經，也不給膽氣。' : '你手上是' + JING[p.jingFor].scroll + '，說好了不換。這一回只是練手：不給經，也不給膽氣。';
    }
    gongK(jing) {        // 將來的共工的加成（v0.8.21 公式，v0.8.22 確認缺席 = 黑叉 + 1、拿了共工經就不乘；v0.8.23 使用者定：獨力斃的加成另外加上去，不相乘）
      const x = this.missCount(), bs = this.player.bosses || {}, solo = SOLO_BUFF[Math.min(3, Object.keys(RING).filter(id => bs[id] && bs[id].solo).length)] / 100;   // 只數三隻大魔王（v0.9：斃了共工以後見聞錄照樣對）
      return U.r4((1 + BUFF_STEP * x) * (jing ? 1 : Math.pow(GONG_ABSENT, x + 1)) + solo);
    }
    shadeK(e) { return (e.k || 1) * (e.tk || 1); }   // 影子傷人：真身的六成、九成，再乘黑叉的加成
    beadOf(id) {         // 珠（v0.8.21 使用者定）：''未挑戰、held 拿著經還沒打、fightJing 拿著經在打、won 拿著經斃了、fightNo 沒拿牠的經在打、miss 沒拿牠的經斃了
      if (id === '共工') return this.lastBead();
      const p = this.player, b = (p.bosses || {})[id], f = p.fight;
      if (b) return b.jing === false ? 'miss' : 'won';
      if (f && f.id === id) return f.jing ? 'fightJing' : 'fightNo';
      return p.jingFor === id ? 'held' : '';
    }
    ringsAll() { const b = this.player.bosses || {}; return Object.keys(RING).every(id => b[id]); }   // 三個魂環集齊了沒（斃了修蛇、大風、封豨）
    lastBead() {         // 第四顆珠（v0.8.22 使用者定）：''灰點，三個魂環還沒集齊；ask 灰問號，集齊了；trialOn 紅問號，立極開了還沒結束；got 紅點，拿到了共工經；
      const p = this.player, f = p.fight;   // 'fightNo blink' 閃的黑問號：沒拿共工經就去打共工本體；斃了共工 won 紅點、miss 黑叉（v0.9）。立極 v0.9.10 寫成
      if ((p.bosses || {})['共工']) return p.bosses['共工'].jing ? 'won' : 'miss';   // 斃了共工（v0.9）
      if (f && f.id === '共工') return f.jing ? 'fightJing' : 'fightNo blink';
      if (p.jingFor === '共工') return p.gongLost === 'jing' ? 'trialOn' : 'got';   // v0.8.23 使用者定：拿著共工經被擊敗，紅問號不變
      if (p.trial && p.trial.id === '共工') return 'trialOn';
      if (p.gongLost === 'none') return '';   // v0.8.23 使用者定：沒拿共工經被擊敗，只有第四顆退回小灰點，魂環、十字星與前三顆都不變（拿到共工經、開了立極就不算這一條）
      return this.ringsAll() ? 'ask' : '';
    }
    bigHp(base) { return Math.round(base * (this.diff.bossHp || 1) / 100) * 100; }   // 小魔王、大魔王、共工與影子的命照難度加（v0.8.10），四捨五入到百
    godDmg(n) { return U.r4(ITEMS[n].dmg * (this.diff.godDmg || 1)); }              // 神兵的傷害照難度加三到五分（v0.8.10）
    bossTimes(f) {       // 這一場的時限（v0.8.10 使用者定）：這一回在外多久、在外累積多久、從按「進去」起多久
      const now = this.world.time, out = f.away && f.awayAt !== undefined ? Math.max(0, now - f.awayAt) : 0;
      return { out, sum: (f.awaySum || 0) + out, all: Math.max(0, now - (f.at === undefined ? now : f.at)), T: this.bossT(f.id) };
    }
    bossClock(f) {       // 時限到了算認輸（判負）；快到時（剩不到一日）各提醒一次
      const { out, sum, all, T } = this.bossTimes(f), b = BOSSES[f.id];
      const why = f.away && out >= T.away ? '連續 ' + T.away + ' 息沒回' + b.place : f.away && sum >= T.sum ? '在地界外累積滿 ' + T.sum + ' 息' : all >= T.cap ? '這一場打了 ' + T.cap + ' 息還沒分出勝負' : '';
      if (why) { this.surrender(why); return true; }
      f.warn = f.warn || {};
      const soon = (left, k, text) => { if (left > 0 && left <= DAY && !f.warn[k]) { f.warn[k] = true; this.toast(b.zone + '的戰事', text + '（還剩 ' + Math.ceil(left) + ' 息，不到一日）。', 9000); SFX.fail(); } };
      if (f.away) { soon(T.away - out, 'a', '再不回' + b.place + '，就算認輸'); soon(T.sum - sum, 's', '在地界外的時間快累積滿了，滿了就算認輸'); }
      soon(T.cap - all, 'c', '這一場快到時限了，到了還沒分出勝負就判負');
      return false;
    }
    bossT(id) { const T = this.diff.bossT; if (id !== '共工') return T; const k = (v) => Math.round(v * GONG_TIME); return { away: k(T.away), sum: k(T.sum), cap: k(T.cap) }; }   // 共工的時限是大魔王的 1.25 倍（v0.8.33 使用者定；三條都乘）
    awayRule(id) { const T = this.bossT(id); return '連續 ' + T.away + ' 息不回' + BOSSES[id].place + '、或在地界外累積滿 ' + T.sum + ' 息，就算認輸'; }
    clockText(f) { const { all, T } = this.bossTimes(f); return '這一場還剩 ' + Math.max(0, Math.ceil(T.cap - all)) + ' 息。'; }
    bossTick(dt) {
      const p = this.player; if (p.dead) return;
      const f = p.fight;
      this.tideShips();   // 退潮了：壓在沙洲上的船漂回水裡（v0.8.18）
      this.nestAcc = (this.nestAcc || 0) + dt; if (this.nestAcc >= 1) { this.nestAcc = 0; this.nestHints(); }   // 遠處的巢穴指路，一息看一次（v0.8.19）
      this.capArks();
      p.inBoss = p.inBoss || {};
      if (f) {
        const z = this.bossZone(f.id), d = Math.hypot(p.x - z.x, p.y - z.y);
        if (d > BOSSES[f.id].r + BOSS_EXIT) { if (!f.away) this.leaveGround(f); }   // 走出地界：魔王回窩養傷，戰事還掛著（難度照樣鎖著；要散只能認輸）
        else if (f.away) {
          if (d <= BOSSES[f.id].r && p.sailing && !this.fightShipOk(p.ship)) {   // 洞庭這一場的船用完了（v0.8.16）：這艘進不去
            const o = p.bossOut; if (o) this.jumpTo(o.x, o.y); this.hintOnce(this.shipLimitText());
          } else if (d <= BOSSES[f.id].r) {   // 回到地界：這一回在外的時間記進累積（v0.8.10）
            f.awaySum = U.r4((f.awaySum || 0) + Math.max(0, this.world.time - (f.awayAt === undefined ? this.world.time : f.awayAt))); f.awayAt = undefined; if (f.warn) f.warn.a = false;
            f.away = false; if (p.sailing) this.fightShip(p.ship); this.spawnBoss(f); this.bossSig = null; this.toast(BOSSES[f.id].zone, '你又回到了' + BOSSES[f.id].place + '。' + BOSSES[f.id].zone + '聞到你了。' + this.clockText(f), 7000); SFX.beast(BOSSES[f.id].glyph);
          }
        }
        else if (!this.bossEnt()) this.spawnBoss(f);
        if (this.bossClock(f)) return;   // 時限（v0.8.10）：到了算認輸
        if (!f.away) {
          if (p.lockT > 0) { p.lockT = Math.max(0, p.lockT - dt); if (!p.lockT) this.callGuard(); }
          else if (p.guardT > 0) { p.guardT = Math.max(0, p.guardT - dt); p.hp = Math.min(p.hpMax, U.r4(p.hp + GUARD_REGEN * dt)); if (!p.guardT) this.message(f.guardBy + '回去了。接下來靠你自己。'); }
          return;
        }
      }
      const inside = (id) => { const z = this.bossZone(id); return Math.hypot(p.x - z.x, p.y - z.y) <= BOSSES[id].r; };
      if (!Object.keys(BOSSES).some(id => !(p.bosses || {})[id] && inside(id))) p.bossOut = { x: p.x, y: p.y, sail: !!p.sailing };   // 所有地界外的最後一格，存進檔（v0.8.8）；記著那時在不在船上（v0.8.9 認輸送回去用）。v0.8.16：兩隻以上的地界，要都在外面才算
      for (const id in BOSSES) {
        if ((p.bosses || {})[id] || (f && f.id === id)) continue;
        if (BOSSES[id].gong && !this.ringsAll()) { if (inside(id)) this.gongWall(id); continue; }   // 三個魂環還沒集齊：不周山進不去（v0.9）
        if (!inside(id)) p.inBoss[id] = false;
        else if (!p.inBoss[id] && !this.bossAsk && !this.talking) { if (f) this.busyGround(id, f); else if (this.declinedToday(id)) this.declinedGround(id); else this.askBoss(id); }
      }
    }
    gongWall(id) {       // 三魂環沒集齊就走到不周山：風把人推回地界外（v0.9 使用者定）。沿著從島心往外的方向推到地界外最近站得住的地方
      const p = this.player, z = this.bossZone(id), r = BOSSES[id].r + BOSS_EXIT + 2, a = Math.atan2(p.y - z.y, p.x - z.x) || 0, tx = Math.round(z.x + Math.cos(a) * r), ty = Math.round(z.y + Math.sin(a) * r);
      const ok = (x, y) => Math.hypot(x - z.x, y - z.y) > BOSSES[id].r + 1 && (p.sailing ? DB[this.world.get(x, y)].kind === 'water' : this.pass(x, y) && !this.ents.at(x, y));
      const at = this.nearestTile(tx, ty, ok, 30); if (at) { this.stopWalk(); this.jumpTo(at[0], at[1]); }
      this.hintOnce('不周山的風把你推了回來。三隻大魔王都斃了、三個魂環集齊，才進得了共工的地界。');
    }
    declinedToday(id) { return (this.player.bossDeclined || {})[id] === this.day(); }   // 今天對這一隻按過「先不」（v0.9.8）
    declinedGround(id) {   // v0.9.8 使用者定：一個遊戲日只問一次。今天按過「先不」，再走進來不問了，照「先不」送回地界外；要打，暫停面板按「叫陣」
      const p = this.player, o = p.bossOut, b = BOSSES[id];
      if (o) { this.stopWalk(); this.jumpTo(o.x, o.y); } else p.inBoss[id] = true;
      this.hintOnce('今天對' + b.zone + '說過「先不」了，不再問。真要打，暫停面板按「叫陣」，再走進' + b.place + '的地界。');
    }
    declinedIds() { const p = this.player; return p.fight ? [] : Object.keys(BOSSES).filter(id => !(p.bosses || {})[id] && this.declinedToday(id)); }
    callBoss() {           // 暫停面板「叫陣」（v0.9.8）：把今天的「先不」收回，再走進地界就照常問
      const p = this.player, ids = this.declinedIds(); if (!ids.length) return;
      for (const id of ids) { delete p.bossDeclined[id]; p.inBoss[id] = false; }
      if (this.userPaused) this.togglePause();
      this.message('好。再走進' + ids.map(id => BOSSES[id].place).join('、') + '的地界，就會問你進不進去。');
    }
    busyGround(id, f) {  // 一場戰事還掛著，又走進別隻的地界（v0.8.20）：不開第二場（從前會把掛著的那一場悄悄丟掉），送回地界外
      const p = this.player, a = BOSSES[f.id], b = BOSSES[id], o = p.bossOut;
      this.toast('戰事未了', a.zone + '的戰事還掛著：先回' + a.place + '打完，或認輸（暫停面板），才進得了' + b.zone + '的地界。' + this.clockText(f), 9000); SFX.fail();
      if (o) this.jumpTo(o.x, o.y); else p.inBoss[id] = true;   // 舊存檔不知道從哪進來的：走出去前不再說
    }
    leaveGround(f, quiet) {   // 走出地界（v0.8.9）：不算認輸——魔王回窩、養回滿命；沒取經的加成與指定照樣留著。v0.8.10：起算在外的時間（quiet：不跳提示）
      const p = this.player, b = BOSSES[f.id], e = this.bossEnt(); if (e) this.ents.remove(e);
      this.ents.list = this.ents.list.filter(o => !(o.type === '豬' && o.callBy === f.id));
      f.away = true; f.awayAt = U.r4(this.world.time); f.hp = undefined; f.x = undefined; f.y = undefined; f.modeT = undefined; p.lockT = 0; p.guardT = 0; this.bossSig = null;
      if (quiet) return;
      const { sum, all, T } = this.bossTimes(f);
      this.toast('走出了' + b.zone + '的地界', b.zone + '回' + b.place + '養傷，養回滿命。戰事還掛著，難度照樣鎖著' + (f.penal ? '，這一層加成也還在' : '') + '。<br>' + this.awayRule(f.id) + (sum > 0 ? '（先前已在外 ' + Math.floor(sum) + ' 息）' : '') + '；這一場從進去起最多 ' + T.cap + ' 息，還剩 ' + Math.max(0, Math.ceil(T.cap - all)) + ' 息。<br>要散，暫停面板「認輸」（膽氣減三成、神兵耐久掉兩成）。', 12000);
    }
    jingWarn(id) {       // 進地界的視窗裡，取經與加成的那幾句（v0.8.21 使用者定：沒經、拿錯經都加一層兩成；v0.8.22 起拿錯經也斃得了）
      if (BOSSES[id].gong) {   // 共工（v0.9）：照 gongK 的公式說清楚
        const k1 = this.gongK(true), k0 = this.gongK(false), x = this.missCount();
        if (this.gotJing(id)) return '<li>你拿著立極卷：共工的命與傷害 ×' + k1.toFixed(2) + '（黑叉 ' + x + ' 個，加上獨力的加成）。</li>';
        return '<li class="warn ink">你沒拿共工那一卷（立極）。<b>此去無經，當真要闖？</b>共工的命與傷害 ×' + k0.toFixed(2) + '（拿了立極卷只要 ×' + k1.toFixed(2) + '；公式見生存之道）。被他擊敗，第四顆珠退回小灰點。<b>要按兩次黑色的「確認」。</b></li>';
      }
      const p = this.player, k = Math.round(BUFF_STEP * 100), now = Math.round(this.buffLayers() * k), kind = this.entryKind(id), z = BOSSES[id].zone, scroll = (x) => (JING[x] || { scroll: x + '卷' }).scroll;
      const pre = now ? '<li>先前沒拿經就斃過大魔王，剩下的都帶著 +' + now + '% 的加成。</li>' : '', ring = RING[id] ? RING[id][1] : '魂環', bead = '第' + NTH[BEADS.indexOf(id)] + '顆珠';
      if (kind === 'jing') return pre + ((p.shade9 || {})[id] ? '' : '<li class="warn">你只斃了六成的' + JING[id].shade + '，九成的還沒試過——真身比牠強得多，勝算恐怕不大。</li>');
      const add = z + '與剩下的大魔王都加' + (k === 20 ? '兩成' : k + '%') + '的命與傷害（照最初的數值加' + (now ? '，加上先前的成了 +' + (now + k) + '%' : '') + '）。斃了牠，這一層就永久留著；死了或認輸，這一層取消。';
      if (kind === 'wrong') return pre + '<li class="warn"><b>此卷非彼卷</b>：你手上是' + scroll(p.jingFor) + '，不是' + scroll(id) + '。執意闖入，' + add + '斃了牠照樣得戰利品與' + ring + '，' + bead + '打上黑叉；手上的' + scroll(p.jingFor) + '還在，那顆紅圈不變。往後玄武的試煉，每一個黑叉影子加兩成五。<b>要按兩次紅色的「確認」。</b></li>';   // v0.8.22 使用者定：拿錯經也斃得了
      return pre + '<li class="warn ink">' + (p.xuan ? '你還沒向玄武取' + scroll(id) : '北海的玄洲有一塊石頭很久沒動——你還沒去向玄武取經') + '。<b>此去無經，當真要闖？</b>' + add + '斃了牠照樣得戰利品與' + ring + '，' + bead + '打上黑叉；往後玄武的試煉，每一個黑叉影子加兩成五。<b>要按兩次黑色的「確認」。</b></li>';
    }
    askBoss(id) {        // 走進地界先問一聲；還沒取經的，問「此去無經，當真要闖？」（v0.8.11 前是「確定要進去？」）
      const p = this.player, b = BOSSES[id], g2 = GUARD[this.diff.key], gd = this.guardOf(id), gn = b.gong ? '照模式換的神獸' : GUARD_NAMES[b.guard][0], T = this.bossT(id);
      const kind = this.entryKind(id), yes = $('bossask-yes'); yes.textContent = kind === 'jing' ? '進去' : '確認'; yes.classList.toggle('red', kind === 'wrong'); yes.classList.toggle('ink', kind === 'none');   // v0.8.21：拿錯經紅色、沒經黑色，都要按兩次
      this.bossAsk = id; this.bossArm = 0; this.paused = true; this.keys.clear(); this.action = null; if (this.stopWalk) this.stopWalk();
      const warn = this.jingWarn(id);
      $('bossask-title').textContent = b.zone + '的地界' + (/此卷非彼卷/.test(warn) ? '：此卷非彼卷' : /當真要闖/.test(warn) ? '：此去無經，當真要闖？' : '');
      $('bossask-text').innerHTML = '前面是<b>' + b.zone + '</b>的地界（' + b.place + '方圓 ' + b.r + ' 格）。' + b.line + '<br>進去就是一場硬仗：<ul>'
        + '<li>戰中不能換難度。走出地界，牠回' + b.place + '養傷，戰事還掛著：' + this.awayRule(id) + '。</li>'
        + '<li>這一場從按「進去」起，最多 ' + T.cap + ' 息（約 ' + Math.round(T.cap / DAY) + ' 日）要分出勝負，不然判負，照認輸罰。</li><li>要散只能認輸（暫停面板「認輸」）：膽氣減三成，神兵耐久掉兩成（照當下的耐久算）。</li>'
        + '<li>死在牠手上，膽氣只減四成，這一場就算結束（時限下一場重算），沒取經的加成也一併取消；牠回' + b.place + '養好傷。</li>'
        + (b.noPlatform ? '<li>牠拱得動台：站在台上照樣挨震、挨撞。</li>' : '')
        + (b.sky ? '<li>牠在天上時，近身的與九閽鳴雷、燭龍焚溟都搆不到，只有彈弓與青冥落羽打得到（青冥落羽射中，絲纏住牠兩息半，落在地上）；撲下來抓你那一下、貼著停的那一息多，才近得了身。入木三分會鎖喉（窒）、加懼；扶搖把人拋出去轉暈（亂）。躲進屋裡牠撲不下來，就改吹屋子。陸海比：青丘的地界裡海佔 ' + Math.round((1 - this.windK()) / WIND_SEA_CUT * 100) + '%，牠的命與傷害少 ' + Math.round((1 - this.windK()) * 1000) / 10 + '%。</li>' : '')
        + (b.gong ? '<li>他三副樣子輪著換（每四十到六十息）：<b>海</b>潛在地裡游、身後化成淖，從你腳下鑽出來（溺）；<b>陸</b>立成三格高的「工」，九格內把人往他那邊拖、兩格內頭觸、隕石砸下來（震、焦）；<b>空</b>浮在天上，力壓千鈞（窒）、星移斗轉（心、亂），畫面還會往西北斜。換的時候現本相八息，不出招，隨便打——前四息看不出要換成什麼，後四息地上浮「氵」「土」「風」。</li><li><b>一定要帶神兵</b>：凡鐵只有三分之一。對的神兵全傷（海是燭龍焚溟、陸是九閽鳴雷、空是青冥落羽），錯的只有三成；本相那幾息，對的一倍半、錯的三成、非神兵一成。九閽鳴雷打中他一下，七息內拖不動你。</li>' : '')
        + (b.water ? '<li>牠只在水裡，船上、礁上、岸上都打得到你：吞象搆得到岸上離水兩格，毒涎打六格。方舟進了這片地界，命上限降到三分之二（孤帆不變）；這一場最多用 ' + SNAKE_SHIPS + ' 艘船。打尾只吃四分之三，牠命剩一半以下只剩四分之一。</li>' : '')
        + '<li>' + (g2 ? '命只剩一點時鎖住 ' + g2.lock + ' 息（一場一次）；' + (b.gong ? '鎖完照他當時的模式，海是青龍、陸是白虎、空是朱雀來護駕 ' + g2.guard + ' 息（要求教過那一隻），靠了神獸就不算獨力。' : gd ? '鎖完' + gn + '來護駕 ' + g2.guard + ' 息，可靠了神獸就不算獨力。' : '只有' + gn + '會來護駕，你還沒求教過牠。') : '困難：不鎖血，也沒有神獸護駕。') + '</li>'
        + (b.gong ? '<li>斃了他得' + b.trophy + '；難度、加成、獨力與否都記進成就。</li>' : '<li>斃了牠得' + b.trophy + '與' + (RING[id] ? RING[id][1] : '魂環') + '（魂環上那一分亮起來）；難度、加成、獨力與否都記進成就。</li>') + warn + '</ul>';
      $('bossask').classList.remove('hidden');
    }
    closeBossAsk() { $('bossask').classList.add('hidden'); this.bossAsk = null; this.bossArm = 0; this.paused = false; }
    bossNeedsArm(id) { return this.entryKind(id) !== 'jing'; }   // 沒拿這一隻的經：按兩次「確認」（v0.8.10；v0.8.21 起拿錯經是紅色、沒經是黑色）
    bossYes() {
      const id = this.bossAsk; if (!id) return; const kind = this.entryKind(id);
      if (kind !== 'jing' && !this.bossArm) { this.bossArm = 1; $('bossask-yes').textContent = '再按一次確認'; SFX.fail(); return; }
      this.closeBossAsk(); const p = this.player; p.inBoss[id] = true; p.trialLockT = 0;
      this.startFight(id, kind);
      if (BOSSES[id].gong) { if (kind !== 'jing') this.toast('無經而入', '沒拿立極卷就闖不周山：共工的命與傷害 ×' + this.gongK(false).toFixed(2) + '。第四顆珠打上閃著的黑問號；被他擊敗，這顆珠退回小灰點。', 10000); return; }   // 共工不加層（v0.9）
      if (kind !== 'jing') {   // 沒拿這一隻的經（v0.8.21）：這一場加一層；斃了才永久留著
        this.courSig = ''; const now = Math.round(this.buffLayers() * BUFF_STEP * 100);
        this.toast(kind === 'wrong' ? '此卷非彼卷' : '無經而入', BOSSES[id].zone + '與剩下的大魔王都 +' + now + '%（命與傷害，照最初的數值加）。第' + NTH[BEADS.indexOf(id)] + '顆珠打上了黑問號。斃了牠，這一層永久留著、珠打黑叉' + (kind === 'wrong' ? '（手上的' + JING[p.jingFor].scroll + '還在）' : '') + '；死了或認輸，這一層取消。', 10000);
      }
    }
    bossNo() {
      const id = this.bossAsk; if (!id) return; this.closeBossAsk(); const p = this.player, o = p.bossOut;
      p.bossDeclined = p.bossDeclined || {}; p.bossDeclined[id] = this.day();   // 一個遊戲日只問一次（v0.9.8 使用者定）
      if (o) { this.jumpTo(o.x, o.y); this.message('暫且按下，退出地界。今天不再問；要打，暫停面板按「叫陣」。'); }
      else { p.inBoss[id] = true; this.message('暫且按下。今天不再問；要打，暫停面板按「叫陣」。'); }   // 舊存檔讀進來就在地界裡、不知道從哪進來的
    }
    startFight(id, kind) {   // kind（v0.8.21）：jing 拿著牠的經、wrong 拿錯經、none 沒經；penal：這一場加一層（v0.8.22 起拿錯經也斃得了）
      const p = this.player, b = BOSSES[id]; kind = kind || this.entryKind(id); p.fight = { id, solo: true, locked: false, guarded: false, at: U.r4(this.world.time), clock: 1, no: Math.floor(Math.random() * 1e9), jing: kind === 'jing', penal: kind !== 'jing' && id !== '共工', wrong: kind === 'wrong' }; p.lockT = 0; p.guardT = 0;   // 共工不吃這一層，照 gongK（v0.9）   // no：這一場的記號（修蛇：記哪幾艘船用過）
      if (p.sailing) this.fightShip(p.ship);   // 坐著船進來的，這艘算第一艘（v0.8.16）
      this.spawnBoss(p.fight); this.bossSig = null;
      this.toast(b.zone, '你走進了' + b.place + '。' + (b.enter || '') + b.line + (b.gong ? '他的命與傷害 ×' + this.gongK(p.fight.jing).toFixed(2) + '。' : this.buffLayers() ? '牠帶著 +' + Math.round(this.buffLayers() * BUFF_STEP * 100) + '% 的加成。' : ''), 8000); SFX.beast(b.glyph);
    }
    spawnBoss(f) {       // 魔王在窩裡（或讀檔時存著的地方）現身；命上限照加成算
      const z = this.bossZone(f.id), E = this.ents, glyph = BOSSES[f.id].glyph, max = U.r4(this.bigHp(DB[glyph].hp) * this.buffK());   // v0.8.10：照難度加、四捨五入到百，再乘加成
      if (BOSSES[f.id].sky) {   // 大風（v0.8.25）：在青丘島心的天上（或讀檔時存著的地方）；命上限再照陸海比打折
        const ok = (x, y) => E.canStand(glyph, x, y, true) && !(x === this.player.x && y === this.player.y), mw = U.r4(max * this.windK());
        const at = (f.x !== undefined && ok(f.x, f.y)) ? [f.x, f.y] : this.nearestTile(z.x, z.y, ok, 30) || [z.x, z.y];
        return E.add(glyph, at[0], at[1], Object.assign(E.windFresh(), { hp: Math.min(mw, f.hp || mw), max: mw, den: { x: z.x, y: z.y } }));
      }
      if (BOSSES[f.id].gong) {   // 共工（v0.9）：在不周山的盆地裡（或讀檔時存著的地方）現身；命上限照 gongK 加
        const mg = U.r4(this.bigHp(DB[glyph].hp) * this.bossK({ type: '共工' })), fresh = E.gongFresh(f.mode), probe = Object.assign({ type: '共工', den: { x: z.x, y: z.y } }, fresh);
        if (f.modeT > 0) fresh.modeT = f.modeT;   // v0.9.14：換模式的倒數也存著，讀檔不重抽（不然重新載入就能把他留在順手的模式）
        const ok = (x, y) => E.gongFits(probe, x, y, fresh.mode) && !(x === this.player.x && y === this.player.y);
        const at = (f.x !== undefined && ok(f.x, f.y)) ? [f.x, f.y] : this.nearestTile(z.x, z.y, ok, 40) || [z.x, z.y];
        return E.add(glyph, at[0], at[1], Object.assign(fresh, { hp: Math.min(mg, f.hp || mg), max: mg, den: { x: z.x, y: z.y } }));
      }
      if (BOSSES[f.id].water) {   // 修蛇（v0.8.16）：在洞庭的湖心（或讀檔時存著的地方）浮上來
        const ok = (x, y) => E.canStand(glyph, x, y, true) && !E.at(x, y) && !(x === this.player.x && y === this.player.y);
        const at = (f.x !== undefined && ok(f.x, f.y)) ? [f.x, f.y] : this.nearestTile(z.x, z.y, ok, 40) || [z.x, z.y];
        return E.add(glyph, at[0], at[1], Object.assign(E.snakeFresh(), { hp: Math.min(max, f.hp || max), max, den: { x: z.x, y: z.y } }));
      }
      const at = [[f.x, f.y], [z.x - 1, z.y - 1]].find(([x, y]) => x !== undefined && E.hogFits({ type: glyph }, x, y)) || (() => { for (let r = 1; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (E.hogFits({ type: glyph }, z.x + dx, z.y + dy)) return [z.x + dx, z.y + dy]; return [z.x, z.y]; })();
      return E.add(glyph, at[0], at[1], { hp: Math.min(max, f.hp || max), max, state: 'chase', chargeCD: 3, quakeCD: 6, eatCD: 10, callCD: 0, moveT: 1 });
    }
    bossHit(e, dmg, kind, move, quiet) {   // 魔王打到人：護駕中打不到、鎖血中打不到；會打死人的那一下，簡單一般改成鎖血。quiet：每息掉一點的（v0.9 共工的淖與焦），不出聲不晃、不磨衣甲
      const p = this.player, shade = e && e.shade, f = shade ? null : p.fight, name = shade || BOSSES[f ? f.id : '封豨'].zone; if (p.dead) return 0;
      if (shade) dmg = U.r4(dmg * this.shadeK(e));   // 玄武的墨影（v0.8.8）：傷人照真身打折（v0.8.10 起六成、九成），不吃大魔王的加成、吃黑叉的加成（v0.8.21）；打不死人（hurt() 裡）
      else dmg = U.r4(dmg * this.bossK(e));       // 沒取經闖地界的加成（v0.8.9）；大風再照陸海比（v0.8.25）；共工照 gongK（v0.9）
      const bd = e && Object.values(BOSSES).find(o => o.glyph === e.type), noPlat = !!(bd && bd.noPlatform);   // 封豨拱得動台（v0.8.9 使用者定：台不管用；墨影也一樣）
      if (f && p.guardT > 0) { if (quiet) return 0; this.fx.push({ type: 'float', x: p.x, y: p.y, text: '擋', color: G.INK.azure, t: 0, dur: 0.6 }); this.message(f.guardBy + '擋下了' + name + '的' + move + '。'); return 0; }
      if (f && p.lockT > 0) return 0;
      if (p.trialLockT > 0) return 0;
      const d = U.r4(dmg * this.kindMult(kind, noPlat));
      if (d <= 0) { if (quiet) return 0; this.message(name + move + '，地跟著抖——你站在' + (p.sailing ? '船' : this.world.get(p.x, p.y)) + '上，震不上來。'); return 0; }
      const g2 = GUARD[this.diff.key];
      if (f && g2 && !f.locked && p.hp - d < 1) {
        p.hp = 1; p.lastHit = { kind, by: name, big: true, t: this.world.time }; f.locked = true; p.lockT = g2.lock; p.hurtT = 6; this.renderer.shake = 0.8; SFX.beast(e.type);
        const gd = this.guardOf(f.id);
        this.toast('命懸一線', name + move + '，命只剩一點——鎖住了 ' + g2.lock + ' 息，這段時間牠打不到你。' + (gd ? '鎖完' + gd[1] + '來護駕。' : '只有' + GUARD_NAMES[this.guardKey(f.id)][0] + '會來護駕，你還沒求教過牠；鎖完就靠自己了。'), 6000);
        return d;
      }
      if (quiet) { const dq = this.hurt(dmg, kind, { name, big: true, noPlat }); p.hurtT = Math.max(p.hurtT || 0, 2); return dq; }
      const dd = this.hurt(dmg, kind, { name, big: true, noPlat }); p.hurtT = 6; this.renderer.shake = kind === '震' ? 0.7 : 0.5; SFX.beast(e.type); this.armorHit();
      this.message(name + move + '（' + kind + '）！命 −' + this.shown('hurt', dd) + '。');
      return dd;
    }
    callGuard() {        // 鎖完血：同一屬性、求教過的神獸來擋（v0.8.9：封豨只有白虎）
      const p = this.player, f = p.fight, g2 = GUARD[this.diff.key]; if (!f || !g2 || f.guarded) return;
      const gd = this.guardOf(f.id); if (!gd) { this.message('鎖住的那一刻過去了。' + GUARD_NAMES[this.guardKey(f.id)][0] + '沒來——小心。'); return; }
      f.guarded = true; f.solo = false; f.guardBy = gd[1]; p.guardT = g2.guard;
      this.toast(gd[1] + '護駕', gd[1] + '擋在你前面 ' + g2.guard + ' 息：' + BOSSES[f.id].zone + '打不到你，命每息回 ' + GUARD_REGEN + '。靠了神獸，這一場就不算獨力。', 8000); SFX.learn();
    }
    endFight() { const p = this.player, e = this.bossEnt(); if (e) this.ents.remove(e); p.fight = null; p.lockT = 0; p.guardT = 0; this.bossSig = null; this.fleeArm = 0; }
    surrender(why) {     // 時限到了也走這裡（v0.8.10，why 寫原因）。認輸（v0.8.9 使用者定；v0.8.13 改成膽氣減三成、神兵耐久掉當下的兩成）：這一輪沒取經的加成與指定一併取消，可以回玄武那邊補取經；送回地界外
      const p = this.player, f = p.fight; if (!f) return;
      const id = f.id, b = BOSSES[id] || { zone: id, place: '' }, c0 = p.cour; this.endFight();
      this.ents.list = this.ents.list.filter(o => !(o.type === '豬' && o.callBy));
      if (!this.test) p.cour = U.r4(p.cour * SURRENDER_KEEP); this.courSig = '';   // 測試格：膽氣不減、神兵不掉耐久
      let worn = 0; if (!this.test) for (const s of p.tools.concat(p.bag)) if (s && GODS.indexOf(s.n) >= 0 && s.dur !== undefined) { s.dur = Math.max(1, U.r4(s.dur * (1 - GOD_WEAR))); worn++; }   // v0.8.13：掉的是當下耐久的兩成（原本是上限的兩成）
      const cancel = this.cancelRound(f);
      const o = p.bossOut, zz = BOSSES[id] && this.bossZone(id), inGround = zz && Math.hypot(p.x - zz.x, p.y - zz.y) <= BOSSES[id].r + BOSS_EXIT; let moved = false;
      // 還在地界裡、跟進來時一樣（都在船上或都在陸上），才送回地界外最後一格
      if (o && inGround && !!o.sail === !!p.sailing && !p.swimming) { this.jumpTo(o.x, o.y); moved = true; }
      if (f) p.inBoss[id] = moved ? false : true;
      this.toast(why ? '逾時判負' : '認輸', (why ? why + '，照認輸罰：' : '') + (this.test ? '測試格，膽氣不減' : '膽氣減三成（' + fmt(c0) + ' → ' + fmt(p.cour) + '）') + (worn ? '，神兵耐久各掉當下的兩成' : '') + '。' + (f ? b.zone + '回' + b.place + '，養回滿命。' : '') + cancel + (moved ? '你退回了地界外。' : ''), 10000); SFX.fail();
      this.buildBag(); if (this.userPaused) this.togglePause();
    }
    cancelRound(f) {     // 這一場沒拿牠的經加的那一層取消（認輸、死、時限到；v0.8.13 起死了也取消）；珠回到原樣；回傳要說的那句
      if (!f) return ''; this.courSig = '';
      if (BOSSES[f.id] && BOSSES[f.id].gong) { this.player.gongLost = f.jing ? 'jing' : 'none'; return f.jing ? '立極卷還在，第四顆珠還是紅問號。' : '第四顆珠退回小灰點。'; }   // 被共工擊敗（v0.8.23 使用者定，v0.9 接上）
      if (f.jing) return '手上的' + JING[f.id].scroll + '還在，那顆珠回到紅圈。';
      return '這一場沒拿經加的那一層取消了，珠上的黑問號也抹掉了；回玄武那邊補取經吧。';
    }
    fleeButton() {       // 暫停面板的「認輸」：按兩次
      const p = this.player; if (!p.fight) return;
      if (!this.fleeArm || performance.now() - this.fleeArm > 3000) { this.fleeArm = performance.now(); $('pause-flee').textContent = '再按一次認輸（膽氣減三成、神兵耐久掉兩成）'; return; }
      this.fleeArm = 0; this.surrender();
    }
    bossDown(e) {        // 斃了大魔王：記下、膽氣、獨力的記成就、戰利品
      const p = this.player, f = p.fight || { id: '封豨', solo: true }, b = BOSSES[f.id];
      if (b.gong) { this.gongDown(e, f); return; }
      this.bossZero = { name: b.zone, max: e.max || DB[e.type].hp, until: performance.now() + ZERO_MS };   // 命條歸零停五秒（v0.8.20；v0.8.21 使用者定五秒）
      this.ents.remove(e); this.stats.kills++;
      let jingText = '';   // v0.8.21：拿著牠的經斃了是朱紅實心；沒拿牠的經斃了打黑叉，這一層永久留著、往後玄武的影子跟著加（v0.8.33：玄武偶就是影子）
      if (f.jing) { const sc = (p.scrolls || []).filter(x => x.id === f.id).pop(); if (sc) sc.dust = this.day(); jingText = JING[f.id].scroll + '用上了，化作塵埃；那顆珠點成朱紅。'; p.jingFor = null; }   // v0.8.22 使用者定：拿著經斃了那一隻，經化作塵埃
      else { p.bossBuff = (p.bossBuff || 0) + 1; p.puppet = (p.puppet || 0) + 1; jingText = '沒拿' + JING[f.id].scroll + '就斃了：那顆珠打上黑叉，剩下的大魔王永久 +' + Math.round(p.bossBuff * BUFF_STEP * 100) + '%；往後玄武的試煉，影子 +' + Math.round((this.missCount() + 1) * TRIAL_STEP * 100) + '%。' + (p.jingFor && JING[p.jingFor] ? '手上的' + JING[p.jingFor].scroll + '還在。' : ''); }
      f.penal = false; const layers = this.buffLayers();   // 斃的時候這一隻帶著幾層（沒經的那一層已併進 p.bossBuff）
      p.bosses = p.bosses || {}; p.bosses[f.id] = { diff: this.diff.key, solo: !!f.solo, day: this.day(), buff: layers, step: BUFF_STEP, jing: !!f.jing };
      p.codex = p.codex || {}; p.codex[f.id] = (p.codex[f.id] || 0) + 1;
      p.trophies = p.trophies || {}; p.trophies[f.id] = { n: b.trophy, day: this.day() };   // 戰利品（v0.8.9）：不佔囊，帶給玄武看
      const meat = b.meat || ['肉', 8], got = this.addCourage(b.cour * (this.isNight() ? KILL_NIGHT : KILL_DAY), 'kill'), meatAt = this.giveNear(meat[0], meat[1]);
      const buffText = layers ? ' · 大魔王 +' + Math.round(layers * BUFF_STEP * 100) + '%' : '', ring = RING[f.id];
      p.feats = p.feats || []; p.feats.push({ id: f.id, text: b.feat + ' · ' + this.diff.name + ' · ' + (f.solo ? '獨力' : (f.guardBy || '神獸') + '護駕') + buffText + (f.jing ? '' : ' · 無經'), day: this.day() });   // v0.8.21 使用者定：每一回斃了都記，寫難度與加成
      const solos = Object.values(p.bosses).filter(x => x.solo).length;
      this.ents.list = this.ents.list.filter(o => !(o.type === '豬' && o.callBy));
      p.fight = null; p.lockT = 0; p.guardT = 0; this.bossSig = null; this.courSig = '';
      this.toast(b.feat, b.line + '膽氣 +' + fmt(this.shown('cour', got)) + '，得' + meat[0] + (meat[1] === 8 ? '八' : ' ×' + meat[1]) + (meatAt ? '（囊滿了，用小囊包著擱在' + meatAt.where + '）' : '') + '，還有一' + b.trophyUnit + '<b>' + b.trophy + '</b>（不佔囊，帶去給玄武看）。' + (ring ? '魂環的' + ring[1] + '亮了起來。' : '') + (f.solo ? '獨力斃之，記一筆成就（' + this.diff.name + buffText + '）。自傲是有代價的：獨力斃的大魔王越多，將來的共工越強（現在 +' + SOLO_BUFF[Math.min(3, solos)] + '%）。' : f.guardBy + '護駕過，這一場不算獨力（照樣記進成就：' + this.diff.name + buffText + '）。') + (jingText ? '<br>' + jingText : ''), 16000);
      SFX.learn(); this.renderer.shake = 0.6; this.save();
    }
    gongDown(e, f) {     // 斃了共工（v0.9）：立四極——記下、膽氣、朱髮、成就；全程困難、一顆十字星都不拿、三隻都沒拿經就斃、沒披玄甲、也沒拿立極卷，就是「服了？服了！」
      const p = this.player, b = BOSSES['共工'], k = this.gongK(!!f.jing), pct = Math.round((k - 1) * 100);
      this.bossZero = { name: b.zone, max: e.max || DB[e.type].hp, until: performance.now() + ZERO_MS };
      this.ents.remove(e); this.stats.kills++; this.mud = new Map(); this.burns = [];
      const three = Object.keys(RING), bs = p.bosses = p.bosses || {}, stars = ['azure', 'bai', 'zhu'].filter(x => p[x]).length;
      const fu = !!p.hardOnly && !stars && three.every(id => bs[id] && bs[id].jing === false) && !this.xuanLayers() && !f.jing && p.jingFor !== '共工' && p.gongLost !== 'jing' && (p.mealN || 0) <= MEAL_FU_CAP;
      if (f.jing) { const sc = (p.scrolls || []).filter(x => x.id === '共工').pop(); if (sc) sc.dust = this.day(); p.jingFor = null; }
      bs['共工'] = { diff: this.diff.key, solo: !!f.solo, day: this.day(), k, jing: !!f.jing };
      p.codex = p.codex || {}; p.codex['共工'] = (p.codex['共工'] || 0) + 1;
      p.trophies = p.trophies || {}; p.trophies['共工'] = { n: b.trophy, day: this.day() };
      const got = this.addCourage(b.cour * (this.isNight() ? KILL_NIGHT : KILL_DAY), 'kill');
      p.feats = p.feats || []; p.feats.push({ id: '共工', text: b.feat + ' · ' + this.diff.name + ' · 共工 +' + pct + '% · ' + (f.solo ? '獨力' : (f.guardBy || '神獸') + '護駕') + (f.jing ? '' : ' · 無經'), day: this.day() });   // 設計稿〈三〉：成就寫明難度與這個百分比
      if (fu) { p.gold = true; p.feats.push({ id: '服了', text: '服了？服了！ · 從頭到尾困難、誰也不靠', day: this.day(), gold: true }); }
      p.fight = null; p.lockT = 0; p.guardT = 0; this.bossSig = null; this.courSig = ''; p.gongLost = undefined;
      const pav = this.placePavilion(true);   // 還願（v0.9.10）：亭一定立起來
      this.grantKey();   // 下一章的鑰（v0.9.11）
      this.placePillarStele();   // 天柱下的碑（v0.9.13）
      this.toast(b.feat, b.line + '共工倒在不周山的盆地裡，地慢慢平了下來。膽氣 +' + fmt(this.shown('cour', got)) + '，還有一' + b.trophyUnit + '<b>' + b.trophy + '</b>（不佔囊）。記一筆成就：' + this.diff.name + ' · 共工 +' + pct + '%' + (f.solo ? ' · 獨力' : ' · ' + f.guardBy + '護駕') + '。<br>' + (pav ? '回你被寫出來的地方，到惜字亭' + (p.wish ? '還願。' : '去——你沒許過願，補許一個，當下就還。') : '') + '<br>' + this.keyText() + (fu ? '<br><b>服了？服了！</b>——從頭到尾都在困難裡，誰也不靠。你身上的「人」，從此是金色的。' : ''), 20000);
      SFX.learn(); this.renderer.shake = 1; this.save();
    }
    hogWind(e) { this.fx.push({ type: 'write', x: e.x + 0.5, y: e.y + 1.2, ch: '塵', color: G.INK.brown, t: 0, dur: 0.9 }); }
    hogQuake(e) { SFX.ram(); this.renderer.shake = 0.4; this.fx.push({ type: 'write', x: e.x + 0.5, y: e.y + 0.5, ch: '塵', color: G.INK.brown, t: 0, dur: 1 }); }
    hogEat(e, ok) {
      if (ok === null) { this.fx.push({ type: 'float', x: e.x + 0.5, y: e.y, text: '荐食', color: G.INK.plant, t: 0, dur: 1.4 }); this.message(this.beastName(e) + '去啃樹回命（荐食）——趁牠吃的時候打，就吃不成。'); }
      else if (ok) this.message(this.beastName(e) + '啃光了一棵樹，命回了一截。');
      else this.message('打斷了！' + this.beastName(e) + '沒吃成。');
    }
    hogCall(e, n) { SFX.beast('豬'); this.message(this.beastName(e) + '一聲吼，' + (e.shade ? '墨裡又聚出 ' + n + ' 頭豕影' : '林子裡衝出 ' + n + ' 頭野豬') + '（群豕）。'); }
    // ---------- 修蛇的招式（v0.8.16）：實體在 entities.js 的 snakeAct()／snakeTimers()，打到人、船在這裡結算 ----------
    coiled() { return this.ents.list.some(o => o.type === '修蛇' && o.state === 'coil'); }
    bossBlocked(e) { const p = this.player; return p.trialLockT > 0 || (!e.shade && p.fight && (p.guardT > 0 || p.lockT > 0)); }   // 護駕、鎖血、玄武鎖命時打不到
    bossShip(e, dmg, move) {   // 魔王打到船：照難度與加成（墨影照它的成數）；護駕、鎖血時打不到
      const p = this.player, s = p.ship; if (!p.sailing || !s) return 0;
      const name = this.beastName(e); if (this.bossBlocked(e)) { this.fx.push({ type: 'float', x: p.x, y: p.y, text: '擋', color: G.INK.azure, t: 0, dur: 0.6 }); return 0; }
      const d = U.r4(dmg * this.bossK(e) * this.diff.taken); this.shipLoss(s, d); this.renderer.shake = 0.6; SFX.beast(e.type);
      this.fx.push({ type: 'float', x: p.x, y: p.y, text: '船 −' + this.shown('ship', d), color: G.INK.red, t: 0, dur: 0.9 });
      if (s.hp <= 0) { this.message(name + move + '，船碎了！'); this.wreck(); return d; }
      this.message(name + move + '！' + s.kind + '的命 ' + Math.round(s.hp) + '/' + Math.round(this.shipMax(s)) + '。'); return d;
    }
    snakeDive(e) { this.fx.push({ type: 'write', x: e.x, y: e.y, ch: '潛', color: G.INK.water, t: 0, dur: 0.8 }); this.message(this.beastName(e) + '沉下去了（潛蹤）——盯著水面，冒泡的地方牠要上來。'); }
    snakeSurface(e, b) {   // 浮上來：船身在一格內就撞船；人在一格內就撞人
      const p = this.player, SN = Entities.SNAKE; this.fx.push({ type: 'write', x: e.x, y: e.y, ch: '浪', color: G.INK.water, t: 0, dur: 0.6 }); this.renderer.shake = Math.max(this.renderer.shake, 0.3);
      if (p.sailing && this.ents.snakeReach(e, this, p) <= 1) this.bossShip(e, SN.ram, '從水底撞上來');
      else if (U.cheb(e.x, e.y, p.x, p.y) <= 1) this.bossHit(e, SN.bite, '力', '從水底撞上來');
      else this.message(this.beastName(e) + '浮上來了。');
    }
    snakeCoilStart(e) { this.renderer.shake = 0.5; SFX.beast('修蛇'); this.toast('長蛇纏舟', this.beastName(e) + '纏住了船：四息動不了，每息掉八。頭露在外面——打頭多吃五成。', 5000); }
    snakeCoilTick(e) { this.bossShip(e, Entities.SNAKE.coilDmg, '絞緊了船身'); }
    snakeCoilEnd(e) { if (this.player.sailing) this.message(this.beastName(e) + '鬆開了船。'); }
    snakeGapeWind(e) { SFX.beast('修蛇'); this.message(this.beastName(e) + '把頭抬起來了（吞象）——面前那條紅線，一息半後咬下去，快讓開！'); }
    snakeGape(e, cells) {
      const p = this.player; this.fx.push({ type: 'write', x: e.x + (e.gdx || 0) * 2, y: e.y + (e.gdy || 0) * 2, ch: '吞', color: G.INK.red, t: 0, dur: 0.7 });
      if (cells.some(([x, y]) => x === p.x && y === p.y)) this.bossHit(e, Entities.SNAKE.gape, '溺', '吞象'); else this.message('吞象落空，' + this.beastName(e) + '咬了一口水。');
    }
    snakeSpitOut(e) { this.message(this.beastName(e) + '吐了一口毒涎——落點那一圈三格，快離開！'); }
    snakeSpit(e, s) {      // 毒涎落地：一圈三格內中毒，照蛇毒（每息一點五、九息）；算魔王的傷
      const p = this.player, SN = Entities.SNAKE; this.fx.push({ type: 'write', x: s.x, y: s.y, ch: '涎', color: G.INK.plant, t: 0, dur: 0.8 });
      if (U.cheb(p.x, p.y, s.x, s.y) > 1) return;
      if (this.bossBlocked(e) || this.ironFull()) { this.message('毒涎濺在' + (this.ironFull() ? '鐵甲上，毒進不去。' : '身邊，沒沾上。')); return; }
      const per = U.r4(SN.spitPer * this.bossK(e)); this.poison(per, SN.spitT, { name: this.beastName(e), big: true }); p.hurtT = 6;
      this.message('中了' + this.beastName(e) + '的毒涎：中毒 ' + SN.spitT + ' 息，共 −' + this.shown('poison', per * SN.spitT) + '。藥可解。');
    }
    bossPoison(d) {        // 魔王的毒（v0.8.16 毒涎）每一下：鎖血、護駕、試煉照樣管；死了算死在魔王手上
      const p = this.player, f = p.fight, g2 = GUARD[this.diff.key], by = p.poisonBy;
      if (this.test || p.trialLockT > 0 || (f && (p.lockT > 0 || p.guardT > 0))) return;
      if (p.trial && p.hp - d < 1) { this.trialSave(); return; }
      if (f && g2 && !f.locked && p.hp - d < 1) { p.hp = 1; f.locked = true; p.lockT = g2.lock; p.poisonT = 0; p.poisonPer = 0; p.poisonBy = null; this.toast('命懸一線', '毒發，命只剩一點——鎖住了 ' + g2.lock + ' 息，毒也解了。', 6000); return; }
      p.hp = Math.max(0, U.r4(p.hp - d)); p.lastHit = { kind: '毒', by: by.name, big: true, t: this.world.time };
    }
    // ---------- 大風的招式（v0.8.25）：實體在 entities.js 的 windAct()／windTimers()，打到人、船、屋子在這裡結算 ----------
    roofedNow() { const p = this.player; return !!DB[this.world.get(p.x, p.y)].shelter || this.indoors(); }   // 頭上有屋頂（地標屋舍或磚圍得住）
    windDive(e) { SFX.beast('大風'); this.message(this.beastName(e) + '收起翅膀撲下來了——貼到你身邊那一下，是近身打牠的時候。'); }
    windRoofed(e) { this.message('你躲在屋裡，' + this.beastName(e) + '撲不下來，在屋頂上打轉——牠要吹屋子了（摧屋拔木）。'); }
    windFree(e) { this.message(this.beastName(e) + '掙開了矰上的絲，又飛回天上。'); }
    windClaw(e) {        // 入木三分：一抓一分。一分鎖喉（窒）、二分再加懼、三分深懼；十四息不再抓就從頭算
      const W = Entities.WIND, p = this.player; e.claws = Math.min(3, (e.claws || 0) + 1); e.clawT = W.clawKeep;
      const d = this.bossHit(e, W.claw, '力', '撲下來一抓'); if (!d || p.dead) return;
      const n = e.claws, ch = this.bossChoke(e, W.choke, W.chokePer);
      if (n >= 2 && !this.test) p.fearT = Math.max(p.fearT || 0, W.fear[n - 1]);
      this.fx.push({ type: 'float', x: p.x, y: p.y - 0.7, text: '入木' + NTH[n - 1] + '分', color: G.INK.red, t: 0, dur: 1.3 });
      this.message('入木' + NTH[n - 1] + '分：' + (ch ? '鎖喉（窒），' + W.choke + ' 息內力與愜意一直掉、力光了掉命，吃不下也睡不著' : '爪子擦過喉頭') + (n === 2 ? '；心裡一慌（懼）' : n === 3 ? '；深懼，好一陣出不了手' : '') + '。');
    }
    bossChoke(e, t, per) {   // 窒（v0.8.25，設計稿〈一〉）：鎖喉——力每息掉 per、愜意掉一半，力光了照「力盡」掉命；窒著不能吃、不能睡。朱雀的氣順少四分之一
      const p = this.player; if (p.dead || this.bossBlocked(e)) return 0;
      const v = U.r4(per * this.kindMult('窒') * this.bossK(e));
      if (v <= 0) return 0;
      p.chokeT = Math.max(p.chokeT || 0, t); p.chokePer = Math.max(p.chokePer || 0, v); p.chokeBy = { name: this.beastName(e), big: !e.shade };
      return v;
    }
    chokeTick(dt) {      // 窒著：力與愜意掉；力光了掉命那一下，鎖血、護駕、試煉照管，死了算死在魔王手上
      const p = this.player; if (!(p.chokeT > 0)) return;
      p.chokeT = Math.max(0, p.chokeT - dt * (this.mealOn('稻') ? 1 / this.mealCut() : 1));   // 稻飯那一頓窒消得快（v0.9.18）
      if (!this.test) {
        const v = (p.chokePer || 0) * dt, by = p.chokeBy || {}, f = p.fight, g2 = GUARD[this.diff.key];
        p.sta = Math.max(0, U.r4(p.sta - v)); p.san = Math.max(0, U.r4(p.san - v * 0.5));
        if (p.sta <= 0 && by.name) {
          p.lastHit = { kind: '窒', by: by.name, big: !!by.big, t: this.world.time };
          const close = p.hp - 2 * dt < 1;   // 力盡每息掉命二（updateStats）
          if (close && p.trial && !by.big) { this.trialSave(); p.chokeT = 0; }
          else if (close && f && g2 && !f.locked && by.big) { p.hp = 1; p.sta = Math.max(p.sta, 10); f.locked = true; p.lockT = g2.lock; p.chokeT = 0; this.toast('命懸一線', '喘不上氣，命只剩一點——鎖住了 ' + g2.lock + ' 息，喉頭也鬆開了。', 6000); }
          else if (p.lockT > 0 || p.guardT > 0 || p.trialLockT > 0) p.sta = Math.max(p.sta, 1);   // 鎖著、護駕著：窒不傷命
        }
      }
      if (!p.chokeT) { p.chokePer = 0; p.chokeBy = null; this.message('喉頭鬆開了，喘得過氣。'); }
    }
    windWhirlWarn(e) { this.message('你腳下捲起一團旋風（扶搖）——一息多後把人拋出去，快走開！'); }
    windWhirl(e, wh) {   // 扶搖：旋風三乘三，人在裡面就挨一下、被拋出三格、轉得暈頭（亂）；坐在船上就打船
      const W = Entities.WIND, p = this.player; this.fx.push({ type: 'write', x: wh.x, y: wh.y, ch: '旋', color: '#5b6b7a', t: 0, dur: 0.8 });
      if (U.cheb(p.x, p.y, wh.x, wh.y) > 1 || p.dead) { this.message('扶搖落空，旋風捲上天去了。'); return; }
      if (p.sailing) { this.bossShip(e, W.whirl, '捲起一陣扶搖'); return; }
      const d = this.bossHit(e, W.whirl, '力', '扶搖'); if (!d || p.dead) return;
      let ax = Math.sign(p.x - wh.x), ay = Math.sign(p.y - wh.y); if (!ax && !ay) [ax, ay] = N8[Math.floor(Math.random() * 8)];
      for (let k = W.throwN; k >= 1; k--) { const x = p.x + ax * k, y = p.y + ay * k; if (this.pass(x, y) && !this.ents.at(x, y) && !DB[this.world.get(x, y)].bog) { this.stopWalk(); this.jumpTo(x, y); break; } }
      if (!this.test) p.confuseT = Math.max(p.confuseT || 0, W.dizzy);
      this.message('扶搖！你被捲起來拋出去，轉得暈頭（亂）：方向鍵轉九十度，' + W.dizzy + ' 息。');
    }
    windGaleWarn(e) { SFX.beast('大風'); this.message(this.beastName(e) + '鼓起翅膀朝你這邊吹（摧屋拔木）——地上畫出的風路，一息後吹到，快閃開！'); }
    windGale(e, gl, cells) {   // 摧屋拔木：風路上人造的磚門窗與墟吹兩下（看不見的耐久）、樹連根拔起；人在風裡挨一下、被推開兩格；坐在船上就打船
      const W = Entities.WIND, w = this.world, p = this.player; let walls = 0, trees = 0;
      this.renderer.shake = Math.max(this.renderer.shake, 0.35); SFX.ram();
      for (const [x, y] of cells) {
        const ch = w.get(x, y);
        if (this.ents.rammable(x, y)) { for (let k = 0; k < 2; k++) { const r = w.hitWall(x, y); if (r === 'broken') { w.set(x, y, '白'); this.fx.push({ type: 'write', x, y, ch: '碎', color: G.INK.red, t: 0, dur: 0.6 }); walls++; break; } if (!r) break; } }
        else if ('木林森竹'.indexOf(ch) >= 0 && !(w.placeTiles && w.placeTiles.has(U.key(x, y)))) { w.set(x, y, '土'); trees++; }
      }
      this.fx.push({ type: 'write', x: gl.x + gl.dx * 4, y: gl.y + gl.dy * 4, ch: '風', color: '#5b6b7a', t: 0, dur: 0.9 });
      const hitMe = cells.some(([x, y]) => x === p.x && y === p.y) && !p.dead;
      if (hitMe && p.sailing) this.bossShip(e, W.galeShip, '一陣狂風');
      else if (hitMe && this.bossHit(e, W.gale, '力', '摧屋拔木') && !p.dead) {
        for (let k = W.galePush; k >= 1; k--) { const x = p.x + gl.dx * k, y = p.y + gl.dy * k; if (this.pass(x, y) && !this.ents.at(x, y) && !DB[w.get(x, y)].bog) { this.stopWalk(); this.jumpTo(x, y); break; } }
      }
      if (walls || trees) this.message('一陣狂風（摧屋拔木）' + (walls ? '，吹垮了 ' + walls + ' 處磚門窗' : '') + (trees ? '，拔起 ' + trees + ' 棵樹' : '') + '。');
      else if (!hitMe) this.message('一陣狂風從身邊刮過去。');
    }
    windSandWarn(e) { this.message('飛沙走石——地上冒出幾個圈，石頭一息內落下來，走開！'); }
    windSand(e, cells) {   // 飛沙走石（命剩一半起）：落點上的人挨一下；屋頂擋得住
      const W = Entities.WIND, p = this.player;
      for (const [x, y] of cells) this.fx.push({ type: 'write', x, y, ch: '石', color: '#6b5a48', t: 0, dur: 0.5 });
      if (p.dead || !cells.some(([x, y]) => x === p.x && y === p.y)) return;
      if (this.roofedNow()) { this.message('石頭砸在屋頂上，沒落到你身上。'); return; }
      this.bossHit(e, W.sand, '力', '飛沙走石');
    }
    // ---------- 共工的招式（v0.9）：實體在 entities.js 的 gongAct()／gongTimers()，打到人、地在這裡結算 ----------
    gongTake(e, tool) {  // 共工挨一下的成數（設計稿〈七〉〈十四〉2）：平時對的神兵全傷、錯的神兵三成、凡兵三分之一；本相時對的一倍半（對的是他「要換成」的那個模式的）、錯的三成、凡兵一成
      if (!e || e.type !== '共工') return 1;
      const shift = e.shiftT > 0, want = GONG_GOD[shift ? (e.next || e.mode) : e.mode], god = Object.values(GONG_GOD).indexOf(tool) >= 0;
      if (!god) return shift ? GONG_SHIFT_IRON : GONG_IRON;
      return tool === want ? (shift ? GONG_SHIFT_RIGHT : 1) : GONG_WRONG;
    }
    gongTakeText(e, tool) { const k = this.gongTake(e, tool); return k === 1 ? '' : k > 1 ? '（本相，對的神兵一倍半）' : k === GONG_WRONG ? '（神兵不對，只吃三成）' : k === GONG_IRON ? '（凡兵只吃三分之一）' : '（本相，凡兵只吃一成）'; }
    mudAt(x, y) { const m = this.mud && this.mud.get(U.key(x, y)); return m ? (m.t > MUD_DRY ? '淖' : '泥') : null; }   // 液化的地：淖十二息、再凝成泥，然後回原字（只是畫在上面，地不改）
    onMud() { const p = this.player; return !p.sailing && !p.swimming && this.mudAt(p.x, p.y) === '淖'; }
    mudSet(x, y) { const d = DB[this.world.get(x, y)]; if (!d || d.kind === 'water' || d.kind === 'fire') return; (this.mud = this.mud || new Map()).set(U.key(x, y), { x, y, t: MUD_T + MUD_DRY }); }
    gongShift(e) {
      SFX.beast('共工'); this.renderer.shake = Math.max(this.renderer.shake, 0.4);
      if (e.stages) { this.message(this.beastName(e) + '現出本相——第' + NTH[e.stage] + '段（' + GONG_MODE_NAME[e.next] + '）要來了，八息內不出招；這時用' + GONG_GOD_NAME[e.next] + '打，一倍半。'); return; }   // 立極（v0.9.10）：照段換，換成什麼是定的
      this.message('共工現出本相——要換模式了，八息內不出招。看不出要換成什麼；換對神兵打，一倍半。');
    }
    gongHint(e) { const h = GONG_HINT[e.next || e.mode]; this.message('地上' + (h === '氵' ? '浮起「氵」紋' : h === '土' ? '揚起「土」塵' : '捲起「風」字') + '。'); }
    gongMode(e, stay) {
      if (stay) { this.message('共工猶豫了一下，還是這副樣子。'); return; }
      SFX.beast('共工'); this.renderer.shake = Math.max(this.renderer.shake, 0.5);
      const nm = this.beastName(e);
      this.message({ sea: nm + '沉進地裡（海）——地上只見朱髮劃過，身後化成淖。燭龍焚溟打他全傷。', land: nm + '立成一根「工」（陸）——九格內把你往他那邊拖、頭觸、隕石。九閽鳴雷打他全傷，打中七息拖不動你。', sky: nm + '倒懸在天上（空）——力壓千鈞、星移斗轉，天也跟著斜。青冥落羽打他全傷。' }[e.mode]);
    }
    gongDigWarn(e, dg) { this.message('腳下的地在翻（入地如入水）——一息後他從底下鑽出來，快走開！'); }
    gongDig(e, dg) {     // 入地如入水：從原本你腳下那一格鑽出來，那一格與四周化成淖；人還在那一格就溺、在他一格內就挨翻身一撞
      const p = this.player, G2 = Entities.GONG; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.mudSet(dg.x + dx, dg.y + dy);
      this.fx.push({ type: 'write', x: dg.x, y: dg.y, ch: '淖', color: G.INK.brown, t: 0, dur: 0.7 }); this.renderer.shake = Math.max(this.renderer.shake, 0.4);
      if (p.dead || p.sailing) return;
      if (p.x === dg.x && p.y === dg.y) this.bossHit(e, G2.drown, '溺', '從你腳下鑽出來（入地如入水）');
      else if (U.cheb(e.x, e.y, p.x, p.y) <= 1) this.bossHit(e, G2.ram, '力', '鑽出來翻身一撞');
      else this.message(this.beastName(e) + '從地裡鑽出來，撲了個空。他露在外面兩息——近身打！');
    }
    gongMud(ox, oy, dx, dy) { this.mudSet(ox, oy); this.mudSet(ox - dy, oy + dx); }   // 海：游過的兩格寬化成淖（身後那格與身側一格）
    gongMeteorWarn(e) { this.message('天上落下隕石——地上的「◎」一息半後砸下，走開！'); }
    gongMeteor(e, cells) {   // 隕石：落點的人挨震（台棧船上不受），那格變焦二十息、踩上去灼
      const p = this.player; this.renderer.shake = Math.max(this.renderer.shake, 0.5); SFX.ram();
      for (const [x, y] of cells) { this.fx.push({ type: 'write', x, y, ch: '隕', color: '#5a3e2b', t: 0, dur: 0.6 }); const d = DB[this.world.get(x, y)]; if (d && d.kind !== 'water') { this.burns = (this.burns || []).filter(b => b.x !== x || b.y !== y); this.burns.push({ x, y, t: BURN_T }); } }
      if (!p.dead && cells.some(([x, y]) => x === p.x && y === p.y)) this.bossHit(e, Entities.GONG.meteor, '震', '的隕石砸下來');
    }
    gongPull(e) {        // 吸力：九格內每一息半把你往他那邊拖一格；九閽鳴雷打中他一下，七息內拖不動
      const p = this.player; if (p.dead || p.sailing || this.bossBlocked(e) || this.world.time < (e.noPullAt || 0)) return;
      let best = null, bd = Infinity; for (const [cx, cy] of this.ents.gongCells(e)) { const d = U.cheb(cx, cy, p.x, p.y); if (d < bd) { bd = d; best = [cx, cy]; } }
      if (!best || bd <= 1) return;
      const x = p.x + Math.sign(best[0] - p.x), y = p.y + Math.sign(best[1] - p.y);
      if (!this.pass(x, y) || this.ents.at(x, y) || DB[this.world.get(x, y)].bog) return;
      this.stopWalk(); this.jumpTo(x, y); this.fx.push({ type: 'float', x: p.x, y: p.y - 0.6, text: '引', color: '#5a3e2b', t: 0, dur: 0.6 });
      if (!p.warned.gongPull) { p.warned.gongPull = true; this.toast('地在傾', '共工立成「工」時，九格內的地都往他那邊斜，每一息半把你拖一格。用九閽鳴雷打中他，七息內拖不動你。'); }
    }
    gongPressWarn(e, pr) { this.message('地上一圈「壓」（力壓千鈞）——兩息後還在圈裡就喘不過氣，走出兩格外！'); }
    gongPress(e, pr) {   // 力壓千鈞：圈裡的人鎖喉（窒）四息
      const p = this.player; this.fx.push({ type: 'write', x: pr.x, y: pr.y, ch: '壓', color: '#3b3a40', t: 0, dur: 0.7 });
      if (p.dead || U.dist(p.x, p.y, pr.x, pr.y) > Entities.GONG.pressR + 0.5) { this.message('力壓千鈞落空。'); return; }
      const G2 = Entities.GONG, ch = this.bossChoke(e, G2.choke, G2.chokePer); this.renderer.shake = Math.max(this.renderer.shake, 0.4);
      this.message(ch ? '力壓千鈞（窒）：' + G2.choke + ' 息內力與愜意一直掉、力光了掉命，吃不下也睡不著。' : '力壓千鈞壓下來，沒壓到你。');
    }
    gongStars(e) {       // 星移斗轉：心 6、亂 3 息
      const p = this.player, G2 = Entities.GONG; if (p.dead) return;
      this.fx.push({ type: 'stars', x: p.x, y: p.y, t: 0, dur: 1.8 });
      if (this.bossBlocked(e)) { this.message('星移斗轉——' + (p.guardT > 0 && p.fight ? p.fight.guardBy + '擋在你前面' : '你這時護著') + '，星光沒落到你身上。'); return; }
      const v = this.hurt(U.r4(G2.star * this.bossK(e)), '心', { name: this.beastName(e), big: !e.shade });
      if (!this.test) p.confuseT = Math.max(p.confuseT || 0, G2.dizzy);
      this.fx.push({ type: 'float', x: p.x, y: p.y - 0.8, text: '亂', color: '#3b3a40', t: 0, dur: 1.4 });
      this.message('星移斗轉：天上的星繞著你轉（心），愜意 −' + this.shown('hurt', v) + '；暈頭轉向（亂），方向鍵轉九十度，' + G2.dizzy + ' 息。');
    }
    tiltTick(dt) {       // 共工的空（v0.9，設計稿〈七〉）：整個畫面往西北斜三度，慢慢轉過去、轉回來；放大一點蓋住四角。滑鼠點的格子照轉回來的座標算（unTilt）
      const e = this.ents.list.find(o => o.type === '共工'), want = e && e.mode === 'sky' && !(e.shiftT > 0) ? -GONG_TILT : 0, cur = this.tiltDeg || 0;
      if (cur === want) return;
      let nx = cur + (want - cur) * Math.min(1, dt * 3); if (Math.abs(want - nx) < 0.02) nx = want; this.tiltDeg = nx;
      const r = this.renderer, a = Math.abs(nx) * Math.PI / 180, big = Math.max(r.w, r.h) / Math.max(1, Math.min(r.w, r.h));
      this.tiltK = nx ? Math.cos(a) + big * Math.sin(a) : 1;
      $('world').style.transform = nx ? 'rotate(' + nx.toFixed(3) + 'deg) scale(' + this.tiltK.toFixed(4) + ')' : '';
    }
    unTilt(x, y) {       // 螢幕上的點轉回畫布上的點（畫面斜著時）
      const d = this.tiltDeg || 0; if (!d) return { x, y };
      const r = this.renderer, a = -d * Math.PI / 180, cx = r.w / 2, cy = r.h / 2, vx = (x - cx) / this.tiltK, vy = (y - cy) / this.tiltK;
      return { x: cx + vx * Math.cos(a) - vy * Math.sin(a), y: cy + vx * Math.sin(a) + vy * Math.cos(a) };
    }
    gongTick(dt) {       // 共工的地：淖、泥、焦的倒數；站在淖上（液化的地）命越掉越快（頭三息每息一、再三息二、之後三，離開兩息才從頭算）、站在焦上灼。共工不在了就全散
      const p = this.player, e = this.ents.list.find(o => o.type === '共工');
      if (!e) { if ((this.mud && this.mud.size) || (this.burns && this.burns.length)) { this.mud = new Map(); this.burns = []; } p.mudT = 0; return; }
      if (this.mud) for (const [k, m] of this.mud) { m.t -= dt; if (m.t <= 0) this.mud.delete(k); }
      if (this.burns && this.burns.length) { for (const b of this.burns) b.t -= dt; this.burns = this.burns.filter(b => b.t > 0); }
      if (p.dead) return;
      if (this.onMud()) { p.mudT = (p.mudT || 0) + dt; p.mudOff = 0; const per = MUD_HURT.find(([t]) => p.mudT <= t)[1]; this.bossHit(e, per * dt, '溺', '的淖', true);
        if (!p.warned.gongMud) { p.warned.gongMud = true; this.toast('液化的地', '淖是共工游過、鑽出來的地方：走得慢六成五，手上的兵器只剩七成五，站越久命掉得越快（每息一、二、三）。走開兩息才從頭算；十二息後凝成泥就不礙事了。'); } }
      else if (p.mudT) { p.mudOff = (p.mudOff || 0) + dt; if (p.mudOff >= MUD_REST) { p.mudT = 0; p.mudOff = 0; } }
      if (!p.sailing && !p.swimming && (this.burns || []).some(b => b.x === p.x && b.y === p.y)) { this.bossHit(e, FIRE_BURN * dt, '灼', '燒焦的地', true); if (!p.warned.gongBurn) { p.warned.gongBurn = true; this.toast('焦', '隕石砸過的地方燒焦了，站上去灼，每息 −' + FIRE_BURN + '；二十息後才冷。'); } }
    }
    // ---------- 玄武取經、惜字亭與許願（v0.8.8） ----------
    trialCap(id) { return id === '共工' ? TRIAL_TRIES : TRIAL_TRIES_BOSS; }   // 有黑叉時九成的影子一卷幾回（v0.8.24 使用者定：大魔王十回、共工的立極三回）
    trialLeft(id) { return Math.max(0, this.trialCap(id) - ((this.player.trialTries || {})[id] || 0)); }   // 有黑叉時這一卷還能試幾回（v0.8.21）
    talk(title, paras, choices) {   // 說話的視窗：幾段話、幾個選項（數字鍵選，Enter 是第一個能選的，Esc 是最後一個）
      this.talking = { choices }; this.paused = true; this.keys.clear(); this.action = null; if (this.stopWalk) this.stopWalk();
      $('talk-title').textContent = title; $('talk-text').innerHTML = paras.map(x => '<p>' + x + '</p>').join('');
      const row = $('talk-row'); row.innerHTML = '';
      choices.forEach((c, i) => {
        const b = document.createElement('button'); b.textContent = (choices.length > 1 ? (i + 1) + '　' : '') + c.label; b.disabled = !!c.off;
        if (choices.length > 1 && i === choices.length - 1) b.className = 'ghost';
        b.addEventListener('click', () => this.talkPick(i)); row.appendChild(b);
      });
      $('talk').classList.remove('hidden');
    }
    talkPick(i) {
      const t = this.talking; if (!t) return; if (i === 'first') i = t.choices.findIndex(c => !c.off); if (i === 'last') i = t.choices.length - 1;
      const c = t.choices[i]; if (!c || c.off) return;
      $('talk').classList.add('hidden'); this.talking = null; this.paused = false; if (c.fn) c.fn();
    }
    askTortoise() {      // 玄武兩格內按 E
      const p = this.player;
      if (p.trial) { this.message('玄武不說話，看著那個' + JING[p.trial.id].shade + '。'); return; }
      if (!p.xuan) this.firstTalk(); else this.jingTalk();
    }
    firstTalk() {        // 第一次見玄武：紙在歪；回出生的地方許願（惜字亭從這時才立起來）
      const p = this.player; p.xuan = { day: this.day() }; p.codex = p.codex || {}; p.codex['玄武'] = (p.codex['玄武'] || 0) + 1;
      const at = this.placePavilion();
      this.talk('北方玄武', [
        '石頭動了。是一隻龜，一條蛇繞著牠慢慢轉。',
        '「你是紙上的一個『人』字。你剛被寫出來的時候，墨還沒乾，我就認得你。」',
        '「這張紙在歪。西北翹起來，東南沉下去；水往低處流，墨也跟著流。字一泡開，就化成一灘泥。一直流下去，整張紙會洗回白紙——島上每個字都會化掉，你也是，那孩子留下的話也是。」',
        '「書上沒寫是誰撞歪了天。我活得久，我記得是他：共工。〈天文訓〉說他『怒而觸不周之山，天柱折，地維絕』。」',
        '「紙一歪，四角翹起來，跑出了東西：洞庭的修蛇、桑林的封豨、青丘的大風。青龍、白虎、朱雀和我，是壓住四角的鎮紙。光壓著，不夠。」',
        '「回你被寫出來的地方去' + (at ? '，那裡立起了一座惜字亭' : '') + '。在那裡許個願。」',
        '「每要去打一隻之前，先來我這裡取一卷經：我吐一個牠的影子，你先打一回。」'
      ], [{ label: '取經', fn: () => this.jingTalk() }, { label: '先不', fn: () => this.message('惜字亭立在你出生的地方附近，回去許個願。') }]);
      SFX.learn(); this.save();
    }
    jingTalk() {         // 取經：選要打哪一隻的影子（v0.8.22 使用者定：一次只拿一卷、斃了的不給經，照樣能打影子練手；六成的隨你打，九成的有黑叉時一卷最多三回）
      const p = this.player, bs = p.bosses || {}, x = this.missCount();
      const pre = Object.keys(p.trophies || {}).filter(id => !p.trophies[id].shown).map(id => { p.trophies[id].shown = true; return '你把' + p.trophies[id].n + '拿給玄武看。玄武看了很久：「' + BOSSES[id].zone + '斃了。紙的一角，壓平了一點。」'; });   // 戰利品帶給玄武看（v0.8.9）
      const say = (paras, choices) => this.talk('北方玄武', pre.concat(paras), choices);
      if (p.fight) { say(['「' + BOSSES[p.fight.id].zone + '那一場還沒了結。打完了、或認輸了，再來取經。」'], [{ label: '好', fn: null }]); return; }   // v0.8.21：戰事掛著時不給取經
      const ids = Object.keys(JING), later = Object.keys(JING_LATER).map(id => ({ label: JING_LATER[id] + '（還沒寫成）', off: true }));
      const held = p.jingFor && JING[p.jingFor] ? '「你手上是' + JING[p.jingFor].scroll + '（' + ((p.shade9 || {})[p.jingFor] ? '九成的影子也斃過' : '只斃過六成的影子') + '）。一次只拿一卷：拿它去斃了' + BOSSES[p.jingFor].zone + '，經化作塵埃。要取別卷就得換，換掉的那一卷散了，再也取不回來。」' : '';
      const xs = x ? '「你沒拿經就斃過 ' + x + ' 隻（' + x + ' 個黑叉）。我吐的影子，每一個黑叉加兩成五，現在 +' + Math.round(x * TRIAL_STEP * 100) + '%。六成的隨你打；九成的，一隻大魔王的卷最多試 ' + TRIAL_TRIES_BOSS + ' 回，共工那一卷（立極）只有 ' + TRIAL_TRIES + ' 回——不是給你練手的。」' : '';
      const tag = (id) => bs[id] ? '　已斃，練手' : p.jingFor === id ? '　拿著了，練手' : this.jingTaken(id) ? '　取過了，練手' : p.jingFor ? '　換或練手' : '';
      const rings = this.ringsAll(), gong = rings ? (bs['共工'] ? '「共工斃了。立極卷照樣能打，只是練手。」' : '「三隻都斃了。第四卷叫立極，取的是共工的經。共工的影子我吐不全，只能一段一段吐：海、陸、空，每打掉三分之一，牠現一回本相、換下一段。三段打完，這一卷才算取到。」') : '';   // v0.9.10
      say(['「你先要去打誰？」' + held, xs, gong,
        '「從大魔王的影子身上取到經，我再給你披一層玄甲，罩在衣甲外：震、窒、心、溺、灼各減 ' + Math.round(XUAN_STEP * 100) + '%，一隻一層，最多三層。」' + (this.xuanLayers() ? '你身上已有 ' + this.xuanLayers() + ' 層。' : ''),
        '玄武吐一口氣，墨聚成那隻的影子，招式跟真身一樣。影子有兩種：六成（命與傷人都是真身的六成）、九成。斃了哪一種都取得到這一卷，九成的才像真身。經卷一隻只取一次，一次只拿一卷（手上有一卷時可以換，換掉的再也取不回來）；取過的、斃過的，影子照樣能打，只是練手，不給經也不給膽氣。',
        '影子不取人命：命只剩一點時，玄武收了影子、替你鎖住命 ' + TRIAL_LOCK + ' 息，這一回不算。走出玄洲就散了，不罰。' + (ids.indexOf('修蛇') >= 0 ? '蛇影在玄洲岸邊的海上，開船去打，岸上也打得到。' : '') + (ids.indexOf('大風') >= 0 ? '風影在玄洲的天上，只有彈弓與青冥落羽打得到天上的牠。' : '')].filter(Boolean),
        ids.map(id => id === '共工' && !rings ? { label: JING[id].scroll + '（' + BOSSES[id].place + '的' + BOSSES[id].zone + '）　三個魂環集齊才給', off: true }   // 立極：三隻大魔王都斃了才開（v0.9.10）
          : { label: JING[id].scroll + '（' + BOSSES[id].place + '的' + BOSSES[id].zone + '）' + tag(id) + (x ? '　九成還剩 ' + this.trialLeft(id) + ' 回' : ''), fn: () => this.pickShade(id) }).concat(later, [{ label: '先不', fn: null }]));
    }
    pickShade(id, swap) {   // 六成還是九成的影子（v0.8.10 使用者定）；v0.8.22：六成的隨你打，九成的有黑叉時一卷最多三回；影子每個黑叉加兩成五
      if (swap === undefined && this.canSwap(id)) { this.swapAsk(id); return; }   // v0.8.23 使用者定：手上有別卷，先問要不要換
      const J = JING[id], base = DB[J.glyph].hp, x = this.missCount(), tk = this.trialK(), hp = (k) => this.bigHp(base * k * tk), up = x ? '，黑叉 ' + x + ' 個再加 ' + Math.round((tk - 1) * 100) + '%' : '', left = this.trialLeft(id);
      const real = J.gong ? '真身（' + this.diff.name + '，拿著立極卷）命 ' + Math.round(this.bigHp(base) * this.gongK(true)) + '。牠分三段：海、陸、空，每打掉三分之一現一回本相（八息不出招，換對神兵一倍半），換下一段；一段至少要在那個樣子下打掉四成，本相時打不穿。' : '真身（' + this.diff.name + '）命 ' + this.bigHp(base) + '。';   // v0.9.10 立極
      this.talk('北方玄武', ['「' + J.scroll + '。要幾成的' + J.shade + '？」', '六成：命 ' + hp(SHADE_K[0]) + '，傷人是真身的六成' + up + '。九成：命 ' + hp(SHADE_K[1]) + '，傷人九成' + up + '。' + (x ? '有黑叉，九成的這一卷還能試 ' + left + ' 回（六成的不限）。' : '') + real,
        this.jingGives(id, swap) ? '斃了哪一種都取得到' + J.scroll + (swap ? '，手上的' + JING[this.player.jingFor].scroll + '就散了' : '') + '；九成的才像真身。' : this.practiceWhy(id)],
        [{ label: '六成的' + J.shade, fn: () => this.startTrial(id, SHADE_K[0], swap) }, { label: '九成的' + J.shade + (x ? '（還剩 ' + left + ' 回）' : ''), off: !!x && !left, fn: () => this.startTrial(id, SHADE_K[1], swap) }, { label: '先不', fn: null }]);
    }
    swapAsk(id) {        // 手上拿著別卷（v0.8.23 使用者定）：玄武問要不要換；換掉的那一卷散了，一卷只取一次，再也取不回來。第一個鈕是不換（Enter 不會誤換）
      const p = this.player, J = JING[id], H = JING[p.jingFor];
      this.talk('北方玄武', ['「你手上還有' + H.scroll + '。一次只拿一卷。」',
        '要換？這一回斃了' + J.shade + '，就換成' + J.scroll + '；手上的' + H.scroll + '散了——一卷只取一次，再也取不回來，' + BOSSES[p.jingFor].zone + '那一隻就只能沒經去打。',
        '不換也行：這一回只是練手，不給經，也不給膽氣。'],
        [{ label: '不換，只練手', fn: () => this.pickShade(id, false) }, { label: '換：斃了' + J.shade + '就換成' + J.scroll, fn: () => this.pickShade(id, true) }, { label: '先不', fn: null }]);
    }
    startTrial(id, k, swap) {   // 試煉：玄武吐出影子（k：六成、九成；swap：手上有別卷、說好了換，v0.8.23）
      const p = this.player, J = JING[id], z = this.turtleZone, E = this.ents, glyph = J.glyph, x = this.missCount(), tk = this.trialK();
      k = k || SHADE_K[0]; const nine = k >= SHADE_K[1], give = this.jingGives(id, swap); swap = give && !!p.jingFor;
      if (x && nine && !this.trialLeft(id)) { this.message('玄武搖頭：「九成的' + J.shade + '試了 ' + this.trialCap(id) + ' 回，不給了。六成的隨你打。」'); return; }   // v0.8.22：有黑叉，九成的一卷最多三回；六成的不限
      const tried = () => { if (x && nine) { p.trialTries = p.trialTries || {}; p.trialTries[id] = (p.trialTries[id] || 0) + 1; } };
      if (J.sea) {   // 修蛇卷（v0.8.16 使用者選甲）：蛇影在玄洲岸邊的海上，開船去打（岸上也打得到）
        const open = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!E.canStand(glyph, x + dx, y + dy, true) || DB[this.world.get(x + dx, y + dy)].fresh) return false; return true; };   // 五乘五都是海（島上的湖不算）
        const ok = (x, y) => Math.hypot(x - z.x, y - z.y) <= z.r + JING_SEA - 6 && U.cheb(x, y, p.x, p.y) >= 4 && !E.at(x, y) && open(x, y);
        const spot = this.nearestTile(p.x, p.y, ok, z.r + JING_SEA);
        if (!spot) { this.message('玄洲岸邊沒有夠寬的水，蛇影游不開。'); return; }
        const max = this.bigHp(DB[glyph].hp * k * tk);
        p.trial = { id, slot: BEADS.indexOf(id), at: U.r4(this.world.time), k, tk, give, swap }; p.trialLockT = 0; tried();
        E.add(glyph, spot[0], spot[1], Object.assign(E.snakeFresh(), { hp: max, max, shade: J.shade, k, tk, den: { x: spot[0], y: spot[1] }, leash: 18 }));
        this.bossSig = null;
        this.toast(J.scroll + '（' + (give ? '' : '練手 · ') + (k < 0.9 ? '六成' : '九成') + (tk > 1 ? '，黑叉 +' + Math.round((tk - 1) * 100) + '%' : '') + '）', '玄武吐一口氣，墨流進海裡，聚成一條' + J.shade + '（' + this.dirName(spot[0] - p.x, spot[1] - p.y) + '岸邊的海上）。開船去打，岸上也打得到；離玄洲太遠（' + (z.r + JING_SEA) + ' 格外）就散了。', 9000); SFX.beast(glyph);
        return;
      }
      if (J.sky) {   // 大風卷（v0.8.25）：風影在玄洲的天上，離你六到十二格現身
        const ok = (x, y) => Math.hypot(x - z.x, y - z.y) <= z.r && U.cheb(x, y, p.x, p.y) >= 6 && U.cheb(x, y, p.x, p.y) <= 12 && E.canStand(glyph, x, y, true) && !E.at(x, y);
        const spot = this.nearestTile(p.x, p.y, ok, 14);
        if (!spot) { this.message('玄洲的天上施展不開。站到島心一點再來。'); return; }
        const max = this.bigHp(DB[glyph].hp * k * tk);
        p.trial = { id, slot: BEADS.indexOf(id), at: U.r4(this.world.time), k, tk, give, swap }; p.trialLockT = 0; tried();
        E.add(glyph, spot[0], spot[1], Object.assign(E.windFresh(), { hp: max, max, shade: J.shade, k, tk, den: { x: z.x, y: z.y }, leash: z.r + 4 }));
        this.bossSig = null;
        this.toast(J.scroll + '（' + (give ? '' : '練手 · ') + (k < 0.9 ? '六成' : '九成') + (tk > 1 ? '，黑叉 +' + Math.round((tk - 1) * 100) + '%' : '') + '）', '玄武吐一口氣，墨捲上天，聚成一團' + J.shade + '（' + this.dirName(spot[0] - p.x, spot[1] - p.y) + '的天上）。牠在天上時只有彈弓與青冥落羽打得到，撲下來那一下才近得了身。' + (give ? '斃了牠，這一卷才算取到' + (swap ? '（手上的' + JING[p.jingFor].scroll + '就散了）' : '') : '這一回只是練手，不給經') + '；走出玄洲就散了。', 9000); SFX.beast(glyph);
        return;
      }
      if (J.gong) {   // 立極卷（v0.9.10 使用者定）：共工影在玄洲的地上，照命分三段，海 → 陸 → 空（海是潛在地裡游）；不照時間換
        const fresh = E.gongFresh('sea'), probe = Object.assign({ type: glyph, den: { x: z.x, y: z.y }, leash: z.r }, fresh);
        let spot = null;
        for (let r = 6; r <= 14 && !spot; r++) for (let i = 0; i < 24 && !spot; i++) {
          const a = i / 24 * Math.PI * 2 + r, x = Math.round(p.x + Math.cos(a) * r), y = Math.round(p.y + Math.sin(a) * r);
          if (Math.hypot(x - z.x, y - z.y) <= z.r - 4 && E.gongFits(probe, x, y, 'sea') && !E.at(x, y) && !(x === p.x && y === p.y)) spot = [x, y];
        }
        if (!spot) { this.message('此地狹窄，施展不開。站到玄洲島心空曠一點的地方再來。'); return; }
        const max = this.bigHp(DB[glyph].hp * k * tk);
        p.trial = { id, slot: BEADS.indexOf(id), at: U.r4(this.world.time), k, tk, give, swap }; p.trialLockT = 0; tried();
        E.add(glyph, spot[0], spot[1], Object.assign(fresh, { hp: max, max, shade: J.shade, k, tk, den: { x: z.x, y: z.y }, leash: z.r, stages: true, stage: 0 }));
        this.bossSig = null;
        this.toast(J.scroll + '（' + (give ? '' : '練手 · ') + (k < 0.9 ? '六成' : '九成') + (tk > 1 ? '，黑叉 +' + Math.round((tk - 1) * 100) + '%' : '') + '）', '玄武吐一口氣，墨滲進地裡——' + J.shade + '潛在' + this.dirName(spot[0] - p.x, spot[1] - p.y) + '的地下（海）。牠分三段：海、陸、空，每打掉三分之一現一回本相、換下一段（八息不出招；這時換對神兵打，一倍半）。海用燭龍焚溟、陸用九閽鳴雷、空用青冥落羽，最順手。' + (give ? '三段都打完，這一卷才算取到' + (swap ? '（手上的' + JING[p.jingFor].scroll + '就散了）' : '') : '這一回只是練手，不給經') + '；走出玄洲就散了。', 10000); SFX.beast(glyph);
        return;
      }
      let spot = null;
      for (let r = 6; r <= 14 && !spot; r++) for (let k = 0; k < 24 && !spot; k++) {
        const a = k / 24 * Math.PI * 2 + r, x = Math.round(p.x + Math.cos(a) * r), y = Math.round(p.y + Math.sin(a) * r);
        if (Math.hypot(x + 1 - z.x, y + 1 - z.y) <= z.r - 4 && E.hogFits({ type: glyph }, x, y)) spot = [x, y];
      }
      if (!spot) { this.message('此地狹窄，施展不開。站到玄洲島心空曠一點的地方再來。'); return; }
      const max = this.bigHp(DB[glyph].hp * k * tk);
      p.trial = { id, slot: BEADS.indexOf(id), at: U.r4(this.world.time), k, tk, give, swap }; p.trialLockT = 0; tried();
      E.add(glyph, spot[0], spot[1], { hp: max, max, shade: J.shade, k, tk, den: { x: z.x, y: z.y }, state: 'chase', chargeCD: 3, quakeCD: 6, eatCD: 10, callCD: 0, moveT: 1.2 });
      this.bossSig = null;
      this.toast(J.scroll + '（' + (give ? '' : '練手 · ') + (k < 0.9 ? '六成' : '九成') + (tk > 1 ? '，黑叉 +' + Math.round((tk - 1) * 100) + '%' : '') + '）', '玄武吐一口氣，墨在地上聚成一頭' + J.shade + '。' + (give ? '斃了牠，這一卷才算取到' + (swap ? '（手上的' + JING[p.jingFor].scroll + '就散了）' : '') : '這一回只是練手，不給經') + '；走出玄洲就散了。', 8000); SFX.beast(glyph);
    }
    shadeEnt() { const t = this.player.trial; return t ? this.ents.list.find(o => o.shade === JING[t.id].shade) || null : null; }
    endTrial() { this.ents.list = this.ents.list.filter(o => !o.shade); this.player.trial = null; this.bossSig = null; }
    trialTick(dt) {      // 試煉中走出玄洲：影子散了，不罰；試煉沒過的鎖命，走進任何地界就不算了（v0.8.10）
      const p = this.player, t = p.trial;
      if (p.trialLockT > 0) { p.trialLockT = Math.max(0, p.trialLockT - (dt || 0)); if (this.inGround()) { p.trialLockT = 0; this.message('走進了地界，玄武替你鎖的命不算了。'); } }
      if (!t || p.dead) return;
      const z = this.turtleZone;
      if (Math.hypot(p.x - z.x, p.y - z.y) > z.r + (JING[t.id].sea ? JING_SEA : JING_EXIT)) { this.endTrial(); this.toast('經未取成', '你走出了玄洲，' + JING[t.id].shade + '散成一灘墨。回來再試，不罰。', 7000); return; }
      if (!this.shadeEnt()) { this.endTrial(); this.message('影子散了。回玄武那裡再取一回。'); }
    }
    shadeDown(e) {       // 斃了影子：這一卷取到了
      const p = this.player, t = p.trial;
      if (e.stages && ((e.stage || 0) < 2 || e.shiftT > 0)) { e.hp = Math.max(1, this.ents.gongStageFloor(e)); return; }   // 立極（v0.9.10）：還沒打到第三段，命壓在這一段的線上，下一刻現本相
      if (!t || e.shade !== JING[t.id].shade) { this.ents.remove(e); this.message(this.beastName(e) + '散成一灘墨。'); return; }   // 叫來的豕影
      const give = t.give !== false && this.jingGives(t.id, t.swap), J = JING[t.id];
      this.bossZero = { name: e.shade, max: e.max || DB[e.type].hp, shade: true, practice: !give, until: performance.now() + ZERO_MS };   // 命條歸零停五秒（v0.8.20；v0.8.21 使用者定五秒）
      this.ents.remove(e); this.endTrial();
      p.shade9 = p.shade9 || {}; if (t.k >= SHADE_K[1]) p.shade9[t.id] = true;
      if (!give) { this.toast(J.shade + '散了', '練手一回（' + (t.k >= SHADE_K[1] ? '九成' : '六成') + '）。' + this.practiceWhy(t.id), 9000); SFX.learn(); this.save(); return; }   // v0.8.22 使用者定：一次只拿一卷、斃了的不給經；練手不給膽氣
      const prev = p.jingFor && p.jingFor !== t.id ? p.jingFor : null; p.scrolls = p.scrolls || [];
      if (prev) { const old = p.scrolls.filter(x => x.id === prev && !x.lost && !x.dust).pop(); if (old) old.lost = this.day(); else p.scrolls.push({ id: prev, slot: BEADS.indexOf(prev), day: this.day(), lost: this.day() }); }   // 換卷（v0.8.23）：手上那一卷散了，記下來，再也取不回
      p.jingFor = t.id; p.scrolls.push({ id: t.id, slot: t.slot, day: this.day(), k: t.k });   // 經卷認這一隻（v0.8.10）
      p.xuanjia = p.xuanjia || {}; const xuanNew = !!RING[t.id] && !p.xuanjia[t.id]; if (xuanNew) p.xuanjia[t.id] = this.day();   // 玄甲多一層（v0.8.34），一隻只給一回
      p.jingCour = p.jingCour || {}; const key = t.id + '@' + t.k, got = p.jingCour[key] ? 0 : this.addCourage(JING_COUR, 'kill'); p.jingCour[key] = true;   // 同一隻、同一種影子，膽氣只給第一回
      this.toast('取得' + J.scroll, '影子散成一灘墨，墨裡浮出一卷經；第' + NTH[t.slot] + '顆珠' + (J.gong ? '點成朱紅（拿著立極卷）。' : '成了紅圈（拿著牠的經，還沒去打）。') + (prev ? '手上的' + JING[prev].scroll + '散了，再也取不回來。' : '') + '一次只拿一卷：拿它斃了' + BOSSES[t.id].zone + '，經化作塵埃。' + (got > 0 ? '膽氣 +' + fmt(this.shown('cour', got)) + '。' : '') + (xuanNew ? '玄武又給你披上一層玄甲（共 ' + this.xuanLayers() + ' 層：震、窒、心、溺、灼各減 ' + Math.round(this.xuanLayers() * XUAN_STEP * 100) + '%）。' : '') + (p.shade9[t.id] ? '' : '<br><b>你斃的是六成的影子，九成的還沒試過——真身比牠強得多，勝算恐怕不大。</b>') + '<br>' + J.lines.join('<br>') + '<br><span class="dim">這一卷記在見聞錄（J）裡。</span>', 18000);
      SFX.learn(); this.renderer.shake = 0.4; this.save();
    }
    trialSave() {        // 影子不取人命（v0.8.10 使用者定）：命留一點，玄武收了影子、鎖命十五息，這一回試煉沒過
      const p = this.player, t = p.trial; p.hp = 1; p.trialLockT = TRIAL_LOCK; p.hurtT = 6; p.poisonT = 0; p.poisonPer = 0; p.poisonBy = null;
      if (t) this.endTrial();
      this.renderer.shake = 0.5; SFX.fail();
      this.toast('試煉未竟', '命只剩一點，玄武收了' + (t ? JING[t.id].shade : '影子') + '，替你鎖住命 ' + TRIAL_LOCK + ' 息（這段時間走進任何地界就不算了）。不要氣餒，再接再厲。', 10000);
    }
    inBossLand(x, y) { const p = this.player; return Object.keys(BOSSES).some(id => { if ((p.bosses || {})[id]) return false; const z = this.bossZone(id); return !!z && Math.hypot(x - z.x, y - z.y) <= BOSSES[id].r; }); }   // (x, y) 在不在還沒斃的大魔王地界裡
    inGround() {         // 站在哪一塊地界裡（玄洲不算）：四方地界照 G.zones 的 r，大魔王的地界照 BOSSES[].r
      const p = this.player;
      for (const z of G.zones(this.seed)) if (z.id !== '玄武' && Math.hypot(p.x - z.x, p.y - z.y) <= z.r) return true;
      for (const id in BOSSES) { const bz = this.bossZone(id); if (Math.hypot(p.x - bz.x, p.y - bz.y) <= BOSSES[id].r) return true; }
      return false;
    }
    placePavilion(force) {   // 惜字亭：出生點附近、照原本的底稿找一格平地（現在也還是平地），四周八格都走得過，不擋路；由近到遠照固定的順序找。force：還願一定要有亭（v0.9.10），找不到就放寬
      const p = this.player, w = this.world; if (p.pavilion && w.get(p.pavilion.x, p.pavilion.y) === '亭') return p.pavilion;
      const at = this.pavilionSpot(); if (at || !force) return at;
      const sp = this.spawn, flat = (x, y) => { const d = DB[w.get(x, y)]; return d && d.walk > 0 && d.kind !== 'water' && d.kind !== 'object' && d.kind !== 'place' && !d.bog && !w.stele(x, y) && !this.ents.at(x, y) && !(x === p.x && y === p.y); };
      for (const strict of [true, false]) for (let r = 1; r <= 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {   // 先找現在是平地、四周走得過的；再不行，只要那一格走得上去
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = sp.x + dx, y = sp.y + dy; if (!flat(x, y) || (strict && !N8.every(([ax, ay]) => { const d = DB[w.get(x + ax, y + ay)]; return d && d.walk > 0 && d.kind !== 'water'; }))) continue;
        w.set(x, y, '亭'); p.pavilion = { x, y }; return p.pavilion;
      }
      return null;
    }
    pavilionSpot() {
      const p = this.player, w = this.world;
      const sp = this.spawn, plain = '草土花';
      const ok = (x, y) => {
        if (plain.indexOf(G.oldTile(x, y, this.seed)) < 0 || plain.indexOf(w.get(x, y)) < 0 || w.stele(x, y) || this.ents.at(x, y) || (x === p.x && y === p.y)) return false;
        for (const [dx, dy] of N8) { const ch = w.get(x + dx, y + dy), d = DB[ch]; if (!(d.walk > 0) || d.kind === 'water' || d.kind === 'object' || d.kind === 'place' || d.bog) return false; }
        return true;
      };
      for (let r = PAVILION_R[0]; r <= PAVILION_R[1]; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = sp.x + dx, y = sp.y + dy; if (ok(x, y)) { w.set(x, y, '亭'); p.pavilion = { x, y }; return p.pavilion; }
      }
      return null;
    }
    wishAt() {           // 惜字亭前按 E：許願（一次）；許過了就說一聲，還願等斃了共工（v0.9.10 起斃了共工就在這裡還願）
      const p = this.player;
      if ((p.bosses || {})['共工'] && !p.redeemed) { this.redeemAsk(); return; }
      if (!p.xuan && !p.redeemed) { this.talk('惜字亭', ['一座小小的磚亭，亭裡有一爐灰。'], [{ label: '好', fn: null }]); return; }
      if (p.wish) {   // 許過願：可以把殘體送進亭裡焚化，九塊換兩塊鎢鋼（v0.8.9）
        const n = this.shardCount();
        const r = p.redeemed, said = r ? (r.late ? '你在第 ' + r.day + ' 日補許了願，當下就還了：' : '你在第 ' + p.wish.day + ' 日許的願，第 ' + r.day + ' 日還了：') + WISH_TEXT + '紙平了。' : '你在第 ' + p.wish.day + ' 日許過願：' + WISH_TEXT;
        this.talk('惜字亭', ['亭裡那爐灰還溫著。' + said, r ? '' : '還願要等紙平了：斃了共工，再回來。', '小魔王留下的殘體，也是寫壞了的字。送進亭裡焚化，九塊（哪一種都行，混著也行）換兩塊鎢鋼。囊裡殘體共 ' + n + ' 塊。'].filter(Boolean),
          [{ label: '焚九塊殘體，換兩塊鎢鋼', off: n < BURN_SHARDS, fn: () => this.burnAsk() }, { label: '寫一個地名（傳送）', fn: () => this.openTele('home') }].concat(r ? [{ label: '再讀一遍結語', fn: () => this.showEnding() }] : [], [{ label: '好', fn: null }])); return; }
      this.talk('惜字亭', ['一座小小的磚亭，亭裡有一爐灰。寫過字的紙不隨便丟，送到這裡焚化，叫敬惜字紙。', '玄武要你在這裡許個願。保自己：你也是墨寫的。保那孩子的話：你一路讀過來的。守信：願是你自己許的。'],
        [{ label: '許願：' + WISH_TEXT, fn: () => this.makeWish() }, { label: '寫一個地名（傳送）', fn: () => this.openTele('home') }, { label: '先不', fn: null }]);
    }
    shardCount() { return SHARD_KINDS.reduce((a, k) => a + this.count(k), 0); }
    burnPlan() {         // 先燒哪幾塊：求教過那隻神獸的殘體先燒（信物用不著了），再燒多的那種
      const p = this.player, used = { '蜃殘體': p.azure, '鑿齒殘體': p.bai, '蠱雕殘體': p.zhu }, order = SHARD_KINDS.slice().sort((a, b) => (used[b] ? 1 : 0) - (used[a] ? 1 : 0) || this.count(b) - this.count(a));
      const plan = {}; let left = BURN_SHARDS; for (const k of order) { const t = Math.min(left, this.count(k)); if (t) { plan[k] = t; left -= t; } }
      return left ? null : plan;
    }
    burnAsk() {          // 焚之前問一聲：寫明燒哪幾塊、各剩幾塊（熬蜃珠、鑄虎符、煉朱羽各要九塊）
      const plan = this.burnPlan(); if (!plan) { this.message('殘體不夠九塊。'); return; }
      const lines = Object.keys(plan).map(k => k + ' ' + plan[k] + ' 塊（燒完剩 ' + (this.count(k) - plan[k]) + '）');
      this.talk('惜字亭', ['要焚：' + lines.join('、') + '。', '熬蜃珠、鑄虎符、煉朱羽各要同一種殘體九塊；焚了就沒了。'], [{ label: '焚', fn: () => this.burnShards() }, { label: '先不', fn: null }]);
    }
    burnShards() {
      const plan = this.burnPlan(); if (!plan) { this.message('殘體不夠九塊。'); return; }
      for (const k in plan) this.removeItem(k, plan[k]);
      const at = this.giveNear('鎢鋼', BURN_TUNG);
      this.fx.push({ type: 'float', x: this.player.x, y: this.player.y, text: '焚', color: G.INK.red, t: 0, dur: 1.2 });
      this.toast('敬惜字紙', '九塊殘體在亭裡化成灰，灰裡剩下兩塊鎢鋼' + (at ? '（囊滿了，用小囊包著擱在' + at.where + '）' : '') + '。', 8000); SFX.fuse(); this.buildBag(); this.save();
    }
    makeWish() {
      const p = this.player; p.wish = { day: this.day(), diff: this.diff.key }; const got = this.addCourage(WISH_COUR, 'other');
      this.toast('許願', WISH_TEXT + '願許下了。' + (got > 0 ? '膽氣 +' + fmt(this.shown('cour', got)) + '。' : '') + '打贏共工，再回到這裡還願。', 10000); SFX.learn(); this.save();
    }
    // ---------- 還願（v0.9.10 使用者定，設計稿〈〇〉6）：斃了共工回惜字亭還願——紙平了，四角有四象壓著；一頁結語、這一局的回顧，按繼續照常玩 ----------
    // 沒許過願的：亭一定立起來（斃共工時、讀舊存檔時），補許即還，結語少「守信」那一段
    redeemAsk() {
      const p = this.player, w = p.wish;
      const tele = { label: '寫一個地名（傳送）', fn: () => this.openTele('home') };   // v0.9.14 自查：還沒還願時亭照樣傳送得了
      if (w) this.talk('惜字亭', ['亭裡那爐灰還溫著。你在第 ' + w.day + ' 日在這裡許過願：' + WISH_TEXT, '共工斃了，紙平了。'], [{ label: '還願', fn: () => this.redeem(false) }, { label: '焚九塊殘體，換兩塊鎢鋼', off: this.shardCount() < BURN_SHARDS, fn: () => this.burnAsk() }, tele, { label: '先不', fn: null }]);
      else this.talk('惜字亭', ['一座小小的磚亭，亭裡有一爐灰。寫過字的紙不隨便丟，送到這裡焚化，叫敬惜字紙。', (p.xuan ? '玄武叫你在這裡許個願，你一直沒來。' : '你沒在這裡許過願。') + '共工已經斃了，紙平了。', '補許一個願，當下就還。'],
        [{ label: '補許即還：' + WISH_TEXT, fn: () => this.redeem(true) }, tele, { label: '先不', fn: null }]);
    }
    redeem(late) {
      const p = this.player, day = this.day(); if (p.redeemed) return;
      if (late) p.wish = { day, diff: this.diff.key, late: true };   // 補許：許了當下就還（不給許願的膽氣）
      p.redeemed = { day, diff: this.diff.key, late: !!late };
      p.feats = p.feats || []; p.feats.push({ id: '還願', text: '還願 · ' + (late ? '補許即還' : '第 ' + p.wish.day + ' 日許、第 ' + day + ' 日還') + ' · ' + this.diff.name, day });
      this.fx.push({ type: 'float', x: p.x, y: p.y - 0.6, text: '願', color: G.INK.red, t: 0, dur: 1.6 }); SFX.learn(); this.renderer.shake = 0.3;
      this.save(); this.showEnding();
    }
    grantKey(day, diff) {      // 下一章的鑰（v0.9.11 使用者定）：斃了共工就給，還願不還願都一樣；不佔囊、死了也不掉（記在身上，不是囊裡的東西）。下一章還沒寫成，現在只記著
      const p = this.player; if (p.key2) return false;
      p.key2 = { day: day || this.day(), diff: diff || this.diff.key }; return true;
    }
    placePillarStele() {   // 天柱下的碑（v0.9.13）：不周山盆地的中心附近，找一格走得上去的陸地立碑；記在 p.gongStele（執行時立的碑不在生成的碑表裡，讀檔照這一筆認）
      const p = this.player, w = this.world; if (p.gongStele && w.get(p.gongStele.x, p.gongStele.y) === '碑') return p.gongStele;
      const z = this.bossZone('共工'); if (!z) return null;
      const flat = (x, y) => { const d = DB[w.get(x, y)]; return d && d.walk > 0 && d.kind !== 'water' && d.kind !== 'object' && d.kind !== 'place' && d.kind !== 'fire' && !d.bog; };
      const ok = (x, y) => flat(x, y) && !w.stele(x, y) && !this.ents.at(x, y) && !(x === p.x && y === p.y) && N8.filter(([dx, dy]) => flat(x + dx, y + dy)).length >= 5;
      const at = this.nearestTile(z.x, z.y, ok, 40); if (!at) return null;
      w.set(at[0], at[1], '碑'); p.gongStele = { x: at[0], y: at[1] }; return p.gongStele;
    }
    readPillarStele() {
      $('read-title').textContent = PILLAR_STELE.title; $('read-text').textContent = PILLAR_STELE.text;
      $('read').querySelector('.panel').classList.add('rubbing'); $('read').classList.remove('hidden'); this.keys.clear();
    }
    keyText() { return '不周山天柱折斷的裂口，垂下一截斷了的<b>' + KEY2.name + '</b>，往紙的背面去——' + KEY2.line + '這是通往下一章的鑰：不佔囊，死了也不會掉。下一章還沒寫成。' + (this.player.gongStele ? '裂口旁立著一塊碑。' : ''); }
    endingText() {       // 結語（v0.9.10，我先擬，使用者再改）：補許即還的沒有「守信」那一段；全程困難、誰也不靠的多一句；最後一句照設計稿
      const p = this.player, r = p.redeemed || {}, w = p.wish || {}, out = [];
      out.push('你把手伸進亭裡那爐灰。灰是溫的。');
      out.push('西北不再翹，東南不再沉。共工倒在不周山的盆地裡；水停在該停的地方，墨乾了，字一個一個立住了。');
      out.push('紙的四角各壓著一塊鎮紙：東邊青龍，西邊白虎，南邊朱雀，北邊玄武。〈覽冥訓〉說：「斷鼇足以立四極。」這張紙上，立四極的是你。');
      out.push('你也是墨寫的。紙要是洗白了，先化掉的就是你這個「人」。現在你還站在這裡，影子落在紙上，是黑的。');
      out.push('那孩子的話也都還在：塔上被硃筆圈起來的「望」，錯字砌成的磚，還有燈塔下那個寫在你心裡的名字。你一路讀過來，一個字也沒有化。');
      if (!r.late) out.push('願是你第 ' + w.day + ' 日在這裡許的。那時你還不知道共工有多大。說了，就做到了。');
      out.push('修蛇、封豨、大風都不在了。蜃照舊在海上吐霧，鑿齒照舊守著西邊的島，蠱雕照舊在南邊的天上哭——紙平了，紙上的東西照舊活著。');
      out.push('天黑了照樣要點燈，餓了照樣要吃。一切都還在，又好像一切都已經過去。');
      if (p.gold) out.push('從頭到尾，你誰也沒靠。你身上的「人」是金色的，像先生拿泥金又描了一遍。');
      out.push('北方的雪停了，牠很久沒有動。');
      return out;
    }
    recapHtml() {        // 這一局的回顧：島、難度、日子、膽氣、死、斃敵；大魔王照斃的先後；經卷、玄甲、求教；願
      const p = this.player, bs = p.bosses || {}, r = p.redeemed || {}, row = (k, v) => '<tr><th>' + k + '</th><td>' + v + '</td></tr>';
      const ids = Object.keys(bs).sort((a, b) => (bs[a].day || 0) - (bs[b].day || 0));
      const boss = ids.map(id => { const b = bs[id], B = BOSSES[id]; return '<li><b>' + (B ? B.feat : id) + '</b>　第 ' + b.day + ' 日 · ' + (DIFF[b.diff] || this.diff).name + ' · ' + (b.solo ? '獨力' : '有神獸護駕') + (id === '共工' && b.k ? ' · 共工 +' + Math.round((b.k - 1) * 100) + '%' : b.buff ? ' · +' + Math.round(b.buff * (b.step || 0.1) * 100) + '%' : '') + (b.jing === false ? ' · 無經' : ' · 拿著經') + '</li>'; }).join('');
      const learned = [['azure', '青龍'], ['bai', '白虎'], ['zhu', '朱雀']].filter(([k]) => p[k]).map(([, n]) => n);
      const taken = (p.scrolls || []).filter(x => !x.lost).length;
      return '<table class="recap">' + row('島', '#' + this.seed + ' · ' + this.diff.name + (p.hardOnly ? '（從頭到尾都是困難）' : ''))
        + row('日子', '第 ' + this.day() + ' 日 · 睡過 ' + (this.stats.nights || 0) + ' 夜') + row('膽氣', this.test ? '∞' : '第 ' + this.level() + ' 重') + row('死', p.deaths ? p.deaths + ' 次' : '一次也沒死') + row('斃敵', (this.stats.kills || 0) + ' 隻')
        + row('經卷', (taken ? '取過 ' + taken + ' 卷' : '一卷也沒取') + (this.missCount() ? '，黑叉 ' + this.missCount() + ' 個' : '') + (this.xuanLayers() ? '；玄甲 ' + this.xuanLayers() + ' 層' : ''))
        + row('求教', learned.length ? learned.join('、') : '誰也沒求教') + row('願', r.late ? '第 ' + r.day + ' 日補許即還' : '第 ' + (p.wish || {}).day + ' 日許、第 ' + r.day + ' 日還') + (p.key2 ? row('下一章', '第 ' + p.key2.day + ' 日得一' + KEY2.unit + KEY2.name + '（通往下一章的鑰，下一章還沒寫成）') : '')
        + '</table><ul class="recap-boss">' + boss + '</ul>' + (p.gold ? '<p class="gold"><b>服了？服了！</b>——從頭到尾都在困難裡，誰也不靠。</p>' : '');
    }
    showEnding() {
      const p = this.player; if (!p.redeemed) return;
      this.endingOpen = true; this.paused = true; this.keys.clear(); this.action = null; if (this.stopWalk) this.stopWalk();
      $('ending-text').innerHTML = this.endingText().map(x => '<p>' + x + '</p>').join(''); $('ending-recap').innerHTML = this.recapHtml();
      $('ending').classList.remove('hidden'); $('ending').scrollTop = 0; const pn = $('ending').querySelector('.panel'); if (pn) pn.scrollTop = 0;
    }
    closeEnding() {
      if (!this.endingOpen) return; this.endingOpen = false; $('ending').classList.add('hidden'); this.paused = false;
      if (!this.player.warned.redeemed) { this.player.warned.redeemed = true; this.toast('照常過日子', '大魔王都沒了，蜃、鑿齒、蠱雕、畢方照舊在。大地圖的四邊有四象壓著；結語記在見聞錄（J）的「願」裡，也可以回惜字亭再讀一遍。', 10000); }
    }
    toothLand() {        // 人在不在西邊的外島上（v0.8.5）：鑿齒只在這裡走出來；四方地界與本島不算
      const p = this.player, w = this.world; if (p.sailing || p.swimming || DB[w.get(p.x, p.y)].kind === 'water' || G.zoneAt(p.x, p.y, this.seed)) return false;
      const isl = G.isleOf(p.x, p.y, this.seed); return !!isl && isl.cx < -TOOTH_WEST;
    }
    phoenixCalm() { const p = this.player; return !!p.zhu || this.has('朱羽'); }   // 朱雀肯不肯讓人近（v0.8.6）
    phoenixShy(e) { const now = this.world.time; if (now - (e.shyAt || -99) < 12) return; e.shyAt = now; this.message('朱雀撲著翅膀飛開了——沒帶朱羽，牠不讓人近。'); }
    harpySky() {         // 人在不在南邊（v0.8.6）：本島以南 HARPY_SOUTH 格外（v0.9.5 前三百、後一百九十），海上或外島上；四方地界裡不算
      const p = this.player; return p.y > HARPY_SOUTH && !G.zoneAt(p.x, p.y, this.seed);
    }
    harpyRose(m) { const p = this.player, dx = m.x - p.x, dy = m.y - p.y; this.toast('蠱雕！', this.dirName(dx, dy) + '約 ' + Math.round(Math.hypot(dx, dy)) + ' 步，天上有嬰兒在哭——是蠱雕。牠在高處盤旋時只有彈弓與青冥落羽打得到；等牠撲下來貼著你，再出手。'); SFX.beast('雕'); }
    harpyCry(e) {        // 蠱雕的啼（v0.8.6）：心——愜意掉（朱雀的氣順少四分之一），懼一息多出不了手
      const p = this.player; if (p.dead) return;
      const d = this.hurt(HARPY_CRY[this.diff.key] || HARPY_CRY.normal, '心', { name: '蠱雕' });
      p.fearT = Math.max(p.fearT || 0, HARPY_FEAR[this.diff.key] || HARPY_FEAR.normal); SFX.beast('雕');
      this.fx.push({ type: 'float', x: e.x, y: e.y, text: '哇', color: G.INK.red, t: 0, dur: 1.1 });
      this.message('蠱雕一聲啼，像嬰兒在哭——心裡一慌（心）：愜意 −' + this.shown('san', d) + '，懼得一時出不了手。');
    }
    fireIsle() {         // 人在不在火島上（v0.8.25）：畢方只在這裡跳出來；四方地界與本島不算
      const p = this.player, w = this.world; if (p.sailing || p.swimming || DB[w.get(p.x, p.y)].kind === 'water' || G.zoneAt(p.x, p.y, this.seed)) return false;
      const isl = G.isleOf(p.x, p.y, this.seed); return !!isl && isl.kind === '火';
    }
    birdRose(m) { const p = this.player, dx = m.x - p.x, dy = m.y - p.y; this.toast('畢方！', this.dirName(dx, dy) + '約 ' + Math.round(Math.hypot(dx, dy)) + ' 步，一隻腳跳著過來——是畢方。牠落腳的地方就起火（訛火），別踩；隔一陣一聲鳴，你身邊冒出的圈，一息後也燒起來。'); SFX.beast('畢'); }
    falseFire(x, y) {    // 訛火（v0.8.25）：這一格燒 FIRE_T 息；水上燒不起來
      const d = DB[this.world.get(x, y)]; if (!d || d.kind === 'water') return;
      this.fires = this.fires || []; const f = this.fires.find(o => o.x === x && o.y === y); if (f) f.t = FIRE_T; else this.fires.push({ x, y, t: FIRE_T });
    }
    birdCry(e) {         // 畢方一聲鳴：你腳下與身邊共三處先冒圈，一息後燒起來
      const p = this.player; if (p.dead || p.sailing || p.swimming) return;
      const cells = [[p.x, p.y]];
      for (let k = 0; k < 24 && cells.length < FIRE_RAIN_N; k++) { const x = p.x + Math.round(Math.random() * 2 - 1), y = p.y + Math.round(Math.random() * 2 - 1); if (!cells.some(([a, b]) => a === x && b === y) && DB[this.world.get(x, y)].kind !== 'water') cells.push([x, y]); }
      this.fireMarks = (this.fireMarks || []).concat(cells.map(([x, y]) => ({ x, y, t: FIRE_MARK_T })));
      SFX.beast('畢'); this.fx.push({ type: 'float', x: e.x, y: e.y, text: '鳴', color: G.INK.red, t: 0, dur: 1.1 });
      this.message('畢方一聲鳴——你身邊冒出 ' + cells.length + ' 個圈，一息後燒起來（訛火），快走開！');
    }
    fireTick(dt) {       // 訛火：圈到時燒起來；燒著的格子踩上去灼傷（不打折），FIRE_T 息後熄
      const p = this.player;
      if (this.fireMarks && this.fireMarks.length) { for (const m of this.fireMarks) m.t -= dt; for (const m of this.fireMarks) if (m.t <= 0) this.falseFire(m.x, m.y); this.fireMarks = this.fireMarks.filter(m => m.t > 0); }
      if (!this.fires || !this.fires.length) return;
      for (const f of this.fires) f.t -= dt; this.fires = this.fires.filter(f => f.t > 0);
      if (p.sailing || p.swimming || p.dead || !this.fires.some(f => f.x === p.x && f.y === p.y)) return;
      this.hurt(FIRE_BURN * dt, '灼', { name: '訛火' }); p.hurtT = Math.max(p.hurtT, 1);
      if (!p.warned.falseFire) { p.warned.falseFire = true; this.toast('訛火', '畢方落腳的地方燒起來了，站在上面灼傷，每息 −' + FIRE_BURN + '。走開就好，' + FIRE_T + ' 息後自己熄。'); }
    }
    toothRose(m) { const p = this.player, dx = m.x - p.x, dy = m.y - p.y; this.toast('鑿齒！', this.dirName(dx, dy) + '約 ' + Math.round(Math.hypot(dx, dy)) + ' 步，有鑿石頭的聲音——是鑿齒。牠面朝哪邊盾就在哪邊，正面打只有一成傷；牠轉身慢，繞到身側背後再打。'); SFX.beast('齒'); }
    tigerRoar(e) {       // 白虎的嘯（v0.8.5）：沒帶虎符、還沒求教的人進了六格，一聲嘯，地跟著抖——震（站在台、棧、船上不受）
      const p = this.player; if (p.bai || p.dead || this.has('虎符')) return false;
      SFX.tiger(); this.renderer.shake = 0.6; this.fx.push({ type: 'write', x: e.x, y: e.y, ch: '嘯', color: G.INK.red, t: 0, dur: 0.8 });
      const d = this.hurt(TIGER_ROAR[this.diff.key] || TIGER_ROAR.normal, '震', { name: '白虎', big: true });
      if (d > 0) p.hurtT = Math.max(p.hurtT, 3);
      this.message('白虎一聲嘯，地跟著抖' + (d > 0 ? '（震）！命 −' + this.shown('hurt', d) + '。' : '，可你站在' + (p.sailing ? '船' : this.world.get(p.x, p.y)) + '上，震不上來。') + '「拿虎符來。」');
      return true;
    }
    seaMonsterRose(m) { const p = this.player, dx = m.x - p.x, dy = m.y - p.y; this.toast('蜃！', this.dirName(dx, dy) + '約 ' + Math.round(Math.hypot(dx, dy)) + ' 步，深海裡浮上一頭蜃。牠會撞船、吐霧；船頭有獸首骨就不敢近。'); SFX.tiger(); }
    ramShip(e) {
      const p = this.player, s = p.ship; if (!p.sailing || !s) return;
      const dmg = U.r4(DB[e.type].ram * this.diff.taken);
      this.shipLoss(s, dmg); this.renderer.shake = 0.6; SFX.tiger();
      this.fx.push({ type: 'float', x: p.x, y: p.y, text: '船 −' + this.shown('ship', dmg), color: G.INK.red, t: 0, dur: 0.9 });
      if (s.hp <= 0) { this.wreck(); return; }
      this.message('蜃撞船！' + s.kind + '的命 ' + Math.round(s.hp) + '/' + this.shipMax(s) + '。');
    }
    wreck() {
      const p = this.player; p.sailing = false; p.ship = null; p.swimming = true; p.swimT = SWIM_TIME; this.action = null;
      const shore = this.nearestShore();
      this.toast('船毀了！', SWIM_TIME + ' 息內游到岸上，否則溺死' + (this.player.azure ? '（青龍教的水性：倒數慢四分之一）' : '') + '。' + (this.has('木板') ? '囊裡的木板每塊多撐 ' + PLANK_SWIM + ' 息（' + this.count('木板') + ' 塊）。' : '') + (shore ? '最近的岸在' + shore.dir + '約 ' + shore.n + ' 步。' : '') + (this.player.azure ? '有青龍教的水性，游泳的苦頭減半：飽、愜意、力掉得快一半，武器傷害少八分之一。' : '游泳時飽、愜意、力掉得快一倍，武器傷害少四分之一。'), 9000); SFX.fail();
    }
    nearestShore() {
      const p = this.player, w = this.world, t = this.nearestTile(p.x, p.y, (x, y) => { const d = w.info(x, y); return d.walk > 0 && d.kind !== 'water'; }, 60);
      return t ? { x: t[0], y: t[1], dir: this.dirName(t[0] - p.x, t[1] - p.y), n: Math.max(Math.abs(t[0] - p.x), Math.abs(t[1] - p.y)) } : null;
    }

    // ---------- 霧障 ----------
    dirName(dx, dy) {
      const a = Math.atan2(dy, dx) * 180 / Math.PI, names = ['東', '東南', '南', '西南', '西', '西北', '北', '東北'];
      return names[((Math.round(a / 45) % 8) + 8) % 8] + '方';
    }
    checkFog() {          // 走進一片霧障：問要不要用扇子；同一片霧裡走動不再問，出去再進來才問
      const p = this.player; if (p.dead || p.knock > 0 || this.fogAsk) return;
      const f = this.world.fogAt(p.x, p.y);
      if (!f) { p.inFog = 0; return; }
      if (p.inFog === f.id) return;
      this.askFog(f);
    }
    askFog(f) {
      const n = this.count('扇');
      this.fogAsk = f.id; this.paused = true; this.stopWalk(); this.keys.clear(); this.action = null;
      $('fogask-text').innerHTML = '一片霧障，' + f.cells.size + ' 格。不吹散就硬闖，命、飽、暖、力、愜意各掉當前的一成（不會致命）。' + (n ? '<br>囊中有扇子 ' + n + ' 把。' : '<br>你身上沒有扇子（草四木一可紮一把）。');
      $('fogask-use').classList.toggle('hidden', !n); $('fogask-use').textContent = '用一把扇子吹散（' + n + '）';
      $('fogask-no').textContent = n ? '不用，硬闖' : '穿霧而過';
      $('fogask').classList.remove('hidden');
    }
    closeFog() { $('fogask').classList.add('hidden'); this.fogAsk = null; this.paused = false; }
    // ---------- 拆人造的東西先問一聲（磚、門、床、燈、灶、鼎、櫃、棧、魚梁、漁網、稻草人） ----------
    askTake(t, ch, onYes, text, labels) {   // text：自己寫的說明（收船，v0.8.19）；labels：[標題, 是, 否]（v0.8.21 再放一艘船）
      const w = this.world, k = U.key(t.x, t.y);
      const why = { '櫃': () => { const n = (w.chests.get(k) || []).length; return n ? '裡面 ' + n + ' 樣東西會跟著櫃一起回到囊裡。' : '櫃是空的。'; }, '偶': () => '拆下重放要重計日數。', '燈': () => '夜裡就少一盞光，魄也近得來。', '床': () => '沒有床，夜裡就睡不成。', '門': () => '磚圈開了口，獸就進得來。', '磚': () => '磚圈開了口，獸就進得來。', '窗': () => '窗拆了就是個缺口，獸進得來。', '灶': () => { const n = (w.shelves.get(k) || []).length; return '灶火會熄，添過的柴不退。' + (n ? '柴架上 ' + n + ' 格柴跟著灶回到囊裡，重放還在。' : ''); }, '鼎': () => { const n = (w.shelves.get(k) || []).length; return '鼎下的火會熄，添過的柴不退。' + (n ? '柴架上 ' + n + ' 格柴跟著鼎回到囊裡，重放還在。' : ''); }, '棧': () => '棧拆了，這段水、灘或沼就過不去。', '漁': () => '魚梁拆了，魚就不來了。' };
      const name = DB[ch] && DB[ch].net ? (DB[ch].net === 1 ? '漁網' : DB[ch].net === 2 ? '中漁網' : '大漁網') : ch;
      this.takeAsk = { x: t.x, y: t.y, ch, onYes }; this.paused = true; this.keys.clear(); this.action = null;
      const ship = ch === '舟', lb = labels || (ship ? ['收船？', '收回', '不收'] : ['拆下？', '拆下', '不拆']); document.querySelector('#takeask h2').textContent = lb[0]; $('takeask-yes').textContent = lb[1]; $('takeask-no').textContent = lb[2];
      if (text) { $('takeask-text').innerHTML = text; $('takeask').classList.remove('hidden'); return; }
      $('takeask-text').innerHTML = '面前是自己放的「<b>' + name + '</b>」。' + (why[ch] ? why[ch]() : (DB[ch] && DB[ch].net ? '空網收回來就是一張網。' : '拆下來會回到囊裡。')) + '<br>真的拆？';
      $('takeask').classList.remove('hidden');
    }
    closeTake() { $('takeask').classList.add('hidden'); this.takeAsk = null; this.paused = false; }
    takeYes() { const a = this.takeAsk; if (!a) return; this.closeTake(); a.onYes(); }
    takeNo() { if (!this.takeAsk) return; this.closeTake(); this.message('留著。'); }
    confirmed(fn) { this.takeOk = true; try { fn(); } finally { this.takeOk = false; } }
    // ---------- 灶：面向灶按 F 開界面，在界面裡添柴、烤、燒、煉；世界照常走，火照常燒 ----------
    openStove(t) { this.stoveAt = U.key(t.x, t.y); $('stove').classList.remove('hidden'); this.keys.clear(); this.action = null; this.stoveSig = ''; this.buildStove(); }
    closeStove() { $('stove').classList.add('hidden'); this.stoveAt = null; }
    stovePos() { const [x, y] = U.unkey(this.stoveAt); return { x, y }; }
    fuelOf(name) { const it = ITEMS[name]; if (it && it.kind === 'wear' && !it.iron && !it.light) return CLOTH_FUEL; return FUEL[name] || 0; }   // 一件燒幾息：照 FUEL 表；舊布衣一件 CLOTH_FUEL 息
    // 舊鐵製品熔回鐵：鐵甲盔靴回配方裡鐵的一半（至少一塊）、鋼具一塊；鎢鋼件同理熔回鎢鋼。石具與神兵不熔
    meltYield(name) {
      const it = ITEMS[name]; if (!it) return null;
      if (it.kind === 'wear' && it.iron) { const m = it.tung ? '鎢鋼' : '鐵', r = G.RECIPES.find(x => x.out === name); return { out: m, n: r && r.need[m] ? Math.max(1, Math.floor(r.need[m] / 2)) : 1 }; }
      if (it.kind === 'tool' && it.dur) { if (it.tung) return { out: '鎢鋼', n: 1 }; if (name.charAt(0) === '鋼') return { out: '鐵', n: 1 }; }
      return null;
    }
    meltables() {   // 囊裡與具欄裡能熔的，各記在哪
      const list = []; this.player.bag.forEach((s, i) => { if (this.meltYield(s.n)) list.push({ n: s.n, from: 'bag', i, s }); }); this.player.tools.forEach((s, i) => { if (this.meltYield(s.n)) list.push({ n: s.n, from: 'tools', i, s }); }); return list;
    }
    stoveMelt(name) {
      if (!this.stoveAt) return false;
      const t = this.stovePos(), w = this.world, y = this.meltYield(name), p = this.player; if (!y) return false;
      if (!w.stoveLit(t.x, t.y)) { this.message('灶是冷的，先添些柴。'); SFX.fail(); return false; }
      const m = this.meltables().find(x => x.n === name); if (!m) return false;
      if (!this.canAdd(y.out, y.n) && m.from !== 'bag') { this.message('囊滿了，熔出來的' + y.out + '放不下。先騰一格。'); SFX.fail(); return false; }   // 具欄裡的熔了不騰囊格
      if (m.from === 'bag') { p.bag.splice(m.i, 1); if (p.sel >= p.bag.length) p.sel = Math.max(0, p.bag.length - 1); } else { p.tools.splice(m.i, 1); if (p.tool >= p.tools.length) p.tool = p.tools.length - 1; }
      this.addItem(y.out, y.n); this.barSig = ''; this.message('熔了「' + name + '」，得' + y.out + ' ×' + y.n + '。'); SFX.fuse();
      this.fx.push({ type: 'float', x: t.x, y: t.y, text: y.out, color: G.INK.red, t: 0, dur: 1 });
      this.buildBag(); this.buildStove(); return true;
    }
    stoveFuel(name) {
      if (!this.stoveAt) return false;
      const t = this.stovePos(), w = this.world, sec = this.fuelOf(name);
      if (!sec || this.count(name) < 1) return false;
      if (!this.fuelFits(t, sec)) return false;
      w.addFuel(t.x, t.y, sec); this.removeItem(name, 1); this.message((name === '煤' || name === '精煤' ? '添煤' : '添柴') + '。灶火還能燒 ' + Math.round(w.stoveFuel(t.x, t.y)) + ' 息。'); SFX.write(); this.buildBag(); this.buildStove(); return true;
    }
    fuelFits(t, sec) {   // 添了會超過上限 999 息就不添，免得白燒
      const room = this.world.stoveRoom(t.x, t.y); if (sec <= room) return true;
      this.message('火還能燒 ' + Math.round(this.world.stoveFuel(t.x, t.y)) + ' 息，再添這個（+' + sec + '）就過了上限 ' + this.world.stoveCap + ' 息，等燒一會兒再添。'); SFX.fail(); return false;
    }
    // 柴架（v0.5.1）：灶裡四格，每格一種燃料、最多一疊；「存」把囊裡那種燃料搬上去，點柴架上的格子就燒一個。v0.8.15 鼎也有（使用者定），灶鼎共用 shelfStore()／shelfBurn()
    shelfable(name) { return !!FUEL[name]; }
    stoveStore(name) { return this.stoveAt ? this.shelfStore(this.stovePos(), name) : false; }
    stoveBurnShelf(i) { return this.stoveAt ? this.shelfBurn(this.stovePos(), i) : false; }
    shelfStore(t, name) {
      if (!this.shelfable(name)) return false;
      const shelf = this.world.shelf(t.x, t.y); let left = this.count(name), put = 0;
      for (const s of shelf) if (s.n === name && left > 0) { const k = Math.min(left, STACK - s.c); s.c += k; left -= k; put += k; }
      while (left > 0 && shelf.length < this.world.shelfSlots) { const k = Math.min(left, STACK); shelf.push({ n: name, c: k }); left -= k; put += k; }
      if (!put) { this.message('柴架四格都滿了。'); SFX.fail(); return false; }
      this.removeItem(name, put); this.message('「' + name + '」×' + put + ' 擺上柴架' + (left ? '，還有 ' + num(left) + ' 個放不下' : '') + '。點柴架上的格子就燒一個。'); SFX.write(); this.buildBag(); this.rebuildFire(); return true;
    }
    shelfBurn(t, i) {
      const w = this.world, shelf = w.shelf(t.x, t.y), s = shelf[i]; if (!s) return false;
      const sec = this.fuelOf(s.n); if (!this.fuelFits(t, sec)) return false;
      w.addFuel(t.x, t.y, sec); s.c--; if (s.c <= 0) shelf.splice(i, 1);
      this.message('從柴架上添了「' + s.n + '」。' + (w.get(t.x, t.y) === '鼎' ? '鼎下的火' : '灶火') + '還能燒 ' + Math.round(w.stoveFuel(t.x, t.y)) + ' 息。'); SFX.write(); this.rebuildFire(); return true;
    }
    rebuildFire() { if (this.stoveAt) this.buildStove(); if (this.dingAt) this.buildDing(); }
    shelfRows(t, shelfId, fuelId) {   // 柴架四格與囊裡能燒的（灶、鼎的界面共用）
      const w = this.world, shelf = w.shelf(t.x, t.y); let html = '';
      for (let i = 0; i < w.shelfSlots; i++) { const s = shelf[i]; html += s ? '<button class="shelfslot" data-shelf="' + i + '"><span class="ch">' + s.n + '</span> ×' + s.c + ' <small>燒一個 +' + this.fuelOf(s.n) + ' 息</small></button>' : '<span class="shelfslot empty">空</span>'; }
      $(shelfId).innerHTML = html;
      const fuels = [];
      for (const s of this.player.bag) { const sec = this.fuelOf(s.n); if (sec && !fuels.some(f => f.n === s.n)) fuels.push({ n: s.n, c: this.count(s.n), sec }); }
      $(fuelId).innerHTML = fuels.length ? fuels.map(f => '<span class="fuelpair"><button class="ghost" data-fuel="' + f.n + '"><span class="ch">' + f.n + '</span> ×' + num(f.c) + ' <small>+' + f.sec + ' 息</small></button>' + (this.shelfable(f.n) ? '<button class="ghost small" data-store="' + f.n + '" title="整疊擺上柴架">存</button>' : '') + '</span>').join('') : '<span class="dim">囊裡沒有能燒的東西（木、煤、精煤……）。</span>';
    }
    stoveCook(name) {
      if (!this.stoveAt) return false;
      const t = this.stovePos(), w = this.world, ck = G.COOK[name]; if (!ck) return false;
      const need = ck.n || 1;
      if (!w.stoveLit(t.x, t.y)) { this.message('灶是冷的，先添些柴。'); SFX.fail(); return false; }
      if (this.count(name) < need) { this.message('要 ' + need + ' 個' + name + '才夠。'); SFX.fail(); return false; }
      for (const m in ck.extra || {}) if (this.count(m) < ck.extra[m]) { this.message('還要 ' + m + ' ×' + ck.extra[m] + '。'); SFX.fail(); return false; }
      const snap = JSON.stringify(this.player.bag), sel0 = this.player.sel;   // 先拿掉材料，看烤好的放不放得下；放不下就原樣退回（v0.5.1 前囊滿時烤好的會不見）
      this.removeItem(name, need); for (const m in ck.extra || {}) this.removeItem(m, ck.extra[m]);
      if (!this.canAdd(ck.out, ck.k || 1)) { this.player.bag = JSON.parse(snap); this.player.sel = sel0; this.barSig = ''; this.message('囊滿了，' + this.stoveVerb(ck) + '好的「' + ck.out + '」放不下。先騰一格。'); SFX.fail(); return false; }
      this.addItem(ck.out, ck.k || 1);
      this.message((ck.verb || (ck.out === '玻璃瓶' ? '燒成了' : ck.out === '淡水瓶' ? '蒸餾成了' : '烤好了')) + '：' + ck.out + (ck.k > 1 ? ' ×' + ck.k : '')); SFX.fuse();
      this.fx.push({ type: 'float', x: t.x, y: t.y, text: ck.out, color: G.INK.red, t: 0, dur: 1 });
      this.buildBag(); this.buildStove(); return true;
    }
    stovePot(out) {   // 釜甑（v0.9.18）：灶火旺、帶著釜（蒸的還要甑），兩份穀加一瓶淡水成兩份，空瓶退回
      if (!this.stoveAt) return false;
      const t = this.stovePos(), w = this.world, r = G.POT[out]; if (!r) return false;
      if (!w.stoveLit(t.x, t.y)) { this.message('灶是冷的，先添些柴。'); SFX.fail(); return false; }
      if (!this.has('釜') || (r.vessel === '甑' && !this.has('甑'))) { this.message(r.vessel === '甑' ? '蒸要釜上架甑：釜甑都要帶著。' : '煮要帶著釜。'); SFX.fail(); return false; }
      for (const m in r.need) if (this.count(m) < r.need[m]) { this.message('還要 ' + m + ' ×' + r.need[m] + '。'); SFX.fail(); return false; }
      const snap = JSON.stringify(this.player.bag), sel0 = this.player.sel;
      let q = '';   // 時令（v0.9.19）：用的穀都是新穀，菜就是新的；有一顆是陳穀，菜就是陳的
      for (const m in r.need) { if (this.aged(m)) { const ages = this.takeAged(m, r.need[m]).map(d => this.day() - d); q = ages.some(a => a >= GRAIN_OLD) ? 'old' : ages.every(a => a <= GRAIN_NEW) ? (q === 'old' ? 'old' : 'new') : q; } else this.removeItem(m, r.need[m]); }
      if (this.test || !Object.values(G.MEALS).some(m => m.dish === out)) q = '';   // 不是一頓的（豉、黍酒）不分新陳
      if (!this.canAdd(out, r.k)) { this.player.bag = JSON.parse(snap); this.player.sel = sel0; this.barSig = ''; this.message('囊滿了，' + r.verb + '好的「' + out + '」放不下。先騰一格。'); SFX.fail(); return false; }
      this.addItem(out, r.k, q ? { q } : undefined); const nb = r.keep ? 0 : (r.need['淡水瓶'] || 0) + (r.need['海水瓶'] || 0), at = nb ? this.giveNear('玻璃瓶', nb) : null;
      this.message(r.verb + '好了：' + out + ' ×' + r.k + (q === 'new' ? '（新穀做的，這一頓少三成）' : q === 'old' ? '（陳穀做的，這一頓只少一成五）' : '') + (nb ? '，空瓶退回' + (at ? '（囊滿，擱在' + at.where + '）' : '') : '') + '。'); SFX.fuse();
      this.fx.push({ type: 'float', x: t.x, y: t.y, text: out, color: G.INK.red, t: 0, dur: 1 });
      this.buildBag(); this.buildStove(); return true;
    }
    potHtml(lit) {   // 灶的界面裡「釜甑」那一欄：帶著釜才有
      if (!this.has('釜')) return '';
      const zeng = this.has('甑');
      return '<div class="potrow"><b>釜甑</b>' + (zeng ? '' : ' <small class="dim">（只帶了釜：煮得了粥羹；蒸飯糕餅還要甑）</small>') + '</div>' + Object.keys(G.POT).map(out => {
        const r = G.POT[out], ok = r.vessel === '甑' ? zeng : true, ms = Object.keys(r.need), can = lit && ok && ms.every(m => this.count(m) >= r.need[m]);
        return '<button data-pot="' + out + '"' + (can ? '' : ' disabled') + '><span class="ch">' + out + '</span> <small>' + r.verb + '：' + ms.map(m => '<span' + (this.count(m) >= r.need[m] ? '' : ' class="lack"') + '>' + m + ' ' + num(this.count(m)) + '/' + r.need[m] + '</span>').join('、') + ' → ×' + r.k + (r.vessel === '甑' && !zeng ? '（要甑）' : '') + (G.MEALS[(ITEMS[out].food || {}).meal] ? '；' + G.MEALS[ITEMS[out].food.meal].text : '') + '</small></button>';
      }).join('');
    }
    stoveVerb(ck) { return ck.verb === '煉成了' ? '煉' : ck.out === '玻璃瓶' ? '燒' : ck.out === '淡水瓶' ? '蒸餾' : '烤'; }
    buildStove() {
      if (!this.stoveAt) return;
      const t = this.stovePos(), w = this.world, lit = w.stoveLit(t.x, t.y);
      $('stove-fire').innerHTML = (lit ? '<i class="fire">火旺，還能燒 ' + Math.round(w.stoveFuel(t.x, t.y)) + ' 息</i>' : '<i>灶是冷的，先添柴</i>') + ' <small class="dim">（最多存 ' + w.stoveCap + ' 息）</small>';
      this.shelfRows(t, 'stove-shelf', 'stove-fuel');
      const cooks = [];
      for (const n in G.COOK) { const c = this.count(n); if (c > 0) cooks.push({ n, c, ck: G.COOK[n] }); }
      const needText = (n, ck) => n + (ck.n > 1 ? ' ×' + ck.n : '') + Object.keys(ck.extra || {}).map(m => ' + ' + m + ' ×' + ck.extra[m]).join('');
      const melts = []; for (const m of this.meltables()) if (!melts.some(x => x.n === m.n)) melts.push({ n: m.n, c: this.meltables().filter(x => x.n === m.n).length, y: this.meltYield(m.n) });
      const cookHtml = cooks.map(({ n, c, ck }) => {
        const can = lit && c >= (ck.n || 1) && Object.keys(ck.extra || {}).every(m => this.count(m) >= ck.extra[m]);
        return '<button data-cook="' + n + '"' + (can ? '' : ' disabled') + '><span class="ch">' + n + '</span> ×' + num(c) + ' <small>' + this.stoveVerb(ck) + '：' + needText(n, ck) + ' → ' + ck.out + (ck.k > 1 ? ' ×' + ck.k : '') + '</small></button>';
      }).join('');
      const meltHtml = melts.map(({ n, c, y }) => '<button data-melt="' + n + '"' + (lit ? '' : ' disabled') + '><span class="ch">' + n + '</span> ×' + c + ' <small>熔：' + n + ' → ' + y.out + ' ×' + y.n + '</small></button>').join('');   // 舊鐵製品熔回鐵
      const potHtml = this.potHtml(lit);
      $('stove-cook').innerHTML = (cookHtml || meltHtml || potHtml) ? cookHtml + meltHtml + potHtml : '<span class="dim">囊裡沒有能烤、燒、煉、熔的東西。帶著釜（鐵二），這裡就煮得了粥羹。</span>';
      $('stove-fuel').querySelectorAll('button').forEach(b => b.addEventListener('click', () => b.dataset.store ? this.stoveStore(b.dataset.store) : this.stoveFuel(b.dataset.fuel)));
      $('stove-shelf').querySelectorAll('button').forEach(b => b.addEventListener('click', () => this.stoveBurnShelf(+b.dataset.shelf)));
      $('stove-cook').querySelectorAll('button').forEach(b => b.addEventListener('click', () => b.dataset.pot ? this.stovePot(b.dataset.pot) : b.dataset.melt ? this.stoveMelt(b.dataset.melt) : this.stoveCook(b.dataset.cook)));
    }
    tickStove() {         // 界面開著時：灶被拆了就關；火滅了或囊變了就重畫；剩幾息每息更新
      if (!this.stoveAt) return;
      const t = this.stovePos(), w = this.world;
      if (w.get(t.x, t.y) !== '灶' || U.cheb(this.player.x, this.player.y, t.x, t.y) > 1) { this.closeStove(); return; }
      const sig = (w.stoveLit(t.x, t.y) ? 1 : 0) + '|' + this.player.bag.map(s => s.n + s.c).join(',') + '|' + this.player.tools.map(s => s.n).join(',');
      if (sig !== this.stoveSig) { this.stoveSig = sig; this.buildStove(); }
      else if (w.stoveLit(t.x, t.y)) { const left = Math.round(w.stoveFuel(t.x, t.y)); if (left !== this.stoveLeft) { this.stoveLeft = left; $('stove-fire').innerHTML = '<i class="fire">火旺，還能燒 ' + left + ' 息</i>'; } }
    }
    // ---------- 鼎（v0.8.14 使用者定）：跟灶一樣，面向鼎按 F 開界面，在界面裡添柴、煉丹、熬蜃珠、鑄虎符、煉朱羽；世界照常走，火照常燒 ----------
    openDing(t) { this.dingAt = U.key(t.x, t.y); $('ding').classList.remove('hidden'); this.keys.clear(); this.action = null; this.dingSig = ''; this.buildDing(); }
    closeDing() { $('ding').classList.add('hidden'); this.dingAt = null; }
    dingPos() { const [x, y] = U.unkey(this.dingAt); return { x, y }; }
    dingStore(name) { return this.dingAt ? this.shelfStore(this.dingPos(), name) : false; }   // 鼎的柴架（v0.8.15）
    dingBurnShelf(i) { return this.dingAt ? this.shelfBurn(this.dingPos(), i) : false; }
    dingFuel(name) {      // 跟灶同一張燃料表、同一個上限
      if (!this.dingAt) return false;
      const t = this.dingPos(), w = this.world, sec = this.fuelOf(name);
      if (!sec || this.count(name) < 1) return false;
      if (!this.fuelFits(t, sec)) return false;
      w.addFuel(t.x, t.y, sec); this.removeItem(name, 1); this.message('鼎下添' + (name === '煤' || name === '精煤' ? '煤' : '柴') + '。還能燒 ' + Math.round(w.stoveFuel(t.x, t.y)) + ' 息。'); SFX.write(); this.buildBag(); this.buildDing(); return true;
    }
    dingMake(what) {      // what：蟾蜍肉／毒蟾肉（煉丹）、蜃殘體（熬蜃珠）、TOKENS 的殘體（鑄虎符、煉朱羽）；成不成、退什麼照原本的煉法
      if (!this.dingAt) return false;
      const t = this.dingPos();
      if (what === '蟾蜍肉' || what === '毒蟾肉') { if (this.count(what) < 1) { this.message('囊裡沒有' + what + '。'); SFX.fail(); return false; } this.refinePill(t, what); }
      else if (what === '蜃殘體') this.brewPearl(t);
      else if (TOKENS[what]) this.castToken(t, what);
      else return false;
      this.buildBag(); this.buildDing(); return true;
    }
    dingRows() {          // 鼎裡煉得出的四樣：要什麼、囊裡有多少、夠不夠
      const row = (key, title, needs, odds, sta) => ({ key, title, needs: needs.map(([n, k]) => ({ n, k, c: this.count(n) })), odds, sta });
      const rows = [row('蜃殘體', '熬蜃珠', [['蜃殘體', PEARL_SHARDS], ['海水瓶', PEARL_BRINE], ['淡水瓶', PEARL_FRESH]], PEARL_P, PEARL_STA)];
      for (const shard in TOKENS) { const k = TOKENS[shard]; rows.push(row(shard, k.verb + k.out, [[shard, PEARL_SHARDS]].concat(Object.keys(k.need).map(n => [n, k.need[n]])), PEARL_P, TALLY_STA)); }
      for (const r of rows) r.ok = r.needs.every(x => x.c >= x.k);
      return rows;
    }
    buildDing() {
      if (!this.dingAt) return;
      const t = this.dingPos(), w = this.world, lit = w.stoveLit(t.x, t.y), p = this.player, pct = (v) => (this.test ? 100 : Math.round(v * 100)) + '%';
      $('ding-fire').innerHTML = (lit ? '<i class="fire">火旺，還能燒 ' + Math.round(w.stoveFuel(t.x, t.y)) + ' 息</i>' : '<i>鼎冷火熄，先添柴</i>') + ' <small class="dim">（最多存 ' + w.stoveCap + ' 息）</small>';
      this.shelfRows(t, 'ding-shelf', 'ding-fuel');
      $('ding-pillnote').textContent = '已煉 ' + p.pillsMade + ' 顆' + (p.pillsMade < 3 ? '；前三顆無毒肉 8%、有毒肉 12%，第四顆起 1%、2%' : '；第四顆起無毒肉 1%、有毒肉 2%') + '；耗力 3';
      $('ding-pill').innerHTML = ['蟾蜍肉', '毒蟾肉'].map(n => { const c = this.count(n); return '<button data-make="' + n + '"' + (lit && c > 0 ? '' : ' disabled') + '><span class="ch">' + n + '</span> ×' + num(c) + ' <small>煉丹：一塊 → 丹（這次 ' + pct(this.pillChance(n)) + '）</small></button>'; }).join('');
      $('ding-brew').innerHTML = this.dingRows().map(r => '<button data-make="' + r.key + '"' + (lit && r.ok ? '' : ' disabled') + '><span class="ch">' + r.title + '</span> <small>' + r.needs.map(x => '<span' + (x.c >= x.k ? '' : ' class="lack"') + '>' + x.n + ' ' + num(x.c) + '/' + x.k + '</span>').join('、') + '，' + pct(r.odds) + '，耗力 ' + r.sta + '</small></button>').join('');
      $('ding-fuel').querySelectorAll('button').forEach(b => b.addEventListener('click', () => b.dataset.store ? this.dingStore(b.dataset.store) : this.dingFuel(b.dataset.fuel)));
      $('ding-shelf').querySelectorAll('button').forEach(b => b.addEventListener('click', () => this.dingBurnShelf(+b.dataset.shelf)));
      $('ding').querySelectorAll('button[data-make]').forEach(b => b.addEventListener('click', () => this.dingMake(b.dataset.make)));
    }
    tickDing() {          // 界面開著時：鼎被拆了或人走開了就關；火滅了或囊變了就重畫；剩幾息每息更新
      if (!this.dingAt) return;
      const t = this.dingPos(), w = this.world;
      if (w.get(t.x, t.y) !== '鼎' || U.cheb(this.player.x, this.player.y, t.x, t.y) > 1) { this.closeDing(); return; }
      const sig = (w.stoveLit(t.x, t.y) ? 1 : 0) + '|' + this.player.bag.map(s => s.n + s.c).join(',') + '|' + this.player.pillsMade;
      if (sig !== this.dingSig) { this.dingSig = sig; this.buildDing(); }
      else if (w.stoveLit(t.x, t.y)) { const left = Math.round(w.stoveFuel(t.x, t.y)); if (left !== this.dingLeft) { this.dingLeft = left; $('ding-fire').innerHTML = '<i class="fire">火旺，還能燒 ' + left + ' 息</i> <small class="dim">（最多存 ' + w.stoveCap + ' 息）</small>'; } }
    }
    // ---------- 數值提醒：不到五成亮燈（HUD），不到四分之一彈窗（困難只亮燈）；回到五成以上才會再提醒 ----------
    vitalFracs() { const p = this.player; return [['hp', '命', p.hp / p.hpMax], ['food', '飽', p.food / 100], ['warm', '暖', p.warm / 100], ['sta', '力', p.sta / p.staMax], ['san', '愜意', p.san / 100]]; }
    checkWarn() {
      const p = this.player; if (p.dead) return;
      if (!p.warnLow) p.warnLow = {};
      const low = [];
      for (const [k, name, frac] of this.vitalFracs()) { if (frac < WARN_POP) { if (!p.warnLow[k]) low.push([k, name]); } else if (frac >= WARN_LIGHT) p.warnLow[k] = false; }
      if (!low.length) return;
      if (this.warnOpen || this.fogAsk || this.seaAsk || p.knock > 0 || this.paused) return;   // 別的彈窗開著就等一等
      for (const [k] of low) p.warnLow[k] = true;
      if (this.diff.warn && this.warnEnabled) this.showWarn(low);
    }
    showWarn(low) {
      const ADVICE = { hp: '別打了：吃藥療傷，找有磚圍著的地方歇著。飽、暖、力、愜意都在七成五以上，命才慢慢回。', food: '吃點東西：野果、烤魚、烤肉。餓到底會掉命。', warm: '靠近火把、灶火或燈，穿上衣甲，別在夜裡吹風。冷到底會掉命。', sta: '停下手上的活，歇著或睡一覺。力竭會掉命。', san: '點亮火把、離開黑處與魄，做點東西、吃點好的。愜意歸零會神志不清。' };
      this.warnOpen = true; this.paused = true; this.keys.clear(); this.action = null;
      $('warn-title').textContent = low.map(x => x[1]).join('、') + '不到四分之一';
      $('warn-text').innerHTML = low.map(([k, name]) => '<b>' + name + '</b>：' + ADVICE[k]).join('<br>');
      $('warn').classList.remove('hidden');
    }
    closeWarn() { $('warn').classList.add('hidden'); this.warnOpen = false; this.paused = false; }
    fogUseFan() {
      const id = this.fogAsk; if (!id || this.count('扇') < 1) return;
      this.closeFog(); this.blowFog(this.world.fogs.get(id));
    }
    fogRefuse() {
      const id = this.fogAsk; if (!id) return;
      this.closeFog(); this.player.inFog = id; this.fogToll();
    }
    blowFog(f) {
      if (!f) return;
      const c = this.world.fogCenter(f);
      this.removeItem('扇', 1); this.world.removeFog(f.id); this.player.inFog = 0;
      this.fx.push({ type: 'write', x: Math.round(c.x), y: Math.round(c.y), ch: '風', color: G.INK.water, t: 0, dur: 0.7 });
      this.message('一把扇子搧下去，霧障散了。囊中還有扇子 ' + this.count('扇') + ' 把。'); SFX.absorb(); this.buildBag();
    }
    fogToll() {           // 五樣數值各掉當前的一成（精確到小數點後四位，顯示才四捨五入）；命不會因此歸零
      const p = this.player, cut = (v) => U.r4(v * FOG_TOLL), parts = [];
      const lose = { '命': cut(p.hp), '飽': cut(p.food), '暖': cut(p.warm), '力': cut(p.sta), '愜意': cut(p.san) };
      p.hp = Math.max(Math.min(p.hp, 1), p.hp - lose['命']); p.food -= lose['飽']; p.warm -= lose['暖']; p.sta -= lose['力']; p.san -= lose['愜意'];
      for (const k in lose) parts.push(k + ' −' + this.shown('fog' + k, lose[k]));
      this.fx.push({ type: 'float', x: p.x, y: p.y, text: '霧', color: G.INK.ash, t: 0, dur: 1.2 });
      this.message('穿霧而過：' + parts.join('、') + '。'); SFX.fail();
    }
    // 停船：只停在真的水上。灘在漲潮時讀起來是「水」，停在那裡退潮就擱淺，還會堵住去燈塔的路
    // v0.8.17：先停在原地（船身左上角 x0、y0，擺向照舊），停不住才找最近停得住的地方；shallowOnly 只停淺水
    parkShip(x, y, shallowOnly, maxR) {
      const w = this.world, s = this.shipNow() || World.newShip('孤帆'), dir = s.dir || 'v';
      const ok = (i, j) => this.shipWater(i, j) && (!shallowOnly || w.raw(i, j) === '水');
      const fits = (i, j) => w.shipFits(s.kind, i, j, ok, dir);
      const sx = s.x0 === undefined ? x : s.x0, sy = s.y0 === undefined ? y : s.y0;
      const at = fits(sx, sy) ? [sx, sy] : this.nearestTile(sx, sy, fits, maxR);
      if (at) { w.addShip(at[0], at[1], this.shipRec(Object.assign({}, s, { dir }))); this.player.ship = null; }
      return at;
    }
    nearestTile(x0, y0, ok, maxR) {     // 由近而遠一圈圈找
      for (let r = 0; r <= maxR; r++) for (let i = -r; i <= r; i++) for (const [x, y] of r ? [[x0 + i, y0 - r], [x0 + i, y0 + r], [x0 - r, y0 + i], [x0 + r, y0 + i]] : [[x0, y0]]) if (ok(x, y)) return [x, y];
      return null;
    }
    freeNear(x, y, outside) {   // outside：找給生靈站的格子，不能在小屋裡
      for (const [dx, dy] of N8) if (this.world.walkable(x + dx, y + dy) && !(outside && this.world.sheltered(x + dx, y + dy, '鷹'))) return { x: x + dx, y: y + dy };
      if (outside) for (let r = 2; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if ((Math.abs(dx) === r || Math.abs(dy) === r) && this.world.walkable(x + dx, y + dy) && !this.world.sheltered(x + dx, y + dy, '鷹')) return { x: x + dx, y: y + dy };
      return this.spawn;
    }

    // ---------- 囊：十六格 ----------
    // 佔幾格（v0.8.3 使用者定）：船在囊裡、櫃裡一艘一欄、不疊放，孤帆佔兩格、方舟佔五格；其餘一疊一格
    spanOf(n) { const it = G.item(n); return (it && it.span) || 1; }
    bagUsed(list) { let k = 0; for (const s of (list || this.player.bag)) k += this.spanOf(s.n); return k; }
    isShip(n) { const it = G.item(n); return !!(it && it.ship); }   // 孤帆、方舟：v0.8.19 起進船艙不進囊
    holdPick() { const p = this.player, h = p.hold || []; return h[p.holdSel] || h[0] || null; }   // 船艙裡選中的那艘；沒選就第一艘
    has(n) { if (this.isShip(n)) return this.count(n) > 0; return this.player.bag.some(s => s.n === n) || (n === '油脂' && this.count('油脂') > 0); }
    count(n) { if (this.isShip(n)) return (this.player.hold || []).filter(s => s.n === n).length; if (this.test && this.infOf(n)) return Infinity; let c = 0; for (const s of this.player.bag) { if (s.n === n) c += s.c; if (n === '油脂' && s.n === '麻布包') c += s.oil || 0; } return c; }   // 油脂裝在麻布包裡（v0.8.3），數的是包裡的份數
    canAdd(n, c) {
      c = c || 1; if (this.isShip(n)) return (this.player.hold || []).length + c <= HOLD_MAX;   // 船：船艙最多三艘
      const bag = this.player.bag, it = G.item(n), used = this.bagUsed();
      if (n === '油脂') return this.oilRoom() >= c;
      if (this.infOk(n)) return bag.some(s => s.n === n && s.dur === undefined && !s.store) || used < this.slots();   // 測試格：有一疊就收得下
      if (it && (it.dur || it.single)) return Math.max(0, c - (it.dur ? this.toolSlots() - this.player.tools.length : 0)) * this.spanOf(n) + used <= this.slots();
      for (const s of bag) if (s.n === n && s.dur === undefined && !s.store && s.c < STACK) c -= Math.min(c, STACK - s.c);   // 裝著東西的櫃、灶、鼎自成一格，不算空位（跟 addItem 一致；v0.8.15 自查）
      return c <= 0 || used + Math.ceil(c / STACK) <= this.slots();
    }
    swapOk(from, to) { if (this.canAdd(to, 1)) return true; const ss = this.player.bag.filter(x => x.n === from); return ss.length === 1 && ss[0].c === 1; }   // 用掉一個 from 換一個 to 放不放得下（v0.8.8）
    // 麻布包（v0.8.3 使用者定）：油脂只能裝在麻布包裡，一個包裝八份；包不是耗材，用的是包裡的份數
    oilRoom() { if (this.test && this.player.bag.some(s => s.n === '麻布包')) return Infinity; let k = 0; for (const s of this.player.bag) if (s.n === '麻布包') k += OIL_PER_BAG - (s.oil || 0); return k; }
    addOil(c) { if (this.test) { const b = this.player.bag.find(s => s.n === '麻布包'); if (b) { b.inf = true; b.oil = OIL_PER_BAG; this.barSig = ''; return 0; } }   // 測試格：包裡的油無數
      for (const s of this.player.bag) { if (s.n !== '麻布包' || c <= 0) continue; const k = Math.min(c, OIL_PER_BAG - (s.oil || 0)); s.oil = (s.oil || 0) + k; c -= k; } this.barSig = ''; return c; }
    takeOil(c) { if (this.test && this.infOf('油脂')) return; const bags = this.player.bag.filter(s => s.n === '麻布包' && s.oil > 0).sort((a, b) => a.oil - b.oil); for (const s of bags) { if (c <= 0) break; const k = Math.min(c, s.oil); s.oil -= k; c -= k; } this.barSig = ''; }   // 先用少的那包
    addItem(n, c, extra) {
      const bag = this.player.bag, it = G.item(n);
      if (this.isShip(n)) { const h = this.player.hold = this.player.hold || []; while (c > 0 && h.length < HOLD_MAX) { h.push(Object.assign({ n, c: 1 }, extra && extra.ship ? { ship: extra.ship } : {})); c--; } this.holdSig = ''; return c; }   // 船進船艙（v0.8.19），放不下的回傳
      if (n === '油脂') return this.addOil(c);   // 油脂進麻布包（v0.8.3）；沒包、包滿了就回傳放不下的份數
      if (this.infOk(n, extra)) return this.addInf(n, c);   // 測試格：採到、做出來的東西都是無數個（v0.8.10）
      if ((it && (it.dur || it.single)) || (extra && (extra.dur !== undefined || extra.store))) {     // 工具、穿過的衣甲、燈帽、裝著東西的櫃、船、麻布包各佔一欄
        const tools = this.player.tools, isTool = this.isTool(n), ex = {}; for (const k in extra || {}) if (extra[k] !== undefined) ex[k] = extra[k]; extra = ex;   // 沒值的欄位不帶（免得蓋掉預設，例如麻布包的油 0）
        if (n === '麻布包' && extra.oil === undefined) extra.oil = 0;
        while (c > 0 && isTool && tools.length < this.toolSlots()) { tools.push(Object.assign({ n, c: 1, dur: it.dur }, extra || {})); if (this.player.tool < 0) this.player.tool = tools.length - 1; c--; }
        while (c > 0 && this.bagUsed() + this.spanOf(n) <= this.slots()) { bag.push(Object.assign({ n, c: 1 }, it && it.dur ? { dur: it.dur } : {}, it && it.single && it.fuel !== undefined ? { fuel: it.fuel } : {}, extra || {})); c--; }
        this.barSig = ''; return c;
      }
      // 果：每顆帶著摘下的日數（extra.ds 由陳到新；舊格式 extra.d 整批同一天；沒給就是今天摘的），不分堆，陳的先放
      let days = null;
      if (this.aged(n)) { days = extra && extra.ds ? extra.ds.slice().sort((a, b) => a - b) : []; while (days.length < c) days.push(extra && extra.d !== undefined ? extra.d : this.day()); }   // v0.9.19：五穀也一顆一顆記收的日子
      const q = (extra && extra.q) || '';   // 菜是新穀還是陳穀做的（v0.9.19）：不一樣的分開疊
      for (const s of bag) {
        if (s.n !== n || s.dur !== undefined || s.store || s.c >= STACK || (s.q || '') !== q) continue;
        const k = Math.min(c, STACK - s.c);
        if (days) { this.fruitDays(s); s.ds.push(...days.splice(0, k)); s.ds.sort((a, b) => a - b); }
        s.c += k; c -= k; if (!c) break;
      }
      while (c > 0 && this.bagUsed() < this.slots()) { const k = Math.min(c, STACK); const s = { n, c: k }; if (days) s.ds = days.splice(0, k); if (q) s.q = q; bag.push(s); c -= k; }
      this.barSig = '';
      return c;
    }
    // 果：一疊裡每顆各記摘下的日數 ds（由陳到新）；舊存檔整疊一個 d 的，補成 ds
    fruitDays(s) {
      if (s.inf) return [this.day()];   // 測試格的果：無數個、一直是新摘的
      if (!Array.isArray(s.ds)) s.ds = [];
      const d0 = s.d !== undefined ? s.d : this.day();
      while (s.ds.length < s.c) s.ds.push(d0);
      if (s.ds.length > s.c) s.ds.length = s.c;
      delete s.d;
      s.ds.sort((a, b) => a - b);
      return s.ds;
    }
    grainNote(s) {       // 滑鼠停在五穀上（v0.9.19）：每批收了幾日
      const ds = this.fruitDays(s), today = this.day(), m = new Map();
      for (const d of ds) { const a = today - d; m.set(a, (m.get(a) || 0) + 1); }
      return [...m.entries()].sort((a, b) => b[0] - a[0]).map(([a, k]) => (a >= 1 ? '收了 ' + a + ' 日' : '今天收的') + ' ×' + k).join('、') + '；收了 ' + GRAIN_NEW + ' 日內是新穀（菜的增益少三成），放過 ' + GRAIN_OLD + ' 日成陳穀（只少一成五），先用最陳的。';
    }
    fruitNote(s) {       // 滑鼠停在果上：每批放了幾夜
      const ds = this.fruitDays(s), today = this.day(), m = new Map();
      for (const d of ds) { const a = today - d; m.set(a, (m.get(a) || 0) + 1); }
      return [...m.entries()].sort((a, b) => b[0] - a[0]).map(([a, k]) => (a >= 1 ? a + ' 夜' : '今天摘的') + ' ×' + k).join('、') + '；先吃最陳的，放滿十五夜變醉果。';
    }
    aged(n) { return n === '果' || !!(ITEMS[n] && ITEMS[n].seed); }   // 一顆一顆記日子的：果（醉）、五穀（新穀陳穀，v0.9.19）
    grainAge(s) { return this.day() - this.fruitDays(s)[0]; }
    // 先吃陳的：每一顆都從所有果裡挑摘得最早的；回傳拿掉的那幾顆的日數
    takeFruit(c) { return this.takeAged('果', c); }
    takeAged(n, c) {   // 果與五穀（v0.9.19）：先用最陳的
      const p = this.player, bag = p.bag, taken = [];
      if (bag.some(s => s.n === n && s.inf)) { while (c-- > 0) taken.push(this.day()); return taken; }
      while (c > 0) {
        let best = null;
        for (const s of bag) { if (s.n !== n || s.c <= 0) continue; this.fruitDays(s); if (!best || s.ds[0] < best.ds[0]) best = s; }
        if (!best) break;
        taken.push(best.ds.shift()); best.c--; c--;
        if (best.c <= 0) bag.splice(bag.indexOf(best), 1);
      }
      if (p.sel >= bag.length) p.sel = Math.max(0, bag.length - 1);
      this.barSig = '';
      return taken;
    }
    removeItem(n, c) {
      const bag = this.player.bag;
      if (this.isShip(n)) { const h = this.player.hold || []; for (let i = h.length - 1; i >= 0 && c > 0; i--) if (h[i].n === n) { h.splice(i, 1); c--; } this.fixHoldSel(); return; }
      if (this.test && this.infOf(n)) return;   // 測試格：無數個，用不完
      if (this.aged(n)) { this.takeAged(n, c); return; }
      if (n === '油脂') { this.takeOil(c); return; }
      for (let i = bag.length - 1; i >= 0 && c > 0; i--) { if (bag[i].n !== n) continue; const k = Math.min(c, bag[i].c); bag[i].c -= k; c -= k; if (bag[i].c <= 0) bag.splice(i, 1); }
      if (this.player.sel >= bag.length) this.player.sel = Math.max(0, bag.length - 1);
      this.barSig = '';
    }
    held() { return this.player.bag[this.player.sel] || null; }
    // 具欄：六格工具，P 換手持（含空手）
    isTool(n) { const it = ITEMS[n]; return !!(it && it.tool && it.dur); }
    activeTool() { return this.player.tools[this.player.tool] || null; }
    heldTool() { const s = this.activeTool(); return s ? ITEMS[s.n].tool : null; }
    heldDmg() { const s = this.activeTool(); return s ? (GODS.indexOf(s.n) >= 0 ? this.godDmg(s.n) : ITEMS[s.n].dmg || 0) : 0; }
    wearTool() {
      const p = this.player, s = this.activeTool(); if (!s || this.test) return;   // 測試格：工具、神兵都不掉耐久
      s.dur--; this.barSig = '';
      if (s.dur <= 0) { const n = s.n; p.tools.splice(p.tool, 1); if (p.tool >= p.tools.length) p.tool = p.tools.length - 1; this.toast('「' + n + '」鈍壞了', '石子磨石，再做一把。'); SFX.fail(); }
    }
    cycleTool(d) {
      const p = this.player, n = p.tools.length;
      if (!n) { p.tool = -1; this.message('具欄空空。石一、石子一、木一可磨出工具。'); return; }
      p.tool = p.tool + d; if (p.tool >= n) p.tool = -1; else if (p.tool < -1) p.tool = n - 1;
      this.message(p.tool < 0 ? '空手。' : '手持「' + p.tools[p.tool].n + '」。'); this.buildBag();
    }
    toolGroup(n) { const t = ITEMS[n] && ITEMS[n].tool; return t && FARM_KINDS.indexOf(t) >= 0 ? 'farm' : 'weapon'; }   // 鎬鋤斧是農具，其餘（刀劍彈弓神兵）是武器
    sortTools() {   // 武器在前、農具在後（穩定排序，同一段裡照放進來的先後）；手上那把跟著走
      const p = this.player, cur = p.tools[p.tool] || null, w = (s) => (this.toolGroup(s.n) === 'farm' ? 1 : 0);
      if (p.tools.every((s, i) => i === 0 || w(p.tools[i - 1]) <= w(s))) return;
      p.tools.sort((a, b) => w(a) - w(b)); p.tool = cur ? p.tools.indexOf(cur) : -1;
    }
    cycleGroup(group) {   // P 換武器、O 換農具：同一段裡輪著換，換到最後一把之後是空手；從另一段或空手按下去，拿這段的第一把。神兵有 L，不在 P 的輪替裡
      const p = this.player; this.sortTools();
      const idx = []; p.tools.forEach((s, i) => { if (this.toolGroup(s.n) === group && GODS.indexOf(s.n) < 0) idx.push(i); });
      if (!idx.length) { this.message(group === 'farm' ? '沒有農具。石一、石子一、木一可磨鎬、鋤、斧。' : '沒有武器。石一、石子一、木一可磨刀、劍；木二麻三做彈弓。'); return; }
      const at = idx.indexOf(p.tool); p.tool = at < 0 ? idx[0] : at + 1 < idx.length ? idx[at + 1] : -1;
      this.prevTool = null; this.barSig = '';
      this.message(p.tool < 0 ? '空手。' : '手持「' + p.tools[p.tool].n + '」。'); this.buildBag();
    }
    stoneToCrush() {   // 要磨回石子的那把：手上是石器就是它，否則囊裡第一把石器
      const p = this.player, s = this.activeTool();
      if (s && STONE_TOOLS.indexOf(s.n) >= 0) return { s, from: 'tools' };
      const b = p.bag.find(x => STONE_TOOLS.indexOf(x.n) >= 0); return b ? { s: b, from: 'bag' } : null;
    }
    // 神兵與彈弓各有專鍵（v0.5.7）：L 拿出神兵（手上已是神兵就換另一件）、P 收回；Y 拿出彈弓、再按收起。
    // 收回時回到拿出前手上那把（拿出前是空手、或那把已經不在了就空手）；在神兵與彈弓之間換來換去不改記著的那把。
    isSpecial(s) { return !!s && (GODS.indexOf(s.n) >= 0 || s.n === '彈弓'); }
    takeOut(names) {   // 拿出 names 裡的一件（具欄優先，沒有就從囊移進具欄）；回傳那件、沒有回 null、具欄滿了回 false
      const p = this.player, cur = this.activeTool();
      let i = p.tools.findIndex(s => names.indexOf(s.n) >= 0 && s !== cur);
      if (i < 0) { const b = p.bag.findIndex(s => names.indexOf(s.n) >= 0); if (b < 0) return null; const s = p.bag[b]; if (!this.equipFromBag(b)) return false; i = p.tools.indexOf(s); }   // 移進具欄後會排序，用那件找回位置
      if (!this.isSpecial(cur)) this.prevTool = cur;
      p.tool = i; this.barSig = ''; this.buildBag(); SFX.write(); return p.tools[i];
    }
    putAway() {
      const p = this.player, cur = this.activeTool(), prev = this.prevTool, j = prev ? p.tools.indexOf(prev) : -1;
      p.tool = j; this.prevTool = null; this.barSig = ''; this.buildBag();
      this.message('收起「' + (cur ? cur.n : '') + '」，' + (j >= 0 ? '手持「' + prev.n + '」。' : '空手。'));
    }
    drawGodN(i) {   // 7 九閽鳴雷、8 燭龍焚溟、9 青冥落羽（對空神兵，v0.8.25）
      const name = GODS[i], cur = this.activeTool();
      if (!name) { this.message('第三件神兵（對空）還沒鑄成。'); return; }
      if (cur && cur.n === name) { this.message('手上就是「' + name + '」。P 收回。'); return; }
      const got = this.takeOut([name]);
      if (got) this.message('拿出「' + got.n + '」。P 收回。'); else if (got === null) this.message('沒有「' + name + '」。膽氣卅一重可鑄。');
    }
    drawGod() {
      const cur = this.activeTool(), holding = !!cur && GODS.indexOf(cur.n) >= 0, got = this.takeOut(GODS);
      if (got) { this.message('拿出「' + got.n + '」。P 收回。'); return; }
      if (got === false) return;   // 具欄滿了，equipFromBag 已經說了
      this.message(holding ? '手持「' + cur.n + '」，只有這一件神兵。P 收回。' : '沒有神兵。膽氣卅一重可鑄九閽鳴雷與燭龍焚溟。');
    }
    toggleSling() {
      const cur = this.activeTool();
      if (cur && cur.n === '彈弓') { this.putAway(); return; }
      const got = this.takeOut(['彈弓']);
      if (got) this.message('拿出彈弓：E 射面前九格內最近的獸。Y 收起。');
      else if (got === null) this.message('沒有彈弓。木二、麻三可做（製作的「具」）。');
    }
    equipFromBag(i) {
      const p = this.player, s = p.bag[i]; if (!s || !this.isTool(s.n)) return false;
      if (p.tools.length >= this.toolSlots()) { this.message('具欄滿了。'); SFX.fail(); return false; }
      p.bag.splice(i, 1); p.tools.push(s); if (p.tool < 0) p.tool = p.tools.length - 1;
      if (p.sel >= p.bag.length) p.sel = Math.max(0, p.bag.length - 1);
      this.barSig = ''; this.buildBag(); this.message('「' + s.n + '」移進具欄。'); SFX.write(); return true;
    }
    unequipToBag(i) {
      const p = this.player, s = p.tools[i]; if (!s) return;
      if (this.bagUsed() >= this.slots()) { this.message('囊已滿。'); SFX.fail(); return; }
      p.tools.splice(i, 1); p.bag.push(s); if (p.tool >= p.tools.length) p.tool = p.tools.length - 1;
      this.barSig = ''; this.buildBag(); this.message('「' + s.n + '」移回囊。'); SFX.write();
    }
    spendSta(n) { const p = this.player; if (p.sta < n) { this.message('力有未逮，且歇一歇。'); SFX.fail(); return false; } p.sta -= n; return true; }

    // ---------- 移動 ----------
    pass(x, y, ox, oy) {   // (ox, oy)：從哪一格走過來，不給就是人現在站的那格（找路時一格一格試）
      const ch = this.world.get(x, y), d = DB[ch];
      if (this.player.sailing) { if (this.onDeck(x, y) || this.world.raw(x, y) === '灘') return true; }   // v0.8.17 船上：船身裡隨便走；走下船照陸上的規矩（灘漲潮也涉得上岸）
      else if (this.player.swimming) return d.kind === 'water' || d.walk > 0;
      const w = this.world, p = this.player, ax = ox === undefined ? p.x : ox, ay = oy === undefined ? p.y : oy;
      if (ch === '水' && w.raw(x, y) === '灘' && w.raw(ax, ay) === '灘') return true;   // 漲潮困在灘上：可涉水走到別的灘
      if (ch === '台') { const here = w.get(ax, ay); if (here !== '台' && here !== '階') return false; }   // 台要從階或台走上去（下台可以直接跳）
      return d.walk > 0 || ch === '燈' || ('水川湖池'.indexOf(ch) >= 0 && this.has('竹筏'));   // 竹筏：淺水與河湖池（v0.7）   // 燈：人跨得過（獸照 canStand 過不去，魄本來就穿磚）
    }
    handleMove(dt) {
      const p = this.player;
      if (p.moveT > 0) {
        p.moveT -= dt;
        const k = 1 - Math.max(0, p.moveT) / p.stepDur;
        p.rx = U.lerp(p.fromX, p.x, k); p.ry = U.lerp(p.fromY, p.y, k);
        if (p.moveT <= 0) { p.rx = p.x; p.ry = p.y; this.onArrive(); }
        else return;
      } else if (p.moveT < 0) p.moveT = 0;   // v0.9.6：上一幀走完了、這一幀沒接著走——多過的那一點時間不留到下回（只接給緊接著的那一步）
      if (p.knock > 0 || p.dead) return;
      let dx = 0, dy = 0, sx = 0, sy = 0;
      if (p.insane && !p.ctrl) { const d = N8[Math.floor(Math.random() * 8)]; dx = d[0]; dy = d[1]; }   // 失控：亂走
      else for (const code of this.keys) { const d = DIRS[code], k = SHIP_KEYS[code]; if (d) { dx += d[0]; dy += d[1]; } if (k) { sx += k[0]; sy += k[1]; } }
      dx = U.sign(dx); dy = U.sign(dy); sx = p.sailing ? U.sign(sx) : 0; sy = p.sailing ? U.sign(sy) : 0;
      if (p.confuseT > 0) { if (dx || dy) { const t = dx; dx = -dy; dy = t; } if (this.path || this.follow) this.stopWalk(); }   // 亂（v0.8.25，設計稿〈一〉）：方向鍵轉九十度（往上走成往右）；滑鼠點的路也走不成
      if (dx || dy || sx || sy) this.stopWalk();                       // 按了方向鍵（或開船）：滑鼠點的路不走了、也不跟了
      else if ((this.path || this.follow) && !(p.insane && !p.ctrl)) { this.followPath(); return; }
      if (sx && sy) { const k = sx + ',' + sy; if (!this.shipDiag || this.shipDiag.k !== k) this.shipDiag = { k, dir: Math.random() < 0.5 ? 'h' : 'v' }; } else this.shipDiag = null;   // v0.8.21 使用者定：兩鍵一起按斜著開，哪邊長隨機定，放開一個鍵才重抽
      if (!dx && !dy) { if (sx || sy) { if (this.action) this.action = null; const want = this.shipDiag && this.shipDiag.dir; this.shipStep(sx, sy, want) || (sx && sy && (this.shipStep(sx, 0, want) || this.shipStep(0, sy, want))); } return; }   // 1234 開船（v0.8.17）
      p.fx = dx; p.fy = dy;
      if (this.action) this.action = null;
      this.tryStep(dx, dy) || (dx && dy && (this.tryStep(dx, 0) || this.tryStep(0, dy)));
    }
    // ---------- 滑鼠點格子走過去（v0.6.5；v0.6.6 使用者改）：不踩上點的那一格，而是走到它周圍八格裡站得上去、走起來離人最近的那一格，面向它，
    // 好接著對它取、放、打；點的是會動的生靈，就一直跟著，跟到牠身旁一格、面向牠為止 ----------
    unsafe(x, y) { return !!(this.world.info(x, y).bog || this.world.fogAt(x, y)); }   // 沼澤與霧障：找路時先避開（v0.6.7）
    openGround(x, y) {   // 空地（v0.7.1 使用者定：點了就直接走上去）：地面、白紙、草花，與棧台階這些本來就是給人走的；沼澤、有生靈站著、站不上去的不算
      const ch = this.world.get(x, y), d = DB[ch];
      if (this.onDeck(x, y)) return !this.ents.beastAt(x, y);   // 船上：甲板也是空地（v0.8.17）
      if (!d || d.walk <= 0 || d.bog || this.ents.at(x, y)) return false;
      return d.kind === 'ground' || d.kind === 'blank' || '草花棧台階'.indexOf(ch) >= 0;
    }
    planPath(tx, ty, onto) {   // 先找安全的路（不踩沼澤、霧障）；找不到才退而求其次，回 { path, safe }；onto：走上那一格（點的是空地）
      const safe = this.findPath(tx, ty, false, onto); if (safe) return { path: safe, safe: true };
      const any = this.findPath(tx, ty, true, onto); return any ? { path: any, safe: false } : null;
    }
    findPath(tx, ty, risky, onto) {   // 從人到 (tx, ty) 周圍八格之一的路（A*、八方向、斜走不貼角、繞開獸站的格；risky 不給就也繞開沼澤與霧障）；人已經在旁邊就回空路；到不了回 null
      const p = this.player, sx = p.x, sy = p.y, K = (x, y) => (x - sx + PATH_R) * (2 * PATH_R + 1) + (y - sy + PATH_R);
      const near = onto ? 0 : 1, done = (x, y) => U.cheb(x, y, tx, ty) === near;   // 空地走上去；其餘走到旁邊一格
      const cost = new Map([[K(sx, sy), 0]]), from = new Map(), heap = [[Math.max(0, U.cheb(sx, sy, tx, ty) - near), 0, sx, sy]];
      const beasts = new Set(); for (const e of this.ents.list) if (this.ents.beastAt(e.x, e.y) === e) for (const [cx, cy] of this.ents.cellsOf(e)) beasts.add(U.key(cx, cy));   // 獸站的格子繞開（找路當下的位置；野牛連尾巴兩格）
      const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; };
      let n = 0;
      while (heap.length && n++ < PATH_NODES) {
        const [, c, x, y] = pop(); if (c > cost.get(K(x, y))) continue;
        if (done(x, y)) {
          const path = []; let k = K(x, y), cx = x, cy = y; while (!(cx === sx && cy === sy)) { path.unshift([cx, cy]); [cx, cy] = from.get(k); k = K(cx, cy); }
          return path;
        }
        for (const [dx, dy] of N8) {
          const nx = x + dx, ny = y + dy; if (Math.abs(nx - sx) > PATH_R || Math.abs(ny - sy) > PATH_R || (!onto && nx === tx && ny === ty)) continue;   // 點的那格不踩上去（空地除外）
          if (!this.pass(nx, ny, x, y) || beasts.has(U.key(nx, ny)) || (!risky && this.unsafe(nx, ny)) || (dx && dy && !(this.pass(x + dx, y, x, y) && this.pass(x, y + dy, x, y)))) continue;   // 斜走不能貼著擋路的角穿過去（跟方向鍵一樣）
          const nc = c + (dx && dy ? 1.3 : 1) / Math.max(0.3, DB[this.world.get(nx, ny)].walk || 1), nk = K(nx, ny);
          if (cost.has(nk) && cost.get(nk) <= nc) continue;
          cost.set(nk, nc); from.set(nk, [x, y]); push([nc + Math.max(0, Math.max(Math.abs(tx - nx), Math.abs(ty - ny)) - near), nc, nx, ny]);
        }
      }
      return null;
    }
    walkTo(tx, ty, ent) {   // ent：點的是會動的生靈就一路跟著
      const p = this.player;
      if (p.knock > 0 || p.dead || !this.canAct()) return false;
      if (Math.max(Math.abs(tx - p.x), Math.abs(ty - p.y)) > PATH_R) { this.message('太遠了，在畫面裡點近一點的格子。'); return false; }
      const onto = !ent && this.openGround(tx, ty), plan = this.planPath(tx, ty, onto);   // 點的是空地就走上去（v0.7.1）
      if (!plan) { this.stopWalk(); this.message(ent ? '到不了牠那裡。' : '走不過去。'); SFX.fail(); return false; }
      const path = plan.path; this.pathSafe = plan.safe;
      this.path = path; this.pathGoal = { x: tx, y: ty, onto }; this.follow = ent || null; this.pathTries = 0; if (this.action) this.action = null;
      if (!plan.safe) this.message('沒有不經沼澤、霧障的路，只好穿過去。按方向鍵停下。');
      else if (ent) this.message('跟著「' + this.beastName(ent) + '」走。按方向鍵停下。');
      if (!path.length) { if (ent) this.followPath(); else this.facePathGoal(); }
      return true;
    }
    pressCatch() {   // = 捉（v0.6.7 使用者定）：面前的魚；以後可捉的生靈也走這裡
      if (!this.canAct()) return; const t = this.facing(), e = this.ents.at(t.x, t.y);
      if (!e) { this.message('面前沒有能捉的。面向水裡的魚按 = 捉。'); return; }
      if (e.type === '魚') { this.catchFish(e); return; }
      this.message('「' + this.beastName(e) + '」捉不住。' + (e.type === '魄' ? '魄無形，用光。' : '要打按 E。'));
    }
    pressFeed() {    // Q 餵（v0.6.7 使用者定）：面前的鷹，囊裡有魚就餵一條（野的投魚馴，馴了的回力）
      if (!this.canAct()) return; const t = this.facing(), e = this.ents.at(t.x, t.y);
      if (!e) { this.message('面前沒有能餵的。面向鷹按 Q 餵魚。'); return; }
      if (e.type !== '鷹' && e.type !== '狸') { this.message('「' + this.beastName(e) + '」不吃餵。'); return; }
      if (this.count('魚') < 1) { this.message('囊裡沒有魚，餵不了' + e.type + '。'); SFX.fail(); return; }
      if (e.type === '狸') this.feedCat(e); else this.feedEagle(e);
    }
    stopWalk() { this.path = null; this.follow = null; this.pathEnd = false; }
    facePathGoal() { const p = this.player, gl = this.pathGoal; if (gl && !gl.onto && U.cheb(gl.x, gl.y, p.x, p.y) === 1) { p.fx = gl.x - p.x; p.fy = gl.y - p.y; } this.stopWalk(); }
    followPath() {
      const p = this.player, e = this.follow;
      if (e) {   // 跟著一隻會動的：到了身旁一格就面向牠、停；牠挪了就照牠現在的位置重找路
        if (this.ents.list.indexOf(e) < 0) { this.stopWalk(); this.message('跟丟了。'); return; }
        if (U.cheb(e.x, e.y, p.x, p.y) <= 1) { if (e.x !== p.x || e.y !== p.y) { p.fx = e.x - p.x; p.fy = e.y - p.y; } this.stopWalk(); this.message('跟上了「' + this.beastName(e) + '」，就在面前。'); return; }
        if (!this.path || !this.path.length || e.x !== this.pathGoal.x || e.y !== this.pathGoal.y) {
          const again = this.planPath(e.x, e.y);
          if (!again) { this.stopWalk(); this.message('跟不過去了。'); return; }
          this.path = again.path; this.pathSafe = again.safe; this.pathGoal = { x: e.x, y: e.y };
          if (!again.path.length) return;
        }
      } else if (!this.path || !this.path.length) { this.facePathGoal(); return; }
      const [nx, ny] = this.path[0], dx = nx - p.x, dy = ny - p.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (!dx && !dy)) { this.path.shift(); return; }
      const gl = this.pathGoal;
      if (this.pathSafe && this.unsafe(nx, ny) && gl) {   // 霧飄到路上了：重找一條安全的；沒有就照舊走（並說一聲）
        const again = this.planPath(e ? e.x : gl.x, e ? e.y : gl.y, !e && gl.onto);
        if (again && again.safe) { this.path = again.path; return; }
        this.pathSafe = false; this.message('霧飄到路上了，繞不開，只好穿過去。');
      }
      p.fx = dx; p.fy = dy;
      if (this.tryStep(dx, dy)) { this.path.shift(); if (!this.path.length && !e) this.pathEnd = true; return; }
      if (gl && ++this.pathTries <= 3) { const again = this.planPath(e ? e.x : gl.x, e ? e.y : gl.y, !e && gl.onto); if (again) { this.path = again.path; this.pathSafe = again.safe; return; } }   // 路被擋了（獸、剛放的東西）：重找，三次不成就停
      this.stopWalk(); this.message('路被擋住了。');
    }
    tryStep(dx, dy) {
      const p = this.player, w = this.world, nx = p.x + dx, ny = p.y + dy;
      if (!p.sailing && w.shipAt(nx, ny) && !this.ents.beastAt(nx, ny)) { if (dx && dy) { this.hintOnce('上船要從船邊正面走上去，不能斜著跨。'); return false; } this.board({ x: nx, y: ny }); return true; }   // 走上停著的船就是上船（v0.8.17；v0.8.19 只能從共邊上）
      const b = this.ents.beastAt(nx, ny);
      if (!this.pass(nx, ny) || (b && !(b.type === '魚' && this.onDeck(nx, ny)))) { if (w.get(nx, ny) === '台' && !p.sailing) this.hintOnce('台要從「階」走上去。'); return false; }   // 船上：魚在船底下，不擋
      if (dx && dy && !(this.pass(p.x + dx, p.y) && this.pass(p.x, p.y + dy))) return false;
      const d = w.info(nx, ny);
      const deck = p.sailing && this.onDeck(nx, ny);
      if (p.sailing && !deck) {          // 從船上走下去（v0.8.17）：船停在原地；v0.8.19 只能從共邊下
        if (dx && dy) { this.hintOnce('下船要從船邊正面走上岸，不能斜著跨。'); return false; }
        if (!this.parkShip(p.x, p.y, false, 8)) { this.message('船身底下停不住，往深一點的水開了再下船。'); return false; }
        p.sailing = false; this.message('下了船。船停在那裡：走上去或面向它按 E 就上船。');
      }
      if (p.swimming && d.kind !== 'water') { p.swimming = false; p.swimT = 0; p.deploy = null; p.swimShips = 0; this.toast('上岸了', '撿回一條命。船沒了，要渡海得再造一艘。'); SFX.learn(); }
      p.fromX = p.x; p.fromY = p.y; p.x = nx; p.y = ny; p.shipMove = false;
      p.stepDur = (deck ? 0.17 : p.swimming ? 0.17 + (SWIM_STEP - 0.17) * this.swimK() : 0.17 / (d.walk > 0 ? d.walk : 0.6)) * (dx && dy ? 1.3 : 1) / this.ironSpeed() / (!deck && (this.mudAt(p.x, p.y) === '淖' || this.mudAt(p.fromX, p.fromY) === '淖') ? MUD_SLOW : 1) / (!deck && this.walkFast() ? WALK_FAST : 1);   // 共工的淖：慢六成五（v0.9）；四下無敵快五成（v0.9.8）
      p.moveT = p.stepDur;
      return true;
    }
    walkFast() {   // v0.9.8：走路快五成——不在船上水裡、不在還沒斃的大魔王地界裡、方圓四格裡沒有敵對生靈（魄也算）
      const p = this.player, en = this.ents; if (p.sailing || p.swimming || DB[this.world.get(p.x, p.y)].kind === 'water' || this.inBossLand(p.x, p.y)) return false;   // 撐竹筏過水也不算（v0.9.9 自查）
      for (const o of en.list) if (o.hp > 0 && (o.type === '魄' || en.isHostile(o)) && Math.min(...en.cellsOf(o).map(([cx, cy]) => U.cheb(cx, cy, p.x, p.y))) <= WALK_SAFE_R) return false;
      return true;
    }
    onArrive() { if (!this.player.sailing) this.world.trample(this.player.x, this.player.y); if (this.pathEnd) { this.pathEnd = false; this.facePathGoal(); } }
    facing() { return { x: this.player.x + this.player.fx, y: this.player.y + this.player.fy }; }

    // ---------- 取（E） ----------
    pressGather(silent) {
      if (this.action || !this.canAct()) { if (!this.canAct() && !silent) this.message(this.player.ctrl ? '' : '手腳不聽使喚。'); return; }
      const p = this.player, w = this.world, t = this.facing(), e = this.ents.at(t.x, t.y);
      const az = this.ents.list.find(o => o.type === '青龍' && U.cheb(o.x, o.y, p.x, p.y) <= 2);
      if (az && (!e || e === az)) { this.askAzure(); return; }   // v0.8：青龍兩格內，E 是求教
      const bh = this.ents.list.find(o => o.type === '白虎' && U.cheb(o.x, o.y, p.x, p.y) <= 2);
      if (bh && (!e || e === bh)) { this.askTiger(); return; }   // v0.8.5：白虎兩格內，E 是求教
      const zq = this.ents.list.find(o => o.type === '朱雀' && U.cheb(o.x, o.y, p.x, p.y) <= 2);
      if (zq && (!e || e === zq)) { this.askPhoenix(); return; }   // v0.8.6：朱雀兩格內，E 是求教
      const xw = this.ents.list.find(o => o.type === '玄武' && U.cheb(o.x, o.y, p.x, p.y) <= 2);
      if (xw && (!e || e === xw)) { this.askTortoise(); return; }   // v0.8.8：玄武兩格內，E 是取經
      if (this.heldTool() === '鎚') {
        const targets = this.ents.list.filter(o => ('鹿虎豹狼蛇蛛蟾蜃豬牛齒雕豨畢'.indexOf(o.type) >= 0 || o.type === '修蛇' || o.type === '大風' || o.type === '共工') && this.ents.rectDist(o, p.x, p.y) <= HAMMER_RANGE);   // 天上的大風 rectDist 是無窮遠，搆不到
        if (targets.length || (e && e.type !== '龍')) { this.hammerStrike(targets); return; }
      }
      if (this.heldTool() === '焚') {
        const targets = this.ents.list.filter(o => ('鹿虎豹狼蛇蛛蟾蜃龜豬牛齒雕豨畢'.indexOf(o.type) >= 0 || o.type === '修蛇' || o.type === '大風' || o.type === '共工' || (o.type === '鷹' && !o.tame)) && this.ents.rectDist(o, p.x, p.y) <= HAMMER_RANGE);
        if (targets.length || (e && e.type !== '龍')) { this.fireStrike(targets); return; }
      }
      if (this.heldTool() === '弓') { const st = this.slingTarget(); if (st) { this.slingShot(st); return; } }   // 彈弓：面前九格內有獸就射，沒有就照常取
      if (this.heldTool() === '弋') { const st = this.skyTarget(); if (st) { this.bowShot(st); return; } }   // 青冥落羽（v0.8.25）：面前十格內有獸就射，沒有就照常取
      if (e) {
        if (e.type === '龍') { this.message('你的小龍。'); return; }
        if (e.type === '魄') { this.message('魄無形，打不著；用光。'); return; }
        if (e.type === '魚') { this.catchFish(e); return; }
        if (e.type === '鳥') { this.message('鳥飛了。'); e.moveT = 0; return; }
        this.attack(e); return;
      }
      if (p.swimming) { this.message('游泳時騰不出手，先上岸。'); return; }
      if (p.sailing) { this.message('船上做不了這個，先靠岸。'); return; }
      const ch = w.get(t.x, t.y), d = DB[ch], hs = this.held();
      // 空瓶取水
      if (hs && hs.n === '玻璃瓶') {
        if ((d.fresh || ch === '湯' || d.kind === 'water' || ch === '泉' || ch === '井') && !this.swapOk('玻璃瓶', d.fresh || ch === '湯' || ch === '泉' || ch === '井' ? '淡水瓶' : '海水瓶')) { this.message('囊已滿，裝了水的瓶子放不下。'); SFX.fail(); return; }   // v0.8.8：囊滿時不再扣了空瓶又丟了水瓶
        if (d.fresh || ch === '湯') { this.removeItem('玻璃瓶', 1); this.addItem('淡水瓶', 1); this.message('取了一瓶淡水（' + G.biomeName(ch) + '的水是淡的）。'); SFX.absorb(); return; }
        if (d.kind === 'water') { this.removeItem('玻璃瓶', 1); this.addItem('海水瓶', 1); this.message('取了一瓶海水。'); SFX.absorb(); return; }
        if (ch === '泉' || ch === '井') { this.removeItem('玻璃瓶', 1); this.addItem('淡水瓶', 1); this.message('取了一瓶淡水。'); SFX.absorb(); return; }
      }
      const pl = w.placeAt(t.x, t.y);
      if (pl) { this.readPlace(pl); return; }
      if (ch === '碑') { this.readStele(t); return; }
      if (ch === '亭') { this.wishAt(); return; }   // 惜字亭：許願（v0.8.8）
      if (GATE_GLYPH['扶桑'] === ch || GATE_GLYPH['若木'] === ch || GATE_GLYPH['建木'] === ch) { const k = this.gateKeyAt(t.x, t.y) || this.netGateAt(t.x, t.y); if (k && !this.naming) this.openTele(k); return; }   // 建木、扶桑、若木：傳送（v0.8.21；v0.8.27 第三版沒點亮的先點亮）
      if (ch === '包') { this.openPurse(t); return; }   // v0.8.29 荷包開介面，每回死亡一檔
      if (ch === '囊') { this.pickBag(t); return; }
      if (ch === '漁') { this.harvestWeir(t); return; }
      if (d.net) { this.useNet(t); return; }
      if (ch === '門') { this.askRoad(t); return; }
      if (ch === '櫃') { this.openChest(t); return; }
      if (ch === '舟') { if (p.fx && p.fy) { this.message('上船要從船邊正面上，不能斜著跨。'); return; } this.board(t); return; }
      if (d.crop) { this.reapAt(t, silent); return; }   // 五穀（v0.9.18）：熟了收、遺穗拾、苗秀拿鋤拔
      const tool = this.heldTool();
      if (tool === '鋤' && (ch === '土' || ch === '草')) {
        if (p.sta < 1) { if (!silent) this.message('力有未逮，且歇一歇。'); return; }
        p.sta = Math.max(0, p.sta - this.workDrain()); w.set(t.x, t.y, '田'); w.extinguish(t.x, t.y); this.wearTool(); this.addCourage(1); this.message('鋤之成田。'); SFX.write();
        this.fx.push({ type: 'write', x: t.x, y: t.y, ch: '田', color: DB['田'].ink, t: 0, dur: 0.35 });
        return;
      }
      if (!d.yield) { if (!silent) this.message(ch === '白' ? '白紙上無物可取。' : '「' + ch + '」取不走。'); return; }
      if (d.need && tool !== d.need) { if (!silent) this.message('「' + ch + '」要用' + G.TOOL_NAMES[d.need] + '。'); return; }
      for (const n in d.yield) if (!this.canAdd(n, d.yield[n])) { if (!silent) this.message('囊已滿。'); return; }
      if ((ch === '灶' || ch === '鼎') && (w.shelves.get(U.key(t.x, t.y)) || []).length && this.bagUsed() >= this.slots()) { if (!silent) this.message(ch + '的柴架上還有柴，要一格空的才拆得下。'); return; }
      if (p.sta < 1) { if (!silent) this.message('力有未逮，且歇一歇。'); return; }
      if (d.kind === 'object' && d.place && !this.takeOk) { this.askTake(t, ch, () => this.confirmed(() => this.pressGather(false))); return; }   // 人造的東西：拆之前問一聲
      let time = d.time;
      const useTool = (d.fast && tool === d.fast) || (d.need && tool === d.need);
      if (useTool) time /= 2;
      if (ch === '磚' && tool === '鎬') time = 1.0;
      this.action = { type: 'gather', x: t.x, y: t.y, ch, t: 0, dur: time, useTool };
    }
    updateAction(dt) {
      const a = this.action; if (!a) return;
      const t = this.facing();
      if (t.x !== a.x || t.y !== a.y || this.world.get(a.x, a.y) !== a.ch) { this.action = null; return; }
      a.t += dt;
      if (a.t >= a.dur) { if (a.reap) this.finishReap(a); else this.finishGather(a); }
    }
    finishGather(a) {
      const w = this.world, p = this.player, d = DB[a.ch];
      const shelf = a.ch === '灶' || a.ch === '鼎' ? (w.shelves.get(U.key(a.x, a.y)) || []).slice() : null;   // 灶、鼎（v0.8.15）的柴架：拆下來記在囊裡那個灶、鼎上
      const under = w.base(a.x, a.y), onWater = d.onWater && (DB[under].kind === 'water' || under === '灘' || DB[under].bog);
      const to = onWater ? under : (d.to || '白');                       // 拆回棧、魚梁：底下原本是水、灘或沼就還原，不會憑空多出陸地
      w.set(a.x, a.y, to); w.extinguish(a.x, a.y);
      if (d.regrow) w.schedule(a.x, a.y, to, a.ch, d.regrow);         // 草木會長回來
      if (a.ch === '鐵') w.addOre(a.x, a.y);                          // 鐵礦七到十日後在原地長回來（v0.6.10）
      let got = [];
      for (const n in d.yield) { if (shelf && shelf.length && n === a.ch) this.addItem(n, 1, { store: shelf }); else this.addItem(n, d.yield[n]); got.push(n + (d.yield[n] > 1 ? '×' + d.yield[n] : '')); }
      if (d.bonus) for (const n in d.bonus) if ((d.trueBonus ? U.trueRand() : Math.random()) < d.bonus[n]) { const at = this.giveNear(n, 1); got.push(n); if (at) this.message('囊滿了，' + n + '用小囊包著擱在' + at.where + '。'); }   // 鐵礦脈出鎢礦是真隨機（v0.6.3）
      if (a.useTool && '石山磊岩'.indexOf(a.ch) >= 0 && U.trueRand() < FLINT_P) { const at = this.giveNear('燧石', 1); got.push('燧石'); if (at) this.message('囊滿了，燧石用小囊包著擱在' + at.where + '。'); }   // 鑿石頭偶爾鑿出燧石（v0.8.6，真隨機）
      if (a.useTool) this.wearTool();
      p.sta = Math.max(0, p.sta - this.workDrain()); this.stats.gathered++;
      if (d.kind !== 'object') this.addCourage(1);                          // 採天然的才長膽氣，拆回自己放的不算
      if (a.ch === '草' && Math.random() < 0.1) { const sp = this.ents.spawnSpiderNear(a.x, a.y); if (sp) this.message(sp.venom ? '草裡爬出一隻紅的毒蛛！牠撲過來了。' : '草裡爬出一隻蜘蛛。別惹牠。'); }
      this.fx.push({ type: 'float', x: a.x, y: a.y, text: '+' + got.join(' '), color: G.INK.black, t: 0, dur: 0.9 });
      SFX.absorb();
      this.action = null;
      if (this.keys.has('KeyE') || this.keys.has('Space')) this.pressGather(true);
    }
    catchFish(e) {
      if (Math.random() < (this.has('竹筏') || this.player.sailing ? 0.85 : 0.55)) {
        if (!this.canAdd('魚', 1)) { this.message('囊已滿。'); return; }
        this.ents.remove(e); this.addItem('魚', 1); this.addCourage(1); this.message('捉到一條魚。'); SFX.absorb();
      } else { this.message('魚溜了。'); e.moveT = 0; }
    }
    attack(e) {
      if (e.tame) { this.message('那是你的' + this.beastName(e) + '，下不了手。'); return; }   // v0.8.21 使用者定：什麼武器都打不中自己的寵物
      const p = this.player, base = this.heldDmg();
      if (!base) { this.message('徒手打不了「' + this.beastName(e) + '」。石子磨石可成刀、劍，放進具欄。'); return; }
      if (p.atkT > 0 || this.afraid()) return;
      if (p.sta < 1) { this.message('力有未逮，且歇一歇。'); return; }
      const ft = this.facing(), part = e.type === '修蛇' ? this.ents.snakePart(e, ft.x, ft.y) || 'head' : null;   // 修蛇：打在頭還是尾（v0.8.16）
      const shield = this.ents.shielded(e, p.x, p.y), dmg = U.r4(base * this.dmgMult() * (shield ? TOOTH_SHIELD : 1) * (part ? this.ents.snakeK(e, part) : 1) * this.gongTake(e, this.heldTool()));   // 鑿齒的盾：正面只吃一成（v0.8.5）；共工照兵器打折（v0.9）
      if (e.type === '鷹') e.angryT = 12;
      p.atkT = 0.45; p.sta = Math.max(0, p.sta - this.workDrain());
      e.hp -= dmg; e.angry = true; e.angryAt = this.world.time; this.wearTool(); SFX.write(); this.renderer.shake = 0.15;
      this.fx.push({ type: 'float', x: e.x, y: e.y, text: '−' + this.shown('dmg', dmg, e), color: G.INK.red, t: 0, dur: 0.7 });
      if (e.hp <= 0) { this.kill(e); return; }
      const left = this.shownHp(e);
      if (e.type === '鹿') e.moveT = 0;
      else if (e.type === '虎' || e.type === '豹') { e.calm = 2; e.moveT = 0.3; this.message(e.type + '受創而退（還有 ' + left + '）。'); }
      else if (e.type === '龜') { e.moveT = 0; this.message('龜挨了一下，往海裡逃（還有 ' + left + '）。'); }
      else if (part === 'tail') this.message('打在' + this.beastName(e) + '的尾上，只吃' + (this.ents.snakeK(e, 'tail') < 0.5 ? '四分之一' : '四分之三') + '（還有 ' + left + '）。打頭吧。');
      else if (part === 'head' && e.state === 'coil') this.message('牠纏著船，頭露在外面——多吃五成（還有 ' + left + '）。');
      else if (e.type === '共工') this.message('打在' + this.beastName(e) + '身上' + this.gongTakeText(e, this.heldTool()) + '（還有 ' + left + '）。');
      else if (e.type === '齒') this.message(shield ? '打在鑿齒的盾上，只有一成（還有 ' + left + '）。繞到牠身側或背後去。' : '繞過盾，打在鑿齒身上（還有 ' + left + '）。');
      else this.message(this.beastName(e) + '（還有 ' + left + '）。');
    }
    // 彈弓：面前五十度、九格內最近的獸；中間不能有磚石山灶這類擋路的東西（水與草木不擋），站在台上就越得過
    slingTarget() {
      const p = this.player, w = this.world; if (this.heldTool() !== '弓') return null;
      const fl = Math.hypot(p.fx, p.fy) || 1, fx = p.fx / fl, fy = p.fy / fl, high = w.get(p.x, p.y) === '台';
      let best = null, bd = Infinity;
      for (const e of this.ents.list) {
        if ((SLING_PREY.indexOf(e.type) < 0 && e.type !== '修蛇' && e.type !== '大風' && e.type !== '共工') || (e.under && !(e.shiftT > 0)) || e.tame || (e.fade !== undefined && e.fade < 1)) continue;   // 修蛇潛著打不到（v0.8.16）；天上的大風打得到（v0.8.25）；共工潛在地裡也打不到（v0.9）
        const dx = e.x - p.x, dy = e.y - p.y, dc = Math.max(Math.abs(dx), Math.abs(dy)); if (dc < 1 || dc > SLING_RANGE) continue;
        const dl = Math.hypot(dx, dy); if ((dx * fx + dy * fy) / dl < 0.64) continue;
        if (!high && !this.ents.aloft(e) && !this.lineClear(p.x, p.y, e.x, e.y)) continue;
        if (dl < bd) { bd = dl; best = e; }
      }
      return best;
    }
    skyTarget() {        // 青冥落羽（v0.8.25）：面前十格內最近的一隻，天上的先挑；天上的不看擋路，地上的要看得見
      const p = this.player; if (this.heldTool() !== '弋') return null;
      const fl = Math.hypot(p.fx, p.fy) || 1, fx = p.fx / fl, fy = p.fy / fl; let best = null, bd = Infinity;
      for (const e of this.ents.list) {
        if ((SLING_PREY.indexOf(e.type) < 0 && e.type !== '修蛇' && e.type !== '大風' && e.type !== '共工') || (e.under && !(e.shiftT > 0)) || e.tame || (e.fade !== undefined && e.fade < 1)) continue;
        const dx = e.x - p.x, dy = e.y - p.y, dc = e.type === '共工' ? this.ents.rectDist(e, p.x, p.y) : Math.max(Math.abs(dx), Math.abs(dy)); if (dc < 1 || dc > BOW_RANGE) continue;
        const dl = Math.hypot(dx, dy); if ((dx * fx + dy * fy) / dl < 0.64) continue;
        const sky = this.skyFolk(e); if (!sky && !this.lineClear(p.x, p.y, e.x, e.y)) continue;
        const sc = dl - (sky ? 100 : 0); if (sc < bd) { bd = sc; best = e; }
      }
      return best;
    }
    bowShot(e) {         // 天上的全傷、陸上海中的一成；射中天上的，絲纏住牠（繳）
      const p = this.player;
      if (this.level() < HAMMER_LEVEL) { this.message(BOW + '要膽氣卅一重才挽得開。'); SFX.fail(); return; }
      if (p.atkT > 0 || this.afraid()) return;
      if (p.sta < 3) { this.message('力有未逮，且歇一歇。'); return; }
      const sky = this.skyFolk(e), shield = this.ents.shielded(e, p.x, p.y), d = U.cheb(e.x, e.y, p.x, p.y);
      const gong = e.type === '共工', dmg = U.r4(this.godDmg(BOW) * this.dmgMult() * (gong ? this.gongTake(e, '弋') : sky ? 1 : BOW_GROUND) * (shield ? TOOTH_SHIELD : 1) * (e.type === '修蛇' ? this.ents.snakeK(e, 'head') : 1));   // 共工照模式：空全傷、本相要換成空一倍半、其餘三成（v0.9）
      p.atkT = 1.5; p.sta = Math.max(0, p.sta - 3 * this.workDrain()); this.wearTool(); SFX.write();
      e.hp -= dmg; e.angry = true; e.angryAt = this.world.time; if (e.type === '鷹') e.angryT = 12;
      this.fx.push({ type: 'shot', arrow: true, x: p.x, y: p.y, x1: e.x, y1: e.y, t: 0, dur: 0.1 + d * 0.02 });
      this.fx.push({ type: 'write', x: p.x + Math.sign(e.x - p.x), y: p.y + Math.sign(e.y - p.y), ch: '弋', color: G.INK.qing, t: 0, dur: 0.6 });   // v0.8.32：射出那一下寫「弋」，像燭龍焚溟寫「焚」；寫在朝牠的那一格，寫在腳下會跟「人」疊成一個像「犬」的字
      this.fx.push({ type: 'feather', x: e.x, y: e.y, fx0: p.x, fy0: p.y, n: sky ? 5 : 2, sd: Math.random() * 100, t: -(0.1 + d * 0.02), dur: 1.7 });   // 等矰飛到才落   // v0.8.31：青光一圈、羽紛紛落下（天上的五片，地上海中的兩片）
      this.fx.push({ type: 'float', x: e.x, y: e.y, text: '−' + this.shown('dmg', dmg, e), color: G.INK.red, t: 0, dur: 0.8 });
      if (e.hp <= 0) { this.kill(e); return; }
      const high = e.type === '雕' ? e.mode !== 'tied' : e.type === '大風' ? ['sky', 'rise', 'dive'].indexOf(e.state) >= 0 : false;
      if (sky && high && !(e.tieCD > 0)) {   // 繳：矰尾的絲纏住，落到地上 BOW_TIE 息
        e.tiedT = BOW_TIE; e.tieCD = BOW_TIE_GAP; e.moveT = 0.2; if (e.type === '雕') e.mode = 'tied'; else e.state = 'tied';
        this.fx.push({ type: 'write', x: e.x, y: e.y, ch: '繳', color: G.INK.red, t: 0, dur: 0.7 });
        this.message('青冥落羽射中' + this.beastName(e) + '（還有 ' + this.shownHp(e) + '），絲纏住了牠（繳）——落在地上 ' + BOW_TIE + ' 息，近身打！');
      } else if (gong) this.message('青冥落羽射中' + this.beastName(e) + this.gongTakeText(e, '弋') + '（還有 ' + this.shownHp(e) + '）。');
      else this.message('青冥落羽射中' + this.beastName(e) + (sky ? '' : '——不在天上，只有一成') + '（還有 ' + this.shownHp(e) + '）。' + (sky && high && e.tieCD > 0 ? '牠剛掙開絲，一時纏不住。' : ''));
    }
    lineClear(x0, y0, x1, y1) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let i = 1; i < n; i++) { const d = DB[this.world.get(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n))]; if (d && d.walk <= 0 && d.kind !== 'water') return false; }
      return true;
    }
    afraid() { const p = this.player; if (!(p.fearT > 0) || this.test) return false; this.message('懼！心裡發慌，出不了手（還有 ' + Math.ceil(p.fearT) + ' 息）。'); return true; }   // 懼（v0.8.6，心的控制）
    slingShot(e) {
      const p = this.player;
      if (p.atkT > 0 || this.afraid()) return;
      if (!this.has('石子')) { this.message('彈弓要石子當彈。'); SFX.fail(); return; }
      if (p.sta < 1) { this.message('力有未逮，且歇一歇。'); return; }
      p.atkT = SLING_CD; p.sta = Math.max(0, p.sta - this.workDrain()); this.removeItem('石子', 1); this.wearTool();
      const shield = this.ents.shielded(e, p.x, p.y), dmg = U.r4(SLING_DMG * this.dmgMult() * (shield ? TOOTH_SHIELD : 1) * (e.type === '修蛇' ? this.ents.snakeK(e, 'head') : 1) * this.gongTake(e, '弓')), d = U.cheb(e.x, e.y, p.x, p.y);
      e.hp -= dmg; e.provoked = PROVOKE_TIME; e.angry = true; e.angryAt = this.world.time; e.calm = 0; if (e.type === '鷹') e.angryT = 12;
      this.fx.push({ type: 'shot', x: p.x, y: p.y, x1: e.x, y1: e.y, t: 0, dur: 0.12 + d * 0.03 });
      this.fx.push({ type: 'float', x: e.x, y: e.y, text: '−' + this.shown('dmg', dmg, e), color: G.INK.red, t: 0, dur: 0.7 }); SFX.write();
      if (e.hp <= 0) { this.kill(e); return; }
      const charges = '虎豹狼蛇蛛鷹豬牛'.indexOf(e.type) >= 0 || (e.type === '蟾' && e.venom);
      this.message('石子打中「' + this.beastName(e) + '」' + (shield ? '的盾' : '') + '（還有 ' + this.shownHp(e) + '）。' + (!charges ? '' : d <= 7 ? '牠惱了，撲過來！' : '牠惱了，你一進七格內就撲過來。'));
    }
    platformRecoil(e) {   // 站在台上：撲上來的獸撞在台邊，掉命上限的一成、慢五息；回傳掉了多少
      if (!e || '蜃齒雕鷹畢'.indexOf(e.type) >= 0 || this.bossGlyph(e.type) || this.world.get(this.player.x, this.player.y) !== '台' || !(DB[e.type] && DB[e.type].hp) || '台階'.indexOf(this.world.get(e.x, e.y)) >= 0) return 0;   // 從階、台上過來的不算撞在台邊（v0.6.8）
      const r = U.r4(DB[e.type].hp * PLATFORM_RECOIL), sh = this.shown('dmg', r, e); e.hp -= r; e.slowT = PLATFORM_SLOW;
      this.fx.push({ type: 'float', x: e.x, y: e.y, text: '−' + sh, color: G.INK.red, t: 0, dur: 0.8 });
      if (e.hp <= 0) this.kill(e);
      return sh;   // 回傳顯示的整數（訊息照用）
    }
    hammerStrike(targets) {
      const p = this.player;
      if (this.level() < HAMMER_LEVEL) { this.message(HAMMER + '要膽氣卅一重才掄得動。'); SFX.fail(); return; }
      if (p.atkT > 0 || this.afraid()) return;
      if (p.sta < 3) { this.message('力有未逮，且歇一歇。'); return; }
      if (!targets.length) { this.message('三格之內，並無走獸。'); return; }
      const full = U.r4(this.godDmg(HAMMER) * this.dmgMult()), half = U.r4(this.godDmg(HAMMER) * this.dmgMult() * 0.5);
      p.atkT = 1.5; p.sta = Math.max(0, p.sta - 3 * this.workDrain()); this.wearTool(); this.renderer.shake = 0.8; SFX.tiger();
      const gong = targets.find(o => o.type === '共工'); if (gong) gong.noPullAt = U.r4(this.world.time + GONG_NOPULL);   // 打中共工一下，七息內拖不動你（v0.9）
      const gongNote = gong ? this.beastName(gong) + (this.gongTakeText(gong, '鎚') || '全傷') + (gong.mode === 'land' && !(gong.shiftT > 0) ? '，' + GONG_NOPULL + ' 息內拖不動你' : '') + '；' : '';
      const slain = this.godHits(targets, (o) => o.type === '共工' ? U.r4(full * this.gongTake(o, '鎚')) : this.seaFolk(o) || this.skyFolk(o) ? half : full);   // v0.8.25：天上之物也減半（對空神兵做出來了）；共工照模式（v0.9）
      this.fx.push({ type: 'thunder', x: p.x, y: p.y, r: HAMMER_RANGE, tg: targets.map(o => [o.x, o.y]), sd: Math.random() * 100, t: 0, dur: 1.2 });   // v0.8.31：雷字、擴散的雷紋、劈到獸身上的閃電
      this.message('九閽鳴雷落地：' + gongNote + targets.length + ' 頭獸同受 ' + fmt(full) + ' 傷（海中天上之物減半，' + fmt(half) + '）' + (slain ? '，' + slain + ' 頭斃命' : '') + '。');
    }
    // 燭龍焚溟：三格內諸獸同受灼燒；海中之物全傷，陸上天上減半
    fireStrike(targets) {
      const p = this.player;
      if (this.level() < HAMMER_LEVEL) { this.message(SEA_GOD + '要膽氣卅一重才揮得動。'); SFX.fail(); return; }
      if (p.atkT > 0 || this.afraid()) return;
      if (p.sta < 3) { this.message('力有未逮，且歇一歇。'); return; }
      if (!targets.length) { this.message('三格之內，並無走獸。'); return; }
      const full = U.r4(this.godDmg(SEA_GOD) * this.dmgMult()), half = U.r4(this.godDmg(SEA_GOD) * this.dmgMult() * 0.5);
      p.atkT = 1.5; p.sta = Math.max(0, p.sta - 3 * this.workDrain()); this.wearTool(); this.renderer.shake = 0.6; SFX.tiger();
      const gong = targets.find(o => o.type === '共工'), gongNote = gong ? this.beastName(gong) + (this.gongTakeText(gong, '焚') || '全傷') + '；' : '';
      const slain = this.godHits(targets, (o) => o.type === '共工' ? U.r4(full * this.gongTake(o, '焚')) : this.seaFolk(o) ? full : half);   // 共工照模式（v0.9）
      this.fx.push({ type: 'write', x: p.x, y: p.y, ch: '焚', color: G.INK.red, t: 0, dur: 0.6 });
      this.fx.push({ type: 'scorch', x: p.x, y: p.y, marks: this.scorchMarks(p.x, p.y), t: 0, dur: 2.6 });   // v0.8.31：入水的熔痕
      let selfNote = '';
      if (p.sailing && p.ship) {             // 火也燎到自己的船：怪物所受的十分之一
        const self = U.r4(full * GOD_SELF), selfShown = this.shown('ship', self); this.shipLoss(p.ship, self); selfNote = '；火燎到自己的船 −' + selfShown;
        this.fx.push({ type: 'float', x: p.x, y: p.y + 1, text: '船 −' + selfShown, color: G.INK.red, t: 0, dur: 0.9 });
        if (p.ship.hp <= 0) { this.message('燭龍的火燒穿了自己的船！'); this.wreck(); return; }
      }
      this.message('燭龍焚溟：' + gongNote + targets.length + ' 頭同受灼燒，海中之物 ' + fmt(full) + '、陸上天上 ' + fmt(half) + (slain ? '，' + slain + ' 頭斃命' : '') + selfNote + '。');
    }
    scorchMarks(cx, cy) {   // 燭龍焚溟的熔痕（v0.8.31）：從身邊往外燒出八道裂痕到三格外，每一折記下底下是不是水（水上的冒白汽）
      const marks = [], n = 8, a0 = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const a = a0 + i * Math.PI * 2 / n + (Math.random() - 0.5) * 0.5, len = HAMMER_RANGE * (0.75 + Math.random() * 0.35), pts = [[0, 0]];
        for (let k = 1; k <= 4; k++) { const r = len * k / 4, j = (Math.random() - 0.5) * 0.6; pts.push([U.r4(Math.cos(a + j) * r), U.r4(Math.sin(a + j) * r)]); }
        marks.push({ pts, wet: pts.map(([dx, dy]) => { const d = DB[this.world.get(Math.round(cx + dx), Math.round(cy + dy))]; return !!d && d.kind === 'water'; }) });
      }
      return marks;
    }
    godHits(targets, dmgOf) {
      let slain = 0;
      for (const o of targets) {
        const p = this.player, dmg = U.r4(dmgOf(o) * (o.type === '修蛇' ? this.ents.snakeK(o, U.cheb(o.x, o.y, p.x, p.y) <= HAMMER_RANGE ? 'head' : 'tail') : 1)); o.hp -= dmg; o.angry = true; o.angryAt = this.world.time; if (o.type === '鷹') o.angryT = 12;   // 修蛇：頭在三格內照頭算，只搆得到尾照尾算（v0.8.16；v0.8.20 修：這句註解原本吃掉了後面挨打發怒那幾句）
        this.fx.push({ type: 'float', x: o.x, y: o.y, text: '−' + this.shown('dmg', dmg, o), color: G.INK.red, t: 0, dur: 0.8 });
        if (o.hp <= 0) { this.kill(o); if (o.hp <= 0) slain++; }   // 立極的共工影還沒到第三段，kill() 把命壓回線上，不算斃命（v0.9.10）
      }
      return slain;
    }
    kill(e) {
      if (MINI_TYPES.indexOf(e.type) >= 0 && !e.shade) { this.miniZero = (this.miniZero || []).concat([{ k: (this.miniN = (this.miniN || 0) + 1), name: this.beastName(e), max: e.max || DB[e.type].hp, until: performance.now() + ZERO_MS }]); }   // 小魔王的命條歸零停五秒（v0.8.21）
      if (e.shade) { this.shadeDown(e); return; }        // 玄武吐的墨影（v0.8.8）
      if (this.bossGlyph(e.type)) { this.bossDown(e); return; }   // 大魔王（v0.8.7 封豨、v0.8.16 修蛇）
      const drops = { '鹿': ['肉', 2], '狸': ['肉', 1], '虎': ['肉', 3], '豹': ['肉', 2], '狼': ['肉', 2], '蛇': ['蛇肉', 1], '蟾': [e.venom ? '毒蟾肉' : '蟾蜍肉', 1], '龜': ['龜甲', 1], '豬': ['肉', 3], '牛': ['肉', 4] }[e.type];
      const cour = { '鹿': 3, '狸': 2, '虎': 30, '豹': 15, '狼': 15, '蛇': 7.5, '蛛': 5, '蟾': 3, '鷹': 5, '龜': 3, '蜃': 40, '豬': 15, '牛': 10, '齒': 40, '雕': 40, '畢': 40 }[e.type] || 2;   // v0.4.13：虎加倍、豹狼蛇一倍半；v0.6 野豬同豹、野牛十
      const hostile = e.type !== '鹿' && e.type !== '龜' && e.type !== '狸', gain = hostile ? cour * (this.isNight() ? KILL_NIGHT : KILL_DAY) : cour;   // 敵對的：白日八成、夜裡加半成；難度加成在 addCourage 裡乘，最後一次取整
      this.ents.remove(e); this.stats.kills++; const got = this.addCourage(gain, hostile ? 'kill' : 'other');
      const dropAt = drops ? this.giveNear(drops[0], drops[1]) : null; if (dropAt) this.message('囊滿了，' + drops[0] + '用小囊包著擱在' + dropAt.where + '。');   // v0.8.8：囊滿時不再憑空消失
      const fat = (e.type === '豬' || e.type === '牛') && U.trueRand() < FAT_P;   // 野豬野牛：35% 真隨機得一份油脂（v0.8.3），要有空的麻布包才裝得走
      const fatLost = fat && this.addItem('油脂', 1) > 0, fatText = fat ? (fatLost ? '，割下一塊油脂，可沒有空的麻布包，包不住，只好丟了' : '，還割下一份油脂裝進麻布包') : '';
      if (e.type === '龜') { const p = this.player; p.san = Math.max(0, p.san - TURTLE_SAN); this.toast('殺龜不祥', '龜是靈物，殺之心裡不安：愜意減 ' + TURTLE_SAN + '。留下龜甲。'); SFX.fuse(); return; }
      if ('虎豹狼'.indexOf(e.type) >= 0 && U.trueRand() < this.skullP) {      // 獸首骨：16% 真隨機，一個或兩個
        const n = U.trueRand() < SKULL_TWO ? 2 : 1, sk = this.giveNear(e.type + '首骨', n);
        this.toast('得了' + e.type + '首骨' + (n > 1 ? ' ×' + n : ''), (sk ? '囊滿了，用小囊包著擱在' + sk.where + '。' : '') + '放在船頭鎮船：' + ITEMS[e.type + '首骨'].ward + ' 日內蜃不敢撞船。在船上選中按 V，或面向停著的船按 F。');
      }
      if (e.type === '齒') {                  // 鑿齒（v0.8.5）：留下殘體一或二塊，九塊鑄虎符
        const p = this.player; p.codex = p.codex || {}; p.codex['鑿齒'] = (p.codex['鑿齒'] || 0) + 1;
        const n = U.trueRand() < SHARD_TWO ? 2 : 1, at = this.stashItem('鑿齒殘體', n), have = this.count('鑿齒殘體');
        this.toast('鑿齒斃', '盾倒在一邊。膽氣 +' + this.shown('cour', got) + '。得鑿齒殘體 ' + n + ' 塊' + (at ? '（囊滿了，用小囊包著擱在' + at.where + '）' : '（囊裡共 ' + have + ' 塊）') + '。九塊加鐵三、鎢鋼一，在火旺的鼎裡鑄成一枚虎符' + (p.bai ? '。' : '，帶去虎嶺求教白虎。')); SFX.fuse(); this.buildBag(); return;
      }
      if (e.type === '畢') {                  // 畢方（v0.8.25）：留下畢方羽一或二根，對空神兵的料；牠燒起的訛火跟著熄
        const p = this.player; p.codex = p.codex || {}; p.codex['畢方'] = (p.codex['畢方'] || 0) + 1; this.fires = []; this.fireMarks = [];
        const n = U.trueRand() < SHARD_TWO ? 2 : 1, at = this.stashItem('畢方羽', n), have = this.count('畢方羽');
        this.toast('畢方斃', '訛火都熄了。膽氣 +' + this.shown('cour', got) + '。得畢方羽 ' + n + ' 根' + (at ? '（囊滿了，用小囊包著擱在' + at.where + '）' : '（囊裡共 ' + have + ' 根）') + '。畢方羽六、鎢鋼三、竹六、麻布三，膽氣卅一重造得出對空神兵青冥落羽。'); SFX.fuse(); this.buildBag(); return;
      }
      if (e.type === '雕') {                  // 蠱雕（v0.8.6）：留下殘體一或二塊，九塊煉朱羽
        const p = this.player; p.codex = p.codex || {}; p.codex['蠱雕'] = (p.codex['蠱雕'] || 0) + 1;
        const n = U.trueRand() < SHARD_TWO ? 2 : 1, at = this.stashItem('蠱雕殘體', n), have = this.count('蠱雕殘體');
        this.toast('蠱雕斃', '哭聲停了。膽氣 +' + this.shown('cour', got) + '。得蠱雕殘體 ' + n + ' 塊' + (at ? '（囊滿了，用小囊包著擱在' + at.where + '）' : '（囊裡共 ' + have + ' 塊）') + '。九塊加精煤一、火蝕一，在火旺的鼎裡煉成一根朱羽' + (p.zhu ? '。' : '，帶去丹穴求教朱雀。')); SFX.fuse(); this.buildBag(); return;
      }
      if (e.type === '蜃') {                  // 蜃死，吐出的霧也收回去；留下蜃殘體一或二塊（v0.8.1 起；九塊熬一顆蜃珠，東海青龍要的）
        for (const f of [...this.world.fogs.values()]) if (f.sea) this.world.removeFog(f.id);
        const p = this.player, first = !p.codex; p.codex = p.codex || {}; p.codex['蜃'] = (p.codex['蜃'] || 0) + 1;   // 第一頭蜃：翻開魔物誌（v0.8.2）
        if (first) setTimeout(() => this.toast('魔物誌', '斃了第一頭蜃，見聞錄（J）裡多了一冊「魔物誌」：遇過的魔物，寫著牠是什麼、會些什麼。', 9000), 1200);
        const n = U.trueRand() < SHARD_TWO ? 2 : 1, at = this.stashItem('蜃殘體', n), have = this.count('蜃殘體');
        this.toast('蜃斃', '海上的霧收了。膽氣 +' + this.shown('cour', got) + '。得蜃殘體 ' + n + ' 塊' + (at ? '（囊滿了，用小囊包著擱在' + at.where + '）' : '（囊裡共 ' + have + ' 塊）') + '。九塊加海水瓶三、淡水瓶一，在火旺的鼎裡熬成一顆蜃珠' + (this.player.azure ? '。' : '，帶去東海求教青龍。')); SFX.fuse(); return;
      }
      this.message((({ '鹿': '獵得一鹿，得肉二。', '狸': '狸死了，得肉一。', '虎': '虎斃，得肉三。', '豹': '豹斃，得肉二。', '狼': '狼斃，得肉二。', '蛇': '蛇斃，留下屍身。', '蛛': e.venom ? '毒蛛死了。' : '蜘蛛死了，什麼也沒留下。', '蟾': '蟾蜍死了。', '鷹': '鷹落了下來。', '龜': '龜死了，留下龜甲。', '豬': '野豬斃，得肉三' + fatText + '。', '牛': '野牛斃，得肉四' + fatText + '。' })[e.type] || '斃。') + (hostile ? '膽氣 +' + this.shown('cour', got) + (this.isNight() ? '（夜裡加半成）' : '（白日八成）') : ''));
      if (e.type !== '鹿') SFX.fuse();
    }
    // 獸的撲咬與毒咬（由實體呼叫）
    beastName(e) { return e.shade || (DB[e.type] && DB[e.type].name) || (e.type === '蛛' && e.venom ? '毒蛛' : e.type); }   // 玄武吐的墨影（v0.8.8）叫豨影、豕影   // 野豬、野牛、毒蛛
    hit(e, dmg) {
      const p = this.player, d = this.hurt(dmg * (this.totemNear(e.x, e.y) ? 5 / 3 : 1), '力', { name: this.beastName(e) });   // v0.6.2：精確到小數點後四位，畫面上才四捨五入
      p.hurtT = 6; this.renderer.shake = 0.5; SFX.beast(e.type); this.armorHit();
      const rc = this.platformRecoil(e);
      this.message(this.beastName(e) + '！命 −' + this.shown('hurt', d) + '。' + (rc ? '牠撞在台邊，−' + rc + '，慢了下來。' : ''));
    }
    windowShare() {   // 睡覺這間屋子：窗數 ÷ 屋內面積（能走的格數）；不在圍起來的屋裡回 0（v0.6.2 使用者定）
      const p = this.player, sh = this.world.roomShell(p.x, p.y); if (!sh || !sh.area) return 0;
      let win = 0; for (const ch of sh.values()) if (ch === '窗') win++;
      return win / sh.area;
    }
    windowBonus(share) { return (WINDOW_SAN.find(([at]) => share > at) || [0, 0])[1]; }   // 窗／屋裡面積：過 1/9 +5%、過 1/7 +12%、過 1/5 +20%
    ghostBurned(e) {   // 魄被地上的光或龍煙滅（v0.6.5）：燈帽少兩息；夜裡人在屋外，膽氣長這一重的 1%
      const p = this.player; if (p.dead) return;
      const hat = p.worn['帽']; if (hat && hat.fuel > 0) { hat.fuel = Math.max(0, U.r4(hat.fuel - GHOST_HAT_COST)); this.barSig = ''; }
      if (!this.isNight() || this.indoors()) return;
      const got = this.addCourage(U.r4(levelCost(this.level()) * GHOST_COUR), 'ghost');
      if (got > 0) { this.stats.ghosts = (this.stats.ghosts || 0) + 1; this.fx.push({ type: 'float', x: e.x, y: e.y, text: '魄滅 · 膽 +' + this.shown('cour', got), color: G.INK.gold, t: 0, dur: 1.4 }); }
    }
    // 一再出現的數（v0.6.8 使用者定）：這一回四捨五入顯示，零頭記在 owner（生靈）或遊戲身上；攢到過半就多顯示一點，多顯示的下回扣回來。
    // 例：每下 53.13 → −53 −53 −53 −53 −54（零頭 0.52 湊成 1，多扣的記成 −0.35）……顯示的總和永遠跟真的總和差不到半點
    shown(key, v, owner) {
      const box = owner || this.carry || (this.carry = {}), k = '_c' + key, c = box[k] || 0;
      const base = rnd(v), extra = rnd(c), out = base + extra;
      box[k] = U.r4(c - extra + (v - base)); return out;
    }
    shownHp(e) { return rnd(e.hp + (e._cdmg || 0)); }   // 生靈還有多少命（照顯示過的傷害算：本來的命減掉看到的那些數）
    sanUp(n) { const p = this.player; return U.r4(n * (p.sanBoostUntil > this.world.time ? 1 + SAN_BOOST : 1)); }   // 愜意回復：睡過窗夠的屋子後一整天快 5%
    wallRammed(e, x, y, r) {   // 耐久不顯示：只在磚成了墟、窗門剩一半時說一聲
      const p = this.player, ch = this.world.get(x, y); this.renderer.shake = 0.25; SFX.ram(); this.fx.push({ type: 'float', x, y, text: '撞', color: G.INK.red, t: 0, dur: 0.6 });
      if (U.cheb(x, y, p.x, p.y) > 10) return;
      const who = this.beastName(e); this.message(r === 'ruined' ? who + '把磚撞成了「墟」，快塌了！' : r === 'cracked' ? who + '撞得「' + ch + '」搖搖欲墜，再一下就碎。' : who + '撞在「' + ch + '」上。');
    }
    wallBroken(e, x, y) {   // 野牛撞碎人造的磚、門、窗：什麼也不剩
      const w = this.world, ch = w.get(x, y); w.set(x, y, '白'); this.renderer.shake = 0.45; SFX.ram(); SFX.beast('牛');
      this.fx.push({ type: 'write', x, y, ch: '碎', color: G.INK.red, t: 0, dur: 0.6 });
      this.message(this.beastName(e) + '撞碎了「' + ch + '」！' + (DB[ch] && DB[ch].fence ? '籬開了口子，獸進得了田。' : '屋子開了口子。'));
    }
    beastCall(e) {   // 敵對的獸走近八格內，先聽見牠一聲（各有各的聲音）；一點五息內只響一次，免得吵
      const now = this.world.time; if (now - (this.lastCall || -99) < 1.5) return;
      this.lastCall = now; SFX.beast(e.type, true);
    }
    turtleGone(e, d) { if (d <= 14) this.message('龜潛進海裡，不見了。'); }
    bite(e, per) {
      const p = this.player, now = this.world.time, per2 = U.r4(per * (this.totemNear(e.x, e.y) ? 5 / 3 : 1) * this.takenMult());   // 精確到小數點後四位
      this.armorHit(); this.platformRecoil(e);
      if (this.ironFull()) { p.hurtT = 3; this.renderer.shake = 0.2; SFX.fail(); this.message(this.beastName(e) + '咬在鐵甲上，毒牙咬不進。'); return; }
      p.biteN = (now - p.biteLast <= 6) ? p.biteN + 1 : 1; p.biteLast = now; this.stats.bites++;
      this.poison(per2, (DB[e.type] && DB[e.type].venomT) || 5); p.hurtT = 6;   // 中毒幾秒：蛇與毒蛛九秒（v0.6.1），蟾五秒
      this.renderer.shake = 0.3; if (e.type === '蛇' || e.type === '蛛') SFX.beast(e.type); else SFX.fail();
      if (p.biteN >= 15 && !this.test) { p.hp = 0; this.message('連咬十五口，毒發身亡。'); return; }
      const vt = (DB[e.type] && DB[e.type].venomT) || 5;
      this.message(this.beastName(e) + '咬了你一口（連咬 ' + p.biteN + '）。中毒 ' + vt + ' 息，共 −' + this.shown('poison', per2 * vt) + '。藥可解。');
    }
    poison(per, sec, by) { const p = this.player; if (this.ironFull()) return; if (by) p.poisonBy = by; else if (per >= p.poisonPer) p.poisonBy = null; p.poisonPer = Math.max(p.poisonPer, per); p.poisonT = Math.max(p.poisonT, sec); }   // by：魔王的毒（v0.8.16 修蛇的毒涎）

    // ---------- 放（F） ----------
    pressPlace() {
      const p = this.player, w = this.world, s = this.held();
      if (!this.canAct()) return;
      if (p.swimming && this.holdPick()) { const st = this.holdPick(); this.startDeploy(st.n, st); return; }   // 落水了：把船艙裡選中的（沒選就第一艘）放下水（v0.8.3；v0.8.19 船在船艙）
      if (this.fishing) { this.rodPress(); return; }   // 拋了竿：F 是提竿、收線、收竿（v0.9.17）
      // v0.8.15 使用者定：面前是灶、鼎，不管手上拿什麼都先用它（開界面）；轉開、走遠了不正面對著，F 才處理手上的東西
      { const t0 = this.facing(); if (w.get(t0.x, t0.y) === '灶' && !p.sailing && !p.swimming) { this.openStove(t0); return; } }   // 灶：開界面，在裡面添柴、烤、燒、煉
      { const t0 = this.facing(); if (w.get(t0.x, t0.y) === '鼎' && !p.sailing && !p.swimming) { this.openDing(t0); return; } }   // 鼎：開界面，在裡面添柴、煉丹、熬、鑄、煉（v0.8.14）
      { const t0 = this.facing(), d0 = DB[w.get(t0.x, t0.y)]; if (d0 && d0.net && !p.swimming) { this.mendNet(w.netAt(t0.x, t0.y)); return; } }   // 網：面向按 F 用棉麻加固
      if (this.heldRod() && !p.swimming) { this.castLine(this.heldRod()); return; }   // 拿著釣竿、大鉤：F 拋竿（船上也行，v0.9.17）
      { const t0 = this.facing(), hs = (s && ITEMS[s.n]) || {}, rec0 = !p.sailing && !p.swimming && w.shipAt(t0.x, t0.y);   // v0.8.18 使用者定：面向停著的船再按 F 收回（拿著首骨、木板照舊放船頭、補船）
        if (rec0 && !hs.ward && !(s && s.n === '木板')) { this.stowShip(rec0); return; }
        if (p.sailing && !(hs.tile && DB[hs.tile] && DB[hs.tile].net)) { this.stowShip(null); return; } }   // 船上按 F：碰到岸就連人帶船收回（拿著網照舊撒網）
      if (!p.sailing && !p.swimming && p.holdSel >= 0 && this.holdPick()) { this.launchShip(this.holdPick()); return; }   // 船艙裡選了一艘：F 放下水（v0.8.19）
      if (!s) { this.message('囊中空空。'); return; }
      const name = s.n, t = this.facing(), base = w.get(t.x, t.y), bd = DB[base], it = ITEMS[name] || {};
      if (p.swimming) { this.message('游泳時騰不出手，先上岸。'); return; }
      if (base === '舟' && (it.ward || name === '木板')) { const rec = w.shipAt(t.x, t.y); if (it.ward) this.mountSkull(rec, name, s); else this.repairShip(rec); return; }
      if (p.sailing && !(it.tile && DB[it.tile] && DB[it.tile].net)) { this.message('船上做不了這個，先靠岸。'); return; }   // 船上可以下網
      const fail = () => this.fx.push({ type: 'fail', x: t.x, y: t.y, t: 0, dur: 0.6 });
      const ent = this.ents.at(t.x, t.y);
      if (ent && ent.type === '鷹' && name === '魚') { this.feedEagle(ent); return; }
      if (ent && ent.type === '狸' && name === '魚') { this.feedCat(ent); return; }   // v0.9.19
      if (it.seed) { this.sow(t, it.seed); return; }   // 五穀：面向田下種（v0.9.18）
      if (name === '灰' && (base === '田' || bd.crop)) { this.ashField(t); return; }   // 草木灰撒在田裡，地力 +1
      if (it.slot) { this.wearItem(p.sel); return; }
      if (it.tool && it.dur) { this.equipFromBag(p.sel); return; }
      if (it.tool || it.kind === 'wear') { this.message('「' + name + '」' + (it.light ? '拿在手上就亮。' : '在囊中即生效。')); return; }
      if ((name === '磚' && base === '墟') || ((name === '窗' || name === '門') && base === name && w.wallHurt(t.x, t.y))) {   // 補：磚直接砌在墟上、新窗新門換掉撞裂的（v0.6.2 使用者定）
        w.set(t.x, t.y, name); w.wallHp.delete(U.key(t.x, t.y)); this.removeItem(name, 1);
        this.message(base === '墟' ? '磚砌在墟上，又是一堵整磚。' : '換上新的「' + name + '」，撞裂的那個拆了。'); SFX.write();
        this.fx.push({ type: 'write', x: t.x, y: t.y, ch: name, color: DB[name].ink, t: 0, dur: 0.35 }); return;
      }
      if (base === '偶' && name === '偶') {         // 續稻草人
        w.addScarecrow(t.x, t.y); this.removeItem('偶', 1); this.message('稻草人續上了：還能守 ' + Math.ceil(w.scareDays(t.x, t.y)) + ' 天。'); SFX.fuse(); return;
      }
      if (DB[name] && DB[name].kind === 'beast') {
        if (this.ents.canStand(name, t.x, t.y, true) && !this.ents.at(t.x, t.y)) { this.ents.add(name, t.x, t.y, { calm: 6 }); this.removeItem(name, 1); this.message('放了「' + name + '」。'); SFX.write(); }
        else { this.message('這裡放不下「' + name + '」。'); fail(); }
        return;
      }
      const tileName = it.tile || name;             // 大船放下是「舟」
      const green = GREEN.indexOf(base) >= 0 && DB[tileName] && DB[tileName].kind === 'object';   // 人造物直接放在草、花、田、路上（v0.6.2）
      if (DB[tileName] && DB[tileName].net) { this.castNet(s); return; }   // 漁網：撒網（v0.5.1 起不再下在水上）
      if (!DB[tileName] || !DB[tileName].place) { this.message('「' + name + '」放不到地上。'); fail(); return; }
      if (it.ship) { this.launchShip(s); return; }   // 囊裡不該再有船（v0.8.19 起在船艙），萬一有照樣放
      if (DB[tileName].onWater) {       // 放在水上的東西只放真的淺水；棧還搭得上灘（漲潮退潮都走得過，使用者裁定）、河與沼（v0.8.22 橋與棧併成棧）
        const raw = w.raw(t.x, t.y), zhan = tileName === '棧', ok = raw === '水' || (zhan && (raw === '灘' || raw === '川' || DB[raw].bog));
        if (!ok) { this.message(raw === '灘' ? '灘上漲潮才有水，退潮就擱淺了，「' + name + '」要放在真的淺水上；灘上只能搭棧。' : zhan ? '棧要搭在淺水、淺灘、河或沼上。' : '「' + name + '」要放在淺水上。'); fail(); return; }
        if (this.ents.at(t.x, t.y)) { this.message('有生靈在那兒，放不下。'); fail(); return; }
      }
      else {
        if (!(bd.kind === 'ground' || bd.kind === 'blank' || green)) { this.message('這裡放不下，先把地上的東西取走。'); fail(); return; }
        if (bd.bog) { this.message('沼裡放不住東西。選中棧面向它按 F，先搭上棧。'); fail(); return; }
        if (this.ents.at(t.x, t.y)) { this.message('有生靈在那兒，放不下。'); fail(); return; }
      }
      w.set(t.x, t.y, tileName);
      let under = '';   // 壓在草、花、田、路上：一半機會順手收到底下的草、花或土（真隨機）
      if (green) { const got = GREEN_YIELD[base]; if (U.trueRand() < GREEN_P && this.canAdd(got, 1)) { this.addItem(got, 1); under = '（底下的「' + base + '」順手收了一' + (got === '土' ? '捧土' : '把' + got) + '）'; } else under = '（底下的「' + base + '」壓壞了）'; }
      if (s.store) { p.bag.splice(p.bag.indexOf(s), 1); if (p.sel >= p.bag.length) p.sel = Math.max(0, p.bag.length - 1); this.barSig = ''; } else this.removeItem(name, 1);   // 裝著東西的櫃：拿掉的是手上這一個
      if (tileName === '床') { p.home = { x: t.x, y: t.y }; this.toast('床放好了', '夜裡面向它按 R，一覺到天明。'); if (under) this.message(under); this.save(); }
      else if (tileName === '偶') { w.addScarecrow(t.x, t.y); this.toast('稻草人立起來了', '四十五天內獸不近身：前半十格、後半七格。'); }
      else if (tileName === '灶') { if (s.store) w.shelves.set(U.key(t.x, t.y), s.store); this.message((s.store ? '灶放好了，柴架上 ' + s.store.length + ' 格柴都在。面向它按 F 開灶。' : '灶放好了。面向它按 F 開灶。') + under); }
      else if (tileName === '鼎') { if (s.store) w.shelves.set(U.key(t.x, t.y), s.store); this.message((s.store ? '鼎放好了，柴架上 ' + s.store.length + ' 格柴都在。' : '鼎放好了。') + '面向它按 F 開鼎，在裡面添柴、煉丹、熬、鑄、煉。' + under); }
      else if (tileName === '櫃') { w.chests.set(U.key(t.x, t.y), s.store || []); this.message((s.store ? '櫃放好了，裡面 ' + s.store.length + ' 樣東西都在。面向它按 E 開。' : '櫃放好了。面向它按 E 開。') + under); }
      else this.message('放下「' + name + '」。' + under);
      SFX.write();
      this.fx.push({ type: 'write', x: t.x, y: t.y, ch: tileName, color: DB[tileName].ink, t: 0, dur: 0.35 });
    }

    // ---------- 漁網 ----------
    // 撒網（v0.5.1）：拿著網走到水邊，網影浮在水上（castPreview，畫面畫淺色）；按 F 瞬間撒出，網影裡的魚一網打盡。
    // 網影的格子：從面前那格往背離人的方向伸、左右置中，置中放不下就左右挪；面前不是水就試左右、背後。每一格都要是水（漲潮的灘也算）、不是地標
    castOk(x, y) { const d = DB[this.world.get(x, y)]; return !!(d && d.kind === 'water') && !this.world.placeAt(x, y); }   // 深海也撒得（只撈得到淺水的魚，v0.9.18 使用者定；v0.9.17 一度不給）
    netCells(t, size) {
      const p = this.player; let dx = Math.sign(t.x - p.x), dy = Math.sign(t.y - p.y); if (!dx && !dy) dy = 1;
      const lx = dx ? 0 : 1, ly = dx ? 1 : 0, shifts = size === 1 ? [0] : size === 2 ? [0, -1] : [-1, 0, -2];
      for (const sh of shifts) {
        const cells = [];
        for (let k = 0; k < size; k++) for (let m = 0; m < size; m++) cells.push([t.x + dx * k + lx * (m + sh), t.y + dy * k + ly * (m + sh)]);
        if (cells.every(([x, y]) => this.castOk(x, y))) return cells;
      }
      return null;
    }
    castCells(size) {
      const p = this.player, fx = Math.sign(p.fx), fy = Math.sign(p.fy), dirs = [];
      const add = (dx, dy) => { if ((dx || dy) && !(dx && dy) && !dirs.some(d => d[0] === dx && d[1] === dy)) dirs.push([dx, dy]); };
      if (fx && fy) { add(fx, 0); add(0, fy); } else add(fx, fy);           // 先試面前（斜著面向就拆成兩個正方向）
      add(-fy, fx); add(fy, -fx); add(-fx, -fy); for (const [dx, dy] of N4) add(dx, dy);   // 再試左右、背後
      for (const [dx, dy] of dirs) { const cells = this.netCells({ x: p.x + dx, y: p.y + dy }, size); if (cells) return cells; }
      return null;
    }
    castPreview() {      // 手裡拿著網、站在水邊：回傳網影 { cells, ch }，畫面畫淺色；不然 null
      const p = this.player, s = this.held(), it = s && ITEMS[s.n];
      if (!it || !it.tile || !DB[it.tile] || !DB[it.tile].net || p.swimming || p.dead) return null;
      const cells = this.castCells(DB[it.tile].net);
      return cells ? { cells, ch: it.tile, torn: s.dur !== undefined && s.dur <= 0 } : null;
    }
    castNet(s) {         // 撒網：網影裡的魚一網打盡，耐久照網到幾條扣（0 條 1、1 條 2、2 條 4、3 條以上 7）
      const w = this.world, p = this.player, tile = ITEMS[s.n].tile, size = DB[tile].net, max = w.netDur(size);
      if (s.dur !== undefined && s.dur <= 0) { this.message('這張' + s.n + '破了，撒不出去：選中它在製作欄「加固」，棉麻各 ' + this.mendCost(s) + '。'); SFX.fail(); return; }
      const cells = this.castCells(size);
      if (!cells) { this.message('要站在水邊，面前或身旁往外數 ' + size + '×' + size + ' 格都是水，網才撒得開。'); this.fx.push({ type: 'fail', x: p.x + p.fx, y: p.y + p.fy, t: 0, dur: 0.6 }); return; }
      let net = s;
      if (s.dur === undefined && s.c > 1) {   // 一疊新網：拆一張出來記耐久
        if (this.bagUsed() >= this.slots()) { this.message('囊滿了，拆不出一張網來撒。'); SFX.fail(); return; }
        s.c--; net = { n: s.n, c: 1, dur: max, rf: 0 }; p.bag.push(net);
      } else if (s.dur === undefined) { s.dur = max; s.rf = s.rf || 0; }
      const inNet = new Set(cells.map(([x, y]) => U.key(x, y)));
      let got = 0, left = 0;
      for (const e of this.ents.list.filter(o => o.type === '魚' && inNet.has(U.key(o.x, o.y)))) {
        if (!this.canAdd('魚', 1)) { left++; continue; }
        this.ents.remove(e); this.addItem('魚', 1); got++;
      }
      const cost = CAST_COST[Math.min(3, got)]; if (!this.test) net.dur = Math.max(0, net.dur - cost);
      p.sel = p.bag.indexOf(net); this.barSig = '';
      if (got) this.addCourage(got);
      for (const [x, y] of cells) this.fx.push({ type: 'cast', x, y, ch: tile, t: 0, dur: 0.7 });
      let cx = 0, cy = 0; for (const [x, y] of cells) { cx += x; cy += y; }
      this.fx.push({ type: 'float', x: cx / cells.length, y: cy / cells.length, text: got ? '魚 +' + got : '空網', color: G.INK.water, t: 0, dur: 1.2 });
      this.message((got ? '一網撒下，網到 ' + got + ' 條魚' : '一網撒下，空的') + (left ? '（囊滿，溜了 ' + left + ' 條）' : '') + '。耐 −' + cost + '，還剩 ' + net.dur + '／' + max + (net.dur <= 0 ? '——網破了，製作欄「加固」' : '') + '。');
      if (net.dur <= 0) SFX.fail(); else if (got) SFX.absorb(); else SFX.write();
    }
    // ---------- 五穀（v0.9.18 使用者定：先做釜甑與五穀）：野生的苗田、下種、照節氣長、收割、地力、雀與獸害、籬 ----------
    termName(k) { return CAL.TERMS[((k % 24) + 24) % 24][0]; }
    wetBeside(x, y) { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const d = DB[this.world.get(x + dx, y + dy)]; if (d && (d.kind === 'water' || d.fresh)) return true; } return false; }
    sowNow() { const t = this.world.termNow(); return Object.keys(G.CROPS).filter(k => t >= G.CROPS[k].sow[0] && t <= G.CROPS[k].sow[1]); }
    sowWhy(kind, x, y) {   // 這一格現在下不下得了這種穀：'' 下得了，不然回原因
      const C = G.CROPS[kind], w = this.world, term = w.termNow();
      if (term < C.sow[0] || term > C.sow[1]) return kind + '要' + this.termName(C.sow[0]) + '到' + this.termName(C.sow[1]) + '下種，現在是' + this.termName(term) + '。' + (this.sowNow().length ? '這個節氣下得了：' + this.sowNow().join('、') + '。' : '');
      if (C.water && !this.wetBeside(x, y)) return '稻要田邊一格內有水（淺水、池、湖、川）。';
      const f = w.fertOf(x, y); if (f < C.need) return '這塊田地力只剩 ' + f + '，' + kind + '要 ' + C.need + '：空著休耕（每十五日回一點，回到三）或撒草木灰。';
      return '';
    }
    sow(t, kind) {
      const w = this.world, p = this.player, ch = w.get(t.x, t.y), fail = () => { this.fx.push({ type: 'fail', x: t.x, y: t.y, t: 0, dur: 0.6 }); SFX.fail(); };
      if (ch !== '田') { this.message(DB[ch] && DB[ch].crop ? '這格已經長著東西了。' : '穀要種在田裡：拿著鋤面向土或草按 E，鋤成田。'); fail(); return false; }
      if (this.ents.at(t.x, t.y)) { this.message('有生靈在那兒。'); fail(); return false; }
      const why = this.sowWhy(kind, t.x, t.y); if (why) { this.message(why); fail(); return false; }
      if (p.sta < 1) { this.message('力有未逮，且歇一歇。'); return false; }
      this.removeItem(kind, 1); const f = w.plant(t.x, t.y, kind); p.sta = Math.max(0, p.sta - this.workDrain());
      const C = G.CROPS[kind];
      this.message('種下「' + kind + '」，地力 ' + f + '。' + (kind === '麥' ? '麥過冬，來年小滿熟（麥秋至）。' : '約 ' + C.grow + ' 日熟；霜降前沒熟的會凍死。') + (this.world.scared(t.x, t.y) ? '' : '秀了以後雀會來啄，旁邊立個稻草人。'));
      this.fx.push({ type: 'write', x: t.x, y: t.y, ch: '苗', color: DB['苗'].ink, t: 0, dur: 0.35 }); SFX.write();
      if (!(p.tut || {}).farm) { (p.tut = p.tut || {}).farm = 1; this.openTutor('farm'); }   // v0.9.19 使用者定：第一次種地蹦出教程（可跳過，農書裡可重看）
      return true;
    }
    ashField(t) {
      const w = this.world, f = w.fertOf(t.x, t.y);
      if (f >= G.FERT_MAX) { this.message('地力已經滿了（' + G.FERT_MAX + '）。'); SFX.fail(); return false; }
      const r = w.crops.get(U.key(t.x, t.y)); this.removeItem('灰', 1);
      if (r) { r.f = Math.min(G.FERT_MAX, r.f + 1); w.setFert(t.x, t.y, r.f, true); } else w.setFert(t.x, t.y, f + 1, false);
      this.message('撒了一把草木灰，地力 ' + (r ? r.f : f + 1) + '。'); SFX.write(); this.fx.push({ type: 'float', x: t.x, y: t.y, text: '肥 +1', color: G.INK.ash, t: 0, dur: 1 }); return true;
    }
    cropLabel(x, y) {   // 提示列：稻苗（自種，約 12 日熟，地力 3，雀啄過一口）／野生的黍秀
      const w = this.world, ch = w.get(x, y), d = DB[ch], kind = w.cropKind(x, y), r = w.crops.get(U.key(x, y)); if (!d || !d.crop || !kind) return ch;
      const stage = d.crop === 1 ? '苗' : d.crop === 2 ? '秀' : d.crop === 4 ? '遺穗' : '（熟了）';
      let s = (r ? '' : '野生的') + kind + stage;
      const lost = r ? (r.pk ? '，雀啄過 ' + r.pk + ' 口' : '') + (r.ms ? '，鼠偷過 ' + r.ms + ' 把' : '') : '';
      if (r && d.crop <= 2) s += '（約 ' + w.cropDaysLeft(r) + ' 日熟' + lost + '）';
      else if (!r && d.crop <= 2) s += '（' + this.termName(G.CROPS[kind].wild[2]) + '前後熟）';
      else if (r && d.crop === 3) { const left = Math.max(0, Math.ceil(G.CROP_HOLD - (w.time - (r.rt || w.time)) / DAY)); s += '（' + left + ' 日內不收就落穗' + lost + '）'; }
      return s;
    }
    reapAt(t, silent) {
      const w = this.world, p = this.player, ch = w.get(t.x, t.y), d = DB[ch], kind = w.cropKind(t.x, t.y), r = w.crops.get(U.key(t.x, t.y));
      if (!kind) return;
      if (d.crop <= 2) {
        if (this.heldTool() !== '鋤') { if (!silent) this.message(this.cropLabel(t.x, t.y) + '：還沒熟。拿著鋤按 E 可以拔掉。'); return; }
        const pull = () => { w.endCrop(t.x, t.y, 0); w.set(t.x, t.y, '田'); this.wearTool(); this.message('拔掉了' + kind + ch + '。'); SFX.write(); };
        if (r && !this.takeOk) { this.askTake(t, ch, () => this.confirmed(pull), '拔掉自己種的' + kind + ch + '？種子不會回來。', ['拔掉？', '拔', '不拔']); return; }
        pull(); return;
      }
      if (p.sta < 1) { if (!silent) this.message('力有未逮，且歇一歇。'); return; }
      this.action = { type: 'gather', reap: true, x: t.x, y: t.y, ch, t: 0, dur: d.crop === 4 ? 0.6 : 1.2 };
    }
    finishReap(a) {
      const w = this.world, p = this.player, kind = w.cropKind(a.x, a.y), r = w.crops.get(U.key(a.x, a.y)); this.action = null; if (!kind) return;
      const C = G.CROPS[kind], glean = a.ch === '穗';
      const n = glean ? 1 : r ? Math.max(1, 2 + (r.f >= 3 ? 1 : 0) + (r.f >= 4 ? 1 : 0) - (r.pk || 0) - (r.ms || 0)) : 2, straw = glean ? 0 : 1;   // 雀啄、鼠偷（v0.9.19）各少一把
      w.endCrop(a.x, a.y, r ? C.cost : 0); w.set(a.x, a.y, '田');
      const at1 = this.giveNear(kind, n), at2 = straw ? this.giveNear('草', straw) : null, at = at1 || at2;
      p.sta = Math.max(0, p.sta - this.workDrain()); this.stats.gathered++; this.addCourage(1);
      const fNow = w.fertOf(a.x, a.y);
      this.message((glean ? '拾了一把遺穗：' : '收了') + '「' + kind + '」×' + n + (straw ? '、草 ×' + straw : '') + (r && (r.pk || r.ms) ? '（' + [r.pk ? '雀啄去 ' + r.pk + ' 把' : '', r.ms ? '鼠偷去 ' + r.ms + ' 把' : ''].filter(Boolean).join('、') + '）' : '') + (r ? (C.cost > 0 ? '。地力 −' + C.cost + '，剩 ' + fNow : C.cost < 0 ? '。菽肥田，地力 +1，現在 ' + fNow : '') : '') + (!r && !glean ? '。野生的收了，這格就是一塊空田' : '') + '。' + (at ? '囊滿了，用小囊包著擱在' + at.where + '。' : ''));
      this.fx.push({ type: 'float', x: a.x, y: a.y, text: '+' + kind + '×' + n, color: G.INK.gold, t: 0, dur: 1 }); SFX.absorb();
      if (!p.warned.reap) { p.warned.reap = true; this.toast('收成', '五穀是糧也是種：選中面向田按 F 下種（看節氣），或帶著釜甑在灶上煮、蒸成菜，一頓之內各有一樣小增益（麥力、黍心、稷飽、稻氣、菽暖）。生嚼只有一點飽。'); }
      if (this.keys.has('KeyE') || this.keys.has('Space')) this.pressGather(true);
    }
    cropNews(type, x, y, r) {   // 世界那邊換日時說一聲：凍死的照日數一回、落穗與雀啄只在附近說
      const p = this.player, near = U.cheb(x, y, p.x, p.y) <= 14;
      if (type === 'peck') { if (near) this.fx.push({ type: 'float', x, y, text: '雀', color: G.INK.brown, t: 0, dur: 1.4 }); return; }
      if (type === 'locust') { this.toast('蝗', '天邊黃了一片：一群蝗明日半夜落到你的田上（方圓八格，「' + r.c + '」那一帶）。田邊點燈、生火、燒旺灶，燈火六格內的田保得住——《詩·小雅·大田》：「田祖有神，秉畀炎火。」', 12000); SFX.fail(); return; }   // v0.9.19
      if (type === 'locustLand') { const near2 = U.cheb(x, y, this.player.x, this.player.y) <= 30; this.message(r.eaten ? '蝗群落下，' + r.eaten + ' 格田吃得只剩稈子' + (r.saved ? '；燈火邊的 ' + r.saved + ' 格保住了' : '') + '。' : r.saved ? '蝗群落下，撲進燈火裡燒死了一地，' + r.saved + ' 格田都保住了。' : '蝗群落下，四下沒有你種的田，又飛走了。'); if (!r.eaten && r.saved) this.addCourage(3); if (near2) this.fx.push({ type: 'float', x, y, text: r.eaten ? '蝗' : '焚', color: r.eaten ? G.INK.brown : G.INK.red, t: 0, dur: 1.6 }); return; }
      if (type === 'mouse') { if (near) this.fx.push({ type: 'float', x, y, text: '鼠', color: G.INK.brown, t: 0, dur: 1.4 }); if (near && !(this.player.tut || {}).mouse) { (this.player.tut = this.player.tut || {}).mouse = 1; this.toast('田鼠', '田鼠夜裡來偷穗，籬擋不住、稻草人也不怕。林竹間有狸，手持魚按 F 投一條，帶到田邊牠就留下來守著。'); } return; }   // v0.9.19
      if (type === 'frost') { const d = this.day(); this.frostN = this.frostDay === d ? (this.frostN || 0) + 1 : 1; this.frostDay = d; this.message('霜降了：田裡還沒熟的苗、秀凍死了 ' + this.frostN + ' 格（麥不怕）。'); return; }
      if (type === 'shed' && near) this.message('「' + r.c + '」熟過了頭，穗落在田裡，只拾得回一把。');
    }
    cropEaten(e, x, y) {   // 鹿、野豬、野牛走進田裡啃了苗（v0.9.18）
      const w = this.world, p = this.player, ch = w.get(x, y), kind = w.cropKind(x, y); if (!kind) return;
      w.endCrop(x, y, 0); w.set(x, y, '田');
      if (U.cheb(x, y, p.x, p.y) <= 14 && (this.world.time - (this.grazeSaid || -99)) > 20) { this.grazeSaid = this.world.time; this.message(this.beastName(e) + '把田裡的' + kind + ch + '啃了。圍上籬（開口放一扇扉），獸就進不來。'); }
    }
    // ---------- 一頓（v0.9.17）：烤過的奇魚，一次只有一頓的小增益，吃了新的換掉舊的 ----------
    mealOn(k) { const m = this.player.meal; return !!m && this.world.time < m.until && (!k || m.k === k); }
    mealCut() { const m = this.player.meal; return (m && m.cut) || G.MEAL_CUT; }   // 這一頓少幾成：新穀 0.7、平常 0.75、陳穀 0.85（v0.9.19）
    mealK(k) { return this.mealOn(k) ? this.mealCut() : 1; }

    // ---------- 垂釣（v0.9.17 使用者定）：撒網只撈淺水的魚，垂釣釣中層與深海的魚 ----------
    heldRod() { const s = this.held(), it = s && ITEMS[s.n]; return it && it.rod ? s : null; }
    fishLayer(x, y) {   // 這一格是哪一層：deep 深海（淼、離陸地與沙洲至少十八格，v0.9.18）、mid 中層（湖、川、離岸兩格以外的海與不夠遠的淼）、shallow 淺水（近岸的海、池、湯、漲潮的灘）；不是水回 ''
      const w = this.world, d = DB[w.get(x, y)]; if (!d || d.kind !== 'water') return '';
      const raw = w.raw(x, y);
      if (raw === '淼') return w.deepSea(x, y) ? 'deep' : 'mid';
      if (raw === '湖' || raw === '川') return 'mid';
      if (raw !== '水') return 'shallow';
      for (let dy = -ROD_SHORE; dy <= ROD_SHORE; dy++) for (let dx = -ROD_SHORE; dx <= ROD_SHORE; dx++) { const r = DB[w.base(x + dx, y + dy)]; if (r && r.kind !== 'water') return 'shallow'; }   // 照原本的岸算：搭在水上的棧不算岸，站在棧頭拋得到離岸的海
      return 'mid';
    }
    rodTarget() {   // 浮子落在哪：面前（斜著也行）往外數，第二格是水就落第二格，不然第一格；不落在自己的船上、地標上
      const p = this.player, w = this.world, fx = Math.sign(p.fx || 0), fy = Math.sign(p.fy || 0); if (!fx && !fy) return null;
      const ok = [];
      for (let k = 1; k <= ROD_REACH && ok.length < 2; k++) {
        const x = p.x + fx * k, y = p.y + fy * k;
        if (p.sailing && this.onDeck(x, y)) continue;
        const L = this.fishLayer(x, y); if (!L || w.placeAt(x, y)) break;
        ok.push({ x, y, L });
      }
      return ok.length ? ok[ok.length - 1] : null;
    }
    biteWait() {   // 等多久上鉤：晨昏快四成，下雨快一成五
      const t = this.dayT(), tw = Math.abs(t - this.dawnT()) < 0.04 || Math.abs(t - this.duskT()) < 0.04, wx = this.wxHere();
      return U.r4((ROD_WAIT[0] + U.trueRand() * (ROD_WAIT[1] - ROD_WAIT[0])) * (tw ? 0.6 : 1) * (wx === 'rain' || wx === 'thunder' ? 0.85 : 1));
    }
    fishPool(x, y, L) {   // 這一格這時候會上鉤的魚與份量
      const raw = this.world.raw(x, y), fresh = !!(DB[raw] && DB[raw].fresh), night = this.isNight(), k = CAL.term(this.day() - 1).k, summer = k >= 6 && k <= 11, z = G.zoneAt(x, y, this.seed), out = [];
      for (const f of G.FISH) {
        if (f.layer !== L || (f.fresh && !fresh) || (f.sea && fresh) || (f.summer && !summer) || (f.night && !night)) continue;
        const wgt = f.zone ? (z && z.id === f.zone ? f.zw : 0) : f.w; if (wgt > 0) out.push([f, wgt]);
      }
      return out;
    }
    rollFish(x, y, L) { if (L === 'deep' && U.trueRand() < DEEP_PLAIN) return PLAIN_FISH; const pool = this.fishPool(x, y, L); let r = U.trueRand() * pool.reduce((a, q) => a + q[1], 0); for (const [f, wgt] of pool) { if (r < wgt) return f; r -= wgt; } return pool.length ? pool[pool.length - 1][0] : null; }   // 深海七成五上鉤的是淺水的魚（v0.9.18 使用者定）
    castLine(s) {
      const p = this.player, it = ITEMS[s.n], t = this.rodTarget();
      if (!t) { this.message('要站在水邊、面向水，浮子才拋得出去（落在面前一兩格的水上）。'); this.fx.push({ type: 'fail', x: p.x + Math.sign(p.fx || 0), y: p.y + Math.sign(p.fy || 0), t: 0, dur: 0.6 }); return; }
      if (t.L === 'shallow') { this.message('近岸的淺水是撒網的地方；竿要拋到中層（湖、川、離岸兩格以外的海）或深海（離陸地、沙洲十八格以外的淼）。'); this.fx.push({ type: 'fail', x: t.x, y: t.y, t: 0, dur: 0.6 }); return; }
      if (t.L === 'deep' && it.rod < 2) { this.message('釣竿線短鉤小，深海（離陸地、沙洲十八格以外的淼）的魚咬不住——要「大鉤」（鐵一、竹三、麻六）。'); this.fx.push({ type: 'fail', x: t.x, y: t.y, t: 0, dur: 0.6 }); SFX.fail(); return; }
      if (!this.fishPool(t.x, t.y, t.L).length) { this.message('這片水這時候沒什麼魚。湖、川裡多奇魚，海上離岸的地方有大魚，深海要大鉤。'); return; }
      let rod = s;
      if (s.dur === undefined && s.c > 1) {   // 一疊新竿：拆一根出來記耐久（同撒網）
        if (this.bagUsed() >= this.slots()) { this.message('囊滿了，拆不出一根竿來。'); SFX.fail(); return; }
        s.c--; rod = { n: s.n, c: 1, dur: it.rodLife }; p.bag.push(rod); p.sel = p.bag.indexOf(rod); this.barSig = '';
      } else if (s.dur === undefined) s.dur = it.rodLife;
      const wx = this.wxHere();
      this.fishing = { x: t.x, y: t.y, L: t.L, rod, px: p.x, py: p.y, phase: 'wait', t: this.biteWait(), ten: 0, pull: 0, idle: 0, done: 0, need: 1, fish: null, at: 0 };
      this.fx.push({ type: 'write', x: t.x, y: t.y, ch: '浮', color: G.INK.water, t: 0, dur: 0.4 });
      this.message('拋竿入' + LAYER_NAME[t.L] + '……等浮子沉下去再按 F；早按就是收竿，走開也收。' + (wx === 'thunder' || wx === 'dry' ? '雷雨天拿竿，小心招雷！' : ''));
      SFX.write();
    }
    rodPress() {   // 拋了竿以後按 F：等的時候是收竿，浮子沉著是提竿，上了鉤是收一下
      const f = this.fishing, p = this.player; if (!f) return;
      if (f.phase === 'wait') { this.fishing = null; this.message('收了竿。'); return; }
      if (f.phase === 'bite') {
        if (f.fish.reels <= 1) { this.landFish(); return; }
        f.phase = 'hook'; f.need = f.fish.reels; f.done = 0; f.ten = 0.15; f.idle = 0; f.pull = ROD_PULL[0] + U.trueRand() * (ROD_PULL[1] - ROD_PULL[0]);
        this.message('上鉤了，是條沉的！一下一下收（F，每下力 −' + ROD_STA + '），別收太急，線會斷。'); SFX.ram && SFX.ram(); return;
      }
      if (f.phase === 'hook') {
        if (p.sta < ROD_STA) { this.message('力不夠，收不動了。'); SFX.fail(); return; }
        p.sta = Math.max(0, p.sta - ROD_STA); f.done++; f.idle = 0; f.ten = U.r4(f.ten + ROD_PRESS);
        if (f.ten >= 1) { this.lineSnap(); return; }
        if (f.done >= f.need) { this.landFish(); return; }
        this.message('收了一下（' + f.done + '／' + f.need + '）。' + (f.ten > 0.6 ? '線繃得很緊，緩一緩。' : ''));
        SFX.write();
      }
    }
    rodWear(rod, n) { if (this.test) return false; rod.dur = Math.max(0, (rod.dur === undefined ? ITEMS[rod.n].rodLife : rod.dur) - n); if (rod.dur > 0) return false; const i = this.player.bag.indexOf(rod); if (i >= 0) { if (rod.c > 1) { rod.c--; delete rod.dur; } else this.player.bag.splice(i, 1); } this.barSig = ''; this.buildBag(); return true; }
    lineSnap() {
      const f = this.fishing; this.fishing = null;
      const broke = this.rodWear(f.rod, ROD_BREAK);
      this.message('收得太急，線繃斷了，' + f.fish.n + '跑了。' + (broke ? '「' + f.rod.n + '」也斷了。' : '竿耐 −' + ROD_BREAK + '，還剩 ' + f.rod.dur + '。')); SFX.fail();
      this.fx.push({ type: 'write', x: f.x, y: f.y, ch: '斷', color: G.INK.red || '#b4392a', t: 0, dur: 0.8 });
    }
    landFish() {
      const f = this.fishing, p = this.player, fish = f.fish; this.fishing = null;
      if (!this.canAdd(fish.n, 1)) { this.message('囊滿了，' + fish.n + '又滑回水裡。先騰一格再釣。'); SFX.fail(); return; }
      this.addItem(fish.n, 1); const broke = this.rodWear(f.rod, 1);
      if (!broke && p.bag.indexOf(f.rod) >= 0) { p.sel = p.bag.indexOf(f.rod); this.barSig = ''; }   // 魚進了囊，手上還是那根竿
      p.fishLog = p.fishLog || {}; const first = !p.fishLog[fish.n]; if (fish !== PLAIN_FISH) p.fishLog[fish.n] = (p.fishLog[fish.n] || 0) + 1;   // 魚譜只記奇魚與大魚
      this.addCourage(fish === PLAIN_FISH ? 1 : f.L === 'deep' ? 5 : 3);
      if (p.san < 100) p.san = Math.min(100, U.r4(p.san + this.sanUp(ROD_SAN)));   // 閒遊：釣起一條愜意 +1
      this.fx.push({ type: 'float', x: f.x, y: f.y, text: fish.n + ' +1', color: G.INK.water, t: 0, dur: 1.4 });
      this.message('釣上一' + (fish.n === '大魚' ? '條大魚' : '尾' + fish.n) + '。' + (broke ? '「' + f.rod.n + '」用到頭，斷了。' : ''));
      if (first && fish.text) this.toast(fish.n, fish.src + '：「' + fish.text + '」<br>可以生吃（只有飽），在灶上烤了吃，一頓之內' + (G.MEALS[(G.ITEMS['烤' + fish.n].food || {}).meal] || { text: '飽得多' }).text + '。見聞錄「魚譜」記著釣過的魚。', 11000);
      SFX.absorb(); this.buildBag();
    }
    fishTick(dt) {   // 每幀：等魚、浮子沉、上了鉤的拉扯；人走開、換了手上的東西就收竿；夜裡深海行船偶爾有文鰩魚飛上船
      const p = this.player, f = this.fishing;
      if (!f) {
        if (p.sailing && this.isNight() && this.world.deepSea(p.x, p.y)) {
          this.flyAcc = (this.flyAcc || 0) + dt;
          while (this.flyAcc >= FLY_GAP) { this.flyAcc -= FLY_GAP; if (U.trueRand() < FLY_P && this.canAdd('文鰩魚', 1)) { this.addItem('文鰩魚', 1); p.fishLog = p.fishLog || {}; p.fishLog['文鰩魚'] = (p.fishLog['文鰩魚'] || 0) + 1; this.fx.push({ type: 'float', x: p.x, y: p.y, text: '文鰩魚 +1', color: G.INK.water, t: 0, dur: 1.4 }); this.message('夜裡一尾文鰩魚飛上船來，落在腳邊（以夜飛）。'); this.buildBag(); } }
        } else this.flyAcc = 0;
        return;
      }
      if (p.dead || p.swimming || p.x !== f.px || p.y !== f.py || this.held() !== f.rod) { this.fishing = null; if (!p.dead) this.message('收了竿。'); return; }
      f.at += dt;
      if (f.phase === 'wait') {
        f.t -= dt;
        if (f.t <= 0) { f.fish = this.rollFish(f.x, f.y, f.L); if (!f.fish) { this.fishing = null; return; } f.phase = 'bite'; f.t = ROD_BITE; this.message('浮子沉下去了——按 F！'); SFX.blip ? SFX.blip() : SFX.write(); }
      } else if (f.phase === 'bite') {
        f.t -= dt;
        if (f.t <= 0) { f.phase = 'wait'; f.t = this.biteWait(); f.fish = null; this.message('魚吐了鉤，溜了。再等等。'); }
      } else if (f.phase === 'hook') {
        f.ten = Math.max(0, U.r4(f.ten - ROD_EASE * dt)); f.idle += dt; f.pull -= dt;
        if (f.pull <= 0) { f.pull = ROD_PULL[0] + U.trueRand() * (ROD_PULL[1] - ROD_PULL[0]); f.ten = U.r4(f.ten + ROD_TUG[0] + U.trueRand() * (ROD_TUG[1] - ROD_TUG[0])); if (f.ten >= 1) { this.lineSnap(); return; } this.message(f.fish.n === '大魚' ? '魚往下扯了一把。' : f.fish.n + '往下扯了一把。'); }
        if (f.idle >= ROD_IDLE) { this.fishing = null; this.message(f.fish.n + '掙脫了鉤，跑了。上了鉤要一下一下收。'); SFX.fail(); }
      }
    }
    mendNet(rec) {   // 面向放著的網（v0.5.1 前下在水上的舊網）按 F：棉麻各 1、2、4、8 加固，耐久回滿；破網固好了重新計時
      if (!rec) return;
      const w = this.world, p = this.player, max = w.netDur(rec.size), k = this.mendCost(rec), name = this.netName(rec.size);
      if (rec.dur >= max) { this.message('這張' + name + '還結實（耐 ' + rec.dur + '／' + max + '），不用加固。'); return; }
      if (rec.dur / max >= RENEW_AT) { this.message('這張' + name + '還新（耐 ' + rec.dur + '／' + max + '），用過一半才能加固。'); SFX.fail(); return; }
      if (this.count('棉') < k || this.count('麻') < k) { this.message('加固這張' + name + '要棉 ' + k + ' 麻 ' + k + '（第 ' + ((rec.rf || 0) + 1) + ' 次；囊中棉 ' + this.count('棉') + ' 麻 ' + this.count('麻') + '）。'); SFX.fail(); return; }
      if (p.sta < MEND_STA) { this.message('力有未逮，且歇一歇。'); SFX.fail(); return; }
      const torn = rec.dur <= 0; this.removeItem('棉', k); this.removeItem('麻', k); p.sta -= MEND_STA; rec.dur = max; rec.rf = (rec.rf || 0) + 1; if (torn) rec.t = w.time;
      this.message('「' + name + '」加固了，用了棉麻各 ' + k + '，耐久回 ' + max + '；下次要各 ' + this.mendCost(rec) + '。'); SFX.fuse();
    }
    useNet(t) {
      const w = this.world, rec = w.netAt(t.x, t.y); if (!rec) return;
      const fish = w.netFish(rec, w.time), name = this.netName(rec.size), max = w.netDur(rec.size);
      if (fish > 0) {
        let take = 0; while (take < fish && this.canAdd('魚', 1)) { this.addItem('魚', 1); take++; }
        if (!take) { this.message('囊已滿。'); return; }
        rec.fish -= take; if (rec.fish <= 0) rec.t = w.time; this.addCourage(1);
        const was = rec.dur; rec.dur = Math.max(0, rec.dur - take);   // 每取一條磨一分耐久
        const torn = was > 0 && rec.dur <= 0;
        this.message('網裡得魚 ' + take + ' 條' + (rec.fish ? '，還剩 ' + rec.fish + ' 條' : '') + (torn ? '。網破了，不再進魚：面向按 F 用棉麻各 ' + this.mendCost(rec) + ' 加固。' : '（耐 ' + rec.dur + '／' + max + '）。')); if (torn) SFX.fail(); else SFX.absorb(); return;
      }
      if (!this.canAdd(name, 1)) { this.message('囊已滿。'); return; }
      if (!this.takeOk) { this.askTake(t, w.get(t.x, t.y), () => this.confirmed(() => this.useNet(t))); return; }
      w.removeNet(rec); this.addItem(name, 1, rec.dur < max || rec.rf ? { dur: rec.dur, rf: rec.rf || 0 } : undefined); this.message('收回了' + name + (rec.dur < max ? '（耐 ' + rec.dur + '／' + max + (rec.dur <= 0 ? '，破的，在製作欄「加固」' : '') + '）' : '') + '。'); SFX.absorb();
    }

    // ---------- 煉丹 ----------
    pillChance(name) { if (this.test) return 1; const p = this.player, venom = name === '毒蟾肉'; return p.pillsMade < 3 ? (venom ? 0.12 : 0.08) : (venom ? 0.02 : 0.01); }
    refinePill(t, name) {
      const p = this.player, w = this.world;
      if (!w.stoveLit(t.x, t.y)) { this.message('鼎冷火熄，先添柴。'); SFX.fail(); return; }
      if (!this.spendSta(3)) return;
      const chance = this.pillChance(name); this.removeItem(name, 1);
      if (Math.random() < chance) {       // 真隨機
        p.pillsMade++; const at = this.giveNear('丹', 1); this.addCourage(3);
        this.toast('煉成一顆丹', '第 ' + p.pillsMade + ' 顆' + (at ? '（囊滿了，用小囊包著擱在' + at.where + '）' : '') + '。選中按 V 服下，命上限 ' + (p.pillsEaten < 50 ? '+3' : '+0.5') + '。' + (p.pillsMade === 3 ? '從第四顆起，成功率降為無毒肉 1%、有毒肉 2%。' : '')); SFX.learn();
      } else { this.message('丹沒成，一塊' + name + '化了煙（這次 ' + Math.round(chance * 100) + '%）。'); SFX.fail(); }
      this.fx.push({ type: 'float', x: t.x, y: t.y, text: '丹', color: G.INK.red, t: 0, dur: 1 });
    }
    // v0.8.1 熬蜃珠：蜃殘體九塊、海水瓶三，火旺的鼎，耗力六；八成三的機會成（真隨機），不成退殘體（困難只退八塊）、海水瓶不退
    brewPearl(t) {
      const w = this.world, shards = this.count('蜃殘體'), brine = this.count('海水瓶'), fresh = this.count('淡水瓶');
      if (!w.stoveLit(t.x, t.y)) { this.message('鼎冷火熄，先添柴。'); SFX.fail(); return; }
      if (shards < PEARL_SHARDS || brine < PEARL_BRINE || fresh < PEARL_FRESH) { this.message('熬一顆蜃珠要蜃殘體 ' + PEARL_SHARDS + ' 塊、海水瓶 ' + PEARL_BRINE + '、淡水瓶 ' + PEARL_FRESH + '（「熬」底下四點），囊裡殘體 ' + shards + '、海水瓶 ' + brine + '、淡水瓶 ' + fresh + '。'); SFX.fail(); return; }
      if (!this.spendSta(PEARL_STA)) return;
      this.removeItem('蜃殘體', PEARL_SHARDS); this.removeItem('海水瓶', PEARL_BRINE); this.removeItem('淡水瓶', PEARL_FRESH);
      const jars = PEARL_BRINE + PEARL_FRESH;
      if (this.test || U.trueRand() < PEARL_P) {
        const at = this.stashItem('蜃珠', 1), jt = this.giveNear('玻璃瓶', jars); this.addCourage(3);
        this.toast('熬成一顆蜃珠', jars + ' 個空瓶退回來了' + (jt ? '（囊滿了，用小囊包著擱在' + jt.where + '）' : '') + '。' + (at ? '囊滿了，蜃珠用小囊包著擱在' + at.where + '。' : '') + (this.player.azure ? '青龍已經教過你了，這顆留著。' : '帶去東海，青龍兩格內按 E 求教。')); SFX.learn();
      } else {
        const back = this.diff.key === 'hard' ? PEARL_SHARDS - 1 : PEARL_SHARDS; this.stashItem('蜃殘體', back);
        this.message('鼎裡一聲爆響，珠沒熬成（' + Math.round(PEARL_P * 100) + '%）：' + jars + ' 個瓶子都炸碎了，殘體退回 ' + back + ' 塊' + (back < PEARL_SHARDS ? '（困難熬壞一塊）' : '') + '。'); SFX.fail();
        this.renderer.shake = 0.4;
      }
      this.fx.push({ type: 'float', x: t.x, y: t.y, text: '珠', color: G.INK.azure, t: 0, dur: 1 }); this.buildBag();
    }
    // 信物（v0.8.5 虎符、v0.8.6 朱羽）：殘體九塊加料（TOKENS），火旺的鼎，耗力六；八成三的機會成（真隨機），不成料燒掉、殘體退回（困難只退八塊）
    tokenNeeds(shard) { const k = TOKENS[shard]; return k.verb + k.out + '（殘體 ' + this.count(shard) + '/' + PEARL_SHARDS + Object.keys(k.need).map(n => '、' + n + ' ' + this.count(n) + '/' + k.need[n]).join('') + '，' + Math.round(PEARL_P * 100) + '%）'; }
    castToken(t, shard) {
      const k = TOKENS[shard], w = this.world, have = this.count(shard), names = Object.keys(k.need);
      if (!w.stoveLit(t.x, t.y)) { this.message('鼎冷火熄，先添柴。'); SFX.fail(); return; }
      if (have < PEARL_SHARDS || names.some(n => this.count(n) < k.need[n])) { this.message(k.verb + '一' + k.unit + k.out + '要' + shard + ' ' + PEARL_SHARDS + ' 塊、' + names.map(n => n + ' ' + k.need[n]).join('、') + '，囊裡殘體 ' + have + names.map(n => '、' + n + ' ' + this.count(n)).join('') + '。'); SFX.fail(); return; }
      if (!this.spendSta(TALLY_STA)) return;
      this.removeItem(shard, PEARL_SHARDS); for (const n of names) this.removeItem(n, k.need[n]);
      if (this.test || U.trueRand() < PEARL_P) {
        const at = this.stashItem(k.out, 1); this.addCourage(3);
        this.toast(k.verb + '成一' + k.unit + k.out, k.look + (at ? '囊滿了，' + k.out + '用小囊包著擱在' + at.where + '。' : '') + (this.player[k.learned] ? k.god + '已經教過你了，這' + k.unit + '留著。' : '帶去' + k.place + '，' + k.god + '兩格內按 E 求教。')); SFX.learn();
      } else {
        const back = this.diff.key === 'hard' ? PEARL_SHARDS - 1 : PEARL_SHARDS; this.stashItem(shard, back);
        this.message(k.fail + '（' + Math.round(PEARL_P * 100) + '%）：' + k.lost + '，殘體退回 ' + back + ' 塊' + (back < PEARL_SHARDS ? '（困難' + k.hard + '一塊）' : '') + '。'); SFX.fail();
        this.renderer.shake = 0.4;
      }
      this.fx.push({ type: 'float', x: t.x, y: t.y, text: k.mark, color: G.INK.gold, t: 0, dur: 1 }); this.buildBag();
    }
    eatPill() {
      const p = this.player; p.pillsEaten++;
      const n = p.pillsEaten, before = p.hpMax;
      p.hpMax = U.r4(100 + 3 * Math.min(n, 50) + 0.5 * Math.max(0, n - 50));   // 前五十顆每顆 +3，之後每顆 +0.5（v0.6.2 起不取整）
      const gain = p.hpMax - before; p.hp = Math.min(p.hpMax, p.hp + Math.max(0, gain));
      this.toast('服下第 ' + n + ' 顆丹', '命上限 +' + this.shown('hpmax', gain) + '，現在 ' + fmt(p.hpMax) + '。' + (n === 50 ? '從第五十一顆起每顆 +0.5。' : '')); SFX.learn(); this.hudSig = '';
    }

    // ---------- 吃（V） ----------
    useItem() {
      const p = this.player, s = this.held(); if (!s || !this.canAct()) return;
      const it = G.item(s.n), f = it.food, tl = ITEMS[s.n] || {};
      if (tl.slot) { this.wearItem(p.sel); return; }
      if (s.n === '丹') { this.removeItem('丹', 1); this.eatPill(); return; }
      if (ITEMS[s.n] && ITEMS[s.n].ward) {
        if (p.sailing && p.ship) this.mountSkull(p.ship, s.n, s);
        else this.message('首骨要放在船頭：在船上選中按 V，或面向停著的船按 F。');
        return;
      }
      if (s.n === '木板' && p.sailing && p.ship) { this.repairShip(p.ship); return; }
      if (s.n === '扇') {
        let best = null, bd = 1e9;
        for (const f of this.world.fogs.values()) for (const k of f.cells) { const [x, y] = U.unkey(k), d = U.cheb(x, y, p.x, p.y); if (d <= FAN_REACH && d < bd) { bd = d; best = f; } }
        if (best) this.blowFog(best); else this.message('三格內沒有霧障。扇子留著，走進霧障時會問你要不要用。');
        return;
      }
      if (s.n === '龜甲') {
        this.removeItem('龜甲', 1);
        if (Math.random() < 0.25) { p.noGhostUntil = Math.max(p.noGhostUntil || 0, this.world.time) + TURTLE_PEACE_DAYS * DAY; this.toast('龜卜：吉', '裂紋成「安」字。五日內魄不來。'); SFX.learn(); }
        else { this.toast('龜卜：不吉', '甲裂無象，白費了一片龜甲。'); SFX.fail(); }
        return;
      }
      if (s.n === '錦囊') {
        if (p.pouches >= MAX_POUCHES) { this.message('已經用了八個錦囊，囊再大也背不動了。'); SFX.fail(); return; }
        this.removeItem('錦囊', 1); p.pouches++; this.barSig = ''; this.buildBag();
        this.toast('錦囊用了', '囊多了兩格、具欄多了一格：現在 ' + this.slots() + ' 格與 ' + this.toolSlots() + ' 格。最多八個。'); SFX.learn(); return;
      }
      if (s.n === '蠟燭') {
        const hat = this.anyHat();
        if (hat && hat.fuel < HAT_FUEL) { this.removeItem('蠟燭', 1); hat.fuel = HAT_FUEL; this.barSig = ''; this.buildBag(); this.message('燈帽續上一根蠟燭：四百息。'); SFX.write(); return; }
        this.message(hat ? '燈帽裡的蠟燭還是滿的。' : '蠟燭拿在手上就亮；有燈帽時按 V 可以續進去。'); return;
      }
      if (s.n === '海水瓶') { this.message('海水鹹，喝不得。放在旺的灶上蒸餾。'); return; }
      if (!f) { this.message(tl.tool && tl.dur ? '「' + s.n + '」是工具，按 F 移進具欄。' : tl.tool || tl.kind === 'wear' ? '「' + s.n + '」在囊中即生效。' : '「' + s.n + '」不能吃，按 F 放到地上。'); return; }
      if (p.chokeT > 0) { this.message('喉頭被鎖住了（窒），咽不下東西。'); SFX.fail(); return; }   // v0.8.25
      if (f.meal && (p.mealN || 0) >= MEAL_FU_CAP && this.fuAlive() && this.mealArm !== s.n) { this.mealArm = s.n; this.message('這是第 ' + ((p.mealN || 0) + 1) + ' 頓增益：「服了？服了！」只容十五頓，吃下去就沒了。真要吃，再按一次 V。'); SFX.fail(); return; }   // v0.9.19
      this.mealArm = null;
      if (f.bottle && s.c > 1 && !this.canAdd('玻璃瓶', 1)) { this.message('囊滿了，喝完的空瓶沒處放。先騰一格。'); SFX.fail(); return; }
      const ate = s.n === '果' ? this.takeFruit(1) : null;
      if (ate) { } else if (s.q) { s.c--; if (s.c <= 0) { p.bag.splice(p.bag.indexOf(s), 1); if (p.sel >= p.bag.length) p.sel = Math.max(0, p.bag.length - 1); } this.barSig = ''; } else this.removeItem(s.n, 1);   // 新穀陳穀做的菜（v0.9.19）：吃手上這一疊
      const age = ate && ate.length ? this.day() - ate[0] : 0;
      if (f.bottle) this.addItem('玻璃瓶', 1);
      if (f.knock) { this.knockOut(f); return; }
      const parts = [];
      if (f.eat) { p.food = Math.min(100, p.food + f.eat); parts.push('飽 +' + f.eat); }
      if (f.hurt) { p.hp = Math.max(1, p.hp - f.hurt); p.hurtT = 3; parts.push('生冷傷身 −' + f.hurt); }
      if (f.heal) { p.hp = Math.min(p.hpMax, p.hp + f.heal); parts.push('命 +' + f.heal); }
      if (f.warm) { p.warm = Math.min(100, p.warm + f.warm); parts.push('暖 +' + f.warm); }   // 黍酒（v0.9.19）
      if (s.n.charAt(0) === '烤') { p.heatT = Math.min(HEAT_CAP, (p.heatT || 0) + HEAT_PER_MEAL); parts.push('熱氣 ' + Math.round(p.heatT) + ' 息' + (p.heatT >= HEAT_CAP ? '（滿）' : '')); }   // 烤的東西下肚：九十息內凍不傷命，最多一百五十
      if (f.cure && p.poisonT > 0) { p.poisonT = 0; p.poisonPer = 0; p.poisonBy = null; parts.push('毒解了'); }
      if (f.san) { const g0 = this.sanUp(f.san); p.san = Math.min(100, p.san + g0); parts.push('愜意 +' + this.shown('san', g0)); }
      if (f.poison) { this.poison(f.poison[0], f.poison[1]); parts.push('中毒'); }
      if (f.calm && (p.confuseT > 0 || p.fearT > 0)) { p.confuseT = 0; p.fearT = 0; parts.push('亂、懼都好了'); }   // 烤文鰩魚：食之已狂（v0.9.17）
      if (f.meal) { const fu0 = this.fuAlive(); p.mealN = (p.mealN || 0) + 1; if (fu0) parts.push('增益第 ' + p.mealN + ' 頓（服了？服了！只容十五頓）');
        const old = this.mealOn() ? p.meal.k : '', now = this.world.time, he = !!G.MEALS[f.meal].grain && p.sideAt !== undefined && now - p.sideAt <= G.HARMONY_T * DAY;   // 調和（v0.9.18）：一時辰內先吃了肉魚果
        const cut = s.q === 'new' ? CUT_NEW : s.q === 'old' ? CUT_OLD : undefined;
        p.meal = { k: f.meal, until: U.r4(now + G.FISH_MEAL_T * DAY * (he ? G.HARMONY_K : 1)), at: U.r4(now), he: he ? 1 : undefined, cut };
        parts.push('這一頓：' + (cut ? G.MEALS[f.meal].text.replace('四分之一', cut === CUT_NEW ? '三成' : '一成五') + (cut === CUT_NEW ? '（新穀）' : '（陳穀）') : G.MEALS[f.meal].text) + (old && old !== f.meal ? '（換掉了' + G.MEALS[old].dish + '那一頓）' : '') + (he ? '；配著先前吃的，調和，這一頓長一半' : '')); }   // 一次只有一頓（v0.9.17）
      if (f.side) { const m = p.meal, now = this.world.time; p.sideAt = U.r4(now);
        if (this.mealOn() && G.MEALS[m.k].grain && !m.he && now - (m.at || 0) <= G.HARMONY_T * DAY) { m.until = U.r4(m.until + G.FISH_MEAL_T * DAY * (G.HARMONY_K - 1)); m.he = 1; parts.push('飯稻羹魚，調和：' + G.MEALS[m.k].dish + '那一頓長一半'); } }
      SFX.absorb();
      this.message('吃了「' + s.n + '」' + (age >= 1 ? '（最陳的那顆，放了 ' + age + ' 夜）' : '') + '，' + parts.join('，') + '。');
    }
    knockOut(f) {
      const p = this.player;
      p.knock = f.knock; this.action = null; this.keys.clear(); p.wakeFx = f;
      $('knock').classList.remove('hidden');
      this.toast('醉了', '天旋地轉，你昏了過去。六十息後才醒，周圍照常。');
    }
    wake() {
      const p = this.player, f = p.wakeFx || {};
      $('knock').classList.add('hidden');
      if (f.eat) p.food = Math.min(100, p.food + f.eat);
      if (f.san) p.san = Math.min(100, p.san + this.sanUp(f.san));
      if (f.sta) p.sta = Math.max(0, p.sta + f.sta);
      this.toast('醒了', '飽 +2，愜意 +1，力 −5。');
    }

    // ---------- 製作（C） ----------
    toggleCraft() {
      const el = $('craft'); el.classList.toggle('hidden'); this.keys.clear();
      if (!el.classList.contains('hidden')) this.buildCraft();
    }
    canCraft(r) { if (r.crush) return !!this.stoneToCrush(); const need = this.needOf(r); for (const n in need) if (this.count(n) < need[n]) return false; return true; }
    regrindCost(s) { return Math.min(REGRIND_CAP, Math.pow(2, (s && s.rg) || 0)); }   // 1、2、4、8、8……
    needOf(r) { if (r.regrind) { const s = this.activeTool(); return this.fixCost(s) || { '石子': this.regrindCost(s) }; } if (r.mend) { const k = this.mendCost(this.heldNet()); return { '棉': k, '麻': k }; } return r.need; }   // 重磨的料看手上那把磨過幾次；加固看手裡那張網固過幾次
    mendCost(x) { return Math.min(REGRIND_CAP, Math.pow(2, (x && x.rf) || 0)); }   // 加固漁網：棉麻各 1、2、4、8、8……（x 是網的記錄或囊裡那疊）
    heldNet() { const s = this.held(); const it = s && ITEMS[s.n]; return it && it.tile && DB[it.tile] && DB[it.tile].net ? s : null; }   // 手裡選中的那張網
    netName(size) { return size === 1 ? '漁網' : size === 2 ? '中漁網' : '大漁網'; }
    takeHeld(s) { const p = this.player, bag = p.bag; if (s.inf) return; if (s.c > 1) s.c--; else { const i = bag.indexOf(s); if (i >= 0) bag.splice(i, 1); } if (p.sel >= bag.length) p.sel = Math.max(0, bag.length - 1); this.barSig = ''; }   // 用掉手裡那疊的一個（帶耐久的那疊只有一個）
    // 製作欄照配方表的順序一條一條列（v0.6.10 使用者定：拿掉 v0.6 的衍生樹，不再分上下層）；數字鍵 1–9 也照這個順序
    visibleRecipes() { return this.craftCat === '全部' ? G.RECIPES.slice() : G.RECIPES.filter(r => r.cat === this.craftCat); }
    buildCraft() {
      const p = this.player, list = $('craft-list'); list.innerHTML = '';
      $('craft-sta').textContent = Math.floor(p.sta) + '/' + p.staMax + ' · 膽氣第 ' + (this.test ? '∞' : this.level()) + ' 重';
      const cats = $('craft-cats'); cats.innerHTML = '';
      for (const c of G.CRAFT_CATS) {
        const b = document.createElement('button'); b.className = c === this.craftCat ? 'on' : '';
        const n = c === '全部' ? G.RECIPES.length : G.RECIPES.filter(r => r.cat === c).length;
        b.innerHTML = c + '<small>' + n + '</small>';
        b.addEventListener('click', (ev) => { ev.stopPropagation(); this.craftCat = c; this.buildCraft(); });
        cats.appendChild(b);
      }
      if (p.sailing && p.ship) {   // v0.8.19 使用者定：在船上按 C，最上面一列是修這艘船
        const sh = p.ship, f = SHIP_FIX[sh.kind] || SHIP_FIX['孤帆'], need = this.shipFixCost(sh), to = this.shipFixTo(sh), max = this.shipMax(sh), ok = need && this.hasAll(need) && sh.hp < to;
        const row = document.createElement('div'); row.className = 'recipe shipfix' + (ok ? '' : ' cant');
        row.innerHTML = '<span class="head"><span class="num">船</span><b>修' + sh.kind + '</b></span><span class="needs">' + (need ? Object.keys(need).map(n => '<span class="' + (this.count(n) >= need[n] ? 'ok' : 'lack') + '">' + n + ' ' + num(this.count(n)) + '/' + need[n] + '</span>').join(' ') : '<span class="lack">修滿 ' + f.cost.length + ' 次了</span>') + '</span><span class="sta">命 ' + Math.round(sh.hp) + '/' + Math.round(max) + '</span><span class="note">第 ' + Math.min(f.cost.length, (sh.repairs || 0) + 1) + '/' + f.cost.length + ' 次，修回 ' + Math.round(to) + '（命上限的 ' + Math.round(to / max * 100) + '%）</span><button data-shipfix="1"' + (need ? '' : ' disabled') + '>修</button>';
        list.appendChild(row);
      }
      if (this.craftCat === '神兵') this.godsOwned().forEach((s, gi) => {   // v0.8.22：神兵那一類的最上面，一件神兵一列「修」
        const max = ITEMS[s.n].dur, left = s.dur === undefined ? max : s.dur, need = this.fixCost(s), fresh = !this.canRenew(s), ok = !fresh && this.hasAll(need) && p.sta >= 16 && p.food >= 20;
        const row = document.createElement('div'); row.className = 'recipe godfix' + (ok ? '' : ' cant');
        row.innerHTML = '<span class="head"><span class="num">修</span><b>修' + s.n + '</b></span><span class="needs">' + Object.keys(need).map(n => '<span class="' + (this.count(n) >= need[n] ? 'ok' : 'lack') + '">' + n + ' ' + num(this.count(n)) + '/' + need[n] + '</span>').join(' ') + '</span><span class="sta">力 16<br>飽 20</span><span class="note">耐久 ' + Math.ceil(left) + '／' + max + '；這一把第 ' + ((s.rg || 0) + 1) + ' 次修（料是鎢鋼的兩倍）' + (fresh ? '<br><i class="fresh">還剩 ' + Math.round(this.leftFrac(s) * 100) + '%，用過一半才能修</i>' : '') + '</span><button data-godfix="' + gi + '"' + (fresh ? ' disabled title="用過一半才能修"' : '') + '>修</button>';
        list.appendChild(row);
      });
      this.visibleRecipes().forEach((r, i) => {
        const locked = r.level && this.level() < r.level;
        const row = document.createElement('div'); row.className = 'recipe' + (r.choose ? ' choose' : '') + (this.canCraft(r) && p.sta >= r.sta && !locked ? '' : ' cant');
        const need = this.needOf(r);
        const crush = r.crush ? this.stoneToCrush() : null;
        const needs = r.crush ? (crush ? '<span class="ok">' + (crush.from === 'tools' ? '手上' : '囊裡') + '的「' + crush.s.n + '」</span>' : '<span class="lack">要有一把石器</span>')
          : Object.keys(need).map(n => '<span class="' + (this.count(n) >= need[n] ? 'ok' : 'lack') + '">' + n + ' ' + num(this.count(n)) + '/' + need[n] + '</span>').join(' ');
        const owned = r.out && ITEMS[r.out] && ITEMS[r.out].slot && this.ownedPiece(r.out);
        const better = r.out && !owned ? this.betterPiece(r.out) : null;   // 已經有同一格更強的衣甲（v0.7.1）
        const fixing = r.regrind ? this.activeTool() : r.mend ? this.heldNet() : owned || null;   // 這一列要翻新、修、加固的是哪一件
        const fresh = fixing && (r.regrind || r.mend || owned) && !this.canRenew(fixing) && !(r.mend && fixing.dur === undefined);   // 還新：用過一半才能翻新（v0.7.1）
        if (fresh) row.classList.add('cant');
        const godHeld = GODS.indexOf(r.out) >= 0 && !!this.godWhere(r.out);   // v0.8.27：神兵一樣一把
        if (godHeld) row.classList.add('cant');
        const spent = r.id === 'pouch' && this.pouchFull(), allUsed = spent && p.pouches >= MAX_POUCHES;   // 錦囊：已用的加囊裡的湊滿八個就不給造（八個都用了標「已用完」，否則標「已夠八個」）
        if (spent) row.classList.add('cant');
        const title = (r.out ? r.out + (r.n > 1 ? ' ×' + r.n : '') : (r.title || (r.regrind ? '重磨' : r.mend ? '加固' : r.crush ? '研磨石器 → 石子 ×' + CRUSH_PEBBLES : '磨礪'))) + (owned ? ' <i class="dim">已有' + (fresh ? '・還新' : '') + '</i>' : '') + (better ? ' <i class="better">已有更好的「' + better.n + '」！</i>' : '') + (spent ? ' <i class="dim">' + (allUsed ? '已用完' : '已夠八個') + '</i>' : '') + (godHeld ? ' <i class="dim">已有一把（' + this.godWhere(r.out) + '）</i>' : '');
        let btns = '';
        if (r.choose) btns = r.choose.map(c => '<button data-r="' + r.id + '" data-c="' + c + '">' + c + '</button>').join('');
        else btns = godHeld ? '<button data-r="' + r.id + '" disabled>已有</button>' : '<button data-r="' + r.id + '"' + (spent || fresh ? ' disabled' : '') + (fresh ? ' title="還剩 ' + Math.round(this.leftFrac(fixing) * 100) + '%，用過一半才能' + (r.mend ? '加固' : r.regrind ? '磨' : '翻新') + '"' : '') + '>' + (spent ? (allUsed ? '已用完' : '已夠') : r.regrind ? '磨' : r.mend ? '固' : r.crush ? '碎' : owned ? '翻新' : '造') + '</button>';
        row.innerHTML = '<span class="head"><span class="num">' + (i + 1) + '</span><b>' + title + '</b></span><span class="needs">' + needs + '</span><span class="sta">力 ' + r.sta + (r.food ? '<br>飽 ' + r.food : '') + (locked ? '<br><i>需' + r.level + '重</i>' : '') + '</span><span class="note">' + r.note + (fresh ? '<br><i class="fresh">還剩 ' + Math.round(this.leftFrac(fixing) * 100) + '%，用過一半才能' + (r.mend ? '加固' : r.regrind ? (this.metalOf(fixing.n) ? '修' : '重磨') : '翻新') + '</i>' : '') + (r.regrind && this.activeTool() ? '（這把第 ' + (((this.activeTool().rg) || 0) + 1) + ' 次：' + Object.entries(this.needOf(r)).map(([k, v]) => k + ' ' + v).join('、') + '）' : '') + (r.mend && this.heldNet() ? '<br><i>這張第 ' + ((this.heldNet().rf || 0) + 1) + ' 次：棉麻各 ' + this.mendCost(this.heldNet()) + (this.heldNet().dur === undefined ? '；還沒用過，不用固' : '，耐 ' + this.heldNet().dur + '／' + this.world.netDur(DB[ITEMS[this.heldNet().n].tile].net)) + '</i>' : '') + '</span><span class="btns">' + btns + '</span>';
        list.appendChild(row);
      });
      list.querySelectorAll('button').forEach(b => b.addEventListener('click', (ev) => { ev.stopPropagation(); if (b.dataset.shipfix) { this.repairShip(this.player.ship); this.buildCraft(); return; } if (b.dataset.godfix !== undefined) { this.godFix(this.godsOwned()[+b.dataset.godfix]); return; } this.craft(b.dataset.r, b.dataset.c); }));
    }
    craft(id, choice) {
      const p = this.player, r = G.RECIPES.find(x => x.id === id); if (!r || !this.canAct()) return;
      if (p.swimming) { this.message('身在水中，無從下手；先上岸。'); return; }
      if (r.level && this.level() < r.level) { this.message('膽氣不夠：要第 ' + r.level + ' 重。'); SFX.fail(); return; }
      if (r.id === 'pouch' && this.pouchFull()) { this.message(p.pouches >= MAX_POUCHES ? '八個錦囊都用了，囊再大也背不動，不用再織。' : '已經用了 ' + p.pouches + ' 個、囊裡還有 ' + this.count('錦囊') + ' 個，湊滿八個了，不用再織。'); SFX.fail(); return; }
      if (GODS.indexOf(r.out) >= 0 && this.godWhere(r.out)) { this.message('「' + r.out + '」天下只此一把：前一把還在' + this.godWhere(r.out) + '，壞了或沒了才能再鑄。'); SFX.fail(); return; }   // v0.8.27 使用者定
      if (!this.canCraft(r)) { this.message(r.crush ? '手上或囊裡要有一把石器（石刀、石鎬、石鋤、石劍、石斧）才能研磨。' : '材料未備。'); SFX.fail(); return; }
      if (p.sta < r.sta) { this.message('力有未逮，且歇一歇。'); SFX.fail(); return; }
      let out = r.out, n = r.n || 1;
      if (r.choose) { if (!choice) { this.message('選一個方向：刀、鎬、鋤、劍、斧。'); return; } out = choice; }
      if (r.choose && ITEMS[out] && ITEMS[out].tung && p.food < 10) { this.message('太餓了，鍛不動鎢鋼。'); SFX.fail(); return; }
      if (r.crush) {   // 舊石器磨回石子二（v0.6.4）
        const c = this.stoneToCrush(); if (!c) { this.message('手上或囊裡要有一把石器（石刀、石鎬、石鋤、石劍、石斧）。'); SFX.fail(); return; }
        if (c.from === 'tools') { const i = p.tools.indexOf(c.s); p.tools.splice(i, 1); p.tool = -1; } else p.bag.splice(p.bag.indexOf(c.s), 1);
        const at = this.giveNear('石子', CRUSH_PEBBLES); p.sta -= r.sta; this.barSig = ''; this.afterCraft(r);
        this.message('「' + c.s.n + '」磨回了石子 ' + CRUSH_PEBBLES + '。' + (at ? '囊滿了，石子用小囊包著擱在' + at.where + '。' : '') + (c.from === 'tools' ? '空手。' : '')); SFX.fuse(); this.buildCraft(); this.buildBag(); return;
      }
      if (r.mend) {   // 加固手裡那張網：耐久回滿，棉麻各 1、2、4、8
        const s = this.heldNet(); if (!s) { this.message('囊裡要選中一張漁網（放著的網面向按 F 也能固）。'); SFX.fail(); return; }
        const size = DB[ITEMS[s.n].tile].net, max = this.world.netDur(size);
        if (s.dur === undefined || s.dur >= max) { this.message('這張' + s.n + '還結實（耐 ' + max + '／' + max + '），不用加固。'); SFX.fail(); return; }
        if (!this.canRenew(s)) { this.tooNew(s, '加固'); return; }
        const k = this.mendCost(s); this.removeItem('棉', k); this.removeItem('麻', k); s.dur = max; s.rf = (s.rf || 0) + 1;
        p.sta -= r.sta; this.barSig = ''; this.afterCraft(r); this.message('「' + s.n + '」加固了，用了棉麻各 ' + k + '，耐久回 ' + max + '；下次要各 ' + this.mendCost(s) + '。'); SFX.fuse(); this.buildCraft(); this.buildBag(); return;
      }
      if (r.regrind) {
        const s = this.activeTool(); if (!s) { this.message('具欄裡要選中一把工具（P 換）。'); SFX.fail(); return; }
        if (ITEMS[s.n].brittle) { this.message('「' + s.n + '」是黑曜石磨的，鋒利但脆，磨不回來；鈍了就碎，再做一把。'); SFX.fail(); return; }
        if (!this.canRenew(s)) { this.tooNew(s, this.metalOf(s.n) ? '修' : '重磨'); return; }
        const tung = !!ITEMS[s.n].tung, god = GODS.indexOf(s.n) >= 0, extraSta = god ? (r.sta + 5) * GOD_FIX - r.sta : tung ? 5 : 0, food = god ? 10 * GOD_FIX : tung ? 10 : 0;   // 鎢鋼具重磨耗力八、飽十；神兵兩倍（力十六、飽二十）
        if (p.sta < r.sta + extraSta) { this.message('力有未逮，且歇一歇（鎢鋼具要力 ' + (r.sta + extraSta) + '）。'); SFX.fail(); return; }
        if (food && p.food < food) { this.message(god ? '太餓了，修不動神兵。' : '太餓了，磨不動鎢鋼。'); SFX.fail(); return; }
        const need = this.needOf(r); for (const n in need) this.removeItem(n, need[n]); s.rg = (s.rg || 0) + 1;   // 石具用石子；鋼具、鎢鋼具用鐵（與鎢鋼），v0.6.3
        p.sta -= r.sta + extraSta; if (food) p.food -= food; s.dur = ITEMS[s.n].dur; this.barSig = ''; this.afterCraft(r); this.message('「' + s.n + '」' + (this.metalOf(s.n) ? '修好了' : '磨利了') + '，用了' + this.matText(need) + '；下次要' + this.matText(this.needOf(r)) + '。'); SFX.fuse(); this.buildCraft(); this.buildBag(); return;
      }
      const def = ITEMS[out], owned = def && def.slot ? this.ownedPiece(out) : null;
      if (owned) {       // 同一類衣甲只留一件：再造只是翻新
        if (!this.canRenew(owned)) { this.tooNew(owned, '翻新'); return; }
        for (const m in r.need) this.removeItem(m, r.need[m]);
        p.sta -= r.sta; const gain = this.afterCraft(r);
        if (def.light) owned.fuel = HAT_FUEL; else { owned.dur = this.lifeOf(owned); owned.wm = 1; }
        this.barSig = ''; this.toast('「' + out + '」翻新了', '同一類衣甲只留一件：壽命回滿，損耗重新起算。　愜意 +' + this.shown('san', gain)); SFX.fuse();
        this.buildCraft(); this.buildBag(); return;
      }
      if (!this.canAdd(out, n)) { this.message(this.isShip(out) ? '船艙滿了（最多帶 ' + HOLD_MAX + ' 艘），造好了也沒處放。' : '囊已滿。'); SFX.fail(); return; }
      if (r.food && p.food < r.food) { this.message('太餓了，砌不動（要飽 ' + r.food + '）。'); SFX.fail(); return; }   // 台與階：耗力也耗飽
      for (const m in r.need) this.removeItem(m, r.need[m]);
      p.sta -= r.sta; if (r.food) p.food -= r.food; this.addItem(out, n); const gain = this.afterCraft(r);
      this.toast('造了「' + out + '」' + (n > 1 ? ' ×' + n : ''), G.item(out).flavor + '　愜意 +' + this.shown('san', gain)); SFX.fuse();
      this.buildCraft(); this.buildBag();
    }
    afterCraft(r) {
      const p = this.player, now = this.world.time, e = p.craftLog[r.id], n = e && now - e.t <= 60 ? e.n + 1 : 1;
      p.craftLog[r.id] = { t: now, n };
      const gain = this.sanUp([8, 4, 2, 1][Math.min(n - 1, 3)] * this.mult());
      p.san = Math.min(100, p.san + gain); this.addCourage(r.sta); this.stats.crafted++;
      return gain;
    }

    // ---------- 睡（R） ----------
    bedAt() { const p = this.player; for (const [dx, dy] of [[p.fx, p.fy]].concat(N8)) if (this.world.get(p.x + dx, p.y + dy) === '床') return { x: p.x + dx, y: p.y + dy }; return null; }
    bedNear() { return !!this.bedAt(); }
    sleep() {
      const p = this.player; if (!this.canAct()) return;
      if (!this.bedNear()) { this.message('無床可臥。六團棉、兩塊木。'); return; }
      if ((p.fight && !p.fight.away) || p.trial) { this.message(p.fight ? '兵戈未息，不得安眠。' : '試煉還沒完，睡不著。'); SFX.fail(); return; }
      if (p.chokeT > 0) { this.message('喘不上氣（窒），睡不著。'); SFX.fail(); return; }   // v0.8.25   // v0.8.8；v0.8.10 戰事掛著、人在地界外睡得著（睡過去的時辰照樣算在外）
      if (!this.isNight()) { const t0 = this.dayT(); this.message(t0 < this.dawnT() + 0.08 ? '天色已明，睡意全無。' : '白日不眠。'); return; }
      if (this.ents.ghostNear(p.x, p.y, 8) && !this.world.lightNear(p.x, p.y, 3)) { this.message('魄在近旁，難以成眠。床邊三格內點一盞燈，魄就近不了身。'); SFX.fail(); return; }
      const w = this.world, t = this.dayT();
      p.bed = this.bedAt();   // 最近睡過的床（v0.8：囊滿時的要緊東西擱在它旁邊）
      const d0 = Math.floor(w.time / DAY), late = t >= this.duskT(), slept = ((late ? 1 - t : 0) + CAL.dawn(late ? d0 + 1 : d0) - (late ? 0 : t) + 0.01) * DAY;   // 睡到那天的日出（照節氣，v0.9.17）
      w.time += slept;   // 晚上睡到次日清晨，凌晨睡到當日清晨
      if (p.azure) this.mendShips(slept);   // 睡過的這段，船也照樣回命
      for (let i = 0; i < 80; i++) w.step(p.x, p.y);
      const win = this.windowShare(), bonus = this.windowBonus(win), san = U.r4(SLEEP_SAN * (1 + bonus));   // 窗多的屋子睡得舒坦
      p.warm = 100; p.sta = p.staMax; p.food = Math.max(0, p.food - 12 * this.diff.hunger); p.san = Math.min(100, p.san + san); p.hp = Math.min(p.hpMax, p.hp + 10);
      this.ents.list = this.ents.list.filter(e => '虎豹狼蛇蛛魄豬'.indexOf(e.type) < 0);
      this.gatherCompanions();
      this.stats.nights++; p.warned = {};
      if (bonus) p.sanBoostUntil = w.time + DAY;   // 窗夠的屋子睡過一覺：之後一整天愜意回得快 5%
      const yan = this.swallowVisit(win); if (yan) p.san = Math.min(100, p.san + yan);   // 春分「玄鳥至」（v0.9.19）
      this.toast(yan ? '玄鳥至' : '一夜無夢', '天亮了。愜意 +' + this.shown('san', san) + (bonus ? '（窗是屋內面積的 ' + fmt(win * 100) + '%，多回 ' + Math.round(bonus * 100) + '%；今天一整天愜意回得快 5%）' : '') + '。' + (yan ? '屋簷下有燕子銜泥築巢，春分了。愜意再 +' + this.shown('san', yan) + '。' : ''));
      this.save();
    }

    // ---------- 櫃 ----------
    // 櫃裡自動歸類（v0.4.13）：同名、沒耐久的疊先併在一起，再按類排（工具、衣甲、建材、食物、其餘材料），同類按筆畫、同名耐久多的在前
    sortChest(box) {
      const infs = new Set(box.filter(s => s.inf).map(s => s.n));   // 測試格：櫃裡也是無數個，同名的併進那一疊（v0.8.10）
      if (infs.size) for (let j = box.length - 1; j >= 0; j--) { const b = box[j]; if (infs.has(b.n) && !b.inf && b.dur === undefined && !b.store) box.splice(j, 1); }
      for (let i = 0; i < box.length; i++) {
        const a = box[i]; if (a.dur !== undefined || a.store || this.aged(a.n) || a.inf) continue;   // 果與五穀（v0.9.19）不併，每顆的日子才留得住
        for (let j = box.length - 1; j > i; j--) { const b = box[j]; if (b.n !== a.n || b.dur !== undefined || b.store || this.aged(b.n) || b.inf || (b.q || '') !== (a.q || '')) continue; const k = Math.min(b.c, STACK - a.c); a.c += k; b.c -= k; if (b.c <= 0) box.splice(j, 1); }
      }
      const cls = (s) => { const it = G.item(s.n) || {}; return it.tool ? 0 : (it.slot || it.kind === 'wear') ? 1 : (it.tile || it.kind === 'build' || it.ship || (DB[s.n] && DB[s.n].kind === 'object' && DB[s.n].place)) ? 2 : it.food ? 3 : 4; };
      const key = (s) => [cls(s), (G.item(s.n) || {}).s || 0, s.n, -(s.dur === undefined ? 1e9 : s.dur)];
      box.sort((a, b) => { const ka = key(a), kb = key(b); for (let i = 0; i < 4; i++) { if (ka[i] < kb[i]) return -1; if (ka[i] > kb[i]) return 1; } return 0; });
      return box;
    }
    openChest(t) {
      this.chestAt = U.key(t.x, t.y);
      if (!this.world.chests.has(this.chestAt)) this.world.chests.set(this.chestAt, []);
      this.sortChest(this.world.chests.get(this.chestAt));
      $('chest').classList.remove('hidden'); this.keys.clear(); this.buildChest();
    }
    closeChest() { $('chest').classList.add('hidden'); this.chestAt = null; }
    takeChest() {        // 連裡面的東西一起拆下（東西記在囊裡那個「櫃」上，重放回去就還在）；拆回不長膽氣
      const k = this.chestAt; if (!k) return;
      const box = this.world.chests.get(k) || [], p = this.player;
      if (box.length ? this.bagUsed() >= this.slots() : !this.canAdd('櫃', 1)) { this.message('囊已滿。'); SFX.fail(); return; }
      const [x, y] = U.unkey(k);
      if (!this.takeOk) { this.askTake({ x, y }, '櫃', () => this.confirmed(() => this.takeChest())); return; }
      this.world.set(x, y, '白'); this.world.chests.delete(k);
      if (box.length) this.addItem('櫃', 1, { store: box }); else this.addItem('櫃', 1);
      this.closeChest(); this.buildBag(); this.message(box.length ? '拆下了櫃，裡面 ' + box.length + ' 樣東西還在櫃裡。' : '拆下了櫃。'); SFX.absorb();
    }
    buildChest() {
      const box = this.world.chests.get(this.chestAt) || [], p = this.player;
      const mk = (s, i, from) => {
        const el = document.createElement('div'), span = s ? this.spanOf(s.n) : 1; el.className = 'slot bag' + (s ? '' : ' empty') + (span > 1 ? ' wide ship' : '');
        if (span > 1) el.style.setProperty('--span', span);
        if (s) { el.innerHTML = (span > 1 ? '<span class="shipname">' + s.n + '</span>' : '<span class="ch' + (s.n.length > 1 ? ' word' : '') + '">' + s.n + '</span>') + '<span class="cost">' + (span > 1 ? ['', '', '兩', '三', '四', '五'][span] + '格' : s.n === '麻布包' ? '油 ' + (s.oil || 0) + '/' + OIL_PER_BAG : this.durText(s)) + '</span>'; el.title = G.item(s.n).flavor + (s.store && s.store.length ? '\n裡面：' + s.store.map(x => x.n + '×' + x.c).join('、') : ''); }
        el.addEventListener('mousedown', (ev) => { ev.stopPropagation(); if (!s) return; this.moveStack(from, i); });
        return el;
      };
      const fill = (el, list, cap, from) => { el.innerHTML = ''; const n = list.length + Math.max(0, cap - this.bagUsed(list)); for (let i = 0; i < n; i++) el.appendChild(mk(list[i], i, from)); };   // 船佔幾格就少幾個空格
      fill($('chest-grid'), box, CHEST_SLOTS, 'chest'); fill($('chest-bag'), p.bag, this.slots(), 'bag');
    }
    moveStack(from, i) {
      const box = this.world.chests.get(this.chestAt), p = this.player;
      if (!box) return;
      if (from === 'chest') {
        const s = box[i]; if (!s) return;
        const ds = this.aged(s.n) ? this.fruitDays(s).slice() : undefined;
        const left = this.addItem(s.n, s.c, { dur: s.dur, wm: s.wm, fuel: s.fuel, ds, store: s.store, oil: s.oil, inf: s.inf, ship: s.ship, rg: s.rg, rf: s.rf, q: s.q });   // 裝著東西的櫃、灶：裡面的跟著回囊；麻布包連油一起
        if (left > 0) { s.c = left; if (ds) s.ds = ds.slice(ds.length - left); this.message(this.isShip(s.n) ? '船艙滿了（最多帶 ' + HOLD_MAX + ' 艘）。' : '囊裡放不下這麼多。'); } else box.splice(i, 1);
      } else {
        const s = p.bag[i]; if (!s) return;
        if (this.bagUsed(box) + this.spanOf(s.n) > CHEST_SLOTS) { this.message(this.spanOf(s.n) > 1 ? '櫃裡放不下這艘' + s.n + '（要 ' + this.spanOf(s.n) + ' 格）。' : '櫃滿了。'); return; }
        box.push(s); p.bag.splice(i, 1); if (p.sel >= p.bag.length) p.sel = Math.max(0, p.bag.length - 1); this.barSig = ''; this.sortChest(box);
      }
      SFX.write(); this.buildChest(); this.buildBag();
    }

    // ---------- 船 ----------
    board(t) {   // 上船：踩上去的那格（或面向的那格）就是你在船上站的位置（v0.8.17）
      const rec = this.world.shipAt(t.x, t.y); if (!rec) return;
      if (this.level() < SEA_WARN_LEVEL) { this.askSea(rec, t); return; }
      this.doBoard(rec, t);
    }
    askSea(rec, at) {
      this.seaAsk = rec; this.seaAt = at || null; this.paused = true; this.keys.clear(); this.action = null;
      const a = this.shipSkulls(rec);
      $('seaask-text').innerHTML = '<b>建議卅一重、帶上神兵再下海。</b>你的膽氣第 ' + this.level() + ' 重；卅一重可鑄九閽鳴雷與燭龍焚溟，海裡的蜃只怕燭龍焚溟。<br>海上有蜃：命 ' + this.bigHp(DB['蜃'].hp) + '，撞船一下二十五，吐海霧；船毀了只有六十息游上岸。' + (a.length ? '這艘' + rec.kind + '船頭有' + a.map(x => x[0]).join('、') + '鎮著，最久到 ' + this.wardDaysOf(rec) + ' 日後。' : '這艘' + rec.kind + '船頭沒有首骨。') + '<br>真的要出海？';
      $('seaask').classList.remove('hidden');
    }
    closeSea() { $('seaask').classList.add('hidden'); this.seaAsk = null; this.paused = false; }
    seaGo() { const rec = this.seaAsk, at = this.seaAt; this.closeSea(); if (rec && rec.cells && this.world.ships.get(U.key(rec.cells[0][0], rec.cells[0][1])) === rec) this.doBoard(rec, at); }
    doBoard(rec, at) {
      const p = this.player, w = this.world, [ax, ay] = rec.cells[0];     // 船開走了，水面還原；船的命與船頭首骨跟著人走
      if (!this.fightShip(rec)) { this.message(this.shipLimitText()); SFX.fail(); return; }   // 洞庭這一場最多三艘（v0.8.16）
      const xs = rec.cells.map(c => c[0]), ys = rec.cells.map(c => c[1]), dist = (c) => U.cheb(c[0], c[1], p.x, p.y);
      const on = at && rec.cells.some(([x, y]) => x === at.x && y === at.y) ? [at.x, at.y] : rec.cells.slice().sort((a, b) => dist(a) - dist(b))[0];   // 站上踩的那格；沒指定就最近的一格
      w.removeShip(w.shipCells.get(U.key(ax, ay)) || U.key(ax, ay));
      p.ship = { kind: rec.kind, hp: rec.hp, skulls: this.shipSkulls(rec), repairs: rec.repairs || 0, fid: rec.fid, dir: World.shipDir(rec), x0: Math.min(...xs), y0: Math.min(...ys), t: rec.t };
      p.fromX = p.x; p.fromY = p.y; p.x = on[0]; p.y = on[1]; p.moveT = 0.2; p.stepDur = 0.2; p.sailing = true; p.shipMove = false;
      if (p.swimming) { p.swimming = false; p.swimT = 0; p.deploy = null; }   // 游到停著的船邊爬上去
      this.toast('上了' + rec.kind, this.shipText(p.ship) + '。WASD 在船上走，1 左、2 上、3 下、4 右開船；走上岸就下船，船停在原地。深水亦可渡，海上有' + (G.GEN >= 3 ? '大陸與島' : '外島') + (G.GEN >= 2 ? '、孤嶼' : '') + '可登，開出這張紙的邊便渡海而去。海上有蜃。');
    }
    crossSea() {
      const p = this.player; p.crossed = true; this.paused = true;
      $('voyage-text').innerHTML = '第 ' + this.day() + ' 日，你駕著自己造的船，開出了這張紙。<br>膽氣第 ' + (this.test ? '∞' : this.level()) + ' 重 · 睡過 ' + this.stats.nights + ' 夜 · 讀了 ' + this.stats.read + ' 處 · 死過 ' + p.deaths + ' 次。';
      $('voyage').classList.remove('hidden');
      this.save();
    }

    // ---------- 探索 ----------
    landIsle(isl) {      // 第一次登上一座外島（v0.7）：記下來、長膽氣、告訴玩家這是哪種島
      const p = this.player; p.isles = p.isles || {}; p.isles[isl.id] = 1;
      const n = Object.keys(p.isles).length, gain = this.addCourage(ISLE_COUR, 'isle'), gt = this.isleGate(isl);
      const what = { '漠': '大漠黃沙：白天力不回、夜裡冷；綠洲有池水椰棗。', '火': '火山：熔岩燙人、兩格內暖；岩裡有黑曜石。', '川': '河湖縱橫，水是淡的，林木茂密。', '雪': '冰雪寒地：山腹有洞窟（要帶光），山腳有溫泉。', '青': '尋常的山林田野。' }[isl.kind];
      this.toast('登上' + isl.name + '（第 ' + n + ' 座）', what + (gain > 0 ? ' 膽氣 +' + fmt(this.shown('isle', gain)) + '。' : '') + this.gateNews(gt), 7000); SFX.learn();
    }
    enterZone(z) {       // 第一次到四方地界的一處（v0.8.4）：記下來、長膽氣、說這是哪裡；v0.8.21 立傳送點
      const p = this.player; p.zones = p.zones || {}; p.zones[z.id] = 1;
      const gain = this.addCourage(ISLE_COUR, 'isle'), gt = G.GEN >= 3 ? null : this.zoneGate(z);   // v0.8.27 第三版：傳送點在地界外那一圈，不在島心
      this.toast((z.type === 'deep' || z.type === 'lake' ? '到了' : '登上') + z.name, ZONE_TEXT[z.id] + (gain > 0 ? ' 膽氣 +' + fmt(this.shown('isle', gain)) + '。' : '') + this.gateNews(gt), 8000); SFX.learn();
    }
    // ---------- v0.8.27 第三版：陸塊與取名（使用者定：一千二百格以上的陸地才有名字、膽氣、傳送點，名字盡量讓玩家取） ----------
    landMass(m) {        // 第一次登上一塊陸地：記下來、請玩家挑個名字（v0.8.28 使用者定：不打字，從系統給的地名裡挑；v0.8.29 不再長膽氣）
      const p = this.player; p.masses = p.masses || {}; p.masses[m.id] = 1; p.massOrder = p.massOrder || []; if (p.massOrder.indexOf(m.id) < 0) p.massOrder.push(m.id);   // massOrder：發現的先後（物件的數字鍵會照大小排）
      const n = p.massOrder.length, rg = G.regionAt(p.x, p.y, this.seed);   // v0.8.29 使用者定：大陸塊不給膽氣（膽氣在傳送點）
      this.askName({ kind: 'mass', id: m.id, title: '登上第 ' + n + ' 塊陸地', text: () => '這塊陸地約 ' + this.areaText(m.area) + '，腳下是' + rg.name + '。給它挑個名字：' });
      SFX.learn();
    }
    areaText(a) { return a >= 1e6 ? (Math.round(a / 1e5) / 10) + ' 百萬格' : a >= 1e4 ? Math.round(a / 1e3) / 10 + ' 萬格' : Math.round(a / 100) * 100 + ' 格'; }
    massDefault(m) {     // 沒挑過名字的（挑到一半存檔關掉）先叫地名池裡第一個沒用過的；池子用完了照地貌
      const used = this.namesUsed(), free = G.namePools(this.seed).mass.find(n => !used.has(n)); if (free) return free;
      const base = (MASS_KIND_NAME[G.regionAt(m.cx, m.cy, this.seed).kind] || '青') + (m.area >= 1e5 ? '洲' : '島');
      for (let i = 1; ; i++) { const nm = base + (i > 1 ? '二三四五六七八九十'.charAt(i - 2) || String(i) : ''); if (!used.has(nm)) return nm; }
    }
    massName(id) { const p = this.player, nm = (p.massNames || {})[id]; if (nm) return nm; const m = G.masses(this.seed).list[id]; return m ? this.massDefault(m) : '無名之地'; }
    namesUsed() { const p = this.player, s = new Set(Object.values(p.massNames || {})); for (const t of Object.values(p.gates || {})) if (t.nm) s.add(t.nm); return s; }   // 陸塊與傳送點用過的名字（不重複）
    // ---------- v0.8.28 取名框：系統照主題生成地名（glyphs.js 的 namePools，陸塊、陸上、海上各一池，都比這張紙上的數目多），玩家挑一個 ----------
    askName(req) {       // req：{ kind: 'mass'|'land'|'sea', id（陸塊）或 key（傳送點）, title, text（字串或函式，輪到才寫） }；一次只開一個，其餘排隊
      (this.nameQueue = this.nameQueue || []).push(req); if (!this.naming) this.nextName();
    }
    nextName() {
      const req = (this.nameQueue || []).shift();
      if (!req) { $('namebox').classList.add('hidden'); this.naming = null; this.paused = false; return; }
      this.naming = Object.assign(req, { page: 0 }); this.paused = true; this.keys.clear(); this.action = null; if (this.stopWalk) this.stopWalk();
      $('name-title').textContent = req.title; $('name-text').textContent = typeof req.text === 'function' ? req.text() : req.text;
      this.namePage(); $('namebox').classList.remove('hidden');
    }
    nameChoices() {      // 這一批：池子裡沒用過的，NAME_PICK 個一批；用完了接回第一批
      const t = this.naming, used = this.namesUsed(), free = G.namePools(this.seed)[t.kind].filter(n => !used.has(n));
      if (!free.length) { const base = t.kind === 'sea' ? '海津' : t.kind === 'land' ? '建木' : '新洲'; for (let i = 2; ; i++) { const nm = base + ('二三四五六七八九十'.charAt(i - 2) || String(i)); if (!used.has(nm)) return { list: [nm], pages: 1 }; } }
      const pages = Math.ceil(free.length / NAME_PICK), pg = t.page % pages; return { list: free.slice(pg * NAME_PICK, pg * NAME_PICK + NAME_PICK), pages };
    }
    namePage() {
      const c = this.nameChoices(); this.naming.list = c.list;
      $('name-opts').innerHTML = c.list.map((n, i) => '<button data-n="' + i + '"><kbd>' + NAME_KEY_LABEL[i] + '</kbd> ' + n + '</button>').join('');
      $('name-opts').querySelectorAll('button[data-n]').forEach(b => b.addEventListener('click', () => this.nameOk(+b.dataset.n)));
      $('name-more').disabled = c.pages <= 1;
    }
    nameMore() { if (!this.naming) return; this.naming.page++; this.namePage(); }   // 換一批
    nameOk(i) {          // 挑了第 i 個（不給就是第一個）
      const t = this.naming; if (!t) return; const p = this.player, nm = (t.list || [])[i | 0] || (t.list || [])[0]; if (!nm) return;
      let what = '';
      if (t.kind === 'mass') { p.massNames = p.massNames || {}; p.massNames[t.id] = nm; what = '這塊陸地叫「' + nm + '」'; }
      else { const g = (p.gates || {})[t.key]; if (g) g.nm = nm; what = (t.kind === 'sea' ? '這處海津叫「' : '這棵' + (g ? g.name : '建木') + '叫「') + nm + '」'; }
      this.toast(what, t.kind === 'mass' ? '狀態列、大地圖都寫這個名字。' : '傳送的清單裡寫這個名字。', 5000);
      this.nextName(); this.save();
    }
    nameResume() {       // 讀檔：挑名字挑到一半關掉的，再問一次
      const p = this.player;
      for (const id of p.massOrder || []) if (!(p.massNames || {})[id]) { const m = G.masses(this.seed).list[id]; if (m) this.askName({ kind: 'mass', id, title: '這塊陸地還沒有名字', text: '約 ' + this.areaText(m.area) + '。給它挑個名字：' }); }
      for (const [k, g] of Object.entries(p.gates || {})) if (g.net !== undefined && !g.nm && g.place !== '原點') this.askName({ kind: g.water ? 'sea' : 'land', key: k, title: '這處傳送點還沒有名字', text: (g.water ? '海上的一處海津' : '一棵' + g.name) + '（' + this.gateHint(g) + '）。給它挑個名字：' });
    }
    // 傳送點網：生成時就擺好（glyphs.js 的 gateNet），走近點亮；海上的要選一艘船才傳得過去
    netGates() {
      const p = this.player; p.gates = p.gates || {};
      for (const g of G.gateNet(this.seed).list) { if (p.gates['n:' + g.id] || U.cheb(g.x, g.y, p.x, p.y) > GATE_LIGHT) continue; this.lightGate(g, true); }
    }
    lightGate(g, say) {
      const p = this.player, k = 'n:' + g.id; p.gates = p.gates || {}; if (p.gates[k]) return k;
      const z = g.home ? null : G.zones(this.seed).find(o => { const d = Math.hypot(g.x - o.x, g.y - o.y), T = G.zoneTerr(o); return d >= T && d <= T + G.GATE_RING; }) || null, sea = g.type === 'sea';   // 地界外那一圈（照距離，一圈一到兩個）
      const place = g.home ? '原點' : z ? z.name + (sea ? '外的海上' : '外') : sea ? '海上，原點' + this.dirName(g.x, g.y) + '約 ' + Math.max(10, Math.round(Math.hypot(g.x, g.y) / 10) * 10) + ' 格' : '';
      const fixed = z && !Object.values(p.gates).some(t => t.ring === z.id);   // v0.8.29 使用者定：地界外那一圈第一個點亮的就叫地界的名字，第二個才挑
      p.gates[k] = { x: g.x, y: g.y, name: GATE_NAMES[g.glyph] || '建木', place, water: sea || undefined, mass: !sea && !g.home && !z && g.mass !== null ? g.mass : undefined, net: g.id, ring: z ? z.id : undefined, nm: fixed ? z.name : undefined };
      if (say && !g.home) {   // v0.8.28 使用者定：每點亮一處（原點那處不算）長膽氣（v0.8.29 改 +6、廿二重後也給），再請你給它挑個名字
        const t = p.gates[k], credit = (p.gateCredit || 0) > 0, gain = credit ? 0 : this.addCourage(GATE_COUR, 'gate');   // v0.9.5：搬到新紙以前點亮過的那幾處，重點不再給膽氣
        if (credit) p.gateCredit--;
        if (fixed) { this.toast('點亮了一處傳送點：' + z.name, (sea ? '海上的一處海津' : '一棵' + t.name) + '，在' + z.name + '外，就叫「' + z.name + '」。' + (gain > 0 ? '膽氣 +' + fmt(this.shown('gate', gain)) + '。' : '') + '往後在惜字亭或建木、扶桑、若木前按 E，寫「' + z.name + '」就傳得到' + (sea ? '——要撐一艘船過去' : '') + '。', 8000); SFX.learn(); return k; }
        this.askName({ kind: sea ? 'sea' : 'land', key: k, title: '點亮了一處傳送點', text: () => (sea ? '海上的一處海津' : '一棵' + t.name) + '（' + this.gateHint(t) + '）。' + (gain > 0 ? '膽氣 +' + fmt(this.shown('gate', gain)) + '。' : '') + '往後在惜字亭或建木、扶桑、若木前按 E，寫這個地名就傳得到' + (sea ? '——傳到海上要撐一艘船過去' : '') + '。給這裡挑個名字：' });
        SFX.learn();
      }
      return k;
    }
    netGateAt(x, y) { if (G.GEN < 3) return null; const g = G.gateNet(this.seed).list.find(o => o.type === 'land' && o.x === x && o.y === y); return g ? this.lightGate(g, true) : null; }
    gatePlace(t) { return !t ? '' : t.nm || (t.mass !== undefined ? this.massName(t.mass) : t.place); }   // v0.8.28：挑過名字的寫名字
    waterWord(t) { const z = t && t.zid ? G.zones(this.seed).find(o => o.id === t.zid) : null; return z && z.type === 'lake' ? '湖上' : '海上'; }   // 洞庭是湖
    gateLabel(t) { const h = !t.nm ? '' : t.ring && t.place && t.place.indexOf(t.nm) === 0 ? '地界' + t.place.slice(t.nm.length) : this.gateHint(t); return t.water ? this.gatePlace(t) + '（' + (h && h !== '海上' ? h + '，' : this.waterWord(t) + '，') + '要撐船）' : this.gatePlace(t) + '的' + t.name + (h ? '（' + h + '）' : ''); }   // 傳送清單上的一列（v0.8.28）；地界外那一圈第一個叫地界的名字，括號裡就不再寫一次（v0.8.29）
    gateHint(t) { return !t ? '' : t.mass !== undefined ? this.massName(t.mass) + '上' : t.place || (t.water ? '海上' : ''); }   // 在哪裡：陸塊、地界外、海上
    // ---------- 傳送（v0.8.21 使用者定） ----------
    gateName(zid) { return GATE_EAST.indexOf(zid) >= 0 ? '扶桑' : GATE_WEST.indexOf(zid) >= 0 ? '若木' : '建木'; }
    gateSpot(cx, cy, maxR) {   // 島心附近一格平地：自己與四周八格都走得過、不是水；離島心至少四格（神獸站在島心）
      const w = this.world, p = this.player, open = (x, y) => { const d = DB[w.get(x, y)]; return !!d && d.walk > 0 && d.kind !== 'water' && d.kind !== 'object' && d.kind !== 'place' && !d.bog && !w.shipCells.has(U.key(x, y)); };
      const ok = (x, y) => { if (Math.hypot(x - cx, y - cy) < 4 || !open(x, y) || w.stele(x, y) || this.ents.at(x, y) || (x === p.x && y === p.y)) return false; for (const [dx, dy] of N8) if (!open(x + dx, y + dy)) return false; return true; };
      return this.nearestTile(Math.round(cx), Math.round(cy), ok, maxR);
    }
    placeGate(key, name, place, cx, cy, maxR, water, zid) {
      const p = this.player; p.gates = p.gates || {}; if (p.gates[key]) return p.gates[key];
      if (water) return (p.gates[key] = { x: Math.round(cx), y: Math.round(cy), name: '水上', place, water: true, zid });
      const at = this.gateSpot(cx, cy, maxR); if (!at) return null;
      this.world.set(at[0], at[1], GATE_GLYPH[name]); return (p.gates[key] = { x: at[0], y: at[1], name, place, zid });
    }
    zoneGate(z) { return this.placeGate('z:' + z.id, this.gateName(z.id), z.name, z.x, z.y, z.solid || z.r, z.type === 'deep' || z.type === 'lake', z.id); }
    isleGate(isl) { return this.placeGate('i:' + isl.id, '建木', isl.name, isl.cx, isl.cy, Math.ceil(isl.R)); }
    gateNews(g) { return !g ? '' : g.water ? '<br>這裡全是水：往後在惜字亭或建木、扶桑、若木前按 E，寫「' + g.place + '」就傳得到這片水的正中（要從船艙選一艘船，符紙一、力十、飽八）。' : '<br>島心附近立起了一棵' + g.name + '：往後在惜字亭或任何一棵前按 E，寫一個到過的地名就傳得過去（符紙一、力十、飽八）。'; }
    gateKeyAt(x, y) { const g = this.player.gates || {}; return Object.keys(g).find(k => !g[k].water && g[k].x === x && g[k].y === y) || null; }
    gateShut(g) { return g.zid && BOSSES[g.zid] && !((this.player.bosses || {})[g.zid]) ? '還沒斃' + BOSSES[g.zid].zone + '，傳不進牠的地界' : ''; }   // 還沒斃的大魔王的地界傳不進去
    gateBlock() {   // 現在傳不傳得了
      const p = this.player;
      if (p.fight && !p.fight.away) return '魔王戰中，傳不了。';
      if (p.trial) return '試煉中，傳不了。';
      if (p.swimming) return '人在水裡，傳不了。';
      if (p.sailing) return '在船上傳不了，先上岸。';
      if (!this.test && this.count('符紙') < 1) return '沒有符紙。竹二、麻布一、煤一、花一做得出兩張（製作欄「材料」）。';
      if (!this.test && (p.sta < GATE_COST.sta || p.food < GATE_COST.food)) return '力氣或飽不夠：傳一次要力 ' + GATE_COST.sta + '、飽 ' + GATE_COST.food + '。';
      return '';
    }
    openTele(from) {     // from：'home'（惜字亭）或某棵樹的 key
      const p = this.player, g = p.gates || {}, here = { x: p.x, y: p.y };
      const rows = [];
      if (from !== 'home' && p.pavilion) rows.push({ key: 'home', label: '惜字亭（家）', d: Math.hypot(p.pavilion.x - here.x, p.pavilion.y - here.y) });
      for (const k of Object.keys(g)) { if (k === from) continue; const t = g[k]; rows.push({ key: k, label: this.gateLabel(t), d: Math.hypot(t.x - here.x, t.y - here.y), shut: this.gateShut(t), zone: k[0] === 'z' }); }
      rows.sort((a, b) => (a.key === 'home' ? -1 : 0) - (b.key === 'home' ? -1 : 0) || (b.zone ? 1 : 0) - (a.zone ? 1 : 0) || a.d - b.d);
      const block = this.gateBlock();
      $('tele-note').textContent = block || '寫一個到過的地名，紙一摺就到了那裡：符紙一張、力 ' + GATE_COST.sta + '、飽 ' + GATE_COST.food + '（囊裡符紙 ' + num(this.count('符紙')) + ' 張）。';
      $('tele-list').innerHTML = rows.length ? rows.map(r => '<button data-k="' + r.key + '"' + (block || r.shut ? ' disabled' : '') + '><span class="ch">' + r.label + '</span> <small>' + (r.shut || '約 ' + Math.max(10, Math.round(r.d / 10) * 10) + ' 格') + '</small></button>').join('') : '<span class="shelfslot empty">還沒有別的傳送點：傳送點一開始就立在各處，走到三格內就點亮。</span>';
      $('tele-list').querySelectorAll('button[data-k]').forEach(b => b.addEventListener('click', () => this.teleTo(b.dataset.k)));
      this.teleOpen = true; $('tele').classList.remove('hidden'); this.keys.clear(); this.action = null; if (this.stopWalk) this.stopWalk();
    }
    closeTele() { $('tele').classList.add('hidden'); this.teleOpen = false; }
    teleTo(key) {
      const p = this.player, g = key === 'home' ? (p.pavilion ? { x: p.pavilion.x, y: p.pavilion.y, place: '惜字亭' } : null) : (p.gates || {})[key];
      if (!g) return; const block = this.gateBlock() || (key !== 'home' && this.gateShut(g)); if (block) { this.message(block); SFX.fail(); return; }
      if (g.mass !== undefined) g.place = this.gatePlace(g);   // v0.8.27：陸塊改過名，地名跟著改
      if (g.water) {   // 傳到水上：先選船，不選就不傳（使用者定）
        const h = p.hold || []; this.closeTele();
        if (!h.length) { this.toast('沒帶船，傳不到' + this.waterWord(g), '「' + g.place + '」在水上：船艙裡沒有船，這一趟沒傳（符紙、力、飽都沒耗）。', 7000); SFX.fail(); return; }   // v0.8.28 使用者定：沒帶船直接橫幅說傳不了
        this.talk('撐不撐船？', ['「' + g.place + '」在水上，傳過去是水的正中，得撐一艘船：選船艙裡的一艘，到了就放下水、你站在船上。不撐就不傳。'], h.map(st => ({ label: '撐' + st.n + '（命 ' + Math.round(st.ship && st.ship.hp !== undefined ? st.ship.hp : G.SHIPS[st.n].hp) + '）', fn: () => this.doTele(key, g, st) })).concat([{ label: '不撐，不傳', fn: null }]));
        return;
      }
      this.closeTele(); this.doTele(key, g, null);
    }
    doTele(key, g, st) {
      const p = this.player, w = this.world, block = this.gateBlock(); if (block) { this.message(block); SFX.fail(); return; }
      let at = null, r = null;
      if (g.water) {   // 水的正中找放得下船身的地方
        if (!st || !(p.hold || []).includes(st)) return;
        for (let rr = 0; rr <= 40 && !r; rr++) for (const dir of ['h', 'v']) { const spot = this.nearestTile(g.x, g.y, (x, y) => Math.max(Math.abs(x - g.x), Math.abs(y - g.y)) <= rr && w.shipFits(st.n, x, y, (a, b) => this.shipWater(a, b), dir), rr); if (spot && !r) r = { dir, x0: spot[0], y0: spot[1] }; }
        if (!r) { this.message(g.place + '的水面上放不下這艘船。'); SFX.fail(); return; }
        const cap = this.shipCapNote(r.x0, r.y0); if (cap) this.toast('船太多了', cap, 8000);
      } else {
        const free = (x, y) => { const d = w.info(x, y); return d.walk > 0 && d.kind !== 'water' && d.kind !== 'object' && d.kind !== 'place' && !d.bog && !this.ents.at(x, y); };
        at = this.nearestTile(g.x, g.y, (x, y) => (x !== g.x || y !== g.y) && free(x, y), 6); if (!at) { this.message('那裡沒有站的地方。'); SFX.fail(); return; }
      }
      if (!this.test) { this.removeItem('符紙', 1); p.sta = Math.max(0, p.sta - GATE_COST.sta); p.food = Math.max(0, p.food - GATE_COST.food); }
      const from = { x: p.x, y: p.y }; this.stopWalk(); this.closeShipUI && this.shipUIOpen && this.closeShipUI();
      if (r) {
        this.shipCap(r.x0, r.y0); this.takeStack(st); p.holdSel = -1;
        p.sailing = true; p.swimming = false; p.ship = Object.assign(this.newShipFrom(st, st.n), r, { t: U.r4(w.time) }); p.shipMove = false;
        at = [r.x0, r.y0];
      }
      p.x = p.rx = p.fromX = at[0]; p.y = p.ry = p.fromY = at[1]; p.moveT = 0; this.ents.px = p.x; this.ents.py = p.y;
      if (!r) { p.fx = Math.sign(g.x - p.x); p.fy = Math.sign(g.y - p.y); }
      this.renderer.shake = 0.3; SFX.learn(); this.barSig = ''; this.buildBag(); this.holdSig = '';
      this.toast('寫「' + g.place + '」', '紙一摺，你從約 ' + Math.round(Math.hypot(from.x - p.x, from.y - p.y)) + ' 格外到了' + g.place + (r ? '，' + st.n + '放下了水，你站在船上' : '') + '。' + (this.test ? '（測試格不耗符紙與力飽）' : '符紙 −1、力 −' + GATE_COST.sta + '、飽 −' + GATE_COST.food + '。'), 7000);
      this.save();
    }
    gatesFill() {   // 舊存檔：到過的地界與外島，讀檔時補立傳送點（v0.8.21）；v0.8.27 第三版：原點那一處一開始就亮著
      const p = this.player;
      if (G.GEN >= 3) { const h = G.gateNet(this.seed).list.find(g => g.home); if (h) this.lightGate(h, false); return; }
      for (const z of G.zones(this.seed)) if ((p.zones || {})[z.id]) this.zoneGate(z);
      for (const id of Object.keys(p.isles || {})) { const [ci, cj] = id.split(',').map(Number), isl = G.isleAt(ci, cj, this.seed); if (isl) this.isleGate(isl); }
    }
    nestHints() {   // v0.8.19 使用者定：第一趟的指路——離一處巢穴還遠（NEST_HINT_R 或地界的兩倍）就說一聲在哪個方位、是誰的；大地圖上畫一圈
      const p = this.player; p.nestHints = p.nestHints || {};
      for (const z of G.zones(this.seed)) {
        if (p.nestHints[z.id] || (p.zones || {})[z.id]) continue;
        const ground = BOSSES[z.id] ? BOSSES[z.id].r : (z.ext || z.r), r = Math.max(NEST_HINT_R, 2 * ground), d = Math.hypot(p.x - z.x, p.y - z.y);
        if (d > r) continue;
        p.nestHints[z.id] = 1; const dir = this.dirName(z.x - p.x, z.y - p.y);
        this.toast(z.name + '在' + dir, '往' + dir + '約 ' + Math.max(10, Math.round(d / 10) * 10) + ' 格，是' + z.id + '的巢穴（' + z.name + '）。大地圖上畫了一圈。', 9000); SFX.learn();
      }
    }
    zoneName() { const z = G.zoneAt(this.player.x, this.player.y, this.seed); return z ? z.name : ''; }
    placeName() {   // v0.8.26 孤嶼；v0.8.27 第三版：陸塊（一千二百格以上）寫名字，再寫地域
      const p = this.player, z = G.zoneAt(p.x, p.y, this.seed), bio = G.biomeName(this.world.get(p.x, p.y));
      if (z) return z.name + ' · ' + bio;
      if (G.GEN >= 3) { const m = G.massAt(p.x, p.y, this.seed), rg = G.isleOf(p.x, p.y, this.seed); if (m && m.area > G.MASS_MIN && !m.home && !m.zone) return this.massName(m.id) + ' · ' + (rg ? rg.name + ' · ' : '') + bio; return (G.skerryOf(p.x, p.y, this.seed) ? '孤嶼 · ' : '') + bio; }
      const isl = G.isleOf(p.x, p.y, this.seed), sk = isl ? null : G.skerryOf(p.x, p.y, this.seed); return (isl ? isl.name + ' · ' : sk ? '孤嶼 · ' : '') + bio;
    }
    discover(pl) {
      const p = this.player;
      if (p.places[pl.id]) return;
      p.places[pl.id] = 1;
      this.toast('發現：' + pl.name, pl.name === '燈' ? '最遠的燈，在島外。' : '去看看。');
      SFX.learn();
    }
    readPlace(pl) {
      const p = this.player, w = this.world, first = p.places[pl.id] !== 2;
      p.places[pl.id] = 2;
      $('read-title').textContent = pl.name;
      $('read-text').textContent = pl.text; $('read').querySelector('.panel').classList.remove('rubbing');
      $('read').classList.remove('hidden');
      this.keys.clear(); this.rainRead();   // 晴耕雨讀（v0.9.19）
      if (pl.effect === 'well' && pl.drank !== this.day()) { pl.drank = this.day(); p.hp = Math.min(p.hpMax, p.hp + 15); this.message('井水清冽，命 +15。'); }
      if (pl.effect === 'raft' && !p.raftTaken) { if (this.addItem('竹筏', 1) === 0) { p.raftTaken = true; this.toast('船裡有一隻竹筏', '囊中有筏，可行於淺水。'); } else this.message('囊滿了，筏子先留在船裡。'); }
      if (pl.effect === 'scale' && !p.scaleTaken && !p.azure) {   // v0.8：龍不在洞裡了，留一片青鱗指向東海
        p.scaleTaken = true; const at = this.stashItem('青鱗', 1);
        this.toast('黑處只剩一片鱗', '龍往東海去了。本島往東約三百八十格的深海上，青龍盤著' + (at ? '（囊滿了，青鱗用小囊包著擱在' + at.where + '）' : '') + '。除蜃得蜃殘體，九塊加海水瓶三、淡水瓶一在鼎裡熬成蜃珠，帶著去求教。大地圖上標了牠的所在。', 10000);
      }
      if (!first) { this.buildBag(); return; }
      this.stats.read++; p.san = Math.min(100, p.san + this.sanUp(10)); this.addCourage(10);
      if (pl.effect === 'reveal') { w.revealAll(pl.x, pl.y); this.toast('看見整座本島', '本島的一切都畫到地圖上了。按 M 看。'); }
      else if (pl.effect === 'bricks') { const a1 = this.giveNear('磚', 6), a2 = this.giveNear('石子', 3); this.toast('錯字砌的磚', '磚 ×6、石子 ×3。' + (a1 || a2 ? '囊滿了，放不下的用小囊包著擱在' + (a1 || a2).where + '。' : '')); }
      else if (pl.effect === 'end') {
        const n = w.places.filter(x => p.places[x.id] === 2).length;
        if (n >= w.places.length) { p.finished = true; this.toast('你讀完了這張紙', '第 ' + this.day() + ' 日。島上八處，你都去過了。', 9000); }
        else this.toast('燈', '還有 ' + (w.places.length - n) + ' 處沒讀。', 6000);
      }
      SFX.learn(); this.buildBag(); this.save();
    }
    closeRead() { $('read').classList.add('hidden'); }
    learnAsk(k, grant) {   // 求教之前問一聲（v0.8.22 使用者定）：寫明得到什麼、十字星不是非拿不可；附生存之道與成就兩個鈕，回來再按 E
      const L = { azure: ['青龍', '蜃珠', '龍魂', '修蛇', '行船的水性：孤帆、方舟自己慢慢回命（' + SHIP_MEND_DAYS + ' 日回滿，停著的也回）；落了水倒數慢四分之一，游泳的減益減半'],
        bai: ['白虎', '虎符', '虎魄', '封豨', '抗震：從地面傳來的震，傷害少四分之一'], zhu: ['朱雀', '朱羽', '鳳翎', '大風', '氣順：鎖喉的窒、心慌的心，傷害都少四分之一'] }[k];
      this.talk('求教' + L[0], ['「把' + L[1] + '給我，我教你。」',
        '求教得' + L[4] + '。簡單、一般難度下，打' + L[3] + '那一場牠還會來護駕（靠了牠就不算獨力）。',
        '魂環的' + L[2] + '上會多一顆<b>十字星</b>（' + L[2] + '本身要斃了' + L[3] + '才亮）。十字星不是非拿不可——聽說誰都不靠、只靠自己的人，會遇上一件好事。',
        '確定要領？想先翻翻生存之道、成就也行，回來再按 E。'],
        [{ label: '領取', fn: grant }, { label: '看生存之道', fn: () => $('help').classList.remove('hidden') }, { label: '看成就', fn: () => this.openFeats() }, { label: '先不', fn: () => this.message(L[0] + '看著你，不說話。' + L[1] + '還在你囊裡。') }]);
    }
    fuAlive() {          // 「服了？服了！」現在還做得到嗎（第十六頓增益前要按兩次，只在還做得到時問）
      const p = this.player, bs = p.bosses || {}, three = Object.keys(RING);
      return !!p.hardOnly && !['azure', 'bai', 'zhu'].some(k => p[k]) && !three.some(id => bs[id] && bs[id].jing !== false) && !this.xuanLayers() && p.jingFor !== '共工' && p.gongLost !== 'jing' && !bs['共工'] && (p.mealN || 0) <= MEAL_FU_CAP;
    }
    teaseHtml() {        // 成就頁的謎（v0.8.22 一句；v0.8.23 使用者定：條件列出來，讓人猜是不是那個藏著的大結局）：○ 還做得到、● 做到了、✕ 已經不行了
      const p = this.player, bs = p.bosses || {}, three = Object.keys(RING), withJing = three.some(id => bs[id] && bs[id].jing !== false), xs = three.filter(id => bs[id] && bs[id].jing === false).length, stars = ['azure', 'bai', 'zhu'].filter(k => p[k]).length;
      const row = (st, text, note) => '<li class="' + st + '"><b>' + ({ ok: '○', done: '●', no: '✕' })[st] + '</b>' + text + (note ? '<i>' + note + '</i>' : '') + '</li>';
      return '<p class="tease">如果誰都不靠、只靠自己，會有什麼好事發生？</p><p class="dim small">有人說，做到底下這幾件事的人，會遇上一件好事。是不是最後藏著的那一件，誰也說不準。</p><ul class="tease-list">'
        + row(p.hardOnly ? 'ok' : 'no', '從頭到尾都在困難裡', p.hardOnly ? '到現在都是' : '換過難度了')
        + row(stars ? 'no' : 'ok', '三顆十字星，一顆也不拿', stars ? '拿了 ' + stars + ' 顆' : '')
        + row(withJing ? 'no' : xs === 3 ? 'done' : 'ok', '三隻大魔王，都不拿牠的經就斃', withJing ? '有一隻是拿著經斃的' : xs + '／3')
        + row(this.xuanLayers() ? 'no' : 'ok', '玄甲，一層也不披', this.xuanLayers() ? '披了 ' + this.xuanLayers() + ' 層' : '')   // v0.8.34 使用者定：拿了玄甲就沒有這個成就
        + row((p.mealN || 0) > MEAL_FU_CAP ? 'no' : 'ok', '一頓的增益（烤奇魚、五穀的菜），最多吃十五頓', '吃了 ' + (p.mealN || 0) + '／' + MEAL_FU_CAP)   // v0.9.19 使用者定
        + row(p.jingFor === '共工' || p.gongLost === 'jing' ? 'no' : 'ok', '共工那一卷（立極），也不取')
        + row((p.bosses || {})['共工'] ? 'done' : 'ok', '斃了共工', (p.bosses || {})['共工'] ? '' : '') + '</ul>';
    }
    openFeats() { $('map').classList.add('hidden'); $('craft').classList.add('hidden'); this.journalTab = 'see'; const el = $('journal'); el.classList.remove('hidden'); this.keys.clear(); this.renderJournal(); const h = $('j-feats'); if (h) h.scrollIntoView({ block: 'start' }); }   // 見聞錄翻到成就那一段
    // v0.8 求教東海青龍：囊裡有蜃珠就收下，教你行船的水性（船自己回命）；v0.8.2 起不再放小龍，改亮魂環那三分之一並給水性；沒有蜃珠就打發你先去除蜃
    askAzure() {
      const p = this.player;
      if (p.azure) { this.message('青龍：「去吧。海上有難，我記得你。」'); return; }
      if (!this.has('蜃珠')) { this.toast('青龍', '「' + (this.has('青鱗') ? '你帶著我的鱗來了。' : '') + '拿一顆蜃珠來，我才信你出得了遠海。」除蜃得蜃殘體，九塊加海水瓶三、淡水瓶一，在火旺的鼎裡熬成蜃珠' + (this.has('蜃殘體') ? '（囊裡有蜃殘體 ' + this.count('蜃殘體') + ' 塊）' : '') + '。', 9000); SFX.fail(); return; }
      this.learnAsk('azure', () => {
        if (p.azure || !this.has('蜃珠')) return;
        this.removeItem('蜃珠', 1); if (this.has('青鱗')) this.removeItem('青鱗', 1);
        p.azure = true; p.scaleTaken = true; p.dragon = false; this.courSig = '';
        this.toast('求教青龍', '青龍收下蜃珠，教你行船的水性：孤帆、方舟自己慢慢回命（' + SHIP_MEND_DAYS + ' 日回滿，停著的也回）；落了水也撐得久些（倒數慢四分之一）。右上角魂環的龍魂上多了一顆十字星。', 12000);
        SFX.learn(); this.buildBag(); this.save();
      });
    }
    askPhoenix() {       // 朱雀（v0.8.6）：拿朱羽求教，教你氣順（窒與心少四分之一）；v0.8.22 起先問一聲，魂環的鳳翎上多一顆十字星
      const p = this.player;
      if (p.zhu) { this.message('朱雀：「去吧。氣喘不上來的時候，慢慢吸。」'); return; }
      if (!this.has('朱羽')) { this.toast('朱雀', '「拿朱羽來。」斃蠱雕得蠱雕殘體，九塊加精煤一、火蝕一（燧石、火把、油脂一份），在火旺的鼎裡煉成朱羽' + (this.has('蠱雕殘體') ? '（囊裡有蠱雕殘體 ' + this.count('蠱雕殘體') + ' 塊）' : '（蠱雕在南邊的海上）') + '。', 9000); SFX.fail(); return; }
      this.learnAsk('zhu', () => {
        if (p.zhu || !this.has('朱羽')) return;
        this.removeItem('朱羽', 1);
        p.zhu = true; this.courSig = '';
        this.toast('求教朱雀', '朱雀收下朱羽，教你氣順：鎖喉的窒、心慌的心，傷害都少四分之一。右上角魂環的鳳翎上多了一顆十字星。', 10000);
        SFX.learn(); this.buildBag(); this.save();
      });
    }
    askTiger() {         // 白虎（v0.8.5）：拿虎符求教，教你抗震（震的傷害少四分之一）；v0.8.22 起先問一聲，魂環的虎魄上多一顆十字星
      const p = this.player;
      if (p.bai) { this.message('白虎：「去吧。地動的時候，站穩。」'); return; }
      if (!this.has('虎符')) { this.toast('白虎', '「拿虎符來。」斃鑿齒得鑿齒殘體，九塊加鐵三、鎢鋼一，在火旺的鼎裡鑄成虎符' + (this.has('鑿齒殘體') ? '（囊裡有鑿齒殘體 ' + this.count('鑿齒殘體') + ' 塊）' : '（鑿齒在西邊的陸上，本島以西一百九十格外）') + '。', 9000); SFX.fail(); return; }
      this.learnAsk('bai', () => {
        if (p.bai || !this.has('虎符')) return;
        this.removeItem('虎符', 1);
        p.bai = true; this.courSig = '';
        this.toast('求教白虎', '白虎收下虎符，教你抗震：從地面傳來的震，傷害少四分之一（站在台、棧或船上本來就不受）。右上角魂環的虎魄上多了一顆十字星。', 10000);
        SFX.learn(); this.buildBag(); this.save();
      });
    }
    // 囊放不下的要緊東西（青鱗、蜃珠，v0.8 使用者定）：用小囊包著，擱在最近睡過的床邊；沒睡過床就擱在床邊，沒床就擱在最近的空地。
    // 放進囊裡回 null；擱下了回 { x, y, where }。床邊已經有小囊就裝進同一個
    stashItem(name, n) {
      const left = this.addItem(name, n); if (!left) return null;
      return this.dropSack([{ n: name, c: left }]);
    }
    giveNear(name, n, opts) {   // 給東西：囊放不下的，用小囊包著擱在腳邊（v0.8.8：囊滿時不再憑空消失）；都進了囊就回 null
      const left = this.addItem(name, n, opts); if (!left) return null;
      return this.dropSack([Object.assign({ n: name, c: left }, opts || {})], true);
    }
    dropSack(entries, here, near) {   // 一包東西直接擱進床邊的小囊（不先試囊）；同名的併在一起。here：擱在腳邊（身旁已有小囊就併進去）；near：沒床時擱在這附近（v0.9.5 搬家用出生點）
      const p = this.player, w = this.world, bed = here ? null : [p.bed, p.home].find(b => b && w.get(b.x, b.y) === '床') || null;
      const free = (x, y) => { const d = w.info(x, y); return d.walk > 0 && d.kind !== 'object' && d.kind !== 'place' && !w.stele(x, y) && DB[w.raw(x, y)].kind !== 'water' && w.raw(x, y) !== '灘' && !this.ents.at(x, y) && !(x === p.x && y === p.y); };
      const from = bed || near || p; let spot = null;
      for (const [dx, dy] of N8) if (w.get(from.x + dx, from.y + dy) === '囊') { spot = [from.x + dx, from.y + dy]; break; }
      if (!spot) spot = this.nearestTile(from.x, from.y, free, 60) || this.nearestTile(this.spawn.x, this.spawn.y, free, 60) || [this.spawn.x, this.spawn.y];
      const k = U.key(spot[0], spot[1]), list = w.get(spot[0], spot[1]) === '囊' ? (w.bags.get(k) || []) : [];
      for (const e of entries) { const it = G.item(e.n), same = !(it && (it.single || it.dur)) && e.dur === undefined && !e.store && list.find(x => x.n === e.n && x.dur === undefined && !x.store); if (same) same.c += e.c; else list.push(e); }   // 裝著東西的不併（v0.8.15 自查）
      w.set(spot[0], spot[1], '囊'); w.bags.set(k, list);
      return { x: spot[0], y: spot[1], where: bed ? '床邊' : near && !here ? '出生的地方附近' : here && U.cheb(spot[0], spot[1], p.x, p.y) <= 2 ? '腳邊' : '最近的空地上' };
    }
    readStele(t) {
      const p = this.player, s = this.world.stele(t.x, t.y), k = U.key(t.x, t.y);
      if (!s && p.gongStele && p.gongStele.x === t.x && p.gongStele.y === t.y) { this.readPillarStele(); return; }   // 天柱下的碑（v0.9.13）
      if (!s) return;
      if (p.readSteles.indexOf(k) < 0) { p.readSteles.push(k); p.staMax = Math.min(200, p.staMax + 10); this.toast('讀碑有得', '力氣上限 +10（' + p.staMax + '）'); }
      this.toast('碑文', s.hint, 9000);
    }
    askRoad(t) {
      const p = this.player, w = this.world;
      let best = null, bd = Infinity;
      for (const pl of w.places) { if (p.places[pl.id] === 2) continue; const d = U.dist(t.x, t.y, pl.x, pl.y); if (d < bd) { bd = d; best = pl; } }
      if (!best) { this.toast('問路', '門說：八處你都去過了。'); return; }
      const dx = best.x - t.x, dy = best.y - t.y, a = Math.atan2(-dy, dx);
      const dirs = ['東', '東北', '北', '西北', '西', '西南', '南', '東南'];
      const dir = dirs[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
      this.toast('問路', '門說：往' + dir + '約 ' + Math.round(Math.max(Math.abs(dx), Math.abs(dy))) + ' 步，有' + best.name + '。', 7000);
      SFX.learn();
    }
    harvestWeir(t) {
      const w = this.world, k = U.key(t.x, t.y), ready = w.weirs.get(k) || 0;
      if (w.time < ready) { this.message('魚還沒來，約還要 ' + Math.ceil(ready - w.time) + ' 息。'); return; }
      if (!this.canAdd('魚', 1)) { this.message('囊已滿。'); return; }
      this.addItem('魚', 1); w.weirs.set(k, w.time + 60);
      this.message('漁獲一魚。'); SFX.absorb();
    }
    pickBag(t) {   // 小囊、荷包一口氣全取（荷包平常走 openPurse 的介面）
      const k = U.key(t.x, t.y), items = (this.world.bags.get(k) || []).slice(), left = this.takeBag(k, null);
      const what = this.world.get(t.x, t.y) === '囊' ? '小囊' : '荷包';
      if (left.length) this.message('囊已滿，還有些東西留在' + what + '裡。');
      else this.message(what === '小囊' ? '取出小囊裡的' + items.map(s => s.n).join('、') + '。' : '取回了荷包。');
      SFX.absorb();
    }
    takeBag(k, which) {   // 從地上的小囊或荷包取東西：which 是要取的那幾件（索引），不給就全取；放不下的留著；回傳剩下的
      const w = this.world, items = w.bags.get(k) || [], left = [];
      items.forEach((s, i) => {
        if (which && which.indexOf(i) < 0) { left.push(s); return; }
        const ds = this.aged(s.n) ? this.fruitDays(s).slice() : undefined;
        const r = this.addItem(s.n, s.c, { dur: s.dur, wm: s.wm, fuel: s.fuel, ds, oil: s.oil, store: s.store, ship: s.ship, rg: s.rg, rf: s.rf, q: s.q });   // store：櫃裡的東西、灶鼎柴架上的柴跟著回來（v0.8.15 自查）
        if (r > 0) left.push({ n: s.n, c: r, dur: s.dur, wm: s.wm, fuel: s.fuel, oil: s.oil, store: s.store, ship: s.ship, rg: s.rg, ds: ds ? ds.slice(ds.length - r) : undefined, dz: s.dz, q: s.q });   // ship：收回的船的命與首骨；rg：修過幾次（v0.8.18）；dz：荷包裡是第幾回死的遺物（v0.8.28）
      });
      const [x, y] = U.unkey(k), pr = w.purses.get(k);
      if (left.length) {
        w.bags.set(k, left);
        if (pr && pr.deaths) { pr.deaths = pr.deaths.filter(d => left.some(s => (s.dz === undefined ? -1 : s.dz) === d.z)); if (pr.deaths.length) pr.until = Math.max(...pr.deaths.map(d => d.until)); }   // 取完了的那幾回不再算在荷包裡
      } else w.set(x, y, '白');
      this.buildBag(); return left;
    }
    // ---------- v0.8.29 荷包的介面（使用者定）：每一回死亡的遺物一檔，寫哪一日死的、哪一日過完就散；點一件取一件，或取這一份、全部取回 ----------
    openPurse(t) {
      const k = U.key(t.x, t.y); if (!this.world.bags.has(k)) return;
      this.purseAt = k; this.purseTab = 0; this.paused = true; this.keys.clear(); this.action = null; if (this.stopWalk) this.stopWalk();
      $('purse').classList.remove('hidden'); this.buildPurse();
    }
    closePurse() { $('purse').classList.add('hidden'); this.purseAt = null; this.paused = false; }
    purseGroups(k) {     // 荷包裡的東西照第幾回死的分組（死得早的在前）；沒有紀錄的舊荷包只有一組
      const w = this.world, items = w.bags.get(k) || [], r0 = w.purses.get(k);
      if (!r0) return [{ z: null, items: items.map((s, i) => i) }];
      const r = this.purseRec(k, r0), gs = r.deaths.map(d => ({ z: d.z, day: this.deathDay(d), until: d.until, items: [] }));
      items.forEach((s, i) => { const z = s.dz === undefined ? -1 : s.dz, g = gs.find(o => o.z === z) || gs[gs.length - 1]; if (g) g.items.push(i); });
      return gs.filter(g => g.items.length);
    }
    buildPurse() {
      const k = this.purseAt; if (!k) return;
      const items = this.world.bags.get(k) || [], gs = this.purseGroups(k);
      if (!items.length || !gs.length) { this.closePurse(); return; }
      this.purseTab = Math.max(0, Math.min(this.purseTab, gs.length - 1)); const g = gs[this.purseTab], now = this.world.time;
      $('purse-tabs').innerHTML = gs.map((o, i) => '<button data-tab="' + i + '"' + (i === this.purseTab ? '' : ' class="ghost"') + '><kbd>' + (i + 1) + '</kbd> ' + (o.day ? '第 ' + o.day + ' 日' : '荷包') + '</button>').join('');
      const left = g.until ? Math.max(0, Math.ceil((g.until - now) / DAY)) : null;
      $('purse-note').textContent = g.day ? '第 ' + g.day + ' 日死時落下的遺物，第 ' + Math.round(g.until / DAY) + ' 日過完就散了（' + (left > 1 ? '還剩 ' + left + ' 日，連今日' : '今日過完就沒了') + '）。' + (gs.length > 1 ? '一個荷包最多裝三回的遺物，各算各的十八日。' : '') : '從前落下的荷包，沒有期限。';
      $('purse-items').innerHTML = g.items.map(i => { const s = items[i]; return '<button data-i="' + i + '"><span class="ch">' + s.n + '</span> ×' + num(s.c) + (s.dur !== undefined ? ' <small>耐久 ' + Math.ceil(s.dur) + '</small>' : '') + '</button>'; }).join('');
      $('purse-tabs').querySelectorAll('button[data-tab]').forEach(b => b.addEventListener('click', () => { this.purseTab = +b.dataset.tab; this.buildPurse(); }));
      $('purse-items').querySelectorAll('button[data-i]').forEach(b => b.addEventListener('click', () => this.purseTake([+b.dataset.i])));
    }
    purseTake(which) {   // which：索引（null 全取、'tab' 這一份）
      const k = this.purseAt; if (!k) return;
      if (which === 'tab') { const g = this.purseGroups(k)[this.purseTab]; which = g ? g.items : []; }
      const n0 = (this.world.bags.get(k) || []).length, untouched = which ? n0 - which.length : 0, left = this.takeBag(k, which);
      this.message(left.length > untouched ? '囊已滿，還有些東西留在荷包裡。' : left.length ? '取了。' : '取回了荷包，裡頭空了。');
      SFX.absorb(); if (!left.length) { this.closePurse(); this.save(); return; } this.buildPurse();
    }
    saw(type) {
      const p = this.player;
      if (p.creatures.indexOf(type) >= 0) return;
      p.creatures.push(type);
      this.toast('初見「' + (DB[type].name || type) + '」', DB[type].flavor);
    }
    mapZoomMax() { const v = this.renderer.mapView; return v ? Math.max(0, Math.ceil(Math.log2(v.fitN / MAP_MIN_N))) : 0; }   // 走過的範圍越大，放得越多檔
    zoomMap(d) {         // 大地圖放大縮小（v0.8.24 使用者要的）：第 0 檔看得到走過的全部，每放大一檔範圍減半、以你為中心；+／−、滾輪、按鈕
      this.mapZoom = Math.max(0, Math.min(this.mapZoomMax(), (this.mapZoom || 0) + d)); if (!this.mapZoom) this.mapPan = { x: 0, y: 0 };
      this.renderer.drawBigMap(this, $('bigmap')); this.mapInfo();
    }
    panMap(dx, dy) { if (!this.mapZoom) return; const v = this.renderer.mapView || { N: 48 }, pan = this.mapPan || (this.mapPan = { x: 0, y: 0 }); pan.x = Math.round(pan.x + dx * v.N / 6); pan.y = Math.round(pan.y + dy * v.N / 6); this.renderer.drawBigMap(this, $('bigmap')); }   // 方向鍵一下挪六分之一張圖
    mapInfo() { const p = this.player, w = this.world, seen = w.places.filter(x => x.seen).length, read = w.places.filter(x => p.places[x.id] === 2).length, z = this.mapZoom || 0;
      $('mapinfo').textContent = '第 ' + this.day() + ' 日 · ' + w.tideName() + ' · 已見 ' + seen + '/' + w.places.length + ' 處 · 已讀 ' + read + ' 處'; $('map-zoom').textContent = z ? '×' + Math.pow(2, z) : '全圖'; $('map-out').disabled = !z; $('map-in').disabled = z >= this.mapZoomMax(); }
    toggleMap() {
      const el = $('map'), p = this.player, w = this.world;
      el.classList.toggle('hidden'); this.keys.clear();
      if (el.classList.contains('hidden')) return;
      this.mapPan = { x: 0, y: 0 };   // 每次打開，放大的圖都從你這裡看起
      this.renderer.drawBigMap(this, $('bigmap')); this.mapInfo(); this.buildGuide();
    }
    // 主動指路（v0.9.8 使用者要的）：大地圖上按「指路」（G），列出聽說過（v0.8.19 的指路）或到過的巢穴；點一處（或按數字鍵），寫出從你這裡往哪個方位、多遠，圖上圈起來、拉一條虛線
    nestKnown() { const p = this.player; return G.zones(this.seed).filter(z => (p.nestHints || {})[z.id] || (p.zones || {})[z.id]); }
    nestGuideText(z) {
      const p = this.player, d = Math.hypot(z.x - p.x, z.y - p.y), here = G.zoneAt(p.x, p.y, this.seed), done = BOSSES[z.id] && (p.bosses || {})[z.id];
      const who = z.id + '的巢穴' + (done ? '（' + z.id + '已斃）' : '');
      if (here && here.id === z.id) return z.name + '：' + who + '。你就在這裡，島心往' + this.dirName(z.x - p.x, z.y - p.y) + '約 ' + Math.max(1, Math.round(d)) + ' 格。';
      return z.name + '：' + who + '。從你這裡往' + this.dirName(z.x - p.x, z.y - p.y) + '約 ' + Math.max(10, Math.round(d / 10) * 10) + ' 格。';
    }
    toggleGuide() { this.guideOn = !this.guideOn; if (!this.guideOn) this.mapFocus = null; this.buildGuide(); this.renderer.drawBigMap(this, $('bigmap')); }
    buildGuide() {
      const row = $('map-nests'), list = $('map-nestlist'), note = $('map-nestnote'), zs = this.nestKnown(), on = !!this.guideOn;
      row.classList.toggle('hidden', !on); $('map-guide').classList.toggle('on', on); $('map').classList.toggle('guide', on);
      const z = on && zs.find(x => x.id === this.mapFocus); note.classList.toggle('hidden', !z); if (z) note.textContent = this.nestGuideText(z);
      if (!on) return;
      list.innerHTML = zs.length ? zs.map((x, i) => '<button class="ghost' + (this.mapFocus === x.id ? ' on' : '') + '" data-z="' + x.id + '"><kbd>' + (i + 1) + '</kbd>' + x.name + '</button>').join('') : '<span class="dim small">還沒聽說哪處巢穴。往遠處走，走近了就會聽說。</span>';
      for (const b of list.querySelectorAll('button')) b.addEventListener('click', () => this.guideTo(b.dataset.z));
    }
    guideTo(id) {
      this.mapFocus = this.mapFocus === id ? null : id; if (this.mapFocus) { this.mapZoom = 0; this.mapPan = { x: 0, y: 0 }; }   // 拉回全圖，巢穴與你都在圖上
      this.buildGuide(); this.renderer.drawBigMap(this, $('bigmap')); this.mapInfo();
    }
    toggleJournal() {
      const el = $('journal');
      el.classList.toggle('hidden'); this.keys.clear();
      if (el.classList.contains('hidden')) return;
      $('nong').classList.add('hidden'); this.rainRead();   // 晴耕雨讀（v0.9.19）
      this.renderJournal();
    }
    // 見聞錄（v0.8.3 分兩頁）：「見聞」寫地方、生靈、日子；斃了第一頭蜃以後多一頁「魔物誌」
    // ---------- 農書（v0.9.19 使用者定）：時令、五穀、料理、物候冊，HUD 一個鈕（K）點開就看得到 ----------
    toggleNong(tab) {
      const el = $('nong'), open = !el.classList.contains('hidden');
      if (open && (!tab || tab === (this.nongTab || 'season'))) { el.classList.add('hidden'); this.keys.clear(); return; }
      ['map', 'journal', 'craft', 'help'].forEach(id => $(id).classList.add('hidden'));
      if (tab) this.nongTab = tab; el.classList.remove('hidden'); this.keys.clear(); this.rainRead(); this.renderNong();
    }
    renderNong() {
      const T = NONG_TABS, cur = this.nongTab || 'season', tabs = $('nong-tabs');
      tabs.innerHTML = T.map(([k, n], i) => '<button class="ghost' + (cur === k ? ' on' : '') + '" data-tab="' + k + '"><small class="dim">' + (i + 1) + '</small> ' + n + (k === 'wuhou' ? '（' + this.wuhouCount() + '／72）' : '') + '</button>').join('');
      tabs.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { this.nongTab = b.dataset.tab; this.renderNong(); }));
      $('nong-body').innerHTML = cur === 'grain' ? this.grainHtml() : cur === 'cook' ? this.cookHtml() : cur === 'wuhou' ? this.wuhouHtml() : this.seasonHtml(true);
      const tut = $('nong-tutor'); if (tut) tut.addEventListener('click', () => { $('nong').classList.add('hidden'); this.openTutor('farm'); });
    }
    inTerms(t, a, b) { return a <= b ? t >= a && t < b : t >= a || t < b; }   // 節氣 t 在不在 [a, b)（跨年的也算）
    seasonHtml(full) {   // 時令：今天是哪一天、日出日落、這個節氣有什麼（見聞錄只寫前半，農書寫全）
      const p = this.player, w = this.world, d0 = this.day() - 1, tm = CAL.term(d0), sun = this.sunDay();
      const hm = (fr) => { const m = Math.round(fr * 1440); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
      let h = '<h3>時令</h3><p>' + CAL.longLabel(d0) + '　<span class="dim">第 ' + this.day() + ' 日</span></p><p>今天日出約 ' + hm(sun.dawn) + '、日落約 ' + hm(sun.dusk) + '，晝長 ' + hm(sun.dusk - sun.dawn) + '<span class="dim">（北緯三十二度：夏至最長約 14:06，冬至最短約 9:54，春分秋分各半）</span></p><p class="dim small">一年十二個月、每月三十日；六年一閏，閏在第三年的六月之後。節氣照太陽走，一年 365 日，跟月不同步——立春有時在正月，有時在臘月。'
        + (tm.k >= 18 || tm.k <= 1 ? '這幾節下雨常成雪。' : tm.k >= 2 && tm.k <= 4 ? '這幾節還會倒春寒，偶爾下雪。' : '') + (tm.k > 3 && tm.k < 15 || (tm.k === 3 && tm.hou >= 1) ? '春分二候「雷乃發聲」到秋分「雷始收聲」之間，下雨可能是雷雨。' : '') + (tm.k >= HAIL_TERMS[0] && tm.k <= HAIL_TERMS[1] ? '立夏到處暑的雷雨，極少夾著冰雹。' : '') + '</p>';
      if (!full) return h;
      let nx = 1; while (nx < 30 && CAL.term(d0 + nx).k === tm.k) nx++;
      h += '<p>下一個節氣：' + this.termName(tm.k + 1) + '，還有 ' + nx + ' 日。</p>';
      const now = this.sowNow(), st = [0, 0, 0, 0, 0]; for (const k of w.crops.keys()) { const [x, y] = U.unkey(k), cd = DB[w.get(x, y)]; if (cd && cd.crop) st[cd.crop]++; }
      const ripe = Object.keys(G.CROPS).filter(k => this.inTerms(tm.k, G.CROPS[k].wild[2], G.CROPS[k].wild[3]));
      h += '<h3>這個節氣的田事</h3><ul>'
        + '<li>' + (now.length ? '下得了種：<b>' + now.join('、') + '</b>' : '這個節氣不下種') + '。</li>'
        + '<li>' + (ripe.length ? '野生的苗田熟著：' + ripe.join('、') + '（按 <kbd>E</kbd> 收）' : '野生的苗田這時沒有熟的') + '。</li>'
        + (w.crops.size ? '<li>你種著 ' + w.crops.size + ' 格：苗 ' + st[1] + '、秀 ' + st[2] + '、熟 ' + st[3] + (st[4] ? '、落穗 ' + st[4] : '') + '。' + (w.cats.size ? '守田的狸 ' + w.cats.size + ' 隻。' : '') + '</li>' : '')
        + (w.locust ? '<li class="warn">蝗群要落在「' + (w.crops.get(U.key(w.locust.x, w.locust.y)) || { c: '田' }).c + '」那一帶（方圓八格）：田邊點燈、生火，燈火六格內的田保得住。</li>' : '')
        + '</ul><h3>要防的</h3><ul class="small">'
        + '<li><b>雀</b>：秀了、熟了的田白天來啄，稻草人看得住。</li>'
        + '<li><b>田鼠</b>：秀了、熟了的田夜裡來偷，籬與稻草人都擋不住，守田的狸方圓十二格內不敢來。</li>'
        + '<li><b>鹿、野豬、野牛</b>：走進田裡就啃，圍籬留扉。</li>'
        + '<li' + (tm.k >= 10 && tm.k <= 13 ? ' class="now"' : '') + '><b>蝗</b>：小暑到處暑，種了六格以上偶有一群，前一天說，隔天半夜落；燈、火、旺灶六格內的田保得住。</li>'
        + '<li' + (tm.k >= HAIL_TERMS[0] && tm.k <= HAIL_TERMS[1] ? ' class="now"' : '') + '><b>冰雹</b>：立夏到處暑的雷雨極少夾著冰雹，屋外的人、苗、燈、稻草人都挨砸。</li>'
        + '<li' + (tm.k >= G.CROP_FROST[0] || tm.k < G.CROP_FROST[1] ? ' class="now"' : '') + '><b>霜</b>：霜降到雨水，還沒熟的苗、秀凍死；麥過冬不怕。</li></ul>'
        + '<p class="dim small">標了底色的是這個節氣該留意的。五穀怎麼種、菜怎麼做，翻「五穀」「料理」兩頁；<a href="#" id="nong-tutor">重看種田的教程</a>。</p>';
      return h;
    }
    grainHtml() {   // 五穀：一張表，加上地力、時令、看田的規矩
      const where = (k) => { const s = ['原生的田' + (k === '麥' ? '（青野多麥）' : '')]; if (G.WILD_MIX['川'].some(([c]) => c === k)) s.push('川原的草地' + (k === '稻' ? '（近水）' : '')); if (G.WILD_MIX['漠'].some(([c]) => c === k)) s.push('大漠的草地'); return s.join('、'); };
      let h = '<h3>五穀</h3><table class="nongtab"><tr><th>穀</th><th>下種</th><th>熟</th><th>地力</th><th>野生在哪</th><th>菜與一頓</th></tr>';
      for (const k of Object.keys(G.CROPS)) { const C = G.CROPS[k], M = G.MEALS[k];
        h += '<tr><td><b>' + k + '</b></td><td>' + this.termName(C.sow[0]) + '到' + this.termName(C.sow[1]) + (C.water ? '<br><small class="dim">田邊要有水</small>' : '') + '</td><td>' + (k === '麥' ? '過冬，來年小滿' : '約 ' + C.grow + ' 日') + '</td><td>要 ' + C.need + '，' + (C.cost < 0 ? '收了 +1' : '收一次 −' + C.cost) + '</td><td>' + where(k) + '</td><td>' + M.dish + '：' + M.text + '</td></tr>'; }
      h += '</table><ul class="small">'
        + '<li><b>下種</b>：穀就是種。選中穀，面向田（原生的田，或鋤出來的）按 <kbd>F</kbd>。</li>'
        + '<li><b>地力</b>：最多 ' + G.FERT_MAX + '。原生的田 ' + G.FERT_WILD + '、鋤出來的 ' + G.FERT_HOED + '；空著每 ' + G.FERT_FALLOW + ' 日回一點（回到 ' + G.FERT_REST + '）；焦土（灰）取草木灰，撒在田裡 +1。下種時地力三多收一把、四再多一把。</li>'
        + '<li><b>收</b>：熟了按 <kbd>E</kbd>，得穀二到四把與一把草；熟了 ' + G.CROP_HOLD + ' 日不收就落穗，只拾得一把。雀啄、鼠偷各少一把。苗、秀拿著鋤按 <kbd>E</kbd> 拔掉。</li>'
        + '<li><b>新穀、陳穀</b>：囊裡的穀記著收了幾日（滑鼠停在穀上看）。' + GRAIN_NEW + ' 日內是新穀，做的菜那一頓少三成；放過 ' + GRAIN_OLD + ' 日是陳穀，只少一成五；中間的照常少四分之一。做菜先用最陳的。</li>'
        + '<li><b>野生的苗田</b>照節氣自己長，收了就是一塊空田，不再自己長，要人種。</li>'
        + '<li><b>狸</b>：林竹間見人就躲。手持魚按 <kbd>F</kbd> 投一條，一半機會跟你走；帶到自己種的田邊三格內，牠就留下來守著，方圓十二格的田鼠不敢來。再餵一條，牠跟你走。守田的最多 ' + CAT_MAX + ' 隻。</li>'
        + '<li><b>籬與扉</b>：籬（木一麻一，兩段）擋人擋獸、不擋光，圍起來不算屋子；開口放扉（木二麻一），人過得去、獸過不去。</li></ul>';
      return h;
    }
    cookHtml() {   // 料理：釜甑、灶上烤的魚、一頓與調和
      const p = this.player, eff = (out) => { const f = (ITEMS[out] || {}).food || {}; if (f.meal) return '一頓：' + G.MEALS[f.meal].text; const s = []; if (f.eat) s.push('飽 +' + f.eat); if (f.san) s.push('愜意 +' + f.san); if (f.warm) s.push('暖 +' + f.warm); if (f.side) s.push('配菜（調和）'); return s.join('、'); };
      let h = '<h3>一頓</h3><p>' + (this.mealOn() ? '這一頓：<b>' + G.MEALS[p.meal.k].dish + '</b>（' + G.MEALS[p.meal.k].text + (p.meal.he ? '，調和過' : '') + '），還有約 ' + Math.max(1, Math.round((p.meal.until - this.world.time) / DAY * 24)) + ' 個時辰的一半' : '現在沒有一頓的增益') + '。　<span class="dim">吃過 ' + (p.mealN || 0) + ' 頓</span></p>'
        + '<ul class="small"><li>五穀的菜、烤過的奇魚各有<b>一頓</b>的小增益：管四分之一日，多半是少四分之一；<b>一次只有一頓</b>，吃了新的換掉舊的。</li>'
        + '<li><b>調和</b>：一時辰（十二分之一日）內先後吃了五穀的菜與配菜（肉、魚、果、棗、豉、魚羹），那一頓長一半，一頓只算一回——「飯稻羹魚」。</li>'
        + '<li><b>新穀、陳穀</b>：新穀做的菜少三成，陳穀做的只少一成五（見「五穀」）。</li></ul>';
      h += '<h3>釜甑</h3><p class="dim small">釜（鐵二）、甑（鐵一竹二）帶在囊裡，火旺的灶的界面就多一欄。煮、釀用釜；蒸要釜上架甑。</p><table class="nongtab"><tr><th>菜</th><th>怎麼做</th><th>得</th><th>吃了</th></tr>';
      for (const out of Object.keys(G.POT)) { const r = G.POT[out]; h += '<tr><td><b>' + out + '</b></td><td>' + r.verb + '：' + Object.keys(r.need).map(m => m + ' ' + r.need[m]).join('、') + '</td><td>×' + r.k + (r.keep ? '（瓶不退）' : '，空瓶退回') + '</td><td>' + eff(out) + '</td></tr>'; }
      h += '</table><h3>灶上烤的奇魚</h3><table class="nongtab"><tr><th>魚</th><th>烤了</th></tr>';
      for (const k of Object.keys(G.MEALS)) { const M = G.MEALS[k]; if (M.grain) continue; const known = (p.fishLog || {})[k] || (p.fishLog || {})[k + '魚']; h += '<tr><td>' + (known ? '<b>' + M.dish + '</b>' : '<span class="dim">' + M.dish + '</span>') + '</td><td>' + M.text + '</td></tr>'; }
      h += '</table><p class="dim small">烤肉、烤魚、烤大魚、烤蛇是配菜，飽而不算一頓；黍酒飽、愜意、暖，也不算一頓。魚的出處見見聞錄的「魚譜」。</p>';
      return h;
    }
    // ---------- 物候冊（v0.9.19）：過了哪一候就記下哪一候；燕、雁、獺來作客；天象初見 ----------
    wuhouCount() { return [...(this.player.wuhou || '')].filter(c => c === '1').length; }
    wuhouHtml() {
      const p = this.player, seen = p.wuhou || '', d0 = this.day() - 1, tm = CAL.term(d0), cur = tm.k * 3 + tm.hou, v = p.visits || {}, f = p.firsts || {};
      let h = '<p class="dim small">一年七十二候，過了哪一候就記下哪一候（睡過去的不算）。《逸周書·時訓》、《禮記·月令》的候應。</p><table class="nongtab wuhou"><tr><th>節氣</th><th>初候</th><th>二候</th><th>三候</th></tr>';
      for (let k = 0; k < 24; k++) { h += '<tr><td><b>' + CAL.TERMS[k][0] + '</b></td>'; for (let i = 0; i < 3; i++) { const n = k * 3 + i, on = seen[n] === '1'; h += '<td class="' + (n === cur ? 'cur ' : '') + (on ? '' : 'dim') + '">' + (on || n === cur ? CAL.TERMS[k][2 + i] : '？？') + '</td>'; } h += '</tr>'; }
      h += '</table><h3>來作客的</h3><ul class="small">' + VISITORS.map(x => '<li' + (v[x.k] !== undefined ? '' : ' class="dim"') + '><b>' + x.name + '</b>（' + x.when + '）：' + (v[x.k] !== undefined ? x.text + '<span class="dim">　第 ' + (v[x.k] + 1) + ' 年</span>' : x.hint) + '</li>').join('') + '</ul>';
      h += '<h3>天象初見</h3><ul class="small">' + FIRSTS.map(([k, n]) => '<li' + (f[k] ? '' : ' class="dim"') + '>' + n + (f[k] ? '：第 ' + f[k] + ' 日' : '：還沒見過') + '</li>').join('') + '</ul>';
      return h;
    }
    wuhouTick(dt) {   // 每一息看一次：記候、天象初見、來作客的（不睡覺的時候）
      const p = this.player, w = this.world; if (p.dead) return;
      this.wuhouAcc = (this.wuhouAcc || 0) + dt; if (this.wuhouAcc < 1) return; this.wuhouAcc = 0;
      const d0 = w.dayIdx(), tm = CAL.term(d0), n = tm.k * 3 + tm.hou, s = (p.wuhou || '').padEnd(72, '0');
      if (s[n] !== '1') p.wuhou = s.slice(0, n) + '1' + s.slice(n + 1); else if (s !== p.wuhou) p.wuhou = s;
      const f = p.firsts || (p.firsts = {}), wx = this.wxHere(), day = this.day(), first = (k, n2) => { if (!f[k]) { f[k] = day; this.message('物候冊記下了：' + n2 + '。'); } };
      if (wx === 'snow') first('snow', '初雪'); if (wx === 'thunder' || wx === 'dry') first('thunder', '初雷');
      if (w.gale && w.time < w.gale.until) first('gale', '狂風'); if (w.breezeOn && w.breezeOn()) first('breeze', '和風'); if (this.hailing && this.hailing()) first('hail', '冰雹');
      if (p.sailing || p.swimming || this.inBossFight() || p.trial || this.visitsOn === false) return;   // visitsOn：冒煙測試關掉
      const yr = Math.floor(d0 / CAL.YEAR), v = p.visits || (p.visits = {}), outside = !this.indoors(), lightK = this.daylight();
      if (tm.k === 1 && tm.hou === 0 && v['獺'] !== yr && outside && lightK > 0.3 && this.waterNear(p.x, p.y, 2)) {   // 雨水初候「獺祭魚」
        v['獺'] = yr; const at = this.giveNear('魚', 2); this.fx.push({ type: 'float', x: p.x, y: p.y - 1, text: '獺', color: G.INK.brown, t: 0, dur: 2 });
        this.toast('獺祭魚', '雨水初候。一隻獺把捉到的魚一條條擺在岸上，像在祭祀，擺完了留兩條給你就走了。' + (at ? '（囊滿，擱在' + at.where + '）' : '')); SFX.learn(); }
      if ((tm.k === 14 || tm.k === 16) && tm.hou === 0 && v['雁'] !== yr && outside && lightK > 0.3 && U.trueRand() < GEESE_P) {   // 白露初候「鴻雁來」、寒露初候「鴻雁來賓」
        v['雁'] = yr; this.fx.push({ type: 'geese', x: p.x, y: p.y, t: 0, dur: 9, dir: U.trueRand() < 0.5 ? 1 : -1 }); const g0 = this.sanUp(3); p.san = Math.min(100, p.san + g0);
        this.toast(tm.k === 14 ? '鴻雁來' : '鴻雁來賓', '一行雁從北邊飛過，排成人字。愜意 +' + this.shown('san', g0) + '。'); }
    }
    waterNear(x, y, r) { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const d = DB[this.world.get(x + dx, y + dy)]; if (d && d.kind === 'water') return true; } return false; }
    swallowVisit(win) {   // 春分「玄鳥至」：睡在有窗的屋子裡，醒來燕子在屋簷下築巢（一年一回）
      const p = this.player, w = this.world, d0 = w.dayIdx(), tm = CAL.term(d0), yr = Math.floor(d0 / CAL.YEAR), v = p.visits || (p.visits = {});
      if (tm.k !== 3 || !(win > 0) || v['燕'] === yr || this.visitsOn === false) return 0;
      v['燕'] = yr; this.fx.push({ type: 'float', x: p.x, y: p.y - 1, text: '燕', color: G.INK.black, t: 0, dur: 2 }); return this.sanUp(SWALLOW_SAN);
    }
    // 晴耕雨讀（v0.9.19）：雨雪天待在有燈的屋裡翻農書、見聞錄、讀碑，一場雨愜意回一回
    rainRead() {
      const p = this.player, w = this.world, wx = this.wxHere();
      if (!(wx === 'rain' || wx === 'snow' || wx === 'thunder') || !this.indoors() || !w.lightNear(p.x, p.y, 3)) return false;
      const id = U.r4(w.rainUntil || 0); if (p.readRain === id) return false; p.readRain = id;
      const g0 = this.sanUp(RAIN_READ); p.san = Math.min(100, p.san + g0); this.message((wx === 'snow' ? '雪落著，' : '雨打著窗，') + '就著燈讀了一陣，心定了。晴耕雨讀，愜意 +' + this.shown('san', g0) + '。'); return true;
    }
    // ---------- 教程（v0.9.19 使用者定：第一次種地時蹦出來，可以跳過；農書裡可以重看） ----------
    openTutor(id) {
      const pages = TUTORS[id]; if (!pages) return;
      this.tutor = { id, i: 0 }; $('tutor').classList.remove('hidden'); this.keys.clear(); this.renderTutor();
    }
    renderTutor() {
      const t = this.tutor, pages = TUTORS[t.id], pg = pages[t.i];
      $('tutor-title').textContent = pg[0]; $('tutor-body').innerHTML = pg[1]; $('tutor-page').textContent = (t.i + 1) + '／' + pages.length;
      $('tutor-prev').disabled = t.i === 0; $('tutor-next').textContent = t.i === pages.length - 1 ? '知道了' : '下一頁';
    }
    tutorGo(di) { const t = this.tutor; if (!t) return; const n = TUTORS[t.id].length; t.i += di; if (t.i < 0) t.i = 0; if (t.i >= n) { this.closeTutor(); return; } this.renderTutor(); }
    closeTutor() { if (!this.tutor) return; this.tutor = null; $('tutor').classList.add('hidden'); this.keys.clear(); }
    renderJournal() {
      const p = this.player, w = this.world, tabs = $('journal-tabs');
      if (!p.codex) this.journalTab = 'see';
      tabs.innerHTML = p.codex ? ['see', 'codex'].map(k => '<button class="ghost' + ((this.journalTab || 'see') === k ? ' on' : '') + '" data-tab="' + k + '">' + (k === 'see' ? '見聞' : '魔物誌（' + CODEX.filter(c => c.seen(p)).length + '／' + CODEX.length + '）') + '</button>').join('') : '';
      tabs.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { this.journalTab = b.dataset.tab; this.renderJournal(); }));
      if (this.journalTab === 'codex' && p.codex) { $('journal-body').innerHTML = this.codexHtml(); return; }
      const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
      let h = this.seasonHtml(false) + '<p class="dim small">這個節氣的田事、五穀、料理、物候冊，翻右上角的「農書」（<kbd>K</kbd>）。</p>';   // v0.9.16 曆法；v0.9.19 田事搬進農書
      { const log = p.fishLog || {}, kinds = G.FISH.filter((f, i, a) => f.text && a.findIndex(q => q.n === f.n) === i);   // 魚譜（v0.9.17）：釣過的寫出處與原文，沒釣過的只寫在哪
        const where = (f) => { const es = G.FISH.filter(q => q.n === f.n); return es.map(e => e.zone ? '青丘之澤的湖' : e.layer === 'deep' ? '深海（要大鉤）' : e.sea ? '離岸兩格外的海' : '湖、川').join('或') + (es.every(e => e.night) ? '，夜裡' : '') + (es.every(e => e.summer) ? '，只在夏天' : ''); };
        h += '<h3>魚譜</h3>' + (this.mealOn() ? '<p>這一頓：' + G.MEALS[p.meal.k].dish + '（' + G.MEALS[p.meal.k].text + '）</p>' : '') + '<ul>';
        for (const f of kinds) h += log[f.n] ? '<li><b>' + f.n + '</b> ×' + log[f.n] + '　' + f.src + '：「' + f.text + '」<span class="dim">烤了：' + G.MEALS[G.ITEMS['烤' + f.n].food.meal].text + '</span></li>' : '<li class="dim">？？　' + where(f) + '</li>';
        if (log['大魚']) h += '<li><b>大魚</b> ×' + log['大魚'] + '<span class="dim">　離岸的海、深海都有；沒有名目，就是大</span></li>';
        h += '</ul><p class="dim small">撒網只撈淺水的魚（深海上也撒得，撈上來的還是淺水魚）；釣竿釣湖、川與離岸兩格以外的海，大鉤釣深海（離陸地、沙洲十八格以外的淼，上鉤的四條裡三條是凡魚）。生吃只有飽，在灶上烤了吃，一頓之內有一樣小增益；一次只有一頓，吃了新的換掉舊的。</p>'; }
      h += '<h3>地方</h3><ul>';
      for (const pl of w.places) {
        const st = p.places[pl.id] || 0;
        h += '<li>' + (st === 0 ? '<span class="dim">＿＿</span>' : '<b>' + pl.name + '</b>' + (st === 2 ? '　' + esc(pl.text) : '　<span class="dim">（見過，未讀）</span>')) + '</li>';
      }
      h += '</ul><h3>生靈</h3><p>' + (p.creatures.length ? p.creatures.map(t => (DB[t] && DB[t].name) || t).join('　') : '<span class="dim">還沒見過</span>') + '</p>';
      if (p.codex) h += '<p class="dim small">魔物誌在上面另一頁。</p>';
      { const bs = p.bosses || {}, ids = Object.keys(BOSSES).filter(id => bs[id]), feats = p.feats || [];   // 大魔王與成就（v0.8.7）
        if (ids.length || p.fight || p.bossBuff) h += '<h3>大魔王</h3>' + (this.buffLayers() ? '<p class="small">剩下的大魔王都 +' + Math.round(this.buffLayers() * BUFF_STEP * 100) + '%（命與傷害；沒拿經斃過 ' + (p.bossBuff || 0) + ' 隻，一隻兩成' + (p.fight && p.fight.penal ? '，這一場沒拿經也算一層' : '') + '）。</p>' : '') + '<ul>' + Object.keys(BOSSES).map(id => '<li>' + (bs[id] ? '<b>' + BOSSES[id].feat + '</b>　第 ' + bs[id].day + ' 日 · ' + DIFF[bs[id].diff].name + ' · ' + (bs[id].solo ? '獨力' : '有神獸護駕') + (bs[id].buff ? ' · +' + Math.round(bs[id].buff * (bs[id].step || 0.1) * 100) + '%' : '') + (bs[id].jing === false ? ' · 無經' : '') + (RING[id] ? ' · 得' + RING[id][1] : '') + ((p.trophies || {})[id] ? ' · 得' + p.trophies[id].n : '') : p.fight && p.fight.id === id ? '<b>' + BOSSES[id].zone + '</b>　正在打' : '<span class="dim">＿＿</span>') + '</li>').join('') + '</ul>';
        if (p.key2) h += '<p class="small">第 ' + p.key2.day + ' 日得一' + KEY2.unit + '<b>' + KEY2.name + '</b>：從不周山天柱折斷的裂口垂下來，往紙的背面去。通往下一章的鑰——不佔囊，死了也不會掉；下一章還沒寫成，入口就在那道裂口' + (p.gongStele ? '，旁邊立著一塊碑' : '') + '。</p>';   // v0.9.11；v0.9.12 入口定在不周山；v0.9.13 裂口旁的碑
        const solos = Object.keys(RING).filter(id => bs[id] && bs[id].solo).length, pct = (k) => '+' + Math.round((k - 1) * 100) + '%';
        h += '<h3 id="j-feats">成就</h3>' + (feats.length ? '<ul>' + feats.map(x => '<li>' + esc(x.text) + '　<span class="dim">第 ' + x.day + ' 日</span></li>').join('') + '</ul>' : '<p class="dim">還沒有成就。斃了大魔王，難度、加成、獨力與否都記在這裡。</p>')
          + '<p class="dim small">' + ((p.bosses || {})['共工'] ? '共工已斃（' + (p.bosses['共工'].jing ? '拿著立極卷' : '無經') + '）。' : this.ringsAll() ? '共工在不周山等著：' : '共工（三個魂環集齊才進得了不周山）：') + '拿了共工經去打 ' + pct(this.gongK(true)) + '，沒拿 ' + pct(this.gongK(false)) + '（算法見生存之道）；其中獨力斃的大魔王 ' + solos + ' 隻，+' + SOLO_BUFF[Math.min(3, solos)] + '%，另外加上去、不相乘。</p>' + this.teaseHtml(); }   // v0.8.23 使用者定：獨力的加成跟公式相加
      if (p.xuan) {   // 玄武的經卷與惜字亭的願（v0.8.8）
        const sc = p.scrolls || [], BT = { '': '還沒挑戰', held: '拿著經', fightJing: '拿著經在打', won: '拿著經斃了', fightNo: '沒拿牠的經在打', 'fightNo blink': '沒拿經在打', miss: '沒拿經斃了', ask: '三個魂環集齊了', trialOn: '立極還沒過', got: '拿著立極卷' };   // 後四個是第四顆珠（v0.9 補）
        h += '<h3>經卷</h3><p class="dim small">四顆珠：' + BEADS.map(id => id + BT[this.beadOf(id)]).join('、') + (this.missCount() ? '；玄武的試煉，影子 +' + Math.round(this.missCount() * TRIAL_STEP * 100) + '%，六成的隨你打，九成的大魔王一卷最多試 ' + TRIAL_TRIES_BOSS + ' 回、共工 ' + TRIAL_TRIES + ' 回' : '') + (p.puppet ? '；錯過 ' + p.puppet + ' 卷' : '') + (p.jingOld ? '；玄武出來之前斃的大魔王，那一卷不算錯過' : '') + '。</p>';
        if (this.xuanLayers()) h += '<p class="small">玄甲 ' + this.xuanLayers() + ' 層（' + Object.keys(p.xuanjia).filter(id => RING[id]).map(id => JING[id] ? JING[id].shade : id).join('、') + '）：罩在衣甲外，震、窒、心、溺、灼各減 ' + Math.round(this.xuanLayers() * XUAN_STEP * 100) + '%。</p>';   // v0.8.34
        const last = {}; for (const x of sc) last[x.id] = x;   // 同一隻取過幾回，只列最後一回（v0.8.10）
        h += '<p>' + (p.jingFor && JING[p.jingFor] ? '手上：<b>' + JING[p.jingFor].scroll + '</b>' + ((p.shade9 || {})[p.jingFor] ? '（九成的影子也斃過）' : '（只斃過六成的影子）') : '<span class="dim">手上沒有經卷。</span>') + '</p>';
        h += sc.length ? Object.values(last).map(x => '<p><b>' + JING[x.id].scroll + '</b>　<span class="dim">第 ' + x.day + ' 日取' + (x.k ? '（' + (x.k >= 0.9 ? '九成' : '六成') + '的影子）' : '') + (x.dust ? '；第 ' + x.dust + ' 日拿它斃了' + BOSSES[x.id].zone + '，化作塵埃' : '') + (x.lost ? '；第 ' + x.lost + ' 日換成別卷，散了' : '') + '</span></p><ul>' + JING[x.id].lines.map(l => '<li>' + l + '</li>').join('') + '</ul>').join('') : '<p class="dim">還沒取到經卷。玄武在北海的玄洲。</p>';
      }
      if (p.xuan || p.wish || p.redeemed) {   // 願（v0.8.8）；還了願（v0.9.10）就把結語抄在這裡
        const r = p.redeemed;
        h += '<h3>願</h3><p>' + (r ? (r.late ? '第 ' + r.day + ' 日在惜字亭補許即還：' + WISH_TEXT : '第 ' + p.wish.day + ' 日在惜字亭許願：' + WISH_TEXT + '第 ' + r.day + ' 日還了。') : p.wish ? '第 ' + p.wish.day + ' 日在惜字亭許願：' + WISH_TEXT + '<span class="dim">　' + ((p.bosses || {})['共工'] ? '共工斃了，回惜字亭還願。' : '還願要等斃了共工。') + '</span>' : '<span class="dim">還沒許願。惜字亭在你被寫出來的地方附近。</span>') + '</p>';
        if (r) h += '<div class="ending-j">' + this.endingText().map(x => '<p>' + x + '</p>').join('') + '</div>';
      }
      h += '<h3>日子</h3><p>第 ' + this.day() + ' 日 · 膽氣第 ' + (this.test ? '∞ 重（測試格）' : this.level() + ' 重（' + fmt(p.cour) + '，下一重 ' + fmt(this.levelAt(this.level() + 1)) + '）') + ' · 睡過 ' + this.stats.nights + ' 夜 · 走過 ' + w.seenCount() + ' 格 · 取了 ' + this.stats.gathered + ' 次 · 造了 ' + this.stats.crafted + ' 件 · 斃 ' + this.stats.kills + ' · 被咬 ' + this.stats.bites + ' 口 · 死過 ' + p.deaths + ' 次 · 存檔第' + SLOT_NAMES[this.slot] + '格</p>';
      $('journal-body').innerHTML = h;
    }
    codexHtml() {   // 魔物誌：四組卡片，遇過的寫全，沒遇過的蓋著
      const p = this.player;
      return CODEX_GROUPS.map(g => '<h3>' + g + '</h3><div class="codex">' + CODEX.filter(c => c.group === g).map(c => c.seen(p)
        ? '<div class="codex-card"><div class="cx-head"><span class="cx-ch" style="color:' + c.ink + '">' + c.ch + '</span><b>' + c.name + '</b><span class="cx-tag">' + c.group + '</span></div><div class="cx-from">' + c.from + '</div>' + c.note.map(n => '<p>' + n + '</p>').join('') + '<div class="cx-where">在' + c.where + '</div></div>'
        : '<div class="codex-card locked"><div class="cx-head"><span class="cx-ch">？</span><b>未遇</b><span class="cx-tag">' + c.group + '</span></div><p class="cx-hint">' + c.hint + '</p></div>').join('') + '</div>').join('') + '<p class="dim small">遇上了才寫得進來。</p>';
    }

    // ---------- 輸入 ----------
    bindInput() {
      $('name-more').addEventListener('click', () => this.nameMore());
      $('purse-take').addEventListener('click', () => this.purseTake('tab')); $('purse-all').addEventListener('click', () => this.purseTake(null)); $('purse-close').addEventListener('click', () => this.closePurse());   // v0.8.29 荷包   // v0.8.28 取名框：挑一個，或換一批
      window.addEventListener('keydown', (ev) => {
        if (ev.repeat && !DIRS[ev.code]) return;
        if (!$('start').classList.contains('hidden')) return;   // 起始頁的按鍵在 boot() 裡管
        if (Xfer.isOpen()) return;   // 匯出／匯入的視窗開著（v0.9.3）：打字、Esc 都歸它
        if (this.player.dead) { if (ev.code === 'Enter' || ev.code === 'Space') { ev.preventDefault(); this.respawn(); } return; }
        if (this.naming) {   // 取名框：v0.8.28 數字鍵挑；v0.8.29 一批十二個，鍵盤最上一排 1–9、0、−、= 挑，空白鍵換一批；Enter／E／Esc 第一個（一定要有個名字）
          const i = NAME_KEYS.indexOf(ev.code.replace(/^Numpad(?=[0-9]$)/, 'Digit')); ev.preventDefault();
          if (i >= 0) { if (i < (this.naming.list || []).length) this.nameOk(i); }
          else if (ev.code === 'Space') this.nameMore();
          else if (['Enter', 'NumpadEnter', 'KeyE', 'Escape'].indexOf(ev.code) >= 0) this.nameOk(0);
          return; }
        if (this.seaAsk) {
          if (ev.code === 'KeyY' || ev.code === 'Enter') this.seaGo(); else if (ev.code === 'KeyN' || ev.code === 'Escape') this.closeSea();
          ev.preventDefault(); return;
        }
        if (this.warnOpen) { if (['Enter', 'Escape', 'Space', 'KeyE'].indexOf(ev.code) >= 0) this.closeWarn(); ev.preventDefault(); return; }
        if (this.bossAsk) { if (ev.code === 'KeyY' || ev.code === 'Enter') this.bossYes(); else if (ev.code === 'KeyN' || ev.code === 'Escape') this.bossNo(); ev.preventDefault(); return; }
        if (this.endingOpen) {   // 還願的結語（v0.9.10）：Enter、Esc、E、空白鍵繼續；上下鍵捲
          const pn = $('ending').querySelector('.panel'), dy = { ArrowDown: 60, ArrowUp: -60, PageDown: 300, PageUp: -300, KeyS: 60, KeyW: -60 }[ev.code];
          if (dy && pn) pn.scrollBy(0, dy); else if (['Enter', 'NumpadEnter', 'Escape', 'KeyE', 'Space'].indexOf(ev.code) >= 0) this.closeEnding();
          ev.preventDefault(); return;
        }
        if (this.tutor) {   // 教程（v0.9.19）：→／Enter／E／空白鍵下一頁、← 上一頁、Esc 跳過
          if (['ArrowRight', 'Enter', 'NumpadEnter', 'KeyE', 'Space', 'KeyD'].indexOf(ev.code) >= 0) this.tutorGo(1); else if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') this.tutorGo(-1); else if (ev.code === 'Escape') this.closeTutor();
          ev.preventDefault(); return; }
        if (this.talking) { const n = /^Digit[1-9]$/.test(ev.code) ? +ev.code.slice(5) : 0; if (n) this.talkPick(n - 1); else if (ev.code === 'Enter' || ev.code === 'KeyE' || ev.code === 'Space') this.talkPick('first'); else if (ev.code === 'Escape') this.talkPick('last'); ev.preventDefault(); return; }   // 玄武、惜字亭的話（v0.8.8）
        if (this.takeAsk) { if (ev.code === 'KeyY' || ev.code === 'Enter') this.takeYes(); else if (ev.code === 'KeyN' || ev.code === 'Escape') this.takeNo(); ev.preventDefault(); return; }
        if (this.fogAsk) {
          if (ev.code === 'KeyY' || ev.code === 'Enter') { if (this.count('扇')) this.fogUseFan(); else this.fogRefuse(); }
          else if (ev.code === 'KeyN' || ev.code === 'Escape') this.fogRefuse();
          ev.preventDefault(); return;
        }
        if (this.gaze) { this.gazeKey(ev); return; }   // 觀星的時候：轉頭、遠近、換星官，T／Esc 低頭（v0.9.16）
        if (!$('voyage').classList.contains('hidden')) return;
        if (this.userPaused) { if (ev.code === 'Escape') { if (!$('help').classList.contains('hidden')) $('help').classList.add('hidden'); else this.togglePause(); ev.preventDefault(); } return; }   // 暫停時開著幫助：Esc 先關幫助
        if (this.player.knock > 0) { ev.preventDefault(); return; }
        if (!$('read').classList.contains('hidden')) { if (['KeyE', 'Enter', 'Space', 'Escape'].indexOf(ev.code) >= 0) { this.closeRead(); ev.preventDefault(); } return; }
        if (this.chestAt) { if (['KeyE', 'Escape'].indexOf(ev.code) >= 0) { this.closeChest(); ev.preventDefault(); } return; }
        if (this.purseAt) {   // v0.8.29 荷包：數字鍵換一檔、Enter 取這一份、A 全部取回、E／Esc 離開
          const d = /^Digit([1-9])$/.exec(ev.code); ev.preventDefault();
          if (d) { this.purseTab = +d[1] - 1; this.buildPurse(); } else if (ev.code === 'Enter') this.purseTake('tab'); else if (ev.code === 'KeyA') this.purseTake(null); else if (['KeyE', 'Escape'].indexOf(ev.code) >= 0) this.closePurse();
          return; }
        if (this.stoveAt) { if (['KeyE', 'KeyF', 'Escape', 'Enter'].indexOf(ev.code) >= 0) { this.closeStove(); ev.preventDefault(); } return; }
        if (this.dingAt) { if (['KeyE', 'KeyF', 'Escape', 'Enter'].indexOf(ev.code) >= 0) { this.closeDing(); ev.preventDefault(); } return; }
        if (this.shipUIOpen) { if (ev.code === 'KeyC') { this.closeShipUI(); if ($('craft').classList.contains('hidden')) this.toggleCraft(); ev.preventDefault(); } else if (['KeyE', 'Escape', 'Enter'].indexOf(ev.code) >= 0) { this.closeShipUI(); ev.preventDefault(); } return; }   // v0.8.23 使用者定：船上 C 輪著按——船的介面 → 隨身製作 → 回遊戲
        if (this.teleOpen) { if (['KeyE', 'Escape'].indexOf(ev.code) >= 0) { this.closeTele(); ev.preventDefault(); } return; }
        if (!$('nong').classList.contains('hidden')) {   // 農書開著（v0.9.19）：數字鍵換頁、K／Esc／E 合上
          const d = /^Digit([1-4])$/.exec(ev.code); if (d) { this.nongTab = NONG_TABS[+d[1] - 1][0]; this.renderNong(); } else if (['KeyK', 'Escape', 'KeyE'].indexOf(ev.code) >= 0) this.toggleNong();
          if (ev.code !== 'Tab') ev.preventDefault(); return; }
        if (ev.code === 'KeyK') { this.toggleNong(); ev.preventDefault(); return; }   // 農書（v0.9.19）
        if (ev.code === 'Escape') {
          const open = ['help', 'map', 'journal', 'craft'].filter(id => !$(id).classList.contains('hidden'));
          if (open.length) open.forEach(id => $(id).classList.add('hidden')); else this.togglePause();
          ev.preventDefault(); return;
        }
        if (ev.code === 'KeyH') { $('help').classList.toggle('hidden'); ev.preventDefault(); return; }
        if (!$('help').classList.contains('hidden')) return;
        if (ev.code === 'KeyM') { $('journal').classList.add('hidden'); $('craft').classList.add('hidden'); this.toggleMap(); ev.preventDefault(); return; }
        if (ev.code === 'KeyJ') { $('map').classList.add('hidden'); $('craft').classList.add('hidden'); this.toggleJournal(); ev.preventDefault(); return; }
        if (ev.code === 'KeyC') { $('map').classList.add('hidden'); $('journal').classList.add('hidden'); if (this.player.sailing && this.player.ship && $('craft').classList.contains('hidden')) this.openShipUI(); else this.toggleCraft(); ev.preventDefault(); return; }   // v0.8.21：船上 C 開船的介面（裡面有鈕切到製作面板）
        const craftOpen = !$('craft').classList.contains('hidden');
        if (craftOpen) {
          if (/^Digit[1-9]$/.test(ev.code)) { const r = this.visibleRecipes()[+ev.code[5] - 1]; if (r && !r.choose) this.craft(r.id); ev.preventDefault(); }
          return;
        }
        if (!$('map').classList.contains('hidden')) {   // 地圖開著（v0.8.24）：+／− 放大縮小，方向鍵或 WASD 挪
          if (ev.code === 'Equal' || ev.code === 'NumpadAdd') { this.zoomMap(1); ev.preventDefault(); } else if (ev.code === 'Minus' || ev.code === 'NumpadSubtract') { this.zoomMap(-1); ev.preventDefault(); }
          else if (DIRS[ev.code]) { const [dx, dy] = DIRS[ev.code]; this.panMap(dx, dy); ev.preventDefault(); }
          else if (ev.code === 'KeyG') { this.toggleGuide(); ev.preventDefault(); }   // 指路（v0.9.8）
          else if (this.guideOn && /^Digit[1-9]$/.test(ev.code)) { const z = this.nestKnown()[+ev.code[5] - 1]; if (z) this.guideTo(z.id); ev.preventDefault(); }
          return;
        }
        if (!$('journal').classList.contains('hidden')) return;
        const p = this.player;
        if (DIRS[ev.code]) { this.keys.add(ev.code); this.stopWalk(); ev.preventDefault(); return; }   // 方向鍵一按，滑鼠點的路就不走了、也不跟了
        if (SHIP_KEYS[ev.code]) { if (p.sailing) { this.keys.add(ev.code); this.stopWalk(); } ev.preventDefault(); return; }
        if (ev.code === 'Digit7' || ev.code === 'Digit8' || ev.code === 'Digit9') { this.drawGodN(+ev.code[5] - 7); ev.preventDefault(); return; }   // v0.8.19 使用者定：7、8、9 各拿一件神兵（L、P 照舊）
        if (ev.code === 'KeyB') { this.cycleHold(); ev.preventDefault(); return; }   // B：船艙換一艘（v0.8.19）   // v0.8.17 使用者定：數字鍵不再選囊；在船上 1 左 2 上 3 下 4 右開船
        switch (ev.code) {
          case 'KeyE': case 'Space': this.keys.add(ev.code); this.pressGather(); break;
          case 'KeyF': case 'Enter': this.pressPlace(); break;
          case 'KeyV': this.useItem(); break;
          case 'KeyR': this.sleep(); break;
          case 'KeyP': { const h = this.activeTool(); if (h && GODS.indexOf(h.n) >= 0) this.putAway(); else this.cycleGroup('weapon'); break; }   // P 換武器；拿著神兵時 P 收回
          case 'KeyO': this.cycleGroup('farm'); break;   // O 換農具（v0.6.4；N 是靜音）
          case 'KeyL': this.drawGod(); break;
          case 'KeyY': this.toggleSling(); break;
          case 'KeyT': this.toggleGaze(); break;   // 觀天（v0.9.16）
          case 'KeyN': this.message(SFX.toggle() ? '已靜音' : '聲音已開'); break;
          case 'BracketLeft': this.cycle(-1); break;
          case 'KeyQ': this.pressFeed(); break;   // Q 餵（v0.6.7；囊往前一格改用 [ 與滾輪）
          case 'BracketRight': case 'KeyZ': case 'Tab': this.cycle(1); break;
          case 'Equal': if (!ev.shiftKey) { this.pressCatch(); break; }   // = 捉（v0.6.7）；Shift+=（也就是＋）照舊放大
          case 'NumpadAdd': this.renderer.tile = Math.min(56, this.renderer.tile + 4); break;
          case 'Minus': case 'NumpadSubtract': this.renderer.tile = Math.max(28, this.renderer.tile - 4); break;
          default: return;
        }
        ev.preventDefault();
      });
      window.addEventListener('keyup', (ev) => { this.keys.delete(ev.code); if (this.gaze) this.gaze.held.delete(ev.code); });
      { const sk = $('sky'), at = (ev) => [ev.clientX, ev.clientY];   // 觀星：拖曳轉頭、滾輪遠近、指著星看名字
        sk.addEventListener('mousedown', (ev) => { if (!this.gaze) return; this.gaze.drag = at(ev); this.gaze.mouse = at(ev); sk.classList.add('drag'); ev.preventDefault(); });
        window.addEventListener('mousemove', (ev) => { const g = this.gaze; if (!g) return; g.mouse = at(ev); if (g.drag && this.sky && this.sky.F) { const k = (this.renderer.dpr || 1) / this.sky.F; g.az -= (ev.clientX - g.drag[0]) * k; g.alt = Math.max(GAZE_ALT_MIN, Math.min(GAZE_ALT_MAX, g.alt + (ev.clientY - g.drag[1]) * k)); g.drag = at(ev); } });
        window.addEventListener('mouseup', () => { if (this.gaze) this.gaze.drag = null; sk.classList.remove('drag'); });
        sk.addEventListener('wheel', (ev) => { if (!this.gaze) return; this.gazeZoom(ev.deltaY < 0 ? 1 : -1); ev.preventDefault(); }, { passive: false });
        sk.addEventListener('contextmenu', (ev) => ev.preventDefault()); }
      window.addEventListener('blur', () => this.keys.clear());
      const cv = $('world');
      cv.addEventListener('contextmenu', (ev) => ev.preventDefault());
      cv.addEventListener('mousedown', (ev) => {
        if (this.paused || this.player.dead || this.player.knock > 0) return;
        const r = this.renderer, T = r.tile, p = this.player, q = this.unTilt(ev.clientX, ev.clientY);   // 共工的空把畫面斜了，點的地方照轉回來算（v0.9）
        const fx = (q.x - (r.w / 2 - r.camX * T)) / T, fy = (q.y - (r.h / 2 - r.camY * T)) / T;
        let ent = null, bd = 0.75;   // 點到會動的生靈（照牠畫在哪裡算，魄摸不著不算）
        for (const e of this.ents.list) { if (e.type === '魄') continue; const big = e.type === '牛', bx = big ? e.bx / 2 : 0, by = big ? e.by / 2 : 0, dd = Math.hypot(e.rx - bx + 0.5 - fx, e.ry - by + 0.5 - fy) - (big ? 0.5 : 0); if (dd < bd) { bd = dd; ent = e; } }   // 野牛照身子的中間算，兩格都點得到
        const wx = ent ? ent.x : Math.floor(fx), wy = ent ? ent.y : Math.floor(fy), d = U.cheb(wx, wy, p.x, p.y);
        if (d === 0) return;
        if (d > 1) { this.walkTo(wx, wy, ent); return; }   // 點遠處：空地就走上去（v0.7.1），其餘走到它旁邊、面向它；點生靈就跟著（v0.6.6）
        if (!ent && this.openGround(wx, wy) && !DB[this.world.get(wx, wy)].yield) { this.walkTo(wx, wy); return; }   // 身旁一格、上頭沒東西可取的空地（白紙、路、灰、雪……）：走過去（v0.7.1）
        this.stopWalk(); p.fx = wx - p.x; p.fy = wy - p.y;
        this.pressGather();   // 點身旁一格：跟按 E 一樣（v0.6.7 起左右鍵不分，觸控板好用）；放東西用 F
      });
      cv.addEventListener('mousemove', (ev) => { this.mouse = this.unTilt(ev.clientX, ev.clientY); });   // 畫面上框出滑鼠指著的格子
      cv.addEventListener('mouseleave', () => { this.mouse = null; });
      cv.addEventListener('wheel', (ev) => { this.cycle(ev.deltaY > 0 ? 1 : -1); ev.preventDefault(); }, { passive: false });
      $('dead-btn').addEventListener('click', () => this.respawn());
      $('read').addEventListener('mousedown', () => this.closeRead());
      $('journal-close').addEventListener('click', () => this.toggleJournal());
      $('map-close').addEventListener('click', () => this.toggleMap());
      $('map-in').addEventListener('click', () => this.zoomMap(1)); $('map-guide').addEventListener('click', () => this.toggleGuide()); $('map-out').addEventListener('click', () => this.zoomMap(-1));   // v0.8.24 大地圖放大縮小
      { const cv = $('bigmap'); let drag = null;
        cv.addEventListener('wheel', (ev) => { ev.preventDefault(); this.zoomMap(ev.deltaY < 0 ? 1 : -1); }, { passive: false });
        cv.addEventListener('pointerdown', (ev) => { if (this.mapZoom) { drag = { x: ev.clientX, y: ev.clientY }; cv.setPointerCapture(ev.pointerId); } });
        cv.addEventListener('pointermove', (ev) => { if (!drag) return; const v = this.renderer.mapView, k = cv.width / cv.getBoundingClientRect().width / (v ? v.px : 1), dx = Math.round((drag.x - ev.clientX) * k), dy = Math.round((drag.y - ev.clientY) * k);
          if (dx || dy) { const pan = this.mapPan || (this.mapPan = { x: 0, y: 0 }); pan.x += dx; pan.y += dy; drag.x -= dx / k; drag.y -= dy / k; this.renderer.drawBigMap(this, cv); } });
        const up = () => { drag = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); }
      $('craft-close').addEventListener('click', () => this.toggleCraft());
      $('chest-close').addEventListener('click', () => this.closeChest());
      $('stove-close').addEventListener('click', () => this.closeStove());
      $('ding-close').addEventListener('click', () => this.closeDing());
      $('shipui-close').addEventListener('click', () => this.closeShipUI());
      $('tele-close').addEventListener('click', () => this.closeTele());
      $('shipui-craft').addEventListener('click', () => { this.closeShipUI(); this.toggleCraft(); });   // v0.8.21：船的介面裡切到製作面板
      $('warn-ok').addEventListener('click', () => this.closeWarn());
      $('takeask-yes').addEventListener('click', () => this.takeYes());
      $('bossask-yes').addEventListener('click', () => this.bossYes()); $('bossask-no').addEventListener('click', () => this.bossNo()); $('pause-flee').addEventListener('click', () => this.fleeButton()); $('pause-call').addEventListener('click', () => this.callBoss()); $('ending-go').addEventListener('click', () => this.closeEnding());
      $('takeask-no').addEventListener('click', () => this.takeNo());
      $('chest-take').addEventListener('click', () => this.takeChest());
      $('btn-pause').addEventListener('click', () => this.togglePause());
      $('totemswitch').addEventListener('click', () => { if (!this.player.dead) this.toggleTotem(); });
      $('pause-resume').addEventListener('click', () => this.togglePause());
      $('pause-help').addEventListener('click', () => $('help').classList.toggle('hidden'));
      $('pause-export').addEventListener('click', () => {   // v0.9.3 匯出這一局：先存一次，再把這一格存成檔案
        const ok = this.save() !== false;
        if (!Xfer.openExport(this.slot)) { this.message('這一局還沒有存檔，匯出不了。'); return; }
        if (!ok) Xfer.note('這一刻沒存進去（瀏覽器空間不夠），匯出的是上一次存的。');
      });
      $('pause-home').addEventListener('click', () => {   // 回到主頁：先存檔，再回起始頁；v0.8.25 起存不進去先說一聲，再按一次才照樣回去
        const b = $('pause-home'); clearTimeout(this.homeArmT);
        if (!this.homeArm && this.save() === false) { this.homeArm = true; b.textContent = '沒存進去，再按一次照樣回主頁'; this.homeArmT = setTimeout(() => { this.homeArm = false; b.textContent = '回到主頁'; }, 5000); return; }
        location.reload(); });
      $('btn-map').addEventListener('click', () => { if (this.userPaused || this.player.dead || this.player.knock > 0) return; $('journal').classList.add('hidden'); $('craft').classList.add('hidden'); this.toggleMap(); });
      $('minimap').addEventListener('click', () => $('btn-map').click());
      $('btn-say2').addEventListener('click', () => { if (this.player.dead) return; this.keys.clear(); Say.open('btn-say2'); });   // 吐槽（v0.9.19）
      $('btn-nong').addEventListener('click', () => { if (this.userPaused || this.player.dead || this.player.knock > 0) return; this.toggleNong(); });   // 農書（v0.9.19）
      $('nong-close').addEventListener('click', () => this.toggleNong());
      $('tutor-next').addEventListener('click', () => this.tutorGo(1)); $('tutor-prev').addEventListener('click', () => this.tutorGo(-1)); $('tutor-skip').addEventListener('click', () => this.closeTutor());
      $('seaask-go').addEventListener('click', () => this.seaGo());
      $('seaask-no').addEventListener('click', () => this.closeSea());
      $('fogask-use').addEventListener('click', () => this.fogUseFan());
      $('fogask-no').addEventListener('click', () => this.fogRefuse());
      $('voyage-back').addEventListener('click', () => { $('voyage').classList.add('hidden'); this.paused = false; this.message('回頭。再開出去就走了。'); });
      $('voyage-new').addEventListener('click', () => { this.frozen = true; try { localStorage.setItem(CARRY_KEY, this.player.cour + '@' + this.slot + (this.test ? '' : ':n')); } catch (e) { /* ignore */ } Game.clearSave(this.slot); location.reload(); });   // 這一格清掉，重載後還選著它，落筆就寫回這格
    }
    cycle(d) { const p = this.player; if (p.bag.length) p.sel = (p.sel + d + p.bag.length) % p.bag.length; if (p.holdSel >= 0) { p.holdSel = -1; this.holdSig = ''; } this.buildBag(); }   // 換囊格就不選船艙裡的船
    togglePause() {
      if (this.player.dead || this.fogAsk || this.seaAsk || this.warnOpen || this.takeAsk || this.bossAsk || this.talking || this.endingOpen || !$('start').classList.contains('hidden') || !$('voyage').classList.contains('hidden')) return;
      this.userPaused = !this.userPaused; this.paused = this.userPaused;
      $('pause').classList.toggle('hidden', !this.userPaused); this.keys.clear(); this.action = null;
      if (this.userPaused) { this.saveArm = 0; this.diffArm = null; this.diffHint = false; $('saveas-note').textContent = ''; this.renderSaveAs(); this.renderDiffRow(); this.renderIdleRow(); }
      { const ids = this.declinedIds(); $('pause-call').classList.toggle('hidden', !ids.length); $('pause-call').textContent = '叫陣（' + ids.map(id => BOSSES[id].zone).join('、') + '）'; }   // 今天按過「先不」的才有「叫陣」（v0.9.8）
      this.fleeArm = 0; $('pause-flee').textContent = '認輸'; $('pause-flee').classList.toggle('hidden', !this.player.fight && !this.player.bound);   // 魔王戰中（或沒取經闖了地界、還沒斃那一隻）才有「認輸」（v0.8.9，原本叫逃跑）
      $('pause-diff-note').textContent = this.player.fight ? '正在跟' + BOSSES[this.player.fight.id].zone + '打（走出地界也還掛著），換不了難度；要換先認輸。' : '換難度只換數值（一日多長、餓得多快、魄多凶、受傷與攻擊的倍率），東西、配方、兵器三種難度都一樣。第幾日、幾時都不變；按兩次才換，換的時候會存檔、重新讀進來。';
    }
    // 遊戲裡換難度（v0.8.2 使用者定）：三種難度只差數值，東西、配方、兵器都一樣；魔王戰中不能換（以後的魔王戰會讓 inBossFight() 回真）。
    // 按兩次才換：存檔、把這格的難度改掉、記下「時刻照舊」，重新讀進來——一日多長、以日計的倒數都照新難度算
    inBossFight() { return !!this.player.fight; }
    // 閒遊（v0.9.19 使用者定；〈DAILY〉十）：還了願才有，每格存檔各自開關——魄不再越來越快、荷包不過期、死了不減膽氣。第二章上線時要再問使用者一次
    idleOn(k) { const p = this.player; return !!(p.redeemed && p.idle && p.idle[k]); }
    renderIdleRow() {
      const p = this.player, show = !!p.redeemed; ['pause-idle-h', 'pause-idle', 'pause-idle-note'].forEach(id => $(id).classList.toggle('hidden', !show)); if (!show) return;
      const box = $('pause-idle'); box.innerHTML = '';
      for (const [k, n] of IDLE_KEYS) { const on = this.idleOn(k), b = document.createElement('button'); b.className = 'ghost' + (on ? ' on' : ''); b.dataset.idle = k; b.textContent = (on ? '● ' : '○ ') + n; b.addEventListener('click', () => this.toggleIdle(k)); box.appendChild(b); }
    }
    toggleIdle(k) {
      const p = this.player, w = this.world; if (!p.redeemed) return; p.idle = p.idle || {}; p.idle[k] = p.idle[k] ? 0 : 1;
      if (k === 'purse' && !p.idle[k]) for (const r of w.purses.values()) { const until = U.r4(w.time + PURSE_DAYS * DAY); r.until = Math.max(r.until || 0, until); for (const d of r.deaths || []) d.until = Math.max(d.until || 0, until); }   // 關掉時，地上的荷包從現在起再算十八日
      this.renderIdleRow(); this.save();
    }
    renderDiffRow() {
      const box = $('pause-diff'); box.innerHTML = '';
      const hint = $('pause-diff-hint'); hint.classList.toggle('hidden', !(this.diffHint && this.player.hardOnly));   // v0.8.23 使用者定：從沒換過難度的困難存檔要換難度時，蹦一句同樣的暗示
      for (const k of ['easy', 'normal', 'hard']) {
        const b = document.createElement('button'); b.className = 'ghost' + (k === this.diff.key ? ' on' : '') + (this.diffArm === k ? ' arm' : ''); b.dataset.diff = k;
        b.textContent = this.diffArm === k ? '再按一次換成' + DIFF[k].name : DIFF[k].name; b.addEventListener('click', () => this.changeDiff(k)); box.appendChild(b);
      }
    }
    changeDiff(k) {
      if (!DIFF[k] || k === this.diff.key) return;
      if (this.inBossFight()) { this.message('正在跟魔王打，換不了難度；要換先認輸。'); SFX.fail(); return; }
      clearTimeout(this.diffArmT);
      if (this.diffArm !== k) { this.diffArm = k; if (this.player.hardOnly) this.diffHint = true; this.renderDiffRow(); this.diffArmT = setTimeout(() => { this.diffArm = null; if (this.userPaused) this.renderDiffRow(); }, 3000); return; }
      if (this.save() === false) { this.message('這一刻存不進去，換不了難度（換了會讀回較舊的存檔）；先在起始頁刪掉用不到的存檔騰出空間。'); SFX.fail(); return; }   // v0.9.14 自查
      const s = Game.readSave(this.slot); if (!s) return;
      s.diff = k; s.world.keepClock = true; s.diffFrom = this.diff.key; if (k !== 'hard' && s.player) s.player.hardOnly = false;   // v0.8.22：換過別的難度就不算全程困難
      try { localStorage.setItem(Game.slotKey(this.slot), JSON.stringify(s)); localStorage.setItem(SLOT_KEY, String(this.slot)); localStorage.setItem(RESUME_KEY, String(this.slot)); } catch (e) { this.saveBad = 0; this.saveFail(e); return; }
      this.frozen = true; location.reload();
    }
    // 存到別格（v0.8 使用者定）：把這一刻抄一份到第 n 格當存檔點。自動存檔照舊寫這一局的格，抄出去的那格停在抄的那一刻；
    // 例：玩第一格，先存到第二格，五分鐘後再存到第三格，第二、三格就是相隔五分鐘的兩個存檔點。別局的存檔要按兩次才覆蓋
    renderSaveAs() {
      const box = $('saveas'); box.innerHTML = '';
      for (let n = 1; n <= SAVE_SLOTS; n++) {
        const mine = n === this.slot, s = Game.readSave(n), m = s ? Game.summary(s) : null, b = document.createElement('button');
        b.className = 'saveas-slot ghost' + (mine ? ' on' : '') + (s ? '' : ' empty') + (this.saveArm === n ? ' arm' : '') + (TEST_SLOTS.indexOf(n) >= 0 ? ' test' : ''); b.dataset.slot = n;
        if (this.test && TEST_SLOTS.indexOf(n) < 0) { b.disabled = true; b.title = '測試格的存檔不抄到正式的格子（v0.8.10）。'; }
        b.innerHTML = '<b>' + SLOT_NAMES[n] + '</b><span>' + (this.saveArm === n ? '再按一次覆蓋' : mine ? '這一局' : m ? '島 #' + m.seed + ' · ' + m.dayText : '空格') + '</span>' + (m && !mine && this.saveArm !== n ? '<span class="dim">' + m.whenText + '</span>' : '');
        b.addEventListener('click', () => this.saveTo(n));
        box.appendChild(b);
      }
    }
    saveTo(n) {
      clearTimeout(this.saveArmT); if (this.test && TEST_SLOTS.indexOf(n) < 0) return;
      const s = Game.readSave(n), other = s && n !== this.slot && !(s.seed === this.seed && s.savedAt === this.savedTo[n]);   // 別局的存檔（或這一局以前抄的，但不是剛剛抄的）要按兩次
      if (other && this.saveArm !== n) { this.saveArm = n; this.renderSaveAs(); this.saveArmT = setTimeout(() => { this.saveArm = 0; if (this.userPaused) this.renderSaveAs(); }, 3000); return; }
      this.saveArm = 0; if (this.save(n) === false) { this.saveBad = 0; this.renderSaveAs(); $('saveas-note').textContent = '沒存進去：瀏覽器不讓再存（見跳出來的說明）。'; return; }
      const t = Game.readSave(n); if (t) this.savedTo[n] = t.savedAt;
      this.renderSaveAs(); SFX.learn();
      $('saveas-note').textContent = n === this.slot ? '存好了，第' + SLOT_NAMES[n] + '格。' : '這一刻抄到了第' + SLOT_NAMES[n] + '格。自動存檔照舊寫第' + SLOT_NAMES[this.slot] + '格；想回到這一刻，就從起始頁繼續第' + SLOT_NAMES[n] + '格。';
    }

    // ---------- HUD ----------
    sortBag() {            // 囊分兩段：可食的在前，其餘在後；選中的跟著走
      const p = this.player, sel = p.bag[p.sel], edible = (s) => { const it = G.item(s.n); return it && it.food ? 1 : 0; };
      p.bag.sort((a, b) => edible(b) - edible(a));
      if (sel) p.sel = Math.max(0, p.bag.indexOf(sel)); else if (p.sel >= p.bag.length) p.sel = Math.max(0, p.bag.length - 1);
    }
    buildBag() {
      const p = this.player, bar = $('bagbar'); this.sortBag();
      const sig = p.bag.map(s => s.n + s.c + (s.inf ? '∞' : '') + (s.dur !== undefined ? 'd' + s.dur : '') + (s.oil !== undefined ? 'o' + s.oil : '') + (s.n === '果' ? '@' + this.fruitDays(s).join('.') : '')).join(',') + '|' + p.sel + '|' + this.day() + '|' + p.tools.map(s => s.n + s.dur).join(',') + '|' + p.tool
        + '|' + SLOT_ORDER.map(k => p.worn[k] ? p.worn[k].n + (p.worn[k].dur !== undefined ? this.effDays(p.worn[k]) : Math.ceil((p.worn[k].fuel || 0) / 10)) : '').join(',') + '|' + this.slots() + '|' + (this.totemOn() ? 1 : 0) + '|' + this.ironCount();
      if (sig === this.barSig) return;
      this.barSig = sig; bar.innerHTML = '';
      const nEd = p.bag.filter(s => { const it = G.item(s.n); return it && it.food; }).length, mkLabel = (t) => { const l = document.createElement('span'); l.className = 'rowlabel sub'; l.textContent = t; return l; };
      bar.appendChild(mkLabel('食'));
      // v0.8.3：一疊一格；船一艘一欄，孤帆兩格寬、方舟五格寬（spanOf），空格補到囊的格數
      const n = p.bag.length + Math.max(0, this.slots() - this.bagUsed());
      for (let i = 0; i < n; i++) {
        if (i === nEd) bar.appendChild(mkLabel('物'));
        const s = p.bag[i], el = document.createElement('div'), span = s ? this.spanOf(s.n) : 1;
        el.className = 'slot bag' + (s ? '' : ' empty') + (s && i === p.sel ? ' sel' : '') + (span > 1 ? ' wide ship' : '');
        if (span > 1) el.style.setProperty('--span', span);
        if (s && span > 1) {   // 船：一條寬格，船名橫著寫大，底下寫佔幾格、船的命
          const k = G.SHIPS[s.n] || {}, it = G.item(s.n);
          el.innerHTML = '<span class="shipname">' + s.n + '</span><span class="cost">' + ['', '', '兩', '三', '四', '五'][span] + '格 · 命 ' + (s.ship ? Math.round(s.ship.hp) + '/' : '') + (k.hp || '') + '</span>';   // 收回來的船照收船時的命寫（v0.8.18）；數字鍵不再選格，格子不寫編號
          el.title = it.flavor;
        } else if (s) {
          const it = G.item(s.n);
          let sub = s.inf ? '∞' : '×' + s.c;
          if (s.dur !== undefined) sub = this.durText(s);
          else if (s.fuel !== undefined) sub = s.fuel > 0 ? Math.ceil(s.fuel) + '息' : '滅';
          else if (s.n === '果' && !s.inf) { const age = this.day() - this.fruitDays(s)[0]; sub = '×' + s.c + (age >= FERMENT_NIGHTS - 3 ? ' 將醉' : age >= 1 ? ' ' + age + '夜' : ''); }
          else if (this.aged(s.n) && !s.inf) { const age = this.grainAge(s); sub = '×' + s.c + (age <= GRAIN_NEW ? ' 新' : age >= GRAIN_OLD ? ' 陳' : ''); }   // 五穀（v0.9.19）：最陳的那顆是新穀還是陳穀
          else if (s.q) sub = '×' + s.c + (s.q === 'new' ? ' 新' : ' 陳');
          else if (s.store) sub = s.store.length + '樣';
          else if (s.n === '麻布包') sub = s.inf ? '油 ∞' : '油 ' + (s.oil || 0) + '/' + OIL_PER_BAG;
          el.innerHTML = '<span class="ch' + (s.n.length > 1 ? ' word' : '') + (s.n.length > 2 ? ' long' : '') + '">' + s.n + '</span><span class="cost">' + sub + '</span>';
          if (s.dur !== undefined) { const pct = Math.round(100 * s.dur / (it.dur || this.lifeOf(s))); el.classList.add('ringed'); el.innerHTML += '<i class="ring' + (pct <= 25 ? ' low' : '') + '" style="--p:' + pct + '%"></i>'; }   // 耐久：一圈環包著格子
          else if (s.fuel !== undefined) el.innerHTML += '<i class="dur" style="width:' + Math.round(100 * s.fuel / HAT_FUEL) + '%"></i>';
          el.title = it.flavor + (s.n === '果' && !s.inf ? '\n' + this.fruitNote(s) : this.aged(s.n) && !s.inf ? '\n' + this.grainNote(s) : s.q ? '\n' + (s.q === 'new' ? '新穀做的：這一頓少三成' : '陳穀做的：這一頓只少一成五') : '') + (s.store ? '\n裡面：' + s.store.map(x => x.n + (x.inf ? '∞' : '×' + x.c)).join('、') : '');
        }
        el.addEventListener('mousedown', (ev) => { ev.stopPropagation(); if (!s) return; if (this.isTool(s.n) && this.equipFromBag(i)) return; p.sel = i; p.holdSel = -1; this.holdSig = ''; this.buildBag(); });
        bar.appendChild(el);
      }
      const tb = $('toolbar'); tb.innerHTML = '';
      this.sortTools();
      const nWeap = p.tools.filter(s => this.toolGroup(s.n) !== 'farm').length, mkTag = (t, tip) => { const l = document.createElement('span'); l.className = 'rowlabel sub'; l.textContent = t; l.title = tip; return l; };
      tb.appendChild(mkTag('武', '武器：刀、劍、彈弓、神兵。P 換'));
      for (let i = 0; i < this.toolSlots(); i++) {
        if (i === nWeap) tb.appendChild(mkTag('農', '農具：鎬、鋤、斧。O 換'));
        const s = p.tools[i], el = document.createElement('div');
        el.className = 'slot bag tool' + (s ? '' : ' empty') + (s && i === p.tool ? ' sel' : '');
        if (s) {
          const it = ITEMS[s.n];
          el.innerHTML = '<span class="ch' + (s.n.length > 1 ? ' word' : '') + (s.n.length > 2 ? ' long' : '') + '">' + s.n + '</span><span class="cost">耐 ' + Math.ceil(s.dur) + '</span><i class="ring' + (s.dur / it.dur <= 0.25 ? ' low' : '') + '" style="--p:' + Math.round(100 * s.dur / it.dur) + '%"></i>'; el.classList.add('ringed');
          el.title = it.flavor + '（點一下手持，再點一下空手；右鍵移回囊）';
        } else el.title = '具欄：武器與農具共用這些格子；P 換武器、O 換農具';
        el.addEventListener('mousedown', (ev) => { ev.stopPropagation(); if (!s) return; if (ev.button === 2) { this.unequipToBag(i); return; } p.tool = (p.tool === i) ? -1 : i; this.buildBag(); });
        el.addEventListener('contextmenu', (ev) => ev.preventDefault());
        tb.appendChild(el);
      }
      // 身上：上排襯褲甲，下排盔靴；下面四行是現在的數
      [['襯', '褲', '甲'], ['盔', '靴', '帽']].forEach((keys, ri) => {
        const row = $('worn' + (ri + 1)); row.innerHTML = '';
        for (const k of keys) {
          const s = p.worn[k], el = document.createElement('div');
          el.className = 'slot bag worn' + (s ? '' : ' empty');
          if (s && s.fuel !== undefined) { el.innerHTML = '<span class="ch word">' + s.n + '</span><span class="cost">' + (s.fuel > 0 ? Math.ceil(s.fuel) + '息' : '滅') + '</span><i class="dur" style="width:' + Math.round(100 * s.fuel / HAT_FUEL) + '%"></i>'; el.title = ITEMS[s.n].flavor + '（點一下脫下，右鍵用一根蠟燭續上）'; }
          else if (s) { const rate = Math.round(this.wearRate(s) * 100) + '%'; el.innerHTML = '<span class="ch word' + (s.n.length > 2 ? ' long' : '') + '">' + s.n + '</span><span class="cost">' + this.effDays(s) + '日</span><i class="dur" style="width:' + Math.round(100 * s.dur / this.lifeOf(s)) + '%"></i>'; el.title = ITEMS[s.n].flavor + '（照目前損耗速度 ' + rate + ' 還能穿 ' + this.effDays(s) + ' 日；點一下脫下，右鍵修補：' + this.matText(this.fixCost(s) || { '麻布': 1 }) + (ITEMS[s.n].tung ? '，力 12、飽 15' : '，力 4') + (s.rg ? '；修過 ' + s.rg + ' 次' : '') + '）'; }
          else { el.innerHTML = '<span class="ch">' + k + '</span>'; el.title = '身上：' + k + '。囊裡選中衣甲按 F 穿上。'; }
          el.addEventListener('mousedown', (ev) => { ev.stopPropagation(); if (!s) return; if (ev.button === 2) this.repairWorn(k); else this.takeOff(k); });
          el.addEventListener('contextmenu', (ev) => ev.preventDefault());
          row.appendChild(el);
        }
      });
      const on = this.totemOn(), sw = $('totemswitch');
      sw.classList.toggle('on', !p.totemOff); sw.classList.toggle('ready', this.totemReady());
      sw.querySelector('.state').textContent = p.totemOff ? '關 · 普通服' : (this.totemReady() ? '開 · 山海衣' : '開（未齊）');
      $('wornstats').innerHTML = (on ? '<div class="totem">山海衣 · 獸紋已顯</div>' : '')
        + '<div><span>傷害獲取</span><b>' + Math.round(this.takenMult() * 100) + '%</b></div>'
        + '<div><span>移動速度</span><b>' + Math.round(this.ironSpeed() * 100) + '%</b></div>'
        + '<div><span>傷害輸出</span><b>' + Math.round(this.dmgMult() * 100) + '%</b></div>'
        + '<div><span>現今蟲獸傷害輸出</span><b>' + (on ? 167 : 100) + '%</b></div>';
    }
    miniBars() {         // 小魔王的命條（v0.8.21 使用者定）：蜃、鑿齒、蠱雕一隻一條，比大魔王的短三分之一；二十格內的才列，最多三條；斃了歸零停五秒
      const p = this.player, now = performance.now(), box = $('minibars'); if (!box) return;
      this.miniZero = (this.miniZero || []).filter(z => now < z.until);
      const live = this.ents.list.filter(e => MINI_TYPES.indexOf(e.type) >= 0 && !e.shade && e.hp > 0 && U.cheb(e.x, e.y, p.x, p.y) <= MINI_BAR_R).sort((a, b) => U.cheb(a.x, a.y, p.x, p.y) - U.cheb(b.x, b.y, p.x, p.y)).slice(0, 3);
      if (!live.length && !this.miniZero.length) { if (this.miniSig !== '') { this.miniSig = ''; box.innerHTML = ''; } return; }
      const rows = live.map(e => { e.mbk = e.mbk || (this.miniN = (this.miniN || 0) + 1); const max = e.max || DB[e.type].hp; return { k: e.mbk, name: this.beastName(e), hp: this.shownHp(e), max, frac: Math.max(0, Math.min(1, e.hp / max)) }; })
        .concat(this.miniZero.map(z => ({ k: 'z' + z.k, name: z.name, hp: 0, max: z.max, frac: 0, dead: true })));
      const sig = rows.map(r => r.k + ':' + r.hp + ':' + r.frac.toFixed(3)).join('|'); if (sig === this.miniSig) return; this.miniSig = sig;
      box.innerHTML = rows.map(r => '<div class="minibar' + (r.dead ? ' dead' : '') + '"><div class="bb-head"><b>' + r.name + '</b><span>' + r.hp + '／' + rnd(r.max) + (r.dead ? ' · 斃了' : '') + '</span></div><div class="bb-bar"><i style="width:' + (r.frac * 100).toFixed(1) + '%"></i></div></div>').join('');
    }
    bossBar() {          // 大魔王的命條（v0.8.7）：名字、命、獨力／鎖血／護駕（v0.8.20 起名字旁不寫鬃、尾）；玄武的試煉（v0.8.8）也用這條，寫影子的名字
      const p = this.player, f = p.fight, t = !f && p.trial, e = f ? this.bossEnt() : t ? this.shadeEnt() : null, bar = $('bossbar'), tm = f ? this.bossTimes(f) : null;
      const z = !e && this.bossZero && performance.now() < this.bossZero.until ? this.bossZero : null;   // z：剛斃的那一隻，命條歸零停五秒（v0.8.22 起拿錯經也斃得了，不再鎖在一點）
      const gm = e && e.type === '共工' ? (e.shiftT > 0 ? '？' : GONG_MODE_NAME[e.mode]) : '';   // 共工的模式方框（v0.9）：海陸空，換模式時是「？」
      const sig = e ? [f ? f.id : 'trial', gm, e.stage || 0, Math.round(e.hp), f && f.solo ? 1 : 0, Math.ceil(p.lockT || 0), Math.ceil(p.guardT || 0), tm ? Math.ceil(tm.T.cap - tm.all) : ''].join('|') : f && f.away ? ['away', f.id, Math.floor(tm.out), Math.floor(tm.sum), Math.ceil(tm.T.cap - tm.all)].join('|') : z ? 'zero|' + z.name : '';
      if (sig === this.bossSig) return; this.bossSig = sig;
      const away = !e && !!(f && f.away);
      bar.classList.toggle('hidden', !e && !away && !z); if (!e) bar.classList.remove('stages'); bar.classList.toggle('shade', !!(e && t) || !!(z && z.shade)); bar.classList.toggle('away', away); bar.classList.remove('wrong');
      const mb = $('bossbar-mode'); if (mb) { mb.textContent = gm; mb.classList.toggle('hidden', !gm); mb.classList.toggle('shift', gm === '？'); }
      if (away) {   // 戰事掛著、人在地界外（v0.8.10）：寫這一回在外多久、累積多久、這一場還剩多久
        $('bossbar-name').textContent = BOSSES[f.id].zone; $('bossbar-fill').style.width = '100%';
        $('bossbar-note').textContent = '回' + BOSSES[f.id].place + '養傷 · 在外 ' + Math.floor(tm.out) + '／' + tm.T.away + ' 息 · 累積 ' + Math.floor(tm.sum) + '／' + tm.T.sum + ' · 這一場還剩 ' + Math.max(0, Math.ceil(tm.T.cap - tm.all)) + ' 息';
        bar.classList.remove('lock', 'guard'); return;
      }
      if (!e) {   // 斃了：命條歸零，停兩秒再收（v0.8.20）
        if (z) { $('bossbar-name').textContent = z.name; $('bossbar-fill').style.width = '0%'; $('bossbar-note').textContent = '0／' + rnd(z.max) + ' · ' + (z.shade ? (z.practice ? '斃了（練手）' : '斃了，這一卷取到了') : '斃了'); bar.classList.remove('lock', 'guard'); }
        return;
      }
      const max = e.max || DB[e.type].hp, frac = Math.max(0, e.hp / max);
      $('bossbar-name').textContent = f ? BOSSES[f.id].zone : e.shade;   // v0.8.20 使用者定：名字旁不再寫尾、鬃、泡
      $('bossbar-fill').style.width = (frac * 100).toFixed(1) + '%';   // v0.8.16 起這一句被上一行尾巴的註解吃掉，命條一直是滿的（v0.8.20 修）
      bar.classList.toggle('stages', !!e.stages);   // 立極（v0.9.10）：命條上畫三分之一、三分之二兩道線
      $('bossbar-note').textContent = this.shownHp(e) + '／' + rnd(max) + ' · ' + (t ? (e.stages ? '' : '玄武的試煉 · ') + JING[t.id].scroll + (e.stages ? ' 第' + NTH[e.stage || 0] + '段' : '') + '（' + (t.give === false ? '練手 · ' : '') + (t.k >= 0.9 ? '九成' : '六成') + (t.tk > 1 ? ' +' + Math.round((t.tk - 1) * 100) + '%' : '') + '）' : p.lockT > 0 ? '鎖血 ' + Math.ceil(p.lockT) + ' 息' : p.guardT > 0 ? f.guardBy + '護駕 ' + Math.ceil(p.guardT) + ' 息' : f.solo ? '獨力' : f.guardBy + '護駕過') + (tm ? ' · 還剩 ' + Math.max(0, Math.ceil(tm.T.cap - tm.all)) + ' 息' : '');
      bar.classList.toggle('lock', p.lockT > 0); bar.classList.toggle('guard', p.guardT > 0);
    }
    updateHUD() {
      const p = this.player, w = this.world, t = this.facing();
      this.bossBar(); this.miniBars(); this.buildHold(); if (this.shipUIOpen) this.buildShipUI();
      // 身上的四個數會隨膽氣、衣甲變，變了就重畫囊與身上
      const hat = this.hat();
      const ws = (this.totemOn() ? 1 : 0) + (this.totemReady() ? 1 : 0) + '|' + (hat ? Math.ceil(hat.fuel / 10) : '') + '|' + Math.round(this.takenMult() * 1000) + '|' + Math.round(this.dmgMult() * 1000) + '|' + Math.round(this.ironSpeed() * 1000) + '|' + this.wornList().map(s => this.effDays(s)).join(',');
      if (ws !== this.wornSig) { this.wornSig = ws; this.barSig = ''; }
      if (this.barSig === '') this.buildBag();
      const sig = [Math.round(p.hp), Math.round(p.food), Math.round(p.warm), Math.round(p.sta), p.staMax, Math.round(p.san), this.shichen(), p.x, p.y, w.get(p.x, p.y), this.daylight() > 0.5, this.day(), w.tideName(), p.sailing, this.peaceDays(), this.weatherLabel(), p.ship ? Math.round(p.ship.hp) + ':' + this.wardDays() : '', p.swimming ? Math.ceil(p.swimT) + ':' + this.count('木板') + ':' + (p.deploy ? Math.ceil(p.deploy.t) : '') : '', Math.ceil(p.heatT || 0)].join('|');
      // 夥伴：右邊一隻一隻，命與力直條
      const comps = this.ents.tamed(), csig = comps.map(e => e.type + Math.round(e.hp) + '/' + Math.round(e.sta)).join(',');
      if (csig !== this.compSig) {
        this.compSig = csig; const box = $('companions'); box.innerHTML = '';
        for (const e of comps) {
          const el = document.createElement('div'); el.className = 'comp'; el.title = e.type + ' · 命 ' + Math.round(e.hp) + '/' + DB[e.type].hp + ' · 力 ' + Math.round(e.sta) + '/100（餵魚 +40）';
          el.innerHTML = '<span class="ch">' + e.type + '</span><div class="vbars"><i class="hp" style="height:' + Math.round(100 * e.hp / DB[e.type].hp) + '%"></i><i class="sta" style="height:' + Math.round(e.sta) + '%"></i></div>';
          box.appendChild(el);
        }
      }
      if (sig !== this.hudSig) {
        this.hudSig = sig;
        const db = $('debuffs');   // 右下：溺水倒數，紅框閃（v0.8.2）
        if (p.swimming) { db.classList.remove('hidden'); db.innerHTML = '<b>溺</b><span>還有 ' + Math.ceil(p.swimT) + ' 息</span>' + (p.deploy ? '<small class="deploy">放' + p.deploy.n + '下水 · 還要 ' + Math.ceil(p.deploy.t) + ' 息</small>' : '') + (this.has('木板') ? '<small>木板 ×' + this.count('木板') + '（+' + this.count('木板') * PLANK_SWIM + ' 息）</small>' : '') + (p.azure ? '<small>水性：慢四分之一、苦頭減半</small>' : ''); }
        else if (!db.classList.contains('hidden')) db.classList.add('hidden');
        const fill = (id, v) => $(id).style.setProperty('--p', U.clamp(v, 0, 1).toFixed(3));
        fill('hpfill', p.hp / p.hpMax); fill('foodfill', p.food / 100); fill('warmfill', p.warm / 100); fill('stafill', p.sta / p.staMax); fill('sanfill', p.san / 100);
        for (const [k, , v] of this.vitalFracs()) { const el = $(k + 'fill').parentNode; el.classList.toggle('warn', v < WARN_LIGHT); el.classList.toggle('low', v < WARN_POP); }   // 不到五成亮燈，不到四分之一轉紅
        $('hplabel').innerHTML = '命<br>' + Math.round(p.hp) + (p.hpMax > 100 ? '<small>／' + Math.round(p.hpMax) + '</small>' : ''); $('foodlabel').innerHTML = '飽<br>' + Math.round(p.food); $('warmlabel').innerHTML = '暖<br>' + Math.round(p.warm) + (p.heatT > 0 ? '<small>熱 ' + Math.ceil(p.heatT) + '</small>' : ''); $('stalabel').innerHTML = '力<br>' + Math.round(p.sta); $('sanlabel').innerHTML = '愜<br>' + Math.round(p.san);
        const nn = this.nightNo();
        const d0 = this.day() - 1;   // v0.9.16 曆法：月日與節氣，候名放在指著時的提示裡
        $('status').innerHTML = '<b>第 ' + this.day() + ' 日</b> <span class="cal" title="' + CAL.longLabel(d0) + '">' + CAL.label(d0) + '</span> &nbsp;' + this.shichen() + ' ' + (this.daylight() > 0.5 ? '日' : '月') + this.weatherLabel() + (this.isNight() ? '<span class="dim">（第 ' + nn + ' 夜' + (nn >= this.diff.ghost ? '，魄夜' : '') + '）</span>' : '') + ' &nbsp;·&nbsp; ' + w.tideName() + ' &nbsp;·&nbsp; ' + (p.sailing ? '船上 · ' + (this.zoneName() ? this.zoneName() + ' · ' : '') + (p.ship ? p.ship.kind + ' ' + Math.round(p.ship.hp) + '/' + this.shipMax(p.ship) : '') + (this.shipWarded() ? ' · 船頭' + this.shipSkullName() + ' ' + this.wardDays() + ' 日' : '') : p.swimming ? '<b style="color:#b4392a">落水 · 還有 ' + Math.ceil(p.swimT) + ' 息</b>' : this.placeName()) + (this.peaceDays() ? ' &nbsp;·&nbsp; <span class="dim">龜卜 · ' + this.peaceDays() + ' 日無魄</span>' : '') + (this.mealOn() ? ' &nbsp;·&nbsp; <span class="dim" title="' + G.MEALS[p.meal.k].text + '">食 · ' + G.MEALS[p.meal.k].dish + '</span>' : '') + ' &nbsp;·&nbsp; <span class="dim">(' + p.x + ', ' + p.y + ') · ' + this.diff.name + '</span>';
      }
      const lv = this.level(), daysLeft = p.decayAt ? Math.max(1, Math.ceil((p.decayAt - w.time) / DAY - 1e-6)) : 0;
      const cs = p.cour + '|' + lv + '|' + daysLeft + '|' + (this.hasGod() ? 1 : 0) + '|' + (p.azure ? 1 : 0) + (p.bai ? 1 : 0) + (p.zhu ? 1 : 0) + '|' + BEADS.map(id => this.beadOf(id)).join(',') + '|' + Object.keys(p.bosses || {}).join(',') + '|' + this.buffLayers() + '|' + (p.trial ? p.trial.id : '');
      if (cs !== this.courSig) {
        this.courSig = cs;
        $('mapwrap').style.setProperty('--cour', Math.round(100 * this.levelFrac()) + '%');
        const ring = $('soulring'), bs = p.bosses || {};   // 魂環（v0.8.21 使用者定）：斃了大魔王的戰利品，修蛇龍魂、大風鳳翎、封豨虎魄；v0.8.22：求教過同一屬性的神獸，那一分多一顆十字星
        for (const id in RING) { const [c, , , learn] = RING[id]; ring.classList.toggle(c, !!bs[id]); ring.classList.toggle('s' + c, !!p[learn]); }
        ring.title = '魂環（斃大魔王的戰利品）：' + ['修蛇', '大風', '封豨'].map(id => { const [, n, g, learn] = RING[id]; return n + '（' + (bs[id] ? (BOSSES[id] ? BOSSES[id].feat : '斃了' + id) : '還沒斃' + id) + '；' + g + (p[learn] ? '已求教，十字星' : '未求教') + '）'; }).join('、') + '。斃了那一隻，那一分上色；求教過同一屬性的神獸，那一分正中多一顆十字星。內圈金色是膽氣，滿一圈升一重。';
        const BEAD_TEXT = { '': '還沒挑戰', held: '拿著經、還沒打', fightJing: '拿著經在打', won: '拿著經斃了', fightNo: '沒拿牠的經在打', miss: '沒拿經斃了（黑叉）', ask: '三個魂環集齊了，立極還沒開', trialOn: '立極開了，還沒結束', got: '拿到了共工經', 'fightNo blink': '沒拿共工經就在打共工' };   // v0.8.21 使用者定：四顆珠照魔王排；v0.8.22 第四顆是立極（共工那一卷）與共工
        $('jingbeads').querySelectorAll('i').forEach((b, i) => { b.className = this.beadOf(BEADS[i]) || 'none'; });
        { const xb = $('jingbeads'), merged = !!bs['共工'], st = BEADS.map(id => this.beadOf(id)), all = st.every(v => v === 'won');   // 四珠合玄（v0.9.19 使用者定）：斃了共工，四顆珠合成一個「玄」字——四顆都是拿著經斃的是朱紅，服了是金，其餘是墨
          xb.classList.toggle('merged', merged); xb.classList.toggle('xred', merged && all && !p.gold); xb.classList.toggle('xgold', merged && !!p.gold); }
        $('jingbeads').title = (bs['共工'] ? '四顆珠合成了一個「玄」字（斃了共工）：' + BEADS.map(id => id + '（' + (BEAD_TEXT[this.beadOf(id)] || '還沒挑戰') + '）').join('、') + '。四顆都拿著經斃的是朱紅，「服了？服了！」是金，其餘是墨。' : '四顆珠，從左到右：' + BEADS.map(id => id + '（' + (BEAD_TEXT[this.beadOf(id)] || '還沒挑戰') + '）').join('、') + '。前三顆：灰點是還沒挑戰，紅圈是拿著經，紅問號是拿著經在打，紅點是拿著經斃了；黑問號是沒拿牠的經在打，黑叉是沒拿經斃了。第四顆是共工：三個魂環集齊了是灰問號。' + (this.buffLayers() ? '大魔王現在 +' + Math.round(this.buffLayers() * BUFF_STEP * 100) + '%。' : ''));
        $('courlabel').textContent = (this.test ? '膽氣 · ∞' : lv === 0 ? '膽氣 · 初' : '膽氣 · 第 ' + lv + ' 重') + (this.totemOn() ? ' · 山海衣' : '');
        const dec = $('courdecay');
        if (lv > this.decayFloor() && daysLeft) { dec.classList.remove('hidden'); dec.textContent = (this.hasGod() ? this.godText() : '卅一重以上三日一減') + ' · 還有 ' + daysLeft + ' 日'; }
        else dec.classList.add('hidden');
      }
      let s;
      const ch = w.get(t.x, t.y), d = DB[ch], e = this.ents.at(t.x, t.y), plc = w.placeAt(t.x, t.y), hs = this.held();
      const az = this.ents.list.find(o => o.type === '青龍' && U.cheb(o.x, o.y, p.x, p.y) <= 2);
      const bh = this.ents.list.find(o => o.type === '白虎' && U.cheb(o.x, o.y, p.x, p.y) <= 2), zq = this.ents.list.find(o => o.type === '朱雀' && U.cheb(o.x, o.y, p.x, p.y) <= 2), xw = this.ents.list.find(o => o.type === '玄武' && U.cheb(o.x, o.y, p.x, p.y) <= 2);
      if (p.knock > 0) s = '昏迷中……';
      else if (p.insane && !p.ctrl) s = '<i>手腳不聽使喚……</i>';
      else if (xw && (!e || e === xw)) { s = '北方玄武 · <kbd>E</kbd> ' + (!p.xuan ? '說話' : p.trial ? '（試煉中）' : p.jingFor && JING[p.jingFor] ? '取經（手上是' + JING[p.jingFor].scroll + '）' : '取經'); }
      else if (zq && (!e || e === zq)) s = '南方朱雀' + (p.zhu ? '（求教過了）' : ' · <kbd>E</kbd> 求教' + (this.has('朱羽') ? '（帶著朱羽）' : '（要一根朱羽）'));
      else if (bh && (!e || e === bh)) s = '西方白虎' + (p.bai ? '（求教過了）' : ' · <kbd>E</kbd> 求教' + (this.has('虎符') ? '（帶著虎符）' : '（要一枚虎符）'));
      else if (az && (!e || e === az)) s = '東海青龍' + (p.azure ? '（求教過了）' : ' · <kbd>E</kbd> 求教' + (this.has('蜃珠') ? '（帶著蜃珠）' : '（要一顆蜃珠）'));
      else if (p.swimming) {
        if (!this.shoreAt || performance.now() - this.shoreAt > 400) { this.shoreAt = performance.now(); this.shore = this.nearestShore(); }
        s = '<b>落水了！還有 ' + Math.ceil(p.swimT) + ' 息</b>' + (this.shore ? ' · 最近的岸：' + this.shore.dir + '約 ' + this.shore.n + ' 步' : '') + (e && e.type === '蜃' ? ' · <kbd>E</kbd> 打蜃' : '') + (this.holdPick() ? ' · <kbd>F</kbd> 把船艙的' + this.holdPick().n + '放下水（撐 ' + (DEPLOY_SEC[this.diff.key] || 4) + ' 息，這回還能放 ' + (DEPLOY_MAX - (p.swimShips || 0)) + ' 艘；<kbd>B</kbd> 換一艘）' : '');
      }
      else if (p.sailing) s = (p.ship ? this.shipText(p.ship) : '船上') + ' · <kbd>WASD</kbd> 船上走、走上岸就下船 · <kbd>1</kbd>左 <kbd>2</kbd>上 <kbd>3</kbd>下 <kbd>4</kbd>右 開船' + (this.landBeside(this.shipCells()).length ? ' · <kbd>F</kbd> 收船上岸' : '') + (e && e.type === '魚' ? ' · <kbd>E</kbd> 捉魚' : e && e.type === '蜃' ? ' · <kbd>E</kbd> 打蜃' : '') + (hs && ITEMS[hs.n] && ITEMS[hs.n].ward ? ' · <kbd>V</kbd> 放上船頭' : hs && hs.n === '木板' ? ' · <kbd>V</kbd> 補船' : '');
      else if (p.holdSel >= 0 && this.holdPick() && d.kind === 'water' && ch !== '舟') s = '選了船艙的' + this.holdPick().n + ' · <kbd>F</kbd> 放下水（要正對著水、面前三乘三都是水）· <kbd>B</kbd> 換一艘';   // v0.8.19
      else if (plc) s = '「' + plc.name + '」 · <kbd>E</kbd> 讀' + (hs && hs.n === '玻璃瓶' && (ch === '泉' || ch === '井') ? '　<kbd>E</kbd> 取淡水' : '');
      else if (e && e.type === '龍') s = '你的小龍。';
      else if (e && e.type === '狸') s = e.tame ? (e.home ? '你的狸（守著田）· 手持魚按 <kbd>F</kbd> 餵，牠就跟你走' : '你的狸（跟著你）· 帶到自己種的田邊，牠就留下來守著') : '狸（見人就躲）' + (hs && hs.n === '魚' ? ' · <kbd>F</kbd> 投魚（一半機會跟你走）' : ' · 手持魚按 F 投一條');   // v0.9.19
      else if (e && e.type === '魄') s = '魄 · 無形。身上的光只逼得退；燈、火、旺灶三格內才煙滅';
      else if (e && e.type === '鷹') s = '鷹' + (e.tame ? '（你的 · 命 ' + Math.round(e.hp) + ' 力 ' + Math.round(e.sta) + '）' : e.angry ? '（怒）' : '（半友好）') + (hs && hs.n === '魚' ? ' · <kbd>F</kbd> ' + (e.tame ? '餵魚（力 +40）' : '投魚馴服（' + Math.round(this.tameChance() * 100) + '%）') : ' · 手持魚按 F ' + (e.tame ? '餵' : '馴')) + ' · <kbd>E</kbd> 攻擊';
      else if (e) s = '「' + this.beastName(e) + '」' + (e.type === '蟾' || e.type === '蛛' ? (e.venom ? '（有毒）' : '（無毒）') : e.type === '齒' ? (this.ents.shielded(e, p.x, p.y) ? '（你在盾前，打只有一成）' : '（盾不在這邊）') : '') + (e.hp > 1 ? '（' + this.shownHp(e) + '）' : '') + ' · <kbd>E</kbd> ' + (e.type === '魚' ? '捉' : e.type === '鳥' ? '驚' : this.heldDmg() ? '攻擊（' + this.activeTool().n + '）' : '<i>徒手打不了，具欄裡選把刀劍</i>');
      else if (w.fogAt(t.x, t.y)) { const n = this.count('扇'); s = '霧障 · 走進去會問你要不要用扇子吹散' + (n ? '（囊中 ' + n + ' 把' + (hs && hs.n === '扇' ? '；<kbd>V</kbd> 現在就搧' : '') + '）' : '（沒有扇子：草四木一可紮一把）'); }
      else if (ch === '碑') s = '一塊古碑 · <kbd>E</kbd> 讀碑';
      else if (ch === '亭') s = '惜字亭 · <kbd>E</kbd> ' + ((p.bosses || {})['共工'] && !p.redeemed ? '還願、傳送' : p.wish ? '看看、傳送' : '許願、傳送');
      else if (ch === '桑' || ch === '若' || ch === '建') s = { '桑': '扶桑', '若': '若木', '建': '建木' }[ch] + '（傳送點）· <kbd>E</kbd> 寫一個地名';
      else if (ch === '包') { const left = this.purseLeft(t.x, t.y); s = '落下的荷包' + (left !== null ? '（最早的那份' + (left > 1 ? '還剩 ' + left + ' 日，連今日' : '今日過完就沒了') + '）' : '') + ' · <kbd>E</kbd> 打開'; }
      else if (ch === '囊') s = '小囊（' + (w.bags.get(U.key(t.x, t.y)) || []).map(it => it.n + (it.c > 1 ? '×' + it.c : '')).join('、') + '） · <kbd>E</kbd> 取';
      else if (d.net) { const rec = w.netAt(t.x, t.y), f = rec ? w.netFish(rec, w.time) : 0, r = w.netRule(d.net, rec && rec.tidal), max = w.netDur(d.net), torn = rec && rec.dur <= 0; s = (d.net === 1 ? '小網' : d.net === 2 ? '中網' : '大網') + (rec && rec.tidal ? '（灘上）' : '') + ' · 魚 ' + f + '/' + r.cap + (torn ? '（<b>破了</b>，不進魚）' : '（' + r.every + ' 息一條）') + (rec ? ' · 耐 ' + rec.dur + '/' + max : '') + (f ? ' · <kbd>E</kbd> 取魚' : ' · <kbd>E</kbd> 收回') + (rec && rec.dur < max ? ' · <kbd>F</kbd> 加固（棉麻各 ' + this.mendCost(rec) + '）' : ''); }
      else if (ch === '漁') s = '魚梁 · <kbd>E</kbd> 取魚' + (w.time < (w.weirs.get(U.key(t.x, t.y)) || 0) ? '（魚還沒來）' : '');
      else if (ch === '門') s = '門 · <kbd>E</kbd> 問路';
      else if (ch === '櫃') s = '櫃 · <kbd>E</kbd> 開';
      else if (ch === '舟') { const rec = w.shipAt(t.x, t.y); s = (rec ? this.shipText(rec) : '船') + ' · <kbd>E</kbd> 上船' + (hs && ITEMS[hs.n] && ITEMS[hs.n].ward ? ' · <kbd>F</kbd> 首骨放上船頭' : hs && hs.n === '木板' ? ' · <kbd>F</kbd> 補船' : rec && this.landBeside(rec.cells).length ? ' · <kbd>F</kbd> 收回船艙' : ' · 沒靠岸，收不回'); }
      else if (d.crop) { const r = w.crops.get(U.key(t.x, t.y)); s = this.cropLabel(t.x, t.y) + (d.crop >= 3 ? ' · <kbd>E</kbd> ' + (d.crop === 4 ? '拾遺穗' : '收割') : this.heldTool() === '鋤' ? ' · <kbd>E</kbd> 拔掉' : '') + (r ? ' · 地力 ' + r.f : '') + (hs && hs.n === '灰' ? ' · <kbd>F</kbd> 撒灰' : ''); }   // 五穀（v0.9.18）
      else if (ch === '田' && hs && ((ITEMS[hs.n] || {}).seed || hs.n === '灰')) { const it = ITEMS[hs.n], why = it.seed ? this.sowWhy(it.seed, t.x, t.y) : ''; s = '田 · 地力 ' + w.fertOf(t.x, t.y) + '/' + G.FERT_MAX + (it.seed ? (why ? ' · <i>' + why + '</i>' : ' · <kbd>F</kbd> 下種「' + it.seed + '」') : ' · <kbd>F</kbd> 撒灰（地力 +1）'); }
      else if (ch === '偶') { const days = w.scareDays(t.x, t.y); s = '稻草人 · 還能守 ' + Math.ceil(days) + ' 天' + (hs && hs.n === '偶' ? ' · <kbd>F</kbd> 續' : '') + ' · <kbd>E</kbd> 拆下（重放重計）'; }
      else {
        s = '面前：' + (ch === '白' ? '白紙' : '<b>' + ch + '</b>') + (ch === '田' ? '（地力 ' + w.fertOf(t.x, t.y) + '/' + G.FERT_MAX + '）' : '') + (w.isBurning(t.x, t.y) ? ' <i class="fire">燃燒中</i>' : '') + ((ch === '灶' || ch === '鼎') ? (w.stoveLit(t.x, t.y) ? ' <i class="fire">火旺 ' + Math.round(w.stoveFuel(t.x, t.y)) + ' 息</i>' : ' <i>冷的，先添柴</i>') : '');
        const tool = this.heldTool();
        if (hs && hs.n === '玻璃瓶' && (d.fresh || ch === '湯')) s += ' · <kbd>E</kbd> 取淡水';
        else if (hs && hs.n === '玻璃瓶' && d.kind === 'water') s += ' · <kbd>E</kbd> 取海水';
        else if (tool === '鋤' && (ch === '土' || ch === '草')) s += ' · <kbd>E</kbd> 鋤成田';
        else if (d.yield) {
          const need = d.need && tool !== d.need;
          s += ' · <kbd>E</kbd> ' + (need ? '<i>要用' + G.TOOL_NAMES[d.need] + '</i>' : '取 ' + Object.keys(d.yield).map(n => n + (d.yield[n] > 1 ? '×' + d.yield[n] : '')).join(' ') + (d.fast ? (tool === d.fast ? '（' + d.fast + '，快）' : '（' + d.fast + '更快）') : ''));
        }
        if (hs) {
          const it = G.item(hs.n), tl = ITEMS[hs.n] || {};
          // v0.8.15：面向灶、鼎，F 一律先開它，提示也先寫它
          if (ch === '鼎') s += ' · <kbd>F</kbd> 開鼎' + ((hs.n === '蟾蜍肉' || hs.n === '毒蟾肉') ? ' · 煉丹' : hs.n === '蜃殘體' ? ' · 熬蜃珠（殘體 ' + this.count('蜃殘體') + '/' + PEARL_SHARDS + '、海水瓶 ' + this.count('海水瓶') + '/' + PEARL_BRINE + '、淡水瓶 ' + this.count('淡水瓶') + '/' + PEARL_FRESH + '，' + Math.round(PEARL_P * 100) + '%）' : TOKENS[hs.n] ? ' · ' + this.tokenNeeds(hs.n) : '');   // v0.8.14：F 一律開鼎，選中的料只在提示裡寫夠不夠
          else if (ch === '灶') s += ' · <kbd>F</kbd> 開灶';
          else if (tl.slot) s += ' · <kbd>F</kbd> ' + (tl.light ? '戴上' : '穿上');
          else if (tl.rod) { const f = this.fishing, t = f ? null : this.rodTarget(); s += f ? (f.phase === 'bite' ? ' · <b><kbd>F</kbd> 提竿！</b>' : f.phase === 'hook' ? ' · <kbd>F</kbd> 收線（' + f.done + '／' + f.need + '，別收太急）' : ' · 等浮子沉 · <kbd>F</kbd> 收竿') : !t ? ' · 走到水邊、面向水再按 <kbd>F</kbd> 拋竿' : t.L === 'shallow' ? ' · <i class="dim">近岸淺水是撒網的地方，竿拋不得</i>' : t.L === 'deep' && tl.rod < 2 ? ' · <i class="dim">深海要大鉤</i>' : ' · <kbd>F</kbd> 拋竿入' + LAYER_NAME[t.L]; s += ' · <i class="dim">耐 ' + (hs.dur === undefined ? tl.rodLife : hs.dur) + '／' + tl.rodLife + '</i>'; }   // v0.9.17 垂釣
          else if (tl.tile && DB[tl.tile] && DB[tl.tile].net) { const mx = w.netDur(DB[tl.tile].net), cp = this.castPreview(); s += (hs.dur !== undefined && hs.dur <= 0 ? ' · <i class="dim">網破了，製作欄「加固」棉麻各 ' + this.mendCost(hs) + '</i>' : cp ? ' · <kbd>F</kbd> 撒網（淺色網影就是撒得到的地方）' : ' · 走到水邊，網影浮出來再按 <kbd>F</kbd> 撒') + ' · <i class="dim">耐 ' + (hs.dur === undefined ? mx : hs.dur) + '／' + mx + (hs.rf ? '，固過 ' + hs.rf + ' 次' : '') + '</i>'; }
          else if (tl.tool && tl.dur) s += ' · <kbd>F</kbd> 移進具欄';
          else if ((DB[tl.tile || hs.n] || {}).place) s += ' · <kbd>F</kbd> 放「' + hs.n + '」';
          if (hs.n === '錦囊') s += p.pouches >= MAX_POUCHES ? ' · <i class="dim">錦囊已用完八個</i>' : ' · <kbd>V</kbd> 用掉（囊多兩格、具欄多一格，已用 ' + p.pouches + '／' + MAX_POUCHES + '）';
          if (it.food) s += ' · <kbd>V</kbd> ' + (hs.n.indexOf('瓶') >= 0 || hs.n === '果酒' ? '喝' : '吃');
        }
        if (this.bedNear()) s += ' · <kbd>R</kbd> 睡';
        if (this.heldTool() === '弓') { const st = this.slingTarget(); s += ' · 彈弓：' + (st ? '<kbd>E</kbd> 射「' + st.type + '」（' + U.cheb(st.x, st.y, p.x, p.y) + ' 格）' : '面前九格內沒有獸') + ' · 石子 ' + this.count('石子') + (w.get(p.x, p.y) === '台' ? ' · 站在台上，越得過磚' : ''); }
        if (ch === '灶') s += (hs ? '' : ' · <kbd>F</kbd> 開灶') + '<br><span class="dim">灶：按 F 開灶，在灶裡添柴、烤魚肉、燒瓶、蒸餾、煉鐵煉鎢鋼</span>';
        if (ch === '鼎') s += (hs ? '' : ' · <kbd>F</kbd> 開鼎') + '<br><span class="dim">鼎：按 F 開鼎，在鼎裡添柴、熬蜃珠（殘體九、海水瓶三、淡水瓶一）、鑄虎符（殘體九、鐵三、鎢鋼一）、煉朱羽（殘體九、精煤一、火蝕一）、煉丹（這次 ' + Math.round(this.pillChance('蟾蜍肉') * 100) + '%／' + Math.round(this.pillChance('毒蟾肉') * 100) + '%，已煉 ' + p.pillsMade + ' 顆）</span>';
      }
      if (this.msgUntil && performance.now() < this.msgUntil) s = this.msgText;
      else if (this.gaze) s = '';   // 觀星時不寫面前是什麼（v0.9.16）
      if (s !== this.lastMsg) { this.lastMsg = s; $('msg').innerHTML = this.test ? String(s).replace(/Infinity/g, '∞') : s; }
    }
    message(text) { if (!text) return; if (this.test) text = String(text).replace(/Infinity/g, '∞'); this.msgText = '<i>' + text + '</i>'; this.msgUntil = performance.now() + 2400; this.lastMsg = null; }
    toast(title, body, ms) {
      if (this.test && body) body = String(body).replace(/Infinity/g, '∞');
      const el = document.createElement('div'); el.className = 'toast';
      el.innerHTML = '<b>' + title + '</b>' + (body ? '<span>' + body + '</span>' : '');
      $('toasts').appendChild(el);
      setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 600); }, ms || 4500);
    }

    // ---------- 存檔 ----------
    save(slot) {   // slot：抄到別的格（暫停面板「存到」，v0.8）；不給就存在這一局的格。v0.9.2：抄進測試格的那一份記成測試格（讀進來就是測試格）
      if (this.frozen) return;   // 正在換難度、要重新讀檔（v0.8.2）：別再存回去
      const p = this.player;
      if (p.fight) { const e = this.bossEnt(); if (e) Object.assign(p.fight, { hp: U.r4(e.hp), x: e.x, y: e.y }, e.type === '共工' ? { mode: e.shiftT > 0 ? e.next : e.mode, modeT: e.shiftT > 0 ? undefined : U.r4(e.modeT || 0) } : {}); p.fight.lockT = U.r4(p.lockT || 0); p.fight.guardT = U.r4(p.guardT || 0); }   // 戰況存進檔，讀進來接著打（v0.8.7）
      try {
        localStorage.setItem(Game.slotKey(slot || this.slot), JSON.stringify({ v: 5, ver: GAME_VER, shipFix: 1, seed: this.seed, diff: this.diff.key, test: (this.test || (slot && slot !== this.slot && TEST_SLOTS.indexOf(slot) >= 0)) || undefined, savedAt: Date.now(), brief: this.brief(), world: this.world.serialize(), ents: this.ents.serialize(),
          player: { x: p.x, y: p.y, fx: p.fx, fy: p.fy, hp: p.hp, food: p.food, warm: p.warm, sta: p.sta, staMax: p.staMax, san: p.san, cour: p.cour, bag: p.bag, sel: p.sel, home: p.home, readSteles: p.readSteles,
            places: p.places, isles: p.isles, isleNews: p.isleNews, zones: p.zones, zoneNews: p.zoneNews, creatures: p.creatures, raftTaken: p.raftTaken, dragon: p.dragon, azure: p.azure, bai: p.bai, zhu: p.zhu, deathKeep: p.deathKeep, fight: p.fight, bosses: p.bosses, feats: p.feats, inBoss: p.inBoss, bossOut: p.bossOut, bossDeclined: p.bossDeclined, bossBuff: p.bossBuff, trialTries: p.trialTries, gates: p.gates, gateCredit: p.gateCredit || undefined, masses: p.masses, massOrder: p.massOrder, massNames: p.massNames, gold: p.gold || undefined, hardOnly: !!p.hardOnly, gongLost: p.gongLost, trophies: p.trophies, dead: p.dead, deadText: p.deadText, xuan: p.xuan, scrolls: p.scrolls, xuanjia: p.xuanjia, wish: p.wish, redeemed: p.redeemed, key2: p.key2, gongStele: p.gongStele, pavilion: p.pavilion, puppet: p.puppet, jingOld: p.jingOld, jingFor: p.jingFor, shade9: p.shade9, jingCour: p.jingCour, testKit: p.testKit, scaleTaken: p.scaleTaken, bed: p.bed, codex: p.codex, finished: p.finished, deaths: p.deaths, burn: p.burn, lastDay: p.lastDay, poisonT: p.poisonT, heatT: p.heatT, poisonPer: p.poisonPer, poisonBy: p.poisonBy || undefined, sailing: p.sailing, tools: p.tools, tool: p.tool, decayAt: p.decayAt, worn: p.worn, hitWin: p.hitWin, totemOff: p.totemOff, pouches: p.pouches, noGhostUntil: p.noGhostUntil, sanBoostUntil: U.r4(p.sanBoostUntil || 0), hpMax: p.hpMax, pillsMade: p.pillsMade, pillsEaten: p.pillsEaten, inFog: p.inFog, ship: p.ship, hold: p.hold || [], nestHints: p.nestHints, swimming: p.swimming, swimT: p.swimT, swimShips: p.swimShips || 0, meal: p.meal || undefined, fishLog: p.fishLog || undefined, mealN: p.mealN || undefined, wuhou: p.wuhou || undefined, visits: p.visits || undefined, firsts: p.firsts || undefined, readRain: p.readRain, tut: p.tut || undefined, idle: p.idle || undefined }, stats: this.stats }));
      } catch (err) { this.saveFail(err); return false; }   // v0.8.25：寫不進去要說一聲（原本悄悄吞掉，玩家不知道存檔停了）
      this.saveBad = 0; return true;
    }
    saveFail(err) {   // 存檔寫不進去（v0.8.25 使用者要的提醒）：一連串失敗只跳一次，還是存不進去就每五分鐘再提一次
      const now = performance.now(); if (this.saveBad && now - this.saveBad < 300000) return; this.saveBad = now;
      const full = err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014);
      this.toast('存檔沒存進去', (full ? '瀏覽器給這個網頁的存檔空間滿了（八格存檔共用一份）。' : '瀏覽器不讓這個網頁存東西（可能是無痕視窗，或封鎖了網站資料）。') + '從剛才起，這一局的進度沒有存下來。' + (full ? '可以到起始頁刪掉用不著的存檔格，再回來接著玩，它會自己再存。' : ''), 15000);
      this.message('存檔沒存進去。'); SFX.fail();
    }
    // v0.9.5 使用者定：紙從 2500×2500 縮成 1600×1600（第四版生成），舊存檔（第一到第三版）讀進來一律搬過來。本島一格沒動，所以本島方框（HOME_BOX）裡的照留；
    //   外面的地重新長過：在外面蓋的人造物（照拆下來會得到的）、櫃與柴架裡的、地上的小囊與荷包、下在水上的網，收成一包，讀進來以後擱在床邊或出生點附近（afterMove）；
    //   停在外面的船收進船艙（滿了就一起包進那一包）；點亮過的傳送點清掉，重點那幾處不再給膽氣（gateCredit）；陸塊的名字清掉；走過的地圖只留本島；
    //   人在外面就回出生點（離島心二百三十八格內的海上照舊在船上），跟魔王的戰事作罷、不算輸；床、所有地界外最後那一格在外面的就清掉。回傳搬了什麼
    static movePaper(s) {
      const w = s && s.world; if (!w || (w.gen || 1) >= 4) return null;
      const B = G.HOME_BOX, home = (x, y) => Math.abs(x) <= B && Math.abs(y) <= B, xy = (k) => { const i = k.indexOf(','); return [+k.slice(0, i), +k.slice(i + 1)]; }, inK = (k) => home(...xy(k));
      const r = { gen0: w.gen || 1, sack: [], built: 0, boxes: 0, ships: 0, gates: 0, credit: 0, fight: null, toSpawn: false }, put = (n, c, extra) => { n = RENAMED[n] || n; if (G.item(n) && c > 0) r.sack.push(Object.assign({ n, c }, extra || {})); };
      const keep = (m) => { const o = {}; for (const k in m || {}) if (inK(k)) o[k] = m[k]; return o; };
      const p = s.player || (s.player = {}), hold = p.hold || (p.hold = []), stow = (kind, d) => { const st = { n: kind, c: 1, ship: { hp: d.hp, skulls: d.skulls || [], repairs: d.repairs || 0 } }; if (hold.length < HOLD_MAX) hold.push(st); else r.sack.push(st); r.ships++; };
      const racked = new Set(), diff = {}; for (const k in w.diff || {}) {
        if (inK(k)) { diff[k] = w.diff[k]; continue; }
        const t = w.diff[k], d = DB[t], rack = (t === '灶' || t === '鼎') && ((w.shelves || {})[k] || []).length ? w.shelves[k] : null;   // 灶、鼎的柴架上有柴（v0.9.8 使用者定）：照拆下來一樣記在那個灶、鼎上，自成一格
        if (d && d.kind === 'object' && (d.place || t === '墟') && d.yield && t !== '舟') { for (const n in d.yield) { if (rack && n === t) { r.sack.push({ n, c: 1, store: rack.map(([m, c]) => ({ n: RENAMED[m] || m, c })) }); racked.add(k); } else put(n, d.yield[n]); } r.built++; }   // 墟：人砌的磚被撞到剩一半（差異層裡的才是人砌的），拆了得石一
      }
      const ships = {}; for (const k in w.ships || {}) { const v = w.ships[k]; if ((v.cells || []).every(([x, y]) => home(x, y))) { ships[k] = v; continue; } stow(v.kind, v); for (const [x, y] of v.cells || []) delete diff[U.key(x, y)]; }
      for (const k in w.chests || {}) if (!inK(k)) { for (const it of w.chests[k] || []) if (it) r.sack.push(it); r.boxes++; }
      for (const k in w.shelves || {}) if (!inK(k) && !racked.has(k)) for (const [n, c] of w.shelves[k] || []) put(n, c);
      for (const k in w.bags || {}) if (!inK(k)) { for (const it of w.bags[k] || []) if (it) r.sack.push(it); r.boxes++; }
      for (const k in w.nets || {}) if (!inK(k)) {   // 下在外面的網：跟收網一樣，網裡到這時候的魚、耐久、加固過幾次都帶著
        const v = w.nets[k], rec = { size: v[0], fish: v[3] || 0, t: v[4] || 0, dur: v[6] === undefined ? World.prototype.netDur(v[0]) : v[6], rf: v[7] || 0, tidal: String(v[5] || '').indexOf('灘') >= 0 }, fish = World.prototype.netFish.call(World.prototype, rec, w.time || 0);
        put(v[0] === 1 ? '漁網' : v[0] === 2 ? '中漁網' : '大漁網', 1, rec.dur < World.prototype.netDur(v[0]) || rec.rf ? { dur: rec.dur, rf: rec.rf } : {}); put('魚', fish);
      }
      Object.assign(w, { gen: 4, diff, ships, wallHp: keep(w.wallHp), burn: keep(w.burn), timers: keep(w.timers), stoves: keep(w.stoves), shelves: keep(w.shelves), bags: keep(w.bags), purses: keep(w.purses), weirs: keep(w.weirs), scarecrows: keep(w.scarecrows), ores: keep(w.ores), chests: keep(w.chests), nets: keep(w.nets) });
      w.fogs = (w.fogs || []).filter(f => f && f[4] && home(f[4][0], f[4][1]));
      const cell = (k) => { const [cx, cy] = xy(k); return cx * 16 + 15 >= -B && cx * 16 <= B && cy * 16 + 15 >= -B && cy * 16 <= B; };   // 走過的地圖：碰得到本島方框的那幾塊
      if (typeof w.ex === 'string') { const m = World.prototype.unpackExplored.call(null, w.ex); for (const k of [...m.keys()]) if (!cell(k)) m.delete(k); w.ex = World.prototype.packExplored.call({ explored: m }); }
      else if (w.explored) { const o = {}; for (const k in w.explored) if (cell(k)) o[k] = w.explored[k]; w.explored = o; }
      s.ents = (s.ents || []).filter(e => e.tame);   // 外面的蜃、龍散了（不算逃，不扣膽氣）；馴過的鷹跟著人
      const nearSea = p.sailing && p.ship && Math.hypot(p.x || 0, p.y || 0) < 238;   // 本島四周二百四十格內第四版一定是海（孤嶼除外，讀進來船壓到陸地照舊挪到最近的海）：船上的人照舊在船上
      if (!home(p.x || 0, p.y || 0) && !nearSea) {
        if (p.sailing && p.ship) stow(p.ship.kind || '孤帆', p.ship);
        p.sailing = false; p.ship = null; p.swimming = false; p.swimT = 0; r.toSpawn = true;
      }
      const lit = Object.keys(p.gates || {}).filter(k => { const g = p.gates[k]; return g && !(g.x !== undefined && home(g.x, g.y)); });
      r.gates = lit.length; r.credit = lit.filter(k => /^n:/.test(k)).length; p.gateCredit = (p.gateCredit || 0) + r.credit; p.gates = {};   // 只有第三版的傳送點網（n:）點亮時給過膽氣；第一、二版的地界外島樹（z:、i:）是立起來的、沒給過
      p.masses = {}; p.massOrder = []; p.massNames = {};
      if (p.fight) { r.fight = p.fight.id; p.fight = null; }
      for (const k of ['bed', 'home', 'bossOut']) if (p[k] && !home(p[k].x, p[k].y)) p[k] = null;
      return r;
    }
    afterMove(r) {       // 搬到新紙以後（v0.9.5）：人回出生點、那一包擱好、說一聲
      const p = this.player, w = this.world;
      if (r.gen0 < 3) {   // v0.9.6 自查：第一、二版沒有原點那棵建木，第四版的會長在本島上；四周三格內動過的地（蓋過、砍過、鋪過）就不長，照原本的地，免得長在屋裡、堵住門
        const h = G.gateNet(this.seed).list.find(o => o.home);
        if (h && !w.diff.has(U.key(h.x, h.y))) { let touched = false; for (let dy = -3; dy <= 3 && !touched; dy++) for (let dx = -3; dx <= 3; dx++) if (w.diff.has(U.key(h.x + dx, h.y + dy))) { touched = true; break; } if (touched) w.set(h.x, h.y, G.natTile(h.x, h.y, this.seed)); }
      }
      if (r.toSpawn) { p.x = p.rx = this.spawn.x; p.y = p.ry = this.spawn.y; this.gatherCompanions(); }   // 馴過的鷹跟著回來（v0.9.6 自查：不然牠們從舊紙的遠處一格一格飛回來）
      renameItems(r.sack);
      const at = r.sack.length ? this.dropSack(r.sack, false, this.spawn) : null;   // 床邊，沒床就出生點附近（不擱在海上的孤嶼）
      this.buildBag();
      this.toast('紙縮小了', '整張紙從 2500×2500 縮成 1600×1600，四方的地界照比例挪近了；本島一格沒動，本島以外的地重新長過。'
        + (at ? '你在外面蓋的東西、櫃裡與地上的囊收成一包，擱在' + at.where + '（' + at.x + ', ' + at.y + '）。' : '')
        + (r.ships ? r.ships + ' 艘停在外面的船收進了船艙' + (p.hold.length >= HOLD_MAX ? '（放不下的也在那一包裡）' : '') + '。' : '')
        + (r.gates ? '點亮過的 ' + r.gates + ' 處傳送點要重新走過去點亮' + (r.credit ? '，其中給過膽氣的 ' + r.credit + ' 處，往後先點亮的 ' + r.credit + ' 處不再給。' : '。') : '')
        + (r.fight ? '跟' + r.fight + '的戰事作罷，不算輸。' : '') + (r.toSpawn ? '你回到了出生的地方。' : '') + '走過的地圖只留本島。', 20000);
    }
    load(s) {
      const p = this.player; this.nameQueue = []; this.naming = null; $('namebox').classList.add('hidden');   // v0.8.28 取名框不跨檔
      if (this.purseAt) this.closePurse();   // v0.8.29 荷包的介面也不跨檔
      this.world.restore(s.world || {}, s.brief && s.brief.day);
      this.ents.restore(s.ents);
      const sp = s.player || {};
      for (const k of ['x', 'y', 'fx', 'fy', 'hp', 'food', 'warm', 'sta', 'staMax', 'san', 'cour', 'bag', 'hold', 'nestHints', 'sel', 'home', 'readSteles', 'places', 'isles', 'isleNews', 'zones', 'zoneNews', 'creatures', 'raftTaken', 'dragon', 'azure', 'bai', 'zhu', 'deathKeep', 'fight', 'bosses', 'feats', 'inBoss', 'bossOut', 'bossDeclined', 'bossBuff', 'roundPenal', 'bound', 'trialTries', 'gates', 'gateCredit', 'masses', 'massOrder', 'massNames', 'gold', 'hardOnly', 'gongLost', 'trophies', 'dead', 'deadText', 'xuan', 'jing', 'scrolls', 'xuanjia', 'wish', 'redeemed', 'key2', 'gongStele', 'pavilion', 'puppet', 'jingOld', 'jingFor', 'shade9', 'jingCour', 'testKit', 'scaleTaken', 'bed', 'codex', 'finished', 'deaths', 'burn', 'lastDay', 'poisonT', 'poisonPer', 'poisonBy', 'heatT', 'sailing', 'tools', 'tool', 'decayAt', 'worn', 'hitWin', 'totemOff', 'pouches', 'noGhostUntil', 'sanBoostUntil', 'hpMax', 'pillsMade', 'pillsEaten', 'inFog', 'ship', 'swimming', 'swimT', 'swimShips', 'meal', 'fishLog', 'mealN', 'wuhou', 'visits', 'firsts', 'readRain', 'tut', 'idle']) if (sp[k] !== undefined) p[k] = sp[k];
      if (p.sailing && !p.ship) p.ship = World.newShip('孤帆');     // 舊存檔在船上：給一條滿命的孤帆
      if (Object.values(p.bosses || {}).some(b => b.jing === undefined)) { const n = Math.min(3, Object.keys(p.bosses || {}).length); p.jing = sp.jing || []; for (let i = 0; i < n; i++) if (!p.jing[i]) { p.jing[i] = 'got'; p.jingOld = true; } }   // v0.8.8 以前斃的大魔王：那時還沒有玄武，那一卷不算錯過
      p.trial = null; p.trialLockT = 0;   // 試煉不存檔：讀進來影子散了，回玄武那裡再取
      if (!sp.xuanjia) { p.xuanjia = {}; for (const sc of p.scrolls || []) if (RING[sc.id] && !p.xuanjia[sc.id]) p.xuanjia[sc.id] = sc.day || 1; }   // v0.8.34：存檔裡沒有玄甲（舊存檔）就照取過的經補，一隻一層；看存檔不看身上，免得讀別的檔時留著上一局的
      { const s = Math.min(3, Object.keys(p.bosses || {}).length); if (p.jingFor === undefined) { const sc = (p.scrolls || []).filter(x => x.slot === s).pop(); p.jingFor = s < 3 && (p.jing || [])[s] === 'got' ? (sc ? sc.id : Object.keys(JING).find(id => !(p.bosses || {})[id]) || null) : null; } if (p.jingFor && (p.bosses || {})[p.jingFor]) p.jingFor = null; }   // v0.8.10 以前取的經不認哪一隻：那時只有封豨卷
      { const bs = p.bosses || {}, old = sp.jing || p.jing || [], f = p.fight;   // v0.8.21 加成新規：每一隻記有沒有拿經（照舊珠的順序）；這一場沒拿經的那一層掛在戰事上；不再指定先斃哪一隻
        Object.keys(bs).forEach((id, i) => { if (bs[id].jing === undefined) bs[id].jing = old[i] !== 'miss'; });
        if (sp.roundPenal) p.bossBuff = Math.max(0, (p.bossBuff || 0) - 1);
        if (f && f.penal === undefined) { f.jing = p.jingFor === f.id; f.penal = !f.jing; f.wrong = false; }
        p.roundPenal = undefined; p.bound = undefined; p.jing = undefined; if (!sp.trialTries) p.trialTries = {}; }
      if (!sp.gates) p.gates = {}; this.gatesFill();   // v0.8.21 傳送點：舊存檔到過的地方補立
      if (sp.hardOnly === undefined) p.hardOnly = this.diff.key === 'hard' && !(s.diffFrom && s.diffFrom !== 'hard');   // v0.8.22：舊存檔不知道從前換過沒，現在是困難就算（讀檔前剛換過的看 diffFrom）
      else if (this.diff.key !== 'hard') p.hardOnly = false;
      p.lockT = p.fight ? p.fight.lockT || 0 : 0; p.guardT = p.fight ? p.fight.guardT || 0 : 0; this.ents.list = this.ents.list.filter(e => !this.bossGlyph(e.type));   // 魔王戰接著打：魔王照存著的命與位置回來（bossTick 裡）
      if (p.ship && !p.ship.kind) p.ship = { kind: '孤帆', hp: Math.min(p.ship.hp, G.SHIPS['孤帆'].hp), skulls: p.ship.skull && p.ship.ward > this.world.time ? [[p.ship.skull, p.ship.ward]] : [], repairs: 0 };   // v0.4 的船
      // v0.7 擴島：存檔時在海上（船上或落水）、那裡現在長成了陸地——落水的就算上了岸，船上的挪到最近的海；新陸地上的魚散了
      const W = this.world, wet = (x, y) => { const t = W.get(x, y); return DB[t].kind === 'water' && t !== '舟'; };
      if (p.swimming && !wet(p.x, p.y)) { p.swimming = false; p.swimT = 0; }
      if (!sp.hold) p.hold = []; if (!sp.nestHints) p.nestHints = {}; p.holdSel = -1;   // v0.8.19 前的存檔沒有船艙、沒聽過哪處巢穴（不沿用讀檔前的）
      if (p.sailing) { const s0 = this.shipNow(); if (s0) { const [W, H] = World.shipDims(s0.kind, s0.dir); s0.x0 = Math.min(Math.max(s0.x0, p.x - W + 1), p.x); s0.y0 = Math.min(Math.max(s0.y0, p.y - H + 1), p.y); } }   // v0.8.17 前在船上：照錨點補上船身位置；v0.8.21 船改回一乘二、二乘三：身下的船縮在原本的船身裡、蓋住人那格
      if (!s.shipFix) {   // v0.8.19 修船改了規矩（孤帆最多四次、方舟三次）：舊存檔的船「修過幾次」歸零，照新規矩重算
        const zero = (d) => { if (d) d.repairs = 0; }; zero(p.ship); for (const st of p.hold || []) zero(st.ship); for (const rec of this.world.ships.values()) zero(rec);
        for (const l of [...this.world.chests.values(), ...this.world.bags.values()]) for (const it of l) if (it && it.ship) zero(it.ship);
      }
      if (p.sailing && p.ship && !this.shipCells().every(([x, y]) => wet(x, y))) {
        const s = p.ship, fits = (x, y) => W.shipFits(s.kind, x, y, wet, s.dir), ox = p.x - s.x0, oy = p.y - s.y0;
        let spot = null; for (let r = 1; r <= 60 && !spot; r++) for (let i = -r; i <= r && !spot; i++) for (const [x, y] of [[s.x0 + i, s.y0 - r], [s.x0 + i, s.y0 + r], [s.x0 - r, s.y0 + i], [s.x0 + r, s.y0 + i]]) if (!spot && fits(x, y)) spot = [x, y];
        if (spot) { s.x0 = spot[0]; s.y0 = spot[1]; p.x = p.rx = spot[0] + ox; p.y = p.ry = spot[1] + oy; W.movedShips = (W.movedShips || 0) + 1; }
      }
      if (p.sailing && p.ship && !this.onDeck(p.x, p.y)) { p.x = p.rx = p.ship.x0; p.y = p.ry = p.ship.y0; }   // 人不在船身裡（不該有）：站回船上
      this.ents.list = this.ents.list.filter(e => !((e.type === '魚' || e.type === '蜃') && DB[W.get(e.x, e.y)].kind !== 'water'));
      if (!sp.isleNews) {         // 舊存檔第一次讀進 v0.7：說一聲島長大了、海上多了許多島
        p.isleNews = true;
        this.toast('島長大了', '這座島往外長了一圈新地（原本的地一格沒動），四面海上也浮出了' + (G.GEN >= 3 ? '大陸與島（大漠、火山、川原、雪原、青野幾種地域）' : ' ' + G.isles(this.seed).length + ' 座外島：漠島、火島、川島、雪島、青島') + '；紙的四方另有龍淵、洞庭、虎嶺、桑林、丹穴、青丘、玄洲與西北的不周山。膽氣八重造船，就能去看看。' + (W.movedShips ? '你的船停的地方長成了陸地，已挪到最近的海上。' : ''), 12000);
      } else if (!sp.zoneNews) {  // 舊存檔第一次讀進 v0.8.4：紙的四方種了地界
        this.toast('紙的四方', '四方有了去處：東邊龍淵、洞庭，西邊虎嶺、桑林，南邊丹穴、青丘，北邊玄洲，西北一座不周山。原本的地一格沒動，只在海上多了幾座島。' + (W.movedShips ? '你的船停的地方長成了陸地，已挪到最近的海上。' : ''), 12000);
      } else if (W.movedShips) this.toast('船挪了位置', '船停的地方長成了陸地，已挪到最近的海上。', 8000);
      if (W.resizedShips || (W.lostShips && W.lostShips.length)) {   // v0.8.18 船改了大小：停著的照新大小重停；附近停不下的收回囊（囊滿擱床邊）
        for (const rec of W.lostShips || []) { const keep = { hp: rec.hp, skulls: rec.skulls || [], repairs: rec.repairs || 0 }; if (this.addItem(rec.kind, 1, { ship: keep })) this.dropSack([{ n: rec.kind, c: 1, ship: keep }]); }
        this.toast('船改了大小', '孤帆是一乘二、方舟是二乘三（v0.8.21 改回來；往東西開就東西長、往南北開就南北長）。停著的船照新的大小重新停好' + (W.lostShips && W.lostShips.length ? '；有 ' + W.lostShips.length + ' 艘附近停不下，收進了船艙（船艙滿了就擱在床邊的小囊）' : '') + '。船放下水、再按 F 就收得回船艙（船身要碰到岸）。', 10000);
      }
      p.zoneNews = true;
      { const gb = (p.bosses || {})['共工'], newKey = !!gb && this.grantKey(gb.day, gb.diff);   // v0.9.11：v0.9–v0.9.10 斃了共工的，讀進來補給下一章的鑰（記那時的難度）
        const W = this.world, hadStele = !!(p.gongStele && W.get(p.gongStele.x, p.gongStele.y) === '碑'), hadPav = !!(p.pavilion && W.get(p.pavilion.x, p.pavilion.y) === '亭');
        const newStele = !!gb && !!this.placePillarStele() && !hadStele;   // v0.9.13：天柱下的碑，舊存檔也立起來
        const ask = !!gb && !p.redeemed && !!this.placePavilion(true) && (newKey || !hadPav);   // v0.9.10：v0.9–v0.9.9 斃了共工的，那時還願還沒寫成。v0.9.14 自查：只在讀那時的存檔（剛補給鑰）或亭剛立起來時提醒一次，不再每回讀檔都說
        if (ask || newKey) this.toast(ask ? '還願' : KEY2.name, (ask ? '共工斃了，紙平了。回你被寫出來的地方，到惜字亭' + (p.wish ? '還願。' : '去——你沒許過願，補許一個，當下就還。') : '') + (newKey ? (ask ? '<br>' : '') + this.keyText() : ''), 10000);
        else if (newStele) this.toast('天柱下', '不周山天柱折斷的裂口旁，立起了一塊碑「天柱下」：那孩子記下了先生的話。', 10000); }   // v0.9.11、v0.9.12 的存檔已經有鑰，補立的碑也說一聲（v0.9.14 自查）
      renameItems(p.bag); renameItems(p.tools);   // v0.8.31：神兵在具欄裡，具欄也要改
      for (const l of this.world.chests.values()) renameItems(l); for (const l of this.world.bags.values()) renameItems(l); for (const l of this.world.shelves.values()) renameItems(l);   // 櫃、地上的囊與荷包、柴架（v0.8.31 這一行被併進上一行的註解、沒跑，v0.9.6 自查補回）
      if (!this.test && !(s.player && s.player.dead) && (s.ents || []).some(e => e.t === '蜃')) {   // v0.9.14：死了還沒按重新開始就關掉、再讀進來，死已經罰過，蜃的五重不疊上去
                     // 沒解決的蜃：讀檔後牠散了，但膽氣減五重
        const before = this.level(); this.dropLevels(SEA_PENALTY);
        this.toast('蜃沒了結', '讀檔時海上的蜃散了，可你是逃掉的：膽氣第 ' + before + ' 重減到第 ' + this.level() + ' 重。其餘都在。', 10000);
      }
      // 舊存檔裡已經不存在的東西丟掉，身上的衣甲要對得上格子
      const known = (s) => !!(s && G.item(s.n));
      p.bag = (p.bag || []).filter(known); p.tools = (p.tools || []).filter(known);
      for (const s of p.bag) if (s.store) { s.store = s.store.filter(known); if (!s.store.length) delete s.store; }   // 拆下來的櫃裡的東西也要是還存在的
      if (p.tool >= p.tools.length) p.tool = p.tools.length - 1;
      const worn = {}; for (const k of SLOT_ORDER) { const s = p.worn && p.worn[k]; worn[k] = known(s) && ITEMS[s.n].slot === k ? s : null; } p.worn = worn;
      if (!p.hitWin || typeof p.hitWin.n !== 'number') p.hitWin = { start: -99, n: 0 };
      const dt = this.world.timeShift;   // 舊存檔挪到大清早：身上記的時刻也跟著挪，倒數不變（v0.6.2）
      if (dt && p.fight) for (const k of ['at', 'awayAt']) if (p.fight[k] !== undefined) p.fight[k] = U.r4(p.fight[k] + dt);   // 戰事的時限也跟著挪（v0.8.10）
      if (p.fight && p.fight.away && p.fight.awayAt === undefined) p.fight.awayAt = U.r4(this.world.time);   // v0.8.9 存檔裡掛著的戰事：從讀進來起算在外的時間
      if (p.fight && !p.fight.clock) { p.fight.at = U.r4(this.world.time); p.fight.clock = 1; }   // v0.8.9 存檔的戰事沒有時限：一場的時限也從讀進來起算，不會一讀檔就判負（v0.8.15 自查）
      if (dt) { for (const k of ['noGhostUntil', 'decayAt', 'sanBoostUntil']) if (p[k] > 0) p[k] = U.r4(p[k] + dt); p.hitWin = { start: -99, n: 0 }; if (p.ship && p.ship.skulls) p.ship.skulls = p.ship.skulls.map(([n, e]) => [n, U.r4(e + dt)]); for (const h of p.hold || []) if (h.ship && h.ship.skulls) h.ship.skulls = h.ship.skulls.map(([n, e]) => [n, U.r4(e + dt)]); }   // 身下這艘船頭的首骨也跟著挪（v0.8.8；停著的船在 world.restore 裡挪）
      for (const s of p.bag) if (s.n === '燈帽' && s.fuel === undefined) { s.fuel = HAT_FUEL; s.c = 1; }   // 舊存檔的燈帽補上蠟燭
      // v0.8.3：囊裡的船一艘一欄（孤帆兩格、方舟五格），舊存檔疊著的拆開；散放的油脂裝進麻布包（一包八份，舊存檔照份數送包）
      { const ships = []; p.bag = p.bag.filter(s => { if (this.spanOf(s.n) > 1) { for (let i = 0; i < (s.c || 1); i++) ships.push({ n: s.n, c: 1 }); return false; } return true; });
        const loose = p.bag.filter(s => s.n === '油脂').reduce((a, s) => a + s.c, 0); p.bag = p.bag.filter(s => s.n !== '油脂');
        const over = []; p.hold = p.hold || []; p.holdSel = -1;
        for (const sh of ships) { if (p.hold.length < HOLD_MAX) p.hold.push(sh); else over.push(sh); }   // v0.8.19：囊裡的船搬進船艙（最多三艘），多的擱床邊小囊
        let oil = loose; while (oil > 0) { const k = Math.min(OIL_PER_BAG, oil); if (this.bagUsed() < this.slots()) p.bag.push({ n: '麻布包', c: 1, oil: k }); else over.push({ n: '麻布包', c: 1, oil: k }); oil -= k; }
        if (over.length) { const at = this.dropSack(over); this.toast('船艙放不下', '船從此放在右下角的船艙，最多帶 ' + HOLD_MAX + ' 艘；多的' + over.map(o => o.n).join('、') + '用小囊包著擱在' + at.where + '。', 10000); }
        if (ships.length) this.toast('船搬進了船艙', '孤帆、方舟不再佔囊，放在右下角的船艙裡（最多 ' + HOLD_MAX + ' 艘）：點一下或按 B 選中，面向開闊的水按 F 放下水。', 9000);
        if (loose) this.toast('油脂裝進了麻布包', '油脂從此要裝在麻布包裡（一包八份）；你原有的 ' + loose + ' 份已經裝好，送你 ' + Math.ceil(loose / OIL_PER_BAG) + ' 個包。', 9000); }
      { const fixBox = (list) => {   // v0.8.8：櫃裡、小囊裡、荷包裡（連櫃裡的櫃）也照 v0.8.3 的規矩：船一艘一欄、散放的油脂裝進麻布包
          if (!list) return; const out = []; let oil = 0;
          for (const it of list) { if (!it) continue; if (it.n === '油脂') { oil += it.c || 0; continue; } if (it.store) fixBox(it.store); if (this.spanOf(it.n) > 1 && (it.c || 1) > 1) { for (let i = 0; i < it.c; i++) out.push({ n: it.n, c: 1 }); continue; } out.push(it); }
          while (oil > 0) { const k = Math.min(OIL_PER_BAG, oil); out.push({ n: '麻布包', c: 1, oil: k }); oil -= k; }
          list.splice(0, list.length, ...out);
        };
        for (const l of this.world.chests.values()) fixBox(l); for (const l of this.world.bags.values()) fixBox(l); for (const it of p.bag) if (it.store) fixBox(it.store); }
      const fr = p.bag.filter(s => s.n === '果');   // 舊存檔按日分堆的果合成一疊，每顆的日數記進 ds
      if (fr.length) { const ds = []; for (const s of fr) ds.push(...this.fruitDays(s)); p.bag = p.bag.filter(s => s.n !== '果'); this.addItem('果', ds.length, { ds }); }
      // v0.8 使用者定：龍不在洞裡了。舊存檔裡跟著的龍（沒求教過青龍的）回東海去，換一片青鱗；囊滿了就用小囊包著擱在最近睡過的床邊
      if (!p.azure && (p.dragon || this.ents.list.some(e => e.type === '龍'))) {
        this.ents.list = this.ents.list.filter(e => e.type !== '龍'); p.dragon = false; p.scaleTaken = true;
        const at = this.stashItem('青鱗', 1);
        this.toast('龍回東海去了', '洞裡的龍不再跟著你。牠回東海去了，留下一片青鱗' + (at ? '：囊滿了，用小囊包著擱在' + at.where + '。' : '，在囊裡。') + '本島往東約三百八十格的深海上，青龍盤著；除蜃得蜃殘體，九塊加海水瓶三、淡水瓶一在鼎裡熬成蜃珠，帶著去求教，魂環的龍魂上就多一顆十字星。', 14000);
      } else if (p.azure && (p.dragon || this.ents.list.some(e => e.type === '龍'))) {   // v0.8.2：小龍不再是跟著走的生靈，化進魂環
        this.ents.list = this.ents.list.filter(e => e.type !== '龍'); p.dragon = false;
        this.toast('小龍入了魂環', '跟著你的小龍化進了右上角的魂環（青龍那三分之一）。牠不再照路、驅魄，青龍教的水性與船回命照舊。', 10000);
      }
      p.rx = p.x; p.ry = p.y; p.moveT = 0;
      Object.assign(this.stats, s.stats || {});
      if (G.GEN >= 3) this.nameResume();   // v0.8.28：挑名字挑到一半就關掉的，讀進來再問（v0.8.27 的陸塊紀錄漏了存檔，那時登過的陸地要再登一次）
    }
    brief() { const p = this.player; return { day: this.day(), night: this.nightNo(), isNight: this.isNight(), level: this.level(), deaths: p.deaths, nights: this.stats.nights, redeemed: p.redeemed ? 1 : undefined, key2: p.key2 ? 1 : undefined }; }   // 起始頁的存檔格要顯示的摘要
    static carryReal(slot) { try { const raw = localStorage.getItem(CARRY_KEY) || ''; return /:n$/.test(raw) && parseInt(raw.slice(raw.indexOf('@') + 1), 10) === slot; } catch (e) { return false; } }   // 渡海帶走的膽氣寫成「值@格:n」：那一局是正式的（v0.9.14）
    static slotKey(n) { return n > 1 ? SAVE_KEY + '.' + n : SAVE_KEY; }
    static readSave(n) { try { const s = JSON.parse(localStorage.getItem(Game.slotKey(n || 1))); return s && s.v === 5 ? s : null; } catch (e) { return null; } }
    static clearSave(n) { try { localStorage.removeItem(Game.slotKey(n || 1)); } catch (e) { /* ignore */ } }
    static levelOf(cour) { let l = 0; while (l + 1 < CUM.length && cour >= CUM[l + 1]) l++; return l; }
    // 一格存檔的摘要：島號、難度、第幾日（v0.6.10 起卡片不寫第幾夜；night 仍算著）、膽氣第幾重、死過幾次、存檔時刻（v0.4.13 起卡片不再寫睡過幾夜；nights 仍算著給見聞錄）。舊存檔沒有 brief，就從世界時間與膽氣算
    // 改版前的存檔先抄一份備份（v0.9.20 使用者定：之前就有存檔的，一律抄到最後一個空格、告訴玩家一聲；沒空格就只提醒）。
    // 只在這個瀏覽器第一次打開這一版時做一回：沒寫 ver 的（v0.9.20 以前存的）才抄；測試格的、本來就是備份的不抄。原格不動，照常讀、照常搬家
    static backupOld() {   // 做過了回 null；不然回 { done: [[原格, 備份格]], none: [沒空格的原格], fail: [存不進去的原格] }
      try { if (localStorage.getItem(BACKUP_KEY)) return null; } catch (e) { return null; }
      const r = { done: [], none: [], fail: [] }, taken = new Set();
      for (let n = 1; n <= SAVE_SLOTS; n++) { let v = null; try { v = localStorage.getItem(Game.slotKey(n)); } catch (e) { v = null; } if (v) taken.add(n); }
      for (let n = 1; n <= SAVE_SLOTS; n++) {
        const s = Game.readSave(n); if (!s || s.ver || s.test || s.backup) continue;
        let to = 0; for (let k = SAVE_SLOTS; k >= 1; k--) if (!taken.has(k)) { to = k; break; }
        if (!to) { r.none.push(n); continue; }
        try { s.backup = { from: n, at: Date.now() }; localStorage.setItem(Game.slotKey(to), JSON.stringify(s)); taken.add(to); r.done.push([n, to]); }
        catch (e) { try { localStorage.removeItem(Game.slotKey(to)); } catch (e2) { /* ignore */ } r.fail.push(n); }
      }
      try { localStorage.setItem(BACKUP_KEY, GAME_VER); } catch (e) { /* ignore */ }
      return r;
    }
    static backupText(r) {   // 起始頁說一聲
      if (!r || !(r.done.length || r.none.length || r.fail.length)) return '';
      const nm = (n) => '第' + SLOT_NAMES[n] + '格', t = [];
      if (r.done.length) t.push('這一版改了不少，舊存檔讀進來會照新版搬家（紙縮小了等）。保險起見，先把原樣各抄了一份備份：' + r.done.map(([a, b]) => nm(a) + ' → ' + nm(b)).join('、') + '。原來那格照常玩；萬一搬壞了，備份還在。備份那格按「繼續」也會照新版搬家，要一直留著原樣，就按它的「匯出」存成檔案。');
      if (r.none.length) t.push((r.none.length >= SAVE_SLOTS ? '八格都滿了，舊存檔沒有空格可以抄備份' : '沒有空格了，' + r.none.map(nm).join('、') + '沒能抄備份') + '：要備份就先刪一格用不到的，或按那一格的「匯出」存成檔案。');
      if (r.fail.length) t.push(r.fail.map(nm).join('、') + '的備份存不進去（這個瀏覽器的空間不夠）：可以按那一格的「匯出」存成檔案。');
      return t.join('');
    }
    static summary(s) {
      const t = (s.world && s.world.time) || 0, b = s.brief || {}, p = s.player || {}, dl = (s.world && s.world.dayLen) || 300, frac = (t % dl) / dl;
      const day = b.day || Math.floor(t / dl) + 1, dd = Math.floor(t / dl), night = b.night !== undefined ? b.night : (frac >= CAL.dusk(dd) ? day : day - 1), isNight = b.isNight !== undefined ? b.isNight : (frac >= CAL.dusk(dd) || frac < CAL.dawn(dd));
      const level = s.test ? '∞' : b.level !== undefined ? b.level : Game.levelOf(p.cour || 0), when = s.savedAt ? new Date(s.savedAt) : null, pad = (n) => (n < 10 ? '0' : '') + n;
      return { seed: s.seed, diff: (DIFF[s.diff] || DIFF.normal).name, day, night, isNight, level, redeemed: !!(b.redeemed || p.redeemed), key2: !!(b.key2 || p.key2), deaths: b.deaths !== undefined ? b.deaths : (p.deaths || 0), nights: b.nights !== undefined ? b.nights : ((s.stats || {}).nights || 0), savedAt: s.savedAt || 0,
        dayText: '第 ' + day + ' 日',   // v0.6.10 使用者定：存檔格只寫第幾日，不寫第幾夜
        whenText: when ? pad(when.getMonth() + 1) + '/' + pad(when.getDate()) + ' ' + pad(when.getHours()) + ':' + pad(when.getMinutes()) : '' };
    }
  }

  // ---------- 匯出／匯入存檔（v0.9.3 使用者定）----------
  // 測試的人把存檔匯出成檔案傳回來，開發的人讀進來就照原樣重現問題。檔案是 JSON：{ kind, game, server, slot, exportedAt, save }，save 就是 localStorage 裡那一格的內容。
  // 存成檔案：在 claude.ai 的 Artifact 裡用 downloads 能力（會先問玩家要不要存）；桌面版與一般瀏覽器用下載連結；都不行就給一段文字讓玩家自己複製。
  // 讀進來：選檔案或貼上文字，寫進起始頁選著的那一格；那格有存檔要按兩次。測試格的存檔只讀得進測試格（照「測試格不抄到正式格」）
  const XFER_KIND = 'xieyi-save';
  // 生存之道的檢索與目錄（v0.9.8 使用者要的）：目錄照三大段與每一條開頭的粗體字列出，點了捲過去、閃一下；
  //   檢索框打字就只留下含那些字的條目（空白隔開的幾個詞都要有），簡繁都找得到；找到的字用 CSS 的標示（::highlight）畫底色，不動文字節點（免得跟簡繁轉換打架）
  const Help = {
    items: [], secs: [],
    norm(t) { t = String(t || '').toLowerCase(); return window.I18N && I18N.toHans ? I18N.toHans(t) : t; },   // 比對時都轉成簡體：簡繁怎麼打都找得到
    init() {
      const box = $('help'), cols = box.querySelector('.cols'), toc = $('help-toc'); if (!cols || !toc) return;
      let n = 0; this.items = []; this.secs = [];
      for (const h of cols.querySelectorAll('h3')) {
        const sec = { h, id: 'help-s' + this.secs.length, items: [] }; h.id = sec.id; this.secs.push(sec);
        for (let el = h.nextElementSibling; el && el.tagName !== 'H3'; el = el.nextElementSibling) {
          for (const it of el.tagName === 'UL' ? el.children : [el]) {
            if (it.tagName !== 'P' && it.tagName !== 'LI') continue;
            const b = it.firstElementChild && it.firstElementChild.tagName === 'B' && it.firstChild === it.firstElementChild ? it.firstElementChild : null;
            const rec = { el: it, sec, id: 'help-i' + (n++), title: b ? b.textContent : '' }; it.id = rec.id; sec.items.push(rec); this.items.push(rec);
          }
        }
      }
      toc.innerHTML = '<summary>目錄</summary>' + this.secs.map(sec => '<div class="tocsec"><a href="#' + sec.id + '" data-go="' + sec.id + '" class="toch">' + sec.h.textContent + '</a>'
        + sec.items.filter(r => r.title).map(r => '<a href="#' + r.id + '" data-go="' + r.id + '">' + r.title + '</a>').join('') + '</div>').join('');
      toc.addEventListener('click', (ev) => { const a = ev.target.closest('a[data-go]'); if (!a) return; ev.preventDefault(); this.go(a.dataset.go); });
      const q = $('help-q');
      q.addEventListener('input', () => this.find(q.value));
      q.addEventListener('keydown', (ev) => {   // 打字歸檢索框，不讓遊戲的按鍵（H、M、Enter 開局……）接到
        ev.stopPropagation();
        if (ev.isComposing || ev.keyCode === 229) return;   // 注音、拼音還在選字：Enter 是確定選字、Esc 是取消選字，不是跳過去或清空（v0.9.9 自查）
        if (ev.key === 'Escape') { ev.preventDefault(); if (q.value) { q.value = ''; this.find(''); } else { q.blur(); box.classList.add('hidden'); } }
        else if (ev.key === 'Enter') { ev.preventDefault(); const r = this.items.find(x => !x.el.classList.contains('nohit')); if (r && q.value.trim()) this.go(r.id); }
      });
      window.addEventListener('keydown', (ev) => { if (ev.key === '/' && !box.classList.contains('hidden') && document.activeElement !== q) { ev.preventDefault(); ev.stopImmediatePropagation(); q.focus(); q.select(); } }, true);   // 開著生存之道按 / 跳到檢索框
    },
    go(id) {
      const el = document.getElementById(id); if (!el) return;
      if (el.classList.contains('nohit')) { $('help-q').value = ''; this.find(''); }
      el.scrollIntoView({ block: 'start' });   // scroll-margin-top 留出檢索框的高度
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    },
    find(text) {
      const terms = String(text || '').trim().split(/\s+/).filter(Boolean), keys = terms.map(t => this.norm(t)); let hits = 0;
      for (const r of this.items) { const t = this.norm(r.el.textContent), ok = keys.every(k => t.indexOf(k) >= 0); r.el.classList.toggle('nohit', !ok); if (ok) hits++; }
      for (const sec of this.secs) { const any = sec.items.some(r => !r.el.classList.contains('nohit')); sec.h.classList.toggle('nohit', !any); }
      for (const a of $('help-toc').querySelectorAll('a[data-go]')) { const el = document.getElementById(a.dataset.go); a.classList.toggle('off', !!el && el.classList.contains('nohit')); }
      $('help').classList.toggle('searching', keys.length > 0);
      $('help-count').textContent = keys.length ? (hits ? '找到 ' + hits + ' 條' : '沒找到，換個字試試') : '共 ' + this.items.length + ' 條';
      this.mark(keys);
      return hits;
    },
    mark(keys) {         // 標出找到的字：CSS Custom Highlight（瀏覽器不支援就只篩條目、不畫底色）
      if (!window.CSS || !CSS.highlights || typeof Highlight === 'undefined') return;
      CSS.highlights.delete('help-hit'); if (!keys.length) return;
      const ranges = [];
      for (const r of this.items) {
        if (r.el.classList.contains('nohit')) continue;
        const walker = document.createTreeWalker(r.el, NodeFilter.SHOW_TEXT); let node;
        while ((node = walker.nextNode())) {
          const v = node.nodeValue, low = this.norm(v); if (low.length !== v.length) continue;   // 轉了字數會變的（極少）就不畫
          for (const k of keys) { let i = 0; while ((i = low.indexOf(k, i)) >= 0) { const rg = new Range(); rg.setStart(node, i); rg.setEnd(node, i + k.length); ranges.push(rg); i += k.length; } }
        }
      }
      if (ranges.length) CSS.highlights.set('help-hit', new Highlight(...ranges));
    },
  };

  // ---------- 吐槽（v0.9.19 使用者定：起始頁與遊戲裡各一個小鈕，點開就是吐槽的地方）----------
  // 在 claude.ai 的 Artifact 裡經 comments 能力（只開留言框，不代寫、不讀別人的）把話留在這個 Artifact 上，開發的人看得到；
  // 開不了留言框（桌面版、沒有留言權限）就複製或存成文字檔再傳過去。三個問題照〈DAILY〉八之 15：最花時間、最無聊、最想多一點
  const SAY_TEMPLATE = '一、最花時間做的是什麼：\n\n二、最無聊的是什麼：\n\n三、最想多一點的是什麼：\n\n其他（哪裡卡住、哪裡好玩）：\n';
  const Say = {
    ctx() { const g = window.XIEYI && window.XIEYI.game; return '（' + [SERVER.name, GAME_VER, g && g.player ? '島 #' + g.seed + '、第 ' + g.day() + ' 日、' + g.diff.name : '起始頁'].filter(Boolean).join('・') + '）'; },
    async open(anchorId) {
      Xfer.show('吐槽', '哪裡好玩、哪裡無聊、哪裡卡住，都可以說。照下面三個問題寫幾句就好，不想答的空著。', '寫好了按「留言」，留言框開了以後貼上（Ctrl+V）送出，開發的人就看得到；留言用不了的話，按「複製」或「存成檔案」再傳過去。');
      const a = Xfer.area(SAY_TEMPLATE, false); a.focus(); a.setSelectionRange(SAY_TEMPLATE.indexOf('\n') , SAY_TEMPLATE.indexOf('\n'));
      const text = () => a.value.trim() + '\n' + this.ctx();
      const copy = () => { a.value = text(); Xfer.copy(); };
      const btns = $('xfer-btns'), say = Xfer.btn('留言', async (b) => {
        if (!this.cm) return; copy();
        try { const r = await this.cm.openComposer({ element: $(anchorId) || $('btn-say') }); Xfer.note(r && r.opened ? '留言框開了：在裡面貼上（Ctrl+V）再送出。' : '留言框沒打開（也許已經有一個開著）；文字已經複製了。'); }
        catch (e) { this.cm = null; b.remove(); Xfer.note('這裡留不了言；文字已經複製了，貼給開發的人，或按「存成檔案」。'); }
      });
      say.classList.add('hidden');
      Xfer.btn('複製', () => copy(), true);
      Xfer.btn('存成檔案', async () => { const d = new Date(), name = '山海有形-吐槽-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.txt';
        const r = await Xfer.saveFile(name, text(), 'text/plain'); Xfer.note(r === 'saved' || r === 'link' ? '存好了：' + name + '，傳給開發的人就行。' : r === 'declined' ? '沒存。' : '這裡存不了檔案，按「複製」貼給開發的人。'); }, true);
      Xfer.btn('關上', () => Xfer.close(), true);
      if (this.cm === undefined) { const c = window.claude; this.cm = null; if (c && typeof c.use === 'function') { try { this.cm = await c.use('comments'); } catch (e) { this.cm = null; } } }
      if (this.cm && btns.contains(say)) say.classList.remove('hidden');
    }
  };

  const Xfer = {
    pack(n) {
      let s = null; try { s = JSON.parse(localStorage.getItem(Game.slotKey(n))); } catch (e) { s = null; }
      if (!s || s.v !== 5) return null;
      const m = Game.summary(s);
      return { s, m, name: '山海有形-第' + SLOT_NAMES[n] + '格-島' + m.seed + '-第' + m.day + '日' + (s.test ? '-測試' : '') + '.json',
        text: JSON.stringify({ kind: XFER_KIND, game: '山海有形', server: SERVER.name || '', slot: n, exportedAt: new Date().toISOString(), save: s }) };
    },
    parse(text) {   // 匯出的檔案、或 localStorage 裡那一格的原文，都認
      let o = null; try { o = JSON.parse(String(text || '').trim()); } catch (e) { return { why: '看不懂這段文字，不是存檔。' }; }
      const s = o && o.kind === XFER_KIND ? o.save : o;
      if (!s || typeof s !== 'object' || s.v !== 5 || s.seed === undefined || !s.world || !s.player) return { why: '這不是《山海有形》的存檔。' };
      return { save: s };
    },
    refuse(s, n) {   // 讀不讀得進第 n 格；讀得進回空字串
      if (s.test && TEST_SLOTS.indexOf(n) < 0) return TEST_SLOTS.length ? '這是測試格的存檔，只讀得進測試格（第' + TEST_SLOTS.map(k => SLOT_NAMES[k]).join('、') + '格）。' : '這是測試格的存檔，這一服沒有測試格。';
      return '';
    },
    async saveFile(name, text, type) {   // 'saved'／'link'（下載連結，看不到結果）／'declined'／'busy'／'none'（這裡存不了檔案）
      const blob = new Blob([text], { type: type || 'application/json' }), c = window.claude;
      if (c && typeof c.use === 'function') {   // claude.ai 的 Artifact：框裡不能自己下載，要經 downloads 能力
        let dl = null; try { dl = await c.use('downloads'); } catch (e) { dl = null; }
        if (!dl) return 'none';
        try { await dl.save({ filename: name, data: blob }); return 'saved'; }
        catch (e) { const code = e && e.code; return code === 'declined' ? 'declined' : code === 'rate_limited' ? 'busy' : 'none'; }
      }
      try { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); return 'link'; }
      catch (e) { return 'none'; }
    },
    isOpen() { return !$('xfer').classList.contains('hidden'); },
    show(title, text, help) {
      $('xfer-title').textContent = title; $('xfer-text').textContent = text; $('xfer-help').textContent = help || ''; $('xfer-note').textContent = '';
      $('xfer-btns').innerHTML = ''; const a = $('xfer-area'); a.value = ''; a.classList.add('hidden'); a.readOnly = false; a.placeholder = '';
      $('xfer').classList.remove('hidden');
      if (!this.keyed) { this.keyed = true; window.addEventListener('keydown', (ev) => { if (this.isOpen() && ev.code === 'Escape') { ev.preventDefault(); ev.stopPropagation(); this.close(); } }, true); }
    },
    close() { $('xfer').classList.add('hidden'); clearTimeout(this.armT); },
    note(t) { $('xfer-note').textContent = t; },
    btn(label, fn, ghost) { const b = document.createElement('button'); b.textContent = label; if (ghost) b.className = 'ghost'; b.addEventListener('click', () => fn(b)); $('xfer-btns').appendChild(b); return b; },
    area(text, readOnly, placeholder) { const a = $('xfer-area'); a.classList.remove('hidden'); a.value = text; a.readOnly = !!readOnly; a.placeholder = placeholder || ''; return a; },
    copy() {
      const a = $('xfer-area'); a.focus(); a.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      if (ok) { this.note('已經複製了，貼到記事本存起來，或直接貼給開發的人。'); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(a.value).then(() => this.note('已經複製了，貼到記事本存起來，或直接貼給開發的人。'), () => this.note('自動複製不了：文字已經全選，按 Ctrl+C（Mac 是 ⌘C）複製。'));
      else this.note('自動複製不了：文字已經全選，按 Ctrl+C（Mac 是 ⌘C）複製。');
    },
    openExport(n) {
      const pk = this.pack(n); if (!pk) return false;
      this.show('匯出存檔 · 第' + SLOT_NAMES[n] + '格', '島 #' + pk.m.seed + ' · ' + pk.m.diff + ' · ' + pk.m.dayText + ' · 膽氣第 ' + pk.m.level + ' 重' + (pk.s.test ? ' · 測試格' : '') + '（約 ' + Math.max(1, Math.round(pk.text.length / 1000)) + ' 千字）',
        '檔案裡只有這一格的遊戲進度。遇到問題時把它傳給開發的人，順便說一下在哪裡、做了什麼，就能照你的存檔重現。');
      this.btn('存成檔案', async (b) => {
        b.disabled = true; this.note('準備檔案……'); const r = await this.saveFile(pk.name, pk.text); b.disabled = false;
        if (r === 'saved') this.note('存好了：' + pk.name);
        else if (r === 'link') this.note('下載了：' + pk.name + '。找不到檔案的話，改按「複製文字」。');
        else if (r === 'declined') this.note('沒有存。要存的話再按一次「存成檔案」。');
        else if (r === 'busy') this.note('前一個存檔的視窗還開著，等一下再按。');
        else { this.area(pk.text, true); this.note('這裡不能直接存成檔案，改用下面這段文字：按「複製文字」，貼到記事本存起來，或直接貼給開發的人。'); }
      });
      this.btn('複製文字', () => { this.area(pk.text, true); this.copy(); }, true);
      this.btn('關閉', () => this.close(), true);
      return true;
    },
    openImport(n, has, done) {
      this.show('匯入存檔 · 讀進第' + SLOT_NAMES[n] + '格', has ? '第' + SLOT_NAMES[n] + '格現在有存檔，讀進來會蓋掉它。' : '第' + SLOT_NAMES[n] + '格是空的。',
        '選一個匯出的存檔檔案，或把存檔的文字貼在上面。要讀進別格，先關掉，在起始頁點那一格，再按「匯入存檔」。');
      this.area('', false, '把存檔的文字貼在這裡');
      const file = $('xfer-file'); file.value = '';
      file.onchange = () => {
        const f = file.files && file.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = () => { $('xfer-area').value = String(rd.result || ''); this.note('讀到檔案「' + f.name + '」，按「讀進第' + SLOT_NAMES[n] + '格」。'); };
        rd.onerror = () => this.note('這個檔案讀不出來。');
        rd.readAsText(f);
      };
      this.btn('選檔案', () => file.click(), true);
      const go = this.btn('讀進第' + SLOT_NAMES[n] + '格', (b) => {
        const r = this.parse($('xfer-area').value); if (r.why) { this.note(r.why); return; }
        const bad = this.refuse(r.save, n); if (bad) { this.note(bad); return; }
        if (has && !b.classList.contains('arm')) {
          b.classList.add('arm'); b.textContent = '真的蓋掉第' + SLOT_NAMES[n] + '格？'; this.note('再按一次才蓋掉。');
          clearTimeout(this.armT); this.armT = setTimeout(() => { b.classList.remove('arm'); b.textContent = '讀進第' + SLOT_NAMES[n] + '格'; }, 3000); return;
        }
        try { localStorage.setItem(Game.slotKey(n), JSON.stringify(r.save)); }
        catch (e) { this.note('瀏覽器的空間不夠，讀不進來。可以先刪掉用不到的存檔再試。'); return; }
        this.close(); done(r.save);
      });
      this.btn('關閉', () => this.close(), true);
      return go;
    },
  };

  // ---------- 啟動畫面 ----------
  function boot() {
    const q = new URLSearchParams(location.search);
    const bk = Game.backupOld();   // v0.9.20：改版前的存檔先抄一份備份
    const saves = [null]; for (let n = 1; n <= SAVE_SLOTS; n++) saves[n] = Game.readSave(n);
    let game = null, diff = DIFF[q.get('diff')] ? q.get('diff') : 'normal', slot = 1, armed = null;
    {   // 預設選哪一格：網址 ?slot=、上次玩的那格、最近存的那格、第一格
      const qs = parseInt(q.get('slot'), 10); let last = 0, newest = 0; try { last = parseInt(localStorage.getItem(SLOT_KEY), 10); } catch (e) { /* ignore */ }
      for (let n = 1; n <= SAVE_SLOTS; n++) if (saves[n] && (!newest || (saves[n].savedAt || 0) > (saves[newest].savedAt || 0))) newest = n;
      slot = qs >= 1 && qs <= SAVE_SLOTS ? qs : last >= 1 && last <= SAVE_SLOTS ? last : newest || 1;
    }
    const DESC = { easy: '一日四百二十息；餓得慢兩成；第二十一夜起有魄；受傷九成、攻擊加一成。', normal: '一日三百六十息；第十三夜起有魄。', hard: '一日三百息；第九夜起有魄，最多十隻、蝕心更狠；受傷加一成、攻擊九成，夜裡狼虎豹蛇一倍半。' };   // 「服了？服了！」的暗示 v0.8.23 起另成一行 #diff-hint，選哪個難度都看得到
    const pickDiff = (k) => { diff = k; document.querySelectorAll('.diffrow button').forEach(b => b.classList.toggle('on', b.dataset.diff === k)); $('diff-desc').textContent = DESC[k]; $('diff-hint').classList.toggle('hard', k === 'hard'); };   // v0.8.23：選困難時那句暗示亮一點
    document.querySelectorAll('.diffrow button').forEach(b => b.addEventListener('click', () => pickDiff(b.dataset.diff)));
    pickDiff(diff);
    const start = (seed, useSave) => {
      if (game) return;
      if (useSave && stray(saves[slot], slot)) { $('new-hint').textContent = '第' + SLOT_NAMES[slot] + '格是測試的局，這一服不能接著玩；可以匯出或刪掉。'; return; }
      SFX.init();
      game = new Game(seed, useSave ? saves[slot] : null, diff, slot);
      try { localStorage.setItem(SLOT_KEY, String(slot)); } catch (e) { /* ignore */ }
      window.XIEYI = { game, Game, Xfer, Help, Say, get DAY() { return DAY; }, DIFF };
      $('start').classList.add('hidden');
      game.paused = false; if (game.player.dead) game.showDead();
      if (!useSave) {   // 開場的兩句只在新開的局說（v0.9.9 自查：從前讀檔接著玩也說，第十五日還在講第幾夜起有魄）
        game.toast('山海有形', '取木、取棉、取石子；砌磚、造床、磨劍。第 ' + game.diff.ghost + ' 夜起有魄，備好火把。按 H 看生存之道。', 7000);
        setTimeout(() => { if (game) game.toast('聽說島上有一座塔', '從塔上能看見整座本島。黃昏時跟著鳥走。', 8000); }, 5000);
      }
      window.addEventListener('beforeunload', () => game.save());
      document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
    };
    // 八格存檔（v0.8）：每格寫島號、難度、第幾日、膽氣第幾重、死過幾次、存檔時刻。點格子選它；「繼續」讀那格；「落筆」寫進選著的格，格裡有存檔要再按一次才覆蓋；「刪」也要按兩次
    const disarm = () => { if (!armed) return; armed.el.textContent = armed.text; armed.el.classList.remove('arm'); clearTimeout(armed.t); armed = null; };
    const arm = (el, text) => { disarm(); armed = { el, text: el.textContent, t: setTimeout(disarm, 3000) }; el.textContent = text; el.classList.add('arm'); };
    const pick = (n) => { slot = n; disarm(); document.querySelectorAll('.save-card').forEach(c => c.classList.toggle('on', +c.dataset.slot === n)); $('new-hint').textContent = stray(saves[n], n) ? '第' + SLOT_NAMES[n] + '格是測試的局，這一服不能接著玩；落筆會覆蓋它。' : saves[n] ? '第' + SLOT_NAMES[n] + '格有存檔，落筆會覆蓋它。' : '落筆寫在第' + SLOT_NAMES[n] + '格。'; };
    // 測試的局落在不是測試格的格子裡（v0.9.20 上線：正式服拿掉了測試格，第八格舊的測試存檔還在）——讀進來會變成正式的局，囊裡無數個、膽氣九十九重都帶過去，所以不給接著玩，只能匯出或刪
    const stray = (s, n) => !!(s && s.test && TEST_SLOTS.indexOf(n) < 0);
    const renderSaves = () => {
      const box = $('saves'); box.innerHTML = '';
      for (let n = 1; n <= SAVE_SLOTS; n++) {
        const s = saves[n], card = document.createElement('div');
        const tst = TEST_SLOTS.indexOf(n) >= 0 && (!s || !!s.test), lost = stray(s, n); card.className = 'save-card' + (s ? '' : ' empty') + (tst || lost ? ' test' : '') + (lost ? ' stray' : ''); card.dataset.slot = n;
        if (s) {
          const m = Game.summary(s);
          card.innerHTML = '<div class="save-no">' + SLOT_NAMES[n] + '</div><div class="save-body">' + (tst ? '<span class="testmark">測試</span>' : '') + (lost ? '<span class="testmark" title="這一服沒有測試格了：測試的局不能在正式格裡接著玩，可以匯出或刪掉">測試 · 不能接著玩</span>' : '') + (s.backup ? '<span class="bakmark" title="改版前的原樣，從第' + SLOT_NAMES[s.backup.from] + '格抄來的">備份 · 原第' + SLOT_NAMES[s.backup.from] + '格</span>' : '') + '<b>島 #' + m.seed + '</b> · ' + m.diff + '<br>' + m.dayText + ' · 膽氣第 ' + m.level + ' 重' + (m.redeemed ? ' · 已還願' : m.key2 ? ' · 得' + KEY2.name : '') + '<br><span class="dim small">' + (m.deaths ? '死過 ' + m.deaths + ' 次 · ' : '') + (m.whenText ? '存於 ' + m.whenText : '') + '</span></div><div class="save-btns"><button class="save-go">繼續</button><button class="save-out ghost">匯出</button><button class="save-del ghost">刪</button></div>';
          if (lost) { const b = card.querySelector('.save-go'); b.disabled = true; b.title = '測試的局不能在正式格裡接著玩'; }
          card.querySelector('.save-go').addEventListener('click', (ev) => { ev.stopPropagation(); pick(n); if (!lost) start(s.seed, true); });
          card.querySelector('.save-out').addEventListener('click', (ev) => { ev.stopPropagation(); disarm(); pick(n); Xfer.openExport(n); });   // v0.9.3
          card.querySelector('.save-del').addEventListener('click', (ev) => { ev.stopPropagation(); const b = ev.currentTarget; if (armed && armed.el === b) { disarm(); Game.clearSave(n); saves[n] = null; renderSaves(); pick(n); } else arm(b, '真的刪？'); });
        } else card.innerHTML = '<div class="save-no">' + SLOT_NAMES[n] + '</div><div class="save-body">' + (tst ? '<span class="testmark">測試</span><b>測試格</b><br>不會死、膽氣無窮，採到的東西無數個。' : '<b>空格</b><br>選這一格，落筆開新島。') + '</div>';
        card.addEventListener('click', () => pick(n));
        box.appendChild(card);
      }
      pick(slot);
    };
    renderSaves();
    { const t = Game.backupText(bk), el = $('backup-note'); if (t && el) { el.querySelector('span').textContent = t; el.classList.remove('hidden'); el.querySelector('button').addEventListener('click', () => el.classList.add('hidden')); } }   // v0.9.20
    const seedInput = $('seed');
    seedInput.value = q.get('seed') || String(Math.floor(Math.random() * 1e6));
    const newGame = () => { Game.clearSave(slot); saves[slot] = null; let s = parseInt(seedInput.value, 10); if (isNaN(s)) s = Array.from(seedInput.value).reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7); start(s, false); };
    $('btn-new').addEventListener('click', () => { if (game) return; const b = $('btn-new'); if (saves[slot] && !(armed && armed.el === b)) { arm(b, '覆蓋第' + SLOT_NAMES[slot] + '格？'); return; } disarm(); newGame(); });
    window.addEventListener('keydown', (ev) => { if (game || ev.code !== 'Enter' || Xfer.isOpen()) return; ev.preventDefault(); if (saves[slot]) start(saves[slot].seed, true); else $('btn-new').click(); });   // 回車：選著的格有存檔就繼續，空的就落筆
    $('btn-help').addEventListener('click', () => $('help').classList.toggle('hidden'));
    $('btn-say').addEventListener('click', () => { if (game) return; Say.open('btn-say'); });   // 吐槽（v0.9.19）
    $('btn-import').addEventListener('click', () => { if (game) return; disarm(); const n = slot; Xfer.openImport(n, !!saves[n], (s) => { saves[n] = s; renderSaves(); pick(n); $('new-hint').textContent = '讀進第' + SLOT_NAMES[n] + '格了，按那一格的「繼續」接著玩。'; }); });   // v0.9.3
    $('help-close').addEventListener('click', () => $('help').classList.add('hidden'));
    let rs = 0; try { rs = parseInt(localStorage.getItem(RESUME_KEY), 10); localStorage.removeItem(RESUME_KEY); } catch (e) { /* ignore */ }
    if (rs >= 1 && rs <= SAVE_SLOTS && saves[rs]) {   // 遊戲裡換了難度：直接接著玩那一格（v0.8.2；比網址上的 autostart 優先，重新載入時網址還在）
      const from = saves[rs].diffFrom; pick(rs); start(saves[rs].seed, true);
      if (game && from && DIFF[from]) game.toast('難度換成了' + game.diff.name, '從' + DIFF[from].name + '換過來：第幾日、幾時都照舊；一日 ' + game.diff.day + ' 息。', 8000);
    } else if (q.get('autostart')) { Game.clearSave(slot); saves[slot] = null; start(parseInt(q.get('seed') || '42', 10), false); }
  }
  Help.init(); Help.find('');   // 生存之道的目錄與檢索（v0.9.8）。v0.9.9 自查：在這裡（載入 game.js 時）建，趕在 i18n.js 把頁面轉成簡體之前——在 boot() 裡建會讀到轉過的字，切回繁體時一半目錄還是簡體
  window.addEventListener('DOMContentLoaded', boot);
})();
