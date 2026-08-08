-- ============================================================
-- Institution Management Platform — Core Schema
-- Target: Supabase (Postgres). Run in the Supabase SQL editor.
-- ============================================================
--
-- AUTH DESIGN NOTE (read before building the edge functions):
-- - Institution admins sign up with a real email + password
--   (normal supabase.auth.signUp), through a "create-institution"
--   Edge Function that also inserts the institutions + profiles
--   rows in one transaction (service role — bypasses RLS).
-- - Teachers/students/parents log in with a permanent CODE, no
--   password. A "code-login" Edge Function (service role) looks
--   up the code, creates a synthetic auth user on first login
--   (email like {code}@{institution_id}.codelogin.internal,
--   random password never shown to anyone), then uses
--   auth.admin.generateLink({type:'magiclink'}) + the client
--   calling verifyOtp() to establish a real, persistent session.
--   This gets us full RLS support (auth.uid()) and "stay logged
--   in until logout" for free via Supabase's normal session
--   refresh handling.
-- - Institution's public login link = https://yoursite/l/{slug}
--   which pre-fills the institution context before asking for
--   a code.
-- - Because creation flows above use the service role key, they
--   bypass RLS by design. The policies below govern ONLY normal
--   client reads/writes after a session already exists.
-- ============================================================

-- ---------- Extensions ----------
create extension if not exists "uuid-ossp";

-- ---------- Enums ----------
create type user_role as enum ('super_admin', 'institution_admin', 'teacher', 'student', 'parent');
create type institution_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type attendance_status as enum ('present', 'absent', 'late', 'excused');
create type assessment_level as enum ('excellent', 'good', 'fine', 'bad', 'very_bad');
create type notification_target as enum ('all', 'teachers', 'students', 'parents', 'stage', 'group');

