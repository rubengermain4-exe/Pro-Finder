export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Délégation d'événements : on(root, 'click', '[data-action]', (event, target) => ...) */
export function on(root, type, selector, handler) {
  const listener = (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(event, target);
  };
  root.addEventListener(type, listener);
  return () => root.removeEventListener(type, listener);
}

export function debounce(fn, wait = 300) {
  let t;
  const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function formValues(form) {
  const out = {};
  new FormData(form).forEach((v, k) => { out[k] = typeof v === 'string' ? v.trim() : v; });
  return out;
}

/** Affiche les erreurs de validation sous chaque champ. */
export function showFieldErrors(form, errors) {
  form.querySelectorAll('[data-error-for]').forEach((el) => { el.textContent = ''; });
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  let first = null;
  Object.entries(errors).forEach(([name, msg]) => {
    const slot = form.querySelector(`[data-error-for="${name}"]`);
    if (slot) slot.textContent = msg;
    const input = form.elements[name];
    if (input && input.setAttribute) { input.setAttribute('aria-invalid', 'true'); first = first || input; }
  });
  if (first && first.focus) first.focus();
  return Object.keys(errors).length === 0;
}

/** Désactive un bouton pendant une action asynchrone. */
export async function withBusy(button, fn, busyLabel = 'Veuillez patienter…') {
  if (!button) return fn();
  const label = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;
  try { return await fn(); } finally { button.disabled = false; button.textContent = label; }
}

export function scrollTop() { window.scrollTo(0, 0); }
