// Global stackable toast notification system.
// Types: success (positive), danger (negative), info (neutral).

let container;

function ensureContainer() {
  if (!container) {
    container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
  }
  return container;
}

export function toast(message, { type = 'info', icon = '', duration = 3200 } = {}) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg"></span>`;
  el.querySelector('.toast-msg').textContent = message;
  ensureContainer().appendChild(el);
  // Trigger enter animation.
  requestAnimationFrame(() => el.classList.add('toast-show'));
  const remove = () => {
    el.classList.remove('toast-show');
    el.classList.add('toast-hide');
    setTimeout(() => el.remove(), 400);
  };
  const timer = setTimeout(remove, duration);
  el.addEventListener('click', () => { clearTimeout(timer); remove(); });
  return el;
}

export const toastSuccess = (m, icon = '⚓') => toast(m, { type: 'success', icon });
export const toastDanger = (m, icon = '⚠️') => toast(m, { type: 'danger', icon });
export const toastInfo = (m, icon = '📜') => toast(m, { type: 'info', icon });
