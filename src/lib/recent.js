// Fiches récemment consultées, gardées uniquement sur l'appareil du visiteur (aucune donnée envoyée au serveur).
const KEY = 'pf:recent';
const MAX = 6;
const FIELDS = ['slug', 'kind', 'name', 'tagline', 'category_name', 'location_name', 'logo_path'];

function defaultStore() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function getRecent(store = defaultStore()) {
  if (!store) return [];
  try {
    const list = JSON.parse(store.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((e) => e && typeof e.slug === 'string' && typeof e.name === 'string').slice(0, MAX) : [];
  } catch { return []; }
}

export function addRecent(entry, store = defaultStore()) {
  if (!store || !entry?.slug || !entry?.name) return;
  const clean = {};
  for (const f of FIELDS) if (typeof entry[f] === 'string') clean[f] = entry[f].slice(0, 200);
  const next = [clean, ...getRecent(store).filter((e) => e.slug !== clean.slug)].slice(0, MAX);
  try { store.setItem(KEY, JSON.stringify(next)); } catch { /* stockage plein ou refusé : sans importance */ }
}

export function clearRecent(store = defaultStore()) {
  try { store?.removeItem(KEY); } catch { /* ignore */ }
}
