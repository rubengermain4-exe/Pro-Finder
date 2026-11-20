import { supabase } from '../lib/supabase.js';
import { slugify } from '../lib/format.js';

const must = ({ data, error }) => { if (error) throw error; return data; };

export async function overview() { return must(await supabase.rpc('admin_overview')); }

export async function listUsers({ search = '', page = 1, limit = 25 } = {}) {
  const rows = must(await supabase.rpc('admin_list_users', { p_search: search || null, p_limit: limit, p_offset: (page - 1) * limit }));
  return { rows, total: rows[0]?.total_count ? Number(rows[0].total_count) : 0 };
}
export async function setUserSuspended(id, suspended) { must(await supabase.from('profiles').update({ is_suspended: suspended }).eq('id', id)); }

export async function listBusinesses(status = '') {
  let q = supabase.from('businesses').select('id,slug,name,kind,status,rejection_reason,subscription_ends_at,created_at,owner_id,category:categories(name),location:locations(name)').order('created_at', { ascending: false }).limit(200);
  if (status) q = q.eq('status', status);
  return must(await q);
}
export async function setBusinessStatus(id, status, reason = null) {
  must(await supabase.from('businesses').update({ status, rejection_reason: status === 'rejected' || status === 'suspended' ? reason : null }).eq('id', id));
}
export async function grantSubscription(businessId, days, reason) {
  must(await supabase.rpc('admin_grant_subscription', { p_business: businessId, p_days: days, p_reason: reason }));
}

// Catégories
export async function listAllCategories() { return must(await supabase.from('categories').select('*').order('sort_order').order('name')); }
export async function saveCategory(v, id = null) {
  const row = { name: v.name, slug: slugify(v.slug || v.name), icon: v.icon || 'tool', parent_id: v.parent_id || null, is_sensitive: Boolean(v.is_sensitive), sort_order: Number(v.sort_order || 100), is_active: v.is_active !== false };
  if (id) must(await supabase.from('categories').update(row).eq('id', id)); else must(await supabase.from('categories').insert(row));
}
export async function deleteCategory(id) { must(await supabase.from('categories').delete().eq('id', id)); }

// Localités
export async function listAllLocations() { return must(await supabase.from('locations').select('*').order('name').limit(5000)); }
export async function saveLocation(v, id = null) {
  const row = { name: v.name, slug: slugify(v.name), level: v.level, parent_id: v.parent_id || null, is_active: v.is_active !== false };
  if (id) must(await supabase.from('locations').update(row).eq('id', id)); else must(await supabase.from('locations').insert(row));
}
export async function deleteLocation(id) { must(await supabase.from('locations').delete().eq('id', id)); }

// Paiements / abonnements
export async function listPayments() { return must(await supabase.from('payments').select('*, business:businesses(name,slug)').order('created_at', { ascending: false }).limit(200)); }
export async function listSubscriptions() { return must(await supabase.from('subscriptions').select('*, business:businesses(name,slug)').order('ends_at', { ascending: false }).limit(200)); }
export async function cancelSubscription(id) { must(await supabase.from('subscriptions').update({ status: 'cancelled' }).eq('id', id)); }

// Signalements / avis / modération
export async function listReports(status = '') {
  let q = supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(200);
  if (status) q = q.eq('status', status);
  return must(await q);
}
export async function updateReport(id, status, note, adminId) {
  must(await supabase.from('reports').update({ status, resolution_note: note || null, handled_by: adminId }).eq('id', id));
}
export async function listReviews() { return must(await supabase.from('reviews').select('*, business:businesses(name,slug)').order('created_at', { ascending: false }).limit(200)); }
export async function setReviewStatus(id, status) { must(await supabase.from('reviews').update({ status }).eq('id', id)); }

// Publicités
export async function listAds() { return must(await supabase.from('advertisements').select('*').order('created_at', { ascending: false })); }
export async function saveAd(v, adminId, id = null) {
  const row = { title: v.title, advertiser: v.advertiser || null, image_url: v.image_url, link_url: v.link_url, placement: v.placement, starts_at: v.starts_at || null, ends_at: v.ends_at || null, is_active: Boolean(v.is_active) };
  if (id) must(await supabase.from('advertisements').update(row).eq('id', id));
  else must(await supabase.from('advertisements').insert({ ...row, created_by: adminId }));
}
export async function deleteAd(id) { must(await supabase.from('advertisements').delete().eq('id', id)); }

// Journal, contacts, paramètres
export async function listLogs() { return must(await supabase.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(200)); }
export async function listContacts() { return must(await supabase.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(200)); }
export async function setContactHandled(id, handled) { must(await supabase.from('contact_messages').update({ is_handled: handled }).eq('id', id)); }
export async function getAllSettings() { return must(await supabase.from('app_settings').select('*')); }
export async function setSetting(key, value) { must(await supabase.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() })); }
