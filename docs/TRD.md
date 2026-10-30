# TRD — GLYX

> **Revisão técnica concluída em 15/10/2026** — conferido contra o código, as migrations e a validação
> local de 14–15/10. **Não aprovado pelo Rivas.** D4 aprovada em 15/10 (a exclusão apaga todo o uso de IA). Decisões pendentes que afetam este documento: D5 e D6 (T-AI-4, envio automático de dados à IA), A1 estendida para o ambiente de teste do CI (GLYX-04), I1 (troca da chave de serviço).

**Data:** 14/10/2026, conferido em 15/10/2026 · **Referência principal:** [`CONTEXTO_TECNICO.md`](CONTEXTO_TECNICO.md)

> O documento técnico de referência do GLYX já existe e é longo: `CONTEXTO_TECNICO.md` (stack,
> decisões de arquitetura, modelo de dados, regras clínicas, integrações, segurança). Este TRD **não o
> duplica**. Ele registra os requisitos técnicos em forma verificável, aponta onde cada um está
> descrito e diz o estado de cada um depois da auditoria de 14/10/2026.
>
> Números de `CONTEXTO_TECNICO.md` §2 são de 20/07 (42 páginas, 37 rotas, 30 testes). Em 14/10: 62
> páginas, 41 rotas de API, **98 arquivos / 1177 testes unitários**.

## 1. Stack [comprovado por build de 14/10]

Next.js 15 (App Router, React 19, Server Actions) · TypeScript strict · Tailwind · Supabase (Postgres,
Auth, RLS, Storage, Vault, `pg_cron` + `pg_net`) · Web Push (VAPID) · IA por cliente compatível com
OpenAI, provedor padrão Kimi/Moonshot (`lib/env.ts`) · Sentry · Vitest · Playwright · Vercel.

## 2. Requisitos técnicos

| ID | Requisito | Onde está | Estado |
|---|---|---|---|
| T-AUTH-1 | Sessão validada no servidor (`getUser`, nunca `getSession`) | todas as rotas e actions | comprovado por leitura |
| T-AUTH-2 | Conta desativada barrada no middleware **e** no banco | `lib/auth/account-gate.ts`, migration `20261015102000` | **validado em teste local** (token, Storage, refresh, login); migration **aplicada em produção em 30/10** (32 policies + Storage conferidas; sem conta desativada para exercitar) |
| T-AUTH-3 | Middleware falha fechado se não conseguir ler o perfil | `lib/supabase/middleware.ts` | implementado local, teste unitário |
| T-DB-1 | RLS em toda tabela com `user_id` | migrations; `rls-coverage.test.ts` (derivado do schema) | comprovado (pentest 08/09); teste estático |
| T-DB-2 | Filho de `medications` só com medicamento do mesmo dono | migration `20261015100000` | **validado em teste local** (com controle negativo); **aplicada em produção em 30/10** (policies conferidas) |
| T-DB-5 | Dose única prospectiva com corte passado como **parâmetro** da sessão de aplicação; sem corte (ou sem fuso, ilegível, fora do intervalo) a migration falha e nada fica aplicado; o corte usado fica no índice | migration `20261015101000`, `med-alarms-migration.test.ts` | **validado em PostgreSQL 17 isolado** (4 casos negativos + aplicação com corte); **aplicada em produção em 30/10** com corte `2026-10-30T21:05:00Z`, registrado no índice |
| T-DB-3 | Migrations reexecutáveis | `migrations-rerunnable.test.ts` | teste estático verde |
| T-DB-4 | Leitura além de 1000 linhas paginada, com aviso de parcial | `lib/queries/fetch-all.ts` | implementado; testes com 2500 registros |
| T-CRON-1 | O Postgres decide quem/quando; a rota só entrega | `CONTEXTO_TECNICO` §4.1 | comprovado |
| T-CRON-2 | Alarme com estado, reivindicação atômica, reenvio e confirmação | migration `20261015103000`, `app/api/push/dispatch` | **validado em teste local** com push simulado; **aplicada em produção em 30/10** (cron sem falha, 14 de 14 horários na simulação); entrega real no aparelho **não validada** |
| T-CRON-3 | Segredo e URL do cron no Vault | `CONTEXTO_TECNICO` §10.2, §10.5 | comprovado (migrations) |
| T-TZ-1 | Fuso do perfil, nunca do processo | `CONTEXTO_TECNICO` §4.2 | comprovado |
| T-AI-1 | Limite de uso fail-closed e atômico | `lib/ai/rate-limit.ts`, RPC `consumir_cota_ia` | **validado em teste local** (20 simultâneos, limite 5 → 5); RPC **aplicada em produção em 30/10**; chat em produção depois dela **não validado** |
| T-AI-5 | Uso de IA só é apagado pela exclusão completa, pelo servidor (chave de serviço); não há função para o usuário apagar à parte (D4) | `lib/privacy/apagar-uso-ia.ts`, migration `20261015102000` | implementado local; **validado no navegador** (cota cheia → exclusão → cota reinicia) |
| T-UI-1 | Recusa e destino depois de ação do servidor sem `redirect()` (no build de produção a navegação nem sempre se concluía) | `components/medicacao/formulario-de-acao.tsx`, `destinoAposRegistro` | implementado local; **validado no build de produção** (D1–D4 e F1–F8) |
| T-AI-2 | Payload do chat validado em tempo de execução | `lib/ai/chat-payload.ts` | implementado; testes |
| T-AI-4 | Nenhuma chamada de IA com dado clínico sem ação do titular (DPIA §3, §6) | cron de sugestão de refeição | **não atendido** pelo código atual (P06, confirmado em teste local); aguarda D5 — [`P06-ENVIO-AUTOMATICO-IA.md`](P06-ENVIO-AUTOMATICO-IA.md) |
| T-AI-3 | Veredito de segurança determinístico | `lib/safety/` | comprovado (08/09) |
| T-SEC-1 | CSP com nonce por requisição | `lib/security/csp.ts` | comprovado em produção (08/09) |
| T-SEC-2 | Credenciais de sensor cifradas (AES-GCM, HKDF) | `lib/cgm/` | comprovado por teste |
| T-OBS-1 | Falha de cron visível (Sentry + webhook) | `lib/observability.ts` | parcial: critério do ROADMAP aberto |
| T-LGPD-1 | Inventário de exclusão/exportação derivado do schema | `lib/privacy/user-data.ts` + teste | implementado; teste derivado |
| T-TEST-1 | Teste nunca alcança produção nem destino fora da máquina | `lib/testes/guarda-destino.ts`; `vitest.config.ts` (conferência + rede bloqueada); `playwright.config.ts` (cobertura do `.env.local` + destinos); CI com Supabase em porta morta | **implementado no repositório em 15/10 (GLYX-46)**; validado localmente: 10 testes da guarda, E2E 9/9 com ambiente falso, recusa no terminal comum. Exceção só por `GLYX_TESTE_HOSTS_PERMITIDOS`, **não habilitada** — uso previsto apenas para Supabase de teste hospedado no CI (GLYX-04). **Ajuste de 30/10:** variáveis do runner de CI (`GITHUB_`, `RUNNER_`, `ACTIONS_`) ficam fora só da checagem de host — reprovavam todo job do GitHub Actions; identificador de produção e JWT continuam conferidos nelas |

