/**
 * app.js — Entry point
 *
 * Bootstraps the application:
 * 1. Splash screen lifecycle
 * 2. Auth check / initialization
 * 3. Router setup
 * 4. Page rendering dispatch
 * 5. Sidebar drawer (mobile)
 */

import State   from './state.js';
import Storage from './storage.js';
import { DarkMode, Toast, updateSbStats, updateBadges, el, catOpts, numSanitize, esc, loadCharts, txnRow } from './ui.js';
import { initEvents, TxnModal, BudgetModal, GoalModal, ProgModal, ProfileModal, GroupModal, ExpenseModal, SettleModal } from './events.js';
import * as Txns      from './features/transactions.js';
import * as Budgets   from './features/budgets.js';
import * as Goals     from './features/goals.js';
import * as Analytics from './features/analytics.js';
import * as Split     from './features/split.js';
import { seedDemoData, DEMO_EMAIL } from './seed.js';

// ─── Router ───────────────────────────────────────────────────────
const PAGES  = ['dashboard','transactions','budgets','goals','analytics','split','profile'];
const TITLES = {
  dashboard:    'Dashboard',
  transactions: 'Transactions',
  budgets:      'Budgets',
  goals:        'Goals',
  analytics:    'Analytics',
  split:        'Split & Groups',
  profile:      'Profile',
};

export const Router = {
  navigate(page) {
    if (!PAGES.includes(page)) page = 'dashboard';

    // Hide all pages, show target
    document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
    el('pg-' + page)?.classList.add('on');

    // Sync nav items
    document.querySelectorAll('[data-pg]').forEach(n => n.classList.toggle('on', n.dataset.pg === page));

    // Update topbar title
    const tt = el('topbar-title');
    if (tt) tt.textContent = TITLES[page] || page;

    // Scroll to top
    el('content')?.scrollTo(0, 0);

    // Update state
    State.setPage(page);

    // Close mobile sidebar
    SidebarDrawer.close();

    // Render page
    try { _renderPage(page); } catch (e) { console.error('[Router] render error:', page, e); }
  },

  init() {
    document.querySelectorAll('[data-pg]').forEach(n => {
      n.addEventListener('click', () => this.navigate(n.dataset.pg));
      n.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.navigate(n.dataset.pg); }
      });
    });
  },
};

function _renderPage(page) {
  switch (page) {
    case 'dashboard':    _renderDashboard();                  break;
    case 'transactions': Txns.renderTransactionsPage();       break;
    case 'budgets':      Budgets.renderBudgetsPage();         break;
    case 'goals':        Goals.renderGoalsPage();             break;
    case 'analytics':    Analytics.renderAnalyticsPage();     break;
    case 'split':        Split.renderSplitPage();             break;
    case 'profile':      _renderProfile();                    break;
  }
}

// ─── Dashboard renderer ───────────────────────────────────────────
let _dashChart = null;

function _renderDashboard() {
  const c   = State.currency();
  const bal = State.totalBalance();
  const inc = State.mInc();
  const exp = State.mExp();
  const net = State.mNet();
  const r   = State.savingsRate();

  const fmt  = v => (v < 0 ? '-' : '') + c + Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const setN = (id, v) => { const e = el(id); if (e) e.textContent = v; };

  setN('d-bal',     fmt(bal));
  setN('d-inc',     fmt(inc));
  setN('d-exp',     fmt(exp));
  setN('d-rate',    r + '%');
  setN('d-net',     State.fmt(net));
  setN('d-txn-cnt', State.moTxns().length);

  // Health score
  const score = State.healthScore();
  const he = el('d-health');
  if (he) {
    he.textContent = score + '/100';
    he.className = 'stat-val ' + (score >= 70 ? 'c-brand' : score >= 40 ? 'c-yellow' : 'c-red');
  }

  // Recent transactions
  _renderRecentTxns();

  // Smart insights
  _renderInsights();

  // Streak
  _renderStreak();

  // Mini chart
  loadCharts(() => _renderDashChart());
}

function _renderRecentTxns() {
  const c = el('d-recent'); if (!c) return;
  const recent = State.txns.slice(0, 8);
  if (!recent.length) {
    c.innerHTML = '<div style="text-align:center;padding:32px 20px"><div style="font-size:2rem;margin-bottom:8px">💸</div><div style="font-weight:600;font-size:.875rem">No transactions yet</div><p style="font-size:.8125rem;color:var(--text-3);margin-top:4px">Add your first transaction to get started.</p></div>';
    return;
  }
  c.innerHTML = '';
  const frag = document.createDocumentFragment();
  recent.forEach(t => frag.appendChild(txnRow(t)));
  c.appendChild(frag);
}

