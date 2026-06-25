from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    groq_api_key: str = Field(..., alias="GROQ_API_KEY")
    amethyst_api_key: str = Field(..., alias="AMETHYST_API_KEY")

    # Shared cross-service SSO secret. When set, the browser PWA can
    # authenticate via the hub-issued `nz_session` HS256 JWT cookie instead
    # of the Bearer API key. Used VERBATIM as the HMAC key (UTF-8 bytes),
    # matching the Node services' `new TextEncoder().encode(secret)`.
    # Empty (default) disables the cookie path — only Bearer works.
    sso_session_secret: str = Field("", alias="SSO_SESSION_SECRET")

    # Admin service base URL used to authorize an SSO-authenticated account for
    # the `tts` service:
    #   GET {admin_authz_url}/api/internal/authz?account=<sub>&service=tts
    #   Authorization: Bearer <sso_session_secret>  → {"allowed": bool}
    # Empty (default) SKIPS the authz check so any valid SSO is accepted —
    # lets the per-service authorization roll out incrementally.
    admin_authz_url: str = Field("", alias="ADMIN_AUTHZ_URL")

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

    # Translation model — Llama 3.3 70B is the strongest multilingual chat
    # model on the free tier (12K TPM) and handles RU<->EN and the major
    # European/Asian languages well. Override via env if needed.
    translate_model: str = Field("llama-3.3-70b-versatile", alias="TRANSLATE_MODEL")

    data_dir: Path = Field(Path("/data"), alias="DATA_DIR")
    db_path: Path = Field(Path("/data/amethyst.sqlite"), alias="DB_PATH")
    audio_dir: Path = Field(Path("/data/audio"), alias="AUDIO_DIR")

    audio_retention_days: int = Field(90, alias="AUDIO_RETENTION_DAYS")

    pwa_dir: Path | None = Field(None, alias="PWA_DIR")

    cleanup_default_enabled: bool = Field(True, alias="CLEANUP_DEFAULT_ENABLED")
    cleanup_default_mode: str = Field("standard", alias="CLEANUP_DEFAULT_MODE")

    # Strip Whisper hallucinations (trailing "thanks for watching" /
    # "Продолжение следует" / "Субтитры сделал …" sign-offs, decoder repetition
    # loops, ALL-CAPS noise) from raw transcripts. On by default; set
    # SANITIZE_TRANSCRIPTS=false to get Whisper's output verbatim.
    sanitize_transcripts: bool = Field(True, alias="SANITIZE_TRANSCRIPTS")

    log_level: str = Field("INFO", alias="LOG_LEVEL")

    # /docs, /redoc, /openapi.json — off by default to avoid leaking the
    # API surface (SECURITY_AUDIT.md). Set EXPOSE_API_DOCS=true in .env
    # for local development.
    expose_api_docs: bool = Field(False, alias="EXPOSE_API_DOCS")


settings = Settings()
