from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

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
ANALYSIS_BLUE = "#2563EB"
REWARD_MANGO = "#F6B84B"


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
    bottom_right = hex_to_rgb(SIGNAL_AQUA)
    blue = hex_to_rgb(ANALYSIS_BLUE)
    image = Image.new("RGB", (size, size), top_left)
    pixels = image.load()

    for y in range(size):
        for x in range(size):
            diagonal = (x + y) / (2 * (size - 1))
            color = mix(top_left, bottom_right, diagonal)
            blue_strength = max(0, 1 - ((x - size * 0.72) ** 2 + (y - size * 0.18) ** 2) ** 0.5 / (size * 0.55))
            if blue_strength > 0:
                color = mix(color, blue, blue_strength * 0.26)
            pixels[x, y] = color

    return image.convert("RGBA")


def scaled_points(
    points: list[tuple[float, float]],
    scale: float,
    offset: tuple[float, float] = (0, 0),
) -> list[tuple[int, int]]:
    return [
        (round((x + offset[0]) * scale), round((y + offset[1]) * scale))
        for x, y in points
    ]


def draw_logo_mark(
    image: Image.Image,
    *,
    scale: float,
    include_background_details: bool,
    monochrome: bool = False,
) -> None:
    draw = ImageDraw.Draw(image, "RGBA")

    if include_background_details:
        center = (512 * scale, 508 * scale)
        for radius, alpha in ((228, 44), (392, 34), (560, 24)):
            draw.ellipse(
                [
                    center[0] - radius * scale,
                    center[1] - radius * scale,
                    center[0] + radius * scale,
                    center[1] + radius * scale,
                ],
                outline=(255, 255, 255, alpha),
                width=round(7 * scale),
            )
        draw.line(
            [(166 * scale, 836 * scale), (858 * scale, 170 * scale)],
            fill=(255, 255, 255, 26),
            width=round(9 * scale),
        )

    shield = [
        (512, 190),
        (710, 292),
        (674, 628),
        (512, 798),
        (350, 628),
        (314, 292),
    ]

    shadow_layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow_layer, "RGBA")
    shadow_draw.polygon(
        scaled_points(shield, scale, (0, 18)),
        fill=(4, 31, 35, 62 if not monochrome else 0),
    )
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(round(22 * scale)))
    image.alpha_composite(shadow_layer)

    if monochrome:
        shield_fill = (255, 255, 255, 255)
        outline = (255, 255, 255, 255)
        play_fill = (0, 0, 0, 0)
        dot_fill = (255, 255, 255, 255)
    else:
        shield_fill = (255, 255, 255, 246)
        outline = (216, 251, 243, 225)
        play_fill = hex_to_rgb(PRIMARY_DARK) + (255,)
        dot_fill = hex_to_rgb(REWARD_MANGO) + (255,)

    draw.polygon(scaled_points(shield, scale), fill=shield_fill)
    draw.line(
        scaled_points(shield + [shield[0]], scale),
        fill=outline,
        width=round(13 * scale),
        joint="curve",
    )

    play = [(474, 402), (474, 604), (638, 503)]
    if monochrome:
        draw.polygon(scaled_points(play, scale), fill=(0, 0, 0, 0))
    else:
        draw.rounded_rectangle(
            [
                round(438 * scale),
                round(364 * scale),
                round(680 * scale),
                round(642 * scale),
            ],
            radius=round(44 * scale),
            fill=(14, 124, 115, 28),
        )
        draw.polygon(scaled_points(play, scale), fill=play_fill)

    dot_center = (676 * scale, 330 * scale)
    dot_radius = 48 * scale
    draw.ellipse(
        [
            dot_center[0] - dot_radius,
            dot_center[1] - dot_radius,
            dot_center[0] + dot_radius,
            dot_center[1] + dot_radius,
        ],
        fill=(255, 255, 255, 240 if not monochrome else 0),
    )
    dot_inner = 27 * scale
    draw.ellipse(
        [
            dot_center[0] - dot_inner,
            dot_center[1] - dot_inner,
            dot_center[0] + dot_inner,
            dot_center[1] + dot_inner,
        ],
        fill=dot_fill,
    )


def make_full_icon(size: int) -> Image.Image:
    scale = size / 1024
    image = gradient_square(size)
    draw_logo_mark(image, scale=scale, include_background_details=True)
    return image


def make_adaptive_background(size: int) -> Image.Image:
    image = gradient_square(size)
    draw = ImageDraw.Draw(image, "RGBA")
    center = (size * 0.54, size * 0.5)
    for radius, alpha in ((116, 36), (202, 28), (288, 20)):
        draw.ellipse(
            [
                center[0] - radius,
                center[1] - radius,
                center[0] + radius,
                center[1] + radius,
            ],
            outline=(255, 255, 255, alpha),
            width=max(2, round(size * 0.006)),
        )
    return image


def make_foreground(size: int, monochrome: bool = False) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    scale = size / 1024
    draw_logo_mark(
        image,
        scale=scale,
        include_background_details=False,
        monochrome=monochrome,
    )
    return image


