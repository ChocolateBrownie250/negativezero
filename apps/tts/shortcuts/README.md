# iPhone Shortcut: "Amethyst Dictate"

Records voice with one press of the **Action Button** and converts it to text
through the Amethyst Whisper + LLM-cleanup pipeline; the transcript lands in
your clipboard within a few seconds.

## Read this first: installing needs signing

iOS will **not** import a hand-authored shortcut file. Since iOS 15, Apple
requires every shortcut to be cryptographically **signed**, and signing cannot
be done on an iPhone. The **Settings → Shortcuts → Advanced → Allow Sharing
Untrusted Shortcuts** toggle only controls whether an already-installed shortcut
may *run* — it does **not** let you import an unsigned file. So the bundled
`Amethyst Dictate.plist` is a **source**, not a tap-to-install download.

Pick the path that matches what you have:

- **No Mac → [build it by hand](#build-it).** ~3 minutes in Shortcuts.app, no
  file transfer, always works. This is the recommended path for most people.
- **Have a Mac → [sign it into an iCloud link](#sign-it-into-an-installable-link).**
  Sign the bundled file once, then you (or anyone) install it with a single tap.

Either way, finish with [Assign it to the Action Button](#assign-it-to-the-action-button).

## Required values

Have these ready:

- **Server URL**: `https://<your-host>/api/v1/transcribe`
  (for this deployment:
  `https://negativezero.one/services/amethyst/api/v1/transcribe`)
- **API key**: value of `AMETHYST_API_KEY` from `platform/.env` on the VPS.
  This is the password to *your own* server — it isn't in this repo (zero
  secrets by design) and it isn't something the shortcut can supply for you.
  If the service was never deployed with a key, set one first.

## Sign it into an installable link

Needs a Mac (signing is macOS-only). Produces a tap-to-add link you can reuse on
any iPhone.

1. Get `Amethyst Dictate.plist` onto the Mac (it's in this repo, or regenerate
   it with `python3 build_shortcut.py`).
2. Sign it:
   ```sh
   shortcuts sign --mode anyone \
     --input "Amethyst Dictate.plist" \
     --output "Amethyst Dictate.shortcut"
   ```
3. Double-click `Amethyst Dictate.shortcut` to add it to Shortcuts on the Mac
   (or AirDrop the signed file to the iPhone and tap it there).
4. Open the shortcut, edit the first **Text** action and replace
   `PASTE_YOUR_AMETHYST_API_KEY_HERE` with your real key. (The endpoint URL is
   asked as an import question; the key is not, so you set it here.)
5. To share it: in Shortcuts, **⋯ → Share → Copy iCloud Link**. Anyone can open
   that `https://www.icloud.com/shortcuts/…` link and tap **Add Shortcut** — no
   toggles, no Files app.

> Heads-up: an iCloud link bakes in whatever API key the shortcut held when you
> shared it. Only share the link with people you'd hand the key to, or strip the
> key before sharing and have each person paste their own.

## Build it

1. Open **Shortcuts.app** → **+** (top-right) → name it **Amethyst Dictate**.

2. Add action **Record Audio**.
   - Tap the action → **Audio Quality**: Normal.
   - **Start Recording**: Immediately (so one Action-Button press starts it).
   - **Stop**: When Tapped.
   - This produces a `.m4a` file.

3. Add action **Get Contents of URL**.
   - **URL**: `https://negativezero.one/services/amethyst/api/v1/transcribe`
   - Tap **Show More**:
     - **Method**: POST
     - **Headers**: add one — `Authorization` = `Bearer <your-api-key>`
     - **Request Body**: **Form**
       - Add field: **File** named `file`, value = magic variable **Recorded
         Audio** (output of step 2)
       - Add field: **Text** named `source`, value = `action_button`
       - (Optional) **Text** field `language` = `ru` if you mostly dictate in
         Russian, otherwise leave it out for auto-detect.

4. Add action **Get Dictionary Value**.
   - **Get**: Value
   - **Key**: `text`
   - **From**: magic variable **Contents of URL** (output of step 3)

5. Add action **Copy to Clipboard**.
   - Input: **Dictionary Value** (output of step 4)

6. Add action **Show Notification**.
   - **Title**: `Amethyst`
   - **Body**: **Dictionary Value**
   - **Play Sound**: off (your call)

7. (Optional) Add action **Stop and Output** with input **Dictionary Value**
   so the Shortcut returns the text when called from another Shortcut or
   Apple Intelligence.

8. Top-right: **Done**.

## Assign it to the Action Button

iPhone 15 Pro / 15 Pro Max / 16 / 16 Pro / 16e / Air have a physical **Action
Button** on the left edge:

1. **Settings → Action Button**.
2. Swipe the carousel to **Shortcut**.
3. Tap **Choose a Shortcut** → pick **Amethyst Dictate**.

Now one press of the Action Button starts recording. Tap the recording UI to
stop; the transcript is copied to your clipboard and shown in a notification a
few seconds later. Long-press the Action Button is unaffected (it still does
nothing else you haven't set).

## Other ways to trigger it

- **Back Tap** (any recent iPhone): Settings → Accessibility → Touch → Back Tap →
  Double Tap → choose **Amethyst Dictate**. Double-tap the back of the phone to
  start dictating.
- **Lock Screen widget**: long-press lock screen → Customize → Widgets → add
  Shortcuts widget → pick Amethyst Dictate.
- **Home Screen icon**: in Shortcuts.app, long-press the shortcut → Share →
  Add to Home Screen.

## Why clipboard, not auto-paste

iOS doesn't allow Shortcuts to insert text into the field that was active
**before** the Shortcut launched — when Shortcuts.app comes to the foreground,
the previous text-field focus is lost. The reliable pattern is:

1. Trigger Shortcut → record → transcript copied to clipboard.
2. Notification shows the first line so you can see it worked.
3. Switch back to the app where you wanted the text → ⌘V or long-press → Paste.

If you want auto-paste *into the same Shortcut session* — e.g. transcribe and
then immediately paste into a Notes entry the Shortcut also opens — that does
work, because the focus is set after the recording. Add **Open App: Notes**
or **New Note: <Dictionary Value>** as a final step.

## Reusing the result in other Shortcuts

Because step 7 (Stop and Output) returns the transcript, you can call this
Shortcut from another Shortcut and use its output. For example, "Amethyst →
Translate → Send via Messages" is a single chain.

## Troubleshooting

- **401 Unauthorized**: double-check the `Authorization` header value. It
  must be `Bearer <key>` with one space, exact case.
- **"File field required"**: the `file` form field must be the **Recorded
  Audio** magic variable, not a text representation of it. If Shortcuts shows
  it as text, tap the field and switch to the variable.
- **413 Request Entity Too Large**: the recording is over 25 MB (~30 min of
  AAC). Split into multiple shorter recordings or lower the audio quality in
  step 2.
- **"Get Dictionary Value failed … couldn't convert from Rich Text to
  Dictionary"**: the *Get Contents of URL* action got a non-JSON body (HTML),
  so Shortcuts typed it as Rich Text and *Get Dictionary Value* can't parse it.
  This is the reverse proxy answering instead of the API — a **413** (oversize
  upload), a **502/503/504** (backend busy/down or the request took over 120 s),
  or, on the legacy `/vtt-transcriber/` URL, an HTTP **redirect** that Shortcuts
  doesn't follow on a form-POST. All three are fixed server-side in
  `platform/nginx/negativezero.one.conf`: `/vtt-transcriber/` is now proxied in
  place (no redirect), and the proxy returns a **JSON** body for 413/5xx errors.
  So instead of a conversion crash you now get a readable message in the
  clipboard, e.g. *"⚠️ Recording too large…"* or *"⚠️ Transcription service is
  busy or timed out…"* — act on it (shorter clip / retry), or check the
  container with `docker logs` if it's down.
- **Times out on cellular**: large uploads on weak networks may exceed the
  nginx/Caddy timeout. Wait for Wi-Fi for long recordings.
- **The `.plist` file won't import / opens as text**: expected — iOS does not
  import unsigned shortcut files, and no toggle changes that (see
  [Read this first: installing needs signing](#read-this-first-installing-needs-signing)).
  Either build it by hand or sign it on a Mac into an iCloud link.
