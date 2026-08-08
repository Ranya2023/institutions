-- ============================================================
-- Phase 6 patch — run after 05_phase5_patches.sql
-- Wires up real Web Push: whenever a notification, note, or
-- assessment is inserted, ping the send-push edge function.
--
-- Fill in the two placeholders below before running:
--   YOUR-PROJECT-REF   -> Project Settings -> General -> Reference ID
--   YOUR_SERVICE_ROLE_KEY -> Project Settings -> API -> service_role key
-- (The service role key here is only ever sent from your own
-- database to your own edge function — never to a browser.)
-- ============================================================

create extension if not exists pg_net;

create or replace function trigger_send_push() returns trigger
language plpgsql security definer as $$
begin
  perform net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := jsonb_build_object('table', TG_TABLE_NAME, 'record', to_jsonb(NEW))
  );
  return NEW;
end;
$$;

drop trigger if exists trg_push_notifications on notifications;
create trigger trg_push_notifications after insert on notifications
  for each row execute function trigger_send_push();

drop trigger if exists trg_push_notes on notes;
create trigger trg_push_notes after insert on notes
  for each row execute function trigger_send_push();

drop trigger if exists trg_push_assessments on assessments;
create trigger trg_push_assessments after insert on assessments
  for each row execute function trigger_send_push();
