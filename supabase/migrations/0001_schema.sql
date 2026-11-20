-- =====================================================================
-- PRO FINDER - 0001 : schema, contraintes, index, fonctions et triggers
-- A executer dans l'ordre (0001 -> 0006) via le SQL Editor de Supabase
-- ou avec `supabase db push`.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Parametres applicatifs (modifiables uniquement par un administrateur)
-- ---------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('payment_mode',  '"test"'::jsonb),   -- 'test' | 'live'
  ('plan_price',    '1000'::jsonb),     -- FCFA
  ('plan_days',     '90'::jsonb),
  ('reminder_days', '[7,1]'::jsonb);

-- ---------------------------------------------------------------------
-- Profils (1 ligne par utilisateur auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          text not null default 'particulier'
                check (role in ('particulier', 'professionnel', 'admin')),
  full_name     text not null default '' check (char_length(full_name) <= 120),
  phone         text check (phone is null or phone ~ '^[0-9+() .-]{6,30}$'),
  avatar_path   text check (avatar_path is null or char_length(avatar_path) <= 300),
  is_suspended  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Localites (hierarchie administrable)
-- ---------------------------------------------------------------------
create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.locations (id) on delete restrict,
  level       text not null
              check (level in ('province','departement','commune','arrondissement','ville','quartier')),
  name        text not null check (char_length(name) between 1 and 120),
  slug        text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index locations_parent_slug_uq
  on public.locations (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);
create index locations_parent_idx on public.locations (parent_id);

-- ---------------------------------------------------------------------
-- Categories et sous-categories
-- ---------------------------------------------------------------------
create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid references public.categories (id) on delete restrict,
  name         text not null check (char_length(name) between 1 and 100),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  icon         text not null default 'tool',
  description  text check (char_length(description) <= 300),
  is_sensitive boolean not null default false,  -- metiers sensibles (enfants, sante, juridique...)
  sort_order   integer not null default 100,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
create index categories_parent_idx on public.categories (parent_id);

-- ---------------------------------------------------------------------
-- Professionnels / entreprises (une fiche par proprietaire en v1)
-- ---------------------------------------------------------------------
create table public.businesses (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null unique references public.profiles (id) on delete cascade,
  kind                  text not null default 'independant' check (kind in ('independant','entreprise')),
  name                  text not null check (char_length(name) between 2 and 120),
  slug                  text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  tagline               text check (char_length(tagline) <= 140),
  description           text check (char_length(description) <= 3000),
  category_id           uuid references public.categories (id) on delete set null,
  location_id           uuid references public.locations (id) on delete set null,
  address               text check (char_length(address) <= 250),
  phone                 text check (phone is null or phone ~ '^[0-9+() .-]{6,30}$'),
  whatsapp              text check (whatsapp is null or whatsapp ~ '^[0-9+() .-]{6,30}$'),
  email                 text check (email is null or (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  website               text check (website is null or (char_length(website) <= 250 and website ~* '^https?://')),
  logo_path             text check (logo_path is null or char_length(logo_path) <= 300),
  availability          jsonb not null default '{}'::jsonb,
  status                text not null default 'pending'
                        check (status in ('draft','pending','approved','rejected','suspended')),
  rejection_reason      text check (char_length(rejection_reason) <= 500),
  subscription_ends_at  timestamptz,
  views_count           integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index businesses_category_idx on public.businesses (category_id);
create index businesses_location_idx on public.businesses (location_id);
create index businesses_public_idx   on public.businesses (status, subscription_ends_at);
create index businesses_created_idx  on public.businesses (created_at desc);
create index businesses_name_trgm    on public.businesses using gin (lower(name) extensions.gin_trgm_ops);

create table public.services (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  title        text not null check (char_length(title) between 2 and 120),
  description  text check (char_length(description) <= 600),
  price_from   integer check (price_from is null or price_from >= 0),
  price_to     integer check (price_to is null or price_to >= 0),
  sort_order   integer not null default 100,
  created_at   timestamptz not null default now(),
  check (price_to is null or price_from is null or price_to >= price_from)
);
create index services_business_idx on public.services (business_id);

create table public.portfolio_images (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  path         text not null check (char_length(path) <= 300),
  caption      text check (char_length(caption) <= 140),
  sort_order   integer not null default 100,
  created_at   timestamptz not null default now()
);
create index portfolio_business_idx on public.portfolio_images (business_id);

-- ---------------------------------------------------------------------
-- Paiements et abonnements
-- ---------------------------------------------------------------------
create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses (id) on delete cascade,
  user_id            uuid not null references public.profiles (id) on delete cascade,
  amount             integer not null check (amount > 0),
  currency           text not null default 'XAF' check (currency = 'XAF'),
  provider           text not null check (provider in ('test','airtel_money','moov_money')),
  status             text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  provider_reference text,
  is_test            boolean generated always as (provider = 'test') stored,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  paid_at            timestamptz
);
create unique index payments_provider_ref_uq
  on public.payments (provider, provider_reference) where provider_reference is not null;
create index payments_business_idx on public.payments (business_id, created_at desc);

create table public.subscriptions (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  payment_id   uuid unique references public.payments (id) on delete set null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  status       text not null default 'active' check (status in ('active','expired','cancelled')),
  created_at   timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index subscriptions_business_idx on public.subscriptions (business_id, ends_at desc);
create index subscriptions_status_idx   on public.subscriptions (status, ends_at);

-- ---------------------------------------------------------------------
-- Messagerie privee
-- ---------------------------------------------------------------------
create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  client_id        uuid not null references public.profiles (id) on delete cascade,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now(),
  unique (business_id, client_id)
);
create index conversations_client_idx on public.conversations (client_id, last_message_at desc);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  last_read_at    timestamptz,
  primary key (conversation_id, user_id)
);
create index conv_participants_user_idx on public.conversation_participants (user_id);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  sender_id        uuid not null references public.profiles (id) on delete cascade,
  body             text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at       timestamptz not null default now()
);
create index messages_conv_idx on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------
-- Avis, favoris
-- ---------------------------------------------------------------------
create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  comment      text check (char_length(comment) <= 1000),
  status       text not null default 'published' check (status in ('published','hidden')),
  created_at   timestamptz not null default now(),
  unique (business_id, author_id)
);
create index reviews_business_idx on public.reviews (business_id, created_at desc);

