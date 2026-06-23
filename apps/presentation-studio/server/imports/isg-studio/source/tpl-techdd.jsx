/* ═══════════════════════════════════════════════════════════════
   TECHNICAL DUE-DILIGENCE — scrollable analyst document.
   Patterns: identity card · category positioning · connection +
   privilege matrix · collection-layer map · cost-annotated lineage ·
   attribution cascade · automation cycle + governance fork ·
   fundamentals theory cards · two-side component map ·
   strengths/wrapper/open assessment · open-questions grid.
   All in the ISG system (coral + diagram palette + earth status).
   ═══════════════════════════════════════════════════════════════ */

(function () {
  const W = 1100;

  const Doc = ({ children }) => (
    <div className="isg-scope" style={{ width: W, background: 'var(--bg)', color: 'var(--ink)' }}>{children}</div>
  );
  const Sec = ({ num, title, lead, children, top }) => (
    <section style={{ padding: '46px 64px 44px', borderTop: top ? '1px solid var(--line)' : 'none' }}>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 600, marginBottom: 8 }}>Section {num}</div>
      <h1 style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.025em', margin: '0 0 8px' }}>{title}</h1>
      {lead && <div style={{ color: 'var(--ink-3)', fontSize: 14, marginBottom: 26, maxWidth: '74ch', lineHeight: 1.6 }}>{lead}</div>}
      {children}
    </section>
  );
  const Block = ({ children }) => (
    <h3 style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-2)', margin: '30px 0 14px', fontWeight: 500 }}>{children}</h3>
  );
  const Panel = ({ children, accentLeft, tone = 'accent', style, title }) => (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderLeft: accentLeft ? `3px solid var(--${tone})` : '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '20px 22px', ...style }}>
      {title && <div style={{ fontSize: 14, fontWeight: 600, color: `var(--${tone})`, marginBottom: 12 }}>{title}</div>}
      {children}
    </div>
  );
  const Code = ({ children }) => (
    <code style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--accent)', background: 'var(--accent-soft)', padding: '1px 6px', borderRadius: 4 }}>{children}</code>
  );

  /* ── FRAME 1 · COMPANY & POSITIONING ─────────────────────── */
  const facts = [['[ 20XX ]', 'founded'], ['[ City, Country ]', 'HQ'], ['[ Name ]', 'CEO / co-founder'], ['[ Name ]', 'CTO / co-founder'], ['[ $X.XM ]', 'raised'], ['[ Investors ]', 'backers'], ['[ Cloud ]', 'hosting'], ['[ Stack ]', 'native to']];
  const companyFrame = (
    <Doc>
      <Sec num="01" title="[ Company ] — company & positioning" lead="[ The category in one line — why it is distinct from the obvious adjacent category. Company profile, ICP, integrations, compliance. ]">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
          <div style={{ background: 'linear-gradient(135deg, color-mix(in srgb,var(--accent) 9%,var(--bg-1)), var(--bg-1))', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)', padding: '28px 30px' }}>
            <div style={{ fontSize: 38, fontWeight: 600, letterSpacing: '-0.04em', color: 'var(--ink)' }}>[ company<span style={{ color: 'var(--accent)' }}>name</span> ]</div>
            <div style={{ color: 'var(--accent)', fontSize: 13.5, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 6, fontFamily: 'var(--f-mono)' }}>[ Category descriptor ]</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginTop: 22 }}>
              {facts.map(([v, k], i) => (
                <div key={i} style={{ fontSize: 13, color: 'var(--ink-3)' }}><b style={{ color: 'var(--ink)', display: 'block', fontSize: 14, marginBottom: 2, fontWeight: 600 }}>{v}</b>{k}</div>
              ))}
            </div>
          </div>
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div className="mono-label" style={{ fontSize: 11.5 }}>ICP</div>
            {['[ Buyer persona A ]', '[ Buyer persona B ]', '[ Buyer persona C ]'].map((t, i) => <div key={i} style={{ fontSize: 14, color: 'var(--ink)' }}>{t}</div>)}
            <div className="mono-label" style={{ fontSize: 11.5, marginTop: 8 }}>Compliance</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Tag tone="d-2" variant="soft">[ SOC 2 ]</Tag><Tag variant="outline">[ GDPR ]</Tag><Tag variant="outline">[ HIPAA ]</Tag>
            </div>
            <div className="mono-label" style={{ fontSize: 11.5, marginTop: 8 }}>Named customers</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['[ Customer ]', '[ Customer ]', '[ Customer ]', '[ Customer ]'].map((c, i) => <span key={i} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--ink-2)', padding: '4px 10px', borderRadius: 16, fontSize: 13 }}>{c}</span>)}
            </div>
          </div>
        </div>
        <Block>Category positioning</Block>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Panel accentLeft tone="mute" title="[ The adjacent / incumbent category ]"><div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>[ What incumbents do and where they operate — the layer of the stack they sit at, and why that is a different problem. ]</div></Panel>
          <Panel accentLeft tone="accent" title="[ This company's category ]"><div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>[ The precise layer this company operates at — name the specific data sources or APIs it reads, e.g. <Code>[ system_view ]</Code> plus partner metadata. Inside the stack. ]</div></Panel>
        </div>
      </Sec>
    </Doc>
  );

  /* ── FRAME 2 · ARCHITECTURE ──────────────────────────────── */
  const setup = [['Role', '[ service_role ]'], ['Service user', '[ service_user ]'], ['Auth', 'password or [ keypair ] (recommended)'], ['Network policy', 'allowlist [ ips ]'], ['Account identifier', '[ org-account ]'], ['Default scope', '[ assigned at creation ]']];
  const privs = [
    ['USAGE on [ resource ]', '[ access to designated resource ]', 'read'],
    ['IMPORTED PRIVILEGES on [ db ]', '[ usage views ]', 'read'],
    ['MONITOR USAGE on [ scope ]', '[ consumption visibility ]', 'read'],
    ['OPERATE on [ resource ]', '[ start / stop / resume ]', 'write'],
    ['MANAGE [ resources ] on [ scope ]', '[ modify + monitor account-wide ]', 'write'],
    ['[ ADMIN role ]', '[ optional, org-level observability ]', 'opt'],
  ];
  const ptone = { read: 'ok', write: 'bad', opt: 'mute' };
  const layers = [
    ['[ Primary system ] · usage views', 'd-2', ['[ QUERY_HISTORY ]', '[ METERING_HISTORY ]', '[ STORAGE_METRICS ]', '[ LOGIN_HISTORY ]', '[ ACCESS_HISTORY · EE+ ]']],
    ['[ Primary system ] · info schema', 'd-2', ['[ low-latency metadata ]', '[ near-real-time detection ]']],
    ['Ingestion', 'd-5', ['[ Connector A ]', '[ Connector B ]', '[ pipe usage ]']],
    ['Transformation / orchestration', 'd-5', ['[ Transform Cloud API ]', '[ Transform Core ]', '[ Orchestrator ]']],
    ['BI / consumption', 'd-5', ['[ BI Tool A ]', '[ BI Tool B ]', '[ BI Tool C ]']],
    ['Identity / SSO', 'd-5', ['[ IdP A · OIDC ]', '[ IdP B · OIDC ]']],
  ];
  const lineageA = [['[ Connector ]', '[ pipe_sync ]', '$[ 420 ]/mo'], ['[ Raw table ]', '[ RAW.SRC.TBL ]', '$[ 12 ]/mo'], ['[ Model ]', '[ mart.fct_x ]', '$[ 180 ]/mo']];
  const lineageB = [['[ Model ]', '[ mart.fct_x ]', '$[ 180 ]/mo'], ['[ BI view ]', '[ funnel_view ]', '$[ 95 ]/mo'], ['[ Dashboard ]', '[ Exec Pipeline ]', '$[ 720 ]/mo']];
  const cascade = [['1', 'Tags', '[ query-tag package + native tag ]'], ['2', 'User + Role', '[ mapped to domain ]'], ['3', 'Lineage inference', '[ via downstream domain ]'], ['$', 'Credits × rate', '[ price entered at onboarding ]']];
  const cycle = [['1', 'Pull', '[ metadata + history ]'], ['2', 'Normalize', '[ units → $ ]'], ['3', 'Analytics', '[ cost + usage ]'], ['4', 'Lineage', '[ SQL parse + merge ]'], ['5', 'Anomalies', '[ Z-score vs baseline ]'], ['6', 'Root-cause', '[ LLM walks graph ]']];
  const fork = [['mute', 'Insight-only', '[ dashboard + notify ]'], ['warn', 'Recommendation', '[ user clicks Apply ]'], ['bad', 'Autonomous', '[ executes on schedule ]']];

  function LgNode({ t, n, c }) {
    return (
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: '11px 12px', textAlign: 'center', flex: 1 }}>
        <div style={{ color: 'var(--ink-4)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, fontFamily: 'var(--f-mono)' }}>{t}</div>
        <div style={{ color: 'var(--ink)', fontFamily: 'var(--f-mono)', fontSize: 13, marginBottom: 6 }}>{n}</div>
        <div style={{ color: 'var(--ok)', fontSize: 14, fontWeight: 600 }}>{c}</div>
      </div>
    );
  }
  const Arrow = () => <div style={{ color: 'var(--accent)', fontSize: 18, flexShrink: 0, alignSelf: 'center' }}>→</div>;

  const archFrame = (
    <Doc>
      <Sec num="02" title="Technical architecture" lead="[ Connection model and privileges, metadata sources, lineage construction, cost attribution, automation cycle. ]">
        <Block>Connection model</Block>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Panel title="Objects created in the client environment">
            <div>
              {setup.map(([k, v], i) => (
                <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '9px 0', borderBottom: i < setup.length - 1 ? '1px dashed var(--line)' : 'none', fontSize: 13 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'var(--f-mono)' }}>{i + 1}</span>
                  <div><b style={{ color: 'var(--ink)' }}>{k}:</b> <span style={{ color: 'var(--ink-2)' }}>{v}</span></div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Privilege matrix">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {privs.map(([name, desc, kind], i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 64px', gap: 10, alignItems: 'center', padding: '9px 12px', borderRadius: 'var(--r)', background: 'var(--bg-2)', borderLeft: `3px ${kind === 'opt' ? 'dashed' : 'solid'} var(--${ptone[kind]})` }}>
                  <div><div style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, color: 'var(--ink)' }}>{name}</div><div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>{desc}</div></div>
                  <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, fontFamily: 'var(--f-mono)', letterSpacing: '0.06em', color: `var(--${ptone[kind]})`, textTransform: 'uppercase' }}>{kind}</div>
                </div>
              ))}
            </div>
            <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', borderRadius: 'var(--r)', padding: '10px 14px', marginTop: 12, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>[ Read side is metadata-only; the write side is the explicit actuation surface. Note exactly which privileges enable actuation, and what they do NOT grant. ]</div>
          </Panel>
        </div>

        <Block>Data collection layers</Block>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {layers.map(([label, tone, chips], i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12, alignItems: 'center' }}>
              <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--ink-2)', fontWeight: 500 }}>{label}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, background: `var(--${tone}-soft)`, border: `1px solid var(--${tone}-line)`, borderRadius: 'var(--r-lg)', padding: '12px 14px' }}>
                {chips.map((c, j) => <span key={j} style={{ background: 'var(--bg-1)', border: `1px solid var(--${tone}-line)`, color: 'var(--ink-2)', padding: '5px 10px', borderRadius: 6, fontSize: 13, fontFamily: 'var(--f-mono)' }}>{c}</span>)}
              </div>
            </div>
          ))}
        </div>

        <Block>Lineage — cost-annotated, derived from executed queries</Block>
        <Panel style={{ padding: 24 }}>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 16 }}>[ Parser reads SQL text from history and builds a directed graph. Every node carries cost in dollars. ]</div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>{lineageA.map((n, i) => [<LgNode key={`a${i}`} t={n[0]} n={n[1]} c={n[2]} />, i < 2 && <Arrow key={`aa${i}`} />])}</div>
          <div style={{ display: 'flex', gap: 12 }}>{lineageB.map((n, i) => [<LgNode key={`b${i}`} t={n[0]} n={n[1]} c={n[2]} />, i < 2 && <Arrow key={`bb${i}`} />])}</div>
          <div style={{ fontSize: 12.5, color: 'var(--warn)', marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--line)', lineHeight: 1.5 }}>[ Note known degradation modes — dynamic SQL, nested CTEs, view-over-view — where column-level falls back to table-level. Parser fidelity is an open evaluation item. ]</div>
        </Panel>

        <Block>Cost attribution — fallback cascade</Block>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 22 }}>
          {cascade.map(([n, t, d], i) => (
            <div key={i} style={{ position: 'relative', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '16px 18px' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)', lineHeight: 1, fontFamily: 'var(--f-sans)' }}>{n}</div>
              <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 6, fontWeight: 600 }}>{t}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4, lineHeight: 1.4 }}>{d}</div>
              {i < 3 && <div style={{ position: 'absolute', right: -15, top: '50%', transform: 'translateY(-50%)', color: 'var(--accent)', fontSize: 16 }}>→</div>}
            </div>
          ))}
        </div>

        <Block>Automation cycle</Block>
        <Panel style={{ padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 16 }}>
            {cycle.map(([n, t, d], i) => (
              <div key={i} style={{ position: 'relative', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: '12px 10px', textAlign: 'center' }}>
                <div style={{ position: 'absolute', top: -8, left: 8, width: 18, height: 18, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 11.5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--f-mono)' }}>{n}</div>
                <b style={{ color: 'var(--ink)', display: 'block', fontSize: 13.5, marginBottom: 3, marginTop: 4 }}>{t}</b>
                <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{d}</span>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 12.5, margin: '12px 0', fontFamily: 'var(--f-mono)', letterSpacing: '0.06em' }}>↓ GOVERNANCE FORK (per-capability) ↓</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {fork.map(([tone, mode, act], i) => (
              <div key={i} style={{ background: 'var(--bg-2)', borderRadius: 'var(--r)', padding: '13px 14px', textAlign: 'center', borderTop: `3px solid var(--${tone})` }}>
                <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{mode}</div>
                <div style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>{act}</div>
              </div>
            ))}
          </div>
        </Panel>
      </Sec>
    </Doc>
  );

  /* ── FRAME 3 · COMPONENT MAP & FUNDAMENTALS ──────────────── */
  const clientBoxes = [['[ Primary system ]', '[ usage views + resources ]'], ['[ Connector ]', ''], ['[ Transform ]', '[ Cloud / Core ]'], ['[ Orchestrator ]', ''], ['[ BI tools ]', ''], ['[ IdP ]', '']];
  const comps = [
    ['1', 'Collectors', '[ pull via service user + APIs ]', 'd-2'],
    ['2', 'Extractor', '[ metadata + history ]', 'd-2'],
    ['3', 'Normalizer', '[ units → $ ]', 'd-2'],
    ['4', 'Lineage builder', '[ SQL parse + catalog merge ]', 'd-2'],
    ['5', 'Attribution', '[ tags, owners, domains ]', 'd-2'],
    ['6', 'Anomalies + recs', '[ Z-score on baseline ]', 'd-2'],
    ['7', 'LLM layer', '[ root-cause narratives ]', 'd-5'],
    ['8', 'Actuation', '[ writes config changes ]', 'bad'],
    ['9', 'Notifications', '[ Slack / Teams / email ]', 'd-2'],
    ['10', 'Governance', '[ insight / rec / auto ]', 'warn'],
  ];
  const theory = [
    ['1', '[ Cost doubles per resource step ]', '[ Size ladder, billing minimum on start/resume. Primary source of structural waste. ]', true],
    ['2', '[ Idle-shutdown vs cache trade-off ]', '[ Aggressive shutdown saves idle time but clears cache; first query after resume runs slower. ]', false],
    ['3', '[ Observability without lineage = symptom without cause ]', '[ Expensive operations are visible but not explainable if upstream remains opaque. ]', false],
    ['4', '[ Lineage as a safety mechanism ]', '[ Changing config without lineage risks breaking a downstream consumer. Lineage + cost → ROI-sorted candidates. ]', false],
    ['5', '[ End-to-end attribution is structurally hard ]', '[ Layers bill in different units; identifiers do not align; tags are inconsistent; dynamic SQL breaks parsing. ]', false],
    ['6', '[ Limits of a metadata-only approach ]', '[ Small compliance + compute footprint; bounded depth; analytical views carry source latency. ]', false],
  ];
  const compFrame = (
    <Doc>
      <Sec num="03" title="Component map — logical blocks" lead="[ Left: client infrastructure. Right: the vendor's logical components. Read on one side, write (actuation) on the other. ]">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 1.9fr', gap: 12, marginTop: 8 }}>
          <Panel title="Client side" tone="d-5" style={{ borderTop: '3px solid var(--d-5)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {clientBoxes.map(([b, s], i) => <div key={i} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6, padding: '9px 11px', fontSize: 13 }}><b style={{ color: 'var(--ink)' }}>{b}</b>{s && <div style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>{s}</div>}</div>)}
            </div>
          </Panel>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontSize: 12.5, gap: 8, fontFamily: 'var(--f-mono)' }}>
            <div>read</div><div style={{ fontSize: 18 }}>→</div><div style={{ fontSize: 18, color: 'var(--bad)' }}>←</div><div style={{ color: 'var(--bad)' }}>write</div>
          </div>
          <Panel title="Vendor SaaS" tone="accent" style={{ borderTop: '3px solid var(--accent)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {comps.map(([n, t, d, tone], i) => (
                <div key={i} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderLeft: `3px solid var(--${tone})`, borderRadius: 6, padding: '9px 11px', fontSize: 13 }}>
                  <span style={{ background: `var(--${tone})`, color: 'var(--accent-ink)', width: 18, height: 18, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700, marginRight: 6, verticalAlign: 'middle', fontFamily: 'var(--f-mono)' }}>{n}</span>
                  <b style={{ color: 'var(--ink)' }}>{t}</b>
                  <div style={{ color: 'var(--ink-3)', fontSize: 12.5, marginTop: 2 }}>{d}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Block>Platform fundamentals</Block>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {theory.map(([num, tt, dd, ladder], i) => (
            <div key={i} style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '18px 20px' }}>
              <div style={{ fontSize: 40, fontWeight: 700, color: 'var(--accent)', lineHeight: 1, opacity: 0.4, fontFamily: 'var(--f-sans)' }}>{num}</div>
              <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 600, margin: '8px 0 6px', lineHeight: 1.3 }}>{tt}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>{dd}</div>
              {ladder && (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 64, marginTop: 12 }}>
                  {[6, 10, 16, 24, 34, 46, 60, 76, 90, 100].map((h, j) => <div key={j} style={{ flex: 1, height: `${h}%`, background: 'var(--accent)', opacity: 0.25 + j * 0.07, borderRadius: '3px 3px 0 0' }} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      </Sec>
    </Doc>
  );

  /* ── FRAME 4 · ASSESSMENT & OPEN QUESTIONS ───────────────── */
  const assess = [
    ['ok', 'Architectural strengths', ['[ A genuinely uncommon combination among direct peers. ]', '[ A clean use of a native primitive, not a workaround. ]', '[ A differentiating design choice with direct bearing on outcomes. ]', '[ A smart distribution / top-of-funnel motion. ]']],
    ['warn', 'Standard mechanisms in a wrapper', ['[ Capability whose value is bounded by graph / data fidelity. ]', '[ Feature built on the platform\u2019s own primitive. ]', '[ Rule-based analyzer with a fixed lookback. ]', '[ Useful but technically straightforward UX. ]']],
    ['d-5', 'Open for hands-on verification', ['[ Parser coverage on hard SQL shapes. ]', '[ Guardrails in autonomous mode: caps, shadow, rollback. ]', '[ Freshness SLA from event to visibility. ]', '[ Scale behaviour on large accounts. ]', '[ Audits beyond the one named certification. ]']],
  ];
  const qs = [
    ['1', '[ Parser behaviour ]', '[ Handling of hard SQL; degradation modes; share resolved at fine grain. ]'],
    ['2', '[ Source latency ]', '[ Freshness of each view; split between real-time and analytical paths. ]'],
    ['3', '[ Attribution without tags ]', '[ Fallback cascade accuracy and trade-offs. ]'],
    ['4', '[ Actuation guardrails ]', '[ What is actually changed; caps, allowlist, audit trail, rollback. ]'],
    ['5', '[ Autonomous safety ]', '[ Dry-run, shadow mode, staged rollout, automated rollback. ]'],
    ['6', '[ Rollback latency ]', '[ Window in seconds if a change degrades an SLA. ]'],
    ['7', '[ Anomaly tuning ]', '[ Seasonality, false-positive rate, cold-start, per-client tunability. ]'],
    ['8', '[ Edition-gated features ]', '[ Graceful degradation when a premium data source is unavailable. ]'],
    ['9', '[ Scale behaviour ]', '[ Pull cadence, storage, UI responsiveness at high volume. ]'],
  ];
  const assessFrame = (
    <Doc>
      <Sec num="04" title="Assessment — differentiators & open items" lead="[ Three categories: documented strengths; standard mechanisms in a product wrapper; items worth verifying hands-on. ]">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {assess.map(([tone, head, items], i) => (
            <div key={i} style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderTop: `3px solid var(--${tone})`, borderRadius: 'var(--r-lg)', padding: '18px 20px' }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.05em', color: `var(--${tone})`, marginBottom: 12 }}>{head}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {items.map((t, j) => (
                  <div key={j} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: `var(--${tone})`, marginTop: 7, flexShrink: 0 }} />{t}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <Block>Open technical questions for diligence</Block>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {qs.map(([n, tt, dd], i) => (
            <div key={i} style={{ position: 'relative', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '16px 16px 14px', minHeight: 96 }}>
              <div style={{ position: 'absolute', top: -8, left: 12, background: 'var(--accent)', color: 'var(--accent-ink)', width: 22, height: 22, borderRadius: '50%', fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--f-mono)' }}>{n}</div>
              <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600, marginTop: 6, marginBottom: 4 }}>{tt}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.45 }}>{dd}</div>
            </div>
          ))}
        </div>
      </Sec>
    </Doc>
  );

  window.ISG.register({
    id: 'tech-dd', group: 'Technical due-diligence', name: 'Technical overview document',
    blurb: 'A scrollable analyst document for a technical deep-dive on a target. Identity & positioning, a connection + privilege matrix (read / write / optional), a collection-layer chip map, cost-annotated lineage flow, the automation cycle with its governance fork, a two-side component map, fundamentals theory cards, and a strengths / wrapper / open assessment with an open-questions grid.',
    frames: [
      { label: 'Company & positioning', mode: 'flow', w: W, node: companyFrame },
      { label: 'Architecture', mode: 'flow', w: W, node: archFrame },
      { label: 'Component map & fundamentals', mode: 'flow', w: W, node: compFrame },
      { label: 'Assessment & open Qs', mode: 'flow', w: W, node: assessFrame },
    ],
  });
})();