function _renderInsights() {
  const c = el('d-insights'); if (!c) return;
  const items = State.insights();
  if (!items.length) { c.innerHTML = ''; return; }
  c.innerHTML = '';
  items.forEach(item => {
    const div = document.createElement('div');
    div.style.cssText = 'background:var(--brand-pale);border:1px solid rgba(var(--brand-rgb),.15);border-radius:var(--r-lg);padding:11px 14px;display:flex;gap:10px;align-items:flex-start;margin-bottom:8px';
    const icon = document.createElement('span');
    icon.style.cssText = 'font-size:1rem;flex-shrink:0';
    icon.textContent = item.icon;
    const txt = document.createElement('span');
    txt.style.cssText = 'font-size:.8125rem;color:var(--text-2)';
    txt.textContent = item.text;  // textContent — XSS safe
    div.appendChild(icon);
    div.appendChild(txt);
    c.appendChild(div);
  });
}

function _renderStreak() {
  const c = el('d-streak'); if (!c) return;
  const days = new Set(State.moTxns().map(t => t.date));
  c.innerHTML = '';
  const lbl = document.createElement('div');
  lbl.style.cssText = 'font-size:.7rem;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px';
  lbl.textContent = 'Monthly Activity';
  const val = document.createElement('div');
  val.style.cssText = 'font-size:1.625rem;font-weight:700;color:var(--brand);font-family:\'DM Mono\',monospace';
  const daysSpan = document.createElement('span');
  daysSpan.textContent = days.size;
  const lblSpan = document.createElement('span');
  lblSpan.style.cssText = 'font-size:.875rem;font-weight:600;color:var(--text-3)';
  lblSpan.textContent = ' active days';
  val.appendChild(daysSpan);
  val.appendChild(lblSpan);
  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:.75rem;color:var(--text-3);margin-top:3px';
  sub.textContent = State.txns.length + ' total transactions';
  c.appendChild(lbl); c.appendChild(val); c.appendChild(sub);
}

