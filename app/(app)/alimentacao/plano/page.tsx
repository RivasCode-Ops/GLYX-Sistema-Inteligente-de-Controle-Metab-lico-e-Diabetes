import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AlimentacaoPlanoPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <p className="text-sm text-zinc-400">
        Plano dinâmico alinhado a treino e metas metabólicas. Conteúdo demonstrativo para validação
        de UX, não prescrição nutricional.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Café da manhã", "30-40 g carb", "proteína + fibra para curva estável"],
          ["Almoço", "45-60 g carb", "priorizar integral e caminhada leve"],
          ["Jantar", "25-40 g carb", "reduzir pico noturno"],
        ].map(([title, target, note]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription>{target}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-zinc-400">{note}</CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-emerald-500/20">
        <CardHeader>
          <CardTitle className="text-base">Recomendação demo</CardTitle>
          <CardDescription>
            Ajustar carga glicêmica do almoço e manter caminhada de 10-15 min após refeições maiores.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
