import { html, setHtml, raw } from '../lib/html.js';
import { icon } from '../components/icons.js';
import { avatar } from '../components/businessCard.js';
import { emptyState, stars, openModal, options, businessStatusBadge } from '../components/ui.js';
import { getBusinessBySlug, getBusinessExtras, trackEvent } from '../services/catalog.js';
import { isFavorite, setFavorite, listEligibleReviews, submitReview, reportTarget } from '../services/account.js';
import { getAuth } from '../state/auth.js';
import { waLink, telLink, safeUrl, formatXAF, formatDate } from '../lib/format.js';
import { DAYS, validateReview } from '../lib/validators.js';
import { on, formValues, showFieldErrors, withBusy } from '../lib/dom.js';
import { toastSuccess, toastError, friendlyError } from '../lib/toast.js';
import { config } from '../config.js';
import { publicUrl } from '../lib/supabase.js';
import { openStatus } from '../lib/availability.js';
import { addRecent } from '../lib/recent.js';
import { setSeo, setJsonLd } from '../lib/seo.js';

/** Données structurées schema.org pour les moteurs de recherche. */
function localBusinessLd(b, extras, place, logoUrl, hasHours, av) {
  const dayNames = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  const data = {
    '@context': 'https://schema.org', '@type': 'LocalBusiness', name: b.name, url: window.location.href,
    description: b.tagline || b.description || undefined, image: logoUrl || undefined,
    telephone: b.phone || b.whatsapp || undefined, email: b.email || undefined,
    address: { '@type': 'PostalAddress', streetAddress: b.address || undefined, addressLocality: place || undefined, addressCountry: 'GA' },
  };
  if (extras.stats.review_count > 0) data.aggregateRating = { '@type': 'AggregateRating', ratingValue: Number(extras.stats.avg_rating).toFixed(1), reviewCount: extras.stats.review_count };
  if (hasHours) data.openingHoursSpecification = Object.entries(dayNames).filter(([k]) => av[k]?.open).map(([k, d]) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: d, opens: av[k].from, closes: av[k].to }));
  return data;
}

const REASONS = [
  { value: 'fraude', label: 'Arnaque ou fraude' }, { value: 'usurpation', label: "Usurpation d'identité" },
  { value: 'contenu_inapproprie', label: 'Contenu inapproprié' }, { value: 'faux_avis', label: 'Faux avis' },
  { value: 'metier_sensible', label: 'Métier réglementé sans justificatif' }, { value: 'autre', label: 'Autre' },
];

const contrastFor = (hex) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 150 ? '#0B1640' : '#FFFFFF';
};

const price = (s) => {
  if (s.price_from != null && s.price_to != null) return `${formatXAF(s.price_from)} – ${formatXAF(s.price_to)}`;
  if (s.price_from != null) return `À partir de ${formatXAF(s.price_from)}`;
  return 'Sur devis';
};

