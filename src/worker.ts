import { handle } from "@astrojs/cloudflare/handler";

export default {
  fetch: handle,

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCleanup(env));
  },
} satisfies ExportedHandler<Env>;

async function runCleanup(env: Env) {
  const now = new Date().toISOString();

  const [sessions, tokens, challenges] = await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM magic_tokens WHERE used = 1 OR expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM webauthn_challenges WHERE used = 1 OR expires_at < ?").bind(now),
  ]);

  console.log(
    `[cron cleanup] deleted ${sessions.meta.changes} sessions, ` +
    `${tokens.meta.changes} magic tokens, ` +
    `${challenges.meta.changes} webauthn challenges`
  );
}
