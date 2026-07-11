# GLYX — Sistema Inteligente de Controle Metabólico e Diabetes

## Prova pública / demo navegável

Esta versão inclui uma demonstração MVP apresentável com dados fictícios realistas. Ela abre sem
Supabase, sem login e sem credenciais externas, usando mocks locais para dashboard, glicemia,
alimentação, exercício, medicação, exames, alertas, insights e histórico.

### Abrir localmente

```powershell
Set-Location "C:\_PROJETOS\GLYX — Sistema Inteligente de Controle Metabólico e Diabetes"
npm install
npm run demo
```

Depois abra `http://localhost:3000`.

Para validar antes de apresentar:

```powershell
npm run verify
npm audit --omit=dev
```

### Publicar a demo

Recomendado: **Vercel**. O projeto usa Next.js App Router, middleware, API routes e server actions;
por isso GitHub Pages não é a melhor opção para esta stack.

Opção rápida pela interface:

1. Publique o repositório no GitHub.
2. Crie um projeto na Vercel e importe o repositório.
3. Mantenha os comandos padrão do `vercel.json`.
4. Sem variáveis Supabase, a URL pública abre em modo demo com dados fictícios.

Opção via CLI:

```powershell
npm install -g vercel
vercel
vercel --prod
```

Para transformar a demo em ambiente real depois, defina na Vercel
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e, opcionalmente,
`OPENAI_API_KEY`.

### Escopo da demo

- Tela inicial pública de apresentação em `/`.
- Dashboard funcional em `/dashboard`.
- Navegação interativa por módulos via sidebar, mobile tab bar e cards.
- Dados mockados coerentes centralizados em `lib/demo/data.ts`.
- Build local e deploy Vercel preparados por `npm run demo:build` e `vercel.json`.
- Aviso claro de que é demo/MVP e não substitui orientação médica.

**Raiz única do repositório:**  
`C:\_PROJETOS\GLYX — Sistema Inteligente de Controle Metabólico e Diabetes`

Não uses `C:\Users\ULTRA\GLYX` como pasta de trabalho — apenas como fonte opcional para cópia (`sync-repo.ps1` ou `_sync-to-canonical.ps1`). Ver `DEPRECATED_ROOT.md` na cópia legacy.

## GitHub — remote `origin`

`https://github.com/RivasCode-Ops/GLYX-Sistema-Inteligente-de-Controle-Metab-lico-e-Diabetes.git`

- `.\scripts\configure-git-origin.ps1` — cria ou corrige o `origin` (requer **Git** instalado e no `PATH`).
- `.\scripts\check-repo.ps1` — mostra `git remote -v`, compara com o URL esperado e reporta `node`/`npm`.
- `.\scripts\sync-repo.ps1` — copia código de `C:\Users\ULTRA\GLYX` se existir `package.json`, `git init` se preciso, define `origin`.
- `.\scripts\_sync-to-canonical.ps1` — espelha `C:\Users\ULTRA\GLYX` → esta raiz (nome da pasta com travessão Unicode).
- `.\scripts\_dedupe-canonical-folders.ps1` — se existirem pastas duplicadas em `C:\_PROJETOS\GLYX*`, funde tudo no nome canónico e apaga o extra.

### Primeira vez / Git

```powershell
Set-Location "C:\_PROJETOS\GLYX — Sistema Inteligente de Controle Metabólico e Diabetes"
Set-ExecutionPolicy -Scope Process Bypass -Force
.\scripts\configure-git-origin.ps1
```

---

## GLYX — Controle metabólico (app)

Next.js 15 (App Router) + Tailwind + Supabase (PostgreSQL + Auth + RLS) + rotas por módulo + IA opcional (OpenAI).

## Decisões assumidas (MVP)

