"use client";

/**
 * Converte páginas de um PDF em imagens JPEG no navegador (pdf.js).
 * Usado nos uploads de exame: laboratórios entregam PDF, o modelo de
 * visão consome imagem. Carregado sob demanda (dynamic import) para não
 * pesar o bundle de quem só envia foto.
 */
export async function pdfToImages(file: File, maxPages = 3): Promise<File[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const total = Math.min(doc.numPages, maxPages);
  const images: File[] = [];

  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i);
    // ~150 DPI: legível para OCR do modelo sem estourar o limite de 4 MB
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    if (blob) {
      images.push(
        new File([blob], file.name.replace(/\.pdf$/i, `-pag${i}.jpg`), { type: "image/jpeg" })
      );
    }
  }

  await doc.cleanup();
  return images;
}
