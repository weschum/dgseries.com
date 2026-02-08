// /dgst/_shared/all-events.js
(() => {
  "use strict";

  window.DGSTViews = window.DGSTViews || {};

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getUrlParam(name) {
    try { return new URLSearchParams(location.search).get(name); }
    catch { return null; }
  }

  function setUrlParam(name, value) {
    try {
      const url = new URL(location.href);
      if (!value) url.searchParams.delete(name);
      else url.searchParams.set(name, value);
      // IMPORTANT: preserve hash routing
      history.replaceState({}, "", url.pathname + url.search + url.hash);
    } catch {}
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

  function filterRows(allRows, event, division, q) {
    const query = String(q || "").trim().toLowerCase();
    return (allRows || []).filter(r => {
      if (event && String(r.Event || "") !== event) return false;
      if (division && String(r.Division || "") !== division) return false;

      if (query) {
        const name = String(r.Name || "").toLowerCase();
        const pdga = String(r["PDGA#"] || "").toLowerCase();
        if (!name.includes(query) && !pdga.includes(query)) return false;
      }
      return true;
    });
  }

  function renderTable(els, columns, rows, ctx) {
    els.resultsHead.innerHTML =
      "<tr>" +
      columns.map(c => `<th data-col="${escapeHtml(c)}">${escapeHtml(c)}</th>`).join("") +
      "</tr>";

    const urlByShort = (ctx && ctx.eventUrlByShort) ? ctx.eventUrlByShort : {};

    els.resultsBody.innerHTML = rows.map(r => {
      return (
        "<tr>" +
        columns.map(c => {
          if (c === "Event") {
            const label = String(r.Event || "");
            const url = urlByShort[label] || "";
            const cellHtml = url
              ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
              : escapeHtml(label);
            return `<td data-col="Event">${cellHtml}</td>`;
          }

          if (c === "Division") {
            const label = window.Common.shortDivisionName(r.Division);
            return `<td data-col="Division">${escapeHtml(label)}</td>`;
          }

          if (c === "Name") {
            const href = buildPlayerHref(r["PDGA#"], r.Name);
            return `<td data-col="Name"><a href="${escapeHtml(href)}">${escapeHtml(r.Name)}</a></td>`;
          }

          if (c === "PDGA#") {
            const pdga = String(r["PDGA#"] || "").trim();
            const cellHtml = pdga
              ? `<a href="${escapeHtml("https://www.pdga.com/player/" + encodeURIComponent(pdga))}" target="_blank" rel="noopener noreferrer">${escapeHtml(pdga)}</a>`
              : "";
            return `<td data-col="PDGA#">${cellHtml}</td>`;
          }

          return `<td data-col="${escapeHtml(c)}">${escapeHtml(r[c])}</td>`;
        }).join("") +
        "</tr>"
      );
    }).join("");
  }

  async function init() {
    // IMPORTANT: query DOM after router injects the template
    const els = {
      eventSelect: document.getElementById("eventSelect"),
      divisionSelect: document.getElementById("divisionSelect"),
      searchInput: document.getElementById("searchInput"),
      resultsHead: document.getElementById("resultsHead"),
      resultsBody: document.getElementById("resultsBody"),
      status: document.getElementById("status"),
    };

    if (!els.eventSelect || !els.divisionSelect || !els.searchInput || !els.resultsHead || !els.resultsBody || !els.status) {
      console.error("All Events template missing required elements.");
      return;
    }

    const setStatus = (msg) => { els.status.textContent = msg || ""; };

    const initEvent = getUrlParam("event") || "";
    const initDivision = getUrlParam("division") || "";
    const initQ = getUrlParam("q") || "";
    els.searchInput.value = initQ;

    setStatus("Loading…");

    const payload = await window.Common.loadAllEvents({ onStatus: setStatus });
    const ctx = await window.Common.getSeriesContext({ onStatus: () => {}, forceRefresh: false });

    const allRows = payload.rows || [];
    const allColumns = payload.columns || [];

    // Prefer event ordering from discovery context (already correctly sorted for the series).
    // This avoids lexicographic issues like SOWS1, SOWS10, SOWS2...
    const events = (() => {
      const out = [];
      const seen = new Set();

      if (ctx && Array.isArray(ctx.events) && ctx.events.length) {
        for (const ev of ctx.events) {
          const label = String(ev.shortLabel || "").trim();
          if (!label || seen.has(label)) continue;
          seen.add(label);
          out.push(label);
        }
      }

      // Fallback: derive from rows if ctx.events isn't available
      if (!out.length) {
        const raw = Array.from(new Set(allRows.map(r => String(r.Event || "").trim()).filter(Boolean)));
        raw.sort((a, b) => a.localeCompare(b));
        return raw;
      }

      return out;
    })();

    const divisions = Array.from(new Set(allRows.map(r => String(r.Division || "").trim()).filter(Boolean)));
    divisions.sort((a, b) => window.Common.shortDivisionName(a).localeCompare(window.Common.shortDivisionName(b)));

    els.eventSelect.innerHTML =
      `<option value="">All</option>` +
      events.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join("");

    els.divisionSelect.innerHTML =
      `<option value="">All</option>` +
      divisions.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(window.Common.shortDivisionName(d))}</option>`).join("");

    if (initEvent) els.eventSelect.value = initEvent;
    if (initDivision) els.divisionSelect.value = initDivision;

    function refresh() {
      const eventVal = els.eventSelect.value || "";
      const divVal = els.divisionSelect.value || "";
      const qVal = els.searchInput.value || "";

      setUrlParam("event", eventVal || "");
      setUrlParam("division", divVal || "");
      setUrlParam("q", qVal || "");

      const filtered = filterRows(allRows, eventVal, divVal, qVal);
      renderTable(els, allColumns, filtered, ctx);

      setStatus(`Showing ${filtered.length} result(s).`);
    }

    els.eventSelect.addEventListener("change", refresh);
    els.divisionSelect.addEventListener("change", refresh);
    els.searchInput.addEventListener("input", refresh);

    refresh();
  }

  window.DGSTViews["all-events"] = {
    init: () => init().catch((e) => {
      console.error(e);
      const status = document.getElementById("status");
      if (status) status.textContent = "Error loading results.";
    }),
  };
})();
