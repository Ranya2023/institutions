-- ============================================================
-- Phase 4 patches — run after 01_schema.sql / 02_storage.sql
-- ============================================================

-- 1. Let anyone (no session yet) read basic branding for an approved
--    institution, so login.html can show the right logo/name/colors
--    before the person has logged in.
create policy "institutions_public_read" on institutions for select
  using (status = 'approved');

-- 2. Notes: a note needs to go to the admin OR to the student's parent,
--    not "whoever happens to be linked to this student". Add an explicit
--    to_parent flag and tighten the policies so admin-only notes stay
--    admin-only.
alter table notes add column if not exists to_parent boolean not null default false;

drop policy if exists "notes_select" on notes;
create policy "notes_select" on notes for select
  using (
    institution_id = my_institution_id()
    and (
      from_profile_id = auth.uid()
      or (to_admin = true and my_role() = 'institution_admin')
      or (to_parent = true and exists (
            select 1 from parent_children pc
            where pc.parent_profile_id = auth.uid()
            and pc.student_profile_id = notes.student_profile_id
          ))
    )
  );

drop policy if exists "notes_insert" on notes;
create policy "notes_insert" on notes for insert
  with check (
    institution_id = my_institution_id()
    and from_profile_id = auth.uid()
    and my_role() = 'teacher'
    and (to_admin = true or to_parent = true)
  );
