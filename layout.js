// Read-only layout builder. Does not modify existing plans or functions.
// Exposes window.Layout with render() and print().

function byId(id) {
  return document.getElementById(id);
}

// ───────────────────────────────────────────────────────────────
// Bed placement policy
// If true, beds may be dragged/resized/rotated so they can extend beyond
// the property bounds. This removes the "length-based" placement limit.
// ───────────────────────────────────────────────────────────────
const PG_ALLOW_BEDS_OUT_OF_BOUNDS = false;



function getPgViewportEl() {
  return (
    byId("propertyViewport") ||
    byId("propertyCanvasViewport") ||
    document.querySelector(".propertyCanvasViewport") ||
    document.querySelector(".property-viewport")
  );
}



/* ============================
   PG redraw + fit helpers (V3)
   ============================ */

// RAF-debounced re-render (prevents spam + keeps UI consistent)
let __pgRaf = 0;
function pgScheduleRender(opts = {}) {
  if (__pgRaf) cancelAnimationFrame(__pgRaf);
  __pgRaf = requestAnimationFrame(() => {
    __pgRaf = 0;
    // Prefer the full Layout.render() if it exists (rebuilds controls + map),
    // but fall back to property-only rerender if that's all we have.
    try {
      if (window.Layout && typeof window.Layout.render === "function") {
        window.Layout.render();
      } else if (typeof render === "function") {
        render();
      }
    } catch (e) {
      console.warn("pgScheduleRender: render failed", e);
    }
    try {
      if (typeof window.__pgRerenderMap === "function") window.__pgRerenderMap();
    } catch (e) {
      console.warn("pgScheduleRender: __pgRerenderMap failed", e);
    }
    try { renderBedOverlays(); } catch (e) { /* optional */ }

    if (opts.fit) {
      // Fit after DOM is updated
      requestAnimationFrame(() => pgFitToViewport());
    }
  });
}

// Back-compat: some snippets call schedule()
window.schedule = window.schedule || function () { pgScheduleRender(); };
// Global grid unit (ft per grid cell). Mirrors the Property "Scale" control.
let currentGridUnitFt = 2;


/* ============================
   Bed state + persistence (V1)
   ============================ */
// Canonical in-memory bed list. This is kept in sync with propertyState.beds.
// Persisted to localStorage so bed edits (name/type/plan/size) survive redraws.
let beds = [];

// Tracks the currently selected bed by stable id (e.g. "bed1").
let selectedBedId = null;


// ───────────────────────────────────────────────────────────────
// Bed selection (click/touch) – robust deselect + UI sync (V2)
// ───────────────────────────────────────────────────────────────

function updateBedSelectionUI() {
  // Keep our state refs aligned.
  try { syncBedsRef(); } catch (e) {}
  try { syncSelectedBedId(); } catch (e) {}
  try { syncSelectedBedIndexFromId(); } catch (e) {}

  const selectedDisplay =
    byId("selectedBedDisplay") ||
    byId("selectedBedInfo") ||
    byId("layoutSelectedBedInfo") ||
    byId("pgSelectedBedInfo") ||
    byId("selectedBedLabel") ||
    byId("layoutSelectedBedLabel");

  const noSelectMsg =
    byId("noBedSelectedMsg") ||
    byId("layoutNoBedSelectedMsg") ||
    byId("pgNoBedSelectedMsg");

  const setSelect = (el, v) => {
    if (!el) return;
    const opts = Array.from(el.options || []);
    const has = (x) => opts.some(o => String(o.value) === String(x));
    try {
      if (v != null && has(v)) el.value = String(v);
    } catch (e) {}
  };

  if (selectedBedId) {
    const i = getSelectedBedIndex();
    const bed = (i != null && beds?.[i]) ? beds[i] : null;

    const name = (bed && typeof bed.name === "string" && bed.name.trim()) ? bed.name.trim() : selectedBedId;
    if (selectedDisplay) selectedDisplay.textContent = `Selected: ${name}`;
    if (noSelectMsg) noSelectMsg.style.display = "none";

    // Common editor inputs (safe no-ops if absent)
    const nameInput = byId("bedNameInput") || byId("propBedName") || byId("layoutBedName");
    if (nameInput) nameInput.value = (bed && bed.name) ? bed.name : "";

    const typeSelect = byId("bedTypeSelect") || byId("propBedType") || byId("layoutBedType");
    if (typeSelect) setSelect(typeSelect, bed?.type || "raised");

    const planSelect =
      byId("propBedPlanSelect") ||
      byId("bedPlanSelect") ||
      byId("layoutBedPlanSelect") ||
      byId("propFirstBedPlanSelect");
    const bedPlanId = bed?.planId || bed?.planID || bed?.plan || "";
    if (planSelect && bedPlanId) setSelect(planSelect, bedPlanId);
  } else {
    if (selectedDisplay) selectedDisplay.textContent = "No bed selected";
    if (noSelectMsg) noSelectMsg.style.display = "block";

    const nameInput = byId("bedNameInput") || byId("propBedName") || byId("layoutBedName");
    if (nameInput) nameInput.value = "";

    // Clear stale edit fields so "Add/New Bed" starts clean.
    try { resetBedForm(); } catch (e) {}
  }
}

function resetBedForm() {
  // Minimal, safe form reset: only touches fields if they exist.
  const setVal = (id, v) => { const el = byId(id); if (el) el.value = v; };
  const setSelect = (el, preferred, fallback) => {
    if (!el) return;
    const opts = Array.from(el.options || []);
    const has = (v) => opts.some(o => String(o.value) === String(v));
    try {
      if (preferred != null && has(preferred)) el.value = String(preferred);
      else if (fallback != null && has(fallback)) el.value = String(fallback);
      else if (preferred != null) el.value = String(preferred); // may fall back to first option
    } catch (e) {}
  };

  // Common IDs used across versions
  setVal("bedNameInput", "");
  setVal("layoutBedName", "");
  setVal("propBedName", "");

  // Type/selects (IMPORTANT: use option values, not labels)
  const typeEl = byId("bedTypeSelect") || byId("layoutBedType") || byId("propBedType");
  setSelect(typeEl, "raised", "Raised bed");

  // Path/rotation
  setVal("pathInput", "2");
  setVal("rotationSelect", "Normal");

  // Dim inputs (optional)
  setVal("bedWidthInput", "");
  setVal("bedLengthInput", "");

  // Row controls (optional)
  setVal("rowCountInput", "0");
  const rowDirEl = byId("rowDirectionSelect") || byId("propRowDir");
  setSelect(rowDirEl, "auto", "Auto");
  setVal("rowSpacingInput", "1");

  // Plan selectors: clear (prevents accidentally reusing the prior bed's plan on "Add Bed")
  const planEl =
    byId("bedPlanSelect") ||
    byId("propBedPlanSelect") ||
    byId("layoutBedPlanSelect") ||
    document.querySelector("#propBedPlanSelect") ||
    document.querySelector("#bedPlanSelect");
  if (planEl) {
    try { planEl.value = ""; } catch (e) {}
  }
}

function handleCanvasClick(event) {
  const vp = getPgViewportEl();
  if (!vp) return;

  // Ignore clicks that are not on the property canvas / bed blocks / bed overlays.
  // This prevents accidental deselection when interacting with the toolbar or other UI.
  const tgt = event && event.target;

  // NOTE: In this app the property "canvas" is a DIV (#propertyCanvas) inside the viewport.
  // Older snippets used a <canvas>. Treat any click inside the viewport/canvas as a map click
  // so clicking empty grid can deselect a bed (prevents a stuck selection).
  const canvasEl = byId("propertyCanvas") || vp.querySelector("canvas") || vp;
  const onBedBlock = tgt && tgt.closest ? tgt.closest(".property-bed-block") : null;
  const onOverlay = tgt && tgt.closest ? tgt.closest(".bed-overlay,[id^='bed-overlay-']") : null;
  const onCanvas = !!(tgt && (tgt === canvasEl || (canvasEl && canvasEl.contains && canvasEl.contains(tgt))));
  if (!onBedBlock && !onOverlay && !onCanvas) return;


  // Prefer DOM hit-testing: property beds are rendered as .property-bed-block overlays.
  const bedNode = event.target && (event.target.closest ? event.target.closest(".property-bed-block") : null);
  if (bedNode && bedNode.dataset) {
    const idx = parseInt(bedNode.dataset.bedIndex || "-1", 10);
    if (Number.isFinite(idx) && idx >= 0) {
      selectedBedIndex = idx;
      // Ensure id is available/synced
      try { syncBedsRef(); } catch (e) {}
      try { syncSelectedBedId(); } catch (e) {}
      updateBedSelectionUI();
      try { pgScheduleRender(); } catch (e) { try { schedule(); } catch(e2) {} }
      return;
    }
  }

  // Fallback: coordinate hit-test against beds[] if beds are stored with x/y/width/height (older snippets).
  try {
    const canvas = vp.querySelector("canvas") || vp;
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    const worldX = (clickX / (currentScale || 1)) - (currentOffsetX || 0);
    const worldY = (clickY / (currentScale || 1)) - (currentOffsetY || 0);

    let hitId = null;
    if (Array.isArray(beds)) {
      for (const bed of beds) {
        if (!bed) continue;
        if (typeof bed.x === "number" && typeof bed.y === "number" && typeof bed.width === "number" && typeof bed.height === "number") {
          if (worldX >= bed.x && worldX <= bed.x + bed.width && worldY >= bed.y && worldY <= bed.y + bed.height) {
            hitId = bed.id || null;
            break;
          }
        }
      }
    }

    if (hitId) {
      selectedBedId = hitId;
      selectedBedIndex = getSelectedBedIndex();
    } else {
      selectedBedId = null;
      selectedBedIndex = null;
    }
  } catch (e) {
    // If anything about hit-test fails, default to deselect (matches expected UX).
    selectedBedId = null;
    selectedBedIndex = null;
  }

  updateBedSelectionUI();
  try { pgScheduleRender(); } catch (e) { try { schedule(); } catch(e2) {} }
}

function installBedSelectionClickHandlers() {
  const vp = getPgViewportEl();
  if (!vp || vp.dataset.pgBedClickBound) return;
  vp.dataset.pgBedClickBound = "1";

  vp.addEventListener("click", handleCanvasClick);
  // Optional mobile: touch
  vp.addEventListener("touchend", (e) => {
    // Convert touchend to a click-like event object
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return handleCanvasClick(e);
    handleCanvasClick({ target: e.target, clientX: t.clientX, clientY: t.clientY });
  }, { passive: true });
}


function loadBeds() {
  try {
    const saved = localStorage.getItem("perpetualBeds");
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("loadBeds: failed to parse perpetualBeds", e);
    return [];
  }
}

function saveBeds() {
  try {
    // Prefer canonical propertyState.beds if available
    const src = (propertyState && Array.isArray(propertyState.beds)) ? propertyState.beds : beds;
    localStorage.setItem("perpetualBeds", JSON.stringify(Array.isArray(src) ? src : []));
  } catch (e) {
    console.warn("saveBeds: failed", e);
  }
}

// ───────────────────────────────────────────────────────────────
// Optional DOM overlays for beds (V1)
// Creates lightweight clickable overlays when the UI isn't already creating
// .property-bed-block elements. Avoids duplicating existing bed DOM.
// ───────────────────────────────────────────────────────────────
function removeBedOverlay(bedId) {
  const id = (bedId == null) ? "" : String(bedId);
  if (!id) return;
  const overlay =
    document.getElementById(`bed-overlay-${id}`) ||
    document.getElementById(`bed-${id}`); // back-compat
  if (overlay) {
    overlay.remove();
    console.log(`Removed overlay for bed ${id}`);
  }
}

function clearAllBedOverlays() {
  // Remove any overlays we created (both new and legacy ids)
  document.querySelectorAll('[id^="bed-overlay-"], .bed-overlay[data-pg-overlay="1"], [id^="bed-"][data-pg-overlay="1"]').forEach(el => el.remove());
}

// Back-compat name used elsewhere
function clearBedOverlays() { clearAllBedOverlays(); }

function clearAllPropertyBedBlocks() {
  const canvas = byId("propertyCanvas");
  if (!canvas) return;
  canvas.querySelectorAll(".property-bed-block").forEach(el => el.remove());
}



function renderBedOverlays() {
  const vp = getPgViewportEl();
  if (!vp) return;

  // If the app already renders bed DOM blocks, do NOT add overlays.
  if (vp.querySelector('.property-bed-block')) return;

  clearAllBedOverlays();

  // Ensure positioning context
  const cs = window.getComputedStyle(vp);
  if (cs.position === "static") vp.style.position = "relative";

  if (!Array.isArray(beds)) return;

  beds.forEach((bed, i) => {
    if (!bed) return;
    const id = (bed.id || `bed${i + 1}`).toString();

    const el = document.createElement("div");
    el.id = `bed-overlay-${id}`;
    el.dataset.pgOverlay = "1";
    el.className = "bed-overlay";
    el.style.position = "absolute";

    // Convert world (cells/ft) → viewport pixels
    const s = (currentScale || 1);
    const ox = (currentOffsetX || 0);
    const oy = (currentOffsetY || 0);
    const x = (typeof bed.x === "number" ? bed.x : 0);
    const y = (typeof bed.y === "number" ? bed.y : 0);
    const w = (typeof bed.width === "number" ? bed.width : 0);
    const h = (typeof bed.height === "number" ? bed.height : 0);

    el.style.left = `${(x + ox) * s}px`;
    el.style.top = `${(y + oy) * s}px`;
    el.style.width = `${w * s}px`;
    el.style.height = `${h * s}px`;

    el.style.boxSizing = "border-box";
    el.style.border = (id === selectedBedId) ? "3px solid lime" : "1px solid rgba(0,0,0,0.6)";
    el.style.background = "rgba(0,255,0,0.12)";
    el.style.pointerEvents = "auto";

    const label = (bed.name && String(bed.name).trim()) ? String(bed.name).trim() : id;
    el.innerHTML = `<span style="position:absolute;left:4px;top:2px;font:12px/1.2 sans-serif;color:#111;background:rgba(255,255,255,0.65);padding:1px 4px;border-radius:3px;">${escapeHtml(label)}</span>`;

    el.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedBedId = id;
      try { syncSelectedBedIndexFromId(); } catch (e2) {}
      try { updateBedSelectionUI(); } catch (e3) {}
      pgScheduleRender();
    });

    vp.appendChild(el);
  });
}

// Small HTML escaper for overlay labels
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// Returns the selected bed index (0-based) from either selectedBedIndex or selectedBedId.
function getSelectedBedIndex() {
  if (typeof selectedBedIndex === "number" && selectedBedIndex >= 0 && Array.isArray(beds) && selectedBedIndex < beds.length) {
    return selectedBedIndex;
  }
  if (selectedBedId && Array.isArray(beds)) {
    const i = beds.findIndex(b => b && b.id === selectedBedId);
    return i >= 0 ? i : null;
  }
  return null;
}

// Keep selectedBedId synchronized with selectedBedIndex when possible.
function syncSelectedBedId() {
  if (typeof selectedBedIndex === "number" && Array.isArray(beds) && beds[selectedBedIndex]) {
    selectedBedId = beds[selectedBedIndex].id || null;
  } else if (selectedBedId && Array.isArray(beds)) {
    const i = beds.findIndex(b => b && b.id === selectedBedId);
    if (i === -1) selectedBedId = null;
  } else {
    selectedBedId = null;
  }
}

// Keep selectedBedIndex in sync with selectedBedId when selection is set by id.
// This prevents "edits apply to the wrong bed" and avoids duplicate-looking UI state.
function syncSelectedBedIndexFromId() {
  try { syncBedsRef(); } catch (e) {}
  if (!selectedBedId || !Array.isArray(beds)) {
    selectedBedIndex = null;
    return;
  }
  const id = String(selectedBedId);
  const idx = beds.findIndex(b => b && String(b.id) === id);
  selectedBedIndex = (idx >= 0) ? idx : null;
  if (selectedBedIndex === null) selectedBedId = null;
}


// Optional UI hook (safe no-op if elements aren't present in your HTML).
function updateSelectedBedUI() {
  try { syncSelectedBedId(); } catch (e) {}
  const labelEl =
    byId("selectedBedInfo") ||
    byId("layoutSelectedBedInfo") ||
    byId("pgSelectedBedInfo") ||
    byId("selectedBedLabel") ||
    byId("layoutSelectedBedLabel");

  if (!labelEl) return;

  if (selectedBedId) {
    const i = getSelectedBedIndex();
    const bed = (i != null && beds?.[i]) ? beds[i] : null;
    const name = (bed && typeof bed.name === "string" && bed.name.trim()) ? bed.name.trim() : selectedBedId;
    labelEl.textContent = `Selected: ${name}`;
  } else {
    labelEl.textContent = "No bed selected";
  }

  try { if (typeof updateBedSelectionUI === "function") updateBedSelectionUI(); } catch (e) {}
}


// Keep the global beds reference pointing at the canonical array (propertyState.beds)
function syncBedsRef() {
  if (propertyState && Array.isArray(propertyState.beds)) {
    beds = propertyState.beds;
  } else if (!Array.isArray(beds)) {
    beds = [];
  }
}

// Merge saved beds (localStorage) into propertyState without breaking offsets/rot logic.
// - Expands propertyState.beds if needed
// - Copies safe, user-editable fields + offset/rot if present
function mergeSavedBedsIntoPropertyState(savedBedsArr) {
  if (!savedBedsArr || !Array.isArray(savedBedsArr) || savedBedsArr.length === 0) return;
  try {
    // Ensure propertyState and beds array exist
    if (!propertyState) propertyState = {};
    if (!Array.isArray(propertyState.beds)) propertyState.beds = [];
    const targetCount = Math.max(propertyState.beds.length, savedBedsArr.length);
    ensurePropertyStateInPlace(targetCount, propertyState);

    for (let i = 0; i < savedBedsArr.length; i++) {
      const sb = savedBedsArr[i] || {};
      const tb = propertyState.beds[i] || (propertyState.beds[i] = {});
      // Copy common editable fields
      ["id","name","type","planId","planName","populatedPlanId","populatedFromPlanId","pathFt","wFt","lFt","rows","rowCount","rowSpacingFt","rowOrientation"].forEach((k) => {
        if (sb[k] !== undefined) tb[k] = sb[k];
      });
      // Copy offset/rot if provided (these are crucial for keeping beds stationary)
      if (sb.offset && typeof sb.offset === "object") tb.offset = { x: Number(sb.offset.x)||0, y: Number(sb.offset.y)||0 };
      if (sb.rot !== undefined) tb.rot = sb.rot ? 1 : 0;
    }

    // After merge, sync bedOffsets/bedRot to match canonical state
    try {
      bedOffsets = ensureBedOffsets(targetCount, propertyState.beds.map(b => b.offset));
      bedRot = ensureBedRot(targetCount, propertyState.beds.map(b => b.rot));
    } catch (e) {}
    syncBedsRef();
  } catch (e) {
    console.warn("mergeSavedBedsIntoPropertyState: failed", e);
  }
}

// Auto-fit the property map into its viewport.
// - Forces a map re-render (so bounds + surface sizing are up to date)
// - Recenters the viewport on the property bounds (not just placed objects)
function autoFitProperty() {
  const vp = getPgViewportEl();
  if (!vp) return;

  // Sync current grid unit from the scale input if present.
  const ps = parseFloat(byId("propertyScale")?.value);
  if (Number.isFinite(ps) && ps > 0) currentGridUnitFt = ps;

  // Ensure we have a fresh render so scrollWidth/Height and bounds are correct.
  try {
    if (typeof window.__pgRerenderMap === "function") window.__pgRerenderMap();
  } catch (e) {
    console.warn("autoFitProperty: __pgRerenderMap failed", e);
  }

  // Defer until after the DOM/layout settles.
  requestAnimationFrame(() => {
    const bounds = window.__pgPropertyBoundsPx;
    if (!bounds || !bounds.w || !bounds.h) return;

    const vpW = vp.clientWidth || 0;
    const vpH = vp.clientHeight || 0;
    if (vpW < 10 || vpH < 10) return;

    // Center on the property bounds marker (0,0 .. bounds.w/h).
    const targetX = Math.round((bounds.w / 2) - (vpW / 2));
    const targetY = Math.round((bounds.h / 2) - (vpH / 2));

    const maxX = Math.max(0, vp.scrollWidth - vpW);
    const maxY = Math.max(0, vp.scrollHeight - vpH);

    vp.scrollLeft = Math.max(0, Math.min(maxX, targetX));
    vp.scrollTop  = Math.max(0, Math.min(maxY, targetY));

    // If callers expect a redraw hook, schedule it.
    try { pgScheduleRender(); } catch (e) {}
  });
}

// Expose for console use (autoFitProperty())
window.autoFitProperty = autoFitProperty;


