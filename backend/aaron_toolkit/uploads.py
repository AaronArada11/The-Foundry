from __future__ import annotations

import asyncio
from pathlib import Path
from typing import BinaryIO

from fastapi import UploadFile


class UploadTooLargeError(ValueError):
    pass


def _copy_limited(source: BinaryIO, destination: Path, max_bytes: int) -> int:
    total = 0
    with destination.open("wb") as output:
        while chunk := source.read(1024 * 1024):
            total += len(chunk)
            if total > max_bytes:
                raise UploadTooLargeError
            output.write(chunk)
    return total


async def save_upload(
    upload: UploadFile,
    destination: Path,
    *,
    max_bytes: int,
) -> int:
    await upload.seek(0)
    return await asyncio.to_thread(
        _copy_limited,
        upload.file,
        destination,
        max_bytes,
    )
