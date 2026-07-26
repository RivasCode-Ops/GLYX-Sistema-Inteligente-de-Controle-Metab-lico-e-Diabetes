import Link from "next/link";
import type { BodyAlert } from "@/lib/body/alerts";

const TONE_CLASS: Record<BodyAlert["tone"], string> = {
  otimo: "border-emerald-900/60 bg-emerald-950/30",
  bom: "border-sky-900/60 bg-sky-950/30",
  atencao: "border-amber-900/60 bg-amber-950/30",
  info: "border-zinc-800 bg-zinc-950/60",
};

const TONE_TITLE: Record<BodyAlert["tone"], string> = {
  otimo: "text-emerald-200",
  bom: "text-sky-200",
  atencao: "text-amber-200",
  info: "text-zinc-200",
};

export function BodyAlertsList({ alerts }: { alerts: BodyAlert[] }) {
  if (!alerts.length) {
    return (
      <p className="text-sm text-zinc-400">
        Nenhum achado ainda. Registre duas medições separadas por algumas semanas para o app
        começar a comparar.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {alerts.map((alert) => (
        <li key={alert.id} className={`rounded-xl border p-3 ${TONE_CLASS[alert.tone]}`}>
          <p className={`text-sm font-medium ${TONE_TITLE[alert.tone]}`}>{alert.title}</p>
          <p className="mt-0.5 text-xs leading-snug text-zinc-400">{alert.body}</p>
          {alert.href ? (
            <Link href={alert.href} className="mt-1 inline-block text-xs text-sky-400 hover:underline">
              Ver detalhes →
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
