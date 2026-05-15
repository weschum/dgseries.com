// /dgseries.com/_shared/standings.js
(() => {
  "use strict";

  window.DGSTViews = window.DGSTViews || {};

  const DEFAULT_DIVISION = "MPO";

  const SERIES_CFG = (window.Common && window.Common.SERIES_CONFIG)
    ? window.Common.SERIES_CONFIG
    : (window.SERIES_CONFIG || {});

  const TOP_N_EVENTS = Number(SERIES_CFG?.standings?.topEvents) || 4;

  // If you score 100 max per event, this keeps MAX_TOTAL aligned automatically.
  // You can override maxTotal per series if needed.
  const MAX_TOTAL = Number(SERIES_CFG?.standings?.maxTotal) || (TOP_N_EVENTS * 100);

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function numberOrNull(x) {
    const n = Number(String(x || "").trim());
    return Number.isFinite(n) ? n : null;
  }

  function buildInternalHref(hash, params) {
    const u = new URL(location.href);
    u.hash = hash.startsWith("#") ? hash : ("#" + hash);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v === null || v === undefined || v === "") u.searchParams.delete(k);
        else u.searchParams.set(k, String(v));
      }
    }
    return u.pathname + u.search + u.hash;
  }

  function buildPlayerHref(pdgaNum, name) {
    return buildInternalHref("player", {
      pdga: pdgaNum ? String(pdgaNum).trim() : "",
      name: (!pdgaNum && name) ? String(name).trim() : ""
    });
  }

  function buildPdgaProfileHref(pdgaNum) {
    return "https://www.pdga.com/player/" + encodeURIComponent(pdgaNum);
  }

  function computeStandings(rows, division, POINTS_COL) {
    const byPlayer = new Map();

    for (const r of rows) {
      if (String(r.Division || "") !== division) continue;

      const name = String(r.Name || "").trim();
      const pdga = String(r["PDGA#"] || "").trim();
      const pts = numberOrNull(r[POINTS_COL]);

      if (!name || pts == null) continue;

      const key = pdga ? ("pdga:" + pdga) : ("name:" + name.toLowerCase());
      if (!byPlayer.has(key)) byPlayer.set(key, { name, pdga, pts: [] });
      byPlayer.get(key).pts.push(pts);
    }

    const players = Array.from(byPlayer.values()).map(p => {
      const sorted = p.pts.slice().sort((a, b) => b - a);
      const top = sorted.slice(0, TOP_N_EVENTS);
      const totalRaw = top.reduce((a, b) => a + b, 0);
      const total = Math.min(totalRaw, MAX_TOTAL);
      return { name: p.name, pdga: p.pdga, total };
    });

    players.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.name.localeCompare(b.name);
    });

    // First pass: assign numeric rank (handles gaps for ties)
    let lastTotal = null;
    let shownRank = 0;
    const ranked = players.map((p, idx) => {
      const rank = idx + 1;
      if (lastTotal === null || p.total !== lastTotal) {
        shownRank = rank;
        lastTotal = p.total;
      }
      return { ...p, _rank: shownRank };
    });

    // Second pass: prefix T on ALL players sharing a rank
    const rankCounts = new Map();
    for (const p of ranked) rankCounts.set(p._rank, (rankCounts.get(p._rank) || 0) + 1);

    return ranked.map(p => {
      const label = rankCounts.get(p._rank) > 1 ? "T" + p._rank : String(p._rank);
      const { _rank, ...rest } = p;
      return { ...rest, rankLabel: label };
    });
  }

  function renderStandings(els, standings, POINTS_COL) {
    els.standingsHead.innerHTML = `
      <tr>
        <th>Name</th>
        <th>PDGA#</th>
        <th>Rank</th>
        <th>${escapeHtml(POINTS_COL)}</th>
      </tr>
    `;

    els.standingsBody.innerHTML = standings.map(p => {
      const playerHref = buildPlayerHref(p.pdga, p.name);
      const playerCell = `<a href="${escapeHtml(playerHref)}">${escapeHtml(p.name)}</a>`;

      let pdgaCell = "";
      if (p.pdga) {
        const pdgaHref = buildPdgaProfileHref(p.pdga);
        pdgaCell = `<a href="${escapeHtml(pdgaHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.pdga)}</a>`;
      }

      return `
        <tr>
          <td data-col="Name">${playerCell}</td>
          <td data-col="PDGA#">${pdgaCell}</td>
          <td data-col="Rank">${escapeHtml(p.rankLabel)}</td>
          <td data-col="${escapeHtml(POINTS_COL)}">${escapeHtml(p.total)}</td>
        </tr>
      `;
    }).join("");
  }

  async function init() {
    // IMPORTANT: query DOM after router injects the template
    const els = {
      divisionSelect: document.getElementById("divisionSelect"),
      standingsHead: document.getElementById("standingsHead"),
      standingsBody: document.getElementById("standingsBody"),
      status: document.getElementById("status"),
      standingsHint: document.getElementById("standingsHint"),
    };

    if (!els.divisionSelect || !els.standingsHead || !els.standingsBody || !els.status) {
      console.error("Standings template missing required elements.");
      return;
    }

    // Standings description (configured per series; no generated fallback)
    if (els.standingsHint) {
      const desc = SERIES_CFG?.standings?.description;
      els.standingsHint.textContent = desc ? String(desc) : "";
      els.standingsHint.style.display = desc ? "" : "none";
    }

    const setStatus = (msg) => { els.status.textContent = msg || ""; };

    const POINTS_COL = (window.Common && typeof window.Common.pointsColumnName === "function")
      ? window.Common.pointsColumnName()
      : "Series Pts";

    // Status toggles — shown only when the series config opts in
    const scoringCfg = SERIES_CFG?.scoring || {};
    const hasLiveCfg        = "defaultIncludeLive"       in scoringCfg;
    const hasUnofficialCfg  = "defaultIncludeUnofficial" in scoringCfg;

    const toggleWrap = document.getElementById("statusToggles");
    if (toggleWrap && (hasLiveCfg || hasUnofficialCfg)) {
      toggleWrap.style.display = "";
      toggleWrap.innerHTML = `<span style="font-size:12px;color:var(--muted);font-weight:800;letter-spacing:.2px;">Include</span>`;

      function makeToggleBtn(storageKey, label, defaultVal) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-toggle";
        btn.dataset.key = storageKey;

        function getActive() {
          const raw = sessionStorage.getItem(storageKey);
          return raw !== null ? raw === "1" : !!defaultVal;
        }

        function syncStyle() {
          const on = getActive();
          btn.textContent = label;
          btn.classList.toggle("btn-toggle--on", on);
        }

        btn.addEventListener("click", () => {
          const nowOn = !getActive();
          sessionStorage.setItem(storageKey, nowOn ? "1" : "0");
          syncStyle();
          if (window.Common && typeof window.Common.clearResultsCache === "function") {
            window.Common.clearResultsCache();
          }
          reloadAndRender();
        });

        syncStyle();
        return btn;
      }

      if (hasUnofficialCfg) {
        toggleWrap.appendChild(makeToggleBtn("dgst_include_unofficial", "Unofficial", scoringCfg.defaultIncludeUnofficial));
      }
      if (hasLiveCfg) {
        toggleWrap.appendChild(makeToggleBtn("dgst_include_live", "Live", scoringCfg.defaultIncludeLive));
      }
    }

    setStatus("Loading…");

    async function reloadAndRender() {
      setStatus("Loading…");
      try {
        const p = await window.Common.loadAllEvents({ onStatus: setStatus });
        rows = p.rows || [];
        rebuildDivisionSelect();
        refresh();
      } catch (e) {
        setStatus("Error reloading results.");
      }
    }

    const payload = await window.Common.loadAllEvents({ onStatus: setStatus });
    let rows = payload.rows || [];

    function rebuildDivisionSelect(preferCurrent) {
      const current = preferCurrent ?? els.divisionSelect.value;
      const divs = window.Common.sortDivisions(
        Array.from(new Set(rows.map(r => String(r.Division || "").trim()).filter(Boolean)))
      );
      els.divisionSelect.innerHTML = divs
        .map(d => `<option value="${escapeHtml(d)}">${escapeHtml(window.Common.shortDivisionName(d))}</option>`)
        .join("");
      if (divs.includes(current)) els.divisionSelect.value = current;
      else if (divs.includes(DEFAULT_DIVISION)) els.divisionSelect.value = DEFAULT_DIVISION;
      else if (divs.length) els.divisionSelect.value = divs[0];
    }

    rebuildDivisionSelect(DEFAULT_DIVISION);

    function refresh() {
      const div = els.divisionSelect.value;
      const standings = computeStandings(rows, div, POINTS_COL);
      renderStandings(els, standings, POINTS_COL);

      const label = window.Common.shortDivisionName(div);
      setStatus(`Division: ${label} — showing ${standings.length} players.`);
    }

    els.divisionSelect.addEventListener("change", refresh);

    // If a forced refresh finishes while this view is open, reload cached results and re-render.
    window.addEventListener("dgst:refresh-updated", async () => {
      try {
        const p2 = await window.Common.loadAllEvents({ onStatus: () => {} });
        rows = p2.rows || [];
        rebuildDivisionSelect();
        refresh();
      } catch (e) {
        // ignore
      }
    });

    refresh();
  }

  window.DGSTViews.standings = {
    init: () => init().catch((e) => {
      console.error(e);
      const status = document.getElementById("status");
      if (status) status.textContent = "Error loading standings.";
    }),
  };
})();
