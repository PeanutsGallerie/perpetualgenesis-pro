               // Spacing & Yield Calculator data and functions
        const spacingData = {
    "Amaranth (grain/leaf type)": { sqft: 4, rowInPlant: 8, rowBetween: 12, yield: "1–3 lbs" },
    "Arugula": { sqft: 9, rowInPlant: 4, rowBetween: 8, yield: "season-long harvest" },
    "Artichoke": { sqft: 1, rowInPlant: 48, rowBetween: 72, yield: "5–10 heads" },
    "Asparagus (crowns)": { sqft: 1, rowInPlant: 18, rowBetween: 48, yield: "0.5 lb/year after year 3" },
    "Basil": { sqft: 4, rowInPlant: 8, rowBetween: 12, yield: "season-long harvest" },
    "Beans (bush/pole)": { sqft: 4, rowInPlant: 4, rowBetween: 24, yield: "0.5–1 lb" },
    "Beets": { sqft: 16, rowInPlant: 3, rowBetween: 12, yield: "0.2 lb each" },
    "Bok Choy": { sqft: 4, rowInPlant: 8, rowBetween: 18, yield: "1–2 lbs" },
    "Broccoli": { sqft: 1, rowInPlant: 18, rowBetween: 36, yield: "1–2 lbs" },
    "Brussels Sprouts": { sqft: 1, rowInPlant: 24, rowBetween: 36, yield: "1–2 lbs" },
    "Cabbage": { sqft: 1, rowInPlant: 18, rowBetween: 36, yield: "2–4 lbs" },
    "Cantaloupe": { sqft: 1, rowInPlant: 36, rowBetween: 72, yield: "2–5 fruits" },
    "Carrots": { sqft: 16, rowInPlant: 3, rowBetween: 12, yield: "0.1–0.2 lb each" },
    "Cauliflower": { sqft: 1, rowInPlant: 18, rowBetween: 36, yield: "2–3 lbs" },
    "Celery & Celeriac": { sqft: 4, rowInPlant: 8, rowBetween: 24, yield: "1–2 lbs" },
    "Chard (Rainbow)": { sqft: 4, rowInPlant: 12, rowBetween: 18, yield: "season-long harvest" },
    "Chervil": { sqft: 9, rowInPlant: 6, rowBetween: 12, yield: "season-long" },
    "Chicory / Endive": { sqft: 4, rowInPlant: 8, rowBetween: 12, yield: "1–2 heads or season-long leaves" },
    "Chives": { sqft: 9, rowInPlant: 6, rowBetween: 8, yield: "season-long harvest" },
    "Cilantro/Coriander": { sqft: 9, rowInPlant: 6, rowBetween: 12, yield: "season-long" },
    "Collards": { sqft: 1, rowInPlant: 18, rowBetween: 30, yield: "season-long harvest" },
    "Corn": { sqft: 1, rowInPlant: 12, rowBetween: 36, yield: "1–2 ears" },
    "Cucumber": { sqft: 1, rowInPlant: 24, rowBetween: 60, yield: "10–20 fruits" },
    "Dill": { sqft: 4, rowInPlant: 12, rowBetween: 18, yield: "season-long" },
    "Eggplant": { sqft: 1, rowInPlant: 24, rowBetween: 36, yield: "5–10 fruits" },
    "Fennel (bulb)": { sqft: 1, rowInPlant: 12, rowBetween: 18, yield: "1 bulb (1–2 lbs)" },
    "Fennel (herb leaf)": { sqft: 4, rowInPlant: 8, rowBetween: 12, yield: "season-long harvest" },
    "Garlic (cloves)": { sqft: 4, rowInPlant: 4, rowBetween: 12, yield: "0.25–0.5 lb per bulb" },
    "Ground Cherry": { sqft: 1, rowInPlant: 24, rowBetween: 36, yield: "1–2 lbs" },
    "Green Onions / Scallions": { sqft: 16, rowInPlant: 2, rowBetween: 4, yield: "quick continuous harvest" },
    "Honeydew": { sqft: 1, rowInPlant: 36, rowBetween: 72, yield: "2–4 fruits" },
    "Hot Peppers": { sqft: 1, rowInPlant: 18, rowBetween: 30, yield: "20–50 fruits" },
    "Hyssop": { sqft: 4, rowInPlant: 12, rowBetween: 18, yield: "perennial – season-long" },
    "Kale": { sqft: 1, rowInPlant: 12, rowBetween: 24, yield: "season-long harvest" },
    "Kohlrabi": { sqft: 4, rowInPlant: 6, rowBetween: 12, yield: "1–2 bulbs (0.5–1 lb each)" },
    "Lavender": { sqft: 1, rowInPlant: 24, rowBetween: 36, yield: "perennial – bunches" },
    "Leeks": { sqft: 4, rowInPlant: 6, rowBetween: 12, yield: "1–2 stalks per plant" },
    "Lemon Balm": { sqft: 1, rowInPlant: 18, rowBetween: 24, yield: "season-long harvest" },
    "Lettuce": { sqft: 4, rowInPlant: 8, rowBetween: 12, yield: "0.5–1 lb" },
    "Lima Beans": { sqft: 4, rowInPlant: 6, rowBetween: 24, yield: "0.5–1.5 lbs" },
    "Marjoram": { sqft: 4, rowInPlant: 8, rowBetween: 12, yield: "season-long harvest" },
    "Mint": { sqft: 1, rowInPlant: 12, rowBetween: 18, yield: "season-long (very vigorous)" },
    "Mizuna": { sqft: 9, rowInPlant: 4, rowBetween: 6, yield: "season-long harvest" },
    "Mustard Greens": { sqft: 9, rowInPlant: 4, rowBetween: 8, yield: "season-long harvest" },
    "Okra": { sqft: 1, rowInPlant: 18, rowBetween: 36, yield: "1–2 lbs" },
    "Onions": { sqft: 16, rowInPlant: 4, rowBetween: 12, yield: "0.5–1 lb each" },
    "Oregano": { sqft: 4, rowInPlant: 8, rowBetween: 12, yield: "season-long harvest" },
    "Parsley": { sqft: 4, rowInPlant: 8, rowBetween: 18, yield: "season-long" },
    "Parsnips": { sqft: 16, rowInPlant: 3, rowBetween: 12, yield: "0.3–0.5 lb each" },
    "Peas": { sqft: 4, rowInPlant: 4, rowBetween: 24, yield: "0.5 lb" },
    "Peppers": { sqft: 1, rowInPlant: 18, rowBetween: 30, yield: "5–15 fruits" },
    "Potatoes": { sqft: 1, rowInPlant: 12, rowBetween: 36, yield: "3–5 lbs" },
    "Pumpkins": { sqft: 1, rowInPlant: 48, rowBetween: 96, yield: "1–3 fruits" },
    "Radishes": { sqft: 16, rowInPlant: 2, rowBetween: 12, yield: "quick harvest" },
    "Rhubarb": { sqft: 1, rowInPlant: 36, rowBetween: 48, yield: "5–10 lbs per mature plant" },
    "Rosemary": { sqft: 1, rowInPlant: 24, rowBetween: 36, yield: "perennial – season-long" },
    "Rutabaga": { sqft: 4, rowInPlant: 8, rowBetween: 12, yield: "2–4 lbs per root" },
    "Sage": { sqft: 1, rowInPlant: 18, rowBetween: 24, yield: "perennial – season-long" },
    "Shallots (sets)": { sqft: 9, rowInPlant: 4, rowBetween: 8, yield: "0.5–1 lb per cluster" },
    "Snap Peas": { sqft: 4, rowInPlant: 4, rowBetween: 24, yield: "0.5–1 lb" },
    "Sorrel": { sqft: 4, rowInPlant: 8, rowBetween: 12, yield: "season-long harvest" },
    "Spinach": { sqft: 9, rowInPlant: 4, rowBetween: 12, yield: "season-long" },
    "Squash (summer/winter)": { sqft: 1, rowInPlant: 36, rowBetween: 48, yield: "10–20 lbs" },
    "Strawberries": { sqft: 4, rowInPlant: 12, rowBetween: 12, yield: "0.5–1 lb per plant" },
    "Summer Squash": { sqft: 1, rowInPlant: 36, rowBetween: 48, yield: "10–20 lbs" },
    "Sweet Potatoes (slips)": { sqft: 1, rowInPlant: 12, rowBetween: 36, yield: "3–8 lbs" },
    "Swiss Chard": { sqft: 4, rowInPlant: 12, rowBetween: 18, yield: "season-long" },
    "Tarragon": { sqft: 1, rowInPlant: 18, rowBetween: 24, yield: "perennial – season-long" },
    "Tatsoi": { sqft: 9, rowInPlant: 4, rowBetween: 6, yield: "season-long harvest" },
    "Thyme": { sqft: 9, rowInPlant: 6, rowBetween: 8, yield: "perennial – season-long" },
    "Tomatillos": { sqft: 1, rowInPlant: 24, rowBetween: 36, yield: "5–15 fruits" },
    "Tomatoes": { sqft: 1, rowInPlant: 24, rowBetween: 48, yield: "10–20 lbs" },
    "Turnips": { sqft: 16, rowInPlant: 3, rowBetween: 12, yield: "0.2–0.4 lb each" },
    "Watercress": { sqft: 9, rowInPlant: 4, rowBetween: 6, yield: "season-long harvest" },
    "Watermelon": { sqft: 0.5, rowInPlant: 48, rowBetween: 96, yield: "1–3 fruits (20–50 lbs)" },
    "Winter Squash": { sqft: 1, rowInPlant: 36, rowBetween: 60, yield: "10–30 lbs" },
    "Zucchini": { sqft: 1, rowInPlant: 36, rowBetween: 48, yield: "10–25 lbs" },
            // Add more as needed
        };
        window.spacingData = spacingData;

        // === Per-plan Spacing & Yield state ===

