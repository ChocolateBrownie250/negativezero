/* ═══════════════════════════════════════════════════════════════
   ISG STUDIO — presentation EDITOR built on the template library.
   The template registry (window.ISG._reg) becomes a palette of
   pre-made, scalable ELEMENTS you assemble into a deck. Plus a set
   of editable "basic" blocks for authoring text slides.

   Features: element library · slide rail (add / drag-reorder /
   duplicate / delete) · scalable canvas · Dark + Bright themes ·
   inline text editing · Present mode (keyboard nav) · PDF export
   honoring the live theme · localStorage persistence.

   Lives in the same Babel block as lib/viz/gallery/tpl-* so it
   shares scope: Stage, Eyebrow, useMedia, React hooks are in scope.
   ═══════════════════════════════════════════════════════════════ */

/* ── FitBox — scale a fixed-size node to fit BOTH dims of its box ── */
function FitBox({ w, h, children, pad = 0, align = 'center', maxScale = 1 }) {
  const boxRef = useRef(null);
  const [s, setS] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      if (!boxRef.current) return;
      const cw = boxRef.current.clientWidth - pad * 2;
      const ch = boxRef.current.clientHeight - pad * 2;
      if (cw <= 0 || ch <= 0) return;
      setS(Math.min(cw / w, ch / h, maxScale));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (boxRef.current) ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [w, h, pad, maxScale]);
  return (
    <div ref={boxRef} style={{
      width: '100%', height: '100%', display: 'flex',
      alignItems: align === 'top' ? 'flex-start' : 'center',
      justifyContent: 'center', overflow: 'hidden',
    }}>
      <div style={{ width: w * s, height: h * s, flexShrink: 0 }}>
        <div style={{ width: w, height: h, transform: `scale(${s})`, transformOrigin: 'top left' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── EditText — uncontrolled contentEditable (no caret jump) ────── */
function EditText({ value, onChange, editing, style, placeholder, as = 'div', multiline }) {
  const ref = useRef(null);
  const Tag = as;
  useLayoutEffect(() => {
    if (ref.current && ref.current.innerText !== (value || '')) {
      ref.current.innerText = value || '';
    }
  }, [value, editing]);
  if (!editing) {
    return <Tag style={style}>{(value || '').split('\n').map((l, i) => (
      <React.Fragment key={i}>{i > 0 && <br />}{l}</React.Fragment>
    ))}</Tag>;
  }
  return (
    <Tag
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-ph={placeholder}
      onInput={(e) => onChange(e.currentTarget.innerText)}
      onKeyDown={(e) => {
        if (!multiline && e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        e.stopPropagation();
      }}
      className="st-edit"
      style={{ ...style, outline: 'none', cursor: 'text' }}
    />
  );
}

/* ════════════════════════════════════════════════════════════════
   BASIC BLOCKS — editable, scalable authoring slides (1920×1080).
   Each: { key, name, group, w, h, mode, defaults, Render }.
   Render({ c, set, editing }) where c=content, set(field,val).
   ════════════════════════════════════════════════════════════════ */
const BLOCK_W = 1920, BLOCK_H = 1080;

function BlockShell({ children, pad = '120px 150px', accentGlow = true }) {
  return (
    <div className="isg-scope" style={{
      width: BLOCK_W, height: BLOCK_H, background: 'var(--bg)', color: 'var(--ink)',
      padding: pad, position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'var(--tx-grain)', backgroundSize: '160px 160px', opacity: 0.4, mixBlendMode: 'overlay', pointerEvents: 'none' }} />
      {accentGlow && <div style={{ position: 'absolute', top: -260, right: -160, width: 900, height: 700, background: 'radial-gradient(circle, var(--accent-soft), transparent 70%)', filter: 'blur(60px)', opacity: 0.7, pointerEvents: 'none' }} />}
      {children}
    </div>
  );
}

const BASICS = [
  {
    key: 'basic:title', name: 'Title', group: 'Basics',
    defaults: { eyebrow: 'CONFIDENTIAL · 2026', title: 'Project Atlas', accent: 'Technology review', sub: 'A clear, scalable starting point for the deck.', foot: 'ISG · Information Services Group' },
    Render: ({ c, set, editing }) => (
      <BlockShell>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontFamily: 'var(--f-mono)', fontSize: 24, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--accent)' }}>
          <span style={{ width: 44, height: 2, background: 'var(--accent)' }} />
          <EditText as="span" value={c.eyebrow} onChange={(v) => set('eyebrow', v)} editing={editing} placeholder="Eyebrow" />
        </div>
        <div style={{ marginTop: 'auto' }}>
          <EditText as="h1" value={c.title} onChange={(v) => set('title', v)} editing={editing} placeholder="Title"
            style={{ fontSize: 124, fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 0.98, margin: 0 }} />
          <EditText as="div" value={c.accent} onChange={(v) => set('accent', v)} editing={editing} placeholder="Accent line"
            style={{ fontSize: 124, fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1.0, margin: 0, color: 'var(--accent)' }} />
        </div>
        <EditText as="p" value={c.sub} onChange={(v) => set('sub', v)} editing={editing} placeholder="Subtitle" multiline
          style={{ fontSize: 34, lineHeight: 1.5, color: 'var(--ink-2)', maxWidth: '54ch', margin: '40px 0 0' }} />
        <div style={{ marginTop: 'auto', paddingTop: 60, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--f-mono)', fontSize: 22, letterSpacing: '0.06em', color: 'var(--ink-3)' }}>
          <EditText as="span" value={c.foot} onChange={(v) => set('foot', v)} editing={editing} placeholder="Footer" />
          <span style={{ color: 'var(--ink-4)' }}>01</span>
        </div>
      </BlockShell>
    ),
  },
  {
    key: 'basic:section', name: 'Section divider', group: 'Basics',
    defaults: { num: '02', kicker: 'SECTION', title: 'Architecture & platform', sub: 'How the system is built, deployed, and scaled.' },
    Render: ({ c, set, editing }) => (
      <BlockShell pad="120px 150px">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 60, margin: 'auto 0' }}>
          <EditText as="div" value={c.num} onChange={(v) => set('num', v)} editing={editing} placeholder="00"
            style={{ fontSize: 300, fontWeight: 600, lineHeight: 0.8, letterSpacing: '-0.04em', color: 'var(--accent)', fontFamily: 'var(--f-mono)' }} />
          <div style={{ paddingTop: 30 }}>
            <EditText as="div" value={c.kicker} onChange={(v) => set('kicker', v)} editing={editing} placeholder="KICKER"
              style={{ fontFamily: 'var(--f-mono)', fontSize: 24, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 24 }} />
            <EditText as="h1" value={c.title} onChange={(v) => set('title', v)} editing={editing} placeholder="Section title"
              style={{ fontSize: 92, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.02, margin: 0, maxWidth: '16ch' }} />
            <EditText as="p" value={c.sub} onChange={(v) => set('sub', v)} editing={editing} placeholder="Supporting line" multiline
              style={{ fontSize: 32, lineHeight: 1.5, color: 'var(--ink-2)', maxWidth: '40ch', margin: '36px 0 0' }} />
          </div>
        </div>
      </BlockShell>
    ),
  },
  {
    key: 'basic:statement', name: 'Statement', group: 'Basics',
    defaults: { quote: 'The separation of collector and contract is what makes the platform portable across every deployment surface.', who: 'Engineering principle', role: 'Platform architecture' },
    Render: ({ c, set, editing }) => (
      <BlockShell pad="140px 170px">
        <div style={{ margin: 'auto 0', maxWidth: '24ch' }}>
          <div style={{ fontSize: 160, lineHeight: 0.6, color: 'var(--accent)', fontWeight: 700, height: 90 }}>“</div>
          <EditText as="blockquote" value={c.quote} onChange={(v) => set('quote', v)} editing={editing} placeholder="Statement" multiline
            style={{ fontSize: 66, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.18, margin: 0 }} />
          <div style={{ marginTop: 56, display: 'flex', alignItems: 'center', gap: 18 }}>
            <span style={{ width: 40, height: 2, background: 'var(--accent)' }} />
            <div>
              <EditText as="div" value={c.who} onChange={(v) => set('who', v)} editing={editing} placeholder="Attribution"
                style={{ fontSize: 28, fontWeight: 600 }} />
              <EditText as="div" value={c.role} onChange={(v) => set('role', v)} editing={editing} placeholder="Role"
                style={{ fontSize: 22, color: 'var(--ink-3)', fontFamily: 'var(--f-mono)', letterSpacing: '0.04em', marginTop: 4 }} />
            </div>
          </div>
        </div>
      </BlockShell>
    ),
  },
  {
    key: 'basic:bullets', name: 'Title + points', group: 'Basics',
    defaults: { kicker: 'OVERVIEW', title: 'What we evaluated', items: 'Architecture & data flow\nDeployment topology & scale\nSecurity posture & trust zones\nTeam, velocity & roadmap' },
    Render: ({ c, set, editing }) => {
      const items = (c.items || '').split('\n').filter((x) => editing || x.trim());
      return (
        <BlockShell pad="120px 150px">
          <EditText as="div" value={c.kicker} onChange={(v) => set('kicker', v)} editing={editing} placeholder="KICKER"
            style={{ fontFamily: 'var(--f-mono)', fontSize: 24, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 20 }} />
          <EditText as="h1" value={c.title} onChange={(v) => set('title', v)} editing={editing} placeholder="Title"
            style={{ fontSize: 78, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.04, margin: '0 0 56px', maxWidth: '20ch' }} />
          {editing ? (
            <EditText as="div" value={c.items} onChange={(v) => set('items', v)} editing={editing} placeholder="One point per line" multiline
              style={{ fontSize: 40, lineHeight: 1.7, color: 'var(--ink)', maxWidth: '34ch' }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              {items.map((it, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 28 }}>
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 26, color: 'var(--accent)', minWidth: 46 }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ fontSize: 44, lineHeight: 1.3, letterSpacing: '-0.01em' }}>{it}</span>
                </div>
              ))}
            </div>
          )}
        </BlockShell>
      );
    },
  },
  {
    key: 'basic:closing', name: 'Closing', group: 'Basics',
    defaults: { title: 'Thank you', sub: 'Questions and next steps', a: 'team@isg-one.com', b: 'isg-one.com' },
    Render: ({ c, set, editing }) => (
      <BlockShell pad="140px 150px">
        <div style={{ margin: 'auto 0' }}>
          <EditText as="h1" value={c.title} onChange={(v) => set('title', v)} editing={editing} placeholder="Closing"
            style={{ fontSize: 150, fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 0.95, margin: 0 }} />
          <EditText as="p" value={c.sub} onChange={(v) => set('sub', v)} editing={editing} placeholder="Subtitle"
            style={{ fontSize: 38, color: 'var(--ink-2)', margin: '28px 0 0' }} />
        </div>
        <div style={{ marginTop: 'auto', paddingTop: 50, borderTop: '1px solid var(--line)', display: 'flex', gap: 70, fontFamily: 'var(--f-mono)', fontSize: 26, letterSpacing: '0.04em' }}>
          <EditText as="span" value={c.a} onChange={(v) => set('a', v)} editing={editing} placeholder="contact" style={{ color: 'var(--accent)' }} />
          <EditText as="span" value={c.b} onChange={(v) => set('b', v)} editing={editing} placeholder="url" style={{ color: 'var(--ink-3)' }} />
        </div>
      </BlockShell>
    ),
  },
];
const BASIC_BY_KEY = Object.fromEntries(BASICS.map((b) => [b.key, b]));

