import * as Sentry from "@sentry/nextjs";

type Extra = Record<string, string | number | boolean | null | undefined>;

export function isObservabilityEnabled(): boolean {
  return Boolean(
    process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()
  );
}

export function reportException(
  error: unknown,
  context?: { tags?: Record<string, string>; extra?: Extra; level?: Sentry.SeverityLevel }
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  if (!isObservabilityEnabled()) {
    console.error("[glyx]", err.message, context?.extra ?? "");
    return;
  }
  Sentry.withScope((scope) => {
    if (context?.level) scope.setLevel(context.level);
    if (context?.tags) {
      for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, v);
    }
    if (context?.extra) {
      for (const [k, v] of Object.entries(context.extra)) {
        if (v !== undefined) scope.setExtra(k, v);
      }
    }
    Sentry.captureException(err);
  });
}

export function reportMessage(
  message: string,
  context?: { tags?: Record<string, string>; extra?: Extra; level?: Sentry.SeverityLevel }
): void {
  if (!isObservabilityEnabled()) {
    if (context?.level === "error" || context?.level === "fatal") {
      console.error("[glyx]", message, context.extra ?? "");
    } else if (context?.level === "warning") {
      console.warn("[glyx]", message, context.extra ?? "");
    }
    return;
  }
  Sentry.withScope((scope) => {
    scope.setLevel(context?.level ?? "info");
    if (context?.tags) {
      for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, v);
    }
    if (context?.extra) {
      for (const [k, v] of Object.entries(context.extra)) {
        if (v !== undefined) scope.setExtra(k, v);
      }
    }
    Sentry.captureMessage(message);
  });
}

export type CronJob = "cgm-sync" | "push-dispatch" | "meal-suggest";

export type CronStats = {
  failed?: number;
  synced?: number;
  sent?: number;
  dead?: number;
  total?: number;
  skipped?: number | string;
};

/** Regra pura: quando um job cron merece alerta operacional. */
export function cronNeedsAlert(job: CronJob, stats: CronStats): boolean {
  const failed = stats.failed ?? 0;
  if (failed > 0) return true;
  if (job === "push-dispatch") {
    const dead = stats.dead ?? 0;
    const sent = stats.sent ?? 0;
    return dead > 0 && sent === 0 && (stats.total ?? dead) > 0;
  }
  return false;
}

/** Resultado agregado de jobs cron — alerta se houver falhas. */
export async function reportCronOutcome(job: CronJob, stats: CronStats): Promise<void> {
  if (!cronNeedsAlert(job, stats)) return;

  const failed = stats.failed ?? 0;
  const dead = stats.dead ?? 0;
  const sent = stats.sent ?? 0;

  const message =
    job === "cgm-sync"
      ? `Cron CGM: ${failed} falha(s) de sync`
      : job === "push-dispatch"
        ? `Cron push: ${dead} endpoint(s) morto(s), ${sent} enviado(s)`
        : `Cron meal-suggest: falhas ou envios zerados`;

  reportMessage(message, {
    level: "warning",
    tags: { job, surface: "cron" },
    extra: { ...stats },
  });

  const webhook = process.env.OPS_ALERT_WEBHOOK_URL?.trim();
  if (!webhook) return;

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `[GLYX] ${message}`,
        job,
        stats,
        at: new Date().toISOString(),
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      }),
    });
  } catch (e) {
    reportException(e, { tags: { job: "ops-webhook" }, level: "error" });
  }
}
