# QA pass — bug fixes, security hardening, mobile polish

This wasn't a new feature phase — it was a full pass back through everything in Phases 1–7 looking for real bugs, run before treating any of this as production-ready.

## Security (run `07_bugfix_patches.sql`)
1. **Role escalation, fixed.** `profiles_update_self` and `profiles_admin_manage` let a user update any column on a profile row they were allowed to touch — including `role`. A teacher could set their own role to `institution_admin` via a direct API call (not through the UI, but nothing in the database stopped it). Fixed with a `BEFORE UPDATE` trigger that reverts `role`/`institution_id` unless the actor is genuinely `super_admin`.
2. **Self-approval, fixed.** `institutions_update_admin` let an institution_admin update any column on their own institution row — including `status`. A pending or rejected institution could set itself to `approved`, skipping your review entirely. Fixed the same way, protecting `status`, `approved_at`, `rejection_reason`, `admin_profile_id`, `slug`.
3. **Deactivated-account writes, hardened.** A teacher with `is_active = false` was still permitted by the database (not the UI) to insert assessments/attendance/notes if they had a stale session open. Added an explicit `is_active` check to those insert/update policies.

Both trigger fixes use an `auth.uid() is not null` guard, so they only restrict browser sessions — service-role calls from your edge functions, and anything you run directly in the SQL editor, are unaffected.

## Mobile / iOS / Android
- Every `input`, `select`, and `textarea` sitewide was under 16px font-size, which makes iOS Safari zoom in automatically on tap. Bumped to 16px everywhere — including `<input type="date">` / `<input type="month">`, which also had zero custom styling in `student.html`/`parent.html` (unstyled native picker, now consistent with the rest of the design).
- `.icon-btn` (theme toggle, Azkar link, logout) was 38×38px — under Apple's and Google's 44px touch-target minimum. Bumped to 44×44px.
- The top bar could overflow on a 320px-wide phone (iPhone SE and similar) once the language toggle sits next to 2–3 icon buttons. Now wraps to a second line instead of clipping, and a long institution name truncates with an ellipsis instead of pushing controls off-screen.

## Visual
- Assessment level badges in `student.html`, `parent.html`, and `admin.html`'s teacher-detail view were cramming the full translated word (e.g. "زۆر خراپ" / "ضعيف جدًا") into a 42–44px circle at 10–11px font — guaranteed to overflow or wrap badly. Replaced with a solid-colored star badge (color carries the at-a-glance signal) and moved the actual level name into the readable text line next to it. `teacher.html`'s history tab got the same treatment for consistency.

## PWA
- `admin.html` had no PWA support at all — no manifest, no service worker registration, no install prompt — despite institution admins being just as likely to use this on a phone as anyone else. Added `manifest-admin.json` and the same install/push banner the other three apps have.
- `login.html`, `signup.html`, `super-admin.html`, `azkar.html` now carry proper favicon / apple-touch-icon / theme-color tags for visual consistency, even though they're not meant to be "installed" as their own app.

## Verification performed after all changes
- Every JS file, standalone and inline across all 8 HTML pages — syntax-checked with Node.
- Every SQL file (all 7) and every edge function (all 4) — bracket-balanced.
- Every JSON manifest (all 4) — parses.
- Kurdish and Arabic dictionaries in `js/i18n.js` — confirmed symmetric (201 keys each), zero duplicate keys (one real duplicate, `btn_cancel`, was found and removed).
- Every literal `t('key')` / `data-i18n="key"` reference across every page — resolves to a real dictionary entry.
- Every `onclick`-referenced function across every page — resolves to a real function definition.
- Every local asset a page links to (`css/`, `js/`, `icons/`, manifests) — confirmed to exist.
- `div` tag balance checked per file (structural sanity, given how much HTML was hand-edited across this many rounds).

## What this pass could *not* verify
No headless browser was available in this environment to actually render the pages and click through them, so nothing here has been visually confirmed in a real browser or tested against a live Supabase project. The static checks above catch a large class of real bugs (and did — see the security section), but a real test pass through the Step 8 checklist in `README.md` is still necessary before going live.
