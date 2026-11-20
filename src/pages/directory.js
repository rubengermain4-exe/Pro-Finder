import { html, setHtml, raw } from '../lib/html.js';
import { icon } from '../components/icons.js';
import { businessGrid } from '../components/businessCard.js';
import { emptyState, options, pagination, mountLocationPicker } from '../components/ui.js';
import { getCategories, getLocations, searchBusinesses, getAds } from '../services/catalog.js';
import { buildQuery } from '../lib/router.js';
import { debounce, on } from '../lib/dom.js';
import { config } from '../config.js';
import { safeUrl } from '../lib/format.js';

const SORTS = [
  { value: 'relevance', label: 'Pertinence' }, { value: 'popular', label: 'Les plus consultés' },
  { value: 'rating', label: 'Les mieux notés' }, { value: 'recent', label: 'Les plus récents' },
];

export async function render({ root, query }) {
  const [cats, locs, ads] = await Promise.all([getCategories(), getLocations(), getAds('directory_top').catch(() => [])]);
  const tops = cats.filter((c) => !c.parent_id);
  const parentOf = (id) => cats.find((c) => c.id === id)?.parent_id || null;

  const st = { q: query.q || '', cat: query.cat || '', loc: query.loc || '', kind: query.kind || '', sort: query.sort || 'relevance', page: Math.max(1, Number(query.page) || 1) };
  let catParent = st.cat ? (parentOf(st.cat) || st.cat) : '';
  let catChild = st.cat && parentOf(st.cat) ? st.cat : '';
  const ad = ads[0];

  const kidsOf = (id) => cats.filter((c) => c.parent_id === id);
  const childSelect = () => {
    const kids = catParent ? kidsOf(catParent) : [];
    return kids.length ? html`<div class="field"><label for="f-child">Spécialité</label><select class="select" id="f-child" name="child"><option value="">Toutes</option>${options(kids.map((k) => ({ value: k.id, label: k.name })), catChild)}</select></div>` : '';
  };

  setHtml(root, html`
    <section class="page-head"><div class="container"><h1>Annuaire des professionnels</h1><p>Trouvez un prestataire par métier et par localité, partout au Gabon.</p></div></section>
    <div class="container section--tight">
      ${ad ? html`<a class="ad-banner" style="margin-bottom:20px" href="${safeUrl(ad.link_url)}" target="_blank" rel="sponsored noopener noreferrer"><span class="badge badge--sponsor">Sponsorisé</span><img src="${ad.image_url}" alt="${ad.title}" loading="lazy" /></a>` : ''}
      <div class="dir">
        <aside class="filters" aria-label="Filtres de recherche">
          <div class="row row--between"><h2 style="margin:0">Filtres</h2><button class="btn btn--ghost btn--sm filters__toggle" type="button" id="f-toggle" aria-expanded="false">${icon('search', 16)} Afficher</button></div>
          <form id="filters" class="filters__body" data-collapsed="true" style="margin-top:14px" novalidate>
            <div class="field"><label for="f-q">Mot-clé</label><input class="input" id="f-q" name="q" type="search" value="${st.q}" maxlength="80" placeholder="Ex. climatiseur, nounou…" /></div>
            <div class="field"><label for="f-kind">Type</label><select class="select" id="f-kind" name="kind">${options([{ value: 'independant', label: 'Indépendants' }, { value: 'entreprise', label: 'Entreprises' }], st.kind, 'Tous')}</select></div>
            <div class="field"><label for="f-parent">Catégorie</label><select class="select" id="f-parent" name="parent">${options(tops.map((c) => ({ value: c.id, label: c.name })), catParent, 'Toutes les catégories')}</select></div>
            <div id="child-slot">${childSelect()}</div>
            <div id="loc-picker"></div>
            <div class="field"><label for="f-sort">Trier par</label><select class="select" id="f-sort" name="sort">${options(SORTS, st.sort)}</select></div>
            <div class="row"><button class="btn btn--block" type="submit">Rechercher</button><button class="btn btn--ghost btn--block" type="button" id="f-reset">Réinitialiser</button></div>
          </form>
        </aside>
        <section aria-live="polite" aria-label="Résultats"><div id="results"></div></section>
      </div>
    </div>`);

  const form = root.querySelector('#filters');
  const results = root.querySelector('#results');
  let token = 0;

  const picker = mountLocationPicker(root.querySelector('#loc-picker'), {
    locations: locs, value: st.loc, idPrefix: 'dir-loc',
    onChange: (id) => { st.loc = id; st.page = 1; load(); },
  });

  async function load() {
    const my = ++token;
    st.cat = catChild || catParent || '';
    window.history.replaceState({}, '', `/annuaire${buildQuery({ q: st.q, cat: st.cat, loc: st.loc, kind: st.kind, sort: st.sort === 'relevance' ? '' : st.sort, page: st.page > 1 ? st.page : '' })}`);
    setHtml(results, html`<div class="biz-grid">${[1, 2, 3, 4, 5, 6].map(() => html`<div class="skeleton"></div>`)}</div>`);
    try {
      const { rows, total } = await searchBusinesses(st);
      if (my !== token) return;
      setHtml(results, rows.length
        ? html`<p class="muted small" style="margin-top:0">${total} résultat${total > 1 ? 's' : ''}</p>${businessGrid(rows)}${pagination({ page: st.page, total, size: config.pageSize })}`
        : emptyState('Aucun professionnel trouvé', 'Essayez avec moins de filtres, une autre localité ou un mot-clé plus général.', html`<p><button class="btn btn--ghost" type="button" data-action="reset">Réinitialiser la recherche</button></p>`));
    } catch (err) {
      if (my !== token) return;
      console.error(err);
      setHtml(results, html`<div class="alert alert--bad" role="alert">La recherche a échoué. Vérifiez votre connexion puis réessayez.</div>`);
    }
  }

  const readForm = () => {
    st.q = form.q.value.trim(); st.kind = form.kind.value; st.sort = form.sort.value; st.page = 1;
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); readForm(); load(); });
  form.q.addEventListener('input', debounce(() => { readForm(); load(); }, 450));
  form.addEventListener('change', (e) => {
    if (e.target.name === 'parent') {
      catParent = e.target.value; catChild = '';
      setHtml(root.querySelector('#child-slot'), childSelect());
    } else if (e.target.name === 'child') { catChild = e.target.value; } else if (e.target.name === 'q') return;
    if (e.target.name && !e.target.closest('#loc-picker')) { readForm(); load(); }
  });
  const reset = () => {
    Object.assign(st, { q: '', cat: '', loc: '', kind: '', sort: 'relevance', page: 1 });
    catParent = ''; catChild = '';
    window.location.assign('/annuaire');
  };
  root.querySelector('#f-reset').addEventListener('click', reset);
  root.querySelector('#f-toggle').addEventListener('click', (e) => {
    const body = root.querySelector('#filters');
    const collapsed = body.dataset.collapsed === 'true';
    body.dataset.collapsed = String(!collapsed);
    e.currentTarget.setAttribute('aria-expanded', String(collapsed));
    e.currentTarget.lastChild.textContent = collapsed ? ' Masquer' : ' Afficher';
  });
  const off1 = on(results, 'click', '[data-page]', (e, el) => { st.page = Number(el.dataset.page); load(); document.querySelector('.filters')?.scrollIntoView({ behavior: 'smooth' }); });
  const off2 = on(results, 'click', '[data-action="reset"]', reset);
  load();
  void picker;
  return () => { off1(); off2(); token += 1; };
}
