/**
 * features/budgets.js — Budget management
 */

import State   from '../state.js';
import Storage from '../storage.js';
import { Toast, esc, pct, clamp, progColor, catOpts, getCat, emptyState, el, fmtMonth } from '../ui.js';

export function saveBudget(category, limit) {
  if (!category)       { Toast.err('Select a category'); return false; }
  if (!limit || limit <= 0) { Toast.err('Enter a valid limit'); return false; }
  const buds = { ...State.budgets };
  buds[category] = { limit: Math.round(parseFloat(limit) * 100) / 100 };
  Storage.saveBudgets(State.uid, buds);
  State.updateAll();
  Toast.ok('Budget saved');
  return true;
}

export function deleteBudget(category) {
  const buds = { ...State.budgets };
  delete buds[category];
  Storage.saveBudgets(State.uid, buds);
  State.updateAll();
  Toast.ok('Budget removed');
}

export function renderBudgetsPage() {
  const mo = State.thisMonth();
  const lbl = el('bud-month');
  if (lbl) lbl.textContent = fmtMonth(mo);
  _renderHero();
  _renderList();
}

function _getLimit(b) { return +(typeof b === 'object' ? b.limit : b) || 0; }

function _renderHero() {
  const cs      = State.catSpend();
  const entries = Object.entries(State.budgets);
  const total   = entries.reduce((s, [, b]) => s + _getLimit(b), 0);
  const spent   = entries.reduce((s, [cat]) => s + (cs[cat] || 0), 0);
  const p       = pct(spent, total);

  const setV = (id, v) => { const e = el(id); if (e) e.textContent = v; };
  setV('bh-total', State.fmt(total));
  setV('bh-spent', State.fmt(spent));
  setV('bh-rem',   State.fmt(Math.max(0, total - spent)));
  setV('bh-cats',  entries.length);
  setV('bh-pct',   p + '%');

  const bar = el('bh-bar');
  if (bar) { bar.style.width = clamp(p, 0, 100) + '%'; bar.className = 'prog-fill ' + progColor(p); }
}

function _ringSVG(p, color) {
  const r = 23, circ = 2 * Math.PI * r, d = Math.min(100, p) / 100 * circ;
  return `<svg width="54" height="54" viewBox="0 0 54 54" style="flex-shrink:0;transform:rotate(-90deg)">
    <circle cx="27" cy="27" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="5"/>
    <circle cx="27" cy="27" r="${r}" fill="none" stroke="${color}" stroke-width="5"
      stroke-dasharray="${d.toFixed(1)} ${(circ - d).toFixed(1)}" stroke-linecap="round"
      style="transition:stroke-dasharray .5s var(--spring)"/>
  </svg>`;
}

function _sparkSVG(cat) {
  const W = 70, H = 22, daily = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    daily.push(State.txns.filter(t => t.type === 'expense' && t.category === cat && t.date === k).reduce((s, t) => s + t.amount, 0));
  }
  const mx = Math.max(...daily, 1), bw = Math.floor(W / 7) - 1;
  const bars = daily.map((v, i) => {
    const h = Math.max(2, Math.round(v / mx * H));
    return `<rect x="${i * (bw + 1)}" y="${H - h}" width="${bw}" height="${h}" rx="1" fill="${v > 0 ? 'var(--brand-light)' : 'var(--surface-3)'}" opacity="${v > 0 ? '0.85' : '0.4'}"/>`;
  }).join('');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;flex-shrink:0">${bars}</svg>`;
}

function _renderList() {
  const c = el('bud-list'); if (!c) return;
  const bs = State.budgets, cs = State.catSpend();
  const entries = Object.entries(bs);
  if (!entries.length) {
    c.innerHTML = emptyState({ icon: '💰', title: 'No budgets set', text: 'Set monthly spending limits per category.', action: '<button class="btn btn-primary btn-sm" onclick="window.BudgetModal?.open()">Add Budget</button>' });
    return;
  }
  const sorted = entries.slice().sort((a, b) => pct(cs[b[0]] || 0, _getLimit(b[1])) - pct(cs[a[0]] || 0, _getLimit(a[1])));
  const frag = document.createDocumentFragment();
  sorted.forEach(([cat, b]) => {
    const lim = _getLimit(b), sp = cs[cat] || 0, p = pct(sp, lim), ov = p >= 100, wn = p >= 80 && !ov;
    const cc = getCat(cat), clr = ov ? 'var(--red)' : wn ? 'var(--yellow)' : 'var(--brand-light)';
    const card = document.createElement('div');
    card.className = 'bud-card ' + (ov ? 'over' : wn ? 'warn' : '');
    card.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px">
        <div style="position:relative;flex-shrink:0">${_ringSVG(p, clr)}
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">
            <div class="mono bold" style="font-size:.62rem;color:${clr}">${p}%</div>
          </div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">
            <span style="width:16px;height:16px;background:${cc.bg};font-size:.62rem;border-radius:4px;display:inline-flex;align-items:center;justify-content:center">${cc.e}</span>
            <span class="trunc semi" style="font-size:.8rem"></span>
          </div>
          <div class="mono bold" style="font-size:.975rem"></div>
          <div style="font-size:.68rem;color:var(--text-3)"></div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px">
        <span style="font-size:.68rem;color:var(--text-3)">7-day</span>${_sparkSVG(cat)}
      </div>
      <div class="prog" style="height:5px;margin-bottom:7px">
        <div class="prog-fill ${progColor(p)}" style="width:${clamp(p, 0, 100)}%"></div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:4px">
        <button class="btn btn-ghost btn-xs edit-bud-btn">Edit</button>
        <button class="btn btn-danger btn-xs del-bud-btn">Remove</button>
      </div>`;
    // Safe text assignment
    card.querySelectorAll('.trunc.semi')[0].textContent = cc.l;
    card.querySelectorAll('.mono.bold')[0].textContent  = State.fmt(sp);
    card.querySelectorAll('[style*="68rem;color:var(--text-3)"]')[0].textContent = `of ${State.fmt(lim)}`;
    card.querySelector('.edit-bud-btn').addEventListener('click', () => window.BudgetModal?.open(cat, lim));
    card.querySelector('.del-bud-btn').addEventListener('click',  () => deleteBudget(cat));
    frag.appendChild(card);
  });
  const grid = document.createElement('div');
  grid.className = 'bud-grid';
  grid.appendChild(frag);
  c.innerHTML = '';
  c.appendChild(grid);
}