- **Stack**: Next.js 15 (App Router, React 19), Tailwind, Supabase (Auth + Postgres + RLS), Recharts, Vitest + Playwright.
- **Rotas**: `app/(app)` com shell (sidebar + tab bar móvel); auth em `app/(auth)`; APIs em `app/api/*`; server actions em `app/actions/*`.
- **Sem credenciais Supabase**: `middleware` não exige sessão (`lib/supabase/middleware.ts` devolve `next()` cedo); UI mostra `SetupBanner`; persistência real exige `.env.local` + migrações SQL.
- **Schema**: ficheiros ordenados em `supabase/migrations/` — executar **todos** no SQL Editor (init + CGM + health + insights, por data no nome).
- **IA**: opcional; `OPENAI_API_KEY` ausente → APIs devolvem erro explícito ou UI desactiva funcionalidades sensíveis.
- **Segurança**: cabeçalhos em `next.config.ts`; sem expor service role no cliente.
- **Instalação no telemóvel (MVP)**: `app/manifest.ts` (Web App Manifest) + ícones gerados por código (`app/icon.tsx`, `app/apple-icon.tsx`) — sem ficheiros PNG estáticos em `public/`.

### Checklist de construção (referência interna)

1. Estrutura inicial — **feito** (`app/`, `components/`, `lib/`, `supabase/`, `types/`).
2. Stack e dependências — **feito** (`package.json`, `tailwind.config.ts`, `next.config.ts`, `tsconfig.json`).
3. Layout global — **feito** (`app/layout.tsx` + `viewport` para mobile/safe-area, `globals.css`, tema escuro).
4. Navegação — **feito** (`lib/navigation.ts`, `AppSidebar`, `MobileTabBar`, `ModuleSubnav`).
5. Rotas principais — **feito** (`/dashboard`, `/glicemia`, `/alimentacao`, `/medicacao`, `/exercicios`, `/exames`, `/insights`, `/integracoes`, `/ia-metabolica`, auth).
6. Schema do banco — **feito** (`supabase/migrations/*.sql` por ordem cronológica).
7. Componentes base — **feito** (`components/ui/*`, shell, secções de módulo).
8. Dashboard — **feito** (`app/(app)/dashboard`).
9. Módulos centrais MVP — **feito** (server actions + páginas por domínio).
10. Mock / dados reais — **feito** (Supabase quando há `.env.local`; ingest mock CGM/health; banner sem credenciais).
11. Responsividade e estados — **feito** (sidebar desktop / tab bar móvel, `loading.tsx`, `error.tsx`, `not-found.tsx`).
12. Projeto a correr — **local**: `npm install` → `npm run verify` → `npm run dev` ou `.\scripts\run-dev.ps1` (validação CI: `npm run verify` + `npm run test:e2e`).
13. Entrega — este README + código no repositório; integrações OAuth externas na **Próxima fase**.

## Funcionalidades

- **CGM (camada A)**: modelo unificado em `lib/cgm/`, normalização Dexcom/Libre (`lib/cgm/normalize/`), ingestão `POST /api/cgm/ingest`, status `GET /api/cgm/status`, mock na página **Glicemia → Sensor**. Migração extra: `supabase/migrations/20260109120000_cgm_glucose_columns.sql`.
- **Wearables / saúde (camada B)**: snapshots diários em `health_snapshots`, normalizadores Google Fit / Apple (export), `POST /api/health/ingest`, página **`/integracoes`**, resumo no painel (passos + sono). Migração: `supabase/migrations/20260109140000_health_snapshots.sql`.
- **Insights v2 (camada C)**: correlações heurísticas em `lib/insights/v2/` (sono/carbos/exercício vs média glicémica diária), persistência em `insight_findings`, botão recalcular em **`/insights`**, `POST /api/insights/evaluate`. Migração: `supabase/migrations/20260109150000_insight_findings.sql`.
- **Exames — interpretação assistida (camada D)**: `lib/exams/interpret.ts` + `parsed_summary` em `exames`, acção `runExamInterpretation`, UI em **`/exames/[id]`** com disclaimers (educativo, não substitui laudo). Requer `OPENAI_API_KEY`.
- **Auth**: login/registro (`/login`, `/register`), callback OAuth `/auth/callback`, middleware protege o app.
- **Dados**: leituras de glicemia, refeições, medicamentos, sessões de exercício, alertas metabólicos, exames (texto), timeline.
- **Gráficos**: tendências glicêmicas (14 dias) em `/glicemia/tendencias` (Recharts).
- **Motor de regras**: alertas em hiper/hipoglicemia (`lib/insights/rules.ts`).
- **IA**: `/api/ai/chat` (copiloto) e `/api/ai/meal-photo` (visão + grava refeição), quando `OPENAI_API_KEY` está definida.

