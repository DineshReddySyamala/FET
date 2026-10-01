// ==========================================================================
// TRANSACTIONS PAGE CONTROLLER (FINNY)
// Workspace Table, Filters, Window Running Balances, and KPIs
// ==========================================================================

const state = {
  transactions: [],
  accounts: {},
  categories: {},
  selectedTransactionId: null,
  page: 1,
  pageSize: 50,
  totalCount: 0,
  activeTxnForEdit: null,
  filters: {
    period: 'custom',
    search: '',
    startDate: '2026-08-01',
    endDate: '2026-09-30',
    accountId: 'ALL',
    categoryId: 'ALL',
    types: ['Expense', 'Income', 'Transfer'],
    sortBy: 'date_desc'
  }
};

// Date range calculation helpers
function getPresetDateRange(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dayOfWeek = now.getDay();

  const formatDate = dt => dt.toISOString().split('T')[0];

  switch (preset) {
    case 'this_week': {
      const start = new Date(y, m, d - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { start: formatDate(start), end: formatDate(end) };
    }
    case 'last_week': {
      const start = new Date(y, m, d - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { start: formatDate(start), end: formatDate(end) };
    }
    case 'this_month': {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      return { start: formatDate(start), end: formatDate(end) };
    }
    case 'last_month': {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return { start: formatDate(start), end: formatDate(end) };
    }
    case 'last_3_months': {
      const start = new Date(y, m - 2, 1);
      const end = new Date(y, m + 1, 0);
      return { start: formatDate(start), end: formatDate(end) };
    }
    case 'last_6_months': {
      const start = new Date(y, m - 5, 1);
      const end = new Date(y, m + 1, 0);
      return { start: formatDate(start), end: formatDate(end) };
    }
    case 'this_year': {
      const start = new Date(y, 0, 1);
      const end = new Date(y, 11, 31);
      return { start: formatDate(start), end: formatDate(end) };
    }
    case 'last_year': {
      const start = new Date(y - 1, 0, 1);
      const end = new Date(y - 1, 11, 31);
      return { start: formatDate(start), end: formatDate(end) };
    }
    default:
      return null;
  }
}

// Category Color & Icon Palette
function getCategoryDesign(categoryName = '') {
  const cat = (categoryName || '').toLowerCase();
  if (cat.includes('food') || cat.includes('dining') || cat.includes('snack') || cat.includes('biryani') || cat.includes('lunch')) {
    return { icon: '🍽️', bg: '#fef2f2', color: '#dc2626' };
  }
  if (cat.includes('transport') || cat.includes('uber') || cat.includes('fuel') || cat.includes('petrol')) {
    return { icon: '🚗', bg: '#eff6ff', color: '#2563eb' };
  }
  if (cat.includes('shop') || cat.includes('blinkit') || cat.includes('amazon') || cat.includes('grocer')) {
    return { icon: '🛍️', bg: '#fff7ed', color: '#ea580c' };
  }
  if (cat.includes('salary') || cat.includes('income')) {
    return { icon: '💼', bg: '#f0fdf4', color: '#16a34a' };
  }
  if (cat.includes('rent') || cat.includes('emi') || cat.includes('house') || cat.includes('bill')) {
    return { icon: '⚡', bg: '#fefce8', color: '#ca8a04' };
  }
  return { icon: '🏷️', bg: '#f1f5f9', color: '#475569' };
}

// 1. Load Master Tables & Dropdowns
async function loadMasterData() {
  const [accRes, catRes] = await Promise.all([
    window.db.from('accounts').select('id, name, is_active').order('name'),
    window.db.from('categories').select('id, name').order('name')
  ]);

  if (accRes.data) {
    const filterAcc = document.getElementById('filterAccount');
    accRes.data.forEach(a => {
      state.accounts[a.id] = a.name;
      if (filterAcc) {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.name;
        filterAcc.appendChild(opt);
      }
    });
  }

  if (catRes.data) {
    const filterCat = document.getElementById('filterCategory');
    catRes.data.forEach(c => {
      state.categories[c.id] = c.name;
      if (filterCat) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        filterCat.appendChild(opt);
      }
    });
  }
}

// 2. Fetch Transactions from PostgreSQL View (v_transactions)
async function fetchTransactions() {
  const tbody = document.getElementById('transactionTableBody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 40px; color: var(--text-muted);">Loading transactions...</td></tr>';
  }

  let query = window.db.from('v_transactions').select('*', { count: 'exact' });

  if (state.filters.startDate) query = query.gte('date', state.filters.startDate);
  if (state.filters.endDate) query = query.lte('date', state.filters.endDate);
  if (state.filters.types.length > 0) query = query.in('type', state.filters.types);
  if (state.filters.accountId !== 'ALL') query = query.eq('account_id', state.filters.accountId);
  if (state.filters.categoryId !== 'ALL') query = query.eq('category_id', state.filters.categoryId);

  if (state.filters.sortBy === 'date_desc') {
    query = query.order('date', { ascending: false }).order('time', { ascending: false }).order('id', { ascending: false });
  } else if (state.filters.sortBy === 'date_asc') {
    query = query.order('date', { ascending: true }).order('time', { ascending: true }).order('id', { ascending: true });
  } else if (state.filters.sortBy === 'amount_desc') {
    query = query.order('amount', { ascending: false });
  } else if (state.filters.sortBy === 'amount_asc') {
    query = query.order('amount', { ascending: true });
  }

  const from = (state.page - 1) * state.pageSize;
  const to = from + state.pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) {
    console.error('Fetch error:', error);
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--finny-expense);">Failed to load transactions.</td></tr>`;
    return;
  }

  state.transactions = data || [];
  state.totalCount = count || 0;

  renderWorkspace();
  calculateKPIs();
}

