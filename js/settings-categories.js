const catSettingsState = {
  catGroups: [],
  categories: [],
  catGroupMap: {},
  catGroupTotals: {},
  catTxnCounts: {},
  catTotals: {},
  expandedCatGroups: {},
  selectedCatGroupType: 'Expense',
  selectedCatGroupIcon: '🍽️'
};

window.loadCategoriesMasterData = async function() {
  try {
    const [grpRes, catRes, txnRes] = await Promise.all([
      window.db.from('category_groups').select('*').order('name', { ascending: true }),
      window.db.from('categories').select('*').order('name', { ascending: true }),
      window.db.from('transactions').select('category_id, category_group_id, amount')
    ]);

    catSettingsState.catGroups = grpRes.data || [];
    catSettingsState.categories = catRes.data || [];

    const groupMap = {};
    const groupTotals = {};
    const catCounts = {};
    const catTotals = {};

    catSettingsState.catGroups.forEach(g => {
      groupMap[g.id] = [];
      groupTotals[g.id] = 0;
    });

    (txnRes.data || []).forEach(t => {
      if (t.category_id) {
        catCounts[t.category_id] = (catCounts[t.category_id] || 0) + 1;
        catTotals[t.category_id] = (catTotals[t.category_id] || 0) + Math.abs(Number(t.amount || 0));
      }
      if (t.category_group_id && groupTotals[t.category_group_id] !== undefined) {
        groupTotals[t.category_group_id] += Math.abs(Number(t.amount || 0));
      }
    });

    catSettingsState.categories.forEach(c => {
      if (groupMap[c.group_id]) groupMap[c.group_id].push(c);
    });

    catSettingsState.catGroupMap = groupMap;
    catSettingsState.catGroupTotals = groupTotals;
    catSettingsState.catTxnCounts = catCounts;
    catSettingsState.catTotals = catTotals;

    renderCategoryHierarchy();
  } catch (err) {
    console.error('Failed to load category data:', err);
  }
};

function renderCategoryHierarchy() {
  const expenseBody = document.getElementById('settingsExpenseCatGroupsBody');
  const incomeBody = document.getElementById('settingsIncomeCatGroupsBody');
  const query = (document.getElementById('catSearchInput')?.value || '').toLowerCase();

  if (!expenseBody || !incomeBody) return;
  expenseBody.innerHTML = '';
  incomeBody.innerHTML = '';

  catSettingsState.catGroups.forEach(grp => {
    const children = catSettingsState.catGroupMap[grp.id] || [];
    const totalSpent = catSettingsState.catGroupTotals[grp.id] || 0;
    const isExpanded = catSettingsState.expandedCatGroups[grp.id] || query.length > 0;

    const matchingCats = children.filter(c => c.name.toLowerCase().includes(query));
    if (query && !grp.name.toLowerCase().includes(query) && matchingCats.length === 0) return;

    const tr = document.createElement('tr');
    tr.className = 'group-parent-row';
    tr.onclick = () => {
      catSettingsState.expandedCatGroups[grp.id] = !catSettingsState.expandedCatGroups[grp.id];
      renderCategoryHierarchy();
    };

    tr.innerHTML = `
      <td width="30"><span class="drag-handle">⠿</span></td>
      <td>
        <span class="group-toggle-icon">${isExpanded ? '▼' : '▶'}</span>
        <strong>${grp.icon || '🏷️'} ${grp.name}</strong>
      </td>
      <td class="text-muted" style="font-size:12px;">${grp.description || '—'}</td>
      <td class="text-center"><strong>${children.length}</strong></td>
      <td class="text-right"><strong>${window.formatINR(totalSpent)}</strong></td>
      <td><span class="badge-active">● Active</span></td>
      <td class="text-right" width="90" onclick="event.stopPropagation()">
        <div class="action-buttons-inline">
          <button class="action-icon-btn" onclick="openEditCatGroupModal('${grp.id}')" title="Edit Group">✏️</button>
          <button class="action-icon-btn danger" onclick="promptDeleteCatGroup('${grp.id}')" title="Delete Group">🗑️</button>
        </div>
      </td>
    `;

    const targetBody = (grp.type === 'Income') ? incomeBody : expenseBody;
    targetBody.appendChild(tr);

    if (isExpanded) {
      const displayCats = query ? matchingCats : children;
      if (displayCats.length === 0) {
        const emptyTr = document.createElement('tr');
        emptyTr.className = 'account-child-row';
        emptyTr.innerHTML = `
          <td colspan="7" class="text-muted" style="padding-left:36px; font-style:italic;">
            No categories in this group. Click "+ Add Category" to create one.
          </td>
        `;
        targetBody.appendChild(emptyTr);
      } else {
        displayCats.forEach(cat => {
          const catAmt = catSettingsState.catTotals[cat.id] || 0;
          const txnCount = catSettingsState.catTxnCounts[cat.id] || 0;
          const childTr = document.createElement('tr');
          childTr.className = 'account-child-row';
          childTr.innerHTML = `
            <td></td>
            <td>
              <div class="account-child-indent">
                <span>↳</span>
                <strong>${cat.name}</strong>
              </div>
            </td>
            <td class="text-muted">${txnCount} transaction(s)</td>
            <td class="text-center">—</td>
            <td class="text-right"><strong>${window.formatINR(catAmt)}</strong></td>
            <td><span class="badge-active" style="font-size:10px;">● Active</span></td>
            <td class="text-right" width="90">
              <div class="action-buttons-inline">
                <button class="action-icon-btn" onclick="event.stopPropagation(); openMoveCategoryModal('${cat.id}', '${cat.name}', '${grp.id}')" title="Move to another group">⇄</button>
                <button class="action-icon-btn" onclick="event.stopPropagation(); openEditCategoryModal('${cat.id}')" title="Edit category">✏️</button>
                <button class="action-icon-btn danger" onclick="event.stopPropagation(); promptDeleteCategory('${cat.id}', ${txnCount})" title="Delete category">🗑️</button>
              </div>
            </td>
          `;
          targetBody.appendChild(childTr);
        });
      }
    }
  });
}

