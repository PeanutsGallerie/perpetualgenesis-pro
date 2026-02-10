// micro.js (v6.5)
// Mobile / small-screen behavior augmentations for Layout tab.
// ===== local config (edit here) =====
const PG_MICRO_CFG = {
  // Gutter width: "full screens" vs "small screens"
  gutterPxDesktop: 75,      // px on desktop/tablet widths
  gutterPxMobile: 18,       // px on small screens
  mobileBreakpointPx: 768,  // <= this counts as "small screen"

  // Visuals
  borderRadiusPx: 20,       // rounds the gutter corners to match the card
  showGutters: false,       // set true to tint gutters for debugging

  // Auto-fit behavior for the property map viewport
  autoFitOnOpen: true,      // fit when Layout opens (unless user already interacted)
  fitMode: 'cover',         // 'cover' fills viewport (may overflow); 'contain' shows full property
  fitPaddingPx: 8,          // padding inside viewport when fitting
  refitIfSizeChanges: true, // refit when property size changes (if user hasn't interacted)
  fitEachOpen: false,       // true = refit each time Layout tab opens
};


function pgGetGutterPx() {
  try {
    const bp = PG_MICRO_CFG.mobileBreakpointPx ?? 768;
    const isSmall = (window.innerWidth || 0) <= bp;
    return isSmall ? (PG_MICRO_CFG.gutterPxMobile ?? 18) : (PG_MICRO_CFG.gutterPxDesktop ?? 28);
  } catch (e) {
    return 22;
  }
}

function pgApplyGutterSize(wrapEl) {
  if (!wrapEl) return;
  try {
    wrapEl.style.setProperty('--pg-gutter', pgGetGutterPx() + 'px');
  } catch (e) {}


};

// Load AFTER layout.js. Does not change core business logic.
// Adds:
//  - resize/orientation re-render safety
//  - touch double-tap rotate
//  - pinch-to-zoom + one-finger pan INSIDE the property viewport (prevents page zoom)
//  - hides scrollbars in the property viewport (use pan/zoom instead)
//  - prevents trackpad pinch-zoom (ctrl+wheel) within the viewport
//  - prevents Safari/iOS pinch-zoom within the viewport

