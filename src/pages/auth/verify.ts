import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ url, locals, cookies, redirect }) => {
    const token = url.searchParams.get("token");

    if (!token) {
        return redirect("/login?error=missing_token");
    }

    const db = locals.runtime.env.DB;
    const now = new Date().toISOString();

    const magicToken = await db
        .prepare(
            `SELECT id, user_id FROM magic_tokens
             WHERE token = ? AND used = 0 AND expires_at > ?`
        )
        .bind(token, now)
        .first<{ id: number; user_id: number }>();

    if (!magicToken) {
        return redirect("/login?error=invalid_token");
    }

    await db
        .prepare("UPDATE magic_tokens SET used = 1 WHERE id = ?")
        .bind(magicToken.id)
        .run();

    const sessionToken = crypto.randomUUID().replace(/-/g, "");
    const sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db
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
