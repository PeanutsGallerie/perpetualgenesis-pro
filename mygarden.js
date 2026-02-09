function addToGarden(crop) {
    const refDate = localStorage.getItem('myReferenceDate') || prompt('Enter reference date (MM/DD/YYYY):');
    if (!refDate) return;
    const plan = getCurrentPlan('mygarden');
    const entry = {
        id: Date.now().toString(),
        crop,
        referenceDate: refDate,
        addedDate: new Date().toISOString()
    };
    plan.entries.push(entry);
    savePlans();
    loadMyGardenTab();
}

function loadMyGardenTab() {
    renderPlanTabs('mygarden');
    updateMethodNote();

    const grid = document.getElementById('favoritesGrid');
    grid.innerHTML = '';
    const entries = getCurrentEntries('mygarden');
    if (!entries || !Array.isArray(entries)) {
    console.error('Entries is not an array for mygarden – skipping render');
    return;
}
entries.forEach(entry => {
    const dates = calculateCropDates(entry.crop, parseDate(entry.referenceDate));
    const prog = progressData[entry.id] || {};
    const notes = notesData[entry.id] || '';

    // 🔹 NEW: compute batch label for this crop within this plan
    let instance = '';
    const sameCrop = entries.filter(e => e.crop === entry.crop);
    if (sameCrop.length > 1) {
        const idx = sameCrop.findIndex(e => e.id === entry.id);
        if (idx !== -1) {
            instance = ` (Batch ${idx + 1})`;
        }
    }

    const card = document.createElement('div');
    card.className = 'crop-card';
    card.innerHTML = `
        <div class="crop-name">${entry.crop}${instance}</div>
        <div class="card-settings">Reference: ${formatDate(parseDate(entry.referenceDate))}</div>
        <div class="crop-info">
            <div><strong>Weeks:</strong> ${cropData[entry.crop] ? cropData[entry.crop].weeks || '—' : '—'}</div>
            <div><strong>Maturity:</strong> ${cropData[entry.crop] ? cropData[entry.crop].maturity || '—' : '—'}</div>
            <div><strong>Soil Temp:</strong> ${cropData[entry.crop] ? cropData[entry.crop].soilTemp || '—' : '—'}</div>
            <div><strong>Succession:</strong> ${cropData[entry.crop] ? cropData[entry.crop].succession || '—' : '—'}</div>
            <div><strong>Companions:</strong> ${cropData[entry.crop] ? cropData[entry.crop].companions || '—' : '—'}</div>
            <div><strong>Start Indoors:</strong> ${dates.start}</div>
            <div><strong>Transplant Out:</strong> ${dates.transplant}</div>
            <div><strong>Estimated Harvest:</strong> ${dates.harvest}</div>
        </div>
        <div class="progress-buttons">
            <div class="progress-btn ${prog.started ? 'done' : ''}" onclick="toggleProgress('${entry.id}', 'started')">Seeds Started</div>
            <div class="progress-btn ${prog.transplanted ? 'done' : ''}" onclick="toggleProgress('${entry.id}', 'transplanted')">Transplanted</div>
            <div class="progress-btn ${prog.harvested ? 'done' : ''}" onclick="toggleProgress('${entry.id}', 'harvested')">Harvested</div>
        </div>
        <div class="crop-notes">
            <textarea placeholder="Add notes..." onchange="saveNote('${entry.id}', this.value)">${notes}</textarea>
        </div>
        <button class="clear-btn remove-crop" onclick="removeGardenEntry('${entry.id}')">Remove This Planting</button>
    `;
    grid.appendChild(card);
});
filterMyGarden();
}


function filterMyGarden() {
    const filter = document.getElementById('myGardenSearch').value.toLowerCase();
    document.querySelectorAll('#favoritesGrid .crop-card').forEach(card => {
        card.style.display = card.querySelector('.crop-name').textContent.toLowerCase().includes(filter) ? '' : 'none';
    });
}

function toggleProgress(id, step) {
    if (!progressData[id]) progressData[id] = {};
    progressData[id][step] = !progressData[id][step];
    progressData[id][step + 'Date'] = progressData[id][step] ? formatDate(new Date()) : null;
    localStorage.setItem('cropProgress', JSON.stringify(progressData));
    loadMyGardenTab();
    renderTimeline();
}

function saveNote(id, note) {
    notesData[id] = note;
    localStorage.setItem('cropNotes', JSON.stringify(notesData));
}

function removeGardenEntry(id) {
    gardenPlans.plans.forEach(p => p.entries = p.entries.filter(e => e.id !== id));
    delete progressData[id]; delete notesData[id];
    localStorage.setItem('cropProgress', JSON.stringify(progressData));
    localStorage.setItem('cropNotes', JSON.stringify(notesData));
    savePlans();
    loadMyGardenTab();
    renderTimeline();
}
