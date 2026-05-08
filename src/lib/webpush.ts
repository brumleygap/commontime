// Web Push Protocol: RFC 8291 (aes128gcm encryption) + RFC 8292 (VAPID auth).
// Uses only Web Crypto API — compatible with Cloudflare Workers.

function fromBase64url(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

async function encryptPayload(
  plaintext: Uint8Array,
  p256dhB64: string,
  authB64: string,
): Promise<{ body: Uint8Array }> {
  const enc = new TextEncoder();
  const uaPublic = fromBase64url(p256dhB64);   // 65-byte uncompressed P-256 point
  const authSecret = fromBase64url(authB64);    // 16-byte auth secret
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Generate ephemeral server ECDH key pair
  const serverKP = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const serverPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", serverKP.publicKey));

  // ECDH with subscription's public key
  const uaKey = await crypto.subtle.importKey(
    "raw", uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false, [],
  );
  const ecdhBits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, serverKP.privateKey, 256),
  );

  // RFC 8291 §3.4 — two-stage HKDF
  // Stage 1: HKDF(salt=auth_secret, IKM=ecdh_secret, info=key_info, L=32)
  const keyInfo = concat(enc.encode("WebPush: info\x00"), uaPublic, serverPublicRaw);
  const ikm = await hkdf(authSecret, ecdhBits, keyInfo, 32);

  // Stage 2: derive CEK (16 bytes) and nonce (12 bytes)
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\x00"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\x00"), 12);

  // AES-128-GCM encrypt: plaintext || 0x02 delimiter
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 },
      aesKey,
      concat(plaintext, new Uint8Array([2])),
    ),
  );

  // aes128gcm body: [salt:16][rs:4 BE][keyid_len:1][keyid:65][ciphertext]
  const hdr = new Uint8Array(21);
  hdr.set(salt, 0);
  new DataView(hdr.buffer).setUint32(16, 4096, false);
  hdr[20] = 65;

  return { body: concat(hdr, serverPublicRaw, ciphertext) };
}

async function vapidJwt(
  audience: string,
  subject: string,
  publicKeyB64: string,
  privateKeyB64: string,
): Promise<string> {
  const enc = new TextEncoder();
  const pubBytes = fromBase64url(publicKeyB64); // 65-byte uncompressed point
  const jwk = {
    kty: "EC", crv: "P-256",
    d: privateKeyB64,
    x: toBase64url(pubBytes.slice(1, 33)),
    y: toBase64url(pubBytes.slice(33, 65)),
  };
  const privateKey = await crypto.subtle.importKey(
    "jwk", jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["sign"],
  );

  const hdr = toBase64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const pay = toBase64url(enc.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: subject,
  })));
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      enc.encode(`${hdr}.${pay}`),
    ),
  );
  return `${hdr}.${pay}.${toBase64url(sig)}`;
}

export interface WebPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

async function sendOne(sub: WebPushSubscription, payload: object, vapid: VapidKeys): Promise<void> {
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const { body } = await encryptPayload(plaintext, sub.p256dh, sub.auth);
  const audience = new URL(sub.endpoint).origin;
  const jwt = await vapidJwt(audience, vapid.subject, vapid.publicKey, vapid.privateKey);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt},k=${vapid.publicKey}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
    },
    body,
  });

  if (!res.ok && res.status !== 201) {
    console.error(`Web push failed [${res.status}] ${sub.endpoint}:`, await res.text());
  }
}

export async function sendPushToUsers(
  userIds: number[],
  title: string,
  body: string,
  url: string,
  db: D1Database,
  vapid: VapidKeys,
): Promise<void> {
  if (userIds.length === 0) return;

  const placeholders = userIds.map(() => "?").join(",");
  const rows = await db
    .prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${placeholders})`)
    .bind(...userIds)
    .all<{ endpoint: string; p256dh: string; auth: string }>();

  if (!rows.results.length) return;

  await Promise.allSettled(
    rows.results.map(sub => sendOne(sub, { title, body, url }, vapid)),
  );
}
