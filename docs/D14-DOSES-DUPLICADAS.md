# D14 — doses duplicadas que bloqueiam o índice de dose única

> **Nomes das migrations mudaram em 15/10/2026** (depois do que está registrado abaixo), para a ordem de
> aplicação: `20261014121000` → `20261015100000` (dono) · `20261014122000` → `20261015101000` (dose única) ·
> `20261014123000` → `20261015102000` (conta ativa e IA) · `20261014120000` → `20261015103000` (alarmes).
> O texto histórico abaixo mantém os nomes da época. A data de corte deixou de ser escrita no arquivo: é um
> parâmetro da sessão de aplicação (`PLANO-IMPLEMENTACAO.md` §4, passo 4).


**Preparado em:** 15/10/2026 · **Situação:** para decisão. **Nenhum registro foi apagado ou alterado**,
nenhuma migration aplicada. A leitura em produção foi somente leitura (`transaction_read_only = on`),
restrita aos 11 grupos, com campos técnicos e sem identificadores. Grupos anonimizados como G01–G11.

## 1. A chave de unicidade

**Regra exata** (migration `20261014122000` e consulta B2 da A3):

```
unique (user_id, medication_id, scheduled_for)  where confirmed and scheduled_for is not null
```

Uma "duplicata" é: mesma pessoa, mesmo item, **mesma dose prevista** (`scheduled_for`), ambas confirmadas
("tomei", não "pulei").

**Como `scheduled_for` nasce** — isso é o que importa: ninguém o digita. O app o **deriva** no momento do
registro, encaixando o horário da tomada (`taken_at`) numa janela de horário cadastrado
(`lib/medications/adherence-status.ts` e `doseWindows` em `lib/medications/adherence.ts`):

- a janela começa **1 hora antes** do horário cadastrado;
- termina no **próximo horário do mesmo item**, ou no fim do dia, se for o último.

Consequência: duas tomadas quaisquer dentro da mesma janela recebem a **mesma** dose prevista. Num item
de uma dose por dia, qualquer registro do dia, da 1 h antes até a meia-noite, cai na mesma chave.

### O que a chave pode confundir

| Caso | A chave confunde? | Por quê |
|---|---|---|
| **Dose extra** legítima no mesmo período (meia dose, repetição orientada) | **Sim** | cai na mesma janela; a chave não sabe que é outra tomada |
| **Registro retroativo** (horário informado no passado) | **Sim** | "registrei às 08:00 que tomei às 08:00" e depois "registrei que tomei às 13:00" ficam na mesma dose |
| **Correção** de horário | **Sim** | o app não edita registro; corrigir é registrar de novo, e o novo cai na mesma chave |
| **Toque repetido** (o caso que a chave quer pegar) | sim, corretamente | mesmo instante ou instantes a segundos |
| **Adiar (snooze)** | não diretamente | adiar não grava em `medication_logs`; o "Registrei" depois do adiamento usa o mesmo registro e só colide se já houver outro na janela |
| **Horários cadastrados mudando** | não nos antigos | `scheduled_for` é gravado no registro; mudar o horário depois não muda a chave das linhas antigas |
| **Fuso** | improvável aqui | `scheduled_for` é um instante absoluto (UTC). Os 11 grupos têm a **mesma** dose prevista ao segundo, e nenhum fuso inválido existe (A3, B4) |
| **"Já tomei" pela notificação (código em produção)** | **não aparece** | o código em produção grava esse caminho **sem** `scheduled_for`; toques repetidos por ele não entram nesta chave — podem existir duplicatas que a A3 **não** contou |

**Conclusão:** chave igual **não prova** registro repetido. Prova só que os registros disputam a mesma dose
prevista.

## 2. Classificação dos 11 grupos

Leitura restrita aos 11 grupos (1 conta, 2 itens, todos `med`, rigidez `rigido`). Campos usados: horário da
tomada em relação à dose prevista, horário de criação em relação à primeira linha do grupo, distância
entre criação e tomada (registro retroativo), rótulo de adesão. **Nenhuma outra tabela referencia
`medication_logs`** (sem chave estrangeira apontando para ela).

**Critério de "redundância comprovada":** linhas com **todos** os campos do registro iguais (item, dose
prevista, horário da tomada **idêntico ao segundo**, rótulo). Nesse caso, a linha a mais **não guarda
nenhuma informação** que a outra não guarde. Isso não prova o que a pessoa fez — só que o banco tem a
mesma afirmação repetida. Linhas com horário de tomada diferente são **ambíguas**: podem ser toque
repetido, correção ou tomada a mais.

