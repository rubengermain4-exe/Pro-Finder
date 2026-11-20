import { supabase } from '../lib/supabase.js';
import { config } from '../config.js';

const state = { ready: false, user: null, profile: null };
const listeners = new Set();

export const getAuth = () => state;
export const isAdmin = () => state.profile?.role === 'admin';

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn(state));

async function loadProfile(user) {
  if (!user) { state.user = null; state.profile = null; return; }
  state.user = user;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  state.profile = data || null;
}

export async function initAuth() {
  if (!supabase) { state.ready = true; return; }
  const { data } = await supabase.auth.getSession();
  await loadProfile(data.session?.user ?? null);
  state.ready = true;
  emit();
  supabase.auth.onAuthStateChange((event, session) => {
    // Ne pas appeler Supabase directement dans ce callback : on diffère.
    setTimeout(async () => {
      await loadProfile(session?.user ?? null);
      emit();
      if (event === 'PASSWORD_RECOVERY') window.dispatchEvent(new CustomEvent('pf:navigate', { detail: '/reinitialiser-mot-de-passe' }));
    }, 0);
  });
}

export async function refreshProfile() {
  if (state.user) { await loadProfile(state.user); emit(); }
}

export async function signUp({ email, password, fullName, phone, role }) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: { full_name: fullName.trim(), phone: phone?.trim() || null, role },
      emailRedirectTo: `${config.appUrl || window.location.origin}/connexion`,
    },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${config.appUrl || window.location.origin}/reinitialiser-mot-de-passe`,
  });
  if (error) throw error;
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function updateProfile(values) {
  const { error } = await supabase.from('profiles').update(values).eq('id', state.user.id);
  if (error) throw error;
  await refreshProfile();
}

/** Attend que la session soit chargée après connexion (max 4 s). */
export function waitForAuth(timeout = 4000) {
  return new Promise((resolve) => {
    if (state.user && state.profile) { resolve(state); return; }
    const timer = setTimeout(() => { off(); resolve(state); }, timeout);
    const off = subscribe((s) => { if (s.user && s.profile) { clearTimeout(timer); off(); resolve(s); } });
  });
}

export function homePathFor(profile) {
  if (profile?.role === 'admin') return '/admin';
  if (profile?.role === 'professionnel') return '/espace-pro';
  return '/';
}
