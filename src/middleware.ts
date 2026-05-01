import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";

// Poll pages and the home/create pages are publicly accessible.
// Magic-link auth paths must also be public.
const PUBLIC_PATHS = ["/", "/login", "/auth/verify", "/auth/passkey-", "/poll/", "/create"];

export const onRequest = defineMiddleware(async (context, next) => {
    const sessionToken = context.cookies.get("session")?.value;

    if (sessionToken) {
        const now = new Date().toISOString();

        const row = await env.DB
            .prepare(
                `SELECT s.user_id, u.email
                 FROM sessions s
                 JOIN users u ON u.id = s.user_id
                 WHERE s.token = ? AND s.expires_at > ?`
            )
            .bind(sessionToken, now)
            .first<{ user_id: number; email: string }>();

        if (row) {
            context.locals.user = { id: row.user_id, email: row.email };
        }
    }

    const { pathname } = context.url;
    const isPublic = pathname === "/" || PUBLIC_PATHS.some((p) => p !== "/" && pathname.startsWith(p));
    const isApi = pathname.startsWith("/api/");

    if (!context.locals.user && !isPublic && !isApi) {
        return context.redirect("/login");
    }

    return next();
});
