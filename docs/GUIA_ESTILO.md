# Guia de estilo interno — GLYX

Uma página só. Objetivo: parar de inventar um jeito novo de mostrar a mesma coisa em cada tela nova. Sempre que uma tela precisar de um dos 4 padrões abaixo, reaproveite o componente — não crie um card de texto corrido.

## 1. Pílula de status (`components/ui/status-pill.tsx`)

Quando: um estado discreto, binário ou de poucas opções (conectado/desconectado, agendado/pendente, impacto baixo/médio/alto, tom de aviso).

```tsx
<StatusPill tone="emerald">Conectado</StatusPill>
```

Tons: `emerald` (bom/ok), `amber` (atenção), `red` (crítico/erro), `sky` (informativo neutro), `zinc` (desabilitado/sem dado).

Não usar `<span>`/`<p>` colorido solto para status — isso é o padrão antigo que estamos eliminando (visto em Alimentação, Integrações antes desta limpeza).

## 2. Tag de severidade

Mesma ideia da pílula, mas para risco clínico (Mapa de risco: baixo/médio/alto/crítico). Já existe em `mapa-risco/page.tsx` — reaproveitar aquele componente, não recriar.

## 3. Grid de números (métricas-resumo)

Quando: 2-4 números-chave de uma sessão/resultado (kcal, carb, proteína, gordura; ou dose, glicemia, tendência).

```tsx
<div className="grid grid-cols-4 gap-2 text-center">
  {items.map(([label, value]) => (
    <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-2.5">
      <p className="font-mono text-lg">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
    </div>
  ))}
</div>
```

Não usar parágrafo corrido para enumerar números — usar o grid.

## 4. Ícone de linha = ícone do menu

Quando uma tela referencia um módulo/conceito que já tem ícone na navegação lateral (`lib/navigation.ts`), reaproveitar o MESMO ícone `lucide-react` — nunca escolher um novo. Isso também resolve a ambiguidade "Sistema" vs. "Admin": os dois devem usar o ícone já definido em `lib/navigation.ts` para aquele item, não um novo.

Exemplos já aplicados: `Dumbbell`/`HeartPulse`/`Target` nos itens de treino (`goal-training-card.tsx`), `Plug` em Integrações (`integration-panel.tsx`, `google-fit-connect.tsx`).

## O que evitar

Card único com título + parágrafo corrido + lista de bullets com traço + aviso colorido no final. Esse é o padrão "muro de texto" — se a informação é status, severidade ou métrica, ela cabe em um dos 3 componentes acima. Se é lista de passos/dicas, use ícone por item (padrão 4), não traço.

## Fora de escopo

Nada disto pede ilustração customizada, banco de imagens ou redesenho visual do zero — é reaproveitamento de componentes já em produção.
