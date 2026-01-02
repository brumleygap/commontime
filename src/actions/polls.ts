import { defineAction } from "astro:actions";
import { CreatePollSchema } from "./schemas/polls";

function makeToken(length = 12) {
    const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let out = "";
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    for (const b of bytes) out += alphabet[b % alphabet.length];
    return out;
}

export const createPoll = defineAction({
    accept: "form",
    input: CreatePollSchema,

    async handler({ title, description, timezone, options }, context) {
        const db = context.locals.runtime.env.DB;

        const token = makeToken(12);

        const cleanOptions = options.filter((s) => s && s.trim().length > 0);

        const pollInsert = await db
            .prepare(
                `INSERT INTO polls (token, title, description, timezone)
         VALUES (?, ?, ?, ?)
         RETURNING id`
            )
            .bind(token, title, description ?? null, timezone)
            .first<{ id: number }>();

        if (!pollInsert?.id) {
            throw new Error("Failed to create poll");
        }

        const pollId = pollInsert.id;

        const stmt = db.prepare(
            `INSERT INTO poll_options (poll_id, option_datetime)
       VALUES (?, ?)`
        );

        for (const dt of cleanOptions) {
            await stmt.bind(pollId, dt).run();
        }

        return { ok: true, token };
    },
});
