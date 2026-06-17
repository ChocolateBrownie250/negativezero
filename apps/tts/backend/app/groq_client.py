import json
import logging
import time
from dataclasses import dataclass

from groq import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AsyncGroq,
    AuthenticationError,
    BadRequestError,
    PermissionDeniedError,
    RateLimitError,
)

from .config import settings
from .glossary import Glossary
from .prompts import resolve_instructions

log = logging.getLogger(__name__)

_client: AsyncGroq | None = None


def client() -> AsyncGroq:
    global _client
    if _client is None:
        _client = AsyncGroq(api_key=settings.groq_api_key)
    return _client


def _groq_message(exc: APIStatusError) -> str:
    """Best-effort extraction of Groq's human-readable error message.

    Groq returns ``{"error": {"message": "..."}}``; the SDK parses it into
    ``exc.body`` and usually also ``exc.message``. Fall back to ``str(exc)``.
    """
    try:
        body = exc.body
        if isinstance(body, dict):
            err = body.get("error")
            if isinstance(err, dict) and isinstance(err.get("message"), str):
                return err["message"]
    except Exception:  # pragma: no cover - defensive
        pass
    return getattr(exc, "message", None) or str(exc)


def map_upstream_error(exc: Exception, *, action: str) -> tuple[int, str]:
    """Map a Groq SDK exception to an ``(http_status, client_detail)`` pair.

    The routes used to collapse every Groq failure into an opaque
    ``502 "<action> upstream failed"``, which made a recurring failure
    impossible to diagnose from the client (it just shows "Bad Gateway").
    This names the real upstream cause — rate limit, rejected key, bad
    request, timeout — so the next failure is self-explanatory while still
    keeping the API key out of the response.

    ``action`` is a short verb phrase like "Transcription" or "Polish".
    """
    if isinstance(exc, RateLimitError):
        # 429 so the client can tell the user to retry rather than treating
        # it as a hard server fault. Groq's message carries the reset window.
        return 429, f"{action} rate-limited by Groq: {_groq_message(exc)}"
    if isinstance(exc, (AuthenticationError, PermissionDeniedError)):
        # Don't echo the upstream auth message (can hint at key material);
        # a fixed, actionable line is enough.
        return 502, f"{action} failed: Groq rejected the API key (check GROQ_API_KEY)"
    if isinstance(exc, BadRequestError):
        # e.g. an unsupported/decommissioned model or a malformed audio file.
        return 400, f"{action} rejected by Groq: {_groq_message(exc)}"
    if isinstance(exc, (APITimeoutError, APIConnectionError)):
        return 504, f"{action} upstream unreachable (Groq connection/timeout)"
    if isinstance(exc, APIStatusError):
        return 502, f"{action} upstream failed (Groq {exc.status_code}): {_groq_message(exc)}"
    # Non-Groq / unknown error — keep the old generic message.
    return 502, f"{action} upstream failed"


# Allowlists of Groq model ids we are willing to forward. Callers accept a
# model id from the client (form field / query param); without an allowlist
# that becomes arbitrary-model passthrough to Groq. Validate against these
# and reject unknown ids with a 400 at the API layer.
ALLOWED_WHISPER_MODELS = frozenset(
    {
        "whisper-large-v3",
        "whisper-large-v3-turbo",
    }
)

# Chat models usable for cleanup/polish. Keep in sync with _MODEL_TPM below,
# which enumerates every chat model we have a TPM budget for.
ALLOWED_CHAT_MODELS = frozenset(
    {
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "meta-llama/llama-4-scout-17b-16e-instruct",
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "qwen/qwen3-32b",
    }
)


def validate_whisper_model(model: str | None) -> None:
    """Raise ValueError if a non-empty Whisper model id isn't allowlisted.

    A falsy value means "use the configured default" and is always allowed.
    """
    if model and model not in ALLOWED_WHISPER_MODELS:
        raise ValueError(f"Unsupported Whisper model: {model!r}")


def validate_chat_model(model: str | None) -> None:
    """Raise ValueError if a non-empty chat model id isn't allowlisted.

    A falsy value means "use the configured default" and is always allowed.
    """
    if model and model not in ALLOWED_CHAT_MODELS:
        raise ValueError(f"Unsupported model: {model!r}")


@dataclass
class WhisperResult:
    text: str
    language: str | None
    duration_s: float | None
    model: str
    elapsed_ms: int


@dataclass
class CleanupResult:
    text: str
    model: str
    mode: str
    elapsed_ms: int


