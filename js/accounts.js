// ==========================================================================
// FINNY ACCOUNTS CONTROLLER (BULLETPROOF PRODUCTION ENGINE)
// Unified Ledger + KPI Hero Headers (Review, Posted, Last Import)
// Full Historical Pagination + Collapsible Month Streams (Both Tabs)
// Optimistic & Silent Refreshes (Zero Screen Flash on Add / Update / Delete)
// ==========================================================================

const accountsEngine = {
  accounts: [],
  categories: {},
  selectedAccountId: null,
  activeTab: 'Transactions',
  currentDateFilter: 'last_6_months',
  importDateFilter: 'ALL',
  
  mergedTimeline: [],
  selectedDrawerItem: null,
  currentDrawerType: 'Expense',

  // Active Transaction Tab state
  currentTxnsList: [],
  selectedTxnTabItem: null,
  txnTabCurrentType: 'Expense',
  collapsedMonths: {},          // Tracks 'YYYY-MM' collapse in Transactions tab
  allMonthsCollapsed: true,

  // Import Tab state
  collapsedImportMonths: {},    // Tracks 'YYYY-MM' collapse in Import tab
  allImportMonthsCollapsed: true,

  // Reconciliation state
  reconSelectedYear: null,
  reconSelectedMonth: null,
  reconSelectedYM: null,
  reconYearly: {},
  reconMonthly: {},
  reconDaily: {},
  
  bankColors: {
    'kotak': '#ed1c24',
    'sbi': '#002e6e',
    'hdfc': '#004c8f',
    'icici': '#b31e23',
    'boi': '#0072bc',
    'tata neu': '#4a2574',
    'upi lite': '#16a34a',
    'default': '#2563eb'
  },
  categoryColors: {
    'food & dining': { bg: '#fee2e2', color: '#dc2626', icon: '🍽️' },
    'marriage expenses': { bg: '#fee2e2', color: '#dc2626', icon: '💍' },
    'medicines': { bg: '#fef3c7', color: '#d97706', icon: '💊' },
    'family expenses': { bg: '#fee2e2', color: '#dc2626', icon: '🛍️' },
    'shopping': { bg: '#fef3c7', color: '#d97706', icon: '🛍️️' },
    'transfer': { bg: '#ede9fe', color: '#7c3aed', icon: '⇆' },
    'salary': { bg: '#dcfce7', color: '#16a34a', icon: '💼' },
    'transport': { bg: '#e0f2fe', color: '#0284c7', icon: '🚗' },
    'groceries': { bg: '#fef3c7', color: '#d97706', icon: '🛒' },
    'bills & utilities': { bg: '#fef3c7', color: '#d97706', icon: '⚡' },
    'entertainment': { bg: '#ede9fe', color: '#7c3aed', icon: '🎬' },
    'loan payment': { bg: '#fee2e2', color: '#dc2626', icon: '🏦' },
    'interest': { bg: '#dcfce7', color: '#16a34a', icon: '🪙' },
    'default': { bg: '#f1f5f9', color: '#475569', icon: '🏷️' }
  }
};

function getDbClient() {
  if (window.db) return window.db;
  if (window.supabase && typeof window.supabase.from === 'function') return window.supabase;
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    const SUPABASE_URL = 'https://rijewldflpcdhhpirzob.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_NEtjbMlk3XjDxHJtaRiOdw_NZIPpFH3';
    window.db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return window.db;
  }
  return null;
}

function buildManualHashId(dateStr, timeStr, amount) {
  const cleanDate = (dateStr || '').replace(/[^0-9]/g, '').slice(0, 8);
  let cleanTime = '000000';
  if (timeStr && timeStr.indexOf(':') !== -1) {
    cleanTime = timeStr.replace(/[^0-9]/g, '').padEnd(6, '0').slice(0, 6);
  }
  const amountInPaise = Math.round(Math.abs(amount) * 100);
  return 'H' + cleanDate + cleanTime + amountInPaise;
}

