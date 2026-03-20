/**
 * events.js — Event bindings, modal controllers
 *
 * This module wires all DOM events to their handlers.
 * It is the only module that touches addEventListener.
 * Business logic is delegated to features/*.js modules.
 */

import State   from './state.js';
import Storage from './storage.js';
import { Toast, esc, el, numSanitize, catOpts, getCat, today } from './ui.js';
import * as Txns     from './features/transactions.js';
import * as Budgets  from './features/budgets.js';
import * as Goals    from './features/goals.js';
import * as Analytics from './features/analytics.js';
import * as Split    from './features/split.js';

// ─── Modal utility ────────────────────────────────────────────────
function openModal(id)  { el(id)?.classList.remove('hidden'); }
function closeModal(id) { el(id)?.classList.add('hidden'); }

function _onOverlayClick(e) {
  if (e.target.classList.contains('overlay')) e.target.classList.add('hidden');
  const closer = e.target.closest('[data-close]');
  if (closer) closeModal(closer.dataset.close);
}

function _onEscape(e) {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
}

// ─── Transaction Modal ────────────────────────────────────────────
let _txnEditId = null, _txnType = 'expense';

export const TxnModal = {
  open(txn = null) {
    _txnEditId = txn ? String(txn.id) : null;
    _txnType   = txn ? txn.type : 'expense';
    const title = el('mo-txn-title');
    if (title) title.textContent = txn ? 'Edit Transaction' : 'Add Transaction';
    _setTxnType(_txnType);
    // Populate category select
    const catSel = el('txn-cat');
    if (catSel) catSel.innerHTML = catOpts(_txnType);
    // Fill fields with safe assignment
    _setVal('txn-amt',         txn ? txn.amount    : '');
    _setVal('txn-note',        txn ? txn.note || '' : '');
    _setVal('txn-date',        txn ? txn.date       : today());
    _setVal('txn-tags',        txn?.tags?.join(', ') || '');
    _setChecked('txn-recur',   !!(txn?.recurring));
    _setVal('txn-recur-freq',  txn?.recurFreq || 'monthly');
    el('txn-recur-opts')?.classList.toggle('hidden', !txn?.recurring);
    el('txn-err') && (el('txn-err').textContent = '');
    el('txn-del-btn')?.classList.toggle('hidden', !txn);
    if (txn && catSel) catSel.value = txn.category || 'other';
    openModal('mo-txn');
    setTimeout(() => el('txn-amt')?.focus(), 80);
  },
  close() { closeModal('mo-txn'); },
};

function _setTxnType(t) {
  _txnType = t;
  const eBtn = el('tt-expense'), iBtn = el('tt-income');
  if (eBtn) { eBtn.style.background = t === 'expense' ? 'var(--red-pale)' : 'transparent'; eBtn.style.color = t === 'expense' ? 'var(--red)' : 'var(--text-3)'; }
  if (iBtn) { iBtn.style.background = t === 'income'  ? 'var(--green-pale)' : 'transparent'; iBtn.style.color = t === 'income'  ? 'var(--green)' : 'var(--text-3)'; }
  const catSel = el('txn-cat');
  if (catSel) catSel.innerHTML = catOpts(t);
}

function _saveTxn() {
  const ok = Txns.saveTxn({
    type:      _txnType,
    amount:    el('txn-amt')?.value,
    note:      el('txn-note')?.value,
    category:  el('txn-cat')?.value,
    date:      el('txn-date')?.value,
    tags:      el('txn-tags')?.value,
    recurring: el('txn-recur')?.checked,
    recurFreq: el('txn-recur-freq')?.value,
  }, _txnEditId);
  if (ok) TxnModal.close();
  else {
    const err = el('txn-err');
    if (err) err.textContent = 'Please fill all required fields.';
  }
}

// ─── Budget Modal ─────────────────────────────────────────────────
export const BudgetModal = {
  open(cat = null, limit = null) {
    const catSel = el('bud-cat');
    if (catSel) { catSel.innerHTML = catOpts('expense'); if (cat) catSel.value = cat; }
    _setVal('bud-limit', limit || '');
    openModal('mo-bud');
    setTimeout(() => el('bud-limit')?.focus(), 80);
  },
  close() { closeModal('mo-bud'); },
};

