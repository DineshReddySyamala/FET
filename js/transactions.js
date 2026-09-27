// ==========================================================================
// TRANSACTIONS PAGE CONTROLLER
// ==========================================================================

const state = {
  transactions: [],
  accounts: {},
  categories: {},
  selectedTransactionId: null,
  page: 1,
  pageSize: 50,
  totalCount: 0,
  filters: {
    search: '',
    startDate: '2026-08-01',
    endDate: '2026-09-30',
    accountId: 'ALL',
    categoryId: 'ALL',
    types: ['Expense', 'Income', 'Transfer'],
    sortBy: 'date_desc'
  }
};

// Category Color & Icon Palette
function getCategoryDesign(categoryName = '') {
  const cat = categoryName.toLowerCase();
  if (cat.includes('food') || cat.includes('dining') || cat.includes('snack')) {
    return { icon: '🍽️', bg: '#fef2f2', color: '#dc2626' };
  }
  if (cat.includes('transport') || cat.includes('uber') || cat.includes('fuel')) {
    return { icon: '🚗', bg: '#eff6ff', color: '#2563eb' };
  }
  if (cat.includes('shop') || cat.includes('blinkit') || cat.includes('amazon')) {
    return { icon: '🛍️', bg: '#fff7ed', color: '#ea580c' };
  }
  if (cat.includes('salary') || cat.includes('income')) {
    return { icon: '💼', bg: '#f0fdf4', color: '#16a34a' };
  }
  if (cat.includes('rent') || cat.includes('house') || cat.includes('bill')) {
    return { icon: '⚡', bg: '#fefce8', color: '#ca8a04' };
  }
  return { icon: '🏷️', bg: '#f1f5f9', color: '#475569' };
}

// 1. Load Master Tables
async function loadMasterData() {
  const [accRes, catRes] = await Promise.all([
    window.db.from('accounts').select('id, name'),
    window.db.from('categories').select('id, name')
  ]);

  if (accRes.data) {
    const accSelect = document.getElementById('filterAccount');
    accRes.data.forEach(a => {
      state.accounts[a.id] = a.name;
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      accSelect.appendChild(opt);
    });
  }

  if (catRes.data) {
    const catSelect = document.getElementById('filterCategory');
    catRes.data.forEach(c => {
      state.categories[c.id] = c.name;
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      catSelect.appendChild(opt);
    });
  }
}

// 2. Fetch Transactions from Supabase
async function fetchTransactions() {
  const tbody = document.getElementById('transactionTableBody');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 40px; color: var(--text-muted);">Loading transactions...</td></tr>';

  let query = window.db.from('transactions').select('*', { count: 'exact' });

  if (state.filters.startDate) query = query.gte('date', state.filters.startDate);
  if (state.filters.endDate) query = query.lte('date', state.filters.endDate);
  if (state.filters.types.length > 0) query = query.in('type', state.filters.types);
  if (state.filters.accountId !== 'ALL') query = query.eq('account_id', state.filters.accountId);
  if (state.filters.categoryId !== 'ALL') query = query.eq('category_id', state.filters.categoryId);

  if (state.filters.sortBy === 'date_desc') {
    query = query.order('date', { ascending: false }).order('time', { ascending: false });
  } else if (state.filters.sortBy === 'date_asc') {
    query = query.order('date', { ascending: true }).order('time', { ascending: true });
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
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--finny-expense);">Failed to load data.</td></tr>`;
    return;
  }

  state.transactions = data || [];
  state.totalCount = count || 0;

  renderWorkspace();
  calculateKPIs();
}

