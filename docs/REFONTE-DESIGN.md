# Pro Finder — refonte visuelle

Cette refonte modernise l'identité visuelle de l'application sans modifier les services métier ni les flux d'authentification.

## Direction artistique
- Bleu nuit : `#0B1640`
- Blanc : `#FFFFFF`
- Vert menthe : `#3DDC97`
- Interface claire, surfaces arrondies, contrastes renforcés et responsive.

## Fichiers principaux modifiés
- `src/pages/home.js` : nouveau contenu et nouvelle composition du hero, suppression de la mascotte panthère.
- `src/components/shell.js` : marque Pro Finder harmonisée dans l'en-tête et le pied de page.
- `src/styles/refonte.css` : couche de styles globale pour l'ensemble des pages et composants.
- `src/styles/main.css` : chargement de la nouvelle couche de design.
- `public/assets/profinder-professional.png` : visuel du professionnel pour le hero.
- `public/assets/profinder-mark.svg` et `public/favicon.svg` : nouveau symbole de marque.
- `public/manifest.webmanifest` : couleurs de l'application installable.

## Préserver la configuration
Le fichier `.env` n'est pas inclus. Conserver les variables Supabase et les paramètres de déploiement de l'installation existante.