function _saveBudget() {
  const ok = Budgets.saveBudget(el('bud-cat')?.value, parseFloat(el('bud-limit')?.value));
  if (ok) BudgetModal.close();
}

// ─── Goal Modal ───────────────────────────────────────────────────
let _goalEditId = null;

export const GoalModal = {
  open(g = null) {
    _goalEditId = g ? String(g.id) : null;
    const title = el('mo-goal-title');
    if (title) title.textContent = g ? 'Edit Goal' : 'New Goal';
    _setVal('goal-emoji',    g?.emoji    || '');
    _setVal('goal-name',     g?.name     || '');
    _setVal('goal-target',   g?.target   || '');
    _setVal('goal-saved',    g?.saved    || 0);
    _setVal('goal-deadline', g?.deadline || '');
    el('goal-del-btn')?.classList.toggle('hidden', !g);
    openModal('mo-goal');
    setTimeout(() => el('goal-name')?.focus(), 80);
  },
  close() { closeModal('mo-goal'); },
};

function _saveGoal() {
  const ok = Goals.saveGoal({
    emoji:    el('goal-emoji')?.value,
    name:     el('goal-name')?.value,
    target:   el('goal-target')?.value,
    saved:    el('goal-saved')?.value,
    deadline: el('goal-deadline')?.value,
  }, _goalEditId);
  if (ok) GoalModal.close();
}

// ─── Progress Modal ───────────────────────────────────────────────
let _progGoalId = null;

export const ProgModal = {
  open(id) {
    _progGoalId = String(id);
    const g = State.goals.find(g => String(g.id) === _progGoalId); if (!g) return;
    const preview = el('prog-preview');
    if (preview) {
      preview.textContent = '';
      const div = document.createElement('div');
      div.textContent = `${g.emoji || '🎯'} ${g.name}`;
      div.style.cssText = 'font-weight:700;margin-bottom:4px';
      const sub = document.createElement('div');
      sub.textContent = `${State.fmt(g.saved || 0)} of ${State.fmt(g.target)}`;
      sub.style.cssText = 'font-size:.8125rem;color:var(--text-3)';
      preview.appendChild(div);
      preview.appendChild(sub);
    }
    _setVal('prog-saved', g.saved || 0);
    _updateProgBar();
    openModal('mo-prog');
    setTimeout(() => el('prog-saved')?.focus(), 80);
  },
  close() { closeModal('mo-prog'); },
};

function _updateProgBar() {
  const g = State.goals.find(g => String(g.id) === _progGoalId); if (!g) return;
  const p = Math.min(100, Math.round((parseFloat(el('prog-saved')?.value) || 0) / g.target * 100));
  const bar = el('prog-bar-live'); if (bar) bar.style.width = p + '%';
  const pct = el('prog-pct-live'); if (pct) pct.textContent = p + '%';
}

function _saveProgress() {
  const ok = Goals.updateGoalProgress(_progGoalId, el('prog-saved')?.value);
  if (ok) ProgModal.close();
}

// ─── Profile Modal ────────────────────────────────────────────────
export const ProfileModal = {
  open() {
    _setVal('edit-name', State.profile?.name || State.user?.name || '');
    _setVal('edit-cur',  State.profile?.currency || '₹');
    openModal('mo-profile');
    setTimeout(() => el('edit-name')?.focus(), 80);
  },
  close() { closeModal('mo-profile'); },
};

function _saveProfile() {
  const name = el('edit-name')?.value.trim();
  const cur  = el('edit-cur')?.value;
  if (!name) { Toast.warn('Name required'); return; }
  const profile = { ...State.profile, name, currency: cur };
  Storage.saveProfile(State.uid, profile);
  document.querySelectorAll('.amount-pfx').forEach(e => { e.textContent = cur; });
  ProfileModal.close();
  Toast.ok('Profile saved');
  State.updateAll();
}

// ─── Split Group Modal ────────────────────────────────────────────
let _grpMembers = [];

