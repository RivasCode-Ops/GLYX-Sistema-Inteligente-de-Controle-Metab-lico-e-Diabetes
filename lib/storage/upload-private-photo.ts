import type { SupabaseClient } from "@supabase/supabase-js";

function extensionFor(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/**
 * Resultado explícito porque "sem caminho" tinha dois significados
 * indistinguíveis, e o app tratava os dois como sucesso: **não veio foto**
 * (usuário não anexou nada — normal) e **a foto se perdeu** (arquivo grande
 * demais, tipo errado, erro do Storage). No segundo caso a refeição era salva
 * com `photo_path: null` sem avisar ninguém, e a foto que o usuário tirou
 * simplesmente não existia mais.
 */
export type UploadResult =
  | { status: "uploaded"; path: string }
  | { status: "empty" }
  | { status: "failed"; reason: "too_large" | "not_image" | "storage" };

export const UPLOAD_FAIL_MESSAGE: Record<
  Extract<UploadResult, { status: "failed" }>["reason"],
  string
> = {
  too_large: "a imagem passou do tamanho máximo",
  not_image: "o arquivo enviado não é uma imagem",
  storage: "houve falha no envio ao armazenamento",
};

/** Envia uma foto a um bucket privado do Storage, em `${userId}/${uuid}.ext`. */
export async function uploadPrivatePhotoResult(
  supabase: SupabaseClient,
  bucket: string,
  userId: string,
  file: FormDataEntryValue | null,
  maxBytes: number
): Promise<UploadResult> {
  if (!(file instanceof File) || file.size === 0) return { status: "empty" };
  if (file.size > maxBytes) return { status: "failed", reason: "too_large" };
  if (file.type && !file.type.startsWith("image/")) return { status: "failed", reason: "not_image" };

  const mime = file.type || "image/jpeg";
  const path = `${userId}/${crypto.randomUUID()}.${extensionFor(mime)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const upload = await supabase.storage.from(bucket).upload(path, buffer, { contentType: mime });
  if (upload.error) return { status: "failed", reason: "storage" };
  return { status: "uploaded", path };
}

/**
 * Versão que devolve só o caminho, para quem já trata a ausência.
 * Prefira `uploadPrivatePhotoResult` em fluxo novo: com esta assinatura não dá
 * para distinguir "não anexou" de "perdeu a foto".
 */
export async function uploadPrivatePhoto(
  supabase: SupabaseClient,
  bucket: string,
  userId: string,
  file: FormDataEntryValue | null,
  maxBytes: number
): Promise<string | null> {
  const result = await uploadPrivatePhotoResult(supabase, bucket, userId, file, maxBytes);
  return result.status === "uploaded" ? result.path : null;
}
