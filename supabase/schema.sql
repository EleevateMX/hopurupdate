-- ============================================================
-- HOPUR / YUCATALENT — Esquema de registro de contactos
-- Proyecto Supabase: rwvnulxlygdjxvovxind
--
-- IMPORTANTE: todas las tablas usan el prefijo "hopur_" para NO
-- interferir con ningún otro proyecto que viva en el mismo Supabase
-- (por ejemplo ApagonesMID). Este script SOLO crea objetos hopur_*.
--
-- Cómo usarlo:
--   1. Abre el proyecto en https://supabase.com → SQL Editor
--   2. Pega este archivo y ejecútalo (RUN)
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.hopur_contacts (
  id           uuid primary key default gen_random_uuid(),
  first_name   text not null check (char_length(trim(first_name)) > 0),
  last_name    text not null check (char_length(trim(last_name)) > 0),
  phone        text not null check (char_length(trim(phone)) >= 7),
  email        text not null check (position('@' in email) > 1),
  source       text not null default 'web',  -- 'web' | 'google' | 'app'
  auth_user_id uuid,                          -- auth.users.id si entró con Google
  user_agent   text,
  created_at   timestamptz not null default now()
);

-- Evita correos duplicados (sin distinguir mayúsculas/minúsculas).
create unique index if not exists hopur_contacts_email_key
  on public.hopur_contacts (lower(email));

-- ------------------------------------------------------------
-- Seguridad (Row Level Security)
-- ------------------------------------------------------------
alter table public.hopur_contacts enable row level security;

-- Permitir SOLO INSERT desde el navegador (la llave publishable
-- actúa como rol anon / authenticated). No se otorga SELECT, así
-- que nadie puede leer los datos de otras personas desde el cliente.
drop policy if exists hopur_contacts_insert_anon on public.hopur_contacts;
create policy hopur_contacts_insert_anon
  on public.hopur_contacts
  for insert
  to anon, authenticated
  with check (true);

-- Los registros se consultan/exportan desde el panel de Supabase
-- o con la service_role key (server-side). NUNCA con la publishable.
