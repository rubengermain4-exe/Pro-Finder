-- =====================================================================
-- PRO FINDER - 0006 : Realtime + taches planifiees
-- =====================================================================

-- Realtime : diffusion des nouveaux messages (la RLS de `messages` s'applique aux abonnes)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Expiration des abonnements et rappels : tous les jours a 06:00 UTC.
-- Necessite l'extension pg_cron (Dashboard > Database > Extensions > pg_cron).
-- Meme sans pg_cron, la VISIBILITE reste correcte : elle depend de subscription_ends_at > now().
-- pg_cron ne sert qu'a marquer les abonnements "expired" et a envoyer les rappels.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('pro-finder-expire-subscriptions', '0 6 * * *', 'select public.expire_subscriptions()');
  else
    raise notice 'pg_cron non active : activez-le puis relancez cette migration pour planifier les rappels.';
  end if;
end $$;
