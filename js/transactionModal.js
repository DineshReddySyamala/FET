// ==========================================================================
// FINNY CENTRAL TRANSACTION MODAL & REVIEW SYSTEM
// Universal Single Source of Truth for Add/Edit & Information Cards
// ==========================================================================

const txnModalState = {
  currentType: 'Expense',
  cachedAccounts: [],
  cachedCategories: [],
  cachedBalances: {},
  activeReviewTxn: null
};

// ==========================================================================
// FINNY AUTO-LEARNING CATEGORY & DESCRIPTION / PAYEE INTELLIGENCE SYSTEM
// ==========================================================================
window.FinnyCategoryLearner = {
  descCatMap: {}, // { "maid - bsr colony": "CAT0029", ... }
  knownDescriptions: new Set(),
  knownPayees: [], // [ { id: "PAY0001", name: "Amazon" }, ... ]
  initialized: false,

  init: async function() {
    try {
      // 1. Load from localStorage
      const savedMap = localStorage.getItem('finny_desc_cat_map');
      if (savedMap) {
        try { this.descCatMap = JSON.parse(savedMap) || {}; } catch(e){}
      }

      const savedDescs = localStorage.getItem('finny_known_descriptions');
      if (savedDescs) {
        try {
          const arr = JSON.parse(savedDescs) || [];
          arr.forEach(d => { if (d) this.knownDescriptions.add(d); });
        } catch(e){}
      }

      const savedPayees = localStorage.getItem('finny_known_payees');
      if (savedPayees) {
        try { this.knownPayees = JSON.parse(savedPayees) || []; } catch(e){}
      }

      // 2. Pre-seed from historical transactions and staged transactions in Supabase
      if (window.db) {
        const [txnRes, stagedRes, payeeRes] = await Promise.all([
          window.db.from('transactions').select('title, category_id, payee_id').order('id', { ascending: false }).limit(2500),
          window.db.from('staged_transactions').select('description, payee, category_id').limit(1000),
          window.db.from('payees').select('id, name').order('name')
        ]);

        if (txnRes.data) {
          txnRes.data.forEach(t => {
            if (t.title && t.title.trim()) {
              const clean = t.title.trim();
              this.knownDescriptions.add(clean);
              const key = clean.toLowerCase();
              if (t.category_id && !this.descCatMap[key]) {
                this.descCatMap[key] = t.category_id;
              }
            }
          });
        }

        if (stagedRes.data) {
          stagedRes.data.forEach(s => {
            if (s.description && s.description.trim()) {
              const clean = s.description.trim();
              this.knownDescriptions.add(clean);
              const key = clean.toLowerCase();
              if (s.category_id && !this.descCatMap[key]) {
                this.descCatMap[key] = s.category_id;
              }
            }
            if (s.payee && s.payee.trim()) {
              const pClean = s.payee.trim();
              if (!this.knownPayees.some(kp => kp.name?.toLowerCase() === pClean.toLowerCase())) {
                this.knownPayees.push({ id: null, name: pClean });
              }
            }
          });
        }

        if (payeeRes.data && payeeRes.data.length > 0) {
          payeeRes.data.forEach(p => {
            if (p.name && !this.knownPayees.some(kp => kp.id === p.id || kp.name?.toLowerCase() === p.name?.toLowerCase())) {
              this.knownPayees.push({ id: p.id, name: p.name });
            }
          });
        }
      }

      this.initialized = true;
      this.persist();
      this.populateDatalists();
      this.attachAllComboboxes();
    } catch (err) {
      console.warn('[Finny] Error initializing category learner:', err);
    }
  },

  persist: function() {
    try {
      localStorage.setItem('finny_desc_cat_map', JSON.stringify(this.descCatMap));
      localStorage.setItem('finny_known_descriptions', JSON.stringify(Array.from(this.knownDescriptions)));
      localStorage.setItem('finny_known_payees', JSON.stringify(this.knownPayees));
    } catch (e) {
      console.warn('[Finny] Could not save to localStorage:', e);
    }
  },

  populateDatalists: function() {
    const descDatalistIds = ['txnGlobalDescList', 'accDescDatalist', 'impDescDatalist', 'modalDescDatalist'];
    const payeeDatalistIds = ['txnGlobalPayeeList', 'accPayeeDatalist', 'impPayeeDatalist', 'modalPayeeDatalist'];

    // Sorted descriptions
    const sortedDescs = Array.from(this.knownDescriptions).filter(Boolean).sort((a, b) => a.localeCompare(b));
    const descOptions = sortedDescs.map(d => `<option value="${d.replace(/"/g, '&quot;')}">`).join('');

    descDatalistIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = descOptions;
    });

    // Sorted payees
    const sortedPayees = [...this.knownPayees].filter(p => p && p.name).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const payeeOptions = sortedPayees.map(p => `<option value="${p.name.replace(/"/g, '&quot;')}">`).join('');

    payeeDatalistIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = payeeOptions;
    });
  },

  setupCombobox: function(inputId, type, categorySelectId = null) {
    const input = document.getElementById(inputId);
    if (!input) return;

    // Check if dropdown already attached
    let dropdown = input.parentNode.querySelector('.finny-combobox-dropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'finny-combobox-dropdown';
      input.parentNode.style.position = 'relative';
      input.parentNode.appendChild(dropdown);
    }

    if (input._finnyComboboxAttached) return;
    input._finnyComboboxAttached = true;

    const renderItems = (filterText = '') => {
      const q = (filterText || '').trim().toLowerCase();
      let list = [];
      if (type === 'description') {
        const descs = Array.from(this.knownDescriptions).filter(Boolean);
        list = q ? descs.filter(d => d.toLowerCase().includes(q)) : descs.slice(0, 30);
      } else {
        const payees = this.knownPayees.map(p => p.name).filter(Boolean);
        list = q ? payees.filter(p => p.toLowerCase().includes(q)) : payees.slice(0, 30);
      }

      if (list.length === 0) {
        dropdown.innerHTML = '<div style="padding: 8px 12px; font-size: 12px; color: #94a3b8; font-style: italic;">No matching saved records. Type freely.</div>';
        dropdown.style.display = 'block';
        return;
      }

      dropdown.innerHTML = list.map(item => {
        let subText = '';
        if (type === 'description') {
          const catId = this.descCatMap[item.toLowerCase()];
          if (catId && window.accountsEngine && window.accountsEngine.categories) {
            subText = window.accountsEngine.categories[catId] || '';
          }
        }
        return `
          <div class="finny-combobox-item" data-value="${item.replace(/"/g, '&quot;')}">
            <span>${item}</span>
            ${subText ? `<span class="item-sub">${subText}</span>` : ''}
          </div>
        `;
      }).join('');

      dropdown.querySelectorAll('.finny-combobox-item').forEach(el => {
        el.onmousedown = (e) => {
          e.preventDefault();
          const val = el.getAttribute('data-value');
          input.value = val;
          dropdown.style.display = 'none';

          if (type === 'description' && categorySelectId) {
            this.handleDescInput(val, categorySelectId);
          }
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };
      });

      dropdown.style.display = 'block';
    };

    input.addEventListener('focus', () => renderItems(input.value));
    input.addEventListener('click', () => renderItems(input.value));
    input.addEventListener('input', () => {
      renderItems(input.value);
      if (type === 'description' && categorySelectId) {
        this.handleDescInput(input.value, categorySelectId);
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => { dropdown.style.display = 'none'; }, 200);
    });
  },

  attachAllComboboxes: function() {
    this.setupCombobox('txnTabDescription', 'description', 'txnTabCategoryId');
    this.setupCombobox('txnTabPayee', 'payee');
    this.setupCombobox('panelDescription', 'description', 'panelCategoryId');
    this.setupCombobox('panelPayee', 'payee');
    this.setupCombobox('modalDescription', 'description', 'modalCategoryId');
    this.setupCombobox('modalPayee', 'payee');
  },

  handleDescInput: function(descVal, categorySelectId) {
    if (!descVal) return;
    const key = descVal.trim().toLowerCase();
    const catSelect = document.getElementById(categorySelectId);
    if (!catSelect) return;

    const learnedCatId = this.descCatMap[key];
    if (learnedCatId) {
      const hasOpt = Array.from(catSelect.options).some(o => o.value === learnedCatId);
      if (hasOpt) {
        catSelect.value = learnedCatId;
        catSelect.classList.add('finny-autofilled');
        setTimeout(() => catSelect.classList.remove('finny-autofilled'), 1200);
      }
    }
  },

  handleCategoryChange: function(descInputId, newCatId) {
    const descInput = document.getElementById(descInputId);
    if (!descInput) return;
    const descVal = descInput.value.trim();
    if (!descVal || !newCatId) return;

    const key = descVal.toLowerCase();
    this.descCatMap[key] = newCatId;
    this.knownDescriptions.add(descVal);
    this.persist();
    this.populateDatalists();
  },

  recordDescription: function(descVal, catId) {
    if (!descVal || !descVal.trim()) return;
    const clean = descVal.trim();
    this.knownDescriptions.add(clean);
    if (catId) {
      this.descCatMap[clean.toLowerCase()] = catId;
    }
    this.persist();
    this.populateDatalists();
  },

  resolveOrCreatePayee: async function(payeeName) {
    if (!payeeName || !payeeName.trim()) return null;
    const clean = payeeName.trim();
    const cleanLower = clean.toLowerCase();

    // 1. Check if we already have it in memory/local
    const existing = this.knownPayees.find(p => p.name && p.name.toLowerCase() === cleanLower);
    if (existing && existing.id) {
      return existing.id;
    }

    // 2. Try inserting into Supabase payees table
    if (window.db) {
      try {
        const { data, error } = await window.db
          .from('payees')
          .insert({ name: clean })
          .select('id, name')
          .single();

        if (data && data.id) {
          this.knownPayees.push({ id: data.id, name: clean });
          this.persist();
          this.populateDatalists();
          return data.id;
        }
      } catch (err) {
        console.warn('[Finny] Payees table insert policy check:', err);
      }
    }

    // 3. Graceful fallback when RLS blocks table insert
    if (!this.knownPayees.some(p => p.name && p.name.toLowerCase() === cleanLower)) {
      this.knownPayees.push({ id: null, name: clean });
      this.persist();
      this.populateDatalists();
    }
    return null;
  }
};