function _renderDashChart() {
  if (_dashChart) { try { _dashChart.destroy(); } catch (_) {} _dashChart = null; }
  const canvas = el('d-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  const cs      = State.catSpend();
  const entries = Object.entries(cs).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!entries.length) return;
  const pal = ['#1b4332','#2d6a4f','#52b788','#95d5b2','#d8f3dc','#b7e4c7'];
  try {
    _dashChart = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels:   entries.map(([k]) => k),
        datasets: [{ data: entries.map(([, v]) => v), backgroundColor: pal, borderWidth: 2, borderColor: 'var(--surface)', hoverOffset: 5 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${State.fmt(ctx.raw)}` } } },
      },
    });
  } catch (e) { console.error('[Dashboard] chart error:', e); }
}

// ─── Profile renderer ─────────────────────────────────────────────
function _renderProfile() {
  const p = State.profile, u = State.user;
  const info = el('profile-info');
  if (info) {
    info.innerHTML = '';
    const rows = [
      ['Name',     p.name || u?.name || '—'],
      ['Email',    u?.email || '—'],
      ['Currency', p.currency || '₹'],
    ];
    rows.forEach(([lbl, val]) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)';
      const l = document.createElement('span');
      l.className = 'muted'; l.style.fontSize = '.8125rem'; l.textContent = lbl;
      const v = document.createElement('span');
      v.className = 'semi'; v.style.fontSize = '.8125rem'; v.textContent = val;
      row.appendChild(l); row.appendChild(v);
      info.appendChild(row);
    });
  }

  const stats = el('profile-stats');
  if (stats) {
    const inc = State.txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = State.txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const rows = [
      ['Transactions', State.txns.length, ''],
      ['Total Income',  State.fmt(inc), 'c-green'],
      ['Total Expenses', State.fmt(exp), 'c-red'],
      ['Net Worth',     State.fmt(State.totalBalance()), ''],
      ['Budgets',       Object.keys(State.budgets).length, ''],
      ['Goals',         State.goals.length, ''],
    ];
    stats.innerHTML = '';
    rows.forEach(([lbl, val, cls]) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)';
      const l = document.createElement('span');
      l.className = 'muted'; l.style.fontSize = '.8125rem'; l.textContent = lbl;
      const v = document.createElement('span');
      v.className = `semi mono ${cls}`; v.style.fontSize = '.8125rem';
      v.textContent = val;
      row.appendChild(l); row.appendChild(v);
      stats.appendChild(row);
    });
  }
}

// ─── Sidebar drawer (mobile) ──────────────────────────────────────
export const SidebarDrawer = {
  _open: false,
  _isMobile() { return window.innerWidth <= 768; },
  open() {
    if (!this._isMobile()) return;
    this._open = true;
    el('sb')?.classList.add('open');
    el('sb-overlay')?.classList.add('open');
    document.body.style.overflow = 'hidden';
  },
  close() {
    if (!this._open) return;
    this._open = false;
    el('sb')?.classList.remove('open');
    el('sb-overlay')?.classList.remove('open');
    document.body.style.overflow = '';
  },
  init() {
    el('menu-btn')?.addEventListener('click', () => this._open ? this.close() : this.open());
    el('sb-overlay')?.addEventListener('click', () => this.close());
  },
};

// ─── Auth ─────────────────────────────────────────────────────────
const Auth = {
  _mode: 'login',

  init() {
    const uid = Storage.getSession();
    if (!uid) return false;
    const users = Storage.getUsers(), user = users[uid];
    if (!user) { Storage.clearSession(); return false; }
    State.setUser(user);
    State.load(uid);
    return true;
  },

  initUI() {
    el('atab-login')?.addEventListener('click',  () => this._switchMode('login'));
    el('atab-signup')?.addEventListener('click', () => this._switchMode('signup'));
    el('auth-submit')?.addEventListener('click', () => this._submit());
    document.querySelectorAll('#auth input').forEach(inp =>
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') this._submit(); })
    );
    // Demo login button
    el('auth-demo-btn')?.addEventListener('click', () => {
      seedDemoData();
      const uid = btoa(DEMO_EMAIL).replace(/=/g, '');
      const users = Storage.getUsers();
      this._startSession(users[uid]);
    });
  },

  _switchMode(mode) {
    this._mode = mode;
    el('atab-login')?.classList.toggle('on', mode === 'login');
    el('atab-signup')?.classList.toggle('on', mode === 'signup');
    el('auth-name-wrap')?.classList.toggle('hidden', mode === 'login');
    const err = el('auth-err'); if (err) err.textContent = '';
    const btn = el('auth-submit');
    if (btn) btn.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
  },

  _submit() {
    const email = (el('auth-email')?.value || '').trim().toLowerCase();
    const pwd   = (el('auth-password')?.value || '');
    const name  = (el('auth-name')?.value || '').trim();
    const errEl = el('auth-err');

    if (!email || !email.includes('@')) { if (errEl) errEl.textContent = 'Valid email required.'; return; }
    if (pwd.length < 6)                  { if (errEl) errEl.textContent = 'Password must be 6+ characters.'; return; }
    if (errEl) errEl.textContent = '';

    const users = Storage.getUsers();
    const uid   = btoa(email).replace(/=/g, '');

    if (this._mode === 'login') {
      if (!users[uid] || users[uid].pwd !== btoa(pwd)) {
        if (errEl) errEl.textContent = 'Invalid email or password.'; return;
      }
      this._startSession(users[uid]);
    } else {
      if (!name)       { if (errEl) errEl.textContent = 'Name required.'; return; }
      if (users[uid])  { if (errEl) errEl.textContent = 'Account already exists. Sign in instead.'; return; }
      const user = { uid, email, name, pwd: btoa(pwd) };
      users[uid] = user;
      Storage.saveUsers(users);
      this._startSession(user);
    }
  },

  _startSession(user) {
    Storage.setSession(user.uid);
    State.setUser(user);
    State.load(user.uid);
    App.showApp();
  },

  logout() {
    Storage.clearSession();
    State.setUser(null);
    State.clearData();
    el('app')?.classList.remove('on');
    el('auth')?.classList.remove('hidden');
    const em = el('auth-email'); if (em) em.value = '';
    const pw = el('auth-password'); if (pw) pw.value = '';
    const ae = el('auth-err'); if (ae) ae.textContent = '';
    this._switchMode('login');
  },
};

// ─── Command palette ──────────────────────────────────────────────
const CmdPalette = {
  _overlay: null,
  get _entries() {
    return [
      { label: 'Dashboard',     icon: '🏠', action: () => window.Router?.navigate('dashboard') },
      { label: 'Transactions',  icon: '📋', action: () => window.Router?.navigate('transactions') },
      { label: 'Budgets',       icon: '💰', action: () => window.Router?.navigate('budgets') },
      { label: 'Goals',         icon: '🎯', action: () => window.Router?.navigate('goals') },
      { label: 'Analytics',     icon: '📊', action: () => window.Router?.navigate('analytics') },
      { label: 'Split & Groups',icon: '👥', action: () => window.Router?.navigate('split') },
      { label: 'Add Transaction',icon: '➕', action: () => window.TxnModal?.open() },
      { label: 'Dark Mode',     icon: '🌙', action: () => DarkMode.toggle() },
      { label: 'Export CSV',    icon: '📥', action: () => exportCSV() },
    ];
  },

  open() {
    if (!this._overlay) this._build();
    this._overlay.style.display = 'flex';
    el('cmd-inp')?.focus();
    this._render('');
  },

  close() {
    if (this._overlay) this._overlay.style.display = 'none';
  },

  _build() {
    const div = document.createElement('div');
    div.id = 'cmd-overlay';
    div.style.cssText = 'position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;padding-top:15vh';
    div.innerHTML = `<div style="background:var(--surface);border-radius:var(--r-xl);width:100%;max-width:500px;box-shadow:var(--shadow-lg);overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid var(--border)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="17" height="17" style="color:var(--text-3);flex-shrink:0"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input id="cmd-inp" placeholder="Search pages or actions..." style="flex:1;font-size:.9375rem;background:transparent;color:var(--text)"/>
        <kbd style="font-size:.62rem;padding:2px 6px;background:var(--surface-2);border:1px solid var(--border-mid);border-radius:4px;color:var(--text-3)">ESC</kbd>
      </div>
      <div id="cmd-results" style="max-height:320px;overflow-y:auto;padding:5px"></div>
    </div>`;
    div.addEventListener('click', e => { if (e.target === div) this.close(); });
    document.body.appendChild(div);
    this._overlay = div;
    el('cmd-inp')?.addEventListener('input', e => this._render(e.target.value));
    el('cmd-inp')?.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
  },

  _render(q) {
    const results = el('cmd-results'); if (!results) return;
    const entries = this._entries; const filtered = q ? entries.filter(e => e.label.toLowerCase().includes(q.toLowerCase())) : entries;
    results.innerHTML = '';
    filtered.forEach(entry => {
      const item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:11px;padding:9px 16px;cursor:pointer;border-radius:var(--r);font-size:.875rem;transition:background var(--ease)';
      item.addEventListener('mouseenter', () => { item.style.background = 'var(--surface-2)'; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; });
      const icon = document.createElement('span');
      icon.style.fontSize = '1rem';
      icon.textContent = entry.icon;
      const lbl = document.createElement('span');
      lbl.textContent = entry.label;
      item.appendChild(icon); item.appendChild(lbl);
      item.addEventListener('click', () => { this.close(); entry.action(); });
      results.appendChild(item);
    });
  },
};

// ─── Main App ─────────────────────────────────────────────────────
const App = {
  _subscribed: false,
  showApp() {
    el('auth')?.classList.add('hidden');
    el('app')?.classList.add('on');
    this._syncUserUI();
    this._populateCats();
    this._updatePfx();
    Router.navigate('dashboard');
    updateSbStats();
    updateBadges();
    setTimeout(Txns.processRecurring, 600);

    // Subscribe to state updates (only once)
    if (!this._subscribed) {
      this._subscribed = true;
      State.on('updated', () => {
        _renderPage(State.currentPage);
        updateSbStats();
        updateBadges();
        this._syncUserUI();
      });
    }
  },

  _syncUserUI() {
    const name  = State.profile?.name || State.user?.name || 'User';
    const email = State.user?.email || '';
    const init  = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
    const sbAv  = el('sb-av');    if (sbAv)   sbAv.textContent   = init;
    const sbNm  = el('sb-name');  if (sbNm)   sbNm.textContent   = name;
    const sbEm  = el('sb-email'); if (sbEm)   sbEm.textContent   = email;
  },

  _populateCats() {
    const tc = el('txn-cat');    if (tc) tc.innerHTML = catOpts('expense');
    const tf = el('txn-fcat');   if (tf) tf.innerHTML = '<option value="">All Categories</option>' + catOpts('all');
    const bc = el('bud-cat');    if (bc) bc.innerHTML = catOpts('expense');
  },

  _updatePfx() {
    const c = State.currency();
    document.querySelectorAll('.amount-pfx').forEach(e => { e.textContent = c; });
  },

  init() {
    // 1. Check session BEFORE splash so no auth flash
    const hasSession = Auth.init();

    // 2. Show splash then transition
    setTimeout(() => {
      el('splash')?.classList.add('out');
      if (!hasSession) {
        el('auth')?.classList.remove('hidden');
      } else {
        this.showApp();
      }
    }, 1600);

    // 3. Wire all systems
    DarkMode.init();
    Router.init();
    SidebarDrawer.init();
    Auth.initUI();
    initEvents();

    // 4. Logout
    el('btn-logout')?.addEventListener('click', () => Auth.logout());

    // 5. Command palette
    el('cmd-btn')?.addEventListener('click', () => CmdPalette.open());
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); CmdPalette.open(); }
    });

    // 6. View all link
    el('d-view-all')?.addEventListener('click', () => Router.navigate('transactions'));

    // 7. Make modal controllers globally accessible (needed for onclick attrs in templates)
    window.TxnModal     = TxnModal;
    window.BudgetModal  = BudgetModal;
    window.GoalModal    = GoalModal;
    window.ProgModal    = ProgModal;
    window.Router       = Router;
    window.SidebarDrawer = SidebarDrawer;
  },
};

// Boot on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => App.init());

// ─── Re-export for HTML template onclick attrs ─────────────────────
// These are set on window in App.init() above