-- ============================================================
-- Institutions
-- ============================================================
create table institutions (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,                 -- used in login link: /l/{slug}
  name text not null,
  name_ar text,
  name_ku text,
  logo_url text,
  location text,
  email text not null,
  phone text,
  primary_color text default '#12243a',
  secondary_color text default '#c9a227',
  status institution_status not null default 'pending',
  rejection_reason text,
  admin_profile_id uuid,                     -- set after profile is created
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

-- ============================================================
-- Profiles (1:1 with auth.users)
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  institution_id uuid references institutions(id) on delete cascade, -- null for super_admin
  role user_role not null,
  full_name text not null,
  full_name_ar text,
  full_name_ku text,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_profiles_institution on profiles(institution_id);

alter table institutions
  add constraint fk_institutions_admin_profile
  foreign key (admin_profile_id) references profiles(id);

-- ============================================================
-- Academic structure
-- ============================================================
create table stages (
  id uuid primary key default uuid_generate_v4(),
  institution_id uuid not null references institutions(id) on delete cascade,
  name text not null,
  name_ar text,
  name_ku text,
  order_index int default 0,
  created_at timestamptz not null default now()
);

create table groups (
  id uuid primary key default uuid_generate_v4(),
  institution_id uuid not null references institutions(id) on delete cascade,
  stage_id uuid not null references stages(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table syllabus (
  id uuid primary key default uuid_generate_v4(),
  institution_id uuid not null references institutions(id) on delete cascade,
  stage_id uuid references stages(id),
  title text not null,
  description text,
  file_url text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- People: teachers, students, parents
-- ============================================================
create table teachers (
  profile_id uuid primary key references profiles(id) on delete cascade,
  institution_id uuid not null references institutions(id) on delete cascade,
  code text not null,
  subject text,
  bio text,
  unique(institution_id, code)
);

create table students (
  profile_id uuid primary key references profiles(id) on delete cascade,
  institution_id uuid not null references institutions(id) on delete cascade,
  code text not null,
  stage_id uuid references stages(id),
  group_id uuid references groups(id),
  parent_code text not null,        -- shared across siblings to group under one parent account
  date_of_birth date,
  unique(institution_id, code)
);
create index idx_students_parent_code on students(institution_id, parent_code);

create table parents (
  profile_id uuid primary key references profiles(id) on delete cascade,
  institution_id uuid not null references institutions(id) on delete cascade,
  code text not null,               -- equals the parent_code used by their child(ren)
  unique(institution_id, code)
);

create table parent_children (
  parent_profile_id uuid not null references profiles(id) on delete cascade,
  student_profile_id uuid not null references profiles(id) on delete cascade,
  primary key (parent_profile_id, student_profile_id)
);

-- ============================================================
-- Assessments (institution-configurable types, e.g. Quran/Homework/Exam)
-- ============================================================
create table assessment_types (
  id uuid primary key default uuid_generate_v4(),
  institution_id uuid not null references institutions(id) on delete cascade,
  name text not null,
  name_ar text,
  name_ku text,
  icon text default 'book-open',
  fields jsonb not null default '[]',  -- e.g. [{"key":"surah","label":"Surah","type":"text"},{"key":"verse_from","type":"number"},{"key":"verse_to","type":"number"}]
  created_at timestamptz not null default now()
);

create table assessments (
  id uuid primary key default uuid_generate_v4(),
  institution_id uuid not null references institutions(id) on delete cascade,
  student_profile_id uuid not null references profiles(id) on delete cascade,
  teacher_profile_id uuid not null references profiles(id) on delete cascade,
  assessment_type_id uuid not null references assessment_types(id),
  details jsonb not null default '{}', -- matches assessment_types.fields, e.g. {"surah":"Al-Baqarah","verse_from":1,"verse_to":20}
  level assessment_level not null,
  remarks text,
  assessment_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index idx_assessments_student on assessments(student_profile_id, assessment_date);
create index idx_assessments_teacher on assessments(teacher_profile_id, assessment_date);

-- ============================================================
-- Attendance
-- ============================================================
create table attendance (
  id uuid primary key default uuid_generate_v4(),
  institution_id uuid not null references institutions(id) on delete cascade,
  student_profile_id uuid not null references profiles(id) on delete cascade,
  status attendance_status not null,
  marked_by uuid references profiles(id),
  attendance_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique(student_profile_id, attendance_date)
);
create index idx_attendance_student on attendance(student_profile_id, attendance_date);

-- ============================================================
-- Notifications + Web Push
-- ============================================================
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  institution_id uuid not null references institutions(id) on delete cascade,
  sender_profile_id uuid references profiles(id),
  target notification_target not null,
  target_stage_id uuid references stages(id),
  target_group_id uuid references groups(id),
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table notification_reads (
  notification_id uuid not null references notifications(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, profile_id)
);

create table push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now(),
  unique(profile_id, endpoint)
);

-- ============================================================
-- Notes (teacher -> parent or teacher -> admin, about a student)
-- ============================================================
create table notes (
  id uuid primary key default uuid_generate_v4(),
  institution_id uuid not null references institutions(id) on delete cascade,
  from_profile_id uuid not null references profiles(id),
  to_profile_id uuid references profiles(id),
  to_admin boolean not null default false,
  student_profile_id uuid references profiles(id),
  message text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Helper functions used by RLS policies
-- ============================================================
create or replace function my_role() returns user_role
language sql stable security definer as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function my_institution_id() returns uuid
language sql stable security definer as $$
  select institution_id from profiles where id = auth.uid();
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table institutions enable row level security;
alter table profiles enable row level security;
alter table stages enable row level security;
alter table groups enable row level security;
alter table syllabus enable row level security;
alter table teachers enable row level security;
alter table students enable row level security;
alter table parents enable row level security;
alter table parent_children enable row level security;
alter table assessment_types enable row level security;
alter table assessments enable row level security;
alter table attendance enable row level security;
alter table notifications enable row level security;
alter table notification_reads enable row level security;
alter table push_subscriptions enable row level security;
alter table notes enable row level security;

-- Institutions: super_admin manages all; institution_admin reads/updates own.
-- NOTE: institution creation happens via the signup Edge Function (service role),
-- there is intentionally no client-side insert policy here.
create policy "institutions_select" on institutions for select
  using (my_role() = 'super_admin' or id = my_institution_id());
create policy "institutions_update_admin" on institutions for update
  using (my_role() = 'institution_admin' and id = my_institution_id())
  with check (id = my_institution_id());
create policy "institutions_update_super" on institutions for update
  using (my_role() = 'super_admin');

-- Profiles
create policy "profiles_select" on profiles for select
  using (my_role() = 'super_admin' or institution_id = my_institution_id() or id = auth.uid());
create policy "profiles_update_self" on profiles for update
  using (id = auth.uid());
create policy "profiles_admin_manage" on profiles for all
  using (my_role() = 'institution_admin' and institution_id = my_institution_id());

-- Institution-scoped reference data
create policy "stages_scoped" on stages for all
  using (institution_id = my_institution_id() or my_role() = 'super_admin');
create policy "groups_scoped" on groups for all
  using (institution_id = my_institution_id() or my_role() = 'super_admin');
create policy "syllabus_scoped" on syllabus for all
  using (institution_id = my_institution_id() or my_role() = 'super_admin');
create policy "assessment_types_scoped" on assessment_types for all
  using (institution_id = my_institution_id() or my_role() = 'super_admin');

-- People tables: institution-wide read, admin-only write
create policy "teachers_scoped_read" on teachers for select
  using (institution_id = my_institution_id());
create policy "teachers_admin_write" on teachers for all
  using (my_role() = 'institution_admin' and institution_id = my_institution_id());

create policy "students_scoped_read" on students for select
  using (institution_id = my_institution_id());
create policy "students_admin_write" on students for all
  using (my_role() = 'institution_admin' and institution_id = my_institution_id());

create policy "parents_scoped_read" on parents for select
  using (institution_id = my_institution_id());
create policy "parents_admin_write" on parents for all
  using (my_role() = 'institution_admin' and institution_id = my_institution_id());

create policy "parent_children_read" on parent_children for select
  using (
    parent_profile_id = auth.uid()
    or student_profile_id = auth.uid()
    or (my_role() in ('institution_admin', 'teacher')
        and exists (select 1 from profiles p where p.id = student_profile_id and p.institution_id = my_institution_id()))
  );

-- Assessments: teachers write their own; admin/teacher/student(self)/parent(own child) read
create policy "assessments_select" on assessments for select
  using (
    institution_id = my_institution_id()
    and (
      my_role() in ('institution_admin', 'teacher')
      or student_profile_id = auth.uid()
      or exists (select 1 from parent_children pc where pc.parent_profile_id = auth.uid() and pc.student_profile_id = assessments.student_profile_id)
    )
  );
create policy "assessments_insert" on assessments for insert
  with check (my_role() = 'teacher' and institution_id = my_institution_id() and teacher_profile_id = auth.uid());
create policy "assessments_update_own" on assessments for update
  using (teacher_profile_id = auth.uid());

-- Attendance: same visibility pattern as assessments
create policy "attendance_select" on attendance for select
  using (
    institution_id = my_institution_id()
    and (
      my_role() in ('institution_admin', 'teacher')
      or student_profile_id = auth.uid()
      or exists (select 1 from parent_children pc where pc.parent_profile_id = auth.uid() and pc.student_profile_id = attendance.student_profile_id)
    )
  );
create policy "attendance_write" on attendance for insert
  with check (my_role() in ('teacher', 'institution_admin') and institution_id = my_institution_id());
create policy "attendance_update" on attendance for update
  using (my_role() in ('teacher', 'institution_admin') and institution_id = my_institution_id());

-- Notifications: admin creates; institution reads (client filters by target)
create policy "notifications_select" on notifications for select
  using (institution_id = my_institution_id());
create policy "notifications_insert" on notifications for insert
  with check (my_role() = 'institution_admin' and institution_id = my_institution_id());
create policy "notification_reads_own" on notification_reads for all
  using (profile_id = auth.uid());

-- Push subscriptions: self only
create policy "push_subscriptions_own" on push_subscriptions for all
  using (profile_id = auth.uid());

-- Notes: sender, direct recipient, institution admin, or the note's student's parent
create policy "notes_select" on notes for select
  using (
    institution_id = my_institution_id()
    and (
      from_profile_id = auth.uid()
      or to_profile_id = auth.uid()
      or (to_admin = true and my_role() = 'institution_admin')
      or exists (select 1 from parent_children pc where pc.parent_profile_id = auth.uid() and pc.student_profile_id = notes.student_profile_id)
    )
  );
create policy "notes_insert" on notes for insert
  with check (institution_id = my_institution_id() and from_profile_id = auth.uid());
