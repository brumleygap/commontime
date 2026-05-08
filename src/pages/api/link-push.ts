import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(null, { status: 401 });
  }

  let token: string, web_p256: string | null, web_auth: string | null;
  try {
    ({ token, web_p256 = null, web_auth = null } = await request.json());
  } catch {
    return new Response(null, { status: 400 });
  }

  if (!token || typeof token !== "string") {
    return new Response(null, { status: 400 });
  }

  // POST /users with both identity and subscription token.
  // Per OneSignal docs: "If any subscriptions already exist with any subscription
  // identifiers in the request, those subscriptions will be linked to the new user."
  // This finds the existing subscription by token and associates external_id with it,
  // bypassing the SDK's broken local identity state entirely.
  const res = await fetch(
    `https://api.onesignal.com/apps/${env.ONESIGNAL_APP_ID}/users`,
    {
      method: "POST",
      headers: {
        Authorization: `Key ${env.ONESIGNAL_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.onesignal.v1+json",
      },
      body: JSON.stringify({
        identity: { external_id: `ct_${locals.user.id}` },
        subscriptions: [{
          type: token.includes("web.push.apple.com") ? "SafariPush" : "ChromePush",
          token, enabled: true, notification_types: 1, web_p256, web_auth,
        }],
      }),
    }
  );

  if (!res.ok) {
    console.error("OneSignal link-push failed:", res.status, await res.text());
    return new Response(null, { status: 502 });
  }

  return new Response(null, { status: 204 });
};
