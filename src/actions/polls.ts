import { defineAction, ActionError } from "astro:actions";
import { z } from "zod";
import { env } from "cloudflare:workers";
import { CreatePollSchema } from "./schemas/polls";
import { sendPollInviteEmail, sendFinalizationEmail } from "../lib/email";

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

            const db = env.DB;
            const token = makeToken();

            const creatorId = context.locals.user?.id ?? null;

            const pollInsert = await db
                .prepare(
                    `INSERT INTO polls (token, title, description, timezone, creator_id)
           VALUES (?, ?, ?, ?, ?)
           RETURNING id`
                )
                .bind(token, title, description ?? null, timezone, creatorId)
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

export const lockPoll = defineAction({
    accept: "form",
    input: z.object({
        token: z.string(),
        optionId: z.coerce.number().int(),
    }),

    async handler(input, context) {
        const userId = context.locals.user?.id;
        if (!userId) {
            throw new ActionError({ code: "UNAUTHORIZED", message: "You must be logged in to finalize a poll." });
        }

        const db = env.DB;

        const poll = await db
            .prepare(`SELECT id, title, timezone FROM polls WHERE token = ? AND creator_id = ?`)
            .bind(input.token, userId)
            .first<{ id: number; title: string; timezone: string }>();

        if (!poll) {
            throw new ActionError({ code: "FORBIDDEN", message: "Poll not found or you are not the creator." });
        }

        const option = await db
            .prepare(`SELECT id, option_datetime FROM poll_options WHERE id = ? AND poll_id = ?`)
            .bind(input.optionId, poll.id)
            .first<{ id: number; option_datetime: string }>();

        if (!option) {
            throw new ActionError({ code: "BAD_REQUEST", message: "Invalid option." });
        }

        await db
            .prepare(`UPDATE polls SET chosen_option_id = ? WHERE id = ?`)
            .bind(input.optionId, poll.id)
            .run();

        const origin = new URL(context.request.url).origin;
        const pollUrl = `${origin}/poll/${input.token}`;
        const calendarUrl = `${origin}/poll/${input.token}/calendar.ics`;

        const recipients = (
            await db
                .prepare(`
                    SELECT COALESCE(u.email, pa.email) AS email
                    FROM participants pa
                    LEFT JOIN users u ON u.id = pa.user_id
                    WHERE pa.poll_id = ?
                      AND (pa.user_id IS NOT NULL OR pa.email IS NOT NULL)
                `)
                .bind(poll.id)
                .all<{ email: string }>()
        ).results;

        // Fire and forget — email failures don't block the lock
        Promise.allSettled(
            recipients.map((r) =>
                sendFinalizationEmail(env.EMAIL, r.email, poll.title, option.option_datetime, pollUrl, calendarUrl)
            )
        ).catch(() => {});

        return { ok: true };
    },
});

export const inviteParticipants = defineAction({
    accept: "form",
    input: z.object({
        token: z.string(),
        emails: z.string().min(1, "Enter at least one email address."),
    }),

    async handler(input, context) {
        const userId = context.locals.user?.id;
        const userEmail = context.locals.user?.email;
        if (!userId || !userEmail) {
            throw new ActionError({ code: "UNAUTHORIZED", message: "You must be logged in to send invites." });
        }

        const db = env.DB;

        const poll = await db
            .prepare(`SELECT id, title FROM polls WHERE token = ? AND creator_id = ?`)
            .bind(input.token, userId)
            .first<{ id: number; title: string }>();

        if (!poll) {
            throw new ActionError({ code: "FORBIDDEN", message: "Poll not found or you are not the creator." });
        }

        const addresses = input.emails
            .split(/[\s,;]+/)
            .map((e) => e.trim().toLowerCase())
            .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

        const unique = [...new Set(addresses)].slice(0, 20);

        if (unique.length === 0) {
            throw new ActionError({ code: "BAD_REQUEST", message: "No valid email addresses found." });
        }

        const origin = new URL(context.request.url).origin;
        const pollUrl = `${origin}/poll/${input.token}`;

        await Promise.all(
            unique.map(async (email) => {
                // Find or create a participant row for this invitee so we can send a unique link
                const existing = await db
                    .prepare(`SELECT edit_token FROM participants WHERE poll_id = ? AND email = ?`)
                    .bind(poll.id, email)
                    .first<{ edit_token: string }>();

                const editToken = existing?.edit_token ?? crypto.randomUUID().replace(/-/g, "");

                if (!existing) {
                    await db
                        .prepare(`INSERT INTO participants (poll_id, email, edit_token) VALUES (?, ?, ?)`)
                        .bind(poll.id, email, editToken)
                        .run();
                }

                const inviteUrl = `${pollUrl}?invite=${editToken}`;
                return sendPollInviteEmail(env.EMAIL, email, poll.title, inviteUrl, userEmail);
            })
        );

        return { ok: true, count: unique.length };
    },
});
