import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ locals, cookies, redirect }) => {
    const sessionToken = cookies.get("session")?.value;

    if (sessionToken) {
        const db = locals?.runtime?.env?.DB;
        if (db) {
            await db
                .prepare("DELETE FROM sessions WHERE token = ?")
                .bind(sessionToken)
                .run();
        }
    }

    cookies.delete("session", { path: "/" });
    return redirect("/login");
};
