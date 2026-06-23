/* ═══════════════════════════════════════════════════════════════
   ISG LIB — shared primitives. Every template composes from these.
   Pure presentational components; all color via CSS vars (tokens.css).
   Exported to window at the bottom for cross-file use.
   ═══════════════════════════════════════════════════════════════ */

/* Mono eyebrow with the signature accent tick rule */
function Eyebrow({ children, accent = true, color, style }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      fontFamily: 'var(--f-mono)', fontSize: 'var(--t-label)', fontWeight: 500,
      letterSpacing: '0.12em', textTransform: 'uppercase',
      color: color || (accent ? 'var(--accent)' : 'var(--ink-3)'), ...style,
    }}>
      {accent && <span style={{ width: 24, height: 1, background: 'var(--accent)', flexShrink: 0 }} />}
      {children}
    </div>
  );
}

/* Status / category dot */
function Dot({ tone = 'accent', size = 8, pulse }) {
  const c = toneColor(tone);
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: c,
      flexShrink: 0, display: 'inline-block',
      boxShadow: `0 0 0 3px color-mix(in srgb, ${c} 18%, transparent)`,
      animation: pulse ? 'isgPulse 2.4s var(--ease) infinite' : 'none',
    }} />
  );
}

/* Pill / tag. tone drives color. variant: soft (default) | outline | solid */
function Tag({ children, tone = 'default', variant = 'soft', mono = true, style }) {
  const c = toneColor(tone);
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontFamily: mono ? 'var(--f-mono)' : 'var(--f-sans)',
    fontSize: '10.5px', letterSpacing: mono ? '0.08em' : '0.01em',
    textTransform: mono ? 'uppercase' : 'none',
    padding: '3px 9px', borderRadius: 'var(--r-sm)', whiteSpace: 'nowrap',
    fontWeight: 500, lineHeight: 1.4, ...style,
  };
  const skins = {
    soft:    { background: tintBg(tone), border: `1px solid ${tintLine(tone)}`, color: c },
    outline: { background: 'transparent', border: `1px solid var(--line-2)`, color: 'var(--ink-2)' },
    solid:   { background: c, border: `1px solid ${c}`, color: 'var(--accent-ink)' },
  };
  return <span style={{ ...base, ...skins[variant] }}>{children}</span>;
}

/* The workhorse surface. accentBar paints a 2px top rule in `tone`.
   Pass href / detail / onActivate to make the whole card a control. */
function Card({ children, label, title, sub, tone, accentBar, pad = 'var(--s-6)', glass, style, bodyStyle, href, detail, onActivate, cue }) {
  const clickable = !!(href || detail || onActivate);
  const baseStyle = {
    position: 'relative', background: glass ? 'var(--glass-bg)' : 'var(--bg-1)',
    backdropFilter: glass ? 'var(--glass-blur)' : 'none',
    WebkitBackdropFilter: glass ? 'var(--glass-blur)' : 'none',
    border: '1px solid var(--line)', borderRadius: 'var(--r-lg)',
    boxShadow: glass ? 'var(--glass-shadow)' : 'var(--elev-1)', overflow: 'hidden', ...style,
  };
  const body = (
    <>
      {accentBar && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: toneColor(tone || 'accent') }} />}
      {clickable && cue && <span className="ix-cue" aria-hidden="true">{href ? '↗' : '+'}</span>}
      <div style={{ padding: pad, ...bodyStyle }}>
        {label && <div className="mono-label" style={{ marginBottom: title ? 8 : 0 }}>{label}</div>}
        {title && <div style={{ fontSize: 'var(--t-h3)', fontWeight: 600, letterSpacing: '-0.01em', marginBottom: sub ? 4 : 0 }}>{title}</div>}
        {sub && <div style={{ fontSize: 'var(--t-small)', color: 'var(--ink-3)', marginBottom: children ? 14 : 0 }}>{sub}</div>}
        {children}
      </div>
    </>
  );
  if (!clickable) return <div style={baseStyle}>{body}</div>;
  if (href) {
    const ext = /^(https?:|mailto:|tel:)/.test(href);
    return <a className="ix ix-lift" style={{ display: 'block', textDecoration: 'none', color: 'inherit', ...baseStyle }} href={href} target={ext ? '_blank' : undefined} rel={ext ? 'noopener noreferrer' : undefined}>{body}</a>;
  }
  const fire = (e) => { e.stopPropagation(); if (onActivate) onActivate(e); if (detail) openInspector(detail); };
  return <div className="ix ix-lift" role="button" tabIndex={0} style={baseStyle} onClick={fire} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(e); } }}>{body}</div>;
}

