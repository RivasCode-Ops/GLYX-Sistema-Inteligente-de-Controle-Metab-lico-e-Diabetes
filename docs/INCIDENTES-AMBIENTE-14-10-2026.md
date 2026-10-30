# Incidentes do ambiente de teste — 14/10/2026

**Registrado em:** 15/10/2026 · **Contexto:** validação integrada do lote 1 em Supabase local
descartável ([`PLANO-IMPLEMENTACAO.md`](PLANO-IMPLEMENTACAO.md) §3). Horários em hora de Brasília
(UTC−3), tirados do registro da sessão. Este documento separa **evidência** (algo que foi visto em log,
saída de comando ou arquivo) de **hipótese** (algo plausível que não foi comprovado nem descartado).

Nenhum dos dois incidentes envolveu dado clínico real nem chamada à produção que tenha sido observada.
Os dois estão **abertos** até você decidir os itens marcados como "decisão".

---

## 1. Chave de serviço de produção carregada num servidor de teste

### O que aconteceu

Para testar "admin sem chave de serviço", o script de teste **apagou** a variável
`SUPABASE_SERVICE_ROLE_KEY` do processo. O Next completa a partir do `.env.local` toda variável que
**falta** no processo, e por isso subiu com a chave **de produção**. O servidor de teste ficou no ar de
**23:56 a 23:59** (cerca de 3,5 min) e foi encerrado quando o erro foi percebido.

### Categoria da credencial

Chave **secreta de API do Supabase de produção, no formato novo** (`sb_secret_…`, conferido em 15/10
pelo prefixo, sem exibir o valor), usada no lugar da antiga service role. Age como service role: **ignora
todas as policies de RLS**, lê e escreve qualquer tabela, administra usuários do Auth. É a credencial
mais sensível do app. O valor não aparece neste documento nem em nenhum outro arquivo gerado na
validação. (A chave pública do app continua no formato antigo, JWT.)

### Destinos configurados no processo