export const GroupModal = {
  open() {
    _grpMembers = [];
    _setVal('grp-emoji', ''); _setVal('grp-name', ''); _setVal('grp-member-inp', '');
    el('grp-err') && (el('grp-err').textContent = '');
    _renderMemberChips();
    openModal('mo-grp');
    setTimeout(() => el('grp-name')?.focus(), 80);
  },
  close() { closeModal('mo-grp'); },
};

function _renderMemberChips() {
  const c = el('grp-members'); if (!c) return;
  const me = State.profile?.name || State.user?.name || 'Me';
  c.innerHTML = '';
  const selfChip = _makeChip(me + ' (You)', null);
  c.appendChild(selfChip);
  _grpMembers.forEach((name, i) => c.appendChild(_makeChip(name, i)));
}

function _makeChip(name, removeIdx) {
  const span = document.createElement('span');
  span.className = 'mem-chip';
  const av = document.createElement('span');
  av.className = 'mem-av';
  av.textContent = name[0].toUpperCase();
  span.appendChild(av);
  span.appendChild(document.createTextNode(name));
  if (removeIdx !== null) {
    const x = document.createElement('button');
    x.style.cssText = 'background:none;border:none;cursor:pointer;font-size:.7rem;color:var(--text-3);padding:0 0 0 4px;line-height:1';
    x.textContent = '×';
    x.addEventListener('click', () => { _grpMembers.splice(removeIdx, 1); _renderMemberChips(); });
    span.appendChild(x);
  }
  return span;
}

function _addGroupMember() {
  const inp = el('grp-member-inp'); if (!inp) return;
  const v   = inp.value.trim();
  const me  = State.profile?.name || State.user?.name || 'Me';
  if (!v) return;
  if (_grpMembers.includes(v) || v.toLowerCase() === me.toLowerCase()) {
    el('grp-err') && (el('grp-err').textContent = 'Member already added.'); return;
  }
  _grpMembers.push(v);
  inp.value = '';
  el('grp-err') && (el('grp-err').textContent = '');
  _renderMemberChips();
}

function _saveGroup() {
  const name  = el('grp-name')?.value.trim();
  const emoji = el('grp-emoji')?.value.trim() || '👥';
  const err   = el('grp-err');
  if (!name) { if (err) err.textContent = 'Group name required.'; return; }
  const gid = Split.createGroup(name, emoji, _grpMembers);
  GroupModal.close();
  Toast.ok(`Group "${name}" created!`);
  Split.renderSplitPage();
}

// ─── Expense Modal (split) ────────────────────────────────────────
let _expGid = null, _expSplitType = 'equal';

export const ExpenseModal = {
  open(gid) {
    _expGid = gid;
    _expSplitType = 'equal';
    const d = Storage.getSplitData();
    const group = d.groups[gid]; if (!group) return;
    _setVal('exp-desc', ''); _setVal('exp-amt', '');
    _setVal('exp-date', today());
    el('exp-err') && (el('exp-err').textContent = '');
    const cur = el('exp-cur'); if (cur) cur.textContent = State.currency();
    const paidSel = el('exp-paid');
    if (paidSel) paidSel.innerHTML = group.members.map(m => `<option value="${esc(m.id)}">${esc(m.name)}${m.isMe ? ' (You)' : ''}</option>`).join('');
    document.querySelectorAll('#exp-split-tabs .split-tab').forEach(t => t.classList.toggle('on', t.dataset.t === 'equal'));
    _renderExpSplitDetail(group, 0);
    openModal('mo-exp');
    setTimeout(() => el('exp-desc')?.focus(), 80);
  },
  close() { closeModal('mo-exp'); },
};