/* Big metric tile. Pass href / detail / onActivate to make it a control. */
function StatCard({ value, label, tone = 'ink', sub, style, href, detail, onActivate, cue }) {
  const clickable = !!(href || detail || onActivate);
  const baseStyle = {
    position: 'relative', flex: 1, minWidth: 0, background: 'var(--bg-1)', border: '1px solid var(--line)',
    borderRadius: 'var(--r-lg)', padding: 'var(--s-5) var(--s-6)', boxShadow: 'var(--elev-1)',
    display: 'flex', flexDirection: 'column', gap: 6, ...style,
  };
  const body = (
    <>
      {clickable && cue && <span className="ix-cue" aria-hidden="true">{href ? '↗' : '+'}</span>}
      {label && <div className="mono-label" style={{ fontSize: 'var(--t-micro)' }}>{label}</div>}
      <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, color: tone === 'ink' ? 'var(--ink)' : toneColor(tone), fontFamily: 'var(--f-sans)' }}>{value}</div>
      {sub && <div style={{ fontSize: 'var(--t-small)', color: 'var(--ink-3)' }}>{sub}</div>}
    </>
  );
  if (!clickable) return <div style={baseStyle}>{body}</div>;
  if (href) {
    const ext = /^(https?:|mailto:|tel:)/.test(href);
    return <a className="ix ix-lift" style={{ textDecoration: 'none', color: 'inherit', ...baseStyle }} href={href} target={ext ? '_blank' : undefined} rel={ext ? 'noopener noreferrer' : undefined}>{body}</a>;
  }
  const fire = (e) => { e.stopPropagation(); if (onActivate) onActivate(e); if (detail) openInspector(detail); };
  return <div className="ix ix-lift" role="button" tabIndex={0} style={baseStyle} onClick={fire} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(e); } }}>{body}</div>;
}

/* Label · value row, mono key. Great for spec sheets / overview blocks. */
function KV({ k, v, vColor }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '128px 1fr', gap: 16, alignItems: 'baseline', padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
      <span style={{ fontFamily: 'var(--f-mono)', fontSize: '10.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{k}</span>
      <span style={{ fontSize: 'var(--t-body)', color: vColor || 'var(--ink)' }}>{v}</span>
    </div>
  );
}
function KVList({ rows }) {
  return <div>{rows.map((r, i) => <KV key={i} {...r} />)}</div>;
}

/* Section divider with an optional right-aligned meta count */
function SectionHead({ label, meta, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 10, marginBottom: 18, ...style }}>
      <div className="mono-label" style={{ color: 'var(--ink-2)' }}>{label}</div>
      {meta && <div style={{ fontFamily: 'var(--f-mono)', fontSize: 'var(--t-micro)', color: 'var(--ink-4)', letterSpacing: '0.08em' }}>{meta}</div>}
    </div>
  );
}

/* Horizontal stacked proportion bar (BY PROFILE / BY STATUS) */
function StackBar({ segments, height = 14 }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div>
      <div style={{ display: 'flex', height, borderRadius: 'var(--r-xs)', overflow: 'hidden', gap: 2 }}>
        {segments.map((s, i) => (
          <div key={i} title={`${s.label}: ${s.value}`} style={{ width: `${(s.value / total) * 100}%`, background: s.color || toneColor(s.tone || 'accent') }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', marginTop: 14 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--t-small)', color: 'var(--ink-2)' }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color || toneColor(s.tone || 'accent') }} />
            {s.label}
            <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--ink-3)', fontSize: '11px' }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Horizontal funnel / ranked bar row */
function BarRow({ value, label, sub, pct, tone = 'accent' }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 180px', alignItems: 'center', gap: 18 }}>
      <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', fontFamily: 'var(--f-sans)' }}>{value}</div>
      <div style={{ height: 30, background: 'var(--bg-3)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${toneColor(tone)}, color-mix(in srgb, ${toneColor(tone)} 60%, transparent))` }} />
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 'var(--t-small)', fontWeight: 500 }}>{label}</div>
        <div className="mono-label" style={{ fontSize: '9px', justifyContent: 'flex-end' }}>{sub}</div>
      </div>
    </div>
  );
}

/* A boxed diagram node for architecture flows (HTML, not SVG).
   Pass href / detail / onActivate to make it a control. */
