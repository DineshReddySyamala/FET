// Settings Router
window.switchSettingsSection = function(section) {
  const accSection = document.getElementById('settingsAccountsSection');
  const catSection = document.getElementById('settingsCategoriesSection');
  const accLink = document.getElementById('menuAccountsGroups');
  const catLink = document.getElementById('menuCategories');

  if (section === 'categories') {
    if (accSection) accSection.style.display = 'none';
    if (catSection) catSection.style.display = 'block';
    accLink?.classList.remove('active');
    catLink?.classList.add('active');
    if (window.loadCategoriesMasterData) window.loadCategoriesMasterData();
  } else {
    if (accSection) accSection.style.display = 'block';
    if (catSection) catSection.style.display = 'none';
    accLink?.classList.add('active');
    catLink?.classList.remove('active');
    if (window.loadSettingsMasterData) window.loadSettingsMasterData();
  }
};

window.executeDelete = async function() {
  const target = window.currentDeleteTarget;
  if (!target || target.count > 0) return;

  try {
    if (target.type === 'group') {
      const { error } = await window.db.from('account_groups').delete().eq('id', target.id);
      if (error) throw error;
      window.closeAllModals();
      await window.loadSettingsMasterData();
    } else if (target.type === 'account') {
      const { error } = await window.db.from('accounts').delete().eq('id', target.id);
      if (error) throw error;
      window.closeAllModals();
      await window.loadSettingsMasterData();
    } else if (target.type === 'catGroup') {
      const { error } = await window.db.from('category_groups').delete().eq('id', target.id);
      if (error) throw error;
      window.closeAllModals();
      await window.loadCategoriesMasterData();
    } else if (target.type === 'category') {
      const { error } = await window.db.from('categories').delete().eq('id', target.id);
      if (error) throw error;
      window.closeAllModals();
      await window.loadCategoriesMasterData();
    }
  } catch (err) {
    console.error('Delete error:', err);
    alert('Failed to delete: ' + err.message);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const confirmBtn = document.getElementById('confirmDeleteBtn');
  if (confirmBtn) confirmBtn.onclick = window.executeDelete;
});