| Grupo | Dia | Linhas | O que coincide | O que difere | Classificação | Justificativa |
|---|---|---|---|---|---|---|
| G02 | 08/09 | 2 | tudo, inclusive o horário da tomada | criadas com 12 s de diferença | **comprovada** (1 a mais) | mesmo horário informado (retroativo, ~5 h depois) enviado duas vezes |
| G04 | 09/09 | 2 | tudo | 9 s | **comprovada** (1) | idem |
| G08 | 17/09 | 2 | tudo | 7 s | **comprovada** (1) | idem |
| G11 | 03/10 | 3 | tudo | até 24 s | **comprovada** (2) | idem, três envios |
| G01 | 08/09 | 5 | item e dose prevista | **dois horários de tomada**: 1 linha na hora prevista (registrada 1 h depois) e 4 linhas idênticas 5 h depois (criadas ~7 h após a primeira, em 141 s) | **mista**: 3 comprovadas + **1 ambígua** | as 4 idênticas são o mesmo envio repetido; as 2 versões (hora prevista × 5 h depois) podem ser correção ou duas tomadas |
| G03 | 09/09 | 3 | item e dose prevista | 1 linha na hora prevista (retroativa ~9 h) + 2 idênticas 5 h depois (em 11 s) | **mista**: 1 comprovada + **1 ambígua** | idem |
| G05 | 14/09 | 4 | item e dose prevista | 1 linha na hora prevista + 3 idênticas 5 h depois (a 2ª aos 16 s, a 3ª e a 4ª ~1 h 46 depois) | **mista**: 2 comprovadas + **1 ambígua** | as 3 idênticas guardam a mesma afirmação, mesmo reenviada horas depois |
| G10 | 03/10 | 5 | item e dose prevista | 1 linha na hora prevista + 4 idênticas 5 h depois (em 33 s) | **mista**: 3 comprovadas + **1 ambígua** | idem G01 |
| G06 | 15/09 | 2 | item, dose prevista, rótulo | horário da tomada difere **6 s**; registro em tempo real | **ambígua** (1) | quase certamente dois toques, mas o horário não é idêntico; pelo critério, não comprovada |
| G09 | 24/09 | 2 | idem | difere **7 s**, tempo real | **ambígua** (1) | idem |
| G07 | 15/09 | 3 | item e dose prevista | 2 registros em tempo real ~3 h depois da hora prevista (a segundos um do outro) + 1 retroativo **na** hora prevista, 22 s depois | **ambígua** (2) | duas versões do horário da mesma dose, registradas em sequência |

**Totais:** 22 linhas a mais = **14 comprovadas** (informação repetida) + **8 ambíguas** (horários
diferentes). Nenhuma conclusão sobre erro da pessoa: o padrão mais comum — registrar "na hora prevista" e,
segundos depois, registrar outro horário — é também o que se espera de quem **corrige** o horário num app
que não permite editar.

### Reprodução com dados sintéticos (15/10)

Teste temporário com um banco falso em memória, contra a lógica de registro do **lote 1**
(`lib/medications/register-dose.ts`), sem nenhum dado real. Os 5 cenários passaram:

| Padrão | Resultado com o código do lote 1 |
|---|---|
| G02/G04/G08/G11 — mesmo horário reenviado | 1 linha; o reenvio vira "já registrado" ✔ |
| G06/G09 — dois toques em tempo real, 6 s | 1 linha ✔ |
| G01/G03/G05/G10 — "na hora prevista" e depois **outro horário** | **o segundo registro é descartado** — o horário real (ou a tomada a mais) não fica em lugar nenhum |
| G07 — tempo real e depois retroativo | **o retroativo é descartado** |
| Dois toques **simultâneos** | 2 linhas — só o índice do banco impede a corrida |

**Achado (P45):** o lote 1 resolve o toque repetido, mas descarta em silêncio o registro com horário
diferente, o que contraria a regra do próprio app ("registro nunca é recusado"). Isso precisa ser
decidido junto com D14, **antes** da implantação.

## 3. Alternativas

