import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(null, { status: 401 });
  }

  let onesignalId: string;
  try {
    ({ onesignalId } = await request.json());
  } catch {
    return new Response(null, { status: 400 });
  }

  if (!onesignalId || typeof onesignalId !== "string") {
    return new Response(null, { status: 400 });
  }

  const res = await fetch(
    `https://api.onesignal.com/apps/${env.ONESIGNAL_APP_ID}/users/by/onesignal_id/${onesignalId}/identity`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Key ${env.ONESIGNAL_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.onesignal.v1+json",
      },
      body: JSON.stringify({ identity: { external_id: String(locals.user.id) } }),
    }
  );

  if (!res.ok) {
    console.error("OneSignal link-push failed:", res.status, await res.text());
    return new Response(null, { status: 502 });
  }

  return new Response(null, { status: 204 });
};