function toLocalISODate(dt) {
  const d = (dt instanceof Date && !isNaN(dt.getTime())) ? dt : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sanitizeDateString(raw) {
  if (!raw) return toLocalISODate(new Date());
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  if (str.includes('/') || str.includes('-')) {
    const delimiter = str.includes('/') ? '/' : '-';
    const parts = str.split(delimiter);
    if (parts.length === 3 && parts[2].length === 4) {
      return `${parts[2]}-${String(parts[1]).padStart(2, '0')}-${String(parts[0]).padStart(2, '0')}`;
    }
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return toLocalISODate(parsed);
  return toLocalISODate(new Date());
}

function getDateRange(preset) {
  if (preset === 'ALL' || !preset) return null;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dayOfWeek = now.getDay();

  switch (preset) {
    case 'this_week': {
      const diff = d - (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
      const start = new Date(y, m, diff);
      const end = new Date(y, m, diff + 6);
      return { start: toLocalISODate(start), end: toLocalISODate(end) };
    }
    case 'last_week': {
      const diff = d - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - 7;
      const start = new Date(y, m, diff);
      const end = new Date(y, m, diff + 6);
      return { start: toLocalISODate(start), end: toLocalISODate(end) };
    }
    case 'this_month': {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      return { start: toLocalISODate(start), end: toLocalISODate(end) };
    }
    case 'last_month': {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return { start: toLocalISODate(start), end: toLocalISODate(end) };
    }
    case 'last_3_months': {
      const start = new Date(y, m - 2, 1);
      const end = new Date(y, m + 1, 0);
      return { start: toLocalISODate(start), end: toLocalISODate(end) };
    }
    case 'last_6_months': {
      const start = new Date(y, m - 5, 1);
      const end = new Date(y, m + 1, 0);
      return { start: toLocalISODate(start), end: toLocalISODate(end) };
    }
    case 'this_year': {
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    }
    case 'last_year': {
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` };
    }
    default:
      return null;
  }
}

function getGroupIcon(groupName = '') {
  const g = (groupName || '').toLowerCase();
  if (g.includes('bank')) return '🏦';
  if (g.includes('invest') || g.includes('stock') || g.includes('mutual')) return '📈';
  if (g.includes('wallet') || g.includes('cash') || g.includes('upi')) return '👛';
  if (g.includes('card') || g.includes('credit')) return '💳';
  if (g.includes('gold')) return '🪙';
  if (g.includes('loan') || g.includes('borrow')) return '👥';
  if (g.includes('deposit') || g.includes('fd') || g.includes('rd')) return '🔒';
  if (g.includes('property') || g.includes('real estate')) return '🏠';
  return '📦';
}

function formatCurrency(num) {
  const val = Math.abs(Number(num) || 0);
  return val.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatBalanceINR(val) {
  const num = Number(val || 0);
  const isNeg = num < 0;
  const absVal = Math.abs(num);
  const formatted = absVal.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return (isNeg ? '-₹' : '₹') + formatted;
}

document.addEventListener('DOMContentLoaded', async () => {
  setupFilterListeners();
  await Promise.all([
    loadCategories(),
    loadAccountsHierarchy()
  ]);
});

async function loadCategories() {
  const db = getDbClient();
  if (!db) return;
  try {
    const { data } = await db.from('categories').select('id, name').order('name');
    if (data) {
      const filterCat = document.getElementById('accFilterCategory');
      const importFilterCat = document.getElementById('accImportFilterCategory');
      const panelCat = document.getElementById('panelCategoryId');
      const txnTabCat = document.getElementById('txnTabCategoryId');

      let opts = '<option value="ALL">All Categories</option>';
      let panelOpts = '<option value="">(No Category)</option>';

      data.forEach(c => {
        accountsEngine.categories[c.id] = c.name;
        opts += `<option value="${c.id}">${c.name}</option>`;
        panelOpts += `<option value="${c.id}">${c.name}</option>`;
      });

      if (filterCat) filterCat.innerHTML = opts;
      if (importFilterCat) importFilterCat.innerHTML = opts;
      if (panelCat) panelCat.innerHTML = panelOpts;
      if (txnTabCat) txnTabCat.innerHTML = panelOpts;
    }
  } catch (err) {
    console.warn('Could not load categories:', err);
  }
}

async function loadAccountsHierarchy(silent = false) {
  const db = getDbClient();
  if (!db) return;

  const { data: accountsList, error: aErr } = await db.from('accounts').select('*').order('name');
  if (aErr || !accountsList) return;

  accountsEngine.accounts = accountsList;

  // Render tree DOM fully only on initial load or non-silent refresh
  if (!silent || !document.getElementById('assetsDynamicGroups')?.hasChildNodes()) {
    renderHierarchyTree();

    const accOptions = accountsEngine.accounts
      .map(a => `<option value="${a.id}">${a.name} (${a.account_number_masked ? a.account_number_masked.slice(-4) : '****'})</option>`)
      .join('');

    const panelAcc = document.getElementById('panelAccountId');
    const panelFrom = document.getElementById('panelFromAccountId');
    const panelTo = document.getElementById('panelToAccountId');
    const txnTabAcc = document.getElementById('txnTabAccountId');
    const txnTabFrom = document.getElementById('txnTabFromAccountId');
    const txnTabTo = document.getElementById('txnTabToAccountId');

    if (panelAcc) panelAcc.innerHTML = accOptions;
    if (panelFrom) panelFrom.innerHTML = accOptions;
    if (panelTo) panelTo.innerHTML = accOptions;
    if (txnTabAcc) txnTabAcc.innerHTML = accOptions;
    if (txnTabFrom) txnTabFrom.innerHTML = accOptions;
    if (txnTabTo) txnTabTo.innerHTML = accOptions;
  } else {
    // In-place silent balance refresh without collapsing user's open tree
    updateSidebarBalancesOnly();
  }

  const defaultAcc = accountsEngine.accounts.find(a => a.name.toLowerCase().includes('sbi')) || 
                     accountsEngine.accounts.find(a => a.name.toLowerCase().includes('kotak')) || 
                     accountsEngine.accounts[0];
                     
  if (defaultAcc && !accountsEngine.selectedAccountId) {
    selectAccount(defaultAcc.id);
  }
}

function updateSidebarBalancesOnly() {
  let totalAssets = 0;
  let totalLiab = 0;

  accountsEngine.accounts.forEach(a => {
    const bal = Number(a.current_balance || a.opening_balance || 0);
    const grp = (a.account_group || '').toLowerCase();
    const isLiability = grp.includes('loan') || grp.includes('card') || grp.includes('credit') || grp.includes('borrow');
    if (isLiability) totalLiab += Math.abs(bal);
    else totalAssets += bal;

    // In-place account row update
    const rowEl = document.querySelector(`.h-acc-row[onclick*="${a.id}"]`);
    if (rowEl) {
      const balSpan = rowEl.querySelector('.h-acc-bal-text');
      if (balSpan) {
        balSpan.textContent = `${bal < 0 ? '-₹' : '₹'}${formatCurrency(bal)}`;
        balSpan.className = `h-acc-bal-text ${bal < 0 ? 'negative' : ''}`;
      }
    }
  });

  const elAssetsTotal = document.getElementById('sidebarAssetsTotal');
  const elLiabTotal = document.getElementById('sidebarLiabTotal');
  if (elAssetsTotal) elAssetsTotal.textContent = `₹${formatCurrency(totalAssets)}`;
  if (elLiabTotal) elLiabTotal.textContent = `₹${formatCurrency(totalLiab)}`;

  const netWorth = totalAssets - totalLiab;
  const nwElem = document.getElementById('sidebarNetWorthVal');
  if (nwElem) {
    nwElem.textContent = (netWorth < 0 ? '-₹' : '₹') + formatCurrency(Math.abs(netWorth));
    nwElem.style.color = netWorth >= 0 ? '#0f172a' : '#dc2626';
  }

  const curAcc = accountsEngine.accounts.find(a => String(a.id) === String(accountsEngine.selectedAccountId));
  if (curAcc) {
    const curBal = Number(curAcc.current_balance || curAcc.opening_balance || 0);
    const heroBal = document.getElementById('heroCurrentBalance');
    if (heroBal) heroBal.textContent = (curBal < 0 ? '-₹' : '₹') + formatCurrency(curBal);
  }
}

function renderHierarchyTree() {
  const assetsContainer = document.getElementById('assetsDynamicGroups');
  const liabContainer = document.getElementById('liabDynamicGroups');
  if (!assetsContainer || !liabContainer) return;

  assetsContainer.innerHTML = '';
  liabContainer.innerHTML = '';

  let totalAssets = 0;
  let totalLiab = 0;

  const assetGroups = {};
  const liabGroups = {};

  accountsEngine.accounts.forEach(a => {
    const bal = Number(a.current_balance || a.opening_balance || 0);
    const grp = (a.account_group || 'Other Accounts').trim();
    const grpLower = grp.toLowerCase();

    const isLiability = grpLower.includes('loan') || 
                        grpLower.includes('card') || 
                        grpLower.includes('credit') || 
                        grpLower.includes('liability') ||
                        grpLower.includes('borrow');

    if (isLiability) {
      totalLiab += Math.abs(bal);
      if (!liabGroups[grp]) liabGroups[grp] = [];
      liabGroups[grp].push(a);
    } else {
      totalAssets += bal;
      if (!assetGroups[grp]) assetGroups[grp] = [];
      assetGroups[grp].push(a);
    }
  });

  const elAssetsTotal = document.getElementById('sidebarAssetsTotal');
  const elLiabTotal = document.getElementById('sidebarLiabTotal');
  if (elAssetsTotal) elAssetsTotal.textContent = `₹${formatCurrency(totalAssets)}`;
  if (elLiabTotal) elLiabTotal.textContent = `₹${formatCurrency(totalLiab)}`;

  const netWorth = totalAssets - totalLiab;
  const nwElem = document.getElementById('sidebarNetWorthVal');
  if (nwElem) {
    nwElem.textContent = (netWorth < 0 ? '-₹' : '₹') + formatCurrency(Math.abs(netWorth));
    nwElem.style.color = netWorth >= 0 ? '#0f172a' : '#dc2626';
  }

  const buildGroupHTML = (groupsDict, container, autoExpandBank) => {
    Object.keys(groupsDict).sort().forEach((grpName, idx) => {
      const accList = groupsDict[grpName];
      const grpSum = accList.reduce((sum, item) => sum + Number(item.current_balance || item.opening_balance || 0), 0);
      
      const isBank = grpName.toLowerCase().includes('bank');
      const isExpanded = autoExpandBank && isBank;
      const groupId = 'grp_' + grpName.replace(/[^a-zA-Z0-9]/g, '_') + '_' + idx;
      const chevId = 'chev_' + groupId;

      const groupDiv = document.createElement('div');
      groupDiv.className = 'h-subgroup-item';
      const sign = grpSum < 0 ? '-₹' : '₹';

      groupDiv.innerHTML = `
        <div class="h-subgroup-header" onclick="toggleHierarchyGroup('${groupId}', '${chevId}')">
          <div class="h-sg-left">
            <span class="h-chev" id="${chevId}">${isExpanded ? '▾' : '▸'}</span>
            <span class="h-sg-icon">${getGroupIcon(grpName)}</span>
            <span class="h-sg-title">${grpName}</span>
          </div>
          <span class="h-sg-total">${sign}${formatCurrency(grpSum)}</span>
        </div>
        <div class="h-accounts-items ${isExpanded ? '' : 'hidden'}" id="${groupId}">
          ${accList.map(a => {
            const isSelected = String(a.id) === String(accountsEngine.selectedAccountId) ? 'selected' : '';
            const bal = Number(a.current_balance || a.opening_balance || 0);
            const isNeg = bal < 0;

            let bg = accountsEngine.bankColors.default;
            const nameLow = a.name.toLowerCase();
            for (let key in accountsEngine.bankColors) {
              if (nameLow.includes(key)) { bg = accountsEngine.bankColors[key]; break; }
            }

            const mask = a.account_number_masked ? `•••• ${a.account_number_masked.slice(-4)}` : '';

            return `
              <div class="h-acc-row ${isSelected}" onclick="selectAccount('${a.id}')">
                <div class="h-acc-left-meta">
                  <div class="h-bank-circle" style="background:${bg};">
                    ${a.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div class="h-acc-title-col">
                    <span class="h-acc-name-text">${a.name} <span class="h-mask-sub">${mask}</span></span>
                  </div>
                </div>
                <span class="h-acc-bal-text ${isNeg ? 'negative' : ''}">
                  ${isNeg ? '-₹' : '₹'}${formatCurrency(bal)}
                </span>
              </div>
            `;
          }).join('')}
        </div>
      `;
      container.appendChild(groupDiv);
    });
  };

  buildGroupHTML(assetGroups, assetsContainer, true);
  buildGroupHTML(liabGroups, liabContainer, false);
}

window.selectAccount = async function(accId) {
  accountsEngine.selectedAccountId = accId;
  const acc = accountsEngine.accounts.find(a => String(a.id) === String(accId));
  if (!acc) return;

  renderHierarchyTree();

  document.getElementById('heroAccName').textContent = acc.name;
  const mask = acc.account_number_masked ? `•••• ${acc.account_number_masked.slice(-4)}` : '•••• 1234';
  document.getElementById('heroAccMeta').textContent = `${acc.account_group || 'Bank Accounts'} • ${mask}`;

  const curBal = Number(acc.current_balance || acc.opening_balance || 0);
  document.getElementById('heroCurrentBalance').textContent = (curBal < 0 ? '-₹' : '₹') + formatCurrency(curBal);

  let bg = accountsEngine.bankColors.default;
  const nameLow = acc.name.toLowerCase();
  for (let key in accountsEngine.bankColors) {
    if (nameLow.includes(key)) { bg = accountsEngine.bankColors[key]; break; }
  }
  const heroLogo = document.getElementById('heroAccLogo');
  heroLogo.style.background = bg;
  heroLogo.textContent = acc.name.slice(0, 2).toUpperCase();

  await loadAccountHeaderMetrics(acc);

  if (accountsEngine.activeTab === 'Import') {
    await loadAccountImportTimeline();
  } else if (accountsEngine.activeTab === 'Reconciliation') {
    await loadAccountReconciliation();
  } else {
    await loadAccountTransactions();
  }
};

// ==========================================================================
// ACCOUNT HEADER KPI METRICS LOADER (Parallel Batched Requests)
// ==========================================================================
async function loadAccountHeaderMetrics(acc) {
  const db = getDbClient();
  if (!db || !acc) return;

  const accId = acc.id;
  const accName = (acc.name || '').trim().toLowerCase();
  const last4 = acc.account_number_masked ? acc.account_number_masked.slice(-4) : '';

  try {
    const [stagedRes, postedRes, batchRes] = await Promise.all([
      db.from('staged_transactions').select('amount, account_id, raw_account, status').ilike('status', 'Pending'),
      db.from('transactions').select('amount').eq('account_id', accId),
      db.from('import_batches').select('imported_at').order('imported_at', { ascending: false }).limit(1)
    ]);

    const matchedStaged = (stagedRes.data || []).filter(st => {
      if (st.account_id && String(st.account_id) === String(accId)) return true;
      const raw = String(st.raw_account || '').toLowerCase();
      if (raw && accName && (raw.includes(accName) || accName.includes(raw))) return true;
      if (last4 && raw && raw.includes(last4)) return true;
      return false;
    });

    const reviewCount = matchedStaged.length;
    const reviewTotal = matchedStaged.reduce((sum, st) => sum + Math.abs(Number(st.amount || 0)), 0);

    const elRevCount = document.getElementById('heroKpiReviewCount');
    const elRevAmt = document.getElementById('heroKpiReviewAmt');
    if (elRevCount) elRevCount.textContent = `${reviewCount} transaction${reviewCount !== 1 ? 's' : ''}`;
    if (elRevAmt) elRevAmt.textContent = `₹${formatCurrency(reviewTotal)}`;

    const recTxns = postedRes.data || [];
    const postedCount = recTxns.length;
    const postedTotal = recTxns.reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);

    const elPostCount = document.getElementById('heroKpiPostedCount');
    const elPostAmt = document.getElementById('heroKpiPostedAmt');
    if (elPostCount) elPostCount.textContent = `${postedCount} transaction${postedCount !== 1 ? 's' : ''}`;
    if (elPostAmt) elPostAmt.textContent = `₹${formatCurrency(postedTotal)}`;

    const batches = batchRes.data || [];
    const elDate = document.getElementById('heroKpiLastImportDate');
    const elTime = document.getElementById('heroKpiLastImportTime');

    if (batches.length > 0 && batches[0].imported_at) {
      const d = new Date(batches[0].imported_at);
      if (elDate) elDate.textContent = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      if (elTime) elTime.textContent = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } else {
      if (elDate) elDate.textContent = 'No imports';
      if (elTime) elTime.textContent = '—';
    }

  } catch (err) {
    console.error('[Finny] Could not load header metrics:', err);
  }
}

// ==========================================================================
// 1. TAB 1: TRANSACTIONS (SILENT IN-PLACE RE-RENDER WITH AUTO-EXPAND)
// ==========================================================================
async function loadAccountTransactions(isSilent = false, autoExpandYM = null) {
  const tbody = document.getElementById('accLedgerBody');
  if (!tbody) return;

  // Show loading indicator only on full tab load, NOT during in-place saves
  if (!isSilent) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:#64748b;">Loading transactions...</td></tr>';
  }

  const db = getDbClient();
  const accId = accountsEngine.selectedAccountId;
  if (!db || !accId) return;

  const range = getDateRange(accountsEngine.currentDateFilter);

  // Directly fetch from 'transactions' to eliminate slow fallback delays
  let query = db
    .from('transactions')
    .select('*, categories(name)')
    .eq('account_id', accId)
    .order('date', { ascending: false })
    .order('time', { ascending: false })
    .order('id', { ascending: false });

  if (range) query = query.gte('date', range.start).lte('date', range.end);
  const { data: txns, error } = await query;

  if (error) {
    console.error('[Finny] Fetch error:', error);
    if (!isSilent) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:40px; color:#ef4444;">Error loading transactions.</td></tr>`;
    }
    return;
  }

  accountsEngine.currentTxnsList = txns || [];

  if (accountsEngine.currentTxnsList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:40px; color:#64748b;">No transactions found for this period.</td></tr>`;
    clearSelectedTxnTabItem();
    return;
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthMap = {};

  accountsEngine.currentTxnsList.forEach(t => {
    const dStr = sanitizeDateString(t.date);
    const ym = dStr.slice(0, 7);
    if (!monthMap[ym]) {
      monthMap[ym] = { count: 0, credits: 0, debits: 0, closing: null, days: {} };
      if (accountsEngine.collapsedMonths[ym] === undefined) {
        accountsEngine.collapsedMonths[ym] = true;
      }
    }

    const amt = Number(t.amount || 0);
    monthMap[ym].count++;
    if (amt >= 0) monthMap[ym].credits += amt;
    else monthMap[ym].debits += Math.abs(amt);

    if (monthMap[ym].closing === null) {
      monthMap[ym].closing = t.account_running_balance !== undefined ? Number(t.account_running_balance) : null;
    }

    if (!monthMap[ym].days[dStr]) monthMap[ym].days[dStr] = [];
    monthMap[ym].days[dStr].push(t);
  });

  // Automatically expand the month that was just added or edited
  if (autoExpandYM) {
    accountsEngine.collapsedMonths[autoExpandYM] = false;
  }

  // Preserve table scroll offset across silent in-place update
  const scrollContainer = document.querySelector('.acc-ledger-table-container');
  const prevScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

  let html = '';

  Object.keys(monthMap).sort().reverse().forEach(ym => {
    const mData = monthMap[ym];
    const ymParts = ym.split('-');
    const y = ymParts[0];
    const mIdx = parseInt(ymParts[1], 10) - 1;
    const mLabel = `${monthNames[mIdx]} ${y}`;
    const netMonth = mData.credits - mData.debits;
    const isCollapsed = Boolean(accountsEngine.collapsedMonths[ym]);

    html += `
      <tr class="table-month-header-row" onclick="toggleMonthTransactions('${ym}')">
        <td colspan="9">
          <div class="table-month-header-content">
            <div class="month-header-left">
              <span class="month-toggle-arrow" id="monthArrow_${ym}">${isCollapsed ? '▸' : '▾'}</span>
              <span class="month-header-icon">🗓️</span>
              <span><strong>${mLabel}</strong></span>
              <span class="month-txn-count">(${mData.count} transaction${mData.count > 1 ? 's' : ''})</span>
            </div>
            <div class="month-header-right">
              <span class="month-stat-credit font-bold">+${formatBalanceINR(mData.credits)}</span>
              <span class="month-stat-debit font-bold">-${formatBalanceINR(mData.debits)}</span>
              <span class="month-stat-net ${netMonth < 0 ? 'expense-val' : 'income-val'} font-bold">
                Net: ${netMonth >= 0 ? '+' : '-'}${formatBalanceINR(Math.abs(netMonth))}
              </span>
              ${mData.closing !== null ? `<span style="color:#64748b; font-size:11px;">Month End: <strong style="color:#0f172a;">${formatBalanceINR(mData.closing)}</strong></span>` : ''}
            </div>
          </div>
        </td>
      </tr>
    `;

    Object.keys(mData.days).sort().reverse().forEach(dStr => {
      const dayTxns = mData.days[dStr];
      const dObj = new Date(dStr + 'T00:00:00');
      const dayFormatted = !isNaN(dObj.getTime())
        ? dObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        : dStr;
      const dayClosingBal = dayTxns[0].account_running_balance !== undefined ? Number(dayTxns[0].account_running_balance) : null;

      html += `
        <tr class="day-header-tr month-group-${ym}" style="display: ${isCollapsed ? 'none' : 'table-row'};">
          <td colspan="9">
            <div class="day-header-row">
              <div class="day-title-left">
                <span>📅</span>
                <span>${dayFormatted}</span>
                <span class="day-txn-count-pill">(${dayTxns.length} transaction${dayTxns.length > 1 ? 's' : ''})</span>
              </div>
              <div class="day-closing-right">
                ${dayClosingBal !== null ? `Closing Balance: <strong>${formatBalanceINR(dayClosingBal)}</strong>` : ''}
              </div>
            </div>
          </td>
        </tr>
      `;

      dayTxns.forEach(t => {
        const isIncome = t.type === 'Income';
        const isTransfer = t.type === 'Transfer';
        const amtVal = Number(t.amount || 0);
        const sign = isIncome ? '+ ' : '- ';
        const amtClass = isIncome ? 'income-val' : (isTransfer ? 'transfer-val' : 'expense-val');
        const displayTitle = t.title || t.payee || 'Untitled';
        const catName = t.categories?.name || accountsEngine.categories[t.category_id] || (isTransfer ? 'Transfer' : 'General');
        const catDesign = accountsEngine.categoryColors[catName.toLowerCase()] || accountsEngine.categoryColors.default;
        const isSelected = accountsEngine.selectedTxnTabItem && String(accountsEngine.selectedTxnTabItem.id) === String(t.id);

        html += `
          <tr class="txn-tab-row month-group-${ym} ${isSelected ? 'selected-recon-row' : ''}" style="display: ${isCollapsed ? 'none' : 'table-row'};" onclick="openTxnTabDrawer('${t.id}')">
            <td onclick="event.stopPropagation()"><input type="checkbox" /></td>
            <td>${t.time ? String(t.time).slice(0, 5) : '12:00'}</td>
            <td><strong>${displayTitle}</strong></td>
            <td>${displayTitle}</td>
            <td>
              <span class="cat-pill-badge" style="background:${catDesign.bg}; color:${catDesign.color};">
                <span>${catDesign.icon}</span> ${catName}
              </span>
            </td>
            <td class="text-right">
              <span class="amt-val-bold ${amtClass}">${sign}${formatCurrency(amtVal)}</span>
            </td>
            <td class="text-center">
              <span class="type-pill-box ${t.type ? t.type.toLowerCase() : 'expense'}">${t.type || 'Expense'}</span>
            </td>
            <td class="text-right">
              <span class="run-bal-text">${t.account_running_balance !== undefined ? formatBalanceINR(t.account_running_balance) : '—'}</span>
            </td>
            <td class="text-right">
              <button class="stage-icon-btn" onclick="event.stopPropagation(); openTxnTabDrawer('${t.id}', true)">✏️</button>
            </td>
          </tr>
        `;
      });
    });
  });

  tbody.innerHTML = html;

  // Restore scroll position
  if (scrollContainer && isSilent) {
    scrollContainer.scrollTop = prevScrollTop;
  }

  if (!accountsEngine.selectedTxnTabItem && accountsEngine.currentTxnsList.length > 0) {
    openTxnTabDrawer(accountsEngine.currentTxnsList[0].id, false);
  }
}

window.toggleMonthTransactions = function(ym) {
  const isCurrentlyCollapsed = Boolean(accountsEngine.collapsedMonths[ym]);
  const newCollapsedState = !isCurrentlyCollapsed;
  accountsEngine.collapsedMonths[ym] = newCollapsedState;

  const rows = document.querySelectorAll(`.month-group-${ym}`);
  rows.forEach(r => {
    r.style.display = newCollapsedState ? 'none' : 'table-row';
  });

  const arrow = document.getElementById(`monthArrow_${ym}`);
  if (arrow) arrow.textContent = newCollapsedState ? '▸' : '▾';
};

window.toggleAllTransactionMonths = function() {
  accountsEngine.allMonthsCollapsed = !accountsEngine.allMonthsCollapsed;
  const shouldCollapse = accountsEngine.allMonthsCollapsed;

  Object.keys(accountsEngine.collapsedMonths).forEach(ym => {
    accountsEngine.collapsedMonths[ym] = shouldCollapse;
    const rows = document.querySelectorAll(`.month-group-${ym}`);
    rows.forEach(r => {
      r.style.display = shouldCollapse ? 'none' : 'table-row';
    });
    const arrow = document.getElementById(`monthArrow_${ym}`);
    if (arrow) arrow.textContent = shouldCollapse ? '▸' : '▾';
  });

  const btn = document.getElementById('btnToggleAllMonths');
  if (btn) {
    btn.innerHTML = shouldCollapse ? '<span>⤢</span> Expand All' : '<span>⤡</span> Collapse All';
  }
};

// ==========================================================================
// TRANSACTIONS TAB DOCKED INSPECTOR CONTROLLER
// ==========================================================================
window.openTxnTabDrawer = function(txnId, forceEdit = false) {
  const item = accountsEngine.currentTxnsList.find(t => String(t.id) === String(txnId));
  if (!item) return;

  accountsEngine.selectedTxnTabItem = item;

  document.querySelectorAll('.txn-tab-row').forEach(r => r.classList.remove('selected-recon-row'));
  event?.currentTarget?.classList?.add('selected-recon-row');

  const viewState = document.getElementById('txnTabViewState');
  const formState = document.getElementById('txnTabFormState');

  if (!forceEdit) {
    if (viewState) viewState.style.display = 'block';
    if (formState) formState.style.display = 'none';
    renderRichCardDetails('txnViewDynamicContainer', item);

    document.getElementById('txnViewTitle').textContent = item.title || item.payee || 'Transaction Details';
    document.getElementById('txnViewDateTime').textContent = `${sanitizeDateString(item.date)} • ${item.time ? String(item.time).slice(0, 5) : '12:00'}`;

    const amt = Number(item.amount || 0);
    const amtEl = document.getElementById('txnViewAmount');
    amtEl.textContent = (amt < 0 ? '-₹' : '+₹') + formatCurrency(Math.abs(amt));
    amtEl.style.color = amt < 0 ? '#dc2626' : '#16a34a';

    const typeBadge = document.getElementById('txnViewTypeBadge');
    typeBadge.textContent = item.type || (amt < 0 ? 'Expense' : 'Income');
    typeBadge.className = `type-pill-box ${(item.type || 'Expense').toLowerCase()}`;

    const acc = accountsEngine.accounts.find(a => String(a.id) === String(item.account_id));
    document.getElementById('txnViewAccount').textContent = acc ? acc.name : 'Current Account';

    const catName = item.categories?.name || accountsEngine.categories[item.category_id] || (item.type === 'Transfer' ? 'Transfer' : 'General');
    document.getElementById('txnViewCategory').textContent = catName;

    const runBal = item.account_running_balance !== undefined ? item.account_running_balance : item.running_balance;
    document.getElementById('txnViewBalanceAfter').textContent = runBal !== undefined ? formatBalanceINR(runBal) : '—';
    document.getElementById('txnViewNotes').textContent = item.notes || 'No remarks';

    document.getElementById('btnEditTxnTab').onclick = () => openTxnTabDrawer(item.id, true);
    document.getElementById('btnDeleteTxnTab').onclick = () => deleteRecordedTxn(item.id);
    return;
  }

  if (viewState) viewState.style.display = 'none';
  if (formState) formState.style.display = 'block';

  document.getElementById('txnFormHeaderTitle').textContent = 'Edit Transaction';
  document.getElementById('txnFormHeaderSubtitle').textContent = 'Update recorded details';
  document.getElementById('btnTxnTabSave').textContent = 'Save Changes';

  document.getElementById('txnTabFormId').value = item.id;
  document.getElementById('txnTabTransferPairId').value = item.transfer_pair_id || '';
  document.getElementById('txnTabDate').value = sanitizeDateString(item.date);
  document.getElementById('txnTabTime').value = item.time ? String(item.time).slice(0, 8) : '12:00:00';
  document.getElementById('txnTabPayee').value = item.title || item.payee || '';
  document.getElementById('txnTabAmount').value = Math.abs(Number(item.amount || 0));
  document.getElementById('txnTabNotes').value = item.notes || '';

  const flowType = item.type || (Number(item.amount) < 0 ? 'Expense' : 'Income');
  setTxnTabType(flowType);

  if (item.category_id) {
    document.getElementById('txnTabCategoryId').value = item.category_id;
  }

  const accSelect = document.getElementById('txnTabAccountId');
  if (accSelect) accSelect.value = item.account_id || accountsEngine.selectedAccountId;

  const fromSelect = document.getElementById('txnTabFromAccountId');
  if (fromSelect) fromSelect.value = item.account_id || accountsEngine.selectedAccountId;

  recalcTxnTabBalancePreview();
};

window.openNewTransactionDrawer = function() {
  accountsEngine.selectedTxnTabItem = null;
  document.querySelectorAll('.txn-tab-row').forEach(r => r.classList.remove('selected-recon-row'));

  const viewState = document.getElementById('txnTabViewState');
  const formState = document.getElementById('txnTabFormState');
  if (viewState) viewState.style.display = 'none';
  if (formState) formState.style.display = 'block';

  document.getElementById('txnTabEntryForm').reset();
  document.getElementById('txnTabFormId').value = '';
  document.getElementById('txnTabTransferPairId').value = '';

  document.getElementById('txnFormHeaderTitle').textContent = 'Add Transaction';
  document.getElementById('txnFormHeaderSubtitle').textContent = 'Record a new entry directly into this account';
  document.getElementById('btnTxnTabSave').textContent = 'Save Transaction';

  const today = toLocalISODate(new Date());
  document.getElementById('txnTabDate').value = today;
  
  const now = new Date();
  const timeStr = [now.getHours(), now.getMinutes(), now.getSeconds()].map(v => String(v).padStart(2, '0')).join(':');
  document.getElementById('txnTabTime').value = timeStr;

  const accSelect = document.getElementById('txnTabAccountId');
  if (accSelect) accSelect.value = accountsEngine.selectedAccountId;

  const fromSelect = document.getElementById('txnTabFromAccountId');
  if (fromSelect) fromSelect.value = accountsEngine.selectedAccountId;

  setTxnTabType('Expense');
  recalcTxnTabBalancePreview();
};

window.clearSelectedTxnTabItem = function() {
  accountsEngine.selectedTxnTabItem = null;
  document.querySelectorAll('.txn-tab-row').forEach(r => r.classList.remove('selected-recon-row'));
  openNewTransactionDrawer();
};

window.setTxnTabType = function(type) {
  accountsEngine.txnTabCurrentType = type;

  document.querySelectorAll('#txnTabInspectorCard .type-pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });

  const isTransfer = (type === 'Transfer');
  const singleAccGroup = document.getElementById('txnTabGroupSingleAccount');
  const catGroup = document.getElementById('txnTabGroupCategory');
  const transferGroup = document.getElementById('txnTabGroupTransferAccounts');

  if (singleAccGroup) singleAccGroup.style.display = isTransfer ? 'none' : 'flex';
  if (catGroup) catGroup.style.display = isTransfer ? 'none' : 'flex';
  if (transferGroup) transferGroup.style.display = isTransfer ? 'flex' : 'none';

  const amtInput = document.getElementById('txnTabAmount');
  if (amtInput) {
    amtInput.classList.remove('type-expense', 'type-income', 'type-transfer');
    if (type === 'Expense') amtInput.classList.add('type-expense');
    else if (type === 'Income') amtInput.classList.add('type-income');
    else if (type === 'Transfer') amtInput.classList.add('type-transfer');
  }

  recalcTxnTabBalancePreview();
};

window.recalcTxnTabBalancePreview = function() {
  const currentAcc = accountsEngine.accounts.find(a => String(a.id) === String(accountsEngine.selectedAccountId));
  const currentBal = Number(currentAcc?.current_balance || currentAcc?.opening_balance || 0);

  const rawAmt = parseFloat(document.getElementById('txnTabAmount')?.value) || 0;
  const type = accountsEngine.txnTabCurrentType;
  const signedAmt = (type === 'Expense') ? -Math.abs(rawAmt) : Math.abs(rawAmt);

  let projected = currentBal;
  if (accountsEngine.selectedTxnTabItem) {
    const origAmt = Number(accountsEngine.selectedTxnTabItem.amount || 0);
    projected = currentBal - origAmt + signedAmt;
  } else {
    projected = currentBal + signedAmt;
  }

  const previewEl = document.getElementById('txnTabBalancePreview');
  if (previewEl) {
    previewEl.textContent = (projected < 0 ? '-₹' : '₹') + formatCurrency(projected);
  }
};

window.handleTxnTabSave = async function(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const db = getDbClient();
  if (!db) return;

  const btn = document.getElementById('btnTxnTabSave');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  const txnId = document.getElementById('txnTabFormId')?.value;
  const rawDate = document.getElementById('txnTabDate')?.value;
  const finalDate = sanitizeDateString(rawDate);
  const inputTime = document.getElementById('txnTabTime')?.value || '12:00:00';
  const finalTime = inputTime.length === 5 ? inputTime + ':00' : inputTime;

  const payeeVal = document.getElementById('txnTabPayee')?.value?.trim() || 'Untitled';
  const amountVal = parseFloat(document.getElementById('txnTabAmount')?.value) || 0;
  const typeVal = accountsEngine.txnTabCurrentType || 'Expense';
  const categoryId = document.getElementById('txnTabCategoryId')?.value || null;
  const notesVal = document.getElementById('txnTabNotes')?.value?.trim() || null;
  const signedAmt = (typeVal === 'Expense') ? -Math.abs(amountVal) : Math.abs(amountVal);

  const finalHashId = buildManualHashId(finalDate, finalTime, amountVal);
  const affectedYM = finalDate.slice(0, 7);

  try {
    if (typeVal === 'Transfer') {
      const fromAcc = document.getElementById('txnTabFromAccountId')?.value || accountsEngine.selectedAccountId;
      const toAcc = document.getElementById('txnTabToAccountId')?.value;
      const pairId = document.getElementById('txnTabTransferPairId')?.value;

      if (fromAcc && toAcc && fromAcc === toAcc) {
        alert('From and To accounts must be different for a transfer.');
        return;
      }

      if (txnId) {
        await db.from('transactions').update({
          account_id: fromAcc,
          amount: -Math.abs(amountVal),
          date: finalDate,
          time: finalTime,
          title: payeeVal,
          notes: notesVal,
          hash_id: finalHashId
        }).eq('id', txnId);

        if (pairId) {
          await db.from('transactions').update({
            account_id: toAcc,
            amount: Math.abs(amountVal),
            date: finalDate,
            time: finalTime,
            title: payeeVal,
            notes: notesVal,
            hash_id: finalHashId
          }).eq('id', pairId);
        }
      } else {
        const { data: legOutId } = await db.rpc('fn_generate_txn_id');
        const { data: legInId } = await db.rpc('fn_generate_txn_id');

        await db.from('transactions').insert([
          {
            id: legOutId,
            date: finalDate,
            time: finalTime,
            title: payeeVal,
            amount: -Math.abs(amountVal),
            type: 'Transfer',
            account_id: fromAcc,
            category_id: null,
            notes: notesVal,
            source: 'Manual',
            hash_id: finalHashId,
            transfer_pair_id: legInId
          },
          {
            id: legInId,
            date: finalDate,
            time: finalTime,
            title: payeeVal,
            amount: Math.abs(amountVal),
            type: 'Transfer',
            account_id: toAcc,
            category_id: null,
            notes: notesVal,
            source: 'Manual',
            hash_id: finalHashId,
            transfer_pair_id: legOutId
          }
        ]);
      }
    } else {
      const accId = document.getElementById('txnTabAccountId')?.value || accountsEngine.selectedAccountId;
      const payload = {
        account_id: accId,
        date: finalDate,
        time: finalTime,
        title: payeeVal,
        amount: signedAmt,
        type: typeVal,
        category_id: categoryId,
        notes: notesVal,
        hash_id: finalHashId
      };

      if (txnId) {
        const { error: updErr } = await db.from('transactions').update(payload).eq('id', txnId);
        if (updErr) throw updErr;
      } else {
        payload.source = 'Manual';
        const { error: insErr } = await db.from('transactions').insert([payload]);
        if (insErr) throw insErr;
      }
    }

    clearSelectedTxnTabItem();
    const currentAcc = accountsEngine.accounts.find(a => String(a.id) === String(accountsEngine.selectedAccountId));
    
    // Silent in-place refresh without full-page flashing or jumping
    await Promise.all([
      loadAccountTransactions(true, affectedYM), // Silent refresh & auto-expand affected month
      loadAccountHeaderMetrics(currentAcc),
      loadAccountsHierarchy(true)               // Silent sidebar balance update
    ]);

  } catch (err) {
    console.error('Save failed:', err);
    alert('Error saving transaction: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = txnId ? 'Save Changes' : 'Save Transaction';
    }
  }
};

// ==========================================================================
// 2. TAB 2: MERGED IMPORT TIMELINE WITH COLLAPSIBLE MONTH HEADERS
// ==========================================================================
async function loadAccountImportTimeline(isSilent = false, autoExpandYM = null) {
  const tbody = document.getElementById('accImportLedgerBody');
  if (!tbody) return;

  if (!isSilent) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:#64748b;">Merging recorded ledger with imported bank statements...</td></tr>';
  }

  const db = getDbClient();
  const accId = accountsEngine.selectedAccountId;
  if (!db || !accId) return;

  const currentAcc = accountsEngine.accounts.find(a => String(a.id) === String(accId));
  const accName = currentAcc ? currentAcc.name.trim() : '';
  const openingBal = Number(currentAcc?.opening_balance || 0);
  const last4 = currentAcc?.account_number_masked ? currentAcc.account_number_masked.slice(-4) : '';

  // 1. Fetch entire historical ledger sequentially with pagination
  let recTxns = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  try {
    while (hasMore) {
      let query = db
        .from('v_transactions')
        .select('*')
        .eq('account_id', accId)
        .order('date', { ascending: false })
        .order('time', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        recTxns = recTxns.concat(data);
        if (data.length < pageSize) hasMore = false;
        else from += pageSize;
      } else {
        hasMore = false;
      }
    }
  } catch (err) {
    const { data: fData } = await db
      .from('transactions')
      .select('*')
      .eq('account_id', accId)
      .order('date', { ascending: false })
      .order('time', { ascending: false });
    recTxns = fData || [];
  }

  // 2. Fetch Staged Transactions
  const { data: stagedTxns } = await db
    .from('staged_transactions')
    .select('*')
    .ilike('status', 'Pending');

  const matchedStaged = (stagedTxns || []).filter(st => {
    if (st.account_id && String(st.account_id) === String(accId)) return true;
    const raw = String(st.raw_account || st.account_name || '').toLowerCase();
    const target = accName.toLowerCase();
    if (raw && target && (raw.includes(target) || target.includes(raw))) return true;
    if (last4 && raw && raw.includes(last4)) return true;
    return false;
  });

  // 3. Normalize into unified timeline
  let combined = [];

  recTxns.forEach(rt => {
    combined.push({
      isStaged: false,
      id: rt.id,
      date: sanitizeDateString(rt.date),
      time: rt.time || '12:00:00',
      description: rt.notes || rt.title || 'Recorded Entry',
      payee: rt.title || 'Recorded Entry',
      amount: Number(rt.amount || 0),
      type: rt.type || (Number(rt.amount) < 0 ? 'Expense' : 'Income'),
      categoryId: rt.category_id,
      notes: rt.notes,
      source: rt.source || 'Ledger',
      hash_id: rt.hash_id,
      transfer_pair_id: rt.transfer_pair_id,
      dbRunningBalance: (rt.account_running_balance !== null && rt.account_running_balance !== undefined)
        ? Number(rt.account_running_balance)
        : null
    });
  });

  matchedStaged.forEach(st => {
    let signedAmt = 0;
    let computedType = 'Expense';

    if (st.amount) {
      signedAmt = Number(st.amount);
      computedType = signedAmt < 0 ? 'Expense' : 'Income';
    } else if (st.withdrawal_amount && Number(st.withdrawal_amount) > 0) {
      signedAmt = -Math.abs(Number(st.withdrawal_amount));
      computedType = 'Expense';
    } else if (st.deposit_amount && Number(st.deposit_amount) > 0) {
      signedAmt = Math.abs(Number(st.deposit_amount));
      computedType = 'Income';
    }

    const titleStr = st.payee || st.description || st.narration || st.remarks || 'Imported Entry';
    if (st.type === 'Transfer' || titleStr.toLowerCase().includes('transfer')) {
      computedType = 'Transfer';
    }

    combined.push({
      isStaged: true,
      id: st.id,
      date: sanitizeDateString(st.date),
      time: st.time || '12:00:00',
      description: st.narration || st.remarks || st.description || 'Statement Upload',
      payee: titleStr,
      amount: signedAmt,
      type: computedType,
      categoryId: st.category_id,
      notes: st.notes || st.remarks,
      source: 'Statement Import',
      hash_id: st.hash_id,
      transfer_pair_id: null,
      dbRunningBalance: null
    });
  });

  // 4. Deterministic Chronological Sort for Accurate Forward Balance Simulation
  combined.sort((a, b) => {
    const keyA = `${a.date || '1970-01-01'} ${a.time || '00:00:00'} ${a.id}`;
    const keyB = `${b.date || '1970-01-01'} ${b.time || '00:00:00'} ${b.id}`;
    return keyA.localeCompare(keyB);
  });

  let running = openingBal;
  combined.forEach(item => {
    if (!item.isStaged && item.dbRunningBalance !== null) {
      running = item.dbRunningBalance;
    } else {
      running += item.amount;
    }
    item.projectedBalanceAfter = running;
  });

  accountsEngine.mergedTimeline = combined;

  const currentStagedInTimeline = combined.filter(t => t.isStaged);
  const stagedSum = currentStagedInTimeline.reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);
  const elRevCount = document.getElementById('heroKpiReviewCount');
  const elRevAmt = document.getElementById('heroKpiReviewAmt');
  if (elRevCount) elRevCount.textContent = `${currentStagedInTimeline.length} transactions`;
  if (elRevAmt) elRevAmt.textContent = `₹${formatCurrency(stagedSum)}`;

  let displayList = [...combined];
  const range = getDateRange(accountsEngine.importDateFilter);
  if (range) {
    displayList = displayList.filter(item => item.date >= range.start && item.date <= range.end);
  }

  displayList.sort((a, b) => {
    const keyA = `${a.date || '1970-01-01'} ${a.time || '00:00:00'} ${a.id}`;
    const keyB = `${b.date || '1970-01-01'} ${b.time || '00:00:00'} ${b.id}`;
    return keyB.localeCompare(keyA);
  });

  if (displayList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px; color:#64748b;">No imported or recorded entries found for this account.</td></tr>`;
    return;
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Group into Month -> Day -> Items
  const monthMap = {};
  displayList.forEach(item => {
    const dStr = item.date;
    const ym = dStr.slice(0, 7);
    if (!monthMap[ym]) {
      monthMap[ym] = { count: 0, credits: 0, debits: 0, closing: null, days: {} };
      if (accountsEngine.collapsedImportMonths[ym] === undefined) {
        accountsEngine.collapsedImportMonths[ym] = true;
      }
    }

    const amt = Number(item.amount || 0);
    monthMap[ym].count++;
    if (amt >= 0) monthMap[ym].credits += amt;
    else monthMap[ym].debits += Math.abs(amt);

    if (monthMap[ym].closing === null) {
      monthMap[ym].closing = item.projectedBalanceAfter;
    }

    if (!monthMap[ym].days[dStr]) monthMap[ym].days[dStr] = [];
    monthMap[ym].days[dStr].push(item);
  });

  if (autoExpandYM) {
    accountsEngine.collapsedImportMonths[autoExpandYM] = false;
  }

  const scrollContainer = document.querySelector('.import-table-card');
  const prevScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

  let html = '';

  Object.keys(monthMap).sort().reverse().forEach(ym => {
    const mData = monthMap[ym];
    const ymParts = ym.split('-');
    const y = ymParts[0];
    const mIdx = parseInt(ymParts[1], 10) - 1;
    const mLabel = `${monthNames[mIdx]} ${y}`;
    const netMonth = mData.credits - mData.debits;
    const isCollapsed = Boolean(accountsEngine.collapsedImportMonths[ym]);

    html += `
      <tr class="table-month-header-row" onclick="toggleImportMonthTransactions('${ym}')">
        <td colspan="8">
          <div class="table-month-header-content">
            <div class="month-header-left">
              <span class="month-toggle-arrow" id="importMonthArrow_${ym}">${isCollapsed ? '▸' : '▾'}</span>
              <span class="month-header-icon">🗓️</span>
              <span><strong>${mLabel}</strong></span>
              <span class="month-txn-count">(${mData.count} item${mData.count > 1 ? 's' : ''})</span>
            </div>
            <div class="month-header-right">
              <span class="month-stat-credit font-bold">+${formatBalanceINR(mData.credits)}</span>
              <span class="month-stat-debit font-bold">-${formatBalanceINR(mData.debits)}</span>
              <span class="month-stat-net ${netMonth < 0 ? 'expense-val' : 'income-val'} font-bold">
                Net: ${netMonth >= 0 ? '+' : '-'}${formatBalanceINR(Math.abs(netMonth))}
              </span>
              ${mData.closing !== null ? `<span style="color:#64748b; font-size:11px;">Month End: <strong style="color:#0f172a;">${formatBalanceINR(mData.closing)}</strong></span>` : ''}
            </div>
          </div>
        </td>
      </tr>
    `;

    Object.keys(mData.days).sort().reverse().forEach(dateStr => {
      const items = mData.days[dateStr];
      const dObj = new Date(dateStr + 'T00:00:00');
      const dayFormatted = dObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const dayClosingBal = items[0].projectedBalanceAfter;

      html += `
        <tr class="day-header-tr import-month-group-${ym}" style="display: ${isCollapsed ? 'none' : 'table-row'};">
          <td colspan="8">
            <div class="day-header-row">
              <div class="day-title-left">
                <span>📅</span>
                <span>${dayFormatted}</span>
                <span class="day-txn-count-pill">(${items.length} item${items.length > 1 ? 's' : ''})</span>
              </div>
              <div class="day-closing-right">
                ${dayClosingBal !== undefined ? `Closing Balance: <strong>${formatBalanceINR(dayClosingBal)}</strong>` : ''}
              </div>
            </div>
          </td>
        </tr>
      `;

      items.forEach(t => {
        const isInc = t.amount >= 0;
        const sign = isInc ? '+' : '-';
        const amtClass = isInc ? 'income-val' : 'expense-val';
        const catName = accountsEngine.categories[t.categoryId] || (t.type === 'Transfer' ? 'Transfer' : 'General');
        const catDesign = accountsEngine.categoryColors[catName.toLowerCase()] || accountsEngine.categoryColors.default;

        let statusPillHtml = '';
        let actionsHtml = '';

        if (t.isStaged) {
          statusPillHtml = `<span class="review-status-pill">● Review</span>`;
          actionsHtml = `
            <div class="row-action-icon-group">
              <button class="stage-icon-btn approve-btn" onclick="event.stopPropagation(); approveImportItem('${t.id}')" title="Approve"><span style="color:#16a34a; font-weight:bold; font-size:15px;">✔</span></button>
              <button class="stage-icon-btn edit-btn" onclick="event.stopPropagation(); openAccountImportDrawer('${t.id}', true)" title="Edit">✏️</button>
              <button class="stage-icon-btn delete-btn" onclick="event.stopPropagation(); rejectImportItem('${t.id}')" title="Delete">🗑️</button>
            </div>
          `;
        } else {
          statusPillHtml = `<span class="already-rec-pill">Posted</span>`;
          actionsHtml = `
            <div class="row-action-icon-group">
              <button class="stage-icon-btn edit-btn" onclick="event.stopPropagation(); openAccountImportDrawer('${t.id}', false, true)" title="Edit">✏️</button>
              <button class="stage-icon-btn delete-btn" onclick="event.stopPropagation(); deleteRecordedTxn('${t.id}')" title="Delete">🗑️</button>
            </div>
          `;
        }

        const isSelected = accountsEngine.selectedDrawerItem && String(accountsEngine.selectedDrawerItem.id) === String(t.id);

        html += `
          <tr class="acc-import-row import-month-group-${ym} ${t.isStaged ? 'is-staged-row' : ''} ${isSelected ? 'selected-recon-row' : ''}" style="display: ${isCollapsed ? 'none' : 'table-row'};" onclick="openAccountImportDrawer('${t.id}', ${t.isStaged})">
            <td>
              <div class="cell-headline font-semibold">${t.date}</div>
              <div class="cell-subline text-muted">${t.time ? t.time.slice(0, 5) : '12:00'}</div>
            </td>
            <td>
              <div class="cell-headline font-semibold">${t.payee}</div>
              <div class="cell-subline text-muted">${t.notes || t.description || 'No remarks'}</div>
            </td>
            <td class="text-right">
              <span class="amt-val-bold ${amtClass}">${sign}₹${formatCurrency(Math.abs(t.amount))}</span>
            </td>
            <td class="text-center">
              <span class="type-pill-box ${t.type.toLowerCase()}">${t.type}</span>
            </td>
            <td>
              <span class="cat-pill-badge" style="background:${catDesign.bg}; color:${catDesign.color};">
                <span>${catDesign.icon}</span> ${catName}
              </span>
            </td>
            <td>${statusPillHtml}</td>
            <td class="text-right">
              <span class="run-bal-text">${t.projectedBalanceAfter !== undefined ? formatBalanceINR(t.projectedBalanceAfter) : '—'}</span>
            </td>
            <td class="text-right">${actionsHtml}</td>
          </tr>
        `;
      });
    });
  });

  tbody.innerHTML = html;

  if (scrollContainer && isSilent) {
    scrollContainer.scrollTop = prevScrollTop;
  }

  if (!accountsEngine.selectedDrawerItem && displayList.length > 0) {
    openAccountImportDrawer(displayList[0].id, displayList[0].isStaged);
  }
}

window.toggleImportMonthTransactions = function(ym) {
  const isCurrentlyCollapsed = Boolean(accountsEngine.collapsedImportMonths[ym]);
  const newCollapsedState = !isCurrentlyCollapsed;
  accountsEngine.collapsedImportMonths[ym] = newCollapsedState;

  const rows = document.querySelectorAll(`.import-month-group-${ym}`);
  rows.forEach(r => {
    r.style.display = newCollapsedState ? 'none' : 'table-row';
  });

  const arrow = document.getElementById(`importMonthArrow_${ym}`);
  if (arrow) arrow.textContent = newCollapsedState ? '▸' : '▾';
};

window.toggleAllImportMonths = function() {
  accountsEngine.allImportMonthsCollapsed = !accountsEngine.allImportMonthsCollapsed;
  const shouldCollapse = accountsEngine.allImportMonthsCollapsed;

  Object.keys(accountsEngine.collapsedImportMonths).forEach(ym => {
    accountsEngine.collapsedImportMonths[ym] = shouldCollapse;
    const rows = document.querySelectorAll(`.import-month-group-${ym}`);
    rows.forEach(r => {
      r.style.display = shouldCollapse ? 'none' : 'table-row';
    });
    const arrow = document.getElementById(`importMonthArrow_${ym}`);
    if (arrow) arrow.textContent = shouldCollapse ? '▸' : '▾';
  });

  const btn = document.getElementById('btnToggleAllImportMonths');
  if (btn) {
    btn.innerHTML = shouldCollapse ? '<span>⤢</span> Expand All' : '<span>⤡</span> Collapse All';
  }
};

// ==========================================================================
// OPTIMISTIC ZERO-RELOAD ACTION HANDLERS (SEAMLESS UX)
// ==========================================================================

// Optimistic Approve Item
window.approveImportItem = async function(stagedId) {
  const db = getDbClient();
  if (!db) return;

  const item = accountsEngine.mergedTimeline.find(t => String(t.id) === String(stagedId) && t.isStaged);
  if (!item) return;

  const isTransfer = item.type === 'Transfer';
  const amountVal = Math.abs(Number(item.amount));
  const safeDate = sanitizeDateString(item.date);
  const safeTime = item.time || '12:00:00';
  const computedHash = item.hash_id || buildManualHashId(safeDate, safeTime, amountVal);

  // 1. Optimistic DOM update (Instant visual feedback without reload)
  const targetRow = document.querySelector(`tr.acc-import-row[onclick*="${stagedId}"]`) || 
                    document.querySelector(`button[onclick*="approveImportItem('${stagedId}')"]`)?.closest('tr');

  if (targetRow) {
    targetRow.classList.remove('is-staged-row');
    const statusCell = targetRow.querySelector('.review-status-pill');
    if (statusCell) {
      statusCell.className = 'already-rec-pill';
      statusCell.textContent = 'Posted';
    }
    const actionsGroup = targetRow.querySelector('.row-action-icon-group');
    if (actionsGroup) {
      actionsGroup.innerHTML = `
        <button class="stage-icon-btn edit-btn" onclick="event.stopPropagation(); openAccountImportDrawer('${item.id}', false, true)" title="Edit">✏️</button>
        <button class="stage-icon-btn delete-btn" onclick="event.stopPropagation(); deleteRecordedTxn('${item.id}')" title="Delete">🗑️</button>
      `;
    }
  }

  // 2. Optimistically update local model
  item.isStaged = false;

  // 3. Decrement Review KPI pill immediately
  const remainingStaged = accountsEngine.mergedTimeline.filter(t => t.isStaged);
  const newStagedSum = remainingStaged.reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);
  const elRevCount = document.getElementById('heroKpiReviewCount');
  const elRevAmt = document.getElementById('heroKpiReviewAmt');
  if (elRevCount) elRevCount.textContent = `${remainingStaged.length} transaction${remainingStaged.length !== 1 ? 's' : ''}`;
  if (elRevAmt) elRevAmt.textContent = `₹${formatCurrency(newStagedSum)}`;

  // 4. Background DB Execution
  try {
    if (isTransfer) {
      const destAcc = accountsEngine.accounts.find(a => 
        a.id !== accountsEngine.selectedAccountId && (a.name.toLowerCase().includes('upi lite') || a.name.toLowerCase().includes('kotak'))
      );

      const { data: legOutId } = await db.rpc('fn_generate_txn_id');
      const { data: legInId } = await db.rpc('fn_generate_txn_id');

      await db.from('transactions').insert([
        {
          id: legOutId,
          date: safeDate,
          time: safeTime,
          title: item.payee || 'Transfer Out',
          amount: -amountVal,
          type: 'Transfer',
          account_id: accountsEngine.selectedAccountId,
          category_id: null,
          notes: item.notes || null,
          hash_id: computedHash,
          source: 'Import',
          transfer_pair_id: legInId
        },
        {
          id: legInId,
          date: safeDate,
          time: safeTime,
          title: item.payee || 'Transfer In',
          amount: amountVal,
          type: 'Transfer',
          account_id: destAcc ? destAcc.id : accountsEngine.selectedAccountId,
          category_id: null,
          notes: item.notes || null,
          hash_id: computedHash,
          source: 'Import',
          transfer_pair_id: legOutId
        }
      ]);
      await db.from('staged_transactions').delete().eq('id', stagedId);
    } else {
      const { error: rpcErr } = await db.rpc('fn_approve_staged_transaction', {
        p_staged_id: stagedId,
        p_final_title: item.payee || item.description || 'Untitled',
        p_final_category_id: item.categoryId || null,
        p_final_account_id: accountsEngine.selectedAccountId
      });
      if (rpcErr) throw rpcErr;
    }

    // Silent background sync of metrics & sidebar without touching table DOM
    const currentAcc = accountsEngine.accounts.find(a => String(a.id) === String(accountsEngine.selectedAccountId));
    Promise.all([
      loadAccountHeaderMetrics(currentAcc),
      loadAccountsHierarchy(true)
    ]).catch(console.warn);

  } catch (err) {
    console.error('[Finny] Approval failed:', err);
    alert('Failed to approve transaction: ' + err.message);
    await loadAccountImportTimeline();
  }
};

// Optimistic Reject / Delete Staged Item (Zero Full-Page Reload)
window.rejectImportItem = async function(stagedId) {
  if (!confirm('Reject this staged transaction? It will be permanently excluded from future imports.')) return;

  const db = getDbClient();
  if (!db) return;

  const idx = accountsEngine.mergedTimeline.findIndex(t => String(t.id) === String(stagedId) && t.isStaged);
  const deletedItem = idx !== -1 ? accountsEngine.mergedTimeline[idx] : null;

  // 1. Optimistic DOM Removal (smooth slide away)
  const targetRow = document.querySelector(`tr.acc-import-row[onclick*="${stagedId}"]`) || 
                    document.querySelector(`button[onclick*="rejectImportItem('${stagedId}')"]`)?.closest('tr');

  if (targetRow) {
    const prevDayHeader = targetRow.previousElementSibling?.classList.contains('day-header-tr') ? targetRow.previousElementSibling : null;
    const nextRow = targetRow.nextElementSibling;
    const isOnlyItemInDay = prevDayHeader && (!nextRow || nextRow.classList.contains('day-header-tr') || nextRow.classList.contains('table-month-header-row'));

    targetRow.style.transition = 'all 0.2s ease';
    targetRow.style.opacity = '0';
    targetRow.style.transform = 'translateX(20px)';
    
    setTimeout(() => {
      targetRow.remove();
      if (isOnlyItemInDay) prevDayHeader.remove();
    }, 200);
  }

  // 2. Memory Cleanup
  if (idx !== -1) {
    accountsEngine.mergedTimeline.splice(idx, 1);
  }

  // 3. Instantly Update Review KPI Pill in Hero Card
  if (deletedItem) {
    const remainingStaged = accountsEngine.mergedTimeline.filter(t => t.isStaged);
    const newStagedSum = remainingStaged.reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);
    
    const elRevCount = document.getElementById('heroKpiReviewCount');
    const elRevAmt = document.getElementById('heroKpiReviewAmt');
    if (elRevCount) elRevCount.textContent = `${remainingStaged.length} transaction${remainingStaged.length !== 1 ? 's' : ''}`;
    if (elRevAmt) elRevAmt.textContent = `₹${formatCurrency(newStagedSum)}`;
  }

  // 4. Reset Inspector Card if open
  if (accountsEngine.selectedDrawerItem && String(accountsEngine.selectedDrawerItem.id) === String(stagedId)) {
    clearSelectedImportItem();
  }

  // 5. Background Silent Server Call
  try {
    const { error } = await db.rpc('fn_reject_staged_transaction', {
      p_staged_id: stagedId,
      p_reason: 'Rejected from Account Import tab'
    });
    if (error) {
      await db.from('staged_transactions').delete().eq('id', stagedId);
    }
  } catch (err) {
    console.error('[Finny] Rejection failed, reverting:', err);
    alert('Failed to delete on server: ' + err.message);
    await loadAccountImportTimeline();
  }
};

// Optimistic Delete Recorded Transaction
window.deleteRecordedTxn = async function(txnId) {
  if (!confirm('Are you sure you want to delete this recorded transaction?')) return;

  const db = getDbClient();
  if (!db) return;

  // 1. Optimistic DOM Removal
  const rows = document.querySelectorAll(`tr[onclick*="${txnId}"]`);
  rows.forEach(r => {
    r.style.transition = 'all 0.2s ease';
    r.style.opacity = '0';
    setTimeout(() => r.remove(), 200);
  });

  // 2. Memory Cleanup
  const impIdx = accountsEngine.mergedTimeline.findIndex(t => String(t.id) === String(txnId) && !t.isStaged);
  if (impIdx !== -1) accountsEngine.mergedTimeline.splice(impIdx, 1);

  const txnIdx = accountsEngine.currentTxnsList.findIndex(t => String(t.id) === String(txnId));
  if (txnIdx !== -1) accountsEngine.currentTxnsList.splice(txnIdx, 1);

  if (accountsEngine.selectedDrawerItem && String(accountsEngine.selectedDrawerItem.id) === String(txnId)) {
    clearSelectedImportItem();
  }
  if (accountsEngine.selectedTxnTabItem && String(accountsEngine.selectedTxnTabItem.id) === String(txnId)) {
    clearSelectedTxnTabItem();
  }

  // 3. Background Execution
  try {
    const { error } = await db.from('transactions').delete().eq('id', txnId);
    if (error) throw error;

    const currentAcc = accountsEngine.accounts.find(a => String(a.id) === String(accountsEngine.selectedAccountId));
    Promise.all([
      loadAccountHeaderMetrics(currentAcc),
      loadAccountsHierarchy(true)
    ]).catch(console.warn);

  } catch (err) {
    console.error('[Finny] Delete failed:', err);
    alert('Failed to delete transaction: ' + err.message);
    if (accountsEngine.activeTab === 'Import') {
      await loadAccountImportTimeline();
    } else {
      await loadAccountTransactions();
    }
  }
};

window.setPanelTxnType = function(type) {
  accountsEngine.currentDrawerType = type;

  document.querySelectorAll('#importInspectorCard .type-pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });

  const isTransfer = (type === 'Transfer');
  const singleAccGroup = document.getElementById('panelGroupSingleAccount');
  const catGroup = document.getElementById('panelGroupCategory');
  const transferGroup = document.getElementById('panelGroupTransferAccounts');

  if (singleAccGroup) singleAccGroup.style.display = isTransfer ? 'none' : 'flex';
  if (catGroup) catGroup.style.display = isTransfer ? 'none' : 'flex';
  if (transferGroup) transferGroup.style.display = isTransfer ? 'flex' : 'none';

  const amtInput = document.getElementById('panelAmount');
  if (amtInput) {
    amtInput.classList.remove('type-expense', 'type-income', 'type-transfer');
    if (type === 'Expense') amtInput.classList.add('type-expense');
    else if (type === 'Income') amtInput.classList.add('type-income');
    else if (type === 'Transfer') amtInput.classList.add('type-transfer');
  }

  recalcAccountBalancePreview();
};


// ==========================================================================
// CARD DETAILS PATCH: TRANSFER ROUTE, CATEGORY GROUP & HASH_ID
// ==========================================================================
window.copyToClipboard = function(text, btn) {
  if (!text || text === '—') return;
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }
  });
};

