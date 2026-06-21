# iPhone Shortcuts: Amethyst dictation (proofread / polish)

Three ready-to-build iOS Shortcuts that record audio, send it to the Amethyst
server, and drop the finished text on your **clipboard**:

| # | Shortcut name | Pipeline | Clipboard gets |
|---|---------------|----------|----------------|
| 1 | **Amethyst — Polish** | transcribe → cleanup (standard) → **polish** | polished text |
| 2 | **Amethyst — Proofread (Aggressive)** | transcribe → cleanup (aggressive) | proofread text |
| 3 | **Amethyst — Proofread + Polish** | transcribe → cleanup (aggressive) → **polish** | polished text |

> **Why build by hand?** The `.shortcut` binary is signed per-device, so a file
> exported from one phone won't import cleanly on another. Building on-device
> takes ~3 minutes each and you can see exactly what runs. Shortcuts 1 and 3
> share the same shape — once you've built one, the others are a copy + a field
> change.

In Amethyst terms: **cleanup = "proofread"** (fixes recognition errors, keeps
your wording) and **polish = "polish"** (rewrites for readability, removes
filler). Polish runs *on top of* the proofread text.

---

## Required values

Have these ready before opening Shortcuts.app:

- **Base URL**: `https://negativezero.one/services/amethyst/api/v1`
- **API key**: the value of `AMETHYST_API_KEY` from the server's `.env`
  (admin → your account's **API tokens (amethyst)** → create one, shown once).

The `Authorization` header is the same for every request:
`Authorization` = `Bearer <your-api-key>` (one space, exact case).

---

## Shortcut 1 — "Amethyst — Polish"  (assign to the Action Button)

This is the one to put on the **Action Button**. It records, proofreads
(standard), then polishes, and copies the polished text.

1. **Shortcuts.app → + → name it `Amethyst — Polish`.**

2. **Record Audio**
   - Audio Quality: **Normal**
   - Start Recording: **On Tap** · Stop: **When Tapped**
   - (Produces a `.m4a` — magic variable **Recorded Audio**.)

3. **Get Contents of URL** — *the transcribe call*
   - URL: `https://negativezero.one/services/amethyst/api/v1/transcribe`
   - Show More:
     - Method: **POST**
     - Headers: `Authorization` = `Bearer <your-api-key>`
     - Request Body: **Form**
       - **File** field named `file` = magic variable **Recorded Audio**
       - **Text** field named `source` = `ios_shortcut`
       - **Text** field named `cleanup` = `true`
       - **Text** field named `cleanup_mode` = `standard`
       - *(optional)* **Text** field named `language` = `ru` if you mostly
         dictate in Russian; omit for auto-detect.

4. **Get Dictionary Value**
   - Get **Value** for key `id` from **Contents of URL**.
   - Rename this variable to **TranscriptID** (tap the variable → Rename) so
     the next step is unambiguous.

5. **Text** — *build the polish URL*
   - Content (insert **TranscriptID** inline where shown):
     `https://negativezero.one/services/amethyst/api/v1/transcriptions/`**TranscriptID**`/polish?mode=standard`

6. **Get Contents of URL** — *the polish call*
   - URL: the **Text** output from step 5
   - Show More:
     - Method: **POST**
     - Headers: `Authorization` = `Bearer <your-api-key>`
     - Request Body: **none** (leave it empty — `mode` is in the URL).

7. **Get Dictionary Value**
   - Get **Value** for key `text` from the step-6 **Contents of URL**.
   - (For this response, `text` is already the polished text.)

8. **Copy to Clipboard** — input: the step-7 **Dictionary Value**.

9. **Show Notification** — Title `Amethyst · Polished`, Body the step-7
   **Dictionary Value**.

10. *(optional)* **Stop and Output** → **Dictionary Value**, so other Shortcuts
    / Apple Intelligence can reuse the result.

**Assign to the Action Button:** Settings → **Action Button** → swipe to
**Shortcut** → choose **Amethyst — Polish**. Press-and-hold the Action Button
to start dictating; tap the recording UI when done; polished text is on the
clipboard in a few seconds — switch to any app and paste.

---

## Shortcut 2 — "Amethyst — Proofread (Aggressive)"

Proofread only (aggressive cleanup), no polish. One network call.

1. **Shortcuts.app → + → name it `Amethyst — Proofread (Aggressive)`.**
2. **Record Audio** (Normal · On Tap · When Tapped).
3. **Get Contents of URL**
   - URL: `https://negativezero.one/services/amethyst/api/v1/transcribe`
   - Method **POST**, header `Authorization` = `Bearer <your-api-key>`
   - Request Body **Form**:
     - **File** `file` = **Recorded Audio**
     - **Text** `source` = `ios_shortcut`
     - **Text** `cleanup` = `true`
     - **Text** `cleanup_mode` = `aggressive`
     - *(optional)* **Text** `language` = `ru`
4. **Get Dictionary Value** — key `text` from **Contents of URL**.
   (On the transcribe response, `text` is the cleaned/proofread text.)
5. **Copy to Clipboard** — the **Dictionary Value**.
6. **Show Notification** — Title `Amethyst · Proofread`, Body the **Dictionary Value**.

---

## Shortcut 3 — "Amethyst — Proofread + Polish"

Aggressive proofread **and** polish. Same shape as Shortcut 1, but the
transcribe step uses `cleanup_mode = aggressive`.

Easiest build: in Shortcuts.app long-press **Amethyst — Polish** → **Duplicate**,
rename it `Amethyst — Proofread + Polish`, then change one field:

- In its **step 3** (transcribe) Form, set **`cleanup_mode`** from `standard`
  to **`aggressive`**.

Everything else (the `id` → polish-URL → `text` → clipboard chain) stays
identical. Clipboard gets the polished text built on the aggressively
proofread transcript.

> Want a stronger rewrite? In the polish URL change `?mode=standard` to
> `?mode=strong`. Strong has a length cap for very long dictations; if you hit
> a 413, fall back to `standard`.

---

## Triggers other than the Action Button

The Action Button holds **one** shortcut. Reach the others via:

- **Back Tap**: Settings → Accessibility → Touch → Back Tap → Double/Triple Tap.
- **Lock Screen / Home Screen**: add the Shortcuts widget, or long-press a
  shortcut → Share → Add to Home Screen.
- **One button, a menu**: if you'd rather not spend three triggers, make a
  fourth shortcut that starts with **Choose from Menu** ("Polish", "Proofread",
  "Proofread + Polish") and run the matching steps per branch — then put *that*
  on the Action Button.

---

## Why clipboard (not auto-paste)

iOS doesn't let a Shortcut type into the field that was focused *before* the
Shortcut launched — focus is lost when Shortcuts.app comes forward. The
reliable pattern is: trigger → record → text on clipboard → switch back to your
app → paste. If you want auto-paste *within the same run*, add **Open App** /
**New Note** as a final step (focus set after recording works fine).

---

## Troubleshooting

- **401 Unauthorized** — check the `Authorization` value: `Bearer <key>`, one
  space, exact case. It must be on **both** the transcribe and polish calls.
- **404 on the polish call** — the URL didn't get the real `id`. Confirm step 4
  reads key `id` and step 5 inserts the **TranscriptID** variable (not the word
  "TranscriptID").
- **"File field required"** — the `file` form field must be the **Recorded
  Audio** magic variable, not its text representation.
- **413 Request Entity Too Large** — recording over 25 MB (~30 min AAC), or a
  `strong` polish on a very long transcript. Use a shorter recording, lower the
  audio quality, or `?mode=standard`.
- **Empty / "no text" result** — silent recording, or the proofread produced
  nothing to polish. Try again and speak before tapping stop.
- **Old URL** — `/services/tts/...` and `/vtt-transcriber/...` still 308-redirect
  to `/services/amethyst/...`, but build new shortcuts against the canonical
  `/services/amethyst/` path above.