def save_resized(source: Image.Image, path: Path, size: int, *, rgb: bool = False) -> None:
    resized = source.resize((size, size), Image.Resampling.LANCZOS)
    if rgb:
        background = Image.new("RGB", resized.size, hex_to_rgb(BACKGROUND))
        if resized.mode == "RGBA":
            background.paste(resized, mask=resized.getchannel("A"))
        else:
            background.paste(resized)
        resized = background
    resized.save(path)


def write_svg_assets() -> None:
    mark_svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-labelledby="title desc">
  <title id="title">VigilVid mark</title>
  <desc id="desc">A shield with a video play cutout and signal dot.</desc>
  <defs>
    <linearGradient id="tile" x1="120" y1="80" x2="900" y2="940" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="{PRIMARY_DARK}"/>
      <stop offset="0.58" stop-color="{PRIMARY}"/>
      <stop offset="1" stop-color="{SIGNAL_AQUA}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#tile)"/>
  <circle cx="532" cy="508" r="228" fill="none" stroke="#FFFFFF" stroke-opacity=".18" stroke-width="7"/>
  <circle cx="532" cy="508" r="392" fill="none" stroke="#FFFFFF" stroke-opacity=".13" stroke-width="7"/>
  <circle cx="532" cy="508" r="560" fill="none" stroke="#FFFFFF" stroke-opacity=".09" stroke-width="7"/>
  <path d="M512 190 710 292 674 628 512 798 350 628 314 292Z" fill="#FFFFFF" fill-opacity=".96" stroke="#D8FBF3" stroke-width="13"/>
  <rect x="438" y="364" width="242" height="278" rx="44" fill="{PRIMARY}" fill-opacity=".11"/>
  <path d="M474 402v202l164-101Z" fill="{PRIMARY_DARK}"/>
  <circle cx="676" cy="330" r="48" fill="#FFFFFF" fill-opacity=".94"/>
  <circle cx="676" cy="330" r="27" fill="{REWARD_MANGO}"/>
</svg>
"""

    wordmark_svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 160" role="img" aria-labelledby="title desc">
  <title id="title">VigilVid logo</title>
  <desc id="desc">VigilVid wordmark with shield video signal mark.</desc>
  <defs>
    <linearGradient id="tile" x1="14" y1="10" x2="126" y2="138" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="{PRIMARY_DARK}"/>
      <stop offset=".62" stop-color="{PRIMARY}"/>
      <stop offset="1" stop-color="{SIGNAL_AQUA}"/>
    </linearGradient>
  </defs>
  <rect x="10" y="10" width="140" height="140" rx="34" fill="url(#tile)"/>
  <circle cx="82" cy="80" r="34" fill="none" stroke="#FFFFFF" stroke-opacity=".18" stroke-width="3"/>
  <path d="M80 36 112 52 106 100 80 126 54 100 48 52Z" fill="#FFFFFF" fill-opacity=".96" stroke="#D8FBF3" stroke-width="3"/>
  <path d="M74 64v34l28-17Z" fill="{PRIMARY_DARK}"/>
  <circle cx="108" cy="58" r="11" fill="{REWARD_MANGO}"/>
  <text x="178" y="98" fill="{INK}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="64" font-weight="850" letter-spacing="-2">VigilVid</text>
</svg>
"""

    for directory in (APP_BRAND, WEB_ASSETS):
        directory.mkdir(parents=True, exist_ok=True)

    (APP_BRAND / "vigilvid-mark.svg").write_text(mark_svg, encoding="utf-8")
    (APP_BRAND / "vigilvid-logo.svg").write_text(wordmark_svg, encoding="utf-8")
    (WEB_ASSETS / "vigilvid-mark.svg").write_text(mark_svg, encoding="utf-8")
    (WEB_ASSETS / "vigilvid-logo.svg").write_text(wordmark_svg, encoding="utf-8")


def main() -> None:
    APP_IMAGES.mkdir(parents=True, exist_ok=True)
    WEB_ASSETS.mkdir(parents=True, exist_ok=True)

    icon = make_full_icon(1024)
    adaptive_background = make_adaptive_background(512)
    adaptive_foreground = make_foreground(512)
    monochrome = make_foreground(432, monochrome=True)

    save_resized(icon, APP_IMAGES / "icon.png", 1024, rgb=True)
    save_resized(icon, APP_IMAGES / "favicon.png", 48)
    save_resized(icon, APP_IMAGES / "splash-icon.png", 1024)
    save_resized(adaptive_background, APP_IMAGES / "android-icon-background.png", 512)
    save_resized(adaptive_foreground, APP_IMAGES / "android-icon-foreground.png", 512)
    save_resized(monochrome, APP_IMAGES / "android-icon-monochrome.png", 432)

    save_resized(icon, WEB_ASSETS / "app-icon.png", 1024, rgb=True)
    save_resized(icon, WEB_ASSETS / "favicon.png", 48)

    write_svg_assets()


if __name__ == "__main__":
    main()
