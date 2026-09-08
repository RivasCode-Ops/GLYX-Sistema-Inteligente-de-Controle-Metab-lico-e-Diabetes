# Produção — checklist GLYX

Passo a passo para fechar o critério de beta do [ROADMAP](../ROADMAP.md).  
Validação local/automatizada: `npm run check:prod`

## 1. Secrets na Vercel (ou host)

Defina **todas** as variáveis obrigatórias (ver `.env.example`):

| Variável | Obrigatória | Notas |
|----------|-------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | sim | Projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim | Pública |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Só servidor; cadastro + cron CGM |
| `SIGNUP_INVITE_CODE` | sim | Sem isto o register retorna 503 |
| `CRON_SECRET` | sim | Igual ao header nas funções SQL `pg_cron` |
| `CGM_CREDENTIALS_SECRET` | sim (forte) | **Diferente** do `CRON_SECRET` |
| `KIMI_API_KEY` | sim (se IA) | Chave da API oficial Moonshot; somente servidor. **Provedor padrão** |
| `AI_PROVIDER` | opcional | `anthropic` \| `kimi` \| `openai`. **Trocar de provedor exige esta variável**: adicionar `ANTHROPIC_API_KEY` ao ambiente NÃO troca o modelo sozinho |
| `AI_MODEL` | opcional | Padrão por provedor (`kimi-k2.6` no Kimi) |
| `AI_BASE_URL` | opcional | Só para proxy (ex.: OpenRouter). `OPENAI_BASE_URL` segue aceito como nome legado |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | opcional | Provedores alternativos, só ativos por `AI_PROVIDER` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | sim (push) | `npx web-push generate-vapid-keys` |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | recomendado | Mesmo valor |
| `NEXT_PUBLIC_SITE_URL` | recomendado | Domínio público (Dexcom redirect) |
| `OPS_ALERT_WEBHOOK_URL` | opcional | Slack/Discord para falhas de cron |
| `DEXCOM_*` | opcional | Só se for usar Dexcom |
| `GOOGLE_FIT_CLIENT_ID` / `GOOGLE_FIT_CLIENT_SECRET` / `GOOGLE_FIT_REDIRECT_URI` | opcional | Só se for usar Google Fit — ver passo a passo abaixo |

Nunca exponha `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` ou `CGM_CREDENTIALS_SECRET` no cliente.

### 1.1 Google Fit (OAuth) — passo a passo

Traz passos/sono/FC de relógios que sincronizam com o Google Fit (ex.: Amazfit via app Zepp).
**Risco conhecido**: o Google vem descontinuando a Fitness REST API — se o passo 4 falhar
mostrando "API indisponível", é sinal de que não aceita mais projetos novos.

