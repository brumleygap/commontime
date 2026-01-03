// src/actions/schemas/votes.ts
import { z } from "zod";

export const SubmitVoteSchema = z.object({
    token: z.string().min(1),

    // empty input often arrives as null
    name: z
        .union([z.string(), z.null()])
        .transform((v) => (typeof v === "string" ? v.trim() : ""))
        .transform((v) => (v.length ? v : undefined))
        .optional(),

    // checkboxes: single value, multiple values, or none
    optionIds: z
        .union([
            z.array(z.coerce.number().int()), // multiple checkboxes
            z.coerce.number().int(),          // single checkbox
            z.null(),                         // none
        ])
        .transform((v) =>
            Array.isArray(v) ? v : v == null ? [] : [v]
        )
        .refine((arr) => arr.length >= 1, "Pick at least one time option."),
});
