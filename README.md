# Foundry

Foundry is an extensible public web app for practical utilities—tools, forged for
getting things done. The catalog is
registry-driven: adding a tool manifest and its feature module automatically adds
it to search, navigation, and routing without changing the homepage.

The initial tools are:

- Link QR Generator — generate a customized PNG QR code from an HTTP(S) link.
- YouTube Downloader — process permitted single-video URLs as MP4, MP3, or MOV.
- TikTok Downloader — process permitted individual public videos as MP4, MP3,
  or MOV.
- Image Format Converter — convert JPG, PNG, WebP, GIF, BMP, TIFF, HEIC, or
  AVIF images to JPG, PNG, or WebP.
- PDF to Word — turn text-based PDFs into editable DOCX files.

## Local development

Requirements:

- Node.js 22+
- Python 3.11+
- FFmpeg

Install and run the API:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -e ".[dev]"
uvicorn aaron_toolkit.app:app --reload
```

Install and run the frontend in another terminal:

```bash
cd web
npm install
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8000`. Without Redis, the API uses an
in-process development queue and local expiring artifact storage.

## Tests

```bash
pytest
cd web && npm test
cd web && npm run build
```

The optional real yt-dlp media smoke test is disabled by default:

```bash
RUN_REAL_MEDIA_TESTS=1 pytest -m real_media
```

Run the local PDF conversion smoke test with:

```bash
RUN_REAL_PDF_TEST=1 pytest -m real_pdf
```

## Production

Build the OCI image with `docker build .`. Use the same image for:

- `web`: `uvicorn aaron_toolkit.app:app --host 0.0.0.0 --port 8000`
- `worker`: `python -m aaron_toolkit.worker`

Production requires Redis, S3-compatible object storage, and Cloudflare Turnstile.
See [.env.example](.env.example) and [docs/deployment.md](docs/deployment.md).

Only download content you have permission to use. Follow the source platform's
terms and applicable copyright laws.
