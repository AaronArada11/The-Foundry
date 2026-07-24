from __future__ import annotations

from collections.abc import Callable
from typing import Literal


def build_ydl_options(
    output_format: Literal["mp4", "mp3", "mov"],
    *,
    outtmpl: str,
    progress_hooks: list[Callable[[dict[str, object]], None]] | None = None,
    match_filter: Callable[..., str | None] | None = None,
    max_filesize: int | None = None,
) -> dict[str, object]:
    options: dict[str, object] = {
        "noplaylist": True,
        "outtmpl": outtmpl,
        "progress_hooks": progress_hooks or [],
        "restrictfilenames": True,
        "quiet": True,
        "no_warnings": True,
        "overwrites": False,
        "socket_timeout": 15,
        "retries": 3,
        "fragment_retries": 3,
    }
    if match_filter:
        options["match_filter"] = match_filter
    if max_filesize:
        options["max_filesize"] = max_filesize

    if output_format == "mp3":
        options.update(
            {
                "format": "bestaudio/best",
                "postprocessors": [
                    {
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": "mp3",
                        "preferredquality": "320",
                    }
                ],
            }
        )
    elif output_format == "mov":
        options.update(
            {
                "format": "bestvideo+bestaudio/best",
                "postprocessors": [
                    {
                        "key": "FFmpegVideoConvertor",
                        "preferedformat": "mov",
                    }
                ],
            }
        )
    else:
        options.update(
            {
                "format": "bestvideo+bestaudio/best",
                "merge_output_format": "mp4",
            }
        )
    return options
