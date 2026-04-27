import { defineAction, ActionError } from "astro:actions";
import { env } from "cloudflare:workers";
import { SubmitVoteSchema } from "./schemas/votes";

export const submitVote = defineAction({
    accept: "form",
    input: SubmitVoteSchema,

    async handler(input, context) {
        const db = env.DB;

        try {
            const poll = await db
                .prepare(`SELECT id FROM polls WHERE token = ?`)
                .bind(input.token)
                .first<{ id: number }>();

            if (!poll) {
                throw new ActionError({ code: "BAD_REQUEST", message: "Unknown poll token." });
            }

            const pollId = poll.id;
            const userId = context.locals.user?.id ?? null;
            const name = input.name?.trim() || context.locals.user?.email || null;

            let participantId: number;

            // Logged-in users get their existing response updated (upsert).
            const existing = userId
                ? await db
                    .prepare(`SELECT id FROM participants WHERE poll_id = ? AND user_id = ?`)
                    .bind(pollId, userId)
                    .first<{ id: number }>()
                : null;

            if (existing) {
                participantId = existing.id;
                await db
                    .prepare(`UPDATE participants SET name = ? WHERE id = ?`)
                    .bind(name, participantId)
                    .run();
                await db
                    .prepare(`DELETE FROM votes WHERE participant_id = ?`)
                    .bind(participantId)
                    .run();
            } else {
                const editToken = crypto.randomUUID().replace(/-/g, "");
                const row = await db
                    .prepare(
                        `INSERT INTO participants (poll_id, name, edit_token, user_id) VALUES (?, ?, ?, ?) RETURNING id`
                    )
                    .bind(pollId, name, editToken, userId)
                    .first<{ id: number }>();
                if (!row) throw new Error("Failed to insert participant.");
                participantId = row.id;
            }

            // Store ALL vote states (including busy=0), so we know who has responded.
            const voteStmt = db.prepare(
                `INSERT INTO votes (participant_id, option_id, availability) VALUES (?, ?, ?)`
            );
            for (const v of input.voteData) {
                await voteStmt.bind(participantId, v.optionId, v.availability).run();
            }

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
