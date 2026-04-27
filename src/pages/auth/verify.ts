import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
    const token = url.searchParams.get("token");

    if (!token) {
        return redirect("/login?error=missing_token");
    }

    const now = new Date().toISOString();

    const magicToken = await env.DB
        .prepare(
            `SELECT id, user_id FROM magic_tokens
             WHERE token = ? AND used = 0 AND expires_at > ?`
        )
        .bind(token, now)
        .first<{ id: number; user_id: number }>();

    if (!magicToken) {
        return redirect("/login?error=invalid_token");
    }

    await env.DB
        .prepare("UPDATE magic_tokens SET used = 1 WHERE id = ?")
        .bind(magicToken.id)
        .run();

    const sessionToken = crypto.randomUUID().replace(/-/g, "");
    const sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await env.DB
        .prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)")
        .bind(magicToken.user_id, sessionToken, sessionExpiry.toISOString())
        .run();

    cookies.set("session", sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        expires: sessionExpiry,
        path: "/",
    });

    return redirect("/");
};
