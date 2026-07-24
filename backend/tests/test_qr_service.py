import pytest
from aaron_toolkit.qr_service import (
    QRValidationError,
    generate_qr_png,
    sanitize_filename,
    validate_web_link,
)


def test_generate_qr_png_returns_png_and_safe_name():
    result = generate_qr_png(
        "https://example.com/path",
        filename="../../unsafe name",
    )

    assert result.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert result.filename == "unsafe-name-qr.png"


@pytest.mark.parametrize(
    "link",
    [
        "javascript:alert(1)",
        "example.com",
        "https://user:password@example.com",
        "https://" + ("x" * 2050),
    ],
)
def test_rejects_unsafe_or_incomplete_links(link):
    with pytest.raises(QRValidationError):
        validate_web_link(link)


def test_rejects_identical_colors():
    with pytest.raises(QRValidationError, match="different"):
        generate_qr_png(
            "https://example.com",
            foreground="#111111",
            background="#111111",
        )


def test_default_filename_uses_hostname():
    assert sanitize_filename(None, "https://www.example.com/a") == "www.example.com-qr.png"