// Center the viewport on the current content (beds + obstacles)
// (Does NOT change scale; it adjusts scrollLeft/scrollTop only.)
function pgFitToViewport() {
  const vp = getPgViewportEl();
  if (!vp) return;
  const bounds = window.__pgPropertyBoundsPx;
  if (!bounds || !bounds.cell || !bounds.w || !bounds.h) return;

  // Compute content bounds in px (beds + obstacles).
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  // Beds
  if (Array.isArray(bedOffsets)) {
    for (let i = 0; i < bedOffsets.length; i++) {
      const o = bedOffsets[i];
      if (!o) continue;
      const x = (o.x || 0) * bounds.cell;
      const y = (o.y || 0) * bounds.cell;
      const u = bedUnitsFor(i) || { w: 0, h: 0 };
      const w = (u.w || 0) * bounds.cell;
      const h = (u.h || 0) * bounds.cell;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
  }

  // Obstacles
  if (Array.isArray(obstacles)) {
    for (const ob of obstacles) {
      if (!ob) continue;
      const x = (ob.x || 0) * bounds.cell;
      const y = (ob.y || 0) * bounds.cell;
      const w = (ob.w || 0) * bounds.cell;
      const h = (ob.h || 0) * bounds.cell;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
  }

  // If no content, center on the property itself.
  if (!isFinite(minX)) {
    minX = 0; minY = 0; maxX = bounds.w; maxY = bounds.h;
  }

  const padding = Math.max(24, bounds.cell * 2);
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(bounds.w, maxX + padding);
  maxY = Math.min(bounds.h, maxY + padding);

  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);

  const targetLeft = minX + contentW / 2 - vp.clientWidth / 2;
  const targetTop = minY + contentH / 2 - vp.clientHeight / 2;

  vp.scrollLeft = Math.max(0, Math.min(targetLeft, vp.scrollWidth - vp.clientWidth));
  vp.scrollTop  = Math.max(0, Math.min(targetTop,  vp.scrollHeight - vp.clientHeight));
}

window.pgFitToViewport = pgFitToViewport;
window.pgScheduleRender = pgScheduleRender;


// Responsive scaling for Property Map canvas
let __pgCanvasScale = 1;

// Persist the selected-bed panel node across layoutSummary.innerHTML rewrites.
// We cache the DOM node once and re-attach it into the current mount each render.
let __pgSelectedBedPanelNode = null;

function getSelectedBedPanelNode() {
  if (__pgSelectedBedPanelNode && __pgSelectedBedPanelNode.id === "selectedBedPanel") return __pgSelectedBedPanelNode;

  let n = byId("selectedBedPanel");
  if (!n) {
    // Create a safe default panel if the HTML didn't include it.
    n = document.createElement("div");
    n.id = "selectedBedPanel";
    n.style.minHeight = "220px";
    n.style.width = "100%";
  }

  // Remember the legacy wrapper that also contains the static header.
  // In the original HTML, the header (e.g. an <h3>) is a sibling of #selectedBedPanel,
  // so moving ONLY the panel leaves the header behind unless we hide the wrapper.
  if (!n._pgLegacyWrapper) {
    // IMPORTANT: calling closest('div') on a DIV returns the element itself.
    // We want the wrapper that ALSO contains the static header, which is typically the parent.
    let wrap = n.parentElement || null;

    // Sometimes the panel is nested one level deeper; climb until we find a wrapper
    // that contains an obvious "Selected Bed" header.
    let hops = 0;
    while (wrap && hops < 3) {
      const header = wrap.querySelector && wrap.querySelector("h1,h2,h3,h4,strong,.title");
      const txt = header ? (header.textContent || "") : "";
      if (/Selected\s*Bed/i.test(txt)) break;
      // If the wrapper is a generic layout column with no header, keep climbing.
      wrap = wrap.parentElement || null;
      hops++;
    }

    // Exclude the new mount area (we do NOT want to hide the stats/summary area).
    const inSummary = !!(wrap && wrap.closest && wrap.closest("#layoutSummary"));
    if (wrap && !inSummary) {
      n._pgLegacyWrapper = wrap;
      n._pgLegacyParent = wrap.parentElement || null;
    }
  }

  __pgSelectedBedPanelNode = n;
  return n;
}

function hideLegacySelectedBedWrapper() {
  const panel = getSelectedBedPanelNode();
  const wrap = panel?._pgLegacyWrapper;
  if (!wrap) return;

  // Hide the legacy wrapper (this removes the orphaned "Selected Bed Planting Squares" header).
  wrap.style.display = "none";

  // The legacy wrapper lived next to the property-map column in a 2-column layout.
  // Once hidden, force the remaining column to occupy the full row width.
  const parent = panel?._pgLegacyParent;
  if (parent) {
    // Prefer a simple one-column flow.
    parent.style.display = "block";
    parent.style.gap = "0";
    // Expand the first visible child.
    const kids = Array.from(parent.children || []);
    const visible = kids.filter(k => k && k.style && k.style.display !== "none");
    if (visible.length === 1) {
      visible[0].style.width = "100%";
      visible[0].style.flex = "1 1 auto";
      visible[0].style.maxWidth = "100%";
    }
  }

  // Make the property viewport stretch to container width (canvas can remain sized by grid).
  const viewport = getPgViewportEl();
  if (viewport) {
    viewport.style.width = "100%";
    viewport.style.maxWidth = "100%";
    viewport.style.setProperty("--pgCell", cellSize + "px");

    // Also expand the containing panel/card if we can find one.
    const panelCard = viewport.closest && viewport.closest(".panel,.card,.box,.container");
    if (panelCard && panelCard.style) {
      panelCard.style.width = "100%";
      panelCard.style.maxWidth = "100%";
    }
  }
}

function detachSelectedBedPanelNode() {
  const n = getSelectedBedPanelNode();
  if (n && n.parentElement) n.parentElement.removeChild(n);
}

function attachSelectedBedPanelNodeToMount() {
  const mount = byId("layoutSelectedBedMount");
  const n = getSelectedBedPanelNode();
  if (!mount || !n) return;

  // Clear mount without touching the cached panel node itself.
  while (mount.firstChild) mount.removeChild(mount.firstChild);
  mount.appendChild(n);

  n.style.display = "block";
  n.style.width = "100%";
}
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// --- PLAN STRIP FOR LAYOUT TAB (VIEW-ONLY) ---
function renderLayoutPlanTabs() {
  // IMPORTANT CHANGE (Jan 2026): Layout tab must NOT provide a global plan-switcher.
  // Plan selection is bed-level only (inside the bed editor/toolbar).
  // Therefore we hard-disable this UI and any side-effects.
  const container = document.getElementById('layoutPlanTabs');
  if (container) {
    container.innerHTML = '';
    container.style.display = 'none';
  }
  return;
}

// Hide the plan strip if it exists in DOM (defensive; some layouts render it statically)
function hideLayoutPlanTabsUI() {
  const el = document.getElementById('layoutPlanTabs');
  if (el) {
    el.innerHTML = '';
    el.style.display = 'none';
  }
}


// Hide legacy "Bed defaults / build controls" panel at top of Layout tab.
// The options remain enabled (checked) but the UI is removed; actions are moved into the property toolbar.
function hideLayoutTopControlsUI() {
  const bedCountEl = byId("layoutBedCount");
  const controls = bedCountEl ? bedCountEl.closest(".controls") : null;
  if (controls) controls.style.display = "none";

  // These are now "always-on" behaviors.
  ["layoutUseCurrentPlan", "layoutShowEmpty", "layoutIncludeHarvested"].forEach((id) => {
    const el = byId(id);
    if (el && el.type === "checkbox") el.checked = true;
  });
}

// Move the right-side "Selected Bed Planting Squares" panel above the property map (into layoutSummary).
// This makes the workspace one-column and avoids the right sidebar.
function relocateSelectedBedPanel() {
  const mount = byId("layoutSelectedBedMount");
  if (!mount) return;

  const panel = getSelectedBedPanelNode();
  if (!panel) return;

  // Hide the legacy wrapper that contains the old static header + panel.
  // (The panel itself is re-mounted into layoutSummary each render.)
  hideLegacySelectedBedWrapper();

  // Ensure the panel survives summary.innerHTML rewrites by re-attaching each render.
  attachSelectedBedPanelNodeToMount();
}

function relocatePropertyToolbar() {
  // We no longer move the entire #bedOffsetControls wrapper, because it also contains
  // the Obstacles panel (which must stay under the property map).
  // Instead, we mount ONLY the selected-bed editor panel into the stats card area.
  const mount = byId("layoutBedEditorMount");
  if (!mount) return;

  const panel = byId("propertySelectedBedPanel");
  if (!panel) return;

  if (panel.parentElement !== mount) {
    mount.appendChild(panel);
  }

  // Normalize styling so the stats card "owns" the look.
  panel.style.margin = "0";
}

function ensureGrassGridStyle() {
  if (document.getElementById("pgGrassGridStyle")) return;
  const st = document.createElement("style");
  st.id = "pgGrassGridStyle";
  st.textContent = `
    /* Grass-like property grid background */
    #propertyCanvas{
  min-width:100%;
  min-height:100%;
      background-color: rgba(18, 38, 18, 0.92) !important;
      background-image:
        linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px),
        linear-gradient(rgba(0,0,0,0.22) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,0,0,0.22) 1px, transparent 1px);
      background-size: var(--pgCell,16px) var(--pgCell,16px), var(--pgCell,16px) var(--pgCell,16px), calc(var(--pgCell,16px) * 5) calc(var(--pgCell,16px) * 5), calc(var(--pgCell,16px) * 5) calc(var(--pgCell,16px) * 5);
      background-position: 0 0, 0 0, 0 0, 0 0;
    }
    /* Keep bed selection visible on green */
    #propertyCanvas .property-bed-block.selected{
      box-shadow: 0 0 0 2px rgba(0, 238, 255, 0.9), 0 0 14px rgba(0, 238, 255, 0.25);
    }

    /* ---------- Plant LOD rendering inside beds ---------- */
    #propertyCanvas .property-bed-block{ overflow:hidden; }
    #propertyCanvas .property-bed-block .bed-plants-layer{
      position:absolute; inset:0;
      pointer-events:none;
      z-index: 1;
    }
    /* Far LOD = cheap texture */
    #propertyCanvas .property-bed-block.has-plants .bed-plants-layer[data-lod="far"]{
      background-image:
        radial-gradient(circle at 6px 6px, var(--plant-tint) 0 1px, transparent 2px),
        radial-gradient(circle at 14px 10px, var(--plant-tint) 0 1px, transparent 2px);
      background-size: 18px 18px, 22px 22px;
      background-position: 0 0, 7px 9px;
      opacity: calc(0.18 + (var(--plant-density, 0) * 0.75));
      mix-blend-mode: screen;
      filter: saturate(1.15);
    }
    /* Mid/Near LOD = explicit sprouts (DOM) */
    #propertyCanvas .property-bed-block .plant-sprout{
      position:absolute;
      border-radius: 999px;
      transform: translate(-50%, -50%);
    }

    /* ---------- Rows overlay: do NOT change bed opacity ---------- */
    #propertyCanvas .property-bed-block.has-rows{ opacity: 1 !important; }
    #propertyCanvas .property-bed-block.has-rows::after{
      content:"";
      position:absolute; inset:0;
      pointer-events:none;
      z-index: 0;
      opacity: 0.22;
      background-image: repeating-linear-gradient(
        var(--row-dir, 90deg),
        rgba(255,255,255,0.16) 0px,
        rgba(255,255,255,0.16) 1px,
        transparent 1px,
        transparent var(--row-spacing, 16px)
      );
      mix-blend-mode: overlay;
    }
  `;
  document.head.appendChild(st);
}

function ensurePropertyLabelStyle() {
  if (document.getElementById("pgPropertyLabelStyle")) return;
  const st = document.createElement("style");
  st.id = "pgPropertyLabelStyle";
  st.textContent = `
  /* Readable labels on tiny beds/obstacles (mobile friendly) */
  #propertyCanvas .property-bed-block .bed-label,
  #propertyCanvas .property-obstacle-block .obstacle-label{
    position:absolute;
    left:2px; top:2px; right:2px;
    padding:2px 4px;
    border-radius:6px;
    background: rgba(0,0,0,0.55);
    color: rgba(255,255,255,0.95);
    font-size: clamp(9px, 1.9vw, 12px);
    line-height: 1.05;
    letter-spacing: 0.1px;
    text-shadow: 0 1px 2px rgba(0,0,0,0.7);
    pointer-events:none;
    overflow:hidden;
    white-space:nowrap;
    text-overflow:ellipsis;
  }
  #propertyCanvas .property-bed-block .bed-label:empty,
  #propertyCanvas .property-obstacle-block .obstacle-label:empty{
    display:none;
  }
  #propertyCanvas .property-bed-block[data-small="1"] .bed-label,
  #propertyCanvas .property-obstacle-block[data-small="1"] .obstacle-label{
    font-size: 9px;
    padding:1px 3px;
    border-radius:5px;
  }
  `;
  document.head.appendChild(st);
}

function ensurePropertyState(bedCount, savedProp) {
  const width = (savedProp && typeof savedProp.width === "number") ? savedProp.width : (parseFloat(byId("propertyWidth")?.value) || 80);
  const length = (savedProp && typeof savedProp.length === "number") ? savedProp.length : (parseFloat(byId("propertyLength")?.value) || 120);
  const scale = (savedProp && savedProp.scale != null) ? savedProp.scale : (parseFloat(byId("propertyScale")?.value) || 2);

  const bedsSrc = (savedProp && Array.isArray(savedProp.beds)) ? savedProp.beds : null;
  const offsetsArrFromSave = (savedProp && Array.isArray(savedProp.bedOffsets)) ? savedProp.bedOffsets : null;
  const rotsArrFromSave = (savedProp && Array.isArray(savedProp.bedRot)) ? savedProp.bedRot : null;

  // IMPORTANT:
  // In your older saved shapes, offsets were stored as bedOffsets[] (not embedded per bed).
  // In newer shapes, offsets can live on beds[i].offset. During edits, some beds (often 2+)
  // may temporarily lack .offset if another function rebuilt beds without copying it.
  // Therefore we ALWAYS merge sources in this priority order:
  //   bed.offset -> saved bedOffsets[i] -> in-memory bedOffsets[i] -> {0,0}
  const mergedOffsetFor = (i, bedObj) => {
    if (bedObj && bedObj.offset && typeof bedObj.offset === "object") return bedObj.offset;
    if (offsetsArrFromSave && offsetsArrFromSave[i]) return offsetsArrFromSave[i];
    if (Array.isArray(bedOffsets) && bedOffsets[i]) return bedOffsets[i];
    return { x: 0, y: 0 };
  };

  // Rotation merge:
  //   bed.rot -> saved bedRot[i] -> in-memory bedRot[i] -> 0
  const mergedRotFor = (i, bedObj) => {
    if (bedObj && (bedObj.rot === 1 || bedObj.rot === true)) return 1;
    if (typeof bedObj?.rot === "number" && isFinite(bedObj.rot)) return (bedObj.rot ? 1 : 0);
    if (rotsArrFromSave && (rotsArrFromSave[i] === 1 || rotsArrFromSave[i] === true)) return 1;
    if (Array.isArray(bedRot) && (bedRot[i] === 1 || bedRot[i] === true)) return 1;
    return 0;
  };

  // If you previously added obstacles, preserve them if present
  const obstaclesSrc = (savedProp && Array.isArray(savedProp.obstacles)) ? savedProp.obstacles : [];

  // Fallback bed dims (from layout inputs) if per-bed dims are missing
  const fallbackWFt = (parseFloat(byId("bedWidthFt")?.value) || 0); // optional if you have it
  const fallbackLFt = (parseFloat(byId("bedLengthFt")?.value) || 0); // optional if you have it

  const beds = Array.from({ length: bedCount }, (_, i) => {
    const b = bedsSrc?.[i] || {};
    const o = mergedOffsetFor(i, b) || {};
    return {
      name: (typeof b.name === "string" && b.name.trim()) ? b.name : `Bed ${i + 1}`,
      // Per-bed plan association (bed-level only; never global)
      planId: (typeof b.planId === "string" && b.planId) ? b.planId : (typeof b.planID === "string" ? b.planID : (typeof b.plan === "string" ? b.plan : null)),
      planName: (typeof b.planName === "string" && b.planName.trim()) ? b.planName.trim() : null,
      type: (typeof b.type === "string" && b.type) ? b.type : "raised",
      pathFt: (typeof b.pathFt === "number" && isFinite(b.pathFt)) ? b.pathFt : 2,
      // Per-bed dimensions in feet (null => renderer falls back to global bedW/bedL)
      wFt: (typeof b.wFt === "number" && isFinite(b.wFt) && b.wFt > 0) ? b.wFt : (fallbackWFt > 0 ? fallbackWFt : null),
      lFt: (typeof b.lFt === "number" && isFinite(b.lFt) && b.lFt > 0) ? b.lFt : (fallbackLFt > 0 ? fallbackLFt : null),
      rowCount: (typeof b.rowCount === "number" && isFinite(b.rowCount) && b.rowCount >= 1) ? Math.round(b.rowCount) : 0,
      rowSpacingFt: (typeof b.rowSpacingFt === "number" && isFinite(b.rowSpacingFt) && b.rowSpacingFt > 0) ? b.rowSpacingFt : 1,
      rowDir: (typeof b.rowDir === "string" && b.rowDir) ? b.rowDir : "auto",
      offset: {
        x: (typeof o.x === "number" && isFinite(o.x)) ? o.x : 0,
        y: (typeof o.y === "number" && isFinite(o.y)) ? o.y : 0
      },
      rot: mergedRotFor(i, b)
    };
  });

  const obstacles = obstaclesSrc.map((ob, i) => {
    const o = ob || {};
    const off = o.offset || {};
    return {
      id: (typeof o.id === "string" && o.id) ? o.id : `ob_${Date.now()}_${i}`,
      name: (typeof o.name === "string") ? o.name.trim() : `Obstacle ${i + 1}`,
      kind: (typeof o.kind === "string" && o.kind) ? o.kind : (typeof o.type === "string" && o.type ? o.type : "shed"),
      type: (typeof o.type === "string" && o.type) ? o.type : (typeof o.kind === "string" && o.kind ? o.kind : "shed"),
      wFt: (typeof o.wFt === "number" && isFinite(o.wFt) && o.wFt > 0) ? o.wFt : 10,
      lFt: (typeof o.lFt === "number" && isFinite(o.lFt) && o.lFt > 0) ? o.lFt : 10,
      rot: (typeof o.rot === "number" && isFinite(o.rot)) ? (o.rot ? 1 : 0) : 0,
      offset: {
        x: (typeof off.x === "number" && isFinite(off.x)) ? off.x : 0,
        y: (typeof off.y === "number" && isFinite(off.y)) ? off.y : 0
      }
    };
  });

  return { width, length, scale, beds, obstacles };
}

// In-place variant used by interactive editing.
// Avoids recreating bed objects on every render, which can wipe per-bed settings for beds 3+.
function ensurePropertyStateInPlace(bedCount, srcProp) {
  // Initialize propertyState if absent (NO recursion!)
  if (!propertyState) {
    const base = (srcProp && typeof srcProp === "object") ? srcProp : {};
    const pw0 = parseFloat(byId("propertyWidth")?.value);
    const pl0 = parseFloat(byId("propertyLength")?.value);
    const ps0 = parseFloat(byId("propertyScale")?.value);

    propertyState = {
      width: (typeof base.width === "number" && isFinite(base.width) && base.width > 0) ? base.width
           : (Number.isFinite(pw0) && pw0 > 0) ? pw0 : 80,
      length: (typeof base.length === "number" && isFinite(base.length) && base.length > 0) ? base.length
            : (Number.isFinite(pl0) && pl0 > 0) ? pl0 : 120,
      scale: (typeof base.scale === "number" && isFinite(base.scale) && base.scale > 0) ? base.scale
           : (Number.isFinite(ps0) && ps0 > 0) ? ps0 : 2,
      beds: Array.isArray(base.beds) ? base.beds.map(b => (b && typeof b === "object") ? { ...b } : {}) : [],
      obstacles: Array.isArray(base.obstacles) ? base.obstacles.map(o => (o && typeof o === "object") ? { ...o } : {}) : []
    };
  }

  // Keep top-level dimensions stable (prefer existing unless inputs are set)
  const pw = parseFloat(byId("propertyWidth")?.value);
  const pl = parseFloat(byId("propertyLength")?.value);
  const ps = parseFloat(byId("propertyScale")?.value);

  if (Number.isFinite(pw) && pw > 0) propertyState.width = pw;
  if (Number.isFinite(pl) && pl > 0) propertyState.length = pl;
  if (Number.isFinite(ps) && ps > 0) propertyState.scale = ps;

  if (!Array.isArray(propertyState.beds)) propertyState.beds = [];
  if (!Array.isArray(propertyState.obstacles)) propertyState.obstacles = [];

  const beds = propertyState.beds;

  // Grow or shrink beds array without reinitializing existing beds
  if (beds.length > bedCount) beds.length = bedCount;
  while (beds.length < bedCount) beds.push({});

  // Use current canonical arrays when present
  const offs = Array.isArray(bedOffsets) ? bedOffsets : [];
  const rots = Array.isArray(bedRot) ? bedRot : [];

  // Fill missing fields only; never overwrite existing valid values
  for (let i = 0; i < bedCount; i++) {
    const b = beds[i] || {};
    // Stable id (never changes once set)
    if (!(typeof b.id === "string" && b.id)) b.id = `bed${i + 1}`;
    // Name
    if (!(typeof b.name === "string" && b.name.trim())) b.name = `Bed ${i + 1}`;
    // Type
    if (!(typeof b.type === "string" && b.type)) b.type = "raised";
    // Path
    if (!(typeof b.pathFt === "number" && isFinite(b.pathFt))) b.pathFt = 2;
    // Dimensions (persist per-bed defaults so they don't revert to stock after reload)
    const _defWFt = parseFloat(byId("layoutBedW")?.value || byId("bedWidth")?.value || "") || null;
    const _defLFt = parseFloat(byId("layoutBedL")?.value || byId("bedLength")?.value || "") || null;
    if (!(typeof b.wFt === "number" && isFinite(b.wFt) && b.wFt > 0)) {
      b.wFt = (typeof _defWFt === "number" && isFinite(_defWFt) && _defWFt > 0) ? _defWFt : null;
    }
    if (!(typeof b.lFt === "number" && isFinite(b.lFt) && b.lFt > 0)) {
      b.lFt = (typeof _defLFt === "number" && isFinite(_defLFt) && _defLFt > 0) ? _defLFt : null;
    }
    // Plan metadata (null allowed)
    if (!(b.planId === null || (typeof b.planId === "string" && b.planId))) b.planId = null;
    if (!(b.planName === null || (typeof b.planName === "string" && b.planName.trim()))) b.planName = null;

    // Row settings
    if (!(typeof b.rowCount === "number" && isFinite(b.rowCount) && b.rowCount >= 0)) b.rowCount = 0;
    if (!(typeof b.rowSpacingFt === "number" && isFinite(b.rowSpacingFt) && b.rowSpacingFt > 0)) b.rowSpacingFt = 1;
    if (!(typeof b.rowDir === "string" && b.rowDir)) b.rowDir = "auto";

    // Offset: prefer bed.offset, else canonical bedOffsets[i]
    const ox = (b.offset && typeof b.offset.x === "number" && isFinite(b.offset.x)) ? b.offset.x
             : (offs[i] && typeof offs[i].x === "number" && isFinite(offs[i].x)) ? offs[i].x
             : 0;
    const oy = (b.offset && typeof b.offset.y === "number" && isFinite(b.offset.y)) ? b.offset.y
             : (offs[i] && typeof offs[i].y === "number" && isFinite(offs[i].y)) ? offs[i].y
             : 0;
    b.offset = { x: ox, y: oy };

    // NEW: ensure feet-based offset
    if (!b.offsetFt) b.offsetFt = ensureOffsetFt(b, propertyState?.scale || 2);


    // Rot: prefer bed.rot, else canonical bedRot[i]
    const r = (typeof b.rot === "number" && isFinite(b.rot)) ? (b.rot ? 1 : 0)
            : (rots[i] ? 1 : 0);
    b.rot = r;

    beds[i] = b;
  }

  
  // NEW: ensure feet-based offset for obstacles
  try {
    if (Array.isArray(propertyState.obstacles)) {
      propertyState.obstacles.forEach((o) => {
        if (o && !o.offsetFt) o.offsetFt = ensureOffsetFt(o, propertyState?.scale || 2);
      });
    }
  } catch (e) {}

return propertyState;
}

// ───────────────────────────────────────────────────────────────
// Property map: scale-aware offset handling
//
// Offsets (beds + obstacles) are stored in GRID UNITS (cells), not feet.
// If propertyScale (ft per cell) changes, we must rescale offsets so the
// physical (feet) position stays the same:
//   feet = cells * oldScale
//   newCells = feet / newScale = cells * (oldScale / newScale)
//
// Without this, switching 5ft→1ft makes everything "shrink" toward (0,0)
// and appear off-center because the offsets no longer represent the same
// real-world location.
// ───────────────────────────────────────────────────────────────

function __pg_number(v, fallback = 0) {
  const n = (typeof v === "number") ? v : parseFloat(v);
  return (Number.isFinite(n) ? n : fallback);
}

function __pg_roundTo(v, step) {
  if (!Number.isFinite(v)) return 0;
  if (!step || step <= 1) return Math.round(v);
  return Math.round(v / step) * step;
}

function __pg_clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
// ───────────────────────────────────────────────────────────────
// Positions stored in absolute feet (real-world coords)
// This makes both scale AND dimension changes non-destructive
// ───────────────────────────────────────────────────────────────

function ensureOffsetFt(item, fallbackScale = 2) {
  if (!item) return { x: 0, y: 0 };

  // New format already present
  if (item.offsetFt && typeof item.offsetFt.x === "number") {
    return { x: Number(item.offsetFt.x) || 0, y: Number(item.offsetFt.y) || 0 };
  }

  // Legacy conversion (cells → feet)
  const cellOffset = item.offset || { x: 0, y: 0 };
  const scale = propertyState?.scale || fallbackScale;
  return {
    x: (cellOffset.x || 0) * scale,
    y: (cellOffset.y || 0) * scale
  };
}

function getDisplayCellPos(item, currentScale) {
  const ft = item.offsetFt || ensureOffsetFt(item, currentScale);
  return {
    x: Math.round(ft.x / currentScale),
    y: Math.round(ft.y / currentScale)
  };
}


function __pg_bedUnitsForScale(bedIndex, scaleFt, bedWDefault, bedLDefault) {
  const bedObj = propertyState?.beds?.[bedIndex] || {};
  const wFt = (typeof bedObj.wFt === "number" && isFinite(bedObj.wFt) && bedObj.wFt > 0) ? bedObj.wFt : bedWDefault;
  const lFt = (typeof bedObj.lFt === "number" && isFinite(bedObj.lFt) && bedObj.lFt > 0) ? bedObj.lFt : bedLDefault;
  const baseWU = Math.max(1, Math.round(wFt / scaleFt));
  const baseLU = Math.max(1, Math.round(lFt / scaleFt));
  const r = bedRot?.[bedIndex] ? 1 : 0;
  return r ? { wU: baseLU, lU: baseWU } : { wU: baseWU, lU: baseLU };
}

function __pg_rescaleAllOffsetsOnScaleChange(oldScaleFt, newScaleFt, bedCount, bedWDefault, bedLDefault, colsNew, rowsNew, snapUnits = 1) {
  try {
    const os = __pg_number(oldScaleFt, NaN);
    const ns = __pg_number(newScaleFt, NaN);
    if (!Number.isFinite(os) || !Number.isFinite(ns) || os <= 0 || ns <= 0) return false;
    if (os === ns) return false;

    ensurePropertyStateInPlace(bedCount, propertyState);

    const ratio = os / ns;

    // Beds
    for (let i = 0; i < bedCount; i++) {
      const cur = bedOffsets?.[i] || propertyState?.beds?.[i]?.offset || { x: 0, y: 0 };
      const nx0 = __pg_roundTo(__pg_number(cur.x, 0) * ratio, snapUnits);
      const ny0 = __pg_roundTo(__pg_number(cur.y, 0) * ratio, snapUnits);

      const dims = __pg_bedUnitsForScale(i, ns, bedWDefault, bedLDefault);
      const maxX = Math.max(0, (colsNew ?? 0) - dims.wU);
      const maxY = Math.max(0, (rowsNew ?? 0) - dims.lU);
      const nx = __pg_clamp(nx0, 0, maxX);
      const ny = __pg_clamp(ny0, 0, maxY);

      bedOffsets[i] = { x: nx, y: ny };
      if (propertyState?.beds?.[i]) propertyState.beds[i].offset = bedOffsets[i];
    }

    // Obstacles
    const obs = propertyState?.obstacles;
    if (Array.isArray(obs)) {
      for (let j = 0; j < obs.length; j++) {
        const o = obs[j];
        if (!o) continue;
        if (!o.offset) o.offset = { x: 0, y: 0 };
        const owU = Math.max(1, Math.round((__pg_number(o.wFt, 10)) / ns));
        const olU = Math.max(1, Math.round((__pg_number(o.lFt, 10)) / ns));
        const maxX = Math.max(0, (colsNew ?? 0) - owU);
        const maxY = Math.max(0, (rowsNew ?? 0) - olU);
        const nx0 = __pg_roundTo(__pg_number(o.offset.x, 0) * ratio, snapUnits);
        const ny0 = __pg_roundTo(__pg_number(o.offset.y, 0) * ratio, snapUnits);
        o.offset.x = __pg_clamp(nx0, 0, maxX);
        o.offset.y = __pg_clamp(ny0, 0, maxY);
      }
    }

    // Keep canonical top-level scale
    propertyState.scale = ns;
    return true;
  } catch (e) {
    return false;
  }
}


function getBedSliceRange(bedIndex, bedSq) {
  const start = bedIndex * bedSq;
  const end = start + bedSq;
  return { start, end };
}

// === GLOBAL PROPERTY STORAGE (never per-plan) ===
function getPropertyStorageKey() {
  return "pg_property_layout_global_v2"; // fixed key — same for all plans
}

function savePropertyLayout() {
  const key = getPropertyStorageKey();
  const state = {
    width:  parseFloat(byId("propertyWidth")?.value)  || 80,
    length: parseFloat(byId("propertyLength")?.value) || 120,
    scale:  parseFloat(byId("propertyScale")?.value)  || 2,
    beds:   (propertyState?.beds || []).map((b, i) => ({
      ...(b || {}),
      offset: (b && b.offset) ? b.offset : (Array.isArray(bedOffsets) && bedOffsets[i] ? bedOffsets[i] : { x: 0, y: 0 }),
      rot: (b && typeof b.rot === "number") ? b.rot : ((Array.isArray(bedRot) && bedRot[i]) ? 1 : 0)
    })),
    bedOffsets: bedOffsets || [],
    bedRot: bedRot || [],
    obstacles: propertyState?.obstacles || []
  };
  localStorage.setItem(key, JSON.stringify(state));
}

// Debounced autosave for property-layout changes.
// Global because some UI handlers (bed editor dropdowns, etc.) are outside
// the property-canvas render scope.
let __pgPropAutosaveT = null;
window.autoSaveLayoutProperty = function () {
  try {
    if (__pgPropAutosaveT) clearTimeout(__pgPropAutosaveT);
    __pgPropAutosaveT = setTimeout(() => {
      try {
        // Save ONLY the property layout state.
        savePropertyLayout();
      } catch (e) {
        // fallback (older builds)
        try { if (typeof autoSave === "function") autoSave(); } catch (e2) {}
      }
    }, 250);
  } catch (e) {}
};


function getLayoutStorageKey(_planId) {
  return "gardenLayout_global_v8";
}


function saveLayoutState(state) {
  const key = getLayoutStorageKey();
  localStorage.setItem(key, JSON.stringify(state));
}


function loadPropertyLayout() {
  const key = getPropertyStorageKey();
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    // Restore inputs
    const pw = byId("propertyWidth");  if (pw) pw.value = data.width;
    const pl = byId("propertyLength"); if (pl) pl.value = data.length;
    const ps = byId("propertyScale");  if (ps) ps.value = data.scale;

    // Restore in-memory state
    propertyState = {
      width: data.width,
      length: data.length,
      scale: data.scale,
      beds: data.beds || [],
      obstacles: data.obstacles || []
    };
    bedOffsets = data.bedOffsets || [];
    bedRot = data.bedRot || [];

    // Backfill offsets/rot into bed objects for older saves that stored positions only in arrays
    try {
      if (propertyState && Array.isArray(propertyState.beds)) {
        for (let i = 0; i < propertyState.beds.length; i++) {
          const b = propertyState.beds[i] || {};
          if (!b.offset && Array.isArray(bedOffsets) && bedOffsets[i]) b.offset = bedOffsets[i];
          if ((b.rot === undefined || b.rot === null) && Array.isArray(bedRot) && bedRot[i] !== undefined) b.rot = bedRot[i];
          propertyState.beds[i] = b;
        }
      }
    } catch (e) {}

        // Migration safety: ensure feet-based offsets exist
    try {
      propertyState.beds?.forEach(b => { if (b && !b.offsetFt) b.offsetFt = ensureOffsetFt(b, propertyState.scale); });
      propertyState.obstacles?.forEach(o => { if (o && !o.offsetFt) o.offsetFt = ensureOffsetFt(o, propertyState.scale); });
    } catch (e) {}



    // Rebuild canonical arrays from bed objects (prevents "snap to birth" on next drag)
    try {
      const n = Array.isArray(propertyState.beds) ? propertyState.beds.length : 0;
      if (n > 0) {
        const scaleNow = (typeof data.scale === "number" && isFinite(data.scale) && data.scale > 0) ? data.scale : (propertyState.scale || 2);
        bedOffsets = ensureBedOffsets(n, propertyState.beds.map((b) => {
          if (b && b.offset && typeof b.offset.x === "number" && typeof b.offset.y === "number") return b.offset;
          // fall back to offsetFt -> cells
          return getDisplayCellPos((b || {}), scaleNow);
        }));
        bedRot = ensureBedRot(n, propertyState.beds.map((b) => (typeof b?.rot === "number" ? b.rot : 0)));
        for (let i = 0; i < n; i++) {
          if (!propertyState.beds[i]) propertyState.beds[i] = {};
          propertyState.beds[i].offset = bedOffsets[i];
          propertyState.beds[i].rot = bedRot[i] ? 1 : 0;
        }
      }
    } catch (e) {}

return true;
  } catch (e) {
    console.warn("Failed to load global property layout", e);
    return null;
  }
}

