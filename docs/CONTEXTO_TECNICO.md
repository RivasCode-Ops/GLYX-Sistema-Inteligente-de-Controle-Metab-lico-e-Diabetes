# Contexto técnico — GLYX

> Extraído do código em 2026-07-21, no branch `exercicios-plano-treino`. Complementa o
> [README](../README.md) (setup/operação) e o [ROADMAP](../ROADMAP.md) (planejamento): este
> documento registra **como o sistema funciona por dentro e por quê**, incluindo inconsistências
> conhecidas. Onde uma regra clínica está implementada, o arquivo:linha é citado — a fonte da
> verdade é o código, não este texto.

---

## 1. Identidade do produto

App web (PWA) em português para autocuidado metabólico e diabetes: registro diário de glicemia,
refeições, medicação, exercício, água, peso e exames, com sincronização automática de sensor CGM,
análise assistida por IA e alarmes push.

**Não é dispositivo médico.** Não faz diagnóstico e não prescreve. Essa posição é reafirmada em
código, não só em documento — ver §6.6.

Acesso é **invite-only** (`SIGNUP_INVITE_CODE` + allowlist de e-mail), com signup público do Supabase
Auth desligado.

---

## 2. Estado atual

### Escala e maturidade

| Métrica | Valor |
|---|---|
| Commits | 98 (11/07 → 20/07/2026) |
| Arquivos TS/TSX | 298 (~24.000 linhas) |
| Páginas (`page.tsx`) | 42 |
| Rotas de API | 37 |
| Arquivos de teste | 30 (Vitest) + 3 specs E2E (Playwright) |
| Migrations | 48 (`20260109000000_init` → `20260719000000_*`) |
| Tabelas no Postgres | 25, **todas com RLS ativo** |
| Funções SQL | 14 |
| Cron jobs ativos | 7 |

Projeto **jovem e intenso**: ~10 dias de desenvolvimento, ~10 commits/dia. Isso explica o padrão
observável de correções em cima de correções recentes, e a deriva de documentação registrada em §10.

### Volume de dados em produção (2026-07-21)

| Tabela | Linhas |
|---|---|
| `glucose_readings` | 1.341 |
| `ai_usage` | 82 |
| `water_logs` | 44 |
| `medication_logs` | 34 |
| `meals` | 32 |
| `medications` | 13 |
| `metabolic_audits` | 5 |
| `exercise_sessions` | 4 |
| `weight_logs` / `insulin_logs` / `push_subscriptions` / `profiles` | 3 / 2 / 2 / 2 |
| `exams` / `strength_logs` | 0 |

**Dois perfis reais.** O sistema está em beta fechado de fato, não só de intenção. O volume de
glicemia (1.341) vem do CGM; o resto é registro manual esparso. Consequência prática: **as regras
que dependem de histórico ainda não foram exercitadas com dados densos** — auditoria, correlações de
insights e adesão medicamentosa rodam hoje perto do piso de dados mínimos.

### Critérios de "pronto para beta mais amplo"

Definidos em [ROADMAP.md](../ROADMAP.md); nenhum marcado como concluído. Os pendentes de maior peso
são migrations/secrets de produção aplicados, wipe/export LGPD exercitado em conta real, e ao menos
um sensor com sync estável por 7 dias.

---

## 3. Stack e arquitetura

### Stack

- **Next.js 15** (App Router, React 19, Server Actions, Route Handlers) + TypeScript + Tailwind
- **Supabase**: Postgres + Auth + RLS + Storage (buckets privados) + `pg_cron`/`pg_net`
- **IA**: Kimi K2.6 via API oficial Moonshot, usando o SDK `openai` apontado para endpoint compatível
- **Web Push** (VAPID) + Service Worker
- **CGM**: FreeStyle Libre (LibreLinkUp) e Dexcom (OAuth)
- **Observabilidade**: Sentry opcional, com fallback para `console`
- **Testes**: Vitest (lógica pura) + Playwright (portões de auth)

### Estrutura de rotas

Três grupos no App Router:

| Grupo | Papel |
|---|---|
| `app/(app)/` | Shell autenticado — sidebar, header, tab bar mobile |
| `app/(auth)/` | Login/registro, sem shell |
| `app/` raiz | HTML root (`lang="pt-BR"`, `dark` fixo) + páginas públicas |