const SPACING_STATE_BASE = "PG_SPACING_STATE";
const SPACING_ACTIVE_PLAN_KEY = "PG_SPACING_ACTIVE_PLAN";


// Scope DOM lookups to the Spacing tab so we don't touch similarly-named controls on other tabs.
function spacingRootEl() {
  return document.getElementById("spacing");
}
function spacingById(id) {
  const root = spacingRootEl();
  if (root) {
    const el = root.querySelector("#" + id);
    if (el) return el;
  }
  return document.getElementById(id);
}
function spacingQuery(selector) {
  const root = spacingRootEl();
  return root ? root.querySelector(selector) : document.querySelector(selector);
}
function spacingQueryAll(selector) {
  const root = spacingRootEl();
  return root ? Array.from(root.querySelectorAll(selector)) : Array.from(document.querySelectorAll(selector));
}


// ───────────────────────────────────────────────────────────────
// Pro gates for Spacing tool
// ───────────────────────────────────────────────────────────────
function spacingRequire(featureKey, message) {
  try {
    if (typeof window.pgRequire === "function") {
      return !!window.pgRequire(featureKey, message || "This feature is available in Pro.");
    }
  } catch (e) {}
  // If pgRequire is not present (internal/dev), allow.
  return true;
}

function renderProLockedNote(title, body) {
  return `
    <div style="margin-top:14px; padding:10px 12px; border:1px solid rgba(255,255,255,.12); border-radius:10px; opacity:.92;">
      <strong>${title}</strong><br>
      <div style="margin-top:6px; opacity:.85;">${body}</div>
    </div>
  `;
}

