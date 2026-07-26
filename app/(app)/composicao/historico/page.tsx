import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBodySnapshot } from "@/lib/queries/body-composition";
import { BodyMetricChart, type MetricPoint } from "@/components/composicao/body-metric-chart";
import { BODY_FIELDS, measurementValue, type BodyMeasurementKey } from "@/lib/body/fields";

export const metadata = { title: "Histórico corporal — GLYX" };

/** Medidas com gráfico próprio, na ordem em que interessam para composição. */
const CHART_KEYS: BodyMeasurementKey[] = [
  "weight_kg",
  "waist_cm",
  "chest_cm",
  "shoulders_cm",
  "arm_right_flexed_cm",
  "thigh_right_cm",
  "calf_right_cm",
];

export default async function HistoricoCorporalPage() {
  const snapshot = await getBodySnapshot();

  if (!snapshot || snapshot.history.length < 2) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-zinc-400">
          O histórico aparece a partir da segunda medição registrada.
        </p>
      </div>
    );
  }

  const { history, compositionSeries, goals } = snapshot;
  const targetByKey = new Map(goals.map((g) => [g.key, g.target]));

  const seriesFor = (key: BodyMeasurementKey): MetricPoint[] =>
    history
      .map((m) => ({ date: m.measured_on, value: measurementValue(m, key) }))
      .filter((p): p is MetricPoint => p.value != null);

  const leanSeries: MetricPoint[] = compositionSeries
    .filter((c) => c.composition.leanMassKg != null)
    .map((c) => ({ date: c.date, value: c.composition.leanMassKg! }));
  const fatSeries: MetricPoint[] = compositionSeries
    .filter((c) => c.composition.fatMassKg != null)
    .map((c) => ({ date: c.date, value: c.composition.fatMassKg! }));
  const fatPercentSeries: MetricPoint[] = compositionSeries
    .filter((c) => c.composition.bodyFatPercent != null)
    .map((c) => ({ date: c.date, value: c.composition.bodyFatPercent! }));

  const charts = CHART_KEYS.map((key) => ({
    key,
    field: BODY_FIELDS.find((f) => f.key === key)!,
    points: seriesFor(key),
  })).filter((c) => c.points.length >= 2);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Composição estimada</CardTitle>
          <CardDescription>
            Derivada das suas medidas — some quando falta dado, em vez de repetir o último valor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {leanSeries.length >= 2 ? (
            <BodyMetricChart label="Massa magra estimada" unit="kg" points={leanSeries} />
          ) : null}
          {fatSeries.length >= 2 ? (
            <BodyMetricChart label="Gordura estimada" unit="kg" points={fatSeries} />
          ) : null}
          {fatPercentSeries.length >= 2 ? (
            <BodyMetricChart label="Gordura estimada" unit="%" points={fatPercentSeries} />
          ) : null}
          {leanSeries.length < 2 && fatPercentSeries.length < 2 ? (
            <p className="text-sm text-zinc-400">
              Para estimar massa magra e gordura o app precisa de sexo e altura no perfil, mais
              cintura e pescoço (ou as três dobras do seu protocolo) em pelo menos duas medições.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Medidas</CardTitle>
          <CardDescription>Linha tracejada = meta cadastrada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {charts.length ? (
            charts.map((chart) => (
              <BodyMetricChart
                key={chart.key}
                label={chart.field.label}
                unit={chart.field.unit}
                points={chart.points}
                target={targetByKey.get(chart.key) ?? null}
              />
            ))
          ) : (
            <p className="text-sm text-zinc-400">
              Registre a mesma medida em pelo menos duas datas para ver a evolução.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