function clearPropertyLayout() {
  const key = getPropertyStorageKey();
  localStorage.removeItem(key);
  alert("Global property layout cleared.");
  location.reload(); // refresh to reset UI
}

function loadSavedLayout() {
  // Global layout state (property + beds + selected bed contents) should NOT be per-plan.
  // Older builds stored it per My Garden plan; we support a fallback read.
  const primaryKey = getLayoutStorageKey();
  let raw = localStorage.getItem(primaryKey);

  if (!raw) {
    const planId =
      (typeof getCurrentPlan === "function" ? getCurrentPlan("mygarden") : null) ||
      (window.currentPlanId && currentPlanId.mygarden ? currentPlanId.mygarden : null) ||
      "default";
    const legacyKey = `gardenLayout_v7_${planId}`;
    raw = localStorage.getItem(legacyKey);
  }

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Saved layout data is corrupt. Ignoring.", e);
    return null;
  }
}


function clearSavedLayoutState() {
  const key = getLayoutStorageKey();
  localStorage.removeItem(key);

  // Also clear legacy per-plan key (older builds), for the currently selected plan.
  const planId =
    (typeof getCurrentPlan === "function" ? getCurrentPlan("mygarden") : null) ||
    (window.currentPlanId && currentPlanId.mygarden ? currentPlanId.mygarden : null) ||
    "default";
  localStorage.removeItem(`gardenLayout_v7_${planId}`);
}


function loadLayoutState() {
  const saved = loadSavedLayout();
  if (!saved || !Array.isArray(saved.used)) {
    lastLayout = null;
    editableState = null;
    /* do not clear bedOffsets here; property layout may exist */
    return null;
  }

  const w = saved.w ?? 4;
  const l = saved.l ?? 8;

  // Safe fallback: use saved bedCount or number of beds from global property layout
  const bedCount = Math.max(0, parseInt(saved.bedCount ?? (propertyState?.beds?.length ?? 0), 10) || 0);

  const bedSq = w * l;
  // push into bed inputs so they don't snap back
  const wInput = byId("layoutBedW");
  const lInput = byId("layoutBedL");
  const cInput = byId("layoutBedCount");
  if (wInput) wInput.value = String(w);
  if (lInput) lInput.value = String(l);
  if (cInput) cInput.value = String(bedCount);
  // hydrate in-memory state
  lastLayout = { w, l, bedCount, bedSq, used: saved.used.slice() };
  editableState = { w, l, bedCount, bedSq, used: saved.used.slice() };
    // --- restore property state (canonical beds object) ---
  // Prefer the globally loaded propertyState (from loadPropertyLayout)
  // Fall back to saved.property only for legacy compatibility
  const fallbackProp = saved && saved.property ? saved.property : null;
  ensurePropertyStateInPlace(bedCount, propertyState || fallbackProp);
  // keep arrays in sync with canonical beds
  bedOffsets = ensureBedOffsets(bedCount, propertyState.beds.map(b => b.offset));
  bedRot = ensureBedRot(bedCount, propertyState.beds.map(b => b.rot));
  return lastLayout;
}

// Simple helper: draw beds as blocks on a property canvas.
// This does NOT affect crop-square layout, only the high-level sketch.
function renderPropertySketch(bedCount, bedW, bedL) {
  const viewport = byId("propertyViewport");
  const canvas = byId("propertyCanvas");
  if (!viewport || !canvas) return;

  // Keep a stable rerender hook for Resize/Intersection observers.
  // Store the latest args so any layout resize can re-fit the map.
  window.__pgLastMapArgs = { bedCount, bedW, bedL };
  if (typeof window.__pgRerenderMap !== "function") {
    window.__pgRerenderMap = () => {
      const a = window.__pgLastMapArgs || {};
      renderPropertySketch(a.bedCount, a.bedW, a.bedL);
    };
  }

  // Ensure observers are installed once.
  installPropertyViewportObserver();

  // If we're rendering while the tab is hidden/collapsed, viewport can report 0 width.
  // In that case: DON'T wipe existing content; just retry soon.
  const vwNow = viewport.getBoundingClientRect().width || viewport.clientWidth || 0;
  if (vwNow < 120) {
    viewport.__pgViewportRetryCount = (viewport.__pgViewportRetryCount || 0) + 1;
    if (viewport.__pgViewportRetryCount <= 25) {
      requestAnimationFrame(() => window.__pgRerenderMap && window.__pgRerenderMap());
      // one extra delayed retry helps when switching tabs / mobile address bar settles
      setTimeout(() => window.__pgRerenderMap && window.__pgRerenderMap(), 200);
    }
    return;
  }
  viewport.__pgViewportRetryCount = 0;

  // Safe to wipe + rebuild now.
  canvas.innerHTML = "";
  // NOTE: do not wipe #bedOffsetControls here; it hosts the obstacle toolbar and is rendered separately.

  const wFt = Math.max(10, Number(byId("propertyWidth")?.value || 80));
  const lFt = Math.max(10, Number(byId("propertyLength")?.value || 120));
  const scale = Math.max(1, Number(byId("propertyScale")?.value || 2));
  const snap = Math.max(1, Number(byId("propertySnap")?.value || 1));

  // Use ceil so the full requested space is representable.
  const cols = Math.max(1, Math.ceil(wFt / scale));
  const rows = Math.max(1, Math.ceil(lFt / scale));

  // Fit model: grid always fills the viewport; dimensions control the units-per-cell.
  const rect = viewport.getBoundingClientRect();
  const availW = Math.max(240, (rect.width || viewport.clientWidth || 0) - 4);
  // Cap by visual height so we avoid huge empty vertical space when rows are small.
  const targetVH = Math.max(360, Math.min(760, (window.innerHeight || 800) * 0.62));
  const availH = Math.max(220, (rect.height || viewport.clientHeight || targetVH) - 4);

  const byW = (availW - 2) / cols;
  const byH = (availH - 2) / rows; // kept for potential future "fit-both" mode

  // Viewport-defined model (Option 1):
  // - Width always fills the available viewport width
  // - Length extends vertically (scroll/pan) instead of shrinking width
  // This prevents the "right-side black gap" and the "vertical wall" drag limit.
  let cellSize = Math.ceil(byW);
  cellSize = Math.max(2, Math.min(240, cellSize));
  if (cellSize * cols < (availW - 1)) cellSize += 1;

  const boundW = cols * cellSize;
  const boundH = rows * cellSize;

  // Always fill the viewport, even if the property bounds are smaller.
  const fillW = Math.max(boundW, availW);
  const fillH = Math.max(boundH, Math.max(targetVH, availH));

  canvas.style.width = fillW + "px";
  canvas.style.height = fillH + "px";
  canvas.style.minWidth = fillW + "px";
  canvas.style.minHeight = fillH + "px";

  // Lock viewport height so panel changes don't jump the page.
  viewport.style.height = targetVH + "px";
  viewport.style.maxHeight = targetVH + "px";


  // Preserve viewport position across scale changes (avoid jumps/voids).
  const prevMaxX = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  const prevMaxY = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  const prevFracX = prevMaxX ? (viewport.scrollLeft / prevMaxX) : 0;
  const prevFracY = prevMaxY ? (viewport.scrollTop  / prevMaxY) : 0;
  const prevScaleFt = parseFloat(viewport.dataset.pgLastScale || "");
  viewport.dataset.pgLastScale = String(scale);

  // If the user changed ft-per-grid-unit, keep beds/obstacles in the same
  // real-world position by rescaling offsets (stored in grid units).
  if (Number.isFinite(prevScaleFt) && prevScaleFt > 0 && prevScaleFt !== scale) {
    __pg_rescaleAllOffsetsOnScaleChange(prevScaleFt, scale, bedCount, bedW, bedL, cols, rows, snap);
  }


  // Bounds for clamping placed objects (in px for the true property area).
  window.__pgPropertyBoundsPx = { w: boundW, h: boundH, cell: cellSize, cols, rows, scale, snap };

  // Grid background + crisp edges.
// Grid background is applied inline so it always fills the full canvas
// (prevents "black gaps" when the bounds marker is smaller than the viewport).
const minor = cellSize;
const major = cellSize * 5;

// Keep the class for any existing theming, but the inline styles below are the source of truth.
canvas.classList.add("property-grid-strong");

canvas.style.backgroundColor = "rgba(7, 40, 18, 0.75)";
canvas.style.backgroundImage = [
  "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
  "linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
  "linear-gradient(rgba(255,255,255,0.10) 1px, transparent 1px)",
  "linear-gradient(90deg, rgba(255,255,255,0.10) 1px, transparent 1px)"
].join(",");

canvas.style.backgroundSize = [
  `${minor}px ${minor}px`,
  `${minor}px ${minor}px`,
  `${major}px ${major}px`,
  `${major}px ${major}px`
].join(",");

canvas.style.backgroundPosition = "0 0,0 0,0 0,0 0";

// Legend + boundary marker
  const marker = document.createElement("div");
  marker.className = "property-bounds-marker";
  marker.style.width = boundW + "px";
  marker.style.height = boundH + "px";
  canvas.appendChild(marker);

  const legend = document.createElement("div");
  legend.className = "property-grid-legend";
  legend.textContent = `1 square = ${scale} ft • ${wFt}ft × ${lFt}ft`;
  canvas.appendChild(legend);

  // Clamp/restore scroll after resize so changing 1ft/2ft/5ft never "loses" the map.
  requestAnimationFrame(() => {
    const maxX = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const maxY = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollLeft = Math.max(0, Math.min(maxX, Math.round(prevFracX * maxX)));
    viewport.scrollTop  = Math.max(0, Math.min(maxY, Math.round(prevFracY * maxY)));
  });

  // Ensure property state exists and can be rendered.
  ensurePropertyStateInPlace(bedCount, window.propertyState);

  // ---- existing rendering pipeline continues below ----
  // ---- helpers (snap + units) ----
  const snapUnits = parseInt(byId("propertySnap")?.value || "1", 10) || 1;
  
function __pg_getScale(el){
  try{
    const r = el.getBoundingClientRect();
    const ow = el.offsetWidth || 0;
    return ow ? (r.width / ow) : 1;
  }catch(e){ return 1; }
}
function __pg_clientToCanvas(ev, canvas, viewport){
  const scale = __pg_getScale(canvas);
  const cr = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - cr.left) / scale + (viewport?.scrollLeft || 0),
    y: (ev.clientY - cr.top) / scale + (viewport?.scrollTop || 0),
    scale
  };
}

function snapTo(v, step) {
    if (!step || step <= 1) return v;
    return Math.round(v / step) * step;
  }
  function bedUnitsFor(b) {
    // rotation-aware footprint in grid units
    const bedObj = propertyState?.beds?.[b] || {};
    const wFt = (typeof bedObj.wFt === "number" && isFinite(bedObj.wFt) && bedObj.wFt > 0) ? bedObj.wFt : bedW;
    const lFt = (typeof bedObj.lFt === "number" && isFinite(bedObj.lFt) && bedObj.lFt > 0) ? bedObj.lFt : bedL;
    const baseWU = Math.max(1, Math.round(wFt / scale));
    const baseLU = Math.max(1, Math.round(lFt / scale));
    const r = bedRot?.[b] ? 1 : 0;
    return r ? { wU: baseLU, lU: baseWU, wFt: lFt, lFt: wFt } : { wU: baseWU, lU: baseLU, wFt, lFt };
  }
function applyRowsVisual(bedIndex, bedBlock, wPx, hPx) {
  const bedObj = propertyState?.beds?.[bedIndex] || {};
  const count = Math.max(0, Math.round(bedObj.rowCount || 0));

  // Toggle class (CSS will do the rendering)
  if (!count) {
    bedBlock.classList.remove("has-rows");
    bedBlock.style.removeProperty("--row-spacing");
    bedBlock.style.removeProperty("--row-dir");
    return;
  }

  const spacingFt =
    (typeof bedObj.rowSpacingFt === "number" && isFinite(bedObj.rowSpacingFt) && bedObj.rowSpacingFt > 0)
      ? bedObj.rowSpacingFt
      : 1;

  let spacingPx = (spacingFt / scale) * cellSize;
  spacingPx = Math.max(6, spacingPx);

  let dir = bedObj.rowDir || "auto";
  if (dir === "auto") dir = (bedRot?.[bedIndex] ? "horizontal" : "vertical");

  if (count >= 2) {
    if (dir === "vertical") spacingPx = Math.max(6, wPx / count);
    else spacingPx = Math.max(6, hPx / count);
  }

  bedBlock.classList.add("has-rows");
  bedBlock.style.setProperty("--row-spacing", `${spacingPx}px`);
  bedBlock.style.setProperty("--row-dir", dir);
}


