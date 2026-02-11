// /dgseries.com/<series-folder>/series.config.js
// Optional per-deployment configuration.
// Pages will work without this file, but if present it can override branding + theme.
(() => {
  "use strict";

  window.SERIES_CONFIG = window.SERIES_CONFIG || {
    identity: {
      // Stable identifier used for namespacing caches/storage.
      // Recommend matching the series folder slug.
      seriesId: "uplay-2025-26-winter",
    },

    branding: {
      // Header title (series-specific)
      titleText: "UPlay 2025-26 Winter Series",
    },

    theme: {
      // Accent used for active nav + focus ring.
      // Make this series-customizable for multi-series deployments.
      accent: "#7ed2c6",
      // Nav pill styling (optional)
      nav: {
        borderColor: "#2b5194",
        borderWidthPx: 1,
        fontWeight: 700,
      },
    },

    pdga: {
      seedUrl: "https://www.pdga.com/tour/search?OfficialName=&td=35187&date_filter%5Bmin%5D%5Bdate%5D=2025-09-01&date_filter%5Bmax%5D%5Bdate%5D=2026-03-31"
    },

    // Naming rules (series-specific). common.js must not hard-code series names.
    naming: {
      // optional tuning; you can omit entirely
      shortLabelMaxWords: 2,
      shortLabelStopWords: ["uplay", "2025-26", "2025-2026"],
    },

    scoring: {
      // Label for the points column across the site.
      pointsColumnName: "Series Pts",
      // Default points rule: 101 - finishing position
      points: { type: "linear", base: 101 },
    },
    
    standings: {
      topEvents: 4,
      maxTotal: 400,
      description: "Points Total = Top Four Event Results"
    },

  };
})();
