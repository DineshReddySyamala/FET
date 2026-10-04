// ==========================================================================
// COMMON HELPERS, THEME ENGINE & NAV HIGHLIGHTER
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

// Global Nav Active Highlighter based on current filename
window.initNavigation = function() {
  const path = window.location.pathname;
  let page = path.split("/").pop() || 'index.html';
  if (!page || page === '') page = 'index.html';

  document.querySelectorAll('.nav-links .nav-item').forEach(link => {
    const href = link.getAttribute('href') || '';
    const hrefPage = href.split("/").pop();
    if (hrefPage === page || (page === 'index.html' && hrefPage === 'dashboard.html')) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
};

// Theme Management System
window.initThemeSystem = function() {
  const themeBtn = document.getElementById('themeToggleBtn');
  const savedTheme = localStorage.getItem('finny-theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  if (themeBtn) themeBtn.textContent = savedTheme === 'light' ? '🌙' : '☀️';

  if (themeBtn) {
    themeBtn.onclick = () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', nextTheme);
      localStorage.setItem('finny-theme', nextTheme);
      themeBtn.textContent = nextTheme === 'light' ? '🌙' : '☀️';
    };
  }
};

// Universal Modal Closer
window.closeAllModals = function() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.classList.remove('open');
  });
};

document.addEventListener('click', (e) => {
  if (e.target.matches('.modal-close-btn') || e.target.closest('.modal-close-btn')) {
    window.closeAllModals();
  } else if (e.target.matches('.modal-footer .btn-secondary')) {
    window.closeAllModals();
  } else if (e.target.classList.contains('modal-overlay')) {
    window.closeAllModals();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.closeAllModals();
});

// Auto-run theme and nav initializers safely
function runFinnyInits() {
  if (window.initThemeSystem) window.initThemeSystem();
  if (window.initNavigation) window.initNavigation();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runFinnyInits);
} else {
  runFinnyInits();
}

// ==========================================================================
// FINNY STANDARDIZED HASH GENERATOR (SHARED UTILITY)
// ==========================================================================
window.generateFinnyHashId = function(dateStr, timeStr, amount) {
  const cleanDate = (dateStr || '').replace(/-/g, '').slice(0, 8);
  let cleanTime = '000000';
  if (timeStr && timeStr.includes(':')) {
    cleanTime = timeStr.replace(/[^0-9]/g, '').padEnd(6, '0').slice(0, 6);
  }
  const amountInPaise = Math.round(Math.abs(Number(amount || 0)) * 100);
  return `H${cleanDate}${cleanTime}${amountInPaise}`;
};

// Universal Category Color & Icon Palette
window.getCategoryDesign = function(categoryName = '') {
  const cat = (categoryName || '').toLowerCase();
  if (cat.includes('food') || cat.includes('dining') || cat.includes('snack') || cat.includes('biryani') || cat.includes('lunch')) {
    return { icon: '🍽️', bg: '#fef2f2', color: '#dc2626' };
  }
  if (cat.includes('transport') || cat.includes('uber') || cat.includes('fuel') || cat.includes('petrol')) {
    return { icon: '🚗', bg: '#eff6ff', color: '#2563eb' };
  }
  if (cat.includes('shop') || cat.includes('blinkit') || cat.includes('amazon') || cat.includes('grocer')) {
    return { icon: '🛍️', bg: '#fff7ed', color: '#ea580c' };
  }
  if (cat.includes('salary') || cat.includes('income')) {
    return { icon: '💼', bg: '#f0fdf4', color: '#16a34a' };
  }
  if (cat.includes('rent') || cat.includes('emi') || cat.includes('house') || cat.includes('bill')) {
    return { icon: '⚡', bg: '#fefce8', color: '#ca8a04' };
  }
  return { icon: '🏷️', bg: '#f1f5f9', color: '#475569' };
};

// Details Card Tabs Listener
document.addEventListener('click', (e) => {
  const tab = e.target.closest('.details-tabs .det-tab');
  if (tab) {
    const parent = tab.parentElement;
    parent.querySelectorAll('.det-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
  }
});