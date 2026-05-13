import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { buildIcsBody } from "../../../lib/calendar";

export const GET: APIRoute = async ({ params }) => {
    const { token } = params;
    const db = env.DB;

    const rows = (await db
        .prepare(`
            SELECT p.title, p.description, p.timezone, p.duration_minutes, po.option_datetime, po.id
            FROM polls p
            JOIN chosen_poll_options cpo ON cpo.poll_id = p.id
            JOIN poll_options po ON po.id = cpo.option_id
            WHERE p.token = ? AND p.chosen_option_id IS NOT NULL
            ORDER BY po.option_datetime ASC
        `)
        .bind(token)
        .all<{ title: string; description: string | null; timezone: string; duration_minutes: number; option_datetime: string; id: number }>()
    ).results;

    if (rows.length === 0) {
        return new Response("Not found", { status: 404 });
    }

    // No Content-Disposition header — browser/OS opens the file directly in the
    // default calendar app rather than saving it to Downloads.
    return new Response(buildIcsBody(rows, token!), {
        headers: {
            "Content-Type": "text/calendar; charset=utf-8",
        },
    });
};
