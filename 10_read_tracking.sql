-- ============================================================
-- Patch — run after 08_teacher_stages.sql
-- Adds read/unread tracking to notes (notifications already have
-- this via notification_reads from Phase 5). A recipient can mark
-- a note read, but a trigger protects every other column so only
-- the original sender can ever change the message itself.
-- ============================================================

alter table notes add column if not exists is_read boolean not null default false;

drop policy if exists "notes_update_read" on notes;
create policy "notes_update_read" on notes for update
  using (
    institution_id = my_institution_id()
    and (
      (to_admin = true and my_role() = 'institution_admin')
      or (to_parent = true and exists (
            select 1 from parent_children pc
            where pc.parent_profile_id = auth.uid()
            and pc.student_profile_id = notes.student_profile_id
          ))
      or (to_profile_id = auth.uid())
      or (from_profile_id = auth.uid())
    )
  );

create or replace function protect_note_columns() returns trigger
language plpgsql security definer as $$
begin
  if auth.uid() is not null and auth.uid() <> OLD.from_profile_id then
    NEW.message := OLD.message;
    NEW.to_admin := OLD.to_admin;
    NEW.to_parent := OLD.to_parent;
    NEW.to_profile_id := OLD.to_profile_id;
    NEW.student_profile_id := OLD.student_profile_id;
    NEW.from_profile_id := OLD.from_profile_id;
    NEW.institution_id := OLD.institution_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_protect_note_columns on notes;
create trigger trg_protect_note_columns
  before update on notes
  for each row execute function protect_note_columns();
