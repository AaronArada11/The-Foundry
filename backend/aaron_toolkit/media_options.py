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

    # Prefer streams whose estimated combined size fits the artifact limit. Without
    # this, yt-dlp selects the highest-quality streams first; long videos then fail
    # even when a lower-resolution version would fit comfortably.
    video_format = "bestvideo+bestaudio/best"
    if max_filesize:
        video_budget = max_filesize * 3 // 4
        audio_budget = max_filesize - video_budget
        video_format = (
            f"bestvideo[filesize_approx<=?{video_budget}]"
            f"+bestaudio[filesize_approx<=?{audio_budget}]"
            f"/best[filesize_approx<=?{max_filesize}]"
        )

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
                "format": video_format,
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
                "format": video_format,
                "merge_output_format": "mp4",
            }
        )
    return options
