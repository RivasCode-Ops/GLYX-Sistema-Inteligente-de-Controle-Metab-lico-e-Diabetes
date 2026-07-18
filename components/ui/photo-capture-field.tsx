"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

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
 */
export function PhotoCaptureField({ name, accept, required }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function applyFile(file: File | undefined) {
    if (!file || !hiddenRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    hiddenRef.current.files = dt.files;
    setFileName(file.name);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={hiddenRef} type="file" name={name} accept={accept} required={required} className="hidden" />
      <input
        ref={cameraRef}
        type="file"
        accept={accept}
        capture="environment"
        onChange={(e) => applyFile(e.target.files?.[0])}
        className="hidden"
      />
      <input
        ref={galleryRef}
        type="file"
        accept={accept}
        onChange={(e) => applyFile(e.target.files?.[0])}
        className="hidden"
      />
      <Button type="button" variant="outline" size="sm" onClick={() => cameraRef.current?.click()}>
        📷 Tirar foto
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => galleryRef.current?.click()}>
        🖼️ Galeria
      </Button>
      {fileName ? <span className="text-xs text-zinc-500">{fileName}</span> : null}
    </div>
  );
}