/* ── CATALOG — flatten registry frames into insertable elements ── */
function buildCatalog() {
  const out = [];
  (window.ISG._reg || []).forEach((e) => {
    (e.frames || []).forEach((f, i) => {
      out.push({
        key: `tpl:${e.id}:${i}`, kind: 'tpl', srcId: e.id, frameIdx: i,
        group: e.group, name: e.frames.length > 1 && f.label && f.label !== '—' ? f.label : e.name,
        sub: e.frames.length > 1 ? e.name : e.blurb,
        mode: f.mode, w: f.w, h: f.h, node: f.node,
      });
    });
  });
  return out;
}

/* ── Render any slide (basic or template) at native size ───────── */
function SlideContent({ slide, editing, onField }) {
  if (slide.kind === 'basic') {
    const def = BASIC_BY_KEY[slide.key];
    if (!def) return null;
    return def.Render({ c: slide.content || def.defaults, set: (f, v) => onField(f, v), editing });
  }
  const el = CATALOG_BY_KEY[slide.key];
  if (!el) return <MissingSlide />;
  return el.node;
}
function MissingSlide() {
  return (
    <div style={{ width: BLOCK_W, height: BLOCK_H, background: 'var(--bg-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-4)', fontFamily: 'var(--f-mono)', letterSpacing: '0.1em' }}>
      ELEMENT UNAVAILABLE
    </div>
  );
}

