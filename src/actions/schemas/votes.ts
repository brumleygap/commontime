import { z } from "zod";

export const SubmitVoteSchema = z.object({
    token: z.string().min(1),

    name: z
        .union([z.string(), z.null()])
        .transform((v) => (typeof v === "string" ? v.trim() : ""))
        .transform((v) => (v.length ? v : undefined))
        .optional(),

    // JSON-encoded array of {optionId, availability} pairs.
    // availability: 0=busy, 1=yes, 2=maybe
    voteData: z.preprocess(
        (v) => {
            if (typeof v === "string") {
                try { return JSON.parse(v); } catch { return []; }
            }
            return Array.isArray(v) ? v : [];
        },
        z
            .array(
                z.object({
                    optionId: z.coerce.number().int().positive(),
                    availability: z.coerce.number().int().min(0).max(2),
                })
            )
            .min(1, "Vote data is required.")
    ),
});
