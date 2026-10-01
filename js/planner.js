// ==========================================================================
// FINNY MONTHLY PLANNER CONTROLLER (DEFAULT COLLAPSED WITH LIGHT FOOTER)
// ==========================================================================

const plannerState = {
  selectedYear: 2026,
  categories: [],
  transactions: [],
  
  // All groups start fully collapsed on load
  collapsedSections: {
    income: true,
    expenses: true,
    fixed: true,
    variable: true,
    yearly: true
  }
};

function formatINR(val) {
  const num = Math.abs(Number(val) || 0);
  return '₹' + num.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

function getDb() {
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

document.addEventListener('DOMContentLoaded', async () => {
  const currentYr = new Date().getFullYear();
  plannerState.selectedYear = currentYr;
  document.getElementById('plannerYearLabel').textContent = currentYr;
  await loadPlannerData();
});

window.changePlannerYear = async function(delta) {
  plannerState.selectedYear += delta;
  document.getElementById('plannerYearLabel').textContent = plannerState.selectedYear;
  await loadPlannerData();
};

window.togglePlannerSection = function(sectionKey) {
  plannerState.collapsedSections[sectionKey] = !plannerState.collapsedSections[sectionKey];
  computeAndRenderPlannerMatrix();
};

// 1. Fetch Year Data
async function loadPlannerData() {
  const db = getDb();
  if (!db) return;

  const y = plannerState.selectedYear;
  const startYear = `${y}-01-01`;
  const endYear = `${y}-12-31`;

  document.getElementById('lblIncomeYear').textContent = `Total Income (${y})`;
  document.getElementById('lblExpenseYear').textContent = `Total Expenses (${y})`;

  const tbody = document.getElementById('plannerMatrixBody');
  tbody.innerHTML = '<tr><td colspan="14" class="text-center text-muted" style="padding: 40px;">Aggregating full-year matrix records...</td></tr>';

  try {
    const [catRes, txnsRes] = await Promise.all([
      db.from('categories').select('*').order('name'),
      db.from('transactions').select('*')
        .gte('date', startYear)
        .lte('date', endYear)
    ]);

    plannerState.categories = catRes.data || [];
    plannerState.transactions = txnsRes.data || [];

    computeAndRenderPlannerMatrix();

  } catch (err) {
    console.error('[Finny Planner] Error loading data:', err);
    tbody.innerHTML = `<tr><td colspan="14" class="text-center text-red" style="padding: 30px;">Error: ${err.message}</td></tr>`;
  }
}

// 2. Compute 12-Month Aggregations
function computeAndRenderPlannerMatrix() {
  const y = plannerState.selectedYear;
  const cats = plannerState.categories;
  const txns = plannerState.transactions;
  const coll = plannerState.collapsedSections;

  const monthlyIncome = new Array(12).fill(0);
  const monthlyFixed = new Array(12).fill(0);
  const monthlyVar = new Array(12).fill(0);
  const monthlyYearly = new Array(12).fill(0);
  const monthlyTotalExpenses = new Array(12).fill(0);
  const monthlyNet = new Array(12).fill(0);

  const incomeCats = [];
  const fixedCats = [];
  const varCats = [];
  const yearlyCats = [];

  cats.forEach(c => {
    const nat = (c.expense_nature || '').toLowerCase();
    const name = (c.name || '').toLowerCase();

    if (nat === 'income' || name.includes('salary') || name.includes('income')) {
      incomeCats.push(c);
    } else if (nat === 'fixed' || name.includes('rent') || name.includes('emi') || name.includes('maintenance')) {
      fixedCats.push(c);
    } else if (nat === 'yearly' || name.includes('insurance') || name.includes('tax') || name.includes('pollution')) {
      yearlyCats.push(c);
    } else {
      varCats.push(c);
    }
  });

  const getCatMonthlyData = (catId) => {
    const vals = new Array(12).fill(0);
    txns.filter(t => String(t.category_id) === String(catId)).forEach(t => {
      const parts = (t.date || '').split('-');
      if (parts.length >= 2) {
        const m = parseInt(parts[1], 10) - 1;
        if (m >= 0 && m < 12) {
          vals[m] += Math.abs(Number(t.amount || 0));
        }
      }
    });
    return vals;
  };

  let html = '';

  // --- SECTION 1: INCOME ---
  const incomeTotals = new Array(12).fill(0);
  const incomeRows = incomeCats.map(c => {
    const mVals = getCatMonthlyData(c.id);
    const rowTotal = mVals.reduce((a, b) => a + b, 0);
    mVals.forEach((v, idx) => { incomeTotals[idx] += v; monthlyIncome[idx] += v; });
    return { name: c.name, icon: '💵', vals: mVals, total: rowTotal };
  });

  const grandIncomeTotal = incomeTotals.reduce((a, b) => a + b, 0);

  html += `
    <tr class="matrix-sec-header-row income-hdr" onclick="togglePlannerSection('income')">
      <td class="col-sticky-cat">
        <span class="matrix-toggle-arrow">${coll.income ? '▸' : '▾'}</span>
        <span>💼</span> <strong>Income</strong>
      </td>
      ${incomeTotals.map(v => `<td class="text-right"><strong>${v > 0 ? formatINR(v) : '—'}</strong></td>`).join('')}
      <td class="text-right col-sticky-total"><strong>${grandIncomeTotal > 0 ? formatINR(grandIncomeTotal) : '—'}</strong></td>
    </tr>
  `;

  if (!coll.income) {
    incomeRows.forEach(r => {
      html += `
        <tr class="matrix-item-row">
          <td class="col-sticky-cat">
            <div class="matrix-item-title">
              <span class="matrix-item-icon">${r.icon}</span>
              <span>${r.name}</span>
            </div>
          </td>
          ${r.vals.map(v => `<td class="text-right text-muted">${v > 0 ? formatINR(v) : '—'}</td>`).join('')}
          <td class="text-right col-sticky-total"><strong>${r.total > 0 ? formatINR(r.total) : '—'}</strong></td>
        </tr>
      `;
    });
  }

  // Calculate Sub-group Totals
  const fixedTotals = new Array(12).fill(0);
  const fixedRows = fixedCats.map(c => {
    const mVals = getCatMonthlyData(c.id);
    const rowTotal = mVals.reduce((a, b) => a + b, 0);
    mVals.forEach((v, idx) => { fixedTotals[idx] += v; monthlyFixed[idx] += v; });
    return { name: c.name, icon: '🏠', vals: mVals, total: rowTotal };
  });
  const grandFixedTotal = fixedTotals.reduce((a, b) => a + b, 0);

  const varTotals = new Array(12).fill(0);
  const varRows = varCats.map(c => {
    const mVals = getCatMonthlyData(c.id);
    const rowTotal = mVals.reduce((a, b) => a + b, 0);
    mVals.forEach((v, idx) => { varTotals[idx] += v; monthlyVar[idx] += v; });
    return { name: c.name, icon: '🏷️', vals: mVals, total: rowTotal };
  });
  const grandVarTotal = varTotals.reduce((a, b) => a + b, 0);

  const yearlyTotals = new Array(12).fill(0);
  const yearlyRows = yearlyCats.map(c => {
    const mVals = getCatMonthlyData(c.id);
    const rowTotal = mVals.reduce((a, b) => a + b, 0);
    mVals.forEach((v, idx) => { yearlyTotals[idx] += v; monthlyYearly[idx] += v; });
    return { name: c.name, icon: '📅', vals: mVals, total: rowTotal };
  });
  const grandYearlyTotal = yearlyTotals.reduce((a, b) => a + b, 0);

  let grandTotalExpenseSum = 0;
  for (let m = 0; m < 12; m++) {
    monthlyTotalExpenses[m] = monthlyFixed[m] + monthlyVar[m] + monthlyYearly[m];
    monthlyNet[m] = monthlyIncome[m] - monthlyTotalExpenses[m];
    grandTotalExpenseSum += monthlyTotalExpenses[m];
  }
  const grandNetBalance = grandIncomeTotal - grandTotalExpenseSum;

  // --- SECTION 2: EXPENSES MASTER HEADER ---
  html += `
    <tr class="matrix-sec-header-row expense-hdr" onclick="togglePlannerSection('expenses')">
      <td class="col-sticky-cat">
        <span class="matrix-toggle-arrow">${coll.expenses ? '▸' : '▾'}</span>
        <span>🛒</span> <strong>Expenses</strong>
      </td>
      ${monthlyTotalExpenses.map(v => `<td class="text-right"><strong>${v > 0 ? formatINR(v) : '—'}</strong></td>`).join('')}
      <td class="text-right col-sticky-total"><strong>${grandTotalExpenseSum > 0 ? formatINR(grandTotalExpenseSum) : '—'}</strong></td>
    </tr>
  `;

  if (!coll.expenses) {
    // --- 2A: FIXED EXPENSES ---
    html += `
      <tr class="matrix-grp-row" onclick="togglePlannerSection('fixed')">
        <td class="col-sticky-cat">
          <span class="matrix-toggle-arrow">${coll.fixed ? '▸' : '▾'}</span>
          <strong>Fixed Expenses</strong>
        </td>
        ${fixedTotals.map(v => `<td class="text-right font-bold">${v > 0 ? formatINR(v) : '—'}</td>`).join('')}
        <td class="text-right col-sticky-total">${grandFixedTotal > 0 ? formatINR(grandFixedTotal) : '—'}</td>
      </tr>
    `;

    if (!coll.fixed) {
      fixedRows.forEach(r => {
        html += `
          <tr class="matrix-item-row">
            <td class="col-sticky-cat">
              <div class="matrix-item-title">
                <span class="matrix-item-icon">${r.icon}</span>
                <span>${r.name}</span>
              </div>
            </td>
            ${r.vals.map(v => `<td class="text-right text-muted">${v > 0 ? formatINR(v) : '—'}</td>`).join('')}
            <td class="text-right col-sticky-total"><strong>${r.total > 0 ? formatINR(r.total) : '—'}</strong></td>
          </tr>
        `;
      });
    }

    // --- 2B: VARIABLE EXPENSES ---
    html += `
      <tr class="matrix-grp-row" onclick="togglePlannerSection('variable')">
        <td class="col-sticky-cat">
          <span class="matrix-toggle-arrow">${coll.variable ? '▸' : '▾'}</span>
          <strong>Variable Expenses</strong>
        </td>
        ${varTotals.map(v => `<td class="text-right font-bold">${v > 0 ? formatINR(v) : '—'}</td>`).join('')}
        <td class="text-right col-sticky-total">${grandVarTotal > 0 ? formatINR(grandVarTotal) : '—'}</td>
      </tr>
    `;

    if (!coll.variable) {
      varRows.forEach(r => {
        html += `
          <tr class="matrix-item-row">
            <td class="col-sticky-cat">
              <div class="matrix-item-title">
                <span class="matrix-item-icon">${r.icon}</span>
                <span>${r.name}</span>
              </div>
            </td>
            ${r.vals.map(v => `<td class="text-right text-muted">${v > 0 ? formatINR(v) : '—'}</td>`).join('')}
            <td class="text-right col-sticky-total"><strong>${r.total > 0 ? formatINR(r.total) : '—'}</strong></td>
          </tr>
        `;
      });
    }

    // --- 2C: YEARLY EXPENSES ---
    html += `
      <tr class="matrix-grp-row" onclick="togglePlannerSection('yearly')">
        <td class="col-sticky-cat">
          <span class="matrix-toggle-arrow">${coll.yearly ? '▸' : '▾'}</span>
          <strong>Yearly / Ad-hoc Expenses</strong>
        </td>
        ${yearlyTotals.map(v => `<td class="text-right font-bold">${v > 0 ? formatINR(v) : '—'}</td>`).join('')}
        <td class="text-right col-sticky-total">${grandYearlyTotal > 0 ? formatINR(grandYearlyTotal) : '—'}</td>
      </tr>
    `;

    if (!coll.yearly) {
      yearlyRows.forEach(r => {
        html += `
          <tr class="matrix-item-row">
            <td class="col-sticky-cat">
              <div class="matrix-item-title">
                <span class="matrix-item-icon">${r.icon}</span>
                <span>${r.name}</span>
              </div>
            </td>
            ${r.vals.map(v => `<td class="text-right text-muted">${v > 0 ? formatINR(v) : '—'}</td>`).join('')}
            <td class="text-right col-sticky-total"><strong>${r.total > 0 ? formatINR(r.total) : '—'}</strong></td>
          </tr>
        `;
      });
    }
  }

  document.getElementById('plannerMatrixBody').innerHTML = html;

  // --- FOOTER ROW: LIGHT-THEMED BALANCE OF MONTH PILLS ---
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const footHtml = `
    <tr class="matrix-net-foot-row">
      <td class="col-sticky-cat">
        <div style="display:flex; align-items:center; gap:8px;">
          <span>⚖️</span>
          <strong>Balance of Month</strong>
        </div>
      </td>
      ${monthlyNet.map((netVal, mIdx) => {
        const hasTxns = monthlyIncome[mIdx] > 0 || monthlyTotalExpenses[mIdx] > 0;
        if (!hasTxns) return '<td class="text-right"><span class="net-pill neutral">—</span></td>';
        const isPos = netVal >= 0;
        return `
          <td class="text-right">
            <span class="net-pill ${isPos ? 'positive' : 'negative'}">
              ${isPos ? '+' : '-'}${formatINR(netVal)}
            </span>
          </td>
        `;
      }).join('')}
      <td class="text-right col-sticky-total">
        <span class="net-pill ${grandNetBalance >= 0 ? 'positive' : 'negative'}">
          ${grandNetBalance >= 0 ? '+' : '-'}${formatINR(grandNetBalance)}
        </span>
      </td>
    </tr>
  `;

  document.getElementById('plannerMatrixFoot').innerHTML = footHtml;

  // --- TOP KPIS UPDATE ---
  document.getElementById('kpiTotalIncome').textContent = formatINR(grandIncomeTotal);
  document.getElementById('kpiTotalExpenses').textContent = formatINR(grandTotalExpenseSum);

  let activeMonthsCount = 0;
  let bestMonthIdx = 0;
  let bestMonthVal = -Infinity;

  for (let m = 0; m < 12; m++) {
    if (monthlyIncome[m] > 0 || monthlyTotalExpenses[m] > 0) {
      activeMonthsCount++;
      if (monthlyNet[m] > bestMonthVal) {
        bestMonthVal = monthlyNet[m];
        bestMonthIdx = m;
      }
    }
  }

  const avgMonthly = activeMonthsCount > 0 ? (grandNetBalance / activeMonthsCount) : 0;
  const elAvg = document.getElementById('kpiAvgBalance');
  elAvg.textContent = (avgMonthly < 0 ? '-' : '') + formatINR(Math.abs(avgMonthly));
  elAvg.className = `kpi-value ${avgMonthly < 0 ? 'text-red' : 'text-green'}`;

  if (activeMonthsCount > 0 && bestMonthVal > -Infinity) {
    document.getElementById('kpiBestMonthName').textContent = `${monthNames[bestMonthIdx]} ${y}`;
    document.getElementById('kpiBestMonthAmt').textContent = `+${formatINR(bestMonthVal)} net surplus`;
  } else {
    document.getElementById('kpiBestMonthName').textContent = '—';
    document.getElementById('kpiBestMonthAmt').textContent = 'No records';
  }
}