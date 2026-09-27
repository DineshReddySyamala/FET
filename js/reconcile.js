// ==========================================================================
// FINNY RECONCILIATION ENGINE: DUAL-PANEL SYNC (YEAR -> MONTH + DAY)
// ==========================================================================

const recState = {
  accounts: [],
  selectedAccountId: null,
  selectedAccount: null,
  transactions: [],
  categories: [],
  
  // Active Selected Year & Month for Side-by-Side View
  selectedYear: 2025,
  selectedMonth: 7, // August (0-indexed)
  
  // Running Balances
  openingBalance: 0,
  openingDate: '2022-01-01',
  calculatedFinalBalance: 0,
  
  yearlyAggregates: {},
  monthlyAggregates: {},
  dailyAggregates: {},

  showDayEndBalance: true
};

// 1. Initial Load
window.initReconcilePage = async function() {
  try {
    const [accRes, catRes] = await Promise.all([
      window.db.from('accounts').select('*').order('name', { ascending: true }),
      window.db.from('categories').select('*').order('name', { ascending: true })
    ]);

    recState.accounts = accRes.data || [];
    recState.categories = catRes.data || [];

    const select = document.getElementById('recAccountSelect');
    select.innerHTML = recState.accounts.map(a => `
      <option value="${a.id}">${a.name} (${a.account_number_masked || '****'})</option>
    `).join('');

    const modalCatSelect = document.getElementById('editTxnCategory');
    if (modalCatSelect) {
      modalCatSelect.innerHTML = recState.categories.map(c => `
        <option value="${c.id}">${c.name}</option>
      `).join('');
    }

    if (recState.accounts.length > 0) {
      recState.selectedAccountId = recState.accounts[0].id;
      select.value = recState.selectedAccountId;
      await loadAccountReconciliation(recState.selectedAccountId);
    }

    select.addEventListener('change', async (e) => {
      recState.selectedAccountId = e.target.value;
      await loadAccountReconciliation(recState.selectedAccountId);
    });

  } catch (err) {
    console.error('Failed to initialize reconcile page:', err);
  }
};

// 2. Load Account & Run Calculations
async function loadAccountReconciliation(accountId) {
  const acc = recState.accounts.find(a => a.id === accountId);
  if (!acc) return;
  recState.selectedAccount = acc;

  recState.openingBalance = parseFloat(acc.opening_balance || 0);
  recState.openingDate = acc.opening_date || '2022-01-01';

  document.getElementById('recMetaType').textContent = acc.account_type || 'Bank';
  document.getElementById('recMetaInstitution').textContent = acc.institution || 'Direct';
  document.getElementById('recSourceAccId').textContent = acc.id;
  document.getElementById('recOpeningBalanceInput').value = recState.openingBalance;
  document.getElementById('recOpeningDateInput').value = recState.openingDate;

  const { data: txns, error } = await window.db
    .from('transactions')
    .select('*')
    .eq('account_id', accountId)
    .order('date', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    console.error('Error fetching account transactions:', error);
    return;
  }

  recState.transactions = txns || [];
  document.getElementById('recMetaCount').textContent = recState.transactions.length;

  if (recState.transactions.length > 0) {
    const minD = recState.transactions[0].date;
    const maxD = recState.transactions[recState.transactions.length - 1].date;
    document.getElementById('recMetaDateRange').textContent = `${minD} – ${maxD}`;

    // Auto-select latest year and month with data
    const lastTxnDate = new Date(maxD);
    recState.selectedYear = lastTxnDate.getFullYear();
    recState.selectedMonth = lastTxnDate.getMonth();
  } else {
    document.getElementById('recMetaDateRange').textContent = 'No records';
  }

  computeReconciliationLedger();
  renderAllReconcilePanels();
}

