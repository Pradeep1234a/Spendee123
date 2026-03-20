/**
 * state.js — Centralized state management
 *
 * Single source of truth for all runtime data.
 * All mutations go through the public API.
 * Subscribers are notified on every state change.
 *
 * Pattern: Observer / pub-sub with typed events.
 */

import Storage from './storage.js';

const State = (() => {
  // ─── Private state object ──────────────────────────────────────────
  let _state = {
    // Current session
    uid:          null,
    user:         null,
    currentPage:  'dashboard',
    // User data
    txns:         [],
    budgets:      {},
    goals:        [],
    profile:      {},
    // UI state
    isLoading:    false,
  };

  // ─── Event bus ────────────────────────────────────────────────────
  const _listeners = {};

  function on(event, cb) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(cb);
  }

  function off(event, cb) {
    if (_listeners[event]) {
      _listeners[event] = _listeners[event].filter(fn => fn !== cb);
    }
  }

  function emit(event, payload) {
    (_listeners[event] || []).forEach(cb => {
      try { cb(payload); } catch (e) { console.error('[State] listener error:', event, e); }
    });
    // Always emit 'change' for any state update
    if (event !== 'change') {
      (_listeners['change'] || []).forEach(cb => {
        try { cb({ event, payload }); } catch (e) { console.error('[State] change listener error:', e); }
      });
    }
  }

  // ─── Load from storage ────────────────────────────────────────────
  /**
   * Hydrate state from storage for a given user.
   * Called once on login and on every updateAll().
   */
  function load(uid) {
    _state.uid     = uid;
    _state.txns    = Storage.getTransactions(uid);
    _state.budgets = Storage.getBudgets(uid);
    _state.goals   = Storage.getGoals(uid);
    _state.profile = Storage.getProfile(uid);
    emit('loaded', uid);
  }

  // ─── Computed selectors (pure functions over state) ────────────────
  function currency()   { return _state.profile?.currency || '₹'; }
  function thisMonth()  { return new Date().toISOString().slice(0, 7); }

  /**
   * Format a number as currency string.
   * Handles negative, NaN, and zero gracefully.
   */
  function fmt(amount) {
    const cur = currency();
    const n   = parseFloat(amount);
    if (isNaN(n)) return cur + '0';
    const abs = Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    return (n < 0 ? '-' : '') + cur + abs;
  }

  /** Transactions in the given month (default: current) */
  function moTxns(month) {
    const m = month || thisMonth();
    return _state.txns.filter(t => t.date && t.date.startsWith(m));
  }

  /** Sum of income for a given month */
  function mInc(month) {
    return moTxns(month).filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  }

  /** Sum of expenses for a given month */
  function mExp(month) {
    return moTxns(month).filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  }

  /** Net (income - expense) for a given month */
  function mNet(month) { return mInc(month) - mExp(month); }

  /** Savings rate % for current month (capped 0-100) */
  function savingsRate() {
    const inc = mInc();
    return inc > 0 ? Math.min(100, Math.max(0, Math.round(mNet() / inc * 100))) : 0;
  }

  /** All-time net balance */
  function totalBalance() {
    return _state.txns.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
  }

  /** Spending per category for a given month */
  function catSpend(month) {
    const result = {};
    moTxns(month).filter(t => t.type === 'expense').forEach(t => {
      result[t.category] = (result[t.category] || 0) + t.amount;
    });
    return result;
  }

  /**
   * Returns an array of { month, label, income, expense } for last n months.
   * Used by the trend chart.
   */
  function trend(n = 6) {
    const months = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const m = d.toISOString().slice(0, 7);
      months.push({
        month:   m,
        label:   d.toLocaleString('default', { month: 'short' }),
        income:  mInc(m),
        expense: mExp(m),
      });
    }
    return months;
  }

  /**
   * Financial health score (0–100).
   *
   * Algorithm weights:
   *  - Savings rate          (40 pts)  — higher is better
   *  - Balance sign          (20 pts)  — positive balance
   *  - Budget adherence      (25 pts)  — % of budgets under limit
   *  - Transaction frequency (15 pts)  — engagement signal
   */
  function healthScore() {
    let score = 0;

    // Savings rate (40 pts)
    const rate = savingsRate();
    score += Math.min(40, Math.round(rate * 0.4));  // 0–40

    // Positive balance (20 pts)
    if (totalBalance() > 0) score += 20;

    // Budget adherence (25 pts)
    const budgetEntries = Object.entries(_state.budgets);
    if (budgetEntries.length > 0) {
      const spend = catSpend();
      const underLimit = budgetEntries.filter(([cat, b]) => {
        const limit = +(typeof b === 'object' ? b.limit : b) || 0;
        return limit > 0 && (spend[cat] || 0) <= limit;
      }).length;
      score += Math.round(underLimit / budgetEntries.length * 25);
    } else {
      score += 12; // neutral if no budgets set
    }

    // Transaction frequency (15 pts) — at least 5 txns this month = full points
    const moCount = moTxns().length;
    score += Math.min(15, Math.round(moCount / 5 * 15));

    return Math.min(100, score);
  }

  // ─── Smart insights ───────────────────────────────────────────────
  /**
   * Generates actionable insight strings based on current state.
   * Returns array of { icon, text, type } objects.
   */
  function insights() {
    const items  = [];
    const rate   = savingsRate();
    const bal    = totalBalance();
    const cs     = catSpend();
    const top    = Object.entries(cs).sort((a, b) => b[1] - a[1])[0];
    const t3mo   = trend(3);

    // Savings rate insight
    if (rate >= 30) {
      items.push({ icon: '🎉', text: `Great job! Saving ${rate}% of income this month.`, type: 'success' });
    } else if (rate < 0) {
      items.push({ icon: '⚠️', text: `Expenses exceed income by ${fmt(Math.abs(mNet()))} this month.`, type: 'warning' });
    } else if (rate < 10 && mInc() > 0) {
      items.push({ icon: '💡', text: `Savings rate is ${rate}%. Try to reach 20%+ for financial security.`, type: 'info' });
    }

    // Top spending category
    if (top) {
      items.push({ icon: '📊', text: `Top spend: ${top[0]} at ${fmt(top[1])} this month.`, type: 'info' });
    }

    // Trend: spending increasing?
    if (t3mo.length === 3) {
      const [a, b, c] = t3mo;
      if (c.expense > b.expense && b.expense > a.expense) {
        items.push({ icon: '📈', text: 'Expenses have increased 3 months in a row. Review your spending.', type: 'warning' });
      }
    }

    // Budget warnings
    const budgetEntries = Object.entries(_state.budgets);
    if (budgetEntries.length > 0) {
      const spend = catSpend();
      const nearLimit = budgetEntries.filter(([cat, b]) => {
        const limit = +(typeof b === 'object' ? b.limit : b) || 0;
        const spent = spend[cat] || 0;
        return limit > 0 && spent >= limit * 0.8 && spent < limit;
      });
      if (nearLimit.length) {
        items.push({ icon: '🔔', text: `${nearLimit.length} budget${nearLimit.length > 1 ? 's' : ''} near the limit.`, type: 'warning' });
      }
    }

    // Positive balance
    if (bal > 0 && items.length < 2) {
      items.push({ icon: '✅', text: `Net worth: ${fmt(bal)}. You're building wealth!`, type: 'success' });
    }

    return items.slice(0, 3); // max 3 insights
  }

  // ─── Mutations ────────────────────────────────────────────────────
  /** Master refresh: re-reads from storage, emits 'updated' event. */
  function updateAll() {
    if (!_state.uid) return;
    load(_state.uid);
    emit('updated', { page: _state.currentPage });
  }

  function setUser(user) {
    _state.user = user;
    _state.uid  = user ? (user.uid || user.email) : null;
    emit('userChanged', user);
  }

  function setPage(page) {
    const prev = _state.currentPage;
    _state.currentPage = page;
    emit('pageChanged', { page, prev });
  }

  function setLoading(bool) {
    _state.isLoading = bool;
    emit('loadingChanged', bool);
  }

  function clearData() {
    _state.txns    = [];
    _state.budgets = {};
    _state.goals   = [];
    _state.profile = {};
    emit('dataCleared');
  }

  // ─── Public API ───────────────────────────────────────────────────
  return {
    // Raw state (read-only via getters)
    get uid()         { return _state.uid; },
    get user()        { return _state.user; },
    get txns()        { return _state.txns; },
    get budgets()     { return _state.budgets; },
    get goals()       { return _state.goals; },
    get profile()     { return _state.profile; },
    get currentPage() { return _state.currentPage; },
    get isLoading()   { return _state.isLoading; },

    // Selectors
    currency, thisMonth, fmt, moTxns,
    mInc, mExp, mNet, savingsRate,
    totalBalance, catSpend, trend,
    healthScore, insights,

    // Event bus
    on, off, emit,

    // Mutations
    load, updateAll, setUser, setPage, setLoading, clearData,
  };
})();

export default State;
