/* ═══════════════════════════════════════════════════════════════
   INFOGRAPHICS KIT — high-glance, standalone visual facts.
   Icon-stat tiles · numbered step ribbon · pictograph unit grid ·
   head-to-head bars · milestone timeline · stat band. Built for
   moments where a reader skims, not studies. Each block carries a
   best-practice note. All color via tokens; theme-aware.
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

  /* Abstract geometric mark — NOT illustrative. Encodes category only. */
  function Mark({ shape = 'ring', tone = 'accent', size = 40 }) {
    const c = `var(--${tone})`; const s = size;
    const inner = {
      ring: <circle cx={s / 2} cy={s / 2} r={s / 2 - 4} fill="none" stroke={c} strokeWidth="3" />,
      dot: <circle cx={s / 2} cy={s / 2} r={s / 4} fill={c} />,
      bars: <g>{[0, 1, 2].map((i) => <rect key={i} x={6 + i * (s / 4)} y={s - 6 - (i + 1) * (s / 5)} width={s / 7} height={(i + 1) * (s / 5)} rx="1.5" fill={c} />)}</g>,
      up: <path d={`M${s / 2},6 L${s - 7},${s - 8} L7,${s - 8} Z`} fill="none" stroke={c} strokeWidth="3" strokeLinejoin="round" />,
      grid: <g>{[0, 1].flatMap((r) => [0, 1].map((cc) => <rect key={`${r}${cc}`} x={8 + cc * (s / 2.4)} y={8 + r * (s / 2.4)} width={s / 4} height={s / 4} rx="2" fill={c} opacity={r + cc === 0 ? 1 : 0.5} />))}</g>,
      arrow: <g><path d={`M7,${s / 2} H${s - 8}`} stroke={c} strokeWidth="3" strokeLinecap="round" /><path d={`M${s - 16},${s / 2 - 7} L${s - 7},${s / 2} L${s - 16},${s / 2 + 7}`} fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></g>,
    }[shape];
    return (
      <div style={{ width: s + 16, height: s + 16, borderRadius: 'var(--r)', background: `var(--${tone}-soft)`, border: `1px solid var(--${tone}-line)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>{inner}</svg>
      </div>
    );
  }

  /* ── 1 · ICON-STAT TILE ───────────────────────────────────── */
  function IconStat({ shape, tone = 'accent', value, label, delta, deltaTone, detail }) {
    const clickable = !!detail;
    const fire = (e) => { e.stopPropagation(); openInspector(detail); };
    const extra = clickable ? {
      className: 'ix ix-lift', role: 'button', tabIndex: 0, onClick: fire,
      onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(e); } },
    } : {};
    return (
      <div {...extra} style={{ flex: 1, background: 'var(--grad-surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '20px 22px', boxShadow: 'var(--elev-1)', display: 'flex', flexDirection: 'column', gap: 14, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'var(--grad-sheen)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <Mark shape={shape} tone={tone} size={34} />
          {delta && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, padding: '3px 9px', borderRadius: 99, background: `var(--${deltaTone || 'ok'}-bg)`, border: `1px solid var(--${deltaTone || 'ok'}-line)`, color: `var(--${deltaTone || 'ok'})` }}>{delta}</span>}
        </div>
        <div style={{ position: 'relative' }}>
          <div className="t-num" style={{ fontSize: 34, lineHeight: 1, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{value}</div>
          <div className="t-small" style={{ marginTop: 6 }}>{label}</div>
        </div>
        {clickable && <span className="ix-cue" aria-hidden="true" style={{ top: 'auto', bottom: 12, right: 12 }}>+</span>}
      </div>
    );
  }

  /* ── 2 · STEP RIBBON — big numerals, connected ────────────── */
  function StepRibbon({ steps }) {
    const tones = ['d-1', 'd-2', 'd-3', 'd-4'];
    return (
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 14, position: 'relative' }}>
        {steps.map((s, i) => {
          const t = tones[i % tones.length];
          return (
            <div key={i} style={{ flex: 1, position: 'relative', paddingTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: `var(--${t}-soft)`, border: `1.5px solid var(--${t}-line)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span className="t-num" style={{ fontSize: 22, color: `var(--${t})` }}>{i + 1}</span>
                </div>
                {i < steps.length - 1 && <div style={{ flex: 1, height: 2, background: `linear-gradient(90deg, var(--${t}-line), var(--line))` }} />}
              </div>
              <div className="t-h3" style={{ fontSize: 15, marginTop: 14 }}>{s.title}</div>
              <div className="t-small" style={{ marginTop: 5, lineHeight: 1.45 }}>{s.sub}</div>
            </div>
          );
        })}
      </div>
    );
  }

  /* ── 3 · PICTOGRAPH — countable units (X in Y) ────────────── */
  function Pictograph({ filled, total = 10, tone = 'accent', cols = 10, label }) {
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 7, maxWidth: cols * 26 }}>
          {Array.from({ length: total }).map((_, i) => (
            <span key={i} style={{ width: 18, height: 18, borderRadius: 5, background: i < filled ? `var(--${tone})` : 'var(--bg-3)', border: i < filled ? `1px solid var(--${tone})` : '1px solid var(--line)', boxShadow: i < filled ? `0 0 0 3px var(--${tone}-soft)` : 'none' }} />
          ))}
        </div>
        {label && <div className="t-small" style={{ marginTop: 14 }}><span className="t-num" style={{ fontSize: 20, color: `var(--${tone})` }}>{filled}</span> <span style={{ color: 'var(--ink-4)' }}>/ {total}</span> &nbsp;{label}</div>}
      </div>
    );
  }

  /* ── 4 · HEAD-TO-HEAD — diverging comparison bars ─────────── */
  function HeadToHead({ a, b, rows }) {
    const max = Math.max(...rows.flatMap((r) => [r.a, r.b])) || 1;
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Dot tone="accent" size={8} /><span className="t-h3" style={{ fontSize: 14, color: 'var(--accent)' }}>{a}</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="t-h3" style={{ fontSize: 14, color: 'var(--d-2)' }}>{b}</span><Dot tone="d-2" size={8} /></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((r, i) => (
            <div key={i}>
              <div style={{ textAlign: 'center', fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 5 }}>{r.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ width: `${(r.a / max) * 100}%`, height: 18, background: 'var(--accent-grad)', borderRadius: '4px 0 0 4px' }} />
                </div>
                <span className="t-num" style={{ fontSize: 13, width: 44, textAlign: 'right', color: 'var(--accent)' }}>{r.a}</span>
                <span style={{ width: 1, height: 22, background: 'var(--line-2)' }} />
                <span className="t-num" style={{ fontSize: 13, width: 44, color: 'var(--d-2)' }}>{r.b}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ width: `${(r.b / max) * 100}%`, height: 18, background: 'color-mix(in srgb, var(--d-2) 65%, transparent)', borderRadius: '0 4px 4px 0' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── 5 · MILESTONE TIMELINE ───────────────────────────────── */
  function Timeline({ milestones }) {
    const tones = ['d-1', 'd-2', 'd-3', 'd-4', 'd-5'];
    return (
      <div style={{ position: 'relative', paddingTop: 4 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 30, height: 2, background: 'var(--line-2)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {milestones.map((m, i) => {
            const t = tones[i % tones.length];
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', position: 'relative', padding: '0 8px' }}>
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.08em', color: `var(--${t})`, marginBottom: 12 }}>{m.date}</span>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: `var(--${t})`, border: '3px solid var(--bg)', boxShadow: `0 0 0 3px var(--${t}-soft)`, zIndex: 1 }} />
                <span className="t-h3" style={{ fontSize: 14, marginTop: 14 }}>{m.title}</span>
                <span className="t-small" style={{ marginTop: 4, lineHeight: 1.4 }}>{m.sub}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── 6 · STAT BAND — headline figures, divided ────────────── */
  function StatBand({ stats }) {
    return (
      <div style={{ display: 'flex', background: 'var(--grad-well)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--elev-1)', overflow: 'hidden', position: 'relative' }}>
        <FlowEdge dur={9} />
        {stats.map((s, i) => (
            <div key={i} style={{ flex: 1, padding: '22px 26px', borderLeft: i ? '1px solid var(--line)' : 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="t-num" style={{ fontSize: 34, lineHeight: 1, color: s.tone ? `var(--${s.tone})` : 'var(--ink)' }}>{s.value}</span>
            <span className="t-meta">{s.label}</span>
          </div>
        ))}
      </div>
    );
  }

  /* ── FRAME 1 · INFOGRAPHIC ELEMENTS ───────────────────────── */
  const libFrame = (
    <Doc>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--ambient)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative' }}>
        <div className="t-eyebrow">Infographics · Elements</div>
        <h1 className="t-display" style={{ fontSize: 'clamp(36px,3.8vw,52px)', margin: '14px 0 12px' }}>Facts built<br /><span style={{ color: 'var(--accent)' }}>for a glance.</span></h1>
        <p className="t-lead">Standalone visual facts for covers, dividers and summary moments — read in two seconds, no axis required. Marks stay abstract and encode category only; the number always leads. Keep these sparse: an infographic that needs studying has failed.</p>
      </div>

      <Block meta="HEADLINE TILES">Icon-stat tiles &amp; band</Block>
      <div style={{ display: 'flex', gap: 14 }}>
        <Kit name="IconStat ×3" note="USE WHEN · 2–4 hero metrics · click a tile"><div style={{ display: 'flex', gap: 14 }}>
          <IconStat shape="up" tone="accent" value="[ 142% ]" label="[ YoY growth ]" delta="↑" deltaTone="ok"
            detail={{ kicker: 'Metric · YoY growth', title: '[ 142% ]', tone: 'accent', sub: '[ YoY growth ]', body: ['Tiles can carry their own detail — click to expand the figure with context, source and a link.'], stats: [{ k: 'Period', v: '[ TTM ]' }, { k: 'Source', v: '[ … ]' }], links: [{ label: 'See the data', href: '#', primary: true }] }} />
          <IconStat shape="bars" tone="d-2" value="[ 4.8M ]" label="[ ARR ]"
            detail={{ kicker: 'Metric · ARR', title: '[ 4.8M ]', tone: 'd-2', sub: '[ annual recurring revenue ]', body: ['Replace with how the figure is defined and measured.'], stats: [{ k: 'As of', v: '[ date ]' }] }} />
          <IconStat shape="ring" tone="d-3" value="[ 19 ]" label="[ mo runway ]"
            detail={{ kicker: 'Metric · Runway', title: '[ 19 months ]', tone: 'd-3', sub: '[ at current burn ]', body: ['Context for the number.'] }} />
        </div></Kit>
      </div>
      <div style={{ marginTop: 22 }}>
        <Kit name="StatBand" note="USE WHEN · a divider strip of numbers">
          <StatBand stats={[
            { value: '[ 8,400+ ]', label: 'Data points / run', tone: 'd-1' },
            { value: '[ 3 ]', label: 'Deploy modes', tone: 'd-2' },
            { value: '[ <1s ]', label: 'P95 latency', tone: 'd-3' },
            { value: '[ 99.9% ]', label: 'Uptime', tone: 'd-4' },
          ]} />
        </Kit>
      </div>

      <Block meta="SEQUENCE">Step ribbon</Block>
      <Kit name="StepRibbon" note="USE WHEN · a how-it-works in 3–4 beats">
        <StepRibbon steps={[
          { title: '[ Connect ]', sub: '[ point at any source ]' },
          { title: '[ Collect ]', sub: '[ one stateless agent ]' },
          { title: '[ Normalize ]', sub: '[ portable JSON ]' },
          { title: '[ Act ]', sub: '[ dashboards & alerts ]' },
        ]} />
      </Kit>

      <Block meta="PROPORTION">Pictograph &amp; head-to-head</Block>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 28, alignItems: 'center' }}>
        <Kit name="Pictograph" note="USE WHEN · a countable ratio (X in Y)">
          <Pictograph filled={7} total={10} tone="accent" label="[ of teams ship weekly ]" />
        </Kit>
        <Kit name="HeadToHead" note="USE WHEN · us vs them, few metrics">
          <HeadToHead a="[ Us ]" b="[ Incumbent ]" rows={[
            { label: '[ Setup ]', a: 9, b: 4 },
            { label: '[ Coverage ]', a: 8, b: 6 },
            { label: '[ Cost ]', a: 9, b: 3 },
          ]} />
        </Kit>
      </div>

      <Block meta="TIME">Milestone timeline</Block>
      <Kit name="Timeline" note="USE WHEN · a roadmap or history">
        <Timeline milestones={[
          { date: '[ Q1 ]', title: '[ Seed ]', sub: '[ first design partners ]' },
          { date: '[ Q2 ]', title: '[ GA ]', sub: '[ self-serve launch ]' },
          { date: '[ Q3 ]', title: '[ Scale ]', sub: '[ enterprise tier ]' },
          { date: '[ Q4 ]', title: '[ Expand ]', sub: '[ new category ]' },
        ]} />
      </Kit>
    </Doc>
  );

  /* ── FRAME 2 · INFOGRAPHIC PLAYBOOK ───────────────────────── */
  const choose = [
    ['Anchor a cover or section', 'Stat band / IconStat', 'A row of 3–4 hero numbers. One unit each, mono labels beneath.', 'd-1'],
    ['Explain how something works', 'Step ribbon', 'Three or four numbered beats, left→right. One verb per step.', 'd-2'],
    ['Show a ratio you can count', 'Pictograph', 'Units out of a whole ("7 in 10"). Keep totals to 10 or 20.', 'accent'],
    ['Position against a rival', 'Head-to-head', 'Diverging bars, your side in coral. 3–5 metrics, no more.', 'd-3'],
    ['Lay out a roadmap or history', 'Timeline', 'Evenly spaced milestones on one rail; date above, title below.', 'd-4'],
    ['Carry a single dramatic figure', 'IconStat', 'One mark, one number, one delta. Let whitespace do the work.', 'd-5'],
  ];
  const rules = [
    ['The number leads', 'Headline figure first and largest; label and mark support it. If the eye lands on the icon, resize.'],
    ['Marks encode, never illustrate', 'Abstract geometry tied to category — no clip-art, no literal pictures. The system stays instrumented.'],
    ['Round for the glance', 'Infographics are for skimming: "~140%", "8K+", "<1s". Save the exact figure for the table.'],
    ['Three to five, then stop', 'A glanceable unit holds a handful of items. More than five and it becomes a chart — move it.'],
    ['One accent, rest muted', 'Coral marks the one fact that matters; supporting facts take quiet diagram hues.'],
    ['Air is a feature', 'Generous spacing is what separates an infographic from a dashboard. Don’t fill every gap.'],
  ];
  const guideFrame = (
    <Doc>
      <div className="t-eyebrow">Infographics · Playbook</div>
      <h1 className="t-h1" style={{ margin: '12px 0 8px' }}>Built for a glance</h1>
      <p className="t-lead" style={{ fontSize: 16 }}>Infographics live on covers, dividers and summary slides — not in the analysis. Choose by purpose, then keep them sparse.</p>

      <Block meta="PURPOSE → ELEMENT">Decision guide</Block>
      <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--elev-1)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '260px 190px 1fr', background: 'var(--bg-2)', borderBottom: '1px solid var(--line)' }}>
          {['When you need to…', 'Use', 'How to apply it'].map((h, i) => <div key={i} style={{ padding: '11px 18px', borderLeft: i ? '1px solid var(--line)' : 'none' }} className="t-meta">{h}</div>)}
        </div>
        {choose.map(([purpose, use, how, tone], i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '260px 190px 1fr', borderBottom: i < choose.length - 1 ? '1px solid var(--line)' : 'none' }}>
            <div style={{ padding: '13px 18px', fontSize: 13.5, color: 'var(--ink)' }}>{purpose}</div>
            <div style={{ padding: '13px 18px', borderLeft: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}><Dot tone={tone} size={7} /><span style={{ fontSize: 13, fontWeight: 600, color: toneColor(tone) }}>{use}</span></div>
            <div style={{ padding: '13px 18px', borderLeft: '1px solid var(--line)' }} className="t-small">{how}</div>
          </div>
        ))}
      </div>

      <Block meta="6 RULES">Rules for glanceable infographics</Block>
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
    id: 'infographics-kit', group: 'Infographics', name: 'Glanceable facts',
    interactive: true,
    blurb: 'Standalone visual facts for covers, dividers and summaries: icon-stat tiles, a divided stat band, numbered step ribbon, pictograph unit grid, diverging head-to-head bars and a milestone timeline. Abstract marks encode category only; the number always leads. A playbook frame maps purpose → element with six rules for keeping them glanceable.',
    frames: [
      { label: 'Infographic elements', mode: 'flow', w: W, node: libFrame },
      { label: 'Infographic playbook', mode: 'flow', w: W, node: guideFrame },
    ],
  });
})();