function Node({ title, sub, tone = 'd-1', tags, mono, style, href, detail, onActivate, cue }) {
  const c = `var(--${tone})`;
  const clickable = !!(href || detail || onActivate);
  const baseStyle = {
    position: 'relative',
    background: `var(--${tone}-soft)`, border: `1px solid var(--${tone}-line)`,
    borderRadius: 'var(--r)', padding: '12px 14px', ...style,
  };
  const body = (
    <>
      {clickable && cue && <span className="ix-cue" aria-hidden="true">{href ? '↗' : '+'}</span>}
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', fontFamily: mono ? 'var(--f-mono)' : 'var(--f-sans)', letterSpacing: mono ? '0.02em' : '-0.01em' }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3 }}>{sub}</div>}
      {tags && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 9 }}>{tags.map((t, i) => <Tag key={i} tone={tone}>{t}</Tag>)}</div>}
    </>
  );
  if (!clickable) return <div style={baseStyle}>{body}</div>;
  if (href) {
    const ext = /^(https?:|mailto:|tel:)/.test(href);
    return <a className="ix ix-lift" style={{ display: 'block', textDecoration: 'none', color: 'inherit', ...baseStyle }} href={href} target={ext ? '_blank' : undefined} rel={ext ? 'noopener noreferrer' : undefined}>{body}</a>;
  }
  const fire = (e) => { e.stopPropagation(); if (onActivate) onActivate(e); if (detail) openInspector(detail); };
  return <div className="ix ix-lift" role="button" tabIndex={0} style={baseStyle} onClick={fire} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(e); } }}>{body}</div>;
}

/* ── helpers ─────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════
   INTERACTIVITY — make any template element a tactile control.
   • Interactive  — wrapper that renders an <a> for hyperlinks or a
     keyboard-accessible button-div that opens the Inspector.
   • openInspector(detail) — fire the shared detail panel from code.
   • Inspector — the panel itself (mounted once by the gallery App).
   Detail payload: { kicker, title, sub, tone, body (str | str[]),
     stats:[{k,v}], tags:[…], links:[{label,href}] }.
   ─────────────────────────────────────────────────────────────── */
function openInspector(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('isg:inspect', { detail }));
}

function Interactive({ href, detail, onActivate, className = '', style, children,
                       lift = true, ring = false, cue, title, stop = true }) {
  const cls = ['ix', lift && 'ix-lift', ring && 'ix-ring', className].filter(Boolean).join(' ');
  const cueEl = cue ? <span className="ix-cue" aria-hidden="true">{cue === 'link' ? '↗' : (cue === 'inspect' ? '+' : cue)}</span> : null;
  if (href) {
    const ext = /^(https?:|mailto:|tel:)/.test(href);
    return (
      <a href={href} title={title} className={cls}
         style={{ display: 'block', position: 'relative', ...style }}
         target={ext ? '_blank' : undefined} rel={ext ? 'noopener noreferrer' : undefined}
         onClick={(e) => { if (stop) e.stopPropagation(); }}>
        {cueEl}{children}
      </a>
    );
  }
  const fire = (e) => { if (stop) e.stopPropagation(); if (onActivate) onActivate(e); if (detail) openInspector(detail); };
  return (
    <div title={title} className={cls} style={{ position: 'relative', ...style }}
         role="button" tabIndex={0} onClick={fire}
         onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(e); } }}>
      {cueEl}{children}
    </div>
  );
}

/* FlowEdge — a slim comet/"worm" that crawls the parent box's perimeter
   (rounded corners + pills) at an even pace, orienting along the edge,
   with its own on/off switch. Drop inside any position:relative box.
   Honors the global FLOW toggle and reduced-motion / print. */
function FlowEdge({ dur = 8, thick = 5, len = 34, delay = 0, color }) {
  const [on, setOn] = React.useState(true);
  const vars = { '--fd-dur': dur + 's', '--fd-thick': thick + 'px', '--fd-len': len + 'px', '--fd-delay': (delay || 0) + 's' };
  if (color) vars['--fd-c'] = `var(--${color})`;
  return (
    <>
      <span className="flow-edge" data-off={on ? undefined : ''} style={vars}>
        <span className="flow-dot" />
      </span>
      <button type="button" className="flow-switch" data-on={on ? 'true' : 'false'}
        aria-label={on ? 'Turn off edge animation' : 'Turn on edge animation'}
        title={on ? 'Turn off edge animation' : 'Turn on edge animation'}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOn((v) => !v); }}>
        <span className="fs-dot" />
      </button>
    </>
  );
}

