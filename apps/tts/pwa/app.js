// ----- Settings (localStorage) -----
const LS_KEY = "amethyst.settings.v1";
const defaultSettings = {
  apiBase: "",       // empty = same origin
  defLang: "auto",
  defCleanup: "on:standard",
  defTranslateLang: "English",   // default target for the Translate button
  audioBitrate: 32000,   // up from 24k — more headroom for noisy environments
};
function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw);
    // The browser PWA no longer uses an API key — it relies on the SSO cookie.
    // Drop any stale persisted key so it can never be sent again.
    delete parsed.apiKey;
    return { ...defaultSettings, ...parsed };
  } catch {
    return { ...defaultSettings };
  }
}
function saveSettings(s) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}
let settings = loadSettings();

// ----- API client -----
// Path-agnostic: when no explicit apiBase is set, resolve against the document's
// base URL — so the PWA works whether served from "/" or "/vtt-transcriber/" etc.
function apiUrl(path) {
  const cleanPath = path.replace(/^\/+/, "");
  if (settings.apiBase) {
    return settings.apiBase.replace(/\/+$/, "") + "/" + cleanPath;
  }
  // Resolve "./" against current page → ends with the directory we're in.
  return new URL(cleanPath, new URL("./", window.location.href)).href;
}
function authHeaders() {
  // The browser PWA never sends a Bearer token — it relies entirely on the
  // shared `nz_session` SSO cookie (sent via credentials: "include").
  return {};
}
async function api(path, init = {}) {
  const headers = { ...authHeaders(), ...(init.headers || {}) };
  // credentials: "include" so the cross-service `nz_session` cookie is sent.
  const resp = await fetch(apiUrl(path), { ...init, headers, credentials: "include" });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    // Pull a friendly message out of FastAPI's `{"detail": "..."}` shape
    // when present; fall back to the raw body otherwise.
    let detail = text.slice(0, 400);
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.detail === "string") detail = parsed.detail;
    } catch { /* not JSON */ }
    const err = new Error(`${resp.status} ${resp.statusText}: ${detail}`);
    err.status = resp.status;
    err.detail = detail;
    err.body = text;
    throw err;
  }
  const ct = resp.headers.get("content-type") || "";
  return ct.includes("application/json") ? resp.json() : resp.text();
}

// When a request comes back 401 and no manual API key is configured, the
// browser has no valid SSO cookie — bounce to the hub login, which returns
// here once authenticated. Returns true if it handled (redirected) the error.
function handleAuthError(e) {
  if (e && e.status === 401) {
    window.location.assign("/services/admin/?return=/services/amethyst/");
    return true;
  }
  return false;
}

// Verify the session BEFORE revealing the app. Without this the static shell
// (the Record tab fires no request) renders to anonymous visitors until they
// happen to trigger a protected call. On a missing/invalid session we bounce to
// the SSO hub; on a valid session that simply isn't authorized for tts we show
// an access-denied message instead of looping through login.
async function gateOnAuth() {
  const gate = document.getElementById("authGate");
  try {
    await api("/api/v1/me");
    document.body.classList.add("authed");
  } catch (e) {
    if (e && e.status === 401) {
      // replace() so the bounced-through login isn't left in history.
      window.location.replace("/services/admin/?return=/services/amethyst/");
      return;
    }
    if (e && e.status === 403) {
      if (gate) {
        gate.innerHTML =
          '<div class="gate-msg">Your account doesn’t have access to Amethyst.<br>Ask the owner to enable it, then reload.</div>';
      }
      return;
    }
    // Network/other transient error: don't trap the user behind the gate —
    // reveal the app and let per-action handlers surface any real failure.
    document.body.classList.add("authed");
  }
}
gateOnAuth();

// Turn an API error into a short, human status line. The backend now names
// the real upstream cause (rate limit, rejected key, timeout, …); translate
// those into something a user can act on. Falls back to the raw message.
function friendlyError(e) {
  const status = e && e.status;
  const detail = (e && e.detail) || "";
  if (status === 429) {
    // Groq rate limit. Surface the retry window if the upstream message
    // carried one ("…try again in 12s" / "…in 1m2.3s").
    const m = detail.match(/try again in ([\dhms.]+)/i);
    return m
      ? `Groq rate limit — try again in ${m[1]}`
      : "Groq rate limit reached — wait a moment and try again";
  }
  if ((status === 502 || status === 503) && /API key/i.test(detail)) {
    return "Transcription unavailable — Groq API key rejected (ask the operator)";
  }
  if (status === 503) return detail || "Transcription temporarily unavailable — try again shortly";
  if (status === 504) return "Groq timed out — try again";
  if (status === 413) return detail || "Recording too long — try a shorter clip";
  if (status === 400 && /rejected by Groq/i.test(detail)) return detail;
  return (e && e.message) || "Something went wrong";
}

// ----- Tabs -----
document.querySelectorAll("nav button").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll("nav button").forEach(b => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".tab").forEach(s => s.classList.toggle("active", s.id === `tab-${tab}`));
    if (tab === "history") refreshHistory();
    if (tab === "modes") { showModesMain(); renderModesOnce(); }
    if (tab === "settings") loadUsage();
  });
});

// ----- Recording -----
const recBtn   = document.getElementById("recBtn");
const recStage = document.getElementById("recStage");
const recTimer = document.getElementById("recTimer");
const recStatus= document.getElementById("recStatus");
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordStart = 0;
let timerInt = null;

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function pickMime() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/aac",
  ];
  for (const m of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  }
  return ""; // browser default
}

// Map a getUserMedia error to a user-facing message + iOS instructions when relevant.
function describeMediaError(err) {
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
                       || window.navigator.standalone === true;
  switch (err && err.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return isStandalone
        ? "Microphone access blocked.\nFix: iOS Settings → Privacy & Security → Microphone → enable Amethyst."
        : "Microphone access blocked.\nFix in Safari: tap the аА icon left of the URL → Website Settings → Microphone → Allow.\nIf nothing's there: iOS Settings → Safari → Microphone → Ask / Allow.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No microphone found on this device.";
    case "NotReadableError":
    case "TrackStartError":
      return "Microphone is busy — another app is using it. Close it and try again.";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "Microphone doesn't support the requested settings.";
    case "SecurityError":
      return "Microphone blocked: page must be served over HTTPS.";
    case "AbortError":
      return "Recording aborted before it started. Try again.";
    case "TypeError":
      return "navigator.mediaDevices not available — likely an insecure context.";
    default:
      return `Microphone error: ${err && err.name ? err.name : "unknown"}${err && err.message ? " — " + err.message : ""}`;
  }
}

function resetToRecordState() {
  lastResult = null;
  resultCard.classList.add("hidden");
  const doneRow = document.getElementById("resultDoneRow");
  if (doneRow) doneRow.classList.add("hidden");
  recStage.style.display = "";
  document.getElementById("appSub").textContent = "Voice to text, auto-proofread";
  recTimer.textContent = "00:00";
  recStatus.textContent = "Tap to dictate";
}

document.getElementById("resultNewBtn")?.addEventListener("click", resetToRecordState);

