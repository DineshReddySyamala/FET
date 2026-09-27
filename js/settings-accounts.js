const settingsState = {
  groups: [],
  accounts: [],
  groupAccountMap: {},
  groupBalances: {},
  accountTxnCounts: {},
  accountBalances: {},
  expandedGroups: {},
  selectedGroupType: 'Asset',
  selectedGroupIcon: '🏛️'
};

window.loadSettingsMasterData = async function() {
  try {
    const [grpRes, accRes, txnRes] = await Promise.all([
      window.db.from('account_groups').select('*').order('display_order', { ascending: true }),
      window.db.from('accounts').select('*').order('name', { ascending: true }),
      window.db.from('transactions').select('account_id, amount')
    ]);

    settingsState.groups = grpRes.data || [];
    settingsState.accounts = accRes.data || [];

    const groupMap = {};
    const balances = {};
    const txnCounts = {};
    const accBal = {};

    settingsState.groups.forEach(g => {
      groupMap[g.name] = [];
      balances[g.name] = 0;
    });

    (txnRes.data || []).forEach(t => {
      txnCounts[t.account_id] = (txnCounts[t.account_id] || 0) + 1;
      accBal[t.account_id] = (accBal[t.account_id] || 0) + Number(t.amount || 0);
    });

    settingsState.accountTxnCounts = txnCounts;

    settingsState.accounts.forEach(a => {
      const grp = a.account_group || 'Other Assets';
      if (!groupMap[grp]) groupMap[grp] = [];
      groupMap[grp].push(a);

      const fullBalance = (Number(a.opening_balance) || 0) + (accBal[a.id] || 0);
      accBal[a.id] = fullBalance;
      balances[grp] = (balances[grp] || 0) + Math.abs(fullBalance);
    });

    settingsState.groupAccountMap = groupMap;
    settingsState.groupBalances = balances;
    settingsState.accountBalances = accBal;

    renderSettingsHierarchy();
  } catch (err) {
    console.error('Failed to load settings accounts:', err);
  }
};

