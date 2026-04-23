import { defineAction, ActionError } from "astro:actions";
import { SubmitVoteSchema } from "./schemas/votes";

export const submitVoteDebug = defineAction({
    accept: "form",
    input: SubmitVoteSchema,

    async handler(input, context) {
        const db = context.locals?.runtime?.env?.DB;
        if (!db) {
            throw new ActionError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Database (D1) is not available. Check Cloudflare Pages binding configuration: Settings → Bindings → D1 database.",
            });
        }

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
            // Use provided name, or fall back to logged-in email, or null
            const name = input.name?.trim() || context.locals.user?.email || null;

            let participantId: number;

            // If logged in, find an existing participant row for this user+poll
            const existing = userId
                ? await db
                    .prepare(`SELECT id FROM participants WHERE poll_id = ? AND user_id = ?`)
                    .bind(pollId, userId)
                    .first<{ id: number }>()
                : null;

            if (existing) {
                participantId = existing.id;
                // Update display name in case it changed
                await db
                    .prepare(`UPDATE participants SET name = ? WHERE id = ?`)
                    .bind(name, participantId)
                    .run();
                // Wipe old votes so we can replace them cleanly
                await db
                    .prepare(`DELETE FROM votes WHERE participant_id = ?`)
                    .bind(participantId)
                    .run();
            } else {
                const editToken = crypto.randomUUID().replace(/-/g, "");
                const row = await db
                    .prepare(`INSERT INTO participants (poll_id, name, edit_token, user_id) VALUES (?, ?, ?, ?) RETURNING id`)
                    .bind(pollId, name, editToken, userId)
                    .first<{ id: number }>();
                if (!row) throw new Error("Failed to insert participant.");
                participantId = row.id;
            }

            // Insert fresh votes
            const voteStmt = db.prepare(
                `INSERT INTO votes (participant_id, option_id, availability) VALUES (?, ?, ?)`
            );
            for (const optionId of input.optionIds) {
                await voteStmt.bind(participantId, optionId, 1).run();
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
