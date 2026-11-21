# Améliorations v1.1

Toutes les évolutions sont côté interface : **aucune migration SQL à rejouer**, aucune nouvelle dépendance.

## Nouvelles fonctionnalités
| Fonction | Où | Intérêt |
|---|---|---|
| Statut « Ouvert · jusqu'à 17:00 » / « Fermé · ouvre demain à 08:00 » | Fiche pro | Le client sait tout de suite s'il peut appeler. Calcul à l'heure du Gabon (UTC+1) quel que soit le fuseau du visiteur. |
| Bouton Partager (partage natif mobile, sinon copie du lien) | Fiche pro | Le bouche-à-oreille est le premier canal de recommandation au Gabon. |
| Filtres actifs sous forme de pastilles retirables + « Tout effacer » | Annuaire | On voit et on corrige sa recherche en un clic ; le reset ne recharge plus la page. |
| « Consultés récemment » (stocké sur l'appareil, effaçable) | Accueil | Retrouver un pro vu la veille sans refaire la recherche. |
| Foire aux questions (clients et pros) | Accueil | Lève les objections avant l'inscription ; balisée pour Google (FAQPage). |
| Bouton « Remonter en haut » | Toutes pages | Confort sur les longues listes. |
| Manifeste PWA | Mobile | « Ajouter à l'écran d'accueil » avec icône et couleur de marque. |

## Référencement et partage
- Titre, description, URL canonique et Open Graph propres à chaque fiche ; réinitialisés à chaque changement de page (`src/lib/seo.js`).
- Données structurées schema.org `LocalBusiness` (adresse, téléphone, horaires, note moyenne) sur chaque fiche publique.
- `robots.txt` : les espaces privés (admin, messagerie, compte, espace pro) ne sont pas indexés.

## Design
Fichier `src/styles/polish.css` : survol des cartes, états de focus plus nets, hero mobile, pastilles de statut, impression d'une fiche.

## Tests
5 tests ajoutés (statut ouvert/fermé et fuseau, historique local, données corrompues, neutralisation XSS du JSON-LD) : 17 au total.

## Pistes pour la suite (non faites, volontairement)
1. **Sitemap dynamique** : une fonction Cloudflare qui liste les fiches approuvées (`/sitemap.xml`). Nécessite vos clés en production.
2. **Prérendu des fiches** (Cloudflare Worker ou prerender) : les robots qui n'exécutent pas JavaScript (aperçus WhatsApp/Facebook) ne lisent pas les balises Open Graph posées côté navigateur. C'est la limite d'une SPA ; ce point est le gain n°1 pour le partage WhatsApp.
3. **Cloudflare Turnstile** sur le formulaire de contact (anti-spam).
4. **Réponse publique du pro aux avis** et **photos dans la messagerie**.
5. **Demande de devis** multi-pros (un client décrit son besoin, 3 pros reçoivent la demande).
6. Auto-héberger la police Sora (RGPD, performance) au lieu de Google Fonts.
