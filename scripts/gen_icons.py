#!/usr/bin/env python3
"""Gera todos os assets de icone do MovieFlix a partir do icone novo do dono.

Uso: python3 scripts/gen_icons.py <icone_origem.png>
Saida:
  - public/favicon.png, public/favicon-32.png
  - public/icon-192.png, public/icon-512.png, public/apple-touch-icon.png
  - public/logo.png (icone central recortado, para Navbar/Footer/paginas auth)
  - android/... mipmaps (launcher + foreground + round) e tv_banner
  - android/... splash screens (preto + logo centralizado)
"""
import sys
import os
from PIL import Image, ImageOps

SRC = sys.argv[1] if len(sys.argv) > 1 else "shots/new_icon.png"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

im = Image.open(SRC).convert("RGBA")
W, H = im.size
print(f"Origem: {SRC} {W}x{H}")

# ---- icones quadrados completos (fundo preto + circulo) ----
def save_square(path, size):
    im.resize((size, size), Image.LANCZOS).save(path, "PNG")
    print(f"  {path} ({size}x{size})")

# ---- recorte central: maior quadrado preto ao redor do circulo ----
# O icone tem o circulo com borda em gradiente; recortamos o quadrado central
# (circulo + padding) para usar como logo em Navbar/Footer/paginas de auth.
def center_crop():
    # proporcao: circulo ocupa ~62% da tela; padding de 19% em cada lado.
    # Recorta o quadrado central de 70% (mantem o circulo inteiro + respiro).
    frac = 0.72
    side = int(min(W, H) * frac)
    left = (W - side) // 2
    top = (H - side) // 2
    return im.crop((left, top, left + side, top + side))

logo = center_crop()

def save_logo(path, size):
    logo.resize((size, size), Image.LANCZOS).save(path, "PNG")
    print(f"  {path} ({size}x{size})")

# ============ PUBLIC (PWA / favicon / apple-touch) ============
pub = os.path.join(ROOT, "public")
save_square(os.path.join(pub, "icon-192.png"), 192)
save_square(os.path.join(pub, "icon-512.png"), 512)
save_square(os.path.join(pub, "apple-touch-icon.png"), 180)
save_square(os.path.join(pub, "favicon.png"), 64)
save_square(os.path.join(pub, "favicon-32.png"), 32)
save_logo(os.path.join(pub, "logo.png"), 512)

# ============ ANDROID ============
mipmaps = {
    "mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192,
}
fgs = {"mdpi": 35, "hdpi": 52, "xhdpi": 69, "xxhdpi": 104, "xxxhdpi": 138}

for dpi, size in mipmaps.items():
    base = os.path.join(ROOT, "android", "app", "src", "main", "res", f"mipmap-{dpi}")
    save_square(os.path.join(base, "ic_launcher.png"), size)
    save_square(os.path.join(base, "ic_launcher_round.png"), size)
    # foreground = somente o conteudo central (circulo + M), sem o fundo preto
    fg_size = fgs[dpi]
    # recorte maior (circulo ~62% + pouca margem) p/ adaptive icon
    frac = 0.66
    side = int(min(W, H) * frac)
    left = (W - side) // 2
    top = (H - side) // 2
    fg = im.crop((left, top, left + side, top + side)).resize((fg_size, fg_size), Image.LANCZOS)
    fg.save(os.path.join(base, "ic_launcher_foreground.png"), "PNG")
    print(f"  mipmap-{dpi}: launcher {size}, foreground {fg_size}")

# tv_banner (320x180): fundo preto + logo centralizado
tv = Image.new("RGBA", (320, 180), (5, 5, 5, 255))
logo_tv = logo.resize((140, 140), Image.LANCZOS)
tv.alpha_composite(logo_tv, ((320 - 140) // 2, (180 - 140) // 2))
tv.save(os.path.join(ROOT, "android", "app", "src", "main", "res", "mipmap-xhdpi", "tv_banner.png"), "PNG")
print("  tv_banner.png (320x180)")

# splash screens: preto + logo centralizado
splashes = {
    "drawable": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-mdpi": (320, 480),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
}
for folder, (sw, sh) in splashes.items():
    sp = Image.new("RGBA", (sw, sh), (5, 5, 5, 255))
    logo_sz = int(min(sw, sh) * 0.4)
    lg = logo.resize((logo_sz, logo_sz), Image.LANCZOS)
    sp.alpha_composite(lg, ((sw - logo_sz) // 2, (sh - logo_sz) // 2))
    sp.save(os.path.join(ROOT, "android", "app", "src", "main", "res", folder, "splash.png"), "PNG")
    print(f"  {folder}/splash.png ({sw}x{sh})")

print("OK")
