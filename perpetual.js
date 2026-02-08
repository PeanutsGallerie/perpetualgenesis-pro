const perpetualCropRules = {
  Lettuce: {
    daysToHarvest: 45,
    regrows: false,
    harvestWindow: 14,
    successionGapDefault: 14
  },
  Spinach: {
    daysToHarvest: 40,
    regrows: false,
    harvestWindow: 10,
    successionGapDefault: 14
  },
  Basil: {
    daysToHarvest: 35,
    regrows: true,
    harvestWindow: 60,
    cutAndComeAgain: true
  },
  Radishes: {
    daysToHarvest: 28,
    regrows: false,
    harvestWindow: 7,
    successionGapDefault: 10
  },
   "Green Onions": {
    daysToHarvest: 30,
    regrows: true,
    harvestWindow: 90
  }
};
document.addEventListener("DOMContentLoaded", () => {

  const perpetualCropSelect = document.getElementById('perpetualCrop');
  if (perpetualCropSelect) {
    Object.keys(cropSuccessionData).forEach(crop => {
      const option = document.createElement('option');
      option.value = crop;
      option.textContent = crop.charAt(0).toUpperCase() + crop.slice(1);
      perpetualCropSelect.appendChild(option);
    });
  }

});

function renderPerpetualPlanTabs() {
  if (typeof renderPlanTabs !== "function") return; // defined globally by My Garden system
  renderPlanTabs("mygarden", "perpetualPlanTabs", renderPerpetual);
}


function generatePerpetualPlan() {
    const crop = document.getElementById('perpetualCrop').value;
    const startDate = new Date(document.getElementById('perpetualStart').value);
    const interval = parseInt(document.getElementById('successionInterval').value) || 21;

    if (!crop || isNaN(startDate.getTime())) {
        alert('Please select a crop and start date.');
        return;
    }

    const timeline = document.getElementById("perpetualTimeline");
    timeline.innerHTML = ''; // Clear previous

    const rules = perpetualCropRules[crop] || { daysToHarvest: 40, harvestWindow: 30, regrows: false };
    let current = startDate;

    for (let i = 0; i < 8; i++) {
        const plantDate = new Date(current);
        const harvestStart = new Date(current);
        harvestStart.setDate(harvestStart.getDate() + rules.daysToHarvest);

        const harvestEnd = new Date(harvestStart);
        harvestEnd.setDate(harvestEnd.getDate() + rules.harvestWindow);

        const block = document.createElement('div');
        block.className = 'perpetual-block';
        block.innerHTML = `
            <strong>${crop} - Succession ${i + 1}</strong><br>
            Plant: ${plantDate.toLocaleDateString()}<br>
            Harvest Start: ${harvestStart.toLocaleDateString()}<br>
            Harvest End: ${harvestEnd.toLocaleDateString()}
        `;

        timeline.appendChild(block);

        if (!rules.regrows) {
            current = harvestEnd; // Replant after harvest
        }

        current.setDate(current.getDate() + interval);
    }

    updateReferenceLabel(); // If needed, else remove
}

function getCurrentPerpetualConfig() {
  if (typeof getCurrentPlan !== "function") return null;

  const plan = getCurrentPlan("mygarden"); // same source of truth as My Garden/Timeline
  if (!plan) return null;

  // If this plan has no perpetual section yet, create a default one
  if (!plan.perpetual) {
    plan.perpetual = {
      selectedCrops: [],
      daysBetween: 14,
      successionCount: 6,
      successionsPerRow: 3,
      startDate: null,
      showGapFillers: true
    };
  }

  return plan.perpetual;
}



/* ─────────────────────────────────────────────────────────────
   Perpetual Crop Picker (search + category grouping + bulk actions)
   Goal: make 130+ crops manageable without changing calculations.
   Data source remains cropData (built from main tables).
   ───────────────────────────────────────────────────────────── */