window.finnyHandleDescInput = function(descVal, catSelectId) {
  window.FinnyCategoryLearner.handleDescInput(descVal, catSelectId);
};

window.finnyHandleCategoryChange = function(descInputId, catId) {
  window.FinnyCategoryLearner.handleCategoryChange(descInputId, catId);
};

// 1. Deterministic Hash Builder: H + YYYYMMDD + HHMMSS + AmountInPaise
window.buildFinnyHashId = function(dateStr, timeStr, amount) {
  const cleanDate = (dateStr || '').replace(/-/g, '').slice(0, 8);
  let cleanTime = '000000';
  if (timeStr && timeStr.indexOf(':') !== -1) {
    cleanTime = timeStr.replace(/[^0-9]/g, '').padEnd(6, '0').slice(0, 6);
  }
  const amountInPaise = Math.round(Math.abs(Number(amount || 0)) * 100);
  return 'H' + cleanDate + cleanTime + amountInPaise;
};

// 2. Preload Accounts, Categories & Balances from Supabase
async function preloadModalDropdowns() {
  try {
    if (!window.db) return;

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

    // Populate all modal and panel dropdown instances
    populateModalDropdowns();

    // Initialize intelligent category learner
    if (!window.FinnyCategoryLearner.initialized) {
      window.FinnyCategoryLearner.init();
    } else {
      window.FinnyCategoryLearner.populateDatalists();
    }
  } catch (err) {
    console.error('Error preloading transaction dropdowns:', err);
  }
}