async def transcribe(
    *,
    file_bytes: bytes,
    filename: str,
    content_type: str,
    glossary: Glossary,
    language: str | None = None,
    extra_prompt: str | None = None,
    model: str | None = None,
) -> WhisperResult:
    """Send audio to Groq Whisper. Returns raw transcript + metadata."""
    used_model = model or settings.whisper_model
    prompt_parts: list[str] = []
    g_prompt = glossary.whisper_prompt()
    if g_prompt:
        prompt_parts.append(g_prompt)
    if extra_prompt:
        prompt_parts.append(extra_prompt.strip())
    prompt = ". ".join(prompt_parts) if prompt_parts else None

    started = time.monotonic()
    resp = await client().audio.transcriptions.create(
        file=(filename, file_bytes, content_type),
        model=used_model,
        prompt=prompt or "",
        language=language if language and language != "auto" else None,
        response_format="verbose_json",
        temperature=0.0,
    )
    elapsed_ms = int((time.monotonic() - started) * 1000)

    return WhisperResult(
        text=getattr(resp, "text", "").strip(),
        language=getattr(resp, "language", None),
        duration_s=getattr(resp, "duration", None),
        model=used_model,
        elapsed_ms=elapsed_ms,
    )


# The per-mode instruction text lives in prompts.py (it is user-editable);
# the surrounding scaffolding below is NOT editable so a custom instruction
# can never break term protection or the strict JSON output contract.


