# Vitrines professionnelles personnalisables

Cette évolution ajoute une vitrine publique personnalisable à chaque fiche Pro Finder, sans remplacer les fonctionnalités existantes.

## Fonctionnalités

- Couverture téléversable (JPG, PNG, WebP, 2 Mo maximum).
- Logo/photo de profil conservé et téléversable séparément.
- Deux couleurs de marque personnalisables (valeurs hexadécimales contrôlées).
- Liens Facebook, Instagram, TikTok, LinkedIn et YouTube.
- Galerie de 10 images maximum, avec une image principale sélectionnable.
- Catalogue mixte : prestations de service et produits.
- Prix facultatifs ; l'affichage public utilise « Sur devis » en l'absence de prix.
- Présentation, coordonnées, disponibilité et avis clients conservés.
- Les avis restent gérés par le système d'avis existant ; le professionnel ne peut pas modifier les notes ni les commentaires.

## Déploiement obligatoire

1. Faire une sauvegarde de la base Supabase.
2. Dans Supabase > SQL Editor, exécuter le contenu de `supabase/migrations/0007_business_showcase.sql`.
3. Déployer le code de cette archive.
4. Conserver le fichier `.env` existant (il n'est pas inclus dans l'archive).
5. Se connecter avec un compte professionnel, ouvrir **Espace pro > Personnaliser ma vitrine**, puis ajouter la couverture, les couleurs et les liens sociaux.
6. Ouvrir **Galerie** pour ajouter jusqu'à 10 photos et sélectionner l'image principale.
7. Ouvrir **Prestations & produits** pour créer les éléments du catalogue. Les prix sont facultatifs.

## Compatibilité et sécurité

La migration est additive : les colonnes ajoutées ont des valeurs par défaut pour les fiches déjà présentes. Les politiques RLS existantes continuent de limiter les modifications au propriétaire de la fiche ou à l'administrateur. Le stockage réutilise le bucket `business-media` et ses limites actuelles.

La visibilité publique reste soumise aux règles existantes : fiche approuvée et abonnement actif. Les couleurs sont validées côté client et par contraintes SQL ; les liens sociaux sont filtrés en HTTP/HTTPS à l'affichage. La base impose également une seule image principale et un maximum de 10 images par galerie. Lors de la migration, la première image de chaque galerie existante est sélectionnée automatiquement comme image principale.

## Limites actuelles

- Les cartes catalogue réutilisent la table `services` avec un champ `item_type` (`service` ou `product`).
- Les images de galerie sont globales à la vitrine ; elles ne sont pas attachées à un produit individuel.
- L'éditeur propose un modèle de vitrine unique avec couleurs personnalisées, pas encore plusieurs mises en page sélectionnables.
