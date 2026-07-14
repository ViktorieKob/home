const supabaseUrl = 'https://kzucqgkbzmwcjzdhlbgj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6dWNxZ2tiem13Y2p6ZGhsYmdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNDEwMTksImV4cCI6MjA5OTYxNzAxOX0.BfwqRhXJcHZHZdku2_pl1yw61BnpfKAys-tThzzXDVI';

let supabaseClient;
let currentView = 'dashboard';
let state = {
  household: { id: null, name: 'Viki & Káťa', budget_start_day: 1 },
  periods: [],
  categories: [],
  transactions: [],
  currentPeriodId: null,
  loading: false,
  status: null,
  filters: { periodId: 'all', categoryId: 'all', person: 'all', type: 'all', search: '' },
};

const appRoot = document.getElementById('app');
const modalRoot = document.getElementById('modal');

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`;
}
function formatPercent(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '—';
  return `${amount.toFixed(1)} %`;
}
function safeNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function getToday() {
  return new Date().toISOString().slice(0, 10);
}
function getPeriodById(id) {
  return state.periods.find((p) => p.id === id) || null;
}
function getCategoryById(id) {
  return state.categories.find((c) => c.id === id) || null;
}
function getTransactionsForPeriod(periodId) {
  return state.transactions.filter((t) => t.period_id === periodId);
}
function getPeriodForDate(dateValue) {
  const targetDate = new Date(dateValue);
  const matchingPeriod = state.periods.find((period) => {
    const start = new Date(period.start_date);
    const end = new Date(period.end_date);
    return targetDate >= start && targetDate <= end;
  });
  return matchingPeriod?.id || state.currentPeriodId || state.periods[0]?.id || null;
}
function getExpensesForCategory(categoryId, periodId) {
  return state.transactions.filter((t) => t.category_id === categoryId && t.type === 'expense' && t.period_id === periodId).reduce((sum, t) => sum + safeNumber(t.amount), 0);
}
function computeCategoryMetrics(category, period) {
  const expenses = getExpensesForCategory(category.id, period.id);
  const baseBudget = safeNumber(category.default_budget);
  const rolloverAmount = safeNumber(category.rollover_amount ?? 0);
  const manualAdjustment = safeNumber(category.manual_adjustment ?? 0);
  const totalAvailable = baseBudget + rolloverAmount + manualAdjustment;
  const remaining = totalAvailable - expenses;
  const usagePercent = totalAvailable > 0 ? (expenses / totalAvailable) * 100 : (expenses > 0 ? 100 : 0);
  const baseUsagePercent = baseBudget > 0 ? (totalAvailable / baseBudget) * 100 : 0;
  return { expenses, totalAvailable, remaining, usagePercent, baseUsagePercent };
}
function calculatePeriodSummary(period) {
  const tx = getTransactionsForPeriod(period.id);
  const incomes = tx.filter((t) => t.type === 'income').reduce((sum, t) => sum + safeNumber(t.amount), 0);
  const expenses = tx.filter((t) => t.type === 'expense').reduce((sum, t) => sum + safeNumber(t.amount), 0);
  const balance = incomes - expenses;
  const categories = state.categories.filter((c) => c.active !== false);
  const categoryBudgetTotal = categories.reduce((sum, c) => sum + safeNumber(c.default_budget), 0);
  const rolloverTotal = categories.reduce((sum, c) => sum + safeNumber(c.rollover_amount ?? 0), 0);
  const availableTotal = categoryBudgetTotal + rolloverTotal;
  const spentTotal = categories.reduce((sum, c) => sum + getExpensesForCategory(c.id, period.id), 0);
  const remainingTotal = availableTotal - spentTotal;
  return { incomes, expenses, balance, categoryBudgetTotal, rolloverTotal, availableTotal, spentTotal, remainingTotal };
}

function initSupabase() {
  if (supabaseClient) return supabaseClient;
  if (typeof window.supabase?.createClient !== 'function') {
    state.status = { type: 'error', message: 'Chyba: Supabase klient se nepodařilo načíst. Zkontrolujte připojení.' };
    render();
    return null;
  }
  supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  return supabaseClient;
}

async function loadAllData() {
  state.loading = true;
  render();
  try {
    const [{ data: households }, { data: periods }, { data: categories }, { data: transactions }] = await Promise.all([
      supabaseClient.from('households').select('*').limit(1),
      supabaseClient.from('budget_periods').select('*').order('start_date', { ascending: false }),
      supabaseClient.from('categories').select('*').order('name'),
      supabaseClient.from('transactions').select('*').order('transaction_date', { ascending: false }),
    ]);
    
    if (households?.length) {
      state.household = households[0];
    }
    state.periods = periods || [];
    state.categories = categories || [];
    state.transactions = transactions || [];
    
    if (!state.currentPeriodId && state.periods.length) {
      state.currentPeriodId = state.periods[0].id;
    }
    state.status = null;
  } catch (error) {
    state.status = { type: 'error', message: 'Chyba při načítání dat: ' + error.message };
  }
  state.loading = false;
  render();
}

async function insertTransaction(formData) {
  if (!navigator.onLine) {
    state.status = { type: 'error', message: 'Zařízení je offline. Nelze uložit.' };
    render();
    return false;
  }
  state.loading = true;
  render();
  
  const payload = {
    household_id: state.household.id,
    period_id: getPeriodForDate(formData.transaction_date),
    type: formData.type,
    amount: Number(formData.amount),
    category_id: formData.type === 'expense' ? formData.category_id : null,
    paid_by: formData.paid_by,
    transaction_date: formData.transaction_date,
    note: formData.note,
  };
  
  try {
    const { error } = await supabaseClient.from('transactions').insert([payload]);
    if (error) throw error;
    state.status = { type: 'success', message: 'Transakce uložena.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: error.message };
    state.loading = false;
    render();
  }
}

async function updateTransaction(id, payload) {
  state.loading = true;
  render();
  
  const nextPayload = {
    ...payload,
    period_id: getPeriodForDate(payload.transaction_date),
    amount: Number(payload.amount),
    category_id: payload.type === 'expense' ? payload.category_id : null,
  };
  
  try {
    const { error } = await supabaseClient.from('transactions').update(nextPayload).eq('id', id);
    if (error) throw error;
    state.status = { type: 'success', message: 'Transakce upravena.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: error.message };
    state.loading = false;
    render();
  }
}

async function deleteTransaction(id) {
  if (!confirm('Opravdu chcete smazat transakci?')) return false;
  state.loading = true;
  render();
  
  try {
    const { error } = await supabaseClient.from('transactions').delete().eq('id', id);
    if (error) throw error;
    state.status = { type: 'success', message: 'Transakce smazána.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: error.message };
    state.loading = false;
    render();
  }
}

async function createPeriod(payload) {
  state.loading = true;
  render();
  
  const nextPayload = { ...payload, household_id: state.household.id };
  
  try {
    const { error } = await supabaseClient.from('budget_periods').insert([nextPayload]);
    if (error) throw error;
    state.status = { type: 'success', message: 'Období vytvořeno.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: error.message };
    state.loading = false;
    render();
  }
}

async function createCategory(payload) {
  state.loading = true;
  render();
  
  const nextPayload = { ...payload, household_id: state.household.id };
  
  try {
    const { error } = await supabaseClient.from('categories').insert([nextPayload]);
    if (error) throw error;
    state.status = { type: 'success', message: 'Kategorie vytvořena.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: error.message };
    state.loading = false;
    render();
  }
}

async function updateCategory(id, payload) {
  state.loading = true;
  render();
  
  try {
    const { error } = await supabaseClient.from('categories').update(payload).eq('id', id);
    if (error) throw error;
    state.status = { type: 'success', message: 'Kategorie upravena.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: error.message };
    state.loading = false;
    render();
  }
}

async function updatePeriod(id, payload) {
  state.loading = true;
  render();
  
  try {
    const { error } = await supabaseClient.from('budget_periods').update(payload).eq('id', id);
    if (error) throw error;
    state.status = { type: 'success', message: 'Období upraveno.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: error.message };
    state.loading = false;
    render();
  }
}

function setView(view) {
  currentView = view;
  render();
}
function showModal(content) {
  modalRoot.innerHTML = content;
  modalRoot.classList.remove('hidden');
}
function closeModal() {
  modalRoot.innerHTML = '';
  modalRoot.classList.add('hidden');
}

function renderDashboard() {
  const period = getPeriodById(state.currentPeriodId) || state.periods[0] || null;
  const previousPeriod = state.periods.find((p) => p.id !== period?.id) || null;
  const summary = period ? calculatePeriodSummary(period) : { incomes:0,expenses:0,balance:0,categoryBudgetTotal:0,rolloverTotal:0,availableTotal:0,spentTotal:0,remainingTotal:0 };
  const previousSummary = previousPeriod ? calculatePeriodSummary(previousPeriod) : null;
  return `
    <div class="container">
      <div class="card">
        <div class="row" style="justify-content: space-between; align-items: center;">
          <div>
            <h2>Dashboard</h2>
            <p>${period ? `${period.name} · ${period.start_date} → ${period.end_date}` : 'Žádné období'}</p>
          </div>
          <div class="row">
            <select id="period-select">
              ${state.periods.map((p) => `<option value="${p.id}" ${p.id === period?.id ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
            <button class="btn btn-primary" data-action="show-create-period">Nové období</button>
          </div>
        </div>
        ${state.status ? `<div class="status-banner status-${state.status.type}" style="margin-top:12px;">${state.status.message}</div>` : ''}
      </div>
      <div class="stat-grid" style="margin-top:16px;">
        <div class="stat-card"><div class="stat-label">Příjmy</div><div class="stat-value">${formatCurrency(summary.incomes)}</div></div>
        <div class="stat-card"><div class="stat-label">Výdaje</div><div class="stat-value">${formatCurrency(summary.expenses)}</div></div>
        <div class="stat-card"><div class="stat-label">Bilance</div><div class="stat-value">${formatCurrency(summary.balance)}</div></div>
        <div class="stat-card"><div class="stat-label">Zbývá</div><div class="stat-value">${formatCurrency(summary.remainingTotal)}</div></div>
      </div>
      <div class="grid grid-2" style="margin-top:16px;">
        <div class="card">
          <h3>Srovnání s předchozím obdobím</h3>
          ${previousSummary ? `
            <div class="list">
              <div class="list-item">Příjmy: ${formatCurrency(summary.incomes)} vs ${formatCurrency(previousSummary.incomes)}</div>
              <div class="list-item">Výdaje: ${formatCurrency(summary.expenses)} vs ${formatCurrency(previousSummary.expenses)}</div>
              <div class="list-item">Zbývající: ${formatCurrency(summary.remainingTotal)}</div>
              <div class="list-item">Počet transakcí: ${state.transactions.filter((t) => t.period_id === period?.id).length}</div>
            </div>
          ` : '<div class="empty">Bez dat k porovnání</div>'}
        </div>
        <div class="card">
          <h3>Přehled kategorií</h3>
          <div class="list">
            ${state.categories.filter((c) => c.active !== false).length ? state.categories.filter((c) => c.active !== false).map((category) => {
              const metrics = computeCategoryMetrics(category, period);
              const pct = Math.min(metrics.usagePercent, 100);
              const className = pct >= 100 ? 'progress-danger' : pct >= 90 ? 'progress-warn' : 'progress-good';
              return `
                <div class="category-card" data-category-id="${category.id}" style="cursor:pointer;">
                  <div class="row" style="justify-content: space-between; align-items:center;">
                    <strong>${category.name}</strong>
                    <span class="badge ${pct >= 100 ? 'badge-danger' : pct >= 90 ? 'badge-warning' : 'badge-success'}">${formatPercent(metrics.usagePercent)}</span>
                  </div>
                  <div class="progress"><span class="${className}" style="width:${Math.min(pct, 100)}%"></span></div>
                  <div class="row" style="justify-content: space-between; margin-top:8px;">
                    <span>Vyčerpáno ${formatCurrency(metrics.expenses)}</span>
                    <span>Zbývá ${formatCurrency(metrics.remaining)}</span>
                  </div>
                </div>`;
            }).join('') : '<div class="empty">Žádné kategorie</div>'}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderHistory() {
  const filtered = state.transactions.filter((t) => {
    const periodMatch = state.filters.periodId === 'all' || t.period_id === state.filters.periodId;
    const categoryMatch = state.filters.categoryId === 'all' || t.category_id === state.filters.categoryId;
    const personMatch = state.filters.person === 'all' || t.paid_by === state.filters.person;
    const typeMatch = state.filters.type === 'all' || t.type === state.filters.type;
    const searchMatch = !state.filters.search || (t.note || '').toLowerCase().includes(state.filters.search.toLowerCase());
    return periodMatch && categoryMatch && personMatch && typeMatch && searchMatch;
  }).sort((a,b) => new Date(b.transaction_date) - new Date(a.transaction_date));
  return `<div class="container">
    <div class="card">
      <div class="row" style="justify-content: space-between; align-items:center;">
        <h2>Historie transakcí</h2>
        <button class="btn btn-primary" data-action="show-add-transaction">Přidat transakci</button>
      </div>
      <div class="grid grid-3" style="margin-top:12px;">
        <label>Hledat poznámku<input id="history-search" value="${state.filters.search}"></label>
        <label>Období<select id="history-period">${['all', ...state.periods.map((p) => p.id)].map((value) => `<option value="${value}" ${state.filters.periodId === value ? 'selected' : ''}>${value === 'all' ? 'Všechna' : getPeriodById(value)?.name}</option>`).join('')}</select></label>
        <label>Typ<select id="history-type"><option value="all" ${state.filters.type==='all'?'selected':''}>Vše</option><option value="income" ${state.filters.type==='income'?'selected':''}>Příjem</option><option value="expense" ${state.filters.type==='expense'?'selected':''}>Výdaj</option></select></label>
      </div>
    </div>
    <div class="card" style="margin-top:16px;">
      ${filtered.length ? `<table class="table"><thead><tr><th>Datum</th><th>Typ</th><th>Částka</th><th>Kategorie</th><th>Osoba</th><th>Poznámka</th><th></th></tr></thead><tbody>${filtered.map((t) => `
        <tr>
          <td>${t.transaction_date}</td>
          <td><span class="badge ${t.type === 'income' ? 'badge-success' : 'badge-danger'}">${t.type === 'income' ? 'Příjem' : 'Výdaj'}</span></td>
          <td>${formatCurrency(t.amount)}</td>
          <td>${t.category_id ? getCategoryById(t.category_id)?.name || '—' : '—'}</td>
          <td>${t.paid_by}</td>
          <td>${t.note || '—'}</td>
          <td><div class="row-actions"><button class="btn btn-secondary" data-action="edit-transaction" data-id="${t.id}">Upravit</button><button class="btn btn-danger" data-action="delete-transaction" data-id="${t.id}">Smazat</button></div></td>
        </tr>
      `).join('')}</tbody></table>` : '<div class="empty">Žádné transakce</div>'}
    </div>
  </div>`;
}

function renderBudgetManagement() {
  return `<div class="container"><div class="card"><div class="row" style="justify-content: space-between; align-items:center;"><h2>Správa rozpočtů</h2><button class="btn btn-primary" data-action="show-create-category">Přidat kategorii</button></div><div class="list" style="margin-top:12px;">${state.categories.length ? state.categories.map((category) => `<div class="list-item"><strong>${category.name}</strong><div class="row" style="margin-top:8px;"><button class="btn btn-secondary" data-action="edit-category" data-id="${category.id}">Upravit</button><button class="btn btn-secondary" data-action="toggle-category" data-id="${category.id}">${category.active === false ? 'Aktivovat' : 'Deaktivovat'}</button></div></div>`).join('') : '<div class="empty">Žádné kategorie</div>'}</div></div></div>`;
}

function renderPeriods() {
  return `<div class="container"><div class="card"><div class="row" style="justify-content: space-between; align-items:center;"><h2>Správa období</h2><button class="btn btn-primary" data-action="show-create-period">Nové období</button></div><div class="list" style="margin-top:12px;">${state.periods.length ? state.periods.map((period) => `<div class="list-item"><strong>${period.name}</strong><div style="color:var(--muted); margin-top:6px;">${period.start_date} → ${period.end_date}</div><div class="row" style="margin-top:8px;"><button class="btn btn-secondary" data-action="edit-period" data-id="${period.id}">Upravit</button></div></div>`).join('') : '<div class="empty">Žádná období</div>'}</div></div></div>`;
}

function renderSidebar() {
  return `
    <aside class="sidebar">
      <div class="brand">Viki & Káťa</div>
      <nav>
        <button class="nav-btn ${currentView === 'dashboard' ? 'active' : ''}" data-view="dashboard">Dashboard</button>
        <button class="nav-btn ${currentView === 'history' ? 'active' : ''}" data-view="history">Historie</button>
        <button class="nav-btn ${currentView === 'budgets' ? 'active' : ''}" data-view="budgets">Rozpočty</button>
        <button class="nav-btn ${currentView === 'periods' ? 'active' : ''}" data-view="periods">Období</button>
      </nav>
      <div class="card" style="background: rgba(255,255,255,.08); border: 0; color: white;">
        <strong>Rychlé akce</strong>
        <div class="row" style="margin-top: 12px;">
          <button class="btn btn-primary" data-action="show-add-transaction">+ Transakce</button>
        </div>
      </div>
    </aside>
  `;
}

function renderMobileNav() {
  return `
    <div class="mobile-nav">
      <button data-view="dashboard">Dashboard</button>
      <button data-view="history">Historie</button>
      <button data-view="budgets">Rozpočty</button>
    </div>
  `;
}

function render() {
  appRoot.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <div class="main">
        <div class="topbar">
          <div><strong>${state.household?.name || 'Společná domácnost'}</strong></div>
          <div>${state.loading ? 'Načítání...' : ''}</div>
        </div>
        <div class="content">
          ${currentView === 'dashboard' ? renderDashboard() : ''}
          ${currentView === 'history' ? renderHistory() : ''}
          ${currentView === 'budgets' ? renderBudgetManagement() : ''}
          ${currentView === 'periods' ? renderPeriods() : ''}
        </div>
      </div>
    </div>
    ${renderMobileNav()}
  `;
  attachEvents();
}

function attachEvents() {
  document.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => setView(btn.dataset.view)));
  document.querySelectorAll('[data-action="show-add-transaction"]').forEach((btn) => btn.addEventListener('click', () => showTransactionModal()));
  document.querySelectorAll('[data-action="show-create-period"]').forEach((btn) => btn.addEventListener('click', () => showPeriodModal()));
  document.querySelectorAll('[data-action="show-create-category"]').forEach((btn) => btn.addEventListener('click', () => showCategoryModal()));
  document.querySelectorAll('[data-category-id]').forEach((card) => card.addEventListener('click', () => showCategoryDetailModal(card.dataset.categoryId)));
  document.getElementById('period-select')?.addEventListener('change', (event) => {
    state.currentPeriodId = event.target.value;
    render();
  });
  document.getElementById('history-search')?.addEventListener('input', (event) => {
    state.filters.search = event.target.value;
    render();
  });
  document.getElementById('history-period')?.addEventListener('change', (event) => {
    state.filters.periodId = event.target.value;
    render();
  });
  document.getElementById('history-type')?.addEventListener('change', (event) => {
    state.filters.type = event.target.value;
    render();
  });
  document.querySelectorAll('[data-action="edit-transaction"]').forEach((btn) => btn.addEventListener('click', () => showTransactionModal(btn.dataset.id)));
  document.querySelectorAll('[data-action="delete-transaction"]').forEach((btn) => btn.addEventListener('click', () => deleteTransaction(btn.dataset.id)));
  document.querySelectorAll('[data-action="edit-category"]').forEach((btn) => btn.addEventListener('click', () => showCategoryModal(btn.dataset.id)));
  document.querySelectorAll('[data-action="toggle-category"]').forEach((btn) => btn.addEventListener('click', () => {
    const category = state.categories.find((c) => c.id === btn.dataset.id);
    if (!category) return;
    updateCategory(category.id, { active: category.active === false ? true : false });
  }));
  document.querySelectorAll('[data-action="edit-period"]').forEach((btn) => btn.addEventListener('click', () => showPeriodModal(btn.dataset.id)));
}

