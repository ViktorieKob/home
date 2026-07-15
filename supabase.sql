create extension if not exists pgcrypto;

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  budget_start_day integer not null default 1 check (budget_start_day between 1 and 31),
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null,
  display_name text not null,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists budget_periods (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'active' check (status in ('active','closed','future')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  type text not null default 'expense' check (type in ('expense','income')),
  icon text default '📦',
  color text default '#2563eb',
  default_budget numeric(12,2) not null default 0 check (default_budget >= 0),
  rollover_mode text not null default 'none' check (rollover_mode in ('none','positive','both')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists period_budgets (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references budget_periods(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  base_budget numeric(12,2) not null default 0 check (base_budget >= 0),
  rollover_amount numeric(12,2) not null default 0,
  manual_adjustment numeric(12,2) not null default 0,
  total_available numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(period_id, category_id)
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  period_id uuid references budget_periods(id) on delete set null,
  type text not null check (type in ('income','expense')),
  amount numeric(12,2) not null check (amount > 0),
  category_id uuid references categories(id) on delete set null,
  paid_by text not null check (paid_by in ('Viki','Káťa','Společné')),
  transaction_date date not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_budget_periods_household on budget_periods(household_id);
create index if not exists idx_categories_household on categories(household_id);
create index if not exists idx_period_budgets_period on period_budgets(period_id);
create index if not exists idx_transactions_household on transactions(household_id);
create index if not exists idx_transactions_period on transactions(period_id);
create index if not exists idx_transactions_date on transactions(transaction_date);

alter table households enable row level security;
alter table household_members enable row level security;
alter table budget_periods enable row level security;
alter table categories enable row level security;
alter table period_budgets enable row level security;
alter table transactions enable row level security;

drop policy if exists households_select on households;
create policy households_select on households
  for select using (exists (select 1 from household_members hm where hm.household_id = households.id and hm.user_id = auth.uid()));
drop policy if exists households_insert on households;
create policy households_insert on households
  for insert with check (true);
drop policy if exists households_update on households;
create policy households_update on households
  for update using (exists (select 1 from household_members hm where hm.household_id = households.id and hm.user_id = auth.uid()));

drop policy if exists household_members_select on household_members;
create policy household_members_select on household_members
  for select using (user_id = auth.uid());
drop policy if exists household_members_insert on household_members;
create policy household_members_insert on household_members
  for insert with check (user_id = auth.uid());
drop policy if exists household_members_update on household_members;
create policy household_members_update on household_members
  for update using (user_id = auth.uid());

drop policy if exists budget_periods_select on budget_periods;
create policy budget_periods_select on budget_periods
  for select using (exists (select 1 from household_members hm where hm.household_id = budget_periods.household_id and hm.user_id = auth.uid()));
drop policy if exists budget_periods_insert on budget_periods;
create policy budget_periods_insert on budget_periods
  for insert with check (exists (select 1 from household_members hm where hm.household_id = budget_periods.household_id and hm.user_id = auth.uid()));
drop policy if exists budget_periods_update on budget_periods;
create policy budget_periods_update on budget_periods
  for update using (exists (select 1 from household_members hm where hm.household_id = budget_periods.household_id and hm.user_id = auth.uid()));

drop policy if exists categories_select on categories;
create policy categories_select on categories
  for select using (exists (select 1 from household_members hm where hm.household_id = categories.household_id and hm.user_id = auth.uid()));
drop policy if exists categories_insert on categories;
create policy categories_insert on categories
  for insert with check (exists (select 1 from household_members hm where hm.household_id = categories.household_id and hm.user_id = auth.uid()));
drop policy if exists categories_update on categories;
create policy categories_update on categories
  for update using (exists (select 1 from household_members hm where hm.household_id = categories.household_id and hm.user_id = auth.uid()));

drop policy if exists period_budgets_select on period_budgets;
create policy period_budgets_select on period_budgets
  for select using (exists (select 1 from household_members hm where hm.household_id = (select household_id from budget_periods bp where bp.id = period_budgets.period_id) and hm.user_id = auth.uid()));
drop policy if exists period_budgets_insert on period_budgets;
create policy period_budgets_insert on period_budgets
  for insert with check (exists (select 1 from household_members hm where hm.household_id = (select household_id from budget_periods bp where bp.id = period_budgets.period_id) and hm.user_id = auth.uid()));
drop policy if exists period_budgets_update on period_budgets;
create policy period_budgets_update on period_budgets
  for update using (exists (select 1 from household_members hm where hm.household_id = (select household_id from budget_periods bp where bp.id = period_budgets.period_id) and hm.user_id = auth.uid()));

drop policy if exists transactions_select on transactions;
create policy transactions_select on transactions
  for select using (exists (select 1 from household_members hm where hm.household_id = transactions.household_id and hm.user_id = auth.uid()));
drop policy if exists transactions_insert on transactions;
create policy transactions_insert on transactions
  for insert with check (exists (select 1 from household_members hm where hm.household_id = transactions.household_id and hm.user_id = auth.uid()));
drop policy if exists transactions_update on transactions;
create policy transactions_update on transactions
  for update using (exists (select 1 from household_members hm where hm.household_id = transactions.household_id and hm.user_id = auth.uid()));
drop policy if exists transactions_delete on transactions;
create policy transactions_delete on transactions
  for delete using (exists (select 1 from household_members hm where hm.household_id = transactions.household_id and hm.user_id = auth.uid()));

-- Public/no-auth mode policies for this single-page app.
-- Keep these only if you intentionally run the app without Supabase Auth.
drop policy if exists households_public_select on households;
create policy households_public_select on households
  for select using (true);
drop policy if exists households_public_insert on households;
create policy households_public_insert on households
  for insert with check (true);
drop policy if exists households_public_update on households;
create policy households_public_update on households
  for update using (true) with check (true);

drop policy if exists budget_periods_public_select on budget_periods;
create policy budget_periods_public_select on budget_periods
  for select using (true);
drop policy if exists budget_periods_public_insert on budget_periods;
create policy budget_periods_public_insert on budget_periods
  for insert with check (true);
drop policy if exists budget_periods_public_update on budget_periods;
create policy budget_periods_public_update on budget_periods
  for update using (true) with check (true);

drop policy if exists categories_public_select on categories;
create policy categories_public_select on categories
  for select using (true);
drop policy if exists categories_public_insert on categories;
create policy categories_public_insert on categories
  for insert with check (true);
drop policy if exists categories_public_update on categories;
create policy categories_public_update on categories
  for update using (true) with check (true);

drop policy if exists period_budgets_public_select on period_budgets;
create policy period_budgets_public_select on period_budgets
  for select using (true);
drop policy if exists period_budgets_public_insert on period_budgets;
create policy period_budgets_public_insert on period_budgets
  for insert with check (true);
drop policy if exists period_budgets_public_update on period_budgets;
create policy period_budgets_public_update on period_budgets
  for update using (true) with check (true);
drop policy if exists period_budgets_public_delete on period_budgets;
create policy period_budgets_public_delete on period_budgets
  for delete using (true);

drop policy if exists transactions_public_select on transactions;
create policy transactions_public_select on transactions
  for select using (true);
drop policy if exists transactions_public_insert on transactions;
create policy transactions_public_insert on transactions
  for insert with check (true);
drop policy if exists transactions_public_update on transactions;
create policy transactions_public_update on transactions
  for update using (true) with check (true);
drop policy if exists transactions_public_delete on transactions;
create policy transactions_public_delete on transactions
  for delete using (true);
