import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { saveExamDraft } from "@/app/actions/exams";
import { ExamPhotoForm } from "@/components/exams/exam-photo-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { demoExams } from "@/lib/demo/data";
import { EXAM_TYPE_LABEL, parseExamType } from "@/lib/exams/types";

export default async function ExamesPage() {
  let exams: { id: string; title: string | null; created_at: string; exam_type?: string | null }[] =
    [];
  const demoMode = !isSupabaseConfigured();

  async function saveExamDraftAction(formData: FormData): Promise<void> {
    "use server";
    await saveExamDraft(formData);
  }

  if (demoMode) {
    exams = demoExams;
  } else {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("exams")
          .select("id, title, created_at, exam_type")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20);
        exams = data ?? [];
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <p className="text-sm text-zinc-400">
        Laboratorial, ECG ou Raio-X por foto/PDF/texto — interpretação educativa. O GLYX não substitui
        o médico, o laboratório nem o laudo de imagem.
      </p>

      {!demoMode ? <ExamPhotoForm /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo registro (texto)</CardTitle>
          <CardDescription>Cole trechos do PDF ou digite resultados.</CardDescription>
        </CardHeader>
        <CardContent>
          {demoMode ? (
            <p className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
              Exames fictícios para demonstrar o fluxo de organização e interpretação educativa.
            </p>
          ) : null}
          <form action={saveExamDraftAction} className="grid gap-4">
            <div className="grid gap-1">
              <Label htmlFor="exam_type">Tipo</Label>
              <select
                id="exam_type"
                name="exam_type"
                defaultValue="lab"
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
              >
                <option value="lab">Laboratorial</option>
                <option value="ecg">ECG</option>
                <option value="rx">Raio-X</option>
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="title">Título</Label>
              <Input id="title" name="title" required placeholder="ex.: Hemograma jan/2026" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="raw_text">Conteúdo</Label>
              <textarea
                id="raw_text"
                name="raw_text"
                required
                rows={6}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                placeholder="Cole o texto do exame..."
              />
            </div>
            <Button type="submit">Salvar</Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Salvos</h2>
        {exams.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nenhum exame ainda. Cole o texto do laudo ou envie uma foto acima — o resumo
            interpretado pela IA aparece aqui.
          </p>
        ) : (
          <ul className="space-y-2">
            {exams.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/exames/${e.id}`}
                  className="flex justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm hover:border-emerald-500/30"
                >
                  <span className="text-zinc-200">
                    <span className="mr-2 rounded-md border border-zinc-700 px-1.5 py-0.5 text-[10px] uppercase text-zinc-400">
                      {EXAM_TYPE_LABEL[parseExamType(e.exam_type)]}
                    </span>
                    {e.title ?? "Sem título"}
                  </span>
                  <span className="font-mono text-xs text-zinc-500">
                    {new Date(e.created_at).toLocaleDateString("pt-BR")} →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
