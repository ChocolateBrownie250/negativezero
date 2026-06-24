#!/usr/bin/env python3
"""Generate the "Amethyst Dictate" iPhone Shortcut SOURCE plist.

IMPORTANT — iOS will NOT import this file as-is. Since iOS 15, Apple requires
every shortcut to be cryptographically *signed* before the Shortcuts app will
import it, and signing cannot be done on an iPhone. The "Settings → Shortcuts →
Advanced → Allow Sharing Untrusted Shortcuts" toggle only controls whether a
shortcut may *run*; it does NOT let you import an unsigned, hand-authored file.

So this plist is a *source*, not a tap-to-install artifact. To get it onto a
phone you must do one of:

  * Sign it on a Mac, then share the signed file or an iCloud link:
        shortcuts sign --mode anyone \
            --input "Amethyst Dictate.plist" \
            --output "Amethyst Dictate.shortcut"
    Import that signed .shortcut once, then Share → Copy iCloud Link to get a
    tap-to-add https://www.icloud.com/shortcuts/… link anyone can install.
  * Rebuild the same actions by hand in Shortcuts.app — the only path that
    needs no Mac. See README.md.

The shortcut:
  1. Records audio (starts immediately, stop by tapping the recording UI).
  2. POSTs it as multipart/form-data to the Amethyst transcribe endpoint with a
     `Bearer` token, tagging the request `source=action_button`.
  3. Pulls `text` out of the JSON response.
  4. Copies the transcript to the clipboard, shows it in a notification, and
     returns it as the shortcut's output (so it composes with other shortcuts /
     Apple Intelligence).

Run `python3 build_shortcut.py` to regenerate `Amethyst Dictate.plist`.
"""

from __future__ import annotations

import plistlib
import uuid
from pathlib import Path

DEFAULT_URL = "https://negativezero.one/services/amethyst/api/v1/transcribe"
OUT = Path(__file__).with_name("Amethyst Dictate.plist")

# Object Replacement Character — marks where an inline variable sits in a string.
OBJ = "\N{OBJECT REPLACEMENT CHARACTER}"


def new_uuid() -> str:
    # Deterministic-free is fine; UUIDs only need to be unique within the file.
    return str(uuid.uuid4()).upper()


def text_token(s: str) -> dict:
    """A plain string parameter (no inline variables)."""
    return {
        "WFSerializationType": "WFTextTokenString",
        "Value": {"string": s, "attachmentsByRange": {}},
    }


def var_attachment(output_uuid: str, output_name: str) -> dict:
    """A whole-value reference to a previous action's output (a magic variable)."""
    return {
        "WFSerializationType": "WFTextTokenAttachment",
        "Value": {
            "Type": "ActionOutput",
            "OutputUUID": output_uuid,
            "OutputName": output_name,
        },
    }


def text_with_var(prefix: str, output_uuid: str, output_name: str) -> dict:
    """A string parameter with one inline variable appended after `prefix`."""
    s = prefix + OBJ
    return {
        "WFSerializationType": "WFTextTokenString",
        "Value": {
            "string": s,
            "attachmentsByRange": {
                f"{{{len(prefix)}, 1}}": {
                    "Type": "ActionOutput",
                    "OutputUUID": output_uuid,
                    "OutputName": output_name,
                }
            },
        },
    }


def file_attachment(output_uuid: str, output_name: str) -> dict:
    """The value shape Shortcuts uses for a *file* field in a form/dictionary:
    a WFTokenAttachmentParameterState wrapping the variable reference."""
    return {
        "WFSerializationType": "WFTokenAttachmentParameterState",
        "Value": var_attachment(output_uuid, output_name),
    }


def dict_field(items: list[dict]) -> dict:
    return {
        "WFSerializationType": "WFDictionaryFieldValue",
        "Value": {"WFDictionaryFieldValueItems": items},
    }


def text_kv(key: str, value: dict) -> dict:
    """A text->text dictionary item (WFItemType 0 = text)."""
    return {"WFItemType": 0, "WFKey": text_token(key), "WFValue": value}


def file_kv(key: str, output_uuid: str, output_name: str) -> dict:
    """A text->file dictionary item (WFItemType 5 = file)."""
    return {
        "WFItemType": 5,
        "WFKey": text_token(key),
        "WFValue": file_attachment(output_uuid, output_name),
    }


