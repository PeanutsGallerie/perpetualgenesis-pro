document.addEventListener("DOMContentLoaded", () => {
  // Ensure calculator UI enhancements exist even before the user visits My Garden.
  addAddButtons();
  try { refreshCalculatorPlanPicker(); } catch (e) {}
});
function getCurrentReferenceDate() {
    return document.getElementById('frostDate').value.trim();
}

 
 function updateTables() {
            const season = document.getElementById('season').value;
            const category = document.getElementById('category').value;
            const isSpring = season === 'spring';
            document.querySelectorAll('table').forEach(t => t.style.display = 'none');
            let id = isSpring ?
                (category === 'all' ? 'springAllTable' : `spring${category.charAt(0).toUpperCase() + category.slice(1)}Table`) :
                (category === 'all' ? 'fallAllTable' : `fall${category.charAt(0).toUpperCase() + category.slice(1)}Table`);
            const table = document.getElementById(id);
            if (table) table.style.display = 'table';
            document.getElementById('springNotes').style.display = isSpring ? 'block' : 'none';
            document.getElementById('fallNotes').style.display = isSpring ? 'none' : 'block';
            updateReferenceLabel();
            filterTable();
        }

        function updateReferenceLabel() {
            document.getElementById('frostLabel').textContent = getCurrentSeason() === 'spring' ? 'Last Spring Frost Date:' : 'First Fall Frost Date:';
        }
        function calculateDates() {
            const str = document.getElementById('frostDate').value.trim();
            if (!str) return alert('Enter a reference date.');
            const ref = parseDate(str);
            if (!ref) return alert('Invalid date. Use MM/DD/YYYY.');
            localStorage.setItem('myReferenceDate', str);
            localStorage.setItem('myGrowingMethod', getCurrentMethod());
            const table = document.querySelector('table[style*="table"]');
            if (!table) return;
            table.querySelectorAll('tbody tr:not(.section)').forEach(row => {
                const offset = row.querySelector('.add-btn') ? 1 : 0;
                const cells = row.cells;
                const timing = cells[7 + offset].textContent.trim();
                const weeksStr = cells[1 + offset].textContent.trim();
                const maturityStr = cells[3 + offset].textContent.trim();

                const adjusted = getAdjustedReference(ref);
                const { min: tMin, max: tMax, after } = parseTiming(timing);
                const sign = after ? 1 : -1;
                const transFrom = addDays(adjusted, tMin * 7 * sign);
                const transTo = addDays(adjusted, tMax * 7 * sign);
                cells[8 + offset].textContent = tMin === tMax ? formatDate(transFrom) : `${formatDate(new Date(Math.min(transFrom, transTo)))}–${formatDate(new Date(Math.max(transFrom, transTo)))}`;

                const weeks = parseWeeks(weeksStr);
                const startFrom = addDays(transFrom, -weeks.max * 7);
                const startTo = addDays(transTo, -weeks.min * 7);
                cells[6 + offset].textContent = weeks.min === 0 && weeks.max === 0 ? 'Direct sow/plant' :
                    `${formatDate(new Date(Math.min(startFrom, startTo)))}–${formatDate(new Date(Math.max(startFrom, startTo)))}`;

                const mat = parseMaturity(maturityStr);
                const harvestFrom = addDays(transFrom, mat.min);
                const harvestTo = addDays(transTo, mat.max);
                cells[9 + offset].textContent = mat.min === 0 ? maturityStr :
                    `${formatDate(new Date(Math.min(harvestFrom, harvestTo)))}–${formatDate(new Date(Math.max(harvestFrom, harvestTo)))}`;
            });
            collectCropData();
            loadMyGardenTab();
            renderTimeline();
        }

        function resetTable() {
            // Clear the frost date input field completely
            document.getElementById('frostDate').value = '';
            // Clear the search box
            document.getElementById('search').value = '';
            // Clear all calculated date columns in the current table
            document.querySelectorAll('table tbody tr:not(.section)').forEach(row => {
                const offset = row.querySelector('.add-btn') ? 1 : 0;
                row.cells[6 + offset].textContent = ''; // Start Seeds Indoors
                row.cells[8 + offset].textContent = ''; // Transplant Outdoors
                row.cells[9 + offset].textContent = ''; // Estimated Harvest
                row.style.display = ''; // Show all rows again
            });
            filterTable();
        }
        function filterTable() {
            const filter = document.getElementById('search').value.toLowerCase();
            const table = document.querySelector('table[style*="table"]');
            if (!table) return;
            table.querySelectorAll('tbody tr:not(.section)').forEach(row => {
                const offset = row.querySelector('.add-btn') ? 1 : 0;
                row.style.display = row.cells[0 + offset].textContent.toLowerCase().includes(filter) ? '' : 'none';
            });
        }
        function loadCalculatorDate() {
            const saved = localStorage.getItem('myReferenceDate');
            if (saved && document.getElementById('frostDate')) {
                document.getElementById('frostDate').value = saved;
            }
            updateReferenceLabel();
        }

        function updateMethodNote() {
            const method = getCurrentMethod();
            const notes = {
                outdoor: 'Outdoor: Standard frost-based timing.',
                rowcovers: 'Row Covers: ~2 weeks earlier starts in spring, ~3 weeks later harvest in fall.',
                greenhouse: 'Greenhouse: ~5 weeks earlier starts in spring, ~6 weeks later harvest in fall (unheated).'
            };
            const note = document.getElementById('methodNote');
            if (note) note.textContent = notes[method];

        }
        function addAddButtons() {
  document.querySelectorAll('table').forEach(table => {
    const header = table.querySelector('thead tr');
    if (!header || header.querySelector('.add-header')) return;

    const th = document.createElement('th');
    th.textContent = 'Add to Garden';
    th.className = 'add-header';
    header.insertBefore(th, header.firstChild);

    table.querySelectorAll('tbody tr:not(.section)').forEach(row => {
      if (row.querySelector('.add-btn')) return;

      const cropCell = row.cells[0];
      if (!cropCell) return;

      const crop = cropCell.textContent.trim();
      if (!crop) return;

      const td = document.createElement('td');
      td.style.textAlign = 'center';

      const btn = document.createElement('button');
      btn.className = 'add-btn';
      btn.textContent = '+ Add';

      btn.onclick = () => {
        const today = formatDate(new Date());
        const newEntry = {
          id: crop + '_' + Date.now(),
          crop,
          addedDate: today,
          season: getCurrentSeason(),
          method: getCurrentMethod(),
          referenceDate: getCurrentReferenceDate()
        };

        getCurrentPlan('mygarden').entries.push(newEntry);
        savePlans();
        loadMyGardenTab();
        renderTimeline();
      };

      td.appendChild(btn);
      row.insertBefore(td, row.firstChild);
    });
  });

  // Keep the Plan dropdown present/updated whenever this is called (it runs on tab open).
  try { refreshCalculatorPlanPicker(); } catch (e) {}
}


