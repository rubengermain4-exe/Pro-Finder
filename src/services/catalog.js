import { supabase, publicUrl } from '../lib/supabase.js';
import { config } from '../config.js';

let categoriesCache = null;
let locationsCache = null;
let settingsCache = null;

const must = ({ data, error }) => { if (error) throw error; return data; };

export async function getSettings() {
  if (settingsCache) return settingsCache;
  try {
    const data = must(await supabase.rpc('public_settings'));
    settingsCache = { ...config.defaultPlan, ...data };
  } catch {
    settingsCache = { ...config.defaultPlan };
  }
  return settingsCache;
}

export async function getCategories() {
  if (!categoriesCache) {
    categoriesCache = must(await supabase.from('categories').select('*').eq('is_active', true).order('sort_order').order('name'));
  }
  return categoriesCache;
}
export const resetCategories = () => { categoriesCache = null; };

export async function getLocations() {
  if (!locationsCache) {
    locationsCache = must(await supabase.from('locations').select('id,parent_id,level,name,slug').eq('is_active', true).order('name').limit(5000));
  }
  return locationsCache;
}
export const resetLocations = () => { locationsCache = null; };

export const LEVEL_LABELS = {
  province: 'Province', departement: 'Département', commune: 'Commune',
  arrondissement: 'Arrondissement', ville: 'Ville', quartier: 'Quartier',
};

/** Chaîne d'ancêtres (racine -> feuille) d'une localité. */
export function locationChain(locations, id) {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const chain = [];
  let cur = byId.get(id);
  while (cur) { chain.unshift(cur); cur = cur.parent_id ? byId.get(cur.parent_id) : null; }
  return chain;
}

export function childrenOf(list, parentId) {
  return list.filter((x) => (x.parent_id || null) === (parentId || null));
}

export async function searchBusinesses({ q = '', category = '', location = '', kind = '', sort = 'relevance', page = 1, limit = config.pageSize } = {}) {
  const rows = must(await supabase.rpc('search_businesses', {
    p_q: q || null,
    p_category: category || null,
    p_location: location || null,
    p_kind: kind || null,
    p_sort: sort,
    p_limit: limit,
    p_offset: (Math.max(page, 1) - 1) * limit,
  }));
  return { rows, total: rows[0]?.total_count ? Number(rows[0].total_count) : 0 };
}

export async function getBusinessBySlug(slug) {
  const { data, error } = await supabase
    .from('businesses')
    .select('*, category:categories(id,name,slug,is_sensitive), location:locations(id,name,level,parent:locations(name))')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getBusinessExtras(businessId) {
  const [services, images, reviews, stats] = await Promise.all([
    supabase.from('services').select('*').eq('business_id', businessId).order('sort_order').order('created_at'),
    supabase.from('portfolio_images').select('*').eq('business_id', businessId).order('sort_order').order('created_at'),
    supabase.rpc('business_reviews', { p_business: businessId }),
    supabase.from('business_rating_stats').select('*').eq('business_id', businessId).maybeSingle(),
  ]);
  return {
    services: must(services),
    images: must(images).map((i) => ({ ...i, url: publicUrl('business-media', i.path) })),
    reviews: must(reviews),
    stats: stats.data || { avg_rating: null, review_count: 0 },
  };
}

export function trackEvent(businessId, type) {
  // Statistiques : on n'interrompt jamais l'utilisateur en cas d'échec.
  supabase.rpc('track_event', { p_business: businessId, p_type: type }).then(() => {}, () => {});
}

export async function getAds(placement) {
  const { data } = await supabase.from('advertisements').select('*').eq('placement', placement).eq('is_active', true).limit(3);
  return (data || []).filter((a) => (!a.starts_at || new Date(a.starts_at) <= new Date()) && (!a.ends_at || new Date(a.ends_at) > new Date()));
}

export async function sendContactMessage(values) {
  must(await supabase.from('contact_messages').insert({
    name: values.name, email: values.email, subject: values.subject, body: values.body,
  }));
}
