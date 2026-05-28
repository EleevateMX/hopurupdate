-- ============================================================
-- HOPUR / YUCATALENT — Teardown (BORRA TODO lo de hopur_)
--
-- Este script elimina ÚNICAMENTE los objetos con prefijo hopur_.
-- NO toca ninguna otra tabla del proyecto Supabase (ApagonesMID
-- u otros quedan intactos). Úsalo si quieres empezar de cero.
-- ============================================================

drop policy if exists hopur_contacts_insert_anon on public.hopur_contacts;
drop index  if exists public.hopur_contacts_email_key;
drop table  if exists public.hopur_contacts cascade;
