-- ============================================================
-- Storage: institution logos
-- Run after 01_schema.sql (needs the my_institution_id() function)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Anyone can view logos (they're shown publicly on login pages)
create policy "logos_public_read" on storage.objects for select
  using (bucket_id = 'logos');

-- An institution admin can only upload/update inside their own
-- institution's folder: logos/{institution_id}/logo.png
create policy "logos_owner_insert" on storage.objects for insert
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = my_institution_id()::text
  );

create policy "logos_owner_update" on storage.objects for update
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = my_institution_id()::text
  );
