# timezones

A small cross-timezone meeting planner, served at
`negativezero.one/services/timezones/`.

Add cities/IANA zones, mark one as **home**, and read a 24-hour strip of
each zone's local time across the home day. Working-hours bands are
highlighted and columns where *every* zone is within working hours are
flagged as overlap — the good slots for a call. State (zones, home,
working hours, 12/24h, date) persists in `localStorage`.

## Shape

Pure static site — no backend, no build step. All timezone math is
client-side via the `Intl` API (`Intl.supportedValuesOf('timeZone')` for
the zone catalogue, `Intl.DateTimeFormat` for offsets and conversions).

```
index.html   markup + inline favicon
styles.css   negativezero dark theme (Geist / Geist Mono)
app.js       zone catalogue, search, grid + overlap logic
fonts/       Geist + Geist Mono (shared with apps/landing)
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
