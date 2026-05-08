// Web Push Protocol: RFC 8291 (aes128gcm encryption) + RFC 8292 (VAPID auth).
// Uses only Web Crypto API — compatible with Cloudflare Workers (no Buffer).
// All Uint8Array values are explicitly Uint8Array<ArrayBuffer> per workers constraints.

function fromBase64url(str: string): Uint8Array<ArrayBuffer> {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64url(buf: Uint8Array<ArrayBuffer>): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function enc(s: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;
}

function concat(...arrays: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function ab(bits: ArrayBuffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bits) as Uint8Array<ArrayBuffer>;
}

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return ab(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

async function encryptPayload(
  plaintext: Uint8Array<ArrayBuffer>,
  p256dhB64: string,
  authB64: string,
): Promise<ArrayBuffer> {
  const uaPublic = fromBase64url(p256dhB64);
  const authSecret = fromBase64url(authB64);
  const salt = ab(crypto.getRandomValues(new Uint8Array(16)).buffer);

  const serverKP = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPublicRaw = ab(await crypto.subtle.exportKey("raw", serverKP.publicKey));

  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhBits = ab(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, serverKP.privateKey, 256));

  const keyInfo = concat(enc("WebPush: info\x00"), uaPublic, serverPublicRaw);
  const ikm = await hkdf(authSecret, ecdhBits, keyInfo, 32);

  const cek = await hkdf(salt, ikm, enc("Content-Encoding: aes128gcm\x00"), 16);
  const nonce = await hkdf(salt, ikm, enc("Content-Encoding: nonce\x00"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = ab(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 },
      aesKey,
      concat(plaintext, new Uint8Array([2]) as Uint8Array<ArrayBuffer>),
    ),
  );

  // aes128gcm body: [salt:16][rs:4 BE][keyid_len:1][keyid:65][ciphertext]
  const hdr = new Uint8Array(21) as Uint8Array<ArrayBuffer>;
  hdr.set(salt);
  new DataView(hdr.buffer).setUint32(16, 4096, false);
  hdr[20] = 65;

  return concat(hdr, serverPublicRaw, ciphertext).buffer;
}

async function vapidJwt(
  audience: string,
  subject: string,
  publicKeyB64: string,
  privateKeyB64: string,
): Promise<string> {
  const pubBytes = fromBase64url(publicKeyB64);
  const jwk = {
    kty: "EC", crv: "P-256",
    d: privateKeyB64,
    x: toBase64url(pubBytes.slice(1, 33) as Uint8Array<ArrayBuffer>),
    y: toBase64url(pubBytes.slice(33, 65) as Uint8Array<ArrayBuffer>),
  };
  const privateKey = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const hdr = toBase64url(enc(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const pay = toBase64url(enc(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 43200, sub: subject })));
  const sig = ab(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, enc(`${hdr}.${pay}`)));
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

// Minimal structural type — avoids importing D1Database in a module file.
interface D1Queryable {
  prepare(sql: string): { bind(...args: unknown[]): { all<T>(): Promise<{ results: T[] }> } };
}

async function sendOne(sub: WebPushSubscription, payload: object, vapid: VapidKeys): Promise<void> {
  const body = await encryptPayload(
    enc(JSON.stringify(payload)),
    sub.p256dh,
    sub.auth,
  );
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
    console.error(`Web push failed [${res.status}] ${sub.endpoint.slice(0, 60)}:`, await res.text());
  } else {
    console.log(`Web push ok [${res.status}] ${sub.endpoint.slice(0, 60)}`);
  }
}

export async function sendPushToUsers(
  userIds: number[],
  title: string,
  body: string,
  url: string,
  db: D1Queryable,
  vapid: VapidKeys,
): Promise<void> {
  if (userIds.length === 0) return;
  const placeholders = userIds.map(() => "?").join(",");
  const rows = await db
    .prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${placeholders})`)
    .bind(...userIds)
    .all<WebPushSubscription>();
  if (!rows.results.length) return;
  await Promise.allSettled(rows.results.map(sub => sendOne(sub, { title, body, url }, vapid)));
}
