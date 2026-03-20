/**
 * seed.js — Demo / sample data loader
 *
 * Injects realistic sample transactions, budgets, and goals
 * for a demo user so the app looks populated on first launch.
 *
 * Usage:
 *   import { seedDemoData } from './seed.js';
 *   seedDemoData();  // safe to call — skips if data already exists
 */

import Storage from './storage.js';

export const DEMO_EMAIL = 'demo@spendee.app';
export const DEMO_UID   = btoa(DEMO_EMAIL).replace(/=/g, '');
const DEMO_USER  = { uid: DEMO_UID, email: DEMO_EMAIL, name: 'Demo User', pwd: btoa('demo123') };

/** Creates the demo account and seeds all data. Returns the uid. */
export function seedDemoData() {
  const users = Storage.getUsers();

  // Already seeded
  if (users[DEMO_UID] && Storage.getTransactions(DEMO_UID).length > 5) {
    return DEMO_UID;
  }

  // Register demo user
  users[DEMO_UID] = DEMO_USER;
  Storage.saveUsers(users);

  // Profile
  Storage.saveProfile(DEMO_UID, { name: 'Demo User', currency: '₹' });

  // Transactions — 3 months of realistic data
  const txns = _buildTransactions();
  Storage.saveTransactions(DEMO_UID, txns);

  // Budgets
  Storage.saveBudgets(DEMO_UID, {
    food:          { limit: 8000 },
    transport:     { limit: 3000 },
    shopping:      { limit: 5000 },
    bills:         { limit: 4000 },
    entertainment: { limit: 2000 },
    health:        { limit: 2500 },
  });

  // Goals
  Storage.saveGoals(DEMO_UID, [
    { id: 'g1', emoji: '🏠', name: 'House Down Payment', target: 500000, saved: 125000, deadline: _futureDate(18), createdAt: new Date().toISOString() },
    { id: 'g2', emoji: '✈️', name: 'Europe Trip',         target: 80000,  saved: 32000,  deadline: _futureDate(8),  createdAt: new Date().toISOString() },
    { id: 'g3', emoji: '🚗', name: 'New Car',              target: 200000, saved: 45000,  deadline: _futureDate(24), createdAt: new Date().toISOString() },
    { id: 'g4', emoji: '📚', name: 'Emergency Fund',       target: 60000,  saved: 60000,  deadline: null,            createdAt: new Date().toISOString() },
  ]);

  console.log('[Seed] Demo data loaded. Email: demo@spendee.app | Password: demo123');
  return DEMO_UID;
}

/** Auto-login as demo user. Returns true if session set. */
export function loginAsDemoUser() {
  const uid = seedDemoData();
  Storage.setSession(uid);
  return uid;
}


// ─── Private helpers ──────────────────────────────────────────────

function _futureDate(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function _date(monthOffset, day) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + monthOffset);
  d.setDate(day);
  return d.toISOString().slice(0, 10);
}

function _id() {
  return 'tx_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function _tx(type, amount, category, note, date, tags = []) {
  return { id: _id(), type, amount, category, note, date, tags, recurring: false, createdAt: new Date().toISOString(), _v: 2 };
}

