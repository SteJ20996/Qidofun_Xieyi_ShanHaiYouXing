#!/usr/bin/env python3
"""產生 src/stars.js（v0.9.16 觀星用的星表、星官、西洋星座、星名）。

    python3 scripts/gen-stars.py <資料夾>

<資料夾> 裡要有 d3-celestial（https://github.com/ofrohn/d3-celestial，BSD-3-Clause）data/ 底下的五個檔：
  stars.6.json（星的位置、星等、色指數，源自 XHIP／依巴谷星表）、starnames.json（拜耳名、星座、西名）、
  constellations.json、constellations.lines.json（八十八星座的中文名與連線）、starnames.cn.json（中國星名）。
要 `pip install opencc-python-reimplemented`（中國星名與星座名從簡體轉繁體）。

星官（中國的星座）的連線不是照抄別人的：哪顆星是「角宿一」照星名表（通行的對應），怎麼連是這裡自己定的（多半照編號依序連，
有名的幾個照傳統的形狀另寫）。
"""
import json, sys, math, re, base64, pathlib
import opencc

src = pathlib.Path(sys.argv[1])
root = pathlib.Path(__file__).resolve().parent.parent
_s2t = opencc.OpenCC('s2t').convert
s2t = lambda t: _s2t(t).replace('鬥', '斗')   # OpenCC 會把「斗宿」「北斗」轉成「鬥」
load = lambda f: json.loads((src / f).read_text(encoding='utf-8'))

# —— 星：照星等由亮到暗排，第幾顆就是索引
stars = []
for f in load('stars.6.json')['features']:
    lon, dec = f['geometry']['coordinates']
    ra = lon if lon >= 0 else lon + 360
    try: bv = float(f['properties'].get('bv') or 0.6)
    except ValueError: bv = 0.6
    stars.append({'hip': str(f['id']), 'ra': ra, 'dec': dec, 'mag': f['properties']['mag'], 'bv': bv})
stars.sort(key=lambda s: s['mag'])
idx = {s['hip']: i for i, s in enumerate(stars)}
names = load('starnames.json'); cn = load('starnames.cn.json')

def pack():   # 一顆六個位元組：赤經、赤緯各兩個（0.0055°）、星等一個（0.05 等）、色指數一個（0.01）
    b = bytearray()
    for s in stars:
        r = round(s['ra'] / 360 * 65535) % 65536; d = round((s['dec'] + 90) / 180 * 65535)
        m = max(0, min(255, round((s['mag'] + 2) * 20))); c = max(0, min(255, round((s['bv'] + 0.5) * 100)))
        b += bytes([r >> 8, r & 255, d >> 8, d & 255, m, c])
    return base64.b64encode(bytes(b)).decode()

# —— 星官：名、四象（0 東方青龍、1 北方玄武、2 西方白虎、3 南方朱雀、-1 不在二十八宿）、星名的字頭（星名表是簡體）、怎麼連
NUMS = {c: i + 1 for i, c in enumerate('一二三四五六七八九十')}
def cnum(t):   # 一 … 二十二
    if t in NUMS: return NUMS[t]
    if t.startswith('十') and t[1:] in NUMS: return 10 + NUMS[t[1:]]
    m = re.fullmatch(r'([一二])十([一二三四五六七八九]?)', t)
    if m: return NUMS[m.group(1)] * 10 + (NUMS[m.group(2)] if m.group(2) else 0)
    return None
ALIAS = {'大火': ('心宿', 2, '心宿二（大火）'), '北极星': ('勾陈', 1, '勾陳一（北極星）'), '牛郎': ('河鼓', 2, '河鼓二（牛郎）'), '织女': ('织女', 1, '織女一（織女星）')}   # 亮星在星名表裡用俗名
by_prefix = {}
for hip, v in cn.items():
    nm = v.get('name', '')
    if '增' in nm or hip not in idx: continue
    if nm in ALIAS: by_prefix.setdefault(ALIAS[nm][0], {})[ALIAS[nm][1]] = idx[hip]; continue
    for k in range(1, len(nm)):   # 編號從長的先試：「軒轅十四」是十四，不是「軒轅十」的四
        n = cnum(nm[k:])
        if n: by_prefix.setdefault(nm[:k], {})[n] = idx[hip]; break
    else: by_prefix.setdefault(nm, {})[0] = idx[hip]   # 單一顆、名字沒有編號的（天狼、老人、大角……）

XIU = '角亢氐房心尾箕斗牛女虛危室壁奎婁胃昴畢觜參井鬼柳星張翼軫'
XIU_CN = ['角宿', '亢宿', '氐宿', '房宿', '心宿', '尾宿', '箕宿', '斗宿', '牛宿', '女宿', '虚宿', '危宿', '室宿', '壁宿',
          '奎宿', '娄宿', '胃宿', '昴宿', '毕宿', '觜宿', '参宿', '井宿', '鬼宿', '柳宿', '星宿', '张宿', '翼宿', '轸宿']