// 3. Forward Balance Calculation
function computeReconciliationLedger() {
  let running = recState.openingBalance;
  let totalCredits = 0;
  let totalDebits = 0;

  const yearly = {};
  const monthly = {};
  const daily = {};

  recState.transactions.forEach(t => {
    const d = new Date(t.date);
    const y = d.getFullYear();
    const ym = `${y}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const ymd = t.date;

    if (!yearly[y]) yearly[y] = { year: y, opening: 0, credits: 0, debits: 0, closing: 0, count: 0 };
    if (!monthly[ym]) monthly[ym] = { ym, year: y, monthIndex: d.getMonth(), opening: 0, credits: 0, debits: 0, closing: 0, count: 0 };
    if (!daily[ymd]) daily[ymd] = { ymd, ym, year: y, opening: 0, credits: 0, debits: 0, dayEnd: 0, txns: [] };
  });

  const sortedYears = Object.keys(yearly).map(Number).sort((a, b) => a - b);
  const sortedYMs = Object.keys(monthly).sort();
  const sortedYMDs = Object.keys(daily).sort();

  let currentBalance = recState.openingBalance;

  sortedYMDs.forEach(ymd => {
    const dayObj = daily[ymd];
    dayObj.opening = currentBalance;

    const dayTxns = recState.transactions.filter(t => t.date === ymd);
    dayTxns.forEach(t => {
      const amt = Number(t.amount || 0);
      if (amt >= 0) {
        dayObj.credits += amt;
        totalCredits += amt;
      } else {
        dayObj.debits += Math.abs(amt);
        totalDebits += Math.abs(amt);
      }
      currentBalance += amt;
      t.calculatedRunningBalance = currentBalance;
      dayObj.txns.push(t);
    });

    dayObj.dayEnd = currentBalance;
  });

  sortedYMs.forEach(ym => {
    const mObj = monthly[ym];
    const monthDays = sortedYMDs.filter(d => d.startsWith(ym));
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

  sortedYears.forEach(y => {
    const yObj = yearly[y];
    const yearMonths = sortedYMs.filter(ym => ym.startsWith(String(y)));
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

  recState.calculatedFinalBalance = currentBalance;
  recState.yearlyAggregates = yearly;
  recState.monthlyAggregates = monthly;
  recState.dailyAggregates = daily;

  // Hero Card Update
  document.getElementById('recHeroAccountName').textContent = recState.selectedAccount.name;
  document.getElementById('recHeroMasked').textContent = recState.selectedAccount.account_number_masked || '****';
  document.getElementById('heroOpeningBal').textContent = window.formatINR(recState.openingBalance);
  document.getElementById('heroOpeningDate').textContent = recState.openingDate;
  document.getElementById('heroTotalCredits').textContent = `+${window.formatINR(totalCredits)}`;
  document.getElementById('heroTotalDebits').textContent = `-${window.formatINR(totalDebits)}`;
  document.getElementById('heroCalculatedBal').textContent = window.formatINR(recState.calculatedFinalBalance);
}

// 4. Render All Panels Simultaneously
function renderAllReconcilePanels() {
  renderYearlyTable();
  renderMonthlyTable();
  renderDailyStream();
}

// 5. Render Yearly Table (with Selected Row Highlight)
function renderYearlyTable() {
  const tbody = document.getElementById('recYearlyTableBody');
  tbody.innerHTML = '';

  const years = Object.keys(recState.yearlyAggregates).map(Number).sort((a, b) => a - b);
  if (years.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding:24px;">No transactions recorded for this account.</td></tr>`;
    return;
  }

  years.forEach(y => {
    const row = recState.yearlyAggregates[y];
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    if (y === recState.selectedYear) {
      tr.className = 'rec-row-selected';
    }

    tr.onclick = () => {
      recState.selectedYear = y;
      // Auto-select first active month in that year
      for (let m = 0; m < 12; m++) {
        const ym = `${y}-${String(m + 1).padStart(2, '0')}`;
        if (recState.monthlyAggregates[ym]) {
          recState.selectedMonth = m;
          break;
        }
      }
      renderAllReconcilePanels();
    };

    tr.innerHTML = `
      <td><strong>${y}</strong></td>
      <td class="text-right">${window.formatINR(row.opening)}</td>
      <td class="text-right income-val">+${window.formatINR(row.credits)}</td>
      <td class="text-right expense-val">-${window.formatINR(row.debits)}</td>
      <td class="text-right"><strong>${window.formatINR(row.closing)}</strong></td>
      <td class="text-center">${row.count}</td>
      <td><span class="badge" style="background:var(--finny-income-tint); color:var(--finny-income); padding:3px 8px; border-radius:var(--radius-pill); font-size:11px; font-weight:600;">● Calculated</span></td>
      <td class="text-right">
        <button class="btn btn-outline" style="padding:2px 8px; font-size:11px;">Select Year</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 6. Render Monthly Table (with Selected Month Row Highlight)
function renderMonthlyTable() {
  const tbody = document.getElementById('recMonthlyTableBody');
  document.getElementById('monthlyTitleYear').textContent = `Monthly Reconciliation — ${recState.selectedYear}`;
  tbody.innerHTML = '';

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const y = recState.selectedYear;

  for (let m = 0; m < 12; m++) {
    const ym = `${y}-${String(m + 1).padStart(2, '0')}`;
    const row = recState.monthlyAggregates[ym];
    const tr = document.createElement('tr');

    if (row && row.count > 0) {
      tr.style.cursor = 'pointer';
      if (m === recState.selectedMonth) {
        tr.className = 'rec-row-selected';
      }

      tr.onclick = () => {
        recState.selectedMonth = m;
        renderMonthlyTable();
        renderDailyStream();
      };

      tr.innerHTML = `
        <td><strong>${monthNames[m]} ${y}</strong></td>
        <td class="text-right">${window.formatINR(row.opening)}</td>
        <td class="text-right income-val">+${window.formatINR(row.credits)}</td>
        <td class="text-right expense-val">-${window.formatINR(row.debits)}</td>
        <td class="text-right"><strong>${window.formatINR(row.closing)}</strong></td>
        <td><span class="badge" style="background:var(--finny-income-tint); color:var(--finny-income); padding:2px 6px; border-radius:var(--radius-pill); font-size:10px; font-weight:600;">● Calculated</span></td>
      `;
    } else {
      tr.style.opacity = '0.4';
      tr.innerHTML = `
        <td>${monthNames[m]} ${y}</td>
        <td class="text-right">—</td>
        <td class="text-right">—</td>
        <td class="text-right">—</td>
        <td class="text-right">—</td>
        <td><span class="text-muted" style="font-size:10px;">—</span></td>
      `;
    }
    tbody.appendChild(tr);
  }
}

// 7. Render Daily Transactions Stream on the Right
function renderDailyStream() {
  const container = document.getElementById('dailyGroupsContainer');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mName = monthNames[recState.selectedMonth];
  const ym = `${recState.selectedYear}-${String(recState.selectedMonth + 1).padStart(2, '0')}`;
  
  document.getElementById('dailyTitleHeader').textContent = `Daily Transactions — ${mName} ${recState.selectedYear}`;

  const mObj = recState.monthlyAggregates[ym] || { opening: 0, credits: 0, debits: 0, closing: 0, count: 0 };
  document.getElementById('ribbonOpening').textContent = window.formatINR(mObj.opening);
  document.getElementById('ribbonCredits').textContent = `+${window.formatINR(mObj.credits)}`;
  document.getElementById('ribbonDebits').textContent = `-${window.formatINR(mObj.debits)}`;
  document.getElementById('ribbonClosing').textContent = window.formatINR(mObj.closing);

  container.innerHTML = '';

  const days = Object.keys(recState.dailyAggregates)
    .filter(d => d.startsWith(ym))
    .sort();

  if (days.length === 0) {
    container.innerHTML = `<div class="text-center text-muted" style="padding: 30px;">No transactions recorded for ${mName} ${recState.selectedYear}.</div>`;
    return;
  }

  days.forEach(ymd => {
    const dayObj = recState.dailyAggregates[ymd];
    const card = document.createElement('div');
    card.className = 'day-group-card';

    const d = new Date(ymd);
    const dateFormatted = d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });

    card.innerHTML = `
      <div class="day-group-header" onclick="toggleDayCollapse('${ymd}')">
        <div class="day-header-left">
          <span class="day-toggle-arrow" id="arrow-${ymd}">▼</span>
          <strong>${dateFormatted}</strong>
          <span class="text-muted" style="font-size:11px;">(${dayObj.txns.length})</span>
        </div>
        <div class="day-header-right">
          <span class="income-val">+${window.formatINR(dayObj.credits)}</span>
          <span class="expense-val">-${window.formatINR(dayObj.debits)}</span>
          <span class="day-end-badge" id="badge-${ymd}">Day-End: ${window.formatINR(dayObj.dayEnd)}</span>
        </div>
      </div>

      <div class="day-group-body" id="body-${ymd}">
        <table class="day-txns-table">
          <tbody>
            ${dayObj.txns.map(t => `
              <tr>
                <td width="20"><span style="color:var(--text-muted);">↳</span></td>
                <td><strong>${t.description || 'Transaction'}</strong></td>
                <td class="text-right ${Number(t.amount) >= 0 ? 'income-val' : 'expense-val'}">
                  <strong>${Number(t.amount) >= 0 ? '+' : ''}${window.formatINR(t.amount)}</strong>
                </td>
                <td class="text-right text-muted" style="font-size:11px;">
                  Bal: <strong>${window.formatINR(t.calculatedRunningBalance)}</strong>
                </td>
                <td class="text-right" width="40">
                  <button class="action-icon-btn" onclick="openEditTxnModal('${t.id}')" title="Edit Transaction">✏️</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    container.appendChild(card);
  });
}

window.toggleDayCollapse = function(ymd) {
  const body = document.getElementById(`body-${ymd}`);
  const arrow = document.getElementById(`arrow-${ymd}`);
  if (body.style.display === 'none') {
    body.style.display = 'block';
    arrow.textContent = '▼';
  } else {
    body.style.display = 'none';
    arrow.textContent = '▶';
  }
};

// 8. In-place Transaction Editing & Recalculation
window.openEditTxnModal = function(txnId) {
  const t = recState.transactions.find(x => x.id === txnId);
  if (!t) return;

  document.getElementById('editTxnId').value = t.id;
  document.getElementById('editTxnDate').value = t.date;
  document.getElementById('editTxnAmount').value = Math.abs(t.amount);
  document.getElementById('editTxnDescription').value = t.description || '';
  document.getElementById('editTxnType').value = t.type || (t.amount >= 0 ? 'Income' : 'Expense');
  document.getElementById('editTxnCategory').value = t.category_id || '';

  document.getElementById('editTxnModal').classList.add('open');
};

window.saveReconcileTransaction = async function() {
  const id = document.getElementById('editTxnId').value;
  const date = document.getElementById('editTxnDate').value;
  let amount = parseFloat(document.getElementById('editTxnAmount').value) || 0;
  const description = document.getElementById('editTxnDescription').value.trim();
  const type = document.getElementById('editTxnType').value;
  const category_id = document.getElementById('editTxnCategory').value;

  if (type === 'Expense' && amount > 0) amount = -amount;

  try {
    const { error } = await window.db.from('transactions').update({
      date,
      amount,
      description,
      type,
      category_id: category_id || null
    }).eq('id', id);

    if (error) throw error;

    window.closeAllModals();
    await loadAccountReconciliation(recState.selectedAccountId);
  } catch (err) {
    alert('Failed to save transaction: ' + err.message);
  }
};

// 9. Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  window.initReconcilePage();

  document.getElementById('saveOpeningBalanceBtn').onclick = async () => {
    const newBal = parseFloat(document.getElementById('recOpeningBalanceInput').value) || 0;
    const newDate = document.getElementById('recOpeningDateInput').value;

    const { error } = await window.db.from('accounts').update({
      opening_balance: newBal,
      opening_date: newDate
    }).eq('id', recState.selectedAccountId);

    if (error) {
      alert('Failed to update opening balance: ' + error.message);
      return;
    }

    alert('Opening balance updated.');
    await loadAccountReconciliation(recState.selectedAccountId);
  };

  document.getElementById('toggleDayEndBal').addEventListener('change', (e) => {
    const show = e.target.checked;
    document.querySelectorAll('.day-end-badge').forEach(badge => {
      badge.style.display = show ? 'inline-block' : 'none';
    });
  });
});