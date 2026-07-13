# GLYX — Sistema Inteligente de Controle Metabólico e Diabetes

App web (Next.js 15 App Router) para controle diário de diabetes e metas corporais: glicemia (manual
e sincronização automática via CGM), refeições por foto com IA, medicação com alarmes, exercício,
exames, água, peso e um copiloto de IA metabólica — com backend em Supabase (Postgres + Auth + RLS +
Storage + cron).

**Raiz única do repositório:**
`C:\_PROJETOS\GLYX — Sistema Inteligente de Controle Metabólico e Diabetes`

## Stack

- **Next.js 15** (App Router, React 19, Server Actions, Route Handlers), TypeScript, Tailwind.
- **Supabase**: Postgres + Auth + Row Level Security + Storage (buckets privados) + `pg_cron`/`pg_net`
  para os despachantes agendados.
- **IA**: qualquer provedor compatível com a API da OpenAI (`OPENAI_API_KEY`; opcionalmente
  `OPENAI_BASE_URL`/`AI_MODEL` para usar OpenRouter etc.) — chat, visão (foto de refeição/exame/
  rótulo/bancada) e geração de sugestões.
- **Web Push** (VAPID) para alarmes e lembretes, com Service Worker (`public/sw.js`).
- **CGM**: FreeStyle Libre 2 via LibreLinkUp (sincronização automática) ou importação de CSV do
  LibreView; modelo normalizado também aceita Dexcom.
- Testes: **Vitest** (unitário) + **Playwright** (E2E/smoke).

## Funcionalidades

### Núcleo diário
- **Dashboard** com resumo do dia (última glicemia, carboidratos, minutos ativos, água, macros vs.
  meta, alertas não lidos), cálculo de "hoje" no fuso salvo em `profiles.timezone`.
- **Glicemia**: registro manual, histórico, tendências (14 dias, Recharts), teste de risco ADA
  público, predição de tendência a partir das últimas leituras do CGM.
- **CGM automático**: conexão com LibreLinkUp (login próprio do usuário, credenciais criptografadas
  no banco) com sincronização periódica; alternativa por importação de CSV exportado do LibreView.
- **Refeições**: registro manual ou por foto (IA estima calorias/macros/carga glicêmica e sugere
  ordem de consumo), com revisão antes de salvar; foto arquivada em bucket privado do Storage.
- **Montar prato**: até 4 fotos da bancada/despensa → IA sugere um prato com porções e ordem de
  consumo, alinhado ao objetivo corporal do usuário.
- **Medicação**: cadastro com foto do rótulo, horários de lembrete, controle de estoque com aviso de
  reposição, registro de dose tomada, suplementos com unidade "comprimido" ou "copo de medida".
- **Alarmes (Web Push)**: despachante agendado via `pg_cron` para remédio/suplemento na hora certa
  (com opção de adiar/"soneca"), aviso de estoque baixo, dica diária de nutrição, lembrete de água a
  cada ~2h, e sugestão de refeição por IA quando o horário passa sem registro.
- **Água**: registro rápido, meta diária calculada a partir do peso.
- **Exercício**: sessões reais (tipo, duração, intensidade), plano de treino.
- **Exames**: interpretação assistida por foto ou PDF (transcreve, explica termos, gera perguntas
  para o médico) — educativo, não é laudo.
- **Analisador de suplemento**: foto do rótulo → cruzamento com glicemia/exames/medicações do
  usuário, veredito de segurança (seguro/atenção/evitar).
- **Objetivo corporal**: perfil (sexo, idade, altura, atividade), metas de peso/macros, gráfico de
  evolução, viabilidade avaliada por IA.
- **Onboarding com foco**: diabetes / emagrecer / ganhar massa — painel e sugestões adaptados ao
  foco escolhido.
- **Insights**: correlações heurísticas (sono/carboidrato/exercício vs. média glicêmica), alertas de
  hiper/hipoglicemia e de pico glicêmico pós-refeição.
- **Copiloto de IA metabólica**: chat com streaming, com contexto dos dados do usuário.

### Conta, dados e administração
- Login/registro com **código de convite** obrigatório (`SIGNUP_INVITE_CODE`), fluxo de
  esqueci/redefinir senha.
