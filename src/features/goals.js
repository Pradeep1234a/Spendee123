/**
 * features/goals.js — Savings goals management
 */

import State   from '../state.js';
import Storage from '../storage.js';
import { Toast, esc, pct, clamp, emptyState, el } from '../ui.js';

export function saveGoal(payload, editId = null) {
  if (!payload.name?.trim())                { Toast.err('Goal name required'); return false; }
  if (!payload.target || payload.target <= 0) { Toast.err('Enter a valid target amount'); return false; }

  const goal = {
    id:       editId || Storage.nid('g'),
    emoji:    (payload.emoji || '🎯').trim().slice(0, 4),
    name:     payload.name.trim().slice(0, 80),
    target:   Math.round(parseFloat(payload.target) * 100) / 100,
    saved:    Math.round(parseFloat(payload.saved || 0) * 100) / 100,
    deadline: payload.deadline || null,
    createdAt: new Date().toISOString(),
  };

  const goals = State.goals.slice();
  if (editId) {
    const idx = goals.findIndex(g => String(g.id) === String(editId));
    if (idx >= 0) goals[idx] = { ...goals[idx], ...goal };
  } else {
    goals.push(goal);
  }
  Storage.saveGoals(State.uid, goals);
  State.updateAll();
  Toast.ok(editId ? 'Goal updated' : 'Goal created');
  return true;
}

export function updateGoalProgress(id, newSaved) {
  if (isNaN(parseFloat(newSaved)) || parseFloat(newSaved) < 0) {
    Toast.err('Enter a valid amount'); return false;
  }
  const goals = State.goals.map(g =>
    String(g.id) === String(id)
      ? { ...g, saved: Math.round(parseFloat(newSaved) * 100) / 100 }
      : g
  );
  Storage.saveGoals(State.uid, goals);
  State.updateAll();
  Toast.ok('Progress updated');
  return true;
}

export function deleteGoal(id) {
  const goals = State.goals.filter(g => String(g.id) !== String(id));
  Storage.saveGoals(State.uid, goals);
  State.updateAll();
  Toast.ok('Goal deleted');
}

export function renderGoalsPage() {
  const c = el('goals-list'); if (!c) return;
  if (!State.goals.length) {
    c.innerHTML = emptyState({ icon: '🎯', title: 'No goals yet', text: 'Create a savings target to start tracking.', action: '<button class="btn btn-primary btn-sm" onclick="GoalModal.open()">New Goal</button>' });
    return;
  }

  const frag = document.createDocumentFragment();
  State.goals.forEach(g => {
    const p     = pct(g.saved || 0, g.target);
    const done  = p >= 100;
    const cleft = g.deadline ? Math.ceil((new Date(g.deadline) - new Date()) / 864e5) : null;

    const card = document.createElement('div');
    card.className = 'goal-card';
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div style="font-size:1.625rem"></div>
        <div style="flex:1;min-width:0">
          <div class="trunc semi" style="font-size:.9375rem"></div>
          ${cleft !== null ? `<div class="deadline-lbl" style="font-size:.69rem;color:${cleft < 7 ? 'var(--red)' : 'var(--text-3)'}"></div>` : ''}
        </div>
        ${done ? '<span class="badge badge-g">Done!</span>' : ''}
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:5px">
        <span style="font-size:.75rem;color:var(--text-3)">Saved</span>
        <span class="goal-amt mono bold" style="font-size:.8125rem"></span>
      </div>
      <div class="prog mb12" style="height:9px">
        <div class="prog-fill b" style="width:${clamp(p, 0, 100)}%"></div>
      </div>
      <div style="display:flex;gap:6px;justify-content:flex-end">
        <button class="btn btn-ghost btn-sm prog-btn">Update Progress</button>
        <button class="btn btn-ghost btn-sm edit-btn">Edit</button>
      </div>`;

    // Safe text
    card.querySelectorAll('[style*="1.625rem"]')[0].textContent = g.emoji || '🎯';
    card.querySelector('.trunc.semi').textContent = g.name;
    const dl = card.querySelector('.deadline-lbl');
    if (dl) dl.textContent = cleft > 0 ? `${cleft} days left` : cleft === 0 ? 'Today!' : 'Overdue';
    card.querySelector('.goal-amt').textContent = `${State.fmt(g.saved || 0)} / ${State.fmt(g.target)}`;

    card.querySelector('.prog-btn').addEventListener('click', () => window.ProgModal?.open(g.id));
    card.querySelector('.edit-btn').addEventListener('click', () => window.GoalModal?.open(g));

    frag.appendChild(card);
  });

  const grid = document.createElement('div');
  grid.className = 'goals-grid';
  grid.appendChild(frag);
  c.innerHTML = '';
  c.appendChild(grid);
}
