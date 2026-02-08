    function calculateCropDates(cropName, referenceDate) {
    const adjusted = getAdjustedReference(referenceDate);
    const data = cropData[cropName];
    if (!data || !adjusted) return { start: 'Enter reference date', transplant: '', harvest: '' };

    const { min: tMin, max: tMax, after } = parseTiming(data.timing);
    const sign = after ? 1 : -1;
    const transFrom = addDays(adjusted, tMin * 7 * sign);
    const transTo = addDays(adjusted, tMax * 7 * sign);
    const transMin = new Date(Math.min(transFrom, transTo));
    const transMax = new Date(Math.max(transFrom, transTo));
    const transplant = tMin === tMax ? formatDate(transFrom) : `${formatDate(transMin)}–${formatDate(transMax)}`;

    const weeks = parseWeeks(data.weeks);
    const startFrom = addDays(transFrom, -weeks.max * 7);
    const startTo = addDays(transTo, -weeks.min * 7);
    const startMin = new Date(Math.min(startFrom, startTo));
    const startMax = new Date(Math.max(startFrom, startTo));
    const start = weeks.min === 0 ? 'Direct sow/plant' : `${formatDate(startMin)}–${formatDate(startMax)}`;

    const mat = parseMaturity(data.maturity);
    const harvestFrom = addDays(transMin, mat.min);
    const harvestTo = addDays(transMax, mat.max);
    const harvest = mat.min === 0 ? data.maturity : `${formatDate(harvestFrom)}–${formatDate(harvestTo)}`;

    return { start, transplant, harvest };
}

