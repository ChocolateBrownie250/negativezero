/* ═══════════════════════════════════════════════════════════════
   ARCHITECTURE — real technical schematics, not abstract boxes.
   A small coordinate diagram engine (nodes + orthogonal edges +
   trust/network zones + hub-spoke) drives every frame. All color
   via the diagram palette tokens; theme-aware; SF Pro / SF Mono.
   Frames: Cover · System diagram · Deployment topology ·
           Data-source hub · Layered platform stack.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  const W = 1920, H = 1080;
  const PALETTE = ['d-1', 'd-2', 'd-3', 'd-4', 'd-5', 'd-6', 'mute', 'accent'];

  /* ── Slide shell ─────────────────────────────────────────── */
  function Slide({ eyebrow, title, accentWord, dots = 0.4, children, titleMb = 18, foot }) {
    return (
      <div className="isg-scope" style={{
        width: W, height: H, background: 'var(--bg)', color: 'var(--ink)',
        padding: '72px 110px 60px', display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
      }}>
        {dots > 0 && <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, color-mix(in srgb, var(--ink) 11%, transparent) 1px, transparent 1px)', backgroundSize: '48px 48px', opacity: dots, pointerEvents: 'none' }} />}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'var(--tx-grain)', backgroundSize: '160px 160px', opacity: 0.4, mixBlendMode: 'overlay', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: -220, right: -120, width: 820, height: 640, background: 'radial-gradient(circle, var(--accent-soft), transparent 70%)', filter: 'blur(50px)', pointerEvents: 'none', opacity: 0.7 }} />
        {eyebrow && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'var(--f-mono)', fontSize: 20, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--accent)', position: 'relative' }}>
            <span style={{ width: 38, height: 2, background: 'var(--accent)' }} />{eyebrow}
          </div>
        )}
        {title && (
          <h1 style={{ fontSize: 46, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.05, margin: `16px 0 ${titleMb}px`, position: 'relative' }}>
            {title} {accentWord && <span style={{ color: 'var(--accent)' }}>{accentWord}</span>}
          </h1>
        )}
        <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>{children}</div>
        {foot && <div style={{ display: 'flex', gap: 28, marginTop: 18, position: 'relative', flexWrap: 'wrap' }}>{foot}</div>}
      </div>
    );
  }

  /* ── Diagram engine ──────────────────────────────────────── */
  function getAnchor(n, side) {
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    switch (side) {
      case 'l': return { x: n.x, y: cy };
      case 'r': return { x: n.x + n.w, y: cy };
      case 't': return { x: cx, y: n.y };
      case 'b': return { x: cx, y: n.y + n.h };
      default:  return { x: cx, y: cy };
    }
  }
  function routePoints(a, b, router) {
    switch (router) {
      case 'straight': return [a, b];
      case 'hv': return [a, { x: b.x, y: a.y }, b];
      case 'vh': return [a, { x: a.x, y: b.y }, b];
      case 'v': { const m = (a.y + b.y) / 2; return [a, { x: a.x, y: m }, { x: b.x, y: m }, b]; }
      case 'h':
      default: { const m = (a.x + b.x) / 2; return [a, { x: m, y: a.y }, { x: m, y: b.y }, b]; }
    }
  }
  function pathD(pts) { return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' '); }
  function labelPt(a, b, router) {
    if (router === 'h' || router === undefined) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (router === 'v') return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (router === 'hv') return { x: b.x, y: a.y };
    if (router === 'vh') return { x: a.x, y: b.y };
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function NodeContent({ n, t, sm }) {
    return (
      <>
        <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: `var(--${t})`, boxShadow: `0 0 12px var(--${t})` }} />
        {n.kicker && <div style={{ fontFamily: 'var(--f-mono)', fontSize: sm ? 11 : 13.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: `var(--${t})` }}>{n.kicker}</div>}
        {n.title && <div style={{ fontSize: n.big ? 27 : (sm ? 16 : 22), fontWeight: 600, letterSpacing: '-0.01em', marginTop: n.kicker ? 5 : 0, color: 'var(--ink)', lineHeight: 1.1 }}>{n.title}</div>}
        {n.sub && <div style={{ fontSize: sm ? 12.5 : 15, color: 'var(--ink-3)', marginTop: 4, lineHeight: 1.35 }}>{n.sub}</div>}
        {n.items && <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 8 }}>{n.items.map((it, i) => <span key={i} style={{ fontFamily: 'var(--f-mono)', fontSize: 14, color: 'var(--ink-2)' }}>{it}</span>)}</div>}
        {n.tags && <div style={{ marginTop: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 8 }}>{n.tags.map((tg, i) => <span key={i} style={{ fontFamily: 'var(--f-mono)', fontSize: 12, padding: '3px 9px', borderRadius: 6, background: `var(--${t}-soft)`, border: `1px solid var(--${t}-line)`, color: `var(--${t})` }}>{tg}</span>)}</div>}
      </>
    );
  }

  function NodeBox({ n, dimmed, onHover }) {
    const t = n.tone || 'd-2';
    const sm = n.sm;
    const clickable = !!(n.detail || n.href);
    const baseStyle = {
      position: 'absolute', left: n.x, top: n.y, width: n.w, height: n.h,
      background: n.solid ? `var(--${t}-fill), var(--bg-1)` : 'var(--grad-surface)',
      border: `${n.big ? 2 : 1.5}px solid var(--${t}-line)`,
      borderRadius: sm ? 10 : 14, padding: sm ? '10px 13px' : '15px 18px',
      display: 'flex', flexDirection: 'column',
      boxShadow: n.big ? `var(--${t}-glow), 0 1px 0 rgba(255,255,255,0.05) inset` : '0 2px 12px rgba(0,0,0,0.22), 0 1px 0 rgba(255,255,255,0.04) inset',
      overflow: 'hidden',
      opacity: dimmed ? 0.38 : 1,
      transition: 'opacity var(--dur) var(--ease-out), transform var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out)',
      color: 'inherit', textDecoration: 'none',
    };
    const hoverHandlers = { onMouseEnter: () => onHover && onHover(n.id), onMouseLeave: () => onHover && onHover(null) };
    const cue = clickable ? <span className="ix-cue" aria-hidden="true">{n.href ? '↗' : '+'}</span> : null;
    const inner = <><NodeContent n={n} t={t} sm={sm} /></>;
    if (!clickable) {
      return <div style={baseStyle} {...hoverHandlers}>{n.big && <FlowEdge dur={8} />}{inner}</div>;
    }
    if (n.href) {
      const ext = /^(https?:|mailto:|tel:)/.test(n.href);
      return (
        <a className="ix ix-lift" style={baseStyle} href={n.href} target={ext ? '_blank' : undefined} rel={ext ? 'noopener noreferrer' : undefined} {...hoverHandlers}>
          {cue}{n.big && <FlowEdge dur={8} />}{inner}
        </a>
      );
    }
    const fire = (e) => { e.stopPropagation(); openInspector(n.detail); };
    return (
      <div className="ix ix-lift" role="button" tabIndex={0} style={baseStyle} {...hoverHandlers}
           onClick={fire} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(e); } }}>
        {cue}{n.big && <FlowEdge dur={8} />}{inner}
      </div>
    );
  }

  /* nodes: {id,x,y,w,h,...NodeBox props, detail?, href?}
     edges: {from:'id:side', to:'id:side', router, tone, label, dashed}
     zones: {x,y,w,h,label,tone}
     Hovering a node highlights its edges (animated flow) + neighbors,
     dims the rest; clicking a node with `detail` opens the Inspector. */
  function Diagram({ w, h, nodes, edges = [], zones = [], style }) {
    const [hover, setHover] = React.useState(null);
    const byId = {}; nodes.forEach((n) => { byId[n.id] = n; });
    const resolve = (ref) => { const [id, side] = ref.split(':'); return getAnchor(byId[id], side || 'c'); };
    const endIds = (e) => [e.from.split(':')[0], e.to.split(':')[0]];
    const anyHover = !!hover;
    const nbr = new Set();
    if (hover) { nbr.add(hover); edges.forEach((e) => { const [a, b] = endIds(e); if (a === hover) nbr.add(b); if (b === hover) nbr.add(a); }); }
    const isConn = (e) => { if (!hover) return false; const [a, b] = endIds(e); return a === hover || b === hover; };
    return (
      <div style={{ position: 'relative', width: w, height: h, margin: '0 auto' }} onMouseLeave={() => setHover(null)}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <defs>
            {PALETTE.map((t) => (
              <marker key={t} id={`ah-${t}`} markerWidth="11" markerHeight="11" refX="7.5" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill={`var(--${t})`} />
              </marker>
            ))}
          </defs>
          {zones.map((z, i) => (
            <g key={`z${i}`}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="18" fill={`color-mix(in srgb, var(--${z.tone || 'mute'}) 4%, transparent)`} stroke={`var(--${z.tone || 'mute'}-line)`} strokeWidth="1.5" strokeDasharray="7,5" />
              {z.label && <text x={z.x + 18} y={z.y + 26} fill={`var(--${z.tone || 'mute'})`} style={{ fontFamily: 'var(--f-mono)', fontSize: 14, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.85 }}>{z.label}</text>}
            </g>
          ))}
          {edges.map((e, i) => {
            const a = resolve(e.from), b = resolve(e.to);
            const pts = routePoints(a, b, e.router);
            const t = e.tone || 'd-6';
            const conn = isConn(e);
            const dim = anyHover && !conn;
            return (
              <g key={`e${i}`}>
                <path d={pathD(pts)} fill="none" stroke={`var(--${t})`} strokeWidth={e.width || 1.8} strokeDasharray={e.dashed ? '6,5' : 'none'} markerEnd={`url(#ah-${t})`} opacity={dim ? 0.16 : (e.dim ? 0.5 : 0.9)} style={{ transition: 'opacity var(--dur) var(--ease-out)' }} />
                {conn && <path d={pathD(pts)} className="svg-edge-flow" pathLength="1" style={{ '--fl-edgedur': '1.8s', stroke: `var(--${t})` }} />}
              </g>
            );
          })}
        </svg>
        {edges.filter((e) => e.label).map((e, i) => {
          const a = resolve(e.from), b = resolve(e.to);
          const p = labelPt(a, b, e.router);
          const t = e.tone || 'd-6';
          return (
            <div key={`l${i}`} style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%,-50%)', fontFamily: 'var(--f-mono)', fontSize: 13, letterSpacing: '0.06em', color: `var(--${t})`, background: 'var(--bg)', border: `1px solid var(--${t}-line)`, borderRadius: 6, padding: '3px 9px', whiteSpace: 'nowrap' }}>{e.label}</div>
          );
        })}
        {nodes.map((n) => <NodeBox key={n.id} n={n} dimmed={anyHover && !nbr.has(n.id)} onHover={setHover} />)}
      </div>
    );
  }

  /* ── Frame 1 · COVER ─────────────────────────────────────── */
  const cover = (
    <Slide eyebrow="Technology Architecture" dots={0.45}
      foot={[['d-1', '[ metric ]', '[ measured ]'], ['d-5', '[ component ]', '[ form factor ]'], ['d-6', 'JSON', '[ contract ]'], ['d-3', '[ mode ]', '[ surface ]']].map(([t, v, l], i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 28, borderRight: i < 3 ? '1px solid var(--line)' : 'none', minWidth: 200 }}>
          <span style={{ fontSize: 38, fontWeight: 600, letterSpacing: '-0.03em', color: `var(--${t})`, lineHeight: 1 }}>{v}</span>
          <span style={{ fontSize: 18, color: 'var(--ink-3)' }}>{l}</span>
        </div>
      ))}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ fontSize: 104, fontWeight: 600, letterSpacing: '-0.05em', lineHeight: 0.94 }}>[ Product&nbsp;Name ]</div>
        <div style={{ fontSize: 36, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--ink-3)' }}>architecture &nbsp;·&nbsp; <span style={{ color: 'var(--ink)', fontWeight: 500 }}>[ Company ]</span></div>
        <div style={{ width: 80, height: 3, background: 'var(--accent)', borderRadius: 2 }} />
        <div style={{ fontSize: 27, color: 'var(--ink-2)', maxWidth: 1180, lineHeight: 1.5 }}>[ One-line architecture thesis — what the product is, the single contract it is built around, and the clean separation that makes it portable. ]</div>
      </div>
    </Slide>
  );

  /* ── Frame 2 · SYSTEM DIAGRAM ────────────────────────────── */
  const sysNodes = [
    { id: 's1', x: 20, y: 95, w: 250, h: 140, tone: 'd-1', kicker: 'Source', title: '[ System A ]', sub: '[ type / origin ]',
      detail: { kicker: 'Source · System A', title: '[ System A ]', tone: 'd-1', sub: '[ type / origin ]',
        body: ['Click any component to inspect it. Replace this copy with what the source is, how it is reached, and the cadence of collection.'],
        stats: [{ k: 'Protocol', v: '[ e.g. HTTPS / JDBC ]' }, { k: 'Auth', v: '[ key / token ]' }, { k: 'Cadence', v: '[ cron / stream ]' }],
        tags: ['[ pull ]', '[ read-only ]'] } },
    { id: 's2', x: 20, y: 290, w: 250, h: 140, tone: 'd-1', kicker: 'Source', title: '[ System B ]', sub: '[ type / origin ]',
      detail: { kicker: 'Source · System B', title: '[ System B ]', tone: 'd-1', sub: '[ type / origin ]',
        body: ['Each node carries its own detail payload — title, body, spec rows, tags and links.'],
        stats: [{ k: 'Protocol', v: '[ … ]' }, { k: 'Auth', v: '[ … ]' }] } },
    { id: 's3', x: 20, y: 485, w: 250, h: 140, tone: 'd-1', kicker: 'Source', title: '[ System C ]', sub: '[ type / origin ]',
      detail: { kicker: 'Source · System C', title: '[ System C ]', tone: 'd-1', sub: '[ type / origin ]',
        body: ['Hover a node to spotlight its connections; the rest of the diagram dims so the path reads clearly.'] } },
    { id: 'c',  x: 440, y: 270, w: 280, h: 180, tone: 'd-5', big: true, kicker: 'Collector', title: '[ Agent ]', sub: '[ single binary · stateless ]', tags: ['[ pull ]', '[ cron ]'],
      detail: { kicker: 'Collector', title: '[ Agent ]', tone: 'd-5', sub: '[ single binary · stateless ]',
        body: ['The lead component. A stateless collector that pulls from every source on a schedule and emits one portable contract downstream.'],
        stats: [{ k: 'Form factor', v: '[ single binary ]' }, { k: 'State', v: '[ stateless ]' }, { k: 'Output', v: 'JSON' }],
        tags: ['[ pull ]', '[ cron ]', '[ portable ]'],
        links: [{ label: 'Open agent docs', href: '#', primary: true }, { label: 'View on GitHub', href: 'https://github.com' }] } },
    { id: 'p0', x: 820, y: 70, w: 500, h: 120, tone: 'd-2', kicker: 'Store', title: '[ Backing store ]', sub: '[ engine · retention ]',
      detail: { kicker: 'Store', title: '[ Backing store ]', tone: 'd-2', sub: '[ engine · retention ]',
        body: ['Durable storage for everything the collector emits.'],
        stats: [{ k: 'Engine', v: '[ … ]' }, { k: 'Retention', v: '[ … ]' }] } },
    { id: 'p1', x: 820, y: 235, w: 240, h: 160, tone: 'd-6', kicker: 'Service', title: '[ Feature A ]', sub: '[ time-series ]',
      detail: { kicker: 'Service', title: '[ Feature A ]', tone: 'd-6', sub: '[ time-series ]', body: ['Describe what this service computes.'] } },
    { id: 'p2', x: 1080, y: 235, w: 240, h: 160, tone: 'd-4', kicker: 'Service', title: '[ Feature B ]', sub: '[ rule checks ]',
      detail: { kicker: 'Service', title: '[ Feature B ]', tone: 'd-4', sub: '[ rule checks ]', body: ['Describe what this service computes.'] } },
    { id: 'p3', x: 820, y: 425, w: 240, h: 160, tone: 'd-3', kicker: 'Service', title: '[ Feature C ]', sub: '[ drill-down ]',
      detail: { kicker: 'Service', title: '[ Feature C ]', tone: 'd-3', sub: '[ drill-down ]', body: ['Describe what this service computes.'] } },
    { id: 'p4', x: 1080, y: 425, w: 240, h: 160, tone: 'd-5', kicker: 'Service', title: '[ Feature D ]', sub: '[ topology ]',
      detail: { kicker: 'Service', title: '[ Feature D ]', tone: 'd-5', sub: '[ topology ]', body: ['Describe what this service computes.'] } },
    { id: 'u1', x: 1430, y: 200, w: 230, h: 150, tone: 'd-3', kicker: 'Consumer', title: '[ Dashboard ]', sub: '[ UI surface ]', href: '#',
      detail: null },
    { id: 'u2', x: 1430, y: 420, w: 230, h: 150, tone: 'd-3', kicker: 'Consumer', title: '[ Alerting ]', sub: '[ notify path ]',
      detail: { kicker: 'Consumer', title: '[ Alerting ]', tone: 'd-3', sub: '[ notify path ]', body: ['Where signals are delivered.'], links: [{ label: 'Configure alerts', href: '#', primary: true }] } },
  ];
  const sysZones = [
    { x: 0, y: 50, w: 290, h: 620, label: 'Sources', tone: 'd-1' },
    { x: 790, y: 20, w: 560, h: 660, label: 'Platform', tone: 'd-2' },
    { x: 1410, y: 150, w: 270, h: 470, label: 'Consumers', tone: 'd-3' },
  ];
  const sysEdges = [
    { from: 's1:r', to: 'c:l', router: 'h', tone: 'd-1' },
    { from: 's2:r', to: 'c:l', router: 'h', tone: 'd-1' },
    { from: 's3:r', to: 'c:l', router: 'h', tone: 'd-1' },
    { from: 'c:r', to: 'p0:l', router: 'h', tone: 'd-6', label: 'JSON' },
    { from: 'p2:r', to: 'u1:l', router: 'h', tone: 'd-3' },
    { from: 'p4:r', to: 'u2:l', router: 'h', tone: 'd-3' },
  ];
  const systemSlide = (
    <Slide eyebrow="System Architecture" title="End to end," accentWord="one data contract" titleMb={10} dots={0.3}>
      <Diagram w={1700} h={700} nodes={sysNodes} edges={sysEdges} zones={sysZones} />
    </Slide>
  );

  /* ── Frame 3 · DEPLOYMENT TOPOLOGY ───────────────────────── */
  function DeployCol({ tone, mode, name, sub, bullets, boundary, internet }) {
    const cw = 470, ch = 250;
    const nodes = [
      { id: 'db', x: 22, y: 96, w: 118, h: 66, tone: 'mute', sm: true, title: '[ Source ]' },
      { id: 'ag', x: 176, y: 86, w: 118, h: 86, tone: 'd-5', sm: true, kicker: 'Agent', title: '[ Collector ]' },
      { id: 'pf', x: 330, y: 86, w: 118, h: 86, tone, sm: true, kicker: 'Platform', title: '[ Target ]' },
    ];
    const zones = boundary ? [{ x: 8, y: internet ? 40 : 56, w: 454, h: internet ? 200 : 168, label: boundary, tone }] : [];
    const edges = [
      { from: 'db:r', to: 'ag:l', router: 'straight', tone: 'd-5', dashed: true, label: 'JSON' },
      { from: 'ag:r', to: 'pf:l', router: 'straight', tone },
    ];
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: `var(--${tone}-fill), var(--${tone}-soft)`, border: `1.5px solid var(--${tone}-line)`, borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
        <div style={{ padding: '22px 28px 18px', borderBottom: `1px solid var(--${tone}-line)`, background: `color-mix(in srgb, var(--${tone}) 9%, transparent)` }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 14, letterSpacing: '0.18em', textTransform: 'uppercase', color: `var(--${tone})` }}>{mode}</div>
          <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.025em', marginTop: 8 }}>{name}</div>
          <div style={{ fontSize: 17, color: 'var(--ink-3)', marginTop: 4 }}>{sub}</div>
        </div>
        <div style={{ padding: '24px 22px 8px' }}><Diagram w={cw} h={ch} nodes={nodes} edges={edges} zones={zones} /></div>
        <div style={{ padding: '0 28px 26px', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {bullets.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', fontSize: 16, color: 'var(--ink-2)', lineHeight: 1.45 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: `var(--${tone})`, marginTop: 8, flexShrink: 0 }} />{b}
            </div>
          ))}
        </div>
      </div>
    );
  }
  const deploySlide = (
    <Slide eyebrow="Deployment Topology" title="Same binary," accentWord="three surfaces" titleMb={20} dots={0.25}>
      <div style={{ flex: 1, display: 'flex', gap: 28, alignItems: 'stretch' }}>
        <DeployCol tone="d-2" mode="Mode 1" name="SaaS" sub="[ cloud-managed ]" boundary="" internet
          bullets={['[ Outbound HTTPS only ]', '[ API key per source ]', '[ No infra to manage ]']} />
        <DeployCol tone="d-3" mode="Mode 2" name="Self-hosted" sub="[ your network ]" boundary="Your network boundary"
          bullets={['[ .deb / .rpm / container ]', '[ Data never leaves the LAN ]', '[ Self-managed store ]']} />
        <DeployCol tone="d-1" mode="Mode 3" name="Air-gapped" sub="[ isolated network ]" boundary="Fully isolated"
          bullets={['[ Zero outbound connections ]', '[ Self-contained bundle ]', '[ Regulated environments ]']} />
      </div>
    </Slide>
  );

  /* ── Frame 4 · DATA-SOURCE HUB (hub & spoke) ─────────────── */
  function HubDiagram() {
    const w = 1500, h = 700, cx = w / 2, cy = h / 2;
    const rx = 560, ry = 290;
    const sources = ['[ source_one ]', '[ source_two ]', '[ source_three ]', '[ source_four ]', '[ source_five ]', '[ source_six ]', '[ source_seven ]', '[ source_eight ]'];
    const angles = [-90, -45, 0, 45, 90, 135, 180, 225].map((d) => (d * Math.PI) / 180);
    const pw = 230, ph = 56;
    const pills = sources.map((s, i) => {
      const px = cx + rx * Math.cos(angles[i]);
      const py = cy + ry * Math.sin(angles[i]);
      return { s, px, py, x: px - pw / 2, y: py - ph / 2 };
    });
    return (
      <div style={{ position: 'relative', width: w, height: h, margin: '0 auto' }}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {pills.map((p, i) => <line key={i} x1={cx} y1={cy} x2={p.px} y2={p.py} stroke="var(--d-5)" strokeWidth="1.5" strokeDasharray="5,4" opacity="0.45" />)}
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="var(--line)" strokeWidth="1" strokeDasharray="2,8" opacity="0.7" />
        </svg>
        {pills.map((p, i) => (
          <div key={i} style={{ position: 'absolute', left: p.x, top: p.y, width: pw, height: ph, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--d-5-fill), var(--d-5-soft)', border: '1px solid var(--d-5-line)', borderRadius: 10, fontFamily: 'var(--f-mono)', fontSize: 15, color: 'var(--ink-2)' }}>{p.s}</div>
        ))}
        <div style={{ position: 'absolute', left: cx - 160, top: cy - 90, width: 320, height: 180, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--accent-fill), var(--accent-soft)', border: '2px solid var(--accent-line)', borderRadius: 18, boxShadow: 'var(--accent-glow), 0 8px 30px rgba(0,0,0,0.25)' }}>
          <FlowEdge dur={8} />
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 14, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--accent)' }}>Collector</div>
          <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: '-0.02em' }}>[ Agent ]</div>
          <div style={{ fontSize: 16, color: 'var(--ink-3)' }}>[ N+ metrics / run ]</div>
        </div>
        <div style={{ position: 'absolute', left: cx - 130, top: cy + 100, width: 260, textAlign: 'center', fontFamily: 'var(--f-mono)', fontSize: 15, color: 'var(--d-6)', background: 'var(--d-6-soft)', border: '1px solid var(--d-6-line)', borderRadius: 100, padding: '7px 0' }}>→ emits portable JSON</div>
      </div>
    );
  }
  const hubSlide = (
    <Slide eyebrow="Collection Model" title="One agent," accentWord="every source" titleMb={6} dots={0.3}>
      <HubDiagram />
    </Slide>
  );

  /* ── Frame 5 · LAYERED PLATFORM STACK ────────────────────── */
  function Layer({ tone, tag, title, sub, boxes, last }) {
    return (
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', background: `var(--${tone}-fill), var(--${tone}-soft)`, border: `1.5px solid var(--${tone}-line)`, borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          <div style={{ width: 220, flexShrink: 0, padding: '20px 24px', borderRight: `1px solid var(--${tone}-line)`, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase', color: `var(--${tone})` }}>{tag}</div>
            <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>{title}</div>
            <div style={{ fontSize: 15, color: 'var(--ink-3)' }}>{sub}</div>
          </div>
          <div style={{ flex: 1, padding: 16, display: 'flex', gap: 14 }}>
            {boxes.map((b, i) => (
              <div key={i} style={{ flex: 1, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{b[0]}</div>
                <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>{b[1]}</div>
              </div>
            ))}
          </div>
        </div>
        {!last && (
          <div style={{ display: 'flex', justifyContent: 'center', height: 30, alignItems: 'center' }}>
            <svg width="22" height="30" viewBox="0 0 22 30"><path d="M11,2 V22" stroke="var(--d-6)" strokeWidth="2" /><path d="M4,16 L11,24 L18,16" fill="none" stroke="var(--d-6)" strokeWidth="2" /></svg>
          </div>
        )}
      </div>
    );
  }
  const stackSlide = (
    <Slide eyebrow="Layer Model" title="A clean," accentWord="layered stack" titleMb={16} dots={0.25}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Layer tone="d-1" tag="L1 · Collect" title="[ Ingest ]" sub="[ stateless agents ]" boxes={[['[ Collector ]', '[ pull · cron ]'], ['[ Adapter ]', '[ per-source ]'], ['[ Buffer ]', '[ at-least-once ]']]} />
        <Layer tone="d-2" tag="L2 · Store" title="[ Persist ]" sub="[ backing store ]" boxes={[['[ Time-series ]', '[ retention ]'], ['[ Catalog ]', '[ metadata ]'], ['[ Index ]', '[ query path ]']]} />
        <Layer tone="d-3" tag="L3 · Serve" title="[ Analyze ]" sub="[ application layer ]" boxes={[['[ Query API ]', '[ read path ]'], ['[ Rules ]', '[ evaluation ]'], ['[ Export ]', '[ downstream ]']]} />
        <Layer tone="d-5" tag="L4 · Consume" title="[ Surface ]" sub="[ edges ]" last boxes={[['[ Dashboard ]', '[ UI ]'], ['[ Alerting ]', '[ notify ]'], ['[ API ]', '[ integrations ]']]} />
      </div>
    </Slide>
  );

  window.ISG.register({
    id: 'arch-deck', group: 'Architecture deck', name: 'Technology architecture deck',
    interactive: true,
    blurb: 'Real technical schematics built on a node/edge/zone diagram engine — components as nodes, directional data-flow arrows, trust/network boundaries, a hub-and-spoke source map and a layered stack. Each node owns one muted diagram hue; coral marks the lead component.',
    frames: [
      { label: 'Cover', mode: 'board', w: W, h: H, node: cover },
      { label: 'System diagram', mode: 'board', w: W, h: H, node: systemSlide },
      { label: 'Deployment topology', mode: 'board', w: W, h: H, node: deploySlide },
      { label: 'Data-source hub', mode: 'board', w: W, h: H, node: hubSlide },
      { label: 'Layered stack', mode: 'board', w: W, h: H, node: stackSlide },
    ],
  });
})();
