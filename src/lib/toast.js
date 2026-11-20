let host;
function ensureHost() {
  if (host && document.body.contains(host)) return host;
  host = document.createElement('div');
  host.className = 'toasts';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}

export function toast(message, type = 'info', duration = 4500) {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  ensureHost().appendChild(el);
  setTimeout(() => el.remove(), duration);
}
export const toastSuccess = (m) => toast(m, 'success');
export const toastError = (m) => toast(m, 'error', 7000);

/** Convertit une erreur Supabase/Postgres en message lisible pour l'utilisateur. */
export function friendlyError(err) {
  const msg = String(err?.message || err || '');
  const map = [
    [/Invalid login credentials/i, 'E-mail ou mot de passe incorrect.'],
    [/Email not confirmed/i, "Confirmez d'abord votre adresse e-mail (lien reçu par e-mail)."],
    [/User already registered/i, 'Un compte existe déjà avec cette adresse e-mail.'],
    [/Password should be at least/i, 'Mot de passe trop court.'],
    [/rate limit|too many/i, 'Trop de tentatives. Patientez quelques minutes.'],
    [/duplicate key.*slug/i, 'Ce nom est déjà utilisé, essayez une variante.'],
    [/duplicate key/i, 'Cet élément existe déjà.'],
    [/row-level security|permission denied|forbidden/i, "Vous n'avez pas les droits pour cette action."],
    [/gallery_limit_reached/, 'Limite de 12 images atteinte.'],
    [/services_limit_reached/, 'Limite de 30 prestations atteinte.'],
    [/test_mode_disabled/, "Le mode test est désactivé : le paiement réel n'est pas encore disponible."],
    [/business_unavailable/, "Ce professionnel n'est pas disponible actuellement."],
    [/self_conversation/, 'Vous ne pouvez pas vous écrire à vous-même.'],
    [/account_suspended/, 'Votre compte est suspendu.'],
    [/not_authenticated/, 'Connectez-vous pour continuer.'],
    [/Failed to fetch|NetworkError|network/i, 'Connexion impossible. Vérifiez votre accès Internet.'],
  ];
  for (const [re, text] of map) if (re.test(msg)) return text;
  return 'Une erreur est survenue. Réessayez dans un instant.';
}