// ───────────────────────────────────────────────────────────────
// Calculator: My Garden plan picker (to avoid tab-hopping)
// Adds a "Plan" dropdown into the calculator controls row.
// Selecting a plan sets currentPlanId.mygarden + gardenPlans.currentMyGarden
// so +Add buttons add crops to that plan.
// ───────────────────────────────────────────────────────────────

function ensureCalculatorPlanPicker() {
  const calcTab = document.getElementById('calculator');
  if (!calcTab) return;
  const controls = calcTab.querySelector('.controls');
  if (!controls) return;
  if (document.getElementById('calcPlanSelect')) return;

  const wrap = document.createElement('div');
  wrap.className = 'calc-plan-picker';
  wrap.innerHTML = `
    <label for="calcPlanSelect">Plan:</label>
    <select id="calcPlanSelect"></select>
  `;

  // Insert after Category (2nd control) if present, otherwise append.
  const afterCategory = controls.children && controls.children.length >= 2 ? controls.children[2] : null;
  controls.insertBefore(wrap, afterCategory);

  const sel = wrap.querySelector('#calcPlanSelect');
  if (!sel) return;

  sel.addEventListener('change', () => {
    const pid = sel.value || 'main';
    try {
      if (typeof currentPlanId !== 'undefined') currentPlanId.mygarden = pid;
    } catch (e) {}
    try {
      if (typeof gardenPlans !== 'undefined' && gardenPlans) gardenPlans.currentMyGarden = pid;
    } catch (e) {}
    try { if (typeof savePlans === 'function') savePlans(); } catch (e) {}
    try { if (typeof renderPlanTabs === 'function') { renderPlanTabs('mygarden'); renderPlanTabs('timeline'); renderPlanTabs('perpetual'); } } catch (e) {}
    try { if (typeof renderLayoutPlanTabs === 'function') renderLayoutPlanTabs(); } catch (e) {}
    try { if (typeof loadMyGardenTab === 'function') loadMyGardenTab(); } catch (e) {}
  });
}

