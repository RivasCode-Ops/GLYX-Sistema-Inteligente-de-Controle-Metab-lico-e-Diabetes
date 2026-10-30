# Plano de implementação — GLYX

> **Revisão técnica concluída em 15/10/2026** — conferido contra o código, as migrations e a validação
> local de 14–15/10. **Não aprovado pelo Rivas.** D1–D4 **aprovadas em 15/10** e implementadas (§3.3). A3 executada em 15/10. Pendentes: I1 e I2 (incidentes), D13 (pausa da sugestão) e A2 (implantação, **não autorizada**).

**Data:** 14/10/2026 · **Lista de tarefas:** [`lista-implementacao-glyx.md`](lista-implementacao-glyx.md)
(IDs, prioridade, dependências e critérios). Este documento cobre **como validar, implantar e
reverter** o lote 1. Nada aqui foi executado em produção; a seção 3 foi executada num banco
local descartável em 14/10/2026.

> **Autorização.** Cada passo marcado **[produção]** exige a frase de autorização explícita do Rivas
> para aquele passo. "Ok" não é a frase. Leitura em produção também é passo de produção.

## 1. O que o lote 1 mudou

**Migrations renomeadas em 15/10 para a ordem de aplicação** (nenhuma tinha sido aplicada em lugar
nenhum além de bancos descartáveis; as antigas não foram tocadas; histórico remoto intocado):

| Ordem | Arquivo final | Nome anterior | Finalidade |
|---|---|---|---|
| 1 | `20261015100000_filhos_de_medications_mesmo_dono.sql` | `20261014121000` | adiamento e registro só com remédio do próprio dono |
| 2 | `20261015101000_medication_logs_dose_unica.sql` | `20261014122000` | pedido, correção com histórico e autor, adicional, dose única a partir do corte |
| 3 | `20261015102000_conta_ativa_e_uso_de_ia.sql` | `20261014123000` | conta desativada barrada no banco; cota de IA atômica; uso de IA só leitura (D4) |
| 4 | `20261015103000_med_alarms_cadencia_e_confiabilidade.sql` | `20261014120000` | alarme por cadência, virada do dia, reenvio confirmado; `cadence_confirmed_at` (D1) |

Não há dependência SQL entre elas (nenhuma usa objeto criado por outra): a ordem é a **operacional**
ensaiada — menor impacto primeiro, despachante de alarme por último, porque ele precisa da rota nova de
confirmação. Com os nomes nesta ordem, uma aplicação por ordem de nome não inverte nada. Mesmo assim:
**aplicar uma por vez, nunca `supabase db push`** (o histórico de produção usa o horário de aplicação
como versão — P44).


| Tarefa | Código | Migration (não aplicada) |
|---|---|---|
| GLYX-07/08/09 cadência | `lib/medications/cadence.ts`, `day-summary.ts`, `daily-doses-card.tsx`, `card-agora.ts`, `medical-report.ts`, `user-context.ts`, formulário e action de medicamento | `20261015103000` |
| GLYX-10 dono do medicamento | — | `20261015100000` (+ join no despachante, em `20261015103000`) |
| GLYX-11 dose idempotente (revisto em 15/10, D14/P45) | `lib/medications/register-dose.ts`, `conflito-registro.ts`, `tomadas.ts`, `adherence.ts`, actions, `/medicacao`, `/api/medications/taken`, `public/sw.js` | `20261015101000` (reescrita: prospectiva) |
| GLYX-12 despacho confiável | `/api/push/dispatch`, `lib/push/send.ts`, `lib/push/dispatch-outcome.ts`, `public/sw.js` | `20261015103000` |
| GLYX-15/16 LGPD e paginação | `lib/privacy/*`, `app/actions/privacy.ts`, `/api/me/export`, `fetch-all.ts`, `day-grid.ts`, `weekly-summary.ts`, `user-context.ts` | — |
| GLYX-23 conta desativada | `lib/auth/account-gate.ts`, middleware, `app/actions/admin.ts`, `app/(app)/admin/page.tsx` (aviso de falha, 14/10) | `20261015102000` |
| GLYX-24/25 uso de IA | `lib/ai/rate-limit.ts`, `/api/meals/suggest-dispatch` | `20261015102000` |
| GLYX-26 chat | `lib/ai/chat-payload.ts`, `/api/ai/chat` | — |

