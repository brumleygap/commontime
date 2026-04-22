import { defineAction, ActionError } from "astro:actions";
import { z } from "zod";
import { sendMagicLinkEmail } from "../lib/email";

export const sendMagicLink = defineAction({
    accept: "form",
    input: z.object({
        email: z.string().email("Please enter a valid email address."),
    }),

    async handler(input, context) {
        const db = context.locals.runtime.env.DB;
        const emailBinding = context.locals.runtime.env.EMAIL;

        // Find or create user
        let user = await db
            .prepare("SELECT id FROM users WHERE email = ?")
            .bind(input.email)
            .first<{ id: number }>();

        if (!user) {
            user = await db
                .prepare("INSERT INTO users (email) VALUES (?) RETURNING id")
                .bind(input.email)
                .first<{ id: number }>();
        }

        if (!user) {
            throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to find or create user." });
        }

        const token = crypto.randomUUID().replace(/-/g, "");
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        await db
            .prepare("INSERT INTO magic_tokens (user_id, token, expires_at) VALUES (?, ?, ?)")
            .bind(user.id, token, expiresAt)
            .run();

        const origin = new URL(context.request.url).origin;
        const magicLink = `${origin}/auth/verify?token=${token}`;

        try {
            await sendMagicLinkEmail(emailBinding, input.email, magicLink);
        } catch (err: any) {
            console.error("Failed to send magic link email:", err);
            throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to send email. Please try again." });
        }

        return { ok: true };
    },
});
