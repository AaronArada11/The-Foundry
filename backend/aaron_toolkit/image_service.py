from __future__ import annotations

import io
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

register_heif_opener()

ImageFormat = Literal["jpg", "png", "webp"]
ALLOWED_INPUT_FORMATS = {"JPEG", "PNG", "WEBP", "GIF", "BMP", "TIFF", "HEIF", "AVIF"}
CONTENT_TYPES = {
    "jpg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
}
PIL_FORMATS = {"jpg": "JPEG", "png": "PNG", "webp": "WEBP"}
HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
SAFE_FILENAME = re.compile(r"[^a-zA-Z0-9._-]+")


class ImageValidationError(ValueError):
    pass


@dataclass(frozen=True)
class ImageConversion:
    content: bytes
    filename: str
    content_type: str
    width: int
    height: int


def _safe_output_filename(source_filename: str | None, target: ImageFormat) -> str:
    stem = Path(source_filename or "converted-image").stem
    stem = SAFE_FILENAME.sub("-", stem).strip(".-_")[:100] or "converted-image"
    extension = "jpg" if target == "jpg" else target
    return f"{stem}.{extension}"


def _parse_background(value: str) -> tuple[int, int, int]:
    if not HEX_COLOR.fullmatch(value):
        raise ImageValidationError("Background must be a six-digit hex color.")
    return tuple(int(value[index : index + 2], 16) for index in (1, 3, 5))


def _to_srgb(image: Image.Image) -> Image.Image:
    icc_profile = image.info.get("icc_profile")
    if not icc_profile:
        return image
    try:
        source_profile = ImageCms.ImageCmsProfile(io.BytesIO(icc_profile))
        target_profile = ImageCms.createProfile("sRGB")
        if "A" in image.getbands():
            alpha = image.getchannel("A")
            converted = ImageCms.profileToProfile(
                image.convert("RGB"),
                source_profile,
                target_profile,
                outputMode="RGB",
            )
            converted.putalpha(alpha)
            return converted
        return ImageCms.profileToProfile(
            image,
            source_profile,
            target_profile,
            outputMode="RGB",
        )
    except (OSError, ValueError, ImageCms.PyCMSError):
        return image


def convert_image(
    content: bytes,
    *,
    source_filename: str | None,
    target: ImageFormat,
    quality: int = 85,
    background: str = "#FFFFFF",
    max_bytes: int,
    max_pixels: int,
) -> ImageConversion:
    if not content:
        raise ImageValidationError("Choose an image file to convert.")
    if len(content) > max_bytes:
        size_mb = max_bytes // (1024 * 1024)
        raise ImageValidationError(f"Images must be {size_mb} MB or smaller.")
    if not 1 <= quality <= 95:
        raise ImageValidationError("Quality must be between 1 and 95.")
    background_rgb = _parse_background(background)

    try:
        with Image.open(io.BytesIO(content)) as opened:
            detected_format = (opened.format or "").upper()
            if detected_format not in ALLOWED_INPUT_FORMATS:
                raise ImageValidationError(
                    "Use a JPG, PNG, WebP, GIF, BMP, TIFF, HEIC, or AVIF image."
                )
            if getattr(opened, "n_frames", 1) != 1:
                raise ImageValidationError(
                    "Animated and multi-page images are not supported yet."
                )
            if opened.width * opened.height > max_pixels:
                raise ImageValidationError("Images may contain at most 40 megapixels.")
            opened.load()
            image = ImageOps.exif_transpose(opened)
            image = _to_srgb(image)

            if target == "jpg":
                if "A" in image.getbands() or image.mode == "P":
                    rgba = image.convert("RGBA")
                    flattened = Image.new("RGB", rgba.size, background_rgb)
                    flattened.paste(rgba, mask=rgba.getchannel("A"))
                    image = flattened
                else:
                    image = image.convert("RGB")
            elif target in {"png", "webp"}:
                image = image.convert("RGBA" if "A" in image.getbands() else "RGB")

            output = io.BytesIO()
            save_options: dict[str, object] = {"format": PIL_FORMATS[target]}
            if target in {"jpg", "webp"}:
                save_options.update({"quality": quality, "optimize": True})
            elif target == "png":
                save_options["optimize"] = True
            image.save(output, **save_options)
            return ImageConversion(
                content=output.getvalue(),
                filename=_safe_output_filename(source_filename, target),
                content_type=CONTENT_TYPES[target],
                width=image.width,
                height=image.height,
            )
    except ImageValidationError:
        raise
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError, ValueError) as error:
        raise ImageValidationError(
            "The file is not a supported image or is damaged."
        ) from error