def _build_cleanup_messages(
    *,
    raw_text: str,
    glossary: Glossary,
    instructions: str,
    language: str | None,
) -> list[dict]:
    whitelist = glossary.whitelist_for_cleanup()
    anti_correct = glossary.anti_correct

    system = (
        "You are a corrector of automatic speech-recognition output. "
        "Your only job is to repair recognition errors while preserving the "
        "speaker's exact intent, structure, and word choice.\n\n"
        f"INSTRUCTIONS FOR THIS MODE: {instructions}\n\n"
        "PROTECTED GLOSSARY: the following terms must appear with this exact "
        "spelling and casing whenever the speaker meant them. If you see a "
        "garbled or transliterated version of any of them in the transcript, "
        "restore the canonical form below. Never replace one of these terms "
        "with something else.\n"
        f"{json.dumps(whitelist, ensure_ascii=False)}\n\n"
        "DO-NOT-CORRECT LIST: the following strings MUST be left exactly as "
        "they appear in the transcript, even if you think they are typos. "
        "These are user-defined codenames, internal jargon, or proper nouns "
        "the model is not allowed to second-guess.\n"
        f"{json.dumps(anti_correct, ensure_ascii=False)}\n\n"
        "When uncertain, leave the original text unchanged.\n\n"
        "OUTPUT FORMAT: respond with a single JSON object: "
        '{\"text\": \"<corrected transcript>\"}. '
        "No prose, no markdown, no explanation. Only the JSON object."
    )
    user = (
        (f"Language hint: {language}\n\n" if language else "")
        + f"Raw transcript:\n{raw_text}"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


async def cleanup(
    *,
    raw_text: str,
    glossary: Glossary,
    mode: str = "standard",
    language: str | None = None,
    model: str | None = None,
) -> CleanupResult:
    used_model = model or settings.cleanup_model
    instructions = await resolve_instructions("cleanup", mode)
    messages = _build_cleanup_messages(
        raw_text=raw_text, glossary=glossary, instructions=instructions, language=language
    )
    # Cleanup output is roughly the same length as input (just fixing
    # mishears + punctuation, no rewording). 1.10× input gives a small
    # headroom for added commas/periods.
    max_output = _budget_max_tokens(used_model, messages, output_ratio=1.10)

    started = time.monotonic()
    resp = await client().chat.completions.create(
        model=used_model,
        messages=messages,
        temperature=0.0,
        max_tokens=max_output,
        response_format={"type": "json_object"},
    )
    elapsed_ms = int((time.monotonic() - started) * 1000)
    raw_content = resp.choices[0].message.content or ""
    cleaned: str
    try:
        parsed = json.loads(raw_content)
        cleaned = (parsed.get("text") or "").strip()
        if not cleaned:
            log.warning("Empty 'text' in cleanup response, falling back to raw")
            cleaned = raw_text
    except json.JSONDecodeError:
        log.warning("Cleanup response was not JSON, falling back to raw. Got: %r", raw_content[:200])
        cleaned = raw_text

    return CleanupResult(
        text=cleaned,
        model=used_model,
        mode=mode,
        elapsed_ms=elapsed_ms,
    )


# ============================================================================
# Polish — different from cleanup: cleanup only fixes recognition errors;
# polish actively rewrites for readability of a SPOKEN transcript.
# ============================================================================

def _build_polish_messages(
    *,
    text: str,
    glossary: Glossary,
    instructions: str,
    language: str | None,
) -> list[dict]:
    # Polish uses a slimmer whitelist than cleanup (core + personal only,
    # no extended) — the long tail of niche tech terms isn't load-bearing
    # for rewording, and dropping it brings the system prompt under
    # gpt-oss-120b's 8 000 TPM free-tier ceiling. See ADR-012.
    whitelist = glossary.whitelist_for_polish()
    anti_correct = glossary.anti_correct

    system = (
        "You are a text polisher for a SPOKEN transcript. Your only job is "
        "to make the transcript more readable while preserving the speaker's "
        "intent, structure, and meaning.\n\n"
        f"INSTRUCTIONS FOR THIS MODE: {instructions}\n\n"
        "PROTECTED GLOSSARY: the following terms must appear with this exact "
        "spelling and casing whenever the speaker meant them. Never replace "
        "any of them with a synonym, translation, or differently-cased "
        "variant.\n"
        f"{json.dumps(whitelist, ensure_ascii=False)}\n\n"
        "DO-NOT-CORRECT LIST: the following strings MUST be left exactly as "
        "they appear in the input, even if you think they are typos. These "
        "are user-defined codenames, internal jargon, or proper nouns the "
        "model is not allowed to second-guess.\n"
        f"{json.dumps(anti_correct, ensure_ascii=False)}\n\n"
        "When uncertain, prefer the safer (smaller) edit.\n\n"
        "OUTPUT FORMAT: respond with a single JSON object: "
        '{"text": "<polished transcript>"}. '
        "No prose, no markdown, no explanation. Only the JSON object."
    )
    user = (
        (f"Language hint: {language}\n\n" if language else "")
        + f"Transcript:\n{text}"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def _estimate_tokens(text: str) -> int:
    """Rough char→token estimate that works decently for mixed Cyrillic/Latin
    on the GPT-OSS / Llama tokenizers. Russian tokenises ~2-3 chars per token,
    English ~4. The 3.0 average is intentionally pessimistic — better to
    over-estimate and stay under the TPM ceiling than under-estimate and
    bounce off a 413."""
    return max(1, len(text) // 3)


# Per-model TPM budget (free tier, May 2026). The polish-strong model
# `openai/gpt-oss-120b` has the tightest ceiling — 8 000 TPM — and Groq
# counts the request as `prompt_tokens + max_tokens` against the budget.
# So `max_tokens` has to be sized dynamically, not parked at a fixed 4 096.
_MODEL_TPM = {
    "openai/gpt-oss-120b": 8_000,
    "openai/gpt-oss-20b": 30_000,
    "meta-llama/llama-4-scout-17b-16e-instruct": 30_000,
    "llama-3.3-70b-versatile": 12_000,
    "llama-3.1-8b-instant": 14_400,
    "qwen/qwen3-32b": 6_000,
}


def _budget_max_tokens(model: str, messages: list[dict], output_ratio: float) -> int:
    """Compute a `max_tokens` value that fits in the model's TPM budget.

    Polish/cleanup output length is roughly equal to input length (we're
    rewording or repunctuating, not summarising or expanding). We allocate
    `input × output_ratio` for output, capped by the model's per-minute
    budget minus a safety margin.

    If the output budget can't accommodate at least ~70 % of input length,
    the model would have to truncate its response — and `response_format =
    json_object` doesn't gracefully handle a truncated JSON, you get a
    parse failure and the raw text is silently returned. So instead we
    raise ValueError up front; the API layer turns that into a 413 with a
    user-actionable message ("try a lighter mode" or "shorten transcript").
    """
    tpm = _MODEL_TPM.get(model, 8_000)
    safety = 300
    input_tokens = sum(_estimate_tokens(m["content"]) for m in messages)
    desired = int(input_tokens * output_ratio) + 200
    available = tpm - input_tokens - safety
    # Need enough room to faithfully reproduce most of the input, otherwise
    # the polished/cleaned response will be truncated.
    min_acceptable = max(256, int(input_tokens * 0.7))
    if available < min_acceptable:
        raise ValueError(
            f"Input is too long for {model} (~{input_tokens} input tokens, "
            f"{tpm} TPM ceiling, only {available} tokens left for output). "
            "Try a lighter mode or break the transcript into shorter parts."
        )
    return min(desired, available, 4096)


async def polish(
    *,
    text: str,
    glossary: Glossary,
    mode: str = "standard",
    language: str | None = None,
    model: str | None = None,
) -> CleanupResult:
    """Apply polish-mode rewriting to text. Returns CleanupResult shape so
    callers can treat polish + cleanup symmetrically."""
    if model:
        used_model = model
    elif mode == "strong":
        used_model = settings.polish_strong_model
    else:
        used_model = settings.polish_model_default

    instructions = await resolve_instructions("polish", mode)
    messages = _build_polish_messages(
        text=text, glossary=glossary, instructions=instructions, language=language
    )
    # Polish reword ≈ same length as input; allow 30 % growth to handle
    # mild expansion (clarifying restructures) without bloating the budget.
    max_output = _budget_max_tokens(used_model, messages, output_ratio=1.30)

    started = time.monotonic()
    resp = await client().chat.completions.create(
        model=used_model,
        messages=messages,
        # Polish needs a hair of creativity for restructuring; cleanup is 0.
        temperature=0.2,
        max_tokens=max_output,
        response_format={"type": "json_object"},
    )
    elapsed_ms = int((time.monotonic() - started) * 1000)
    raw_content = resp.choices[0].message.content or ""
    polished: str
    try:
        parsed = json.loads(raw_content)
        polished = (parsed.get("text") or "").strip()
        if not polished:
            log.warning("Empty 'text' in polish response, falling back to input")
            polished = text
    except json.JSONDecodeError:
        log.warning("Polish response was not JSON, falling back to input. Got: %r", raw_content[:200])
        polished = text

    return CleanupResult(
        text=polished,
        model=used_model,
        mode=mode,
        elapsed_ms=elapsed_ms,
    )


# ============================================================================
# Translate — a terminal step run over the best available text (raw/clean/
# polished). Reuses the chat models; preserves protected glossary terms.
# ============================================================================


def _build_translate_messages(
    *,
    text: str,
    glossary: Glossary,
    target_lang: str,
    source_lang: str | None,
) -> list[dict]:
    # Same slim whitelist as polish (core + personal); the long extended list
    # isn't load-bearing for translation and bloats the prompt budget.
    whitelist = glossary.whitelist_for_polish()
    anti_correct = glossary.anti_correct

    system = (
        "You are a professional translator. Translate the user's text into "
        f"{target_lang}. Preserve the meaning, tone, and register, and produce "
        "natural, fluent prose in the target language — not a word-for-word "
        "literal rendering.\n\n"
        "PROTECTED TERMS: keep the following names/terms EXACTLY as written — "
        "do not translate, transliterate, or re-case them:\n"
        f"{json.dumps(whitelist, ensure_ascii=False)}\n\n"
        "DO-NOT-TRANSLATE LIST: leave the following strings exactly as they "
        "appear in the source:\n"
        f"{json.dumps(anti_correct, ensure_ascii=False)}\n\n"
        "Do not summarise, omit, or add content that is not in the source. "
        "Do not add notes or explanations.\n\n"
        "OUTPUT FORMAT: respond with a single JSON object: "
        '{"text": "<translation>"}. '
        "No prose, no markdown, no explanation. Only the JSON object."
    )
    user = (
        (f"Source language: {source_lang}\n\n" if source_lang and source_lang != "auto" else "")
        + f"Text to translate:\n{text}"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


async def translate(
    *,
    text: str,
    glossary: Glossary,
    target_lang: str,
    source_lang: str | None = None,
    model: str | None = None,
) -> CleanupResult:
    """Translate text into target_lang. Returns CleanupResult (mode carries the
    target language) so callers can treat it like cleanup/polish."""
    used_model = model or settings.translate_model
    messages = _build_translate_messages(
        text=text, glossary=glossary, target_lang=target_lang, source_lang=source_lang
    )
    # Translation length varies by language pair (e.g. RU<->EN can swing ±30%);
    # allow 1.7× input so we don't truncate longer target renderings.
    max_output = _budget_max_tokens(used_model, messages, output_ratio=1.7)

    started = time.monotonic()
    resp = await client().chat.completions.create(
        model=used_model,
        messages=messages,
        temperature=0.2,
        max_tokens=max_output,
        response_format={"type": "json_object"},
    )
    elapsed_ms = int((time.monotonic() - started) * 1000)
    raw_content = resp.choices[0].message.content or ""
    translated: str
    try:
        parsed = json.loads(raw_content)
        translated = (parsed.get("text") or "").strip()
        if not translated:
            log.warning("Empty 'text' in translate response, falling back to input")
            translated = text
    except json.JSONDecodeError:
        log.warning("Translate response was not JSON, falling back to input. Got: %r", raw_content[:200])
        translated = text

    return CleanupResult(
        text=translated,
        model=used_model,
        mode=target_lang,
        elapsed_ms=elapsed_ms,
    )
