let gardenPlansRaw = localStorage.getItem('gardenPlans');
let gardenPlans;
try {
    gardenPlans = JSON.parse(gardenPlansRaw);
    if (!gardenPlans || !gardenPlans.plans || !Array.isArray(gardenPlans.plans) || gardenPlans.plans.length === 0) {
        throw new Error('Invalid gardenPlans data');
    }
} catch (e) {
    console.warn('Invalid or missing gardenPlans in localStorage – resetting to default');
    gardenPlans = {
        plans: [{ id: 'main', name: 'Main Garden', entries: [] }],
        currentMyGarden: 'main',
        currentTimeline: 'main'
    };
    localStorage.setItem('gardenPlans', JSON.stringify(gardenPlans));
    try { window.gardenPlans = gardenPlans; } catch(e) {}
}
let currentPlanId = {
    mygarden: gardenPlans.currentMyGarden || 'main',
    timeline: gardenPlans.currentTimeline || 'main'
};
let cropData = {};
let progressData = JSON.parse(localStorage.getItem('cropProgress') || '{}');
let notesData = JSON.parse(localStorage.getItem('cropNotes') || '{}');
const methodOffsets = {
    outdoor: { pre: 0, post: 0 },
    rowcovers: { pre: 14, post: 21 },
    greenhouse: { pre: 35, post: 42 }
};
const cropSuccessionData = {
  lettuce:   { interval: 14, harvestWindow: 21, regrows: true },
  spinach:  { interval: 14, harvestWindow: 21, regrows: true },
  kale:     { interval: 21, harvestWindow: 30, regrows: true },
  basil:    { interval: 21, harvestWindow: 30, regrows: true },
  tomatoes: { interval: 30, harvestWindow: 30, regrows: false },
  peppers:  { interval: 30, harvestWindow: 30, regrows: false },
  carrots:  { interval: 14, harvestWindow: 7,  regrows: false },
  radish:   { interval: 10, harvestWindow: 5,  regrows: false }
};

// Helper: build a per-plan localStorage key based on the current My Garden plan
function perPlanKey(base) {
  try {
    const planId =
      (typeof currentPlanId !== "undefined" && currentPlanId.mygarden) ||
      (typeof gardenPlans !== "undefined" && gardenPlans.currentMyGarden) ||
      "global";

    return `${base}__${planId}`;
  } catch (e) {
    // Fallback if something is weird very early in startup
    return `${base}__global`;
  }
}


function showTab(tabId) {
  // Gate Pro-only tabs BEFORE changing UI state
  try {
    if (typeof window.pgRequire === "function") {
      if (tabId === "inventory" && !window.pgRequire("inventory", "Inventory is available in the Pro app (store version).")) return;
      if (tabId === "perpetual" && !window.pgRequire("perpetualPlanner", "Perpetual Planner is available in the Pro app (store version).")) return;
    }
  } catch (e) {}

  const target = document.getElementById(tabId);
  if (!target) return;

  document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
  target.classList.add("active");

  document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
  const tabBtn = document.querySelector(`.tabs button[onclick="showTab('${tabId}')"]`);
  if (tabBtn) tabBtn.classList.add("active");

  if (tabId === "calculator") {
    try { addAddButtons(); } catch (e) {}
    try { collectCropData(); } catch (e) {}
    try { updateTables(); } catch (e) {}
    try { updateMethodNote(); } catch (e) {}
    try { if (typeof refreshCalculatorPlanPicker === "function") refreshCalculatorPlanPicker(); } catch (e) {}
  }

  if (tabId === "mygarden") {
    try { loadMyGardenTab(); } catch (e) {}
  }

  if (tabId === "timeline") {
    // Keep Timeline in sync with the currently selected My Garden plan
    try {
      const activeId =
        (currentPlanId && currentPlanId.mygarden) ||
        (gardenPlans && gardenPlans.currentMyGarden) ||
        "main";
      currentPlanId.timeline = activeId;
      gardenPlans.currentTimeline = activeId;
      if (typeof savePlans === "function") savePlans();
    } catch (e) {}
    try { renderTimeline(); } catch (e) {}
  }

  if (tabId === "spacing") {
    try { populateSpacingCrops(); } catch (e) {}
    try { if (typeof restoreSpacingState === "function") restoreSpacingState(); } catch (e) {}
  }

  if (tabId === "perpetual") {
    try { if (typeof renderPerpetual === "function") renderPerpetual(); } catch (e) {}
  }

  if (tabId === "inventory") {
    try { if (typeof renderInventoryPlanTabs === "function") renderInventoryPlanTabs(); } catch (e) {}
    try { if (typeof getInventory === "function") window.inventoryData = getInventory(); } catch (e) {}
    try { if (typeof window.renderInventoryTable === "function") window.renderInventoryTable(); } catch (e) {}
  }

  if (tabId === "layout") {
    try { if (typeof renderLayoutPlanTabs === "function") renderLayoutPlanTabs(); } catch (e) {}
    try {
      if (window.Layout && typeof window.Layout.init === "function") {
        window.Layout.init();
      } else if (window.Layout && typeof window.Layout.render === "function") {
        window.Layout.render();
      }
    } catch (e) {}
  }
}


function sortTable(n, th) {
    const table = th.closest('table');
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.rows).filter(r => !r.classList.contains('section'));
    const ascending = !th.classList.contains('asc');
    rows.sort((a, b) => {
        let x = a.cells[n].textContent.trim();
        let y = b.cells[n].textContent.trim();
        if (!isNaN(parseFloat(x)) && !isNaN(parseFloat(y))) {
            x = parseFloat(x);
            y = parseFloat(y);
        }
        return ascending ? (x > y ? 1 : -1) : (x < y ? 1 : -1);
    });
    rows.forEach(r => tbody.appendChild(r));
    table.querySelectorAll('th').forEach(t => { t.classList.remove('asc', 'desc'); });
    th.classList.add(ascending ? 'asc' : 'desc');
}

