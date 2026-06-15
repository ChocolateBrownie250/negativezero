// ============================================================================
// Amethyst Live — rolling chunks of audio sent to /api/v1/transcribe.
//
// Tradeoffs:
// • Stop+restart MediaRecorder every N seconds. There's a small (~50ms) gap
//   between chunks; in exchange every chunk is a self-contained WebM file
//   that the backend can decode without us muxing headers.
// • Uploads run in parallel with the next recording. The recording loop
//   never blocks on network.
// • keep_audio=false on the API — we don't want to litter the server's DB
//   with throwaway live snippets. Cleanup defaults to off for minimum latency
//   (raw Whisper output is usually plenty for live reading).
// • Reuses the API key/base from the main app (localStorage key amethyst.settings.v1).
// ============================================================================

const LS_KEY    = "amethyst.settings.v1";
const LS_DEVICE = "amethyst.live.device";

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
const settings = loadSettings();

function apiUrl(path) {
  const cleanPath = path.replace(/^\/+/, "");
  if (settings.apiBase) return settings.apiBase.replace(/\/+$/, "") + "/" + cleanPath;
  return new URL(cleanPath, new URL("./", window.location.href)).href;
}
function authHeaders() {
  // With a pasted key (Shortcut / manual), send Bearer. Otherwise rely on the
  // apex SSO cookie (nz_session) sent automatically via credentials: "include".
  return settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {};
}

// ---------- DOM refs ----------
const $ = (id) => document.getElementById(id);
const liveBtn   = $("liveBtn");
const clearBtn  = $("clearBtn");
const copyAll   = $("copyAllBtn");
const deviceSel = $("liveDevice");
const chunkSel  = $("liveChunk");
const cleanupSel= $("liveCleanup");
const langSel   = $("liveLang");
const statusEl  = $("liveStatus");
const barEl     = $("liveBar");
const listEl    = $("liveList");

// ---------- Devices ----------
async function loadDevices(preferGranted = false) {
  let devices = [];
  try { devices = await navigator.mediaDevices.enumerateDevices(); }
  catch { devices = []; }
  const inputs = devices.filter(d => d.kind === "audioinput");
  deviceSel.innerHTML = "";
  const def = document.createElement("option");
  def.value = ""; def.textContent = "Default audio input";
  deviceSel.appendChild(def);
  for (const d of inputs) {
    const o = document.createElement("option");
    o.value = d.deviceId;
    o.textContent = d.label || `Input ${d.deviceId.slice(0, 8)}…`;
    deviceSel.appendChild(o);
  }
  const saved = localStorage.getItem(LS_DEVICE);
  if (saved && inputs.some(d => d.deviceId === saved)) deviceSel.value = saved;
}
deviceSel.addEventListener("change", () => localStorage.setItem(LS_DEVICE, deviceSel.value));
navigator.mediaDevices?.addEventListener?.("devicechange", () => loadDevices());
loadDevices();

// ---------- MediaRecorder helpers ----------
function pickMime() {
  const candidates = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/aac"];
  for (const m of candidates) if (window.MediaRecorder?.isTypeSupported?.(m)) return m;
  return "";
}
function extFromMime(m) {
  if (!m) return "webm";
  if (m.includes("mp4") || m.includes("aac")) return "m4a";
  if (m.includes("ogg")) return "ogg";
  return "webm";
}
function fmtTime(d) {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- State ----------
const state = {
  running: false,
  stream: null,
  current: null,        // current MediaRecorder
  chunkLength: 20000,
  bitrate: 32000,       // 32 kbps speech-grade
  startedAt: 0,         // wall-clock of current chunk
};
const transcripts = []; // [{id, startedAt, status, text, durationS, lang, error}]

// ---------- UI rendering ----------
function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.classList.toggle("recording", kind === "recording");
  statusEl.classList.toggle("error", kind === "error");
}
function setBar(pct) { barEl.style.width = `${Math.max(0, Math.min(100, pct))}%`; }

function render() {
  if (transcripts.length === 0) {
    listEl.innerHTML = `<div class="live-empty">No chunks yet. Press Start.</div>`;
    return;
  }
  listEl.innerHTML = "";
  for (const t of transcripts) {
    const el = document.createElement("article");
    el.className = "live-chunk" + (t.status === "pending" ? " pending" : "") + (t.status === "error" ? " error" : "");

    const meta = document.createElement("div");
    meta.className = "chunk-meta";
    const time = document.createElement("span");
    time.textContent = fmtTime(new Date(t.startedAt));
    meta.appendChild(time);
    if (t.durationS) {
      const d = document.createElement("span");
      d.textContent = `${t.durationS.toFixed(1)}s`;
      meta.appendChild(d);
    }
    if (t.lang) {
      const l = document.createElement("span");
      l.className = "badge"; l.textContent = t.lang;
      meta.appendChild(l);
    }
    if (t.status === "pending") {
      const p = document.createElement("span");
      p.className = "badge"; p.textContent = "transcribing…";
      meta.appendChild(p);
    }
    if (t.latencyMs != null) {
      const lat = document.createElement("span");
      lat.textContent = `${t.latencyMs} ms`;
      meta.appendChild(lat);
    }
    el.appendChild(meta);

    const body = document.createElement("div");
    body.className = "chunk-text";
    body.textContent = t.error ? `⚠ ${t.error}` : (t.text || "…");
    el.appendChild(body);

    const actions = document.createElement("div");
    actions.className = "chunk-actions";
    if (t.text) {
      const copy = document.createElement("button");
      copy.className = "chunk-btn copy";
      copy.textContent = "Copy";
      copy.addEventListener("click", async () => {
        await navigator.clipboard.writeText(t.text);
        copy.textContent = "Copied"; copy.classList.add("copied");
        setTimeout(() => { copy.textContent = "Copy"; copy.classList.remove("copied"); }, 1200);
      });
      actions.appendChild(copy);
    }
    const del = document.createElement("button");
    del.className = "chunk-btn";
    del.textContent = "Remove";
    del.addEventListener("click", () => {
      const i = transcripts.findIndex(x => x.id === t.id);
      if (i >= 0) { transcripts.splice(i, 1); render(); }
    });
    actions.appendChild(del);
    el.appendChild(actions);

    listEl.appendChild(el);
  }
}
render();

