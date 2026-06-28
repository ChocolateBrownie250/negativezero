import logging
import time
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from ulid import ULID

from ..auth import verify_auth
from ..config import settings
from ..db import get_db
from ..glossary import load_glossary
from ..groq_client import cleanup as groq_cleanup
from ..groq_client import map_upstream_error, validate_chat_model, validate_whisper_model
from ..groq_client import transcribe as groq_transcribe
from ..models import CleanupMode, TranscriptionResponse
from ..storage import GROQ_AUDIO_LIMIT_BYTES, save_audio

log = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(verify_auth)])


def _ext_from_upload(file: UploadFile) -> str:
    if file.filename:
        suffix = Path(file.filename).suffix.lstrip(".").lower()
        if suffix:
            return suffix
    ct = (file.content_type or "").lower()
    mapping = {
        "audio/m4a": "m4a", "audio/mp4": "m4a", "audio/x-m4a": "m4a",
        "audio/mpeg": "mp3", "audio/mp3": "mp3",
        "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav",
        "audio/webm": "webm", "audio/ogg": "ogg", "audio/flac": "flac",
    }
    return mapping.get(ct, "bin")


def _ext_from_content_type(content_type: str | None) -> str:
    ct = (content_type or "").lower().split(";", 1)[0].strip()
    mapping = {
        "audio/m4a": "m4a",
        "audio/mp4": "m4a",
        "audio/x-m4a": "m4a",
        "audio/mpeg": "mp3",
        "audio/mp3": "mp3",
        "audio/wav": "wav",
        "audio/x-wav": "wav",
        "audio/wave": "wav",
        "audio/webm": "webm",
        "audio/ogg": "ogg",
        "audio/flac": "flac",
    }
    return mapping.get(ct, "m4a")


