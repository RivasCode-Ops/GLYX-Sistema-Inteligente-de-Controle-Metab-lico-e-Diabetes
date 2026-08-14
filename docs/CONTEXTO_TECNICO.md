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
código, não só em documento — ver §6.8.

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
| Migrations | 51 (`20260109000000_init` → `20260726010000_*`) |
| Tabelas no Postgres | 28, **todas com RLS ativo** |
| Funções SQL | 14 |
| Cron jobs ativos | 7 |

Projeto **jovem e intenso**: ~10 dias de desenvolvimento, ~10 commits/dia. Isso explica o padrão
observável de correções em cima de correções recentes, e a deriva de documentação registrada em §10.

### Volume de dados em produção (2026-07-21)

| Tabela | Linhas |
|---|---|
| `glucose_readings` | 4.592 |
| `ai_usage` | 245 |
| `medication_logs` | 181 |
| `water_logs` | 80 |
| `meals` | 58 |
| `exercise_sessions` | 21 |
| `medications` | 14 |
| `weight_logs` | 7 |
| `metabolic_audits` | 5 |
| `body_measurements` / `strength_logs` | 4 / 4 |
| `profiles` / `insulin_logs` / `push_subscriptions` | 2 / 2 / 2 |
| `exams` | 0 |

Contagem de **2026-08-14**. As 96 leituras `source='mock'` que constavam aqui foram removidas nessa
data; `glucose_readings` é só sensor real agora.

**Dois perfis reais.** O sistema está em beta fechado de fato, não só de intenção. O volume de
glicemia (4.592) vem do CGM; o resto é registro manual esparso. Consequência prática: **as regras
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

### 4.9 Vocabulário nunca é lista escrita à mão — nem em código, nem em fixture

**Regra:** todo lugar que precise de "todos os grupos musculares" usa `MUSCLE_GROUP_IDS`. Nenhuma
lista literal de ids, em nenhum arquivo, incluindo testes.

Isto não é preferência de estilo — é a correção de um modo de falha que apareceu em **três lugares
diferentes** ao crescer `MuscleGroupId` de 10 para 12:

1. `MUSCLE_GROUPS` era array literal: o grupo novo não virava erro, sumia de todas as telas (os
   motores iteram sobre a lista). Corrigido com `Record<MuscleGroupId, _>` + lista derivada.
2. Fixtures de teste tinham a lista literal: **onze testes passaram a afirmar "todos os grupos"
   sobre dez de doze, e continuaram verdes.**
3. `InsightModule` só não divergiu do CHECK porque havia teste amarrando os dois.

O caso 2 é o pior dos três. O caso 1 produzia ausência — algo sumia da tela e alguém notaria. O caso
2 produz **sinal verde ativo**: um teste que passa por não estar olhando é a única categoria de teste
com valor negativo, porque entrega confiança que não corresponde a nada.

Vale para qualquer vocabulário fechado do projeto (`AlertSeverity`, `InsightModule`,
`BodyMeasurementKey`): a union é a fonte, a lista é derivada, e quando o vocabulário também existe no
Postgres como CHECK, um teste amarra os dois.

### 4.10 Quando a correção depende de *qual* tabela é a fonte, teste não decide

Há uma família de defeitos em que o código está certo no que **faz** com o dado e errado em **de onde**
o tira. Fixture não distingue os dois: ela alimenta a tabela que o código escolheu ler, então o teste
confirma a premissa em vez de questioná-la. Teste e código compartilham o mesmo erro e concordam.

Caso concreto: a supressão de alerta para grupo recém-criado nasceu contando `strength_logs`. Ficou
**inerte** — não havia um único `strength_log` com `muscle_group` preenchido, enquanto
`exercise_sessions` cobria onze grupos. A guarda existia, tinha teste verde, e não protegia nada. Só
apareceu ao conferir o banco.

Desde a Fatia 3 (2026-08-14) as duas leem **as mesmas duas fontes**, via
`lib/exercicios/muscle-history.ts`: sessão e registro de carga com músculo. Somar carga só no sinal e
não na guarda recriaria o mesmo defeito pelo outro lado, e é por isso que as duas funções puras vivem
no mesmo módulo. Conferência no banco no dia da mudança: 18 sessões com grupos, **0** registros de
carga com músculo — ou seja, a fatia não mexe em número nenhum hoje, ela liga o caminho para o
primeiro registro vindo do catálogo.

