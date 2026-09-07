# Contraste medido — tema escuro do app

> Gerado por `lib/design/contrast.test.ts` a cada `npm test`. Não editar à mão:
> a próxima execução sobrescreve. Para mudar um número, mude o token em
> `app/globals.css`.

Conversão OKLCH → sRGB linear e luminância relativa WCAG em
`lib/design/oklch.ts`. Alvo: **4.5:1** para corpo, **3:1** para
texto grande e elemento de interface.

**O que foi medido:** o sRGB **de saída**, depois do recorte de gamut — não a
tripla OKLCH declarada. É o valor que o navegador pinta. A diferença importa:
uma cor fora do gamut é renderizada recortada, e medir a declarada atestaria uma
cor que ninguém vê. A prova está no próprio teste (`a medição é do sRGB de
saída`), que confere a luminância medida contra a luminância recalculada a
partir do hexadecimal emitido. A coluna `hex` abaixo é esse valor de saída.

Superfícies medidas: `background-50`, `background-100`, `background-200`.

## Pares texto × superfície

| token | papel | superfície | medido | alvo | |
|---|---|---|---|---|---|
| `foreground-950` | texto primário | `background-50` | 18.25:1 | 4.5:1 | ✅ |
| `foreground-950` | texto primário | `background-100` | 17.53:1 | 4.5:1 | ✅ |
| `foreground-950` | texto primário | `background-200` | 16.25:1 | 4.5:1 | ✅ |
| `foreground-900` | texto primário alternativo | `background-50` | 15.71:1 | 4.5:1 | ✅ |
| `foreground-900` | texto primário alternativo | `background-100` | 15.09:1 | 4.5:1 | ✅ |
| `foreground-900` | texto primário alternativo | `background-200` | 13.98:1 | 4.5:1 | ✅ |
| `foreground-800` | texto secundário | `background-50` | 13.43:1 | 4.5:1 | ✅ |
| `foreground-800` | texto secundário | `background-100` | 12.90:1 | 4.5:1 | ✅ |
| `foreground-800` | texto secundário | `background-200` | 11.96:1 | 4.5:1 | ✅ |
| `foreground-700` | texto secundário fraco | `background-50` | 10.66:1 | 4.5:1 | ✅ |
| `foreground-700` | texto secundário fraco | `background-100` | 10.23:1 | 4.5:1 | ✅ |
| `foreground-700` | texto secundário fraco | `background-200` | 9.48:1 | 4.5:1 | ✅ |
| `foreground-600` | texto terciário / legenda | `background-50` | 8.02:1 | 3:1 | ✅ |
| `foreground-600` | texto terciário / legenda | `background-100` | 7.71:1 | 3:1 | ✅ |
| `foreground-600` | texto terciário / legenda | `background-200` | 7.14:1 | 3:1 | ✅ |
| `foreground-500` | texto terciário fraco | `background-50` | 5.47:1 | 3:1 | ✅ |
| `foreground-500` | texto terciário fraco | `background-100` | 5.25:1 | 3:1 | ✅ |
| `foreground-500` | texto terciário fraco | `background-200` | 4.87:1 | 3:1 | ✅ |
| `primary-400` | ação primária / Glicemia | `background-50` | 10.43:1 | 3:1 | ✅ |
| `primary-400` | ação primária / Glicemia | `background-100` | 10.02:1 | 3:1 | ✅ |
| `primary-400` | ação primária / Glicemia | `background-200` | 9.29:1 | 3:1 | ✅ |
| `primary-300` | ação primária clara | `background-50` | 13.44:1 | 3:1 | ✅ |
| `primary-300` | ação primária clara | `background-100` | 12.91:1 | 3:1 | ✅ |
| `primary-300` | ação primária clara | `background-200` | 11.96:1 | 3:1 | ✅ |
| `accent-400` | acento | `background-50` | 8.88:1 | 3:1 | ✅ |
| `accent-400` | acento | `background-100` | 8.53:1 | 3:1 | ✅ |
| `accent-400` | acento | `background-200` | 7.90:1 | 3:1 | ✅ |
| `module-glicemia` | módulo Glicemia | `background-50` | 10.43:1 | 3:1 | ✅ |
| `module-glicemia` | módulo Glicemia | `background-100` | 10.02:1 | 3:1 | ✅ |
| `module-glicemia` | módulo Glicemia | `background-200` | 9.29:1 | 3:1 | ✅ |
| `module-alimentacao` | módulo Alimentação | `background-50` | 9.75:1 | 3:1 | ✅ |
| `module-alimentacao` | módulo Alimentação | `background-100` | 9.37:1 | 3:1 | ✅ |
| `module-alimentacao` | módulo Alimentação | `background-200` | 8.68:1 | 3:1 | ✅ |
| `module-exercicio` | módulo Exercício | `background-50` | 8.95:1 | 3:1 | ✅ |
| `module-exercicio` | módulo Exercício | `background-100` | 8.60:1 | 3:1 | ✅ |
| `module-exercicio` | módulo Exercício | `background-200` | 7.96:1 | 3:1 | ✅ |
| `module-medicacao` | módulo Medicação | `background-50` | 10.59:1 | 3:1 | ✅ |
| `module-medicacao` | módulo Medicação | `background-100` | 10.17:1 | 3:1 | ✅ |
| `module-medicacao` | módulo Medicação | `background-200` | 9.43:1 | 3:1 | ✅ |
| `severity-critico` | severidade crítica | `background-50` | 6.93:1 | 3:1 | ✅ |
| `severity-critico` | severidade crítica | `background-100` | 6.65:1 | 3:1 | ✅ |
| `severity-critico` | severidade crítica | `background-200` | 6.16:1 | 3:1 | ✅ |
| `severity-atencao` | severidade atenção | `background-50` | 10.59:1 | 3:1 | ✅ |
| `severity-atencao` | severidade atenção | `background-100` | 10.17:1 | 3:1 | ✅ |
| `severity-atencao` | severidade atenção | `background-200` | 9.43:1 | 3:1 | ✅ |

