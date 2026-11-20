import { html, setHtml, raw } from '../lib/html.js';
import { icon, ICON_NAMES } from '../components/icons.js';
import { emptyState, loader, options, badge, businessStatusBadge, confirmDialog, openModal, pagination } from '../components/ui.js';
import * as adm from '../services/admin.js';
import { resetCategories, resetLocations, LEVEL_LABELS } from '../services/catalog.js';
import { supabase } from '../lib/supabase.js';
import { getAuth } from '../state/auth.js';
import { validateImageFile } from '../lib/image.js';
import { formValues, withBusy, on, debounce } from '../lib/dom.js';
import { toastSuccess, toastError, friendlyError } from '../lib/toast.js';
import { formatXAF, formatDate, formatDateTime } from '../lib/format.js';

const SECTIONS = [
  ['', 'Vue d\'ensemble', 'chart'], ['utilisateurs', 'Utilisateurs', 'user'], ['professionnels', 'Professionnels', 'tool'],
  ['categories', 'Catégories', 'grid'], ['localites', 'Localités', 'pin'], ['paiements', 'Paiements', 'card'],
  ['abonnements', 'Abonnements', 'clock'], ['signalements', 'Signalements', 'flag'], ['avis', 'Modération des avis', 'star'],
  ['publicites', 'Publicités', 'image'], ['contacts', 'Messages de contact', 'mail'], ['journal', 'Journal d\'audit', 'eye'], ['parametres', 'Paramètres', 'settings'],
];
const STATUS_LABELS = { open: 'Ouvert', reviewing: 'En cours', resolved: 'Résolu', dismissed: 'Rejeté' };
const REASON_LABELS = { fraude: 'Fraude', contenu_inapproprie: 'Contenu inapproprié', usurpation: 'Usurpation', faux_avis: 'Faux avis', metier_sensible: 'Métier sensible', autre: 'Autre' };
const table = (head, rows) => html`<div class="table-wrap"><table class="table"><thead><tr>${head.map((h) => html`<th>${h}</th>`)}</tr></thead><tbody>${rows}</tbody></table></div>`;
const kpi = (n, l) => html`<div class="kpi"><strong>${n}</strong><span>${l}</span></div>`;

export async function render({ root, params, navigate }) {
  const section = params.section || '';
  if (!SECTIONS.some(([k]) => k === section)) { navigate('/admin', { replace: true }); return undefined; }
  setHtml(root, html`<div class="container dash"><nav class="side" aria-label="Administration">${SECTIONS.map(([k, l, ic]) => html`<a href="/admin${k ? `/${k}` : ''}" ${k === section ? html`aria-current="page"` : ''}>${icon(ic, 18)} ${l}</a>`)}</nav><div class="dash__main" id="main">${loader()}</div></div>`);
  const main = root.querySelector('#main');
  const offs = [];
  const again = () => navigate(window.location.pathname, { replace: true });
  const guard = (fn) => async (...a) => { try { await fn(...a); } catch (x) { toastError(friendlyError(x)); } };
  const ctx = { main, offs, again, guard };
  const handlers = { '': overview, utilisateurs: users, professionnels: businesses, categories, localites: locations, paiements: payments, abonnements: subscriptions, signalements: reports, avis: reviews, publicites: ads, contacts, journal: logs, parametres: settings };
  await handlers[section](ctx);
  return () => offs.forEach((f) => f());
}

async function overview({ main }) {
  const o = await adm.overview();
  const b = o.businesses || {}; const u = o.users || {};
  setHtml(main, html`<h1>Vue d'ensemble</h1>
    <div class="kpis">${kpi(Object.values(u).reduce((a, n) => a + n, 0), 'Comptes')}${kpi(u.professionnel || 0, 'Professionnels inscrits')}${kpi(b.pending || 0, 'Fiches à valider')}${kpi(o.public_businesses, 'Fiches publiques')}${kpi(o.active_subscriptions, 'Abonnements actifs')}${kpi(o.open_reports, 'Signalements ouverts')}${kpi(o.unhandled_contacts, 'Contacts non traités')}${kpi(o.conversations, 'Conversations')}</div>
    <div class="kpis">${kpi(formatXAF(o.revenue_real), 'Revenus réels encaissés')}${kpi(formatXAF(o.revenue_test), 'Paiements de TEST (non réels)')}</div>
    ${(b.pending || 0) ? html`<div class="alert alert--warn"><a href="/admin/professionnels">${b.pending} fiche(s) en attente de validation</a></div>` : ''}`);
}

