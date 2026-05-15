// /dgst/test-series/series.config.js
// Test series: covers all PDGA event status types for development/QA.
// Seeds:
//   1. Oregon tournaments May 10-17 — mix of official, unofficial, live, pending, registering
//   2. TD 126404 events from May 13 onward — known unofficial results for toggle testing
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
        // Oregon tournaments May 10-17 — official + upcoming this week (registering → live → unofficial → official)
        "https://www.pdga.com/tour/search?OfficialName=&td=&date_filter%5Bmin%5D%5Bdate%5D=2026-05-10&date_filter%5Bmax%5D%5Bdate%5D=2026-05-17&State%5B%5D=OR&Tier%5B%5D=A&Tier%5B%5D=A%2FB&Tier%5B%5D=A%2FC&Tier%5B%5D=B&Tier%5B%5D=B%2FA&Tier%5B%5D=B%2FC&Tier%5B%5D=C&Tier%5B%5D=C%2FA&Tier%5B%5D=C%2FB&Tier%5B%5D=D",
        // TD 126404 from May 13 onward — known unofficial results for toggle testing
        "https://www.pdga.com/tour/search?td=126404&date_filter%5Bmin%5D%5Bdate%5D=2026-05-13&date_filter%5Bmax%5D%5Bdate%5D=2026-12-31",
      ],
      throttleMs: 800,
      forceThrottleMs: 3000,
    },

    naming: {
      shortLabelMaxWords: 5,
      shortLabelStopWords: ["2026", "presented", "by"],
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