function canonCropName(name) {
  // Normalize unicode + whitespace so table-derived names match cropData keys reliably.
  try {
    return (name || "")
      .toString()
      .normalize("NFKC")
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch (e) {
    return (name || "")
      .toString()
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

function normalizeBaseCategory(cat) {
  const c = canonCropName(cat);
  if (!c) return "Other";
  const lc = c.toLowerCase();
  if (lc.startsWith("veg")) return "Vegetables";
  if (lc.startsWith("fruit")) return "Fruits";
  if (lc.startsWith("herb")) return "Herbs";
  if (lc.startsWith("flower")) return "Flowers";
  return c;
}

function guessBaseCategory(cropName) {
  // Fallback if we couldn't derive base category from the tables.
  const n = canonCropName(cropName).toLowerCase();

  const has = (arr) => arr.some(k => n.includes(k));

  if (has(["basil","oregano","thyme","rosemary","sage","parsley","cilantro","dill","chive","mint","tarragon","marjoram","lovage","chamomile","lemon balm","catnip","echinacea","yarrow","valerian","lavender"])) {
    return "Herbs";
  }

  if (has(["marigold","alyssum","ageratum","amaranth","borage","calendula","nasturtium","pansy","viola","sunflower","zinnia","cosmos","snapdragon","petunia","dahlia"])) {
    return "Flowers";
  }

  if (has(["strawberry","blueberry","raspberry","blackberry","watermelon","cantaloupe","honeydew","melon"])) {
    return "Fruits";
  }

  // Most remaining crops in this app are vegetables.
  return "Vegetables";
}


// Lightweight grouping to give users meaningful narrowing beyond just Vegetables/Fruits/Herbs/Flowers.
function inferCropGroup(base, cropName) {
  const name = canonCropName(cropName).toLowerCase();
  const has = (arr) => arr.some(k => name.includes(k));

  if (base === "Vegetables") {
    if (has(["lettuce","spinach","arugula","kale","chard","collard","endive","escarole","radicchio","chicory","mache","salad","mizuna","tatsoi","mustard","cress","bok choy"])) return "Leafy greens";
    if (has(["broccoli","cabbage","cauliflower","brussels","kohlrabi","bok choy","mustard","collard","kale","arugula","turnip"])) return "Brassicas";
    if (has(["carrot","beet","radish","daikon","turnip","parsnip","rutabaga","celeriac","salsify"])) return "Root crops";
    if (has(["onion","leek","garlic","shallot","chive","scallion"])) return "Alliums";
    if (has(["tomato","pepper","eggplant","potato","tomatillo","ground cherry"])) return "Nightshades";
    if (has(["cucumber","squash","zucchini","pumpkin","melon","gourd"])) return "Cucurbits";
    if (has(["bean","peas","pea","edamame","soy"])) return "Legumes";
    if (has(["corn"])) return "Grains";
    return "Other vegetables";
  }

  if (base === "Fruits") {
    if (has(["strawberry","blueberry","raspberry","blackberry"])) return "Berries";
    if (has(["melon","watermelon","cantaloupe","honeydew"])) return "Melons";
    return "Other fruits";
  }

  if (base === "Herbs") {
    if (has(["basil","oregano","thyme","rosemary","sage","parsley","cilantro","dill","chive","mint","tarragon","marjoram","lovage"])) return "Culinary herbs";
    if (has(["chamomile","lemon balm","catnip","echinacea","yarrow","valerian","lavender"])) return "Tea & medicinal";
    return "Other herbs";
  }

  if (base === "Flowers") {
    if (has(["nasturtium","calendula","borage","viola","pansy","marigold"])) return "Edible flowers";
    return "Other flowers";
  }

  return "Other";
}

function getCropBaseCategory(catMap, cropName) {
  const key = canonCropName(cropName);
  const base = normalizeBaseCategory(catMap[key]);
  if (base && base !== "Other") return base;
  return guessBaseCategory(cropName);
}

function encodeFilterValue(kind, base, group) {
  if (kind === "base") return `base:${base}`;
  if (kind === "sub") return `sub:${base}||${group}`;
  return "__all__";
}

function decodeFilterValue(val) {
  const v = val || "__all__";
  if (v === "__all__") return { kind: "all" };
  if (v.startsWith("base:")) return { kind: "base", base: v.slice(5) };
  if (v.startsWith("sub:")) {
    const parts = v.slice(4).split("||");
    return { kind: "sub", base: parts[0] || "Other", group: parts[1] || "Other" };
  }
  // Back-compat: old values might be just "Vegetables"
  return { kind: "base", base: v };
}

function rebuildPerpetualCategorySelect(catSelect, catMap, cropNames, state) {
  if (!catSelect) return;

  const baseCounts = new Map();
  const groupCounts = new Map(); // key: base||group

  cropNames.forEach(name => {
    const base = getCropBaseCategory(catMap, name);
    const group = inferCropGroup(base, name);

    baseCounts.set(base, (baseCounts.get(base) || 0) + 1);
    const k = `${base}||${group}`;
    groupCounts.set(k, (groupCounts.get(k) || 0) + 1);
  });

  const preferredBase = ["Vegetables", "Fruits", "Herbs", "Flowers"];
  const bases = Array.from(baseCounts.keys()).sort((a, b) => a.localeCompare(b));
  const orderedBases = [
    ...preferredBase.filter(b => baseCounts.has(b)),
    ...bases.filter(b => !preferredBase.includes(b))
  ];

  const prev = (state && state.cat) ? state.cat : (catSelect.value || "__all__");

  // Clear all options
  catSelect.innerHTML = "";

  const optAll = document.createElement("option");
  optAll.value = "__all__";
  optAll.textContent = `All crops (${cropNames.length})`;
  catSelect.appendChild(optAll);

  orderedBases.forEach(base => {
    const og = document.createElement("optgroup");
    og.label = base;

    const optBase = document.createElement("option");
    optBase.value = encodeFilterValue("base", base);
    optBase.textContent = `All ${base} (${baseCounts.get(base) || 0})`;
    og.appendChild(optBase);

    // Collect subgroups under this base
    const subgroups = [];
    groupCounts.forEach((count, key) => {
      const parts = key.split("||");
      const b = parts[0];
      const g = parts[1];
      if (b !== base) return;
      subgroups.push({ group: g, count });
    });

    subgroups.sort((a, b) => b.count - a.count || a.group.localeCompare(b.group));

    const otherLabel = inferCropGroup(base, "__other__");
    subgroups.forEach(sg => {
      // Only show subgroups if they meaningfully narrow the list.
      // Hide "Other ..." here; we append it at the end.
      if (!sg.group || sg.count < 2) return;
      if (sg.group === otherLabel) return;

      const opt = document.createElement("option");
      opt.value = encodeFilterValue("sub", base, sg.group);
      opt.textContent = `${sg.group} (${sg.count})`;
      og.appendChild(opt);
    });

    // Add "Other ..." at the end if it exists and narrows
    const otherCount = groupCounts.get(`${base}||${otherLabel}`) || 0;
    if (otherCount >= 2) {
      const optOther = document.createElement("option");
      optOther.value = encodeFilterValue("sub", base, otherLabel);
      optOther.textContent = `${otherLabel} (${otherCount})`;
      og.appendChild(optOther);
    }

    catSelect.appendChild(og);
  });

  // Restore selection if still available
  const hasPrev = Array.from(catSelect.querySelectorAll("option")).some(o => o.value === prev);
  catSelect.value = hasPrev ? prev : "__all__";
  if (state) state.cat = catSelect.value;
}

function buildPerpetualCropCategoryMap() {
  // Best-effort map: crop name -> section heading (Vegetables/Fruits/Herbs/Flowers/etc.)
  // We derive this from the same crop tables already in the DOM (if present).
  const map = {};
  let sectionsFound = 0;

  const allTables = document.querySelectorAll("table");
  allTables.forEach(tbl => {
    const tbody = tbl.tBodies && tbl.tBodies[0];
    if (!tbody) return;

    let currentSection = "";
    Array.from(tbody.rows).forEach(row => {
      // Section rows are usually <tr class="section"><td colspan="..">Vegetables</td></tr>
      const isSection =
        (row.classList && row.classList.contains("section")) ||
        (row.cells &&
          row.cells.length === 1 &&
          row.cells[0] &&
          row.cells[0].getAttribute &&
          row.cells[0].getAttribute("colspan"));

      if (isSection) {
        const td = row.cells && row.cells[0];
        const txt = (td ? td.textContent : "").trim();
        if (txt) {
          currentSection = normalizeBaseCategory(txt);
sectionsFound++;
        }
        return;
      }

      if (!row.cells || row.cells.length === 0) return;

      const name = (row.cells[0].textContent || "").trim();
      if (!name) return;

      const key = canonCropName(name);
      if (!map[key] && currentSection) map[key] = currentSection;
    });
  });

  // Quality / readiness heuristics:
  // - If cropData isn't ready yet or there are no section rows in the DOM,
  //   this map will be weak and should be rebuilt later.
  const totalCrops = Object.keys(window.cropData || {}).length;
  let mappedCount = 0;
  if (totalCrops) {
    Object.keys(window.cropData || {}).forEach(name => {
      const k = canonCropName(name);
      if (map[k]) mappedCount++;
    });
  }

  const domSectionRows = document.querySelectorAll("tr.section").length;
  const weak =
    totalCrops === 0 ||
    (sectionsFound === 0 && domSectionRows === 0) ||
    (totalCrops > 0 && mappedCount < Math.min(10, Math.floor(totalCrops * 0.15)));

  window.__perpetualCropCategoryMapMeta = {
    totalCrops,
    mappedCount,
    sectionsFound: Math.max(sectionsFound, domSectionRows),
    weak,
    builtAt: Date.now()
  };

  return map;
}

function getPerpetualCropCategoryMap() {
  const totalCrops = Object.keys(window.cropData || {}).length;
  const meta = window.__perpetualCropCategoryMapMeta;
  const cached = window.__perpetualCropCategoryMap;

  const domSectionRows = document.querySelectorAll("tr.section").length;
  const cacheStale =
    !cached ||
    !meta ||
    meta.totalCrops !== totalCrops ||
    // If we built a weak map earlier and the DOM now appears ready, rebuild.
    (meta.weak && domSectionRows > 0) ||
    // If we built before cropData existed, rebuild once it does.
    (meta.totalCrops === 0 && totalCrops > 0);

  if (cacheStale) {
    const next = buildPerpetualCropCategoryMap();
    const nextMeta = window.__perpetualCropCategoryMapMeta;
    // Always update the cache; the meta decides whether to rebuild again later.
    window.__perpetualCropCategoryMap = next;

    // If still weak, schedule a short retry (covers lazy-loaded DOM/tab content).
    if (nextMeta && nextMeta.weak) {
      clearTimeout(window.__perpetualCropCategoryMapRetryTimer);
      window.__perpetualCropCategoryMapRetryTimer = setTimeout(() => {
        // Only rebuild if the DOM has gained section rows or cropData grew.
        try {
          window.__perpetualCropCategoryMap = buildPerpetualCropCategoryMap();
        } catch (e) {}
      }, 350);
    }
  }

  return window.__perpetualCropCategoryMap || {};
}


function ensurePerpetualCropPickerUI(listEl) {
  // listEl is #perpetualCropList
  const parent = listEl.parentElement;
  if (!parent) return null;

  let tools = parent.querySelector(".perpetual-crop-tools");
  if (tools) return tools;

  tools = document.createElement("div");
  tools.className = "perpetual-crop-tools";
  tools.innerHTML = `
    <div class="perpetual-crop-tools-row">
      <input id="perpetualCropSearch" class="perpetual-crop-search" type="text" placeholder="Search crops (e.g., tomato, basil)..." />
      <select id="perpetualCropCategory" class="perpetual-crop-category" aria-label="Filter by category">
        <option value="__all__">All categories</option>
      </select>
    </div>

    <div class="perpetual-crop-tools-row perpetual-crop-actions">
      <label class="perpetual-crop-toggle">
        <input id="perpetualCropShowSelected" type="checkbox" />
        Show selected only
      </label>

      <div class="perpetual-crop-actions-buttons">
        <button type="button" id="perpetualCropSelectVisible" class="perpetual-crop-action-btn">Select visible</button>
        <button type="button" id="perpetualCropClearVisible" class="perpetual-crop-action-btn">Clear visible</button>
      </div>
    </div>

    <div class="perpetual-crop-tools-row perpetual-crop-expand">
      <div class="perpetual-crop-actions-buttons">
        <button type="button" id="perpetualCropExpandAll" class="perpetual-crop-action-btn">Expand all</button>
        <button type="button" id="perpetualCropCollapseAll" class="perpetual-crop-action-btn">Collapse all</button>
      </div>
    </div>
  `;

  // Insert tools before the scroll list, inside the same block
  parent.insertBefore(tools, listEl);
  return tools;
}

function normalizeCropCategory(cat) {
  return normalizeBaseCategory(cat);
}

function renderPerpetualCropPicker(listEl, cfg) {
  // cfg is the current perpetual config for the selected plan
  const selected = new Set(Array.isArray(cfg.selectedCrops) ? cfg.selectedCrops : []);
  const state = (window.__perpetualCropPickerState ||= { q: "", cat: "__all__", showSelected: false, openCats: {} });

  const tools = ensurePerpetualCropPickerUI(listEl);
  const searchInput = tools ? tools.querySelector("#perpetualCropSearch") : null;
  const catSelect = tools ? tools.querySelector("#perpetualCropCategory") : null;
  const showSelectedToggle = tools ? tools.querySelector("#perpetualCropShowSelected") : null;
  const btnSelectVisible = tools ? tools.querySelector("#perpetualCropSelectVisible") : null;
  const btnClearVisible = tools ? tools.querySelector("#perpetualCropClearVisible") : null;
  const btnExpandAll = tools ? tools.querySelector("#perpetualCropExpandAll") : null;
  const btnCollapseAll = tools ? tools.querySelector("#perpetualCropCollapseAll") : null;

  // Build category map (cached)
  const catMap = getPerpetualCropCategoryMap();
// Build / rebuild category options with real labels (base categories + helpful sub-groups)
  const cropNamesAll = Object.keys(cropData || {}).sort((a, b) => a.localeCompare(b));
  const catMeta = window.__perpetualCropCategoryMapMeta || {};
  const builtKey = `${cropNamesAll.length}:${catMeta.sectionsFound || 0}:${catMeta.weak ? 1 : 0}`;

  if (catSelect) {
    const prevKey = catSelect.dataset.builtKey || "";
    if (prevKey !== builtKey || catSelect.options.length <= 2) {
      rebuildPerpetualCategorySelect(catSelect, catMap, cropNamesAll, state);
      catSelect.dataset.builtKey = builtKey;
    }
  }

  // Initialize UI controls from state
  if (searchInput && searchInput.value !== state.q) searchInput.value = state.q;
  if (catSelect && catSelect.value !== state.cat) catSelect.value = state.cat;
  if (showSelectedToggle) showSelectedToggle.checked = !!state.showSelected;

  // Compute "visible" list based on filters (used by bulk actions)
  function getVisibleNames() {
    const q = (state.q || "").trim().toLowerCase();
    const cat = state.cat;
    const showSelected = !!state.showSelected;

    return Object.keys(cropData || {})
      .sort((a, b) => a.localeCompare(b))
      .filter(name => {
        if (showSelected && !selected.has(name)) return false;
        if (q && !name.toLowerCase().includes(q)) return false;
        if (cat && cat !== "__all__") {
          const f = decodeFilterValue(cat);
          const base = getCropBaseCategory(catMap, name);
          if (f.kind === "base") {
            if (base !== f.base) return false;
          } else if (f.kind === "sub") {
            const group = inferCropGroup(base, name);
            if (base !== f.base || group !== f.group) return false;
          }
        }
        return true;
      });
  }

  function render() {
    const visible = getVisibleNames();
    const byCat = new Map();

    visible.forEach(name => {
      const c = getCropBaseCategory(catMap, name);
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c).push(name);
    });

    // Order categories: selected filter category first (if not all), then common, then alpha.
    const common = ["Vegetables", "Fruits", "Herbs", "Flowers"];
    const cats = Array.from(byCat.keys());
    cats.sort((a, b) => a.localeCompare(b));

    let orderedCats = cats;
    const focus = decodeFilterValue(state.cat);
    const focusBase = (focus.kind === "base" || focus.kind === "sub") ? focus.base : null;
    if (focusBase && byCat.has(focusBase)) {
      orderedCats = [focusBase, ...cats.filter(c => c !== focusBase)];
    } else {
      orderedCats = [
        ...common.filter(c => byCat.has(c)),
        ...cats.filter(c => !common.includes(c))
      ];
    }

    // Render grouped <details> for quick scanning
    listEl.innerHTML = "";
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.style.color = "var(--text-light)";
      empty.style.padding = "8px 4px";
      empty.textContent = "No crops match your filters.";
      listEl.appendChild(empty);
      return;
    }

    orderedCats.forEach(cat => {
      const names = byCat.get(cat);
      if (!names || !names.length) return;

      const details = document.createElement("details");
      details.className = "perpetual-crop-group";
      const openCats = (state.openCats ||= {});
      const hasSelected = names.some(n => selected.has(n));
      const defaultOpen =
        (focusBase && cat === focusBase) ||
        (!!state.q && names.length > 0) ||
        (state.showSelected && hasSelected) ||
        hasSelected;

      const remembered = Object.prototype.hasOwnProperty.call(openCats, cat) ? openCats[cat] : null;
      details.open = remembered != null ? !!remembered : !!defaultOpen;
      details.addEventListener("toggle", () => {
        openCats[cat] = details.open;
      });

      const summary = document.createElement("summary");
      summary.className = "perpetual-crop-group-title";
      summary.textContent = `${cat} (${names.length})`;
      details.appendChild(summary);

      const grid = document.createElement("div");
      grid.className = "perpetual-crop-grid";

      names.forEach(crop => {
        const label = document.createElement("label");
        label.className = "perpetual-crop-item";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = crop;
        checkbox.checked = selected.has(crop);
        if (checkbox.checked) label.classList.add("is-selected");

        checkbox.addEventListener("change", () => {
          const next = new Set(Array.isArray(cfg.selectedCrops) ? cfg.selectedCrops : []);
          if (checkbox.checked) next.add(crop);
          else next.delete(crop);

          cfg.selectedCrops = Array.from(next);
          // Save to the owning My Garden plan (same storage model you already use)
          savePlans();

          // Keep local selected in sync so bulk actions work instantly
          if (checkbox.checked) {
            selected.add(crop);
            label.classList.add("is-selected");
          } else {
            selected.delete(crop);
            label.classList.remove("is-selected");
          }

          // If we're in "show selected only", re-render immediately so unchecked items disappear
          if (state.showSelected) render();
        });

        const text = document.createElement("span");
        text.textContent = crop;

        label.appendChild(checkbox);
        label.appendChild(text);
        grid.appendChild(label);
      });

      details.appendChild(grid);
      listEl.appendChild(details);
    });

    // Update bulk-action button states
    if (btnSelectVisible) btnSelectVisible.disabled = visible.length === 0;
    if (btnClearVisible) btnClearVisible.disabled = visible.length === 0;
  }

  // Wire events once
  if (tools && !tools.dataset.wired) {
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        state.q = searchInput.value || "";
        render();
      });
    }

    if (catSelect) {
      catSelect.addEventListener("change", () => {
        state.cat = catSelect.value || "__all__";
        render();
      });
    }

    if (showSelectedToggle) {
      showSelectedToggle.addEventListener("change", () => {
        state.showSelected = !!showSelectedToggle.checked;
        render();
      });
    }

    if (btnSelectVisible) {
      btnSelectVisible.addEventListener("click", () => {
        const visible = getVisibleNames();
        const next = new Set(Array.isArray(cfg.selectedCrops) ? cfg.selectedCrops : []);
        visible.forEach(n => next.add(n));
        cfg.selectedCrops = Array.from(next);
        savePlans();
        visible.forEach(n => selected.add(n));
        render();
      });
    }

    if (btnClearVisible) {
      btnClearVisible.addEventListener("click", () => {
        const visible = getVisibleNames();
        const next = new Set(Array.isArray(cfg.selectedCrops) ? cfg.selectedCrops : []);
        visible.forEach(n => next.delete(n));
        cfg.selectedCrops = Array.from(next);
        savePlans();
        visible.forEach(n => selected.delete(n));
        render();
      });
    }


    if (btnExpandAll) {
      btnExpandAll.addEventListener("click", () => {
        const openCats = (state.openCats ||= {});
        listEl.querySelectorAll("details.perpetual-crop-group").forEach(d => {
          d.open = true;
          const sum = d.querySelector("summary");
          if (sum) {
            const catName = (sum.textContent || "").replace(/\s*\(\d+\)\s*$/, "").trim();
            if (catName) openCats[catName] = true;
          }
        });
      });
    }

    if (btnCollapseAll) {
      btnCollapseAll.addEventListener("click", () => {
        const openCats = (state.openCats ||= {});
        listEl.querySelectorAll("details.perpetual-crop-group").forEach(d => {
          d.open = false;
          const sum = d.querySelector("summary");
          if (sum) {
            const catName = (sum.textContent || "").replace(/\s*\(\d+\)\s*$/, "").trim();
            if (catName) openCats[catName] = false;
          }
        });
      });
    }

    tools.dataset.wired = "1";
  }

  render();
}


