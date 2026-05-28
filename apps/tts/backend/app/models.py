from typing import Literal

from pydantic import BaseModel, Field

CleanupMode     = Literal["light", "standard", "aggressive"]
PolishMode      = Literal["light", "standard", "strong"]
NoteCleanupMode = Literal["off", "light", "standard", "aggressive"]
NotePolishMode  = Literal["off", "light", "standard", "strong"]


class TranscriptionResponse(BaseModel):
    id: str
    text: str = Field(..., description="text_polished ?? text_clean ?? text_raw")
    text_raw: str
    text_clean: str | None
    text_polished: str | None = None
    language: str | None
    duration_s: float | None
    source: str | None
    whisper_model: str
    cleanup_model: str | None
    cleanup_mode: str | None
    polish_model: str | None = None
    polish_mode: str | None = None
    whisper_ms: int | None
    cleanup_ms: int | None
    polish_ms: int | None = None
    audio_path: str | None
    audio_bytes: int | None
    audio_format: str | None
    created_at: int


class TranscriptionListItem(BaseModel):
    id: str
    text: str
    language: str | None
    duration_s: float | None
    source: str | None
    has_audio: bool
    created_at: int


class TranscriptionListResponse(BaseModel):
    items: list[TranscriptionListItem]
    next_cursor: int | None = None


class GlossaryView(BaseModel):
    core: list[str]
    extended: list[str]
    personal: list[str]
    anti_correct: list[str]


class GlossaryUpdate(BaseModel):
    personal: list[str] | None = None
    anti_correct: list[str] | None = None


class HealthResponse(BaseModel):
    status: str
    version: str


# ---------- Notes ----------

class NoteResponse(BaseModel):
    id: str
    title: str
    body: str
    cleanup_mode: str        # off | light | standard | aggressive
    polish_mode: str         # off | light | standard | strong
    language: str            # auto | ru | en | …
    queue_status: str | None = None        # null | processing | done | failed
    queue_kind: str | None = None          # 'polish' for now
    queue_total_chunks: int | None = None
    queue_completed_chunks: int = 0
    created_at: int
    updated_at: int


class NoteListItem(BaseModel):
    id: str
    title: str
    snippet: str
    queue_status: str | None = None        # null | processing | done | failed
    queue_total_chunks: int | None = None
    queue_completed_chunks: int = 0
    updated_at: int
    created_at: int


class NoteListResponse(BaseModel):
    items: list[NoteListItem]
    next_cursor: int | None = None


class NoteCreate(BaseModel):
    title: str | None = None
    body: str | None = None
    cleanup_mode: NoteCleanupMode | None = None
    polish_mode: NotePolishMode | None = None
    language: str | None = None


class NoteUpdate(BaseModel):
    title: str | None = None
    body: str | None = None
    cleanup_mode: NoteCleanupMode | None = None
    polish_mode: NotePolishMode | None = None
    language: str | None = None


class NoteDictateResponse(BaseModel):
    """Returned after /notes/{id}/dictate. The client inserts `text` at the
    saved cursor offset and PATCHes the body itself — the server doesn't
    touch the note body here so the user can keep typing during the
    network round-trip without merge conflicts."""
    text: str
    text_raw: str
    text_clean: str | None = None
    text_polished: str | None = None
    language: str | None = None
    whisper_ms: int
    cleanup_ms: int | None = None
    polish_ms: int | None = None
