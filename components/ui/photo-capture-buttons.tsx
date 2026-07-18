"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  accept: string;
  onFile: (file: File | undefined) => void;
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
        onChange={(e) => onFile(e.target.files?.[0])}
        className="hidden"
      />
      <input
        ref={galleryRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => onFile(e.target.files?.[0])}
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
