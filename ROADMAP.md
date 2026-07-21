# ROADMAP — GLYX

Última atualização: 2026-07-15  
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
| Admin: gasto de IA | Vivo |
| Calculadora de bolus (educativa) | Vivo — ver ressalva abaixo |

> **Calculadora de bolus.** Entrou em 18/07/2026, revertendo a decisão anterior de mantê-la fora de
> escopo. É educativa: usa os parâmetros que o usuário configurou com o médico (`carb_ratio`,
> `correction_factor`, `target_glucose_bolus`), bloqueia o cálculo em hipoglicemia e **não grava
> dose em lugar nenhum**. Limitações conhecidas, sinalizadas na própria tela: **não considera
> insulina ativa (IOB)** e **não tem teto de dose máxima** — esse teto depende de um valor
> individual, que precisa vir do endocrinologista antes de virar código.

## Próximos (ordem sugerida)

### P1 — fechar operação e credibilidade

1. **Habilitar em produção** o que o código já espera — guia em [docs/PRODUCAO.md](docs/PRODUCAO.md); validar env com `npm run check:prod` (Auth signup off, secrets, migrations circuit breaker + multi-provider, cron URL/secret).
2. **E2E clínico autenticado** no CI (`E2E_USER_EMAIL` / `E2E_USER_PASSWORD`).
3. **Dexcom sandbox → produção** quando houver app aprovado no portal Dexcom; validar payload real de EGVs e ajustar normalizer se necessário.
4. **DPIA viva** — manter `docs/DPIA.md` alinhado a qualquer novo processamento de dado sensível (inclui Google Fit).

### P2 — produto

6. Decisão estratégica: **só paciente** vs **compartilhamento com cuidador** (consentimento granular, escopos). Sem isso, não começar multi-tenant clínico.
7. Métricas educativas: TIR / resumo semanal exportável (não AGP clínico).
8. Modelo de negócio (freemium IA / convite pago) — hoje só controle de custo.
9. Resiliência Libre: monitorar quebras da API não oficial; fallback CSV sempre documentado.

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
- [ ] Pelo menos um sensor (Libre ou Dexcom) sync estável por 7 dias em usuário piloto

## Documentos relacionados

- [DPIA enxuta](docs/DPIA.md) — avaliação de impacto à proteção de dados
- [README](README.md) — setup e operação
- Análise de teto (Canvas Cursor): `glyx-analise-teto.canvas.tsx`
