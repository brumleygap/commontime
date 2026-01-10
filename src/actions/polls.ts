// src/actions/polls.ts
import { defineAction, ActionError } from "astro:actions";
import { CreatePollSchema } from "./schemas/polls";

function makeToken(length = 12) {
    const alphabet =
        "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let out = "";
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    for (const b of bytes) out += alphabet[b % alphabet.length];
    return out;
}

export const createPoll = defineAction({
    accept: "form",
    input: CreatePollSchema,

    handler: async (input, context) => {
        try {
            const { title, description, timezone, options } = input;

            // DEBUG: Log what we're receiving
            console.log("Raw input received:", input);
            console.log("📊 Received options:", options);
            console.log("📊 Options length:", options.length);
            console.log("📊 Options array:", JSON.stringify(options));

            // Check database binding - try multiple access patterns for Cloudflare adapter
            // In Astro with Cloudflare, actions should receive runtime through context.locals.runtime.env
            let db = context.locals?.runtime?.env?.DB;

            // Try alternative access patterns in case structure differs
            if (!db && (context as any).locals?.runtime?.env) {
                db = (context as any).locals.runtime.env.DB;
            }

            // Try accessing through context directly (unlikely but worth checking)
            if (!db && (context as any).runtime?.env) {
                db = (context as any).runtime.env.DB;
            }

            if (!db) {
                // Enhanced logging to help diagnose the issue
                const contextInfo = {
                    hasLocals: !!context.locals,
                    hasRuntime: !!context.locals?.runtime,
                    hasEnv: !!context.locals?.runtime?.env,
                    hasDB: !!context.locals?.runtime?.env?.DB,
                    localsKeys: context.locals ? Object.keys(context.locals) : [],
                    runtimeKeys: context.locals?.runtime ? Object.keys(context.locals.runtime) : [],
                    envKeys: context.locals?.runtime?.env ? Object.keys(context.locals.runtime.env) : [],
                    contextType: typeof context,
                    localsType: typeof context.locals,
                    // Try to serialize context (might fail, but worth trying)
                    contextString: (() => {
                        try {
                            return JSON.stringify(context, (key, value) => {
                                // Skip functions and circular refs
                                if (typeof value === 'function') return '[Function]';
                                if (typeof value === 'object' && value !== null) {
                                    if (key === 'request' || key === 'clientAddress') return '[Request]';
                                }
                                return value;
                            }, 2);
                        } catch (e) {
                            return `[Could not serialize: ${String(e)}]`;
                        }
                    })(),
                };

                console.error("❌ DB not available in action context. Diagnostic info:", contextInfo);

                throw new ActionError({
                    code: "BAD_REQUEST",
                    message:
                        "Database (D1) is not available. This may be a Cloudflare adapter configuration issue. Check Cloudflare logs for detailed context structure. Ensure D1 database binding 'DB' is configured in wrangler.jsonc and that you've redeployed after configuration changes.",
                });
            }

            const token = makeToken();

            const pollInsert = await db
                .prepare(
                    `INSERT INTO polls (token, title, description, timezone)
           VALUES (?, ?, ?, ?)
           RETURNING id`
                )
                .bind(token, title, description ?? null, timezone)
                .first<{ id: number }>();

            if (!pollInsert || !pollInsert.id) {
                console.error("❌ Poll insert failed - no id returned");
                throw new ActionError({
                    code: "BAD_REQUEST",
                    message: "Failed to create poll (no id returned). Check database schema.",
                });
            }

            const pollId = pollInsert.id;

            // Insert options using batch
            if (!options || options.length === 0) {
                console.error("❌ No options to insert");
                throw new ActionError({
                    code: "BAD_REQUEST",
                    message: "At least one date & time option is required.",
                });
            }

            const optionInserts = options.map(dt =>
                db.prepare(
                    `INSERT INTO poll_options (poll_id, option_datetime)
                     VALUES (?, ?)`
                ).bind(pollId, dt)
            );

            console.log("📊 About to insert", optionInserts.length, "options");

            await db.batch(optionInserts);

            console.log("✅ Successfully inserted options");

            return { ok: true, token };
        } catch (err: any) {
            console.error("❌ createPoll failed:", err);
            console.error("❌ Error details:", {
                message: err?.message,
                code: err?.code,
                name: err?.name,
                stack: err?.stack,
                cause: err?.cause,
            });

            // If it's already an ActionError, re-throw it as-is
            if (err instanceof ActionError) {
                throw err;
            }

            // Otherwise, wrap it with a proper message
            const errorMessage = err?.message || String(err) || "Unknown error";
            throw new ActionError({
                code: "BAD_REQUEST",
                message: `Failed to create poll: ${errorMessage}. Check server logs for details.`,
            });
        }
    },
});
