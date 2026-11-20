import { html, raw } from '../lib/html.js';
import { icon } from './icons.js';
import { LEVEL_LABELS, childrenOf, locationChain } from '../services/catalog.js';

export const loader = (text = 'Chargement…') => html`<div class="loader" role="status"><div class="spinner"></div><span>${text}</span></div>`;

export const emptyState = (title, text = '', action = null) => html`
  <div class="empty"><h3>${title}</h3>${text ? html`<p class="muted">${text}</p>` : ''}${action || ''}</div>`;

export const errorState = (text = 'Impossible de charger cette page. Réessayez dans un instant.') =>
  html`<div class="container section"><div class="alert alert--bad" role="alert">${text}</div></div>`;

export function stars(rating, size = 16) {
  const r = Math.round(Number(rating) || 0);
  return html`<span class="stars" role="img" aria-label="${r} sur 5">${[1, 2, 3, 4, 5].map((i) => html`<span class="${i <= r ? '' : 'stars--empty'}">${icon('star', size, { filled: i <= r })}</span>`)}</span>`;
}

export function badge(text, kind = '') { return html`<span class="badge ${kind ? `badge--${kind}` : ''}">${text}</span>`; }

export function businessStatusBadge(status) {
  const map = { approved: ['Validée', 'ok'], pending: ['En attente de validation', 'warn'], rejected: ['Refusée', 'bad'], suspended: ['Suspendue', 'bad'], draft: ['Brouillon', ''] };
  const [t, k] = map[status] || [status, ''];
  return badge(t, k);
}

export function options(list, selected, placeholder = null) {
  return html`${placeholder !== null ? html`<option value="">${placeholder}</option>` : ''}${list.map((o) => html`<option value="${o.value}" ${String(o.value) === String(selected) ? raw('selected') : ''}>${o.label}</option>`)}`;
}

/** Sélecteur de localité en cascade : Province > Département > Commune > ... (administrable). */
export function mountLocationPicker(el, { locations, value = '', onChange = () => {}, idPrefix = 'loc', firstPlaceholder = 'Tout le Gabon' }) {
  let chain = value ? locationChain(locations, value).map((l) => l.id) : [];
  const draw = () => {
    const levels = [];
    let parent = null;
    for (let i = 0; i < 8; i += 1) {
      const opts = childrenOf(locations, parent);
      if (!opts.length) break;
      levels.push({ opts, selected: chain[i] || '' });
      if (!chain[i]) break;
      parent = chain[i];
    }
    const labelOf = (opts) => {
      const set = [...new Set(opts.map((o) => o.level))];
      return set.length === 1 ? LEVEL_LABELS[set[0]] : 'Localité';
    };
    el.innerHTML = levels.map((lv, i) => html`
      <div class="field">
        <label for="${idPrefix}-${i}">${labelOf(lv.opts)}</label>
        <select class="select" id="${idPrefix}-${i}" data-level="${i}">
          <option value="">${i === 0 ? firstPlaceholder : 'Tous'}</option>
          ${lv.opts.map((o) => html`<option value="${o.id}" ${o.id === lv.selected ? raw('selected') : ''}>${o.name}</option>`)}
        </select>
      </div>`).map(String).join('');
  };
  el.addEventListener('change', (e) => {
    const select = e.target.closest('select[data-level]');
    if (!select) return;
    const i = Number(select.dataset.level);
    chain = chain.slice(0, i);
    if (select.value) chain[i] = select.value;
    draw();
    onChange(chain[chain.length - 1] || '');
  });
  draw();
  return { get value() { return chain[chain.length - 1] || ''; } };
}

/** Modale accessible : Échap et clic extérieur ferment. Retourne { el, close }. */
export function openModal(content, { label = 'Fenêtre' } = {}) {
  const previous = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `<div class="modal__box" role="dialog" aria-modal="true" aria-label="${String(label).replace(/"/g, '')}"></div>`;
  wrap.firstChild.innerHTML = content.toString();
  document.body.appendChild(wrap);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); previous?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  wrap.querySelector('input, select, textarea, button')?.focus();
  return { el: wrap.firstChild, close };
}

export function confirmDialog(message, confirmLabel = 'Confirmer') {
  return new Promise((resolve) => {
    const { el, close } = openModal(html`<h3>Confirmation</h3><p>${message}</p><div class="row"><button class="btn btn--danger" data-yes>${confirmLabel}</button><button class="btn btn--ghost" data-close>Annuler</button></div>`, { label: 'Confirmation' });
    el.querySelector('[data-yes]').addEventListener('click', () => { close(); resolve(true); });
    el.parentElement.addEventListener('click', (e) => { if (e.target === el.parentElement || e.target.closest('[data-close]')) resolve(false); });
  });
}

export function pagination({ page, total, size }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return '';
  return html`<nav class="pager" aria-label="Pagination">
    <button class="btn btn--ghost btn--sm" data-page="${page - 1}" ${page <= 1 ? raw('disabled') : ''}>Précédent</button>
    <span class="small muted">Page ${page} sur ${pages}</span>
    <button class="btn btn--ghost btn--sm" data-page="${page + 1}" ${page >= pages ? raw('disabled') : ''}>Suivant</button>
  </nav>`;
}