async function startRecording() {
  recStatus.textContent = "";

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    recStatus.textContent = "This browser doesn't support audio recording. Use Safari on iOS or any modern desktop browser.";
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      // channelCount:1 — Whisper downmixes to mono anyway, so capturing a
      // single channel sends the whole bitrate budget to one voice track and
      // halves upload size on stereo inputs (no transcription-accuracy cost).
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    console.error("getUserMedia failed:", err);
    recStatus.textContent = describeMediaError(err);
    return;
  }

  let mime = pickMime();
  const opts = { audioBitsPerSecond: settings.audioBitrate };
  if (mime) opts.mimeType = mime;

  try {
    mediaRecorder = new MediaRecorder(mediaStream, opts);
  } catch (err) {
    console.error("MediaRecorder construction failed:", err);
    recStatus.textContent = `Cannot start recorder: ${err.name || "error"}.`;
    mediaStream.getTracks().forEach(t => t.stop());
    return;
  }

  // Entering a new recording — show the rec-stage again if it was hidden
  recStage.style.display = "";
  document.getElementById("resultDoneRow")?.classList.add("hidden");
  resultCard.classList.add("hidden");
  document.getElementById("appSub").textContent = "Voice to text, auto-proofread";

  recordedChunks = [];
  mediaRecorder.ondataavailable = e => { if (e.data.size) recordedChunks.push(e.data); };
  mediaRecorder.onstop = onStopped;
  mediaRecorder.onerror = e => {
    console.error("MediaRecorder error:", e);
    recStatus.textContent = "Recording error: " + (e.error && e.error.name || "unknown");
  };
  mediaRecorder.start();
  recordStart = Date.now();
  timerInt = setInterval(() => recTimer.textContent = fmtDuration(Date.now() - recordStart), 200);
  recBtn.classList.add("recording");
  recStage.classList.add("recording");
  recStatus.textContent = "Listening…";
  recStatus.classList.add("status-ac");
  recBtn.setAttribute("aria-label", "Stop recording");
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  clearInterval(timerInt);
  recBtn.classList.remove("recording");
  recStage.classList.remove("recording");
  recStatus.classList.remove("status-ac");
  recBtn.setAttribute("aria-label", "Record");
}

async function onStopped() {
  const mime = mediaRecorder.mimeType || "audio/webm";
  const blob = new Blob(recordedChunks, { type: mime });
  recStatus.textContent = `Uploading ${(blob.size / 1024).toFixed(0)} KB…`;

  const ext = mime.includes("mp4") || mime.includes("aac") ? "m4a"
            : mime.includes("ogg") ? "ogg"
            : "webm";
  const fd = new FormData();
  fd.append("file", blob, `recording.${ext}`);
  fd.append("source", "pwa");
  if (settings.defLang !== "auto") fd.append("language", settings.defLang);
  if (settings.defCleanup === "off") {
    fd.append("cleanup", "false");
  } else {
    fd.append("cleanup", "true");
    fd.append("cleanup_mode", settings.defCleanup.split(":")[1] || "standard");
  }

  try {
    const result = await api("api/v1/transcribe", { method: "POST", body: fd });
    showResult(result);
    recStatus.textContent = "Tap to dictate";
  } catch (e) {
    recStatus.textContent = friendlyError(e);
  }
}

recBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") stopRecording();
  else startRecording();
});

// ----- Result display -----
const resultCard = document.getElementById("resultCard");
const resultText = document.getElementById("resultText");
const resultLang = document.getElementById("resultLang");
const resultDur  = document.getElementById("resultDur");
const resultTimings = document.getElementById("resultTimings");
const resultMode = document.getElementById("resultMode");
let lastResult = null;
let currentSource = "cleaned";   // polished | cleaned | raw

function defaultCleanupMode() {
  return settings.defCleanup.startsWith("on:")
    ? (settings.defCleanup.split(":")[1] || "standard")
    : "standard";
}

// ----- Unified intensity picker -----
// One knob (Light / Standard / Aggressive) drives the strength of both
// re-cleanup and polish. The mappings differ slightly because polish uses
// "strong" instead of "aggressive" — handled in intensityToCleanupMode /
// intensityToPolishMode below.
let selectedIntensity = defaultCleanupMode();

function paintIntensity(selected) {
  for (const btn of document.querySelectorAll('.seg-btn[data-intensity]')) {
    const isActive = btn.dataset.intensity === selected;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-checked", isActive ? "true" : "false");
  }
}
for (const btn of document.querySelectorAll('.seg-btn[data-intensity]')) {
  btn.addEventListener("click", () => {
    selectedIntensity = btn.dataset.intensity;
    paintIntensity(selectedIntensity);
  });
}
paintIntensity(selectedIntensity);

function intensityToCleanupMode(i) { return i; }   // light/standard/aggressive map directly
function intensityToPolishMode(i)  { return i === "aggressive" ? "strong" : i; }

// ----- Source toggle (Polished / Cleaned / Raw) -----
function paintSourceButtons() {
  // Each button is enabled only if the corresponding text version exists on
  // lastResult. The active one is whichever is currently displayed.
  for (const btn of document.querySelectorAll(".source-btn")) {
    const src = btn.dataset.source;
    const available = lastResult && (
      (src === "raw" && !!lastResult.text_raw) ||
      (src === "cleaned" && !!lastResult.text_clean) ||
      (src === "polished" && !!lastResult.text_polished) ||
      (src === "translated" && !!lastResult.text_translated)
    );
    btn.disabled = !available;
    btn.setAttribute("aria-checked", String(src === currentSource && available));
    btn.classList.toggle("active", src === currentSource && available);
  }
}
function applySource() {
  if (!lastResult) return;
  let text = lastResult.text;
  if (currentSource === "translated" && lastResult.text_translated) text = lastResult.text_translated;
  else if (currentSource === "polished" && lastResult.text_polished) text = lastResult.text_polished;
  else if (currentSource === "cleaned" && lastResult.text_clean) text = lastResult.text_clean;
  else if (currentSource === "raw" && lastResult.text_raw) text = lastResult.text_raw;
  resultText.textContent = text;
}
for (const btn of document.querySelectorAll(".source-btn")) {
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    currentSource = btn.dataset.source;
    paintSourceButtons();
    applySource();
  });
}

function showResult(r) {
  lastResult = r;
  resultLang.textContent = r.language || "—";
  resultDur.textContent = r.duration_s ? `${r.duration_s.toFixed(1)} s` : "";
  const t = [];
  if (r.whisper_ms != null) t.push(`Whisper ${r.whisper_ms} ms`);
  if (r.cleanup_ms != null) t.push(`cleanup ${r.cleanup_ms} ms`);
  if (r.polish_ms != null)  t.push(`polish ${r.polish_ms} ms`);
  if (r.translate_ms != null) t.push(`translate ${r.translate_ms} ms`);
  resultTimings.textContent = t.join(" · ");
  const modeBits = [];
  if (r.cleanup_mode) modeBits.push(`cleanup: ${r.cleanup_mode}`);
  if (r.polish_mode)  modeBits.push(`polish: ${r.polish_mode}`);
  if (r.translate_lang) modeBits.push(`→ ${r.translate_lang}`);
  resultMode.textContent = modeBits.join(" · ");
  // Reflect the last-used target language in the picker, if any.
  const tlSel = document.getElementById("translateLang");
  if (tlSel && r.translate_lang) tlSel.value = r.translate_lang;

  // Show the "Done" row with formatted duration
  const doneRow = document.getElementById("resultDoneRow");
  const doneTime = document.getElementById("resultDoneTime");
  if (doneRow) {
    doneRow.classList.remove("hidden");
    if (doneTime) {
      doneTime.textContent = r.duration_s
        ? `${fmtDuration(r.duration_s * 1000)} recorded`
        : "recorded";
    }
  }
  recStage.style.display = "none";
  document.getElementById("appSub").textContent = "Transcript ready";

  resultCard.classList.remove("hidden");

  // Default the source to the most-processed available view.
  if (r.text_polished) currentSource = "polished";
  else if (r.text_clean) currentSource = "cleaned";
  else currentSource = "raw";
  paintSourceButtons();
  applySource();

  // Disable Re-transcribe if the audio was never stored / has been purged.
  const reBtn = document.getElementById("reTranscribeBtn");
  if (reBtn) {
    const hasAudio = !!r.audio_path;
    reBtn.disabled = !hasAudio;
    reBtn.title = hasAudio
      ? "Re-run audio through whisper-large-v3 (more accurate, slower)"
      : "Audio no longer stored — record again to re-transcribe.";
  }

  // After a fresh result, pre-select a stronger intensity than what was
  // just applied so a single tap on Cleanup escalates by default.
  const ESCALATION = { light: "standard", standard: "aggressive", aggressive: "aggressive" };
  selectedIntensity = ESCALATION[r.cleanup_mode] || defaultCleanupMode();
  paintIntensity(selectedIntensity);
}