Módulos: `dashboard` ("Hoje"), `glicemia`, `alimentacao`, `medicacao`, `exercicios`, `mapa-risco`,
`alertas`, `ia-metabolica`, `insights`, `historico`, `exames`, `perfil`, `integracoes`, `status`,
`admin`. Públicas fora dos grupos: `/`, `/privacidade`, `/instalar`, `/risco`, `/relatorio-medico`,
`/conta-desativada`.

Nomes de rota em **português**; colunas de banco em **inglês**.

### Três camadas de acesso a dados

| Camada | Papel | Contrato |
|---|---|---|
| `lib/queries/*` | Leitura reutilizada entre telas | Cria o próprio client, resolve o próprio usuário, retorna `null`/`[]` sem sessão |
| `app/actions/*` | Escrita (18 arquivos `"use server"`) | Zod `safeParse` → `ActionResult { ok?, error? }` → `revalidatePath()` explícito |
| `page.tsx` inline | Query de tela única | Direto na página, não promovida a `lib/queries` |

Páginas são Server Components `async` por padrão; `"use client"` só para interatividade (formulários,
gráficos Recharts, dialogs).

---

## 4. Decisões de arquitetura

Cada decisão abaixo tem racional registrado em comentário no próprio código — a convenção do repo é
explicar o **porquê**, com o problema concreto que motivou a linha.

### 4.1 O Postgres decide *quem/quando*; a rota web só entrega

Todo o agendamento é `pg_cron` chamando de volta as rotas HTTP via `net.http_post`. A função SQL
resolve janela de horário no fuso do usuário, faz dedupe (`push_dispatch_log` com
`on conflict do nothing`) e envia o payload já com endpoint e chaves.

**Motivo declarado** (`app/api/push/dispatch/route.ts:6-8`): assim o servidor web **não precisa da
service role key** para descobrir quem notificar. Exceção: `cgm/sync-dispatch` usa service role.

Não há Vercel Cron — `vercel.json` não define `crons`.

### 4.2 Fuso horário é do perfil, nunca do processo

Toda agregação de "hoje" usa `profiles.timezone`, não o relógio do servidor. `lib/time/local-day.ts`
isola a conversão e é a única parte da lógica de janela horária coberta por teste. O normalizador do
Libre reconstrói o timestamp manualmente (`lib/cgm/normalize/libre.ts:29-54`) porque a Abbott devolve
`M/D/YYYY h:mm:ss AM/PM` sem fuso — `new Date(string)` daria resultado diferente entre a máquina
local e a Vercel (UTC).

### 4.3 Fail-closed no rate limit de IA

`lib/ai/rate-limit.ts:44-46,69-71` — se a contagem **ou** o insert falharem, o uso é **negado**. Erro
de banco não vira bypass. A linha de `ai_usage` é reservada *antes* da chamada ao provedor; os tokens
reais são gravados depois.

### 4.4 Circuit breaker com backoff por classe de erro

`lib/cgm/circuit-breaker.ts` — lógica pura e testada. Classifica o erro (`auth`, `crypto`,
`rate_limit`, `client_version`, `unavailable`) e aplica backoff diferente para cada um: `crypto` →
12h, `auth` → 1h e depois 6h, `rate_limit` → 15min×n com teto de 2h.

**O cron respeita o circuito; o sync manual do usuário ignora** mas atualiza o estado — a pessoa
sempre consegue tentar de novo na mão. Incremento de falha é atômico via RPC (`cgm_bump_failure`)
para não perder contagem em chamadas concorrentes.

### 4.5 Credenciais de sensor cifradas em AES-256-GCM, com rotação automática

`lib/cgm/librelinkup.ts:211-279` — chave derivada de `CGM_CREDENTIALS_SECRET`, IV aleatório, layout
`iv|authTag|ciphertext`. Há fallback para a chave legada (`CRON_SECRET`) e **re-criptografia
automática** para a chave dedicada no próximo sync bem-sucedido (`lib/cgm/sync.ts:79-82`) — migração
de chave sem intervenção manual.

O state do OAuth (Dexcom e Google Fit) é assinado com HMAC-SHA256 e validado com `timingSafeEqual`;
em produção o código **lança exceção** se o segredo faltar, para nunca assinar com constante pública.

### 4.6 A aritmética não é confiada ao modelo

