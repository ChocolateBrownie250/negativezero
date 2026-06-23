/* M&A DASHBOARD — app screens. Summary overview + pipeline board. */

(function () {
  const W = 1440;

  const Screen = ({ children }) => (
    <div className="isg-scope" style={{ width: W, background: 'var(--bg)', color: 'var(--ink)' }}>
      {/* app top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 36px', borderBottom: '1px solid var(--line)', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--f-mono)', fontSize: 13, letterSpacing: '0.04em' }}>
          <span style={{ background: 'var(--ink)', color: 'var(--bg)', padding: '2px 7px', borderRadius: 2, fontWeight: 700, letterSpacing: '0.08em' }}>[ ID ]</span>
          <span style={{ color: 'var(--ink-4)' }}>/</span><span style={{ color: 'var(--ink-3)' }}>Dashboards</span>
          <span style={{ color: 'var(--ink-4)' }}>/</span><span style={{ color: 'var(--ink)' }}>[ Snapshot ]</span>
        </div>
        <div style={{ display: 'flex', gap: 22, fontFamily: 'var(--f-mono)', fontSize: 13 }}>
          <span><span style={{ color: 'var(--accent)' }}>01</span> <span style={{ color: 'var(--ink)' }}>Summary</span></span>
          <span style={{ color: 'var(--ink-3)' }}>02 Pipeline</span>
          <span style={{ color: 'var(--ink-3)' }}>03 Gate</span>
        </div>
        <div style={{ width: 220, height: 30, borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 13, color: 'var(--ink-4)', fontFamily: 'var(--f-mono)' }}>Search…</div>
      </div>
      <div style={{ padding: '32px 36px 44px' }}>{children}</div>
    </div>
  );

  /* ── Summary ─────────────────────────────────────────────── */
  const summary = (
    <Screen>
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 18, marginBottom: 18 }}>
        {/* hero */}
        <div style={{ position: 'relative', background: 'linear-gradient(135deg, var(--accent-soft), transparent 70%)', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)', padding: '32px 36px', overflow: 'hidden' }}>
          <div className="mono-label" style={{ color: 'var(--accent)' }}>● [ Snapshot ] · Q_ / [ year ]</div>
          <div style={{ fontSize: 52, fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1.02, margin: '18px 0 8px', color: 'var(--accent)' }}>[ NN ] targets in active focus</div>
          <div style={{ fontSize: 19, color: 'var(--ink-2)' }}>across [ N ] profiles · [ N ] under NDA</div>
          <div style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.6, maxWidth: 460, marginTop: 14 }}>[ A live view of the pipeline. Numbers below derive from the card data; nothing is hand-typed. ]</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            <div style={{ background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 14, fontWeight: 600, padding: '11px 20px', borderRadius: 'var(--r)' }}>Open pipeline →</div>
            <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)', color: 'var(--ink-2)', fontSize: 14, padding: '11px 20px', borderRadius: 'var(--r)' }}>Engaged only ([ N ])</div>
          </div>
        </div>
        {/* funnel */}
        <Card label="Funnel" pad="24px 28px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 6 }}>
            <BarRow value="[ 10k+ ]" pct={100} label="Universe" sub="total addressable" tone="d-1" />
            <BarRow value="[ 500+ ]" pct={42} label="Longlist" sub="analyzed" tone="d-1" />
            <BarRow value="[ 100 ]" pct={22} label="Tracked" sub="in system" tone="d-1" />
            <BarRow value="[ 50 ]" pct={13} label="Qualified" sub="good targets" tone="d-1" />
            <BarRow value="[ 20 ]" pct={8} label="Active focus" sub="esp. attractive" tone="accent" />
          </div>
        </Card>
      </div>

      {/* status counts */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
        {[['Engaged', '[ 9 ]', 'ok', 'active dialogue', [4,5,5,6,7,8,9], '+2 wk'], ['Under question', '[ 1 ]', 'bad', 'decision deferred', [3,2,2,1,1,1,1], '−1 wk'], ['Waiting', '[ 11 ]', 'warn', 'awaiting reply', [8,9,9,10,11,11,11], '+1 wk'], ['Closed', '[ 12 ]', 'mute', 'not fit / hold', [6,7,9,10,11,12,12], '+1 wk']].map(([l, v, t, s, spark, delta], i) => (
          <div key={i} style={{ flex: 1, background: 'var(--grad-surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '20px 22px', position: 'relative', boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div className="mono-label" style={{ fontSize: 11.5 }}>{l}</div>
              <Dot tone={t} size={7} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, margin: '12px 0 2px' }}>
              <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1 }}>{v}</div>
              <div style={{ marginBottom: 4 }}><Sparkline data={spark} tone={t} w={70} h={28} dot={false} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{s}</div>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: `var(--${t})` }}>{delta}</span>
            </div>
          </div>
        ))}
      </div>

      {/* momentum + activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 18, marginBottom: 18 }}>
        <Card label="Pipeline momentum" sub="net active targets, trailing [ N ] weeks" pad="22px 26px">
          <div style={{ marginTop: 14 }}>
            <LineChart w={620} h={190}
              labels={['W1','W2','W3','W4','W5','W6','W7','W8']}
              lines={[
                { tone: 'accent', data: [12, 13, 15, 14, 17, 18, 19, 20] },
                { tone: 'd-2', dashed: true, data: [9, 9, 10, 11, 11, 12, 12, 13] },
              ]} />
            <Legend style={{ marginTop: 14 }} items={[{ tone: 'accent', label: 'Active focus' }, { tone: 'd-2', label: 'Engaged' }]} />
          </div>
        </Card>
        <Card label="Activity" sub="touches / day · last [ N ] weeks" pad="22px 26px">
          <div style={{ marginTop: 18 }}>
            <HeatStrip cols={14} cell={17} gap={4} tone="accent"
              data={[1,0,2,3,1,0,0, 2,4,3,1,2,0,1, 3,2,5,4,2,1,0, 1,3,2,4,3,2,1, 0,2,1,3,2,1,0, 2,3,4,2,1,0,2]} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontFamily: 'var(--f-mono)', fontSize: 11.5, color: 'var(--ink-4)', letterSpacing: '0.06em' }}>
              <span>LESS</span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>{[0.2,0.4,0.6,0.85,1].map((o,i)=><span key={i} style={{ width: 11, height: 11, borderRadius: 2, background: 'var(--accent)', opacity: o }} />)}</div>
              <span>MORE</span>
            </div>
          </div>
        </Card>
      </div>

      {/* by profile + next steps */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <Card label="By profile" pad="24px 28px">
          <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginTop: 8 }}>
            <Donut size={150} thick={20} center="[ 33 ]" sub="targets" segments={[
              { label: 'Storage', value: 8, tone: 'p1' }, { label: 'Database', value: 7, tone: 'p2' },
              { label: 'Compute', value: 6, tone: 'p3' }, { label: 'AI', value: 10, tone: 'p4' }, { label: 'OOS', value: 2, tone: 'p5' },
            ]} />
            <Legend style={{ flexDirection: 'column', gap: 11, flex: 1 }} items={[
              { tone: 'p1', label: 'Storage', value: 8 }, { tone: 'p2', label: 'Database', value: 7 },
              { tone: 'p3', label: 'Compute', value: 6 }, { tone: 'p4', label: 'AI', value: 10 }, { tone: 'p5', label: 'OOS', value: 2 },
            ]} />
          </div>
        </Card>
        <Card label="Next steps · upcoming" pad="20px 28px">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {['[ Target A ] · legal review of TS · [ DD-MM ]', '[ Target B ] · founder call · [ DD-MM ]', '[ Target C ] · architecture review · [ DD-MM ]', '[ Target D ] · diligence kick-off · [ DD-MM ]'].map((t, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: i < 3 ? '1px solid var(--line)' : 'none', fontSize: 13.5, color: 'var(--ink-2)' }}>
                <span>{t}</span><span style={{ color: 'var(--ink-4)' }}>→</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Screen>
  );

  /* ── Pipeline board ──────────────────────────────────────── */
  function PipeCard({ profile, tone, name, blurb, status, next, flags, meta }) {
    return (
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Tag tone={tone}><Dot tone={tone} size={6} />{profile}</Tag>
          <div style={{ display: 'flex', gap: 5 }}>{(flags || []).map((f, i) => <Tag key={i} tone="accent" variant="soft">{f}</Tag>)}</div>
        </div>
        <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em' }}>{name}</div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>{blurb}</div>
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ display: 'flex', gap: 14, fontSize: 13 }}><span style={{ fontFamily: 'var(--f-mono)', fontSize: 11.5, letterSpacing: '0.08em', color: 'var(--ink-4)', width: 44 }}>STATUS</span><span style={{ color: 'var(--ink-2)' }}>{status}</span></div>
          <div style={{ display: 'flex', gap: 14, fontSize: 13 }}><span style={{ fontFamily: 'var(--f-mono)', fontSize: 11.5, letterSpacing: '0.08em', color: 'var(--ink-4)', width: 44 }}>NEXT</span><span style={{ color: 'var(--ink-2)' }}>{next}</span></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--f-mono)', fontSize: 12.5, color: 'var(--ink-4)', letterSpacing: '0.04em' }}><span>{meta[0]}</span><span>{meta[1]} ↗</span></div>
      </div>
    );
  }
  const COLUMNS = [
    { name: 'Engaged', tone: 'ok', count: '[ 9 ]', cards: [
      { profile: 'Compute', tone: 'p3', name: '[ Target A ]', blurb: '[ One-line description of the product. ]', status: 'Term sheet draft', next: 'Legal review · [ DD-MM ]', flags: ['NDA'], meta: ['[ 4d ago ]', 'US · 18'] },
      { profile: 'Database', tone: 'p2', name: '[ Target B ]', blurb: '[ One-line description. NDA signed. ]', status: 'Awaiting next step', next: 'Founder call · [ DD-MM ]', flags: ['NDA'], meta: ['[ 1w ago ]', 'IL · 22'] },
    ] },
    { name: 'Under question', tone: 'bad', count: '[ 1 ]', cards: [
      { profile: 'Storage', tone: 'p1', name: '[ Target C ]', blurb: '[ Governance + cataloging. ]', status: 'Reviewing', next: 'Decision call · [ DD-MM ]', flags: [], meta: ['[ 4w ago ]', 'EU · 16'] },
    ] },
    { name: 'Waiting', tone: 'warn', count: '[ 11 ]', cards: [
      { profile: 'Database', tone: 'p2', name: '[ Target D ]', blurb: '[ Promising but very early. ]', status: 'Awaiting reply', next: 'Follow-up · [ DD-MM ]', flags: [], meta: ['[ 2w ago ]', 'US · 5'] },
      { profile: 'AI', tone: 'p4', name: '[ Target E ]', blurb: '[ LLM gateway with controls. ]', status: 'Awaiting reply', next: 'Re-ping · [ DD-MM ]', flags: [], meta: ['[ 3w ago ]', 'US · 6'] },
    ] },
    { name: 'Closed', tone: 'mute', count: '[ 12 ]', cards: [
      { profile: 'OOS', tone: 'p5', name: '[ Target F ]', blurb: '[ Decided not a fit; thesis mismatch. ]', status: 'Passed', next: '—', flags: ['NOT FIT'], meta: ['[ 4w ago ]', 'UK · 25'] },
    ] },
  ];
  const pipeline = (
    <Screen>
      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '14px 20px', marginBottom: 22 }}>
        <span className="mono-label" style={{ fontSize: 11.5 }}>Group by</span>
        <div style={{ display: 'inline-flex', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: 2, gap: 2 }}>
          {['Status', 'Profile', 'None'].map((s, i) => <span key={i} style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, padding: '5px 12px', borderRadius: 3, background: i === 0 ? 'var(--bg-4)' : 'transparent', color: i === 0 ? 'var(--ink)' : 'var(--ink-3)' }}>{s}</span>)}
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
          {[['Storage', 'p1'], ['Database', 'p2'], ['Compute', 'p3'], ['AI', 'p4'], ['OOS', 'p5']].map(([l, t], i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-2)', padding: '4px 10px', borderRadius: 100, background: 'var(--bg-2)', border: '1px solid var(--line)' }}><Dot tone={t} size={6} />{l}</span>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--f-mono)', fontSize: 12.5, color: 'var(--ink-4)' }}>[ 33 / 33 ] targets</span>
      </div>
      {/* columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, alignItems: 'start' }}>
        {COLUMNS.map((col, ci) => (
          <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px' }}>
              <Dot tone={col.tone} size={9} />
              <span style={{ fontSize: 15, fontWeight: 600 }}>{col.name}</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--ink-3)', background: 'var(--bg-2)', padding: '2px 8px', borderRadius: 'var(--r-sm)' }}>{col.count}</span>
            </div>
            {col.cards.map((c, i) => <PipeCard key={i} {...c} />)}
          </div>
        ))}
      </div>
    </Screen>
  );

  window.ISG.register({
    id: 'ma-dashboard', group: 'M&A dashboard', name: 'Pipeline dashboard',
    blurb: 'App-style screens for a live deal pipeline. A summary overview (hero, funnel, status counts, profile mix, next steps) and a status-grouped kanban board. Profile taxonomy hues categorize; coral stays the one accent.',
    frames: [
      { label: 'Summary', mode: 'flow', w: W, node: summary },
      { label: 'Pipeline board', mode: 'flow', w: W, node: pipeline },
    ],
  });
})();