/* =========================
   Spacing UI: live style toggle
   ========================= */

function setSpacingMode(mode) {
  const sqftInputs = document.getElementById("sqftInputs");
  const rowInputs  = document.getElementById("rowInputs");

  if (!sqftInputs || !rowInputs) return;

  const isRows = mode === "rows";
  sqftInputs.style.display = isRows ? "none" : "";
  rowInputs.style.display  = isRows ? "" : "none";
}

function bindSpacingModeToggle() {
  const radios = Array.from(document.querySelectorAll('input[name="style"]'));
  if (!radios.length) return;

  // Prevent double-binding if your scripts re-run
  if (radios[0].dataset.pgBound === "1") return;
  radios.forEach(r => (r.dataset.pgBound = "1"));

  const sync = () => {
    const mode = document.querySelector('input[name="style"]:checked')?.value || "sqft";
    setSpacingMode(mode);
  };

  radios.forEach(radio => {
    radio.addEventListener("change", () => {
      sync();

      // Optional: if you already persist spacing state, keep it consistent
      if (typeof saveSpacingState === "function") saveSpacingState();
    });
  });

  // Ensure correct view immediately on load
  sync();
}



/**
 * Spacing is an independent tool:
 * - It may show plan tabs for convenience,
 * - but it must NOT change the app-wide currentPlanId / gardenPlans.currentMyGarden,
 *   and must NOT trigger Layout / Timeline / My Garden rerenders.
 */
function getSpacingActivePlanId() {
  try {
    const stored = localStorage.getItem(SPACING_ACTIVE_PLAN_KEY);
    if (stored) return stored;

    // Default to the current My Garden plan for first-time users (read-only)
    const fallback =
      (typeof currentPlanId !== "undefined" && currentPlanId && currentPlanId.mygarden) ||
      (typeof gardenPlans !== "undefined" && gardenPlans && gardenPlans.currentMyGarden) ||
      "main";

    localStorage.setItem(SPACING_ACTIVE_PLAN_KEY, fallback);
    return fallback;
  } catch (e) {
    return "main";
  }
}

function setSpacingActivePlanId(planId) {
  try {
    if (!planId) return;
    localStorage.setItem(SPACING_ACTIVE_PLAN_KEY, planId);
  } catch (e) {}
}

function getSpacingStateKey() {
  // Independent per-plan keying (does NOT use perPlanKey/currentPlanId)
  const planId = getSpacingActivePlanId();
  return `${SPACING_STATE_BASE}__${planId}`;
}


function saveSpacingState() {
  try {
    const cropEl = spacingById('spacingCrop');
    const cropBEl = spacingById('spacingCropB');
    const styleEl = spacingQuery('input[name="style"]:checked');
    const resultEl = spacingById('spacingResult');

    const state = {
      crop: cropEl ? cropEl.value : "",
      cropB: cropBEl ? cropBEl.value : "",
      compareEnabled: !!spacingById('spacingCompareToggle')?.checked,

      style: styleEl ? styleEl.value : "sqft",
      intensity: spacingById('spacingIntensity')?.value || "standard",
      seedsPerPacket: spacingById('seedsPerPacket')?.value ?? "",

      bedWidth: spacingById('bedWidth')?.value ?? "",
      bedLength: spacingById('bedLength')?.value ?? "",
      rowLength: spacingById('rowLength')?.value ?? "",
      numRows: spacingById('numRows')?.value ?? "",

      successionStart: spacingById('successionStartDate')?.value ?? "",
      successionInterval: spacingById('successionIntervalDays')?.value ?? "",
      successionBatches: spacingById('successionBatches')?.value ?? "",

      notes: spacingById('spacingNotes')?.value ?? "",

      resultHtml: resultEl ? resultEl.innerHTML : "",
      resultVisible: resultEl ? resultEl.style.display !== "none" : false
    };

    localStorage.setItem(getSpacingStateKey(), JSON.stringify(state));
  } catch (e) {
    console.warn("Spacing: failed to save state", e);
  }
}

