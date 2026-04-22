import { defineMiddleware } from "astro:middleware";

const PUBLIC_PATHS = ["/login", "/auth/verify"];

export const onRequest = defineMiddleware(async (context, next) => {
    const sessionToken = context.cookies.get("session")?.value;

    if (sessionToken) {
        const db = context.locals?.runtime?.env?.DB;
        if (!db) return next();
        const now = new Date().toISOString();

        const row = await db
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
    const isPublic =
        PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
        pathname.startsWith("/poll/");

    if (!context.locals.user && !isPublic) {
        return context.redirect("/login");
    }

    return next();
});
