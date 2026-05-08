import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(null, { status: 401 });
  return new Response(JSON.stringify({ vapidPublicKey: env.VAPID_PUBLIC_KEY }), {
    headers: { "Content-Type": "application/json" },
  });
};