async function renderRichCardDetails(containerId, item) {
  const container = document.getElementById(containerId);
  if (!container || !item) return;

  const db = getDbClient();
  const isTransfer = (item.type === 'Transfer');
  const safeHash = item.hash_id || '—';
  
  const balanceAfter = item.projectedBalanceAfter !== undefined 
    ? item.projectedBalanceAfter 
    : (item.account_running_balance !== undefined ? item.account_running_balance : item.running_balance);

  const curAcc = accountsEngine.accounts.find(a => String(a.id) === String(item.account_id || accountsEngine.selectedAccountId));
  const curAccText = curAcc ? `${curAcc.name} (${curAcc.account_number_masked ? curAcc.account_number_masked.slice(-4) : '****'})` : 'Current Account';

  let html = '';

  if (isTransfer) {
    let fromAccountText = curAccText;
    let toAccountText = 'Transfer Partner';

    // If paired transaction exists, resolve target account name and mask
    if (item.transfer_pair_id && db) {
      try {
        const { data: pairTxn } = await db
          .from('transactions')
          .select('account_id, accounts(name, account_number_masked)')
          .eq('id', item.transfer_pair_id)
          .single();

        if (pairTxn && pairTxn.accounts) {
          const partner = pairTxn.accounts;
          const partnerText = `${partner.name} (${partner.account_number_masked ? partner.account_number_masked.slice(-4) : '****'})`;
          
          if (Number(item.amount) < 0) {
            fromAccountText = curAccText;
            toAccountText = partnerText;
          } else {
            fromAccountText = partnerText;
            toAccountText = curAccText;
          }
        }
      } catch (err) {
        console.warn('Could not resolve transfer partner details:', err);
      }
    }

    html = `
      <div class="transfer-route-box" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:10px 14px; margin-bottom:12px; display:flex; flex-direction:column; gap:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
          <span style="color:#64748b; font-weight:500; font-size:11px;">📤 From</span>
          <span style="font-weight:600; color:#0f172a;">${fromAccountText}</span>
        </div>
        <div style="padding-left:14px; color:#94a3b8; font-size:11px; line-height:1;">│<br>▼</div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
          <span style="color:#64748b; font-weight:500; font-size:11px;">📥 To</span>
          <span style="font-weight:600; color:#0f172a;">${toAccountText}</span>
        </div>
      </div>

      <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px;">
        <span style="color:#64748b;">Status</span>
        <span class="${item.isStaged ? 'review-status-pill' : 'already-rec-pill'}">${item.isStaged ? '● Review' : 'Posted'}</span>
      </div>

      <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
        <span style="color:#64748b;">Balance After</span>
        <span style="font-weight:700; color:#0f172a;">${balanceAfter !== undefined && balanceAfter !== null ? formatBalanceINR(balanceAfter) : '—'}</span>
      </div>

      <div class="view-meta-row" style="display:flex; flex-direction:column; gap:4px; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
        <span style="color:#64748b;">Remarks / Notes</span>
        <p style="margin:0; font-size:11px; color:#334155;">${item.notes || item.description || 'No remarks recorded'}</p>
      </div>

      <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
        <span style="color:#64748b;">Transaction ID</span>
        <span style="font-family:monospace; font-weight:700; color:#0f172a;">${item.id || '—'}</span>
      </div>

      ${item.transfer_pair_id ? `
      <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
        <span style="color:#64748b;">Linked Pair ID</span>
        <span style="font-family:monospace; color:#2563eb;">${item.transfer_pair_id}</span>
      </div>` : ''}

      <div class="view-meta-row" style="display:flex; justify-content:space-between; align-items:center; padding-bottom:8px; font-size:12px; margin-top:8px;">
        <span style="color:#64748b;">Hash ID</span>
        <span style="display:inline-flex; align-items:center; gap:6px; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; padding:2px 6px; font-family:monospace; font-size:11px; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${safeHash}
          ${safeHash !== '—' ? `<button type="button" onclick="copyToClipboard('${safeHash}', this)" style="border:none; background:none; cursor:pointer; padding:0; font-size:11px;">📋</button>` : ''}
        </span>
      </div>
    `;
  } else {
    // Expense or Income
    const rawCat = accountsEngine.categories[item.categoryId || item.category_id];
    const catName = (typeof rawCat === 'object' ? rawCat?.name : rawCat) || item.category_name || 'General';
    const catGroup = (typeof rawCat === 'object' ? rawCat?.group : null) || item.category_group || 'General Expenses';

    html = `
      <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px;">
        <span style="color:#64748b;">Account</span>
        <span style="font-weight:600; color:#0f172a;">${curAccText}</span>
      </div>

      <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
        <span style="color:#64748b;">Account Group</span>
        <span style="color:#475569;">${curAcc?.account_group || 'Bank Accounts'}</span>
      </div>

      <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
        <span style="color:#64748b;">Category Group</span>
        <span style="font-weight:600; color:#0f172a;">${catGroup}</span>
      </div>

      <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
        <span style="color:#64748b;">Category</span>
        <span style="color:#0f172a;">${catName}</span>
      </div>

      <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
        <span style="color:#64748b;">Status</span>
        <span class="${item.isStaged ? 'review-status-pill' : 'already-rec-pill'}">${item.isStaged ? '● Review' : 'Posted'}</span>
      </div>

      <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
        <span style="color:#64748b;">Balance After</span>
        <span style="font-weight:700; color:#0f172a;">${balanceAfter !== undefined && balanceAfter !== null ? formatBalanceINR(balanceAfter) : '—'}</span>
      </div>

      <div class="view-meta-row" style="display:flex; flex-direction:column; gap:4px; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
        <span style="color:#64748b;">Remarks / Notes</span>
        <p style="margin:0; font-size:11px; color:#334155;">${item.notes || item.description || 'No remarks recorded'}</p>
      </div>

      <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
        <span style="color:#64748b;">Transaction ID</span>
        <span style="font-family:monospace; font-weight:700; color:#0f172a;">${item.id || '—'}</span>
      </div>

      <div class="view-meta-row" style="display:flex; justify-content:space-between; align-items:center; padding-bottom:8px; font-size:12px; margin-top:8px;">
        <span style="color:#64748b;">Hash ID</span>
        <span style="display:inline-flex; align-items:center; gap:6px; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; padding:2px 6px; font-family:monospace; font-size:11px; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${safeHash}
          ${safeHash !== '—' ? `<button type="button" onclick="copyToClipboard('${safeHash}', this)" style="border:none; background:none; cursor:pointer; padding:0; font-size:11px;">📋</button>` : ''}
        </span>
      </div>
    `;
  }

  container.innerHTML = html;
}

