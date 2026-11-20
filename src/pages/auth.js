import { html, setHtml, raw } from '../lib/html.js';
import { signIn, signUp, requestPasswordReset, updatePassword, getAuth, waitForAuth, homePathFor } from '../state/auth.js';
import { validateSignup, validatePassword, isEmail } from '../lib/validators.js';
import { formValues, showFieldErrors, withBusy } from '../lib/dom.js';
import { safeInternalPath } from '../lib/router.js';
import { toastError, toastSuccess, friendlyError } from '../lib/toast.js';

const shell = (title, intro, body) => html`<div class="auth"><div class="auth__card"><h1>${title}</h1>${intro ? html`<p class="muted">${intro}</p>` : ''}${body}</div></div>`;
const err = (name) => html`<span class="field__error" data-error-for="${name}"></span>`;

export async function render({ root, route, query, navigate }) {
  const mode = route.mode;
  const auth = getAuth();
  const next = safeInternalPath(query.next, '');

  if ((mode === 'login' || mode === 'signup') && auth.user) { navigate(next || homePathFor(auth.profile), { replace: true }); return undefined; }

  if (mode === 'login') {
    setHtml(root, shell('Connexion', 'Retrouvez vos messages, favoris et votre espace.', html`
      <form id="f" novalidate>
        <div class="field"><label for="a-e">E-mail</label><input class="input" id="a-e" name="email" type="email" autocomplete="email" required />${err('email')}</div>
        <div class="field"><label for="a-p">Mot de passe</label><input class="input" id="a-p" name="password" type="password" autocomplete="current-password" required />${err('password')}</div>
        <button class="btn btn--block" type="submit">Se connecter</button>
        <p class="small" style="margin-top:14px"><a href="/mot-de-passe-oublie">Mot de passe oublié ?</a></p>
        <p class="small">Pas encore de compte ? <a href="/inscription${next ? `?next=${encodeURIComponent(next)}` : ''}">Créer un compte</a></p>
      </form>`));
    const f = root.querySelector('#f');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const v = formValues(f);
      const errors = {}; if (!isEmail(v.email)) errors.email = 'Adresse e-mail invalide.'; if (!v.password) errors.password = 'Saisissez votre mot de passe.';
      if (!showFieldErrors(f, errors)) return;
      await withBusy(f.querySelector('button[type=submit]'), async () => {
        try { await signIn(v.email, v.password); const s = await waitForAuth(); navigate(next || homePathFor(s.profile), { replace: true }); }
        catch (ex) { toastError(friendlyError(ex)); }
      }, 'Connexion…');
    });
  }

  if (mode === 'signup') {
    const role = query.role === 'professionnel' ? 'professionnel' : 'particulier';
    setHtml(root, shell('Créer un compte', 'Gratuit pour les particuliers. Les professionnels publient leur fiche avec un abonnement.', html`
      <form id="f" novalidate>
        <div class="seg" role="radiogroup" aria-label="Type de compte">
          <label><input type="radio" name="role" value="particulier" ${role === 'particulier' ? raw('checked') : ''} /><span>Je cherche un pro</span></label>
          <label><input type="radio" name="role" value="professionnel" ${role === 'professionnel' ? raw('checked') : ''} /><span>Je suis un pro</span></label>
        </div>
        ${err('role')}
        <div class="field"><label for="s-n">Nom complet</label><input class="input" id="s-n" name="fullName" autocomplete="name" maxlength="120" />${err('fullName')}</div>
        <div class="field"><label for="s-e">E-mail</label><input class="input" id="s-e" name="email" type="email" autocomplete="email" maxlength="254" />${err('email')}</div>
        <div class="field"><label for="s-t">Téléphone (facultatif)</label><input class="input" id="s-t" name="phone" type="tel" autocomplete="tel" maxlength="30" />${err('phone')}</div>
        <div class="field"><label for="s-p">Mot de passe</label><input class="input" id="s-p" name="password" type="password" autocomplete="new-password" />${err('password')}<span class="hint">8 caractères minimum, avec une lettre et un chiffre.</span></div>
        <div class="field"><label class="check"><input type="checkbox" name="acceptTerms" /> <span>J'accepte les <a href="/conditions-utilisation" target="_blank">conditions d'utilisation</a> et la <a href="/confidentialite" target="_blank">politique de confidentialité</a>.</span></label>${err('acceptTerms')}</div>
        <button class="btn btn--block" type="submit">Créer mon compte</button>
        <p class="small" style="margin-top:14px">Déjà inscrit ? <a href="/connexion">Se connecter</a></p>
      </form>`));
    const f = root.querySelector('#f');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const v = formValues(f); v.acceptTerms = f.acceptTerms.checked;
      if (!showFieldErrors(f, validateSignup(v))) return;
      await withBusy(f.querySelector('button[type=submit]'), async () => {
        try {
          const { needsConfirmation } = await signUp(v);
          if (needsConfirmation) setHtml(root, shell('Vérifiez votre boîte mail', '', html`<div class="alert alert--ok">Nous avons envoyé un lien de confirmation à <strong>${v.email}</strong>. Cliquez dessus pour activer votre compte, puis connectez-vous.</div><a class="btn" href="/connexion">Aller à la connexion</a>`));
          else { const s = await waitForAuth(); navigate(homePathFor(s.profile), { replace: true }); }
        } catch (ex) { toastError(friendlyError(ex)); }
      }, 'Création…');
    });
  }

  if (mode === 'forgot') {
    setHtml(root, shell('Mot de passe oublié', 'Saisissez votre e-mail : nous vous envoyons un lien de réinitialisation.', html`
      <form id="f" novalidate><div class="field"><label for="a-e">E-mail</label><input class="input" id="a-e" name="email" type="email" autocomplete="email" />${err('email')}</div>
      <button class="btn btn--block" type="submit">Envoyer le lien</button><p class="small" style="margin-top:14px"><a href="/connexion">Retour à la connexion</a></p></form>`));
    const f = root.querySelector('#f');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const v = formValues(f);
      if (!showFieldErrors(f, isEmail(v.email) ? {} : { email: 'Adresse e-mail invalide.' })) return;
      await withBusy(f.querySelector('button[type=submit]'), async () => {
        try { await requestPasswordReset(v.email); } catch (ex) { if (/rate limit/i.test(ex.message)) { toastError(friendlyError(ex)); return; } }
        setHtml(root, shell('Vérifiez votre boîte mail', '', html`<div class="alert alert--ok">Si un compte existe pour cette adresse, un lien vient d'être envoyé.</div><a class="btn" href="/connexion">Retour à la connexion</a>`));
      });
    });
  }

  if (mode === 'reset') {
    if (!getAuth().user) { await waitForAuth(1500); }
    if (!getAuth().user) { setHtml(root, shell('Lien invalide ou expiré', '', html`<div class="alert alert--warn">Ouvrez le lien reçu par e-mail, ou refaites une demande.</div><a class="btn" href="/mot-de-passe-oublie">Nouvelle demande</a>`)); return undefined; }
    setHtml(root, shell('Nouveau mot de passe', '', html`<form id="f" novalidate><div class="field"><label for="n-p">Nouveau mot de passe</label><input class="input" id="n-p" name="password" type="password" autocomplete="new-password" />${err('password')}</div><button class="btn btn--block" type="submit">Enregistrer</button></form>`));
    const f = root.querySelector('#f');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const v = formValues(f); const m = validatePassword(v.password);
      if (!showFieldErrors(f, m ? { password: m } : {})) return;
      await withBusy(f.querySelector('button[type=submit]'), async () => {
        try { await updatePassword(v.password); toastSuccess('Mot de passe mis à jour.'); navigate(homePathFor(getAuth().profile), { replace: true }); } catch (ex) { toastError(friendlyError(ex)); }
      });
    });
  }
  return undefined;
}
