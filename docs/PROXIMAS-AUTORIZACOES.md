# Próximas autorizações — A3, pausa da sugestão (D13) e troca da chave (I1)

**Preparado em:** 15/10/2026 · **Nada aqui foi executado.** Em 15/10 você **não** autorizou A2, A3, D13
nem a troca da chave. Cada bloco abaixo é independente e exige a sua frase de autorização para aquele
bloco. Nenhum valor de segredo aparece neste documento.

---

## A. Escopo exato das leituras A3

**Arquivo:** [`supabase/consultas/a3-pre-implantacao.sql`](../supabase/consultas/a3-pre-implantacao.sql) —
fora de `supabase/migrations`, nunca aplicado pela CLI.

**Onde e como:** SQL Editor do projeto Supabase de produção, um bloco por vez, dentro de
`begin transaction read only` (qualquer escrita falha em vez de acontecer), com limite de 15 s por
consulta. Resultado salvo em `d:\tmp\a3-AAAA-MM-DD\`, fora do repositório.

| Bloco | Lê | Devolve | Para se |
|---|---|---|---|
| B0 | `supabase_migrations.schema_migrations` | nome do banco, versão do Postgres, total de migrations, última versão, quantas de 20261014 | não for o banco esperado, ou houver migration de 20261014 aplicada |
| B1 | definição de `dispatch_med_alarms` | tamanho, hash, 3 marcadores, e o **texto da função** (código, não dado) | — (se diferir, o script de reversão é atualizado antes da implantação) |
| B2 | `medication_logs` | número de grupos duplicados, linhas excedentes, maior repetição, data mais antiga e mais recente | houver duplicata |
| B3 | `push_dispatch_log`, `net._http_response`, `cron.job`, `cron.job_run_details` | contagens por tipo, por código HTTP e por job/desfecho; nome, agenda e ativo dos jobs, **sem** o comando | — (é a linha de base) |
| B4 | catálogo do banco, `vault.secrets` (**só nomes**), `storage.buckets`, `pg_policies` | o que falta ou conflita com as 4 migrations; nomes e tipo das policies atuais (sem o SQL delas); contagem de fusos e horários inválidos | houver falta ou conflito |
| B5 | `medications`, `ai_usage` | contagem de remédios ativos com horário por frequência × rigidez; volume de uso de IA na última 1 h e 24 h; nº de contas com uso | — (informa D1–D4) |
| B6 | `cron.job`, `push_dispatch_log` | se o job `glyx-meal-suggest` existe e está ativo; sugestões por dia nos últimos 14 dias | — (informa D5/D13) |

**Não lê:** conteúdo de nenhum registro clínico, nome de remédio, e-mail, id de usuário, valor de
segredo do Vault, conteúdo de conversa com a IA.
**Não faz:** nenhuma escrita, nenhuma migration, nenhuma mudança de cron ou de chave.

---

## B. Pausar a sugestão automática (D13), se a A3 mostrar que está ativa

**Pré-condição:** B6 da A3 mostrar `glyx-meal-suggest` com `active = true`. Se não existir ou já estiver
inativo, nada a fazer.

**Antes:** avisar você e a Thuany que as sugestões de refeição param até a decisão D5.

**Ação (uma linha, no SQL Editor de produção):**
```sql
select cron.alter_job(jobid, active := false) from cron.job where jobname = 'glyx-meal-suggest';
```
Desativa o job sem apagá-lo: agenda e comando ficam guardados.

**Conferência:**
```sql
select jobname, active from cron.job where jobname = 'glyx-meal-suggest';      -- active = false
-- depois de 30 min: nenhuma sugestão nova
select count(*) from push_dispatch_log where kind = 'meal_suggest' and created_at > now() - interval '30 minutes';  -- 0
```

**Para voltar:**
```sql
select cron.alter_job(jobid, active := true) from cron.job where jobname = 'glyx-meal-suggest';
```

**O que muda:** nenhuma sugestão de refeição chega e nada sai para a IA por esse caminho. **Não muda:**
alarmes de remédio, dica diária, água, sensor parado, sincronização do sensor.
**Risco conhecido:** a migration de origem (`20260713220000`) agenda o job de novo se o banco for recriado
do zero. Isso não acontece em produção; anotar na decisão D5.

---

## C. Troca da chave secreta do Supabase (I1)

**Tipo da chave, conferido em 15/10 só pelo formato:** chave secreta de API **no formato novo**
(`sb_secret_…`), guardada em `SUPABASE_SERVICE_ROLE_KEY`. A chave pública do app (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
é do formato antigo (JWT) e **não** entra nesta troca.

Consequência: a troca é **independente** — não exige trocar o segredo JWT do projeto, não invalida a chave
pública e não derruba sessões. As chaves antigas (JWT) precisam continuar habilitadas no projeto, porque
o app ainda usa a chave pública antiga.

### Quem depende da chave

| Onde | Uso | Conferido em |
|---|---|---|
| Vercel — variável `SUPABASE_SERVICE_ROLE_KEY` | produção (e preview, se existir) | a conferir no painel da Vercel |
| Código **em produção hoje** (commit no ar **desconhecido** daqui — provavelmente `1e53d23`, o último do GitHub; o `535e2bc` local nunca foi enviado) | cadastro por convite (`/api/auth/register`), troca de senha (`app/actions/password.ts`), **sincronização do sensor a cada 15 min** (`/api/cgm/sync-dispatch`) | repositório |
| Código do lote 1 (não implantado) | soma: banimento no admin, confirmação dos alarmes, custo da sugestão | repositório |
| `.env.local` desta máquina | desenvolvimento local | arquivo local |
| `scripts/check-prod-ready.ps1`, `scripts/sync-env-from-process.mjs` | só conferem o **nome** | repositório |
| Vault, funções do banco, CI do GitHub | **não usam** (os crons usam outro segredo, `cgm_cron_secret`) | repositório |
| Serviços fora deste repositório (n8n, outros apps) | **desconhecido** — você confirma | — |

### Passos, na ordem

1. **[produção — painel Supabase]** Criar uma **nova** chave secreta (Configurações → API Keys → Secret
   keys), com nome que indique a data. A antiga continua valendo.
2. **[produção — painel Vercel]** Substituir o valor de `SUPABASE_SERVICE_ROLE_KEY` (marcado como
   sensível) nos ambientes em que existir.
3. **[produção — deploy]** Variável nova só vale em deploy novo. Fazer **redeploy do deploy atual de
   produção** (o deploy que estiver no ar, pelo painel — qualquer que seja o commit dele), **não** de um commit novo — o lote 1 não está commitado e não
   pode ir junto.
4. **[produção — verificação]** Na próxima execução do `glyx-cgm-sync` (até 15 min): sem erro de
   autenticação nos logs da Vercel para `/api/cgm/sync-dispatch`; leituras novas do sensor chegando
   (contagem, não valores).
5. **[local]** Trocar o valor no `.env.local` desta máquina.
6. **[produção — painel Supabase]** Só depois de 4 confirmado: **revogar** a chave antiga.
7. **[produção — verificação]** Repetir 4 depois da revogação.

### Riscos

| Risco | Efeito | Como evitar |
|---|---|---|
| Revogar antes do redeploy | sensor para de sincronizar, cadastro e troca de senha quebram | ordem acima: revogar por último |
| Redeploy de commit errado | publica código não autorizado | redeploy do deploy atual, pelo painel |
| Outro serviço usando a chave antiga | para de funcionar ao revogar | confirmar a lista "desconhecido" antes do passo 6 |
| Valor copiado com espaço ou quebra de linha | erro 401 em tudo que usa a chave | conferência do passo 4 antes de revogar |

**Para voltar:** enquanto a antiga não foi revogada, basta repor o valor antigo na Vercel e fazer
redeploy. Depois de revogada, não há volta: gera-se outra.

---

**Riva's Alexandre**  © 2026
Todos os direitos reservados. Autorizações pendentes do GLYX, preparadas e não executadas.
