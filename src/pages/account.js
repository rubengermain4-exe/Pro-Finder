import { html, setHtml, raw } from '../lib/html.js';
import { icon } from '../components/icons.js';
import { businessGrid } from '../components/businessCard.js';
import { emptyState, loader, stars } from '../components/ui.js';
import { getAuth, updateProfile, updatePassword } from '../state/auth.js';
import * as acc from '../services/account.js';
import { validatePassword, isPhone, validateReview } from '../lib/validators.js';
import { formValues, showFieldErrors, withBusy, on } from '../lib/dom.js';
import { toastSuccess, toastError, friendlyError } from '../lib/toast.js';
import { formatDate, timeAgo } from '../lib/format.js';
import { avatar } from '../components/businessCard.js';
import { refreshCounts } from '../app.js';

const SECTIONS = [['profil', 'Mon profil', 'user'], ['favoris', 'Mes favoris', 'heart'], ['avis', 'Mes avis', 'star'], ['notifications', 'Notifications', 'bell']];
const err = (n) => html`<span class="field__error" data-error-for="${n}"></span>`;

export async function render({ root, params, navigate }) {
  const section = params.section || 'profil';
  if (!SECTIONS.some(([k]) => k === section)) { navigate('/compte', { replace: true }); return undefined; }
  const p = getAuth().profile;
  setHtml(root, html`<div class="container dash">
    <nav class="side" aria-label="Mon compte">${SECTIONS.map(([k, l, ic]) => html`<a href="/compte/${k}" ${k === section ? html`aria-current="page"` : ''}>${icon(ic, 18)} ${l}</a>`)}<hr /><a href="/messages">${icon('message', 18)} Messagerie</a>${p.role === 'professionnel' ? html`<a href="/espace-pro">${icon('grid', 18)} Espace pro</a>` : ''}</nav>
    <div class="dash__main" id="main">${loader()}</div></div>`);
  const main = root.querySelector('#main');
  const offs = [];

  if (section === 'profil') {
    setHtml(main, html`<h1>Mon profil</h1>
      <form class="panel" id="pf" novalidate style="max-width:560px">
        <div class="row" style="margin-bottom:16px">${avatar(p.full_name, p.avatar_path, 'avatars')}<div><label class="btn btn--ghost btn--sm" for="av">Changer la photo</label><input id="av" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" /></div></div>
        <div class="field"><label for="p-n">Nom complet</label><input class="input" id="p-n" name="full_name" maxlength="120" value="${p.full_name}" />${err('full_name')}</div>
        <div class="field"><label for="p-t">Téléphone</label><input class="input" id="p-t" name="phone" type="tel" maxlength="30" value="${p.phone || ''}" />${err('phone')}</div>
        <p class="small muted">E-mail : ${getAuth().user.email}</p>
        <button class="btn" type="submit">Enregistrer</button></form>
      <form class="panel" id="pw" novalidate style="max-width:560px"><h2>Changer le mot de passe</h2>
        <div class="field"><label for="n-p">Nouveau mot de passe</label><input class="input" id="n-p" name="password" type="password" autocomplete="new-password" />${err('password')}</div>
        <button class="btn btn--ghost" type="submit">Mettre à jour</button></form>`);
    const pf = main.querySelector('#pf');
    pf.addEventListener('submit', async (e) => {
      e.preventDefault(); const v = formValues(pf); const errors = {};
      if (v.full_name.length < 2) errors.full_name = 'Indiquez votre nom.'; if (v.phone && !isPhone(v.phone)) errors.phone = 'Numéro invalide.';
      if (!showFieldErrors(pf, errors)) return;
      await withBusy(pf.querySelector('button[type=submit]'), async () => { try { await updateProfile({ full_name: v.full_name, phone: v.phone || null }); toastSuccess('Profil enregistré.'); } catch (x) { toastError(friendlyError(x)); } });
    });
    main.querySelector('#av').addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try { await acc.uploadAvatar(file); await updateProfile({}); toastSuccess('Photo mise à jour.'); navigate('/compte/profil', { replace: true }); window.location.reload(); } catch (x) { toastError(x.message?.includes('Format') || x.message?.includes('lourde') ? x.message : friendlyError(x)); }
    });
    const pw = main.querySelector('#pw');
    pw.addEventListener('submit', async (e) => {
      e.preventDefault(); const v = formValues(pw); const m = validatePassword(v.password);
      if (!showFieldErrors(pw, m ? { password: m } : {})) return;
      await withBusy(pw.querySelector('button[type=submit]'), async () => { try { await updatePassword(v.password); pw.reset(); toastSuccess('Mot de passe mis à jour.'); } catch (x) { toastError(friendlyError(x)); } });
    });
  }

  if (section === 'favoris') {
    const favs = await acc.listFavorites();
    setHtml(main, html`<h1>Mes favoris</h1>${favs.length ? businessGrid(favs.map((f) => ({ ...f, category_name: f.category?.name, location_name: f.location?.name }))) : emptyState('Aucun favori', "Ajoutez des professionnels en favoris depuis leur fiche pour les retrouver ici.", html`<a class="btn" href="/annuaire">Parcourir l'annuaire</a>`)}`);
  }

  if (section === 'avis') {
    const [eligible, mine] = await Promise.all([acc.listEligibleReviews(), acc.listMyReviews()]);
    const draw = () => {};
    setHtml(main, html`<h1>Mes avis</h1>
      <h2>Avis à donner</h2>
      ${eligible.length ? eligible.map((b) => html`<form class="panel review-form" data-b="${b.business_id}" novalidate><h3><a href="/pro/${b.slug}">${b.name}</a></h3><div class="rating-input" role="radiogroup" aria-label="Note">${[1, 2, 3, 4, 5].map((n) => html`<button type="button" data-rate="${n}" aria-label="${n} sur 5">${icon('star', 26)}</button>`)}</div><input type="hidden" name="rating" /><span class="field__error" data-error-for="rating"></span><div class="field" style="margin-top:10px"><label>Commentaire (facultatif)<textarea class="textarea" name="comment" maxlength="1000"></textarea></label></div><button class="btn btn--sm" type="submit">Publier</button></form>`) : html`<p class="muted">Vous pourrez donner votre avis après avoir échangé avec un professionnel qui vous a répondu.</p>`}
      <h2 style="margin-top:28px">Mes avis publiés</h2>
      ${mine.length ? mine.map((r) => html`<div class="panel"><div class="row row--between"><strong>${r.business?.name}</strong><span class="small muted">${formatDate(r.created_at)}</span></div>${stars(r.rating)} ${r.status === 'hidden' ? html`<span class="badge badge--warn">Masqué par la modération</span>` : ''}<p style="margin:6px 0">${r.comment || ''}</p><button class="link-btn small" data-del="${r.id}">Supprimer</button></div>`) : html`<p class="muted">Aucun avis publié.</p>`}`);
    void draw;
    offs.push(on(main, 'click', '[data-rate]', (e, btn) => {
      const f = btn.closest('form'); const n = Number(btn.dataset.rate); f.rating.value = n;
      f.querySelectorAll('[data-rate]').forEach((x) => { const o = Number(x.dataset.rate) <= n; x.classList.toggle('on', o); x.querySelector('svg').setAttribute('fill', o ? 'currentColor' : 'none'); });
    }));
    offs.push(on(main, 'submit', '.review-form', async (e, f) => {
      e.preventDefault(); const v = formValues(f);
      if (!showFieldErrors(f, validateReview({ rating: Number(v.rating), comment: v.comment }))) return;
      await withBusy(f.querySelector('button[type=submit]'), async () => { try { await acc.submitReview({ businessId: f.dataset.b, rating: v.rating, comment: v.comment }); toastSuccess('Avis publié, merci !'); navigate('/compte/avis', { replace: true }); window.location.reload(); } catch (x) { toastError(friendlyError(x)); } });
    }));
    offs.push(on(main, 'click', '[data-del]', async (e, b) => { try { await acc.deleteReview(b.dataset.del); toastSuccess('Avis supprimé.'); window.location.reload(); } catch (x) { toastError(friendlyError(x)); } }));
  }

  if (section === 'notifications') {
    const list = await acc.listNotifications();
    setHtml(main, html`<div class="row row--between"><h1>Notifications</h1>${list.some((n) => !n.is_read) ? html`<button class="btn btn--ghost btn--sm" id="mark">Tout marquer comme lu</button>` : ''}</div>
      ${list.length ? list.map((n) => html`<div class="panel" style="${n.is_read ? 'opacity:.7' : ''}"><strong>${n.title}</strong> ${n.is_read ? '' : html`<span class="badge badge--warn">Nouveau</span>`}${n.body ? html`<p class="small" style="margin:4px 0">${n.body}</p>` : ''}<span class="small muted">${timeAgo(n.created_at)}</span> ${n.link && n.link.startsWith('/') ? html`<a class="small" href="${n.link}">Ouvrir</a>` : ''}</div>`) : emptyState('Aucune notification')}`);
    main.querySelector('#mark')?.addEventListener('click', async () => { try { await acc.markNotificationsRead(); await refreshCounts(); navigate('/compte/notifications', { replace: true }); } catch (x) { toastError(friendlyError(x)); } });
  }
  return () => offs.forEach((f) => f());
}