/* slide dims */
function slideDims(slide) {
  if (slide.kind === 'basic') return { w: BLOCK_W, h: BLOCK_H, mode: 'board' };
  const el = CATALOG_BY_KEY[slide.key];
  if (!el) return { w: BLOCK_W, h: BLOCK_H, mode: 'board' };
  return { w: el.w, h: el.h, mode: el.mode };
}

let CATALOG = [];
let CATALOG_BY_KEY = {};

/* ════════════════════════════════════════════════════════════════
   ELEMENT LIBRARY — right panel. Grouped, searchable, click to add.
   Shows a live preview of the highlighted element.
   ════════════════════════════════════════════════════════════════ */
function ElementLibrary({ onAdd, onClose }) {
  const [q, setQ] = useState('');
  const all = useMemo(() => {
    const basics = BASICS.map((b) => ({ key: b.key, kind: 'basic', group: 'Basics', name: b.name, sub: 'Editable text slide', mode: 'board', w: BLOCK_W, h: BLOCK_H }));
    return [...basics, ...CATALOG];
  }, []);
  const filtered = all.filter((e) => !q || (e.name + ' ' + e.group + ' ' + (e.sub || '')).toLowerCase().includes(q.toLowerCase()));
  const groups = [];
  filtered.forEach((e) => {
    let g = groups.find((x) => x.name === e.group);
    if (!g) { g = { name: e.group, items: [] }; groups.push(g); }
    g.items.push(e);
  });
  const [hover, setHover] = useState(null);
  const previewKey = hover || (filtered[0] && filtered[0].key);
  const previewEl = previewKey && (BASIC_BY_KEY[previewKey] ? { kind: 'basic', key: previewKey } : CATALOG_BY_KEY[previewKey]);

  return (
    <aside className="st-lib">
      <div className="st-lib-head">
        <div className="st-eyebrow">Elements</div>
        <button className="st-icon" onClick={onClose} title="Close">✕</button>
      </div>
      <div className="st-lib-search">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search elements…" className="st-search" />
      </div>
      <div className="st-lib-preview">
        {previewEl && (
          <div className="st-lib-preview-frame">
            <FitBox w={previewEl.kind === 'basic' ? BLOCK_W : previewEl.w} h={previewEl.kind === 'basic' ? BLOCK_H : previewEl.h}>
              {previewEl.kind === 'basic'
                ? BASIC_BY_KEY[previewEl.key].Render({ c: BASIC_BY_KEY[previewEl.key].defaults, set: () => {}, editing: false })
                : previewEl.node}
            </FitBox>
          </div>
        )}
      </div>
      <div className="st-lib-list">
        {groups.map((g) => (
          <div key={g.name} className="st-lib-group">
            <div className="st-lib-group-name">{g.name}</div>
            {g.items.map((e) => (
              <button key={e.key} className="st-lib-item" onMouseEnter={() => setHover(e.key)} onFocus={() => setHover(e.key)}
                onClick={() => onAdd(e.key, e.kind)}>
                <span className="st-lib-item-badge" data-mode={e.mode}>{e.mode === 'board' ? '▭' : '▤'}</span>
                <span className="st-lib-item-text">
                  <span className="st-lib-item-name">{e.name}</span>
                  {e.sub && <span className="st-lib-item-sub">{e.sub}</span>}
                </span>
                <span className="st-lib-item-add">+</span>
              </button>
            ))}
          </div>
        ))}
        {filtered.length === 0 && <div className="st-empty">No elements match “{q}”.</div>}
      </div>
    </aside>
  );
}

