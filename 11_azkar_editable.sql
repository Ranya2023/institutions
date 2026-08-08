-- ============================================================
-- Patch — run after 10_read_tracking.sql
-- Makes Azkar content per-institution and admin-editable (add
-- sections, add/edit/delete items, set a target repeat count per
-- item). Publicly readable (no login needed to view an approved
-- institution's Azkar) since azkar.html is reached from multiple
-- apps that each keep separate sessions — simplest to just pass
-- ?inst=slug in the link rather than depend on any one session.
-- ============================================================

create table azkar_categories (
  id uuid primary key default uuid_generate_v4(),
  institution_id uuid not null references institutions(id) on delete cascade,
  name text not null,
  order_index int default 0,
  created_at timestamptz not null default now()
);

create table azkar_items (
  id uuid primary key default uuid_generate_v4(),
  institution_id uuid not null references institutions(id) on delete cascade,
  category_id uuid not null references azkar_categories(id) on delete cascade,
  arabic_text text not null,
  translit text,
  meaning text,
  target_count int not null default 1,
  order_index int default 0,
  created_at timestamptz not null default now()
);

alter table azkar_categories enable row level security;
alter table azkar_items enable row level security;

-- Public read (approved institutions only) — no session needed
create policy "azkar_categories_public_read" on azkar_categories for select
  using (exists (select 1 from institutions i where i.id = azkar_categories.institution_id and i.status = 'approved'));

create policy "azkar_items_public_read" on azkar_items for select
  using (exists (select 1 from institutions i where i.id = azkar_items.institution_id and i.status = 'approved'));

-- Admin-only write, scoped to their own institution
create policy "azkar_categories_admin_write" on azkar_categories for all
  using (my_role() = 'institution_admin' and institution_id = my_institution_id());

create policy "azkar_items_admin_write" on azkar_items for all
  using (my_role() = 'institution_admin' and institution_id = my_institution_id());
