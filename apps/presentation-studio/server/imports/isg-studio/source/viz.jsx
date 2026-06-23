/* ═══════════════════════════════════════════════════════════════
   ISG VIZ — reusable SVG chart kit. Theme-aware (all color via
   tokens). Each component is self-contained; gradient/clip ids are
   uniquified to avoid collisions. Exported to window at the bottom.
   ═══════════════════════════════════════════════════════════════ */

let __vizId = 0;
const uid = (p) => `${p}-${++__vizId}`;
const cssVar = (t) => (t && t.startsWith('--')) ? `var(${t})` : (t && t.startsWith('#') ? t : `var(--${t || 'd-2'})`);

/* ── Sparkline — compact trend line, optional area fill ──────── */
function Sparkline({ data, w = 160, h = 44, tone = 'd-2', area = true, strokeW = 2, dot = true }) {
  const max = Math.max(...data), min = Math.min(...data), rng = (max - min) || 1;
  const pad = strokeW + 1;
  const X = (i) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const Y = (v) => pad + (1 - (v - min) / rng) * (h - pad * 2);
  const pts = data.map((v, i) => [X(i), Y(v)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const fill = `${line} L${X(data.length - 1).toFixed(1)},${h - pad} L${pad},${h - pad} Z`;
  const gid = uid('spark');
  const c = cssVar(tone);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity="0.32" /><stop offset="100%" stopColor={c} stopOpacity="0" /></linearGradient></defs>
      {area && <path d={fill} fill={`url(#${gid})`} />}
      <path d={line} fill="none" stroke={c} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" />
      {dot && <circle cx={X(data.length - 1)} cy={Y(data[data.length - 1])} r={strokeW + 1.2} fill={c} />}
    </svg>
  );
}

/* ── AreaChart — larger area chart with baseline grid + axis ─── */
function AreaChart({ series, w = 520, h = 200, tone = 'd-2', grid = 4, labels }) {
  const data = series;
  const max = Math.max(...data) * 1.1, min = Math.min(0, ...data), rng = (max - min) || 1;
  const padL = 6, padB = labels ? 22 : 8, padT = 8;
  const X = (i) => padL + (i / (data.length - 1)) * (w - padL * 2);
  const Y = (v) => padT + (1 - (v - min) / rng) * (h - padT - padB);
  const pts = data.map((v, i) => [X(i), Y(v)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const fill = `${line} L${X(data.length - 1).toFixed(1)},${Y(min)} L${padL},${Y(min)} Z`;
  const gid = uid('area'); const c = cssVar(tone);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity="0.34" /><stop offset="100%" stopColor={c} stopOpacity="0.02" /></linearGradient></defs>
      {Array.from({ length: grid + 1 }).map((_, i) => { const y = padT + (i / grid) * (h - padT - padB); return <line key={i} x1={padL} y1={y} x2={w - padL} y2={y} stroke="var(--line)" strokeWidth="1" />; })}
      <path d={fill} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="var(--bg-1)" stroke={c} strokeWidth="1.6" />)}
      {labels && labels.map((l, i) => <text key={i} x={X(i)} y={h - 6} textAnchor="middle" fill="var(--ink-4)" style={{ fontFamily: 'var(--f-mono)', fontSize: 10 }}>{l}</text>)}
    </svg>
  );
}

