# Institutions Platform — complete package, ready to set up

Kurdish/Arabic institution management platform. Supabase (Postgres + Auth + Storage + Edge Functions) backend, static HTML/CSS/JS frontend for GitHub Pages, installable PWA (Android + iOS) with real push notifications.

This is everything built so far — 7 phases plus a full QA/security-hardening pass — packaged as one deploy-ready zip. Follow the steps below in order; they're the same steps regardless of which phase things came from.

---

## Step 1 — Create the Supabase project
Create a new project at supabase.com if you haven't already. Note your **Project URL**, **anon key**, and **service role key** (Project Settings → API), and your **Project Reference** (Project Settings → General).

## Step 2 — Run the SQL files, in this exact order
Open the Supabase SQL editor and run each of these, top to bottom:

```
01_schema.sql              core tables (institutions, profiles, teachers, students,
                            parents, stages/groups, syllabus, assessment_types,
                            assessments, attendance, notifications, notes,
                            push_subscriptions) with multi-tenant row-level security

02_storage.sql              institution logo upload bucket + policies

04_phase4_patches.sql       lets the pre-login page show institution branding
                            without a session; fixes note visibility (to_parent flag)

05_phase5_patches.sql       lets a parent message a specific teacher directly

06_phase6_patches.sql       edit the 2 placeholders inside this file first
                            (your project ref + service role key), then run —
                            wires up real push notifications via pg_net triggers

07_bugfix_patches.sql       security hardening found during final QA — see
                            "Important: security fixes" below before you skip this

08_teacher_stages.sql       lets admin restrict a teacher to specific stages
                            (e.g. a Quran teacher assigned only to Stage 3 sees
                            only Stage 3 students) — opt-in, teachers with no
                            assignment still see everyone

09_push_diagnostics.sql     not a schema change — a set of queries to run if
                            push notifications aren't arriving; see the
                            comments in the file for how to read the output

10_read_tracking.sql        adds is_read to notes, so recipients can mark a
                            note read (only the sender can still change the
                            actual message — a trigger protects that)

11_azkar_editable.sql       Azkar becomes per-institution and admin-editable
                            instead of one static list shared by everyone —
                            publicly readable, admin-only to edit
```
(There's no `03_*.sql` — that phase only added an edge function, no schema change.)

## Step 3 — Deploy the edge functions
```
supabase functions deploy signup-institution
supabase functions deploy create-member
supabase functions deploy code-login
supabase functions deploy send-push --no-verify-jwt
```

## Step 4 — Set the push notification secrets
Generate your own VAPID key pair locally — never commit a private key to this (or any) repo:
```
npx web-push generate-vapid-keys
```
Take the **public** key it gives you and put it in `js/config.js` (`VAPID_PUBLIC_KEY`) — safe to commit. Take the **private** key and set it only as a function secret, run this locally so the value never ends up in a chat log or a file:
```
supabase secrets set VAPID_PUBLIC_KEY=<your public key>
supabase secrets set VAPID_PRIVATE_KEY=<your private key>
supabase secrets set VAPID_SUBJECT=mailto:you@example.com
```
Keep the public key in `js/config.js` and the secret in sync — a mismatched pair fails silently.

## Step 5 — Fill in `js/config.js`
Open the file and replace every placeholder: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and the three `*_FUNCTION_URL` values. Each function URL follows this exact pattern (swap in your project ref and the function name):
```
https://YOUR-PROJECT-REF.supabase.co/functions/v1/signup-institution
https://YOUR-PROJECT-REF.supabase.co/functions/v1/create-member
https://YOUR-PROJECT-REF.supabase.co/functions/v1/code-login
```
(`send-push` isn't called from the browser, so it doesn't need an entry in `config.js` — it's only referenced from `06_phase6_patches.sql`.)

## Step 6 — Make yourself Super Admin (one-time, manual)
There's no self-serve signup for this role by design. In the Supabase Dashboard:
1. Authentication → Users → **Add user** (your email + password, mark confirmed).
2. Copy the new user's UUID, then in the SQL editor:
```sql
insert into profiles (id, role, full_name) values ('PASTE-YOUR-USER-UUID', 'super_admin', 'Nawzad');
```
3. Log in at `super-admin.html` with that email/password.

## Step 7 — Push to GitHub Pages
This is a static site — no build step. Push the whole folder with your usual `push.ps1` pattern.

## Step 8 — Test the full loop
1. Open `signup.html`, submit a test institution.
2. Approve it in `super-admin.html`.
3. Log into `admin.html` as that institution → add a stage/group, a teacher, a student (note the generated codes and the parent code shown).
4. Open `login.html?inst=your-slug`, log in as the teacher → submit an assessment, mark attendance, send a note.
5. Log in as the student, then as the parent (using their codes) → confirm the assessment/attendance/note all show up correctly.
6. In `admin.html`, tap that teacher → confirm their submission shows in the audit view; check the new Attendance tab.
7. On a phone: confirm the install banner appears (Android) or the "Add to Home Screen" hint appears (iOS), and that push notifications arrive after tapping "Enable notifications."

---

## Important: security fixes in 07_bugfix_patches.sql

During a final review I found two real bugs worth understanding, not just patching blindly:

1. **Role escalation** — any logged-in teacher, student, or parent could change their *own* `role` to `institution_admin` (or higher) with a direct API call. Row-level security was checking which *row* someone could touch, not which *columns* — so `role` itself was unprotected.
2. **Self-approval** — a pending or rejected institution's admin could set their own institution's `status` to `approved` the same way, completely bypassing your Super Admin review.

Both are closed with database triggers that silently revert those specific columns unless the actor is genuinely `super_admin`. If you already ran `01`–`06` on a live project, **run `07_bugfix_patches.sql` before letting real users near it** — it's not optional polish.

## What changed in this final pass (beyond the security fixes)
- **Mobile**: every form input/select was under the 16px font-size that stops iOS Safari auto-zooming on tap — fixed sitewide. Icon buttons were 38px (under Apple/Google's 44px touch-target minimum) — bumped to 44px. The top bar could overflow on a 320px-wide phone once 3–4 icon buttons sat next to the language toggle — now wraps gracefully instead of clipping.
- **Visual**: assessment level badges were cramming a full word like "زۆر خراپ" into a 44px circle in the student/parent/admin views — replaced with a compact colored star badge, with the level name moved to readable text alongside it.
- **PWA**: `admin.html` had no install support at all — now installable like the other three apps, with its own `manifest-admin.json`.
- **Consistency**: `login.html`, `signup.html`, `super-admin.html`, `azkar.html` now all carry the proper favicon/apple-touch-icon/theme-color, even though only the four main apps (admin/teacher/student/parent) are meant to be "installed."

## Everything was re-verified after these changes
Every JS file (shared + inline in all 8 HTML pages) — syntax-checked. Every SQL file and edge function — bracket-balanced. Every JSON manifest — parses. Every `t('key')` / `data-i18n` reference across every page — resolves to a real, translated key (Kurdish and Arabic dictionaries confirmed symmetric: 201 keys each, zero duplicates). Every `onclick`-referenced function — resolves to a real definition. Every local file a page links to (`css/`, `js/`, `icons/`, manifests) — exists. None of this has run against a live Supabase project yet, though — budget real testing time, especially for push notifications (Phase 6 has the most moving parts).

## What's in each phase

| Phase | Adds |
|---|---|
| 1 | `01_schema.sql` — full schema + RLS |
| 2 | `signup.html`, `super-admin.html`, `02_storage.sql`, `signup-institution` function |
| 3 | `admin.html`, `create-member` function, `js/ui-helpers.js` |
| 4 | `login.html`, `teacher.html`, `04_phase4_patches.sql`, `code-login` function |
| 5 | `student.html`, `parent.html`, `azkar.html`, `05_phase5_patches.sql` |
| 6 | `manifest-*.json`, `sw.js`, `js/pwa-install.js`, `icons/`, `06_phase6_patches.sql`, `send-push` function |
| 7 | `admin.html` updated — teacher submission drill-down, Attendance tab |
| Post-launch fixes | Real-project debugging round: fixed the edge function URL format, per-page session isolation (`js/supabase-client.js`), a broken `students` query in `teacher.html`, and a CSS selector that never matched (`.inst-logo`) |
| Latest | `08_teacher_stages.sql` + downloadable QR credential cards on teacher/student creation (`admin.html`) + `login.html` now accepts `?code=` to pre-fill from a scanned QR + all 9 app titles now in Kurdish + `09_push_diagnostics.sql` for troubleshooting push |
| Read/unread system | `10_read_tracking.sql` + unread badges and click-to-read on notifications/notes across all 4 apps + a new Notifications tab in `teacher.html` (never existed before) + a new Notes tab in `admin.html` (teachers could message admin since Phase 4, but admin had no way to see it) |
| Azkar | `11_azkar_editable.sql` + `azkar.html` rewritten to be institution-scoped and database-driven, with a target-count counter per item and a celebration state when reached + new Azkar management tab in `admin.html` (add sections, add/edit/delete items, one-click starter set) |
| Icon + sizing pass | New app icon (the shield crest) generated into all 5 sizes, dropped in under the same filenames the manifests already reference — no manifest changes needed. Buttons, form fields, list items, tabs, stat numbers, and headings all sized up sitewide for a more native-app feel. Confirmed no horizontal-scroll risk anywhere; multi-button groups (level picker, attendance, stat cards) were already row/grid-based. |
| Real-project fixes round 2 | New Quran-on-stand icon (replacing the shield). Admin nav rebuilt as a 2-row icon grid (11 sections, genuinely no scroll — a pill-tab row physically couldn't fit that many Kurdish labels). Fixed a shared dropdown-filter bug that broke student/syllabus/attendance stage filtering everywhere it was used. |
| Teacher/student management overhaul | `12_teacher_phone.sql` — teacher form rebuilt with phone + a stage dropdown + a subject dropdown drawn from that stage's syllabus (not free text) + edit-after-creation for both teachers and students. Stages/syllabus now required before either can be added. Word (`.doc`) export for the student list and attendance, plus a per-student attendance date drill-down. |
| Teacher announcements | `13_notes_to_student.sql` — teachers can now address an announcement to the student directly (previously only admin or parent), and `student.html` gained a way to actually see these — it had none before. |
| Azkar progress tracking | `14_azkar_progress.sql` — teachers can add Azkar scoped to their own stage and see real per-student completion counts (progress now syncs server-side instead of staying on one phone's local storage). |
| Prayer times | `prayer-times.html` — real coordinates for Ranya, live data from the Aladhan API, next-prayer highlighted, linked from all 4 apps. No schema changes. |
| Quran reader | `quran.html` — all 114 surahs (verified live against the source API, not typed from memory), tap through to real Uthmani Arabic text, cached per-surah since the text never changes. Linked from all 4 apps. No schema changes. |
| QA pass | `07_bugfix_patches.sql`, mobile/touch/iOS-zoom fixes, level-badge redesign, `admin.html` PWA support |

## Full file listing

```
01_schema.sql ... 07_bugfix_patches.sql     (run in this order)
PHASE2_SETUP.md ... PHASE7_SETUP.md          (historical, per-phase detail)

admin.html            institution admin dashboard
super-admin.html       your institution-approval queue
signup.html            public institution signup
login.html              per-institution code login (?inst=slug)
teacher.html / student.html / parent.html / azkar.html

css/theme.css           shared design system
js/config.js            <- fill in your Supabase URL/keys here
js/i18n.js               Kurdish/Arabic strings (201 keys, verified in sync)
js/supabase-client.js
js/ui-helpers.js
js/pwa-install.js

manifest-admin.json / manifest-teacher.json / manifest-student.json / manifest-parent.json
sw.js
icons/  (512, 192, apple-touch, favicons)

supabase/functions/
  signup-institution/
  create-member/
  code-login/
  send-push/
```

## Still outstanding
Only the Google Apps Script piece from your original ask remains: welcome/approval emails and the Google Sheets backup. Different stack (Apps Script, not Supabase/HTML) — it'll ship as its own `.gs` file whenever you want it, rather than more additions to this zip.
