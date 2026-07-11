import { ImageResponse } from "next/og";

export const runtime = "edge";

// Ícone 192x192 exigido pelo Chrome/Android para instalar a PWA
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
          fontSize: 110,
          fontWeight: 700,
          borderRadius: 36,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        G
      </div>
    ),
    { width: 192, height: 192 }
  );
}
