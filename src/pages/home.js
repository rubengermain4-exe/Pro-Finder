import { html, setHtml, raw } from '../lib/html.js';
import { icon } from '../components/icons.js';
import { businessGrid } from '../components/businessCard.js';
import { emptyState, options } from '../components/ui.js';
import { getCategories, getLocations, getSettings, searchBusinesses, getAds } from '../services/catalog.js';
import { formatXAF } from '../lib/format.js';
import { buildQuery } from '../lib/router.js';
import { safeUrl } from '../lib/format.js';
import { avatar } from '../components/businessCard.js';
import { getRecent, clearRecent } from '../lib/recent.js';
import { setJsonLd } from '../lib/seo.js';

const FAQ = [
  ['Est-ce gratuit pour les clients ?', "Oui. Chercher, comparer et contacter un professionnel est entièrement gratuit pour les particuliers et les entreprises qui recherchent un prestataire."],
  ['Comment sont choisis les professionnels affichés ?', "Chaque fiche est validée par l'équipe avant sa publication. Les avis ne peuvent être déposés qu'après un échange réel entre le client et le professionnel."],
  ['Comment contacter un professionnel ?', "Depuis sa fiche, par appel, WhatsApp ou messagerie privée. Vous échangez directement, sans intermédiaire ni commission."],
  ['Puis-je signaler un problème ?', "Oui, chaque fiche comporte un bouton « Signaler cette fiche ». Notre équipe examine les signalements."],
  ['Je suis professionnel : que dois-je faire ?', "Créez un compte professionnel, complétez votre fiche (prestations, photos, horaires), puis activez votre abonnement pour être visible."],
];

const safe = (p, fallback) => p.catch((e) => { console.error(e); return fallback; });

