import { html, setHtml, raw } from '../lib/html.js';
import { icon } from '../components/icons.js';
import { emptyState, loader, options, mountLocationPicker, businessStatusBadge, stars, confirmDialog, badge } from '../components/ui.js';
import { avatar } from '../components/businessCard.js';
import { getCategories, getLocations, getSettings } from '../services/catalog.js';
import * as pro from '../services/pro.js';
import { validateBusiness, validateService, validateAvailability, DAYS } from '../lib/validators.js';
import { formValues, showFieldErrors, withBusy, on } from '../lib/dom.js';
import { toastSuccess, toastError, friendlyError } from '../lib/toast.js';
import { formatXAF, formatDate, formatDateTime, daysUntil } from '../lib/format.js';
import { supabase } from '../lib/supabase.js';

const SECTIONS = [
  ['', 'Tableau de bord', 'chart'], ['profil', 'Ma fiche', 'edit'], ['prestations', 'Prestations', 'tool'],
  ['galerie', 'Galerie', 'image'], ['disponibilites', 'Disponibilités', 'clock'], ['avis', 'Avis reçus', 'star'], ['abonnement', 'Abonnement', 'card'],
];
const err = (n) => html`<span class="field__error" data-error-for="${n}"></span>`;
const needsBusiness = new Set(['prestations', 'galerie', 'disponibilites', 'avis', 'abonnement']);

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

async function services(main, biz, offs, reload) {
  const list = await pro.listServices(biz.id);
  let editing = null;
  const draw = () => {
    const s = editing || {};
    setHtml(main, html`<h1>Prestations</h1><p class="muted">Détaillez ce que vous proposez et vos tarifs indicatifs (en FCFA). Laissez vide pour « sur devis ».</p>
      ${list.length ? html`<div class="table-wrap" style="margin-bottom:20px"><table class="table"><thead><tr><th>Prestation</th><th>Tarif</th><th></th></tr></thead><tbody>${list.map((x) => html`<tr><td><strong>${x.title}</strong>${x.description ? html`<br /><span class="muted small">${x.description}</span>` : ''}</td><td>${x.price_from != null ? formatXAF(x.price_from) : '—'}${x.price_to != null ? ` – ${formatXAF(x.price_to)}` : ''}</td><td><div class="actions"><button class="btn btn--ghost btn--sm" data-edit="${x.id}">Modifier</button><button class="btn btn--danger btn--sm" data-del="${x.id}">Supprimer</button></div></td></tr>`)}</tbody></table></div>` : ''}
      <form class="panel" id="sf" novalidate><h2>${editing ? 'Modifier la prestation' : 'Ajouter une prestation'}</h2>
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
  setHtml(main, html`<h1>Galerie</h1><p class="muted">Montrez vos réalisations (12 images maximum, JPG/PNG/WebP, 2 Mo chacune).</p>
    ${imgs.length ? html`<div class="upload-grid" style="margin-bottom:20px">${imgs.map((i) => html`<div class="upload-item"><img src="${i.url}" alt="${i.caption || 'Réalisation'}" loading="lazy" /><button class="btn btn--danger btn--sm" data-del="${i.id}" aria-label="Supprimer l'image">${icon('trash', 16)}</button></div>`)}</div>` : emptyState('Aucune image', 'Ajoutez vos premières réalisations.')}
    ${imgs.length < 12 ? html`<form class="panel" id="gf" style="margin-top:20px" novalidate><div class="field"><label for="g-f">Image</label><input class="input" id="g-f" name="file" type="file" accept="image/jpeg,image/png,image/webp" /></div><div class="field"><label for="g-c">Légende (facultatif)</label><input class="input" id="g-c" name="caption" maxlength="140" /></div><button class="btn" type="submit">Ajouter l'image</button></form>` : html`<div class="alert alert--info">Limite de 12 images atteinte.</div>`}`);
  const f = main.querySelector('#gf');
  f?.addEventListener('submit', async (e) => {
    e.preventDefault(); const file = f.file.files[0];
    if (!file) { toastError('Choisissez une image.'); return; }
    await withBusy(f.querySelector('button[type=submit]'), async () => { try { await pro.addImage(biz.id, file, f.caption.value.trim()); toastSuccess('Image ajoutée.'); reload(); } catch (x) { toastError(/Format|lourde|vide/.test(x.message) ? x.message : friendlyError(x)); } }, 'Envoi…');
  });
  offs.push(on(main, 'click', '[data-del]', async (e, b) => { if (await confirmDialog('Supprimer cette image ?', 'Supprimer')) { try { await pro.deleteImage(imgs.find((i) => i.id === b.dataset.del)); toastSuccess('Image supprimée.'); reload(); } catch (x) { toastError(friendlyError(x)); } } }));
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