window.openAccountImportDrawer = function(id, isStaged, forceEdit = false) {
  const item = accountsEngine.mergedTimeline.find(t => String(t.id) === String(id) && Boolean(t.isStaged) === Boolean(isStaged));
  if (!item) return;

  accountsEngine.selectedDrawerItem = item;

  document.querySelectorAll('.acc-import-row').forEach(r => r.classList.remove('selected-recon-row'));
  event?.currentTarget?.classList?.add('selected-recon-row');

  const viewState = document.getElementById('inspectorViewState');
  const formState = document.getElementById('inspectorFormState');

if (!item.isStaged && !forceEdit) {
    if (viewState) viewState.style.display = 'block';
    if (formState) formState.style.display = 'none';

    document.getElementById('viewTitle').textContent = item.payee || item.description || 'Recorded Transaction';
    document.getElementById('viewDateTime').textContent = `${item.date} • ${item.time ? item.time.slice(0, 5) : '12:00'}`;
    
    const amtEl = document.getElementById('viewAmount');
    amtEl.textContent = (item.amount < 0 ? '-₹' : '+₹') + formatCurrency(Math.abs(item.amount));
    amtEl.style.color = item.amount < 0 ? '#dc2626' : '#16a34a';

    const typeBadge = document.getElementById('viewTypeBadge');
    typeBadge.textContent = item.type;
    typeBadge.className = `type-pill-box ${item.type.toLowerCase()}`;

    // --- REPLACEMENT: Build Dynamic Rich Metadata Body ---
    const container = document.getElementById('viewDynamicContainer') || document.querySelector('.view-meta-list');
    if (container) {
      const isTransfer = (item.type === 'Transfer');
      const safeHash = item.hash_id || '—';
      const balAfter = item.projectedBalanceAfter !== undefined ? item.projectedBalanceAfter : item.account_running_balance;

      const currentAcc = accountsEngine.accounts.find(a => String(a.id) === String(item.account_id || accountsEngine.selectedAccountId));
      const curAccMask = currentAcc?.account_number_masked ? ` (•••• ${currentAcc.account_number_masked.slice(-4)})` : '';
      const curAccLabel = currentAcc ? `${currentAcc.name}${curAccMask}` : 'Current Account';

      let detailsHtml = '';

      if (isTransfer) {
        let fromText = curAccLabel;
        let toText = 'Transfer Partner';

        // Check if destination partner account can be resolved from local accounts memory
        if (item.transfer_pair_id) {
          const partnerLeg = accountsEngine.mergedTimeline.find(t => String(t.id) === String(item.transfer_pair_id));
          if (partnerLeg) {
            const partnerAcc = accountsEngine.accounts.find(a => String(a.id) === String(partnerLeg.account_id));
            const partnerMask = partnerAcc?.account_number_masked ? ` (•••• ${partnerAcc.account_number_masked.slice(-4)})` : '';
            const partnerLabel = partnerAcc ? `${partnerAcc.name}${partnerMask}` : 'Account';

            if (Number(item.amount) < 0) {
              fromText = curAccLabel;
              toText = partnerLabel;
            } else {
              fromText = partnerLabel;
              toText = curAccLabel;
            }
          }
        }

        detailsHtml = `
          <div class="transfer-route-box" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:10px 14px; margin-bottom:12px; display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
              <span style="color:#64748b; font-weight:500; font-size:11px;">📤 From</span>
              <span style="font-weight:600; color:#0f172a;">${fromText}</span>
            </div>
            <div style="padding-left:14px; color:#94a3b8; font-size:11px; line-height:1;">│<br>▼</div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
              <span style="color:#64748b; font-weight:500; font-size:11px;">📥 To</span>
              <span style="font-weight:600; color:#0f172a;">${toText}</span>
            </div>
          </div>

          <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px;">
            <span style="color:#64748b;">Status</span>
            <span class="already-rec-pill">Posted</span>
          </div>

          <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
            <span style="color:#64748b;">Balance After</span>
            <span style="font-weight:700; color:#0f172a;">${balAfter !== undefined && balAfter !== null ? formatBalanceINR(balAfter) : '—'}</span>
          </div>

          <div class="view-meta-row" style="display:flex; flex-direction:column; gap:4px; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
            <span style="color:#64748b;">Remarks / Notes</span>
            <p style="margin:0; font-size:11px; color:#334155;">${item.notes || item.description || 'No remarks recorded'}</p>
          </div>

          <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
            <span style="color:#64748b;">Transaction ID</span>
            <span style="font-family:monospace; font-weight:700; color:#0f172a;">${item.id || '—'}</span>
          </div>

          ${item.transfer_pair_id ? `
          <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
            <span style="color:#64748b;">Linked Pair ID</span>
            <span style="font-family:monospace; color:#2563eb;">${item.transfer_pair_id}</span>
          </div>` : ''}

          <div class="view-meta-row" style="display:flex; justify-content:space-between; align-items:center; padding-bottom:8px; font-size:12px; margin-top:8px;">
            <span style="color:#64748b;">Hash ID</span>
            <span style="display:inline-flex; align-items:center; gap:6px; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; padding:2px 6px; font-family:monospace; font-size:11px; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              ${safeHash}
              ${safeHash !== '—' ? `<button type="button" onclick="navigator.clipboard.writeText('${safeHash}'); this.textContent='✓'; setTimeout(()=>this.textContent='📋', 1500);" style="border:none; background:none; cursor:pointer; padding:0; font-size:11px;" title="Copy Hash">📋</button>` : ''}
            </span>
          </div>
        `;
      } else {
        const rawCat = accountsEngine.categories[item.categoryId || item.category_id];
        const catName = (typeof rawCat === 'object' ? rawCat?.name : rawCat) || item.category_name || 'General';
        const catGroup = (typeof rawCat === 'object' ? rawCat?.group : null) || item.category_group || 'General Expenses';

        detailsHtml = `
          <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px;">
            <span style="color:#64748b;">Account</span>
            <span style="font-weight:600; color:#0f172a;">${curAccLabel}</span>
          </div>

          <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
            <span style="color:#64748b;">Account Group</span>
            <span style="color:#475569;">${currentAcc?.account_group || 'Bank Accounts'}</span>
          </div>

          <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
            <span style="color:#64748b;">Category Group</span>
            <span style="font-weight:600; color:#0f172a;">${catGroup}</span>
          </div>

          <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
            <span style="color:#64748b;">Category</span>
            <span style="color:#0f172a;">${catName}</span>
          </div>

          <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
            <span style="color:#64748b;">Status</span>
            <span class="already-rec-pill">Posted</span>
          </div>

          <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
            <span style="color:#64748b;">Balance After</span>
            <span style="font-weight:700; color:#0f172a;">${balAfter !== undefined && balAfter !== null ? formatBalanceINR(balAfter) : '—'}</span>
          </div>

          <div class="view-meta-row" style="display:flex; flex-direction:column; gap:4px; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
            <span style="color:#64748b;">Remarks / Notes</span>
            <p style="margin:0; font-size:11px; color:#334155;">${item.notes || item.description || 'No remarks recorded'}</p>
          </div>

          <div class="view-meta-row" style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid #f1f5f9; font-size:12px; margin-top:8px;">
            <span style="color:#64748b;">Transaction ID</span>
            <span style="font-family:monospace; font-weight:700; color:#0f172a;">${item.id || '—'}</span>
          </div>

          <div class="view-meta-row" style="display:flex; justify-content:space-between; align-items:center; padding-bottom:8px; font-size:12px; margin-top:8px;">
            <span style="color:#64748b;">Hash ID</span>
            <span style="display:inline-flex; align-items:center; gap:6px; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; padding:2px 6px; font-family:monospace; font-size:11px; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              ${safeHash}
              ${safeHash !== '—' ? `<button type="button" onclick="navigator.clipboard.writeText('${safeHash}'); this.textContent='✓'; setTimeout(()=>this.textContent='📋', 1500);" style="border:none; background:none; cursor:pointer; padding:0; font-size:11px;" title="Copy Hash">📋</button>` : ''}
            </span>
          </div>
        `;
      }

      container.innerHTML = detailsHtml;
    }

    document.getElementById('btnEditViewedTxn').onclick = () => openAccountImportDrawer(item.id, false, true);
    document.getElementById('btnDeleteViewedTxn').onclick = () => deleteRecordedTxn(item.id);
    return;
  }

  if (viewState) viewState.style.display = 'none';
  if (formState) formState.style.display = 'block';

  document.getElementById('panelTxnId').value = item.id;
  document.getElementById('panelTransferPairId').value = item.transfer_pair_id || '';
  document.getElementById('panelIsStaged').value = String(Boolean(item.isStaged));
  
  const safeDate = sanitizeDateString(item.date);
  document.getElementById('panelDate').value = safeDate;
  document.getElementById('panelTime').value = item.time ? String(item.time).slice(0, 8) : '12:00:00';
  
  document.getElementById('panelTitle').value = item.payee || item.description || '';
  document.getElementById('panelAmount').value = Math.abs(item.amount);
  document.getElementById('panelNotes').value = item.notes || '';

  const flowType = item.type || (item.amount < 0 ? 'Expense' : 'Income');
  setPanelTxnType(flowType);

  if (item.categoryId) {
    document.getElementById('panelCategoryId').value = item.categoryId;
  }
  
  const accSelect = document.getElementById('panelAccountId');
  if (accSelect) accSelect.value = accountsEngine.selectedAccountId;

  const fromSelect = document.getElementById('panelFromAccountId');
  const toSelect = document.getElementById('panelToAccountId');
  if (fromSelect) fromSelect.value = accountsEngine.selectedAccountId;

  const headerTitle = document.getElementById('panelFormTitle');
  const headerSubtitle = document.getElementById('panelFormSubtitle');
  const btnSave = document.getElementById('panelBtnSave');

  if (item.isStaged) {
    headerTitle.textContent = 'Review & Approve';
    headerSubtitle.textContent = 'Verify details to post into Transactions';
    if (btnSave) btnSave.textContent = 'Approve & Post';
  } else {
    headerTitle.textContent = 'Edit Recorded Entry';
    headerSubtitle.textContent = 'Update recorded transaction';
    if (btnSave) btnSave.textContent = 'Save Changes';
  }

  recalcAccountBalancePreview();
};

