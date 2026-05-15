// UPlay 2025-26 Winter Series configuration
// Defaults documented in _shared/series.config.template.js
window.SERIES_CONFIG = {
  identity: {
    seriesId: "uplay-2025-26-winter",
  },

  branding: {
    titleText: "UPlay 2025-26 Winter Series",
  },

  theme: {
    accent: "#7ed2c6",
    nav: {
      borderColor:   "#2b5194",
      borderWidthPx: 1,
      radiusPx:      8,
      fontWeight:    700,
    },
  },

  pdga: {
    seedUrls: [
      "https://www.pdga.com/tour/search?OfficialName=&td=35187&date_filter%5Bmin%5D%5Bdate%5D=2025-09-01&date_filter%5Bmax%5D%5Bdate%5D=2026-03-31",
    ],
    throttleMs:      300,
    forceThrottleMs: 700,
  },

  naming: {
    shortLabelMaxWords:  2,
    shortLabelStopWords: ["uplay", "2025-26", "2025-2026"],
  },

  scoring: {
    pointsColumnName: "Series Pts",
    points: { type: "linear", base: 101 },
  },

  standings: {
    topEvents:   4,
    maxTotal:    400,
    description: "Points Total = Top Four Event Results",
  },
};