function _renderExpSplitDetail(group, amt) {
  const c = el('exp-split-detail'); if (!c) return;
  const cu = State.currency();
  if (_expSplitType === 'equal') {
    const share = amt > 0 ? (amt / group.members.length).toFixed(2) : '—';
    c.textContent = `Each pays ${cu}${share} (${group.members.length} members)`;
    c.style.cssText = 'font-size:.75rem;color:var(--text-3);margin-top:6px';
    return;
  }
  // For non-equal types render input rows
  c.innerHTML = '';
  group.members.forEach(m => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'width:90px;flex-shrink:0;font-size:.8rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    lbl.textContent = m.name.slice(0, 12);
    row.appendChild(lbl);
    const wrap = document.createElement('div');
    wrap.className = 'amt-wrap';
    wrap.style.flex = '1';
    if (_expSplitType === 'percent') {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.inputMode = 'decimal';
      inp.className = 'amt-inp pct-inp';
      inp.dataset.mid = m.id; inp.dataset.mn = m.name;
      inp.placeholder = '0'; inp.style.cssText = 'padding:6px 8px;font-size:.875rem';
      inp.addEventListener('input', _updatePctSum);
      wrap.appendChild(inp);
      const pctLbl = document.createElement('span');
      pctLbl.className = 'amt-pfx';
      pctLbl.style.cssText = 'font-size:.75rem;padding:6px 8px;border-left:1px solid var(--border);border-right:none';
      pctLbl.textContent = '%';
      wrap.appendChild(pctLbl);
    } else {
      const pfx = document.createElement('span');
      pfx.className = 'amt-pfx'; pfx.textContent = cu; pfx.style.cssText = 'font-size:.75rem;padding:6px 8px';
      const inp = document.createElement('input');
      inp.type = 'text'; inp.inputMode = 'decimal';
      inp.className = 'amt-inp ex-inp';
      inp.dataset.mid = m.id; inp.dataset.mn = m.name;
      inp.placeholder = '0.00'; inp.style.cssText = 'padding:6px 8px;font-size:.875rem';
      inp.addEventListener('input', _updateExactSum);
      wrap.appendChild(pfx); wrap.appendChild(inp);
    }
    row.appendChild(wrap);
    c.appendChild(row);
  });
  if (_expSplitType === 'exact') {
    const sumDiv = document.createElement('div');
    sumDiv.id = 'exp-exact-sum'; sumDiv.style.cssText = 'font-size:.72rem;text-align:right;margin-top:5px;color:var(--text-3)';
    c.appendChild(sumDiv);
  } else {
    const sumDiv = document.createElement('div');
    sumDiv.id = 'exp-pct-sum'; sumDiv.style.cssText = 'font-size:.72rem;text-align:right;margin-top:5px;color:var(--text-3)';
    c.appendChild(sumDiv);
  }
}

function _updateExactSum() {
  const inputs = document.querySelectorAll('.ex-inp');
  const sum = [...inputs].reduce((s, i) => s + (+i.value || 0), 0);
  const total = +(el('exp-amt')?.value) || 0;
  const e = el('exp-exact-sum'); if (!e) return;
  const diff = Math.round((total - sum) * 100) / 100;
  e.textContent = `Sum: ${State.currency()}${sum.toFixed(2)} / ${State.currency()}${total.toFixed(2)}${Math.abs(diff) < 0.01 ? ' ✓' : ` (${diff > 0 ? '+' : ''}${diff.toFixed(2)} remaining)`}`;
  e.style.color = Math.abs(diff) < 0.01 ? 'var(--green)' : 'var(--red)';
}

function _updatePctSum() {
  const inputs = document.querySelectorAll('.pct-inp');
  const sum = [...inputs].reduce((s, i) => s + (+i.value || 0), 0);
  const e = el('exp-pct-sum'); if (!e) return;
  e.textContent = `Total: ${sum}%${Math.abs(sum - 100) < 0.01 ? ' ✓' : ' (must equal 100%)'}`;
  e.style.color = Math.abs(sum - 100) < 0.01 ? 'var(--green)' : 'var(--red)';
}

function _buildSplits(group) {
  if (_expSplitType === 'equal') return group.members.map(m => ({ memberId: m.id, name: m.name }));
  if (_expSplitType === 'exact') return [...document.querySelectorAll('.ex-inp')].map(i => ({ memberId: i.dataset.mid, name: i.dataset.mn, amount: +i.value || 0 }));
  if (_expSplitType === 'percent') return [...document.querySelectorAll('.pct-inp')].map(i => ({ memberId: i.dataset.mid, name: i.dataset.mn, pct: +i.value || 0 }));
  return [];
}

