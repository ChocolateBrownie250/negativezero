import json
import logging
import time
from dataclasses import dataclass

from groq import AsyncGroq

from .config import settings
from .glossary import Glossary

log = logging.getLogger(__name__)

_client: AsyncGroq | None = None


def client() -> AsyncGroq:
    global _client
    if _client is None:
        _client = AsyncGroq(api_key=settings.groq_api_key)
    return _client


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


CLEANUP_INSTRUCTIONS = {
    "light": (
        "Fix ONLY misrecognized terms (especially those in the protected glossary), "
        "obvious homophones, and clearly garbled tokens. "
        "Do not touch punctuation, casing, word choice, filler words, or anything else."
    ),
    "standard": (
        "Fix misrecognized terms (especially those in the protected glossary) "
        "and obvious homophones. Add or correct sentence-level punctuation and "
        "capitalization where they are clearly missing or wrong. "
        "Do not paraphrase, do not shorten, do not add content, do not translate, "
        "do not change word choice unless it is clearly a recognition error."
    ),
    "aggressive": (
        "Fix misrecognized terms (especially those in the protected glossary), "
        "homophones, and recognition errors. Correct punctuation, capitalization, "
        "and obvious grammatical agreement issues. Remove disfluencies "
        "('uh', 'um', 'эээ'), false starts, and immediate word repetitions caused "
        "by hesitation. Preserve meaning, structure, and the speaker's voice. "
        "Do not paraphrase, do not summarize, do not translate, do not add new content."
    ),
}


def _build_cleanup_messages(
    *,
    raw_text: str,
    glossary: Glossary,
    mode: str,
    language: str | None,
) -> list[dict]:
    instructions = CLEANUP_INSTRUCTIONS.get(mode, CLEANUP_INSTRUCTIONS["standard"])
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
    messages = _build_cleanup_messages(
        raw_text=raw_text, glossary=glossary, mode=mode, language=language
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

POLISH_INSTRUCTIONS = {
    "light": (
        "Improve readability of a SPOKEN transcript without changing meaning "
        "or removing information. Allowed: remove disfluencies (uh, um, э-э, "
        "ну вот, типа, как бы), false starts, immediate word repetitions "
        "caused by hesitation, and trivial filler. "
        "Forbidden: rewording phrases, reordering sentences, paraphrasing, "
        "translating, summarising, adding or removing facts. "
        "Keep the speaker's word choice and sentence structure."
    ),
    "standard": (
        "Improve readability of a SPOKEN transcript while preserving meaning "
        "and the speaker's voice. Allowed: remove disfluencies, false starts, "
        "and immediate word repetitions; tighten obvious run-on sentences; "
        "fix glaring tautology; gently restructure broken syntax where the "
        "speaker corrected mid-sentence (e.g., 'я хотел... в общем, я решил "
        "пойти' → 'я решил пойти'). "
        "Forbidden: paraphrasing for style, reordering ideas, merging "
        "separate sentences into a different one, adding new content, "
        "translating, summarising. Keep the speaker's word choice."
    ),
    "strong": (
        "Turn a SPOKEN transcript into readable prose while preserving every "
        "fact, intent, and key term. The output should read like it was "
        "written, not transcribed. Allowed: remove disfluencies and filler; "
        "reorder words within a sentence for clarity; merge fragmentary "
        "sentences that belong together; add paragraph breaks where the "
        "speaker shifts topic; lightly rephrase awkward syntax; remove "
        "redundancy. "
        "Forbidden: introducing facts, opinions, or information not present "
        "in the source; translating; summarising; making the text shorter "
        "than ~85% of the original; changing the meaning of any sentence. "
        "The reader should still recognise the speaker's voice and tone."
    ),
}


def _build_polish_messages(
    *,
    text: str,
    glossary: Glossary,
    mode: str,
    language: str | None,
) -> list[dict]:
    instructions = POLISH_INSTRUCTIONS.get(mode, POLISH_INSTRUCTIONS["standard"])
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

    messages = _build_polish_messages(
        text=text, glossary=glossary, mode=mode, language=language
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
