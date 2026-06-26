(function () {
  'use strict';

  const HOURS = 24;
  const DAY = HOURS * 3600000;
  const STORE_KEY = 'nz.timezones.v1';

  // ── timezone catalogue ────────────────────────────────────────
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
  if (!ALL_ZONES.includes('UTC')) ALL_ZONES.unshift('UTC');
  const ZONE_SET = new Set(ALL_ZONES);

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

  function offsetMinutes(zone, date) {
    const p = zoneParts(zone, date);
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUTC - date.getTime()) / 60000);
  }

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
    return 'GMT' + sign + h + (m ? ':' + String(m).padStart(2, '0') : '');
  }

  // ── state ─────────────────────────────────────────────────────
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const defaults = {
    zones: [browserZone],
    home: browserZone,
    work: [9, 18],
    fmt24: true,
    date: null,          // YYYY-MM-DD, null = today
    theme: 'dark',       // 'dark' | 'light'
  };

  let state = load();

  // Ephemeral (not persisted): scrub marker position + the live "now" instant.
  let markerFrac = null;       // null → the marker tracks the current moment
  let nowTs = Date.now();

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
      raw.theme = raw.theme === 'light' ? 'light' : 'dark';
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
  const seg24 = $('seg24');
  const seg12 = $('seg12');
  const nowBtn = $('nowBtn');
  const themeLight = $('themeLight');
  const themeDark = $('themeDark');
  const statusReadout = $('statusReadout');
  const statusDot = $('statusDot');
  const overlapBadge = $('overlapBadge');
  const resetBtn = $('resetBtn');
  const themeColorMeta = $('themeColor');
  const presetSel = $('presetSel');
  const presetSave = $('presetSave');
  const presetDel = $('presetDel');

  // ── search / add ──────────────────────────────────────────────
  const ALIASES = {
    pt: ['America/Los_Angeles'], pst: ['America/Los_Angeles'], pdt: ['America/Los_Angeles'],
    pacific: ['America/Los_Angeles'],
    mt: ['America/Denver'], mst: ['America/Denver'], mdt: ['America/Denver'], mountain: ['America/Denver'],
    ct: ['America/Chicago'], cst: ['America/Chicago', 'Asia/Shanghai'], cdt: ['America/Chicago'],
    central: ['America/Chicago'],
    et: ['America/New_York'], est: ['America/New_York'], edt: ['America/New_York'],
    eastern: ['America/New_York'],
    akst: ['America/Anchorage'], akdt: ['America/Anchorage'], alaska: ['America/Anchorage'],
    hst: ['Pacific/Honolulu'], hawaii: ['Pacific/Honolulu'],
    ast: ['America/Halifax', 'Asia/Riyadh'], adt: ['America/Halifax'], atlantic: ['America/Halifax'],
    nst: ['America/St_Johns'], ndt: ['America/St_Johns'], newfoundland: ['America/St_Johns'],
    gmt: ['UTC'], utc: ['UTC'], zulu: ['UTC'],
    bst: ['Europe/London'], wet: ['Europe/Lisbon'], west: ['Europe/Lisbon'],
    cet: ['Europe/Paris'], cest: ['Europe/Paris'],
    eet: ['Europe/Bucharest'], eest: ['Europe/Bucharest'],
    msk: ['Europe/Moscow'], moscow: ['Europe/Moscow'],
    trt: ['Europe/Istanbul'], istanbul: ['Europe/Istanbul'],
    sast: ['Africa/Johannesburg'], wat: ['Africa/Lagos'], cat: ['Africa/Maputo'], eat: ['Africa/Nairobi'],
    gst: ['Asia/Dubai'], gulf: ['Asia/Dubai'],
    ist: ['Asia/Kolkata', 'Europe/Dublin', 'Asia/Jerusalem'], india: ['Asia/Kolkata'],
    pkt: ['Asia/Karachi'], npt: ['Asia/Kathmandu'],
    ict: ['Asia/Bangkok'], wib: ['Asia/Jakarta'],
    hkt: ['Asia/Hong_Kong'], sgt: ['Asia/Singapore'],
    china: ['Asia/Shanghai'], beijing: ['Asia/Shanghai'],
    jst: ['Asia/Tokyo'], japan: ['Asia/Tokyo'],
    kst: ['Asia/Seoul'], korea: ['Asia/Seoul'], seoul: ['Asia/Seoul'],
    awst: ['Australia/Perth'], perth: ['Australia/Perth'],
    acst: ['Australia/Adelaide'], acdt: ['Australia/Adelaide'], adelaide: ['Australia/Adelaide'],
    aest: ['Australia/Sydney'], aedt: ['Australia/Sydney'], sydney: ['Australia/Sydney'],
    nzst: ['Pacific/Auckland'], nzdt: ['Pacific/Auckland'], auckland: ['Pacific/Auckland'],
  };

  function parseOffset(q) {
    const m = q.replace(/\s+/g, '').match(/^(?:gmt|utc)?([+-])(\d{1,2})(?::?(\d{2}))?$/);
    if (!m) return null;
    const h = parseInt(m[2], 10);
    const mm = m[3] ? parseInt(m[3], 10) : 0;
    if (mm > 59 || h > 14 || (h === 14 && mm > 0)) return null;
    return (m[1] === '-' ? -1 : 1) * (h * 60 + mm);
  }

  function zonesAtOffset(mins) {
    const now = new Date();
    return ALL_ZONES.filter((z) => offsetMinutes(z, now) === mins);
  }

  const EQUIV = {
    'UTC': ['Etc/UTC'],
    'Asia/Kolkata': ['Asia/Calcutta'],
    'Asia/Kathmandu': ['Asia/Katmandu'],
  };
  function resolve(zone) {
    if (ZONE_SET.has(zone)) return zone;
    const alts = EQUIV[zone] || [];
    for (let i = 0; i < alts.length; i++) if (ZONE_SET.has(alts[i])) return alts[i];
    return null;
  }

  function aliasZones(q) {
    const out = [];
    if (ALIASES[q]) out.push.apply(out, ALIASES[q]);
    const off = parseOffset(q);
    if (off !== null) out.push.apply(out, zonesAtOffset(off));
    return out;
  }

  let activeResult = -1;
  function runSearch() {
    const q = search.value.trim().toLowerCase();
    if (!q) { results.hidden = true; results.innerHTML = ''; return; }
    const taken = new Set(state.zones);
    const seen = new Set();
    const ordered = [];
    const add = (raw) => {
      const z = resolve(raw);
      if (z && !taken.has(z) && !seen.has(z)) { seen.add(z); ordered.push(z); }
    };
    aliasZones(q).forEach(add);
    ALL_ZONES
      .filter((z) => z.toLowerCase().replace(/_/g, ' ').includes(q))
      .forEach(add);
    const matches = ordered.slice(0, 40);
    if (!matches.length) {
      results.innerHTML = '<div class="none">No matching time zone</div>';
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

  // ── clock / work helpers ──────────────────────────────────────
  function clock(h, m) {
    if (state.fmt24) return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    const ap = h < 12 ? 'AM' : 'PM';
    let hh = h % 12; if (hh === 0) hh = 12;
    return hh + ':' + String(m).padStart(2, '0') + ' ' + ap;
  }
  function fmtHours(h) {
    return Number.isInteger(h) ? String(h) + 'h' : h.toFixed(1) + 'h';
  }
  function inWork(h, ws, we) {
    return we > ws ? (h >= ws && h < we) : (h >= ws || h < we);
  }

  // ── ambient day/night gradient (per zone, across the home day) ─
  // A soft cosine "sun curve" lights each zone's strip, so each city's local
  // daytime glows and its night dims — independent of the others. Work / overlap
  // bands are translucent colour that rides on top of this ambient light.
  function cellColor(isWork, isOverlap, dark) {
    if (isOverlap) return dark ? 'rgba(48,209,88,.50)' : 'rgba(52,199,89,.52)';
    if (isWork) return dark ? 'rgba(96,150,235,.42)' : 'rgba(120,170,250,.52)';
    return 'transparent';
  }
  function lightAt(h) { return (Math.cos((h - 13) / 24 * 2 * Math.PI) + 1) / 2; }
  function mix(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];
  }
  function ambientColor(L, dark) {
    const A = dark
      ? [[19, 22, 32], [29, 35, 49], [42, 50, 67]]
      : [[197, 205, 223], [216, 222, 235], [239, 242, 248]];
    return L <= 0.5 ? mix(A[0], A[1], L / 0.5) : mix(A[1], A[2], (L - 0.5) / 0.5);
  }
  function ambientGradient(zone, dayStart, dark) {
    const N = 48, stops = [];
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const p = zoneParts(zone, new Date(dayStart + f * DAY));
      const hf = +p.hour + (+p.minute) / 60;
      const c = ambientColor(lightAt(hf), dark);
      stops.push('rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ') ' + (f * 100).toFixed(2) + '%');
    }
    return 'linear-gradient(90deg,' + stops.join(',') + ')';
  }

  // ── board rendering ───────────────────────────────────────────
  function refDayStart() {
    let y, mo, d;
    if (state.date) {
      [y, mo, d] = state.date.split('-').map(Number);
    } else {
      const p = zoneParts(state.home, new Date(nowTs));
      y = +p.year; mo = +p.month; d = +p.day;
    }
    return zonedToUtc(state.home, y, mo, d, 0, 0);
  }

  // Live values shared between a full render() and the lightweight drag update.
  let frame = { dayStart: 0, ordered: [], cards: [] };

  function render() {
    syncControls();
    board.innerHTML = '';
    frame.cards = [];
    emptyMsg.hidden = state.zones.length > 0;
    if (!state.zones.length) { updateStatus(0); return; }

    const dark = state.theme === 'dark';
    const [ws, we] = state.work;
    const dayStart = refDayStart().getTime();
    frame.dayStart = dayStart;

    const instants = [];
    for (let h = 0; h < HOURS; h++) instants.push(dayStart + h * 3600000);

    const localHour = {};
    const working = {};
    for (const z of state.zones) {
      localHour[z] = [];
      working[z] = [];
      for (let h = 0; h < HOURS; h++) {
        const lh = +zoneParts(z, new Date(instants[h])).hour;
        localHour[z].push(lh);
        working[z].push(inWork(lh, ws, we));
      }
    }
    const overlap = [];
    for (let h = 0; h < HOURS; h++) overlap.push(state.zones.every((z) => working[z][h]));
    const overlapCount = overlap.filter(Boolean).length;

    const ordered = [state.home].concat(state.zones.filter((z) => z !== state.home));
    frame.ordered = ordered;
    for (const z of ordered) {
      board.appendChild(buildCard(z, working[z], overlap, dayStart, dark));
    }

    updateStatus(overlapCount);
    updateMarker();
  }

  function buildCard(zone, work, overlap, dayStart, dark) {
    const isHome = zone === state.home;
    const card = document.createElement('div');
    card.className = 'zonecard' + (isHome ? ' home' : '');
    const { city } = labelFor(zone);

    const off = offsetMinutes(zone, new Date(nowTs));
    const homeOff = offsetMinutes(state.home, new Date(nowTs));
    const rel = (off - homeOff) / 60;

    // header: city · home tag · offset · rel · set-home / big clock · remove
    const head = document.createElement('div');
    head.className = 'zone-head';

    const id = document.createElement('div');
    id.className = 'zone-id';
    const titleRow = document.createElement('div');
    titleRow.className = 'zone-title';
    const cityEl = document.createElement('span');
    cityEl.className = 'zone-city';
    cityEl.textContent = city;
    titleRow.appendChild(cityEl);
    if (isHome) {
      const tag = document.createElement('span');
      tag.className = 'home-tag'; tag.textContent = 'Home';
      titleRow.appendChild(tag);
    }
    const sub = document.createElement('div');
    sub.className = 'zone-sub';
    const offEl = document.createElement('span');
    offEl.textContent = fmtOffset(off);
    sub.appendChild(offEl);
    if (!isHome) {
      const sep1 = document.createElement('span');
      sep1.className = 'dotsep'; sep1.textContent = '·';
      const relEl = document.createElement('span');
      const sign = rel >= 0 ? '+' : '−';
      relEl.textContent = sign + fmtHours(Math.abs(rel));
      sub.appendChild(sep1); sub.appendChild(relEl);
      const sep2 = document.createElement('span');
      sep2.className = 'dotsep'; sep2.textContent = '·';
      const setHome = document.createElement('span');
      setHome.className = 'set-home'; setHome.textContent = 'Set home';
      setHome.addEventListener('click', () => { state.home = zone; save(); render(); });
      sub.appendChild(sep2); sub.appendChild(setHome);
    }
    id.appendChild(titleRow); id.appendChild(sub);

    const clockWrap = document.createElement('div');
    clockWrap.className = 'zone-clock';
    const big = document.createElement('span');
    big.className = 'bigtime';
    const rm = document.createElement('button');
    rm.className = 'rm'; rm.type = 'button';
    rm.setAttribute('aria-label', 'remove ' + city); rm.textContent = '×';
    rm.addEventListener('click', () => removeZone(zone));
    clockWrap.appendChild(big); clockWrap.appendChild(rm);

    head.appendChild(id); head.appendChild(clockWrap);
    card.appendChild(head);

    // timeline track: ambient gradient + work/overlap cells + sheen + markers
    const track = document.createElement('div');
    track.className = 'track';
    track.style.background = ambientGradient(zone, dayStart, dark);
    for (let h = 0; h < HOURS; h++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const c = cellColor(work[h], overlap[h], dark);
      if (c !== 'transparent') cell.style.background = c;
      track.appendChild(cell);
    }
    const sheen = document.createElement('div');
    sheen.className = 'sheen';
    track.appendChild(sheen);
    const nowLine = document.createElement('div');
    nowLine.className = 'nowline';
    track.appendChild(nowLine);
    const mLine = document.createElement('div');
    mLine.className = 'marker-line';
    const mKnob = document.createElement('div');
    mKnob.className = 'marker-knob';
    track.appendChild(mLine); track.appendChild(mKnob);
    track.addEventListener('pointerdown', (e) => startDrag(e, track));
    card.appendChild(track);

    // ticks
    const ticks = document.createElement('div');
    ticks.className = 'ticks';
    [0, 6, 12, 18, 24].forEach((h) => {
      const t = document.createElement('span');
      t.textContent = h === 24 ? '24h' : String(h).padStart(2, '0');
      t.style.left = (h / 24 * 100) + '%';
      t.style.transform = h === 0 ? 'none' : h === 24 ? 'translateX(-100%)' : 'translateX(-50%)';
      ticks.appendChild(t);
    });
    card.appendChild(ticks);

    frame.cards.push({ zone, bigEl: big, nowLineEl: nowLine, mLineEl: mLine, mKnobEl: mKnob });
    return card;
  }

  // Lightweight per-frame update used while scrubbing: repositions the marker /
  // now-line and refreshes each zone's big clock + the status readout, without
  // rebuilding gradients or DOM.
  function updateMarker() {
    const dayStart = frame.dayStart;
    const nowFrac = (nowTs - dayStart) / DAY;
    const nowVisible = nowFrac >= 0 && nowFrac <= 1;
    const nowPct = (Math.max(0, Math.min(1, nowFrac)) * 100).toFixed(3) + '%';
    const active = markerFrac != null;
    const mFrac = active ? markerFrac : Math.max(0, Math.min(1, nowFrac));
    const markerInstant = dayStart + mFrac * DAY;
    const markerPct = (mFrac * 100).toFixed(3) + '%';

    for (const c of frame.cards) {
      const p = zoneParts(c.zone, new Date(markerInstant));
      c.bigEl.textContent = clock(+p.hour, +p.minute);
      c.nowLineEl.style.display = nowVisible ? '' : 'none';
      c.nowLineEl.style.left = nowPct;
      c.mLineEl.style.left = markerPct;
      c.mKnobEl.style.left = 'calc(' + markerPct + ' - 7px)';
    }

    if (frame.ordered.length) {
      const hp = zoneParts(state.home, new Date(markerInstant));
      const { city } = labelFor(state.home);
      statusReadout.textContent = city + '  ' + clock(+hp.hour, +hp.minute) + '  ' + hp.weekday;
    }
    resetBtn.hidden = !active;
  }

  function updateStatus(overlapCount) {
    const ok = overlapCount > 0;
    statusDot.classList.toggle('ok', ok);
    overlapBadge.classList.toggle('ok', ok);
    overlapBadge.textContent = ok ? (overlapCount + 'h overlap') : 'No shared window';
    if (!frame.ordered.length) {
      statusReadout.textContent = '—';
      resetBtn.hidden = true;
    }
  }

  // ── drag-to-scrub ─────────────────────────────────────────────
  let drag = { active: false, rect: null };
  function setFracFromX(clientX) {
    if (!drag.rect) return;
    markerFrac = Math.max(0, Math.min(1, (clientX - drag.rect.left) / drag.rect.width));
    updateMarker();
  }
  function startDrag(e, track) {
    drag.active = true;
    drag.rect = track.getBoundingClientRect();
    if (e.preventDefault) e.preventDefault();
    setFracFromX(e.clientX);
  }
  window.addEventListener('pointermove', (e) => { if (drag.active) setFracFromX(e.clientX); });
  window.addEventListener('pointerup', () => { drag.active = false; });

  function removeZone(zone) {
    state.zones = state.zones.filter((z) => z !== zone);
    if (!state.zones.length) state.zones = [browserZone];
    if (zone === state.home) state.home = state.zones[0];
    save();
    render();
  }

  // ── controls ──────────────────────────────────────────────────
  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    if (themeColorMeta) themeColorMeta.setAttribute('content', state.theme === 'dark' ? '#08090F' : '#EEF0FA');
  }
  function syncControls() {
    workStart.value = state.work[0];
    workEnd.value = state.work[1];
    seg24.classList.toggle('active', state.fmt24);
    seg12.classList.toggle('active', !state.fmt24);
    if (!dateInput.value || state.date) {
      const p = zoneParts(state.home, new Date(nowTs));
      dateInput.value = state.date || (p.year + '-' + p.month + '-' + p.day);
    }
  }

  dateInput.addEventListener('change', () => {
    state.date = dateInput.value || null;
    markerFrac = null;
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
  seg24.addEventListener('click', () => { if (!state.fmt24) { state.fmt24 = true; save(); render(); } });
  seg12.addEventListener('click', () => { if (state.fmt24) { state.fmt24 = false; save(); render(); } });
  nowBtn.addEventListener('click', () => {
    state.date = null; dateInput.value = ''; markerFrac = null;
    save(); render();
  });
  resetBtn.addEventListener('click', () => { markerFrac = null; updateMarker(); });
  themeLight.addEventListener('click', () => { if (state.theme !== 'light') { state.theme = 'light'; save(); applyTheme(); render(); } });
  themeDark.addEventListener('click', () => { if (state.theme !== 'dark') { state.theme = 'dark'; save(); applyTheme(); render(); } });

  // ── presets (server-side, scoped to the signed-in account) ────
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
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
    try { presets = await api.list(); }
    catch (_) { presets = []; }
    renderPresetOptions();
  }
  function applySelection(s) {
    if (!s || !Array.isArray(s.zones)) return;
    const zones = s.zones.filter((z) => ALL_ZONES.includes(z));
    state.zones = zones.length ? zones : [browserZone];
    state.home = state.zones.includes(s.home) ? s.home : state.zones[0];
    state.work = Array.isArray(s.work) && s.work.length === 2 ? [s.work[0], s.work[1]] : state.work;
    state.fmt24 = s.fmt24 !== false;
    markerFrac = null;
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

  // ── boot: gate on auth, then start ────────────────────────────
  let clockTimer = null;
  function startClock() {
    if (!clockTimer) clockTimer = setInterval(() => {
      nowTs = Date.now();
      render(); // keep "now" (and the marker, when tracking now) honest
    }, 60000);
  }
  function showGate(msg) {
    const gate = document.getElementById('authGate');
    if (gate) gate.textContent = msg;
  }

  async function boot() {
    applyTheme();
    try {
      const r = await fetch(apiUrl('api/v1/me'), { credentials: 'same-origin' });
      if (r.ok) {
        document.body.classList.add('authed');
        await initPresets();
        render();
        startClock();
      } else if (r.status === 401) {
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
