"""
Text chunker for the polish-queue: splits a long transcript into pieces
small enough for a single LLM round-trip under a given TPM ceiling, while
keeping each chunk's content semantically coherent (sentence-aligned).

Approach:
  1. Walk the text and pull out sentences using a generous regex (handles
     `.`, `!`, `?` followed by whitespace or EOL, plus paragraph breaks).
  2. Greedily glue sentences into chunks until the next sentence would
     push over the per-chunk token budget.
  3. If a SINGLE sentence is itself longer than the budget, split it on
     soft boundaries (commas, semicolons, dashes) and finally on word
     boundaries — fallback degrades gracefully.

The chunks are returned as a list of strings, one per LLM call. Token
counts are estimated with the same `len(text) // 3` heuristic the
groq_client uses for its TPM-budget pre-flight check, so the two stay
consistent.
"""
from __future__ import annotations

import re

# `len(text) // _CHARS_PER_TOKEN` ≈ tokens, tuned for mixed Russian/Latin
# on GPT-OSS / Llama tokenizers. Pessimistic (over-estimates) to keep us
# safely under the TPM ceiling. Mirrors `_estimate_tokens` in groq_client.
_CHARS_PER_TOKEN = 3

# Sentence boundary: terminator (`.`, `!`, `?`) — possibly followed by a
# closing quote/bracket — then whitespace. Cyrillic and Latin both fall
# under \s and the punctuation set is universal enough.
_SENTENCE_BOUNDARY = re.compile(r'(?<=[.!?])(?:["»\')\]]+)?\s+')

# Soft boundaries inside an over-long sentence: comma, semicolon, en/em
# dash, double-newline. Used only when a sentence alone exceeds the budget.
_SOFT_BOUNDARY = re.compile(r'(?<=[,;—–])\s+|\n\n+')


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // _CHARS_PER_TOKEN)


def chunk_text(text: str, max_chunk_tokens: int) -> list[str]:
    """Split `text` into chunks each ≤ `max_chunk_tokens` tokens (estimated).

    Sentence-aligned where possible. If a sentence is itself too long, falls
    back to soft-punctuation boundaries, then to word-level splits as a last
    resort. Empty input → empty list. Whitespace-only chunks are filtered.

    The size check runs on the *joined* candidate string at each step rather
    than on a running sum of per-sentence estimates — sums under-count the
    join-space overhead by a few percent over many segments and that's
    enough to drift over the budget on long inputs.
    """
    text = (text or "").strip()
    if not text:
        return []
    if estimate_tokens(text) <= max_chunk_tokens:
        return [text]

    # First pass: split into sentences.
    sentences = _split_keep_separators(text, _SENTENCE_BOUNDARY)

    chunks: list[str] = []
    current = ""
    for sent in sentences:
        sent = sent.rstrip()
        if not sent:
            continue

        if estimate_tokens(sent) > max_chunk_tokens:
            # Flush current first, then split this monster sentence on soft
            # boundaries (commas, dashes, paragraph breaks).
            if current.strip():
                chunks.append(current.strip())
                current = ""
            chunks.extend(_split_oversized(sent, max_chunk_tokens))
            continue

        candidate = (current + " " + sent).strip() if current else sent
        if estimate_tokens(candidate) > max_chunk_tokens:
            chunks.append(current.strip())
            current = sent
        else:
            current = candidate

    if current.strip():
        chunks.append(current.strip())
    return [c for c in chunks if c.strip()]


def _split_keep_separators(text: str, pattern: re.Pattern) -> list[str]:
    """Split by `pattern` but keep each segment ending with whatever
    punctuation lived on its boundary. Done by walking match positions."""
    out: list[str] = []
    last = 0
    for m in pattern.finditer(text):
        end = m.start()
        seg = text[last:end + 0].strip()
        if seg:
            out.append(seg)
        last = m.end()
    tail = text[last:].strip()
    if tail:
        out.append(tail)
    return out


def _split_oversized(sentence: str, max_chunk_tokens: int) -> list[str]:
    """A single sentence is too long. Try soft punctuation; if still
    too long, split on word boundaries as a last resort.

    Uses the same joined-candidate sizing as chunk_text — running sums
    drift over the budget by a few percent on long inputs because the
    join space isn't counted, so we re-estimate the joined string each
    step instead.
    """
    parts = _split_keep_separators(sentence, _SOFT_BOUNDARY) or [sentence]
    out: list[str] = []
    current = ""
    for p in parts:
        if estimate_tokens(p) > max_chunk_tokens:
            # Even soft-split parts are too long → word-level chop.
            if current.strip():
                out.append(current.strip())
                current = ""
            out.extend(_word_split(p, max_chunk_tokens))
            continue
        candidate = (current + " " + p).strip() if current else p
        if estimate_tokens(candidate) > max_chunk_tokens:
            out.append(current.strip())
            current = p
        else:
            current = candidate
    if current.strip():
        out.append(current.strip())
    return out


def _word_split(text: str, max_chunk_tokens: int) -> list[str]:
    """Last-resort: chop on whitespace, packing words into ≤ budget chunks.
    Loses sentence-level coherence by definition, only used when one
    sentence has no soft-punctuation boundaries either."""
    words = text.split()
    out: list[str] = []
    current_words: list[str] = []
    for w in words:
        candidate = " ".join(current_words + [w])
        if estimate_tokens(candidate) > max_chunk_tokens and current_words:
            out.append(" ".join(current_words))
            current_words = [w]
        else:
            current_words.append(w)
    if current_words:
        out.append(" ".join(current_words))
    return out
