import { ImageResponse } from "next/og";

export const runtime = "edge";

// Ícone 512x512 (maskable) exigido para instalar a PWA com splash screen
export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
          color: "#34d399",
          fontSize: 300,
          fontWeight: 700,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        G
      </div>
    ),
    { width: 512, height: 512 }
  );
}
