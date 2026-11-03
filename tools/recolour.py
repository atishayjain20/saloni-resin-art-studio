#!/usr/bin/env python3
"""Make recoloured preview variants of the product photos in index.html.

Needs Pillow and numpy in a scratch venv (they are NOT site dependencies):

    python3 -m venv /tmp/recolour-venv && /tmp/recolour-venv/bin/pip install pillow numpy
    /tmp/recolour-venv/bin/python tools/recolour.py generate [photo-stem ...]   # no stems = every photo
    /tmp/recolour-venv/bin/python tools/recolour.py sheet      # work/recolour/sheet-NN.jpg
    /tmp/recolour-venv/bin/python tools/recolour.py annotate   # writes data-colour-options

Run it from the repo root. One rule, no per-image tuning:
protected pixels never change, the dominant hue H0 of the rest is moved to
each of up to three fixed target colours, and saturation / value are kept.
"""
import argparse
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps, features

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
OUT_DIR = ROOT / "assets" / "colour-options"
SHEET_DIR = ROOT / "work" / "recolour"

PALETTE = [("Teal", 180.0), ("Rose", 352.0), ("Amethyst", 272.0), ("Emerald", 145.0)]
MAX_SIDE = 1100
MIN_COVER = 0.08      # share of the image that must sit near H0, else skip the item
MIN_CHANGED = 0.05    # share of pixels that must really move, else drop the variant
MIN_DISTANCE = 45.0   # a target must be at least this far from H0
SIZE_CAP = 150 * 1024
QUALITY_STEPS = (78, 70, 62)

TRIGGER_RE = re.compile(r"<a\b[^>]*\bdata-lightbox-trigger\b[^>]*>")
HREF_RE = re.compile(r'\bhref="([^"]+)"')
ATTR_RE = re.compile(r'\sdata-colour-options="[^"]*"')


# ---------------------------------------------------------------- colour maths
def rgb_to_hsv(rgb):
    """uint8 (..., 3) -> float h (degrees), s, v in [0, 1]."""
    a = rgb.astype(np.float32) / 255.0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(axis=-1)
    d = mx - a.min(axis=-1)
    safe = np.where(d == 0, 1.0, d)
    h = np.where(mx == r, ((g - b) / safe) % 6, np.where(mx == g, (b - r) / safe + 2, (r - g) / safe + 4))
    h = np.where(d == 0, 0.0, h) * 60.0
    s = np.where(mx == 0, 0.0, d / np.where(mx == 0, 1.0, mx))
    return h.astype(np.float32), s.astype(np.float32), mx.astype(np.float32)


def hsv_to_rgb(h, s, v):
    h6 = (h % 360.0) / 60.0
    c = v * s
    x = c * (1 - np.abs(h6 % 2 - 1))
    m = v - c
    z = np.zeros_like(h)
    sector = np.floor(h6).astype(np.int32) % 6
    r = np.choose(sector, [c, x, z, z, x, c])
    g = np.choose(sector, [x, c, c, x, z, z])
    b = np.choose(sector, [z, z, x, c, c, x])
    out = np.stack([r + m, g + m, b + m], axis=-1)
    return np.clip(np.rint(out * 255.0), 0, 255).astype(np.uint8)


def circ(a, b):
    """Signed circular difference a - b in (-180, 180]."""
    return ((a - b + 180.0) % 360.0) - 180.0


def protected_mask(h, s, v):
    return (
        (s < 0.30)
        | (v < 0.15)
        | (v > 0.97)
        | ((h >= 38) & (h <= 65))
        | ((h >= 8) & (h < 38) & (s < 0.55))
    )


def dominant_hue(rgb):
    """Return (H0, cover) for the unprotected pixels, or (None, cover)."""
    h, s, v = rgb_to_hsv(rgb)
    free = ~protected_mask(h, s, v)
    if not free.any():
        return None, 0.0
    bins = np.floor(h[free] / 10.0).astype(int) % 36
    hist = np.bincount(bins, weights=s[free], minlength=36)
    h0 = float(np.argmax(hist) * 10 + 5)
    near = free & (np.abs(circ(h, h0)) <= 30)
    cover = float(near.sum()) / free.size
    return (h0 if cover >= MIN_COVER else None), cover


def choose_targets(h0):
    chosen = []
    for name, hue in PALETTE:
        if abs(circ(hue, h0)) >= MIN_DISTANCE:
            chosen.append((name, hue))
        if len(chosen) == 3:
            break
    return chosen


def shift(rgb, h0, target):
    """Return (new_rgb, share of pixels with weight > 0.5)."""
    h, s, v = rgb_to_hsv(rgb)
    w = np.clip((30.0 - np.abs(circ(h, h0))) / 12.0, 0.0, 1.0)
    w = w * np.clip((s - 0.30) / 0.10, 0.0, 1.0)
    w = np.where(protected_mask(h, s, v), 0.0, w)
    moved = w > 0
    out = rgb.copy()
    if moved.any():
        new_h = h + w * circ(target, h0)
        out[moved] = hsv_to_rgb(new_h, s, v)[moved]
    return out, float((w > 0.5).sum()) / w.size


# ------------------------------------------------------------------- site data
def read_index():
    return INDEX.read_text(encoding="utf-8")


def card_sources(html):
    """[(stem, relative href)] for the card triggers, in page order."""
    found, stems = [], {}
    for tag in TRIGGER_RE.findall(html):
        if "data-lightbox-target" in tag:
            continue
        match = HREF_RE.search(tag)
        if not match:
            continue
        href = re.split(r"[?#]", match.group(1))[0]
        stem = Path(href).stem
        if stem in stems and stems[stem] != href:
            sys.exit("Two sources share the stem %r: %s and %s" % (stem, stems[stem], href))
        if stem in stems:
            continue
        stems[stem] = href
        found.append((stem, href))
    return found


