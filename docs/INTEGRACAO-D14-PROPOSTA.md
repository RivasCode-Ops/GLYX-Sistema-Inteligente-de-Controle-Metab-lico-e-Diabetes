# Lote final da D14 — app → cliente Supabase → PostgREST → PostgreSQL, com Auth real

> **Nomes das migrations mudaram em 15/10/2026** (depois do que está registrado abaixo), para a ordem de
> aplicação: `20261014121000` → `20261015100000` (dono) · `20261014122000` → `20261015101000` (dose única) ·
> `20261014123000` → `20261015102000` (conta ativa e IA) · `20261014120000` → `20261015103000` (alarmes).
> O texto histórico abaixo mantém os nomes da época. A data de corte deixou de ser escrita no arquivo: é um
> parâmetro da sessão de aplicação (`PLANO-IMPLEMENTACAO.md` §4, passo 4).


**Preparado em:** 15/10/2026 · **Situação: proposta. Nada foi instalado, ligado ou acessado** para este
documento; só inspeção de arquivos locais e duas correções de código local (§3 e §6), com testes
unitários. A bateria de PostgreSQL direto (D14 §7) está encerrada.

---

## A. Ambiente proposto

**Supabase local pela CLI, no diretório descartável que já existe** — `d:\tmp\glyx-supabase-teste`
(projeto `glyx-teste-descartavel`, portas 554xx). É a única opção que junta, sem nuvem e sem instalar nada
novo, os quatro componentes reais pedidos:

| Componente | O que roda | Origem |
|---|---|---|
| PostgreSQL | **17** (`major_version = 17` no `config.toml`; a versão exata da imagem da CLI 2.100.1 é conferida ao subir) | imagem `supabase/postgres` |
| PostgREST | real, o mesmo do Supabase hospedado | imagem da CLI |
| Auth | GoTrue real, com dois usuários sintéticos (`a@`, `b@teste.invalid`) | imagem da CLI |
| Gateway | Kong (o caminho `/rest/v1` e `/auth/v1` como na nuvem) | imagem da CLI |

Desligados no `config.toml` (já estavam ou serão): Studio, Realtime, Edge Runtime, Analytics, Storage e
Inbucket — nenhum é necessário para estes fluxos.

**Banco:** as 72 migrations antigas, já com a URL de produção trocada por `http://127.0.0.1:9` e crons
desagendados pelo `preparo.sql`; depois as de outubro **do repositório atual** (a cópia que está lá da
`20261014122000` é a de 14/10 e será substituída pela reescrita, com corte **fictício** só na cópia).

**App:** o Next do repositório, iniciado pelo `d:\tmp\glyx-harness\iniciar-next.ps1`, que já passa pela
guarda de destino (recusa subir se algo apontar para fora da máquina). IA e push ficam **simulados** pelos
servidores locais que já existem (`mock-servicos.mjs`), mas estes fluxos não chamam nenhum dos dois.
Navegador: o Playwright e o Chromium que já estão instalados.

**Sem:** projeto na nuvem, credencial de produção, dado real, chamada externa.

### Alternativas descartadas

| Opção | Por que não |
|---|---|
| WSL com PostgreSQL 17 + PostgREST + GoTrue instalados à mão | o 17 não está no repositório oficial do Ubuntu 22.04; PostgREST e GoTrue exigiriam binários e configuração novos — mais instalação, menos fidelidade |
| Projeto Supabase na nuvem (ou branch) | cria recurso externo; branch exige plano pago; um projeto gratuito novo depende de haver vaga na organização — e ainda é ambiente fora da máquina |
| Docker Engine próprio dentro do WSL | instalação nova e a CLI teria de ser configurada para outro daemon |

## B. O que já existe e o que precisa ser criado

| Já existe | Precisa |
|---|---|
| Supabase CLI 2.100.1 | — |
| `d:\tmp\glyx-supabase-teste` com `config.toml` (PG 17), 72 migrations neutralizadas e `preparo.sql` | atualizar a cópia da `20261014122000` (reescrita) com corte fictício; desligar Storage e Inbucket no `config.toml` |
| Docker Desktop instalado (desligado) | **ligar** — ver o risco em E |
| Imagens da CLI baixadas em 14/10 (provável; só se confirma com o Docker ligado) | se faltar alguma, a CLI baixa (download gratuito do registro público) |
| Harness: `iniciar-next.ps1` (com guarda de destino), simuladores de IA/push, chaves VAPID de teste, Playwright e Chromium | um script de fluxos (§D) e um coletor dos erros do PostgREST (§C) |

