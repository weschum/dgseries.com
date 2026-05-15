# dgseries.com — Claude Project Notes

## What this is
A disc golf series standings tracker. Vanilla JS + PHP, deployed on Namecheap shared Apache hosting via cPanel Git deploy. No build step — all files served as-is.

## Deployment
- **Server:** `server315.web-hosting.com`, port 21098, user `chumuvep`
- **Doc root:** `/home/chumuvep/dgseries.com/`
- **Deploy:** `ssh -p 21098 chumuvep@server315.web-hosting.com "bash ~/deploy-dgseries.sh"`
  - Script does: `git pull origin main` → `cp` files to doc root → cleanup
  - Always **merge to `main` and push to GitHub first**, then run the deploy script
- **DB config** (server only, not in repo): `/home/chumuvep/private/db_config.php`
  - DB: `chumuvep_dgseries`, tables: `events`, `event_results`

## Architecture
```
/                       ← repo root
  index.html            ← redirect / landing (not a series)
  pdga-proxy.php        ← disk-caching PHP proxy for PDGA requests
  api.php               ← REST endpoint: get_stored_results / store_event
  _shared/              ← shared runtime (loaded by every series)
    version.js          ← window.SITE_BUILD stamp — bump on every release
    common.js           ← core: seed discovery, PDGA scraping, DB helpers, caching
    index.js            ← home view logic
    standings.js        ← standings view logic
    all-events.js       ← all-events view logic
    player.js           ← player stats view logic
    router.js           ← hash-based SPA router, loads HTML templates
    styles.css          ← all styles
    views/              ← HTML templates injected by router
      home.html
      standings.html
      all-events.html
      player.html
  series-registry.json  ← manifest of public series (read by index.html, written by generator)
  tools/
    new-series.html     ← series generator form (File System Access API, Chrome/Edge)
  sows-25-26/           ← SOWS 2025-26 series
    series.config.js
    index.html
  uplay-2025-26-winter/ ← UPlay series
    series.config.js
    index.html
  test-series/          ← Dev/QA series covering all PDGA status types
    series.config.js
    index.html
```

## Series generator (`/tools/new-series.html`)
- Fill in the form → click **Save to Repo** → pick the local repo folder (Chrome File System Access API)
- Writes: `{slug}/series.config.js`, `{slug}/index.html`, updates `series-registry.json`
- Fallback: **Download ZIP** button for non-Chrome browsers (files need to be placed manually)
- After saving, shows the git commands to commit + deploy
- `test-series` is NOT in `series-registry.json` (dev-only, accessed directly by URL)

## series-registry.json
- Root-level JSON file listing public series: `{ "series": [{ slug, title, subtitle, accent }] }`
- `index.html` fetches it at runtime to render series cards dynamically
- Generator appends new entries when a series is created
- Add a series to the registry manually to show it on the home page without using the generator

## PDGA event status model
| Status | Meaning | In standings by default |
|---|---|---|
| `official` | PDGA-certified results | Always yes |
| `unofficial` | Results posted, not yet certified | Toggle (per session) |
| `live` | Live scoring in progress | Toggle (per session) |
| `pending` | Event happened, no results yet | No |
| `registering` | Future event (open or closed registration) | No |
| `cancelled` | Cancelled (inferred from name) | No |

- Note: PDGA status cell can show two icons for registering events — a book.gif (PDGA reg list) and a discgolfscene.com sign-up link. Sign-up link disappears when registration closes. We treat both states as `"registering"` since the distinction doesn't affect standings or any current feature.

- Only `official` and `unofficial` events are stored to DB (`api.php` rejects others)
- Status detected from PDGA search page `.views-field-StatusIcons` cell (trophy icons, live links, book icon)
- `isCompleted = status === "official" || status === "unofficial"` (backward compat field)

## Key data flow
1. `getSeriesContext()` — fetches/caches seed URLs from PDGA, builds event list with status
2. `loadAllEvents()` — for each included event, loads results from DB first, falls back to PDGA scrape
3. `storeEventResults()` — fire-and-forget POST to `api.php` after scraping official/unofficial events
4. `shouldInclude(ev)` — filters events by status + session toggles (`dgst_include_live`, `dgst_include_unofficial` in sessionStorage)

## Session toggles
- `sessionStorage` keys: `dgst_include_live`, `dgst_include_unofficial` (values `"0"` / `"1"`)
- Defaults come from `series.config.js` → `scoring.defaultIncludeLive` / `scoring.defaultIncludeUnofficial`
- Toggle buttons appear in standings view only if the series config defines these keys
- Toggling calls `window.Common.clearResultsCache()` then re-runs `loadAllEvents`

## Rate limiting protection
- `pdga-proxy.php` disk-caches responses (prevents repeat PDGA hits across users/reloads)
- `?force=1` URL param bypasses session cache and triggers fresh PDGA fetch
- Per-session new-fetch cap (default 6, configurable as `pdga.newFetchCap` in series config) spreads cold-start scraping across page loads
- `pdga.throttleMs` / `pdga.forceThrottleMs` control delay between scrape requests

