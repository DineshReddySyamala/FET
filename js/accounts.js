// ==========================================================================
// ACCOUNTS & BALANCE SHEET REAL-TIME CONTROLLER
// ==========================================================================

const accountsState = {
  accounts: [],
  accountBalances: {}, // { ACC0001: 185000.00 }
  asOfDate: '2026-09-30',
  activeTab: 'balanceSheet',
  expandedGroups: {}
};

// 1. Fetch Accounts & Dynamic Transaction-Derived Balances
async function loadAccountsData() {
  // A. Fetch all configured accounts
  const { data: accounts, error: accError } = await window.db
    .from('accounts')
    .select('*')
    .order('name', { ascending: true });

  if (accError) {
    console.error('Error loading accounts:', accError);
    return;
  }

  accountsState.accounts = accounts || [];

  // B. Query transactions up to "As Of" date to calculate real balances
  const { data: txns, error: txnError } = await window.db
    .from('transactions')
    .select('account_id, amount')
    .lte('date', accountsState.asOfDate);

  if (txnError) {
    console.error('Error aggregating balances:', txnError);
    return;
  }

  // C. Calculate running net for every account
  const sums = {};
  accountsState.accounts.forEach(a => { sums[a.id] = Number(a.opening_balance || 0); });
  (txns || []).forEach(t => {
    if (sums[t.account_id] !== undefined) {
      sums[t.account_id] += Number(t.amount || 0);
    }
  });

  accountsState.accountBalances = sums;

  renderAllViews();
}

// 2. Render KPIs, Balance Sheet, and Analysis
function renderAllViews() {
  let totalAssets = 0;
  let totalLiabilities = 0;
  let activeCount = 0;
  let archivedCount = 0;

  const assetGroups = {};
  const liabilityGroups = {};

  accountsState.accounts.forEach(acc => {
    if (acc.is_active) activeCount++; else archivedCount++;
    const balance = accountsState.accountBalances[acc.id] || 0;
    const isLiability = acc.classification === 'Liability';

    if (isLiability) {
      // In balance sheet presentation, liabilities are positive debt figures
      const debtAmount = Math.abs(balance);
      totalLiabilities += debtAmount;
      liabilityGroups[acc.account_group] = liabilityGroups[acc.account_group] || { accounts: [], total: 0 };
      liabilityGroups[acc.account_group].accounts.push({ ...acc, balance: debtAmount });
      liabilityGroups[acc.account_group].total += debtAmount;
    } else {
      const assetAmount = Math.max(0, balance);
      totalAssets += assetAmount;
      assetGroups[acc.account_group] = assetGroups[acc.account_group] || { accounts: [], total: 0 };
      assetGroups[acc.account_group].accounts.push({ ...acc, balance: assetAmount });
      assetGroups[acc.account_group].total += assetAmount;
    }
  });

  const netWorth = totalAssets - totalLiabilities;

  // Render 4 KPI Cards
  document.getElementById('kpiTotalAssets').textContent = window.formatINR(totalAssets);
  document.getElementById('kpiTotalLiabilities').textContent = window.formatINR(totalLiabilities);
  document.getElementById('kpiNetWorth').textContent = window.formatINR(netWorth);
  document.getElementById('kpiAccountCount').textContent = accountsState.accounts.length;
  document.getElementById('kpiAccountActiveSummary').textContent = `${activeCount} active • ${archivedCount} archived`;

  // Render Balance Sheet Cards
  document.getElementById('bsAssetsTotal').textContent = window.formatINR(totalAssets);
  document.getElementById('assetTotalFootVal').textContent = window.formatINR(totalAssets);
  document.getElementById('assetTotalCount').textContent = activeCount;

  document.getElementById('bsLiabilitiesTotal').textContent = window.formatINR(totalLiabilities);
  document.getElementById('liabilityTotalFootVal').textContent = window.formatINR(totalLiabilities);
  document.getElementById('liabilityTotalCount').textContent = Object.values(liabilityGroups).reduce((acc, g) => acc + g.accounts.length, 0);

  document.getElementById('sideNetWorthVal').textContent = window.formatINR(netWorth);

  renderGroupTable('assetGroupsBody', assetGroups, totalAssets, true);
  renderGroupTable('liabilityGroupsBody', liabilityGroups, totalLiabilities, false);
  renderAllocation(assetGroups, totalAssets, liabilityGroups, totalLiabilities);
  renderAccountListTable();
  renderKeyInsights(totalAssets, totalLiabilities, netWorth);
}

