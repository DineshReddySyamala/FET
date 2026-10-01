// ==========================================================================
// FINNY IMPORT TRANSACTIONS ENGINE (PRODUCTION & CONTINUOUS LEARNING)
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
  expandedAccounts: new Set()
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
  const edToAcc = document.getElementById('edTransferToAccount');
  const accOptions = importState.accounts.map(a => `<option value="${a.id}">${a.name} (${a.account_number_masked || '****'})</option>`).join('');
  
  if (edAcc) edAcc.innerHTML = accOptions;
  if (edToAcc) edToAcc.innerHTML = accOptions;

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

// 4. Render Grouped Staging Table
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
      (t.remarks || '').toLowerCase().includes(query) || 
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
    const isExpanded = importState.expandedAccounts.has(grp.accName);
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
      <span style="font-size:11px; color:var(--text-muted);">${isExpanded ? '▼' : '▶'}</span>
    </div>
  </div>

  <div class="stage-account-body" style="display:${isExpanded ? 'block' : 'none'};">
    <table class="stage-txns-table">
        <table class="stage-txns-table">
          <thead>
            <tr>
              <th width="32"></th>
              <th width="120">Date & Time</th>
              <th>Payee / Remarks</th>
              <th>Category</th>
              <th class="text-right">Amount</th>
              <th class="text-center" width="80">Type</th>
              <th class="text-right" width="90">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${grp.txns.map(t => {
              const catObj = importState.categories.find(c => c.id === t.category_id);
              const isChecked = importState.selectedCheckboxes.has(t.id);
              const isSelected = importState.selectedStagedId === t.id;
              const isTransfer = t.type === 'Transfer';

              const amtNum = Math.abs(Number(t.amount || 0));
              const formattedAmt = (typeof window.formatINR === 'function')
                ? window.formatINR(amtNum).replace('₹', '').trim()
                : amtNum.toLocaleString('en-IN', { minimumFractionDigits: 2 });

              const sign = t.amount < 0 ? '- ' : '+ ';
              const amountClass = isTransfer ? 'transfer-val' : (t.amount >= 0 ? 'income-val' : 'expense-val');

              return `
                <tr class="${isSelected ? 'selected-stage-row' : ''}" onclick="selectTransactionToEdit('${t.id}')">
                  <td onclick="event.stopPropagation()">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleTxnCheckbox('${t.id}', this.checked)" />
                  </td>
                  <td>
                    <strong>${t.date}</strong><br>
                    <span class="text-muted" style="font-size:11px;">${t.time || '—'}</span>
                  </td>
                  <td>
                    <strong>${t.payee || t.description || 'Untitled'}</strong><br>
                    <span class="text-muted" style="font-size:11px;">${t.remarks || t.notes || 'No remarks'}</span>
                  </td>
                  <td>
                    <span class="cat-pill">${catObj ? catObj.name : (isTransfer ? 'Transfer' : 'Uncategorized')}</span>
                  </td>
                  <td class="text-right ${amountClass}">
                    <strong>${sign}₹${formattedAmt}</strong>
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
  document.getElementById('edNotes').value = t.remarks || t.notes || '';
  document.getElementById('edSourceFile').textContent = t.source_file || 'Statement.xlsx';
  document.getElementById('edHashId').textContent = t.hash_id || '—';

  handleFormTypeChange(document.getElementById('edType').value);
  renderStagedTransactions();
};

window.handleFormTypeChange = function(type) {
  const transferToGroup = document.getElementById('edTransferToGroup');
  if (transferToGroup) {
    transferToGroup.style.display = (type === 'Transfer') ? 'flex' : 'none';
  }
};

window.deselectCurrentTransaction = function() {
  importState.selectedStagedId = null;
  importState.selectedStagedTxn = null;
  document.getElementById('editorEmptyState').style.display = 'block';
  document.getElementById('editorActiveForm').style.display = 'none';
  renderStagedTransactions();
};

// 6. Continuous Merchant Memory Learner
async function upsertMerchantMemory(payee, categoryId, type) {
  if (!payee || !categoryId) return;
  try {
    await window.db.from('merchant_memory').upsert({
      payee: payee.trim().toLowerCase(),
      category_id: categoryId,
      default_type: type || 'Expense',
      last_used_at: new Date().toISOString()
    }, { onConflict: 'payee' });
  } catch (err) {
    console.warn('Notice: Merchant memory learning skipped:', err.message);
  }
}

// 7. Approve Single Staged Transaction (via RPC or Paired Transfer)
window.approveSingleTransaction = async function(id) {
  const t = importState.stagedTransactions.find(x => x.id === id);
  if (!t) return;

  try {
    const isTransfer = t.type === 'Transfer';

    if (isTransfer) {
      const destAcc = importState.accounts.find(a => 
        a.id !== t.account_id && (a.name.toLowerCase().includes('upi lite') || a.name.toLowerCase().includes('kotak'))
      );

      const amountVal = Math.abs(Number(t.amount));

      // 1. Generate sequential TXN IDs via database sequence
      const { data: legOutId } = await window.db.rpc('fn_generate_txn_id');
      const { data: legInId } = await window.db.rpc('fn_generate_txn_id');

      // 2. Insert paired legs with source = 'Import'
      const { error: insErr } = await window.db.from('transactions').insert([
        {
          id: legOutId,
          date: t.date,
          time: t.time || '12:00:00',
          title: t.payee || 'Transfer Out',
          amount: -amountVal,
          type: 'Transfer',
          account_id: t.account_id,
          category_id: null,
          notes: t.remarks || t.notes || null,
          hash_id: t.hash_id,
          source: 'Import',
          transfer_pair_id: legInId
        },
        {
          id: legInId,
          date: t.date,
          time: t.time || '12:00:00',
          title: t.payee || 'Transfer In',
          amount: amountVal,
          type: 'Transfer',
          account_id: destAcc ? destAcc.id : t.account_id,
          category_id: null,
          notes: t.remarks || t.notes || null,
          hash_id: t.hash_id,
          source: 'Import',
          transfer_pair_id: legOutId
        }
      ]);

      if (insErr) throw insErr;
      await window.db.from('staged_transactions').delete().eq('id', id);

    } else {
      // Direct call to atomic RPC (handles sequence ID, source='Import', & merchant memory)
      const { error: rpcErr } = await window.db.rpc('fn_approve_staged_transaction', {
        p_staged_id: t.id,
        p_final_title: t.payee || t.description || 'Untitled',
        p_final_category_id: t.category_id || null,
        p_final_account_id: t.account_id
      });

      if (rpcErr) throw rpcErr;
    }

    if (importState.selectedStagedId === id) deselectCurrentTransaction();
    await loadStagedTransactions();

  } catch (err) {
    alert('Failed to approve transaction: ' + err.message);
  }
};

// 8. Approve from Right Editor
window.approveCurrentStaged = async function() {
  const id = document.getElementById('editStagedId').value;
  const t = importState.stagedTransactions.find(x => x.id === id);
  if (!t) return;

  const date = document.getElementById('edDate').value;
  const time = document.getElementById('edTime').value;
  const type = document.getElementById('edType').value;
  let amount = Math.abs(parseFloat(document.getElementById('edAmount').value) || 0);
  const payee = document.getElementById('edPayee').value.trim();
  const account_id = document.getElementById('edAccount').value;
  const category_id = document.getElementById('edCategory').value || null;
  const notes = document.getElementById('edNotes').value.trim();

  try {
    if (type === 'Transfer') {
      const destAccountId = document.getElementById('edTransferToAccount').value;
      if (account_id === destAccountId) {
        alert('Source and destination accounts must be different for a transfer.');
        return;
      }

      const { data: legOutId } = await window.db.rpc('fn_generate_txn_id');
      const { data: legInId } = await window.db.rpc('fn_generate_txn_id');

      const { error: insErr } = await window.db.from('transactions').insert([
        {
          id: legOutId,
          date,
          time: time || '12:00:00',
          title: payee || 'Transfer Out',
          amount: -amount,
          type: 'Transfer',
          account_id,
          category_id: null,
          notes: notes || null,
          hash_id: t.hash_id,
          source: 'Import',
          transfer_pair_id: legInId
        },
        {
          id: legInId,
          date,
          time: time || '12:00:00',
          title: payee || 'Transfer In',
          amount: amount,
          type: 'Transfer',
          account_id: destAccountId,
          category_id: null,
          notes: notes || null,
          hash_id: t.hash_id,
          source: 'Import',
          transfer_pair_id: legOutId
        }
      ]);

      if (insErr) throw insErr;
      await window.db.from('staged_transactions').delete().eq('id', id);

    } else {
      // Update staged row first with user overrides if any, then approve via RPC
      await window.db.from('staged_transactions').update({
        date,
        time: time || '12:00:00',
        amount: (type === 'Expense') ? -amount : amount,
        type,
        notes
      }).eq('id', id);

      const { error: rpcErr } = await window.db.rpc('fn_approve_staged_transaction', {
        p_staged_id: id,
        p_final_title: payee || t.description || 'Untitled',
        p_final_category_id: category_id,
        p_final_account_id: account_id
      });

      if (rpcErr) throw rpcErr;
    }

    deselectCurrentTransaction();
    await loadStagedTransactions();

  } catch (err) {
    alert('Approval failed: ' + err.message);
  }
};

// 9. Delete Staged Transaction (Now records into excluded_hashes via RPC)
window.deleteSingleTransaction = async function(id) {
  if (!confirm('Reject this staged transaction? It will be permanently excluded from future imports.')) return;
  try {
    const { error } = await window.db.rpc('fn_reject_staged_transaction', {
      p_staged_id: id,
      p_reason: 'User rejected from staging UI'
    });

    if (error) throw error;

    if (importState.selectedStagedId === id) deselectCurrentTransaction();
    await loadStagedTransactions();
  } catch (err) {
    alert('Failed to delete/reject: ' + err.message);
  }
};

window.deleteCurrentStaged = function() {
  const id = document.getElementById('editStagedId').value;
  deleteSingleTransaction(id);
};

// 10. Account-Level Approval
window.approveAccountTransactions = async function(accName) {
  const txns = importState.stagedTransactions.filter(t => {
    const accObj = importState.accounts.find(a => a.id === t.account_id);
    const name = accObj ? accObj.name : (t.raw_account || 'Unassigned Account');
    return name === accName;
  });

  if (!confirm(`Approve all ${txns.length} transactions for ${accName}?`)) return;

  try {
    for (const t of txns) {
      if (t.type === 'Transfer') {
        await approveSingleTransaction(t.id);
      } else {
        await window.db.rpc('fn_approve_staged_transaction', {
          p_staged_id: t.id,
          p_final_title: t.payee || t.description || 'Untitled',
          p_final_category_id: t.category_id || null,
          p_final_account_id: t.account_id
        });
      }
    }
    await loadStagedTransactions();
  } catch (err) {
    alert('Bulk approval error: ' + err.message);
  }
};

// 11. Trigger Ingestion via Apps Script
window.triggerDriveImport = async function() {
  const btn = document.getElementById('btnImportNow');
  const icon = document.getElementById('importBtnIcon');
  const text = document.getElementById('importBtnText');

  if (btn) btn.disabled = true;
  if (icon) icon.textContent = '◌';
  if (text) text.textContent = 'Importing latest file...';

  try {
    await fetch(APPS_SCRIPT_WEBHOOK_URL, { mode: 'no-cors' });
  } catch (err) {
    console.log('Import trigger dispatched.');
  } finally {
    setTimeout(async () => {
      await Promise.all([loadStagedTransactions(), loadImportHistory()]);
      if (btn) btn.disabled = false;
      if (icon) icon.textContent = '▶';
      if (text) text.textContent = 'Import Now';
    }, 2800);
  }
};

// 12. Render Import History
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

// 13. Bulk Selection Helpers
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
  if (importState.expandedAccounts.has(accName)) {
    importState.expandedAccounts.delete(accName);
  } else {
    importState.expandedAccounts.add(accName);
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

  try {
    for (const t of txns) {
      if (t.type === 'Transfer') {
        await approveSingleTransaction(t.id);
      } else {
        await window.db.rpc('fn_approve_staged_transaction', {
          p_staged_id: t.id,
          p_final_title: t.payee || t.description || 'Untitled',
          p_final_category_id: t.category_id || null,
          p_final_account_id: t.account_id
        });
      }
    }
    importState.selectedCheckboxes.clear();
    await loadStagedTransactions();
  } catch (err) {
    alert('Error approving selected: ' + err.message);
  }
};

window.deleteSelectedStaged = async function() {
  if (!confirm('Reject selected staged transactions? They will be permanently excluded from future imports.')) return;
  const ids = Array.from(importState.selectedCheckboxes);
  try {
    for (const id of ids) {
      await window.db.rpc('fn_reject_staged_transaction', {
        p_staged_id: id,
        p_reason: 'User bulk rejected from staging UI'
      });
    }
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