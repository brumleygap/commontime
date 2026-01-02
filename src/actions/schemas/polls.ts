import { z } from "zod";

export const CreatePollSchema = z.object({
    title: z
        .string()
        .min(1, "Poll title is required")
        .max(200, "Poll title is too long"),

    timezone: z
        .string()
        .min(1, "Timezone is required"),

    // For now: raw datetime strings from <input type="datetime-local">
    // We'll normalize later.
    options: z
        .array(z.string().min(1))
        .min(1, "At least one date/time option is required"),
});