## 2. Validação local isolada (14/10/2026)

O `.env.local` tem chaves de produção, e `next build` / `next dev` o carregam sozinhos. A validação roda
com **valores falsos e não vazios** para **todo** nome do `.env.local` — o Next não sobrescreve variável
já definida no processo — e com `NEXT_TELEMETRY_DISABLED=1`.

> **Lição de 14/10 (incidente sem efeito em produção observado — registro completo em
> [`INCIDENTES-AMBIENTE-14-10-2026.md`](INCIDENTES-AMBIENTE-14-10-2026.md)):** **apagar** uma variável do processo para
> simular "chave ausente" faz o Next recarregar o valor **de produção** do `.env.local`. Aconteceu com
> `SUPABASE_SERVICE_ROLE_KEY` num teste do admin: a chave foi enviada só ao Auth **local** descartável
> (127.0.0.1), que a recusou. Nenhuma requisição saiu da máquina. Regra: para simular ausência, usar
> valor falso inválido, nunca remover o nome. Desde 15/10 uma **guarda de destino** interrompe lint,
> testes, build e servidor de teste se faltar um nome do `.env.local`, se um segredo for igual ao de
> produção ou se algum destino estiver fora da lista local permitida.

```powershell
npm run lint
npx --no-install tsc --noEmit
npm run test
npm run build
# o build não pode conter o identificador do projeto de produção (busca em .next = 0)
```

Resultado (refeito em 15/10, com D1–D4, P50 e P51): lint sem avisos; tipos sem erro; **106 arquivos /
1297 testes**. Build de teste em **cópia isolada** do código (sem `.env.local`, só variáveis de teste),
sem tocar no `.next` do repositório: aprovado.

## 3. Validação integrada em ambiente descartável (14/10/2026)

**Ambiente:** Supabase local pela CLI 2.100.1, num diretório **separado do repositório**
(`d:\tmp\glyx-supabase-teste`, projeto `glyx-teste-descartavel`, portas 554xx) — a pasta `supabase/`
do repositório está vinculada ao projeto remoto e não foi usada. As 72 migrations antigas aplicadas
com a URL de produção trocada por `http://127.0.0.1:9` e os crons desagendados; Vault com segredo de
teste. Só usuários sintéticos (`@teste.invalid`). IA e push **simulados** por servidores locais
(provedor compatível com OpenAI em `127.0.0.1:9101`; serviço de push HTTPS em `127.0.0.1:9102` com
certificado próprio e chaves VAPID de teste). Scripts em `d:\tmp\glyx-harness` (fora do repositório,
não versionados).

**O que isso prova e o que não prova:** prova o comportamento do banco (SQL, RLS, Auth, Storage,
pg_net, cron chamado à mão) e do código do app contra esse banco. **Não** prova integração com o
provedor de IA real, com o serviço de push real (FCM/APNs/Mozilla), nem o comportamento num aparelho.

### 3.1 Testes SQL (unitários de banco, cada um numa transação desfeita)

```powershell
# psql dentro do contêiner do banco descartável; -v ON_ERROR_STOP=1
supabase/tests/med_alarms_due.sql              # 18 casos de cadência     → aprovado
supabase/tests/dispatch_med_alarms.sql         # 7 cenários do despacho   → aprovado
supabase/tests/policies_dono_do_medicamento.sql # 3 cenários              → aprovado
supabase/tests/conta_ativa_e_ai_usage.sql      # bloqueio e cota          → aprovado
```

- **Defeito reproduzido antes da correção:** com o banco antigo, `dispatch_med_alarms.sql` falha no
  cenário 1 ("semanal fora do dia gerou 1 alarme").
- **Controle negativo** (volta o comportamento antigo dentro da transação; o teste **tem** de falhar):
  policies antigas → "A criou adiamento com remédio de B"; acesso antigo → "conta desativada leu 1
  leitura". Os dois falharam como esperado.
- **Índice de dose única:** segunda confirmação da mesma dose recusada (`unique_violation`); "Pulei" e
  dose avulsa continuam livres; com duplicata pré-existente a migration **para** com mensagem clara.
- **Concorrência da cota de IA:** 20 pedidos simultâneos com limite 5 → RPC nova aceitou **5**; o
  caminho antigo simulado aceitou **20**.
