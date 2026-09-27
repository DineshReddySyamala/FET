// ==========================================================================
// COMMON HELPERS & THEME ENGINE
// ==========================================================================

// Currency Formatter (Indian Rupee)
window.formatINR = function(val, includeSign = false) {
  const num = Number(val) || 0;
  const absFormatted = '₹' + Math.abs(num).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  if (!includeSign) return absFormatted;
  return num < 0 ? `- ${absFormatted}` : `+ ${absFormatted}`;
};

// Date Formatter for Section Headers
window.formatDateHeader = function(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};

// Theme Management System
window.initThemeSystem = function() {
  const themeBtn = document.getElementById('themeToggleBtn');
  if (!themeBtn) return;

  const savedTheme = localStorage.getItem('finny-theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  themeBtn.textContent = savedTheme === 'light' ? '🌙' : '☀️';

  themeBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('finny-theme', nextTheme);
    themeBtn.textContent = nextTheme === 'light' ? '🌙' : '☀️';
  });
};

document.addEventListener('DOMContentLoaded', () => {
  window.initThemeSystem();
});