def build() -> dict:
    apikey_uuid = new_uuid()
    record_uuid = new_uuid()
    http_uuid = new_uuid()
    dict_uuid = new_uuid()

    actions: list[dict] = []

    # 0. Comment — orientation when editing the shortcut later.
    actions.append(
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.comment",
            "WFWorkflowActionParameters": {
                "WFCommentActionText": (
                    "Amethyst Dictate — records voice and converts it to text via "
                    "the negativezero Whisper pipeline. Assign to the Action "
                    "Button: Settings → Action Button → Shortcut → Amethyst "
                    "Dictate. Edit the API Key (next action) and the URL (Get "
                    "Contents of URL) if your deployment differs."
                )
            },
        }
    )

    # 1. Text — holds the API key. Edit this in Shortcuts.app after import/
    #    signing (an import question can't safely target this token field).
    actions.append(
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
            "WFWorkflowActionParameters": {
                "UUID": apikey_uuid,
                "CustomOutputName": "API Key",
                "WFTextActionText": text_token("PASTE_YOUR_AMETHYST_API_KEY_HERE"),
            },
        }
    )

    # 2. Record Audio — start immediately, stop on tap. Output: "Recorded Audio".
    #    Quality defaults to Normal, so the quality key is intentionally omitted
    #    (the real key is WFRecordingCompression, not WFAudioRecordingQuality).
    actions.append(
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.recordaudio",
            "WFWorkflowActionParameters": {
                "UUID": record_uuid,
                "WFRecordingStart": "Immediately",
            },
        }
    )

    # 3. Get Contents of URL — multipart POST with Bearer auth.
    headers = dict_field(
        [text_kv("Authorization", text_with_var("Bearer ", apikey_uuid, "API Key"))]
    )
    form = dict_field(
        [
            # File field (WFItemType 5): value is the recorded-audio variable
            # wrapped in WFTokenAttachmentParameterState — the shape Shortcuts
            # uses for files. A plain text token here uploads no file.
            file_kv("file", record_uuid, "Recorded Audio"),
            text_kv("source", text_token("action_button")),
        ]
    )
    actions.append(
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
            "WFWorkflowActionParameters": {
                "UUID": http_uuid,
                "WFURL": DEFAULT_URL,
                "WFHTTPMethod": "POST",
                "WFHTTPHeaders": headers,
                "ShowHeaders": True,
                "WFHTTPBodyType": "Form",
                "WFFormValues": form,
            },
        }
    )

    # 4. Get Dictionary Value — pull `text` out of the JSON response.
    actions.append(
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.getvalueforkey",
            "WFWorkflowActionParameters": {
                "UUID": dict_uuid,
                "CustomOutputName": "Transcript",
                "WFGetDictionaryValueType": "Value",
                "WFDictionaryKey": "text",
                "WFInput": var_attachment(http_uuid, "Contents of URL"),
            },
        }
    )

    transcript = var_attachment(dict_uuid, "Transcript")

    # 5. Copy to Clipboard.
    actions.append(
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.setclipboard",
            "WFWorkflowActionParameters": {"WFInput": transcript},
        }
    )

    # 6. Show Notification.
    actions.append(
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.notification",
            "WFWorkflowActionParameters": {
                "WFNotificationActionTitle": "Amethyst",
                "WFNotificationActionBody": transcript,
                "WFNotificationActionSound": False,
            },
        }
    )

    # 7. Stop and Output — return the transcript to callers / Apple Intelligence.
    actions.append(
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.output",
            "WFWorkflowActionParameters": {
                "WFOutput": transcript,
                "WFNoOutputSurfaceBehavior": "Respond",
            },
        }
    )

    return {
        "WFWorkflowName": "Amethyst Dictate",
        "WFWorkflowActions": actions,
        # Integer build number (NOT a dotted string — the semver lives in
        # WFWorkflowClientRelease) so the plist matches real Apple exports.
        "WFWorkflowClientVersion": 2607,
        "WFWorkflowClientRelease": "2.0",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowHasShortcutInputVariables": False,
        # Only the URL is exposed as an import question — WFURL is a plain string
        # so the answer slots in cleanly. The API key lives in the Text action
        # (action 1); edit it once after import/signing.
        "WFWorkflowImportQuestions": [
            {
                "ParameterKey": "WFURL",
                "Category": "Parameter",
                "ActionIndex": 3,
                "Text": "Transcribe endpoint URL",
                "DefaultValue": DEFAULT_URL,
            },
        ],
        "WFWorkflowInputContentItemClasses": [
            "WFAppStoreAppContentItem",
            "WFArticleContentItem",
            "WFContactContentItem",
            "WFDateContentItem",
            "WFEmailAddressContentItem",
            "WFGenericFileContentItem",
            "WFImageContentItem",
            "WFiTunesProductContentItem",
            "WFLocationContentItem",
            "WFDCMapsLinkContentItem",
            "WFAVAssetContentItem",
            "WFPDFContentItem",
            "WFPhoneNumberContentItem",
            "WFRichTextContentItem",
            "WFSafariWebPageContentItem",
            "WFStringContentItem",
            "WFURLContentItem",
        ],
        "WFWorkflowIcon": {
            "WFWorkflowIconStartColor": 2846468607,  # purple-ish (amethyst)
            "WFWorkflowIconGlyphNumber": 59446,  # microphone glyph
        },
    }


def main() -> None:
    plist = build()
    with OUT.open("wb") as f:
        plistlib.dump(plist, f)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