function restoreSpacingState() {
  try {
    const raw = localStorage.getItem(getSpacingStateKey());
    if (!raw) return;
    const state = JSON.parse(raw);

    // Ensure crop dropdown(s) exist and have options before setting values
    // (populateSpacingCrops is called on tab open in core.js)
    const cropSelect = spacingById('spacingCrop');
    const cropSelectB = spacingById('spacingCropB');

    if (cropSelect && state.crop && spacingData[state.crop]) {
      cropSelect.value = state.crop;
    }
    if (cropSelectB && state.cropB && spacingData[state.cropB]) {
      cropSelectB.value = state.cropB;
    }

    // Compare toggle
    const compareToggle = spacingById('spacingCompareToggle');
    if (compareToggle) compareToggle.checked = !!state.compareEnabled;
    const compareBox = spacingById('spacingCompareBox');
    if (compareBox) compareBox.style.display = compareToggle?.checked ? "" : "none";

    // Style radio (sqft / rows)
    const style = state.style || "sqft";
    spacingQueryAll('input[name="style"]').forEach(r => {
      r.checked = (r.value === style);
    });

    // Show/hide the correct input group
    const sqftInputs = spacingById('sqftInputs');
    const rowInputs = spacingById('rowInputs');
    if (sqftInputs && rowInputs) {
      if (style === "sqft") {
        sqftInputs.style.display = "";
        rowInputs.style.display = "none";
      } else {
        sqftInputs.style.display = "none";
        rowInputs.style.display = "";
      }
    }

    // Restore numeric inputs
    const bw = spacingById('bedWidth');
    if (bw && state.bedWidth != null) bw.value = state.bedWidth;

    const bl = spacingById('bedLength');
    if (bl && state.bedLength != null) bl.value = state.bedLength;

    const rl = spacingById('rowLength');
    if (rl && state.rowLength != null) rl.value = state.rowLength;

    const nr = spacingById('numRows');
    if (nr && state.numRows != null) nr.value = state.numRows;

    // Enhancements
    const intensity = spacingById('spacingIntensity');
    if (intensity && state.intensity) intensity.value = state.intensity;

    const spp = spacingById('seedsPerPacket');
    if (spp && state.seedsPerPacket != null && state.seedsPerPacket !== "") spp.value = state.seedsPerPacket;

    const ss = spacingById('successionStartDate');
    if (ss && state.successionStart != null) ss.value = state.successionStart;

    const si = spacingById('successionIntervalDays');
    if (si && state.successionInterval != null && state.successionInterval !== "") si.value = state.successionInterval;

    const sb = spacingById('successionBatches');
    if (sb && state.successionBatches != null && state.successionBatches !== "") sb.value = state.successionBatches;

    const notes = spacingById('spacingNotes');
    if (notes && state.notes != null) notes.value = state.notes;

    // Restore result box
    const resultEl = spacingById('spacingResult');
    if (resultEl && state.resultHtml) {
      resultEl.innerHTML = state.resultHtml;
      resultEl.style.display = state.resultVisible ? "block" : "none";
    }
  } catch (e) {
    console.warn("Spacing: failed to restore state", e);
  }
}


        
function populateSpacingCrops() {
  const selects = [
    spacingById('spacingCrop'),
    spacingById('spacingCropB')
  ].filter(Boolean);

  selects.forEach(sel => {
    sel.innerHTML = '<option value="">Select a crop...</option>';
  });

  const crops = (typeof cropData !== "undefined" && cropData)
    ? Object.keys(cropData).sort()
    : Object.keys(spacingData).sort();

  crops.forEach(crop => {
    if (!spacingData[crop]) return;
    selects.forEach(sel => {
      const opt = document.createElement('option');
      opt.value = crop;
      opt.textContent = crop;
      sel.appendChild(opt);
    });
  });
}

        // FIXED: calculateSpacing() – the main bug causing the entire script to fail
    
function getIntensityFactor(intensity) {
  if (intensity === "conservative") return 0.85;
  if (intensity === "intensive") return 1.15;
  return 1.0; // standard
}

