const supabaseUrl = window.localStorage.getItem('supabaseUrl') || '';
const supabaseAnonKey = window.localStorage.getItem('supabaseAnonKey') || '';
let supabaseClient;
let currentUser = null;
let currentView = 'dashboard';
let state = {
  households: [],
  members: [],
  periods: [],
  categories: [],
  transactions: [],
  currentPeriodId: null,
  selectedCategoryId: null,
  authMode: 'sign_in',
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
function getPeriodStatus(period) {
  const today = new Date();
  const start = new Date(period.start_date);
  const end = new Date(period.end_date);
  if (today < start) return 'budoucí';
  if (today > end) return 'uzavřené';
  return 'aktivní';
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
function validateConfig() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}
function initSupabase() {
  if (supabaseClient) return supabaseClient;
  const supabaseLibrary = window.supabase;
  if (!supabaseLibrary?.createClient) {
    state.status = { type: 'error', message: 'Supabase klient se nepodařilo načíst. Zkontrolujte připojení k internetu a znovu načtěte stránku.' };
    return null;
  }
  supabaseClient = supabaseLibrary.createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return supabaseClient;
}
async function ensureSession() {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  currentUser = session?.user ?? null;
  if (!currentUser) return false;
  return true;
}
async function signIn(email, password) {
  state.loading = true; render();
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  state.loading = false;
  if (error) {
    state.status = { type: 'error', message: error.message };
    render();
    return false;
  }
  currentUser = data.user;
  state.status = { type: 'success', message: 'Přihlášení proběhlo úspěšně.' };
  await loadAllData();
  return true;
}
async function signUp(email, password, displayName) {
  state.loading = true; render();
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  state.loading = false;
  if (error) {
    state.status = { type: 'error', message: error.message };
    render();
    return false;
  }
  currentUser = data.user;
  if (currentUser) {
    await supabaseClient.from('household_members').insert([{ user_id: currentUser.id, display_name: displayName, role: 'member' }]);
  }
  state.status = { type: 'success', message: 'Účet vytvořen. Případně se připojte do domácnosti po potvrzení e-mailu.' };
  await loadAllData();
  return true;
}
async function signOut() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  state.status = { type: 'info', message: 'Odhlášeno.' };
  render();
}
async function loadAllData() {
  if (!currentUser) return;
  state.loading = true;
  const { data: householdMembers, error: membersError } = await supabaseClient.from('household_members').select('*').eq('user_id', currentUser.id);
  if (membersError) throw membersError;
  if (!householdMembers?.length) {
    state.households = [];
    state.members = [];
    state.periods = [];
    state.categories = [];
    state.transactions = [];
    state.loading = false;
    render();
    return;
  }
  const householdId = householdMembers[0].household_id;
  const [{ data: households }, { data: periods }, { data: categories }, { data: transactions }] = await Promise.all([
    supabaseClient.from('households').select('*').eq('id', householdId).single(),
    supabaseClient.from('budget_periods').select('*').eq('household_id', householdId).order('start_date', { ascending: false }),
    supabaseClient.from('categories').select('*').eq('household_id', householdId).order('name'),
    supabaseClient.from('transactions').select('*').eq('household_id', householdId).order('transaction_date', { ascending: false }),
  ]);
  state.households = households ? [households] : [];
  state.members = householdMembers;
  state.periods = periods || [];
  state.categories = categories || [];
  state.transactions = transactions || [];
  if (!state.currentPeriodId && state.periods.length) {
    state.currentPeriodId = state.periods[0].id;
  }
  state.loading = false;
  render();
}
async function insertTransaction(formData) {
  if (!navigator.onLine) {
    state.status = { type: 'error', message: 'Nelze uložit bez připojení k internetu.' };
    render();
    return false;
  }
  state.loading = true; render();
  const payload = {
    household_id: state.households[0]?.id,
    period_id: getPeriodForDate(formData.transaction_date),
    type: formData.type,
    amount: Number(formData.amount),
    category_id: formData.type === 'expense' ? formData.category_id : null,
    paid_by: formData.paid_by,
    transaction_date: formData.transaction_date,
    note: formData.note,
    created_by: currentUser?.id,
  };
  const { error } = await supabaseClient.from('transactions').insert([payload]);
  state.loading = false;
  if (error) {
    state.status = { type: 'error', message: error.message };
    render();
    return false;
  }
  state.status = { type: 'success', message: 'Transakce uložena.' };
  await loadAllData();
  return true;
}
async function updateTransaction(id, payload) {
  state.loading = true; render();
  const nextPayload = {
    ...payload,
    period_id: getPeriodForDate(payload.transaction_date),
    amount: Number(payload.amount),
    category_id: payload.type === 'expense' ? payload.category_id : null,
  };
  const { error } = await supabaseClient.from('transactions').update(nextPayload).eq('id', id);
  state.loading = false;
  if (error) {
    state.status = { type: 'error', message: error.message };
    render();
    return false;
  }
  state.status = { type: 'success', message: 'Transakce upravena.' };
  await loadAllData();
  return true;
}
async function deleteTransaction(id) {
  if (!confirm('Opravdu chcete smazat transakci?')) return false;
  state.loading = true; render();
  const { error } = await supabaseClient.from('transactions').delete().eq('id', id);
  state.loading = false;
  if (error) {
    state.status = { type: 'error', message: error.message };
    render();
    return false;
  }
  state.status = { type: 'success', message: 'Transakce smazána.' };
  await loadAllData();
  return true;
}
async function createPeriod(payload) {
  state.loading = true; render();
  const { error } = await supabaseClient.from('budget_periods').insert([payload]);
  state.loading = false;
  if (error) {
    state.status = { type: 'error', message: error.message };
    render();
    return false;
  }
  state.status = { type: 'success', message: 'Období vytvořeno.' };
  await loadAllData();
  return true;
}
async function createCategory(payload) {
  state.loading = true; render();
  const { error } = await supabaseClient.from('categories').insert([payload]);
  state.loading = false;
  if (error) {
    state.status = { type: 'error', message: error.message };
    render();
    return false;
  }
  state.status = { type: 'success', message: 'Kategorie vytvořena.' };
  await loadAllData();
  return true;
}
async function updateCategory(id, payload) {
  state.loading = true; render();
  const { error } = await supabaseClient.from('categories').update(payload).eq('id', id);
  state.loading = false;
  if (error) {
    state.status = { type: 'error', message: error.message };
    render();
    return false;
  }
  state.status = { type: 'success', message: 'Kategorie upravena.' };
  await loadAllData();
  return true;
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
function renderAuth() {
  return `
    <div class="auth-card">
      <h1>Společný rozpočet</h1>
      <p>Viki & Káťa — přihlášení do společné domácnosti.</p>
      ${state.status ? `<div class="status-banner status-${state.status.type}">${state.status.message}</div>` : ''}
      <div class="row" style="margin: 14px 0;">
        <button class="btn btn-secondary" data-mode="sign_in">Přihlásit</button>
        <button class="btn btn-secondary" data-mode="sign_up">Vytvořit účet</button>
      </div>
      <form id="auth-form" class="form-grid">
        <label> E-mail
          <input name="email" type="email" required />
        </label>
        <label> Heslo
          <input name="password" type="password" required />
        </label>
        ${state.authMode === 'sign_up' ? `<label>Jméno v domácnosti
          <input name="display_name" />
        </label>` : ''}
        <button class="btn btn-primary" type="submit" ${state.loading ? 'disabled' : ''}>${state.authMode === 'sign_up' ? 'Vytvořit účet' : 'Přihlásit se'}</button>
      </form>
    </div>
  `;
}
function renderDashboard() {
  const period = getPeriodById(state.currentPeriodId) || state.periods[0] || null;
  const previousPeriod = state.periods.find((p) => p.id !== period?.id) || null;
  const summary = period ? calculatePeriodSummary(period) : { incomes:0,expenses:0,balance:0,categoryBudgetTotal:0,rolloverTotal:0,availableTotal:0,spentTotal:0,remainingTotal:0 };
  const previousSummary = previousPeriod ? calculatePeriodSummary(previousPeriod) : null;
  const comparisonIncomeDiff = previousSummary ? summary.incomes - previousSummary.incomes : null;
  const comparisonExpenseDiff = previousSummary ? summary.expenses - previousSummary.expenses : null;
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
              <div class="list-item">Příjmy: ${formatCurrency(summary.incomes)} vs ${formatCurrency(previousSummary.incomes)} · rozdíl ${formatCurrency(summary.incomes - previousSummary.incomes)}</div>
              <div class="list-item">Výdaje: ${formatCurrency(summary.expenses)} vs ${formatCurrency(previousSummary.expenses)} · rozdíl ${formatCurrency(summary.expenses - previousSummary.expenses)}</div>
              <div class="list-item">Zbývající částka: ${formatCurrency(summary.remainingTotal)}</div>
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
                <div class="category-card" data-category-id="${category.id}">
                  <div class="row" style="justify-content: space-between; align-items:center;">
                    <strong>${category.name}</strong>
                    <span class="badge ${pct >= 100 ? 'badge-danger' : pct >= 90 ? 'badge-warning' : 'badge-success'}">${formatPercent(metrics.usagePercent)}</span>
                  </div>
                  <div class="row" style="justify-content: space-between; margin-top: 8px; color: var(--muted);">
                    <span>Rozpočet: ${formatCurrency(category.default_budget)}</span>
                    <span>Přenos: ${formatCurrency(category.rollover_amount ?? 0)}</span>
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
        <label>Období<select id="history-period">${['all', ...state.periods.map((p) => p.id)].map((value) => `<option value="${value}" ${state.filters.periodId === value ? 'selected' : ''}>${value === 'all' ? 'Všechna' : getPeriodById(value).name}</option>`).join('')}</select></label>
        <label>Typ<select id="history-type"><option value="all" ${state.filters.type==='all'?'selected':''}>Vše</option><option value="income" ${state.filters.type==='income'?'selected':''}>Příjem</option><option value="expense" ${state.filters.type==='expense'?'selected':''}>Výdaj</option></select></label>
      </div>
      <div class="grid grid-3" style="margin-top:12px;">
        <label>Kategorie<select id="history-category">${['all', ...state.categories.map((c) => c.id)].map((value) => `<option value="${value}" ${state.filters.categoryId === value ? 'selected' : ''}>${value === 'all' ? 'Vše' : getCategoryById(value)?.name || '—'}</option>`).join('')}</select></label>
        <label>Osoba<select id="history-person"><option value="all" ${state.filters.person==='all'?'selected':''}>Všichni</option><option value="Viki" ${state.filters.person==='Viki'?'selected':''}>Viki</option><option value="Káťa" ${state.filters.person==='Káťa'?'selected':''}>Káťa</option><option value="Společné" ${state.filters.person==='Společné'?'selected':''}>Společné</option></select></label>
        <label>Částka<select id="history-amount"><option value="all">Vše</option><option value="high">Vysoké</option></select></label>
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
function renderSettings() {
  return `<div class="container"><div class="card"><h2>Nastavení domácnosti</h2><p>Supabase URL a anon klíč jsou načteny z místního úložiště.</p><div class="form-grid"><label>Supabase URL<input id="supabase-url" value="${supabaseUrl}"></label><label>Supabase anon key<input id="supabase-anon-key" value="${supabaseAnonKey}"></label><button class="btn btn-primary" id="save-config">Uložit konfiguraci</button></div></div></div>`;
}
function renderPeriods() {
  return `<div class="container"><div class="card"><div class="row" style="justify-content: space-between; align-items:center;"><h2>Správa období</h2><button class="btn btn-primary" data-action="show-create-period">Nové období</button></div><div class="list" style="margin-top:12px;">${state.periods.length ? state.periods.map((period) => `<div class="list-item"><strong>${period.name}</strong><div style="color:var(--muted); margin-top:6px;">${period.start_date} → ${period.end_date}</div><div class="row" style="margin-top:8px;"><button class="btn btn-secondary" data-action="edit-period" data-id="${period.id}">Upravit</button><button class="btn btn-secondary" data-action="close-period" data-id="${period.id}">Uzavřít</button></div></div>`).join('') : '<div class="empty">Žádná období</div>'}</div></div></div>`;
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
        <button class="nav-btn ${currentView === 'settings' ? 'active' : ''}" data-view="settings">Nastavení</button>
      </nav>
      <div class="card" style="background: rgba(255,255,255,.08); border: 0; color: white;">
        <strong>Rychlé akce</strong>
        <div class="row" style="margin-top: 12px;">
          <button class="btn btn-primary" data-action="show-add-transaction">+ Transakce</button>
        </div>
      </div>
      ${currentUser ? `<button class="btn btn-secondary" id="sign-out">Odhlásit</button>` : ''}
    </aside>
  `;
}
function renderMobileNav() {
  return `
    <div class="mobile-nav">
      <button data-view="dashboard">Dashboard</button>
      <button data-view="history">Historie</button>
      <button data-view="budgets">Rozpočty</button>
      <button data-view="settings">Nastavení</button>
    </div>
  `;
}
function render() {
  if (!validateConfig()) {
    appRoot.innerHTML = `
      <div class="app-shell">
        <div class="main" style="width:100%;">
          <div class="content">
            <div class="auth-card">
              <h1>Supabase konfigurace</h1>
              <p>Pro spuštění aplikace potřebujete údaje z vašeho Supabase projektu.</p>
              <div class="status-banner status-error">${state.status?.message || 'Vložte Supabase URL a anon klíč.'}</div>
              <div class="card" style="margin-top:12px;">
                <h3>Co sem dát</h3>
                <p>Do pole <strong>Supabase URL</strong> vložte adresu projektu, například: <code>https://xxxxx.supabase.co</code></p>
                <p>Do pole <strong>Supabase anon key</strong> vložte veřejný anonymní klíč z API nastavení v Supabase.</p>
                <div class="form-grid">
                  <label>Supabase URL<input id="supabase-url" value="${supabaseUrl}" placeholder="https://xxxxx.supabase.co"></label>
                  <label>Supabase anon key<input id="supabase-anon-key" value="${supabaseAnonKey}" placeholder="eyJ..."></label>
                  <button class="btn btn-primary" id="save-config">Uložit konfiguraci</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    document.getElementById('save-config')?.addEventListener('click', () => {
      const url = document.getElementById('supabase-url').value;
      const key = document.getElementById('supabase-anon-key').value;
      window.localStorage.setItem('supabaseUrl', url);
      window.localStorage.setItem('supabaseAnonKey', key);
      location.reload();
    });
    return;
  }
  if (!supabaseClient) {
    initSupabase();
  }
  if (!currentUser) {
    appRoot.innerHTML = `
      <div class="app-shell">
        <div class="main" style="width:100%;">
          <div class="content">${renderAuth()}</div>
        </div>
      </div>`;
    attachAuthEvents();
    return;
  }
  appRoot.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <div class="main">
        <div class="topbar">
          <div><strong>${state.households[0]?.name || 'Společná domácnost'}</strong></div>
          <div class="user">${currentUser.email}</div>
        </div>
        <div class="content">
          ${currentView === 'dashboard' ? renderDashboard() : ''}
          ${currentView === 'history' ? renderHistory() : ''}
          ${currentView === 'budgets' ? renderBudgetManagement() : ''}
          ${currentView === 'periods' ? renderPeriods() : ''}
          ${currentView === 'settings' ? renderSettings() : ''}
        </div>
      </div>
    </div>
    ${renderMobileNav()}
  `;
  attachEvents();
}
function attachAuthEvents() {
  document.querySelector('#auth-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = form.get('email');
    const password = form.get('password');
    const displayName = form.get('display_name');
    if (state.authMode === 'sign_up') {
      await signUp(email, password, displayName);
    } else {
      await signIn(email, password);
    }
  });
  document.querySelectorAll('[data-mode]').forEach((btn) => btn.addEventListener('click', () => {
    state.authMode = btn.dataset.mode;
    render();
  }));
}
function attachEvents() {
  document.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => setView(btn.dataset.view)));
  document.getElementById('sign-out')?.addEventListener('click', signOut);
  document.querySelectorAll('[data-action="show-add-transaction"]').forEach((btn) => btn.addEventListener('click', () => showTransactionModal()));
  document.querySelectorAll('[data-action="show-create-period"]').forEach((btn) => btn.addEventListener('click', () => showPeriodModal()));
  document.querySelectorAll('[data-action="show-create-category"]').forEach((btn) => btn.addEventListener('click', () => showCategoryModal()));
  document.querySelectorAll('[data-category-id]').forEach((card) => card.addEventListener('click', () => {
    state.selectedCategoryId = card.dataset.categoryId;
    showCategoryDetailModal(card.dataset.categoryId);
  }));
  document.getElementById('period-select')?.addEventListener('change', (event) => {
    state.currentPeriodId = event.target.value;
    render();
  });
  document.getElementById('save-config')?.addEventListener('click', () => {
    const url = document.getElementById('supabase-url').value;
    const key = document.getElementById('supabase-anon-key').value;
    window.localStorage.setItem('supabaseUrl', url);
    window.localStorage.setItem('supabaseAnonKey', key);
    location.reload();
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
  document.getElementById('history-category')?.addEventListener('change', (event) => {
    state.filters.categoryId = event.target.value;
    render();
  });
  document.getElementById('history-person')?.addEventListener('change', (event) => {
    state.filters.person = event.target.value;
    render();
  });
  document.querySelectorAll('[data-action="edit-transaction"]').forEach((btn) => btn.addEventListener('click', () => showTransactionModal(btn.dataset.id)));
  document.querySelectorAll('[data-action="delete-transaction"]').forEach((btn) => btn.addEventListener('click', () => deleteTransaction(btn.dataset.id)));
  document.querySelectorAll('[data-action="edit-category"]').forEach((btn) => btn.addEventListener('click', () => showCategoryModal(btn.dataset.id)));
  document.querySelectorAll('[data-action="toggle-category"]').forEach((btn) => btn.addEventListener('click', async () => {
    const category = state.categories.find((c) => c.id === btn.dataset.id);
    if (!category) return;
    await updateCategory(category.id, { active: category.active === false ? true : false });
  }));
  document.querySelectorAll('[data-action="edit-period"]').forEach((btn) => btn.addEventListener('click', () => showPeriodModal(btn.dataset.id)));
  document.querySelectorAll('[data-action="close-period"]').forEach((btn) => btn.addEventListener('click', async () => {
    const period = state.periods.find((p) => p.id === btn.dataset.id);
    if (!period) return;
    await supabaseClient.from('budget_periods').update({ status: 'closed' }).eq('id', period.id);
    await loadAllData();
  }));
}
function showTransactionModal(transactionId = null) {
  const transaction = state.transactions.find((t) => t.id === transactionId) || null;
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
  document.getElementById('transaction-form').addEventListener('submit', async (event) => {
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
      await updateTransaction(transaction.id, payload);
    } else {
      await insertTransaction(payload);
    }
    closeModal();
  });
  document.getElementById('delete-transaction-modal')?.addEventListener('click', async () => {
    await deleteTransaction(transaction.id);
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
        <label>Barva<input name="color" value="${category?.color || '#2563eb'}"></label>
        <label>Výchozí rozpočet<input name="default_budget" type="number" step="0.01" value="${category?.default_budget || 0}"></label>
        <label>Rollover mode<select name="rollover_mode"><option value="none" ${category?.rollover_mode === 'none' ? 'selected' : ''}>Nepřenášet</option><option value="positive" ${category?.rollover_mode === 'positive' ? 'selected' : ''}>Jen kladný</option><option value="both" ${category?.rollover_mode === 'both' ? 'selected' : ''}>Kladný i záporný</option></select></label>
        <label>Aktivní<select name="active"><option value="true" ${category?.active !== false ? 'selected' : ''}>Ano</option><option value="false" ${category?.active === false ? 'selected' : ''}>Ne</option></select></label>
        <button class="btn btn-primary" type="submit">${category ? 'Uložit' : 'Přidat'}</button>
      </form>
    </div>`;
  showModal(form);
  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.getElementById('category-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    payload.default_budget = Number(payload.default_budget);
    payload.active = payload.active === 'true';
    if (category) {
      await updateCategory(category.id, payload);
    } else {
      await createCategory({ ...payload, household_id: state.households[0]?.id, type: 'expense' });
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
        <label>Status<select name="status"><option value="active" ${period?.status === 'active' ? 'selected' : ''}>Aktivní</option><option value="closed" ${period?.status === 'closed' ? 'selected' : ''}>Uzavřené</option><option value="future" ${period?.status === 'future' ? 'selected' : ''}>Budoucí</option></select></label>
        <button class="btn btn-primary" type="submit">${period ? 'Uložit' : 'Vytvořit'}</button>
      </form>
    </div>`;
  showModal(form);
  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.getElementById('period-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    if (period) {
      await supabaseClient.from('budget_periods').update(payload).eq('id', period.id);
    } else {
      await createPeriod({ ...payload, household_id: state.households[0]?.id });
    }
    closeModal();
    await loadAllData();
  });
}
function showCategoryDetailModal(categoryId) {
  const category = state.categories.find((c) => c.id === categoryId);
  const transactions = state.transactions.filter((t) => t.category_id === categoryId && t.type === 'expense');
  const period = getPeriodById(state.currentPeriodId) || state.periods[0] || null;
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
  state.status = { type: 'error', message: 'Zařízení je offline, transakci nelze uložit.' };
  render();
});

(async () => {
  render();
  if (!validateConfig()) return;
  initSupabase();
  try {
    if (await ensureSession()) {
      await loadAllData();
    } else {
      render();
    }
  } catch (error) {
    state.status = { type: 'error', message: error.message || 'Neznámá chyba Supabase.' };
    render();
  }
})();
