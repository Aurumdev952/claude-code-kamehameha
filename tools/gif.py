"""Turns tools/record.ts output into README art.

    python3 tools/gif.py <frames-dir> gif <out.gif> [zoom] [from-s] [to-s]
    python3 tools/gif.py <frames-dir> sheet <out.png> [zoom]
"""
import json
import sys

from PIL import Image, ImageDraw, ImageFont


def load(src):
    meta = json.load(open(f"{src}/meta.json"))
    w, h = meta["w"], meta["h"]
    raw = open(f"{src}/frames.rgb", "rb").read()
    size = w * h * 3
    frames = [Image.frombytes("RGB", (w, h), raw[i * size:(i + 1) * size]) for i in range(meta["count"])]
    return meta, frames


def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def hud(img, pct, zoom):
    w, h = img.size
    strip = 40
    out = Image.new("RGB", (w * zoom, h * zoom + strip), (13, 17, 23))
    out.paste(img.resize((w * zoom, h * zoom), Image.NEAREST), (0, 0))
    d = ImageDraw.Draw(out)
    col = (255, 59, 59) if pct >= 95 else (255, 210, 63) if pct >= 75 else (60, 202, 255)
    x0, x1, y = 14, w * zoom - 150, h * zoom + 13
    d.rectangle([x0, y, x1, y + 14], outline=(70, 80, 100))
    d.rectangle([x0 + 2, y + 2, x0 + 2 + int((x1 - x0 - 4) * min(pct, 100) / 100), y + 12], fill=col)
    d.text((x1 + 12, y - 3), f"context {pct}%", fill=col, font=font(18))
    return out


def gif(src, dst, zoom, start=0.0, end=1e9):
    meta, frames = load(src)
    step = 2 if meta["fps"] >= 30 else 1
    fps = meta["fps"]
    picked = [(f, l) for i, (f, l) in enumerate(zip(frames, meta["labels"])) if i % step == 0 and start <= i / fps < end]
    out = [hud(f, int(l), zoom).convert("P", palette=Image.ADAPTIVE, colors=160) for f, l in picked]
    dur = int(1000 / meta["fps"] * step)
    out[0].save(dst, save_all=True, append_images=out[1:], duration=dur, loop=0, optimize=True, disposal=2)


def sheet(src, dst, zoom):
    meta, frames = load(src)
    cols = 3
    w, h = frames[0].size
    pad, label = 12, 28
    rows = (len(frames) + cols - 1) // cols
    out = Image.new("RGB", (cols * (w * zoom + pad) + pad, rows * (h * zoom + label + pad) + pad), (13, 17, 23))
    d = ImageDraw.Draw(out)
    for i, (f, l) in enumerate(zip(frames, meta["labels"])):
        x = pad + (i % cols) * (w * zoom + pad)
        y = pad + (i // cols) * (h * zoom + label + pad)
        out.paste(f.resize((w * zoom, h * zoom), Image.NEAREST), (x, y))
        d.text((x + 4, y + h * zoom + 5), l, fill=(159, 243, 255), font=font(16))
    out.save(dst)


if __name__ == "__main__":
    src, mode, dst = sys.argv[1], sys.argv[2], sys.argv[3]
    zoom = int(sys.argv[4]) if len(sys.argv) > 4 else 6
    if mode == "gif":
        span = [float(a) for a in sys.argv[5:7]]
        gif(src, dst, zoom, *span)
    else:
        sheet(src, dst, zoom)
