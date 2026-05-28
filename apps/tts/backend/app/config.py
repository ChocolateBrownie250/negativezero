from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    groq_api_key: str = Field(..., alias="GROQ_API_KEY")
    amethyst_api_key: str = Field(..., alias="AMETHYST_API_KEY")

    public_host: str = Field("localhost", alias="PUBLIC_HOST")
    acme_email: str = Field("", alias="ACME_EMAIL")

    # Whisper models — default is the fast turbo, "accurate" is used by the
    # /retranscribe endpoint when the user wants to re-run a clip with the
    # higher-accuracy non-turbo variant.
    whisper_model: str = Field("whisper-large-v3-turbo", alias="WHISPER_MODEL")
    whisper_accurate_model: str = Field("whisper-large-v3", alias="WHISPER_ACCURATE_MODEL")

    # Cleanup model — Llama 4 Scout (MoE 17B-active) is faster than 3.3-70b on
    # the same Groq tier with comparable instruction-following on our strict
    # cleanup prompt. Override via env if a regression appears.
    cleanup_model: str = Field(
        "meta-llama/llama-4-scout-17b-16e-instruct", alias="CLEANUP_MODEL"
    )

    # Polish models — light/standard reuse the cleanup model; strong uses
    # GPT-OSS-120B (the largest available chat model on this account) to give
    # the "strong" mode a real quality step rather than just a different prompt.
    polish_model_default: str = Field(
        "meta-llama/llama-4-scout-17b-16e-instruct", alias="POLISH_MODEL_DEFAULT"
    )
    polish_strong_model: str = Field("openai/gpt-oss-120b", alias="POLISH_STRONG_MODEL")

    data_dir: Path = Field(Path("/data"), alias="DATA_DIR")
    db_path: Path = Field(Path("/data/amethyst.sqlite"), alias="DB_PATH")
    audio_dir: Path = Field(Path("/data/audio"), alias="AUDIO_DIR")

    audio_retention_days: int = Field(90, alias="AUDIO_RETENTION_DAYS")

    pwa_dir: Path | None = Field(None, alias="PWA_DIR")

    cleanup_default_enabled: bool = Field(True, alias="CLEANUP_DEFAULT_ENABLED")
    cleanup_default_mode: str = Field("standard", alias="CLEANUP_DEFAULT_MODE")

    log_level: str = Field("INFO", alias="LOG_LEVEL")

    # /docs, /redoc, /openapi.json — off by default to avoid leaking the
    # API surface (SECURITY_AUDIT.md). Set EXPOSE_API_DOCS=true in .env
    # for local development.
    expose_api_docs: bool = Field(False, alias="EXPOSE_API_DOCS")


settings = Settings()
