/* EXECUTIVE SUMMARY — scrollable one-pager (post-call / post-NDA brief). */

(function () {
  const W = 1040;

  const Page = ({ children }) => (
    <div className="isg-scope" style={{ width: W, background: 'var(--bg)', color: 'var(--ink)', padding: '56px 64px 64px' }}>{children}</div>
  );

  const TwoCol = ({ children }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>{children}</div>
  );

  const Bullet = ({ tone = 'ink2', children }) => (
    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.6, color: 'var(--ink-2)', padding: '5px 0' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: toneColor(tone), marginTop: 8, flexShrink: 0 }} />
      <span>{children}</span>
    </div>
  );

  const node = (
    <Page>
      {/* Masthead */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <Eyebrow>Executive Summary · Post-NDA</Eyebrow>
          <h1 style={{ fontSize: 44, fontWeight: 600, letterSpacing: '-0.03em', margin: '16px 0 0' }}>[ Target&nbsp;Company ]</h1>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <Tag tone="p3">[ Profile ]</Tag>
            <Tag tone="ok" variant="soft">Engaged</Tag>
            <Tag tone="accent" variant="soft">NDA</Tag>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontFamily: 'var(--f-mono)', fontSize: 12.5, color: 'var(--ink-3)', letterSpacing: '0.06em', lineHeight: 2 }}>
          <div>PREPARED · [ DD-MM-YYYY ]</div>
          <div>ANALYST · [ name ]</div>
          <div>STAGE · [ diligence ]</div>
        </div>
      </div>

      {/* Thesis callout */}
      <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', borderRadius: 'var(--r-lg)', padding: '22px 26px', marginBottom: 26 }}>
        <div className="mono-label" style={{ color: 'var(--accent)', marginBottom: 10 }}>Thesis</div>
        <div style={{ fontSize: 19, lineHeight: 1.55, color: 'var(--ink)', fontWeight: 400, textWrap: 'pretty' }}>[ One paragraph stating the investment thesis in plain terms — what the company is, the specific wedge it owns, and why the position is rare. Open with the conclusion. ]</div>
      </div>

      {/* Facts + snapshot */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 16, marginBottom: 26 }}>
        <Card label="Company snapshot" pad="22px 24px">
          <KVList rows={[
            { k: 'Founded', v: '[ year ]' }, { k: 'HQ', v: '[ region ]' }, { k: 'Team', v: '[ N ] people' },
            { k: 'Stage', v: '[ Series _ ]' }, { k: 'Profile', v: '[ category ]' }, { k: 'Last raise', v: '[ $Xm · date ]' },
          ]} />
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <StatCard label="Headline" value="[ $XM ]" tone="ink" sub="[ ARR / metric ]" />
            <StatCard label="Growth" value="[ XX% ]" tone="ok" sub="[ YoY ]" />
          </div>
          <Card label="Revenue trajectory" sub="[ trailing 8 quarters ]" pad="18px 22px">
            <div style={{ marginTop: 10 }}>
              <AreaChart series={[12, 15, 19, 23, 28, 36, 44, 55]} tone="ok" w={460} h={110} grid={3} labels={['Q1','Q2','Q3','Q4','Q5','Q6','Q7','Q8']} />
            </div>
          </Card>
        </div>
      </div>

      <div style={{ marginBottom: 26 }}>
        <Card label="Relationship" pad="16px 22px" tone="ok" accentBar>
          <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 }}>[ Current posture, who owns the relationship, and the single next step that moves it forward. ]</div>
        </Card>
      </div>

      {/* What / Why */}
      <TwoCol>
        <Card label="What they do" pad="22px 24px">
          <Bullet>[ Product in one sentence. ]</Bullet>
          <Bullet>[ Core technical differentiator. ]</Bullet>
          <Bullet>[ Who buys, and why now. ]</Bullet>
        </Card>
        <Card label="Why it matters to us" pad="22px 24px">
          <Bullet tone="accent">[ Fit with the mandate. ]</Bullet>
          <Bullet tone="accent">[ Defensibility / moat read. ]</Bullet>
          <Bullet tone="accent">[ Path to a position. ]</Bullet>
        </Card>
      </TwoCol>

      <div style={{ height: 16 }} />

      {/* Signals / Risks */}
      <TwoCol>
        <Card label="Signals" pad="22px 24px" tone="ok" accentBar>
          <Bullet tone="ok">[ Positive signal with a specific number. ]</Bullet>
          <Bullet tone="ok">[ Positive signal — design-partner traction. ]</Bullet>
          <Bullet tone="ok">[ Positive signal — team quality. ]</Bullet>
        </Card>
        <Card label="Risks & open questions" pad="22px 24px" tone="bad" accentBar>
          <Bullet tone="bad">[ Concentration / dependency risk. ]</Bullet>
          <Bullet tone="warn">[ Open question for diligence. ]</Bullet>
          <Bullet tone="warn">[ Crowded-category caveat. ]</Bullet>
        </Card>
      </TwoCol>

      {/* Recommendation */}
      <div style={{ marginTop: 26, borderTop: '1px solid var(--line)', paddingTop: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
        <div>
          <div className="mono-label" style={{ marginBottom: 8 }}>Recommendation</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>[ Advance to diligence · schedule architecture review ]</div>
        </div>
        <Tag tone="accent" variant="solid" style={{ fontSize: 13, padding: '8px 16px' }}>Next · [ DD-MM ]</Tag>
      </div>
    </Page>
  );

  window.ISG.register({
    id: 'exec-summary', group: 'Executive summary', name: 'Post-call / post-NDA brief',
    blurb: 'A disciplined one-pager: thesis up top, snapshot facts, what / why, then signals vs risks in the earth-tone status gamut, closing on a single recommendation. Scrolls on screen, prints clean to PDF.',
    frames: [{ label: 'One-pager', mode: 'flow', w: W, node }],
  });
})();