window.clearSelectedImportItem = function() {
  accountsEngine.selectedDrawerItem = null;
  document.getElementById('panelTxnForm').reset();
  document.querySelectorAll('.acc-import-row').forEach(r => r.classList.remove('selected-recon-row'));
  document.getElementById('panelBalancePreview').textContent = '₹0.00';
  const viewState = document.getElementById('inspectorViewState');
  const formState = document.getElementById('inspectorFormState');
  if (viewState) viewState.style.display = 'none';
  if (formState) formState.style.display = 'block';
  document.getElementById('panelFormTitle').textContent = 'Transaction Details';
  document.getElementById('panelFormSubtitle').textContent = 'Select a row to edit';
};

window.recalcAccountBalancePreview = function() {
  const item = accountsEngine.selectedDrawerItem;
  if (!item) return;

  const rawAmt = parseFloat(document.getElementById('panelAmount').value) || 0;
  const type = accountsEngine.currentDrawerType;
  const signedAmt = (type === 'Expense') ? -Math.abs(rawAmt) : Math.abs(rawAmt);

  const delta = signedAmt - item.amount;
  const projected = (item.projectedBalanceAfter || 0) + delta;

  const previewEl = document.getElementById('panelBalancePreview');
  previewEl.textContent = (projected < 0 ? '-₹' : '₹') + formatCurrency(projected);
};