create table public.favorites (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  business_id  uuid not null references public.businesses (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, business_id)
);

-- ---------------------------------------------------------------------
-- Publicites sponsorisees, signalements, notifications, journal, stats
-- ---------------------------------------------------------------------
create table public.advertisements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 2 and 120),
  advertiser  text check (char_length(advertiser) <= 120),
  image_url   text not null check (image_url ~* '^https://' and char_length(image_url) <= 500),
  link_url    text not null check (link_url ~* '^https?://' and char_length(link_url) <= 500),
  placement   text not null default 'home_banner' check (placement in ('home_banner','directory_top')),
  starts_at   timestamptz,
  ends_at     timestamptz,
  is_active   boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.profiles (id) on delete cascade,
  target_type      text not null check (target_type in ('business','review','profile')),
  target_id        uuid not null,
  reason           text not null check (reason in ('fraude','contenu_inapproprie','usurpation','faux_avis','metier_sensible','autre')),
  details          text check (char_length(details) <= 1000),
  status           text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  handled_by       uuid references public.profiles (id) on delete set null,
  resolution_note  text check (char_length(resolution_note) <= 500),
  created_at       timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index reports_status_idx on public.reports (status, created_at desc);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  link        text,
  dedupe_key  text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index notifications_dedupe_uq on public.notifications (dedupe_key) where dedupe_key is not null;
create index notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

create table public.admin_logs (
  id           bigint generated always as identity primary key,
  admin_id     uuid references public.profiles (id) on delete set null,
  action       text not null,
  target_type  text,
  target_id    text,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index admin_logs_created_idx on public.admin_logs (created_at desc);

create table public.business_events (
  id           bigint generated always as identity primary key,
  business_id  uuid not null references public.businesses (id) on delete cascade,
  event_type   text not null check (event_type in ('view','whatsapp','phone','message')),
  created_at   timestamptz not null default now()
);
create index business_events_idx on public.business_events (business_id, created_at desc);

create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 120),
  email       text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  subject     text not null check (char_length(subject) between 2 and 150),
  body        text not null check (char_length(body) between 10 and 3000),
  is_handled  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Vue des notes (respecte la RLS de l'appelant)
-- ---------------------------------------------------------------------
create view public.business_rating_stats with (security_invoker = true) as
  select business_id,
         round(avg(rating)::numeric, 1) as avg_rating,
         count(*)                       as review_count
  from public.reviews
  where status = 'published'
  group by business_id;

-- ---------------------------------------------------------------------
-- Fonctions utilitaires (security definer => pas de recursion RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'admin' and not is_suspended);
$$;

create or replace function public.is_suspended() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_suspended from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.owns_business(p_business uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.businesses where id = p_business and owner_id = auth.uid());
$$;

create or replace function public.is_participant(p_conversation uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversation_participants
                 where conversation_id = p_conversation and user_id = auth.uid());
$$;

create or replace function public.is_business_public(p_business uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.businesses
                 where id = p_business and status = 'approved' and subscription_ends_at > now());
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch   before update on public.profiles   for each row execute function public.touch_updated_at();
create trigger businesses_touch before update on public.businesses for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Creation automatique du profil a l'inscription
-- Le role 'admin' ne peut JAMAIS etre choisi a l'inscription.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'role' = 'professionnel' then 'professionnel' else 'particulier' end,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    case when coalesce(new.raw_user_meta_data ->> 'phone', '') ~ '^[0-9+() .-]{6,30}$'
         then new.raw_user_meta_data ->> 'phone' else null end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Protection des colonnes sensibles (anti escalade de privileges)
-- Les requetes client s'executent avec le role 'authenticated' ou 'anon'.
-- Les fonctions security definer et le service_role ne sont pas concernes.
-- ---------------------------------------------------------------------
create or replace function public.protect_profile_columns() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.role := old.role;
    new.is_suspended := old.is_suspended;
  end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

create or replace function public.protect_business_columns() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.status := 'pending';
      new.rejection_reason := null;
      new.subscription_ends_at := null;
      new.views_count := 0;
    else
      new.status := old.status;
      new.rejection_reason := old.rejection_reason;
      new.subscription_ends_at := old.subscription_ends_at;
      new.views_count := old.views_count;
      new.owner_id := old.owner_id;
    end if;
  end if;
  return new;
end $$;
create trigger businesses_protect before insert or update on public.businesses
  for each row execute function public.protect_business_columns();

-- Limites de volume
create or replace function public.enforce_gallery_limit() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.portfolio_images where business_id = new.business_id) >= 12 then
    raise exception 'gallery_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger portfolio_limit before insert on public.portfolio_images
  for each row execute function public.enforce_gallery_limit();