/* ── Multi-series line chart (overlay) ───────────────────────── */
function LineChart({ lines, w = 520, h = 200, grid = 4, labels }) {
  const all = lines.flatMap((l) => l.data);
  const max = Math.max(...all) * 1.08, min = Math.min(0, ...all), rng = (max - min) || 1;
  const padL = 6, padB = labels ? 22 : 8, padT = 8;
  const X = (i, n) => padL + (i / (n - 1)) * (w - padL * 2);
  const Y = (v) => padT + (1 - (v - min) / rng) * (h - padT - padB);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
      {Array.from({ length: grid + 1 }).map((_, i) => { const y = padT + (i / grid) * (h - padT - padB); return <line key={i} x1={padL} y1={y} x2={w - padL} y2={y} stroke="var(--line)" strokeWidth="1" />; })}
      {lines.map((l, li) => {
        const c = cssVar(l.tone); const d = l.data.map((v, i) => `${i ? 'L' : 'M'}${X(i, l.data.length).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
        return <g key={li}><path d={d} fill="none" stroke={c} strokeWidth="2.5" strokeDasharray={l.dashed ? '5,4' : 'none'} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={X(l.data.length - 1, l.data.length)} cy={Y(l.data[l.data.length - 1])} r="3" fill={c} /></g>;
      })}
      {labels && labels.map((l, i) => <text key={i} x={X(i, labels.length)} y={h - 6} textAnchor="middle" fill="var(--ink-4)" style={{ fontFamily: 'var(--f-mono)', fontSize: 10 }}>{l}</text>)}
    </svg>
  );
}

/* ── Donut / Ring gauge ──────────────────────────────────────── */
function Donut({ segments, size = 150, thick = 18, center, sub, gap = 2 }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thick) / 2, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r;
  let off = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-3)" strokeWidth={thick} />
        {segments.map((s, i) => {
          const frac = s.value / total; const len = frac * C; const dash = `${Math.max(len - gap, 0)} ${C - Math.max(len - gap, 0)}`;
          const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={cssVar(s.tone)} strokeWidth={thick} strokeDasharray={dash} strokeDashoffset={-off} strokeLinecap="butt" />;
          off += len; return el;
        })}
      </svg>
      {(center || sub) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          {center && <div style={{ fontSize: size * 0.2, fontWeight: 700, letterSpacing: '-0.005em', color: 'var(--ink)', lineHeight: 1, fontFamily: 'var(--f-sans)', whiteSpace: 'nowrap' }}>{center}</div>}
          {sub && <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{sub}</div>}
        </div>
      )}
    </div>
  );
}

/* ── Radial gauge (single value, arc) ────────────────────────── */
function Gauge({ value, max = 100, size = 150, thick = 14, tone = 'accent', label, fmt }) {
  const r = (size - thick) / 2, cx = size / 2, cy = size / 2;
  const A = Math.PI * 1.35, start = Math.PI * 0.825;
  const pol = (ang) => [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  const arc = (a0, a1) => { const [x0, y0] = pol(a0), [x1, y1] = pol(a1); const large = (a1 - a0) > Math.PI ? 1 : 0; return `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1}`; };
  const frac = Math.min(value / max, 1);
  return (
    <div style={{ position: 'relative', width: size, height: size * 0.78 }}>
      <svg width={size} height={size * 0.82} viewBox={`0 0 ${size} ${size * 0.82}`} style={{ overflow: 'visible' }}>
        <path d={arc(start, start + A)} fill="none" stroke="var(--bg-3)" strokeWidth={thick} strokeLinecap="round" />
        <path d={arc(start, start + A * frac)} fill="none" stroke={cssVar(tone)} strokeWidth={thick} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, top: '14%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: size * 0.2, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ink)', lineHeight: 1 }}>{fmt ? fmt(value) : value}</div>
        {label && <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginTop: 4 }}>{label}</div>}
      </div>
    </div>
  );
}

/* ── MiniBars — vertical bar chart ───────────────────────────── */
function MiniBars({ data, w = 220, h = 90, tone = 'd-2', labels, highlight }) {
  const max = Math.max(...data) || 1; const n = data.length; const gap = 4; const bw = (w - gap * (n - 1)) / n;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + (labels ? 16 : 0)}`} style={{ display: 'block' }}>
      {data.map((v, i) => {
        const bh = (v / max) * h; const x = i * (bw + gap); const isHi = highlight === i;
        return <g key={i}>
          <rect x={x} y={h - bh} width={bw} height={bh} rx="2.5" fill={isHi ? cssVar('accent') : cssVar(tone)} opacity={isHi ? 1 : 0.55} />
          {labels && <text x={x + bw / 2} y={h + 12} textAnchor="middle" fill="var(--ink-4)" style={{ fontFamily: 'var(--f-mono)', fontSize: 9 }}>{labels[i]}</text>}
        </g>;
      })}
    </svg>
  );
}

/* ── Radar / spider chart ────────────────────────────────────── */
function Radar({ axes, series, size = 240, max = 5, rings = 4 }) {
  const cx = size / 2, cy = size / 2, R = size / 2 - 30; const N = axes.length;
  const ang = (i) => -Math.PI / 2 + (i / N) * Math.PI * 2;
  const pt = (i, v) => [cx + (v / max) * R * Math.cos(ang(i)), cy + (v / max) * R * Math.sin(ang(i))];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      {Array.from({ length: rings }).map((_, ri) => {
        const rr = ((ri + 1) / rings); const poly = axes.map((_, i) => { const [x, y] = pt(i, rr * max); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
        return <polygon key={ri} points={poly} fill="none" stroke="var(--line)" strokeWidth="1" />;
      })}
      {axes.map((_, i) => { const [x, y] = pt(i, max); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" strokeWidth="1" />; })}
      {series.map((s, si) => {
        const c = cssVar(s.tone); const poly = s.data.map((v, i) => { const [x, y] = pt(i, v); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
        return <g key={si}><polygon points={poly} fill={c} fillOpacity="0.14" stroke={c} strokeWidth="2" strokeLinejoin="round" />
          {s.data.map((v, i) => { const [x, y] = pt(i, v); return <circle key={i} cx={x} cy={y} r="3" fill={c} />; })}</g>;
      })}
      {axes.map((a, i) => { const [x, y] = pt(i, max + 0.55); return <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="var(--ink-3)" style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.04em' }}>{a}</text>; })}
    </svg>
  );
}

/* ── Gantt / timeline ────────────────────────────────────────── */
function Gantt({ rows, w = 560, cols, rowH = 34 }) {
  const n = cols.length; const labelW = 150; const trackW = w - labelW; const colW = trackW / n; const H = rows.length * rowH + 26;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      {cols.map((c, i) => <g key={i}><line x1={labelW + i * colW} y1="20" x2={labelW + i * colW} y2={H - 4} stroke="var(--line)" strokeWidth="1" /><text x={labelW + i * colW + 4} y="12" fill="var(--ink-4)" style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '0.06em' }}>{c}</text></g>)}
      {rows.map((r, ri) => {
        const y = 26 + ri * rowH; const x = labelW + r.start * colW; const bw = Math.max(r.len * colW - 4, 8); const c = cssVar(r.tone);
        return <g key={ri}>
          <text x="0" y={y + rowH / 2} dominantBaseline="middle" fill="var(--ink-2)" style={{ fontFamily: 'var(--f-sans)', fontSize: 12 }}>{r.label}</text>
          <rect x={x} y={y + 5} width={bw} height={rowH - 14} rx="5" fill={c} fillOpacity={r.ghost ? 0.18 : 0.85} stroke={c} strokeWidth={r.ghost ? 1 : 0} strokeDasharray={r.ghost ? '4,3' : 'none'} />
          {r.milestone != null && <circle cx={labelW + r.milestone * colW} cy={y + rowH / 2} r="4.5" fill="var(--accent)" stroke="var(--bg-1)" strokeWidth="2" />}
        </g>;
      })}
    </svg>
  );
}

/* ── Sankey-lite — left→right flow ribbons ───────────────────── */
function FlowRibbons({ left, right, links, w = 560, h = 260 }) {
  const nodeW = 12, pad = 8; const lx = pad, rx = w - pad - nodeW;
  const total = left.reduce((a, n) => a + n.value, 0) || 1;
  let ly = 0; const lpos = left.map((n) => { const hh = (n.value / total) * (h - (left.length - 1) * 6); const o = { ...n, y: ly, h: hh }; ly += hh + 6; return o; });
  let ry = 0; const rtot = right.reduce((a, n) => a + n.value, 0) || 1; const rpos = right.map((n) => { const hh = (n.value / rtot) * (h - (right.length - 1) * 6); const o = { ...n, y: ry, h: hh }; ry += hh + 6; return o; });
  const lOff = {}, rOff = {};
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
      {links.map((lk, i) => {
        const a = lpos[lk.from], b = rpos[lk.to]; if (!a || !b) return null;
        const t = (lk.value / a.value) * a.h; const bt = (lk.value / b.value) * b.h;
        const ay = a.y + (lOff[lk.from] || 0); const by = b.y + (rOff[lk.to] || 0);
        lOff[lk.from] = (lOff[lk.from] || 0) + t; rOff[lk.to] = (rOff[lk.to] || 0) + bt;
        const x0 = lx + nodeW, x1 = rx; const mx = (x0 + x1) / 2; const c = cssVar(a.tone);
        const d = `M${x0},${ay} C${mx},${ay} ${mx},${by} ${x1},${by} L${x1},${by + bt} C${mx},${by + bt} ${mx},${ay + t} ${x0},${ay + t} Z`;
        return <path key={i} d={d} fill={c} fillOpacity="0.22" />;
      })}
      {lpos.map((n, i) => <g key={`l${i}`}><rect x={lx} y={n.y} width={nodeW} height={n.h} rx="3" fill={cssVar(n.tone)} /><text x={lx + nodeW + 8} y={n.y + n.h / 2} dominantBaseline="middle" fill="var(--ink-2)" style={{ fontFamily: 'var(--f-sans)', fontSize: 12 }}>{n.label}</text></g>)}
      {rpos.map((n, i) => <g key={`r${i}`}><rect x={rx} y={n.y} width={nodeW} height={n.h} rx="3" fill={cssVar(n.tone)} /><text x={rx - 8} y={n.y + n.h / 2} dominantBaseline="middle" textAnchor="end" fill="var(--ink-2)" style={{ fontFamily: 'var(--f-sans)', fontSize: 12 }}>{n.label}</text></g>)}
    </svg>
  );
}

/* ── Heat strip — intensity cells (e.g. activity over time) ──── */
function HeatStrip({ data, cols = 24, cell = 15, gap = 3, tone = 'accent' }) {
  const max = Math.max(...data) || 1; const rows = Math.ceil(data.length / cols);
  const w = cols * (cell + gap), h = rows * (cell + gap);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      {data.map((v, i) => { const r = Math.floor(i / cols), c = i % cols; const op = 0.12 + (v / max) * 0.88;
        return <rect key={i} x={c * (cell + gap)} y={r * (cell + gap)} width={cell} height={cell} rx="2.5" fill={cssVar(tone)} opacity={op} />; })}
    </svg>
  );
}

/* ── Progress meter — labeled horizontal bar ─────────────────── */
function Meter({ pct, tone = 'accent', h = 8, track = 'var(--bg-3)' }) {
  return (
    <div style={{ width: '100%', height: h, background: track, borderRadius: 99, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${cssVar(tone)}, color-mix(in srgb, ${cssVar(tone)} 55%, transparent))` }} />
    </div>
  );
}

/* ── Legend row ──────────────────────────────────────────────── */
function Legend({ items, style }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px 18px', ...style }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--ink-2)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: cssVar(it.tone) }} />
          {it.label}{it.value != null && <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--ink-3)', fontSize: 11 }}>{it.value}</span>}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, {
  Sparkline, AreaChart, LineChart, Donut, Gauge, MiniBars, Radar, Gantt, FlowRibbons, HeatStrip, Meter, Legend, vizCssVar: cssVar,
});
