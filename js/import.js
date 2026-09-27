// ==========================================================================
// FINNY IMPORT TRANSACTIONS ENGINE (PRODUCTION)
// ==========================================================================

const APPS_SCRIPT_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyVLP53wxl5cIvKIcWmyBwIZ26P3Tc2IMy8wu2mVf676EovOkHCgBdqg5MNTgL4KIdJ/exec';

const importState = {
  accounts: [],
  categories: [],
  stagedTransactions: [],
  importHistory: [],
  selectedStagedId: null,
  selectedStagedTxn: null,
  selectedCheckboxes: new Set(),
  collapsedAccounts: new Set()
};

// 1. Initialize Page
window.initImportPage = async function() {
  await Promise.all([
    loadMasterData(),
    loadStagedTransactions(),
    loadImportHistory()
  ]);

  setupEventListeners();
};

async function loadMasterData() {
  const [accRes, catRes] = await Promise.all([
    window.db.from('accounts').select('*').order('name', { ascending: true }),
    window.db.from('categories').select('*').order('name', { ascending: true })
  ]);

  importState.accounts = accRes.data || [];
  importState.categories = catRes.data || [];

  // Populate Filter Dropdowns
  const fAcc = document.getElementById('stageFilterAccount');
  if (fAcc) {
    fAcc.innerHTML = '<option value="ALL">All Accounts</option>' + 
      importState.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  }

  const fCat = document.getElementById('stageFilterCategory');
  if (fCat) {
    fCat.innerHTML = '<option value="ALL">All Categories</option>' + 
      importState.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  // Populate Editor Dropdowns
  const edAcc = document.getElementById('edAccount');
  if (edAcc) {
    edAcc.innerHTML = importState.accounts.map(a => `<option value="${a.id}">${a.name} (${a.account_number_masked || '****'})</option>`).join('');
  }

  const edCat = document.getElementById('edCategory');
  if (edCat) {
    edCat.innerHTML = '<option value="">(No Category)</option>' + 
      importState.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }
}

// 2. Fetch Staged Transactions from Supabase
async function loadStagedTransactions() {
  const { data, error } = await window.db
    .from('staged_transactions')
    .select('*')
    .eq('status', 'Pending')
    .order('date', { ascending: false })
    .order('time', { ascending: false });

  if (error) {
    console.error('Error loading staged transactions:', error);
    return;
  }

  importState.stagedTransactions = data || [];
  renderStagedTransactions();
}

// 3. Fetch Import History Batches
async function loadImportHistory() {
  const { data, error } = await window.db
    .from('import_batches')
    .select('*')
    .order('imported_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error loading import history:', error);
    return;
  }

  importState.importHistory = data || [];
  renderImportHistory();
}

