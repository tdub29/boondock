"""Bake the MapLibre sprite sheet used by the "Paper" vector basemap.

MapLibre cannot scatter point symbols inside a polygon, so the hand-drawn conifers
over forest are a seamless `fill-pattern` tile instead. This script draws that tile
at 4x and downsamples it, which is what gives the strokes their soft inked edge.

Outputs (all committed, this script only needs re-running if the look changes):

    web/public/paper-sprite.png        64x64, pixelRatio 1
    web/public/paper-sprite.json
    web/public/paper-sprite@2x.png     128x128, pixelRatio 2
    web/public/paper-sprite@2x.json

Run with the plain `python` on PATH (Pillow only, no project venv):

    python web/scripts/make-paper-sprite.py
"""

from __future__ import annotations

import json
import random
from pathlib import Path

from PIL import Image, ImageDraw

OUT_DIR = Path(__file__).resolve().parent.parent / "public"
NAME = "paper-sprite"
ICON = "paper-trees"

TILE = 64  # css pixels, the pattern repeat
SS = 8  # supersample factor while drawing

# Warm, desaturated inks. Two greens so a stand does not read as one flat stamp.
INKS = [(94, 111, 78), (110, 127, 92), (83, 99, 69)]
TRUNK = (122, 96, 70)

# Hand-placed so the scatter looks drawn, not gridded. (x, y, height, ink index).
# Coordinates are in tile space; anything crossing an edge is redrawn wrapped.
TREES = [
    (9, 14, 13, 0),
    (26, 8, 10, 1),
    (43, 17, 12, 2),
    (57, 7, 11, 1),
    (17, 33, 11, 2),
    (36, 30, 13, 0),
    (52, 38, 10, 1),
    (6, 47, 12, 1),
    (28, 52, 11, 0),
    (46, 58, 12, 2),
    (61, 48, 10, 0),
]


def draw_conifer(d: ImageDraw.ImageDraw, rng: random.Random, x: float, y: float, h: float, ink) -> None:
    """One small conifer whose apex sits at (x, y - h) and base at (x, y)."""
    half = h * 0.36
    trunk_w = max(1.0, h * 0.075)
    d.line([(x, y), (x, y - h * 0.28)], fill=TRUNK, width=int(round(trunk_w)))

    # Four stacked boughs, each a shallow V that gets wider toward the ground.
    tiers = 4
    stroke = max(1.0, h * 0.095)
    for i in range(tiers):
        t = (i + 1) / tiers
        wy = y - h + h * 0.78 * t
        ww = half * (0.28 + 0.72 * t)
        jx = rng.uniform(-h * 0.035, h * 0.035)
        jy = rng.uniform(-h * 0.03, h * 0.03)
        d.line(
            [
                (x - ww + jx, wy + ww * 0.42 + jy),
                (x + jx * 0.4, wy - h * 0.07 + jy),
                (x + ww + jx, wy + ww * 0.42 + jy),
            ],
            fill=ink,
            width=int(round(stroke)),
            joint="curve",
        )


def render(scale: int) -> Image.Image:
    size = TILE * scale
    canvas = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    rng = random.Random(4207)  # fixed, so a re-run reproduces the committed png

    for x, y, h, ink_i in TREES:
        ink = INKS[ink_i]
        # Wrap every tree through the eight neighbouring tiles so the pattern is
        # seamless: a conifer clipped by the right edge reappears on the left.
        for dx in (-TILE, 0, TILE):
            for dy in (-TILE, 0, TILE):
                draw_conifer(
                    d,
                    random.Random(rng.random()),
                    (x + dx) * scale * SS,
                    (y + dy) * scale * SS,
                    h * scale * SS,
                    ink,
                )

    return canvas.resize((size, size), Image.LANCZOS)


def write(scale: int) -> None:
    suffix = "" if scale == 1 else f"@{scale}x"
    img = render(scale)
    img.save(OUT_DIR / f"{NAME}{suffix}.png")
    meta = {
        ICON: {
            "width": TILE * scale,
            "height": TILE * scale,
            "x": 0,
            "y": 0,
            "pixelRatio": scale,
        }
    }
    (OUT_DIR / f"{NAME}{suffix}.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {NAME}{suffix}.png ({TILE * scale}px) + {NAME}{suffix}.json")


if __name__ == "__main__":
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    write(1)
    write(2)
