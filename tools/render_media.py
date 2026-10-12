#!/usr/bin/env python3
"""Renders the README animations, the filmstrip frames and the social card from the real library.

Needs: python3, playwright (with chromium), pillow, ffmpeg.
    pip install playwright pillow && playwright install chromium
    python3 tools/render_media.py

Output goes to site/assets/. The renderer is the library itself (dist/boot-effect.js) running in
headless Chromium, so the media always matches the shipped effect.
"""
import base64
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT / "dist" / "boot-effect.js"
PHOTO = ROOT / "site" / "assets" / "lake.jpg"
ASSETS = ROOT / "site" / "assets"
FONT = Path("/usr/share/fonts/truetype/google-fonts/Lora-Variable.ttf")

FRAMES = 250
FILMSTRIP = [0, 40, 90, 130, 152, 190, 205, 212, 217, 244]
CHROMIUM_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

PAGE = """<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:#000}#stage{width:%dpx;height:%dpx}</style>
<div id="stage"></div><script src="%s"></script>"""


def render(width, height, frames, extra=None):
    """Yields (frame, PIL image) for each requested frame, rendered at width x height device pixels."""
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
        page_file = Path(tmp) / "page.html"
        page_file.write_text(PAGE % (width, height, LIB.as_uri()))
        browser = p.chromium.launch(args=CHROMIUM_ARGS)
        page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
        page.goto(page_file.as_uri())
        photo = "data:image/jpeg;base64," + base64.b64encode(PHOTO.read_bytes()).decode()
        page.evaluate(
            """([photo, sky]) => new Promise((resolve, reject) => {
                window.fx = new BootEffect(document.getElementById('stage'), {
                  photo, sky, autoplay: false, layout: { position: 'relative', width: '100%', height: '100%' },
                  onReady: resolve, onError: (e) => reject(e.message)
                });
              })""",
            [photo, {"mode": "warm", "horizon": 0.49}],
        )
        if extra:
            extra(page)
        for f in frames:
            url = page.evaluate("(f) => { fx.seek(f); return fx.snapshot('image/jpeg', 0.95); }", f)
            yield f, Image.open(__import__("io").BytesIO(base64.b64decode(url.split(",")[1]))).convert("RGB")
        browser.close()


def write_gif(frame_dir, out, fps, width, hold_start=0.5, hold_end=1.6):
    """Palette-optimised GIF from numbered JPEGs."""
    palette = frame_dir / "palette.png"
    pad = f"tpad=start_mode=clone:start_duration={hold_start}:stop_mode=clone:stop_duration={hold_end}"
    scale = f"scale={width}:-1:flags=lanczos"
    src = ["-framerate", str(fps), "-i", str(frame_dir / "%03d.jpg")]
    subprocess.run(["ffmpeg", "-y", "-v", "error", *src, "-vf", f"{scale},{pad},palettegen=max_colors=256:stats_mode=diff", str(palette)], check=True)
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", *src, "-i", str(palette), "-lavfi",
         f"{scale},{pad}[x];[x][1:v]paletteuse=dither=sierra2_4a:diff_mode=rectangle", "-loop", "0", str(out)],
        check=True,
    )


def animation(name, width, height, gif_width, step):
    out_dir = ASSETS / "media"
    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        frame_dir = Path(tmp)
        n = 0
        for f, img in render(width, height, range(0, FRAMES, step)):
            img.resize((gif_width, round(gif_width * height / width)), Image.LANCZOS).save(frame_dir / f"{n:03d}.jpg", quality=96)
            n += 1
        write_gif(frame_dir, out_dir / name, 30 / step, gif_width)
    print("wrote", out_dir / name, round((out_dir / name).stat().st_size / 1e6, 2), "MB")


def filmstrip():
    out = ASSETS / "frames"
    out.mkdir(parents=True, exist_ok=True)
    for f, img in render(1440, 810, FILMSTRIP):
        img.resize((960, 540), Image.LANCZOS).save(out / f"{f:03d}.jpg", quality=88, optimize=True, progressive=True)
    print("wrote", len(FILMSTRIP), "filmstrip frames")


def sky_mask():
    """The analysis mask drawn over the photo: what the detector believes is sky."""
    holder = {}

    def grab(page):
        holder["data"] = page.evaluate(
            """() => { const a = fx.analysis(), m = a.mask, out = [];
                       for (let i = 0; i < m.width * m.height; i++) out.push(m.data[i * 4]);
                       return { w: m.width, h: m.height, px: out, centre: a.centre, radius: a.radius, mode: a.mode }; }"""
        )

    next(iter(render(1280, 720, [0], extra=grab)), None)  # runs the page once
    d = holder["data"]
    mask = Image.frombytes("L", (d["w"], d["h"]), bytes(d["px"]))
    photo = Image.open(ASSETS / "lake.jpg").convert("RGB").resize((1280, 720), Image.LANCZOS)
    m = mask.resize((1280, 720), Image.LANCZOS)
    tint = Image.new("RGB", photo.size, (20, 60, 255))
    shaded = Image.composite(Image.blend(photo, tint, 0.62), Image.blend(photo, Image.new("RGB", photo.size, (0, 0, 0)), 0.45), m)
    draw = ImageDraw.Draw(shaded)
    cx, cy = d["centre"][0] * 1280, d["centre"][1] * 720
    r = d["radius"] * 1280
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255), width=3)
    draw.line([cx - 9, cy, cx + 9, cy], fill=(255, 255, 255), width=3)
    draw.line([cx, cy - 9, cx, cy + 9], fill=(255, 255, 255), width=3)
    shaded.resize((960, 540), Image.LANCZOS).save(ASSETS / "frames" / "sky-mask.jpg", quality=88, optimize=True, progressive=True)
    print("wrote sky-mask.jpg", d["mode"])


def social_card():
    (frame_img,) = [img for _, img in render(2400, 1260, [100])]
    card = frame_img.resize((1200, 630), Image.LANCZOS).convert("RGB")
    shade = Image.new("L", card.size, 0)
    sd = ImageDraw.Draw(shade)
    for x in range(card.width):
        sd.line([x, 0, x, card.height], fill=int(max(0, 1 - x / 760) ** 1.6 * 205))
    card = Image.composite(Image.new("RGB", card.size, (6, 10, 14)), card, shade)

    def serif(size, weight):
        f = ImageFont.truetype(str(FONT), size)
        f.set_variation_by_axes([weight])
        return f

    d = ImageDraw.Draw(card)
    d.text((64, 372), "boot-effect", font=serif(104, 700), fill=(247, 244, 252))
    d.text((68, 500), "A procedural boot intro for any photograph.", font=serif(30, 400), fill=(222, 218, 232))
    d.text((68, 548), "One image  /  one WebGL shader  /  no dependencies", font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 20), fill=(150, 165, 255))
    card.save(ASSETS / "social-card.png", optimize=True)
    print("wrote social-card.png")


def main():
    if not LIB.exists():
        sys.exit("run `npm run build` first")
    if "--gifs-only" not in sys.argv:
        filmstrip()
        sky_mask()
        social_card()
    animation("boot-effect.gif", 1280, 720, 720, 3)
    animation("boot-effect-phone.gif", 540, 960, 270, 3)


if __name__ == "__main__":
    main()
