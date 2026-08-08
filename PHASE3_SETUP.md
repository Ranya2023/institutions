# Phase 3 setup — Institution Admin dashboard

## 1. Deploy the new edge function
```
supabase functions deploy create-member
```
Same auto-available secrets as `signup-institution` — nothing extra to configure.

## 2. Files added this phase
- `admin.html` — the institution admin dashboard (login → pending/rejected/suspended screen → full dashboard)
- `js/ui-helpers.js` — shared modal/toast/code-generator, now used by every dashboard going forward
- `supabase/functions/create-member/index.ts` — creates teacher/student code-login accounts, institution resolved server-side from the caller's session (never trusted from the client)
- Extra component styles appended to `css/theme.css` (modal, stat cards, list items, accordion, chips, toast)
- New Kurdish/Arabic strings appended to `js/i18n.js`

## 2. One naming correction from Phase 2
The Phase 2 schema comment mentioned a clean link like `/l/{slug}`. Since this is static GitHub Pages hosting (no server-side routing), I switched to a query-param link instead: `login.html?inst={slug}`. You'll see this reflected in the Settings tab of `admin.html` already — `login.html` itself is the next thing to build (Phase 4/5), which will read `?inst=` from the URL to know which institution's branding/login to show.

## 3. Try it
1. Log in as the institution admin you created in Phase 2 (or sign up a fresh one, then approve it from `super-admin.html`).
2. Add a stage (e.g. "پۆلی یەکەم") and a group inside it.
3. Add a teacher — you'll get a generated `XXXX-XXXX` code to hand to them.
4. Add a student, assign their stage/group, and note both the student code and the parent code shown — give the same parent code to siblings to group them under one parent account later.
5. Try the "Quick add: Quran" button under Assessments — it creates the Surah / Verse From / Verse To preset used in Phase 4.

## What's next (Phase 4)
The Teacher app: login by code, daily view, student list, the Quran/assessment-type submission flow, attendance marking, and notes to admin/parents.
