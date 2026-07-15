const SUPABASE_URL = 'https://kzucqgkbzmwcjzdhlbgj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6dWNxZ2tiem13Y2p6ZGhsYmdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNDEwMTksImV4cCI6MjA5OTYxNzAxOX0.BfwqRhXJcHZHZdku2_pl1yw61BnpfKAys-tThzzXDVI';

let currentView = 'dashboard';
let state = {
  household: { id: null, name: 'Viki & Káťa', budget_start_day: 1 },
  periods: [],
  categories: [],
  subcategories: [],
  periodBudgets: [],
  recurringTransactions: [],
  transactions: [],
  currentPeriodId: null,
  lastPeriodAutoPromptDate: null,
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
const PERSONAL_BUDGETS = [
  { name: 'Osobní Viki', icon: '👩', amount: 4000 },
  { name: 'Osobní Káťa', icon: '🧑', amount: 4000 },
];
const DEFAULT_CATEGORY_LIBRARY = [
  { name: 'Nájem', icon: '🏠', type: 'expense' },
  { name: 'Potraviny', icon: '🛒', type: 'expense', split_mode: 'half', split_by_person: true },
  { name: 'Pohonné hmoty', icon: '⛽', type: 'expense' },
  { name: 'Drogerie', icon: '🧴', type: 'expense' },
  { name: 'Psi', icon: '🐶', type: 'expense' },
  { name: 'TV/Internet', icon: '📺', type: 'expense' },
  { name: 'Předplatné', icon: '📲', type: 'expense' },
  { name: 'Jídlo v práci', icon: '🍱', type: 'expense', split_mode: 'custom', split_by_person: true, split_viki_amount: 0, split_kata_amount: 0 },
  { name: 'Úvěr', icon: '🏦', type: 'expense' },
  { name: 'Výplata Káťa', icon: '💼', type: 'income' },
  { name: 'Výplata Viki', icon: '💼', type: 'income' },
  { name: 'Příjem', icon: '💰', type: 'income' },
];
const DEFAULT_SUBCATEGORY_LIBRARY = {
  'Nájem': ['Nájem', 'Elektřina', 'Služby'],
  'Potraviny': ['Penny', 'Lidl', 'Albert', 'Tesco'],
  'TV/Internet': ['Vodafone', 'O2'],
  'Předplatné': ['Netflix', 'ChatGPT', 'Oneplay', 'iCloud', 'Google Cloud'],
  'Příjem': ['Veru K.', 'Veru G.', 'Ostatní'],
  'Úvěr': ['Úvěr 1', 'Úvěr 2', 'Úvěr 3'],
  'Pohonné hmoty': ['Modrá', 'Černá'],
  'Psi': ['Meggie', 'Džejna'],
};

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
function getSubcategoryById(id) {
  return state.subcategories.find((s) => s.id === id) || null;
}
function getSubcategoriesForCategory(categoryId) {
  return state.subcategories.filter((subcategory) => subcategory.category_id === categoryId).sort((a, b) => String(a.name).localeCompare(String(b.name), 'cs'));
}
function getTransactionsForPeriod(periodId) {
  return state.transactions.filter((t) => t.period_id === periodId);
}
function getPeriodBudgetRecord(categoryId, periodId) {
  if (!periodId) return null;
  return state.periodBudgets.find((budget) => budget.category_id === categoryId && budget.period_id === periodId) || null;
}
function getCurrentPeriod() {
  return getPeriodById(state.currentPeriodId) || state.periods[0] || null;
}
function getPeriodsChronologically() {
  return [...state.periods].sort((a, b) => {
    const startCmp = String(a.start_date).localeCompare(String(b.start_date));
    if (startCmp !== 0) return startCmp;
    const endCmp = String(a.end_date).localeCompare(String(b.end_date));
    if (endCmp !== 0) return endCmp;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
}
function getPreviousPeriod(period) {
  if (!period) return null;
  const strictPrevious = state.periods
    .filter((candidate) => candidate.id !== period.id && candidate.end_date < period.start_date)
    .sort((a, b) => b.end_date.localeCompare(a.end_date));
  if (strictPrevious[0]) {
    return strictPrevious[0];
  }

  const sorted = getPeriodsChronologically();
  const currentIndex = sorted.findIndex((item) => item.id === period.id);
  if (currentIndex <= 0) return null;
  return sorted[currentIndex - 1] || null;
}
function getPeriodForDate(dateValue) {
  const matchingPeriod = getPeriodByDate(dateValue);
  return matchingPeriod?.id || null;
}
function getPeriodByDate(dateValue) {
  const matches = state.periods.filter((period) => dateValue >= period.start_date && dateValue <= period.end_date);
  if (!matches.length) return null;
  return matches.sort((a, b) => {
    const startCmp = String(b.start_date).localeCompare(String(a.start_date));
    if (startCmp !== 0) return startCmp;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  })[0] || null;
}
function hasOverlappingPeriod(startDate, endDate, excludedPeriodId = null) {
  return state.periods.some((period) => {
    if (excludedPeriodId && period.id === excludedPeriodId) return false;
    return !(endDate < period.start_date || startDate > period.end_date);
  });
}
function getConfirmedSalariesTotal(periodId) {
  if (!hasBothSalariesInPeriod(periodId)) {
    return 0;
  }
  return state.transactions
    .filter((t) => t.period_id === periodId && t.type === 'income' && (t.paid_by === 'Viki' || t.paid_by === 'Káťa'))
    .reduce((sum, t) => sum + safeNumber(t.amount), 0);
}
function computeTargetBudgetForCategory(category, periodId) {
  const fixedBudget = safeNumber(category.default_budget);
  if (fixedBudget > 0) {
    return fixedBudget;
  }
  const percentBudget = safeNumber(category.allocation_percent);
  if (percentBudget <= 0) {
    return 0;
  }
  const salaryBase = getConfirmedSalariesTotal(periodId);
  if (salaryBase <= 0) {
    return 0;
  }
  return Math.round((salaryBase * percentBudget) / 100);
}
function getExpensesForCategory(categoryId, periodId) {
  return state.transactions.filter((t) => t.category_id === categoryId && t.type === 'expense' && t.period_id === periodId).reduce((sum, t) => sum + safeNumber(t.amount), 0);
}
function getEarliestPeriod() {
  if (!state.periods.length) return null;
  return [...state.periods].sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
}
function isSamePeriod(a, b) {
  return a?.id && b?.id && a.id === b.id;
}
function getOpeningBalanceForPeriod(period) {
  if (!period) return safeNumber(state.household?.initial_balance ?? 0);
  if (period.opening_balance_override !== null && period.opening_balance_override !== undefined) {
    return safeNumber(period.opening_balance_override);
  }
  const previousPeriod = getPreviousPeriod(period);
  if (!previousPeriod) {
    return safeNumber(state.household?.initial_balance ?? 0);
  }
  return getClosingBalanceForPeriod(previousPeriod);
}
function getIncomesTotalForPeriod(periodId) {
  return state.transactions
    .filter((t) => t.period_id === periodId && t.type === 'income')
    .reduce((sum, t) => sum + safeNumber(t.amount), 0);
}
function getExpensesTotalForPeriod(periodId) {
  return state.transactions
    .filter((t) => t.period_id === periodId && t.type === 'expense')
    .reduce((sum, t) => sum + safeNumber(t.amount), 0);
}
function getClosingBalanceForPeriod(period) {
  if (!period) return 0;
  const opening = getOpeningBalanceForPeriod(period);
  const incomes = getIncomesTotalForPeriod(period.id);
  const expenses = getExpensesTotalForPeriod(period.id);
  return opening + incomes - expenses;
}
function hasBothSalariesInPeriod(periodId) {
  const tx = state.transactions.filter((t) => t.period_id === periodId && t.type === 'income');
  const hasViki = tx.some((t) => t.paid_by === 'Viki');
  const hasKata = tx.some((t) => t.paid_by === 'Káťa');
  return hasViki && hasKata;
}
function addMonthsWithDayRule(dateValue, monthsToAdd, strategy = 'last_day', customDay = null) {
  const source = parseDateOnly(dateValue);
  const targetYear = source.getUTCFullYear();
  const targetMonth = source.getUTCMonth() + monthsToAdd;
  const baseDate = createUtcDate(targetYear, targetMonth, 1);
  const desiredDay = strategy === 'custom_day' && customDay ? clamp(Number(customDay), 1, 31) : source.getUTCDate();
  const maxDay = getDaysInMonth(baseDate.getUTCFullYear(), baseDate.getUTCMonth());
  const resolvedDay = desiredDay <= maxDay ? desiredDay : (strategy === 'custom_day' ? Math.min(clamp(Number(customDay), 1, 31), maxDay) : maxDay);
  return formatDateOnly(createUtcDate(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), resolvedDay));
}
function computeNextRecurringDate(rule, fromDate) {
  if (!rule) return null;
  const frequency = rule.frequency;
  if (frequency === 'weekly') {
    return formatDateOnly(addDaysUtc(parseDateOnly(fromDate), 7));
  }
  if (frequency === 'monthly') {
    return addMonthsWithDayRule(fromDate, 1, rule.day_overflow_strategy, rule.custom_day);
  }
  if (frequency === 'semiannual') {
    return addMonthsWithDayRule(fromDate, 6, rule.day_overflow_strategy, rule.custom_day);
  }
  if (frequency === 'yearly') {
    return addMonthsWithDayRule(fromDate, 12, rule.day_overflow_strategy, rule.custom_day);
  }
  return null;
}
function computeCategoryMetrics(category, period) {
  if (!period) {
    const fallbackBudget = safeNumber(category.default_budget);
    return { expenses: 0, baseBudget: fallbackBudget, rolloverAmount: 0, manualAdjustment: 0, totalAvailable: fallbackBudget, remaining: fallbackBudget, usagePercent: 0, baseUsagePercent: 100 };
  }
  const expenses = getExpensesForCategory(category.id, period.id);
  const periodBudget = getPeriodBudgetRecord(category.id, period.id);
  const baseBudget = safeNumber(periodBudget?.base_budget ?? computeTargetBudgetForCategory(category, period.id));
  const previousPeriod = getPreviousPeriod(period);
  const previousMetrics = previousPeriod ? computeCategoryMetrics(category, previousPeriod) : null;
  const rolloverAmount = safeNumber(previousMetrics?.remaining ?? 0);
  const manualAdjustment = safeNumber(periodBudget?.manual_adjustment ?? 0);
  const computedAvailable = baseBudget + rolloverAmount + manualAdjustment;
  const totalAvailable = computedAvailable;
  const remaining = totalAvailable - expenses;
  const usagePercent = totalAvailable > 0 ? (expenses / totalAvailable) * 100 : (expenses > 0 ? 100 : 0);
  const baseUsagePercent = baseBudget > 0 ? (totalAvailable / baseBudget) * 100 : 0;
  return { expenses, baseBudget, rolloverAmount, manualAdjustment, totalAvailable, remaining, usagePercent, baseUsagePercent };
}

function computeCategoryPersonSplit(category, periodId, totalBudget) {
  const splitMode = category?.split_mode || (category?.split_by_person ? 'half' : 'none');
  if (splitMode === 'none') {
    return null;
  }
  const safeBudget = safeNumber(totalBudget);
  let vikiBudget = safeBudget / 2;
  let kataBudget = safeBudget / 2;
  if (splitMode === 'custom') {
    vikiBudget = safeNumber(category.split_viki_amount);
    kataBudget = safeNumber(category.split_kata_amount);
  }
  const personSpend = { viki: 0, kata: 0 };
  const ratioTotal = vikiBudget + kataBudget;

  state.transactions
    .filter((transaction) => transaction.period_id === periodId && transaction.category_id === category.id && transaction.type === 'expense')
    .forEach((transaction) => {
      const amount = safeNumber(transaction.amount);
      if (transaction.paid_by === 'Viki') {
        personSpend.viki += amount;
      } else if (transaction.paid_by === 'Káťa') {
        personSpend.kata += amount;
      } else {
        const vikiRatio = ratioTotal > 0 ? (vikiBudget / ratioTotal) : 0.5;
        personSpend.viki += amount * vikiRatio;
        personSpend.kata += amount * (1 - vikiRatio);
      }
    });

  return {
    mode: splitMode,
    vikiBudget,
    kataBudget,
    vikiSpent: personSpend.viki,
    kataSpent: personSpend.kata,
    vikiRemaining: vikiBudget - personSpend.viki,
    kataRemaining: kataBudget - personSpend.kata,
  };
}
function calculatePeriodSummary(period) {
  const tx = getTransactionsForPeriod(period.id);
  const incomes = tx.filter((t) => t.type === 'income').reduce((sum, t) => sum + safeNumber(t.amount), 0);
  const expenses = tx.filter((t) => t.type === 'expense').reduce((sum, t) => sum + safeNumber(t.amount), 0);
  const openingBalance = getOpeningBalanceForPeriod(period);
  const balance = openingBalance + incomes - expenses;
  const categories = state.categories.filter((c) => c.active !== false);
  const metricsByCategory = categories.map((category) => computeCategoryMetrics(category, period));
  const categoryBudgetTotal = metricsByCategory.reduce((sum, metrics) => sum + safeNumber(metrics.baseBudget), 0);
  const rolloverTotal = metricsByCategory.reduce((sum, metrics) => sum + safeNumber(metrics.rolloverAmount), 0);
  const manualAdjustmentTotal = metricsByCategory.reduce((sum, metrics) => sum + safeNumber(metrics.manualAdjustment), 0);
  const availableTotal = metricsByCategory.reduce((sum, metrics) => sum + safeNumber(metrics.totalAvailable), 0);
  const spentTotal = metricsByCategory.reduce((sum, metrics) => sum + safeNumber(metrics.expenses), 0);
  const remainingTotal = availableTotal - spentTotal;
  const plannedTotal = categoryBudgetTotal + manualAdjustmentTotal;
  const freeCash = balance - plannedTotal;
  return { incomes, expenses, openingBalance, balance, categoryBudgetTotal, rolloverTotal, manualAdjustmentTotal, availableTotal, spentTotal, remainingTotal, plannedTotal, freeCash };
}

function roundMoney(value) {
  return Math.round(safeNumber(value) * 100) / 100;
}

async function syncPeriodBudgetRollovers() {
  if (!state.periods.length || !state.categories.length) return;

  const periodsAsc = [...state.periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const categories = state.categories.filter((category) => category.active !== false);
  let hasChanges = false;

  for (const period of periodsAsc) {
    const previousPeriod = getPreviousPeriod(period);

    for (const category of categories) {
      const existing = getPeriodBudgetRecord(category.id, period.id);
      const baseBudget = roundMoney(existing?.base_budget ?? computeTargetBudgetForCategory(category, period.id));
      const manualAdjustment = roundMoney(existing?.manual_adjustment ?? 0);
      const previousMetrics = previousPeriod ? computeCategoryMetrics(category, previousPeriod) : null;
      const rolloverAmount = roundMoney(previousMetrics?.remaining ?? 0);
      const totalAvailable = roundMoney(baseBudget + manualAdjustment + rolloverAmount);

      if (!existing?.id) {
        await supabaseCall('POST', 'period_budgets', {}, {
          period_id: period.id,
          category_id: category.id,
          base_budget: baseBudget,
          rollover_amount: rolloverAmount,
          manual_adjustment: manualAdjustment,
          total_available: totalAvailable,
        });
        state.periodBudgets.push({
          id: generateId(),
          period_id: period.id,
          category_id: category.id,
          base_budget: baseBudget,
          rollover_amount: rolloverAmount,
          manual_adjustment: manualAdjustment,
          total_available: totalAvailable,
        });
        hasChanges = true;
        continue;
      }

      const storedRollover = roundMoney(existing.rollover_amount);
      const storedTotal = roundMoney(existing.total_available);

      if (Math.abs(storedRollover - rolloverAmount) > 0.009 || Math.abs(storedTotal - totalAvailable) > 0.009) {
        await supabaseCall('PATCH', 'period_budgets', { id: `eq.${existing.id}` }, {
          rollover_amount: rolloverAmount,
          total_available: totalAvailable,
        });
        existing.rollover_amount = rolloverAmount;
        existing.total_available = totalAvailable;
        hasChanges = true;
      }
    }
  }

  if (hasChanges) {
    const periodIds = state.periods.map((period) => period.id).join(',');
    if (periodIds) {
      state.periodBudgets = await supabaseCall('GET', 'period_budgets', { period_id: `in.(${periodIds})`, order: 'created_at.desc' });
    }
  }
}

async function syncTransactionPeriodsByDate() {
  if (!state.transactions.length) return;

  for (const transaction of state.transactions) {
    const mappedPeriodId = getPeriodForDate(transaction.transaction_date);
    if (!mappedPeriodId || mappedPeriodId === transaction.period_id) continue;

    await supabaseCall('PATCH', 'transactions', { id: `eq.${transaction.id}` }, {
      period_id: mappedPeriodId,
    });
    transaction.period_id = mappedPeriodId;
  }
}

async function ensureCurrentPeriodWithConfirmation() {
  const today = getToday();
  if (getPeriodByDate(today)) {
    return;
  }
  if (state.lastPeriodAutoPromptDate === today) {
    return;
  }

  state.lastPeriodAutoPromptDate = today;
  const nextPeriod = getNextMonthlyPeriodPayload();
  const shouldCreate = confirm(`Není vytvořené období pro dnešní datum. Chceš vytvořit období ${nextPeriod.name} (${nextPeriod.start_date} - ${nextPeriod.end_date})?`);
  if (!shouldCreate) {
    return;
  }
  await createPeriod(nextPeriod);
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
      const rolloverAmount = safeNumber(previousMetrics?.remaining ?? 0);
      const baseBudget = computeTargetBudgetForCategory(category, period.id);
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
    const rolloverAmount = safeNumber(previousMetrics?.remaining ?? 0);
    const baseBudget = computeTargetBudgetForCategory(category, period.id);

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

async function saveCategoryBudgetForCurrentPeriod(categoryId, baseBudget, manualAdjustment) {
  const period = getCurrentPeriod();
  const category = getCategoryById(categoryId);
  if (!period?.id || !category?.id) {
    state.status = { type: 'error', message: 'Nejprve vyber platné období a kategorii.' };
    render();
    return;
  }

  state.loading = true;
  render();

  try {
    const existing = getPeriodBudgetRecord(category.id, period.id);
    const previousPeriod = getPreviousPeriod(period);
    const previousMetrics = previousPeriod ? computeCategoryMetrics(category, previousPeriod) : null;
    const rolloverAmount = safeNumber(previousMetrics?.remaining ?? 0);
    const totalAvailable = safeNumber(baseBudget) + safeNumber(rolloverAmount) + safeNumber(manualAdjustment);

    if (existing?.id) {
      await supabaseCall('PATCH', 'period_budgets', { id: `eq.${existing.id}` }, {
        base_budget: safeNumber(baseBudget),
        manual_adjustment: safeNumber(manualAdjustment),
        total_available: totalAvailable,
      });
    } else {
      await supabaseCall('POST', 'period_budgets', {}, {
        period_id: period.id,
        category_id: category.id,
        base_budget: safeNumber(baseBudget),
        rollover_amount: safeNumber(rolloverAmount),
        manual_adjustment: safeNumber(manualAdjustment),
        total_available: totalAvailable,
      });
    }

    state.status = { type: 'success', message: `Rozpočet kategorie ${category.name} byl uložen.` };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: formatApiErrorMessage(error) };
    state.loading = false;
    render();
  }
}

async function cleanupDuplicatePersonalCategories() {
  if (!state.household?.id || !state.categories.length) return;

  const normalizeName = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const personalNames = new Set(PERSONAL_BUDGETS.map((item) => normalizeName(item.name)));
  const grouped = new Map();

  state.categories.forEach((category) => {
    const nameKey = normalizeName(category.name);
    if (!personalNames.has(nameKey)) return;
    if (!grouped.has(nameKey)) {
      grouped.set(nameKey, []);
    }
    grouped.get(nameKey).push(category);
  });

  for (const rows of grouped.values()) {
    if (rows.length <= 1) continue;
    const sorted = [...rows].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
    const keeper = sorted[0];
    const duplicates = sorted.slice(1);
    for (const duplicate of duplicates) {
      await supabaseCall('PATCH', 'transactions', { category_id: `eq.${duplicate.id}`, household_id: `eq.${state.household.id}` }, { category_id: keeper.id });
      await supabaseCall('PATCH', 'period_budgets', { category_id: `eq.${duplicate.id}` }, { category_id: keeper.id });
      await supabaseCall('DELETE', 'categories', { id: `eq.${duplicate.id}` });
    }
  }
}

async function ensureDefaultCategoryLibrary() {
  if (!state.household?.id) return;
  if (state.categories.length) return;
  const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const existingByName = new Map(state.categories.map((category) => [normalize(category.name), category]));

  for (const template of DEFAULT_CATEGORY_LIBRARY) {
    if (existingByName.has(normalize(template.name))) continue;
    await supabaseCall('POST', 'categories', {}, {
      household_id: state.household.id,
      name: template.name,
      icon: template.icon || '📦',
      type: template.type || 'expense',
      active: true,
      default_budget: 0,
      allocation_percent: 0,
      split_by_person: template.split_by_person === true,
      split_mode: template.split_mode || 'none',
      split_viki_amount: safeNumber(template.split_viki_amount),
      split_kata_amount: safeNumber(template.split_kata_amount),
    });
  }
}

async function ensureDefaultSubcategoryLibrary() {
  if (!state.household?.id || !state.categories.length) return;

  const categoryByName = new Map(state.categories.map((category) => [category.name, category]));
  const existing = await supabaseCall('GET', 'subcategories', {
    household_id: `eq.${state.household.id}`,
    order: 'name.asc',
  });
  if ((existing || []).length) return;
  const existingKeys = new Set((existing || []).map((item) => `${item.category_id}::${String(item.name).toLowerCase()}`));

  for (const [categoryName, names] of Object.entries(DEFAULT_SUBCATEGORY_LIBRARY)) {
    const category = categoryByName.get(categoryName);
    if (!category) continue;
    for (const name of names) {
      const key = `${category.id}::${String(name).toLowerCase()}`;
      if (existingKeys.has(key)) continue;
      await supabaseCall('POST', 'subcategories', {}, {
        household_id: state.household.id,
        category_id: category.id,
        name,
        icon: category.icon || '📦',
        active: true,
      });
      existingKeys.add(key);
    }
  }
}

function resolveRecurringDateForCreation(baseDate, strategy, customDay) {
  const source = parseDateOnly(baseDate);
  const maxDay = getDaysInMonth(source.getUTCFullYear(), source.getUTCMonth());
  const day = source.getUTCDate();
  if (day <= maxDay) return formatDateOnly(source);
  if (strategy === 'custom_day') {
    const chosen = clamp(Number(customDay), 1, 31);
    return formatDateOnly(createUtcDate(source.getUTCFullYear(), source.getUTCMonth(), Math.min(chosen, maxDay)));
  }
  return formatDateOnly(createUtcDate(source.getUTCFullYear(), source.getUTCMonth(), maxDay));
}

async function runRecurringTransactionsForToday() {
  const today = getToday();
  const dueRules = state.recurringTransactions.filter((rule) => rule.active !== false && rule.next_run_date <= today);

  for (const rule of dueRules) {
    let nextDate = rule.next_run_date;
    let guard = 0;

    while (nextDate <= today && guard < 36) {
      const targetPeriodId = getPeriodForDate(nextDate);
      await supabaseCall('POST', 'transactions', {}, {
        household_id: state.household.id,
        period_id: targetPeriodId,
        type: rule.type,
        amount: safeNumber(rule.amount),
        category_id: rule.type === 'expense' ? rule.category_id : null,
        paid_by: rule.paid_by,
        transaction_date: nextDate,
        note: rule.note || '[Auto] Opakovaná transakce',
      });

      nextDate = computeNextRecurringDate(rule, nextDate);
      guard += 1;
    }

    await supabaseCall('PATCH', 'recurring_transactions', { id: `eq.${rule.id}` }, {
      next_run_date: nextDate,
      updated_at: new Date().toISOString(),
    });
  }
}

async function applyBudgetAllocationForPeriod(period, options = { askConfirmation: true }) {
  if (!period?.id) return;
  if (!hasBothSalariesInPeriod(period.id)) return;
  if (period.allocation_confirmed) return;

  const categories = state.categories.filter((category) => category.active !== false);
  const plannedBase = categories.reduce((sum, category) => sum + computeTargetBudgetForCategory(category, period.id), 0);
  const availableCash = getOpeningBalanceForPeriod(period) + getIncomesTotalForPeriod(period.id);
  const delta = availableCash - plannedBase;
  const needsWarning = plannedBase > availableCash;

  if (options.askConfirmation) {
    const warningText = needsWarning
      ? `Pozor: rozpočty převyšují dostupnou částku o ${formatCurrency(Math.abs(delta))}. Pokračovat?`
      : `Rozdělit ${formatCurrency(plannedBase)} do rozpočtů pro období ${period.name}?`;
    if (!confirm(warningText)) {
      state.status = { type: 'info', message: 'Rozdělení rozpočtů bylo zrušeno.' };
      render();
      return;
    }
  }

  await createPeriodBudgetsForPeriod(period);
  await supabaseCall('PATCH', 'budget_periods', { id: `eq.${period.id}` }, {
    allocation_confirmed: true,
    updated_at: new Date().toISOString(),
  });
  state.status = {
    type: 'success',
    message: `Rozpočty pro období ${period.name} byly rozděleny. Volná částka: ${formatCurrency(delta)}.`,
  };
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
    await supabaseCall('POST', 'households', {}, { name: 'Viki & Káťa', budget_start_day: 1, initial_balance: 0 });
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
    const householdId = state.household?.id;
    if (!householdId) {
      throw new Error('Domácnost nebyla nalezena.');
    }

    const [households, periods, categories, transactions, recurringTransactions] = await Promise.all([
      supabaseCall('GET', 'households', { id: `eq.${householdId}`, limit: 1 }),
      supabaseCall('GET', 'budget_periods', { household_id: `eq.${householdId}`, order: 'start_date.desc' }),
      supabaseCall('GET', 'categories', { household_id: `eq.${householdId}`, order: 'name.asc' }),
      supabaseCall('GET', 'transactions', { household_id: `eq.${householdId}`, order: 'transaction_date.desc' }),
      supabaseCall('GET', 'recurring_transactions', { household_id: `eq.${householdId}`, order: 'created_at.desc' }),
    ]);

    let periodBudgets = [];
    try {
      if (periods?.length) {
        const periodIds = periods.map((period) => period.id).join(',');
        periodBudgets = await supabaseCall('GET', 'period_budgets', { period_id: `in.(${periodIds})`, order: 'created_at.desc' });
      }
    } catch (error) {
      console.warn('Period budgets nejsou dostupné:', error);
    }
    
    if (households?.length) {
      state.household = households[0];
    }
    state.periods = periods || [];
    state.categories = categories || [];
    state.periodBudgets = periodBudgets || [];
    state.recurringTransactions = recurringTransactions || [];
    state.transactions = transactions || [];

    await ensureDefaultCategoryLibrary();
    state.categories = await supabaseCall('GET', 'categories', { household_id: `eq.${householdId}`, order: 'name.asc' });
    await cleanupDuplicatePersonalCategories();
    state.categories = await supabaseCall('GET', 'categories', { household_id: `eq.${householdId}`, order: 'name.asc' });
    try {
      await ensureDefaultSubcategoryLibrary();
      state.subcategories = await supabaseCall('GET', 'subcategories', { household_id: `eq.${householdId}`, order: 'name.asc' });
    } catch (error) {
      console.warn('Subcategories nejsou dostupné:', error);
      state.subcategories = [];
    }

    if (state.recurringTransactions.length) {
      await runRecurringTransactionsForToday();
      state.recurringTransactions = await supabaseCall('GET', 'recurring_transactions', { household_id: `eq.${householdId}`, order: 'created_at.desc' });
      state.transactions = await supabaseCall('GET', 'transactions', { household_id: `eq.${householdId}`, order: 'transaction_date.desc' });
    }

    await syncTransactionPeriodsByDate();
    state.transactions = await supabaseCall('GET', 'transactions', { household_id: `eq.${householdId}`, order: 'transaction_date.desc' });
    await syncPeriodBudgetRollovers();

    const todayPeriod = getPeriodByDate(getToday());
    if (todayPeriod?.id) {
      state.currentPeriodId = todayPeriod.id;
    } else if (!state.periods.some((period) => period.id === state.currentPeriodId)) {
      state.currentPeriodId = state.periods[0]?.id || null;
    }
    if (!state.currentPeriodId && state.periods.length) {
      state.currentPeriodId = state.periods[0].id;
    }
    state.status = null;
    await ensureCurrentPeriodWithConfirmation();
  } catch (error) {
    state.status = { type: 'error', message: 'Chyba při načítání: ' + formatApiErrorMessage(error) };
  }
  state.loading = false;
  render();
}

async function insertTransaction(formData, options = {}) {
  state.loading = true;
  render();

  const mappedPeriodId = getPeriodForDate(formData.transaction_date);
  if (!mappedPeriodId) {
    state.status = { type: 'error', message: `Pro datum ${formData.transaction_date} neexistuje období. Nejdřív vytvoř období, do kterého datum spadá.` };
    state.loading = false;
    render();
    return;
  }
  
  const payload = {
    household_id: state.household.id,
    period_id: mappedPeriodId,
    type: formData.type,
    amount: Number(formData.amount),
    category_id: formData.category_id || null,
    subcategory_id: formData.type === 'expense' ? (formData.subcategory_id || null) : null,
    paid_by: formData.paid_by,
    transaction_date: formData.transaction_date,
    note: formData.note,
  };
  if (!payload.household_id) {
    throw new Error('Neexistující domácnost. Prosím vytvořte domácnost nebo obnovte stránku.');
  }
  
  try {
    await supabaseCall('POST', 'transactions', {}, payload);
    if (options.recurringTemplate) {
      await createRecurringTransaction({
        ...options.recurringTemplate,
        type: payload.type,
        amount: payload.amount,
        category_id: payload.category_id,
        paid_by: payload.paid_by,
        note: payload.note,
      });
    }
    state.status = { type: 'success', message: 'Transakce uložena.' };
    await loadAllData();
    if (payload.type === 'income') {
      const period = getPeriodById(payload.period_id);
      await applyBudgetAllocationForPeriod(period, { askConfirmation: true });
      await loadAllData();
    }
  } catch (error) {
    state.status = { type: 'error', message: formatApiErrorMessage(error) };
    state.loading = false;
    render();
  }
}

async function updateTransaction(id, payload) {
  state.loading = true;
  render();

  const mappedPeriodId = getPeriodForDate(payload.transaction_date);
  if (!mappedPeriodId) {
    state.status = { type: 'error', message: `Pro datum ${payload.transaction_date} neexistuje období. Nejdřív vytvoř období, do kterého datum spadá.` };
    state.loading = false;
    render();
    return;
  }
  
  const nextPayload = {
    ...payload,
    period_id: mappedPeriodId,
    amount: Number(payload.amount),
    category_id: payload.category_id || null,
    subcategory_id: payload.type === 'expense' ? (payload.subcategory_id || null) : null,
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
    allocation_confirmed: false,
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

async function createSubcategory(payload) {
  state.loading = true;
  render();

  try {
    await supabaseCall('POST', 'subcategories', {}, {
      ...payload,
      household_id: state.household.id,
      active: true,
    });
    state.status = { type: 'success', message: 'Podkategorie vytvořena.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: formatApiErrorMessage(error) };
    state.loading = false;
    render();
  }
}

async function deleteSubcategory(id) {
  if (!confirm('Opravdu chcete smazat podkategorii?')) return;
  state.loading = true;
  render();

  try {
    await supabaseCall('DELETE', 'subcategories', { id: `eq.${id}` });
    state.status = { type: 'success', message: 'Podkategorie smazána.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: formatApiErrorMessage(error) };
    state.loading = false;
    render();
  }
}

async function deleteCategory(id) {
  if (!confirm('Opravdu chcete smazat tuto kategorii i její rozpočty v obdobích?')) return;
  state.loading = true;
  render();

  try {
    const categorySubcategories = getSubcategoriesForCategory(id);
    if (categorySubcategories.length) {
      const subcategoryIds = categorySubcategories.map((item) => item.id).join(',');
      await supabaseCall('PATCH', 'transactions', {
        household_id: `eq.${state.household.id}`,
        subcategory_id: `in.(${subcategoryIds})`,
      }, { subcategory_id: null });
      await supabaseCall('DELETE', 'subcategories', { category_id: `eq.${id}` });
    }

    await supabaseCall('PATCH', 'transactions', {
      household_id: `eq.${state.household.id}`,
      category_id: `eq.${id}`,
    }, { category_id: null, subcategory_id: null });
    await supabaseCall('PATCH', 'recurring_transactions', {
      household_id: `eq.${state.household.id}`,
      category_id: `eq.${id}`,
    }, { category_id: null });
    await supabaseCall('DELETE', 'period_budgets', { category_id: `eq.${id}` });
    await supabaseCall('DELETE', 'categories', { id: `eq.${id}` });
    state.status = { type: 'success', message: 'Kategorie byla smazána.' };
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

async function updateInitialBalance(amount) {
  if (!state.household?.id) return;
  state.loading = true;
  render();

  try {
    await supabaseCall('PATCH', 'households', { id: `eq.${state.household.id}` }, { initial_balance: safeNumber(amount) });
    state.status = { type: 'success', message: 'Počáteční zůstatek byl uložen.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: formatApiErrorMessage(error) };
    state.loading = false;
    render();
  }
}

async function createRecurringTransaction(payload) {
  if (!state.household?.id) return;
  await supabaseCall('POST', 'recurring_transactions', {}, {
    household_id: state.household.id,
    type: payload.type,
    amount: safeNumber(payload.amount),
    category_id: payload.type === 'expense' ? (payload.category_id || null) : null,
    paid_by: payload.paid_by,
    note: payload.note || null,
    frequency: payload.frequency,
    start_date: payload.start_date,
    next_run_date: computeNextRecurringDate(payload, payload.start_date),
    day_overflow_strategy: payload.day_overflow_strategy,
    custom_day: payload.day_overflow_strategy === 'custom_day' ? Number(payload.custom_day) : null,
    active: true,
  });
}

async function deleteRecurringTransaction(id) {
  if (!confirm('Opravdu chcete smazat opakovanou transakci?')) return;
  state.loading = true;
  render();
  try {
    await supabaseCall('DELETE', 'recurring_transactions', { id: `eq.${id}` });
    state.status = { type: 'success', message: 'Opakovaná transakce byla smazána.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: formatApiErrorMessage(error) };
    state.loading = false;
    render();
  }
}

function showCreateRecurringModal() {
  const current = getCurrentPeriod();
  const form = `
    <div class="modal-card">
      <div class="row" style="justify-content: space-between; align-items:center;">
        <h3>Nové opakování</h3>
        <button class="btn btn-secondary" id="close-modal">Zavřít</button>
      </div>
      <form id="recurring-form" class="form-grid" style="margin-top:12px;">
        <label>Typ<select name="type"><option value="expense">Výdaj</option><option value="income">Příjem</option></select></label>
        <label>Částka<input name="amount" type="number" step="0.01" required></label>
        <label>Kategorie<select name="category_id"><option value="">Bez kategorie</option>${state.categories.filter((c) => c.active !== false).map((category) => `<option value="${category.id}">${category.name}</option>`).join('')}</select></label>
        <label>Osoba<select name="paid_by"><option value="Viki">Viki</option><option value="Káťa">Káťa</option><option value="Společné" selected>Společné</option></select></label>
        <label>Poznámka<textarea name="note"></textarea></label>
        <label>Frekvence<select name="frequency" id="recurring-frequency"><option value="weekly">Týdně</option><option value="monthly" selected>Měsíčně</option><option value="semiannual">Půlročně</option><option value="yearly">Ročně</option></select></label>
        <label>Start datum<input name="start_date" id="recurring-start-date" type="date" value="${current?.start_date || getToday()}" required></label>
        <div id="overflow-block" style="display:none; border:1px solid var(--border); border-radius:12px; padding:10px; background:var(--surface-alt);">
          <label>Den v měsíci může některý měsíc chybět. Co udělat?
            <select name="day_overflow_strategy" id="day-overflow-strategy">
              <option value="last_day" selected>Použít poslední den měsíce</option>
              <option value="custom_day">Použít jiný den v měsíci</option>
            </select>
          </label>
          <label id="custom-day-wrap" style="display:none; margin-top:8px;">Vybraný den (1-31)
            <input name="custom_day" id="custom-day" type="number" min="1" max="31" value="28">
          </label>
        </div>
        <button class="btn btn-primary" type="submit">Uložit opakování</button>
      </form>
    </div>
  `;

  showModal(form);
  document.getElementById('close-modal')?.addEventListener('click', closeModal);
  const frequencyEl = document.getElementById('recurring-frequency');
  const startDateEl = document.getElementById('recurring-start-date');
  const overflowBlock = document.getElementById('overflow-block');
  const overflowStrategy = document.getElementById('day-overflow-strategy');
  const customDayWrap = document.getElementById('custom-day-wrap');

  const updateOverflowVisibility = () => {
    const freq = frequencyEl?.value;
    const start = startDateEl?.value;
    const date = parseDateOnly(start);
    const day = date ? date.getUTCDate() : 0;
    const needsMonthRule = freq === 'monthly' || freq === 'semiannual' || freq === 'yearly';
    overflowBlock.style.display = needsMonthRule && day >= 29 ? 'block' : 'none';
    customDayWrap.style.display = overflowStrategy?.value === 'custom_day' ? 'block' : 'none';
  };

  frequencyEl?.addEventListener('change', updateOverflowVisibility);
  startDateEl?.addEventListener('change', updateOverflowVisibility);
  overflowStrategy?.addEventListener('change', updateOverflowVisibility);
  updateOverflowVisibility();

  document.getElementById('recurring-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    payload.amount = Number(payload.amount);
    payload.custom_day = payload.custom_day ? Number(payload.custom_day) : null;
    if (!payload.day_overflow_strategy) {
      payload.day_overflow_strategy = 'last_day';
    }
    try {
      await createRecurringTransaction(payload);
      closeModal();
      state.status = { type: 'success', message: 'Opakovaná transakce byla vytvořena.' };
      await loadAllData();
    } catch (error) {
      state.status = { type: 'error', message: formatApiErrorMessage(error) };
      render();
    }
  });
}

function exportJsonBackup() {
  const payload = {
    exportedAt: new Date().toISOString(),
    household: state.household,
    periods: state.periods,
    categories: state.categories,
    subcategories: state.subcategories,
    periodBudgets: state.periodBudgets,
    transactions: state.transactions,
    recurringTransactions: state.recurringTransactions,
  };
  downloadFile('finance-backup.json', JSON.stringify(payload, null, 2), 'application/json');
}

function exportTransactionsCsv() {
  const rows = state.transactions.map((t) => ({
    datum: t.transaction_date,
    typ: t.type,
    castka: t.amount,
    kategorie: getCategoryById(t.category_id)?.name || '',
    podkategorie: getSubcategoryById(t.subcategory_id)?.name || '',
    osoba: t.paid_by,
    poznamka: t.note || '',
  }));
  downloadFile('transakce.csv', toCsv(rows), 'text/csv;charset=utf-8;');
}

function exportCategoriesCsv() {
  const rows = state.categories.map((category) => ({
    nazev: category.name,
    ikona: category.icon,
    fixni_rozpocet: category.default_budget,
    procento: category.allocation_percent || 0,
    aktivni: category.active,
  }));
  downloadFile('kategorie.csv', toCsv(rows), 'text/csv;charset=utf-8;');
}

async function renameHousehold(name) {
  if (!state.household?.id) return;
  if (!name?.trim()) return;
  state.loading = true;
  render();
  try {
    await supabaseCall('PATCH', 'households', { id: `eq.${state.household.id}` }, { name: name.trim() });
    state.status = { type: 'success', message: 'Domácnost přejmenována.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: formatApiErrorMessage(error) };
    state.loading = false;
    render();
  }
}

async function resetCurrentPeriod(includePeriod) {
  const period = getCurrentPeriod();
  if (!period) return;
  const label = includePeriod ? 'smazání období včetně transakcí' : 'smazání transakcí období';
  if (!confirm(`Potvrď ${label}.`)) return;
  if (!confirm('Opravdu pokračovat? Tato akce je nevratná.')) return;

  state.loading = true;
  render();
  try {
    if (includePeriod) {
      await supabaseCall('DELETE', 'budget_periods', { id: `eq.${period.id}` });
    } else {
      await supabaseCall('DELETE', 'transactions', { period_id: `eq.${period.id}` });
      await supabaseCall('DELETE', 'period_budgets', { period_id: `eq.${period.id}` });
      await supabaseCall('PATCH', 'budget_periods', { id: `eq.${period.id}` }, { allocation_confirmed: false });
    }
    state.status = { type: 'success', message: 'Operace byla provedena.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: formatApiErrorMessage(error) };
    state.loading = false;
    render();
  }
}

async function resetWholeHousehold() {
  if (!state.household?.id) return;
  if (!confirm('Potvrď reset celé domácnosti.')) return;
  if (!confirm('Opravdu smazat všechna období, transakce, kategorie a opakování?')) return;

  state.loading = true;
  render();
  try {
    await supabaseCall('DELETE', 'households', { id: `eq.${state.household.id}` });
    state.status = { type: 'success', message: 'Domácnost byla resetována.' };
    await loadAllData();
  } catch (error) {
    state.status = { type: 'error', message: formatApiErrorMessage(error) };
    state.loading = false;
    render();
  }
}

async function importJsonBackup(file) {
  if (!file || !state.household?.id) return;
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    state.status = { type: 'error', message: 'Soubor není platný JSON.' };
    render();
    return;
  }
  if (!confirm('Import přidá data do aktuální domácnosti. Pokračovat?')) return;
  if (!confirm('Druhé potvrzení: opravdu importovat data?')) return;

  state.loading = true;
  render();
  try {
    if (Array.isArray(data.categories) && data.categories.length) {
      const mappedCategories = data.categories.map((category) => ({
        household_id: state.household.id,
        name: category.name,
        type: category.type || 'expense',
        icon: category.icon || '📦',
        default_budget: safeNumber(category.default_budget),
        allocation_percent: safeNumber(category.allocation_percent),
        active: category.active !== false,
      }));
      await supabaseCall('POST', 'categories', {}, mappedCategories);
    }
    state.status = { type: 'success', message: 'Import dokončen. Zkontroluj data v přehledu.' };
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
  const expenseRows = period
    ? state.categories
      .filter((category) => category.active !== false)
      .map((category) => {
        const spent = getExpensesForCategory(category.id, period.id);
        return { name: category.name, icon: category.icon || '📦', spent };
      })
      .filter((row) => row.spent > 0)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 6)
    : [];
  const incomeRows = period
    ? Object.values(state.transactions
      .filter((transaction) => transaction.period_id === period.id && transaction.type === 'income')
      .reduce((acc, transaction) => {
        const key = transaction.category_id || `person:${transaction.paid_by}`;
        if (!acc[key]) {
          const categoryName = transaction.category_id ? (getCategoryById(transaction.category_id)?.name || 'Bez kategorie') : `Příjem ${transaction.paid_by}`;
          acc[key] = { name: categoryName, amount: 0 };
        }
        acc[key].amount += safeNumber(transaction.amount);
        return acc;
      }, {}))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)
    : [];
  const budgetRows = period
    ? state.categories
      .filter((category) => category.active !== false)
      .map((category) => {
        const metrics = computeCategoryMetrics(category, period);
        return {
          icon: category.icon || '📦',
          name: category.name,
          spent: metrics.expenses,
          available: metrics.totalAvailable,
        };
      })
      .filter((row) => row.available > 0 || row.spent > 0)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 6)
    : [];
  const expenseMax = expenseRows.reduce((max, row) => Math.max(max, row.spent), 0) || 1;
  const incomeMax = incomeRows.reduce((max, row) => Math.max(max, row.amount), 0) || 1;
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
        <div class="stat-card"><div class="stat-label">Plán rozpočtů</div><div class="stat-value">${formatCurrency(summary.plannedTotal)}</div></div>
        <div class="stat-card"><div class="stat-label">Zůstatek mimo kategorie</div><div class="stat-value">${formatCurrency(summary.freeCash)}</div></div>
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
              const split = period ? computeCategoryPersonSplit(category, period.id, metrics.totalAvailable) : null;
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
                  ${split ? `<div class="split-grid"><div class="split-item"><strong>Viki</strong><span>${formatCurrency(split.vikiRemaining)} zbývá</span><small>${formatCurrency(split.vikiSpent)} / ${formatCurrency(split.vikiBudget)}</small></div><div class="split-item"><strong>Káťa</strong><span>${formatCurrency(split.kataRemaining)} zbývá</span><small>${formatCurrency(split.kataSpent)} / ${formatCurrency(split.kataBudget)}</small></div></div>` : ''}
                </div>`;
            }).join('') : '<div class="empty">Žádné kategorie</div>'}
          </div>
        </div>
      </div>

      <div class="grid grid-2" style="margin-top:16px;">
        <div class="card">
          <h3>Graf výdajů dle kategorií</h3>
          ${expenseRows.length ? `<div class="mini-chart" style="margin-top:12px;">${expenseRows.map((row) => `<div class="mini-chart-row"><div class="mini-chart-label">${row.icon} ${row.name}</div><div class="mini-chart-track"><span style="width:${Math.max(8, Math.round((row.spent / expenseMax) * 100))}%"></span></div><div class="mini-chart-value">${formatCurrency(row.spent)}</div></div>`).join('')}</div>` : '<div class="empty" style="margin-top:12px;">Zatím nejsou žádné výdaje v kategoriích.</div>'}
        </div>
        <div class="card">
          <h3>Graf příjmů dle kategorií</h3>
          ${incomeRows.length ? `<div class="mini-chart" style="margin-top:12px;">${incomeRows.map((row) => `<div class="mini-chart-row"><div class="mini-chart-label">💰 ${row.name}</div><div class="mini-chart-track income"><span style="width:${Math.max(8, Math.round((row.amount / incomeMax) * 100))}%"></span></div><div class="mini-chart-value">${formatCurrency(row.amount)}</div></div>`).join('')}</div>` : '<div class="empty" style="margin-top:12px;">Zatím nejsou žádné příjmy v kategoriích.</div>'}
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <h3>Rozpočet vs. čerpání</h3>
        ${budgetRows.length ? `<div class="list" style="margin-top:12px;">${budgetRows.map((row) => {
          const ratio = row.available > 0 ? Math.round((row.spent / row.available) * 100) : 0;
          return `<div class="budget-compare"><div class="budget-compare-header"><strong>${row.icon} ${row.name}</strong><span>${formatCurrency(row.spent)} / ${formatCurrency(row.available)}</span></div><div class="budget-compare-track"><span style="width:${Math.max(4, Math.min(100, ratio))}%"></span></div></div>`;
        }).join('')}</div>` : '<div class="empty" style="margin-top:12px;">Pro zobrazení grafu vytvoř rozpočet a transakce v období.</div>'}
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
  const recurringFrequencyLabel = {
    weekly: 'Týdně',
    monthly: 'Měsíčně',
    semiannual: 'Půlročně',
    yearly: 'Ročně',
  };
  return `<div class="container">
    <div class="card">
      <div class="row" style="justify-content: space-between; align-items:center;">
        <h2>Peněženka a transakce</h2>
        <button class="btn btn-primary" data-action="show-add-transaction">Přidat transakci</button>
      </div>
      <div class="grid grid-3" style="margin-top:12px;">
        <label>Hledat poznámku<input id="history-search" value="${state.filters.search}"></label>
        <label>Období<select id="history-period">${['all', ...state.periods.map((p) => p.id)].map((value) => `<option value="${value}" ${state.filters.periodId === value ? 'selected' : ''}>${value === 'all' ? 'Všechna' : getPeriodById(value)?.name}</option>`).join('')}</select></label>
        <label>Typ<select id="history-type"><option value="all" ${state.filters.type==='all'?'selected':''}>Vše</option><option value="income" ${state.filters.type==='income'?'selected':''}>Příjem</option><option value="expense" ${state.filters.type==='expense'?'selected':''}>Výdaj</option></select></label>
      </div>
    </div>
    <div class="card" style="margin-top:16px;">
      ${filtered.length ? `<table class="table"><thead><tr><th>Datum</th><th>Typ</th><th>Částka</th><th>Kategorie</th><th>Podkategorie</th><th>Osoba</th><th>Poznámka</th><th></th></tr></thead><tbody>${filtered.map((t) => `
        <tr>
          <td>${t.transaction_date}</td>
          <td><span class="badge ${t.type === 'income' ? 'badge-success' : 'badge-danger'}">${t.type === 'income' ? 'Příjem' : 'Výdaj'}</span></td>
          <td>${formatCurrency(t.amount)}</td>
          <td>${t.category_id ? getCategoryById(t.category_id)?.name || '—' : '—'}</td>
          <td>${t.subcategory_id ? getSubcategoryById(t.subcategory_id)?.name || '—' : '—'}</td>
          <td>${t.paid_by}</td>
          <td>${t.note || '—'}</td>
          <td><div class="row-actions"><button class="btn btn-secondary" data-action="edit-transaction" data-id="${t.id}">Upravit</button><button class="btn btn-danger" data-action="delete-transaction" data-id="${t.id}">Smazat</button></div></td>
        </tr>
      `).join('')}</tbody></table>` : '<div class="empty">Žádné transakce</div>'}
    </div>
    <div class="card" style="margin-top:16px;">
      <h3>Opakované transakce</h3>
      <div class="list" style="margin-top:12px;">
        ${state.recurringTransactions.length ? state.recurringTransactions.map((rule) => `
          <div class="list-item">
            <strong>${rule.type === 'income' ? 'Příjem' : 'Výdaj'} · ${formatCurrency(rule.amount)}</strong>
            <div style="color:var(--muted); margin-top:6px;">${recurringFrequencyLabel[rule.frequency] || rule.frequency} · další spuštění ${rule.next_run_date}</div>
            <div style="color:var(--muted); margin-top:4px;">${rule.note || 'Bez poznámky'}</div>
            <div class="row" style="margin-top:8px;">
              <button class="btn btn-danger" data-action="delete-recurring" data-id="${rule.id}">Smazat opakování</button>
            </div>
          </div>
        `).join('') : '<div class="empty">Žádné opakované transakce</div>'}
      </div>
    </div>
  </div>`;
}

function renderBudgetManagement() {
  const period = getCurrentPeriod();
  return `<div class="container"><div class="card"><div class="row" style="justify-content: space-between; align-items:center;"><h2>Správa rozpočtů</h2><button class="btn btn-primary" data-action="show-create-category">Přidat nový rozpočet</button></div><p style="color:var(--muted); margin-top:8px;">Každou kategorii lze upravit, vypnout nebo smazat. Níže vidíš i průběh čerpání rozpočtu v aktuálním období.</p><div class="list" style="margin-top:12px;">${state.categories.length ? state.categories.map((category) => {
    const metrics = period ? computeCategoryMetrics(category, period) : { expenses: 0, totalAvailable: 0 };
    const percent = metrics.totalAvailable > 0 ? Math.min(140, Math.round((metrics.expenses / metrics.totalAvailable) * 100)) : 0;
    const splitMode = category.split_mode || (category.split_by_person ? 'half' : 'none');
    const splitLabel = splitMode === 'custom' ? 'Vlastní částky' : splitMode === 'half' ? '50/50' : 'Nedělit';
    return `<div class="list-item"><strong>${category.icon || '📦'} ${category.name}</strong><div style="color:var(--muted); margin-top:6px;">Fixně: ${formatCurrency(category.default_budget)} · Procento: ${safeNumber(category.allocation_percent)} % (jen když fixní=0) · Dělení: ${splitLabel}</div><div class="budget-compare" style="margin-top:8px;"><div class="budget-compare-track"><span style="width:${Math.max(4, Math.min(percent, 100))}%"></span></div><div class="budget-compare-label">Vyčerpáno ${formatCurrency(metrics.expenses)} z ${formatCurrency(metrics.totalAvailable)}</div></div><div class="row" style="margin-top:8px;"><button class="btn btn-secondary" data-action="edit-category" data-id="${category.id}">Upravit</button><button class="btn btn-secondary" data-action="toggle-category" data-id="${category.id}">${category.active === false ? 'Aktivovat' : 'Deaktivovat'}</button><button class="btn btn-danger" data-action="delete-category" data-id="${category.id}">Smazat</button></div></div>`;
  }).join('') : '<div class="empty">Žádné kategorie</div>'}</div></div></div>`;
}

function renderPeriods() {
  const nextPeriod = getNextMonthlyPeriodPayload();
  const currentPeriod = getCurrentPeriod();
  return `
    <div class="container">
      <div class="card">
        <h2>Nastavení období</h2>
        ${state.status ? `<div class="status-banner status-${state.status.type}" style="margin-top:12px;">${state.status.message}</div>` : ''}
        <form id="initial-balance-form" class="row" style="margin-top:12px; gap:12px; align-items:end;">
          <label style="max-width:260px;">Počáteční zůstatek domácnosti
            <input id="initial-balance" name="initial_balance" type="number" step="0.01" value="${safeNumber(state.household?.initial_balance)}">
          </label>
          <button class="btn btn-secondary" type="submit">Uložit zůstatek</button>
        </form>
        <form id="period-start-day-form" class="row" style="margin-top:12px; gap:12px; align-items:end;">
          <label style="max-width:240px;">Začátek rozpočtového měsíce (1-31)
            <input id="budget-start-day" name="budget_start_day" type="number" min="1" max="31" required value="${getBudgetStartDay()}">
          </label>
          <button class="btn btn-secondary" type="submit">Uložit den</button>
        </form>
        <p style="color:var(--muted); margin-top:10px;">Další období se bude tvořit automaticky od zvoleného dne.</p>
        ${currentPeriod ? `<p style="color:var(--muted); margin-top:6px;">Stav alokace aktuálního období: <strong>${currentPeriod.allocation_confirmed ? 'Potvrzeno' : 'Čeká na obě výplaty / potvrzení'}</strong></p>` : ''}
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="row" style="justify-content: space-between; align-items:center;">
          <h2>Správa období</h2>
          <button class="btn btn-primary" data-action="show-create-period">Vytvořit další měsíc</button>
        </div>
        <div class="list" style="margin-top:12px;">
          <div class="list-item">
            <strong>Následující období</strong>
            <div style="color:var(--muted); margin-top:6px;">${nextPeriod.name} · ${nextPeriod.start_date} → ${nextPeriod.end_date}</div>
          </div>
          ${state.periods.length ? state.periods.map((period) => `
            <div class="list-item">
              <strong>${period.name}</strong>
              <div style="color:var(--muted); margin-top:6px;">${period.start_date} → ${period.end_date}</div>
              <div style="color:var(--muted); margin-top:6px;">Alokace: ${period.allocation_confirmed ? 'potvrzeno' : 'čeká'}</div>
              <div class="row" style="margin-top:8px;">
                <button class="btn btn-secondary" data-action="edit-period" data-id="${period.id}">Upravit</button>
                <button class="btn btn-danger" data-action="delete-period" data-id="${period.id}">Smazat</button>
              </div>
            </div>
          `).join('') : '<div class="empty">Žádná období</div>'}
        </div>
      </div>
    </div>
  `;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    const text = String(value ?? '');
    if (text.includes('"') || text.includes(';') || text.includes('\n')) {
      return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
  };
  const lines = [headers.join(';')];
  rows.forEach((row) => {
    lines.push(headers.map((header) => escape(row[header])).join(';'));
  });
  return lines.join('\n');
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function renderSettings() {
  return `
    ${renderPeriods()}
    <div class="container" style="margin-top:16px;">
      <div class="card" style="margin-bottom:16px;">
        <div class="row" style="justify-content: space-between; align-items:center;">
          <h2>Kategorie a podkategorie</h2>
          <div class="row">
            <button class="btn btn-primary" data-action="show-create-category">Přidat kategorii</button>
            <button class="btn btn-secondary" data-action="show-create-subcategory">Přidat podkategorii</button>
          </div>
        </div>
        <div class="list" style="margin-top:12px;">
          ${state.categories.length ? state.categories.map((category) => {
            const subcats = getSubcategoriesForCategory(category.id);
            return `<div class="list-item"><strong>${category.icon || '📦'} ${category.name}</strong><div style="color:var(--muted); margin-top:6px;">Typ: ${category.type === 'income' ? 'Příjem' : 'Výdaj'} · Podkategorií: ${subcats.length}</div>${subcats.length ? `<div class="row" style="margin-top:8px;">${subcats.map((subcategory) => `<span class="badge badge-success" style="display:inline-flex; align-items:center; gap:8px;">${subcategory.icon || '•'} ${subcategory.name}<button class="btn btn-danger" style="padding:3px 8px;" data-action="delete-subcategory" data-id="${subcategory.id}">x</button></span>`).join('')}</div>` : ''}</div>`;
          }).join('') : '<div class="empty">Zatím žádné kategorie</div>'}
        </div>
      </div>

      <div class="card">
        <div class="row" style="justify-content: space-between; align-items:center;">
          <h2>Opakované transakce</h2>
          <button class="btn btn-primary" data-action="show-create-recurring">Nové opakování</button>
        </div>
        <p style="color:var(--muted); margin-top:8px;">Spravuj opakované platby i příjmy. Změny můžeš aplikovat od vybraného data.</p>
        <div class="list" style="margin-top:12px;">
          ${state.recurringTransactions.length ? state.recurringTransactions.map((rule) => `<div class="list-item"><strong>${rule.type === 'income' ? 'Příjem' : 'Výdaj'} · ${formatCurrency(rule.amount)}</strong><div style="color:var(--muted); margin-top:6px;">Frekvence: ${rule.frequency} · další spuštění: ${rule.next_run_date}</div><div class="row" style="margin-top:8px;"><button class="btn btn-danger" data-action="delete-recurring" data-id="${rule.id}">Smazat</button></div></div>`).join('') : '<div class="empty">Žádná opakování</div>'}
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <h2>Import a export</h2>
        <div class="row" style="margin-top:12px;">
          <button class="btn btn-secondary" data-action="export-json">Export JSON záloha</button>
          <button class="btn btn-secondary" data-action="export-csv-transactions">Export CSV transakce</button>
          <button class="btn btn-secondary" data-action="export-csv-categories">Export CSV kategorie</button>
          <label class="btn btn-secondary" style="display:inline-flex; align-items:center;">Import JSON<input id="import-json-input" type="file" accept="application/json" style="display:none;"></label>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <h2>Správa domácnosti</h2>
        <form id="household-rename-form" class="row" style="margin-top:12px; align-items:end;">
          <label style="max-width:280px;">Název domácnosti
            <input id="household-name" value="${state.household?.name || ''}" required>
          </label>
          <button class="btn btn-secondary" type="submit">Přejmenovat</button>
        </form>
        <div class="row" style="margin-top:12px;">
          <button class="btn btn-danger" data-action="reset-period-with-transactions">Smazat období včetně transakcí</button>
          <button class="btn btn-danger" data-action="reset-period-transactions">Smazat jen transakce období</button>
          <button class="btn btn-danger" data-action="reset-all-household">Reset celé domácnosti</button>
        </div>
      </div>
    </div>
  `;
}

function renderSidebar() {
  return `
    <aside class="sidebar">
      <div class="brand">Viki & Káťa</div>
      <nav>
        <button class="nav-btn ${currentView === 'dashboard' ? 'active' : ''}" data-view="dashboard">Dashboard</button>
        <button class="nav-btn ${currentView === 'wallet' ? 'active' : ''}" data-view="wallet">Peněženka</button>
        <button class="nav-btn ${currentView === 'budgets' ? 'active' : ''}" data-view="budgets">Rozpočty</button>
        <button class="nav-btn ${currentView === 'settings' ? 'active' : ''}" data-view="settings">Nastavení</button>
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
      <button data-view="wallet">Peněženka</button>
      <button data-view="budgets">Rozpočty</button>
      <button data-view="settings">Nastavení</button>
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
          ${currentView === 'wallet' ? renderHistory() : ''}
          ${currentView === 'budgets' ? renderBudgetManagement() : ''}
          ${currentView === 'settings' ? renderSettings() : ''}
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
  document.querySelectorAll('[data-action="show-create-subcategory"]').forEach((btn) => btn.addEventListener('click', () => showSubcategoryModal()));
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
  document.querySelectorAll('[data-action="delete-category"]').forEach((btn) => btn.addEventListener('click', () => deleteCategory(btn.dataset.id)));
  document.querySelectorAll('[data-action="delete-subcategory"]').forEach((btn) => btn.addEventListener('click', () => deleteSubcategory(btn.dataset.id)));
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
  document.getElementById('initial-balance-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const nextBalance = Number(document.getElementById('initial-balance')?.value);
    updateInitialBalance(nextBalance);
  });
  document.querySelectorAll('[data-action="delete-recurring"]').forEach((btn) => btn.addEventListener('click', () => deleteRecurringTransaction(btn.dataset.id)));
  document.querySelectorAll('[data-action="show-create-recurring"]').forEach((btn) => btn.addEventListener('click', () => showCreateRecurringModal()));
  document.querySelectorAll('[data-action="export-json"]').forEach((btn) => btn.addEventListener('click', exportJsonBackup));
  document.querySelectorAll('[data-action="export-csv-transactions"]').forEach((btn) => btn.addEventListener('click', exportTransactionsCsv));
  document.querySelectorAll('[data-action="export-csv-categories"]').forEach((btn) => btn.addEventListener('click', exportCategoriesCsv));
  document.querySelectorAll('[data-action="reset-period-with-transactions"]').forEach((btn) => btn.addEventListener('click', () => resetCurrentPeriod(true)));
  document.querySelectorAll('[data-action="reset-period-transactions"]').forEach((btn) => btn.addEventListener('click', () => resetCurrentPeriod(false)));
  document.querySelectorAll('[data-action="reset-all-household"]').forEach((btn) => btn.addEventListener('click', () => resetWholeHousehold()));
  document.getElementById('household-rename-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    renameHousehold(document.getElementById('household-name')?.value);
  });
  document.getElementById('import-json-input')?.addEventListener('change', (event) => {
    const [file] = event.target.files || [];
    if (file) {
      importJsonBackup(file);
    }
  });
}

function showTransactionModal(transactionId = null, defaults = {}) {
  const transaction = state.transactions.find((t) => t.id === transactionId) || null;
  const period = getCurrentPeriod();
  const defaultType = defaults.type || 'expense';
  const categoryOptionsByType = (type, selectedId = '') => {
    const items = state.categories.filter((category) => category.active !== false && category.type === type);
    return ['<option value="">Bez kategorie</option>', ...items.map((category) => `<option value="${category.id}" ${selectedId === category.id ? 'selected' : ''}>${category.icon || '📦'} ${category.name}</option>`)]
      .join('');
  };
  const subcategoryOptions = (categoryId, selectedId = '') => {
    const items = categoryId ? getSubcategoriesForCategory(categoryId) : [];
    return ['<option value="">Bez podkategorie</option>', ...items.map((item) => `<option value="${item.id}" ${selectedId === item.id ? 'selected' : ''}>${item.icon || '•'} ${item.name}</option>`)]
      .join('');
  };
  const selectedType = transaction?.type || defaultType;
  const selectedCategoryId = transaction?.category_id || defaults.category_id || '';
  const selectedSubcategoryId = transaction?.subcategory_id || defaults.subcategory_id || '';
  const selectedDate = transaction?.transaction_date || defaults.transaction_date || getToday();
  const selectedPaidBy = transaction?.paid_by || defaults.paid_by || 'Společné';
  const selectedNote = transaction?.note || defaults.note || '';
  const form = `
    <div class="modal-card">
      <div class="row" style="justify-content: space-between; align-items:center;">
        <h3>${transaction ? 'Upravit transakci' : 'Přidat transakci'}</h3>
        <button class="btn btn-secondary" id="close-modal">Zavřít</button>
      </div>
      <form id="transaction-form" class="form-grid" style="margin-top:12px;">
        <label>Typ<select name="type" id="transaction-type"><option value="expense" ${selectedType === 'expense' ? 'selected' : ''}>Výdaj</option><option value="income" ${selectedType === 'income' ? 'selected' : ''}>Příjem</option></select></label>
        <label>Částka<input name="amount" type="number" step="0.01" required value="${transaction?.amount || ''}"></label>
        <label>Datum<input name="transaction_date" type="date" required value="${selectedDate}"></label>
        <label>Kategorie<select name="category_id" id="transaction-category">${categoryOptionsByType(selectedType, selectedCategoryId)}</select></label>
        <label id="subcategory-wrap" style="display:${selectedType === 'expense' ? 'flex' : 'none'};">Podkategorie<select name="subcategory_id" id="transaction-subcategory">${subcategoryOptions(selectedCategoryId, selectedSubcategoryId)}</select></label>
        <label>Osoba<select name="paid_by"><option value="Viki" ${selectedPaidBy === 'Viki' ? 'selected' : ''}>Viki</option><option value="Káťa" ${selectedPaidBy === 'Káťa' ? 'selected' : ''}>Káťa</option><option value="Společné" ${selectedPaidBy === 'Společné' ? 'selected' : ''}>Společné</option></select></label>
        <label>Poznámka<textarea name="note">${selectedNote}</textarea></label>
        ${transaction ? '' : `
          <label style="display:flex; align-items:center; gap:8px; margin-top:4px;">
            <input type="checkbox" id="recurring-enabled"> Nastavit jako opakovanou transakci
          </label>
          <div id="recurring-options" class="form-grid" style="display:none; gap:10px;">
            <label>Frekvence
              <select id="recurring-frequency">
                <option value="weekly">Týdně</option>
                <option value="monthly" selected>Měsíčně</option>
                <option value="semiannual">Půlročně</option>
                <option value="yearly">Ročně</option>
              </select>
            </label>
            <label>Start opakování
              <input id="recurring-start-date" type="date" value="${transaction?.transaction_date || getToday()}">
            </label>
            <div id="recurring-overflow-wrap" style="display:none; border:1px solid var(--border); border-radius:12px; padding:10px; background:var(--surface-alt);">
              <label>Neexistující den v měsíci
                <select id="recurring-overflow-strategy">
                  <option value="last_day" selected>Použít poslední den měsíce</option>
                  <option value="custom_day">Zvolit jiný den v měsíci</option>
                </select>
              </label>
              <label id="recurring-custom-day-wrap" style="display:none; margin-top:8px;">Náhradní den (1-31)
                <input id="recurring-custom-day" type="number" min="1" max="31" value="28">
              </label>
            </div>
          </div>
        `}
        <div class="row">
          <button class="btn btn-primary" type="submit" ${state.loading ? 'disabled' : ''}>${transaction ? 'Uložit změny' : 'Uložit'}</button>
          ${transaction ? '<button class="btn btn-danger" type="button" id="delete-transaction-modal">Smazat</button>' : ''}
        </div>
      </form>
    </div>`;
  showModal(form);
  document.getElementById('close-modal').addEventListener('click', closeModal);
  const typeSelect = document.getElementById('transaction-type');
  const categorySelect = document.getElementById('transaction-category');
  const subcategorySelect = document.getElementById('transaction-subcategory');
  const subcategoryWrap = document.getElementById('subcategory-wrap');

  const refreshCategoryAndSubcategory = () => {
    const selectedTypeLocal = typeSelect?.value || 'expense';
    const previousCategory = categorySelect?.value || '';
    if (categorySelect) {
      categorySelect.innerHTML = categoryOptionsByType(selectedTypeLocal, previousCategory);
    }
    const currentCategory = categorySelect?.value || '';
    if (subcategorySelect) {
      subcategorySelect.innerHTML = subcategoryOptions(currentCategory, '');
    }
    if (subcategoryWrap) {
      subcategoryWrap.style.display = selectedTypeLocal === 'expense' ? 'flex' : 'none';
    }
  };

  typeSelect?.addEventListener('change', refreshCategoryAndSubcategory);
  categorySelect?.addEventListener('change', () => {
    if (subcategorySelect) {
      subcategorySelect.innerHTML = subcategoryOptions(categorySelect.value, '');
    }
  });

  const recurringEnabled = document.getElementById('recurring-enabled');
  const recurringOptions = document.getElementById('recurring-options');
  const recurringOverflowWrap = document.getElementById('recurring-overflow-wrap');
  const recurringFrequencyEl = document.getElementById('recurring-frequency');
  const recurringStartDateEl = document.getElementById('recurring-start-date');
  const recurringOverflow = document.getElementById('recurring-overflow-strategy');
  const recurringCustomWrap = document.getElementById('recurring-custom-day-wrap');
  recurringEnabled?.addEventListener('change', () => {
    recurringOptions.style.display = recurringEnabled.checked ? 'grid' : 'none';
  });
  const updateRecurringOverflowVisibility = () => {
    const frequency = recurringFrequencyEl?.value;
    const startDate = recurringStartDateEl?.value;
    const day = parseDateOnly(startDate)?.getUTCDate() || 0;
    const needsMonthlyRule = frequency === 'monthly' || frequency === 'semiannual' || frequency === 'yearly';
    if (recurringOverflowWrap) {
      recurringOverflowWrap.style.display = needsMonthlyRule && day >= 29 ? 'block' : 'none';
    }
    if (recurringCustomWrap) {
      recurringCustomWrap.style.display = recurringOverflow?.value === 'custom_day' ? 'block' : 'none';
    }
  };
  recurringFrequencyEl?.addEventListener('change', updateRecurringOverflowVisibility);
  recurringStartDateEl?.addEventListener('change', updateRecurringOverflowVisibility);
  recurringOverflow?.addEventListener('change', () => {
    updateRecurringOverflowVisibility();
  });
  updateRecurringOverflowVisibility();
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
      let recurringTemplate = null;
      if (recurringEnabled?.checked) {
        const frequency = document.getElementById('recurring-frequency')?.value;
        const startDate = document.getElementById('recurring-start-date')?.value;
        const dayOverflowStrategy = document.getElementById('recurring-overflow-strategy')?.value || 'last_day';
        const customDay = Number(document.getElementById('recurring-custom-day')?.value || 28);
        if (!startDate) {
          state.status = { type: 'error', message: 'Vyber datum startu opakování.' };
          render();
          return;
        }
        if (dayOverflowStrategy === 'custom_day' && (!Number.isInteger(customDay) || customDay < 1 || customDay > 31)) {
          state.status = { type: 'error', message: 'Náhradní den musí být číslo 1 až 31.' };
          render();
          return;
        }
        recurringTemplate = {
          frequency,
          start_date: startDate,
          day_overflow_strategy: dayOverflowStrategy,
          custom_day: dayOverflowStrategy === 'custom_day' ? customDay : null,
        };
      }
      insertTransaction(payload, { recurringTemplate });
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
  const selectedName = category?.name || '';
  const selectedIcon = category?.icon || '📦';
  const selectedSplitMode = category?.split_mode || (category?.split_by_person ? 'half' : 'none');
  const form = `
    <div class="modal-card">
      <div class="row" style="justify-content: space-between; align-items:center;">
        <h3>${category ? 'Upravit kategorii' : 'Nová kategorie'}</h3>
        <button class="btn btn-secondary" id="close-modal">Zavřít</button>
      </div>
      <form id="category-form" class="form-grid" style="margin-top:12px;">
        <label>Název kategorie<input name="name" id="category-name" required value="${selectedName}" placeholder="Např. Potraviny"></label>
        <label>Ikona (emoji)<input name="icon" id="category-icon" value="${selectedIcon}" placeholder="🛒"></label>
        <label>Typ<select name="type"><option value="expense" ${category?.type !== 'income' ? 'selected' : ''}>Výdaj</option><option value="income" ${category?.type === 'income' ? 'selected' : ''}>Příjem</option></select></label>
        <label>Výchozí rozpočet<input name="default_budget" type="number" step="0.01" value="${category?.default_budget || 0}"></label>
        <label>Procento z potvrzených výplat (0-100)<input name="allocation_percent" type="number" step="0.01" min="0" max="100" value="${category?.allocation_percent || 0}"></label>
        <label>Dělení rozpočtu mezi osoby
          <select name="split_mode" id="split-mode">
            <option value="none" ${selectedSplitMode === 'none' ? 'selected' : ''}>Nedělit</option>
            <option value="half" ${selectedSplitMode === 'half' ? 'selected' : ''}>50 / 50</option>
            <option value="custom" ${selectedSplitMode === 'custom' ? 'selected' : ''}>Vlastní částky</option>
          </select>
        </label>
        <div id="split-custom-wrap" class="grid grid-2" style="display:${selectedSplitMode === 'custom' ? 'grid' : 'none'};">
          <label>Limit Viki (Kč)<input name="split_viki_amount" type="number" step="0.01" min="0" value="${safeNumber(category?.split_viki_amount)}"></label>
          <label>Limit Káťa (Kč)<input name="split_kata_amount" type="number" step="0.01" min="0" value="${safeNumber(category?.split_kata_amount)}"></label>
        </div>
        <button class="btn btn-primary" type="submit" ${state.loading ? 'disabled' : ''}>${category ? 'Uložit' : 'Přidat'}</button>
      </form>
    </div>`;
  showModal(form);
  document.getElementById('close-modal').addEventListener('click', closeModal);
  const splitModeSelect = document.getElementById('split-mode');
  const splitCustomWrap = document.getElementById('split-custom-wrap');
  splitModeSelect?.addEventListener('change', () => {
    if (splitCustomWrap) {
      splitCustomWrap.style.display = splitModeSelect.value === 'custom' ? 'grid' : 'none';
    }
  });
  document.getElementById('category-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    payload.default_budget = Number(payload.default_budget);
    payload.allocation_percent = Number(payload.allocation_percent);
    payload.split_mode = payload.split_mode || 'none';
    payload.split_by_person = payload.split_mode !== 'none';
    payload.split_viki_amount = payload.split_mode === 'custom' ? safeNumber(payload.split_viki_amount) : 0;
    payload.split_kata_amount = payload.split_mode === 'custom' ? safeNumber(payload.split_kata_amount) : 0;
    if (!payload.icon?.trim()) {
      payload.icon = '📦';
    }
    if (!category) {
      payload.active = true;
    }
    if (category) {
      updateCategory(category.id, payload);
    } else {
      createCategory(payload);
    }
    closeModal();
  });
}

function showSubcategoryModal() {
  const expenseCategories = state.categories.filter((category) => category.active !== false && category.type === 'expense');
  if (!expenseCategories.length) {
    state.status = { type: 'error', message: 'Nejprve vytvoř alespoň jednu výdajovou kategorii.' };
    render();
    return;
  }
  showModal(`
    <div class="modal-card">
      <div class="row" style="justify-content: space-between; align-items:center;">
        <h3>Nová podkategorie</h3>
        <button class="btn btn-secondary" id="close-modal">Zavřít</button>
      </div>
      <form id="subcategory-form" class="form-grid" style="margin-top:12px;">
        <label>Nadřazená kategorie
          <select name="category_id" required>
            ${expenseCategories.map((category) => `<option value="${category.id}">${category.icon || '📦'} ${category.name}</option>`).join('')}
          </select>
        </label>
        <label>Název podkategorie<input name="name" required placeholder="Např. Lidl"></label>
        <label>Ikona (emoji)<input name="icon" placeholder="🧾"></label>
        <button class="btn btn-primary" type="submit">Přidat podkategorii</button>
      </form>
    </div>
  `);
  document.getElementById('close-modal')?.addEventListener('click', closeModal);
  document.getElementById('subcategory-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    payload.icon = payload.icon?.trim() || '•';
    createSubcategory(payload);
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
        <label>Název<input name="name" required value="${formData.name}"></label>
        <label>Začátek<input name="start_date" type="date" required value="${formData.start_date}"></label>
        <label>Konec<input name="end_date" type="date" required value="${formData.end_date}"></label>
        <label>Přepsat počáteční zůstatek období (volitelné)
          <input name="opening_balance_override" type="number" step="0.01" placeholder="Použije se vypočtený" value="${period?.opening_balance_override ?? ''}">
        </label>
        ${period ? '' : '<p style="color:var(--muted); margin:0;">Můžeš vytvořit i zpětné nebo vlastní období.</p>'}
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
    if (!payload.name?.trim()) {
      state.status = { type: 'error', message: 'Název období je povinný.' };
      render();
      return;
    }
    if (!payload.start_date || !payload.end_date || payload.start_date > payload.end_date) {
      state.status = { type: 'error', message: 'Datum začátku musí být menší nebo rovno datu konce.' };
      render();
      return;
    }
    if (hasOverlappingPeriod(payload.start_date, payload.end_date, period?.id || null)) {
      state.status = { type: 'error', message: 'Toto období se překrývá s jiným obdobím. Uprav datum, aby se období nepřekrývala.' };
      render();
      return;
    }
    payload.opening_balance_override = payload.opening_balance_override === '' ? null : Number(payload.opening_balance_override);
    payload.status = period?.status || 'active';
    if (period) {
      updatePeriod(period.id, payload);
    } else {
      createPeriod(payload);
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
  const periodBudget = period ? getPeriodBudgetRecord(categoryId, period.id) : null;
  const transactions = state.transactions
    .filter((t) => t.category_id === categoryId && t.type === 'expense' && (!period || t.period_id === period.id))
    .sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
  const metrics = period && category ? computeCategoryMetrics(category, period) : { expenses:0, baseBudget:0, rolloverAmount:0, manualAdjustment:0, totalAvailable:0, remaining:0, usagePercent:0 };
  const split = period && category ? computeCategoryPersonSplit(category, period.id, metrics.totalAvailable) : null;
  showModal(`
    <div class="modal-card">
      <div class="row" style="justify-content: space-between; align-items:center;">
        <h3>${category?.name || 'Kategorie'}</h3>
        <button class="btn btn-secondary" id="close-modal">Zavřít</button>
      </div>
      <div class="list" style="margin-top:12px;">
        <div class="list-item">Období: ${period ? `${period.name} (${period.start_date} → ${period.end_date})` : 'Nevybrané období'}</div>
        <div class="list-item">Rozpočet období: ${formatCurrency(metrics.baseBudget || 0)}</div>
        <div class="list-item">Převedeno z minulého: ${formatCurrency(metrics.rolloverAmount || 0)}</div>
        <div class="list-item">Ruční úprava: ${formatCurrency(metrics.manualAdjustment || 0)}</div>
        <div class="list-item">Celkem k dispozici: ${formatCurrency(metrics.totalAvailable)}</div>
        <div class="list-item">Vyčerpáno: ${formatCurrency(metrics.expenses)}</div>
        <div class="list-item">Zbývá: ${formatCurrency(metrics.remaining)}</div>
        ${split ? `<div class="list-item"><strong>Rozdělení dle osoby</strong><div style="margin-top:8px;">Viki: ${formatCurrency(split.vikiSpent)} / ${formatCurrency(split.vikiBudget)} · zbývá ${formatCurrency(split.vikiRemaining)}</div><div style="margin-top:6px;">Káťa: ${formatCurrency(split.kataSpent)} / ${formatCurrency(split.kataBudget)} · zbývá ${formatCurrency(split.kataRemaining)}</div></div>` : ''}
      </div>
      ${period ? `
        <div class="card" style="margin-top:12px;">
          <h4>Upravit rozpočet období</h4>
          <form id="category-period-budget-form" class="form-grid" style="margin-top:10px;">
            <label>Základní rozpočet (Kč)
              <input name="base_budget" type="number" step="0.01" min="0" required value="${safeNumber(periodBudget?.base_budget ?? metrics.baseBudget)}">
            </label>
            <label>Ruční úprava (Kč)
              <input name="manual_adjustment" type="number" step="0.01" value="${safeNumber(periodBudget?.manual_adjustment ?? metrics.manualAdjustment)}">
            </label>
            <div class="row">
              <button class="btn btn-primary" type="submit">Uložit rozpočet</button>
              <button class="btn btn-secondary" type="button" id="category-detail-add-transaction">Přidat transakci</button>
            </div>
          </form>
        </div>
      ` : ''}
      <div class="card" style="margin-top:12px;">
        <h4>Transakce v období</h4>
        ${transactions.length ? transactions.map((t) => `<div class="list-item">${t.transaction_date} · ${formatCurrency(t.amount)} · ${getSubcategoryById(t.subcategory_id)?.name || 'Bez podkategorie'} · ${t.note || '—'}</div>`).join('') : '<div class="empty">Žádné výdaje</div>'}
      </div>
    </div>
  `);
  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.getElementById('category-period-budget-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const baseBudget = safeNumber(payload.base_budget);
    const manualAdjustment = Number(payload.manual_adjustment || 0);
    if (baseBudget < 0) {
      state.status = { type: 'error', message: 'Základní rozpočet musí být alespoň 0 Kč.' };
      render();
      return;
    }
    closeModal();
    await saveCategoryBudgetForCurrentPeriod(categoryId, baseBudget, manualAdjustment);
  });
  document.getElementById('category-detail-add-transaction')?.addEventListener('click', () => {
    closeModal();
    showTransactionModal(null, {
      type: 'expense',
      category_id: categoryId,
      transaction_date: getToday(),
      paid_by: 'Společné',
    });
  });
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
