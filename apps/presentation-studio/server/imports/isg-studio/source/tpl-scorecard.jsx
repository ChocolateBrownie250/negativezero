/* SCORECARD — side-by-side target comparison across weighted criteria. */

(function () {
  const W = 1200;
  const TARGETS = [
    { name: '[ Target A ]', profile: 'Compute', tone: 'p3', score: '8.4', verdict: 'Advance', vtone: 'ok' },
    { name: '[ Target B ]', profile: 'Database', tone: 'p2', score: '6.1', verdict: 'Watch', vtone: 'warn' },
    { name: '[ Target C ]', profile: 'AI', tone: 'p4', score: '4.7', verdict: 'Pass', vtone: 'bad' },
  ];
  const CRITERIA = [
    { label: 'Market & timing', weight: '20%', scores: [4, 3, 2] },
    { label: 'Technical moat', weight: '25%', scores: [5, 3, 2] },
    { label: 'Team', weight: '20%', scores: [4, 4, 3] },
    { label: 'Traction', weight: '20%', scores: [4, 2, 2] },
    { label: 'Fit with mandate', weight: '15%', scores: [5, 3, 3] },
  ];

  function Score({ n, tone }) {
    return (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: i <= n ? toneColor(tone) : 'color-mix(in srgb, var(--ink) 12%, transparent)' }} />
        ))}
      </div>
    );
  }

  const COLW = '1fr';
  const grid = `260px repeat(3, ${COLW})`;

  const node = (
    <div className="isg-scope" style={{ width: W, background: 'var(--bg)', color: 'var(--ink)', padding: '48px 56px 56px' }}>
      <Eyebrow>Company Scorecard</Eyebrow>
      <h1 style={{ fontSize: 38, fontWeight: 600, letterSpacing: '-0.03em', margin: '14px 0 4px' }}>Target comparison</h1>
      <p style={{ color: 'var(--ink-3)', fontSize: 14, margin: '0 0 28px' }}>[ Three targets, scored against the same weighted rubric. Scores are 1–5; the overall is the weighted roll-up. ]</p>

      {/* radar + weighted overview */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
        <div style={{ background: 'var(--grad-surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '20px 24px', boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset' }}>
          <div className="mono-label" style={{ fontSize: 11.5, marginBottom: 8 }}>Shape comparison</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <Radar size={236} max={5} axes={['Market', 'Moat', 'Team', 'Traction', 'Fit']} series={[
              { tone: 'ok', data: [4, 5, 4, 4, 5] },
              { tone: 'warn', data: [3, 3, 4, 2, 3] },
              { tone: 'bad', data: [2, 2, 3, 2, 3] },
            ]} />
            <Legend style={{ flexDirection: 'column', gap: 10 }} items={TARGETS.map((t) => ({ tone: t.vtone, label: t.name }))} />
          </div>
        </div>
        <div style={{ background: 'var(--grad-surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '20px 24px', boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset', display: 'flex', flexDirection: 'column' }}>
          <div className="mono-label" style={{ fontSize: 11.5, marginBottom: 16 }}>Weighted overall</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, justifyContent: 'center', flex: 1 }}>
            {TARGETS.map((t, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{t.name}</span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: toneColor(t.vtone) }}>{t.score}</span>
                    <Tag tone={t.vtone} variant="soft">{t.verdict}</Tag>
                  </span>
                </div>
                <Meter pct={parseFloat(t.score) * 10} tone={t.vtone} h={9} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
        {/* header */}
        <div style={{ display: 'grid', gridTemplateColumns: grid, background: 'var(--bg-1)', borderBottom: '1px solid var(--line)' }}>
          <div style={{ padding: '18px 22px' }}><span className="mono-label" style={{ fontSize: 11.5 }}>Criterion</span></div>
          {TARGETS.map((t, i) => (
            <div key={i} style={{ padding: '18px 22px', borderLeft: '1px solid var(--line)', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: toneColor(t.tone) }} />
              <Tag tone={t.tone}><Dot tone={t.tone} size={6} />{t.profile}</Tag>
              <div style={{ fontSize: 21, fontWeight: 600, margin: '12px 0 10px', letterSpacing: '-0.01em' }}>{t.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: '-0.03em', color: toneColor(t.vtone) }}>{t.score}</span>
                <Tag tone={t.vtone} variant="soft">{t.verdict}</Tag>
              </div>
            </div>
          ))}
        </div>
        {/* criteria rows */}
        {CRITERIA.map((c, ri) => (
          <div key={ri} style={{ display: 'grid', gridTemplateColumns: grid, borderBottom: ri < CRITERIA.length - 1 ? '1px solid var(--line)' : 'none', background: ri % 2 ? 'color-mix(in srgb, var(--ink) 2%, transparent)' : 'transparent' }}>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{c.label}</span>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '0.08em', color: 'var(--ink-4)' }}>WEIGHT · {c.weight}</span>
            </div>
            {c.scores.map((s, ci) => (
              <div key={ci} style={{ padding: '20px 22px', borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 9, justifyContent: 'center' }}>
                <Score n={s} tone={TARGETS[ci].vtone} />
                <span style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>[ one-line rationale for this score ]</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* legend */}
      <div style={{ display: 'flex', gap: 20, marginTop: 16, fontFamily: 'var(--f-mono)', fontSize: 12.5, color: 'var(--ink-4)', letterSpacing: '0.04em', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Dot tone="ok" size={7} />ADVANCE</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Dot tone="warn" size={7} />WATCH</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Dot tone="bad" size={7} />PASS</span>
        <span style={{ marginLeft: 'auto' }}>● = 1 point · scale 1–5</span>
      </div>
    </div>
  );

  window.ISG.register({
    id: 'scorecard', group: 'Scorecard', name: 'Target comparison matrix',
    blurb: 'Side-by-side evaluation of multiple targets against one weighted rubric. Verdict color (advance / watch / pass) carries through each column from the overall score down to the per-criterion dots.',
    frames: [{ label: 'Comparison', mode: 'flow', w: W, node }],
  });
})();