async function users({ main, offs, again, guard }) {
  let page = 1; let search = '';
  setHtml(main, html`<h1>Utilisateurs</h1><div class="field" style="max-width:360px"><label for="us">Rechercher (nom ou e-mail)</label><input class="input" id="us" type="search" /></div><div id="t"></div>`);
  const t = main.querySelector('#t');
  const load = async () => {
    const { rows, total } = await adm.listUsers({ search, page });
    setHtml(t, html`${table(['Nom', 'E-mail', 'Rôle', 'Inscrit', 'Statut', ''], rows.map((r) => html`<tr><td>${r.full_name || '—'}<br /><span class="small muted">${r.phone || ''}</span></td><td>${r.email}</td><td>${badge(r.role, r.role === 'admin' ? 'warn' : '')}</td><td>${formatDate(r.created_at)}</td><td>${r.is_suspended ? badge('Suspendu', 'bad') : badge('Actif', 'ok')}</td><td>${r.role === 'admin' ? '' : html`<button class="btn btn--sm ${r.is_suspended ? 'btn--ghost' : 'btn--danger'}" data-id="${r.id}" data-susp="${!r.is_suspended}">${r.is_suspended ? 'Réactiver' : 'Suspendre'}</button>`}</td></tr>`))}${pagination({ page, total, size: 25 })}`);
  };
  main.querySelector('#us').addEventListener('input', debounce((e) => { search = e.target.value.trim(); page = 1; guard(load)(); }, 400));
  offs.push(on(t, 'click', '[data-page]', (e, b) => { page = Number(b.dataset.page); guard(load)(); }));
  offs.push(on(t, 'click', '[data-susp]', guard(async (e, b) => { const s = b.dataset.susp === 'true'; if (s && !(await confirmDialog('Suspendre ce compte ? Il ne pourra plus écrire ni publier.', 'Suspendre'))) return; await adm.setUserSuspended(b.dataset.id, s); toastSuccess(s ? 'Compte suspendu.' : 'Compte réactivé.'); await load(); })));
  await load();
}

