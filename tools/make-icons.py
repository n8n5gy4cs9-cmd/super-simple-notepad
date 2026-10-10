#!/usr/bin/env python3
"""Generates Jot icons (dev tool only; output is committed). Needs Pillow."""
from PIL import Image, ImageDraw
import math, os
OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
SS = 4
def bez(p0, p1, p2, n=60):
    return [((1-t)**2*p0[0]+2*(1-t)*t*p1[0]+t*t*p2[0], (1-t)**2*p0[1]+2*(1-t)*t*p1[1]+t*t*p2[1]) for t in [i/n for i in range(n+1)]]
def draw(size, maskable=False):
    W = size*SS
    img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    # gradient background
    g = Image.new('RGBA', (W, W))
    gd = ImageDraw.Draw(g)
    for y in range(W):
        t = y/W
        c = tuple(int(a+(b-a)*t) for a, b in zip((0x2a, 0x1f, 0x1c), (0x12, 0x0e, 0x0d)))
        gd.line([(0, y), (W, y)], fill=c+(255,))
    m = Image.new('L', (W, W), 0)
    md = ImageDraw.Draw(m)
    if maskable: md.rectangle([0, 0, W, W], fill=255)
    else: md.rounded_rectangle([0, 0, W-1, W-1], radius=int(W*0.22), fill=255)
    img.paste(g, (0, 0), m)
    d = ImageDraw.Draw(img)
    k = W/512 * (0.74 if maskable else 1.0)
    off = (W - 512*k)/2
    P = lambda x, y: (off+x*k, off+y*k)
    def stroke(pts, w, col):
        r = w*k/2
        for (x, y) in pts:
            X, Y = P(x, y); d.ellipse([X-r, Y-r, X+r, Y+r], fill=col)
    def seg(a, b, w, col):
        n = int(max(abs(a[0]-b[0]), abs(a[1]-b[1]))*1.5)+1
        stroke([(a[0]+(b[0]-a[0])*i/n, a[1]+(b[1]-a[1])*i/n) for i in range(n+1)], w, col)
    ink = (243, 239, 230, 255); acc = (255, 90, 54, 255)
    seg((196, 134), (372, 134), 52, ink)
    seg((296, 134), (296, 296), 52, ink)
    stroke(bez((296, 296), (296, 384), (216, 384)), 52, ink)
    stroke(bez((216, 384), (184, 384), (160, 362)), 52, ink)
    # cursor underscore
    x0, y0 = P(332, 372); x1, y1 = P(430, 402)
    d.rounded_rectangle([x0, y0, x1, y1], radius=int(15*k), fill=acc)
    return img.resize((size, size), Image.LANCZOS)
os.makedirs(OUT, exist_ok=True)
for s in (192, 512): draw(s).save(f'{OUT}/icon-{s}.png')
draw(512, True).save(f'{OUT}/maskable-512.png')
draw(192, True).save(f'{OUT}/maskable-192.png')
draw(180, True).save(f'{OUT}/apple-touch-icon.png')
draw(48).save(f'{OUT}/favicon-48.png')
draw(32).save(f'{OUT}/favicon-32.png')
ico = [draw(s) for s in (16, 32, 48)]
ico[2].save(f'{OUT}/../favicon.ico', sizes=[(16,16),(32,32),(48,48)], append_images=ico[:2])
svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1f1c"/><stop offset="1" stop-color="#120e0d"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="url(#g)"/><g fill="none" stroke="#f3efe6" stroke-width="52" stroke-linecap="round" stroke-linejoin="round"><path d="M196 134H372M296 134V296Q296 384 216 384Q184 384 160 362"/></g><rect x="332" y="372" width="98" height="30" rx="15" fill="#ff5a36"/></svg>'''
open(f'{OUT}/icon.svg', 'w').write(svg)
print('ok')
