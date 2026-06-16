# Feature B — Editable per-task / per-model system instructions

Tracking checklist for the editable cleanup/polish instructions feature
(per-field: override the default block **and/or** append extra rules, with
per-field reset and an in-app guidelines panel).

Branch: `claude/bottom-nav-positioning-0pb1kr` (PR #71).

## Backend
- [x] `db.delete_setting()` — needed for "reset to default"
- [x] `app/prompts.py` — move shipped cleanup/polish defaults here (single
      source of truth) + `resolve_instructions()` / `get_overrides()` /
      `set_override()` / `reset()`, overrides stored in `settings` table
- [x] `groq_client.py` — drop the inline instruction dicts; resolve the
      per-mode block via `prompts.resolve_instructions()`; keep the safety
      scaffolding (glossary / no-translate / JSON output) non-editable
- [x] `models.py` — `PromptItem` / `PromptList` / `PromptUpdate`
- [x] `routes/prompts.py` — `GET /prompts`, `PUT /prompts/{stage}/{mode}`,
      `POST /prompts/{stage}/{mode}/reset`
- [x] register `prompts_router` in `main.py`

## Frontend (PWA)
- [x] `index.html` — "Edit instructions" entry on Modes screen + a
      `#modesInstructions` sub-screen (guidelines panel + editor list)
- [x] `app.js` — load/render editor cards, per-card Save + Reset, wire nav
- [x] Guidelines copy: what the field expects so users don't break output

## Verify
- [x] Backend imports cleanly; existing tests still pass (chunker 16/16)
- [x] Screenshot the new editor screen on simulated iPhone
- [x] Confirm reset restores the shipped default text
- [x] End-to-end: UI save → settings table → `resolve_instructions` uses
      custom base + appended extra rules; reset clears; 404 on unknown
      stage/mode; 401 without auth

## Notes
- This is per-`owner` today; it becomes per-user automatically once
  Feature A (true multi-user, `owner_id` scoping) lands.
- Model-per-task editing intentionally deferred (config is env-driven);
  this feature only edits the *instruction text*, which is the core ask.

---

# Feature C — Translate dictated text to another language

Manual, by-button. Source = a switcher (Polished / Cleaned / Raw) that
defaults to **Polished** — i.e. translation is a terminal step over the
best version, reusing the existing "Source" toggle on the result card.
Reuses Groq LLMs (free), preserves glossary terms, adds a translation as
an extra output (original kept), persisted like polish.

## Backend
- [x] `config.py` — `translate_model` (default `llama-3.3-70b-versatile`)
- [x] `groq_client.py` — `translate()` + `_build_translate_messages`
      (glossary-preserving, JSON output, do-not-summarise)
- [x] `schema.sql` + `db.py` migration — `text_translated`,
      `translate_lang`, `translate_source`, `translate_model`, `translate_ms`
- [x] `models.py` — translation fields on `TranscriptionResponse`
- [x] `routes/transcriptions.py` — `POST /transcriptions/{id}/translate`
      (`target`, optional `source`); include fields in `_row_to_full`

## Frontend (PWA)
- [x] result card — "Translated" source button + "Translate to" language
      picker + Translate button (uses current Source as input)
- [x] Settings — default target language
- [x] `app.js` — translate handler, source switch to translated view

## Verify
- [x] Backend imports + migration adds columns to legacy DB
- [x] Route test with stubbed Groq: default source = polished, explicit
      source=raw, 401 without auth, 422 on missing target
- [x] Screenshot result card with translation on simulated iPhone
      (glossary term preserved in the output)

## Notes
- Scoped to transcriptions (Record + History). Notes dictation could get
  the same treatment as a follow-up.
- Translate prompt is fixed for now (not in the editable-instructions set);
  could be added there later.

