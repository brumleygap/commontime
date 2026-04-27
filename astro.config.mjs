import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "server",
  adapter: cloudflare({ imagesBindingName: false }),
  vite: {
    plugins: [tailwindcss()],
  },
});