function populateModalDropdowns() {
  const accOptions = txnModalState.cachedAccounts
    .map(a => `<option value="${a.id}">${a.name}${a.is_active ? '' : ' (Archived)'}</option>`)
    .join('');

  const catOptions = '<option value="">(No Category)</option>' +
    txnModalState.cachedCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  const targets = [
    'modalAccountId', 'modalFromAccountId', 'modalToAccountId',
    'panelAccountId', 'panelFromAccountId', 'panelToAccountId'
  ];

  targets.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = accOptions;
  });

  ['modalCategoryId', 'panelCategoryId'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = catOptions;
  });
}

// 3. Switch Transaction Type (Expense / Income / Transfer)
window.setModalTxnType = function(type) {
  txnModalState.currentType = type;

  // Update pills in Central Modal
  document.querySelectorAll('#finnyTxnModalOverlay .f-type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-type') === type);
  });

  // Update pills in Embedded Panel (if on transactions.html)
  document.querySelectorAll('.panel-type-switcher .type-pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-type') === type);
  });

  // Toggle Account fields
  const singleAccGroup = document.getElementById('modalGroupSingleAccount');
  const transferAccGroup = document.getElementById('modalGroupTransferAccounts');
  const catGroup = document.getElementById('modalGroupCategory');

  const panelSingle = document.getElementById('panelGroupSingleAccount');
  const panelTransfer = document.getElementById('panelGroupTransferAccounts');
  const panelCat = document.getElementById('panelGroupCategory');

  if (type === 'Transfer') {
    if (singleAccGroup) singleAccGroup.style.display = 'none';
    if (transferAccGroup) transferAccGroup.style.display = 'flex';
    if (catGroup) catGroup.style.display = 'none';

    if (panelSingle) panelSingle.style.display = 'none';
    if (panelTransfer) panelTransfer.style.display = 'flex';
    if (panelCat) panelCat.style.display = 'none';
  } else {
    if (singleAccGroup) singleAccGroup.style.display = 'flex';
    if (transferAccGroup) transferAccGroup.style.display = 'none';
    if (catGroup) catGroup.style.display = 'flex';

    if (panelSingle) panelSingle.style.display = 'flex';
    if (panelTransfer) panelTransfer.style.display = 'none';
    if (panelCat) panelCat.style.display = 'flex';
  }
};
window.setTxnType = window.setModalTxnType;
window.setPanelType = window.setModalTxnType;

