# Programa de evolução da inteligência gestora — Plano de execução

> **Situação:** proposta para autorização. Nada deste plano foi executado.
> **Base:** os dez documentos de [`docs/auditoria-2026-10-30/`](../auditoria-2026-10-30/00-LEIA-PRIMEIRO.md).
> Os códigos entre colchetes (A1, B4, C2…) são as necessidades de
> [`06-necessidades.md`](../auditoria-2026-10-30/06-necessidades.md).
> **Data:** 30/10/2026 · **Não aprovado pelo proprietário.**

## 0. Premissas

1. **Uso pessoal.** O GLYX acompanha a saúde do proprietário (e de quem ele convidar). Isso reduz escala,
   não reduz obrigação: dado de saúde continua sensível na LGPD, e a IA continua sem autonomia sobre
   tratamento.
2. **Um aplicativo só.** Toda capacidade nova entra na arquitetura atual (Next.js + Supabase + motores em
   `lib/`). Nada paralelo quando já existe solução.
3. **Limites desta autorização:** posso investigar, alterar código local, escrever migrations como
   arquivo, criar e rodar testes locais e preparar PRs. **Não posso** fazer deploy (merge na `main`
   publica), aplicar migration em produção, alterar dado real, ler dado clínico pessoal sem necessidade
   nem gerar despesa externa sem aprovação.
4. **Banco de teste local.** Migrations e testes SQL rodam num Supabase local descartável (o ambiente WSL
   de 15/10, hoje desligado). Religá-lo é local e está dentro desta autorização; ele nunca aponta para
   produção (guarda de destino GLYX-46).
5. **Ritmo:** cada etapa vira um ou mais PRs pequenos, cada um com CI verde. Merge, deploy e migration em
   produção ficam **sempre** com a sua ordem, como hoje.
6. **Regra de ouro da gestora** (já é regra do GLYX): **o motor determinístico decide, o modelo redige.**
   Nenhum número, veredito ou classificação que vire métrica sai do modelo.

## 1. Visão das etapas

```
Etapa 1  Segurança, privacidade e confiabilidade ........ fecha riscos ativos
Etapa 2  Verdade única e ciclos completos ............... uma régua por conceito
Etapa 3  Gestora: ferramentas, contexto, memória ........ a IA passa a investigar
Etapa 4  Acompanhamento e proatividade controlada ....... a IA passa a acompanhar
Etapa 5  Validação integrada ............................ prova de ponta a ponta
```

Dependências: 1 → 2 → 3 → 4 → 5. A etapa 5 também roda **um pedaço ao fim de cada etapa** (não só no
fim).

---

## Etapa 1 — Segurança, privacidade e confiabilidade

**Objetivo:** nenhum risco ativo conhecido antes de dar mais alcance à IA.

| Item | O que muda | Componentes | Reaproveita |
|---|---|---|---|
| **A1** sugestão automática por IA | opt-in explícito e revogável; sem consentimento, o job não chama o modelo; prompt sem dado clínico até haver consentimento | job `glyx-meal-suggest`, `app/api/meals/suggest-dispatch`, `profiles` (preferência), tela de Perfil | padrão de job existente |
| **A3** registro de notificações | usuário só lê `push_dispatch_log`; escrita só pelo sistema; `limit` na reivindicação | migration nova; `dispatch_med_alarms` | policy-padrão de leitura |
| **A4** circuit breaker do sensor | usuário não altera campos de estado de `cgm_connections` | migration nova (policy de colunas ou gatilho) | gatilho de colunas de `profiles` como modelo |
| **A5** histórico do chat | servidor carrega o histórico de `ai_messages`; cliente manda só a nova mensagem | `app/api/ai/chat`, `lib/ai/chat-payload.ts`, `components/ia/ia-chat.tsx` | `lib/queries/ai-threads.ts` |
| **A6** filtro de saída | toda saída de IA passa por `findForbiddenLanguage` (+ verificação de paráfrase) antes de chegar ao usuário; no streaming, verificação por trecho antes de exibir | `lib/safety/forbidden-language.ts`, todas as rotas `ai/*`, push do job | filtro já existente |
| **A8** cadastro | limite de tentativas no convite; resposta neutra (sem revelar e-mail); sem erro cru | `app/api/auth/register`, `verify-invite` | `public-error.ts` (GLYX-32) |
| **A9** Sentry | filtrar texto de exceção, `extra`, `contexts` | `lib/sentry-scrub.ts` | filtro já existente |
| **A14** fuso | jobs de água, sugestão, sensor parado e dica usam `glyx_fuso_valido` | migration nova (redefine 4 funções) | função já em produção |
| **B1** card de hipo | exige leitura recente; mostra data quando não é de hoje | `lib/painel/card-agora.ts` | `lib/health/reading-freshness.ts` |
| **B17** modo demo | nunca para usuário real quando o resumo falha | `app/(app)/dashboard/page.tsx` | — |
| **C7** custo | teto diário/mensal **efetivo** (bloqueia chamadas acima) + chave de desligar; custo pelo provedor real | `lib/ai/rate-limit.ts`, `lib/ai/cost.ts`, RPC nova | `consumir_cota_ia`, `/admin` |
| **E10** ingestão | limite de leituras por pedido em `/api/cgm/ingest` | rota | `snapshot-limits.ts` como modelo |