window.openCreateCatGroupModal = function() {
  document.getElementById('catGroupModalTitle').textContent = 'Create Category Group';
  document.getElementById('editCatGroupId').value = '';
  document.getElementById('catGroupNameInput').value = '';
  document.getElementById('catGroupDescInput').value = '';
  setCatGroupType('Expense');
  document.getElementById('catGroupModal').classList.add('open');
};

window.openEditCatGroupModal = function(id) {
  const grp = catSettingsState.catGroups.find(g => g.id === id);
  if (!grp) return;
  document.getElementById('catGroupModalTitle').textContent = 'Edit Category Group';
  document.getElementById('editCatGroupId').value = grp.id;
  document.getElementById('catGroupNameInput').value = grp.name;
  document.getElementById('catGroupDescInput').value = grp.description || '';
  setCatGroupType(grp.type || 'Expense');
  document.getElementById('catGroupModal').classList.add('open');
};

window.setCatGroupType = function(type) {
  catSettingsState.selectedCatGroupType = type;
  const expBtn = document.getElementById('catTypeExpenseBtn');
  const incBtn = document.getElementById('catTypeIncomeBtn');
  if (type === 'Expense') {
    expBtn.classList.add('active'); incBtn.classList.remove('active');
  } else {
    incBtn.classList.add('active'); expBtn.classList.remove('active');
  }
};

window.selectCatGroupIcon = function(icon, el) {
  document.querySelectorAll('#catGroupIconPalette .icon-choice').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');
  catSettingsState.selectedCatGroupIcon = icon;
};

window.saveCategoryGroup = async function() {
  const id = document.getElementById('editCatGroupId').value.trim();
  const name = document.getElementById('catGroupNameInput').value.trim();
  const desc = document.getElementById('catGroupDescInput').value.trim();
  const type = catSettingsState.selectedCatGroupType;
  const icon = catSettingsState.selectedCatGroupIcon;

  if (!name) { alert('Please enter a group name.'); return; }

  try {
    if (id) {
      const { error } = await window.db.from('category_groups').update({ name, description: desc, type, icon }).eq('id', id);
      if (error) throw error;
    } else {
      const nextNum = catSettingsState.catGroups.length + 1;
      const genId = 'GRP' + String(nextNum).padStart(4, '0');
      const { error } = await window.db.from('category_groups').insert([{ id: genId, name, description: desc, type, icon }]);
      if (error) throw error;
    }
    window.closeAllModals();
    await window.loadCategoriesMasterData();
  } catch (err) {
    alert('Failed to save group: ' + err.message);
  }
};

window.promptDeleteCatGroup = function(id) {
  const grp = catSettingsState.catGroups.find(g => g.id === id);
  if (!grp) return;
  const children = catSettingsState.catGroupMap[grp.id] || [];

  window.currentDeleteTarget = { type: 'catGroup', id: grp.id, name: grp.name, count: children.length };

  const deleteModal = document.getElementById('deleteModal');
  const msg = document.getElementById('deleteModalMessage');
  const warningBox = document.getElementById('deleteWarningBox');
  const warningText = document.getElementById('deleteWarningText');
  const confirmBtn = document.getElementById('confirmDeleteBtn');

  if (children.length > 0) {
    msg.textContent = `Are you sure you want to delete "${grp.name}"?`;
    warningText.textContent = `This group currently contains ${children.length} category/categories. You must move or delete those categories first.`;
    warningBox.style.display = 'flex';
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.5';
    confirmBtn.textContent = 'Cannot Delete';
  } else {
    msg.textContent = `Are you sure you want to delete "${grp.name}"? This group is empty and can be safely deleted.`;
    warningBox.style.display = 'none';
    confirmBtn.disabled = false;
    confirmBtn.style.opacity = '1';
    confirmBtn.textContent = 'Delete Group';
  }

  deleteModal.classList.add('open');
};