// Helper: rerender the property sketch using current layout bed dimensions inputs (safe outside renderPropertySketch scope).
function renderPropertySketchFromInputs(bedCount){
  const bw = Math.max(1, Math.floor(parseFloat(byId("layoutBedW")?.value || "4")));
  const bl = Math.max(1, Math.floor(parseFloat(byId("layoutBedL")?.value || "8")));
  renderPropertySketch(bedCount, bw, bl);
}

  function applyPlantsVisual(bedIndex, bedBlock, wPx, hPx) {
    // LOD plant rendering inside beds based on this bed's crop squares.
    // Uses editableState.used bed slices (same as right-side "Selected Bed Planting Squares").
    if (!lastLayout || !editableState || !Array.isArray(editableState.used)) {
      bedBlock.classList.remove("has-plants");
      const layer = bedBlock.querySelector(".bed-plants-layer");
      if (layer) layer.remove();
      bedBlock.style.removeProperty("--plant-tint");
      bedBlock.style.removeProperty("--plant-density");
      return;
    }
  
    const bedSq =
      lastLayout?.bedSq ||
      (lastLayout?.w && lastLayout?.l ? Math.round(lastLayout.w * lastLayout.l) : 0);
  
    if (!bedSq) return;
  
    const start = bedIndex * bedSq;
    const end = Math.min(editableState.used.length, start + bedSq);
    if (start >= end) return;
  
    const counts = Object.create(null);
    let total = 0;
    for (let i = start; i < end; i++) {
      const v = (editableState.used[i] || "").trim();
      if (!v) continue;
      total++;
      counts[v] = (counts[v] || 0) + 1;
    }
  
    if (!total) {
      bedBlock.classList.remove("has-plants");
      const layer = bedBlock.querySelector(".bed-plants-layer");
      if (layer) layer.remove();
      bedBlock.style.removeProperty("--plant-tint");
      bedBlock.style.removeProperty("--plant-density");
      return;
    }
  
    // Dominant crop tint (for far LOD texture)
    let dom = null, domC = 0;
    for (const k in counts) {
      if (counts[k] > domC) { domC = counts[k]; dom = k; }
    }
  
    // Local hue/hash (match colorForCrop hashing, but brighter)
    function cropHue(name) {
      let h = 0;
      for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
      return h % 360;
    }
    const hue = cropHue(dom || "Plants");
    const tint = `hsl(${hue} 70% 55% / 0.85)`;
    bedBlock.style.setProperty("--plant-tint", tint);
    bedBlock.style.setProperty("--plant-density", String(Math.min(1, total / bedSq)));
    bedBlock.classList.add("has-plants");
  
    // Decide LOD by on-screen area + plant count
    const area = Math.max(1, (wPx || 1) * (hPx || 1));
    let lod = "near";
    if (area < 1300 || total > 160) lod = "far";
    else if (area < 5200 || total > 70) lod = "mid";
  
    let layer = bedBlock.querySelector(".bed-plants-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "bed-plants-layer";
      bedBlock.appendChild(layer);
    }
    layer.dataset.lod = lod;
  
    // FAR: keep a cheap textured overlay (CSS-driven) — no DOM sprouts
    if (lod === "far") {
      layer.innerHTML = "";
      return;
    }
  
    // MID/NEAR: scatter a capped number of sprouts for a game-y look.
    // Keep deterministic positions so the bed doesn't "shuffle" on re-render.
    function hash32(str) {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      return h >>> 0;
    }
    function mulberry32(a) {
      return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
  
    const seed = hash32(`${bedIndex}|${dom || ""}|${total}|${wPx}x${hPx}`);
    const rnd = mulberry32(seed);
  
    // Weighted picker across crop counts
    const crops = Object.keys(counts);
    const weights = crops.map((c) => counts[c]);
    const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
    function pickCrop() {
      let r = rnd() * weightSum;
      for (let i = 0; i < crops.length; i++) {
        r -= weights[i];
        if (r <= 0) return crops[i];
      }
      return crops[crops.length - 1] || "Plant";
    }
  

// --- Game-style crop category sprites (SVG images) ---
function cropCategory(name){
  const n = String(name||"").toLowerCase();
  if (!n) return "generic";
  if (/(tomato|pepper|eggplant|aubergine|cucumber|zucchini|squash|pumpkin|melon|watermelon|strawberry|corn|okra)/.test(n)) return "fruiting";
  if (/(lettuce|spinach|kale|arugula|rocket|chard|bok choy|pak choi|mustard greens|endive|escarole)/.test(n)) return "leafy";
  if (/(carrot|beet|radish|turnip|parsnip|potato|yam|sweet potato)/.test(n)) return "root";
  if (/(onion|garlic|leek|shallot|scallion|chive)/.test(n)) return "allium";
  if (/(broccoli|cabbage|cauliflower|brussels|collard)/.test(n)) return "brassica";
  if (/(bean|beans|pea|peas|lentil|soy)/.test(n)) return "legume";
  if (/(basil|cilantro|coriander|parsley|dill|mint|oregano|thyme|sage|rosemary|lavender|chamomile)/.test(n)) return "herb";
  return "generic";
}
function svgUrl(svg){
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}
function spriteSvg(cat, stage, variant, cropName){
  const baseHue = (function(name){
    let h = 0;
    const s = String(name||"");
    for (let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i))>>>0;
    return h % 360;
  })(cropName||cat);

  const leafHue =
    cat === "brassica" ? 105 :
    cat === "herb" ? 130 :
    cat === "allium" ? 112 :
    cat === "root" ? 118 :
    cat === "fruiting" ? 120 :
    cat === "leafy" ? 126 : 122;

  const h = (leafHue + ((baseHue%18)-9) + 360) % 360;
  const leaf1 = `hsl(${h} 78% 56%)`;
  const leaf2 = `hsl(${(h+12)%360} 80% 50%)`;
  const leaf3 = `hsl(${(h-12+360)%360} 72% 48%)`;
  const outline = `hsla(${h} 55% 18% / 0.55)`;
  const soil = `hsla(${(h+35)%360} 28% 18% / 0.35)`;

  const cn = String(cropName||"").toLowerCase();
  let fruitHue = 6;
  if (cn.includes("pepper")) fruitHue = 18;
  else if (cn.includes("eggplant") || cn.includes("aubergine")) fruitHue = 285;
  else if (cn.includes("strawberry")) fruitHue = 350;
  else if (cn.includes("corn")) fruitHue = 48;
  const fruit = `hsl(${fruitHue} 85% 55%)`;

  const v = variant % 3;
  const tilt = v===0 ? -14 : (v===1 ? 0 : 14);
  const flip = v===2 ? -1 : 1;

  if (stage === "seedling"){
    return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>
      <g transform='translate(16 16) rotate(${tilt}) scale(${flip} 1) translate(-16 -16)'>
        <path d='M16 28 C16 22 16 18 16 12' stroke='${outline}' stroke-width='2.2' stroke-linecap='round'/>
        <path d='M10 14 C7 12 6 9 8 7 C10 5 13 6 14 9 C15 12 13 15 10 14 Z' fill='${leaf1}' stroke='${outline}' stroke-width='1'/>
        <path d='M22 14 C25 12 26 9 24 7 C22 5 19 6 18 9 C17 12 19 15 22 14 Z' fill='${leaf2}' stroke='${outline}' stroke-width='1'/>
      </g>
    </svg>`;
  }

  if (stage === "leafy"){
    if (cat === "allium"){
      return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>
        <g transform='translate(16 16) rotate(${tilt}) translate(-16 -16)'>
          <path d='M10 28 C11 18 12 12 16 6' stroke='${leaf1}' stroke-width='2.2' stroke-linecap='round'/>
          <path d='M16 28 C16 18 16 12 16 5' stroke='${leaf2}' stroke-width='2.2' stroke-linecap='round'/>
          <path d='M22 28 C21 18 20 12 16 6' stroke='${leaf3}' stroke-width='2.2' stroke-linecap='round'/>
          <path d='M10 28 L22 28' stroke='${soil}' stroke-width='3.2' stroke-linecap='round'/>
        </g>
      </svg>`;
    }
    return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>
      <g transform='translate(16 16) rotate(${tilt}) scale(${flip} 1) translate(-16 -16)'>
        <path d='M16 29 C11 25 8 20 9 16 C10 12 13 10 16 12 C19 10 22 12 23 16 C24 20 21 25 16 29 Z' fill='${leaf1}' stroke='${outline}' stroke-width='1'/>
        <path d='M16 27 C12 24 11 20 12 17 C13 14 15 13 16 14 C17 13 19 14 20 17 C21 20 20 24 16 27 Z' fill='${leaf2}' opacity='0.95'/>
      </g>
    </svg>`;
  }

  if (cat === "root"){
    return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>
      <g transform='translate(16 16) rotate(${tilt}) translate(-16 -16)'>
        <circle cx='16' cy='22' r='6.8' fill='${soil}'/>
        <circle cx='16' cy='22' r='5.4' fill='${leaf3}' opacity='0.35'/>
        <path d='M16 22 C14 18 12 14 12 10' stroke='${leaf1}' stroke-width='2.2' stroke-linecap='round'/>
        <path d='M16 22 C16 18 16 14 16 9' stroke='${leaf2}' stroke-width='2.2' stroke-linecap='round'/>
        <path d='M16 22 C18 18 20 14 20 10' stroke='${leaf3}' stroke-width='2.2' stroke-linecap='round'/>
      </g>
    </svg>`;
  }

  if (cat === "fruiting"){
    return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>
      <g transform='translate(16 16) rotate(${tilt}) scale(${flip} 1) translate(-16 -16)'>
        <path d='M8 22 C8 15 12 10 16 10 C20 10 24 15 24 22 C22 25 19 27 16 27 C13 27 10 25 8 22 Z' fill='${leaf1}' stroke='${outline}' stroke-width='1'/>
        <path d='M12 20 C12 16 14 13 16 13 C18 13 20 16 20 20 C19 22 18 23 16 23 C14 23 13 22 12 20 Z' fill='${leaf2}' opacity='0.9'/>
        <circle cx='12.5' cy='22' r='1.6' fill='${fruit}'/>
        <circle cx='19.5' cy='21' r='1.6' fill='${fruit}' opacity='0.95'/>
        <circle cx='16' cy='24' r='1.6' fill='${fruit}' opacity='0.9'/>
      </g>
    </svg>`;
  }

  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>
    <g transform='translate(16 16) rotate(${tilt}) scale(${flip} 1) translate(-16 -16)'>
      <path d='M6 22 C6 15 11 9 16 9 C21 9 26 15 26 22 C24 26 20 28 16 28 C12 28 8 26 6 22 Z' fill='${leaf1}' stroke='${outline}' stroke-width='1'/>
      <path d='M10 20 C10 16 13 12 16 12 C19 12 22 16 22 20 C21 23 19 25 16 25 C13 25 11 23 10 20 Z' fill='${leaf2}' opacity='0.9'/>
    </g>
  </svg>`;
}
    const cap = (lod === "mid") ? 34 : 90;
    const sproutCount = Math.max(6, Math.min(total, cap));
    const density = Math.min(1, total / (bedSq || 1));
  
    layer.innerHTML = "";
    const margin = 0.06; // keep away from edges
    for (let s = 0; s < sproutCount; s++) {
      const crop = pickCrop();
      const sh = cropHue(crop);
      const spr = document.createElement("div");
      spr.className = "plant-sprout";
      spr.title = crop;
  
      const x = margin + rnd() * (1 - margin * 2);
      const y = margin + rnd() * (1 - margin * 2);
  
      // Stage mix by density (game-y: seedlings -> leafy -> mature canopy)
      const rStage = rnd();
      let stage = "seedling";
      if (density < 0.25) stage = (rStage < 0.85) ? "seedling" : "leafy";
      else if (density < 0.6) stage = (rStage < 0.50) ? "seedling" : (rStage < 0.90 ? "leafy" : "mature");
      else stage = (rStage < 0.20) ? "leafy" : "mature";

      const base = (lod === "mid") ? 8.5 : 11.0;
      const stageBoost = (stage === "seedling") ? 0.0 : (stage === "leafy" ? 4.0 : 8.0);
      const size = base + stageBoost + rnd() * ((stage === "mature") ? 4.5 : 3.2);

      spr.classList.add("stage-" + stage);

      spr.style.left = (x * 100).toFixed(2) + "%";
      spr.style.top  = (y * 100).toFixed(2) + "%";
      spr.style.width = size.toFixed(2) + "px";
      spr.style.height = size.toFixed(2) + "px";
      spr.style.borderRadius = (stage === "seedling") ? "6px" : "0px";

      const leaf = `hsl(${sh} 78% 60% / 0.95)`;
      const leaf2 = `hsl(${(sh + 10) % 360} 78% 55% / 0.90)`;
      const dark = `hsl(${sh} 55% 28% / 0.35)`;
      const stem = `hsl(${(sh + 60) % 360} 55% 40% / 0.55)`;

// Use SVG sprite images (actual icons) instead of gradient dots
const cat = cropCategory(crop);
const variant = (s + ((seed >>> 0) & 7)) % 3;
const svg = spriteSvg(cat, stage, variant, crop);
spr.style.backgroundImage = svgUrl(svg);

      spr.style.backgroundRepeat = "no-repeat";
      spr.style.backgroundSize = "contain";
      spr.style.boxShadow = `0 0 ${lod === "mid" ? "7px" : "10px"} hsl(${sh} 85% 65% / 0.22)`;
      layer.appendChild(spr);
    }
  }


  function getPathUnits(bedIndex) {
    // Per-bed walkway width in grid units
    const ft = propertyState?.beds?.[bedIndex]?.pathFt;
    const pathFt = (typeof ft === "number" && isFinite(ft)) ? ft : 0;
    if (pathFt <= 0) return 0;
    return Math.max(0, Math.round(pathFt / scale));
  }
  function rectForBed(b, x, y, extraPadUnits = 0) {
    const { wU, lU } = bedUnitsFor(b);
    return { x: x - extraPadUnits, y: y - extraPadUnits, w: wU + extraPadUnits * 2, h: lU + extraPadUnits * 2 };
  }
  function rectsOverlap(a, b) {
    // axis-aligned overlap in grid units
    return !(
      a.x + a.w <= b.x ||
      b.x + b.w <= a.x ||
      a.y + a.h <= b.y ||
      b.y + b.h <= a.y
    );
  }
  function wouldCollide(movingBedIndex, nx, ny) {
    const padA = getPathUnits(movingBedIndex);
    const movingRect = rectForBed(movingBedIndex, nx, ny, padA);
    for (let i = 0; i < bedCount; i++) {
      if (i === movingBedIndex) continue;
      const off = bedOffsets[i] || { x: 0, y: 0 };
      const padB = getPathUnits(i);
      // use the larger of the two walkway widths between the pair
      const pairPad = Math.max(padA, padB);
      const otherRect = rectForBed(i, off.x, off.y, pairPad);
      const testRect = rectForBed(movingBedIndex, nx, ny, pairPad);
      if (rectsOverlap(testRect, otherRect)) return true;
    }
    return false;
  }
  // Ensure propertyState exists
  ensurePropertyStateInPlace(bedCount, propertyState);

    // --- drag autosave + bounds guard (obstacles/beds) ---
    // Some drag handlers call these; keep them local so they can see cols/rows/scale.
    let __propAutosaveT = null;
    function autoSaveLayoutProperty(){
      try {
        if (__propAutosaveT) clearTimeout(__propAutosaveT);
        __propAutosaveT = setTimeout(() => { try { autoSave(); } catch(e){} }, 150);
      } catch(e){}
    }

    function ensureWithinBounds(){
      try {
        const colsMax = cols, rowsMax = rows;
        if (!propertyState) return;

        // Clamp bed offsets (optional)
        if (!PG_ALLOW_BEDS_OUT_OF_BOUNDS && Array.isArray(propertyState.bedOffsets)) {
          const bedWU = Math.max(1, Math.ceil(bedW / scale));
          const bedLU = Math.max(1, Math.ceil(bedL / scale));
          for (let i = 0; i < propertyState.bedOffsets.length; i++) {
            const off = propertyState.bedOffsets[i] || (propertyState.bedOffsets[i] = { x: 0, y: 0 });
            off.x = clamp(off.x, 0, Math.max(0, colsMax - bedWU));
            off.y = clamp(off.y, 0, Math.max(0, rowsMax - bedLU));
          }
        }

        // Clamp obstacles
        if (Array.isArray(propertyState.obstacles)) {
          for (const o of propertyState.obstacles) {
            if (!o || !o.offset) continue;
            const ow = Math.max(1, Math.ceil((o.wFt || 10) / scale));
            const ol = Math.max(1, Math.ceil((o.lFt || 10) / scale));
            o.offset.x = clamp(o.offset.x, 0, Math.max(0, colsMax - ow));
            o.offset.y = clamp(o.offset.y, 0, Math.max(0, rowsMax - ol));
          }
        }
      } catch(e){}
    }

  // ---- draw obstacles ----
  const obstacles = propertyState.obstacles || [];
  obstacles.forEach((o, oi) => {
    const ob = document.createElement("div");
    ob.className = "property-obstacle-block";
    ob.dataset.type = (o.kind || o.type || "other").toString().toLowerCase();
    const wU = Math.max(1, Math.round((o.wFt || 10) / scale));
    const lU = Math.max(1, Math.round((o.lFt || 10) / scale));

    // NEW: feet → cells for display only
    const displayPos = getDisplayCellPos(o, scale);
    let ox = displayPos.x;
    let oy = displayPos.y;

    const obMaxX = Math.max(0, cols - wU);
    const obMaxY = Math.max(0, rows - lU);
    ox = Math.min(obMaxX, Math.max(0, ox));
    oy = Math.min(obMaxY, Math.max(0, oy));

    ob.style.position = "absolute";
    ob.style.left = (ox * cellSize) + "px";
    ob.style.top  = (oy * cellSize) + "px";
    ob.style.width = (wU * cellSize) + "px";
    ob.style.height = (lU * cellSize) + "px";
    if ((wU * cellSize) < 70 || (lU * cellSize) < 36) ob.dataset.small = "1";
    ob.style.cursor = "grab";
    const rawName = (typeof o.name === "string") ? o.name : "Obstacle";
    const safeName = String(rawName).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    ob.innerHTML = `<span class="obstacle-label">${safeName}</span>`;
    ob.title = (rawName || "");
    // dblclick rotates fence by swapping footprint (5x1 -> 1x5)
    ob.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const type = (o.kind || o.type || "other").toString().toLowerCase();
      if (type !== "fence") return;
      ensurePropertyStateInPlace(bedCount, propertyState);
      const cur = propertyState.obstacles?.[oi];
      if (!cur) return;
      // swap ft dimensions (true rotate)
      const w = parseFloat(cur.wFt) || 1;
      const l = parseFloat(cur.lFt) || 1;
      cur.wFt = l;
      cur.lFt = w;
      // keep a rot flag too (optional, for future UI)
      cur.rot = cur.rot ? 0 : 1;
      // clamp inside bounds after swap
      const newWU = Math.max(1, Math.round((cur.wFt || 1) / scale));
      const newLU = Math.max(1, Math.round((cur.lFt || 1) / scale));
      const maxX2 = Math.max(0, cols - newWU);
      const maxY2 = Math.max(0, rows - newLU);
      const off = cur.offset || { x: 0, y: 0 };
      cur.offset = {
        x: Math.min(maxX2, Math.max(0, off.x || 0)),
        y: Math.min(maxY2, Math.max(0, off.y || 0))
      };
      // re-render to apply new size immediately
      renderPropertySketch(bedCount, bedW, bedL);
      if (typeof renderBedOffsetControls === "function") renderBedOffsetControls(bedCount);
      autoSave();
    });
    // drag obstacle
    ob.addEventListener("pointerdown", (ev) => {
          // Drag obstacle (robust to viewport scrolling / CSS scaling)
          ev.preventDefault();
          ev.stopPropagation();

          const cur = (propertyState.obstacles[oi] && propertyState.obstacles[oi].offset) ? propertyState.obstacles[oi].offset : { x: 0, y: 0 };
          const startPt = __pg_clientToCanvas(ev, canvas, viewport);
          const grabX = startPt.x - (cur.x * cellSize);
          const grabY = startPt.y - (cur.y * cellSize);

          let lastX = cur.x, lastY = cur.y;
          try { ob.setPointerCapture(ev.pointerId); } catch (e) {}

          const onMove = (e) => {
            if (e.pointerId !== ev.pointerId) return;
            const pt = __pg_clientToCanvas(e, canvas, viewport);

            let nx = Math.round((pt.x - grabX) / cellSize);
            let ny = Math.round((pt.y - grabY) / cellSize);

            nx = snapTo(nx, snap);
            ny = snapTo(ny, snap);

            nx = clamp(nx, 0, Math.max(0, cols - wU));
            ny = clamp(ny, 0, Math.max(0, rows - lU));

            if (nx === lastX && ny === lastY) return;
            lastX = nx; lastY = ny;

            propertyState.obstacles[oi].offset = { x: nx, y: ny };
            ob.style.left = (nx * cellSize) + "px";
            ob.style.top  = (ny * cellSize) + "px";

            autoSaveLayoutProperty();
          };

          const onUp = (e) => {
            if (e.pointerId !== ev.pointerId) return;
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
            try { ob.releasePointerCapture(ev.pointerId); } catch (e2) {}
            ensureWithinBounds();
            // Save in absolute feet (preserves position across dimension/scale changes)
            try {
              const fin = (propertyState.obstacles && propertyState.obstacles[oi] && propertyState.obstacles[oi].offset) ? propertyState.obstacles[oi].offset : { x: lastX, y: lastY };
              propertyState.obstacles[oi].offsetFt = { x: (fin.x || 0) * scale, y: (fin.y || 0) * scale };
            } catch (e3) {}

            autoSaveLayoutProperty();
          };

          window.addEventListener("pointermove", onMove, { passive: false });
          window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
        });
canvas.appendChild(ob);
  });
  // ---- selection helpers ----
  function applySelectionUI() {
    const nodes = canvas.querySelectorAll(".property-bed-block");
    nodes.forEach((n) => {
      const i = parseInt(n.dataset.bedIndex || "-1", 10);
      n.classList.toggle("selected", i === selectedBedIndex);
    });
  }
  function setSelectedBed(idx) {
    if (typeof idx !== "number" || idx < 0 || idx >= bedCount) {
      selectedBedIndex = null;
    } else {
      selectedBedIndex = idx;
    }
    // Mirror selection to stable id for external handlers
    try { syncSelectedBedId(); } catch (e) {}
    try { updateSelectedBedUI(); } catch (e) {}
    applySelectionUI();
    // If you have an offset control renderer, it can use selectedBedIndex later
    if (typeof renderBedOffsetControls === "function") {
      renderBedOffsetControls(bedCount);
    }
    try { if (typeof renderSelectedBedGrid === "function") renderSelectedBedGrid(selectedBedIndex); } catch (e) {}
  }
  function createResizeHandle() {
    const h = document.createElement("div");
    h.className = "property-resize-handle";
    return h;
  }
  // Click empty land opens the toolbar (bind once)
// Clicking the grid background should DESELECT any bed (no highlight), but keep the toolbar open
// so the user can add/edit without needing an existing bed.
if (!canvas._pgSelectionBound) {
  canvas._pgSelectionBound = true;
  canvas.addEventListener("pointerdown", (e) => {
    if (e.target === canvas) {
      // Clear selection highlight, but keep the editor panel visible.
      selectedBedIndex = null;
      selectedBedId = null;
      applySelectionUI();
      try { updateSelectedBedUI(); } catch (e) {}
      if (typeof renderBedOffsetControls === "function") {
        renderBedOffsetControls(bedCount);
      } else {
        renderPropertySelectedBedPanel(bedCount);
      }
      try {
        if (typeof renderSelectedBedGrid === "function") renderSelectedBedGrid(null);
      } catch (err) {}
    }
  });
}
  // ---- draw beds ----
  for (let b = 0; b < bedCount; b++) {
    const bedBlock = document.createElement("div");
    bedBlock.className = "property-bed-block";
    bedBlock.dataset.bedIndex = String(b);
    bedBlock.dataset.type = (propertyState?.beds?.[b]?.type || "raised");
    const { wU, lU } = bedUnitsFor(b);

    // NEW: Use absolute feet → convert to cells for display only (no mutation)
    const displayPos = getDisplayCellPos(propertyState.beds[b], scale);
    let dx = displayPos.x;
    let dy = displayPos.y;

    // Soft visual clamp only — never changes stored position
    // NOTE: When PG_ALLOW_BEDS_OUT_OF_BOUNDS is true, do NOT clamp; allow beds to extend beyond bounds.
    if (!PG_ALLOW_BEDS_OUT_OF_BOUNDS) {
      const bedMaxX = Math.max(0, cols - wU);
      const bedMaxY = Math.max(0, rows - lU);
      dx = Math.min(bedMaxX, Math.max(0, dx));
      dy = Math.min(bedMaxY, Math.max(0, dy));
    }

    bedBlock.style.position = "absolute";
    bedBlock.style.left = (dx * cellSize) + "px";
    bedBlock.style.top  = (dy * cellSize) + "px";
    bedBlock.style.width = (wU * cellSize) + "px";
    bedBlock.style.height = (lU * cellSize) + "px";
    if ((wU * cellSize) < 70 || (lU * cellSize) < 36) bedBlock.dataset.small = "1";
    const label = propertyState?.beds?.[b]?.name || `Bed ${b + 1}`;
    bedBlock.innerHTML = `<span class="bed-label">${escapeHtml(label)}</span>`;
    bedBlock.title = label;
    applyRowsVisual(b, bedBlock, wU * cellSize, lU * cellSize);
    applyPlantsVisual(b, bedBlock, wU * cellSize, lU * cellSize);
    // Apply selected styling if this is the current selected bed
    if (b === selectedBedIndex) bedBlock.classList.add("selected");
    // Hover updates the right-side planting squares panel (does not overwrite bed content)
    bedBlock.addEventListener("pointerenter", () => {
      hoveredBedIndex = b;
      try { if (typeof renderSelectedBedGrid === "function") renderSelectedBedGrid(b); } catch (e) {}
    });
    bedBlock.addEventListener("pointerleave", () => {
      if (hoveredBedIndex === b) hoveredBedIndex = null;
      try {
        const backTo = (typeof selectedBedIndex === "number" && selectedBedIndex != null) ? selectedBedIndex : 0;
        if (typeof renderSelectedBedGrid === "function") renderSelectedBedGrid(backTo);
      } catch (e) {}
    });
    // Tap selects (prevents "select on drag" glitches on mobile)
    bedBlock.addEventListener("pointerdown", (ev) => {
      try {
        bedBlock._pgTap = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, moved: false };
      } catch(e) {}
    });
    bedBlock.addEventListener("pointermove", (ev) => {
      const t = bedBlock._pgTap;
      if (!t || ev.pointerId !== t.id) return;
      const dx = Math.abs(ev.clientX - t.x);
      const dy = Math.abs(ev.clientY - t.y);
      if (dx + dy > 10) t.moved = true;
    });
    bedBlock.addEventListener("pointerup", (ev) => {
      const t = bedBlock._pgTap;
      if (!t || ev.pointerId !== t.id) return;
      bedBlock._pgTap = null;
      if (!t.moved) setSelectedBed(b);
    });bedBlock.ondblclick = (e) => {
      e.preventDefault();
      bedRot[b] = bedRot[b] ? 0 : 1;

      // Sync canonical state BEFORE clamping so bedUnitsFor uses the new rotation reliably
      ensurePropertyStateInPlace(bedCount, propertyState);
      if (propertyState?.beds?.[b]) propertyState.beds[b].rot = bedRot[b] ? 1 : 0;

      // clamp after rotation so it stays in bounds (optional)
      const cur = bedOffsets[b] || { x: 0, y: 0 };
      if (!PG_ALLOW_BEDS_OUT_OF_BOUNDS) {
        const { wU, lU } = bedUnitsFor(b);
        const maxX = Math.max(0, cols - wU);
        const maxY = Math.max(0, rows - lU);
        bedOffsets[b] = {
          x: Math.min(maxX, Math.max(0, cur.x)),
          y: Math.min(maxY, Math.max(0, cur.y))
        };
      } else {
        bedOffsets[b] = { x: cur.x, y: cur.y };
      }

      // keep offsets in canonical bed object
      ensurePropertyStateInPlace(bedCount, propertyState);
      if (propertyState?.beds?.[b]) propertyState.beds[b].offset = bedOffsets[b];

      // Re-render everything (keeps your existing flow)
      renderPropertySketch(bedCount, bedW, bedL);
      if (typeof renderBedOffsetControls === "function") renderBedOffsetControls(bedCount);

      // Persist on mutation (rotate)
      autoSave();
    };
    // ---- drag ----
    // ---- Bed drag ----
    bedBlock.addEventListener("pointerdown", (ev) => {
      // Robust drag: stays under cursor even if viewport scrolls, and works with any CSS scaling.
      ev.preventDefault();
      bedBlock.style.cursor = "grabbing";

      const cur = bedOffsets[b] || { x: 0, y: 0 };
      const { wU: dragWU, lU: dragLU } = bedUnitsFor(b);

      // Logical grid clamp (property units)
      const maxX = Math.max(0, cols - dragWU);
      const maxY = Math.max(0, rows - dragLU);

      const startPt = __pg_clientToCanvas(ev, canvas, viewport);
      const grabX = startPt.x - (cur.x * cellSize);
      const grabY = startPt.y - (cur.y * cellSize);

      let lastX = cur.x, lastY = cur.y;
      try { bedBlock.setPointerCapture(ev.pointerId); } catch (e) {}

      const onMove = (e) => {
        if (e.pointerId !== ev.pointerId) return;

        const pt = __pg_clientToCanvas(e, canvas, viewport);
        let nx = Math.round((pt.x - grabX) / cellSize);
        let ny = Math.round((pt.y - grabY) / cellSize);

        // snap
        nx = snapTo(nx, snapUnits);
        ny = snapTo(ny, snapUnits);

        // clamp (optional)
        if (!PG_ALLOW_BEDS_OUT_OF_BOUNDS) {
          nx = Math.min(maxX, Math.max(0, nx));
          ny = Math.min(maxY, Math.max(0, ny));
        }

        if (nx === lastX && ny === lastY) return;

        // HARD BLOCK: if collision, don't move
        if (wouldCollide(b, nx, ny)) return;

        lastX = nx; lastY = ny;
        bedOffsets[b] = { x: nx, y: ny };

        // live update
        bedBlock.style.left = (nx * cellSize) + "px";
        bedBlock.style.top  = (ny * cellSize) + "px";
      };

      const onUp = (e) => {
        if (e && e.pointerId && e.pointerId !== ev.pointerId) return;

        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        bedBlock.style.cursor = "grab";
        try { bedBlock.releasePointerCapture(ev.pointerId); } catch (e2) {}

        // keep X/Y inputs synced
        if (typeof renderBedOffsetControls === "function") {
          renderBedOffsetControls(bedCount);
        }

        // Save in absolute feet (preserves position across dimension/scale changes)
        ensurePropertyStateInPlace(bedCount, propertyState);
        propertyState.beds[b].offsetFt = {
          x: lastX * scale,
          y: lastY * scale
        };

        // Keep legacy array in sync for any old code
        bedOffsets[b] = { x: lastX, y: lastY };
        propertyState.beds[b].offset = bedOffsets[b];
        propertyState.beds[b].rot = bedRot?.[b] ? 1 : 0;

        autoSave();
      };

      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });

    // --- resize handle (only show on selected bed) ---
    if (b === selectedBedIndex) {
      const handle = createResizeHandle();
      bedBlock.appendChild(handle);
      handle.addEventListener("pointerdown", (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        const startX = ev.clientX;
        const startY = ev.clientY;
        // start dims in feet (fallback to global)
        ensurePropertyStateInPlace(bedCount, propertyState);
        const bedObj = propertyState.beds[b] || {};
        const lockedType = (bedObj && typeof bedObj.type === "string" && bedObj.type) ? bedObj.type : "raised";
        const startWFt = (typeof bedObj.wFt === "number" && bedObj.wFt > 0) ? bedObj.wFt : bedW;
        const startLFt = (typeof bedObj.lFt === "number" && bedObj.lFt > 0) ? bedObj.lFt : bedL;
        // how many ft per pixel?
        const ftPerPx = scale / (cellSize * __pgCanvasScale);
        const onMove = (e) => {
          const dxPx = e.clientX - startX;
          const dyPx = e.clientY - startY;
          // Convert drag to ft change (snap by scale units if you want)
          let nextWFt = startWFt + (dxPx * ftPerPx);
          let nextLFt = startLFt + (dyPx * ftPerPx);
          // Minimum size
          nextWFt = Math.max(scale, nextWFt);
          nextLFt = Math.max(scale, nextLFt);
          // Snap to nearest 0.5 ft (adjust if you want coarser)
          const snapFt = 0.5;
          nextWFt = Math.round(nextWFt / snapFt) * snapFt;
          nextLFt = Math.round(nextLFt / snapFt) * snapFt;
          // Apply tentatively
          propertyState.beds[b].type = lockedType;
          propertyState.beds[b].wFt = nextWFt;
          propertyState.beds[b].lFt = nextLFt;
          // Recompute footprint and clamp within bounds (optional)
          const { wU, lU } = bedUnitsFor(b);
          const cur = bedOffsets[b] || { x: 0, y: 0 };
          let nx = cur.x;
          let ny = cur.y;
          if (!PG_ALLOW_BEDS_OUT_OF_BOUNDS) {
            const maxX = Math.max(0, cols - wU);
            const maxY = Math.max(0, rows - lU);
            nx = Math.min(maxX, Math.max(0, cur.x));
            ny = Math.min(maxY, Math.max(0, cur.y));
          }
          // Collision block: if the resized bed would collide, revert and do nothing
          if (typeof wouldCollide === "function" && wouldCollide(b, nx, ny)) {
            propertyState.beds[b].wFt = startWFt;
            propertyState.beds[b].lFt = startLFt;
            return;
          }
          // keep offsets clamped
          bedOffsets[b] = { x: nx, y: ny };
          propertyState.beds[b].offset = bedOffsets[b];
          // re-render for accurate box size
          renderPropertySketch(bedCount, bedW, bedL);
          if (typeof renderBedOffsetControls === "function") renderBedOffsetControls(bedCount);
          if (typeof renderPropertySelectedBedPanel === "function") renderPropertySelectedBedPanel(bedCount);
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
          // Persist
          propertyState.beds[b].type = lockedType;
          propertyState.beds[b].rot = bedRot?.[b] ? 1 : 0;
          autoSave();
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      });
    }
    canvas.appendChild(bedBlock);
  }
  // Final pass to ensure selection UI is consistent after rebuild
  applySelectionUI();
}