`lib/ai/parse-meal.ts:23-25` — o modelo devolve os itens; **a soma é feita no servidor**. Decisão
explícita: "o modelo não é confiável pra fazer essa soma sozinho".

Na mesma linha, `isUnusableCompletion` (adicionado em 21/07) recusa resposta vazia ou truncada em vez
de deixá-la virar uma refeição zerada — ver §10.4.

### 4.7 Defesa contra prompt injection de segunda ordem

`lib/ai/sanitize-context.ts` — achata whitespace e trunca antes de interpolar texto vindo de **OCR de
rótulo/exame** no prompt. Quebras de linha que imitariam uma nova instrução são eliminadas.

Aplicado em `supplement-check` e `goal-feasibility`. **Não aplicado no contexto do chat** — ver §10.3.

### 4.8 Guia de estilo como contrato, não sugestão

[docs/GUIA_ESTILO.md](GUIA_ESTILO.md) define 4 padrões obrigatórios (pílula de status, tag de
severidade, grid de números, ícone de linha = ícone do menu) e nomeia o anti-padrão a eliminar:
*"card único com título + parágrafo corrido + bullets com traço + aviso colorido no final — o padrão
muro de texto"*.

Consequência prática: **tela nova reaproveita `StatusPill`/`Card`; não se inventa layout novo para o
mesmo tipo de informação.**

---

## 5. Modelo de dados

25 tabelas, todas com RLS por `auth.uid() = user_id`. Tipos manuais em `types/database.ts` (não
gerados pelo CLI do Supabase — precisam ser atualizados à mão quando o schema muda).

### Núcleo clínico
`glucose_readings` · `meals` · `insulin_logs` · `medications` · `medication_logs` ·
`medication_snoozes` · `exams` · `blood_pressure_logs`

### Corpo e atividade
`exercise_sessions` · `strength_logs` · `muscle_pauses` · `weight_logs` · `water_logs` ·
`health_snapshots`

### Derivados e análise
`metabolic_audits` · `metabolic_alerts` · `insight_findings`

### Infraestrutura
`profiles` (23 colunas, 5 policies) · `cgm_connections` · `google_fit_connections` ·
`push_subscriptions` · `push_dispatch_log` · `ai_threads` · `ai_messages` · `ai_usage`

### `profiles` é o centro da configuração

Concentra identidade (`full_name`, `email`, `diabetes_type`), alvos clínicos
(`target_glucose_min/max`, default 70/180), parâmetros de bolus (`carb_ratio`, `correction_factor`,
`target_glucose_bolus` — **meta separada** dos alvos gerais), corpo (`sex`, `birth_year`,
`height_cm`, `activity_level`, `body_goal`, `target_weight_kg`), fuso (`timezone`) e flags
(`onboarding_done`, `is_admin`, `disabled`).

Tem 5 policies (as demais tabelas têm 1) porque separa leitura própria, update próprio, update de
admin e guarda de colunas privilegiadas (`profiles_guard_privileged_columns`).

### Buckets de Storage

| Bucket | Público | Limite | MIMEs |
|---|---|---|---|
| `meal-photos` | não | 4 MB | jpeg, png, webp |
| `medication-labels` | não | 4 MB | jpeg, png, webp |

Caminho `${userId}/${uuid}.${ext}` — a pasta por usuário é o que a policy verifica. **Não há policy de
`update`** em nenhum dos dois.

Imagem de exame **não é persistida** — trafega como data-URL em base64 direto para o modelo de visão.

---

## 6. Regras de negócio clínicas

### 6.1 Glicemia

**Faixa-alvo**: default 70–180 mg/dL, sobrescrita por `profiles.target_glucose_min/max`. O comentário
em `lib/queries/dashboard.ts:79` registra a intenção: *"faixa definida com o médico; 70–180 é só o
padrão inicial"*.

⚠️ O par 70/180 é **literal repetido em 5 arquivos**, sem constante compartilhada
(`lib/queries/dashboard.ts:33`, `lib/audit/day-grid.ts:36`, `lib/audit/medical-report.ts:53`,
`lib/exercicios/weekly-goals.ts:99`, `lib/ai/user-context.ts:252`).

**Classificação de uma leitura** (`lib/insights/rules.ts:36-45`):
- `>= 250` → hiperglicemia (warning)
- `< target_min` (ou 70) → hipoglicemia (**critical**, dispara push)
- `< limiar + 10` → near-low (info, 1×/dia)

