import { z } from "zod";

/** Modalidade do exame — lab, ECG ou imagem (Raio-X) */
export const examTypeSchema = z.enum(["lab", "ecg", "rx"]);
export type ExamType = z.infer<typeof examTypeSchema>;

export const EXAM_TYPE_LABEL: Record<ExamType, string> = {
  lab: "Laboratorial",
  ecg: "ECG",
  rx: "Raio-X",
};

/** Resposta estruturada da interpretação assistida (educativa, não diagnóstico) */
export const examValueStatusSchema = z.enum(["normal", "atencao", "alterado"]);
export type ExamValueStatus = z.infer<typeof examValueStatusSchema>;

export const clinicalFindingSeveritySchema = z.enum(["info", "atencao", "alterado"]);
export type ClinicalFindingSeverity = z.infer<typeof clinicalFindingSeveritySchema>;

export const clinicalFindingSchema = z.object({
  finding: z.string(),
  plainLanguage: z.string(),
  severity: clinicalFindingSeveritySchema,
});
export type ClinicalFinding = z.infer<typeof clinicalFindingSchema>;

export const parsedExamSummarySchema = z.object({
  /** Presente em análises novas; ausente em laudos antigos. */
  modality: examTypeSchema.optional(),
  summary: z.string(),
  values: z
    .array(
      z.object({
        parameter: z.string(),
        value: z.string(),
        referenceRange: z.string().optional(),
        status: examValueStatusSchema,
      })
    )
    .optional(),
  /** Achados descritivos (ECG / Raio-X) — nunca diagnóstico definitivo. */
  findings: z.array(clinicalFindingSchema).optional(),
  /** Qualidade da imagem ou do traçado, quando aplicável. */
  imageQuality: z.string().optional(),
  /** Região anatômica (RX) ou nota sobre derivações/traçado (ECG). */
  regionOrLeadNote: z.string().optional(),
  terms: z.array(
    z.object({
      term: z.string(),
      plainLanguage: z.string(),
    })
  ),
  questionsForDoctor: z.array(z.string()),
  /**
   * Hábitos/suplementações para CONVERSAR com o médico (educativo) — nunca
   * doses nem prescrição; o modelo sugere o assunto da conversa, não a conduta.
   */
  lifestyleTopics: z
    .array(
      z.object({
        topic: z.string(),
        whyItMatters: z.string(),
        discussWithDoctor: z.string(),
      })
    )
    .optional(),
  limitations: z.string(),
});

export type ParsedExamSummary = z.infer<typeof parsedExamSummarySchema>;

/** Resposta da análise por foto: transcrição/descrição + interpretação */
export const examPhotoResultSchema = parsedExamSummarySchema.extend({
  extractedText: z.string(),
  suggestedTitle: z.string().optional(),
});

export type ExamPhotoResult = z.infer<typeof examPhotoResultSchema>;

export function parseExamType(raw: unknown): ExamType {
  const parsed = examTypeSchema.safeParse(raw);
  return parsed.success ? parsed.data : "lab";
}

/** Conta sinais “alterados” úteis para o mapa de risco (lab values + findings). */
export function countAlteredSignals(summary: unknown): number {
  const parsed = parsedExamSummarySchema.safeParse(summary);
  if (!parsed.success) return 0;
  let n = 0;
  for (const v of parsed.data.values ?? []) {
    if (v.status === "alterado") n += 1;
  }
  for (const f of parsed.data.findings ?? []) {
    if (f.severity === "alterado") n += 1;
  }
  return n;
}