// Both Copy buttons (top-right of the card and bottom action row) share one
// implementation. The top one is icon-only and flashes via .copied; the
// bottom is labelled and swaps text.
async function copyResult(btn, opts = {}) {
  if (!lastResult) return;
  await navigator.clipboard.writeText(resultText.textContent);
  if (opts.iconOnly) {
    btn.classList.add("copied");
    setTimeout(() => btn.classList.remove("copied"), 1200);
    return;
  }
  const span = btn.querySelector("span");
  if (!span) return;
  const orig = span.textContent;
  span.textContent = "Copied";
  btn.classList.add("copied");
  setTimeout(() => { span.textContent = orig; btn.classList.remove("copied"); }, 1200);
}
document.getElementById("copyBtn").addEventListener("click", (e) => copyResult(e.currentTarget));
document.getElementById("copyBtnTop")?.addEventListener("click", (e) => copyResult(e.currentTarget, { iconOnly: true }));

async function runWithBusy(btn, label, fn) {
  if (!lastResult) return;
  if (btn.disabled) return;
  const span = btn.querySelector("span");
  const orig = span ? span.textContent : "";
  if (span) span.textContent = label;
  btn.disabled = true;
  try {
    const updated = await fn();
    showResult(updated);
  } catch (e) {
    recStatus.textContent = `${orig} failed: ${e.message}`;
  } finally {
    if (span) span.textContent = orig;
    btn.disabled = false;
  }
}

document.getElementById("reCleanBtn").addEventListener("click", (ev) => {
  const btn = ev.currentTarget;
  const mode = intensityToCleanupMode(selectedIntensity || defaultCleanupMode());
  runWithBusy(btn, "Cleaning…", () =>
    api(`api/v1/transcriptions/${lastResult.id}/recleanup?cleanup_mode=${mode}`, { method: "POST" })
  );
});

document.getElementById("polishBtn").addEventListener("click", async (ev) => {
  const btn = ev.currentTarget;
  if (!lastResult || btn.disabled) return;
  const mode = intensityToPolishMode(selectedIntensity || "standard");
  const span = btn.querySelector("span");
  const orig = span ? span.textContent : "";
  if (span) span.textContent = "Polishing…";
  btn.disabled = true;
  try {
    const updated = await api(
      `api/v1/transcriptions/${lastResult.id}/polish?mode=${mode}`,
      { method: "POST" }
    );
    showResult(updated);
  } catch (e) {
    if (e.status === 413 && mode === "strong") {
      // Polish-strong overflowed the gpt-oss-120b TPM ceiling. Offer
      // two ways forward: drop to Standard polish (Llama-4-Scout has
      // way more headroom), or queue the work for chunked background
      // processing.
      showPolishTooLongDialog(e.detail || e.message, lastResult.id);
    } else {
      recStatus.textContent = `Polish failed: ${e.message}`;
    }
  } finally {
    if (span) span.textContent = orig;
    btn.disabled = false;
  }
});

document.getElementById("translateBtn").addEventListener("click", async (ev) => {
  const btn = ev.currentTarget;
  if (!lastResult || btn.disabled) return;
  const lang = document.getElementById("translateLang").value;
  // Translate whatever base version is currently selected (Polished by
  // default). If the translated view is showing, fall back to best-available
  // on the server (omit source).
  const src = ["polished", "cleaned", "raw"].includes(currentSource) ? currentSource : "";
  const span = btn.querySelector("span");
  const orig = span ? span.textContent : "";
  if (span) span.textContent = "Translating…";
  btn.disabled = true;
  try {
    const qs = `target=${encodeURIComponent(lang)}` + (src ? `&source=${src}` : "");
    const updated = await api(`api/v1/transcriptions/${lastResult.id}/translate?${qs}`, { method: "POST" });
    showResult(updated);
    // Switch the view to the fresh translation.
    if (updated.text_translated) {
      currentSource = "translated";
      paintSourceButtons();
      applySource();
    }
  } catch (e) {
    recStatus.textContent = `Translate failed: ${e.message}`;
  } finally {
    if (span) span.textContent = orig;
    btn.disabled = false;
  }
});

// ---- Polish-too-long fallback dialog ----
const polishDialog = {
  el:        document.getElementById("polishTooLongDialog"),
  msg:       document.getElementById("polishDialogMessage"),
  useStd:    document.getElementById("polishUseStandardBtn"),
  queue:     document.getElementById("polishQueueBtn"),
  cancel:    document.getElementById("polishCancelBtn"),
  pendingId: null,
};

function showPolishTooLongDialog(message, transcriptionId) {
  polishDialog.pendingId = transcriptionId;
  polishDialog.msg.textContent = message;
  polishDialog.el.classList.remove("hidden");
}
function hidePolishDialog() {
  polishDialog.el.classList.add("hidden");
  polishDialog.pendingId = null;
}

polishDialog.cancel.addEventListener("click", hidePolishDialog);

polishDialog.useStd.addEventListener("click", async () => {
  const tid = polishDialog.pendingId;
  hidePolishDialog();
  if (!tid) return;
  try {
    const updated = await api(
      `api/v1/transcriptions/${tid}/polish?mode=standard`,
      { method: "POST" }
    );
    showResult(updated);
    showToast("Polished with Standard ✓");
  } catch (e) {
    recStatus.textContent = `Standard polish failed: ${e.message}`;
  }
});

polishDialog.queue.addEventListener("click", async () => {
  const tid = polishDialog.pendingId;
  hidePolishDialog();
  if (!tid) return;
  try {
    const r = await api(
      `api/v1/transcriptions/${tid}/polish-queue?mode=strong`,
      { method: "POST" }
    );
    showToast(`Queued ${r.total_chunks} chunks — find it in Notes → Queued`);
  } catch (e) {
    recStatus.textContent = `Queue failed: ${e.message}`;
  }
});

// ---- Toast helper ----
const toastEl = document.getElementById("appToast");
let toastHideTimer = null;
function showToast(text, durationMs = 4500) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.classList.remove("hidden", "fading");
  clearTimeout(toastHideTimer);
  toastHideTimer = setTimeout(() => {
    toastEl.classList.add("fading");
    setTimeout(() => toastEl.classList.add("hidden"), 280);
  }, durationMs);
}

