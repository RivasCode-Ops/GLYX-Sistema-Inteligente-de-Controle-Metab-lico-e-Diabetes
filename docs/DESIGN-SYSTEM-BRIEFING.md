# Briefing do design system — GLYX

> **Revisão técnica concluída em 15/10/2026** — conferido contra o código, as migrations e a validação
> local de 14–15/10. **Não aprovado pelo Rivas.** Decisões pendentes que afetam este documento: D1 (campo de frequência obrigatório ou não), D4 (texto da tela de exclusão), prioridade de GLYX-43 (cores cruas).

**Data:** 14/10/2026, conferido em 15/10/2026 · **Reaproveita:** [`GUIA_ESTILO.md`](GUIA_ESTILO.md) (padrões de componente) e
[`CONTRASTE.md`](CONTRASTE.md) (contraste medido por teste).

> Este briefing não redesenha nada. Ele junta o que já existe, diz o que está comprovado e lista o que
> falta decidir. Nada aqui é requisito novo sem aceite.

## 1. O que existe [comprovado por leitura]

| Peça | Onde | Estado |
|---|---|---|
| Tema escuro, tokens OKLCH | `app/globals.css` | em uso |
| Contraste medido sobre o sRGB **de saída** | `lib/design/contrast.test.ts` → `docs/CONTRASTE.md` | todos os pares no alvo (4,5:1 corpo; 3:1 texto grande e UI) |
| Cor de módulo como fonte única | `lib/navigation.ts` (`ModuleRow` deriva a cor do `href`) | em uso desde 07/09 |
| Pílula de status (5 tons) | `components/ui/status-pill.tsx` | em uso |
| Tag de severidade clínica | reaproveitada do Mapa de risco | em uso |
| Grid de números-resumo | padrão do `GUIA_ESTILO` §3 | em uso |
| Ícone do item = ícone do menu | `lib/navigation.ts` | regra |
| Regra de lint contra `rose-*` | `eslint.config.mjs` | ativa |

## 2. Regras de conteúdo que são parte do design [observado no código e no roteiro]

- **Nunca verde nem "seguro"** em checagem de interação; "não achei interação" é cinza.
- **Travessão, não zero**, quando não há base (adesão antes da 1ª dose, kcal de treino).
- **Idade da leitura** ao lado de todo número de glicemia que não for de agora.
- **Régua ao lado do rótulo:** "Moderado" sempre com a faixa-alvo ao lado.
- **Aviso educativo** onde há interpretação (exame, IA, calculadora).
- **Tela vazia pode ser a funcionalidade:** recusar número sem base não é defeito.

## 3. Dívida conhecida

| Item | Medida | Fonte |
|---|---|---|
| Classes de cor crua em vez de tokens | **2109** ocorrências em `app/` e `components/` (busca por `text|bg|border|…-<cor>-<número>`, 14/10/2026) | medição desta data; o número de 07/09 (1662) usou outro critério e **não é comparável** |
| Cor de módulo × cor de severidade | resolvido nos tokens; aplicação em massa não começou | caderno, 07/09 |
| Componentes sem importador | `MacroGrid`, `MacroGaugesCard`, `glycemic-impact-ring`, `quick-extras-card` | auditoria 14/10 (GLYX-36) |

Migrar as cores cruas é a melhoria opcional GLYX-43. Não muda comportamento e não aumenta nenhum
percentual de implementação do painel.

## 4. Telas que o lote 1 mudou (14/10) [observado no código; validado em teste local no navegador]

| Tela | Mudança | Observação de design |
|---|---|---|
| Editar medicamento | campo de frequência (diária, semanal + dia, a cada N dias + início) | o que acontece com o campo vazio depende de D1 |
| Editar medicamento, admin | aviso de erro por código fechado (`?erro=…`), sem texto livre da URL | os dois avisos usam classes de cor crua (`amber-*`): somam à dívida de GLYX-43 |
| Chat | aviso no fim da resposta quando o stream cai | texto curto, sem cor própria |
| Apagar meus dados | **sem mudança de texto** | a frase "todos os seus registros foram apagados" está incorreta enquanto houver retenção de uso de IA (D4, P39) |

## 5. Decisões pendentes

- Prioridade da migração de cores (GLYX-43) frente às correções.
- Tema claro: não existe e não está no escopo documentado. Não entra sem decisão.

---

**Riva's Alexandre**  © 2026
Todos os direitos reservados. Briefing do design system do GLYX.