async function businesses({ main, offs, again, guard }) {
  let status = 'pending';
  const draw = async () => {
    const rows = await adm.listBusinesses(status);
    setHtml(main, html`<h1>Professionnels</h1><div class="tabs">${[['pending', 'À valider'], ['approved', 'Validés'], ['rejected', 'Refusés'], ['suspended', 'Suspendus'], ['', 'Tous']].map(([k, l]) => html`<button data-tab="${k}" aria-pressed="${k === status}">${l}</button>`)}</div>
      ${rows.length ? table(['Fiche', 'Catégorie / lieu', 'Statut', 'Abonnement', 'Actions'], rows.map((b) => html`<tr><td><a href="/pro/${b.slug}"><strong>${b.name}</strong></a><br /><span class="small muted">${b.kind} · ${formatDate(b.created_at)}</span></td><td>${b.category?.name || '—'}<br /><span class="small muted">${b.location?.name || ''}</span></td><td>${businessStatusBadge(b.status)}${b.rejection_reason ? html`<br /><span class="small muted">${b.rejection_reason}</span>` : ''}</td><td>${b.subscription_ends_at ? formatDate(b.subscription_ends_at) : '—'}</td><td><div class="actions">${b.status !== 'approved' ? html`<button class="btn btn--sm" data-st="approved" data-id="${b.id}">Valider</button>` : ''}${b.status !== 'rejected' ? html`<button class="btn btn--ghost btn--sm" data-st="rejected" data-id="${b.id}">Refuser</button>` : ''}${b.status === 'approved' ? html`<button class="btn btn--danger btn--sm" data-st="suspended" data-id="${b.id}">Suspendre</button>` : ''}<button class="btn btn--ghost btn--sm" data-grant="${b.id}">Offrir des jours</button></div></td></tr>`)) : emptyState('Aucune fiche dans cette catégorie')}`);
  };
  offs.push(on(main, 'click', '[data-tab]', guard(async (e, b) => { status = b.dataset.tab; await draw(); })));
  offs.push(on(main, 'click', '[data-st]', guard(async (e, b) => {
    const st = b.dataset.st; let reason = null;
    if (st === 'rejected' || st === 'suspended') {
      reason = await new Promise((resolve) => { const { el, close } = openModal(html`<h3>Motif (visible par le professionnel)</h3><form><div class="field"><textarea class="textarea" name="r" maxlength="500" required></textarea></div><div class="row"><button class="btn" type="submit">Confirmer</button><button class="btn btn--ghost" type="button" data-close>Annuler</button></div></form>`); el.querySelector('form').addEventListener('submit', (ev) => { ev.preventDefault(); const v = el.querySelector('textarea').value.trim(); if (v.length < 3) return; close(); resolve(v); }); el.parentElement.addEventListener('click', (ev) => { if (ev.target === el.parentElement || ev.target.closest('[data-close]')) resolve(null); }); });
      if (!reason) return;
    }
    await adm.setBusinessStatus(b.dataset.id, st, reason); toastSuccess('Statut mis à jour.'); await draw();
  })));
  offs.push(on(main, 'click', '[data-grant]', (e, b) => {
    const { el, close } = openModal(html`<h3>Offrir des jours d'abonnement</h3><form><div class="field"><label>Nombre de jours<input class="input" name="days" type="number" min="1" max="365" value="30" /></label></div><div class="field"><label>Motif (journalisé)<input class="input" name="reason" maxlength="200" /></label></div><div class="row"><button class="btn" type="submit">Accorder</button><button class="btn btn--ghost" type="button" data-close>Annuler</button></div></form>`);
    el.querySelector('form').addEventListener('submit', guard(async (ev) => { ev.preventDefault(); const v = formValues(ev.target); await adm.grantSubscription(b.dataset.grant, Number(v.days), v.reason); toastSuccess('Abonnement prolongé.'); close(); await draw(); }));
  }));
  await draw();
}

