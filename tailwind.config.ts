import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        glyx: {
          petrol: "#0c4a6e",
          mint: "#10b981",
          surface: "#0a0a0b",
        },
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(12, 74, 110, 0.35), transparent)",
      },
    },
  },
  plugins: [],
};

export default config;
