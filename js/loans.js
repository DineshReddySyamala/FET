// ==========================================================================
// FINNY LOANS & BORROWINGS CONTROLLER
// Complete Calculation & Visualization Engine
// ==========================================================================

const loansState = {
  loans: [],
  accounts: [],
  activeFilter: 'ALL',
  calDate: new Date(),
  typeColors: {
    'EMI Loan': '#2563eb',
    'Yearly Loan': '#ea580c',
    'Hand Loan': '#9333ea',
    'Chit Fund': '#16a34a'
  }
};

function formatINR(val) {
  const num = Math.abs(Number(val) || 0);
  return '₹' + num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
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
  setupLoanListeners();
  await loadLoansData();
});

function setupLoanListeners() {
  document.getElementById('loanSearchInput')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('#loansTableBody tr').forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

// 1. Load Data from Supabase
async function loadLoansData() {
  const db = getDb();
  if (!db) return;

  try {
    const [loansRes, accRes] = await Promise.all([
      db.from('loans').select('*').order('created_at', { ascending: false }),
      db.from('accounts').select('*').order('name')
    ]);

    loansState.loans = loansRes.data || [];
    loansState.accounts = accRes.data || [];

    // Populate Account select in modal
    const accSelect = document.getElementById('loanAccountSelect');
    if (accSelect) {
      accSelect.innerHTML = '<option value="">(None / Direct Tracking)</option>' +
        loansState.accounts
          .filter(a => (a.account_group || '').toLowerCase().includes('loan') || (a.account_type || '').toLowerCase().includes('loan') || (a.current_balance < 0))
          .map(a => `<option value="${a.id}">${a.name} (${formatINR(a.current_balance || 0)})</option>`)
          .join('');
    }

    computeAndRenderLoansDashboard();

  } catch (err) {
    console.error('[Finny Loans] Error loading loans:', err);
  }
}

// 2. Compute Metrics & Render Dashboard
function computeAndRenderLoansDashboard() {
  const loans = loansState.loans;

  let totalOutstanding = 0;
  let totalPaid = 0;
  let monthlyEmiTotal = 0;
  let activeEmiCount = 0;

  // Process loan metrics
  const processed = loans.map(ln => {
    const principal = Number(ln.principal_amount || 0);
    const emi = Number(ln.emi_amount || 0);
    const installments = parseInt(ln.total_installments, 10) || 1;
    const totalPayable = Number(ln.total_payable || (emi * installments) || principal);

    // Calculate elapsed months since start_date
    const start = new Date(ln.start_date);
    const now = new Date();
    const elapsedMonths = Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()));
    const paidInstallments = Math.min(installments, elapsedMonths);
    const paidAmount = Math.min(totalPayable, paidInstallments * emi);
    const remaining = Math.max(0, totalPayable - paidAmount);
    const progress = totalPayable > 0 ? Math.min(100, Math.round((paidAmount / totalPayable) * 100)) : 0;

    if (ln.status === 'Active') {
      totalOutstanding += remaining;
      totalPaid += paidAmount;
      if (ln.loan_type === 'EMI Loan' || ln.loan_type === 'Chit Fund') {
        monthlyEmiTotal += emi;
        activeEmiCount++;
      }
    }

    return {
      ...ln,
      totalPayable,
      paidInstallments,
      paidAmount,
      remaining,
      progress
    };
  });

  // Top KPIs
  document.getElementById('kpiTotalOutstanding').textContent = formatINR(totalOutstanding);
  document.getElementById('kpiActiveCount').textContent = `Across ${loans.filter(l => l.status === 'Active').length} borrowings`;
  document.getElementById('kpiTotalPaid').textContent = formatINR(totalPaid);
  
  const totalDebtOverall = totalOutstanding + totalPaid;
  const paidPct = totalDebtOverall > 0 ? Math.round((totalPaid / totalDebtOverall) * 100) : 0;
  document.getElementById('kpiPaidProgress').style.width = `${paidPct}%`;
  document.getElementById('kpiPaidPercent').textContent = `${paidPct}% paid`;

  document.getElementById('kpiMonthlyCommitment').textContent = formatINR(monthlyEmiTotal);
  document.getElementById('kpiActiveEmiCount').textContent = `${activeEmiCount} active EMI loans`;

  // Find next upcoming payment
  const activeLoans = processed.filter(l => l.status === 'Active');
  activeLoans.sort((a, b) => (a.payment_day_of_month || 5) - (b.payment_day_of_month || 5));
  const nextLoan = activeLoans[0];
  if (nextLoan) {
    document.getElementById('kpiNextPaymentDue').textContent = formatINR(nextLoan.emi_amount);
    document.getElementById('kpiNextPaymentDesc').textContent = `${nextLoan.name} on ${nextLoan.payment_day_of_month}th of month`;
  }

  // Render Sub-Views
  renderDonutAnalytics(processed);
  renderMonthlyStackedProjection(processed);
  renderCompletionTimeline(processed);
  renderBorrowingsTable(processed);
  renderUpcomingPayments(processed);
  renderPaymentsCalendar(processed);
  renderLoanInsights(processed, totalOutstanding, totalPaid);
}

