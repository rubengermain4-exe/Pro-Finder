import { html, setHtml } from '../lib/html.js';
import { icon } from '../components/icons.js';
import { stars, emptyState } from '../components/ui.js';
import { avatar } from '../components/businessCard.js';
import { getBusinessBySlug, getBusinessExtras, trackEvent } from '../services/catalog.js';
import { publicUrl } from '../lib/supabase.js';
import { formatXAF, formatDate, safeUrl, waLink, telLink } from '../lib/format.js';
import { openStatus } from '../lib/availability.js';

const DEFAULT_PRIMARY = '#0B1640';
const DEFAULT_ACCENT = '#3DDC97';
const SOCIALS = [
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['tiktok', 'TikTok'],
  ['linkedin', 'LinkedIn'],
  ['youtube', 'YouTube'],
];

const validColor = (value, fallback) =>
  /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;

function priceLabel(item) {
  const from = item.price_from;
  const to = item.price_to;
  if (from == null && to == null) return 'Prix sur demande';
  if (from != null && to != null && Number(from) !== Number(to)) {
    return `De ${formatXAF(from)} à ${formatXAF(to)}`;
  }
  return formatXAF(from ?? to);
}

function contactLinks(business) {
  const phone = business.phone ? telLink(business.phone) : '';
  const whatsapp = business.whatsapp || business.phone;
  const wa = whatsapp ? waLink(whatsapp, `Bonjour, je vous contacte depuis Pro Finder au sujet de ${business.name}.`) : '';
  const email = business.email ? `mailto:${business.email}` : '';
  const website = business.website ? safeUrl(business.website) : '';
  return html`
    <div class="profile-contact-actions">
      ${wa ? html`<a class="btn btn--whatsapp" href="${wa}" target="_blank" rel="noopener noreferrer">${icon('whatsapp', 18)} WhatsApp</a>` : ''}
      ${phone ? html`<a class="btn btn--outline" href="${phone}">${icon('phone', 18)} Appeler</a>` : ''}
      ${email ? html`<a class="btn btn--outline" href="${email}">${icon('mail', 18)} E-mail</a>` : ''}
      ${website ? html`<a class="btn btn--outline" href="${website}" target="_blank" rel="noopener noreferrer">${icon('globe', 18)} Site web</a>` : ''}
    </div>`;
}

function renderServices(items) {
  if (!items.length) return html`<div class="profile-empty-note">Ce professionnel n'a pas encore ajouté de prestation.</div>`;
  return html`<div class="profile-service-grid">${items.map((item) => html`
    <article class="profile-card profile-service-card">
      <div class="profile-service-card__top">
        <span class="profile-item-type">${item.item_type === 'product' ? 'Produit' : 'Prestation'}</span>
        <strong class="profile-service-price">${priceLabel(item)}</strong>
      </div>
      <h3>${item.title}</h3>
      ${item.description ? html`<p>${item.description}</p>` : ''}
    </article>`)}
  </div>`;
}

function renderGallery(images) {
  if (!images.length) return html`<div class="profile-empty-note">La galerie sera bientôt enrichie.</div>`;
  return html`<div class="profile-gallery">${images.map((image) => html`
    <figure class="profile-gallery__item">
      <img src="${image.url || publicUrl('business-media', image.path)}" alt="${image.caption || 'Réalisation du professionnel'}" loading="lazy" />
      ${image.caption ? html`<figcaption>${image.caption}</figcaption>` : ''}
      ${image.is_featured ? html`<span class="profile-gallery__featured">À la une</span>` : ''}
    </figure>`)}
  </div>`;
}

