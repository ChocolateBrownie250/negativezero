/* ═══════════════════════════════════════════════════════════════
   GALLERY SHELL — the browsable library frame.
   - Top bar: theme toggle + flow toggle (desktop: text, mobile: icon).
   - Desktop: 236px left rail with grouped template index.
   - Mobile: sticky header + bottom-sheet nav drawer + a thumb-zone
     action bar (Templates / frame stepper) fixed to the bottom.
   - Stage: scales each fixed-width design to the viewport.
   - All interactive states (hover/press/focus) via gc-* classes in
     tokens.css; theme + flow preferences persist in localStorage.
   Templates self-register via window.ISG.register({...}).
   ═══════════════════════════════════════════════════════════════ */

window.ISG = window.ISG || { _reg: [], register(e) { this._reg.push(e); } };

const { useState, useEffect, useRef, useLayoutEffect } = React;

/* ── Responsive breakpoint ────────────────────────────────────── */
function useMedia(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    // Deterministic: fires on the post-splash reflow in the bundled iframe,
    // where timing heuristics (rAF/timeout) and matchMedia 'change' can be missed.
    const ro = new ResizeObserver(sync);
    ro.observe(document.documentElement);
    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
      ro.disconnect();
    };
  }, [query]);
  return matches;
}

/* ── Stage: scale a design of fixed `w` to the container width ───
   zoom: 'fit' (default) scales to fit the container; a number is an
   absolute scale (used by the mobile zoom control). When the scaled
   content is wider than the container, the parent .board-scroll
   scrolls horizontally. ─────────────────────────────────────────── */
function Stage({ w, h, mode, zoom = 'fit', children }) {
  const wrapRef = useRef(null);
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      if (!wrapRef.current) return;
      const cw = wrapRef.current.clientWidth;
      const fit = Math.min(cw / w, 1.0);
      const s = (zoom === 'fit' || zoom == null) ? fit : zoom;
      setScale(s);
      const contentH = mode === 'board' ? h : (innerRef.current ? innerRef.current.offsetHeight : h);
      setDims({ w: Math.round(w * s), h: Math.round(contentH * s) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, [w, h, mode, zoom, children]);

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <div style={{ width: dims.w || undefined, height: dims.h || undefined }}>
        <div ref={innerRef} style={{
          width: w, height: mode === 'board' ? h : undefined,
          transform: `scale(${scale})`, transformOrigin: 'top left',
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* Mobile zoom control — Fit / 75% / 100% for fixed-width designs */
function ZoomSeg({ value, onChange, options }) {
  return (
    <div role="group" aria-label="Zoom" style={{ display: 'inline-flex', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: 2, gap: 2 }}>
      {options.map(([v, lab]) => (
        <button key={String(v)} onClick={() => onChange(v)} aria-pressed={v === value} className="gc gc-press" style={{
          fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '0.04em', padding: '6px 11px', minHeight: 36,
          borderRadius: 3, cursor: 'pointer', border: 'none',
          background: v === value ? 'var(--bg-4)' : 'transparent',
          color: v === value ? 'var(--ink)' : 'var(--ink-3)',
        }}>{lab}</button>
      ))}
    </div>
  );
}

/* ── Frame wrappers ───────────────────────────────────────────── */
function ScaledFrame({ frame, mode }) {
  const isMobile = useMedia('(max-width: 767px)');
  const [zoom, setZoom] = useState('fit');
  useEffect(() => { setZoom('fit'); }, [frame]);
  const opts = mode === 'board'
    ? [['fit', 'Fit'], [0.5, '50%'], [1, '100%']]
    : [['fit', 'Fit'], [1, '100%'], [1.25, '125%']];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-4)', marginRight: 'auto' }}>
          {isMobile ? 'Pinch or scroll to read · zoom' : 'Zoom to read · scroll to pan'}
        </span>
        <ZoomSeg value={zoom} onChange={setZoom} options={opts} />
      </div>
      <div className="board-scroll" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--glass-shadow)', background: 'var(--bg)' }}>
        <Stage w={frame.w} h={frame.h} mode={mode} zoom={zoom}>{frame.node}</Stage>
      </div>
    </div>
  );
}
function BoardFrame({ frame }) { return <ScaledFrame frame={frame} mode="board" />; }
function FlowFrame({ frame }) { return <ScaledFrame frame={frame} mode="flow" />; }

/* ── Search box — filters the template index ─────────────────── */
function SearchBox({ value, onChange, autoFocus }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ position: 'absolute', left: 11, color: 'var(--ink-4)', pointerEvents: 'none' }}>
        <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M9.2 9.2 L12.5 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <input
        type="search" value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus}
        placeholder="Search templates…" aria-label="Search templates"
        className="gc-search"
        style={{
          width: '100%', minHeight: 38, padding: '0 30px 0 32px',
          background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)',
          color: 'var(--ink)', fontFamily: 'var(--f-sans)', fontSize: 13.5, outline: 'none',
        }} />
      {value && (
        <button onClick={() => onChange('')} aria-label="Clear search" className="gc gc-press" style={{
          position: 'absolute', right: 6, width: 24, height: 24, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-4)', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 14, lineHeight: 1,
        }}>×</button>
      )}
    </div>
  );
}

