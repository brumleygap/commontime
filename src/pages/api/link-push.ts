import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(null, { status: 401 });

  let token: string, web_p256: string | null, web_auth: string | null, old_token: string | null;
  try {
    ({ token, web_p256 = null, web_auth = null, old_token = null } = await request.json());
  } catch {
    return new Response(null, { status: 400 });
  }

  if (!token || typeof token !== "string") return new Response(null, { status: 400 });
  if (!web_p256 || !web_auth) return new Response(null, { status: 400 });

  if (old_token && old_token !== token) {
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?")
      .bind(old_token, locals.user.id)
      .run();
  }

  await env.DB.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      created_at = unixepoch()
  `).bind(locals.user.id, token, web_p256, web_auth).run();

  return new Response(null, { status: 204 });
};
