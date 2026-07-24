from __future__ import annotations

import asyncio
import os
import re
import sys
import tempfile
import time
from pathlib import Path

import pymupdf

from .config import Settings
from .jobs import TERMINAL_STATUSES, JobStore
from .storage import ArtifactStore

SAFE_FILENAME = re.compile(r"[^a-zA-Z0-9._-]+")


class PDFValidationError(ValueError):
    pass


class PDFConversionCancelled(RuntimeError):
    pass


def sanitize_docx_filename(source_filename: str | None) -> str:
    stem = Path(source_filename or "converted-document").stem
    stem = SAFE_FILENAME.sub("-", stem).strip(".-_")[:100] or "converted-document"
    return f"{stem}.docx"


def validate_pdf(path: Path, *, max_bytes: int, max_pages: int) -> int:
    if not path.is_file() or path.stat().st_size == 0:
        raise PDFValidationError("Choose a PDF file to convert.")
    if path.stat().st_size > max_bytes:
        size_mb = max_bytes // (1024 * 1024)
        raise PDFValidationError(f"PDF files must be {size_mb} MB or smaller.")
    with path.open("rb") as source:
        signature = source.read(5)
    if signature != b"%PDF-":
        raise PDFValidationError("The selected file is not a valid PDF.")

    try:
        with pymupdf.open(path) as document:
            if document.needs_pass or document.is_encrypted:
                raise PDFValidationError("Password-protected PDFs are not supported.")
            if document.page_count == 0:
                raise PDFValidationError("The PDF does not contain any pages.")
            if document.page_count > max_pages:
                raise PDFValidationError(f"PDF files may contain at most {max_pages} pages.")
            contains_text = any(
                document.load_page(index).get_text("text").strip()
                for index in range(document.page_count)
            )
            if not contains_text:
                raise PDFValidationError(
                    "This PDF appears to contain scanned pages only. OCR is not available yet."
                )
            return document.page_count
    except PDFValidationError:
        raise
    except (pymupdf.FileDataError, RuntimeError, ValueError) as error:
        raise PDFValidationError("The PDF is damaged or could not be read.") from error


class PDFProcessor:
    def __init__(
        self,
        *,
        store: JobStore,
        artifacts: ArtifactStore,
        settings: Settings,
    ) -> None:
        self.store = store
        self.artifacts = artifacts
        self.settings = settings
        self._semaphore = asyncio.Semaphore(max(1, settings.pdf_max_concurrency))

    async def process(self, job_id: str) -> None:
        async with self._semaphore:
            job = await self.store.get(job_id)
            if not job or job.kind != "pdf-to-word":
                return
            if job.status in TERMINAL_STATUSES:
                if job.input_key:
                    await self.artifacts.delete_input(job.input_key)
                return
            if not job.input_key:
                await self.store.update(
                    job_id,
                    status="failed",
                    error="The uploaded PDF is missing or expired. Please upload it again.",
                )
                return

            try:
                await self.store.update(job_id, status="processing", progress=5)
                with tempfile.TemporaryDirectory(
                    prefix=f"aaron-toolkit-pdf-{job_id[:8]}-"
                ) as temp:
                    directory = Path(temp)
                    source = directory / "source.pdf"
                    output = directory / "converted.docx"
                    await self.artifacts.materialize_input(job.input_key, source)
                    await self.store.update(job_id, progress=12)
                    await self._run_conversion(job_id, source, output)
                    current = await self.store.get(job_id)
                    if current and current.cancel_requested:
                        raise PDFConversionCancelled from None
                    if not output.is_file() or output.stat().st_size == 0:
                        raise RuntimeError("The DOCX output was not created.")
                    await self.store.update(job_id, progress=92)
                    artifact = await self.artifacts.put(
                        output,
                        filename=sanitize_docx_filename(job.source_filename),
                    )
                    await self.store.update(
                        job_id,
                        status="ready",
                        progress=100,
                        filename=artifact.filename,
                        download_url=artifact.download_url,
                        artifact_expires_at=artifact.expires_at,
                    )
            except TimeoutError:
                await self.store.update(
                    job_id,
                    status="failed",
                    error="The PDF conversion exceeded the public execution time limit.",
                    download_url=None,
                )
            except PDFConversionCancelled:
                await self.store.update(
                    job_id,
                    status="cancelled",
                    error="The conversion was cancelled.",
                    download_url=None,
                )
            except (FileNotFoundError, OSError, RuntimeError) as error:
                await self.store.update(
                    job_id,
                    status="failed",
                    error=self._public_error(error),
                    download_url=None,
                )
            finally:
                await self.artifacts.delete_input(job.input_key)
                current = await self.store.get(job_id)
                if current:
                    await self.store.update(job_id, input_key=None)

    async def _run_conversion(
        self,
        job_id: str,
        source: Path,
        output: Path,
    ) -> None:
        environment = {
            **os.environ,
            "PDF_MEMORY_LIMIT_MB": str(self.settings.pdf_memory_limit_mb),
            "PDF_CPU_LIMIT_SECONDS": str(self.settings.pdf_timeout_seconds),
        }
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "aaron_toolkit.pdf_convert_cli",
            str(source),
            str(output),
            cwd=source.parent,
            env=environment,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        deadline = time.monotonic() + self.settings.pdf_timeout_seconds
        try:
            while process.returncode is None:
                try:
                    await asyncio.wait_for(process.wait(), timeout=0.5)
                except TimeoutError:
                    current = await self.store.get(job_id)
                    if current and current.cancel_requested:
                        process.terminate()
                        await process.wait()
                        raise PDFConversionCancelled from None
                    if time.monotonic() >= deadline:
                        process.kill()
                        await process.wait()
                        raise TimeoutError from None
        except asyncio.CancelledError:
            process.kill()
            await process.wait()
            raise
        if process.returncode != 0:
            raise RuntimeError("The PDF conversion process failed.")

    @staticmethod
    def _public_error(error: Exception) -> str:
        if isinstance(error, FileNotFoundError):
            return "The uploaded PDF expired before it could be processed. Upload it again."
        return "The PDF could not be converted. Try a simpler text-based document."
