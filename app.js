const SUPABASE_URL = 'https://kzucqgkbzmwcjzdhlbgj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6dWNxZ2tiem13Y2p6ZGhsYmdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNDEwMTksImV4cCI6MjA5OTYxNzAxOX0.BfwqRhXJcHZHZdku2_pl1yw61BnpfKAys-tThzzXDVI';

let currentView = 'dashboard';
let state = {
  household: { id: null, name: 'Viki & Káťa', budget_start_day: 1 },
  periods: [],
  categories: [],
  periodBudgets: [],
  transactions: [],
  currentPeriodId: null,
  loading: false,
  status: null,
  filters: { periodId: 'all', categoryId: 'all', person: 'all', type: 'all', search: '' },
};

const appRoot = document.getElementById('app');
const modalRoot = document.getElementById('modal');
const PRESET_CATEGORY_NAMES = ['Nájem', 'Potraviny', 'Pohonné hmoty', 'Drogerie', 'Psi', 'Splátky', 'Pojištění', 'Osobní'];
const PRESET_CATEGORY_ICONS = [
  { value: '🏠', label: 'Domov' },
  { value: '🛒', label: 'Nákup' },
  { value: '⛽', label: 'Auto' },
  { value: '🧴', label: 'Drogerie' },
  { value: '🐶', label: 'Mazlíčci' },
  { value: '💳', label: 'Splátky' },
  { value: '🛡️', label: 'Pojištění' },
  { value: '👤', label: 'Osobní' },
  { value: '📦', label: 'Ostatní' },
];
const CATEGORY_ICON_BY_NAME = {
  'Nájem': '🏠',
  'Potraviny': '🛒',
  'Pohonné hmoty': '⛽',
  'Drogerie': '🧴',
  'Psi': '🐶',
  'Splátky': '💳',
  'Pojištění': '🛡️',
  'Osobní': '👤',
};
const CZECH_MONTH_NAMES = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];

