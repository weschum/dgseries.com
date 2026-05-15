// ─────────────────────────────────────────────────────────────────────────────
// series.config.template.js — Master reference for DGST series configuration
//
// USAGE
//   Copy this file to your-series-slug/series.config.js, fill in the required
//   fields, remove or keep optional fields as needed, and delete these comments.
//
// REQUIRED fields are marked  ← REQUIRED
// Optional fields show their default value after  // default:
// ─────────────────────────────────────────────────────────────────────────────

window.SERIES_CONFIG = {

  // ── Identity ──────────────────────────────────────────────────────────────
  identity: {
    seriesId: "your-series-slug",   // ← REQUIRED  lowercase letters, numbers, hyphens only
                                    //             must match the series folder name exactly
                                    //             used for DB namespacing and cache keys
  },

  // ── Branding ──────────────────────────────────────────────────────────────
  branding: {
    titleText: "Your Series Name",  // ← REQUIRED  displayed in the page header
  },

  // ── Theme ─────────────────────────────────────────────────────────────────
  // All theme fields are optional. Omit the whole block to use site defaults.
  theme: {
    accent: "#00ff3b",              // default: site green (#00ff3b)
                                    // used for active nav pill and focus ring
                                    // tip: pick a color that contrasts on white background
    nav: {
      borderColor:   "#000000",     // default: #000000  — pill border color
      borderWidthPx: 1,             // default: 1        — pill border thickness (px)
      radiusPx:      8,             // default: 8        — pill corner radius (px)
      fontWeight:    700,           // default: 700      — pill label weight
    },
  },

  // ── PDGA Discovery ────────────────────────────────────────────────────────
  pdga: {
    seedUrls: [                     // ← REQUIRED  array of PDGA tour search URLs
      // Build search URLs at: https://www.pdga.com/tour/search
      // Filter by TD number, event name, date range, state, or tier as needed.
      // Multiple seeds are merged — use them to cover official + upcoming events.
      "https://www.pdga.com/tour/search?td=XXXXX&date_filter...",
    ],

    throttleMs:      800,           // default: 800   — ms between PDGA fetches (normal load)
    forceThrottleMs: 3000,          // default: 3000  — ms between PDGA fetches (?force=1 mode)
    newFetchCap:     6,             // default: 6     — max new PDGA result fetches per page load
                                    //                  spreads cold-start scraping across visits
                                    //                  use Infinity to disable (not recommended)
  },

  // ── Short Label Naming ────────────────────────────────────────────────────
  // Controls how PDGA event names are shortened for display in tables/headings.
  naming: {
    shortLabelMaxWords:  5,         // default: 5   — max words kept after stop-word removal
    shortLabelStopWords: [],        // default: []  — series-specific words to strip from labels
                                    //               e.g. ["sows", "2025-26", "presented", "by"]
                                    //               common generic words are always stripped
  },

  // ── Scoring ───────────────────────────────────────────────────────────────
  scoring: {
    pointsColumnName: "Series Pts", // default: "Series Pts" — column header in tables

    points: {
      type: "linear",               // default: "linear"  — only supported type currently
      base: 101,                    // default: 101       — 1st place = base-1 = 100 pts
                                    //                      2nd place = base-2 = 99 pts, etc.
    },

    // ── Optional status toggles ──────────────────────────────────────────
    // OMIT these keys entirely to hide the toggle buttons on the Standings page.
    // Include them (true or false) to show toggles, with the given value as the
    // session default.

    // defaultIncludeLive:       false,  // show "Live" toggle, default OFF
    // defaultIncludeUnofficial: false,  // show "Unofficial" toggle, default OFF
  },

  // ── Standings Rules ───────────────────────────────────────────────────────
  standings: {
    topEvents:   4,                 // default: 4    — number of best events counted per player
    maxTotal:    400,               // default: topEvents × 100 — points ceiling per player
    description: null,              // default: null — displayed below "Series Standings" heading
                                    // e.g. "Points Total = Top Four Event Results"
  },

};