// ───────────────────────────────────────────────────────────────
// My Garden plan helpers
//
// IMPORTANT CHANGE (Jan 2026): Layout tab must NOT bind its rendering to a
// global "current plan" selection. Plans are selected per-bed only.
// These helpers provide safe access to plans for bed-level population.
// ───────────────────────────────────────────────────────────────

function getMyGardenPlansList() {
  // NOTE: Different builds of PG have used different in-memory shapes for plan storage.
  // The Layout tab only needs a read-only list of My Garden plans with {id,name,entries}.
  // We therefore probe a few likely globals and then fall back to localStorage.
  const fromGlobals = () => {
    // Common: gardenPlans.plans
    if (window.gardenPlans && Array.isArray(window.gardenPlans.plans)) return window.gardenPlans.plans;

    // Sometimes nested by tab: gardenPlans.mygarden.plans
    const maybe = window.gardenPlans?.mygarden;
    if (maybe && Array.isArray(maybe.plans)) return maybe.plans;

    // Other common names
    if (Array.isArray(window.myGardenPlans)) return window.myGardenPlans;
    if (Array.isArray(window.mygardenPlans)) return window.mygardenPlans;
    if (Array.isArray(window.my_garden_plans)) return window.my_garden_plans;

    // Generic plan store patterns
    const tabPlans = window.plansByTab?.mygarden || window.plansByTab?.["My Garden"];
    if (Array.isArray(tabPlans)) return tabPlans;

    const store = window.planStore || window.plansStore || window.plansState;
    const storePlans = store?.mygarden?.plans || store?.mygardenPlans || store?.plans?.mygarden;
    if (Array.isArray(storePlans)) return storePlans;

    // If your app exposes a getter, prefer it (defensive call signatures)
    if (typeof window.getPlans === "function") {
      try {
        const got = window.getPlans("mygarden");
        if (Array.isArray(got)) return got;
        if (got && Array.isArray(got.plans)) return got.plans;
      } catch (e) {}
    }
    if (typeof window.getAllPlans === "function") {
      try {
        const got = window.getAllPlans();
        const mg = got?.mygarden || got?.["mygarden"] || got?.["My Garden"];
        if (Array.isArray(mg)) return mg;
        if (mg && Array.isArray(mg.plans)) return mg.plans;
      } catch (e) {}
    }
    return null;
  };

  const normalizePlans = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((p) => {
        if (!p) return null;
        const id = p.id ?? p.planId ?? p.planID ?? p.key ?? p.uuid ?? null;
        const name = p.name ?? p.title ?? p.label ?? (id ? String(id) : "Plan");
        // entries may be stored as entries/items/crops/etc
        const entries =
          Array.isArray(p.entries) ? p.entries :
          Array.isArray(p.items) ? p.items :
          Array.isArray(p.crops) ? p.crops :
          Array.isArray(p.plants) ? p.plants :
          [];
        return { ...p, id, name, entries };
      })
      .filter(Boolean)
      .filter(p => p.id != null);
  };

  // Prefer localStorage as the source of truth so newly-created plans appear immediately
  // (some builds keep window.gardenPlans stale until refresh).
  const g = fromGlobals();
  const normG = normalizePlans(g);
  const normLS = readMyGardenPlansFromLocalStorage();

  if (normLS.length) {
    if (!normG.length) return normLS;
    // Merge by id, preferring localStorage for collisions
    const map = new Map();
    normG.forEach(p => map.set(String(p.id), p));
    normLS.forEach(p => map.set(String(p.id), p));
    return Array.from(map.values());
  }
  return normG;
}

// Cache localStorage probing so we don't parse repeatedly on every render
let _pgMyGardenPlansCache = { at: 0, plans: [] };

function readMyGardenPlansFromLocalStorage() {
  const now = Date.now();
  if (_pgMyGardenPlansCache && (now - _pgMyGardenPlansCache.at) < 1500) {
    return _pgMyGardenPlansCache.plans || [];
  }

  const tryParse = (raw) => {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  };

  const normalizePlans = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((p) => {
        if (!p) return null;
        const id = p.id ?? p.planId ?? p.planID ?? p.key ?? p.uuid ?? null;
        const name = p.name ?? p.title ?? p.label ?? (id ? String(id) : "Plan");
        const entries =
          Array.isArray(p.entries) ? p.entries :
          Array.isArray(p.items) ? p.items :
          Array.isArray(p.crops) ? p.crops :
          Array.isArray(p.plants) ? p.plants :
          [];
        return { ...p, id, name, entries };
      })
      .filter(Boolean)
      .filter(p => p.id != null);
  };

  const candidates = [
    "gardenPlans", "gardenPlans_v1", "gardenPlans_v2", "pg_gardenPlans",
    "myGardenPlans", "myGardenPlans_v1", "pg_myGardenPlans",
    "mygardenPlans", "pg_mygarden_plans", "pg_mygarden_plans_v1",
    "pg_plans_mygarden", "pg_plans", "pg_planStore"
  ];

  let found = [];

  // First, try common exact keys
  for (const k of candidates) {
    const parsed = tryParse(localStorage.getItem(k));
    if (!parsed) continue;

    // Shapes: {plans:[...]}, {mygarden:{plans:[...]}}, {mygarden:[...]} or direct [...]
    if (Array.isArray(parsed)) found = normalizePlans(parsed);
    else if (Array.isArray(parsed.plans)) found = normalizePlans(parsed.plans);
    else if (Array.isArray(parsed.mygarden)) found = normalizePlans(parsed.mygarden);
    else if (Array.isArray(parsed["My Garden"])) found = normalizePlans(parsed["My Garden"]);
    else if (parsed.mygarden && Array.isArray(parsed.mygarden.plans)) found = normalizePlans(parsed.mygarden.plans);

    if (found.length) break;
  }

  // If still empty, do a light scan of keys
  if (!found.length) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        const lk = k.toLowerCase();
        if (!(lk.includes("plan") && (lk.includes("garden") || lk.includes("mygarden")))) continue;
        const parsed = tryParse(localStorage.getItem(k));
        if (!parsed) continue;

        let cand = [];
        if (Array.isArray(parsed)) cand = normalizePlans(parsed);
        else if (Array.isArray(parsed.plans)) cand = normalizePlans(parsed.plans);
        else if (parsed.mygarden && Array.isArray(parsed.mygarden.plans)) cand = normalizePlans(parsed.mygarden.plans);
        else if (Array.isArray(parsed.mygarden)) cand = normalizePlans(parsed.mygarden);

        if (cand.length) { found = cand; break; }
      }
    } catch (e) {}
  }

  _pgMyGardenPlansCache = { at: now, plans: found || [] };
  return _pgMyGardenPlansCache.plans;
}

let _pgMyGardenPlansWatchTimer = null;
let _pgMyGardenPlansWatchTries = 0;

function scheduleMyGardenPlansRefresh() {
  // Coalesce multiple calls
  if (_pgMyGardenPlansWatchTimer) return;
  _pgMyGardenPlansWatchTimer = setTimeout(() => {
    _pgMyGardenPlansWatchTimer = null;
    try {
      const bc = (lastLayout?.bedCount != null) ? lastLayout.bedCount : (readBedDimsFromInputs()?.bedCount || 0);
      if (typeof renderBedOffsetControls === "function") {
        if (bc > 0) renderBedOffsetControls(bc);
        else { try { renderBedOffsetControls(0); } catch(e){} }
      }
      // Keep right-side panel in sync
      try { if (typeof renderSelectedBedGrid === "function" && bc > 0 && selectedBedIndex != null) renderSelectedBedGrid(selectedBedIndex); } catch (e) {}
    } catch (e) {}
  }, 350);
}

function watchForMyGardenPlansReady() {
  // If plans are loaded after Layout init, refresh the bed plan dropdown once.
  if (_pgMyGardenPlansWatchTimer) return;
  _pgMyGardenPlansWatchTries = 0;

  const tick = () => {
    _pgMyGardenPlansWatchTries++;
    const plans = getMyGardenPlansList();
    if (plans && plans.length) {
      scheduleMyGardenPlansRefresh();
      return;
    }
    if (_pgMyGardenPlansWatchTries < 30) {
      _pgMyGardenPlansWatchTimer = setTimeout(() => {
        _pgMyGardenPlansWatchTimer = null;
        tick();
      }, 250);
    }
  };

  tick();
}
function getDefaultMyGardenPlanId() {
  // Prefer explicit currentPlanId storage if present
  const id = window.currentPlanId?.mygarden || window.gardenPlans?.currentMyGarden || null;
  return id;
}
function getPrimaryMyGardenPlanId() {
  // The "stock" / primary plan is typically "Main Garden".
  const plans = getMyGardenPlansList() || [];
  const pickId = (p) => (p && (p.id ?? p.planId ?? "")) + "";
  const pickName = (p) => (p && (p.name ?? p.title ?? "")) + "";

  // 1) Find by name/title "Main Garden"
  for (const p of plans) {
    const nm = pickName(p).trim();
    if (nm && /^main\s*garden$/i.test(nm)) return pickId(p) || null;
  }

  // 2) Find by id-ish hint
  for (const p of plans) {
    const pid = pickId(p).trim();
    if (pid && /main\s*garden/i.test(pid.replace(/[_-]/g, " "))) return pid;
  }

  // 3) Fall back to whatever your app says is current default, else first plan
  return getDefaultMyGardenPlanId() || (plans[0] ? pickId(plans[0]) : null) || null;
}

function getMyGardenPlanById(planId) {
  if (!planId) return null;
  const plans = getMyGardenPlansList();
  for (const p of plans) {
    if (!p) continue;
    if (p.id === planId || p.planId === planId) return p;
  }
  return null;
}

// Choose the next My Garden plan that is not currently assigned to any bed (by planId).
// Used to auto-advance the plan dropdown when adding beds, preventing accidental duplicates.
function getNextUnusedMyGardenPlanId(excludeBedIndex) {
  const plans = getMyGardenPlansList();
  if (!Array.isArray(plans) || plans.length === 0) return (getDefaultMyGardenPlanId() || null);

  const used = new Set();
  const bedArr = Array.isArray(propertyState?.beds) ? propertyState.beds : (Array.isArray(beds) ? beds : []);
  for (let i = 0; i < bedArr.length; i++) {
    if (typeof excludeBedIndex === "number" && i === excludeBedIndex) continue;
    const b = bedArr[i];
    const pid = b && (b.planId || b.planID || b.plan);
    if (pid) used.add(String(pid));
  }

  for (const p of plans) {
    const pid = p?.id ?? p?.planId ?? "";
    if (!pid) continue;
    if (!used.has(String(pid))) return String(pid);
  }

  // All plans are already used; fall back gracefully.
  return String(getDefaultMyGardenPlanId() || (plans[0]?.id ?? plans[0]?.planId ?? "") || "");
}

// Return the most recently assigned bed planId (walks from the end).
function getLastAssignedBedPlanId() {
  try {
    const bedArr = Array.isArray(propertyState?.beds) ? propertyState.beds : (Array.isArray(beds) ? beds : []);
    for (let i = bedArr.length - 1; i >= 0; i--) {
      const b = bedArr[i];
      const pid = b && (b.planId || b.planID || b.plan);
      if (pid) return String(pid);
    }
  } catch (e) {}
  return null;
}

// Choose the next unused My Garden plan AFTER the given anchor plan (wraps around).
// If anchor is null/unknown, starts from the top of the list.
function getNextUnusedMyGardenPlanIdAfter(anchorPlanId, excludeBedIndex) {
  const plans = getMyGardenPlansList();
  if (!Array.isArray(plans) || plans.length === 0) return (getDefaultMyGardenPlanId() || null);

  const used = new Set();
  try {
    const bedArr = Array.isArray(propertyState?.beds) ? propertyState.beds : (Array.isArray(beds) ? beds : []);
    for (let i = 0; i < bedArr.length; i++) {
      if (typeof excludeBedIndex === "number" && i === excludeBedIndex) continue;
      const b = bedArr[i];
      const pid = b && (b.planId || b.planID || b.plan);
      if (pid) used.add(String(pid));
    }
  } catch (e) {}

  const ids = plans
    .map(p => String(p?.id ?? p?.planId ?? ""))
    .filter(Boolean);

  if (ids.length === 0) return null;

  const anchor = anchorPlanId ? String(anchorPlanId) : "";
  let startIdx = 0;
  if (anchor) {
    const ai = ids.indexOf(anchor);
    if (ai >= 0) startIdx = (ai + 1) % ids.length;
  }

  for (let k = 0; k < ids.length; k++) {
    const pid = ids[(startIdx + k) % ids.length];
    if (!used.has(pid)) return pid;
  }

  // All plans are already used; fall back gracefully.
  return anchor || ids[0] || (getDefaultMyGardenPlanId() || null);
}


// Safely get entries for a specific My Garden plan id.
function getMyGardenEntriesForPlanId(planId) {
  if (!planId) return [];
  // If you have a project helper, prefer it (defensive signatures).
  if (typeof window.getPlanById === "function") {
    try {
      // Some builds: getPlanById(id)
      let p = window.getPlanById(planId);
      // Others: getPlanById(tab, id) or getPlanById(id, tab)
      if (!p) {
        try { p = window.getPlanById("mygarden", planId); } catch (e) {}
      }
      if (!p) {
        try { p = window.getPlanById(planId, "mygarden"); } catch (e) {}
      }
      if (p) {
        if (Array.isArray(p.entries)) return p.entries;
        if (Array.isArray(p.items)) return p.items;
        if (Array.isArray(p.crops)) return p.crops;
        if (Array.isArray(p.plants)) return p.plants;
      }
    } catch (e) {}
  }

  const p = getMyGardenPlanById(planId);
  if (p) {
    if (Array.isArray(p.entries)) return p.entries;
    if (Array.isArray(p.items)) return p.items;
    if (Array.isArray(p.crops)) return p.crops;
    if (Array.isArray(p.plants)) return p.plants;
  }
  return [];
}

// Back-compat: returns *current* plan entries. Do NOT use this for Layout rendering.
function getMyGardenEntries() {
  const currentId = getDefaultMyGardenPlanId();
  if (currentId) return getMyGardenEntriesForPlanId(currentId);
  // Preferred: your existing function
  if (typeof window.getCurrentPlan === "function") {
    const plan = window.getCurrentPlan("mygarden");
    if (plan && Array.isArray(plan.entries)) return plan.entries;
  }
  return [];
}

function getMyGardenPlanNameById(planId) {
  const p = getMyGardenPlanById(planId);
  return (p && p.name) ? p.name : "My Garden plan";
}

function getCurrentMyGardenPlanName() {
  const id = getDefaultMyGardenPlanId();
  return id ? getMyGardenPlanNameById(id) : "My Garden plan";
}

function isCurrentMyGardenPlanEmpty() {
  const entries = getMyGardenEntries();
  return !entries || entries.length === 0;
}

function updateLayoutPlanActionAvailability() {
  // IMPORTANT CHANGE (Jan 2026): Layout tab is no longer driven by a global plan context.
  // Buttons should remain available; plan emptiness is handled at the time of population.
  const ids = ["layoutAddBedBtn", "propAddBedBtn", "assignPlanToBedBtn", "propPopulateBedBtn"];
  ids.forEach((id) => {
    const el = byId(id);
    if (!el) return;
    el.disabled = false;
    el.title = "";
  });
}


function refreshBedPlanSelectOptions(selectEl, selectedId) {
  if (!selectEl) return;
  const plans = getMyGardenPlansList() || [];
  const cur = selectedId != null ? String(selectedId) : "";
  const prev = (selectEl.value != null) ? String(selectEl.value) : "";

  // Rebuild options
  selectEl.innerHTML = "";

  const optNone = document.createElement("option");
  optNone.value = "";
  optNone.textContent = "(Select a My Garden plan)";
  selectEl.appendChild(optNone);

  plans.forEach(p => {
    const o = document.createElement("option");
    o.value = String(p.id);
    o.textContent = p.name || String(p.id);
    selectEl.appendChild(o);
  });

  // Restore selection (prefer explicit id, else previous)
  const toSet = (cur || prev || "").toString();
  if (toSet) {
    selectEl.value = toSet;
    // If the plan id isn't in the rebuilt list (stale cache, timing),
    // inject a temporary option so the UI doesn't fall back to the first plan.
    if (String(selectEl.value) !== toSet) {
      const missing = document.createElement("option");
      missing.value = toSet;
      const display = (typeof getMyGardenPlanNameById === "function")
        ? (getMyGardenPlanNameById(toSet) || toSet)
        : toSet;
      missing.textContent = display;
      // Insert right after the "(Select...)" option
      selectEl.insertBefore(missing, selectEl.children[1] || null);
      selectEl.value = toSet;
    }
  } else {
    selectEl.value = "";
  }
}
function getBedPlanId(bedIndex) {
  try {
    const id = propertyState?.beds?.[bedIndex]?.planId;
    return id || getDefaultMyGardenPlanId() || null;
  } catch (e) {
    return getDefaultMyGardenPlanId() || null;
  }
}


function isPlanIdUsedOnOtherBed(planId, excludeBedIndex) {
  if (!planId) return false;
  const pid = String(planId);
  try {
    const list = Array.isArray(propertyState?.beds) ? propertyState.beds : [];
    for (let i = 0; i < list.length; i++) {
      if (i === excludeBedIndex) continue;
      const otherPid = list[i]?.planId;
      if (otherPid && String(otherPid) === pid) return true;
    }
  } catch (e) {}
  // Fallback: check overlay/state `beds` array if present
  try {
    if (Array.isArray(beds)) {
      return beds.some((b, i) => i !== excludeBedIndex && b?.plan && String(b.plan) === pid);
    }
  } catch (e) {}
  return false;
}

function setBedPlanId(bedIndex, planId) {
  if (bedIndex == null) return;
  const currentCount = propertyState?.beds?.length ?? 0;
  if (bedIndex < 0 || bedIndex >= currentCount) return;
  const bed = propertyState?.beds?.[bedIndex];
  if (!bed) return;
  bed.planId = planId || null;
  bed.planName = planId ? getMyGardenPlanNameById(planId) : null;
}


function findBedPopulatedByPlan(planId, exceptIndex) {
  const pid = (planId || "").toString().trim();
  if (!pid) return -1;
  const beds = propertyState?.beds || [];
  for (let i = 0; i < beds.length; i++) {
    if (exceptIndex != null && i === exceptIndex) continue;
    const b = beds[i] || {};
    const used = (b.populatedPlanId || b.populatedFromPlanId || "").toString().trim();
    if (used && used === pid) return i;
  }
  return -1;
}


function populateBedFromPlan(bedIndex, planId, opts = {}) {
  const { silent = false } = opts || {};
  const pid = planId || getBedPlanId(bedIndex);
  if (!pid) {
    if (!silent) alert("No plan selected. Pick a My Garden plan for this bed first.");
    return false;
  }
  // Enforce: a My Garden plan may populate only one bed
  const usedBy = findBedPopulatedByPlan(pid, bedIndex);
  if (usedBy >= 0) {
    if (!silent) alert(`That plan has already been used to populate Bed ${usedBy + 1}. Each My Garden plan can only populate one bed.`);
    return false;
  }
  const entries = getMyGardenEntriesForPlanId(pid);
  if (!entries || entries.length === 0) {
    if (!silent) alert("That plan has no crops yet. Add crops on the My Garden tab, then try again.");
    return false;
  }
  // Monetization gate: Free = max 3 crops per bed (enforced by plan entries count)
  try {
    if (typeof window.pgLimit === "function") {
      const max = window.pgLimit("maxCropsPerBed");
      if (Number.isFinite(max) && entries.length > max) {
        if (!silent) alert(`Free version allows up to ${max} crops per bed. Pro removes this limit (store version).`);
        return false;
      }
    }
  } catch (e) {}

  if (!lastLayout || !editableState || !Array.isArray(editableState.used)) {
    if (!silent) alert("Build a layout first (bed dimensions and count), then populate beds.");
    return false;
  }
  const bedSq = lastLayout?.bedSq || (lastLayout?.w && lastLayout?.l ? Math.round(lastLayout.w * lastLayout.l) : 0);
  if (!bedSq) return false;
  const { start, end } = getBedSliceRange(bedIndex, bedSq);

  // Write crops into this bed slice (do not touch other beds).
  for (let i = start; i < end; i++) editableState.used[i] = "";
  entries.forEach((entry, i) => {
    const crop = entryCropName(entry);
    const idx = start + i;
    if (crop && idx < end) editableState.used[idx] = crop;
  });

  // Persist plan metadata on the bed
  setBedPlanId(bedIndex, pid);
  try {
    if (propertyState?.beds?.[bedIndex]) {
      propertyState.beds[bedIndex].populatedPlanId = pid;
      // Back-compat alias
      propertyState.beds[bedIndex].populatedFromPlanId = pid;
    }
  } catch (e) {}

  // Re-render UI and optionally autosave
  try { if (window.Layout && typeof window.Layout.render === "function") window.Layout.render(); } catch (e) {}
  try { if (typeof renderSelectedBedGrid === "function") renderSelectedBedGrid(bedIndex); } catch (e) {}
  autoSave();
  try { saveBeds(); } catch(e) {}
  try { autoFitProperty(); } catch(e) {}
  try { pgScheduleRender({ fit: true }); } catch(e) { try { schedule(); } catch(_) {} }
  return true;
}

