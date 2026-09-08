import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/**
 * Reserva do `rose` para severidade crítica.
 *
 * `rose` é a cor que se lê como ALARME. O sistema visual a reserva para
 * severidade crítica e não a dá a módulo nenhum — na landing, Glicemia era
 * rose, e dar a cor de alarme ao módulo que o usuário abre justamente quando
 * está preocupado faz a tela parecer alerta com tudo dentro da faixa.
 *
 * Esta regra é ERRO, e pode ser erro hoje porque foi medido: `rose-*` tem ZERO
 * ocorrências no app (as classes cruas que o briefing cita são da landing, que
 * é outro código). Ela não quebra nada agora e trava a reserva antes de a
 * primeira violação existir — o único momento em que uma regra dessas sai de
 * graça.
 *
 * A regra CONTRÁRIA — proibir toda cor crua do Tailwind — não entra ainda:
 * medido, são 1171 usos de `zinc`, 322 de `emerald`, 169 de `amber`, 133 de
 * `red` e 69 de `sky`. Isso é migração com fatia própria, não um passo; uma
 * regra que nasce com ~1800 violações vira `eslint-disable` no primeiro dia.
 */
const PREFIXOS_TAILWIND =
  "bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|shadow|accent|caret|placeholder";

const MENSAGEM_ROSE =
  "`rose` é reservado para severidade crítica: use o token `severity-critico` (globals.css). Cor de módulo nunca usa rose.";

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // Atributo escrito como string: className="bg-rose-500"
          selector: `Literal[value=/(${PREFIXOS_TAILWIND})-rose-[0-9]/]`,
          message: MENSAGEM_ROSE,
        },
        {
          // O mesmo dentro de template literal, que é como as classes
          // condicionais são montadas neste código.
          selector: `TemplateElement[value.raw=/(${PREFIXOS_TAILWIND})-rose-[0-9]/]`,
          message: MENSAGEM_ROSE,
        },
      ],
    },
  },
];

export default eslintConfig;
