// Patches dist/server/wrangler.json after `astro build`.
//
// The @astrojs/cloudflare adapter auto-injects a SESSION KV binding and an
// IMAGES binding into the generated deploy config. We don't use either, and
// both lack the `id` field that `wrangler deploy` requires — so they must be
// removed. The EMAIL service binding (configured in wrangler.jsonc) is merged
// in by the adapter, so it's already present in the generated config.
import { readFileSync, writeFileSync } from "fs";

const configPath = "dist/server/wrangler.json";
const config = JSON.parse(readFileSync(configPath, "utf8"));

delete config.kv_namespaces;
delete config.images;
delete config.previews;

writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log("Patched dist/server/wrangler.json — removed SESSION KV and IMAGES bindings.");
