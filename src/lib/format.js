const fmtNumber = new Intl.NumberFormat('fr-FR');

export function formatXAF(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  return `${fmtNumber.format(n).replace(/\u202f|\u00a0/g, ' ')} FCFA`;
}

export function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(value, now = Date.now()) {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return formatDate(value);
}

export function daysUntil(value, now = Date.now()) {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now) / 86400000);
}

export function slugify(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

export function uniqueSlug(name, random = Math.random) {
  const base = slugify(name) || 'pro';
  const suffix = Math.floor(random() * 36 ** 4).toString(36).padStart(4, '0');
  return `${base}-${suffix}`;
}

/** Retourne uniquement les chiffres, avec l'indicatif pays, ou null si invalide. */
export function normalizePhone(input, countryCode = '241') {
  if (!input) return null;
  let digits = String(input).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (!digits.startsWith(countryCode)) digits = countryCode + digits;
  const national = digits.startsWith(countryCode) ? digits.slice(countryCode.length) : digits;
  if (!/^\d{7,10}$/.test(national)) return null;
  return digits;
}

export function waLink(phone, text = '', countryCode = '241') {
  const n = normalizePhone(phone, countryCode);
  if (!n) return '';
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${n}${q}`;
}

export function telLink(phone, countryCode = '241') {
  const n = normalizePhone(phone, countryCode);
  return n ? `tel:+${n}` : '';
}

/** N'autorise que http(s) : bloque javascript:, data:, etc. */
export function safeUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

export function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function plural(n, one, many) {
  return `${n} ${n > 1 ? many : one}`;
}
