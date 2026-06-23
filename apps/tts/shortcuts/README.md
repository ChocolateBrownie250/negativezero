# iPhone Shortcut: "Amethyst Dictate"

Records voice with one press of the **Action Button** and converts it to text
through the Amethyst Whisper + LLM-cleanup pipeline; the transcript lands in
your clipboard within a few seconds.

Two ways to get it on your phone:

- **Import the bundled file** (`Amethyst Dictate.plist`) — fastest, see
  [Import the ready-made shortcut](#import-the-ready-made-shortcut) below.
- **Build it by hand** — the signed `.shortcut` binary is per-device, so if the
  import path doesn't suit you, the manual recipe under [Build it](#build-it)
  takes ~3 minutes and you understand exactly what it does.

Either way, jump to [Assign it to the Action Button](#assign-it-to-the-action-button)
once it's installed.

## Required values

Have these ready before importing or opening Shortcuts.app:

- **Server URL**: `https://<your-host>/api/v1/transcribe`
  (for this deployment:
  `https://negativezero.one/services/amethyst/api/v1/transcribe`)
- **API key**: value of `AMETHYST_API_KEY` from your `.env`

## Import the ready-made shortcut

The repo ships `Amethyst Dictate.plist` — the same shortcut as the manual recipe
below, as an *unsigned* shortcut. Regenerate it any time with
`python3 build_shortcut.py`.

1. On the iPhone, enable untrusted shortcuts once: **Settings → Shortcuts →
   Advanced → Allow Sharing Untrusted Shortcuts** (the toggle only appears after
   you've run at least one shortcut on the device).
2. Get `Amethyst Dictate.plist` onto the phone — AirDrop it from a Mac, or drop
   it in iCloud Drive / Files and tap it. Open it **with Shortcuts** (use the
   Share sheet → **Shortcuts** if it opens as text).
3. On import you'll be asked two questions:
   - **Your Amethyst API key** — paste the value of `AMETHYST_API_KEY`.
   - **Transcribe endpoint URL** — defaults to the URL above; change it only if
     your deployment differs.
4. Tap **Add Shortcut**. Done — skip to
   [Assign it to the Action Button](#assign-it-to-the-action-button).

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
       - Add field: **Text** named `source`, value = `ios_shortcut`
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
- **Times out on cellular**: large uploads on weak networks may exceed the
  nginx/Caddy timeout. Wait for Wi-Fi for long recordings.
- **Import opens as text, not a shortcut**: enable **Settings → Shortcuts →
  Advanced → Allow Sharing Untrusted Shortcuts**, then re-open the file via the
  Share sheet → **Shortcuts**. If the toggle is missing, run any shortcut once
  to make it appear.
