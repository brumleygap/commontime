import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ params }) => {
  const key = params.key;
  if (!key) return new Response(null, { status: 404 });

  // key from URL already includes the full R2 key (e.g. "push/timestamp-uuid.jpg")
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response(null, { status: 404 });

  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
