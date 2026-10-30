# Lista mestra de implementação — GLYX

**Criada em:** 14/10/2026 · **Commit de partida:** `535e2bc` · **Fonte:** auditoria de 14/10/2026,
painel [`painel-glyx.html`](painel-glyx.html), README, ROADMAP e roteiro de teste.

> Esta lista **não amplia autorização nenhuma**. Ela descreve o que falta; o que pode ser feito
> em cada sessão continua sendo decidido pela autorização daquela sessão.
>
> Os IDs são **estáveis**: não mudam quando a prioridade muda. A ordem de execução está separada,
> na seção B. Tarefa nova recebe o próximo número livre; tarefa abandonada fica com status
> `descartada`, sem apagar o ID.

## Legenda

| Campo | Valores |
|---|---|
| **Status de implementação** | `não iniciada` · `em andamento` · `implementada (local)` · `bloqueada` · `descartada` |
| **Status de validação** | `não validada` · `validada localmente — unitária` (teste unitário ou estático, sem banco) · `validada localmente — integrada` (Supabase local **descartável**, app real; aparece como "validada em teste local") · `simulado` (a parte externa — IA ou push — foi um servidor falso local) · `pendente em produção` (só se prova com o app no ar, em aparelho ou com serviço real) · `validada em produção` |
| **Escopo** | `observado` (o código ou a documentação já prometem) · `confirmado` (decisão registrada do Rivas) · `sugerido` (proposta desta auditoria, não entra sem aceite) |
| **Prioridade** | `P0` risco clínico ou legal ativo · `P1` integridade, segurança ou privacidade · `P2` robustez e qualidade · `P3` melhoria opcional |

"Validada localmente" e "validada em teste local" **não** significam aplicada nem validada em produção,
nem integração aprovada com o provedor de IA ou o serviço de push reais (foram simulados). Migration
criada como arquivo **não está aplicada em produção**; em 14/10/2026 foi aplicada **só** no banco local
descartável.

---

## A. Próximo lote executável

**Lote 1 executado em 14/10/2026; validação integrada (lotes 2 e 3, em ambiente local descartável)
também em 14/10** — resultados no fim do documento. Antes de produção (lote 4) faltam: decisões D1–D4
([`DECISOES-D1-D4.md`](DECISOES-D1-D4.md)), fechamento dos incidentes do ambiente (GLYX-45), leituras em
produção (A3, consultas prontas em [`supabase/consultas/a3-pre-implantacao.sql`](../supabase/consultas/a3-pre-implantacao.sql))
e a frase de autorização (A2). **A2 não autorizada em 15/10.**
O próximo lote que roda **sem nova autorização** é o **lote 5** (robustez de IA e dados, tudo local):
GLYX-27, 28, 19, 20, 21, 32, 31, 35.

**Lote 1 implantado em produção em 30/10/2026.** Código publicado pelo merge do PR #2 (`73b0e81`,
deploy Vercel concluído ~20:56 UTC). Leituras B0/B2/B4 repetidas antes: 70 migrations, nenhuma do lote;
schema compatível; duplicatas de dose **12 grupos / 26 linhas até 29/10** (eram 11/22 em 15/10 — o código
antigo seguiu duplicando), todas anteriores ao corte. Migrations aplicadas uma a uma pelo conector do
Supabase, arquivos sem alteração, com conferência após cada uma:
1. `filhos_de_medications_mesmo_dono` — as duas policies exigem remédio do próprio dono.
2. `medication_logs_dose_unica` — corte **`2026-10-30T21:05:00Z`**; o índice registra "corte 21:05:00+00,
   aplicada em 21:05:16"; 426 doses intactas.
3. `conta_ativa_e_uso_de_ia` — 32 policies `conta_ativa` + Storage; `ai_usage` só `select`; 0 contas desativadas.
4. `med_alarms_cadencia_e_confiabilidade` — 7 colunas de estado; 12 remédios ativos, 0 com frequência
   confirmada (D1); execução das 21:10 do cron sem falha.

**Regressão achada depois da 4:** o cron `glyx-med-alarms` foi de 0,04 s para **8,3 s** por execução —
`glyx_fuso_valido` varre `pg_timezone_names` (~50 ms) a cada referência. Alarmes funcionando.
**Corrigida no mesmo dia** com `20261030120000_fuso_valido_sem_varrer_catalogo` (autorizada e aplicada
~21:14 UTC): a função testa o fuso com `at time zone` (0,87 ms por chamada); inválido, vazio e nulo
continuam virando America/Sao_Paulo; 14 de 14 horários disparam na simulação; execução real das 21:15
em **0,087 s**, sem falha. Não validados: chat em produção, "Já tomei" e push real no celular.

**Lote 5 executado em 30/10/2026**, inteiro e só local: as oito tarefas implementadas e validadas por teste
unitário (suíte 115 arquivos / 1386 testes; tipos e lint limpos). **Sem commit, sem push, sem migration,
produção intocada.** Não validados: navegador com sessão, IA real, banco real, envio real ao Sentry. Os
lotes seguintes dependem de decisão ou de produção (seção D).

Lote 1, como foi executado (sem banco e sem produção):

| Ordem | ID | Título |
|---|---|---|
| 1 | GLYX-01 | Linha de base de validação local isolada |
| 2 | GLYX-02 | Documentação de referência (PRD, TRD, fluxo, design, schema, plano) |
| 3 | GLYX-07 | Alarme respeita cadência, rigidez e virada do dia |
| 4 | GLYX-08 | "Doses de hoje" e adesão respeitam a cadência |
| 5 | GLYX-09 | Declarar a cadência no cadastro do medicamento |
| 6 | GLYX-10 | Filhos de `medications` só com medicamento do mesmo dono |
| 7 | GLYX-11 | Registro de dose idempotente |
| 8 | GLYX-12 | Despacho de alarme com estado, reenvio e observabilidade |
| 9 | GLYX-15 | Inventário LGPD derivado do schema |
| 10 | GLYX-16 | Paginação com aviso de resultado parcial |
| 11 | GLYX-23 | Conta desativada barrada em todas as camadas |
| 12 | GLYX-24 | `ai_usage` protegida, com cota atômica |
| 13 | GLYX-25 | Custo de IA do cron registrado com service role |
| 14 | GLYX-26 | Payload do chat validado e stream interrompido sinalizado |

## B. Lotes seguintes e dependências

| Lote | Tarefas | Depende de |
|---|---|---|
| **2 — Ambiente de teste** | GLYX-03 e GLYX-05 **feitos em ambiente local descartável (14/10)**; GLYX-46 (guarda de destino no repositório), GLYX-04, GLYX-38 pendentes | GLYX-04: ambiente de teste persistente para o CI |
| **3 — Validação das migrations do lote 1** | **executado em 14/10**: 4 testes SQL, controles negativos, índice, concorrência, ensaio de implantação e reversão | — |
| **4 — Produção do lote 1** | GLYX-45, GLYX-39 | D1–D4 decididas + **D14 (doses duplicadas)** + incidentes fechados (I1, I2) + A2 (frase de autorização; **não autorizada em 15/10**). A3 executada em 15/10 |
| **5 — Robustez de IA e dados** | GLYX-27, 19, 20, 21, 28, 32, 31, 35 | nenhuma (local) |
| **6 — Privacidade e decisões** | GLYX-17, 18, 22, 29, 33, 34 | decisões do Rivas; GLYX-34 precisa de produção |
| **7 — Produto** | GLYX-13, 14, 37, 41, 42 | decisões de escopo |
| **8 — Manutenção** | GLYX-36, 40, 43, 44, 30 | parte precisa de produção (`types:gen`) |
| Contínuo | GLYX-06 | o Rivas executar o roteiro |

## C. O que pode avançar em paralelo

- **Sem conflito de arquivo entre si:** bloco de alarmes (GLYX-07 a 12) × bloco de dados
  (GLYX-15, 16) × chat (GLYX-26).
- **Conflito conhecido:** GLYX-15 e GLYX-24 tocam `lib/privacy/user-data.ts` e
  `app/actions/privacy.ts` — fazer em sequência. GLYX-23 e GLYX-24 criam migrations de policy
  — nomes e ordem de arquivo distintos.
- **Lote 5** é todo local e independente do ambiente de teste.

## D. Decisões, ambientes e autorizações pendentes

Responsável: só aparece como confirmado quando há registro; senão, "a definir" com sugestão. Nenhum
prazo foi confirmado. As tarefas bloqueadas são as que citam a decisão no próprio campo "Exige".