// Helper functions
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
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function createUtcDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day));
}
function parseDateOnly(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split('-').map((part) => Number(part));
  if (!year || !month || !day) return null;
  return createUtcDate(year, month - 1, day);
}
function formatDateOnly(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function addDaysUtc(date, days) {
  const nextDate = new Date(date.getTime());
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}
function getDaysInMonth(year, monthIndex) {
  return createUtcDate(year, monthIndex + 1, 0).getUTCDate();
}
function createPeriodStartDate(year, monthIndex, startDay) {
  const day = Math.min(startDay, getDaysInMonth(year, monthIndex));
  return createUtcDate(year, monthIndex, day);
}
function getBudgetStartDay() {
  const rawDay = Number(state.household?.budget_start_day ?? 1);
  return clamp(Number.isFinite(rawDay) ? rawDay : 1, 1, 31);
}
function getLatestPeriodEndDate() {
  if (!state.periods.length) return null;
  const latestPeriod = state.periods.reduce((latest, period) => {
    if (!latest) return period;
    return period.end_date > latest.end_date ? period : latest;
  }, null);
  return parseDateOnly(latestPeriod?.end_date);
}
function getNextMonthlyPeriodPayload() {
  const startDay = getBudgetStartDay();
  const baseDate = getLatestPeriodEndDate() ? addDaysUtc(getLatestPeriodEndDate(), 1) : parseDateOnly(getToday());
  const year = baseDate.getUTCFullYear();
  const monthIndex = baseDate.getUTCMonth();
  const thisMonthStart = createPeriodStartDate(year, monthIndex, startDay);

  let periodStart = thisMonthStart;
  if (baseDate < thisMonthStart) {
    periodStart = createPeriodStartDate(year, monthIndex - 1, startDay);
  }

  const nextPeriodStart = createPeriodStartDate(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, startDay);
  const periodEnd = addDaysUtc(nextPeriodStart, -1);
  const periodName = `${CZECH_MONTH_NAMES[periodStart.getUTCMonth()]} ${periodStart.getUTCFullYear()}`;

  return {
    name: periodName,
    start_date: formatDateOnly(periodStart),
    end_date: formatDateOnly(periodEnd),
    status: 'active',
  };
}
function getCategoryNameOptions(selectedName = '') {
  const names = PRESET_CATEGORY_NAMES.includes(selectedName) || !selectedName ? PRESET_CATEGORY_NAMES : [selectedName, ...PRESET_CATEGORY_NAMES];
  return names.map((name) => `<option value="${name}" ${name === selectedName ? 'selected' : ''}>${name}</option>`).join('');
}
function getCategoryIconOptions(selectedIcon = '') {
  const hasSelected = PRESET_CATEGORY_ICONS.some((icon) => icon.value === selectedIcon);
  const options = hasSelected || !selectedIcon ? PRESET_CATEGORY_ICONS : [{ value: selectedIcon, label: 'Vlastní' }, ...PRESET_CATEGORY_ICONS];
  return options.map((icon) => `<option value="${icon.value}" ${icon.value === selectedIcon ? 'selected' : ''}>${icon.value} ${icon.label}</option>`).join('');
}
function getToday() {
  return new Date().toISOString().slice(0, 10);
}
function generateId() {
  return Math.random().toString(36).substr(2, 9);
}
function formatApiErrorMessage(error) {
  const message = String(error?.message || error || 'Neznámá chyba');
  if (message.includes('row-level security policy')) {
    return 'Přístup do databáze byl zablokován pravidly RLS. Spusťte SQL politiky ze souboru supabase.sql v Supabase SQL editoru.';
  }
  if (message.includes('JWT') || message.includes('Invalid token') || message.includes('401')) {
    return 'Neplatný nebo expirovaný Supabase klíč. Zkontrolujte SUPABASE_ANON_KEY.';
  }
  if (message.includes('PGRST204') || message.includes('Could not find the')) {
    return 'Nesoulad mezi app.js a databázovým schématem. Zkontrolujte sloupce v supabase.sql.';
  }
  if (message.includes('period_budgets') && (message.includes('401') || message.includes('permission denied') || message.includes('42501'))) {
    return 'Tabulka period_budgets není dostupná pro anon přístup. Spusťte aktualizované politiky ze souboru supabase.sql.';
  }
  return message;
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
function getPeriodBudgetRecord(categoryId, periodId) {
  if (!periodId) return null;
  return state.periodBudgets.find((budget) => budget.category_id === categoryId && budget.period_id === periodId) || null;
}
function getPreviousPeriod(period) {
  if (!period) return null;
  const previousPeriods = state.periods
    .filter((candidate) => candidate.id !== period.id && candidate.end_date < period.start_date)
    .sort((a, b) => b.end_date.localeCompare(a.end_date));
  return previousPeriods[0] || null;
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
  if (!period) {
    return { expenses: 0, baseBudget: safeNumber(category.default_budget), rolloverAmount: 0, manualAdjustment: 0, totalAvailable: safeNumber(category.default_budget), remaining: safeNumber(category.default_budget), usagePercent: 0, baseUsagePercent: 100 };
  }
  const expenses = getExpensesForCategory(category.id, period.id);
  const periodBudget = getPeriodBudgetRecord(category.id, period.id);
  const baseBudget = safeNumber(periodBudget?.base_budget ?? category.default_budget);
  const rolloverAmount = safeNumber(periodBudget?.rollover_amount ?? 0);
  const manualAdjustment = safeNumber(periodBudget?.manual_adjustment ?? 0);
  const computedAvailable = baseBudget + rolloverAmount + manualAdjustment;
  const totalAvailable = safeNumber(periodBudget?.total_available ?? computedAvailable);
  const remaining = totalAvailable - expenses;
  const usagePercent = totalAvailable > 0 ? (expenses / totalAvailable) * 100 : (expenses > 0 ? 100 : 0);
  const baseUsagePercent = baseBudget > 0 ? (totalAvailable / baseBudget) * 100 : 0;
  return { expenses, baseBudget, rolloverAmount, manualAdjustment, totalAvailable, remaining, usagePercent, baseUsagePercent };
}
function calculatePeriodSummary(period) {
  const tx = getTransactionsForPeriod(period.id);
  const incomes = tx.filter((t) => t.type === 'income').reduce((sum, t) => sum + safeNumber(t.amount), 0);
  const expenses = tx.filter((t) => t.type === 'expense').reduce((sum, t) => sum + safeNumber(t.amount), 0);
  const balance = incomes - expenses;
  const categories = state.categories.filter((c) => c.active !== false);
  const metricsByCategory = categories.map((category) => computeCategoryMetrics(category, period));
  const categoryBudgetTotal = metricsByCategory.reduce((sum, metrics) => sum + safeNumber(metrics.baseBudget), 0);
  const rolloverTotal = metricsByCategory.reduce((sum, metrics) => sum + safeNumber(metrics.rolloverAmount), 0);
  const availableTotal = metricsByCategory.reduce((sum, metrics) => sum + safeNumber(metrics.totalAvailable), 0);
  const spentTotal = metricsByCategory.reduce((sum, metrics) => sum + safeNumber(metrics.expenses), 0);
  const remainingTotal = availableTotal - spentTotal;
  return { incomes, expenses, balance, categoryBudgetTotal, rolloverTotal, availableTotal, spentTotal, remainingTotal };
}

async function createPeriodBudgetsForPeriod(period) {
  if (!period?.id) return;

  try {
    const existingBudgets = await supabaseCall('GET', 'period_budgets', { period_id: `eq.${period.id}`, limit: 1 });
    if (existingBudgets?.length) return;

    const previousPeriod = getPreviousPeriod(period);
    const activeCategories = state.categories.filter((category) => category.active !== false);
    if (!activeCategories.length) return;

    const budgetRows = activeCategories.map((category) => {
      const previousMetrics = previousPeriod ? computeCategoryMetrics(category, previousPeriod) : null;
      const rolloverAmount = Math.max(safeNumber(previousMetrics?.remaining ?? 0), 0);
      const baseBudget = safeNumber(category.default_budget);
      const manualAdjustment = 0;
      const totalAvailable = baseBudget + rolloverAmount + manualAdjustment;

      return {
        period_id: period.id,
        category_id: category.id,
        base_budget: baseBudget,
        rollover_amount: rolloverAmount,
        manual_adjustment: manualAdjustment,
        total_available: totalAvailable,
      };
    });

    await supabaseCall('POST', 'period_budgets', {}, budgetRows);
  } catch (error) {
    console.warn('Period budgets se nepodařilo vytvořit:', error);
  }
}

async function createBudgetForCategoryInCurrentPeriod(category) {
  const period = getPeriodById(state.currentPeriodId) || state.periods[0] || null;
  if (!period?.id || !category?.id) return;

  try {
    const existing = getPeriodBudgetRecord(category.id, period.id);
    if (existing) return;

    const previousPeriod = getPreviousPeriod(period);
    const previousMetrics = previousPeriod ? computeCategoryMetrics(category, previousPeriod) : null;
    const rolloverAmount = Math.max(safeNumber(previousMetrics?.remaining ?? 0), 0);
    const baseBudget = safeNumber(category.default_budget);

    await supabaseCall('POST', 'period_budgets', {}, {
      period_id: period.id,
      category_id: category.id,
      base_budget: baseBudget,
      rollover_amount: rolloverAmount,
      manual_adjustment: 0,
      total_available: baseBudget + rolloverAmount,
    });
  } catch (error) {
    console.warn('Rozpočet kategorie pro období se nepodařilo vytvořit:', error);
  }
}

// Supabase API calls using fetch
async function supabaseCall(method, table, filters = {}, data = null) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);

  if (method === 'GET') {
    url.searchParams.set('select', '*');
  }

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === 'all') {
      return;
    }
    if (Array.isArray(value)) {
      url.searchParams.set(key, value.join(','));
    } else {
      url.searchParams.set(key, value);
    }
  });

  url.searchParams.set('apikey', SUPABASE_ANON_KEY);

  const options = {
    method,
    mode: 'cors',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
  };
  
  if (method !== 'GET' && data) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url.toString(), options);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP ${response.status}`);
  }
  if (response.status === 204) {
    return null;
  }
  const responseText = await response.text();
  return responseText ? JSON.parse(responseText) : null;
}

async function ensureDefaultHousehold() {
  if (state.household?.id) return;
  try {
    const households = await supabaseCall('GET', 'households', { limit: 1 });
    if (households?.length) {
      state.household = households[0];
      return;
    }
    await supabaseCall('POST', 'households', {}, { name: 'Viki & Káťa', budget_start_day: 1 });
    const newHouseholds = await supabaseCall('GET', 'households', { limit: 1 });
    if (newHouseholds?.length) {
      state.household = newHouseholds[0];
    }
  } catch (error) {
    state.status = { type: 'error', message: 'Chyba při vytváření domácnosti: ' + formatApiErrorMessage(error) };
  }
}

async function loadAllData() {
  state.loading = true;
  render();
  try {
    await ensureDefaultHousehold();
    const [households, periods, categories, transactions] = await Promise.all([
      supabaseCall('GET', 'households', { limit: 1 }),
      supabaseCall('GET', 'budget_periods', { order: 'start_date.desc' }),
      supabaseCall('GET', 'categories', { order: 'name.asc' }),
      supabaseCall('GET', 'transactions', { order: 'transaction_date.desc' }),
    ]);

    let periodBudgets = [];
    try {
      periodBudgets = await supabaseCall('GET', 'period_budgets', { order: 'created_at.desc' });
    } catch (error) {
      console.warn('Period budgets nejsou dostupné:', error);
    }
    
    if (households?.length) {
      state.household = households[0];
    }
    state.periods = periods || [];
    state.categories = categories || [];
    state.periodBudgets = periodBudgets || [];
    state.transactions = transactions || [];

    if (!state.periods.some((period) => period.id === state.currentPeriodId)) {
      state.currentPeriodId = state.periods[0]?.id || null;
    }
    if (!state.currentPeriodId && state.periods.length) {
      state.currentPeriodId = state.periods[0].id;
    }
    state.status = null;
  } catch (error) {
    state.status = { type: 'error', message: 'Chyba při načítání: ' + formatApiErrorMessage(error) };
  }
  state.loading = false;
  render();
}

async function insertTransaction(formData) {
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
  if (!payload.household_id) {
    throw new Error('Neexistující domácnost. Prosím vytvořte domácnost nebo obnovte stránku.');
  }
  
  try {
    await supabaseCall('POST', 'transactions', {}, payload);
    state.status = { type: 'success', message: 'Transakce uložena.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: formatApiErrorMessage(error) };
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
    await supabaseCall('PATCH', 'transactions', { id: `eq.${id}` }, nextPayload);
    state.status = { type: 'success', message: 'Transakce upravena.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: formatApiErrorMessage(error) };
    state.loading = false;
    render();
  }
}

async function deleteTransaction(id) {
  if (!confirm('Opravdu chcete smazat transakci?')) return false;
  state.loading = true;
  render();
  
  try {
    await supabaseCall('DELETE', 'transactions', { id: `eq.${id}` });
    state.status = { type: 'success', message: 'Transakce smazána.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: formatApiErrorMessage(error) };
    state.loading = false;
    render();
  }
}

async function createPeriod(payload) {
  state.loading = true;
  render();
  
  const nextPayload = {
    ...payload,
    household_id: state.household.id,
  };
  
  try {
    await supabaseCall('POST', 'budget_periods', {}, nextPayload);
    const createdPeriods = await supabaseCall('GET', 'budget_periods', {
      household_id: `eq.${state.household.id}`,
      start_date: `eq.${nextPayload.start_date}`,
      end_date: `eq.${nextPayload.end_date}`,
      order: 'created_at.desc',
      limit: 1,
    });
    const createdPeriod = createdPeriods?.[0] || null;
    if (createdPeriod) {
      await createPeriodBudgetsForPeriod(createdPeriod);
    }
    state.status = { type: 'success', message: 'Období vytvořeno.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: formatApiErrorMessage(error) };
    state.loading = false;
    render();
  }
}

async function createCategory(payload) {
  state.loading = true;
  render();
  
  const nextPayload = {
    ...payload,
    household_id: state.household.id,
    active: true,
  };
  if (!nextPayload.household_id) {
    throw new Error('Neexistující domácnost. Prosím obnovte stránku.');
  }
  
  try {
    await supabaseCall('POST', 'categories', {}, nextPayload);
    const createdCategories = await supabaseCall('GET', 'categories', {
      household_id: `eq.${state.household.id}`,
      name: `eq.${nextPayload.name}`,
      order: 'created_at.desc',
      limit: 1,
    });
    const createdCategory = createdCategories?.[0] || null;
    if (createdCategory) {
      await createBudgetForCategoryInCurrentPeriod(createdCategory);
    }
    state.status = { type: 'success', message: 'Kategorie vytvořena.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: formatApiErrorMessage(error) };
    state.loading = false;
    render();
  }
}

async function updateCategory(id, payload) {
  state.loading = true;
  render();
  
  try {
    await supabaseCall('PATCH', 'categories', { id: `eq.${id}` }, payload);
    state.status = { type: 'success', message: 'Kategorie upravena.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: formatApiErrorMessage(error) };
    state.loading = false;
    render();
  }
}

async function updatePeriod(id, payload) {
  state.loading = true;
  render();
  
  try {
    await supabaseCall('PATCH', 'budget_periods', { id: `eq.${id}` }, payload);
    state.status = { type: 'success', message: 'Období upraveno.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: formatApiErrorMessage(error) };
    state.loading = false;
    render();
  }
}

async function deletePeriod(id) {
  if (!confirm('Opravdu chcete smazat období? Smažou se i navázané rozpočty období.')) return false;
  state.loading = true;
  render();

  try {
    await supabaseCall('DELETE', 'budget_periods', { id: `eq.${id}` });
    if (state.currentPeriodId === id) {
      const remaining = state.periods.filter((period) => period.id !== id);
      state.currentPeriodId = remaining[0]?.id || null;
    }
    state.status = { type: 'success', message: 'Období smazáno.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: formatApiErrorMessage(error) };
    state.loading = false;
    render();
  }
}

async function updateBudgetStartDay(startDay) {
  if (!state.household?.id) {
    state.status = { type: 'error', message: 'Nejdřív je potřeba vytvořit domácnost.' };
    render();
    return;
  }

  state.loading = true;
  render();

  try {
    await supabaseCall('PATCH', 'households', { id: `eq.${state.household.id}` }, { budget_start_day: startDay });
    state.household.budget_start_day = startDay;
    state.status = { type: 'success', message: 'Nastavení dne začátku období bylo uloženo.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: formatApiErrorMessage(error) };
    state.loading = false;
    render();
  }
}

// UI functions
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

// Render functions
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
          <h3>Srovnání s předchozím období</h3>
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
                  <div style="color:var(--muted); margin-top:6px; font-size:13px;">Rozpočet období ${formatCurrency(metrics.baseBudget)} · Převod ${formatCurrency(metrics.rolloverAmount)}</div>
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
  return `<div class="container"><div class="card"><div class="row" style="justify-content: space-between; align-items:center;"><h2>Správa rozpočtů</h2><button class="btn btn-primary" data-action="show-create-category">Přidat kategorii</button></div><div class="list" style="margin-top:12px;">${state.categories.length ? state.categories.map((category) => `<div class="list-item"><strong>${category.icon || '📦'} ${category.name}</strong><div class="row" style="margin-top:8px;"><button class="btn btn-secondary" data-action="edit-category" data-id="${category.id}">Upravit</button><button class="btn btn-secondary" data-action="toggle-category" data-id="${category.id}">${category.active === false ? 'Aktivovat' : 'Deaktivovat'}</button></div></div>`).join('') : '<div class="empty">Žádné kategorie</div>'}</div></div></div>`;
}

function renderPeriods() {
  const nextPeriod = getNextMonthlyPeriodPayload();
  return `<div class="container"><div class="card"><h2>Nastavení období</h2><form id="period-start-day-form" class="row" style="margin-top:12px; gap:12px; align-items:end;"><label style="max-width:240px;">Začátek rozpočtového měsíce (1-31)<input id="budget-start-day" name="budget_start_day" type="number" min="1" max="31" required value="${getBudgetStartDay()}"></label><button class="btn btn-secondary" type="submit">Uložit den</button></form><p style="color:var(--muted); margin-top:10px;">Další období se bude tvořit automaticky od zvoleného dne.</p></div><div class="card" style="margin-top:16px;"><div class="row" style="justify-content: space-between; align-items:center;"><h2>Správa období</h2><button class="btn btn-primary" data-action="show-create-period">Vytvořit další měsíc</button></div><div class="list" style="margin-top:12px;"><div class="list-item"><strong>Následující období</strong><div style="color:var(--muted); margin-top:6px;">${nextPeriod.name} · ${nextPeriod.start_date} → ${nextPeriod.end_date}</div></div>${state.periods.length ? state.periods.map((period) => `<div class="list-item"><strong>${period.name}</strong><div style="color:var(--muted); margin-top:6px;">${period.start_date} → ${period.end_date}</div><div class="row" style="margin-top:8px;"><button class="btn btn-secondary" data-action="edit-period" data-id="${period.id}">Upravit</button><button class="btn btn-danger" data-action="delete-period" data-id="${period.id}">Smazat</button></div></div>`).join('') : '<div class="empty">Žádná období</div>'}</div></div></div>`;
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
  document.querySelectorAll('[data-action="delete-period"]').forEach((btn) => btn.addEventListener('click', () => deletePeriod(btn.dataset.id)));
  document.getElementById('period-start-day-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const nextStartDay = Number(document.getElementById('budget-start-day')?.value);
    if (!Number.isInteger(nextStartDay) || nextStartDay < 1 || nextStartDay > 31) {
      state.status = { type: 'error', message: 'Den začátku období musí být číslo od 1 do 31.' };
      render();
      return;
    }
    updateBudgetStartDay(nextStartDay);
  });
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
  const selectedName = category?.name || PRESET_CATEGORY_NAMES[0];
  const selectedIcon = category?.icon || CATEGORY_ICON_BY_NAME[selectedName] || '📦';
  const form = `
    <div class="modal-card">
      <div class="row" style="justify-content: space-between; align-items:center;">
        <h3>${category ? 'Upravit kategorii' : 'Nová kategorie'}</h3>
        <button class="btn btn-secondary" id="close-modal">Zavřít</button>
      </div>
      <form id="category-form" class="form-grid" style="margin-top:12px;">
        <label>Název<select name="name" id="category-name" required>${getCategoryNameOptions(selectedName)}</select></label>
        <label>Ikona<select name="icon" id="category-icon">${getCategoryIconOptions(selectedIcon)}</select></label>
        <label>Výchozí rozpočet<input name="default_budget" type="number" step="0.01" value="${category?.default_budget || 0}"></label>
        <button class="btn btn-primary" type="submit" ${state.loading ? 'disabled' : ''}>${category ? 'Uložit' : 'Přidat'}</button>
      </form>
    </div>`;
  showModal(form);
  document.getElementById('close-modal').addEventListener('click', closeModal);
  const nameSelect = document.getElementById('category-name');
  const iconSelect = document.getElementById('category-icon');
  let iconWasChanged = false;
  iconSelect?.addEventListener('change', () => {
    iconWasChanged = true;
  });
  nameSelect?.addEventListener('change', (event) => {
    if (iconWasChanged || category) return;
    const suggestedIcon = CATEGORY_ICON_BY_NAME[event.target.value];
    if (suggestedIcon && iconSelect) {
      iconSelect.value = suggestedIcon;
    }
  });
  document.getElementById('category-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    payload.default_budget = Number(payload.default_budget);
    if (!category) {
      payload.active = true;
      payload.type = 'expense';
    }
    if (category) {
      updateCategory(category.id, payload);
    } else {
      createCategory(payload);
    }
    closeModal();
  });
}

function showPeriodModal(periodId = null) {
  const period = state.periods.find((item) => item.id === periodId) || null;
  const nextPeriod = getNextMonthlyPeriodPayload();
  const formData = period || nextPeriod;
  const form = `
    <div class="modal-card">
      <div class="row" style="justify-content: space-between; align-items:center;">
        <h3>${period ? 'Upravit období' : 'Nové období'}</h3>
        <button class="btn btn-secondary" id="close-modal">Zavřít</button>
      </div>
      <form id="period-form" class="form-grid" style="margin-top:12px;">
        <label>Název<input name="name" required ${period ? '' : 'readonly'} value="${formData.name}"></label>
        <label>Začátek<input name="start_date" type="date" required ${period ? '' : 'readonly'} value="${formData.start_date}"></label>
        <label>Konec<input name="end_date" type="date" required ${period ? '' : 'readonly'} value="${formData.end_date}"></label>
        ${period ? '' : '<p style="color:var(--muted); margin:0;">Období se počítá automaticky podle nastaveného dne začátku měsíce.</p>'}
        <div class="row">
          <button class="btn btn-primary" type="submit" ${state.loading ? 'disabled' : ''}>${period ? 'Uložit' : 'Vytvořit'}</button>
          ${period ? '<button class="btn btn-danger" type="button" id="delete-period-modal">Smazat období</button>' : ''}
        </div>
      </form>
    </div>`;
  showModal(form);
  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.getElementById('period-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    payload.status = period?.status || 'active';
    if (period) {
      updatePeriod(period.id, payload);
    } else {
      createPeriod(nextPeriod);
    }
    closeModal();
  });
  document.getElementById('delete-period-modal')?.addEventListener('click', () => {
    deletePeriod(period.id);
    closeModal();
  });
}

function showCategoryDetailModal(categoryId) {
  const category = state.categories.find((c) => c.id === categoryId);
  const period = getPeriodById(state.currentPeriodId) || state.periods[0] || null;
  const transactions = state.transactions.filter((t) => t.category_id === categoryId && t.type === 'expense');
  const metrics = period && category ? computeCategoryMetrics(category, period) : { expenses:0, baseBudget:0, rolloverAmount:0, manualAdjustment:0, totalAvailable:0, remaining:0, usagePercent:0 };
  showModal(`
    <div class="modal-card">
      <div class="row" style="justify-content: space-between; align-items:center;">
        <h3>${category?.name || 'Kategorie'}</h3>
        <button class="btn btn-secondary" id="close-modal">Zavřít</button>
      </div>
      <div class="list" style="margin-top:12px;">
        <div class="list-item">Rozpočet období: ${formatCurrency(metrics.baseBudget || 0)}</div>
        <div class="list-item">Převedeno z minulého: ${formatCurrency(metrics.rolloverAmount || 0)}</div>
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

loadAllData();