Conduta em hipo: *"Corrija com carboidrato rápido e meça de novo em 15 min"*.

**Tempo no alvo (TIR)** — `lib/audit/metrics.ts:56-65`: percentual de **leituras** na faixa, não
percentual de tempo. Com CGM (leitura a cada 15 min) aproxima tempo; com registro manual, não. Não
estratifica nível 1/2 da ADA.

**Pico pós-refeição** — regra em SQL, não em TypeScript
(`20260713200000_water_and_glucose_spike.sql:114-122`): `glucose_spike = true` se, nas 2h após
`eaten_at`, houver pico `>= 180` **ou** subida `>= 50 mg/dL` sobre a leitura imediatamente anterior.
Avaliado por cron a cada 30 min.

**Predição de hipo (CGM)** — `lib/cgm/trend.ts:20-65`: regressão linear sobre 25 min, mínimo 3
pontos, horizonte 30 min. Alerta se atual ≥70, projetado <70 e slope ≤ −0,5 mg/dL/min. Disclaimer no
código: *"não substitui o alarme do próprio sensor"*.

### 6.2 Dose de insulina (bolus)

**Fórmula** — `lib/medications/bolus-calculator.ts:20-41`:

```
carbDose       = carbsG / carbRatio
correctionDose = (glicemiaAtual − metaBolus) / correctionFactor    [só se atual > meta]
totalDose      = carbDose + correctionDose                          [arredondado a 0,1 U]
```

**Travas existentes**: retorna `null` sem `carb_ratio`; correção só acima da meta; UI não renderiza
sem `carb_ratio`; limites de perfil (`carb_ratio` 1–200, `correction_factor` 1–200,
`target_glucose_bolus` 50–300); dose calculada **não é gravada** em lugar nenhum.

**Travas ausentes** — ver §10.1. Esta é a maior lacuna de segurança clínica do sistema.

### 6.3 Medicação

Horários em `medications.reminder_times` (`HH:MM`), com parser tolerante que aceita `20h30` e
normaliza `8:00`→`08:00`.

**Janela de casamento** (`components/medicacao/daily-doses-card.tsx:36-82`): uma dose conta como
tomada se existe log em `[horário − 1h, próximo horário agendado]`, e **cada log casa com no máximo
uma dose**. Estados: `tomada` / `adiada` / `agendada` / `pendente` — não existe "atrasada"; vencido e
não registrado é `pendente`.

**Alarme push**: dispara quando a hora local do perfil cai em `[horário, horário + 10min)`, cron a
cada 5 min, dedupe por `med_id@hora` + data local, marcado `critical`.

**Estoque**: estima dias restantes por `stock_units / doses_por_dia`, avisa com ≤7 dias.

### 6.4 Energia e metabolismo

Tudo em `lib/health/energy.ts`, com bloco de fontes no cabeçalho.

- **TMB**: Mifflin-St Jeor (`10×kg + 6,25×cm − 5×idade + 5/−161`)
- **TDEE**: TMB × fator (sedentary 1,2 / light 1,375 / moderate 1,55 / very 1,725)

| Objetivo | Calorias | Proteína |
|---|---|---|
| `lose` | `max(1200, TDEE − 500)` | 1,6 g/kg |
| `gain` | `TDEE + 300` | 1,8 g/kg |
| `maintain` | `TDEE` | 1,2 g/kg |
| `recomp` | `max(1200, TDEE − 200)` | 2,0 g/kg |

Macros: proteína primeiro, sobra dividida 50/50 **em calorias** entre carboidrato e gordura. Piso
absoluto de 1200 kcal. Ritmo seguro: perda 0,75%/semana, ganho 0,25%/semana.

**Ajuste adaptativo** (`:153-192`): exige ≥4 pesagens e ≥14 dias, usa 7700 kcal/kg, delta limitado a
±150 kcal e arredondado a múltiplos de 50.

**Água**: `peso × 35 ml`, fallback 2000 ml. Só bebidas hidratantes contam (água, água c/ gás, chá —
café e refrigerante diet não).

### 6.5 Score metabólico (auditoria)

`lib/audit/score.ts` — escala 0–100, **começa em 100 e subtrai**.