function renderTimeline() {
    renderPlanTabs('timeline');
    const rowsDiv = document.getElementById('timelineRows');
    const tipsDiv = document.getElementById('perpetualTips');
    rowsDiv.innerHTML = '';
    tipsDiv.innerHTML = '<strong>Perpetual Harvest Tips:</strong> Crops with "Every X weeks" in succession tips are ideal for staggered planting. Overlapping bars show continuous availability!';

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const today = new Date();
    const curMonth = today.getMonth();
    const orderedMonths = months.slice(curMonth).concat(months.slice(0, curMonth));

    const labelsDiv = document.getElementById('monthLabels');
    labelsDiv.innerHTML = '';
    orderedMonths.forEach(m => {
        const d = document.createElement('div');
        d.textContent = m;
        labelsDiv.appendChild(d);
    });

    const refStr = localStorage.getItem('myReferenceDate');
    const refDate = refStr ? parseDate(refStr) : null;
    const entries = getCurrentEntries('timeline');

    if (!refDate || entries.length === 0) {
        rowsDiv.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:200px 0; color:var(--text-light); font-size:1.3em;">No plantings or reference date</div>';
        return;
    }

    const sorted = [...entries].sort((a, b) => {
        const da = calculateCropDates(a.crop, parseDate(a.referenceDate) || refDate);
        const db = calculateCropDates(b.crop, parseDate(b.referenceDate) || refDate);
        const sa = da.start === 'Direct sow/plant' ? refDate : parseDate(da.start.split('–')[0].trim()) || refDate;
        const sb = db.start === 'Direct sow/plant' ? refDate : parseDate(db.start.split('–')[0].trim()) || refDate;
        return sa - sb;
    });

    const year = today.getFullYear();
    const daysInMonths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const totalDays = isLeapYear(year) ? 366 : 365;

    const calcRotatedPercent = (date) => {
        if (!date || isNaN(date.getTime())) return 0;
        const m = date.getMonth();
        const d = date.getDate() - 1;
        const rotated = (m - curMonth + 12) % 12;
        let prev = 0;
        for (let i = 0; i < rotated; i++) prev += daysInMonths[(curMonth + i) % 12];
        const currentMonthDays = daysInMonths[(curMonth + rotated) % 12];
        return ((prev + d) / totalDays) * 100;
    };

    const parseRange = (str) => {
        if (!str || str === 'Direct sow/plant' || !str.includes('/')) return {start: null, end: null};
        const parts = str.split('–');
        const s = parseDate(parts[0].trim());
        const e = parts.length > 1 ? parseDate(parts[1].trim()) : s;
        return {start: s, end: e};
    };

    sorted.forEach(entry => {
        const dates = calculateCropDates(entry.crop, parseDate(entry.referenceDate) || refDate);
        const data = cropData[entry.crop];
        const prog = progressData[entry.id] || {};

const row = document.createElement('div');
row.className = 'timeline-row';

const label = document.createElement('div');
label.className = 'crop-label';

// NEW: consistent “Batch X” logic with My Garden
const sameCrop = sorted.filter(e => e.crop === entry.crop);
let instance = '';
if (sameCrop.length > 1) {
  const idx = sameCrop.findIndex(e => e.id === entry.id);
  if (idx !== -1) {
    instance = ` (Batch ${idx + 1})`;
  }
}

label.textContent = entry.crop + instance;
row.appendChild(label);



        const barContainer = document.createElement('div');
        barContainer.className = 'bar-container';

        const indoor = parseRange(dates.start);
        const transplant = parseRange(dates.transplant);
        const harvest = parseRange(dates.harvest);

        const createBar = (range, color, text) => {
            if (!range.start || !range.end) return;
            const left = calcRotatedPercent(range.start);
            let width = calcRotatedPercent(range.end) - left;
            if (width < 2) width = 2;
            // Milestones are often just a few days/weeks wide, which makes labels unreadable.
            // Give them a sensible minimum width up front; we still fine-tune later to fit text exactly.
            if (text === 'Transplant' && width < 10) width = 10;
            if (text === 'Start Indoors' && width < 13) width = 13;
            const bar = document.createElement('div');
            bar.className = 'timeline-bar';
            bar.style.setProperty('--bar-left', left + '%');
            bar.style.setProperty('--bar-width', width + '%');
            bar.style.background = color;
            bar.textContent = text;
            // Store original geometry so we can safely expand bars later to fit label text
            bar.dataset.origLeft = String(left);
            bar.dataset.origWidth = String(width);
            // Milestone bars are usually very short ranges; reduce padding a bit so labels fit easier
            if (text === 'Start Indoors' || text === 'Transplant') {
                bar.classList.add('milestone');
                // Keep inline styles minimal; sizing is handled by the fitLabels pass.
                // Left-align avoids the “clipped from both sides” look that happens with centered flex text.
                bar.style.justifyContent = 'flex-start';
                bar.style.padding = '0 12px';
                bar.style.fontSize = '0.85em';
                bar.style.textOverflow = 'clip';
            }
            bar.title = `${entry.crop} • ${text}: ${formatDate(range.start)}–${formatDate(range.end)}`;
            barContainer.appendChild(bar);
        };

        // Expands short bars so the full label fits inside the colored pill (no clipped text)
        // Uses canvas text measurement (more reliable than scrollWidth for flex-centered labels).
        const fitLabelsInRow = () => {
            const cw = barContainer.clientWidth;
            if (!cw) return;

            const measureTextPx = (text, el) => {
                const canvas = fitLabelsInRow._canvas || (fitLabelsInRow._canvas = document.createElement('canvas'));
                const ctx = canvas.getContext('2d');
                const cs = window.getComputedStyle(el);
                // Prefer full font shorthand if present.
                const font = cs.font && cs.font !== '' ? cs.font : `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
                ctx.font = font;
                return ctx.measureText(text).width;
            };

            const bars = barContainer.querySelectorAll('.timeline-bar');
            bars.forEach((bar) => {
                const origLeft = parseFloat(bar.dataset.origLeft || '0') || 0;
                const origWidth = parseFloat(bar.dataset.origWidth || '0') || 0;

                // Only force-fit milestone labels (Start Indoors / Transplant). Others are long enough.
                if (!bar.classList.contains('milestone')) return;

                const cs = window.getComputedStyle(bar);
                const padL = parseFloat(cs.paddingLeft) || 0;
                const padR = parseFloat(cs.paddingRight) || 0;
                // Add extra slack so bold glyphs don't get visually clipped at the edges.
                const neededPx = Math.ceil(measureTextPx(bar.textContent || '', bar) + padL + padR + 26);
                const currentPx = bar.getBoundingClientRect().width;
                if (neededPx <= currentPx + 1) return;

                const neededPct = (neededPx / cw) * 100;
                let newWidth = Math.max(origWidth, neededPct);
                if (newWidth > 100) newWidth = 100;

                // Keep the bar centered on its original date range, then clamp within bounds.
                const center = origLeft + (origWidth / 2);
                let newLeft = center - (newWidth / 2);
                if (newLeft < 0) newLeft = 0;
                if (newLeft + newWidth > 100) newLeft = 100 - newWidth;

                bar.style.setProperty('--bar-left', newLeft + '%');
                bar.style.setProperty('--bar-width', newWidth + '%');
            });
        };

        if (indoor.start) createBar(indoor, 'linear-gradient(90deg, #6a5acd, #483d8b)', 'Start Indoors');
        if (transplant.start) createBar(transplant, 'linear-gradient(90deg, #32cd32, #228b22)', 'Transplant');
        if (harvest.start) createBar(harvest, 'linear-gradient(90deg, #ffa500, #ff8c00)', 'Harvest');
        if (transplant.end && harvest.start && transplant.end < harvest.start) {
            createBar({start: transplant.end, end: harvest.start}, 'linear-gradient(90deg, rgba(169,169,169,0.5), rgba(128,128,128,0.5))', 'Growing');
        }

        const addMarker = (dateStr, label) => {
            const d = parseDate(dateStr);
            if (d) {
                const p = calcRotatedPercent(d);
                const marker = document.createElement('div');
                marker.className = 'progress-marker';
                marker.style.setProperty('--marker-left', p + '%');
                marker.setAttribute('data-date', formatDate(d));
                marker.title = `${entry.crop}: ${label}`;
                barContainer.appendChild(marker);
            }
        };

        if (prog.started) addMarker(prog.startedDate || formatDate(today), 'Seeds Started');
        if (prog.transplanted) addMarker(prog.transplantedDate || formatDate(today), 'Transplanted');
        if (prog.harvested) addMarker(prog.harvestedDate || formatDate(today), 'Harvested');

        if (barContainer.children.length === 0) {
            const msg = document.createElement('div');
            msg.style.cssText = 'height:70px;display:flex;align-items:center;justify-content:center;color:var(--text-light);font-style:italic;';
            msg.textContent = 'Direct sow – no indoor start';
            barContainer.appendChild(msg);
        }

        row.appendChild(barContainer);
        rowsDiv.appendChild(row);

        // After layout, ensure milestone labels (Start Indoors / Transplant) fully fit in their colored bars.
        // Two frames makes this resilient to late layout/font changes.
        requestAnimationFrame(() => requestAnimationFrame(fitLabelsInRow));

        // Re-fit when the viewport changes (rotation / resize)
        if (!window.__pgTimelineFitLabelsBound) {
            window.__pgTimelineFitLabelsBound = true;
            window.addEventListener('resize', () => {
                const active = document.getElementById('timelineTab');
                if (active && !active.classList.contains('hidden')) {
                    // Re-render already recalculates bars; but we can just refit visible rows.
                    document.querySelectorAll('#timelineRows .bar-container').forEach((bc) => {
                        // Trigger the same logic by scheduling an animation frame.
                        requestAnimationFrame(() => {
                            // noop here; per-row fit is closed over, so rerender is safest.
                        });
                    });
                    // safest: rerender timeline (idempotent)
                    try { renderTimeline(); } catch (e) {}
                }
            }, { passive: true });
        }

        if (data && data.succession && data.succession.includes('Every')) {
            tipsDiv.innerHTML += `<br>• <strong>${entry.crop}:</strong> ${data.succession} for continuous harvest`;
        }                
    });

}