function addAddButtons() {
    document.querySelectorAll('table tbody tr:not(.section)').forEach(row => {
        const crop = row.cells[0].textContent.trim();
        if (crop && !row.querySelector('.add-btn')) {
            const btn = document.createElement('td');
            btn.innerHTML = `<button class="add-btn" onclick="addToGarden('${crop}')">+ Add</button>`;
            row.insertBefore(btn, row.cells[0]);
        }
    });
}

        function collectCropData() {
            cropData = {};
            const tableIds = ['springAllTable', 'springVegetablesTable', 'springFruitsTable', 'springHerbsTable', 'springFlowersTable', 'fallAllTable', 'fallVegetablesTable', 'fallHerbsTable', 'fallFlowersTable'];
            tableIds.forEach(id => {
                const table = document.getElementById(id);
                if (!table) return;
                table.querySelectorAll('tbody tr:not(.section)').forEach(row => {
                    const offset = row.querySelector('.add-btn') ? 1 : 0;
                    const crop = row.cells[0 + offset].textContent.trim();
                    if (crop) {
                        cropData[crop] = {
                            weeks: row.cells[1 + offset].textContent.trim(),
                            soilTemp: row.cells[2 + offset].textContent.trim(),
                            maturity: row.cells[3 + offset].textContent.trim(),
                            succession: row.cells[4 + offset].textContent.trim(),
                            companions: row.cells[5 + offset].textContent.trim(),
                            timing: row.cells[7 + offset].textContent.trim()

                        };
                    }
                });
            });
        }
      

function getAdjustedReference(ref) {
    const method = getCurrentMethod();
    if (method === 'rowcovers') return addDays(ref, -14);
    if (method === 'greenhouse') return addDays(ref, -28);
    return ref;
}

function getCurrentMethod() {
    return document.getElementById('growingMethod').value;
}

function getCurrentSeason() {
    return document.getElementById('season').value;
}

function savePlans() {
    localStorage.setItem('gardenPlans', JSON.stringify(gardenPlans));
    try { window.gardenPlans = gardenPlans; } catch(e) {}
    try { window.dispatchEvent(new Event('pg:gardenPlansChanged')); } catch(e) {}
}

function addNewPlan(tab) {
    // Monetization gate: Free = 1 plan
    try {
        if (typeof window.pgLimit === "function") {
            const maxPlans = window.pgLimit("maxPlans");
            const planCount = (gardenPlans && Array.isArray(gardenPlans.plans)) ? gardenPlans.plans.length : 0;
            if (Number.isFinite(maxPlans) && planCount >= maxPlans) {
                alert(`Free version allows up to ${maxPlans} plan${maxPlans === 1 ? "" : "s"}. Pro removes this limit (store version).`);
                return;
            }
        }
    } catch (e) {}

    // Grab the value from your custom input field
    const nameInput = document.getElementById('newPlanName'); // Change ID if yours is different
    const name = nameInput ? nameInput.value.trim() : '';

    if (!name) {
        alert('Please enter a plan name!');
        return;
    }

    const newPlan = {
        id: Date.now().toString(),
        name: name,
        entries: []
    };

    gardenPlans.plans.push(newPlan);
    currentPlanId[tab] = newPlan.id;

    // Clear the input field after adding
    if (nameInput) nameInput.value = '';

    savePlans();
    renderPlanTabs('mygarden');
    renderPlanTabs('timeline');
    if (tab === 'mygarden') loadMyGardenTab();
    else renderTimeline();
}

function deleteCurrentPlan(tab) {
    const plan = getCurrentPlan(tab);
    if (confirm(`Delete plan "${plan.name}" and all its plantings? This cannot be undone.`)) {
        gardenPlans.plans = gardenPlans.plans.filter(p => p.id !== plan.id);
        currentPlanId[tab] = gardenPlans.plans[0]?.id || 'main';
        savePlans();
        renderPlanTabs('mygarden');
        renderPlanTabs('timeline');
        if (tab === 'mygarden') loadMyGardenTab();
        else renderTimeline();
    }
}
function clearAllPlans() {
    const msg =
        'This will delete ALL plans and ALL plantings across the app (My Garden, Timeline, Perpetual, Inventory per-plan data).\n\n' +
        'This cannot be undone. Continue?';
    if (!confirm(msg)) return;

    // Capture existing plan IDs (so we can purge plan-scoped storage keys like "inventoryData__<planId>")
    const oldPlanIds = (gardenPlans && Array.isArray(gardenPlans.plans) ? gardenPlans.plans.map(p => p.id) : [])
        .filter(Boolean);

    // Purge any localStorage keys that follow the "__<planId>" convention (used by perPlanKey()).
    try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k) keys.push(k);
        }

        oldPlanIds.forEach(pid => {
            const suffix = `__${pid}`;
            keys.forEach(k => {
                if (k.endsWith(suffix)) {
                    localStorage.removeItem(k);
                }
            });
        });
    } catch (e) {
        console.warn('Failed clearing plan-scoped storage keys', e);
    }

    // Reset plans to a clean default
    gardenPlans = {
        plans: [{ id: 'main', name: 'Main Garden', entries: [] }],
        currentMyGarden: 'main',
        currentTimeline: 'main'
    };
    try { window.gardenPlans = gardenPlans; } catch (e) {}

    // Reset active plan pointers
    if (typeof currentPlanId !== 'object' || !currentPlanId) currentPlanId = {};
    currentPlanId.mygarden = 'main';
    currentPlanId.timeline = 'main';

    // Clear global progress + notes (these are keyed by entry.id)
    progressData = {};
    notesData = {};
    try { localStorage.setItem('cropProgress', JSON.stringify(progressData)); } catch (e) {}
    try { localStorage.setItem('cropNotes', JSON.stringify(notesData)); } catch (e) {}

    // Persist the new clean plan state
    savePlans();

    // Refresh plan-aware UI components
    try { renderPlanTabs('mygarden'); } catch (e) {}
    try { renderPlanTabs('timeline'); } catch (e) {}
    try { renderPlanTabs('perpetual'); } catch (e) {}
    if (typeof renderLayoutPlanTabs === 'function') { try { renderLayoutPlanTabs(); } catch (e) {} }
    if (typeof renderInventoryPlanTabs === 'function') { try { renderInventoryPlanTabs(); } catch (e) {} }
    if (typeof refreshCalculatorPlanPicker === 'function') { try { refreshCalculatorPlanPicker(); } catch (e) {} }
    if (typeof refreshInventoryPlanPicker === 'function') { try { refreshInventoryPlanPicker(); } catch (e) {} }

    // Refresh views
    if (typeof loadMyGardenTab === 'function') loadMyGardenTab();
    if (typeof renderTimeline === 'function') renderTimeline();
    if (typeof renderPerpetual === 'function') renderPerpetual();

    // Inventory: reset in-memory + redraw (getInventory() reads from per-plan keys, so it will now return [])
    try {
        if (typeof getInventory === 'function') {
            window.inventoryData = getInventory();
        } else {
            window.inventoryData = [];
        }
        if (typeof window.renderInventoryTable === 'function') window.renderInventoryTable();
    } catch (e) {
        console.warn('Inventory refresh failed after clearAllPlans()', e);
    }

    // Layout: if the layout module is loaded, re-init for the default plan
    try {
        if (window.Layout && typeof window.Layout.init === 'function') {
            window.Layout.init();
        } else if (window.Layout && typeof window.Layout.render === 'function') {
            window.Layout.render();
        }
    } catch (e) {
        console.warn('Layout refresh failed after clearAllPlans()', e);
    }
}


