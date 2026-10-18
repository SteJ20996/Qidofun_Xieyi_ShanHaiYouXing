// 把單檔遊戲 dist/xieyi.html 複製成殼要載的 app/index.html（先在專案根目錄跑 python3 scripts/build-single.py）
// dist/xieyi.html 是給 Artifact 的片段，沒有 doctype 與 <meta charset>（發佈時才包一層）；殼直接開本機檔案，沒宣告編碼的話
// Chromium 只能用猜的，v0.8.3 起猜成了俄文的編碼、中文全成亂碼。所以這裡包成完整的頁面，明寫 UTF-8（v0.8.5 修）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'dist', 'xieyi.html');
if (!fs.existsSync(src)) { console.error('找不到 dist/xieyi.html：先在專案根目錄跑 python3 scripts/build-single.py'); process.exit(1); }
const frag = fs.readFileSync(src, 'utf8');
const page = /^\s*<!doctype/i.test(frag) ? frag
  : '<!DOCTYPE html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n' + frag + '</body>\n</html>\n';
fs.mkdirSync(path.join(here, 'app'), { recursive: true });
fs.writeFileSync(path.join(here, 'app', 'index.html'), page, 'utf8');
console.log('app/index.html ← dist/xieyi.html（' + Buffer.byteLength(page) + ' 位元組，包成完整頁面、明寫 UTF-8）');