## C. Custos

**Nenhum.** Tudo local. O único tráfego externo possível é baixar imagens que eventualmente não estejam em
cache (gratuito, sem conta).

## D. Testes que faltam (só os fluxos; nada de repetir unitário)

Cada fluxo é **ponta a ponta**: navegador → Next (código novo) → `@supabase/ssr` → Kong → PostgREST →
PostgreSQL, com a sessão real do GoTrue. As conferências no banco usam contagens, nunca dado real.

| # | Fluxo | Como | Esperado |
|---|---|---|---|
| F1 | Reenvio / idempotência | (a) **tela:** enviar o mesmo formulário duas vezes (duplo clique e reenvio do mesmo POST da ação); (b) **notificação:** `POST /api/medications/taken` duas vezes com o mesmo pedido; (c) **PostgREST direto** com o JWT da pessoa, mesmo `client_request_id` | 1 linha; (b) 200 `registrado` e 200 `reenvio`; (c) 409 com `code` 23505 e a restrição do **pedido** |
| F2 | Conflito abre a pergunta | registrar às 08:00; recarregar a página (pedido novo); registrar às 13:00 | redireciona para `/medicacao?conflito=1…`; o cartão "Já existe uma tomada registrada nesta dose" aparece; nada gravado |
| F3 | Corrigir e preservar | no cartão, "Corrigir" | mesma linha com o novo horário; `correcoes` com o valor anterior; histórico mostra "horário corrigido"; `PATCH` direto em `correcoes` pelo PostgREST não muda nada |
| F4 | Outra tomada | no cartão, "Foi outra tomada" | linha nova `adicional`, sem dose prevista; histórico mostra "tomada adicional"; adesão do dia com 1 a mais |
| F5 | Segunda decisão negada | voltar ao mesmo cartão (mesmo pedido) e escolher a outra opção | aviso "Esta ação já foi resolvida…"; banco inalterado |
| F6 | Dois usuários autenticados | B: pelo app, registrar com o remédio de A; pelo PostgREST com o JWT de B: ler, corrigir e gravar em nome de A; usar o mesmo valor de pedido de A | app 404; leitura `[]`; correção 0 linhas; gravação 403 (`42501`); pedido igual grava normalmente (sem reenvio nem vazamento) |
| F7 | Sessão expirada | (a) notificação sem sessão; (b) `jwt_expiry` curto **só no config descartável**, sessão expirada e refresh revogado, depois clicar em "Registrar dose"; (c) PostgREST com JWT expirado | (a) 401 → o app abre `/medicacao`; (b) vai para `/login`, nada gravado; (c) 401 `PGRST301` |
| F8 | Código novo antes e depois da migration | F1–F5 com o banco **sem** a `20261014122000`; depois aplicá-la (corte fictício) e repetir | antes: correção "indisponível" com aviso, reenvio vira pergunta (o pedido não é guardado), outra tomada grava com rótulo antigo; depois: tudo como acima |

**Fora do alcance local (continua pendente):** o toque real em "Já tomei" numa notificação do sistema
operacional e a entrega por FCM/APNs.

## E. Autorizações mínimas

1. **Ligar o Docker Desktop**, com este plano de contenção: ao ficar pronto, listar os contêineres a cada
   segundo e parar qualquer um que não seja `*_glyx-teste-descartavel`. Da última vez 25 contêineres de
   outros projetos subiram por ~1 min; como foram parados com `docker stop`, os que usam `unless-stopped`
   não devem voltar — os que usam `always`, sim (hipótese). Sem esta autorização, não há como rodar o lote.
2. **`supabase start` / `stop --no-backup`** no diretório descartável (inclui baixar imagens que faltarem).
3. **Editar só o diretório descartável**: `config.toml` (Storage e Inbucket desligados; `jwt_expiry` curto
   no F7) e a cópia da migration com corte fictício.
