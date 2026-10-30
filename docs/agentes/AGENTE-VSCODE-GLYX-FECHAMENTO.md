# AGENTE-VSCODE-GLYX-FECHAMENTO

Briefing de implementação — GLyX, fatia 7.
Depende da fatia 3 (recibo de contexto) e da fatia 6 (`adherence_status`).
Integra com a fatia 4 (card de ação) e com o painel redistribuído.

Objetivo: um card no painel que fecha o dia anterior — o que foi apurado, o que
manter, o que melhorar.

---

## 0. Regras de escopo

1. **O motor apura, a IA redige.** Todos os números, comparações e classificações
   saem de código determinístico. O modelo recebe o objeto fechado e escreve o
   texto. Ele não calcula, não conclui e não acrescenta fato.
2. **Comparação é contra ele mesmo.** Linha de base é a mediana dos últimos 14
   dias do próprio usuário. Nenhuma referência populacional, nenhuma meta que ele
   não tenha configurado.
3. **Sem pontuação, sem nota, sem sequência de dias.** Ver seção 5.
4. **Sem atribuição de causa.** O card descreve o que aconteceu junto. Não afirma
   que uma coisa causou a outra.
5. **Lacuna é declarada, nunca preenchida.** Campo `nao_registrado` de ontem
   aparece como lacuna. Nada é inferido de ausência.
6. **Nada de dose.** Aqui como em todas as fatias.
7. **Gerado uma vez por dia e persistido.** O texto de um dia fechado não muda
   entre aberturas do painel.

---

## 1. Migration

Arquivo: `supabase/migrations/<timestamp>_day_summaries.sql`

```sql
create table public.day_summaries (
  user_id      uuid not null references auth.users on delete cascade,
  /** dia fechado, no fuso do usuário */
  summary_date date not null,
  /** apuração determinística — a fonte de verdade do card */
  computed     jsonb not null,
  /** texto redigido pela IA a partir de `computed`; nulo se a IA falhou */
  rendered     text,
  /** versão do motor que produziu `computed`, para invalidar em mudança de regra */
  engine_version integer not null default 1,
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  primary key (user_id, summary_date)
);

alter table public.day_summaries enable row level security;

create policy "day_summaries_own" on public.day_summaries
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

`computed` é a fonte de verdade. Se `rendered` for nulo — falha de rede, erro da
API — o card renderiza direto de `computed`, em formato de tabela. **O card nunca
depende da IA para existir.**

`engine_version` permite recomputar dias antigos quando a regra mudar, sem
recomputar o que não mudou.

---

## 2. Apuração — `lib/painel/fechamento-dia.ts`

```ts
export type Trend = "melhor" | "igual" | "pior" | "sem_base" | "sem_dado";

export type ClosedMetric = {
  key: string;
  label: string;
  /** valor apurado ontem; null quando nao_registrado */
  value: number | null;
  unit: string;
  /** mediana dos últimos 14 dias com dado; null se menos de 5 dias */
  baseline: number | null;
  trend: Trend;
  /** quantos dos últimos 14 dias tinham dado — honestidade da base */
  baselineDays: number;
};

