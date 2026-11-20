import test from 'node:test';
import assert from 'node:assert/strict';
import { html, raw, esc } from '../src/lib/html.js';
import { slugify, uniqueSlug, normalizePhone, waLink, telLink, safeUrl, formatXAF, initials, daysUntil } from '../src/lib/format.js';
import { validatePassword, validateSignup, validateBusiness, validateService, validateAvailability, validateContact, isEmail } from '../src/lib/validators.js';
import { matchRoute, compilePattern, safeInternalPath, checkGuard, buildQuery, parseQuery } from '../src/lib/router.js';
import { sniffImageType, validateImageFile } from '../src/lib/image.js';

test('html : échappe les valeurs (XSS)', () => {
  const evil = '<img src=x onerror="alert(1)">';
  assert.ok(!html`<p>${evil}</p>`.toString().includes('<img'));
  assert.equal(esc(`"'<>&`), '&quot;&#39;&lt;&gt;&amp;');
  assert.equal(html`<a title="${'" onmouseover="x'}">`.toString(), '<a title="&quot; onmouseover=&quot;x">');
});
test('html : imbrication et raw', () => {
  assert.equal(html`<ul>${[1, 2].map((n) => html`<li>${n}</li>`)}</ul>`.toString(), '<ul><li>1</li><li>2</li></ul>');
  assert.equal(html`${raw('<b>ok</b>')}${null}${false}`.toString(), '<b>ok</b>');
  assert.equal(html`${'<b>'}`.toString(), '&lt;b&gt;');
});
test('format : slugify / uniqueSlug', () => {
  assert.equal(slugify('Électricité Générale & Cie !'), 'electricite-generale-cie');
  assert.match(uniqueSlug('Plomberie Ndong', () => 0.5), /^plomberie-ndong-[a-z0-9]{4}$/);
  assert.match(uniqueSlug('???'), /^pro-/);
});
test('format : téléphone, WhatsApp, tel', () => {
  assert.equal(normalizePhone('+241 06 12 34 56'), '241061234 56'.replace(' ', ''));
  assert.equal(normalizePhone('0612 3456'), '2410612 3456'.replace(' ', ''));
  assert.equal(normalizePhone('00241 77 12 34 56'), '24177123456');
  assert.equal(normalizePhone('12'), null);
  assert.equal(normalizePhone(''), null);
  assert.equal(waLink('06123456', 'Salut & bonjour'), 'https://wa.me/24106123456?text=Salut%20%26%20bonjour');
  assert.equal(telLink('+24106123456'), 'tel:+24106123456');
  assert.equal(waLink('abc'), '');
});
test('format : safeUrl bloque javascript:', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('data:text/html,x'), '');
  assert.equal(safeUrl('https://exemple.ga/a'), 'https://exemple.ga/a');
  assert.equal(safeUrl('pas une url'), '');
});
test('format : montants, initiales, jours', () => {
  assert.equal(formatXAF(1000), '1 000 FCFA');
  assert.equal(formatXAF(1250000), '1 250 000 FCFA');
  assert.equal(initials('Jean Pierre Mba'), 'JP');
  assert.equal(initials(''), '?');
  const now = Date.UTC(2026, 0, 1);
  assert.equal(daysUntil(new Date(now + 3 * 86400000).toISOString(), now), 3);
});
test('validators : mot de passe, e-mail', () => {
  assert.ok(validatePassword('court1'));
  assert.ok(validatePassword('sanschiffres'));
  assert.ok(validatePassword('12345678'));
  assert.equal(validatePassword('motdepasse1'), '');
  assert.ok(isEmail('a@b.ga')); assert.ok(!isEmail('a@b')); assert.ok(!isEmail('a b@c.d'));
});
test('validators : inscription', () => {
  const base = { fullName: 'Awa Obame', email: 'awa@exemple.ga', phone: '06123456', password: 'motdepasse1', role: 'professionnel', acceptTerms: true };
  assert.deepEqual(validateSignup(base), {});
  assert.ok(validateSignup({ ...base, role: 'admin' }).role, 'le rôle admin est refusé');
  assert.ok(validateSignup({ ...base, acceptTerms: false }).acceptTerms);
  assert.ok(validateSignup({ ...base, phone: 'abc' }).phone);
});
test('validators : fiche, prestation, horaires, contact', () => {
  const biz = { name: 'Frigo Pro', kind: 'independant', category_id: 'c', location_id: 'l', description: 'Installation et réparation de climatiseurs.', phone: '06123456' };
  assert.deepEqual(validateBusiness(biz), {});
  assert.ok(validateBusiness({ ...biz, phone: '', whatsapp: '' }).phone);
  assert.ok(validateBusiness({ ...biz, website: 'javascript:1' }).website);
  assert.ok(validateService({ title: 'A' }).title);
  assert.ok(validateService({ title: 'Dépannage', price_from: '5000', price_to: '1000' }).price_to);
  assert.deepEqual(validateService({ title: 'Dépannage', price_from: '', price_to: '' }), {});
  assert.ok(validateAvailability({ mon: { open: true, from: '18:00', to: '08:00' } }).mon);
  assert.deepEqual(validateAvailability({ mon: { open: true, from: '08:00', to: '17:30' }, tue: { open: false } }), {});
  assert.ok(validateContact({ name: 'A', email: 'x', subject: '', body: 'court' }).body);
});
test('router : correspondance et paramètres', () => {
  const routes = [{ path: '/' }, { path: '/pro/:slug' }, { path: '/messages/nouveau/:businessId' }, { path: '/messages/:id?' }, { path: '/admin/:section?' }];
  assert.equal(matchRoute(routes, '/').route.path, '/');
  assert.equal(matchRoute(routes, '/pro/plomberie-ab12').params.slug, 'plomberie-ab12');
  assert.equal(matchRoute(routes, '/messages').route.path, '/messages/:id?');
  assert.equal(matchRoute(routes, '/messages/42').params.id, '42');
  assert.equal(matchRoute(routes, '/messages/nouveau/9').route.path, '/messages/nouveau/:businessId');
  assert.equal(matchRoute(routes, '/admin/').route.path, '/admin/:section?');
  assert.equal(matchRoute(routes, '/inconnu'), null);
  assert.equal(matchRoute(routes, '/pro/a%20b').params.slug, 'a b');
  assert.ok(compilePattern('/a/:b').regex.test('/a/x'));
});
test('router : redirections sûres et gardes', () => {
  assert.equal(safeInternalPath('/espace-pro'), '/espace-pro');
  assert.equal(safeInternalPath('//evil.com'), '/');
  assert.equal(safeInternalPath('https://evil.com'), '/');
  assert.equal(safeInternalPath('/\\evil.com'), '/');
  assert.equal(safeInternalPath(undefined, '/x'), '/x');
  assert.deepEqual(checkGuard(null, null, null), { ok: true });
  assert.equal(checkGuard({}, null, null).reason, 'login');
  assert.equal(checkGuard({ roles: ['admin'] }, { id: 1 }, { role: 'particulier' }).reason, 'forbidden');
  assert.equal(checkGuard({ roles: ['admin'] }, { id: 1 }, { role: 'admin' }).ok, true);
  assert.equal(checkGuard({}, { id: 1 }, { role: 'admin', is_suspended: true }).reason, 'suspended');
  assert.equal(buildQuery({ q: 'a b', cat: '', x: null }), '?q=a+b');
  assert.deepEqual(parseQuery('?q=x&page=2'), { q: 'x', page: '2' });
});
test('image : détection par signature', async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
  const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0]);
  assert.equal(sniffImageType(jpeg), 'image/jpeg');
  assert.equal(sniffImageType(png), 'image/png');
  assert.equal(sniffImageType(webp), 'image/webp');
  assert.equal(sniffImageType(exe), null);
  assert.equal((await validateImageFile(new Blob([exe]))).ok, false);
  assert.equal((await validateImageFile(new Blob([jpeg]))).ok, true);
  assert.equal((await validateImageFile(new Blob([new Uint8Array(3 * 1024 * 1024)]))).ok, false);
});
