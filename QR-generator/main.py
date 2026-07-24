import argparse
import hashlib
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

BACKEND_DIRECTORY = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIRECTORY))

from aaron_toolkit.qr_service import (  # noqa: E402
    QRValidationError,
    generate_qr_png,
    validate_web_link,
)

DEFAULT_OUTPUT_DIRECTORY = Path("qrs")


def valid_link(value: str) -> str:
    """Return a normalized HTTP(S) link or raise an argparse error."""
    try:
        return validate_web_link(value)
    except QRValidationError as error:
        raise argparse.ArgumentTypeError(str(error)) from error


def default_output_path(link: str) -> Path:
    """Create a readable output path from the link's host name."""
    host = urlparse(link).hostname or "link"
    safe_host = re.sub(r"[^a-zA-Z0-9.-]+", "-", host).strip(".-") or "link"
    link_id = hashlib.sha256(link.encode("utf-8")).hexdigest()[:8]
    return DEFAULT_OUTPUT_DIRECTORY / f"{safe_host}-{link_id}-qr.png"


def png_output_path(value: str) -> Path:
    """Normalize a user-supplied output path to a PNG path."""
    path = Path(value).expanduser()
    return path if path.suffix.lower() == ".png" else path.with_suffix(".png")


def generate_qr(
    link: str,
    output_path: Path,
    *,
    fill_color: str = "#111111",
    background_color: str = "#ffffff",
) -> Path:
    """Generate a QR code for a link and return the saved file path."""
    result = generate_qr_png(
        link,
        foreground=fill_color,
        background=background_color,
        filename=output_path.name,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(result.content)

    return output_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate a PNG QR code for a web link.")
    parser.add_argument(
        "link",
        nargs="?",
        type=valid_link,
        help="link to encode; prompts for one when omitted",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=png_output_path,
        help="output PNG path (default: qrs/<domain>-<id>-qr.png)",
    )
    parser.add_argument(
        "--fill",
        default="#111111",
        help="QR foreground color (default: #111111)",
    )
    parser.add_argument(
        "--background",
        default="#ffffff",
        help="QR background color (default: #ffffff)",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    link = args.link
    if link is None:
        try:
            link = valid_link(input("Enter a link: "))
        except (EOFError, KeyboardInterrupt):
            print("\nCancelled.", file=sys.stderr)
            return 130
        except argparse.ArgumentTypeError as error:
            parser.error(str(error))

    output_path = args.output or default_output_path(link)

    try:
        saved_path = generate_qr(
            link,
            output_path,
            fill_color=args.fill,
            background_color=args.background,
        )
    except (OSError, ValueError) as error:
        parser.error(f"could not create the QR code: {error}")

    print(f"QR code saved to {saved_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
