// /dgseries.com/_shared/index.js
(() => {
  "use strict";

  window.DGSTViews = window.DGSTViews || {};

  function esc(s) {
    return window.Common && window.Common.escapeHtml
      ? window.Common.escapeHtml(String(s ?? ""))
      : String(s ?? "").replace(/[&<>"']/g, c => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        }[c]));
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
      const name = esc(ev.pdgaName || "");
      const url  = esc(ev.pdgaUrl || "#");
      const date = esc(ev.dateText || "");
      return `
        <tr>
          <td class="col-date">${date}</td>
          <td class="col-name">
            <a href="${url}" target="_blank" rel="noopener noreferrer">${name}</a>
          </td>
        </tr>
      `;
    }).join("");

    return `
      <div class="events-section-title">${safeTitle}</div>
      <table class="events-table">
        <thead>
          <tr>
            <th class="col-date">Dates</th>
            <th class="col-name">PDGA Event</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `;
  }

  function updateRefreshStampUI() {
    try {
      const stamp = document.getElementById("pdgaRefreshStamp");
      if (!stamp) return;
      if (window.Common && typeof window.Common.getLastRefreshText === "function") {
        stamp.textContent = window.Common.getLastRefreshText();
      } else {
        stamp.textContent = "Last refresh: —";
      }
    } catch {}
  }

  async function init() {
    const statusEl = document.getElementById("eventsStatus");
    const completedWrap = document.getElementById("eventsCompletedWrap");
    const upcomingWrap = document.getElementById("eventsUpcomingWrap");

    if (!statusEl || !completedWrap || !upcomingWrap) {
      const missing = [
        !statusEl ? "eventsStatus" : null,
        !completedWrap ? "eventsCompletedWrap" : null,
        !upcomingWrap ? "eventsUpcomingWrap" : null
      ].filter(Boolean).join(", ");

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

    // Inject Refresh button + stamp on Home view (above the status line)
    (() => {
      try {
        if (document.getElementById("pdgaRefreshBtn")) return;

        const wrap = document.createElement("div");
        wrap.className = "home-refresh";
        wrap.innerHTML = `
          <button id="pdgaRefreshBtn" class="btn-refresh" type="button" title="Refresh PDGA data">
            Refresh PDGA Data
          </button>
          <div id="pdgaRefreshStamp" class="refresh-stamp" style="margin-top:6px; font-size: 0.95em; opacity: 0.85;"></div>
        `;

        statusEl.parentElement.insertBefore(wrap, statusEl);

        const btn = document.getElementById("pdgaRefreshBtn");
        if (btn) {
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            if (window.Common && typeof window.Common.triggerPdgaRefresh === "function") {
              window.Common.triggerPdgaRefresh();
            } else {
              const u = new URL(location.href);
              u.searchParams.set("force", "1");
              location.href = u.toString();
            }
          });
        }

        updateRefreshStampUI();

        // Live update if a refresh finalizes while this view is open.
        window.addEventListener("dgst:refresh-updated", () => updateRefreshStampUI());
      } catch (err) {
        console.warn("Unable to inject PDGA refresh button:", err);
      }
    })();

    const setStatus = (msg) => { statusEl.textContent = msg || ""; };

    setStatus("Discovering events from PDGA…");

    let ctx;
    try {
      ctx = await window.Common.getSeriesContext({
        onStatus: setStatus,
        forceRefresh: false
      });

      // Timestamp should represent LAST SUCCESSFUL PDGA fetch cycle.
      // For Home view, the "cycle" is successful seed discovery.
      // Timestamp should represent LAST SUCCESSFUL PDGA fetch cycle.
      // Do NOT finalize here — seed discovery alone is not a full refresh.
      // Finalize happens after results successfully load (loadAllEvents).
      updateRefreshStampUI();
    } catch (e) {
      console.error("getSeriesContext failed:", e);

      // If this page load was a forced refresh, the proxy will return real errors (incl 429).
      // We surface that clearly here; we DO NOT finalize a refresh timestamp.
      const msg = String(e && e.message ? e.message : e);
      if (msg.includes("(429)") || msg.toLowerCase().includes("429")) {
        setStatus("Refresh failed: PDGA rate-limited (429). Wait a bit and try again.");
      } else {
        setStatus("Refresh failed: unable to fetch PDGA data. See Console for details.");
      }

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
    const upcoming  = events.filter(e => !e.isCompleted);

    setStatus(`${events.length} event(s) found.`);

    completedWrap.innerHTML = renderEventsTable(`Completed (${completed.length} events)`, completed);
    upcomingWrap.innerHTML  = renderEventsTable(`Upcoming (${upcoming.length} events)`, upcoming);
    // Optional preload: warm results cache so other views don't refetch per-event.
    // This reduces repeated pulls when navigating to Standings / All Results / Player
    // in the same tab/session.
    try {
      if (window.Common && typeof window.Common.preloadAllEvents === "function") {
        window.Common.preloadAllEvents({ onStatus: setStatus }).catch((e) => {
          const msg = String(e && e.message ? e.message : e);
          if (msg.includes("(429)") || msg.toLowerCase().includes("429")) {
            setStatus("Preload failed: PDGA rate-limited (429). Wait a bit and try again.");
          } else {
            setStatus("Preload failed: unable to fetch PDGA results. See Console for details.");
          }
          console.error("Preload failed:", e);
        });
      }
    } catch (e) {
      console.warn("Preload hook failed:", e);
    }
  }

  window.DGSTViews.home = { init };
})();