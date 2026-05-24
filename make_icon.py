"""Generate NexusOS.ico — a purple lightning bolt on dark background."""
from PIL import Image, ImageDraw, ImageFont
import os

def make_icon():
    sizes = [256, 128, 64, 48, 32, 16]
    frames = []

    for size in sizes:
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        pad = max(2, size // 16)
        r = size // 8

        # Dark background with rounded corners
        draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=r, fill=(12, 12, 28, 255))

        # Purple glow gradient effect (outer ring)
        glow_pad = pad + max(1, size // 32)
        draw.rounded_rectangle(
            [glow_pad, glow_pad, size - glow_pad, size - glow_pad],
            radius=r - 2,
            outline=(124, 58, 237, 80),
            width=max(1, size // 40),
        )

        # Lightning bolt shape (scaled to size)
        cx = size / 2
        cy = size / 2
        s = size * 0.30

        bolt = [
            (cx + s * 0.15,  cy - s * 0.95),   # top-right
            (cx - s * 0.05,  cy - s * 0.05),   # mid-left
            (cx + s * 0.25,  cy - s * 0.05),   # mid-right
            (cx - s * 0.15,  cy + s * 0.95),   # bottom-left
            (cx + s * 0.05,  cy + s * 0.05),   # mid-right-bottom
            (cx - s * 0.20,  cy + s * 0.05),   # mid-left-bottom
        ]

        # Glow layer (larger, dimmer)
        glow_bolt = [(x + 1, y + 1) for x, y in bolt]
        draw.polygon(glow_bolt, fill=(167, 139, 250, 60))

        # Main bolt — violet to purple gradient effect via two overlapping fills
        draw.polygon(bolt, fill=(139, 92, 246, 255))   # base violet
        # Highlight (top half)
        highlight = [
            (cx + s * 0.15,  cy - s * 0.95),
            (cx - s * 0.05,  cy - s * 0.05),
            (cx + s * 0.25,  cy - s * 0.05),
            (cx + s * 0.10,  cy - s * 0.50),
        ]
        draw.polygon(highlight, fill=(196, 181, 253, 120))

        frames.append(img)

    out = os.path.join(os.path.dirname(__file__), "NexusOS.ico")
    frames[0].save(out, format="ICO", sizes=[(s, s) for s in sizes], append_images=frames[1:])
    print(f"Icon saved: {out}")
    return out

if __name__ == "__main__":
    make_icon()
