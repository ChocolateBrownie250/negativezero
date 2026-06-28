# timezones

A small cross-timezone meeting planner, served at
`negativezero.one/services/timezones/`.

Add cities/IANA zones, mark one as **home**, and read each zone's local
time across the home day on an ambient day/night **timeline you drag to
scrub any hour** — every city's big clock and the status readout follow
the marker. Working-hours bands are highlighted and the status bar shows
how many hours *every* zone is within working hours (the overlap — the
good slots for a call). A **light / dark** theme toggle persists alongside
the rest of the state (zones, home, working hours, 12/24h, date, theme) in
`localStorage`.

The UI is the "liquid glass" iOS design (frosted-glass surfaces over an
animated mesh background), imported from Claude Design.

## Shape

Pure static site — no backend, no build step. All timezone math is
client-side via the `Intl` API (`Intl.supportedValuesOf('timeZone')` for
the zone catalogue, `Intl.DateTimeFormat` for offsets and conversions).

```
index.html   markup + fixed mesh background + glass shell
styles.css   liquid-glass theme system (light/dark via [data-theme])
app.js       zone catalogue, search, ambient timeline + drag-scrub + overlap
fonts/       Geist + Geist Mono fallback (SF Pro system fonts preferred)
```

Served by an `nginx:alpine` container exactly like `apps/landing/`; the
host nginx reverse-proxies `/services/timezones/` to it with the prefix
stripped, so the container sees clean root paths and the page's relative
asset references resolve correctly.

## Develop

Open `index.html` directly in a browser, or serve the folder:

```sh
cd apps/timezones && python3 -m http.server 8080
# → http://localhost:8080/
```