function getCurrentPlan(tabId) {
    let plan = gardenPlans.plans.find(p => p.id === currentPlanId[tabId]);
    if (!plan) {
        plan = gardenPlans.plans[0]; // Fallback
        if (!plan) {
            plan = { id: 'main', name: 'Main Garden', entries: [] };
            gardenPlans.plans.push(plan);
            currentPlanId[tabId] = 'main';
            savePlans();
        }
    }
    return plan;
}

function getCurrentEntries(tabId) {
    const plan = getCurrentPlan(tabId);
    return plan ? plan.entries : [];
}

function movePlan(tab, index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= gardenPlans.plans.length) return;

  const temp = gardenPlans.plans[index];
  gardenPlans.plans[index] = gardenPlans.plans[newIndex];
  gardenPlans.plans[newIndex] = temp;

  savePlans();
  renderPlanTabs('mygarden');
  renderPlanTabs('timeline');
  renderPlanTabs('perpetual'); // keep perpetual selector in sync too
}


function renderPlanTabs(tab) {
  // Decide which DOM container to draw into,
  // and which currentPlanId key this view should follow.
  let containerId;
  let keyForCurrent;

  if (tab === 'mygarden') {
    containerId = 'myGardenPlanTabs';
    keyForCurrent = 'mygarden';
  } else if (tab === 'timeline') {
    containerId = 'timelinePlanTabs';
    keyForCurrent = 'timeline';
  } else if (tab === 'perpetual') {
    containerId = 'perpetualPlanTabs';
    // Perpetual planner is tied to the same "current plan" as My Garden:
    keyForCurrent = 'mygarden';
  } else {
    return; // unknown tab
  }

  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  gardenPlans.plans.forEach((plan, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'plan-tab-wrapper';

    const upBtn = document.createElement('button');
    upBtn.className = 'reorder-btn';
    upBtn.textContent = '↑';
    upBtn.disabled = index === 0;
    // Plans array is shared, so we always move inside that same array
    upBtn.onclick = () => movePlan('mygarden', index, -1);

    const downBtn = document.createElement('button');
    downBtn.className = 'reorder-btn';
    downBtn.textContent = '↓';
    downBtn.disabled = index === gardenPlans.plans.length - 1;
    downBtn.onclick = () => movePlan('mygarden', index, 1);

    const tabBtn = document.createElement('div');
    tabBtn.className = 'plan-tab';
    tabBtn.textContent = plan.name;

    if (plan.id === currentPlanId[keyForCurrent]) {
      tabBtn.classList.add('active');
    }

    tabBtn.onclick = () => {
      // Update whichever "current" this view is using
      currentPlanId[keyForCurrent] = plan.id;

      // Keep all major tabs aligned to the same active plan to prevent cross-tab editing errors
      if (keyForCurrent === 'mygarden') {
        gardenPlans.currentMyGarden = plan.id;

        // Mirror into Timeline so switching tabs never shows a different plan
        currentPlanId.timeline = plan.id;
        gardenPlans.currentTimeline = plan.id;
      } else if (keyForCurrent === 'timeline') {
        gardenPlans.currentTimeline = plan.id;

        // Mirror into My Garden (and therefore calculator/perpetual/layout/inventory plan context)
        currentPlanId.mygarden = plan.id;
        gardenPlans.currentMyGarden = plan.id;
      }

      savePlans();

      // Redraw tabs for the main planning views
      renderPlanTabs('mygarden');
      renderPlanTabs('timeline');
      renderPlanTabs('perpetual');

      // Keep other plan-based tab strips in sync too (if present)
      if (typeof renderLayoutPlanTabs === 'function') renderLayoutPlanTabs();
      if (typeof renderInventoryPlanTabs === 'function') renderInventoryPlanTabs();

      // Refresh the views that depend on the current plan
      if (typeof loadMyGardenTab === 'function') loadMyGardenTab();
      if (typeof renderTimeline === 'function') renderTimeline();
      if (typeof renderPerpetual === 'function') renderPerpetual();
    };


    wrapper.appendChild(upBtn);
    wrapper.appendChild(tabBtn);
    wrapper.appendChild(downBtn);
    container.appendChild(wrapper);
  });
}

