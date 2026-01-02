import { defineAction } from "astro:actions";
import { CreatePollSchema } from "./schemas/polls";

export const createPoll = defineAction({
    input: CreatePollSchema,

    async handler({ title, timezone, options }, context) {
        // For now: prove the Action + Zod pipeline works
        console.log("Create poll:", { title, timezone, options });

        return {
            ok: true,
        };
    },
});
