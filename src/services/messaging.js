import { supabase } from '../lib/supabase.js';
import { getAuth } from '../state/auth.js';

const must = ({ data, error }) => { if (error) throw error; return data; };

export async function listConversations() { return must(await supabase.rpc('my_conversations')); }

export async function unreadTotal() {
  if (!getAuth().user) return 0;
  try { return (await listConversations()).reduce((n, c) => n + Number(c.unread_count || 0), 0); } catch { return 0; }
}

export async function getMessages(conversationId) {
  return must(await supabase.from('messages').select('id,sender_id,body,created_at').eq('conversation_id', conversationId).order('created_at').limit(500));
}

export async function sendMessage(conversationId, body) {
  must(await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: getAuth().user.id, body: body.trim() }));
}

export async function startConversation(businessId, body) {
  return must(await supabase.rpc('start_conversation', { p_business: businessId, p_body: body.trim() }));
}

export async function markRead(conversationId) {
  await supabase.rpc('mark_conversation_read', { p_conversation: conversationId });
}

/** Abonnement Realtime aux nouveaux messages d'une conversation. Retourne une fonction de désabonnement. */
export function subscribeToConversation(conversationId, onMessage) {
  const channel = supabase
    .channel(`conv-${conversationId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onMessage(payload.new))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

/** Abonnement global : notifie quand un message arrive dans n'importe quelle conversation de l'utilisateur. */
export function subscribeToInbox(onMessage) {
  const channel = supabase
    .channel(`inbox-${getAuth().user.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => onMessage(p.new))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
