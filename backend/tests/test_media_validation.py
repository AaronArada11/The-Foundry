import pytest
from aaron_toolkit.download_service import (
    MediaValidationError,
    validate_tiktok_url,
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


@pytest.mark.parametrize(
    "url",
    [
        "https://www.tiktok.com/@creator/video/7461234567890123456",
        "https://vm.tiktok.com/ZMexample/",
        "https://vt.tiktok.com/ZMexample/",
        "https://www.tiktok.com/t/ZMexample/",
    ],
)
def test_accepts_individual_tiktok_video_urls(url):
    assert validate_tiktok_url(url) == url


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/@creator/video/7461234567890123456",
        "file:///etc/passwd",
        "https://127.0.0.1/@creator/video/7461234567890123456",
        "https://www.tiktok.com/@creator",
        "https://www.tiktok.com/@creator/photo/7461234567890123456",
        "https://www.tiktok.com/explore",
    ],
)
def test_rejects_non_video_or_non_tiktok_urls(url):
    with pytest.raises(MediaValidationError):
        validate_tiktok_url(url)
