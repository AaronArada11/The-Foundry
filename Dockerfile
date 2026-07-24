# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS web-build
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
ARG VITE_TURNSTILE_SITE_KEY=""
ENV VITE_TURNSTILE_SITE_KEY=${VITE_TURNSTILE_SITE_KEY}
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:${PATH}"
WORKDIR /app
RUN apt-get update \
    && apt-get install --no-install-recommends -y ffmpeg ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN python -m venv /opt/venv
COPY pyproject.toml README.md ./
COPY backend/ ./backend/
RUN pip install --no-cache-dir .
COPY --from=web-build /build/web/dist ./web/dist
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /tmp/aaron-toolkit-artifacts \
    && chown -R appuser:appuser /app /tmp/aaron-toolkit-artifacts
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl --fail http://127.0.0.1:8000/api/health || exit 1
CMD ["uvicorn", "aaron_toolkit.app:app", "--host", "0.0.0.0", "--port", "8000"]
