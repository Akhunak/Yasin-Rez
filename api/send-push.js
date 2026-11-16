const crypto = require('crypto');

const SUPABASE_URL = 'https://hiarwdthivcmgabhhjjh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_a_eeLPiolEV3oLSiM4ylKw_2vtlmT7j';
const PUSH_SERVER_SECRET = 'avicii_push_srv_9f8a7b6c5d4e3f2a1b0c';

const VAPID_PUBLIC_KEY = 'BDU9_5Dv1TJKTc0xf9g43loc_AmuJ2_n4koi2LwzfwUz8r1YMbMM8YeUAQ20tBR-_7FfB8G7g-FSesenOwm04h8';
const VAPID_PRIVATE_KEY = 'ggdJrpWQIH_3C-AFq1UHO5aV3VsqdgYpIEzN5EpKlDk';
const VAPID_SUBJECT = 'mailto:admin@aviciitraining.com';

function createVapidAuthHeader(endpointUrl) {
  const parsed = new URL(endpointUrl);
  const audience = `${parsed.protocol}//${parsed.host}`;

  const pubBuf = Buffer.from(VAPID_PUBLIC_KEY, 'base64url');
  const x = pubBuf.subarray(1, 33).toString('base64url');
  const y = pubBuf.subarray(33, 65).toString('base64url');

  const privateKey = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x, y, d: VAPID_PRIVATE_KEY },
    format: 'jwk'
  });

  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: VAPID_SUBJECT
  })).toString('base64url');

  const unsignedToken = `${header}.${payload}`;
  const signature = crypto.sign('sha256', Buffer.from(unsignedToken), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363'
  }).toString('base64url');

  const jwt = `${unsignedToken}.${signature}`;
  return `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`;
}

function encryptWebPushPayload(payloadString, clientP256dhB64, clientAuthB64) {
  const clientPublicKey = Buffer.from(clientP256dhB64, 'base64url');
  const authSecret = Buffer.from(clientAuthB64, 'base64url');
  const salt = crypto.randomBytes(16);

  const serverECDH = crypto.createECDH('prime256v1');
  serverECDH.generateKeys();
  const serverPublicKey = serverECDH.getPublicKey();
  const sharedSecret = serverECDH.computeSecret(clientPublicKey);

  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'ascii'),
    clientPublicKey,
    serverPublicKey
  ]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32));

  const cekInfo = Buffer.from('Content-Encoding: aes128gcm\0', 'ascii');
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, cekInfo, 16));

  const nonceInfo = Buffer.from('Content-Encoding: nonce\0', 'ascii');
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, nonceInfo, 12));

  const plaintext = Buffer.concat([Buffer.from(payloadString, 'utf8'), Buffer.from([0x02])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21 + serverPublicKey.length);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(serverPublicKey.length, 20);
  serverPublicKey.copy(header, 21);

  return Buffer.concat([header, encrypted]);
}

async function sendWebPush(subscription, payloadObj) {
  const bodyBuffer = encryptWebPushPayload(
    JSON.stringify(payloadObj),
    subscription.p256dh,
    subscription.auth
  );

  const authHeader = createVapidAuthHeader(subscription.endpoint);

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bodyBuffer.length),
      'TTL': '86400',
      'Urgency': 'high'
    },
    body: bodyBuffer
  });

  return { status: res.status, ok: res.ok };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_pending_push_notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ p_server_secret: PUSH_SERVER_SECRET })
    });

    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      return res.status(500).json({ error: 'Supabase RPC error', details: errText });
    }

    const data = await rpcRes.json();
    const messages = (data && data.messages) || [];
    const subscriptions = (data && data.subscriptions) || [];

    if (messages.length === 0 || subscriptions.length === 0) {
      return res.status(200).json({ sent: 0, messagesCount: messages.length, subscriptionsCount: subscriptions.length });
    }

    let sentCount = 0;
    const expiredEndpoints = [];

    for (const msg of messages) {
      const payloadObj = {
        title: 'Avicii Training',
        body: msg,
        icon: '/favicon.png',
        badge: '/favicon.png',
        url: '/'
      };

      for (const sub of subscriptions) {
        try {
          const result = await sendWebPush(sub, payloadObj);
          if (result.ok) {
            sentCount++;
          } else if (result.status === 404 || result.status === 410) {
            expiredEndpoints.push(sub.endpoint);
          }
        } catch (pushErr) {
          console.error('Push send error:', pushErr);
        }
      }
    }

    for (const endpoint of expiredEndpoints) {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/remove_expired_push_subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          p_server_secret: PUSH_SERVER_SECRET,
          p_endpoint: endpoint
        })
      });
    }

    return res.status(200).json({ sent: sentCount });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
