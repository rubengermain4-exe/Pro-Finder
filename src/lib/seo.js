// Métadonnées dynamiques (description, Open Graph, URL canonique, données structurées JSON-LD).
let defaults = null;

function meta(attr, name) {
  let el = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.append(el); }
  return el;
}
function remember() {
  if (defaults) return;
  defaults = { description: document.head.querySelector('meta[name="description"]')?.content || '' };
}

export function setSeo({ title, description, image, url = window.location.href, type = 'website' } = {}) {
  remember();
  if (title) { document.title = title; meta('property', 'og:title').content = title; }
  if (description) {
    const d = description.replace(/\s+/g, ' ').trim().slice(0, 160);
    meta('name', 'description').content = d; meta('property', 'og:description').content = d;
  }
  if (image) meta('property', 'og:image').content = image;
  meta('property', 'og:type').content = type;
  meta('property', 'og:url').content = url;
  meta('property', 'og:site_name').content = 'Pro Finder';
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.append(link); }
  link.href = url.split('#')[0];
}

export function jsonLdString(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
export function setJsonLd(data) {
  let el = document.getElementById('pf-jsonld');
  if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = 'pf-jsonld'; document.head.append(el); }
  el.textContent = jsonLdString(data);
}

/** À appeler à chaque changement de page : retire ce qui est propre à la page précédente. */
export function resetSeo() {
  remember();
  document.getElementById('pf-jsonld')?.remove();
  document.head.querySelector('meta[property="og:image"]')?.remove();
  document.head.querySelector('link[rel="canonical"]')?.remove();
  meta('name', 'description').content = defaults.description;
  meta('property', 'og:description').content = defaults.description;
}