function renderSettingsHierarchy() {
  const assetBody = document.getElementById('settingsAssetGroupsBody');
  const liabilityBody = document.getElementById('settingsLiabilityGroupsBody');
  const query = (document.getElementById('settingsSearchInput')?.value || '').toLowerCase();

  if (!assetBody || !liabilityBody) return;
  assetBody.innerHTML = '';
  liabilityBody.innerHTML = '';

  settingsState.groups.forEach(grp => {
    const accountsInGroup = settingsState.groupAccountMap[grp.name] || [];
    const balance = settingsState.groupBalances[grp.name] || 0;
    const isExpanded = settingsState.expandedGroups[grp.name] || query.length > 0;

    const matchingAccounts = accountsInGroup.filter(a => 
      a.name.toLowerCase().includes(query) || (a.institution || '').toLowerCase().includes(query)
    );

    if (query && !grp.name.toLowerCase().includes(query) && matchingAccounts.length === 0) {
      return;
    }

    const tr = document.createElement('tr');
    tr.className = 'group-parent-row';
    tr.onclick = () => {
      settingsState.expandedGroups[grp.name] = !settingsState.expandedGroups[grp.name];
      renderSettingsHierarchy();
    };

    tr.innerHTML = `
      <td width="30"><span class="drag-handle">⠿</span></td>
      <td>
        <span class="group-toggle-icon">${isExpanded ? '▼' : '▶'}</span>
        <strong>${grp.icon || '🏷️'} ${grp.name}</strong>
      </td>
      <td class="text-muted" style="font-size:12px;">${grp.description || '—'}</td>
      <td class="text-center"><strong>${accountsInGroup.length}</strong></td>
      <td class="text-right"><strong>${window.formatINR(balance)}</strong></td>
      <td><span class="badge-active">● Active</span></td>
      <td class="text-right" width="90" onclick="event.stopPropagation()">
        <div class="action-buttons-inline">
          <button class="action-icon-btn" onclick="openEditGroupModal('${grp.id}')" title="Edit Group">✏️</button>
          <button class="action-icon-btn danger" onclick="promptDeleteGroup('${grp.id}')" title="Delete Group">🗑️</button>
        </div>
      </td>
    `;

    const targetBody = grp.type === 'Asset' ? assetBody : liabilityBody;
    targetBody.appendChild(tr);

    if (isExpanded) {
      const displayAccounts = query ? matchingAccounts : accountsInGroup;
      if (displayAccounts.length === 0) {
        const emptyTr = document.createElement('tr');
        emptyTr.className = 'account-child-row';
        emptyTr.innerHTML = `
          <td colspan="7" class="text-muted" style="padding-left:36px; font-style:italic;">
            No accounts in this group. Click "+ Add Account" to create one.
          </td>
        `;
        targetBody.appendChild(emptyTr);
      } else {
       displayAccounts.forEach(acc => {
          const accBal = settingsState.accountBalances[acc.id] || 0;
          const txnCount = settingsState.accountTxnCounts[acc.id] || 0;
          const childTr = document.createElement('tr');
          childTr.className = 'account-child-row';
          childTr.innerHTML = `
            <td></td>
            <td>
              <div class="account-child-indent">
                <span>↳</span>
                <strong>${acc.name}</strong>
                <span class="text-muted">(${acc.account_number_masked || '****'})</span>
              </div>
            </td>
            <td class="text-muted">${acc.institution || 'Direct'} • ${acc.account_type || 'Bank'}</td>
            <td class="text-center">—</td>
            <td class="text-right"><strong>${window.formatINR(accBal)}</strong></td>
            <td><span class="badge-active" style="font-size:10px;">● ${acc.classification}</span></td>
            <td class="text-right" width="110">
              <div class="action-buttons-inline">
                <button class="action-icon-btn" onclick="event.stopPropagation(); openMoveAccountModal('${acc.id}', '${escapeHtml(acc.name)}', '${escapeHtml(grp.name)}')" title="Move to another group">⇄</button>
                <button class="action-icon-btn" onclick="event.stopPropagation(); openEditAccountModal('${acc.id}')" title="Edit account">✏️</button>
                <button class="action-icon-btn danger" onclick="event.stopPropagation(); promptDeleteAccount('${acc.id}', ${txnCount})" title="Delete account">🗑️</button>
              </div>
            </td>
          `;
          targetBody.appendChild(childTr);
        });
      }
    }
  });
}

function escapeHtml(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

window.openCreateGroupModal = function() {
  document.getElementById('groupModalTitle').textContent = 'Create Account Group';
  document.getElementById('editGroupId').value = '';
  document.getElementById('groupNameInput').value = '';
  document.getElementById('groupDescInput').value = '';
  document.getElementById('groupOrderInput').value = (settingsState.groups.length + 1);
  setModalGroupType('Asset');
  document.getElementById('groupModal').classList.add('open');
};

window.openEditGroupModal = function(id) {
  const grp = settingsState.groups.find(g => g.id === id);
  if (!grp) return;
  document.getElementById('groupModalTitle').textContent = 'Edit Account Group';
  document.getElementById('editGroupId').value = grp.id;
  document.getElementById('groupNameInput').value = grp.name;
  document.getElementById('groupDescInput').value = grp.description || '';
  document.getElementById('groupOrderInput').value = grp.display_order || 1;
  setModalGroupType(grp.type);
  document.getElementById('groupModal').classList.add('open');
};

function setModalGroupType(type) {
  settingsState.selectedGroupType = type;
  document.querySelectorAll('#groupModal .type-pill-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.type === type) btn.classList.add('active');
  });
}

