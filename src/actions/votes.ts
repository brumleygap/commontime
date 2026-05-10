import { defineAction, ActionError } from "astro:actions";
import { env } from "cloudflare:workers";
import { SubmitVoteSchema } from "./schemas/votes";
import { sendPushToUsers } from "../lib/webpush";
import { makeToken } from "../lib/tokens";

export const submitVote = defineAction({
    accept: "form",
    input: SubmitVoteSchema,

    async handler(input, context) {
        const db = env.DB;

        try {
            const poll = await db
                .prepare(`SELECT id, title, creator_id, chosen_option_id FROM polls WHERE token = ?`)
                .bind(input.token)
                .first<{ id: number; title: string; creator_id: number | null; chosen_option_id: number | null }>();

            if (!poll) {
                throw new ActionError({ code: "BAD_REQUEST", message: "Unknown poll token." });
            }

            const pollId = poll.id;
            const userId = context.locals.user?.id ?? null;
            const name = input.name?.trim() || context.locals.user?.email || null;

            let participantId: number;
            let isExistingParticipant = false;

            if (userId) {
                // Logged-in user: upsert by user_id
                const existing = await db
                    .prepare(`SELECT id FROM participants WHERE poll_id = ? AND user_id = ?`)
                    .bind(pollId, userId)
                    .first<{ id: number }>();

                if (existing) {
                    participantId = existing.id;
                    isExistingParticipant = true;
                    await db.prepare(`UPDATE participants SET name = ? WHERE id = ?`).bind(name, participantId).run();
                } else {
                    const editToken = makeToken(8);
                    const row = await db
                        .prepare(`INSERT INTO participants (poll_id, name, edit_token, user_id) VALUES (?, ?, ?, ?) RETURNING id`)
                        .bind(pollId, name, editToken, userId)
                        .first<{ id: number }>();
                    if (!row) throw new Error("Failed to insert participant.");
                    participantId = row.id;
                }

                // Keep users.name in sync with whatever name the user submitted
                if (name) {
                    await db.prepare(`UPDATE users SET name = ? WHERE id = ?`).bind(name, userId).run();
                }
            } else if (input.invite) {
                // Invited via unique link: must be the browser that originally claimed it
                if (poll.chosen_option_id !== null) {
                    throw new ActionError({ code: "BAD_REQUEST", message: "This poll has been finalized." });
                }

                const hasCookie = !!context.cookies.get(`ct_inv_${input.invite}`)?.value;
                if (!hasCookie) {
                    throw new ActionError({ code: "FORBIDDEN", message: "This invite link has already been claimed." });
                }

                const invited = await db
                    .prepare(`SELECT id FROM participants WHERE edit_token = ? AND poll_id = ?`)
                    .bind(input.invite, pollId)
                    .first<{ id: number }>();

                if (!invited) {
                    throw new ActionError({ code: "BAD_REQUEST", message: "Invalid invite link." });
                }

                participantId = invited.id;
                isExistingParticipant = true;
                await db.prepare(`UPDATE participants SET name = ? WHERE id = ?`).bind(name, participantId).run();
            } else {
                // Anonymous visitor: email is required
                if (!input.email) {
                    throw new ActionError({ code: "BAD_REQUEST", message: "An email address is required." });
                }
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
                    throw new ActionError({ code: "BAD_REQUEST", message: "Please enter a valid email address." });
                }

                // Upsert by email — handles cross-device returns (e.g. opened invite on phone,
                // voting on laptop) without creating a duplicate participant row.
                const existing = await db
                    .prepare(`SELECT id FROM participants WHERE poll_id = ? AND email = ?`)
                    .bind(pollId, input.email)
                    .first<{ id: number }>();

                if (existing) {
                    participantId = existing.id;
                    isExistingParticipant = true;
                    await db.prepare(`UPDATE participants SET name = ? WHERE id = ?`).bind(name, participantId).run();
                } else {
                    const editToken = makeToken(8);
                    const row = await db
                        .prepare(`INSERT INTO participants (poll_id, name, edit_token, email) VALUES (?, ?, ?, ?) RETURNING id`)
                        .bind(pollId, name, editToken, input.email)
                        .first<{ id: number }>();
                    if (!row) throw new Error("Failed to insert participant.");
                    participantId = row.id;
                }
            }

            // Delete existing votes and insert new ones atomically so a failed
            // re-submit never leaves a participant with partial votes.
            const voteStmt = db.prepare(
                `INSERT INTO votes (participant_id, option_id, availability) VALUES (?, ?, ?)`
            );
            await db.batch([
                ...(isExistingParticipant
                    ? [db.prepare(`DELETE FROM votes WHERE participant_id = ?`).bind(participantId)]
                    : []),
                ...input.voteData.map(v => voteStmt.bind(participantId, v.optionId, v.availability)),
            ]);

            // Notify the poll creator that someone voted (skip if creator is voting on their own poll)
            if (poll.creator_id && poll.creator_id !== userId) {
                const voterName = input.name?.trim() || input.email || "Someone";
                const origin = new URL(context.request.url).origin;
                await sendPushToUsers(
                    [poll.creator_id],
                    poll.title,
                    `${voterName} just voted.`,
                    `${origin}/poll/${input.token}`,
                    env.DB,
                    { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT },
                );
            }

            // Ensure the poll appears in recent_polls after voting (the poll page sets this
            // on first visit, but keep it fresh here in case the cookie expired).
            const prev = context.cookies.get("recent_polls")?.value ?? "";
            const tokens = prev ? prev.split(",").filter(Boolean) : [];
            if (!tokens.includes(input.token)) tokens.unshift(input.token);
            context.cookies.set("recent_polls", tokens.slice(0, 10).join(","), {
                path: "/",
                maxAge: 60 * 60 * 24 * 90,
                sameSite: "lax",
                secure: true,
                httpOnly: true,
            });

            return { ok: true };
        } catch (err: any) {
            if (err instanceof ActionError) throw err;
            console.error("submitVote failed:", err);
            throw new ActionError({
                code: "BAD_REQUEST",
                message: err?.message ?? "Unknown error while saving vote.",
            });
        }
    },
});
