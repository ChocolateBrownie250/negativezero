# iPhone Shortcut: "Amethyst Dictate"

The `.shortcut` binary format is signed per-device, so importing a file from
elsewhere doesn't work cleanly. Building the shortcut by hand on the device
takes ~3 minutes and you understand exactly what it does. Steps below.

## Required values

Have these ready before opening Shortcuts.app:

- **Server URL**: `https://<your-host>/api/v1/transcribe`
  (for this deployment: `https://negativezero.one/vtt-transcriber/api/v1/transcribe`)
- **API key**: value of `AMETHYST_API_KEY` from your `.env`

## Build it

1. Open **Shortcuts.app** → **+** (top-right) → name it **Amethyst Dictate**.

2. Add action **Record Audio**.
   <!-- Note: in step 3 below, use the full URL with the /vtt-transcriber/ subpath. -->

   - Tap the action → **Audio Quality**: Normal.
   - **Start Recording**: On Tap.
   - **Stop**: When Tapped.
   - This produces a `.m4a` file.

3. Add action **Get Contents of URL**.
   - **URL**: `https://negativezero.one/vtt-transcriber/api/v1/transcribe`
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

## Trigger it

- **Back Tap** (recommended): Settings → Accessibility → Touch → Back Tap →
  Double Tap → choose **Amethyst Dictate**. Now double-tap the back of the
  phone to start dictating; tap the recording UI when done; transcript lands
  in clipboard within a few seconds.
- **Action Button** (iPhone 15 Pro / 16 / Air): Settings → Action Button →
  Shortcut → Amethyst Dictate.
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
- **Times out on cellular**: large uploads on weak networks may exceed Caddy's
  120 s timeout. Wait for Wi-Fi for long recordings.
