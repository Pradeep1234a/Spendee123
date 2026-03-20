/**
 * ui.js — DOM rendering and UI utilities
 *
 * All DOM manipulation lives here.
 * Never contains business logic — only rendering concerns.
 *
 * Design principles:
 * - Cache DOM references (query once, reuse)
 * - Use textContent not innerHTML for user data (XSS prevention)
 * - Safe innerHTML only for trusted template strings
 */

import State from './state.js';

// ─── Categories definition ─────────────────────────────────────────
export const CATS = {
  food:          { l: 'Food & Dining',     e: '🍽',  bg: '#fef3e2', c: '#d97706', t: 'expense' },
  transport:     { l: 'Transport',         e: '🚌',  bg: '#e0f2fe', c: '#0284c7', t: 'expense' },
  shopping:      { l: 'Shopping',          e: '🛍',  bg: '#fce7f3', c: '#db2777', t: 'expense' },
  bills:         { l: 'Bills',             e: '💡',  bg: '#f3f4f6', c: '#6b7280', t: 'expense' },
  health:        { l: 'Health',            e: '❤',  bg: '#fee2e2', c: '#ef4444', t: 'expense' },
  education:     { l: 'Education',         e: '📚',  bg: '#e0e7ff', c: '#4f46e5', t: 'expense' },
  entertainment: { l: 'Entertainment',     e: '🎬',  bg: '#faf5ff', c: '#9333ea', t: 'expense' },
  travel:        { l: 'Travel',            e: '✈',  bg: '#ecfdf5', c: '#059669', t: 'expense' },
  rent:          { l: 'Rent',              e: '🏠',  bg: '#fff7ed', c: '#ea580c', t: 'expense' },
  subscriptions: { l: 'Subscriptions',     e: '📱',  bg: '#f0f9ff', c: '#0369a1', t: 'expense' },
  groceries:     { l: 'Groceries',         e: '🛒',  bg: '#f0fdf4', c: '#16a34a', t: 'expense' },
  salary:        { l: 'Salary',            e: '💼',  bg: '#ecfdf5', c: '#16a34a', t: 'income' },
  freelance:     { l: 'Freelance',         e: '💻',  bg: '#eff6ff', c: '#2563eb', t: 'income' },
  investment:    { l: 'Investment',        e: '📈',  bg: '#f0fdf4', c: '#15803d', t: 'income' },
  gift:          { l: 'Gift',              e: '🎁',  bg: '#fdf4ff', c: '#a21caf', t: 'income' },
  bonus:         { l: 'Bonus',             e: '🎯',  bg: '#fef3e2', c: '#d97706', t: 'income' },
  other:         { l: 'Other',             e: '📦',  bg: '#f9fafb', c: '#6b7280', t: 'both' },
};

export function getCat(key) { return CATS[key] || CATS.other; }

export function catOpts(type = 'all') {
  return Object.entries(CATS)
    .filter(([, v]) => type === 'all' || v.t === type || v.t === 'both')
    .map(([k, v]) => `<option value="${k}">${v.e} ${v.l}</option>`)
    .join('');
}

// ─── XSS-safe escape ──────────────────────────────────────────────
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Element helpers ──────────────────────────────────────────────
/** Cached DOM lookup. */
export function el(id) { return document.getElementById(id); }

/** Safe text setter — never sets innerHTML for user content. */
export function setText(id, text) {
  const node = el(id);
  if (node) node.textContent = String(text);
}

export function today() { return new Date().toISOString().slice(0, 10); }

// ─── Math helpers ─────────────────────────────────────────────────
export function pct(v, total) {
  return total > 0 ? Math.min(100, Math.round(v / total * 100)) : 0;
}
export function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
export function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

export function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return d; }
}