| Variável | Valor no servidor de teste | Fonte |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:55421` (Supabase local descartável) | definida pelo script |
| `SUPABASE_SERVICE_ROLE_KEY` | **produção** | carregada do `.env.local` |
| demais 15 nomes do `.env.local` | valores de teste | definidos pelo script |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | inválidos de propósito (Sentry desligado) | definidos pelo script |
| telemetria do Next | desligada | `NEXT_TELEMETRY_DISABLED=1` |

O cliente com service role (`lib/supabase/admin.ts`) monta o endereço **só** a partir de
`NEXT_PUBLIC_SUPABASE_URL`. Ou seja: a chave só podia ser enviada ao Supabase **local**.

### Evidências disponíveis

- **Log do servidor** (`d:\tmp\glyx-harness\next-novo-sem-chave.log`): as únicas rotas chamadas foram
  `/api/auth/ping`, `/login`, `/dashboard`, `/icon`, `/api/cgm/health`, `/admin` e **um** `POST /admin`
  (a desativação). Nenhuma rota de cron (`/api/push/dispatch`, `/api/meals/suggest-dispatch`,
  `/api/cgm/sync-dispatch`), que são as outras que usam a chave.
- **Resultado do teste:** a tela voltou com `?erro=falha_banir` e o usuário sintético ficou
  **sem** banimento no Auth local. É o que se espera quando o Auth local recebe um JWT assinado por outro
  segredo e o recusa.
- **Erro do servidor** (`next-novo-sem-chave.err.log`): só "Invalid Sentry Dsn" — confirma que o Sentry
  não enviou nada.
- **Varredura de arquivos (15/10):** o valor completo da chave e os últimos 24 caracteres foram
  procurados em **1.683 arquivos (1,5 GB)**: cache de build `.next` do repositório, `docs/`,
  `supabase/`, `PDF/`, `public/`, todos os logs e scripts da validação (`d:\tmp\glyx-harness`,
  `d:\tmp\glyx-supabase-teste`, arquivos soltos de `d:\tmp`), os registros das sessões e a pasta de
  rascunho. **Nenhuma ocorrência.** O script comparou bytes e imprimiu só contagens.

### Presença em logs ou artefatos

| Lugar | Situação |
|---|---|
| Logs do Next e do teste | **sem a chave** (varridos) |
| Cache de build `.next` | **sem a chave** (varrido); variável de servidor não entra no bundle |
| Registros das sessões | **sem a chave** (varridos) |
| Logs do Kong e do Auth **locais** (contêineres) | **não verificáveis**: o ambiente descartável foi destruído em 15/10 (`supabase stop --no-backup`), com volumes. Por padrão, esses logs registram caminho e status, não o cabeçalho `Authorization` — mas isso é hipótese, não foi conferido antes da destruição |
| Disco da máquina virtual do Docker Desktop | **não verificável** sem ligar o Docker; pode conter blocos de dados de volumes apagados |
| Memória e arquivo de paginação do Windows | **não verificável** |

### Limites do que foi possível comprovar

- **Comprovado:** a configuração apontava só para endereço local; o log mostra uma única operação que
  usa a chave; nenhum arquivo em disco guardou o valor.
- **Não comprovado:** que nenhum componente local registrou o cabeçalho antes da destruição; e que a
  chave não saiu da máquina por outro caminho (não havia captura de tráfego de rede). Não há, porém,
  nenhuma evidência de envio para fora: nenhum endereço externo estava configurado para essa chave.

### Decisão (sua)

**Trocar ou não a chave de serviço de produção (I1).** Risco residual baixo: só componentes locais,
já destruídos, poderiam ter visto o valor. Como a chave é do **formato novo**, a troca é independente:
cria-se uma chave secreta nova, troca-se na Vercel, publica-se e só então revoga-se a antiga — **sem**
mexer na chave pública nem derrubar sessões. Plano completo, com dependências e riscos, em
[`PROXIMAS-AUTORIZACOES.md`](PROXIMAS-AUTORIZACOES.md) §C. A troca exige autorização própria e um deploy.

### Proteção adicionada

1. **Regra no script de teste:** para simular ausência, valor falso inválido — nunca apagar o nome.
2. **Guarda de destino** (`d:\tmp\glyx-harness\guarda-destino.mjs`), chamada **antes** de subir o
   servidor de teste (`iniciar-next.ps1`) e antes de lint, testes e build (`validar.ps1`). Ela
   **interrompe** (saída 3, nada roda) quando:
   - um nome do `.env.local` **falta** no processo — o Next carregaria o valor de produção;
   - um segredo ou destino tem valor **igual** ao do `.env.local` (comparado por hash, sem imprimir);
   - uma variável de destino (URL, BASE, DSN, SITE, WEBHOOK, ENDPOINT, HOST) aponta para host **fora da
     lista permitida**: `127.0.0.1`, `localhost`, `::1`, `host.docker.internal`;
   - qualquer variável contém o identificador do projeto ou o domínio de produção;
   - há JWT de projeto hospedado (campo `ref`) ou de emissor diferente do local de demonstração.

   **Testada em 15/10:** aprovou a configuração de teste e barrou os cinco desvios — chave removida (o
   incidente), URL de Supabase hospedado, IA apontando para provedor real, JWT de projeto hospedado e
   variável extra com o domínio de produção. A suíte inteira (1.177 testes) rodou com a guarda ativa.

### No repositório (GLYX-46, implementada em 15/10)

| Onde | O que faz |
|---|---|
| `lib/testes/guarda-destino.ts` | mesma lógica da guarda testada, em TypeScript; lista local de hosts por padrão |
| `vitest.config.ts` → `lib/testes/setup-global.ts` | antes de qualquer teste unitário, recusa configuração com destino fora da máquina ou com identificador de produção |
| `vitest.config.ts` → `lib/testes/rede-bloqueada.ts` | durante os testes unitários, **toda conexão TCP/TLS para host fora da lista é recusada antes da resolução de DNS** |
| `playwright.config.ts` | confere o ambiente que será entregue ao servidor de teste, **exigindo** valor de teste para todo nome do `.env.local`; vale também quando o servidor já está no ar (`reuseExistingServer`) |
| `.github/workflows/ci.yml` | a URL do Supabase do CI era `https://example.supabase.co` — host **externo** de verdade; passou a `http://127.0.0.1:9` (porta morta) |

**Exceção explícita, não habilitada:** `GLYX_TESTE_HOSTS_PERMITIDOS` (hosts separados por vírgula).
Nenhum arquivo do repositório a define. Mesmo definida, não libera o identificador nem o domínio de
produção. Único uso previsto: um Supabase de **teste** hospedado para o E2E do CI (GLYX-04), se você
optar por ele em vez de banco local.

**Verificado em 15/10:** 10 testes da guarda (incluindo o caso do incidente e o bloqueio de rede);
`npx playwright test --list` **recusado** no terminal comum (antes, `npm run test:e2e` nesta pasta subia
o app com a configuração de produção) e aceito com ambiente de teste completo; suíte E2E completa com
ambiente falso e Supabase em porta morta: 9 aprovados, 3 pulados (exigem conta real, como antes);
1.187 testes unitários; lint e tipos sem erro. O build não foi refeito (refazer sobrescreveria o `.next`
local com valores falsos).

**Não coberto:** `npm run dev` e `npm run build` chamados à mão continuam lendo o `.env.local` — é o uso
normal de desenvolvimento, não teste.

### Por que valor falso não basta, e o que se propôs (histórico de 15/10, antes da implementação)

Valor falso protege só os nomes que alguém lembrou de preencher. Basta um nome novo no `.env.local`,
um script que esquece um nome ou uma ferramenta que lê o arquivo por conta própria. Proposta, em
camadas (**não implementada no repositório**; implementar é decisão sua):

