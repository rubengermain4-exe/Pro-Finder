// Routeur minimaliste (History API). Les fonctions pures sont testées dans tests/.
export function compilePattern(pattern) {
  const keys = [];
  const source = pattern
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      if (seg.startsWith(':')) {
        const optional = seg.endsWith('?');
        const key = seg.slice(1).replace('?', '');
        keys.push(key);
        return optional ? '(?:/([^/]+))?' : '/([^/]+)';
      }
      return `/${seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
    })
    .join('');
  return { regex: new RegExp(`^${source || '/'}/?$`), keys };
}

export function matchRoute(routes, path) {
  for (const route of routes) {
    const { regex, keys } = route._compiled || (route._compiled = compilePattern(route.path));
    const m = regex.exec(path);
    if (m) {
      const params = {};
      keys.forEach((k, i) => { if (m[i + 1] !== undefined) params[k] = decodeURIComponent(m[i + 1]); });
      return { route, params };
    }
  }
  return null;
}

export function parseQuery(search) {
  const out = {};
  new URLSearchParams(search).forEach((v, k) => { out[k] = v; });
  return out;
}

export function buildQuery(obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Autorise uniquement les redirections internes (anti open-redirect). */
export function safeInternalPath(path, fallback = '/') {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return fallback;
  return path;
}

/** Vrai si le rôle courant satisfait la garde de la route. */
export function checkGuard(guard, user, profile) {
  if (!guard) return { ok: true };
  if (!user) return { ok: false, reason: 'login' };
  if (profile?.is_suspended) return { ok: false, reason: 'suspended' };
  if (guard.roles && !guard.roles.includes(profile?.role)) return { ok: false, reason: 'forbidden' };
  return { ok: true };
}
