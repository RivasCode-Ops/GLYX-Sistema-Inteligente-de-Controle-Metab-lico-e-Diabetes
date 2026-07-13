"use client";

const TARGET_MAX_DIM = 1280;

/**
 * Reduz a foto no navegador antes do envio — fotos de celular em alta
 * resolução (4000px+) inflam o custo de IA e podem prejudicar a leitura
 * do modelo de visão. Devolve um File já pronto para FormData.
 */
export async function compressImageFile(file: File, quality = 0.82): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, TARGET_MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
}
