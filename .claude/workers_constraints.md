# Cloudflare Workers runtime constraints

This app runs in the **Workers runtime**, not Node.js. These constraints have caused bugs — don't repeat them.

## No `Buffer`
`Buffer` is a Node.js global. It is not available in Workers, even with `nodejs_compat`. Use Web Crypto equivalents:

```ts
function toBase64url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromBase64url(str: string): Uint8Array<ArrayBuffer> {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
```

## `Uint8Array<ArrayBuffer>` vs `Uint8Array<ArrayBufferLike>`
`Uint8Array.from(...)` returns `Uint8Array<ArrayBufferLike>`. Some libraries (e.g. `@simplewebauthn/server`) require the stricter `Uint8Array<ArrayBuffer>`. Always use `new Uint8Array(n)` and fill manually.

## `allow_eval_during_startup` — do NOT add to `compatibility_flags`
This flag is already the default as of `compatibility_date` `2025-06-01`. Specifying it explicitly causes miniflare to reject the config.

## `nodejs_compat` is required
Set in `wrangler.jsonc`. Polyfills a subset of Node.js APIs but does **not** add `Buffer`.

## rpId / origin must be derived at runtime
Never hardcode `commontime.app` — derive from the request so the same code works on production and preview:

```ts
const rpID = new URL(request.url).hostname;
const expectedOrigin = new URL(request.url).origin;
```