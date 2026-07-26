import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBodySnapshot } from "@/lib/queries/body-composition";
import { MeasurementForm } from "@/components/composicao/measurement-form";
import { BODY_FIELDS, measurementValue } from "@/lib/body/fields";

export const metadata = { title: "Medidas corporais — GLYX" };

export default async function MedidasPage() {
  const snapshot = await getBodySnapshot();
  const latest = snapshot?.latest ?? null;
  const previous = snapshot?.previous ?? null;
  const today = new Date().toISOString().slice(0, 10);

  const rows = BODY_FIELDS.map((field) => ({
    field,
    current: measurementValue(latest, field.key),
    before: measurementValue(previous, field.key),
  })).filter((r) => r.current != null || r.before != null);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Nova medição</CardTitle>
          <CardDescription>
            Uma medição por data — salvar de novo na mesma data substitui a anterior.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MeasurementForm latest={latest} defaultDate={today} />
        </CardContent>
      </Card>

      {rows.length ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Última medição</CardTitle>
            <CardDescription>
              {latest ? new Date(`${latest.measured_on}T12:00:00Z`).toLocaleDateString("pt-BR") : "—"}
              {previous
                ? ` · comparada com ${new Date(`${previous.measured_on}T12:00:00Z`).toLocaleDateString("pt-BR")}`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase text-zinc-500">
                    <th className="border-b border-zinc-800 py-1.5">Medida</th>
                    <th className="border-b border-zinc-800 py-1.5 text-right">Anterior</th>
                    <th className="border-b border-zinc-800 py-1.5 text-right">Atual</th>
                    <th className="border-b border-zinc-800 py-1.5 text-right">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ field, current, before }) => {
                    const delta =
                      current != null && before != null
                        ? Math.round((current - before) * 10) / 10
                        : null;
                    return (
                      <tr key={field.key}>
                        <td className="border-b border-zinc-900 py-1.5 text-zinc-300">
                          {field.label}
                        </td>
                        <td className="border-b border-zinc-900 py-1.5 text-right text-zinc-500">
                          {before ?? "—"}
                        </td>
                        <td className="border-b border-zinc-900 py-1.5 text-right text-zinc-100">
                          {current ?? "—"}
                        </td>
                        <td
                          className={`border-b border-zinc-900 py-1.5 text-right ${
                            delta == null
                              ? "text-zinc-600"
                              : delta > 0
                                ? "text-emerald-300"
                                : delta < 0
                                  ? "text-sky-300"
                                  : "text-zinc-500"
                          }`}
                        >
                          {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-zinc-500">
              Variação de até 1 cm (ou 0,5 kg) está dentro do erro normal de medição — o app trata
              como estabilidade, não como evolução.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