create or replace function public.enforce_services_limit() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.services where business_id = new.business_id) >= 30 then
    raise exception 'services_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger services_limit before insert on public.services
  for each row execute function public.enforce_services_limit();

-- Mise a jour de la date de fin d'abonnement sur la fiche
create or replace function public.sync_subscription_end() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_business uuid := coalesce(new.business_id, old.business_id);
begin
  update public.businesses b
     set subscription_ends_at = (select max(s.ends_at) from public.subscriptions s
                                 where s.business_id = v_business and s.status <> 'cancelled')
   where b.id = v_business;
  return null;
end $$;
create trigger subscriptions_sync after insert or update or delete on public.subscriptions
  for each row execute function public.sync_subscription_end();

-- Notification au proprietaire lors d'un changement de statut de la fiche
create or replace function public.notify_business_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected','suspended') then
    insert into public.notifications (user_id, type, title, body, link)
    values (new.owner_id, 'business_' || new.status,
            case new.status
              when 'approved'  then 'Votre fiche a ete validee'
              when 'rejected'  then 'Votre fiche a ete refusee'
              else 'Votre fiche a ete suspendue' end,
            new.rejection_reason, '/espace-pro');
  end if;
  return null;
end $$;
create trigger businesses_notify after update on public.businesses
  for each row execute function public.notify_business_status();

-- Mise a jour de la date du dernier message
create or replace function public.bump_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return null;
end $$;
create trigger messages_bump after insert on public.messages
  for each row execute function public.bump_conversation();

-- ---------------------------------------------------------------------
-- Journalisation des actions d'administration
-- ---------------------------------------------------------------------
create or replace function public.log_admin_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb; o jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    return null;
  end if;
  if tg_op = 'DELETE' then r := to_jsonb(old); o := null;
  elsif tg_op = 'UPDATE' then r := to_jsonb(new); o := to_jsonb(old);
  else r := to_jsonb(new); o := null; end if;

  insert into public.admin_logs (admin_id, action, target_type, target_id, details)
  values (auth.uid(), lower(tg_op) || ':' || tg_table_name, tg_table_name,
          coalesce(r ->> 'id', r ->> 'key'),
          jsonb_build_object('new', case when tg_op = 'DELETE' then null else r end,
                             'old', o));
  return null;
end $$;

create trigger log_categories     after insert or update or delete on public.categories     for each row execute function public.log_admin_change();
create trigger log_locations      after insert or update or delete on public.locations      for each row execute function public.log_admin_change();
create trigger log_advertisements after insert or update or delete on public.advertisements for each row execute function public.log_admin_change();
create trigger log_settings       after insert or update or delete on public.app_settings   for each row execute function public.log_admin_change();
create trigger log_businesses     after update or delete on public.businesses               for each row execute function public.log_admin_change();
create trigger log_profiles       after update on public.profiles                           for each row execute function public.log_admin_change();
create trigger log_reports        after update on public.reports                            for each row execute function public.log_admin_change();
create trigger log_reviews        after update or delete on public.reviews                  for each row execute function public.log_admin_change();
create trigger log_subscriptions  after update on public.subscriptions                      for each row execute function public.log_admin_change();
