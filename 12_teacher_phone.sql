-- ============================================================
-- Patch — run after 11_azkar_editable.sql
-- Adds a phone number to teachers.
-- ============================================================

alter table teachers add column if not exists phone text;
