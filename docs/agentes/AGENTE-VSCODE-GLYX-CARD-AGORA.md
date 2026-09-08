# AGENTE-VSCODE-GLYX-CARD-AGORA

Briefing de implementação — GLyX, fatia 4.
Depende das fatias 1 (checador de interação) e 3 (recibo de contexto).

Objetivo: um card único no topo do Painel metabólico, acima da lista MÓDULOS,
que diz **o que fazer agora** e permite executar a ação ali mesmo.

---

## 0. Regras de escopo

1. **O motor determinístico decide qual card aparece.** A LLM só redige o texto
   do card escolhido. Se o motor não elege nenhum, não há chamada de IA.
2. **Nenhuma conduta é inventada pelo app.** O card de hipoglicemia renderiza o
   plano que o usuário cadastrou com o médico. O GLyX não define quantidade,
   não define dose, não define intervalo clínico.
3. **Um card por vez.** Prioridade estrita, primeiro match vence. Sem fila
   visível, sem carrossel.
4. **Card sem ação executável não existe.** Todo card tem ao menos um botão que
   grava algo no banco.
5. **Ausência de alerta é dita, não escondida.** Quando nada dispara, o card
   neutro declara isso. Não inventar urgência nem "dica do dia".

---

## 1. Migration — plano de hipoglicemia

Arquivo: `supabase/migrations/<timestamp>_hypo_plan.sql`

Uma linha por usuário. Preenchida por ele, com o médico. O app não popula nada
por padrão — sem plano cadastrado, o card de hipo mostra o estado "plano não
configurado" e leva para o cadastro.

```sql
create table public.hypo_plan (
  user_id            uuid primary key references auth.users on delete cascade,
  -- o que o usuário definiu com o médico, em texto livre dele
  correction_text    text not null,
  -- minutos até reavaliar, definido por ele
  recheck_minutes    integer not null check (recheck_minutes between 5 and 60),
  -- limiar em mg/dL abaixo do qual o card dispara; default vem da faixa alvo
  threshold_mg_dl    integer not null check (threshold_mg_dl between 50 and 100),
  -- contato/orientação de emergência que ele mesmo escreveu
  emergency_text     text,
  updated_at         timestamptz not null default now()
);

alter table public.hypo_plan enable row level security;

create policy "hypo_plan_own" on public.hypo_plan
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

```sql
-- registro de execução do plano, para fechar o ciclo do card
create table public.hypo_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  detected_at    timestamptz not null,
  glucose_mg_dl  integer not null,
  acted_at       timestamptz,          -- quando ele tocou em "Fiz"
  recheck_at     timestamptz,          -- quando a reavaliação foi registrada
  recheck_mg_dl  integer,
  created_at     timestamptz not null default now()
);

alter table public.hypo_events enable row level security;

create policy "hypo_events_own" on public.hypo_events
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index hypo_events_user_detected_idx
  on public.hypo_events (user_id, detected_at desc);
```

`threshold_mg_dl` **não tem valor embutido no código**. No cadastro, o campo vem
pré-preenchido com o limite inferior da faixa alvo que o usuário já configurou no
GLyX, e ele confirma ou altera. Nenhum número clínico nasce deste documento.

---

## 2. Motor de prioridade — `lib/painel/card-agora.ts`

Avaliação em ordem. **Primeiro match vence e interrompe.**

```ts
export type CardLevel = "critico" | "atencao" | "neutro";

export type CardAgora = {
  id: string;               // slug estável, usado em teste e telemetria
  level: CardLevel;
  title: string;
  /** o dado que disparou a regra, literal */
  evidence: string;
  /** regra em linguagem simples, exibida no "Por quê?" */
  why: string;
  actions: CardAction[];
  /** true quando o texto pode ser reescrito pela LLM */
  narratable: boolean;
};