export async function render({ root, params, navigate }) {
  const b = await getBusinessBySlug(params.slug);
  if (!b) { setHtml(root, html`<div class="container section center">${emptyState('Professionnel introuvable', "Cette fiche n'existe pas ou n'est pas publique actuellement.", html`<p><a class="btn" href="/annuaire">Voir l'annuaire</a></p>`)}</div>`); return undefined; }

  const auth = getAuth();
  const isOwner = auth.user?.id === b.owner_id;
  const isPublic = b.status === 'approved' && b.subscription_ends_at && new Date(b.subscription_ends_at) > new Date();
  const [extras, fav, eligible] = await Promise.all([
    getBusinessExtras(b.id),
    isFavorite(b.id).catch(() => false),
    auth.user && !isOwner ? listEligibleReviews().catch(() => []) : [],
  ]);
  const canReview = eligible.some((e) => e.business_id === b.id);
  document.title = `${b.name} · Pro Finder`;
  if (isPublic && !isOwner) trackEvent(b.id, 'view');

  const wa = waLink(b.whatsapp || b.phone, `Bonjour, je vous contacte depuis Pro Finder.`, config.countryCode);
  const tel = telLink(b.phone || b.whatsapp, config.countryCode);
  const place = [b.location?.name, b.location?.parent?.name].filter(Boolean).join(', ');
  const av = b.availability || {};
  const hasHours = DAYS.some(([k]) => av[k]);
  const status = hasHours ? openStatus(av) : null;
  const logoUrl = b.logo_path ? publicUrl('business-media', b.logo_path) : '';
  const coverUrl = b.cover_path ? publicUrl('business-media', b.cover_path) : '';
  const brandPrimary = /^#[0-9a-f]{6}$/i.test(b.brand_primary_color || '') ? b.brand_primary_color : '#0B1640';
  const brandAccent = /^#[0-9a-f]{6}$/i.test(b.brand_accent_color || '') ? b.brand_accent_color : '#3DDC97';
  const onPrimary = contrastFor(brandPrimary);
  const onAccent = contrastFor(brandAccent);
  const galleryImages = [...extras.images].sort((a, c) => Number(Boolean(c.is_featured)) - Number(Boolean(a.is_featured)));
  const socials = Object.entries(b.social_links || {}).map(([key, value]) => ({ key, url: safeUrl(value), label: ({ facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube' })[key] || key })).filter((x) => x.url);
  if (isPublic) {
    setSeo({
      title: `${b.name}${b.category ? ` · ${b.category.name}` : ''}${place ? ` à ${place}` : ''} · Pro Finder`,
      description: b.tagline || b.description || `${b.name} sur Pro Finder, l'annuaire des professionnels du Gabon.`,
      image: coverUrl || logoUrl, type: 'profile',
    });
    setJsonLd(localBusinessLd(b, extras, place, coverUrl || logoUrl, hasHours, av));
    if (!isOwner) addRecent({ slug: b.slug, kind: b.kind, name: b.name, tagline: b.tagline || '', category_name: b.category?.name || '', location_name: place, logo_path: b.logo_path || '' });
  }

  const contactButtons = (cls = '') => isOwner ? '' : html`
    ${wa ? html`<a class="btn btn--whatsapp ${cls}" href="${wa}" target="_blank" rel="noopener noreferrer" data-track="whatsapp">${icon('whatsapp', 20)} WhatsApp</a>` : ''}
    ${tel ? html`<a class="btn ${cls}" href="${tel}" data-track="phone">${icon('phone', 20)} Appeler</a>` : ''}
    <a class="btn btn--gold ${cls}" href="/messages/nouveau/${b.id}">${icon('message', 20)} Message</a>`;

  setHtml(root, html`
    <div class="profile-page" style="--profile-primary:${brandPrimary};--profile-accent:${brandAccent};--profile-on-primary:${onPrimary};--profile-on-accent:${onAccent}">
      <section class="profile-showcase">
        <div class="profile-showcase__cover">
          ${coverUrl ? html`<img class="profile-showcase__cover-image" src="${coverUrl}" alt="Couverture de ${b.name}" />` : ''}
          <div class="profile-showcase__shade"></div>
          <div class="container profile-showcase__inner">
            <div class="profile-showcase__identity">
              ${avatar(b.name, b.logo_path, 'business-media', true)}
              <div class="profile-showcase__copy">
                <h1>${b.name}</h1>
                ${b.tagline ? html`<p class="profile-showcase__tagline">${b.tagline}</p>` : ''}
                <div class="meta">
                  ${b.category ? html`<span>${icon('tool', 16)} ${b.category.name}</span>` : ''}
                  ${place ? html`<span>${icon('pin', 16)} ${place}</span>` : ''}
                  ${extras.stats.review_count > 0 ? html`<span>${stars(extras.stats.avg_rating, 15)} ${Number(extras.stats.avg_rating).toFixed(1)} (${extras.stats.review_count} avis)</span>` : html`<span>Pas encore d'avis</span>`}
                  ${b.kind === 'entreprise' ? html`<span>${icon('home', 16)} Entreprise</span>` : ''}
                  ${status ? html`<span class="open-badge open-badge--${status.state}">${status.label}</span>` : ''}
                </div>
              </div>
            </div>
            <div class="profile-showcase__actions">
              <button class="btn btn--light btn--sm" id="share" type="button">${icon('share', 18)} <span>Partager</span></button>
              ${isOwner ? '' : html`<button class="btn btn--light btn--sm" id="fav" type="button" aria-pressed="${fav}">${icon('heart', 18, { filled: fav })} <span>${fav ? 'Favori' : 'Ajouter aux favoris'}</span></button>`}
            </div>
          </div>
        </div>
      </section>
      <div class="container section--tight profile-content">
        ${isOwner ? html`<div class="alert alert--info">Aperçu de votre vitrine · Statut : ${businessStatusBadge(b.status)} ${!isPublic ? html`— elle n'est pas encore visible du public (validation ou abonnement requis). <a href="/espace-pro/vitrine">Personnaliser ma vitrine</a>` : ''}</div>` : ''}
        ${b.category?.is_sensitive ? html`<div class="alert alert--warn" role="note"><strong>Métier sensible.</strong> Demandez les références et justificatifs du professionnel avant toute prestation. Pro Finder ne vérifie pas les diplômes.</div>` : ''}
        <div class="profile profile--showcase">
          <div class="profile-main">
            ${galleryImages.length ? html`<section class="panel showcase-public-gallery"><div class="section-heading"><div><span class="eyebrow">En images</span><h2>Nos réalisations & produits</h2></div><span class="small muted">${galleryImages.length} photo${galleryImages.length > 1 ? 's' : ''}</span></div>
              <div class="showcase-public-gallery__grid">
                <button class="showcase-public-gallery__featured" type="button" data-img="0" aria-label="Agrandir l'image principale"><img src="${galleryImages[0].url}" alt="${galleryImages[0].caption || `Image principale de ${b.name}`}" loading="lazy" />${galleryImages[0].caption ? html`<span>${galleryImages[0].caption}</span>` : ''}</button>
                ${galleryImages.length > 1 ? html`<div class="showcase-public-gallery__thumbs">${galleryImages.slice(1).map((i, n) => html`<button type="button" data-img="${n + 1}" aria-label="Agrandir l'image ${n + 2}"><img src="${i.url}" alt="${i.caption || `Photo ${n + 2} de ${b.name}`}" loading="lazy" /></button>`)}</div>` : ''}
              </div>
            </section>` : ''}
            <section class="panel showcase-about"><span class="eyebrow">Qui sommes-nous ?</span><h2>Présentation</h2><p style="white-space:pre-line">${b.description || 'Aucune présentation détaillée pour le moment.'}</p></section>
            <section class="panel showcase-catalog"><div class="section-heading"><div><span class="eyebrow">Notre offre</span><h2>Prestations & produits</h2></div></div>
              ${extras.services.length ? html`<div class="showcase-catalog__grid">${extras.services.map((item) => html`<article class="showcase-catalog-card"><span class="showcase-catalog-card__type">${item.item_type === 'product' ? 'Produit' : 'Prestation'}</span><h3>${item.title}</h3>${item.description ? html`<p>${item.description}</p>` : ''}<strong>${price(item)}</strong></article>`)}</div>` : html`<p class="muted">Aucun produit ou service détaillé pour le moment. Contactez le professionnel pour en savoir plus.</p>`}
            </section>
            ${hasHours ? html`<section class="panel"><h2>Disponibilités</h2><table class="hours"><tbody>${DAYS.map(([k, l]) => html`<tr><td>${l}</td><td>${av[k]?.open ? `${av[k].from} – ${av[k].to}` : 'Fermé'}</td></tr>`)}</tbody></table>${av.note ? html`<p class="small muted" style="margin:6px 0 0">${av.note}</p>` : ''}</section>` : ''}
            <section class="panel" id="avis"><div class="section-heading"><div><span class="eyebrow">Expériences clients</span><h2>Avis clients (${extras.stats.review_count})</h2></div>${extras.stats.review_count ? html`<strong class="showcase-rating">${Number(extras.stats.avg_rating).toFixed(1)} / 5</strong>` : ''}</div>
              ${extras.reviews.length ? extras.reviews.map((r) => html`<article class="review"><div class="row row--between"><strong>${r.author_name}</strong><span class="small muted">${formatDate(r.created_at)}</span></div>${stars(r.rating, 15)}${r.comment ? html`<p style="margin:6px 0 0">${r.comment}</p>` : ''}</article>`) : html`<p class="muted">Aucun avis pour le moment. Les avis sont déposés uniquement par des clients ayant échangé avec le professionnel.</p>`}
              ${canReview ? html`<form id="review-form" class="stack" style="margin-top:18px" novalidate>
                <h3>Donner votre avis</h3>
                <div class="field"><span class="label" id="rl">Votre note</span><div class="rating-input" role="radiogroup" aria-labelledby="rl">${[1, 2, 3, 4, 5].map((n) => html`<button type="button" data-rate="${n}" aria-label="${n} sur 5">${icon('star', 28, { filled: false })}</button>`)}</div><input type="hidden" name="rating" value="" /><span class="field__error" data-error-for="rating"></span></div>
                <div class="field"><label for="rv-c">Commentaire (facultatif)</label><textarea class="textarea" id="rv-c" name="comment" maxlength="1000"></textarea><span class="field__error" data-error-for="comment"></span></div>
                <button class="btn" type="submit">Publier mon avis</button></form>` : ''}
            </section>
          </div>
          <aside class="profile-aside">
            <div class="panel contact-box">
              <span class="eyebrow">Parlons de votre projet</span><h2 style="margin:0">Contacter</h2>
              ${isPublic || isOwner ? contactButtons('btn--block') : html`<p class="muted">Ce professionnel n'est pas joignable actuellement.</p>`}
              <hr style="border:0;border-top:1px solid var(--line);width:100%" />
              ${b.address ? html`<div class="small">${icon('pin', 16)} ${b.address}</div>` : ''}
              ${b.email ? html`<div class="small">${icon('mail', 16)} <a href="mailto:${b.email}">${b.email}</a></div>` : ''}
              ${safeUrl(b.website) ? html`<div class="small">${icon('globe', 16)} <a href="${safeUrl(b.website)}" target="_blank" rel="noopener noreferrer nofollow">Site web</a></div>` : ''}
              ${socials.length ? html`<div class="showcase-socials"><h3>Retrouvez-nous</h3><div>${socials.map((social) => html`<a href="${social.url}" target="_blank" rel="noopener noreferrer nofollow">${social.label}</a>`)}</div></div>` : ''}
              ${isOwner ? html`<a class="btn btn--ghost btn--block" href="/espace-pro/vitrine">${icon('palette',16)} Personnaliser ma vitrine</a>` : html`<button class="link-btn small" id="report" type="button">${icon('flag',14)} Signaler cette fiche</button>`}
            </div>
          </aside>
        </div>
      </div>
      ${(isPublic && !isOwner) ? html`<div class="mobile-contact-bar">${contactButtons('btn--sm')}</div>` : ''}
    </div>`);

  const offs = [];
  offs.push(on(root, 'click', '[data-track]', (e, el) => trackEvent(b.id, el.dataset.track)));
  offs.push(on(root, 'click', '[data-img]', (e, el) => {
    const imgs = galleryImages; let i = Number(el.dataset.img);
    const box = document.createElement('div'); box.className = 'lightbox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Image agrandie');
    const draw = () => { box.innerHTML = ''; const im = document.createElement('img'); im.src = imgs[i].url; im.alt = imgs[i].caption || b.name; const c = document.createElement('button'); c.className = 'btn btn--light btn--sm'; c.textContent = 'Fermer'; c.onclick = () => box.remove(); box.append(im, c); };
    draw(); box.addEventListener('click', (ev) => { if (ev.target === box) box.remove(); });
    document.addEventListener('keydown', function k(ev) { if (!document.body.contains(box)) { document.removeEventListener('keydown', k); return; } if (ev.key === 'Escape') box.remove(); if (ev.key === 'ArrowRight') { i = (i + 1) % imgs.length; draw(); } if (ev.key === 'ArrowLeft') { i = (i - 1 + imgs.length) % imgs.length; draw(); } });
    document.body.appendChild(box);
  }));

  const requireLogin = () => { if (auth.user) return true; navigate(`/connexion?next=${encodeURIComponent(window.location.pathname)}`); return false; };
  const shareBtn = root.querySelector('#share');
  if (shareBtn) shareBtn.addEventListener('click', async () => {
    const data = { title: b.name, text: b.tagline || `${b.name} sur Pro Finder`, url: window.location.href.split('#')[0] };
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(data.url);
      toastSuccess('Lien copié dans le presse-papiers.');
    } catch (err) {
      if (err?.name !== 'AbortError') toastError('Impossible de partager. Copiez le lien depuis la barre d\'adresse.');
    }
  });

  const favBtn = root.querySelector('#fav');
  if (favBtn) favBtn.addEventListener('click', async () => {
    if (!requireLogin()) return;
    const next = favBtn.getAttribute('aria-pressed') !== 'true';
    try {
      await setFavorite(b.id, next);
      favBtn.setAttribute('aria-pressed', String(next));
      setHtml(favBtn, html`${icon('heart', 18, { filled: next })} <span>${next ? 'Favori' : 'Ajouter aux favoris'}</span>`);
    } catch (err) { toastError(friendlyError(err)); }
  });

  const reportBtn = root.querySelector('#report');
  if (reportBtn) reportBtn.addEventListener('click', () => {
    if (!requireLogin()) return;
    const { el, close } = openModal(html`<h3>Signaler cette fiche</h3>
      <form novalidate><div class="field"><label for="rp-r">Motif</label><select class="select" id="rp-r" name="reason">${options(REASONS, 'fraude')}</select></div>
      <div class="field"><label for="rp-d">Précisions</label><textarea class="textarea" id="rp-d" name="details" maxlength="1000"></textarea></div>
      <div class="row"><button class="btn" type="submit">Envoyer le signalement</button><button class="btn btn--ghost" type="button" data-close>Annuler</button></div></form>`, { label: 'Signaler' });
    el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault(); const v = formValues(e.target);
      await withBusy(e.target.querySelector('button[type=submit]'), async () => {
        try { await reportTarget({ targetType: 'business', targetId: b.id, reason: v.reason, details: v.details }); toastSuccess('Signalement envoyé. Merci, notre équipe va examiner la fiche.'); close(); }
        catch (err) { toastError(/duplicate/.test(err.message) ? 'Vous avez déjà signalé cette fiche.' : friendlyError(err)); }
      });
    });
  });

  const rf = root.querySelector('#review-form');
  if (rf) {
    rf.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-rate]'); if (!btn) return;
      const n = Number(btn.dataset.rate); rf.rating.value = n;
      rf.querySelectorAll('[data-rate]').forEach((x) => { const on_ = Number(x.dataset.rate) <= n; x.classList.toggle('on', on_); x.querySelector('svg').setAttribute('fill', on_ ? 'currentColor' : 'none'); });
    });
    rf.addEventListener('submit', async (e) => {
      e.preventDefault(); const v = formValues(rf);
      if (!showFieldErrors(rf, validateReview({ rating: Number(v.rating), comment: v.comment }))) return;
      await withBusy(rf.querySelector('button[type=submit]'), async () => {
        try { await submitReview({ businessId: b.id, rating: v.rating, comment: v.comment }); toastSuccess('Merci pour votre avis !'); navigate(window.location.pathname, { replace: true }); window.location.reload(); }
        catch (err) { toastError(friendlyError(err)); }
      });
    });
  }
  return () => offs.forEach((f) => f());
}
