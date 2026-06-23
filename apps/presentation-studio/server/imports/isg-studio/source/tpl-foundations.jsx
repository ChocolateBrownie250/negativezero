/* ═══════════════════════════════════════════════════════════════
   FOUNDATIONS — the system's own reference pages.
   Frame 1 · Typography (philosophy, three voices, scale, hierarchy)
   Frame 2 · Texture & surface (grain, dots, hatch, mesh, elevation)
   These document the system AND act as a visual QA surface.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  const W = 1100;
  const Doc = ({ children }) => (
    <div className="isg-scope" style={{ width: W, background: 'var(--bg)', color: 'var(--ink)', position: 'relative' }}>{children}</div>
  );
  const Sec = ({ children, top, style }) => (
    <section style={{ padding: '46px 64px', borderTop: top ? '1px solid var(--line)' : 'none', position: 'relative', ...style }}>{children}</section>
  );
  const Block = ({ children, meta }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 9, marginBottom: 20, marginTop: 8 }}>
      <h3 style={{ margin: 0 }} className="t-eyebrow">{children}</h3>
      {meta && <span className="t-meta">{meta}</span>}
    </div>
  );

  /* ── FRAME 1 · TYPOGRAPHY ─────────────────────────────────── */
  const voices = [
    { fam: 'var(--f-sans)', name: 'Geist', role: 'Display voice', use: 'Titles · headline numbers', note: 'Negative tracking, near-1 leading. Speaks loudly, briefly.', sample: 'The clean separation', glyph: 'Ag' },
    { fam: 'var(--f-text)', name: 'Geist', role: 'Reading voice', use: 'Body · paragraphs · leads', note: 'Neutral tracking, 1.6 leading, capped measure.', sample: 'Built around a single contract.', glyph: 'Rg' },
    { fam: 'var(--f-mono)', name: 'Geist Mono', role: 'System voice', use: 'Labels · metadata · data', note: 'Uppercase, wide tracking. Feels instrumented.', sample: 'COLLECTOR · v2.1', glyph: '0x' },
  ];
  const scale = [
    ['Display', 't-display', '64 / −0.035em / 1.0', 'One per view. Owns the hierarchy.', 'Aa'],
    ['Heading 1', 't-h1', '30 / −0.028em / 1.08', 'Section titles.', 'Aa'],
    ['Heading 2', 't-h2', '22 / −0.02em / 1.15', 'Sub-sections, card titles.', 'Aa'],
    ['Heading 3', 't-h3', '17 / −0.012em / 1.25', 'Inline headers.', 'Aa'],
    ['Lead', 't-lead', '18 / −0.006em / 1.55', 'Standfirst under a title.', 'Aa'],
    ['Body', 't-body', '14 / 0 / 1.62', 'Reading copy. Measure ≤ 68ch.', 'Aa'],
    ['Eyebrow', 't-eyebrow', '11 / +0.18em / mono', 'Introduces. Always uppercase.', 'Aa'],
    ['Meta', 't-meta', '10 / +0.1em / mono', 'Timestamps, counts, ids.', 'Aa'],
  ];
  const typoFrame = (
    <Doc>
      <Sec style={{ paddingBottom: 30 }}>
        <div className="tx-mesh" style={{ position: 'absolute', inset: 0, opacity: 0.6, pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div className="t-eyebrow">Foundations · Typography</div>
          <h1 className="t-display" style={{ margin: '16px 0 14px', maxWidth: 18 + 'ch' }}>Three voices,<br /><span style={{ color: 'var(--accent)' }}>one system.</span></h1>
          <p className="t-lead">Type does the heavy lifting in a system with no logo. Mono labels <em style={{ fontStyle: 'normal', color: 'var(--ink)' }}>introduce</em>, Display <em style={{ fontStyle: 'normal', color: 'var(--ink)' }}>states</em>, Text <em style={{ fontStyle: 'normal', color: 'var(--ink)' }}>explains</em>. Numbers are always tabular so data never dances.</p>
        </div>
      </Sec>

      <Sec top>
        <Block meta="GEIST FAMILY">The three voices</Block>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {voices.map((v, i) => (
            <div key={i} style={{ background: 'var(--grad-surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '22px 24px', boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset', position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="t-meta" style={{ color: 'var(--accent)' }}>{v.role}</div>
                  <div className="t-h3" style={{ marginTop: 6 }}>{v.name}</div>
                </div>
                <div style={{ fontFamily: v.fam, fontSize: 52, fontWeight: 600, color: 'var(--ink-4)', lineHeight: 0.8, letterSpacing: '-0.03em' }}>{v.glyph}</div>
              </div>
              <div style={{ fontFamily: v.fam, fontSize: 22, color: 'var(--ink)', margin: '20px 0 14px', letterSpacing: i === 2 ? '0.04em' : '-0.01em', textTransform: i === 2 ? 'uppercase' : 'none', minHeight: 56 }}>{v.sample}</div>
              <div className="t-meta" style={{ marginBottom: 6 }}>{v.use}</div>
              <div className="t-small" style={{ lineHeight: 1.5 }}>{v.note}</div>
            </div>
          ))}
        </div>
      </Sec>

      <Sec top>
        <Block meta="MODULAR SCALE · 8 STEPS">Type scale &amp; hierarchy</Block>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {scale.map(([name, cls, spec, use], i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 230px', gap: 24, alignItems: 'center', padding: '15px 0', borderBottom: i < scale.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <div className="t-meta">{name}</div>
              <div className={cls} style={{ margin: 0, color: 'var(--ink)', maxWidth: 'none' }}>{cls === 't-eyebrow' || cls === 't-meta' ? 'The quick brown fox' : 'The quick brown fox'}</div>
              <div>
                <div className="t-mono" style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{spec}</div>
                <div className="t-small" style={{ fontSize: 12.5, marginTop: 2 }}>{use}</div>
              </div>
            </div>
          ))}
        </div>
      </Sec>

      <Sec top>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 32 }}>
          <div>
            <Block>Hierarchy in practice</Block>
            <div style={{ background: 'var(--grad-surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '28px 30px' }}>
              <div className="t-eyebrow">Technology Architecture</div>
              <div className="t-h1" style={{ margin: '12px 0 10px' }}>One agent, every source</div>
              <div className="t-lead" style={{ fontSize: 16, marginBottom: 14 }}>A stateless collector pulls metadata from each system and emits a single portable contract.</div>
              <div className="t-body" style={{ fontSize: 13.5 }}>Downstream services read that contract — no system holds a second copy of the truth. The separation is what makes the platform portable across deployment surfaces.</div>
              <div className="t-meta" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>UPDATED 05·06 · COLLECTOR v2.1 · 1 of 5</div>
            </div>
          </div>
          <div>
            <Block>Tabular numerics</Block>
            <div style={{ background: 'var(--grad-surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '24px 26px' }}>
              <div className="t-small" style={{ marginBottom: 16 }}>Figures align in columns and hold width across states — essential for live data.</div>
              {[['ARR', '$ 4,820,000'], ['Growth', '+ 142.0 %'], ['Burn', '$ 318,400 / mo'], ['Runway', '19 mo']].map(([k, v], i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '11px 0', borderBottom: i < 3 ? '1px solid var(--line)' : 'none' }}>
                  <span className="t-meta">{k}</span>
                  <span className="t-num" style={{ fontSize: 19, color: 'var(--ink)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Sec>
    </Doc>
  );

  /* ── FRAME 2 · TEXTURE & SURFACE ──────────────────────────── */
  const textures = [
    ['tx-dots', 'Dot-grid', 'Engineering ground. Slides, wells.'],
    ['tx-dots-lg', 'Dot-grid · wide', 'Large surfaces, covers.'],
    ['tx-hatch', 'Hatch', 'Scoped / provisional zones.'],
    ['tx-hatch-accent', 'Hatch · accent', 'Highlighted region fills.'],
    ['tx-mesh', 'Radial mesh', 'Atmospheric color wash.'],
    ['tx-rings', 'Scope rings', 'Centered / hub artwork.'],
    ['tx-grain', 'Film grain', 'Overlay for tactile depth.'],
    ['tx-sheen', 'Sheen', 'Glassy top-light pass.'],
  ];
  const texFrame = (
    <Doc>
      <Sec>
        <div className="t-eyebrow">Foundations · Texture &amp; Surface</div>
        <h1 className="t-display" style={{ margin: '16px 0 14px', fontSize: 'clamp(38px,4vw,56px)' }}>Depth, not decoration.</h1>
        <p className="t-lead">Every texture is a thin, theme-aware layer set behind content at low opacity. They create atmosphere and signal meaning — never compete with it.</p>
      </Sec>

      <Sec top>
        <Block meta="8 LAYERS">Texture library</Block>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {textures.map(([cls, name, use], i) => (
            <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden', background: 'var(--bg-1)' }}>
              <div className={cls} style={{ height: 104, backgroundColor: cls === 'tx-mesh' || cls === 'tx-sheen' ? undefined : 'var(--bg-2)', position: 'relative' }}>
                {cls === 'tx-grain' && <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-2)' }} />}
              </div>
              <div style={{ padding: '12px 14px', borderTop: '1px solid var(--line)' }}>
                <div className="t-mono" style={{ fontSize: 12.5, color: 'var(--accent)' }}>.{cls}</div>
                <div className="t-h3" style={{ fontSize: 14, marginTop: 4 }}>{name}</div>
                <div className="t-small" style={{ fontSize: 12.5, marginTop: 3 }}>{use}</div>
              </div>
            </div>
          ))}
        </div>
      </Sec>

      <Sec top>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          <div>
            <Block meta="5 STOPS">Surface elevation</Block>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {['--bg', '--bg-1', '--bg-2', '--bg-3', '--bg-4'].map((v, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, background: `var(${v})`, border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: '16px 18px' }}>
                  <span className="t-mono" style={{ fontSize: 13, color: 'var(--ink)' }}>{v}</span>
                  <span className="t-meta" style={{ marginLeft: 'auto' }}>{['base canvas', 'card', 'raised', 'well / input', 'top'][i]}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Block meta="6 HUES">Gradient node fills</Block>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} style={{ background: `var(--d-${n}-fill), var(--bg-1)`, border: `1.5px solid var(--d-${n}-line)`, borderRadius: 'var(--r-lg)', padding: '18px 16px', position: 'relative', overflow: 'hidden', boxShadow: `var(--d-${n}-glow)` }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: `var(--d-${n})`, boxShadow: `0 0 12px var(--d-${n})` }} />
                  <div className="t-mono" style={{ fontSize: 12.5, color: `var(--d-${n})` }}>--d-{n}</div>
                  <div className="t-h3" style={{ fontSize: 14, marginTop: 6 }}>Node fill</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Sec>
    </Doc>
  );

  window.ISG.register({
    id: 'foundations', group: 'Foundations', name: 'Typography & texture',
    blurb: 'The system\u2019s own reference. Typography philosophy — three Geist voices (Display states, Text explains, Mono labels), an eight-step scale, hierarchy in practice and tabular numerics. Plus the texture library, surface-elevation scale and gradient node fills that give every deliverable depth.',
    frames: [
      { label: 'Typography', mode: 'flow', w: W, node: typoFrame },
      { label: 'Texture & surface', mode: 'flow', w: W, node: texFrame },
    ],
  });
})();