// ---------- Recording loop ----------
async function startLive() {
  if (state.running) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("This browser doesn't support audio recording.", "error");
    return;
  }
  try {
    // No upfront key gate: the browser authenticates via the apex SSO cookie,
    // machine clients via Bearer. The transcribe POST 401s if neither is valid.
    const deviceId = deviceSel.value || undefined;
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      },
    });
    // Now that we have permission, device labels are populated. Refresh.
    loadDevices(true);
  } catch (err) {
    setStatus(`Microphone error: ${err.name || err.message || "unknown"}`, "error");
    return;
  }

  state.chunkLength = parseInt(chunkSel.value, 10) || 20000;
  state.running = true;
  liveBtn.querySelector("span").textContent = "Stop";
  liveBtn.querySelector("svg use").setAttribute("href", "#i-stop");
  liveBtn.classList.remove("btn-primary"); liveBtn.classList.add("btn-ghost");
  setStatus(`Recording… (${state.chunkLength / 1000}s chunks)`, "recording");
  loop().catch(err => {
    console.error("Loop crashed:", err);
    setStatus(`Error: ${err.message}`, "error");
    stopLive();
  });
}

function stopLive() {
  state.running = false;
  if (state.current && state.current.state !== "inactive") {
    try { state.current.stop(); } catch {}
  }
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  liveBtn.querySelector("span").textContent = "Start";
  liveBtn.querySelector("svg use").setAttribute("href", "#i-mic");
  liveBtn.classList.add("btn-primary"); liveBtn.classList.remove("btn-ghost");
  setBar(0);
  if (statusEl.classList.contains("recording")) setStatus("Stopped.", null);
}

async function loop() {
  while (state.running) {
    const mime = pickMime();
    const opts = { audioBitsPerSecond: state.bitrate };
    if (mime) opts.mimeType = mime;

    let rec;
    try { rec = new MediaRecorder(state.stream, opts); }
    catch (err) {
      setStatus(`Recorder failed: ${err.message}`, "error");
      stopLive();
      return;
    }
    state.current = rec;

    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise(r => rec.addEventListener("stop", r, { once: true }));

    const startedAt = Date.now();
    state.startedAt = startedAt;
    rec.start();

    // Progress bar update
    const tickStart = performance.now();
    const tickInt = setInterval(() => {
      const elapsed = performance.now() - tickStart;
      setBar((elapsed / state.chunkLength) * 100);
    }, 100);

    await sleep(state.chunkLength);
    clearInterval(tickInt);
    setBar(100);

    if (rec.state !== "inactive") rec.stop();
    await stopped;

    if (chunks.length) {
      const blob = new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" });
      // Fire and forget — uploads run in parallel.
      uploadChunk(blob, rec.mimeType || mime || "audio/webm", startedAt);
    }

    setBar(0);
    if (!state.running) break;
  }
}

async function uploadChunk(blob, mime, startedAt) {
  const id = (crypto.randomUUID && crypto.randomUUID()) || `${startedAt}-${Math.random().toString(36).slice(2, 8)}`;
  const item = { id, startedAt, status: "pending" };
  transcripts.unshift(item);
  // Keep list bounded — old items disappear after 50.
  if (transcripts.length > 50) transcripts.length = 50;
  render();

  const fd = new FormData();
  fd.append("file", blob, `live-${id}.${extFromMime(mime)}`);
  fd.append("source", "live");
  fd.append("keep_audio", "false");
  if (langSel.value !== "auto") fd.append("language", langSel.value);
  const cleanup = cleanupSel.value;
  if (cleanup === "off") {
    fd.append("cleanup", "false");
  } else {
    fd.append("cleanup", "true");
    fd.append("cleanup_mode", cleanup.split(":")[1] || "standard");
  }

  const t0 = performance.now();
  try {
    const resp = await fetch(apiUrl("api/v1/transcribe"), {
      method: "POST", body: fd, headers: authHeaders(), credentials: "include",
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`${resp.status} ${resp.statusText}: ${text.slice(0, 200)}`);
    }
    const r = await resp.json();
    item.status = "done";
    item.text = r.text;
    item.lang = r.language;
    item.durationS = r.duration_s;
    item.latencyMs = Math.round(performance.now() - t0);
    render();
  } catch (err) {
    item.status = "error";
    item.error = err.message;
    render();
  }
}

// ---------- Buttons ----------
liveBtn.addEventListener("click", () => state.running ? stopLive() : startLive());
clearBtn.addEventListener("click", () => { transcripts.length = 0; render(); });
copyAll.addEventListener("click", async () => {
  const all = transcripts
    .filter(t => t.text)
    .slice()
    .reverse()
    .map(t => `[${fmtTime(new Date(t.startedAt))}] ${t.text}`)
    .join("\n\n");
  if (!all) return;
  await navigator.clipboard.writeText(all);
  const orig = copyAll.textContent;
  copyAll.textContent = "Copied"; copyAll.classList.add("copied");
  setTimeout(() => { copyAll.textContent = orig; copyAll.classList.remove("copied"); }, 1200);
});

// Stop cleanly when the user closes the tab.
window.addEventListener("beforeunload", stopLive);
