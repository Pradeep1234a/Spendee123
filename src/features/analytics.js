/**
 * features/analytics.js — Charts and analytics rendering
 *
 * All Chart.js instances are managed here.
 * Charts are lazy-loaded (Chart.js CDN only fetched when needed).
 */

import State from '../state.js';
import { loadCharts, esc, pct, clamp, fmtMonth, progColor, getCat, emptyState, el } from '../ui.js';

let _charts = { pie: null, trend: null };
let _month  = null;  // null = all time
const PAL   = ['#1b4332','#2d6a4f','#52b788','#95d5b2','#b7e4c7','#74c69d','#40916c','#d8f3dc','#1b4332','#52b788'];

export function renderAnalyticsPage() {
  _buildStrip();
  _renderKPI();
  loadCharts(() => { _renderPie(); _renderTrend(); });
  _renderBreakdown();
  _renderDOW();
  _renderHeatmap();
}

// ─── Period strip ─────────────────────────────────────────────────
function _buildStrip() {
  const c = el('an-month-strip'); if (!c) return;
  const months = State.trend(6).map(m => m.month).reverse();
  c.innerHTML = '';

  const allChip = _makeChip('All', '', !_month);
  c.appendChild(allChip);
  months.forEach(m => {
    const [y, mo] = m.split('-');
    const label = new Date(+y, +mo - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
    c.appendChild(_makeChip(label, m, _month === m));
  });
}

function _makeChip(label, value, active) {
  const div = document.createElement('div');
  div.className = 'month-chip' + (active ? ' on' : '');
  div.textContent = label;
  div.addEventListener('click', () => {
    _month = value || null;
    const lbl = el('an-period-lbl');
    if (lbl) lbl.textContent = _month ? fmtMonth(_month) : 'All time';
    _buildStrip();
    _renderKPI();
    loadCharts(() => _renderPie());
    _renderBreakdown();
  });
  return div;
}

// ─── KPI ──────────────────────────────────────────────────────────
function _renderKPI() {
  const txns = _month ? State.moTxns(_month) : State.txns;
  const inc  = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const exp  = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const net  = inc - exp;
  const r    = inc > 0 ? Math.min(100, Math.max(0, Math.round(net / inc * 100))) : 0;

  const se = (id, v) => { const e = el(id); if (e) e.textContent = v; };
  se('an-inc',  State.fmt(inc));
  se('an-exp',  State.fmt(exp));
  se('an-net',  State.fmt(net));
  se('an-rate', r + '%');
}

// ─── Pie chart ────────────────────────────────────────────────────
function _renderPie() {
  if (_charts.pie) { try { _charts.pie.destroy(); } catch (_) {} _charts.pie = null; }
  const wrap = el('pie-wrap'); if (!wrap) return;

  let canvas = wrap.querySelector('canvas');
  if (!canvas) { wrap.innerHTML = '<canvas id="chart-pie"></canvas>'; canvas = wrap.querySelector('canvas'); }

  const txns   = (_month ? State.moTxns(_month) : State.txns).filter(t => t.type === 'expense');
  const totals = {};
  txns.forEach(t => { totals[t.category] = (totals[t.category] || 0) + t.amount; });
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const total  = sorted.reduce((s, [, v]) => s + v, 0);

  const pt = el('pie-total'); if (pt) pt.textContent = State.fmt(total);

  if (!sorted.length) {
    wrap.innerHTML = '<div style="font-size:.8rem;color:var(--text-3);text-align:center;padding:60px 0">No expenses</div>';
    const leg = el('pie-legend'); if (leg) leg.innerHTML = '';
    return;
  }

  try {
    _charts.pie = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels:   sorted.map(([k]) => getCat(k).l),
        datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: PAL, borderWidth: 2, borderColor: 'var(--surface)', hoverOffset: 6 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${State.fmt(ctx.raw)} (${pct(ctx.raw, total)}%)` } },
        },
      },
    });
  } catch (e) { console.error('[Analytics] pie chart error:', e); }

  // Legend
  const leg = el('pie-legend');
  if (leg) {
    leg.innerHTML = '';
    sorted.forEach(([cat, amt], i) => {
      const row = document.createElement('div');
      row.className = 'leg-row';
      row.innerHTML = `<span class="leg-dot" style="background:${PAL[i % PAL.length]}"></span>
        <span class="leg-lbl"></span>
        <span class="leg-amt mono"></span>
        <span class="leg-pct muted xs"></span>`;
      row.querySelector('.leg-lbl').textContent = `${getCat(cat).e} ${getCat(cat).l}`;
      row.querySelector('.leg-amt').textContent = State.fmt(amt);
      row.querySelector('.leg-pct').textContent = pct(amt, total) + '%';
      leg.appendChild(row);
    });
  }
}

// ─── Trend chart ──────────────────────────────────────────────────
function _renderTrend() {
  if (_charts.trend) { try { _charts.trend.destroy(); } catch (_) {} _charts.trend = null; }
  const ctx = el('chart-trend')?.getContext('2d');
  if (!ctx || typeof Chart === 'undefined') return;
  const data = State.trend(6);
  try {
    _charts.trend = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(m => m.label),
        datasets: [
          { label: 'Income',  data: data.map(m => m.income),  backgroundColor: 'rgba(27,67,50,.8)', borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: false },
          { label: 'Expense', data: data.map(m => m.expense), backgroundColor: 'rgba(192,57,43,.7)', borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: false },
          { label: 'Net', data: data.map(m => m.income - m.expense), type: 'line', borderColor: 'rgba(82,183,136,.9)', backgroundColor: 'transparent', borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: 'rgba(82,183,136,.9)', tension: .3, yAxisID: 'y' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, padding: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${State.fmt(ctx.raw)}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { grid: { color: 'rgba(0,0,0,.04)' }, ticks: { font: { size: 10 }, callback: v => State.currency() + v.toLocaleString('en-IN') } },
        },
      },
    });
  } catch (e) { console.error('[Analytics] trend chart error:', e); }
}

// ─── Category breakdown bars ──────────────────────────────────────
let _sort = 'amt';

export function setBreakdownSort(sort) { _sort = sort; _renderBreakdown(); }

function _renderBreakdown() {
  const c = el('cat-breakdown'); if (!c) return;
  const txns   = (_month ? State.moTxns(_month) : State.txns).filter(t => t.type === 'expense');
  const totals = {};
  txns.forEach(t => { totals[t.category] = (totals[t.category] || 0) + t.amount; });
  let sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (_sort === 'name') sorted.sort((a, b) => getCat(a[0]).l.localeCompare(getCat(b[0]).l));
  const total = sorted.reduce((s, [, v]) => s + v, 0);

  if (!sorted.length) { c.innerHTML = '<p style="font-size:.8rem;color:var(--text-3);padding:14px 0">No expenses in this period.</p>'; return; }

  const frag = document.createDocumentFragment();
  sorted.forEach(([cat, amt], i) => {
    const p   = pct(amt, total), cc = getCat(cat);
    const bl  = +(typeof State.budgets[cat] === 'object' ? State.budgets[cat]?.limit : State.budgets[cat]) || 0;
    const bp  = bl > 0 ? pct(amt, bl) : null;
    const row = document.createElement('div');
    row.className = 'cat-bk-row';
    row.style.animationDelay = (i * 25) + 'ms';
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <div style="width:26px;height:26px;background:${cc.bg};font-size:.8rem;border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${cc.e}</div>
        <div style="flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span class="cat-name semi" style="font-size:.8rem"></span>
          <div style="display:flex;align-items:center;gap:7px;flex-shrink:0">
            ${bp !== null ? `<span class="badge ${bp >= 100 ? 'badge-r' : bp >= 80 ? 'badge-y' : 'badge-g'}" style="font-size:.58rem">${bp}% of budget</span>` : ''}
            <span class="cat-amt mono bold" style="font-size:.8rem"></span>
            <span class="cat-pct muted" style="font-size:.68rem;min-width:28px;text-align:right">${p}%</span>
          </div>
        </div>
      </div>
      <div style="height:7px;background:var(--surface-3);border-radius:99px;overflow:hidden">
        <div style="height:100%;width:${p}%;background:${PAL[i % PAL.length]};border-radius:99px;transition:width .5s var(--spring)"></div>
      </div>`;
    row.querySelector('.cat-name').textContent = cc.l;
    row.querySelector('.cat-amt').textContent  = State.fmt(amt);
    frag.appendChild(row);
  });
  c.innerHTML = '';
  c.appendChild(frag);
}

