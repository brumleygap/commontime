import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
    const token = url.searchParams.get("token");

    if (!token) {
        return redirect("/login?error=missing_token");
    }

    const now = new Date().toISOString();

    const invite = await env.DB
        .prepare(
            `SELECT i.id, i.invitee_user_id, p.token AS poll_token
             FROM invites i
             JOIN polls p ON p.id = i.poll_id
             WHERE i.token = ? AND i.used_at IS NULL AND i.expires_at > ?`
        )
        .bind(token, now)
        .first<{ id: number; invitee_user_id: number; poll_token: string }>();

    if (!invite) {
        return redirect("/login?error=invalid_token");
    }

    await env.DB
        .prepare("UPDATE invites SET used_at = ? WHERE id = ?")
        .bind(now, invite.id)
        .run();

    const sessionToken = crypto.randomUUID().replace(/-/g, "");
    const sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await env.DB
        .prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)")
        .bind(invite.invitee_user_id, sessionToken, sessionExpiry.toISOString())
        .run();

    cookies.set("session", sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        expires: sessionExpiry,
        path: "/",
    });

    return redirect(`/poll/${invite.poll_token}?welcomed=1`);
};
