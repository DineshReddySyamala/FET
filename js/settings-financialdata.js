// ==========================================================================
// FINNY SETTINGS — FINANCIAL DATA & IMPORT ACCOUNT MAPPING
// ==========================================================================

const finDataState = {
  accounts: [],
  mappings: []
};

// 1. Initialize Financial Data Settings
window.initFinancialDataSettings = async function() {
  await Promise.all([
    loadFinAccounts(),
    loadImportAccountMappings()
  ]);

  setupSectionSwitcherOverride();
};

// 2. Load Accounts for Mapping Dropdowns
async function loadFinAccounts() {
  try {
    const { data, error } = await window.db
      .from('accounts')
      .select('id, name, account_number_masked, account_type')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error loading accounts:', error);
      return;
    }
    finDataState.accounts = data || [];

    const modalSelect = document.getElementById('newTargetAccountSelect');
    if (modalSelect) {
      modalSelect.innerHTML = '<option value="">-- Select Target Finny Account --</option>' + 
        finDataState.accounts.map(a => `<option value="${a.id}">${a.name} (${a.account_number_masked || '****'})</option>`).join('');
    }
  } catch (err) {
    console.error('Accounts load exception:', err);
  }
}

// 3. Load Statement Account Mappings
async function loadImportAccountMappings() {
  const tbody = document.getElementById('accountMappingTableBody');
  try {
    const { data, error } = await window.db
      .from('import_account_mappings')
      .select('*')
      .order('raw_account_name', { ascending: true });

    if (error) {
      console.error('Error loading import_account_mappings:', error);
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center" style="padding: 24px; color: var(--finny-expense);">
              Database notice: ${error.message}. Check your Supabase console.
            </td>
          </tr>
        `;
      }
      return;
    }

    finDataState.mappings = data || [];
    renderAccountMappingsTable();
  } catch (err) {
    console.error('Mapping load exception:', err);
  }
}

// 4. Render Mappings Table
function renderAccountMappingsTable() {
  const tbody = document.getElementById('accountMappingTableBody');
  if (!tbody) return;

  if (finDataState.mappings.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-muted" style="padding: 24px;">
          No statement accounts found. Click <strong>+ Add New Mapping</strong> above to link one.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = finDataState.mappings.map(m => {
    const isMapped = Boolean(m.account_id);

    return `
      <tr style="border-bottom: 1px solid var(--border-subtle);">
        <td style="padding: 12px 16px;">
          <span class="raw-acc-badge" style="font-family: monospace; font-size: 12px; background: var(--bg-surface-secondary); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border);">📄 ${m.raw_account_name}</span>
        </td>
        <td style="padding: 12px 16px;">
          <select class="form-select" style="min-width: 240px; padding: 6px 10px; font-size: 13px;" onchange="updateAccountMapping('${m.id}', this.value)">
            <option value="">-- Unassigned (Not Mapped) --</option>
            ${finDataState.accounts.map(a => `
              <option value="${a.id}" ${m.account_id === a.id ? 'selected' : ''}>
                ${a.name} (${a.account_number_masked || '****'})
              </option>
            `).join('')}
          </select>
        </td>
        <td style="padding: 12px 16px;">
          <span style="font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: ${isMapped ? 'var(--finny-income-tint)' : 'var(--finny-expense-tint)'}; color: ${isMapped ? 'var(--finny-income)' : 'var(--finny-expense)'};">
            ● ${isMapped ? 'Active Mapping' : 'Action Required'}
          </span>
        </td>
        <td class="text-right" style="padding: 12px 16px; text-align: right;">
          <button class="stage-icon-btn delete-btn" style="background: none; border: 1px solid var(--border); border-radius: 4px; width: 28px; height: 28px; cursor: pointer; color: var(--finny-expense);" onclick="deleteAccountMapping('${m.id}')" title="Delete mapping rule">🗑</button>
        </td>
      </tr>
    `;
  }).join('');
}

// 5. Update Mapping in Supabase
window.updateAccountMapping = async function(mappingId, newAccountId) {
  try {
    const { error } = await window.db
      .from('import_account_mappings')
      .update({
        account_id: newAccountId || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', mappingId);

    if (error) throw error;
    await loadImportAccountMappings();
  } catch (err) {
    alert('Failed to update mapping: ' + err.message);
  }
};

// 6. Modal Controls
window.openAddMappingModal = function() {
  const nameInput = document.getElementById('newRawAccountInput');
  const accSelect = document.getElementById('newTargetAccountSelect');
  if (nameInput) nameInput.value = '';
  if (accSelect) accSelect.value = '';

  const modal = document.getElementById('addMappingModal');
  if (modal) modal.classList.add('open');
};

window.saveNewAccountMapping = async function() {
  const rawName = document.getElementById('newRawAccountInput')?.value.trim();
  const targetId = document.getElementById('newTargetAccountSelect')?.value;

  if (!rawName) {
    alert('Please enter the statement account name.');
    return;
  }

  try {
    const { error } = await window.db
      .from('import_account_mappings')
      .insert([{
        raw_account_name: rawName,
        account_id: targetId || null
      }]);

    if (error) throw error;

    if (typeof window.closeAllModals === 'function') {
      window.closeAllModals();
    } else {
      document.getElementById('addMappingModal')?.classList.remove('open');
    }

    await loadImportAccountMappings();
  } catch (err) {
    alert('Failed to save mapping: ' + err.message);
  }
};

window.deleteAccountMapping = async function(mappingId) {
  if (!confirm('Remove this account mapping rule?')) return;
  try {
    const { error } = await window.db
      .from('import_account_mappings')
      .delete()
      .eq('id', mappingId);

    if (error) throw error;
    await loadImportAccountMappings();
  } catch (err) {
    alert('Failed to delete mapping: ' + err.message);
  }
};

// 7. Full Workspace Switcher Override
function setupSectionSwitcherOverride() {
  const prevSwitch = window.switchSettingsSection;

  window.switchSettingsSection = function(section) {
    // A. Update active link in sidebar
    document.querySelectorAll('.settings-nav-link').forEach(link => link.classList.remove('active'));
    const linkMap = {
      'accounts': 'menuAccountsGroups',
      'categories': 'menuCategories',
      'account-mapping': 'menuAccountMapping',
      'payees': 'menuPayees',
      'labels': 'menuLabels',
      'recurring': 'menuRecurring',
      'import-export': 'menuImportExport'
    };
    const activeLink = document.getElementById(linkMap[section]);
    if (activeLink) activeLink.classList.add('active');

    // B. Get all workspace section containers
    const mappingSection = document.getElementById('settingsAccountMappingSection');
    const accountsSection = document.getElementById('settingsAccountsSection');
    const categoriesSection = document.getElementById('settingsCategoriesSection');

    if (section === 'account-mapping') {
      if (accountsSection) accountsSection.style.display = 'none';
      if (categoriesSection) categoriesSection.style.display = 'none';
      if (mappingSection) mappingSection.style.display = 'block';
    } else {
      if (mappingSection) mappingSection.style.display = 'none';
      if (typeof prevSwitch === 'function') {
        prevSwitch(section);
      }
    }
  };
}

// 8. Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
  window.initFinancialDataSettings();
});