async function categories({ main, offs, guard }) {
  let editing = null;
  const draw = async () => {
    const all = await adm.listAllCategories(); const tops = all.filter((c) => !c.parent_id); const e = editing || {};
    const name = (id) => all.find((c) => c.id === id)?.name || '—';
    setHtml(main, html`<h1>Catégories</h1>${table(['Nom', 'Parent', 'Icône', 'Sensible', 'Actif', ''], all.map((c) => html`<tr><td>${c.name}<br /><span class="small muted">${c.slug}</span></td><td>${c.parent_id ? name(c.parent_id) : '—'}</td><td>${icon(c.icon, 18)} ${c.icon}</td><td>${c.is_sensitive ? badge('Oui', 'warn') : 'Non'}</td><td>${c.is_active ? 'Oui' : 'Non'}</td><td><div class="actions"><button class="btn btn--ghost btn--sm" data-edit="${c.id}">Modifier</button><button class="btn btn--danger btn--sm" data-del="${c.id}">Supprimer</button></div></td></tr>`))}
      <form class="panel" id="cf" style="margin-top:20px"><h2>${editing ? 'Modifier' : 'Ajouter'} une catégorie</h2><div class="form-grid">
        <div class="field"><label>Nom<input class="input" name="name" maxlength="100" required value="${e.name || ''}" /></label></div>
        <div class="field"><label>Identifiant (slug)<input class="input" name="slug" maxlength="80" value="${e.slug || ''}" /></label></div>
        <div class="field"><label>Catégorie parente<select class="select" name="parent_id">${options(tops.filter((t) => t.id !== e.id).map((t) => ({ value: t.id, label: t.name })), e.parent_id || '', 'Aucune (catégorie principale)')}</select></label></div>
        <div class="field"><label>Icône<select class="select" name="icon">${options(ICON_NAMES.map((n) => ({ value: n, label: n })), e.icon || 'tool')}</select></label></div>
        <div class="field"><label>Ordre<input class="input" name="sort_order" type="number" value="${e.sort_order ?? 100}" /></label></div></div>
        <label class="check"><input type="checkbox" name="is_sensitive" ${e.is_sensitive ? raw('checked') : ''} /> Métier sensible (avertissement affiché)</label>
        <label class="check" style="margin:10px 0"><input type="checkbox" name="is_active" ${e.is_active !== false ? raw('checked') : ''} /> Active</label>
        <div class="row"><button class="btn" type="submit">Enregistrer</button>${editing ? html`<button class="btn btn--ghost" type="button" id="cc">Annuler</button>` : ''}</div></form>`);
    main.querySelector('#cc')?.addEventListener('click', () => { editing = null; guard(draw)(); });
    main.querySelector('#cf').addEventListener('submit', guard(async (ev) => { ev.preventDefault(); const f = ev.target; const v = formValues(f); v.is_sensitive = f.is_sensitive.checked; v.is_active = f.is_active.checked; await adm.saveCategory(v, editing?.id); resetCategories(); toastSuccess('Catégorie enregistrée.'); editing = null; await draw(); }));
  };
  offs.push(on(main, 'click', '[data-edit]', guard(async (e, b) => { editing = (await adm.listAllCategories()).find((c) => c.id === b.dataset.edit); await draw(); })));
  offs.push(on(main, 'click', '[data-del]', guard(async (e, b) => { if (await confirmDialog('Supprimer cette catégorie ? (impossible si elle a des sous-catégories)', 'Supprimer')) { await adm.deleteCategory(b.dataset.del); resetCategories(); toastSuccess('Catégorie supprimée.'); await draw(); } })));
  await draw();
}

