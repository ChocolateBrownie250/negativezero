(function () {
  'use strict';

  const HOURS = 24;
  const STORE_KEY = 'nz.timezones.v1';

  // ── timezone catalogue ────────────────────────────────────────
  // Prefer the runtime list (every IANA zone the browser knows); fall
  // back to a small curated set on older engines without the API.
  const FALLBACK = [
    'UTC', 'America/Los_Angeles', 'America/Denver', 'America/Chicago',
    'America/New_York', 'America/Sao_Paulo', 'Europe/London', 'Europe/Paris',
    'Europe/Berlin', 'Europe/Moscow', 'Africa/Cairo', 'Asia/Dubai',
    'Asia/Karachi', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Shanghai',
    'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
  ];
  const ALL_ZONES = (typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : FALLBACK).slice();

  // Human label from an IANA id: "Asia/Kolkata" → "Kolkata", keep region hint.
  function labelFor(zone) {
    const parts = zone.split('/');
    const city = parts[parts.length - 1].replace(/_/g, ' ');
    const region = parts.length > 1 ? parts[0].replace(/_/g, ' ') : '';
    return { city, region };
  }

  // ── offset / conversion helpers ───────────────────────────────
  const partsCache = new Map();
  function zoneParts(zone, date) {
    let dtf = partsCache.get(zone);
    if (!dtf) {
      dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        weekday: 'short',
      });
      partsCache.set(zone, dtf);
    }
    const out = {};
    for (const p of dtf.formatToParts(date)) out[p.type] = p.value;
    if (out.hour === '24') out.hour = '00';
    return out;
  }

  // Offset (minutes) of `zone` from UTC at the instant `date`.
  function offsetMinutes(zone, date) {
    const p = zoneParts(zone, date);
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUTC - date.getTime()) / 60000);
  }

  // UTC instant for a wall-clock time in `zone`. Two-pass to settle DST.
  function zonedToUtc(zone, y, mo, d, h, mi) {
    const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
    let off = offsetMinutes(zone, new Date(guess));
    let utc = guess - off * 60000;
    off = offsetMinutes(zone, new Date(utc));
    utc = guess - off * 60000;
    return new Date(utc);
  }

  function fmtOffset(min) {
    const sign = min >= 0 ? '+' : '−';
    const a = Math.abs(min);
    const h = Math.floor(a / 60);
    const m = a % 60;
    return 'UTC' + sign + h + (m ? ':' + String(m).padStart(2, '0') : '');
  }

  // ── state ─────────────────────────────────────────────────────
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const defaults = {
    zones: [browserZone],
    home: browserZone,
    work: [9, 18],
    fmt24: true,
    date: null, // YYYY-MM-DD, null = today
  };

  let state = load();

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY));
      if (!raw || !Array.isArray(raw.zones)) return structuredClone(defaults);
      raw.zones = raw.zones.filter((z) => ALL_ZONES.includes(z));
      if (!raw.zones.length) raw.zones = [browserZone];
      if (!raw.zones.includes(raw.home)) raw.home = raw.zones[0];
      raw.work = Array.isArray(raw.work) ? raw.work : defaults.work;
      raw.fmt24 = raw.fmt24 !== false;
      raw.date = raw.date || null;
      return raw;
    } catch (_) {
      return structuredClone(defaults);
    }
  }
  function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

  // ── DOM refs ──────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const board = $('board');
  const emptyMsg = $('empty');
  const search = $('search');
  const results = $('results');
  const dateInput = $('date');
  const workStart = $('workStart');
  const workEnd = $('workEnd');
  const fmtBtn = $('fmt');
  const nowBtn = $('now');
  const presetSel = $('presetSel');
  const presetSave = $('presetSave');
  const presetDel = $('presetDel');

  // ── search / add ──────────────────────────────────────────────
  let activeResult = -1;
  function runSearch() {
    const q = search.value.trim().toLowerCase();
    if (!q) { results.hidden = true; results.innerHTML = ''; return; }
    const matches = ALL_ZONES
      .filter((z) => !state.zones.includes(z))
      .filter((z) => z.toLowerCase().replace(/_/g, ' ').includes(q))
      .slice(0, 40);
    if (!matches.length) {
      results.innerHTML = '<div class="none">no matching zone</div>';
      results.hidden = false; return;
    }
    results.innerHTML = matches.map((z, i) => {
      const { city, region } = labelFor(z);
      return '<div class="row" data-zone="' + z + '" data-i="' + i + '">' +
        '<span class="name">' + city + '</span>' +
        '<span class="zone">' + region + '</span></div>';
    }).join('');
    activeResult = -1;
    results.hidden = false;
  }

  function addZone(zone) {
    if (!zone || state.zones.includes(zone)) return;
    state.zones.push(zone);
    save();
    search.value = '';
    results.hidden = true;
    render();
  }

  search.addEventListener('input', runSearch);
  search.addEventListener('focus', runSearch);
  search.addEventListener('keydown', (e) => {
    const rows = Array.from(results.querySelectorAll('.row'));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeResult = Math.min(rows.length - 1, activeResult + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeResult = Math.max(0, activeResult - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = rows[activeResult] || rows[0];
      if (pick) addZone(pick.dataset.zone);
      return;
    } else if (e.key === 'Escape') {
      results.hidden = true; return;
    } else { return; }
    rows.forEach((r, i) => r.classList.toggle('active', i === activeResult));
    if (rows[activeResult]) rows[activeResult].scrollIntoView({ block: 'nearest' });
  });
  results.addEventListener('mousedown', (e) => {
    const row = e.target.closest('.row');
    if (row) { e.preventDefault(); addZone(row.dataset.zone); }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.add')) results.hidden = true;
  });

  // ── board rendering ───────────────────────────────────────────
  function refDayStart() {
    // Start of the selected calendar day, as read in the home zone,
    // returned as a UTC instant.
    let y, mo, d;
    if (state.date) {
      [y, mo, d] = state.date.split('-').map(Number);
    } else {
      const p = zoneParts(state.home, new Date());
      y = +p.year; mo = +p.month; d = +p.day;
    }
    return zonedToUtc(state.home, y, mo, d, 0, 0);
  }

  function render() {
    syncControls();
    board.innerHTML = '';
    emptyMsg.hidden = state.zones.length > 0;
    if (!state.zones.length) return;

    const [ws, we] = state.work;
    const dayStart = refDayStart();
    const now = Date.now();

    // Per-hour instants across the home day (24 columns).
    const instants = [];
    for (let h = 0; h < HOURS; h++) instants.push(dayStart.getTime() + h * 3600000);

    // Local hour of each zone at each column, plus working-hours mask.
    const localHour = {};
    const working = {};
    for (const z of state.zones) {
      localHour[z] = [];
      working[z] = [];
      for (let h = 0; h < HOURS; h++) {
        const p = zoneParts(z, new Date(instants[h]));
        const lh = +p.hour;
        localHour[z].push(lh);
        working[z].push(inWork(lh, ws, we));
      }
    }
    // A column is an overlap when every zone is within working hours.
    const overlap = [];
    for (let h = 0; h < HOURS; h++) {
      overlap.push(state.zones.every((z) => working[z][h]));
    }

    board.appendChild(buildRuler(dayStart, overlap));

    // Order: home first, then the rest in insertion order.
    const ordered = [state.home].concat(state.zones.filter((z) => z !== state.home));
    for (const z of ordered) {
      board.appendChild(buildCard(z, localHour[z], working[z], overlap, dayStart, now));
    }

    positionNow(now, dayStart);
  }

  function inWork(h, ws, we) {
    return we > ws ? (h >= ws && h < we) : (h >= ws || h < we);
  }

  function buildRuler(dayStart, overlap) {
    const wrap = document.createElement('div');
    wrap.className = 'ruler';
    const spacer = document.createElement('div');
    spacer.className = 'spacer';
    const { city } = labelFor(state.home);
    spacer.textContent = city + ' — day';
    wrap.appendChild(spacer);
    const track = document.createElement('div');
    track.className = 'rtrack';
    for (let h = 0; h < HOURS; h++) {
      const c = document.createElement('div');
      c.className = 'rcell' + (overlap[h] ? ' overlap' : '');
      c.textContent = String(h).padStart(2, '0');
      track.appendChild(c);
    }
    wrap.appendChild(track);
    return wrap;
  }

  function buildCard(zone, hours, work, overlap, dayStart, now) {
    const isHome = zone === state.home;
    const card = document.createElement('div');
    card.className = 'zonecard' + (isHome ? ' home' : '');

    const meta = document.createElement('div');
    meta.className = 'zonemeta';
    const { city } = labelFor(zone);

    const nowParts = zoneParts(zone, new Date(now));
    const off = offsetMinutes(zone, new Date(now));
    const homeOff = offsetMinutes(state.home, new Date(now));
    const rel = (off - homeOff) / 60;

    const title = document.createElement('div');
    title.className = 'city';
    title.appendChild(document.createTextNode(city));
    if (isHome) {
      const tag = document.createElement('span');
      tag.className = 'tag'; tag.textContent = 'home';
      title.appendChild(tag);
    }
    const rm = document.createElement('button');
    rm.className = 'rm'; rm.type = 'button';
    rm.setAttribute('aria-label', 'remove ' + city); rm.textContent = '×';
    rm.addEventListener('click', () => removeZone(zone));
    title.appendChild(rm);

    const big = document.createElement('div');
    big.className = 'bigtime';
    big.textContent = clock(+nowParts.hour, +nowParts.minute) +
      '  ' + nowParts.weekday;

    const sub = document.createElement('div');
    sub.className = 'sub';
    const offEl = document.createElement('span');
    offEl.className = 'off'; offEl.textContent = fmtOffset(off);
    sub.appendChild(offEl);
    if (!isHome) {
      const relEl = document.createElement('span');
      relEl.className = 'home-relative';
      const sign = rel >= 0 ? '+' : '−';
      relEl.textContent = sign + fmtHours(Math.abs(rel)) + ' vs home';
      sub.appendChild(relEl);
    }
    if (!isHome) {
      const make = document.createElement('span');
      make.className = 'off'; make.style.cursor = 'pointer';
      make.textContent = 'set home';
      make.addEventListener('click', () => { state.home = zone; save(); render(); });
      sub.appendChild(make);
    }

    meta.appendChild(title);
    meta.appendChild(big);
    meta.appendChild(sub);

    const track = document.createElement('div');
    track.className = 'track';
    for (let h = 0; h < HOURS; h++) {
      const lh = hours[h];
      const cell = document.createElement('div');
      let cls = 'cell';
      if (work[h]) cls += ' work';
      else if (lh >= 7 && lh < 19) cls += ' day';
      if (lh === 0) cls += ' daystart';
      if (overlap[h]) cls += ' overlap';
      cell.className = cls;
      cell.textContent = lh === 0 ? 'day' : String(lh).padStart(2, '0');
      cell.title = city + ' ' + clock(lh, 0);
      track.appendChild(cell);
    }
    card.appendChild(meta);
    card.appendChild(track);
    card._track = track;
    return card;
  }

  function clock(h, m) {
    if (state.fmt24) return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    const ap = h < 12 ? 'am' : 'pm';
    let hh = h % 12; if (hh === 0) hh = 12;
    return hh + ':' + String(m).padStart(2, '0') + ap;
  }
  function fmtHours(h) {
    return Number.isInteger(h) ? String(h) + 'h' : h.toFixed(1) + 'h';
  }

  function positionNow(now, dayStart) {
    const frac = (now - dayStart.getTime()) / (HOURS * 3600000);
    if (frac < 0 || frac > 1) return; // now is outside the shown day
    document.querySelectorAll('.track').forEach((track) => {
      const line = document.createElement('div');
      line.className = 'nowline';
      line.style.left = (frac * track.scrollWidth) + 'px';
      track.appendChild(line);
    });
  }

  function removeZone(zone) {
    state.zones = state.zones.filter((z) => z !== zone);
    if (!state.zones.length) state.zones = [browserZone];
    if (zone === state.home) state.home = state.zones[0];
    save();
    render();
  }

  // ── controls ──────────────────────────────────────────────────
  function syncControls() {
    workStart.value = state.work[0];
    workEnd.value = state.work[1];
    fmtBtn.textContent = state.fmt24 ? '24h' : '12h';
    fmtBtn.setAttribute('aria-pressed', String(!state.fmt24));
    if (!dateInput.value) {
      const p = zoneParts(state.home, new Date());
      dateInput.value = state.date || (p.year + '-' + p.month + '-' + p.day);
    }
  }

  dateInput.addEventListener('change', () => {
    state.date = dateInput.value || null;
    save(); render();
  });
  function clampWork() {
    let s = parseInt(workStart.value, 10);
    let e = parseInt(workEnd.value, 10);
    if (Number.isNaN(s)) s = 9;
    if (Number.isNaN(e)) e = 18;
    s = Math.max(0, Math.min(23, s));
    e = Math.max(1, Math.min(24, e));
    state.work = [s, e];
    save(); render();
  }
  workStart.addEventListener('change', clampWork);
  workEnd.addEventListener('change', clampWork);
  fmtBtn.addEventListener('click', () => { state.fmt24 = !state.fmt24; save(); render(); });
  nowBtn.addEventListener('click', () => {
    state.date = null; dateInput.value = '';
    save(); render();
  });

  // ── presets (server-side, scoped to the signed-in account) ────
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Resolve API paths against the current page's directory so the same code
  // works whether served at /services/timezones/ (prod) or / (dev). A
  // leading-slash absolute path would hit the apex root, not this service mount.
  function apiUrl(path) {
    return new URL(String(path).replace(/^\/+/, ''), new URL('./', window.location.href)).href;
  }

  const api = {
    async list() {
      const r = await fetch(apiUrl('api/presets'), { credentials: 'same-origin' });
      if (!r.ok) throw new Error('list ' + r.status);
      return (await r.json()).presets;
    },
    async create(name, selection) {
      const r = await fetch(apiUrl('api/presets'), {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, selection }),
      });
      if (!r.ok) throw new Error('create ' + r.status);
      return (await r.json()).preset;
    },
    async remove(id) {
      const r = await fetch(apiUrl('api/presets/' + encodeURIComponent(id)), {
        method: 'DELETE', credentials: 'same-origin',
      });
      if (!r.ok) throw new Error('delete ' + r.status);
    },
  };

  let presets = [];

  // The savable snapshot of the planner — everything except the ephemeral `date`.
  function currentSelection() {
    return {
      zones: state.zones.slice(),
      home: state.home,
      work: state.work.slice(),
      fmt24: state.fmt24,
    };
  }

  function renderPresetOptions() {
    presetSel.innerHTML = '<option value="">— none —</option>' +
      presets.map((p) => '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>').join('');
    presetDel.disabled = !presetSel.value;
  }

  async function initPresets() {
    try {
      presets = await api.list();
    } catch (_) {
      presets = []; // offline / API error → the planner still works on localStorage
    }
    renderPresetOptions();
  }

  // Load a saved selection into the live state (validated against known zones).
  function applySelection(s) {
    if (!s || !Array.isArray(s.zones)) return;
    const zones = s.zones.filter((z) => ALL_ZONES.includes(z));
    state.zones = zones.length ? zones : [browserZone];
    state.home = state.zones.includes(s.home) ? s.home : state.zones[0];
    state.work = Array.isArray(s.work) && s.work.length === 2 ? [s.work[0], s.work[1]] : state.work;
    state.fmt24 = s.fmt24 !== false;
    save();
    render();
  }

  presetSel.addEventListener('change', () => {
    presetDel.disabled = !presetSel.value;
    const p = presets.find((x) => x.id === presetSel.value);
    if (p) applySelection(p.selection);
  });

  presetSave.addEventListener('click', async () => {
    const name = (window.prompt('Name this preset') || '').trim();
    if (!name) return;
    try {
      const p = await api.create(name, currentSelection());
      presets.unshift(p);
      renderPresetOptions();
      presetSel.value = p.id;
      presetDel.disabled = false;
    } catch (_) {
      window.alert('Could not save preset.');
    }
  });

  presetDel.addEventListener('click', async () => {
    const id = presetSel.value;
    if (!id) return;
    try {
      await api.remove(id);
      presets = presets.filter((p) => p.id !== id);
      renderPresetOptions();
      presetSel.value = '';
      presetDel.disabled = true;
    } catch (_) {
      window.alert('Could not delete preset.');
    }
  });

  // ── boot: gate on auth (like the other services), then start ──
  let clockTimer = null;
  function startClock() {
    if (!clockTimer) clockTimer = setInterval(render, 60000); // keep "now" honest
  }
  function showGate(msg) {
    const gate = document.getElementById('authGate');
    if (gate) gate.textContent = msg;
  }

  window.addEventListener('resize', () => {
    // Reposition the now-marker on layout change (only once the board is shown).
    document.querySelectorAll('.nowline').forEach((n) => n.remove());
    if (document.body.classList.contains('authed')) positionNow(Date.now(), refDayStart());
  });

  async function boot() {
    try {
      const r = await fetch(apiUrl('api/v1/me'), { credentials: 'same-origin' });
      if (r.ok) {
        document.body.classList.add('authed');
        await initPresets();
        render();
        startClock();
      } else if (r.status === 401) {
        // No / invalid session → the apex SSO hub, which returns here after login.
        location.replace('/services/admin/?return=/services/timezones/');
      } else if (r.status === 403) {
        showGate("Your account doesn't have access to timezones. Ask the owner to enable it, then reload.");
      } else {
        showGate('Could not check access (error ' + r.status + '). Reload to try again.');
      }
    } catch (_) {
      showGate('Could not reach the server. Reload to try again.');
    }
  }

  boot();
})();