// 3. Outstanding by Type Donut
function renderDonutAnalytics(loans) {
  const typeSums = {};
  let total = 0;

  loans.filter(l => l.status === 'Active').forEach(l => {
    typeSums[l.loan_type] = (typeSums[l.loan_type] || 0) + l.remaining;
    total += l.remaining;
  });

  document.getElementById('donutCenterTotal').textContent = formatINR(total);

  const legendList = document.getElementById('donutLegendList');
  if (!legendList) return;

  if (total === 0) {
    legendList.innerHTML = '<div style="font-size:11px; color:#94a3b8;">No active loans</div>';
    return;
  }

  let gradStr = '';
  let curPct = 0;
  legendList.innerHTML = Object.keys(typeSums).map(type => {
    const amt = typeSums[type];
    const pct = Math.round((amt / total) * 100);
    const color = loansState.typeColors[type] || '#2563eb';

    gradStr += `${color} ${curPct}% ${curPct + pct}%, `;
    curPct += pct;

    return `
      <div class="donut-legend-row">
        <span><span class="legend-color-dot" style="background:${color};"></span> ${type}</span>
        <strong>${pct}% • ${formatINR(amt)}</strong>
      </div>
    `;
  }).join('');

  if (gradStr) {
    gradStr = gradStr.slice(0, -2);
    const donutEl = document.getElementById('donutVisual');
    if (donutEl) donutEl.style.background = `conic-gradient(${gradStr})`;
  }
}

// 4. Monthly Payments Projection (Next 6 Months)
function renderMonthlyStackedProjection(loans) {
  const container = document.getElementById('stackedPaymentsChart');
  if (!container) return;

  const now = new Date();
  const months = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({ label: `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`, date: d });
  }

  let maxMonthly = 1000;
  const activeLoans = loans.filter(l => l.status === 'Active');

  const monthBars = months.map(m => {
    let monthTotal = 0;
    const slices = activeLoans.map(l => {
      let isApplicable = true;
      if (new Date(l.end_date) < m.date) isApplicable = false;
      const amt = isApplicable ? Number(l.emi_amount || 0) : 0;
      monthTotal += amt;
      return { type: l.loan_type, amount: amt };
    });
    maxMonthly = Math.max(maxMonthly, monthTotal);
    return { ...m, total: monthTotal, slices };
  });

  container.innerHTML = monthBars.map(mb => {
    const totalH = Math.max(10, Math.round((mb.total / maxMonthly) * 100));
    return `
      <div class="proj-bar-col">
        <div class="proj-stacked-bars" style="height:${totalH}px;" title="Total: ${formatINR(mb.total)}">
          ${mb.slices.map(s => {
            const sH = mb.total > 0 ? (s.amount / mb.total) * 100 : 0;
            const color = loansState.typeColors[s.type] || '#2563eb';
            return `<div class="proj-slice" style="height:${sH}\%; background:${color};"></div>`;
          }).join('')}
        </div>
        <span class="proj-month-lbl">${mb.label}</span>
      </div>
    `;
  }).join('');
}