async function locations({ main, offs, guard }) {
  let editing = null; let filter = '';
  const draw = async () => {
    const all = await adm.listAllLocations(); const byId = new Map(all.map((l) => [l.id, l])); const e = editing || {};
    const path = (l) => { const p = []; let c = l; while (c) { p.unshift(c.name); c = c.parent_id ? byId.get(c.parent_id) : null; } return p.join(' › '); };
    const shown = all.filter((l) => !filter || path(l).toLowerCase().includes(filter.toLowerCase())).sort((a, b) => path(a).localeCompare(path(b), 'fr')).slice(0, 300);
    setHtml(main, html`<h1>Localités</h1><p class="muted">${all.length} localité(s). Ajoutez départements, communes, arrondissements, villes et quartiers.</p>
      <div class="field" style="max-width:360px"><label for="lf">Filtrer</label><input class="input" id="lf" type="search" value="${filter}" /></div>
      ${table(['Chemin', 'Niveau', 'Actif', ''], shown.map((l) => html`<tr><td>${path(l)}</td><td>${LEVEL_LABELS[l.level]}</td><td>${l.is_active ? 'Oui' : 'Non'}</td><td><div class="actions"><button class="btn btn--ghost btn--sm" data-edit="${l.id}">Modifier</button><button class="btn btn--danger btn--sm" data-del="${l.id}">Supprimer</button></div></td></tr>`))}
      <form class="panel" id="lfm" style="margin-top:20px"><h2>${editing ? 'Modifier' : 'Ajouter'} une localité</h2><div class="form-grid">
        <div class="field"><label>Nom<input class="input" name="name" maxlength="120" required value="${e.name || ''}" /></label></div>
        <div class="field"><label>Niveau<select class="select" name="level">${options(Object.entries(LEVEL_LABELS).map(([value, label]) => ({ value, label })), e.level || 'quartier')}</select></label></div>
        <div class="field"><label>Rattachée à<select class="select" name="parent_id">${options(all.filter((l) => l.id !== e.id).sort((a, b) => path(a).localeCompare(path(b), 'fr')).map((l) => ({ value: l.id, label: path(l) })), e.parent_id || '', 'Aucune (province)')}</select></label></div></div>
        <label class="check" style="margin:10px 0"><input type="checkbox" name="is_active" ${e.is_active !== false ? raw('checked') : ''} /> Active</label>
        <div class="row"><button class="btn" type="submit">Enregistrer</button>${editing ? html`<button class="btn btn--ghost" type="button" id="cc">Annuler</button>` : ''}</div></form>`);
    main.querySelector('#lf').addEventListener('input', debounce((ev) => { filter = ev.target.value.trim(); guard(draw)(); }, 350));
    main.querySelector('#lf').focus(); const len = main.querySelector('#lf').value.length; main.querySelector('#lf').setSelectionRange(len, len);
    main.querySelector('#cc')?.addEventListener('click', () => { editing = null; guard(draw)(); });
    main.querySelector('#lfm').addEventListener('submit', guard(async (ev) => { ev.preventDefault(); const f = ev.target; const v = formValues(f); v.is_active = f.is_active.checked; await adm.saveLocation(v, editing?.id); resetLocations(); toastSuccess('Localité enregistrée.'); editing = null; await draw(); }));
  };
  offs.push(on(main, 'click', '[data-edit]', guard(async (e, b) => { editing = (await adm.listAllLocations()).find((l) => l.id === b.dataset.edit); await draw(); })));
  offs.push(on(main, 'click', '[data-del]', guard(async (e, b) => { if (await confirmDialog('Supprimer cette localité ? (impossible si elle contient des sous-localités)', 'Supprimer')) { await adm.deleteLocation(b.dataset.del); resetLocations(); toastSuccess('Localité supprimée.'); await draw(); } })));
  await draw();
}

async function payments({ main }) {
  const rows = await adm.listPayments();
  setHtml(main, html`<h1>Paiements</h1><p class="small muted">Les paiements marqués TEST n'impliquent aucun argent réel.</p>${rows.length ? table(['Date', 'Fiche', 'Montant', 'Moyen', 'Statut', 'Référence'], rows.map((p) => html`<tr><td>${formatDateTime(p.created_at)}</td><td>${p.business?.name || '—'}</td><td>${formatXAF(p.amount)}</td><td>${p.provider} ${p.is_test ? badge('TEST', 'test') : ''}</td><td>${badge(p.status, p.status === 'paid' ? 'ok' : p.status === 'pending' ? 'warn' : 'bad')}</td><td class="small">${p.provider_reference || '—'}</td></tr>`)) : emptyState('Aucun paiement')}`);
}

async function subscriptions({ main, offs, guard }) {
  const draw = async () => {
    const rows = await adm.listSubscriptions();
    setHtml(main, html`<h1>Abonnements</h1>${rows.length ? table(['Fiche', 'Début', 'Fin', 'Statut', ''], rows.map((s) => html`<tr><td>${s.business?.name || '—'}</td><td>${formatDate(s.starts_at)}</td><td>${formatDate(s.ends_at)}</td><td>${badge(s.status, s.status === 'active' ? 'ok' : 'bad')}</td><td>${s.status === 'active' ? html`<button class="btn btn--danger btn--sm" data-cancel="${s.id}">Annuler</button>` : ''}</td></tr>`)) : emptyState('Aucun abonnement')}`);
  };
  offs.push(on(main, 'click', '[data-cancel]', guard(async (e, b) => { if (await confirmDialog('Annuler cet abonnement ? La fiche cessera d\'être publique.', 'Annuler l\'abonnement')) { await adm.cancelSubscription(b.dataset.cancel); toastSuccess('Abonnement annulé.'); await draw(); } })));
  await draw();
}

