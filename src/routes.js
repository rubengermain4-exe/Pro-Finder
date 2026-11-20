// Table des routes. Les pages sont chargées à la demande (code splitting).
export const routes = [
  { path: '/', title: 'Accueil', load: () => import('./pages/home.js') },
  { path: '/annuaire', title: 'Annuaire des professionnels', load: () => import('./pages/directory.js') },
  { path: '/pro/:slug', title: 'Profil professionnel', load: () => import('./pages/profile.js') },
  { path: '/entreprise/:slug', title: 'Entreprise', load: () => import('./pages/profile.js') },
  { path: '/contact', title: 'Contact', load: () => import('./pages/contact.js') },
  { path: '/mentions-legales', title: 'Mentions légales', doc: 'mentions', load: () => import('./pages/legal.js') },
  { path: '/conditions-utilisation', title: "Conditions d'utilisation", doc: 'cgu', load: () => import('./pages/legal.js') },
  { path: '/confidentialite', title: 'Politique de confidentialité', doc: 'privacy', load: () => import('./pages/legal.js') },

  { path: '/connexion', title: 'Connexion', mode: 'login', load: () => import('./pages/auth.js') },
  { path: '/inscription', title: 'Inscription', mode: 'signup', load: () => import('./pages/auth.js') },
  { path: '/mot-de-passe-oublie', title: 'Mot de passe oublié', mode: 'forgot', load: () => import('./pages/auth.js') },
  { path: '/reinitialiser-mot-de-passe', title: 'Nouveau mot de passe', mode: 'reset', load: () => import('./pages/auth.js') },

  { path: '/messages/nouveau/:businessId', title: 'Nouveau message', guard: {}, load: () => import('./pages/messages.js') },
  { path: '/messages/:id?', title: 'Messagerie', guard: {}, load: () => import('./pages/messages.js') },
  { path: '/compte/:section?', title: 'Mon compte', guard: {}, load: () => import('./pages/account.js') },
  { path: '/espace-pro/:section?', title: 'Espace professionnel', guard: { roles: ['professionnel'] }, load: () => import('./pages/pro.js') },
  { path: '/admin/:section?', title: 'Administration', guard: { roles: ['admin'] }, load: () => import('./pages/admin.js') },
];