É o mesmo formato do `count(*)` por `service_role` (4.11): a verificação estava do lado de dentro da
suposição que precisava checar.

**Regra: quando a correção depender de qual tabela é a fonte de verdade, confirme no banco — contagem
real, não fixture.** Vale especialmente enquanto duas fontes coexistem durante uma migração.

O próximo caso já é previsível: `direct_sets` vai poder contar de `strength_logs.muscle_group` ou do
catálogo via vetor de ativação, e as duas fontes vão conviver por um tempo. Escolher errado ali não
produz erro nem número absurdo — produz um volume plausível e errado, que é a falha mais cara desta
família.

**Desfecho (14/08/2026, Fatia 5).** A previsão se confirmou e a saída foi não escolher: a série
secundária vive em `lib/exercicios/indirect-volume.ts`, numa contagem **separada e rotulada**, e
`setsPerWeek` continua sendo só o primário. O motivo é que `WEEKLY_SET_TARGET` já embute trabalho
indireto — a própria definição diz que grupos pequenos recebem alvo menor "porque também são
recrutados indiretamente nos compostos". Somar as duas compararia número inflado contra alvo
calibrado para trabalho direto. Nenhum número existente mudou de valor com a fatia.

Uma série indireta vale **uma série**, não meia: ponderar exigiria um fator por par
exercício-músculo que ninguém mediu, e um número com casa decimal parece mais preciso que o palpite
que seria.

### 4.11 RLS só está verificada se a verificação simular o papel

Ler a policy na migration não prova nada, e conferir pelo painel/MCP prova menos ainda: **essas
conexões usam o `service_role`, que ignora RLS por definição**. Um `select count(*)` por ali retorna
o número certo mesmo com a policy quebrada — e é assim que se ganha confiança falsa numa tabela que
vai falhar no primeiro acesso real do app.

O erro clássico é a policy copiada de outra tabela referenciando `auth.uid() = user_id` numa tabela
que não tem `user_id`. A migration aplica sem reclamar; quebra só no primeiro `select` autenticado.

Procedimento obrigatório para **toda tabela nova** — dentro de transação, com `rollback`, sem deixar
resíduo:

```sql
-- 1. Estrutura: quais policies existem, para quais papéis, com qual expressão
select pol.polname, pol.polcmd::text as cmd,
       array_to_string(array(select rolname from pg_roles where oid = any(pol.polroles)), ',') as roles,
       pg_get_expr(pol.polqual, pol.polrelid) as using_expr
  from pg_policy pol where pol.polrelid = 'public.<tabela>'::regclass;

-- 2. Leitura como authenticated (o que o app realmente faz)
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"<uuid>","role":"authenticated"}';
  select count(*) from public.<tabela>;
rollback;

-- 3. Leitura como anon: deve ver 0 em tabela de usuário
begin; set local role anon; select count(*) from public.<tabela>; rollback;

-- 4. Escrita indevida deve ser barrada (catálogos e tabelas só-leitura)
--    Envolver o insert em begin/exception when insufficient_privilege e falhar
--    alto se ele passar.
```

Aplicado em `exercises`: `authenticated` vê 42, `anon` vê 0, escrita barrada. O schema de Treino traz
mais tabelas — cada uma repete estes quatro passos.

---

## 5. Modelo de dados

28 tabelas, todas com RLS por `auth.uid() = user_id`. Os tipos da aplicação são **derivados do
schema real**: `types/supabase.generated.ts` (gerado, `npm run types:gen`) é a fonte, e
`types/database.ts` só aplica os **estreitamentos** que nenhum gerador consegue inferir — CHECK de
`severity`, `sex`, `kind`, `pose` viram união de literais. Coluna renomeada ou removida passou a ser
erro de compilação.

### Núcleo clínico
`glucose_readings` · `meals` · `insulin_logs` · `medications` · `medication_logs` ·
`medication_snoozes` · `exams` · `blood_pressure_logs`

### Corpo e atividade
`exercise_sessions` · `strength_logs` · `muscle_pauses` · `weight_logs` · `water_logs` ·
`health_snapshots` · `body_measurements` · `body_goals` · `body_photos` · `exercises`

`exercises` é o **catálogo** (40 de resistência + 2 de cardio) e a fonte de verdade do módulo
Treino. É referência global: não tem `user_id`, é lida por qualquer autenticado, não é escrita pelo
app e por isso fica fora do export e do wipe de LGPD — não há dado pessoal nela.

