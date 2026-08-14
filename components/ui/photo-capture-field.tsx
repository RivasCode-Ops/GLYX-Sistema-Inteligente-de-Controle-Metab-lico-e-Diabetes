"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { compressImageFile } from "@/lib/images/compress";

type Props = {
  name: string;
  accept: string;
  required?: boolean;
};

/**
 * Campo de foto com câmera/galeria pra formulários nativos (`<form
 * action={serverAction}>`, sem React controlando o submit). Mantém um input
 * escondido com o `name` certo — o arquivo escolhido é copiado pra ele via
 * DataTransfer, então a submissão nativa do form funciona normalmente.
 *
 * A foto é comprimida no navegador **antes** de entrar no input escondido, como
 * nos demais formulários de foto do app. Sem isso a foto crua de celular (3–8 MB,
 * às vezes HEIC) era enviada inteira: o Server Action tem limite de corpo bem
 * menor que o do bucket, então a submissão morria antes de chegar na action e o
 * erro aparecia sem explicação. A recodificação em JPEG também resolve formatos
 * que o bucket recusa.
 */
export function PhotoCaptureField({ name, accept, required }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  async function applyFile(file: File | undefined) {
    if (!file || !hiddenRef.current) return;
    setPreparing(true);
    setFileName(null);
    try {
      let ready = file;
      try {
        ready = await compressImageFile(file);
      } catch {
        // Navegador sem suporte ao formato (HEIC em alguns casos): segue com o
        // original — o servidor ainda pode aceitar, e recusar aqui seria pior.
        ready = file;
      }
      if (!hiddenRef.current) return;
      const dt = new DataTransfer();
      dt.items.add(ready);
      hiddenRef.current.files = dt.files;
      setFileName(ready.name);
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={hiddenRef} type="file" name={name} accept={accept} required={required} className="hidden" />
      <input
        ref={cameraRef}
        type="file"
        accept={accept}
        capture="environment"
        onChange={(e) => void applyFile(e.target.files?.[0])}
        className="hidden"
      />
      <input
        ref={galleryRef}
        type="file"
        accept={accept}
        onChange={(e) => void applyFile(e.target.files?.[0])}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={preparing}
        onClick={() => cameraRef.current?.click()}
      >
        📷 Tirar foto
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={preparing}
        onClick={() => galleryRef.current?.click()}
      >
        🖼️ Galeria
      </Button>
      {preparing ? (
        <span className="text-xs text-zinc-400">Preparando foto…</span>
      ) : fileName ? (
        <span className="text-xs text-zinc-500">{fileName}</span>
      ) : null}
    </div>
  );
}
