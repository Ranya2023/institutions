# Phase 4 setup — code login + Teacher app

## 1. Run the schema patch
`04_phase4_patches.sql` in the Supabase SQL editor. It does two things:
- Lets the pre-login page read an approved institution's name/logo/colors without a session.
- Fixes note visibility: adds a `to_parent` flag so an admin-only note isn't also visible to the student's parent, and vice versa. (This replaces the `notes_select`/`notes_insert` policies from `01_schema.sql`.)

## 2. Deploy the new edge function
```
supabase functions deploy code-login
```

## 3. Fill in js/config.js
Add the new `CODE_LOGIN_FUNCTION_URL` value (same pattern as the other two).

## 4. How the login flow works
- `admin.html` → Settings tab shows each institution's link: `login.html?inst={slug}`.
- A teacher/student/parent opens that link, types their code, and `code-login` resolves it (teacher code → student code → parent_code, in that order) and hands back a one-time token.
- The browser exchanges that token for a real Supabase session via `verifyOtp` — from then on it behaves like any normal login, including staying signed in until they tap logout.
- A parent's account is created automatically the *first* time someone logs in with their parent code — there's nothing for the admin to set up beyond assigning that code to the student(s).

## 5. Try it
1. In `admin.html`, note a teacher's code and a student's code + parent code (from the confirmation shown after adding them in Phase 3).
2. Open `login.html?inst=your-slug`, log in as the teacher.
3. Tap a student → **Add assessment** → pick a type (try the Quran preset) → fill it in → pick a level → save.
4. Tap the same student → **Mark attendance** → pick a status.
5. Send a note to the admin about a student, then check the **History** and **Notes** tabs.

## What's next (Phase 5)
Student and Parent apps — both read-mostly views of exactly what the teacher just submitted (assessments, attendance, notes/alerts), plus the syllabus and Azkar button.