O vocabulário muscular é `MuscleGroupId` (`lib/data/muscle-groups.ts`), **canônico e único** — o CHECK
de `primary_muscle` é a mesma regra escrita em SQL, e um teste amarra os dois. O catálogo nasceu com
vocabulário próprio para poder ser semeado sem tocar em consumidor nenhum; a ponte encerrou a
duplicidade elegendo a union como fonte, porque ela dá exaustividade em compilação que se perderia se
o vocabulário virasse dado puro.

`MuscleGroupId` foi de 10 para 12 com `trapezio` e `gluteos`: sem eles o encolhimento entra como
costas e infla o grupo, e a elevação pélvica não tem onde ser classificada.

A definição dos grupos é um `Record<MuscleGroupId, _>` **completo**, e a lista exibida é derivada
dele. Isso não é estilo: enquanto era um array literal, crescer a union não quebrava nada — e como
`computeMuscleRecovery` e `computeWeeklyVolume` iteram **sobre** a lista, o grupo faltante não virava
erro nem zero, ele sumia de todas as telas sem deixar rastro. Dois testes cobrem o que o tipo não
alcança: todo grupo aparece em ao menos um split e em ao menos um dia do plano — listas onde um
músculo pode legitimamente estar em vários lugares, e por isso não são tipáveis por exaustividade.

Trapézio entrou na terça (dia de ombros) e glúteos na segunda (pernas) porque é onde **a ficha real**
os coloca, não pelo agrupamento convencional — que poria trapézio junto de costas. Onde existe dado
da ficha, convenção não decide.

`source_category` guarda a categoria do infográfico de origem mesmo quando ela diverge do primário —
elevação pélvica vem em "Pernas" e é de glúteos. Guardar as duas deixa a correção auditável.

**Sem backfill, por decisão.** Nada em `strength_logs` foi reetiquetado: reclassificar texto livre
para id de catálogo é chute apresentado como dado, indistinguível do dado certo depois de gravado.
Data de corte **2026-07-30**; a série tem descontinuidade aí.

**A ponte (Fatia 2, 2026-08-14).** `strength_logs.exercise_id` referencia `public.exercises`, e
`lib/exercicios/catalog.ts` é o primeiro leitor do catálogo. Quando o id existe, `exercise_name` e
`muscle_group` são derivados da linha do catálogo **no servidor** — o formulário manda o id, não o
nome. Isso é o que impede "Supino Reto" e "supino reto" de voltarem a divergir: se o cliente pudesse
sobrescrever, o catálogo deixaria de ser fonte única no exato ponto em que importa, a escrita.

A coluna é anulável por duas razões. O histórico não é reetiquetado (mesma decisão acima), e o texto
livre continua válido — o catálogo tem 42 exercícios e a academia tem mais; obrigar a escolher da
lista transformaria "registrei o que fiz" em "não deu para registrar". Registro por texto livre entra
sem músculo, e a tela diz isso antes de salvar: ele conta no histórico de carga e não na recuperação
muscular. Cardio idem — esteira não fadiga um grupo, e inventar um faria o motor mandar descansar
algo que não foi treinado.

Antes da ponte o formulário sequer enviava `muscle_group`: as 4 linhas existentes têm todas nulo, ou
seja, registro de carga não contribuía com nada para nenhuma agregação por músculo. Com o id
preenchido, `strength_logs.muscle_group` passa a ser derivável do exercício e tende a virar
redundante.

O custo dessa decisão é imediato e está tratado: trapézio e glúteos entram com histórico zero embora
**sejam treinados** (encolhimento e elevação pélvica, gravados como costas e posterior). Sem guarda, o
app anunciaria "trapézio nunca estimulado, prioridade máxima" e "glúteos negligenciados" no dia
seguinte. `MIN_LOGS_FOR_ESTABLISHED_HISTORY` (3 registros próprios) silencia o grupo até ele existir
por conta própria — contagem, não data de corte, porque data vira código morto que ninguém remove.

A guarda tem duas pontas e errar qualquer uma é pior que não tê-la: silenciar de menos traz o falso
positivo acima; silenciar demais tiraria de quem nunca registrou nada justamente o aviso que o produto
existe para dar. Por isso a supressão só vale quando **outros** grupos têm histórico — aí a ausência é
sintoma do modelo, não do treino. Para usuário novo, "nunca treinado" continua sendo verdade.

