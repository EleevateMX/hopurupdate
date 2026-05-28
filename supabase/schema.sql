-- ============================================================
-- HOPUR / YUCATALENT — Esquema de registro de contactos
-- Proyecto Supabase: urtduigdlkwbopczlbhr
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
  cargo        text,                          -- puesto / cargo
  empresa      text,                          -- empresa / organización
  phone        text not null check (char_length(trim(phone)) >= 7),
  email        text not null check (position('@' in email) > 1),
  source       text not null default 'web',  -- 'web' | 'google' | 'app'
  auth_user_id uuid,                          -- auth.users.id si entró con Google
  user_agent   text,
  created_at   timestamptz not null default now()
);

-- Si la tabla ya existía de una versión anterior, agrega las columnas nuevas.
alter table public.hopur_contacts add column if not exists cargo   text;
alter table public.hopur_contacts add column if not exists empresa text;

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


-- ============================================================
-- BLOG / "Última hora" del evento
-- ============================================================
create table if not exists public.hopur_posts (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  panelist     text,                 -- quién habló
  role         text,                 -- cargo / tema
  summary      text,                 -- bajada / resumen corto
  body         text,                 -- cuerpo (opcional)
  points       text[] default '{}',  -- puntos clave (lista)
  image_url    text,
  published     boolean not null default true,
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists hopur_posts_pub_idx
  on public.hopur_posts (published_at desc);

alter table public.hopur_posts enable row level security;

-- Lectura pública SOLO de los posts publicados (es un blog).
drop policy if exists hopur_posts_select_public on public.hopur_posts;
create policy hopur_posts_select_public
  on public.hopur_posts
  for select to anon, authenticated
  using (published = true);

-- Escritura: solo desde el panel de Supabase / service_role (no se da a anon).

-- Post de bienvenida para que el feed no aparezca vacío.
insert into public.hopur_posts (title, panelist, role, summary, points)
select
  'Arranca Yucatalent 2026',
  'HOPUR',
  'Organización',
  'Bienvenidos al I Foro Iberoamericano de Empleabilidad en Mérida. Aquí publicaremos lo más relevante de cada panel en tiempo real.',
  array[
    'Sigue el programa de los dos días desde la app.',
    'Te avisaremos lo más importante de cada sesión.',
    'Del diálogo a la acción: empleabilidad y talento.'
  ]
where not exists (select 1 from public.hopur_posts);


-- ============================================================
-- Suscripciones a notificaciones push (Web Push)
-- ============================================================
create table if not exists public.hopur_push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

alter table public.hopur_push_subscriptions enable row level security;

-- Permitir que cualquiera registre su suscripción (INSERT). Sin SELECT a anon.
drop policy if exists hopur_push_insert_anon on public.hopur_push_subscriptions;
create policy hopur_push_insert_anon
  on public.hopur_push_subscriptions
  for insert to anon, authenticated
  with check (true);


-- ============================================================
-- ADMINS — quién puede publicar en el blog y enviar push
-- ============================================================
create table if not exists public.hopur_admins (
  email      text primary key,
  created_at timestamptz not null default now()
);
alter table public.hopur_admins enable row level security;

-- Un usuario autenticado puede consultar SOLO su propia fila (saber si es admin).
drop policy if exists hopur_admins_self on public.hopur_admins;
create policy hopur_admins_self on public.hopur_admins
  for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- Los admins pueden gestionar TODO el blog (crear, editar, borrar, ver borradores).
drop policy if exists hopur_posts_admin_all on public.hopur_posts;
create policy hopur_posts_admin_all on public.hopur_posts
  for all to authenticated
  using (exists (select 1 from public.hopur_admins a where lower(a.email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.hopur_admins a where lower(a.email) = lower(auth.jwt() ->> 'email')));

-- Los admins pueden leer los contactos registrados (para el conteo del panel).
drop policy if exists hopur_contacts_admin_select on public.hopur_contacts;
create policy hopur_contacts_admin_select on public.hopur_contacts
  for select to authenticated
  using (exists (select 1 from public.hopur_admins a where lower(a.email) = lower(auth.jwt() ->> 'email')));

-- Los admins pueden leer las suscripciones push (para el conteo del panel).
drop policy if exists hopur_push_admin_select on public.hopur_push_subscriptions;
create policy hopur_push_admin_select on public.hopur_push_subscriptions
  for select to authenticated
  using (exists (select 1 from public.hopur_admins a where lower(a.email) = lower(auth.jwt() ->> 'email')));

-- 👉 IMPORTANTE: date de alta como admin (agrega aquí los correos de Google):
insert into public.hopur_admins (email) values ('edronemidmx@gmail.com') on conflict (email) do nothing;
--    insert into public.hopur_admins (email) values ('otrocorreo@gmail.com') on conflict (email) do nothing;


-- ============================================================
-- MURO / COMUNIDAD (publicaciones, reacciones y comentarios)
-- ============================================================
create table if not exists public.hopur_wall_posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null,
  author_name   text,
  author_avatar text,
  body          text,
  image_url     text,
  created_at    timestamptz not null default now()
);
create index if not exists hopur_wall_posts_idx on public.hopur_wall_posts (created_at desc);
alter table public.hopur_wall_posts enable row level security;
drop policy if exists hopur_wall_posts_read on public.hopur_wall_posts;
create policy hopur_wall_posts_read on public.hopur_wall_posts for select to anon, authenticated using (true);
drop policy if exists hopur_wall_posts_insert on public.hopur_wall_posts;
create policy hopur_wall_posts_insert on public.hopur_wall_posts for insert to authenticated with check (auth.uid() = author_id);
drop policy if exists hopur_wall_posts_delete on public.hopur_wall_posts;
create policy hopur_wall_posts_delete on public.hopur_wall_posts for delete to authenticated
  using (auth.uid() = author_id or exists (select 1 from public.hopur_admins a where lower(a.email) = lower(auth.jwt() ->> 'email')));

create table if not exists public.hopur_wall_comments (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.hopur_wall_posts(id) on delete cascade,
  author_id     uuid not null,
  author_name   text,
  author_avatar text,
  body          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists hopur_wall_comments_idx on public.hopur_wall_comments (post_id, created_at);
alter table public.hopur_wall_comments enable row level security;
drop policy if exists hopur_wall_comments_read on public.hopur_wall_comments;
create policy hopur_wall_comments_read on public.hopur_wall_comments for select to anon, authenticated using (true);
drop policy if exists hopur_wall_comments_insert on public.hopur_wall_comments;
create policy hopur_wall_comments_insert on public.hopur_wall_comments for insert to authenticated with check (auth.uid() = author_id);
drop policy if exists hopur_wall_comments_delete on public.hopur_wall_comments;
create policy hopur_wall_comments_delete on public.hopur_wall_comments for delete to authenticated
  using (auth.uid() = author_id or exists (select 1 from public.hopur_admins a where lower(a.email) = lower(auth.jwt() ->> 'email')));

create table if not exists public.hopur_wall_reactions (
  post_id    uuid not null references public.hopur_wall_posts(id) on delete cascade,
  user_id    uuid not null,
  type       text not null default 'like',  -- 'like' | 'love'
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.hopur_wall_reactions enable row level security;
drop policy if exists hopur_wall_react_read on public.hopur_wall_reactions;
create policy hopur_wall_react_read on public.hopur_wall_reactions for select to anon, authenticated using (true);
drop policy if exists hopur_wall_react_write on public.hopur_wall_reactions;
create policy hopur_wall_react_write on public.hopur_wall_reactions for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists hopur_wall_react_update on public.hopur_wall_reactions;
create policy hopur_wall_react_update on public.hopur_wall_reactions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists hopur_wall_react_delete on public.hopur_wall_reactions;
create policy hopur_wall_react_delete on public.hopur_wall_reactions for delete to authenticated using (auth.uid() = user_id);

-- Almacenamiento de fotos del muro (bucket público "wall").
insert into storage.buckets (id, name, public) values ('wall', 'wall', true)
  on conflict (id) do nothing;
drop policy if exists hopur_wall_storage_read on storage.objects;
create policy hopur_wall_storage_read on storage.objects for select to anon, authenticated using (bucket_id = 'wall');
drop policy if exists hopur_wall_storage_insert on storage.objects;
create policy hopur_wall_storage_insert on storage.objects for insert to authenticated with check (bucket_id = 'wall');
drop policy if exists hopur_wall_storage_delete on storage.objects;
create policy hopur_wall_storage_delete on storage.objects for delete to authenticated using (bucket_id = 'wall' and owner = auth.uid());
