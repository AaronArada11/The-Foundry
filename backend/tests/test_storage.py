from pathlib import Path

import pytest
from aaron_toolkit.storage import LocalArtifactStore


@pytest.mark.asyncio
async def test_local_artifact_uses_signed_expiring_url(tmp_path: Path):
    source = tmp_path / "source.mp4"
    source.write_bytes(b"media")
    store = LocalArtifactStore(
        tmp_path / "artifacts",
        public_base_url="http://localhost:8000",
        signing_secret="test-secret",
        ttl_seconds=900,
    )

    artifact = await store.put(source, filename="video.mp4")
    query = artifact.download_url.split("?", 1)[1]
    values = dict(part.split("=", 1) for part in query.split("&"))

    assert store.resolve(
        artifact.id,
        expires=int(values["expires"]),
        signature=values["signature"],
    )
    assert (
        store.resolve(
            artifact.id,
            expires=int(values["expires"]),
            signature="0" * 64,
        )
        is None
    )


@pytest.mark.asyncio
async def test_local_private_input_can_be_materialized_and_deleted(tmp_path: Path):
    source = tmp_path / "document.pdf"
    source.write_bytes(b"%PDF-private")
    store = LocalArtifactStore(
        tmp_path / "artifacts",
        public_base_url="http://localhost:8000",
        signing_secret="test-secret",
        ttl_seconds=900,
        input_ttl_seconds=3600,
    )

    stored = await store.put_input(source, filename="../document.pdf")
    materialized = tmp_path / "materialized.pdf"
    await store.materialize_input(stored.key, materialized)

    assert stored.filename == "document.pdf"
    assert materialized.read_bytes() == b"%PDF-private"

    await store.delete_input(stored.key)
    with pytest.raises(FileNotFoundError):
        await store.materialize_input(stored.key, materialized)
