/**
 * storage.js — localStorage abstraction layer
 *
 * All persistence goes through this module.
 * No other module ever calls localStorage directly.
 *
 * Key-naming convention: sp2_{uid}_{entity}
 * Data versioning: every write includes a _v field for future migrations.
 */

const Storage = (() => {
  const PREFIX  = 'sp2_';
  const VERSION = 2;

  // ─── Private helpers ──────────────────────────────────────────────
  function _read(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      // Corrupted key — remove and return null
      console.warn('[Storage] corrupt key, clearing:', key);
      try { localStorage.removeItem(PREFIX + key); } catch (_) {}
      return null;
    }
  }

  function _write(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.error('[Storage] QuotaExceeded — storage full');
        // Attempt emergency prune: trim oldest 20% of transactions
        _emergencyPrune(key);
        try {
          localStorage.setItem(PREFIX + key, JSON.stringify(value));
          return true;
        } catch (_) { return false; }
      }
      console.error('[Storage] write failed:', e);
      return false;
    }
  }

  function _del(key) {
    try { localStorage.removeItem(PREFIX + key); } catch (_) {}
  }

  function _uk(uid, entity) {
    return `${uid}_${entity}`;
  }

  function _emergencyPrune(failedKey) {
    // Remove oldest 20% of transactions for all users if storage full
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX) || !k.endsWith('_txns')) continue;
      try {
        const txns = JSON.parse(localStorage.getItem(k) || '[]');
        if (txns.length > 100) {
          const trimmed = txns.slice(0, Math.floor(txns.length * 0.8));
          localStorage.setItem(k, JSON.stringify(trimmed));
        }
      } catch (_) {}
    }
  }

  // ─── ID generation ─────────────────────────────────────────────────
  /**
   * Generates a collision-resistant ID combining timestamp + random.
   * Format: {prefix}_{base36_time}_{random}
   */
  function nid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  // ─── Auth ──────────────────────────────────────────────────────────
  function getUsers()         { return _read('users') || {}; }
  function saveUsers(users)   { _write('users', users); }
  function getSession()       { return _read('session'); }
  function setSession(uid)    { _write('session', uid); }
  function clearSession()     { _del('session'); }

  // ─── Transactions ──────────────────────────────────────────────────
  function getTransactions(uid) {
    return _read(_uk(uid, 'txns')) || [];
  }

  function saveTransactions(uid, txns) {
    _write(_uk(uid, 'txns'), txns);
  }

  /**
   * Add a transaction. Auto-assigns id if missing.
   * Returns the saved transaction object.
   */
  function addTransaction(uid, txn) {
    const all = getTransactions(uid);
    const saved = {
      ...txn,
      id:        txn.id   || nid('tx'),
      createdAt: txn.createdAt || new Date().toISOString(),
      _v:        VERSION,
    };
    all.unshift(saved);  // newest first
    saveTransactions(uid, all);
    return saved;
  }

  function updateTransaction(uid, id, patch) {
    const all = getTransactions(uid).map(t =>
      String(t.id) === String(id) ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
    );
    saveTransactions(uid, all);
  }

  function deleteTransaction(uid, id) {
    const filtered = getTransactions(uid).filter(t => String(t.id) !== String(id));
    saveTransactions(uid, filtered);
  }

  // ─── Budgets ───────────────────────────────────────────────────────
  function getBudgets(uid)           { return _read(_uk(uid, 'budgets')) || {}; }
  function saveBudgets(uid, budgets) { _write(_uk(uid, 'budgets'), budgets); }

  // ─── Goals ────────────────────────────────────────────────────────
  function getGoals(uid)         { return _read(_uk(uid, 'goals')) || []; }
  function saveGoals(uid, goals) { _write(_uk(uid, 'goals'), goals); }

  // ─── Profile ──────────────────────────────────────────────────────
  function getProfile(uid)             { return _read(_uk(uid, 'profile')) || {}; }
  function saveProfile(uid, profile)   { _write(_uk(uid, 'profile'), profile); }

  // ─── Split data ───────────────────────────────────────────────────
  const SPLIT_KEY = 'split_data';
  function getSplitData()     { return _read(SPLIT_KEY) || { groups: {}, expenses: {}, settlements: {} }; }
  function saveSplitData(d)   { _write(SPLIT_KEY, d); }

  // ─── Full user wipe ────────────────────────────────────────────────
  function resetUserData(uid) {
    ['txns', 'budgets', 'goals', 'profile'].forEach(k => _del(_uk(uid, k)));
  }

  // ─── Export / import all user data ────────────────────────────────
  function exportUserData(uid) {
    return {
      uid,
      transactions: getTransactions(uid),
      budgets:      getBudgets(uid),
      goals:        getGoals(uid),
      profile:      getProfile(uid),
      exportedAt:   new Date().toISOString(),
      _v:           VERSION,
    };
  }

  function importUserData(uid, data) {
    if (data.transactions) saveTransactions(uid, data.transactions);
    if (data.budgets)      saveBudgets(uid, data.budgets);
    if (data.goals)        saveGoals(uid, data.goals);
    if (data.profile)      saveProfile(uid, data.profile);
  }

  // ─── Storage usage stats ──────────────────────────────────────────
  function usageStats() {
    let used = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) {
        used += (localStorage.getItem(k) || '').length;
      }
    }
    // localStorage is roughly 5MB = 5*1024*1024 chars
    const max = 5 * 1024 * 1024;
    return { usedChars: used, maxChars: max, pct: Math.round(used / max * 100) };
  }

  return {
    // ID
    nid,
    // Auth
    getUsers, saveUsers, getSession, setSession, clearSession,
    // Transactions
    getTransactions, saveTransactions, addTransaction, updateTransaction, deleteTransaction,
    // Budgets
    getBudgets, saveBudgets,
    // Goals
    getGoals, saveGoals,
    // Profile
    getProfile, saveProfile,
    // Split
    getSplitData, saveSplitData,
    // Data management
    resetUserData, exportUserData, importUserData,
    // Diagnostics
    usageStats,
  };
})();

export default Storage;
