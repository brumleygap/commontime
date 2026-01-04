// src/actions/polls.ts
import { defineAction, ActionError } from "astro:actions";
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

    async handler(input, context) {
        const { title, description, timezone, options } = input;

        const db = context.locals.runtime.env.DB;
        if (!db) {
            throw new ActionError({
                code: "BAD_REQUEST",
                message: "Database (D1) is not available on context.locals.runtime.env.DB",
            });
        }

        try {
            // Schema already trimmed/filtered and enforced min(1),
            // but trimming again is harmless and keeps DB tidy.
            const cleanOptions = options.map((dt) => dt.trim()).filter(Boolean);

            const token = makeToken();

            // Insert poll
            const pollInsert = await db
                .prepare(
                    `INSERT INTO polls (token, title, description, timezone)
           VALUES (?, ?, ?, ?)
           RETURNING id`
                )
                .bind(token, title, description ?? null, timezone)
                .first<{ id: number }>();

            if (!pollInsert) {
                throw new ActionError({
                    code: "BAD_REQUEST",
                    message: "Failed to create poll (no id returned).",
                });
            }

            const pollId = pollInsert.id;

            // Insert options
            const stmt = db.prepare(
                `INSERT INTO poll_options (poll_id, option_datetime)
         VALUES (?, ?)`
            );

            for (const dt of cleanOptions) {
                await stmt.bind(pollId, dt).run();
            }

            return { ok: true, token };
        } catch (err: any) {
            console.error("createPoll failed:", err);

            throw new ActionError({
                code: "BAD_REQUEST",
                message: err?.message ?? "Unknown error while creating poll. Check D1 schema.",
            });
        }
    },
});