`body_measurements` guarda 21 medidas opcionais (15 circunferências + 5 dobras + peso) com
`unique (user_id, measured_on)`: uma medição por dia, a última do dia substitui. A composição
estimada (% de gordura, massa magra, FFMI) **não é gravada** — é derivada em `lib/body/composition.ts`
a cada leitura, porque a fórmula pode mudar e o dado bruto é a fonte da verdade. `body_goals` congela
`start_value` na criação da meta para que o progresso não ande junto com o resultado.

### Derivados e análise
`metabolic_audits` · `metabolic_alerts` · `insight_findings`

`insight_findings` é **compartilhada entre módulos**: a coluna `module` (CHECK `glucose` | `training`)
diz de quem é o achado, e a unicidade é `(user_id, module, slug)` — não `(user_id, slug)`. A
distinção importa porque a escrita é `upsert`: com unicidade global, dois módulos que escolhessem o
mesmo slug se sobrescreveriam **em silêncio**, sem erro nem log.

A coluna **não tem default**. O `'glucose'` inicial serviu só para backfillar as linhas anteriores à
migration e foi derrubado em seguida, porque um default aqui é uma armadilha: o motor de treino que
esquecesse a coluna não falharia — o achado seria carimbado como glicemia e apareceria na aba
Correlações sem nenhum sinal. Sem default isso vira violação de NOT NULL na escrita, e
`listInsightFindings(module)` / `persistFindings(..., module)` exigem o módulo como parâmetro
obrigatório para que o mesmo esquecimento já não compile. Adicionar um módulo é uma migration de uma
linha (o CHECK) mais um valor em `InsightModule` — um teste falha se os dois saírem de sincronia.

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
| `body-photos` | não | 8 MB | jpeg, png, webp |

Caminho `${userId}/${uuid}.${ext}` — a pasta por usuário é o que a policy verifica. **Não há policy de
`update`** em nenhum dos dois.

Imagem de exame **não é persistida** — trafega como data-URL em base64 direto para o modelo de visão.

---

## 6. Regras de negócio clínicas

### 6.1 Glicemia

**Faixa-alvo**: default 70–180 mg/dL, sobrescrita por `profiles.target_glucose_min/max`. Fonte única
em `lib/health/glucose-thresholds.ts`; quem lê o perfil chama `resolveGlucoseTargets(profile)` em vez
de repetir `?? 70 / ?? 180` (era literal em 10 arquivos até 26/07/2026 — ver §10.4). Faixa incoerente
gravada antes da validação é descartada na leitura e cai para o padrão.

**Dois conceitos distintos, deliberadamente:**

| Conceito | Regra | Uso |
|---|---|---|
| Acima da meta | `> targetMax` (individual) | TIR, risco, score |
| Hiperglicemia severa | `>= 250` (fixo) | alerta push, extremos do relatório médico |

**Classificação de uma leitura** (`lib/insights/rules.ts`):
- `>= SEVERE_HYPER_MG_DL` (250) → hiperglicemia (warning)
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

**Predição de hipo (CGM)** — `lib/cgm/trend.ts`: regressão linear sobre 25 min, mínimo 3 pontos,
horizonte 30 min. Alerta se atual ≥ limiar, projetado < limiar e slope ≤ −0,5 mg/dL/min. O limiar é o
`target_glucose_min` do perfil (era 70 fixo até 26/07/2026), carregado pelos syncs via
`loadGlucoseTargets`. Disclaimer no código: *"não substitui o alarme do próprio sensor"*.

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

### 6.5 Composição corporal

Tudo em `lib/body/` (+ `lib/exercicios/weekly-volume.ts`), determinístico e testado. A IA entra
depois, com estes números prontos no prompt — não recalcula nada.

**Estimativa de gordura** (`composition.ts`) — duas réguas, nunca misturadas:

| Método | Equação | Exige |
|---|---|---|
| Dobras (preferido) | Jackson-Pollock 3 + Siri | 3 dobras do protocolo do sexo + idade |
| Circunferências | US Navy / Hodgdon-Beckett | cintura + pescoço (+ quadril se mulher) |

`sameMethod()` bloqueia comparar duas datas medidas por métodos diferentes: a troca de régua produz
um "salto" de gordura que não aconteceu no corpo. Resultado fora de 3-70% é descartado como erro de
entrada. Sem sexo/altura no perfil, só IMC e cintura/altura são calculados.