// 4. Open Central Add / Edit Transaction Modal
window.openTransactionModal = async function(txnId = null, prefillData = null) {
  // 1. If on transactions.html (docked sidebar form exists), use docked form!
  if (document.getElementById('detailsFormState')) {
    if (txnId) {
      if (typeof window.switchToEditMode === 'function') {
        window.switchToEditMode(txnId);
        return;
      }
    } else {
      if (typeof window.openAddTransactionPanel === 'function') {
        window.openAddTransactionPanel();
        return;
      }
    }
  }

  // 2. If on accounts.html (docked inspector card exists), use docked inspector!
  if (document.getElementById('txnTabFormState')) {
    const isImportActive = document.getElementById('tabViewImport')?.classList?.contains('active');
    if (isImportActive) {
      if (txnId && typeof window.openAccountImportDrawer === 'function') {
        window.openAccountImportDrawer(txnId, false, true);
        return;
      }
    }

    if (txnId) {
      if (typeof window.openTxnTabDrawer === 'function') {
        window.openTxnTabDrawer(txnId, true);
        return;
      }
    } else {
      if (typeof window.openNewTransactionDrawer === 'function') {
        window.openNewTransactionDrawer(false);
        return;
      }
    }
  }

  // 3. Fallback for stand-alone modal dialog
  ensureModalDomInjected();
  await preloadModalDropdowns();

  const overlay = document.getElementById('finnyTxnModalOverlay');
  const modalTitle = document.getElementById('fModalTitle');
  const modalSubtitle = document.getElementById('fModalSubtitle');
  const form = document.getElementById('centralTxnForm');

  if (form) form.reset();

  const elTxnId = document.getElementById('modalTxnId');
  const elPairId = document.getElementById('modalTransferPairId');
  const elAmount = document.getElementById('modalAmount');
  const elPayee = document.getElementById('modalPayee');
  const elDescription = document.getElementById('modalDescription');
  const elDate = document.getElementById('modalDate');
  const elTime = document.getElementById('modalTime');
  const elNotes = document.getElementById('modalNotes');
  const elAccount = document.getElementById('modalAccountId');
  const elFromAccount = document.getElementById('modalFromAccountId');
  const elToAccount = document.getElementById('modalToAccountId');
  const elCategory = document.getElementById('modalCategoryId');

  if (elTxnId) elTxnId.value = txnId || '';
  if (elPairId) elPairId.value = '';

  if (!txnId) {
    // --- CREATE MODE ---
    if (modalTitle) modalTitle.textContent = 'Add Transaction';
    if (modalSubtitle) modalSubtitle.textContent = 'Enter transaction details';

    const now = new Date();
    if (elDate) elDate.value = now.toISOString().split('T')[0];
    if (elTime) elTime.value = now.toTimeString().split(' ')[0];

    const initialType = (prefillData && prefillData.type) ? prefillData.type : 'Expense';
    window.setModalTxnType(initialType);

    if (prefillData) {
      if (elAmount && prefillData.amount) elAmount.value = Math.abs(Number(prefillData.amount));
      if (elPayee && (prefillData.title || prefillData.payee)) elPayee.value = prefillData.title || prefillData.payee;
      if (elDescription && (prefillData.description || prefillData.notes)) elDescription.value = prefillData.description || prefillData.notes;
      if (elAccount && prefillData.account_id) elAccount.value = prefillData.account_id;
      if (elCategory && prefillData.category_id) elCategory.value = prefillData.category_id;
    }
  } else {
    // --- EDIT MODE ---
    if (modalTitle) modalTitle.textContent = 'Edit Transaction';
    if (modalSubtitle) modalSubtitle.textContent = 'Update transaction details';

    let txn = prefillData;
    if (!txn || !txn.title) {
      const { data, error } = await window.db
        .from('transactions')
        .select('*')
        .eq('id', txnId)
        .single();
      if (error || !data) {
        alert('Failed to load transaction: ' + (error ? error.message : 'Not found'));
        return;
      }
      txn = data;
    }

    if (elAmount) elAmount.value = Math.abs(Number(txn.amount));
    if (elDate) elDate.value = txn.date;
    if (elTime) elTime.value = txn.time || '12:00:00';
    if (elDescription) elDescription.value = txn.title || '';
    if (elPayee) elPayee.value = txn.payee_name || txn.payee || '';
    if (elNotes) elNotes.value = txn.notes || '';

    if (txn.type === 'Transfer') {
      window.setModalTxnType('Transfer');
      if (elPairId) elPairId.value = txn.transfer_pair_id || '';

      if (txn.transfer_pair_id) {
        const { data: pairTxn } = await window.db
          .from('transactions')
          .select('account_id, amount')
          .eq('id', txn.transfer_pair_id)
          .single();

        if (txn.amount < 0) {
          if (elFromAccount) elFromAccount.value = txn.account_id;
          if (pairTxn && elToAccount) elToAccount.value = pairTxn.account_id;
        } else {
          if (elToAccount) elToAccount.value = txn.account_id;
          if (pairTxn && elFromAccount) elFromAccount.value = pairTxn.account_id;
        }
      } else {
        if (txn.amount < 0) {
          if (elFromAccount) elFromAccount.value = txn.account_id;
        } else {
          if (elToAccount) elToAccount.value = txn.account_id;
        }
      }
    } else {
      window.setModalTxnType(txn.type || 'Expense');
      if (elAccount && txn.account_id) elAccount.value = txn.account_id;
      if (elCategory && txn.category_id) elCategory.value = txn.category_id;
    }
  }

  if (overlay) {
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('active'));
  }
};

window.closeTransactionModal = function() {
  const overlay = document.getElementById('finnyTxnModalOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => { overlay.style.display = 'none'; }, 200);
  }
  const oldOverlay = document.getElementById('txnModalOverlay');
  if (oldOverlay && oldOverlay !== overlay) {
    oldOverlay.style.display = 'none';
  }
};
window.closeTxnModal = window.closeTransactionModal;
window.cancelPanelForm = window.closeTransactionModal;

