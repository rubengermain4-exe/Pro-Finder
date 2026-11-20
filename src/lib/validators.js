// Validation côté client (confort). La sécurité réelle est appliquée par les contraintes SQL et la RLS.
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE = /^[0-9+() .-]{6,30}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DAYS = [
  ['mon', 'Lundi'], ['tue', 'Mardi'], ['wed', 'Mercredi'], ['thu', 'Jeudi'],
  ['fri', 'Vendredi'], ['sat', 'Samedi'], ['sun', 'Dimanche'],
];

export const isEmail = (v) => typeof v === 'string' && v.length <= 254 && EMAIL.test(v.trim());
export const isPhone = (v) => typeof v === 'string' && PHONE.test(v.trim());
export const isHttpUrl = (v) => {
  try { const u = new URL(v); return (u.protocol === 'https:' || u.protocol === 'http:') && v.length <= 250; } catch { return false; }
};

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Le mot de passe doit contenir au moins une lettre et un chiffre.';
  return '';
}

const len = (v, min, max) => { const n = String(v ?? '').trim().length; return n >= min && n <= max; };

export function validateSignup({ fullName, email, phone, password, role, acceptTerms }) {
  const e = {};
  if (!len(fullName, 2, 120)) e.fullName = 'Indiquez votre nom (2 caractères minimum).';
  if (!isEmail(email)) e.email = 'Adresse e-mail invalide.';
  if (phone && !isPhone(phone)) e.phone = 'Numéro de téléphone invalide.';
  const pw = validatePassword(password);
  if (pw) e.password = pw;
  if (!['particulier', 'professionnel'].includes(role)) e.role = 'Choisissez un type de compte.';
  if (!acceptTerms) e.acceptTerms = "Vous devez accepter les conditions d'utilisation.";
  return e;
}

export function validateBusiness(v) {
  const e = {};
  if (!len(v.name, 2, 120)) e.name = 'Le nom doit contenir entre 2 et 120 caractères.';
  if (!['independant', 'entreprise'].includes(v.kind)) e.kind = 'Type invalide.';
  if (!v.category_id) e.category_id = 'Choisissez une catégorie.';
  if (!v.location_id) e.location_id = 'Choisissez au moins une province.';
  if (v.tagline && !len(v.tagline, 0, 140)) e.tagline = '140 caractères maximum.';
  if (!len(v.description, 20, 3000)) e.description = 'Décrivez votre activité (20 caractères minimum).';
  if (!v.phone && !v.whatsapp) e.phone = 'Indiquez au moins un téléphone ou un numéro WhatsApp.';
  if (v.phone && !isPhone(v.phone)) e.phone = 'Numéro de téléphone invalide.';
  if (v.whatsapp && !isPhone(v.whatsapp)) e.whatsapp = 'Numéro WhatsApp invalide.';
  if (v.email && !isEmail(v.email)) e.email = 'Adresse e-mail invalide.';
  if (v.website && !isHttpUrl(v.website)) e.website = "L'adresse doit commencer par http:// ou https://";
  if (v.address && !len(v.address, 0, 250)) e.address = '250 caractères maximum.';
  return e;
}

export function validateService(v) {
  const e = {};
  if (!len(v.title, 2, 120)) e.title = 'Intitulé requis (2 à 120 caractères).';
  const from = v.price_from === '' || v.price_from == null ? null : Number(v.price_from);
  const to = v.price_to === '' || v.price_to == null ? null : Number(v.price_to);
  if (from !== null && (!Number.isInteger(from) || from < 0)) e.price_from = 'Prix invalide.';
  if (to !== null && (!Number.isInteger(to) || to < 0)) e.price_to = 'Prix invalide.';
  if (from !== null && to !== null && !e.price_from && !e.price_to && to < from) e.price_to = 'Doit être supérieur au prix minimum.';
  if (v.description && !len(v.description, 0, 600)) e.description = '600 caractères maximum.';
  return e;
}

export function validateAvailability(av) {
  const e = {};
  for (const [key, label] of DAYS) {
    const d = av[key];
    if (!d || !d.open) continue;
    if (!TIME.test(d.from || '') || !TIME.test(d.to || '')) e[key] = `${label} : horaires invalides.`;
    else if (d.from >= d.to) e[key] = `${label} : l'heure de fin doit suivre l'heure de début.`;
  }
  if (av.note && String(av.note).length > 200) e.note = 'Note : 200 caractères maximum.';
  return e;
}

export function validateContact({ name, email, subject, body }) {
  const e = {};
  if (!len(name, 2, 120)) e.name = 'Indiquez votre nom.';
  if (!isEmail(email)) e.email = 'Adresse e-mail invalide.';
  if (!len(subject, 2, 150)) e.subject = 'Indiquez un objet.';
  if (!len(body, 10, 3000)) e.body = 'Votre message doit contenir entre 10 et 3000 caractères.';
  return e;
}

export function validateMessage(text) {
  const n = String(text ?? '').trim().length;
  if (n < 1) return 'Écrivez un message.';
  if (n > 2000) return '2000 caractères maximum.';
  return '';
}

export function validateReview({ rating, comment }) {
  const e = {};
  if (!Number.isInteger(Number(rating)) || rating < 1 || rating > 5) e.rating = 'Choisissez une note de 1 à 5.';
  if (comment && String(comment).length > 1000) e.comment = '1000 caractères maximum.';
  return e;
}
