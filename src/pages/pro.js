import { html, setHtml, raw } from '../lib/html.js';
import { icon } from '../components/icons.js';
import { emptyState, loader, options, mountLocationPicker, businessStatusBadge, stars, confirmDialog, badge } from '../components/ui.js';
import { avatar } from '../components/businessCard.js';
import { getCategories, getLocations, getSettings } from '../services/catalog.js';
import * as pro from '../services/pro.js';
import { validateBusiness, validateService, validateAvailability, DAYS } from '../lib/validators.js';
import { formValues, showFieldErrors, withBusy, on } from '../lib/dom.js';
import { toastSuccess, toastError, friendlyError } from '../lib/toast.js';
import { formatXAF, formatDate, formatDateTime, daysUntil, safeUrl } from '../lib/format.js';
import { supabase, publicUrl } from '../lib/supabase.js';

const SECTIONS = [
  ['', 'Tableau de bord', 'chart'], ['profil', 'Ma fiche', 'edit'], ['vitrine', 'Personnaliser ma vitrine', 'palette'], ['prestations', 'Prestations & produits', 'tool'],
  ['galerie', 'Galerie', 'image'], ['disponibilites', 'Disponibilités', 'clock'], ['avis', 'Avis reçus', 'star'], ['abonnement', 'Abonnement', 'card'],
];
const err = (n) => html`<span class="field__error" data-error-for="${n}"></span>`;
const contrastFor = (hex) => { const m = /^#([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#FFFFFF'; const n = parseInt(m[1], 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 150 ? '#0B1640' : '#FFFFFF'; };
const needsBusiness = new Set(['vitrine', 'prestations', 'galerie', 'disponibilites', 'avis', 'abonnement']);

export async function render({ root, params, navigate }) {
  const section = params.section || '';
  if (!SECTIONS.some(([k]) => k === section)) { navigate('/espace-pro', { replace: true }); return undefined; }
  const biz = await pro.getMyBusiness();
  const nav = html`<nav class="side" aria-label="Espace professionnel">${SECTIONS.map(([k, l, ic]) => html`<a href="/espace-pro${k ? `/${k}` : ''}" ${k === section ? html`aria-current="page"` : ''}>${icon(ic, 18)} ${l}</a>`)}<hr /><a href="/messages">${icon('message', 18)} Messagerie</a>${biz ? html`<a href="/pro/${biz.slug}">${icon('eye', 18)} Voir ma fiche</a>` : ''}</nav>`;
  setHtml(root, html`<div class="container dash">${nav}<div class="dash__main" id="main">${loader()}</div></div>`);
  const main = root.querySelector('#main');
  const offs = [];
  const reload = () => navigate(window.location.pathname, { replace: true });

  if (!biz && section !== 'profil' && section !== '') {
    setHtml(main, emptyState('Créez d\'abord votre fiche', 'Cette section sera disponible dès que votre fiche sera créée.', html`<a class="btn" href="/espace-pro/profil">Créer ma fiche</a>`));
    return undefined;
  }
  void needsBusiness;

  if (section === '') await overview(main, biz);
  if (section === 'profil') await profileForm(main, biz, navigate);
  if (section === 'vitrine') await showcaseEditor(main, biz, navigate);
  if (section === 'prestations') await services(main, biz, offs, reload);
  if (section === 'galerie') await gallery(main, biz, offs, reload);
  if (section === 'disponibilites') availability(main, biz);
  if (section === 'avis') await reviews(main, biz);
  if (section === 'abonnement') await subscription(main, biz, reload);
  return () => offs.forEach((f) => f());
}

async function overview(main, biz) {
  if (!biz) {
    setHtml(main, html`<h1>Bienvenue sur Pro Finder</h1>${emptyState('Votre fiche n\'existe pas encore', 'Créez-la en 3 minutes : métier, localité, contacts et prestations.', html`<a class="btn btn--gold" href="/espace-pro/profil">Créer ma fiche</a>`)}`);
    return;
  }
  const [stats, settings] = await Promise.all([pro.getStats(biz.id).catch(() => null), getSettings()]);
  const active = biz.subscription_ends_at && new Date(biz.subscription_ends_at) > new Date();
  const left = active ? daysUntil(biz.subscription_ends_at) : 0;
  const t = stats?.totals || {}; const daily = stats?.daily || []; const max = Math.max(1, ...daily.map((d) => d.views));
  const todo = [];
  if (biz.status === 'pending') todo.push('Votre fiche est en cours de validation par notre équipe.');
  if (biz.status === 'rejected') todo.push(`Votre fiche a été refusée${biz.rejection_reason ? ` : ${biz.rejection_reason}` : ''}. Corrigez-la puis contactez-nous.`);
  if (biz.status === 'suspended') todo.push('Votre fiche est suspendue. Contactez-nous.');
  setHtml(main, html`<div class="row row--between"><h1>${biz.name}</h1>${businessStatusBadge(biz.status)}</div>
    ${todo.map((m) => html`<div class="alert alert--warn">${m}</div>`)}
    ${!active ? html`<div class="alert alert--warn"><strong>Votre fiche n'est pas visible du public.</strong> Activez votre abonnement (${formatXAF(settings.plan_price)} pour ${settings.plan_days} jours). <a href="/espace-pro/abonnement">Gérer l'abonnement</a></div>` : left <= 7 ? html`<div class="alert alert--warn">Votre abonnement expire dans ${left} jour${left > 1 ? 's' : ''}. <a href="/espace-pro/abonnement">Renouveler</a></div>` : ''}
    <div class="kpis">
      <div class="kpi"><strong>${t.view || 0}</strong><span>Vues (30 jours)</span></div>
      <div class="kpi"><strong>${t.whatsapp || 0}</strong><span>Clics WhatsApp</span></div>
      <div class="kpi"><strong>${t.phone || 0}</strong><span>Clics Appel</span></div>
      <div class="kpi"><strong>${stats?.conversations ?? 0}</strong><span>Conversations</span></div>
      <div class="kpi"><strong>${stats?.favorites ?? 0}</strong><span>Mises en favori</span></div>
      <div class="kpi"><strong>${stats?.avg_rating ? Number(stats.avg_rating).toFixed(1) : '—'}</strong><span>${stats?.review_count || 0} avis</span></div>
    </div>
    <div class="panel"><h2>Vues par jour (30 jours)</h2><div class="bars" role="img" aria-label="Graphique des vues par jour">${daily.map((d) => html`<i style="height:${Math.round((d.views / max) * 100)}%" title="${d.day} : ${d.views} vue(s)"></i>`)}</div></div>
    <p class="small muted">Ces chiffres sont mesurés par Pro Finder. Vos propres visites ne sont pas comptées.</p>`);
}

async function profileForm(main, biz, navigate) {
  const [cats, locs] = await Promise.all([getCategories(), getLocations()]);
  const tops = cats.filter((c) => !c.parent_id);
  const v = biz || { kind: 'independant' };
  let locId = v.location_id || '';
  setHtml(main, html`<h1>${biz ? 'Ma fiche' : 'Créer ma fiche'}</h1>
    ${biz ? '' : html`<p class="lead">Ces informations seront visibles par les clients une fois la fiche validée et l'abonnement actif.</p>`}
    <form class="panel" id="bf" novalidate>
      ${biz ? html`<div class="row" style="margin-bottom:16px">${avatar(biz.name, biz.logo_path, 'business-media', true)}<div><label class="btn btn--ghost btn--sm" for="logo">Changer le logo / la photo</label><input id="logo" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" /><p class="small muted" style="margin:6px 0 0">JPG, PNG ou WebP, 2 Mo maximum.</p></div></div>` : ''}
      <div class="form-grid">
        <div class="field"><label for="b-k">Vous êtes</label><select class="select" id="b-k" name="kind">${options([{ value: 'independant', label: 'Indépendant' }, { value: 'entreprise', label: 'Entreprise' }], v.kind)}</select>${err('kind')}</div>
        <div class="field"><label for="b-n">Nom (ou nom commercial)</label><input class="input" id="b-n" name="name" maxlength="120" value="${v.name || ''}" />${err('name')}</div>
      </div>
      <div class="field"><label for="b-t">Phrase d'accroche</label><input class="input" id="b-t" name="tagline" maxlength="140" value="${v.tagline || ''}" placeholder="Ex. Dépannage plomberie 7j/7 à Libreville" />${err('tagline')}</div>
      <div class="field"><label for="b-c">Catégorie</label><select class="select" id="b-c" name="category_id"><option value="">Choisir…</option>${tops.map((t) => html`<optgroup label="${t.name}">${cats.filter((c) => c.parent_id === t.id).map((c) => html`<option value="${c.id}" ${c.id === v.category_id ? raw('selected') : ''}>${c.name}</option>`)}</optgroup>`)}</select>${err('category_id')}</div>
      <div id="lp"></div>${err('location_id')}
      <div class="field"><label for="b-a">Adresse / repère</label><input class="input" id="b-a" name="address" maxlength="250" value="${v.address || ''}" placeholder="Ex. Derrière le marché de Mont-Bouët" />${err('address')}</div>
      <div class="form-grid">
        <div class="field"><label for="b-p">Téléphone</label><input class="input" id="b-p" name="phone" type="tel" maxlength="30" value="${v.phone || ''}" />${err('phone')}</div>
        <div class="field"><label for="b-w">WhatsApp</label><input class="input" id="b-w" name="whatsapp" type="tel" maxlength="30" value="${v.whatsapp || ''}" />${err('whatsapp')}</div>
        <div class="field"><label for="b-e">E-mail professionnel</label><input class="input" id="b-e" name="email" type="email" maxlength="254" value="${v.email || ''}" />${err('email')}</div>
        <div class="field"><label for="b-s">Site web</label><input class="input" id="b-s" name="website" maxlength="250" value="${v.website || ''}" placeholder="https://" />${err('website')}</div>
      </div>
      <div class="field"><label for="b-d">Présentation de votre activité</label><textarea class="textarea" id="b-d" name="description" maxlength="3000" style="min-height:160px">${v.description || ''}</textarea>${err('description')}</div>
      <button class="btn" type="submit">${biz ? 'Enregistrer les modifications' : 'Envoyer ma fiche pour validation'}</button>
    </form>`);
  mountLocationPicker(main.querySelector('#lp'), { locations: locs, value: locId, idPrefix: 'bl', firstPlaceholder: 'Choisir la province…', onChange: (id) => { locId = id; } });
  const f = main.querySelector('#bf');
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); const values = { ...formValues(f), location_id: locId };
    if (!showFieldErrors(f, validateBusiness(values))) return;
    await withBusy(f.querySelector('button[type=submit]'), async () => {
      try { await pro.saveBusiness(biz, values); toastSuccess(biz ? 'Fiche enregistrée.' : 'Fiche envoyée. Elle sera visible après validation et activation de l\'abonnement.'); navigate('/espace-pro', { replace: true }); }
      catch (x) { toastError(friendlyError(x)); }
    });
  });
  main.querySelector('#logo')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { await pro.uploadLogo(biz.id, file); toastSuccess('Image mise à jour.'); navigate('/espace-pro/profil', { replace: true }); window.location.reload(); }
    catch (x) { toastError(/Format|lourde|vide/.test(x.message) ? x.message : friendlyError(x)); }
  });
}

async function showcaseEditor(main, biz, navigate) {
  const v = biz || {};
  const primary = /^#[0-9a-f]{6}$/i.test(v.brand_primary_color || '') ? v.brand_primary_color : '#0B1640';
  const accent = /^#[0-9a-f]{6}$/i.test(v.brand_accent_color || '') ? v.brand_accent_color : '#3DDC97';
  const social = v.social_links || {};
  const coverUrl = v.cover_path ? publicUrl('business-media', v.cover_path) : '';
  setHtml(main, html`<div class="showcase-editor">
    <div class="row row--between" style="gap:12px;flex-wrap:wrap"><div><h1>Personnaliser ma vitrine</h1><p class="muted">Créez une présentation qui reflète l'identité de votre activité.</p></div>${biz.slug ? html`<a class="btn btn--ghost btn--sm" href="/${biz.kind === 'entreprise' ? 'entreprise' : 'pro'}/${biz.slug}" target="_blank" rel="noopener">${icon('eye',16)} Aperçu public</a>` : ''}</div>
    <section class="panel showcase-editor__cover">
      <h2>Image de couverture</h2>
      <div class="showcase-cover-preview" style="background-image:${coverUrl ? `url('${coverUrl}')` : 'none'}">${coverUrl ? '' : html`<div><strong>Votre activité, en grand</strong><span>Ajoutez une photo de couverture pour personnaliser l'en-tête.</span></div>`}</div>
      <form id="cover-form" class="row" style="align-items:end;flex-wrap:wrap"><div class="field" style="flex:1;min-width:220px"><label for="cover-file">Choisir une image (JPG, PNG, WebP · 2 Mo max.)</label><input class="input" id="cover-file" name="file" type="file" accept="image/jpeg,image/png,image/webp" /></div><button class="btn" type="submit">Téléverser la couverture</button></form>
    </section>
    <form id="showcase-form" class="panel stack" novalidate>
      <h2>Identité visuelle</h2>
      <p class="muted small">Choisissez deux couleurs. Le texte et les boutons gardent un contraste lisible.</p>
      <div class="showcase-colors">
        <label class="field"><span class="label">Couleur principale</span><span class="color-field"><input type="color" name="brand_primary_color" value="${primary}" /><code>${primary}</code></span></label>
        <label class="field"><span class="label">Couleur d'accent</span><span class="color-field"><input type="color" name="brand_accent_color" value="${accent}" /><code>${accent}</code></span></label>
        <div class="showcase-mini-preview" id="brand-preview" style="--brand-primary:${primary};--brand-accent:${accent};--brand-on-primary:${contrastFor(primary)};--brand-on-accent:${contrastFor(accent)}"><strong>${biz.name || 'Nom de votre activité'}</strong><span>Votre vitrine Pro Finder</span><b>Contacter</b></div>
      </div>
      <h2>Réseaux sociaux</h2>
      <p class="muted small">Ajoutez uniquement les liens publics de vos pages professionnelles.</p>
      <div class="form-grid">
        ${[['facebook','Facebook'],['instagram','Instagram'],['tiktok','TikTok'],['linkedin','LinkedIn'],['youtube','YouTube']].map(([key,label])=>html`<div class="field"><label for="social-${key}">${label}</label><input class="input" type="url" id="social-${key}" name="social_${key}" value="${social[key] || ''}" placeholder="https://" /></div>`)}
      </div>
      <button class="btn" type="submit">Enregistrer ma vitrine</button>
    </form>
    <section class="panel"><h2>Logo / photo de profil</h2><p class="muted small">Le logo est affiché à côté du nom de votre activité.</p><form id="showcase-logo-form" class="row" style="align-items:end;flex-wrap:wrap"><div class="field" style="flex:1;min-width:220px"><label for="showcase-logo">Choisir un logo (JPG, PNG, WebP · 2 Mo max.)</label><input class="input" id="showcase-logo" name="file" type="file" accept="image/jpeg,image/png,image/webp" /></div><button class="btn btn--ghost" type="submit">Mettre à jour le logo</button></form></section>
  </div>`);
  const coverForm = main.querySelector('#cover-form');
  coverForm.addEventListener('submit', async (e) => {
    e.preventDefault(); const file = coverForm.file.files[0];
    if (!file) { toastError('Choisissez une image de couverture.'); return; }
    await withBusy(coverForm.querySelector('button'), async () => { try { await pro.uploadCover(biz.id, file); toastSuccess('Couverture mise à jour.'); navigate('/espace-pro/vitrine', { replace: true }); } catch (x) { toastError(friendlyError(x)); } }, 'Envoi…');
  });
  const form = main.querySelector('#showcase-form');
  const updatePreview = () => {
    const p = form.brand_primary_color.value; const a = form.brand_accent_color.value;
    const preview = main.querySelector('#brand-preview'); preview.style.setProperty('--brand-primary', p); preview.style.setProperty('--brand-accent', a); preview.style.setProperty('--brand-on-primary', contrastFor(p)); preview.style.setProperty('--brand-on-accent', contrastFor(a));
    form.querySelectorAll('input[type=color]').forEach((input) => { if (input.nextElementSibling) input.nextElementSibling.textContent = input.value; });
  };
  form.querySelectorAll('input[type=color]').forEach((input) => input.addEventListener('input', updatePreview));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const social_links = Object.fromEntries(['facebook','instagram','tiktok','linkedin','youtube'].map((key) => [key, form[`social_${key}`].value.trim()]));
    for (const [key, value] of Object.entries(social_links)) if (value && !safeUrl(value)) { toastError(`Le lien ${key} doit commencer par https:// ou http://.`); return; }
    await withBusy(form.querySelector('button[type=submit]'), async () => { try { await pro.saveShowcaseSettings(biz.id, { brand_primary_color: form.brand_primary_color.value, brand_accent_color: form.brand_accent_color.value, social_links }); toastSuccess('Votre vitrine a été enregistrée.'); } catch (x) { toastError(friendlyError(x)); } });
  });
  const logoForm = main.querySelector('#showcase-logo-form');
  logoForm.addEventListener('submit', async (e) => {
    e.preventDefault(); const file = logoForm.file.files[0];
    if (!file) { toastError('Choisissez un logo.'); return; }
    await withBusy(logoForm.querySelector('button'), async () => { try { await pro.uploadLogo(biz.id, file); toastSuccess('Logo mis à jour.'); navigate('/espace-pro/vitrine', { replace: true }); } catch (x) { toastError(friendlyError(x)); } }, 'Envoi…');
  });
}

