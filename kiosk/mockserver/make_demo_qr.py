#!/usr/bin/env python3
"""Writes assets/qr_demo.png: a QR-looking placeholder (NOT scannable), stdlib only.
Real, scannable QR images come only from Razorpay."""
import os
import random
import struct
import zlib

MODULES = 29          # QR version 3 grid size
SCALE = 18            # px per module
QUIET = 4             # quiet-zone modules
SIZE = (MODULES + 2 * QUIET) * SCALE  # 666 px


def modules():
    rnd = random.Random(4821)
    grid = [[rnd.random() < 0.5 for _ in range(MODULES)] for _ in range(MODULES)]
    for ox, oy in ((0, 0), (MODULES - 7, 0), (0, MODULES - 7)):
        for y in range(-1, 8):
            for x in range(-1, 8):
                gx, gy = ox + x, oy + y
                if 0 <= gx < MODULES and 0 <= gy < MODULES:
                    ring = max(abs(x - 3), abs(y - 3))
                    grid[gy][gx] = ring in (0, 1, 3) and 0 <= x <= 6 and 0 <= y <= 6
    return grid


def png(pixels_rows, size):
    raw = b"".join(b"\x00" + bytes(row) for row in pixels_rows)
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 0, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def main():
    grid = modules()
    rows = []
    for py in range(SIZE):
        my = py // SCALE - QUIET
        row = []
        for px in range(SIZE):
            mx = px // SCALE - QUIET
            dark = 0 <= mx < MODULES and 0 <= my < MODULES and grid[my][mx]
            row.append(17 if dark else 255)
        rows.append(row)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "qr_demo.png")
    with open(out, "wb") as f:
        f.write(png(rows, SIZE))
    print("wrote", out)


if __name__ == "__main__":
    main()