function renderReviews(reviews, stats) {
  const rating = Number(stats?.avg_rating || 0);
  const count = Number(stats?.review_count || reviews.length || 0);
  return html`
    <div class="profile-rating-summary">
      <div class="profile-rating-summary__score">${count ? rating.toFixed(1) : '—'}</div>
      <div>${stars(rating, 18)}<p class="muted small">${count} avis client${count > 1 ? 's' : ''}</p></div>
    </div>
    ${reviews.length ? html`<div class="profile-review-list">${reviews.map((review) => html`
      <article class="profile-card profile-review">
        <div class="row row--between">
          <strong>${review.author_name || 'Client'}</strong>
          <span class="profile-review__date">${formatDate(review.created_at)}</span>
        </div>
        ${stars(review.rating, 15)}
        ${review.comment ? html`<p>${review.comment}</p>` : html`<p class="muted small">Aucun commentaire.</p>`}
      </article>`)}
    </div>` : html`<div class="profile-empty-note">Aucun avis pour le moment. Soyez le premier à partager votre expérience.</div>`}`;
}

function renderAvailability(availability) {
  const days = [
    ['mon', 'Lundi'], ['tue', 'Mardi'], ['wed', 'Mercredi'],
    ['thu', 'Jeudi'], ['fri', 'Vendredi'], ['sat', 'Samedi'], ['sun', 'Dimanche'],
  ];
  if (!availability || !days.some(([key]) => availability[key])) {
    return html`<p class="muted">Les horaires n'ont pas été renseignés.</p>`;
  }
  return html`<div class="profile-hours">${days.map(([key, label]) => {
    const day = availability[key];
    return html`<div class="profile-hours__row"><span>${label}</span><strong>${day?.open && day.from && day.to ? `${day.from} – ${day.to}` : 'Fermé'}</strong></div>`;
  })}</div>`;
}