window.saveGroup = async function() {
  const id = document.getElementById('editGroupId').value.trim();
  const name = document.getElementById('groupNameInput').value.trim();
  const desc = document.getElementById('groupDescInput').value.trim();
  const order = parseInt(document.getElementById('groupOrderInput').value, 10) || 1;
  const type = settingsState.selectedGroupType || 'Asset';
  const icon = settingsState.selectedGroupIcon || '🏛️';

  if (!name) { alert('Please enter a group name.'); return; }

  try {
    if (id) {
      const { error } = await window.db.from('account_groups').update({
        name, description: desc, type, icon, display_order: order
      }).eq('id', id);
      if (error) throw error;
    } else {
      const nextNum = settingsState.groups.length + 1;
      const genId = 'AGRP' + String(nextNum).padStart(4, '0');
      const { error } = await window.db.from('account_groups').insert([{
        id: genId, name, description: desc, type, icon, display_order: order, is_active: true
      }]);
      if (error) throw error;
    }
    settingsState.expandedGroups[name] = true;
    window.closeAllModals();
    await window.loadSettingsMasterData();
  } catch (err) {
    alert('Failed to save group: ' + err.message);
  }
};

window.promptDeleteGroup = function(id) {
  const grp = settingsState.groups.find(g => g.id === id);
  if (!grp) return;
  const accounts = settingsState.groupAccountMap[grp.name] || [];

  window.currentDeleteTarget = { type: 'group', id: grp.id, name: grp.name, count: accounts.length };

  const deleteModal = document.getElementById('deleteModal');
  const msg = document.getElementById('deleteModalMessage');
  const warningBox = document.getElementById('deleteWarningBox');
  const warningText = document.getElementById('deleteWarningText');
  const confirmBtn = document.getElementById('confirmDeleteBtn');

  if (accounts.length > 0) {
    msg.textContent = `Are you sure you want to delete "${grp.name}"?`;
    warningText.textContent = `This group currently contains ${accounts.length} account(s). You must move or delete these accounts before deleting the group.`;
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

window.openCreateAccountModal = function() {
  document.getElementById('accountModalTitle').textContent = 'Create Account';
  document.getElementById('editAccountId').value = '';
  document.getElementById('accNameInput').value = '';
  document.getElementById('accInstitutionInput').value = '';
  document.getElementById('accOpeningBalanceInput').value = '0.00';
  document.getElementById('accMaskedNumberInput').value = '';
  document.getElementById('accNotesInput').value = '';

  const select = document.getElementById('accGroupSelect');
  select.innerHTML = settingsState.groups.map(g => `<option value="${g.name}">${g.icon || ''} ${g.name} (${g.type})</option>`).join('');
  document.getElementById('accountModal').classList.add('open');
};

window.openEditAccountModal = function(id) {
  const acc = settingsState.accounts.find(a => a.id === id);
  if (!acc) return;
  document.getElementById('accountModalTitle').textContent = 'Edit Account';
  document.getElementById('editAccountId').value = acc.id;
  document.getElementById('accNameInput').value = acc.name;
  document.getElementById('accInstitutionInput').value = acc.institution || '';
  document.getElementById('accOpeningBalanceInput').value = acc.opening_balance || 0;
  document.getElementById('accMaskedNumberInput').value = acc.account_number_masked || '';

  const select = document.getElementById('accGroupSelect');
  select.innerHTML = settingsState.groups.map(g => `<option value="${g.name}" ${g.name === acc.account_group ? 'selected' : ''}>${g.icon || ''} ${g.name} (${g.type})</option>`).join('');
  document.getElementById('accountModal').classList.add('open');
};

window.saveAccount = async function() {
  const id = document.getElementById('editAccountId').value;
  const name = document.getElementById('accNameInput').value.trim();
  const group = document.getElementById('accGroupSelect').value;
  const type = document.getElementById('accTypeSelect').value;
  const inst = document.getElementById('accInstitutionInput').value.trim();
  const opening = parseFloat(document.getElementById('accOpeningBalanceInput').value) || 0;
  const masked = document.getElementById('accMaskedNumberInput').value.trim();

  if (!name) { alert('Please enter an account name.'); return; }
  const grpObj = settingsState.groups.find(g => g.name === group);
  const classification = grpObj ? grpObj.type : 'Asset';

  try {
    if (id) {
      const { error } = await window.db.from('accounts').update({
        name, account_group: group, classification, account_type: type, institution: inst, opening_balance: opening, account_number_masked: masked
      }).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await window.db.from('accounts').insert([{
        name, account_group: group, classification, account_type: type, institution: inst, opening_balance: opening, account_number_masked: masked
      }]);
      if (error) throw error;
    }
    settingsState.expandedGroups[group] = true;
    window.closeAllModals();
    await window.loadSettingsMasterData();
  } catch (err) {
    alert('Error saving account: ' + err.message);
  }
};

window.openMoveAccountModal = function(accountId, accountName, currentGroupName) {
  document.getElementById('moveTargetAccountId').value = accountId;
  document.getElementById('moveAccountName').textContent = accountName;

  const select = document.getElementById('moveTargetGroupSelect');
  select.innerHTML = settingsState.groups.map(g => `
    <option value="${g.name}" ${g.name === currentGroupName ? 'selected' : ''}>
      ${g.icon || ''} ${g.name} (${g.type})
    </option>
  `).join('');

  document.getElementById('moveAccountModal').classList.add('open');
};

window.executeMoveAccount = async function() {
  const accountId = document.getElementById('moveTargetAccountId').value;
  const targetGroupName = document.getElementById('moveTargetGroupSelect').value;
  const targetGroup = settingsState.groups.find(g => g.name === targetGroupName);
  const newClassification = targetGroup ? targetGroup.type : 'Asset';

  try {
    const { error } = await window.db.from('accounts').update({
      account_group: targetGroupName,
      classification: newClassification,
      group_id: targetGroup ? targetGroup.id : null
    }).eq('id', accountId);

    if (error) throw error;

    settingsState.expandedGroups[targetGroupName] = true;
    window.closeAllModals();
    await window.loadSettingsMasterData();
  } catch (err) {
    alert('Error moving account: ' + err.message);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('settingsSearchInput');
  if (searchInput) searchInput.addEventListener('input', renderSettingsHierarchy);

  document.querySelectorAll('#groupModal .type-pill-btn').forEach(btn => {
    btn.onclick = () => setModalGroupType(btn.dataset.type);
  });

  document.querySelectorAll('#groupIconPalette .icon-choice').forEach(icon => {
    icon.onclick = () => {
      document.querySelectorAll('#groupIconPalette .icon-choice').forEach(i => i.classList.remove('selected'));
      icon.classList.add('selected');
      settingsState.selectedGroupIcon = icon.dataset.icon;
    };
  });

  window.loadSettingsMasterData();
});

window.promptDeleteAccount = function(id, txnCount) {
  const acc = settingsState.accounts.find(a => a.id === id);
  if (!acc) return;

  window.currentDeleteTarget = { type: 'account', id: acc.id, name: acc.name, count: txnCount };

  const deleteModal = document.getElementById('deleteModal');
  const msg = document.getElementById('deleteModalMessage');
  const warningBox = document.getElementById('deleteWarningBox');
  const warningText = document.getElementById('deleteWarningText');
  const confirmBtn = document.getElementById('confirmDeleteBtn');

  if (txnCount > 0) {
    msg.textContent = `This account cannot be deleted.`;
    warningText.textContent = `"${acc.name}" has ${txnCount} associated transaction(s). To preserve your financial history, accounts with transactions cannot be deleted.`;
    warningBox.style.display = 'flex';
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.5';
    confirmBtn.textContent = 'Cannot Delete';
  } else {
    msg.textContent = `Are you sure you want to delete "${acc.name}"? This account has 0 transactions and can be safely deleted.`;
    warningBox.style.display = 'none';
    confirmBtn.disabled = false;
    confirmBtn.style.opacity = '1';
    confirmBtn.textContent = 'Delete Account';
  }

  deleteModal.classList.add('open');
};