async function reports({ main, offs, guard }) {
  let status = 'open';
  const draw = async () => {
    const rows = await adm.listReports(status);
    setHtml(main, html`<h1>Signalements</h1><div class="tabs">${[['open', 'Ouverts'], ['reviewing', 'En cours'], ['resolved', 'Résolus'], ['dismissed', 'Rejetés'], ['', 'Tous']].map(([k, l]) => html`<button data-tab="${k}" aria-pressed="${k === status}">${l}</button>`)}</div>
      ${rows.length ? table(['Date', 'Cible', 'Motif', 'Détails', 'Statut', 'Action'], rows.map((r) => html`<tr><td>${formatDateTime(r.created_at)}</td><td>${r.target_type}<br /><span class="small muted">${r.target_id.slice(0, 8)}…</span></td><td>${REASON_LABELS[r.reason]}</td><td>${r.details || '—'}${r.resolution_note ? html`<br /><span class="small muted">Note : ${r.resolution_note}</span>` : ''}</td><td>${badge(STATUS_LABELS[r.status], r.status === 'open' ? 'warn' : r.status === 'resolved' ? 'ok' : '')}</td><td><div class="actions"><button class="btn btn--ghost btn--sm" data-rep="${r.id}">Traiter</button></div></td></tr>`)) : emptyState('Aucun signalement')}`);
  };
  offs.push(on(main, 'click', '[data-tab]', guard(async (e, b) => { status = b.dataset.tab; await draw(); })));
  offs.push(on(main, 'click', '[data-rep]', (e, b) => {
    const { el, close } = openModal(html`<h3>Traiter le signalement</h3><form><div class="field"><label>Statut<select class="select" name="status">${options(Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })), 'resolved')}</select></label></div><div class="field"><label>Note interne<textarea class="textarea" name="note" maxlength="500"></textarea></label></div><p class="small muted">Pour agir sur la fiche (suspension…), utilisez la section Professionnels.</p><div class="row"><button class="btn" type="submit">Enregistrer</button><button class="btn btn--ghost" type="button" data-close>Annuler</button></div></form>`);
    el.querySelector('form').addEventListener('submit', guard(async (ev) => { ev.preventDefault(); const v = formValues(ev.target); await adm.updateReport(b.dataset.rep, v.status, v.note, getAuth().user.id); toastSuccess('Signalement mis à jour.'); close(); await draw(); }));
  }));
  await draw();
}

async function reviews({ main, offs, guard }) {
  const draw = async () => {
    const rows = await adm.listReviews();
    setHtml(main, html`<h1>Modération des avis</h1>${rows.length ? table(['Date', 'Fiche', 'Note', 'Commentaire', 'Statut', ''], rows.map((r) => html`<tr><td>${formatDate(r.created_at)}</td><td>${r.business?.name || '—'}</td><td>${r.rating}/5</td><td>${r.comment || '—'}</td><td>${badge(r.status === 'published' ? 'Publié' : 'Masqué', r.status === 'published' ? 'ok' : 'warn')}</td><td><button class="btn btn--sm ${r.status === 'published' ? 'btn--danger' : 'btn--ghost'}" data-id="${r.id}" data-to="${r.status === 'published' ? 'hidden' : 'published'}">${r.status === 'published' ? 'Masquer' : 'Republier'}</button></td></tr>`)) : emptyState('Aucun avis')}`);
  };
  offs.push(on(main, 'click', '[data-to]', guard(async (e, b) => { await adm.setReviewStatus(b.dataset.id, b.dataset.to); toastSuccess('Avis mis à jour.'); await draw(); })));
  await draw();
}

