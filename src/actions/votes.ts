// src/actions/votes.ts
import { defineAction, ActionError } from "astro:actions";
import { SubmitVoteSchema } from "./schemas/votes";

export const submitVoteDebug = defineAction({
    accept: "form",
    input: SubmitVoteSchema,

    async handler(input, context) {
        const db = context.locals.runtime.env.DB;

        if (!db) {
            throw new ActionError({
                code: "BAD_REQUEST",
                message: "Database (D1) is not available on context.locals.runtime.env.DB",
            });
        }

        try {
            // 1. Look up poll by its public token
            const poll = await db
                .prepare(
                    `SELECT id
           FROM polls
           WHERE token = ?`
                )
                .bind(input.token)
                .first<{ id: number }>();

            if (!poll) {
                throw new ActionError({
                    code: "BAD_REQUEST",
                    message: "Unknown poll token.",
                });
            }

            const pollId = poll.id;

            // 2. Insert participant
            // participants: id, poll_id, name, edit_token, created_at
            const editToken =
                (globalThis as any).crypto?.randomUUID?.() ??
                Math.random().toString(36).slice(2, 10);

            const participantRow = await db
                .prepare(
                    `INSERT INTO participants (poll_id, name, edit_token)
           VALUES (?, ?, ?)
           RETURNING id`
                )
                .bind(pollId, input.name ?? null, editToken)
                .first<{ id: number }>();

            const participantId = participantRow.id;

            // 3. Insert votes (one row per selected option)
            // votes: id, participant_id, option_id, availability
            // For now: availability = 1 means "available"
            const voteStmt = db.prepare(
                `INSERT INTO votes (participant_id, option_id, availability)
         VALUES (?, ?, ?)`
            );

            for (const optionId of input.optionIds) {
                await voteStmt.bind(participantId, optionId, 1).run();
            }

            // 4. Return debug info for the page
            return {
                ok: true,
                debug: {
                    token: input.token,
                    pollId,
                    participantId,
                    editToken,
                    name: input.name ?? null,
                    optionIds: input.optionIds,
                },
            };
        } catch (err: any) {
            console.error("submitVoteDebug failed:", err);

            throw new ActionError({
                code: "BAD_REQUEST",
                message:
                    err?.message ?? "Unknown error while saving vote. Check D1 schema / logs.",
            });
        }
    },
});
