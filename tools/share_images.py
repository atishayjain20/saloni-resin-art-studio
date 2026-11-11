#!/usr/bin/env python3
"""Make the link-preview JPEG for every catalogue product: assets/share/<slug>.jpg

Needs Pillow in a scratch venv (it is NOT a site dependency; tools/product_pages.py needs only Python):

    python3 -m venv /tmp/share-venv && /tmp/share-venv/bin/pip install pillow
    /tmp/share-venv/bin/python tools/share_images.py
    python3 tools/product_pages.py

Run it from anywhere, before product_pages.py. WhatsApp is the main target, so every product gets
the same kind of image whatever its photo is (webp, jpeg or png): RGB on white (no transparency),
progressive JPEG at quality 80 (or lower when needed to stay light), the photo's own shape (never cropped), shortest side at least
600 px (a small photo is enlarged only as much as needed), longest side at most 1200 px, and
under 250 KB (quality 80 is lowered in steps for a heavy photo, the tests allow 300 KB). The product photos in assets/ are only read, never changed. Share images of
products that no longer exist are deleted.
"""
import sys
from pathlib import Path

from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
import product_pages  # noqa: E402

ROOT = product_pages.ROOT
OUT_DIR = ROOT / "assets" / "share"
MIN_SIDE, MAX_SIDE, SIZE_CAP, QUALITY_STEPS = 600, 1200, 250 * 1024, (80, 74, 68, 62)


def target_size(width, height):
    """The photo's own size, enlarged only if its short side is under 600 and reduced only if its long side is over 1200."""
    scale = 1.0
    if min(width, height) < MIN_SIDE:
        scale = MIN_SIDE / min(width, height)
    elif max(width, height) > MAX_SIDE:
        scale = MAX_SIDE / max(width, height)
    size = (max(round(width * scale), 1), max(round(height * scale), 1))
    if min(size) < MIN_SIDE or max(size) > MAX_SIDE:
        raise SystemExit("A %dx%d photo cannot fit %d-%d px without cropping" % (width, height, MIN_SIDE, MAX_SIDE))
    return size


def make_image(source, target):
    photo = ImageOps.exif_transpose(Image.open(source)).convert("RGBA")
    flat = Image.new("RGB", photo.size, "white")
    flat.paste(photo, mask=photo.getchannel("A"))
    size = target_size(*flat.size)
    if size != flat.size:
        flat = flat.resize(size, Image.LANCZOS)
    for quality in QUALITY_STEPS:
        flat.save(target, "JPEG", quality=quality, progressive=True, optimize=True)
        if target.stat().st_size <= SIZE_CAP:
            return
    raise SystemExit("%s is still %d KB at quality %d; the limit is %d KB" % (target.name, target.stat().st_size // 1024, QUALITY_STEPS[-1], SIZE_CAP // 1024))


def main():
    cards = product_pages.parse_cards((ROOT / "index.html").read_text(encoding="utf-8"))
    slugs = product_pages.assign_slugs(cards)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for card, slug in zip(cards, slugs):
        make_image(ROOT / "assets" / card["file"], OUT_DIR / (slug + ".jpg"))
    for old in OUT_DIR.glob("*.jpg"):
        if old.stem not in slugs:
            old.unlink()
    files = list(OUT_DIR.glob("*.jpg"))
    print("%d share images, %.1f MB in assets/share/. Now run: python3 tools/product_pages.py" % (len(files), sum(f.stat().st_size for f in files) / 1e6))


if __name__ == "__main__":
    main()