**Fora do meu alcance nesta etapa (decisão/operação sua):** aplicar as migrations do PR #7 (A2), trocar
chave e segredos (A7), política/DPIA (A11), repositório privado (A12).

**Validação objetiva**
- Teste SQL: usuário comum **não** insere nem altera `push_dispatch_log` e campos de estado de
  `cgm_connections`; alarme verdadeiro não é bloqueado por linha prévia.
- Teste: sem consentimento, o job não chama o provedor (provedor simulado registra zero chamadas).
- Teste: payload com mensagem "assistant" forjada é ignorado; histórico vem do banco.
- Teste: saída com frase proibida — inclusive no meio do streaming — não chega ao usuário.
- Teste: card de hipo **não** dispara com leitura de 3 h atrás; dispara com leitura de 5 min.
- Teste: chamada acima do teto global é recusada antes do provedor.
- Testes SQL rodando no banco local; suíte inteira verde.

**Complexidade:** M (≈ 4–6 PRs). **Migrations novas:** 3 (A3, A4, A14) + 1 (C7, cota global).

---

## Etapa 2 — Verdade única e ciclos completos

**Objetivo:** cada conceito clínico com **uma** implementação; nenhum ciclo pela metade. Sem isso, a
gestora cruzaria números que se contradizem.

| Item | O que muda | Componentes | Reaproveita |
|---|---|---|---|
| **B4** "acima da meta" | uma comparação em um lugar, usada por todos | `glucose-thresholds.ts`, `glucose-metrics.ts`, `audit/metrics.ts`, `full-history.ts`, `hourly-pattern.ts` | `classifyGlucose` |
| **B5** episódios | score e resumo semanal contam episódios | `lib/audit/score.ts`, `weekly-summary.ts` | `glucose-metrics.ts` (já faz episódio) |
| **B6** CV | uma fórmula | `audit/metrics.ts` | `glucose-metrics.ts` |
| **B7** dia local | uma função de agregação diária no fuso do perfil | `insights/v2/datasets.ts`, `queries/card-agora.ts`, `queries/glucose-series.ts`, `full-history.ts` | `lib/time/local-day.ts` |
| **B8** adesão | IA e platô usam a regra única | `lib/ai/user-context.ts`, `lib/exercicios/plateau-inputs.ts` | `lib/medications/adherence.ts` |
| **B13** estoque | um cálculo, ciente da cadência | `stock.ts`, `queries/card-agora.ts` | `cadence.ts` |
| **B9/B10** meta do perfil | pico pós-refeição e próximo passo usam a faixa do perfil; base "antes" com limite de tempo | job `evaluate_meal_glucose_spikes` (migration), `next-step.ts` | `resolveGlucoseTargets` |
| **B12** dado de demonstração | fonte `mock` fora de toda análise | motores de sono e glicemia | filtro do histórico completo |
| **B14** insulina/secretagogo | pela base canônica de mecanismos, não por nome | `queries/body-composition.ts` | `substance_mechanisms` |
| **B11/C10** IA sem veredito | exame: status por regra (faixa do laudo) antes do score; viabilidade de meta: veredito por regra | `lib/exams/*`, `lib/audit/day-grid.ts`, `goal-feasibility` | `energy.ts` (`safeWeeklyRateKg`) |
| **B2** ciclo de hipo | evento criado quando a glicemia cruza o limiar do plano; "agi" e "reavaliei" no card | `card-agora`, `app/actions/hypo-plan.ts`, ingestão de glicemia | tabela, ações e card já existem |
| **B3** "Pulei hoje" | botão na tela e ação na notificação | `daily-doses-card`, `public/sw.js`, `logMedicationSkipped` | ação já existe |
| **B16** alertas lidos | `read_at` gravado ao ver; uma regra de "não lido" | sino, painel, `/analise/alertas` | — |
| **D1** apagar | insulina, medida e foto corporal apagáveis pela tela | telas | ações já existem |

