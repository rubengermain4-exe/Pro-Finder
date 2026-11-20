import { supabase } from '../lib/supabase.js';
import { getAuth } from '../state/auth.js';
import { publicUrl } from '../lib/supabase.js';
import { validateImageFile } from '../lib/image.js';

const must = ({ data, error }) => { if (error) throw error; return data; };
const uid = () => getAuth().user.id;

// --- Favoris ---
export async function isFavorite(businessId) {
  if (!getAuth().user) return false;
  const { data } = await supabase.from('favorites').select('business_id').eq('user_id', uid()).eq('business_id', businessId).maybeSingle();
  return Boolean(data);
}
export async function setFavorite(businessId, on) {
  if (on) must(await supabase.from('favorites').upsert({ user_id: uid(), business_id: businessId }));
  else must(await supabase.from('favorites').delete().eq('user_id', uid()).eq('business_id', businessId));
}
export async function listFavorites() {
  const rows = must(await supabase
    .from('favorites')
    .select('created_at, business:businesses(id,slug,name,kind,tagline,logo_path,category:categories(name),location:locations(name))')
    .eq('user_id', uid())
    .order('created_at', { ascending: false }));
  return rows.map((r) => r.business).filter(Boolean);
}

// --- Avis ---
export async function listEligibleReviews() { return must(await supabase.rpc('eligible_reviews')); }
export async function submitReview({ businessId, rating, comment }) {
  must(await supabase.from('reviews').insert({ business_id: businessId, author_id: uid(), rating: Number(rating), comment: comment || null }));
}
export async function listMyReviews() {
  return must(await supabase.from('reviews').select('id,rating,comment,status,created_at,business:businesses(name,slug)').eq('author_id', uid()).order('created_at', { ascending: false }));
}
export async function deleteReview(id) { must(await supabase.from('reviews').delete().eq('id', id)); }

// --- Signalement ---
export async function reportTarget({ targetType, targetId, reason, details }) {
  must(await supabase.from('reports').insert({ reporter_id: uid(), target_type: targetType, target_id: targetId, reason, details: details || null }));
}

// --- Notifications ---
export async function listNotifications() {
  return must(await supabase.from('notifications').select('*').eq('user_id', uid()).order('created_at', { ascending: false }).limit(30));
}
export async function markNotificationsRead() {
  must(await supabase.from('notifications').update({ is_read: true }).eq('user_id', uid()).eq('is_read', false));
}

// --- Avatar ---
export async function uploadAvatar(file) {
  const check = await validateImageFile(file);
  if (!check.ok) throw new Error(check.error);
  const path = `${uid()}/avatar-${Date.now()}.${check.ext}`;
  must(await supabase.storage.from('avatars').upload(path, file, { contentType: check.type, upsert: false }));
  must(await supabase.from('profiles').update({ avatar_path: path }).eq('id', uid()));
  return publicUrl('avatars', path);
}

export async function unreadNotifications() {
  if (!getAuth().user) return 0;
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', uid()).eq('is_read', false);
  return count || 0;
}
