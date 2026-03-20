/**
 * features/split.js — Split expense manager
 *
 * Features:
 * - Group creation with members
 * - 4 split types: equal, exact, percent, shares
 * - Smart debt simplification (greedy algorithm)
 * - Balance tracking per member
 * - Settlement recording
 */

import State   from '../state.js';
import Storage from '../storage.js';
import { Toast, esc, el } from '../ui.js';

// ─── Internal helpers ──────────────────────────────────────────────
function _load()    { return Storage.getSplitData(); }
function _save(d)   { Storage.saveSplitData(d); }
function _myName()  { return State.profile?.name || State.user?.name || 'Me'; }

// ─── Group CRUD ────────────────────────────────────────────────────
export function createGroup(name, emoji, otherNames) {
  const d   = _load();
  const id  = Storage.nid('g');
  const me  = _myName();
  const all = [me, ...otherNames.filter(n => n && n.trim().toLowerCase() !== me.toLowerCase())];
  d.groups[id] = {
    id,
    name:      name.trim(),
    emoji:     emoji || '👥',
    members:   all.map(n => ({ id: Storage.nid('m'), name: n.trim(), isMe: n.trim() === me })),
    createdAt: new Date().toISOString(),
  };
  d.expenses[id]    = [];
  d.settlements[id] = [];
  _save(d);
  return id;
}

export function deleteGroup(gid) {
  const d = _load();
  delete d.groups[gid];
  delete d.expenses[gid];
  delete d.settlements[gid];
  _save(d);
}

// ─── Expense CRUD ──────────────────────────────────────────────────
export function addExpense(gid, { desc, amount, date, paidBy, splitType, splits }) {
  const d     = _load();
  if (!d.expenses[gid]) d.expenses[gid] = [];
  const total = Math.round(+amount * 100) / 100;
  const exp   = {
    id:         Storage.nid('e'),
    desc:       String(desc).trim(),
    amount:     total,
    date:       date || new Date().toISOString().slice(0, 10),
    paidBy,
    splitType,
    splits:     _normSplits(splits, total, splitType),
    createdAt:  new Date().toISOString(),
    addedBy:    _myName(),
  };
  d.expenses[gid].unshift(exp);
  _save(d);
  return exp.id;
}

export function deleteExpense(gid, eid) {
  const d = _load();
  d.expenses[gid] = (d.expenses[gid] || []).filter(e => e.id !== eid);
  _save(d);
}

/**
 * Normalize splits so amounts always sum to total with correct rounding.
 * First member absorbs any rounding difference (penny correction).
 */
function _normSplits(splits, total, type) {
  if (!splits?.length) return [];
  if (type === 'equal') {
    const n     = splits.length;
    const share = Math.round(total / n * 100) / 100;
    const diff  = Math.round((total - share * n) * 100) / 100;
    return splits.map((s, i) => ({ memberId: s.memberId, name: s.name, amount: i === 0 ? Math.round((share + diff) * 100) / 100 : share }));
  }
  if (type === 'percent') {
    return splits.map(s => ({ memberId: s.memberId, name: s.name, amount: Math.round(total * (+s.pct || 0) / 100 * 100) / 100, pct: +s.pct || 0 }));
  }
  if (type === 'shares') {
    const ts = splits.reduce((s, x) => s + (+x.shares || 1), 0);
    return splits.map(s => ({ memberId: s.memberId, name: s.name, amount: Math.round(total * (+s.shares || 1) / ts * 100) / 100, shares: +s.shares || 1 }));
  }
  // exact
  return splits.map(s => ({ memberId: s.memberId, name: s.name, amount: Math.round(+s.amount * 100) / 100 }));
}

// ─── Balance calculation ───────────────────────────────────────────
/**
 * Returns { [memberId]: { name, isMe, paid, owes, net } }
 * net > 0 = owed to this person
 * net < 0 = this person owes
 */
