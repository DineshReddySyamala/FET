// ==========================================================================
// CENTRAL TRANSACTION CONTROLLER (FINNY)
// Universal Single Source of Truth for Modal & Slide-Out Panel
// ==========================================================================

const txnModalState = {
  currentType: 'Expense',
  cachedAccounts: [],
  cachedCategories: []
};

// Deterministic Hash Builder for Manual Transactions: H + YYYYMMDD + HHMMSS + AmountInPaise
function buildManualHashId(dateStr, timeStr, amount) {
  const cleanDate = (dateStr || '').replace(/-/g, '').slice(0, 8);
  let cleanTime = '000000';
  if (timeStr && timeStr.indexOf(':') !== -1) {
    cleanTime = timeStr.replace(/[^0-9]/g, '').padEnd(6, '0').slice(0, 6);
  }
  const amountInPaise = Math.round(Math.abs(amount) * 100);
  return 'H' + cleanDate + cleanTime + amountInPaise;
}

// 1. Preload Accounts and Categories for Dropdowns
async function preloadModalDropdowns() {
  try {
    if (txnModalState.cachedAccounts.length === 0) {
      const { data: accs } = await window.db
        .from('accounts')
        .select('id, name, is_active')
        .order('name');
      txnModalState.cachedAccounts = accs || [];
    }

    if (txnModalState.cachedCategories.length === 0) {
      const { data: cats } = await window.db
        .from('categories')
        .select('id, name')
        .order('name');
      txnModalState.cachedCategories = cats || [];
    }

    populateDropdowns();
  } catch (err) {
    console.error('Error preloading dropdowns:', err);
  }
}

function populateDropdowns() {
  const accOptions = txnModalState.cachedAccounts
    .map(a => `<option value="${a.id}">${a.name}${a.is_active ? '' : ' (Archived)'}</option>`)
    .join('');

  const catOptions = '<option value="">(No Category)</option>' +
    txnModalState.cachedCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  // Support both Modal and Panel Dropdown IDs
  ['modalAccountId', 'panelAccountId'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = accOptions;
  });

  ['modalFromAccountId', 'panelFromAccountId'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = accOptions;
  });

  ['modalToAccountId', 'panelToAccountId'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = accOptions;
  });

  ['modalCategoryId', 'panelCategoryId'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = catOptions;
  });
}

