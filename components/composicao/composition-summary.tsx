import { METHOD_LABEL, waistToHeightBand, type BodyComposition } from "@/lib/body/composition";

const TONE_CLASS: Record<string, string> = {
  ok: "text-emerald-300",
  atencao: "text-amber-300",
  alto: "text-red-300",
};

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${tone ?? "text-zinc-100"}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] leading-snug text-zinc-500">{hint}</div> : null}
    </div>
  );
}

/**
 * Números da última medição. O método da estimativa de gordura aparece SEMPRE
 * junto do valor: sem ele, comparar 18% de dobras com 22% de fita parece piora
 * quando é só troca de régua.
 */
export function CompositionSummary({
  composition,
  measuredOn,
}: {
  composition: BodyComposition;
  measuredOn: string;
}) {
  const band = waistToHeightBand(composition.waistToHeight);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile
          label="Peso"
          value={composition.weightKg != null ? `${composition.weightKg} kg` : "—"}
        />
        <Tile label="IMC" value={composition.bmi != null ? String(composition.bmi) : "—"} />
        <Tile
          label="Cintura / altura"
          value={composition.waistToHeight != null ? String(composition.waistToHeight) : "—"}
          hint={band?.label}
          tone={band ? TONE_CLASS[band.tone] : undefined}
        />
        <Tile
          label="Gordura estimada"
          value={composition.bodyFatPercent != null ? `${composition.bodyFatPercent}%` : "—"}
          hint={composition.bodyFatMethod ? `por ${METHOD_LABEL[composition.bodyFatMethod]}` : "faltam medidas"}
        />
        <Tile
          label="Massa magra"
          value={composition.leanMassKg != null ? `${composition.leanMassKg} kg` : "—"}
        />
        <Tile
          label="FFMI"
          value={composition.ffmi != null ? String(composition.ffmi) : "—"}
          hint="massa magra ajustada à altura"
        />
      </div>
      <p className="mt-2 text-[11px] leading-snug text-zinc-500">
        Medição de {new Date(`${measuredOn}T12:00:00Z`).toLocaleDateString("pt-BR")}. Percentual de
        gordura por fita ou dobra é <strong>estimativa</strong>, com erro de 3 a 4 pontos — serve
        para acompanhar a sua tendência, não para comparar com exame ou com outra pessoa.
      </p>
    </div>
  );
}