export type CardAction = {
  label: string;
  kind: "primary" | "secondary";
  /** endpoint que grava — card sem isso não passa no teste */
  intent: string;
};
```

### Ordem das regras

**1. `hipo_ativa` — crítico**
Dispara quando a última leitura do sensor está abaixo de `threshold_mg_dl`, ou
acima dele com tendência de queda acentuada.

- title: `Glicemia baixa`
- evidence: `62 mg/dL às 14:05 · caindo`
- corpo: `hypo_plan.correction_text`, literal, sem reescrita
- actions: `Fiz` (grava `acted_at`) · `Registrar nova medição` · `Emergência`
  (só se `emergency_text` preenchido)
- `narratable: false` — **o texto do plano nunca passa pela LLM**
- efeito colateral: cria `hypo_events` e agenda a reavaliação para
  `recheck_minutes`

**1b. `hipo_sem_plano` — crítico**
Mesma condição, sem linha em `hypo_plan`.

- title: `Glicemia baixa — plano não configurado`
- corpo: texto fixo dizendo que o app não tem a conduta cadastrada e que ela
  deve ser definida com o médico
- actions: `Cadastrar meu plano` · `Registrar nova medição`
- `narratable: false`

**1c. `hipo_recheck` — crítico**
`hypo_events` com `acted_at` preenchido e `recheck_at` nulo, passados os
`recheck_minutes`.

- title: `Hora de conferir de novo`
- evidence: `você agiu às 14:08 · 15 min`
- actions: `Registrar medição`

**2. `interacao_grave` — crítico**
Veredito `blocked === true` da fatia 1, pendente de leitura.

- corpo: a `message` da tabela `substance_interactions`, literal
- actions: `Entendi` · `Ver detalhes`
- `narratable: false`

**3. `insulina_ativa_exercicio` — atenção**
`insulin_logs` com `insulin_kind = 'rapida'` dentro da janela configurada e
sessão de exercício iniciada ou prestes a iniciar.

- title: `Insulina rápida ativa`
- evidence: `aplicada às 13:40 · há 35 min`
- corpo: aviso de risco de queda durante atividade + orientação de carboidrato
  conforme `hypo_plan.correction_text`
- actions: `Adiar treino` · `Registrar glicemia antes`

**4. `medicacao_atrasada` — atenção**
Horário de `medications.reminder_times` já passou sem `medication_logs`
correspondente no dia, e sem `medication_snoozes` ativo.

- title: `Lantus atrasado`
- evidence: `previsto 22:00 · atrasado 40 min`
- actions: `Registrei` (grava `medication_logs`) · `Adiar 15 min` (grava snooze)
- regra dupla: se houver mais de um medicamento atrasado, o card agrega
  (`3 medicamentos atrasados`) e a ação primária abre a agenda

**5. `estoque_baixo` — atenção**
`medications.stock_units` abaixo do necessário para os próximos 7 dias,
calculado por `reminder_times.length`.

- title: `Fiasp acabando`
- evidence: `12 unidades · ~4 dias`
- actions: `Atualizar estoque` · `Adiar aviso`

**6. `contexto_incompleto` — atenção**
Recibo da fatia 3 com duas ou mais fontes em `nao_registrado`.

- title: `Leitura do dia incompleta`
- evidence: `sem registro de alimentação e sono`
- actions: `Registrar refeição` · `Registrar sono`
- razão de existir: sem isso, o app fica em silêncio justamente quando entende
  menos

**7. `janela_exercicio` — neutro**
Todas verdadeiras: glicemia dentro da faixa alvo e estável; nenhuma insulina
rápida na janela ativa; nenhuma sessão registrada hoje; horário dentro da
preferência do usuário.

- title: `Boa janela para treinar`
- evidence: o motivo vem dos dados dele — ex.: `118 mg/dL estável · sem insulina
  rápida ativa · Inferior A pendente`
- actions: `Iniciar sessão` · `Hoje não`
- `narratable: true`

**8. `contencao_pico` — neutro**
Refeição registrada nos últimos 30 min com carboidrato acima da mediana das
refeições dele.

- title: `Caminhada agora ajuda`
- evidence: `almoço com 68 g carb às 12:40`
- corpo: estratégias de contenção que já estão no SYSTEM — caminhada curta,
  ordem de comer, hidratação
- actions: `Registrar caminhada` · `Dispensar`

**9. `padrao_semana` — neutro**
Só aparece quando nada acima disparou. Traz um padrão observado pelo motor de
insights, **com a contagem visível**.

- title: `Padrão observado`
- evidence: `9 ocorrências · 3 semanas`
- regra de supressão: mesma lógica já usada no MuscleMind — abaixo de 3
  ocorrências o motor não afirma padrão, e sem padrão este card não existe
- `narratable: true`

**10. `nada` — neutro**
Nenhuma regra disparou.

- title: `Nada pendente agora`
- evidence: contagem do que foi verificado, ex.: `4 medicamentos em dia ·
  glicemia na faixa`
- actions: `Registrar glicemia` · `Registrar refeição`
- proibido: mensagem motivacional, dica genérica, saudação por horário

---

## 3. Travas de segurança

Implementar como guardas, não como ordem de lista — a ordem pode ser alterada
por engano, as guardas não.

```ts
// Sugestão de exercício é suprimida sempre que houver risco de queda.
function exerciseSuppressed(ctx: Context): boolean {
  return (
    ctx.lastGlucose == null ||                        // sem dado, não sugere
    ctx.lastGlucose < ctx.targetRange.low ||
    ctx.glucoseTrend === "caindo" ||
    ctx.rapidInsulinActive ||
    ctx.openHypoEvent
  );
}
```

Regras adicionais, todas cobertas por teste:

- `hipo_ativa` e `hipo_sem_plano` **nunca** são `narratable`. O texto do plano do
  usuário e o texto fixo do estado sem plano vão para a tela sem passar pela IA.
- Nenhum card contém número de unidades de insulina, em nenhuma circunstância.
  Teste: varrer o texto renderizado de todos os cards contra regex de dose.
- `janela_exercicio` e `contencao_pico` não podem coexistir com qualquer card
  `critico` — a guarda acima já garante, o teste confirma.
- Quando `recibo.missing` contém `glicemia`, apenas cards de registro aparecem.
  Sem leitura, o motor não conclui nada.

---

## 4. Componente — `components/painel/CardAgora.tsx`

Posição: primeiro filho do Painel metabólico, acima do bloco MÓDULOS.

### Estrutura

```
┌────────────────────────────────────────────┐
│ ▌ GLICEMIA BAIXA                    14:05  │
│                                            │
│   62 mg/dL · caindo                        │
│                                            │
│   <correction_text do usuário, literal>    │
│                                            │
│   [ Fiz ]  [ Registrar medição ]  [ ? ]    │
└────────────────────────────────────────────┘
```

### Tokens

Regra-zero: nenhuma fonte, ícone ou biblioteca externa. Reaproveitar os tokens
que o painel já usa sobre `#09090b`.

