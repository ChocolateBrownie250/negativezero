"""
Post-processing for raw Whisper output: strip the model's well-known
*hallucinations*.

Whisper (and the Groq-hosted large-v3 / turbo variants) was trained on a large
corpus of YouTube-style audio + subtitles. On low-energy audio — trailing
silence after the speaker stops, breaths, room tone, a held pause mid-sentence —
the acoustic model has nothing to transcribe, so the language model "completes"
the sequence with the boilerplate that most often followed silence in its
training data:

  • trailing sign-offs — "Thank you for watching", "Please subscribe",
    "Продолжение следует", "Спасибо за внимание";
  • subtitle credits — "Субтитры сделал DimaTorzok", "Редактор субтитров …",
    "Корректор …" (these come from fan-subbed videos and are *always* spurious);
  • degenerate repetition — the same short token or 2-3 token group repeated
    many times in a row ("Продолжение следует, продолжение следует, …"), and
    short runs of meaningless ALL-CAPS tokens ("PYM JBZ") that the decoder
    falls into on noise.

None of these are things the user said, and they recur consistently, so we
remove them here — once, centrally, on the raw transcript — before it is shown,
stored, or fed to the cleanup/polish LLM.

Design constraints:
  • Conservative by construction. Boilerplate sign-offs are only stripped from
    the START or END of the transcript (where the silence that triggers them
    lives), never from the middle, so a phrase the speaker genuinely used in the
    body of their speech survives.
  • Never raises. ``sanitize_transcript`` wraps the whole pipeline so any
    unexpected input falls back to returning the text unchanged — a bad sanitise
    must never turn a good transcript into an error.
  • Pure / offline. No network, no model calls — fast regex + string work, so it
    can run inline on every transcription.
"""
from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Known boilerplate sign-offs.
#
# Matched against a *normalised* segment (lower-cased, punctuation/emoji/space
# collapsed) only when that segment sits at the very start or end of the
# transcript. Keep entries lower-case and punctuation-free.
# ---------------------------------------------------------------------------
_BOILERPLATE_PHRASES: frozenset[str] = frozenset(
    {
        # English — YouTube outro boilerplate.
        "thanks for watching",
        "thank you for watching",
        "thanks for watching this video",
        "thank you for watching this video",
        "thanks for watching and see you next time",
        "thank you so much for watching",
        "please subscribe",
        "please like and subscribe",
        "like and subscribe",
        "dont forget to subscribe",
        "subscribe to my channel",
        "see you in the next video",
        "see you next time",
        "thank you for your attention",
        "thank you",
        # Russian — outro boilerplate + the infamous fan-sub credits.
        "продолжение следует",
        "спасибо за внимание",
        "спасибо за просмотр",
        "подписывайтесь на канал",
        "ставьте лайки",
        "ставьте лайки и подписывайтесь",
        "до новых встреч",
        "редактор субтитров",
    }
)

# Subtitle-credit lines are *always* hallucinations in dictated audio — nobody
# dictating a voice note signs it "Субтитры сделал …". Match the whole trailing
# (or leading) segment if it looks like a credit, regardless of the trailing
# name, so we catch every "DimaTorzok"-style variant without enumerating names.
_CREDIT_SEGMENT_RE = re.compile(
    r"""^\s*(
        субтитры\b.*               # "Субтитры сделал/создавал/подготовил …"
        | редактор\s+субтитров\b.*
        | корректор\b.*
        | subtitles\s+by\b.*
        | amara\.org.*             # community-subtitle watermark
    )\s*$""",
    re.IGNORECASE | re.VERBOSE,
)

# A short, meaningless ALL-CAPS token the decoder emits on noise: 2-6 letters,
# Latin or Cyrillic, all upper-case. Common real acronyms are allow-listed below
# so we don't eat "USA", "FBI", "НАТО", etc.
_CAPS_TOKEN_RE = re.compile(r"^[A-ZА-ЯЁ]{2,6}$")
_REAL_ACRONYMS: frozenset[str] = frozenset(
    {
        "USA", "US", "UK", "EU", "UN", "USSR", "UAE",
        "FBI", "CIA", "KGB", "NASA", "NATO", "WHO", "WTO",
        "IT", "AI", "API", "URL", "URI", "CPU", "GPU", "RAM", "SSD", "USB",
        "GPS", "SMS", "PDF", "HTML", "CSS", "JSON", "SQL", "HTTP", "HTTPS",
        "CEO", "CTO", "CFO", "COO", "HR", "PR", "OK", "TV", "PC", "ID", "DJ",
        "США", "СССР", "РФ", "СНГ", "НАТО", "ООН", "ЕС", "ФБР", "ЦРУ", "КГБ",
        "МВД", "ФСБ", "ГИБДД", "ВВП", "ИИ", "ПО", "СМИ", "ТВ",
    }
)

# How many times a unit must repeat back-to-back before we treat it as a
# decoder loop rather than deliberate emphasis ("ха-ха-ха" stays; eight
# identical copies do not).
_MIN_REPEATS = 3


# Precompiled once: `_normalise` runs on every segment of every transcript.
_NON_WORD_RE = re.compile(r"[^\w\s]", re.UNICODE)
_WS_RUN_RE = re.compile(r"\s+")
# Punctuation stripped from token edges before comparison. Includes both
# straight (') and curly (’‘) apostrophes so "don't"/"don’t" compare equal.
_TOKEN_EDGE_PUNCT = ".,!?;:…\"'’‘()[]«»-—"


def _normalise(segment: str) -> str:
    """Lower-case and strip everything that isn't a word character or space, so
    boilerplate matches regardless of punctuation, emoji, or casing."""
    s = segment.lower()
    # Drop apostrophes inside words ("don't" -> "dont") then non-word -> space.
    s = s.replace("'", "").replace("’", "")
    s = _NON_WORD_RE.sub(" ", s)
    s = _WS_RUN_RE.sub(" ", s)
    return s.strip()