- **Migrations reexecutáveis:** aplicadas duas vezes seguidas sem erro.

### 3.2 Fluxo completo (app + banco + serviços simulados)

| Fluxo | Resultado |
|---|---|
| Formulário de frequência (navegador) | semanal sem dia → `?erro=semanal_sem_dia`, aviso na tela, banco inalterado; semanal salvo; "Doses de hoje" não lista no dia sem dose |
| Service worker (Chromium) | dois remédios no mesmo horário → 2 notificações (tags distintas); reenvio da mesma dose não duplica; payload antigo sem tag → 1 só (defeito antigo reproduzido) |
| "Já tomei" na notificação do sistema | **não reproduzível** localmente — pendente em aparelho |
| Conta desativada | token existente lê `[]`, escrita 403, Storage recusado; refresh e login `user_banned`; telas → `/conta-desativada`; API 403. Reativar devolve acesso |
| Admin sem conseguir banir | aviso na tela "…o bloqueio de login falhou. Tente de novo." (antes: falha silenciosa — corrigido nesta rodada) |
| Chat com queda do stream | 200, termina com aviso, o histórico guarda o aviso |
| Rota de sugestão (cron) | 200, push entregue ao simulador, custo registrado em `ai_usage`; o prompt levou glicemia (P06 confirmado) |
| Exportar / apagar pela tela (2500 leituras sintéticas) | exportação completa com as tabelas novas; exclusão limpa tudo exceto 1 linha recente de `ai_usage` (D4) e mantém o login. **O texto da tela diz "todos os registros"** — ver D4 |
| Reenvio do alarme | 503 → `falhou` após 3 tentativas com o erro gravado; 410 → assinatura apagada, `sem_assinatura` |

### 3.3 Ensaio final do lote completo — 15/10/2026 (D1–D4 implementadas)

**Ambiente:** engine próprio da `Ubuntu-22.04` (mesmas provas da A4: sistema "Ubuntu 22.04.5 LTS", raiz
`/var/lib/docker`, nenhum contêiner alheio, Docker Desktop desligado), PostgreSQL **17.6**, PostgREST e
Auth reais; base com as 72 migrations antigas; IA e push simulados. Código **antigo** = commit `535e2bc` (o `1e53d23` do GitHub mais só documentação e `.gitignore`);
código **novo** = árvore de trabalho; os dois em build de produção, cada um numa cópia isolada.

**Limitação deste ensaio:** no engine próprio não há `host.docker.internal`, e o firewall do Windows (que
não foi alterado) bloqueia o WSL de chegar ao Next. A chamada do banco ao app (`pg_net`) foi entregue a um
**receptor descartável dentro da rede da stack** (imagem oficial já baixada) e **retransmitida** pelo
roteiro ao Next, com o mesmo caminho, cabeçalhos e corpo. O transporte é simulado; o conteúdo, não.

| Estado (código × banco) | Chat | Papel `system` | Dose 2× | Alarme | Veredito |
|---|---|---|---|---|---|
| **A** antigo × sem lote | 200 | 200 (chega ao modelo) | 2 linhas | 1 push | estado atual |
| **B** novo × sem lote | 200 | 400 | 200 + 409, **1 linha** | 1 push | seguro |
| novo × +100000 (dono) | 200 | 400 | 1 linha | 1 push | seguro |
| novo × +101000 (dose única) | 200 | 400 | 1 linha | 1 push | seguro |
| novo × +102000 (conta/IA) | 200 | 400 | 1 linha | 1 push | seguro |
| **C** novo × 4 migrations | 200 | 400 | 1 linha | `enviado`; reivindicação vencida reenvia e confirma (`enviado:2`); 503 → 3 tentativas e para (`falhou:3`); 410 → `sem_assinatura`, assinatura apagada | **alvo** |
| antigo × +100000 / +101000 | 200 * | 200 | 2 linhas | 1 push | compatível |
| antigo × +102000 em diante (**X**) | **429** | 429 | 2 linhas | fica `enviando`; 503 não detectado; 410 não apaga | **incompatível** |

\* Na passada final, o primeiro chat do código antigo depois da 101000 deu 429 e o segundo, 200; na
passada anterior, o mesmo estado deu 200. O código antigo responde 429 a qualquer erro ao contar o uso —
tratado como falha momentânea do ambiente, não do lote.