(function () {

  // ───────────────────────────────────────────────────────────────
  // Mobile input focus guard (prevents keyboard opening then closing)
  // Stops layout/canvas handlers from stealing the tap/click that focuses inputs.
  // ───────────────────────────────────────────────────────────────
  function __pgIsFormField(el) {
    if (!el) return false;
    const t = el.tagName;
    return (t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || !!el.isContentEditable);
  }

  function __pgIsInLayoutEditor(el) {
    try {
      return !!(el && el.closest && (el.closest("#selectedBedPanel") || el.closest("#bedOffsetControls") || el.closest("#obstacleControls") || el.closest(".obstacle-row")));
    } catch (e) { return false; }
  }

  function __pgStop(ev) {
    ev.stopPropagation();
    if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
  }

  // Capture DOWN to prevent drag/selection from starting on inputs
  document.addEventListener("pointerdown", (ev) => {
    const t = ev.target;
    if (__pgIsFormField(t) || __pgIsInLayoutEditor(t)) __pgStop(ev);
  }, true);

  document.addEventListener("touchstart", (ev) => {
    const t = ev.target;
    if (__pgIsFormField(t) || __pgIsInLayoutEditor(t)) __pgStop(ev);
    // Important: do NOT preventDefault here; we want the browser to focus the field.
  }, { capture: true, passive: true });

  // Capture CLICK/END too—some handlers select/re-render on click or touchend and will blur focused fields.
  document.addEventListener("click", (ev) => {
    const t = ev.target;
    if (__pgIsFormField(t) || __pgIsInLayoutEditor(t)) __pgStop(ev);
  }, true);

  document.addEventListener("touchend", (ev) => {
    const t = ev.target;
    if (__pgIsFormField(t) || __pgIsInLayoutEditor(t)) __pgStop(ev);
  }, { capture: true, passive: true });

  "use strict";

  function debounce(fn, wait) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function rafThrottle(apply) {
    let scheduled = false;
    let lastArgs = null;
    return function (...args) {
      lastArgs = args;
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        apply(...(lastArgs || []));
      });
    };
  }

  function isLayoutVisible() {
    const el = document.getElementById("layout");
    return !!(el && el.classList && el.classList.contains("active"));
  }

  function getCanvas() {
    return document.getElementById("propertyCanvas");
  }

  function getViewportForCanvas(canvas) {
    if (!canvas) return null;
    // Prefer explicit id, else closest viewport wrapper.
    return document.getElementById("propertyViewport") || canvas.closest(".propertyCanvasViewport") || canvas.parentElement;
  }

  // --- Resize robustness ---
  function installLayoutResizeReRender() {
    if (window.__pgMicroResizeInstalled) return;
    window.__pgMicroResizeInstalled = true;

    const rerender = debounce(() => {
      try {
        const canvas = getCanvas();
        if (!isLayoutVisible() && !canvas) return;
        if (window.Layout && typeof window.Layout.render === "function") {
          window.Layout.render();
        } else if (window.Layout && typeof window.Layout.init === "function") {
          window.Layout.init();
        }
      } catch (e) {
        // swallow
      }
    }, 150);

    window.addEventListener("resize", rerender, { passive: true });
    window.addEventListener("orientationchange", rerender, { passive: true });
  }

  // --- Touch-friendly rotate ---
  function installDoubleTapRotate() {
    if (window.__pgMicroDoubleTapInstalled) return;
    window.__pgMicroDoubleTapInstalled = true;

    let lastTapTime = 0;
    let lastTapTarget = null;
    let down = null;

    function getBedBlockFromEventTarget(t) {
      if (!t) return null;
      return t.closest ? t.closest(".property-bed-block") : null;
    }

    document.addEventListener(
      "pointerdown",
      (ev) => {
        const bed = getBedBlockFromEventTarget(ev.target);
        if (!bed) return;
        if (ev.pointerType !== "touch" && ev.pointerType !== "pen") return;
        down = { x: ev.clientX, y: ev.clientY, t: Date.now(), bed };
      },
      { passive: true }
    );

    document.addEventListener(
      "pointerup",
      (ev) => {
        if (!down) return;
        const bed = getBedBlockFromEventTarget(ev.target);
        if (!bed || bed !== down.bed) {
          down = null;
          return;
        }
        if (ev.pointerType !== "touch" && ev.pointerType !== "pen") {
          down = null;
          return;
        }

        const dx = Math.abs(ev.clientX - down.x);
        const dy = Math.abs(ev.clientY - down.y);
        const moved = dx > 10 || dy > 10;
        const now = Date.now();

        const tapLike = !moved && now - down.t < 350;
        if (!tapLike) {
          down = null;
          return;
        }

        const isDoubleTap = bed === lastTapTarget && now - lastTapTime < 350;

        if (isDoubleTap) {
          try {
            if (typeof bed.ondblclick === "function") {
              bed.ondblclick(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
            } else {
              bed.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
            }
          } catch (e) {
            // swallow
          }
          lastTapTime = 0;
          lastTapTarget = null;
        } else {
          lastTapTime = now;
          lastTapTarget = bed;
        }
        down = null;
      },
      { passive: true }
    );
  }

  // --- Pinch zoom + pan inside the property viewport ---
  function installPropertyViewportZoom() {
    if (window.__pgMicroZoomInstalled) return;
    window.__pgMicroZoomInstalled = true;

    // Persistent zoom state
    const Z = (window.__pgMicroZoomState = window.__pgMicroZoomState || {
      scale: 1,
      min: 0.6,
      max: 10.0,
      baseW: null,
      baseH: null,
      innerId: "propertyCanvasInner",
      didAutoFit: false,
      didInteract: false,
      lastBaseW: null,
      lastBaseH: null,
      lastCanvas: null,
    });

    function clamp(v, lo, hi) {
      return Math.max(lo, Math.min(hi, v));
    }

    function updateZoomLimits() {
      try {
        const bp = PG_MICRO_CFG.mobileBreakpointPx ?? 768;
        const isSmall = (window.innerWidth || 0) <= bp;
        const maxCfg = isSmall ? (PG_MICRO_CFG.maxScaleMobile ?? 10.0) : (PG_MICRO_CFG.maxScaleDesktop ?? 100.0);
        if (typeof maxCfg === 'number' && maxCfg > 0) Z.max = maxCfg;
      } catch (e) {}
    }


    function ensureInnerWrapper(canvas, viewport) {
      if (!canvas || !viewport) return null;

      // If already wrapped, return it
      const existing = document.getElementById(Z.innerId);
      if (existing && existing.contains(canvas)) return existing;

      // IMPORTANT: layout.js (v2) must use canvas.closest('.propertyCanvasViewport')
      // so wrapping doesn't break sizing logic.
      const inner = document.createElement("div");
      inner.id = Z.innerId;
      inner.style.position = "relative";
      inner.style.display = "inline-block";
      inner.style.transformOrigin = "0 0";

      // Insert inner where canvas currently is
      viewport.insertBefore(inner, canvas);
      inner.appendChild(canvas);

      return inner;
    }

    function readBaseSize(canvas) {
      if (!canvas) return;
      // Use computed size (not transformed) as base
      const cs = getComputedStyle(canvas);
      const w = parseFloat(cs.width) || canvas.offsetWidth || 0;
      const h = parseFloat(cs.height) || canvas.offsetHeight || 0;
      if (w > 0 && h > 0) {
        Z.baseW = w;
        Z.baseH = h;
      }
    }

    function applyScale(canvas, inner, scale) {
      if (!canvas || !inner) return;

      updateZoomLimits();

      Z.scale = clamp(scale, Z.min, Z.max);

      // Ensure base size is known
      if (!Z.baseW || !Z.baseH) readBaseSize(canvas);
      const baseW = Z.baseW || canvas.offsetWidth || 0;
      const baseH = Z.baseH || canvas.offsetHeight || 0;

      // Make scroll size reflect zoom (inner defines scroll extents)
      inner.style.width = Math.max(1, baseW * Z.scale) + "px";
      inner.style.height = Math.max(1, baseH * Z.scale) + "px";

      // Visually scale the canvas contents
      canvas.style.position = "absolute";
      canvas.style.left = "0";
      canvas.style.top = "0";
      canvas.style.transformOrigin = "0 0";
      canvas.style.transform = `scale(${Z.scale})`;
      canvas.style.willChange = "transform";

      // Sync layout.js drag math (layout uses __pgCanvasScale if present)
      try {
        window.__pgCanvasScale = Z.scale;
      } catch (e) {
        // ignore
      }
    }

    
    function computeFitScale(canvas, viewport) {
      updateZoomLimits();
      if (!canvas || !viewport) return null;
      if (!Z.baseW || !Z.baseH) readBaseSize(canvas);
      const baseW = Z.baseW || canvas.offsetWidth || 0;
      const baseH = Z.baseH || canvas.offsetHeight || 0;
      const vpW = viewport.clientWidth || 0;
      const vpH = viewport.clientHeight || 0;
      if (baseW <= 0 || baseH <= 0 || vpW <= 0 || vpH <= 0) return null;

      const pad = PG_MICRO_CFG.fitPaddingPx ?? 8;
      const availW = Math.max(1, vpW - pad * 2);
      const availH = Math.max(1, vpH - pad * 2);

      // Fit scale based on mode.
      const mode = (PG_MICRO_CFG.fitMode || 'cover').toLowerCase();
      const s = (mode === 'contain')
        ? Math.min(availW / baseW, availH / baseH)
        : Math.max(availW / baseW, availH / baseH);
      return clamp(s, Z.min, Z.max);
    }

    function centerViewport(viewport, inner) {
      if (!viewport || !inner) return;
      // center the scroll position on the content
      const x = Math.max(0, (inner.scrollWidth - viewport.clientWidth) / 2);
      const y = Math.max(0, (inner.scrollHeight - viewport.clientHeight) / 2);
      viewport.scrollLeft = x;
      viewport.scrollTop = y;
    }

    function maybeAutoFit(canvas, viewport, inner) {
      if (!(PG_MICRO_CFG.autoFitOnOpen)) return;
      if (!canvas || !viewport || !inner) return;

      // Track base size; if it changes and user hasn't interacted, allow refit.
      const baseW = Z.baseW || canvas.offsetWidth || 0;
      const baseH = Z.baseH || canvas.offsetHeight || 0;
      const sizeChanged = (Z.lastBaseW && Z.lastBaseH) ? (baseW !== Z.lastBaseW || baseH !== Z.lastBaseH) : true;
      Z.lastBaseW = baseW;
      Z.lastBaseH = baseH;

      if (Z.didInteract) return;

      const allowRefit = (PG_MICRO_CFG.refitIfSizeChanges ?? true) && sizeChanged;
      const shouldFit = !Z.didAutoFit || allowRefit;

      const s = computeFitScale(canvas, viewport);
      if (!s) return;

      // If we previously auto-fit with a low max scale, and later increase max,
      // we still want to "boost" to the new fit scale (unless the user interacted).
      const needsBoost = Math.abs((Z.scale || 1) - s) > 0.02;

      if (!shouldFit && !needsBoost) return;

      applyScale(canvas, inner, s);
      centerViewport(viewport, inner);
      Z.didAutoFit = true;
    }

function rebindAfterRender() {
      const canvas = getCanvas();
      if (!canvas) return;
      const viewport = getViewportForCanvas(canvas);
      if (!viewport) return;

      // Wrap viewport so we can provide page-scroll gutters on left/right
      // (prevents the 'trapped' feeling when zoomed and provides a visible edge).
      const wrap = (function ensureViewportWrap(vp) {
        if (!vp) return null;
        if (vp.parentElement && vp.parentElement.classList && vp.parentElement.classList.contains('pg-viewport-wrap')) {
          return vp.parentElement;
        }

        const w = document.createElement('div');
        w.className = 'pg-viewport-wrap';
        // Flex layout so gutters are real space (not overlay)
        w.style.display = 'flex';
        w.style.flexDirection = 'row';
        w.style.alignItems = 'stretch';
        w.style.position = 'relative';
        w.style.width = '100%';
        w.style.boxSizing = 'border-box';
        w.style.borderRadius = (PG_MICRO_CFG.borderRadiusPx ?? 12) + 'px';
        w.style.overflow = 'hidden'; // rounds gutter corners (no visible blocks)

        // Create gutters as siblings
        const make = (side) => {
          const g = document.createElement('div');
          g.className = 'pg-page-scroll-gutter pg-page-scroll-gutter-' + side;
          g.style.flex = '0 0 var(--pg-gutter, 22px)';
          g.style.width = 'var(--pg-gutter, 22px)';
          // Round outer corners to match the card
          if (side === 'left') {
            g.style.borderTopLeftRadius = (PG_MICRO_CFG.borderRadiusPx ?? 12) + 'px';
            g.style.borderBottomLeftRadius = (PG_MICRO_CFG.borderRadiusPx ?? 12) + 'px';
          } else {
            g.style.borderTopRightRadius = (PG_MICRO_CFG.borderRadiusPx ?? 12) + 'px';
            g.style.borderBottomRightRadius = (PG_MICRO_CFG.borderRadiusPx ?? 12) + 'px';
          }
          g.style.background = 'transparent';
          g.style.touchAction = 'pan-y';
      if (PG_MICRO_CFG.showGutters) { g.style.background = 'rgba(0,255,255,.06)'; g.style.boxShadow='inset 0 0 0 1px rgba(0,255,255,.18)'; }
          g.style.pointerEvents = 'auto';
          return g;
        };

        const left = make('left');
        const right = make('right');

        // Insert wrapper in DOM and move viewport inside
        vp.parentNode.insertBefore(w, vp);
        w.appendChild(left);
        w.appendChild(vp);
        w.appendChild(right);

        // Ensure viewport flexes and doesn't overflow wrapper
        vp.style.flex = '1 1 auto';
        vp.style.minWidth = '0';

        // On desktop / mouse, don't block clicks near edges
        try {
          const fine = window.matchMedia && window.matchMedia('(pointer:fine)').matches;
          if (fine) {
            left.style.pointerEvents = 'none';
            right.style.pointerEvents = 'none';
          }
        } catch (e) {}

        return w;
      })(viewport);

      // Allow user configuration of gutter width via CSS var or JS constant.
      // If you want to change it in JS, update this value.
      try {
        if (wrap) pgApplyGutterSize(wrap);
      } catch (e) {}


      // Prevent browser page-zoom gestures on the viewport
      viewport.style.touchAction = "none";
      viewport.style.overscrollBehavior = "contain";

      // Hide scrollbars in the viewport (we pan via scrollLeft/Top).
      // This avoids the "double scrollbars" look on small screens.
      viewport.classList.add("pg-micro-viewport");
      ensureMicroViewportStyles();
      installViewportGestureGuards(viewport);

      const inner = ensureInnerWrapper(canvas, viewport);
      if (!inner) return;

      // Base size may have changed after render; update and reapply
      readBaseSize(canvas);
      // Auto-fit once so the map fills the available viewport without requiring pinch-zoom.
      
      // If we are binding to a new canvas instance, reset auto-fit and interaction state.
      if (Z.lastCanvas !== canvas) {
        Z.lastCanvas = canvas;
        Z.didAutoFit = false;
        Z.didInteract = false;
        Z.baseW = null;
        Z.baseH = null;
        Z.scale = 1;
      }

      // Optionally refit each time Layout tab opens (configurable)
      if (PG_MICRO_CFG.fitEachOpen && isLayoutVisible()) {
        Z.didAutoFit = false;
        Z.didInteract = false;
      }

updateZoomLimits();

      // Run auto-fit after layout settles (avoids measuring too early).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            readBaseSize(canvas);
            updateZoomLimits();
            maybeAutoFit(canvas, viewport, inner);
          } catch (e) {}
          // Ensure current scale is applied (in case auto-fit is disabled).
          applyScale(canvas, inner, Z.scale);
        });
      });

      // Keep a reference for gesture handler
      window.__pgMicroZoomEls = { canvas, viewport, inner, wrap };
      // Re-affirm refs after deferred scaling.
      requestAnimationFrame(() => { try { window.__pgMicroZoomEls = { canvas, viewport, inner, wrap }; } catch(e){} });
      try { if (wrap) pgApplyGutterSize(wrap); } catch(e) {}
    }

    function ensureMicroViewportStyles() {
      if (document.getElementById("pgMicroViewportStyles")) return;
      const st = document.createElement("style");
      st.id = "pgMicroViewportStyles";
      st.textContent = `
        .pg-micro-viewport{ scrollbar-width:none; -ms-overflow-style:none; box-shadow: inset 0 0 0 1px rgba(0,255,255,.25); border-radius: 12px; }
        .pg-viewport-wrap{ overflow: visible; }
        .pg-micro-viewport::-webkit-scrollbar{ width:0; height:0; }
      `;
      document.head.appendChild(st);
    }

    // iOS Safari doesn't fully honor pointer-event preventDefault for pinch.
    // Trackpad pinch on desktop emits wheel+ctrlKey. We block both INSIDE the viewport.
    function installViewportGestureGuards(viewport) {
      if (!viewport || viewport.dataset.pgMicroGuards === "1") return;
      viewport.dataset.pgMicroGuards = "1";

      // Touch pinch guard
      viewport.addEventListener(
        "touchstart",
        (e) => {
          if (e.touches && e.touches.length > 1) e.preventDefault();
        },
        { passive: false }
      );
      viewport.addEventListener(
        "touchmove",
        (e) => {
          if (e.touches && e.touches.length > 1) e.preventDefault();
        },
        { passive: false }
      );

      // iOS gesture events (Safari)
      viewport.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
      viewport.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
      viewport.addEventListener("gestureend", (e) => e.preventDefault(), { passive: false });

      // Trackpad pinch / browser zoom guard
      viewport.addEventListener(
        "wheel",
        (e) => {
          // ctrlKey on Windows/Linux; metaKey sometimes on Mac
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
          }
        },
        { passive: false }
      );
    }

    // Wrap Layout.render so zoom survives re-renders
    (function wrapLayoutRender() {
      if (window.__pgMicroLayoutRenderWrapped) return;
      window.__pgMicroLayoutRenderWrapped = true;

      const L = window.Layout;
      if (!L) return;

      const origRender = typeof L.render === "function" ? L.render.bind(L) : null;
      if (origRender) {
        L.render = function (...args) {
          const out = origRender(...args);
          try {
            rebindAfterRender();
          } catch (e) {}
          return out;
        };
      }

      const origInit = typeof L.init === "function" ? L.init.bind(L) : null;
      if (origInit) {
        L.init = function (...args) {
          const out = origInit(...args);
          try {
            rebindAfterRender();
          } catch (e) {}
          return out;
        };
      }
    })();

    // Gesture state
    const pointers = new Map();
    let mode = null; // 'pan' | 'pinch'
    let panStart = null;
    let pinchStart = null;

    const applyPan = rafThrottle((viewport, targetScrollLeft, targetScrollTop) => {
      viewport.scrollLeft = targetScrollLeft;
      viewport.scrollTop = targetScrollTop;
    });

    const applyZoomFrame = rafThrottle((viewport, inner, canvas, nextScale, midX, midY, contentX, contentY) => {
      // Apply scale
      applyScale(canvas, inner, nextScale);
      // Recenter on the same content point
      const newScrollLeft = contentX * Z.scale - midX;
      const newScrollTop = contentY * Z.scale - midY;
      viewport.scrollLeft = newScrollLeft;
      viewport.scrollTop = newScrollTop;
    });

    function isInteractiveTarget(t) {
      if (!t || !t.closest) return false;
      // if user starts on a bed or obstacle, do NOT hijack single-finger gestures
      return !!t.closest(".property-bed-block, .property-obstacle-block, .obstacle-row, #obstacleControls");
    }

    function dist(a, b) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return Math.hypot(dx, dy);
    }

    function midpoint(a, b) {
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    function onPointerDown(ev) {
      const els = window.__pgMicroZoomEls;
      if (!els || !els.viewport || !els.canvas || !els.inner) return;

      // Only act when layout is visible
      if (!isLayoutVisible()) return;

      // Only capture gestures that begin within the viewport
      if (!els.viewport.contains(ev.target)) return;

      // Track pointer
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, t: ev.pointerType });

      try {
        ev.target.setPointerCapture && ev.target.setPointerCapture(ev.pointerId);
      } catch (e) {}

      if (pointers.size === 1) {
        if (isInteractiveTarget(ev.target)) {
          // Let layout.js handle bed/obstacle dragging
          mode = null;
          panStart = null;
          return;
        }
        mode = "pan";
        Z.didInteract = true;
        panStart = {
          x: ev.clientX,
          y: ev.clientY,
          scrollLeft: els.viewport.scrollLeft,
          scrollTop: els.viewport.scrollTop,
        };

        // prevent page scrolling/zooming and text selection
        ev.preventDefault();
      } else if (pointers.size === 2) {
        mode = "pinch";
        Z.didInteract = true;
        const [p1, p2] = Array.from(pointers.values());
        const m = midpoint(p1, p2);
        const rect = els.viewport.getBoundingClientRect();
        const midX = m.x - rect.left;
        const midY = m.y - rect.top;

        pinchStart = {
          startScale: Z.scale,
          startDist: dist(p1, p2) || 1,
          midX,
          midY,
          // content coordinates at start
          contentX: (els.viewport.scrollLeft + midX) / Z.scale,
          contentY: (els.viewport.scrollTop + midY) / Z.scale,
        };

        // prevent browser pinch zoom
        ev.preventDefault();
        ev.stopPropagation();
      }
    }

    function onPointerMove(ev) {
      const els = window.__pgMicroZoomEls;
      if (!els || !els.viewport || !els.canvas || !els.inner) return;
      if (!pointers.has(ev.pointerId)) return;

      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, t: ev.pointerType });

      if (mode === "pan" && panStart && pointers.size === 1) {
        const dx = ev.clientX - panStart.x;
        const dy = ev.clientY - panStart.y;
        const targetLeft = panStart.scrollLeft - dx;
        const targetTop = panStart.scrollTop - dy;
        applyPan(els.viewport, targetLeft, targetTop);
        ev.preventDefault();
        return;
      }

      if (mode === "pinch" && pinchStart && pointers.size >= 2) {
        const [p1, p2] = Array.from(pointers.values());
        const d = dist(p1, p2) || 1;
        const raw = pinchStart.startScale * (d / pinchStart.startDist);
        const next = clamp(raw, Z.min, Z.max);

        applyZoomFrame(
          els.viewport,
          els.inner,
          els.canvas,
          next,
          pinchStart.midX,
          pinchStart.midY,
          pinchStart.contentX,
          pinchStart.contentY
        );

        ev.preventDefault();
        ev.stopPropagation();
      }
    }

    function onPointerUp(ev) {
      if (pointers.has(ev.pointerId)) pointers.delete(ev.pointerId);

      if (pointers.size < 2 && mode === "pinch") {
        mode = null;
        pinchStart = null;
      }
      if (pointers.size === 0) {
        mode = null;
        panStart = null;
        pinchStart = null;
      }
    }

    // Attach listeners (capture phase ensures we can prevent page zoom)
    document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: false });
    document.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
    document.addEventListener("pointerup", onPointerUp, { capture: true, passive: true });
    document.addEventListener("pointercancel", onPointerUp, { capture: true, passive: true });

    // Initial bind once DOM is ready (and whenever layout renders)
    const bindNow = debounce(() => {
      try {
        rebindAfterRender();
      } catch (e) {}
    }, 50);

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindNow);
    } else {
      bindNow();
    }
  }

  // --- Boot ---
  function boot() {
    installLayoutResizeReRender();
    installDoubleTapRotate();
    installPropertyViewportZoom();

    // If layout already rendered before micro boot, rebind now
    try {
      const c = getCanvas();
      if (c) {
        const vp = getViewportForCanvas(c);
        if (vp) {
          vp.style.touchAction = "none";
        }
      }
    } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
