from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_env: str = "development"
    public_base_url: str = "http://localhost:8000"
    trust_proxy: bool = False
    signing_secret: str = "development-only-change-me"

    redis_url: str | None = None

    s3_endpoint_url: str | None = None
    s3_region: str = "us-east-1"
    s3_bucket: str | None = None
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None

    turnstile_secret_key: str | None = None

    artifact_directory: Path = Field(default_factory=lambda: Path("/tmp/aaron-toolkit-artifacts"))
    artifact_ttl_seconds: int = 900
    job_ttl_seconds: int = 3600
    max_media_duration_seconds: int = 1800
    max_media_bytes: int = 500 * 1024 * 1024
    media_timeout_seconds: int = 900
    media_jobs_per_hour: int = 3
    tiktok_jobs_per_hour: int = 3
    qr_requests_per_minute: int = 30
    max_image_bytes: int = 20 * 1024 * 1024
    max_image_pixels: int = 40_000_000
    image_conversions_per_minute: int = 10
    max_pdf_bytes: int = 25 * 1024 * 1024
    max_pdf_pages: int = 100
    pdf_timeout_seconds: int = 180
    pdf_jobs_per_hour: int = 3
    pdf_max_concurrency: int = 1
    pdf_memory_limit_mb: int = 1024
    worker_concurrency: int = 2

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def has_s3(self) -> bool:
        return bool(self.s3_bucket and self.s3_access_key_id and self.s3_secret_access_key)

    @model_validator(mode="after")
    def validate_production_services(self) -> Settings:
        if self.is_production:
            missing = []
            if not self.redis_url:
                missing.append("REDIS_URL")
            if not self.has_s3:
                missing.append("S3_BUCKET/S3 credentials")
            if not self.turnstile_secret_key:
                missing.append("TURNSTILE_SECRET_KEY")
            if self.signing_secret == "development-only-change-me":
                missing.append("SIGNING_SECRET")
            if missing:
                raise ValueError("Production configuration is incomplete: " + ", ".join(missing))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
