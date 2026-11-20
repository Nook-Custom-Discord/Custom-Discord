# Erzeugt die Android-App-Icons aus build/icon.png (aufgerufen von scripts/android-build.sh).
import os
import sys

from PIL import Image, ImageDraw

src = Image.open(sys.argv[1]).convert('RGBA')
res = sys.argv[2]
w, h = src.size
# Rand des runden Desktop-Icons abschneiden (wie beim iPhone)
m = int(w * 0.0625)
inner = src.crop((m, m, w - m, h - m))
bg = inner.getpixel((inner.width // 2, int(inner.height * 0.04)))[:3]
square = Image.new('RGBA', inner.size, bg + (255,))
square.alpha_composite(inner)

# Hintergrund fürs adaptive Icon: diagonaler Verlauf aus den Eckfarben des Icons (ohne das Symbol)
c1 = square.getpixel((int(square.width * 0.05), int(square.height * 0.05)))[:3]
c2 = square.getpixel((int(square.width * 0.95), int(square.height * 0.95)))[:3]
G = 256
gradient = Image.new('RGB', (G, G))
gp = gradient.load()
for y in range(G):
    for x in range(G):
        t = (x + y) / (2 * (G - 1))
        gp[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))

for d, s in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    folder = os.path.join(res, f'mipmap-{d}')
    os.makedirs(folder, exist_ok=True)
    sq = square.resize((s, s), Image.LANCZOS)
    sq.save(os.path.join(folder, 'ic_launcher.png'))
    mask = Image.new('L', (s * 4, s * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, s * 4 - 1, s * 4 - 1), fill=255)
    rnd = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    rnd.paste(sq, (0, 0), mask.resize((s, s), Image.LANCZOS))
    rnd.save(os.path.join(folder, 'ic_launcher_round.png'))
    # Adaptives Icon (108dp-Fläche, sichtbar ist nur die Mitte): Hintergrund = Farbverlauf des Icons,
    # Vordergrund = nur das weiße Symbol, etwas verkleinert
    fs = int(s * 108 / 48)
    gradient.resize((fs, fs), Image.LANCZOS).save(os.path.join(folder, 'ic_launcher_background.png'))
    glyph = square.resize((int(fs * 0.58), int(fs * 0.58)), Image.LANCZOS)
    px = glyph.load()
    for y in range(glyph.height):
        for x in range(glyph.width):
            r, g, b, _ = px[x, y]
            a = max(0, min(255, int((min(r, g, b) - 170) * 255 / 85)))
            px[x, y] = (255, 255, 255, a)
    fg = Image.new('RGBA', (fs, fs), (0, 0, 0, 0))
    fg.alpha_composite(glyph, ((fs - glyph.width) // 2, (fs - glyph.height) // 2))
    fg.save(os.path.join(folder, 'ic_launcher_foreground.png'))

ADAPTIVE = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
"""
adaptive = os.path.join(res, 'mipmap-anydpi-v26')
os.makedirs(adaptive, exist_ok=True)
for name in ('ic_launcher.xml', 'ic_launcher_round.xml'):
    with open(os.path.join(adaptive, name), 'w', encoding='utf-8') as f:
        f.write(ADAPTIVE)
print('Icons erzeugt')
