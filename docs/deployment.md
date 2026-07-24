# Container deployment

Aaron Toolkit ships as one OCI image used by two process types:

- Web: serves the compiled React app and FastAPI API.
- Worker: consumes typed tool jobs from Redis and runs bounded media or document
  conversion processors.

## Required services

- Redis 7+ for job state, ownership locks, queueing, and rate limits.
- S3-compatible object storage with a private bucket.
- Cloudflare Turnstile keys for anonymous media and PDF-job verification.

## Required production environment

Set `APP_ENV=production` and configure every variable in `.env.example`. Production
startup intentionally fails if Redis, S3 credentials, Turnstile, or a non-default
signing secret is missing.

`PUBLIC_BASE_URL` must be the browser-visible HTTPS origin. Set `TRUST_PROXY=true`
only behind a trusted platform proxy that replaces `X-Forwarded-For`.

Build the image with the public Turnstile site key:

```bash
docker build \
  --build-arg VITE_TURNSTILE_SITE_KEY="$VITE_TURNSTILE_SITE_KEY" \
  -t aaron-toolkit .
```

Run the web process:

```bash
uvicorn aaron_toolkit.app:app --host 0.0.0.0 --port 8000
```

Run the worker from the same image:

```bash
python -m aaron_toolkit.worker
```

Scale workers conservatively. `WORKER_CONCURRENCY=2` is the global default because
media and document conversion are CPU-, bandwidth-, and disk-intensive.
`PDF_MAX_CONCURRENCY=1` additionally prevents document conversions from saturating
one worker process.

## Storage and retention

- Artifact URLs are pre-signed for 15 minutes by default.
- Web and worker processes schedule deletion when that 15-minute window closes.
- Uploaded PDF inputs use private `inputs/` objects and are deleted in the worker's
  cleanup path immediately after success, failure, timeout, or cancellation.
- Job metadata expires after one hour.
- Temporary working directories are isolated per job and removed after each run.
- The S3 bucket must remain private; only pre-signed GET URLs are exposed.

Configure bucket lifecycle expiration as a second cleanup layer for both
`artifacts/` and `inputs/` objects. A one-day lifecycle is sufficient to catch
orphaned objects while the application continues issuing 15-minute URLs and
one-hour input retention.

## Converter limits

- Image uploads: 20 MiB, 40 megapixels, 10 conversions per IP per minute.
- PDF uploads: 25 MiB, 100 pages, three jobs per IP per hour, one active PDF job
  per IP, 180-second execution timeout, and a 1 GiB subprocess memory limit.
- Image conversion is synchronous and does not retain the source or output.
- PDF conversion accepts text-based, unencrypted documents. OCR is intentionally
  not included.

## Local parity

`docker compose up --build` starts the web process, worker, Redis, and MinIO. Local
compose runs in development mode, so Turnstile can use the `dev-bypass` token.
