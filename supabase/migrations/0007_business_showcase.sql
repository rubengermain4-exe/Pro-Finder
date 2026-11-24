-- =====================================================================
-- PRO FINDER - 0007 : vitrines professionnelles personnalisables
-- Migration additive : ne modifie ni les avis, ni les abonnements,
-- ni les règles de validation/publication existantes.
-- =====================================================================

alter table public.businesses
  add column if not exists cover_path text,
  add column if not exists brand_primary_color text not null default '#0B1640',
  add column if not exists brand_accent_color text not null default '#3DDC97',
  add column if not exists social_links jsonb not null default '{}'::jsonb;

alter table public.businesses
  drop constraint if exists businesses_cover_path_check,
  drop constraint if exists businesses_brand_primary_color_check,
  drop constraint if exists businesses_brand_accent_color_check,
  drop constraint if exists businesses_social_links_check;

alter table public.businesses
  add constraint businesses_cover_path_check
    check (cover_path is null or char_length(cover_path) <= 300),
  add constraint businesses_brand_primary_color_check
    check (brand_primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint businesses_brand_accent_color_check
    check (brand_accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint businesses_social_links_check
    check (jsonb_typeof(social_links) = 'object');

alter table public.services
  add column if not exists item_type text not null default 'service';
alter table public.services
  drop constraint if exists services_item_type_check;
alter table public.services
  add constraint services_item_type_check check (item_type in ('service', 'product'));

alter table public.portfolio_images
  add column if not exists is_featured boolean not null default false;

create unique index if not exists portfolio_images_one_featured_per_business
  on public.portfolio_images (business_id)
  where is_featured = true;

-- Les galeries déjà existantes reçoivent une image principale par défaut.
with ranked_images as (
  select id, row_number() over (partition by business_id order by sort_order, created_at, id) as position
    from public.portfolio_images
)
update public.portfolio_images pi
   set is_featured = true
  from ranked_images ri
 where pi.id = ri.id and ri.position = 1;

-- Une seule image principale par vitrine. Le déclencheur fonctionne aussi
-- lorsque l'image mise en avant est changée depuis un autre client.
create or replace function public.set_portfolio_featured_exclusive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.owns_business(new.business_id) or public.is_admin()) then
    raise exception 'forbidden';
  end if;

  if new.is_featured then
    update public.portfolio_images
       set is_featured = false
     where business_id = new.business_id
       and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
       and is_featured = true;
  end if;
  return new;
end;
$$;

drop trigger if exists portfolio_images_featured_exclusive on public.portfolio_images;
create trigger portfolio_images_featured_exclusive
before insert or update of is_featured, business_id on public.portfolio_images
for each row execute function public.set_portfolio_featured_exclusive();

-- Limite serveur de 10 images par galerie, avec verrou par fiche pour
-- éviter que deux téléversements simultanés dépassent la limite.
create or replace function public.enforce_portfolio_image_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  image_count integer;
begin
  if not (public.owns_business(new.business_id) or public.is_admin()) then
    raise exception 'forbidden';
  end if;

  perform pg_advisory_xact_lock(hashtext(new.business_id::text));
  select count(*) into image_count
    from public.portfolio_images
   where business_id = new.business_id
     and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if image_count >= 10 then
    raise exception 'gallery_limit_reached';
  end if;
  return new;
end;
$$;

drop trigger if exists portfolio_images_limit on public.portfolio_images;
create trigger portfolio_images_limit
before insert or update of business_id on public.portfolio_images
for each row execute function public.enforce_portfolio_image_limit();

-- Les premières images ajoutées deviennent automatiquement l'image principale.
create or replace function public.default_featured_portfolio_image()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.portfolio_images
     where business_id = new.business_id and is_featured = true
  ) then
    new.is_featured := true;
  end if;
  return new;
end;
$$;

drop trigger if exists portfolio_images_default_featured on public.portfolio_images;
create trigger portfolio_images_default_featured
before insert on public.portfolio_images
for each row execute function public.default_featured_portfolio_image();

comment on column public.businesses.cover_path is 'Chemin Storage de la couverture de la vitrine.';
comment on column public.businesses.brand_primary_color is 'Couleur principale hexadécimale de la vitrine.';
comment on column public.businesses.brand_accent_color is 'Couleur accent hexadécimale de la vitrine.';
comment on column public.businesses.social_links is 'Liens sociaux publics (facebook, instagram, tiktok, linkedin, youtube).';
comment on column public.portfolio_images.is_featured is 'Image principale de la galerie.';
comment on column public.services.item_type is 'Type de carte du catalogue : service ou product.';

revoke all on function public.set_portfolio_featured_exclusive() from public, anon, authenticated;
revoke all on function public.enforce_portfolio_image_limit() from public, anon, authenticated;
revoke all on function public.default_featured_portfolio_image() from public, anon, authenticated;
