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
  let FORCE_REFRESH_ACTIVE = String(getUrlParam("force") || "") === "1";

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
    // Use the global build string for cache versioning.
    // Bump ONE place: /_shared/version.js (window.SITE_BUILD)
    VERSION: BUILD,

    // All cache/storage keys MUST be namespaced by series AND build.
    // This guarantees client caches invalidate automatically after a deploy.
    KEY_RESULTS: `dgst:${SERIES_ID}:${BUILD}:cache:allEvents:pdga`,
    TTL_RESULTS_MS: 15 * 60 * 1000,

    KEY_SERIES_CTX: `dgst:${SERIES_ID}:${BUILD}:cache:seriesContext`,
    TTL_SERIES_CTX_MS: 6 * 60 * 60 * 1000,
  };

  // ===== Refresh tracking (timestamp + pending refresh state) =====
  const REFRESH = {
    // Pending refresh flag lives in sessionStorage so it naturally clears when the tab dies.
    KEY_PENDING: `dgst:${SERIES_ID}:refreshPending`,
    // Collected fetch times during a pending refresh (session-scoped).
    KEY_TIMES: `dgst:${SERIES_ID}:refreshFetchTimes`,
    // Last successful refresh timestamp should survive reloads.
    KEY_LAST_MS: `dgst:${SERIES_ID}:lastRefreshMs`,
  };

  function safeJsonParse(s) {
    try { return JSON.parse(s); } catch { return null; }
  }

  function isRefreshPending() {
    try { return sessionStorage.getItem(REFRESH.KEY_PENDING) === "1"; }
    catch { return false; }
  }

  function setRefreshPending() {
    try {
      sessionStorage.setItem(REFRESH.KEY_PENDING, "1");
      sessionStorage.removeItem(REFRESH.KEY_TIMES);
    } catch {}
  }

  function clearRefreshPending() {
    try {
      sessionStorage.removeItem(REFRESH.KEY_PENDING);
      sessionStorage.removeItem(REFRESH.KEY_TIMES);
    } catch {}
  }

  function recordRefreshFetchTime(ms) {
    if (!isRefreshPending()) return;
    if (!Number.isFinite(ms) || ms <= 0) return;

    try {
      const raw = sessionStorage.getItem(REFRESH.KEY_TIMES);
      const arr = Array.isArray(safeJsonParse(raw)) ? safeJsonParse(raw) : [];
      arr.push(ms);
      // keep small
      const trimmed = arr.slice(-100);
      sessionStorage.setItem(REFRESH.KEY_TIMES, JSON.stringify(trimmed));
    } catch {}
  }

  function getMaxRecordedRefreshMs() {
    try {
      const raw = sessionStorage.getItem(REFRESH.KEY_TIMES);
      const arr = Array.isArray(safeJsonParse(raw)) ? safeJsonParse(raw) : [];
      const nums = arr.map(n => Number(n)).filter(n => Number.isFinite(n) && n > 0);
      if (!nums.length) return null;
      return Math.max(...nums);
    } catch {
      return null;
    }
  }

  function setLastRefreshMs(ms) {
    try { localStorage.setItem(REFRESH.KEY_LAST_MS, String(ms)); } catch {}
  }

  function getLastRefreshMs() {
    try {
      const v = localStorage.getItem(REFRESH.KEY_LAST_MS);
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function formatLastRefresh(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "";
    const d = new Date(ms);
    const MM = pad2(d.getMonth() + 1);
    const DD = pad2(d.getDate());
    const YY = pad2(d.getFullYear() % 100);
    const hh = pad2(d.getHours());
    const mm = pad2(d.getMinutes());
    return `${MM}/${DD}/${YY} ${hh}:${mm}`;
  }

  function emitRefreshUpdated() {
    try {
      window.dispatchEvent(new CustomEvent("dgst:refresh-updated", { detail: { seriesId: SERIES_ID } }));
    } catch {}
  }

  function finalizePdgaRefreshIfPending() {
    // Commit timestamp ONLY after the app has successfully completed the refresh cycle.
    if (!isRefreshPending()) return false;

    const ms = getMaxRecordedRefreshMs() || Date.now();
    setLastRefreshMs(ms);
    clearRefreshPending();
    emitRefreshUpdated();
    return true;
  }

  // Expose refresh timestamp helpers
  window.Common = window.Common || {};
  window.Common.getLastRefreshMs = getLastRefreshMs;
  window.Common.getLastRefreshText = function getLastRefreshText() {
    const ms = getLastRefreshMs();
    if (!ms) return "Last refresh: —";
    return "Last refresh: " + formatLastRefresh(ms);
  };
  window.Common.formatLastRefresh = formatLastRefresh;
  window.Common.finalizePdgaRefreshIfPending = finalizePdgaRefreshIfPending;

  if (FORCE_REFRESH_ACTIVE) {
    // Mark a refresh as pending (this is what makes the timestamp represent a SUCCESSFUL fetch cycle,
    // not just a page reload).
    setRefreshPending();

    // Clear client-side cache
    try {
      sessionStorage.removeItem(CACHE.KEY_RESULTS);
      sessionStorage.removeItem(CACHE.KEY_SERIES_CTX);
    } catch {}

    // Keep URLs clean: remove ?force=1 after the page loads.
    // NOTE: We still keep FORCE_REFRESH_ACTIVE true internally until the first successful
    // results load completes, then we turn it off (one-shot force).
    try {
      setTimeout(() => {
        const u = new URL(location.href);
        if (u.searchParams.has("force")) {
          u.searchParams.delete("force");
          history.replaceState(null, "", u.pathname + u.search + u.hash);
        }
      }, 0);
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
    // NOTE: cache:"no-store" avoids browser HTTP cache interfering with proxy logic.
    const res = await fetch(url, { cache: "no-store" });

    // Capture proxy-provided fetch time (seconds) for refresh timestamping.
    // For cache hits, this is the cache meta time; for misses it’s the time of fetch.
    try {
      const ft = res.headers.get("X-DGST-Fetch-Time");
      const sec = Number(ft);
      if (Number.isFinite(sec) && sec > 0) recordRefreshFetchTime(sec * 1000);
    } catch {}

    if (!res.ok) {
      // Read response body (often plain text from proxy) for clearer errors.
      let body = "";
      try { body = await res.text(); } catch {}
      const detail = body ? ` - ${body}` : "";
      throw new Error(`Fetch failed (${res.status}) for ${url}${detail}`);
    }
    return await res.text();
  }

  function fetchViaProxy(targetUrl, { forceRefresh, useGlobalForce = true } = {}) {
    // When forcing refresh, also bust the server-side proxy disk cache.
    // NOTE: Discovery fetches should usually NOT honor global force (to reduce request volume).
    const force = ((useGlobalForce && FORCE_REFRESH_ACTIVE) || !!forceRefresh) ? "&force=1" : "";
    const url = DATA.PDGA.PROXY_PREFIX + encodeURIComponent(String(targetUrl || "")) + force;
    return fetchText(url);
  }

  // Fill Common exports (keep these near top for other modules)
  window.Common.BUILD = BUILD;
  window.Common.DATA = DATA;
  window.Common.SERIES_CONFIG = SERIES;
  window.Common.SERIES_ID = SERIES_ID;
  window.Common.SERIES_BASE_PATH = SERIES_BASE_PATH;
  window.Common.PLATFORM_BASE_PATH = PLATFORM_BASE_PATH;
  window.Common.SHARED_BASE_PATH = SHARED_BASE_PATH;

  // Manual refresh entry point (used by the header button).
  // Avoids constant fresh pulls (throttling risk) while making refresh easy on demand.
  window.Common.triggerPdgaRefresh = function triggerPdgaRefresh() {
    try {
      // Ensure refresh pending is set immediately so the next load knows
      // to commit the timestamp only after success.
      setRefreshPending();

      const u = new URL(location.href);
      u.searchParams.set("force", "1");
      location.href = u.toString();
    } catch {
      location.reload();
    }
  };

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

  function sleep(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return Promise.resolve();
    return new Promise(r => setTimeout(r, n));
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

    // --- New default: derive a descriptive label from the "course/location" part of the PDGA name ---
    const maxWords = Number.isFinite(Number(naming.shortLabelMaxWords)) ? Number(naming.shortLabelMaxWords) : 2;

    const stop = new Set(
      (Array.isArray(naming.shortLabelStopWords) ? naming.shortLabelStopWords : []).map(x => String(x).toLowerCase())
        .concat([
          // generic tournament words
          "disc","rated","unrated","golf","dg","tournament","series","league","weekly","week","wk","event","stop","round",
          "open","classic","challenge","cup","shootout","showdown","championship","fundraiser","charity",
          "presented","by","at","@", "of", "the", "and", "in", "on", "for",
          // common season markers
          "spring","summer","fall","autumn","winter","tour","saturday","sunday"
        ])
    );

    // try to remove obvious series prefix words (series name tokens)
    const seriesTitle = cleanText((SERIES.branding && SERIES.branding.titleText) || SERIES.name || "");
    const seriesTokens = seriesTitle.toLowerCase().split(/\s+/).filter(Boolean);
    for (const t of seriesTokens) stop.add(t);

    function titleCaseWord(w) {
      if (!w) return "";
      // preserve acronyms like "PDGA", "UPlay"
      if (w.toUpperCase() === w && w.length <= 6) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }

    function makeLabelFromSegment(seg) {
      seg = cleanText(seg || "");
      if (!seg) return "";

      // remove parenthetical clutter but keep meaning if it's all we have
      seg = seg.replace(/\s*\([^)]*\)\s*/g, " ").trim();

      const words = seg
        .split(/\s+/)
        .map(w => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "")) // trim punctuation
        .filter(Boolean);

      const kept = [];
      for (const w of words) {
        const lw = w.toLowerCase();
        if (stop.has(lw)) continue;
        // avoid pure numbers (week numbers etc)
        if (/^\d+$/.test(lw)) continue;
        kept.push(w);
        if (kept.length >= maxWords) break;
      }

      if (!kept.length) return "";

      return kept.map(titleCaseWord).join(" ");
    }

    // Prefer the "rightmost" location-ish segment:
    const parts = s.split(/\s*(?:[-–—]|@|\bat\b|:|\|)\s*/i).map(p => p.trim()).filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      const candidate = makeLabelFromSegment(parts[i]);
      if (candidate) return candidate;
    }

    // Fallback: first meaningful words from the full name (after stopword removal)
    const fallback = makeLabelFromSegment(s);
    if (fallback) return fallback;

    // Last resort: first word
    return s.split(/\s+/)[0] || s;
  }

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
    const sortByDate = !!naming.sortByDate;

    if (sortByDate) {
      const list = events.slice();
      list.sort((a, b) => {
        const am = Number.isFinite(a.startMs) ? a.startMs : null;
        const bm = Number.isFinite(b.startMs) ? b.startMs : null;

        if (am != null && bm != null && am !== bm) return am - bm;
        if (am != null && bm == null) return -1;
        if (am == null && bm != null) return 1;

        const ai = String(a.pdgaEventId || "");
        const bi = String(b.pdgaEventId || "");
        if (ai && bi && ai !== bi) return ai.localeCompare(bi);

        return String(a.pdgaName || "").localeCompare(String(b.pdgaName || ""));
      });
      return list;
    }

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

      const statusImgs = Array.from(tr.querySelectorAll("img"));
      const statusCell = tr.querySelector(".views-field-StatusIcons");
      const statusCellHTML = statusCell ? statusCell.innerHTML : "";
      const rowText = cleanText(tr.textContent).toLowerCase();

      let status = "pending";
      if (statusCellHTML.includes("trophy-gray.gif") || rowText.includes("unofficial tournament results")) {
        status = "unofficial";
      } else if (statusCellHTML.includes("trophy.gif") || rowText.includes("official tournament results")) {
        status = "official";
      } else if (statusCellHTML.includes("pdga-live-link") || statusCellHTML.includes("tour/live")) {
        status = "live";
      } else if (statusCellHTML.includes("book.gif") || rowText.includes("tournament registration list")) {
        status = "registering";
      }

      const isCancelled = /cancel/i.test(name);
      const isCompleted = (status === "official" || status === "unofficial");

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
        console.log("[DGST] Seed event:", name, "=> shortLabel:", shortLabel, "date:", dateText, "status:", status, "cancelled:", isCancelled, "url:", pdgaUrl);
      }

      seen.add(id);
      events.push({
        pdgaEventId: id,
        pdgaUrl,
        pdgaName: name,
        shortLabel,
        status,
        isCancelled,
        isCompleted,
        dateText,
        startMs,
        endMs,
      });
    }

    return sortEventsSmart(events);
  }

  

  // =========================================================
  // Single-flight memoization (per tab)
  // =========================================================
  let __dgstSeriesCtxPromise = null;
  let __dgstSeriesCtxPromiseMode = "normal"; // "normal" | "force"
  let __dgstSeriesCtxValue = null;
  let __dgstSeriesCtxValueAt = 0;

  let __dgstResultsPromise = null;
  let __dgstResultsPromiseMode = "normal"; // "normal" | "force"
  let __dgstResultsValue = null;
  let __dgstResultsValueAt = 0;

  window.Common.getSeriesContext = async function getSeriesContext({ onStatus, forceRefresh } = {}) {
    const cacheOn = cacheEnabledByDefault();

    // IMPORTANT: discovery should NOT automatically honor global ?force=1 unless explicitly requested.
    // This reduces request volume and 429 risk.
    const forcing = !!forceRefresh;
    const mode = forcing ? "force" : "normal";

    // Fast in-memory path (per tab)
    if (!forcing && __dgstSeriesCtxValue) {
      const fresh = (__dgstSeriesCtxValueAt > 0) && ((Date.now() - __dgstSeriesCtxValueAt) <= CACHE.TTL_SERIES_CTX_MS);
      if (fresh) return __dgstSeriesCtxValue;
    }

    // Join in-flight discovery if mode matches
    if (__dgstSeriesCtxPromise && __dgstSeriesCtxPromiseMode === mode) {
      return __dgstSeriesCtxPromise;
    }

    // Skip reading session cache if explicitly forcing discovery.
    if (!forcing) {
      const cached = cacheOn ? cacheGet(CACHE.KEY_SERIES_CTX, CACHE.TTL_SERIES_CTX_MS) : null;
      if (cached) {
        __dgstSeriesCtxValue = cached;
        __dgstSeriesCtxValueAt = Date.now();
        return cached;
      }
    }

    __dgstSeriesCtxPromiseMode = mode;
    __dgstSeriesCtxPromise = (async () => {
      onStatus && onStatus("Fetching PDGA series listing…");

      try {
        const byId = new Map();

        const seeds = Array.isArray(DATA.PDGA.SEED_URLS) ? DATA.PDGA.SEED_URLS : [DATA.PDGA.SEED_URL];

        for (let i = 0; i < seeds.length; i++) {
          const seed = seeds[i];
          onStatus && onStatus(`Fetching PDGA series listing… (${i + 1}/${seeds.length})`);

          // Discovery should typically NOT honor global force.
          const html = await fetchViaProxy(seed, { forceRefresh: forcing, useGlobalForce: false });
          const parsed = parseEventsFromSeedHtml(html);

          for (const ev of parsed) {
            const id = String(ev.pdgaEventId || "").trim();
            if (!id) continue;

            if (!byId.has(id)) {
              byId.set(id, ev);
              continue;
            }

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
        ensureUniqueShortLabels(events);

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

        const ctx = {
          seedUrl: DATA.PDGA.SEED_URL,
          seedUrls: DATA.PDGA.SEED_URLS || [DATA.PDGA.SEED_URL],
          builtAt: Date.now(),
          events,
          eventUrlByShort,
          eventNameByShort,
        };

        if (cacheOn) cacheSet(CACHE.KEY_SERIES_CTX, ctx);

        __dgstSeriesCtxValue = ctx;
        __dgstSeriesCtxValueAt = Date.now();

        onStatus && onStatus(`Found ${events.length} event(s) from PDGA.`);
        return ctx;
      } catch (e) {
        // IMPORTANT: explicit forced discovery must never silently fall back to stale.
        if (forcing) {
          onStatus && onStatus("PDGA discovery failed (refresh aborted).");
          throw e;
        }

        console.warn("Series context discovery failed:", e);
        onStatus && onStatus("PDGA discovery failed (using cached data if available).");

        const cached = cacheOn ? cacheGet(CACHE.KEY_SERIES_CTX, CACHE.TTL_SERIES_CTX_MS) : null;
        if (cached) {
          __dgstSeriesCtxValue = cached;
          __dgstSeriesCtxValueAt = Date.now();
          return cached;
        }

        const empty = { seedUrl: DATA.PDGA.SEED_URL, builtAt: Date.now(), events: [], eventUrlByShort: {}, eventNameByShort: {} };
        __dgstSeriesCtxValue = empty;
        __dgstSeriesCtxValueAt = Date.now();
        return empty;
      }
    })().finally(() => {
      __dgstSeriesCtxPromise = null;
    });

    return __dgstSeriesCtxPromise;
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

    if (typeof scoring.pointsFromPlace === "function") {
      try {
        const v = scoring.pointsFromPlace(placeText, n);
        if (v === null || typeof v === "undefined") return "";
        return String(v);
      } catch (e) {
        console.warn("pointsFromPlace() failed; falling back to default linear rule.", e);
      }
    }

    const rule = scoring.points || {};
    if (String(rule.type || "").toLowerCase() === "linear") {
      const base = Number(rule.base);
      if (Number.isFinite(base)) return String(Math.max(0, base - n));
    }

    return String(Math.max(0, 101 - n));
  }

  function findHeaderInfo(tableEl) {
    const theadThs = Array.from(tableEl.querySelectorAll("thead th"));
    if (theadThs.length) {
      return { headerRow: null, headerCells: theadThs };
    }

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
    let out = keys.slice();
    if (!Number.isFinite(targetLen) || targetLen <= out.length) return out;

    for (let round = 1; round <= 9 && out.length < targetLen; round++) {
      const rdKey = `Rd${round}`;
      const ratingKey = `Rd${round} rating`;

      const rdIdx = out.indexOf(rdKey);
      if (rdIdx === -1) continue;
      if (out.includes(ratingKey)) continue;

      out.splice(rdIdx + 1, 0, ratingKey);
    }

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

    try {
      const probeTr = tableEl.querySelector("tbody tr") || tableEl.querySelector("tr");
      const probeTds = probeTr ? Array.from(probeTr.querySelectorAll("td")) : [];
      if (probeTds.length && probeTds.length > keys.length) {
        keys = inferMissingRatingKeys(keys, probeTds.length);
      }
    } catch {}

    const trs = Array.from(tableEl.querySelectorAll("tbody tr")).length
      ? Array.from(tableEl.querySelectorAll("tbody tr"))
      : Array.from(tableEl.querySelectorAll("tr"));

    const outRows = [];

    for (const tr of trs) {
      if (headerRow && tr === headerRow) continue;
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

  async function fetchEventResultsRows(ev, { onStatus, forceRefresh } = {}) {
    const shortLabel = String(ev.shortLabel || "").trim();
    const url = String(ev.pdgaUrl || "").trim();
    if (!shortLabel || !url) return [];

    onStatus && onStatus(`Fetching results: ${shortLabel}…`);

    const html = await fetchViaProxy(url, { forceRefresh: !!forceRefresh });
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

  // =========================================================
  // DB API helpers
  // =========================================================

  const API_URL = PLATFORM_BASE_PATH + "/api.php";

  async function fetchStoredResults(seriesId) {
    try {
      const res = await fetch(`${API_URL}?action=get_stored_results&series_id=${encodeURIComponent(seriesId)}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn("[DGST] fetchStoredResults failed:", e);
      return null;
    }
  }

  async function storeEventResults(seriesId, ev, rows) {
    try {
      await fetch(`${API_URL}?action=store_event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesId, event: ev, results: rows }),
      });
    } catch (e) {
      console.warn("[DGST] storeEventResults failed:", e);
    }
  }

  function dbRowToDisplayRow(r, ev, pointsCol) {
    const row = {};
    row["Event"]    = ev.shortLabel;
    row["Division"] = r.division || "";
    row[pointsCol]  = r.points != null ? String(r.points) : "";
    row["Place"]    = r.place   || "";
    row["Name"]     = r.name    || "";
    row["PDGA#"]    = r.pdgaNum || "";
    row["Rating"]   = r.rating  || "";
    row["Par"]      = r.par     || "";
    row["Total"]    = r.total   || "";
    row["Prize"]    = r.prize   || "";
    for (let i = 1; i <= 10; i++) {
      row[`Rd${i}`]        = r[`rd${i}`]        || "";
      row[`Rd${i} rating`] = r[`rd${i}Rating`]  || "";
    }
    row["_fromDb"] = true;
    return row;
  }

  function displayRowToDbResultRow(row, division, pointsCol) {
    const r = {
      division,
      place:   row["Place"]   || "",
      points:  row[pointsCol] !== "" ? parseFloat(row[pointsCol]) : null,
      name:    row["Name"]    || "",
      pdgaNum: row["PDGA#"]   || "",
      rating:  row["Rating"]  || "",
      par:     row["Par"]     || "",
      total:   row["Total"]   || "",
      prize:   row["Prize"]   || "",
      pdgaPts: row["PDGA Pts"] || "",
    };
    for (let i = 1; i <= 10; i++) {
      r[`rd${i}`]        = row[`Rd${i}`]        || "";
      r[`rd${i}Rating`]  = row[`Rd${i} rating`] || "";
    }
    return r;
  }

  window.Common.loadAllEvents = async function loadAllEvents({ onStatus, forceRefresh } = {}) {
    const cacheOn = cacheEnabledByDefault();

    // One-shot force: FORCE_REFRESH_ACTIVE is set only when landing with ?force=1.
    // We keep it active through the first successful results fetch, then turn it off.
    const forcing = !!(FORCE_REFRESH_ACTIVE || forceRefresh);
    const mode = forcing ? "force" : "normal";

    // Fast in-memory path (per tab)
    if (!forcing && __dgstResultsValue) {
      const fresh = (__dgstResultsValueAt > 0) && ((Date.now() - __dgstResultsValueAt) <= CACHE.TTL_RESULTS_MS);
      if (fresh && __dgstResultsValue.rows && __dgstResultsValue.columns) {
        onStatus && onStatus("Loaded results from cache.");
        return __dgstResultsValue;
      }
    }

    // Join in-flight load if mode matches
    if (__dgstResultsPromise && __dgstResultsPromiseMode === mode) {
      return __dgstResultsPromise;
    }

    if (!forcing) {
      const cached = cacheOn ? cacheGet(CACHE.KEY_RESULTS, CACHE.TTL_RESULTS_MS) : null;
      if (cached && cached.rows && cached.columns) {
        __dgstResultsValue = cached;
        __dgstResultsValueAt = Date.now();
        onStatus && onStatus("Loaded results from cache.");
        return cached;
      }
    }

    __dgstResultsPromiseMode = mode;
    __dgstResultsPromise = (async () => {
      // Status-include toggles: series config defaults, overridable per session
      const scoringCfg = SERIES.scoring || {};
      const includeLive        = !!(sessionStorage.getItem("dgst_include_live")        ?? scoringCfg.defaultIncludeLive);
      const includeUnofficial  = !!(sessionStorage.getItem("dgst_include_unofficial")  ?? scoringCfg.defaultIncludeUnofficial);

      function shouldInclude(ev) {
        if (ev.isCancelled) return false;
        // Fall back to isCompleted for events cached before status field was added
        const s = ev.status || (ev.isCompleted ? "official" : "pending");
        if (s === "official")                      return true;
        if (s === "unofficial" && includeUnofficial) return true;
        if (s === "live"       && includeLive)       return true;
        return false;
      }

      // Results loading depends on discovery context, but we do NOT need to force-refresh
      // discovery here (it increases request volume). Force applies to event result pages.
      const ctx = await window.Common.getSeriesContext({ onStatus, forceRefresh: false });
      const events = (ctx && ctx.events) ? ctx.events : [];

      const includedEvents = events.filter(shouldInclude);

      if (!includedEvents.length) {
        const emptyPayload = { columns: FIXED_COLUMNS.slice(), rows: [], builtAt: Date.now(), seedUrl: DATA.PDGA.SEED_URL };
        if (cacheOn) cacheSet(CACHE.KEY_RESULTS, emptyPayload);

        __dgstResultsValue = emptyPayload;
        __dgstResultsValueAt = Date.now();

        if (FORCE_REFRESH_ACTIVE) FORCE_REFRESH_ACTIVE = false;

        onStatus && onStatus("No events found.");
        return emptyPayload;
      }

      // Fetch stored official results from DB (skip on force refresh so we re-scrape PDGA)
      const dbData = forcing ? null : await fetchStoredResults(SERIES_ID);
      const dbRowsByEventId = {};
      const dbOfficialIds = new Set();
      if (dbData && dbData.events && dbData.results) {
        for (const dbEv of dbData.events) {
          if (dbEv.status === "official") dbOfficialIds.add(dbEv.pdgaEventId);
        }
        for (const r of dbData.results) {
          const dbEv = dbData.events.find(e => e.id === r.eventId);
          if (!dbEv || !dbOfficialIds.has(dbEv.pdgaEventId)) continue;
          if (!dbRowsByEventId[dbEv.pdgaEventId]) dbRowsByEventId[dbEv.pdgaEventId] = [];
          dbRowsByEventId[dbEv.pdgaEventId].push(dbRowToDisplayRow(r, dbEv, POINTS_COL));
        }
        if (DEBUG) console.log("[DGST] DB: official event IDs:", [...dbOfficialIds]);
      }

      onStatus && onStatus("Loading results…");

      const pdgaCfg = SERIES.pdga || {};
      const throttleMs      = Number.isFinite(Number(pdgaCfg.throttleMs))      ? Number(pdgaCfg.throttleMs)      : 350;
      const forceThrottleMs = Number.isFinite(Number(pdgaCfg.forceThrottleMs)) ? Number(pdgaCfg.forceThrottleMs) : 650;
      const delayMs = forcing ? forceThrottleMs : throttleMs;

      // On normal loads, cap new PDGA fetches per session to avoid rate-limiting.
      // Events beyond the cap are skipped now and picked up on subsequent loads.
      // ?force=1 bypasses the cap entirely.
      const pdgaCfg2 = SERIES.pdga || {};
      const newFetchCap = forcing ? Infinity : (Number.isFinite(Number(pdgaCfg2.newFetchCap)) ? Number(pdgaCfg2.newFetchCap) : 6);

      const allRows = [];
      const eventsNeedingFetch = includedEvents.filter(e => !dbOfficialIds.has(e.pdgaEventId));
      const pdgaFetchCount = Math.min(eventsNeedingFetch.length, newFetchCap);
      let pdgaFetchIndex = 0;

      for (const ev of includedEvents) {
        // Use DB rows for official events (unless forcing a refresh)
        if (!forcing && dbOfficialIds.has(ev.pdgaEventId) && dbRowsByEventId[ev.pdgaEventId]) {
          for (const r of dbRowsByEventId[ev.pdgaEventId]) allRows.push(r);
          if (DEBUG) console.log("[DGST] Using DB results for:", ev.shortLabel);
          continue;
        }

        // Cap new PDGA fetches on normal loads
        if (!forcing && pdgaFetchIndex >= newFetchCap) {
          if (DEBUG) console.log("[DGST] Deferring to next load (cap reached):", ev.shortLabel);
          continue;
        }

        // Scrape PDGA for this event
        let scrapedRows = [];
        if (forcing) {
          scrapedRows = await fetchEventResultsRows(ev, { onStatus, forceRefresh: true });
        } else {
          try {
            scrapedRows = await fetchEventResultsRows(ev, { onStatus, forceRefresh: false });
          } catch (e) {
            console.warn("Failed to load event results:", ev, e);
          }
        }

        for (const r of scrapedRows) allRows.push(r);

        // Store official events in DB for future loads
        if (ev.status === "official" && scrapedRows.length) {
          const dbResults = scrapedRows.map(r => displayRowToDbResultRow(r, r["Division"] || "", POINTS_COL));
          storeEventResults(SERIES_ID, ev, dbResults);
        }

        // Throttle only between PDGA fetches
        pdgaFetchIndex++;
        if (delayMs > 0 && pdgaFetchIndex < pdgaFetchCount) {
          await sleep(delayMs);
        }
      }

      const payload = {
        columns: FIXED_COLUMNS.slice(),
        rows: allRows,
        builtAt: Date.now(),
        seedUrl: DATA.PDGA.SEED_URL,
      };

      if (cacheOn) cacheSet(CACHE.KEY_RESULTS, payload);

      __dgstResultsValue = payload;
      __dgstResultsValueAt = Date.now();

      // ✅ Timestamp should represent LAST SUCCESSFUL PDGA fetch cycle.
      // We only finalize after results successfully loaded and were cached.
      if (window.Common && typeof window.Common.finalizePdgaRefreshIfPending === "function") {
        window.Common.finalizePdgaRefreshIfPending();
      }

      // One-shot force refresh: after a successful forced load, switch back to normal mode
      // so navigating to Standings/Player doesn't keep forcing proxy refresh.
      if (FORCE_REFRESH_ACTIVE) FORCE_REFRESH_ACTIVE = false;

      onStatus && onStatus(`Loaded ${allRows.length} result row(s).`);
      return payload;
    })().catch(err => {
      __dgstResultsValue = null;
      __dgstResultsValueAt = 0;
      throw err;
    }).finally(() => {
      __dgstResultsPromise = null;
    });

    return __dgstResultsPromise;
  };

  window.Common.clearResultsCache = function clearResultsCache() {
    __dgstResultsValue = null;
    __dgstResultsValueAt = 0;
    __dgstResultsPromise = null;
    __dgstResultsPromiseMode = null;
    try { sessionStorage.removeItem(CACHE.KEY_RESULTS); } catch {}
  };

  // =========================================================
  // Optional: Preload results once per tab to warm session cache
  // =========================================================
  let __dgstPreloadPromise = null;

  window.Common.preloadAllEvents = function preloadAllEvents({ onStatus } = {}) {
    // If already preloaded (or in-flight), reuse the same promise.
    if (__dgstPreloadPromise) return __dgstPreloadPromise;

    __dgstPreloadPromise = (async () => {
      onStatus && onStatus("Preloading PDGA results (warming cache)…");

      // This will populate sessionStorage cache via loadAllEvents().
      // Normal mode (no force) so it respects caching behavior.
      const payload = await window.Common.loadAllEvents({ onStatus });

      onStatus && onStatus(`Preload complete (${(payload.rows || []).length} rows).`);
      return payload;
    })().catch(err => {
      // If preload fails (429 etc), allow later attempts.
      __dgstPreloadPromise = null;
      throw err;
    });

    return __dgstPreloadPromise;
  };

})();
