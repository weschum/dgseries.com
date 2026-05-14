// /dgst/test-series/series.config.js
// Test series: covers all PDGA event status types for development/QA.
// Seeds: Scott Withers (official results + real players) + current-week events
// (live/unofficial/pending) + upcoming events (registering).
(() => {
  "use strict";

  window.SERIES_CONFIG = window.SERIES_CONFIG || {
    identity: {
      seriesId: "test-series",
    },

    branding: {
      titleText: "Test Series",
    },

    theme: {
      accent: "#ff6b35",
      nav: {
        borderColor: "#333333",
        borderWidthPx: 1,
        radiusPx: 8,
        fontWeight: 700,
      },
    },

    pdga: {
      seedUrls: [
        // Scott Withers events — official results with real players
        "https://www.pdga.com/tour/search?td=38464&date_filter%5Bmin%5D%5Bdate%5D=2025-01-01&date_filter%5Bmax%5D%5Bdate%5D=2026-12-31",
        // Current week — catches live, unofficial, and pending events
        "https://www.pdga.com/tour/search?date_filter%5Bmin%5D%5Bdate%5D=2026-05-10&date_filter%5Bmax%5D%5Bdate%5D=2026-05-20",
        // Upcoming — catches registering events
        "https://www.pdga.com/tour/search?td=38464&date_filter%5Bmin%5D%5Bdate%5D=2026-06-01&date_filter%5Bmax%5D%5Bdate%5D=2027-01-01",
      ],
      throttleMs: 400,
      forceThrottleMs: 1500,
    },

    naming: {
      shortLabelMaxWords: 5,
      shortLabelStopWords: ["sows", "2025-26", "2025-2026", "2026", "presented", "by"],
    },

    scoring: {
      pointsColumnName: "Series Pts",
      points: { type: "linear", base: 101 },
      defaultIncludeLive: false,
      defaultIncludeUnofficial: false,
    },

    standings: {
      topEvents: 5,
      maxTotal: 500,
      description: "Points Total = Top Five Event Results",
    },
  };
})();