4. **Subir o Next em modo teste** pela guarda de destino e rodar os fluxos com o Playwright.

No fim: `supabase stop --no-backup`, Docker desligado, harness preservado em `d:\tmp`.

---

## 3. Erros do PostgREST — o que o cliente recebe

O `@supabase/supabase-js` entrega `{ code, message, details, hint }`. **Não existe campo com o nome da
restrição.** O identificador estável disponível é o **nome da restrição**, que nós definimos e o
PostgreSQL põe entre aspas na `message`, confirmado pela lista de colunas em `details`.

**Corrigido localmente nesta etapa:** o código tratava **qualquer** 23505 que não fosse do pedido como
conflito de dose. Agora `restricaoViolada()` (`lib/medications/register-dose.ts`) exige **código + nome
(ou colunas)**; outra violação vira falha genérica. 7 testes novos, inclusive "violação da chave
primária não é conflito de dose".

Exemplos **esperados** (previsão de antes do teste). **Os campos reais capturados em 15/10 estão em §8** —
`details` veio nulo e o token expirado é `PGRST303`:

| Situação | `code` | `message` | `details` | `hint` | Reação na tela |
|---|---|---|---|---|---|
| mesmo pedido | `23505` | `duplicate key value violates unique constraint "medication_logs_pedido_unico"` | `Key (user_id, client_request_id)=(…, …) already exists.` | `null` | "já registrado" (nada novo) |
| mesma dose, outro pedido | `23505` | `… "medication_logs_dose_confirmada_unica"` | `Key (user_id, medication_id, scheduled_for)=(…) already exists.` | `null` | pergunta "corrigir ou outra tomada" |
| outra unicidade (ex.: chave primária) | `23505` | `… "medication_logs_pkey"` | `Key (id)=(…) already exists.` | `null` | "Não foi possível gravar o registro." |
| rótulo `adicional` em banco antigo | `23514` | `… violates check constraint "medication_logs_adherence_status_check"` | `Failing row contains (…)` **(contém dados da linha)** | `null` | grava como `fora_janela`, sem dose prevista |
| gravar em nome de outra conta | `42501` | `new row violates row-level security policy for table "medication_logs"` | `null` | `null` | genérico (o app nunca chega a isso: filtra pela própria conta) |
| coluna nova em banco antigo (insert/update) | `PGRST204` | `Could not find the 'client_request_id' column of 'medication_logs' in the schema cache` | `null` | `null` | grava sem o pedido; correção "indisponível" |
| coluna nova em banco antigo (select) | `42703` | `column medication_logs.client_request_id does not exist` | `null` | `null` | idem |
| JWT expirado | `PGRST301` | `JWT expired` | `null` | `null` | login |

Nenhum desses textos chega à tela: a interface mostra só mensagens fixas por código (`MENSAGENS_REGISTRO`).
`details` pode conter identificadores e dados da linha — **nunca** registrar em log nem enviar ao Sentry
sem sanitizar.

## 4. Segurança da correção — por inspeção

| Pergunta | Resposta | Onde |
|---|---|---|
| **Quem pode corrigir** | só o **dono** da linha: a única policy de `medication_logs` em produção é `med_logs_all_own` (A3, B4), que exige `auth.uid() = user_id` e, com a `20261014121000`, remédio do próprio dono. Admin **não** tem policy nessa tabela. Nenhuma rota com chave de serviço e nenhuma função do banco altera `medication_logs` (conferido nos 6 usos de `createAdminClient` e nas migrations). | policies; código |
| **O usuário pode alterar o histórico?** | **Não por insert nem update**: o gatilho zera `correcoes` no insert e só acrescenta no update (validado em PG: C9). **Sim, indiretamente**, apagando a linha inteira (a policy permite `delete`; é também o caminho da exclusão LGPD). | migration `20261014122000` |
| **Como o autor é registrado** | **não é registrado explicitamente.** Cada entrada guarda `em` (data) e `pedido`; o autor é **inferido** — só o dono consegue alterar. Um update feito com chave de serviço ou por superusuário também gera entrada, sem dizer quem foi. **Proposta (D15, não implementada):** o gatilho gravar `por = auth.uid()` e o papel (`authenticated`/`service_role`). Exige refazer os cenários de correção no PostgreSQL. | — |
| **Como aparece nos relatórios** | relatório médico, histórico completo e adesão leem **só o valor atual** (`taken_at` corrigido); o original fica em `correcoes`, que entra na **exportação de dados** (que lê todas as colunas). O histórico da tela marca "horário corrigido", sem mostrar o horário anterior. O relatório médico não indica que houve correção. | `lib/audit/medical-report.ts`, `lib/reports/full-history.ts`, `lib/privacy/export.ts` |
| **Correção que muda a janela** | o rótulo e a dose prevista são recalculados pelo novo horário; se a dose de destino já tiver **outra** tomada, a correção é recusada com motivo (app) e, na corrida, pelo índice (PG: C5). A dose de origem fica vazia e passa a contar como não tomada. | `registrarDose`; D14 §7 |