// Create a new bed and (optionally) populate it from a chosen plan.
// Default behavior: uses the plan selector in the bed editor if present, otherwise the current My Garden plan.
function addBedFromCurrentPlan(planId) {
  // IMPORTANT: Adding a bed should NOT require a plan and should never trigger global resets.
  // Plan selection is optional here; population is explicit via "Populate Bed".
  const dims = readBedDimsFromInputs();
  // Monetization gate: Free = 1 bed
  try {
    if (typeof window.pgLimit === "function") {
      const maxBeds = window.pgLimit("maxBeds");
      if (Number.isFinite(maxBeds) && dims && typeof dims.bedCount === "number" && dims.bedCount >= maxBeds) {
        alert(`Free version allows up to ${maxBeds} bed${maxBeds === 1 ? "" : "s"}. Pro removes this limit (store version).`);
        return;
      }
    }
  } catch (e) {}

  const nextCount = dims.bedCount + 1;
  const newIndex = dims.bedCount;

  // Sync from canonical propertyState (bed objects) before extending
  ensurePropertyStateInPlace(dims.bedCount, propertyState);
  bedOffsets = ensureBedOffsets(dims.bedCount, propertyState.beds.map(b => b.offset));
  bedRot = ensureBedRot(dims.bedCount, propertyState.beds.map(b => b.rot));

  // Update bed count input
  const cInput = byId("layoutBedCount");
  if (cInput) cInput.value = String(nextCount);

  // Extend arrays and give the new bed a reasonable default position (near previous bed)
  bedOffsets = ensureBedOffsets(nextCount, bedOffsets);
  bedRot = ensureBedRot(nextCount, bedRot);
  const prev = bedOffsets[nextCount - 2] || { x: 0, y: 0 };
  if (!bedOffsets[nextCount - 1] || (bedOffsets[nextCount - 1].x === 0 && bedOffsets[nextCount - 1].y === 0)) {
    bedOffsets[nextCount - 1] = { x: prev.x + 2, y: prev.y };
  }

  // Expand planting-square array without overwriting existing beds
  ensureEditableStateDims({ w: dims.w, l: dims.l, bedCount: nextCount, bedSq: Math.round(dims.w * dims.l) });

  // Rebuild propertyState to the new count and sync offsets/rotations back into beds
  ensurePropertyStateInPlace(nextCount, propertyState);
  for (let i = 0; i < nextCount; i++) {
    if (propertyState.beds[i]) {
      propertyState.beds[i].offset = bedOffsets[i] || { x: 0, y: 0 };
      propertyState.beds[i].rot = bedRot?.[i] ? 1 : 0;
    }
  }

  // Keep global `beds` ref aligned with canonical propertyState.beds (prevents overlay \"ghost beds\").
  try { syncBedsRef(); } catch (e) {}

  // Optional: assign plan metadata.
  // Priority:
  //   1) explicit planId passed in
  //   2) the "default plan for new bed" dropdown (when present)
  //   3) auto-advance to the next unused plan after the most recently assigned bed plan
  let pid = planId || null;
  if (!pid) pid = (typeof newBedDefaultPlanId === "string" ? (newBedDefaultPlanId || null) : null);
  if (!pid) pid = byId("propFirstBedPlanSelect")?.value || null;

  if (!pid) {
    const anchor = getLastAssignedBedPlanId() || getPrimaryMyGardenPlanId() || null;
    pid =
      getNextUnusedMyGardenPlanIdAfter(anchor) ||
      getNextUnusedMyGardenPlanId() ||
      anchor ||
      null;
  }

  if (pid && propertyState?.beds?.[newIndex]) {
    propertyState.beds[newIndex].planId = pid;
    propertyState.beds[newIndex].planName = getMyGardenPlanNameById(pid);
  }

  selectedBedIndex = newIndex;
  render();
  autoSave();
  try { saveBeds(); } catch(e) {}
  try { autoFitProperty(); } catch(e) {}
  try { pgScheduleRender({ fit: true }); } catch(e) { try { schedule(); } catch(_) {} }
  updateLayoutPlanActionAvailability();
}

// Get a crop label from an entry (handles different shapes)
function entryCropName(e) {
  return (e && (e.crop || e.name || e.cropName || "") + "").trim();
}

// Try to infer "plants per sqft" from your spacing data.
// You can tighten this later once you confirm your spacingData structure.
function plantsPerSqFtForCrop(cropName) {
  // If you have spacingData as a map: spacingData[cropName]
  const sd = window.spacingData || window.SPACING_DATA || null;
  if (sd && cropName && sd[cropName]) {
    const v = sd[cropName];
    // common patterns people use:
    if (typeof v === "number") return clamp(v, 1, 16);
    if (typeof v === "object") {
      // v.plantsPerSqFt, v.sqft, v.perSqFt etc.
      const guess =
        v.plantsPerSqFt ?? v.perSqFt ?? v.sqft ?? v.sqftPlants ?? v.plants_per_sqft;
      if (typeof guess === "number") return clamp(guess, 1, 16);
    }
  }
  // fallback: assume 1 plant per sqft (safe default)
  return 1;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

let lastLayout = null;

function repaintFromLast(showEmpty) {
  if (!lastLayout) return;
  const { used, w, l, bedCount, bedSq } = lastLayout;
  const grid = byId("layoutGrid");
  if (!grid) return;
  grid.innerHTML = "";
  grid.style.display = "grid";
  grid.style.gap = "14px";
  grid.style.gridTemplateColumns = "1fr";
  // Ensure editableState exists ONCE
  if (!editableState) {
    const fallbackUsed =
      Array.isArray(lastLayout.used) ? [...lastLayout.used] : [];
    editableState = { w, l, bedCount, bedSq, used: fallbackUsed };
  }
  // ✅ THIS IS THE LOOP — EVERYTHING USING b OR bedGrid MUST LIVE INSIDE
  for (let b = 0; b < bedCount; b++) {
    const bedWrap = document.createElement("div");
    bedWrap.style.background = "var(--surface)";
    bedWrap.style.border = "1px solid var(--primary)";
    bedWrap.style.borderRadius = "12px";
    bedWrap.style.padding = "10px";
    const title = document.createElement("div");
    title.style.display = "flex";
    title.style.justifyContent = "space-between";
    title.style.alignItems = "center";
    title.style.marginBottom = "8px";
    title.innerHTML = `<strong>Bed ${b + 1}</strong>
      <span style="opacity:.8; font-size:12px;">${w}×${l} ft (${bedSq} sq ft)</span>`;
    bedWrap.appendChild(title);
    const bedGrid = document.createElement("div");
    bedGrid.style.display = "grid";
    bedGrid.style.gap = "4px";
    bedGrid.style.gridTemplateColumns = `repeat(${w}, minmax(0, 1fr))`;
    const start = b * bedSq;
    const end = start + bedSq;
    const bedUsed = editableState.used.slice(start, end);
    for (let i = 0; i < bedSq; i++) {
      const absoluteIndex = start + i;
      const crop = bedUsed[i] || "";
      if (!crop && !showEmpty) continue;
      const cell = document.createElement("div");
      cell.className = `layout-cell ${crop ? "" : "layout-empty"}`;
      cell.style.background = crop ? colorForCrop(crop) : "transparent";
      cell.textContent = crop || "Empty";
      cell.style.cursor = "pointer";
      cell.title = "Click to edit";
      cell.onclick = () => {
        const next = prompt(
          "Enter crop name (blank = empty):",
          editableState.used[absoluteIndex] || ""
        );
        if (next === null) return;
        editableState.used[absoluteIndex] = next.trim();
        if (byId("layoutAutoSave")?.checked) {
          saveLayoutState({
            w: editableState.w,
            l: editableState.l,
            bedCount: editableState.bedCount,
            used: editableState.used
          });
        }
        repaintFromLast(showEmpty);
      };
      bedGrid.appendChild(cell);
    }
    bedWrap.appendChild(bedGrid);
    grid.appendChild(bedWrap);
  }
  // Draw property map + controls for this plan
  renderPropertySketch(bedCount, w, l);
  // Ensure right-side planting-square editor (and Assign My Garden button) stays in sync
  try { if (typeof renderSelectedBedGrid === "function") renderSelectedBedGrid(); } catch (e) {}
}

window.LayoutOverride = window.LayoutOverride || null;

function colorForCrop(name) {
  // stable-ish pastel from string
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 45% 28% / 0.55)`;
}

function isLightTheme() {
  // Your project uses data-theme on <html> (theme.js), but also has a stray body.dataset toggle.
  // We support both safely.
  return (
    document.documentElement.getAttribute("data-theme") === "light" ||
    document.body?.dataset?.theme === "light"
  );
}

function scoreRank(score){ return ""; }

/* -----------------------------------------------------------
   Garden Score / Achievements REMOVED (Jan 2026)
   The Layout tab no longer computes or displays any scoring.
   Stubs remain to avoid breaking any legacy references.
   ----------------------------------------------------------- */
function ensurePropertyScoreHeaderUI(){ return null; }
function computeGardenScore(){ return null; }
function renderGardenScoreUI(){ /* removed */ }
function computeGardenAchievements(){ return []; }


let editableState = null; // shape: { w, l, bedCount, bedSq, used: [cropName or "" ...] }
let bedOffsets = []; // one {x, y} per bed, used by the property sketch
let propertyState = null; // per plan
let selectedBedIndex = null; // which bed is “active” in the UI
let newBedDefaultPlanId = ""; // optional default plan for *new* beds ("" = auto)
let hoveredBedIndex = null; // transient hover target for right-side square panel

let obstaclePanelCollapsed = false;
try { obstaclePanelCollapsed = localStorage.getItem("pg_obstacle_panel_collapsed") === "1"; } catch(e) {}

// User-controlled collapses (persisted)
let propertyToolbarCollapsed = false;
let selectedSquaresCollapsed = false;
try { propertyToolbarCollapsed = localStorage.getItem("pg_property_toolbar_collapsed") === "1"; } catch(e) {}
try { selectedSquaresCollapsed = localStorage.getItem("pg_selected_squares_collapsed") === "1"; } catch(e) {}

// Layout summary toggle handler (installed once)
let __pgSummaryToggleInstalled = false;
function ensureSummaryToggleHandlers() {
  if (__pgSummaryToggleInstalled) return;
  __pgSummaryToggleInstalled = true;
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t || !t.id) return;
    if (t.id === "togglePropertyToolbarBtn") {
      propertyToolbarCollapsed = !propertyToolbarCollapsed;
      try { localStorage.setItem("pg_property_toolbar_collapsed", propertyToolbarCollapsed ? "1" : "0"); } catch(e2) {}
      try { render(); } catch(e3) {}
      return;
    }
    if (t.id === "toggleSelectedSquaresBtn") {
      selectedSquaresCollapsed = !selectedSquaresCollapsed;
      try { localStorage.setItem("pg_selected_squares_collapsed", selectedSquaresCollapsed ? "1" : "0"); } catch(e2) {}
      try { render(); } catch(e3) {}
      return;
    }
  }, true);
}

propertyState = null;

function readBedDimsFromInputs() {
  const w = Math.max(1, Math.floor(parseFloat(byId("layoutBedW")?.value || "4")));
  const l = Math.max(1, Math.floor(parseFloat(byId("layoutBedL")?.value || "8")));
  const bedCount = Math.max(0, parseInt(byId("layoutBedCount")?.value || "0", 10));
  return { w, l, bedCount, bedSq: w * l };
}

let bedRot = []; // 0 = normal, 1 = rotated 90deg

function ensureBedOffsets(count, src) {
  const base = Array.isArray(src) ? src : [];
  return Array.from({ length: count }, (_, i) => {
    const o = base[i] || {};
    return {
      x: (typeof o.x === "number") ? o.x : 0,
      y: (typeof o.y === "number") ? o.y : 0
    };
  });
}

// Canonical name
function ensureBedRotations(count, src) {
  const base = Array.isArray(src) ? src : [];
  return Array.from({ length: count }, (_, i) => {
    const v = base[i];
    // accept 0/1 numbers, booleans, or truthy/falsy
    return (v === 1 || v === true) ? 1 : 0;
  });
}

// Back-compat alias (your code already calls ensureBedRot in a lot of places)
function ensureBedRot(count, src) {
  return ensureBedRotations(count, src);
}

function ensureEditableStateDims({ w, l, bedCount, bedSq }) {
  if (!editableState || !Array.isArray(editableState.used)) {
    const baseUsed = (lastLayout && Array.isArray(lastLayout.used)) ? lastLayout.used.slice() : [];
    editableState = { w, l, bedCount, bedSq, used: baseUsed };
  }
  editableState.w = w;
  editableState.l = l;
  editableState.bedCount = bedCount;
  editableState.bedSq = bedSq;
  const need = bedSq * bedCount;
  const cur = Array.isArray(editableState.used) ? editableState.used : [];
  if (cur.length < need) {
    editableState.used = cur.concat(Array.from({ length: need - cur.length }, () => ""));
  } else if (cur.length > need) {
    editableState.used = cur.slice(0, need);
  }
}

function autosaveLayoutIfOn() {
  const auto = !!byId("layoutAutoSave")?.checked;
  if (!auto) return;
  // Only autosave if we have something real
  if (!editableState || !Array.isArray(editableState.used)) return;
  // Save using the canonical saver (includes propertyState + beds[])
  if (typeof saveCurrentLayoutWithProperty === "function") {
    saveCurrentLayoutWithProperty();
    return;
  }
  // Fallback (should rarely hit)
  if (typeof saveLayoutState !== "function") return;
  saveLayoutState({
    w: editableState.w,
    l: editableState.l,
    bedCount: editableState.bedCount,
    used: editableState.used
  });
}


// Global helper used by legacy call sites and new UI.
// - Always persists the GLOBAL property layout (bed positions, obstacles, dimensions)
// - Persists crop-square layout only when autosave toggle is on
function autoSave() {
  // Persist bed positions / property map globally
  try { savePropertyLayout(); } catch (e) {}

  // Persist crop-square assignments as well, so any later re-render/rehydrate can't pull stale bedCount/used state.
  // This eliminates "snap back unless I hit Save" behavior.
  try {
    const s = (editableState && Array.isArray(editableState.used)) ? editableState
            : (lastLayout && Array.isArray(lastLayout.used)) ? lastLayout
            : null;
    if (s && typeof saveLayoutState === "function") {
      saveLayoutState({
        w: s.w,
        l: s.l,
        bedCount: s.bedCount,
        used: s.used
      });
    }
  } catch (e) {}
}

function addBed() {
  // Clear any stale form state from the last-selected bed.
  try { resetBedForm(); } catch (e) {}

  // Keep legacy button wiring but route through the canonical add path that
  // properly expands propertyState.beds, bedOffsets, bedRot, and saves.
  return addBedFromCurrentPlan(null);
}

function removeBed() {
  const dims = readBedDimsFromInputs();
  if (dims.bedCount <= 0) return;
  const bedSq = dims.bedSq;

  // Remove selected bed if one is selected, otherwise remove last.
  const idx = (typeof selectedBedIndex === "number" && selectedBedIndex >= 0 && selectedBedIndex < dims.bedCount)
    ? selectedBedIndex
    : (dims.bedCount - 1);

  // Capture the bed id (if present) so any optional DOM overlay can be removed.
  let idToRemove = null;
  try {
    syncBedsRef();
    ensurePropertyStateInPlace(dims.bedCount, propertyState);
    idToRemove = (propertyState?.beds?.[idx]?.id) || (beds?.[idx]?.id) || null;
  } catch (e) {}

  const nextCount = dims.bedCount - 1;

  // Sync canonical state before shrinking.
  ensurePropertyStateInPlace(dims.bedCount, propertyState);
  bedOffsets = ensureBedOffsets(dims.bedCount, propertyState.beds.map(b => b.offset));
  bedRot = ensureBedRot(dims.bedCount, propertyState.beds.map(b => b.rot));

  // Update bed count input.
  const cInput = byId("layoutBedCount");
  if (cInput) cInput.value = String(nextCount);

  // Remove bed entry from the canonical bed object array.
  if (propertyState && Array.isArray(propertyState.beds)) {
    propertyState.beds.splice(idx, 1);
  }

  // Remove optional overlay DOM immediately to prevent a "ghost" in the corner.
  if (idToRemove) {
    try { removeBedOverlay(idToRemove); } catch (e) {}
  }

  // Remove that bed's offset/rot entry.
  bedOffsets.splice(idx, 1);
  bedRot.splice(idx, 1);

  // Clamp arrays to new size.
  bedOffsets = ensureBedOffsets(nextCount, bedOffsets);
  bedRot = ensureBedRot(nextCount, bedRot);

  // Remove that bed’s squares from editableState.used (keeps other beds aligned).
  ensureEditableStateDims(dims);
  if (editableState && Array.isArray(editableState.used)) {
    editableState.used.splice(idx * bedSq, bedSq);
  }

  selectedBedIndex = null;
  selectedBedId = null;

  // Normalize to new count and sync offsets/rotations back into bed objects.
  ensureEditableStateDims({ ...dims, bedCount: nextCount, bedSq });
  ensurePropertyStateInPlace(nextCount, propertyState);
  for (let i = 0; i < nextCount; i++) {
    if (propertyState.beds[i]) {
      propertyState.beds[i].offset = bedOffsets[i] || { x: 0, y: 0 };
      propertyState.beds[i].rot = bedRot?.[i] ? 1 : 0;
    }
  }

  // Keep global `beds` ref aligned with canonical propertyState.beds after deletion (prevents overlay "ghost beds").
  try { syncBedsRef(); } catch (e) {}

  // Clear any leftover overlays/bed DOM immediately to prevent "ghost beds" at the birth spot.
  // (Some redraw paths can early-return for a frame during reflow.)
  try { clearAllBedOverlays(); } catch (e) {}
  try { clearAllPropertyBedBlocks(); } catch (e) {}

  render();
  autoSave();
  try { saveBeds(); } catch(e) {}
  try { autoFitProperty(); } catch(e) {}
  try { pgScheduleRender({ fit: true }); } catch(e) { try { schedule(); } catch(_) {} }
  // Post-delete safety: force a property sketch redraw on the next frame (prevents a stale bed block at 0,0).
  try { requestAnimationFrame(() => { try { renderPropertySketchFromInputs(nextCount); } catch (e) {} }); } catch (e) {}
}

// Delete logic that respects current selection (by id or index) and clears selection after removal.
function removeSelectedBed() {
  const idx = getSelectedBedIndex();
  if (idx == null) {
    alert("No bed selected to delete");
    return;
  }

  const bedLabel = (beds?.[idx]?.name || beds?.[idx]?.id || `Bed ${idx + 1}`);
  const ok = confirm(`Delete bed "${bedLabel}"?`);
  if (!ok) return;

  // Make sure removeBed() targets the intended bed (it prefers selectedBedIndex).
  selectedBedIndex = idx;
  syncSelectedBedId();

  const idToRemove = (beds?.[idx]?.id || selectedBedId || null);

  // Perform removal using the app's canonical path.
  try { removeBed(); } catch (e) {
    // Fallback: remove from our state
    beds = Array.isArray(beds) ? beds.filter((_, i) => i !== idx) : [];
    try { syncBedsRef(); } catch (e2) {}
  }

  // Sync our `beds` ref after canonical mutations (prevents stale overlay re-renders).
  try { syncBedsRef(); } catch (e) {}

  // Remove optional overlay DOM, if present.
  if (idToRemove) {
    try { removeBedOverlay(idToRemove); } catch (e) {}
  }
  // Extra safety: wipe any stale overlay nodes immediately (prevents tiny corner ghosts).
  try { clearAllBedOverlays(); } catch (e) {}

  // Clear selection so UI doesn't point at a non-existent bed.
  selectedBedIndex = null;
  selectedBedId = null;

  try { saveBeds(); } catch (e) {}
  try { updateBedSelectionUI(); } catch (e) {}

  // Refit after content bounds changed.
  try { autoFitProperty(); } catch (e) {}
  pgScheduleRender({ fit: false });
}


function render() {
  // Layout rendering must NOT depend on a global plan selection.
  // We only render the current saved/layout state; plan-to-bed population happens explicitly.
  hideLayoutPlanTabsUI();

  const bedW = parseFloat(byId("layoutBedW")?.value || "4");
  const bedL = parseFloat(byId("layoutBedL")?.value || "8");
  const showEmpty = !!byId("layoutShowEmpty")?.checked;
  const w = Math.max(1, Math.floor(bedW));
  const l = Math.max(1, Math.floor(bedL));
  const bedSq = w * l;

  let bedCount = parseInt(byId("layoutBedCount")?.value || "0", 10);
  if (!Number.isFinite(bedCount) || bedCount < 0) bedCount = 0;

  // Ensure editableState exists and matches current dims/count (without repopulating).
  ensureEditableStateDims({ w, l, bedCount, bedSq });
  if (!editableState || !Array.isArray(editableState.used)) {
    editableState = { w, l, bedCount, bedSq, used: Array.from({ length: bedSq * bedCount }, () => "") };
  }
  lastLayout = { w, l, bedCount, bedSq, used: editableState.used.slice() };

  // Keep property state in sync (beds should remain stationary).
  // Canonical source of truth for position is bedOffsets/bedRot; do NOT overwrite them on every render,
  // otherwise any transient mismatch between propertyState and arrays will "snap" beds back.
  ensurePropertyStateInPlace(bedCount, propertyState);

  // Initialize arrays from saved property only if we don't already have live arrays.
  // If bedCount changed, rebuild offsets/rotations from canonical propertyState first.
  // This prevents "snap back" when the user increases bed count.
  const needRebuildOffsets = !Array.isArray(bedOffsets) || bedOffsets.length !== bedCount;
  const needRebuildRot = !Array.isArray(bedRot) || bedRot.length !== bedCount;

  bedOffsets = ensureBedOffsets(
    bedCount,
    needRebuildOffsets ? propertyState.beds.map(b => b.offset) : bedOffsets
  );
  bedRot = ensureBedRot(
    bedCount,
    needRebuildRot ? propertyState.beds.map(b => b.rot) : bedRot
  );

  // Sync canonical arrays back into propertyState so saves are consistent.
  for (let i = 0; i < bedCount; i++) {
    if (propertyState.beds[i]) {
      propertyState.beds[i].offset = bedOffsets[i] || { x: 0, y: 0 };
      propertyState.beds[i].rot = bedRot?.[i] ? 1 : 0;
    }
  }// Summary is based on the actual layout state
  const totalSq = bedSq * bedCount;
  const counts = new Map();
  let usedCount = 0;
  for (const raw of editableState.used) {
    const crop = (raw || "").trim();
    if (!crop) continue;
    usedCount++;
    counts.set(crop, (counts.get(crop) || 0) + 1);
  }
  const emptyCount = Math.max(0, totalSq - usedCount);
  const distinct = counts.size;
  const topCrops = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const lines = topCrops.map(([c, n]) => `${c}: ${n}`).join(" • ");

  const summary = byId("layoutSummary");
  if (summary) {
    summary.innerHTML = `
      <div id="layoutSummaryWrap" style="display:flex; gap:14px; align-items:stretch; flex-wrap:wrap;">
        <div id="layoutStatsCard" style="flex:1 1 520px; background:var(--surface); border:1px solid var(--primary); border-radius:12px; padding:12px;">
          <div><strong>Beds:</strong> ${bedCount} • <strong>Each:</strong> ${w}×${l} ft (${bedSq} sq ft) • <strong>Total:</strong> ${totalSq} sq ft</div>
          <div><strong>Crops:</strong> ${distinct} • <strong>Used:</strong> ${usedCount} sq • <strong>Empty:</strong> ${emptyCount} sq</div>
          <div style="margin-top:8px; opacity:0.9;">${lines || "No crops assigned yet. Use the bed editor to pick a plan and populate."}</div>
          <div style="margin-top:8px; font-size:12px; opacity:0.75;">Bed population is per-bed (no global plan switching on this tab).</div>
          <div style="margin-top:12px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.10);">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px;">
              <strong>Property Toolbar</strong>
              <div style="display:flex; gap:8px; align-items:center;">
                <button type="button" id="togglePropertyToolbarBtn" class="pg-mini-btn">${propertyToolbarCollapsed ? "Expand" : "Collapse"}</button>
                <span style="font-size:12px; opacity:0.75;">Edit selected bed</span>
              </div>
            </div>
            <div id="layoutBedEditorMount" style="display:${propertyToolbarCollapsed ? "none" : "block"};"></div>
          </div>
        </div>

        <div id="layoutSelectedBedHost" style="flex:1 1 360px; background:rgba(0,0,0,0.18); border:1px solid rgba(0,238,255,0.35); border-radius:12px; padding:12px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px;">
            <strong>Selected Bed Planting Squares</strong>
            <div style="display:flex; gap:8px; align-items:center;">
              <button type="button" id="toggleSelectedSquaresBtn" class="pg-mini-btn">${selectedSquaresCollapsed ? "Expand" : "Collapse"}</button>
              <span style="font-size:12px; opacity:0.75;">Hover/click a bed</span>
            </div>
          </div>
          <div id="layoutSelectedBedMount" style="display:${selectedSquaresCollapsed ? "none" : "block"};"></div>
        </div>
      </div>
    `;
    try { ensureSummaryToggleHandlers(); } catch(e) {}
  }
  // Re-attach the selected-bed panel into the new mount created above.
  try { attachSelectedBedPanelNodeToMount(); } catch (e) {}

  // Draw property map + side controls
  renderPropertySketch(bedCount, w, l);

  // Keep the property map fitted when the viewport changes (rotate phone / resize window)
  if (!window.__pgResizeHookInstalled) {
    window.__pgResizeHookInstalled = true;
    let __pgResizeT = null;
    window.addEventListener("resize", () => {
      clearTimeout(__pgResizeT);
      __pgResizeT = setTimeout(() => {        try {
          // IMPORTANT: Do NOT use nonexistent *Input ids here.
          // The old code read undefined ids, produced bedCount=0, and accidentally truncated
          // propertyState.beds on resize (devtools/mobile/responsive), making beds revert to defaults.
          // Re-render using the current canonical args instead.
          const bcNowRaw = parseInt(byId("layoutBedCount")?.value || "0", 10);
          const safeBedCount = (Number.isFinite(bcNowRaw) && bcNowRaw >= 0) ? bcNowRaw : 0;

          if (typeof window.__pgRerenderMap === "function") {
            window.__pgRerenderMap();
          } else if (typeof renderPropertySketchFromInputs === "function") {
            renderPropertySketchFromInputs(safeBedCount);
          } else {
            // Fallback: derive bed dims from the layout inputs
            const bw = Math.max(1, Math.floor(parseFloat(byId("layoutBedW")?.value || "4")));
            const bl = Math.max(1, Math.floor(parseFloat(byId("layoutBedL")?.value || "8")));
            renderPropertySketch(safeBedCount, bw, bl);
          }
        } catch (e) {}
}, 120);
    });
  }

  renderBedOffsetControls(bedCount);

  // After the property sketch exists, relocate the selected-bed crop panel into the summary area.
  // (The panel DOM is created by renderPropertySketch in some builds, so relocation must happen after.)
  try { relocateSelectedBedPanel(); } catch (e) {}
  try { relocatePropertyToolbar(); } catch (e) {}

  // Render bed cards
  const grid = byId("layoutGrid");
  if (!grid) return;
  grid.innerHTML = "";
  grid.style.display = "grid";
  grid.style.gap = "14px";
  grid.style.gridTemplateColumns = "1fr";

  for (let b = 0; b < bedCount; b++) {
    const bedWrap = document.createElement("details");
    bedWrap.className = "layout-bed-card";
    bedWrap.open = false;

    const header = document.createElement("summary");
    header.className = "layout-bed-summary";

    const start = b * bedSq;
    const end = start + bedSq;
    const bedUsedSlice = editableState.used.slice(start, end);
    let planted = 0;
    let empty = 0;
    const freq = new Map();
    for (const raw of bedUsedSlice) {
      const crop = (raw || "").trim();
      if (!crop) { empty++; continue; }
      planted++;
      freq.set(crop, (freq.get(crop) || 0) + 1);
    }
    let dominantCrop = "";
    let dominantCount = 0;
    for (const [crop, count] of freq.entries()) {
      if (count > dominantCount) { dominantCrop = crop; dominantCount = count; }
    }
    const mostlyText = dominantCrop ? ` · mostly ${dominantCrop}${dominantCount > 1 ? ` (${dominantCount})` : ""}` : "";

    header.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%;">
        <div style="display:flex; flex-direction:column; gap:2px;">
          <strong>Bed ${b + 1}</strong>
          <span style="opacity:.85; font-size:12px;">${planted} planted · ${empty} empty${mostlyText}</span>
        </div>
        <span style="opacity:.8; font-size:12px; white-space:nowrap;">${w}×${l} ft (${bedSq} sq ft)</span>
      </div>
    `;
    header.addEventListener("click", (ev) => ev.stopPropagation());
    bedWrap.appendChild(header);

    const body = document.createElement("div");
    body.className = "layout-bed-body";
    bedWrap.appendChild(body);

    const bedGrid = document.createElement("div");
    bedGrid.style.display = "grid";
    bedGrid.style.gap = "4px";
    bedGrid.style.gridTemplateColumns = `repeat(${w}, minmax(0, 1fr))`;
    body.appendChild(bedGrid);

    for (let i = 0; i < bedSq; i++) {
      const absoluteIndex = start + i;
      const crop = (editableState.used[absoluteIndex] || "").trim();
      if (!crop && !showEmpty) continue;
      const cell = document.createElement("div");
      cell.className = "layout-cell";
      cell.dataset.absIndex = String(absoluteIndex);
      cell.style.cursor = "pointer";
      cell.title = "Click to edit";
      cell.textContent = crop || "Empty";
      cell.style.background = crop ? colorForCrop(crop) : "transparent";
      if (!crop) cell.classList.add("layout-empty");
      cell.onclick = () => {
        const cur = (editableState.used[absoluteIndex] || "").trim();
        const next = prompt("Enter crop name (blank = empty):", cur);
        if (next === null) return;
        editableState.used[absoluteIndex] = (next || "").trim();
        autoSave();
        render();
      };
      bedGrid.appendChild(cell);
    }

    grid.appendChild(bedWrap);
  }

  // Keep the right-side panel synchronized with the most recent interaction
  try {
    const b = (typeof hoveredBedIndex === "number" && hoveredBedIndex != null) ? hoveredBedIndex : (selectedBedIndex ?? 0);
    if (typeof renderSelectedBedGrid === "function") renderSelectedBedGrid(b);
  } catch (e) {}
}

