import z from "zod";

export const CreatePollSchema = z.object({
    title: z.string().min(1, "Poll title is required."),

    description: z
        .string()
        .nullish()
        .transform((v) => (v?.trim() ? v.trim() : undefined)),

    timezone: z.string().min(1, "Timezone is required."),

    options: z.preprocess(
        (v) => {
            // If it's a JSON string, parse it
            if (typeof v === "string") {
                // Check if it's a JSON array
                const trimmed = v.trim();
                if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                    try {
                        const parsed = JSON.parse(trimmed);
                        return Array.isArray(parsed) ? parsed : [];
                    } catch {
                        // If parse fails but it's a string, treat as single value
                        return trimmed ? [trimmed] : [];
                    }
                }
                // Regular string (shouldn't happen with our form, but handle it)
                return trimmed ? [trimmed] : [];
            }

            // Normalize: undefined/null -> []
            if (v == null) return [];

            // Normalize: array -> array
            if (Array.isArray(v)) return v;

            // Anything else -> []
            return [];
        },
        z
            .array(z.string())
            .transform((arr) => arr.map((s) => String(s).trim()).filter(Boolean))
            .refine((arr) => arr.length >= 1, {
                message: "Add at least one date & time option.",
            })
    ),

});