/* ════════════════════════════════════════════════════════════════
   SLIDE RAIL — left. Thumbnails, drag-reorder, select, context acts.
   ════════════════════════════════════════════════════════════════ */
function SlideRail({ deck, current, onSelect, onReorder, onDup, onDel, onAddClick }) {
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  return (
    <aside className="st-rail">
      <div className="st-rail-head">
        <span className="st-eyebrow">Slides</span>
        <span className="st-rail-count">{deck.length}</span>
      </div>
      <div className="st-rail-list">
        {deck.map((slide, i) => {
          const d = slideDims(slide);
          return (
            <div key={slide.uid}
              className={'st-thumb' + (i === current ? ' is-current' : '') + (over === i ? ' is-over' : '')}
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => { e.preventDefault(); setOver(i); }}
              onDragLeave={() => setOver((o) => (o === i ? null : o))}
              onDrop={(e) => { e.preventDefault(); if (drag !== null && drag !== i) onReorder(drag, i); setDrag(null); setOver(null); }}
              onDragEnd={() => { setDrag(null); setOver(null); }}
              onClick={() => onSelect(i)}>
              <span className="st-thumb-num">{String(i + 1).padStart(2, '0')}</span>
              <div className="st-thumb-frame">
                <FitBox w={d.w} h={d.h} align={d.mode === 'flow' ? 'top' : 'center'}>
                  <SlideContent slide={slide} editing={false} onField={() => {}} />
                </FitBox>
              </div>
              <div className="st-thumb-acts">
                <button className="st-mini" title="Duplicate" onClick={(e) => { e.stopPropagation(); onDup(i); }}>⧉</button>
                <button className="st-mini" title="Delete" onClick={(e) => { e.stopPropagation(); onDel(i); }}>✕</button>
              </div>
            </div>
          );
        })}
        <button className="st-thumb-add" onClick={onAddClick}>+ Add slide</button>
      </div>
    </aside>
  );
}

/* ════════════════════════════════════════════════════════════════
   CANVAS — center. Current slide, scaled to fit, editable in place.
   ════════════════════════════════════════════════════════════════ */
function Canvas({ slide, editing, onField }) {
  if (!slide) {
    return <div className="st-canvas-empty"><div>Add an element to begin →</div></div>;
  }
  const d = slideDims(slide);
  return (
    <div className="st-canvas-wrap">
      <div className="st-canvas-card" style={{ aspectRatio: `${d.w} / ${d.h}` }}>
        <FitBox w={d.w} h={d.h} align={d.mode === 'flow' ? 'top' : 'center'}>
          <SlideContent slide={slide} editing={editing} onField={onField} />
        </FitBox>
      </div>
      <div className="st-canvas-meta">
        {slide.kind === 'basic' ? 'EDITABLE BLOCK' : (CATALOG_BY_KEY[slide.key] ? CATALOG_BY_KEY[slide.key].group.toUpperCase() : '')}
        {' · '}{d.w}{d.mode === 'board' ? '×' + d.h : 'w'} · scales to fit
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   PRESENT — fullscreen, keyboard nav, scaled to viewport.
   ════════════════════════════════════════════════════════════════ */
function Present({ deck, start, onExit }) {
  const [i, setI] = useState(start || 0);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); setI((x) => Math.min(deck.length - 1, x + 1)); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
      else if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deck.length, onExit]);
  const slide = deck[i];
  const d = slide ? slideDims(slide) : { w: BLOCK_W, h: BLOCK_H, mode: 'board' };
  return (
    <div className="st-present">
      <div className="st-present-stage">
        {slide && (
          <FitBox w={d.w} h={d.h} align={d.mode === 'flow' ? 'top' : 'center'}>
            <SlideContent slide={slide} editing={false} onField={() => {}} />
          </FitBox>
        )}
      </div>
      <div className="st-present-bar">
        <button className="st-present-btn" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0}>←</button>
        <span className="st-present-count">{i + 1} / {deck.length}</span>
        <button className="st-present-btn" onClick={() => setI((x) => Math.min(deck.length - 1, x + 1))} disabled={i === deck.length - 1}>→</button>
        <button className="st-present-btn st-present-exit" onClick={onExit}>Esc ✕</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   PRINT DECK — flat pages, per-page @page sizing, then print().
   Honors the live theme (rendered inside current data-theme).
   ════════════════════════════════════════════════════════════════ */
