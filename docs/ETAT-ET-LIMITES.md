# État du projet, tests et limites

## Ce qui a été vérifié (dans l'environnement de création)
- Syntaxe de tous les fichiers JS (`node --check`), cohérence de tous les imports/exports, routes → pages, présence des RPC appelées dans le SQL (`npm run check`).
- 12 tests unitaires (échappement XSS, validations, routeur et gardes, redirections sûres, détection d'images, formats FCFA/téléphone) : `npm test`.
- Rendu réel dans Chromium (bureau 1280 px et mobile 390 px) de l'accueil, de l'annuaire, d'un profil et de l'inscription avec un **faux client Supabase** (données fictives de test, non livrées) : aucune erreur JavaScript, aucune injection HTML.
- Équilibrage syntaxique des migrations SQL, présence des 17 tables obligatoires et de la RLS.

## Ce qui N'A PAS pu être vérifié ici (à faire de votre côté)
- **`npm install` / `npm run build`** : l'environnement de création n'avait pas d'accès réseau, Vite n'a donc pas pu être installé ni lancé. Le build est standard (Vite sans plugin) mais doit être confirmé par vous : `npm run verify`.
- **Exécution des migrations SQL** sur un vrai PostgreSQL/Supabase : aucune base n'était disponible. Elles ont été relues avec soin mais peuvent contenir une erreur de syntaxe à corriger.
- **Parcours bout en bout avec Supabase** (inscription, Realtime, storage, RLS en conditions réelles) et rendu visuel de l'interface complète : à tester sur un projet Supabase de test.
- Les e-mails d'authentification (SMTP), pg_cron, le déploiement Cloudflare.

## Configurations externes encore nécessaires
1. Projet Supabase + clés dans `.env` / variables Cloudflare.
2. Exécution des migrations, création du premier admin.
3. SMTP pour les e-mails (production).
4. Compte Cloudflare + dépôt GitHub.
5. Informations légales de l'entreprise (`VITE_COMPANY_LEGAL_INFO`) et relecture juridique des pages légales.
6. Contrat marchand Airtel Money / Moov Money + adaptation de `parsePayload()` dans le Worker avant de passer en mode réel.
7. Compléter les localités (départements, communes, quartiers) depuis l'admin.
8. Remplacer l'illustration de la mascotte (`public/assets/mascot.svg`, dessin vectoriel de base) par l'œuvre finale d'un illustrateur si souhaité.

## Limites connues de la v1
- Une fiche par compte professionnel.
- Pas de réponse publique du professionnel aux avis ; pas de pièces jointes dans la messagerie.
- Pas d'anti-spam avancé (limitation de débit) sur la page contact : piège anti-robots uniquement ; ajouter Cloudflare Turnstile recommandé.
- Statistiques simples (vues, clics WhatsApp/appel, conversations, favoris).
- Pas d'application mobile native (site responsive).
