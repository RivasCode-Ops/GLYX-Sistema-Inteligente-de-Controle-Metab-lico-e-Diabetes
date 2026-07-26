import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getBodySnapshot } from "@/lib/queries/body-composition";
import { PhotoUploadForm } from "@/components/composicao/photo-upload-form";
import { PhotoCompare, type ComparablePhoto } from "@/components/composicao/photo-compare";

export const metadata = { title: "Fotos de progresso — GLYX" };

/** URL assinada de 1 h — mesmo prazo usado nas fotos de refeição e de rótulo. */
const SIGNED_URL_TTL_SECONDS = 3600;

export default async function FotosPage() {
  const snapshot = await getBodySnapshot();
  const photos = snapshot?.photos ?? [];
  const today = new Date().toISOString().slice(0, 10);

  let comparable: ComparablePhoto[] = [];
  if (photos.length) {
    const supabase = await createClient();
    const { data: signed } = (await supabase?.storage
      .from("body-photos")
      .createSignedUrls(
        photos.map((p) => p.photo_path),
        SIGNED_URL_TTL_SECONDS
      )) ?? { data: null };

    const urlByPath = new Map(
      (signed ?? [])
        .filter((s) => s.signedUrl && s.path)
        .map((s) => [s.path as string, s.signedUrl as string])
    );

    comparable = photos
      .map((p) => ({
        id: p.id,
        takenOn: p.taken_on,
        pose: p.pose,
        url: urlByPath.get(p.photo_path) ?? "",
      }))
      .filter((p) => p.url);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Registrar fotos</CardTitle>
          <CardDescription>
            Quatro poses, uma vez por mês. Uma foto por pose e data — reenviar substitui.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PhotoUploadForm defaultDate={today} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Comparar</CardTitle>
          <CardDescription>
            Lado a lado da mesma pose em datas diferentes — a comparação que a fita não mostra.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PhotoCompare photos={comparable} />
        </CardContent>
      </Card>

      <p className="text-[11px] leading-snug text-zinc-500">
        As fotos ficam em bucket privado com acesso restrito à sua conta e entram no export e no
        apagamento de dados da LGPD junto com o resto. Só saem do servidor se você pedir a
        comparação por IA.
      </p>
    </div>
  );
}
