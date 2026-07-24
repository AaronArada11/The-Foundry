from pathlib import Path

import pymupdf
import pytest
from aaron_toolkit.config import Settings
from aaron_toolkit.jobs import MemoryJobStore, ToolJob
from aaron_toolkit.pdf_service import PDFProcessor, PDFValidationError, validate_pdf
from aaron_toolkit.storage import LocalArtifactStore


def create_pdf(path: Path, *, text: str | None = "Editable text") -> None:
    document = pymupdf.open()
    page = document.new_page()
    if text:
        page.insert_text((72, 72), text)
    document.save(path)
    document.close()


def test_validates_text_pdf_and_rejects_scanned_only(tmp_path: Path):
    text_pdf = tmp_path / "text.pdf"
    create_pdf(text_pdf)
    assert validate_pdf(text_pdf, max_bytes=1024 * 1024, max_pages=10) == 1

    scanned_pdf = tmp_path / "scan.pdf"
    create_pdf(scanned_pdf, text=None)
    with pytest.raises(PDFValidationError, match="scanned"):
        validate_pdf(scanned_pdf, max_bytes=1024 * 1024, max_pages=10)


def test_rejects_encrypted_and_oversized_pdf(tmp_path: Path):
    plain = tmp_path / "plain.pdf"
    create_pdf(plain)
    encrypted = tmp_path / "encrypted.pdf"
    with pymupdf.open(plain) as document:
        document.save(
            encrypted,
            encryption=pymupdf.PDF_ENCRYPT_AES_256,
            owner_pw="owner",
            user_pw="secret",
        )

    with pytest.raises(PDFValidationError, match="Password-protected"):
        validate_pdf(encrypted, max_bytes=1024 * 1024, max_pages=10)
    with pytest.raises(PDFValidationError, match="MB or smaller"):
        validate_pdf(plain, max_bytes=5, max_pages=10)


class StubPDFProcessor(PDFProcessor):
    async def _run_conversion(self, job_id: str, source: Path, output: Path) -> None:
        del job_id
        assert source.read_bytes().startswith(b"%PDF-")
        output.write_bytes(b"docx")


@pytest.mark.asyncio
async def test_processor_publishes_docx_and_deletes_private_input(tmp_path: Path):
    source = tmp_path / "source.pdf"
    create_pdf(source)
    artifacts = LocalArtifactStore(
        tmp_path / "artifacts",
        public_base_url="http://localhost:8000",
        signing_secret="secret",
        ttl_seconds=900,
        input_ttl_seconds=3600,
    )
    stored = await artifacts.put_input(source, filename="Example Report.pdf")
    jobs = MemoryJobStore()
    job = await jobs.create(
        ToolJob.create_pdf(
            owner_hash="owner",
            input_key=stored.key,
            source_filename=stored.filename,
            ttl_seconds=3600,
        )
    )
    processor = StubPDFProcessor(
        store=jobs,
        artifacts=artifacts,
        settings=Settings(),
    )

    await processor.process(job.id)

    ready = await jobs.get(job.id)
    assert ready
    assert ready.status == "ready"
    assert ready.filename == "Example-Report.docx"
    assert ready.input_key is None
    with pytest.raises(FileNotFoundError):
        await artifacts.materialize_input(stored.key, tmp_path / "missing.pdf")
