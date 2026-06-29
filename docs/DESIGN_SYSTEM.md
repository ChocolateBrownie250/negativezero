# Design System

The visual language shared across the negativezero platform: the
"liquid glass" deep-blue dark theme that makes eight independent services
read as one product. Update this when a token changes, a new primitive is
added, or a service's adherence shifts.

For the technical architecture see [ARCHITECTURE.md](ARCHITECTURE.md); for
the reasoning behind choices see [DECISIONS.md](DECISIONS.md).

The reference implementation is the Amethyst PWA (its `web/pwa/styles.css`,
now in the `amethyst-independent` repo, not in this repo). The canonical token
source for the React apps
is `apps/bookmark-manager/client/src/lib/colors.ts` together with the
`:root` and `@theme` blocks in
`apps/bookmark-manager/client/src/styles.css`.

---

## Palette

All values are taken from `apps/bookmark-manager/client/src/styles.css`
(the `:root` custom properties) and the matching JS constants in
`apps/bookmark-manager/client/src/lib/colors.ts`. CSS custom properties
drive the bespoke `.glass-*` primitives and the aurora background; the JS
constants mirror them so the many inline `style={{ ... }}` usages pick up
the same values.

### Backgrounds

| Token   | Value     | Role                                      |
| ------- | --------- | ----------------------------------------- |
| `--bg0` | `#03050d` | Near-black with a blue cast; canvas base  |
| `--bg1` | `#070b18` | Ink; mid stop of the page gradient        |
| `--bg2` | `#081026` | Deep blue; upper stop of the gradient     |

Solid panel fallbacks under glass surfaces: `card #0d1730`,
`surface #121d3a`, `raised #1a2748`, `raisedHover #22315a`.

### Accent

| Token      | Value     | Role                                   |
| ---------- | --------- | -------------------------------------- |
| `--ac`     | `#5b93f0` | Primary accent (blue)                  |
| `--ac-mid` | `#2c5fdd` | Mid stop for primary-button gradients  |
| `--ac-deep`| `#1431a8` | Deep stop for primary-button gradients |

### Status

| Token             | Value     | Role             |
| ----------------- | --------- | ---------------- |
| `--danger` / `red`| `#ff6a86` | Errors, destruct |
| `--ok` / `green`  | `#56e0b0` | Success, online  |
| `yellow`          | `#ffd60a` | Warning, flag    |

The `red`, `green`, and `yellow` JS keys live in each service's
`colors.ts`; `--danger` and `--ok` are the CSS-variable equivalents in the
Amethyst PWA.

### Text

| Token      | Value     | Role               |
| ---------- | --------- | ------------------ |
| `--fg`     | `#eef2fa` | Primary text       |
| `--fg-mid` | `#9aa4bd` | Secondary text     |
| `--fg-dim` | `#6b7491` | Tertiary text      |
| `--fg-faint`| `#49526c`| Quaternary / hints |

### Glass fills

| Token       | Value                      | Role                  |
| ----------- | -------------------------- | --------------------- |
| `--glass`   | `rgba(70, 98, 165, 0.07)`  | Base translucent fill |
| `--glass-2` | `rgba(86, 116, 190, 0.11)` | Raised fill (pills)   |
| `--glass-3` | `rgba(110, 142, 215, 0.15)`| Active / hover fill   |

### Borders

| Token       | Value                       | Role                   |
| ----------- | --------------------------- | ---------------------- |
| `--edge`    | `rgba(150, 178, 235, 0.16)` | Strong hairline ring   |
| `--edge-lo` | `rgba(140, 168, 228, 0.085)`| Inset surface ring     |
| `--hairline`| `rgba(150, 178, 235, 0.07)` | Faint divider / inset  |

### Glow

| Token      | Value                     | Role                       |
| ---------- | ------------------------- | -------------------------- |
| `--glow`   | `rgba(34, 72, 180, 0.4)`  | Primary aurora / focus ring|
| `--glow-2` | `rgba(18, 42, 128, 0.3)`  | Secondary aurora / shadow  |

---

## Glass material

The signature surface. Every key container (login card, modals, dropdown
menus, the bookmark list, the toast) carries a `.glass-card`,
`.glass-surface`, or `.glass-pill` class. The recipe layers a directional
gradient over a translucent base, blurs what sits behind it, and stacks
inset highlights with a drop shadow.