export async function render({ root, params, navigate }) {
  const slug = params?.slug;
  if (!slug) {
    setHtml(root, html`<div class="container section">${emptyState('Profil introuvable', 'Le lien demandé est incomplet.')}</div>`);
    return;
  }

  const business = await getBusinessBySlug(slug);
  if (!business) {
    setHtml(root, html`<div class="container section">${emptyState('Professionnel introuvable', "Cette fiche n'existe pas ou n'est plus disponible.", html`<p><a class="btn" href="/annuaire">Retour à l'annuaire</a></p>`)}</div>`);
    return;
  }

  const isPublic = business.status === 'approved'
    && business.subscription_ends_at
    && new Date(business.subscription_ends_at).getTime() > Date.now();

  if (!isPublic) {
    setHtml(root, html`<div class="container section">${emptyState('Fiche momentanément indisponible', 'Cette vitrine n’est pas actuellement publiée.', html`<p><a class="btn" href="/annuaire">Consulter l’annuaire</a></p>`)}</div>`);
    return;
  }

  const extras = await getBusinessExtras(business.id);
  trackEvent(business.id, 'view');

  const primary = validColor(business.brand_primary_color, DEFAULT_PRIMARY);
  const accent = validColor(business.brand_accent_color, DEFAULT_ACCENT);
  const coverUrl = business.cover_path ? publicUrl('business-media', business.cover_path) : '';
  const logoUrl = business.logo_path ? publicUrl('business-media', business.logo_path) : '';
  const category = business.category?.name || 'Professionnel';
  const location = [business.location?.name, business.location?.parent?.name].filter(Boolean).join(', ');
  const status = openStatus(business.availability);
  const socials = business.social_links || {};
  const socialLinks = SOCIALS
    .map(([key, label]) => ({ label, url: safeUrl(socials[key]) }))
    .filter((item) => item.url);

  document.title = `${business.name} · Pro Finder`;
  const description = business.tagline || business.description || `Découvrez ${business.name} sur Pro Finder.`;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', description.slice(0, 160));

  setHtml(root, html`
    <div class="profile-page" style="--profile-primary:${primary};--profile-accent:${accent}">
      <section class="profile-showcase">
        <div class="profile-showcase__cover">
          ${coverUrl ? html`<img class="profile-showcase__cover-image" src="${coverUrl}" alt="Couverture de ${business.name}" />` : ''}
          <div class="profile-showcase__shade"></div>
          <div class="container profile-showcase__inner">
            <div class="profile-identity">
              <div class="profile-identity__logo">${logoUrl ? html`<img src="${logoUrl}" alt="Logo de ${business.name}" />` : avatar(business.name, null, 'business-media', true)}</div>
              <div class="profile-identity__text">
                <span class="profile-category">${category}</span>
                <h1>${business.name}</h1>
                ${business.tagline ? html`<p class="profile-tagline">${business.tagline}</p>` : ''}
                <div class="profile-hero-meta">
                  ${location ? html`<span>${icon('pin', 16)} ${location}</span>` : ''}
                  ${extras.stats?.review_count ? html`<span>${stars(extras.stats.avg_rating, 15)} ${Number(extras.stats.avg_rating).toFixed(1)} (${extras.stats.review_count} avis)</span>` : html`<span class="profile-no-rating">Pas encore d'avis</span>`}
                  ${status ? html`<span class="profile-open-status ${status.state === 'open' ? 'is-open' : 'is-closed'}"><i></i>${status.label}</span>` : ''}
                </div>
              </div>
            </div>
            <div class="profile-hero-actions">
              ${business.whatsapp || business.phone ? html`<a class="btn profile-primary-button" href="${waLink(business.whatsapp || business.phone, `Bonjour, je vous contacte depuis Pro Finder au sujet de ${business.name}.`)}" target="_blank" rel="noopener noreferrer">${icon('whatsapp', 18)} Contacter</a>` : ''}
              <a class="btn profile-secondary-button" href="/messages/nouveau/${business.id}">${icon('message', 18)} Envoyer un message</a>
            </div>
          </div>
        </div>
      </section>

      <div class="profile-content">
        <div class="container profile-layout">
          <main class="profile-main-column">
            ${business.description ? html`<section class="profile-card profile-section"><div class="profile-section__heading"><span class="profile-section__icon">${icon('user', 19)}</span><h2>À propos</h2></div><p class="profile-description">${business.description}</p></section>` : ''}

            <section class="profile-section">
              <div class="profile-section__heading"><span class="profile-section__icon">${icon('grid', 19)}</span><div><h2>Prestations et produits</h2><p>Découvrez ce que propose ${business.name}.</p></div></div>
              ${renderServices(extras.services || [])}
            </section>

            <section class="profile-section">
              <div class="profile-section__heading"><span class="profile-section__icon">${icon('image', 19)}</span><div><h2>Galerie</h2><p>Quelques réalisations et images de l'activité.</p></div></div>
              ${renderGallery(extras.images || [])}
            </section>

            <section class="profile-section">
              <div class="profile-section__heading"><span class="profile-section__icon">${icon('star', 19)}</span><div><h2>Avis clients</h2><p>Les retours des clients de ${business.name}.</p></div></div>
              ${renderReviews(extras.reviews || [], extras.stats || {})}
            </section>
          </main>

          <aside class="profile-side-column">
            <section class="profile-card profile-side-card">
              <h2>Contacter ce professionnel</h2>
              ${contactLinks(business)}
              ${business.address ? html`<div class="profile-side-info"><span>${icon('pin', 17)}</span><div><strong>Adresse</strong><p>${business.address}${location ? html`<br />${location}` : ''}</p></div></div>` : ''}
              ${business.email ? html`<div class="profile-side-info"><span>${icon('mail', 17)}</span><div><strong>E-mail</strong><p>${business.email}</p></div></div>` : ''}
              ${business.website ? html`<div class="profile-side-info"><span>${icon('globe', 17)}</span><div><strong>Site web</strong><p><a href="${safeUrl(business.website)}" target="_blank" rel="noopener noreferrer">Visiter le site</a></p></div></div>` : ''}
              ${socialLinks.length ? html`<div class="profile-socials"><strong>Réseaux sociaux</strong><div>${socialLinks.map((item) => html`<a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.label}</a>`)}</div></div>` : ''}
            </section>

            <section class="profile-card profile-side-card">
              <div class="profile-section__heading"><span class="profile-section__icon">${icon('clock', 19)}</span><h2>Horaires</h2></div>
              ${renderAvailability(business.availability)}
            </section>
            <a class="profile-back-link" href="/annuaire">${icon('arrow', 16)} Retour à l'annuaire</a>
          </aside>
        </div>
      </div>
    </div>`);

  return () => {
    // Aucun écouteur persistant à libérer sur cette page.
  };
}
