/**
 * features/transactions.js — Transaction CRUD, filtering, sorting, undo stack
 *
 * Responsibilities:
 * - Add / edit / delete transactions
 * - Filter / sort / search
 * - CSV export / import
 * - Recurring transaction processing
 * - Undo/redo stack (last 10 destructive actions)
 */

import State   from '../state.js';
import Storage from '../storage.js';
import { Toast, esc, fmtDate, fmtMonth, debounce, catOpts, getCat, emptyState, txnRow, numSanitize, el, setText } from '../ui.js';

// ─── Undo stack ───────────────────────────────────────────────────
const _undoStack = [];  // [{ type: 'delete', txn }]
const MAX_UNDO   = 10;

function pushUndo(action) {
  _undoStack.unshift(action);
  if (_undoStack.length > MAX_UNDO) _undoStack.pop();
}

export function undo() {
  const action = _undoStack.shift();
  if (!action) { Toast.warn('Nothing to undo'); return; }
  if (action.type === 'delete') {
    Storage.addTransaction(State.uid, action.txn);
    State.updateAll();
    Toast.ok(`Restored: ${action.txn.note || 'transaction'}`);
  }
}

// ─── Validation ───────────────────────────────────────────────────
/**
 * Validate a transaction payload.
 * Returns null if valid, or an error message string.
 */
export function validateTxn({ amount, date, type, category }) {
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return 'Please enter a valid amount greater than zero.';
  }
  if (!date) return 'Please select a date.';
  if (!['income', 'expense'].includes(type)) return 'Invalid transaction type.';
  if (!category) return 'Please select a category.';
  return null;
}

// ─── Add / Edit ───────────────────────────────────────────────────
export function saveTxn(payload, editId = null) {
  const err = validateTxn(payload);
  if (err) { Toast.err(err); return false; }

  const txn = {
    type:       payload.type,
    amount:     Math.round(parseFloat(payload.amount) * 100) / 100,
    note:       (payload.note || '').trim().slice(0, 200),
    category:   payload.category,
    date:       payload.date,
    tags:       (payload.tags || '').split(',').map(t => t.trim()).filter(Boolean),
    recurring:  !!payload.recurring,
    recurFreq:  payload.recurFreq || 'monthly',
  };

  if (editId) {
    Storage.updateTransaction(State.uid, editId, txn);
    Toast.ok('Transaction updated');
  } else {
    Storage.addTransaction(State.uid, txn);
    Toast.ok('Transaction added');
  }

  State.updateAll();
  return true;
}

// ─── Delete ───────────────────────────────────────────────────────
export function deleteTxn(id) {
  const txn = State.txns.find(t => String(t.id) === String(id));
  if (!txn) return;
  pushUndo({ type: 'delete', txn });
  Storage.deleteTransaction(State.uid, id);
  State.updateAll();
  Toast.ok('Deleted — press Ctrl+Z to undo');
}

// ─── Recurring processing ─────────────────────────────────────────
/**
 * For each recurring transaction not yet duplicated in the current month,
 * create a non-recurring copy dated the 1st of this month.
 */
export function processRecurring() {
  const txns = State.txns;
  const mo   = State.thisMonth();
  txns.filter(t => t.recurring && t.date).forEach(t => {
    const alreadyDone = txns.some(x =>
      x.note === t.note &&
      x.category === t.category &&
      x.type === t.type &&
      x.amount === t.amount &&
      x.date?.startsWith(mo) &&
      !x.recurring
    );
    if (!alreadyDone) {
      Storage.addTransaction(State.uid, {
        type:      t.type,
        amount:    t.amount,
        note:      t.note,
        category:  t.category,
        date:      mo + '-01',
        tags:      t.tags || [],
        recurring: false,
      });
    }
  });
}

