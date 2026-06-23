/* CALL NOTES — dense post-call cheatsheet. Mono-forward reference sheet. */

(function () {
  const W = 1000;

  const Section = ({ label, children }) => (
    <div style={{ marginBottom: 22 }}>
      <div className="mono-label" style={{ color: 'var(--ink-2)', borderBottom: '1px dashed var(--line)', paddingBottom: 7, marginBottom: 11 }}>{label}</div>
      {children}
    </div>
  );
  const Line = ({ tone = 'ink2', children }) => (
    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)', padding: '4px 0' }}>
      <span style={{ fontFamily: 'var(--f-mono)', color: toneColor(tone), flexShrink: 0, marginTop: 1 }}>›</span><span>{children}</span>
    </div>
  );
  const Check = ({ children, owner, due }) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
      <span style={{ width: 15, height: 15, borderRadius: 'var(--r-xs)', border: '1.5px solid var(--accent-line)', flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>{children}</div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11.5, letterSpacing: '0.06em', color: 'var(--ink-4)', marginTop: 3 }}>{owner} · {due}</div>
      </div>
    </div>
  );

  const node = (
    <div className="isg-scope" style={{ width: W, background: 'var(--bg)', color: 'var(--ink)', padding: '48px 52px 56px' }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--line)', paddingBottom: 22, marginBottom: 24 }}>
        <div>
          <Eyebrow>Call Notes</Eyebrow>
          <h1 style={{ fontSize: 34, fontWeight: 600, letterSpacing: '-0.025em', margin: '14px 0 10px' }}>[ Company ] — [ call type ]</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Tag tone="p4"><Dot tone="p4" size={6} />[ Profile ]</Tag>
            <Tag tone="ok" variant="soft">Engaged</Tag>
            <Tag variant="outline">[ 45 min ]</Tag>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontFamily: 'var(--f-mono)', fontSize: 12.5, color: 'var(--ink-3)', letterSpacing: '0.05em', lineHeight: 2 }}>
          <div>DATE · [ DD-MM-YYYY ]</div>
          <div>OURS · [ names ]</div>
          <div>THEIRS · [ names ]</div>
        </div>
      </div>

      {/* quick facts */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
        {[['Stage', '[ Series _ ]'], ['Team', '[ N ]'], ['Raising', '[ $Xm ]'], ['Region', '[ EU ]'], ['Warmth', '[ high ]']].map(([k, v], i) => (
          <div key={i} style={{ flex: 1, minWidth: 120, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: '12px 16px' }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>{k}</div>
            <div style={{ fontSize: 17, fontWeight: 600, marginTop: 4 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 36 }}>
        <div>
          <Section label="Context">
            <Line>[ Why this call happened and where the relationship stood going in. ]</Line>
            <Line>[ What we wanted to learn. ]</Line>
          </Section>
          <Section label="What we heard">
            <Line tone="ok">[ Signal — a specific, quotable fact with a number. ]</Line>
            <Line tone="ok">[ Signal — product or GTM detail worth remembering. ]</Line>
            <Line>[ Neutral context that frames the above. ]</Line>
            <Line tone="warn">[ Caveat the founder volunteered. ]</Line>
          </Section>
          <Section label="Open questions">
            <Line tone="bad">[ Unanswered question that gates a decision. ]</Line>
            <Line tone="warn">[ Diligence item to chase before next step. ]</Line>
          </Section>
        </div>

        <div>
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '18px 20px', marginBottom: 18 }}>
            <div className="mono-label" style={{ fontSize: 11.5, marginBottom: 12 }}>Key numbers</div>
            <KVList rows={[{ k: 'ARR', v: '[ $XM ]' }, { k: 'Growth', v: '[ XX% ]', vColor: 'var(--ok)' }, { k: 'Burn', v: '[ $Xm/mo ]' }, { k: 'Runway', v: '[ N mo ]' }]} />
          </div>
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '18px 20px' }}>
            <div className="mono-label" style={{ fontSize: 11.5, marginBottom: 10, color: 'var(--accent)' }}>Action items</div>
            <Check owner="[ owner ]" due="[ DD-MM ]">[ The single most important follow-up. ]</Check>
            <Check owner="[ owner ]" due="[ DD-MM ]">[ Materials to request post-call. ]</Check>
            <Check owner="[ owner ]" due="[ DD-MM ]">[ Internal action before next touch. ]</Check>
          </div>
        </div>
      </div>
    </div>
  );

  window.ISG.register({
    id: 'call-notes', group: 'Call notes', name: 'Post-call cheatsheet',
    blurb: 'A dense, scannable record of a single call. Mono labels and tick-prefixed lines keep it terse; signals, caveats and blockers are color-coded in the status gamut. Sidebar holds the numbers and the action checklist.',
    frames: [{ label: 'Cheatsheet', mode: 'flow', w: W, node }],
  });
})();