**Piso de ruído** (`progress.ts`): 0,5 kg / 1,0 cm / 2,0 mm. Diferença menor é lida como
**estabilidade**, nunca como evolução — a fita erra ~1 cm entre medições da mesma pessoa no mesmo
dia. A classificação (`recomposicao`, `ganho_magro`, `ganho_com_gordura`, `perda_de_gordura`,
`perda_com_massa_magra`, `estavel`) sai de peso × cintura × medidas de músculo, ou do split real em
kg quando há % de gordura pelo mesmo método nas duas datas.

**Metas** (`goals.ts`): progresso contra `start_value` congelado. Projeção de prazo só existe com
≥21 dias entre a primeira e a última medição **e** mudança total acima do piso de ruído — ruído
dividido pelo tempo produz um ritmo convincente e uma data inventada.

**Volume de treino** (`weekly-volume.ts`): séries/semana por grupo contra faixa de referência
(10-20 para grupos grandes; Schoenfeld). Progressão de carga por 1RM estimado (Epley), comparando a
melhor carga da primeira metade da janela com a da segunda — um dia ruim no fim não apaga semanas.

**Barras do painel** (`dashboard.ts`): cada uma tem definição fechada exibida junto do número, e vale
`null` (com o que falta registrar) quando não há dado — nunca 0%, que o usuário lê como fracasso.

**Fotos**: bucket privado, comparação lado a lado local; envio à IA só por ação explícita, com aviso
antes do botão (ver DPIA §3 e §6). O prompt proíbe estimar peso/gordura por imagem e qualquer
comentário estético.

**Ponte com o plano de treino** (`lib/exercicios/plan-prescription.ts`): o plano decidia *o que*
treinar hoje (por recuperação) mas nunca *quanto*, e o déficit de volume morria como texto de alerta.
A prescrição fecha o circuito com uma conta que aparece na tela:

```
séries hoje = alvo semanal do grupo ÷ vezes que o grupo aparece na semana
```

O alvo é o **piso** da faixa de referência em manutenção e o **topo** quando o grupo sustenta uma meta
de crescimento não atingida (`MEASURE_TO_MUSCLE` liga medida → músculo). Limites de 2 a 8 séries por
grupo/sessão: déficit grande se resolve com frequência na semana, não com uma sessão gigante. Volume
acima de 1,5× o ótimo inverte o sinal e manda reduzir. A prescrição só cobre os grupos que a
recuperação já liberou — nunca ressuscita grupo vetado. `/exercicios/plano` consome o **mesmo**
`loadBodySnapshot` do módulo de composição, para as duas telas nunca discordarem sobre quantas séries
foram feitas na semana.

**Água**: `peso × 35 ml`, fallback 2000 ml. Só bebidas hidratantes contam (água, água c/ gás, chá —
café e refrigerante diet não).

### 6.6 Resumo semanal educativo

`lib/audit/weekly-summary.ts` — os últimos 7 dias locais contra os 7 anteriores, em
`/analise/semana`. **Não é AGP** e não tenta ser: AGP exige densidade de CGM, percentis por hora e
leitura treinada. A pergunta aqui é "minha semana foi melhor que a passada, e no quê?".

Três regras que o código impõe:

- **Sem dado mínimo, sem número.** Mesmo piso do score (`hasEnoughGlucoseData`: 7 leituras em 3
  dias), extraído para `metrics.ts` justamente para as duas telas não divergirem.
- **Comparação exige as DUAS semanas acima do piso** (`comparable`). Semana anterior sem leitura
  nenhuma é tratada como "não houve semana anterior", não como zero — senão quem começou a usar o
  app há 5 dias veria uma queda inventada.
- **TIR varia em pontos percentuais**, nunca em "%": "subiu 8%" e "subiu 8 pontos" são coisas
  diferentes, e confundir as duas é clássico.

Os destaques são determinísticos (sem IA) e ordenados por risco: hipoglicemia primeiro e sempre,
mesmo isolada. A exportação é **texto puro** copiado para a área de transferência — o destino real
é WhatsApp/e-mail, e há fallback visível quando a Clipboard API falha.

`lib/queries/weekly-summary.ts` carrega as duas janelas fechadas; `loadAuditDayGrid` não serve
porque a janela dele termina sempre **agora** e é aberta em cima (só `gte`).

### 6.7 Score metabólico (auditoria)

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

### 6.8 Onde o produto se recusa a agir

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

### 7.2.1 Quebra do provedor vs. problema do usuário

