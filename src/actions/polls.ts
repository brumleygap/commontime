import { defineAction, ActionError } from "astro:actions";
import { z } from "zod";
import { env } from "cloudflare:workers";
import { CreatePollSchema } from "./schemas/polls";
import { sendPollInviteEmail, sendFinalizationEmail, sendReopenEmail } from "../lib/email";

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
            .prepare(`SELECT id, title, description, timezone FROM polls WHERE token = ? AND creator_id = ?`)
            .bind(input.token, userId)
            .first<{ id: number; title: string; description: string | null; timezone: string }>();

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

        const recipients: { email: string }[] = (
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

        console.log(`lockPoll: sending finalization emails to ${recipients.length} recipient(s):`, recipients.map(r => r.email));
        const sendResults = await Promise.allSettled(
            recipients.map((r: { email: string }) =>
                sendFinalizationEmail(env.EMAIL, r.email, poll.title, poll.description, option.option_datetime, pollUrl, calendarUrl)
            )
        );
        sendResults.forEach((r, i) => {
            if (r.status === "rejected") {
                console.error(`lockPoll: failed to send finalization email to ${recipients[i].email}:`, r.reason);
            }
        });

        return { ok: true };
    },
});

export const inviteParticipants = defineAction({
    accept: "form",
    input: z.object({
        token: z.string(),
        name: z.string().min(1, "Please enter the invitee's name."),
        email: z.email("Please enter a valid email address."),
    }),

    async handler(input, context) {
        const userId = context.locals.user?.id;
        const userEmail = context.locals.user?.email;
        if (!userId || !userEmail) {
            throw new ActionError({ code: "UNAUTHORIZED", message: "You must be logged in to send invites." });
        }

        const db = env.DB;

        const poll = await db
            .prepare(`SELECT id, title, description FROM polls WHERE token = ? AND creator_id = ?`)
            .bind(input.token, userId)
            .first<{ id: number; title: string; description: string | null }>();

        if (!poll) {
            throw new ActionError({ code: "FORBIDDEN", message: "Poll not found or you are not the creator." });
        }

        const inviteeEmail = input.email.trim().toLowerCase();
        const inviteeName = input.name.trim();

        // Find or create the invitee's user account
        let invitee = await db
            .prepare(`SELECT id, name FROM users WHERE email = ?`)
            .bind(inviteeEmail)
            .first<{ id: number; name: string | null }>();

        if (!invitee) {
            invitee = await db
                .prepare(`INSERT INTO users (email, name) VALUES (?, ?) RETURNING id, name`)
                .bind(inviteeEmail, inviteeName)
                .first<{ id: number; name: string | null }>();
        } else if (!invitee.name) {
            await db
                .prepare(`UPDATE users SET name = ? WHERE id = ?`)
                .bind(inviteeName, invitee.id)
                .run();
        }

        if (!invitee) {
            throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create invitee account." });
        }

        // Ensure a participant row exists for this user+poll
        const existingParticipant = await db
            .prepare(`SELECT id FROM participants WHERE poll_id = ? AND user_id = ?`)
            .bind(poll.id, invitee.id)
            .first<{ id: number }>();

        if (!existingParticipant) {
            const editToken = crypto.randomUUID().replace(/-/g, "");
            await db
                .prepare(`INSERT INTO participants (poll_id, name, edit_token, user_id, email) VALUES (?, ?, ?, ?, ?)`)
                .bind(poll.id, inviteeName, editToken, invitee.id, inviteeEmail)
                .run();
        }

        // Create a 7-day invite token
        const inviteToken = crypto.randomUUID().replace(/-/g, "");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        await db
            .prepare(`INSERT INTO invites (poll_id, invitee_user_id, invited_by_user_id, token, expires_at) VALUES (?, ?, ?, ?, ?)`)
            .bind(poll.id, invitee.id, userId, inviteToken, expiresAt)
            .run();

        const origin = new URL(context.request.url).origin;
        const inviteUrl = `${origin}/auth/invite?token=${inviteToken}`;
        const creatorName = context.locals.user?.name ?? userEmail;

        console.log(`inviteParticipants: sending invites for poll ${poll.id} to:`, unique);
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
                    console.log(`inviteParticipants: created participant row for ${email}`);
                } else {
                    console.log(`inviteParticipants: reusing existing participant row for ${email}`);
                }

                const inviteUrl = `${pollUrl}?invite=${editToken}`;
                console.log(`inviteParticipants: sending invite email to ${email}`);
                const result = await sendPollInviteEmail(env.EMAIL, email, poll.title, poll.description, inviteUrl, userEmail);
                console.log(`inviteParticipants: invite email sent to ${email}`);
                return result;
            })
        );

        return { ok: true, count: 1 };
    },
});

export const unlockPoll = defineAction({
    accept: "form",
    input: z.object({ token: z.string() }),

    async handler(input, context) {
        const userId = context.locals.user?.id;
        if (!userId) {
            throw new ActionError({ code: "UNAUTHORIZED", message: "You must be logged in to re-open a poll." });
        }

        const db = env.DB;

        const poll = await db
            .prepare(`SELECT id, title FROM polls WHERE token = ? AND creator_id = ?`)
            .bind(input.token, userId)
            .first<{ id: number; title: string }>();

        if (!poll) {
            throw new ActionError({ code: "FORBIDDEN", message: "Poll not found or you are not the creator." });
        }

        await db
            .prepare(`UPDATE polls SET chosen_option_id = NULL WHERE id = ?`)
            .bind(poll.id)
            .run();

        const origin = new URL(context.request.url).origin;
        const pollUrl = `${origin}/poll/${input.token}`;

        const recipients: { email: string }[] = (
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

        console.log(`unlockPoll: sending reopen emails to ${recipients.length} recipient(s):`, recipients.map(r => r.email));
        const reopenResults = await Promise.allSettled(
            recipients.map((r: { email: string }) => sendReopenEmail(env.EMAIL, r.email, poll.title, pollUrl))
        );
        reopenResults.forEach((r, i) => {
            if (r.status === "rejected") {
                console.error(`unlockPoll: failed to send reopen email to ${recipients[i].email}:`, r.reason);
            }
        });

        return { ok: true };
    },
});
