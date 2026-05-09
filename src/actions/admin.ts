import { defineAction, ActionError } from "astro:actions";
import { z } from "zod";
import { env } from "cloudflare:workers";
import { sendPushToUsers, type PushAction } from "../lib/webpush";

const ADMIN_EMAIL = "ernie.braganza@gmail.com";

export const sendAdminPush = defineAction({
    accept: "form",
    input: z.object({
        title: z.string().min(1, "Title is required"),
        message: z.string().min(1, "Message is required"),
        url: z.string().nullish().transform(v => v || "/"),
        image: z.string().nullish().transform(v => v || undefined),
        audience: z.enum(["all", "poll"]),
        poll_token: z.string().nullish().transform(v => v || undefined),
        action0_label: z.string().nullish().transform(v => v || undefined),
        action0_url: z.string().nullish().transform(v => v || undefined),
        action1_label: z.string().nullish().transform(v => v || undefined),
        action1_url: z.string().nullish().transform(v => v || undefined),
    }),
    handler: async (input, context) => {
        if (context.locals.user?.email !== ADMIN_EMAIL) {
            throw new ActionError({ code: "FORBIDDEN", message: "Admin only." });
        }

        const vapid = {
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
            subject: env.VAPID_SUBJECT,
        };

        let userIds: number[];

        if (input.audience === "all") {
            const rows = await env.DB
                .prepare("SELECT DISTINCT user_id FROM push_subscriptions")
                .all<{ user_id: number }>();
            userIds = rows.results.map((r: { user_id: number }) => r.user_id);
        } else {
            if (!input.poll_token?.trim()) {
                throw new ActionError({ code: "BAD_REQUEST", message: "Poll token is required." });
            }
            const rows = await env.DB
                .prepare(`
                    SELECT DISTINCT ps.user_id
                    FROM push_subscriptions ps
                    JOIN participants pa ON pa.user_id = ps.user_id
                    JOIN polls po ON po.id = pa.poll_id
                    WHERE po.token = ?
                `)
                .bind(input.poll_token.trim())
                .all<{ user_id: number }>();
            userIds = rows.results.map((r: { user_id: number }) => r.user_id);
        }

        const actions: PushAction[] = [];
        if (input.action0_label && input.action0_url)
            actions.push({ action: "btn0", title: input.action0_label, url: input.action0_url });
        if (input.action1_label && input.action1_url)
            actions.push({ action: "btn1", title: input.action1_label, url: input.action1_url });

        await sendPushToUsers(
            userIds,
            input.title,
            input.message,
            input.url || "/",
            env.DB,
            vapid,
            input.image || undefined,
            actions.length ? actions : undefined,
        );

        return { ok: true, sent: userIds.length };
    },
});
