"""
Unit tests for backend.app.chunker. Pure Python, no network — runs locally
without hitting the deployed backend.

Run from repo root:
    uv run pytest tests/test_chunker.py -v
"""
from __future__ import annotations

import pytest

from backend.app.chunker import chunk_text, estimate_tokens

# ----- estimate_tokens ------------------------------------------------------

def test_estimate_tokens_empty():
    # Even empty input should return ≥ 1 (we treat zero specially elsewhere).
    assert estimate_tokens("") == 1


def test_estimate_tokens_scales_with_chars():
    # The heuristic is `chars // 3`. Not exact, but linear and predictable.
    assert estimate_tokens("a" * 30) == 10
    assert estimate_tokens("a" * 300) == 100


# ----- chunk_text — boundary cases -----------------------------------------

def test_chunk_empty_returns_empty():
    assert chunk_text("", 100) == []
    assert chunk_text("   \n  ", 100) == []


def test_chunk_short_returns_single_chunk():
    text = "Short sentence. Another short one."
    chunks = chunk_text(text, max_chunk_tokens=100)
    assert chunks == [text]


def test_chunk_below_budget_no_split():
    # Whole input fits in budget → single chunk preserves wording.
    text = "Hi. This is a test. Three sentences here."
    chunks = chunk_text(text, max_chunk_tokens=50)
    assert len(chunks) == 1
    assert chunks[0] == text.strip()


# ----- chunk_text — sentence-aligned splitting -----------------------------

def test_chunk_splits_at_sentence_boundaries():
    # 9 sentences each ~10 chars (~3 tokens). With budget 6 tokens we expect
    # ~2 sentences per chunk; chunker should never break mid-sentence.
    sents = ["AAA AAA. ", "BBB BBB. ", "CCC CCC. ", "DDD DDD. ",
             "EEE EEE. ", "FFF FFF. ", "GGG GGG. ", "HHH HHH. ",
             "III III. "]
    text = "".join(sents)
    chunks = chunk_text(text, max_chunk_tokens=6)
    assert len(chunks) > 1
    # Every chunk should end on a sentence terminator (".", "!", or "?").
    for c in chunks:
        assert c.rstrip()[-1] in ".!?", f"chunk doesn't end at sentence boundary: {c!r}"
    # Joining the chunks back gives the same content (modulo whitespace).
    rejoined = " ".join(chunks).replace("  ", " ")
    assert rejoined.replace(" ", "") == text.replace(" ", "").rstrip()


def test_chunk_respects_token_budget():
    # Many sentences. Every output chunk's estimated tokens should be ≤ budget.
    text = "Sentence number one. " * 200
    budget = 30
    chunks = chunk_text(text, max_chunk_tokens=budget)
    assert len(chunks) > 1
    for c in chunks:
        assert estimate_tokens(c) <= budget, (
            f"chunk overflowed budget: {estimate_tokens(c)} tokens vs {budget}"
        )


# ----- chunk_text — fallbacks for awkward inputs ---------------------------

def test_chunk_one_huge_sentence_uses_soft_boundaries():
    # A single sentence with internal commas, far longer than budget.
    text = (
        "Then I went to the store, bought some groceries, came back home, "
        "started cooking, realised I forgot the eggs, drove back, picked "
        "up the eggs, drove home again, finished cooking, sat down, ate, "
        "and felt very tired."
    )
    chunks = chunk_text(text, max_chunk_tokens=15)
    assert len(chunks) > 1
    for c in chunks:
        assert estimate_tokens(c) <= 15


def test_chunk_no_punctuation_falls_back_to_word_split():
    # No periods, no commas — chunker has to chop on whitespace as a last resort.
    text = " ".join(["word"] * 200)
    chunks = chunk_text(text, max_chunk_tokens=20)
    assert len(chunks) > 1
    for c in chunks:
        assert estimate_tokens(c) <= 20
        # Words preserved (no mid-word splits).
        for tok in c.split():
            assert tok == "word"


def test_chunk_cyrillic_handled_like_latin():
    # Russian text with sentence breaks. chars/3 estimator is pessimistic
    # for Cyrillic (which actually tokenises ~2 chars/token) — that's fine,
    # we'd rather over-estimate and stay safely under TPM.
    text = "Привет мир. " * 50
    chunks = chunk_text(text, max_chunk_tokens=30)
    assert len(chunks) > 1
    for c in chunks:
        assert estimate_tokens(c) <= 30
    # And nothing got dropped.
    assert "Привет мир" in chunks[0]
    assert "Привет мир" in chunks[-1]


# ----- chunk_text — preserves input modulo whitespace ----------------------

def test_chunk_preserves_content():
    text = (
        "First sentence here. Second one. Third one with a comma, then "
        "more text. Fourth! Fifth? Sixth and final."
    )
    chunks = chunk_text(text, max_chunk_tokens=15)
    rejoined = " ".join(chunks)

    # Strip whitespace differences and compare the dense character stream.
    def norm(s):
        return "".join(s.split())

    assert norm(rejoined) == norm(text)


@pytest.mark.parametrize("budget", [5, 10, 25, 100, 500])
def test_chunk_invariant_across_budgets(budget):
    text = "Lorem ipsum dolor sit amet. " * 100
    chunks = chunk_text(text, max_chunk_tokens=budget)
    # Regardless of budget, every chunk must respect it.
    for c in chunks:
        assert estimate_tokens(c) <= budget

    # And the union still covers the input.
    def norm(s):
        return "".join(s.split())

    assert norm(" ".join(chunks)) == norm(text)