- **LGPD**: página de privacidade/consentimento, exportar meus dados, apagar minha conta e dados,
  exclusão de registros individuais (refeições, glicemia).
- **Rate limiting** e limites de tamanho/tipo de arquivo nas rotas de IA, com contador de tokens por
  usuário.
- **Painel `/admin`**: estatísticas de uso e "relógio de gastos" de IA (por dia/mês, com metas
  configuráveis), restrito por `profiles.is_admin`.

## Configuração

1. Copie `.env.example` para `.env.local` e preencha (veja comentários no próprio arquivo — Supabase,
   IA, VAPID, `CRON_SECRET`, `SIGNUP_INVITE_CODE`).
2. Crie um projeto em [Supabase](https://supabase.com), copie **URL** e **anon key**.
3. No SQL Editor do Supabase (ou `supabase db push` com o CLI), execute **todos** os arquivos de
   `supabase/migrations/` em ordem cronológica pelo nome. São incrementais — pular algum deixa
   tabelas/colunas/funções ausentes.
4. Gere as chaves VAPID: `npx web-push generate-vapid-keys`.
5. Gere um `CRON_SECRET` aleatório próprio e configure o **mesmo valor** nas funções SQL de cron
   (procure `x-cron-secret` e `p_secret` em `supabase/migrations/*.sql`) — nunca reutilize um valor
   que já apareceu em um commit público.

```bash
npm install
npm run verify   # lint + build + testes unitários
npm run dev
```

Abra `http://localhost:3000`.

## Testes

```bash
npm run test        # Vitest — normalizadores, agregações, rate limit, parser de refeição
npm run test:watch
npm run test:e2e     # Playwright — sobe `npm run dev` automaticamente
```

As funções SQL de despacho (`dispatch_*`, `evaluate_meal_glucose_spikes`) não têm cobertura de teste
automatizado no Postgres — a lógica de janela de horário/fuso que pode ser expressa em TypeScript
está isolada em `lib/time/local-day.ts` e coberta por `lib/time/local-day.test.ts`.

## CI

GitHub Actions roda `npm install`, `npm run verify` (lint + build + Vitest), instala Chromium do
Playwright e corre `npm run test:e2e`, com variáveis públicas de exemplo para o build.

## Produção e deploy

- **Vercel** (ou similar): defina todas as variáveis de `.env.example` no ambiente de produção;
  `CRON_SECRET` precisa ser o mesmo valor das funções SQL. Nunca exponha a **service role key** no
  cliente.
- **Supabase Auth** → *URL Configuration*: **Site URL** com o domínio público e **Redirect URLs**
  incluindo `https://…/auth/callback` e `http://localhost:3000/auth/callback` para desenvolvimento.
- **Supabase Auth** → *Providers/Settings*: desative "Allow new users to sign up" se o convite deve
  ser o único caminho de cadastro (o código de convite roda na camada da aplicação, não na API);
  ative "Leaked password protection".
- **Cabeçalhos HTTP**: ver `next.config.ts` (`X-Frame-Options`, `Referrer-Policy` etc.).
- **`pg_cron`**: cada função de despacho chama `net.http_post` para uma rota `/api/.../dispatch` com
  o domínio de produção hardcoded na função SQL — se o domínio mudar, atualize as funções.

## Segurança — pontos de atenção ao alterar o backend

- Toda tabela em `public` tem RLS habilitado; ao criar uma tabela nova, adicione a policy de dono
  antes de expor no cliente.
- Funções `SECURITY DEFINER` chamadas só pelo `pg_cron` (papel `postgres`) devem ter
  `revoke execute ... from public, anon, authenticated;` explícito — por padrão o Postgres concede
  `EXECUTE` a `PUBLIC` na criação, o que as expõe via `/rest/v1/rpc/...` para qualquer visitante.
- Nunca commit segredo em texto puro numa migração; se acontecer, o valor precisa ser rotacionado
  (não basta remover do arquivo — o histórico do git mantém).

## Aviso legal

O GLYX fornece organização de dados e orientações gerais; **não substitui avaliação médica**. Ajustes
de medicamento e diagnósticos são responsabilidade do profissional habilitado.