`lib/cgm/outage.ts` — o circuit breaker protege cada conexão, mas alerta **por usuário**: quando a
API não oficial do Libre muda, o operador recebe N alertas idênticos e nenhum diz a única coisa que
importa, que é "não é culpa de ninguém, a Abbott mexeu". `detectProviderOutage` roda uma vez por
rodada do cron e emite **um** alerta.

A regra é conservadora por assimetria de custo:

| Tipo | Vira quebra? | Por quê |
|---|---|---|
| `client_version` | sim, com 1 usuário | nenhuma ação do usuário resolve |
| `unavailable`, `rate_limit`, `unknown` | só com ≥ 2 usuários **e** ≥ metade das conexões tentadas | um usuário com rede caída não é quebra |
| `auth`, `crypto` | **nunca** | são individualmente acionáveis (senha, chave) |

Errar para "quebra" quando era senha errada custa um alerta inútil; errar para "problema seu" quando
a API mudou faz o usuário reconferir uma senha correta várias vezes e perder dias de leitura sem
descobrir o import por CSV. Daí `ProviderIssueNotice` na tela de Conexões, que aparece só nos tipos
que o usuário não resolve e aponta o CSV — que já existia logo abaixo, sem nada ligando um ao outro.

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

Achados de leitura de código, ordenados por gravidade do levantamento original (21/07/2026). Os que
já foram corrigidos ficam registrados aqui com o estado anterior — o histórico é o que explica por
que a regra atual é assim.

### 10.1 🟠 Calculadora de bolus: trava de hipo resolvida, teto de dose ainda ausente

**Estado original (21/07):** com a glicemia abaixo da meta, a correção virava 0 mas a dose de
carboidrato saía **cheia** — 55 mg/dL com 60 g devolvia dose integral, sem aviso.

**Corrigido** em `1af295d`: `computeBolusDose` agora **recusa** o cálculo em hipoglicemia
(`lib/medications/bolus-calculator.ts`), usando `target_glucose_min` do perfil como limiar (70 de
padrão). O bloqueio recusa em vez de reduzir a dose de propósito: qualquer fator de redução seria
conduta clínica inventada no código. A tela mostra card vermelho orientando tratar a hipo e remedir
em 15 min. Toda dose passou a exibir que o cálculo **não desconta insulina ativa**.

**Escopo decidido:** a feature **fica** no produto. `ROADMAP.md` e o comentário de
`app/actions/insulin.ts` foram alinhados — antes ambos afirmavam que o app nunca calcula dose.

**Continua ausente:**

- **Teto de dose máxima** — `totalDose` não tem clamp. O limite de 100 U em `app/actions/insulin.ts`
  aplica-se só ao *registro manual*. Não foi arbitrado um número porque dose máxima é individual e
  precisa vir do endocrinologista.
- **IOB / insulina ativa** — o app não registra insulina a bordo; o cálculo não tem como descontá-la.
  Hoje isso é comunicado ao usuário, não resolvido.
- O prompt do chat de IA mantém a proibição *"nunca prescreva nem calcule doses"* — correto para o
  chat, que continua sem calcular; a calculadora é uma superfície separada, com parâmetros que o
  usuário configurou com o médico.

### 10.2 🔴 Segredo de cron versionado no git

O `CRON_SECRET` esteve **hardcoded em literal** dentro de funções SQL de migração, em dois valores
(v1 e v2). A própria migração `20260718010000` documenta o erro:

> *"A 'rotação' de 2026-07-13 recolocou o MESMO segredo já vazado no git em mais 5 funções, em vez de
> gerar um valor novo."*

A correção move as funções para o **Supabase Vault**.

**Verificado no banco em 26/07/2026:** o resíduo descrito aqui **não existe mais**.
`pg_get_functiondef('record_system_ai_usage')` em produção lê
`vault.decrypted_secrets where name = 'cgm_cron_secret'` — a migração `20260718010000` já cobriu essa
função, e este parágrafo é que estava desatualizado.

**Comparação de header:** corrigida em 26/07/2026. As três rotas de cron
(`push/dispatch`, `cgm/sync-dispatch`, `meals/suggest-dispatch`) usam `secretsMatch`
(`lib/auth/constant-time.ts`), que compara em tempo constante e faz hash antes para não vazar tamanho
nem lançar com entradas de tamanhos diferentes. `inviteCodesMatch` passou a reusar o mesmo helper.