```css
.glass-card,
.glass-surface,
.glass-pill {
  background:
    linear-gradient(
      177deg,
      rgba(104, 134, 200, 0.13) 0%,
      rgba(58, 80, 148, 0.07) 46%,
      rgba(40, 60, 120, 0.05) 100%
    ),
    rgba(18, 28, 56, 0.55);
  -webkit-backdrop-filter: blur(var(--blur)) saturate(135%) brightness(0.97);
  backdrop-filter: blur(var(--blur)) saturate(135%) brightness(0.97);
  box-shadow:
    inset 0 1px 0 rgba(190, 212, 255, 0.14),
    inset 0 0 0 1px var(--edge-lo),
    0 1px 1px rgba(0, 2, 12, 0.4),
    0 10px 30px rgba(0, 1, 8, 0.5);
}
```

Notes:

- `--blur` resolves to `26px`. The `saturate(135%) brightness(0.97)` pass
  keeps the blurred backdrop colorful without washing it out.
- Always ship the `-webkit-backdrop-filter` prefix alongside the standard
  property for Safari and the iOS PWAs.
- `.glass-surface` and `.glass-pill` use a slightly more opaque base
  (`rgba(16, 26, 52, 0.72)`) and a tighter shadow for floating menus and
  the toast.
- The Amethyst reference (its `web/pwa/styles.css`, in the
  `amethyst-independent` repo) adds an `::after`
  gradient-border ring and an `::before` top sheen on its `.glass`
  primitive for extra depth on the marquee surfaces.

---

## Animation

Motion is tasteful and HIG-flavored: popovers and menus pop in, toolbars
and the toast slide up, rows ease their selection and drag states. The
shared easing curve is `cubic-bezier(0.2, 0.8, 0.2, 1)`.

```css
@keyframes nz-pop-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes nz-slide-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes nz-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

| Class          | Duration / easing                          | Use                   |
| -------------- | ------------------------------------------ | --------------------- |
| `.nz-pop`      | `0.16s cubic-bezier(0.2, 0.8, 0.2, 1)`     | Menus, popovers       |
| `.nz-slide-up` | `0.22s cubic-bezier(0.2, 0.8, 0.2, 1)`     | Toolbars, toast       |
| `.nz-fade-in`  | `0.18s ease`                               | Tab / content swaps   |
| `.nz-row`      | `0.12s–0.2s ease` (multi-property)         | List rows             |

`.nz-row` transitions `background-color`, `box-shadow`, `opacity`, and
`transform`. On pointer devices it gains a subtle hover lift via an inset
ring:

```css
@media (hover: hover) and (pointer: fine) {
  .nz-row:hover {
    box-shadow: inset 0 0 0 1px rgba(150, 178, 235, 0.12);
  }
}
```

Every animation is disabled under the reduced-motion guard:

```css
@media (prefers-reduced-motion: reduce) {
  .nz-pop,
  .nz-slide-up,
  .nz-fade-in { animation: none; }
  .nz-row { transition: none; }
}
```

---

## Typography

The React apps and the Amethyst PWA use the SF / system stack, exposed as
`--font-sf` in the Tailwind `@theme` block and as `SF_FONT` in
`colors.ts`:

```css
-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
"Helvetica Neue", Helvetica, Arial, sans-serif;
```

A tight `letter-spacing: -0.01em` is applied at the body level. Monospace
contexts (model tags, instruction blocks) use
`"SF Mono", ui-monospace, monospace`.

Landing (`apps/landing/`) and Timezones (`apps/timezones/`) instead ship
the variable **Geist** sans and **Geist Mono** fonts, which carry their
own warmer branding (see Per-service adherence).

Weight and size ranges in use:

- **Weights:** `300` (large numeric timers) through `800` (large titles);
  body copy sits around `420`–`480`, labels `560`–`720`.
- **Sizes:** `10px`–`13px` for chrome labels and meta, `15px`–`16.5px`
  for body and inputs, up to `32px`–`40px` for hero titles and timers.
- Numeric displays use `font-variant-numeric: tabular-nums`.

---

## Radius and blur scale

| Token    | Value  | Use                                |
| -------- | ------ | ---------------------------------- |
| `--r-lg` | `26px` | Large cards, sheets                |
| `--r`    | `20px` | Default surface radius             |
| `--r-sm` | `14px` | Compact controls, search bars      |
| `--blur` | `26px` | Backdrop-filter blur radius        |

Smaller one-off radii (buttons at `13px`, inputs at `12px`, pills at
`7px`–`10px`) are used locally and are not tokenized.

---

## Component conventions

- **Surfaces:** `.glass-card` (panels, modals), `.glass-surface`
  (floating menus, toast), `.glass-pill` (compact chrome). In the Amethyst
  PWA the single `.glass` primitive covers all three.
- **Buttons:** `.btn-primary` is a blue gradient
  (`--ac-mid` → `--ac-deep`) with an inset top highlight and a `--glow-2`
  drop shadow; `.btn-ghost` is a translucent glass fill; `.icon-btn` is a
  36px circular glass button with a danger variant
  (`.icon-btn-danger`). Buttons press with `transform: scale(0.965)`.
- **Inputs:** dark translucent fill (`rgba(2, 6, 20, 0.38)`) with an inset
  hairline ring; focus adds an accent-tinted ring plus a `--glow-2` halo.
- **Composite controls:** `IconPicker`
  (`apps/bookmark-manager/client/src/components/IconPicker.tsx`) and
  `DropdownPanel`
  (`apps/bookmark-manager/client/src/components/menus/DropdownPanel.tsx`)
  are the canonical React patterns for icon selection and glass popovers.
- **Focus:** `:focus-visible` draws a `2px solid var(--ac)` outline with a
  `2px` offset for keyboard users.

---

## Iconography

- **React apps** (Basalt, Admin, Redirector, Video-downloader, Citrine)
  use `lucide-react` (`^1.16.0`) for inline SVG icons.
- **Amethyst PWA** uses an inline `<symbol>` SVG sprite defined in its
  `web/pwa/index.html` (in the `amethyst-independent` repo) and referenced
  via `<use>` (for example
  `i-mic`, `i-stop`, `i-clock`, `i-book`), all `currentColor`-driven so
  they inherit the accent.
- Both styles share a `1.7` stroke width, round caps, and round joins.

### Manifests

Each service ships a per-service `icon.svg` and a `manifest.webmanifest`.
The manifests share `theme_color: #0d1a44` (the gradient's bright top
stop) and `background_color: #081026` (the `--bg2` deep blue), so the
install splash and OS chrome match the in-app aurora. Service worker
scopes follow `/services/<name>/`.

