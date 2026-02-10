// /dgseries.com/_shared/router.js
(() => {
  "use strict";

  const viewSlot = document.getElementById("view-slot");
  if (!viewSlot) {
    console.error("DGST shell missing #view-slot");
    return;
  }

  const ROUTES = {
    home: { template: "home.html", navKey: "home", viewKey: "home" },
    standings: { template: "standings.html", navKey: "standings", viewKey: "standings" },
    "all-events": { template: "all-events.html", navKey: "all-events", viewKey: "all-events" },
    player: { template: "player.html", navKey: "player", viewKey: "player" },
  };

  function normalizeHash() {
    const raw = String(location.hash || "").replace(/^#/, "");
    if (!raw) return "home";
    // allow legacy-ish forms like #all-events?x=y
    const key = raw.split("?")[0].trim();
    return ROUTES[key] ? key : "home";
  }

  async function loadTemplate(templateFile) {
    const base = window.Common?.SHARED_BASE_PATH || window.SITE_SHARED_BASE_PATH || "";
    const build = encodeURIComponent(window.Common?.BUILD || window.SITE_BUILD || "dev");
    const url = `${base}/views/${templateFile}?v=${build}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Template fetch failed (${res.status}) for ${url}`);
    return await res.text();
  }

  async function renderRoute() {
    const routeKey = normalizeHash();
    const route = ROUTES[routeKey];

    // Header/footer are shared and can be refreshed per-route to update active pill.
    await window.Common.loadHeader(route.navKey);
    await window.Common.loadFooter();

    // Swap view markup.
    viewSlot.innerHTML = "";
    const html = await loadTemplate(route.template);
    viewSlot.innerHTML = html;

    // Init view module.
    const views = window.DGSTViews || {};
    const mod = views[route.viewKey];
    if (!mod || typeof mod.init !== "function") {
      console.error(`Missing view module init for ${route.viewKey}`);
      return;
    }
    await mod.init();
  }

  function onHashChange() {
    renderRoute().catch((e) => {
      console.error(e);
      viewSlot.innerHTML = `
        <div class="page">
          <div class="card">
            <div class="empty">Error loading view.</div>
          </div>
        </div>
      `;
    });
  }

  window.addEventListener("hashchange", onHashChange);
  onHashChange();
})();
