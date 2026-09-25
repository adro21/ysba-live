#!/usr/bin/env python3
"""Prepare a sponsor logo pair for public/images/sponsors/.

Usage:
    python3 scripts/make-sponsor-logo.py <id> <source.png> [--keep-hue]

Reads a colour-on-white (or transparent) PNG, trims the margins, makes any
white background transparent, resizes to 640px wide and writes:
    public/images/sponsors/<id>.png         colour, for white surfaces
    public/images/sponsors/<id>-white.png   white, for the dark footer

The white variant turns dark ink white while preserving anti-aliasing.
Strongly coloured pixels (e.g. a blue accent dot) are left as-is so a
brand accent survives on the dark footer. If the whole logo is one
colour (e.g. a blue wordmark) pass --keep-hue=no to whiten everything,
or simply supply the sponsor's own white PNG instead of this script.

Requires Pillow: pip3 install pillow
"""
import sys
from pathlib import Path
from PIL import Image

def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    sid, src_path = sys.argv[1], sys.argv[2]
    keep_hue = '--keep-hue=no' not in sys.argv[3:]
    out_dir = Path('public/images/sponsors'); out_dir.mkdir(parents=True, exist_ok=True)

    im = Image.open(src_path).convert('RGBA')
    w, h = im.size
    px = im.load()
    def is_bg(p): return p[3] < 8 or (p[0] > 240 and p[1] > 240 and p[2] > 240)
    xs = [x for x in range(w) for y in range(0, h, 2) if not is_bg(px[x, y])]
    ys = [y for y in range(h) for x in range(0, w, 2) if not is_bg(px[x, y])]
    im = im.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))
    px = im.load(); w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0 and r > 240 and g > 240 and b > 240:
                px[x, y] = (255, 255, 255, 0)

    colour = im.resize((640, round(h * 640 / w)), Image.LANCZOS)
    colour.save(out_dir / f'{sid}.png', optimize=True)

    white = colour.copy(); px = white.load(); w2, h2 = white.size
    for y in range(h2):
        for x in range(w2):
            r, g, b, a = px[x, y]
            if a == 0: continue
            if keep_hue and (max(r, g, b) - min(r, g, b)) > 60:
                continue  # saturated accent: keep it
            lum = (r + g + b) / 3
            px[x, y] = (255, 255, 255, round(a * (1 - lum / 255)))
    white.save(out_dir / f'{sid}-white.png', optimize=True)
    print(f'wrote {out_dir}/{sid}.png and {sid}-white.png ({colour.size[0]}x{colour.size[1]})')

if __name__ == '__main__':
    main()
