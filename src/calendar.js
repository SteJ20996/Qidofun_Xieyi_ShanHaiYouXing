// 曆法（v0.9.16 使用者定：一年 360 日、六年一閏，閏照古法；新局從立春起；天氣跟著季節走，倒春寒小機會下雪）
// —— 節氣：照定氣（冬短夏長，二十四段照 2001–2100 年的平均長度，縮成整 365 日一輪），從立春起算；每段分三候。
// —— 年與月：十二個月、每月三十日，一年 360 日；六年 = 2190 日 = 73 個月，正好六年一閏。閏照「無中置閏」，而且照定氣的中氣排，
//    跟畫面上的節氣一致（閏月裡不會出現中氣）。定氣冬天的中氣靠得近，一個六年裡會有兩個月碰不到中氣、一個月碰到兩個——清初改用定氣以後的老問題；
//    照現行農曆的辦法解：冬至所在的月一定是十一月（冬月），兩個冬至月之間有十三個月時，第一個碰不到中氣的月才是閏月。
//    這樣排出來，閏月落在第三年的閏六月（每六年第 31 個月，第 901–930 日），跟真的農曆一樣多閏在夏天。
// —— 這裡只算日子，不存檔：一切照 world.time 換成第幾日（0 起）來算，舊存檔照總日數換算。
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;
  // 二十四節氣：名字、平均長度（日，定氣，2001–2100 年的平均）、三候（通行本）
  const TERMS = [
    ['立春', 14.825, '東風解凍', '蟄蟲始振', '魚陟負冰'], ['雨水', 14.917, '獺祭魚', '候雁北', '草木萌動'],
    ['驚蟄', 15.030, '桃始華', '倉庚鳴', '鷹化為鳩'], ['春分', 15.157, '玄鳥至', '雷乃發聲', '始電'],
    ['清明', 15.289, '桐始華', '田鼠化為鴽', '虹始見'], ['穀雨', 15.418, '萍始生', '鳴鳩拂其羽', '戴勝降于桑'],
    ['立夏', 15.534, '螻蟈鳴', '蚯蚓出', '王瓜生'], ['小滿', 15.628, '苦菜秀', '靡草死', '麥秋至'],
    ['芒種', 15.695, '螳螂生', '鵙始鳴', '反舌無聲'], ['夏至', 15.728, '鹿角解', '蜩始鳴', '半夏生'],
    ['小暑', 15.725, '溫風至', '蟋蟀居壁', '鷹始摯'], ['大暑', 15.686, '腐草為螢', '土潤溽暑', '大雨時行'],
    ['立秋', 15.615, '涼風至', '白露降', '寒蟬鳴'], ['處暑', 15.516, '鷹乃祭鳥', '天地始肅', '禾乃登'],
    ['白露', 15.398, '鴻雁來', '玄鳥歸', '群鳥養羞'], ['秋分', 15.268, '雷始收聲', '蟄蟲坯戶', '水始涸'],
    ['寒露', 15.136, '鴻雁來賓', '雀入大水為蛤', '菊有黃華'], ['霜降', 15.011, '豺乃祭獸', '草木黃落', '蟄蟲咸俯'],
    ['立冬', 14.901, '水始冰', '地始凍', '雉入大水為蜃'], ['小雪', 14.812, '虹藏不見', '天氣上升地氣下降', '閉塞而成冬'],
    ['大雪', 14.751, '鶡鴠不鳴', '虎始交', '荔挺出'], ['冬至', 14.721, '蚯蚓結', '麋角解', '水泉動'],
    ['小寒', 14.724, '雁北鄉', '鵲始巢', '雉始雊'], ['大寒', 14.759, '雞始乳', '征鳥厲疾', '水澤腹堅']
  ];
  const YEAR = 360, MONTH = 30, SOLAR = 365, CYCLE_M = 73;   // 六年 73 個月
  const total = TERMS.reduce((a, t) => a + t[1], 0), K = SOLAR / total;
  const LEN = TERMS.map(t => t[1] * K), START = [];   // 每段的長度與起點（太陽年裡第幾日，可帶小數）
  { let s = 0; for (const l of LEN) { START.push(s); s += l; } }
  const START_DAY = START.map(s => Math.floor(s));   // 交節那一刻落在哪一天，那天就是這一節的第 1 天（真的曆書也是這樣排）
  const MONTHS = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '臘'];
  // 一個六年裡 73 個月各是幾月、是不是閏、第幾年（0 起）：照上面的規矩在載入時排一次，之後每六年照抄
  const ZQ = []; for (let y = -1; y <= 7; y++) for (let k = 1; k < 24; k += 2) ZQ.push({ t: y * SOLAR + START[k], k });   // 中氣（雨水、春分……大寒，單數的那些）
  const inMonth = (g, z) => z.t >= g * MONTH && z.t < (g + 1) * MONTH;
  const CYCLE = (() => {
    const W = []; for (let g = -14; g <= CYCLE_M + 14; g++) if (ZQ.some(z => z.k === 21 && inMonth(g, z))) W.push(g);   // 冬至所在的月
    const nm = {};
    for (let i = 0; i + 1 < W.length; i++) {
      const a = W[i], b = W[i + 1]; let num = 10, leapDone = false; nm[a] = { m: 10, leap: false };   // 冬月（0 起第 10）
      for (let g = a + 1; g < b; g++) {
        if (b - a === 13 && !leapDone && !ZQ.some(z => inMonth(g, z))) { leapDone = true; nm[g] = { m: num, leap: true }; continue; }   // 閏：跟上一個月同名
        num = (num + 1) % 12; nm[g] = { m: num, leap: false };
      }
    }
    const out = []; let y = 0;
    for (let g = 0; g < CYCLE_M; g++) { const e = nm[g]; if (g > 0 && e.m === 0 && !e.leap) y++; out.push({ m: e.m, leap: e.leap, y }); }
    return out;
  })();
  const LEAP_AT = CYCLE.findIndex(e => e.leap);
  const NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const dayName = (n) => n <= 10 ? '初' + NUM[n] : n < 20 ? '十' + NUM[n - 10] : n === 20 ? '二十' : n < 30 ? '廿' + NUM[n - 20] : '三十';
  const yearName = (n) => { if (n <= 10) return NUM[n]; if (n < 20) return '十' + NUM[n - 10]; const t = Math.floor(n / 10), o = n % 10; return t < 10 ? NUM[t] + '十' + NUM[o] : String(n); };
  const mod = (a, m) => ((a % m) + m) % m;

  // 第幾日（0 起）落在哪一節、這一節第幾天、第幾候
  function term(d) {
    const s = mod(d, SOLAR); let k = 23;
    for (let i = 0; i < 24; i++) if (START_DAY[i] <= s && (i === 23 || s < START_DAY[i + 1])) { k = i; break; }
    const mid = s + 0.5 - START[k], hou = Math.max(0, Math.min(2, Math.floor(mid / (LEN[k] / 3))));
    return { k, name: TERMS[k][0], day: s - START_DAY[k] + 1, hou, houName: TERMS[k][2 + hou] };
  }
  // 第幾日（0 起）落在第幾年、幾月、初幾；閏月照無中置閏（六年一閏，第三年閏六月）
  function month(d) {
    const g = Math.floor(d / MONTH), cyc = Math.floor(g / CYCLE_M), e = CYCLE[mod(g, CYCLE_M)];
    const year = 1 + 6 * cyc + e.y, m = e.m, leap = e.leap, dd = mod(d, MONTH) + 1;
    return { year, m, leap, day: dd, name: (leap ? '閏' : '') + MONTHS[m] + '月' + dayName(dd), yearName: '第' + yearName(year) + '年' };
  }
  // 第 g 個月（0 起）碰到幾個中氣（測試用：閏月一定是零個）
  function zhongqi(g) { const c = mod(g, CYCLE_M), off = (g - c) / CYCLE_M * 6 * SOLAR; return ZQ.filter(z => z.t + off >= g * MONTH && z.t + off < (g + 1) * MONTH).length; }

  // 天氣跟著季節走（v0.9.16 使用者定）：一場雨起時成雪、成雷雨的機會，照節氣分
  // 雪：立冬到驚蟄以前；驚蟄、春分、清明是倒春寒，小機會。全年平均約一成四，跟 v0.9.15 不分季節的一成五差不多，只是集中在冬天。
  // 雷雨：春分二候「雷乃發聲」起，到秋分初候「雷始收聲」為止（秋分以後沒有）；夏天最多。
  const SNOW_BY = [0.35, 0.2, 0.06, 0.04, 0.02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.15, 0.35, 0.5, 0.55, 0.6, 0.55];
  const THUNDER_BY = [0, 0, 0, 0.1, 0.15, 0.2, 0.25, 0.3, 0.3, 0.35, 0.35, 0.35, 0.3, 0.2, 0.12, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  function wxOdds(d) {
    const t = term(d), thunderOn = t.k > 3 || (t.k === 3 && t.hou >= 1);   // 春分初候「玄鳥至」還沒打雷
    return { snow: SNOW_BY[t.k], thunder: thunderOn ? THUNDER_BY[t.k] : 0, chill: t.k >= 2 && t.k <= 4 && SNOW_BY[t.k] > 0 };   // chill：倒春寒
  }

  // 觀星用：太陽的黃經（度；立春 315°，每節 15°，照定氣在一節裡平均走）、月相（月與日的距角：初一 0°、十五夜裡滿月 180°）
  function sunLon(t) {   // t：第幾日，帶小數
    const s = mod(t, SOLAR); let k = 23; for (let i = 0; i < 24; i++) if (START[i] <= s && (i === 23 || s < START[i + 1])) { k = i; break; }
    return mod(315 + 15 * (k + (s - START[k]) / LEN[k]), 360);
  }
  function moonAge(t) { return mod(t, MONTH) / MONTH; }   // 0 朔、0.5 望

  // 晝夜隨季節（v0.9.17 使用者定：照北緯 32 度算晝長）：太陽赤緯照黃經走（黃赤交角 23.44°），
  // 日出日落取幾何的（太陽中心碰到地平線，不算大氣折射與日面半徑），所以春分秋分晝夜正好各半；
  // 一天裡只照那天正午的赤緯算一次，同一天的日出日落不會跟著時辰挪。夏至晝長約 58.7%（14.1 時）、冬至約 41.3%（9.9 時）。
  const LAT = 32, D2R = Math.PI / 180, EPS = 23.4393 * D2R;
  function decl(t) { return Math.asin(Math.sin(EPS) * Math.sin(sunLon(t) * D2R)); }   // 太陽赤緯（弧度），t 是第幾日（帶小數）
  const dayCache = new Map();
  function dayFrac(d) {   // 第 d 日（0 起）白天佔一天的幾成
    const k = mod(Math.floor(d), SOLAR); let v = dayCache.get(k);
    if (v === undefined) { const x = -Math.tan(LAT * D2R) * Math.tan(decl(k + 0.5)); v = Math.acos(Math.max(-1, Math.min(1, x))) / Math.PI; dayCache.set(k, v); }
    return v;
  }
  function dawn(d) { return 0.5 - dayFrac(d) / 2; }   // 日出：一天裡的幾成（0 是半夜）
  function dusk(d) { return 0.5 + dayFrac(d) / 2; }   // 日落

  // 狀態列與見聞錄的寫法
  function label(d) { const m = month(d), t = term(d); return m.name + ' · ' + t.name + '第' + t.day + '天'; }
  function longLabel(d) { const m = month(d), t = term(d); return m.yearName + m.name + ' · ' + t.name + '第' + t.day + '天（' + ['初', '二', '三'][t.hou] + '候 ' + t.houName + '）'; }

  root.CAL = { LAT, decl, dayFrac, dawn, dusk, TERMS, LEN, START, START_DAY, YEAR, MONTH, SOLAR, CYCLE_M, LEAP_AT, SNOW_BY, THUNDER_BY, CYCLE, term, month, zhongqi, wxOdds, sunLon, moonAge, label, longLabel, dayName };
})();
