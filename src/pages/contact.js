import { html, setHtml } from '../lib/html.js';
import { icon } from '../components/icons.js';
import { config } from '../config.js';
import { sendContactMessage } from '../services/catalog.js';
import { validateContact } from '../lib/validators.js';
import { formValues, showFieldErrors, withBusy } from '../lib/dom.js';
import { toastSuccess, toastError, friendlyError } from '../lib/toast.js';

export async function render({ root }) {
  setHtml(root, html`
    <section class="page-head"><div class="container"><h1>Nous contacter</h1><p>Une question, une suggestion, un problème ? Écrivez-nous.</p></div></section>
    <div class="container section">
      <div class="profile" style="grid-template-columns:1fr 320px">
        <form class="panel" id="contact-form" novalidate>
          <div class="form-grid">
            <div class="field"><label for="c-n">Votre nom</label><input class="input" id="c-n" name="name" autocomplete="name" maxlength="120" /><span class="field__error" data-error-for="name"></span></div>
            <div class="field"><label for="c-e">Votre e-mail</label><input class="input" id="c-e" name="email" type="email" autocomplete="email" maxlength="254" /><span class="field__error" data-error-for="email"></span></div>
          </div>
          <div class="field"><label for="c-s">Objet</label><input class="input" id="c-s" name="subject" maxlength="150" /><span class="field__error" data-error-for="subject"></span></div>
          <div class="field"><label for="c-b">Message</label><textarea class="textarea" id="c-b" name="body" maxlength="3000"></textarea><span class="field__error" data-error-for="body"></span></div>
          <div class="honeypot" aria-hidden="true"><label>Ne pas remplir <input name="website" tabindex="-1" autocomplete="off" /></label></div>
          <button class="btn" type="submit">Envoyer le message</button>
        </form>
        <aside class="panel stack">
          <h2>Coordonnées</h2>
          ${config.contactEmail ? html`<div>${icon('mail', 18)} <a href="mailto:${config.contactEmail}">${config.contactEmail}</a></div>` : ''}
          ${config.contactPhone ? html`<div>${icon('phone', 18)} ${config.contactPhone}</div>` : ''}
          <p class="muted small">Pour contacter un professionnel, utilisez les boutons de sa fiche : appel, WhatsApp ou message.</p>
        </aside>
      </div>
    </div>`);
  const form = root.querySelector('#contact-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = formValues(form);
    if (!showFieldErrors(form, validateContact(v))) return;
    if (v.website) { toastSuccess('Message envoyé.'); form.reset(); return; } // piège anti-robots
    await withBusy(form.querySelector('button[type=submit]'), async () => {
      try { await sendContactMessage(v); toastSuccess('Message envoyé. Nous vous répondrons par e-mail.'); form.reset(); }
      catch (err) { toastError(friendlyError(err)); }
    });
  });
  return undefined;
}
