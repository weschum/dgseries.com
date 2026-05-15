// Second Test Series — series configuration
// Defaults documented in _shared/series.config.template.js
window.SERIES_CONFIG = {
  identity: {
    seriesId: "second-test-series",
  },

  branding: {
    titleText: "Second Test Series",
  },

  theme: {
    accent: "#00ff3b",
    nav: {
      borderColor:   "#000000",
      borderWidthPx: 1,
      radiusPx:      8,
      fontWeight:    700,
    },
  },

  pdga: {
    seedUrls: [
      "https://www.pdga.com/tour/search?OfficialName=&td=&date_filter%5Bmin%5D%5Bdate%5D=2026-05-10&date_filter%5Bmax%5D%5Bdate%5D=2026-05-17&State%5B%5D=OR&Tier%5B%5D=A&Tier%5B%5D=A%2FB&Tier%5B%5D=A%2FC&Tier%5B%5D=B&Tier%5B%5D=B%2FA&Tier%5B%5D=B%2FC&Tier%5B%5D=C&Tier%5B%5D=C%2FA&Tier%5B%5D=C%2FB&Tier%5B%5D=D",
      "https://www.pdga.com/tour/search?td=126404&date_filter%5Bmin%5D%5Bdate%5D=2026-05-13&date_filter%5Bmax%5D%5Bdate%5D=2026-12-31",
    ],
    throttleMs:      800,
    forceThrottleMs: 3000,
  },

  naming: {
    shortLabelMaxWords:  5,
    shortLabelStopWords: [],
  },

  scoring: {
    pointsColumnName: "Series Pts",
    points: { type: "linear", base: 1001 },
    defaultIncludeLive:       false,
    defaultIncludeUnofficial: false,
  },

  standings: {
    topEvents:   4,
    maxTotal:    4000,
    description: "Points Total = Top TESTING Event Results",
  },
};
