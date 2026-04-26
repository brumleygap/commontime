/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{astro,html,js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0f0f0e",
        cream: "#f5f2ec",
        "ct-red": "#c8102e",
        staff: "#d4cfc6",
        muted: "#8a857c",
        "ct-green": "#1a6b3a",
        "green-light": "#e8f5ee",
      },
      fontFamily: {
        serif: ["Libre Baskerville", "Georgia", "serif"],
        display: ["Playfair Display", "Georgia", "serif"],
        mono: ["DM Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
