// Cloudflare Worker : réception des confirmations de paiement mobile (Airtel Money / Moov Money).
//
// ÉTAT : squelette sécurisé, NON branché à un opérateur réel.
//  - Le format exact des notifications Airtel/Moov dépend de votre contrat marchand : adaptez parsePayload().
//  - Tant que vous n'avez pas testé avec le bac à sable de l'opérateur, laissez payment_mode = 'test'.
// La clé service_role n'existe QUE dans les secrets du Worker (jamais dans le frontend).

const enc = new TextEncoder();

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

// À ADAPTER au format réel de l'opérateur.
function parsePayload(provider, body) {
  return { paymentId: body.payment_id, reference: body.transaction_id || body.reference, success: body.status === 'success' };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true });

    const match = url.pathname.match(/^\/webhook\/(airtel_money|moov_money)$/);
    if (!match || request.method !== 'POST') return json({ error: 'not_found' }, 404);
    const provider = match[1];

    const secret = provider === 'airtel_money' ? env.WEBHOOK_SECRET_AIRTEL : env.WEBHOOK_SECRET_MOOV;
    if (!secret || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'not_configured' }, 503);

    const raw = await request.text();
    if (raw.length > 20000) return json({ error: 'too_large' }, 413);
    const expected = await hmacHex(secret, raw);
    const given = (request.headers.get('x-signature') || '').toLowerCase();
    if (!safeEqual(expected, given)) return json({ error: 'invalid_signature' }, 401);

    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }
    const { paymentId, reference, success } = parsePayload(provider, body);
    if (!/^[0-9a-f-]{36}$/i.test(paymentId || '') || !reference) return json({ error: 'invalid_payload' }, 400);
    if (!success) return json({ ok: true, ignored: true });

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/confirm_payment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ p_payment: paymentId, p_reference: String(reference).slice(0, 100) }),
    });
    if (!res.ok) return json({ error: 'confirm_failed' }, 502);
    return json({ ok: true });
  },
};
