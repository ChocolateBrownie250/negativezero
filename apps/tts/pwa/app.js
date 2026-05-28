// ----- Settings (localStorage) -----
const LS_KEY = "amethyst.settings.v1";
const defaultSettings = {
  apiBase: "",       // empty = same origin
  apiKey: "",
  defLang: "auto",
  defCleanup: "on:standard",
  audioBitrate: 32000,   // up from 24k — more headroom for noisy environments
};
function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...defaultSettings };
    return { ...defaultSettings, ...JSON.parse(raw) };
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
  if (!settings.apiKey) throw new Error("No API key set. Open Settings.");
  return { Authorization: `Bearer ${settings.apiKey}` };
}
async function api(path, init = {}) {
  const headers = { ...authHeaders(), ...(init.headers || {}) };
  const resp = await fetch(apiUrl(path), { ...init, headers });
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

// ----- Tabs -----
document.querySelectorAll("nav button").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll("nav button").forEach(b => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".tab").forEach(s => s.classList.toggle("active", s.id === `tab-${tab}`));
    if (tab === "history") refreshHistory();
    if (tab === "glossary") loadGlossary();
    if (tab === "settings") loadUsage();
  });
});

// ----- Recording -----
const recBtn   = document.getElementById("recBtn");
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

async function startRecording() {
  recStatus.textContent = "";

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    recStatus.textContent = "This browser doesn't support audio recording. Use Safari on iOS or any modern desktop browser.";
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
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
  recBtn.setAttribute("aria-label", "Stop recording");
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  clearInterval(timerInt);
  recBtn.classList.remove("recording");
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
    recStatus.textContent = "";
  } catch (e) {
    recStatus.textContent = "Error: " + e.message;
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
      (src === "polished" && !!lastResult.text_polished)
    );
    btn.disabled = !available;
    btn.setAttribute("aria-checked", String(src === currentSource && available));
    btn.classList.toggle("active", src === currentSource && available);
  }
}
function applySource() {
  if (!lastResult) return;
  let text = lastResult.text;
  if (currentSource === "polished" && lastResult.text_polished) text = lastResult.text_polished;
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
  resultTimings.textContent = t.join(" · ");
  const modeBits = [];
  if (r.cleanup_mode) modeBits.push(`cleanup: ${r.cleanup_mode}`);
  if (r.polish_mode)  modeBits.push(`polish: ${r.polish_mode}`);
  resultMode.textContent = modeBits.join(" · ");
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
  if (!settings.apiKey) {
    historyList.innerHTML = `<li class="muted">Set API key in Settings first.</li>`;
    return;
  }
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
    historyList.innerHTML = `<li class="muted">Error: ${e.message}</li>`;
  }
}

function renderHistoryItem(it) {
  const li = document.createElement("li");
  const dt = new Date(it.created_at * 1000);
  const meta = [
    dt.toLocaleString(),
    it.source || "—",
    it.language || "",
    it.duration_s ? `${it.duration_s.toFixed(1)}s` : "",
    it.has_audio ? "🎵" : "",
  ].filter(Boolean).join(" · ");
  li.innerHTML = `<div class="history-meta">${meta}</div><div class="history-snippet"></div>`;
  li.querySelector(".history-snippet").textContent = it.text;
  li.addEventListener("click", async () => {
    try {
      const full = await api(`api/v1/transcriptions/${it.id}`);
      showResult(full);
      document.querySelector('nav button[data-tab="record"]').click();
      window.scrollTo({ top: 0, behavior: "smooth" });
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

// ----- Settings UI -----
const apiBase = document.getElementById("apiBase");
const apiKey  = document.getElementById("apiKey");
const defLang = document.getElementById("defLang");
const defCleanup = document.getElementById("defCleanup");
const audioBitrate = document.getElementById("audioBitrate");
const settingsStatus = document.getElementById("settingsStatus");

function paintSettings() {
  apiBase.value = settings.apiBase;
  apiKey.value  = settings.apiKey;
  defLang.value = settings.defLang;
  defCleanup.value = settings.defCleanup;
  audioBitrate.value = String(settings.audioBitrate);
}
paintSettings();

document.getElementById("settingsSave").addEventListener("click", () => {
  settings = {
    ...settings,
    apiBase: apiBase.value.trim().replace(/\/+$/, ""),
    apiKey: apiKey.value.trim(),
    defLang: defLang.value,
    defCleanup: defCleanup.value,
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
  document.getElementById("usage" + suffix).textContent =
    `${b.transcriptions} ${b.transcriptions === 1 ? "clip" : "clips"}`;
  const sub = [];
  if (b.audio_seconds) sub.push(fmtMinutes(b.audio_seconds));
  if (b.audio_bytes)   sub.push(fmtBytes(b.audio_bytes));
  document.getElementById("usage" + suffix + "Sub").textContent = sub.join(" · ");
}
async function loadUsage() {
  if (!settings.apiKey) {
    usageDetails.textContent = "Set API key first to see usage.";
    return;
  }
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
  if (!settings.apiKey) {
    notesElem.list.innerHTML = `<li class="muted">Set API key in Settings first.</li>`;
    notesElem.empty.classList.add("hidden");
    notesElem.noMatch.classList.add("hidden");
    notesElem.queuedSection.classList.add("hidden");
    return;
  }
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
    notesElem.list.innerHTML = `<li class="muted">Error: ${e.message}</li>`;
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
  const title = (n.title || "").trim() || "Untitled";
  const snippet = (n.snippet || "").trim() || "(empty)";
  li.innerHTML = `
    <div class="note-title"></div>
    <div class="note-snippet"></div>
    <div class="note-meta"></div>
  `;
  li.querySelector(".note-title").textContent = title;
  li.querySelector(".note-snippet").textContent = snippet;
  li.querySelector(".note-meta").textContent = fmtRelative(n.updated_at);

  // For queued notes, show progress instead of (or alongside) the
  // standard "5 min ago" timestamp.
  if (opts.queued && n.queue_status === "processing") {
    const total = n.queue_total_chunks || 0;
    const done = n.queue_completed_chunks || 0;
    const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
    const progressBar = document.createElement("div");
    progressBar.className = "note-progress";
    progressBar.innerHTML = '<div class="note-progress-bar" style="width:0%"></div>';
    progressBar.querySelector(".note-progress-bar").style.width = `${pct}%`;
    li.appendChild(progressBar);
    const progressText = document.createElement("div");
    progressText.className = "note-progress-text";
    progressText.textContent = `${done} / ${total} chunks polished${done === 0 ? " — first chunk in <1 min" : ""}`;
    li.appendChild(progressText);
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
  if (!settings.apiKey) {
    alert("Set API key in Settings first.");
    return;
  }
  try {
    const n = await api("api/v1/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await notesOpen(n.id);
  } catch (e) {
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
  const parts = [];
  parts.push(c === "off" ? "no cleanup" : `cleanup: ${c}`);
  parts.push(p === "off" ? "no polish"  : `polish: ${p}`);
  if (l !== "auto") parts.push(`lang: ${l}`);
  notesElem.pipeline.textContent = `Dictation pipeline → ${parts.join(" · ")}`;
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
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
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
    alert("Dictation failed: " + e.message);
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
