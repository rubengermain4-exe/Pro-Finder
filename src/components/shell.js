import { html } from '../lib/html.js';
import { icon } from './icons.js';
import { config } from '../config.js';

const NAV = [
  ['/annuaire', 'Annuaire'],
  ['/annuaire?kind=entreprise', 'Entreprises'],
  ['/contact', 'Contact'],
];

function dashboardLinks(profile) {
  if (!profile) return [];
  const links = [];
  if (profile.role === 'admin') links.push(['/admin', 'Administration', 'settings']);
  if (profile.role === 'professionnel') links.push(['/espace-pro', 'Mon espace pro', 'grid']);
  links.push(['/messages', 'Messagerie', 'message'], ['/compte/favoris', 'Mes favoris', 'heart'], ['/compte', 'Mon compte', 'user']);
  return links;
}

export function renderHeader({ auth, path, unread = 0, notifications = 0 }) {
  const { user, profile } = auth;
  const current = (href) => (href.split('?')[0] === path ? 'page' : null);
  return html`
    <header class="site-header">
      <div class="container site-header__bar">
        <a class="brand" href="/" aria-label="Pro Finder, accueil">
          <img src="/assets/mascot.svg" alt="" width="40" height="40" style="object-fit:cover;object-position:50% 12%;background:var(--forest)" />
          <span><b>PRO</b> FINDER</span>
        </a>
        <button class="nav__toggle" type="button" aria-expanded="false" aria-controls="main-nav" data-action="toggle-nav" aria-label="Ouvrir le menu">${icon('menu', 22)}</button>
        <nav class="nav" id="main-nav" aria-label="Navigation principale">
          ${NAV.map(([href, label]) => html`<a href="${href}" ${current(href) && !href.includes('?') ? html`aria-current="page"` : ''}>${label}</a>`)}
          ${user
            ? html`
              <div class="user-menu" data-open="false">
                <button class="btn btn--ghost btn--sm" type="button" data-action="toggle-user" aria-haspopup="true" aria-expanded="false">
                  ${icon('user', 18)} ${profile?.full_name?.split(' ')[0] || 'Mon compte'}
                  ${unread + notifications > 0 ? html`<span class="badge-dot">${unread + notifications}</span>` : ''}
                </button>
                <div class="user-menu__panel">
                  ${dashboardLinks(profile).map(([href, label, ic]) => html`<a href="${href}">${icon(ic, 18)} ${label}${href === '/messages' && unread ? html`<span class="badge-dot">${unread}</span>` : ''}</a>`)}
                  <a href="/compte/notifications">${icon('bell', 18)} Notifications${notifications ? html`<span class="badge-dot">${notifications}</span>` : ''}</a>
                  <button type="button" data-action="logout">${icon('logout', 18)} Déconnexion</button>
                </div>
              </div>`
            : html`
              <a href="/connexion">Connexion</a>
              <a class="btn btn--gold btn--sm nav__cta" href="/inscription?role=professionnel">Inscrire mon activité</a>`}
        </nav>
      </div>
    </header>
    <div class="weave" aria-hidden="true"></div>`;
}

export function renderFooter() {
  const year = new Date().getFullYear();
  return html`
    <footer class="site-footer">
      <div class="container footer__grid">
        <div>
          <a class="brand" href="/" style="color:var(--ivory)"><img src="/assets/mascot.svg" alt="" width="40" height="40" style="object-fit:cover;object-position:50% 12%;background:var(--forest)" /><span style="color:var(--ivory)"><b style="color:var(--gold)">PRO</b> FINDER</span></a>
          <p class="small" style="margin-top:14px">${config.slogan} L'annuaire des professionnels du Gabon : plombiers, frigoristes, électriciens, mécaniciens, nounous et bien d'autres.</p>
        </div>
        <div>
          <h3>Explorer</h3>
          <ul>
            <li><a href="/annuaire">Tous les professionnels</a></li>
            <li><a href="/annuaire?kind=entreprise">Les entreprises</a></li>
            <li><a href="/inscription">Créer un compte</a></li>
            <li><a href="/connexion">Se connecter</a></li>
          </ul>
        </div>
        <div>
          <h3>Professionnels</h3>
          <ul>
            <li><a href="/inscription?role=professionnel">Inscrire mon activité</a></li>
            <li><a href="/#abonnement">Tarif de l'abonnement</a></li>
            <li><a href="/espace-pro">Mon espace pro</a></li>
          </ul>
        </div>
        <div>
          <h3>Informations</h3>
          <ul>
            <li><a href="/contact">Nous contacter</a></li>
            <li><a href="/mentions-legales">Mentions légales</a></li>
            <li><a href="/conditions-utilisation">Conditions d'utilisation</a></li>
            <li><a href="/confidentialite">Confidentialité</a></li>
          </ul>
        </div>
      </div>
      <div class="container footer__bottom">
        <span>© ${year} ${config.companyName}. Tous droits réservés.</span>
        <span>Fait au Gabon, pour le Gabon.</span>
      </div>
    </footer>`;
}