**Continua aberto — e depende de ação fora do código:** os dois valores do segredo permanecem no
histórico do git. Remover do arquivo não basta; o valor precisa ser **rotacionado** no Vault e na
env da Vercel.

> **Falso positivo do advisor.** O linter do Supabase reporta que `anon` pode executar
> `record_system_ai_usage` (`0028_anon_security_definer_function_executable`). É **intencional**:
> `meals/suggest-dispatch` é chamada pelo cron sem sessão, então o client é anônimo — a autorização
> é o `p_secret` conferido contra o Vault dentro da função. Revogar o `execute` de `anon` quebraria o
> registro de uso de IA das sugestões. Não "consertar" esse aviso sem trocar o mecanismo antes.

### 10.3 ✅ Contexto do chat sem sanitização — resolvido em 26/07/2026

**Estado original:** `lib/ai/sanitize-context.ts` existia justamente para neutralizar prompt
injection vinda de OCR, mas `lib/ai/user-context.ts` interpolava `medication.name`,
`medication.dosage`, `meal.name`, `alert.title`, `exercise.label` e `factor.label` **direto no prompt
do chat**, sem `sanitizeForPrompt` — a superfície com maior liberdade de saída do app recebendo texto
livre do usuário e de OCR de rótulo.

**Correção em duas camadas**, porque nenhuma das duas basta sozinha:

1. Os seis pontos passam por `sanitizeForPrompt` com limite por campo (30-80 chars). Isso achata
   quebras de linha (impede imitar um bloco de sistema) e limita o tamanho do payload.
2. O `SYSTEM` do chat declara que **o resumo de dados é dado, não instrução**, e que nenhuma regra do
   bloco pode ser revogada por texto vindo dele. Truncar sozinho não impediria uma injeção curta;
   instruir sozinho não impediria um payload longo com formatação falsa.

### 10.4 ✅ Três definições de hiperglicemia coexistiam — resolvido em 26/07/2026

**Estado original:** `>= 250` no alerta, `> targetMax` no TIR e `>= 250` no relatório médico, cada
um com o literal no próprio arquivo. Pior sintoma: `app/relatorio-medico/page.tsx` exibia
`metrics.hyperCount` (leituras acima da **meta**) sob o rótulo "Leituras ≥250 mg/dL" — número de uma
definição com o rótulo da outra, numa tela feita para o médico ler.

Relacionado: `lib/cgm/trend.ts` fixava `HYPO_MG_DL = 70` e **ignorava** `target_glucose_min`,
enquanto `lib/insights/rules.ts` respeitava. Para uma meta mínima de 110, o alerta reativo disparava
em 109 e o preditivo só considerava queda rumo a 70.

**Correção:** `lib/health/glucose-thresholds.ts` virou fonte única e nomeia os dois conceitos
separadamente — *acima da meta* (`> targetMax`, base do TIR, individual) e *hiperglicemia severa*
(`>= SEVERE_HYPER_MG_DL`, fixo, evento clínico). `resolveGlucoseTargets(profile)` substitui os
`?? 70 / ?? 180` que estavam espalhados em 10 arquivos; `isPredictedHypo(t, hypoThreshold)` recebe o
limiar do perfil, carregado por `lib/health/load-glucose-targets.ts` nos dois syncs de CGM.
`computeAuditMetrics` passou a devolver `severeHyperCount` à parte de `hyperCount`, e o relatório
mostra os dois com o rótulo certo. O **score não mudou**: hiper severa é exibida, não pontuada —
mudar peso de score é decisão clínica, não refatoração.

### 10.5 ✅ URL de produção hardcoded — resolvido em 26/07/2026

**Estado original:** as funções de cron chamavam
`https://glyx-sistema-inteligente-de-control.vercel.app/api/...` em literal, sem variável de
ambiente nem GUC. Troca de domínio quebraria todo o agendamento **em silêncio** — nenhum job falha
visivelmente, eles só passam a chamar um host que não responde.

**Correção** (`20260726020000_cron_base_url_from_vault`): a URL virou o segredo `app_base_url` no
Vault, lido por `public.app_base_url()`. Sem o segredo, a função devolve o domínio atual — ambiente
novo continua funcionando igual, e trocar de domínio passou a ser **uma linha no Vault**.

A migração **transforma a definição existente** de cada função (`pg_get_functiondef` → `replace`
→ `execute`) em vez de redigitar os corpos: são 6 funções com janela horária, dedupe e agregação de
payload, e redigitar cada uma para trocar uma string é a forma mais fácil de introduzir um bug sutil
numa função que ninguém olha até o dia em que o push não chega. O laço é idempotente.

