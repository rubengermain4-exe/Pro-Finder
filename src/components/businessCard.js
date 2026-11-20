import { html } from '../lib/html.js';
import { icon } from './icons.js';
import { stars } from './ui.js';
import { publicUrl } from '../lib/supabase.js';
import { initials } from '../lib/format.js';

export function avatar(name, logoPath, bucket = 'business-media', large = false) {
  const url = logoPath ? publicUrl(bucket, logoPath) : '';
  return html`<span class="avatar ${large ? 'avatar--lg' : ''}">${url ? html`<img src="${url}" alt="" loading="lazy" />` : initials(name)}</span>`;
}

/** Accepte une ligne de search_businesses() ou une fiche issue d'une jointure (favoris). */
export function businessCard(b) {
  const category = b.category_name ?? b.category?.name;
  const place = b.location_name ?? b.location?.name;
  const href = `${b.kind === 'entreprise' ? '/entreprise' : '/pro'}/${b.slug}`;
  const rating = Number(b.avg_rating);
  return html`
    <a class="biz-card" href="${href}">
      <div class="biz-card__top">
        ${avatar(b.name, b.logo_path)}
        <div>
          <h3>${b.name}</h3>
          ${category ? html`<span class="badge">${category}</span>` : ''}
        </div>
      </div>
      ${b.tagline ? html`<p>${b.tagline}</p>` : ''}
      <div class="biz-card__meta">
        ${place ? html`<span>${icon('pin', 15)} ${place}</span>` : ''}
        ${rating ? html`<span>${stars(rating, 14)} ${rating.toFixed(1)} (${b.review_count})</span>` : html`<span class="muted">Pas encore d'avis</span>`}
        ${b.kind === 'entreprise' ? html`<span>${icon('home', 15)} Entreprise</span>` : ''}
      </div>
    </a>`;
}

export function businessGrid(rows) {
  return html`<div class="biz-grid">${rows.map(businessCard)}</div>`;
}
