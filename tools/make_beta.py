#!/usr/bin/env python3
"""make_beta.py v1.0.0 (2026-11-20). Build the beta copy of one app for the beta lane.

Usage: python3 tools/make_beta.py <folder> <site_root>
  <folder>     the app folder on main, e.g. simple-metronome (nested ok: practice-player/major-7th)
  <site_root>  the gh-pages worktree to write into

Writes <site_root>/<folder>-beta/index.html: main's <folder>/index.html with
  - <base href="../<leaf>/"> first in <head>, so every relative path (../shared, sounds/, kits/, workers)
    loads from the live app's folder; only index.html differs from live,
  - <meta name="robots" content="noindex,nofollow">,
  - a small fixed BETA ribbon.
Beta pages are never linked from the hub. Same origin as the live app, so saved settings are shared:
a beta change must never change the saved-data format (the daily run's auto-ship rule already forbids it).
"""
import os, re, sys

def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    folder, root = sys.argv[1].strip('/'), sys.argv[2]
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src = os.path.join(repo, folder, 'index.html')
    html = open(src, encoding='utf-8').read()
    leaf = folder.split('/')[-1]
    head = ('<base href="../%s/">\n<meta name="robots" content="noindex,nofollow">\n' % leaf)
    m = re.search(r'<head[^>]*>', html, re.I)
    if not m:
        sys.exit('no <head> in ' + src)
    html = html[:m.end()] + '\n' + head + html[m.end():]
    ribbon = ('<div id="chma-beta" style="position:fixed;left:8px;bottom:8px;z-index:2147483647;'
              'background:#c4302b;color:#fff;font:700 12px/1 -apple-system,Helvetica,Arial,sans-serif;'
              'letter-spacing:.08em;padding:6px 9px;border-radius:6px;pointer-events:none;opacity:.92">BETA</div>')
    i = html.lower().rfind('</body>')
    html = html[:i] + ribbon + '\n' + html[i:] if i >= 0 else html + ribbon
    out_dir = os.path.join(root, os.path.dirname(folder), leaf + '-beta')
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    print(os.path.relpath(os.path.join(out_dir, 'index.html'), root))

if __name__ == '__main__':
    main()
