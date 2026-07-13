import { forwardRef } from "react";
import { Flame, Wheat, Beef, Droplet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Label } from "@/components/ui/label";

export type MacroField = "calories" | "carbs_g" | "protein_g" | "fat_g";

const MACRO_META: Record<MacroField, { label: string; unit: string; icon: LucideIcon; color: string }> = {
  calories: { label: "Calorias", unit: "kcal", icon: Flame, color: "text-orange-400" },
  carbs_g: { label: "Carboidrato", unit: "g", icon: Wheat, color: "text-sky-400" },
  protein_g: { label: "Proteína", unit: "g", icon: Beef, color: "text-purple-400" },
  fat_g: { label: "Gordura", unit: "g", icon: Droplet, color: "text-amber-400" },
};

const ORDER: MacroField[] = ["calories", "carbs_g", "protein_g", "fat_g"];

type Props = {
  values: Record<MacroField, string>;
  changed?: Partial<Record<MacroField, boolean>>;
  onChange: (field: MacroField, value: string) => void;
};

export const MacroGrid = forwardRef<HTMLInputElement, Props>(function MacroGrid(
  { values, changed, onChange },
  firstInputRef
) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {ORDER.map((field, i) => {
        const meta = MACRO_META[field];
        const Icon = meta.icon;
        const isChanged = changed?.[field];
        return (
          <div
            key={field}
            className={`rounded-xl border p-2.5 text-center transition-colors ${
              isChanged ? "border-emerald-500/50 bg-emerald-500/5" : "border-zinc-800 bg-zinc-900/40"
            }`}
          >
            <Icon className={`mx-auto h-5 w-5 ${meta.color}`} aria-hidden />
            <Label htmlFor={field} className="sr-only">
              {meta.label}
            </Label>
            <input
              ref={i === 0 ? firstInputRef : undefined}
              id={field}
              type="number"
              value={values[field]}
              onChange={(e) => onChange(field, e.target.value)}
              className="mt-1.5 w-full bg-transparent text-center font-mono text-base text-zinc-50 focus-visible:outline-none"
            />
            <p className="text-[10px] text-zinc-500">
              {meta.label} · {meta.unit}
            </p>
          </div>
        );
      })}
    </div>
  );
});
