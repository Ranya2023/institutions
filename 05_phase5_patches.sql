-- ============================================================
-- Phase 5 patch — run after 04_phase4_patches.sql
-- Extends the notes system so a parent can message a specific
-- teacher directly ("contact teacher"), reusing the existing
-- to_profile_id column that was unused until now.
-- ============================================================

drop policy if exists "notes_insert" on notes;
create policy "notes_insert" on notes for insert
  with check (
    institution_id = my_institution_id()
    and from_profile_id = auth.uid()
    and (
      (my_role() = 'teacher' and (to_admin = true or to_parent = true))
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
    )
  );