function PrintDeck({ deck, onDone }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const root = ref.current;
    const paginate = () => {
      if (!root) return;
      const els = root.querySelectorAll('.st-print-page');
      let css = '';
      els.forEach((el, i) => {
        const w = Math.max(1, Math.round(el.firstChild.offsetWidth));
        const h = Math.max(1, Math.ceil(el.firstChild.offsetHeight));
        el.style.width = w + 'px'; el.style.height = h + 'px';
        css += `@page p${i}{size:${w}px ${h}px;margin:0}\n.st-print-page[data-p="${i}"]{page:p${i}}\n`;
      });
      let st = document.getElementById('st-dyn-pages');
      if (!st) { st = document.createElement('style'); st.id = 'st-dyn-pages'; document.head.appendChild(st); }
      st.textContent = css;
    };
    paginate();
    let done = false;
    const go = async () => {
      try { await document.fonts.ready; } catch (e) {}
      paginate();
      await new Promise((r) => setTimeout(r, 350));
      if (done) return; done = true;
      window.print();
    };
    go();
    const after = () => { document.documentElement.removeAttribute('data-studio-printing'); onDone(); };
    window.addEventListener('afterprint', after, { once: true });
    document.documentElement.setAttribute('data-studio-printing', '');
    return () => window.removeEventListener('afterprint', after);
  }, []);
  return (
    <div className="st-print-stack" ref={ref}>
      {deck.map((slide, i) => {
        const d = slideDims(slide);
        return (
          <div className="st-print-page" data-p={i} key={slide.uid}
            style={{ width: d.w, height: d.mode === 'board' ? d.h : undefined }}>
            <div style={{ width: d.w, height: d.mode === 'board' ? d.h : undefined }}>
              <SlideContent slide={slide} editing={false} onField={() => {}} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TOP BAR
   ════════════════════════════════════════════════════════════════ */
function TopBar({ title, onTitle, theme, onTheme, editing, onToggleEdit, onPresent, onExport, canPresent }) {
  return (
    <header className="st-top">
      <div className="st-top-left">
        <div className="st-logo"><span className="st-logo-mark">◆</span> ISG <b>Studio</b></div>
        <span className="st-top-div" />
        <input className="st-title" value={title} onChange={(e) => onTitle(e.target.value)} spellCheck={false} />
      </div>
      <div className="st-top-right">
        <button className={'st-btn' + (editing ? ' is-on' : '')} onClick={onToggleEdit} title="Toggle text editing">
          {editing ? '● Editing text' : '✎ Edit text'}
        </button>
        <div className="st-seg">
          {[['dark', 'Dark'], ['light', 'Bright']].map(([v, l]) => (
            <button key={v} className={'st-seg-btn' + (theme === v ? ' is-on' : '')} onClick={() => onTheme(v)}>{l}</button>
          ))}
        </div>
        <button className="st-btn" onClick={onExport} disabled={!canPresent} title="Export deck to PDF (current theme)">⤓ PDF</button>
        <button className="st-btn st-btn-accent" onClick={onPresent} disabled={!canPresent}>▷ Present</button>
      </div>
    </header>
  );
}

/* ════════════════════════════════════════════════════════════════
   EDITOR APP
   ════════════════════════════════════════════════════════════════ */
const STORE_KEY = 'isgStudioState_v1';

function defaultDeck() {
  return [
    { uid: stUid(), kind: 'basic', key: 'basic:title', content: { ...BASIC_BY_KEY['basic:title'].defaults } },
    { uid: stUid(), kind: 'basic', key: 'basic:bullets', content: { ...BASIC_BY_KEY['basic:bullets'].defaults } },
  ];
}
function stUid() { return 'sl' + Math.random().toString(36).slice(2, 9); }

function EditorApp() {
  CATALOG = useMemo(() => buildCatalog(), []);
  CATALOG_BY_KEY = useMemo(() => Object.fromEntries(CATALOG.map((e) => [e.key, e])), [CATALOG]);

  const [hydrated, setHydrated] = useState(false);
  const [title, setTitle] = useState('Untitled deck');
  const [theme, setTheme] = useState('dark');
  const [deck, setDeck] = useState([]);
  const [current, setCurrent] = useState(0);
  const [editing, setEditing] = useState(false);
  const [libOpen, setLibOpen] = useState(true);
  const [mode, setMode] = useState('edit'); // edit | present | print

  /* hydrate */
  useEffect(() => {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) {}
    if (s && Array.isArray(s.deck) && s.deck.length) {
      setTitle(s.title || 'Untitled deck');
      setTheme(s.theme === 'light' ? 'light' : 'dark');
      setDeck(s.deck);
      setCurrent(Math.min(s.current || 0, s.deck.length - 1));
    } else {
      setDeck(defaultDeck());
    }
    setHydrated(true);
  }, []);

  /* persist */
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ title, theme, deck, current })); } catch (e) {}
  }, [title, theme, deck, current, hydrated]);

  /* theme → DOM */
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  const addSlide = (key, kind) => {
    const slide = kind === 'basic'
      ? { uid: stUid(), kind: 'basic', key, content: { ...BASIC_BY_KEY[key].defaults } }
      : { uid: stUid(), kind: 'tpl', key };
    setDeck((d) => {
      const next = [...d];
      next.splice(current + 1, 0, slide);
      return next;
    });
    setCurrent((c) => Math.min(c + 1, deck.length));
  };
  const reorder = (from, to) => setDeck((d) => {
    const next = [...d]; const [m] = next.splice(from, 1); next.splice(to, 0, m);
    setCurrent(to); return next;
  });
  const dup = (i) => setDeck((d) => {
    const copy = { ...d[i], uid: stUid(), content: d[i].content ? { ...d[i].content } : undefined };
    const next = [...d]; next.splice(i + 1, 0, copy); return next;
  });
  const del = (i) => setDeck((d) => {
    if (d.length <= 1) return d;
    const next = d.filter((_, x) => x !== i);
    setCurrent((c) => Math.max(0, Math.min(c, next.length - 1)));
    return next;
  });
  const setField = (field, val) => setDeck((d) => d.map((s, i) =>
    i === current ? { ...s, content: { ...(s.content || BASIC_BY_KEY[s.key].defaults), [field]: val } } : s));

  if (!hydrated) return null;
  const slide = deck[current];
  const slideIsBasic = slide && slide.kind === 'basic';

  if (mode === 'present') {
    return <><StudioStyles /><Present deck={deck} start={current} onExit={() => setMode('edit')} /></>;
  }

  return (
    <div className="st-app">
      <StudioStyles />
      {mode === 'print' && <PrintDeck deck={deck} onDone={() => setMode('edit')} />}
      <TopBar
        title={title} onTitle={setTitle}
        theme={theme} onTheme={setTheme}
        editing={editing && slideIsBasic}
        onToggleEdit={() => setEditing((e) => !e)}
        onPresent={() => setMode('present')}
        onExport={() => setMode('print')}
        canPresent={deck.length > 0}
      />
      <div className="st-body">
        <SlideRail
          deck={deck} current={current}
          onSelect={setCurrent} onReorder={reorder} onDup={dup} onDel={del}
          onAddClick={() => setLibOpen(true)}
        />
        <main className="st-main">
          {editing && slideIsBasic && (
            <div className="st-edit-hint">Editing text — click any text on the slide to change it. <button onClick={() => setEditing(false)}>Done</button></div>
          )}
          {editing && slide && !slideIsBasic && (
            <div className="st-edit-hint st-edit-hint-muted">This is a pre-made template element — text editing applies to <b>Basic</b> blocks. Insert one from Elements to author your own copy.</div>
          )}
          <Canvas slide={slide} editing={editing && slideIsBasic} onField={setField} />
        </main>
        {libOpen
          ? <ElementLibrary onAdd={addSlide} onClose={() => setLibOpen(false)} />
          : <button className="st-lib-reopen" onClick={() => setLibOpen(true)}>＋ Elements</button>}
      </div>
    </div>
  );
}

