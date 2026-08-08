-- ============================================================
-- Patch — run after 13_notes_to_student.sql
-- Two things:
-- 1. Teachers can now add Azkar items scoped to their own stage
--    (previously only admin could add any Azkar at all).
-- 2. Progress on a target-count item is now tracked server-side
--    per student, per day — not just in that student's browser
--    localStorage — so a teacher can actually see how many times
--    each of their stage's students has completed each item.
-- ============================================================

alter table azkar_items add column if not exists stage_id uuid references stages(id);
alter table azkar_items add column if not exists created_by uuid references profiles(id);

create policy "azkar_items_teacher_write" on azkar_items for all
  using (
    my_role() = 'teacher'
    and institution_id = my_institution_id()
    and stage_id is not null
    and stage_id in (select ts.stage_id from teacher_stages ts where ts.teacher_profile_id = auth.uid())
  );

create table azkar_progress (
  id uuid primary key default uuid_generate_v4(),
  institution_id uuid not null references institutions(id) on delete cascade,
  item_id uuid not null references azkar_items(id) on delete cascade,
  student_profile_id uuid not null references profiles(id) on delete cascade,
  progress_date date not null default current_date,
  count int not null default 0,
  updated_at timestamptz not null default now(),
  unique (item_id, student_profile_id, progress_date)
);

alter table azkar_progress enable row level security;

-- A student manages only their own progress rows
create policy "azkar_progress_self" on azkar_progress for all
  using (student_profile_id = auth.uid());

-- A teacher can see progress for students in their own assigned stage
create policy "azkar_progress_teacher_read" on azkar_progress for select
  using (
    my_role() = 'teacher'
    and institution_id = my_institution_id()
    and exists (
      select 1 from students s
      join teacher_stages ts on ts.stage_id = s.stage_id and ts.teacher_profile_id = auth.uid()
      where s.profile_id = azkar_progress.student_profile_id
    )
  );

-- A parent can see their own child's progress
create policy "azkar_progress_parent_read" on azkar_progress for select
  using (
    my_role() = 'parent'
    and exists (
      select 1 from parent_children pc
      where pc.parent_profile_id = auth.uid()
      and pc.student_profile_id = azkar_progress.student_profile_id
    )
  );

-- Admin sees everything in their institution
create policy "azkar_progress_admin_read" on azkar_progress for select
  using (my_role() = 'institution_admin' and institution_id = my_institution_id());