| | **A. Deduplicar com cópia recuperável** | **B. Proteção daqui para frente** | **C. Adiar a migration do índice** |
|---|---|---|---|
| O que é | copiar as linhas a mais para uma tabela de quarentena e apagá-las; depois criar o índice | índice parcial que vale só para registros **criados a partir de uma data de corte**; os antigos ficam como estão | implantar as outras três migrations e deixar o índice para depois |
| Integridade do histórico | altera dado clínico; as **8 ambíguas** exigem escolher qual versão fica — sem você dizer, seria palpite | **nada muda** no histórico | nada muda |
| Relatórios e adesão | a adesão não muda (cada janela já conta uma tomada só); o relatório deixa de mostrar até 22 "doses fora de janela" falsas | a adesão não muda; os 22 continuam aparecendo como "fora de janela/extras" no relatório de 08/09 a 03/10 | igual a B |
| Idempotência e concorrência | protegido | protegido para registros novos | **sem proteção contra corrida** (dois toques simultâneos); a checagem do app cobre o caso sequencial |
| Registro retroativo | protegido | registro novo para uma dose antiga: a checagem do app pega; o índice não (a linha antiga não está nele) | só a checagem do app |
| Implantação | exige escrita em produção antes da migration (autorização própria) | migration ajustada (predicado e pré-checagem com a data de corte); sem escrita em dado | a mais simples; as outras três são independentes do índice (nenhuma o referencia; o código trata o erro 23505, mas não depende dele) |
| Reversão | apagar o índice; devolver as linhas da quarentena | apagar o índice (o script atual já faz `drop index if exists`) | nada a reverter |

**Recomendação: B**, com duas condições:

1. **Corrigir P45 antes de implantar.** *(Texto de 15/10 revisto no mesmo dia: a primeira versão propunha
   gravar o segundo registro automaticamente como avulso; isso foi descartado.)* O conflito vira
   **pergunta explícita** — corrigir aquela tomada ou registrar outra — e o reenvio da mesma ação é
   reconhecido pelo pedido, não pelo horário. Ver §6.
2. **Data de corte pelo momento da criação** (`created_at`), não pela dose prevista: assim um registro
   retroativo feito depois da implantação também fica protegido entre os novos.

A **opção A** pode ser feita depois, só para as **14 comprovadas**, se você quiser limpar o relatório —
com cópia, autorização própria e sem tocar nas 8 ambíguas. **C** é o recuo se B atrasar.

## 4. O que ainda não foi testado

A parte SQL de B (índice parcial com data de corte, pré-checagem ajustada, reversão) **não foi testada**:
não há Postgres nesta máquina fora do Docker, e o PGlite exigiria instalação. Precisa de uma das duas
autorizações abaixo.

## 5. Ações que dependiam da sua aprovação (situação em 15/10: ver §6)

1. **Escolher a opção de D14** (recomendada: B com as duas condições).
2. **Autorizar a mudança local** de código e migration (P45 + índice com data de corte), sem implantação.
3. **Autorizar um banco local para o teste SQL**, uma de duas:
   - ligar o Docker de novo, sabendo que 25 contêineres de outros projetos sobem junto por ~1 min antes de
     serem parados (incidente de 14/10); ou
   - instalar o PGlite (Postgres em processo, sem Docker) só na pasta de rascunho, sem alterar o
     `package.json` do projeto.
4. **Opcional, depois:** deduplicar só as 14 comprovadas (opção A parcial), com cópia — escrita em
   produção, autorização própria.

## 6. Direção escolhida (15/10): B — e o que foi implementado localmente

Você escolheu a **direção B** (preservar o histórico, proteger daqui para frente). Isso **não** autoriza
implantação nem exclusão. Implementado só no código local, não commitado.

### Três operações, três tratamentos

| Operação | Como o app reconhece | O que acontece |
|---|---|---|
| **Reenvio da mesma ação** (duplo toque, retry, formulário enviado de novo) | mesmo **pedido**: UUID gerado quando a tela ou a notificação aparece — não o horário | devolve "já registrado"; nenhuma linha nova |
| **Correção** de uma tomada registrada | a pessoa escolhe "corrigir" na pergunta de conflito | a linha muda; o banco guarda instante, dose prevista, rótulo e confirmação anteriores em `correcoes`, com data e pedido |
| **Outra tomada** | a pessoa escolhe "foi outra tomada" | linha nova, rótulo `adicional`, sem dose prevista |
| Já existe tomada na dose e o pedido é **outro** | — | **conflito explícito**: nada é gravado e a pessoa decide. Horário diferente **não** é tratado como tomada adicional automaticamente |

