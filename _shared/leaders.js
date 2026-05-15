// /dgseries.com/_shared/leaders.js
(() => {
  "use strict";

  window.DGSTViews = window.DGSTViews || {};

  const SERIES_CFG = (window.Common && window.Common.SERIES_CONFIG)
    ? window.Common.SERIES_CONFIG
    : (window.SERIES_CONFIG || {});

  const TOP_N_EVENTS = Number(SERIES_CFG?.standings?.topEvents) || 4;
  const MAX_TOTAL    = Number(SERIES_CFG?.standings?.maxTotal)  || (TOP_N_EVENTS * 100);
  const TOP_N_LEADERS = 3;

  // Division sort delegated to window.Common.sortDivisions (canonical PDGA order)

  // ─── Standings computation (mirrors standings.js logic) ───────────────────

  function numberOrNull(x) {
    const n = Number(String(x || "").trim());
    return Number.isFinite(n) ? n : null;
  }

  function computeTopN(rows, division, POINTS_COL, topN) {
    const byPlayer = new Map();

    for (const r of rows) {
      if (String(r.Division || "") !== division) continue;

      const key  = String(r.PdgaNum || r.Name || "").trim();
      const name = String(r.Name || "").trim();
      const pdga = String(r.PdgaNum || "").trim();
      const pts  = numberOrNull(r[POINTS_COL]);

      if (!key) continue;

      if (!byPlayer.has(key)) byPlayer.set(key, { name, pdga, events: [] });
      if (pts !== null) byPlayer.get(key).events.push(pts);
    }

    const players = [];
    for (const [, p] of byPlayer) {
      const sorted   = p.events.slice().sort((a, b) => b - a);
      const top      = sorted.slice(0, TOP_N_EVENTS);
      const totalRaw = top.reduce((s, v) => s + v, 0);
      const total    = Math.min(totalRaw, MAX_TOTAL);
      players.push({ name: p.name, pdga: p.pdga, total });
    }

    players.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.name.localeCompare(b.name);
    });

    // Assign ranks then filter to top N
    let lastTotal = null;
    let shownRank = 0;
    const ranked = players.map((p, idx) => {
      if (lastTotal === null || p.total !== lastTotal) {
        shownRank = idx + 1;
        lastTotal = p.total;
      }
      return { ...p, _rank: shownRank };
    });

    // Prefix T on all players sharing a rank
    const rankCounts = new Map();
    for (const p of ranked) rankCounts.set(p._rank, (rankCounts.get(p._rank) || 0) + 1);

    return ranked
      .filter(p => p._rank <= topN)
      .map(p => ({
        name:      p.name,
        pdga:      p.pdga,
        total:     p.total,
        rankLabel: rankCounts.get(p._rank) > 1 ? "T" + p._rank : String(p._rank),
      }));
  }

  // ─── Rendering ────────────────────────────────────────────────────────────

  function esc(s) {
    return window.Common?.escapeHtml
      ? window.Common.escapeHtml(String(s ?? ""))
      : String(s ?? "").replace(/[&<>"']/g, c =>
          ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function buildPdgaProfileHref(pdgaNum) {
    return "https://www.pdga.com/player/" + encodeURIComponent(pdgaNum);
  }

  function renderDivisionTable(division, players, POINTS_COL, totalPlayers) {
    const label = window.Common?.shortDivisionName
      ? window.Common.shortDivisionName(division)
      : division;

    if (!players.length) return "";

    const rows = players.map(p => {
      const playerHref = p.pdga ? `#player?pdga=${encodeURIComponent(p.pdga)}` : null;
      const nameCell = playerHref
        ? `<a href="${esc(playerHref)}">${esc(p.name)}</a>`
        : esc(p.name);
      const pdgaCell = p.pdga
        ? `<a href="${esc(buildPdgaProfileHref(p.pdga))}" target="_blank" rel="noopener noreferrer">${esc(p.pdga)}</a>`
        : "";
      return `
        <tr>
          <td data-col="Name">${nameCell}</td>
          <td data-col="PDGA#">${pdgaCell}</td>
          <td data-col="Rank">${esc(p.rankLabel)}</td>
          <td data-col="${esc(POINTS_COL)}">${esc(String(p.total))}</td>
        </tr>`;
    }).join("");

    const countLabel = totalPlayers != null
      ? `<span class="leaders-division-count">${totalPlayers} player${totalPlayers !== 1 ? "s" : ""}</span>`
      : "";

    return `
      <div class="leaders-section">
        <div class="leaders-division-title">${esc(label)}${countLabel}</div>
        <div class="table-wrap no-scroll">
          <table class="standings-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>PDGA#</th>
                <th>Rank</th>
                <th>${esc(POINTS_COL)}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  async function init() {
    const statusEl  = document.getElementById("status");
    const wrapEl    = document.getElementById("leadersWrap");

    if (!statusEl || !wrapEl) {
      console.error("Leaders template missing required elements.");
      return;
    }

    const setStatus = msg => { statusEl.textContent = msg || ""; };

    // Toggle notice — show if unofficial/live results are included
    if (window.Common.buildToggleNotice) {
      const notice = window.Common.buildToggleNotice();
      if (notice) statusEl.insertAdjacentHTML("beforebegin", notice);
    }

    const POINTS_COL = (window.Common && typeof window.Common.pointsColumnName === "function")
      ? window.Common.pointsColumnName()
      : "Series Pts";

    setStatus("Loading…");

    const payload = await window.Common.loadAllEvents({ onStatus: setStatus });
    const rows    = payload.rows || [];

    if (!rows.length) {
      setStatus("No results yet.");
      wrapEl.innerHTML = `<div class="empty">No results to display.</div>`;
      return;
    }

    const divs = window.Common.sortDivisions(
      Array.from(new Set(rows.map(r => String(r.Division || "").trim()).filter(Boolean)))
    );

    const html = divs.map(div => {
      const allInDiv = Array.from(new Set(
        rows.filter(r => String(r.Division || "") === div)
            .map(r => String(r.PdgaNum || r.Name || "").trim())
            .filter(Boolean)
      )).length;
      return renderDivisionTable(div, computeTopN(rows, div, POINTS_COL, TOP_N_LEADERS), POINTS_COL, allInDiv);
    }).join("");

    wrapEl.innerHTML = html || `<div class="empty">No results to display.</div>`;
    setStatus("");
  }

  window.DGSTViews.leaders = {
    init: () => init().catch(e => {
      console.error(e);
      const s = document.getElementById("status");
      if (s) s.textContent = "Error loading leaders.";
    }),
  };

})();
