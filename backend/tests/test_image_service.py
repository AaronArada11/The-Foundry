import io

import pytest
from aaron_toolkit.image_service import ImageValidationError, convert_image
from PIL import Image


def image_bytes(
    image_format: str = "PNG",
    *,
    mode: str = "RGBA",
    size: tuple[int, int] = (12, 8),
) -> bytes:
    output = io.BytesIO()
    Image.new(mode, size, (255, 0, 0, 128) if mode == "RGBA" else "red").save(
        output,
        format=image_format,
    )
    return output.getvalue()


@pytest.mark.parametrize(
    ("target", "signature"),
    [
        ("jpg", b"\xff\xd8\xff"),
        ("png", b"\x89PNG\r\n\x1a\n"),
        ("webp", b"RIFF"),
    ],
)
def test_converts_to_supported_outputs(target: str, signature: bytes):
    result = convert_image(
        image_bytes(),
        source_filename="../portrait.png",
        target=target,
        quality=82,
        background="#FFFFFF",
        max_bytes=1024 * 1024,
        max_pixels=1000,
    )

    assert result.content.startswith(signature)
    assert result.filename == f"portrait.{target}"
    assert (result.width, result.height) == (12, 8)


def test_rejects_animated_images():
    output = io.BytesIO()
    frames = [Image.new("RGB", (4, 4), color) for color in ("red", "blue")]
    frames[0].save(output, format="GIF", save_all=True, append_images=frames[1:])

    with pytest.raises(ImageValidationError, match="Animated"):
        convert_image(
            output.getvalue(),
            source_filename="animated.gif",
            target="png",
            max_bytes=1024,
            max_pixels=100,
        )


def test_rejects_oversized_and_malformed_images():
    with pytest.raises(ImageValidationError, match="40 megapixels"):
        convert_image(
            image_bytes(size=(11, 10)),
            source_filename="large.png",
            target="png",
            max_bytes=1024,
            max_pixels=100,
        )

    with pytest.raises(ImageValidationError, match="not a supported image"):
        convert_image(
            b"not-an-image",
            source_filename="fake.png",
            target="png",
            max_bytes=1024,
            max_pixels=100,
        )