**Gate**: `< 7 leituras` ou `< 3 dias com glicemia` → score 0, label "Dados insuficientes".

| Fator | Condição | Impacto | Peso |
|---|---|---|---|
| `tir_low` | TIR < 50% | −28 | 3 |
| `hypos` | n > 0 | `clamp(n×6, 6, 24)` | 3 |
| `hypers` | n > 0 | `clamp(n×2,5, 4, 22)` | 2 |
| `tir_moderate` | 50 ≤ TIR < 70% | −14 | 2 |
| `variability_high` | CV ≥ 36% | −12 | 2 |
| `meal_spikes` | n ≥ 3 | `clamp(n×2, 6, 14)` | 1,5 |
| `exam_altered` | n > 0 | `clamp(n×3, 3, 12)` | 1 |
| `sedentary` | 0 dias ativos | −8 | 1 |
| `sleep_debt` | ≥3 noites curtas | −6 | 1 |
| `hydration` | poucos dias hidratados | −4 | 0,5 |

Rótulo: `< 45` Alerta · `< 70` Atenção · senão Estável. Fatores ordenados por **peso**, não por
impacto — decisão registrada em comentário.

**Insights v2** (`lib/insights/v2/engine.ts`) são declaradamente **correlações descritivas, não
inferência causal**: sono vs glicemia, carboidrato vs glicemia, exercício vs glicemia, todos com
exigência de amostra mínima e delta mínimo.

### 6.6 Onde o produto se recusa a agir

Guardrails no prompt de IA (regras negativas explícitas): não diagnosticar, não alterar dose, não
recomendar medicamento, classificar valor de exame só quando a faixa de referência estiver no texto,
`lifestyleTopics` só sugere **tema de conversa** com o médico. Presentes em `lib/exams/prompts.ts`,
`lib/exams/interpret.ts`, `chat`, `meal-photo`, `supplement-check`, `goal-feasibility`,
`plate-builder`.

Disclaimers em código: `energy.ts`, `score.ts`, `trend.ts`, `insights/v2/engine.ts`,
`bolus-calculator-form.tsx`, `mapa-risco`, `exames`, `relatorio-medico`, `privacidade`.

**Fontes citadas**: ADA Standards of Care §8 (déficit 500–750 kcal), Mifflin-St Jeor, ADA Diabetes
Risk Test (corte ≥5 de 11), AHA (pressão arterial), MacroFactor (guardrail ±150 kcal).

**Sem fonte citada**: CV ≥36%, TIR 70%/50%, hiper 250, spike ≥50 mg/dL, água 35 ml/kg, sono <6h,
carga glicêmica 34/67, 7700 kcal/kg.

---

## 7. Integrações e processos de fundo

### 7.1 IA

Provedor único: **Kimi K2.6** via `https://api.moonshot.ai/v1`, usando o SDK `openai`. Fallback
legado para OpenAI `gpt-4o-mini` quando só `OPENAI_API_KEY` existe.

⚠️ **`aiProviderOptions()` injeta `{ thinking: { type: "disabled" } }` apenas para o Kimi**
(`lib/ai/client.ts:11-15`). Sem esse parâmetro o modelo gasta todo o `max_tokens` em raciocínio e
devolve conteúdo **vazio** — comportamento verificado empiricamente em 21/07. Qualquer chamada nova
ao Kimi precisa espalhar `...aiProviderOptions()`.

12 chamadas de IA: `chat` (streaming, 800 tk), `meal-photo` (700), `meal-text` (800), `exam-photo`
(1600, JSON), `med-label` (500), `supplement-check` (1400, JSON), `plate-builder` (1200, JSON),
`goal-feasibility` (900, JSON), `workout-suggestion` (300), `medication-schedule` (500), `status`, e
`meals/suggest-dispatch` (80, cron).

**Rate limit**: janela deslizante de 1h em `ai_usage` — `chat` 30/h, demais 10/h. `plate-builder`
compartilha o balde de `meal_photo`; `goal-feasibility` compartilha o de `chat`.

**Custo**: US$ 0,95/1M input, US$ 4/1M output (hardcoded em `lib/ai/cost.ts`), com orçamento diário e
mensal exibidos no `/admin`.

