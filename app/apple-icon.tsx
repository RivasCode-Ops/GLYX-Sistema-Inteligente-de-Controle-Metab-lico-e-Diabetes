import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #022c22 0%, #09090b 55%)",
          color: "#6ee7b7",
          fontSize: 96,
          fontWeight: 700,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          borderRadius: 36,
        }}
      >
        G
      </div>
    ),
    { ...size }
  );
}