function _getAllMyGardenPlansForCalculator() {
  try {
    if (typeof gardenPlans !== 'undefined' && gardenPlans && Array.isArray(gardenPlans.plans)) return gardenPlans.plans;
  } catch (e) {}
  try {
    const raw = localStorage.getItem('gardenPlans');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.plans)) return parsed.plans;
    }
  } catch (e) {}
  return [];
}

function refreshCalculatorPlanPicker() {
  ensureCalculatorPlanPicker();
  const sel = document.getElementById('calcPlanSelect');
  if (!sel) return;

  const plans = _getAllMyGardenPlansForCalculator() || [];
  const activeId = (typeof currentPlanId !== 'undefined' && currentPlanId.mygarden) ||
                   (typeof gardenPlans !== 'undefined' && gardenPlans && gardenPlans.currentMyGarden) ||
                   'main';

  // rebuild
  sel.innerHTML = '';
  plans.forEach(p => {
    if (!p || !p.id) return;
    const opt = document.createElement('option');
    opt.value = String(p.id);
    opt.textContent = p.name || String(p.id);
    sel.appendChild(opt);
  });
  // ensure at least main exists
  if (![...sel.options].some(o => o.value === 'main')) {
    const opt = document.createElement('option');
    opt.value = 'main';
    opt.textContent = 'Main Garden';
    sel.insertBefore(opt, sel.firstChild);
  }
  sel.value = String(activeId);
}

// Keep it in sync when plans change (core.js dispatches pg:gardenPlansChanged)
try {
  window.addEventListener('pg:gardenPlansChanged', () => {
    try { refreshCalculatorPlanPicker(); } catch (e) {}
  });
} catch (e) {}
/* =========================================================
   Unified Plan Picker (dropdown) for My Garden / Timeline /
   Perpetual / Inventory tabs — matches Calculator UI.
   - Patches renderPlanTabs (defined in core.js) so these tabs
     use a single dropdown instead of button strips.
   - Exposes a shared plan switch helper used across tabs.
   ========================================================= */