1. Acesse [console.cloud.google.com](https://console.cloud.google.com/) e crie um projeto (ou use um existente).
2. Em **APIs e serviços → Biblioteca**, procure "Fitness API" e clique em **Ativar**.
3. Em **APIs e serviços → Tela de consentimento OAuth**: tipo "Externo", preencha nome do app e e-mail; em modo de teste, adicione seu e-mail como usuário de teste (evita precisar de verificação do Google pra uso pessoal).
4. Em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**: tipo "Aplicativo da Web"; em "URIs de redirecionamento autorizados" adicione `https://SEU-DOMINIO/api/health/google-fit/callback` (e `http://localhost:3000/api/health/google-fit/callback` para testar local).
5. Copie o **Client ID** e **Client secret** gerados para `GOOGLE_FIT_CLIENT_ID` / `GOOGLE_FIT_CLIENT_SECRET`.
6. Em `/integracoes` no GLYX, clique em "Conectar com Google" e autorize.

## 2. Migrations Supabase

No SQL Editor (ou `supabase db push`), aplique **todos** os arquivos em `supabase/migrations/` em ordem de nome.

Recentemente indispensáveis (se o projeto já estava em produção antes desta leva):

1. `20260715140000_cgm_circuit_breaker.sql`
2. `20260715150000_cgm_multi_provider.sql`

Sem a #2, upsert Dexcom / PK composta falha.

### 2.1 A ordem importa: migration ANTES do deploy de código

Nesta leva a ordem deixou de ser boa prática e virou requisito. O código já lê e
**grava** colunas e tabelas que só existem depois das migrations de 07/09/2026 —
subir o código antes quebra funções que hoje funcionam:

| se faltar | quebra |
|---|---|
| `medication_logs.scheduled_for` / `adherence_status` | **"Marcar como tomada" para de gravar.** O PostgREST recusa o insert inteiro quando a coluna não existe — não é degradação, é falha total do registro de dose |
| `medications.timing_strictness` | **O adiar devolve 404.** A rota seleciona a coluna, recebe erro, e trata o remédio como inexistente |
| `medication_snoozes.scheduled_for` | O adiamento volta a marcar todas as doses do remédio (o defeito corrigido em 07/09) |
| `hypo_plan` / `hypo_events` | O card de ação não aparece; a tela de plano mostra "sem plano" para sempre |
| `substance_aliases` / `substance_interactions` / `substance_mechanisms` | O checador de interação não encontra nada — **e ausência de achado não é ausência de risco** |

Migrations desta leva, em ordem:

```
20260907120000_substance_safety.sql
20260907130000_timing_strictness.sql
20260907131000_adherence_status.sql
20260907132000_snooze_invariants.sql
20260907140000_substance_mechanisms.sql
20260907150000_medication_cadence.sql
20260907160000_hypo_plan.sql
```

Todas são aditivas **para o dado**: nenhuma apaga ou reescreve o que já existe.

> **Aditiva para o dado não é o mesmo que compatível com o código anterior — e
> essa confusão custou caro em 08/09/2026.** A `snooze_invariants` pôs
> `medication_snoozes.scheduled_for` como NOT NULL sem default. O código que
> estava em produção insere naquela tabela sem essa coluna, e **todo adiamento
> passou a falhar no instante em que a migration entrou**. Foi preciso a
> corretiva `20260908030000` para restaurar.
>
> A regra "migration antes do deploy" só vale para migration que o código
> ANTERIOR tolera. Quando não tolera — coluna NOT NULL sem default numa tabela
> em que o código já grava — a ordem é outra: a coluna entra permissiva (com
> default ou nullable), o código sobe, e só uma migration posterior aperta.
>
> A pergunta que faltava no checklist: *para cada tabela que já existe, o insert
> do código que está em produção agora continua válido depois desta migration?*
> A consulta que responde está em 2.3.

> **Não há fallback no código para coluna ausente, de propósito.** Tolerar a
> falta silenciaria justamente o estado que precisa ser barulhento: um app de
> diabetes rodando com o checador de interação vazio parece funcionar.

### 2.2 Rodar de novo é seguro — e é o caso comum, não o raro

As sete são **reexecutáveis**. Isso não era verdade até 07/09/2026: `create
policy` e `add constraint` não aceitam `if not exists` no Postgres, e sem um
`drop … if exists` antes a segunda execução falha. Falharia **depois** de já ter
criado tabela e índice, que são idempotentes — deixando o estado no meio, que é
o pior lugar para parar.

E o retry é o caso comum: aplicação manual pelo painel, falha no meio de uma
sequência de sete, ou simplesmente rodar de novo por dúvida sobre ter
completado. Seis políticas e quatro constraints ganharam o `drop` antes.

Os backfills são guardados para não desfazer escolha de quem usa:

| migration | guarda |
|---|---|
| `timing_strictness` | `created_at < '2026-09-08'` |
| `adherence_status` | `adherence_status is null` |
| `snooze_invariants` | `attempt is null` |
| `medication_cadence` | `cadence is null` |

O corte por data no `timing_strictness` entrou em 07/09/2026 corrigindo um
comentário que **afirmava uma proteção que o `where` não dava**: ele filtrava
por `timing_strictness = 'flexivel'`, o que protege o caso trivial (item já
rígido não muda) e deixa passar o que importa — um `med` marcado como flexível
de propósito voltaria a rígido na segunda execução, desfazendo a escolha em
silêncio.

### 2.3 Depois de aplicar, conferir cada uma

Aplicar não é o mesmo que estar aplicado. Uma consulta por migration, para
transformar "rodei o arquivo" em "o objeto existe":

```sql
-- 1. substance_safety — devem voltar 75 e 21
select count(*) from public.substance_aliases;
select count(*) from public.substance_interactions;

-- 2/3/4. colunas de medicação
select column_name from information_schema.columns
 where table_name = 'medications'
   and column_name in ('timing_strictness','grace_minutes',
                       'cadence','cadence_weekday','cadence_interval_days','cadence_anchor_on');
select column_name from information_schema.columns
 where table_name = 'medication_logs' and column_name in ('scheduled_for','adherence_status');
select column_name from information_schema.columns
 where table_name = 'medication_snoozes' and column_name in ('scheduled_for','attempt');

-- 5. mechanisms — 18 linhas, com as duas vias de incretina separadas
select count(*) from public.substance_mechanisms;
select distinct mechanism from public.substance_mechanisms
 where mechanism like 'incretina%';   -- deve trazer incretina_dpp4 E incretina_glp1

-- 0. ANTES de aplicar: alguma coluna NOT NULL sem default entra numa tabela em
--    que o código atual já grava? Se sim, o insert dele quebra na hora.
select table_name, column_name
  from information_schema.columns
 where table_schema = 'public'
   and is_nullable = 'NO' and column_default is null
   and table_name in ('medications','medication_logs','medication_snoozes',
                      'glucose_readings','meals','exercise_sessions','strength_logs','profiles')
   and column_name not in ('id','user_id','created_at');

-- 7. hypo — as duas tabelas, e RLS ligada nas duas
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and tablename in ('hypo_plan','hypo_events');
```

**A conferência de RLS não é formalidade.** Cinco tabelas novas guardam dado de
saúde; `substance_*` são de leitura pública por serem base curada, mas
`user_substance_windows`, `hypo_plan` e `hypo_events` são do usuário. Tabela
nova sem RLS num projeto Supabase fica legível por qualquer chave anon.

### 2.4 Ordem entre migration, merge e deploy

1. Aplicar as sete migrations, na ordem de `2.1`, conferindo com `2.3`.
2. Só então mesclar na `main`.
3. O deploy sai do merge — e a partir daí o §5 (smoke) vale.

Inverter 1 e 2 quebra o que hoje funciona, pelas razões da tabela em `2.1`.

## 3. `pg_cron` ↔ domínio e segredo

As functions SQL chamam o domínio Vercel com `x-cron-secret`. **Nenhum valor fica em literal no
SQL**: desde 18/07/2026 as `dispatch_*` leem `vault.decrypted_secrets` (segredo `cgm_cron_secret`) e
o domínio do segredo `app_base_url`. Instrução antiga mandava editar as functions — não faça isso,
recolocar o valor em literal é como o segredo vazou da primeira vez.

1. Confirme o domínio: `select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url';`
2. O segredo `cgm_cron_secret` no Vault **deve** ser igual a `CRON_SECRET` na Vercel. Quem confere é
   `secretsMatch` (`lib/auth/constant-time.ts`) nas rotas de cron.

### Rotação do `CRON_SECRET`

Necessária porque dois valores antigos estão no histórico do git (ver §10.2 do CONTEXTO_TECNICO).
Os dois lados têm que virar juntos — enquanto discordam, as rotas devolvem 401.

```sql
-- 1. valor novo (rode e guarde a saída)
select encode(gen_random_bytes(32), 'hex');

-- 3. depois de trocar na Vercel, atualize o Vault
select vault.update_secret(
  (select id from vault.secrets where name = 'cgm_cron_secret'),
  '<valor-novo>'
);
```

2. Entre o passo 1 e o 3: Vercel → Settings → Environment Variables → `CRON_SECRET` = valor novo →
   **Redeploy** (variável só passa a valer no próximo deploy).
4. Confira que voltou a passar:
   `select status_code, count(*) from net._http_response where created > now() - interval '30 minutes' group by 1;`

**A janela de falha é aceitável e não some:** entre o redeploy e o update do Vault, as chamadas de
cron tomam 401. Os jobs rodam a cada 5–15 min e `push_dispatch_log` deduplica por dia, então o pior
caso é uma rodada perdida — não há alarme duplicado nem dose contada duas vezes. Faça os dois passos
seguidos e confira no fim.

## 4. Supabase Auth

Dashboard → Authentication → Providers / Settings:

- [ ] **Desligar** “Allow new users to sign up” (cadastro só via `/api/auth/register`)
- [ ] Site URL = domínio público
- [ ] Redirect URLs incluem `https://…/auth/callback` e `http://localhost:3000/auth/callback`
- [ ] Ativar “Leaked password protection” se disponível

## 5. Smoke pós-deploy

1. Abrir `/login` no domínio de produção
2. Registrar com convite válido (ou login de conta piloto)
3. `/status` — sensor, push, IA e Sentry sem vermelho crítico
4. Perfil → exportar JSON → apagar dados de teste (wipe)
5. Se Libre/Dexcom: conectar e ver `last_sync_at` atualizar
6. No Sentry: confirmar evento de teste ou falha controlada

## 6. CI (opcional)

Secrets do GitHub Actions para E2E clínico:

- `E2E_USER_EMAIL`
- `E2E_USER_PASSWORD`

Sem eles o `clinical-path.spec.ts` é ignorado; os portões de auth continuam rodando.

## Comando rápido

```powershell
npm run check:prod
# ou
.\scripts\check-prod-ready.ps1
# apontar outro arquivo:
.\scripts\check-prod-ready.ps1 -EnvFile .env.production.local
```

## Limitação Vercel (Sensitive)

Variáveis marcadas como **Sensitive** na Vercel **não voltam por `vercel env pull`** — o CLI grava `""`.  
Não use pull para “sincronizar” `.env.local` ou você apaga os valores locais.  
Para local: copie do painel Supabase (URL/anon/service_role), Moonshot/Kimi e `npx web-push generate-vapid-keys` (ou do backup do `.env.local`).
