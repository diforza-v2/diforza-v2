"""Genera miniaturas 480x600 de las fotos del catálogo (src/img/catalogo/*.webp → src/img/catalogo/480/).
Las usan las tarjetas de producto (srcset). Correr después de sumar o cambiar fotos:
    python _dev/scripts/miniaturas.py
Solo regenera las que faltan o son más viejas que la original."""
import os, glob
from PIL import Image
SRC = 'src/img/catalogo'; DST = os.path.join(SRC, '480')
os.makedirs(DST, exist_ok=True)
n = 0
for f in glob.glob(os.path.join(SRC, '*.webp')):
    out = os.path.join(DST, os.path.basename(f))
    if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(f):
        continue
    im = Image.open(f)
    im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
    im.thumbnail((480, 600), Image.LANCZOS)
    im.save(out, 'WEBP', quality=78, method=6)
    n += 1
print('miniaturas generadas:', n)