// 5. Handle Central Form Submission (Manual & Edit)
window.handleCentralTxnSubmit = async function(event) {
  if (event) event.preventDefault();

  const btnSave = document.getElementById('modalBtnSave') || document.getElementById('panelBtnSave');
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.textContent = 'Saving...';
  }

  try {
    const txnId = document.getElementById('modalTxnId')?.value || document.getElementById('panelTxnId')?.value;
    const pairId = document.getElementById('modalTransferPairId')?.value || document.getElementById('panelTransferPairId')?.value;

    const type = txnModalState.currentType;
    const amountVal = parseFloat(document.getElementById('modalAmount')?.value || document.getElementById('panelAmount')?.value || '0');
    if (isNaN(amountVal) || amountVal <= 0) {
      alert('Please enter a valid positive amount.');
      return;
    }

    const descVal = (document.getElementById('modalDescription')?.value || document.getElementById('panelDescription')?.value || '').trim();
    if (!descVal) {
      alert('Please enter a Description.');
      return;
    }

    const payeeVal = (document.getElementById('modalPayee')?.value || document.getElementById('panelPayee')?.value || '').trim();
    const notesExtra = (document.getElementById('modalNotes')?.value || document.getElementById('panelNotes')?.value || '').trim();

    const dateVal = document.getElementById('modalDate')?.value || document.getElementById('panelDate')?.value;
    const timeVal = document.getElementById('modalTime')?.value || document.getElementById('panelTime')?.value || '12:00:00';

    if (!dateVal) {
      alert('Please select a date.');
      return;
    }

    // Auto-learn category for description
    const categoryId = document.getElementById('modalCategoryId')?.value || document.getElementById('panelCategoryId')?.value || null;
    if (window.FinnyCategoryLearner) {
      window.FinnyCategoryLearner.recordDescription(descVal, categoryId);
    }

    // Resolve or auto-create payee
    let resolvedPayeeId = null;
    if (payeeVal && window.FinnyCategoryLearner) {
      resolvedPayeeId = await window.FinnyCategoryLearner.resolveOrCreatePayee(payeeVal);
    }

    let finalNotes = notesExtra;
    if (payeeVal && !resolvedPayeeId) {
      finalNotes = finalNotes ? `Payee: ${payeeVal}\n${finalNotes}` : `Payee: ${payeeVal}`;
    }

    const hashId = window.buildFinnyHashId(dateVal, timeVal, amountVal);

    if (type === 'Transfer') {
      const fromAcc = document.getElementById('modalFromAccountId')?.value || document.getElementById('panelFromAccountId')?.value;
      const toAcc = document.getElementById('modalToAccountId')?.value || document.getElementById('panelToAccountId')?.value;

      if (!fromAcc || !toAcc) {
        alert('Please select both From and To accounts for the transfer.');
        return;
      }
      if (fromAcc === toAcc) {
        alert('From and To accounts cannot be identical.');
        return;
      }

      if (txnId && pairId) {
        // Update both existing paired records
        await window.db.from('transactions').update({
          account_id: fromAcc,
          amount: -amountVal,
          date: dateVal,
          time: timeVal,
          title: descVal,
          payee_id: resolvedPayeeId,
          notes: finalNotes || null,
          hash_id: hashId
        }).eq('id', txnId);

        await window.db.from('transactions').update({
          account_id: toAcc,
          amount: amountVal,
          date: dateVal,
          time: timeVal,
          title: descVal,
          payee_id: resolvedPayeeId,
          notes: finalNotes || null,
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
          title: descVal,
          payee_id: resolvedPayeeId,
          amount: -amountVal,
          type: 'Transfer',
          notes: finalNotes || null,
          source: 'Manual',
          status: 'Completed',
          hash_id: hashId,
          transfer_pair_id: idIn
        };

        const legIn = {
          id: idIn,
          account_id: toAcc,
          date: dateVal,
          time: timeVal,
          title: descVal,
          payee_id: resolvedPayeeId,
          amount: amountVal,
          type: 'Transfer',
          notes: finalNotes || null,
          source: 'Manual',
          status: 'Completed',
          hash_id: hashId,
          transfer_pair_id: idOut
        };

        const { error: insErr } = await window.db.from('transactions').insert([legOut, legIn]);
        if (insErr) throw insErr;
      }

    } else {
      // Expense or Income
      const signedAmt = (type === 'Expense') ? -amountVal : amountVal;
      const accountId = document.getElementById('modalAccountId')?.value || document.getElementById('panelAccountId')?.value;

      if (!accountId) {
        alert('Please select an account.');
        return;
      }

      const record = {
        account_id: accountId,
        category_id: categoryId,
        payee_id: resolvedPayeeId,
        date: dateVal,
        time: timeVal,
        title: descVal,
        amount: signedAmt,
        type: type,
        notes: finalNotes || null,
        hash_id: hashId,
        source: 'Manual',
        status: 'Completed',
        transfer_pair_id: null
      };

      if (txnId) {
        delete record.source;
        delete record.transfer_pair_id;
        const { error: updErr } = await window.db.from('transactions').update(record).eq('id', txnId);
        if (updErr) throw updErr;
      } else {
        const { data: genId } = await window.db.rpc('fn_generate_txn_id');
        if (genId) record.id = genId;
        const { error: insErr } = await window.db.from('transactions').insert([record]);
        if (insErr) throw insErr;
      }
    }

    window.closeTransactionModal();

    // Trigger auto-refresh across whatever screen is active
    if (typeof loadTransactionsTable === 'function') loadTransactionsTable();
    if (typeof loadAccountsData === 'function') loadAccountsData();
    if (typeof renderDailyStream === 'function') renderDailyStream();
    if (typeof loadDashboardData === 'function') loadDashboardData();
    if (typeof calculateKPIs === 'function') calculateKPIs();

  } catch (err) {
    console.error('Save failed:', err);
    alert('Error saving transaction: ' + err.message);
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.textContent = 'Save';
    }
  }
};
window.handleTxnSubmit = window.handleCentralTxnSubmit;
window.handlePanelFormSubmit = window.handleCentralTxnSubmit;