**Corte da dose única:** sem parâmetro, com valor ilegível, sem fuso e fora do intervalo — a migration
falhou nas quatro e **nada** ficou aplicado (nem as colunas); com corte válido, o corte ficou na definição
e no comentário do índice ("dose única (migration 20261015101000): corte …, aplicada em …").

**Também no estado C (passada final, código final):**
- testes SQL do repositório em PostgreSQL 17: `med_alarms_due` 18 casos · `dispatch_med_alarms` 7 · `policies_dono_do_medicamento` 3 · `conta_ativa_e_ai_usage` (com D4: exclusão reinicia a cota) · `dose_unica_prospectiva` 9 — **todos aprovados**;
- **D1–D4 pelo navegador: 19 de 19** (cadastro sem frequência recusado com frase; frequência escolhida grava a confirmação; item antigo "a confirmar" e confirmação explícita sem mudar nada; edição com frequência vazia não muda nada; início futuro avisado e sem disparo antes; "livre" com horário inconsistente, sem alarme, ativação só com frequência e programação; exclusão apaga todo o uso de IA e a cota reinicia; sem função de exclusão à parte; nenhum erro de JavaScript);
- **F1–F8 com D15/D16 e as checagens de tela: 17 de 17**; com o banco sem as migrations (F8 "antes"): **6 de 6**.

**Achados desta rodada (corrigidos antes da passada final):** P50 — no build de produção a ação com
`redirect()` nem sempre navegava (a pergunta de conflito não abria; recusas não apareciam); no servidor de
desenvolvimento funcionava, por isso passou na A4. Agora a ação devolve o destino ou o aviso e o navegador
navega. P51 — a edição de item "livre" vinha com a frequência pré-selecionada e ativava o alarme sem
escolha.

## 4. Implantação — a ordem importa

### Por que o código vem ANTES das migrations (exceção à regra do `PRODUCAO.md` §2.4)

Ensaiado em 14/10 com as quatro combinações (mesmo roteiro: chat, papel `system`, dose registrada duas
vezes, alarme, falha 503, assinatura morta):

| Combinação | Chat | Papel `system` | Dose 2× | Alarme | Veredito |
|---|---|---|---|---|---|
| **A** código antigo + banco antigo (hoje) | 200 | chega ao modelo | 2 linhas | 1 push | estado atual |
| **B** código novo + banco antigo | 200 (recuo para o caminho antigo) | 400 | **1 linha** | 1 push | **seguro** |
| **C** código novo + banco novo | 200 | 400 | 1 linha | 1 push, `enviado`; 503 → `falhou` após 3; 410 → assinatura apagada | **alvo** |
| **X** código antigo + banco novo | **429 — IA bloqueada para todos** | 429 | 2 linhas | fica `enviando` e é **reenviado** (2 pushes); 503 não detectado; assinatura morta não apagada | **incompatível** |

A combinação X foi executada **só** com serviços simulados.

**Estados intermediários** (código novo já no ar, migrations uma a uma — todos ensaiados com o
roteiro completo, todos OK):

| Depois de | O que muda | Efeito visível |
|---|---|---|
| `20261015100000` | policies de adiamento e registro exigem remédio do próprio dono | nenhum para uso normal |
| `20261015101000` | índice de dose única | segunda confirmação da mesma dose vira "já registrada" no banco também (o código já deduplicava) |
| `20261015102000` | conta ativa em 32 tabelas e no Storage; `ai_usage` só leitura; RPCs da cota | o código **troca sozinho** do recuo para a RPC; chat continua 200 |
| `20261015103000` | despacho novo (cadência, rigidez, estado, reenvio) | alarmes passam a ter estado; a rota nova confirma cada item |

### Passos

0. **[local]** Commit do lote (lista de arquivos no fim do relatório de 15/10). O arquivo de migration vai
   **como está**: a data de corte não é escrita nele.
1. **[produção — leitura]** Repetir B0, B2 e B4 da A3 (`supabase/consultas/a3-pre-implantacao.sql`, só
   leitura) para confirmar que nada mudou desde 15/10. **Parar** se aparecer migration do lote já aplicada
   (B0, agora procurada pelo **nome**) ou falta/conflito (B4).
