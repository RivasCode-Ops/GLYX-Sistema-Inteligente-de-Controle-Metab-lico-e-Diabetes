"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  accept: string;
  /** Chamado pelo botão de câmera (sempre 1 arquivo) e pela galeria quando `multiple` é falso. */
  onFile?: (file: File | undefined) => void;
  /** Chamado pela galeria quando `multiple` é verdadeiro (seleção de vários de uma vez). */
  onFiles?: (files: FileList | null) => void;
  multiple?: boolean;
  cameraLabel?: string;
  galleryLabel?: string;
};

/**
 * Dois inputs de arquivo separados (câmera + galeria) em vez de um só com/sem
 * `capture` — depender do input único não é confiável entre
 * navegadores/PWA: sem `capture`, alguns aparelhos escondem a opção de
 * câmera por completo em vez de oferecer as duas.
 */
export function PhotoCaptureButtons({
  accept,
  onFile,
  onFiles,
  multiple = false,
  cameraLabel = "📷 Tirar foto",
  galleryLabel = "🖼️ Escolher da galeria",
}: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex gap-2">
      <input
        ref={cameraRef}
        type="file"
        accept={accept}
        capture="environment"
        onChange={(e) => onFile?.(e.target.files?.[0])}
        className="hidden"
      />
      <input
        ref={galleryRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => (multiple ? onFiles?.(e.target.files) : onFile?.(e.target.files?.[0]))}
        className="hidden"
      />
      <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()}>
        {cameraLabel}
      </Button>
      <Button type="button" variant="outline" onClick={() => galleryRef.current?.click()}>
        {galleryLabel}
      </Button>
    </div>
  );
}