**45 de 45 pares passam.**

## Tokens em hexadecimal

Equivalente sRGB de cada token, para conferência em ferramenta externa.

| token | OKLCH | hex |
|---|---|---|
| `--background-50` | `0.14 0.004 85` | `#0a0907` |
| `--background-100` | `0.17 0.005 85` | `#100f0d` |
| `--background-200` | `0.21 0.006 85` | `#1a1815` |
| `--background-300` | `0.26 0.007 85` | `#262420` |
| `--background-400` | `0.33 0.008 85` | `#373531` |
| `--background-500` | `0.44 0.008 85` | `#54524e` |
| `--background-600` | `0.55 0.008 85` | `#74716c` |
| `--background-700` | `0.66 0.008 85` | `#94928d` |
| `--background-800` | `0.77 0.007 85` | `#b6b4af` |
| `--background-900` | `0.87 0.006 85` | `#d6d4d0` |
| `--background-950` | `0.95 0.005 85` | `#f0eeeb` |
| `--foreground-400` | `0.52 0.006 85` | `#6a6965` |
| `--foreground-500` | `0.62 0.006 85` | `#888682` |
| `--foreground-600` | `0.72 0.006 85` | `#a6a4a0` |
| `--foreground-700` | `0.8 0.005 85` | `#bfbdba` |
| `--foreground-800` | `0.87 0.005 85` | `#d6d4d0` |
| `--foreground-900` | `0.92 0.004 85` | `#e6e4e2` |
| `--foreground-950` | `0.97 0.004 85` | `#f6f5f2` |
| `--primary-300` | `0.86 0.08 180` | `#95e3d3` |
| `--primary-400` | `0.78 0.11 180` | `#59ceba` |
| `--primary-500` | `0.7 0.125 180` | `#10b7a1` |
| `--primary-600` | `0.62 0.11 180` | `#0f9b89` |
| `--primary-700` | `0.52 0.092 180` | `#0b7a6b` |
| `--accent-300` | `0.84 0.08 30` | `#fab8ac` |
| `--accent-400` | `0.76 0.11 30` | `#ef9687` |
| `--accent-500` | `0.68 0.13 30` | `#dd7767` |
| `--accent-600` | `0.6 0.14 30` | `#c65b4c` |
| `--module-glicemia` | `0.78 0.11 180` | `#59ceba` |
| `--module-alimentacao` | `0.76 0.13 150` | `#6fc884` |
| `--module-exercicio` | `0.76 0.13 55` | `#f0995b` |
| `--module-medicacao` | `0.8 0.12 85` | `#e1b75c` |
| `--module-neutro` | `0.66 0.008 85` | `#94928d` |
| `--severity-critico` | `0.7 0.16 20` | `#f17074` |
| `--severity-atencao` | `0.8 0.12 85` | `#e1b75c` |

---

**Riva's Alexandre**  © 2026
Todos os direitos reservados. Medição gerada pelo próprio repositório.
