# syntax=docker/dockerfile:1.6
# python:3.12-slim — matches the upstream amethyst image this service was
# imported from. The Python deps are small and stable; pip-installing them
# directly from a pinned list keeps the image free of uv/poetry tooling.
#
# Non-root UID 999 matches the convention used by apps/bookmark-manager and
# apps/admin: platform/deploy.sh chowns platform/data/<service>/ to 999:999
# before `docker compose up`, so the bind-mounted /data inside the container
# is writable without running as root.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml /app/pyproject.toml
RUN pip install --no-cache-dir \
        "fastapi>=0.115" \
        "uvicorn[standard]>=0.32" \
        "python-multipart>=0.0.12" \
        "pydantic>=2.9" \
        "pydantic-settings>=2.6" \
        "groq>=0.13" \
        "argon2-cffi>=23.1" \
        "aiosqlite>=0.20" \
        "python-ulid>=3.0" \
        "httpx>=0.27" \
        "pyjwt>=2.8"

COPY backend/app /app/app
COPY pwa /app/pwa

RUN groupadd -r app --gid 999 && useradd -r -g app --uid 999 app \
    && mkdir -p /data \
    && chown -R app:app /app /data
USER app

EXPOSE 3000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-3000} --proxy-headers --forwarded-allow-ips=*"]
