# Phase 7 — admin audit views

No new database tables, RLS changes, or edge functions this phase — everything runs on data and permissions already in place from Phases 1–6. Just `admin.html` changed.

## What was added
- **Teachers tab**: tapping a teacher (not the pause/play button) now drills into a filterable list of every assessment *they've* submitted — filter by date or by student, with a back arrow to return to the teacher list. This is the "click a teacher's name to see all their submissions" feature from your original spec.
- **New Attendance tab**: a per-student monthly breakdown (present/absent/late/excused counts), filterable by month and by stage — answers "how many times was this student absent/late this month" at a glance, rather than a long flat list.

## Nothing to configure
Both features query tables and use RLS policies that already exist (`assessments_select`, `attendance_select` already grant `institution_admin` full institution-wide read). Just redeploy the updated `admin.html` to GitHub Pages.

## Try it
1. As admin, open **Teachers**, tap any teacher (not the pause icon) → their submission history opens with date/student filters.
2. Open the new **Attendance** tab → pick a month and optionally a stage → see present/absent/late/excused counts per student.

## Still outstanding
Only the Google Apps Script piece remains from your original ask — welcome/approval emails and the Google Sheets backup. That's Phase 8 whenever you want it; it's a different stack (Apps Script, not Supabase/HTML), so it'll be its own separate deliverable file rather than more additions to this zip.