| # | Decisão | Responsável | Impacto | Tarefas bloqueadas | Prazo |
|---|---|---|---|---|---|
| D1 | Frequência não escolhida pela pessoa: o que vale? — [`DECISOES-D1-D4.md`](DECISOES-D1-D4.md) | Rivas | **aprovada em 15/10:** frequência obrigatória e explícita em cadastro novo; os 12 antigos mantêm o alarme e aparecem como "frequência a confirmar" (coluna `cadence_confirmed_at`, sem preenchimento automático); confirmar é ação explícita; nada muda horário ou frequência dos antigos. Implementada e validada no navegador (PG 17) | GLYX-07, GLYX-09, GLYX-39 | aprovada; implementada (local) |
| D2 | Intervalo antes da data de início não dispara? — [`DECISOES-D1-D4.md`](DECISOES-D1-D4.md) | Rivas | **aprovada em 15/10:** conta da data de início escolhida, não dispara antes dela; aviso quando o início está no futuro. Implementada e validada no navegador | GLYX-07, GLYX-39 | aprovada; implementada (local) |
| D3 | Item "livre" **com horário cadastrado** recebe alarme? — [`DECISOES-D1-D4.md`](DECISOES-D1-D4.md) | Rivas | **aprovada em 15/10:** não recebe alarme implícito; é configuração inconsistente (mostrada na tela); ativar exige escolher frequência e programação no mesmo envio; nenhuma tela nova de "uso livre". Implementada e validada no navegador | GLYX-07, GLYX-39 | aprovada; implementada (local) |
| D4 | Ao "apagar meus dados", o que fica do registro técnico de uso de IA? — [`DECISOES-D1-D4.md`](DECISOES-D1-D4.md) | Rivas | **aprovada em 15/10:** nada — a exclusão apaga todo o uso de IA da pessoa (pelo servidor, só na exclusão completa); a cota por hora reinicia (testado). Sem retenção, sem cron. **Conflito informado:** não existe teto global de gasto que bloqueie chamadas — só o medidor do admin, que depende dos registros apagados (P52) | GLYX-24, GLYX-39 | aprovada; implementada (local) |
| D5 | Cron de sugestão: retirar dado clínico, opt-in, ou manter e declarar — estado em [`P06-ENVIO-AUTOMATICO-IA.md`](P06-ENVIO-AUTOMATICO-IA.md) | a definir (sugerido: Rivas) | fecha a divergência DPIA × código (P06) | GLYX-17 | não definido |
| D6 | Provedor de IA, país de processamento e base legal na política | a definir (sugerido: Rivas com assessoria) | texto da política | GLYX-17 | não definido |
| D7 | Teto do bolus, curadoria das substâncias fora da base, score composto | a definir (sugerido: Rivas com profissional de saúde) | decisão clínica | GLYX-29 | não definido |
| D8 | Dexcom e Google Fit continuam no escopo? | a definir (sugerido: Rivas) | denominador de M1 e M10 | GLYX-42 | não definido |
| D9 | Pontos do briefing de hipertrofia contam como escopo? | a definir (sugerido: Rivas) | se não, M6 sobe para 90% | GLYX-41 | não definido |
| D10 | O relatório de sobreposição de mecanismos entra em tela? | a definir (sugerido: Rivas) | funcionalidade sobre código já escrito e sem uso (P35) | GLYX-13 | não definido |
| D11 | Exame lido por foto passa a exigir revisão antes de gravar? | a definir (sugerido: Rivas) | muda o fluxo de cadastro (P29) | GLYX-22 | não definido |
| D12 | Pasta `PDF/` vai para o `.gitignore` ou para `_local/`? | a definir (sugerido: Rivas) | evita o painel impresso num `git add` | GLYX-40 | não definido |
| D13 | Desligar o envio automático de sugestão (cron `glyx-meal-suggest`) até decidir D5? | a definir (sugerido: Rivas) | recomendado: sim, desagendando o cron (reversível; exige escrita em produção e aviso a quem usa) | GLYX-17 | não definido |
| D14 | O que fazer com as 22 doses duplicadas (11 grupos, 08/09 a 03/10) que impedem o índice de dose única? — [`D14-DOSES-DUPLICADAS.md`](D14-DOSES-DUPLICADAS.md) | Rivas | **direção B escolhida em 15/10** (preservar o histórico, proteger daqui para frente). Não autoriza implantação nem exclusão. **Data de corte ainda não definida** (definida na implantação) | GLYX-11, GLYX-39 | direção definida; corte não definido |
| D15 | Registrar no histórico de correção QUEM corrigiu (`auth.uid()` e papel)? | Rivas | **autorizada e implementada em 15/10**: autor da identidade validada pelo PostgREST; nulo (não inventado) sem usuário autenticado; validada em PostgreSQL isolado | GLYX-11 | implementada (local) |
| D16 | Relatório médico e histórico completo devem deixar de contar "Pulei hoje" como tomada (P46)? | Rivas | **autorizada e implementada em 15/10** em 9 consumidores (telas, cartão, relatórios, auditoria, IA, platô); fórmula da adesão inalterada | GLYX-08 | implementada (local) |
| A4 | Ambiente isolado de integração (Docker Engine próprio + CLI Supabase Linux na `Ubuntu-22.04`) | Rivas | **autorizada e executada em 15/10**: isolamento comprovado, F1–F8 com PostgreSQL 17, PostgREST e Auth reais — 22/23 OK; ambiente desmontado | GLYX-11 | executada |
| I1 | Trocar a chave de serviço de produção depois do incidente de 14/10? | a definir (sugerido: Rivas) | risco residual baixo (só componentes locais, já destruídos); troca dá certeza total e é ação em produção — [`INCIDENTES-AMBIENTE-14-10-2026.md`](INCIDENTES-AMBIENTE-14-10-2026.md) | GLYX-45 | não definido |
| I2 | Conferir efeitos externos dos 25 contêineres de outros projetos ligados por ~1 min? | a definir (sugerido: Rivas) | conferência pelos efeitos externos (WhatsApp, e-mail, serviços do n8n) sem ligar nada; ler o histórico interno exige ligar o Docker (nova autorização) | GLYX-45 | não definido |
| A1 | Autorizar Supabase de teste (local com Docker ou projeto separado) | Rivas | **concedida em 14/10 para Supabase local descartável**; falta ambiente persistente para o CI (GLYX-04) | GLYX-04, GLYX-38 | não definido |
| A2 | Autorizar aplicação das migrations em produção (frase explícita) | Rivas | leva o lote 1 ao ar; **não autorizada em 15/10** | GLYX-39 | não definido |
| A3 | Autorizar leituras em produção (definição das funções, contagens, duplicatas) | Rivas | **executada em 15/10** (somente leitura, agregada): histórico explicado (nomes iguais não provam conteúdo igual; a `_v2` não foi comparada), função de alarme igual à da reversão, schema compatível **para as dependências do lote 1** (não o schema inteiro), **11 grupos de doses duplicadas** (bloqueiam a implantação), sugestão automática ativa. Resultados em `d:\tmp\a3-2026-10-15\` e no plano §7 | GLYX-11, 25, 33, 34, 36, 39 | executada |

## F. Registro de problemas → tarefa

Problemas da auditoria (P01–P31), achados durante a execução (P32–P35), um que faltava no registro
(P36), achados da validação integrada de 14/10 (P37–P40), do fechamento de 15/10 (P41–P42) da leitura A3 e da preparação da D14 de 15/10 (P43–P45) e da inspeção para o lote de integração (P46–P47). Cada um tem tarefa ou classificação explícita. Nenhuma tarefa foi duplicada para isso.

| Problema | Tarefa | Classificação | Correção |
|---|---|---|---|
| P01, P34 | GLYX-15 | tarefa | corrigido local · validado em teste local |
| P02, P03 | GLYX-16 | tarefa | corrigido local |
| P04 | GLYX-07 | tarefa | corrigido local · defeito reproduzido e corrigido em teste local |
| P05 | GLYX-23 | tarefa | corrigido local · validado em teste local |
| P06 | GLYX-17 | aguardando decisão (D5, D6): mudar consentimento ou envio automático depende de decisão | registrado no DPIA §11 · **confirmado em teste local** (o prompt do cron levou a glicemia) · **ativo em produção** (A3: job ativo, 3 sugestões por dia de 02 a 14/10) |
| P07 | GLYX-24 | tarefa | corrigido local · validado em teste local (concorrência 5/20) |
| P08 | GLYX-25 | tarefa | corrigido local · validado em teste local (provedor simulado) · **confirmado em produção pela A3**: 39 sugestões em 13 dias, 0 registros de custo `meal_suggest` |
| P09, P17 | GLYX-26 | tarefa | corrigido local · validado em teste local (provedor simulado) |
| P10, P32 | GLYX-12 | tarefa | corrigido local · validado em teste local (push simulado; aparelho pendente) |
| P11 | GLYX-10 | tarefa | corrigido local · validado em teste local (com controle negativo) |
| P12, P13, P14, P16 | GLYX-27 | tarefa | corrigido local · validado unitário (P16 sem o chat) |
| P15 | GLYX-28 | tarefa | corrigido local · validado unitário || P18 | GLYX-04 | tarefa | aberto |
| P19 | GLYX-21 | tarefa | corrigido local · validado unitário |
| P20 | GLYX-19 | tarefa | aberto |
| P21 | GLYX-20 | tarefa | aberto |
| P22, P36 | GLYX-33 | tarefa (P36: recuperação de senha barrada pela lista do login social — estava na auditoria e faltava no registro) | aberto |
| P23 | GLYX-34 | tarefa | aberto |
| P24 | GLYX-32 | tarefa | corrigido local · validado unitário |
| P25 | GLYX-31 | tarefa | corrigido local · validado unitário |
| P26 | GLYX-30 | tarefa | aberto |
| P27 | GLYX-18 | tarefa | aberto |
| P28 | GLYX-35 | tarefa | corrigido local · validado unitário |
| P29 | GLYX-22 | aguardando decisão (D11): revisão antes de gravar muda o fluxo | aberto |
| P30 | GLYX-36 (tipos) | tarefa só para os tipos; código morto e `npm install` no CI **adiados** — manutenção sem efeito em comportamento; documentação parcialmente atualizada em 14/10 | aberto |
| P31 | GLYX-11 | tarefa | corrigido local · validado em teste local ("Já tomei" no aparelho pendente) |
| P33 | GLYX-08 | tarefa | corrigido local · validado em teste local (tela) |
| P35 | GLYX-13 | aguardando decisão (D10): ligar à tela é funcionalidade | aberto |
| P37 | GLYX-23 | tarefa (a tela do admin descartava o retorno da desativação: se o banimento falhasse, ninguém sabia) | corrigido local · validado em teste local |
| P38 | GLYX-26 | observação: queda do stream da IA gera `uncaughtException: ECONNRESET` no `next dev` (a rota trata e avisa) | aberto — investigar se ocorre em produção |
| P39 | GLYX-24 | resolvido pela D4 (15/10): a tela dizia "todos os seus registros foram apagados" mas o uso de IA recente ficava; agora a exclusão apaga todo o uso de IA e a frase é verdadeira | corrigido local (15/10) · validado no navegador |
| P40 | — | fora do escopo: com webpack (`next dev` sem `--turbopack`) a CSP bloqueia `eval` e o login não hidrata; só desenvolvimento local | registrado no plano §6 |
| P41 | GLYX-46 | tarefa: o teste local podia carregar segredo de produção do `.env.local` (incidente de 14/10) | corrigido local · validado localmente: guarda no Vitest, no Playwright e no CI (15/10); não commitado |
| P46 | GLYX-08 | tarefa (D16 autorizada): relatórios e telas contavam "Pulei hoje" como tomada | corrigido local · validado localmente (15/10): 9 consumidores, 14 resultados esperados explícitos |
| P47 | GLYX-11 | tarefa: na tela, o botão "Registrar dose" descartava o erro da ação (falha de gravação ou sessão expirada no clique não apareciam) | corrigido local (15/10) · validado no navegador com PostgREST e Auth reais (A4, F7 e falha de gravação na tela) |
| P48 | GLYX-11 | tarefa (anterior ao lote): `formatarDataHora` com opções de componente lançava `TypeError` — relatório completo dava erro 500 para quem tem remédio e o gráfico de tendência da glicemia quebrava; desde `03939f1`, já na `main` | corrigido local (15/10) · validado no navegador com PostgREST e Auth reais (14/14); pendente de produção |
| P49 | GLYX-11 | tarefa (achado no navegador, do lote D16): o relatório completo não lia `correcoes` e não marcava "horário corrigido" | corrigido local (15/10) · validado no navegador; não existe na `main` |
| P50 | GLYX-11 | tarefa (achado no build de produção, do lote 1): ação do servidor que chamava `redirect()` nem sempre navegava — pergunta de conflito (F2) não abria, recusa da frequência (D1) e da ativação (D3) não aparecia; no servidor de desenvolvimento funcionava (por isso passou na A4) | corrigido local (15/10): a ação devolve o destino/aviso e o navegador navega (`FormularioDeAcao`) · validado no build de produção |
| P51 | GLYX-09 | tarefa (achado no navegador, desta rodada): na edição de item "livre" com horário a frequência vinha pré-selecionada, e escolher só a programação ativava o alarme sem escolha de frequência | corrigido local (15/10) · validado no navegador |
| P52 | GLYX-24 | registrado (conflito da D4): não há teto global de gasto de IA que bloqueie chamadas; `AI_DAILY_BUDGET_USD`/`AI_MONTHLY_BUDGET_USD` só alimentam o medidor do admin, que soma `ai_usage` e deixa de contar o que a exclusão apaga | aberto — criar teto real seria funcionalidade nova, fora do lote |
| P43 | GLYX-12 | observação da A3: 17 de 25 chamadas recentes do banco para o app terminaram em **timeout de 5 s** do `pg_net` (8 com HTTP 200). O app pode ter concluído mesmo assim; não verificado | aberto — investigar; o despacho do lote 1 confirma pela rota e não depende da resposta do `pg_net` |
| P45 | GLYX-11 | tarefa (achado da D14): o registro do lote 1 descartava em silêncio um segundo registro com horário diferente na mesma dose | corrigido local · validado localmente e em **PostgreSQL isolado** (15/10, 45 verificações); pendente de PostgREST/Auth reais e de produção |
| P44 | GLYX-39 | registrado: histórico de migrations de produção difere do repositório (nomes iguais não provam conteúdo igual; a `_v2` não foi comparada) — 3 arquivos sem registro (`metabolic_audits`, `exam_type`, `admin_user_last_activity`) cujos objetos existem; 1 registro sem arquivo (`admin_user_last_activity_v2`); versões de produção são o horário de aplicação. Não impede o lote 1 (o B4 conferiu o schema real) | registrado; não corrigir sem decisão (`migration repair` não autorizado) |
| P42 | GLYX-09 | resolvido pela D1 (15/10): `diaria` era gravado por presunção; o app não presume mais (frequência obrigatória em cadastro novo) e `cadence_confirmed_at` separa escolhida de presumida | corrigido local (15/10) · validado no navegador |

"Corrigido local" = só no código desta sessão: não commitado, não implantado, migrations não aplicadas em
produção. "Validado em teste local" = banco local descartável (validação local integrada); onde há IA ou push,
eles foram **simulados** — isso não aprova a integração com o serviço real.

## E. Ordem de execução completa (separada do ID)

| Ordem | ID | Lote | | Ordem | ID | Lote |
|---|---|---|---|---|---|---|
| 1 | GLYX-01 | 1 | | 24 | GLYX-19 | 5 |
| 2 | GLYX-02 | 1 | | 25 | GLYX-20 | 5 |
| 3 | GLYX-07 | 1 | | 26 | GLYX-21 | 5 |
| 4 | GLYX-08 | 1 | | 27 | GLYX-32 | 5 |
| 5 | GLYX-09 | 1 | | 28 | GLYX-31 | 5 |
| 6 | GLYX-10 | 1 | | 29 | GLYX-35 | 5 |
| 7 | GLYX-11 | 1 | | 30 | GLYX-17 | 6 |
| 8 | GLYX-12 | 1 | | 31 | GLYX-18 | 6 |
| 9 | GLYX-15 | 1 | | 32 | GLYX-22 | 6 |
| 10 | GLYX-16 | 1 | | 33 | GLYX-29 | 6 |
| 11 | GLYX-23 | 1 | | 34 | GLYX-33 | 6 |
| 12 | GLYX-24 | 1 | | 35 | GLYX-34 | 6 |
| 13 | GLYX-25 | 1 | | 36 | GLYX-13 | 7 |
| 14 | GLYX-26 | 1 | | 37 | GLYX-14 | 7 |
| 15 | GLYX-03 | 2 | | 38 | GLYX-37 | 7 |
| 16 | GLYX-04 | 2 | | 39 | GLYX-41 | 7 |
| 17 | GLYX-05 | 2 | | 40 | GLYX-42 | 7 |
| 18 | GLYX-38 | 2 | | 41 | GLYX-36 | 8 |
| 19 | GLYX-45 | 4 | | 42 | GLYX-40 | 8 |
| 20 | GLYX-46 | 2 | | 43 | GLYX-43 | 8 |
| 21 | GLYX-39 | 4 | | 44 | GLYX-44 | 8 |
| 22 | GLYX-27 | 5 | | 45 | GLYX-30 | 8 |
| 23 | GLYX-28 | 5 | | 46 | GLYX-06 | contínuo |

O lote 3 não tem ID próprio: é a execução dos testes SQL das tarefas do lote 1, dentro de GLYX-03.

---

## Tarefas

### Bloco 1 — Base de validação e documentação

#### GLYX-01 — Linha de base de validação local isolada
- **Categoria:** operação · **Prioridade:** P1 · **Escopo:** observado
- **Problema:** o `.env.local` tem chaves de produção, e `next build`/`next dev` o carregam sozinhos;
  dois testes reescrevem `docs/CBOM.md` e `docs/CONTRASTE.md`. Sem isolamento, validar poderia tocar
  produção.
- **Resultado esperado:** lint, tipos, testes e build rodando com variáveis falsas, telemetria
  desligada, sem nenhuma referência ao projeto de produção no build.
- **Dependências:** —
- **Arquivos:** script de validação (fora do repo), `package.json`, `next.config.ts`, `.github/workflows/ci.yml`.
- **Critérios de aceitação:** quatro comandos com exit 0; `.next` sem o identificador do projeto de produção.
- **Validação:** execução local.
- **Status:** implementada (local) · **validada localmente** em 14/10/2026.
- **Evidência:** lint 0 avisos; `tsc --noEmit` exit 0; Vitest 88 arquivos / 952 testes; build exit 0;
  busca pelo identificador de produção em `.next` = 0 ocorrências.
- **Local:** sim · **Exige:** nada.

#### GLYX-02 — Documentação de referência (PRD, TRD, fluxo, design, schema, plano)
- **Categoria:** documentação · **Prioridade:** P2 · **Escopo:** observado
- **Problema:** não há PRD; o escopo usado nos percentuais é provisório. `CONTEXTO_TECNICO.md` faz papel de
  TRD mas está defasado em números.
- **Resultado esperado:** `docs/PRD.md`, `docs/TRD.md`, `docs/FLUXO-APP.md`, `docs/DESIGN-SYSTEM-BRIEFING.md`,
  `docs/SCHEMA-BACKEND.md`, `docs/PLANO-IMPLEMENTACAO.md`, reaproveitando os documentos existentes, separando
  estado comprovado, inferência, proposta e decisão pendente.
- **Dependências:** —
- **Critérios de aceitação:** cada documento indica a fonte de cada afirmação e não transforma bug em requisito.
- **Validação:** revisão do Rivas.
- **Status:** implementada (local) · não validada (depende de revisão).
- **Local:** sim · **Exige:** revisão do Rivas.

#### GLYX-03 — Ambiente Supabase de teste
- **Categoria:** operação · **Prioridade:** P1 · **Escopo:** sugerido
- **Problema:** não existe banco separado; toda validação de SQL, RLS e E2E está bloqueada.
- **Resultado esperado:** Supabase local (Docker) ou projeto separado com as migrations aplicadas, Vault com
  `cgm_cron_secret` de teste e `app_base_url` **apontando para endereço que não seja produção**, dois usuários
  de teste sem dado real.
- **Dependências:** —
- **Critérios de aceitação:** `supabase/tests/*.sql` executam; nenhuma chave de produção no ambiente.
- **Validação:** execução dos testes SQL.
- **Status:** implementada **como ambiente local descartável** (14/10, autorizado nesta rodada) ·
  **validada em teste local**. Supabase CLI num diretório fora do repositório; URL de produção trocada
  por endereço morto nas migrations antigas; crons desagendados; Vault de teste; só usuários sintéticos.
  Não é persistente: o CI (GLYX-04) ainda precisa de um ambiente próprio.
- **Evidência:** os 4 testes SQL executados; ver "Validação integrada" no fim do documento.
- **Local:** sim · **Exige:** para o CI, ambiente persistente (decisão de A1).

#### GLYX-04 — E2E clínico no CI contra ambiente de teste
- **Categoria:** teste · **Prioridade:** P2 · **Escopo:** observado (ROADMAP P1.2)
- **Problema:** `ci.yml:12` aponta para Supabase de exemplo; `clinical-path.spec.ts` grava glicemia no banco
  configurado — localmente, seria produção.
- **Resultado esperado:** CI com URL e chaves do ambiente de teste via secrets; conta descartável.
- **Dependências:** GLYX-03.
- **Critérios de aceitação:** spec clínico executado no CI, não pulado.
- **Status:** bloqueada · validação bloqueada. **Exige:** GLYX-03.

#### GLYX-05 — Testes de isolamento e bloqueio em banco real
- **Categoria:** teste · **Prioridade:** P1 · **Escopo:** sugerido
- **Problema:** o teste de RLS é estático (lê SQL). O isolamento foi verificado à mão no pentest de 08/09.
- **Resultado esperado:** suíte com dois usuários: leitura/escrita cruzada recusada; conta desativada
  recusada em tabela, Storage e refresh (ver GLYX-23).
- **Dependências:** GLYX-03, GLYX-23.
- **Status:** **executada em teste local** (14/10) por scripts fora do repositório: escrita cruzada recusada
  (com controle negativo); conta desativada recusada em tabela, Storage, refresh e login. Ainda **não
  existe como suíte versionada** no repositório nem roda no CI.

#### GLYX-06 — Resultado registrado de cada caso do roteiro de teste
- **Categoria:** teste · **Prioridade:** P2 · **Escopo:** observado
- **Problema:** dos 48 casos de `ROTEIRO-DE-TESTE.md` §1–§6, só 1 tem resultado registrado.
- **Resultado esperado:** cada caso com aprovado/reprovado e data.
- **Status:** não iniciada · **Exige:** execução pelo Rivas (usa dado real).

### Bloco 2 — Alarmes e confiabilidade

#### GLYX-07 — Alarme respeita cadência, rigidez e virada do dia
- **Categoria:** correção · **Prioridade:** P0 · **Escopo:** observado
- **Problema:** `dispatch_med_alarms` (versão final em `20260718060000`) filtra só por horário: remédio semanal
  com horário recebe alarme crítico todo dia. Também: (a) ignora `timing_strictness = 'livre'`, que a coluna
  declara "sem alarme"; (b) a janela `rt::time + interval '10 minutes'` dá a volta à meia-noite, então
  horários de 23:51 a 23:59 nunca casam; (c) um horário malformado faria `rt::time` lançar e abortar o envio
  de **todos** os usuários.
- **Resultado esperado:** função pura `med_alarm_is_dose_day` + `med_alarms_due(p_now)` (testável com "agora"
  fixo) usadas pelo despachante; janela calculada em timestamp sobre a data da dose (hoje e ontem);
  horário filtrado por regex; regras D1–D3 aplicadas.
- **Dependências:** D1, D2, D3 (implementado com as recomendações; reversível).
- **Arquivos:** nova migration `…_med_alarms_cadencia_e_confiabilidade.sql`; `lib/medications/cadence.ts` (gêmea TS);
  `lib/medications/cadence-casos.json`; `supabase/tests/med_alarms_due.sql`.
- **Critérios de aceitação:** semanal só no dia; intervalo só em múltiplos da âncora e nunca antes dela;
  diária e nula todo dia; livre nunca; dose de 23:55 dispara às 00:02 com a data do dia anterior; fusos
  distintos recebem a data local correta.
- **Validação:** unitária (TS, mesmos casos) local; SQL em banco de teste.
- **Status:** implementada (local) · **validada localmente** a regra TS (18 casos) e a trava estática ·
  **validada em teste local** (14/10): `med_alarms_due.sql` 18 casos e `dispatch_med_alarms.sql` 7
  cenários aprovados; com o banco antigo o cenário 1 falha (defeito reproduzido) · migration **não
  aplicada em produção** · regras D1–D3 **não aprovadas** ([`DECISOES-D1-D4.md`](DECISOES-D1-D4.md)).
- **Evidência:** `lib/medications/cadence.test.ts`, `lib/db/med-alarms-migration.test.ts`, os dois testes SQL.
- **Local:** sim · **Exige:** D1–D3; A2/A3 para produção.

#### GLYX-08 — "Doses de hoje" e adesão respeitam a cadência
- **Categoria:** correção · **Prioridade:** P0 · **Escopo:** observado
- **Problema:** `lib/medications/day-summary.ts` gera dose todo dia para todo item com horário; um semanal
  apareceria "atrasado" seis dias por semana e derrubaria a adesão.
- **Resultado esperado:** dia sem dose não gera dose nem entra no denominador da adesão.
- **Dependências:** GLYX-07 (mesma regra).
- **Arquivos:** `lib/medications/day-summary.ts`, `components/medicacao/daily-doses-card.tsx`,
  `lib/queries/card-agora.ts`, `lib/audit/medical-report.ts` (+ `computePeriodAdherence`),
  `lib/ai/user-context.ts`. **Achado:** a "regra única" não era única — os cinco geravam doses por conta
  própria e todos ignoravam a cadência.
- **Critérios de aceitação:** testes do day-summary para semanal/intervalo/nula.
- **Validação:** unitária local.
- **Status:** implementada (local) · **validada localmente** (2 testes reproduziram a falha antes da correção).
- **Local:** sim.

#### GLYX-09 — Declarar a cadência no cadastro do medicamento
- **Categoria:** funcionalidade · **Prioridade:** P0 · **Escopo:** observado (a coluna existe com comentário
  "frequência declarada"; nenhuma tela a escreve)
- **Problema:** nenhum código grava `medications.cadence`. Sem isso, GLYX-07 e 08 não mudam o comportamento
  de remédio nenhum.
- **Resultado esperado:** formulário de edição com frequência (diária / semanal + dia / a cada N dias + data
  de início); action valida com zod e respeita os CHECKs do banco; item novo com horário nasce `diaria`.
- **Dependências:** GLYX-07.
- **Arquivos:** `app/actions/medications.ts`, `app/(app)/medicacao/medicamentos/page.tsx`,
  `lib/medications/cadence.ts`.
- **Critérios de aceitação:** parser da cadência testado; cadência incompleta recusada com mensagem.
- **Status:** implementada (local) · parser **validado localmente** · tela **validada em teste local**
  (14/10, navegador): semanal sem dia recusado com aviso e banco inalterado; semanal salvo e respeitado
  em "Doses de hoje". Campo só no formulário de **edição**; na criação, item com horário nasce `diaria`.
  Erro de frequência volta à tela por código fechado (`?erro=…`), sem texto livre da URL.
- **Local:** sim.

#### GLYX-10 — Filhos de `medications` só com medicamento do mesmo dono
- **Categoria:** correção · **Prioridade:** P1 · **Escopo:** observado
- **Problema:** policies de `medication_snoozes` e `medication_logs` só conferem `user_id`; o despachante
  junta o medicamento sem conferir o dono. Quem conhece o UUID de um medicamento alheio recebe nome e dose
  dele por push.
- **Resultado esperado:** `WITH CHECK` exigindo medicamento do próprio usuário; join do despachante com
  `m.user_id = s.user_id`.
- **Arquivos:** migration de GLYX-07 (mesma função) + migration de policies.
- **Validação:** estática local; SQL em banco de teste (usuário B não cria snooze/log com medicamento de A).
- **Status:** implementada (local) · estática **validada localmente** · **validada em teste local**
  (`policies_dono_do_medicamento.sql`, 3 cenários; com as policies antigas o teste falha) · migrations
  **não aplicadas em produção**.
- **Local:** sim · **Exige:** A2/A3 para produção.

#### GLYX-11 — Registro de dose idempotente
- **Categoria:** correção · **Prioridade:** P1 · **Escopo:** observado (roteiro §2: "Marcar dose já tomada,
  de novo — não duplica")
- **Problema:** o "Já tomei" da notificação inseria sem dose prevista, e dois toques gravavam duas doses. A
  primeira correção (14/10) tratava "mesma dose prevista" como "mesma ação" e descartava em silêncio um
  registro com outro horário (P45). Em produção há 11 grupos de doses repetidas (D14).
- **Resultado esperado (revisto em 15/10, direção B da D14):** reenvio da mesma ação reconhecido por um
  **pedido** (UUID), não pelo horário; tomada já existente na dose → **pergunta** (corrigir ou outra
  tomada), nunca descarte silencioso nem conversão automática; correção que **preserva** o valor anterior;
  índice de dose única **só para registros criados a partir de uma data de corte**; histórico preservado.
- **Arquivos:** `lib/medications/register-dose.ts`, `lib/medications/conflito-registro.ts`,
  `lib/medications/tomadas.ts`, `lib/medications/adherence.ts`, `app/actions/medications.ts`,
  `app/(app)/medicacao/page.tsx`, `app/(app)/medicacao/medicamentos/page.tsx`,
  `components/medicacao/daily-doses-card.tsx`, `app/api/medications/taken/route.ts`, `public/sw.js`,
  migration `20261014122000` (reescrita), `supabase/reversao/`, `supabase/tests/dose_unica_prospectiva.sql`.
- **Implementado (local):** tudo acima.
- **Validado localmente (15/10):** 19 casos da regra, 5 da tela, 5 da notificação (banco falso com estado,
  inclusive pedidos simultâneos no mesmo processo), 12 de contagem/adesão/histórico/relatório, 9 regras
  estáticas da migration; suíte com 1.226 testes.
- **Validado em PostgreSQL real isolado (15/10, WSL, PG 14.24, D14 §7):** 45 verificações, 0 falha — 8
  cenários SQL; concorrência com duas conexões e com 20 clientes; correção atômica e rollback; antigo +
  novo após o corte; retroativo; `created_at` forjado; isolamento entre usuários com as policies reais;
  reversão preservando histórico. Achado e corrigido: um pedido não pode virar as duas decisões
  (`acao_ja_resolvida`).
- **Pendente de produção:** data de corte (definida na implantação), A2, conferência depois da aplicação.
- **Pendente de integração:** PostgREST e Auth reais (o teste simulou `auth.uid()`); Postgres 17 (o teste
  usou 14); tela e notificação num aparelho.
- **Testado pelo navegador com Auth e PostgREST reais (15/10, A4):** F1–F8 — 22/23 verificações; a única
  não aprovada é o histórico completo, bloqueado por P48 (anterior ao lote).
- **Nova execução (15/10, depois da correção da P48):** histórico completo e gráfico de glicemia pelo
  navegador — 14/14; o cenário que faltava da A4 passou.
- **Status:** implementada (local) · validada localmente · validada em PostgreSQL isolado · **validada com
  PostgREST e Auth reais (PG 17.6)** · não validada em produção · celular e push real **não** validados.

#### GLYX-12 — Despacho de alarme com estado, reenvio e observabilidade
- **Categoria:** correção · **Prioridade:** P1 · **Escopo:** observado
- **Problema:** o anti-duplicação é gravado antes do POST, que é "dispara e esquece": falha da rota perde o
  alarme sem registro. A rota não distingue falha transitória de entrega. Todo alarme crítico usa a mesma tag
  `glyx-critical` no service worker, então dois alarmes simultâneos se substituem.
- **Resultado esperado:** `push_dispatch_log` com estado (`pendente`, `enviando`, `enviado`, `falhou`,
  `sem_assinatura`), tentativas e erro; reivindicação atômica com `for update skip locked`; reenvio até 3
  vezes dentro de 30 min da dose; a rota confirma cada item com service role; tag por dose no service worker,
  que também colapsa reenvio duplicado.
- **Dependências:** GLYX-07.
- **Arquivos:** migration de GLYX-07, `app/api/push/dispatch/route.ts`, `lib/push/send.ts`, `public/sw.js`.
- **Critérios de aceitação:** testes unitários da agregação de resultado por despacho; teste estático da
  migration; SQL em banco de teste para reivindicação e reenvio.
- **Status:** implementada (local) · desfecho e trava estática **validados localmente** · **validada em
  teste local** com push simulado: banco → pg_net → rota → push; 503 vira `falhou` após 3 tentativas com o
  erro gravado; 410 apaga a assinatura; service worker no Chromium mostra 2 alarmes simultâneos e colapsa
  reenvio · entrega por serviço de push **real** e comportamento no aparelho **pendentes** · migration
  **não aplicada em produção**. Ordem de implantação: **código antes da migration** (ensaiada; plano §4).
- **Local:** sim · **Exige:** aparelho para a validação final; A2/A3.

#### GLYX-13 — Relatório de sobreposição sem chamador em produção
- **Categoria:** funcionalidade · **Prioridade:** P2 · **Escopo:** sugerido
- **Problema:** `buildOverlapReport` (`lib/safety/overlap.ts`) só é chamado por testes. A entrega
  "cadência na contagem de mecanismos" do painel estava marcada como implementada e não está ligada.
- **Resultado esperado:** decidir se entra em tela; se sim, ligar com a cadência real.
- **Status:** não iniciada · **Exige:** D10 · **Problema:** P35.

#### GLYX-14 — Estoque considerando a cadência
- **Categoria:** correção · **Prioridade:** P2 · **Escopo:** sugerido
- **Problema:** `due_refill` calcula consumo diário por número de horários; semanal avisa reposição ~7× cedo.
- **Dependências:** GLYX-09.
- **Status:** não iniciada.

### Bloco 3 — Integridade dos dados e privacidade

#### GLYX-15 — Inventário LGPD derivado do schema
- **Categoria:** correção · **Prioridade:** P1 · **Escopo:** observado (direito de eliminação e portabilidade)
- **Problema:** exclusão e exportação não cobrem `hypo_plan`, `hypo_events`, `health_events`,
  `user_substance_windows` (e a exportação não cobre `exam_values`); o reset do perfil não limpa
  `carb_ratio`, `correction_factor`, `target_glucose_bolus`; a limpeza do Storage lista no máximo 1000
  arquivos; o teste compara com lista escrita à mão.
- **Resultado esperado:** listas completas; teste que extrai do SQL toda tabela com `user_id` e exige cada
  uma no inventário (com exceções declaradas); Storage paginado.
- **Arquivos:** `lib/privacy/user-data.ts`, `lib/privacy/rls-coverage.test.ts`, `app/actions/privacy.ts`.
- **Critérios de aceitação:** teste novo falha sem as tabelas e passa com elas.
- **Validação:** unitária local; exclusão real em conta de teste (GLYX-03).
- **Status:** implementada (local) · **validada localmente** — o teste derivado do schema acusou também
  `cgm_connections` e `google_fit_connections` sem coluna `id` para ordenar a exportação, corrigido ·
  **validada em teste local** (14/10, pela tela, conta sintética com 2500 leituras): exportação completa
  com as tabelas novas; exclusão limpou tudo, inclusive fotos e `carb_ratio`/`correction_factor`, exceto
  1 linha recente de `ai_usage` (D4) e a conta de login.

#### GLYX-16 — Paginação com aviso de resultado parcial
- **Categoria:** correção · **Prioridade:** P1 · **Escopo:** observado
- **Problema:** exportação, auditoria metabólica, resumo semanal e contexto da IA leem só as primeiras 1000
  linhas; `fetchAllRows` interrompe em erro sem avisar.
- **Resultado esperado:** leitura paginada com indicação de parcial; exportação marca tabela incompleta.
- **Arquivos:** `lib/queries/fetch-all.ts`, `app/api/me/export/route.ts`, `lib/audit/day-grid.ts`,
  `lib/queries/weekly-summary.ts`, `lib/ai/user-context.ts`.
- **Critérios de aceitação:** testes com mais de 1000 registros em cliente simulado.
- **Status:** implementada (local) · **validada localmente** com 2500 registros num cliente que imita o
  teto de 1000 · comportamento escolhido: exportação marca tabela incompleta; auditoria **não grava** score
  sobre dado incompleto; resumo semanal vira erro; contexto da IA declara que o padrão horário não foi
  calculado. Fora deste lote: as rotas de IA `supplement-check`, `goal-feasibility` e `body-composition`
  ainda leem glicemia sem paginar (entram em GLYX-27).

#### GLYX-17 — Política, DPIA e processamento automático consistentes
- **Categoria:** documentação · **Prioridade:** P1 · **Escopo:** observado
- **Problema:** a política não nomeia provedor nem país; o cron de sugestão envia tipo de diabetes e última
  glicemia sem ação do titular, e o DPIA afirma o contrário.
- **Resultado esperado:** divergência registrada (feito nesta sessão em `docs/DPIA.md` §11); correção de
  texto e de comportamento só após D5 e D6.
- **Status:** registro feito; correção bloqueada · **Exige:** D5, D6.

#### GLYX-18 — Admin sem leitura de colunas clínicas de outros perfis
- **Categoria:** correção · **Prioridade:** P2 · **Escopo:** sugerido
- **Problema:** `profiles_select_admin` libera todas as colunas.
- **Status:** não iniciada.

#### GLYX-19 — Ingestão de CGM sem perda silenciosa
- **Categoria:** correção · **Prioridade:** P2 · **Escopo:** observado
- **Problema:** `lib/cgm/ingest.ts` ignora erro na deduplicação e no fallback; CSV grande vai inteiro.
- **Arquivos:** `lib/cgm/ingest.ts`, `app/api/cgm/ingest/route.ts`, `components/glicemia/libre-csv-import.tsx`.
- **Status:** implementada (local) · **validada localmente — unitária** (8 testes, 30/10/2026; suíte 110
  arquivos / 1335 testes) · banco real e navegador **não validados**.
  Ingestão em blocos de 200 (consulta de duplicadas cabe na URL e abaixo do teto de 1000 linhas); erro na
  consulta de duplicadas **para** a ingestão em vez de virar "nada existe"; no plano B linha a linha, erro
  que não é duplicata é contado (`failed`) e devolvido; resultado sempre traz `inserted + skipped + failed`
  = total. A rota devolve as contagens junto do erro (e não mais a mensagem crua do banco). O import do
  LibreView envia em partes de 2000 com progresso e, se parar, diz quanto já entrou e que reenviar não duplica.
  Fora do escopo: leituras sem `external_id` (origem `manual`) continuam sem deduplicação.

#### GLYX-20 — Reextração de valores de exame atômica
- **Categoria:** correção · **Prioridade:** P2 · **Escopo:** observado
- **Problema:** `app/actions/exam-values.ts:54` apaga antes de gravar, sem checar erro.
- **Arquivos:** `lib/exams/save-values.ts` (novo), `app/actions/exam-values.ts`,
  `components/exams/exam-row-actions.tsx` (novo), `app/(app)/exames/page.tsx`.
- **Status:** implementada (local) · **validada localmente — unitária** (7 testes, 30/10/2026; suíte 111
  arquivos / 1342 testes) · banco real e navegador **não validados** (o upsert depende da constraint
  `exam_values_unico`, que existe desde `20260908160000`).
  Ordem invertida, sem migration: lê os ids atuais → `upsert` por `(exam_id, analyte)` num comando só →
  apaga só os analitos que o laudo não tem mais. Falha na leitura ou na gravação não altera nada; falha
  na limpeza mantém os novos e devolve aviso. O slug livre cortado em 40 caracteres passou a ser
  deduplicado antes de gravar (dois rótulos longos com o mesmo começo quebravam o unique).
  **Achado junto:** a página descartava o retorno das duas actions — erro de extração e de data da
  coleta era invisível. Agora `exam-row-actions.tsx` mostra erro, aviso ou "N valores extraídos". A
  propagação da data da coleta para `exam_values` também deixou de ignorar o erro.
  Atomicidade de banco (função `security invoker` numa transação) fica como opção se um dia for exigida.

#### GLYX-21 — `/api/health/ingest` sem `mock` e com limites
- **Categoria:** correção · **Prioridade:** P2 · **Escopo:** observado
- **Arquivos:** `lib/health/snapshot-limits.ts` (novo), `app/api/health/ingest/route.ts`.
- **Status:** implementada (local) · **validada localmente — unitária** (30/10/2026) · `source: "mock"`
  recusado (400) no schema e de novo após normalizar; máx. 400 dias por envio e 1 MB de corpo (413, medido
  no texto, não no Content-Length); data `AAAA-MM-DD` real e no máximo amanhã; faixas físicas por campo
  (passos 0–100 mil, sono 0–24 h, FC repouso 20–250, kcal ativas 0–10 mil, estresse 0–100) valem também
  para os modos `google_fit` e `apple_health`; dia e fonte repetidos no envio ficam com o último (antes
  quebravam o upsert inteiro). Erro de gravação não devolve mais a mensagem do banco.
  Fora: `/api/cgm/ingest` (modo `unified`) segue sem teto de leituras por pedido — os blocos do GLYX-19
  aguentam o volume, mas não há limite explícito.

#### GLYX-22 — Revisão humana antes de gravar exame lido por foto
- **Categoria:** funcionalidade · **Prioridade:** P2 · **Escopo:** sugerido
- **Status:** não iniciada · **Exige:** D11 · **Problema:** P29.

### Bloco 4 — Acesso e controle de IA

#### GLYX-23 — Conta desativada barrada em todas as camadas
- **Categoria:** correção · **Prioridade:** P1 · **Escopo:** observado
- **Problema:** bloqueio só no middleware, que **libera** se a consulta ao perfil falhar; nenhuma policy
  confere `disabled`; desativar não encerra sessão.
- **Resultado esperado:** middleware em falha fechada (503, não "conta desativada"); policies
  **restritivas** `is_account_active()` em toda tabela de usuário e no Storage; desativar também bane no
  Auth (encerra o refresh). Banimento sozinho **não** comprova bloqueio: o token já emitido vale até expirar,
  e é a policy que o barra.
- **Arquivos:** `lib/supabase/middleware.ts`, `app/actions/admin.ts`, migration de policies.
- **Critérios de aceitação:** testes do middleware; teste estático da migration; testes em banco de teste
  para token existente, refresh, tabela e Storage (GLYX-05).
- **Status:** implementada (local) · decisão do middleware e cobertura da migration (32 tabelas, igual ao
  schema) **validadas localmente** · **validada em teste local** (14/10): token existente lê `[]`, escrita 403,
  Storage recusado, refresh e login `user_banned`, telas e API barradas; reativar devolve o acesso; com o
  acesso antigo o teste SQL falha (controle negativo) · migration `20261014123000` **não aplicada em
  produção**. Desativar agora também confere que a policy aceitou (antes, 0 linhas voltava como sucesso).
  **Achado P37 (14/10):** a tela do admin descartava o retorno; uma falha no banimento passava em silêncio.
  Corrigido (`app/(app)/admin/page.tsx` mostra aviso por código fechado) e validado com chave de serviço
  inválida: "Conta marcada como desativada no app, mas o bloqueio de login falhou. Tente de novo."

#### GLYX-24 — `ai_usage` protegida, com cota atômica
- **Categoria:** correção · **Prioridade:** P1 · **Escopo:** observado
- **Problema:** policy `for all` deixa o usuário apagar o próprio contador; contagem e registro não são
  atômicos.
- **Resultado esperado:** só SELECT para o usuário; consumo de cota por RPC `security definer` com trava
  por usuário; tokens gravados por RPC que só toca linha própria; exclusão LGPD mantém as últimas 24 h (D4).
- **Arquivos:** `lib/ai/rate-limit.ts`, `app/actions/privacy.ts`, `lib/privacy/user-data.ts`, migration.
- **Critérios de aceitação:** testes unitários do cliente da cota; teste estático da migration.
- **Status:** implementada (local) · **validada localmente** (9 testes) · **validada em teste local**:
  20 pedidos simultâneos com limite 5 → 5 aceitos (caminho antigo: 20); usuário não apaga a própria linha;
  recuo para o caminho antigo funciona com banco antigo · migration **não aplicada em produção** · retenção
  de 24 h na exclusão (D4) **não aprovada**; texto da tela de exclusão impreciso (P39). O registro legítimo continua:
  quem grava é a RPC `consumir_cota_ia`, executada pelo servidor com a sessão do usuário.

#### GLYX-25 — Custo de IA do cron registrado
- **Categoria:** correção · **Prioridade:** P2 · **Escopo:** observado
- **Problema:** o cron de sugestão chama `record_system_ai_usage` com cliente anon, revogado em 08/09, e ignora
  o erro.
- **Arquivos:** `app/api/meals/suggest-dispatch/route.ts`.
- **Status:** implementada (local) · **validada em teste local** com provedor de IA simulado: a rota
  respondeu 200, entregou o push e registrou o custo (+1 `meal_suggest`). Se a quebra antiga afetou
  produção continua hipótese até a consulta do plano §4 passo 1. O prompt levou a glicemia (P06). Grant explícito a `service_role` na migration
  `20261014123000`.

#### GLYX-26 — Payload do chat validado e stream interrompido sinalizado
- **Categoria:** correção · **Prioridade:** P1 · **Escopo:** observado
- **Problema:** o papel da mensagem é só um cast de tipo (aceita `system`); JSON inválido gera 500; queda do
  stream é gravada como resposta completa.
- **Arquivos:** `lib/ai/chat-payload.ts` (novo), `app/api/ai/chat/route.ts`.
- **Status:** implementada (local) · payload **validado localmente** (8 testes) · **validada em teste
  local** com provedor simulado: papel `system` recusado (400); queda do stream termina com aviso e o
  histórico guarda o aviso · observação P38 (`ECONNRESET` não capturado no console do `next dev`) aberta.

#### GLYX-27 — Robustez das respostas da IA e da checagem de segurança
- **Categoria:** correção · **Prioridade:** P1 · **Escopo:** observado
- **Problema:** refeição sem faixa e JSON inválido virando zero (P12); erro na base de interações virando
  "sem alerta" (P13); checagem por foto só para "suplemento" (P14); filtro de linguagem só em teste (P16).
- **Status:** implementada (local) · **validada localmente — unitária** (30/10/2026; suíte 109 arquivos /
  1327 testes) · IA real e navegador **não validados**.
  - P13: `lib/queries/substance-safety.ts` lança `SafetyCheckUnavailableError` em erro de leitura ou base
    vazia; `supplement-check`, `med-label` e `/medicacao/interacoes` mostram "Checagem de interação não
    executada" (âmbar, `checkUnavailablePayload` em `lib/safety/present.ts`). Painel e chat já tratavam a exceção.
  - P14: `med-label` checa qualquer `kind`, não só `supplement`.
  - P12: `validateMealEstimate` (`lib/ai/parse-meal.ts`) reprova JSON ilegível, lista vazia e valor fora de
    0–3000 kcal / 0–400 g carb / 0–300 g prot e gord por item; `meal-text` e `meal-photo` devolvem 422/502
    em vez de zeros. Carga glicêmica inválida vira `null`, não 0.
  - P16: `supplement-check` passa o texto do modelo por `findForbiddenLanguage`; reprovado cai no texto
    determinístico (`llmSkipped: true`). Chat em streaming **não** coberto (o texto já saiu quando daria
    para checar).
  - Glicemia: `lib/ai/glucose-average.ts` pagina e devolve média `null` se a leitura for parcial;
    usado em `supplement-check`, `goal-feasibility`, `body-composition`.

#### GLYX-28 — Calculadora de bolus mostra a idade da leitura
- **Categoria:** correção · **Prioridade:** P1 · **Escopo:** observado
- **Problema:** a última leitura é pré-preenchida como "glicemia atual" sem data. **Não altera fórmula nem teto.**
- **Arquivos:** `lib/medications/bolus-prefill.ts` (novo), `app/(app)/medicacao/calculadora/page.tsx`,
  `components/medicacao/bolus-calculator-form.tsx`.
- **Status:** implementada (local) · **validada localmente — unitária** (4 testes, 30/10/2026) · só
  pré-preenche leitura de até 20 min (corte `fresh` de `reading-freshness.ts`); mais antiga aparece com a
  idade e o campo fica vazio · navegador **não validado** (exige sessão) · fórmula e teto intocados.

#### GLYX-29 — Decisões clínicas pendentes
- **Categoria:** operação · **Prioridade:** P1 · **Escopo:** confirmado como pendente
- **Conteúdo:** teto de dose, curadoria das substâncias fora da base, score composto.
- **Status:** bloqueada · **Exige:** D7.

#### GLYX-30 — Convite de uso único com limite de tentativas
- **Categoria:** correção · **Prioridade:** P3 · **Escopo:** sugerido · **Status:** não iniciada.

#### GLYX-31 — Endpoint de push só para hosts conhecidos
- **Categoria:** correção · **Prioridade:** P2 · **Escopo:** sugerido
- **Arquivos:** `lib/push/endpoint.ts` (novo), `app/api/push/subscribe/route.ts`, `lib/push/send.ts`.
- **Status:** implementada (local) · **validada localmente — unitária** (30/10/2026) · só `https` na porta
  padrão, sem credencial, para FCM, Mozilla, Apple e WNS (Edge); host desconhecido recebe 400 no cadastro.
  O envio (`entregarPush`, ponto único) também recusa e marca como morta — assinatura maliciosa gravada
  antes do filtro é apagada no próximo alarme, sem requisição sair. Navegador com serviço novo precisa
  entrar na lista.

#### GLYX-32 — Erros genéricos ao cliente
- **Categoria:** correção · **Prioridade:** P3 · **Escopo:** sugerido
- **Arquivos:** `lib/errors/public-error.ts` (novo) e 22 arquivos de `app/actions` e `app/api`.
- **Status:** implementada (local) · **validada localmente — unitária** (30/10/2026) · 48 pontos que
  devolviam `error.message` do PostgREST agora passam por `publicDbError`: log completo no servidor, frase
  em português na tela (duplicado, valor fora do permitido, sem permissão — inclui conta desativada —,
  sessão expirada, genérica). Teste que varre `app/` reprova `error: X.message` novo.
  **Mantidos de propósito:** mensagens do fabricante do sensor (LibreLinkUp, Dexcom, Google Fit) nas rotas
  de conexão e sincronização — são traduzidas por `friendlyCgmError` para a pessoa agir; e a rota de
  autorização OAuth, que em erro de configuração mostra o nome da variável de ambiente.

#### GLYX-33 — Lista de e-mails do login social no Supabase
- **Categoria:** operação · **Prioridade:** P3 · **Escopo:** sugerido
- **Nota:** cadastro público desligado (ROADMAP, 14/08) já impede conta nova por OAuth.
- **Problemas:** P22 e P36 — a mesma lista barra a recuperação de senha de quem entrou por convite
  (`app/auth/callback/route.ts` aplica a lista a toda troca de código).
- **Critério adicional:** recuperação de senha de conta criada por convite não é barrada.
- **Status:** não iniciada · **Exige:** A3 (painel do Supabase).

#### GLYX-34 — Confirmar troca dos segredos antigos de cron
- **Categoria:** operação · **Prioridade:** P1 · **Escopo:** observado
- **Status:** não iniciada · **Exige:** A3 (produção).

#### GLYX-35 — Sentry com filtro de payload e captura de erro de tela
- **Categoria:** correção · **Prioridade:** P2 · **Escopo:** sugerido
- **Arquivos:** `lib/sentry-scrub.ts` (novo), `sentry.server.config.ts`, `sentry.edge.config.ts`,
  `instrumentation-client.ts`, `app/error.tsx`, `app/(app)/error.tsx`.
- **Status:** implementada (local) · **validada localmente — unitária** (6 testes, 30/10/2026) · envio
  real ao Sentry **não validado** (sem DSN local). `beforeSend`, `beforeSendTransaction` e
  `beforeBreadcrumb` nos três `Sentry.init`: sai sem corpo, cookies, query (só os nomes das chaves),
  cabeçalhos além de content-type/length, accept e user-agent; usuário só com id; breadcrumb de console
  sem texto. As duas telas de erro que só faziam `console.error` agora capturam no Sentry (tag
  `boundary`); a de versão antiga em cache continua fora, porque se resolve sozinha.

### Bloco 5 e operação

#### GLYX-36 — Tipos gerados atualizados
- **Categoria:** operação · **Prioridade:** P2 · **Problema:** `types/supabase.generated.ts` é de 30/07 e foi
  editado à mão · **Exige:** `types:gen` acessa produção (A3).
- **Problema:** P30 (só a parte dos tipos; código morto e CI adiados — ver §F).

#### GLYX-37 — Tela do marcador de evento
- **Categoria:** funcionalidade · **Prioridade:** P2 · **Escopo:** observado (`health_events` existe, nada grava).

#### GLYX-38 — Active scan em ambiente isolado
- **Categoria:** teste · **Prioridade:** P2 · **Dependências:** GLYX-03.

#### GLYX-39 — Aplicar em produção as migrations do lote 1
- **Categoria:** operação · **Prioridade:** P0 · **Dependências:** lote 3 · **Exige:** A2, A3.
- **Procedimento:** `docs/PLANO-IMPLEMENTACAO.md` §Implantação.

#### GLYX-40 — Pasta `PDF/` fora do caminho do `git add`
- **Categoria:** operação · **Prioridade:** P3 · **Problema:** a pasta `PDF/` (painel impresso) não está
  ignorada; o padrão do caderno é pôr material de sessão em `_local/`. · **Exige:** D12.

#### GLYX-41 — Pontos do briefing de hipertrofia
- **Categoria:** funcionalidade · **Prioridade:** P3 · **Escopo:** sugerido · **Exige:** D9.

#### GLYX-42 — Dexcom e Google Fit
- **Categoria:** operação · **Prioridade:** P3 · **Exige:** D8 e terceiros.

#### GLYX-43 — Cores cruas contra os tokens (melhoria opcional)
- **Categoria:** funcionalidade · **Prioridade:** P3 · **Escopo:** sugerido.

#### GLYX-44 — Referência entre contas em outras tabelas filhas
- **Categoria:** correção · **Prioridade:** P2 · **Escopo:** observado
- **Problema:** `exam_values.exam_id`, `health_events.medication_id` e `ai_messages.thread_id` aceitam pai
  de outra conta (mesma classe de GLYX-10).
- **Status:** não iniciada.

#### GLYX-45 — Fechar os incidentes do ambiente de 14/10
- **Categoria:** operação · **Prioridade:** P1 · **Escopo:** observado
- **Problema:** chave de serviço de produção carregada num servidor de teste local (3,5 min, só destino
  local); 25 contêineres de outros projetos ligados por ~1 min. Registro em
  [`INCIDENTES-AMBIENTE-14-10-2026.md`](INCIDENTES-AMBIENTE-14-10-2026.md).
- **Feito em 15/10:** linha do tempo e destinos reconstruídos; varredura de 1.683 arquivos sem o valor
  da chave; migrations do LX_MED e do RADAR-POLITICO sem cron nem chamada externa.
- **Critérios de aceitação:** decisão registrada sobre a troca da chave (I1); conferência dos efeitos
  externos dos outros projetos registrada (I2).
- **Status:** em andamento · **Exige:** I1, I2.

#### GLYX-46 — Guarda de destino nos testes do repositório
- **Categoria:** operação · **Prioridade:** P1 · **Escopo:** confirmado (pedido do Rivas em 15/10)
- **Problema:** P41 — valor falso só protege os nomes lembrados; ausência de um nome faz o Next carregar
  o valor de produção. E `npm run test:e2e` nesta pasta subia o app com a configuração de produção.
- **Feito em 15/10:** `lib/testes/guarda-destino.ts` (lógica da guarda testada fora do repositório);
  `vitest.config.ts` com conferência inicial e **rede bloqueada** para host fora da máquina;
  `playwright.config.ts` exigindo valor de teste para todo nome do `.env.local` e destinos locais; CI com
  Supabase em porta morta (era `https://example.supabase.co`, host externo).
- **Exceção explícita, não habilitada:** `GLYX_TESTE_HOSTS_PERMITIDOS`; não libera produção. Uso previsto
  só para um Supabase de teste hospedado no CI (GLYX-04).
- **Critérios de aceitação:** configuração com nome ausente, segredo igual ao de produção, host externo ou
  identificador de produção é recusada; conexão externa em teste unitário é recusada antes do DNS;
  conexão local funciona; suíte continua verde.
- **Status:** implementada (local) · **validada localmente**: 10 testes da guarda; 1.187 testes unitários;
  E2E 9 aprovados e 3 pulados com ambiente falso; recusa confirmada no terminal comum · CI **não
  executado** (sem push) · build não refeito.
- **Não coberto:** `npm run dev` e `npm run build` chamados à mão (uso normal de desenvolvimento).

---

## Resultado do lote 1 — 14/10/2026

**Validação local executada nesta sessão** (variáveis falsas, telemetria desligada, sem tocar produção):

| Verificação | Antes (partida) | Depois |
|---|---|---|
| `npm run lint` | 0 avisos | 0 avisos |
| `tsc --noEmit` | sem erro | sem erro |
| `npm run test` | 88 arquivos / 952 testes | **98 arquivos / 1177 testes** |
| `npm run build` | aprovado | aprovado |
| Identificador de produção no `.next` | 0 | 0 |

**Não executado:** E2E, testes SQL (sem banco de teste), nada em produção, nada em navegador. *(Testes SQL e navegador foram feitos depois, na validação integrada — seção no fim do documento.)*

*Retrato de 14/10, **antes** da validação integrada; "bloqueada" aqui quer dizer "ainda não havia banco". Estado atual na seção "Validação integrada" abaixo.*

| ID | Implementação | Validação local | Validação em teste | Produção |
|---|---|---|---|---|
| GLYX-01 | concluída | validada | — | — |
| GLYX-02 | documentos criados | revisão do Rivas pendente | — | — |
| GLYX-07 | implementada | regra TS + trava estática | bloqueada | migration não aplicada |
| GLYX-08 | implementada | validada | — | não implantada |
| GLYX-09 | implementada | parser validado; tela não | — | não implantada |
| GLYX-10 | implementada | trava estática | bloqueada | não aplicada |
| GLYX-11 | implementada | validada (unitário) | — | índice não aplicado |
| GLYX-12 | implementada | desfecho + trava estática | bloqueada | não aplicada |
| GLYX-15 | implementada | validada | exclusão real pendente | não implantada |
| GLYX-16 | implementada | validada (2500 registros) | — | não implantada |
| GLYX-17 | divergência registrada no DPIA §11 | — | — | bloqueada (D5, D6) |
| GLYX-23 | implementada | decisão + cobertura | bloqueada (refresh: E2E) | não aplicada |
| GLYX-24 | implementada | validada (unitário) | bloqueada | não aplicada |
| GLYX-25 | implementada | não validada | — | não implantada |
| GLYX-26 | implementada | payload validado | — | não implantada |

**Achados novos registrados durante a execução:**
- Alarmes críticos simultâneos se substituíam no aparelho (tag única `glyx-critical`) — tratado em GLYX-12.
- O "Já tomei" da notificação gravava sem dose prevista e sem rótulo — tratado em GLYX-11.
- Cinco consumidores de `reminder_times` geravam doses por conta própria — tratado em GLYX-08.
- `buildOverlapReport` sem chamador em produção — GLYX-13 (decisão).
- A limpeza do Storage na exclusão listava no máximo 1000 arquivos — tratado em GLYX-15.
- A regra de "seed sem on conflict" do teste de reexecução contava insert dentro de corpo de função —
  ajustada para ignorar só corpo de função (`as $tag$`), mantendo os blocos `do`.

Implantação, validação em produção e reversão: [`PLANO-IMPLEMENTACAO.md`](PLANO-IMPLEMENTACAO.md).


---

## Validação integrada — 14/10/2026

**Ambiente:** Supabase local **descartável** (CLI, diretório fora do repositório, sem vínculo com o
projeto remoto), usuários sintéticos, IA e push **simulados** por servidores locais. Nada em produção.
Detalhes e evidências por fluxo: [`PLANO-IMPLEMENTACAO.md`](PLANO-IMPLEMENTACAO.md) §3–§5.

Colunas separadas de propósito. **Validado localmente** foi executado e passou nesta máquina;
**simulado** diz qual parte externa era falsa; **pendente em produção** é o que só se prova com o app no
ar. Nenhuma linha aqui é validação em produção.

| ID | Implementado | Validado localmente | Simulado | Pendente em produção |
|---|---|---|---|---|
| GLYX-03 | ambiente descartável | 4 testes SQL rodando | — | ambiente persistente para o CI (GLYX-04) |
| GLYX-05 | scripts fora do repositório | isolamento entre contas; conta desativada em tabela, Storage, refresh e login | — | suíte versionada e no CI |
| GLYX-07 | sim | 18 casos SQL + 7 cenários; defeito reproduzido no banco antigo | — | migration; **D1–D3** |
| GLYX-08 | sim | "Doses de hoje" no navegador | — | vai com o deploy |
| GLYX-09 | sim | formulário no navegador | — | vai com o deploy; **D1** (P42) |
| GLYX-10 | sim | 3 cenários + controle negativo | — | migration |
| GLYX-11 | sim (revisto em 15/10: pedido, conflito explícito, correção com histórico, índice prospectivo) | 56 testes locais + **45 verificações em PostgreSQL 14 isolado** (concorrência real, reversão) | Auth (`auth.uid()` simulado) | PostgREST/Auth reais; Postgres 17; data de corte; "Já tomei" no aparelho |
| GLYX-12 | sim | despacho → rota → push; 503, 410; service worker no Chromium | **push** | push real; aparelho; migration |
| GLYX-15 | sim | exportar e apagar pela tela (2500 leituras sintéticas) | — | conta real; **D4** |
| GLYX-16 | sim | exportação de 2500 leituras completa | — | vai com o deploy |
| GLYX-23 | sim (+ P37) | token, Storage, refresh, login, telas; controle negativo; aviso do admin | — | migration |
| GLYX-24 | sim | concorrência 5/20; usuário não apaga; recuo com banco antigo | — | migration; **D4** e texto da tela (P39) |
| GLYX-25 | sim | rota de sugestão registra custo | **IA, push** | efeito da quebra antiga (A3); **P06/D5** |
| GLYX-26 | sim | `system` 400; queda do stream com aviso | **IA** | provedor real; P38 |

**Decisões e incidentes ainda abertos:** D1–D4 (nenhuma aprovada), D5/D6/D13 (P06), I1 e I2
(incidentes, GLYX-45), A2 (não autorizada) e A3 (consultas prontas, não executadas).

**Ensaio de implantação e reversão** (plano §4–§5): código novo + banco antigo funciona; código antigo
+ banco novo **não** (IA bloqueada, alarme reenviado); cada migration aplicada isoladamente com o código
novo funciona; o script de reversão devolve o banco ao estado anterior e o código antigo volta a
funcionar. **Reverter só o código é incompatível.**

**Corrigido nesta rodada:** P37 (aviso de falha no admin); quatro testes SQL usavam e-mails fixos que
colidiam entre execuções (agora derivados do UUID); arquivo de reversão criado em
`supabase/reversao/`. Depois das correções: lint 0 avisos, tipos sem erro, **98 arquivos / 1177 testes**.

**Não reproduzível localmente:** toque em "Já tomei" na notificação do sistema; entrega por FCM/APNs;
comportamento do alarme com o aparelho bloqueado.

**Correção (15/10):** o relatório de 14/10 disse "~2 min" para os contêineres de outros projetos; o
registro da sessão mostra **cerca de 1 minuto** (22:28:17–22:29:15).

---

## Lote D14/P45 — 15/10/2026

Direção **B** da D14 escolhida por você (preservar o histórico, proteger daqui para frente). Sem
implantação, sem exclusão, sem acesso à produção neste lote. Detalhe: [`D14-DOSES-DUPLICADAS.md`](D14-DOSES-DUPLICADAS.md) §6.

| | Situação |
|---|---|
| **Implementado (local, não commitado)** | pedido idempotente na tela e na notificação; conflito explícito com a pergunta "corrigir ou outra tomada"; correção com histórico guardado pelo banco; rótulo `adicional`; repetição idêntica antiga contada uma vez; migration prospectiva com data de corte obrigatória; reversão atualizada |
| **Validado localmente** | 50 testes novos ou reescritos (banco falso com estado, funções puras, regras estáticas) + suíte inteira: 102 arquivos, 1.226 testes; tipos e lint sem erro |
| **Validado em PostgreSQL isolado (15/10)** | 45 verificações, 0 falha, em PG 14.24 no WSL (Ubuntu-22.04), sem Docker; Auth simulado — D14 §7 |
| **Pendente de integração** | PostgREST/Auth reais, Postgres 17, aparelho |
| **Pendente de produção** | data de corte (escolha na implantação), A2, conferência depois da aplicação, "Já tomei" num aparelho real |

---

## Lote de integração da D14 — proposto em 15/10/2026 (não executado)

Caminho app → cliente Supabase → PostgREST → PostgreSQL 17 com Auth real, no Supabase local descartável
que já existe. Proposta, fluxos F1–F8, erros do PostgREST e segurança da correção:
[`INTEGRACAO-D14-PROPOSTA.md`](INTEGRACAO-D14-PROPOSTA.md). Depende de autorização para ligar o Docker.

| | Situação |
|---|---|
| **Corrigido localmente nesta etapa** | erro do banco mapeado por código + nome da restrição (outra violação não vira conflito de dose); falha de registro na tela não fica mais em silêncio (P47). Suíte: 1.239 testes, tipos e lint sem erro |
| **Pendente de integração** | F1–F8 (idempotência, pergunta de conflito, corrigir, outra tomada, segunda decisão negada, dois usuários, sessão expirada, código antes/depois da migration) e captura dos erros reais do PostgREST |
| **Decisões novas** | D15 (autor no histórico de correção), D16 (relatórios contando dose pulada, P46) |

---

## Lote D15 + D16 + integração — 15/10/2026

| | Situação |
|---|---|
| **D15 (autor da correção)** | implementado na migration não aplicada; **validado em PostgreSQL 14 isolado** — bateria inteira refeita, 50 verificações, 0 falha |
| **D16 (pulada ≠ tomada)** | implementado em 9 consumidores; **validado localmente** (14 resultados esperados explícitos; suíte final: 1.254 testes, tipos e lint sem erro) |
| **F1–F8 com PostgREST e Auth reais** | **não executados**: não existe engine de contêineres isolado; autorização mínima pedida como A4. Scripts preparados, não executados |
| **Pendente de produção** | tudo deste lote (A2 não autorizada); push no celular **não** validado |

---

## Integração D14 com A4 — 15/10/2026

| | Situação |
|---|---|
| **Testado pelo navegador com Auth e PostgREST reais** | F1–F8 em PostgreSQL 17.6 + PostgREST v14.10 + GoTrue v2.188.1, engine próprio no WSL: **22 de 23 OK** (D15 e D16 incluídas) |
| **Testado só no banco** | concorrência, corte e reversão (PostgreSQL 14, D14 §7) |
| **Simulado** | IA, push; D16 no histórico completo (unitário — página bloqueada por P48) |
| **Pendente de produção** | data de corte, A2, conferência pós-aplicação |
| **Pendente de celular e push real** | "Já tomei" no aparelho e entrega real — não validados |
| **Novo problema** | P48 (formatador de data derruba relatório completo e gráfico de glicemia), anterior ao lote |

Detalhes, prova de isolamento e erros reais do PostgREST: [`INTEGRACAO-D14-PROPOSTA.md`](INTEGRACAO-D14-PROPOSTA.md) §8.

---

## P48 corrigida — 15/10/2026 (nova execução)

O resultado da A4 continua **22/23**; esta é uma execução nova, só dos cenários afetados.

| | Situação |
|---|---|
| **P48** | causa: o helper punha estilo padrão junto com campos avulsos do chamador, o que o `Intl` recusa; corrigido no helper, com testes que falhavam antes |
| **P49 (novo, corrigido)** | relatório completo sem a marca "horário corrigido" — a consulta não lia `correcoes`; passou a `*` |
| **Testado pelo navegador com Auth e PostgREST reais** | relatório completo com remédio (200, pulada/adicional/corrigida marcadas, contagem 2) e gráfico de glicemia (datas e horas certas, sem erro): **14/14** — a pendência da A4 fechou |
| **Verificações locais** | tipos, lint e 1263 testes OK; build de teste numa cópia isolada OK |
| **Atenção** | o `.next` do repositório é saída de modo de desenvolvimento desde a A4: rodar `npm run build` antes do `npm start` |

Detalhes: [`INTEGRACAO-D14-PROPOSTA.md`](INTEGRACAO-D14-PROPOSTA.md) §9.

---

## D1–D4 aprovadas e lote completo ensaiado — 15/10/2026

| | Situação |
|---|---|
| **Decisões** | D1–D4 aprovadas pelo Rivas como regras de produto (implementação local); demais documentos não aprovados por isso — [`DECISOES-D1-D4.md`](DECISOES-D1-D4.md) |
| **Migrations** | renomeadas para a ordem de aplicação: `20261015100000` dono → `101000` dose única → `102000` conta/IA → `103000` alarmes. Corte da dose única virou parâmetro da sessão (`glyx.corte_dose_unica`); sem ele, falha e nada fica aplicado |
| **Testado pelo navegador (PG 17, PostgREST e Auth reais, build de produção)** | D1–D4 19/19 · F1–F8 com D15/D16 17/17 · F8 "antes" 6/6 · todos os estados da implantação (A, B, após cada migration, C) com código novo e antigo |
| **Testado só no banco (PG 17)** | 5 testes SQL do repositório; 4 casos de corte inválido; reversão completa com dados idênticos (hash) e reaplicação depois dela |
| **Simulado** | IA e push; a chamada banco → app foi retransmitida pelo roteiro (o WSL não alcança o Next do Windows sem mexer no firewall) |
| **Local** | tipos e lint limpos; 106 arquivos / 1297 testes; build de teste em cópia isolada |
| **Achados** | P50 (redirect pós-ação no build de produção) e P51 (edição de "livre" ativava alarme) — corrigidos; P52 (não há teto global de gasto de IA) — registrado |
| **Pendente** | produção (A2, corte), celular e push real; D13 e I1 não autorizadas |

Detalhes: [`PLANO-IMPLEMENTACAO.md`](PLANO-IMPLEMENTACAO.md) §1, §3.3, §4 e §5.

---

**Riva's Alexandre**  © 2026
Todos os direitos reservados. Lista mestra do GLYX.
