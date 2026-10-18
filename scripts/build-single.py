#!/usr/bin/env python3
"""把遊戲打包成一個單文件 HTML（樣式與腳本全部內聯），便於發佈為 claude.ai Artifact 或單文件分發。

    python3 scripts/build-single.py            # 輸出 dist/xieyi.html（無 doctype/html/body 外殼，Artifact 發佈時會自動包一層）
    python3 scripts/build-single.py --page     # 輸出 dist/index.html（完整頁面，可直接雙擊打開）
"""
import re, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'style.css').read_text(encoding='utf-8')
head = html[html.index('<head>') + 6: html.index('</head>')]
body = html[html.index('<body>') + 6: html.index('</body>')]

font_links = '\n'.join(l.strip() for l in head.splitlines() if 'fonts.g' in l)
body = re.sub(r'<script src="([^"]+)"></script>',
              lambda m: '<script>\n' + (root / m.group(1)).read_text(encoding='utf-8') + '\n</script>', body)
# v0.8.10：測試服的單檔，標題後面加「測試服」，Artifact 的畫廊裡分得出來（正式服照舊只寫山海有形）
srv = root / 'src' / 'server.js'
m = re.search(r"XIEYI_SERVER\s*=\s*\{\s*name:\s*'([^']*)'", srv.read_text(encoding='utf-8')) if srv.exists() else None
title = '山海有形' + (' · ' + m.group(1) if m and m.group(1) and m.group(1) != '正式服' else '')
fragment = ('<title>' + title + '</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' + font_links +
            '\n<style>\n' + css + '\n</style>\n' + body.strip() + '\n')

out_dir = root / 'dist'; out_dir.mkdir(exist_ok=True)
if '--page' in sys.argv:
    page = ('<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}'
            'body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>\n'
            '</head>\n<body>\n' + fragment + '</body>\n</html>\n')
    (out_dir / 'index.html').write_text(page, encoding='utf-8'); print('wrote dist/index.html', len(page), 'bytes')
else:
    (out_dir / 'xieyi.html').write_text(fragment, encoding='utf-8'); print('wrote dist/xieyi.html', len(fragment), 'bytes')
