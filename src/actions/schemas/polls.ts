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
            console.log("🔍 Schema preprocess - options value:", v, "type:", typeof v);

            // If it's a JSON string, parse it
            if (typeof v === "string") {
                // Check if it's a JSON array
                const trimmed = v.trim();
                if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                    try {
                        const parsed = JSON.parse(trimmed);
                        console.log("🔍 Parsed JSON array:", parsed);
                        return Array.isArray(parsed) ? parsed : [];
                    } catch (e) {
                        console.error("🔍 JSON parse failed:", e);
                        // If parse fails but it's a string, treat as single value
                        return trimmed ? [trimmed] : [];
                    }
                }
                // Regular string (shouldn't happen with our form, but handle it)
                return trimmed ? [trimmed] : [];
            }

            // Normalize: undefined/null -> []
            if (v == null) {
                console.log("🔍 Options is null/undefined");
                return [];
            }

            // Normalize: array -> array
            if (Array.isArray(v)) {
                console.log("🔍 Options is already array:", v);
                return v;
            }

            // Anything else -> []
            console.log("🔍 Options is unexpected type:", typeof v, v);
            return [];
        },
        z
            .array(z.string())
            .transform((arr) => {
                const filtered = arr.map((s) => String(s).trim()).filter(Boolean);
                console.log("🔍 Transformed options array:", filtered);
                return filtered;
            })
            .refine((arr) => arr.length >= 1, {
                message: "Add at least one date & time option. Please fill in the date & time fields.",
            })
    ),

});