## series.config.js fields
```js
window.SERIES_CONFIG = {
  identity:  { seriesId: "slug" },
  branding:  { titleText: "..." },
  theme:     { accent: "#hex", nav: { borderColor, borderWidthPx, radiusPx, fontWeight } },
  pdga: {
    seedUrls: [...],       // PDGA tour search URLs to discover events
    throttleMs: 800,       // delay between scrape requests (normal mode)
    forceThrottleMs: 3000, // delay in ?force=1 mode
    newFetchCap: 6,        // max new PDGA fetches per session (cold start protection)
  },
  naming: {
    shortLabelMaxWords: 5,
    shortLabelStopWords: [...],
  },
  scoring: {
    pointsColumnName: "Series Pts",
    points: { type: "linear", base: 101 },
    defaultIncludeLive: false,       // omit key entirely to hide toggle
    defaultIncludeUnofficial: false, // omit key entirely to hide toggle
  },
  standings: {
    topEvents: 5,
    maxTotal: 500,
    description: "Points Total = Top Five Event Results",
  },
};
```

## Version bumping
`_shared/version.js` holds `window.SITE_BUILD`. Bump it on every release — it busts all client caches.
Current value: `2026-05-15-02`.
- `version.js` itself is served with `Cache-Control: no-store` via `.htaccess` so it's always fetched fresh
- All other `_shared/*.js` and `*.css` assets use `no-cache, must-revalidate` — they revalidate using the `?v=` stamp
- **Lesson learned:** iOS Safari respects `no-store` but can silently ignore `no-cache` for same-session navigations. Always use `no-store` on the cache-key file itself.

## Mobile nav
- Desktop: horizontal pill row in the header (right column)
- Mobile (≤700px): two-row header — row 1 `[logo | series title]`, row 2 `[☰ Current Page]` full-width button
- Tapping the button opens a full-width dropdown (position:absolute, z-index 300) with all nav items as 44px touch-target rows
- Active page is accent-colored in the dropdown; tapping any item closes the menu and navigates
- Outside-click handler stored on `window.__navOutsideClick` — cleaned up and replaced on each `loadHeader()` call

## What was built this session (2026-05-15)
### Series generator + registry
- **`/tools/new-series.html`** — self-contained generator form; uses File System Access API (Chrome) to write files directly into the local repo; fallback download buttons for other browsers
  - Writes `{slug}/series.config.js`, `{slug}/index.html`, updates `series-registry.json`
  - Shows git commit + deploy commands after saving
- **`series-registry.json`** — root-level manifest `{ "series": [{ slug, title, subtitle, accent }] }`
- **`index.html`** — now fetches `series-registry.json` at runtime; renders accent-stripe cards dynamically; hardcoded fallback if fetch fails
- `test-series` intentionally excluded from registry (dev-only, accessed by direct URL)

### Config normalization
- `normalizeConfig()` in `common.js` validates required fields, applies typed defaults, warns on bad values
- All series configs simplified to plain `window.SERIES_CONFIG = { ... }` — no IIFE wrapper needed
- `_shared/series.config.template.js` — master reference with every field documented

### Views added
- **Leaders view** — top-N players per division; between Home and Standings in nav
- Division sort uses canonical `DIVISION_ORDER` array covering all PDGA divisions (MP/FP/MA/FA/MJ/FJ age pools + college)

### Home view improvements
- Upcoming events shown above Past Events
- Short date format (3/9/26 – 5/11/26) in a narrow column
- Status badges: Unoff. (yellow), LIVE (green), Regis. (blue), Pend. (grey) — Official events get no badge
- Completed renamed to "Past Events"

### Standings view improvements
- Event count summary: "3 events (2 official, 1 unofficial)"
- Toggle buttons (Live / Unofficial) only appear if series config defines the keys
- Toggle bug fixed: `!!"0"` is truthy in JS — fixed to `raw === "1"` pattern
- Tied rank display: all tied players show T prefix (T1, T1, 3 — not just second-onward)

## Known issues / polish for next session
- **Mobile nav polish** — hamburger + dropdown is functional but rough around the edges; could use visual refinement (transitions, chevron animation, active state on button itself)
- **`uplay-2025-26-winter`** series hasn't been force-loaded to populate its DB events yet — visit `dgseries.com/uplay-2025-26-winter/?force=1` to seed it
- **Consolidate `escapeHtml`** — four duplicates across view JS files; should use `window.Common.escapeHtml` everywhere
- **Generator UX polish**
  - Preview of the home-page card as you fill in the form
  - Subtitle field (could auto-suggest from date range)
  - Validation feedback before Save button is enabled
- **Index / home page**
  - Show live event count or "last updated" on each series card (requires a lightweight API call or pre-baked data)
  - Search/filter once series count grows past ~10
- **`test-series` seeds** — currently using Oregon May 10-17 + TD 126404; good for testing unofficial toggle but limited player data; consider a seed with more historical official events for richer QA
- **Performance** — cold start on a new series still requires multiple sequential PDGA fetches; consider a server-side pre-seeder script that could be run once to bulk-load a new series DB
- **Long-term: TD onboarding** — the generator is the first step; next would be a lightweight admin view to manage a series (edit config, manually exclude an event, override a result)
