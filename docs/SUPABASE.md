# Connecter Supabase — pas à pas

## 1. Créer le projet
1. Créez un compte sur https://supabase.com puis **New project** (choisissez une région proche, ex. Europe ; notez le mot de passe de la base).
2. Attendez la fin du provisionnement.

## 2. Récupérer les clés
**Project Settings → API** :
- **Project URL** → `VITE_SUPABASE_URL`
- **anon / public key** (ou « publishable ») → `VITE_SUPABASE_ANON_KEY`

⚠️ Ne mettez **jamais** la clé `service_role` dans `.env` du frontend. Elle sert uniquement au Worker (secret Cloudflare).

## 3. Exécuter les migrations
**SQL Editor → New query**, puis collez et exécutez **dans l'ordre**, un fichier à la fois :
1. `supabase/migrations/0001_schema.sql`
2. `0002_rls.sql`
3. `0003_functions.sql`
4. `0004_storage.sql`
5. `0005_seed_reference_data.sql`
6. `0006_cron_realtime.sql`

Alternative (CLI) : `npx supabase link --project-ref VOTRE_REF` puis `npx supabase db push`.

> Ces migrations n'ont pas pu être exécutées sur un vrai PostgreSQL pendant la création du projet (pas de base disponible). Exécutez-les sur un projet de test d'abord et signalez toute erreur : les corrections seront simples (voir ETAT-ET-LIMITES.md).

## 4. Authentification
**Authentication → URL Configuration** :
- **Site URL** : votre URL (ex. `https://pro-finder.pages.dev`, ou `http://localhost:5173` en local).
- **Redirect URLs** : ajoutez `http://localhost:5173/**` et `https://VOTRE-DOMAINE/**`.

**Authentication → Providers → Email** : laissez la confirmation d'e-mail activée en production. Pour tester vite en local, vous pouvez la désactiver temporairement.
Pour un envoi d'e-mails fiable en production, configurez un SMTP (Authentication → SMTP Settings) : le SMTP par défaut de Supabase est limité.

## 5. Créer le premier administrateur
1. Inscrivez-vous normalement dans l'application (type « Je cherche un pro »).
2. Dans le SQL Editor :
```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'VOTRE_EMAIL');
```
Reconnectez-vous : le menu affiche « Administration ». (Le rôle admin ne peut pas être obtenu par l'inscription.)

## 6. Realtime et tâches planifiées
- Realtime : `0006` ajoute la table `messages` à la publication `supabase_realtime`. Vérifiez dans **Database → Publications**.
- Rappels/expirations : activez l'extension **pg_cron** (**Database → Extensions**) puis ré-exécutez `0006_cron_realtime.sql`. Vérifiez la tâche avec `select * from cron.job;`.

## 7. Compléter les localités
Les provinces, chefs-lieux et arrondissements de Libreville sont pré-remplis. Ajoutez départements, communes, quartiers depuis **Administration → Localités**.

## 8. Vérifications rapides
- Créer un compte professionnel → créer la fiche → la valider depuis l'admin → activer l'abonnement (mode test) → la fiche apparaît dans l'annuaire.
- Avec un autre compte : écrire au professionnel, répondre, puis déposer un avis.