- **Tela:** a pergunta aparece em `/medicacao`: "Já existe uma tomada registrada nesta dose… às HH:MM. Você
  pediu para registrar às HH:MM. Nada foi gravado ainda — o que aconteceu?", com os botões "Corrigir: a
  tomada das HH:MM foi às HH:MM", "Foi outra tomada às HH:MM" e "Cancelar".
- **Notificação:** uma notificação não pode perguntar. A rota responde 409, e o aparelho mostra "Já existe
  uma tomada registrada… Nada foi gravado agora. Toque para dizer se é correção ou outra tomada", que abre
  a mesma pergunta no app.
- **A janela de adesão não é identidade:** ela só serve para saber se a dose já tem tomada. Quem diz se é a
  mesma ação é o pedido; quem diz se é correção ou outra tomada é a pessoa.

### Proteção prospectiva (migration `20261014122000`, reescrita)

| Pergunta | Resposta |
|---|---|
| **Como a data de corte é definida** | No commit de implantação: o arquivo traz `'DEFINIR_NA_IMPLANTACAO'` e **para com erro** se não for trocado. Recomendação: um instante logo **depois** de o código novo estar no ar (ele já impede repetição, então não deve haver repetição criada depois). Aceita só de 15/10/2026 até o dia seguinte à aplicação. **Nenhuma data foi escolhida.** |
| **Registros retroativos** | O corte é pela **criação** (`created_at`), não pela data da tomada: um registro de uma dose antiga feito depois do corte entra no índice. Se a dose antiga já tem uma linha anterior ao corte, o índice não a vê — quem pega é a checagem do app, que pergunta. |
| **O cliente pode enviar ou alterar `created_at`?** | **Hoje sim** (o PostgREST aceita qualquer coluna no insert). Com a migration, o gatilho `medication_logs_protege_historico` força `created_at = now()` no insert e mantém o valor antigo no update. |
| **Como impedir o contorno** | O gatilho acima (sem ele, bastaria enviar uma data antiga). O mesmo gatilho impede que o cliente escreva o histórico de correção ou troque o pedido e o dono da linha. |
| **Antigos e novos na mesma janela** | Antigo não entra no índice. Novo numa dose que já tem antigo: o app pergunta (corrigir a antiga ou outra tomada). Corrigir uma linha antiga é permitido e registra histórico. |
| **Conflito com o índice parcial** | Erro 23505. O código lê o nome da restrição: no índice do **pedido**, é reenvio (devolve "já registrado"); no índice da **dose**, vira **conflito** explícito com as tomadas existentes. Nunca sucesso silencioso. |
| **Implantar** | Código primeiro (funciona sem a migration: não guarda pedido, e a correção fica **indisponível**, com aviso, em vez de sobrescrever sem histórico); depois a migration com a data de corte definida. |
| **Reverter** | `supabase/reversao/20261014_reverter_lote1.sql` apaga os dois índices e o gatilho; **mantém** as colunas e o rótulo `adicional`, que guardam pedidos e correções já feitos. Banco primeiro, código depois. |

Nenhum registro existente é apagado ou alterado pela migration (teste estático confere: sem `delete`
nem `update` em `medication_logs`).

### Testes executados (15/10, locais, dados sintéticos)

| O quê | Como | Resultado |
|---|---|---|
| Regra de registro (19 casos) | banco falso **com estado**, que imita índices, gatilho e banco antigo | aprovado |
| Caminho da **tela** (5 casos) | ação do servidor real, com o banco falso | aprovado |
| Caminho da **notificação** (5 casos) | rota real, com o banco falso | aprovado |
| Pedidos **simultâneos** (mesmo pedido; pedidos diferentes) | duas chamadas intercaladas no mesmo processo | uma tomada + reenvio; uma tomada + conflito explícito |
| Número de tomadas, adesão por janela, correção, tomada adicional, histórico e relatório (12 casos) | funções puras | aprovado; repetição idêntica antiga conta uma vez; adicional aparece como "a mais" |
| Migration (9 regras estáticas) | leitura do SQL | aprovado |
| Suíte inteira | `npm run test`, `tsc`, `lint` com a guarda de destino | 102 arquivos, 1.226 testes, sem erro |

**Limite:** o banco falso imita a corrida dentro de um processo. **Não** é evidência de concorrência entre
sessões do Postgres.

### Pendente de banco real de teste

