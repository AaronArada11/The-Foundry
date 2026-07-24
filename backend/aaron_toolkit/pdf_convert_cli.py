from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from pdf2docx import Converter


def _apply_resource_limits() -> None:
    if sys.platform != "linux":
        return
    import resource

    memory_bytes = int(os.environ.get("PDF_MEMORY_LIMIT_MB", "1024")) * 1024 * 1024
    cpu_seconds = int(os.environ.get("PDF_CPU_LIMIT_SECONDS", "180"))
    resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
    resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 1))


def convert(source: Path, output: Path) -> None:
    _apply_resource_limits()
    converter = Converter(str(source))
    try:
        converter.convert(str(output))
    finally:
        converter.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert a validated PDF to DOCX.")
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    convert(args.source, args.output)


if __name__ == "__main__":
    main()
