#!/usr/bin/env python3
"""Writes the mock "S3" flavor images to assets/flavors/ (stdlib only; IMG-01).

Each image is a transparent RGBA PNG of a shaker cup in the flavor's colour. White bands
on the cup show the version (1 band = the ...a file, 2 bands = the v2 file), so a
screenshot tells the versions and the bundled images apart. Also writes a heavily padded
image (proves the trim), a corrupt file and one too wide for the app's pixel limit.

Usage: python3 mockserver/make_flavor_images.py [--out DIR]
"""
import argparse
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.join(HERE, "assets", "flavors")

COLOURS = {
    "prymor_guava": (236, 90, 110),
    "mmn_chocolate": (110, 70, 50),
    "prymor_electro": (60, 190, 220),
    "on_vanilla": (235, 215, 160),
    "prymor_cookie": (150, 130, 110),
    "beast_coffee": (80, 55, 40),
}
BAND = (255, 255, 255, 235)
# Band rows as fractions of the cup's height: v1 uses the first, v2 both.
BANDS = ((0.45, 0.50), (0.58, 0.63))


def png(width, height, rows):
    """rows: bytes-like RGBA scanlines."""
    raw = b"".join(b"\x00" + bytes(row) for row in rows)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def cup_rows(width, height, box, colour, bands):
    """A cup whose bounding box is exactly box = (x, y, w, h) on a transparent canvas."""
    bx, by, bw, bh = box
    lid = tuple(int(c * 0.7) for c in colour) + (255,)
    body = tuple(colour) + (255,)
    rows = []
    for y in range(height):
        row = bytearray(width * 4)
        v = (y - by) / float(bh)
        if 0 <= y - by < bh:
            if v < 0.09:        # cap
                spans = [(0.33, 0.67, lid)]
            elif v < 0.18:      # lid
                spans = [(0.0, 1.0, lid)]
            else:               # body, narrowing towards the bottom
                t = (v - 0.18) / 0.82
                inset = 0.02 + 0.11 * t
                fill = BAND if any(a <= v < b for a, b in BANDS[:bands]) else body
                spans = [(inset, 1.0 - inset, fill)]
            for x0, x1, rgba in spans:
                start = bx + int(round(x0 * bw))
                end = bx + int(round(x1 * bw))
                row[start * 4:end * 4] = bytes(rgba) * (end - start)
        rows.append(row)
    return rows


def cup_png(width, height, box, colour, bands):
    return png(width, height, cup_rows(width, height, box, colour, bands))


def images():
    """{file name: bytes} for every mock image."""
    out = {}
    for stem, colour in COLOURS.items():
        if stem == "prymor_cookie":
            continue
        out[stem + "-20260926a.png"] = cup_png(600, 800, (0, 0, 600, 800), colour, 1)
    out["prymor_guava-20260927a.png"] = cup_png(600, 800, (0, 0, 600, 800), COLOURS["prymor_guava"], 2)
    # Heavily padded: a 300 x 400 cup in the middle of 1600 x 2000.
    out["prymor_cookie-20260926a.png"] = cup_png(1600, 2000, (650, 800, 300, 400), COLOURS["prymor_cookie"], 1)
    # Corrupt: a PNG signature followed by junk.
    out["broken-20260926a.png"] = b"\x89PNG\r\n\x1a\n" + b"this is not a png image. " * 8
    # Wider than the app's 2048 px limit, but a tiny file.
    out["too_wide-20260926a.png"] = png(2100, 60, [bytes((200, 60, 60, 255)) * 2100] * 60)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default=DEFAULT_OUT)
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)
    for name, data in sorted(images().items()):
        with open(os.path.join(args.out, name), "wb") as f:
            f.write(data)
        print("wrote %s (%d bytes)" % (os.path.join(args.out, name), len(data)))


if __name__ == "__main__":
    main()
