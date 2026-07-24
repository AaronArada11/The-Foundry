# Aaron Toolkit

Aaron Toolkit is an extensible public web app for small utilities. The catalog is
registry-driven: adding a tool manifest and its feature module automatically adds
it to search, navigation, and routing without changing the homepage.

The first two tools are:

- Link QR Generator — generate a customized PNG QR code from an HTTP(S) link.
- YouTube Downloader — process permitted single-video URLs as MP4, MP3, or MOV.

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

The optional real media smoke test is disabled by default:

```bash
RUN_REAL_MEDIA_TESTS=1 pytest -m real_media
```

## Production

Build the OCI image with `docker build .`. Use the same image for:

- `web`: `uvicorn aaron_toolkit.app:app --host 0.0.0.0 --port 8000`
- `worker`: `python -m aaron_toolkit.worker`

Production requires Redis, S3-compatible object storage, and Cloudflare Turnstile.
See [.env.example](.env.example) and [docs/deployment.md](docs/deployment.md).

Only download content you have permission to use. Follow the source platform's
terms and applicable copyright laws.
