import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

// GET /auth/check-passkey?email=...
// Returns whether the given email has a registered passkey.
export const GET: APIRoute = async ({ url }) => {
  const email = url.searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return Response.json({ error: "email required" }, { status: 400 });
  }

  const user = await env.DB
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: number }>();

  if (!user) {
    return Response.json({ hasPasskey: false });
  }

  const cred = await env.DB
    .prepare("SELECT id FROM passkey_credentials WHERE user_id = ? LIMIT 1")
    .bind(user.id)
    .first<{ id: number }>();

  return Response.json({ hasPasskey: !!cred });
};
