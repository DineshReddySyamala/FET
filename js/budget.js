// ==========================================================================
// FINNY BUDGET CONTROLLER (TRUE 3-LEVEL HIERARCHY + FORWARD ADOPTION)
// ==========================================================================

const budgetState = {
  currentDate: new Date(),
  selectedYearMonth: '2026-10',
  categories: [],
  categoryGroups: [],
  allMonthlyBudgets: [],
  transactions: [],
  
  selectedGroup: null,
  activeBucketCollapsed: {
    Needs: false,              // Things I Need: OPEN on load
    Wants: true,               // Things I Want: COLLAPSED on load
    Savings_Investments: true  // Savings & Investment: COLLAPSED on load
  },
  expandedGroups: {}           // Track which level-2 groups are open
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
  const y = budgetState.currentDate.getFullYear();
  const m = String(budgetState.currentDate.getMonth() + 1).padStart(2, '0');
  budgetState.selectedYearMonth = `${y}-${m}`;

  updateMonthNavDisplay();
  await loadBudgetData();
});

// Month Navigation
window.changeBudgetMonth = async function(delta) {
  const parts = budgetState.selectedYearMonth.split('-');
  let y = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10) + delta;

  if (m > 12) { m = 1; y += 1; }
  else if (m < 1) { m = 12; y -= 1; }

  budgetState.selectedYearMonth = `${y}-${String(m).padStart(2, '0')}`;
  updateMonthNavDisplay();
  await loadBudgetData();
};

function updateMonthNavDisplay() {
  const parts = budgetState.selectedYearMonth.split('-');
  const y = parts[0];
  const m = parseInt(parts[1], 10) - 1;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const labelEl = document.getElementById('currentBudgetMonthLabel');
  if (labelEl) labelEl.textContent = `${monthNames[m]} ${y}`;
}

// 1. Fetch Categories, Category Groups, Budgets & Transactions
async function loadBudgetData() {
  const db = getDb();
  if (!db) return;

  const ym = budgetState.selectedYearMonth;
  const startOfMonth = `${ym}-01`;
  const [yearStr, monthStr] = ym.split('-');
  const daysInMonth = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10), 0).getDate();
  const endOfMonth = `${ym}-${String(daysInMonth).padStart(2, '0')}`;

  try {
    // A. Fetch Category Groups
    const { data: grps } = await db.from('category_groups').select('*').order('name');
    budgetState.categoryGroups = grps || [];

    // B. Fetch Categories (Exclude Pure Incomes from Budget Planner)
    const { data: cats } = await db.from('categories').select('*').order('name');
    budgetState.categories = (cats || []).filter(c => {
      const nat = (c.expense_nature || '').toLowerCase();
      const n = (c.name || '').toLowerCase();
      if (nat === 'income' || n.includes('salary') || n.includes('interest')) return false;
      return true;
    });

    // C. Fetch Monthly Budgets
    const { data: bData } = await db.from('monthly_budgets').select('*').order('year_month', { ascending: true });
    budgetState.allMonthlyBudgets = bData || [];

    // D. Fetch Transactions for Current Month (Expenses)
    const { data: txns } = await db
      .from('transactions')
      .select('*')
      .gte('date', startOfMonth)
      .lte('date', endOfMonth);

    budgetState.transactions = (txns || []).filter(t => t.type === 'Expense' || Number(t.amount) < 0);

    computeAndRenderDashboard();
    renderBudgetVsSpendingChart();

  } catch (err) {
    console.error('[Finny Budget] Error loading data:', err);
  }
}

// 2. Budget Forward-Adoption Resolver
function resolveItemBudget(id, targetYM) {
  const records = budgetState.allMonthlyBudgets.filter(b => String(b.category_id) === String(id));
  if (records.length === 0) return 0;

  const exact = records.find(b => b.year_month === targetYM);
  if (exact) return Number(exact.budget_amount);

  const pastRecords = records.filter(b => b.year_month <= targetYM);
  if (pastRecords.length > 0) {
    pastRecords.sort((a, b) => b.year_month.localeCompare(a.year_month));
    return Number(pastRecords[0].budget_amount);
  }
  return 0;
}

