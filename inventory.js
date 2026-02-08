// --- Per-plan inventory keys (Option B) ---
// We store inventory per My Garden plan using perPlanKey(base) from core.js.

const INVENTORY_KEY_BASE = "inventoryData";
const TRANSACTIONS_KEY_BASE = "inventoryTransactions";

function getInventoryKey() {
  if (typeof perPlanKey === "function") {
    return perPlanKey(INVENTORY_KEY_BASE);
  }
  // Fallback if perPlanKey isn't available yet
  return INVENTORY_KEY_BASE;
}

function getTransactionsKey() {
  if (typeof perPlanKey === "function") {
    return perPlanKey(TRANSACTIONS_KEY_BASE);
  }
  return TRANSACTIONS_KEY_BASE;
}

// Load inventory for the current plan into a global array
window.inventoryData = JSON.parse(localStorage.getItem(getInventoryKey()) || "[]");

function getInventory() {
  return JSON.parse(localStorage.getItem(getInventoryKey()) || "[]");
}

function getTransactions() {
  return JSON.parse(localStorage.getItem(getTransactionsKey()) || "[]");
}

function saveInventory(data) {
  localStorage.setItem(getInventoryKey(), JSON.stringify(data));
}

function saveTransactions(data) {
  localStorage.setItem(getTransactionsKey(), JSON.stringify(data));
}




function recalculateInventory() {
  const inventory = getInventory();
  const transactions = getTransactions();

  inventory.forEach(item => {
    let qty = Number(item.startingQuantity ?? item.quantity ?? 0);

    transactions
      .filter(t => t.inventoryId === item.id)
      .forEach(t => {
        if (t.type === "IN") qty += t.quantity;
        if (t.type === "OUT") qty -= t.quantity;
        if (t.type === "ADJUST") qty = t.quantity;
      });

    item.currentQuantity = Math.max(qty, 0);
  });
}


/* ================= INVENTORY FUNCTIONS ================= */

window.showAddInventoryForm = function () {
  const form = document.getElementById('addInventoryForm');
  if (form) form.style.display = 'block';
};

window.hideAddInventoryForm = function () {
  const form = document.getElementById('addInventoryForm');
  if (form) form.style.display = 'none';

  ['invCategory', 'invName', 'invBrand', 'invQuantity', 'invPurchaseDate', 'invUseByDate', 'invNotes']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

  document.getElementById('invCategory').value = 'Seeds';
};

window.saveInventoryItem = function () {
  const startingQty = Number(document.getElementById('invQuantity').value);

  if (!document.getElementById('invName').value.trim() || isNaN(startingQty)) {
    alert('Name and Quantity are required!');
    return;
  }

  const item = {
    id: Date.now(),
    category: invCategory.value,
    name: invName.value.trim(),
    brand: invBrand.value.trim(),
    unit: "units",
    startingQuantity: startingQty,  // Change to use the entered value
    currentQuantity: startingQty,   // Set to starting value initially
    lowThreshold: Math.ceil(startingQty * 0.1),
    purchaseDate: invPurchaseDate.value,
    useByDate: invUseByDate.value,
    notes: invNotes.value.trim(),
    createdAt: Date.now()
  };

  window.inventoryData.push(item);
  saveInventory(window.inventoryData);

  // Create initial transaction
  const transactions = getTransactions();
  transactions.push({
    id: Date.now(),
    inventoryId: item.id,
    type: "IN",
    quantity: startingQty,
    reason: "Initial stock",
    date: Date.now()
  });

  saveTransactions(transactions);

  // IMPORTANT: Recalculate to apply the transaction immediately
  recalculateInventory();

  window.hideAddInventoryForm();
  window.renderInventoryTable();
};