function renderLayoutPlanTabs() {
  // Safety: no plans yet
  if (!window.gardenPlans || !Array.isArray(gardenPlans.plans)) return;
  if (!window.currentPlanId) window.currentPlanId = {};

  const container = document.getElementById('layoutPlanTabs');
  if (!container) return;

  container.innerHTML = '';

  gardenPlans.plans.forEach((plan) => {
    const btn = document.createElement('div');
    btn.className = 'plan-tab';
    btn.textContent = plan.name;

    // Layout follows the same "current" as My Garden
    const activeId = currentPlanId.mygarden || gardenPlans.currentMyGarden;
    if (plan.id === activeId) {
      btn.classList.add('active');
    }

    btn.onclick = () => {
      // Move the active My Garden plan to this one
      currentPlanId.mygarden = plan.id;
      gardenPlans.currentMyGarden = plan.id;
      if (typeof savePlans === 'function') savePlans();

      // Keep other bars in sync
      renderPlanTabs('mygarden');
      renderPlanTabs('timeline');
      renderLayoutPlanTabs();

      // Refresh views that depend on current plan
      if (typeof loadMyGardenTab === 'function') loadMyGardenTab();
      if (typeof renderTimeline === 'function') renderTimeline();
      if (window.Layout && typeof Layout.render === 'function') {
        Layout.render();
      }
    };

    container.appendChild(btn);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  updateReferenceLabel();
  renderPlanTabs('mygarden');
  renderPlanTabs('timeline');
  renderLayoutPlanTabs();
  addAddButtons();
  collectCropData();
  updateTables();
  updateMethodNote();
  loadCalculatorDate();
  loadMyGardenTab();
  window.renderInventoryTable();

  bindSpacingModeToggle();
});

/* ================= SHARE PLAN =================
   The Share Plan button supports:
   A) Sharing the deployed app URL (not localhost)
   B) When running locally, prefer a configured production URL
   C) Sharing the active plan data as a JSON export file (best)
   ------------------------------------------------
   Configure your production URL (optional):
     - window.PG_PROD_URL = "https://yourdomain.com"   (preferred), OR
     - localStorage.setItem("pgProductionUrl", "https://yourdomain.com")
   ================================================= */

const PG_DEFAULT_PROD_URL = "https://perpetualgenesis.app";

function pgIsLocalHost() {
  try {
    const h = String(location.hostname || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0";
  } catch (e) {
    return false;
  }
}

function pgGetProductionUrl() {
  try {
    if (typeof window.PG_PROD_URL === "string" && window.PG_PROD_URL.trim()) return window.PG_PROD_URL.trim();
  } catch (e) {}
  try {
    const v = localStorage.getItem("pgProductionUrl");
    if (v && v.trim()) return v.trim();
  } catch (e) {}
  return PG_DEFAULT_PROD_URL;
}

function pgGetShareBaseUrl() {
  try {
    if (pgIsLocalHost()) return pgGetProductionUrl();
    return location.origin;
  } catch (e) {
    return "";
  }
}

function pgGetActivePlanIdForShare() {
  try {
    if (typeof currentPlanId !== "undefined" && currentPlanId && currentPlanId.mygarden) return String(currentPlanId.mygarden);
  } catch (e) {}
  try {
    if (typeof gardenPlans !== "undefined" && gardenPlans && gardenPlans.currentMyGarden) return String(gardenPlans.currentMyGarden);
  } catch (e) {}
  return "main";
}

function pgFindPlanById(planId) {
  try {
    if (typeof gardenPlans !== "undefined" && gardenPlans && Array.isArray(gardenPlans.plans)) {
      return gardenPlans.plans.find(p => String(p.id) === String(planId));
    }
  } catch (e) {}
  // Fallback from localStorage if needed
  try {
    const raw = localStorage.getItem("gardenPlans");
    if (raw) {
      const gp = JSON.parse(raw);
      if (gp && Array.isArray(gp.plans)) return gp.plans.find(p => String(p.id) === String(planId));
    }
  } catch (e) {}
  return null;
}

function pgCollectPerPlanStorage(planId) {
  const out = {};
  const suffix = "__" + String(planId);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (String(k).endsWith(suffix)) {
        out[k] = localStorage.getItem(k);
      }
    }
  } catch (e) {}
  return out;
}

function pgBuildPlanExportPayload(planId) {
  const plan = pgFindPlanById(planId);
  if (!plan) return null;

  const entries = Array.isArray(plan.entries) ? plan.entries.slice() : [];

  // Include only progress/notes relevant to this plan's entries
  const progress = {};
  const notes = {};
  try {
    entries.forEach(e => {
      if (!e || !e.id) return;
      const id = String(e.id);
      if (typeof progressData !== "undefined" && progressData && progressData[id]) progress[id] = progressData[id];
      if (typeof notesData !== "undefined" && notesData && typeof notesData[id] !== "undefined") notes[id] = notesData[id];
    });
  } catch (e) {}

  // Include inventory for this plan if available
  let inventory = null;
  let inventoryTransactions = null;
  try { if (typeof getInventory === "function") inventory = getInventory(); } catch (e) {}
  try { if (typeof getTransactions === "function") inventoryTransactions = getTransactions(); } catch (e) {}

  // Include any other plan-scoped keys (layout, spacing, etc.) that use __<planId> suffix
  const perPlanStorage = pgCollectPerPlanStorage(planId);

  return {
    app: "PerpetualGenesis",
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    shareBaseUrl: pgGetShareBaseUrl(),
    plan: {
      id: String(plan.id),
      name: plan.name || String(plan.id),
      entries
    },
    progress,
    notes,
    inventory,
    inventoryTransactions,
    perPlanStorage
  };
}

function pgSanitizeFilename(s) {
  return String(s || "plan")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 64) || "plan";
}

function pgDownloadText(filename, text, mime) {
  try {
    const blob = new Blob([text], { type: mime || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    return true;
  } catch (e) {
    return false;
  }
}


// Build a human-friendly printable view (for Save as PDF / Print).
function pgEscapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pgNormalizeDateStr(v) {
  if (!v) return "";
  const s = String(v);
  // Common case: ISO timestamps -> YYYY-MM-DD
  const iso = s.match(/^\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  return s;
}


// ───────────────────────────────────────────────────────────────
// Printable view: include calculated dates (Start Indoors / Transplant / Harvest)
// Uses per-entry metadata when present (season/method/referenceDate), otherwise falls back
// to the app's calculateCropDates() for entries that don't have frost-method metadata.
// ───────────────────────────────────────────────────────────────

function pgEnsureCropDataLoaded() {
  try {
    if (typeof cropData === "object" && cropData && Object.keys(cropData).length > 0) return;
  } catch (e) {}
  try { if (typeof collectCropData === "function") collectCropData(); } catch (e) {}
}

function pgParseDateAny(str) {
  if (!str) return null;
  const s = String(str).trim();
  try {
    if (typeof parseDate === "function") {
      const d = parseDate(s);
      if (d && !isNaN(+d)) return d;
    }
  } catch (e) {}
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return isNaN(+d) ? null : d;
  }
  const mdY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdY) {
    const d = new Date(Number(mdY[3]), Number(mdY[1]) - 1, Number(mdY[2]));
    return isNaN(+d) ? null : d;
  }
  const d = new Date(s);
  return isNaN(+d) ? null : d;
}

function pgFormatDateAny(d) {
  if (!d) return "";
  try {
    if (typeof formatDate === "function") return formatDate(d);
  } catch (e) {}
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(+dt)) return "";
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  const yy = String(dt.getFullYear());
  return `${mm}/${dd}/${yy}`;
}

function pgAddDaysAny(d, days) {
  if (!d && d !== 0) return null;
  const dt = (d instanceof Date) ? new Date(+d) : new Date(d);
  if (isNaN(+dt)) return null;
  dt.setDate(dt.getDate() + (Number(days) || 0));
  return dt;
}