2. **[produção — deploy]** Publicar o código. Smoke: login, `/medicacao`, um chat, `/status`, cadastrar um
   remédio sem frequência (deve recusar com frase). Estado esperado: **B**.
3. **[produção — migration 1]** `20261015100000`. Conferir `pg_policies` de `medication_logs` e
   `medication_snoozes`.
4. **[produção — migration 2]** `20261015101000`. **Escolher o corte** (instante ISO **com fuso**, depois
   do passo 2) e aplicar **na mesma transação**:
   ```sql
   begin;
   select set_config('glyx.corte_dose_unica', '<instante ISO com fuso>', true);
   -- conteúdo do arquivo 20261015101000_medication_logs_dose_unica.sql, sem alteração
   commit;
   ```
   Sem o parâmetro a migration para e nada fica aplicado. Aplicar fora do horário de dose (a criação do
   índice trava gravações por segundos). **Rastreio:** guardar o sha256 do arquivo aplicado (deve ser o do
   commit), o instante escolhido e o resultado de
   `select obj_description('public.medication_logs_dose_confirmada_unica'::regclass);` — o banco grava ali o
   corte usado e quando foi aplicado. Se a ferramenta de aplicação registrar o histórico
   (`supabase_migrations`), o texto registrado inclui a linha do `set_config`.
5. **[produção — migration 3]** `20261015102000`. Conferir: 32 policies `conta_ativa`; `ai_usage` só `select`;
   `apagar_meu_uso_de_ia` **não** existe; um chat responde.
6. **[produção — migration 4]** `20261015103000`. Conferir `med_alarms_due(now())`, `push_dispatch_log` com
   estado, e que `medications.cadence_confirmed_at` existe e está **nula** em todos (os 12 itens passam a
   mostrar "frequência a confirmar"; nenhum alarme muda). Estado esperado: **C**.
7. **[produção — validação no celular]** Com consentimento do Rivas, na conta dele: tocar "Já tomei" na
   notificação; adiar; confirmar a frequência de um item; um remédio semanal em outro dia.

## 5. Reversão

**Ordem inversa: banco primeiro, código depois.** Reverter **só o código** com o banco novo cria a
combinação **X** (IA bloqueada para todos — 429 — e alarme preso em "enviando") — ensaiada de novo em 15/10
e **incompatível**.

Script: [`supabase/reversao/20261014_reverter_lote1.sql`](../supabase/reversao/20261014_reverter_lote1.sql)
(fora de `supabase/migrations`; uma transação; um bloco por migration, na ordem inversa da aplicação).

| Bloco | Desfaz | O que **não** desfaz (fica, de propósito) |
|---|---|---|
| 1 | `20261015103000` — despachante volta à definição anterior; saem `med_alarms_due`, `med_alarm_is_dose_day`, `glyx_fuso_valido` | colunas novas de `push_dispatch_log` (pendentes viram histórico, não são reenviados); `medications.cadence_confirmed_at` e as confirmações feitas (D1) |
| 2 | `20261015102000` — saem as policies `conta_ativa` (32 tabelas + Storage), `conta_ativa()`, `consumir_cota_ia`, `registrar_tokens_ia`; volta `ai_usage_own` (ALL) | uso de IA apagado por exclusões LGPD feitas no meio (D4) não volta — foi pedido da pessoa |
| 3 | `20261015101000` — saem os 2 índices únicos e o gatilho de histórico | colunas `client_request_id`, `correcao_pedido`, `correcoes`; rótulo `adicional` na constraint; correções e tomadas adicionais já feitas |
| 4 | `20261015100000` — voltam as policies antigas de `medication_logs` e `medication_snoozes` | — |

**Reverter só a dose única** = só o bloco 3 (com o código novo no ar): tira a trava de duplicata e a
proteção do histórico, **não** mexe em alarme, conta ativa, cota de IA nem policies de dono. Para desfazer
**o lote inteiro**, rodar o script **completo** e **depois** fazer rollback do deploy.

