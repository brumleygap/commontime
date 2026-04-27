import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const POST: APIRoute = async ({ cookies, redirect }) => {
    const sessionToken = cookies.get("session")?.value;

    if (sessionToken) {
        await env.DB
            .prepare("DELETE FROM sessions WHERE token = ?")
            .bind(sessionToken)
            .run();
    }

    cookies.delete("session", { path: "/" });
    return redirect("/login");
};
