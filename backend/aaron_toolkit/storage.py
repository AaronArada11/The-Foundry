from __future__ import annotations

import asyncio
import hashlib
import hmac
import shutil
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from urllib.parse import quote

import boto3


def _consume_task_exception(task: asyncio.Task[None]) -> None:
    if not task.cancelled():
        task.exception()


@dataclass(frozen=True)
class Artifact:
    id: str
    filename: str
    download_url: str
    expires_at: float


@dataclass(frozen=True)
class PrivateInput:
    key: str
    filename: str
    expires_at: float


class ArtifactStore(Protocol):
    async def put(self, source: Path, *, filename: str) -> Artifact: ...

    async def put_input(self, source: Path, *, filename: str) -> PrivateInput: ...

    async def materialize_input(self, key: str, destination: Path) -> None: ...

    async def delete_input(self, key: str) -> None: ...

    async def cleanup_inputs(self) -> None: ...


class LocalArtifactStore:
    def __init__(
        self,
        directory: Path,
        *,
        public_base_url: str,
        signing_secret: str,
        ttl_seconds: int,
        input_ttl_seconds: int = 3600,
    ) -> None:
        self.directory = directory
        self.input_directory = directory / "_inputs"
        self.public_base_url = public_base_url.rstrip("/")
        self.signing_secret = signing_secret.encode()
        self.ttl_seconds = ttl_seconds
        self.input_ttl_seconds = input_ttl_seconds
        self.directory.mkdir(parents=True, exist_ok=True)
        self.input_directory.mkdir(parents=True, exist_ok=True)

    def _signature(self, artifact_id: str, expires: int) -> str:
        payload = f"{artifact_id}:{expires}".encode()
        return hmac.new(self.signing_secret, payload, hashlib.sha256).hexdigest()

    async def put(self, source: Path, *, filename: str) -> Artifact:
        await self.cleanup()
        artifact_id = uuid.uuid4().hex
        destination = self.directory / f"{artifact_id}{source.suffix.lower()}"
        await asyncio.to_thread(shutil.copy2, source, destination)
        expires = int(time.time() + self.ttl_seconds)
        signature = self._signature(artifact_id, expires)
        self._schedule_expiration(destination, self.ttl_seconds)
        url = (
            f"{self.public_base_url}/api/artifacts/{artifact_id}"
            f"?expires={expires}&signature={signature}&filename={quote(filename)}"
        )
        return Artifact(
            id=artifact_id,
            filename=filename,
            download_url=url,
            expires_at=float(expires),
        )

    async def put_input(self, source: Path, *, filename: str) -> PrivateInput:
        await self.cleanup_inputs()
        input_id = uuid.uuid4().hex
        destination = self.input_directory / input_id
        await asyncio.to_thread(shutil.copy2, source, destination)
        self._schedule_expiration(destination, self.input_ttl_seconds)
        return PrivateInput(
            key=input_id,
            filename=Path(filename).name[:180] or "upload",
            expires_at=time.time() + self.input_ttl_seconds,
        )

    async def materialize_input(self, key: str, destination: Path) -> None:
        source = self.input_directory / Path(key).name
        if not source.is_file():
            raise FileNotFoundError("Temporary input is missing or expired.")
        await asyncio.to_thread(shutil.copy2, source, destination)

    async def delete_input(self, key: str) -> None:
        (self.input_directory / Path(key).name).unlink(missing_ok=True)

    def _schedule_expiration(self, path: Path, ttl_seconds: int) -> None:
        async def expire() -> None:
            await asyncio.sleep(ttl_seconds)
            path.unlink(missing_ok=True)

        task = asyncio.create_task(expire())
        task.add_done_callback(_consume_task_exception)

    def resolve(
        self,
        artifact_id: str,
        *,
        expires: int,
        signature: str,
    ) -> Path | None:
        if expires <= int(time.time()):
            return None
        expected = self._signature(artifact_id, expires)
        if not hmac.compare_digest(signature, expected):
            return None
        matches = list(self.directory.glob(f"{artifact_id}.*"))
        return matches[0] if len(matches) == 1 and matches[0].is_file() else None

    async def cleanup(self) -> None:
        cutoff = time.time() - self.ttl_seconds
        for path in self.directory.iterdir():
            if path.is_file() and path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)

    async def cleanup_inputs(self) -> None:
        cutoff = time.time() - self.input_ttl_seconds
        for path in self.input_directory.iterdir():
            if path.is_file() and path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)


class S3ArtifactStore:
    def __init__(
        self,
        *,
        endpoint_url: str | None,
        region: str,
        bucket: str,
        access_key_id: str,
        secret_access_key: str,
        ttl_seconds: int,
        input_ttl_seconds: int = 3600,
    ) -> None:
        self.bucket = bucket
        self.ttl_seconds = ttl_seconds
        self.input_ttl_seconds = input_ttl_seconds
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            region_name=region,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
        )

    async def put(self, source: Path, *, filename: str) -> Artifact:
        artifact_id = uuid.uuid4().hex
        safe_filename = Path(filename).name[:180] or "download"
        key = f"artifacts/{artifact_id}/{safe_filename}"
        await asyncio.to_thread(
            self.client.upload_file,
            str(source),
            self.bucket,
            key,
            ExtraArgs={"ContentDisposition": f'attachment; filename="{safe_filename}"'},
        )
        url = await asyncio.to_thread(
            self.client.generate_presigned_url,
            "get_object",
            Params={
                "Bucket": self.bucket,
                "Key": key,
                "ResponseContentDisposition": (
                    f'attachment; filename="{safe_filename}"'
                ),
            },
            ExpiresIn=self.ttl_seconds,
        )
        self._schedule_expiration(key, self.ttl_seconds)
        return Artifact(
            id=key,
            filename=safe_filename,
            download_url=url,
            expires_at=time.time() + self.ttl_seconds,
        )

    async def put_input(self, source: Path, *, filename: str) -> PrivateInput:
        input_id = uuid.uuid4().hex
        key = f"inputs/{input_id}"
        safe_filename = Path(filename).name[:180] or "upload"
        await asyncio.to_thread(
            self.client.upload_file,
            str(source),
            self.bucket,
            key,
            ExtraArgs={
                "ContentType": "application/octet-stream",
                "Metadata": {"filename": safe_filename},
            },
        )
        return PrivateInput(
            key=key,
            filename=safe_filename,
            expires_at=time.time() + self.input_ttl_seconds,
        )

    async def materialize_input(self, key: str, destination: Path) -> None:
        if not key.startswith("inputs/"):
            raise FileNotFoundError("Temporary input is missing or expired.")
        await asyncio.to_thread(
            self.client.download_file,
            self.bucket,
            key,
            str(destination),
        )

    async def delete_input(self, key: str) -> None:
        if not key.startswith("inputs/"):
            return
        await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=key)

    async def cleanup_inputs(self) -> None:
        # S3 lifecycle rules are the durable backstop; workers delete inputs eagerly.
        return None

    def _schedule_expiration(self, key: str, ttl_seconds: int) -> None:
        async def expire() -> None:
            await asyncio.sleep(ttl_seconds)
            await asyncio.to_thread(
                self.client.delete_object,
                Bucket=self.bucket,
                Key=key,
            )

        task = asyncio.create_task(expire())
        task.add_done_callback(_consume_task_exception)
