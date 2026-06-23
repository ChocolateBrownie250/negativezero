/* ═══════════════════════════════════════════════════════════════
   ONE-PAGER KIT — everything for building great one-pagers.
   Frame 1 · Anatomy & principles  (the style-sheet guide)
   Frame 2 · Element library        (labeled reusable blocks)
   Frame 3 · Assembled example      (the kit in action)
   Showcases the improved lighting: elevation, colored glow, glass.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  const W = 1080;
  const Doc = ({ children, pad = '52px 60px 60px' }) => (
    <div className="isg-scope" style={{ width: W, background: 'var(--bg)', color: 'var(--ink)', padding: pad, position: 'relative' }}>{children}</div>
  );
  const Block = ({ children, meta }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 9, marginBottom: 18, marginTop: 36 }}>
      <h3 style={{ margin: 0 }} className="t-eyebrow">{children}</h3>
      {meta && <span className="t-meta">{meta}</span>}
    </div>
  );
  /* labeled wrapper for showing an element in the library */
  const Kit = ({ name, span, children, note }) => (
    <div style={{ gridColumn: span ? `span ${span}` : 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <span className="t-meta" style={{ color: 'var(--accent)' }}>{name}</span>
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        {note && <span className="t-meta">{note}</span>}
      </div>
      {children}
    </div>
  );
  const Bullet = ({ tone = 'ink2', children }) => (
    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '5px 0' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: toneColor(tone), marginTop: 8, flexShrink: 0 }} />
      <span className="t-body" style={{ margin: 0, fontSize: 13.5 }}>{children}</span>
    </div>
  );

  /* ── shared building blocks (the actual reusable elements) ── */
  const Masthead = ({ minimal }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div className="t-eyebrow">Executive Summary · Post-NDA</div>
        <h1 className="t-h1" style={{ margin: '12px 0 0' }}>[ Target Company ]</h1>
        {!minimal && <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Tag tone="p3"><Dot tone="p3" size={6} />[ Profile ]</Tag><Tag tone="ok" variant="soft">Engaged</Tag><Tag tone="accent" variant="soft">NDA</Tag>
        </div>}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="t-meta" style={{ lineHeight: 2 }}>PREPARED · [ DD-MM-YY ]<br />ANALYST · [ name ]<br />STAGE · [ diligence ]</div>
      </div>
    </div>
  );
  const Thesis = () => (
    <div className="tx-grain" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', borderRadius: 'var(--r-lg)', padding: '22px 26px', boxShadow: 'var(--glow-accent)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--grad-sheen)', pointerEvents: 'none' }} />
      <div className="t-eyebrow" style={{ marginBottom: 10, position: 'relative' }}>Thesis</div>
      <div className="t-h3" style={{ fontWeight: 400, fontSize: 18, lineHeight: 1.5, position: 'relative', letterSpacing: '-0.01em' }}>[ One paragraph stating the investment thesis in plain terms — what the company is, the specific wedge it owns, and why the position is rare. Open with the conclusion. ]</div>
    </div>
  );
  const StatTile = ({ label, value, tone = 'ink', sub, glow, spark }) => (
    <div style={{ flex: 1, background: 'var(--grad-surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '18px 22px', boxShadow: glow ? `var(--glow-${glow})` : 'var(--elev-1)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--grad-sheen)', pointerEvents: 'none' }} />
      <div className="t-meta" style={{ position: 'relative' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, position: 'relative', marginTop: 8 }}>
        <div className="t-num" style={{ fontSize: 32, color: tone === 'ink' ? 'var(--ink)' : toneColor(tone), lineHeight: 1 }}>{value}</div>
        {spark && <Sparkline data={spark} tone={tone === 'ink' ? 'd-2' : tone} w={56} h={24} dot={false} />}
      </div>
      {sub && <div className="t-small" style={{ position: 'relative', marginTop: 6 }}>{sub}</div>}
    </div>
  );
  const SignalPanel = ({ tone, head, items }) => (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '20px 22px', boxShadow: 'var(--elev-1)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: toneColor(tone), boxShadow: `0 0 14px ${toneColor(tone)}` }} />
      <div className="t-eyebrow" style={{ color: toneColor(tone), marginBottom: 12 }}>{head}</div>
      {items.map((t, i) => <Bullet key={i} tone={tone}>{t}</Bullet>)}
    </div>
  );
  const PullQuote = () => (
    <div style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 22 }}>
      <div className="t-h2" style={{ fontWeight: 400, letterSpacing: '-0.015em', lineHeight: 1.32, textWrap: 'pretty' }}>“[ A single sharp sentence the founder said that captures the whole opportunity. ]”</div>
      <div className="t-meta" style={{ marginTop: 12 }}>— [ NAME ], [ ROLE ]</div>
    </div>
  );
  const RecoBar = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, background: 'var(--accent-grad)', borderRadius: 'var(--r-lg)', padding: '20px 26px', boxShadow: 'var(--glow-accent)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--grad-sheen)', pointerEvents: 'none', opacity: 0.6 }} />
      <div style={{ position: 'relative' }}>
        <div className="t-meta" style={{ color: 'rgba(255,255,255,0.8)' }}>Recommendation</div>
        <div style={{ color: '#fff', fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em', marginTop: 4 }}>[ Advance to diligence · schedule architecture review ]</div>
      </div>
      <div style={{ position: 'relative', background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontFamily: 'var(--f-mono)', fontSize: 12.5, letterSpacing: '0.08em', padding: '8px 16px', borderRadius: 'var(--r-sm)', whiteSpace: 'nowrap' }}>NEXT · [ DD-MM ]</div>
    </div>
  );

  /* ── FRAME 1 · ANATOMY & PRINCIPLES ──────────────────────── */
  const anatomyRegions = [
    ['01', 'Masthead', 'Who, what stage, when. Identity + status tags + prep metadata. Top-left to top-right.', 'accent'],
    ['02', 'Thesis', 'The conclusion, first. One paragraph, glow callout. Never bury the lede.', 'd-1'],
    ['03', 'Facts strip', '3–4 headline numbers as tiles. Tabular figures. The scannable layer.', 'd-2'],
    ['04', 'Body', 'What they do / why it matters. Two columns, tight bullets, no walls of text.', 'd-3'],
    ['05', 'Signals vs risks', 'Balanced pair. Earth-tone status. Honesty builds trust.', 'd-4'],
    ['06', 'Recommendation', 'One line, one next step, one date. Accent bar. The ask.', 'd-5'],
  ];
  const principles = [
    ['Open with the conclusion', 'The reader decides in the first 10 seconds. Lead with the thesis, not the backstory.'],
    ['One thesis, one accent', 'A single argument carried by a single coral accent. Discipline reads as confidence.'],
    ['Numbers earn their place', 'Every figure is load-bearing and tabular. No decorative stats, no vanity metrics.'],
    ['Signal AND risk', 'Show both sides. A one-pager with no risks reads as a pitch, not an analysis.'],
    ['Scan in 30 seconds', 'Mono labels guide the eye; the masthead, thesis and reco alone should tell the story.'],
    ['Depth, not noise', 'Elevation and glow create hierarchy. Texture stays under 60% opacity, always behind.'],
  ];
  const anatomyFrame = (
    <Doc>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--ambient)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative' }}>
        <div className="t-eyebrow">One-pager Kit · Anatomy</div>
        <h1 className="t-display" style={{ fontSize: 'clamp(38px,4vw,54px)', margin: '14px 0 12px' }}>The shape of a<br /><span style={{ color: 'var(--accent)' }}>great one-pager.</span></h1>
        <p className="t-lead">Six regions, top to bottom, each with one job. The reader should grasp the whole story from the masthead, thesis and recommendation alone — everything else rewards a second pass.</p>
      </div>

      {/* annotated skeleton */}
      <Block meta="TOP → BOTTOM">Anatomy</Block>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24, alignItems: 'start' }}>
        {/* skeleton */}
        <div style={{ background: 'var(--grad-well)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'var(--elev-2)' }}>
          {[['01', 28, 'flex'], ['02', 40, 'accent'], ['03', 26, 'tiles'], ['04', 46, 'cols'], ['05', 34, 'pair'], ['06', 24, 'bar']].map(([n, h, kind], i) => (
            <div key={i} style={{ position: 'relative', height: h * 1.5, borderRadius: 6, border: '1px solid var(--line-2)', background: kind === 'accent' || kind === 'bar' ? 'var(--accent-soft)' : 'var(--bg-2)', display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', overflow: 'hidden' }}>
              <span className="t-meta" style={{ color: 'var(--accent)', fontSize: 11 }}>{n}</span>
              {kind === 'tiles' && <div style={{ display: 'flex', gap: 5, flex: 1 }}>{[0, 1, 2].map((k) => <div key={k} style={{ flex: 1, height: 16, borderRadius: 3, background: 'var(--bg-4)' }} />)}</div>}
              {kind === 'cols' && <div style={{ display: 'flex', gap: 5, flex: 1 }}>{[0, 1].map((k) => <div key={k} style={{ flex: 1, height: 40, borderRadius: 3, background: 'var(--bg-4)' }} />)}</div>}
              {kind === 'pair' && <div style={{ display: 'flex', gap: 5, flex: 1 }}>{[['ok'], ['bad']].map(([t], k) => <div key={k} style={{ flex: 1, height: 28, borderRadius: 3, background: `var(--${t}-bg)`, borderTop: `2px solid var(--${t})` }} />)}</div>}
              {(kind === 'flex') && <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between' }}><div style={{ width: 60, height: 10, borderRadius: 2, background: 'var(--bg-4)' }} /><div style={{ width: 30, height: 10, borderRadius: 2, background: 'var(--bg-4)' }} /></div>}
              {kind === 'bar' && <div style={{ flex: 1, height: 12, borderRadius: 2, background: 'linear-gradient(90deg, var(--accent), transparent)' }} />}
            </div>
          ))}
        </div>
        {/* region legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {anatomyRegions.map(([n, name, desc, tone], i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 150px 1fr', gap: 16, alignItems: 'center', padding: '13px 4px', borderBottom: i < anatomyRegions.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <span className="t-num" style={{ fontSize: 22, color: `var(--${tone})` }}>{n}</span>
              <span className="t-h3" style={{ fontSize: 15 }}>{name}</span>
              <span className="t-small">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* principles */}
      <Block meta="6 RULES">Principles</Block>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {principles.map(([t, d], i) => (
          <div key={i} style={{ background: 'var(--grad-surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '18px 20px', boxShadow: 'var(--elev-1)' }}>
            <div className="t-num" style={{ fontSize: 22, color: 'var(--accent)', opacity: 0.45 }}>{String(i + 1).padStart(2, '0')}</div>
            <div className="t-h3" style={{ fontSize: 15, margin: '8px 0 6px' }}>{t}</div>
            <div className="t-small" style={{ lineHeight: 1.5 }}>{d}</div>
          </div>
        ))}
      </div>
    </Doc>
  );

  /* ── FRAME 2 · ELEMENT LIBRARY ───────────────────────────── */
  const libFrame = (
    <Doc>
      <div className="t-eyebrow">One-pager Kit · Elements</div>
      <h1 className="t-h1" style={{ margin: '12px 0 8px' }}>Element library</h1>
      <p className="t-lead" style={{ fontSize: 16 }}>Every block below is a drop-in. Composed top-to-bottom they make the assembled example in the next frame.</p>

      <Block meta="HEADER">Masthead</Block>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Kit name="Masthead · full"><div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '22px 26px', boxShadow: 'var(--elev-1)' }}><Masthead /></div></Kit>
      </div>

      <Block meta="LEAD">Thesis callout</Block>
      <Kit name="Thesis · accent glow"><Thesis /></Kit>

      <Block meta="DATA">Stat tiles &amp; numerics</Block>
      <div style={{ display: 'flex', gap: 12 }}>
        <Kit name="Stat" span={1}><StatTile label="Headline" value="[ $4.8M ]" sub="ARR" spark={[2, 3, 4, 5, 7, 9]} /></Kit>
        <Kit name="Stat · glow" span={1}><StatTile label="Growth" value="[ 142% ]" tone="ok" sub="YoY" glow="ok" spark={[3, 4, 5, 6, 8, 11]} /></Kit>
        <Kit name="Stat" span={1}><StatTile label="Runway" value="[ 19 mo ]" sub="at current burn" /></Kit>
      </div>

      <Block meta="STATUS">Signal vs risk panels</Block>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Kit name="Signals"><SignalPanel tone="ok" head="Signals" items={['[ Positive signal with a number. ]', '[ Design-partner traction. ]', '[ Team quality. ]']} /></Kit>
        <Kit name="Risks"><SignalPanel tone="bad" head="Risks &amp; open questions" items={['[ Concentration / dependency risk. ]', '[ Open diligence question. ]', '[ Crowded-category caveat. ]']} /></Kit>
      </div>

      <Block meta="VOICE">Pull quote &amp; recommendation</Block>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
        <Kit name="Pull quote"><div style={{ padding: '6px 0' }}><PullQuote /></div></Kit>
        <Kit name="Recommendation bar"><RecoBar /></Kit>
      </div>
    </Doc>
  );

  /* ── FRAME 3 · ASSEMBLED EXAMPLE ─────────────────────────── */
  const exampleFrame = (
    <Doc>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--ambient)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <Masthead />
        <Thesis />
        <div style={{ display: 'flex', gap: 12 }}>
          <StatTile label="Headline ARR" value="[ $4.8M ]" sub="[ +0.6M QoQ ]" spark={[2, 3, 3, 4, 5, 7, 9]} />
          <StatTile label="Growth" value="[ 142% ]" tone="ok" sub="[ YoY ]" glow="ok" spark={[3, 4, 5, 6, 8, 11, 14]} />
          <StatTile label="Net retention" value="[ 128% ]" sub="[ trailing 12mo ]" spark={[5, 5, 6, 6, 7, 7, 8]} />
          <StatTile label="Runway" value="[ 19 mo ]" sub="[ at current burn ]" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '20px 22px', boxShadow: 'var(--elev-1)' }}>
            <div className="t-eyebrow" style={{ color: 'var(--ink-3)', marginBottom: 12 }}>What they do</div>
            <Bullet>[ Product in one sentence. ]</Bullet><Bullet>[ Core technical differentiator. ]</Bullet><Bullet>[ Who buys, and why now. ]</Bullet>
          </div>
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '20px 22px', boxShadow: 'var(--elev-1)' }}>
            <div className="t-eyebrow" style={{ marginBottom: 12 }}>Why it matters to us</div>
            <Bullet tone="accent">[ Fit with the mandate. ]</Bullet><Bullet tone="accent">[ Defensibility / moat read. ]</Bullet><Bullet tone="accent">[ Path to a position. ]</Bullet>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <SignalPanel tone="ok" head="Signals" items={['[ Positive signal with a specific number. ]', '[ Design-partner traction. ]']} />
          <SignalPanel tone="bad" head="Risks &amp; open questions" items={['[ Concentration / dependency risk. ]', '[ Open question for diligence. ]']} />
        </div>
        <RecoBar />
      </div>
    </Doc>
  );

  window.ISG.register({
    id: 'onepager-kit', group: 'One-pager kit', name: 'Elements & style guide',
    blurb: 'Everything for building great one-pagers: the six-region anatomy and six principles, a labeled library of drop-in elements (masthead, glow thesis callout, stat tiles, signal/risk panels, pull quote, recommendation bar) and a fully-assembled example. Built to show the improved lighting — elevation, colored glow and glass — at its best in both themes.',
    frames: [
      { label: 'Anatomy & principles', mode: 'flow', w: W, node: anatomyFrame },
      { label: 'Element library', mode: 'flow', w: W, node: libFrame },
      { label: 'Assembled example', mode: 'flow', w: W, node: exampleFrame },
    ],
  });
})();