export function calcBal(gid) {
  const d     = _load();
  const group = d.groups[gid]; if (!group) return {};
  const bal   = {};
  group.members.forEach(m => { bal[m.id] = { name: m.name, isMe: !!m.isMe, paid: 0, owes: 0, net: 0 }; });
  (d.expenses[gid] || []).forEach(exp => {
    if (bal[exp.paidBy]) bal[exp.paidBy].paid += exp.amount;
    (exp.splits || []).forEach(s => { if (bal[s.memberId]) bal[s.memberId].owes += s.amount; });
  });
  (d.settlements[gid] || []).forEach(s => {
    if (bal[s.fromId]) bal[s.fromId].paid += s.amount;
    if (bal[s.toId])   bal[s.toId].owes   += s.amount;
  });
  Object.keys(bal).forEach(id => { bal[id].net = Math.round((bal[id].paid - bal[id].owes) * 100) / 100; });
  return bal;
}

/**
 * Greedy debt simplification — minimizes number of transactions.
 * Returns [{ fromId, fromName, toId, toName, amount }]
 */
export function simplifyDebts(gid) {
  const bal   = calcBal(gid);
  const cred  = [], debt = [];
  Object.entries(bal).forEach(([id, b]) => {
    if (b.net >  0.01) cred.push({ id, name: b.name, amount: b.net });
    if (b.net < -0.01) debt.push({ id, name: b.name, amount: -b.net });
  });
  cred.sort((a, b) => b.amount - a.amount);
  debt.sort((a, b) => b.amount - a.amount);
  const txns = [];
  let ci = 0, di = 0;
  while (ci < cred.length && di < debt.length) {
    const c = cred[ci], db = debt[di], amt = Math.min(c.amount, db.amount);
    if (amt > 0.01) txns.push({ fromId: db.id, fromName: db.name, toId: c.id, toName: c.name, amount: Math.round(amt * 100) / 100 });
    c.amount -= amt; db.amount -= amt;
    if (c.amount < 0.01) ci++;
    if (db.amount < 0.01) di++;
  }
  return txns;
}

export function recordSettlement(gid, { fromId, toId, amount, note }) {
  const d = _load();
  if (!d.settlements[gid]) d.settlements[gid] = [];
  d.settlements[gid].push({
    id:      Storage.nid('s'),
    fromId, toId,
    amount:  Math.round(+amount * 100) / 100,
    note:    note || '',
    date:    new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
  });
  _save(d);
}

export function myNetBalance() {
  const d = _load(); let total = 0;
  Object.keys(d.groups).forEach(gid => {
    const bal = calcBal(gid);
    const me  = Object.values(bal).find(b => b.isMe);
    if (me) total += me.net;
  });
  return Math.round(total * 100) / 100;
}

// ─── Page renderer ─────────────────────────────────────────────────
let _currentGid = null;

export function renderSplitPage() {
  _renderGroups();
  _renderDetail(_currentGid);
  _updateMyBal();
}

function _updateMyBal() {
  const e = el('sp-my-bal'); if (!e) return;
  const net = myNetBalance(), c = State.currency();
  if (Math.abs(net) < 0.01) {
    e.textContent = 'All settled up ✓';
    e.style.color = 'var(--text-3)';
  } else if (net > 0) {
    e.innerHTML = `You are owed <strong style="color:var(--green)">${c}${Math.abs(net).toLocaleString('en-IN')}</strong>`;
  } else {
    e.innerHTML = `You owe <strong style="color:var(--red)">${c}${Math.abs(net).toLocaleString('en-IN')}</strong>`;
  }
}

function _renderGroups() {
  const c = el('sp-groups'), cnt = el('sp-grp-cnt'); if (!c) return;
  const d = _load(), entries = Object.values(d.groups);
  if (cnt) cnt.textContent = entries.length + ' group' + (entries.length !== 1 ? 's' : '');

  if (!entries.length) {
    c.innerHTML = '<div style="padding:32px 14px;text-align:center"><div style="font-size:2rem;margin-bottom:8px">👥</div><div class="semi sm">No groups yet</div><p class="xs muted" style="margin-top:4px">Create one to start splitting</p></div>';
    return;
  }

  c.innerHTML = '';
  entries.forEach(g => {
    const bal  = calcBal(g.id);
    const me   = Object.values(bal).find(b => b.isMe);
    const net  = me ? me.net : 0;
    const cu   = State.currency();
    const pill = Math.abs(net) < 0.01
      ? '<span class="badge badge-n">Settled</span>'
      : net > 0
        ? `<span class="badge badge-g">+${cu}${Math.abs(net).toLocaleString('en-IN')}</span>`
        : `<span class="badge badge-r">-${cu}${Math.abs(net).toLocaleString('en-IN')}</span>`;

    const item = document.createElement('div');
    item.className = 'grp-item' + (_currentGid === g.id ? ' on' : '');
    item.dataset.gid = g.id;
    item.innerHTML = `<div class="grp-av"></div>
      <div style="flex:1;min-width:0">
        <div class="semi sm trunc"></div>
        <div class="xs muted"></div>
      </div>${pill}`;
    item.querySelector('.grp-av').textContent = g.emoji;
    item.querySelectorAll('.semi.sm.trunc')[0].textContent = g.name;
    item.querySelectorAll('.xs.muted')[0].textContent = `${g.members.length} members · ${(d.expenses[g.id] || []).length} expenses`;

    const go = () => { _currentGid = g.id; renderSplitPage(); };
    item.addEventListener('click', go);
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    item.tabIndex = 0;
    c.appendChild(item);
  });
}

