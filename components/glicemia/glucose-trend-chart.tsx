"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GlucosePoint } from "@/lib/queries/glucose-series";

type Props = {
  readings: GlucosePoint[];
};

export function GlucoseTrendChart({ readings }: Props) {
  const data = readings.map((r) => ({
    t: new Date(r.recorded_at).toLocaleString("pt-BR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    mgdl: r.value_mg_dl,
    recorded_at: r.recorded_at,
  }));

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 py-16 text-center text-sm text-zinc-500">
        Sem leituras neste período. Registre no painel ou no módulo Glicemia.
      </div>
    );
  }

  return (
    <div className="h-[320px] w-full rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="t" tick={{ fill: "#71717a", fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis
            domain={[40, "auto"]}
            tick={{ fill: "#71717a", fontSize: 11 }}
            width={44}
            label={{ value: "mg/dL", angle: -90, position: "insideLeft", fill: "#52525b", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: "12px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "#a1a1aa" }}
            formatter={(value: number) => [`${value} mg/dL`, "Glicemia"]}
          />
          <Line
            type="monotone"
            dataKey="mgdl"
            stroke="#34d399"
            strokeWidth={2}
            dot={{ r: 3, fill: "#10b981" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
