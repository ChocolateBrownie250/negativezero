/* ═══════════════════════════════════════════════════════════════
   MOBILE PAGES — 390px full-bleed canvases, reading-adapted.
   7 frames covering every common presentation content type.
   Narrative animations flow ↓ top-to-bottom (portrait scroll
   direction). Type 15–30px, line-height 1.6+, textWrap:pretty,
   WCAG-AA contrast throughout. All built on nv- primitives from
   tokens.css: plays once on mount, replay on demand, reduced-motion
   and print land on the fully-settled legible end state.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  const { useState } = React;

  const MW = 390;   /* mobile canvas width  */
  const MP = 24;    /* side padding         */
  const IW = 342;   /* inner width MW-2*MP  */

  /* ── Mobile doc wrapper ────────────────────────────────────── */
  const MDoc = ({ children, label }) => (
    <div className="isg-scope" data-screen-label={label} style={{
      width: MW, background: 'var(--bg)', color: 'var(--ink)',
      padding: `44px ${MP}px 56px`, position: 'relative',
      fontFamily: 'var(--f-sans)', lineHeight: 1.55,
    }}>
      {children}
    </div>
  );

  /* ── Accent eyebrow row ─────────────────────────────────────── */
  const Brow = ({ children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
      fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '0.16em',
      textTransform: 'uppercase', color: 'var(--accent)' }}>
      <span style={{ width: 18, height: 1, background: 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />
      {children}
    </div>
  );

  /* ── Sequencer shell — auto-plays once, Replay remounts ─────── */
  function Sequenced({ note, children }) {
    const [run, setRun] = useState(0);
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--ink-4)' }}>{note}</span>
          <button className="nv-replay" onClick={() => setRun(r => r + 1)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: '5px 11px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
            border: '1px solid var(--accent-line)', background: 'var(--accent-soft)', color: 'var(--accent)',
          }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M10.5 6a4.5 4.5 0 1 1-1.3-3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M10.7 0.8 L10.5 3.4 L7.9 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            Replay
          </button>
        </div>
        <div className="nv" key={run}>{children}</div>
      </div>
    );
  }

  /* ── Positioned canvas + SVG overlay (shared coordinate space) ─ */
  const Canvas = ({ h, children }) => (
    <div style={{ position: 'relative', height: h }}>{children}</div>
  );
  const Overlay = ({ h, children }) => (
    <svg width={IW} height={h} viewBox={`0 0 ${IW} ${h}`} style={{
      position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 5,
    }}>{children}</svg>
  );

  /* ── Border-trace comet ─────────────────────────────────────── */
  const Trace = ({ x, y, w, h, r = 10, t, dur = 1.3 }) => (
    <rect className="nv-trace" x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} rx={r} pathLength="1"
      style={{ '--nv-t': `${t}s`, '--nv-dur': `${dur}s` }} />
  );

  /* ── Connector: draw + comet + arrowhead bloom
       angle 90 → points ↓  |  angle 0 → points → ──────────────── */
  const Conn = ({ d, t, dur = 0.46, ax, ay, angle = 90, tone }) => {
    const c = tone ? `var(--${tone})` : 'var(--accent)';
    return (
      <g>
        <path className="nv-draw" d={d} pathLength="1" stroke="var(--line-2)" strokeWidth="1.4"
          style={{ '--nv-t': `${t}s`, '--nv-dur': `${dur}s` }} />
        <path className="nv-comet" d={d} pathLength="1"
          style={{ '--nv-t': `${t + 0.04}s`, '--nv-dur': `${dur + 0.26}s`, '--nv-c': c }} />
        <g transform={`translate(${ax},${ay}) rotate(${angle})`}>
          <g className="nv-bloom" style={{ '--nv-t': `${t + dur + 0.1}s` }}>
            <path d="M-7,-5.5 L2,0 L-7,5.5" fill="none" stroke={c} strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ filter: `drop-shadow(0 0 3px ${c})` }} />
          </g>
        </g>
      </g>
    );
  };

  /* ── Step card (absolute-positioned inside a Canvas) ───────── */
  const Step = ({ y, h = 82, tone = 'd-2', kicker, title, sub, t, hero, offsetX = 0, w }) => (
    <div className="nv-wake" style={{
      '--nv-t': `${t}s`,
      position: 'absolute', left: offsetX, top: y, width: w || (IW - offsetX), height: h,
      background: 'var(--grad-surface)',
      border: `1px solid ${hero ? 'var(--accent-line)' : 'var(--line-2)'}`,
      borderRadius: 'var(--r-lg)',
      padding: '11px 15px 11px 18px',
      display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden',
      boxShadow: hero ? 'var(--elev-1), 0 6px 20px rgba(234,90,58,0.12)' : 'var(--elev-1)',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
        background: `var(--${tone})`, borderRadius: '3px 0 0 3px' }} />
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: `var(--${tone})` }}>{kicker}</div>
      <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3 }}>{title}</div>
      {sub && <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-3)', textWrap: 'pretty' }}>{sub}</div>}
    </div>
  );

  const NOTE = 'PLAYS ONCE · AUTO · REDUCED-MOTION SAFE';

  /* ═══════════════════════════════════════════════════════════
     FRAME 1 · COVER / COMPANY OVERVIEW
  ═══════════════════════════════════════════════════════════ */
  const coverFrame = (
    <MDoc label="Mobile · Cover">
      <div style={{ borderBottom: '1px solid var(--line)', paddingBottom: 12, marginBottom: 30 }}>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.16em',
          textTransform: 'uppercase', color: 'var(--ink-4)' }}>[ Category · Date ]</span>
      </div>
      <Sequenced note={NOTE}>
        <>
          <div className="nv-in" style={{ '--nv-t': '0.2s', '--nv-dur': '0.5s',
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
            <span style={{ width: 22, height: 1, background: 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '0.16em',
              textTransform: 'uppercase', color: 'var(--accent)' }}>[ Sector · tagline ]</span>
          </div>
          <div className="nv-in" style={{ '--nv-t': '0.6s', '--nv-dur': '0.65s',
            fontSize: 30, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.18, marginBottom: 18 }}>
            [ Company Name ]
          </div>
          <div className="nv-in" style={{ '--nv-t': '1.0s', '--nv-dur': '0.55s',
            fontSize: 15.5, lineHeight: 1.68, color: 'var(--ink-2)', marginBottom: 40, textWrap: 'pretty' }}>
            [ One or two sentences establishing what this company does and why it matters. Keep under 25 words. ]
          </div>
          <div className="nv-in" style={{ '--nv-t': '1.4s', '--nv-dur': '0.55s',
            borderTop: '1px solid var(--line)', paddingTop: 22, display: 'flex' }}>
            {[{ v: '[ $0B ]', l: 'Valuation' }, { v: '[ 000 ]', l: 'Employees' }, { v: '[ 00 ]', l: 'Markets' }]
              .map((s, i) => (
                <div key={i} style={{
                  flex: 1,
                  paddingRight: i < 2 ? 16 : 0, paddingLeft: i > 0 ? 16 : 0,
                  borderRight: i < 2 ? '1px solid var(--line)' : 'none',
                }}>
                  <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-0.03em' }}>{s.v}</div>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: 'var(--ink-4)', marginTop: 5 }}>{s.l}</div>
                </div>
              ))}
          </div>
        </>
      </Sequenced>
    </MDoc>
  );

  /* ═══════════════════════════════════════════════════════════
     FRAME 2 · LINEAR JOURNEY ↓
  ═══════════════════════════════════════════════════════════ */
  const SH = 83, SG = 30; /* step height, gap */
  const steps = [
    { kicker: '01 · [ Phase ]', title: '[ First stage ]',  sub: '[ Opening state — where the story starts ]',   tone: 'd-2' },
    { kicker: '02 · [ Phase ]', title: '[ Second stage ]', sub: '[ What shifts in this phase ]',                 tone: 'd-6' },
    { kicker: '03 · [ Phase ]', title: '[ Third stage ]',  sub: '[ The turning point ]',                         tone: 'd-3' },
    { kicker: '04 · [ Phase ]', title: '[ Outcome ]',      sub: '[ Where the narrative lands ]',                 tone: 'd-1' },
  ];
  const journeyH = steps.length * SH + (steps.length - 1) * SG + 8;
  const journeyFrame = (
    <MDoc label="Mobile · Linear journey">
      <Brow>[ Section ]</Brow>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.25, marginBottom: 8 }}>[ Journey title ]</div>
      <p style={{ fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink-3)', marginBottom: 28, marginTop: 0, textWrap: 'pretty' }}>
        [ One sentence framing the overall flow. ]
      </p>
      <Sequenced note={NOTE}>
        <Canvas h={journeyH}>
          {steps.map((s, i) => (
            <Step key={i} y={i * (SH + SG)} h={SH} tone={s.tone}
              kicker={s.kicker} title={s.title} sub={s.sub}
              t={[0.15, 2.2, 3.35, 4.5][i]} hero={i === 3} />
          ))}
          <Overlay h={journeyH}>
            <Trace x={0} y={0} w={IW} h={SH} t={0.4} dur={1.5} />
            {[0, 1, 2].map(i => {
              const y1 = i * (SH + SG) + SH;
              const y2 = y1 + SG;
              return <Conn key={i} d={`M${IW / 2},${y1} L${IW / 2},${y2}`}
                t={[1.95, 3.08, 4.22][i]} ax={IW / 2} ay={y2 - 2} angle={90} />;
            })}
          </Overlay>
        </Canvas>
      </Sequenced>
    </MDoc>
  );

  /* ═══════════════════════════════════════════════════════════
     FRAME 3 · HUB → SUB-AREAS (spine + branches)
     Hub at top, vertical spine on left, sub-cards indented right.
  ═══════════════════════════════════════════════════════════ */
  const HH = 92;                  /* hub height            */
  const SBH = 68, SBG = 13;      /* sub height / gap      */
  const SPX = 16;                 /* spine x               */
  const CARD_X = 40;              /* sub-card left offset  */
  const SUBS_Y = HH + 38;
  const subRows = [
    { kicker: 'Sub-area A', title: '[ Business line ]', sub: '[ Scope of this segment ]', tone: 'd-2' },
    { kicker: 'Sub-area B', title: '[ Business line ]', sub: '[ Scope of this segment ]', tone: 'd-3' },
    { kicker: 'Sub-area C', title: '[ Business line ]', sub: '[ Scope of this segment ]', tone: 'd-4' },
  ];
  const hubH = SUBS_Y + subRows.length * (SBH + SBG) - SBG + 16;
  const hubFrame = (
    <MDoc label="Mobile · Hub to sub-areas">
      <Brow>[ Section ]</Brow>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.25, marginBottom: 8 }}>[ Hub title ]</div>
      <p style={{ fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink-3)', marginBottom: 28, marginTop: 0, textWrap: 'pretty' }}>
        [ One sentence framing the core and its branches. ]
      </p>
      <Sequenced note={NOTE}>
        <Canvas h={hubH}>
          {/* Hub card — full width */}
          <div className="nv-wake" style={{
            '--nv-t': '0.15s',
            position: 'absolute', left: 0, top: 0, width: IW, height: HH,
            background: 'var(--grad-surface)',
            border: '1px solid var(--accent-line)',
            borderRadius: 'var(--r-lg)', padding: '14px 16px 14px 18px',
            display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden',
            boxShadow: 'var(--elev-1), 0 8px 24px rgba(234,90,58,0.13)',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
              background: 'var(--d-1)', borderRadius: '3px 0 0 3px' }} />
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: 'var(--accent)' }}>Core</div>
            <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3 }}>[ Core platform / company ]</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-3)' }}>[ The capability all sub-areas branch from ]</div>
          </div>
          {/* Sub-area cards — indented to reveal spine */}
          {subRows.map((s, i) => (
            <Step key={i}
              y={SUBS_Y + i * (SBH + SBG)} h={SBH} tone={s.tone}
              kicker={s.kicker} title={s.title} sub={s.sub}
              t={[2.85, 3.2, 3.55][i]} offsetX={CARD_X} />
          ))}
          <Overlay h={hubH}>
            {/* Trace hub */}
            <Trace x={0} y={0} w={IW} h={HH} t={0.4} dur={1.5} />
            {/* Vertical spine down from hub */}
            <path className="nv-draw" pathLength="1"
              d={`M${SPX},${HH + 4} L${SPX},${SUBS_Y + subRows.length * (SBH + SBG) - SBG - SBH / 2}`}
              stroke="var(--line-2)" strokeWidth="1.4"
              style={{ '--nv-t': '2.0s', '--nv-dur': '0.65s' }} />
            {/* Branch arrows: spine → each sub card */}
            {subRows.map((s, i) => {
              const by = SUBS_Y + i * (SBH + SBG) + SBH / 2;
              return <Conn key={i}
                d={`M${SPX},${by} L${CARD_X - 3},${by}`}
                t={[2.48, 2.82, 3.16][i]} dur={0.32}
                ax={CARD_X - 3} ay={by} angle={0} tone={s.tone} />;
            })}
          </Overlay>
        </Canvas>
      </Sequenced>
    </MDoc>
  );

  /* ═══════════════════════════════════════════════════════════
     FRAME 4 · KEY METRICS
  ═══════════════════════════════════════════════════════════ */
  const mData = [
    { v: '[ $0B ]',  l: '[ Metric ]', sub: '[ context ]', tone: 'd-1' },
    { v: '[ 000% ]', l: '[ Metric ]', sub: '[ context ]', tone: 'd-2' },
    { v: '[ 000K ]', l: '[ Metric ]', sub: '[ context ]', tone: 'd-3' },
    { v: '[ #0 ]',   l: '[ Metric ]', sub: '[ context ]', tone: 'd-4' },
  ];
  const metricsFrame = (
    <MDoc label="Mobile · Key metrics">
      <Brow>[ Section ]</Brow>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 28 }}>[ Metrics headline ]</div>
      <Sequenced note={NOTE}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {mData.map((m, i) => (
            <div key={i} className="nv-wake" style={{
              '--nv-t': `${0.18 + i * 0.26}s`,
              background: 'var(--grad-surface)',
              border: `1px solid var(--${m.tone}-line)`,
              borderRadius: 'var(--r-xl)',
              padding: '18px 14px 16px',
              boxShadow: `var(--elev-1), var(--${m.tone}-glow)`,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                background: `var(--${m.tone})` }} />
              <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.03em',
                lineHeight: 1, marginBottom: 9, color: `var(--${m.tone})` }}>{m.v}</div>
              <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35, marginBottom: 5 }}>{m.l}</div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--ink-4)' }}>{m.sub}</div>
            </div>
          ))}
        </div>
      </Sequenced>
    </MDoc>
  );

  /* ═══════════════════════════════════════════════════════════
     FRAME 5 · QUOTE / PULL-OUT
  ═══════════════════════════════════════════════════════════ */
  const quoteFrame = (
    <MDoc label="Mobile · Quote">
      <Brow>[ Section ]</Brow>
      <Sequenced note={NOTE}>
        <>
          <div className="nv-in" style={{ '--nv-t': '0.15s', '--nv-dur': '0.48s',
            fontSize: 64, lineHeight: 0.8, fontFamily: 'Georgia, serif',
            color: 'var(--accent)', marginBottom: 24 }}>"</div>
          <div className="nv-in" style={{ '--nv-t': '0.45s', '--nv-dur': '0.72s',
            fontSize: 19, fontWeight: 500, lineHeight: 1.68,
            letterSpacing: '-0.01em', marginBottom: 34, textWrap: 'pretty' }}>
            [ The most important thing this person said — one sentence that would stop a reader mid-scroll. ]
          </div>
          <div className="nv-in" style={{ '--nv-t': '1.06s', '--nv-dur': '0.52s',
            display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              background: 'var(--bg-3)', border: '1px solid var(--line-2)',
              flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="5.5" r="3" fill="var(--ink-4)" />
                <path d="M2,14 C2,11 4.7,9 8,9 C11.3,9 14,11 14,14"
                  stroke="var(--ink-4)" strokeWidth="1.3" strokeLinecap="round" fill="none" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.01em' }}>[ Name ]</div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--ink-4)', marginTop: 3 }}>[ Title · Company ]</div>
            </div>
          </div>
        </>
      </Sequenced>
    </MDoc>
  );

  /* ═══════════════════════════════════════════════════════════
     FRAME 6 · TEAM / PEOPLE GRID
  ═══════════════════════════════════════════════════════════ */
  const people = [
    { name: '[ Name ]', role: '[ Role ]', tone: 'd-2' },
    { name: '[ Name ]', role: '[ Role ]', tone: 'd-3' },
    { name: '[ Name ]', role: '[ Role ]', tone: 'd-4' },
    { name: '[ Name ]', role: '[ Role ]', tone: 'd-5' },
    { name: '[ Name ]', role: '[ Role ]', tone: 'd-6' },
    { name: '[ Name ]', role: '[ Role ]', tone: 'd-1' },
  ];
  const teamFrame = (
    <MDoc label="Mobile · Team">
      <Brow>[ Section ]</Brow>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 28 }}>[ Team headline ]</div>
      <Sequenced note={NOTE}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {people.map((p, i) => (
            <div key={i} className="nv-wake" style={{
              '--nv-t': `${0.18 + i * 0.18}s`,
              background: 'var(--grad-surface)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r-xl)',
              padding: '16px 14px',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: `var(--${p.tone}-soft)`,
                border: `1px solid var(--${p.tone}-line)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="7" r="3.5" fill={`var(--${p.tone})`} opacity="0.65" />
                  <path d="M3,18 C3,13.5 6.1,11 10,11 C13.9,11 17,13.5 17,18"
                    stroke={`var(--${p.tone})`} strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.65" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>{p.name}</div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'var(--ink-4)', marginTop: 3 }}>{p.role}</div>
              </div>
            </div>
          ))}
        </div>
      </Sequenced>
    </MDoc>
  );

  /* ═══════════════════════════════════════════════════════════
     FRAME 7 · TIMELINE ↓
     Vertical spine draws first, nodes bloom in sequence,
     each entry wakes as its node appears.
  ═══════════════════════════════════════════════════════════ */
  const TL_X = 18, TL_ROW = 82, TL_TOP = 8;
  const tlData = [
    { yr: '[ 0000 ]', title: '[ Founding ]',           sub: '[ Brief context ]', tone: 'd-2' },
    { yr: '[ 0000 ]', title: '[ First milestone ]',    sub: '[ Brief context ]', tone: 'd-6' },
    { yr: '[ 0000 ]', title: '[ Key inflection ]',     sub: '[ Brief context ]', tone: 'd-3' },
    { yr: '[ 0000 ]', title: '[ Expansion / turn ]',   sub: '[ Brief context ]', tone: 'd-4' },
    { yr: '[ Now ]',  title: '[ Current state ]',      sub: '[ Where the company stands today ]', tone: 'd-1' },
  ];
  const tlH = TL_TOP + tlData.length * TL_ROW + 24;
  const timelineFrame = (
    <MDoc label="Mobile · Timeline">
      <Brow>[ Section ]</Brow>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 28 }}>[ Timeline headline ]</div>
      <Sequenced note={NOTE}>
        <Canvas h={tlH}>
          {tlData.map((e, i) => (
            <div key={i} className="nv-wake" style={{
              '--nv-t': `${0.32 + i * 0.54}s`,
              position: 'absolute',
              left: TL_X + 22, top: TL_TOP + i * TL_ROW,
              width: IW - TL_X - 22, height: TL_ROW - 8,
              padding: '4px 0 4px 18px',
              display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center',
            }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: `var(--${e.tone})` }}>{e.yr}</div>
              <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3 }}>{e.title}</div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--ink-3)', textWrap: 'pretty' }}>{e.sub}</div>
            </div>
          ))}
          <Overlay h={tlH}>
            {/* Spine draws once, top-to-bottom */}
            <path className="nv-draw" pathLength="1"
              d={`M${TL_X},${TL_TOP + 10} L${TL_X},${TL_TOP + tlData.length * TL_ROW - 16}`}
              stroke="var(--line-2)" strokeWidth="1.5"
              style={{ '--nv-t': '0.15s', '--nv-dur': `${tlData.length * 0.52}s` }} />
            {/* Nodes bloom in sequence */}
            {tlData.map((e, i) => {
              const cy = TL_TOP + i * TL_ROW + TL_ROW / 2;
              return (
                <g key={i} className="nv-bloom"
                  style={{ '--nv-t': `${0.28 + i * 0.54}s`, '--nv-dur': '0.44s' }}>
                  <circle cx={TL_X} cy={cy} r={5.5}
                    fill={`var(--${e.tone}-soft)`} stroke={`var(--${e.tone})`} strokeWidth="1.8" />
                  <circle cx={TL_X} cy={cy} r={2.5} fill={`var(--${e.tone})`} />
                </g>
              );
            })}
          </Overlay>
        </Canvas>
      </Sequenced>
    </MDoc>
  );

  /* ── Register ─────────────────────────────────────────────── */
  window.ISG.register({
    id: 'mobile-pages',
    group: 'Mobile',
    name: 'Mobile pages',
    blurb: 'Full-bleed 390px canvases for every common content type: Cover, Linear journey, Hub\u2192sub-areas, Key metrics, Quote, Team, Timeline. Reading-adapted throughout: 15\u201330px type, line-height\u00a01.6+, text-wrap:pretty, WCAG-AA contrast, and narrative animations that flow \u2193 top-to-bottom matching portrait scroll direction. Plays once on mount, replay on demand.',
    frames: [
      { label: 'Cover',           mode: 'flow', w: MW, node: coverFrame },
      { label: 'Linear journey',  mode: 'flow', w: MW, node: journeyFrame },
      { label: 'Hub \u2192 sub-areas', mode: 'flow', w: MW, node: hubFrame },
      { label: 'Key metrics',     mode: 'flow', w: MW, node: metricsFrame },
      { label: 'Quote',           mode: 'flow', w: MW, node: quoteFrame },
      { label: 'Team',            mode: 'flow', w: MW, node: teamFrame },
      { label: 'Timeline',        mode: 'flow', w: MW, node: timelineFrame },
    ],
  });
})();