function pgRangeStr(d1, d2) {
  if (!d1 || !d2) return "";
  const a = +d1, b = +d2;
  const lo = a <= b ? d1 : d2;
  const hi = a <= b ? d2 : d1;
  const s1 = pgFormatDateAny(lo);
  const s2 = pgFormatDateAny(hi);
  if (!s1 && !s2) return "";
  return s1 === s2 ? s1 : `${s1}–${s2}`;
}

function pgParseNumRange(str) {
  const s = String(str || "").toLowerCase().replace(/–/g, "-");
  // "4-6" / "4 to 6" / "4"
  let m = s.match(/(\d+)\s*(?:-|to)\s*(\d+)/);
  if (m) return { min: Number(m[1]), max: Number(m[2]), ok: true };
  m = s.match(/(\d+)/);
  if (m) {
    const n = Number(m[1]);
    return { min: n, max: n, ok: true };
  }
  return { min: 0, max: 0, ok: false };
}

function pgParseTimingWeeks(timingStr) {
  const s = String(timingStr || "").trim();
  const sl = s.toLowerCase();
  if (!sl) return { min: 0, max: 0, after: false, ok: false };

  // Common text-only variants
  if (sl.includes("frost-free")) return { min: 0, max: 0, after: true, ok: true };
  if (sl.includes("on frost") || sl.includes("at frost")) return { min: 0, max: 0, after: true, ok: true };

  const after = /after|later|post/.test(sl);
  const before = /before|earlier|pre/.test(sl);
  const rng = pgParseNumRange(sl);
  const aft = after ? true : before ? false : false; // default to "before" when unclear
  return { min: rng.min, max: rng.max, after: aft, ok: rng.ok };
}

function pgParseWeeksRange(weeksStr) {
  const s = String(weeksStr || "").trim();
  const sl = s.toLowerCase();
  if (!sl) return { min: 0, max: 0, ok: false, direct: false };
  if (sl.includes("direct")) return { min: 0, max: 0, ok: true, direct: true };
  const rng = pgParseNumRange(sl);
  return { min: rng.min, max: rng.max, ok: rng.ok, direct: rng.min === 0 && rng.max === 0 };
}

function pgParseMaturityDays(maturityStr) {
  const s = String(maturityStr || "").trim();
  const sl = s.toLowerCase();
  if (!sl) return { min: 0, max: 0, ok: false, raw: s };
  if (sl.includes("year")) return { min: 0, max: 0, ok: false, raw: s };
  const rng = pgParseNumRange(sl);
  // Guard: absurdly large day counts likely mean "years" or unknown text
  if (rng.ok && (rng.max > 400)) return { min: 0, max: 0, ok: false, raw: s };
  return { min: rng.min, max: rng.max, ok: rng.ok, raw: s };
}

function pgAdjustReferenceForMethod(refDate, method) {
  const m = String(method || "").toLowerCase();
  if (m === "rowcovers" || m.includes("row")) return pgAddDaysAny(refDate, -14);
  if (m === "greenhouse" || m.includes("green")) return pgAddDaysAny(refDate, -28);
  return refDate;
}

function pgComputePlannedDatesFromFrostEntry(entry) {
  const crop = entry?.crop || "";
  if (!crop) return { start: "", transplant: "", harvest: "" };

  pgEnsureCropDataLoaded();
  const data = (typeof cropData === "object" && cropData) ? cropData[crop] : null;
  if (!data) return { start: "", transplant: "", harvest: "" };

  const refDate = pgParseDateAny(entry?.referenceDate);
  if (!refDate) return { start: "", transplant: "", harvest: "" };

  const adjusted = pgAdjustReferenceForMethod(refDate, entry?.method);
  const timing = pgParseTimingWeeks(data?.timing);
  if (!timing.ok) return { start: "", transplant: "", harvest: "" };

  const sign = timing.after ? 1 : -1;
  const transFrom = pgAddDaysAny(adjusted, timing.min * 7 * sign);
  const transTo = pgAddDaysAny(adjusted, timing.max * 7 * sign);
  const transplant = pgRangeStr(transFrom, transTo);

  const weeks = pgParseWeeksRange(data?.weeks);
  let start = "";
  if (weeks.direct || (weeks.min === 0 && weeks.max === 0)) {
    start = "Direct sow/plant";
  } else {
    const startFrom = pgAddDaysAny(transFrom, -weeks.max * 7);
    const startTo = pgAddDaysAny(transTo, -weeks.min * 7);
    start = pgRangeStr(startFrom, startTo);
  }

  const mat = pgParseMaturityDays(data?.maturity);
  let harvest = "";
  if (!mat.ok || (mat.min === 0 && mat.max === 0)) {
    harvest = String(data?.maturity || "");
  } else {
    const hFrom = pgAddDaysAny(transFrom, mat.min);
    const hTo = pgAddDaysAny(transTo, mat.max);
    harvest = pgRangeStr(hFrom, hTo);
  }

  return { start, transplant, harvest };
}

function pgComputePlannedDates(entry) {
  const crop = entry?.crop || "";
  const date = pgParseDateAny(entry?.referenceDate);
  const source = String(entry?.source || "").toLowerCase();
  const hasFrostMeta = !!(entry?.season || entry?.method);

  // If the entry does NOT look like a frost-based calculator entry (e.g., perpetual),
  // prefer the app's own helper if available.
  if ((source === "perpetual" || !hasFrostMeta) && typeof calculateCropDates === "function" && date) {
    try {
      const d = calculateCropDates(crop, date) || {};
      return {
        start: String(d.start || ""),
        transplant: String(d.transplant || ""),
        harvest: String(d.harvest || "")
      };
    } catch (e) {}
  }

  // Frost-based calculation (matches calculator table logic)
  const frost = pgComputePlannedDatesFromFrostEntry(entry);
  if (frost.start || frost.transplant || frost.harvest) return frost;

  // Final fallback
  if (typeof calculateCropDates === "function" && date) {
    try {
      const d = calculateCropDates(crop, date) || {};
      return {
        start: String(d.start || ""),
        transplant: String(d.transplant || ""),
        harvest: String(d.harvest || "")
      };
    } catch (e) {}
  }

  return { start: "", transplant: "", harvest: "" };
}