export type DayClose = {
  date: string;
  metrics: ClosedMetric[];
  /** chaves em nao_registrado ontem */
  missing: string[];
  /** true quando faltam 3 ou mais fontes — bloqueia a orientação */
  tooIncomplete: boolean;
  keep: string[];      // chaves com trend 'melhor' ou 'igual' em faixa desejável
  improve: string[];   // chaves com trend 'pior'
};
```

### Métricas apuradas

Todas calculáveis com o schema atual. Nenhuma exige tabela nova.

| chave | apuração | fonte |
|---|---|---|
| `glicemia_media` | média das leituras do dia | leituras do sensor |
| `tempo_na_faixa` | % das leituras dentro da faixa alvo configurada | leituras + faixa alvo |
| `pico_maximo` | maior leitura e horário | leituras |
| `leituras_abaixo` | contagem abaixo do limite inferior configurado | leituras |
| `carboidrato_total` | soma de `carbs_g` | `meals` |
| `refeicoes_pico` | contagem de `glucose_spike = true` | `meals` |
| `minutos_atividade` | soma do dia | exercício |
| `adesao` | `no_horario` sobre o total previsto | `medication_logs.adherence_status` |
| `agua_total` | soma de `amount_ml` onde `kind` conta na meta | `water_logs` |
| `sono` | registros do dia | sono |

`tempo_na_faixa` usa **a faixa que o usuário configurou**, não um valor embutido
no código. Nenhum limiar clínico nasce deste documento.

`adesao` só existe a partir de 07/09/2026 — antes disso `adherence_status` é
`avulso` no backfill da fatia 6. Dias anteriores retornam `sem_base`, não zero.

### Linha de base

Mediana, não média — um dia atípico não desloca a referência.

`baselineDays` vai na saída e aparece na tela. Base de 5 dias e base de 14 dias
não valem o mesmo, e o usuário precisa ver a diferença. Abaixo de 5 dias com
dado, `trend` é `sem_base` e a métrica não entra em `keep` nem em `improve`.

### Bloqueio por incompletude

`tooIncomplete` quando 3 ou mais fontes ficaram `nao_registrado` ontem.

Nesse estado o card não traz orientação. Traz o que foi apurado, lista as
lacunas e oferece o registro. Orientar sobre um dia que o app mal viu é
inventar — e é exatamente o erro que a fatia 3 existe para fechar.

---

## 3. Orientação — manter e melhorar

Derivada por regra, não pelo modelo.

- `trend` `melhor` ou `igual` numa métrica em faixa desejável → entra em `keep`
- `trend` `pior` → entra em `improve`
- `sem_base` ou `sem_dado` → não entra em nenhum dos dois

**Máximo de dois itens em cada lista.** Prioridade: métricas de glicemia primeiro,
depois adesão, depois o resto. Card com sete recomendações não é lido.

As estratégias de melhoria saem do repertório que já está no SYSTEM — distribuir
carboidrato, ordem de comer, caminhada curta após a refeição, troca de preparo,
hidratação. Nenhuma envolve dose, medicação ou suplemento.

**Proibido em `improve`:** sugerir iniciar, suspender ou alterar qualquer
substância. Se a métrica pior for adesão, a orientação é sobre registro e
lembrete, nunca sobre o esquema.

---

## 4. Geração do texto

Uma chamada por dia, por usuário, na primeira abertura do painel após a virada.

Entrada do modelo: o `DayClose` serializado. Instrução:

```
Você recebe a apuração fechada de ontem. Escreva no máximo 5 linhas, em português
simples. Regras: use apenas os números que estão no objeto, sem arredondar nem
converter. Não afirme que uma coisa causou outra. Não sugira iniciar, suspender
ou alterar medicamento ou suplemento. Não calcule nem mencione dose. Métricas em
`missing` são lacunas de registro — mencione como lacuna, nunca como zero. Se
`tooIncomplete` for verdadeiro, escreva apenas o que foi apurado e a lista de
lacunas, sem orientação. Não use pontuação, nota, elogio de desempenho nem
menção a sequência de dias.
```

Falha na chamada: grava `rendered = null` e o card renderiza de `computed`. Não
tentar de novo no mesmo dia — o card em tabela é aceitável e melhor que texto que
muda a cada tentativa.

---

## 5. Sem placar — decisão de produto

O card **não** tem: nota do dia, pontuação, percentual de sucesso, sequência de
dias bons, medalha, emoji de aprovação, comparação com outros usuários.

Motivo: transformar glicemia em desempenho pessoal converte dia ruim em culpa. A
glicemia responde a doença, estresse, sono e absorção — coisas que não estão em
campo nenhum do banco e que o usuário não controla. Pontuar o resultado é
atribuir a ele o que não é dele.

O card compara o usuário com ele mesmo, mostra a direção, e para aí.

Teste: varrer o texto renderizado contra `nota|score|pontuação|sequência|dias
seguidos|parabéns|meta batida`. Reprova o build.

---

## 6. Posição e ciclo de vida

No painel, **abaixo de MÓDULOS e acima do recibo de contexto**. Nunca acima do
card de ação — ontem não compete com agora.

- aparece a partir da virada do dia, expandido
- ao ser lido, grava `read_at` e colapsa para uma linha com o resumo em um trecho
- não reaparece expandido no mesmo dia
- desaparece do painel após a virada seguinte; o histórico fica no módulo Análise

### Forma

```
┌──────────────────────────────────────────────────────┐
│   ONTEM · 06/09                                      │
│                                                      │
│   Tempo na faixa      68%      ↗ base 14d: 61%       │
│   Glicemia média     138 mg/dL ↗ base 14d: 149       │
│   Maior pico         210 mg/dL às 15:20              │
│   Carboidrato        185 g     → base 14d: 180 g     │
│   Atividade           35 min   ↗ base 14d: 12 min    │
│   Adesão              4 de 4                         │
│   Sono                —        sem registro          │
│                                                      │
│   MANTER    caminhada após o almoço                  │
│   MELHORAR  janela das 15h — maior pico do dia       │
│                                                      │
│   base de 14 dias · 11 dias com dado                 │
│   [ Ver detalhe ]  [ Ok ]                            │
└──────────────────────────────────────────────────────┘
```

Números em monoespaçada, como no resto do painel — marca o que foi medido.
Travessão para lacuna, nunca zero. A linha de base aparece com a contagem de dias
que a sustenta.

---

## 7. Testes

**Apuração**
- fixture de dia conhecido → cada métrica bate com o valor esperado
- fonte sem linhas → `value: null`, `trend: 'sem_dado'`, entra em `missing`
- menos de 5 dias com dado → `trend: 'sem_base'`, fora de `keep` e `improve`

**Incompletude**
- 3 fontes ausentes → `tooIncomplete: true`, `keep` e `improve` vazios
- 2 fontes ausentes → orientação normal

**Persistência**
- duas aberturas do painel no mesmo dia → uma única chamada de IA
- `rendered` nulo → card renderiza de `computed` sem erro
- mudança de `engine_version` → recomputo do dia

**Linguagem**
- varredura contra o vocabulário de placar da seção 5
- varredura contra o vocabulário proibido da fatia 5 (`suspenda`, `o motivo é`,
  `é seguro`)
- nenhum texto casa com `/\d+\s*(unidades?|UI|U)\b/i`

**Posição**
- card de ação sempre acima do card de ontem
- `read_at` preenchido → card colapsado

---

## 8. O que esta fatia NÃO faz

Não estabelece causa. `MELHORAR: janela das 15h` diz onde olhar, não por quê.

Não prevê o dia de hoje.

Não avalia a pessoa. Compara métricas com a própria base e mostra direção.

Não recompõe dias anteriores a 07/09/2026 para adesão — o dado não existe.

---

## Ordem de execução

1. Migration `day_summaries`.
2. `fechamento-dia.ts` com as métricas da seção 2 e os testes de apuração.
3. Teste de linguagem de placar — antes da UI.
4. Regras de `keep` e `improve`.
5. Componente e posicionamento.
6. Chamada da IA por último, com o caminho de `rendered = null` testado primeiro.
7. **Parar.** Produção depende de autorização explícita do Rivaldo.

---

*Riva's Alexandre*