function print() {
  // Monetization gate: printing is Pro-only on web
  try {
    if (typeof window.pgRequire === "function") {
      if (!window.pgRequire("exportPrint", "Printing is available in the Pro app (store version).")) return;
    }
  } catch (e) {}
  window.print();
}

function init() {
  const grid = byId("layoutGrid");
  if (!grid) return;

  try { ensureGrassGridStyle();
  ensurePropertyLabelStyle();
  ensurePropertyMapLockStyle(); } catch(e) {}

  // 0) Always load the GLOBAL property layout first so bed positions remain stationary
  //    even if there is no saved crop layout yet.
  try { loadPropertyLayout(); } catch (e) {}

  // 0.5) Restore bed metadata (name/type/plan/size/offset) from localStorage, then sync refs.
  // This prevents edits from "disappearing" after re-render and helps avoid snap-back.
  try {
    const __savedBeds = loadBeds();
    if (__savedBeds && __savedBeds.length) mergeSavedBedsIntoPropertyState(__savedBeds);
    syncBedsRef();
  } catch (e) {}


  
// If no crop layout is saved yet, do NOT force a default bed.
// Start from the globally saved property bed count (can be 0).
try {
  const cInput0 = byId("layoutBedCount");
  if (cInput0 && (!cInput0.value || cInput0.value === "1")) {
    const existingBeds = propertyState?.beds?.length ?? 0;
    cInput0.value = String(existingBeds);
  }
} catch (e) {}
// Default autosave ON (requested). If the checkbox exists, enforce checked=true.
  const as = byId("layoutAutoSave");
  if (as) as.checked = true;

  // 1) Hydrate lastLayout/editableState + set bed inputs from storage
  loadLayoutState();
  // 2) Load saved object once
  const saved = (typeof loadSavedLayout === "function") ? loadSavedLayout() : null;
  // 3) Restore property controls from saved
  if (saved && saved.property) {
    const pw = byId("propertyWidth");
    const pl = byId("propertyLength");
    const ps = byId("propertyScale");
    if (pw && saved.property.width != null) pw.value = String(saved.property.width);
    if (pl && saved.property.length != null) pl.value = String(saved.property.length);
    if (ps && saved.property.scale != null) ps.value = String(saved.property.scale);
  }
  // 4) Determine bed dims/count AFTER loadLayoutState may have updated the inputs
  const dims = readBedDimsFromInputs();
  const bedCount = dims.bedCount;
  // 5) Build canonical propertyState + sync arrays
  const baseProp = propertyState || (saved ? saved.property : null);
  ensurePropertyStateInPlace(bedCount, baseProp);
  bedOffsets = ensureBedOffsets(
    bedCount,
    propertyState.beds.map(b => b.offset)
  );
  bedRot = ensureBedRot(
    bedCount,
    propertyState.beds.map(b => b.rot)
  );
  // 6) Wire add/remove buttons (if present)
  const addBtn = byId("addBedBtn");
  const delBtn = byId("delBedBtn");
  const cInput = byId("layoutBedCount");
  if (addBtn && delBtn && cInput) {
    addBtn.onclick = () => addBedFromCurrentPlan();
    delBtn.onclick = () => removeBed();
  }

  // Wire property inputs to rerender + autosave (so changing 1ft/2ft/5ft updates immediately).
  try {
    let _pgCtlRaf = null;
    const _pgIds = ["propertyWidth", "propertyLength", "propertyScale", "propertySnap"];
    const _pgHandler = (ev) => {
      const id = ev && ev.target ? ev.target.id : "";
      const shouldFit = (id === "propertyScale" || id === "propertyWidth" || id === "propertyLength");
      if (_pgCtlRaf) cancelAnimationFrame(_pgCtlRaf);
      _pgCtlRaf = requestAnimationFrame(() => {
        // Save first (state -> storage), then rerender on a fresh frame
        try { window.autoSaveLayoutProperty && window.autoSaveLayoutProperty(); } catch(e) {}
        try {
          if (typeof window.__pgRerenderMap === "function") {
            // Next frame helps ensure viewport metrics are stable before measuring
            requestAnimationFrame(() => {
              try { window.__pgRerenderMap(); } catch(e2) {}
              if (shouldFit) requestAnimationFrame(() => { try { pgFitToViewport(); } catch(e3) {} });
            });
          }
        } catch(e) {}
      });
    };
    _pgIds.forEach((id) => {
      const el = byId(id);
      if (!el) return;
      el.addEventListener("change", _pgHandler);
      el.addEventListener("input", _pgHandler);
    });
  } catch(e) {}

  // 7) Initial render
  render();
}

function renderSelectedBedGrid(b) {
  const panel = byId("selectedBedPanel") || getSelectedBedPanelNode();
  if (!panel) return;
  // Keep panel height stable so the page doesn't jump when selection clears.
  if (!panel.dataset.pgMinH) {
    // Capture a reasonable baseline once (fallback if empty on first run).
    const h = Math.max(220, Math.min(420, panel.getBoundingClientRect().height || 0));
    panel.dataset.pgMinH = String(h || 260);
  }
  panel.style.minHeight = panel.dataset.pgMinH + "px";
  // Default to currently selected bed
  if (b == null) b = selectedBedIndex;
  if (b == null) {
    panel.innerHTML = `
      <div class="pg-selectedbed-empty" style="display:flex;align-items:center;justify-content:center;height:100%;min-height:${panel.dataset.pgMinH}px;color:var(--text-secondary);font-size:0.95em;text-align:center;padding:14px;">
        Hover/click a bed to view planting squares.
      </div>
    `;
    return;
  }
  // Must have a layout + editable state
  if (!lastLayout || !editableState || !Array.isArray(editableState.used)) {
    panel.innerHTML = "";
    return;
  }
  const bedSq = lastLayout?.bedSq || (lastLayout?.w && lastLayout?.l ? Math.round(lastLayout.w * lastLayout.l) : 0);
  if (!bedSq) {
    panel.innerHTML = "";
    return;
  }
  const { start, end } = getBedSliceRange(b, bedSq);
  const planId = getBedPlanId(b);
  const planName = planId ? getMyGardenPlanNameById(planId) : "(no plan selected)";
  // Render the crop bed editor UI (right-side panel)
  panel.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px;">
      <div style="display:flex; flex-direction:column; gap:2px;">
        <strong>Bed ${b + 1} squares</strong>
        <span style="font-size:12px; opacity:0.8;">Plan for this bed: ${escapeHtml(planName)}</span>
      </div>
      <button type="button" id="assignPlanToBedBtn">Populate from selected plan</button>
    </div>
    <div id="selectedBedGrid" style="
      display:grid;
      grid-template-columns: repeat(${Math.max(1, lastLayout.w)}, 1fr);
      gap:6px;
    "></div>
  `;
  const grid = byId("selectedBedGrid");
  if (!grid) return;
  // Render squares for this bed
  for (let i = start; i < end; i++) {
    const cell = document.createElement("div");
    cell.className = "layout-cell";
    const val = editableState.used[i] || "";
    cell.textContent = val ? val : (byId("layoutShowEmpty")?.checked ? "Empty" : "");
    if (!val) cell.classList.add("layout-empty");
    cell.onclick = () => {
      const next = prompt("Enter crop for this square (blank = empty):", val || "");
      if (next === null) return;
      editableState.used[i] = (next || "").trim();
      autoSave();
      render();
    };
    grid.appendChild(cell);
  }
  // Assign plan button
  const btn = byId("assignPlanToBedBtn");
  if (btn) {
    btn.onclick = () => {
      const pid = byId("propBedPlanSelect")?.value || getBedPlanId(b);
      const pname = pid ? getMyGardenPlanNameById(pid) : "(no plan selected)";
      const ok = confirm(`Populate Bed ${b + 1} with crops from "${pname}"? This will overwrite crops currently in this bed.`);
      if (!ok) return;
      populateBedFromPlan(b, pid);
    };
  }
}

function saveCurrentLayoutWithProperty() {
  const base =
    (editableState && Array.isArray(editableState.used)) ? editableState :
    (lastLayout && Array.isArray(lastLayout.used)) ? lastLayout :
    null;
  if (!base) return;

  // Sync offsets/rotations into propertyState (keep this — ensures consistency)
  const bedCount = base.bedCount;
  ensurePropertyStateInPlace(bedCount, propertyState);
  for (let i = 0; i < bedCount; i++) {
    propertyState.beds[i].offset = bedOffsets[i] || { x: 0, y: 0 };
    propertyState.beds[i].rot = bedRot?.[i] ? 1 : 0;
  }
  saveLayoutState({
    w: base.w,
    l: base.l,
    bedCount: base.bedCount,
    used: base.used,
  });
}

function renderPropertySelectedBedPanel(bedCount) {
  // Mount the property toolbar inside the stats/toolbar container when available.
  const wrap = byId("layoutBedEditorMount") || byId("bedOffsetControls");
  if (!wrap) return;

  // If we are mounting into layoutBedEditorMount, ensure any legacy panel in bedOffsetControls is removed
  // so we don't end up with two toolbars.
  const legacyWrap = byId("bedOffsetControls");
  if (wrap && wrap.id === "layoutBedEditorMount" && legacyWrap) {
    const legacyPanel = legacyWrap.querySelector("#propertySelectedBedPanel");
    if (legacyPanel) legacyPanel.remove();
  }
  // Ensure canonical propertyState exists and matches bedCount
  ensurePropertyStateInPlace(bedCount, propertyState);
  // Normalize selectedBedIndex
  const idx =
    (typeof selectedBedIndex === "number" && selectedBedIndex >= 0 && selectedBedIndex < bedCount)
      ? selectedBedIndex
      : null;
  // Panel container (create once)
  let panel = wrap.querySelector("#propertySelectedBedPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "propertySelectedBedPanel";
    panel.style.padding = "10px";
    panel.style.marginBottom = "10px";
    panel.style.border = "1px solid rgba(0,238,255,0.35)";
    panel.style.borderRadius = "10px";
    panel.style.background = "rgba(0,0,0,0.18)";
    wrap.prepend(panel);
  }
  if (idx === null) {
    // No bed selected. Keep the toolbar open and offer "Add Bed" (especially important when bedCount === 0).
    const plans = getMyGardenPlansList();
    const hasPlans = Array.isArray(plans) && plans.length > 0;
    if (!hasPlans) watchForMyGardenPlansReady();

        const anchorPlanId =
      getLastAssignedBedPlanId() ||
      getDefaultMyGardenPlanId() ||
      (hasPlans ? (plans[0]?.id ?? plans[0]?.planId ?? "") : "");

    const defaultPlanId =
      getNextUnusedMyGardenPlanIdAfter(anchorPlanId) ||
      getNextUnusedMyGardenPlanId() ||
      anchorPlanId ||
      (hasPlans ? (plans[0]?.id ?? plans[0]?.planId ?? "") : "");


    const storedDefaultPlanId = (typeof newBedDefaultPlanId === "string" ? newBedDefaultPlanId : "") || "";

// UI: When the toolbar isn't actively being used, keep this select on an "auto" display option
// instead of snapping to whatever My Garden plan was last viewed.
const sortedPlans = hasPlans ? [...plans] : [];
if (hasPlans) {
  // Put "Main Garden" first in this dropdown for clarity, then keep the rest in original order.
  const isMain = (p) => {
    const nm = ((p?.name ?? p?.title ?? "") + "").trim();
    const pid = ((p?.id ?? p?.planId ?? "") + "").trim();
    return /^main\s*garden$/i.test(nm) || /main\s*garden/i.test(pid.replace(/[_-]/g, " "));
  };
  const idx = sortedPlans.findIndex(isMain);
  if (idx > 0) {
    const [mg] = sortedPlans.splice(idx, 1);
    sortedPlans.unshift(mg);
  }
}

const placeholderOption = `<option value=""${storedDefaultPlanId ? "" : " selected"}>— Default plan for new bed (auto: next unused) —</option>`;

const planOptions = hasPlans
  ? placeholderOption +
    sortedPlans
      .map((p) => {
        const pid = p.id ?? p.planId ?? "";
        const name = p.name ?? p.title ?? pid ?? "Plan";
        const sel = pid && pid === storedDefaultPlanId ? " selected" : "";
        return `<option value="${escapeHtml(pid)}"${sel}>${escapeHtml(name)}</option>`;
      })
      .join("")
  : `<option value="">Loading plans...</option>`;

    const title = bedCount === 0 ? "No beds yet" : "No bed selected";
    const helper = bedCount === 0
      ? "Click anywhere on the property grid to start, then add your first bed."
      : "Click a bed on the property map to edit.";

    panel.innerHTML = `
      <div style="opacity:.9;">
        <strong>${title}</strong>
        <div style="margin-top:6px; font-size:12px; opacity:.8;">${helper}</div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
          <button type="button" id="propAddFirstBedBtn">${bedCount === 0 ? "Add first bed" : "Add bed"}</button>
          ${bedCount > 0 ? `</button>` : ``}
          <button type="button" id="propBuildRefreshBtn">Build / Refresh</button>
          <button type="button" id="propSaveLayoutBtn">Save</button>
          <button type="button" id="propPrintLayoutBtn">Print</button>
        </div>

        <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px; padding:10px; border:1px solid rgba(255,255,255,0.12); border-radius:10px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <div style="display:flex; flex-direction:column; gap:2px;">
              <strong style="font-size:13px;">Optional: default plan for the new bed</strong>
              <span style="font-size:12px; opacity:.8;">This sets the bed's plan. You can populate later.</span>
            </div>
          </div>
          <select id="propFirstBedPlanSelect">${planOptions}</select>
        </div>
      </div>
    `;

    // Wire actions
    const addBtn = panel.querySelector("#propAddFirstBedBtn");

// Track the "default plan for the new bed" dropdown (independent from the selected bed plan)
const newBedPlanSel = panel.querySelector("#propFirstBedPlanSelect");
if (newBedPlanSel) {
  newBedPlanSel.onchange = () => {
    newBedDefaultPlanId = newBedPlanSel.value || "";
  };
}

    if (addBtn) {
      addBtn.onclick = () => {
  const pid = (newBedPlanSel ? (newBedPlanSel.value || "") : (panel.querySelector("#propFirstBedPlanSelect")?.value || "")) || "";
  if (typeof addBedFromCurrentPlan === "function") addBedFromCurrentPlan(pid || null);
};
    }
    const sel1 = panel.querySelector("#propSelectBed1Btn");
    if (sel1) {
      sel1.onclick = () => {
        selectedBedIndex = 0;
        if (typeof renderBedOffsetControls === "function") renderBedOffsetControls(bedCount);
        {
      const bedW = parseFloat(document.getElementById("layoutBedW")?.value) || 4;
      const bedL = parseFloat(document.getElementById("layoutBedL")?.value) || 8;
      renderPropertySketch(bedCount, bedW, bedL);
    }
};
    }
    const br = panel.querySelector("#propBuildRefreshBtn");
    if (br) br.onclick = () => { try { render(); } catch (e) {} };
    const sv = panel.querySelector("#propSaveLayoutBtn");
    if (sv) sv.onclick = () => { try { save(); } catch (e) {} };
    const pr = panel.querySelector("#propPrintLayoutBtn");
    if (pr) pr.onclick = () => { try { print(); } catch (e) {} };

    return;
  }
  const bed = propertyState.beds[idx] || {
    name: `Bed ${idx + 1}`,
    type: "raised",
    pathFt: 2,
    wFt: null,
    lFt: null,
    rowCount: 0,
    rowSpacingFt: 1,
    rowDir: "auto"
  };

  // Bed-level plan selector (no global plan state on this tab)
const plans = getMyGardenPlansList();
const hasPlans = Array.isArray(plans) && plans.length > 0;

// If My Garden plans haven't been hydrated yet (common if My Garden loads after Layout),
// watch briefly and refresh this panel when plans appear.
if (!hasPlans) watchForMyGardenPlansReady();

const effectivePlanId =
  bed.planId ||
  getDefaultMyGardenPlanId() ||
  (hasPlans ? (plans[0]?.id ?? plans[0]?.planId ?? "") : "");

const planOptions = hasPlans
  ? plans
      .map((p) => {
        const pid = p.id ?? p.planId ?? "";
        const name = p.name ?? p.title ?? pid ?? "Plan";
        const sel = (pid && pid === effectivePlanId) ? " selected" : "";
        return `<option value="${escapeHtml(pid)}"${sel}>${escapeHtml(name)}</option>`;
      })
      .join("")
  : `<option value="">Loading plans...</option>`;

  panel.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
      <strong>Selected: Bed ${idx + 1}</strong>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button type="button" id="propRotateBtn">Rotate</button>
        <button type="button" id="propAddBedBtn">Add Bed</button>
        <button type="button" id="propRemoveBedBtn">Remove Bed</button>
        <button type="button" id="propBuildRefreshBtn">Build / Refresh</button>
        <button type="button" id="propSaveLayoutBtn">Save</button>
        <button type="button" id="propPrintLayoutBtn">Print</button>
      </div>
    </div>
    <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px; padding:10px; border:1px solid rgba(255,255,255,0.12); border-radius:10px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div style="display:flex; flex-direction:column; gap:2px;">
          <strong style="font-size:13px;">Plan for this bed</strong>
          <span style="font-size:12px; opacity:.8;">Selecting a plan here only affects this bed.</span>
        </div>
        <button type="button" id="propPopulateBedBtn" title="Populate this bed from the selected plan">Populate Bed</button>
      </div>
      <select id="propBedPlanSelect">${planOptions}</select>
    </div>
    <div style="display:grid; gap:8px; grid-template-columns: 1fr 1fr; margin-top:10px;">
      <label style="display:flex; flex-direction:column; gap:4px;">
        <span style="font-size:12px; opacity:.85;">Bed name</span>
      <input id="propBedName" type="text" value="${String(bed.name || `Bed ${idx + 1}`).replace(/"/g, "&quot;")}">
    </label>
    <label style="display:flex; flex-direction:column; gap:4px;">
      <span style="font-size:12px; opacity:.85;">Type</span>
      <select id="propBedType">
        <option value="raised">Raised bed</option>
        <option value="inground">In-ground</option>
        <option value="row">Rows</option>
        <option value="greenhouse">Greenhouse</option>
        <option value="container">Container</option>
      </select>
    </label>
    <label style="display:flex; flex-direction:column; gap:4px;">
      <span style="font-size:12px; opacity:.85;">Path / spacing (ft)</span>
      <input id="propBedPathFt" type="number" step="0.5" min="0"
             value="${Number.isFinite(bed.pathFt) ? bed.pathFt : 2}">
    </label>
    <div style="display:flex; flex-direction:column; gap:4px;">
      <span style="font-size:12px; opacity:.85;">Rotation</span>
      <div style="opacity:.9; font-size:12px;">
        ${bedRot?.[idx] ? "Rotated (90°)" : "Normal"}
      </div>
    </div>
    <label style="display:flex; flex-direction:column; gap:4px;">
      <span style="font-size:12px; opacity:.85;">Bed width (ft)</span>
      <input id="propBedWFt" type="number" step="0.5" min="0.5"
             value="${Number.isFinite(bed.wFt) ? bed.wFt : ""}">
    </label>
    <label style="display:flex; flex-direction:column; gap:4px;">
      <span style="font-size:12px; opacity:.85;">Bed length (ft)</span>
      <input id="propBedLFt" type="number" step="0.5" min="0.5"
             value="${Number.isFinite(bed.lFt) ? bed.lFt : ""}">
    </label>
    <!-- ROW CONTROLS -->
    <label style="display:flex; flex-direction:column; gap:4px;">
      <span style="font-size:12px; opacity:.85;">Row count</span>
      <input id="propRowCount" type="number" step="1" min="0"
             value="${Number.isFinite(bed.rowCount) ? bed.rowCount : 0}">
    </label>
    <label style="display:flex; flex-direction:column; gap:4px;">
      <span style="font-size:12px; opacity:.85;">Row direction</span>
      <select id="propRowDir">
        <option value="auto">Auto</option>
        <option value="vertical">Vertical</option>
        <option value="horizontal">Horizontal</option>
      </select>
    </label>
    <label style="display:flex; flex-direction:column; gap:4px;">
      <span style="font-size:12px; opacity:.85;">Row spacing (ft)</span>
      <input id="propRowSpacingFt" type="number" step="0.25" min="0.25"
             value="${Number.isFinite(bed.rowSpacingFt) ? bed.rowSpacingFt : 1}">
    </label>
  </div>
  `;

  // Set current values for selects
  const typeSel = panel.querySelector("#propBedType");
  if (typeSel) typeSel.value = bed.type || "raised";

  const rowDirSel = panel.querySelector("#propRowDir");
  if (rowDirSel) rowDirSel.value = bed.rowDir || "auto";

  // Auto-save + re-render helper
  const autoSave = () => {
    // Call the *global* autosave (avoid local recursion)
    if (typeof window !== "undefined" && typeof window.autoSave === "function") {
      window.autoSave();
      return;
    }
    // Fallbacks (in case global autoSave is unavailable in this scope/build)
    if (typeof savePropertyLayout === "function") {
      savePropertyLayout();
    }
    if (byId("layoutAutoSave")?.checked && typeof saveCurrentLayoutWithProperty === "function") {
      saveCurrentLayoutWithProperty();
    }
  };

  const rerenderMap = (() => {
    let rafId = 0;
    const getBedCountNow = () => {
      try {
        const d = (typeof readBedDimsFromInputs === "function") ? readBedDimsFromInputs() : null;
        const bc = d && Number.isFinite(d.bedCount) ? d.bedCount : null;
        if (bc != null) return bc;
      } catch (e) {}
      const v = parseInt(document.getElementById("layoutBedCount")?.value || "0", 10);
      return Number.isFinite(v) ? v : 0;
    };
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;

        const draw = () => {
          const bedW = parseFloat(document.getElementById("layoutBedW")?.value) || 4;
          const bedL = parseFloat(document.getElementById("layoutBedL")?.value) || 8;
          const bcNow = getBedCountNow();
          renderPropertySketch(bcNow, bedW, bedL);
        };

        // If the UI is mid-reflow (common right after rotate / drag-end),
        // the viewport can report an unusably small width for a single frame.
        // Wait one more frame in that case so the grid sizing stays stable.
        const viewport = document.getElementById("propertyViewport");
        const vw = viewport ? viewport.clientWidth : 0;
        if (vw && vw < 80) {
          requestAnimationFrame(draw);
          return;
        }

        draw();
      });
    };
  })();
  window.__pgRerenderMap = rerenderMap;

  // ─── Input Event Listeners ───────────────────────────────────────
  const nameInput = panel.querySelector("#propBedName");
  if (nameInput) {
    nameInput.addEventListener("input", () => {
      ensurePropertyStateInPlace(bedCount, propertyState);
      propertyState.beds[idx].name = (nameInput.value || "").trim() || `Bed ${idx + 1}`;
      autoSave();
      try { saveBeds(); } catch(e) {}
      rerenderMap();
    });
  }

  if (typeSel) {
    typeSel.addEventListener("change", () => {
      ensurePropertyStateInPlace(bedCount, propertyState);
      propertyState.beds[idx].type = typeSel.value || "raised";
      autoSave();
      try { saveBeds(); } catch(e) {}
      rerenderMap();
    });
  }

  const pathInput = panel.querySelector("#propBedPathFt");
  if (pathInput) {
    pathInput.addEventListener("change", () => {
      const v = parseFloat(pathInput.value);
      ensurePropertyStateInPlace(bedCount, propertyState);
      propertyState.beds[idx].pathFt = (Number.isFinite(v) && v >= 0) ? v : 2;
      autoSave();
      try { saveBeds(); } catch(e) {}
      rerenderMap();
    });
  }

  const wFtInput = panel.querySelector("#propBedWFt");
  if (wFtInput) {
    wFtInput.addEventListener("change", () => {
      const v = parseFloat(wFtInput.value);
      ensurePropertyStateInPlace(bedCount, propertyState);
      propertyState.beds[idx].wFt = (Number.isFinite(v) && v > 0) ? v : null;
      autoSave();
      try { saveBeds(); } catch(e) {}
      rerenderMap();
      renderPropertySelectedBedPanel(bedCount); // refresh panel to show new size
    });
  }

  const lFtInput = panel.querySelector("#propBedLFt");
  if (lFtInput) {
    lFtInput.addEventListener("change", () => {
      const v = parseFloat(lFtInput.value);
      ensurePropertyStateInPlace(bedCount, propertyState);
      propertyState.beds[idx].lFt = (Number.isFinite(v) && v > 0) ? v : null;
      autoSave();
      try { saveBeds(); } catch(e) {}
      rerenderMap();
      renderPropertySelectedBedPanel(bedCount);
    });
  }

  // Row controls
  const rowCountInput = panel.querySelector("#propRowCount");
  if (rowCountInput) {
    rowCountInput.addEventListener("change", () => {
      const v = parseInt(rowCountInput.value, 10);
      ensurePropertyStateInPlace(bedCount, propertyState);
      propertyState.beds[idx].rowCount = Number.isFinite(v) ? Math.max(0, v) : 0;
      autoSave();
      try { saveBeds(); } catch(e) {}
      rerenderMap();
      renderPropertySelectedBedPanel(bedCount);
    });
  }

  if (rowDirSel) {
    rowDirSel.addEventListener("change", () => {
      ensurePropertyStateInPlace(bedCount, propertyState);
      propertyState.beds[idx].rowDir = rowDirSel.value || "auto";
      autoSave();
      try { saveBeds(); } catch(e) {}
      rerenderMap();
    });
  }

  const rowSpacingInput = panel.querySelector("#propRowSpacingFt");
  if (rowSpacingInput) {
    rowSpacingInput.addEventListener("change", () => {
      const v = parseFloat(rowSpacingInput.value);
      ensurePropertyStateInPlace(bedCount, propertyState);
      propertyState.beds[idx].rowSpacingFt = (Number.isFinite(v) && v > 0) ? v : 1;
      autoSave();
      try { saveBeds(); } catch(e) {}
      rerenderMap();
    });
  }

  // Bed-level plan selector + populate action
  const bedPlanSel = panel.querySelector("#propBedPlanSelect");
  if (bedPlanSel) {
    // Always rebuild options so new plans appear without page refresh
    refreshBedPlanSelectOptions(bedPlanSel, effectivePlanId);

    const refresh = () => {
      try { refreshBedPlanSelectOptions(bedPlanSel, getBedPlanId(idx)); } catch (e) {}
    };
    bedPlanSel.addEventListener("focus", refresh);
    bedPlanSel.addEventListener("mousedown", refresh);

    bedPlanSel.addEventListener("change", () => {
      const pid = bedPlanSel.value || null;
      if (pid && isPlanIdUsedOnOtherBed(pid, idx)) {
        alert(`Plan "${getMyGardenPlanNameById(pid) || pid}" is already assigned to another bed. Choose a different plan.`);
        // Revert selection to the previously stored plan for this bed.
        try { bedPlanSel.value = getBedPlanId(idx) || ""; } catch (e) {}
        return;
      }
      setBedPlanId(idx, pid);
      autoSave();
      // Keep right-side squares panel in sync with plan name
      try { if (typeof renderSelectedBedGrid === "function") renderSelectedBedGrid(idx); } catch (e) {}
      // Re-render panel so labels/plan name text stays consistent
      try { renderPropertySelectedBedPanel(bedCount); } catch (e) {}
    });
  }
  const popBtn = panel.querySelector("#propPopulateBedBtn");
  if (popBtn) {
    popBtn.onclick = () => {
      const pid = bedPlanSel?.value || getBedPlanId(idx);
      if (pid && isPlanIdUsedOnOtherBed(pid, idx)) {
        alert(`Plan "${getMyGardenPlanNameById(pid) || pid}" is already assigned to another bed. Choose a different plan.`);
        return;
      }
      
      const pname = pid ? getMyGardenPlanNameById(pid) : "(no plan selected)";
      const ok = confirm(`Populate Bed ${idx + 1} with crops from "${pname}"? This will overwrite crops currently in this bed.`);
      if (!ok) return;
      populateBedFromPlan(idx, pid);
    };
  }

  // Buttons
  const rotBtn = panel.querySelector("#propRotateBtn");
  if (rotBtn) {
    rotBtn.onclick = () => {
      bedRot[idx] = bedRot?.[idx] ? 0 : 1;
      ensurePropertyStateInPlace(bedCount, propertyState);
      propertyState.beds[idx].rot = bedRot[idx] ? 1 : 0;
      autoSave();
      try { saveBeds(); } catch(e) {}
      rerenderMap();
      renderPropertySelectedBedPanel(bedCount);
    };
  }

  const addBtn = panel.querySelector("#propAddBedBtn");
  if (addBtn) {
    addBtn.onclick = () => {
      // When adding from a selected bed, auto-advance to the next unused plan
      // (prevents snapping back to MainGarden / accidental duplicates).
      const anchor =
        bedPlanSel?.value ||
        getBedPlanId(idx) ||
        getLastAssignedBedPlanId() ||
        getDefaultMyGardenPlanId() ||
        null;

      const pid =
        getNextUnusedMyGardenPlanIdAfter(anchor) ||
        getNextUnusedMyGardenPlanId() ||
        anchor ||
        null;

      if (typeof addBedFromCurrentPlan === "function") addBedFromCurrentPlan(pid);
    };
  }

  const removeBtn = panel.querySelector("#propRemoveBedBtn");
  if (removeBtn) {
    removeBtn.onclick = () => {
      // Prefer selection-aware delete (clears selection + removes any overlay).
      if (typeof removeSelectedBed === "function") return removeSelectedBed();
      if (typeof removeBed === "function") return removeBed();
    };
  }
  const br2 = panel.querySelector("#propBuildRefreshBtn");
  if (br2) br2.onclick = () => { try { render(); } catch (e) {} };
  const sv2 = panel.querySelector("#propSaveLayoutBtn");
  if (sv2) sv2.onclick = () => { try { save(); } catch (e) {} };
  const pr2 = panel.querySelector("#propPrintLayoutBtn");
  if (pr2) pr2.onclick = () => { try { print(); } catch (e) {} };
}

