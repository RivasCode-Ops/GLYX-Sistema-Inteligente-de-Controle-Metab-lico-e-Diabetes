import type { SafetyPayload } from "@/lib/safety/present";

/**
 * Alerta de interação. Renderiza SEMPRE a partir do veredito determinístico que
 * o servidor calculou — nunca do texto do modelo, e sem esperar stream algum.
 *
 * Não existe estado verde aqui. O melhor caso é `sem_alerta`, em cinza, com a
 * legenda dizendo que o app não encontrou interação na base dele e que isso não
 * é atestado de segurança. Um card verde escrito "Seguro" foi o que o app
 * mostrou no incidente da berberina com insulina.
 */

type Severity = SafetyPayload["findings"][number]["severity"];

const TONE_STYLE: Record<SafetyPayload["tone"], string> = {
  evitar: "border-red-500/40 bg-red-500/10",
  atencao: "border-amber-500/40 bg-amber-500/10",
  sem_alerta: "border-zinc-700 bg-zinc-900/60",
};

const TONE_TEXT: Record<SafetyPayload["tone"], string> = {
  evitar: "text-red-300",
  atencao: "text-amber-300",
  sem_alerta: "text-zinc-300",
};

const SEVERITY_TEXT: Record<Severity, string> = {
  grave: "text-red-300",
  moderada: "text-amber-300",
  leve: "text-zinc-300",
};

export function InteractionAlert({
  safety,
  className = "",
}: {
  safety: SafetyPayload;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border p-3 ${TONE_STYLE[safety.tone]} ${className}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${TONE_TEXT[safety.tone]}`}>
        {safety.label}
      </p>

      {safety.findings.length ? (
        <ul className="mt-2 space-y-2 text-xs">
          {safety.findings.map((f) => (
            <li key={`${f.substanceA}-${f.substanceB}`}>
              <span className={`font-semibold uppercase ${SEVERITY_TEXT[f.severity]}`}>
                {f.severity}
              </span>
              <span className="text-zinc-400">
                {" "}
                · {f.substanceA} × {f.substanceB}
              </span>
              <p className="mt-0.5 text-zinc-200">{f.message}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {safety.unknownNote ? (
        <p className="mt-2 text-xs text-zinc-200">{safety.unknownNote}</p>
      ) : null}

      {safety.noFindingNote ? (
        <p className="mt-2 text-xs text-zinc-400">{safety.noFindingNote}</p>
      ) : null}

      <p className="mt-2 text-[11px] leading-4 text-zinc-500">{safety.doctorNote}</p>
    </div>
  );
}