def prep(path):
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    long_side = max(img.size)
    if long_side > MAX_SIDE:
        scale = MAX_SIDE / long_side
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    return img


def save_capped(img, path):
    for quality in QUALITY_STEPS:
        img.save(path, "WEBP", quality=quality, method=6, exif=b"", icc_profile=None)
        if path.stat().st_size <= SIZE_CAP:
            return True
    path.unlink()
    return False


# -------------------------------------------------------------------- commands
def cmd_generate(args):
    if not features.check("webp"):
        sys.exit("This Pillow build has no WebP support.")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    items = skipped = made = dropped = 0
    sources = card_sources(read_index())
    if args.stems:
        unknown = set(args.stems) - {stem for stem, _ in sources}
        if unknown:
            sys.exit("Not a card photo in index.html: " + ", ".join(sorted(unknown)))
        sources = [(stem, href) for stem, href in sources if stem in args.stems]
    for stem, href in sources:
        for old in OUT_DIR.glob(stem + "--*.webp"):
            old.unlink()
        rgb = np.asarray(prep(ROOT / href))
        h0, cover = dominant_hue(rgb)
        if h0 is None:
            skipped += 1
            print("SKIP  %s (no dominant colour: %.1f%% near the peak)" % (stem, cover * 100))
            continue
        kept = []
        for name, hue in choose_targets(h0):
            out, share = shift(rgb, h0, hue)
            if share < MIN_CHANGED:
                dropped += 1
                print("DROP  %s--%s (only %.1f%% changed)" % (stem, name.lower(), share * 100))
                continue
            target = OUT_DIR / ("%s--%s.webp" % (stem, name.lower()))
            if save_capped(Image.fromarray(out), target):
                kept.append(name)
                made += 1
            else:
                dropped += 1
                print("DROP  %s--%s (over %d KB)" % (stem, name.lower(), SIZE_CAP // 1024))
        items += 1
        print("OK    %s H0=%d -> %s" % (stem, h0, " ".join(kept) or "-"))
    size = sum(p.stat().st_size for p in OUT_DIR.glob("*.webp"))
    print("items=%d skipped=%d variants=%d dropped=%d size=%.1f MB" % (items, skipped, made, dropped, size / 1e6))


def _font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def cmd_sheet(args):
    tile, gap, cap, per_sheet = 260, 10, 54, 8
    SHEET_DIR.mkdir(parents=True, exist_ok=True)
    for old in SHEET_DIR.glob("sheet-*.jpg"):
        old.unlink()
    rows = []
    for stem, href in card_sources(read_index()):
        files = sorted(OUT_DIR.glob(stem + "--*.webp"), key=lambda p: [n.lower() for n, _ in PALETTE].index(p.stem.split("--")[1]))
        if files:
            rows.append((stem, Path(href).name, ROOT / href, files))
    font = _font(14)
    paths = []
    for number, start in enumerate(range(0, len(rows), per_sheet), 1):
        chunk = rows[start:start + per_sheet]
        width = gap + 4 * (tile + gap)
        height = gap + len(chunk) * (tile + cap + gap)
        sheet = Image.new("RGB", (width, height), (245, 240, 232))
        draw = ImageDraw.Draw(sheet)
        for r, (stem, name, src, files) in enumerate(chunk):
            y = gap + r * (tile + cap + gap)
            tiles = [("SOURCE\n" + name, prep(src))] + [(f.name, Image.open(f).convert("RGB")) for f in files]
            for c, (label, img) in enumerate(tiles):
                x = gap + c * (tile + gap)
                img = ImageOps.contain(img, (tile, tile), Image.LANCZOS)
                sheet.paste(img, (x + (tile - img.width) // 2, y + (tile - img.height) // 2))
                draw.rectangle([x, y, x + tile - 1, y + tile - 1], outline=(180, 170, 160))
                label = label.replace("--", "\n--")
                draw.text((x, y + tile + 3), label, fill=(40, 30, 30), font=font)
        path = SHEET_DIR / ("sheet-%02d.jpg" % number)
        sheet.save(path, quality=82)
        paths.append(path)
        print("%s  %d items  %.2f MB" % (path, len(chunk), path.stat().st_size / 1e6))
    print("%d items on %d sheets" % (len(rows), len(paths)))


def cmd_annotate(args):
    html = read_index()
    order = [n.lower() for n, _ in PALETTE]

    def rewrite(match):
        tag = match.group(0)
        if "data-lightbox-target" in tag:
            return tag
        tag = ATTR_RE.sub("", tag)
        href = HREF_RE.search(tag)
        if not href:
            return tag
        stem = Path(re.split(r"[?#]", href.group(1))[0]).stem
        names = sorted((p.stem.split("--")[1] for p in OUT_DIR.glob(stem + "--*.webp")), key=order.index)
        if not names:
            return tag
        attr = ' data-colour-options="%s"' % " ".join(n.capitalize() for n in names)
        return tag[:href.start()].rstrip() + attr + " " + tag[href.start():]

    updated = TRIGGER_RE.sub(rewrite, html)
    if updated != html:
        INDEX.write_text(updated, encoding="utf-8")
    print("data-colour-options on %d triggers" % updated.count("data-colour-options="))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    for name, fn in (("generate", cmd_generate), ("sheet", cmd_sheet), ("annotate", cmd_annotate)):
        command = sub.add_parser(name)
        command.set_defaults(fn=fn)
        if name == "generate":
            command.add_argument("stems", nargs="*", help="photo file names without extension; default is every card photo")
    args = parser.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
