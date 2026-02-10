// /dgseries.com/_shared/index.js
(() => {
  "use strict";

  window.DGSTViews = window.DGSTViews || {};

  function esc(s) {
    return window.Common && window.Common.escapeHtml
      ? window.Common.escapeHtml(String(s ?? ""))
      : String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  function renderEventsTable(title, rows) {
    const safeTitle = esc(title);

    if (!rows || !rows.length) {
      return `
        <div class="events-section-title">${safeTitle}</div>
        <div class="empty">None.</div>
      `;
    }

    const body = rows.map(ev => {
      const short = esc(ev.shortLabel || "");
      const name  = esc(ev.pdgaName || "");
      const url   = esc(ev.pdgaUrl || "#");
      const date = esc(ev.dateText || "");
      return `
        <tr>
          <td class="col-short">${short}</td>
          <td class="col-date">${date}</td>
          <td class="col-name"><a href="${url}" target="_blank" rel="noopener noreferrer">${name}</a></td>
        </tr>
      `;
    }).join("");

    return `
      <div class="events-section-title">${safeTitle}</div>
      <table class="events-table">
        <thead>
          <tr>
            <th class="col-short">Short</th>
            <th class="col-date">Dates</th>
            <th class="col-name">PDGA Event</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `;
  }

  async function init() {
    // IMPORTANT: these must exist in the injected Home template
    const statusEl = document.getElementById("eventsStatus");
    const completedWrap = document.getElementById("eventsCompletedWrap");
    const upcomingWrap = document.getElementById("eventsUpcomingWrap");

    // If the template doesn't include these, fail gracefully and show a clear message.
    if (!statusEl || !completedWrap || !upcomingWrap) {
      const missing = [
        !statusEl ? "eventsStatus" : null,
        !completedWrap ? "eventsCompletedWrap" : null,
        !upcomingWrap ? "eventsUpcomingWrap" : null
      ].filter(Boolean).join(", ");

      // Try to at least show something somewhere.
      const fallback = document.getElementById("view") || document.body;
      const msg = `DGST Home view template is missing required element id(s): ${missing}`;
      console.error(msg);

      if (fallback) {
        const existing = document.getElementById("dgstTemplateError");
        if (!existing) {
          const div = document.createElement("div");
          div.id = "dgstTemplateError";
          div.style.padding = "12px";
          div.style.margin = "12px";
          div.style.border = "2px solid #c00";
          div.style.borderRadius = "10px";
          div.style.fontWeight = "700";
          div.textContent = msg;
          fallback.prepend(div);
        }
      }
      return;
    }

    const setStatus = (msg) => { statusEl.textContent = msg || ""; };

    setStatus("Discovering events from PDGA…");

    let ctx;
    try {
      ctx = await window.Common.getSeriesContext({ onStatus: setStatus, forceRefresh: false });
    } catch (e) {
      console.error("getSeriesContext failed:", e);
      setStatus("Unable to discover events (error during fetch/parsing).");
      completedWrap.innerHTML = `<div class="empty">Discovery failed. Check Console for details.</div>`;
      upcomingWrap.innerHTML = "";
      return;
    }

    const events = (ctx && ctx.events) ? ctx.events : [];
    if (!events.length) {
      setStatus("No events found for this seed search.");
      completedWrap.innerHTML = `<div class="empty">No events found.</div>`;
      upcomingWrap.innerHTML = "";
      return;
    }

    const completed = events.filter(e => !!e.isCompleted);
    const upcoming = events.filter(e => !e.isCompleted);

    setStatus(`${events.length} event(s) found.`);

    completedWrap.innerHTML = renderEventsTable("Completed", completed);
    upcomingWrap.innerHTML = renderEventsTable("Upcoming", upcoming);
  }

  window.DGSTViews.home = { init };
})();