## 6. Achados desta inspeção

- **Corrigido localmente — falha silenciosa na tela (P47).** O botão "Registrar dose" descartava o erro
  da ação: falha de gravação ou sessão expirada no clique não mostravam nada. Agora a sessão expirada leva
  ao login e qualquer outra falha volta com o motivo (código fechado). Validação ponta a ponta: F7.
- **Registrado, não corrigido — relatórios contam "Pulei hoje" como tomada (P46).** O relatório médico
  (`buildMedicalReportData`) e o histórico completo leem `medication_logs` sem filtrar `confirmed`; uma dose
  marcada como pulada entra como tomada na adesão do relatório. Anterior a este lote; corrigir muda número
  de relatório clínico — **depende da sua decisão**.

---

## 7. Lote autorizado em 15/10 — o que foi feito e o que parou

### D15 — autor das correções (implementado, validado em PostgreSQL isolado)

- **Onde:** gatilho da migration `20261014122000` (não aplicada). Cada entrada de `correcoes` ganhou
  `por` = `auth.uid()` e `papel` = papel do token validado pelo PostgREST (`request.jwt.*`), com recuo para
  o usuário do banco.
- **Origem da identidade:** o token assinado e verificado pelo PostgREST — nunca coluna enviada pelo
  navegador (o gatilho ignora o que vier em `correcoes`).
- **Sem identidade** (chave de serviço, migração, superusuário): `por` fica **nulo** e `papel` diz quem
  fez. Nenhum autor é inventado; entradas anteriores não recebem autor.
- **Imutável:** o usuário não reescreve nem apaga entradas por insert/update (validado).
- **Testes:** regra estática nova; cenário SQL 6b (correção como `authenticated` registra o próprio
  usuário) e checagem no cenário 5 (superusuário → autor nulo, papel `postgres`); C11 com três
  verificações. Bateria inteira refeita: **50 verificações, 0 falha**.

### D16 — "Pulei hoje" não é tomada (implementado, validado localmente)

Estados separados: **tomada** (registro confirmado), **pulada** ("Pulei hoje"), **pendente** (vencida sem
registro), **adicional** (tomada a mais, rótulo próprio), **correção** (mesma linha, horário corrigido).
Fórmula da adesão inalterada (tomadas ÷ doses previstas vencidas); quantidade tomada e adesão continuam
números distintos. Nenhum registro histórico foi alterado — só a leitura.

| Onde contava pulada como tomada | Agora |
|---|---|
| Doses de hoje (`resumirDosesDoDia`, cartão) | estado `pulada`, etiqueta "pulada"; não conta como tomada; não é "a próxima a tomar"; entra como vencida na adesão do dia |
| Contador por remédio da tela de medicamentos | só tomadas (com e sem horário) |
| Cartão "Agora" (`card-agora`) | mesmo estado `pulada` (lê `confirmed`) |
| Relatório médico | `loggedDoses` só tomadas; coluna nova "Marcadas como puladas" (`skippedDoses`) |
| Histórico completo | puladas e adicionais listadas com marcação; total = só tomadas, sem repetição idêntica |
| Linha do tempo | "Dose pulada" / "Tomada adicional" / "Dose tomada" |
| Auditoria metabólica e resumo semanal | contam só tomadas |
| Contexto da IA (doses em 7 dias) e análise de platô | contam só tomadas |