// 3. Render Center Workspace
function renderWorkspace() {
  const tbody = document.getElementById('transactionTableBody');
  const search = state.filters.search.toLowerCase();

  const filtered = state.transactions.filter(txn => {
    const title = (txn.title || '').toLowerCase();
    const acc = (state.accounts[txn.account_id] || '').toLowerCase();
    const cat = (state.categories[txn.category_id] || '').toLowerCase();
    return title.includes(search) || acc.includes(search) || cat.includes(search);
  });

  document.getElementById('paginationInfo').textContent = 
    `Showing ${filtered.length} of ${state.totalCount.toLocaleString('en-IN')} transactions`;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 40px; color: var(--text-muted);">No transactions match your current filters.</td></tr>';
    return;
  }

  let currentGroupDate = null;
  let html = '';

  filtered.forEach(txn => {
    if (txn.date !== currentGroupDate) {
      currentGroupDate = txn.date;
      html += `
        <tr class="date-group-header-row">
          <td colspan="8">${window.formatDateHeader(txn.date)}</td>
        </tr>
      `;
    }

    const isExpense = txn.type === 'Expense';
    const isIncome = txn.type === 'Income';
    const isTransfer = txn.type === 'Transfer';

    let amountClass = 'text-primary';
    let sign = '-';
    if (isIncome) {
      amountClass = 'income-val';
      sign = '+';
    } else if (isTransfer) {
      amountClass = 'transfer-val';
      sign = Number(txn.amount) < 0 ? '-' : '+';
    } else {
      amountClass = 'expense-val';
    }

    const catName = state.categories[txn.category_id] || (isTransfer ? 'Transfer' : 'General');
    const accName = state.accounts[txn.account_id] || 'Account';
    const design = getCategoryDesign(catName);
    const isSelected = txn.id === state.selectedTransactionId ? 'selected' : '';

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
          <span class="amount-cell ${amountClass}">${sign} ${window.formatINR(txn.amount)}</span>
        </td>
        <td class="text-right">
          <span class="cell-headline">₹—</span>
        </td>
        <td class="text-right">
          <span style="color:var(--text-muted); cursor:pointer;">⋮</span>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// 4. Calculate Dynamic KPIs
async function calculateKPIs() {
  const { data } = await window.db
    .from('transactions')
    .select('type, amount')
    .gte('date', state.filters.startDate)
    .lte('date', state.filters.endDate);

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

  document.getElementById('kpiTotalCount').textContent = data.length.toLocaleString('en-IN');
  document.getElementById('kpiIncomeVal').textContent = window.formatINR(incomeTotal);
  document.getElementById('kpiExpenseVal').textContent = window.formatINR(expenseTotal);
  document.getElementById('kpiTransferVal').textContent = window.formatINR(transferTotal);
  document.getElementById('kpiTransferCount').textContent = `${transferCount} transactions`;
  document.getElementById('typeCountAll').textContent = data.length;
}

// 5. Select Transaction & Show Details
window.selectTransaction = function(txnId) {
  state.selectedTransactionId = txnId;
  const txn = state.transactions.find(t => t.id === txnId);
  if (!txn) return;

  renderWorkspace();

  const emptyPanel = document.getElementById('detailsEmpty');
  const activePanel = document.getElementById('detailsActive');
  emptyPanel.style.display = 'none';
  activePanel.style.display = 'flex';

  const catName = state.categories[txn.category_id] || txn.type;
  const accName = state.accounts[txn.account_id] || 'Account';
  const design = getCategoryDesign(catName);

  document.getElementById('detailsAvatar').textContent = design.icon;
  document.getElementById('detailsPayee').textContent = txn.title || 'Untitled';
  document.getElementById('detailsDateTime').textContent = `${txn.date}, ${txn.time || ''}`;
  document.getElementById('detailsAmount').textContent = window.formatINR(txn.amount, true);
  document.getElementById('detailsAmount').style.color = txn.type === 'Income' ? 'var(--finny-income)' : 'var(--finny-expense)';

  document.getElementById('detFieldPayee').textContent = txn.title || '—';
  document.getElementById('detFieldCategory').textContent = catName;
  document.getElementById('detFieldAccount').textContent = accName;
  document.getElementById('detFieldDateTime').textContent = `${txn.date} ${txn.time || ''}`;
  document.getElementById('detFieldType').textContent = txn.type;
  document.getElementById('detFieldStatus').textContent = `● ${txn.status || 'Completed'}`;
  document.getElementById('detFieldNotes').textContent = txn.notes || 'None';
  document.getElementById('detAccountName').textContent = accName;
};

// 6. Setup Listeners
function setupListeners() {
  document.getElementById('filterSearch').addEventListener('input', (e) => {
    state.filters.search = e.target.value;
    renderWorkspace();
  });

  document.getElementById('filterAccount').addEventListener('change', (e) => {
    state.filters.accountId = e.target.value;
    fetchTransactions();
  });

  document.getElementById('filterCategory').addEventListener('change', (e) => {
    state.filters.categoryId = e.target.value;
    fetchTransactions();
  });

  document.getElementById('sortBySelect').addEventListener('change', (e) => {
    state.filters.sortBy = e.target.value;
    fetchTransactions();
  });

  document.getElementById('closeDetailsBtn').addEventListener('click', () => {
    document.getElementById('detailsActive').style.display = 'none';
    document.getElementById('detailsEmpty').style.display = 'block';
    state.selectedTransactionId = null;
    renderWorkspace();
  });

  document.getElementById('clearFiltersBtn').addEventListener('click', () => {
    document.getElementById('filterSearch').value = '';
    document.getElementById('filterAccount').value = 'ALL';
    document.getElementById('filterCategory').value = 'ALL';
    state.filters.search = '';
    state.filters.accountId = 'ALL';
    state.filters.categoryId = 'ALL';
    fetchTransactions();
  });

  document.getElementById('dateStart').value = state.filters.startDate;
  document.getElementById('dateEnd').value = state.filters.endDate;
  document.getElementById('dateStart').addEventListener('change', (e) => {
    state.filters.startDate = e.target.value;
    fetchTransactions();
  });
  document.getElementById('dateEnd').addEventListener('change', (e) => {
    state.filters.endDate = e.target.value;
    fetchTransactions();
  });
}

// Bootstrap
document.addEventListener('DOMContentLoaded', async () => {
  setupListeners();
  await loadMasterData();
  await fetchTransactions();
});