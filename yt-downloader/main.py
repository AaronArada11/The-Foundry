from __future__ import annotations

import sys
from pathlib import Path

from yt_dlp import YoutubeDL

BACKEND_DIRECTORY = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIRECTORY))

from aaron_toolkit.download_service import (  # noqa: E402
    MediaValidationError,
    validate_youtube_url,
)
from aaron_toolkit.media_options import build_ydl_options  # noqa: E402

DOWNLOAD_DIRECTORY = Path(__file__).resolve().parent / "downloads"


def download(url: str, output_format: str) -> None:
    normalized = validate_youtube_url(url)
    DOWNLOAD_DIRECTORY.mkdir(parents=True, exist_ok=True)
    options = build_ydl_options(
        output_format,  # type: ignore[arg-type]
        outtmpl=str(DOWNLOAD_DIRECTORY / "%(title).180B [%(id)s].%(ext)s"),
    )
    with YoutubeDL(options) as downloader:
        downloader.download([normalized])


def download_mp4(url: str) -> None:
    download(url, "mp4")


def download_mp3(url: str) -> None:
    download(url, "mp3")


def download_mov(url: str) -> None:
    download(url, "mov")


def menu() -> None:
    print("=" * 40)
    print("      YouTube Downloader")
    print("=" * 40)
    print("1. Download as MP4")
    print("2. Download as MP3")
    print("3. Download as MOV")
    print("4. Exit")


def main() -> int:
    actions = {"1": ("mp4", download_mp4), "2": ("mp3", download_mp3), "3": ("mov", download_mov)}
    while True:
        menu()
        choice = input("\nChoose an option: ").strip()
        if choice == "4":
            print("Goodbye!")
            return 0
        if choice not in actions:
            print("\nInvalid option.\n")
            continue
        output_format, action = actions[choice]
        try:
            action(input("\nEnter YouTube URL: "))
        except MediaValidationError as error:
            print(f"\n{error}\n", file=sys.stderr)
            continue
        print(f"\n{output_format.upper()} download complete!\n")


if __name__ == "__main__":
    raise SystemExit(main())