Não mexido: o recibo de contexto conta registros de remédio removido (não é contador de tomada); cálculo
de bolus e qualquer meta clínica.

**Testes:** `lib/medications/d16-puladas.test.ts` com 14 resultados esperados explícitos (estado de cada
dose, adesão do período, Doses de hoje, contador da tela, histórico completo); 4 testes antigos de adesão
passaram a declarar `skippedDoses: 0`. Suíte final do lote (com a regra estática da D15): 103 arquivos, 1.254 testes, tipos e lint sem erro.

### Ambiente de integração — PARADO, à espera de autorização

Inspeção (só leitura): **não existe** nesta máquina mecanismo de contêineres separado do Docker Desktop —
nem Podman, Rancher, nerdctl, nem engine dentro do WSL. O Docker Desktop **não** pode ser ligado sem
religar os contêineres de outros projetos que têm reinício automático, a não ser alterando a política
deles — o que não foi autorizado. Por isso F1–F8 **não foram executados**.

**Autorização mínima necessária (A4):**

1. Instalar na distribuição `Ubuntu-22.04` (a mesma do teste de PostgreSQL) o pacote **`docker.io`** do
   repositório oficial do Ubuntu (29.1.3), com início automático **desligado** (`systemctl disable`). É um
   engine **próprio**, com dados em `/var/lib/docker` dessa distribuição, **vazio**: os contêineres dos
   outros projetos vivem no Docker Desktop e não existem nele. O script para se encontrar qualquer
   contêiner que não seja do teste.
2. Baixar a **CLI do Supabase 2.100.1 para Linux** (release oficial no GitHub) para `/opt/glyx-teste/bin` —
   a do Windows usaria o Docker Desktop.
3. Baixar as imagens oficiais do Supabase no engine próprio (~2–3 GB no disco virtual do WSL; já autorizado).

Custo: nenhum. O Docker Desktop continua desligado o tempo todo.

**Preparado e não executado:** `d:\tmp\glyx-supabase-teste\wsl-isolado\instalar.sh`, `subir.sh` (prova de
isolamento antes de subir; fases `antes` e `depois` da migration; corte fictício só na cópia) e `descer.sh`;
`d:\tmp\glyx-harness\integracao-d14.mjs` (F1–F8 e captura sanitizada dos erros do PostgREST — sintaxe
conferida, não executado); `iniciar-next.ps1` lendo as chaves locais do arquivo gerado no WSL; migrations de
outubro atualizadas na pasta descartável; caixa de e-mail de teste desligada no `config.toml` (o Storage
continua ligado: as migrations antigas criam buckets).

---

## 8. Execução com A4 — 15/10/2026 (resultados reais)

### Prova de isolamento

| Verificação | Resultado |
|---|---|
| Distribuição | `WSL_DISTRO_NAME=Ubuntu-22.04`, Ubuntu 22.04.5, sem `/home` de usuário (não é a sua `Ubuntu`) |
| Integração com o Docker Desktop | nenhuma: a configuração dele não declara integração (o padrão integra só a distribuição padrão, `Ubuntu`); na `Ubuntu-22.04` não existiam `/usr/bin/docker`, `/var/run/docker.sock` nem `/mnt/wsl/docker-desktop*`; `DOCKER_HOST` e contexto vazios |
| Daemon usado | `/usr/bin/dockerd` desta distribuição (pid próprio), dono do socket `/var/run/docker.sock`; `docker info`: sistema **"Ubuntu 22.04.5 LTS"** (o do Docker Desktop se identifica como "Docker Desktop"), raiz `/var/lib/docker`, 0 contêineres e 0 imagens antes da subida; o script **para** se o sistema for "Docker Desktop" ou houver contêiner que não seja do teste |
| Cliente | sempre `/usr/bin/docker` com socket explícito — o `docker` do PATH é o executável do Windows |
| Docker Desktop | desligado o tempo todo |
| Rede | portas de teste escutam no Windows só em `127.0.0.1`/`::1` (WSL em NAT, encaminhamento só para o próprio computador) |