document.getElementById("reTranscribeBtn").addEventListener("click", (ev) => {
  const btn = ev.currentTarget;
  if (btn.disabled) return;
  runWithBusy(btn, "Re-transcribing…", () =>
    api(`api/v1/transcriptions/${lastResult.id}/retranscribe`, { method: "POST" })
  );
});

// ----- History -----
const historyList = document.getElementById("historyList");
const historyMore = document.getElementById("historyMore");
const historySearch = document.getElementById("historySearch");
let historyCursor = null;
let historyQuery = "";

document.getElementById("historyRefresh").addEventListener("click", () => refreshHistory());
historySearch.addEventListener("input", () => {
  clearTimeout(historySearch._t);
  historySearch._t = setTimeout(() => { historyQuery = historySearch.value.trim(); refreshHistory(); }, 250);
});
historyMore.addEventListener("click", () => loadHistory(false));

async function refreshHistory() {
  historyList.innerHTML = "";
  historyCursor = null;
  await loadHistory(true);
}

async function loadHistory(reset) {
  const params = new URLSearchParams({ limit: "30" });
  if (historyCursor) params.set("cursor", historyCursor);
  if (historyQuery) params.set("q", historyQuery);
  try {
    const data = await api(`api/v1/transcriptions?${params}`);
    for (const it of data.items) historyList.appendChild(renderHistoryItem(it));
    historyCursor = data.next_cursor;
    historyMore.classList.toggle("hidden", !historyCursor);
    if (reset && data.items.length === 0) {
      historyList.innerHTML = `<li class="muted">No transcriptions yet.</li>`;
    }
  } catch (e) {
    if (handleAuthError(e)) return;
    if (e.status === 401) {
      historyList.innerHTML = `<li class="muted">Set API key in Settings first.</li>`;
      return;
    }
    historyList.replaceChildren(errorRow(e.message));
  }
}

function errorRow(message) {
  const li = document.createElement("li");
  li.className = "muted";
  li.textContent = `Error: ${message}`;
  return li;
}

function renderHistoryItem(it) {
  const li = document.createElement("li");
  li.className = "glass list-card";
  const dt = new Date(it.created_at * 1000);
  const time = dt.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const dur = it.duration_s
    ? `${Math.floor(it.duration_s / 60)}:${String(Math.round(it.duration_s % 60)).padStart(2, "0")}`
    : "";
  li.innerHTML = `
    <div class="lc-top">
      <span class="lc-time"></span>
      <span class="tag neutral lc-tag"></span>
    </div>
    <div class="lc-snippet"></div>
    <div class="mini-meta">
      <span class="mini-wave" aria-hidden="true"></span>
      <span class="mini-dot"></span>
      <span class="lc-lang"></span>
      ${dur ? '<span class="mini-dot"></span><span class="lc-dur"></span>' : ""}
    </div>`;
  li.querySelector(".lc-time").textContent = time;
  const src = it.source || "saved";
  const tag = li.querySelector(".lc-tag");
  tag.textContent = src;
  tag.className = "tag" + (src === "Polished" || src === "polished" ? "" : " neutral");
  li.querySelector(".lc-snippet").textContent = it.text;
  li.querySelector(".lc-lang").textContent = it.language || "—";
  if (dur) li.querySelector(".lc-dur").textContent = dur;
  // Generate mini waveform bars
  const waveEl = li.querySelector(".mini-wave");
  for (let i = 0; i < 18; i++) {
    const h = 3 + Math.round(9 * Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.5)));
    const bar = document.createElement("i");
    bar.style.height = h + "px";
    waveEl.appendChild(bar);
  }
  li.addEventListener("click", async () => {
    try {
      const full = await api(`api/v1/transcriptions/${it.id}`);
      showResult(full);
      document.querySelector('nav button[data-tab="record"]').click();
      document.querySelector(".screen-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      alert("Failed to load: " + e.message);
    }
  });
  return li;
}

// ----- Glossary -----
const glPersonal = document.getElementById("glossaryPersonal");
const glAnti     = document.getElementById("glossaryAntiCorrect");
const glStatus   = document.getElementById("glossaryStatus");

async function loadGlossary() {
  try {
    const g = await api("api/v1/glossary");
    glPersonal.value = g.personal.join("\n");
    glAnti.value     = g.anti_correct.join("\n");
    renderChips("glossaryCore", g.core);
    renderChips("glossaryExtended", g.extended);
  } catch (e) {
    glStatus.textContent = "Failed to load: " + e.message;
  }
}
function renderChips(id, terms) {
  const ul = document.getElementById(id);
  ul.innerHTML = "";
  for (const t of terms) {
    const li = document.createElement("li");
    li.className = "chip";
    li.textContent = t;
    ul.appendChild(li);
  }
}
document.getElementById("glossarySave").addEventListener("click", async () => {
  glStatus.textContent = "Saving…";
  try {
    await api("api/v1/glossary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personal:    glPersonal.value.split("\n").map(s => s.trim()).filter(Boolean),
        anti_correct: glAnti.value.split("\n").map(s => s.trim()).filter(Boolean),
      }),
    });
    glStatus.textContent = "Saved.";
    setTimeout(() => glStatus.textContent = "", 1500);
  } catch (e) {
    glStatus.textContent = "Failed: " + e.message;
  }
});