function _saveExpense() {
  const d = Storage.getSplitData();
  const group = d.groups[_expGid];
  const desc = el('exp-desc')?.value.trim();
  const amount = +(el('exp-amt')?.value);
  const date = el('exp-date')?.value;
  const paidBy = el('exp-paid')?.value;
  const err = el('exp-err');

  if (!desc)   { if (err) err.textContent = 'Description required.'; return; }
  if (!amount || amount <= 0) { if (err) err.textContent = 'Valid amount required.'; return; }
  if (!group)  { if (err) err.textContent = 'Group error.'; return; }

  if (_expSplitType === 'exact') {
    const splits = _buildSplits(group);
    const sum = splits.reduce((s, sp) => s + sp.amount, 0);
    if (Math.abs(sum - amount) > 0.02) { if (err) err.textContent = `Amounts must sum to ${State.currency()}${amount.toFixed(2)}. Got ${State.currency()}${sum.toFixed(2)}.`; return; }
  }
  if (_expSplitType === 'percent') {
    const splits = _buildSplits(group);
    const sum = splits.reduce((s, sp) => s + sp.pct, 0);
    if (Math.abs(sum - 100) > 0.01) { if (err) err.textContent = `Percentages must sum to 100%. Got ${sum}%.`; return; }
  }

  Split.addExpense(_expGid, { desc, amount, date, paidBy, splitType: _expSplitType, splits: _buildSplits(group) });
  ExpenseModal.close();
  Toast.ok('Expense added!');
  Split.renderSplitPage();
}

// ─── Settle Modal ─────────────────────────────────────────────────
let _settleData = null;

export const SettleModal = {
  open(gid, debt) {
    _settleData = { gid, debt };
    const body = el('settle-body'); if (!body) return;
    body.innerHTML = '';
    const p = document.createElement('p');
    p.style.marginBottom = '13px';
    p.innerHTML = `Record that <strong></strong> paid <strong></strong> to <strong></strong>?`;
    p.querySelectorAll('strong')[0].textContent = debt.fromName;
    p.querySelectorAll('strong')[1].textContent = State.currency() + debt.amount.toLocaleString('en-IN');
    p.querySelectorAll('strong')[2].textContent = debt.toName;
    body.appendChild(p);
    const frow = document.createElement('div');
    frow.className = 'frow';
    const lbl = document.createElement('label');
    lbl.className = 'flabel'; lbl.textContent = 'Note (optional)'; lbl.htmlFor = 'settle-note';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.id = 'settle-note'; inp.className = 'inp';
    inp.placeholder = 'UPI, Cash, Bank transfer...';
    frow.appendChild(lbl); frow.appendChild(inp);
    body.appendChild(frow);
    openModal('mo-settle');
    setTimeout(() => inp.focus(), 80);
  },
  close() { closeModal('mo-settle'); },
};

function _saveSettlement() {
  if (!_settleData) return;
  const { gid, debt } = _settleData;
  const note = el('settle-note')?.value.trim();
  Split.recordSettlement(gid, { fromId: debt.fromId, toId: debt.toId, amount: debt.amount, note });
  SettleModal.close();
  Toast.ok('Settlement recorded!');
  Split.renderSplitPage();
}

// ─── Global delegation ────────────────────────────────────────────
function _initDelegation() {
  document.addEventListener('click', e => {
    // Transaction row → edit
    const row = e.target.closest('.txn-item[data-tid]');
    const del = e.target.closest('[data-del]');
    if (del) { e.stopPropagation(); Txns.deleteTxn(del.dataset.del); return; }
    if (row && !e.target.closest('[data-del]')) {
      const txn = State.txns.find(t => String(t.id) === row.dataset.tid);
      if (txn) TxnModal.open(txn);
    }
  });

  // Keyboard undo
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault(); Txns.undo();
    }
  });
}