| Camada | O que faz | Por que |
|---|---|---|
| 1. Pasta sem `.env.local` | Teste de servidor, E2E e build de verificação rodam numa cópia de trabalho (`git worktree`) que **não tem** `.env.local`. A guarda recusa se o arquivo existir na pasta do teste. | Remove a fonte: não há o que carregar por engano. |
| 2. Lista permitida de destinos | A guarda acima vira `scripts/guarda-destino.mjs`, chamada por `globalSetup` do Vitest, pelo `webServer` do Playwright e pelo CI. | Para o teste **antes** de qualquer requisição. |
| 3. Trava no próprio app em modo teste | Com `GLYX_MODO_TESTE=1`, `lib/env.ts` recusa iniciar se `NEXT_PUBLIC_SUPABASE_URL` ou a URL da IA não estiverem na lista. | Pega também quem sobe o app sem passar pelo script. |

---

## 2. Contêineres de outros projetos iniciados junto com o Docker

### O que aconteceu

Para criar o Supabase descartável, o Docker Desktop foi ligado às 22:26. Quando o serviço ficou pronto
(22:28:43), **25 contêineres de outros projetos** estavam rodando havia 7 a 26 segundos — sobem sozinhos
junto com o Docker. Foram parados com `docker stop` (encerramento normal), concluído às **22:29:15**.

**Intervalo aproximado: de 22:28:17 a 22:29:15, cerca de 1 minuto** (corrige o "~2 min" do relatório
anterior, que foi estimado de memória).

### Contêineres observados rodando — e todos parados

| Projeto | Contêineres |
|---|---|
| Supabase local LX_MED | `supabase_db_LX_MED`, `supabase_rest_LX_MED`, `supabase_inbucket_LX_MED`, `supabase_auth_LX_MED`, `supabase_kong_LX_MED` |
| Supabase local RADAR-POLITICO | `supabase_db_RADAR-POLITICO`, `supabase_rest_RADAR-POLITICO`, `supabase_auth_RADAR-POLITICO`, `supabase_kong_RADAR-POLITICO` |
| central-email | `central-email-app`, `central-email-nginx`, `central-email-postgres`, `central-email-redis` |
| local (pilha compartilhada) | `local-evolution-api`, `local-n8n`, `local-postgres`, `local-redis`, `local-ollama` |
| automacaozap | `automacaozap-evolution-manager-1`, `automacaozap-evolution-api-1`, `automacaozap-evolution-db-1`, `automacaozap-evolution-redis-1`, `automacaozap-n8n-1` |
| spartan-sfx | `spartan-sfx-core`, `spartan-sfx-valkey` |

Os outros 31 contêineres listados estavam parados (alguns havia meses) e continuaram parados. No fim da
validação (15/10, 00:17) não havia nenhum contêiner rodando, e o Docker Desktop foi desligado.

### Evidência × hipótese

| | |
|---|---|
| **Evidência** | Os 25 estavam no ar às 22:28:43 (saída de `docker ps`); todos foram parados até 22:29:15 (saída de `docker stop` e lista vazia em seguida); nenhum volume foi apagado; nenhum contêiner desses projetos foi religado depois. |
| **Hipótese — não comprovada nem descartada** | Que algum deles tenha agido para fora nesse minuto: **n8n** (duas instâncias) executando fluxo agendado ou reprocessando gatilho; **Evolution API** (duas instâncias) reconectando sessão do WhatsApp e entregando mensagem ou webhook pendente; **central-email** processando fila de envio. O Ollama é local e não tem efeito externo. Para os Supabase LX_MED e RADAR-POLITICO a hipótese ficou **fraca** pela leitura das migrations (item 4 abaixo). |
| **Hipótese — causa** | Política de reinício (`restart: always` / `unless-stopped`) nesses contêineres. Não foi inspecionada. |

### Como verificar sem religar nada

Pelos efeitos externos, entre **22:28 e 22:30 de 14/10** (01:28–01:30 UTC de 15/10):

1. **WhatsApp:** nos aparelhos ligados às instâncias da Evolution API, procurar mensagem enviada nesse
   intervalo e o horário de "conectado" da sessão.
2. **E-mail:** pasta de enviados das contas usadas pelo central-email e, se houver, o painel do provedor
   de envio (SMTP) filtrado pelo intervalo.
3. **n8n:** nos serviços que os fluxos acionam (planilhas, mensageiros, APIs), histórico de alteração ou
   log de acesso no intervalo.
4. **Supabase local LX_MED e RADAR-POLITICO — feito em 15/10, por leitura de arquivo:** as migrations
   de `RADAR-POLITICO/supabase` e de `LX MED/supabase` (e das três cópias de trabalho `lxmed-wt-*`)
   têm **zero** `cron.schedule` e **zero** `net.http_*`. Pelas migrations, esses bancos não chamam
   endereço externo. Resta a hipótese, fraca, de um cron criado à mão dentro do banco local, fora das
   migrations.
5. **Histórico interno do n8n e logs dos contêineres** só podem ser lidos com o Docker ligado. Isso exige
   nova autorização e deve ser feito **sem rede** (`docker run --network none` sobre o volume, ou subir
   só o banco do n8n sem os serviços).

**Prevenção proposta:** antes de ligar o Docker para teste, conferir a política de reinício dos
contêineres de outros projetos (`docker update --restart=no`) **com autorização**, ou usar um contexto
Docker separado para testes.

---

**Riva's Alexandre**  © 2026
Todos os direitos reservados. Registro dos incidentes da validação de 14/10.