**Decisão clínica necessária (D7):** a escolha entre `>` e `>=` na meta e os limiares sem citação. Proponho
manter o que o consenso usa (Battelino 2019) e registrar a escolha para sua validação; nada muda sem o seu
aceite.

**Validação objetiva**
- Teste de **coerência entre telas**: para o mesmo conjunto de leituras, painel, auditoria, resumo
  semanal, relatório médico e histórico completo devolvem **o mesmo** TIR, contagem de hipo e CV.
- Teste: leitura de 180 com meta 70–180 classificada igual em todos os motores.
- Teste: refeição às 22 h no fuso de São Paulo cai no mesmo dia que a glicemia daquele horário.
- Teste: score de 27 leituras consecutivas abaixo do limiar = **1** episódio.
- Teste do ciclo de hipo: leitura abaixo do limiar → evento → card "agi" → reavaliação → card fecha.
- "Pulei hoje" gravado aparece como pulada, não conta como tomada, e entra no relatório.
- Nenhuma tela existente perde função (teste de regressão + roteiro manual).

**Complexidade:** G (≈ 6–8 PRs). **Migrations novas:** 1–2 (pico pós-refeição; gatilho/insert de evento de hipo).

---

## Etapa 3 — A gestora: ferramentas, contexto e memória

**Objetivo:** a IA deixa de receber um resumo fixo e passa a **investigar** os dados com ferramentas
determinísticas, lembrar do que importa e explicar cada conclusão.

### 3.1 Ferramentas somente leitura (C1)

Cada ferramenta devolve `{ dados, janela, cobertura, idade, limites }` e nunca grava dado clínico.

| Ferramenta | Base existente |
|---|---|
| `situacao_glicemica(periodo)` — TIR/TBR/TAR, episódios, CV, GMI, cobertura | `glucose-metrics.ts` |
| `padroes_horarios(periodo)` — por hora e dia da semana | `hourly-pattern.ts`, `findHourPattern` |
| `resposta_a_refeicoes(periodo)` — delta, tempo até pico, retorno, carga estimada × real | **novo**, sobre `meals` + leituras |
| `adesao(remedio?, periodo)` | `adherence.ts` |
| `insulina_registrada(periodo)` — **informativa, nunca para dose** | `insulin_logs` |
| `mecanismos_hipoglicemiantes(horario)` | `mechanism-count.ts`, `overlap.ts` (ligar) |
| `checar_substancia(nome)` | `substance-safety.ts` |
| `auditorias(periodo)` e tendência entre elas | `lib/audit/*` |
| `correlacoes(periodo)` — sono, carbo, exercício, adesão × glicemia | `insights/v2/*` (+ adesão × TIR, treino × hipo posterior) |
| `corpo(periodo)` — medidas, metas, plausibilidade | `lib/body/*` |
| `energia_e_ritmo()` | `energy.ts` |
| `treino(periodo)` — volume, recuperação, platô | `lib/exercicios/*` |
| `exames(analito?, periodo)` — valores e faixa do laudo; GMI × HbA1c | `lib/exams/*` |
| `pressao(periodo)` | `blood-pressure.ts` |
| `plano_de_hipo()` e eventos | `hypo_plan`, `hypo_events` |
| `lacunas()` — o que falta, desde quando | `context-receipt.ts`, `fetch-all.ts` |
| `telas_do_app()` | `feature-index.ts` (completo, C5) |

### 3.2 Contexto e orquestração

- Contexto base continua (recibo + resumo curto); o resto vem por ferramenta, sob demanda (C3).
- Tool calling no cliente atual (compatível com os três provedores); **roteamento de modelo por tarefa** e
  `temperature` explícita (C9).
- Sanitização e zod em todas as rotas (C6); tokens registrados também em falha (C11); recibo com "zero
  confirmado" (C12).

### 3.3 Memória (C2) — tabelas novas, todas no inventário LGPD desde o início

| Estrutura | Conteúdo | Quem grava |
|---|---|---|
| `ai_findings` | situação detectada por regra, evidência, janela, gravidade, estado | motores determinísticos |
| `ai_recommendations` | texto, tipo (educativa / comportamental / "leve ao médico"), achado de origem, evidência citada, estado (proposta, aceita, recusada, ignorada, expirada), data de reavaliação, resultado medido | gestora (texto) + regra (estado e resultado) |
| `ai_user_facts` | fatos e preferências que o próprio usuário declarou ou aceitou guardar; editáveis e apagáveis | usuário |
| `ai_thread_summaries` | resumo de conversas anteriores | gestora |