async def _transcribe_bytes(
    *,
    data: bytes,
    filename: str,
    content_type: str,
    source: str | None,
    cleanup: bool | None,
    cleanup_mode: CleanupMode | None,
    language: str | None,
    model: str | None,
    cleanup_model: str | None,
    prompt: str | None,
    keep_audio: bool,
) -> TranscriptionResponse:
    do_cleanup = settings.cleanup_default_enabled if cleanup is None else cleanup
    mode = cleanup_mode or settings.cleanup_default_mode

    try:
        validate_whisper_model(model)
        validate_chat_model(cleanup_model)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    if not data:
        raise HTTPException(400, "Empty file")
    if len(data) > GROQ_AUDIO_LIMIT_BYTES:
        raise HTTPException(
            413,
            f"Audio too large: {len(data)} bytes; Groq Whisper limit is {GROQ_AUDIO_LIMIT_BYTES}",
        )

    glossary = await load_glossary()
    transcription_id = str(ULID())
    ext = Path(filename).suffix.lstrip(".").lower() or _ext_from_content_type(content_type)

    try:
        whisper = await groq_transcribe(
            file_bytes=data,
            filename=filename,
            content_type=content_type,
            glossary=glossary,
            language=language,
            extra_prompt=prompt,
            model=model,
        )
    except Exception as exc:
        log.exception("Whisper call failed")
        status, detail = map_upstream_error(exc, action="Transcription")
        raise HTTPException(status, detail) from exc

    text_raw = whisper.text
    text_clean: str | None = None
    cleanup_model_used: str | None = None
    cleanup_mode_used: str | None = None
    cleanup_ms: int | None = None

    if do_cleanup and text_raw:
        try:
            cl = await groq_cleanup(
                raw_text=text_raw,
                glossary=glossary,
                mode=mode,
                language=whisper.language or language,
                model=cleanup_model,
            )
            text_clean = cl.text
            cleanup_model_used = cl.model
            cleanup_mode_used = cl.mode
            cleanup_ms = cl.elapsed_ms
        except Exception:
            log.exception("Cleanup failed; returning raw text only")

    audio_path: str | None = None
    if keep_audio:
        try:
            saved = await save_audio(transcription_id, ext, data)
            audio_path = str(saved)
        except Exception:
            log.exception("Failed to persist audio; continuing with text only")

    created_at = int(time.time())
    async with get_db() as conn:
        await conn.execute(
            """
            INSERT INTO transcriptions (
                id, source, language, duration_s,
                whisper_model, cleanup_model, cleanup_mode,
                text_raw, text_clean,
                audio_path, audio_bytes, audio_format,
                whisper_ms, cleanup_ms, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                transcription_id, source, whisper.language, whisper.duration_s,
                whisper.model, cleanup_model_used, cleanup_mode_used,
                text_raw, text_clean,
                audio_path, len(data) if audio_path else None, ext if audio_path else None,
                whisper.elapsed_ms, cleanup_ms, created_at,
            ),
        )
        await conn.commit()

    return TranscriptionResponse(
        id=transcription_id,
        text=text_clean or text_raw,
        text_raw=text_raw,
        text_clean=text_clean,
        language=whisper.language,
        duration_s=whisper.duration_s,
        source=source,
        whisper_model=whisper.model,
        cleanup_model=cleanup_model_used,
        cleanup_mode=cleanup_mode_used,
        whisper_ms=whisper.elapsed_ms,
        cleanup_ms=cleanup_ms,
        audio_path=audio_path,
        audio_bytes=len(data) if audio_path else None,
        audio_format=ext if audio_path else None,
        created_at=created_at,
    )


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    file: Annotated[UploadFile, File(...)],
    cleanup: Annotated[bool | None, Form()] = None,
    cleanup_mode: Annotated[CleanupMode | None, Form()] = None,
    language: Annotated[str | None, Form()] = None,
    model: Annotated[str | None, Form()] = None,
    cleanup_model: Annotated[str | None, Form()] = None,
    source: Annotated[str | None, Form()] = None,
    prompt: Annotated[str | None, Form()] = None,
    keep_audio: Annotated[bool, Form()] = True,
) -> TranscriptionResponse:
    data = await file.read()
    ext = _ext_from_upload(file)
    content_type = file.content_type or f"audio/{ext}"
    return await _transcribe_bytes(
        data=data,
        filename=file.filename or f"audio.{ext}",
        content_type=content_type,
        source=source,
        cleanup=cleanup,
        cleanup_mode=cleanup_mode,
        language=language,
        model=model,
        cleanup_model=cleanup_model,
        prompt=prompt,
        keep_audio=keep_audio,
    )


async def _raw_transcribe_request(
    request: Request,
    cleanup: bool | None,
    cleanup_mode: CleanupMode | None,
    language: str | None,
    model: str | None,
    cleanup_model: str | None,
    source: str | None,
    prompt: str | None,
    keep_audio: bool,
) -> TranscriptionResponse:
    data = await request.body()
    content_type = request.headers.get("content-type") or "audio/mp4"
    ext = _ext_from_content_type(content_type)
    return await _transcribe_bytes(
        data=data,
        filename=f"shortcut.{ext}",
        content_type=content_type,
        source=source,
        cleanup=cleanup,
        cleanup_mode=cleanup_mode,
        language=language,
        model=model,
        cleanup_model=cleanup_model,
        prompt=prompt,
        keep_audio=keep_audio,
    )


@router.post("/shortcuts/transcribe", response_model=TranscriptionResponse)
async def transcribe_shortcut_raw(
    request: Request,
    cleanup: bool | None = None,
    cleanup_mode: CleanupMode | None = None,
    language: str | None = None,
    model: str | None = None,
    cleanup_model: str | None = None,
    source: str | None = "action_button",
    prompt: str | None = None,
    keep_audio: bool = False,
) -> TranscriptionResponse:
    return await _raw_transcribe_request(
        request,
        cleanup,
        cleanup_mode,
        language,
        model,
        cleanup_model,
        source,
        prompt,
        keep_audio,
    )


@router.post("/transcribe/file", response_model=TranscriptionResponse)
async def transcribe_file_raw(
    request: Request,
    cleanup: bool | None = None,
    cleanup_mode: CleanupMode | None = None,
    language: str | None = None,
    model: str | None = None,
    cleanup_model: str | None = None,
    source: str | None = "action_button",
    prompt: str | None = None,
    keep_audio: bool = False,
) -> TranscriptionResponse:
    return await _raw_transcribe_request(
        request,
        cleanup,
        cleanup_mode,
        language,
        model,
        cleanup_model,
        source,
        prompt,
        keep_audio,
    )