function renderPerpetual() {
  // Draw the shared plan tabs in this tab too
  if (typeof renderPlanTabs === 'function') {
    renderPlanTabs('perpetual');
  }

  // Config for the CURRENT My Garden plan
  const cfg = (typeof getCurrentPerpetualConfig === "function")
    ? getCurrentPerpetualConfig()
    : null;

  // ===== 1) Populate checkbox crop list =====
  const list = document.getElementById('perpetualCropList');
  if (!list) {
    console.warn("Perpetual: #perpetualCropList not found");
    return;
  }
    // Render searchable + grouped crop picker (replaces the old single long list)
  renderPerpetualCropPicker(list, cfg);

  // ===== 2) Restore controls (start date, days, count, etc.) =====
  const startInput = document.getElementById('perpetualStartDate');
  if (startInput) {
    if (cfg && cfg.startDate) {
      startInput.value = cfg.startDate;
    } else {
      const today = new Date().toISOString().split('T')[0];
      startInput.value = today;
    }
  }

  const daysInput = document.getElementById('successionDays');
  const countInput = document.getElementById('successionCount');
  const perRowInput = document.getElementById('successionsPerRow');
  const showGapInput = document.getElementById('showGapFillers');

  if (cfg) {
    if (daysInput && typeof cfg.daysBetween === "number") {
      daysInput.value = cfg.daysBetween;
    }
    if (countInput && typeof cfg.successionCount === "number") {
      countInput.value = cfg.successionCount;
    }
    if (perRowInput && typeof cfg.successionsPerRow === "number") {
      perRowInput.value = cfg.successionsPerRow;
    }
    if (showGapInput) {
      showGapInput.checked = cfg.showGapFillers !== false;
    }
  } else {
    // sensible defaults if no cfg yet
    if (daysInput && !daysInput.value) daysInput.value = 14;
    if (countInput && !countInput.value) countInput.value = 6;
    if (perRowInput && !perRowInput.value) perRowInput.value = 3;
    if (showGapInput) showGapInput.checked = true;
  }

  // ===== 3) Clear timeline before rebuilding =====
  const timeline = document.getElementById('perpetualTimeline');
  if (timeline) {
    timeline.innerHTML = '';
  }

  // ===== 4) Auto-build from THIS plan's saved config (if any) =====
  if (
    cfg &&
    Array.isArray(cfg.selectedCrops) &&
    cfg.selectedCrops.length > 0 &&
    cfg.startDate &&
    typeof buildPerpetualPlan === "function"
  ) {
    // true = "build from saved state, don't re-save"
    buildPerpetualPlan(true);
  }
}

