// SOWS 2025-26 series configuration
// Defaults documented in _shared/series.config.template.js
window.SERIES_CONFIG = {
  identity: {
    seriesId: "sows-25-26",
  },

  branding: {
    titleText: "SOWS 2025-2026",
  },

  theme: {
    accent: "#f5ff00",
    nav: {
      borderColor:   "#000000",
      borderWidthPx: 1,
      radiusPx:      8,
      fontWeight:    700,
    },
  },

  pdga: {
    seedUrls: [
      "https://www.pdga.com/tour/search?OfficialName=SOWS+2025&td=&date_filter%5Bmin%5D%5Bdate%5D=2025-04-01&date_filter%5Bmax%5D%5Bdate%5D=2026-03-31",
      "https://www.pdga.com/tour/search?OfficialName=SOWS&td=&date_filter%5Bmin%5D%5Bdate%5D=2025-04-01&date_filter%5Bmax%5D%5Bdate%5D=2026-03-31",
    ],
    throttleMs:      400,
    forceThrottleMs: 1500,
  },

  naming: {
    shortLabelMaxWords:  4,
    shortLabelStopWords: ["sows", "2025-26", "2025-2026"],
  },

  scoring: {
    pointsColumnName: "Series Pts",
    points: { type: "linear", base: 101 },
  },

  standings: {
    topEvents:   5,
    maxTotal:    500,
    description: "Points Total = Top Five Event Results",
  },
};
