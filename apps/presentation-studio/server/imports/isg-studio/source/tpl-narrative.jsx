/* ═══════════════════════════════════════════════════════════════
   NARRATIVE FLOW KIT — play-once guided storytelling.
   A choreographed single pass walks the reader through a diagram in
   narrative order: the glow traces the border of the opening figure,
   rides each connector as a comet, then blooms into an arrow that
   wakes the next stage. Ends settled and fully legible; replayable;
   reduced-motion and print land on the end state.
   Built on the nv- primitives in tokens.css.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  const { useState } = React;
  const W = 1080;
  const IW = 960; /* inner width inside 60px Doc padding */

  const Doc = ({ children, label }) => (
    <div className="isg-scope" data-screen-label={label} style={{ width: W, background: 'var(--bg)', color: 'var(--ink)', padding: '52px 60px 64px', position: 'relative' }}>{children}</div>
  );
  const Block = ({ children, meta }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 9, marginBottom: 20, marginTop: 40 }}>
      <h3 style={{ margin: 0 }} className="t-eyebrow">{children}</h3>
      {meta && <span className="t-meta">{meta}</span>}
    </div>
  );

  /* ── Sequencer shell: auto-plays once on mount, ↻ remounts ── */
  function Sequenced({ note, children }) {
    const [run, setRun] = useState(0);
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span className="t-meta" style={{ color: 'var(--ink-4)' }}>{note}</span>
          <button className="nv-replay" onClick={() => setRun((r) => r + 1)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: '6px 13px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
            border: '1px solid var(--accent-line)', background: 'var(--accent-soft)', color: 'var(--accent)',
          }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M10.5 6a4.5 4.5 0 1 1-1.3-3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M10.7 0.8 L10.5 3.4 L7.9 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
            Replay
          </button>
        </div>
        <div className="nv" key={run}>{children}</div>
      </div>
    );
  }

  /* ── Fixed-coordinate canvas + SVG overlay (shared coord space) ─ */
  const Canvas = ({ h, children }) => (
    <div style={{ position: 'relative', height: h }}>{children}</div>
  );
  const Overlay = ({ h, children }) => (
    <svg width={IW} height={h} viewBox={`0 0 ${IW} ${h}`} style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 5 }}>{children}</svg>
  );

  /* Stage card. t = wake time (s). */
  const NodeCard = ({ x, y, w, h, tone = 'd-2', kicker, title, sub, t, hero }) => (
    <div className="nv-wake" style={{
      '--nv-t': `${t}s`,
      position: 'absolute', left: x, top: y, width: w, height: h,
      background: 'var(--grad-surface)', border: `1px solid ${hero ? 'var(--accent-line)' : 'var(--line-2)'}`,
      borderRadius: 'var(--r-lg)', padding: '14px 16px 14px 19px',
      boxShadow: hero ? 'var(--elev-1), 0 8px 30px rgba(234,90,58,0.14)' : 'var(--elev-1)',
      display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: `var(--${tone})` }} />
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: `var(--${tone})` }}>{kicker}</div>
      <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</div>
      {sub && <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--ink-3)' }}>{sub}</div>}
    </div>
  );

  /* Border-trace comet around a figure (overlay coords). */
  const Trace = ({ x, y, w, h, r = 12, t, dur = 1.5, tone }) => (
    <rect className="nv-trace" x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} rx={r} pathLength="1"
      style={{ '--nv-t': `${t}s`, '--nv-dur': `${dur}s`, '--nv-c': tone ? `var(--${tone})` : undefined }} />
  );

  /* Connector: hairline draws & stays, comet rides it, arrowhead
     blooms at the destination and stays. */
  const Edge = ({ d, t, dur = 0.7, ax, ay, angle = 0, tone }) => {
    const c = tone ? `var(--${tone})` : 'var(--accent)';
    return (
      <g>
        <path className="nv-draw" d={d} pathLength="1" stroke="var(--line-2)" strokeWidth="1.5" style={{ '--nv-t': `${t}s`, '--nv-dur': `${dur}s` }} />
        <path className="nv-comet" d={d} pathLength="1" style={{ '--nv-t': `${t + 0.06}s`, '--nv-dur': `${dur + 0.3}s`, '--nv-c': c }} />
        <g transform={`translate(${ax}, ${ay}) rotate(${angle})`}>
          <g className="nv-bloom" style={{ '--nv-t': `${t + dur + 0.14}s` }}>
            <path d="M-8,-6.5 L2.5,0 L-8,6.5" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 4px ${c})` }} />
          </g>
        </g>
      </g>
    );
  };

  const legend = 'PLAYS ONCE · SETTLES LEGIBLE · REDUCED-MOTION & PRINT SAFE';

  /* ── FRAME 1 · LINEAR JOURNEY → ───────────────────────────── */
  const stagesA = [
    { kicker: '01 · Discover', title: '[ Stage title ]', sub: '[ first touch — how the story opens ]', tone: 'd-2' },
    { kicker: '02 · Evaluate', title: '[ Stage title ]', sub: '[ what the reader weighs here ]', tone: 'd-6' },
    { kicker: '03 · Decide', title: '[ Stage title ]', sub: '[ the commitment moment ]', tone: 'd-3' },
    { kicker: '04 · Scale', title: '[ Outcome ]', sub: '[ where the narrative lands ]', tone: 'd-1' },
  ];
  const ax = [0, 260, 520, 780]; /* card x, w=180 */
  const linearFrame = (
    <Doc label="Narrative · Linear journey">
      <div className="t-eyebrow">Narrative flow · Guided reading</div>
      <h1 className="t-h1" style={{ margin: '12px 0 8px' }}>Lead the eye, once</h1>
      <p className="t-lead" style={{ fontSize: 16 }}>A single choreographed pass: the glow laps the opening figure's border, rides each connector as a comet, and blooms into an arrow that wakes the next stage. When it ends, every cue stays — the page reads perfectly without motion.</p>

      <Block meta="READS →">Linear journey</Block>
      <Sequenced note={legend}>
        <Canvas h={224}>
          {stagesA.map((s, i) => (
            <NodeCard key={i} x={ax[i]} y={40} w={180} h={138} tone={s.tone} kicker={s.kicker} title={s.title} sub={s.sub} t={[0.15, 2.85, 4.0, 5.15][i]} hero={i === 3} />
          ))}
          <Overlay h={224}>
            <Trace x={0} y={40} w={180} h={138} t={0.5} dur={1.6} />
            <Edge d="M184,109 L250,109" t={2.2} dur={0.5} ax={248} ay={109} />
            <Edge d="M444,109 L510,109" t={3.4} dur={0.5} ax={508} ay={109} />
            <Edge d="M704,109 L770,109" t={4.55} dur={0.5} ax={768} ay={109} />
          </Overlay>
        </Canvas>
      </Sequenced>
    </Doc>
  );

  /* ── FRAME 2 · HUB → SUB-AREAS ────────────────────────────── */
  const subs = [
    { kicker: 'Sub-area A', title: '[ Business line ]', sub: '[ one-line scope of this segment ]', tone: 'd-2', y: 0 },
    { kicker: 'Sub-area B', title: '[ Business line ]', sub: '[ one-line scope of this segment ]', tone: 'd-3', y: 150 },
    { kicker: 'Sub-area C', title: '[ Business line ]', sub: '[ one-line scope of this segment ]', tone: 'd-4', y: 300 },
  ];
  const hubFrame = (
    <Doc label="Narrative · Hub to sub-areas">
      <div className="t-eyebrow">Narrative flow · Guided reading</div>
      <h1 className="t-h1" style={{ margin: '12px 0 8px' }}>One core, many branches</h1>
      <p className="t-lead" style={{ fontSize: 16 }}>The glow makes one lap of the core figure, then splits into a fan of arrows — each pointing at a sub-area of the business. Arrows persist as the settled wayfinding.</p>

      <Block meta="READS → THEN FANS">Hub → sub-areas</Block>
      <Sequenced note={legend}>
        <Canvas h={420}>
          <NodeCard x={0} y={135} w={280} h={150} tone="d-1" hero kicker="Core" title="[ Core business ]" sub="[ the platform, company or capability the narrative starts from ]" t={0.15} />
          {subs.map((s, i) => (
            <NodeCard key={i} x={640} y={s.y} w={320} h={110} tone={s.tone} kicker={s.kicker} title={s.title} sub={s.sub} t={[3.0, 3.3, 3.6][i]} />
          ))}
          <Overlay h={420}>
            <Trace x={0} y={135} w={280} h={150} t={0.5} dur={1.7} />
            <Edge d="M284,172 C430,172 480,55 624,55" t={2.25} dur={0.75} ax={628} ay={55} tone="d-2" />
            <Edge d="M284,210 C430,210 480,205 624,205" t={2.55} dur={0.75} ax={628} ay={205} tone="d-3" />
            <Edge d="M284,248 C430,248 480,355 624,355" t={2.85} dur={0.75} ax={628} ay={355} tone="d-4" />
          </Overlay>
        </Canvas>
      </Sequenced>
    </Doc>
  );

  /* ── FRAME 3 · DIAGONAL PATH ↘ ────────────────────────────── */
  const diagFrame = (
    <Doc label="Narrative · Diagonal path">
      <div className="t-eyebrow">Narrative flow · Guided reading</div>
      <h1 className="t-h1" style={{ margin: '12px 0 8px' }}>Down and across</h1>
      <p className="t-lead" style={{ fontSize: 16 }}>For narratives that step diagonally — eras, escalations, build-ups — the comet swoops from each figure down into the next, so the reading order is never ambiguous.</p>

      <Block meta="READS ↘">Diagonal path</Block>
      <Sequenced note={legend}>
        <Canvas h={448}>
          <NodeCard x={0} y={0} w={300} h={120} tone="d-2" kicker="Act I · [ era / phase ]" title="[ Where it begins ]" sub="[ the opening state of the story ]" t={0.15} />
          <NodeCard x={330} y={160} w={300} h={120} tone="d-6" kicker="Act II · [ era / phase ]" title="[ The turn ]" sub="[ what changes and why it matters ]" t={2.85} />
          <NodeCard x={660} y={320} w={300} h={120} tone="d-1" hero kicker="Act III · [ era / phase ]" title="[ Where it lands ]" sub="[ the resolution the reader should keep ]" t={4.6} />
          <Overlay h={448}>
            <Trace x={0} y={0} w={300} h={120} t={0.5} dur={1.5} />
            <Edge d="M160,124 C160,220 230,220 318,220" t={2.15} dur={0.7} ax={322} ay={220} />
            <Edge d="M490,284 C490,380 560,380 648,380" t={3.9} dur={0.7} ax={652} ay={380} />
          </Overlay>
        </Canvas>
      </Sequenced>
    </Doc>
  );

  window.ISG.register({
    id: 'narrative-flow', group: 'Narrative flow', name: 'Guided narrative',
    blurb: 'Play-once choreography that walks the reader through a diagram in order: a glow traces the opening figure\u2019s border, rides each connector as a comet, and blooms into arrows that wake the next stage. Three reading paths — linear \u2192, hub \u2192 sub-areas, diagonal \u2198. Settles fully legible, replays on demand, and reduced-motion / print land on the end state.',
    frames: [
      { label: 'Linear journey', mode: 'flow', w: W, node: linearFrame },
      { label: 'Hub → sub-areas', mode: 'flow', w: W, node: hubFrame },
      { label: 'Diagonal path', mode: 'flow', w: W, node: diagFrame },
    ],
  });
})();