function _renderDetail(gid) {
  const c = el('sp-detail'); if (!c) return;
  if (!gid) {
    c.innerHTML = '<div class="card" style="padding:56px 20px;text-align:center"><div style="font-size:2.5rem;margin-bottom:10px">💸</div><div class="semi" style="font-size:.9375rem;margin-bottom:5px">Select a group</div><p class="sm muted">Choose from the left or create a new group.</p></div>';
    return;
  }
  const d = _load(), group = d.groups[gid];
  if (!group) { _currentGid = null; _renderDetail(null); return; }

  const exps  = d.expenses[gid] || [];
  const bal   = calcBal(gid);
  const debts = simplifyDebts(gid);
  const cu    = State.currency();
  const total = exps.reduce((s, e) => s + e.amount, 0);

  c.innerHTML = '';

  // Header card
  const header = document.createElement('div');
  header.className = 'card';
  header.style.marginBottom = '12px';
  header.innerHTML = `<div class="card-b">
    <div style="display:flex;align-items:center;gap:11px;margin-bottom:11px">
      <div class="grp-av" style="width:46px;height:46px;font-size:1.375rem"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:1.0625rem;font-weight:700"></div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:5px" class="members-wrap"></div>
      </div>
      <button class="btn btn-primary btn-sm add-exp-btn">+ Add</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px;padding-top:11px;border-top:1px solid var(--border)">
      <div><div class="stat-lbl">Spent</div><div class="stat-val mono" style="font-size:.975rem"></div></div>
      <div><div class="stat-lbl">Expenses</div><div class="stat-val mono" style="font-size:.975rem">${exps.length}</div></div>
      <div><div class="stat-lbl">Pending</div><div class="stat-val mono c-red" style="font-size:.975rem">${debts.length}</div></div>
    </div>
  </div>`;
  header.querySelector('.grp-av').textContent = group.emoji;
  header.querySelectorAll('[style*="1.0625rem"]')[0].textContent = group.name;
  header.querySelectorAll('.stat-val.mono')[0].textContent = cu + total.toLocaleString('en-IN');
  group.members.forEach(m => {
    const chip = document.createElement('span');
    chip.className = 'mem-chip';
    chip.innerHTML = `<span class="mem-av"></span>`;
    chip.querySelector('.mem-av').textContent = m.name[0].toUpperCase();
    chip.appendChild(document.createTextNode(m.name + (m.isMe ? ' (You)' : '')));
    header.querySelector('.members-wrap').appendChild(chip);
  });
  header.querySelector('.add-exp-btn').addEventListener('click', () => ExpenseModal.open(gid));
  c.appendChild(header);

  // Balances
  const balCard = document.createElement('div');
  balCard.className = 'card';
  balCard.style.marginBottom = '12px';
  balCard.innerHTML = '<div class="card-h"><div class="card-t">Member Balances</div></div><div class="card-b" style="padding:6px 14px" id="bal-rows"></div>';
  c.appendChild(balCard);
  const balRows = balCard.querySelector('#bal-rows');
  Object.entries(bal).forEach(([id, b]) => {
    const ns  = b.net >= 0 ? `+${cu}${b.net.toLocaleString('en-IN')}` : `-${cu}${Math.abs(b.net).toLocaleString('en-IN')}`;
    const pc  = b.net > 0.01 ? 'bp-pos' : b.net < -0.01 ? 'bp-neg' : 'bp-zero';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid var(--border)';
    row.innerHTML = `<div class="mem-av" style="width:28px;height:28px;font-size:.7rem;flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div class="semi" style="font-size:.8rem"></div>
        <div class="xs muted"></div>
      </div>
      <span class="bal-pill ${pc}"></span>`;
    row.querySelector('.mem-av').textContent = b.name[0].toUpperCase();
    row.querySelectorAll('.semi')[0].textContent = b.name + (b.isMe ? ' (You)' : '');
    row.querySelector('.xs.muted').textContent = `Paid ${cu}${b.paid.toLocaleString('en-IN')} · Owes ${cu}${b.owes.toLocaleString('en-IN')}`;
    row.querySelector('.bal-pill').textContent = ns;
    balRows.appendChild(row);
  });

  // Settle up
  if (debts.length) {
    const settleCard = document.createElement('div');
    settleCard.className = 'card';
    settleCard.style.marginBottom = '12px';
    settleCard.innerHTML = `<div class="card-h"><div class="card-t">Settle Up</div><span class="badge badge-r">${debts.length} pending</span></div><div class="card-b" style="padding:10px 14px" id="debt-rows"></div>`;
    c.appendChild(settleCard);
    const debtRows = settleCard.querySelector('#debt-rows');
    debts.forEach(t => {
      const row = document.createElement('div');
      row.className = 'debt-row ' + (t.fromName === _myName() ? 'owe' : 'owed');
      row.style.marginBottom = '5px';
      row.innerHTML = `<div class="mem-av" style="width:30px;height:30px;font-size:.7rem"></div>
        <div style="flex:1;min-width:0">
          <div class="semi" style="font-size:.8rem"></div>
          <div class="mono bold c-red"></div>
        </div>
        <button class="btn btn-primary btn-sm">Settle</button>`;
      row.querySelector('.mem-av').textContent = t.fromName[0].toUpperCase();
      row.querySelectorAll('.semi')[0].textContent = `${t.fromName} → ${t.toName}`;
      row.querySelector('.mono.bold').textContent = cu + t.amount.toLocaleString('en-IN');
      row.querySelector('.btn').addEventListener('click', () => SettleModal.open(gid, t));
      debtRows.appendChild(row);
    });
  }

  // Expense history
  const expCard = document.createElement('div');
  expCard.className = 'card';
  expCard.innerHTML = `<div class="card-h"><div class="card-t">Expenses</div><button class="btn btn-danger btn-xs del-grp-btn">Delete Group</button></div><div class="card-b np" id="exp-rows"></div>`;
  expCard.querySelector('.del-grp-btn').addEventListener('click', () => {
    if (confirm(`Delete "${group.name}"? This cannot be undone.`)) { deleteGroup(gid); _currentGid = null; Toast.ok('Group deleted'); renderSplitPage(); }
  });
  c.appendChild(expCard);

  const expRows = expCard.querySelector('#exp-rows');
  if (!exps.length) {
    expRows.innerHTML = '<div style="text-align:center;padding:28px;color:var(--text-3);font-size:.8rem">No expenses yet</div>';
  } else {
    exps.forEach(exp => {
      const payer = group.members.find(m => m.id === exp.paidBy);
      const row   = document.createElement('div');
      row.className = 'exp-row';
      row.innerHTML = `<div style="flex:1;min-width:0">
        <div class="semi trunc" style="font-size:.8125rem"></div>
        <div class="xs muted"></div>
      </div>
      <div style="text-align:right;flex-shrink:0;margin-left:10px">
        <div class="mono bold"></div>
        <button class="ico-btn del-exp-btn" style="width:22px;height:22px;color:var(--red);margin-top:2px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </div>`;
      row.querySelector('.semi.trunc').textContent = exp.desc;
      row.querySelector('.xs.muted').textContent   = `${exp.date} · Paid by ${payer?.name || '?'}`;
      row.querySelector('.mono.bold').textContent  = cu + exp.amount.toLocaleString('en-IN');
      row.querySelector('.del-exp-btn').addEventListener('click', e => {
        e.stopPropagation();
        if (confirm('Delete expense?')) { deleteExpense(gid, exp.id); Toast.ok('Deleted'); renderSplitPage(); }
      });
      expRows.appendChild(row);
    });
  }
}
