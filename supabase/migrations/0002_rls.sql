-- =====================================================================
-- PRO FINDER - 0002 : Row Level Security
-- Principe : tout est interdit par defaut, chaque acces est ouvert explicitement.
-- Les ecritures sensibles (paiements, abonnements, evenements, journal)
-- passent uniquement par des fonctions security definer (0003).
-- =====================================================================

alter table public.app_settings              enable row level security;
alter table public.profiles                  enable row level security;
alter table public.locations                 enable row level security;
alter table public.categories                enable row level security;
alter table public.businesses                enable row level security;
alter table public.services                  enable row level security;
alter table public.portfolio_images          enable row level security;
alter table public.payments                  enable row level security;
alter table public.subscriptions             enable row level security;
alter table public.conversations             enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages                  enable row level security;
alter table public.reviews                   enable row level security;
alter table public.favorites                 enable row level security;
alter table public.advertisements            enable row level security;
alter table public.reports                   enable row level security;
alter table public.notifications             enable row level security;
alter table public.admin_logs                enable row level security;
alter table public.business_events           enable row level security;
alter table public.contact_messages          enable row level security;

-- Privileges de table : retirer ce qui ne doit jamais etre fait depuis le client
revoke insert, update, delete on public.payments, public.subscriptions, public.business_events,
                                 public.admin_logs, public.conversations
  from anon, authenticated;
revoke insert, update, delete, truncate on all tables in schema public from anon;
grant insert on public.contact_messages to anon;
revoke update on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;
revoke all on public.app_settings from anon;

-- app_settings : administrateurs uniquement (les valeurs publiques passent par public_settings())
create policy settings_admin_all on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profiles
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- locations & categories : lecture publique des elements actifs, ecriture admin
create policy locations_read on public.locations for select to anon, authenticated
  using (is_active or public.is_admin());
create policy locations_admin_write on public.locations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy categories_read on public.categories for select to anon, authenticated
  using (is_active or public.is_admin());
create policy categories_admin_write on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- businesses : public seulement si approuve ET abonnement actif
create policy businesses_read on public.businesses for select to anon, authenticated
  using ((status = 'approved' and subscription_ends_at > now())
         or owner_id = auth.uid() or public.is_admin());
create policy businesses_insert on public.businesses for insert to authenticated
  with check (owner_id = auth.uid()
              and not public.is_suspended()
              and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'professionnel'));
create policy businesses_update on public.businesses for update to authenticated
  using ((owner_id = auth.uid() and not public.is_suspended()) or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
create policy businesses_delete on public.businesses for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- services & portfolio : herite de la visibilite de la fiche (la RLS de businesses s'applique)
create policy services_read on public.services for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id));
create policy services_write on public.services for all to authenticated
  using (public.owns_business(business_id) or public.is_admin())
  with check (public.owns_business(business_id) or public.is_admin());

create policy portfolio_read on public.portfolio_images for select to anon, authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id));
create policy portfolio_write on public.portfolio_images for all to authenticated
  using (public.owns_business(business_id) or public.is_admin())
  with check (public.owns_business(business_id) or public.is_admin());

-- paiements & abonnements : lecture seule pour le proprietaire / admin
create policy payments_read on public.payments for select to authenticated
  using (public.owns_business(business_id) or public.is_admin());
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (public.owns_business(business_id) or public.is_admin());

-- messagerie : seuls les participants. Aucun acces administrateur aux conversations privees.
create policy conversations_read on public.conversations for select to authenticated
  using (public.is_participant(id));
create policy participants_read on public.conversation_participants for select to authenticated
  using (public.is_participant(conversation_id));
create policy participants_update_own on public.conversation_participants for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy messages_read on public.messages for select to authenticated
  using (public.is_participant(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_participant(conversation_id) and not public.is_suspended());

-- avis : un avis n'est possible qu'apres un echange reel (voir can_review)
create policy reviews_read on public.reviews for select to anon, authenticated
  using ((status = 'published' and exists (select 1 from public.businesses b where b.id = business_id))
         or author_id = auth.uid() or public.is_admin());
create policy reviews_insert on public.reviews for insert to authenticated
  with check (author_id = auth.uid() and public.can_review(business_id) and not public.is_suspended());
create policy reviews_update_admin on public.reviews for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy reviews_delete_own on public.reviews for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- favoris
create policy favorites_own on public.favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- publicites : lecture publique des publicites actives dans leur fenetre
create policy ads_read on public.advertisements for select to anon, authenticated
  using ((is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
         or public.is_admin());
create policy ads_admin_write on public.advertisements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- signalements
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open' and not public.is_suspended());
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
create policy reports_admin_update on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- notifications
create policy notifications_own_read on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- journal, evenements, contact
create policy admin_logs_read on public.admin_logs for select to authenticated using (public.is_admin());
create policy events_read on public.business_events for select to authenticated
  using (public.owns_business(business_id) or public.is_admin());
create policy contact_insert on public.contact_messages for insert to anon, authenticated
  with check (is_handled = false);
create policy contact_admin_read on public.contact_messages for select to authenticated using (public.is_admin());
create policy contact_admin_update on public.contact_messages for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
