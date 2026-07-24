import pytest
from aaron_toolkit.download_service import (
    MediaValidationError,
    validate_youtube_url,
)


@pytest.mark.parametrize(
    "url",
    [
        "https://youtu.be/dQw4w9WgXcQ",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/shorts/dQw4w9WgXcQ",
    ],
)
def test_accepts_individual_youtube_urls(url):
    assert validate_youtube_url(url) == url


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/watch?v=dQw4w9WgXcQ",
        "file:///etc/passwd",
        "https://127.0.0.1/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/playlist?list=PL123456",
        "https://youtube.com/watch?v=dQw4w9WgXcQ&list=PL123456",
        "https://youtube.com/",
    ],
)
def test_rejects_non_video_or_non_youtube_urls(url):
    with pytest.raises(MediaValidationError):
        validate_youtube_url(url)