export async function render({ root, navigate }) {
  const [cats, locs, settings, popular, recent, ads] = await Promise.all([
    safe(getCategories(), []), safe(getLocations(), []), getSettings(),
    safe(searchBusinesses({ sort: 'popular', limit: 6 }), { rows: [] }),
    safe(searchBusinesses({ sort: 'recent', limit: 6 }), { rows: [] }),
    safe(getAds('home_banner'), []),
  ]);
  const tops = cats.filter((c) => !c.parent_id);
  const provinces = locs.filter((l) => !l.parent_id);
  const catOptions = tops.map((t) => ({ top: t, kids: cats.filter((c) => c.parent_id === t.id) }));
  const ad = ads[0];
  const seen = getRecent();
  const recentBlock = seen.length ? html`
    <section class="section section--tight" id="recent-block" aria-labelledby="seen-title">
      <div class="container">
        <div class="section__head"><h2 id="seen-title">Consultés récemment</h2><button type="button" class="link-btn small" id="clear-recent">Effacer l'historique</button></div>
        <div class="recent-row">${seen.map((r) => html`<a class="recent-item" href="${r.kind === 'entreprise' ? '/entreprise' : '/pro'}/${r.slug}">${avatar(r.name, r.logo_path)}<span><strong>${r.name}</strong><small>${[r.category_name, r.location_name].filter(Boolean).join(' · ')}</small></span></a>`)}</div>
      </div>
    </section>` : '';

  setHtml(root, html`
    <section class="hero" aria-labelledby="hero-title">
      <div class="container hero__inner">
        <div class="hero__copy">
          <div class="hero__badge"><span class="flag-icon">🇬🇦</span> Plateforme professionnelle du Gabon</div>
          <h1 id="hero-title">Trouvez le bon professionnel, <br/><span class="text-gradient">en toute confiance.</span></h1>
          <p class="lead">Pro Finder vous connecte aux meilleurs professionnels près de chez vous. Simple, rapide et sécurisé.</p>

          <form class="search-card" id="hero-search" role="search" aria-label="Rechercher un professionnel">
            <div class="search-field">
              ${icon('search', 20)}
              <input class="input-clean" id="hs-q" name="q" type="search" placeholder="Quel service recherchez-vous ?" autocomplete="off" maxlength="80" />
            </div>
            <div class="search-divider"></div>
            <div class="search-field select-field">
              ${icon('mapPin', 18)}
              <select class="select-clean" id="hs-loc" name="loc">
                <option value="">Libreville</option>
                ${provinces.map((p) => html`<option value="${p.id}">${p.name}</option>`)}
              </select>
            </div>
            <button class="btn btn--emerald" type="submit">Rechercher ${icon('arrowRight', 18)}</button>
          </form>

          ${tops.length ? html`<div class="chips-row"><span class="chips-label">Suggestions populaires :</span> ${tops.slice(0, 5).map((c) => html`<a class="chip" href="/annuaire${buildQuery({ cat: c.id })}">${c.name}</a>`)}</div>` : ''}
        </div>

        <div class="hero__art" aria-hidden="true">
          <div class="hero__panther">
            <img src="/assets/mascot.svg" alt="Panthère Pro Finder" width="480" height="520" />
            <div class="hero__art-tagline">
              <strong>Pro Finder</strong>
              <span>Plus proche de vous au <strong>Gabon</strong></span>
            </div>
          </div>
        </div>
      </div>

      <!-- Trust Bar -->
      <div class="container">
        <div class="trust-bar">
          <div class="trust-item">
            <div class="trust-icon trust-icon--green">${icon('checkBadge', 22)}</div>
            <div>
              <strong>Profils vérifiés</strong>
              <span>Des professionnels de confiance</span>
            </div>
          </div>
          <div class="trust-item">
            <div class="trust-icon trust-icon--bolt">${icon('zap', 22)}</div>
            <div>
              <strong>Réponse rapide</strong>
              <span>Trouvez en quelques clics</span>
            </div>
          </div>
          <div class="trust-item">
            <div class="trust-icon trust-icon--headset">${icon('phone', 22)}</div>
            <div>
              <strong>Assistance 24/7</strong>
              <span>Nous sommes là pour vous</span>
            </div>
          </div>
          <div class="trust-item">
            <div class="trust-icon trust-icon--flag">${icon('shieldCheck', 22)}</div>
            <div>
              <strong>100% Gabonais</strong>
              <span>Soutien à notre communauté</span>
            </div>
          </div>
        </div>
      </div>
    </section>
    <div class="weave" aria-hidden="true"></div>

    ${ad ? html`<div class="container section--tight"><a class="ad-banner" href="${safeUrl(ad.link_url)}" target="_blank" rel="sponsored noopener noreferrer"><span class="badge badge--sponsor">Sponsorisé</span><img src="${ad.image_url}" alt="${ad.title}" loading="lazy" /></a></div>` : ''}

    ${recentBlock}
    <section class="section" aria-labelledby="cat-title">
      <div class="container">
        <div class="section__head"><h2 id="cat-title">Que recherchez-vous ?</h2><a href="/annuaire">Voir tout l'annuaire</a></div>
        ${tops.length
          ? html`<div class="cat-grid">${tops.map((c) => html`<a class="cat-tile" href="/annuaire${buildQuery({ cat: c.id })}"><span class="cat-tile__icon">${icon(c.icon, 26)}</span>${c.name}</a>`)}</div>`
          : emptyState('Catégories indisponibles', "Les catégories n'ont pas pu être chargées.")}
      </div>
    </section>

    <section class="section section--tight" aria-labelledby="pop-title">
      <div class="container">
        <div class="section__head"><h2 id="pop-title">Professionnels populaires</h2><a href="/annuaire?sort=popular">Voir plus</a></div>
        ${popular.rows.length ? businessGrid(popular.rows) : emptyState('Les premiers professionnels arrivent', "L'annuaire vient d'ouvrir : aucun professionnel n'est encore publié. Vous exercez un métier ? Soyez parmi les premiers visibles.", html`<p><a class="btn btn--gold" href="/inscription?role=professionnel">Inscrire mon activité</a></p>`)}
      </div>
    </section>

    ${recent.rows.length ? html`
    <section class="section section--tight" aria-labelledby="rec-title">
      <div class="container">
        <div class="section__head"><h2 id="rec-title">Récemment inscrits</h2><a href="/annuaire?sort=recent">Voir plus</a></div>
        ${businessGrid(recent.rows)}
      </div>
    </section>` : ''}

    <section class="section" aria-labelledby="why-title">
      <div class="container">
        <h2 id="why-title">Pourquoi Pro Finder ?</h2>
        <p class="lead">Au Gabon, trouver un bon prestataire repose encore sur le bouche-à-oreille. Pro Finder rassemble les professionnels au même endroit.</p>
        <div class="pillars" style="margin-top:28px">
          <div class="pillar">${icon('search', 30)}<h3>Trouvez vite</h3><p>Recherchez par métier et par localité : province, commune, arrondissement, ville ou quartier.</p></div>
          <div class="pillar">${icon('phone', 30)}<h3>Contactez directement</h3><p>Appel, WhatsApp ou messagerie privée : vous échangez sans intermédiaire.</p></div>
          <div class="pillar">${icon('shield', 30)}<h3>Choisissez en confiance</h3><p>Profils validés, avis déposés uniquement après un échange réel, signalement en un clic.</p></div>
        </div>
      </div>
    </section>

    <section class="section section--tight" aria-labelledby="how-title">
      <div class="container">
        <h2 id="how-title" style="margin-bottom:34px">Comment ça marche</h2>
        <div class="steps">
          <div class="step"><h3>Cherchez</h3><p>Saisissez un métier ou choisissez une catégorie, puis votre localité.</p></div>
          <div class="step"><h3>Comparez</h3><p>Consultez les prestations, la galerie, les disponibilités et les avis.</p></div>
          <div class="step"><h3>Contactez</h3><p>Écrivez, appelez ou envoyez un message WhatsApp en un geste.</p></div>
        </div>
      </div>
    </section>

    <section class="section section--tight" aria-labelledby="faq-title">
      <div class="container container--narrow">
        <h2 id="faq-title" style="margin-bottom:22px">Questions fréquentes</h2>
        <div class="faq">${FAQ.map(([q, a]) => html`<details><summary>${q}</summary><p>${a}</p></details>`)}</div>
      </div>
    </section>

    <section class="section" id="abonnement" aria-labelledby="pro-title">
      <div class="container">
        <div class="cta-band">
          <div>
            <h2 id="pro-title">Vous êtes un professionnel ? Soyez trouvé.</h2>
            <p>Créez votre fiche, présentez vos prestations et vos réalisations, et recevez des demandes de clients près de chez vous.</p>
            <a class="btn btn--gold" href="/inscription?role=professionnel">Inscrire mon activité ${icon('arrow', 18)}</a>
          </div>
          <div class="price-tag">
            <strong>${formatXAF(settings.plan_price)}</strong>
            <span>pour ${settings.plan_days} jours de visibilité</span>
            <p class="small muted" style="margin:10px auto 0">Votre fiche reste publique tant que l'abonnement est actif.</p>
          </div>
        </div>
      </div>
    </section>`);

  root.querySelector('#clear-recent')?.addEventListener('click', () => { clearRecent(); root.querySelector('#recent-block')?.remove(); });
  setJsonLd({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
  const form = root.querySelector('#hero-search');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = new FormData(form);
    navigate(`/annuaire${buildQuery({ q: String(d.get('q')).trim(), cat: d.get('cat'), loc: d.get('loc') })}`);
  });
  return undefined;
}
