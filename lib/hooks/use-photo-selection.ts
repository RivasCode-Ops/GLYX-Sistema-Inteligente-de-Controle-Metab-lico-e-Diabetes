"use client";

import { useState } from "react";
import { compressImageFile } from "@/lib/images/compress";

type Options = {
  /** Aceita PDF além de imagem (converte cada página numa foto). */
  allowPdf?: boolean;
  pdfMaxPages?: number;
};

/**
 * Estado + fluxo comum aos formulários de "foto + IA" (exame, suplemento,
 * bancada, refeição): seleção de arquivo(s), compressão, preview com
 * revogação de object URLs antigas, e mensagem de status.
 */
export function usePhotoSelection({ allowPdf = false, pdfMaxPages = 3 }: Options = {}) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviewsState] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function setPreviews(next: string[]) {
    previews.forEach((p) => URL.revokeObjectURL(p));
    setPreviewsState(next);
  }

  function clear() {
    setFiles([]);
    setPreviews([]);
  }

  function reset() {
    clear();
    setStatus(null);
  }

  /** Um único arquivo (imagem ou, se `allowPdf`, PDF convertido em 1+ imagens). */
  async function selectSingle(file: File | undefined) {
    setStatus(null);
    if (!file) {
      clear();
      return;
    }

    if (allowPdf && (file.type === "application/pdf" || /\.pdf$/i.test(file.name))) {
      setStatus("Convertendo PDF em imagens…");
      setLoading(true);
      try {
        const { pdfToImages } = await import("@/lib/pdf/pdf-to-images");
        const imgs = await pdfToImages(file, pdfMaxPages);
        if (!imgs.length) {
          setStatus("Não consegui ler este PDF. Tente uma foto.");
          clear();
          return;
        }
        setFiles(imgs);
        setPreviews(imgs.map((i) => URL.createObjectURL(i)));
        setStatus(imgs.length > 1 ? `PDF convertido: ${imgs.length} páginas prontas para análise.` : null);
      } catch {
        setStatus("Falha ao converter o PDF. Tente uma foto.");
      } finally {
        setLoading(false);
      }
      return;
    }

    setStatus("Comprimindo foto…");
    setLoading(true);
    try {
      const compressed = await compressImageFile(file);
      setFiles([compressed]);
      setPreviews([URL.createObjectURL(compressed)]);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  /** Vários arquivos de imagem (bancada/despensa), sem suporte a PDF. */
  async function selectMultiple(fileList: FileList | null, maxCount: number) {
    const selected = Array.from(fileList ?? []).slice(0, maxCount);
    if (!selected.length) {
      reset();
      return;
    }
    setStatus("Comprimindo fotos…");
    setLoading(true);
    try {
      const compressed = await Promise.all(selected.map((f) => compressImageFile(f)));
      setFiles(compressed);
      setPreviews(compressed.map((f) => URL.createObjectURL(f)));
      setStatus(`${compressed.length} foto(s) selecionada(s).`);
    } finally {
      setLoading(false);
    }
  }

  return {
    files,
    previews,
    status,
    setStatus,
    loading,
    setLoading,
    selectSingle,
    selectMultiple,
    reset,
    clear,
  };
}
