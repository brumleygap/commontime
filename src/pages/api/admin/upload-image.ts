import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.isAdmin) {
    return new Response(null, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: "No file provided" }), { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return new Response(JSON.stringify({ error: "Only JPEG, PNG, GIF, and WebP are accepted" }), { status: 400 });
  }

  const ext = file.name.split(".").pop() ?? "bin";
  const key = `push/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // Return a URL via our proxy endpoint so the bucket can stay private
  const origin = new URL(request.url).origin;
  return new Response(JSON.stringify({ url: `${origin}/api/admin/media/${key}` }), {
    headers: { "Content-Type": "application/json" },
  });
};
