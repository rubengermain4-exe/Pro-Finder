# Architecture

## Principes
- **Frontend statique** (Vite, ES Modules, pas de framework) ; routage côté client par History API, pages chargées à la demande.
- **La sécurité vit en base** : RLS + contraintes + triggers + fonctions `security definer`. Le frontend n'est qu'un confort.
- **Rendu sûr** : `html\`\`` échappe toute valeur interpolée ; `raw()` réservé aux icônes internes.

## Modèle de données (principales relations)
`profiles` (1–1 avec `auth.users`) → `businesses` (1 par propriétaire) → `services`, `portfolio_images`, `payments` → `subscriptions` (met à jour `businesses.subscription_ends_at`).
`conversations` (business × client) → `conversation_participants`, `messages`. `reviews` (unique par client et fiche), `favorites`, `reports`, `notifications`, `advertisements`, `business_events` (statistiques), `admin_logs`, `contact_messages`, `app_settings`, `categories` et `locations` (hiérarchies auto-référencées).

## Visibilité d'une fiche
`status = 'approved' AND subscription_ends_at > now()` — appliqué par la politique RLS `businesses_read` et par `search_businesses`.

## Flux paiement
Mode **test** : `start_test_payment()` (refusée si `payment_mode ≠ 'test'`) → `payments(provider='test')` → `apply_paid_payment()` → `subscriptions`.
Mode **réel (futur)** : `create_pending_payment()` → opérateur → webhook Worker (HMAC) → `confirm_payment()` (service_role uniquement) → `apply_paid_payment()` (idempotent).

## Messagerie
`start_conversation()` crée/relie la conversation et le premier message ; les messages suivants sont insérés par le client sous RLS ; Realtime diffuse les `INSERT` (filtrés par RLS). Aucun accès administrateur aux conversations.

## Avis
Éligibilité (`can_review`) : le client a écrit **et** le professionnel a répondu dans une conversation. L'auteur est affiché « Prénom N. ».
