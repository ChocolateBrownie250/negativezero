"""Editable per-stage / per-mode model instructions.

Each (stage, mode) ships a default instruction block. The user may override
that block and/or append extra rules of their own. **Only this per-mode block
is editable** — the surrounding safety scaffolding (protected glossary,
do-not-translate / do-not-summarise, strict JSON output format) is assembled in
``groq_client`` and is NOT user-editable, so a bad edit can degrade quality but
cannot break term protection or response parsing.

Overrides are stored in the ``settings`` table:

    prompt.<stage>.<mode>.base    overrides the shipped default block
    prompt.<stage>.<mode>.extra   appended AFTER the (default or overridden) block

A missing/blank ``base`` falls back to the shipped default; a reset deletes both
keys. A ``base`` equal to the shipped default is never persisted, so a future
change to the default text still propagates to anyone who didn't truly
customise it.

These defaults are the single source of truth for the cleanup/polish system
prompts — ``groq_client`` imports nothing prompt-related from anywhere else.
"""

from .db import delete_setting, get_setting, set_setting

# ---------------------------------------------------------------------------
# Shipped defaults. Moved here from groq_client so the editable text and the
# runtime prompt share one definition.
# ---------------------------------------------------------------------------

CLEANUP_DEFAULTS: dict[str, str] = {
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

POLISH_DEFAULTS: dict[str, str] = {
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

STAGES: dict[str, dict[str, str]] = {
    "cleanup": CLEANUP_DEFAULTS,
    "polish": POLISH_DEFAULTS,
}

# Human-facing labels + one-line descriptions for the editor UI.
STAGE_LABELS: dict[str, str] = {"cleanup": "Cleanup", "polish": "Polish"}
STAGE_DESC: dict[str, str] = {
    "cleanup": "Fixes recognition errors. Runs on dictated audio before you see it.",
    "polish": "Rewrites a transcript for readability without changing meaning.",
}
MODE_NOTE: dict[str, str] = {
    "light": "gentlest",
    "standard": "recommended",
    "aggressive": "strongest",
    "strong": "strongest",
}

# Order modes weakest → strongest for display, matching the pickers in the app.
MODE_ORDER: dict[str, list[str]] = {
    "cleanup": ["light", "standard", "aggressive"],
    "polish": ["light", "standard", "strong"],
}


def is_valid(stage: str, mode: str) -> bool:
    return stage in STAGES and mode in STAGES[stage]


def _key(stage: str, mode: str, field: str) -> str:
    return f"prompt.{stage}.{mode}.{field}"


async def resolve_instructions(stage: str, mode: str) -> str:
    """Build the final per-mode instruction block used in the system prompt.

    = (user-overridden base OR shipped default) + optional user "extra rules".
    Unknown modes fall back to the stage's ``standard`` so a caller can never
    crash the pipeline with a bad mode string.
    """
    if not is_valid(stage, mode):
        mode = "standard" if "standard" in STAGES.get(stage, {}) else mode
    default = STAGES[stage][mode]
    base = await get_setting(_key(stage, mode, "base"))
    extra = await get_setting(_key(stage, mode, "extra"))
    block = base.strip() if base and base.strip() else default
    if extra and extra.strip():
        block = (
            f"{block}\n\n"
            "ADDITIONAL USER RULES (apply these too; they must not override the "
            "protected-glossary, do-not-translate, or output-format rules stated "
            "elsewhere in this prompt):\n"
            f"{extra.strip()}"
        )
    return block


async def get_overrides() -> list[dict]:
    """Snapshot of every editable (stage, mode) for the settings UI."""
    items: list[dict] = []
    for stage in STAGES:
        for mode in MODE_ORDER[stage]:
            base = await get_setting(_key(stage, mode, "base"))
            extra = await get_setting(_key(stage, mode, "extra"))
            items.append(
                {
                    "stage": stage,
                    "mode": mode,
                    "label": f"{STAGE_LABELS[stage]} — {mode}",
                    "stage_desc": STAGE_DESC[stage],
                    "mode_note": MODE_NOTE.get(mode, ""),
                    "default_base": STAGES[stage][mode],
                    "base": base,  # None => using the shipped default
                    "extra": extra or "",
                    "using_default": not (base and base.strip()),
                }
            )
    return items


async def set_override(
    stage: str, mode: str, *, base: str | None, extra: str | None
) -> None:
    """Persist an override. Blank/default base or blank extra delete the key
    so the field cleanly reverts to its shipped behaviour."""
    default = STAGES[stage][mode]
    if base is not None and base.strip() and base.strip() != default.strip():
        await set_setting(_key(stage, mode, "base"), base.strip())
    else:
        await delete_setting(_key(stage, mode, "base"))

    if extra and extra.strip():
        await set_setting(_key(stage, mode, "extra"), extra.strip())
    else:
        await delete_setting(_key(stage, mode, "extra"))


async def reset(stage: str, mode: str) -> None:
    """Drop both overrides for a (stage, mode) — back to the shipped default."""
    await delete_setting(_key(stage, mode, "base"))
    await delete_setting(_key(stage, mode, "extra"))
