// Patches dist/server/wrangler.json after `astro build`.
//
// The @astrojs/cloudflare adapter auto-injects a SESSION KV binding and an
// IMAGES binding into the generated deploy config. We don't use either, and
// both lack the `id` field that `wrangler deploy` requires — so they must be
// removed. The EMAIL service binding (configured in wrangler.jsonc) is merged
// in by the adapter, so it's already present in the generated config.
//
// Set DEPLOY_ENV=preview to target the preview worker + database.
// Set PR_NUMBER to get a per-PR worker name (commontime-pr-<n>).
import { readFileSync, writeFileSync } from "fs";

const env = process.env.DEPLOY_ENV ?? "production";
const prNumber = process.env.PR_NUMBER;
const configPath = "dist/server/wrangler.json";
const config = JSON.parse(readFileSync(configPath, "utf8"));

delete config.kv_namespaces;
delete config.images;
delete config.previews;

if (env === "preview") {
  config.name = prNumber ? `commontime-pr-${prNumber}` : "commontime-preview";
  config.d1_databases = [
    {
      binding: "DB",
      database_name: "commontime-db-preview",
      database_id: "8b67ab75-2c6d-47b3-a5c9-23b28e7b850d",
    },
  ];
}

writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log(`Patched dist/server/wrangler.json for ${env} environment.`);