**Contexto do usuário**: 14 consultas alimentam o prompt do chat — glicemia, refeições, insulina,
água, exercício, peso, picos, padrão horário de 14 dias, medicações nominais com dosagem, sono,
score e alertas. Ou seja, **dado clínico real e granular sai para a API do Moonshot a cada mensagem**.
O `user_id` não é enviado; os dados de saúde, sim.

### 7.2 CGM

**LibreLinkUp** — API **não documentada** da Abbott, o mesmo canal do app "seguidor". Login por
e-mail/senha do usuário (sem OAuth), headers de versão obrigatórios (`version: 4.16.0`; abaixo disso
a Abbott devolve 403/status 920), `accountId` = SHA-256 do user id, redirect de região recursivo com
teto de 2 saltos, aceite automático de termos com guard de 3 iterações.

**Dexcom** — OAuth 2.0 com `offline_access`, sandbox comutável por env, state CSRF assinado por HMAC
com validade de 15 min. O callback confere `user.id === verified.userId` — o state sozinho não basta.

Ingestão dedupa por `(user_id, source, external_id)`; em colisão de índice único, faz retry linha a
linha. Sync grava alerta e dispara **push preditivo de hipoglicemia**.

### 7.3 Cron e push

7 jobs `pg_cron`, todos chamando rotas HTTP com header `x-cron-secret`:

| Job | Frequência | Alvo |
|---|---|---|
| `glyx-med-alarms` | 5 min | `/api/push/dispatch` |
| `glyx-cgm-sync` | 15 min | `/api/cgm/sync-dispatch` |
| `glyx-meal-suggest` | 15 min | `/api/meals/suggest-dispatch` |
| `glyx-sensor-stale-alert` | 15 min | `/api/push/dispatch` |
| `glyx-water-reminder` | 30 min | `/api/push/dispatch` |
| `glyx-glucose-spike-eval` | 30 min | (só SQL) |
| `glyx-daily-tip` | 12:00 diário | `/api/push/dispatch` |

Push remove assinatura morta em 404/410. Concorrência do dispatcher de IA fixada em 5, com racional
documentado (sequencial estoura o timeout de 60s; paralelo demais bate no rate limit do provedor).

### 7.4 Exames

Duas entradas: **foto/PDF → visão** (máx. 3 páginas, 4 MB somados, PDF renderizado client-side por
`pdfjs-dist` a ~150 DPI) e **texto colado → interpretação** (trunca em 14.000 chars).

**Não há OCR dedicado** — nem Tesseract, nem Vision, nem Textract. O OCR é feito pelo próprio modelo
de visão do Kimi.

Validação em camadas: JSON parseável → schema Zod → checagem semântica exigindo `summary` não vazio
e (`extractedText` ou `findings`). Valores importáveis (peso, glicemia de jejum) **nunca entram
automaticamente** — o usuário confirma.

---

## 8. Segurança e privacidade

### Implementado

- **RLS em 100% das tabelas** de `public`, por `auth.uid() = user_id`
- **Invite-only**: `SIGNUP_INVITE_CODE` via Admin API + `ALLOWED_EMAILS` como barreira para login
  social (que contornaria o convite)
- **Middleware** redireciona sem sessão, mas **não** em `/api/*` — rotas de API autenticam sozinhas e
  devolvem 401 JSON, porque redirecionar um POST de cron quebraria a chamada
- **Conta desativada** (`profiles.disabled`) → 403 em API, redirect na UI
- **`SessionGuard`** faz poll de `/api/auth/ping` a cada 2 min para evitar PWA "zumbi"; erro de rede
  não desloga
- **Credenciais de sensor** em AES-256-GCM com rotação automática de chave
- **7 migrations dedicadas a hardening**: `lock_down_handle_new_user`, `tighten_admin_rpc_grants`,
  `profiles_privilege_guard`, `rotate_cron_secret_and_lock_rpcs`, `revoke_public_execute_*`,
  `move_remaining_cron_functions_to_vault`, `cgm_sync_dispatcher_vault_secret`
- **LGPD**: consentimento, export JSON com redação de segredos de CGM, wipe de registros + Storage,
  [DPIA](DPIA.md). Teste estático (`lib/privacy/rls-coverage.test.ts`) exige que toda tabela clínica
  nova tenha RLS + policy com `auth.uid()`
- **Logs**: apenas os 8 primeiros chars do `user_id` vão para o Sentry

### Alerta operacional documentado no próprio repo

