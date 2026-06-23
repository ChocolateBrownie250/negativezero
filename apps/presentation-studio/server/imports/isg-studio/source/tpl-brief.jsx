/* VISUAL BRIEF — market map (category landscape + positioning quadrant). */

(function () {
  const W = 1240;

  const CATS = [
    { name: '[ Segment A ]', tone: 'd-1', items: ['[ Co. ]', '[ Co. ]', '[ Co. ]', '[ Co. ]'] },
    { name: '[ Segment B ]', tone: 'd-2', items: ['[ Co. ]', '[ Co. ]', '[ Co. ]'] },
    { name: '[ Segment C ]', tone: 'd-3', items: ['[ Co. ]', '[ Co. ]', '[ Co. ]', '[ Co. ]', '[ Co. ]'] },
    { name: '[ Segment D ]', tone: 'd-4', items: ['[ Co. ]', '[ Co. ]'] },
    { name: '[ Segment E ]', tone: 'd-5', items: ['[ Co. ]', '[ Co. ]', '[ Co. ]'] },
  ];
  /* quadrant dots: x,y in 0..100, tone, label */
  const DOTS = [
    { x: 72, y: 28, tone: 'd-1', label: '[ A ]', big: true }, { x: 58, y: 46, tone: 'd-2', label: '[ B ]' },
    { x: 34, y: 36, tone: 'd-3', label: '[ C ]' }, { x: 24, y: 70, tone: 'd-4', label: '[ D ]' },
    { x: 80, y: 64, tone: 'd-5', label: '[ E ]' }, { x: 48, y: 78, tone: 'd-6', label: '[ F ]' },
  ];

  const node = (
    <div className="isg-scope" style={{ width: W, background: 'var(--bg)', color: 'var(--ink)', padding: '48px 56px 56px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
        <div>
          <Eyebrow>Market Map</Eyebrow>
          <h1 style={{ fontSize: 38, fontWeight: 600, letterSpacing: '-0.03em', margin: '14px 0 4px' }}>[ Category ] landscape</h1>
          <p style={{ color: 'var(--ink-3)', fontSize: 15, margin: 0 }}>[ The field as we segment it. Each column is a sub-segment; chips are tracked companies. ]</p>
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--ink-4)', letterSpacing: '0.06em', textAlign: 'right', lineHeight: 1.9 }}>
          <div>[ NN ] companies</div><div>[ N ] segments</div><div>UPDATED · [ DD-MM ]</div>
        </div>
      </div>

      {/* landscape columns */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${CATS.length}, 1fr)`, gap: 14, marginBottom: 32 }}>
        {CATS.map((c, i) => (
          <div key={i} style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)', borderTop: `2px solid var(--${c.tone})`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{c.name}</span>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11.5, color: 'var(--ink-4)' }}>{c.items.length}</span>
            </div>
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {c.items.map((it, j) => (
                <div key={j} style={{ background: `var(--${c.tone}-fill), var(--${c.tone}-soft)`, border: `1px solid var(--${c.tone}-line)`, borderRadius: 'var(--r)', padding: '10px 12px' }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{it}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>[ one-word note ]</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* quadrant + thesis */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <Card label="Positioning" pad="22px 24px">
          <div style={{ position: 'relative', width: '100%', aspectRatio: '1.35', marginTop: 8 }}>
            {/* axes */}
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--line-2)' }} />
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--line-2)' }} />
            {/* axis labels */}
            <span style={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', fontFamily: 'var(--f-mono)', fontSize: 11.5, letterSpacing: '0.1em', color: 'var(--ink-4)' }}>[ HIGH Y ]</span>
            <span style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', fontFamily: 'var(--f-mono)', fontSize: 11.5, letterSpacing: '0.1em', color: 'var(--ink-4)' }}>[ LOW Y ]</span>
            <span style={{ position: 'absolute', left: -10, top: '50%', transform: 'translateY(-50%) rotate(-90deg)', fontFamily: 'var(--f-mono)', fontSize: 11.5, letterSpacing: '0.1em', color: 'var(--ink-4)' }}>[ LOW X ]</span>
            <span style={{ position: 'absolute', right: -14, top: '50%', transform: 'translateY(-50%) rotate(90deg)', fontFamily: 'var(--f-mono)', fontSize: 11.5, letterSpacing: '0.1em', color: 'var(--ink-4)' }}>[ HIGH X ]</span>
            {/* dots */}
            {DOTS.map((d, i) => (
              <div key={i} style={{ position: 'absolute', left: `${d.x}%`, top: `${d.y}%`, transform: 'translate(-50%,-50%)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: d.big ? 16 : 11, height: d.big ? 16 : 11, borderRadius: '50%', background: toneColor(d.tone), boxShadow: d.big ? `0 0 0 5px color-mix(in srgb, ${toneColor(d.tone)} 22%, transparent)` : 'none' }} />
                <span style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: d.big ? 600 : 500 }}>{d.label}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card label="Where we'd play" pad="22px 24px" tone="accent" accentBar>
          <div style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--ink)', marginBottom: 16, textWrap: 'pretty' }}>[ The whitespace thesis in two sentences — which quadrant is underserved and why a position there fits the mandate. ]</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['[ Where the durable wedge is. ]', '[ Who already owns adjacent ground. ]', '[ The first target to approach. ]'].map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginTop: 7, flexShrink: 0 }} />{t}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );

  window.ISG.register({
    id: 'market-map', group: 'Visual brief', name: 'Market map & positioning',
    blurb: 'A landscape of a category: segmented columns of tracked companies above, a 2×2 positioning quadrant and a whitespace thesis below. The diagram palette segments the field; coral marks where we would play.',
    frames: [{ label: 'Market map', mode: 'flow', w: W, node }],
  });
})();
