// /dgst/sows-25-26/series.config.js
// Optional per-series configuration.
// The shared runtime will work without this file, but if present it overrides branding + theme + PDGA discovery + rules.
(() => {
  "use strict";

  window.SERIES_CONFIG = window.SERIES_CONFIG || {
    identity: {
      // Stable identifier used for namespacing caches/storage.
      // Recommend matching the series folder slug.
      seriesId: "sows-25-26",
    },

    branding: {
      // Header title (series-specific)
      titleText: "SOWS 2025-2026",
    },

    theme: {
      // Accent used for active nav + focus ring.
      accent: "#f5ff00",
      // Nav pill styling (optional)
      nav: {
        borderColor: "#000000",
        borderWidthPx: 1,
        radiusPx: 8,
        fontWeight: 700,
      },
    },

    pdga: {
      // Multi-seed discovery (intentionally overlapping to validate dedupe/merge behavior)
      seedUrls: [
        "https://www.pdga.com/tour/search?OfficialName=SOWS+2025&td=&date_filter%5Bmin%5D%5Bdate%5D=2025-04-01&date_filter%5Bmax%5D%5Bdate%5D=2026-03-31",
        "https://www.pdga.com/tour/search?OfficialName=SOWS&td=&date_filter%5Bmin%5D%5Bdate%5D=2025-04-01&date_filter%5Bmax%5D%5Bdate%5D=2026-03-31",
      ],
      // Back-compat note: common.js should treat seedUrl as a single-item seedUrls if seedUrls is not provided.
      // seedUrl: "...",
    },

    // Naming rules (series-specific). common.js must not hard-code series names.
    naming: {
      // optional tuning; you can omit entirely
      shortLabelMaxWords: 4,
      shortLabelStopWords: ["sows", "2025-26", "2025-2026"],
    },

    scoring: {
      // Label for the points column across the site.
      pointsColumnName: "Series Pts",
      // Default points rule: 101 - finishing position
      points: { type: "linear", base: 101 },
    },
    
    standings: {
      topEvents: 5,
      maxTotal: 500,
      description: "Points Total = Top Five Event Results"
    },

  };
})();
