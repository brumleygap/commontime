import z from "zod";

export const CreatePollSchema = z.object({
    title: z.string().min(1, "Poll title is required."),

    description: z
        .string()
        .optional()
        .transform((v) => (v?.trim() ? v.trim() : undefined)),

    timezone: z.string().min(1, "Timezone is required."),

    options: z.preprocess(
        (v) => {
            // Normalize: undefined/null -> []
            if (v == null) return [];

            // Normalize: string -> [string]
            if (typeof v === "string") return [v];

            // Normalize: array -> array
            if (Array.isArray(v)) return v;

            // Anything else -> []
            return [];
        },
        z
            .array(z.string())
            .transform((arr) => arr.map((s) => s.trim()).filter(Boolean))
            .refine((arr) => arr.length >= 1, {
                message: "Add at least one date & time option.",
            })
    ),
});