export function fmtMonth(m) {
  try {
    const [y, mo] = m.split('-');
    return new Date(+y, +mo - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  } catch { return m; }
}

export function progColor(p) { return p >= 100 ? 'r' : p >= 80 ? 'y' : 'g'; }

/** Sanitize number inputs: allow only numeric + one decimal point */
export function numSanitize(inp) {
  if (!inp || typeof inp.addEventListener !== 'function') return;
  inp.addEventListener('input', e => {
    let v = e.target.value.replace(/[^0-9.]/g, '');
    const parts = v.split('.');
    if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
    if (e.target.value !== v) e.target.value = v;
  });
}

// ─── Toast notifications ──────────────────────────────────────────
export const Toast = (() => {
  let _wrap = null;

  function _getWrap() {
    if (!_wrap) _wrap = document.getElementById('toast-wrap');
    return _wrap;
  }

  function show(message, type = 'ok') {
    const wrap = _getWrap();
    if (!wrap) return;
    const icons = { ok: '✓', err: '✕', warn: '⚠' };
    const classes = { ok: 't-ok', err: 't-err', warn: 't-warn' };
    const div = document.createElement('div');
    div.className = 'toast';
    const iconSpan = document.createElement('span');
    iconSpan.className = classes[type] || classes.ok;
    iconSpan.style.fontWeight = '700';
    iconSpan.textContent = icons[type] || icons.ok;
    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;  // textContent — XSS safe
    div.appendChild(iconSpan);
    div.appendChild(msgSpan);
    wrap.appendChild(div);
    setTimeout(() => {
      div.classList.add('out');
      setTimeout(() => div.remove(), 220);
    }, 2800);
  }

  return {
    ok:      (m) => show(m, 'ok'),
    err:     (m) => show(m, 'err'),
    warn:    (m) => show(m, 'warn'),
    // Aliases for ergonomics
    success: (m) => show(m, 'ok'),
    error:   (m) => show(m, 'err'),
    warning: (m) => show(m, 'warn'),
  };
})();

// ─── Sidebar stats ────────────────────────────────────────────────
export function updateSbStats() {
  const bal = State.totalBalance();
  const net = State.mNet();
  const c   = State.currency();
  const fmt = v => (v < 0 ? '-' : '') + c + Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  setText('sb-bal', fmt(bal));
  setText('sb-mth', fmt(net));
}

export function updateBadges() {
  const cs   = State.catSpend();
  const bs   = State.budgets;
  const over = Object.entries(bs).filter(([cat, b]) => {
    const limit = +(typeof b === 'object' ? b.limit : b) || 0;
    return limit > 0 && (cs[cat] || 0) >= limit * 0.9;
  }).length;
  const bb = el('sb-bud-badge');
  if (bb) { bb.textContent = over; bb.classList.toggle('hidden', over === 0); }
}

// ─── Dark mode ────────────────────────────────────────────────────
export const DarkMode = (() => {
  const KEY = 'sp2_theme';

  function isDark() {
    const saved = localStorage.getItem(KEY);
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function apply(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const lbl = el('dark-lbl');
    if (lbl) lbl.textContent = dark ? 'Light Mode' : 'Dark Mode';
  }

  function toggle() {
    const next = !isDark();
    localStorage.setItem(KEY, next ? 'dark' : 'light');
    apply(next);
  }

  function init() {
    apply(isDark());
    el('btn-dark')?.addEventListener('click', toggle);
  }

  return { init, isDark, apply };
})();

// ─── Empty states ─────────────────────────────────────────────────
export function emptyState({ icon, title, text, action = '' }) {
  return `<div style="text-align:center;padding:44px 20px">
    <div style="font-size:2.25rem;margin-bottom:10px">${icon}</div>
    <div style="font-weight:700;font-size:.9375rem;color:var(--text);margin-bottom:5px">${esc(title)}</div>
    <p style="font-size:.8125rem;color:var(--text-3);max-width:260px;margin:0 auto 16px">${esc(text)}</p>
    ${action}
  </div>`;
}

// ─── Transaction row renderer ─────────────────────────────────────
export function txnRow(t) {
  const c       = getCat(t.category);
  const sign    = t.type === 'income' ? '+' : '';
  const amtCls  = t.type === 'income' ? 'c-green' : '';

  const div = document.createElement('div');
  div.className = 'txn-item';
  div.dataset.tid = t.id;
  div.innerHTML = `
    <div class="cat-ico" style="background:${c.bg}">${c.e}</div>
    <div style="flex:1;min-width:0">
      <div class="txn-note"></div>
      <div class="txn-meta"></div>
    </div>
    <div class="txn-amt ${amtCls}"></div>
    <button class="txn-del" data-del="${esc(t.id)}" title="Delete" aria-label="Delete transaction">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
      </svg>
    </button>`;

  // Use textContent for user data — never innerHTML
  div.querySelector('.txn-note').textContent = t.note || c.l;
  div.querySelector('.txn-meta').textContent =
    `${fmtDate(t.date)} · ${c.l}${t.tags?.length ? ' · ' + t.tags.join(', ') : ''}`;
  div.querySelector('.txn-amt').textContent = `${sign}${State.fmt(t.amount)}`;

  return div;
}

// ─── Chart.js lazy loader ─────────────────────────────────────────
let _chartLoaded  = false;
const _chartCbs   = [];

export function loadCharts(cb) {
  if (typeof Chart !== 'undefined') { try { cb(); } catch (e) {} return; }
  if (cb) _chartCbs.push(cb);
  if (_chartLoaded) return;
  _chartLoaded = true;
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
  s.onload  = () => { _chartCbs.forEach(fn => { try { fn(); } catch (e) {} }); _chartCbs.length = 0; };
  s.onerror = () => console.warn('[UI] Chart.js CDN load failed');
  document.head.appendChild(s);
}

// ─── Spinner overlay ──────────────────────────────────────────────
export function showSpinner(show) {
  // If you add a spinner element to HTML, toggle it here
  State.setLoading(show);
}
