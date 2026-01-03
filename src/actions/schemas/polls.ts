// src/actions/schemas/polls.ts
import { z } from "zod";

export const CreatePollSchema = z.object({
    title: z.string().min(1, "Poll title is required."),

    description: z
        .string()
        .transform((v) => v.trim())
        .optional()
        .or(z.literal(""))
        .transform((v) => (v.length ? v : undefined)),

    timezone: z.string().min(1, "Timezone is required."),

    // Whatever you called the date/time inputs; this matches our current action
    options: z
        .union([
            z.array(z.string().optional().nullable()),
            z.string().optional().nullable(),
        ])
        .transform((v) => (Array.isArray(v) ? v : v == null ? [] : [v])),
});