// 3. Render Center Workspace Table
function renderWorkspace() {
  const tbody = document.getElementById('transactionTableBody');
  if (!tbody) return;

  const search = state.filters.search.toLowerCase();

  const filtered = state.transactions.filter(txn => {
    const title = (txn.title || '').toLowerCase();
    const acc = (txn.account_name || state.accounts[txn.account_id] || '').toLowerCase();
    const cat = (txn.category_name || state.categories[txn.category_id] || '').toLowerCase();
    return title.includes(search) || acc.includes(search) || cat.includes(search);
  });

  const pageInfo = document.getElementById('paginationInfo');
  if (pageInfo) pageInfo.textContent = `Showing ${filtered.length} of ${state.totalCount.toLocaleString('en-IN')} transactions`;
  
  const pageIndicator = document.getElementById('pageIndicator');
  if (pageIndicator) pageIndicator.textContent = state.page;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 40px; color: var(--text-muted);">No transactions match your current filters.</td></tr>';
    return;
  }

  let currentGroupDate = null;
  let html = '';

  filtered.forEach(txn => {
    if (txn.date !== currentGroupDate) {
      currentGroupDate = txn.date;
      const headerDateStr = (typeof window.formatDateHeader === 'function') 
        ? window.formatDateHeader(txn.date) 
        : txn.date;

      html += `
        <tr class="date-group-header-row">
          <td colspan="8">${headerDateStr}</td>
        </tr>
      `;
    }

    const isIncome = txn.type === 'Income';
    const isTransfer = txn.type === 'Transfer';

    let amountClass = 'expense-val';
    let sign = '-';
    if (isIncome) {
      amountClass = 'income-val';
      sign = '+';
    } else if (isTransfer) {
      amountClass = 'transfer-val';
      sign = Number(txn.amount) < 0 ? '-' : '+';
    }

    const catName = txn.category_name || state.categories[txn.category_id] || (isTransfer ? 'Transfer' : 'General');
    const accName = txn.account_name || state.accounts[txn.account_id] || 'Account';
    const design = getCategoryDesign(catName);
    const isSelected = txn.id === state.selectedTransactionId ? 'selected' : '';

    const runBal = Number(txn.account_running_balance);
    let runBalStr = '—';
    if (!isNaN(runBal) && txn.account_running_balance !== null) {
      runBalStr = (runBal < 0 ? '- ₹' : '₹') + Math.abs(runBal).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }

    const amtNum = Math.abs(Number(txn.amount || 0));
    const amtStr = (typeof window.formatINR === 'function')
      ? window.formatINR(amtNum)
      : amtNum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    html += `
      <tr class="txn-row ${isSelected}" onclick="selectTransaction('${txn.id}')">
        <td><input type="checkbox" class="row-checkbox" onclick="event.stopPropagation()" /></td>
        <td>
          <div class="cell-headline">${txn.date}</div>
          <div class="cell-subline">${txn.time ? txn.time.slice(0, 5) : ''}</div>
        </td>
        <td>
          <div class="cell-flex">
            <span class="avatar-circle" style="background:${design.bg}; color:${design.color}">${design.icon}</span>
            <div>
              <div class="cell-headline">${txn.title || 'Untitled'}</div>
              <div class="cell-subline">${txn.notes || 'No description'}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="category-pill" style="background:${design.bg}; color:${design.color}">
            ${design.icon} ${catName}
          </span>
        </td>
        <td>
          <div class="cell-headline">${accName}</div>
          <div class="cell-subline">Active</div>
        </td>
        <td class="text-right">
          <span class="amount-cell ${amountClass}">${sign} ₹${amtStr}</span>
        </td>
        <td class="text-right">
          <span class="cell-headline font-semibold">${runBalStr}</span>
        </td>
        <td class="text-right">
          <button class="stage-icon-btn" onclick="event.stopPropagation(); window.openTransactionModal('${txn.id}')" title="Edit">✎</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// 4. Dynamic KPI Calculations
async function calculateKPIs() {
  let query = window.db.from('transactions').select('type, amount');
  if (state.filters.startDate) query = query.gte('date', state.filters.startDate);
  if (state.filters.endDate) query = query.lte('date', state.filters.endDate);
  if (state.filters.accountId !== 'ALL') query = query.eq('account_id', state.filters.accountId);

  const { data } = await query;
  if (!data) return;

  let incomeTotal = 0;
  let expenseTotal = 0;
  let transferTotal = 0;
  let transferCount = 0;

  data.forEach(t => {
    const amt = Math.abs(Number(t.amount) || 0);
    if (t.type === 'Income') incomeTotal += amt;
    if (t.type === 'Expense') expenseTotal += amt;
    if (t.type === 'Transfer') {
      transferTotal += amt;
      transferCount++;
    }
  });

  const fmt = num => (typeof window.formatINR === 'function') 
    ? window.formatINR(num) 
    : '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const kpiCount = document.getElementById('kpiTotalCount');
  const kpiInc = document.getElementById('kpiIncomeVal');
  const kpiExp = document.getElementById('kpiExpenseVal');
  const kpiTrf = document.getElementById('kpiTransferVal');
  const kpiTrfCount = document.getElementById('kpiTransferCount');
  const typeCountAll = document.getElementById('typeCountAll');

  if (kpiCount) kpiCount.textContent = data.length.toLocaleString('en-IN');
  if (kpiInc) kpiInc.textContent = fmt(incomeTotal);
  if (kpiExp) kpiExp.textContent = fmt(expenseTotal);
  if (kpiTrf) kpiTrf.textContent = fmt(transferTotal);
  if (kpiTrfCount) kpiTrfCount.textContent = `${transferCount} transactions`;
  if (typeCountAll) typeCountAll.textContent = data.length;
}

// 5. Right Sidebar Details View
window.selectTransaction = function(txnId) {
  state.selectedTransactionId = txnId;
  const txn = state.transactions.find(t => t.id === txnId);
  if (!txn) return;

  renderWorkspace();

  const detailsEmpty = document.getElementById('detailsEmpty');
  const activePanel = document.getElementById('detailsActive');
  if (detailsEmpty) detailsEmpty.style.display = 'none';
  if (activePanel) activePanel.style.display = 'flex';

  state.activeTxnForEdit = txn;

  const catName = txn.category_name || state.categories[txn.category_id] || txn.type;
  const accName = txn.account_name || state.accounts[txn.account_id] || 'Account';
  const design = getCategoryDesign(catName);

  const numAmt = Number(txn.amount || 0);
  const isExp = numAmt < 0;
  const amtDisplay = (isExp ? '- ₹' : '+ ₹') + Math.abs(numAmt).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const elAvatar = document.getElementById('detailsAvatar');
  const elPayee = document.getElementById('detailsPayee');
  const elDT = document.getElementById('detailsDateTime');
  const elAmount = document.getElementById('detailsAmount');

  if (elAvatar) elAvatar.textContent = design.icon;
  if (elPayee) elPayee.textContent = txn.title || 'Untitled';
  if (elDT) elDT.textContent = `${txn.date}, ${txn.time || ''}`;
  if (elAmount) {
    elAmount.textContent = amtDisplay;
    elAmount.style.color = (txn.type === 'Income') ? 'var(--finny-income)' : 'var(--finny-expense)';
  }

  const setField = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setField('detFieldPayee', txn.title || '—');
  setField('detFieldCategory', catName);
  setField('detFieldAccount', accName);
  setField('detFieldDateTime', `${txn.date} ${txn.time || ''}`);
  setField('detFieldType', txn.type);
  setField('detFieldStatus', `● Completed`);
  setField('detFieldNotes', txn.notes || 'None');
  setField('detAccountName', accName);

  const runBal = Number(txn.account_running_balance);
  let runBalStr = '—';
  if (!isNaN(runBal) && txn.account_running_balance !== null) {
    runBalStr = (runBal < 0 ? '- ₹' : '₹') + Math.abs(runBal).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  }
  setField('detAccountBalance', runBalStr);
};

// 6. Delegate Create & Edit to Central Modal
window.openAddTransactionPanel = function() {
  window.openTransactionModal(); // Delegates directly to transactionModal.js
};

window.switchToEditMode = function() {
  if (state.selectedTransactionId) {
    window.openTransactionModal(state.selectedTransactionId); // Delegates directly to transactionModal.js
  }
};

window.deleteActiveTransaction = async function() {
  if (!state.activeTxnForEdit) return;
  const txn = state.activeTxnForEdit;
  const pairId = txn.transfer_pair_id;

  const msg = pairId
    ? 'This is a paired transfer. Deleting it will remove both sides. Proceed?'
    : 'Are you sure you want to delete this transaction?';

  if (!confirm(msg)) return;

  const ids = pairId ? [txn.id, pairId] : [txn.id];
  const { error } = await window.db.from('transactions').delete().in('id', ids);

  if (error) {
    alert('Error deleting transaction: ' + error.message);
    return;
  }

  const detailsEmpty = document.getElementById('detailsEmpty');
  const detailsActive = document.getElementById('detailsActive');
  if (detailsActive) detailsActive.style.display = 'none';
  if (detailsEmpty) detailsEmpty.style.display = 'block';

  state.selectedTransactionId = null;
  state.activeTxnForEdit = null;
  await fetchTransactions();
};

// 7. Event Listeners Setup
function setupListeners() {
  const periodSel = document.getElementById('quickPeriodSelect');
  const customRangeBox = document.getElementById('customDateRangeControl');

  if (periodSel) {
    periodSel.addEventListener('change', (e) => {
      const val = e.target.value;
      state.filters.period = val;

      if (val === 'custom') {
        if (customRangeBox) customRangeBox.style.display = 'flex';
      } else {
        const range = getPresetDateRange(val);
        if (range) {
          state.filters.startDate = range.start;
          state.filters.endDate = range.end;
          const ds = document.getElementById('dateStart');
          const de = document.getElementById('dateEnd');
          if (ds) ds.value = range.start;
          if (de) de.value = range.end;
          state.page = 1;
          fetchTransactions();
        }
      }
    });
  }

  const ds = document.getElementById('dateStart');
  const de = document.getElementById('dateEnd');
  if (ds) {
    ds.value = state.filters.startDate;
    ds.addEventListener('change', (e) => {
      state.filters.startDate = e.target.value;
      state.page = 1;
      fetchTransactions();
    });
  }
  if (de) {
    de.value = state.filters.endDate;
    de.addEventListener('change', (e) => {
      state.filters.endDate = e.target.value;
      state.page = 1;
      fetchTransactions();
    });
  }

  document.getElementById('prevMonthBtn')?.addEventListener('click', () => {
    const cur = new Date(state.filters.startDate);
    const start = new Date(cur.getFullYear(), cur.getMonth() - 1, 1);
    const end = new Date(cur.getFullYear(), cur.getMonth(), 0);
    state.filters.startDate = start.toISOString().split('T')[0];
    state.filters.endDate = end.toISOString().split('T')[0];
    if (ds) ds.value = state.filters.startDate;
    if (de) de.value = state.filters.endDate;
    if (periodSel) periodSel.value = 'custom';
    fetchTransactions();
  });

  document.getElementById('nextMonthBtn')?.addEventListener('click', () => {
    const cur = new Date(state.filters.startDate);
    const start = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const end = new Date(cur.getFullYear(), cur.getMonth() + 2, 0);
    state.filters.startDate = start.toISOString().split('T')[0];
    state.filters.endDate = end.toISOString().split('T')[0];
    if (ds) ds.value = state.filters.startDate;
    if (de) de.value = state.filters.endDate;
    if (periodSel) periodSel.value = 'custom';
    fetchTransactions();
  });

  document.getElementById('filterSearch')?.addEventListener('input', (e) => {
    state.filters.search = e.target.value;
    renderWorkspace();
  });

  document.getElementById('filterAccount')?.addEventListener('change', (e) => {
    state.filters.accountId = e.target.value;
    state.page = 1;
    fetchTransactions();
  });

  document.getElementById('filterCategory')?.addEventListener('change', (e) => {
    state.filters.categoryId = e.target.value;
    state.page = 1;
    fetchTransactions();
  });

  document.getElementById('sortBySelect')?.addEventListener('change', (e) => {
    state.filters.sortBy = e.target.value;
    fetchTransactions();
  });

  document.querySelectorAll('.type-check').forEach(chk => {
    chk.addEventListener('change', () => {
      const checkedVals = Array.from(document.querySelectorAll('.type-check:checked')).map(c => c.value);
      state.filters.types = checkedVals;
      const typeAll = document.getElementById('typeAll');
      if (typeAll) typeAll.checked = (checkedVals.length === 3);
      state.page = 1;
      fetchTransactions();
    });
  });

  document.getElementById('typeAll')?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll('.type-check').forEach(c => c.checked = isChecked);
    state.filters.types = isChecked ? ['Expense', 'Income', 'Transfer'] : [];
    state.page = 1;
    fetchTransactions();
  });

  document.getElementById('prevPageBtn')?.addEventListener('click', () => {
    if (state.page > 1) {
      state.page--;
      fetchTransactions();
    }
  });

  document.getElementById('nextPageBtn')?.addEventListener('click', () => {
    if (state.page * state.pageSize < state.totalCount) {
      state.page++;
      fetchTransactions();
    }
  });

  document.getElementById('closeDetailsBtn')?.addEventListener('click', () => {
    const da = document.getElementById('detailsActive');
    const de = document.getElementById('detailsEmpty');
    if (da) da.style.display = 'none';
    if (de) de.style.display = 'block';
    state.selectedTransactionId = null;
    state.activeTxnForEdit = null;
    renderWorkspace();
  });

  document.getElementById('clearFiltersBtn')?.addEventListener('click', () => {
    const fs = document.getElementById('filterSearch');
    const fa = document.getElementById('filterAccount');
    const fc = document.getElementById('filterCategory');
    if (fs) fs.value = '';
    if (fa) fa.value = 'ALL';
    if (fc) fc.value = 'ALL';
    state.filters.search = '';
    state.filters.accountId = 'ALL';
    state.filters.categoryId = 'ALL';
    fetchTransactions();
  });
}

// Make fetchTransactions available globally for transactionModal to trigger table updates
window.fetchTransactions = fetchTransactions;
window.loadTransactionsTable = fetchTransactions;

// Bootstrap Page
document.addEventListener('DOMContentLoaded', async () => {
  setupListeners();
  await loadMasterData();
  await fetchTransactions();
});