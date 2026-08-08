-- ============================================================
-- Patch — run after 07_bugfix_patches.sql
-- Lets an admin restrict a teacher to specific stages (e.g. a
-- Quran teacher assigned only to Stage 3 sees only Stage 3
-- students). A teacher with NO stage assignments still sees
-- everyone — this is an opt-in restriction, not a default lockout,
-- so existing teachers aren't suddenly cut off from students they
-- already had access to.
-- ============================================================

create table teacher_stages (
  teacher_profile_id uuid not null references profiles(id) on delete cascade,
  stage_id uuid not null references stages(id) on delete cascade,
  institution_id uuid not null references institutions(id) on delete cascade,
  primary key (teacher_profile_id, stage_id)
);

alter table teacher_stages enable row level security;

create policy "teacher_stages_select" on teacher_stages for select
  using (institution_id = my_institution_id());

create policy "teacher_stages_admin_write" on teacher_stages for all
  using (my_role() = 'institution_admin' and institution_id = my_institution_id());