window.useInventory = function (id) {
  const item = window.inventoryData.find(i => i.id === id);
  if (!item) return;

  const amount = prompt(`How many units to USE from "${item.name}"? (current: ${item.currentQuantity})`, "1");
  const qty = parseInt(amount, 10);

  if (isNaN(qty) || qty <= 0) return;

  // Update current quantity (prevent negative)
  item.currentQuantity = Math.max(
    0,
    (parseInt(item.currentQuantity) || 0) - qty
  );

  // Create transaction record (OUT)
  const transactions = getTransactions();
  transactions.push({
    id: Date.now(),
    inventoryId: item.id,
    type: "OUT",
    quantity: qty,
    reason: "Used quantity",
    date: Date.now()
  });
  saveTransactions(transactions);

  // Save inventory and refresh table
  saveInventory(window.inventoryData);
  window.renderInventoryTable();
};

window.addQuantity = function(id) {
  const item = window.inventoryData.find(i => i.id === id);
  if (!item) return;

  const amount = prompt(`How many units to ADD to "${item.name}"? (current: ${item.currentQuantity})`, "1");
  const qty = parseInt(amount, 10);

  if (isNaN(qty) || qty <= 0) return;

  // Update current quantity
  item.currentQuantity = (parseInt(item.currentQuantity) || 0) + qty;

  // Optional: Create transaction record (recommended for history)
  const transactions = getTransactions();
  transactions.push({
    id: Date.now(),
    inventoryId: item.id,
    type: "IN",
    quantity: qty,
    reason: "Added quantity",
    date: Date.now()
  });
  saveTransactions(transactions);

  // Save and refresh table
  saveInventory(window.inventoryData);
  window.renderInventoryTable();
};



window.renderInventoryTable = function () {
  const tbody = document.getElementById('inventoryBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (window.inventoryData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:40px; color:var(--text-light);">
          No items in inventory yet. Click "+ Add Item" to start!
        </td>
      </tr>`;
    return;
  }

  window.inventoryData
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(item => {
      const tr = document.createElement('tr');
tr.innerHTML = `
  <td>
    <!-- Add to Garden (future) -->
    <button disabled title="Coming soon">🌱</button>
  </td>
  <td>${item.category}</td>
  <td><strong>${item.name}</strong></td>
  <td>${item.brand || '-'}</td>
  <td>${item.currentQuantity}</td>
  <td>${item.purchaseDate || '-'}</td>
  <td>${item.useByDate || '-'}</td>
  <td>${item.notes || '-'}</td>
  <td>
    <button onclick="useInventory(${item.id})">➖ Use</button>
    <button onclick="addQuantity(${item.id})">➕ Add </button>
    <button onclick="deleteInventoryItem(${item.id})">X</button>
  </td>
`;

      tbody.appendChild(tr);
    });
};

window.deleteInventoryItem = function (id) {
  if (!confirm('Delete this inventory item?')) return;
  window.inventoryData = window.inventoryData.filter(i => i.id !== id);
    localStorage.setItem(getInventoryKey(), JSON.stringify(window.inventoryData));
  window.renderInventoryTable();
};

window.filterInventory = function () {
  const filter = (document.getElementById('inventorySearch')?.value || '').toLowerCase();
  const rows = document.querySelectorAll('#inventoryBody tr');
  rows.forEach(row => {
    const text = (row.textContent || '').toLowerCase();
    row.style.display = text.includes(filter) ? '' : 'none';
  });
};

window.editInventoryItem = function (id) {
  const item = window.inventoryData.find(i => i.id === id);
  if (!item) return;

  const invCategory = document.getElementById('invCategory');
  const invName = document.getElementById('invName');
  const invBrand = document.getElementById('invBrand');
  const invQuantity = document.getElementById('invQuantity');
  const invPurchaseDate = document.getElementById('invPurchaseDate');
  const invUseByDate = document.getElementById('invUseByDate');
  const invNotes = document.getElementById('invNotes');

  if (invCategory) invCategory.value = item.category || 'Seeds';
  if (invName) invName.value = item.name || '';
  if (invBrand) invBrand.value = item.brand || '';
  if (invQuantity) invQuantity.value = (item.currentQuantity ?? item.startingQuantity ?? 0);
  if (invPurchaseDate) invPurchaseDate.value = item.purchaseDate || '';
  if (invUseByDate) invUseByDate.value = item.useByDate || '';
  if (invNotes) invNotes.value = item.notes || '';

  window.showAddInventoryForm();
};


function renderInventory() {
  const tbody = document.getElementById('inventoryBody');
  if (!tbody) return;

  tbody.innerHTML = '';

   const inventory = JSON.parse(localStorage.getItem(getInventoryKey()) || "[]");

  if (inventory.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; opacity:.6;">
          No inventory items yet
        </td>
      </tr>
    `;
    return;
  }

  inventory.forEach(item => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.category || ''}</td>
      <td>${item.name || ''}</td>
      <td>${item.brand || ''}</td>
      <td>${item.currentQuantity}</td>
      <td>${item.purchaseDate || ''}</td>
      <td>${item.useByDate || ''}</td>
      <td>${item.notes || ''}</td>
      <td>
        <button onclick="deleteInventoryItem(${item.id})">🗑</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}