async function services(main, biz, offs, reload) {
  const list = await pro.listServices(biz.id);
  let editing = null;
  const draw = () => {
    const s = editing || {};
    setHtml(main, html`<h1>Prestations & produits</h1><p class="muted">Présentez vos services ou les produits que vous commercialisez. Les tarifs sont facultatifs : laissez-les vides pour afficher « Sur devis ».</p>
      ${list.length ? html`<div class="table-wrap" style="margin-bottom:20px"><table class="table"><thead><tr><th>Prestation</th><th>Tarif</th><th></th></tr></thead><tbody>${list.map((x) => html`<tr><td><span class="badge">${x.item_type === 'product' ? 'Produit' : 'Prestation'}</span> <strong>${x.title}</strong>${x.description ? html`<br /><span class="muted small">${x.description}</span>` : ''}</td><td>${x.price_from != null ? formatXAF(x.price_from) : '—'}${x.price_to != null ? ` – ${formatXAF(x.price_to)}` : ''}</td><td><div class="actions"><button class="btn btn--ghost btn--sm" data-edit="${x.id}">Modifier</button><button class="btn btn--danger btn--sm" data-del="${x.id}">Supprimer</button></div></td></tr>`)}</tbody></table></div>` : ''}
      <form class="panel" id="sf" novalidate><h2>${editing ? 'Modifier' : 'Ajouter'} un élément</h2>
        <div class="field"><label for="s-kind">Type</label><select class="select" id="s-kind" name="item_type">${options([{value:'service',label:'Prestation de service'},{value:'product',label:'Produit'}], s.item_type || 'service')}</select></div>
        <div class="field"><label for="s-t">Intitulé</label><input class="input" id="s-t" name="title" maxlength="120" value="${s.title || ''}" />${err('title')}</div>
        <div class="field"><label for="s-d">Description (facultatif)</label><textarea class="textarea" id="s-d" name="description" maxlength="600" style="min-height:80px">${s.description || ''}</textarea>${err('description')}</div>
        <div class="form-grid"><div class="field"><label for="s-a">Prix minimum (FCFA)</label><input class="input" id="s-a" name="price_from" inputmode="numeric" value="${s.price_from ?? ''}" />${err('price_from')}</div>
        <div class="field"><label for="s-b">Prix maximum (FCFA)</label><input class="input" id="s-b" name="price_to" inputmode="numeric" value="${s.price_to ?? ''}" />${err('price_to')}</div></div>
        <div class="row"><button class="btn" type="submit">${editing ? 'Enregistrer' : 'Ajouter'}</button>${editing ? html`<button class="btn btn--ghost" type="button" id="cancel">Annuler</button>` : ''}</div></form>`);
    main.querySelector('#cancel')?.addEventListener('click', () => { editing = null; draw(); });
    const f = main.querySelector('#sf');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const v = formValues(f);
      if (!showFieldErrors(f, validateService(v))) return;
      await withBusy(f.querySelector('button[type=submit]'), async () => { try { await pro.saveService(biz.id, v, editing?.id); toastSuccess('Prestation enregistrée.'); reload(); } catch (x) { toastError(friendlyError(x)); } });
    });
  };
  draw();
  offs.push(on(main, 'click', '[data-edit]', (e, b) => { editing = list.find((x) => x.id === b.dataset.edit); draw(); window.scrollTo(0, document.body.scrollHeight); }));
  offs.push(on(main, 'click', '[data-del]', async (e, b) => { if (await confirmDialog('Supprimer cette prestation ?', 'Supprimer')) { try { await pro.deleteService(b.dataset.del); toastSuccess('Prestation supprimée.'); reload(); } catch (x) { toastError(friendlyError(x)); } } }));
}