- `supabase/tests/dose_unica_prospectiva.sql` (8 cenários: `created_at` do cliente ignorado; segunda tomada
  na dose recusada; outra tomada aceita; pedido repetido recusado; correção com histórico; histórico não
  editável; linhas anteriores ao corte convivem; apagar o medicamento ainda anula a referência) — **escrito,
  não executado**.
- **Concorrência entre sessões:** abrir duas sessões `psql`, começar transação nas duas, inserir a mesma
  dose (e depois o mesmo pedido) nas duas, confirmar as duas: a segunda tem de falhar com
  `unique_violation`. Repetir com `pgbench` e 20 clientes para o mesmo pedido.
- A migration aplicada de verdade (o predicado do índice com a data de corte, o gatilho em convivência com
  a policy de dono do lote 1).

### Ambiente de teste — opções, nenhuma executada

| Opção | Isolamento | Limitações | Exige |
|---|---|---|---|
| **Postgres no WSL** (`Ubuntu-22.04` já existe, parado; separado do Docker Desktop) — **recomendada** | não liga o Docker nem os contêineres dos outros projetos | sem `pg_cron`, `pg_net` e Vault do Supabase: o teste usa só as tabelas e o `auth.users` mínimo; antes, conferir se a distribuição sobe algum serviço sozinha | **instalação** (`apt install postgresql`) — autorização |
| Docker Desktop de novo | o Supabase local completo | da última vez, 25 contêineres de outros projetos subiram por ~1 min. Como foram parados com `docker stop`, os que usam `unless-stopped` **não** devem voltar; os que usam `always`, sim (hipótese; a política não foi lida). Plano: ligar, listar em seguida e parar qualquer um que não seja do teste | autorização para ligar |
| PGlite (Postgres compilado para rodar dentro do Node) | não liga nada | **uma conexão só, dentro do processo**: não testa concorrência entre sessões; sem extensões do Supabase; serve para gatilho, índice e constraint | **instalação** (pacote npm, só na pasta de rascunho) — autorização |

## 7. Validação em PostgreSQL real e isolado (WSL, 15/10/2026)

### Ambiente

| | |
|---|---|
| Distribuição | `Ubuntu-22.04` do WSL (estava parada; sem projetos, sem pasta de usuário, nenhum serviço próprio, nenhuma porta além do DNS interno). A distribuição `Ubuntu` (sua, com `/home/rivas`, sudo com senha) **não** foi usada. Docker **não** foi ligado. |
| Versão | **PostgreSQL 14.24** (repositório oficial do Ubuntu 22.04). Produção usa **17.6**; o 17 não existe no repositório oficial desta distribuição. O que a migration usa (gatilho, índice único parcial, jsonb, `gen_random_uuid`, `is distinct from` em linha) se comporta igual nas duas — **limitação registrada**, não comprovada no 17. |
| Instância | dedicada, criada à mão (`initdb`) em `/var/tmp/glyx-pg-teste`, **sem TCP** (só socket local na própria pasta), porta lógica 55499, sem início automático, banco `glyx_teste`; parada e apagada no fim. |
| Simulado | papéis `anon`/`authenticated`, `auth.users` mínimo e `auth.uid()` lendo o claim `sub` como o PostgREST; `medications`, `medication_logs` e `medication_snoozes` mínimos (colunas conferidas na A3). **Real:** a policy de dono `20261014121000` e a migration `20261014122000` do repositório (cópia com corte fictício). |
| Não existe neste teste | PostgREST, Auth, Storage, pg_cron, pg_net, Vault, push, IA. **Isto não valida** Auth, Storage, PostgREST nem push. |
| Dados | só sintéticos (usuários `a@`/`b@teste.invalid`, remédios fictícios). |

### Resultados — 45 verificações (fase 1: 9; fase 2: 8; fase 3: 19; fase 4: 9), 0 falha depois das correções abaixo

