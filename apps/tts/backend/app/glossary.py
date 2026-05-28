import json
from dataclasses import dataclass
from pathlib import Path

from .db import get_json_setting, set_json_setting

BUILTIN_PATH = Path(__file__).parent / "glossary_data" / "builtin.json"

PERSONAL_KEY = "glossary.personal"
ANTI_CORRECT_KEY = "glossary.anti_correct"


@dataclass(frozen=True)
class Glossary:
    core: list[str]            # Whisper prompt + LLM whitelist
    extended: list[str]        # LLM whitelist only
    personal: list[str]        # User additions, treated as core
    anti_correct: list[str]    # Things the LLM must never "correct"

    def whisper_prompt(self) -> str:
        """
        Whisper accepts up to 224 tokens of `prompt` to bias decoding.
        Pack core + personal first; truncate at a conservative char budget
        (~600 chars ≈ 200 tokens for mixed Latin/Cyrillic).
        """
        terms = list(dict.fromkeys(self.core + self.personal))
        budget = 600
        out: list[str] = []
        used = 0
        for t in terms:
            extra = len(t) + 2  # ", "
            if used + extra > budget:
                break
            out.append(t)
            used += extra
        return ", ".join(out)

    def whitelist_for_cleanup(self) -> list[str]:
        """Full set of preserved terms passed to the LLM as a JSON array."""
        seen: set[str] = set()
        result: list[str] = []
        for t in self.core + self.extended + self.personal:
            if t not in seen:
                seen.add(t)
                result.append(t)
        return result

    def whitelist_for_polish(self) -> list[str]:
        """Smaller whitelist for polish: core + personal only.

        Polish doesn't fix recognition errors (cleanup does that), so the
        long-tail `extended` list of niche tech terms isn't load-bearing
        here. Dropping it shrinks the polish system prompt by ~3,300
        tokens, which is what unblocks polish-strong on Groq's
        `gpt-oss-120b` free-tier 8,000 TPM ceiling. See ADR-012.
        """
        seen: set[str] = set()
        result: list[str] = []
        for t in self.core + self.personal:
            if t not in seen:
                seen.add(t)
                result.append(t)
        return result


def _load_builtin() -> tuple[list[str], list[str]]:
    raw = json.loads(BUILTIN_PATH.read_text(encoding="utf-8"))
    return raw.get("core", []), raw.get("extended", [])


async def load_glossary() -> Glossary:
    core, extended = _load_builtin()
    personal = await get_json_setting(PERSONAL_KEY, [])
    anti_correct = await get_json_setting(ANTI_CORRECT_KEY, [])
    return Glossary(
        core=core,
        extended=extended,
        personal=personal if isinstance(personal, list) else [],
        anti_correct=anti_correct if isinstance(anti_correct, list) else [],
    )


async def update_personal(terms: list[str]) -> None:
    cleaned = [t.strip() for t in terms if t and t.strip()]
    deduped = list(dict.fromkeys(cleaned))
    await set_json_setting(PERSONAL_KEY, deduped)


async def update_anti_correct(terms: list[str]) -> None:
    cleaned = [t.strip() for t in terms if t and t.strip()]
    deduped = list(dict.fromkeys(cleaned))
    await set_json_setting(ANTI_CORRECT_KEY, deduped)