async function gallery(main, biz, offs, reload) {
  const imgs = await pro.listImages(biz.id);
  const featured = imgs.find((i) => i.is_featured) || imgs[0];
  setHtml(main, html`<h1>Galerie de la vitrine</h1><p class="muted">Ajoutez jusqu'à 10 photos de vos produits, réalisations ou locaux. Choisissez celle qui sera mise en avant.</p>
    ${imgs.length ? html`<div class="showcase-gallery-manager">
      ${featured ? html`<div class="showcase-gallery-feature"><img src="${featured.url}" alt="${featured.caption || 'Image mise en avant'}" /><span class="badge badge--ok">${icon('star',14)} Image mise en avant</span></div>` : ''}
      <div class="upload-grid" style="margin-bottom:20px">${imgs.map((i) => html`<div class="upload-item showcase-upload-item"><img src="${i.url}" alt="${i.caption || 'Photo de galerie'}" loading="lazy" />${i.is_featured ? html`<span class="showcase-featured-label">Principale</span>` : html`<button class="btn btn--ghost btn--sm" data-feature="${i.id}" type="button">Mettre en avant</button>`}<button class="btn btn--danger btn--sm" data-del="${i.id}" aria-label="Supprimer l'image">${icon('trash',16)}</button><span class="small muted">${i.caption || 'Sans légende'}</span></div>`)}</div>
    </div>` : emptyState('Votre galerie est vide', 'Ajoutez une première photo : elle deviendra automatiquement votre image principale.')}
    ${imgs.length < 10 ? html`<form class="panel" id="gf" style="margin-top:20px" novalidate><h2>Ajouter une photo</h2><div class="field"><label for="g-f">Image (JPG, PNG ou WebP · 2 Mo max.)</label><input class="input" id="g-f" name="file" type="file" accept="image/jpeg,image/png,image/webp" /></div><div class="field"><label for="g-c">Légende (facultatif)</label><input class="input" id="g-c" name="caption" maxlength="140" placeholder="Ex. Installation d'une climatisation" /></div><button class="btn" type="submit">${icon('upload',16)} Ajouter à la galerie (${imgs.length}/10)</button></form>` : html`<div class="alert alert--info">Vous avez atteint la limite de 10 photos. Supprimez une photo pour en ajouter une autre.</div>`}`);
  const f = main.querySelector('#gf');
  f?.addEventListener('submit', async (e) => {
    e.preventDefault(); const file = f.file.files[0];
    if (!file) { toastError('Choisissez une image.'); return; }
    await withBusy(f.querySelector('button[type=submit]'), async () => { try { await pro.addImage(biz.id, file, f.caption.value.trim()); toastSuccess('Photo ajoutée à votre vitrine.'); reload(); } catch (x) { toastError(/Format|lourde|vide|10 images|gallery_limit/.test(x.message) ? x.message.replace('gallery_limit_reached','La galerie est limitée à 10 images.') : friendlyError(x)); } }, 'Envoi…');
  });
  offs.push(on(main, 'click', '[data-feature]', async (e, button) => {
    const image = imgs.find((i) => i.id === button.dataset.feature);
    if (!image) return;
    try { await pro.setFeaturedImage(image); toastSuccess('Image principale mise à jour.'); reload(); } catch (x) { toastError(friendlyError(x)); }
  }));
  offs.push(on(main, 'click', '[data-del]', async (e, button) => {
    const image = imgs.find((i) => i.id === button.dataset.del);
    if (image && await confirmDialog('Supprimer cette image ?', 'Supprimer')) { try { await pro.deleteImage(image); toastSuccess('Image supprimée.'); reload(); } catch (x) { toastError(friendlyError(x)); } }
  }));
}