window.handleAccountImportSave = async function(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }

  const db = getDbClient();
  const item = accountsEngine.selectedDrawerItem;
  const txnId = document.getElementById('panelTxnId')?.value || item?.id;
  if (!db || !txnId) return;

  const btnSave = document.getElementById('panelBtnSave');
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.textContent = 'Posting...';
  }

  const isStaged = (document.getElementById('panelIsStaged')?.value === 'true') || 
                    Boolean(item?.isStaged) || 
                    Boolean(accountsEngine.mergedTimeline.find(t => String(t.id) === String(txnId))?.isStaged);

  const rawDate = document.getElementById('panelDate')?.value;
  let finalDate = sanitizeDateString(rawDate);
  if (!finalDate || finalDate === 'NaN-NaN-NaN') {
    finalDate = sanitizeDateString(item?.date);
  }

  const inputTime = document.getElementById('panelTime')?.value;
  let finalTime = (inputTime && inputTime.trim()) ? inputTime.trim() : (item?.time || '12:00:00');
  if (finalTime.length === 5) finalTime += ':00';

  const payeeVal = document.getElementById('panelTitle')?.value?.trim() || item?.payee || 'Untitled';
  const amountVal = parseFloat(document.getElementById('panelAmount')?.value) || 0;
  const typeVal = accountsEngine.currentDrawerType || item?.type || 'Expense';
  const categoryId = document.getElementById('panelCategoryId')?.value || null;
  const notesVal = document.getElementById('panelNotes')?.value?.trim() || null;
  const signedAmt = (typeVal === 'Expense') ? -Math.abs(amountVal) : Math.abs(amountVal);

  const finalHashId = item?.hash_id || buildManualHashId(finalDate, finalTime, amountVal);
  const affectedYM = finalDate.slice(0, 7);

  try {
    if (isStaged) {
      await db.from('staged_transactions').update({
        date: finalDate,
        time: finalTime,
        payee: payeeVal,
        description: payeeVal,
        amount: signedAmt,
        type: typeVal,
        category_id: categoryId,
        notes: notesVal
      }).eq('id', txnId);

      if (typeVal === 'Transfer') {
        const destAcc = accountsEngine.accounts.find(a => 
          a.id !== accountsEngine.selectedAccountId && (a.name.toLowerCase().includes('upi lite') || a.name.toLowerCase().includes('kotak'))
        );
        const { data: legOutId } = await db.rpc('fn_generate_txn_id');
        const { data: legInId } = await db.rpc('fn_generate_txn_id');

        await db.from('transactions').insert([
          {
            id: legOutId,
            date: finalDate,
            time: finalTime,
            title: payeeVal,
            amount: -Math.abs(amountVal),
            type: 'Transfer',
            account_id: accountsEngine.selectedAccountId,
            category_id: null,
            notes: notesVal,
            source: 'Import',
            hash_id: finalHashId,
            transfer_pair_id: legInId
          },
          {
            id: legInId,
            date: finalDate,
            time: finalTime,
            title: payeeVal,
            amount: Math.abs(amountVal),
            type: 'Transfer',
            account_id: destAcc ? destAcc.id : accountsEngine.selectedAccountId,
            category_id: null,
            notes: notesVal,
            source: 'Import',
            hash_id: finalHashId,
            transfer_pair_id: legOutId
          }
        ]);
        await db.from('staged_transactions').delete().eq('id', txnId);
      } else {
        const { error: rpcErr } = await db.rpc('fn_approve_staged_transaction', {
          p_staged_id: txnId,
          p_final_title: payeeVal,
          p_final_category_id: categoryId,
          p_final_account_id: accountsEngine.selectedAccountId
        });
        if (rpcErr) throw rpcErr;
      }
    } else {
      if (typeVal === 'Transfer') {
        const fromAcc = document.getElementById('panelFromAccountId')?.value;
        const toAcc = document.getElementById('panelToAccountId')?.value;
        const pairId = document.getElementById('panelTransferPairId')?.value || item?.transfer_pair_id;

        if (fromAcc && toAcc && fromAcc === toAcc) {
          alert('From and To accounts must be different.');
          return;
        }

        await db.from('transactions').update({
          account_id: fromAcc || accountsEngine.selectedAccountId,
          amount: -Math.abs(amountVal),
          date: finalDate,
          time: finalTime,
          title: payeeVal,
          notes: notesVal,
          hash_id: finalHashId
        }).eq('id', txnId);

        if (pairId) {
          await db.from('transactions').update({
            account_id: toAcc,
            amount: Math.abs(amountVal),
            date: finalDate,
            time: finalTime,
            title: payeeVal,
            notes: notesVal,
            hash_id: finalHashId
          }).eq('id', pairId);
        }
      } else {
        const accId = document.getElementById('panelAccountId')?.value || accountsEngine.selectedAccountId;
        const { error: updErr } = await db
          .from('transactions')
          .update({
            account_id: accId,
            date: finalDate,
            time: finalTime,
            title: payeeVal,
            amount: signedAmt,
            type: typeVal,
            category_id: categoryId,
            notes: notesVal,
            hash_id: finalHashId
          })
          .eq('id', txnId);

        if (updErr) throw updErr;
      }
    }

    clearSelectedImportItem();
    const currentAcc = accountsEngine.accounts.find(a => String(a.id) === String(accountsEngine.selectedAccountId));
    
    // Silent in-place refresh without wiping DOM or resetting scroll
    await Promise.all([
      loadAccountImportTimeline(true, affectedYM),
      loadAccountHeaderMetrics(currentAcc),
      loadAccountsHierarchy(true)
    ]);
  } catch (err) {
    console.error('Save failed:', err);
    alert('Error saving transaction: ' + err.message);
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.textContent = isStaged ? 'Approve & Post' : 'Save Changes';
    }
  }
};

