#!/usr/bin/env python3
"""Generate Threshold's PWA icons (a door with speech waves) as PNGs, using only the standard library.

  python scripts/make_icons.py   -> web/public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png
"""

import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "web" / "public" / "icons"
NAVY, WHITE, AMBER = (11, 31, 51), (241, 245, 249), (251, 191, 36)


def png(size: int, pixels) -> bytes:
    raw = b"".join(b"\x00" + bytes(c for px in row for c in px) for row in pixels)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def draw(size: int, safe: float) -> list[list[tuple[int, int, int]]]:
    """safe: fraction of the canvas the artwork may use (maskable icons need a smaller safe zone)."""
    s = size * safe
    o = (size - s) / 2
    px = [[NAVY] * size for _ in range(size)]

    def rect(x0, y0, x1, y1, color):
        for y in range(int(o + y0 * s), int(o + y1 * s)):
            for x in range(int(o + x0 * s), int(o + x1 * s)):
                px[y][x] = color

    rect(0.22, 0.18, 0.56, 0.84, WHITE)  # door
    rect(0.26, 0.23, 0.52, 0.84, NAVY)  # door panel opening
    rect(0.28, 0.25, 0.50, 0.84, WHITE)  # closed door leaf
    rect(0.44, 0.52, 0.48, 0.57, NAVY)  # handle
    for i, (top, bottom) in enumerate([(0.42, 0.62), (0.35, 0.69), (0.28, 0.76)]):  # speech waves
        x = 0.64 + i * 0.09
        rect(x, top, x + 0.045, bottom, AMBER)
    return px


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size, safe in [
        ("icon-192.png", 192, 0.9),
        ("icon-512.png", 512, 0.9),
        ("maskable-512.png", 512, 0.7),
        ("apple-touch-icon.png", 180, 0.85),
    ]:
        (OUT / name).write_bytes(png(size, draw(size, safe)))
        print(f"wrote {OUT / name}")


if __name__ == "__main__":
    main()