function showTransactionModal(transactionId = null) {
  const transaction = state.transactions.find((t) => t.id === transactionId) || null;
  const period = getPeriodById(state.currentPeriodId) || state.periods[0];
  const form = `
    <div class="modal-card">
      <div class="row" style="justify-content: space-between; align-items:center;">
        <h3>${transaction ? 'Upravit transakci' : 'Přidat transakci'}</h3>
        <button class="btn btn-secondary" id="close-modal">Zavřít</button>
      </div>
      <form id="transaction-form" class="form-grid" style="margin-top:12px;">
        <label>Typ<select name="type"><option value="expense" ${transaction?.type === 'expense' || !transaction ? 'selected' : ''}>Výdaj</option><option value="income" ${transaction?.type === 'income' ? 'selected' : ''}>Příjem</option></select></label>
        <label>Částka<input name="amount" type="number" step="0.01" required value="${transaction?.amount || ''}"></label>
        <label>Datum<input name="transaction_date" type="date" required value="${transaction?.transaction_date || getToday()}"></label>
        <label>Kategorie<select name="category_id"><option value="">Bez kategorie</option>${state.categories.filter((c) => c.active !== false).map((category) => `<option value="${category.id}" ${transaction?.category_id === category.id ? 'selected' : ''}>${category.name}</option>`).join('')}</select></label>
        <label>Osoba<select name="paid_by"><option value="Viki" ${transaction?.paid_by === 'Viki' ? 'selected' : ''}>Viki</option><option value="Káťa" ${transaction?.paid_by === 'Káťa' ? 'selected' : ''}>Káťa</option><option value="Společné" ${transaction?.paid_by === 'Společné' ? 'selected' : ''}>Společné</option></select></label>
        <label>Poznámka<textarea name="note">${transaction?.note || ''}</textarea></label>
        <div class="row">
          <button class="btn btn-primary" type="submit" ${state.loading ? 'disabled' : ''}>${transaction ? 'Uložit změny' : 'Uložit'}</button>
          ${transaction ? '<button class="btn btn-danger" type="button" id="delete-transaction-modal">Smazat</button>' : ''}
        </div>
      </form>
    </div>`;
  showModal(form);
  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.getElementById('transaction-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    payload.amount = Number(payload.amount);
    if (payload.amount <= 0) {
      state.status = { type: 'error', message: 'Částka musí být větší než nula.' };
      render();
      return;
    }
    if (transaction) {
      updateTransaction(transaction.id, payload);
    } else {
      insertTransaction(payload);
    }
    closeModal();
  });
  document.getElementById('delete-transaction-modal')?.addEventListener('click', () => {
    deleteTransaction(transaction.id);
    closeModal();
  });
}