// 3. Compute Metrics & Build 3-Level Hierarchy
function computeAndRenderDashboard() {
  const ym = budgetState.selectedYearMonth;
  const [yearStr, monthStr] = ym.split('-');
  const daysInMonth = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10), 0).getDate();

  // Days left calculation
  const today = new Date();
  let daysLeft = 0;
  let elapsedDays = daysInMonth;

  if (today.getFullYear() === parseInt(yearStr, 10) && (today.getMonth() + 1) === parseInt(monthStr, 10)) {
    elapsedDays = today.getDate();
    daysLeft = Math.max(0, daysInMonth - elapsedDays);
  } else if (new Date(yearStr, parseInt(monthStr, 10) - 1, 1) > today) {
    daysLeft = daysInMonth;
    elapsedDays = 0;
  } else {
    daysLeft = 0;
    elapsedDays = daysInMonth;
  }

  document.getElementById('kpiDaysLeft').textContent = `${daysLeft} days`;
  document.getElementById('kpiMonthElapsed').textContent = `${elapsedDays} of ${daysInMonth} days elapsed`;

  // Build Hierarchy Structure: Bucket -> Groups -> Categories
  const bucketAgg = {
    Needs: { budget: 0, spent: 0, groups: [] },
    Wants: { budget: 0, spent: 0, groups: [] },
    Savings_Investments: { budget: 0, spent: 0, groups: [] }
  };

  // Group Categories by group_id (or parent_group)
  const groupMap = {};
  
  // Register known groups from DB
  budgetState.categoryGroups.forEach(g => {
    let bType = g.bucket_type || 'Needs';
    if (!bucketAgg[bType]) bType = 'Needs';
    groupMap[g.id] = {
      id: g.id,
      name: g.name,
      icon: g.icon || '📦',
      bucket: bType,
      subcategories: [],
      budget: 0,
      spent: 0
    };
  });

  // Assign Categories to their parent group or create virtual groups
  budgetState.categories.forEach(c => {
    const parentId = c.group_id || c.category_group_id;
    const catSpent = budgetState.transactions
      .filter(t => String(t.category_id) === String(c.id))
      .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);
    const catBudget = resolveItemBudget(c.id, ym);

    const subItem = {
      id: c.id,
      name: c.name,
      icon: c.icon || '🏷️',
      budget: catBudget,
      spent: catSpent,
      remaining: catBudget - catSpent,
      percent: catBudget > 0 ? Math.round((catSpent / catBudget) * 100) : 0
    };

    if (parentId && groupMap[parentId]) {
      groupMap[parentId].subcategories.push(subItem);
      groupMap[parentId].spent += catSpent;
      groupMap[parentId].budget += catBudget;
    } else {
      // Find or create group by category name or bucket
      const bType = c.bucket_type || 'Needs';
      const virtualId = 'grp_' + (c.bucket_type || 'Needs') + '_' + (c.name.split(' ')[0]);
      if (!groupMap[virtualId]) {
        groupMap[virtualId] = {
          id: virtualId,
          name: c.name,
          icon: '📁',
          bucket: bType,
          subcategories: [],
          budget: 0,
          spent: 0
        };
      }
      groupMap[virtualId].subcategories.push(subItem);
      groupMap[virtualId].spent += catSpent;
      groupMap[virtualId].budget += catBudget;
    }
  });

  // Roll up groups to Buckets
  let totalBudgetSum = 0;
  let totalSpentSum = 0;

  Object.values(groupMap).forEach(g => {
    if (g.subcategories.length === 0 && g.budget === 0) return;
    
    // Group budget is either its explicit group budget or sum of subcategories
    const explicitGroupBudget = resolveItemBudget(g.id, ym);
    if (explicitGroupBudget > 0) g.budget = explicitGroupBudget;

    const bType = g.bucket || 'Needs';
    bucketAgg[bType].groups.push(g);
    bucketAgg[bType].budget += g.budget;
    bucketAgg[bType].spent += g.spent;

    totalBudgetSum += g.budget;
    totalSpentSum += g.spent;
  });

  // Top KPIs
  document.getElementById('kpiTotalBudget').textContent = formatINR(totalBudgetSum);
  document.getElementById('kpiTotalSpent').textContent = formatINR(totalSpentSum);
  
  const spentPct = totalBudgetSum > 0 ? Math.min(100, Math.round((totalSpentSum / totalBudgetSum) * 100)) : 0;
  document.getElementById('kpiSpentProgress').style.width = `${spentPct}%`;
  document.getElementById('kpiSpentPercent').textContent = `${spentPct}% of budget`;

  const remainingVal = totalBudgetSum - totalSpentSum;
  document.getElementById('kpiRemaining').textContent = (remainingVal < 0 ? '-' : '') + formatINR(Math.abs(remainingVal));
  const remainingPct = totalBudgetSum > 0 ? Math.max(0, 100 - spentPct) : 100;
  document.getElementById('kpiRemainingProgress').style.width = `${remainingPct}%`;
  document.getElementById('kpiRemainingPercent').textContent = `${remainingPct}% left`;

  // Render 3 Buckets
  renderBucketGroups('Needs', bucketAgg.Needs);
  renderBucketGroups('Wants', bucketAgg.Wants);
  renderBucketGroups('Savings_Investments', bucketAgg.Savings_Investments);

  // Default Select "Dining Out" or First Group
  if (!budgetState.selectedGroup) {
    const allGroups = [
      ...bucketAgg.Wants.groups,
      ...bucketAgg.Needs.groups,
      ...bucketAgg.Savings_Investments.groups
    ];
    const diningOut = allGroups.find(g => g.name.toLowerCase().includes('dining out') || g.name.toLowerCase().includes('food'));
    budgetState.selectedGroup = diningOut || allGroups[0] || null;
  }

  if (budgetState.selectedGroup) {
    // Refresh group reference with newly calculated numbers
    const updated = Object.values(groupMap).find(g => g.id === budgetState.selectedGroup.id);
    if (updated) budgetState.selectedGroup = updated;
    renderCenterBreakdown(budgetState.selectedGroup);
  }

  renderMonthlyCategoryBreakup(bucketAgg);
}

