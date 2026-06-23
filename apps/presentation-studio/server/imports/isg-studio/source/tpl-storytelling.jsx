/* ═══════════════════════════════════════════════════════════════
   DATA STORYTELLING KIT — representation that carries a message.
   Charts answer "so what", not just "what". Annotated trend ·
   big-number lede · delta compare · KPI-vs-target · ranked
   emphasis · share breakdown — each paired with a takeaway line.
   Composes the viz kit; all color via tokens; theme-aware.
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

  /* The signature move: every chart states its conclusion in words. */
  const Takeaway = ({ children, tone = 'accent' }) => (
    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', marginTop: 16 }}>
      <span style={{ width: 22, height: 2, background: toneColor(tone), marginTop: 9, flexShrink: 0 }} />
      <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ink)', fontWeight: 500, textWrap: 'pretty' }}>{children}</div>
    </div>
  );
  const Panel = ({ children, style }) => (
    <div style={{ background: 'var(--grad-surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '22px 24px', boxShadow: 'var(--elev-1)', position: 'relative', overflow: 'hidden', ...style }}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--grad-sheen)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );

  /* ── 1 · ANNOTATED TREND — area chart that points at the moment ─ */
  function AnnotatedTrend({ data, labels, annIndex, annText, tone = 'd-2', w = 600, h = 210 }) {
    const max = Math.max(...data) * 1.12, min = Math.min(0, ...data), rng = (max - min) || 1;
    const padL = 8, padB = 24, padT = 26;
    const X = (i) => padL + (i / (data.length - 1)) * (w - padL * 2);
    const Y = (v) => padT + (1 - (v - min) / rng) * (h - padT - padB);
    const pts = data.map((v, i) => [X(i), Y(v)]);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const fill = `${line} L${X(data.length - 1).toFixed(1)},${Y(min)} L${padL},${Y(min)} Z`;
    const c = `var(--${tone})`;
    const ax = X(annIndex), ay = Y(data[annIndex]);
    return (
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
        <defs><linearGradient id="atrend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity="0.32" /><stop offset="100%" stopColor={c} stopOpacity="0.02" /></linearGradient></defs>
        {[0, 1, 2, 3].map((i) => { const y = padT + (i / 3) * (h - padT - padB); return <line key={i} x1={padL} y1={y} x2={w - padL} y2={y} stroke="var(--line)" strokeWidth="1" />; })}
        <path d={fill} fill="url(#atrend)" />
        <path d={line} fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* annotation guide + marker */}
        <line x1={ax} y1={ay} x2={ax} y2={h - padB} stroke="var(--accent)" strokeWidth="1.3" strokeDasharray="4,3" opacity="0.8" />
        <circle cx={ax} cy={ay} r="5" fill="var(--accent)" stroke="var(--bg-1)" strokeWidth="2" />
        <g transform={`translate(${Math.min(ax + 10, w - 184)}, 6)`}>
          <rect x="0" y="0" width="178" height="34" rx="7" fill="var(--bg-1)" stroke="var(--accent-line)" />
          <rect x="0" y="0" width="3" height="34" rx="1.5" fill="var(--accent)" />
          <text x="12" y="14" fill="var(--accent)" style={{ fontFamily: 'var(--f-mono)', fontSize: 8.5, letterSpacing: '0.12em' }}>INFLECTION</text>
          <text x="12" y="27" fill="var(--ink)" style={{ fontFamily: 'var(--f-sans)', fontSize: 12.5, fontWeight: 600 }}>{annText}</text>
        </g>
        {labels && labels.map((l, i) => <text key={i} x={X(i)} y={h - 6} textAnchor="middle" fill="var(--ink-4)" style={{ fontFamily: 'var(--f-mono)', fontSize: 11.5 }}>{l}</text>)}
      </svg>
    );
  }

  /* ── 2 · BIG-NUMBER LEDE — lead with the headline figure ──── */
  function BigNumberLede({ value, delta, deltaTone = 'ok', label, context, spark, tone = 'd-2' }) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <div className="t-meta">{label}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
            <span className="t-num" style={{ fontSize: 60, lineHeight: 0.9 }}>{value}</span>
            {delta && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--f-mono)', fontSize: 13, padding: '4px 10px', borderRadius: 99, background: `var(--${deltaTone}-bg)`, border: `1px solid var(--${deltaTone}-line)`, color: `var(--${deltaTone})` }}>{delta}</span>}
          </div>
          <div className="t-small" style={{ marginTop: 10, maxWidth: '46ch' }}>{context}</div>
        </div>
        {spark && <div style={{ paddingTop: 24 }}><Sparkline data={spark} tone={tone} w={160} h={56} /></div>}
      </div>
    );
  }

  /* ── 3 · DELTA COMPARE — before → after, change made explicit ─ */
  function DeltaCompare({ before, after, beforeLabel, afterLabel, change, tone = 'ok' }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ flex: 1, textAlign: 'center', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '18px 16px' }}>
          <div className="t-meta">{beforeLabel}</div>
          <div className="t-num" style={{ fontSize: 36, color: 'var(--ink-3)', marginTop: 8 }}>{before}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <svg width="40" height="16" viewBox="0 0 40 16"><path d="M2,8 H32" stroke={`var(--${tone})`} strokeWidth="2" /><path d="M27,3 L34,8 L27,13" fill="none" stroke={`var(--${tone})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 13, fontWeight: 600, color: `var(--${tone})` }}>{change}</span>
        </div>
        <div style={{ flex: 1, textAlign: 'center', background: `var(--${tone}-bg)`, border: `1px solid var(--${tone}-line)`, borderRadius: 'var(--r-lg)', padding: '18px 16px' }}>
          <div className="t-meta" style={{ color: `var(--${tone})` }}>{afterLabel}</div>
          <div className="t-num" style={{ fontSize: 36, color: 'var(--ink)', marginTop: 8 }}>{after}</div>
        </div>
      </div>
    );
  }

  /* ── 4 · KPI vs TARGET — bullet bar with goal marker ──────── */
  function KPIvTarget({ rows }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {rows.map((r, i) => {
          const hit = r.actual >= r.target;
          const tone = hit ? 'ok' : 'warn';
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 96px', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{r.label}</span>
              <div style={{ position: 'relative', height: 20, background: 'var(--bg-3)', borderRadius: 99 }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, r.actual)}%`, borderRadius: 99, background: `linear-gradient(90deg, var(--${tone}), color-mix(in srgb, var(--${tone}) 55%, transparent))` }} />
                <div style={{ position: 'absolute', left: `${Math.min(100, r.target)}%`, top: -4, bottom: -4, width: 2, background: 'var(--ink)', borderRadius: 1 }} title="target" />
              </div>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 13.5, textAlign: 'right', color: `var(--${tone})` }}>{r.actual}% <span style={{ color: 'var(--ink-4)' }}>/ {r.target}</span></span>
            </div>
          );
        })}
      </div>
    );
  }

  /* ── 5 · RANKED EMPHASIS — one bar carries the point ──────── */
  function RankedEmphasis({ items }) {
    const max = Math.max(...items.map((i) => i.value)) || 1;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((it, i) => {
          const tone = it.hero ? 'accent' : 'd-2';
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 64px', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 13, fontWeight: it.hero ? 600 : 400, color: it.hero ? 'var(--accent)' : 'var(--ink-2)' }}>{it.label}</span>
              <div style={{ height: 26, background: 'var(--bg-3)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
                <div style={{ width: `${(it.value / max) * 100}%`, height: '100%', background: it.hero ? 'var(--accent-grad)' : `color-mix(in srgb, var(--d-2) 55%, transparent)`, opacity: it.hero ? 1 : 0.7 }} />
              </div>
              <span className="t-num" style={{ fontSize: 16, textAlign: 'right', color: it.hero ? 'var(--accent)' : 'var(--ink-2)' }}>{it.display || it.value}</span>
            </div>
          );
        })}
      </div>
    );
  }

  /* ── FRAME 1 · STORYTELLING ELEMENTS ──────────────────────── */
  const libFrame = (
    <Doc>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--ambient)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative' }}>
        <div className="t-eyebrow">Data Storytelling · Elements</div>
        <h1 className="t-display" style={{ fontSize: 'clamp(36px,3.8vw,52px)', margin: '14px 0 12px' }}>A chart should<br /><span style={{ color: 'var(--accent)' }}>argue, not just plot.</span></h1>
        <p className="t-lead">Each element below pairs a representation with the sentence it proves. Lead with the number, point at the moment that matters, and always close with the takeaway. Raw chart primitives live in the viz kit — these are the framed, message-first versions.</p>
      </div>

      <Block meta="TREND">Annotated trend</Block>
      <Kit name="AnnotatedTrend" note="USE WHEN · one moment changed the curve">
        <Panel>
          <div className="t-meta" style={{ marginBottom: 6 }}>[ Metric ] · [ period ]</div>
          <AnnotatedTrend data={[8, 9, 11, 10, 13, 15, 14, 18, 24, 31, 38, 44]} labels={['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']} annIndex={8} annText="[ launch shipped ]" tone="d-2" />
          <Takeaway>[ State the conclusion the curve proves — e.g. "growth re-accelerated the month the new product shipped, not before." ]</Takeaway>
        </Panel>
      </Kit>

      <Block meta="HEADLINE">Big-number lede</Block>
      <Kit name="BigNumberLede" note="USE WHEN · one figure is the story">
        <Panel>
          <BigNumberLede label="[ Headline metric ]" value="[ 142% ]" delta="↑ [ +38pt ]" deltaTone="ok" context="[ One line of context that makes the number mean something — versus what, since when, compared to whom. ]" spark={[3, 4, 4, 5, 7, 9, 12, 16]} tone="d-3" />
          <Takeaway tone="d-3">[ The so-what: why this number changes the decision in front of the reader. ]</Takeaway>
        </Panel>
      </Kit>

      <Block meta="CHANGE">Delta &amp; KPI vs target</Block>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        <Kit name="DeltaCompare" note="USE WHEN · before → after impact">
          <Panel>
            <DeltaCompare beforeLabel="[ Before ]" before="[ 4.2s ]" afterLabel="[ After ]" after="[ 0.9s ]" change="−79%" tone="ok" />
            <Takeaway tone="ok">[ Name the intervention and the result in one breath. ]</Takeaway>
          </Panel>
        </Kit>
        <Kit name="KPIvTarget" note="USE WHEN · performance against a goal">
          <Panel>
            <KPIvTarget rows={[
              { label: '[ Adoption ]', actual: 82, target: 70 },
              { label: '[ Retention ]', actual: 61, target: 75 },
              { label: '[ NPS ]', actual: 90, target: 80 },
            ]} />
            <Takeaway>[ Call out the one bar that missed — that’s the conversation. ]</Takeaway>
          </Panel>
        </Kit>
      </div>

      <Block meta="RANKING & MIX">Ranked emphasis &amp; share</Block>
      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 20, alignItems: 'start' }}>
        <Kit name="RankedEmphasis" note="USE WHEN · one item dominates">
          <Panel>
            <RankedEmphasis items={[
              { label: '[ Segment A ]', value: 64, display: '[ 64% ]', hero: true },
              { label: '[ Segment B ]', value: 21, display: '[ 21% ]' },
              { label: '[ Segment C ]', value: 9, display: '[ 9% ]' },
              { label: '[ Segment D ]', value: 6, display: '[ 6% ]' },
            ]} />
            <Takeaway>[ Lead with the leader; the long tail is context, not the headline. ]</Takeaway>
          </Panel>
        </Kit>
        <Kit name="Donut + Legend" note="USE WHEN · composition of a whole">
          <Panel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
              <Donut size={132} thick={18} center="[ 64% ]" sub="share"
                segments={[{ value: 64, tone: 'accent' }, { value: 21, tone: 'd-2' }, { value: 9, tone: 'd-4' }, { value: 6, tone: 'd-5' }]} />
              <Legend items={[{ label: '[ A ]', tone: 'accent', value: '64%' }, { label: '[ B ]', tone: 'd-2', value: '21%' }, { label: '[ C ]', tone: 'd-4', value: '9%' }, { label: '[ D ]', tone: 'd-5', value: '6%' }]} style={{ flexDirection: 'column', gap: 9 }} />
            </div>
            <Takeaway>[ Emphasize one slice in coral; the rest recede to muted hues. ]</Takeaway>
          </Panel>
        </Kit>
      </div>
    </Doc>
  );

  /* ── FRAME 2 · STORYTELLING PLAYBOOK ──────────────────────── */
  const choose = [
    ['A single figure is the headline', 'Big-number lede', 'One value, one delta, one line of context. No chart needed.', 'd-3'],
    ['A trend turned at a moment', 'Annotated trend', 'Plot the line, then mark and name the inflection. Don’t make readers hunt.', 'd-2'],
    ['Something changed before→after', 'Delta compare', 'Two values + the % change + the cause. Direction colored by good/bad.', 'ok'],
    ['Performance against a goal', 'KPI vs target', 'Bar = actual, tick = target. Green clears, amber misses.', 'warn'],
    ['One category dominates', 'Ranked emphasis', 'Sort descending, highlight the leader in coral, mute the tail.', 'accent'],
    ['Parts of a whole', 'Donut + legend', 'Use for 2–5 slices only; emphasize one. Beyond five, switch to a bar.', 'd-5'],
  ];
  const rules = [
    ['Lead with the takeaway', 'Title the chart with the conclusion ("Growth re-accelerated"), not the dimension ("Revenue by month").'],
    ['One message per chart', 'If a chart needs two sentences to explain, it’s two charts. Split before you stack.'],
    ['Annotate the point', 'Mark the moment, slice or bar that matters. An unannotated chart makes the reader do your job.'],
    ['Label directly', 'Put labels on the data, not in a far-off key. Legends are a last resort, never the first.'],
    ['Be honest with the axis', 'Start bars at zero. Don’t truncate to exaggerate. Credibility is the whole point of a number.'],
    ['Mute everything but the point', 'Coral for the subject, one muted hue for context. Color spent everywhere signals nothing.'],
  ];
  const guideFrame = (
    <Doc>
      <div className="t-eyebrow">Data Storytelling · Playbook</div>
      <h1 className="t-h1" style={{ margin: '12px 0 8px' }}>Make the data talk</h1>
      <p className="t-lead" style={{ fontSize: 16 }}>Pick the representation from the message, then enforce the six rules. The goal is a reader who gets the point without reading the axis.</p>

      <Block meta="MESSAGE → REPRESENTATION">Decision guide</Block>
      <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--elev-1)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '260px 180px 1fr', background: 'var(--bg-2)', borderBottom: '1px solid var(--line)' }}>
          {['When the message is…', 'Use', 'How to apply it'].map((h, i) => <div key={i} style={{ padding: '11px 18px', borderLeft: i ? '1px solid var(--line)' : 'none' }} className="t-meta">{h}</div>)}
        </div>
        {choose.map(([msg, use, how, tone], i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '260px 180px 1fr', borderBottom: i < choose.length - 1 ? '1px solid var(--line)' : 'none' }}>
            <div style={{ padding: '13px 18px', fontSize: 13.5, color: 'var(--ink)' }}>{msg}</div>
            <div style={{ padding: '13px 18px', borderLeft: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}><Dot tone={tone} size={7} /><span style={{ fontSize: 13, fontWeight: 600, color: toneColor(tone) }}>{use}</span></div>
            <div style={{ padding: '13px 18px', borderLeft: '1px solid var(--line)' }} className="t-small">{how}</div>
          </div>
        ))}
      </div>

      <Block meta="6 RULES">Rules for honest, legible data</Block>
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
    id: 'data-storytelling', group: 'Data storytelling', name: 'Message-first charts',
    blurb: 'Representation that argues a point: annotated trend, big-number lede, before→after delta, KPI-vs-target bullet bars, ranked emphasis and an emphasized share donut — each paired with a takeaway line. A playbook frame maps message → representation and sets six rules for honest, legible data.',
    frames: [
      { label: 'Storytelling elements', mode: 'flow', w: W, node: libFrame },
      { label: 'Storytelling playbook', mode: 'flow', w: W, node: guideFrame },
    ],
  });
})();