function safeNumber(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function parseYieldEstimate(yieldStr, plants) {
  const ys = (yieldStr || "").trim();
  if (!ys) return "—";

  // Non-numeric yield descriptors: leave as-is
  if (!/[0-9]/.test(ys)) return ys;

  // Extract up to two numbers (supports decimals)
  const nums = ys.match(/\d+(?:\.\d+)?/g) || [];
  if (nums.length === 0) return ys;

  const low = parseFloat(nums[0]);
  const high = parseFloat(nums[1] || nums[0]);

  // Unit: remove numbers and common range punctuation
  const unit = ys.replace(/[0-9\.]/g, "")
                 .replace(/[–-]/g, "")
                 .trim();

  // Multiply per-plant/heads/fruits ranges by plant count (best-effort)
  // If yield is clearly "per year" or "after year 3", we still scale but keep text
  const scaledLow = Math.round(low * plants);
  const scaledHigh = Math.round(high * plants);

  if (scaledLow === scaledHigh) {
    return `${scaledLow} ${unit}`.trim();
  }
  return `${scaledLow}–${scaledHigh} ${unit}`.trim();
}

function buildSpacingSummaryText(opts) {
  const lines = [];
  lines.push(`Spacing & Yield Summary`);
  lines.push(`Crop: ${opts.crop}`);
  if (opts.compare && opts.cropB) lines.push(`Compare: ${opts.cropB}`);
  lines.push(`Style: ${opts.style.toUpperCase()}`);
  lines.push(`Intensity: ${opts.intensity}`);
  lines.push(`Area: ${opts.areaSqFt.toFixed(2)} sq ft`);
  lines.push(`Plants: ${opts.plants}`);
  lines.push(`Seeds (20% extra): ${opts.seeds}`);
  if (opts.packets != null) lines.push(`Seed packets: ${opts.packets} (at ${opts.seedsPerPacket} seeds/packet)`);
  lines.push(`Yield: ${opts.yieldText}`);
  if (opts.warnings && opts.warnings.length) {
    lines.push(`Warnings: ${opts.warnings.join(" | ")}`);
  }
  if (opts.notes) {
    lines.push(`Notes: ${opts.notes}`);
  }
  return lines.join("\n");
}

function buildSuccessionSchedule(crop, startDateStr, batches, intervalDays) {
  const cropKey = (crop || "").toLowerCase();
  const rule = (typeof cropSuccessionData !== "undefined" && cropSuccessionData && cropSuccessionData[cropKey])
    ? cropSuccessionData[cropKey]
    : null;

  const suggestedInterval = rule?.interval || 14;
  const effectiveInterval = intervalDays > 0 ? intervalDays : suggestedInterval;

  if (!startDateStr) return { html: "", effectiveInterval };

  const start = new Date(startDateStr);
  if (isNaN(start.getTime())) return { html: "", effectiveInterval };

  const n = Math.max(1, Math.min(50, batches || 6));

  const items = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + (i * effectiveInterval));
    items.push(d.toLocaleDateString());
  }

  const regrowsTxt = rule ? (rule.regrows ? "Regrows" : "Does not regrow") : "Unknown regrow behavior";
  const hwTxt = rule?.harvestWindow ? `Harvest window ~${rule.harvestWindow} days` : "";

  const html = `
    <div style="margin-top:14px;">
      <strong>Succession Planner</strong><br>
      <div style="opacity:.85; margin:6px 0;">
        Suggested interval: ${suggestedInterval} days • Using: ${effectiveInterval} days • ${regrowsTxt}${hwTxt ? " • " + hwTxt : ""}
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${items.map((d, idx) => `<span class="spacing-chip">Batch ${idx + 1}: ${d}</span>`).join("")}
      </div>
    </div>
  `;
  return { html, effectiveInterval };
}