window.switchAccountTab = function(tabName, el) {
  accountsEngine.activeTab = tabName;

  document.querySelectorAll('.acc-tab-item').forEach(btn => btn.classList.remove('active'));
  if (el) el.classList.add('active');

  document.querySelectorAll('.tab-view-content').forEach(view => view.classList.remove('active'));
  const targetView = document.getElementById('tabView' + tabName);
  if (targetView) targetView.classList.add('active');

  if (tabName === 'Reconciliation') {
    loadAccountReconciliation();
  } else if (tabName === 'Import') {
    loadAccountImportTimeline();
  } else if (tabName === 'Transactions') {
    loadAccountTransactions();
  }
};

window.toggleHierarchyGroup = function(listId, chevId) {
  const list = document.getElementById(listId);
  const chev = document.getElementById(chevId);
  if (!list || !chev) return;
  const isHidden = list.classList.toggle('hidden');
  chev.textContent = isHidden ? '▸' : '▾';
};

window.toggleHierarchySection = function(sectionListId, chevId) {
  const list = document.getElementById(sectionListId);
  const chev = document.getElementById(chevId);
  if (!list || !chev) return;
  const isHidden = list.classList.toggle('hidden');
  chev.textContent = isHidden ? '▸' : '▾';
};

function setupFilterListeners() {
  document.getElementById('accFilterDate')?.addEventListener('change', (e) => {
    accountsEngine.currentDateFilter = e.target.value;
    loadAccountTransactions();
  });

  document.getElementById('accImportFilterDate')?.addEventListener('change', (e) => {
    accountsEngine.importDateFilter = e.target.value;
    loadAccountImportTimeline();
  });

  document.getElementById('accTxnSearch')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('#accLedgerBody tr:not(.day-header-tr):not(.table-month-header-row)').forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });

  document.getElementById('accImportSearch')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('#accImportLedgerBody tr:not(.day-header-tr):not(.table-month-header-row)').forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