---

## Per-service adherence

| Service          | Path                         | Theme stance                                   |
| ---------------- | ---------------------------- | ---------------------------------------------- |
| Amethyst (TTS)   | `web/pwa/` (amethyst-independent repo) | Reference implementation             |
| Basalt           | `apps/bookmark-manager/`     | Full adherence                                 |
| Admin            | `apps/admin/`                | Full adherence                                 |
| Redirector       | `apps/redirector/`           | Full adherence                                 |
| Video-downloader | `apps/video-downloader/`     | Full adherence                                 |
| Citrine          | `apps/presentation-studio/`  | Blue base + coral identity accent `#f2552f`    |
| Timezones        | `apps/timezones/`            | Geist fonts + gold accent `#e4b05a` (`--hi`)   |
| Landing          | `apps/landing/`              | Separate warm branding                         |

Notes:

- **Citrine** keeps the full blue platform chrome and overlays a warm
  coral accent (`#f2552f`, the `accent` key in its `colors.ts`) for
  element and selection highlights in the editor — its identity color.
- **Timezones** is vanilla HTML/CSS/JS on the Geist type system. It keeps
  the cool near-white ink (`#eef2fa`) but uses a gold accent
  (`#e4b05a`, the `--hi` token) as its identity color.
- **Landing** is a standalone static page with its own warm palette
  (`--bg #080807`, `--ink #f1f0ea`, `--accent #e4b05a`) and the Geist
  fonts. It is intentionally branded separately from the service chrome.

---

## Known debt

The platform palette is **copy-pasted across five `colors.ts` files** with
no shared package:

- `apps/bookmark-manager/client/src/lib/colors.ts`
- `apps/admin/client/src/lib/colors.ts`
- `apps/redirector/client/src/lib/colors.ts`
- `apps/video-downloader/client/src/lib/colors.ts`
- `apps/presentation-studio/client/src/lib/colors.ts`

Each file independently restates `#03050d`, `#5b93f0`, `#56e0b0`,
`#ff6a86`, `#ffd60a`, and the rest. A token drift in one service will not
propagate, and the Amethyst PWA carries its own CSS-variable copy on top.
Extracting a single shared design-token package is tracked in
`docs/TECH_DEBT.md`.
