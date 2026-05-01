import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import type { RegistrationResponseJSON } from "@simplewebauthn/browser";
import { createRegistrationOptions, verifyRegistration } from "../../lib/webauthn";

// GET /auth/passkey-register?email=...
// Returns registration options JSON; stores challenge in DB
export const GET: APIRoute = async ({ url }) => {
  const email = url.searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return Response.json({ error: "email required" }, { status: 400 });
  }

  let user = await env.DB
    .prepare("SELECT id, email FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: number; email: string }>();

  if (!user) {
    user = await env.DB
      .prepare("INSERT INTO users (email) VALUES (?) RETURNING id, email")
      .bind(email)
      .first<{ id: number; email: string }>();
  }

  if (!user) {
    return Response.json({ error: "failed to find or create user" }, { status: 500 });
  }

  const existing = await env.DB
    .prepare("SELECT credential_id FROM passkey_credentials WHERE user_id = ?")
    .bind(user.id)
    .all<{ credential_id: string }>();

  const options = await createRegistrationOptions({
    userId: user.id,
    userEmail: user.email,
    existingCredentialIds: existing.results.map((r) => r.credential_id),
    requestUrl: url.toString(),
  });

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await env.DB
    .prepare("INSERT INTO webauthn_challenges (challenge, user_id, type, expires_at) VALUES (?, ?, 'register', ?)")
    .bind(options.challenge, user.id, expiresAt)
    .run();

  return Response.json({ options, userId: user.id });
};

// POST /auth/passkey-register
// Verifies registration response, stores credential, creates session
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  let body: { response: RegistrationResponseJSON; userId: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { response, userId } = body;
  if (!response || !userId) {
    return Response.json({ error: "missing fields" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const row = await env.DB
    .prepare(
      `SELECT id, challenge FROM webauthn_challenges
       WHERE user_id = ? AND type = 'register' AND used = 0 AND expires_at > ?
       ORDER BY id DESC LIMIT 1`
    )
    .bind(userId, now)
    .first<{ id: number; challenge: string }>();

  if (!row) {
    return Response.json({ error: "challenge expired or not found" }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyRegistration({
      response,
      expectedChallenge: row.challenge,
      requestUrl: request.url,
    });
  } catch (err) {
    console.error("passkey registration verification failed", err);
    return Response.json({ error: "verification failed" }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return Response.json({ error: "not verified" }, { status: 400 });
  }

  await env.DB
    .prepare("UPDATE webauthn_challenges SET used = 1 WHERE id = ?")
    .bind(row.id)
    .run();

  const { credential } = verification.registrationInfo;
  const credentialId = Buffer.from(credential.id).toString("base64url");
  const publicKey = Buffer.from(credential.publicKey).toString("base64url");

  await env.DB
    .prepare(
      "INSERT INTO passkey_credentials (user_id, credential_id, public_key, sign_count) VALUES (?, ?, ?, ?)"
    )
    .bind(userId, credentialId, publicKey, credential.counter)
    .run();

  // Create session
  const sessionToken = crypto.randomUUID().replace(/-/g, "");
  const sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await env.DB
    .prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)")
    .bind(userId, sessionToken, sessionExpiry.toISOString())
    .run();

  cookies.set("session", sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    expires: sessionExpiry,
    path: "/",
  });

  return Response.json({ ok: true });
};