**Instalado (repositório oficial do Ubuntu, sem atualização geral):** `docker.io` 29.1.3-0ubuntu3~22.04.2,
`containerd` 2.2.1-0ubuntu1~22.04.2, `runc` 1.3.4-0ubuntu1~22.04.1 — início automático **desligado**
(um `policy-rc.d` temporário impediu o daemon de ligar durante a instalação e foi removido); grupo `docker`
sem membros. **CLI Supabase 2.100.1** (release oficial) em `/opt/glyx-teste/bin`, conferida pelo
`checksums.txt` oficial (`supabase_2.100.1_linux_amd64.tar.gz: OK`).

**Stack:** PostgreSQL **17.6** (`supabase/postgres:17.6.1.106`), PostgREST **v14.10**, GoTrue **v2.188.1**,
Kong 2.8.1, Storage; demais serviços excluídos; 0 cron ativo; IA e push simulados por servidores locais;
dois usuários sintéticos; chaves locais de demonstração.

### Resultado de F1–F8 — testado pelo navegador com Auth e PostgREST reais

| Fluxo | Antes da migration (F8) | Depois da migration |
|---|---|---|
| **F1** reenvio | notificação 2× com o mesmo pedido: 1 tomada, a 2ª vira pergunta (409) — o banco ainda não guarda o pedido | notificação 2×: `registrado` + `reenvio`, 1 tomada; **tela**: reenvio real da requisição da ação (mesmo pedido) → 1 tomada; PostgREST direto → 409 `23505` `medication_logs_pedido_unico` |
| **F2** conflito | pergunta certa ("Já existe uma tomada…", Corrigir / Foi outra tomada), nada gravado | idem |
| **F3** corrigir | aviso "correção ainda não está disponível", nada sobrescrito | mesma linha; histórico com o valor anterior; **autor = usuário autenticado, papel `authenticated`** (D15); PATCH direto não reescreve histórico, autor nem `created_at`; tela marca "horário corrigido" |
| **F4** outra tomada | linha própria sem dose prevista, rótulo antigo `fora_janela` | rótulo `adicional`; tela marca "tomada adicional" |
| **F5** segunda decisão | — | recusada: "Esta ação já foi resolvida antes…", banco inalterado |
| **F6** dois usuários | app 404 no remédio alheio; leitura 0; correção 0; gravação em nome do outro 403 | idem; mesmo valor de pedido em outra conta grava normalmente (201) |
| **F7** sessão expirada | notificação sem sessão 401; JWT vencido (assinado com o segredo **local**) 401 `PGRST303`; sessão do navegador com token vencido e refresh inválido → tela vai para `/login` sem gravar | idem |
| **F8** antes × depois | coberto pelas duas colunas | — |
| **UI** outra violação de unicidade | — | não abre a pergunta; mostra "Não foi possível gravar o registro." |
| **UI** falha de gravação | — | aparece na tela (antes ficava em silêncio — P47) |
| **D16** Doses de hoje | — | dose "Pulei hoje" aparece como **pulada**, não como tomada |
| **D16** histórico completo | — | **não verificado no navegador**: a página dá erro 500 por um defeito anterior (P48); validado só por teste unitário |

**Total: 22 de 23 verificações aprovadas** (antes 6/6; depois 16/17). A não aprovada é a do histórico
completo, bloqueada por P48 — não por D16.

### Erros reais do PostgREST (campos recebidos, sanitizados)

| Caso | status | `code` | `message` | `details` | `hint` | Reação da interface |
|---|---|---|---|---|---|---|
| mesmo pedido | 409 | `23505` | `duplicate key value violates unique constraint "medication_logs_pedido_unico"` | **null** | null | "já registrado" |
| mesma dose, outro pedido | 409 | `23505` | `… "medication_logs_dose_confirmada_unica"` | **null** | null | pergunta "corrigir ou outra tomada" |
| chave primária repetida | 409 | `23505` | `… "medication_logs_pkey"` | null | null | falha genérica (comprovado pela tela com outra unicidade) |
| rótulo inválido / `adicional` em banco antigo | 400 | `23514` | `new row for relation "medication_logs" violates check constraint "medication_logs_adherence_status_check"` | null | null | em banco antigo: grava como `fora_janela` |
| gravar em nome de outra conta | 403 | `42501` | `new row violates row-level security policy for table "medication_logs"` | null | null | — (o app nunca chega a isso) |
| coluna nova em banco antigo (insert) | 400 | `PGRST204` | `Could not find the 'client_request_id' column of 'medication_logs' in the schema cache` | null | null | grava sem pedido |
| coluna nova em banco antigo (select) | 400 | `42703` | `column medication_logs.client_request_id does not exist` | null | null | correção "indisponível" |
| JWT expirado | 401 | **`PGRST303`** | `JWT expired` | null | null | login |