| Fase | O que | Resultado |
|---|---|---|
| 1 | histórico antigo com doses repetidas; intervalo deploy→migration | migration **sem corte** para com mensagem e não aplica nada; com **repetição criada depois do corte** para inteira (sem gatilho, sem coluna); com corte fictício e histórico repetido **cria o índice**; gravação feita **durante** a migration espera ~2,6 s pelo fim e entra depois, com o `created_at` forjado ignorado |
| 2 | os 8 cenários de `supabase/tests/dose_unica_prospectiva.sql` | **8 OK** |
| 3 | duas conexões reais (uma segura a transação 2 s) | mesmo pedido simultâneo → 1 linha, a segunda recebe violação do índice do **pedido**; **20 clientes** com o mesmo pedido (pgbench) → 1 linha, 19 recusados; pedidos diferentes na mesma dose → 1 linha, violação **nomeada** do índice da **dose**; duas correções concorrentes → **2 entradas** de histórico, na ordem, nenhuma perdida; falha no meio da correção → rollback, nada muda; correção × registro na mesma dose de destino → um vence, o outro recebe conflito nomeado; tomada adicional → linha própria, sem dose prevista, reenvio recusado; antigo + novo após o corte → um novo aceito, o segundo recusado; retroativo criado após o corte → protegido; `created_at`, histórico, pedido e dono **não aceitam** valor do cliente; isolamento (papel `authenticated`): A não lê, não acha pelo pedido, não corrige e não grava registro de B, nem usa o remédio de B; o mesmo valor de pedido em contas diferentes não conflita nem vaza |
| 4 | reversão (bloco 3 de `supabase/reversao/20261014_reverter_lote1.sql`) | índices e gatilho saem; **17 linhas, 3 entradas de histórico e 5 pedidos preservados**; código antigo volta a gravar como antes; rótulo `adicional` continua aceito; reaplicar com repetição criada no intervalo **para** sem deixar nada pela metade |

### Falhas encontradas e corrigidas neste escopo

1. **Mesmo pedido virando as duas decisões (código).** A pergunta de conflito reaproveita o pedido do envio
   original nas duas respostas. Escolher "outra tomada" e depois voltar e escolher "corrigir" faria as duas
   coisas. Corrigido em `lib/medications/register-dose.ts`: um pedido já usado para criar **ou** para corrigir
   é reenvio só se for a mesma decisão; a outra é recusada com motivo (`acao_ja_resolvida`). 5 testes novos
   do ciclo do pedido na regra e 1 na rota da notificação; suíte inteira: 1.232 testes.
2. **Esquema simulado incompleto (teste).** A policy real de dono também cobre `medication_snoozes`; a tabela
   mínima foi acrescentada à simulação.
3. **Leitura de saída no script (teste).** O `psql` 14 só imprime o último comando de um `-c`, e o teste de
   isolamento lia o `commit`. Corrigido no script; a verificação crua mostrou 0/0/0 linhas de B visíveis,
   achadas pelo pedido e alteradas. Nenhuma proteção foi removida para um teste passar.

### Ciclo do identificador (código + testes unitários)

| Pergunta | Resposta |
|---|---|
| Retry mantém o identificador? | Tela: o pedido nasce quando a página é desenhada e vai num campo oculto — reenviar o formulário manda o mesmo. Notificação: nasce quando a notificação aparece e fica nos dados dela — tocar de novo ou o navegador repetir manda o mesmo. |
| Ação nova recebe outro? | Sim: cada desenho da tela e cada notificação geram um novo. |
| "Corrigir" e "Foi outra tomada" × envio inicial | Usam o pedido do envio inicial, que **não gravou nada** (deu conflito); um pedido só pode ter **uma** decisão (falha 1 acima). |
| Reabrir a tela ou a notificação | Pedido novo → se a dose já tem tomada, vira **pergunta**, não duplicata. |
| Pedido alheio | Toda consulta do pedido é filtrada pela própria conta; o índice é por usuário; no banco real, a policy impede ler, achar ou corrigir registro de outra conta. |

### Pacotes e configuração que ficaram na `Ubuntu-22.04`

`postgresql-14`, `postgresql-client-14` (14.24), `postgresql-common`, `postgresql-client-common` (238),
`libpq5`, `libllvm14`, `libjson-perl`, `libxslt1.1`, `ssl-cert`. Arquivo
`/etc/postgresql-common/createcluster.conf` com `create_main_cluster = false` (impede o pacote de criar e
ligar uma instância padrão). Nenhuma instância registrada, nenhuma porta aberta. Para remover tudo:
`apt-get purge postgresql-14 postgresql-client-14 postgresql-common postgresql-client-common` e apagar esse arquivo
— não feito sem pedido.

Scripts reproduzíveis: `_local/teste-postgres-wsl-2026-10-15/` (fora do git).

---

**Riva's Alexandre**  © 2026
Todos os direitos reservados. Preparação da decisão D14.
