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
  selectedYear: 2026,
  selectedMonth: 8, // September (0-indexed)

  // Interactive Date Range Filters
  filterStartDate: null,
  filterEndDate: null,

  // Running Balances
  openingBalance: 0,
  openingDate: '2022-01-01',
  calculatedFinalBalance: 0,

  yearlyAggregates: {},
  monthlyAggregates: {},
  dailyAggregates: {},

  showDayEndBalance: true
};

// Safe balance formatter to preserve explicit negative signs in INR
function formatBalanceINR(val) {
  const num = Number(val || 0);
  const isNeg = num < 0;
  const absVal = Math.abs(num);
  const formatted = typeof window.formatINR === 'function'
    ? window.formatINR(absVal)
    : '₹' + absVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (isNeg ? '-' : '') + formatted;
}

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
    if (select) {
      select.innerHTML = recState.accounts.map(function(a) {
        return '<option value="' + a.id + '">' + a.name + ' (' + (a.account_number_masked || '****') + ')</option>';
      }).join('');

      select.addEventListener('change', async function(e) {
        recState.selectedAccountId = e.target.value;
        await loadAccountReconciliation(recState.selectedAccountId);
      });
    }

    const modalCatSelect = document.getElementById('editTxnCategory');
    if (modalCatSelect) {
      modalCatSelect.innerHTML = '<option value="">-- Select Category --</option>' +
        recState.categories.map(function(c) {
          return '<option value="' + c.id + '">' + c.name + '</option>';
        }).join('');
    }

    if (recState.accounts.length > 0) {
      recState.selectedAccountId = recState.accounts[0].id;
      if (select) select.value = recState.selectedAccountId;
      await loadAccountReconciliation(recState.selectedAccountId);
    }

  } catch (err) {
    console.error('Failed to initialize reconcile page:', err);
  }
};

// 2. Load Account & Run Calculations
async function loadAccountReconciliation(accountId) {
  const acc = recState.accounts.find(function(a) { return a.id === accountId; });
  if (!acc) return;
  recState.selectedAccount = acc;

  recState.openingBalance = parseFloat(acc.opening_balance || 0);
  recState.openingDate = acc.opening_date || '2022-01-01';

  const typeEl = document.getElementById('recMetaType');
  const instEl = document.getElementById('recMetaInstitution');
  const srcEl = document.getElementById('recSourceAccId');
  const openBalInput = document.getElementById('recOpeningBalanceInput');
  const openDateInput = document.getElementById('recOpeningDateInput');

  if (typeEl) typeEl.textContent = acc.account_type || 'Bank';
  if (instEl) instEl.textContent = acc.institution || 'Direct';
  if (srcEl) srcEl.textContent = acc.id;
  if (openBalInput) openBalInput.value = recState.openingBalance;
  if (openDateInput) openDateInput.value = recState.openingDate;

// Batch fetch all transactions to bypass the 1,000 row ceiling
  let allTxns = [];
  let from = 0;
  const pageSize = 1000;
  let keepFetching = true;

  while (keepFetching) {
    const { data: batch, error } = await window.db
      .from('transactions')
      .select('*')
      .eq('account_id', accountId)
      .order('date', { ascending: true })
      .order('time', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Error fetching account transactions batch:', error);
      break;
    }

    if (batch && batch.length > 0) {
      allTxns = allTxns.concat(batch);
      from += pageSize;
      if (batch.length < pageSize) {
        keepFetching = false;
      }
    } else {
      keepFetching = false;
    }
  }

  recState.transactions = allTxns;

  const metaCountEl = document.getElementById('recMetaCount');
  if (metaCountEl) metaCountEl.textContent = recState.transactions.length;

  if (recState.transactions.length > 0) {
    const minD = recState.transactions[0].date;
    const maxD = recState.transactions[recState.transactions.length - 1].date;
    const dateRangeEl = document.getElementById('recMetaDateRange');
    if (dateRangeEl) dateRangeEl.textContent = minD + ' – ' + maxD;

    const parts = maxD.split('-');
    recState.selectedYear = parseInt(parts[0], 10);
    recState.selectedMonth = parseInt(parts[1], 10) - 1;
  } else {
    const dateRangeEl = document.getElementById('recMetaDateRange');
    if (dateRangeEl) dateRangeEl.textContent = 'No records';
  }

  computeReconciliationLedger();
  renderAllReconcilePanels();
}

