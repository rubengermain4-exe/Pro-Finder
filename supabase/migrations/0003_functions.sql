-- =====================================================================
-- PRO FINDER - 0003 : fonctions RPC (recherche, messagerie, paiements, admin)
-- =====================================================================

-- Valeurs publiques des parametres
create or replace function public.public_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'payment_mode', (select value #>> '{}' from public.app_settings where key = 'payment_mode'),
    'plan_price',   (select (value #>> '{}')::int from public.app_settings where key = 'plan_price'),
    'plan_days',    (select (value #>> '{}')::int from public.app_settings where key = 'plan_days'));
$$;

-- ---------------------------------------------------------------------
-- Recherche d'annuaire (categorie et localite incluent leurs descendants)
-- ---------------------------------------------------------------------
create or replace function public.search_businesses(
  p_q        text default null,
  p_category uuid default null,
  p_location uuid default null,
  p_kind     text default null,
  p_sort     text default 'relevance',
  p_limit    int  default 12,
  p_offset   int  default 0
) returns table (
  id uuid, slug text, name text, kind text, tagline text, logo_path text,
  category_id uuid, category_name text, location_id uuid, location_name text,
  avg_rating numeric, review_count bigint, views_count int,
  created_at timestamptz, total_count bigint
)
language sql stable security invoker set search_path = public, extensions as $$
  with recursive loc as (
    select l.id from public.locations l where l.id = p_location
    union all
    select c.id from public.locations c join loc on c.parent_id = loc.id
  ), cat as (
    select c.id from public.categories c where c.id = p_category
    union all
    select c.id from public.categories c join cat on c.parent_id = cat.id
  )
  select b.id, b.slug, b.name, b.kind, b.tagline, b.logo_path,
         b.category_id, c.name, b.location_id,
         case when pl.name is null then l.name else l.name || ', ' || pl.name end,
         r.avg_rating, coalesce(r.review_count, 0), b.views_count, b.created_at,
         count(*) over ()
  from public.businesses b
  left join public.categories c  on c.id = b.category_id
  left join public.locations  l  on l.id = b.location_id
  left join public.locations  pl on pl.id = l.parent_id
  left join public.business_rating_stats r on r.business_id = b.id
  cross join lateral (
    select unaccent(lower(concat_ws(' ', b.name, b.tagline, b.description, c.name, l.name,
             (select string_agg(s.title, ' ') from public.services s where s.business_id = b.id)))) as hay
  ) h
  where b.status = 'approved'
    and b.subscription_ends_at > now()
    and (p_kind is null or b.kind = p_kind)
    and (p_category is null or b.category_id in (select id from cat))
    and (p_location is null or b.location_id in (select id from loc))
    and (p_q is null or btrim(p_q) = '' or not exists (
          select 1
          from unnest(string_to_array(btrim(unaccent(lower(p_q))), ' ')) as w
          where w <> ''
            and h.hay not like '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%'))
  order by
    case when p_sort = 'recent'  then extract(epoch from b.created_at) end desc nulls last,
    case when p_sort = 'rating'  then coalesce(r.avg_rating, 0) end desc nulls last,
    case when p_sort = 'popular' then b.views_count end desc nulls last,
    b.name asc
  limit least(greatest(p_limit, 1), 48)
  offset greatest(p_offset, 0);
$$;

-- ---------------------------------------------------------------------
-- Statistiques et evenements
-- ---------------------------------------------------------------------
create or replace function public.track_event(p_business uuid, p_type text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_type not in ('view','whatsapp','phone','message') then
    raise exception 'invalid_event_type';
  end if;
  if not public.is_business_public(p_business) then return; end if;
  if public.owns_business(p_business) then return; end if;
  insert into public.business_events (business_id, event_type) values (p_business, p_type);
  if p_type = 'view' then
    update public.businesses set views_count = views_count + 1 where id = p_business;
  end if;
end $$;

create or replace function public.business_stats(p_business uuid, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_days int := least(greatest(p_days, 1), 365); res jsonb;
begin
  if not (public.owns_business(p_business) or public.is_admin()) then
    raise exception 'forbidden';
  end if;
  select jsonb_build_object(
    'totals', (select coalesce(jsonb_object_agg(event_type, n), '{}'::jsonb)
               from (select event_type, count(*) n from public.business_events
                     where business_id = p_business and created_at > now() - make_interval(days => v_days)
                     group by 1) t),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'views', coalesce(v.n, 0)) order by d), '[]'::jsonb)
              from generate_series((now() - make_interval(days => v_days - 1))::date, now()::date, interval '1 day') d
              left join (select created_at::date as day, count(*) n from public.business_events
                         where business_id = p_business and event_type = 'view'
                           and created_at > now() - make_interval(days => v_days)
                         group by 1) v on v.day = d::date),
    'favorites', (select count(*) from public.favorites where business_id = p_business),
    'avg_rating', (select avg_rating from public.business_rating_stats where business_id = p_business),
    'review_count', (select coalesce(review_count, 0) from public.business_rating_stats where business_id = p_business),
    'conversations', (select count(*) from public.conversations where business_id = p_business)
  ) into res;
  return res;
end $$;

-- ---------------------------------------------------------------------
-- Messagerie
-- ---------------------------------------------------------------------
create or replace function public.start_conversation(p_business uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_cid uuid; v_body text := btrim(coalesce(p_body, ''));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if public.is_suspended() then raise exception 'account_suspended'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then raise exception 'invalid_message'; end if;

  select owner_id into v_owner from public.businesses
   where id = p_business and status = 'approved' and subscription_ends_at > now();
  if v_owner is null then raise exception 'business_unavailable'; end if;
  if v_owner = auth.uid() then raise exception 'self_conversation'; end if;

  insert into public.conversations (business_id, client_id) values (p_business, auth.uid())
  on conflict (business_id, client_id) do update set last_message_at = now()
  returning id into v_cid;

  insert into public.conversation_participants (conversation_id, user_id, last_read_at)
  values (v_cid, auth.uid(), now()), (v_cid, v_owner, null)
  on conflict do nothing;

  insert into public.messages (conversation_id, sender_id, body) values (v_cid, auth.uid(), v_body);
  insert into public.business_events (business_id, event_type) values (p_business, 'message');
  return v_cid;
end $$;

create or replace function public.my_conversations() returns table (
  id uuid, business_id uuid, business_name text, business_slug text,
  other_name text, i_am_client boolean, last_message text,
  last_message_at timestamptz, unread_count bigint
)
language sql stable security definer set search_path = public as $$
  select c.id, c.business_id, b.name, b.slug,
         case when c.client_id = auth.uid() then b.name
              else coalesce(nullif(p.full_name, ''), 'Utilisateur') end,
         (c.client_id = auth.uid()),
         (select m.body from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1),
         c.last_message_at,
         (select count(*) from public.messages m
           where m.conversation_id = c.id and m.sender_id <> auth.uid()
             and m.created_at > coalesce(cp.last_read_at, 'epoch'::timestamptz))
  from public.conversation_participants cp
  join public.conversations c on c.id = cp.conversation_id
  join public.businesses b on b.id = c.business_id
  join public.profiles p on p.id = c.client_id
  where cp.user_id = auth.uid()
  order by c.last_message_at desc;
$$;

create or replace function public.mark_conversation_read(p_conversation uuid) returns void
language sql security definer set search_path = public as $$
  update public.conversation_participants set last_read_at = now()
   where conversation_id = p_conversation and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Avis : eligibilite = echange reel (le client a ecrit ET le professionnel a repondu)
-- ---------------------------------------------------------------------
create or replace function public.can_review(p_business uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
    and not public.owns_business(p_business)
    and exists (
      select 1 from public.conversations c
      where c.business_id = p_business and c.client_id = auth.uid()
        and exists (select 1 from public.messages m where m.conversation_id = c.id and m.sender_id = c.client_id)
        and exists (select 1 from public.messages m join public.businesses b on b.id = c.business_id
                    where m.conversation_id = c.id and m.sender_id = b.owner_id));
$$;

create or replace function public.eligible_reviews() returns table (business_id uuid, name text, slug text)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, b.slug
  from public.businesses b
  where public.can_review(b.id)
    and not exists (select 1 from public.reviews r where r.business_id = b.id and r.author_id = auth.uid());
$$;

create or replace function public.business_reviews(p_business uuid)
returns table (id uuid, rating smallint, comment text, created_at timestamptz, author_name text)
language sql stable security definer set search_path = public as $$
  select r.id, r.rating, r.comment, r.created_at,
         coalesce(nullif(btrim(split_part(p.full_name, ' ', 1)
           || case when split_part(p.full_name, ' ', 2) <> '' then ' ' || left(split_part(p.full_name, ' ', 2), 1) || '.' else '' end), ''),
           'Utilisateur')
  from public.reviews r
  join public.profiles p on p.id = r.author_id
  where r.business_id = p_business and r.status = 'published'
    and (public.is_business_public(p_business) or public.owns_business(p_business) or public.is_admin())
  order by r.created_at desc
  limit 50;
$$;

-- ---------------------------------------------------------------------
-- Paiements / abonnements
-- ---------------------------------------------------------------------
-- Prolonge l'abonnement (jamais appele par le client)
create or replace function public.apply_paid_payment(p_payment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pay public.payments; v_days int; v_cur timestamptz; v_start timestamptz;
begin
  select * into pay from public.payments where id = p_payment for update;
  if not found then raise exception 'payment_not_found'; end if;
  if pay.status <> 'paid' then raise exception 'payment_not_paid'; end if;
  if exists (select 1 from public.subscriptions where payment_id = p_payment) then return; end if; -- idempotent

  select (value #>> '{}')::int into v_days from public.app_settings where key = 'plan_days';
  select max(ends_at) into v_cur from public.subscriptions
   where business_id = pay.business_id and status = 'active' and ends_at > now();
  v_start := greatest(now(), coalesce(v_cur, now()));

  insert into public.subscriptions (business_id, payment_id, starts_at, ends_at, status)
  values (pay.business_id, p_payment, v_start, v_start + make_interval(days => v_days), 'active');

  insert into public.notifications (user_id, type, title, body, link)
  values (pay.user_id, 'subscription_active', 'Abonnement active',
          'Votre abonnement est valable ' || v_days || ' jours.', '/espace-pro/abonnement');
end $$;

-- MODE TEST uniquement : aucun argent reel n'est echange. Refuse si payment_mode <> 'test'.
create or replace function public.start_test_payment(p_business uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_mode text; v_price int; v_pid uuid;
begin
  if auth.uid() is null or not public.owns_business(p_business) then raise exception 'forbidden'; end if;
  if public.is_suspended() then raise exception 'account_suspended'; end if;
  select value #>> '{}' into v_mode from public.app_settings where key = 'payment_mode';
  if v_mode is distinct from 'test' then raise exception 'test_mode_disabled'; end if;
  select (value #>> '{}')::int into v_price from public.app_settings where key = 'plan_price';

  insert into public.payments (business_id, user_id, amount, provider, status, provider_reference, metadata, paid_at)
  values (p_business, auth.uid(), v_price, 'test', 'paid', 'TEST-' || gen_random_uuid(),
          '{"note":"Paiement de test - aucun argent reel"}'::jsonb, now())
  returning id into v_pid;
  perform public.apply_paid_payment(v_pid);
  return v_pid;
end $$;

-- Paiement reel (futur) : cree un paiement 'pending' ; seul le service_role le confirme.
create or replace function public.create_pending_payment(p_business uuid, p_provider text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_price int; v_pid uuid;
begin
  if auth.uid() is null or not public.owns_business(p_business) then raise exception 'forbidden'; end if;
  if p_provider not in ('airtel_money','moov_money') then raise exception 'invalid_provider'; end if;
  select (value #>> '{}')::int into v_price from public.app_settings where key = 'plan_price';
  insert into public.payments (business_id, user_id, amount, provider, status)
  values (p_business, auth.uid(), v_price, p_provider, 'pending') returning id into v_pid;
  return v_pid;
end $$;

create or replace function public.confirm_payment(p_payment uuid, p_reference text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_reference is null or btrim(p_reference) = '' then raise exception 'reference_required'; end if;
  update public.payments
     set status = 'paid', provider_reference = p_reference, paid_at = now()
   where id = p_payment and status = 'pending' and provider <> 'test';
  if found then perform public.apply_paid_payment(p_payment); end if;
end $$;

-- Expiration automatique et rappels (appelee chaque jour par pg_cron, voir 0006)
create or replace function public.expire_subscriptions() returns void
language plpgsql security definer set search_path = public as $$
declare d int; s record;
begin
  for s in
    select sub.id, sub.business_id, b.owner_id
    from public.subscriptions sub join public.businesses b on b.id = sub.business_id
    where sub.status = 'active' and sub.ends_at <= now()
  loop
    update public.subscriptions set status = 'expired' where id = s.id;
    insert into public.notifications (user_id, type, title, body, link, dedupe_key)
    values (s.owner_id, 'subscription_expired', 'Abonnement expire',
            'Votre fiche n''est plus visible. Renouvelez pour la republier.', '/espace-pro/abonnement', 'exp-' || s.id)
    on conflict do nothing;
  end loop;

  for d in select jsonb_array_elements_text(value)::int from public.app_settings where key = 'reminder_days' loop
    insert into public.notifications (user_id, type, title, body, link, dedupe_key)
    select b.owner_id, 'subscription_reminder',
           'Votre abonnement expire dans ' || d || ' jour' || case when d > 1 then 's' else '' end,
           'Renouvelez pour garder votre fiche visible.', '/espace-pro/abonnement', 'rem-' || sub.id || '-' || d
    from public.subscriptions sub join public.businesses b on b.id = sub.business_id
    where sub.status = 'active'
      and sub.ends_at::date = (now() + make_interval(days => d))::date
    on conflict do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Administration
-- ---------------------------------------------------------------------
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'users',            (select coalesce(jsonb_object_agg(role, n), '{}'::jsonb) from (select role, count(*) n from public.profiles group by 1) t),
    'businesses',       (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.businesses group by 1) t),
    'public_businesses',(select count(*) from public.businesses where status = 'approved' and subscription_ends_at > now()),
    'active_subscriptions', (select count(*) from public.subscriptions where status = 'active' and ends_at > now()),
    'revenue_real',     (select coalesce(sum(amount), 0) from public.payments where status = 'paid' and not is_test),
    'revenue_test',     (select coalesce(sum(amount), 0) from public.payments where status = 'paid' and is_test),
    'open_reports',     (select count(*) from public.reports where status in ('open','reviewing')),
    'unhandled_contacts', (select count(*) from public.contact_messages where not is_handled),
    'active_ads',       (select count(*) from public.advertisements where is_active),
    'conversations',    (select count(*) from public.conversations));
end $$;

create or replace function public.admin_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, full_name text, phone text, role text, is_suspended boolean, created_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select p.id, u.email::text, p.full_name, p.phone, p.role, p.is_suspended, p.created_at, count(*) over ()
    from public.profiles p join auth.users u on u.id = p.id
    where p_search is null or btrim(p_search) = ''
       or u.email ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
       or p.full_name ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_grant_subscription(p_business uuid, p_days int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_cur timestamptz; v_start timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_days < 1 or p_days > 365 then raise exception 'invalid_days'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'reason_required'; end if;
  select max(ends_at) into v_cur from public.subscriptions where business_id = p_business and status = 'active' and ends_at > now();
  v_start := greatest(now(), coalesce(v_cur, now()));
  insert into public.subscriptions (business_id, starts_at, ends_at, status)
  values (p_business, v_start, v_start + make_interval(days => p_days), 'active');
  insert into public.admin_logs (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'grant_subscription', 'business', p_business::text,
          jsonb_build_object('days', p_days, 'reason', btrim(p_reason)));
end $$;

-- ---------------------------------------------------------------------
-- Droits d'execution : par defaut tout est ferme, on ouvre au cas par cas
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_admin(), public.is_suspended(), public.owns_business(uuid),
  public.is_participant(uuid), public.is_business_public(uuid), public.can_review(uuid)
  to anon, authenticated;                       -- necessaires aux politiques RLS
grant execute on function public.public_settings(), public.search_businesses(text, uuid, uuid, text, text, int, int),
  public.track_event(uuid, text), public.business_reviews(uuid)
  to anon, authenticated;
grant execute on function public.business_stats(uuid, int), public.start_conversation(uuid, text),
  public.my_conversations(), public.mark_conversation_read(uuid), public.eligible_reviews(),
  public.start_test_payment(uuid), public.create_pending_payment(uuid, text),
  public.admin_overview(), public.admin_list_users(text, int, int), public.admin_grant_subscription(uuid, int, text)
  to authenticated;
grant execute on function public.confirm_payment(uuid, text), public.apply_paid_payment(uuid),
  public.expire_subscriptions() to service_role;