**Correções em relação à previsão de §3:** o PostgREST real devolve `details` **nulo** (não traz a lista de
colunas), então o identificador estável efetivo é o **nome da restrição na `message`** — que é o que o
código usa primeiro; e o token expirado vem como `PGRST303`, não `PGRST301`.

### Defeitos encontrados

| | Situação |
|---|---|
| **P48 (novo, anterior a este lote)** — `formatarDataHora` sempre define `dateStyle`/`timeStyle`; quem passa também `day`/`month`/`hour` faz o JavaScript lançar `TypeError: Invalid option`. Afeta, desde o commit `03939f1` (já na `main`), o **relatório completo** de quem tem remédio cadastrado (erro 500) e o **gráfico de tendência da glicemia** (`components/glicemia/glucose-trend-chart.tsx`) | **registrado, não corrigido** (fora do lote); correção pequena no próprio helper; provavelmente afeta produção |
| Roteiro de teste: seleção de botão e duplo envio | corrigidos no próprio roteiro antes de rodar (botão "Registrar dose" pelo nome; reenvio real da requisição em vez de dois cliques que o React poderia descartar) |
| Script de encerramento chamava `docker` pelo PATH (Windows) | corrigido; conferência com `/usr/bin/docker` |
| Nome dos arquivos da CLI (checksum só do tarball versionado) | corrigido no instalador |

Nenhuma proteção foi removida para um teste passar. Nenhum defeito do código do lote apareceu nesta etapa.

### Categorias de evidência

| | |
|---|---|
| **Testado pelo navegador com Auth e PostgREST reais** | F1–F8; erro e falha na tela; D16 em Doses de hoje |
| **Testado só no banco** | concorrência com duas conexões e 20 clientes; corte e reversão (PostgreSQL 14, D14 §7) |
| **Simulado** | IA e push (servidores locais); D16 no histórico completo (unitário, por causa de P48) |
| **Pendente de produção** | data de corte, aplicação, conferência; A2 não autorizada |
| **Pendente de celular e push real** | toque em "Já tomei" no aparelho; entrega por FCM/APNs — **não validados** |

### Encerramento

Stack descartável destruída (`supabase stop --no-backup`): **0 contêineres, 0 volumes, 0 redes** do teste.
Engine próprio parado, socket removido, sem início automático. Ficam em `/var/lib/docker` da `Ubuntu-22.04`
5 imagens oficiais (3,2 GB), reaproveitáveis. Docker Desktop nunca foi ligado; WSL não foi desligado.
Scripts e evidências sanitizadas em `_local/teste-integracao-d14-2026-10-15/`.

---

## 9. P48 corrigida e cenário pendente da A4 — 15/10/2026 (nova execução)

O resultado histórico da A4 (§8, **22 de 23**) não muda. Esta é uma execução nova, só dos cenários
afetados, no mesmo ambiente isolado.

### Causa da P48

`formatarDataHora` (`lib/time/format.ts`) sempre punha `dateStyle: "short"` e `timeStyle: "short"` e só
depois espalhava as opções do chamador. O `Intl` **recusa** estilo junto com campo avulso (`day`, `month`,
`hour`…): `TypeError: Invalid option`. O relatório completo (`fmtDateTime`, 12 usos) e o gráfico de
tendência da glicemia passam campos avulsos — por isso o erro 500.

**Correção (no helper, sem mudar chamadores):** quando o chamador escolhe algum campo avulso, o formato é o
dele e os estilos padrão não entram. Fuso, idioma `pt-BR` e o formato curto de quem não passa opções ficam
iguais. Entrada inválida continua aparecendo como `Invalid Date`, como antes — nenhuma data inventada nem
texto vazio. Testes (`lib/time/format.test.ts`): a combinação que quebrava, os formatos do relatório e do
gráfico, só fuso, sem opções, estilo pedido pelo chamador e entrada inválida. Os dois testes do relatório e
do gráfico **falharam antes** da correção com o mesmo `TypeError`.

