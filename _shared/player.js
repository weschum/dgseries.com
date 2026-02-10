// /dgseries.com/_shared/player.js
(() => {
  "use strict";

  window.DGSTViews = window.DGSTViews || {};

  function getUrlParam(name) {
    try { return new URLSearchParams(location.search).get(name); }
    catch { return null; }
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

  function normalizeName(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function normalizePdga(s) {
    return String(s || "").replace(/[^\d]/g, "").trim();
  }

  function toRatingNumber(val) {
    const s = String(val || "").trim();
    if (!s) return NaN;
    const n = Number(s.replace(/[^\d]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }

  function calcAvgRoundRating(rows) {
    const vals = [];
    for (const r of rows) {
      for (let i = 1; i <= 5; i++) {
        const k = `Rd${i} rating`;
        const n = toRatingNumber(r[k]);
        if (Number.isFinite(n) && n > 0) vals.push(n);
      }
    }
    if (!vals.length) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return { avg: sum / vals.length, rounds: vals.length };
  }

  function buildPdgaProfileHref(pdga) {
    return "https://www.pdga.com/player/" + encodeURIComponent(pdga);
  }

  function buildAllResultsHref(query) {
    return buildInternalHref("all-events", { q: query || "" });
  }

  function chooseMostCommon(values) {
    const m = new Map();
    for (const v of values) {
      const key = String(v || "").trim();
      if (!key) continue;
      m.set(key, (m.get(key) || 0) + 1);
    }
    let best = "";
    let bestCt = 0;
    for (const [k, ct] of m.entries()) {
      if (ct > bestCt) { best = k; bestCt = ct; }
    }
    return best;
  }

  function uniqueCount(values) {
    const s = new Set(values.filter(Boolean));
    return s.size;
  }

  function findRowsForPlayer(allRows, pdga, name) {
    if (pdga) {
      const p = normalizePdga(pdga);
      return allRows.filter(r => normalizePdga(r["PDGA#"]) === p);
    }
    if (name) {
      const n = normalizeName(name).toLowerCase();
      return allRows.filter(r => normalizeName(r.Name).toLowerCase() === n);
    }
    return [];
  }

  function clearTable(els) {
    els.resultsHead.innerHTML = "";
    els.resultsBody.innerHTML = "";
  }

  function renderTable(els, rows, columns, ctx, POINTS_COL) {
    clearTable(els);

    const preferred = [
      "Event",
      "Division",
      "Place",
      POINTS_COL,
      "Rating",
      "Par",
      "Rd1",
      "Rd1 rating",
      "Rd2",
      "Rd2 rating",
      "Total",
      "Prize",
    ];

    const available = new Set((columns || []).map(String));
    const cols = preferred.filter(c => available.has(c));

    const urlByShort = (ctx && ctx.eventUrlByShort) ? ctx.eventUrlByShort : {};

    const trh = document.createElement("tr");
    for (const c of cols) {
      const th = document.createElement("th");
      th.textContent = c;
      trh.appendChild(th);
    }
    els.resultsHead.appendChild(trh);

    const sorted = [...rows].sort((a, b) => {
      const ea = String(a.Event || "");
      const eb = String(b.Event || "");
      if (ea !== eb) return ea.localeCompare(eb);
      const da = String(a.Division || "");
      const db = String(b.Division || "");
      return da.localeCompare(db);
    });

    const frag = document.createDocumentFragment();
    for (const r of sorted) {
      const tr = document.createElement("tr");

      for (const c of cols) {
        const td = document.createElement("td");

        if (c === "Event") {
          const label = String(r.Event || "");
          const url = urlByShort[label] || "";
          if (url) {
            const a = document.createElement("a");
            a.href = url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = label;
            td.appendChild(a);
          } else {
            td.textContent = label;
          }
        } else if (c === "Division") {
          td.textContent = window.Common.shortDivisionName(r.Division) || String(r.Division || "");
        } else {
          td.textContent = String(r[c] ?? "");
        }

        tr.appendChild(td);
      }

      frag.appendChild(tr);
    }

    els.resultsBody.appendChild(frag);
    return sorted.length;
  }

  function populateNameSelect(els, rows) {
    const map = new Map();
    for (const r of rows) {
      const name = normalizeName(r.Name);
      if (!name) continue;
      const pdga = normalizePdga(r["PDGA#"]);
      const key = pdga ? ("p:" + pdga) : ("n:" + name.toLowerCase());
      if (!map.has(key)) map.set(key, { name, pdga });
    }

    const list = Array.from(map.values());
    list.sort((a, b) => a.name.localeCompare(b.name));

    els.nameSelect.innerHTML =
      `<option value="">Select a player…</option>` +
      list.map(p => {
        const val = (p.pdga ? p.pdga : "") + "|" + p.name;
        return `<option value="${window.Common.escapeHtml(val)}">${window.Common.escapeHtml(p.name)}</option>`;
      }).join("");
  }

  function renderPlayer(els, allRows, columns, ctx, pdga, name, POINTS_COL) {
    const playerRows = findRowsForPlayer(allRows, pdga, name);

    if (!playerRows.length) {
      els.playerName.textContent = "";
      els.playerPdga.textContent = "";
      els.playerMeta.textContent = "";
      clearTable(els);
      els.status.textContent = "Select a player (auto-load), or enter a PDGA# and click Load Player Stats.";
      return;
    }

    const chosenName = chooseMostCommon(playerRows.map(r => normalizeName(r.Name)));
    const chosenPdga = chooseMostCommon(playerRows.map(r => normalizePdga(r["PDGA#"])));

    els.playerName.textContent = chosenName || "Player";
    els.playerPdga.textContent = chosenPdga ? `PDGA# ${chosenPdga}` : "";

    const eventCount = uniqueCount(playerRows.map(r => String(r.Event)));
    const divCount = uniqueCount(playerRows.map(r => window.Common.shortDivisionName(r.Division)));

    const avg = calcAvgRoundRating(playerRows);
    const parts = [];
    parts.push(`${eventCount} event(s)`);
    parts.push(`${divCount} division(s)`);
    if (avg) parts.push(`Avg Rd Rating: ${avg.avg.toFixed(1)} (${avg.rounds} rounds)`);
    els.playerMeta.textContent = parts.join(" • ");

    els.allResultsLink.href = buildAllResultsHref(chosenPdga ? chosenPdga : chosenName);

    if (chosenPdga) {
      els.pdgaLink.href = buildPdgaProfileHref(chosenPdga);
      els.pdgaLink.style.display = "";
    } else {
      els.pdgaLink.href = "#";
      els.pdgaLink.style.display = "none";
    }

    const shown = renderTable(els, playerRows, columns, ctx, POINTS_COL);
    els.status.textContent = `Showing ${shown} result(s).`;
  }

  async function init() {
    // IMPORTANT: query DOM after router injects the template
    const els = {
      nameSelect: document.getElementById("nameSelect"),
      pdgaInput: document.getElementById("pdgaInput"),
      goBtn: document.getElementById("goBtn"),

      playerName: document.getElementById("playerName"),
      playerPdga: document.getElementById("playerPdga"),
      playerMeta: document.getElementById("playerMeta"),

      allResultsLink: document.getElementById("allResultsLink"),
      pdgaLink: document.getElementById("pdgaLink"),

      resultsHead: document.getElementById("resultsHead"),
      resultsBody: document.getElementById("resultsBody"),
      status: document.getElementById("status"),
    };

    const required = Object.values(els).every(Boolean);
    if (!required) {
      console.error("Player template missing required elements.");
      return;
    }

    const setStatus = (msg) => { els.status.textContent = msg || ""; };

    const POINTS_COL = (window.Common && typeof window.Common.pointsColumnName === "function")
      ? window.Common.pointsColumnName()
      : "Series Pts";

    setStatus("Loading…");

    const [payload, ctx] = await Promise.all([
      window.Common.loadAllEvents({ onStatus: setStatus }),
      window.Common.getSeriesContext({ onStatus: () => {}, forceRefresh: false }),
    ]);

    const rows = payload.rows || [];
    const columns = payload.columns || [];

    populateNameSelect(els, rows);

    const urlPdga = normalizePdga(getUrlParam("pdga") || "");
    const urlName = normalizeName(getUrlParam("name") || "");

    function getSelectionName() {
      const sel = String(els.nameSelect.value || "");
      if (!sel || !sel.includes("|")) return "";
      const parts = sel.split("|");
      return normalizeName(parts.slice(1).join("|"));
    }

    function go({ preferPdga } = {}) {
      const pdga = normalizePdga(els.pdgaInput.value || "");
      const name = getSelectionName();

      if (preferPdga && pdga) {
        renderPlayer(els, rows, columns, ctx, pdga, "", POINTS_COL);
        return;
      }
      if (!pdga && name) {
        renderPlayer(els, rows, columns, ctx, "", name, POINTS_COL);
        return;
      }
      if (pdga) {
        renderPlayer(els, rows, columns, ctx, pdga, "", POINTS_COL);
        return;
      }
      renderPlayer(els, rows, columns, ctx, "", "", POINTS_COL);
    }

    els.goBtn.addEventListener("click", () => {
      els.nameSelect.value = "";
      go({ preferPdga: true });
    });

    els.nameSelect.addEventListener("change", () => {
      const name = getSelectionName();
      if (!name) return;
      els.pdgaInput.value = "";
      go({ preferPdga: false });
    });

    if (urlPdga) {
      els.pdgaInput.value = urlPdga;
      go({ preferPdga: true });
    } else if (urlName) {
      const opts = Array.from(els.nameSelect.options || []);
      const match = opts.find(o => normalizeName(o.textContent).toLowerCase() === urlName.toLowerCase());
      if (match) els.nameSelect.value = match.value;
      go({ preferPdga: false });
    } else {
      setStatus("Select a player (auto-load), or enter a PDGA# and click Load Player Stats.");
    }
  }

  window.DGSTViews.player = {
    init: () => init().catch((e) => {
      console.error(e);
      const status = document.getElementById("status");
      if (status) status.textContent = "Error loading player stats.";
    }),
  };
})();
