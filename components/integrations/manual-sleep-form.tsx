"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logManualSleep } from "@/app/actions/health";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";

function todayInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ManualSleepForm() {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState(todayInputValue);
  const [hours, setHours] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!hours) {
      setError("Informe quantas horas você dormiu.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("snapshot_date", date);
      fd.set("sleep_hours", hours);
      const res = await logManualSleep(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast(`Sono de ${date.split("-").reverse().join("/")} salvo.`);
      setHours("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1">
        <Label htmlFor="sleep_date">Data</Label>
        <Input
          id="sleep_date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-40"
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="sleep_hours">Horas dormidas</Label>
        <Input
          id="sleep_hours"
          type="number"
          min={0}
          max={24}
          step={0.1}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder="ex.: 6.5"
          className="w-28"
        />
      </div>
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? "Salvando…" : "Salvar sono"}
      </Button>
      {error ? <p className="w-full text-xs text-amber-300">{error}</p> : null}
    </form>
  );
}
