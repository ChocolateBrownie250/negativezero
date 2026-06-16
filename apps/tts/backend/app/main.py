import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import init_db
from .models import HealthResponse
from .polish_queue import start_worker as start_polish_worker
from .polish_queue import stop_worker as stop_polish_worker
from .routes.notes import router as notes_router
from .routes.prompts import router as prompts_router
from .routes.settings import router as settings_router
from .routes.transcribe import router as transcribe_router
from .routes.transcriptions import router as transcriptions_router
from .routes.usage import router as usage_router
from .storage import audio_purge_loop

VERSION = "0.1.0"


def _resolve_pwa_dir() -> Path | None:
    if settings.pwa_dir:
        return settings.pwa_dir if settings.pwa_dir.exists() else None
    candidates = [
        Path.cwd() / "pwa",
        Path(__file__).resolve().parents[2] / "pwa",  # local: backend/app -> project root
        Path("/app/pwa"),                              # container layout
    ]
    for c in candidates:
        if c.exists():
            return c
    return None


PWA_DIR = _resolve_pwa_dir()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    await init_db()
    purge_task = asyncio.create_task(audio_purge_loop())
    start_polish_worker()
    try:
        yield
    finally:
        stop_polish_worker()
        purge_task.cancel()
        try:
            await purge_task
        except asyncio.CancelledError:
            pass


# OpenAPI / Swagger / ReDoc are disabled in production — they leak the
# API surface to anonymous callers (flagged in SECURITY_AUDIT.md). To re-
# enable for local development, set EXPOSE_API_DOCS=true in .env.
app = FastAPI(
    title="Amethyst",
    version=VERSION,
    lifespan=lifespan,
    docs_url="/docs" if settings.expose_api_docs else None,
    redoc_url="/redoc" if settings.expose_api_docs else None,
    openapi_url="/openapi.json" if settings.expose_api_docs else None,
)

# The PWA is served same-origin from this same app, so cross-origin requests
# are not part of normal operation. Rather than `allow_origins=["*"]` (which
# lets any site script the API on behalf of a visitor), restrict to the known
# PWA origin derived from PUBLIC_HOST. localhost also gets its http:// origin
# for local development over plain HTTP.
def _allowed_origins() -> list[str]:
    host = (settings.public_host or "").strip()
    if not host or host == "localhost":
        return ["http://localhost", "https://localhost"]
    return [f"https://{host}"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", version=VERSION)


app.include_router(transcribe_router, prefix="/api/v1", tags=["transcribe"])
app.include_router(transcriptions_router, prefix="/api/v1", tags=["transcriptions"])
app.include_router(notes_router, prefix="/api/v1", tags=["notes"])
app.include_router(settings_router, prefix="/api/v1", tags=["settings"])
app.include_router(prompts_router, prefix="/api/v1", tags=["prompts"])
app.include_router(usage_router, prefix="/api/v1", tags=["usage"])


# Serve PWA at root if its directory is mounted into the container
if PWA_DIR is not None:

    # The service worker MUST never be HTTP-cached: browsers only check for
    # SW updates roughly once per 24 h, and only by re-fetching this exact
    # file. If a CDN or browser cache holds an old sw.js, every connected
    # client sticks on whatever cache strategy that old SW had — we saw
    # a real case of a v6 cache-first SW refusing to roll over to a v7
    # stale-while-revalidate even after deploys. `no-cache, must-revalidate`
    # forces the browser to do a conditional GET on every page load.
    @app.get("/sw.js")
    async def service_worker() -> FileResponse:
        return FileResponse(
            PWA_DIR / "sw.js",
            media_type="application/javascript",
            headers={"Cache-Control": "no-cache, must-revalidate"},
        )

    @app.get("/")
    async def root_index() -> FileResponse:
        # index.html should also never be HTTP-cached so deploys land on the
        # next visit rather than waiting for some opaque proxy TTL. The CSS,
        # JS, and other assets are still cached normally and are versioned
        # via the SW + cache-busting query strings as needed.
        return FileResponse(
            PWA_DIR / "index.html",
            headers={"Cache-Control": "no-cache, must-revalidate"},
        )

    app.mount("/", StaticFiles(directory=str(PWA_DIR), html=True), name="pwa")