// 3. Original Pure Mathematical Forward Balance Calculation
function computeReconciliationLedger() {
  let totalCredits = 0;
  let totalDebits = 0;

  const yearly = {};
  const monthly = {};
  const daily = {};

  // Apply interactive date filters if set
  let activeTxns = recState.transactions.slice();
  if (recState.filterStartDate) {
    activeTxns = activeTxns.filter(function(t) { return t.date >= recState.filterStartDate; });
  }
  if (recState.filterEndDate) {
    activeTxns = activeTxns.filter(function(t) { return t.date <= recState.filterEndDate; });
  }

  // Pre-seed calendar buckets based on string splitting
  activeTxns.forEach(function(t) {
    const parts = (t.date || '').split('-');
    if (parts.length < 3) return;

    const y = parseInt(parts[0], 10);
    const mStr = parts[1];
    const mIndex = parseInt(mStr, 10) - 1;
    const ym = y + '-' + mStr;
    const ymd = t.date;

    if (!yearly[y]) yearly[y] = { year: y, opening: 0, credits: 0, debits: 0, closing: 0, count: 0 };
    if (!monthly[ym]) monthly[ym] = { ym: ym, year: y, monthIndex: mIndex, opening: 0, credits: 0, debits: 0, closing: 0, count: 0 };
    if (!daily[ymd]) daily[ymd] = { ymd: ymd, ym: ym, year: y, opening: 0, credits: 0, debits: 0, dayEnd: 0, txns: [] };
  });

  const sortedYears = Object.keys(yearly).map(Number).sort(function(a, b) { return a - b; });
  const sortedYMs = Object.keys(monthly).sort();
  const sortedYMDs = Object.keys(daily).sort();

  let currentBalance = recState.openingBalance;

  // Day-wise forward accumulation exactly as in your initial version
  sortedYMDs.forEach(function(ymd) {
    const dayObj = daily[ymd];
    dayObj.opening = currentBalance;

    const dayTxns = activeTxns.filter(function(t) { return t.date === ymd; });

    dayTxns.forEach(function(t) {
      const amt = Number(t.amount || 0);

      if (amt >= 0) {
        dayObj.credits += amt;
        totalCredits += amt;
      } else {
        dayObj.debits += Math.abs(amt);
        totalDebits += Math.abs(amt);
      }

      currentBalance = Math.round((currentBalance + amt) * 100) / 100;
      t.calculatedRunningBalance = currentBalance;
      dayObj.txns.push(t);
    });

    dayObj.dayEnd = currentBalance;
  });

  // Roll up Days to Months
  sortedYMs.forEach(function(ym) {
    const mObj = monthly[ym];
    const monthDays = sortedYMDs.filter(function(d) { return d.indexOf(ym) === 0; });
    if (monthDays.length > 0) {
      mObj.opening = daily[monthDays[0]].opening;
      mObj.closing = daily[monthDays[monthDays.length - 1]].dayEnd;
      monthDays.forEach(function(d) {
        mObj.credits += daily[d].credits;
        mObj.debits += daily[d].debits;
        mObj.count += daily[d].txns.length;
      });
    }
  });

  // Roll up Months to Years
  sortedYears.forEach(function(y) {
    const yObj = yearly[y];
    const yearMonths = sortedYMs.filter(function(ym) { return ym.indexOf(String(y)) === 0; });
    if (yearMonths.length > 0) {
      yObj.opening = monthly[yearMonths[0]].opening;
      yObj.closing = monthly[yearMonths[yearMonths.length - 1]].closing;
      yearMonths.forEach(function(m) {
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

  // Header Cards Update
  const heroAccName = document.getElementById('recHeroAccountName');
  const heroMasked = document.getElementById('recHeroMasked');
  const heroOpenBal = document.getElementById('heroOpeningBal');
  const heroOpenDate = document.getElementById('heroOpeningDate');
  const heroCredits = document.getElementById('heroTotalCredits');
  const heroDebits = document.getElementById('heroTotalDebits');
  const heroCalcBal = document.getElementById('heroCalculatedBal');

  if (heroAccName) heroAccName.textContent = recState.selectedAccount.name;
  if (heroMasked) heroMasked.textContent = recState.selectedAccount.account_number_masked || '****';
  if (heroOpenBal) heroOpenBal.textContent = formatBalanceINR(recState.openingBalance);
  if (heroOpenDate) heroOpenDate.textContent = recState.openingDate;
  if (heroCredits) heroCredits.textContent = '+' + formatBalanceINR(totalCredits);
  if (heroDebits) heroDebits.textContent = '-' + formatBalanceINR(totalDebits);

  if (heroCalcBal) {
    heroCalcBal.textContent = formatBalanceINR(recState.calculatedFinalBalance);
    if (recState.calculatedFinalBalance < 0) {
      heroCalcBal.classList.add('expense-val');
    } else {
      heroCalcBal.classList.remove('expense-val');
    }
  }
}

// 4. Render All Panels Simultaneously
function renderAllReconcilePanels() {
  renderYearlyTable();
  renderMonthlyTable();
  renderDailyStream();
}

// 5. Render Yearly Table
function renderYearlyTable() {
  const tbody = document.getElementById('recYearlyTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const years = Object.keys(recState.yearlyAggregates).map(Number).sort(function(a, b) { return a - b; });
  if (years.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding:24px;">No transactions recorded for this account.</td></tr>';
    return;
  }

  years.forEach(function(y) {
    const row = recState.yearlyAggregates[y];
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    if (y === recState.selectedYear) {
      tr.className = 'rec-row-selected';
    }

    tr.onclick = function() {
      recState.selectedYear = y;
      for (let m = 0; m < 12; m++) {
        const ym = y + '-' + String(m + 1).padStart(2, '0');
        if (recState.monthlyAggregates[ym]) {
          recState.selectedMonth = m;
          break;
        }
      }
      renderAllReconcilePanels();
    };

    const isNeg = row.closing < 0;

    tr.innerHTML = 
      '<td><strong>' + y + '</strong></td>' +
      '<td class="text-right">' + formatBalanceINR(row.opening) + '</td>' +
      '<td class="text-right income-val">+' + formatBalanceINR(row.credits) + '</td>' +
      '<td class="text-right expense-val">-' + formatBalanceINR(row.debits) + '</td>' +
      '<td class="text-right ' + (isNeg ? 'expense-val' : '') + '"><strong>' + formatBalanceINR(row.closing) + '</strong></td>' +
      '<td class="text-center">' + row.count + '</td>' +
      '<td><span class="badge" style="background:var(--finny-income-tint); color:var(--finny-income); padding:3px 8px; border-radius:var(--radius-pill); font-size:11px; font-weight:600;">● Calculated</span></td>' +
      '<td class="text-right"><button class="btn btn-outline" style="padding:2px 8px; font-size:11px;">Select Year</button></td>';

    tbody.appendChild(tr);
  });
}

// 6. Render Monthly Table
function renderMonthlyTable() {
  const tbody = document.getElementById('recMonthlyTableBody');
  const titleYear = document.getElementById('monthlyTitleYear');
  if (titleYear) titleYear.textContent = 'Monthly Reconciliation — ' + recState.selectedYear;
  if (!tbody) return;
  tbody.innerHTML = '';

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const y = recState.selectedYear;

  for (let m = 0; m < 12; m++) {
    const ym = y + '-' + String(m + 1).padStart(2, '0');
    const row = recState.monthlyAggregates[ym];
    const tr = document.createElement('tr');

    if (row && row.count > 0) {
      tr.style.cursor = 'pointer';
      if (m === recState.selectedMonth) {
        tr.className = 'rec-row-selected';
      }

      tr.onclick = (function(monthIdx) {
        return function() {
          recState.selectedMonth = monthIdx;
          renderMonthlyTable();
          renderDailyStream();
        };
      })(m);

      const isNeg = row.closing < 0;

      tr.innerHTML = 
        '<td><strong>' + monthNames[m] + ' ' + y + '</strong></td>' +
        '<td class="text-right">' + formatBalanceINR(row.opening) + '</td>' +
        '<td class="text-right income-val">+' + formatBalanceINR(row.credits) + '</td>' +
        '<td class="text-right expense-val">-' + formatBalanceINR(row.debits) + '</td>' +
        '<td class="text-right ' + (isNeg ? 'expense-val' : '') + '"><strong>' + formatBalanceINR(row.closing) + '</strong></td>' +
        '<td><span class="badge" style="background:var(--finny-income-tint); color:var(--finny-income); padding:2px 6px; border-radius:var(--radius-pill); font-size:10px; font-weight:600;">● Calculated</span></td>';
    } else {
      tr.style.opacity = '0.35';
      tr.innerHTML = 
        '<td>' + monthNames[m] + ' ' + y + '</td>' +
        '<td class="text-right">—</td>' +
        '<td class="text-right">—</td>' +
        '<td class="text-right">—</td>' +
        '<td class="text-right">—</td>' +
        '<td><span class="text-muted" style="font-size:10px;">—</span></td>';
    }
    tbody.appendChild(tr);
  }
}

// 7. Render Daily Transactions Stream
function renderDailyStream() {
  const container = document.getElementById('dailyGroupsContainer');
  if (!container) return;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mName = monthNames[recState.selectedMonth];
  const ym = recState.selectedYear + '-' + String(recState.selectedMonth + 1).padStart(2, '0');
  
  const dailyTitle = document.getElementById('dailyTitleHeader');
  if (dailyTitle) dailyTitle.textContent = 'Daily Transactions — ' + mName + ' ' + recState.selectedYear;

  const mObj = recState.monthlyAggregates[ym] || { opening: 0, credits: 0, debits: 0, closing: 0, count: 0 };
  const rOpening = document.getElementById('ribbonOpening');
  const rCredits = document.getElementById('ribbonCredits');
  const rDebits = document.getElementById('ribbonDebits');
  const rClosing = document.getElementById('ribbonClosing');

  if (rOpening) rOpening.textContent = formatBalanceINR(mObj.opening);
  if (rCredits) rCredits.textContent = '+' + formatBalanceINR(mObj.credits);
  if (rDebits) rDebits.textContent = '-' + formatBalanceINR(mObj.debits);
  if (rClosing) {
    rClosing.textContent = formatBalanceINR(mObj.closing);
    if (mObj.closing < 0) {
      rClosing.classList.add('expense-val');
    } else {
      rClosing.classList.remove('expense-val');
    }
  }

  container.innerHTML = '';

  const days = Object.keys(recState.dailyAggregates)
    .filter(function(d) { return d.indexOf(ym) === 0; })
    .sort();

  if (days.length === 0) {
    container.innerHTML = '<div class="text-center text-muted" style="padding: 30px;">No transactions recorded for ' + mName + ' ' + recState.selectedYear + '.</div>';
    return;
  }

  const showDayEndToggle = document.getElementById('toggleDayEndBal');
  const isBadgeVisible = showDayEndToggle ? showDayEndToggle.checked : (recState.showDayEndBalance !== false);

  days.forEach(function(ymd) {
    const dayObj = recState.dailyAggregates[ymd];
    const card = document.createElement('div');
    card.className = 'day-group-card';

    const parts = ymd.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    const dateFormatted = d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });

    let rowsHtml = '';
    dayObj.txns.forEach(function(t) {
      const amtNum = Number(t.amount || 0);
      const isDebit = amtNum < 0;
      const absAmt = Math.abs(amtNum);
      const balNum = Number(t.calculatedRunningBalance || 0);

      const noteHtml = (t.notes || t.remarks)
        ? '<div style="font-size:11px; color:var(--text-muted); margin-top:3px; font-weight:normal;">💬 <em>' + (t.notes || t.remarks) + '</em></div>'
        : '';
      const descText = t.title || t.description || 'Transaction';
      const amtSign = isDebit ? '-' : '+';
      const amtClass = isDebit ? 'expense-val' : 'income-val';
      const balClass = balNum < 0 ? 'expense-val' : '';

      rowsHtml += '<tr>' +
        '<td style="width:24px; text-align:center; color:var(--text-muted);"><span style="display:inline-block;">↳</span></td>' +
        '<td style="word-break:break-word;"><strong>' + descText + '</strong>' + noteHtml + '</td>' +
        '<td class="text-right ' + amtClass + '" style="white-space:nowrap; width:130px;"><strong>' + amtSign + formatBalanceINR(absAmt) + '</strong></td>' +
        '<td class="text-right text-muted" style="white-space:nowrap; width:130px; font-size:11px;">Bal: <strong class="' + balClass + '">' + formatBalanceINR(balNum) + '</strong></td>' +
        '<td class="text-right" style="width:40px; text-align:right;"><button type="button" class="action-icon-btn" onclick="openEditTxnModal(\'' + t.id + '\')" title="Edit Transaction">✏️</button></td>' +
      '</tr>';
    });

    const dayEndClass = dayObj.dayEnd < 0 ? 'expense-val' : '';
    const badgeDisplayStyle = isBadgeVisible ? 'inline-block' : 'none';

    card.innerHTML = 
      '<div class="day-group-header" onclick="toggleDayCollapse(\'' + ymd + '\')">' +
        '<div class="day-header-left">' +
          '<span class="day-toggle-arrow" id="arrow-' + ymd + '">▼</span>' +
          '<strong>' + dateFormatted + '</strong>' +
          '<span class="text-muted" style="font-size:11px;">(' + dayObj.txns.length + ')</span>' +
        '</div>' +
        '<div class="day-header-right">' +
          '<span class="income-val">+' + formatBalanceINR(dayObj.credits) + '</span>' +
          '<span class="expense-val">-' + formatBalanceINR(dayObj.debits) + '</span>' +
          '<span class="day-end-badge ' + dayEndClass + '" id="badge-' + ymd + '" style="display:' + badgeDisplayStyle + ';">Day-End: ' + formatBalanceINR(dayObj.dayEnd) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="day-group-body" id="body-' + ymd + '" style="display:block;">' +
        '<table class="day-txns-table"><tbody>' + rowsHtml + '</tbody></table>' +
      '</div>';

    container.appendChild(card);
  });
}

window.toggleDayCollapse = function(ymd) {
  const body = document.getElementById('body-' + ymd);
  const arrow = document.getElementById('arrow-' + ymd);
  if (!body) return;
  if (body.style.display === 'none') {
    body.style.display = 'block';
    if (arrow) arrow.textContent = '▼';
  } else {
    body.style.display = 'none';
    if (arrow) arrow.textContent = '▶';
  }
};

// 8. Custom Date Range Filters
window.onReconcileDateChange = function() {
  const startEl = document.getElementById('recFilterStartDate');
  const endEl = document.getElementById('recFilterEndDate');

  const startVal = startEl ? startEl.value : '';
  const endVal = endEl ? endEl.value : '';

  if (startVal && endVal && startVal > endVal) {
    alert('Start date cannot be after end date.');
    return;
  }

  recState.filterStartDate = startVal || null;
  recState.filterEndDate = endVal || null;

  computeReconciliationLedger();
  renderAllReconcilePanels();
};

window.resetReconcileDateRange = function() {
  const startEl = document.getElementById('recFilterStartDate');
  const endEl = document.getElementById('recFilterEndDate');
  if (startEl) startEl.value = '';
  if (endEl) endEl.value = '';

  recState.filterStartDate = null;
  recState.filterEndDate = null;

  computeReconciliationLedger();
  renderAllReconcilePanels();
};

// 9. In-place Transaction Editing & Recalculation
window.openEditTxnModal = function(txnId) {
  const t = recState.transactions.find(function(x) { return x.id === txnId; });
  if (!t) return;

  document.getElementById('editTxnId').value = t.id;
  document.getElementById('editTxnDate').value = t.date;
  document.getElementById('editTxnAmount').value = Math.abs(t.amount);
  document.getElementById('editTxnDescription').value = t.title || t.description || '';
  document.getElementById('editTxnType').value = t.type || (t.amount >= 0 ? 'Income' : 'Expense');
  document.getElementById('editTxnCategory').value = t.category_id || '';

  const modal = document.getElementById('editTxnModal');
  if (modal) modal.classList.add('open');
};

window.saveReconcileTransaction = async function() {
  const id = document.getElementById('editTxnId').value;
  const date = document.getElementById('editTxnDate').value;
  let amount = parseFloat(document.getElementById('editTxnAmount').value) || 0;
  const title = document.getElementById('editTxnDescription').value.trim();
  const type = document.getElementById('editTxnType').value;
  const category_id = document.getElementById('editTxnCategory').value;

  if (type === 'Expense' && amount > 0) amount = -amount;

  try {
    const { error } = await window.db.from('transactions').update({
      date: date,
      amount: amount,
      title: title,
      type: type,
      category_id: category_id || null
    }).eq('id', id);

    if (error) throw error;

    if (typeof window.closeAllModals === 'function') {
      window.closeAllModals();
    } else {
      const modal = document.getElementById('editTxnModal');
      if (modal) modal.classList.remove('open');
    }

    await loadAccountReconciliation(recState.selectedAccountId);
  } catch (err) {
    alert('Failed to save transaction: ' + err.message);
  }
};

// 10. Event Listeners & Binding
document.addEventListener('DOMContentLoaded', function() {
  window.initReconcilePage();

  const saveBalBtn = document.getElementById('saveOpeningBalanceBtn');
  if (saveBalBtn) {
    saveBalBtn.onclick = async function() {
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
  }

  const toggleDayBal = document.getElementById('toggleDayEndBal');
  if (toggleDayBal) {
    toggleDayBal.addEventListener('change', function(e) {
      const show = e.target.checked;
      document.querySelectorAll('.day-end-badge').forEach(function(badge) {
        badge.style.display = show ? 'inline-block' : 'none';
      });
    });
  }
});