function showCategoryModal(categoryId = null) {
  const category = state.categories.find((c) => c.id === categoryId) || null;
  const form = `
    <div class="modal-card">
      <div class="row" style="justify-content: space-between; align-items:center;">
        <h3>${category ? 'Upravit kategorii' : 'Nová kategorie'}</h3>
        <button class="btn btn-secondary" id="close-modal">Zavřít</button>
      </div>
      <form id="category-form" class="form-grid" style="margin-top:12px;">
        <label>Název<input name="name" required value="${category?.name || ''}"></label>
        <label>Ikona<input name="icon" value="${category?.icon || '📦'}"></label>
        <label>Výchozí rozpočet<input name="default_budget" type="number" step="0.01" value="${category?.default_budget || 0}"></label>
        <button class="btn btn-primary" type="submit" ${state.loading ? 'disabled' : ''}>${category ? 'Uložit' : 'Přidat'}</button>
      </form>
    </div>`;
  showModal(form);
  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.getElementById('category-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    payload.default_budget = Number(payload.default_budget);
    payload.rollover_amount = 0;
    payload.manual_adjustment = 0;
    payload.active = true;
    if (category) {
      updateCategory(category.id, payload);
    } else {
      createCategory(payload);
    }
    closeModal();
  });
}

function showPeriodModal(periodId = null) {
  const period = state.periods.find((p) => p.id === periodId) || null;
  const form = `
    <div class="modal-card">
      <div class="row" style="justify-content: space-between; align-items:center;">
        <h3>${period ? 'Upravit období' : 'Nové období'}</h3>
        <button class="btn btn-secondary" id="close-modal">Zavřít</button>
      </div>
      <form id="period-form" class="form-grid" style="margin-top:12px;">
        <label>Název<input name="name" required value="${period?.name || ''}"></label>
        <label>Začátek<input name="start_date" type="date" required value="${period?.start_date || getToday()}"></label>
        <label>Konec<input name="end_date" type="date" required value="${period?.end_date || getToday()}"></label>
        <button class="btn btn-primary" type="submit" ${state.loading ? 'disabled' : ''}>${period ? 'Uložit' : 'Vytvořit'}</button>
      </form>
    </div>`;
  showModal(form);
  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.getElementById('period-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    payload.status = 'active';
    if (period) {
      updatePeriod(period.id, payload);
    } else {
      createPeriod(payload);
    }
    closeModal();
  });
}