def _is_boilerplate_segment(segment: str) -> bool:
    if _CREDIT_SEGMENT_RE.match(segment.strip()):
        return True
    return _normalise(segment) in _BOILERPLATE_PHRASES


# Split into segments on sentence terminators and line breaks, KEEPING the
# delimiter with its segment so re-joining preserves the original punctuation
# of the parts we keep.
_SEGMENT_SPLIT_RE = re.compile(r"(?<=[.!?…])\s+|\n+")


def strip_boilerplate(text: str) -> str:
    """Remove hallucinated sign-off / credit segments from the start and end.

    Only the outermost segments are examined: we peel matching segments off the
    end (then the start) until a real one remains. Nothing in the interior is
    touched, so a phrase the speaker actually used mid-utterance is safe.
    """
    if not text.strip():
        return text

    segments = [s.strip() for s in _SEGMENT_SPLIT_RE.split(text) if s.strip()]
    if not segments:
        return text

    # Peel hallucinated segments off the tail, then the head.
    while segments and _is_boilerplate_segment(segments[-1]):
        segments.pop()
    while segments and _is_boilerplate_segment(segments[0]):
        segments.pop(0)

    return " ".join(segments).strip()


def _norm_token(token: str) -> str:
    """Compare tokens case- and punctuation-insensitively, so a decoder loop
    whose copies differ only in trailing comma/period or capitalisation
    ("Продолжение следует, продолжение следует.") is still recognised as one."""
    return token.lower().strip(_TOKEN_EDGE_PUNCT)


def collapse_repeats(text: str) -> str:
    """Collapse a unit (1-5 consecutive words) repeated ``_MIN_REPEATS``+ times
    back-to-back down to a single occurrence.

    Catches the decoder's repetition loops — "продолжение следует продолжение
    следует продолжение следует" and alternating-pair noise like
    "PYM JBZ PYM JBZ PYM JBZ" (unit = "PYM JBZ") — while leaving a doubled word
    ("очень очень") or a deliberate "ха ха" of two repeats alone.

    The kept copy uses the ORIGINAL tokens of the first occurrence (punctuation
    and casing intact); only the *comparison* is normalised.
    """
    if not text.strip():
        return text

    words = text.split()
    n = len(words)
    if n < 2:
        return text
    norm = [_norm_token(w) for w in words]

    out: list[str] = []
    i = 0
    while i < n:
        # Pick the SMALLEST unit length that repeats — the minimal period — so a
        # run of identical words collapses to one word, while an alternating
        # pair collapses to the pair. Ascending search + strict ">" keeps the
        # first (smallest) unit length on ties.
        best_unit_len = 0
        best_consumed = 0
        max_unit = min(5, (n - i) // _MIN_REPEATS)
        for unit_len in range(1, max_unit + 1):
            unit = norm[i : i + unit_len]
            reps = 1
            j = i + unit_len
            while j + unit_len <= n and norm[j : j + unit_len] == unit:
                reps += 1
                j += unit_len
            if reps >= _MIN_REPEATS and reps * unit_len > best_consumed:
                best_consumed = reps * unit_len
                best_unit_len = unit_len
        if best_unit_len:
            out.extend(words[i : i + best_unit_len])
            i += best_consumed
        else:
            out.append(words[i])
            i += 1

    return " ".join(out)


def _is_caps_gibberish(token: str) -> bool:
    # Strip surrounding punctuation the tokenizer left attached.
    core = token.strip(_TOKEN_EDGE_PUNCT)
    if not core or core.upper() in _REAL_ACRONYMS:
        return False
    return bool(_CAPS_TOKEN_RE.match(core))


def strip_caps_gibberish(text: str) -> str:
    """Remove runs of short ALL-CAPS noise tokens ("PYM JBZ").

    Two cases the decoder produces:
      • A run of >= 3 such tokens anywhere → almost certainly noise, removed.
      • A run of >= 2 such tokens at the very END of the transcript → the
        "appears just before I stopped talking" case the user reported; removed.
    A single interior acronym, or two real acronyms together, is preserved by
    the allow-list and the run-length thresholds.
    """
    if not text.strip():
        return text

    words = text.split()
    n = len(words)
    flags = [_is_caps_gibberish(w) for w in words]

    remove = [False] * n
    i = 0
    while i < n:
        if flags[i]:
            j = i
            while j < n and flags[j]:
                j += 1
            run_len = j - i
            at_end = j == n
            if run_len >= 3 or (at_end and run_len >= 2):
                for k in range(i, j):
                    remove[k] = True
            i = j
        else:
            i += 1

    kept = [w for w, drop in zip(words, remove, strict=True) if not drop]
    return " ".join(kept)


def sanitize_transcript(text: str) -> str:
    """Run the full anti-hallucination pipeline on a raw Whisper transcript.

    Order matters: collapse repetition loops first (so a repeated boilerplate
    phrase becomes a single instance the boilerplate stripper can then match),
    drop caps-gibberish, then peel boilerplate sign-offs/credits off the ends.
    Never raises — on any internal error the original text is returned.
    """
    if not text or not text.strip():
        return text
    try:
        cleaned = collapse_repeats(text)
        cleaned = strip_caps_gibberish(cleaned)
        cleaned = strip_boilerplate(cleaned)
        cleaned = cleaned.strip()
        # If sanitising nuked everything (e.g. the whole clip was silence and
        # Whisper returned pure boilerplate), prefer empty over the hallucination.
        return cleaned
    except Exception:  # pragma: no cover - defensive; must never break a transcript
        return text
