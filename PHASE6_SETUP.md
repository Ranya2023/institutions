# Phase 6 setup — PWA + real push notifications

This phase has more moving parts than earlier ones — take it slower and test each piece.

## 1. Run the schema patch
`06_phase6_patches.sql` — before running, **edit the two placeholders inside the file**:
- `YOUR-PROJECT-REF` → your Supabase project ref (Project Settings → General)
- `YOUR_SERVICE_ROLE_KEY` → your service role key (Project Settings → API)

This enables `pg_net` and creates triggers so that inserting into `notifications`, `notes`, or `assessments` automatically calls `send-push`.

## 2. VAPID keys (Web Push)
Generate your own key pair locally — never paste a private key into any file that gets committed to the repo:
```
npx web-push generate-vapid-keys
```
That gives you a Public and Private key. The **public** key goes in `js/config.js` (`VAPID_PUBLIC_KEY`) — safe to commit, safe to expose. The **private** key must never appear in client code or in any `.md`/`.sql`/`.ts` file — set it only as a function secret, run locally so it never touches a chat log or a public repo:
```
supabase secrets set VAPID_PUBLIC_KEY=<your public key>
supabase secrets set VAPID_PRIVATE_KEY=<your private key>
supabase secrets set VAPID_SUBJECT=mailto:you@example.com
```
If you're rotating away from a key that was ever committed or pasted somewhere public, generate a fresh pair and update both the secret and `js/config.js` together — an old/new mismatch makes push silently fail.

## 3. Deploy the new edge function
```
supabase functions deploy send-push --no-verify-jwt
```
`--no-verify-jwt` because this function is only ever called by your own database trigger, not a browser — it checks the Authorization header against your service role key itself (see the function source).

## 4. Files added/changed this phase
- `icons/` — a generated icon set (512/192/apple-touch/favicons) in the platform's teal + gold rosette style
- `manifest-teacher.json`, `manifest-student.json`, `manifest-parent.json` — each app installs as its own icon, opening straight to that role's dashboard
- `sw.js` — service worker: caches the app shell and Supabase data reads (network-first, cache fallback) so profile/history stay viewable offline; writes always require a connection, matching what you asked for
- `js/pwa-install.js` — Android install banner (via `beforeinstallprompt`), iOS "Add to Home Screen" instructions (iOS has no install prompt API), and the push-subscription flow
- `teacher.html` / `student.html` / `parent.html` — linked to their manifest, register the service worker, and show the install/notifications banner once logged in
- `supabase/functions/send-push/` — sends the actual push messages
- Cleanup: the three earlier edge functions now use `Deno.serve` and `npm:@supabase/supabase-js@2` directly instead of a `deno.land/std` import, matching Supabase's current guidance — no behavior change, just less external dependency risk

## 5. Testing checklist
- **Android**: open `teacher.html` (or student/parent) in Chrome after logging in → the install banner should appear within a few seconds; tap it, confirm the native prompt installs the app with the gold-star icon.
- **iOS**: same page in Safari → you'll see the "tap Share → Add to Home Screen" hint instead (Apple doesn't allow a scripted install prompt).
- **Offline viewing**: with the app open and data loaded, turn on airplane mode, reload — profile/assessments/attendance already fetched should still render from cache. New submissions will correctly fail while offline.
- **Push**: tap "Enable notifications" → accept the browser permission → as admin, send a notification targeted at that person's role/stage/group → a system notification should arrive, including with the app closed.

## 6. A note on scope
Push delivery depends on the OS/browser respecting the subscription (Android Chrome is the most reliable target; iOS requires the app to already be installed to the home screen *and* iOS 16.4+ before push works at all — Safari push in a regular browser tab won't work on iOS). This is an iOS/WebKit limitation, not something fixable from this codebase.

## What's next
That closes out the six phases we scoped at the start: schema → institution signup/approval → admin dashboard → teacher app → student/parent apps → PWA/push. From here it's mostly refinement — CSV bulk student import, GAS email/Sheets backup (mentioned early on but not yet built), or anything you want to adjust after testing the real flow end to end.