function showCategoryDetailModal(categoryId) {
  const category = state.categories.find((c) => c.id === categoryId);
  const period = getPeriodById(state.currentPeriodId) || state.periods[0] || null;
  const transactions = state.transactions.filter((t) => t.category_id === categoryId && t.type === 'expense');
  const metrics = period && category ? computeCategoryMetrics(category, period) : { expenses:0, totalAvailable:0, remaining:0, usagePercent:0 };
  showModal(`
    <div class="modal-card">
      <div class="row" style="justify-content: space-between; align-items:center;">
        <h3>${category?.name || 'Kategorie'}</h3>
        <button class="btn btn-secondary" id="close-modal">Zavřít</button>
      </div>
      <div class="list" style="margin-top:12px;">
        <div class="list-item">Rozpočet: ${formatCurrency(category?.default_budget || 0)}</div>
        <div class="list-item">Přenos: ${formatCurrency(category?.rollover_amount || 0)}</div>
        <div class="list-item">Celkem k dispozici: ${formatCurrency(metrics.totalAvailable)}</div>
        <div class="list-item">Vyčerpáno: ${formatCurrency(metrics.expenses)}</div>
        <div class="list-item">Zbývá: ${formatCurrency(metrics.remaining)}</div>
      </div>
      <div class="card" style="margin-top:12px;">
        <h4>Transakce</h4>
        ${transactions.length ? transactions.map((t) => `<div class="list-item">${t.transaction_date} · ${formatCurrency(t.amount)} · ${t.note || '—'}</div>`).join('') : '<div class="empty">Žádné výdaje</div>'}
      </div>
    </div>
  `);
  document.getElementById('close-modal').addEventListener('click', closeModal);
}

window.addEventListener('online', () => {
  state.status = { type: 'info', message: 'Připojení je zpět.' };
  render();
});
window.addEventListener('offline', () => {
  state.status = { type: 'error', message: 'Zařízení je offline.' };
  render();
});

initSupabase();
loadAllData();