function pgBuildPrintableHtml(payload) {
  const planName = payload?.plan?.name || "Plan";
  const exportedAt = pgNormalizeDateStr(payload?.exportedAt);
  const baseUrl = payload?.shareBaseUrl || "";
  const entries = Array.isArray(payload?.plan?.entries) ? payload.plan.entries : [];
  const progress = payload?.progress || {};
  const notes = payload?.notes || {};
  const inventory = Array.isArray(payload?.inventory) ? payload.inventory : [];

  const rows = entries.map((e, idx) => {
    const crop = e?.crop || "";
    const season = e?.season || "";
    const method = e?.method || "";
    const ref = pgNormalizeDateStr(e?.referenceDate);
    const added = pgNormalizeDateStr(e?.addedDate);
    const planned = pgComputePlannedDates(e);
    const plannedStart = planned?.start || "";
    const plannedTransplant = planned?.transplant || "";
    const plannedHarvest = planned?.harvest || "";
    const pr = (e?.id && progress[String(e.id)]) ? progress[String(e.id)] : {};
    const started = pr?.started ? (pr?.startedDate || "✓") : "";
    const transplanted = pr?.transplanted ? (pr?.transplantedDate || "✓") : "";
    const harvested = pr?.harvested ? (pr?.harvestedDate || "✓") : "";
    const note = (e?.id && typeof notes[String(e.id)] !== "undefined") ? String(notes[String(e.id)] || "") : "";
    const noteShort = note.length > 80 ? note.slice(0, 77) + "…" : note;

    return `
      <tr>
        <td>${idx + 1}</td>
        <td>${pgEscapeHtml(crop)}</td>
        <td>${pgEscapeHtml(season)}</td>
        <td>${pgEscapeHtml(method)}</td>
        <td>${pgEscapeHtml(ref)}</td>
        <td>${pgEscapeHtml(added)}</td>
        <td>${pgEscapeHtml(plannedStart)}</td>
        <td>${pgEscapeHtml(plannedTransplant)}</td>
        <td>${pgEscapeHtml(plannedHarvest)}</td>
        <td>${pgEscapeHtml(started)}</td>
        <td>${pgEscapeHtml(transplanted)}</td>
        <td>${pgEscapeHtml(harvested)}</td>
        <td>${pgEscapeHtml(noteShort)}</td>
      </tr>
    `;
  }).join("");

  const invRows = inventory.map((it) => {
    return `
      <tr>
        <td>${pgEscapeHtml(it?.category || "")}</td>
        <td>${pgEscapeHtml(it?.name || "")}</td>
        <td>${pgEscapeHtml(it?.brand || "")}</td>
        <td style="text-align:right">${pgEscapeHtml(it?.currentQuantity ?? "")}</td>
        <td>${pgEscapeHtml(it?.unit || "")}</td>
        <td>${pgEscapeHtml(pgNormalizeDateStr(it?.useByDate))}</td>
        <td>${pgEscapeHtml(String(it?.notes || "").slice(0, 80))}</td>
      </tr>
    `;
  }).join("");

  const invSection = inventory.length ? `
    <h2>Inventory (Plan)</h2>
    <table>
      <thead>
        <tr>
          <th>Category</th><th>Name</th><th>Brand</th><th>Qty</th><th>Unit</th><th>Use-By</th><th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${invRows}
      </tbody>
    </table>
  ` : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${pgEscapeHtml("Perpetual Genesis — " + planName)}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; padding: 24px; background: #ffffff; color: #111; }
    .topbar { display:flex; gap:12px; align-items:center; justify-content:space-between; margin-bottom: 14px; }
    .brand { font-weight: 900; letter-spacing: 0.2px; }
    .meta { font-size: 12px; color: #444; }
    .actions { display:flex; gap:10px; }
    .btn { border: 1px solid #0aa; background: #0ee; color: #001; padding: 10px 12px; border-radius: 10px; font-weight: 800; cursor:pointer; }
    .btn.secondary { background:#fff; color:#033; border-color:#088; }
    h1 { margin: 12px 0 4px; font-size: 22px; }
    h2 { margin: 20px 0 8px; font-size: 16px; }
    p { margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
    th, td { border: 1px solid #ddd; padding: 8px; font-size: 11px; vertical-align: top; word-break: break-word; }
    th { background: #f3f7f7; text-align:left; }
    .small { font-size: 11px; color:#555; }
    @media print {
      .actions { display:none; }
      body { padding: 0; }
      th { background: #f3f7f7 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div>
      <div class="brand">Perpetual Genesis</div>
      <div class="meta">Plan: <strong>${pgEscapeHtml(planName)}</strong>${exportedAt ? ` • Exported: ${pgEscapeHtml(exportedAt)}` : ""}${baseUrl ? ` • App: ${pgEscapeHtml(baseUrl)}` : ""}</div>
    </div>
    <div class="actions">
      <button class="btn" onclick="window.print()">Print / Save as PDF</button>
      <button class="btn secondary" onclick="window.close()">Close</button>
    </div>
  </div>

  <h1>${pgEscapeHtml(planName)}</h1>
  <p class="small"> Current Plans calculated dates. For importing into the app, use the “backup” export file.</p>

  <h2>Plantings</h2>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Crop</th><th>Season</th><th>Method</th><th>Reference</th><th>Added</th><th>Planned Start</th><th>Planned Transplant</th><th>Planned Harvest</th><th>Started</th><th>Transplanted</th><th>Harvested</th><th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="13">No plantings in this plan.</td></tr>`}
    </tbody>
  </table>

  ${invSection}

  <p class="small" style="margin-top:18px;">Tip: In the print dialog, choose “Save as PDF” to create a shareable PDF.</p>
</body>
</html>`;
}

function pgOpenPrintView(payload) {
  // Monetization gate: printing is Pro-only on web
  try {
    if (typeof window.pgRequire === "function") {
      if (!window.pgRequire("exportPrint", "Printing / Save as PDF is available in the Pro app (store version).")) return false;
    }
  } catch (e) {}

  try {
    const html = pgBuildPrintableHtml(payload);
    const w = window.open("", "_blank");
    if (!w) {
      alert("Popup blocked. Allow popups to open the printable view.");
      return false;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    return true;
  } catch (e) {
    alert("Could not open print view.");
    return false;
  }
}


function pgCloseShareDialog() {
  const el = document.getElementById("pgShareOverlay");
  if (el) el.remove();
}

function pgOpenShareDialog({ planName, baseUrl, filename, json, payload, canFileShare }) {
  pgCloseShareDialog();

  const overlay = document.createElement("div");
  overlay.id = "pgShareOverlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.72)";
  overlay.style.zIndex = "9999";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.padding = "16px";

  const panel = document.createElement("div");
  panel.style.width = "min(720px, 100%)";
  panel.style.background = "rgba(10,10,10,0.98)";
  panel.style.border = "1px solid rgba(0,238,255,0.55)";
  panel.style.borderRadius = "16px";
  panel.style.boxShadow = "0 0 24px rgba(0,238,255,0.15)";
  panel.style.padding = "16px";

  const h = document.createElement("div");
  h.textContent = "Share / Export Plan";
  h.style.fontSize = "18px";
  h.style.fontWeight = "800";
  h.style.color = "var(--primary)";
  h.style.marginBottom = "6px";

  const p = document.createElement("div");
  p.textContent = "Your plan data is stored locally in this browser. Sharing a link shares the app, not your saved plan. Use Print/PDF for a readable share, or Backup for importing into the app.";
  p.style.fontSize = "13px";
  p.style.opacity = "0.9";
  p.style.marginBottom = "12px";

  const linkLabel = document.createElement("div");
  linkLabel.textContent = "App link";
  linkLabel.style.fontSize = "12px";
  linkLabel.style.opacity = "0.85";
  linkLabel.style.marginBottom = "6px";

  const linkBox = document.createElement("input");
  linkBox.type = "text";
  linkBox.value = baseUrl;
  linkBox.readOnly = true;
  linkBox.style.width = "100%";
  linkBox.style.padding = "10px 12px";
  linkBox.style.borderRadius = "12px";
  linkBox.style.border = "1px solid rgba(0,238,255,0.45)";
  linkBox.style.background = "rgba(0,0,0,0.35)";
  linkBox.style.color = "white";
  linkBox.style.outline = "none";

  const btnRow = document.createElement("div");
  btnRow.style.display = "flex";
  btnRow.style.flexWrap = "wrap";
  btnRow.style.gap = "10px";
  btnRow.style.marginTop = "14px";

  const mkBtn = (label, onClick, variant) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.padding = "10px 14px";
    b.style.borderRadius = "12px";
    b.style.cursor = "pointer";
    b.style.border = "1px solid rgba(0,238,255,0.6)";
    b.style.background = variant === "primary" ? "var(--primary)" : "#003333";
    b.style.color = variant === "primary" ? "black" : "white";
    b.style.fontWeight = "700";
    b.style.boxShadow = variant === "primary" ? "0 0 16px rgba(0,238,255,0.35)" : "none";
    b.addEventListener("click", onClick);
    return b;
  };


  // Hidden file input for importing a plan export (no permissions required)
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = ".pgplan,.json,application/json,application/octet-stream";
  importInput.style.display = "none";
  importInput.addEventListener("change", async () => {
    const file = importInput.files && importInput.files[0];
    importInput.value = "";
    if (!file) return;
    try {
      const txt = await file.text();
      const ok = pgImportPlanFromText(txt);
      if (ok) pgCloseShareDialog();
    } catch (e) {
      alert("Could not read that file.");
    }
  });

  
const importBtn = mkBtn("Import plan file", () => importInput.click());

const shareLinkBtn = mkBtn(
  "Share app link",
  async () => {
    // No clipboard permissions. Use Web Share if available; otherwise show a copy prompt.
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Perpetual Genesis",
          text: "Perpetual Genesis (Indoor seed planning + inventory).",
          url: baseUrl
        });
        return;
      } catch (e) {
        // user canceled or share failed — fall back to prompt
      }
    }
    // No share support: select the link field for manual copy.
    try { linkBox.focus(); linkBox.select(); } catch (e) {}
    alert("Select and copy the app link above.");
  }
);

const printBtn = mkBtn(
  "Print / Save as PDF",
  () => {
    let payloadObj = null;
    try { payloadObj = payload || (json ? JSON.parse(json) : null); } catch (e) {}
    if (!payloadObj) return alert("Nothing to print for this plan.");
    pgOpenPrintView(payloadObj);
  },
  "primary"
);

const backupBtn = mkBtn(
  "Download backup (.pgplan)",
  () => {
    const ok = pgDownloadText(filename, json, "application/octet-stream");
    if (!ok) alert("Download failed in this browser.");
  }
);

  // Optional: if file share is supported, offer it explicitly too (some browsers block auto-share)
  let shareFileBtn = null;
  if (canFileShare && navigator.share) {
    shareFileBtn = mkBtn("Share plan file", async () => {
      try {
        const file = new File([json], filename, { type: "application/octet-stream" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `Perpetual Genesis — ${planName}`,
            text: `Plan export attached.\nOpen app: ${baseUrl}`,
            files: [file]
          });
          pgCloseShareDialog();
          return;
        }
      } catch (e) {}
      alert("Sharing a plan file is not supported here (often requires HTTPS + a mobile browser). Use Print/PDF or Download backup instead.");
    });
  }

  const closeBtn = mkBtn("Close", () => pgCloseShareDialog());

  btnRow.appendChild(printBtn);
  btnRow.appendChild(shareLinkBtn);
  btnRow.appendChild(importBtn);
  if (shareFileBtn) btnRow.appendChild(shareFileBtn);
  btnRow.appendChild(backupBtn);
  btnRow.appendChild(closeBtn);

  // Close behaviors
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) pgCloseShareDialog();
  });
  document.addEventListener(
    "keydown",
    function escHandler(ev) {
      if (ev.key === "Escape") {
        pgCloseShareDialog();
        document.removeEventListener("keydown", escHandler);
      }
    },
    { once: true }
  );

  panel.appendChild(h);
  panel.appendChild(p);
  panel.appendChild(linkLabel);
  panel.appendChild(linkBox);
  panel.appendChild(importInput);
  panel.appendChild(btnRow);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  linkBox.addEventListener("focus", () => linkBox.select());
  linkBox.addEventListener("click", () => linkBox.select());
}

function pgMakeUniqueId(base, existingSet) {
  const clean = pgSanitizeFilename(base || "plan") || "plan";
  let id = clean.toLowerCase();
  if (!id) id = "plan";
  if (!existingSet || !existingSet.has(id)) return id;
  let n = 2;
  while (existingSet.has(`${id}_${n}`)) n++;
  return `${id}_${n}`;
}

function pgGetAllEntryIds(gp) {
  const s = new Set();
  try {
    if (gp && Array.isArray(gp.plans)) {
      gp.plans.forEach(p => {
        const entries = p && Array.isArray(p.entries) ? p.entries : [];
        entries.forEach(e => { if (e && e.id) s.add(String(e.id)); });
      });
    }
  } catch (e) {}
  return s;
}

function pgImportPlanFromText(jsonText) {
  let payload;
  try {
    payload = JSON.parse(jsonText);
  } catch (e) {
    alert("That file isn't valid JSON.");
    return false;
  }

  if (!payload || payload.app !== "PerpetualGenesis" || !payload.plan || !Array.isArray(payload.plan.entries)) {
    alert("This doesn't look like a Perpetual Genesis plan export.");
    return false;
  }

  // Load current gardenPlans
  let gp = null;
  try { gp = (typeof gardenPlans !== "undefined" && gardenPlans) ? gardenPlans : null; } catch (e) {}
  if (!gp) {
    try { gp = JSON.parse(localStorage.getItem("gardenPlans") || "null"); } catch (e) {}
  }
  if (!gp || !Array.isArray(gp.plans)) {
    gp = { plans: [{ id: "main", name: "Main Garden", entries: [] }], currentMyGarden: "main" };
  }

  const existingPlanIds = new Set(gp.plans.map(p => String(p.id)));
  const existingEntryIds = pgGetAllEntryIds(gp);

  const incomingPlan = payload.plan;
  const desiredBaseId = incomingPlan.id || incomingPlan.name || "plan";
  const newPlanId = pgMakeUniqueId(desiredBaseId, existingPlanIds);
  const newPlanName = incomingPlan.name || incomingPlan.id || "Imported Plan";

  // Remap entry IDs if they collide
  const idMap = {};
  const importedEntries = incomingPlan.entries.map((e, i) => {
    const entry = Object.assign({}, e);
    const oldId = entry.id ? String(entry.id) : `${entry.crop || "crop"}_${Date.now()}_${i}`;
    let newId = oldId;
    if (existingEntryIds.has(newId)) {
      let k = 1;
      while (existingEntryIds.has(`${newId}_${k}`)) k++;
      newId = `${newId}_${k}`;
    }
    idMap[oldId] = newId;
    entry.id = newId;
    existingEntryIds.add(newId);
    return entry;
  });

  gp.plans.push({ id: newPlanId, name: newPlanName, entries: importedEntries });
  gp.currentMyGarden = newPlanId;

  // Merge progress/notes using idMap
  try {
    const prog = payload.progress || {};
    const notes = payload.notes || {};
    const newProg = {};
    const newNotes = {};
    Object.keys(prog).forEach(oldId => {
      const nid = idMap[String(oldId)] || String(oldId);
      newProg[nid] = prog[oldId];
    });
    Object.keys(notes).forEach(oldId => {
      const nid = idMap[String(oldId)] || String(oldId);
      newNotes[nid] = notes[oldId];
    });

    // Update globals if present
    try { if (typeof progressData !== "undefined" && progressData) Object.assign(progressData, newProg); } catch (e) {}
    try { if (typeof notesData !== "undefined" && notesData) Object.assign(notesData, newNotes); } catch (e) {}

    // Persist
    localStorage.setItem("cropProgress", JSON.stringify(Object.assign({}, progressData || {}, newProg)));
    localStorage.setItem("cropNotes", JSON.stringify(Object.assign({}, notesData || {}, newNotes)));
  } catch (e) {}

  // Restore per-plan storage keys (inventory, layout, etc.)
  try {
    const oldPlanId = incomingPlan.id ? String(incomingPlan.id) : "main";
    const oldSuffix = `__${oldPlanId}`;
    const newSuffix = `__${newPlanId}`;
    const pps = payload.perPlanStorage || {};
    Object.keys(pps).forEach(k => {
      const v = pps[k];
      const kk = String(k).endsWith(oldSuffix) ? String(k).slice(0, -oldSuffix.length) + newSuffix : String(k) + newSuffix;
      localStorage.setItem(kk, v);
    });

    // Ensure inventory keys exist if export provided direct arrays
    if (payload.inventory !== null && typeof payload.inventory !== "undefined") {
      localStorage.setItem(`inventoryData__${newPlanId}`, JSON.stringify(payload.inventory));
    }
    if (payload.inventoryTransactions !== null && typeof payload.inventoryTransactions !== "undefined") {
      localStorage.setItem(`inventoryTransactions__${newPlanId}`, JSON.stringify(payload.inventoryTransactions));
    }
  } catch (e) {}

  // Persist gardenPlans + switch active plan
  try {
    localStorage.setItem("gardenPlans", JSON.stringify(gp));
    try { if (typeof gardenPlans !== "undefined") gardenPlans = gp; } catch (e) {}
    try { if (typeof currentPlanId !== "undefined") currentPlanId.mygarden = newPlanId; } catch (e) {}
  } catch (e) {}

  alert(`Imported "${newPlanName}". The app will refresh to load it.`);
  try { location.reload(); } catch (e) {}
  return true;
}

async function pgShareActivePlan() {
  const planId = pgGetActivePlanIdForShare();
  const payload = pgBuildPlanExportPayload(planId);
  const baseUrl = pgGetShareBaseUrl();

  if (!payload) {
    alert("No active plan found to share.");
    return;
  }

  const planName = payload.plan && payload.plan.name ? payload.plan.name : "plan";
  const safeName = pgSanitizeFilename(planName);
  const dateTag = new Date().toISOString().slice(0, 10);
  const filename = `PerpetualGenesis_${safeName}_${dateTag}.pgplan`;
  const json = JSON.stringify(payload, null, 2);

  // We do NOT auto-open the OS share sheet. We show our own dialog first (no permissions),
  // and offer file-share as an explicit option if the browser supports it.
  let canFileShare = false;
  try {
    const file = new File([json], filename, { type: "application/octet-stream" });
    canFileShare = !!(navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share);
  } catch (e) {}

  pgOpenShareDialog({ planName, baseUrl, filename, json, payload, canFileShare });
}


document.addEventListener("DOMContentLoaded", () => {
  const shareBtn = document.getElementById("sharePlanBtn");
  if (shareBtn) {
    shareBtn.addEventListener("click", (e) => {
      e.preventDefault();
            // Monetization gate: Share Plan is Pro-only
      if (typeof window.pgRequire === "function") {
        if (!window.pgRequire("sharePlan", "Sharing plans is available in the Pro app (store version).")) return;
      }
      pgShareActivePlan();
    });
  }

  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      document.body.dataset.theme = document.body.dataset.theme === "light" ? "" : "light";
    });
  }
});