function _buildTransactions() {
  const txns = [];

  // ── Current month ────────────────────────────────────────────────
  txns.push(
    _tx('income',  68000,  'salary',        'Monthly Salary',        _date(0, 1),  ['work']),
    _tx('expense',  2200,  'food',           'Zomato Order',          _date(0, 2),  ['dining']),
    _tx('expense',  1800,  'transport',      'Uber — Office Commute', _date(0, 3),  ['commute']),
    _tx('expense',  3200,  'groceries',      'BigBasket Monthly',     _date(0, 4),  ['essentials']),
    _tx('expense',  1200,  'food',           'Restaurant — Friends',  _date(0, 5),  ['social']),
    _tx('expense',  4500,  'rent',           'Electricity & Internet',_date(0, 6),  ['bills']),
    _tx('expense',   899,  'subscriptions',  'Netflix',               _date(0, 7),  ['streaming']),
    _tx('expense',   299,  'subscriptions',  'Spotify',               _date(0, 7),  ['music']),
    _tx('expense',  1500,  'health',         'Gym Membership',        _date(0, 8),  ['fitness']),
    _tx('expense',  2800,  'shopping',       'New Shoes',             _date(0, 9),  ['clothing']),
    _tx('income',   5000,  'freelance',      'UI Design Project',     _date(0, 10), ['side-income']),
    _tx('expense',   850,  'food',           'Swiggy — Breakfast',    _date(0, 11), ['dining']),
    _tx('expense',  1100,  'transport',      'Ola — Weekend Trips',   _date(0, 12), ['travel']),
    _tx('expense',  3500,  'education',      'Udemy Course Bundle',   _date(0, 13), ['learning']),
    _tx('expense',  1650,  'entertainment',  'Movie + Dinner',        _date(0, 14), ['leisure']),
    _tx('expense',   750,  'health',         'Pharmacy',              _date(0, 15), ['medical']),
    _tx('expense',  2100,  'food',           'Grocery Top-up',        _date(0, 16), ['essentials']),
    _tx('expense',  4200,  'shopping',       'Home Décor Items',      _date(0, 17), ['home']),
  );

  // ── Last month ───────────────────────────────────────────────────
  txns.push(
    _tx('income',  68000,  'salary',        'Monthly Salary',        _date(-1, 1),  ['work']),
    _tx('expense',  2600,  'food',           'Restaurant visits',     _date(-1, 3),  ['dining']),
    _tx('expense',  1650,  'transport',      'Fuel + Auto',           _date(-1, 4),  ['commute']),
    _tx('expense',  3100,  'groceries',      'BigBasket',             _date(-1, 5),  ['essentials']),
    _tx('expense',  5800,  'shopping',       'Diwali Shopping',       _date(-1, 6),  ['festival']),
    _tx('expense',  4500,  'rent',           'Electricity & Internet',_date(-1, 7),  ['bills']),
    _tx('expense',   899,  'subscriptions',  'Netflix',               _date(-1, 7),  ['streaming']),
    _tx('expense',  1200,  'health',         'Doctor + Meds',         _date(-1, 10), ['medical']),
    _tx('income',   8000,  'bonus',          'Performance Bonus',     _date(-1, 12), ['work']),
    _tx('expense',  2200,  'travel',         'Weekend trip to Pune',  _date(-1, 14), ['travel']),
    _tx('expense',  1400,  'entertainment',  'OTT + Gaming',          _date(-1, 16), ['leisure']),
    _tx('expense',  1800,  'food',           'Swiggy orders',         _date(-1, 18), ['dining']),
    _tx('expense',   650,  'transport',      'Metro + Bus pass',      _date(-1, 20), ['commute']),
    _tx('expense',  2500,  'bills',          'Phone + Wifi',          _date(-1, 22), ['bills']),
    _tx('income',   3000,  'gift',           'Diwali Gift Cash',      _date(-1, 24), ['personal']),
  );

  // ── Two months ago ───────────────────────────────────────────────
  txns.push(
    _tx('income',  68000,  'salary',        'Monthly Salary',        _date(-2, 1),  ['work']),
    _tx('expense',  3200,  'rent',           'Rent',                  _date(-2, 1),  ['housing']),
    _tx('expense',  2100,  'food',           'Meals & dining',        _date(-2, 5),  ['dining']),
    _tx('expense',  1500,  'transport',      'Transport',             _date(-2, 6),  ['commute']),
    _tx('expense',  2800,  'groceries',      'Monthly groceries',     _date(-2, 7),  ['essentials']),
    _tx('expense',  4500,  'bills',          'All utility bills',     _date(-2, 8),  ['bills']),
    _tx('expense',   899,  'subscriptions',  'Netflix',               _date(-2, 8),  ['streaming']),
    _tx('expense',  1500,  'health',         'Gym + Doctor',          _date(-2, 10), ['fitness']),
    _tx('income',   4500,  'freelance',      'App development work',  _date(-2, 15), ['side-income']),
    _tx('expense',  1200,  'entertainment',  'Movies & events',       _date(-2, 16), ['leisure']),
    _tx('expense',  1900,  'shopping',       'Clothing sale',         _date(-2, 20), ['clothing']),
    _tx('expense',  2200,  'education',      'Online course',         _date(-2, 22), ['learning']),
    _tx('expense',   600,  'food',           'Coffee & snacks',       _date(-2, 25), ['dining']),
  );

  // Sort newest-first and assign fresh IDs to avoid collisions
  txns.forEach((t, i) => { t.id = `tx_seed_${i}`; });
  return txns.sort((a, b) => (b.date > a.date ? 1 : -1));
}
