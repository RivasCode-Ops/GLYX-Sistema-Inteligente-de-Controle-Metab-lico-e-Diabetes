# AGENTE-VSCODE-GLYX-RECIBO

Briefing de implementação — GLyX, fatia 3.
Depende das fatias 1 e 2 (`AGENTE-VSCODE-GLYX-SAFETY`).

Objetivo: fazer o copiloto distinguir **"não aconteceu"** de **"não foi
registrado"**, e tornar visível — para o usuário e para os testes — exatamente
qual contexto foi montado e enviado ao modelo.

---

## 0. O problema, medido

Na captura do Painel metabólico de 07/09/2026:

- cabeçalho dos módulos: `Atividade hoje: 0 min`
- linha Exercícios: `Hoje: Inferior A`

Duas fontes da mesma grandeza, na mesma tela, discordando. Existe uma sessão de
treino registrada e existe zero minuto de atividade. Uma das duas está errada, ou
as duas medem coisas diferentes sem dizer qual. [medido — captura de tela]

O que a tela exibe não prova o que chegou no prompt: `lib/ai/user-context.ts`
monta o resumo por um caminho de leitura independente do da UI, e nada testa se
os dois concordam.

Consequência para a fatia 1: se a leitura de `medications` retornar vazio por
qualquer motivo — filtro, `active`, RLS —, o checador de interação cruza a
substância candidata contra um conjunto vazio e não encontra nada. Isso sai como
silêncio. Silêncio já foi lido como liberação uma vez.

---

## 1. Regra central

Todo campo do contexto passa a ter **três estados**, nunca dois:

| estado | significado | como a IA deve tratar |
|---|---|---|
| `registrado` | há linhas no período | usar normalmente |
| `zero_confirmado` | há registro explícito de ausência | tratar como fato |
| `nao_registrado` | não há linha nenhuma | declarar a lacuna, não inferir |

`nao_registrado` **nunca** é renderizado como zero, nem no painel nem no prompt.

Essa regra já existe hoje no SYSTEM, mas só para dose de medicação — o prompt
manda tratar contagem baixa como possível falha de registro e não presumir
não-adesão. Esta fatia generaliza a mesma regra para glicemia, alimentação,
exercício, insulina e sono.

---

## 2. `lib/ai/context-receipt.ts`

```ts
export type FieldState = "registrado" | "zero_confirmado" | "nao_registrado";

export type ReceiptField = {
  /** chave do campo, igual à usada no user-context */
  key: string;
  state: FieldState;
  /** contagem de linhas lidas da fonte — SEMPRE um inteiro, nunca null */
  count: number;
  /** resumo curto e legível, ou null quando nao_registrado */
  summary: string | null;
  /** janela consultada, em ISO */
  window: { from: string; to: string };
  /** divergências detectadas contra outra fonte da mesma grandeza */
  divergence: string | null;
};

export type ContextReceipt = {
  builtAt: string;
  userId: string;
  fields: ReceiptField[];
  /** true se qualquer campo tem divergence != null */
  hasDivergence: boolean;
  /** chaves em nao_registrado, para o prompt e para a UI */
  missing: string[];
};
```

### Campos obrigatórios do recibo

Um por fonte que hoje entra em `user-context.ts`:

`glicemia`, `alimentacao`, `exercicio`, `medicacao`, `insulina`, `sono`,
`alertas_48h`, `mapa_risco`.

Nenhum pode ser omitido. Campo ausente do recibo é bug, não é "sem dado" — o
teste de snapshot da seção 6 trava isso.

### Contagem, não booleano

Cada campo devolve `count` inteiro obtido da mesma query que alimenta o
`user-context`. Não derive `count` do resumo já montado: se o resumo estiver
errado, a contagem repete o erro e o recibo perde a função.

---

## 3. Detecção de divergência

Implementar como regras explícitas, uma função por par. Não generalizar.

**`exercicio`** — sessão registrada com duração total zero:

```ts
if (sessions.length > 0 && totalMinutes === 0) {
  divergence = `${sessions.length} sessão(ões) registrada(s) com 0 min de duração`;
}
```

Este é o caso da captura. A causa provável é sessão de força criada sem campo de
duração preenchido, enquanto o contador de atividade soma minutos. Se for isso, a
correção de produto é separada — o recibo apenas para de esconder o conflito.

**`medicacao`** — doses órfãs:

```ts
if (orphanLogs > 0) {
  divergence = `${orphanLogs} dose(s) sem medicamento associado (medication_id null)`;
}
```

`medication_logs.medication_id` é `on delete set null`. Qualquer contagem de
adesão que ignore isso está errada.

**`alimentacao`** — refeição marcada como causadora de pico sem glicemia na
janela:

```ts
if (spikeMeals > 0 && glucoseReadingsAfterSpike === 0) {
  divergence = `${spikeMeals} refeição(ões) marcada(s) como pico sem leitura de glicemia posterior`;
}
```

**`insulina`** — `insulin_kind = 'outra'`:

```ts
if (kindOther > 0) {
  divergence = `${kindOther} registro(s) de insulina sem tipo definido — não entram no checador de interação`;
}
```

Esse é relevante para a fatia 1: `'outra'` não mapeia para `insulina_basal` nem
`insulina_rapida`, então some do conjunto de substâncias em uso. O usuário
precisa saber disso.

