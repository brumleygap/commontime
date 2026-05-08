import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(null, { status: 401 });

  const res = await fetch(`https://api.onesignal.com/apps/${env.ONESIGNAL_APP_ID}`, {
    headers: { Authorization: `Key ${env.ONESIGNAL_API_KEY}` },
  });
  if (!res.ok) return new Response(null, { status: 502 });

  const data = await res.json() as { chrome_web_key?: string };
  if (!data.chrome_web_key) return new Response(null, { status: 404 });

  return new Response(JSON.stringify({ vapidPublicKey: data.chrome_web_key }), {
    headers: { "Content-Type": "application/json" },
  });
};
