-- ============================================================
-- Push notification diagnostics — run these one at a time in the
-- Supabase SQL editor. Each one rules something specific in or out.
-- ============================================================

-- 1. Is pg_net actually enabled?
select * from pg_extension where extname = 'pg_net';
-- Expect: one row. If empty, 06_phase6_patches.sql didn't fully run —
-- re-run it.

-- 2. Do the triggers that call send-push actually exist?
select tgname, tgrelid::regclass as table_name
from pg_trigger
where tgname like 'trg_push_%';
-- Expect: 3 rows (trg_push_notifications, trg_push_notes, trg_push_assessments).
-- If empty, the trigger creation in 06_phase6_patches.sql didn't run —
-- re-run that file.

-- 3. THE IMPORTANT ONE. This shows what actually happened the last
-- times Postgres tried to call send-push — success, timeout, wrong
-- URL, wrong auth, everything. Run this right after sending a test
-- notification or note.
select id, status_code, content::text, error_msg, created
from net._http_response
order by created desc
limit 10;
-- status_code 200          -> it worked, check send-push's own logs for why no push arrived
-- status_code 401 or 403   -> the Authorization header (service role key) in
--                             06_phase6_patches.sql's trigger doesn't match
-- status_code null + error_msg -> connection-level failure, almost always
--                             means the URL placeholder wasn't replaced
-- no rows at all            -> the trigger never fired in the first place —
--                             go back to checks 1 and 2 above

-- 4. Manually fire a request the same way the trigger does, bypassing
-- the trigger entirely, to isolate whether the problem is the trigger
-- or the function itself. Replace both placeholders before running.
select net.http_post(
  url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-push',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
  ),
  body := jsonb_build_object(
    'table', 'notifications',
    'record', jsonb_build_object(
      'institution_id', (select id from institutions limit 1),
      'title', 'Test',
      'body', 'Manual pg_net test',
      'target', 'all',
      'sender_profile_id', null
    )
  )
);
-- Then re-run query 3 above to see the result of THIS specific call.
