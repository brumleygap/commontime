function toCalLocal(dt: string): string {
    return dt.replace(/[-:]/g, "").replace(/\.\d+/, "").slice(0, 15).padEnd(15, "0");
}

function gmtOffsetToIso(gmtOffset: string): string {
    const match = gmtOffset.match(/GMT([+-])(\d+)(?::(\d+))?/);
    if (!match) return "+00:00";
    const sign = match[1];
    const hours = match[2].padStart(2, "0");
    const mins = (match[3] ?? "0").padStart(2, "0");
    return `${sign}${hours}:${mins}`;
}

export function gcalUrl(dt: string, title: string, description: string | null, timezone: string, durationMinutes: number): string {
    const start = toCalLocal(dt);
    const end = toCalLocal(new Date(new Date(dt).getTime() + durationMinutes * 60000).toISOString().slice(0, 16));
    const params = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${start}/${end}`, ctz: timezone });
    if (description) params.set("details", description);
    return `https://calendar.google.com/calendar/render?${params}`;
}

export function outlookUrl(dt: string, title: string, description: string | null, timezone: string, durationMinutes: number): string {
    // Derive the UTC offset for this timezone at this datetime (DST-aware) so
    // Outlook receives a fully-qualified ISO 8601 timestamp instead of a bare
    // local string that Outlook would interpret in the recipient's browser timezone.
    const approxDate = new Date(dt);
    const tzParts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "shortOffset" }).formatToParts(approxDate);
    const offset = gmtOffsetToIso(tzParts.find(p => p.type === "timeZoneName")?.value ?? "GMT");

    const cleanStart = dt.replace(/\.\d+$/, "").slice(0, 19);
    // cleanEnd is computed by treating dt as UTC and adding duration — valid because
    // both start and end shift by the same amount, preserving the local clock difference.
    // Known limitation: if the duration spans a DST transition, the end offset will be
    // off by 1 hour. Acceptable given how rarely meetings straddle a 2 AM clock change.
    const cleanEnd = new Date(approxDate.getTime() + durationMinutes * 60000).toISOString().slice(0, 19);

    const params = new URLSearchParams({
        subject: title,
        startdt: `${cleanStart}${offset}`,
        enddt: `${cleanEnd}${offset}`,
        path: "/calendar/action/compose",
        rru: "addevent",
    });
    if (description) params.set("body", description);
    return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}

export type IcsRow = { title: string; description: string | null; timezone: string; duration_minutes: number; option_datetime: string; id: number };

interface D1Queryable {
    prepare(sql: string): { bind(...args: unknown[]): { all<T>(): Promise<{ results: T[] }> } };
}

export async function fetchIcsRows(db: D1Queryable, token: string): Promise<IcsRow[]> {
    return (await db
        .prepare(`
            SELECT p.title, p.description, p.timezone, p.duration_minutes, po.option_datetime, po.id
            FROM polls p
            JOIN chosen_poll_options cpo ON cpo.poll_id = p.id
            JOIN poll_options po ON po.id = cpo.option_id
            WHERE p.token = ? AND p.chosen_option_id IS NOT NULL
            ORDER BY po.option_datetime ASC
        `)
        .bind(token)
        .all<IcsRow>()
    ).results;
}

export function buildIcsBody(rows: IcsRow[], token: string): string {
    const dtstamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";

    const esc = (s: string) =>
        s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

    const { title, description, timezone, duration_minutes } = rows[0];
    const durationMs = (duration_minutes ?? 60) * 60 * 1000;

    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//CommonTime//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ];

    for (const row of rows) {
        const startMs = new Date(row.option_datetime).getTime();
        const endIso = new Date(startMs + durationMs).toISOString().slice(0, 16);
        lines.push(
            "BEGIN:VEVENT",
            `UID:${token}-${row.id}@commontime.app`,
            `DTSTAMP:${dtstamp}`,
            `DTSTART;TZID=${timezone}:${toCalLocal(row.option_datetime)}`,
            `DTEND;TZID=${timezone}:${toCalLocal(endIso)}`,
            `SUMMARY:${esc(title)}`,
            ...(description ? [`DESCRIPTION:${esc(description)}`] : []),
            "END:VEVENT",
        );
    }

    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
}
