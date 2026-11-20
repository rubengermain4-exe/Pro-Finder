// Configuration publique (variables VITE_*). Aucune clé secrète ne doit jamais figurer ici.
const env = import.meta.env || {};

export const config = {
  supabaseUrl: env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || '',
  appUrl: (env.VITE_APP_URL || '').replace(/\/$/, ''),
  countryCode: env.VITE_WHATSAPP_COUNTRY_CODE || '241',
  companyName: env.VITE_COMPANY_NAME || 'Pro Finder',
  companyLegalInfo: env.VITE_COMPANY_LEGAL_INFO || 'À compléter (forme juridique, RCCM, adresse du siège)',
  contactEmail: env.VITE_CONTACT_EMAIL || '',
  contactPhone: env.VITE_CONTACT_PHONE || '',
  slogan: 'Le bon professionnel, au bon endroit.',
  // Valeurs d'affichage par défaut : la source de vérité est la table app_settings (public_settings()).
  defaultPlan: { price: 1000, days: 90, payment_mode: 'test' },
  pageSize: 12,
  maxImageBytes: 2 * 1024 * 1024,
};
