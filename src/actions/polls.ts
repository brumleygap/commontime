// src/actions/polls.ts
import { defineAction, ActionError } from "astro:actions";
import { CreatePollSchema } from "./schemas/polls";

function makeToken(length = 12) {
    const alphabet =
        "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let out = "";
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    for (const b of bytes) out += alphabet[b % alphabet.length];
    return out;
}

export const createPoll = defineAction({
    accept: "form",
    input: CreatePollSchema,

    handler: async (input, context) => {
        const { title, description, timezone, options } = input;

        // DEBUG: Log what we're receiving
        console.log("Raw input received:", input);
        console.log("📊 Received options:", options);
        console.log("📊 Options length:", options.length);
        console.log("📊 Options array:", JSON.stringify(options));
        const db = context.locals.runtime.env.DB;
        if (!db) {
            throw new ActionError({
                code: "BAD_REQUEST",
                message:
                    "Database (D1) is not available on context.locals.runtime.env.DB",
            });
        }

        try {
            const token = makeToken();

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

            // Insert options using batch
            const optionInserts = options.map(dt =>
                db.prepare(
                    `INSERT INTO poll_options (poll_id, option_datetime)
                     VALUES (?, ?)`
                ).bind(pollId, dt)
            );

            console.log("📊 About to insert", optionInserts.length, "options");

            await db.batch(optionInserts);

            console.log("✅ Successfully inserted options");

            return { ok: true, token };
        } catch (err: any) {
            console.error("createPoll failed:", err);
            throw new ActionError({
                code: "BAD_REQUEST",
                message:
                    err?.message ??
                    "Unknown error while creating poll. Check D1 schema / logs.",
            });
        }
    },
});
