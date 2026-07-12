"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

/**
 * Teste de risco de diabetes tipo 2 — escore validado da ADA (American
 * Diabetes Association). Educativo: pontuação >= 5 indica risco alto e
 * a orientação é procurar um médico para exame de glicemia.
 */

type Answers = {
  age: number | null;
  sex: "m" | "f" | null;
  gestational: boolean | null;
  family: boolean | null;
  pressure: boolean | null;
  active: boolean | null;
  heightCm: string;
  weightKg: string;
};

const initial: Answers = {
  age: null,
  sex: null,
  gestational: null,
  family: null,
  pressure: null,
  active: null,
  heightCm: "",
  weightKg: "",
};

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-2.5 text-sm transition ${
        selected
          ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
          : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
      }`}
    >
      {children}
    </button>
  );
}

function Question({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
      <p className="mb-3 text-sm font-medium text-zinc-200">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function AdaRiskTest() {
  const [a, setA] = useState<Answers>(initial);

  const bmi = useMemo(() => {
    const h = Number.parseFloat(a.heightCm.replace(",", ".")) / 100;
    const w = Number.parseFloat(a.weightKg.replace(",", "."));
    if (!Number.isFinite(h) || !Number.isFinite(w) || h <= 0.5 || w <= 20) return null;
    return w / (h * h);
  }, [a.heightCm, a.weightKg]);

  const complete =
    a.age !== null &&
    a.sex !== null &&
    a.family !== null &&
    a.pressure !== null &&
    a.active !== null &&
    bmi !== null &&
    (a.sex === "m" || a.gestational !== null);

  const score = useMemo(() => {
    if (!complete) return null;
    let s = 0;
    s += a.age ?? 0;
    if (a.sex === "m") s += 1;
    if (a.sex === "f" && a.gestational) s += 1;
    if (a.family) s += 1;
    if (a.pressure) s += 1;
    if (a.active === false) s += 1;
    if (bmi! >= 40) s += 3;
    else if (bmi! >= 30) s += 2;
    else if (bmi! >= 25) s += 1;
    return s;
  }, [a, bmi, complete]);

  return (
    <div className="space-y-4">
      <Question title="1. Qual a sua idade?">
        {(
          [
            [0, "Menos de 40"],
            [1, "40 a 49"],
            [2, "50 a 59"],
            [3, "60 ou mais"],
          ] as const
        ).map(([v, label]) => (
          <Chip key={v} selected={a.age === v} onClick={() => setA({ ...a, age: v })}>
            {label}
          </Chip>
        ))}
      </Question>

      <Question title="2. Sexo biológico">
        <Chip selected={a.sex === "m"} onClick={() => setA({ ...a, sex: "m", gestational: null })}>
          Masculino
        </Chip>
        <Chip selected={a.sex === "f"} onClick={() => setA({ ...a, sex: "f" })}>
          Feminino
        </Chip>
      </Question>

      {a.sex === "f" ? (
        <Question title="2b. Já teve diabetes gestacional?">
          <Chip selected={a.gestational === true} onClick={() => setA({ ...a, gestational: true })}>
            Sim
          </Chip>
          <Chip
            selected={a.gestational === false}
            onClick={() => setA({ ...a, gestational: false })}
          >
            Não
          </Chip>
        </Question>
      ) : null}

      <Question title="3. Pai, mãe, irmão ou irmã com diabetes?">
        <Chip selected={a.family === true} onClick={() => setA({ ...a, family: true })}>
          Sim
        </Chip>
        <Chip selected={a.family === false} onClick={() => setA({ ...a, family: false })}>
          Não
        </Chip>
      </Question>

      <Question title="4. Tem pressão alta (ou toma remédio para pressão)?">
        <Chip selected={a.pressure === true} onClick={() => setA({ ...a, pressure: true })}>
          Sim
        </Chip>
        <Chip selected={a.pressure === false} onClick={() => setA({ ...a, pressure: false })}>
          Não
        </Chip>
      </Question>

      <Question title="5. Pratica atividade física regularmente?">
        <Chip selected={a.active === true} onClick={() => setA({ ...a, active: true })}>
          Sim
        </Chip>
        <Chip selected={a.active === false} onClick={() => setA({ ...a, active: false })}>
          Não
        </Chip>
      </Question>

      <Question title="6. Altura e peso (para o cálculo do IMC)">
        <input
          inputMode="decimal"
          placeholder="altura em cm — ex.: 172"
          value={a.heightCm}
          onChange={(e) => setA({ ...a, heightCm: e.target.value })}
          className="h-11 w-44 rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100"
        />
        <input
          inputMode="decimal"
          placeholder="peso em kg — ex.: 86"
          value={a.weightKg}
          onChange={(e) => setA({ ...a, weightKg: e.target.value })}
          className="h-11 w-44 rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100"
        />
        {bmi ? <span className="self-center text-xs text-zinc-500">IMC {bmi.toFixed(1)}</span> : null}
      </Question>

      {score !== null ? (
        <div
          className={`rounded-2xl border p-5 ${
            score >= 5
              ? "border-amber-500/40 bg-amber-500/10"
              : "border-emerald-500/40 bg-emerald-500/10"
          }`}
        >
          <p className="text-sm uppercase tracking-wide text-zinc-400">Sua pontuação</p>
          <p className={`text-4xl font-bold ${score >= 5 ? "text-amber-300" : "text-emerald-300"}`}>
            {score} <span className="text-base font-normal text-zinc-500">/ 11</span>
          </p>
          {score >= 5 ? (
            <div className="mt-2 space-y-2 text-sm text-zinc-200">
              <p>
                <strong>Risco aumentado para diabetes tipo 2</strong> (escore ADA ≥ 5). Isso NÃO é
                um diagnóstico — é um sinal para investigar.
              </p>
              <p>
                Próximo passo: procure um médico e peça uma <strong>glicemia de jejum</strong> ou{" "}
                <strong>hemoglobina glicada</strong> — exames simples e baratos.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-200">
              Risco baixo pelo escore ADA. Mantenha os bons hábitos — e refaça o teste a cada ano.
            </p>
          )}
          <p className="mt-3 text-xs text-zinc-500">
            Quer acompanhar glicemia, alimentação e medicação num só lugar?{" "}
            <Link href="/register" className="text-emerald-400 underline">
              Crie sua conta gratuita no GLYX
            </Link>
          </p>
        </div>
      ) : (
        <p className="text-center text-xs text-zinc-600">
          Responda tudo para ver sua pontuação.
        </p>
      )}

      <p className="text-[11px] leading-4 text-zinc-600">
        Baseado no ADA Diabetes Risk Test (American Diabetes Association). Ferramenta educativa de
        triagem — não substitui avaliação médica nem exames laboratoriais.
      </p>
    </div>
  );
}