// ----- Modes & models (static reference cards) + Glossary sub-navigation -----
const MODES = [
  { icon: "waveform", title: "Transcribe", model: "whisper-large-v3",
    desc: "Speech to text. Verbatim output with punctuation and casing.",
    limits: [["Max clip", "25 MB · ~30 min"], ["Languages", "99 (auto)"], ["Audio in", "16 kHz mono"], ["Avg latency", "0.8 s"]],
    instr: "Transcribe the audio verbatim.\nKeep punctuation and casing.\nDo not translate.\nMark unclear spans as [...]." },
  { icon: "broom", title: "Cleanup", model: "llama-3.1-8b-instant",
    desc: "Fixes recognition errors. Keeps your exact wording and tone.",
    limits: [["Context", "8K tokens"], ["Chunk", "1,200 words"], ["Rate", "30 / min"], ["Avg latency", "1.2 s"]],
    instr: "Correct only recognition errors and obvious typos.\nPreserve wording, slang and structure.\nNever paraphrase.\nApply glossary terms exactly." },
  { icon: "sparkles", title: "Polish", model: "llama-3.3-70b-versatile",
    desc: "Rewrites for readability. Removes filler and fixes flow.",
    limits: [["Context", "32K tokens"], ["Chunk", "2,500 words"], ["Rate", "14 / min"], ["Avg latency", "2.1 s"]],
    instr: "Rewrite for clarity and natural flow.\nRemove filler and false starts.\nKeep meaning and key terms.\nMatch the source language." },
  { icon: "globe", title: "Translate", model: "llama-3.3-70b-versatile",
    desc: "Translates the transcript into a chosen target language.",
    limits: [["Context", "32K tokens"], ["Targets", "30+ languages"], ["Rate", "14 / min"], ["Avg latency", "2.4 s"]],
    instr: "Translate into the target language.\nPreserve names and glossary terms.\nKeep the tone natural, not literal." },
];
let _modesRendered = false;
function renderModesOnce() {
  if (_modesRendered) return;
  const host = document.getElementById("modesList");
  if (!host) return;
  for (const m of MODES) {
    const cells = m.limits.map(([k, v]) =>
      `<div class="limit-cell"><div class="limit-k">${k}</div><div class="limit-v">${v}</div></div>`).join("");
    const card = document.createElement("article");
    card.className = "glass mode-card";
    card.innerHTML = `
      <div class="mode-head">
        <div class="mode-ic"><svg class="ic"><use href="#i-${m.icon}"/></svg></div>
        <div><div class="mode-title">${m.title}</div><div class="mode-desc">${m.desc}</div></div>
      </div>
      <div class="mode-model"><svg class="ic"><use href="#i-cpu"/></svg><span>Model</span><span class="model-tag">${m.model}</span></div>
      <div class="limit-grid">${cells}</div>
      <div class="instr">
        <div class="instr-h"><svg class="ic"><use href="#i-doc"/></svg><span>Instructions</span></div>
        <div class="instr-body"></div>
      </div>`;
    card.querySelector(".instr-body").textContent = m.instr;
    host.appendChild(card);
  }
  _modesRendered = true;
}
function showModesMain() {
  document.getElementById("modesMain")?.classList.remove("hidden");
  document.getElementById("modesGlossary")?.classList.add("hidden");
  document.getElementById("modesInstructions")?.classList.add("hidden");
}
function showModesGlossary() {
  document.getElementById("modesMain")?.classList.add("hidden");
  document.getElementById("modesInstructions")?.classList.add("hidden");
  document.getElementById("modesGlossary")?.classList.remove("hidden");
  loadGlossary();
}
function showModesInstructions() {
  document.getElementById("modesMain")?.classList.add("hidden");
  document.getElementById("modesGlossary")?.classList.add("hidden");
  document.getElementById("modesInstructions")?.classList.remove("hidden");
  loadPrompts();
}
document.getElementById("glossaryOpen")?.addEventListener("click", showModesGlossary);
document.getElementById("glossaryBack")?.addEventListener("click", showModesMain);
document.getElementById("instrOpen")?.addEventListener("click", showModesInstructions);
document.getElementById("instrBack")?.addEventListener("click", showModesMain);
document.getElementById("settingsModesLink")?.addEventListener("click", () => {
  document.querySelector('nav button[data-tab="modes"]').click();
});
function wireCollapse(toggleId, listId) {
  const t = document.getElementById(toggleId), l = document.getElementById(listId);
  if (!t || !l) return;
  t.addEventListener("click", () => {
    const nowHidden = l.classList.toggle("hidden");
    t.classList.toggle("open", !nowHidden);
  });
}
wireCollapse("glossaryCoreToggle", "glossaryCore");
wireCollapse("glossaryExtToggle", "glossaryExtended");
wireCollapse("instrGuideToggle", "instrGuide");