Consumidores: `formatarDataHora` é usado em 14 arquivos; só o relatório completo e o gráfico passam campos
avulsos. Os demais passam nada ou só `timeZone` e seguem com o formato de antes. `formatarData` e
`formatarHora` não usam estilos e não mudaram.

### Defeito novo achado no navegador (P49) — corrigido

Com a página de pé, o relatório mostrava `08:25` sem a marca **"horário corrigido"**. A regra da marca
existia, mas a consulta do relatório (`lib/reports/full-history.ts`) não pedia a coluna `correcoes`.
Nomear a coluna derrubaria o relatório inteiro num banco anterior à migration (`42703`); por isso a consulta
passou a `*`, a mesma solução da tela de medicação. Teste de regressão em `d16-puladas.test.ts` (falhou antes
da correção). Defeito do próprio lote D16 — não existia na `main`.

### Verificação no navegador — 14 de 14

PostgreSQL 17.6, PostgREST v14.10 e GoTrue v2.188.1 reais, engine próprio da `Ubuntu-22.04`, migration com
corte fictício; aplicação servida por **build de teste numa cópia isolada** do código. Usuário e dados
sintéticos: uma tomada corrigida de 08:10 para 08:25, uma adicional às 12:00, uma dose das 20:00 marcada
como pulada e três glicemias.

| Verificação | Resultado |
|---|---|
| Relatório completo com remédio cadastrado | **200** (antes: 500) |
| Linha do dia | `08:25 Remédio P48 (horário corrigido) · 12:00 Remédio P48 (tomada adicional) · 20:00 Remédio P48 (pulada)` |
| Contagem da seção | **2** — a pulada não conta como tomada |
| Data de geração | `Gerado em 15/10/2026, 11:52 pelo app GLYX`; nenhum `Invalid Date` |
| Gráfico de tendência | página 200; eixo `14 de out., 08:00` · `12:30` · `19:45` (fuso de São Paulo); dica do ponto do meio `14 de out., 12:30` |
| Erros de JavaScript no navegador | nenhum (o único aviso, "Invalid Sentry Dsn", vem do valor falso que o roteiro de teste injeta) |
| Erro no servidor | nenhum `TypeError` no log |

**O cenário que faltava da A4 — D16 no histórico completo — passou.** Não foi repetida a bateria de banco:
as mudanças são de formatação e da lista de colunas lidas.

O caso "banco antes da migration" do relatório não foi aberto no navegador: `*` não nomeia coluna, então não
há o que falhar; está coberto pelo teste estático.

### Build

`next build` numa **cópia isolada** (`d:\tmp\glyx-copia-p48`, sem `.env.local`, só variáveis de teste,
guarda de destino aprovada): **passou**. O `.next` do repositório não recebeu build; só o cache do ESLint
(`.next/cache/eslint`) foi atualizado pelo `npm run lint`. **Atenção:** esse `.next` já não tinha
`BUILD_ID` antes desta etapa — é saída do modo de desenvolvimento que rodou na pasta durante a A4. O
`npm start` precisa de `npm run build` antes de voltar a funcionar.

### Ambiente

Mesmas provas de isolamento da A4 (sistema "Ubuntu 22.04.5 LTS", raiz `/var/lib/docker`, nenhum contêiner
alheio; Docker Desktop desligado). Um tropeço: o encaminhador de portas do Docker (`docker-proxy`) morreu
quando a sessão do WSL que subiu a stack terminou; reiniciar só os contêineres descartáveis o recriou
(`religar-portas.sh`). Outro, meu: o `descer.sh` foi salvo com quebra de linha do Windows e a primeira
tentativa de encerramento falhou; corrigido, a stack foi removida em seguida (`encerrar.sh`).

Encerramento: **0 contêineres, 0 volumes, 0 redes**; engine parado, socket removido, sem início automático;
5 imagens (3,2 GB) mantidas; cópia isolada apagada. Evidências sanitizadas em
`_local/teste-p48-2026-10-15/`.

---

**Riva's Alexandre**  © 2026
Todos os direitos reservados. Proposta do lote final de integração da D14.
