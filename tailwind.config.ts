import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#000000",
        char: "#17191B",
        graphite: "#24272A",
        line: "#33383C",
        teal: { DEFAULT: "#19D3C5", deep: "#0E8F86", ink: "#062B28" },
        gold: "#C9A85A",
        paper: "#F4F6F6",
        mute: "#9BA4A9",
        warn: "#F2B33D",
        bad: "#FF6B6B",
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', "system-ui", "sans-serif"],
        sans: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', '"Segoe UI"', "Roboto", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