// ----- Editable model instructions (cleanup/polish system prompts) -----
function _esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function setInstrStatus(msg) {
  const el = document.getElementById("instrStatus");
  if (el) el.textContent = msg || "";
}
let _promptsLoaded = false;
async function loadPrompts(force) {
  const host = document.getElementById("instrList");
  if (!host || (_promptsLoaded && !force)) return;
  host.innerHTML = `<p class="hint" style="margin:4px">Loading…</p>`;
  setInstrStatus("");
  try {
    const data = await api("api/v1/prompts");
    host.innerHTML = "";
    for (const it of data.items) host.appendChild(buildPromptCard(it));
    _promptsLoaded = true;
  } catch (e) {
    host.innerHTML = "";
    setInstrStatus("Failed to load: " + e.message);
  }
}
function buildPromptCard(it) {
  const card = document.createElement("article");
  card.className = "glass card-pad";
  card.dataset.stage = it.stage;
  card.dataset.mode = it.mode;
  const note = it.mode_note ? `<span class="hint">· ${_esc(it.mode_note)}</span>` : "";
  card.innerHTML = `
    <div style="font-size:15px;font-weight:640;margin-bottom:2px">${_esc(it.label)} ${note}</div>
    <div class="hint" style="margin-bottom:10px">${_esc(it.stage_desc)}</div>
    <label class="field-label">Instruction</label>
    <textarea class="textarea instr-base" rows="5" spellcheck="false"></textarea>
    <label class="field-label" style="margin-top:10px">Extra rules <span class="field-hint">added on top — optional</span></label>
    <textarea class="textarea instr-extra" rows="3" spellcheck="false" placeholder="e.g. Always spell out numbers under ten"></textarea>
    <div class="row gap-s" style="margin-top:10px;align-items:center">
      <button class="btn btn-primary instr-save"><svg class="ic"><use href="#i-check"/></svg><span>Save</span></button>
      <button class="btn btn-ghost instr-reset"><svg class="ic"><use href="#i-refresh"/></svg><span>Reset</span></button>
      <span class="hint instr-state"></span>
    </div>`;
  const baseTa = card.querySelector(".instr-base");
  baseTa.value = it.base ?? it.default_base;
  baseTa.dataset.default = it.default_base;
  card.querySelector(".instr-extra").value = it.extra || "";
  card.querySelector(".instr-save").addEventListener("click", () => savePromptCard(card));
  card.querySelector(".instr-reset").addEventListener("click", () => resetPromptCard(card));
  return card;
}
async function savePromptCard(card) {
  const { stage, mode } = card.dataset;
  const state = card.querySelector(".instr-state");
  state.textContent = "Saving…";
  try {
    await api(`api/v1/prompts/${stage}/${mode}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base: card.querySelector(".instr-base").value,
        extra: card.querySelector(".instr-extra").value,
      }),
    });
    state.textContent = "Saved.";
    setTimeout(() => (state.textContent = ""), 1500);
  } catch (e) {
    state.textContent = "Failed: " + e.message;
  }
}
async function resetPromptCard(card) {
  const { stage, mode } = card.dataset;
  const state = card.querySelector(".instr-state");
  state.textContent = "Resetting…";
  try {
    await api(`api/v1/prompts/${stage}/${mode}/reset`, { method: "POST" });
    const baseTa = card.querySelector(".instr-base");
    baseTa.value = baseTa.dataset.default;
    card.querySelector(".instr-extra").value = "";
    state.textContent = "Reset to default.";
    setTimeout(() => (state.textContent = ""), 1500);
  } catch (e) {
    state.textContent = "Failed: " + e.message;
  }
}

// ----- Settings UI -----
const apiBase = document.getElementById("apiBase");
const defLang = document.getElementById("defLang");
const defCleanup = document.getElementById("defCleanup");
const defTranslateLang = document.getElementById("defTranslateLang");
const audioBitrate = document.getElementById("audioBitrate");
const settingsStatus = document.getElementById("settingsStatus");

function paintSettings() {
  apiBase.value = settings.apiBase;
  defLang.value = settings.defLang;
  defCleanup.value = settings.defCleanup;
  if (defTranslateLang) defTranslateLang.value = settings.defTranslateLang;
  // Whisper resamples to 16 kHz mono, so bitrate above ~32 kbps buys no
  // transcription quality. We now only offer 24/32; coerce any legacy
  // 48k/64k preference down to the recommended 32k.
  const ALLOWED_BITRATES = new Set([24000, 32000]);
  if (!ALLOWED_BITRATES.has(settings.audioBitrate)) settings.audioBitrate = 32000;
  audioBitrate.value = String(settings.audioBitrate);
  // Default the result-card target-language picker to the saved preference.
  const tlSel = document.getElementById("translateLang");
  if (tlSel) tlSel.value = settings.defTranslateLang;
}
paintSettings();

document.getElementById("settingsSave").addEventListener("click", () => {
  settings = {
    ...settings,
    apiBase: apiBase.value.trim().replace(/\/+$/, ""),
    defLang: defLang.value,
    defCleanup: defCleanup.value,
    defTranslateLang: defTranslateLang ? defTranslateLang.value : settings.defTranslateLang,
    audioBitrate: Number(audioBitrate.value),
  };
  saveSettings(settings);
  settingsStatus.textContent = "Saved.";
  setTimeout(() => settingsStatus.textContent = "", 1500);
});

document.getElementById("settingsTest").addEventListener("click", async () => {
  settingsStatus.textContent = "Testing…";
  try {
    const r = await api("api/v1/health");
    settingsStatus.textContent = `OK (server v${r.version})`;
  } catch (e) {
    settingsStatus.textContent = "Failed: " + e.message;
  }
});

// ----- Usage -----
const usageDetails = document.getElementById("usageDetails");
function fmtMinutes(seconds) {
  if (!seconds) return "0 min";
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const m = seconds / 60;
  return m < 60 ? `${m.toFixed(1)} min` : `${(m / 60).toFixed(1)}h`;
}
function fmtBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function paintBucket(suffix, b) {
  // Main value = time, sub = clip count (matches design: "14m" / "23 clips")
  document.getElementById("usage" + suffix).textContent =
    b.audio_seconds ? fmtMinutes(b.audio_seconds) : "—";
  document.getElementById("usage" + suffix + "Sub").textContent =
    `${b.transcriptions} ${b.transcriptions === 1 ? "clip" : "clips"}`;
}
async function loadUsage() {
  usageDetails.textContent = "Loading…";
  try {
    const u = await api("api/v1/usage");
    paintBucket("Today", u.buckets.day);
    paintBucket("Week",  u.buckets.week);
    paintBucket("Month", u.buckets.month);
    paintBucket("All",   u.buckets.all);
    const all = u.buckets.all;
    const compute = (all.whisper_ms + all.cleanup_ms) / 1000;
    usageDetails.textContent =
      `${all.cleanups} cleanup runs · ${compute.toFixed(1)}s total processing time. ` +
      `Aggregated from local DB; Groq billing may differ.`;
  } catch (e) {
    if (handleAuthError(e)) return;
    if (e.status === 401) {
      usageDetails.textContent = "Set API key first to see usage.";
      return;
    }
    usageDetails.textContent = "Failed to load usage: " + e.message;
  }
}
document.getElementById("usageRefresh").addEventListener("click", loadUsage);

// ----- Microphone diagnostics -----
const micStatusBox = document.getElementById("micStatusBox");

async function describeMicState() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return { state: "unsupported", text: "Recording not supported in this browser." };
  }
  let permState = "unknown";
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const status = await navigator.permissions.query({ name: "microphone" });
      permState = status.state;        // 'granted' | 'denied' | 'prompt'
    } catch { /* iOS Safari sometimes throws on this query — ignore */ }
  }
  return { state: permState };
}

document.getElementById("settingsTestMic").addEventListener("click", async () => {
  micStatusBox.textContent = "";
  settingsStatus.textContent = "Requesting microphone…";

  // Step 1: pre-check declared state
  const pre = await describeMicState();
  if (pre.state === "unsupported") {
    settingsStatus.textContent = "Failed";
    micStatusBox.textContent = pre.text;
    return;
  }
  if (pre.state === "denied") {
    settingsStatus.textContent = "Permission denied";
    micStatusBox.textContent = describeMediaError({ name: "NotAllowedError" });
    return;
  }

  // Step 2: actually attempt — this is what triggers the iOS prompt if state was 'prompt'
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    console.error("Mic test failed:", err);
    settingsStatus.textContent = "Permission denied";
    micStatusBox.textContent = describeMediaError(err);
    return;
  }

  // Step 3: collect track info, release stream immediately, success message
  const track = stream.getAudioTracks()[0];
  const label = track ? track.label || "(unnamed device)" : "no track";
  const settings_ = track && track.getSettings ? track.getSettings() : {};
  stream.getTracks().forEach(t => t.stop());

  settingsStatus.textContent = "OK";
  micStatusBox.textContent =
    `✓ Microphone OK\n` +
    `Device: ${label}\n` +
    (settings_.sampleRate ? `Sample rate: ${settings_.sampleRate} Hz\n` : "") +
    (settings_.channelCount ? `Channels: ${settings_.channelCount}\n` : "") +
    `You can now record on the Record tab.`;
});

// ============================================================================
// Notes tab — typed + dictated documents with per-note pipeline settings.
// ============================================================================
const notesElem = {
  // List view
  listView:    document.getElementById("notesListView"),
  list:        document.getElementById("notesList"),
  empty:       document.getElementById("notesEmpty"),
  noMatch:     document.getElementById("notesNoMatch"),
  more:        document.getElementById("notesMoreBtn"),
  newBtn:      document.getElementById("notesNewBtn"),
  search:      document.getElementById("notesSearch"),
  queuedSection: document.getElementById("notesQueuedSection"),
  queuedList:    document.getElementById("notesQueuedList"),
  // Editor view
  editView:    document.getElementById("notesEditView"),
  back:        document.getElementById("notesBackBtn"),
  delete:      document.getElementById("notesDeleteBtn"),
  settingsBtn: document.getElementById("notesSettingsBtn"),
  popover:     document.getElementById("notesSettingsPopover"),
  saveStatus:  document.getElementById("notesSaveStatus"),
  title:       document.getElementById("notesTitle"),
  body:        document.getElementById("notesBody"),
  pipeline:    document.getElementById("notesPipelineSummary"),
  setCleanup:  document.getElementById("notesSettingCleanup"),
  setPolish:   document.getElementById("notesSettingPolish"),
  setLang:     document.getElementById("notesSettingLang"),
  // Mic + overlay
  mic:         document.getElementById("notesMicBtn"),
  overlay:     document.getElementById("notesRecOverlay"),
  ovTimer:     document.getElementById("notesRecTimer"),
  ovStatus:    document.getElementById("notesRecStatus"),
};

let notesState = {
  view: "list",         // "list" | "edit"
  cursor: null,
  items: [],
  query: "",            // current search query (FTS5; trimmed)
  active: null,         // current note object when in edit view
  saveTimer: null,
  pendingPatch: null,
  cursorAt: 0,
  recDictate: { stream: null, recorder: null, chunks: [], startTs: 0, timerInt: null },
};

function setSaveStatus(state) {
  notesElem.saveStatus.classList.remove("saved", "saving", "unsaved", "error");
  notesElem.saveStatus.classList.add(state);
  notesElem.saveStatus.textContent = {
    saved:   "Saved",
    saving:  "Saving…",
    unsaved: "Unsaved",
    error:   "Save failed",
  }[state] || state;
}

function fmtRelative(ts) {
  const diff = (Date.now() / 1000) - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} d ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

async function notesLoadList(reset = true) {
  if (reset) {
    notesState.cursor = null;
    notesElem.list.innerHTML = "";
  }
  // Always refresh the Queued section first; it's a separate query and
  // its progress is what users want to see updating in real time.
  await notesRefreshQueued();

  const params = new URLSearchParams({ limit: "30", queue: "idle" });
  if (notesState.cursor) params.set("cursor", notesState.cursor);
  if (notesState.query) params.set("q", notesState.query);
  try {
    const data = await api(`api/v1/notes?${params}`);
    if (reset) notesState.items = [];
    notesState.items.push(...data.items);
    for (const it of data.items) notesElem.list.appendChild(renderNoteItem(it));
    notesState.cursor = data.next_cursor;
    notesElem.more.classList.toggle("hidden", !notesState.cursor);
    const empty = notesState.items.length === 0;
    const searching = notesState.query.length > 0;
    notesElem.empty.classList.toggle("hidden", !empty || searching);
    notesElem.noMatch.classList.toggle("hidden", !empty || !searching);
  } catch (e) {
    if (handleAuthError(e)) return;
    if (e.status === 401) {
      notesElem.list.innerHTML = `<li class="muted">Set API key in Settings first.</li>`;
      notesElem.empty.classList.add("hidden");
      notesElem.noMatch.classList.add("hidden");
      notesElem.queuedSection.classList.add("hidden");
      return;
    }
    notesElem.list.replaceChildren(errorRow(e.message));
  }
}

async function notesRefreshQueued() {
  try {
    const data = await api("api/v1/notes?queue=processing&limit=20");
    notesElem.queuedList.innerHTML = "";
    if (!data.items || data.items.length === 0) {
      notesElem.queuedSection.classList.add("hidden");
      _stopQueuePolling();
      return;
    }
    notesElem.queuedSection.classList.remove("hidden");
    for (const it of data.items) {
      notesElem.queuedList.appendChild(renderNoteItem(it, { queued: true }));
    }
    _startQueuePolling();
  } catch (e) {
    // Don't blow up the whole page if just the queued query fails.
    console.warn("Queued list refresh failed:", e.message);
  }
}

let _queuePollInterval = null;
function _startQueuePolling() {
  if (_queuePollInterval) return;
  // Poll every 30 s while there's at least one queued note in flight.
  // Stops automatically when the section becomes empty (in refreshQueued).
  _queuePollInterval = setInterval(notesRefreshQueued, 30 * 1000);
}
function _stopQueuePolling() {
  if (_queuePollInterval) {
    clearInterval(_queuePollInterval);
    _queuePollInterval = null;
  }
}

function renderNoteItem(n, opts = {}) {
  const li = document.createElement("li");
  li.className = "glass list-card";
  const title = (n.title || "").trim() || "Untitled";
  const snippet = (n.snippet || "").trim() || "(empty)";
  li.innerHTML = `
    <div class="lc-title"></div>
    <div class="lc-snippet"></div>
    <div class="lc-time" style="margin-top:7px"></div>
  `;
  li.querySelector(".lc-title").textContent = title;
  li.querySelector(".lc-snippet").textContent = snippet;
  li.querySelector(".lc-time").textContent = fmtRelative(n.updated_at);

  // For queued notes, show progress instead of (or alongside) the
  // standard "5 min ago" timestamp.
  if (opts.queued && n.queue_status === "processing") {
    const total = n.queue_total_chunks || 0;
    const done = n.queue_completed_chunks || 0;
    const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
    const statusRow = document.createElement("div");
    statusRow.className = "row gap-s";
    statusRow.style.cssText = "font-size:12.5px;color:var(--fg-dim);margin-top:6px";
    // ios-spinner (8 spokes)
    const spinner = document.createElement("span");
    spinner.className = "ios-spinner";
    spinner.setAttribute("role", "status");
    for (let s = 0; s < 8; s++) {
      const spoke = document.createElement("i");
      spoke.style.setProperty("--n", s);
      spinner.appendChild(spoke);
    }
    statusRow.appendChild(spinner);
    const statusText = document.createElement("span");
    statusText.textContent = total > 0
      ? `Polishing, chunk ${done + 1} of ${total}`
      : "Polishing…";
    statusRow.appendChild(statusText);
    li.appendChild(statusRow);
    const progressBar = document.createElement("div");
    progressBar.className = "note-progress";
    progressBar.innerHTML = '<div class="note-progress-bar" style="width:0%"></div>';
    progressBar.querySelector(".note-progress-bar").style.width = `${pct}%`;
    li.appendChild(progressBar);
  }

  li.addEventListener("click", () => notesOpen(n.id));
  return li;
}

async function notesOpen(id) {
  try {
    const n = await api(`api/v1/notes/${id}`);
    notesState.active = n;
    notesElem.title.value = n.title || "";
    notesElem.body.value = n.body || "";
    notesElem.setCleanup.value = n.cleanup_mode || "off";
    notesElem.setPolish.value = n.polish_mode || "off";
    notesElem.setLang.value = n.language || "auto";
    paintPipelineSummary();
    setSaveStatus("saved");
    notesElem.popover.classList.add("hidden");
    notesElem.listView.classList.add("hidden");
    notesElem.editView.classList.remove("hidden");
    notesState.view = "edit";
    // Mic FAB visible in edit view; hidden in list — handled by view-switching
    notesElem.mic.style.display = "flex";
  } catch (e) {
    alert("Couldn't open note: " + e.message);
  }
}

function notesBackToList() {
  notesElem.editView.classList.add("hidden");
  notesElem.listView.classList.remove("hidden");
  notesElem.mic.style.display = "none";
  notesState.view = "list";
  notesState.active = null;
  // Refresh list so the just-edited note moves to the top with new timestamp.
  notesLoadList(true);
}

async function notesCreate() {
  try {
    const n = await api("api/v1/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await notesOpen(n.id);
  } catch (e) {
    if (handleAuthError(e)) return;
    if (e.status === 401) {
      alert("Set API key in Settings first.");
      return;
    }
    alert("Couldn't create note: " + e.message);
  }
}

async function notesDelete() {
  if (!notesState.active) return;
  if (!confirm("Delete this note? This can't be undone.")) return;
  try {
    await api(`api/v1/notes/${notesState.active.id}`, { method: "DELETE" });
    notesBackToList();
  } catch (e) {
    alert("Delete failed: " + e.message);
  }
}

function paintPipelineSummary() {
  const c = notesElem.setCleanup.value;
  const p = notesElem.setPolish.value;
  const l = notesElem.setLang.value;
  notesElem.pipeline.innerHTML = "";
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const parts = [];
  if (c !== "off") parts.push(`Cleanup · ${cap(c)}`);
  if (p !== "off") parts.push(`Polish · ${cap(p)}`);
  parts.push(l === "auto" ? "Auto-detect" : l.toUpperCase());
  for (const text of parts) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = text;
    notesElem.pipeline.appendChild(chip);
  }
}

function notesScheduleSave() {
  if (!notesState.active) return;
  setSaveStatus("unsaved");
  clearTimeout(notesState.saveTimer);
  notesState.saveTimer = setTimeout(notesPerformSave, 1500);
}

async function notesPerformSave() {
  if (!notesState.active) return;
  const id = notesState.active.id;
  setSaveStatus("saving");
  const payload = {
    title:        notesElem.title.value,
    body:         notesElem.body.value,
    cleanup_mode: notesElem.setCleanup.value,
    polish_mode:  notesElem.setPolish.value,
    language:     notesElem.setLang.value,
  };
  try {
    const updated = await api(`api/v1/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    notesState.active = updated;
    setSaveStatus("saved");
  } catch (e) {
    console.error("Note save failed:", e);
    setSaveStatus("error");
  }
}

// Wiring: editing → schedule auto-save
for (const el of [notesElem.title, notesElem.body]) {
  el.addEventListener("input", notesScheduleSave);
}
for (const el of [notesElem.setCleanup, notesElem.setPolish, notesElem.setLang]) {
  el.addEventListener("change", () => {
    paintPipelineSummary();
    notesScheduleSave();
  });
}

notesElem.newBtn?.addEventListener("click", notesCreate);
notesElem.back?.addEventListener("click", async () => {
  // Force-flush any pending save before leaving so we don't drop edits.
  clearTimeout(notesState.saveTimer);
  await notesPerformSave();
  notesBackToList();
});
notesElem.delete?.addEventListener("click", notesDelete);
notesElem.more?.addEventListener("click", () => notesLoadList(false));
notesElem.settingsBtn?.addEventListener("click", () => {
  notesElem.popover.classList.toggle("hidden");
});

// Hide the mic FAB unless the editor is open.
notesElem.mic.style.display = "none";

// ----- Cursor-aware dictation -----
function notesDictateStart() {
  if (!notesState.active) return;
  if (notesState.recDictate.recorder) return;     // already recording
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("Recording not supported in this browser.");
    return;
  }
  // Capture cursor position now so we know where to insert later.
  notesState.cursorAt = notesElem.body.selectionStart || notesElem.body.value.length;
  notesState.cursorAtBodyLen = notesElem.body.value.length;
  beginDictation();
}