(function () {
  'use strict';

  // ---- Shared helpers (global) ----
  if (typeof window.pgGetActivePlanId !== 'function') {
    window.pgGetActivePlanId = function () {
      try {
        if (typeof currentPlanId !== 'undefined' && currentPlanId && currentPlanId.mygarden) {
          return String(currentPlanId.mygarden);
        }
      } catch (e) {}
      try {
        if (typeof gardenPlans !== 'undefined' && gardenPlans && gardenPlans.currentMyGarden) {
          return String(gardenPlans.currentMyGarden);
        }
      } catch (e) {}
      return 'main';
    };
  }

  if (typeof window.pgSetActivePlanId !== 'function') {
    window.pgSetActivePlanId = function (pid, opts) {
      const options = opts || {};
      const planId = String(pid || 'main');

      try {
        if (typeof currentPlanId !== 'undefined' && currentPlanId) currentPlanId.mygarden = planId;
      } catch (e) {}

      try {
        if (typeof gardenPlans !== 'undefined' && gardenPlans) gardenPlans.currentMyGarden = planId;
      } catch (e) {}

      try { if (typeof savePlans === 'function') savePlans(); } catch (e) {}

      // Keep calculator's plan picker synced
      try { if (typeof refreshCalculatorPlanPicker === 'function') refreshCalculatorPlanPicker(); } catch (e) {}

      // Update dependent views (best-effort)
      try { if (typeof loadMyGardenTab === 'function') loadMyGardenTab(); } catch (e) {}
      try { if (typeof renderTimeline === 'function') renderTimeline(); } catch (e) {}
      try { if (typeof renderPerpetual === 'function') renderPerpetual(); } catch (e) {}

      // Layout/Spacing plan pickers (if present)
      try { if (typeof renderLayoutPlanTabs === 'function') renderLayoutPlanTabs(); } catch (e) {}
      try { if (typeof renderSpacingPlanTabs === 'function') renderSpacingPlanTabs(); } catch (e) {}

      // Inventory refresh (if present)
      try {
        if (options.refreshInventory && typeof getInventory === 'function' && typeof window.renderInventoryTable === 'function') {
          window.inventoryData = getInventory();
          window.renderInventoryTable();
        }
      } catch (e) {}

      // Re-render plan pickers across tabs (our patched renderPlanTabs)
      try {
        if (typeof window.renderPlanTabs === 'function') {
          window.renderPlanTabs('mygarden');
          window.renderPlanTabs('timeline');
          window.renderPlanTabs('perpetual');
        }
      } catch (e) {}

      // Re-render inventory plan picker (if implemented via renderPlanTabs)
      try {
        if (typeof window.renderPlanTabs === 'function' && document.getElementById('inventoryPlanTabs')) {
          // Use the shared plan source (mygarden)
          window.renderPlanTabs('mygarden', 'inventoryPlanTabs', function () {});
        }
      } catch (e) {}

      // Optional post-change hook
      try { if (typeof options.onAfterChange === 'function') options.onAfterChange(planId); } catch (e) {}

      // Notify listeners
      try {
        window.dispatchEvent(new CustomEvent('pg:activePlanChanged', { detail: { planId } }));
      } catch (e) {}
    };
  }

  function pgGetPlans() {
    try {
      if (typeof _getAllMyGardenPlansForCalculator === 'function') return _getAllMyGardenPlansForCalculator() || [];
    } catch (e) {}
    try {
      if (typeof gardenPlans !== 'undefined' && gardenPlans && Array.isArray(gardenPlans.plans)) return gardenPlans.plans;
    } catch (e) {}
    return [];
  }

  function pgEnsureMainPlan(plans) {
    const list = Array.isArray(plans) ? plans.slice() : [];
    const hasMain = list.some(p => p && String(p.id) === 'main');
    if (!hasMain) list.unshift({ id: 'main', name: 'Main Garden' });
    return list;
  }

  function pgRenderPlanDropdownInto(containerId, onChangeCb) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const plans = pgEnsureMainPlan(pgGetPlans());
    const activeId = window.pgGetActivePlanId();

    // Build DOM fresh each render to avoid duplicate listeners.
    container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'pg-plan-picker';

    const label = document.createElement('label');
    const selId = 'pgPlanSelect_' + containerId;
    label.setAttribute('for', selId);
    label.textContent = 'Plan:';

    const sel = document.createElement('select');
    sel.id = selId;

    plans.forEach(p => {
      if (!p || typeof p.id === 'undefined') return;
      const opt = document.createElement('option');
      opt.value = String(p.id);
      opt.textContent = p.name || String(p.id);
      sel.appendChild(opt);
    });

    // If active is unknown, default to main
    const values = Array.from(sel.options).map(o => o.value);
    sel.value = values.includes(String(activeId)) ? String(activeId) : 'main';

    sel.addEventListener('change', () => {
      const pid = sel.value;
      // Inventory tab needs table refresh on plan change.
      const refreshInventory = (containerId === 'inventoryPlanTabs');
      window.pgSetActivePlanId(pid, {
        refreshInventory,
        onAfterChange: () => {
          try { if (typeof onChangeCb === 'function') onChangeCb(); } catch (e) {}
        }
      });
    });

    wrap.appendChild(label);
    wrap.appendChild(sel);
    container.appendChild(wrap);
  }

  // ---- Patch core.js renderPlanTabs so these tabs use dropdown UI ----
  function patchRenderPlanTabs() {
    const orig = window.renderPlanTabs;
    if (typeof orig !== 'function') return;
    if (orig && orig.__pgPlanPickerPatched) return;

    const patched = function (tabKey, containerId, onChangeCb) {
      const key = String(tabKey || '').toLowerCase();

      // Only override the specific tabs Josh requested.
      if (key === 'mygarden' || key === 'timeline' || key === 'perpetual') {
        const cid = (typeof containerId === 'string' && containerId)
          ? containerId
          : (key === 'mygarden' ? 'myGardenPlanTabs' : (key === 'timeline' ? 'timelinePlanTabs' : 'perpetualPlanTabs'));

        pgRenderPlanDropdownInto(cid, onChangeCb);
        return;
      }

      // Default behavior for everything else
      try { return orig.apply(this, arguments); } catch (e) { return; }
    };

    patched.__pgPlanPickerPatched = true;
    patched.__pgOriginal = orig;
    window.renderPlanTabs = patched;

    // Keep dropdowns in sync when plans list changes.
    try {
      window.addEventListener('pg:gardenPlansChanged', () => {
        try { window.renderPlanTabs('mygarden'); } catch (e) {}
        try { window.renderPlanTabs('timeline'); } catch (e) {}
        try { window.renderPlanTabs('perpetual'); } catch (e) {}
        try {
          if (document.getElementById('inventoryPlanTabs')) {
            pgRenderPlanDropdownInto('inventoryPlanTabs');
          }
        } catch (e) {}
      });
    } catch (e) {}
  }

  // Patch as soon as possible (core.js is loaded before this file)
  patchRenderPlanTabs();

  // Also attempt again on DOMContentLoaded in case core.js defines it late.
  try {
    document.addEventListener('DOMContentLoaded', patchRenderPlanTabs);
  } catch (e) {}



  // Add a Rename control on My Garden (plan tabs are now a dropdown)
  function pgRenameActivePlan() {
    try {
      if (typeof gardenPlans === 'undefined' || !gardenPlans || !Array.isArray(gardenPlans.plans)) {
        alert('Plan system not ready yet.');
        return;
      }
      const activeId = window.pgGetActivePlanId();
      const plan = gardenPlans.plans.find(p => p && String(p.id) === String(activeId));
      if (!plan) {
        alert('Could not find the selected plan.');
        return;
      }
      if (String(plan.id) === 'main') {
        // Optional: allow rename main, but keep it safe
      }
      const next = prompt('Rename plan:', plan.name || '');
      if (next === null) return;
      const name = String(next).trim();
      if (!name) return;
      plan.name = name;
      if (typeof savePlans === 'function') savePlans();
      try { window.dispatchEvent(new CustomEvent('pg:gardenPlansChanged')); } catch (e) {}
      try { if (typeof loadMyGardenTab === 'function') loadMyGardenTab(); } catch (e) {}
    } catch (e) {
      console.warn('Rename plan failed', e);
    }
  }

  try {
    document.addEventListener('DOMContentLoaded', () => {
      const actions = document.querySelector('#mygarden .plan-selector .plan-actions');
      if (!actions) return;
      if (document.getElementById('renamePlanBtn')) return;

      const btn = document.createElement('button');
      btn.id = 'renamePlanBtn';
      btn.textContent = 'Rename Plan';
      btn.type = 'button';
      btn.onclick = pgRenameActivePlan;

      // Insert before Delete if present, otherwise append
      const del = actions.querySelector('.clear-btn');
      if (del) {
        actions.insertBefore(btn, del);
      } else {
        actions.appendChild(btn);
      }
    });
  } catch (e) {}
  // Expose renderer for inventory.js to reuse
  if (typeof window.pgRenderPlanDropdownInto !== 'function') {
    window.pgRenderPlanDropdownInto = pgRenderPlanDropdownInto;
  }

})();