// 2. Open Modal / Panel in Add or Edit Mode
async function openTransactionModal(txnId = null) {
  await preloadModalDropdowns();

  // Elements (detecting both Modal and Panel layouts)
  const overlay = document.getElementById('txnModalOverlay') || document.getElementById('detailsFormState');
  const modalTitle = document.getElementById('txnModalTitle') || document.getElementById('panelFormTitle');
  const btnDelete = document.getElementById('btnDeleteTxn') || document.getElementById('btnDeleteActiveTxn');
  const form = document.getElementById('txnForm') || document.getElementById('panelTxnForm');

  if (form) form.reset();

  const elTxnId = document.getElementById('modalTxnId') || document.getElementById('panelTxnId');
  const elPairId = document.getElementById('modalTransferPairId') || document.getElementById('panelTransferPairId');
  if (elTxnId) elTxnId.value = txnId || '';
  if (elPairId) elPairId.value = '';

  const elDate = document.getElementById('modalDate') || document.getElementById('panelDate');
  const elTime = document.getElementById('modalTime') || document.getElementById('panelTime');
  const elTitle = document.getElementById('modalTitleInput') || document.getElementById('panelTitle');
  const elNotes = document.getElementById('modalNotes') || document.getElementById('panelNotes');
  const elAmount = document.getElementById('modalAmount') || document.getElementById('panelAmount');

  if (!txnId) {
    // --- CREATE MODE ---
    if (modalTitle) modalTitle.textContent = 'Add Transaction';
    if (btnDelete) btnDelete.style.display = 'none';

    const now = new Date();
    if (elDate) elDate.value = now.toISOString().split('T')[0];
    if (elTime) elTime.value = now.toTimeString().split(' ')[0];
    setTxnType('Expense');
  } else {
    // --- EDIT MODE ---
    if (modalTitle) modalTitle.textContent = 'Edit Transaction';
    if (btnDelete) btnDelete.style.display = 'inline-block';

    const { data: txn, error } = await window.db
      .from('transactions')
      .select('*')
      .eq('id', txnId)
      .single();

    if (error || !txn) {
      alert('Failed to load transaction details.');
      return;
    }

    if (elDate) elDate.value = txn.date;
    if (elTime) elTime.value = txn.time || '12:00:00';
    if (elTitle) elTitle.value = txn.title || '';
    if (elNotes) elNotes.value = txn.notes || '';
    if (elAmount) elAmount.value = Math.abs(Number(txn.amount));

    if (txn.type === 'Transfer') {
      setTxnType('Transfer');
      if (elPairId) elPairId.value = txn.transfer_pair_id || '';

      const fromEl = document.getElementById('modalFromAccountId') || document.getElementById('panelFromAccountId');
      const toEl = document.getElementById('modalToAccountId') || document.getElementById('panelToAccountId');

      if (txn.transfer_pair_id) {
        const { data: pairTxn } = await window.db
          .from('transactions')
          .select('account_id, amount')
          .eq('id', txn.transfer_pair_id)
          .single();

        if (txn.amount < 0) {
          if (fromEl) fromEl.value = txn.account_id;
          if (pairTxn && toEl) toEl.value = pairTxn.account_id;
        } else {
          if (toEl) toEl.value = txn.account_id;
          if (pairTxn && fromEl) fromEl.value = pairTxn.account_id;
        }
      } else {
        if (fromEl) fromEl.value = txn.account_id;
      }
    } else {
      setTxnType(txn.type || (txn.amount < 0 ? 'Expense' : 'Income'));
      const elAcc = document.getElementById('modalAccountId') || document.getElementById('panelAccountId');
      const elCat = document.getElementById('modalCategoryId') || document.getElementById('panelCategoryId');
      if (elAcc) elAcc.value = txn.account_id;
      if (elCat) elCat.value = txn.category_id || '';
    }
  }

  // Handle right-sidebar details view swap if on transactions.html
  const detailsEmpty = document.getElementById('detailsEmpty');
  const detailsActive = document.getElementById('detailsActive');
  if (detailsEmpty) detailsEmpty.style.display = 'none';
  if (detailsActive) detailsActive.style.display = 'none';

  if (overlay) {
    overlay.style.display = (overlay.id === 'detailsFormState') ? 'block' : 'flex';
  }
}

function closeTxnModal() {
  const overlay = document.getElementById('txnModalOverlay');
  if (overlay) overlay.style.display = 'none';

  const detailsFormState = document.getElementById('detailsFormState');
  if (detailsFormState) detailsFormState.style.display = 'none';

  const detailsEmpty = document.getElementById('detailsEmpty');
  if (detailsEmpty) detailsEmpty.style.display = 'block';
}

