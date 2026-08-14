# ROADMAP — GLYX

Última atualização: 2026-08-14  
Produto: autocuidado metabólico / diabetes (pt-BR), PWA Next.js + Supabase.  
**Não é dispositivo médico.** Papel clínico/cuidador ainda não está no escopo implementado.

## Já entregue (MVP invite-gated)

| Área | Estado |
|------|--------|
| Diário: glicemia, refeições, água, peso, exercício, medicação, exames | Vivo |
| CGM LibreLinkUp + CSV LibreView + circuit breaker | Vivo |
| Dexcom OAuth + sync (requer credenciais de parceiro/sandbox) | Vivo (config) |
| Google Fit OAuth + sync (passos/sono/FC — requer projeto Google Cloud; risco de descontinuação da Fitness API) | Vivo (config) |
| IA: chat, foto de refeição, exames, suplementos, sugestões | Vivo |
| Web Push (medicação, água, dicas, hipo) | Vivo |
| LGPD: consentimento, export, wipe amplo + Storage | Vivo |
| Auth: convite + Admin API (signup público desligável) | Vivo |
| Observabilidade: Sentry + alertas de cron | Vivo (config) |
| Qualidade: Vitest (RLS/LGPD/crypto) + E2E de portões | Vivo |
| Admin: gasto de IA + aviso de conta além da do dono | Vivo |
| Calculadora de bolus (educativa) | Vivo — ver ressalva abaixo |
| Composição corporal: medidas, dobras, fotos, metas, volume de treino e leitura por IA | Vivo — ver ressalva abaixo |
| Navegação reorganizada: 14 → 9 destinos, IA como chat flutuante | Vivo (22/07/2026) |
| Manual do usuário interativo dentro do app (`/ajuda`) | Vivo (25/07/2026) |
| Resumo semanal educativo e exportável (`/analise/semana`) | Vivo (26/07/2026) |
| Resiliência Libre: quebra do provedor separada de problema individual | Vivo — depende de `OPS_ALERT_WEBHOOK_URL` |
| Diário completo: tudo que foi registrado desde o primeiro dia | Vivo (06/08/2026) |
| Módulo Treino: catálogo de exercícios ligado ao registro de carga | Vivo — ver seção abaixo |

> **Provedor de IA.** Desde 19/07/2026 é Kimi K2.6 (`api.moonshot.ai`), não OpenAI.

> **Calculadora de bolus.** Entrou em 18/07/2026, revertendo a decisão anterior de mantê-la fora de
> escopo. É educativa: usa os parâmetros que o usuário configurou com o médico (`carb_ratio`,
> `correction_factor`, `target_glucose_bolus`), bloqueia o cálculo em hipoglicemia e **não grava
> dose em lugar nenhum**. Limitações conhecidas, sinalizadas na própria tela: **não considera
> insulina ativa (IOB)** e **não tem teto de dose máxima** — esse teto depende de um valor
> individual, que precisa vir do endocrinologista antes de virar código.

> **Composição corporal.** Entrou em 26/07/2026 (`/composicao`). 21 medidas por data, fotos de
> progresso em bucket privado, metas com projeção de prazo, volume semanal por grupo muscular e
> progressão de carga. O percentual de gordura é **estimativa** por dobras (Jackson-Pollock 3) ou
> fita (US Navy) — o método aparece sempre junto do número e comparar datas medidas por métodos
> diferentes é bloqueado em código. Diferença abaixo do erro de medição (0,5 kg / 1 cm) é tratada
> como estabilidade, não evolução. As fotos **não** vão para a IA por padrão: só na comparação
> pedida explicitamente, com aviso na tela (ver [DPIA](docs/DPIA.md)). As migrations
> `body_composition` e `ai_usage_body_kinds` **já estão aplicadas** no projeto Supabase.
>
> O envio de fotos de progresso ficou **quebrado desde a estreia até 13/08/2026**: o campo mandava o
> arquivo cru do celular e o Server Action recusava o corpo antes de a action rodar, sem mensagem.
> Nenhuma foto chegou a ser gravada nesse período. Corrigido com compressão no navegador.

## Módulo Treino

Construído em fatias, cada uma aditiva e verificável sozinha.

