# Schema do backend — GLYX

> **Revisão técnica concluída em 15/10/2026** — conferido contra o código, as migrations e a validação
> local de 14–15/10. **Não aprovado pelo Rivas.** D1 e D4 aprovadas em 15/10 (coluna `cadence_confirmed_at`; sem `apagar_apos` nem job de limpeza). A3 executada em 15/10 (leitura). **A2 executada em 30/10/2026:** as 4 migrations do lote 1 e a `20261030120000` estão aplicadas em produção.

**Data:** 14/10/2026, conferido em 15/10/2026, estado de implantação atualizado em 30/10/2026 · **Fonte:**
`supabase/migrations/` (77 arquivos; 72 aplicados até 08/09 segundo o histórico; os 4 do lote 1, criados
em 14–15/10, e a `20261030120000` **aplicados em produção em 30/10/2026**, um a um, com conferência —
registro em [`lista-implementacao-glyx.md`](lista-implementacao-glyx.md)). Descrição de cada tabela em
[`CONTEXTO_TECNICO.md`](CONTEXTO_TECNICO.md) §5.

> **Estado do repositório, conferido em parte no banco.** O que segue é o que as migrations definem. Em
> 30/10 foram conferidos em produção os objetos do lote 1 (policies, funções, colunas, índices); o resto
> do schema não foi comparado com o repositório (há registro de migration aplicada fora do fluxo).
> `types/supabase.generated.ts` é de 30/07 e não tem as tabelas de setembro (GLYX-36).

## 1. Tabelas (37)

Todas com RLS habilitado. A lista de tabelas com `user_id` é extraída do SQL pelo teste
`lib/privacy/rls-coverage.test.ts`; o inventário LGPD e a policy restritiva `conta_ativa` são
conferidos contra ela.

| Grupo | Tabelas | Chave de acesso |
|---|---|---|
| Conta | `profiles` | `id = auth.uid()`; admin lê todos (GLYX-18) |
| Glicemia | `glucose_readings`, `blood_pressure_logs`, `cgm_connections`, `google_fit_connections`, `health_snapshots` | `user_id` |
| Alimentação | `meals`, `water_logs` | `user_id` |
| Medicação | `medications`, `medication_logs`, `medication_snoozes`, `insulin_logs` | `user_id`; filhos exigem medicamento próprio (20261015100000, **aplicada em produção em 30/10**) |
| Segurança clínica | `hypo_plan`, `hypo_events`, `user_substance_windows` | `user_id` |
| Catálogos (sem `user_id`) | `substance_aliases`, `substance_interactions`, `substance_mechanisms`, `exercises` | leitura `authenticated`; escrita só por migration |
| Exercício e corpo | `exercise_sessions`, `strength_logs`, `muscle_pauses`, `weight_logs`, `body_measurements`, `body_goals`, `body_photos` | `user_id` |
| Exames | `exams`, `exam_values` | `user_id`; `exam_values` cascateia de `exams` |
| Análise | `metabolic_alerts`, `metabolic_audits`, `insight_findings`, `health_events` | `user_id` |
| IA | `ai_threads`, `ai_messages`, `ai_usage` | `user_id`; `ai_usage` só leitura para o usuário (20261015102000, **aplicada em produção em 30/10**) |
| Push | `push_subscriptions`, `push_dispatch_log` | `user_id` |

## 2. Funções relevantes

| Função | Papel | Quem executa |
|---|---|---|
| `dispatch_med_alarms` | despachante de alarme (redefinido em 20261015103000) | só `pg_cron` |
| `med_alarms_due(p_now)` | doses vencidas, com cadência — **nova** | ninguém da API |
| `med_alarm_is_dose_day(...)` | dia de dose — **nova**, espelho de `lib/medications/cadence.ts` | ninguém da API |
| `glyx_fuso_valido(text)` | fuso válido ou São Paulo — **nova**; reescrita em plpgsql por `20261030120000` (a versão que varria `pg_timezone_names` levou o cron de alarmes de 0,04 s a 8,3 s) | ninguém da API |
| `conta_ativa()` | usada pela policy restritiva — **nova** | `authenticated` |
| `consumir_cota_ia`, `registrar_tokens_ia` | uso de IA — **novas** (a antiga proposta `apagar_meu_uso_de_ia` saiu em 15/10: D4) | `authenticated` |
| `record_system_ai_usage` | custo de IA do cron | `service_role` (grant explícito novo) |
| `is_current_user_admin`, `admin_user_stats`, `admin_ai_spend` | admin | ver `CONTEXTO_TECNICO` |
| demais `dispatch_*` | dica, água, sensor parado, sugestão, sync CGM | só `pg_cron` |

## 3. Colunas novas do lote 1 (aplicadas em produção em 30/10/2026)

`medications.cadence_confirmed_at` (D1, migration `20261015103000`): quando a frequência foi escolhida ou
confirmada explicitamente; **sem preenchimento automático** — todo item existente fica nulo ("a confirmar").
O despachante não a lê: o alarme dos itens antigos não muda.

`push_dispatch_log`: `status`, `attempts`, `last_attempt_at`, `confirmed_at`, `last_error`,
`scheduled_at`, `payload`. Default `status = 'enviado'`, para os despachantes que não confirmam
continuarem como estão.

`medication_logs` (migration `20261015101000`, reescrita em 15/10 — D14 opção B): colunas
`client_request_id` (identidade da ação), `correcao_pedido` e `correcoes` (histórico de correções,
preenchido por gatilho); rótulo `adicional`; gatilho `medication_logs_protege_historico` (`created_at` do
servidor, histórico de correção). Índices únicos parciais: `medication_logs_pedido_unico (user_id,
client_request_id) where client_request_id is not null` e `medication_logs_dose_confirmada_unica
(user_id, medication_id, scheduled_for) where confirmed and scheduled_for is not null and created_at >=
<corte>` — o corte é um **parâmetro da sessão** de aplicação (`glyx.corte_dose_unica`), não texto do
arquivo; fica registrado na definição e no comentário do índice. O histórico anterior não é alterado nem
bloqueia. **Corte usado em produção: `2026-10-30T21:05:00Z`**; na aplicação havia 12 grupos repetidos (26
linhas, de 08/09 a 29/10), todos anteriores ao corte e preservados.

Reversão das quatro migrations: [`supabase/reversao/20261014_reverter_lote1.sql`](../supabase/reversao/20261014_reverter_lote1.sql)
(fora de `migrations/`; um bloco por migration; ensaiada inteira em 15/10 com as versões finais em
PostgreSQL 17). Ordem de aplicação = ordem dos nomes: 100000 dono → 101000 dose única → 102000 conta/IA →
103000 alarmes.

## 4. Storage

Buckets privados `meal-photos`, `medication-labels`, `body-photos`, pasta por `auth.uid()`. Policy
restritiva nova `glyx_conta_ativa_fotos` (aplicada em produção em 30/10; validada em teste local: conta
desativada não envia nem lê foto — em produção não havia conta desativada para exercitar).

---

**Riva's Alexandre**  © 2026
Todos os direitos reservados. Mapa do schema do GLYX segundo as migrations.
