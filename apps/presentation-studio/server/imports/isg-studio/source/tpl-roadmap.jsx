/* ═══════════════════════════════════════════════════════════════
   ROADMAP — interactive planning boards.
   Frame 1 · Quarters timeline (clickable phase bars + milestones)
   Frame 2 · Now / Next / Later (clickable initiative cards)
   Every phase, milestone and card is an Interactive element: click
   to open the Inspector with window, owner, scope and links.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  const W = 1920, H = 1080;

  function Slide({ eyebrow, title, accentWord, lead, children, foot, dots = 0.32 }) {
    return (
      <div className="isg-scope" data-screen-label={title} style={{
        width: W, height: H, background: 'var(--bg)', color: 'var(--ink)',
        padding: '72px 110px 64px', display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
      }}>
        {dots > 0 && <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, color-mix(in srgb, var(--ink) 11%, transparent) 1px, transparent 1px)', backgroundSize: '48px 48px', opacity: dots, pointerEvents: 'none' }} />}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'var(--tx-grain)', backgroundSize: '160px 160px', opacity: 0.4, mixBlendMode: 'overlay', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: -220, right: -120, width: 820, height: 640, background: 'radial-gradient(circle, var(--accent-soft), transparent 70%)', filter: 'blur(50px)', pointerEvents: 'none', opacity: 0.7 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'var(--f-mono)', fontSize: 20, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--accent)', position: 'relative' }}>
          <span style={{ width: 38, height: 2, background: 'var(--accent)' }} />{eyebrow}
        </div>
        <h1 style={{ fontSize: 46, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '16px 0 8px', position: 'relative' }}>
          {title} {accentWord && <span style={{ color: 'var(--accent)' }}>{accentWord}</span>}
        </h1>
        {lead && <div style={{ fontSize: 24, color: 'var(--ink-3)', maxWidth: 1180, lineHeight: 1.45, position: 'relative', marginBottom: 6 }}>{lead}</div>}
        <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>{children}</div>
        {foot && <div style={{ display: 'flex', gap: 28, marginTop: 14, position: 'relative', flexWrap: 'wrap', alignItems: 'center' }}>{foot}</div>}
      </div>
    );
  }

  /* ── Frame 1 · QUARTERS TIMELINE ─────────────────────────── */
  const COLS = ['Q1', 'Q2', 'Q3', 'Q4'];
  const PHASES = [
    { row: 0, ws: 'Discovery', s: 0, len: 1.2, tone: 'd-2', label: 'Research & scoping',
      detail: { kicker: 'Discovery · Q1', title: 'Research & scoping', tone: 'd-2', sub: '[ workstream owner ]',
        body: ['Click any phase to inspect its window, owner and exit criteria. Replace this with the goals for the phase.'],
        stats: [{ k: 'Window', v: 'Q1' }, { k: 'Owner', v: '[ team ]' }, { k: 'Exit', v: '[ signed scope ]' }], tags: ['[ interviews ]', '[ scoping ]'] } },
    { row: 1, ws: 'Foundations', s: 0.8, len: 1.7, tone: 'd-5', label: 'Platform groundwork',
      detail: { kicker: 'Foundations · Q1–Q2', title: 'Platform groundwork', tone: 'd-5', sub: '[ workstream owner ]',
        body: ['The enabling work everything else depends on.'], stats: [{ k: 'Window', v: 'Q1–Q2' }, { k: 'Owner', v: '[ team ]' }], tags: ['[ infra ]', '[ contracts ]'] } },
    { row: 2, ws: 'Build', s: 1.5, len: 1.7, tone: 'd-1', label: 'Core feature build',
      detail: { kicker: 'Build · Q2–Q3', title: 'Core feature build', tone: 'd-1', sub: '[ workstream owner ]',
        body: ['The headline deliverable. Coral marks the critical path.'], stats: [{ k: 'Window', v: 'Q2–Q3' }, { k: 'Owner', v: '[ team ]' }, { k: 'Risk', v: '[ critical path ]', vColor: 'var(--accent)' }], tags: ['[ critical ]'], links: [{ label: 'Open build plan', href: '#', primary: true }] } },
    { row: 3, ws: 'Pilot', s: 2.8, len: 0.8, tone: 'd-4', label: 'Design-partner pilot',
      detail: { kicker: 'Pilot · Q3', title: 'Design-partner pilot', tone: 'd-4', sub: '[ workstream owner ]',
        body: ['Limited rollout with design partners before GA.'], stats: [{ k: 'Window', v: 'Q3' }, { k: 'Cohort', v: '[ N partners ]' }] } },
    { row: 4, ws: 'Launch', s: 3.4, len: 0.6, tone: 'd-3', label: 'General availability',
      detail: { kicker: 'Launch · Q4', title: 'General availability', tone: 'd-3', sub: '[ workstream owner ]',
        body: ['Open the doors. Marketing, docs and support all live.'], stats: [{ k: 'Window', v: 'Q4' }, { k: 'Gate', v: '[ readiness review ]' }], tags: ['[ GA ]'] } },
  ];
  const MILESTONES = [
    { at: 1.2, row: 0, label: 'Scope locked', tone: 'd-2', detail: { kicker: 'Milestone', title: 'Scope locked', tone: 'd-2', body: ['The point where requirements freeze and build can begin.'], stats: [{ k: 'Date', v: '[ end Q1 ]' }] } },
    { at: 2.5, row: 1, label: 'Platform ready', tone: 'd-5', detail: { kicker: 'Milestone', title: 'Platform ready', tone: 'd-5', body: ['Foundations complete; feature teams unblocked.'], stats: [{ k: 'Date', v: '[ mid Q2 ]' }] } },
    { at: 3.2, row: 2, label: 'Feature complete', tone: 'd-1', detail: { kicker: 'Milestone', title: 'Feature complete', tone: 'd-1', body: ['All core features merged and code-frozen.'], stats: [{ k: 'Date', v: '[ end Q3 ]' }] } },
    { at: 4.0, row: 4, label: 'GA', tone: 'd-3', detail: { kicker: 'Milestone', title: 'General availability', tone: 'd-3', body: ['Public launch.'], stats: [{ k: 'Date', v: '[ end Q4 ]' }] } },
  ];

  function Timeline() {
    const labelW = 240, trackW = 1380, colW = trackW / 4, rowH = 92, gap = 18, topH = 44;
    const rows = PHASES.reduce((m, p) => Math.max(m, p.row), 0) + 1;
    const bodyH = rows * rowH + (rows - 1) * gap;
    const totalH = topH + bodyH;
    const xAt = (q) => labelW + q * colW;
    const yAt = (r) => topH + r * (rowH + gap);
    return (
      <div style={{ position: 'relative', width: labelW + trackW, height: totalH, margin: '0 auto' }}>
        {/* column rules + headers */}
        {COLS.map((c, i) => (
          <div key={c} style={{ position: 'absolute', left: xAt(i), top: 0, bottom: 0, width: colW, borderLeft: '1px solid var(--line)' }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 16, letterSpacing: '0.14em', color: 'var(--ink-4)', padding: '0 0 0 14px' }}>{c}</div>
          </div>
        ))}
        <div style={{ position: 'absolute', left: xAt(4), top: 0, bottom: 0, width: 1, background: 'var(--line)' }} />
        {/* phase bars */}
        {PHASES.map((p, i) => (
          <React.Fragment key={i}>
            <div style={{ position: 'absolute', left: 0, top: yAt(p.row) + rowH / 2 - 11, width: labelW - 18, fontSize: 19, fontWeight: 500, color: 'var(--ink-2)', textAlign: 'right' }}>{p.ws}</div>
            <Interactive detail={p.detail} cue="inspect" lift
              style={{
                position: 'absolute', left: xAt(p.s) + 6, top: yAt(p.row) + 12, width: p.len * colW - 12, height: rowH - 24,
                background: `var(--${p.tone}-fill), var(--${p.tone}-soft)`, border: `1.5px solid var(--${p.tone}-line)`,
                borderRadius: 12, padding: '0 22px', display: 'flex', alignItems: 'center', gap: 12,
                boxShadow: `var(--${p.tone}-glow)`,
              }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${p.tone})`, boxShadow: `0 0 10px var(--${p.tone})`, flexShrink: 0 }} />
              <span style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</span>
            </Interactive>
          </React.Fragment>
        ))}
        {/* milestones */}
        {MILESTONES.map((m, i) => (
          <Interactive key={i} detail={m.detail} lift={false}
            style={{ position: 'absolute', left: xAt(m.at) - 19, top: yAt(m.row) + rowH / 2 - 19, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title={m.label}>
            <span style={{ width: 20, height: 20, background: `var(--${m.tone})`, transform: 'rotate(45deg)', borderRadius: 4, boxShadow: `0 0 14px var(--${m.tone})`, border: '2px solid var(--bg)' }} />
          </Interactive>
        ))}
      </div>
    );
  }

  const timelineSlide = (
    <Slide eyebrow="Roadmap" title="Twelve months," accentWord="five workstreams"
      lead="Click any phase bar or milestone to inspect its window, owner and exit criteria."
      foot={[['d-1', 'Critical path'], ['d-5', 'Enabling'], ['d-2', 'Discovery'], ['d-3', 'Launch']].map(([t, l], i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 18, color: 'var(--ink-3)' }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, background: `var(--${t})` }} />{l}
        </div>
      )).concat([<div key="ms" style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 18, color: 'var(--ink-3)' }}><span style={{ width: 13, height: 13, background: 'var(--ink-3)', transform: 'rotate(45deg)', display: 'inline-block' }} />Milestone</div>])}>
      <Timeline />
    </Slide>
  );

  /* ── Frame 2 · NOW / NEXT / LATER ────────────────────────── */
  const HORIZONS = [
    { tag: 'Now', tone: 'd-1', sub: 'In flight this quarter', items: [
      { t: '[ Initiative A ]', s: '[ shipping ]', body: ['What is actively being built right now.'], stats: [{ k: 'Status', v: '[ in progress ]' }, { k: 'Owner', v: '[ team ]' }], links: [{ label: 'Tracking board', href: '#', primary: true }] },
      { t: '[ Initiative B ]', s: '[ shipping ]', body: ['Second active initiative.'], stats: [{ k: 'Status', v: '[ in progress ]' }] },
      { t: '[ Initiative C ]', s: '[ hardening ]', body: ['Stabilization work before release.'] },
    ] },
    { tag: 'Next', tone: 'd-4', sub: 'Committed, not started', items: [
      { t: '[ Initiative D ]', s: '[ committed ]', body: ['Planned for the following quarter.'], stats: [{ k: 'Status', v: '[ queued ]' }] },
      { t: '[ Initiative E ]', s: '[ committed ]', body: ['Dependent on Now items landing.'] },
    ] },
    { tag: 'Later', tone: 'd-5', sub: 'Under consideration', items: [
      { t: '[ Initiative F ]', s: '[ exploring ]', body: ['On the radar; not yet scoped.'] },
      { t: '[ Initiative G ]', s: '[ exploring ]', body: ['Opportunistic / stretch.'] },
      { t: '[ Initiative H ]', s: '[ idea ]', body: ['Raw idea awaiting validation.'] },
    ] },
  ];

  const horizonSlide = (
    <Slide eyebrow="Prioritization" title="Now," accentWord="next, later"
      lead="Three horizons of certainty. Click a card to inspect status, owner and links.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28, alignItems: 'start' }}>
        {HORIZONS.map((h, i) => (
          <div key={i} style={{ background: `var(--${h.tone}-fill), var(--${h.tone}-soft)`, border: `1.5px solid var(--${h.tone}-line)`, borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
            <div style={{ padding: '22px 26px 18px', borderBottom: `1px solid var(--${h.tone}-line)`, background: `color-mix(in srgb, var(--${h.tone}) 9%, transparent)` }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 15, letterSpacing: '0.16em', textTransform: 'uppercase', color: `var(--${h.tone})` }}>{h.tag}</div>
              <div style={{ fontSize: 19, color: 'var(--ink-3)', marginTop: 6 }}>{h.sub}</div>
            </div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {h.items.map((it, j) => (
                <Interactive key={j} cue="inspect" lift
                  detail={{ kicker: h.tag, title: it.t, tone: h.tone, sub: it.s, body: it.body, stats: it.stats, links: it.links }}
                  style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>{it.t}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase', color: `var(--${h.tone})`, marginTop: 8 }}>{it.s}</div>
                </Interactive>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Slide>
  );

  window.ISG.register({
    id: 'roadmap', group: 'Roadmap', name: 'Roadmap & timeline',
    interactive: true,
    blurb: 'Interactive planning boards: a four-quarter timeline with clickable phase bars and milestone diamonds, plus a Now / Next / Later prioritization grid. Every phase, milestone and initiative opens the Inspector with its window, owner, scope and links — coral marks the critical path.',
    frames: [
      { label: 'Quarters timeline', mode: 'board', w: W, h: H, node: timelineSlide },
      { label: 'Now / Next / Later', mode: 'board', w: W, h: H, node: horizonSlide },
    ],
  });
})();
