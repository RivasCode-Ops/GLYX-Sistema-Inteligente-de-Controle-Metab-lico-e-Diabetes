import { z } from "zod";

/** Resposta estruturada da interpretação assistida (educativa, não diagnóstico) */
export const parsedExamSummarySchema = z.object({
  summary: z.string(),
  terms: z.array(
    z.object({
      term: z.string(),
      plainLanguage: z.string(),
    })
  ),
  questionsForDoctor: z.array(z.string()),
  limitations: z.string(),
});

export type ParsedExamSummary = z.infer<typeof parsedExamSummarySchema>;

/** Resposta da análise por foto: transcrição do laudo + interpretação */
export const examPhotoResultSchema = parsedExamSummarySchema.extend({
  extractedText: z.string(),
  suggestedTitle: z.string().optional(),
});

export type ExamPhotoResult = z.infer<typeof examPhotoResultSchema>;
