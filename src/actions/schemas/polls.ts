import { z } from "zod";

export const CreatePollSchema = z.object({
    title: z.string().min(1, "Poll title is required").max(200),
    description: z.string().max(1000).optional(),
    timezone: z.string().min(1, "Timezone is required"),

    options: z
        .preprocess((val) => (Array.isArray(val) ? val : [val]), z.array(z.string()))
        .transform((arr) => arr.map((s) => (s ?? "").trim()).filter(Boolean))
        .refine((arr) => arr.length >= 1, "At least one date/time option is required"),
});
