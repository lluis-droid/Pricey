/* ============================================================
   Pricey — Shared Client Utilities
   ============================================================ */

/* --- CSRF: read token from cookie and attach to all mutating fetches --- */
function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? m[1] : null;
}
(function patchFetchForCSRF() {
  const _origFetch = window.fetch;
  window.fetch = function (url, opts = {}) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(opts.method || 'GET')) {
      const token = getCookie('XSRF-TOKEN');
      if (token) {
        opts.headers = opts.headers || {};
        if (opts.headers instanceof Headers) {
          if (!opts.headers.has('X-CSRF-Token')) opts.headers.set('X-CSRF-Token', token);
        } else if (Array.isArray(opts.headers)) {
          if (!opts.headers.some(([k]) => k.toLowerCase() === 'x-csrf-token')) opts.headers.push(['X-CSRF-Token', token]);
        } else {
          if (!opts.headers['X-CSRF-Token']) opts.headers['X-CSRF-Token'] = token;
        }
      }
    }
    return _origFetch.call(this, url, opts);
  };
})();

const Pricey = (() => {

  /* --- Toast notification --- */
  function toast(msg, type = 'ok') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = `toast ${type} show`;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  /* --- Discord avatar URL helper --- */
  function avatarUrl(userId, avatarHash) {
    if (avatarHash) return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png`;
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
  }

  /* --- Auth state init: updates nav with user info if logged in --- */
  async function initAuth() {
    try {
      const me = await fetch('/api/me').then(r => r.json());
      if (!me.loggedIn) return null;

      const guestEl = document.getElementById('nav-guest');
      const userEl = document.getElementById('nav-user');
      if (guestEl) guestEl.style.display = 'none';
      if (userEl) userEl.style.display = 'flex';

      const avatar = document.getElementById('nav-avatar') || document.getElementById('avatar');
      const username = document.getElementById('nav-username') || document.getElementById('username');
      if (avatar) avatar.src = avatarUrl(me.user.id, me.user.avatar);
      if (username) username.textContent = me.user.username;

      return me.user;
    } catch {
      return null;
    }
  }

  /* --- Admin check --- */
  async function checkAdmin() {
    try {
      const d = await fetch('/api/admin/me').then(r => r.json());
      if (d.isOwner) {
        const link = document.getElementById('admin-link');
        if (link) link.style.display = 'inline-flex';
      }
      return d.isOwner;
    } catch {
      return false;
    }
  }

  /* --- Mobile menu toggle --- */
  function initMobileMenu() {
    const hamburger = document.querySelector('.nav-hamburger');
    const menu = document.querySelector('.nav-mobile-menu');
    const closeBtn = document.querySelector('.nav-mobile-close');
    if (!hamburger || !menu) return;

    hamburger.addEventListener('click', () => menu.classList.add('open'));
    if (closeBtn) closeBtn.addEventListener('click', () => menu.classList.remove('open'));
    menu.addEventListener('click', e => {
      if (e.target === menu) menu.classList.remove('open');
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') menu.classList.remove('open');
    });
  }

  /* --- Modal open/close helpers --- */
  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  }

  /* --- Close modal on backdrop click or Escape --- */
  function initModals() {
    document.querySelectorAll('.modal-bg').forEach(modal => {
      modal.addEventListener('click', e => {
        if (e.target === e.currentTarget) modal.classList.remove('open');
      });
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
      }
    });
  }

  /* --- Debounce helper --- */
  function debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  /* --- Fetch with retry --- */
  async function fetchRetry(fn, max = 8, delay = 1500, statusEl) {
    for (let i = 1; i <= max; i++) {
      try {
        const r = await fn();
        if (r) return r;
        if (statusEl) statusEl.textContent = `Waiting for bot data... (${i}/${max})`;
        await new Promise(res => setTimeout(res, delay));
      } catch {
        if (i === max) return null;
        await new Promise(res => setTimeout(res, delay));
      }
    }
    return null;
  }

  /* --- Format currency --- */
  function formatUSD(amount) {
    return `$${Number(amount).toFixed(2)}`;
  }

  return {
    toast, avatarUrl, initAuth, checkAdmin, initMobileMenu,
    openModal, closeModal, initModals, debounce, fetchRetry, formatUSD,
  };

})();
