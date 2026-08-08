# Phase 5 setup — Student & Parent apps, and closing the notification loop

## 1. Run the schema patch
`05_phase5_patches.sql` in the Supabase SQL editor — extends the notes system so a parent can message a specific teacher directly (reuses the `to_profile_id` column that was sitting unused).

## 2. Nothing new to deploy
No new edge functions this phase — `student.html`, `parent.html`, and `azkar.html` all run on the same `code-login` session from Phase 4.

## 3. Files added/changed this phase
- `student.html` — profile, assessments, attendance, notifications
- `parent.html` — child switcher, same views per child, plus **Messages** (notes from teachers + contact-teacher)
- `azkar.html` — shared Azkar page with a tap counter, linked from all three apps
- `teacher.html` — added an Azkar shortcut, and a Sent/Received toggle on the Notes tab so parent messages don't disappear into a void
- `admin.html` — added a **Notifications** tab (compose + send to everyone / teachers / students / parents / a specific stage / a specific group) — this was described in your spec but hadn't been wired up yet
- `js/i18n.js`, `css/theme.css` — supporting strings and styles

## 4. A judgment call worth knowing about
For the Azkar page I deliberately kept the list short — only very short, universally-known phrases I'm fully confident are accurate, rather than longer routines where I could risk a transcription mistake in religious text. Treat it as a starter set; it's plain, editable HTML if you want to expand it with your own trusted reference.

## 5. Try the full loop
1. As admin, send a notification targeted at a stage.
2. Log in as a student in that stage (`login.html?inst=your-slug`) — it should show up under Notifications.
3. Log in as that student's parent (their parent code) — same notification should appear, plus the Messages tab for contacting a teacher.
4. From the parent's Messages tab, message a teacher. Log back into `teacher.html` and check Notes → **Received**.

## What's next (Phase 6)
The PWA layer — installable on Android and iOS, offline viewing of cached profile/history, and (per your answer earlier) real push notifications, which need a bit of infrastructure (VAPID keys + a send-push edge function) on top of the manifest/service worker.
