import { html, setHtml } from '../lib/html.js';
import { icon } from '../components/icons.js';
import { emptyState, loader } from '../components/ui.js';
import { listConversations, getMessages, sendMessage, startConversation, markRead, subscribeToConversation } from '../services/messaging.js';
import { getAuth } from '../state/auth.js';
import { getBusinessBySlug } from '../services/catalog.js';
import { supabase } from '../lib/supabase.js';
import { validateMessage } from '../lib/validators.js';
import { timeAgo, formatDateTime } from '../lib/format.js';
import { formValues, withBusy } from '../lib/dom.js';
import { toastError, friendlyError } from '../lib/toast.js';
import { refreshCounts } from '../app.js';

export async function render(ctx) {
  if (ctx.params.businessId) return renderNew(ctx);
  return renderInbox(ctx);
}

async function renderNew({ root, params, navigate }) {
  const { data: b } = await supabase.from('businesses').select('id,name,slug,kind,owner_id').eq('id', params.businessId).maybeSingle();
  if (!b) { setHtml(root, html`<div class="container section center">${emptyState('Professionnel introuvable', "Ce professionnel n'est pas disponible.", html`<a class="btn" href="/annuaire">Retour à l'annuaire</a>`)}</div>`); return undefined; }
  if (b.owner_id === getAuth().user.id) { navigate('/espace-pro', { replace: true }); return undefined; }
  setHtml(root, html`<div class="container section"><div class="auth__card" style="margin:auto">
    <h1>Écrire à ${b.name}</h1><p class="muted">Votre message est privé : seuls vous et ce professionnel pouvez le lire.</p>
    <form id="f" novalidate><div class="field"><label for="m-b">Votre message</label><textarea class="textarea" id="m-b" name="body" maxlength="2000" placeholder="Décrivez votre besoin, le lieu et la date souhaitée…"></textarea><span class="field__error" data-error-for="body"></span></div>
    <div class="row"><button class="btn" type="submit">${icon('message', 18)} Envoyer</button><a class="btn btn--ghost" href="/${b.kind === 'entreprise' ? 'entreprise' : 'pro'}/${b.slug}">Annuler</a></div></form></div></div>`);
  const f = root.querySelector('#f');
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); const v = formValues(f); const m = validateMessage(v.body);
    f.querySelector('[data-error-for=body]').textContent = m; if (m) return;
    await withBusy(f.querySelector('button[type=submit]'), async () => {
      try { const id = await startConversation(b.id, v.body); navigate(`/messages/${id}`, { replace: true }); } catch (err) { toastError(friendlyError(err)); }
    }, 'Envoi…');
  });
  return undefined;
}

async function renderInbox({ root, params, navigate }) {
  const me = getAuth().user.id;
  let convs = await listConversations();
  let activeId = params.id || '';
  let unsub = null;

  setHtml(root, html`<div class="container section--tight"><h1 style="margin:16px 0">Messagerie</h1>
    ${convs.length ? html`<div class="chat" id="chat" data-view="${activeId ? 'thread' : 'list'}"><div class="chat__list" id="list"></div><div class="chat__pane" id="pane"></div></div>`
      : emptyState('Aucune conversation', 'Contactez un professionnel depuis sa fiche pour démarrer une conversation.', html`<a class="btn" href="/annuaire">Parcourir l'annuaire</a>`)}</div>`);
  if (!convs.length) return undefined;

  const list = root.querySelector('#list'); const pane = root.querySelector('#pane'); const chat = root.querySelector('#chat');
  const drawList = () => setHtml(list, html`${convs.map((c) => html`<a class="chat__item" href="/messages/${c.id}" ${c.id === activeId ? html`aria-current="true"` : ''}><strong><span style="color:var(--charcoal)">${c.other_name}</span>${Number(c.unread_count) ? html`<span class="badge-dot">${c.unread_count}</span>` : ''}</strong><span>${c.last_message || ''}</span><span>${timeAgo(c.last_message_at)}</span></a>`)}`);

  async function openThread(id) {
    if (unsub) { unsub(); unsub = null; }
    activeId = id; chat.dataset.view = id ? 'thread' : 'list';
    const conv = convs.find((c) => c.id === id);
    if (!conv) { setHtml(pane, emptyState('Sélectionnez une conversation')); drawList(); return; }
    setHtml(pane, loader());
    const msgs = await getMessages(id);
    setHtml(pane, html`<div class="chat__head"><a class="btn btn--ghost btn--sm back-link" href="/messages">${icon('arrow', 16)} Retour</a><strong>${conv.other_name}</strong>${conv.i_am_client ? html`<a class="small" href="/pro/${conv.business_slug}">Voir la fiche</a>` : ''}</div>
      <div class="chat__msgs" id="msgs" aria-live="polite"></div>
      <form class="chat__form" id="send" novalidate><label class="sr-only" for="t">Votre message</label><textarea class="textarea" id="t" name="body" maxlength="2000" placeholder="Écrire un message…" rows="1"></textarea><button class="btn" type="submit" aria-label="Envoyer">${icon('arrow', 20)}</button></form>`);
    const box = pane.querySelector('#msgs'); const seen = new Set();
    const add = (m) => {
      if (seen.has(m.id)) return; seen.add(m.id);
      const el = document.createElement('div'); el.className = `msg ${m.sender_id === me ? 'msg--me' : ''}`;
      el.textContent = m.body; const t = document.createElement('time'); t.textContent = formatDateTime(m.created_at); el.appendChild(t);
      box.appendChild(el); box.scrollTop = box.scrollHeight;
    };
    msgs.forEach(add);
    markRead(id).then(() => { conv.unread_count = 0; drawList(); refreshCounts(); });
    unsub = subscribeToConversation(id, (m) => { add(m); if (m.sender_id !== me) markRead(id).then(refreshCounts); });
    const form = pane.querySelector('#send'); const ta = form.body;
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); const text = ta.value; const m = validateMessage(text); if (m) return;
      ta.value = '';
      try { await sendMessage(id, text); } catch (err) { ta.value = text; toastError(friendlyError(err)); }
    });
    drawList();
  }

  drawList();
  if (activeId) await openThread(activeId); else setHtml(pane, emptyState('Sélectionnez une conversation', 'Choisissez un échange dans la liste.'));
  const onClick = (e) => {
    const a = e.target.closest('.chat__item'); if (!a) return;
    e.preventDefault(); e.stopPropagation();
    const id = a.getAttribute('href').split('/').pop();
    window.history.pushState({}, '', `/messages/${id}`); openThread(id);
  };
  list.addEventListener('click', onClick, true);
  return () => { if (unsub) unsub(); };
}