// 3. Switch Transaction Type (Expense, Income, Transfer)
function setTxnType(type) {
  txnModalState.currentType = type;

  // Toggle active class on all type selector buttons
  document.querySelectorAll('.txn-type-btn, .type-pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });

  const isTransfer = (type === 'Transfer');

  // Modal IDs
  const mSingle = document.getElementById('groupSingleAccount');
  const mCat = document.getElementById('groupCategory');
  const mFrom = document.getElementById('groupFromAccount');
  const mTo = document.getElementById('groupToAccount');

  if (mSingle) mSingle.style.display = isTransfer ? 'none' : 'flex';
  if (mCat) mCat.style.display = isTransfer ? 'none' : 'flex';
  if (mFrom) mFrom.style.display = isTransfer ? 'flex' : 'none';
  if (mTo) mTo.style.display = isTransfer ? 'flex' : 'none';

  // Panel IDs
  const pSingle = document.getElementById('panelGroupSingleAccount');
  const pCat = document.getElementById('panelGroupCategory');
  const pTransfer = document.getElementById('panelGroupTransferAccounts');

  if (pSingle) pSingle.style.display = isTransfer ? 'none' : 'flex';
  if (pCat) pCat.style.display = isTransfer ? 'none' : 'flex';
  if (pTransfer) pTransfer.style.display = isTransfer ? 'flex' : 'none';
}

// 4. Handle Form Submit (Save / Insert / Update)
async function handleTxnSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  const btnSave = document.getElementById('btnSaveTxn') || document.getElementById('panelBtnSave');
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.textContent = 'Saving...';
  }

  const txnId = (document.getElementById('modalTxnId') || document.getElementById('panelTxnId'))?.value || null;
  const pairId = (document.getElementById('modalTransferPairId') || document.getElementById('panelTransferPairId'))?.value || null;
  const type = txnModalState.currentType;

  const rawAmt = (document.getElementById('modalAmount') || document.getElementById('panelAmount'))?.value || '0';
  const amountNum = Math.abs(parseFloat(rawAmt) || 0);

  const dateVal = (document.getElementById('modalDate') || document.getElementById('panelDate'))?.value;
  const timeVal = (document.getElementById('modalTime') || document.getElementById('panelTime'))?.value || '12:00:00';
  
  const rawTitle = (document.getElementById('modalTitleInput') || document.getElementById('panelTitle'))?.value;
  const titleVal = (rawTitle && rawTitle.trim()) ? rawTitle.trim() : 'Untitled';

  const rawNotes = (document.getElementById('modalNotes') || document.getElementById('panelNotes'))?.value;
  const notesVal = (rawNotes && rawNotes.trim()) ? rawNotes.trim() : null;

  const hashId = buildManualHashId(dateVal, timeVal, amountNum);

  try {
    if (type === 'Transfer') {
      const fromAcc = (document.getElementById('modalFromAccountId') || document.getElementById('panelFromAccountId'))?.value;
      const toAcc = (document.getElementById('modalToAccountId') || document.getElementById('panelToAccountId'))?.value;

      if (!fromAcc || !toAcc || fromAcc === toAcc) {
        alert('From and To accounts must be selected and cannot be identical.');
        if (btnSave) {
          btnSave.disabled = false;
          btnSave.textContent = 'Save Transaction';
        }
        return;
      }

      if (txnId && pairId) {
        // Update both existing paired records
        await window.db.from('transactions').update({
          account_id: fromAcc,
          amount: -amountNum,
          date: dateVal,
          time: timeVal,
          title: titleVal,
          notes: notesVal,
          hash_id: hashId
        }).eq('id', txnId);

        await window.db.from('transactions').update({
          account_id: toAcc,
          amount: amountNum,
          date: dateVal,
          time: timeVal,
          title: titleVal,
          notes: notesVal,
          hash_id: hashId
        }).eq('id', pairId);

      } else {
        // Generate clean sequence IDs via Postgres sequence RPC
        const { data: idOut } = await window.db.rpc('fn_generate_txn_id');
        const { data: idIn } = await window.db.rpc('fn_generate_txn_id');

        const legOut = {
          id: idOut,
          account_id: fromAcc,
          date: dateVal,
          time: timeVal,
          title: titleVal,
          amount: -amountNum,
          type: 'Transfer',
          notes: notesVal,
          source: 'Manual',
          hash_id: hashId,
          transfer_pair_id: idIn
        };

        const legIn = {
          id: idIn,
          account_id: toAcc,
          date: dateVal,
          time: timeVal,
          title: titleVal,
          amount: amountNum,
          type: 'Transfer',
          notes: notesVal,
          source: 'Manual',
          hash_id: hashId,
          transfer_pair_id: idOut
        };

        const { error: insErr } = await window.db.from('transactions').insert([legOut, legIn]);
        if (insErr) throw insErr;
      }

    } else {
      // Expense or Income
      const signedAmt = (type === 'Expense') ? -amountNum : amountNum;
      const accountId = (document.getElementById('modalAccountId') || document.getElementById('panelAccountId'))?.value;
      const categoryId = (document.getElementById('modalCategoryId') || document.getElementById('panelCategoryId'))?.value || null;

      const record = {
        account_id: accountId,
        category_id: categoryId,
        date: dateVal,
        time: timeVal,
        title: titleVal,
        amount: signedAmt,
        type: type,
        notes: notesVal,
        hash_id: hashId,
        source: 'Manual',
        transfer_pair_id: null
      };

      if (txnId) {
        delete record.source;
        delete record.transfer_pair_id;
        const { error: updErr } = await window.db.from('transactions').update(record).eq('id', txnId);
        if (updErr) throw updErr;
      } else {
        // Omit 'id' so Postgres sequence automatically generates TXN000001
        const { error: insErr } = await window.db.from('transactions').insert([record]);
        if (insErr) throw insErr;
      }
    }

    closeTxnModal();

    // Trigger auto-refresh across all active screens
    if (typeof loadAccountsData === 'function') loadAccountsData();
    if (typeof renderDailyStream === 'function') renderDailyStream();
    if (typeof loadTransactionsTable === 'function') loadTransactionsTable();
    if (typeof fetchTransactions === 'function') fetchTransactions();

  } catch (err) {
    console.error('Save failed:', err);
    alert('Error saving transaction: ' + err.message);
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.textContent = 'Save Transaction';
    }
  }
}

