"""
Unit tests for backend.app.transcript_sanitizer — the anti-hallucination
post-processor for raw Whisper output. Pure Python, no network.

Run from repo root:
    uv run pytest tests/test_transcript_sanitizer.py -v
"""
from __future__ import annotations

import pytest

from backend.app.transcript_sanitizer import (
    collapse_repeats,
    sanitize_transcript,
    strip_boilerplate,
    strip_caps_gibberish,
)

# ----- strip_boilerplate ----------------------------------------------------

def test_strips_english_outro():
    text = "So that is the whole plan for today. Thanks for watching!"
    assert strip_boilerplate(text) == "So that is the whole plan for today."


def test_strips_russian_outro():
    text = "Ну вот примерно так всё и было. Спасибо за внимание."
    assert strip_boilerplate(text) == "Ну вот примерно так всё и было."


def test_strips_prodolzhenie_sleduet():
    text = "Мне снилось что-то примерно такое. Продолжение следует..."
    assert strip_boilerplate(text) == "Мне снилось что-то примерно такое."


def test_strips_fan_sub_credit_with_any_name():
    text = "Это был мой рассказ. Субтитры сделал DimaTorzok."
    assert strip_boilerplate(text) == "Это был мой рассказ."


def test_strips_editor_credit():
    text = "Конец истории. Редактор субтитров А.Синецкая Корректор А.Кулакова"
    assert strip_boilerplate(text) == "Конец истории."


def test_does_not_strip_boilerplate_in_the_middle():
    # "Спасибо за внимание" used mid-utterance is real speech — keep it.
    text = "Я сказал спасибо за внимание, и они начали задавать вопросы."
    assert strip_boilerplate(text) == text


def test_peels_multiple_trailing_signoffs():
    text = "Основная мысль ясна. Спасибо за внимание. Продолжение следует..."
    assert strip_boilerplate(text) == "Основная мысль ясна."


def test_whole_transcript_is_boilerplate_becomes_empty():
    assert strip_boilerplate("Thanks for watching!") == ""


def test_keeps_normal_trailing_sentence():
    text = "Первое предложение. Второе предложение."
    assert strip_boilerplate(text) == text


# ----- collapse_repeats -----------------------------------------------------

def test_collapses_repeated_phrase():
    text = "продолжение следует продолжение следует продолжение следует"
    assert collapse_repeats(text) == "продолжение следует"


def test_collapses_alternating_pair():
    text = "PYM JBZ PYM JBZ PYM JBZ PYM JBZ"
    assert collapse_repeats(text) == "PYM JBZ"


def test_collapses_single_word_loop():
    assert collapse_repeats("да да да да да да") == "да"


def test_keeps_two_repeats():
    # A doubled word is normal emphasis, not a decoder loop.
    assert collapse_repeats("очень очень важно") == "очень очень важно"


def test_collapse_preserves_surrounding_text():
    text = "начало so so so so конец"
    assert collapse_repeats(text) == "начало so конец"


def test_collapse_treats_curly_and_straight_edge_quotes_alike():
    # A repeated word quoted with mixed straight (') and curly (’) trailing
    # quotes must still collapse — _norm_token strips both from token edges.
    assert collapse_repeats("стоп' стоп’ стоп'") == "стоп'"


# ----- strip_caps_gibberish -------------------------------------------------

def test_strips_trailing_caps_pair():
    text = "и на этом я закончил голосовую PYM JBZ"
    assert strip_caps_gibberish(text) == "и на этом я закончил голосовую"


def test_strips_long_interior_caps_run():
    text = "слова ABC DEF GHI JKL ещё слова"
    assert strip_caps_gibberish(text) == "слова ещё слова"


def test_keeps_real_acronyms():
    text = "Я работаю в IT и читаю про AI"
    assert strip_caps_gibberish(text) == text


def test_keeps_single_unknown_acronym_in_middle():
    # One interior caps token below the run threshold is left alone — too risky
    # to drop (could be a real but unlisted acronym).
    text = "компания XYZ выпустила продукт"
    assert strip_caps_gibberish(text) == text


def test_keeps_trailing_real_acronym():
    text = "это сделали в NASA"
    assert strip_caps_gibberish(text) == text


# ----- sanitize_transcript (full pipeline) ----------------------------------

def test_full_pipeline_combines_all():
    text = (
        "Это мой обычный текст. Продолжение следует, продолжение следует, "
        "продолжение следует. PYM JBZ"
    )
    out = sanitize_transcript(text)
    assert out == "Это мой обычный текст."


def test_full_pipeline_leaves_clean_text_untouched():
    text = "Сегодня хороший день, и я хочу обсудить план работы на неделю."
    assert sanitize_transcript(text) == text


def test_full_pipeline_handles_empty():
    assert sanitize_transcript("") == ""
    assert sanitize_transcript("   ") == "   "


def test_repeated_boilerplate_then_stripped():
    # collapse_repeats reduces the loop to one instance, which strip_boilerplate
    # then peels off the end.
    text = "Главное сказано. Спасибо за внимание спасибо за внимание спасибо за внимание"
    assert sanitize_transcript(text) == "Главное сказано."


@pytest.mark.parametrize(
    "phrase",
    [
        "Thank you for watching",
        "Please subscribe",
        "Подписывайтесь на канал",
        "До новых встреч",
    ],
)
def test_assorted_outros_stripped(phrase):
    text = f"Содержательная часть здесь. {phrase}."
    assert sanitize_transcript(text) == "Содержательная часть здесь."