// 6. Open Transaction Review / Information Card Modal (Screenshot 1)
window.openTransactionReviewModal = async function(txnIdOrObject) {
  ensureModalDomInjected();
  await preloadModalDropdowns();

  let txn = txnIdOrObject;
  if (typeof txnIdOrObject === 'string') {
    const { data, error } = await window.db
      .from('transactions')
      .select('*')
      .eq('id', txnIdOrObject)
      .single();
    if (error || !data) {
      alert('Could not find transaction: ' + (error ? error.message : txnIdOrObject));
      return;
    }
    txn = data;
  }

  txnModalState.activeReviewTxn = txn;

  // Resolve Names
  const accMap = {};
  txnModalState.cachedAccounts.forEach(a => { accMap[a.id] = a.name; });

  const catMap = {};
  txnModalState.cachedCategories.forEach(c => { catMap[c.id] = c.name; });

  const accName = accMap[txn.account_id] || txn.account_id || 'Account';
  const catName = catMap[txn.category_id] || (txn.type === 'Transfer' ? 'Transfer' : 'Uncategorized');

  // Format Amount
  const numAmt = Number(txn.amount || 0);
  const isExp = numAmt < 0;
  const absAmtStr = Math.abs(numAmt).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amtDisplay = (isExp ? '- ₹' : '+ ₹') + absAmtStr;

  const elOverlay = document.getElementById('finnyTxnReviewOverlay');
  const elPayee = document.getElementById('reviewPayee');
  const elDateTime = document.getElementById('reviewDateTime');
  const elAmount = document.getElementById('reviewAmount');

  if (elPayee) elPayee.textContent = txn.title || 'Untitled';
  if (elDateTime) elDateTime.textContent = `${txn.date}, ${txn.time || ''}`;
  if (elAmount) {
    elAmount.textContent = amtDisplay;
    elAmount.className = 'f-hero-amount ' + (txn.type === 'Income' ? 'income' : (txn.type === 'Transfer' ? 'transfer' : 'expense'));
  }

  // Key-Value Rows
  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setEl('reviewFieldPayee', txn.title || '—');

  // Parse Description vs Notes
  let descText = txn.notes || '—';
  let extraNotes = '';
  if (descText.includes('\nNotes: ')) {
    const p = descText.split('\nNotes: ');
    descText = p[0];
    extraNotes = p[1];
  }
  setEl('reviewFieldDescription', descText);

  setEl('reviewFieldCategory', catName);
  setEl('reviewFieldDateTime', `${txn.date} ${txn.time || ''}`);
  setEl('reviewFieldType', txn.type);
  setEl('reviewFieldStatus', '• ' + (txn.status || 'Completed'));

  // Hash ID
  const hashEl = document.getElementById('reviewFieldHashId');
  if (hashEl) {
    const safeHash = txn.hash_id || window.buildFinnyHashId(txn.date, txn.time, txn.amount);
    hashEl.innerHTML = `<span>${safeHash}</span> <span style="font-size:11px; opacity:0.7;">📋</span>`;
    hashEl.onclick = () => window.copyHashToClipboard(safeHash, hashEl);
  }

  // Handle Transfer From & To Accounts
  const rowSingle = document.getElementById('reviewRowSingleAccount');
  const rowFrom = document.getElementById('reviewRowFromAccount');
  const rowTo = document.getElementById('reviewRowToAccount');

  if (txn.type === 'Transfer') {
    if (rowSingle) rowSingle.style.display = 'none';
    if (rowFrom) rowFrom.style.display = 'flex';
    if (rowTo) rowTo.style.display = 'flex';

    if (txn.transfer_pair_id) {
      const { data: pair } = await window.db
        .from('transactions')
        .select('account_id, amount')
        .eq('id', txn.transfer_pair_id)
        .single();

      const pairAccName = pair ? (accMap[pair.account_id] || pair.account_id) : 'Destination';
      if (txn.amount < 0) {
        setEl('reviewFieldFromAccount', accName);
        setEl('reviewFieldToAccount', pairAccName);
      } else {
        setEl('reviewFieldFromAccount', pairAccName);
        setEl('reviewFieldToAccount', accName);
      }
    } else {
      if (txn.amount < 0) {
        setEl('reviewFieldFromAccount', accName);
        setEl('reviewFieldToAccount', 'External');
      } else {
        setEl('reviewFieldFromAccount', 'External');
        setEl('reviewFieldToAccount', accName);
      }
    }
  } else {
    if (rowSingle) rowSingle.style.display = 'flex';
    if (rowFrom) rowFrom.style.display = 'none';
    if (rowTo) rowTo.style.display = 'none';
    setEl('reviewFieldAccount', accName);
  }

  // Notes row
  const rowNotes = document.getElementById('reviewRowNotes');
  if (rowNotes) {
    if (extraNotes) {
      rowNotes.style.display = 'flex';
      setEl('reviewFieldNotes', extraNotes);
    } else {
      rowNotes.style.display = 'none';
    }
  }

  // Fetch Account Balance for Bottom Card
  setEl('reviewBalanceAccountName', accName);
  try {
    const { data: balData } = await window.db
      .from('v_account_balances')
      .select('current_balance, is_active')
      .eq('id', txn.account_id)
      .single();

    if (balData) {
      const bNum = Number(balData.current_balance || 0);
      const bStr = (bNum < 0 ? '- ₹' : '₹') + Math.abs(bNum).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      setEl('reviewBalanceAmount', bStr);
      setEl('reviewBalanceStatus', balData.is_active ? 'Active' : 'Archived');
    } else {
      setEl('reviewBalanceAmount', '₹0.00');
    }
  } catch (err) {
    console.warn('Could not fetch real-time balance for review card:', err);
  }

  // Switch to Details tab by default
  window.switchReviewTab('details');

  if (elOverlay) {
    elOverlay.style.display = 'flex';
    requestAnimationFrame(() => elOverlay.classList.add('active'));
  }
};

window.closeTransactionReviewModal = function() {
  const elOverlay = document.getElementById('finnyTxnReviewOverlay');
  if (elOverlay) {
    elOverlay.classList.remove('active');
    setTimeout(() => { elOverlay.style.display = 'none'; }, 200);
  }
};

window.switchReviewTab = function(tabName) {
  const tabDet = document.getElementById('tabReviewDetails');
  const tabHist = document.getElementById('tabReviewHistory');
  const detContent = document.getElementById('reviewDetailsContent');
  const histContent = document.getElementById('reviewHistoryContent');

  if (tabName === 'details') {
    if (tabDet) tabDet.classList.add('active');
    if (tabHist) tabHist.classList.remove('active');
    if (detContent) detContent.style.display = 'flex';
    if (histContent) histContent.style.display = 'none';
  } else {
    if (tabDet) tabDet.classList.remove('active');
    if (tabHist) tabHist.classList.add('active');
    if (detContent) detContent.style.display = 'none';
    if (histContent) histContent.style.display = 'flex';

    // Populate History
    const txn = txnModalState.activeReviewTxn;
    const histCreated = document.getElementById('reviewHistoryCreated');
    if (histCreated && txn) {
      const createdStr = txn.created_at ? new Date(txn.created_at).toLocaleString('en-IN') : `${txn.date} ${txn.time || ''}`;
      histCreated.textContent = `Recorded: ${createdStr} (Source: ${txn.source || 'Manual'})`;
    }
  }
};

// 7. Actions inside Review Modal
window.editTransactionFromReview = function() {
  const txn = txnModalState.activeReviewTxn;
  if (!txn) return;
  window.closeTransactionReviewModal();
  window.openTransactionModal(txn.id, txn);
};