// ─── CSV Export ───────────────────────────────────────────────────
export function exportCSV() {
  const rows = [['Date', 'Type', 'Category', 'Note', 'Amount', 'Currency', 'Tags']];
  State.txns.forEach(t => {
    rows.push([
      t.date || '',
      t.type,
      getCat(t.category).l,
      t.note || '',
      t.amount,
      State.currency(),
      (t.tags || []).join(';'),
    ]);
  });
  const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `spendee-export-${State.thisMonth()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  Toast.ok(`Exported ${State.txns.length} transactions`);
}

// ─── CSV Import ───────────────────────────────────────────────────
export function importCSV(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.csv')) { Toast.err('Please upload a .csv file'); return; }
  if (file.size > 5 * 1024 * 1024)               { Toast.err('File too large (max 5 MB)'); return; }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const lines  = e.target.result.split('\n').filter(Boolean);
      const header = lines[0].toLowerCase();
      if (!header.includes('date') || !header.includes('amount')) {
        Toast.err('Invalid CSV: missing Date or Amount column'); return;
      }
      let count = 0;
      lines.slice(1).forEach(line => {
        // Proper CSV parsing respecting quoted fields
        const cols = _parseCSVLine(line);
        const [date, type, , note, amount] = cols;
        const amt = parseFloat(amount);
        if (!date || isNaN(amt) || amt <= 0) return;
        Storage.addTransaction(State.uid, {
          date,
          type:     type === 'income' ? 'income' : 'expense',
          note:     (note || '').slice(0, 200),
          category: 'other',
          amount:   Math.round(amt * 100) / 100,
          tags:     [],
        });
        count++;
      });
      Toast.ok(`Imported ${count} transactions`);
      State.updateAll();
    } catch (err) {
      Toast.err('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function _parseCSVLine(line) {
  const result = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// ─── Page renderer ────────────────────────────────────────────────
// Filter state (module-level, survives page navigations)
const _filters = { search: '', type: '', cat: '', month: '', sort: 'date-d' };

export function renderTransactionsPage() {
  _buildMonthFilter();
  const fcat = el('txn-fcat');
  if (fcat) fcat.innerHTML = '<option value="">All Categories</option>' + catOpts('all');
  _drawList();
}

function _buildMonthFilter() {
  const sel = el('txn-fmonth');
  if (!sel) return;
  const months = [...new Set(State.txns.map(t => t.date?.slice(0, 7)).filter(Boolean))].sort().reverse();
  sel.innerHTML = '<option value="">All Time</option>' +
    months.map(m => `<option value="${m}">${fmtMonth(m)}</option>`).join('');
}

function _getFiltered() {
  const { search, type, cat, month, sort } = _filters;
  const q = search.toLowerCase();
  let list = State.txns.slice();
  if (q)     list = list.filter(t => (t.note || '').toLowerCase().includes(q) || getCat(t.category).l.toLowerCase().includes(q));
  if (type)  list = list.filter(t => t.type === type);
  if (cat)   list = list.filter(t => t.category === cat);
  if (month) list = list.filter(t => t.date?.startsWith(month));
  list.sort((a, b) => {
    if (sort === 'date-d') return (b.date || '') > (a.date || '') ? 1 : -1;
    if (sort === 'date-a') return (a.date || '') > (b.date || '') ? 1 : -1;
    if (sort === 'amt-d')  return b.amount - a.amount;
    return a.amount - b.amount;
  });
  return list;
}

function _drawList() {
  const list = _getFiltered();
  const inc  = list.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const exp  = list.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const fi = el('tf-inc'); if (fi) fi.textContent = State.fmt(inc);
  const fe = el('tf-exp'); if (fe) fe.textContent = State.fmt(exp);
  const fc = el('tf-cnt'); if (fc) fc.textContent = list.length;

  const container = el('txn-list');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = emptyState({ icon: '💸', title: 'No transactions', text: 'No transactions match your current filters.' });
    return;
  }

  // Group by date
  const groups = {};
  list.forEach(t => { const d = t.date || 'Unknown'; if (!groups[d]) groups[d] = []; groups[d].push(t); });

  const frag = document.createDocumentFragment();
  Object.entries(groups).forEach(([date, txns]) => {
    const hd = document.createElement('div');
    hd.className = 'txn-sec-hd';
    hd.textContent = fmtDate(date);
    frag.appendChild(hd);
    txns.forEach(t => frag.appendChild(txnRow(t)));
  });

  container.innerHTML = '';
  container.appendChild(frag);
}

/** Wire all filter controls. Call once after DOM ready. */
export function initFilters() {
  const dSearch = debounce(v => { _filters.search = v.toLowerCase(); _drawList(); }, 250);
  el('txn-search')?.addEventListener('input', e => dSearch(e.target.value));
  el('txn-ftype')?.addEventListener('change', e => { _filters.type = e.target.value; _drawList(); });
  el('txn-fcat')?.addEventListener('change', e => { _filters.cat = e.target.value; _drawList(); });
  el('txn-fmonth')?.addEventListener('change', e => { _filters.month = e.target.value; _drawList(); });
  el('txn-sort')?.addEventListener('change', e => { _filters.sort = e.target.value; _drawList(); });
}

export function setFilter(key, value) {
  _filters[key] = value;
  _drawList();
}
