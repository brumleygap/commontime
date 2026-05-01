import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";

// GET /auth/passkey-authenticate
// Returns authentication options JSON (discoverable — no user ID needed)
export const GET: APIRoute = async ({ url }) => {
  try {
    const { createAuthenticationOptions } = await import("../../lib/webauthn");
    const options = await createAuthenticationOptions(url.toString());

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await env.DB
      .prepare(
        "INSERT INTO webauthn_challenges (challenge, user_id, type, expires_at) VALUES (?, NULL, 'authenticate', ?)"
      )
      .bind(options.challenge, expiresAt)
      .run();

    return Response.json(options);
  } catch (err: any) {
    console.error("passkey-authenticate GET error:", err);
    return Response.json({ error: err?.message ?? "internal error" }, { status: 500 });
  }
};

// POST /auth/passkey-authenticate
// Verifies authentication assertion, creates session
export const POST: APIRoute = async ({ request, cookies }) => {
  let response: AuthenticationResponseJSON;
  try {
    response = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  try {
    const { verifyAuthentication } = await import("../../lib/webauthn");
    const now = new Date().toISOString();
    const credentialId = response.id;

    const stored = await env.DB
      .prepare(
        `SELECT pc.id, pc.user_id, pc.credential_id, pc.public_key, pc.sign_count
         FROM passkey_credentials pc
         WHERE pc.credential_id = ?`
      )
      .bind(credentialId)
      .first<{ id: number; user_id: number; credential_id: string; public_key: string; sign_count: number }>();

    if (!stored) {
      return Response.json({ error: "passkey not found" }, { status: 400 });
    }

    const challengeRow = await env.DB
      .prepare(
        `SELECT id, challenge FROM webauthn_challenges
         WHERE type = 'authenticate' AND used = 0 AND expires_at > ?
         ORDER BY id DESC LIMIT 1`
      )
      .bind(now)
      .first<{ id: number; challenge: string }>();

    if (!challengeRow) {
      return Response.json({ error: "challenge expired" }, { status: 400 });
    }

    const verification = await verifyAuthentication({
      response,
      expectedChallenge: challengeRow.challenge,
      credential: {
        credentialId: stored.credential_id,
        publicKey: stored.public_key,
        signCount: stored.sign_count,
      },
      requestUrl: request.url,
    });

    if (!verification.verified) {
      return Response.json({ error: "not verified" }, { status: 400 });
    }

    await env.DB.batch([
      env.DB
        .prepare("UPDATE webauthn_challenges SET used = 1 WHERE id = ?")
        .bind(challengeRow.id),
      env.DB
        .prepare("UPDATE passkey_credentials SET sign_count = ? WHERE id = ?")
        .bind(verification.authenticationInfo.newCounter, stored.id),
    ]);

    const sessionToken = crypto.randomUUID().replace(/-/g, "");
    const sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await env.DB
      .prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)")
      .bind(stored.user_id, sessionToken, sessionExpiry.toISOString())
      .run();

    cookies.set("session", sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      expires: sessionExpiry,
      path: "/",
    });

    return Response.json({ ok: true });
  } catch (err: any) {
    console.error("passkey-authenticate POST error:", err);
    return Response.json({ error: err?.message ?? "internal error" }, { status: 500 });
  }
};
