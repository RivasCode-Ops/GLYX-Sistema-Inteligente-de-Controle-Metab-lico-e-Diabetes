# Retomada do GLYX — ponto de parada em 30/10/2026

Substitui a retomada de 15/10/2026. Diz o que está no ar, o que está no Git e o que falta decidir.
Detalhe de cada tarefa em [`lista-implementacao-glyx.md`](lista-implementacao-glyx.md).

## 1. O que aconteceu em 30/10

- **Lote 5 inteiro** (robustez de IA e dados), implementado, testado e publicado: GLYX-28, 27, 19, 20,
  21, 31, 32, 35. O fio comum: quando algo falhava, o app mostrava um resultado plausível em vez de
  dizer que falhou.
- **Lote 1 publicado** junto (código de 15/10, commit `b057633`), com as **4 migrations aplicadas em
  produção**, uma a uma, com conferência após cada uma.
- **Regressão achada e corrigida no mesmo dia:** o cron de alarmes foi de 0,04 s para 8,3 s depois da
  4ª migration; a migration `20261030120000` o devolveu a 0,087 s.
- **CI destravado:** a guarda de destino (GLYX-46) reprovava as variáveis do próprio GitHub Actions, e o
  `ubuntu-latest` virou 26.04, onde o Playwright 1.59 não instala o Chromium (runner fixo em 24.04).

## 2. Git

| | |
|---|---|
| `main` (GitHub e local) | `ca6d5f6` — merge do PR #4 |
| PR #2 `lote-5-robustez` | **merged** (`73b0e81`): `535e2bc`, `b057633` (lote 1), `37d6f14` (lote 5), `59d78a3` (guarda no CI), `67f9b87` (runner 24.04) |
| PR #3 `fuso-valido-desempenho` | **merged** (`9f85afb`): migration de fuso + registro da implantação |
| PR #4 `docs-referencia` | **merged** (`ca6d5f6`): PRD, TRD, schema, fluxo, briefing de design |
| Fora do Git | `PDF/Painel GLYX.pdf` (gerado), `_local/`, `.env*`, e este arquivo até ser commitado |

Branches ficam no GitHub depois do merge, como os demais do projeto.

## 3. Produção

| | Situação |
|---|---|
| Código | no ar desde ~20:56 UTC de 30/10 (deploy do `73b0e81`; redeploy idêntico do `9f85afb`) |
| Migrations do lote 1 | **aplicadas** às 21:0x UTC: `filhos_de_medications_mesmo_dono`, `medication_logs_dose_unica`, `conta_ativa_e_uso_de_ia`, `med_alarms_cadencia_e_confiabilidade` |
| Corte da dose única | **`2026-10-30T21:05:00Z`** — registrado no comentário do índice `medication_logs_dose_confirmada_unica` |
| Doses duplicadas antigas | 12 grupos / 26 linhas (08/09 a 29/10), todas antes do corte, **preservadas** (D14 opção B) |
| Migration de fuso | `fuso_valido_sem_varrer_catalogo` aplicada ~21:14 UTC; cron de alarmes em 0,087 s |
| Conferido no banco | policies de dono; 32 policies `conta_ativa` + Storage; `ai_usage` só leitura; 0 contas desativadas; 12 remédios ativos, 0 com frequência confirmada (todos "a confirmar", D1); 14 de 14 horários disparam na simulação |
| Conferido no app | `/login` responde 200 com CSP |

**Não validado em produção:** chat de IA depois da migration de cota; alarme chegando no celular,
"Já tomei", adiar, confirmar frequência; fluxos de IA reais (refeição, rótulo, suplemento); evento
chegando ao Sentry já filtrado; telas novas com sessão (calculadora, exames, interações, import LibreView).

## 4. Testes

- Local e CI: **115 arquivos / 1389 testes**; tipos e lint limpos; build e E2E de portões no CI.
- Validação do lote 5 é **unitária**: IA, push, banco e Sentry não foram exercitados de verdade.

## 5. Se algo der errado

Ordem: **banco primeiro, código depois** (`PLANO-IMPLEMENTACAO.md` §5). Reverter só o código com o banco
novo cria a combinação X — IA bloqueada para todos e alarme preso em "enviando".

- Script: `supabase/reversao/20261014_reverter_lote1.sql` (uma transação, um bloco por migration).
  Continua compatível com a migration de fuso (ele apaga a função).
- Gatilhos: horário de dose sem registro no log; alarme duplicado no aparelho; chat dizendo "limite
  atingido" para quem não usou; usuário ativo sem acesso aos próprios dados.
- Deploy anterior: pelo painel da Vercel.

## 6. Decisões em aberto

| | |
|---|---|
| **P52** | não existe teto global de gasto de IA — `AI_DAILY_BUDGET_USD` só alimenta o medidor do admin |
| **Limites da refeição (GLYX-27)** | 3000 kcal / 400 g carb / 300 g prot e gordura **por item**, escolhidos como filtro de plausibilidade — confirmar |
| **D13** | pausar a sugestão automática de refeição (`glyx-meal-suggest` ativo, manda tipo de diabetes e última glicemia sem ação do titular — P06) |
| **I1** | troca da chave secreta do Supabase (`PROXIMAS-AUTORIZACOES.md` §C) |
| **D5–D11** | lotes 6 e 7: envio de dados à IA e política, decisões clínicas, escopo, revisão de exame por foto |
| **Documentos de referência** | entram no Git como "Não aprovado pelo Rivas"; `SCHEMA-BACKEND.md` e `FLUXO-APP.md` ainda dizem que as migrations não foram aplicadas |

## 7. Próximos passos

- **A.** Testar no celular: alarme, "Já tomei", adiar, confirmar frequência, chat, calculadora, exames.
- **B.** Decidir P52 e os limites da refeição.
- **C.** Atualizar o status dos cinco documentos de referência e o trecho defasado sobre migrations.
- **D.** Lotes seguintes (dependem de decisão ou de produção): 6 — GLYX-17, 18, 22, 29, 33, 34;
  7 — GLYX-13, 14, 37, 41, 42; 8 — GLYX-36, 40, 43, 44, 30.
- **E.** Pendências técnicas pequenas: filtro de linguagem no chat em streaming (P16); limite explícito
  de leituras por envio em `/api/cgm/ingest`; voltar o CI para `ubuntu-latest` quando o Playwright do
  projeto suportar o 26.04; build local isolado (o `next build` divide `.next` com o `next dev`).

Pendente também: caderno de método (outro repositório, não atualizado).

## 8. Recursos locais

- `next dev` desta sessão ficou rodando na porta 3000 — parar quando não for mais usar.
- Ambiente de teste com PostgreSQL em WSL (de 15/10) segue desligado; scripts em
  `d:\tmp\glyx-supabase-teste\wsl-isolado\` e `d:\tmp\glyx-harness\`.

---

**Riva's Alexandre**  © 2026
Todos os direitos reservados. Ponto de retomada do GLYX.
