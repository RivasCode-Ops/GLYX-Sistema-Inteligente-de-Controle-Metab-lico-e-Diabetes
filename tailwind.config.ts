import type { Config } from "tailwindcss";

/**
 * Tokens do sistema visual. Os valores moram em `app/globals.css` como tripla
 * `L C H`; aqui só se envolve em `oklch()` para o Tailwind poder aplicar
 * opacidade (`bg-background-100/60`).
 */
const oklchScale = <T extends string>(prefix: string, steps: readonly T[]) =>
  Object.fromEntries(
    steps.map((s) => [s, `oklch(var(--${prefix}-${s}) / <alpha-value>)`])
  ) as Record<T, string>;

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Corpo é Inter; título é Outfit. `font-sans` continua sendo o padrão
        // do body para não exigir mudança em nenhum componente existente.
        sans: ["var(--font-body)"],
        heading: ["var(--font-heading)"],
        // Monoespaçada do SISTEMA. A regra de usá-la em número lido de sensor,
        // dose, contagem e horário é semântica, não estética: distingue no olho
        // o que foi medido do que foi redigido. Não se baixa fonte para isso.
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      colors: {
        background: oklchScale("background", [
          "50",
          "100",
          "200",
          "300",
          "400",
          "500",
          "600",
          "700",
          "800",
          "900",
          "950",
        ] as const),
        foreground: oklchScale("foreground", [
          "400",
          "500",
          "600",
          "700",
          "800",
          "900",
          "950",
        ] as const),
        primary: oklchScale("primary", ["300", "400", "500", "600", "700"] as const),
        accent: oklchScale("accent", ["300", "400", "500", "600"] as const),

        // Identidade de módulo. Pinta PONTO — ícone de 16px e o valor da coluna
        // direita —, nunca bloco. Severidade é que pinta bloco, e é a diferença
        // de área que separa as duas coisas quando a matiz coincide.
        module: {
          glicemia: "oklch(var(--module-glicemia) / <alpha-value>)",
          alimentacao: "oklch(var(--module-alimentacao) / <alpha-value>)",
          exercicio: "oklch(var(--module-exercicio) / <alpha-value>)",
          medicacao: "oklch(var(--module-medicacao) / <alpha-value>)",
          neutro: "oklch(var(--module-neutro) / <alpha-value>)",
        },
        severity: {
          critico: "oklch(var(--severity-critico) / <alpha-value>)",
          atencao: "oklch(var(--severity-atencao) / <alpha-value>)",
        },

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