Funções `SECURITY DEFINER` chamadas só pelo `pg_cron` precisam de `revoke execute ... from public,
anon, authenticated` **explícito** — por padrão o Postgres concede `EXECUTE` a `PUBLIC` na criação, o
que as exporia via `/rest/v1/rpc/...` para qualquer visitante.

---

## 9. Convenções de código

- **Português** em comentários, nomes de teste, strings de UI e nomes de rota. **Inglês** em
  identificadores de código e colunas de banco.
- **Comentário explica o porquê**, com o problema concreto que o motivou. Exemplo real:
  *"Sem isso, `recorded_at` sempre virava 'agora' (default da coluna), mesmo registrando bem depois
  de medir."* Catch vazio sempre recebe justificativa.
- **`ActionResult`** é redeclarado por arquivo, não centralizado.
- **Testes só de lógica pura** — `environment: "node"`, sem `.test.tsx`, sem `@testing-library`.
  Não se testa render de componente.
- **Sem validação de env no boot** — `lib/env.ts` é só helpers de leitura, sem Zod sobre
  `process.env`.
- **Modo demo**: quando `isSupabaseConfigured()` é falso, o middleware libera tudo, os clients
  retornam `null`, aparece banner âmbar e as telas usam fixtures de `lib/demo/data.ts` (datas
  relativas a `new Date()`, então nunca envelhecem).
- **Gate de CI**: `npm run verify` = lint + build + Vitest, depois Playwright.

---

## 10. Riscos e inconsistências abertas

Achados de leitura de código, ordenados por gravidade. Nenhum foi corrigido neste levantamento.

### 10.1 🔴 Calculadora de bolus sem trava de hipoglicemia, sem IOB e sem dose máxima

**Verificado diretamente em `lib/medications/bolus-calculator.ts:20-41`.**

Quando a glicemia está **abaixo** da meta, a correção vira 0 — mas a dose de carboidrato sai
**cheia**, sem redução e sem aviso. Uma glicemia de 55 mg/dL com 60 g de carboidrato devolve dose
integral. Não há:

- **IOB / insulina ativa** — nenhuma referência a insulina a bordo em todo o `lib/`
- **Dose máxima** — `totalDose` não tem clamp (o limite de 100 U em `app/actions/insulin.ts` aplica-se
  só ao *registro manual*, não à saída da calculadora)
- **Bloqueio ou aviso em hipoglicemia**

Agravantes:

1. `app/actions/insulin.ts:7-9` afirma: *"O app registra o que o usuário aplicou por orientação
   médica — **nunca calcula nem recomenda dose**."* A calculadora contradiz esse comentário.
2. O prompt do chat de IA carrega a mesma proibição (*"Nunca prescreva nem calcule doses"*), enquanto
   a UI oferece o cálculo.
3. O [ROADMAP](../ROADMAP.md) lista "calculadora de bolus de insulina como feature dedicada" em
   **fora de escopo** — a feature entrou em 18/07 (`1fc4672`) sem que a decisão de escopo fosse
   revista no documento.

Existe disclaimer na UI (*"cálculo educativo, não é prescrição médica"*), mas disclaimer não é trava.
**Recomendação: decidir explicitamente se a feature fica — e, se ficar, adicionar trava de hipo e
teto de dose antes de qualquer usuário além dos dois atuais.**

### 10.2 🔴 Segredo de cron versionado no git

O `CRON_SECRET` esteve **hardcoded em literal** dentro de funções SQL de migração, em dois valores
(v1 e v2). A própria migração `20260718010000` documenta o erro:

> *"A 'rotação' de 2026-07-13 recolocou o MESMO segredo já vazado no git em mais 5 funções, em vez de
> gerar um valor novo."*

A correção move as funções para o **Supabase Vault**. **Resíduo**: `record_system_ai_usage` ainda
compara `p_secret` contra o literal v2 hardcoded, e é chamada por `meals/suggest-dispatch`. Ambos os
valores permanecem no histórico do git — remover do arquivo não basta, o valor precisa ser rotacionado.

Além disso, a comparação do header usa `!==` simples, não `timingSafeEqual`.

### 10.3 🟠 Contexto do chat não passa por sanitização

