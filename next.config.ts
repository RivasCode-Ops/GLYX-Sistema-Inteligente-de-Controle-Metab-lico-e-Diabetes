import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["recharts"],
  experimental: {
    // O padrão do Next é 1 MB por Server Action, e o formulário de fotos de
    // progresso manda quatro poses numa submissão só. Mesmo já comprimidas no
    // navegador, quatro fotos passavam de 1 MB e a submissão era recusada antes
    // de chegar na action — erro sem mensagem. 4 MB cabe folgado e continua
    // abaixo do teto de corpo de requisição da hospedagem (4,5 MB).
    serverActions: { bodySizeLimit: "4mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

const sentryAuth = Boolean(process.env.SENTRY_AUTH_TOKEN?.trim());

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Sem token, o build segue normal (CI/local) sem upload de source maps.
  sourcemaps: { disable: !sentryAuth },
  telemetry: false,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