/* ── Mobile bottom-sheet nav drawer ──────────────────────────── */
function NavDrawer({ open, onClose, groups, active, onSelect, query, onQuery }) {
  const reduceMotion = useMedia('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 88,
          background: 'rgba(7,8,11,0.72)',
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: reduceMotion ? 'none' : 'opacity 0.26s ease',
        }}
      />
      {/* Sheet */}
      <div
        id="isg-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Template navigation"
        style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 92,
        maxHeight: '82vh',
        background: 'var(--bg-1)',
        borderTop: '1px solid var(--line-2)',
        borderRadius: '18px 18px 0 0',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: reduceMotion ? 'none' : 'transform 0.34s cubic-bezier(0.32, 0.72, 0, 1)',
        display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        visibility: open ? 'visible' : 'hidden',
      }}>
        {/* Drag handle */}
        <div style={{ padding: '14px 0 10px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 32, height: 4, borderRadius: 2, background: 'var(--bg-4)' }} />
        </div>
        {/* Sheet header */}
        <div style={{
          padding: '0 20px 12px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid var(--line)',
        }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>Templates</span>
          <button onClick={onClose} aria-label="Close navigation" className="gc gc-press" style={{
            background: 'var(--bg-3)', border: 'none', cursor: 'pointer',
            color: 'var(--ink-3)', width: 32, height: 32, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, lineHeight: 1,
          }}>×</button>
        </div>
        {/* Search */}
        {onQuery && (
          <div style={{ padding: '12px 20px 4px', flexShrink: 0 }}>
            <SearchBox value={query} onChange={onQuery} />
          </div>
        )}
        {/* Scrollable list */}
        <div style={{ overflowY: 'auto', padding: '6px 0 20px', flex: 1, WebkitOverflowScrolling: 'touch' }}>
          {groups.length === 0 && (
            <div style={{ padding: '12px 20px', fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--ink-4)' }}>No templates match “{query}”.</div>
          )}
          {groups.map((g) => (
            <div key={g.name} style={{ marginBottom: 4 }}>
              <div style={{
                fontFamily: 'var(--f-mono)', fontSize: 10.5, fontWeight: 500, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: 'var(--ink-4)',
                padding: '12px 20px 6px',
              }}>{g.name}</div>
              {g.items.map((it) => (
                <button key={it.id} onClick={() => { onSelect(it.id); onClose(); }}
                  className="gc gc-nav gc-press" data-active={it.id === active ? 'true' : 'false'}
                  style={{ padding: '12px 20px', fontSize: 16, minHeight: 48 }}
                  aria-current={it.id === active ? 'page' : undefined}>{it.name}</button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ── Mobile thumb-zone action bar ─────────────────────────────── */
function MobileActionBar({ onOpenNav, frames, frameIdx, onFrame, frameLabel }) {
  const many = frames.length > 1;
  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 70,
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 14px calc(10px + env(safe-area-inset-bottom, 0px))',
      background: 'var(--glass-bg)',
      backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
      borderTop: '1px solid var(--line)',
    }}>
      {/* Templates — primary action, thumb-reachable */}
      <button onClick={onOpenNav} aria-controls="isg-nav-drawer" className="gc gc-press" style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        minHeight: 44, padding: '0 16px',
        borderRadius: 'var(--r)', cursor: 'pointer',
        border: '1px solid var(--accent-line)',
        background: 'var(--accent-soft)', color: 'var(--accent)',
        fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
        flexShrink: 0,
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        Templates
      </button>

      {many && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end', minWidth: 0 }}>
          <button onClick={() => onFrame(frameIdx - 1)} disabled={frameIdx === 0}
            aria-label="Previous frame" className="gc gc-ghost gc-press"
            style={{ width: 44, height: 44 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9 2 L4 7 L9 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span style={{
            fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            maxWidth: 120, textAlign: 'center',
          }}>{frameLabel} · {frameIdx + 1}/{frames.length}</span>
          <button onClick={() => onFrame(frameIdx + 1)} disabled={frameIdx === frames.length - 1}
            aria-label="Next frame" className="gc gc-ghost gc-press"
            style={{ width: 44, height: 44 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M5 2 L10 7 L5 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

/* ── App ──────────────────────────────────────────────────────── */
function App() {
  const reg = window.ISG._reg;
  const groups = [];
  reg.forEach((e) => {
    let g = groups.find((x) => x.name === e.group);
    if (!g) { g = { name: e.group, items: [] }; groups.push(g); }
    g.items.push(e);
  });

  const [active, setActive]     = useState(reg[0] ? reg[0].id : null);
  const [theme, setTheme]       = useState(() => {
    try { const t = localStorage.getItem('isgTheme'); return t === 'light' ? 'light' : 'dark'; } catch (e) { return 'dark'; }
  });
  const [frameIdx, setFrameIdx] = useState(0);
  const [navOpen, setNavOpen]   = useState(false);
  const [query, setQuery]       = useState('');
  const [flow, setFlow]         = useState(() => { try { return localStorage.getItem('isgFlow') !== 'off'; } catch (e) { return true; } });

  /* Filtered template index for the rail / drawer search */
  const q = query.trim().toLowerCase();
  const fGroups = q
    ? groups.map((g) => ({ ...g, items: g.items.filter((it) => (it.name + ' ' + g.name + ' ' + (it.blurb || '')).toLowerCase().includes(q)) })).filter((g) => g.items.length)
    : groups;

  const isMobile = useMedia('(max-width: 767px)');
  const mainRef  = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('isgTheme', theme); } catch (e) {}
  }, [theme]);
  useEffect(() => {
    document.documentElement.setAttribute('data-flowlight', flow ? 'on' : 'off');
    try { localStorage.setItem('isgFlow', flow ? 'on' : 'off'); } catch (e) {}
  }, [flow]);

  const entry    = reg.find((e) => e.id === active) || reg[0];
  const showFlow = !!entry && (entry.id === 'diagram-kit' || entry.id === 'infographics-kit');
  const frames   = entry ? entry.frames : [];
  const frame    = frames[Math.min(frameIdx, frames.length - 1)] || frames[0];

  /* Flat ordered list for prev/next template pager */
  const flatIdx  = reg.findIndex((e) => e.id === (entry ? entry.id : null));
  const prevTpl  = flatIdx > 0 ? reg[flatIdx - 1] : null;
  const nextTpl  = flatIdx >= 0 && flatIdx < reg.length - 1 ? reg[flatIdx + 1] : null;

  useEffect(() => {
    setFrameIdx(0);
    /* Return reading position to the top of the new template */
    if (mainRef.current) mainRef.current.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [active]);
  useEffect(() => { if (!isMobile) setNavOpen(false); }, [isMobile]);

  const H = isMobile ? 52 : 56;

  return (
    <div className="isg-scope" style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div className="gl-mesh" />
      <Inspector />

      {/* Flow toggle — desktop fixed bottom-right only */}
      {showFlow && !isMobile && (
        <button onClick={() => setFlow((f) => !f)} title="Directional reading-glow" className="gc gc-press" style={{
          position: 'fixed', right: 22, bottom: 22, zIndex: 80,
          display: 'inline-flex', alignItems: 'center', gap: 9,
          fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.08em',
          padding: '9px 14px', cursor: 'pointer',
          borderRadius: 'var(--r-sm)',
          border: `1px solid ${flow ? 'var(--accent-line)' : 'var(--line-2)'}`,
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
          color: flow ? 'var(--accent)' : 'var(--ink-3)',
          boxShadow: 'var(--glass-shadow)',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: flow ? 'var(--accent)' : 'var(--ink-4)', boxShadow: flow ? '0 0 8px var(--accent)' : 'none' }} />
          FLOW · {flow ? 'ON' : 'OFF'}
        </button>
      )}

      {/* ── Header ───────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50, height: H, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobile ? '0 16px' : '0 24px',
        background: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
        borderBottom: '1px solid var(--line)',
      }}>
        {isMobile ? (
          /* ── Mobile header: identity left, utilities right.
                Primary navigation lives in the bottom thumb bar. ── */
          <>
            <span style={{
              fontFamily: 'var(--f-sans)', fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
              color: 'var(--ink)', flex: 1, minWidth: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              paddingRight: 10,
            }}>{entry ? entry.name : ''}</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {showFlow && (
                <button
                  onClick={() => setFlow((f) => !f)}
                  title={`Flow light: ${flow ? 'on' : 'off'}`}
                  className="gc gc-press"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 36, height: 36, borderRadius: 'var(--r-sm)',
                    border: `1px solid ${flow ? 'var(--accent-line)' : 'var(--line)'}`,
                    background: flow ? 'var(--accent-soft)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: flow ? 'var(--accent)' : 'var(--ink-4)', boxShadow: flow ? '0 0 6px var(--accent)' : 'none', display: 'block' }} />
                </button>
              )}
              <SegCompact value={theme} onChange={setTheme} options={[['dark', '☾'], ['light', '◯']]} />
            </div>
          </>
        ) : (
          /* ── Desktop header ── */
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '0.1em', color: 'var(--ink-2)' }}>TEMPLATE LIBRARY</span>
              <span style={{ color: 'var(--ink-4)' }}>/</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{entry ? entry.name : ''}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Seg value={theme} onChange={setTheme} options={[['dark', 'Dark'], ['light', 'Bright']]} />
            </div>
          </>
        )}
      </header>

      {/* Mobile drawer + thumb bar */}
      {isMobile && (
        <>
          <NavDrawer
            open={navOpen}
            onClose={() => setNavOpen(false)}
            groups={fGroups}
            query={query}
            onQuery={setQuery}
            active={active}
            onSelect={(id) => setActive(id)}
          />
          <MobileActionBar
            onOpenNav={() => setNavOpen(true)}
            frames={frames}
            frameIdx={Math.min(frameIdx, frames.length - 1)}
            onFrame={(i) => setFrameIdx(Math.max(0, Math.min(frames.length - 1, i)))}
            frameLabel={frame ? frame.label : ''}
          />
        </>
      )}

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div style={{
        display: isMobile ? 'flex' : 'grid',
        flexDirection: isMobile ? 'column' : undefined,
        gridTemplateColumns: isMobile ? undefined : '216px 1fr',
        flex: 1, minHeight: 0,
      }}>

        {/* Desktop left rail */}
        {!isMobile && (
          <nav aria-label="Templates" style={{
            borderRight: '1px solid var(--line)', padding: '16px 0 60px',
            background: 'color-mix(in srgb, var(--bg-1) 60%, transparent)',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            overflowY: 'auto', position: 'sticky', top: H, alignSelf: 'start', height: `calc(100vh - ${H}px)`,
          }}>
            <div style={{ padding: '4px 16px 12px' }}>
              <SearchBox value={query} onChange={setQuery} />
            </div>
            {fGroups.length === 0 && (
              <div style={{ padding: '12px 22px', fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.04em' }}>No templates match “{query}”.</div>
            )}
            {fGroups.map((g) => (
              <div key={g.name} style={{ marginBottom: 6 }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-4)', padding: '14px 22px 6px' }}>{g.name}</div>
                {g.items.map((it) => (
                  <button key={it.id} onClick={() => setActive(it.id)}
                    className="gc gc-nav" data-active={it.id === active ? 'true' : 'false'}
                    style={{ padding: '8px 22px', fontSize: 13.5, lineHeight: 1.45 }}
                    aria-current={it.id === active ? 'page' : undefined}>{it.name}</button>
                ))}
              </div>
            ))}
          </nav>
        )}

        {/* Main viewport */}
        <main ref={mainRef} style={{ overflowY: 'auto', height: isMobile ? undefined : `calc(100vh - ${H}px)`, flex: isMobile ? 1 : undefined }}>
          <div style={{
            maxWidth: 1340, margin: '0 auto',
            padding: isMobile ? '24px 16px 132px' : '40px 30px 120px',
          }}>
            {entry && (
              <>
                <div style={{ marginBottom: 8 }}>
                  <Eyebrow>{entry.group}</Eyebrow>
                </div>
                <h1 style={{
                  fontSize: 'clamp(23px, 3.2vw, 28px)',
                  fontWeight: 600, letterSpacing: '-0.022em', lineHeight: 1.15,
                  margin: '8px 0 8px', textWrap: 'balance',
                }}>{entry.name}</h1>
                <p style={{
                  color: 'var(--ink-2)',
                  fontSize: 16,
                  maxWidth: '62ch', lineHeight: 1.65, margin: 0, textWrap: 'pretty',
                }}>{entry.blurb}</p>

                {entry.interactive && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 9, marginTop: 16,
                    padding: '8px 14px', borderRadius: 999,
                    border: '1px solid var(--accent-line)', background: 'var(--accent-soft)',
                    color: 'var(--accent)', fontFamily: 'var(--f-mono)', fontSize: 11,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }} />
                    Interactive · click elements to inspect or follow links
                  </div>
                )}

                {/* Frame selector */}
                {frames.length > 1 && (
                  <div className="frame-chips" style={{
                    display: 'flex', gap: 6,
                    flexWrap: isMobile ? 'nowrap' : 'wrap',
                    overflowX: isMobile ? 'auto' : 'visible',
                    margin: '24px 0 4px',
                    paddingBottom: isMobile ? 4 : 0,
                    WebkitOverflowScrolling: 'touch',
                    scrollbarWidth: 'none',
                  }}>
                    {frames.map((f, i) => (
                      <button key={i} onClick={() => setFrameIdx(i)} aria-pressed={i === frameIdx}
                        className="gc gc-chip gc-press" data-active={i === frameIdx ? 'true' : 'false'}
                        style={{
                          fontSize: 10.5,
                          padding: '6px 12px',
                          minHeight: isMobile ? 44 : 36,
                        }}>{f.label}</button>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 24 }}>
                  {frame && (frame.mode === 'board' ? <BoardFrame frame={frame} /> : <FlowFrame frame={frame} />)}
                </div>

                <div style={{ marginTop: 12, fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.08em', color: 'var(--ink-4)' }}>
                  {frame ? `${frame.mode.toUpperCase()} · ${frame.w}${frame.mode === 'board' ? '×' + frame.h : 'w'} · scales to fit` : ''}
                </div>

                {/* Prev / next template pager */}
                {(prevTpl || nextTpl) && (
                  <div style={{
                    marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--line)',
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
                  }}>
                    {prevTpl ? (
                      <button onClick={() => setActive(prevTpl.id)} className="gc gc-pager gc-press">
                        <span className="gc-pager-dir">← Previous</span>
                        <span style={{ fontSize: 14.5, fontWeight: 500, letterSpacing: '-0.01em' }}>{prevTpl.name}</span>
                      </button>
                    ) : <span />}
                    {nextTpl ? (
                      <button onClick={() => setActive(nextTpl.id)} className="gc gc-pager gc-press" style={{ textAlign: 'right', alignItems: 'flex-end' }}>
                        <span className="gc-pager-dir">Next →</span>
                        <span style={{ fontSize: 14.5, fontWeight: 500, letterSpacing: '-0.01em' }}>{nextTpl.name}</span>
                      </button>
                    ) : <span />}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ── Segmented control — desktop (text labels) ───────────────── */
function Seg({ value, onChange, options }) {
  return (
    <div role="group" aria-label="Theme" style={{ display: 'inline-flex', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: 2, gap: 2 }}>
      {options.map(([v, lab]) => (
        <button key={v} onClick={() => onChange(v)} aria-pressed={v === value} className="gc gc-press" style={{
          fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.04em', padding: '5px 12px',
          borderRadius: 3, cursor: 'pointer', border: 'none',
          background: v === value ? 'var(--bg-4)' : 'transparent',
          color: v === value ? 'var(--ink)' : 'var(--ink-3)',
        }}>{lab}</button>
      ))}
    </div>
  );
}

/* ── Segmented control — mobile (icon/symbol labels) ─────────── */
function SegCompact({ value, onChange, options }) {
  return (
    <div role="group" aria-label="Theme" style={{ display: 'inline-flex', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: 2, gap: 2 }}>
      {options.map(([v, lab]) => (
        <button key={v} onClick={() => onChange(v)} aria-label={v === 'dark' ? 'Dark theme' : 'Bright theme'} aria-pressed={v === value} className="gc gc-press" style={{
          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, borderRadius: 3, cursor: 'pointer', border: 'none',
          background: v === value ? 'var(--bg-4)' : 'transparent',
          color: v === value ? 'var(--ink)' : 'var(--ink-3)',
        }}>{lab}</button>
      ))}
    </div>
  );
}

window.ISG.mount = function () {
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
};