// ───────────────────────────────────────────────────────────────
// Obstacle Controls Panel (inside bedOffsetControls)
// ───────────────────────────────────────────────────────────────

function renderObstacleControls(bedCount) {
  const wrap = byId("bedOffsetControls");
  if (!wrap) return;

  ensurePropertyStateInPlace(bedCount, propertyState);
  const obs = propertyState.obstacles || [];

  // Create container if not already present
  let box = wrap.querySelector("#obstacleControls");
  if (!box) {
    box = document.createElement("div");
    box.id = "obstacleControls";
    box.style.padding = "10px";
    box.style.marginBottom = "10px";
    box.style.border = "1px solid rgba(255,255,255,0.15)";
    box.style.borderRadius = "10px";
    box.style.background = "rgba(0,0,0,0.18)";
    wrap.prepend(box);
  }

  // Header with add button + collapse toggle
  const listDisplay = obstaclePanelCollapsed ? "none" : "grid";
  const toggleLabel = obstaclePanelCollapsed ? "Expand" : "Collapse";
  box.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px;">
      <strong>Obstacles (${obs.length})</strong>
      <div style="display:flex; gap:8px; align-items:center;">
        <button type="button" id="toggleObstaclePanelBtn">${toggleLabel}</button>
        <button type="button" id="addObstacleBtn"> Create </button>
      </div>
    </div>
    <div id="obstacleList" style="display:${listDisplay}; gap:8px;"></div>
  `;

  const list = box.querySelector("#obstacleList");

  // Render each obstacle row
  obs.forEach((o, i) => {
    const row = document.createElement("div");
    row.className = "obstacle-row";
    // Responsive row layout: wraps naturally on small screens, stays inline on desktop
    row.style.display = "flex";
    row.style.flexWrap = "wrap";
    row.style.gap = "6px";
    row.style.alignItems = "center";
    row.innerHTML = `
      <input type="text" data-oi="${i}" data-k="name" value="${String((typeof o.name === "string") ? o.name : `Obstacle ${i + 1}`).replace(/"/g, "&quot;")}">
      <select data-oi="${i}" data-k="kind">
        <option value="shed">Shed</option>
        <option value="house">House</option>
        <option value="tree">Tree</option>
        <option value="pond">Pond</option>
        <option value="compost">Compost</option>
        <option value="fence">Fence</option>
        <option value="other">Other</option>
      </select>
      <input type="number" step="1" min="1" data-oi="${i}" data-k="wFt" value="${Number.isFinite(o.wFt) ? o.wFt : 10}">
      <input type="number" step="1" min="1" data-oi="${i}" data-k="lFt" value="${Number.isFinite(o.lFt) ? o.lFt : 10}">
      <button type="button" data-oi="${i}" data-act="del">Delete</button>
    `;
    list.appendChild(row);

    // Size controls so the row wraps cleanly on phones without overflowing
    try {
      const nameIn = row.querySelector('input[data-k="name"]');
      const kindIn = row.querySelector('select[data-k="kind"]');
      const wIn = row.querySelector('input[data-k="wFt"]');
      const lIn = row.querySelector('input[data-k="lFt"]');
      const delBtn = row.querySelector('button[data-act="del"]');

      if (nameIn) { nameIn.style.flex = "2 1 180px"; nameIn.style.minWidth = "160px"; }
      if (kindIn) { kindIn.style.flex = "1 1 140px"; kindIn.style.minWidth = "130px"; }
      if (wIn) { wIn.style.flex = "0 1 90px"; wIn.style.minWidth = "80px"; }
      if (lIn) { lIn.style.flex = "0 1 90px"; lIn.style.minWidth = "80px"; }
      if (delBtn) { delBtn.style.flex = "0 0 auto"; delBtn.style.marginLeft = "auto"; }
    } catch (e) {}

    // Set current kind
    const kindSel = row.querySelector('select[data-k="kind"]');
    if (kindSel) {
      kindSel.value = o.kind || o.type || "shed";
    }
  });

  // Auto-save + re-render helper
  const rerender = () => {
    const bedW = parseFloat(document.getElementById("layoutBedW")?.value) || 4;
    const bedL = parseFloat(document.getElementById("layoutBedL")?.value) || 8;
    // Rebuild the map first (it may clear/recreate UI around it), then rebuild the toolbar.
    renderPropertySketch(bedCount, bedW, bedL);
    renderBedOffsetControls(bedCount);
    autoSave();
  };

  // Change listeners for all inputs/selects
  box.querySelectorAll('input, select').forEach(input => {
    input.addEventListener("change", (e) => {
      const t = e.target;
      const oi = parseInt(t.dataset.oi, 10);
      const k = t.dataset.k;
      if (!Number.isFinite(oi) || !k) return;

      ensurePropertyStateInPlace(bedCount, propertyState);
      const o = propertyState.obstacles?.[oi];
      if (!o) return;

      if (k === "name") o.name = (t.value ?? "").trim();
      if (k === "kind") {
        o.kind = t.value || "shed";
        o.type = t.value; // keep both in sync
      }
      if (k === "wFt") o.wFt = Math.max(1, parseFloat(t.value) || 1);
      if (k === "lFt") o.lFt = Math.max(1, parseFloat(t.value) || 1);

      rerender();
    });
  });

  // Add / Delete buttons
  box.addEventListener("click", (e) => {
    const t = e.target;
    if (!t) return;

    if (t.id === "toggleObstaclePanelBtn") {
      obstaclePanelCollapsed = !obstaclePanelCollapsed;
      try { localStorage.setItem("pg_obstacle_panel_collapsed", obstaclePanelCollapsed ? "1" : "0"); } catch(e) {}
      renderBedOffsetControls(bedCount);
      return;
    }

    if (t.id === "addObstacleBtn") {
      ensurePropertyStateInPlace(bedCount, propertyState);
      propertyState.obstacles = propertyState.obstacles || [];
      propertyState.obstacles.push({
        id: `ob_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        name: `Obstacle ${propertyState.obstacles.length + 1}`,
        kind: "shed",
        wFt: 10,
        lFt: 10,
        offset: { x: 0, y: 0 }
      });
      rerender();
      return;
    }

    if (t.dataset.act === "del") {
      const oi = parseInt(t.dataset.oi, 10);
      if (!Number.isFinite(oi)) return;
      ensurePropertyStateInPlace(bedCount, propertyState);
      propertyState.obstacles = propertyState.obstacles || [];
      propertyState.obstacles.splice(oi, 1);
      rerender();
    }
  });
}

function renderBedOffsetControls(bedCount) {
  const wrap = byId("bedOffsetControls");
  if (!wrap) return;

  // Keep Obstacles under the property map (this wrapper lives under the map).
  // The selected-bed editor panel is mounted into the stats card via #layoutBedEditorMount.
  wrap.innerHTML = "";
  renderObstacleControls(bedCount);

  // Ensure the selected-bed editor exists/updates too (it will render into #layoutBedEditorMount when present).
  renderPropertySelectedBedPanel(bedCount);

  // If the editor was rendered, relocate it into the stats card mount.
  try { relocatePropertyToolbar(); } catch (e) {}
}


// ───────────────────────────────────────────────────────────────
// Final functions and DOMContentLoaded listener
// ───────────────────────────────────────────────────────────────

function save() {
  if (!editableState || !Array.isArray(editableState.used)) {
    if (!lastLayout || !Array.isArray(lastLayout.used)) {
      alert("Nothing to save yet — build a layout first.");
      return;
    }
    editableState = { ...lastLayout, used: [...lastLayout.used] };
  }

  const w = parseFloat(byId("layoutBedW")?.value) || editableState.w || 4;
  const l = parseFloat(byId("layoutBedL")?.value) || editableState.l || 8;
  const bedCount = Math.max(0, parseInt(byId("layoutBedCount")?.value || "0", 10) || 0);

  editableState.w = Math.max(1, Math.floor(w));
  editableState.l = Math.max(1, Math.floor(l));
  editableState.bedCount = bedCount;
  editableState.bedSq = editableState.w * editableState.l;

  // Save property layout globally first
  savePropertyLayout();

  // Then save only the crop data
  saveLayoutState({
    w: editableState.w,
    l: editableState.l,
    bedCount: editableState.bedCount,
    used: editableState.used
  });

  alert("Layout saved (crops per-plan, property global).");
}

function clearSaved() {
  clearSavedLayoutState();
  editableState = null;
  alert("Saved layout cleared.");
  render();
}

function assignMyGardenToBed(bedIndex) {
  // Back-compat wrapper: previously populated from the *current* My Garden plan.
  // New behavior: populate from this bed's selected plan (bed-level selection).
  const pid = byId("propBedPlanSelect")?.value || getBedPlanId(bedIndex);
  const pname = pid ? getMyGardenPlanNameById(pid) : "(no plan selected)";
  const ok = confirm(`Populate Bed ${bedIndex + 1} with crops from "${pname}"? This will overwrite crops currently in this bed.`);
  if (!ok) return;
  populateBedFromPlan(bedIndex, pid);
}

window.Layout = { render, print, init, save, clearSaved };

document.addEventListener("DOMContentLoaded", () => {
  // Prevent any stale/ghost bed overlays from persisting across hot reloads or partial DOM refreshes.
  // Overlays are always regenerated from `beds` via `renderBedOverlays()`.
  try {
    if (typeof clearAllBedOverlays === "function") {
      clearAllBedOverlays();
    } else {
      document.querySelectorAll('[id^="bed-overlay-"]').forEach(el => el.remove());
    }
  } catch (e) {}

  // IMPORTANT CHANGE (Jan 2026): Layout tab must not render or react to global plan tabs.
  hideLayoutPlanTabsUI();

  try { hideLayoutTopControlsUI(); } catch (e) {}

  init(); // builds the grid for the current plan

  // Bind bed selection (click/touch) once the viewport exists.
  try { installBedSelectionClickHandlers(); } catch (e) {}
  try { updateBedSelectionUI(); } catch (e) {}

  // Initial auto-fit so the property fills/centers correctly on first load.
  try { requestAnimationFrame(() => autoFitProperty()); } catch (e) {}

  // My Garden plans may hydrate after Layout initializes; refresh plan dropdown when ready.
  try { watchForMyGardenPlansReady(); } catch (e) {}

  // When property controls change, re-render
  const pw = byId("propertyWidth");
  const pl = byId("propertyLength");
  const ps = byId("propertyScale");
  const addBtn = byId("layoutAddBedBtn");
  const removeBtn = byId("layoutRemoveBedBtn");

  if (removeBtn) removeBtn.addEventListener("click", (typeof removeSelectedBed === "function") ? removeSelectedBed : removeBed);
  if (addBtn) addBtn.addEventListener("click", addBedFromCurrentPlan);

  // While typing dimensions, keep the map centered (input fires more often than change).
  const __pgInputFit = () => { try { autoFitProperty(); } catch(e) {} };
  [pw, pl, ps].forEach(el => {
    if (!el) return;
    el.addEventListener("input", __pgInputFit);
  });

  [pw, pl, ps].forEach(el => {
    if (!el) return;
    el.addEventListener("change", () => {
      if (window.Layout && typeof Layout.render === "function") {
        Layout.render();
        try { autoSave(); } catch(e) {}
      }
    });
  });
});

// Ensures the Property Map section cannot force the overall layout wider when the user increases
// property dimensions. The map surface can be larger, but it must scroll within its viewport.
function ensurePropertyMapLockStyle() {
  if (document.getElementById('pgPropertyLockStyle')) return;
  const st = document.createElement('style');
  st.id = 'pgPropertyLockStyle';
  st.textContent = `
    /* Allow grid items to shrink instead of expanding the whole page */
    #layoutSummaryWrap, #layoutSummaryWrap * { box-sizing: border-box; }
    #layoutSummaryWrap { max-width: 100%; }

    /* ===== Table / Inventory width fixes ===== */
    #table-wrapper table { min-width: 900px !important; }
    /* Inventory should fit the viewport */
    #inventoryTable { min-width: 0 !important; }


    /* Property map viewport created in JS */
    #propertyViewport, #propertyCanvasViewport, .propertyCanvasViewport, .property-viewport {
      min-width: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
      display: block !important;
      position: relative;
      overflow: auto !important; /* keep panning/scrolling functional */
      overscroll-behavior: contain;
    }
    #propertyViewport, #propertyCanvasViewport, .propertyCanvasViewport, .property-viewport { scrollbar-width: none; -ms-overflow-style: none; }
    #propertyViewport::-webkit-scrollbar, #propertyCanvasViewport::-webkit-scrollbar, .propertyCanvasViewport::-webkit-scrollbar, .property-viewport::-webkit-scrollbar { width: 0; height: 0; }


    /* The drawing surface (#propertyCanvas) must not be capped by legacy CSS (max-width / aspect-ratio) */
    #propertyCanvas.property-canvas,
    #propertyCanvas { max-width: none !important; aspect-ratio: auto !important; overflow: visible !important; }

    /* On CSS grid/flex layouts, these help prevent content-sized expansion */
    .layoutSummaryCell, .layoutSummaryWrap, .layoutSummary, .layoutGrid, .layoutRow, .layoutSection,
    .panel, .card { min-width: 0; }
  `;
  document.head.appendChild(st);
}

function installPropertyViewportObserver() {
  const vp = byId("propertyViewport");
  if (!vp || vp.dataset.pgViewportObserved) return;
  vp.dataset.pgViewportObserved = "1";

  // Re-render when the viewport size changes (tab switch, panel collapse/expand, orientation changes).
  let raf = 0;
  const schedule = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (typeof window.__pgRerenderMap === "function") window.__pgRerenderMap();
    });
  };

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(schedule);
    ro.observe(vp);
    vp.__pgResizeObserver = ro;
  }

  // Also refit after the viewport becomes visible again.
  if (window.IntersectionObserver) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) schedule();
      }
    }, { threshold: 0.01 });
    io.observe(vp);
    vp.__pgIntersectObserver = io;
  }

  window.addEventListener("orientationchange", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
}
