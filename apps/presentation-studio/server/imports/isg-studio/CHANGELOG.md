# ISG Template Library — Interactivity & mobile pass (June 2026)

Adds a click-through interactivity layer, a new Roadmap template, and
real mobile readability for the fixed-width designs. Built from the
canonical `.jsx` sources (lib/viz/gallery/tpl-*) concatenated into the
single `ISG Template Library.html` Babel block.

## New: interactivity layer
| Addition | What it does |
|---|---|
| `Interactive` wrapper + `openInspector()` (lib.jsx) | Any element becomes a tactile control: hover-lift, press, keyboard focus, an `↗`/`+` affordance cue. Renders an `<a>` for hyperlinks (external → new tab) or a button that opens the Inspector. |
| `Inspector` panel (lib.jsx, mounted by gallery App) | Shared detail panel fed by the `isg:inspect` event. Desktop: right-docked rail; mobile: bottom sheet. Shows kicker/title/body/spec rows/tags and link buttons. Esc / backdrop / × to close. |
| `Card` · `StatCard` · `Node` now interactive-capable | Pass `href` / `detail` / `onActivate` and the primitive becomes clickable (opt-in; inert otherwise). |
| `.ix` / `.ix-cue` / `.ix-panel` CSS (tokens.css) | Hover/press transitions, focus ring, affordance cue, panel transitions. Reduced-motion + print fallbacks. |

## Architecture deck — fully interactive diagram engine
- Hovering a node spotlights its edges (animated `svg-edge-flow`) and neighbours; the rest of the diagram dims.
- Clicking a node opens the Inspector with its spec; one node demonstrates a hyperlink.

## New template: Roadmap & timeline
- Four-quarter timeline with clickable phase bars + milestone diamonds.
- Now / Next / Later prioritization grid of clickable initiative cards.
- Every element opens the Inspector; coral marks the critical path.

## Infographics kit
- `IconStat` tiles accept `detail` and open the Inspector on click.

## Mobile readability
| Change | Problem it solves |
|---|---|
| `Stage` zoom (`fit` / absolute) + `.board-scroll` horizontal scroll | 1920px boards scaled to ~0.2 on phones were unreadable; now Fit / 50% / 100% (boards) and Fit / 75% / 100% (flow docs) with pan. |
| Mobile zoom control above every frame | Lets users jump to a legible zoom and scroll. |
| Inspector as a bottom sheet on mobile | Detail panel is thumb-reachable. |

## Gallery shell — appearance & readability
- Template **search/filter** in the desktop rail and the mobile drawer (15 templates now).
- **Interactive** hint pill on templates that support click-through.

## Deliberately NOT changed
Brand coral + palette · token names · existing template copy · the
`window.ISG.register` API (only an optional `interactive: true` flag added).

---

# ISG Template Library — Editorial polish pass (June 2026)

Every change is token- or chrome-level. Zero changes to template content,
component names, file names, or the `window.ISG.register` API.

## Tokens (tokens.css)
| Change | Problem it solves |
|---|---|
| Motion tokens `--dur-fast: 150ms`, `--dur: 220ms`, `--ease-out` | Ad-hoc 0.12–0.34s values everywhere; no single motion voice (Step 8) |
| Semantic aliases: `--text`, `--text-muted`, `--surface`, `--surface-raised`, `--border`, `--primary` + hover/active | Re-skinning required knowing internal names; now a stable semantic layer (Step 4) |
| `text-wrap: balance` on `.t-h1` / `.t-h2` | Ragged two-line headings; orphan words (Step 1 microtypography) |
| New `gc-*` chrome classes with `:hover` / `:active` / `:disabled` states | Inline styles meant zero hover/press feedback anywhere in the shell (Step 6/8) |

## Gallery chrome (gallery.jsx)
| Change | Problem it solves |
|---|---|
| Blurb 13–14px → **16px**/1.65, 62ch measure, `text-wrap: pretty` | Primary reading text below the 16px floor (Step 1) |
| Title → fluid `clamp(23px, 3.2vw, 28px)` + `text-wrap: balance` | Fixed sizes at odd viewports; ragged wraps (Step 7) |
| Hover/press states on nav items, chips, segments (via `gc-*`) | No interaction feedback; felt static (Step 8) |
| **Mobile thumb-zone action bar**: Templates button + prev/next frame stepper with position indicator, fixed bottom, safe-area aware | All actions were top-of-screen, out of thumb reach (Step 7) |
| Mobile drawer items 15px → 16px, 48px min height | Below 44px target floor in places (Step 7/9) |
| Frame chips: 44px targets on mobile | Was 36px — under the touch floor (Step 7) |
| **Prev/next template pager** at the end of every page | Dead end after each template; no linear browse path (Step 6) |
| Theme choice persists (`localStorage: isgTheme`) | Theme reset on every reload (Step 9 quality) |
| Scroll resets to top on template switch | Landing mid-page on a new template was disorienting |
| Desktop rail items: larger hit area (8px pad), 13.5px, hover state | Cramped 7px targets, no hover (Step 2/7) |

## Already at the bar (verified previously, unchanged)
WCAG-AA/AAA ink scale on both themes · centralized `:focus-visible` ring ·
4/8px spacing scale · 5-stop radius scale · layered low-opacity shadows ·
dark + bright themes re-checked pair-by-pair · `prefers-reduced-motion`
fallbacks for every animation · print lands on settled end states ·
tabular numerals in data contexts.

## Deliberately NOT changed
Template-internal type sizes (fixed-canvas designs scale via Stage —
resizing them would break composed layouts) · brand coral + palette ·
all copy · template/file/component names.
