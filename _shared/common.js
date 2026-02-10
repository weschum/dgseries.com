// /dgseries.com/_shared/common.js
(() => {
  "use strict";

  const BUILD = String(window.SITE_BUILD || "").trim() || "dev";

  // Series base path: directory containing the current page.
  // Example: /dgst/uplay-series-a/index.html -> /dgst/uplay-series-a
  const SERIES_BASE_PATH = (() => {
    try {
      let p = String(location.pathname || "/");
      if (p.endsWith("/")) return p.length > 1 ? p.slice(0, -1) : "";
      const lastSlash = p.lastIndexOf("/");
      if (lastSlash <= 0) return "";
      return p.slice(0, lastSlash);
    } catch {
      return "";
    }
  })();

  // Platform base path: where shared runtime assets and the shared PDGA proxy live.
  // In a multi-series deployment:
  //   series page:   /dgst/<series-slug>/index.html
  //   series base:   /dgst/<series-slug>
  //   platform base: /dgst
  // In a single-series legacy deployment (pages directly under /dgst/), platform base == series base.
  const PLATFORM_BASE_PATH = (() => {
    try {
      // Derive platform root from where common.js is actually loaded.
      // common.js should be at: <platform>/_shared/common.js
      const cs = document.currentScript && document.currentScript.src
        ? document.currentScript.src
        : "";
      if (cs) {
        const u = new URL(cs, location.href);
        const p = u.pathname || "";
        const marker = "/_shared/common.js";
        const i = p.indexOf(marker);
        if (i >= 0) {
          return p.slice(0, i); // e.g. "/dgst"
        }
      }
    } catch (e) {
      // fall through
    }

    // Fallback: infer from series base (parent folder)
    try {
      const s = String(SERIES_BASE_PATH || "");
      if (!s) return "";
      const i = s.lastIndexOf("/");
      return i <= 0 ? "" : s.slice(0, i);
    } catch (e) {
      return String(SERIES_BASE_PATH || "");
    }
  })();


  // Back-compat: keep the old name pointing at the series base.
  const BASE_PATH = SERIES_BASE_PATH;

  window.SITE_BASE_PATH = BASE_PATH;
  window.SITE_SERIES_BASE_PATH = SERIES_BASE_PATH;
  window.SITE_PLATFORM_BASE_PATH = PLATFORM_BASE_PATH;
  // Shared runtime assets live here in the multi-series layout.
  const SHARED_BASE_PATH = PLATFORM_BASE_PATH + "/_shared";
  window.SITE_SHARED_BASE_PATH = SHARED_BASE_PATH;

  function getUrlParam(name) {
    try { return new URLSearchParams(location.search).get(name); }
    catch { return null; }
  }

  const DEBUG = String(getUrlParam("debug") || "") === "1";

  // Developer toggle: ?force=1 clears DGST session caches and reloads fresh from PDGA
  const FORCE_REFRESH = String(getUrlParam("force") || "") === "1";

  const SERIES = (window.SERIES_CONFIG && typeof window.SERIES_CONFIG === "object")
    ? window.SERIES_CONFIG
    : {};

  // Stable series identifier (used for storage/cache namespacing).
  // Preferred: SERIES.identity.seriesId
  // Fallback: last path segment of SERIES_BASE_PATH (e.g., "uplay-series-a")
  const SERIES_ID = (() => {
    try {
      const cfgId = SERIES?.identity?.seriesId;
      if (typeof cfgId === "string" && cfgId.trim()) return cfgId.trim();

      const s = String(SERIES_BASE_PATH || "");
      if (!s) return "default";
      const parts = s.split("/").filter(Boolean);
      return parts.length ? parts[parts.length - 1] : "default";
    } catch {
      return "default";
    }
  })();

  function applySeriesTheme() {
    const root = document.documentElement;
    const theme = SERIES.theme || {};
    const nav = theme.nav || {};

    if (theme.accent) {
      root.style.setProperty("--accent", String(theme.accent));
      root.style.setProperty("--focus", String(theme.accent));
    }

    if (nav.borderColor) root.style.setProperty("--nav-border-color", String(nav.borderColor));
    if (Number.isFinite(Number(nav.borderWidthPx))) root.style.setProperty("--nav-border-width", `${Number(nav.borderWidthPx)}px`);
    if (Number.isFinite(Number(nav.radiusPx))) root.style.setProperty("--nav-radius", `${Number(nav.radiusPx)}px`);
    if (Number.isFinite(Number(nav.fontWeight))) root.style.setProperty("--nav-font-weight", String(nav.fontWeight));
  }

  applySeriesTheme();

  const defaultSeed =
    "https://www.pdga.com/tour/search?OfficialName=&td=35187&date_filter%5Bmin%5D%5Bdate%5D=2025-09-01&date_filter%5Bmax%5D%5Bdate%5D=2026-03-31";

  const seedUrls = (() => {
    const pdga = SERIES.pdga || {};

    // New: multi-seed discovery
    if (Array.isArray(pdga.seedUrls) && pdga.seedUrls.length) {
      const cleaned = pdga.seedUrls
        .map(s => String(s || "").trim())
        .filter(Boolean);
      if (cleaned.length) return cleaned;
    }

    // Back-compat: single seed
    if (typeof pdga.seedUrl === "string" && pdga.seedUrl.trim()) {
      return [pdga.seedUrl.trim()];
    }

    return [defaultSeed];
  })();

  const DATA = {
    PDGA: {
      // Back-compat: keep a single "primary" seed URL.
      SEED_URL: seedUrls[0],
      // New: all seed URLs
      SEED_URLS: seedUrls.slice(),
      // Shared proxy lives at the platform root (one proxy for all series).
      // Example: /dgst/pdga-proxy.php
      PROXY_PREFIX: PLATFORM_BASE_PATH + "/pdga-proxy.php?url=",
    },
  };

  const CACHE = {
    VERSION: 14, // ✅ bump to invalidate cached results payloads (was 12)

    // All cache/storage keys MUST be namespaced by series to avoid cross-series data leakage.
    KEY_RESULTS: `dgst:${SERIES_ID}:cache:allEvents:pdga`,
    TTL_RESULTS_MS: 15 * 60 * 1000,

    KEY_SERIES_CTX: `dgst:${SERIES_ID}:cache:seriesContext`,
    TTL_SERIES_CTX_MS: 6 * 60 * 60 * 1000,
  };

  if (FORCE_REFRESH) {
    try {
      sessionStorage.removeItem(CACHE.KEY_RESULTS);
      sessionStorage.removeItem(CACHE.KEY_SERIES_CTX);
    } catch {}
  }

  function cacheEnabledByDefault() {
    return String(getUrlParam("nocache") || "") !== "1";
  }

  function cacheGet(key, ttlMs) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || obj.v !== CACHE.VERSION) return null;
      if (!obj.t || (Date.now() - obj.t) > ttlMs) return null;
      if (!obj.payload) return null;
      return obj.payload;
    } catch {
      return null;
    }
  }

  function cacheSet(key, payload) {
    try {
      sessionStorage.setItem(key, JSON.stringify({ v: CACHE.VERSION, t: Date.now(), payload }));
    } catch {
      // ignore
    }
  }

  async function fetchText(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
    return await res.text();
  }

  function fetchViaProxy(targetUrl) {
    const url = DATA.PDGA.PROXY_PREFIX + encodeURIComponent(String(targetUrl || ""));
    return fetchText(url);
  }

  window.Common = window.Common || {};
  window.Common.BUILD = BUILD;
  window.Common.DATA = DATA;
  window.Common.SERIES_CONFIG = SERIES;
  window.Common.SERIES_ID = SERIES_ID;
  window.Common.SERIES_BASE_PATH = SERIES_BASE_PATH;
  window.Common.PLATFORM_BASE_PATH = PLATFORM_BASE_PATH;
  window.Common.SHARED_BASE_PATH = SHARED_BASE_PATH;
  window.Common.SHARED_BASE_PATH = SHARED_BASE_PATH;

  window.Common.escapeHtml = function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  function cleanText(s) {
    return String(s ?? "").replace(/\s+/g, " ").trim();
  }

  function extractKeywordNumber(pdgaName, keyword, { maxNumber = 99 } = {}) {
    const s = cleanText(pdgaName);
    if (!s) return null;

    const kw = String(keyword || "").trim();
    if (!kw) return null;

    const lower = s.toLowerCase();
    const idx = lower.indexOf(kw.toLowerCase());
    if (idx < 0) return null;

    const tailOriginal = s.slice(idx, idx + 180);
    const tail = tailOriginal.toLowerCase();

    // Generic patterns that find a 1-2 digit number near the keyword.
    const patterns = [
      new RegExp(`${kw}[^0-9]{0,40}#\\s*0*(\\d{1,2})\\b`, "i"),
      new RegExp(`${kw}[^0-9]{0,80}\\bweek\\s*0*(\\d{1,2})\\b`, "i"),
      new RegExp(`${kw}[^0-9]{0,80}\\bwk\\.?\\s*0*(\\d{1,2})\\b`, "i"),
      new RegExp(`${kw}[^0-9]{0,80}\\bevent\\s*0*(\\d{1,2})\\b`, "i"),
      new RegExp(`${kw}[^0-9]{0,80}\\bstop\\s*0*(\\d{1,2})\\b`, "i"),
      new RegExp(`${kw}[^0-9]{0,80}\\bround\\s*0*(\\d{1,2})\\b`, "i"),
      new RegExp(`${kw}[^0-9]{0,80}\\(\\s*0*(\\d{1,2})\\s*\\)`, "i"),
      new RegExp(`${kw}[^0-9]{0,40}[-–—]\\s*0*(\\d{1,2})\\b`, "i"),
    ];

    for (const re of patterns) {
      const m = tailOriginal.match(re);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n >= 1 && n <= maxNumber) return n;
      }
    }

    // Fallback: first plausible 1-2 digit number after keyword, while trying to avoid years.
    const numMatches = Array.from(tail.matchAll(/\b(\d{1,2})\b/g));
    for (const mm of numMatches) {
      const n = Number(mm[1]);
      if (!Number.isFinite(n) || n < 1 || n > maxNumber) continue;
      const pos = mm.index ?? -1;
      if (pos < 0) continue;
      const before = tail.slice(Math.max(0, pos - 6), pos);
      if (before.includes("202") || before.includes("203")) continue;
      if (before.endsWith("-") && tail.slice(Math.max(0, pos - 11), pos).includes("202")) continue;
      return n;
    }

    return null;
  }

  function shortLabelFromPdgaName(name) {
    const s = cleanText(name);
    if (!s) return "";

    const naming = SERIES.naming || {};
    const rule = naming.eventShortLabel || {};

    // Allow a fully custom naming function via config.
    if (typeof naming.eventShortLabelFromPdgaName === "function") {
      try {
        const v = naming.eventShortLabelFromPdgaName(s);
        if (v != null) return cleanText(v);
      } catch (e) {
        console.warn("eventShortLabelFromPdgaName() failed; falling back.", e);
      }
    }

    // Declarative: keywordNumber => e.g., keyword "uplay" -> outputPrefix "UPlay" + N
    if (String(rule.type || "").toLowerCase() === "keywordnumber") {
      const keyword = String(rule.keyword || "").trim();
      const outPrefix = String(rule.outputPrefix || "").trim();
      const maxNumber = Number.isFinite(Number(rule.maxNumber)) ? Number(rule.maxNumber) : 99;
      if (keyword && outPrefix) {
        const lower = s.toLowerCase();
        if (lower.includes(keyword.toLowerCase())) {
          const n = extractKeywordNumber(s, keyword, { maxNumber });
          if (n != null) return `${outPrefix}${n}`;
          return outPrefix; // NOTE: may intentionally collide; we'll uniquify after discovery.
        }
      }
    }

    // Default fallback: first word of the PDGA name
    return s.split(/\s+/)[0] || s;
  }

  // Ensure event short labels are UNIQUE within a series context.
  // If multiple events resolve to the same base label (e.g., "SOWS"),
  // assign a stable numeric suffix in the current discovery order:
  // "SOWS1", "SOWS2", ...
  //
  // This prevents collisions in eventUrlByShort and makes short labels reliable
  // even when PDGA names do not contain numbers.
  function ensureUniqueShortLabels(events) {
    const counts = new Map();
    for (const ev of events) {
      const base = String(ev.shortLabel || "").trim();
      if (!base) continue;
      counts.set(base, (counts.get(base) || 0) + 1);
    }

    const used = new Map(); // base -> next index
    for (const ev of events) {
      const base = String(ev.shortLabel || "").trim();
      if (!base) continue;

      const total = counts.get(base) || 0;
      if (total <= 1) continue;

      const next = (used.get(base) || 0) + 1;
      used.set(base, next);

      ev.shortLabel = `${base}${next}`;
    }
  }

  function shortDivisionName(s) {
    s = String(s || "").trim();
    if (!s) return "";
    if (s.includes("•")) return s.split("•")[0].trim();
    if (s.includes("·")) return s.split("·")[0].trim();
    return s;
  }

  window.Common.shortEventLabelFromPdgaName = shortLabelFromPdgaName;
  window.Common.shortDivisionName = shortDivisionName;

  window.Common.loadHeader = async function loadHeader(activeKey) {
    const slot = document.getElementById("header-slot");
    if (!slot) return;

    try {
      // Multi-series: header lives in shared assets. Legacy fallback: series root.
      const primaryUrl = `${SHARED_BASE_PATH}/header.html?v=${encodeURIComponent(BUILD)}`;
      const fallbackUrl = `${BASE_PATH}/header.html?v=${encodeURIComponent(BUILD)}`;
      let res = await fetch(primaryUrl, { cache: "no-store" });
      if (!res.ok) res = await fetch(fallbackUrl, { cache: "no-store" });
      if (!res.ok) throw new Error("header fetch failed: " + res.status);
      const html = await res.text();
      slot.innerHTML = html;

      const pills = slot.querySelectorAll(".nav-pill");
      pills.forEach(a => {
        const key = a.getAttribute("data-nav") || "";
        if (key === activeKey) a.classList.add("is-active", "active");
      });

      const branding = SERIES.branding || {};
      const titleText = typeof branding.titleText === "string" ? branding.titleText.trim() : "";

      const titleTextEl = slot.querySelector("#seriesTitleText");
      if (titleTextEl) {
        // Prefer explicit branding.titleText; fall back to SERIES.name if you have it
        titleTextEl.textContent = titleText || SERIES.name || "";
   }

    } catch (e) {
      console.error(e);
      slot.innerHTML = "";
    }
  };
  
  window.Common.loadFooter = async function loadFooter() {
    const slot = document.getElementById("footer-slot");
    if (!slot) return;

    try {
      const primaryUrl = `${SHARED_BASE_PATH}/footer.html?v=${encodeURIComponent(BUILD)}`;
      const fallbackUrl = `${BASE_PATH}/footer.html?v=${encodeURIComponent(BUILD)}`;
      let res = await fetch(primaryUrl, { cache: "no-store" });
      if (!res.ok) res = await fetch(fallbackUrl, { cache: "no-store" });
      if (!res.ok) throw new Error("footer fetch failed: " + res.status);
      slot.innerHTML = await res.text();
    } catch (e) {
      console.error(e);
      slot.innerHTML = "";
    }
  };

  function extractEventIdFromHref(href) {
    const m = String(href || "").match(/\/tour\/event\/(\d+)/);
    return m ? m[1] : "";
  }

  function absolutizePdgaHref(href) {
    const h = String(href || "").trim();
    if (!h) return "";
    if (h.startsWith("http")) return h;
    if (h.startsWith("/")) return "https://www.pdga.com" + h;
    return "https://www.pdga.com/" + h;
  }

  function sortEventsSmart(events) {
    const naming = SERIES.naming || {};

    // If enabled per-series, sort oldest -> newest using discovered startDate.
    // Keeps baseline unchanged unless a series opts in.
    const sortByDate = !!naming.sortByDate;

    if (sortByDate) {
      const list = events.slice();
      list.sort((a, b) => {
        const am = Number.isFinite(a.startMs) ? a.startMs : null;
        const bm = Number.isFinite(b.startMs) ? b.startMs : null;

        if (am != null && bm != null && am !== bm) return am - bm;
        if (am != null && bm == null) return -1;
        if (am == null && bm != null) return 1;

        // Stable tie-breakers
        const ai = String(a.pdgaEventId || "");
        const bi = String(b.pdgaEventId || "");
        if (ai && bi && ai !== bi) return ai.localeCompare(bi);

        return String(a.pdgaName || "").localeCompare(String(b.pdgaName || ""));
      });
      return list;
    }

    // Default behavior: prefix-number sorting (existing baseline)
    const sortCfg = naming.sortByPrefixNumber || {};
    const prefix = String(sortCfg.prefix || "").trim();

    const withN = events.map(e => {
      const label = String(e.shortLabel || "").trim();
      if (prefix) {
        const re = new RegExp(`^${prefix}(\\d+)$`, "i");
        const m = label.match(re);
        return { e, n: m ? Number(m[1]) : null };
      }
      return { e, n: null };
    });

    withN.sort((a, b) => {
      if (a.n != null && b.n != null) return a.n - b.n;
      if (a.n != null) return -1;
      if (b.n != null) return 1;
      return String(a.e.pdgaName || "").localeCompare(String(b.e.pdgaName || ""));
    });

    return withN.map(x => x.e);
  }

  function parsePdgaDateRangeToMs(dateText) {
    const raw = cleanText(dateText);
    if (!raw) return { startMs: null, endMs: null, dateText: "" };

    // PDGA often uses "Month D, YYYY - Month D, YYYY" (sometimes with an en-dash).
    const parts = raw.split(/\s*(?:-|–|—)\s*/).map(s => s.trim()).filter(Boolean);

    const start = parts[0] || raw;
    const end = parts[1] || "";

    const startMs = Date.parse(start);
    const endMs = end ? Date.parse(end) : NaN;

    return {
      startMs: Number.isFinite(startMs) ? startMs : null,
      endMs: Number.isFinite(endMs) ? endMs : null,
      dateText: raw,
    };
  }

  function findDatesColumnIndex(tableEl) {
    // Try to locate a "Dates" / "Date" column by header text.
    const ths = Array.from(tableEl.querySelectorAll("thead th"));
    if (!ths.length) return -1;

    for (let i = 0; i < ths.length; i++) {
      const t = cleanText(ths[i].textContent).toLowerCase();
      if (t === "date" || t === "dates" || t.includes("date")) return i;
    }
    return -1;
  }

  function parseEventsFromSeedHtml(html) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");

    // Find the table that actually contains event links.
    const tables = Array.from(doc.querySelectorAll("table"));
    const table = tables.find(t => t.querySelector('a[href*="/tour/event/"]')) || doc.querySelector("table");
    const rows = table ? Array.from(table.querySelectorAll("tbody tr")) : Array.from(doc.querySelectorAll("table tbody tr"));

    const dateIdx = table ? findDatesColumnIndex(table) : -1;

    const seen = new Set();
    const events = [];

    for (const tr of rows) {
      const a = tr.querySelector('a[href*="/tour/event/"]');
      if (!a) continue;

      const href = String(a.getAttribute("href") || "").trim();
      const id = extractEventIdFromHref(href);
      if (!id || seen.has(id)) continue;

      const name = cleanText(a.textContent);
      if (!name) continue;

      // Completed detection: check for "official tournament results" icon/text anywhere in the row.
      const statusImgs = Array.from(tr.querySelectorAll("img"));
      const rowText = cleanText(tr.textContent).toLowerCase();

      const hasOfficialIcon = statusImgs.some(img => {
        const alt = String(img.getAttribute("alt") || "").toLowerCase();
        const title = String(img.getAttribute("title") || "").toLowerCase();
        return alt.includes("official tournament results") || title.includes("official tournament results");
      });

      const isCompleted = hasOfficialIcon || rowText.includes("official tournament results");

      // Dates
      let dateText = "";
      let startMs = null;
      let endMs = null;

      if (dateIdx >= 0) {
        const tds = Array.from(tr.querySelectorAll("td"));
        const cell = tds[dateIdx] || null;
        if (cell) {
          const parsed = parsePdgaDateRangeToMs(cell.textContent);
          dateText = parsed.dateText;
          startMs = parsed.startMs;
          endMs = parsed.endMs;
        }
      }

      const shortLabel = shortLabelFromPdgaName(name);
      const pdgaUrl = absolutizePdgaHref(href);

      if (DEBUG) {
        console.log("[DGST] Seed event:", name, "=> shortLabel:", shortLabel, "date:", dateText, "completed:", isCompleted, "url:", pdgaUrl);
      }

      seen.add(id);
      events.push({
        pdgaEventId: id,
        pdgaUrl,
        pdgaName: name,
        shortLabel,
        isCompleted,
        dateText,
        startMs,
        endMs,
      });
    }

    return sortEventsSmart(events);
  }

  window.Common.getSeriesContext = async function getSeriesContext({ onStatus, forceRefresh } = {}) {
    const cacheOn = cacheEnabledByDefault();

    // FORCE_REFRESH via ?force=1 already cleared cache keys; also skip reading cache.
    if (!FORCE_REFRESH && !forceRefresh) {
      const cached = cacheOn ? cacheGet(CACHE.KEY_SERIES_CTX, CACHE.TTL_SERIES_CTX_MS) : null;
      if (cached) return cached;
    }

    onStatus && onStatus("Fetching PDGA series listing…");

    try {
      const byId = new Map();

      // Fetch all seed pages, parse, then merge/dedupe by PDGA event id.
      const seeds = Array.isArray(DATA.PDGA.SEED_URLS) ? DATA.PDGA.SEED_URLS : [DATA.PDGA.SEED_URL];

      for (let i = 0; i < seeds.length; i++) {
        const seed = seeds[i];
        onStatus && onStatus(`Fetching PDGA series listing… (${i + 1}/${seeds.length})`);

        const html = await fetchViaProxy(seed);
        const parsed = parseEventsFromSeedHtml(html);

        for (const ev of parsed) {
          const id = String(ev.pdgaEventId || "").trim();
          if (!id) continue;

          if (!byId.has(id)) {
            byId.set(id, ev);
            continue;
          }

          // Merge policy: prefer completed=true, keep date if missing, keep first url/name/shortLabel.
          const existing = byId.get(id);
          existing.isCompleted = !!(existing.isCompleted || ev.isCompleted);

          if (!existing.dateText && ev.dateText) existing.dateText = ev.dateText;
          if (!Number.isFinite(existing.startMs) && Number.isFinite(ev.startMs)) existing.startMs = ev.startMs;
          if (!Number.isFinite(existing.endMs) && Number.isFinite(ev.endMs)) existing.endMs = ev.endMs;

          if (!existing.pdgaUrl && ev.pdgaUrl) existing.pdgaUrl = ev.pdgaUrl;
          if (!existing.pdgaName && ev.pdgaName) existing.pdgaName = ev.pdgaName;
          if (!existing.shortLabel && ev.shortLabel) existing.shortLabel = ev.shortLabel;
        }
      }

      const events = sortEventsSmart(Array.from(byId.values()));

      // IMPORTANT: make short labels unique AFTER sorting, so numbering is stable.
      // For SOWS (sortByDate=true), this yields chronological numbering.
      ensureUniqueShortLabels(events);

      // Guardrail: detect duplicate short labels.
      // In debug mode (?debug=1), disambiguate collisions by appending -<eventId>.
      const byLabel = new Map();
      for (const ev of events) {
        const k = String(ev.shortLabel || "").trim();
        if (!k) continue;
        if (!byLabel.has(k)) byLabel.set(k, []);
        byLabel.get(k).push(ev);
      }

      for (const [label, list] of byLabel.entries()) {
        if (list.length <= 1) continue;
        const ids = list.map(e => String(e.pdgaEventId || "")).filter(Boolean).join(", ");
        console.warn(`[DGST] Duplicate event shortLabel "${label}" for eventId(s): ${ids}.`);

        if (DEBUG) {
          for (const ev of list) {
            const id = String(ev.pdgaEventId || "").trim();
            if (id) ev.shortLabel = `${label}-${id}`;
          }
        }
      }

      const eventUrlByShort = {};
      const eventNameByShort = {};
      for (const ev of events) {
        const k = String(ev.shortLabel || "").trim();
        if (!k) continue;

        // Prefer mapping to completed events if a collision occurs.
        if (ev.pdgaUrl) {
          if (!eventUrlByShort[k]) {
            eventUrlByShort[k] = ev.pdgaUrl;
          } else {
            const existing = events.find(x => String(x.shortLabel || "").trim() === k && x.pdgaUrl === eventUrlByShort[k]);
            const existingCompleted = existing ? !!existing.isCompleted : false;
            if (!existingCompleted && ev.isCompleted) eventUrlByShort[k] = ev.pdgaUrl;
          }
        }

        if (ev.pdgaName && !eventNameByShort[k]) eventNameByShort[k] = ev.pdgaName;
      }

      if (DEBUG) {
        console.log("[DGST] eventUrlByShort:", eventUrlByShort);
      }

      const ctx = {
        seedUrl: DATA.PDGA.SEED_URL,          // back-compat
        seedUrls: DATA.PDGA.SEED_URLS || [DATA.PDGA.SEED_URL],
        builtAt: Date.now(),
        events,
        eventUrlByShort,
        eventNameByShort,
      };

      if (cacheOn) cacheSet(CACHE.KEY_SERIES_CTX, ctx);

      onStatus && onStatus(`Found ${events.length} event(s) from PDGA.`);
      return ctx;
    } catch (e) {
      console.warn("Series context discovery failed:", e);
      onStatus && onStatus("PDGA discovery failed (using cached data if available).");
      const cached = cacheOn ? cacheGet(CACHE.KEY_SERIES_CTX, CACHE.TTL_SERIES_CTX_MS) : null;
      return cached || { seedUrl: DATA.PDGA.SEED_URL, builtAt: Date.now(), events: [], eventUrlByShort: {}, eventNameByShort: {} };
    }
  };

  // =========================================================
  // PDGA Results Loader
  // =========================================================
  const POINTS_COL = (() => {
    const scoring = SERIES.scoring || {};
    const name = (typeof scoring.pointsColumnName === "string") ? scoring.pointsColumnName.trim() : "";
    return name || "Series Pts";
  })();

  window.Common.pointsColumnName = () => POINTS_COL;

  const FIXED_COLUMNS = [
    "Event",
    "Division",
    POINTS_COL,
    "Place",
    "Name",
    "PDGA#",
    "Rating",
    "Par",
    "Rd1",
    "Rd1 rating",
    "Rd2",
    "Rd2 rating",
    "Total",
    "Prize",
  ];

  function parsePlaceNumber(placeText) {
    const s = cleanText(placeText);
    if (!s) return null;
    const m = s.match(/(\d+)/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  function computeSeriesPtsFromPlace(placeText) {
    const n = parsePlaceNumber(placeText);
    if (n == null) return "";

    const scoring = SERIES.scoring || {};

    // Custom override (for complex series)
    if (typeof scoring.pointsFromPlace === "function") {
      try {
        const v = scoring.pointsFromPlace(placeText, n);
        if (v === null || typeof v === "undefined") return "";
        return String(v);
      } catch (e) {
        console.warn("pointsFromPlace() failed; falling back to default linear rule.", e);
      }
    }

    // Declarative rule (recommended)
    const rule = scoring.points || {};
    if (String(rule.type || "").toLowerCase() === "linear") {
      const base = Number(rule.base);
      if (Number.isFinite(base)) return String(Math.max(0, base - n));
    }

    // Default fallback
    return String(Math.max(0, 101 - n));
  }

  // Find a header row even if it's <td> inside tbody
  function findHeaderInfo(tableEl) {
    // 1) Standard case: thead th
    const theadThs = Array.from(tableEl.querySelectorAll("thead th"));
    if (theadThs.length) {
      return { headerRow: null, headerCells: theadThs };
    }

    // 2) Search for a row whose cells look like headers
    const trs = Array.from(tableEl.querySelectorAll("tr"));
    for (const tr of trs) {
      const cells = Array.from(tr.querySelectorAll("th,td"));
      if (!cells.length) continue;

      const texts = cells.map(c => cleanText(c.textContent));
      const joined = texts.join(" ").toLowerCase();

      const hasPlace = joined.includes("place") || joined.includes("pos");
      const hasName = joined.includes("name") || joined.includes("player");
      const hasPdga =
        joined.includes("pdga#") ||
        joined.includes("pdga #") ||
        joined.includes("pdga") ||
        joined.includes("pdga number");

      if (hasPlace && hasName && hasPdga) {
        return { headerRow: tr, headerCells: cells };
      }
    }

    return { headerRow: null, headerCells: [] };
  }

  function looksLikeResultsTable(tableEl) {
    try {
      const info = findHeaderInfo(tableEl);
      return info.headerCells && info.headerCells.length > 0;
    } catch {
      return false;
    }
  }

  function buildHeaderKeysFromInfo(headerCells) {
    const keys = [];
    let lastRound = "";

    for (const cell of headerCells) {
      const raw = cleanText(cell.textContent);
      let key = raw;

      // Headerless rating columns (blank) immediately after RdN
      if (!key) {
        const m = lastRound.match(/^Rd(\d+)$/i);
        if (m) key = `Rd${m[1]} rating`;
      }

      keys.push(key);

      if (/^Rd\d+$/i.test(key)) lastRound = key;
    }

    return keys;
  }


  function inferMissingRatingKeys(keys, targetLen) {
    // PDGA sometimes omits blank header cells for the hidden round-rating columns.
    // If body rows contain extra cells, try inserting "RdN rating" after each "RdN".
    let out = keys.slice();
    if (!Number.isFinite(targetLen) || targetLen <= out.length) return out;

    // Insert at most one rating column per round (Rd1..Rd9) until we match.
    for (let round = 1; round <= 9 && out.length < targetLen; round++) {
      const rdKey = `Rd${round}`;
      const ratingKey = `Rd${round} rating`;

      const rdIdx = out.indexOf(rdKey);
      if (rdIdx === -1) continue;

      // Already present anywhere? If so, skip inserting.
      if (out.includes(ratingKey)) continue;

      out.splice(rdIdx + 1, 0, ratingKey);
    }

    // If still short, pad with empty keys so we don't mis-align earlier columns.
    while (out.length < targetLen) out.push("");
    return out;
  }

  function extractDivisionCodeFromHeadingText(text) {
    const t = cleanText(text);
    if (!t) return "";

    let left = t;
    if (left.includes("·")) left = left.split("·")[0];
    else if (left.includes("•")) left = left.split("•")[0];

    left = cleanText(left).replace(/\(\s*\d+\s*\)\s*$/, "").trim();
    const token = cleanText(left).split(" ")[0] || "";

    const code = token.toUpperCase();
    const ok =
      /^[A-Z]{2,3}\d{0,2}$/.test(code) &&
      code.length >= 2 &&
      code.length <= 5 &&
      !["PRO", "OPEN", "MIXED", "WOMEN", "JUNIOR", "TOTAL", "STATUS"].includes(code);

    return ok ? code : "";
  }

  function parseResultsRowsFromTable(tableEl, shortEventLabel, divisionCode) {
    const { headerRow, headerCells } = findHeaderInfo(tableEl);
    if (!headerCells.length) return [];

    let keys = buildHeaderKeysFromInfo(headerCells);
    if (!keys.length) return [];

    // If the header is missing the hidden round-rating columns, infer them from body row width.
    try {
      const probeTr = tableEl.querySelector("tbody tr") || tableEl.querySelector("tr");
      const probeTds = probeTr ? Array.from(probeTr.querySelectorAll("td")) : [];
      if (probeTds.length && probeTds.length > keys.length) {
        keys = inferMissingRatingKeys(keys, probeTds.length);
      }
    } catch {
      // ignore
    }

    // Prefer tbody rows; else all rows
    const trs = Array.from(tableEl.querySelectorAll("tbody tr")).length
      ? Array.from(tableEl.querySelectorAll("tbody tr"))
      : Array.from(tableEl.querySelectorAll("tr"));

    const outRows = [];

    for (const tr of trs) {
      // Skip the detected headerRow if it's inside tbody
      if (headerRow && tr === headerRow) continue;

      // Skip any explicit th-header rows
      if (tr.querySelector("th")) continue;

      const tds = Array.from(tr.querySelectorAll("td"));
      if (!tds.length) continue;

      const cells = tds.map(td => cleanText(td.textContent));

      const raw = {};
      for (let i = 0; i < keys.length && i < cells.length; i++) {
        const k = keys[i];
        if (!k) continue;
        raw[k] = cells[i];
      }

      const place = raw.Place || "";
      const name = raw.Name || "";
      if (!cleanText(name)) continue;

      const row = {};
      row["Event"] = shortEventLabel;
      row["Division"] = divisionCode || "";

      row[POINTS_COL] = computeSeriesPtsFromPlace(place);

      row["Place"] = place;
      row["Name"] = name;
      row["PDGA#"] = raw["PDGA#"] || raw["PDGA #"] || raw["PDGA"] || raw["PDGA Number"] || "";
      row["Rating"] = raw["Rating"] || "";
      row["Par"] = raw["Par"] || "";

      row["Rd1"] = raw["Rd1"] || "";
      row["Rd1 rating"] = raw["Rd1 rating"] || "";
      row["Rd2"] = raw["Rd2"] || "";
      row["Rd2 rating"] = raw["Rd2 rating"] || "";

      row["Total"] = raw["Total"] || "";
      row["Prize"] = raw["Prize"] || "";

      outRows.push(row);
    }

    return outRows;
  }

  async function fetchEventResultsRows(ev, { onStatus } = {}) {
    const shortLabel = String(ev.shortLabel || "").trim();
    const url = String(ev.pdgaUrl || "").trim();
    if (!shortLabel || !url) return [];

    onStatus && onStatus(`Fetching results: ${shortLabel}…`);

    const html = await fetchViaProxy(url);
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");

    const nodes = Array.from(doc.querySelectorAll("h1,h2,h3,h4,h5,table"));

    let currentDivisionCode = "";
    const allRows = [];
    let resultTableCount = 0;

    for (const node of nodes) {
      const tag = (node.tagName || "").toUpperCase();

      if (tag === "H2" || tag === "H3" || tag === "H4" || tag === "H5") {
        const code = extractDivisionCodeFromHeadingText(node.textContent);
        if (code) currentDivisionCode = code;
        continue;
      }

      if (tag === "TABLE") {
        if (!looksLikeResultsTable(node)) continue;

        resultTableCount++;
        const rows = parseResultsRowsFromTable(node, shortLabel, currentDivisionCode);
        for (const r of rows) allRows.push(r);
      }
    }

    if (DEBUG) {
      console.log("[DGST] event:", shortLabel, "resultTables:", resultTableCount, "rows:", allRows.length);
    }

    return allRows;
  }

  window.Common.loadAllEvents = async function loadAllEvents({ onStatus, forceRefresh } = {}) {
    const cacheOn = cacheEnabledByDefault();

    if (!FORCE_REFRESH && !forceRefresh) {
      const cached = cacheOn ? cacheGet(CACHE.KEY_RESULTS, CACHE.TTL_RESULTS_MS) : null;
      if (cached && cached.rows && cached.columns) {
        onStatus && onStatus("Loaded results from cache.");
        return cached;
      }
    }

    onStatus && onStatus("Loading results from PDGA…");

    const ctx = await window.Common.getSeriesContext({ onStatus, forceRefresh: false });
    const events = (ctx && ctx.events) ? ctx.events : [];

    const completedEvents = events.filter(e => !!e.isCompleted);

    if (!completedEvents.length) {
      const emptyPayload = { columns: FIXED_COLUMNS.slice(), rows: [], builtAt: Date.now(), seedUrl: DATA.PDGA.SEED_URL };
      if (cacheOn) cacheSet(CACHE.KEY_RESULTS, emptyPayload);
      onStatus && onStatus("No completed events found.");
      return emptyPayload;
    }

    const allRows = [];
    for (const ev of completedEvents) {
      try {
        const rows = await fetchEventResultsRows(ev, { onStatus });
        for (const r of rows) allRows.push(r);
      } catch (e) {
        console.warn("Failed to load event results:", ev, e);
      }
    }

    const payload = {
      columns: FIXED_COLUMNS.slice(),
      rows: allRows,
      builtAt: Date.now(),
      seedUrl: DATA.PDGA.SEED_URL,
    };

    if (cacheOn) cacheSet(CACHE.KEY_RESULTS, payload);

    onStatus && onStatus(`Loaded ${allRows.length} result row(s) from PDGA.`);
    return payload;
  };

})();
