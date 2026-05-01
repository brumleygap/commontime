import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let token: string;
  try {
    ({ token } = await request.json());
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!token) {
    return Response.json({ error: "token required" }, { status: 400 });
  }

  await env.DB
    .prepare("INSERT OR IGNORE INTO poll_dismissals (user_id, poll_token) VALUES (?, ?)")
    .bind(locals.user.id, token)
    .run();

  return Response.json({ ok: true });
};