## 3. Validação local isolada de produção

O `.env.local` tem chaves de produção, e `next build`/`next dev` o carregam sozinhos. A validação
local usa variáveis **falsas e não vazias** para todo nome do `.env.local` (o Next não sobrescreve
variável já definida no processo), `NEXT_TELEMETRY_DISABLED=1`, e confere depois que o build não
contém o identificador do projeto de produção. Procedimento em
[`PLANO-IMPLEMENTACAO.md`](PLANO-IMPLEMENTACAO.md) §2.

**Valor falso não basta sozinho.** Em 14/10, apagar uma variável do processo para simular ausência fez o
Next carregar a chave de produção do `.env.local` (só chegou ao banco local; ver o registro de incidentes).
Desde 15/10 os scripts de teste passam por uma **guarda de destino** que interrompe a execução se faltar
algum nome do `.env.local`, se um segredo ou destino for igual ao de produção, ou se algum destino estiver
fora de `127.0.0.1`, `localhost`, `::1` e `host.docker.internal` (T-TEST-1).

**Não roda localmente contra produção:** `npm run dev`, `npm run test:e2e` (sobe `dev`; o
`clinical-path.spec.ts` grava glicemia), `npm run types:gen`.

## 4. Testes que exigem banco de teste

`supabase/tests/med_alarms_due.sql` · `dispatch_med_alarms.sql` · `policies_dono_do_medicamento.sql` ·
`conta_ativa_e_ai_usage.sql` · `dose_unica_prospectiva.sql`. Rodam dentro de transação desfeita (`rollback`). **Executados e aprovados
em 14/10/2026** num Supabase local descartável e **de novo em 15/10 em PostgreSQL 17** com as quatro migrations finais ([`PLANO-IMPLEMENTACAO.md`](PLANO-IMPLEMENTACAO.md) §3).
Ainda não rodam no CI (GLYX-04).

"Validado em teste local" = banco descartável com IA e push **simulados**; não aprova a integração com
os serviços reais.

---

**Riva's Alexandre**  © 2026
Todos os direitos reservados. Requisitos técnicos verificáveis do GLYX.