// 5. Completion Timeline
function renderCompletionTimeline(loans) {
  const list = document.getElementById('loanTimelineList');
  if (!list) return;

  const active = loans.filter(l => l.status === 'Active');
  if (active.length === 0) {
    list.innerHTML = '<div style="font-size:11px; color:#94a3b8; padding:10px;">No active loans found.</div>';
    return;
  }

  list.innerHTML = active.map(l => {
    const color = loansState.typeColors[l.loan_type] || '#2563eb';
    const closeDate = l.end_date ? new Date(l.end_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—';
    return `
      <div class="timeline-row">
        <span class="timeline-name" title="${l.name}">${l.name}</span>
        <div class="timeline-progress-wrap">
          <div class="timeline-progress-fill" style="width:${l.progress}%; background:${color};"></div>
        </div>
        <span class="timeline-date">${closeDate}</span>
      </div>
    `;
  }).join('');
}

// 6. Master Table
function renderBorrowingsTable(loans) {
  const tbody = document.getElementById('loansTableBody');
  if (!tbody) return;

  let displayList = loans;
  if (loansState.activeFilter !== 'ALL') {
    displayList = loans.filter(l => l.loan_type === loansState.activeFilter);
  }

  if (displayList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13" class="text-center text-muted" style="padding: 40px;">No borrowings found in this view.</td></tr>';
    return;
  }

  tbody.innerHTML = displayList.map(l => {
    const typeClass = l.loan_type === 'EMI Loan' ? 'type-emi' :
                     (l.loan_type === 'Yearly Loan' ? 'type-yearly' :
                     (l.loan_type === 'Hand Loan' ? 'type-hand' : 'type-chit'));

    return `
      <tr>
        <td><strong>${l.name}</strong></td>
        <td><span class="loan-type-pill ${typeClass}">${l.loan_type}</span></td>
        <td>${l.lender_name}</td>
        <td class="text-right">${formatINR(l.principal_amount)}</td>
        <td class="text-right"><strong>${formatINR(l.emi_amount)}</strong> <span class="text-muted" style="font-size:10px;">/mo</span></td>
        <td class="text-center"><strong>${l.paidInstallments}</strong> / ${l.total_installments}</td>
        <td class="text-right font-bold">${formatINR(l.totalPayable)}</td>
        <td>${l.start_date}</td>
        <td>${l.end_date}</td>
        <td class="text-right text-green font-bold">${formatINR(l.paidAmount)}</td>
        <td class="text-right text-red font-bold">${formatINR(l.remaining)}</td>
        <td class="text-center">
          <div style="display:flex; align-items:center; gap:6px;">
            <div class="progress-bar-wrap" style="flex:1;">
              <div class="progress-fill bg-blue" style="width:${l.progress}%;"></div>
            </div>
            <span style="font-size:10px; font-weight:700;">${l.progress}%</span>
          </div>
        </td>
        <td class="text-right">
          <button class="stage-icon-btn edit-btn" onclick="openBorrowingModal('${l.id}')">✏️</button>
          <button class="stage-icon-btn delete-btn" onclick="deleteBorrowing('${l.id}')">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.filterBorrowingsTable = function(type, el) {
  loansState.activeFilter = type;
  document.querySelectorAll('.loans-menu-item').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  computeAndRenderLoansDashboard();
};

// 7. Upcoming Payments
function renderUpcomingPayments(loans) {
  const container = document.getElementById('upcomingPaymentsList');
  if (!container) return;

  const active = loans.filter(l => l.status === 'Active');
  active.sort((a, b) => (a.payment_day_of_month || 5) - (b.payment_day_of_month || 5));

  container.innerHTML = active.map(l => {
    const day = l.payment_day_of_month || 5;
    return `
      <div class="upcoming-pay-row">
        <div class="up-left">
          <span class="up-date">${day}th of this month</span>
          <span class="up-name">${l.name} (${l.lender_name})</span>
        </div>
        <div class="up-right">
          <span class="up-amt">${formatINR(l.emi_amount)}</span>
          <span class="loan-type-pill type-emi">${l.loan_type}</span>
        </div>
      </div>
    `;
  }).join('');
}

// 8. Dynamic Payment Calendar
function renderPaymentsCalendar(loans) {
  const grid = document.getElementById('paymentsCalendarGrid');
  if (!grid) return;

  const dt = loansState.calDate;
  const y = dt.getFullYear();
  const m = dt.getMonth();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  document.getElementById('calMonthHeader').textContent = `Payments Calendar — ${monthNames[m]} ${y}`;

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  // Map active loan due days
  const dueDays = {};
  loans.filter(l => l.status === 'Active').forEach(l => {
    const day = l.payment_day_of_month || 5;
    dueDays[day] = (dueDays[day] || 0) + Number(l.emi_amount || 0);
  });

  const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let html = dayHeaders.map(h => `<div class="cal-header-cell">${h}</div>`).join('');

  for (let i = 0; i < firstDay; i++) {
    html += '<div class="cal-day-cell" style="opacity:0.2;"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const hasDue = Boolean(dueDays[d]);
    html += `
      <div class="cal-day-cell ${hasDue ? 'has-due' : ''}">
        <span>${d}</span>
        ${hasDue ? `<span class="cal-due-pill">${formatINR(dueDays[d]).slice(0, -3)}</span>` : ''}
      </div>
    `;
  }

  grid.innerHTML = html;
}

window.navCalMonth = function(delta) {
  loansState.calDate.setMonth(loansState.calDate.getMonth() + delta);
  computeAndRenderLoansDashboard();
};

window.scrollToPaymentCalendar = function() {
  document.getElementById('calendarSection')?.scrollIntoView({ behavior: 'smooth' });
};

// 9. Insights
function renderLoanInsights(loans, outstanding, paid) {
  const list = document.getElementById('loanInsightsList');
  if (!list) return;

  const active = loans.filter(l => l.status === 'Active');
  active.sort((a, b) => new Date(b.end_date) - new Date(a.end_date));
  const latestEnd = active[0]?.end_date ? new Date(active[0].end_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : 'N/A';

  list.innerHTML = `
    <div class="insight-item">
      <div class="insight-icon-box bg-tint-green">🎯</div>
      <div class="insight-content">
        <h4>You will be debt-free by ${latestEnd}</h4>
        <p>All active loans will be fully completed based on current scheduled tenures.</p>
      </div>
    </div>
    <div class="insight-item">
      <div class="insight-icon-box bg-tint-blue">💡</div>
      <div class="insight-content">
        <h4>Consider Part Pre-payments</h4>
        <p>Pre-paying ₹50,000 against your highest interest personal loan can save up to ₹18,000 in interest.</p>
      </div>
    </div>
    <div class="insight-item">
      <div class="insight-icon-box bg-tint-purple">⚖️</div>
      <div class="insight-content">
        <h4>Debt-to-Asset Health</h4>
        <p>Current debt accounts for ${Math.round((outstanding / (outstanding + paid || 1)) * 100)}% of your lifetime recorded borrowings.</p>
      </div>
    </div>
  `;
}

// 10. Modal Save / Delete
window.openBorrowingModal = function(id = null) {
  document.getElementById('borrowingForm')?.reset();
  document.getElementById('borrowingId').value = id || '';
  document.getElementById('borrowingModalTitle').textContent = id ? 'Edit Borrowing' : 'Add Borrowing';

  if (id) {
    const loan = loansState.loans.find(l => l.id === id);
    if (loan) {
      document.getElementById('loanNameInput').value = loan.name;
      document.getElementById('loanTypeSelect').value = loan.loan_type;
      document.getElementById('loanLenderInput').value = loan.lender_name;
      document.getElementById('loanAccountSelect').value = loan.account_id || '';
      document.getElementById('loanPrincipalInput').value = loan.principal_amount;
      document.getElementById('loanEmiInput').value = loan.emi_amount;
      document.getElementById('loanTenureInput').value = loan.total_installments;
      document.getElementById('loanTotalPayableInput').value = loan.total_payable;
      document.getElementById('loanStartDateInput').value = loan.start_date;
      document.getElementById('loanEndDateInput').value = loan.end_date;
      document.getElementById('loanPaymentDayInput').value = loan.payment_day_of_month || 5;
      document.getElementById('loanStatusSelect').value = loan.status;
      document.getElementById('loanNotesInput').value = loan.notes || '';
    }
  } else {
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('loanStartDateInput').value = today;
    recalcLoanEstimates();
  }

  document.getElementById('borrowingModal').style.display = 'flex';
};

window.closeBorrowingModal = function() {
  document.getElementById('borrowingModal').style.display = 'none';
};

window.recalcLoanEstimates = function() {
  const emi = parseFloat(document.getElementById('loanEmiInput')?.value) || 0;
  const tenure = parseInt(document.getElementById('loanTenureInput')?.value, 10) || 1;
  const principal = parseFloat(document.getElementById('loanPrincipalInput')?.value) || 0;
  const startDateStr = document.getElementById('loanStartDateInput')?.value;

  const payableEl = document.getElementById('loanTotalPayableInput');
  if (payableEl && !payableEl.value) {
    payableEl.value = (emi * tenure) || principal;
  }

  if (startDateStr) {
    const dt = new Date(startDateStr);
    dt.setMonth(dt.getMonth() + tenure);
    document.getElementById('loanEndDateInput').value = dt.toISOString().slice(0, 10);
  }
};

window.handleSaveBorrowing = async function(e) {
  e.preventDefault();
  const db = getDb();
  if (!db) return;

  const id = document.getElementById('borrowingId').value;
  const payload = {
    name: document.getElementById('loanNameInput').value.trim(),
    loan_type: document.getElementById('loanTypeSelect').value,
    lender_name: document.getElementById('loanLenderInput').value.trim(),
    account_id: document.getElementById('loanAccountSelect').value || null,
    principal_amount: parseFloat(document.getElementById('loanPrincipalInput').value) || 0,
    emi_amount: parseFloat(document.getElementById('loanEmiInput').value) || 0,
    total_installments: parseInt(document.getElementById('loanTenureInput').value, 10) || 1,
    total_payable: parseFloat(document.getElementById('loanTotalPayableInput').value) || 0,
    start_date: document.getElementById('loanStartDateInput').value,
    end_date: document.getElementById('loanEndDateInput').value,
    payment_day_of_month: parseInt(document.getElementById('loanPaymentDayInput').value, 10) || 5,
    status: document.getElementById('loanStatusSelect').value,
    notes: document.getElementById('loanNotesInput').value.trim() || null,
    updated_at: new Date().toISOString()
  };

  const btn = document.getElementById('btnSaveBorrowing');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  try {
    if (id) {
      await db.from('loans').update(payload).eq('id', id);
    } else {
      await db.from('loans').insert([payload]);
    }
    closeBorrowingModal();
    await loadLoansData();
  } catch (err) {
    alert('Error saving loan: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Borrowing'; }
  }
};

window.deleteBorrowing = async function(id) {
  if (!confirm('Are you sure you want to delete this borrowing?')) return;
  const db = getDb();
  if (!db) return;

  await db.from('loans').delete().eq('id', id);
  await loadLoansData();
};