Reaproveita `insight_findings` e `metabolic_alerts` como fonte de achados em vez de duplicá-los.

### 3.4 Análise geral (o "comportamento esperado")

A gestora ganha um modo de **análise da situação geral**, com estrutura fixa, montada a partir das
ferramentas:

| Seção pedida | Fonte |
|---|---|
| Situação atual | `situacao_glicemica`, `adesao`, `lacunas`, último corpo/pressão |
| Evolução histórica | auditorias, séries, corpo, exames |
| Tendências | comparação entre janelas (determinística) |
| Possíveis causas e associações | `correlacoes`, `mecanismos`, `resposta_a_refeicoes` — **sempre como associação, nunca causa** |
| Pontos de atenção | `ai_findings` ordenados por gravidade |
| Alternativas | opções **não clínicas** e "leve ao médico" para tudo que tocar tratamento |
| Recomendação fundamentada | com evidência citada (números, janela, regra) |
| Resultados esperados e limitações | piso de dados, cobertura, incerteza |
| Acompanhamento | grava em `ai_recommendations` com data de reavaliação |

**Proibido por regra (guarda-corpo, A6 + lista de proibições):** dose, suspender/trocar remédio, alterar
meta, diagnóstico, previsão de glicemia com hora e valor, linguagem causal ("isso está causando").

### Validação objetiva
- Para cada ferramenta: teste com dados sintéticos e o mesmo resultado do motor de origem (sem
  reimplementar).
- **Conjunto de avaliação** (C8) com ≥ 30 casos sintéticos (hipo noturna após treino, adesão baixa,
  dados insuficientes, pedido de dose, pergunta sobre substância nova, pergunta causal): a gestora
  (a) cita evidência em 100% das recomendações, (b) recusa dose/troca de remédio em 100%, (c) declara
  dado insuficiente quando o piso não é atingido, (d) não usa linguagem causal. Rodado com provedor
  simulado no CI e, **com sua autorização de custo**, com o provedor real.
- Exportação e exclusão LGPD incluem as quatro tabelas novas (teste derivado do schema já existente).
- Chat existente continua funcionando para perguntas simples (regressão).

**Complexidade:** G (≈ 8–10 PRs). **Migrations novas:** 1–2 (memória).

---

## Etapa 4 — Acompanhamento contínuo e proatividade controlada

**Objetivo:** a gestora acompanha resultados e avisa quando algo relevante acontece — **só com
consentimento**, com frequência limitada e motivo verificável.

| Item | O que muda | Reaproveita |
|---|---|---|
| Consentimento granular | por fonte de dado enviada à IA e por tipo de aviso proativo; revogável; tela no Perfil | `profiles`, padrão de opt-in da Etapa 1 |
| Detecção | job determinístico gera `ai_findings` (hipo recorrente, TIR caindo, adesão caindo, sensor parado, recomendação vencida) | padrão `pg_cron → pg_net → rota` |
| Aviso | a gestora só **redige** o aviso de um achado já detectado; teto por dia, horário de silêncio, sem duplicata | `push_dispatch_log` (com a correção A3), filtro A6 |
| Reavaliação | ao vencer a data, regra mede o resultado (ex.: TIR noturno antes × depois) e atualiza `ai_recommendations` | ferramentas da Etapa 3 |
| Resumo periódico | semanal/mensal com achados, recomendações e resultados | `weekly-summary.ts` |
| Relatório médico | inclui recomendações dadas e resultados | `lib/audit/medical-report.ts` |

**Validação objetiva**
- Sem consentimento: zero chamadas ao provedor e zero avisos (teste).
- Com consentimento: no máximo N avisos/dia (N definido por você), nenhum em horário de silêncio, nenhum
  repetido para o mesmo achado.
- Recomendação com data de reavaliação gera medição de resultado no dia previsto (teste com relógio fixo).
- Todo aviso tem achado de origem com evidência (teste de integridade).

**Complexidade:** M–G (≈ 4–6 PRs). **Migrations novas:** 1–2 (consentimento, job de detecção).

---

## Etapa 5 — Validação integrada

Roda ao fim de cada etapa e, no fim, de ponta a ponta.