function availability(main, biz) {
  const av = biz.availability || {};
  setHtml(main, html`<h1>Disponibilités</h1><form class="panel" id="af" novalidate>
    ${DAYS.map(([k, l]) => { const d = av[k] || { open: k !== 'sun', from: '08:00', to: '18:00' }; return html`<div class="day-row"><strong>${l}</strong><label class="check"><input type="checkbox" name="${k}-open" ${d.open ? raw('checked') : ''} /> Ouvert</label><div class="times"><input class="input" type="time" name="${k}-from" value="${d.from || '08:00'}" aria-label="${l} début" /> à <input class="input" type="time" name="${k}-to" value="${d.to || '18:00'}" aria-label="${l} fin" /></div></div>${err(k)}`; })}
    <div class="field" style="margin-top:16px"><label for="av-n">Note (ex. urgences 24h/24, déplacements dans tout Libreville)</label><input class="input" id="av-n" name="note" maxlength="200" value="${av.note || ''}" />${err('note')}</div>
    <button class="btn" type="submit">Enregistrer</button></form>`);
  const f = main.querySelector('#af');
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); const next = { note: f.note.value.trim() };
    DAYS.forEach(([k]) => { next[k] = { open: f.elements[`${k}-open`].checked, from: f.elements[`${k}-from`].value, to: f.elements[`${k}-to`].value }; });
    if (!showFieldErrors(f, validateAvailability(next))) return;
    await withBusy(f.querySelector('button[type=submit]'), async () => { try { await pro.saveAvailability(biz.id, next); toastSuccess('Disponibilités enregistrées.'); } catch (x) { toastError(friendlyError(x)); } });
  });
}

