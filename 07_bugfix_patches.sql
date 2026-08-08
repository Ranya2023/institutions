-- ============================================================
-- Bugfix patch — run after 06_phase6_patches.sql
-- Found during a full security review of the RLS policies.
-- ============================================================
--
-- FINDING 1 (important): profiles_update_self and
-- profiles_admin_manage let a user update ANY column on a
-- profile row they're allowed to touch — including `role`.
-- A teacher could set their own role to 'institution_admin',
-- or an institution_admin could promote any user in their
-- institution to 'institution_admin' (or even 'super_admin'),
-- via a direct API call. RLS in Postgres is row-level, not
-- column-level, so this needs a trigger to close.
--
-- FINDING 2 (important): institutions_update_admin lets an
-- institution_admin update ANY column on their own institution
-- row — including `status`. A pending or rejected institution
-- could self-approve, bypassing the Super Admin review entirely.
--
-- Both fixes below revert the protected columns to their
-- previous value unless the actor is a super_admin. The
-- `auth.uid() is not null` guard means service-role calls (your
-- edge functions) and direct SQL-editor/migration work are never
-- affected — only browser sessions authenticated as a non-super-
-- admin are restricted.
-- ============================================================

create or replace function protect_profile_columns() returns trigger
language plpgsql security definer as $$
begin
  if auth.uid() is not null and my_role() <> 'super_admin' then
    NEW.role := OLD.role;
    NEW.institution_id := OLD.institution_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_protect_profile_columns on profiles;
create trigger trg_protect_profile_columns
  before update on profiles
  for each row execute function protect_profile_columns();

create or replace function protect_institution_columns() returns trigger
language plpgsql security definer as $$
begin
  if auth.uid() is not null and my_role() <> 'super_admin' then
    NEW.status := OLD.status;
    NEW.approved_at := OLD.approved_at;
    NEW.rejection_reason := OLD.rejection_reason;
    NEW.admin_profile_id := OLD.admin_profile_id;
    NEW.slug := OLD.slug;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_protect_institution_columns on institutions;
create trigger trg_protect_institution_columns
  before update on institutions
  for each row execute function protect_institution_columns();

-- ============================================================
-- FINDING 3 (defense in depth): a deactivated teacher
-- (is_active = false) was still permitted by RLS to insert new
-- assessments, attendance, or notes — the app UI hid these
-- actions once deactivated, but the database itself didn't
-- enforce it, so a still-open browser tab or a direct API call
-- could bypass that. Adds an explicit is_active check to the
-- write policies that matter.
-- ============================================================

create or replace function my_is_active() returns boolean
language sql stable security definer as $$
  select coalesce(is_active, false) from profiles where id = auth.uid();
$$;

drop policy if exists "assessments_insert" on assessments;
create policy "assessments_insert" on assessments for insert
  with check (my_role() = 'teacher' and my_is_active() and institution_id = my_institution_id() and teacher_profile_id = auth.uid());

drop policy if exists "attendance_write" on attendance;
create policy "attendance_write" on attendance for insert
  with check (my_role() in ('teacher', 'institution_admin') and my_is_active() and institution_id = my_institution_id());

drop policy if exists "attendance_update" on attendance;
create policy "attendance_update" on attendance for update
  using (my_role() in ('teacher', 'institution_admin') and my_is_active() and institution_id = my_institution_id());

drop policy if exists "notes_insert" on notes;
create policy "notes_insert" on notes for insert
  with check (
    institution_id = my_institution_id()
    and from_profile_id = auth.uid()
    and my_is_active()
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
