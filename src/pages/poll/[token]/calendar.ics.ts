import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ params }) => {
    const { token } = params;
    const db = env.DB;

    const rows = (await db
        .prepare(`
            SELECT p.title, p.description, p.timezone, po.option_datetime, po.id
            FROM polls p
            JOIN chosen_poll_options cpo ON cpo.poll_id = p.id
            JOIN poll_options po ON po.id = cpo.option_id
            WHERE p.token = ? AND p.chosen_option_id IS NOT NULL
            ORDER BY po.option_datetime ASC
        `)
        .bind(token)
        .all<{ title: string; description: string | null; timezone: string; option_datetime: string; id: number }>()
    ).results;

    if (rows.length === 0) {
        return new Response("Not found", { status: 404 });
    }

    const toIcsLocal = (dt: string) =>
        dt.replace(/[-:]/g, "").replace(/\.\d+/, "").slice(0, 15).padEnd(15, "0");

    const dtstamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";

    const esc = (s: string) =>
        s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

    const { title, description, timezone } = rows[0];

    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//CommonTime//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ];

    for (const row of rows) {
        const startMs = new Date(row.option_datetime).getTime();
        const endIso = new Date(startMs + 60 * 60 * 1000).toISOString().slice(0, 16);
        lines.push(
            "BEGIN:VEVENT",
            `UID:${token}-${row.id}@commontime.app`,
            `DTSTAMP:${dtstamp}`,
            `DTSTART;TZID=${timezone}:${toIcsLocal(row.option_datetime)}`,
            `DTEND;TZID=${timezone}:${toIcsLocal(endIso)}`,
            `SUMMARY:${esc(title)}`,
            ...(description ? [`DESCRIPTION:${esc(description)}`] : []),
            "END:VEVENT",
        );
    }

    lines.push("END:VCALENDAR");

    return new Response(lines.join("\r\n"), {
        headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": 'attachment; filename="event.ics"',
        },
    });
};
