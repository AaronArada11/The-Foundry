from __future__ import annotations

import io
import re
from dataclasses import dataclass
from urllib.parse import urlparse

import qrcode

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
SAFE_FILENAME = re.compile(r"[^a-zA-Z0-9._-]+")


class QRValidationError(ValueError):
    pass


def validate_web_link(value: str) -> str:
    link = value.strip()
    if len(link) > 2048:
        raise QRValidationError("Link must be 2,048 characters or fewer.")
    parsed = urlparse(link)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise QRValidationError("Enter a complete public link beginning with http:// or https://.")
    return link


def validate_hex_color(value: str, label: str) -> str:
    if not HEX_COLOR.fullmatch(value):
        raise QRValidationError(f"{label} must be a six-digit hex color.")
    return value.upper()


def sanitize_filename(value: str | None, link: str) -> str:
    candidate = value.strip() if value else urlparse(link).hostname or "link"
    candidate = SAFE_FILENAME.sub("-", candidate).strip(".-_")[:80] or "link"
    if candidate.lower().endswith(".png"):
        candidate = candidate[:-4]
    return f"{candidate}-qr.png"


@dataclass(frozen=True)
class QRResult:
    content: bytes
    filename: str


def generate_qr_png(
    link: str,
    *,
    foreground: str = "#1A3C2B",
    background: str = "#FFFFFF",
    filename: str | None = None,
) -> QRResult:
    normalized_link = validate_web_link(link)
    foreground = validate_hex_color(foreground, "Foreground")
    background = validate_hex_color(background, "Background")
    if foreground == background:
        raise QRValidationError("Foreground and background colors must be different.")

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=12,
        border=4,
    )
    qr.add_data(normalized_link)
    qr.make(fit=True)
    image = qr.make_image(fill_color=foreground, back_color=background)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return QRResult(
        content=output.getvalue(),
        filename=sanitize_filename(filename, normalized_link),
    )
