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
- [ ] `index.html` — "Edit instructions" entry on Modes screen + a
      `#modesInstructions` sub-screen (guidelines panel + editor list)
- [ ] `app.js` — load/render editor cards, per-card Save + Reset, wire nav
- [ ] Guidelines copy: what the field expects so users don't break output

## Verify
- [ ] Backend imports cleanly; existing tests still pass
- [ ] Screenshot the new editor screen on simulated iPhone
- [ ] Confirm reset restores the shipped default text

## Notes
- This is per-`owner` today; it becomes per-user automatically once
  Feature A (true multi-user, `owner_id` scoping) lands.
- Model-per-task editing intentionally deferred (config is env-driven);
  this feature only edits the *instruction text*, which is the core ask.