Verificado após aplicar: 6 funções usando o helper, **0** com o literal.

### 10.6 ✅ Faixa-alvo sem validação de coerência — resolvido em 26/07/2026

**Estado original:** `app/actions/profile.ts` aceitava `target_glucose_min`/`max` como número livre —
inclusive `min > max` ou negativo — e isso propagava para TIR, alertas e risco.

**Correção em duas camadas:** `updateProfile` recusa a faixa com mensagem específica
(limites de sanidade + `MIN_TARGET_SPAN_MG_DL` entre mínima e máxima), e `resolveGlucoseTargets`
descarta faixa incoerente **inteira** na leitura, caindo para o padrão — necessário porque linhas
gravadas antes desta validação podem estar quebradas. Aproveitar só o lado "válido" de um par
incoerente inventaria uma faixa que nem o usuário nem o médico definiram.

Efeito colateral descoberto no caminho: as três formas do Perfil chamavam a server action dentro de
um wrapper `Promise<void>`, então **todo** `{ error }` era descartado em silêncio — a página
recarregava como se tivesse salvado. `components/perfil/profile-form.tsx` (useActionState) passou a
exibir erro e confirmação.

### 10.7 ✅ Adesão medicamentosa com duas regras — resolvido em 26/07/2026

**Estado original:** a UI casava dose com log por janela de horário; o relatório médico usava
**contagem bruta de logs**. Para o mesmo período os dois números divergiam — e o que ia para o
médico era o mais frouxo: dois registros no mesmo horário (clique duplicado ou dose extra) contavam
como duas doses de adesão, inflando a adesão de quem esqueceu metade das doses.

**Correção:** a regra virou módulo único (`lib/medications/adherence.ts`) usado pelos dois lados.
`computePeriodAdherence` aplica a mesma janela dia a dia no período do relatório, com `usedLogs`
global — nenhum registro cobre duas doses. Registro que não casa com janela nenhuma virou coluna
própria ("fora do horário") em vez de sumir: pode ser dose extra de correção, e isso é informação
clínica.

### 10.8 ✅ Falha silenciosa no upload de foto — resolvido em 26/07/2026

**Estado original:** `uploadPrivatePhoto` devolvia `null` em qualquer erro, e "sem caminho" tinha dois
significados indistinguíveis que o app tratava como sucesso: **não veio foto** e **a foto se perdeu**.

**Correção:** `uploadPrivatePhotoResult` devolve `uploaded | empty | failed` com motivo. As ações de
refeição **salvam o registro mesmo assim** — falhar tudo perderia a refeição que o usuário acabou de
revisar — e devolvem `warning`, que a tela exibe. `ActionResult` ganhou o campo para isso.

Mesma classe, também corrigida: o formulário de peso em `/perfil/corpo` chamava a action num wrapper
`Promise<void>` e engolia "Informe um peso válido em kg". Virou `components/perfil/weight-form.tsx`.

### 10.9 🟡 Deriva de documentação

- `ROADMAP.md` (atualizado 18/07) lista como fora de escopo uma feature que entrou em 18/07
- ~~Tipos em `types/database.ts` são manuais — divergem do schema se alguém esquecer~~ — resolvido
  em 26/07/2026: passaram a ser derivados de `types/supabase.generated.ts`. Efeito colateral útil: a
  linha do banco agora tem **todas** as colunas (o que `select("*")` devolve de fato), o que quebrou
  as fixtures parciais de demo e teste — daí `lib/demo/rows.ts`, onde o default de cada coluna mora
  num lugar só, para que coluna nova não quebre fixture nenhuma
- ~~`README.md` aponta uma raiz de repositório diferente da atual~~ — corrigido em 26/07/2026
  no `README.md` e no `AGENTS.md`, que carregava a mesma raiz velha

---

## 11. Escopo negativo — o que deliberadamente não existe

Confirmado por busca no código, não por suposição:

- **HbA1c estimada / GMI** — não implementado
- **AGP clínico** — explicitamente fora de escopo no ROADMAP
- **TIR estratificado** (nível 1/2: <70 e <54; 180–250 e >250) — o valor 54 mg/dL não aparece
- **IOB / insulina ativa** — não existe (limitação comunicada na tela da calculadora)
- **Teto de dose máxima de bolus** — depende de valor individual do endocrinologista
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