function loadInventory() {
        const inventory = JSON.parse(localStorage.getItem(getInventoryKey()) || "[]");
    
    const tbody = document.getElementById('inventoryBody');
    tbody.innerHTML = '';

    inventory.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.category}</td>
            <td>${item.name}</td>
            <td>${item.brand}</td>
            <td>${item.quantity}</td>
            <td>${item.purchaseDate || ''}</td>
            <td>${item.useByDate || ''}</td>
            <td>${item.notes || ''}</td>
            <td>
                <button onclick="deleteInventoryItem(${item.id})">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

const addInvBtn = document.getElementById('addInventoryBtn');
if (addInvBtn) {
  addInvBtn.addEventListener('click', () => {
    window.showAddInventoryForm();
  });
}


  function deleteInventoryItem(id) {
    if (confirm('Delete this inventory item? This cannot be undone.')) {
        inventoryData = inventoryData.filter(i => i.id !== id);
                localStorage.setItem(getInventoryKey(), JSON.stringify(inventoryData));
        renderInventoryTable();
    }
}

// --- PLAN PICKER (Inventory tab) ---
// Inventory is stored per My Garden plan (via perPlanKey), so plan changes must reload the table.
function renderInventoryPlanTabs() {
  const container = document.getElementById('inventoryPlanTabs');
  if (!container) return;

  // Prefer the shared dropdown renderer installed by calculator.js
  if (typeof window.pgRenderPlanDropdownInto === 'function') {
    window.pgRenderPlanDropdownInto('inventoryPlanTabs', () => {
      try {
        if (typeof getInventory === 'function' && typeof window.renderInventoryTable === 'function') {
          window.inventoryData = getInventory();
          window.renderInventoryTable();
        }
      } catch (e) {}
    });
    return;
  }

  // Fallback if plan system isn't ready yet
  container.innerHTML = '<span style="opacity:.7;">Plans are created & renamed on the My Garden tab.</span>';
}


// Export Inventory to PDF - make sure it's global!
window.exportToPDF = function() {
    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
        alert('jsPDF library not loaded. Check internet/CDN.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("Seed & Supply Inventory Report", 20, 20);

    doc.setFontSize(12);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 30);
    doc.text(`Total Items: ${window.inventoryData.length}`, 20, 38);

    const tableData = window.inventoryData.map(item => [
        item.category || '-',
        item.name || '-',
        item.brand || '-',
        item.currentQuantity || 0,
        item.purchaseDate || '-',
        item.useByDate || '-',
        item.notes || '-'
    ]);

    doc.autoTable({
        head: [['Category', 'Name/Variety', 'Brand', 'Quantity', 'Purchase Date', 'Use-By Date', 'Notes']],
        body: tableData,
        startY: 50,
        theme: 'grid',
        headStyles: { fillColor: [0, 238, 255] }, // matches your --primary
        styles: { fontSize: 9, cellPadding: 3 },
        margin: { top: 50, left: 15, right: 15 }
    });

    doc.save(`inventory_${new Date().toISOString().split('T')[0]}.pdf`);
};

document.addEventListener('DOMContentLoaded', () => {
  renderInventoryPlanTabs();
});


