"""
Build the lightweight frame sequences used by the home hero on iPhone / iPad.

Why: iOS Safari is unreliable at scrubbing a <video> by scroll (it may refuse to
load it, or not repaint after a seek), so on iOS the hero draws image frames on
a canvas instead. The source frames are 2160x3836 / 3976x2084 — far too large
to decode 160 of them on a phone — so this writes resized copies:

  public/hero-frames/m/000.webp … 159.webp   (portrait, 720 px wide)
  public/hero-frames/d/000.webp … 159.webp   (landscape, 1600 px wide)

Frame order comes from lib/homeHeroScrollMobileFrames.ts and
lib/homeHeroScrollFrames.ts (the same order the hero videos were made from).

Usage (from the project root):  python scripts/build-hero-frames.py
"""
import os
import re
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SETS = [
    # (frame list file, output folder, target width, webp quality)
    ("lib/homeHeroScrollMobileFrames.ts", "public/hero-frames/m", 720, 70),
    ("lib/homeHeroScrollFrames.ts", "public/hero-frames/d", 1600, 72),
]


def frame_paths(list_file: str) -> list[str]:
    text = open(os.path.join(ROOT, list_file), encoding="utf8").read()
    return re.findall(r"'(/[^']+\.webp)'", text)


for list_file, out_dir, width, quality in SETS:
    paths = frame_paths(list_file)
    out_abs = os.path.join(ROOT, out_dir)
    os.makedirs(out_abs, exist_ok=True)
    total = 0
    for i, rel in enumerate(paths):
        src = os.path.join(ROOT, "public", rel.lstrip("/"))
        with Image.open(src) as im:
            im = im.convert("RGB")
            height = round(im.height * width / im.width)
            im = im.resize((width, height), Image.LANCZOS)
            dst = os.path.join(out_abs, f"{i:03d}.webp")
            im.save(dst, "WEBP", quality=quality, method=6)
            total += os.path.getsize(dst)
    print(f"{out_dir}: {len(paths)} frames, {width}px wide, {total / 1048576:.1f} MB total")
