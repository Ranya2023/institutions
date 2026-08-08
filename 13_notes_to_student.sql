-- ============================================================
-- Patch — run after 12_teacher_phone.sql
-- Adds a third note target: the student themselves (previously a
-- teacher could only address admin or parent, not the student
-- directly). Builds on the notes_insert/notes_select versions from
-- 07_bugfix_patches.sql — that's the most recent prior definition.
-- ============================================================

alter table notes add column if not exists to_student boolean not null default false;

drop policy if exists "notes_insert" on notes;
create policy "notes_insert" on notes for insert
  with check (
    institution_id = my_institution_id()
    and from_profile_id = auth.uid()
    and my_is_active()
    and (
      (my_role() = 'teacher' and (to_admin = true or to_parent = true or to_student = true))
      or (
        my_role() = 'parent'
        and to_profile_id is not null
        and exists (
          select 1 from parent_children pc
          where pc.parent_profile_id = auth.uid()
          and pc.student_profile_id = notes.student_profile_id
        )
      )
    )
  );

drop policy if exists "notes_select" on notes;
create policy "notes_select" on notes for select
  using (
    institution_id = my_institution_id()
    and (
      from_profile_id = auth.uid()
      or to_profile_id = auth.uid()
      or (to_admin = true and my_role() = 'institution_admin')
      or (to_parent = true and exists (
            select 1 from parent_children pc
            where pc.parent_profile_id = auth.uid()
            and pc.student_profile_id = notes.student_profile_id
          ))
      or (to_student = true and student_profile_id = auth.uid())
    )
  );
