from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

PROJECT_ROOT = Path(__file__).resolve().parents[2]
APP_ROOT = PROJECT_ROOT / "VigilVid"
APP_IMAGES = APP_ROOT / "assets" / "images"
APP_BRAND = APP_ROOT / "assets" / "brand"
WEB_ASSETS = PROJECT_ROOT / "web" / "assets"

INK = "#0B1F24"
BACKGROUND = "#F7FBF8"
PRIMARY = "#0E7C73"
PRIMARY_DARK = "#075E58"
SIGNAL_AQUA = "#22C7A9"

SOURCE_ICON = APP_BRAND / "vigilvid-owl-mark-source.png"


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def mix(
    first: tuple[int, int, int],
    second: tuple[int, int, int],
    amount: float,
) -> tuple[int, int, int]:
    return tuple(
        int(round(first[index] + (second[index] - first[index]) * amount))
        for index in range(3)
    )


def gradient_square(size: int) -> Image.Image:
    top_left = hex_to_rgb(PRIMARY_DARK)
    center = hex_to_rgb(PRIMARY)
    bottom_right = hex_to_rgb(SIGNAL_AQUA)
    image = Image.new("RGBA", (size, size), top_left + (255,))
    pixels = image.load()

    for y in range(size):
        for x in range(size):
            diagonal = (x + y) / (2 * (size - 1))
            if diagonal < 0.62:
                color = mix(top_left, center, diagonal / 0.62)
            else:
                color = mix(center, bottom_right, (diagonal - 0.62) / 0.38)
            pixels[x, y] = color + (255,)

    return image


def is_canvas_pixel(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 0 and red >= 232 and green >= 232 and blue >= 232


def get_border_canvas_mask(image: Image.Image) -> Image.Image:
    width, height = image.size
    pixels = image.load()
    mask = Image.new("L", image.size, 0)
    mask_pixels = mask.load()
    seen = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def add_seed(x: int, y: int) -> None:
        index = y * width + x
        if seen[index]:
            return

        seen[index] = 1
        if is_canvas_pixel(pixels[x, y]):
            mask_pixels[x, y] = 255
            queue.append((x, y))

    for x in range(width):
        add_seed(x, 0)
        add_seed(x, height - 1)

    for y in range(height):
        add_seed(0, y)
        add_seed(width - 1, y)

    while queue:
        x, y = queue.popleft()
        for next_x, next_y in (
            (x - 1, y),
            (x + 1, y),
            (x, y - 1),
            (x, y + 1),
        ):
            if next_x < 0 or next_y < 0 or next_x >= width or next_y >= height:
                continue

            index = next_y * width + next_x
            if seen[index]:
                continue

            seen[index] = 1
            if is_canvas_pixel(pixels[next_x, next_y]):
                mask_pixels[next_x, next_y] = 255
                queue.append((next_x, next_y))

    return mask


def load_clean_source() -> Image.Image:
    if not SOURCE_ICON.exists():
        raise FileNotFoundError(
            f"Missing source logo image: {SOURCE_ICON}. "
            "Save the approved owl logo PNG there before running this script."
        )

    source = Image.open(SOURCE_ICON).convert("RGBA")
    background = Image.new("RGBA", source.size, hex_to_rgb(PRIMARY_DARK) + (255,))
    corner_mask = get_border_canvas_mask(source).filter(ImageFilter.MaxFilter(7))
    return Image.composite(background, source, corner_mask)


def fit_icon(source: Image.Image, size: int) -> Image.Image:
    return ImageOps.fit(
        source,
        (size, size),
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )


def make_monochrome(size: int) -> Image.Image:
    icon = fit_icon(Image.open(SOURCE_ICON).convert("RGBA"), size)
    grayscale = ImageOps.grayscale(icon)
    mask = grayscale.point(lambda value: 255 if value >= 118 else 0)
    mask.paste(0, mask=get_border_canvas_mask(icon))
    result = Image.new("RGBA", icon.size, (255, 255, 255, 0))
    result.putalpha(mask)
    return result


def save_image(image: Image.Image, path: Path, *, rgb: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if rgb:
        output = Image.new("RGB", image.size, hex_to_rgb(BACKGROUND))
        output.paste(image.convert("RGBA"), mask=image.convert("RGBA").getchannel("A"))
    else:
        output = image
    output.save(path)


def write_svg_assets() -> None:
    mark_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-labelledby="title desc">
  <title id="title">VigilVid mark</title>
  <desc id="desc">A minimalist owl guardian with a magnifying glass eye.</desc>
  <image href="vigilvid-owl-mark.png" width="1024" height="1024" preserveAspectRatio="xMidYMid slice"/>
</svg>
"""

    wordmark_svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 160" role="img" aria-labelledby="title desc">
  <title id="title">VigilVid logo</title>
  <desc id="desc">VigilVid wordmark with owl guardian mark.</desc>
  <image href="vigilvid-owl-mark.png" x="10" y="10" width="140" height="140" preserveAspectRatio="xMidYMid slice"/>
  <text x="178" y="98" fill="{INK}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="64" font-weight="850">VigilVid</text>
</svg>
"""

    for directory in (APP_BRAND, WEB_ASSETS):
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "vigilvid-mark.svg").write_text(mark_svg, encoding="utf-8")
        (directory / "vigilvid-logo.svg").write_text(wordmark_svg, encoding="utf-8")


def main() -> None:
    source = load_clean_source()
    app_icon = fit_icon(source, 1024)
    adaptive_background = gradient_square(512)
    adaptive_foreground = fit_icon(source, 512)
    monochrome = make_monochrome(432)

    save_image(app_icon, APP_BRAND / "vigilvid-owl-mark.png", rgb=True)
    save_image(app_icon, WEB_ASSETS / "vigilvid-owl-mark.png", rgb=True)

    save_image(app_icon, APP_IMAGES / "icon.png", rgb=True)
    save_image(fit_icon(source, 48), APP_IMAGES / "favicon.png")
    save_image(app_icon, APP_IMAGES / "splash-icon.png")
    save_image(adaptive_background, APP_IMAGES / "android-icon-background.png")
    save_image(adaptive_foreground, APP_IMAGES / "android-icon-foreground.png")
    save_image(monochrome, APP_IMAGES / "android-icon-monochrome.png")

    save_image(app_icon, WEB_ASSETS / "app-icon.png", rgb=True)
    save_image(fit_icon(source, 48), WEB_ASSETS / "favicon.png")

    write_svg_assets()


if __name__ == "__main__":
    main()
