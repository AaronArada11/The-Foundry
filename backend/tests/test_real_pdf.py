import os
from pathlib import Path

import pymupdf
import pytest
from aaron_toolkit.pdf_convert_cli import convert
from docx import Document


@pytest.mark.real_pdf
@pytest.mark.skipif(
    os.environ.get("RUN_REAL_PDF_TEST") != "1",
    reason="Set RUN_REAL_PDF_TEST=1 to run the real PDF conversion smoke test.",
)
def test_real_pdf_to_docx_conversion(tmp_path: Path):
    source = tmp_path / "source.pdf"
    output = tmp_path / "output.docx"
    document = pymupdf.open()
    page = document.new_page()
    page.insert_text((72, 72), "Aaron Toolkit conversion smoke test")
    document.save(source)
    document.close()

    convert(source, output)

    converted = Document(output)
    text = "\n".join(paragraph.text for paragraph in converted.paragraphs)
    assert "Aaron Toolkit conversion smoke test" in text
