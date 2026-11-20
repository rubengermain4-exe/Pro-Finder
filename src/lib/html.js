// Gabarits HTML échappés par défaut : protection XSS.
// Toute valeur interpolée est échappée, sauf si elle provient d'un autre html`...` ou de raw().
class SafeHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]);
}

function render(value) {
  if (value === null || value === undefined || value === false || value === true) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) out += render(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** À n'utiliser que pour du contenu entièrement maîtrisé (ex. icônes SVG internes). */
export function raw(value) { return new SafeHtml(String(value ?? '')); }

export function isSafeHtml(value) { return value instanceof SafeHtml; }

export function setHtml(element, safe) {
  element.innerHTML = safe instanceof SafeHtml ? safe.value : esc(safe);
}