**Ensaio da reversão completa (15/10, quatro migrations finais, PostgreSQL 17):** script rodou sem erro;
nenhum objeto do lote restou (funções, índices, gatilho, policies). **Dados idênticos antes e depois**
(contagem e hash): 8 registros de dose, 1 com histórico de correção, 5 com pedido, 1 "adicional"; 8
remédios; uso de IA. Depois dela: código **antigo** voltou ao estado A (chat 200, alarme entregue) e código
**novo** ao estado B (chat 200, papel `system` 400, dose sem duplicata). As quatro migrations foram
**reaplicadas** em seguida sem erro (reaplicação depois de reversão) e revertidas de novo.
Limitação: na amostra revertida não havia remédio com frequência confirmada (a verificação D4 apagou os
dados do usuário de teste) — a preservação de `cadence_confirmed_at` vem da regra do script (a coluna fica).

| Situação | O que fazer |
|---|---|
| Problema só no código, banco ainda antigo (entre os passos 2 e 3) | rollback do deploy na Vercel |
| Problema depois de qualquer migration | script de reversão **primeiro**; depois, se preciso, rollback do deploy |
| Só uma migration com problema | só o bloco dela (dentro de `begin`/`commit`), mantendo o código novo |

**Gatilhos para reverter:** um horário de dose esperado sem linha `med` no log; alarme duplicado no
aparelho; chat respondendo "limite atingido" para quem não usou; usuário ativo sem acesso aos dados.

## 6. O que continua pendente depois desta validação

- **Produção:** nada foi aplicado nem lido em produção. A definição real de `dispatch_med_alarms` e a
  pré-checagem de duplicatas dependem do passo 1 (A3).
- **Serviços reais:** IA e push foram simulados. A entrega real de push e o "Já tomei" no aparelho só
  se validam em produção ou num aparelho de teste.
- **Decisões:** D1–D4 aprovadas e implementadas (15/10). Conflito informado da D4: não há teto global de
  gasto de IA que bloqueie chamadas (P52). P06 (envio
  automático de glicemia à IA) aguarda D5/D6 — [`P06-ENVIO-AUTOMATICO-IA.md`](P06-ENVIO-AUTOMATICO-IA.md).
- **Incidentes do ambiente** (chave de produção num servidor de teste; contêineres de outros projetos
  ligados por ~1 min): [`INCIDENTES-AMBIENTE-14-10-2026.md`](INCIDENTES-AMBIENTE-14-10-2026.md). Em
  aberto: decidir a troca da chave e conferir efeitos externos dos outros projetos.
- **Observação sem correção:** quando o stream da IA cai, o `next dev` registra
  `uncaughtException: ECONNRESET` no console (a rota trata e manda o aviso). Investigar se aparece em
  produção.
- **Ambiente de desenvolvimento:** com webpack (`next dev` sem `--turbopack`) a CSP bloqueia `eval` e
  o login não hidrata. Só afeta desenvolvimento local.
- A regra de cadência só muda um remédio depois que a frequência for declarada (D1). O aviso de
  reposição de estoque ainda trata semanal como diário (GLYX-14). Tipos gerados defasados (GLYX-36).

## 7. Plano da A3 (leitura em produção) — preparado, não executado

**O que é:** as consultas de [`supabase/consultas/a3-pre-implantacao.sql`](../supabase/consultas/a3-pre-implantacao.sql),
todas dentro de `begin transaction read only` (escrita falha em vez de acontecer), com tempo máximo de
15 s cada e resultado agregado — sem id de usuário, valor clínico ou nome de remédio.

| Bloco | Finalidade | Para onde vai a resposta |
|---|---|---|
| B0 | confirmar o banco e o histórico de migrations (72, última 20260908180000, nenhuma de 20261014) | parar se divergir |
| B1 | definição atual da função de alarme: tamanho, hash, e o texto completo | atualizar o script de reversão se diferir |
| B2 | doses duplicadas: grupos, linhas excedentes, período | parar antes do índice se > 0 |
| B3 | linha de base: despachos por tipo (24 h e 7 d), respostas do pg_net, execuções dos crons | comparar depois da implantação |
| B4 | compatibilidade: colunas, tabelas com `user_id`, objetos já existentes ou faltando, extensões, segredos do Vault (só nomes), buckets, policies atuais, fusos e horários malformados | parar se houver falta ou conflito |
| B5 | quantos remédios cada decisão afeta (frequência × rigidez) e volume de uso de IA | informar D1–D4 |
| B6 | o cron de sugestão está ativo? quantas sugestões nos últimos 14 dias | informar P06/D5 |