// ==========================================================================
// 3. TAB 3: SYNCHRONIZED RECONCILIATION ENGINE (FULL LEDGER PAGINATION)
// ==========================================================================
async function loadAccountReconciliation() {
  const db = getDbClient();
  const accId = accountsEngine.selectedAccountId;
  if (!db || !accId) return;

  const yBody = document.getElementById('reconYearlyBody');
  yBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748b;">Loading full transaction history...</td></tr>';

  const currentAcc = accountsEngine.accounts.find(a => String(a.id) === String(accId));
  const openingBalance = parseFloat(currentAcc?.opening_balance || 0);

  // 1. Fetch entire historical ledger sequentially with pagination (NO LIMIT CUTOFF)
  let allTxns = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  try {
    while (hasMore) {
      const { data, error } = await db
        .from('transactions')
        .select('*')
        .eq('account_id', accId)
        .order('date', { ascending: true })
        .order('time', { ascending: true, nullsFirst: true })
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        allTxns = allTxns.concat(data);
        if (data.length < pageSize) hasMore = false;
        else from += pageSize;
      } else {
        hasMore = false;
      }
    }
  } catch (err) {
    yBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#ef4444;">Error: ${err.message}</td></tr>`;
    return;
  }

  if (allTxns.length === 0) {
    yBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748b;">No transactions recorded for this account.</td></tr>';
    document.getElementById('reconMonthlyBody').innerHTML = '';
    document.getElementById('reconDailyStream').innerHTML = '<div style="padding:20px; color:#64748b; text-align:center;">No records</div>';
    return;
  }

  // 2. Pre-seed Date Buckets
  const yearly = {};
  const monthly = {};
  const daily = {};

  allTxns.forEach(t => {
    const dStr = sanitizeDateString(t.date);
    const parts = dStr.split('-');
    if (parts.length < 3) return;

    const y = parseInt(parts[0], 10);
    const mStr = parts[1];
    const mIndex = parseInt(mStr, 10) - 1;
    const ym = `${y}-${mStr}`;
    const ymd = dStr;

    if (!yearly[y]) yearly[y] = { year: y, opening: 0, credits: 0, debits: 0, closing: 0, count: 0 };
    if (!monthly[ym]) monthly[ym] = { ym: ym, year: y, monthIndex: mIndex, opening: 0, credits: 0, debits: 0, closing: 0, count: 0 };
    if (!daily[ymd]) daily[ymd] = { ymd: ymd, ym: ym, year: y, opening: 0, credits: 0, debits: 0, dayEnd: 0, txns: [] };
  });

  const sortedYears = Object.keys(yearly).map(Number).sort((a, b) => a - b);
  const sortedYMs = Object.keys(monthly).sort();
  const sortedYMDs = Object.keys(daily).sort();

  // 3. Sequential Forward Accumulation Starting from Initial Opening Balance
  let currentBalance = openingBalance;

  sortedYMDs.forEach(ymd => {
    const dayObj = daily[ymd];
    dayObj.opening = currentBalance;

    const dayTxns = allTxns.filter(t => sanitizeDateString(t.date) === ymd);

    dayTxns.forEach(t => {
      const amt = Number(t.amount || 0);
      if (amt >= 0) {
        dayObj.credits += amt;
      } else {
        dayObj.debits += Math.abs(amt);
      }

      currentBalance = Math.round((currentBalance + amt) * 100) / 100;
      t.calculatedRunningBalance = currentBalance;
      dayObj.txns.push(t);
    });

    dayObj.dayEnd = currentBalance;
  });

  // Roll up Days to Months
  sortedYMs.forEach(ym => {
    const mObj = monthly[ym];
    const monthDays = sortedYMDs.filter(d => d.indexOf(ym) === 0);
    if (monthDays.length > 0) {
      mObj.opening = daily[monthDays[0]].opening;
      mObj.closing = daily[monthDays[monthDays.length - 1]].dayEnd;
      monthDays.forEach(d => {
        mObj.credits += daily[d].credits;
        mObj.debits += daily[d].debits;
        mObj.count += daily[d].txns.length;
      });
    }
  });

  // Roll up Months to Years
  sortedYears.forEach(y => {
    const yObj = yearly[y];
    const yearMonths = sortedYMs.filter(ym => ym.indexOf(String(y)) === 0);
    if (yearMonths.length > 0) {
      yObj.opening = monthly[yearMonths[0]].opening;
      yObj.closing = monthly[yearMonths[yearMonths.length - 1]].closing;
      yearMonths.forEach(m => {
        yObj.credits += monthly[m].credits;
        yObj.debits += monthly[m].debits;
        yObj.count += monthly[m].count;
      });
    }
  });

  accountsEngine.reconYearly = yearly;
  accountsEngine.reconMonthly = monthly;
  accountsEngine.reconDaily = daily;

  const descYears = sortedYears.slice().reverse();
  if (!accountsEngine.reconSelectedYear || !yearly[accountsEngine.reconSelectedYear]) {
    accountsEngine.reconSelectedYear = descYears[0];
  }

  // 4. Render Top Yearly Table
  yBody.innerHTML = descYears.map(y => {
    const yg = yearly[y];
    const isSelected = y === accountsEngine.reconSelectedYear ? 'selected-recon-row' : '';
    const isNeg = yg.closing < 0;

    return `
      <tr class="${isSelected}" onclick="selectReconYear(${y})">
        <td class="font-bold text-blue">${y}</td>
        <td class="text-right">${formatBalanceINR(yg.opening)}</td>
        <td class="text-right text-green font-bold">+${formatBalanceINR(yg.credits).replace('₹', '₹')}</td>
        <td class="text-right text-red font-bold">-${formatBalanceINR(yg.debits).replace('₹', '₹')}</td>
        <td class="text-right font-bold ${isNeg ? 'text-red' : ''}">${formatBalanceINR(yg.closing)}</td>
        <td class="text-center font-bold">${yg.count}</td>
        <td class="text-center"><span class="badge" style="background:#ecfdf5; color:#16a34a; padding:2px 8px; border-radius:999px; font-size:10px; font-weight:600;">● Balanced</span></td>
      </tr>
    `;
  }).join('');

  renderReconMonths(accountsEngine.reconSelectedYear);
}

window.selectReconYear = function(yr) {
  accountsEngine.reconSelectedYear = yr;
  loadAccountReconciliation();
};

function renderReconMonths(y) {
  const mBody = document.getElementById('reconMonthlyBody');
  const headerYear = document.getElementById('reconMonthlyHeader');
  if (headerYear) headerYear.textContent = `Monthly Reconciliation — ${y}`;
  if (!mBody) return;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const activeYMs = Object.keys(accountsEngine.reconMonthly)
    .filter(ym => ym.startsWith(String(y)))
    .sort();

  if (activeYMs.length === 0) {
    mBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#64748b;">No monthly records found for this year.</td></tr>';
    renderReconDaily(null);
    return;
  }

  if (!accountsEngine.reconSelectedYM || !activeYMs.includes(accountsEngine.reconSelectedYM)) {
    accountsEngine.reconSelectedYM = activeYMs[activeYMs.length - 1];
  }

  mBody.innerHTML = activeYMs.map(ym => {
    const mg = accountsEngine.reconMonthly[ym];
    const isSelected = ym === accountsEngine.reconSelectedYM ? 'selected-recon-row' : '';
    const mNum = parseInt(ym.split('-')[1], 10) - 1;
    const isNeg = mg.closing < 0;

    return `
      <tr class="${isSelected}" onclick="selectReconMonth('${ym}')">
        <td class="font-bold text-navy" style="width: 110px; min-width: 110px; white-space: nowrap;">${monthNames[mNum]} ${y}</td>
        <td class="text-right">${formatBalanceINR(mg.opening)}</td>
        <td class="text-right text-green font-bold">+${formatBalanceINR(mg.credits).replace('₹', '₹')}</td>
        <td class="text-right text-red font-bold">-${formatBalanceINR(mg.debits).replace('₹', '₹')}</td>
        <td class="text-right font-bold ${isNeg ? 'text-red' : 'text-blue'}">${formatBalanceINR(mg.closing)}</td>
        <td class="text-center font-bold">${mg.count}</td>
      </tr>
    `;
  }).join('');

  renderReconDaily(accountsEngine.reconSelectedYM);
}

window.selectReconMonth = function(ym) {
  accountsEngine.reconSelectedYM = ym;
  const y = parseInt(ym.split('-')[0], 10);
  renderReconMonths(y);
};

function renderReconDaily(ym) {
  const stream = document.getElementById('reconDailyStream');
  if (!stream) return;

  if (!ym) {
    stream.innerHTML = '<div style="text-align:center; padding:30px; font-size:12px; color:#64748b;">No month selected.</div>';
    return;
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = ym.split('-');
  const y = parts[0];
  const mNum = parseInt(parts[1], 10) - 1;
  const mName = monthNames[mNum];

  const dailyHeader = document.getElementById('reconDailyHeader');
  if (dailyHeader) dailyHeader.textContent = `Daily Transactions — ${mName} ${y}`;

  const mObj = accountsEngine.reconMonthly[ym] || { opening: 0, credits: 0, debits: 0, closing: 0 };

  const rOpening = document.getElementById('rdKpiOpening');
  const rCredits = document.getElementById('rdKpiCredits');
  const rDebits = document.getElementById('rdKpiDebits');
  const rClosing = document.getElementById('rdKpiClosing');

  if (rOpening) rOpening.textContent = formatBalanceINR(mObj.opening);
  if (rCredits) rCredits.textContent = `+${formatBalanceINR(mObj.credits)}`;
  if (rDebits) rDebits.textContent = `-${formatBalanceINR(mObj.debits)}`;
  if (rClosing) {
    rClosing.textContent = formatBalanceINR(mObj.closing);
    rClosing.className = `kpi-num font-bold ${mObj.closing < 0 ? 'text-red' : 'text-blue'}`;
  }

  const days = Object.keys(accountsEngine.reconDaily)
    .filter(d => d.startsWith(ym))
    .sort()
    .reverse();

  if (days.length === 0) {
    stream.innerHTML = `<div style="text-align:center; padding:30px; font-size:12px; color:#64748b;">No transactions recorded for ${mName} ${y}.</div>`;
    return;
  }

  stream.innerHTML = days.map(ymd => {
    const dayObj = accountsEngine.reconDaily[ymd];
    const dParts = ymd.split('-');
    const d = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10));
    const dateFormatted = d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
    const isNegDayEnd = dayObj.dayEnd < 0;

    let rowsHtml = '';
    dayObj.txns.forEach(t => {
      const amtNum = Number(t.amount || 0);
      const isDebit = amtNum < 0;
      const absAmt = Math.abs(amtNum);
      const balNum = Number(t.calculatedRunningBalance || 0);
      const isBalNeg = balNum < 0;

      const descText = t.title || t.payee || t.description || 'Transaction';
      const notesText = t.notes || t.remarks;

      rowsHtml += `
        <tr>
          <td width="20" style="color:#94a3b8; text-align:center;">↳</td>
          <td>
            <div class="day-txn-desc">${descText}</div>
            ${notesText ? `<div class="day-txn-notes">💬 ${notesText}</div>` : ''}
          </td>
          <td class="text-right" style="white-space:nowrap; width:120px;">
            <strong class="${isDebit ? 'text-red' : 'text-green'}">
              ${isDebit ? '-' : '+'}${formatBalanceINR(absAmt)}
            </strong>
          </td>
          <td class="text-right text-muted" style="white-space:nowrap; width:130px; font-size:11px;">
            Bal: <strong class="${isBalNeg ? 'text-red' : 'text-navy'}">${formatBalanceINR(balNum)}</strong>
          </td>
        </tr>
      `;
    });

    return `
      <div class="recon-day-group">
        <div class="recon-day-banner" onclick="toggleReconDay('${ymd}')">
          <div class="recon-day-title-left">
            <span class="recon-day-toggle-arrow" id="arrow-${ymd}">▼</span>
            <span>📅 ${dateFormatted}</span>
            <span class="recon-day-cnt">(${dayObj.txns.length} txn${dayObj.txns.length > 1 ? 's' : ''})</span>
          </div>
          <div class="recon-day-right-stats">
            <span class="text-green font-bold">+${formatBalanceINR(dayObj.credits)}</span>
            <span class="text-red font-bold">-${formatBalanceINR(dayObj.debits)}</span>
            <span class="recon-day-closing-val ${isNegDayEnd ? 'negative' : ''}">
              Bal: ${formatBalanceINR(dayObj.dayEnd)}
            </span>
          </div>
        </div>
        <div id="body-${ymd}">
          <table class="day-txns-table">
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');
}

window.toggleReconDay = function(ymd) {
  const body = document.getElementById(`body-${ymd}`);
  const arrow = document.getElementById(`arrow-${ymd}`);
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  if (arrow) arrow.textContent = isHidden ? '▼' : '▶';
};