`lib/ai/sanitize-context.ts` existe justamente para neutralizar prompt injection vinda de OCR, mas
`lib/ai/user-context.ts` interpola `medication.name`, `medication.dosage`, `meal.name`, `alert.title`
e `factor.label` **direto no prompt do chat**, sem `sanitizeForPrompt`. O chat é a superfície com
maior liberdade de saída, e nomes de refeição/medicação são texto livre do usuário — ou vindos de OCR
de rótulo.

### 10.4 🟠 Três definições de hiperglicemia coexistem

| Contexto | Limiar | Arquivo |
|---|---|---|
| Alerta | `>= 250` | `lib/insights/rules.ts:4` |
| TIR / risco | `> targetMax` (180) | `lib/audit/metrics.ts:61` |
| Relatório médico | `>= 250` | `lib/audit/medical-report.ts:27` |

Relacionado: `lib/cgm/trend.ts:55` fixa `HYPO_MG_DL = 70` e **ignora** `target_glucose_min` do perfil,
enquanto `lib/insights/rules.ts:36` respeita. Dois caminhos de alerta de hipo com limiares
potencialmente diferentes para o mesmo usuário.

### 10.5 🟠 URL de produção hardcoded em 22 pontos das migrações

As funções de cron chamam `https://glyx-sistema-inteligente-de-control.vercel.app/api/...` em
literal. Não há variável de ambiente nem GUC. **Troca de domínio quebra todo o agendamento em
silêncio** — nenhum job falha visivelmente, eles simplesmente chamam um host que não responde.

### 10.6 🟡 Sem validação de coerência da faixa-alvo

`app/actions/profile.ts:10-11` aceita `target_glucose_min`/`max` como número livre — inclusive
`min > max` ou valores negativos. Isso propaga para todo o cálculo de TIR, alertas e risco.

### 10.7 🟡 Adesão medicamentosa usa duas regras diferentes

A UI casa dose com log por janela de horário
(`components/medicacao/daily-doses-card.tsx:56-82`); o relatório médico usa **contagem bruta de logs**
(`lib/audit/medical-report.ts:119-128`). Os dois números podem divergir para o mesmo período.

### 10.8 🟡 Falha silenciosa no upload de foto

`lib/storage/upload-private-photo.ts:25` retorna `null` em qualquer erro, e `app/actions/meals.ts`
salva a refeição com `photo_path: null` **sem avisar** que a foto se perdeu.

### 10.9 🟡 Deriva de documentação

- `ROADMAP.md` (atualizado 18/07) lista como fora de escopo uma feature que entrou em 18/07
- Tipos em `types/database.ts` são manuais — divergem do schema se alguém esquecer
- `README.md` aponta uma raiz de repositório (`C:\_PROJETOS\...`) diferente da atual
  (`D:\PROJETOS\04_LABS\...`)

---

## 11. Escopo negativo — o que deliberadamente não existe

Confirmado por busca no código, não por suposição:

- **HbA1c estimada / GMI** — não implementado
- **AGP clínico** — explicitamente fora de escopo no ROADMAP
- **TIR estratificado** (nível 1/2: <70 e <54; 180–250 e >250) — o valor 54 mg/dL não aparece
- **IOB / insulina ativa** — não existe
- **Ajuste de bolus** por índice glicêmico, gordura/proteína ou exercício
- **Portal do médico / prontuário**, **WhatsApp API**, **Apple Health no browser**, **classificação
  como SaMD/ANVISA** — todos fora de escopo declarado
- **Edge Functions do Supabase**, **Vercel Cron**, **bucket público**, **OCR dedicado** — nenhum
- **Testes de componente React** — a suíte cobre só lógica pura
- **Compartilhamento com cuidador** — decisão estratégica em aberto no ROADMAP; sem ela, não começar
  multi-tenant clínico

---

## 12. Como verificar este documento

```bash
npm run verify      # lint + build + Vitest (gate de CI)
npm run test        # só os testes unitários
npm run check:prod  # valida env de produção
```

Fontes primárias: o código citado com arquivo:linha, as 48 migrations em `supabase/migrations/`, e o
schema vivo no Supabase (projeto `glyx`).

**Ressalva de método**: as seções 6 e 7 foram levantadas por exploração sistemática do código; o
achado 10.1 foi verificado linha a linha diretamente. Números de schema, volume e cron vieram de
consulta ao banco de produção. Nada aqui foi validado abrindo o app com sessão real.
