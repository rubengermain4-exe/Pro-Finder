import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

export const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);

// Seule la clé publique (anon) est utilisée ici. La sécurité repose sur la RLS.
export const supabase = isConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export function publicUrl(bucket, path) {
  if (!supabase || !path) return '';
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