async function reviews(main, biz) {
  const list = await pro.listReviews(biz.id);
  setHtml(main, html`<h1>Avis reçus</h1>${list.length ? list.map((r) => html`<div class="panel"><div class="row row--between"><strong>${r.author_name}</strong><span class="small muted">${formatDate(r.created_at)}</span></div>${stars(r.rating)}<p style="margin:6px 0 0">${r.comment || ''}</p></div>`) : emptyState('Aucun avis pour le moment', 'Les clients peuvent noter votre travail après un échange via la messagerie.')}<p class="small muted">Un avis abusif ? Signalez-le via la page Contact : notre équipe le modérera.</p>`);
}

async function subscription(main, biz, reload) {
  const [settings, payments] = await Promise.all([getSettings(), pro.listPayments(biz.id)]);
  const active = biz.subscription_ends_at && new Date(biz.subscription_ends_at) > new Date();
  const left = active ? daysUntil(biz.subscription_ends_at) : 0;
  const testMode = settings.payment_mode === 'test';
  setHtml(main, html`<h1>Abonnement</h1>
    <div class="panel"><div class="row row--between"><div><h2 style="margin:0">${active ? 'Abonnement actif' : 'Aucun abonnement actif'}</h2>
      <p class="muted" style="margin:4px 0 0">${active ? html`Votre fiche est publique jusqu'au <strong>${formatDate(biz.subscription_ends_at)}</strong> (${left} jour${left > 1 ? 's' : ''}).` : 'Votre fiche n\'est pas visible du public.'}</p></div>${badge(active ? 'Actif' : 'Inactif', active ? 'ok' : 'bad')}</div>
      <hr style="border:0;border-top:1px solid var(--line);margin:18px 0" />
      <p><strong>${formatXAF(settings.plan_price)}</strong> pour <strong>${settings.plan_days} jours</strong>. Un renouvellement avant l'échéance prolonge la durée restante.</p>
      ${biz.status !== 'approved' ? html`<div class="alert alert--warn">Votre fiche doit aussi être validée par notre équipe pour apparaître publiquement.</div>` : ''}
      ${testMode ? html`<div class="alert alert--warn" role="note">${badge('MODE TEST', 'test')} Aucun argent réel n'est prélevé. Ce bouton simule un paiement pour tester la plateforme.</div><button class="btn btn--gold" id="pay">${active ? 'Renouveler (paiement de test)' : 'Activer (paiement de test)'}</button>`
        : html`<div class="alert alert--info">Le paiement par Airtel Money et Moov Money sera disponible prochainement. Contactez-nous pour activer votre abonnement en attendant.</div><a class="btn" href="/contact">Nous contacter</a>`}
    </div>
    <h2 style="margin-top:28px">Historique des paiements</h2>
    ${payments.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Montant</th><th>Moyen</th><th>Statut</th></tr></thead><tbody>${payments.map((p) => html`<tr><td>${formatDateTime(p.created_at)}</td><td>${formatXAF(p.amount)}</td><td>${{ test: 'Test', airtel_money: 'Airtel Money', moov_money: 'Moov Money' }[p.provider]} ${p.is_test ? badge('TEST', 'test') : ''}</td><td>${badge({ paid: 'Payé', pending: 'En attente', failed: 'Échoué', refunded: 'Remboursé' }[p.status], p.status === 'paid' ? 'ok' : p.status === 'pending' ? 'warn' : 'bad')}</td></tr>`)}</tbody></table></div>` : emptyState('Aucun paiement')}`);
  main.querySelector('#pay')?.addEventListener('click', async (e) => {
    await withBusy(e.currentTarget, async () => { try { await pro.startTestPayment(biz.id); toastSuccess('Paiement de test enregistré, abonnement prolongé.'); reload(); } catch (x) { toastError(friendlyError(x)); } });
  });
  void supabase;
}