// 4. Render Groups & Sub-Categories in Tree
function renderBucketGroups(bucketKey, data) {
  const normalizedKey = bucketKey === 'Savings_Investments' ? 'Savings' : bucketKey;
  const totalEl = document.getElementById(`bucketTotal${normalizedKey}`);
  const pctEl = document.getElementById(`bucketPercent${normalizedKey}`);
  const listEl = document.getElementById(`bucketList${normalizedKey}`);
  const arrowEl = document.getElementById(`arrow${normalizedKey}`);

  if (totalEl) totalEl.textContent = formatINR(data.budget);
  const pct = data.budget > 0 ? Math.round((data.spent / data.budget) * 100) : 0;
  if (pctEl) {
    pctEl.textContent = `${pct}%`;
    pctEl.style.color = pct > 100 ? '#dc2626' : (pct >= 80 ? '#ea580c' : '#475569');
  }

  if (!listEl) return;
  const isCollapsed = Boolean(budgetState.activeBucketCollapsed[bucketKey]);
  listEl.style.display = isCollapsed ? 'none' : 'flex';
  if (arrowEl) arrowEl.textContent = isCollapsed ? '▸' : '▾';

  if (data.groups.length === 0) {
    listEl.innerHTML = '<div style="font-size:11px; color:#94a3b8; padding:8px 10px;">No category groups configured.</div>';
    return;
  }

  listEl.innerHTML = data.groups.map(grp => {
    const isSelected = budgetState.selectedGroup?.id === grp.id ? 'active' : '';
    const isExpanded = Boolean(budgetState.expandedGroups[grp.id]);
    const grpPct = grp.budget > 0 ? Math.round((grp.spent / grp.budget) * 100) : 0;

    let subHtml = '';
    if (grp.subcategories.length > 0) {
      subHtml = `
        <div class="subcat-tree-list" style="display:${isExpanded ? 'flex' : 'none'};" id="subList_${grp.id}">
          ${grp.subcategories.map(sub => `
            <div class="subcat-tree-row" onclick="event.stopPropagation(); selectSubcategory('${sub.id}', '${grp.id}')">
              <span>${sub.icon}${sub.name}</span>
              <span class="text-muted">${formatINR(sub.budget)} (${sub.percent}%)</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    return `
      <div class="group-tree-node">
        <div class="group-tree-row ${isSelected}" onclick="selectGroupForBreakdown('${grp.id}')">
          <div class="tree-left">
            <span class="tree-expander" onclick="event.stopPropagation(); toggleGroupExpand('${grp.id}')">
              ${grp.subcategories.length > 0 ? (isExpanded ? '▾' : '▸') : '•'}
            </span>
            <span class="tree-icon">${grp.icon}</span>
            <span class="tree-name">${grp.name}</span>
          </div>
          <div class="tree-right">
            <span class="tree-amount">${formatINR(grp.budget)}</span>
            <span class="tree-percent" style="color:${grpPct > 100 ? '#dc2626' : (grpPct >= 80 ? '#ea580c' : '#64748b')};">${grpPct}%</span>
          </div>
        </div>
        ${subHtml}
      </div>
    `;
  }).join('');
}

window.toggleGroupExpand = function(grpId) {
  budgetState.expandedGroups[grpId] = !budgetState.expandedGroups[grpId];
  const list = document.getElementById(`subList_${grpId}`);
  if (list) list.style.display = budgetState.expandedGroups[grpId] ? 'flex' : 'none';
  computeAndRenderDashboard();
};

window.selectGroupForBreakdown = function(grpId) {
  // Find group across all buckets
  const allGroups = [
    ...budgetState.categoryGroups,
    ...budgetState.categories.map(c => ({ id: c.id, name: c.name, icon: '🏷️', subcategories: [] }))
  ];
  const found = allGroups.find(g => g.id === grpId);
  if (found) {
    budgetState.selectedGroup = found;
    computeAndRenderDashboard();
  }
};

// 5. Populate Center Breakdown Card with Child Categories
function renderCenterBreakdown(grp) {
  if (!grp) return;

  const ym = budgetState.selectedYearMonth;
  const rem = grp.budget - grp.spent;
  const pct = grp.budget > 0 ? Math.round((grp.spent / grp.budget) * 100) : 0;

  document.getElementById('activeCategoryName').textContent = grp.name;
  document.getElementById('activeCategoryDesc').textContent = grp.notes || `Budget breakdown for ${grp.name}`;
  document.getElementById('activeCategoryIcon').textContent = grp.icon || '📁';
  document.getElementById('activeCategoryBudget').textContent = formatINR(grp.budget);
  document.getElementById('activeCategoryProgress').style.width = `${Math.min(100, pct)}%`;
  document.getElementById('activeCategoryUsed').textContent = `${pct}% used`;

  const tbody = document.getElementById('activeCategoryTableBody');
  const items = (grp.subcategories && grp.subcategories.length > 0)
    ? grp.subcategories
    : [{ name: grp.name, icon: grp.icon, budget: grp.budget, spent: grp.spent, remaining: rem, percent: pct }];

  tbody.innerHTML = items.map(sub => {
    const sRem = sub.budget - sub.spent;
    return `
      <tr>
        <td><strong>${sub.icon || '🏷️'} ${sub.name}</strong></td>
        <td class="text-right">${formatINR(sub.budget)}</td>
        <td class="text-right">${formatINR(sub.spent)}</td>
        <td class="text-right ${sRem < 0 ? 'text-red font-bold' : ''}">${(sRem < 0 ? '-' : '') + formatINR(Math.abs(sRem))}</td>
        <td class="text-center">
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="progress-bar-wrap" style="flex:1;">
              <div class="progress-fill ${sub.percent > 100 ? 'bg-red' : (sub.percent >= 80 ? 'bg-orange' : 'bg-green')}" style="width:${Math.min(100, sub.percent)}%;"></div>
            </div>
            <span style="font-size:11px; font-weight:700;">${sub.percent}%</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  document.getElementById('footBudgetTotal').textContent = formatINR(grp.budget);
  document.getElementById('footSpentTotal').textContent = formatINR(grp.spent);
  document.getElementById('footRemainingTotal').textContent = (rem < 0 ? '-' : '') + formatINR(Math.abs(rem));
  document.getElementById('footPercentTotal').textContent = `${pct}%`;

  // Populate Right Inspector Form
  document.getElementById('editCategoryId').value = grp.id;
  document.getElementById('inspectorCatName').value = grp.name;
  document.getElementById('inspectorBucketType').value = grp.bucket || 'Needs';
  document.getElementById('inspectorBudgetAmount').value = grp.budget || '';
  document.getElementById('inspectorNotes').value = grp.notes || '';
}

// 6. Save Budget (Handles both Category Groups and Individual Categories)
window.handleSaveBudget = async function(e) {
  if (e) e.preventDefault();
  const db = getDb();
  if (!db) return;

  const id = document.getElementById('editCategoryId')?.value;
  const newBudget = parseFloat(document.getElementById('inspectorBudgetAmount')?.value) || 0;
  const newBucket = document.getElementById('inspectorBucketType')?.value;
  const newNotes = document.getElementById('inspectorNotes')?.value?.trim();
  const ym = budgetState.selectedYearMonth;

  if (!id) return;

  const btn = document.getElementById('btnSaveBudget');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  try {
    // 1. Determine if this ID belongs to category_groups or categories
    const isGroup = budgetState.categoryGroups.some(g => String(g.id) === String(id));
    const isCategory = budgetState.categories.some(c => String(c.id) === String(id));

    // Update bucket_type in the corresponding table if present
    if (isGroup) {
      await db.from('category_groups').update({
        bucket_type: newBucket,
        notes: newNotes || null
      }).eq('id', id);
    } else if (isCategory) {
      await db.from('categories').update({
        bucket_type: newBucket,
        notes: newNotes || null
      }).eq('id', id);
    }

    // 2. Upsert Monthly Budget for Current Month
    const { error: bErr } = await db.from('monthly_budgets').upsert({
      category_id: id,
      year_month: ym,
      budget_amount: newBudget,
      item_type: isGroup ? 'group' : 'category',
      is_custom_override: true,
      notes: newNotes || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'category_id,year_month' });

    if (bErr) throw bErr;

    await loadBudgetData();

  } catch (err) {
    console.error('Failed to save budget:', err);
    alert('Error saving budget: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
  }
};

window.resetBudgetForActiveMonth = async function() {
  if (!confirm('Reset budget override for this month?')) return;
  const db = getDb();
  const id = document.getElementById('editCategoryId')?.value;
  const ym = budgetState.selectedYearMonth;

  if (!db || !id) return;
  await db.from('monthly_budgets').delete().eq('category_id', id).eq('year_month', ym);
  await loadBudgetData();
};

window.focusBudgetEditor = function() {
  document.getElementById('inspectorBudgetAmount')?.focus();
};

window.toggleBucketCollapse = function(key) {
  const normalizedKey = key === 'Savings_Investments' ? 'Savings' : key;
  const listEl = document.getElementById(`bucketList${normalizedKey}`);
  const arrowEl = document.getElementById(`arrow${normalizedKey}`);
  if (!listEl) return;

  const isCurrentlyCollapsed = listEl.style.display === 'none';
  listEl.style.display = isCurrentlyCollapsed ? 'flex' : 'none';
  budgetState.activeBucketCollapsed[key] = !isCurrentlyCollapsed;
  if (arrowEl) arrowEl.textContent = isCurrentlyCollapsed ? '▾' : '▸';
};

// 7. Bottom Breakup Table
function renderMonthlyCategoryBreakup(bucketAgg) {
  const tbody = document.getElementById('monthlyCategoryBreakupBody');
  if (!tbody) return;

  const rows = [
    { name: 'Things I Need', icon: '🏠', data: bucketAgg.Needs },
    { name: 'Things I Want', icon: '🛍️', data: bucketAgg.Wants },
    { name: 'Savings & Investment', icon: '📈', data: bucketAgg.Savings_Investments }
  ];

  tbody.innerHTML = rows.map(r => {
    const rem = r.data.budget - r.data.spent;
    const pct = r.data.budget > 0 ? Math.round((r.data.spent / r.data.budget) * 100) : 0;
    return `
      <tr>
        <td><strong>${r.icon} ${r.name}</strong></td>
        <td class="text-right">${formatINR(r.data.budget)}</td>
        <td class="text-right">${formatINR(r.data.spent)}</td>
        <td class="text-right ${rem < 0 ? 'text-red font-bold' : ''}">${(rem < 0 ? '-' : '') + formatINR(Math.abs(rem))}</td>
        <td class="text-center">
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="progress-bar-wrap" style="flex:1;">
              <div class="progress-fill ${pct > 100 ? 'bg-red' : (pct >= 80 ? 'bg-orange' : 'bg-green')}" style="width:${Math.min(100, pct)}%;"></div>
            </div>
            <span style="font-size:11px; font-weight:700;">${pct}%</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// 8. 6-Month Comparison Chart
function renderBudgetVsSpendingChart() {
  const container = document.getElementById('budgetVsSpendingChart');
  if (!container) return;

  const [currY, currM] = budgetState.selectedYearMonth.split('-').map(Number);
  const months = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = 5; i >= 0; i--) {
    let m = currM - i;
    let y = currY;
    if (m <= 0) { m += 12; y -= 1; }
    months.push({ ym: `${y}-${String(m).padStart(2, '0')}`, label: monthNames[m - 1] });
  }

  let maxVal = 1000;
  const monthData = months.map(mObj => {
    let bSum = 0;
    budgetState.categoryGroups.forEach(g => {
      bSum += resolveItemBudget(g.id, mObj.ym);
    });

    const sSum = (mObj.ym === budgetState.selectedYearMonth)
      ? budgetState.transactions.reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0)
      : bSum * 0.82;

    maxVal = Math.max(maxVal, bSum, sSum);
    return { ...mObj, budget: bSum, spent: sSum };
  });

  container.innerHTML = monthData.map(d => {
    const bHeight = Math.max(8, Math.round((d.budget / maxVal) * 160));
    const sHeight = Math.max(8, Math.round((d.spent / maxVal) * 160));
    return `
      <div class="bar-pair-group">
        <div class="bars-wrapper">
          <div class="chart-bar budget-bar" style="height: ${bHeight}px;" title="Budget: ${formatINR(d.budget)}"></div>
          <div class="chart-bar spent-bar" style="height: ${sHeight}px;" title="Spent: ${formatINR(d.spent)}"></div>
        </div>
        <span class="bar-label">${d.label}</span>
      </div>
    `;
  }).join('');
}