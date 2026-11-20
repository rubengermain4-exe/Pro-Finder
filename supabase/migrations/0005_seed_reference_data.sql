-- =====================================================================
-- PRO FINDER - 0005 : donnees de reference (categories + localites)
-- Ce sont des donnees de structure, PAS de faux professionnels ni de faux avis.
-- Les departements, communes et quartiers sont a completer depuis
-- l'espace administrateur (Admin > Localites).
-- =====================================================================

-- Categories principales
insert into public.categories (name, slug, icon, sort_order, is_sensitive) values
  ('Bâtiment et travaux',        'batiment',        'hammer',    10, false),
  ('Froid et climatisation',     'froid-clim',      'snowflake', 20, false),
  ('Automobile et mécanique',    'automobile',      'car',       30, false),
  ('Maison et famille',          'maison-famille',  'home',      40, false),
  ('Beauté et bien-être',        'beaute',          'scissors',  50, false),
  ('Informatique et téléphonie', 'informatique',    'laptop',    60, false),
  ('Éducation et formation',     'education',       'book',      70, false),
  ('Santé à domicile',           'sante',           'heart',     80, true),
  ('Juridique et administratif', 'juridique',       'scale',     90, true),
  ('Sécurité',                   'securite',        'shield',   100, true),
  ('Événements et restauration', 'evenements',      'utensils', 110, false),
  ('Transport et livraison',     'transport',       'truck',    120, false)
on conflict (slug) do nothing;

-- Sous-categories : (parent, nom, slug, icone, sensible)
insert into public.categories (parent_id, name, slug, icon, is_sensitive, sort_order)
select p.id, v.name, v.slug, v.icon, v.sensitive, v.ord
from (values
  ('batiment','Plomberie','plomberie','wrench',false,10),
  ('batiment','Électricité bâtiment','electricite-batiment','zap',false,20),
  ('batiment','Maçonnerie','maconnerie','hammer',false,30),
  ('batiment','Peinture','peinture','paintbrush',false,40),
  ('batiment','Menuiserie','menuiserie','hammer',false,50),
  ('batiment','Carrelage','carrelage','hammer',false,60),
  ('batiment','Soudure et ferronnerie','soudure','zap',false,70),
  ('froid-clim','Installation de climatiseurs','installation-clim','snowflake',false,10),
  ('froid-clim','Réparation de climatiseurs','reparation-clim','snowflake',false,20),
  ('froid-clim','Réfrigération (frigoriste)','frigoriste','snowflake',false,30),
  ('automobile','Mécanique auto','mecanique-auto','car',false,10),
  ('automobile','Électricité auto','electricite-auto','zap',false,20),
  ('automobile','Carrosserie','carrosserie','car',false,30),
  ('automobile','Dépannage et remorquage','depannage-auto','truck',false,40),
  ('maison-famille','Nounou et garde d''enfants','nounou','baby',true,10),
  ('maison-famille','Ménage et nettoyage','menage','spray',false,20),
  ('maison-famille','Jardinage','jardinage','leaf',false,30),
  ('maison-famille','Déménagement','demenagement','truck',false,40),
  ('beaute','Coiffure','coiffure','scissors',false,10),
  ('beaute','Esthétique et maquillage','esthetique','heart',false,20),
  ('informatique','Dépannage informatique','depannage-informatique','laptop',false,10),
  ('informatique','Réparation de téléphones','reparation-telephone','laptop',false,20),
  ('informatique','Création de sites et applications','developpement-web','laptop',false,30),
  ('informatique','Vidéosurveillance et réseaux','videosurveillance','shield',false,40),
  ('education','Cours particuliers','cours-particuliers','book',false,10),
  ('education','Formation professionnelle','formation','book',false,20),
  ('sante','Infirmier à domicile','infirmier','heart',true,10),
  ('sante','Kinésithérapie','kinesitherapie','heart',true,20),
  ('juridique','Conseil juridique','conseil-juridique','scale',true,10),
  ('juridique','Comptabilité et fiscalité','comptabilite','scale',true,20),
  ('securite','Gardiennage','gardiennage','shield',true,10),
  ('evenements','Traiteur et cuisine','traiteur','utensils',false,10),
  ('evenements','Photographie et vidéo','photo-video','camera',false,20),
  ('transport','Chauffeur privé','chauffeur','car',false,10),
  ('transport','Livraison et coursier','livraison','truck',false,20)
) as v(parent_slug, name, slug, icon, sensitive, ord)
join public.categories p on p.slug = v.parent_slug
on conflict (slug) do nothing;

-- Provinces du Gabon (9)
insert into public.locations (parent_id, level, name, slug) values
  (null, 'province', 'Estuaire',         'estuaire'),
  (null, 'province', 'Haut-Ogooué',      'haut-ogooue'),
  (null, 'province', 'Moyen-Ogooué',     'moyen-ogooue'),
  (null, 'province', 'Ngounié',          'ngounie'),
  (null, 'province', 'Nyanga',           'nyanga'),
  (null, 'province', 'Ogooué-Ivindo',    'ogooue-ivindo'),
  (null, 'province', 'Ogooué-Lolo',      'ogooue-lolo'),
  (null, 'province', 'Ogooué-Maritime',  'ogooue-maritime'),
  (null, 'province', 'Woleu-Ntem',       'woleu-ntem')
on conflict do nothing;

-- Chefs-lieux de province (villes) + communes de l'agglomeration de Libreville
insert into public.locations (parent_id, level, name, slug)
select p.id, v.level, v.name, v.slug
from (values
  ('estuaire','ville','Libreville','libreville'),
  ('estuaire','commune','Owendo','owendo'),
  ('estuaire','commune','Akanda','akanda'),
  ('haut-ogooue','ville','Franceville','franceville'),
  ('moyen-ogooue','ville','Lambaréné','lambarene'),
  ('ngounie','ville','Mouila','mouila'),
  ('nyanga','ville','Tchibanga','tchibanga'),
  ('ogooue-ivindo','ville','Makokou','makokou'),
  ('ogooue-lolo','ville','Koulamoutou','koulamoutou'),
  ('ogooue-maritime','ville','Port-Gentil','port-gentil'),
  ('woleu-ntem','ville','Oyem','oyem')
) as v(parent_slug, level, name, slug)
join public.locations p on p.slug = v.parent_slug and p.level = 'province'
on conflict do nothing;

-- Arrondissements de Libreville (6)
insert into public.locations (parent_id, level, name, slug)
select l.id, 'arrondissement', v.name, v.slug
from (values
  ('Libreville 1er arrondissement','libreville-1'),
  ('Libreville 2e arrondissement','libreville-2'),
  ('Libreville 3e arrondissement','libreville-3'),
  ('Libreville 4e arrondissement','libreville-4'),
  ('Libreville 5e arrondissement','libreville-5'),
  ('Libreville 6e arrondissement','libreville-6')
) as v(name, slug)
join public.locations l on l.slug = 'libreville' and l.level = 'ville'
on conflict do nothing;
