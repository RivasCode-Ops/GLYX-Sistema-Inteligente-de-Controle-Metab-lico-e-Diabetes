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
| `KIMI_API_KEY` | sim (se IA) | Chave da API oficial Moonshot; somente servidor |
| `OPENAI_BASE_URL` / `AI_MODEL` | sim (se IA) | `https://api.moonshot.ai/v1` / `kimi-k2.6` |
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

## 3. `pg_cron` ↔ domínio e segredo

As functions SQL chamam o domínio Vercel com `x-cron-secret`.

1. Confirme que a URL nas migrations/`dispatch_*` aponta para o domínio **atual**.
2. O valor do secret nas functions **deve** ser o mesmo de `CRON_SECRET` na Vercel.
3. Se um secret antigo já apareceu em commit público: **rote** (novo valor na Vercel + update nas functions SQL). Não reutilize secrets do histórico do git.

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
