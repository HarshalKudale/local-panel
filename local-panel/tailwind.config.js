/** @type {import('tailwindcss').Config} */
export default {
  content: ["./renderer/**/*.{html,tsx,ts}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg0:           "rgb(var(--color-bg0-rgb) / <alpha-value>)",
        bg1:           "rgb(var(--color-bg1-rgb) / <alpha-value>)",
        bg2:           "rgb(var(--color-bg2-rgb) / <alpha-value>)",
        bg3:           "rgb(var(--color-bg3-rgb) / <alpha-value>)",
        border:        "rgb(var(--color-border-rgb) / <alpha-value>)",
        accent:        "rgb(var(--color-accent-rgb) / <alpha-value>)",
        "accent-dim":  "rgb(var(--color-accent-dim-rgb) / <alpha-value>)",
        green:         "rgb(var(--color-green-rgb) / <alpha-value>)",
        red:           "rgb(var(--color-red-rgb) / <alpha-value>)",
        yellow:        "rgb(var(--color-yellow-rgb) / <alpha-value>)",
        "text-base":   "rgb(var(--color-text-base-rgb) / <alpha-value>)",
        "text-dim":    "rgb(var(--color-text-dim-rgb) / <alpha-value>)",
        "text-bright": "rgb(var(--color-text-bright-rgb) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["Cascadia Code", "Fira Code", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