---

## 4. Injeção no prompt

O recibo entra no bloco `userContext`, **no topo**, antes dos dados:

```
RECIBO DE CONTEXTO (montado em 2026-09-07T14:32:11Z)
glicemia      | registrado      | 12 leituras | ultima 125 mg/dL as 14:05
alimentacao   | nao_registrado  |  0 linhas   | janela: hoje
exercicio     | registrado      |  1 sessao   | DIVERGENCIA: 1 sessao com 0 min
medicacao     | registrado      |  4 ativos   | 2 med, 2 supplement
insulina      | registrado      |  3 registros ultimos 7d
sono          | nao_registrado  |  0 linhas   | janela: ultimos 7 dias
alertas_48h   | zero_confirmado |  0 alertas
mapa_risco    | registrado      | score de 06/09

CAMPOS SEM REGISTRO: alimentacao, sono
```

## 5. Patch no SYSTEM

Novo parágrafo em `app/api/ai/chat/route.ts`, na constante `SYSTEM`. Insira
**acima** do bloco final de anti-injeção, que deve continuar fechando o prompt.

```
RECIBO DE CONTEXTO. O resumo começa com um RECIBO listando o estado de cada
fonte de dado. Ele é obrigatório na sua leitura. Campo marcado nao_registrado
significa que o app não recebeu o dado — NÃO significa que o evento não
aconteceu. Nunca interprete nao_registrado como zero, como jejum, como repouso
ou como ausência de sintoma. Ao responder, declare a lacuna em uma frase curta
("não tenho registro de alimentação hoje") e siga a análise apenas com os campos
registrados. Campo marcado zero_confirmado é fato e pode ser usado normalmente.
Quando houver DIVERGENCIA em algum campo, mencione-a e não escolha um dos dois
valores por conta própria. Se CAMPOS SEM REGISTRO listar duas ou mais fontes,
diga ao usuário que a leitura do dia está incompleta antes de qualquer conclusão.
```

E acrescente uma frase ao parágrafo que já existe sobre refeições:

```
A tabela de refeições guarda apenas macros somados por refeição, sem os itens
individuais. Você não sabe a quantidade de nenhum alimento específico. Se
perguntarem "quanto de X eu comi", responda que o app não guarda esse detalhe.
```

---

## 6. Testes

**Snapshot de contexto contra dataset fixo.** O teste mais importante da fatia:

- fixture com contagens conhecidas (12 leituras de glicemia, 0 refeições,
  1 sessão de exercício com 0 min, 4 medicamentos ativos, 0 registros de sono)
- monta o recibo
- compara o objeto inteiro contra snapshot gravado

Qualquer mudança em `user-context.ts` que altere silenciosamente o que chega no
prompt passa a quebrar esse teste.

**Estados**
- fonte sem linhas → `nao_registrado`, `count === 0`, `summary === null`
- fonte com linha explícita de ausência → `zero_confirmado`
- nunca `nao_registrado` com `count > 0`

**Divergência**
- 1 sessão + 0 min → `divergence !== null`
- 1 sessão + 45 min → `divergence === null`
- dose órfã presente → `divergence` cita a contagem

**Completude**
- o recibo contém as 8 chaves obrigatórias, sempre, mesmo com banco vazio

**Cruzamento com a fatia 1**
- se `medicacao.count === 0`, o checador de interação não pode devolver
  `blocked: false` sem marcar o contexto como incompleto

---

## 7. UI — recibo visível

No Painel metabólico, abaixo da lista de módulos, um bloco colapsado
"Como esta leitura foi montada", fechado por padrão. Aberto, mostra a mesma
tabela do recibo.

Regras de exibição:

- campo `nao_registrado` aparece com travessão (`—`), **nunca com `0`**
- campo com divergência aparece marcado, com o texto da divergência
- o cabeçalho `Atividade hoje` só mostra `0 min` quando o estado for
  `zero_confirmado`; em `nao_registrado` mostra `—`

Essa última regra sozinha já corrige o conflito da captura.

---

## 8. O que esta fatia NÃO resolve

**O teto do schema de alimentação.** `meals` não tem itens. Nenhum recibo faz o
banco responder "quanto arroz". A IA passa a admitir a limitação em vez de
inventar — isso é honestidade, não capacidade nova. Ganhar a capacidade exige
`meal_items` e uma base de alimentos, o que é refatoração de schema com
migração de histórico.

**A causa da divergência de exercício.** O recibo expõe; não conserta. A
correção depende de decidir se sessão de força entra ou não no contador de
minutos de atividade. Decisão de produto, sua.

**Qualidade da interpretação.** O recibo melhora o que o modelo sabe, não o
quanto ele raciocina. Trocar Kimi por Claude melhora a redação e o encadeamento;
o recibo melhora a matéria-prima. São ganhos independentes e ambos necessários.

---

## Ordem de execução

1. `context-receipt.ts` + as cinco regras de divergência.
2. Injeção no `user-context.ts`, no topo do bloco.
3. Patch do SYSTEM.
4. Testes, com o snapshot gravado a partir do fixture — não a partir do banco real.
5. Bloco de UI no painel.
6. **Parar.** Produção depende de autorização explícita do Rivaldo.

---

*Riva's Alexandre*