// 5. Delete Handling (Cascades Transfer Pairs)
async function deleteCurrentTxn() {
  const txnId = (document.getElementById('modalTxnId') || document.getElementById('panelTxnId'))?.value;
  const pairId = (document.getElementById('modalTransferPairId') || document.getElementById('panelTransferPairId'))?.value;
  if (!txnId) return;

  const msg = pairId
    ? 'This is a paired transfer. Deleting it will delete both incoming and outgoing entries. Proceed?'
    : 'Are you sure you want to delete this transaction?';

  if (!confirm(msg)) return;

  const idsToDelete = pairId ? [txnId, pairId] : [txnId];
  const { error } = await window.db.from('transactions').delete().in('id', idsToDelete);

  if (error) {
    alert('Error deleting transaction: ' + error.message);
    return;
  }

  closeTxnModal();
  if (typeof loadAccountsData === 'function') loadAccountsData();
  if (typeof renderDailyStream === 'function') renderDailyStream();
  if (typeof loadTransactionsTable === 'function') loadTransactionsTable();
  if (typeof fetchTransactions === 'function') fetchTransactions();
}

// 6. Global Setup & Listener Registration
function initModalListeners() {
  // Bind forms
  const modalForm = document.getElementById('txnForm');
  if (modalForm) modalForm.addEventListener('submit', handleTxnSubmit);

  const panelForm = document.getElementById('panelTxnForm');
  if (panelForm) panelForm.addEventListener('submit', handleTxnSubmit);

  // Bind delete buttons
  const btnDelModal = document.getElementById('btnDeleteTxn');
  if (btnDelModal) btnDelModal.addEventListener('click', deleteCurrentTxn);

  const btnDelPanel = document.getElementById('btnDeleteActiveTxn');
  if (btnDelPanel) btnDelPanel.addEventListener('click', deleteCurrentTxn);

  // Bind close buttons
  const btnClose = document.getElementById('btnCloseTxnModal');
  if (btnClose) btnClose.addEventListener('click', closeTxnModal);

  const btnCancelPanel = document.getElementById('panelBtnCancel');
  if (btnCancelPanel) btnCancelPanel.addEventListener('click', closeTxnModal);

  // Overlay background click
  const overlay = document.getElementById('txnModalOverlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeTxnModal();
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initModalListeners);
} else {
  initModalListeners();
}

// Global window aliases to guarantee button onclick compatibility
window.openTransactionModal = openTransactionModal;
window.openAddTransactionPanel = openTransactionModal;
window.closeTxnModal = closeTxnModal;
window.cancelPanelForm = closeTxnModal;
window.setTxnType = setTxnType;
window.setPanelType = setTxnType;
window.handleTxnSubmit = handleTxnSubmit;
window.handlePanelFormSubmit = handleTxnSubmit;
window.deleteCurrentTxn = deleteCurrentTxn;
window.deleteActiveTransaction = deleteCurrentTxn;