| Nível | O quê | Onde |
|---|---|---|
| Unitário | toda a suíte (hoje 1.407) + novos | local e CI |
| Banco | os 7 testes SQL atuais + os novos, contra Supabase local | local; CI quando houver banco de teste (E1) |
| Coerência | o teste "mesmo número em todas as telas" da Etapa 2 | local e CI |
| Avaliação da IA | conjunto da Etapa 3 com provedor simulado | CI; provedor real só com autorização |
| E2E | caminho clínico com conta sintética no banco local | local |
| Regressão de produto | roteiro manual de todas as telas existentes | navegador local |
| Produção | só depois de merge e migrations **autorizados**: conferência agregada + teste no celular por você | produção, com sua ordem |

**Critério de pronto do programa:** a gestora, numa conta sintética com 90 dias de dados, produz a análise
geral com as nove seções, cada recomendação com evidência, nenhuma violação de guarda-corpo no conjunto
de avaliação, números idênticos aos das telas, e a recomendação reavaliada no prazo — tudo com a suíte e os
testes SQL verdes.

---

## 2. Resumo de esforço

| Etapa | Complexidade | PRs estimados | Migrations novas | Bloqueios externos |
|---|---|---|---|---|
| 1 Segurança | M | 4–6 | 4 | aplicar em produção = sua ordem |
| 2 Verdade única | G | 6–8 | 1–2 | D7 (régua, limiares) |
| 3 Gestora | G | 8–10 | 1–2 | custo do provedor real na avaliação |
| 4 Proatividade | M–G | 4–6 | 1–2 | **D5/D6** (consentimento e política) |
| 5 Validação | contínua | — | — | teste no celular por você |

Total: ~25–30 PRs. Estimativa qualitativa; não é prazo.

## 3. Riscos

| Risco | Mitigação |
|---|---|
| Quebrar funcionalidade existente ao consolidar regras | teste de coerência antes de trocar; troca por motor, um PR por vez; roteiro de regressão |
| Mudança de número que você já acompanha (ex.: score por episódio) | aviso na tela e no relatório na transição; sua validação (D7) |
| Falsa autoridade com pouco dado (0 exames, 4 medidas) | piso de dados por ferramenta; "insuficiente" como resposta válida |
| Paráfrase escapando do filtro | filtro em duas camadas (frases + classificador) e avaliação contínua |
| Custo do provedor | teto efetivo (Etapa 1) antes de ferramentas e proatividade |
| Fadiga de alerta | teto diário, silêncio, deduplicação, consentimento por tipo |
| Dependências frágeis (LibreLinkUp, Google Fit) | ferramentas declaram a fonte e a idade do dado |
| Deriva regulatória | lista de proibições em código + avaliação; análise SaMD antes da Etapa 4 |
| Migrations acumuladas sem aplicar | cada etapa entrega reversão; aplicação por etapa, com sua ordem |

## 4. Decisões que exigem sua autorização

| # | Decisão | Quando |
|---|---|---|
| 1 | **Autorizar o início** e a ordem das etapas | agora |
| 2 | Religar o ambiente de teste local (WSL + Supabase local) | início da Etapa 1 |
| 3 | **A2** — aplicar as 2 migrations do PR #7 (suspensas) | quando quiser; independente do programa |
| 4 | **D13 / D5 / D6** — sugestão automática: pausar já? opt-in? que dado pode ir à IA? | Etapa 1 (pausa) e Etapa 4 (consentimento) |
| 5 | **P52** — valores do teto diário/mensal de IA | Etapa 1 |
| 6 | **D7** — régua `>`/`>=`, limiares, pesos do score, insulina ativa informativa | Etapa 2 |
| 7 | **I1 / GLYX-34** — troca de chave e segredos (operação sua) | quando quiser |
| 8 | Custo de rodar a avaliação com o provedor real | Etapa 3 |
| 9 | Teto de avisos proativos por dia e horário de silêncio | Etapa 4 |
| 10 | Análise de enquadramento SaMD antes da proatividade | antes da Etapa 4 |
| 11 | Cada **merge** (deploy) e cada **migration em produção** | ao fim de cada PR/etapa |

## 5. Melhorias adicionais já identificadas (fora do escopo mínimo)

Telemetria mínima de uso por tela (D7 de produto), marcador de evento (GLYX-37), limpeza de telas e rotas
mortas (D5), Ajuda atualizada (D4), retenção de logs (E5), sync do sensor em lote (E6), investigação do
`pg_net` (E7), tipos regenerados (E8), banco de teste no CI (E1), testes das ações críticas (E2).
