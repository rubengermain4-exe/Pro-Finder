import { routes } from './routes.js';
import { matchRoute, parseQuery, checkGuard, safeInternalPath } from './lib/router.js';
import { html, setHtml } from './lib/html.js';
import { getAuth, subscribe, signOut } from './state/auth.js';
import { renderHeader, renderFooter } from './components/shell.js';
import { loader, errorState, emptyState } from './components/ui.js';
import { unreadTotal, subscribeToInbox } from './services/messaging.js';
import { unreadNotifications } from './services/account.js';
import { toastError, friendlyError } from './lib/toast.js';
import { scrollTop } from './lib/dom.js';
import { resetSeo } from './lib/seo.js';

let headerEl; let viewEl; let footerEl;
let renderToken = 0;
let cleanup = null;
let counts = { unread: 0, notifications: 0 };
let stopInbox = null;

export function navigate(path, { replace = false } = {}) {
  const target = safeInternalPath(path, '/');
  if (target === window.location.pathname + window.location.search) { route(); return; }
  window.history[replace ? 'replaceState' : 'pushState']({}, '', target);
  route();
}

function drawHeader() {
  setHtml(headerEl, renderHeader({ auth: getAuth(), path: window.location.pathname, ...counts }));
}

async function refreshCounts() {
  if (!getAuth().user) { counts = { unread: 0, notifications: 0 }; drawHeader(); return; }
  const [unread, notifications] = await Promise.all([unreadTotal(), unreadNotifications().catch(() => 0)]);
  counts = { unread, notifications };
  drawHeader();
}
export { refreshCounts };

async function route() {
  const token = ++renderToken;
  resetSeo();
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }

  const url = new URL(window.location.href);
  const match = matchRoute(routes, url.pathname);
  drawHeader();
  footerEl.hidden = false;

  if (!match) {
    document.title = 'Page introuvable · Pro Finder';
    setHtml(viewEl, html`<div class="container section center">${emptyState('Page introuvable', "L'adresse demandée n'existe pas ou a été déplacée.", html`<p><a class="btn" href="/">Retour à l'accueil</a></p>`)}</div>`);
    return;
  }

  const { route: r, params } = match;
  const auth = getAuth();
  const guard = checkGuard(r.guard, auth.user, auth.profile);
  if (!guard.ok) {
    if (guard.reason === 'login') { navigate(`/connexion?next=${encodeURIComponent(url.pathname + url.search)}`, { replace: true }); return; }
    document.title = 'Accès refusé · Pro Finder';
    const text = guard.reason === 'suspended' ? 'Votre compte est suspendu. Contactez-nous pour plus d\'informations.' : "Vous n'avez pas accès à cette page avec votre type de compte.";
    setHtml(viewEl, html`<div class="container section center">${emptyState('Accès refusé', text, html`<p><a class="btn" href="/">Retour à l'accueil</a></p>`)}</div>`);
    return;
  }

  document.title = `${r.title} · Pro Finder`;
  setHtml(viewEl, loader());
  try {
    const mod = await r.load();
    if (token !== renderToken) return;
    const ctx = { root: viewEl, params, query: parseQuery(url.search), route: r, navigate, auth };
    const result = await mod.render(ctx);
    if (token !== renderToken) { if (typeof result === 'function') result(); return; }
    cleanup = typeof result === 'function' ? result : null;
    if (!url.hash) scrollTop();
    drawHeader();
  } catch (err) {
    if (token !== renderToken) return;
    console.error(err);
    setHtml(viewEl, errorState(friendlyError(err)));
  }
}

function onGlobalClick(e) {
  const a = e.target.closest('a[href]');
  if (a && !a.target && !a.hasAttribute('download') && !e.defaultPrevented && e.button === 0 && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) {
    const href = a.getAttribute('href');
    if (href.startsWith('/') && !href.startsWith('//')) {
      e.preventDefault();
      if (href.includes('#') && !href.split('#')[0]) return;
      navigate(href);
      return;
    }
  }
  const nav = document.getElementById('main-nav');
  const menu = e.target.closest('[data-action]');
  const action = menu?.dataset.action;
  if (action === 'toggle-nav') {
    const open = nav.dataset.open !== 'true';
    nav.dataset.open = String(open);
    menu.setAttribute('aria-expanded', String(open));
  } else if (action === 'toggle-user') {
    const wrap = menu.closest('.user-menu');
    const open = wrap.dataset.open !== 'true';
    wrap.dataset.open = String(open);
    menu.setAttribute('aria-expanded', String(open));
  } else if (action === 'logout') {
    signOut().then(() => navigate('/', { replace: true })).catch((err) => toastError(friendlyError(err)));
  } else if (!e.target.closest('.user-menu')) {
    document.querySelectorAll('.user-menu[data-open="true"]').forEach((m) => { m.dataset.open = 'false'; });
  }
  if (a && nav) nav.dataset.open = 'false';
}

export function startApp(root) {
  root.innerHTML = '<div id="site-header"></div><main id="view" tabindex="-1"></main><div id="site-footer"></div>';
  headerEl = root.querySelector('#site-header');
  viewEl = root.querySelector('#view');
  footerEl = root.querySelector('#site-footer');
  setHtml(footerEl, renderFooter());

  const toTop = document.createElement('button');
  toTop.type = 'button'; toTop.className = 'to-top'; toTop.hidden = true; toTop.setAttribute('aria-label', 'Remonter en haut de la page');
  toTop.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.append(toTop);
  window.addEventListener('scroll', () => { toTop.hidden = window.scrollY < 700; }, { passive: true });

  document.addEventListener('click', onGlobalClick);
  window.addEventListener('popstate', route);
  window.addEventListener('pf:navigate', (e) => navigate(e.detail));

  let lastUserId = getAuth().user?.id || null;
  subscribe((auth) => {
    const id = auth.user?.id || null;
    if (id === lastUserId) return;
    lastUserId = id;
    if (stopInbox) { stopInbox(); stopInbox = null; }
    if (id) stopInbox = subscribeToInbox(() => refreshCounts());
    refreshCounts();
    const guarded = matchRoute(routes, window.location.pathname)?.route.guard;
    if (guarded || ['/connexion', '/inscription'].includes(window.location.pathname)) route();
  });
  if (lastUserId) { stopInbox = subscribeToInbox(() => refreshCounts()); refreshCounts(); }
  route();
}
