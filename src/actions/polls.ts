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
        try {
            const { title, description, timezone, options } = input;

            // Check database binding
            const db = context.locals?.runtime?.env?.DB;
            if (!db) {
                console.error("Database (D1) binding 'DB' is not available in action context");
                throw new ActionError({
                    code: "BAD_REQUEST",
                    message:
                        "Database (D1) is not available. Check Cloudflare Pages binding configuration: Settings → Functions → D1 Database Bindings.",
                });
            }

            const token = makeToken();

            const pollInsert = await db
                .prepare(
                    `INSERT INTO polls (token, title, description, timezone)
           VALUES (?, ?, ?, ?)
           RETURNING id`
                )
                .bind(token, title, description ?? null, timezone)
                .first<{ id: number }>();

            if (!pollInsert || !pollInsert.id) {
                console.error("Poll insert failed - no id returned");
                throw new ActionError({
                    code: "BAD_REQUEST",
                    message: "Failed to create poll (no id returned). Check database schema.",
                });
            }

            const pollId = pollInsert.id;

            // Insert options using batch
            if (!options || options.length === 0) {
                console.error("No options to insert");
                throw new ActionError({
                    code: "BAD_REQUEST",
                    message: "At least one date & time option is required.",
                });
            }

            const optionInserts = options.map(dt =>
                db.prepare(
                    `INSERT INTO poll_options (poll_id, option_datetime)
                     VALUES (?, ?)`
                ).bind(pollId, dt)
            );

            await db.batch(optionInserts);

            return { ok: true, token };
        } catch (err: any) {
            // If it's already an ActionError, re-throw it as-is
            if (err instanceof ActionError) {
                throw err;
            }

            // Log error for debugging
            console.error("createPoll failed:", err);

            // Otherwise, wrap it with a proper message
            const errorMessage = err?.message || String(err) || "Unknown error";
            throw new ActionError({
                code: "BAD_REQUEST",
                message: `Failed to create poll: ${errorMessage}`,
            });
        }
    },
});