| nível | borda esquerda | fundo | texto do título |
|---|---|---|---|
| `critico` | 3px âmbar alto contraste | elevação sutil sobre o fundo | âmbar |
| `atencao` | 1px âmbar | igual ao fundo | texto primário |
| `neutro` | nenhuma | igual ao fundo | texto secundário |

Vermelho puro não é usado: sobre fundo quase preto ele perde contraste e vira
ruído. O verde atual da marca fica restrito ao nível `neutro`, para que cor
signifique estado e não decoração.

### Regras de render

- título em caixa alta, curto, sem ponto final
- `evidence` em fonte monoespaçada, mesma da coluna direita dos módulos —
  reforça que é dado lido, não texto redigido
- ação primária à esquerda, secundárias em seguida, `?` por último
- `?` expande `why` no próprio card, sem navegar
- transição só de altura na expansão; nenhuma animação de entrada

### Proibido

Carrossel entre cards. Contador animado. Ícone sem função. Badge de contagem no
card. Card fantasma de loading com altura diferente da final. Texto motivacional.
Saudação por horário do dia.

---

## 5. Testes

**Prioridade**
- hipo + medicação atrasada + janela de exercício simultâneos → `hipo_ativa`, e
  só ele
- todas as regras falsas → `nada`

**Travas**
- glicemia abaixo da faixa → `janela_exercicio` nunca eleito
- insulina rápida ativa → `janela_exercicio` nunca eleito
- `lastGlucose == null` → `janela_exercicio` nunca eleito
- `hipo_ativa` e `hipo_sem_plano` sempre com `narratable === false`
- varredura de dose: nenhum texto de card casa com `/\d+\s*(unidades?|UI|U)\b/i`

**Ciclo do hipo**
- dispara → cria `hypo_events` com `detected_at` e `glucose_mg_dl`
- `Fiz` → grava `acted_at`
- passados `recheck_minutes` → aparece `hipo_recheck`
- medição registrada → grava `recheck_at` e `recheck_mg_dl`, ciclo fecha

**Supressão de padrão**
- 2 ocorrências → `padrao_semana` não existe
- 3 ocorrências → existe, com a contagem no `evidence`

**Ações**
- todo card eleito tem ao menos uma action com `intent` não vazio

---

## 6. O que esta fatia NÃO faz

Não define conduta clínica. `correction_text`, `recheck_minutes` e
`threshold_mg_dl` são do usuário, definidos fora do app.

Não calcula dose, em nenhum card, em nenhuma condição.

Não prevê glicemia futura. `janela_exercicio` descreve o estado atual e a
ausência de fatores de risco conhecidos — não afirma que a glicemia vai se manter.

Não substitui o alarme de medicação existente. O card é a superfície no painel;
o push continua no caminho atual.

---

## Ordem de execução

1. Migrations `hypo_plan` e `hypo_events`, com a tela de cadastro do plano.
2. `card-agora.ts` com as 10 regras e as guardas da seção 3.
3. Testes — travas e ciclo do hipo antes do componente.
4. `CardAgora.tsx` e posicionamento no painel.
5. Ligação com a LLM apenas nos cards `narratable`.
6. **Parar.** Produção depende de autorização explícita do Rivaldo.

---

*Riva's Alexandre*
