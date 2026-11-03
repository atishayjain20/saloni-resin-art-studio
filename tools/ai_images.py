#!/usr/bin/env python3
"""Publish approved AI concept images for the product gallery.

Needs Pillow in a scratch venv (it is NOT a site dependency):

    python3 -m venv /tmp/ai-venv && /tmp/ai-venv/bin/pip install pillow
    /tmp/ai-venv/bin/python tools/ai_images.py sheet SECTION   # work/ai-images/SECTION-sheet-NN.jpg
    /tmp/ai-venv/bin/python tools/ai_images.py build KEEPFILE  # assets/ai-images/*.webp + data-ai-images

Run it from the repo root. Generated images live in work/ai-images/<section>/ as
<stem>--ai-<name>.jpg, where <name> is a colour (e.g. royal-blue) or "styled".
KEEPFILE lists the approved files, one "<section>/<file>.jpg" per line.
`build` replaces assets/ai-images/ with exactly those images and rewrites
data-ai-images on every card trigger: colours first, then "styled".
"""
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps, features

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
WORK_DIR = ROOT / "work" / "ai-images"
OUT_DIR = ROOT / "assets" / "ai-images"
MAX_SIDE = 1100
SIZE_CAP = 150 * 1024
QUALITY_STEPS = (78, 70, 62, 54)

TRIGGER_RE = re.compile(r"<a\b[^>]*\bdata-lightbox-trigger\b[^>]*>")
HREF_RE = re.compile(r'\bhref="([^"]+)"')
ATTR_RE = re.compile(r'\sdata-(?:ai-images|colour-options)="[^"]*"')
FILE_RE = re.compile(r"^([a-z0-9-]+)--ai-([a-z]+(?:-[a-z]+)*)\.jpg$")


def card_sources(html):
    """{stem: href} for the card triggers (hero copies point at cards and are skipped)."""
    found = {}
    for tag in TRIGGER_RE.findall(html):
        if "data-lightbox-target" in tag:
            continue
        match = HREF_RE.search(tag)
        if match:
            href = re.split(r"[?#]", match.group(1))[0]
            found.setdefault(Path(href).stem, href)
    return found


def prep(path, side):
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    img.thumbnail((side, side), Image.LANCZOS)
    return img


def cmd_build(keepfile):
    if not features.check("webp"):
        sys.exit("This Pillow build has no WebP support.")
    html = INDEX.read_text(encoding="utf-8")
    sources = card_sources(html)
    kept = {}
    for line in Path(keepfile).read_text(encoding="utf-8").split():
        match = FILE_RE.match(Path(line).name)
        if not match or match.group(1) not in sources:
            sys.exit("Not an AI image of a card photo: " + line)
        kept.setdefault(match.group(1), []).append((match.group(2), WORK_DIR / line))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("*.webp"):
        old.unlink()
    for stem, items in kept.items():
        for name, src in items:
            img, target = prep(src, MAX_SIDE), OUT_DIR / ("%s--%s.webp" % (stem, name))
            for quality in QUALITY_STEPS:
                img.save(target, "WEBP", quality=quality, method=6)
                if target.stat().st_size <= SIZE_CAP:
                    break
            else:
                sys.exit("Over %d KB even at the lowest quality: %s" % (SIZE_CAP // 1024, src))

    def rewrite(match):
        tag = ATTR_RE.sub("", match.group(0))
        href = HREF_RE.search(tag)
        if "data-lightbox-target" in tag or not href:
            return tag
        names = sorted(name for name, _ in kept.get(Path(re.split(r"[?#]", href.group(1))[0]).stem, []))
        names.sort(key=lambda name: name == "styled")
        if not names:
            return tag
        return tag[:href.start()].rstrip() + ' data-ai-images="%s" ' % " ".join(names) + tag[href.start():]

    INDEX.write_text(TRIGGER_RE.sub(rewrite, html), encoding="utf-8")
    size = sum(p.stat().st_size for p in OUT_DIR.glob("*.webp"))
    print("%d images for %d products, %.1f MB" % (sum(map(len, kept.values())), len(kept), size / 1e6))


def cmd_sheet(section):
    tile, cap, per_sheet = 360, 34, 8
    sources = card_sources(INDEX.read_text(encoding="utf-8"))
    rows = []
    for stem, href in sources.items():
        files = sorted((WORK_DIR / section).glob(stem + "--ai-*.jpg"), key=lambda p: (p.name.endswith("--ai-styled.jpg"), p.name))
        if files:
            rows.append((stem, ROOT / href, files))
    for number, start in enumerate(range(0, len(rows), per_sheet), 1):
        chunk = rows[start:start + per_sheet]
        width = max(len(files) for _, _, files in chunk) + 1
        sheet = Image.new("RGB", (width * (tile + 15), len(chunk) * (tile + cap)), "white")
        draw, font = ImageDraw.Draw(sheet), ImageFont.load_default(size=20)
        for r, (stem, src, files) in enumerate(chunk):
            y = r * (tile + cap)
            draw.text((4, y + 8), "%d. %s" % (start + r + 1, stem), fill="black", font=font)
            tiles = [("REAL", src)] + [(FILE_RE.match(f.name).group(2).upper(), f) for f in files]
            for c, (label, path) in enumerate(tiles):
                img, x = prep(path, tile), c * (tile + 15)
                sheet.paste(img, (x + (tile - img.width) // 2, y + cap))
                draw.rectangle([x, y + cap, x + 10 + 13 * len(label), y + cap + 26], fill="black")
                draw.text((x + 5, y + cap + 3), label, fill="white", font=font)
        path = WORK_DIR / ("%s-sheet-%02d.jpg" % (section, number))
        sheet.save(path, quality=82)
        print(path)


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ("build", "sheet"):
        sys.exit(__doc__)
    {"build": cmd_build, "sheet": cmd_sheet}[sys.argv[1]](sys.argv[2])


if __name__ == "__main__":
    main()