// 3. Render Expandable Groups Table
function renderGroupTable(tbodyId, groups, grandTotal, isAsset) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = '';

  const groupKeys = Object.keys(groups);
  if (groupKeys.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding:20px;">No ${isAsset ? 'assets' : 'liabilities'} recorded.</td></tr>`;
    return;
  }

  groupKeys.forEach(grpName => {
    const grp = groups[grpName];
    const pct = grandTotal > 0 ? ((grp.total / grandTotal) * 100).toFixed(1) : '0.0';
    const isExpanded = !!accountsState.expandedGroups[grpName];

    const tr = document.createElement('tr');
    tr.className = 'group-row';
    tr.onclick = () => {
      accountsState.expandedGroups[grpName] = !accountsState.expandedGroups[grpName];
      renderGroupTable(tbodyId, groups, grandTotal, isAsset);
    };

    tr.innerHTML = `
      <td><span class="group-row-toggle">${isExpanded ? '▼' : '▶'}</span> <strong>${grpName}</strong></td>
      <td class="text-center">${grp.accounts.length}</td>
      <td class="text-right"><strong>${window.formatINR(grp.total)}</strong></td>
      <td class="text-right">${pct}%</td>
    `;
    tbody.appendChild(tr);

    // Expand individual accounts under group
    if (isExpanded) {
      grp.accounts.forEach(acc => {
        const childTr = document.createElement('tr');
        childTr.className = 'child-account-row';
        childTr.innerHTML = `
          <td>↳ ${acc.name} <span class="text-muted" style="font-size:11px;">(${acc.institution || 'Direct'})</span></td>
          <td class="text-center">—</td>
          <td class="text-right">${window.formatINR(acc.balance)}</td>
          <td class="text-right text-muted">—</td>
        `;
        tbody.appendChild(childTr);
      });
    }
  });
}

// 4. Render Allocation Bars & Donut Legends
function renderAllocation(assetGroups, totalAssets, liabilityGroups, totalLiabilities) {
  const legend = document.getElementById('donutLegend');
  legend.innerHTML = '';

  const colors = ['#2563eb', '#16a34a', '#ea580c', '#ca8a04', '#7c3aed', '#64748b'];
  let cIdx = 0;

  const assetBars = document.getElementById('assetCompositionBars');
  assetBars.innerHTML = '';

  Object.entries(assetGroups).forEach(([name, g]) => {
    const color = colors[cIdx % colors.length];
    const pct = totalAssets > 0 ? ((g.total / totalAssets) * 100).toFixed(1) : 0;
    cIdx++;

    // Side mini legend
    legend.innerHTML += `
      <div class="donut-legend-item">
        <span><span class="legend-color-dot" style="background:${color};"></span>${name}</span>
        <strong>${pct}%</strong>
      </div>
    `;

    // Allocation view bars
    assetBars.innerHTML += `
      <div class="alloc-bar-item">
        <div class="alloc-bar-meta">
          <span>${name}</span>
          <strong>${window.formatINR(g.total)} (${pct}%)</strong>
        </div>
        <div class="alloc-bar-track">
          <div class="alloc-bar-fill" style="width:${pct}%; background:${color};"></div>
        </div>
      </div>
    `;
  });
}

// 5. Render Operational Account List Table
function renderAccountListTable() {
  const tbody = document.getElementById('allAccountsTableBody');
  const query = (document.getElementById('accSearchInput')?.value || '').toLowerCase();
  const groupFilter = document.getElementById('accGroupFilter')?.value || 'ALL';
  const statusFilter = document.getElementById('accStatusFilter')?.value || 'ACTIVE';

  const filtered = accountsState.accounts.filter(a => {
    const matchesSearch = a.name.toLowerCase().includes(query) || (a.institution || '').toLowerCase().includes(query);
    const matchesGroup = groupFilter === 'ALL' || a.account_group === groupFilter;
    const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' && a.is_active);
    return matchesSearch && matchesGroup && matchesStatus;
  });

  tbody.innerHTML = filtered.map(a => {
    const bal = accountsState.accountBalances[a.id] || 0;
    const isLiability = a.classification === 'Liability';
    const amountClass = isLiability ? 'expense-val' : 'income-val';

    return `
      <tr>
        <td><strong>${a.name}</strong> <div class="cell-subline">${a.account_number_masked || '****'}</div></td>
        <td>${a.account_group}</td>
        <td>${a.institution || 'Direct'}</td>
        <td><span class="category-pill" style="background:var(--bg-surface-secondary);">${a.classification}</span></td>
        <td class="text-right ${amountClass}"><strong>${window.formatINR(bal)}</strong></td>
        <td><span class="status-badge-active">● Active</span></td>
        <td class="text-right" style="cursor:pointer; color:var(--text-muted);">⋮</td>
      </tr>
    `;
  }).join('');
}

// 6. Dynamic Financial Insights
function renderKeyInsights(assets, liabilities, netWorth) {
  const ul = document.getElementById('insightsList');
  const debtRatio = assets > 0 ? ((liabilities / assets) * 100).toFixed(1) : 0;
  ul.innerHTML = `
    <li>• Net Worth stands at <strong>${window.formatINR(netWorth)}</strong>.</li>
    <li>• Debt-to-Asset ratio is <strong>${debtRatio}%</strong> across recorded liabilities.</li>
    <li>• You have <strong>${accountsState.accounts.length}</strong> accounts tracked inside Finny.</li>
  `;
}

// Tab Switching
document.querySelectorAll('.acc-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.acc-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.tab;
    if (target === 'balanceSheet') document.getElementById('tabBalanceSheet').classList.add('active');
    if (target === 'accountList') document.getElementById('tabAccountList').classList.add('active');
    if (target === 'trends') document.getElementById('tabTrends').classList.add('active');
    if (target === 'allocation') document.getElementById('tabAllocation').classList.add('active');
  });
});

// Date Picker Handler
document.addEventListener('DOMContentLoaded', () => {
  const asOf = document.getElementById('asOfDate');
  asOf.value = accountsState.asOfDate;
  asOf.addEventListener('change', (e) => {
    accountsState.asOfDate = e.target.value;
    loadAccountsData();
  });

  document.getElementById('accSearchInput')?.addEventListener('input', renderAccountListTable);
  loadAccountsData();
});