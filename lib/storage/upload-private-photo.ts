import type { SupabaseClient } from "@supabase/supabase-js";

function extensionFor(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/** Envia uma foto a um bucket privado do Storage, em `${userId}/${uuid}.ext`. Retorna o caminho ou null se não houver arquivo válido/erro. */
export async function uploadPrivatePhoto(
  supabase: SupabaseClient,
  bucket: string,
  userId: string,
  file: FormDataEntryValue | null,
  maxBytes: number
): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > maxBytes) return null;
  if (file.type && !file.type.startsWith("image/")) return null;

  const mime = file.type || "image/jpeg";
  const path = `${userId}/${crypto.randomUUID()}.${extensionFor(mime)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const upload = await supabase.storage.from(bucket).upload(path, buffer, { contentType: mime });
  return upload.error ? null : path;
}
