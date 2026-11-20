# Pro Finder — Le bon professionnel, au bon endroit.

Annuaire professionnel du Gabon : particuliers, indépendants et entreprises trouvent et contactent des prestataires (plombier, frigoriste, électricien, mécanicien, nounou…).

**Stack** : HTML5 · CSS3 · JavaScript ES Modules · Vite · Supabase (Auth, PostgreSQL, Storage, Realtime) · Cloudflare Pages + Workers. Aucun framework lourd (une seule dépendance runtime : `@supabase/supabase-js`).

## Démarrage rapide (Windows, macOS, Linux)

Prérequis : [Node.js 20+](https://nodejs.org) et un projet [Supabase](https://supabase.com) gratuit.

```bash
npm install
copy .env.example .env      # (macOS/Linux : cp .env.example .env)
# Renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
npm run dev                 # http://localhost:5173
```

Avant de lancer : exécutez les migrations SQL (voir **docs/SUPABASE.md**). Sans configuration, l'application affiche un écran « Configuration requise ».

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production dans `dist/` |
| `npm run preview` | Prévisualiser le build |
| `npm test` | Tests unitaires (validation, routeur, XSS, images…) |
| `npm run check` | Vérifications statiques (syntaxe, imports, SQL, sécurité) |
| `npm run verify` | check + tests + build |
| `npm run deploy:pages` | Déployer `dist/` sur Cloudflare Pages |
| `npm run deploy:worker` | Déployer le Worker de paiement |

## Arborescence

```
src/
  main.js, app.js, routes.js     démarrage, routeur, shell
  config.js                      variables VITE_* (publiques)
  lib/                           html (anti-XSS), format, validators, router, image, toast, dom
  state/auth.js                  session + profil
  services/                      accès Supabase (catalog, account, pro, messaging, admin)
  components/                    en-tête, pied de page, cartes, icônes, modales, sélecteur de localité
  pages/                         home, directory, profile, auth, pro, account, messages, admin, contact, legal
  styles/                        base.css, layout.css
public/                          _redirects, _headers (CSP), favicon, mascotte
supabase/migrations/             0001 schéma · 0002 RLS · 0003 fonctions · 0004 storage · 0005 données de référence · 0006 realtime + cron
workers/payments/                Worker Cloudflare (webhook paiements mobiles, squelette)
docs/                            SUPABASE.md, DEPLOIEMENT.md, ARCHITECTURE.md, ETAT-ET-LIMITES.md
tests/, scripts/check.mjs        tests et vérifications
```

## Fonctionnalités

- **Public** : accueil (mascotte, recherche, catégories, populaires, récents, appel aux prestataires), annuaire avec recherche par mot-clé, catégorie/sous-catégorie et localité en cascade (province → département → commune → arrondissement → ville → quartier), profils publics et pages entreprises, contact, pages légales.
- **Comptes** : inscription, connexion, déconnexion, mot de passe oublié/réinitialisation, rôles (particulier, professionnel, admin), pages privées protégées.
- **Professionnel** : tableau de bord et statistiques, fiche, prestations, galerie (validation des images), disponibilités, avis, abonnement et historique de paiements, messagerie.
- **Particulier** : favoris, profil, messagerie, avis éligibles, notifications.
- **Administrateur** : vue d'ensemble, utilisateurs, validation des fiches, catégories, localités, paiements, abonnements, signalements, modération des avis, publicités sponsorisées, messages de contact, journal d'audit, paramètres.
- **Messagerie privée temps réel** (Supabase Realtime) ; boutons WhatsApp, appel et message interne.
- **Abonnement** : 1 000 FCFA / 90 jours. La fiche n'est publique que si `status = approved` **et** `subscription_ends_at > now()` (appliqué par la RLS et la recherche, donc sans dépendre d'une tâche planifiée). Rappels et expirations via `expire_subscriptions()` (pg_cron).

## Ce qui est volontairement honnête

- **Aucun faux professionnel, faux avis ou fausses statistiques** : l'annuaire est vide tant que de vrais prestataires ne s'inscrivent pas, avec des états vides explicites.
- **Paiements** : seul un **mode TEST** clairement identifié (badge « TEST », aucun argent réel) est opérationnel. Airtel Money / Moov Money : architecture prête (table `payments`, fonctions `create_pending_payment` / `confirm_payment`, Worker avec signature HMAC) mais **non branchée** à un opérateur : voir `docs/ETAT-ET-LIMITES.md`.
- Voir **docs/ETAT-ET-LIMITES.md** pour la liste exacte de ce qui a été vérifié et de ce qui reste à faire de votre côté.

## Sécurité (résumé)

RLS sur toutes les tables · colonnes sensibles protégées par triggers (rôle, statut, abonnement) · rôle admin impossible à l'inscription · paiements et abonnements écrits uniquement par fonctions `security definer` · conversations visibles par leurs seuls participants (admins inclus exclus) · images validées par signature + limites serveur du bucket · échappement HTML systématique · CSP stricte (`public/_headers`) · redirections internes uniquement · journal d'audit des actions admin · clé `service_role` jamais dans le frontend.