function Inspector() {
  const [d, setD] = React.useState(null);
  React.useEffect(() => {
    const onOpen = (e) => setD(e.detail || null);
    const onKey = (e) => { if (e.key === 'Escape') setD(null); };
    window.addEventListener('isg:inspect', onOpen);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('isg:inspect', onOpen); window.removeEventListener('keydown', onKey); };
  }, []);
  const open = !!d;
  const tone = d && d.tone ? d.tone : 'accent';
  const c = toneColor(tone);
  const bodyLines = d && d.body ? (Array.isArray(d.body) ? d.body : [d.body]) : [];
  return (
    <>
      <div className="ix-backdrop" data-open={open ? 'true' : 'false'} onClick={() => setD(null)} aria-hidden={!open} />
      <aside className="ix-panel" data-open={open ? 'true' : 'false'} role="dialog" aria-modal="true" aria-hidden={!open}
             aria-label={d ? (d.title || 'Detail') : 'Detail'}>
        {d && (
          <>
            <div className="ix-panel-head">
              <div className="ix-panel-accent" style={{ background: c }} />
              <div style={{ minWidth: 0 }}>
                {d.kicker && <div className="mono-label" style={{ color: c, marginBottom: 8 }}>{d.kicker}</div>}
                <div style={{ fontSize: 'var(--t-h1)', fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.12, textWrap: 'balance' }}>{d.title}</div>
                {d.sub && <div style={{ fontSize: 'var(--t-small)', color: 'var(--ink-3)', marginTop: 6 }}>{d.sub}</div>}
              </div>
              <button className="ix-panel-close" onClick={() => setD(null)} aria-label="Close detail">×</button>
            </div>
            <div className="ix-panel-body">
              {bodyLines.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {bodyLines.map((b, i) => (
                    <p key={i} className="t-body" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>{b}</p>
                  ))}
                </div>
              )}
              {d.stats && d.stats.length > 0 && (
                <div style={{ marginTop: bodyLines.length ? 22 : 0 }}>
                  <KVList rows={d.stats.map((s) => ({ k: s.k, v: s.v, vColor: s.vColor }))} />
                </div>
              )}
              {d.tags && d.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 22 }}>
                  {d.tags.map((t, i) => <Tag key={i} tone={typeof t === 'object' ? t.tone : tone}>{typeof t === 'object' ? t.label : t}</Tag>)}
                </div>
              )}
              {d.links && d.links.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 26 }}>
                  {d.links.map((l, i) => {
                    const ext = /^(https?:|mailto:|tel:)/.test(l.href || '');
                    return (
                      <a key={i} href={l.href || '#'} className="ix-panel-link"
                         target={ext ? '_blank' : undefined} rel={ext ? 'noopener noreferrer' : undefined}
                         style={{
                           display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                           padding: '12px 16px', borderRadius: 'var(--r)', textDecoration: 'none',
                           border: `1px solid ${l.primary ? 'var(--accent-line)' : 'var(--line)'}`,
                           background: l.primary ? 'var(--accent-soft)' : 'var(--bg-1)',
                           color: l.primary ? 'var(--accent)' : 'var(--ink)',
                           fontSize: 14, fontWeight: 500,
                         }}>
                        <span>{l.label}</span>
                        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 13, opacity: 0.8 }}>{ext ? '↗' : '→'}</span>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function toneColor(tone) {
  const map = {
    accent: 'var(--accent)', ink: 'var(--ink)', ink2: 'var(--ink-2)', mute: 'var(--mute)',
    ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)',
    p1: 'var(--p1)', p2: 'var(--p2)', p3: 'var(--p3)', p4: 'var(--p4)', p5: 'var(--p5)',
    'd-1': 'var(--d-1)', 'd-2': 'var(--d-2)', 'd-3': 'var(--d-3)', 'd-4': 'var(--d-4)', 'd-5': 'var(--d-5)', 'd-6': 'var(--d-6)',
    default: 'var(--ink-2)',
  };
  return map[tone] || tone;
}
function tintBg(tone) {
  const map = {
    accent: 'var(--accent-soft)', ok: 'var(--ok-bg)', warn: 'var(--warn-bg)', bad: 'var(--bad-bg)',
    'd-1': 'var(--d-1-soft)', 'd-2': 'var(--d-2-soft)', 'd-3': 'var(--d-3-soft)', 'd-4': 'var(--d-4-soft)', 'd-5': 'var(--d-5-soft)', 'd-6': 'var(--d-6-soft)',
  };
  return map[tone] || 'color-mix(in srgb, var(--ink) 7%, transparent)';
}
function tintLine(tone) {
  const map = {
    accent: 'var(--accent-line)', ok: 'var(--ok-line)', warn: 'var(--warn-line)', bad: 'var(--bad-line)',
    'd-1': 'var(--d-1-line)', 'd-2': 'var(--d-2-line)', 'd-3': 'var(--d-3-line)', 'd-4': 'var(--d-4-line)', 'd-5': 'var(--d-5-line)', 'd-6': 'var(--d-6-line)',
  };
  return map[tone] || 'var(--line-2)';
}

Object.assign(window, {
  Eyebrow, Dot, Tag, Card, StatCard, KV, KVList, SectionHead, StackBar, BarRow, Node,
  Interactive, Inspector, openInspector, FlowEdge,
  toneColor, tintBg, tintLine,
});