async function beginDictation() {
  try {
    notesState.recDictate.stream = await navigator.mediaDevices.getUserMedia({
      // Mono capture — see beginRecording(): Whisper is mono, so one channel
      // is optimal and keeps uploads small.
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    alert("Mic error: " + describeMediaError(err));
    return;
  }
  const mime = pickMime();
  const opts = { audioBitsPerSecond: settings.audioBitrate };
  if (mime) opts.mimeType = mime;
  let rec;
  try {
    rec = new MediaRecorder(notesState.recDictate.stream, opts);
  } catch (err) {
    alert("Recorder failed: " + err.message);
    notesState.recDictate.stream.getTracks().forEach(t => t.stop());
    notesState.recDictate.stream = null;
    return;
  }
  notesState.recDictate.recorder = rec;
  notesState.recDictate.chunks = [];
  rec.ondataavailable = e => { if (e.data.size) notesState.recDictate.chunks.push(e.data); };
  rec.onstop = onDictateStopped;
  rec.start();
  notesState.recDictate.startTs = Date.now();
  notesState.recDictate.timerInt = setInterval(() => {
    notesElem.ovTimer.textContent = fmtDuration(Date.now() - notesState.recDictate.startTs);
  }, 200);

  notesElem.overlay.classList.remove("hidden");
  notesElem.ovTimer.textContent = "00:00";
  notesElem.ovStatus.textContent = "Tap anywhere to stop";
  notesElem.mic.classList.add("recording");
}

function notesDictateStop() {
  const r = notesState.recDictate;
  if (!r.recorder) return;
  if (r.recorder.state !== "inactive") r.recorder.stop();
  if (r.stream) r.stream.getTracks().forEach(t => t.stop());
  clearInterval(r.timerInt);
  notesElem.mic.classList.remove("recording");
}

async function onDictateStopped() {
  const r = notesState.recDictate;
  notesElem.ovStatus.textContent = "Transcribing…";
  const mime = r.recorder.mimeType || "audio/webm";
  const blob = new Blob(r.chunks, { type: mime });
  r.recorder = null;
  r.stream = null;

  const ext = mime.includes("mp4") || mime.includes("aac") ? "m4a"
            : mime.includes("ogg") ? "ogg" : "webm";
  const fd = new FormData();
  fd.append("file", blob, `dictate.${ext}`);
  try {
    const res = await api(`api/v1/notes/${notesState.active.id}/dictate`, {
      method: "POST",
      body: fd,
    });
    insertDictation(res.text);
  } catch (e) {
    alert("Dictation failed: " + friendlyError(e));
  } finally {
    notesElem.overlay.classList.add("hidden");
  }
}

function insertDictation(text) {
  if (!text) return;
  const body = notesElem.body;
  // If the user typed during the wait, the cursor offset may be stale.
  // Resolve: clamp cursorAt to current body length, and if the body grew,
  // append at end with a leading space so we don't break a word.
  const grew = body.value.length > notesState.cursorAtBodyLen;
  let at = Math.min(notesState.cursorAt, body.value.length);
  let toInsert = text;
  if (grew) {
    at = body.value.length;
    if (body.value && !body.value.endsWith(" ") && !body.value.endsWith("\n")) {
      toInsert = " " + toInsert;
    }
  }
  const before = body.value.slice(0, at);
  const after = body.value.slice(at);
  body.value = before + toInsert + after;
  const newCursor = at + toInsert.length;
  body.selectionStart = body.selectionEnd = newCursor;
  body.focus();
  notesScheduleSave();
}

notesElem.mic.addEventListener("click", () => {
  if (notesState.recDictate.recorder) notesDictateStop();
  else notesDictateStart();
});
notesElem.overlay.addEventListener("click", notesDictateStop);

// ----- Tab switching: auto-load on activation, force-save on leave -----
const origTabClickHandler = (() => {
  // Patch: listen on each tabbar button to load notes when the Notes tab opens
  // and to save+leave when the user navigates away from an open editor.
  for (const btn of document.querySelectorAll('nav.tabbar button')) {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.tab;
      // Leaving an open editor: flush save first.
      if (notesState.view === "edit" && tab !== "notes") {
        clearTimeout(notesState.saveTimer);
        await notesPerformSave();
      }
      if (tab === "notes") {
        // Show whichever sub-view we last had — list by default.
        if (notesState.view === "list") notesLoadList(true);
        // FAB visibility tracks edit view
        notesElem.mic.style.display = (notesState.view === "edit") ? "flex" : "none";
      } else {
        notesElem.mic.style.display = "none";
        // Don't burn CPU/network polling the queue when the user is
        // looking at History or Settings. notesLoadList() will restart
        // it the next time they land on Notes.
        _stopQueuePolling();
      }
    });
  }
})();