// ─── Initialize all events ────────────────────────────────────────
export function initEvents() {
  // Overlay + ESC close
  document.addEventListener('click',   _onOverlayClick);
  document.addEventListener('keydown', _onEscape);

  // Global delegation (txn rows, delete buttons)
  _initDelegation();

  // FAB + top add button
  el('add-btn')?.addEventListener('click',  () => TxnModal.open());
  el('fab')?.addEventListener('click',      () => TxnModal.open());

  // Txn modal
  el('tt-expense')?.addEventListener('click', () => _setTxnType('expense'));
  el('tt-income')?.addEventListener('click',  () => _setTxnType('income'));
  el('txn-save-btn')?.addEventListener('click', _saveTxn);
  el('txn-del-btn')?.addEventListener('click', () => { Txns.deleteTxn(_txnEditId); TxnModal.close(); });
  el('txn-recur')?.addEventListener('change', e => el('txn-recur-opts')?.classList.toggle('hidden', !e.target.checked));
  numSanitize(el('txn-amt'));

  // Budget modal
  el('bud-add-btn')?.addEventListener('click', () => BudgetModal.open());
  el('bud-save-btn')?.addEventListener('click', _saveBudget);
  numSanitize(el('bud-limit'));

  // Goal modal
  el('goal-add-btn')?.addEventListener('click', () => GoalModal.open());
  el('goal-save-btn')?.addEventListener('click', _saveGoal);
  el('goal-del-btn')?.addEventListener('click', () => { Goals.deleteGoal(_goalEditId); GoalModal.close(); });
  numSanitize(el('goal-target'));
  numSanitize(el('goal-saved'));

  // Progress modal
  el('prog-save-btn')?.addEventListener('click', _saveProgress);
  el('prog-saved')?.addEventListener('input', _updateProgBar);
  document.querySelectorAll('[data-qadd]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cur = parseFloat(el('prog-saved')?.value) || 0;
      _setVal('prog-saved', cur + +btn.dataset.qadd);
      _updateProgBar();
    });
  });
  numSanitize(el('prog-saved'));

  // Profile modal
  el('btn-edit-profile')?.addEventListener('click', () => ProfileModal.open());
  el('profile-save-btn')?.addEventListener('click', _saveProfile);

  // Split
  el('split-new-btn')?.addEventListener('click', () => GroupModal.open());
  el('grp-add-member')?.addEventListener('click', _addGroupMember);
  el('grp-member-inp')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); _addGroupMember(); } });
  el('grp-save-btn')?.addEventListener('click', _saveGroup);
  document.querySelectorAll('#exp-split-tabs .split-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      _expSplitType = tab.dataset.t;
      document.querySelectorAll('#exp-split-tabs .split-tab').forEach(t => t.classList.toggle('on', t === tab));
      const d = Storage.getSplitData();
      const group = _expGid ? d.groups[_expGid] : null;
      if (group) _renderExpSplitDetail(group, +(el('exp-amt')?.value) || 0);
    });
  });
  el('exp-amt')?.addEventListener('input', () => {
    const d = Storage.getSplitData();
    const group = _expGid ? d.groups[_expGid] : null;
    if (group) _renderExpSplitDetail(group, +(el('exp-amt')?.value) || 0);
    _updateExactSum(); 
  });
  el('exp-save-btn')?.addEventListener('click', _saveExpense);
  numSanitize(el('exp-amt'));
  el('settle-save-btn')?.addEventListener('click', _saveSettlement);

  // Data management
  el('btn-export')?.addEventListener('click', Txns.exportCSV);
  el('btn-import')?.addEventListener('change', e => Txns.importCSV(e.target.files?.[0]));
  el('btn-reset')?.addEventListener('click', () => {
    if (!confirm('Delete ALL financial data? Cannot be undone.')) return;
    Storage.resetUserData(State.uid);
    State.load(State.uid);
    Toast.ok('Data reset');
    State.updateAll();
  });

  // Sidebar user → profile
  el('sb-user-btn')?.addEventListener('click', () => {
    if (window.innerWidth <= 768) window.SidebarDrawer?.close();
    window.Router?.navigate('profile');
  });

  // Txn filter listeners
  Txns.initFilters();

  // Analytics filter
  Analytics.initAnalyticsFilters();

  // keyboard role=button support
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = document.activeElement;
    if (t?.getAttribute('role') === 'button' && !t.matches('button,a,input,select,textarea')) {
      e.preventDefault(); t.click();
    }
  });
}

// ─── Helpers ──────────────────────────────────────────────────────
function _setVal(id, v)         { const e = el(id); if (e) e.value = v; }
function _setChecked(id, v)     { const e = el(id); if (e) e.checked = v; }