CLOSE = {'氐宿', '箕宿', '鬼宿', '轸宿', '奎宿', '觜宿', '织女', '五车'}   # 首尾相接成一圈的
CUSTOM = {   # 照傳統形狀另寫的（數字是星名的編號）
    '尾宿': [[2, 1, 3, 4, 5, 6, 7, 8, 9]],                       # 尾宿二（ε）在一（μ）的北邊，順著蠍尾連
    '斗宿': [[3, 2, 1, 4, 5, 6, 1]],                            # 南斗：一、四、五、六是斗，二、三是柄
    '参宿': [[4, 5], [5, 3, 2, 1, 4], [1, 6], [3, 7], [6, 7]],  # 參：四角四顆（四參宿四、五、六、七），中間三顆（一在東、三在西）
    '昴宿': [],                                                  # 昴是一團，不連線
}
AST = [(XIU[i] + '宿', i // 7, XIU_CN[i]) for i in range(28)] + [
    ('北斗', -1, None), ('勾陳', -1, '勾陈'), ('織女', -1, '织女'), ('河鼓', -1, '河鼓'), ('天津', -1, '天津'),
    ('軒轅', -1, '轩辕'), ('五車', -1, '五车'), ('北河', -1, '北河'), ('南河', -1, '南河'), ('弧矢', -1, '弧矢'), ('王良', -1, '王良'),
    ('天船', -1, '天船'), ('天狼', -1, '天狼'), ('老人', -1, '老人'), ('大角', -1, '大角'), ('北落師門', -1, '北落师门')]
DIPPER = ['天枢', '天璇', '天玑', '天权', '玉衡', '开阳', '摇光']
cn_ast, warn = [], []
for name, grp, pre in AST:
    if pre is None:   # 北斗：天樞、天璇、天璣、天權是斗，玉衡、開陽、搖光是杓
        mem = {i + 1: by_prefix[n][0] for i, n in enumerate(DIPPER) if n in by_prefix}
        chains = [[1, 2, 3, 4, 1], [4, 5, 6, 7]]
    else:
        mem = by_prefix.get(pre, {})
        nums = sorted(n for n in mem if n)
        if not nums and 0 in mem: chains = []
        elif pre in CUSTOM: chains = CUSTOM[pre]
        else: chains = [nums + ([nums[0]] if pre in CLOSE and len(nums) > 2 else [])]
    if not mem: warn.append(name + '：星名表裡找不到'); continue
    lines = []
    for ch in chains:
        for a, b in zip(ch, ch[1:]):
            if a in mem and b in mem: lines += [mem[a], mem[b]]
            else: warn.append(name + '：少了第 ' + str(a if a not in mem else b) + ' 顆（暗過六等）')
    cn_ast.append({'n': name, 'g': grp, 's': sorted(set(mem.values())), 'l': lines})

# —— 八十八星座：連線的頂點對到最近的星（0.1° 內），名字用中文
cell = {}
for i, s in enumerate(stars): cell.setdefault((int(s['ra']), int(s['dec'] + 90)), []).append(i)
def nearest(ra, dec):
    ra %= 360; best, bd = None, 0.1
    for dr in (-1, 0, 1):
        for dd in (-1, 0, 1):
            for i in cell.get((int(ra + dr) % 360, int(dec + 90) + dd), []):
                s = stars[i]; d = math.hypot((s['ra'] - ra + 180) % 360 - 180, s['dec'] - dec)
                if d < bd: best, bd = i, d
    return best
zh = {f['id']: s2t(f['properties'].get('zh', f['id'])) for f in load('constellations.json')['features']}
west, miss = [], 0
for f in load('constellations.lines.json')['features']:
    lines = []
    for line in f['geometry']['coordinates']:
        pts = [nearest(lon if lon >= 0 else lon + 360, dec) for lon, dec in line]
        for a, b in zip(pts, pts[1:]):
            if a is None or b is None: miss += 1; continue
            lines += [a, b]
    if lines: west.append({'n': zh.get(f['id'], f['id']), 'l': lines})

# —— 星名（指著時寫）：星官裡的每一顆、二等以上的亮星；一等以上的另附西名
label = {}
for hip, v in cn.items():
    if hip not in idx: continue
    i = idx[hip]; nm = v.get('name', '')
    in_ast = any(i in a['s'] for a in cn_ast)
    if nm in ALIAS: label[i] = ALIAS[nm][2]
    elif (in_ast or stars[i]['mag'] <= 2.0) and nm and '增' not in nm: label[i] = s2t(nm)
for hip, v in names.items():
    if hip in idx and stars[idx[hip]]['mag'] <= 1.5 and v.get('name'):
        i = idx[hip]; label[i] = (label[i] + ' · ' if i in label else '') + v['name']
label = {k: v for k, v in label.items() if v}

LICENSE = (src / 'LICENSE').read_text(encoding='utf-8').strip() if (src / 'LICENSE').exists() else ''
out = ('// stars.js —— 觀星用的星表（v0.9.16）。由 scripts/gen-stars.py 產生，不要手改。\n'
       '// 星的位置、星等、色指數與八十八星座的連線取自 d3-celestial 的資料（源自 XHIP／依巴谷星表、IAU），依其 BSD-3-Clause 授權轉用，原授權全文如下；\n'
       '// 星官（中國星座）哪顆星叫什麼照通行的對應（d3-celestial 收的 Stellarium 中國星名表），連線是本作自己定的。\n'
       + ''.join('// ' + l + '\n' for l in LICENSE.splitlines()) +
       'window.STARS = ' + json.dumps({'n': len(stars), 'data': pack(), 'cn': cn_ast, 'west': west, 'names': {str(k): v for k, v in sorted(label.items())}},
                                      ensure_ascii=False, separators=(',', ':')) + ';\n')
(root / 'src' / 'stars.js').write_text(out, encoding='utf-8')
print('wrote src/stars.js', len(out.encode('utf-8')), 'bytes;', len(stars), 'stars,', len(cn_ast), '星官,', len(west), '星座,', len(label), 'names; 星座頂點沒對上', miss)
for w in warn: print('  注意：' + w)