**Como rodar, quando autorizado:**
1. Você dá a autorização A3 com a frase explícita.
2. Rodar no SQL Editor do Supabase de produção, **um bloco por vez**, conferindo B0 antes do resto.
3. Salvar cada resultado em `d:\tmp\a3-AAAA-MM-DD\` (fora do repositório).
4. Registrar na lista mestra só os números agregados e as decisões que eles destravam.

### Resultado da A3 — 15/10/2026 (somente leitura; `transaction_read_only = on` conferido em cada consulta)

Resultados agregados guardados fora do repositório, em `d:/tmp/a3-2026-10-15/`.

| Bloco | Resultado | Efeito na implantação |
|---|---|---|
| B0 / histórico | 70 registros em produção × 72 arquivos-base no repositório (as 4 de outubro são **à parte**: 76 arquivos no total). Pelo **nome**, 69 em comum. Só no repositório: `metabolic_audits`, `exam_type`, `admin_user_last_activity` — os objetos das três **existem** em produção. Só em produção: `admin_user_last_activity_v2`. As versões de produção são o **horário de aplicação**, não o prefixo do arquivo; a `20260925134108` é a `alias_marcas_faltantes` (arquivo `20260908120000`, commit `2bd70d8`), aplicada em 25/09. Nenhuma do lote 1 aplicada. | não bloqueia (P44). **Nome igual não prova conteúdo igual**: a A3 não leu o SQL registrado (de propósito, pode conter segredo antigo), e a `admin_user_last_activity_v2` **não foi comparada** com o arquivo do repositório |
| B1 | Função de alarme sem segredo no código (lê do Vault), usa `app_base_url()`, respeita conta desativada, ignora rigidez e cadência. **Equivalente** à que o script de reversão recria. | reversão compatível |
| B2 | **11 grupos de doses duplicadas, 22 linhas excedentes** (de 116 doses confirmadas com dose prevista), entre 08/09 e 03/10; maior repetição: 5. | **bloqueia** a migration `20261015101000` (D14) |
| B3 | Todos os 7 crons ativos, 0 falha em 24 h. Despachos 24 h / 7 d: med 14/98, refill 9/63, water 14/98, metabolic_alert 2/46, meal_suggest 3/21, sensor_stale 1/5, tip 1/7. `pg_net` (retém só algumas horas): 8 respostas 200 e **17 timeouts de 5 s** (P43). | linha de base |
| B4 | Nenhuma coluna, tabela, função, extensão, segredo (por nome) ou bucket faltando; nenhum objeto novo já existente; policies atuais `ai_usage_own`, `med_logs_all_own`, `medication_snoozes_own` (todas ALL). 0 fuso inválido, 0 horário malformado. | compatível **para as dependências do lote 1** (o que as 4 migrations leem, alteram ou criam). **Não** é verificação de todo o schema |
| B5 | 12 remédios ativos com horário (1 conta): 7 diária/flexível, 5 diária/rígido. **Todos** `diaria` e criados antes de 08/09 (presumidos pela migration de 07/09). Frequência vazia: 0. Intervalo: 0. Semanal: 0. Livre: 0. Uso de IA: 0 na última 1 h e 24 h. | D1–D3 não mudam nenhum alarme hoje |
| B6 | `glyx-meal-suggest` **ativo**, a cada 15 min; 3 sugestões por dia de 02 a 14/10 (39 no total); **0** registros de custo `meal_suggest` em 14 dias (P08 confirmado). | D5/D13 |

**Implantação:** bloqueada por D14 (duplicatas; análise em [`D14-DOSES-DUPLICADAS.md`](D14-DOSES-DUPLICADAS.md)), por P45 e pelas
decisões D1–D4. O resto da sequência e a reversão são compatíveis com o banco real **no que o lote 1
depende**; o schema inteiro não foi comparado com o repositório.

**O que a A3 não faz:** não aplica migration, não mexe em cron, não troca chave. Cada uma dessas é
autorização separada — escopo exato da A3, da pausa da sugestão (D13) e da troca da chave (I1) em
[`PROXIMAS-AUTORIZACOES.md`](PROXIMAS-AUTORIZACOES.md).

---

**Riva's Alexandre**  © 2026
Todos os direitos reservados. Validação, implantação e reversão do lote 1, revisadas após o ensaio.