window.openCreateCategoryModal = function() {
  document.getElementById('categoryModalTitle').textContent = 'Create Category';
  document.getElementById('editCategoryId').value = '';
  document.getElementById('categoryNameInput').value = '';
  const select = document.getElementById('categoryParentGroupSelect');
  select.innerHTML = catSettingsState.catGroups.map(g => `<option value="${g.id}">${g.icon || ''} ${g.name} (${g.type || 'Expense'})</option>`).join('');
  document.getElementById('categoryModal').classList.add('open');
};

window.openEditCategoryModal = function(id) {
  const cat = catSettingsState.categories.find(c => c.id === id);
  if (!cat) return;
  document.getElementById('categoryModalTitle').textContent = 'Edit Category';
  document.getElementById('editCategoryId').value = cat.id;
  document.getElementById('categoryNameInput').value = cat.name;
  const select = document.getElementById('categoryParentGroupSelect');
  select.innerHTML = catSettingsState.catGroups.map(g => `<option value="${g.id}" ${g.id === cat.group_id ? 'selected' : ''}>${g.icon || ''} ${g.name} (${g.type || 'Expense'})</option>`).join('');
  document.getElementById('categoryModal').classList.add('open');
};

window.saveCategory = async function() {
  const id = document.getElementById('editCategoryId').value.trim();
  const name = document.getElementById('categoryNameInput').value.trim();
  const groupId = document.getElementById('categoryParentGroupSelect').value;

  if (!name) { alert('Please enter a category name.'); return; }

  try {
    if (id) {
      const { error } = await window.db.from('categories').update({ name, group_id: groupId }).eq('id', id);
      if (error) throw error;
    } else {
      const nextNum = catSettingsState.categories.length + 1;
      const genId = 'CAT' + String(nextNum).padStart(4, '0');
      const { error } = await window.db.from('categories').insert([{ id: genId, name, group_id: groupId }]);
      if (error) throw error;
    }
    catSettingsState.expandedCatGroups[groupId] = true;
    window.closeAllModals();
    await window.loadCategoriesMasterData();
  } catch (err) {
    alert('Failed to save category: ' + err.message);
  }
};

window.openMoveCategoryModal = function(catId, catName, currentGroupId) {
  document.getElementById('moveTargetCatId').value = catId;
  document.getElementById('moveCatName').textContent = catName;
  const select = document.getElementById('moveTargetCatGroupSelect');
  select.innerHTML = catSettingsState.catGroups.map(g => `<option value="${g.id}" ${g.id === currentGroupId ? 'selected' : ''}>${g.icon || ''} ${g.name} (${g.type || 'Expense'})</option>`).join('');
  document.getElementById('moveCategoryModal').classList.add('open');
};

window.executeMoveCategory = async function() {
  const catId = document.getElementById('moveTargetCatId').value;
  const targetGroupId = document.getElementById('moveTargetCatGroupSelect').value;

  try {
    const { error } = await window.db.from('categories').update({ group_id: targetGroupId }).eq('id', catId);
    if (error) throw error;
    catSettingsState.expandedCatGroups[targetGroupId] = true;
    window.closeAllModals();
    await window.loadCategoriesMasterData();
  } catch (err) {
    alert('Failed to move category: ' + err.message);
  }
};

window.promptDeleteCategory = function(id, txnCount) {
  const cat = catSettingsState.categories.find(c => c.id === id);
  if (!cat) return;

  window.currentDeleteTarget = { type: 'category', id: cat.id, name: cat.name, count: txnCount };

  const deleteModal = document.getElementById('deleteModal');
  const msg = document.getElementById('deleteModalMessage');
  const warningBox = document.getElementById('deleteWarningBox');
  const warningText = document.getElementById('deleteWarningText');
  const confirmBtn = document.getElementById('confirmDeleteBtn');

  if (txnCount > 0) {
    msg.textContent = `This category cannot be deleted.`;
    warningText.textContent = `"${cat.name}" has ${txnCount} associated transaction(s). Deleting it would break historical transaction records.`;
    warningBox.style.display = 'flex';
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.5';
    confirmBtn.textContent = 'Cannot Delete';
  } else {
    msg.textContent = `Are you sure you want to delete category "${cat.name}"?`;
    warningBox.style.display = 'none';
    confirmBtn.disabled = false;
    confirmBtn.style.opacity = '1';
    confirmBtn.textContent = 'Delete Category';
  }

  deleteModal.classList.add('open');
};

document.addEventListener('DOMContentLoaded', () => {
  const catSearch = document.getElementById('catSearchInput');
  if (catSearch) catSearch.addEventListener('input', renderCategoryHierarchy);
});