// ─── Day of week ──────────────────────────────────────────────────
function _renderDOW() {
  const c = el('an-dow'); if (!c) return;
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const totals = [0,0,0,0,0,0,0], counts = [0,0,0,0,0,0,0];
  State.txns.filter(t => t.type === 'expense' && t.date).forEach(t => {
    const d = new Date(t.date + 'T00:00:00').getDay();
    totals[d] += t.amount; counts[d]++;
  });
  const avgs  = totals.map((v, i) => counts[i] ? v / counts[i] : 0);
  const mx    = Math.max(...avgs, 1);
  const today = new Date().getDay();
  c.innerHTML = '<div style="display:flex;align-items:flex-end;gap:5px;height:78px;padding-bottom:2px">' +
    avgs.map((avg, i) => {
      const h = Math.max(4, Math.round(avg / mx * 66)), isT = i === today;
      const div = document.createElement('div');
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
        <div class="mono" style="font-size:.56rem;color:var(--text-3)">${avg > 0 ? State.currency() + Math.round(avg).toLocaleString('en-IN', { notation: 'compact' }) : '–'}</div>
        <div style="width:100%;height:${h}px;background:${isT ? 'var(--brand)' : 'var(--brand-pale)'};border-radius:4px 4px 2px 2px"></div>
        <div style="font-size:.62rem;font-weight:${isT ? 700 : 500};color:${isT ? 'var(--brand)' : 'var(--text-3)'}">${DAYS[i]}</div>
      </div>`;
    }).join('') + '</div>';
}

// ─── Heatmap ──────────────────────────────────────────────────────
function _renderHeatmap() {
  const c = el('heatmap'); if (!c) return;
  const mo = _month || State.thisMonth();
  const [y, m] = mo.split('-');
  const days = new Date(+y, +m, 0).getDate();
  const lbl = el('hm-lbl'); if (lbl) lbl.textContent = fmtMonth(mo);
  const daily = {};
  State.moTxns(mo).filter(t => t.type === 'expense').forEach(t => {
    const d = t.date?.split('-')[2]; if (d) daily[d] = (daily[d] || 0) + t.amount;
  });
  const mx = Math.max(...Object.values(daily), 1);
  const cells = [];
  for (let d = 1; d <= days; d++) {
    const k = String(d).padStart(2, '0'), v = daily[k] || 0;
    const alpha = v > 0 ? 0.15 + (v / mx) * 0.85 : 0.05;
    const color = v > 0 ? `rgba(27,67,50,${alpha.toFixed(2)})` : 'var(--surface-3)';
    cells.push(`<div class="hm-cell" style="background:${color}" title="${y}-${m}-${k}: ${v > 0 ? State.fmt(v) : 'No expenses'}"></div>`);
  }
  const cols = [];
  for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));
  c.innerHTML = '<div class="hm-grid">' + cols.map(col => `<div class="hm-col">${col.join('')}</div>`).join('') + '</div>';
}

export function initAnalyticsFilters() {
  el('cat-sort')?.addEventListener('change', e => setBreakdownSort(e.target.value));
}