window.duplicateTransactionFromReview = function() {
  const txn = txnModalState.activeReviewTxn;
  if (!txn) return;
  window.closeTransactionReviewModal();

  const cloneData = {
    ...txn,
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().split(' ')[0]
  };
  window.openTransactionModal(null, cloneData);
};

window.deleteTransactionFromReview = async function() {
  const txn = txnModalState.activeReviewTxn;
  if (!txn) return;

  const msg = txn.transfer_pair_id
    ? 'This is a paired transfer. Deleting it will remove both incoming and outgoing records. Proceed?'
    : 'Are you sure you want to delete this transaction?';

  if (!confirm(msg)) return;

  const ids = txn.transfer_pair_id ? [txn.id, txn.transfer_pair_id] : [txn.id];
  const { error } = await window.db.from('transactions').delete().in('id', ids);

  if (error) {
    alert('Error deleting transaction: ' + error.message);
    return;
  }

  window.closeTransactionReviewModal();
  if (typeof loadTransactionsTable === 'function') loadTransactionsTable();
  if (typeof loadAccountsData === 'function') loadAccountsData();
  if (typeof renderDailyStream === 'function') renderDailyStream();
  if (typeof loadDashboardData === 'function') loadDashboardData();
};

window.copyHashToClipboard = function(hashText, el) {
  if (!navigator.clipboard) return;
  navigator.clipboard.writeText(hashText).then(() => {
    const orig = el.innerHTML;
    el.innerHTML = `<span>Copied!</span> ✓`;
    setTimeout(() => { el.innerHTML = orig; }, 1500);
  });
};

