"""Generate PWA icons at 192x192 and 512x512."""
from PIL import Image, ImageDraw
import os

out_dir = "apps/web/public/icons"
os.makedirs(out_dir, exist_ok=True)

def make_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    r = size // 2
    draw.ellipse([0, 0, size-1, size-1], fill="#7c3aed")

    # Lightning bolt
    s = size / 64
    bolt = [
        (36*s, 4*s), (20*s, 34*s), (32*s, 34*s),
        (28*s, 60*s), (48*s, 28*s), (36*s, 28*s), (46*s, 4*s),
    ]
    draw.polygon(bolt, fill="white")
    return img

for sz in [192, 512]:
    path = f"{out_dir}/icon-{sz}.png"
    make_icon(sz).save(path)
    print(f"Saved {path}")

print("PWA icons done.")