## Configuração

1. Copie `.env.example` para `.env.local`.
2. Crie um projeto em [Supabase](https://supabase.com), copie **URL** e **anon key**.
3. No SQL Editor do Supabase, execute o arquivo `supabase/migrations/20260109000000_init.sql` (schema + RLS + trigger de perfil).
4. (Opcional) Defina `OPENAI_API_KEY` para IA.

Nesta raiz, **instalação + validação + servidor dev** num fluxo só (recomendado na tua máquina):

```powershell
.\scripts\local-run.ps1
```

Gera `glyx-local-run.log` na raiz com toda a saída.

Instalação + relatório em ficheiro (sem subir o servidor):

```powershell
.\scripts\run-install.ps1
```

Gera `package-lock.json`, corre `npm run verify` e escreve **`glyx-npm-report.txt`** na raiz do projeto com saídas resumidas.

Sem relatório em ficheiro (saída só no terminal):

```powershell
.\scripts\bootstrap.ps1
```

Atalho idêntico:

```powershell
.\scripts\faca.ps1
```

Ou manualmente:

```bash
npm install
npm run verify
npm run dev
```

Para só subir o servidor (após `npm install`):

```powershell
.\scripts\run-dev.ps1
```

Abra `http://localhost:3000`: **com** Supabase e sessão, `/` → `/dashboard`; **com** Supabase sem sessão, `/` → `/login`; **sem** Supabase (demo), `/` → `/dashboard` com banner de configuração.

### CGM — exemplo `curl` (sessão já logada no browser; cookie copiado)

```bash
curl -X POST http://localhost:3000/api/cgm/ingest \
  -H "Content-Type: application/json" \
  --cookie "YOUR_SESSION_COOKIE" \
  -d "{\"mode\":\"mock\",\"points\":12}"
```

Validação:

```bash
npm run verify
```

Testes unitários (Vitest — normalizadores e agregações):

```bash
npm run test
```

Smoke E2E (Playwright — sobe `npm run dev` automaticamente):

```bash
npm run test:e2e
```

## CI

GitHub Actions roda `npm install`, `npm run verify` (lint + build + Vitest), instala Chromium do Playwright e corre `npm run test:e2e`, com variáveis públicas de exemplo para o build.

## Produção e deploy

- **Vercel (ou similar)**: defina `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, e no servidor `OPENAI_API_KEY` se usar IA; não exponha a **service role** no cliente.
- **Supabase Auth**: em **Authentication → URL Configuration**, configure **Site URL** com o domínio público (ex.: `https://glyx.vercel.app`) e **Redirect URLs** com `https://…/auth/callback` e `http://localhost:3000/auth/callback` para desenvolvimento.
- **Cabeçalhos HTTP**: ver `next.config.ts` (`X-Frame-Options`, `Referrer-Policy`, etc.).
- **Erros UI**: `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, loading em `app/(app)/loading.tsx`.

## Próxima fase

- OAuth/API reais (Dexcom, Libre, Google Fit) em vez de ingest mock ou export manual.
- E2E com utilizador de teste ou bypass controlado em CI.
- PWA, analytics e rate limiting nas rotas públicas de API (opcional).

## Aviso legal

O GLYX fornece organização de dados e orientações gerais; **não substitui avaliação médica**. Ajustes de medicamento e diagnósticos são responsabilidade do profissional habilitado.