function calculateSpacing() {
  const crop = spacingById('spacingCrop')?.value;
  if (!crop || !spacingData[crop]) {
    alert('Please select a crop from the list.');
    return;
  }

  const compareEnabled = !!spacingById('spacingCompareToggle')?.checked;

// Pro gate: Compare (block compare output if not entitled)
const compareAllowed = compareEnabled ? spacingRequire("spacingCompare", "Compare two crops is available in Pro.") : false;

const cropB = (compareEnabled && compareAllowed) ? (spacingById('spacingCropB')?.value || "") : "";

  const style = spacingQuery('input[name="style"]:checked')?.value || "sqft";
  const intensity = spacingById('spacingIntensity')?.value || "standard";
  const factor = getIntensityFactor(intensity);

  let areaSqFt = 0;
  let dimsTxt = "";

  if (style === 'sqft') {
    const w = safeNumber(spacingById('bedWidth')?.value);
    const l = safeNumber(spacingById('bedLength')?.value);
    areaSqFt = w * l;
    dimsTxt = `${w} ft × ${l} ft`;
  } else {
    const len = safeNumber(spacingById('rowLength')?.value);
    const rows = Math.max(1, Math.round(safeNumber(spacingById('numRows')?.value) || 1));
    // keep your existing behavior (len * (rows + 1)) as "work area"
    areaSqFt = len * (rows + 1);
    dimsTxt = `${rows} rows @ ${len} ft`;
  }

  if (areaSqFt <= 0) {
    alert('Enter your bed/row dimensions first.');
    return;
  }

  const dataA = spacingData[crop];
  const basePlantsA = areaSqFt * dataA.sqft;
  const plantsA = Math.max(1, Math.round(basePlantsA * factor));
  const seedsA = Math.max(1, Math.round(plantsA * 1.2));

  const seedsPerPacket = Math.max(1, Math.round(safeNumber(spacingById('seedsPerPacket')?.value) || 250));
  const packetsA = Math.max(1, Math.ceil(seedsA / seedsPerPacket));

  const yieldA = parseYieldEstimate(dataA.yield, plantsA);

  const warnings = [];
  if (intensity === "intensive") warnings.push("Intensive density: consider trellis/pruning and higher fertility");
  if (style === "rows" && dataA.rowBetween >= 48) warnings.push("Wide row spacing: consider aisle planning");
  if (plantsA / areaSqFt > dataA.sqft * 1.10) warnings.push("High density vs baseline");

  // Compare crop B (optional)
  let compareHtml = "";
  if (compareEnabled && compareAllowed && cropB && spacingData[cropB]) {
    const dataB = spacingData[cropB];
    const plantsB = Math.max(1, Math.round((areaSqFt * dataB.sqft) * factor));
    const seedsB = Math.max(1, Math.round(plantsB * 1.2));
    const packetsB = Math.max(1, Math.ceil(seedsB / seedsPerPacket));
    const yieldB = parseYieldEstimate(dataB.yield, plantsB);

    const delta = plantsA - plantsB;
    const winner = delta === 0 ? "Tie" : (delta > 0 ? crop : cropB);

    compareHtml = `
      <div style="margin-top:14px;">
        <strong>Compare</strong><br>
        <div style="opacity:.85; margin:6px 0;">Winner by plant count (same area & intensity): <strong>${winner}</strong></div>
        <div style="overflow:auto;">
          <table class="spacing-compare-table">
            <thead>
              <tr>
                <th></th>
                <th>${crop}</th>
                <th>${cropB}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Plants</td><td>${plantsA}</td><td>${plantsB}</td></tr>
              <tr><td>Seeds</td><td>${seedsA}</td><td>${seedsB}</td></tr>
              <tr><td>Packets</td><td>${packetsA}</td><td>${packetsB}</td></tr>
              <tr><td>Yield</td><td>${yieldA}</td><td>${yieldB}</td></tr>
              <tr><td>Sq-ft rate</td><td>${dataA.sqft}</td><td>${dataB.sqft}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (compareEnabled && !compareAllowed) {
    compareHtml = renderProLockedNote("Compare (Pro)", "Upgrade to compare two crops side-by-side.");
  } else if (compareEnabled && compareAllowed && cropB && !spacingData[cropB]) {
    compareHtml = `<div style="margin-top:14px; opacity:.85;"><em>Select a valid comparison crop.</em></div>`;
  }

  // Succession planner (uses crop A)
  const startDateStr = spacingById('successionStartDate')?.value || "";
  const batches = Math.round(safeNumber(spacingById('successionBatches')?.value) || 6);
  const intervalDays = Math.round(safeNumber(spacingById('successionIntervalDays')?.value) || 0);

  // Pro gate: Succession (only show schedule output if user is using it)
  const usingSuccession = !!startDateStr || (batches && batches > 1) || (intervalDays && intervalDays > 0);
  const successionAllowed = usingSuccession ? spacingRequire("spacingSuccession", "Succession Planner is available in Pro.") : true;

  const succ = successionAllowed
    ? buildSuccessionSchedule(crop, startDateStr, batches, intervalDays)
    : { html: renderProLockedNote("Succession Planner (Pro)", "Upgrade to generate a succession schedule."), effectiveInterval: intervalDays };

  // Notes (kept independent)
  const notes = spacingById('spacingNotes')?.value || "";

  const result = spacingById('spacingResult');
  if (!result) return;

  result.innerHTML = `
    <strong>${crop}</strong><br>
    <div style="opacity:.85; margin:6px 0;">${style.toUpperCase()} • ${dimsTxt} • Intensity: ${intensity}</div>

    <div style="margin-top:10px;">
      <strong>Recommended Spacing</strong><br>
      Square Foot: ${dataA.sqft} plant${dataA.sqft > 1 ? 's' : ''} per sq ft<br>
      Rows: ${dataA.rowInPlant}" between plants, ${dataA.rowBetween}" between rows
    </div>

    <div style="margin-top:10px;">
      <strong>Plants Needed:</strong> ${plantsA}<br>
      <strong>Seeds to Buy (20% extra):</strong> ${seedsA}<br>
      <strong>Seed Packets:</strong> ${packetsA} <span style="opacity:.8;">(at ${seedsPerPacket}/packet)</span><br>
      <strong>Estimated Yield:</strong> ${yieldA}
    </div>

    ${warnings.length ? `<div style="margin-top:10px;"><strong>Notes / Warnings</strong><br><span style="opacity:.9;">• ${warnings.join("<br>• ")}</span></div>` : ""}

    ${compareHtml}

    ${succ.html}

    <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
      <button type="button" class="clear-btn" id="spacingCopyBtnInline">Copy Summary</button>
      <button type="button" class="clear-btn" id="spacingPrintBtnInline">Print</button>
    </div>
  `;
  result.style.display = 'block';

  // Bind inline buttons
  const copyBtn = spacingById('spacingCopyBtnInline');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      const text = buildSpacingSummaryText({
        crop,
        cropB,
        compare: compareEnabled,
        style,
        intensity,
        areaSqFt,
        plants: plantsA,
        seeds: seedsA,
        packets: packetsA,
        seedsPerPacket,
        yieldText: yieldA,
        warnings,
        notes
      });

      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = "Copied";
        setTimeout(() => (copyBtn.textContent = "Copy Summary"), 900);
      } catch (e) {
        alert("Copy failed. Your browser may block clipboard access.");
      }
    };
  }

  const printBtn = spacingById('spacingPrintBtnInline');
  if (printBtn) {
    printBtn.onclick = () => {
      // Monetization gate: printing is Pro-only on web
      try {
        if (typeof window.pgRequire === "function") {
          if (!window.pgRequire("exportPrint", "Printing is available in the Pro app (store version).")) return;
        }
      } catch (e) {}

      const w = window.open("", "_blank");
      if (!w) return alert("Popup blocked. Allow popups to print.");
      w.document.write(`<pre style="white-space:pre-wrap; font-family:system-ui, sans-serif;">${buildSpacingSummaryText({
        crop, cropB, compare: compareEnabled,
        style, intensity,
        areaSqFt,
        plants: plantsA,
        seeds: seedsA,
        packets: packetsA,
        seedsPerPacket,
        yieldText: yieldA,
        warnings,
        notes
      })}</pre>`);
      w.document.close();
      w.focus();
      w.print();
    };
  }

  // Persist
  saveSpacingState();
}

    

    
/* ========= Spacing Enhancements (Independent Tool) ========= */

function ensureSpacingEnhancementStyles() {
  if (spacingById("spacingEnhancementStyles")) return;
  const style = document.createElement("style");
  style.id = "spacingEnhancementStyles";
  style.textContent = `
    .spacing-panel{ margin-top:14px; padding:14px; border:1px solid rgba(255,255,255,.12); border-radius:12px; }
    .spacing-row{ display:flex; flex-wrap:wrap; gap:12px; align-items:flex-end; }
    .spacing-field{ min-width:180px; flex:1; }
    .spacing-field label{ display:block; font-size:.9em; opacity:.85; margin-bottom:6px; }
    .spacing-field input, .spacing-field select, .spacing-field textarea{
      width:100%; padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,.15);
      background:rgba(0,0,0,.15); color:inherit;
    }
    .spacing-field textarea{ min-height:90px; resize:vertical; }
    .spacing-chip{
      display:inline-block; padding:6px 10px; border-radius:999px;
      border:1px solid rgba(255,255,255,.15); background:rgba(0,0,0,.15);
      font-size:.9em;
    }
    .spacing-compare-table{
      width:100%; border-collapse:collapse; margin-top:8px;
    }
    .spacing-compare-table th, .spacing-compare-table td{
      padding:8px 10px; border-bottom:1px solid rgba(255,255,255,.12);
      text-align:left; white-space:nowrap;
    }
    .spacing-compare-table thead th{
      border-bottom:1px solid rgba(255,255,255,.2);
      opacity:.9;
    }
    .spacing-assumptions summary{ cursor:pointer; font-weight:600; }
    .spacing-assumptions{ margin-top:14px; }
  `;
  document.head.appendChild(style);
}

function buildSpacingEnhancementsUI() {
  ensureSpacingEnhancementStyles();

  const tab = document.getElementById("spacing");
  if (!tab) return;

  // Create a container that holds all enhancements
  let panel = spacingById("spacingEnhancements");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "spacingEnhancements";
    panel.className = "spacing-panel";

    // Try to place it near the top of the spacing tab, before results if possible
    const result = spacingById("spacingResult");
    if (result && result.parentElement) {
      result.parentElement.insertBefore(panel, result);
    } else {
      tab.appendChild(panel);
    }
  }

  // Avoid rebuilding if already built
  if (panel.getAttribute("data-built") === "1") return;
  panel.setAttribute("data-built", "1");

  panel.innerHTML = `
    <div class="spacing-row">
      <div class="spacing-field">
        <label for="spacingIntensity">Density preset</label>
        <select id="spacingIntensity">
          <option value="conservative">Conservative</option>
          <option value="standard" selected>Standard</option>
          <option value="intensive">Intensive</option>
        </select>
      </div>

      <div class="spacing-field">
        <label for="seedsPerPacket">Seeds per packet</label>
        <input id="seedsPerPacket" type="number" min="1" step="1" value="250"/>
      </div>

      <div class="spacing-field" style="min-width:220px;">
        <label style="display:flex; gap:10px; align-items:center;">
          <input id="spacingCompareToggle" type="checkbox" style="width:auto;"/>
          Compare two crops
        </label>
      </div>
    </div>

    <div id="spacingCompareBox" class="spacing-row" style="display:none; margin-top:10px;">
      <div class="spacing-field">
        <label for="spacingCropB">Comparison crop</label>
        <select id="spacingCropB"></select>
      </div>
    </div>

    <div class="spacing-row" style="margin-top:10px;">
      <div class="spacing-field">
        <label for="successionStartDate">Succession start date</label>
        <input id="successionStartDate" type="date"/>
      </div>
      <div class="spacing-field">
        <label for="successionIntervalDays">Succession interval (days)</label>
        <input id="successionIntervalDays" type="number" min="0" step="1" placeholder="0 = use suggested"/>
      </div>
      <div class="spacing-field">
        <label for="successionBatches">Batches</label>
        <input id="successionBatches" type="number" min="1" step="1" value="6"/>
      </div>
    </div>

    <div class="spacing-row" style="margin-top:10px;">
      <div class="spacing-field" style="flex: 1 1 100%;">
        <label for="spacingNotes">Notes (saved only inside Spacing)</label>
        <textarea id="spacingNotes" placeholder="Optional notes about assumptions, trellis, variety, etc."></textarea>
      </div>
    </div>

    <details class="spacing-assumptions">
      <summary>Assumptions and guidance</summary>
      <div style="opacity:.9; margin-top:10px; line-height:1.45;">
        <div style="margin-bottom:8px;"><strong>What this tool does:</strong> Converts bed/row dimensions into estimated plant counts, seeds, packets, and a rough yield range based on your selected crop.</div>
        <div style="margin-bottom:8px;"><strong>Density presets:</strong> Conservative assumes wider spacing. Intensive assumes tighter spacing and typically requires higher fertility, consistent irrigation, and training/trellising for vining crops.</div>
        <div style="margin-bottom:8px;"><strong>Rows mode area:</strong> Uses your existing approach (row length × (rows + 1)) as a planning-area proxy. This is intentionally simple and meant for quick what-if comparisons.</div>
        <div><strong>Yield:</strong> Yield ranges in the dataset are best-effort. Treat as guidance, not a guarantee.</div>
      </div>
    </details>
  `;

  // Populate the comparison crop dropdown
  populateSpacingCrops();

  // Wire events
  const compareToggle = spacingById("spacingCompareToggle");
  const compareBox = spacingById("spacingCompareBox");
  if (compareToggle && compareBox) {
    compareToggle.addEventListener("change", () => {
      compareBox.style.display = compareToggle.checked ? "" : "none";
      saveSpacingState();
    });
  }

  // Save state on change for new controls
  ["spacingIntensity", "seedsPerPacket", "successionStartDate", "successionIntervalDays", "successionBatches", "spacingNotes", "spacingCropB"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => saveSpacingState());
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      el.addEventListener("input", () => saveSpacingState());
    }
  });
}

// --- PLAN STRIP FOR SPACING TAB (VIEW-ONLY) ---
function renderSpacingPlanTabs() {
  const container = spacingById('spacingPlanTabs');
  if (!container) return;
  if (
    typeof gardenPlans === 'undefined' ||
    !gardenPlans ||
    !Array.isArray(gardenPlans.plans) ||
    typeof currentPlanId === 'undefined' ||
    !currentPlanId
  ) {
    container.innerHTML =
      '<span style="opacity:.7;">No plans found. Plans are created and renamed on the My Garden tab.</span>';
    return;
  }


  container.innerHTML = '';

  gardenPlans.plans.forEach(plan => {
    const btn = document.createElement('div');
    btn.className = 'plan-tab';
    btn.textContent = plan.name;

    // Use the same "current plan" as My Garden
    const activeId = getSpacingActivePlanId();
    if (plan.id === activeId) {
      btn.classList.add('active');
    }

    btn.onclick = () => {
      // Independent selection for Spacing tool ONLY (no global plan switching)
      setSpacingActivePlanId(plan.id);

      // Refresh spacing strip highlight + restore this plan's spacing inputs/results
      renderSpacingPlanTabs();
      restoreSpacingState();
    };

    container.appendChild(btn);
  });
}


// Initialize spacing UI when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Build independent tool UI additions
  buildSpacingEnhancementsUI();

  // Ensure crop dropdown(s) have options
  populateSpacingCrops();

  // Draw independent plan strip and restore per-plan state
  renderSpacingPlanTabs();
  restoreSpacingState();

  // If compare toggle was restored, show/hide compare box accordingly
  const compareToggle = spacingById("spacingCompareToggle");
  const compareBox = spacingById("spacingCompareBox");
  if (compareToggle && compareBox) {
    compareBox.style.display = compareToggle.checked ? "" : "none";

    // Keep compare box in sync + gate when enabling
    compareToggle.addEventListener("change", () => {
      if (compareToggle.checked) {
        const ok = spacingRequire("spacingCompare", "Compare two crops is available in Pro.");
        if (!ok) {
          compareToggle.checked = false;
          compareBox.style.display = "none";
          saveSpacingState();
          return;
        }
      }
      compareBox.style.display = compareToggle.checked ? "" : "none";
      saveSpacingState();
    });
  }

  // Gate Succession output on calculate (UI stays visible, output is locked if not Pro)
});
