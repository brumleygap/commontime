import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { fetchIcsRows, buildIcsBody } from "../../../lib/calendar";

export const GET: APIRoute = async ({ params }) => {
    const { token } = params;
    const rows = await fetchIcsRows(env.DB, token!);

    if (rows.length === 0) {
        return new Response("Not found", { status: 404 });
    }

    return new Response(buildIcsBody(rows, token!), {
        headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": 'attachment; filename="event.ics"',
        },
    });
};