function buildPerpetualPlan(fromState = false) {
  const cfg = getCurrentPerpetualConfig();

  const checkboxes = document.querySelectorAll('#perpetualCropList input[type="checkbox"]:checked');
  const selectedCrops = Array.from(checkboxes).map(cb => cb.value);

  if (selectedCrops.length === 0) {
    alert('Please select at least one crop.');
    return;
  }

  const daysBetween       = parseInt(document.getElementById('successionDays').value)      || 14;
  const successionCount   = parseInt(document.getElementById('successionCount').value)     || 6;
  const successionsPerRow = parseInt(document.getElementById('successionsPerRow').value)   || 3;
  const startDateStr      = document.getElementById('perpetualStartDate').value;

  if (!startDateStr) {
    alert('Please select a planning start date.');
    return;
  }

const container = document.getElementById('perpetualTimeline');
if (!container) return;

// Each click on "Build Perpetual Plan" creates one vertical run
const run = document.createElement('div');
run.className = 'perpetual-run';


  // ----- build vertical groups per crop -----
  selectedCrops.forEach(crop => {
    const data = cropData[crop];
    if (!data) return;

    const group = document.createElement('div');
    group.className = 'perpetual-crop-group';

const header = document.createElement('div');
header.className = 'perpetual-crop-header';

const title = document.createElement('div');
title.className = 'perpetual-crop-title';
title.textContent = crop;

const meta = document.createElement('div');
meta.className = 'perpetual-crop-meta';
meta.textContent = `${successionCount} successions • every ${daysBetween} days`;

// little arrow on the right
const chevron = document.createElement('span');
chevron.className = 'perpetual-chevron';
chevron.textContent = '▾';

header.appendChild(title);
header.appendChild(meta);
header.appendChild(chevron);


    const body = document.createElement('div');
    body.className = 'perpetual-crop-body';

    let currentDate = new Date(startDateStr);

    for (let i = 1; i <= successionCount; i++) {
      const dates = calculateCropDates(crop, currentDate);

      const block = document.createElement('div');
      block.className = 'perpetual-block';

      const risk =
        (currentDate.getMonth() >= 5 && currentDate.getMonth() <= 8)
          ? 'Heat / bolting risk'
          : 'Low risk';

      block.innerHTML = `
        <strong>${crop} — Succession ${i}</strong><br>
        Plant: ${formatDate(currentDate)}<br>
        Start Indoors: ${dates.start}<br>
        Transplant: ${dates.transplant || 'Direct sow'}<br>
        Harvest: ${dates.harvest}<br>
        <div class="perpetual-meta">
          Coverage: ${daysBetween <= 10 ? 'High' : daysBetween <= 21 ? '2–3 weeks' : '3+ weeks'}<br>
          Risk: ${risk}<br>
          Companions: ${data.companions || 'None listed'}
        </div>
      `;

      if (data.succession && data.succession.includes('Every')) {
        const badge = document.createElement('div');
        badge.className = 'perpetual-succession';
        badge.textContent = '↻ ' + data.succession;
        block.appendChild(badge);
      }

      body.appendChild(block);

      // advance plant date for next succession
      currentDate = new Date(currentDate);
      currentDate.setDate(currentDate.getDate() + daysBetween);
    }

    // click header to collapse/expand this crop’s stack
    header.onclick = () => {
      group.classList.toggle('collapsed');
    };

    group.appendChild(header);
    group.appendChild(body);
    run.appendChild(group);
  });

  // ----- persist config onto the plan -----
  if (cfg) {
    cfg.selectedCrops     = selectedCrops;
    cfg.daysBetween       = daysBetween;
    cfg.successionCount   = successionCount;
    cfg.successionsPerRow = successionsPerRow;
    cfg.startDate         = startDateStr;
    cfg.showGapFillers    = document.getElementById('showGapFillers').checked;

    if (!Array.isArray(cfg.appliedEntryIds)) {
      cfg.appliedEntryIds = [];
    }
  }

  // ----- optional: push into My Garden -----
  const applyToMyGarden = document.getElementById('perpetualApplyToMyGarden')?.checked;

  if (cfg && applyToMyGarden && typeof getCurrentPlan === 'function') {
    const plan = getCurrentPlan('mygarden');
    if (plan) {
      if (!Array.isArray(plan.entries)) {
        plan.entries = [];
      }

      // remove previously-applied entries for *this* perpetual config
      if (Array.isArray(cfg.appliedEntryIds) && cfg.appliedEntryIds.length > 0) {
        const idSet = new Set(cfg.appliedEntryIds);
        plan.entries = plan.entries.filter(e => !idSet.has(e.id));
      }

      const newIds = [];
      const baseDate = new Date(startDateStr);

      selectedCrops.forEach(crop => {
        let currentDate = new Date(baseDate);
        for (let i = 1; i <= successionCount; i++) {
          const entryId =
            `perp_${Date.now()}_${crop}_${i}_${Math.random().toString(36).slice(2,7)}`;

          const entry = {
            id: entryId,
            crop,
            referenceDate: formatDate(currentDate),
            addedDate: new Date().toISOString(),
            source: 'perpetual',
            successionIndex: i,
            successionGapDays: daysBetween
          };

          plan.entries.push(entry);
          newIds.push(entryId);

          currentDate = new Date(currentDate);
          currentDate.setDate(currentDate.getDate() + daysBetween);
        }
      });

      cfg.appliedEntryIds = newIds;

      if (typeof savePlans === 'function') savePlans();
      if (typeof loadMyGardenTab === 'function') loadMyGardenTab();
      if (typeof renderTimeline === 'function') renderTimeline();
    }
  } else {
    if (cfg && !fromState && typeof savePlans === 'function') {
      savePlans();
    }
  }

  // ----- gap filler box -----
  if (document.getElementById('showGapFillers').checked) {
    const filler = document.createElement('div');
    filler.className = 'crop-column perpetual-gap-filler';
    filler.style.background = '#002233';
    filler.style.padding = '20px';
    filler.style.borderRadius = '12px';
    filler.style.margin = '24px auto 0';
    filler.style.maxWidth = '600px';

    let suggestions = [];

    selectedCrops.forEach(crop => {
      const lc = crop.toLowerCase();
      if (lc.includes('lettuce') || lc.includes('spinach')) {
        suggestions.push('Radish', 'Arugula', 'Baby Greens');
      } else if (lc.includes('basil') || lc.includes('dill')) {
        suggestions.push('Cilantro', 'Parsley', 'Chervil');
      } else if (lc.includes('fennel')) {
        suggestions.push('Dill', 'Cilantro', 'Anise');
      } else {
        suggestions.push('Radish', 'Green Onions', 'Baby Spinach');
      }
    });

    suggestions = [...new Set(suggestions)];

    filler.innerHTML = `
      <h3 style="color:var(--success); text-align:center; margin-top:0;">Gap Filler Suggestions</h3>
      <div class="perpetual-block">
        <strong>Quick Crops (25–40 days):</strong><br>
        • ${suggestions.slice(0, 4).join('<br>• ')}<br><br>
        Perfect for filling gaps between your selected crops!
      </div>
    `;

    run.appendChild(filler);
  }

  container.appendChild(run);

}

function clearCurrentPerpetualPlan() {
  if (typeof getCurrentPlan !== 'function') return;
  const plan = getCurrentPlan('mygarden');
  if (!plan || !plan.perpetual) return;

  const cfg = plan.perpetual;

  // Remove any entries created by this perpetual config
  if (Array.isArray(cfg.appliedEntryIds) && cfg.appliedEntryIds.length > 0 && Array.isArray(plan.entries)) {
    const idSet = new Set(cfg.appliedEntryIds);
    plan.entries = plan.entries.filter(e => !idSet.has(e.id));
  }

  // Reset config
  plan.perpetual = {
    selectedCrops: [],
    daysBetween: 14,
    successionCount: 6,
    successionsPerRow: 3,
    startDate: null,
    showGapFillers: true,
    appliedEntryIds: []
  };

  if (typeof savePlans === 'function') savePlans();
  if (typeof loadMyGardenTab === 'function') loadMyGardenTab();
  if (typeof renderTimeline === 'function') renderTimeline();

  // Re-render perpetual UI in a clean state
  renderPerpetual();
}


document.addEventListener("DOMContentLoaded", () => {
  renderPerpetualPlanTabs();
  renderPerpetual();
});