// 4. Render Grouped Staging Table (with Finny Design System Components)
function renderStagedTransactions() {
  const container = document.getElementById('stagingGroupsContainer');
  if (!container) return;

  const query = (document.getElementById('stageSearchInput')?.value || '').toLowerCase().trim();
  const accFilter = document.getElementById('stageFilterAccount')?.value || 'ALL';
  const catFilter = document.getElementById('stageFilterCategory')?.value || 'ALL';
  const typeFilter = document.getElementById('stageFilterType')?.value || 'ALL';

  const filtered = importState.stagedTransactions.filter(t => {
    const matchesQ = !query || 
      (t.description || '').toLowerCase().includes(query) || 
      (t.payee || '').toLowerCase().includes(query) || 
      String(t.amount).includes(query);

    const matchesAcc = accFilter === 'ALL' || t.account_id === accFilter;
    const matchesCat = catFilter === 'ALL' || t.category_id === catFilter;
    const matchesType = typeFilter === 'ALL' || t.type === typeFilter;

    return matchesQ && matchesAcc && matchesCat && matchesType;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-staging-card">
        <span style="font-size:32px;">✅</span>
        <h3>All Caught Up!</h3>
        <p>No staged transactions require review. Click <strong>▶ Import Now</strong> to pull the latest statement.</p>
      </div>
    `;
    updateBulkBar();
    return;
  }

  // Group by Account
  const groups = {};
  filtered.forEach(t => {
    const accId = t.account_id;
    const accObj = importState.accounts.find(a => a.id === accId);
    const accName = accObj ? accObj.name : (t.raw_account || 'Unassigned Account');
    const accMasked = accObj ? accObj.account_number_masked : '';

    if (!groups[accName]) {
      groups[accName] = { accId, accName, accMasked, txns: [] };
    }
    groups[accName].txns.push(t);
  });

  container.innerHTML = '';

  Object.values(groups).forEach(grp => {
    const isCollapsed = importState.collapsedAccounts.has(grp.accName);
    const card = document.createElement('div');
    card.className = 'stage-account-card';

    const allGroupSelected = grp.txns.length > 0 && grp.txns.every(t => importState.selectedCheckboxes.has(t.id));

    card.innerHTML = `
      <div class="stage-account-header" onclick="toggleAccountCollapse('${grp.accName}')">
        <div class="stage-acc-left">
          <input type="checkbox" ${allGroupSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleSelectAccountGroup('${grp.accName}', this.checked)" />
          <div class="stage-acc-icon">🏛️</div>
          <h3>${grp.accName}</h3>
          <span class="text-muted" style="font-size:12px;">${grp.accMasked ? `(${grp.accMasked})` : ''}</span>
        </div>
        <div class="stage-acc-right">
          <span class="text-muted"><strong>${grp.txns.length}</strong> transaction(s)</span>
          <button class="btn btn-outline" style="padding:4px 10px; font-size:11px;" onclick="event.stopPropagation(); approveAccountTransactions('${grp.accName}')">Approve All</button>
          <span style="font-size:11px; color:var(--text-muted);">${isCollapsed ? '▶' : '▼'}</span>
        </div>
      </div>

      <div class="stage-account-body" style="display:${isCollapsed ? 'none' : 'block'};">
        <table class="stage-txns-table">
          <thead>
            <tr>
              <th width="32"></th>
              <th width="120">Date & Time</th>
              <th>Description (From File)</th>
              <th>Payee</th>
              <th>Category</th>
              <th class="text-right">Amount (₹)</th>
              <th class="text-center" width="80">Type</th>
              <th class="text-right" width="90">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${grp.txns.map(t => {
              const catObj = importState.categories.find(c => c.id === t.category_id);
              const isChecked = importState.selectedCheckboxes.has(t.id);
              const isSelected = importState.selectedStagedId === t.id;

              return `
                <tr class="${isSelected ? 'selected-stage-row' : ''}" onclick="selectTransactionToEdit('${t.id}')">
                  <td onclick="event.stopPropagation()">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleTxnCheckbox('${t.id}', this.checked)" />
                  </td>
                  <td>
                    <strong>${t.date}</strong><br>
                    <span class="text-muted" style="font-size:11px;">${t.time || '—'}</span>
                  </td>
                  <td><strong>${t.description || '—'}</strong></td>
                  <td>${t.payee || '<span class="text-muted">Not assigned</span>'}</td>
                  <td>
                    <span class="cat-pill">${catObj ? catObj.name : 'Uncategorized'}</span>
                  </td>
                  <td class="text-right ${Number(t.amount) >= 0 ? 'income-val' : 'expense-val'}">
                    <strong>${Number(t.amount) >= 0 ? '+' : ''}${window.formatINR(t.amount)}</strong>
                  </td>
                  <td class="text-center">
                    <span class="type-pill ${t.type ? t.type.toLowerCase() : 'expense'}">${t.type || 'Expense'}</span>
                  </td>
                  <td class="text-right" onclick="event.stopPropagation()">
                    <div class="stage-action-btns">
                      <button class="stage-icon-btn" onclick="selectTransactionToEdit('${t.id}')" title="Edit">✎</button>
                      <button class="stage-icon-btn approve-btn" onclick="approveSingleTransaction('${t.id}')" title="Approve">✓</button>
                      <button class="stage-icon-btn delete-btn" onclick="deleteSingleTransaction('${t.id}')" title="Delete">🗑</button>
                    </div>
                  </td>
                  
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    container.appendChild(card);
  });

  updateBulkBar();
}

// 5. Select Transaction to Edit in Right Panel
window.selectTransactionToEdit = function(id) {
  const t = importState.stagedTransactions.find(x => x.id === id);
  if (!t) return;

  importState.selectedStagedId = id;
  importState.selectedStagedTxn = t;

  document.getElementById('editorEmptyState').style.display = 'none';
  document.getElementById('editorActiveForm').style.display = 'flex';

  document.getElementById('editStagedId').value = t.id;
  document.getElementById('edDate').value = t.date;
  document.getElementById('edTime').value = t.time || '';
  document.getElementById('edDescription').value = t.description || '';
  document.getElementById('edPayee').value = t.payee || '';
  document.getElementById('edCategory').value = t.category_id || '';
  document.getElementById('edAccount').value = t.account_id || (importState.accounts[0]?.id || '');
  document.getElementById('edAmount').value = Math.abs(t.amount);
  document.getElementById('edType').value = t.type || (t.amount >= 0 ? 'Income' : 'Expense');
  document.getElementById('edNotes').value = t.notes || '';
  document.getElementById('edSourceFile').textContent = t.source_file || 'Statement.xlsx';
  document.getElementById('edHashId').textContent = t.hash_id || '—';

  renderStagedTransactions();
};

window.deselectCurrentTransaction = function() {
  importState.selectedStagedId = null;
  importState.selectedStagedTxn = null;
  document.getElementById('editorEmptyState').style.display = 'block';
  document.getElementById('editorActiveForm').style.display = 'none';
  renderStagedTransactions();
};

// 6. Approve Single Staged Transaction (Passes Exact Hash ID into Transactions)
window.approveSingleTransaction = async function(id) {
  const t = importState.stagedTransactions.find(x => x.id === id);
  if (!t) return;

  try {
    const { error: insErr } = await window.db.from('transactions').insert([{
      date: t.date,
      time: t.time || null,
      amount: t.amount,
      description: t.payee ? `${t.payee} (${t.description})` : t.description,
      type: t.type,
      account_id: t.account_id,
      category_id: t.category_id,
      notes: t.notes || t.remarks || null, // <-- Saved to ledger
      hash_id: t.hash_id
    }]);

    if (insErr) console.warn(insErr.message);

    await window.db.from('staged_transactions').delete().eq('id', id);
    if (importState.selectedStagedId === id) deselectCurrentTransaction();
    await loadStagedTransactions();
  } catch (err) {
    alert('Failed to approve transaction: ' + err.message);
  }
};

// 7. Approve from Right Editor (With User-Edited Values)
window.approveCurrentStaged = async function() {
  const id = document.getElementById('editStagedId').value;
  const t = importState.stagedTransactions.find(x => x.id === id);
  if (!t) return;

  const date = document.getElementById('edDate').value;
  const time = document.getElementById('edTime').value;
  let amount = parseFloat(document.getElementById('edAmount').value) || 0;
  const type = document.getElementById('edType').value;
  if (type === 'Expense' && amount > 0) amount = -amount;

  const payee = document.getElementById('edPayee').value.trim();
  const desc = document.getElementById('edDescription').value.trim();
  const account_id = document.getElementById('edAccount').value;
  const category_id = document.getElementById('edCategory').value || null;
  const notes = document.getElementById('edNotes').value.trim(); // <-- Reads edited or initial remarks

  try {
    const { error: insErr } = await window.db.from('transactions').insert([{
      date,
      time: time || null,
      amount,
      description: payee ? `${payee} (${desc})` : desc,
      type,
      account_id,
      category_id,
      notes: notes || null, // <-- Saved to ledger
      hash_id: t.hash_id
    }]);

    if (insErr) console.warn(insErr.message);

    await window.db.from('staged_transactions').delete().eq('id', id);
    deselectCurrentTransaction();
    await loadStagedTransactions();
  } catch (err) {
    alert('Approval failed: ' + err.message);
  }
};

// 8. Delete Staged Transaction
window.deleteSingleTransaction = async function(id) {
  if (!confirm('Delete this staged transaction? It will not be added to your ledger.')) return;
  try {
    await window.db.from('staged_transactions').delete().eq('id', id);
    if (importState.selectedStagedId === id) deselectCurrentTransaction();
    await loadStagedTransactions();
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
};

window.deleteCurrentStaged = function() {
  const id = document.getElementById('editStagedId').value;
  deleteSingleTransaction(id);
};

// 9. Account-Level Approval (Approve All in One Click)
window.approveAccountTransactions = async function(accName) {
  const txns = importState.stagedTransactions.filter(t => {
    const accObj = importState.accounts.find(a => a.id === t.account_id);
    const name = accObj ? accObj.name : (t.raw_account || 'Unassigned Account');
    return name === accName;
  });

  if (!confirm(`Approve all ${txns.length} transactions for ${accName}?`)) return;

  const insertPayload = txns.map(t => ({
    date: t.date,
    time: t.time || null,
    amount: t.amount,
    description: t.payee ? `${t.payee} (${t.description})` : t.description,
    type: t.type,
    account_id: t.account_id,
    category_id: t.category_id,
    notes: t.notes || t.remarks || null,
    hash_id: t.hash_id
  }));

  try {
    await window.db.from('transactions').insert(insertPayload);
    const ids = txns.map(t => t.id);
    await window.db.from('staged_transactions').delete().in('id', ids);
    await loadStagedTransactions();
  } catch (err) {
    alert('Bulk approval error: ' + err.message);
  }
};

// 10. Manual "Import Now" Trigger (Polls Google Apps Script Endpoint)
window.triggerDriveImport = async function() {
  const btn = document.getElementById('btnImportNow');
  const icon = document.getElementById('importBtnIcon');
  const text = document.getElementById('importBtnText');

  btn.disabled = true;
  icon.textContent = '◌';
  text.textContent = 'Importing latest file...';

  try {
    await fetch(APPS_SCRIPT_WEBHOOK_URL, { mode: 'no-cors' });
  } catch (err) {
    console.log('Dispatched import trigger to Google Apps Script.');
  } finally {
    // Wait for the Google Apps Script execution to finish writing to Supabase
    setTimeout(async () => {
      await Promise.all([loadStagedTransactions(), loadImportHistory()]);
      btn.disabled = false;
      icon.textContent = '▶';
      text.textContent = 'Import Now';
    }, 2800);
  }
};

// 11. Render Import History
function renderImportHistory() {
  const container = document.getElementById('importHistoryList');
  if (!container) return;

  if (importState.importHistory.length === 0) {
    container.innerHTML = `<div class="text-muted text-center" style="font-size:11px; padding:20px;">No imports yet.</div>`;
    return;
  }

  container.innerHTML = importState.importHistory.map(h => {
    const d = new Date(h.imported_at);
    const dateFormatted = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    const timeFormatted = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const isCompleted = h.status === 'Completed' || (h.staged_count === 0);

    return `
      <div class="history-item">
        <div class="history-item-left">
          <strong>${dateFormatted} ${timeFormatted}</strong>
          <span class="text-muted" style="font-size:10px;">${h.file_name}</span>
        </div>
        <div>
          <span class="history-status-badge ${isCompleted ? 'status-completed' : 'status-pending'}">
            ● ${isCompleted ? 'Completed' : 'Pending Review'}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

// 12. Bulk Selection Helpers
window.toggleTxnCheckbox = function(id, checked) {
  if (checked) importState.selectedCheckboxes.add(id);
  else importState.selectedCheckboxes.delete(id);
  updateBulkBar();
};

window.toggleSelectAccountGroup = function(accName, checked) {
  const txns = importState.stagedTransactions.filter(t => {
    const accObj = importState.accounts.find(a => a.id === t.account_id);
    const name = accObj ? accObj.name : (t.raw_account || 'Unassigned Account');
    return name === accName;
  });

  txns.forEach(t => {
    if (checked) importState.selectedCheckboxes.add(t.id);
    else importState.selectedCheckboxes.delete(t.id);
  });
  renderStagedTransactions();
};

window.toggleAccountCollapse = function(accName) {
  if (importState.collapsedAccounts.has(accName)) {
    importState.collapsedAccounts.delete(accName);
  } else {
    importState.collapsedAccounts.add(accName);
  }
  renderStagedTransactions();
};

function updateBulkBar() {
  const bar = document.getElementById('bulkActionBar');
  const countSpan = document.getElementById('bulkSelectedCount');
  if (!bar || !countSpan) return;

  const count = importState.selectedCheckboxes.size;
  if (count > 0) {
    bar.style.display = 'flex';
    countSpan.textContent = `${count} transaction(s) selected`;
  } else {
    bar.style.display = 'none';
  }
}

window.approveSelectedStaged = async function() {
  const ids = Array.from(importState.selectedCheckboxes);
  const txns = importState.stagedTransactions.filter(t => ids.includes(t.id));

  const insertPayload = txns.map(t => ({
    date: t.date,
    time: t.time || null,
    amount: t.amount,
    description: t.payee ? `${t.payee} (${t.description})` : t.description,
    type: t.type,
    account_id: t.account_id,
    category_id: t.category_id,
    notes: t.notes || t.remarks || null,
    hash_id: t.hash_id
  }));

  try {
    await window.db.from('transactions').insert(insertPayload);
    await window.db.from('staged_transactions').delete().in('id', ids);
    importState.selectedCheckboxes.clear();
    await loadStagedTransactions();
  } catch (err) {
    alert('Error approving selected: ' + err.message);
  }
};

window.deleteSelectedStaged = async function() {
  if (!confirm('Delete selected staged transactions?')) return;
  const ids = Array.from(importState.selectedCheckboxes);
  try {
    await window.db.from('staged_transactions').delete().in('id', ids);
    importState.selectedCheckboxes.clear();
    await loadStagedTransactions();
  } catch (err) {
    alert('Error deleting selected: ' + err.message);
  }
};

function setupEventListeners() {
  document.getElementById('stageSearchInput')?.addEventListener('input', renderStagedTransactions);
  document.getElementById('stageFilterAccount')?.addEventListener('change', renderStagedTransactions);
  document.getElementById('stageFilterCategory')?.addEventListener('change', renderStagedTransactions);
  document.getElementById('stageFilterType')?.addEventListener('change', renderStagedTransactions);
}

document.addEventListener('DOMContentLoaded', () => {
  window.initImportPage();
});