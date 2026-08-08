# Phase 2 setup — signup + Super Admin approval

## 1. Database
Run `01_schema.sql` (if not already done), then `02_storage.sql` in the Supabase SQL editor.

## 2. Deploy the edge function
```
supabase functions deploy signup-institution
```
No extra secrets needed — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-available to edge functions in your project.

## 3. Fill in js/config.js
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` — Project Settings → API
- `SIGNUP_FUNCTION_URL` — `https://<project-ref>.supabase.co/functions/v1/signup-institution`

## 4. Create yourself as Super Admin (one-time, manual)
1. Supabase Dashboard → Authentication → Users → **Add user** (your email + password, mark email confirmed).
2. Copy the new user's UUID, then run in the SQL editor:
```sql
insert into profiles (id, role, full_name)
values ('PASTE-USER-UUID-HERE', 'super_admin', 'Nawzad');
```
3. Log in at `super-admin.html` with that email/password.

## 5. Try it
- Open `signup.html`, submit a test institution → it lands in `super-admin.html` under **Pending**.
- Approve it — status flips to `approved`. Email notification to the institution admin is stubbed (`// TODO Phase 7`) until the GAS email service is wired up.

## What's next (Phase 3)
The Institution Admin dashboard itself — teachers, students, parents, stages/groups, syllabus, assessment types. Right now an approved institution admin can log in (their session already exists from signup) but there's no dashboard for them yet.
