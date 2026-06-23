/* ═══════════════════════════════════════════════════════════════
   DIAGRAM KIT — schematic patterns beyond the architecture engine.
   Drop-in schemes for explaining process, logic and structure:
   process flow · swimlanes · decision ladder · cycle · pyramid ·
   2×2 matrix · option-comparison columns. Each is labeled with a
   best-practice note so an agent knows WHEN to reach for it.
   All color via tokens; theme-aware; SF Pro / SF Mono.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  const W = 1080;
  const Doc = ({ children, pad = '52px 60px 64px' }) => (
    <div className="isg-scope" style={{ width: W, background: 'var(--bg)', color: 'var(--ink)', padding: pad, position: 'relative' }}>{children}</div>
  );
  const Block = ({ children, meta }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 9, marginBottom: 20, marginTop: 40 }}>
      <h3 style={{ margin: 0 }} className="t-eyebrow">{children}</h3>
      {meta && <span className="t-meta">{meta}</span>}
    </div>
  );
  const Kit = ({ name, note, children }) => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span className="t-meta" style={{ color: 'var(--accent)' }}>{name}</span>
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        {note && <span className="t-meta" style={{ color: 'var(--ink-3)' }}>{note}</span>}
      </div>
      {children}
    </div>
  );

  /* Edge droplet — a glowing dot that runs ALONG the perimeter of a box
     at an even, calm pace (rounded corners + pills), with a per-element
     on/off switch. Centralized in lib as <FlowEdge>. */
  const EdgeDrop = ({ delay = 0 }) => <FlowEdge delay={delay} dur={8} />;

  /* ── 1 · PROCESS FLOW — linear numbered steps + chevrons ──── */
  function ProcessFlow({ steps, tone = 'accent' }) {
    const c = toneColor(tone);
    return (
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {steps.map((s, i) => (
          <React.Fragment key={i}>
            <div style={{ flex: 1, background: 'var(--grad-surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '16px 18px', boxShadow: 'var(--elev-1)', position: 'relative', overflow: 'hidden' }}>
              <EdgeDrop delay={i * 0.5} />
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: c, opacity: 0.85 }} />
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.14em', color: c }}>{s.k}</div>
              <div className="t-h3" style={{ fontSize: 15, marginTop: 7 }}>{s.title}</div>
              <div className="t-small" style={{ marginTop: 4, lineHeight: 1.45 }}>{s.sub}</div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="22" height="14" viewBox="0 0 22 14"><path d="M1,7 H17" stroke="var(--ink-4)" strokeWidth="1.6" /><path d="M13,2 L19,7 L13,12" fill="none" stroke="var(--ink-4)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }

  /* ── 2 · SWIMLANE — actors × phases grid of chips ─────────── */
  function Swimlane({ phases, lanes }) {
    const cols = `150px repeat(${phases.length}, 1fr)`;
    return (
      <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--elev-1)', position: 'relative' }}>
        <EdgeDrop dur={6} />
        <div style={{ display: 'grid', gridTemplateColumns: cols, background: 'var(--bg-2)', borderBottom: '1px solid var(--line)' }}>
          <div style={{ padding: '11px 16px' }} className="t-meta">Lane</div>
          {phases.map((p, i) => <div key={i} style={{ padding: '11px 16px', borderLeft: '1px solid var(--line)' }} className="t-meta">{p}</div>)}
        </div>
        {lanes.map((ln, li) => (
          <div key={li} style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: li < lanes.length - 1 ? '1px solid var(--line)' : 'none' }}>
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 8, background: `var(--${ln.tone}-fill), var(--${ln.tone}-soft)`, borderRight: `2px solid var(--${ln.tone})` }}>
              <Dot tone={ln.tone} size={7} /><span className="t-h3" style={{ fontSize: 13.5 }}>{ln.label}</span>
            </div>
            {ln.cells.map((cell, ci) => (
              <div key={ci} style={{ padding: '12px 14px', borderLeft: '1px solid var(--line)', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'flex-start', minHeight: 56 }}>
                {(cell || []).map((it, k) => (
                  <span key={k} style={{ fontFamily: 'var(--f-mono)', fontSize: 11, padding: '4px 9px', borderRadius: 6, background: `var(--${ln.tone}-soft)`, border: `1px solid var(--${ln.tone}-line)`, color: 'var(--ink-2)' }}>{it}</span>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  /* ── 3 · DECISION LADDER — sequential qualification gates ─── */
  function DecisionLadder({ rungs, final }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
        {rungs.map((r, i) => (
          <div key={i} style={{ position: 'relative', paddingLeft: 26 }}>
            <div style={{ position: 'absolute', left: 9, top: 0, bottom: -2, width: 2, background: 'var(--line-2)' }} />
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ flex: '0 0 360px', position: 'relative', overflow: 'hidden', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: '14px 18px', boxShadow: 'var(--elev-1)' }}>
                <EdgeDrop delay={i * 0.7} />
                <div className="t-meta" style={{ color: 'var(--ink-4)' }}>Gate {String(i + 1).padStart(2, '0')}</div>
                <div className="t-h3" style={{ fontSize: 15, marginTop: 5 }}>{r.q}</div>
              </div>
              <svg width="34" height="14" viewBox="0 0 34 14" style={{ flexShrink: 0 }}><path d="M1,7 H28" stroke="var(--ok)" strokeWidth="1.6" /><path d="M24,2 L30,7 L24,12" fill="none" stroke="var(--ok)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--ok-fill), var(--ok-bg)', border: '1px solid var(--ok-line)', borderRadius: 'var(--r)', padding: '10px 16px' }}>
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--ok)' }}>YES →</span>
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{r.yes}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 8px 0', color: 'var(--ink-4)' }}>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.1em' }}>NO ↓</span>
            </div>
          </div>
        ))}
        <div style={{ paddingLeft: 26 }}>
          <div style={{ position: 'relative', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', gap: 10, background: 'var(--bad-fill), var(--bad-bg)', border: '1px solid var(--bad-line)', borderRadius: 'var(--r)', padding: '12px 18px' }}>
            <EdgeDrop dur={3.6} />
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--bad)' }}>DEFAULT</span>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{final}</span>
          </div>
        </div>
      </div>
    );
  }

  /* ── 4 · CYCLE — recurring loop of stages ─────────────────── */
  function CycleDiagram({ stages, size = 320 }) {
    const cx = size / 2, cy = size / 2, R = size / 2 - 54;
    const N = stages.length;
    const ang = (i) => -Math.PI / 2 + (i / N) * Math.PI * 2;
    const tones = ['d-1', 'd-2', 'd-3', 'd-4', 'd-5', 'd-6'];
    return (
      <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <defs><marker id="cyc-ah" markerWidth="9" markerHeight="9" refX="6" refY="4" orient="auto"><path d="M0,0 L7,4 L0,8 Z" fill="var(--ink-4)" /></marker></defs>
          {stages.map((_, i) => {
            const a0 = ang(i) + 0.42, a1 = ang((i + 1) % N) - 0.42;
            const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
            const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
            return <path key={i} d={`M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1}`} fill="none" stroke="var(--line-2)" strokeWidth="1.6" markerEnd="url(#cyc-ah)" />;
          })}
        </svg>
        {stages.map((s, i) => {
          const x = cx + R * Math.cos(ang(i)), y = cy + R * Math.sin(ang(i));
          const t = tones[i % tones.length];
          return (
            <div key={i} style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%,-50%)', width: 96, height: 96, borderRadius: '50%', background: `var(--${t}-fill), var(--${t}-soft)`, border: `1.5px solid var(--${t}-line)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 8 }}>
              <EdgeDrop delay={i * (4.8 / N)} dur={4.8} />
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: `var(--${t})` }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.15, marginTop: 3 }}>{s}</span>
            </div>
          );
        })}
        <div style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%,-50%)', width: 88, height: 88, borderRadius: '50%', background: 'var(--bg-1)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <span className="t-meta" style={{ color: 'var(--ink-3)' }}>cycle</span>
        </div>
      </div>
    );
  }

  /* ── 5 · PYRAMID — tiered hierarchy / maturity ────────────── */
  function Pyramid({ tiers }) {
    const n = tiers.length;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', position: 'relative' }}>
        {tiers.map((t, i) => {
          const w = 42 + (i / (n - 1)) * 56;
          return (
            <div key={i} style={{ position: 'relative', overflow: 'hidden', width: `${w}%`, background: `var(--${t.tone}-fill), var(--${t.tone}-soft)`, border: `1.5px solid var(--${t.tone}-line)`, borderRadius: 'var(--r)', padding: '13px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
              <EdgeDrop delay={i * 0.45} />
              <span className="t-h3" style={{ fontSize: 14 }}>{t.label}</span>
              {t.value && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: `var(--${t.tone})` }}>{t.value}</span>}
            </div>
          );
        })}
      </div>
    );
  }

  /* ── 6 · MATRIX 2×2 — positioning / prioritization ────────── */
  function Matrix2x2({ xAxis, yAxis, quads, points }) {
    const S = 360;
    return (
      <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
        <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', textAlign: 'center' }} className="t-meta">{yAxis}</div>
        <div>
          <div style={{ position: 'relative', width: S, height: S, background: 'var(--grad-well)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--line-2)' }} />
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--line-2)' }} />
            {quads.map((q, i) => {
              const pos = [{ top: 12, left: 14 }, { top: 12, right: 14 }, { bottom: 12, left: 14 }, { bottom: 12, right: 14 }][i];
              return <div key={i} className="t-meta" style={{ position: 'absolute', ...pos, color: 'var(--ink-4)', maxWidth: 130, textAlign: pos.right != null ? 'right' : 'left' }}>{q}</div>;
            })}
            {points.map((p, i) => (
              <div key={i} style={{ position: 'absolute', left: `${p.x}%`, top: `${100 - p.y}%`, transform: 'translate(-50%,-50%)', display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 13, height: 13, borderRadius: '50%', background: p.hero ? 'var(--accent)' : `var(--${p.tone || 'd-2'})`, boxShadow: p.hero ? 'var(--glow-accent)' : `0 0 0 4px var(--${p.tone || 'd-2'}-soft)`, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: p.hero ? 600 : 500, color: p.hero ? 'var(--accent)' : 'var(--ink-2)', whiteSpace: 'nowrap' }}>{p.label}</span>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 10 }} className="t-meta">{xAxis}</div>
        </div>
      </div>
    );
  }

  /* ── 7 · OPTION COLUMNS — trade-off comparison ────────────── */
  function CompareColumns({ rows, options }) {
    const cols = `180px repeat(${options.length}, 1fr)`;
    const mark = (v) => v === true ? <span style={{ color: 'var(--ok)', fontWeight: 700 }}>✓</span> : v === false ? <span style={{ color: 'var(--bad)', opacity: 0.8 }}>✕</span> : <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--f-mono)', fontSize: 11.5 }}>{v}</span>;
    return (
      <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--elev-1)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, background: 'var(--bg-2)', borderBottom: '1px solid var(--line)' }}>
          <div style={{ padding: '13px 16px' }} className="t-meta">Criterion</div>
          {options.map((o, i) => (
            <div key={i} style={{ padding: '13px 16px', borderLeft: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8, background: o.hero ? 'var(--accent-soft)' : 'transparent' }}>
              <Dot tone={o.hero ? 'accent' : 'd-2'} size={7} /><span className="t-h3" style={{ fontSize: 13.5, color: o.hero ? 'var(--accent)' : 'var(--ink)' }}>{o.label}</span>
            </div>
          ))}
        </div>
        {rows.map((r, ri) => (
          <div key={ri} style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: ri < rows.length - 1 ? '1px solid var(--line)' : 'none' }}>
            <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink-2)' }}>{r.label}</div>
            {r.values.map((v, ci) => (
              <div key={ci} style={{ padding: '12px 16px', borderLeft: '1px solid var(--line)', textAlign: 'center', background: options[ci] && options[ci].hero ? 'color-mix(in srgb, var(--accent) 5%, transparent)' : 'transparent' }}>{mark(v)}</div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  /* ── FRAME 1 · SCHEME LIBRARY ─────────────────────────────── */
  const libFrame = (
    <Doc>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--ambient)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative' }}>
        <div className="t-eyebrow">Diagram Kit · Schemes</div>
        <h1 className="t-display" style={{ fontSize: 'clamp(36px,3.8vw,52px)', margin: '14px 0 12px' }}>Seven ways to draw<br /><span style={{ color: 'var(--accent)' }}>a relationship.</span></h1>
        <p className="t-lead">Structure beats prose for sequence, logic and hierarchy. Each scheme below is a drop-in; the note on every block says when to reach for it. For component-level system maps use the Architecture deck's node/edge engine instead.</p>
      </div>

      <Block meta="LINEAR">Process flow</Block>
      <Kit name="ProcessFlow" note="USE WHEN · ordered steps, one path">
        <ProcessFlow steps={[
          { k: '01', title: '[ Capture ]', sub: '[ intake / trigger ]' },
          { k: '02', title: '[ Normalize ]', sub: '[ shape to contract ]' },
          { k: '03', title: '[ Evaluate ]', sub: '[ rules / scoring ]' },
          { k: '04', title: '[ Route ]', sub: '[ deliver downstream ]' },
        ]} />
      </Kit>

      <Block meta="OWNERSHIP × TIME">Swimlanes</Block>
      <Kit name="Swimlane" note="USE WHEN · who does what, across phases">
        <Swimlane phases={['Discover', 'Build', 'Ship']} lanes={[
          { label: '[ Product ]', tone: 'd-1', cells: [['[ scope ]', '[ specs ]'], ['[ review ]'], ['[ launch note ]']] },
          { label: '[ Engineering ]', tone: 'd-2', cells: [['[ spike ]'], ['[ implement ]', '[ test ]'], ['[ deploy ]']] },
          { label: '[ GTM ]', tone: 'd-3', cells: [['[ research ]'], ['[ enablement ]'], ['[ announce ]', '[ measure ]']] },
        ]} />
      </Kit>

      <Block meta="LOGIC">Decision ladder &amp; cycle</Block>
      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 28, alignItems: 'start' }}>
        <Kit name="DecisionLadder" note="USE WHEN · sequential gating / qualification">
          <DecisionLadder rungs={[
            { q: '[ Meets minimum threshold? ]', yes: '[ Advance ]' },
            { q: '[ Strategic fit confirmed? ]', yes: '[ Prioritize ]' },
            { q: '[ Capacity available now? ]', yes: '[ Schedule ]' },
          ]} final="[ Park / revisit next cycle ]" />
        </Kit>
        <Kit name="CycleDiagram" note="USE WHEN · a repeating loop">
          <CycleDiagram stages={['[ Plan ]', '[ Build ]', '[ Measure ]', '[ Learn ]']} />
        </Kit>
      </div>

      <Block meta="STRUCTURE">Pyramid &amp; 2×2 matrix</Block>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 28, alignItems: 'center' }}>
        <Kit name="Pyramid" note="USE WHEN · tiers / maturity / TAM">
          <Pyramid tiers={[
            { label: '[ Vision ]', tone: 'd-1', value: '[ why ]' },
            { label: '[ Strategy ]', tone: 'd-4', value: '[ how ]' },
            { label: '[ Execution ]', tone: 'd-2', value: '[ what ]' },
            { label: '[ Foundation ]', tone: 'd-3', value: '[ base ]' },
          ]} />
        </Kit>
        <Kit name="Matrix2x2" note="USE WHEN · positioning / prioritization">
          <Matrix2x2 xAxis="[ → capability ]" yAxis="[ → momentum ]"
            quads={['[ niche ]', '[ leaders ]', '[ laggards ]', '[ challengers ]']}
            points={[
              { x: 72, y: 78, label: '[ Us ]', hero: true },
              { x: 38, y: 60, label: '[ Co. A ]', tone: 'd-2' },
              { x: 60, y: 35, label: '[ Co. B ]', tone: 'd-4' },
              { x: 24, y: 28, label: '[ Co. C ]', tone: 'd-5' },
            ]} />
        </Kit>
      </div>

      <Block meta="TRADE-OFFS">Option comparison</Block>
      <Kit name="CompareColumns" note="USE WHEN · choosing between approaches">
        <CompareColumns
          options={[{ label: '[ Option A ]', hero: true }, { label: '[ Option B ]' }, { label: '[ Option C ]' }]}
          rows={[
            { label: '[ Time to value ]', values: ['[ days ]', '[ weeks ]', '[ months ]'] },
            { label: '[ Control ]', values: [true, true, false] },
            { label: '[ Ops burden ]', values: ['[ low ]', '[ med ]', '[ high ]'] },
            { label: '[ Vendor lock-in ]', values: [false, true, true] },
          ]} />
      </Kit>
    </Doc>
  );

  /* ── FRAME 2 · CHOOSING A SCHEME (playbook) ───────────────── */
  const guide = [
    ['Show an ordered sequence', 'Process flow', 'Steps left→right, one path. Number every step; keep to 3–6.', 'd-1'],
    ['Show who owns what, over time', 'Swimlanes', 'Lanes = actors, columns = phases. Best when handoffs matter.', 'd-2'],
    ['Show branching logic', 'Decision ladder', 'Sequential gates with a default outcome. Avoid drawing every branch.', 'd-3'],
    ['Show a repeating process', 'Cycle', 'A closed loop of 3–5 stages. Don’t use for one-time sequences.', 'd-4'],
    ['Show hierarchy or tiers', 'Pyramid', 'Few levels, widest = foundation. Great for maturity / TAM-SAM-SOM.', 'd-5'],
    ['Show position on two axes', '2×2 matrix', 'Two continuous variables, ~3–6 plotted items. Mark your subject in coral.', 'd-6'],
    ['Compare discrete options', 'Option columns', 'Criteria as rows, options as columns. Highlight the recommended column.', 'accent'],
    ['Map system components', 'Architecture engine', 'Nodes + directional edges + trust zones. See the Architecture deck.', 'mute'],
  ];
  const rules = [
    ['One idea per diagram', 'If it needs a legend longer than three items to read, split it. A scheme answers one question.'],
    ['Direction carries meaning', 'Left→right for time, top→down for hierarchy, clockwise for cycles. Be consistent within a deck.'],
    ['Color encodes, never decorates', 'Use one diagram hue per role; reserve coral for the subject or the recommended path.'],
    ['Label the edges, not just the boxes', 'The arrow is the argument — name what flows (data, approval, money), not only what connects.'],
    ['Whitespace is structure', 'Group with proximity and zones before you reach for more lines. Fewer crossings read faster.'],
    ['Pick the simplest scheme that fits', 'A four-step flow beats a node graph. Reach for complexity only when the relationship demands it.'],
  ];
  const guideFrame = (
    <Doc>
      <div className="t-eyebrow">Diagram Kit · Playbook</div>
      <h1 className="t-h1" style={{ margin: '12px 0 8px' }}>Choosing a scheme</h1>
      <p className="t-lead" style={{ fontSize: 16 }}>Start from the question you’re answering, not the picture you want to draw. Match intent to scheme, then apply the six rules.</p>

      <Block meta="INTENT → SCHEME">Decision guide</Block>
      <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--elev-1)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '260px 170px 1fr', background: 'var(--bg-2)', borderBottom: '1px solid var(--line)' }}>
          {['When you want to…', 'Reach for', 'How to apply it'].map((h, i) => <div key={i} style={{ padding: '11px 18px', borderLeft: i ? '1px solid var(--line)' : 'none' }} className="t-meta">{h}</div>)}
        </div>
        {guide.map(([intent, scheme, how, tone], i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '260px 170px 1fr', borderBottom: i < guide.length - 1 ? '1px solid var(--line)' : 'none' }}>
            <div style={{ padding: '13px 18px', fontSize: 13.5, color: 'var(--ink)' }}>{intent}</div>
            <div style={{ padding: '13px 18px', borderLeft: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}><Dot tone={tone} size={7} /><span style={{ fontSize: 13, fontWeight: 600, color: toneColor(tone) }}>{scheme}</span></div>
            <div style={{ padding: '13px 18px', borderLeft: '1px solid var(--line)' }} className="t-small">{how}</div>
          </div>
        ))}
      </div>

      <Block meta="6 RULES">Rules for clear schematics</Block>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {rules.map(([t, d], i) => (
          <div key={i} style={{ background: 'var(--grad-surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '18px 20px', boxShadow: 'var(--elev-1)' }}>
            <div className="t-num" style={{ fontSize: 22, color: 'var(--accent)', opacity: 0.5 }}>{String(i + 1).padStart(2, '0')}</div>
            <div className="t-h3" style={{ fontSize: 15, margin: '8px 0 6px' }}>{t}</div>
            <div className="t-small" style={{ lineHeight: 1.5 }}>{d}</div>
          </div>
        ))}
      </div>
    </Doc>
  );

  window.ISG.register({
    id: 'diagram-kit', group: 'Diagram kit', name: 'Schemes & diagrams',
    blurb: 'Schematic patterns beyond the architecture engine — process flow, swimlanes, decision ladder, cycle, pyramid, 2×2 matrix and option-comparison columns. Every block carries a best-practice note, and a playbook frame maps intent → scheme plus six rules for clear schematics.',
    frames: [
      { label: 'Scheme library', mode: 'flow', w: W, node: libFrame },
      { label: 'Choosing a scheme', mode: 'flow', w: W, node: guideFrame },
    ],
  });
})();