// ============================================================================
// Service Worker — registration + auto-update.
//
// The PWA is built so any deploy lands on the user's device within seconds,
// no "force-quit twice" rituals:
//
//   1. /sw.js is served with `Cache-Control: no-cache, must-revalidate`
//      (see backend/app/main.py service_worker route), so the browser does
//      a conditional GET on every page load.
//   2. We call registration.update() right after registration AND every 60 s
//      while the app stays open — picks up new SW bytes proactively.
//   3. When the new SW activates and takes over (it does so eagerly via
//      skipWaiting() + clients.claim() in sw.js), the `controllerchange`
//      event fires here. The currently rendered page still holds the
//      previous build's CSS/JS in memory, so we reload — the next paint
//      uses the fresh shell straight from the new cache.
//
// The reload is suppressed once at boot because the very first registration
// also fires `controllerchange` (no-controller → freshly-installed), and
// reloading there would just thrash the page on first launch.
// ============================================================================
if ("serviceWorker" in navigator) {
  let suppressNextControllerChange = !navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (suppressNextControllerChange) {
      suppressNextControllerChange = false;
      return;
    }
    // A new SW just took over the page — reload so the in-memory CSS/JS
    // catches up with the freshly-cached shell.
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      // Kick an immediate update check right after registration completes.
      reg.update().catch(() => {});

      // Periodic check while the app stays open. 60 s is plenty granular
      // for "I deployed and want the user to see it" without burning data.
      setInterval(() => reg.update().catch(() => {}), 60 * 1000);

      // Also re-check when the tab becomes visible again — e.g., user
      // switches back to the PWA from another app on iOS. iOS sometimes
      // throttles background timers, so a visibility-driven check picks
      // up updates faster than waiting for the next interval tick.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    }).catch(() => {});
  });
}