const { useMemo } = React;

/* ════════════════════════════════════════════════════════════════
   STUDIO CHROME + PRINT STYLES
   ════════════════════════════════════════════════════════════════ */
function StudioStyles() {
  return <style>{`
  .st-app { height: 100vh; display: flex; flex-direction: column; background: var(--bg); color: var(--ink); overflow: hidden; }
  .st-eyebrow { font-family: var(--f-mono); font-size: 10.5px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-4); }

  /* Top bar */
  .st-top { height: 56px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
    padding: 0 16px; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--bg-1) 70%, transparent);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); position: relative; z-index: 20; }
  .st-top-left, .st-top-right { display: flex; align-items: center; gap: 12px; }
  .st-logo { font-size: 15px; letter-spacing: -0.01em; font-weight: 500; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
  .st-logo b { font-weight: 600; }
  .st-logo-mark { color: var(--accent); font-size: 13px; }
  .st-top-div { width: 1px; height: 22px; background: var(--line-2); }
  .st-title { background: transparent; border: 1px solid transparent; border-radius: var(--r-sm); color: var(--ink);
    font-family: var(--f-sans); font-size: 14px; font-weight: 500; padding: 6px 10px; min-width: 200px; outline: none; }
  .st-title:hover { border-color: var(--line-2); }
  .st-title:focus { border-color: var(--accent-line); background: var(--bg-2); }

  .st-btn { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 14px; border-radius: var(--r-sm);
    border: 1px solid var(--line-2); background: var(--bg-2); color: var(--ink-2); font-family: var(--f-sans); font-size: 13px;
    font-weight: 500; cursor: pointer; white-space: nowrap; transition: background .15s, color .15s, border-color .15s, transform .08s; }
  .st-btn:hover { background: var(--bg-3); color: var(--ink); }
  .st-btn:active { transform: scale(0.97); }
  .st-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .st-btn.is-on { border-color: var(--accent-line); color: var(--accent); background: var(--accent-soft); }
  .st-btn-accent { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
  .st-btn-accent:hover { background: var(--accent); filter: brightness(1.08); color: var(--accent-ink); }

  .st-seg { display: inline-flex; background: var(--bg-2); border: 1px solid var(--line-2); border-radius: var(--r-sm); padding: 2px; gap: 2px; }
  .st-seg-btn { border: none; background: transparent; color: var(--ink-3); font-family: var(--f-sans); font-size: 12.5px; font-weight: 500;
    padding: 5px 12px; border-radius: 4px; cursor: pointer; transition: background .15s, color .15s; }
  .st-seg-btn.is-on { background: var(--bg-4); color: var(--ink); }

  /* Body grid */
  .st-body { flex: 1; min-height: 0; display: flex; }

  /* Slide rail */
  .st-rail { width: 220px; flex-shrink: 0; border-right: 1px solid var(--line); background: color-mix(in srgb, var(--bg-1) 50%, transparent);
    display: flex; flex-direction: column; }
  .st-rail-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 8px; }
  .st-rail-count { font-family: var(--f-mono); font-size: 11px; color: var(--ink-4); }
  .st-rail-list { flex: 1; overflow-y: auto; padding: 4px 12px 24px; display: flex; flex-direction: column; gap: 8px; }
  .st-thumb { position: relative; display: flex; gap: 8px; align-items: stretch; cursor: pointer; border-radius: var(--r-md);
    padding: 4px; border: 1px solid transparent; transition: background .12s, border-color .12s; }
  .st-thumb:hover { background: var(--bg-2); }
  .st-thumb.is-current { border-color: var(--accent-line); background: var(--accent-soft); }
  .st-thumb.is-over { border-color: var(--accent); }
  .st-thumb-num { font-family: var(--f-mono); font-size: 10px; color: var(--ink-4); width: 18px; padding-top: 2px; flex-shrink: 0; }
  .st-thumb.is-current .st-thumb-num { color: var(--accent); }
  .st-thumb-frame { flex: 1; aspect-ratio: 16 / 9; border-radius: var(--r-sm); overflow: hidden; border: 1px solid var(--line);
    background: var(--bg); pointer-events: none; }
  .st-thumb-acts { position: absolute; top: 6px; right: 6px; display: none; gap: 4px; }
  .st-thumb:hover .st-thumb-acts { display: flex; }
  .st-mini { width: 22px; height: 22px; border-radius: 5px; border: 1px solid var(--line-2); background: var(--bg-3);
    color: var(--ink-2); font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
  .st-mini:hover { background: var(--bg-4); color: var(--ink); }
  .st-thumb-add { margin-top: 4px; height: 38px; border: 1px dashed var(--line-2); border-radius: var(--r-md); background: transparent;
    color: var(--ink-3); font-family: var(--f-sans); font-size: 13px; cursor: pointer; transition: border-color .15s, color .15s, background .15s; }
  .st-thumb-add:hover { border-color: var(--accent-line); color: var(--accent); background: var(--accent-soft); }

  /* Main / canvas */
  .st-main { flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative;
    background:
      radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--accent) 6%, transparent), transparent 60%),
      var(--bg); }
  .st-canvas-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 34px 40px 18px; gap: 12px; }
  .st-canvas-card { max-width: 100%; max-height: 100%; width: min(100%, calc((100vh - 220px) * 16 / 9));
    border: 1px solid var(--line); border-radius: var(--r-lg); overflow: hidden; box-shadow: var(--elev-2, 0 20px 60px rgba(0,0,0,.4));
    background: var(--bg); }
  .st-canvas-meta { font-family: var(--f-mono); font-size: 10px; letter-spacing: 0.1em; color: var(--ink-4); text-transform: uppercase; }
  .st-canvas-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--ink-4); font-family: var(--f-mono); letter-spacing: 0.1em; }

  .st-edit-hint { flex-shrink: 0; margin: 12px 40px 0; padding: 9px 14px; border-radius: var(--r-md); background: var(--accent-soft);
    border: 1px solid var(--accent-line); color: var(--accent); font-size: 13px; display: flex; align-items: center; justify-content: space-between; }
  .st-edit-hint button { background: var(--accent); color: var(--accent-ink); border: none; border-radius: var(--r-sm); padding: 4px 12px; font-size: 12px; cursor: pointer; font-weight: 500; }
  .st-edit-hint-muted { background: var(--bg-2); border-color: var(--line-2); color: var(--ink-2); }
  .st-edit-hint-muted b { color: var(--ink); }

  /* Inline editable text affordance */
  .st-edit { border-radius: 4px; transition: box-shadow .12s, background .12s; }
  .st-edit:hover { box-shadow: 0 0 0 1px var(--accent-line); }
  .st-edit:focus { box-shadow: 0 0 0 2px var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
  .st-edit:empty:before { content: attr(data-ph); color: var(--ink-4); opacity: 0.6; }

  /* Element library */
  .st-lib { width: 320px; flex-shrink: 0; border-left: 1px solid var(--line); background: color-mix(in srgb, var(--bg-1) 60%, transparent);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; flex-direction: column; }
  .st-lib-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 10px; }
  .st-icon { width: 28px; height: 28px; border-radius: 6px; border: 1px solid transparent; background: transparent; color: var(--ink-3);
    cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; }
  .st-icon:hover { background: var(--bg-3); color: var(--ink); }
  .st-lib-search { padding: 0 16px 12px; }
  .st-search { width: 100%; height: 36px; padding: 0 12px; background: var(--bg-2); border: 1px solid var(--line-2);
    border-radius: var(--r-sm); color: var(--ink); font-family: var(--f-sans); font-size: 13px; outline: none; }
  .st-search:focus { border-color: var(--accent-line); }
  .st-lib-preview { padding: 0 16px 12px; flex-shrink: 0; }
  .st-lib-preview-frame { aspect-ratio: 16 / 9; border: 1px solid var(--line); border-radius: var(--r-md); overflow: hidden; background: var(--bg); }
  .st-lib-list { flex: 1; overflow-y: auto; padding: 4px 10px 30px; }
  .st-lib-group-name { font-family: var(--f-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--ink-4); padding: 14px 8px 6px; }
  .st-lib-item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: var(--r-md); border: 1px solid transparent;
    background: transparent; cursor: pointer; text-align: left; transition: background .12s, border-color .12s; }
  .st-lib-item:hover { background: var(--bg-2); border-color: var(--line); }
  .st-lib-item-badge { width: 24px; height: 24px; flex-shrink: 0; border-radius: 5px; background: var(--bg-3); color: var(--ink-3);
    display: flex; align-items: center; justify-content: center; font-size: 11px; }
  .st-lib-item[data-mode] .st-lib-item-badge { }
  .st-lib-item-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .st-lib-item-name { font-size: 13px; font-weight: 500; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .st-lib-item-sub { font-size: 11px; color: var(--ink-4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .st-lib-item-add { color: var(--ink-4); font-size: 16px; opacity: 0; flex-shrink: 0; }
  .st-lib-item:hover .st-lib-item-add { opacity: 1; color: var(--accent); }
  .st-empty { padding: 24px 14px; color: var(--ink-4); font-size: 13px; }
  .st-lib-reopen { position: absolute; bottom: 24px; right: 24px; z-index: 15; height: 40px; padding: 0 18px; border-radius: 999px;
    background: var(--accent); color: var(--accent-ink); border: none; font-family: var(--f-sans); font-size: 13px; font-weight: 500;
    cursor: pointer; box-shadow: var(--elev-1); }

  /* Present mode */
  .st-present { position: fixed; inset: 0; z-index: 100; background: #000; display: flex; flex-direction: column; }
  .st-present-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
  .st-present-bar { position: absolute; bottom: 22px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 10px;
    background: rgba(20,22,28,0.82); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); border-radius: 999px; padding: 7px 10px;
    opacity: 0.25; transition: opacity .2s; }
  .st-present:hover .st-present-bar { opacity: 1; }
  .st-present-btn { height: 32px; min-width: 36px; padding: 0 12px; border-radius: 999px; border: none; background: rgba(255,255,255,0.08);
    color: #fff; font-size: 14px; cursor: pointer; }
  .st-present-btn:hover { background: rgba(255,255,255,0.18); }
  .st-present-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .st-present-count { color: #fff; font-family: var(--f-mono); font-size: 12px; letter-spacing: 0.08em; padding: 0 8px; }
  .st-present-exit { background: rgba(255,255,255,0.04); font-size: 12px; }

  /* Print stack — offscreen on screen, paginated for print */
  .st-print-stack { position: fixed; left: -100000px; top: 0; }
  .st-print-page { position: relative; overflow: hidden; background: var(--bg); }

  @media print {
    .st-app > .st-top, .st-app > .st-body { display: none !important; }
    html[data-studio-printing], html[data-studio-printing] body { background: var(--bg) !important; margin: 0; padding: 0; }
    .st-print-stack { position: static !important; left: auto !important; display: block !important; }
    .st-print-page { display: block; break-after: page; break-inside: avoid; }
    .st-print-page:last-of-type { break-after: auto; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    *, *::before, *::after { animation-delay: -99s !important; animation-duration: .001s !important;
      animation-iteration-count: 1 !important; animation-fill-mode: both !important; transition-duration: 0s !important; }
  }

  @media (max-width: 1100px) {
    .st-lib { width: 260px; }
    .st-rail { width: 180px; }
  }
  `}</style>;
}
