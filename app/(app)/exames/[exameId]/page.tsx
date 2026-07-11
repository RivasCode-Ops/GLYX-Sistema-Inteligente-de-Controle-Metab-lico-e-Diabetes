import Link from "next/link";
import { notFound } from "next/navigation";
import { ExamInterpretSection } from "@/components/exams/exam-interpret-section";
import { isOpenAIConfigured, isSupabaseConfigured } from "@/lib/env";
import { parsedExamSummarySchema } from "@/lib/exams/types";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ exameId: string }> };

export default async function ExameDetailPage({ params }: Props) {
  const { exameId } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 text-sm text-zinc-400">
        Configure o Supabase para carregar laudos.
      </div>
    );
  }

  const supabase = await createClient();
  if (!supabase) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: exam } = await supabase
    .from("exams")
    .select("*")
    .eq("id", exameId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!exam) notFound();

  const parsed = parsedExamSummarySchema.safeParse(exam.parsed_summary);
  const initialSummary = parsed.success ? parsed.data : null;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Link href="/exames" className="text-sm text-emerald-400 hover:underline">
        ← Voltar aos exames
      </Link>
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">{exam.title ?? "Exame"}</h2>
        <p className="font-mono text-xs text-zinc-500">{exam.id}</p>
      </div>

      <ExamInterpretSection
        examId={exam.id}
        initialSummary={initialSummary}
        openAiConfigured={isOpenAIConfigured()}
      />

      <div>
        <h3 className="mb-2 text-sm font-medium text-zinc-400">Texto original</h3>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <pre className="whitespace-pre-wrap text-sm text-zinc-300">
            {exam.raw_text ?? "—"}
          </pre>
        </div>
      </div>
    </div>
  );
}
