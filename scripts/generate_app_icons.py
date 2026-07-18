#!/usr/bin/env python3
"""Generate square icon.png, icon.ico, and rle_client_logo.png from the brand screenshot."""

from __future__ import annotations

import struct
import sys
from io import BytesIO
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow required: pip install pillow", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SOURCE = ASSETS / "Screenshot 2026-07-14 120627.png"
BACKGROUND = (10, 15, 28, 255)  # #0a0f1c
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]


def square_canvas(src: Image.Image, size: int) -> Image.Image:
    """Letterbox the logo onto a square navy canvas."""
    src = src.convert("RGBA")
    canvas = Image.new("RGBA", (size, size), BACKGROUND)
    max_side = int(size * 0.88)
    fitted = src.copy()
    fitted.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    return canvas


def write_ico(path: Path, images: list[Image.Image]) -> None:
    """Write a proper multi-size ICO (PNG-compressed entries)."""
    entries = []
    payloads = []
    for img in images:
        buf = BytesIO()
        img.save(buf, format="PNG")
        data = buf.getvalue()
        w = 0 if img.width >= 256 else img.width
        h = 0 if img.height >= 256 else img.height
        entries.append((w, h, len(data)))
        payloads.append(data)

    offset = 6 + 16 * len(entries)
    parts = [struct.pack("<HHH", 0, 1, len(entries))]
    for (w, h, size), data in zip(entries, payloads):
        parts.append(struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, size, offset))
        offset += size
    for data in payloads:
        parts.append(data)
    path.write_bytes(b"".join(parts))


def main() -> int:
    if not SOURCE.is_file():
        print(f"Missing logo source: {SOURCE}", file=sys.stderr)
        return 1

    src = Image.open(SOURCE)
    icon_256 = square_canvas(src, 256)
    logo_512 = square_canvas(src, 512)

    icon_png = ASSETS / "icon.png"
    logo_png = ASSETS / "rle_client_logo.png"
    icon_ico = ASSETS / "icon.ico"

    icon_256.save(icon_png, format="PNG")
    logo_512.save(logo_png, format="PNG")
    write_ico(icon_ico, [square_canvas(src, size) for size in ICO_SIZES])

    print(f"Wrote {icon_png}")
    print(f"Wrote {logo_png}")
    print(f"Wrote {icon_ico} ({len(ICO_SIZES)} sizes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