| Fatia | Estado |
|------|--------|
| 1. Catálogo de 42 exercícios (`public.exercises`) com vocabulário muscular próprio | Entregue 30/07/2026 |
| 1b. Vocabulário canônico ganha trapézio e glúteos | Entregue 30/07/2026 |
| 2. A ponte: `strength_logs.exercise_id`, nome e músculo derivados no servidor | Entregue 14/08/2026 |
| 3. Registro de carga conta como treino na recuperação e no volume | Entregue 14/08/2026 |
| 4. Plano prescrever exercícios do catálogo, não só grupos musculares | Aberto |
| 5. Vetor de ativação: músculos secundários, para `direct_sets` deixar de ser só o primário | Aberto |

**Sem backfill, por decisão.** Nada em `strength_logs` foi reetiquetado — reclassificar texto livre
para id de catálogo é chute apresentado como dado. Data de corte 30/07/2026 para o catálogo e
14/08/2026 para o elo; a série tem descontinuidade aí, assumida.

**O que as Fatias 2 e 3 ainda não mostram.** Na data de entrega havia 0 registros de carga com
músculo — as fatias ligam o caminho, e o primeiro número aparece no primeiro registro feito
escolhendo o exercício da lista.

## Próximos (ordem sugerida)

### P1 — fechar operação e credibilidade

1. **Habilitar em produção** o que o código já espera — guia em [docs/PRODUCAO.md](docs/PRODUCAO.md); validar env com `npm run check:prod` (Auth signup off, secrets, migrations circuit breaker + multi-provider, cron URL/secret).
2. **E2E clínico autenticado** no CI (`E2E_USER_EMAIL` / `E2E_USER_PASSWORD`).
3. **Dexcom sandbox → produção** quando houver app aprovado no portal Dexcom; validar payload real de EGVs e ajustar normalizer se necessário.
4. **DPIA viva** — manter `docs/DPIA.md` alinhado a qualquer novo processamento de dado sensível (inclui Google Fit).

### P2 — produto

5. **Fatias 4 e 5 do módulo Treino** (ver seção acima) — o catálogo já é fonte de verdade na escrita; falta ele guiar a prescrição e cobrir músculo secundário.
6. Decisão estratégica: **só paciente** vs **compartilhamento com cuidador** (consentimento granular, escopos). Sem isso, não começar multi-tenant clínico.
7. ~~Métricas educativas: TIR / resumo semanal exportável (não AGP clínico).~~ — entregue em 26/07/2026 em `/analise/semana`: 7 dias contra os 7 anteriores, destaques determinísticos e export em texto puro. Comparação só aparece quando as DUAS semanas passam do piso de dados.
8. Modelo de negócio (freemium IA / convite pago) — hoje só controle de custo.
9. ~~Resiliência Libre: monitorar quebras da API não oficial; fallback CSV sempre documentado.~~ — entregue em 26/07/2026: `lib/cgm/outage.ts` separa quebra do provedor de problema individual e dispara **um** alerta ops por rodada (não um por usuário); a tela de Conexões passa a apontar o import por CSV quando o erro é do lado do fabricante. **Depende de `OPS_ALERT_WEBHOOK_URL`** para o alerta sair do Sentry.

### Fora de escopo (até nova decisão)

- Portal do médico / prontuário
- WhatsApp API (hoje só link de instalação)
- Apple Health no browser (requer app nativo)
- Classificação como software médico (SaMD / ANVISA)

## Critério de “pronto para beta fechado mais amplo”

- [ ] `npm run check:prod` verde nas obrigatórias (+ avisos tratados)
- [ ] Migrations e secrets de produção aplicados ([docs/PRODUCAO.md](docs/PRODUCAO.md))
- [ ] Signup Auth fechado + convite operacional
- [ ] Wipe/export LGPD exercitado em conta real
- [ ] Sentry recebendo erros de cron CGM/push
- [x] Pelo menos um sensor (Libre ou Dexcom) sync estável por 7 dias em usuário piloto — **atendido**: Libre com 15 dias seguidos (30/07 a 13/08/2026), ~190 leituras/dia. Houve um vão de 5 dias antes disso (24 a 28/07), compatível com troca de sensor.

## Documentos relacionados

- [DPIA enxuta](docs/DPIA.md) — avaliação de impacto à proteção de dados
- [README](README.md) — setup e operação
- Análise de teto (Canvas Cursor): `glyx-analise-teto.canvas.tsx`