async function ads({ main, offs, guard }) {
  let editing = null; let imageUrl = '';
  const draw = async () => {
    const rows = await adm.listAds(); const e = editing || {}; imageUrl = e.image_url || '';
    const dt = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');
    setHtml(main, html`<h1>Publicités sponsorisées</h1><p class="muted">Elles s'affichent toujours avec la mention « Sponsorisé ».</p>
      ${rows.length ? table(['Titre', 'Annonceur', 'Emplacement', 'Période', 'Actif', ''], rows.map((a) => html`<tr><td>${a.title}</td><td>${a.advertiser || '—'}</td><td>${a.placement}</td><td>${a.starts_at ? formatDate(a.starts_at) : '…'} → ${a.ends_at ? formatDate(a.ends_at) : '…'}</td><td>${a.is_active ? 'Oui' : 'Non'}</td><td><div class="actions"><button class="btn btn--ghost btn--sm" data-edit="${a.id}">Modifier</button><button class="btn btn--danger btn--sm" data-del="${a.id}">Supprimer</button></div></td></tr>`)) : emptyState('Aucune publicité')}
      <form class="panel" id="af" style="margin-top:20px"><h2>${editing ? 'Modifier' : 'Ajouter'} une publicité</h2><div class="form-grid">
        <div class="field"><label>Titre<input class="input" name="title" maxlength="120" required value="${e.title || ''}" /></label></div>
        <div class="field"><label>Annonceur<input class="input" name="advertiser" maxlength="120" value="${e.advertiser || ''}" /></label></div>
        <div class="field"><label>Lien de destination (https://…)<input class="input" name="link_url" maxlength="500" required value="${e.link_url || ''}" /></label></div>
        <div class="field"><label>Emplacement<select class="select" name="placement">${options([{ value: 'home_banner', label: "Bannière d'accueil" }, { value: 'directory_top', label: "Haut de l'annuaire" }], e.placement || 'home_banner')}</select></label></div>
        <div class="field"><label>Début<input class="input" type="date" name="starts_at" value="${dt(e.starts_at)}" /></label></div>
        <div class="field"><label>Fin<input class="input" type="date" name="ends_at" value="${dt(e.ends_at)}" /></label></div></div>
        <div class="field"><label for="ad-img">Image (JPG/PNG/WebP, 2 Mo max)</label><input class="input" id="ad-img" type="file" accept="image/jpeg,image/png,image/webp" />${e.image_url ? html`<span class="hint">Image actuelle conservée si vous n'en choisissez pas une nouvelle.</span>` : ''}</div>
        <label class="check" style="margin:10px 0"><input type="checkbox" name="is_active" ${e.is_active !== false ? raw('checked') : ''} /> Active</label>
        <div class="row"><button class="btn" type="submit">Enregistrer</button>${editing ? html`<button class="btn btn--ghost" type="button" id="cc">Annuler</button>` : ''}</div></form>`);
    main.querySelector('#cc')?.addEventListener('click', () => { editing = null; guard(draw)(); });
    main.querySelector('#af').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const f = ev.target; const v = formValues(f); v.is_active = f.is_active.checked;
      await withBusy(f.querySelector('button[type=submit]'), guard(async () => {
        const file = main.querySelector('#ad-img').files[0];
        if (file) {
          const chk = await validateImageFile(file); if (!chk.ok) throw new Error(chk.error);
          const path = `${getAuth().user.id}/ad-${Date.now()}.${chk.ext}`;
          const up = await supabase.storage.from('business-media').upload(path, file, { contentType: chk.type }); if (up.error) throw up.error;
          imageUrl = supabase.storage.from('business-media').getPublicUrl(path).data.publicUrl;
        }
        if (!imageUrl) { toastError('Ajoutez une image.'); return; }
        if (!/^https?:\/\//i.test(v.link_url)) { toastError('Le lien doit commencer par https://'); return; }
        v.image_url = imageUrl; v.starts_at = v.starts_at ? new Date(v.starts_at).toISOString() : null; v.ends_at = v.ends_at ? new Date(`${v.ends_at}T23:59:59`).toISOString() : null;
        await adm.saveAd(v, getAuth().user.id, editing?.id); toastSuccess('Publicité enregistrée.'); editing = null; await draw();
      }));
    });
  };
  offs.push(on(main, 'click', '[data-edit]', guard(async (e, b) => { editing = (await adm.listAds()).find((a) => a.id === b.dataset.edit); await draw(); })));
  offs.push(on(main, 'click', '[data-del]', guard(async (e, b) => { if (await confirmDialog('Supprimer cette publicité ?', 'Supprimer')) { await adm.deleteAd(b.dataset.del); toastSuccess('Publicité supprimée.'); await draw(); } })));
  await draw();
}

async function contacts({ main, offs, guard }) {
  const draw = async () => {
    const rows = await adm.listContacts();
    setHtml(main, html`<h1>Messages de contact</h1>${rows.length ? rows.map((c) => html`<div class="panel" style="${c.is_handled ? 'opacity:.65' : ''}"><div class="row row--between"><strong>${c.subject}</strong><span class="small muted">${formatDateTime(c.created_at)}</span></div><p class="small muted" style="margin:2px 0">${c.name} · <a href="mailto:${c.email}">${c.email}</a></p><p style="white-space:pre-line">${c.body}</p><button class="btn btn--ghost btn--sm" data-id="${c.id}" data-h="${!c.is_handled}">${c.is_handled ? 'Marquer non traité' : 'Marquer traité'}</button></div>`) : emptyState('Aucun message')}`);
  };
  offs.push(on(main, 'click', '[data-h]', guard(async (e, b) => { await adm.setContactHandled(b.dataset.id, b.dataset.h === 'true'); await draw(); })));
  await draw();
}

async function logs({ main }) {
  const rows = await adm.listLogs();
  setHtml(main, html`<h1>Journal d'audit</h1><p class="small muted">Actions d'administration enregistrées automatiquement (200 dernières).</p>${rows.length ? table(['Date', 'Action', 'Cible', 'Détails'], rows.map((l) => html`<tr><td>${formatDateTime(l.created_at)}</td><td>${l.action}</td><td class="small">${l.target_type || ''}<br />${l.target_id || ''}</td><td class="small" style="max-width:380px;overflow-wrap:anywhere">${JSON.stringify(l.details).slice(0, 220)}</td></tr>`)) : emptyState('Journal vide')}`);
}

async function settings({ main, guard }) {
  const rows = await adm.getAllSettings(); const get = (k) => rows.find((r) => r.key === k)?.value;
  const mode = get('payment_mode'); const price = get('plan_price'); const days = get('plan_days');
  setHtml(main, html`<h1>Paramètres</h1>
    <form class="panel" id="sf" style="max-width:520px"><h2>Abonnement et paiements</h2>
      <div class="field"><label>Mode de paiement<select class="select" name="mode">${options([{ value: 'test', label: 'TEST (paiements simulés, aucun argent réel)' }, { value: 'live', label: 'RÉEL (paiement mobile requis)' }], mode)}</select></label><span class="hint">En mode réel, le bouton de paiement de test est refusé par la base de données.</span></div>
      <div class="field"><label>Prix (FCFA)<input class="input" name="price" type="number" min="1" value="${price}" /></label></div>
      <div class="field"><label>Durée (jours)<input class="input" name="days" type="number" min="1" max="365" value="${days}" /></label></div>
      <button class="btn" type="submit">Enregistrer</button></form>`);
  main.querySelector('#sf').addEventListener('submit', guard(async (e) => {
    e.preventDefault(); const v = formValues(e.target);
    if (!(Number(v.price) > 0) || !(Number(v.days) >= 1 && Number(v.days) <= 365)) { toastError('Valeurs invalides.'); return; }
    if (v.mode === 'live' && !(await confirmDialog('Passer en mode RÉEL désactive les paiements de test. Assurez-vous que l\'intégration Airtel/Moov est prête.', 'Passer en réel'))) return;
    await adm.setSetting('payment_mode', v.mode); await adm.setSetting('plan_price', Number(v.price)); await adm.setSetting('plan_days', Number(v.days));
    toastSuccess('Paramètres enregistrés (rechargez la page d\'accueil pour voir le nouveau tarif).');
  }));
}
