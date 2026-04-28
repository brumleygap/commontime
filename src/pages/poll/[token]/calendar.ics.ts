import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ params }) => {
    const { token } = params;
    const db = env.DB;

    const row = await db
        .prepare(`
            SELECT p.title, p.description, p.timezone, po.option_datetime
            FROM polls p
            JOIN poll_options po ON po.id = p.chosen_option_id
            WHERE p.token = ? AND p.chosen_option_id IS NOT NULL
        `)
        .bind(token)
        .first<{ title: string; description: string | null; timezone: string; option_datetime: string }>();

    if (!row) {
        return new Response("Not found", { status: 404 });
    }

    // "YYYY-MM-DDTHH:MM[:SS]" → "YYYYMMDDTHHMMSS"
    const toIcsLocal = (dt: string) =>
        dt.replace(/[-:]/g, "").replace(/\.\d+/, "").slice(0, 15).padEnd(15, "0");

    const startMs = new Date(row.option_datetime).getTime();
    const endIso = new Date(startMs + 60 * 60 * 1000).toISOString().slice(0, 16);
    const dtstamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";

    const esc = (s: string) =>
        s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//CommonTime//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:${token}@commontime.app`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;TZID=${row.timezone}:${toIcsLocal(row.option_datetime)}`,
        `DTEND;TZID=${row.timezone}:${toIcsLocal(endIso)}`,
        `SUMMARY:${esc(row.title)}`,
        ...(row.description ? [`DESCRIPTION:${esc(row.description)}`] : []),
        "END:VEVENT",
        "END:VCALENDAR",
    ];

    return new Response(lines.join("\r\n"), {
        headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": 'attachment; filename="event.ics"',
        },
    });
};