// 8. Dynamic DOM Injection for Universal Multi-Page Support
function ensureModalDomInjected() {
  // A. Inject Add / Edit Modal if not already on the page
  if (!document.getElementById('finnyTxnModalOverlay')) {
    const modalHtml = `
    <div class="finny-modal-overlay" id="finnyTxnModalOverlay" style="display:none;">
      <div class="finny-modal-card">
        <div class="f-modal-header">
          <div class="f-modal-title-row">
            <div class="f-modal-avatar form-avatar">✍️</div>
            <div class="f-modal-headline">
              <h3 id="fModalTitle">Add Transaction</h3>
              <span id="fModalSubtitle">Enter transaction details</span>
            </div>
          </div>
          <button type="button" class="f-modal-close-btn" onclick="closeTransactionModal()">✕</button>
        </div>

        <form id="centralTxnForm" class="f-modal-body" onsubmit="handleCentralTxnSubmit(event)">
          <input type="hidden" id="modalTxnId" value="">
          <input type="hidden" id="modalTransferPairId" value="">

          <!-- Type Segmented Switcher -->
          <div class="f-type-switcher">
            <button type="button" class="f-type-btn active" data-type="Expense" onclick="setModalTxnType('Expense')">Expense</button>
            <button type="button" class="f-type-btn" data-type="Income" onclick="setModalTxnType('Income')">Income</button>
            <button type="button" class="f-type-btn" data-type="Transfer" onclick="setModalTxnType('Transfer')">Transfer</button>
          </div>

          <!-- Amount -->
          <div class="f-form-group">
            <label class="f-form-label">AMOUNT (₹) *</label>
            <input type="number" step="0.01" min="0.01" id="modalAmount" class="f-form-input f-amount-hero-input" placeholder="0.00" required>
          </div>

          <!-- Single Account -->
          <div class="f-form-group" id="modalGroupSingleAccount">
            <label class="f-form-label">ACCOUNT *</label>
            <select id="modalAccountId" class="f-form-select"></select>
          </div>

          <!-- Transfer Accounts (From & To) -->
          <div id="modalGroupTransferAccounts" style="display:none; flex-direction:column; gap:10px;">
            <div class="f-form-group">
              <label class="f-form-label">FROM ACCOUNT (DEBIT) *</label>
              <select id="modalFromAccountId" class="f-form-select"></select>
            </div>
            <div class="f-form-group">
              <label class="f-form-label">TO ACCOUNT (CREDIT) *</label>
              <select id="modalToAccountId" class="f-form-select"></select>
            </div>
          </div>

          <!-- Category -->
          <div class="f-form-group" id="modalGroupCategory">
            <label class="f-form-label">CATEGORY</label>
            <select id="modalCategoryId" class="f-form-select"></select>
          </div>

          <!-- Separate Payee & Description as requested -->
          <div class="f-form-group">
            <label class="f-form-label">PAYEE *</label>
            <input type="text" id="modalPayee" class="f-form-input" placeholder="e.g. Amazon, Swiggy, Jumbo Loan, Deloitte" required>
          </div>

          <div class="f-form-group">
            <label class="f-form-label">DESCRIPTION</label>
            <input type="text" id="modalDescription" class="f-form-input" placeholder="e.g. Grocery, Lunch, EMI, Salary">
          </div>

          <!-- Date & Time Row -->
          <div class="f-grid-2">
            <div class="f-form-group">
              <label class="f-form-label">DATE *</label>
              <input type="date" id="modalDate" class="f-form-input" required>
            </div>
            <div class="f-form-group">
              <label class="f-form-label">TIME</label>
              <input type="time" step="1" id="modalTime" class="f-form-input">
            </div>
          </div>

          <!-- Notes -->
          <div class="f-form-group">
            <label class="f-form-label">NOTES</label>
            <textarea id="modalNotes" class="f-form-textarea" rows="2" placeholder="Optional notes..."></textarea>
          </div>

          <!-- Actions -->
          <div class="f-modal-footer">
            <button type="button" class="btn btn-secondary flex-1" onclick="closeTransactionModal()">Cancel</button>
            <button type="submit" id="modalBtnSave" class="btn btn-primary flex-1">Save</button>
          </div>
        </form>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  // B. Inject Review / Information Card Modal if not already on the page
  if (!document.getElementById('finnyTxnReviewOverlay')) {
    const reviewHtml = `
    <div class="finny-modal-overlay" id="finnyTxnReviewOverlay" style="display:none;">
      <div class="finny-modal-card">
        <div class="f-modal-header">
          <div class="f-modal-title-row">
            <div class="f-modal-avatar review-avatar">🏷️</div>
            <div class="f-modal-headline">
              <h3 id="reviewPayee">Transaction Details</h3>
              <span id="reviewDateTime">01 Jan 2026</span>
            </div>
          </div>
          <button type="button" class="f-modal-close-btn" onclick="closeTransactionReviewModal()">✕</button>
        </div>

        <div class="f-modal-body">
          <!-- Hero Amount -->
          <div class="f-hero-amount" id="reviewAmount">₹0.00</div>

          <!-- Tabs -->
          <div class="f-review-tabs">
            <button type="button" class="f-review-tab active" id="tabReviewDetails" onclick="switchReviewTab('details')">Details</button>
            <button type="button" class="f-review-tab" id="tabReviewHistory" onclick="switchReviewTab('history')">History</button>
          </div>

          <!-- Details Content -->
          <div id="reviewDetailsContent" style="display:flex; flex-direction:column;">
            <div class="f-key-val-list">
              <div class="f-kv-row">
                <span class="f-kv-label">Payee</span>
                <span class="f-kv-value" id="reviewFieldPayee">—</span>
              </div>
              <div class="f-kv-row">
                <span class="f-kv-label">Description</span>
                <span class="f-kv-value" id="reviewFieldDescription">—</span>
              </div>
              <div class="f-kv-row">
                <span class="f-kv-label">Category</span>
                <span class="f-kv-value" id="reviewFieldCategory">—</span>
              </div>
              <div class="f-kv-row" id="reviewRowSingleAccount">
                <span class="f-kv-label">Account</span>
                <span class="f-kv-value" id="reviewFieldAccount">—</span>
              </div>
              <div class="f-kv-row" id="reviewRowFromAccount" style="display:none;">
                <span class="f-kv-label">From Account</span>
                <span class="f-kv-value" id="reviewFieldFromAccount">—</span>
              </div>
              <div class="f-kv-row" id="reviewRowToAccount" style="display:none;">
                <span class="f-kv-label">To Account</span>
                <span class="f-kv-value" id="reviewFieldToAccount">—</span>
              </div>
              <div class="f-kv-row">
                <span class="f-kv-label">Date & Time</span>
                <span class="f-kv-value" id="reviewFieldDateTime">—</span>
              </div>
              <div class="f-kv-row">
                <span class="f-kv-label">Type</span>
                <span class="f-kv-value" id="reviewFieldType">—</span>
              </div>
              <div class="f-kv-row">
                <span class="f-kv-label">Status</span>
                <span class="f-kv-value status-badge" id="reviewFieldStatus">
                  <span class="status-dot-green"></span> Completed
                </span>
              </div>
              <div class="f-kv-row">
                <span class="f-kv-label">Hash ID</span>
                <span class="f-hash-pill" id="reviewFieldHashId" title="Click to copy hash">
                  <span>H...</span>
                </span>
              </div>
              <div class="f-kv-row" id="reviewRowNotes" style="display:none;">
                <span class="f-kv-label">Notes</span>
                <span class="f-kv-value text-muted" id="reviewFieldNotes">—</span>
              </div>
            </div>

            <!-- Review Actions (Edit / Duplicate / Delete) -->
            <div class="f-review-actions">
              <button type="button" class="btn btn-secondary flex-1" onclick="editTransactionFromReview()">
                <span>✏️</span> Edit
              </button>
              <button type="button" class="btn btn-secondary flex-1" onclick="duplicateTransactionFromReview()">
                <span>📋</span> Duplicate
              </button>
              <button type="button" class="btn btn-outline flex-1" style="color:#ef4444; border-color:#fecdd3;" onclick="deleteTransactionFromReview()">
                <span>🗑️</span> Delete
              </button>
            </div>

            <!-- Account Balance Card -->
            <div class="f-account-balance-card" id="reviewBalanceCard">
              <div class="f-bal-card-top">
                <span class="f-bal-label">Account Balance</span>
                <span class="f-bal-status-pill" id="reviewBalanceStatus">Active</span>
              </div>
              <div class="f-bal-acc-name" id="reviewBalanceAccountName">Account</div>
              <div class="f-bal-amount" id="reviewBalanceAmount">₹0.00</div>
            </div>
          </div>

          <!-- History Content -->
          <div id="reviewHistoryContent" style="display:none; flex-direction:column; gap:10px; padding:10px 0;">
            <div style="font-size:13px; color:var(--text-secondary);" id="reviewHistoryCreated">
              Recorded in ledger
            </div>
          </div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', reviewHtml);
  }

  // Click outside overlay to dismiss
  ['finnyTxnModalOverlay', 'finnyTxnReviewOverlay'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', (e) => {
        if (e.target === el) {
          if (id === 'finnyTxnModalOverlay') window.closeTransactionModal();
          else window.closeTransactionReviewModal();
        }
      });
    }
  });
}

// 9. Global Document Event Setup
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.closeTransactionModal();
    window.closeTransactionReviewModal();
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    ensureModalDomInjected();
    if (window.FinnyCategoryLearner && !window.FinnyCategoryLearner.initialized) {
      window.FinnyCategoryLearner.init();
    }
  });
} else {
  ensureModalDomInjected();
  if (window.FinnyCategoryLearner && !window.FinnyCategoryLearner.initialized) {
    window.FinnyCategoryLearner.init();
  }
}