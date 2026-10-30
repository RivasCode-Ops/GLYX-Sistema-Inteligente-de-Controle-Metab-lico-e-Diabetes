import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Frequência do alarme — em que dias ele toca. Mesmo campo no cadastro manual,
 * no cadastro por foto e na edição (D1, D2).
 *
 * Sem estado próprio: com `onChange` serve ao formulário controlado do cadastro
 * por foto; sem ele, os `name` bastam para o formulário de servidor.
 */
export type ValoresDeFrequencia = {
  cadence?: string | null;
  cadence_weekday?: number | null;
  cadence_interval_days?: number | null;
  cadence_anchor_on?: string | null;
};

type Campo = "cadence" | "cadence_weekday" | "cadence_interval_days" | "cadence_anchor_on";

const SELECT = "h-8 rounded-md border border-zinc-800 bg-zinc-950 px-2 text-sm text-zinc-100";

export function CampoFrequencia({
  valores = {},
  rotuloVazio,
  ajuda,
  onChange,
}: {
  valores?: ValoresDeFrequencia;
  /** Texto da opção vazia: no cadastro "Escolha…", na edição "não muda se ficar assim". */
  rotuloVazio: string;
  ajuda?: string;
  onChange?: (campo: Campo, valor: string) => void;
}) {
  const muda = (campo: Campo) =>
    onChange
      ? (e: { target: { value: string } }) => onChange(campo, e.target.value)
      : undefined;
  return (
    <fieldset className="grid gap-2 rounded-lg border border-zinc-800/60 p-2 sm:col-span-2">
      <legend className="px-1 text-xs text-zinc-400">Frequência — em que dias o alarme toca</legend>
      <div className="grid gap-2 sm:grid-cols-4">
        <div className="grid gap-1">
          <Label className="text-xs">Frequência</Label>
          <select name="cadence" defaultValue={valores.cadence ?? ""} onChange={muda("cadence")} className={SELECT}>
            <option value="">{rotuloVazio}</option>
            <option value="diaria">Todo dia</option>
            <option value="semanal">Uma vez por semana</option>
            <option value="intervalo">A cada N dias</option>
          </select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Dia (se semanal)</Label>
          <select
            name="cadence_weekday"
            defaultValue={valores.cadence_weekday != null ? String(valores.cadence_weekday) : ""}
            onChange={muda("cadence_weekday")}
            className={SELECT}
          >
            <option value="">—</option>
            <option value="0">Domingo</option>
            <option value="1">Segunda</option>
            <option value="2">Terça</option>
            <option value="3">Quarta</option>
            <option value="4">Quinta</option>
            <option value="5">Sexta</option>
            <option value="6">Sábado</option>
          </select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">A cada (dias)</Label>
          <Input
            name="cadence_interval_days"
            type="number"
            min={2}
            max={90}
            defaultValue={valores.cadence_interval_days ?? ""}
            onChange={muda("cadence_interval_days")}
            className="h-8 text-sm"
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Primeira dose (se a cada N dias)</Label>
          <Input
            name="cadence_anchor_on"
            type="date"
            defaultValue={valores.cadence_anchor_on ?? ""}
            onChange={muda("cadence_anchor_on")}
            className="h-8 text-sm"
          />
        </div>
      </div>
      {ajuda ? <p className="text-[11px] text-zinc-600">{ajuda}</p> : null}
    </fieldset>
  );
}
