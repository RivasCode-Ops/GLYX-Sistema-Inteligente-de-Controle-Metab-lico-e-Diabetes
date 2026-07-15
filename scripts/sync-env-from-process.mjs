/**
 * Escreve chaves de process.env no .env.local sem imprimir valores.
 * Uso: vercel env run -- node scripts/sync-env-from-process.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const keys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SIGNUP_INVITE_CODE",
  "CRON_SECRET",
  "CGM_CREDENTIALS_SECRET",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "AI_MODEL",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_SITE_URL",
  "OPS_ALERT_WEBHOOK_URL",
  "DEXCOM_CLIENT_ID",
  "DEXCOM_CLIENT_SECRET",
  "DEXCOM_REDIRECT_URI",
  "DEXCOM_USE_SANDBOX",
  "AI_DAILY_BUDGET_USD",
  "AI_MONTHLY_BUDGET_USD",
];

const path = resolve(process.cwd(), ".env.local");

function parseExisting(file) {
  const map = new Map();
  if (!existsSync(file)) return map;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    let v = t.slice(i + 1);
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    map.set(t.slice(0, i), v);
  }
  return map;
}

const existing = parseExisting(path);
let filled = 0;
let kept = 0;
let missing = 0;

for (const key of keys) {
  const fromProc = process.env[key];
  const hasProc = Boolean(fromProc && fromProc.trim());
  const hasExisting = Boolean(existing.get(key)?.trim());
  if (hasProc) {
    existing.set(key, fromProc.trim());
    filled += 1;
  } else if (hasExisting) {
    kept += 1;
  } else {
    missing += 1;
  }
}

const lines = [
  `# .env.local — sincronizado via vercel env run em ${new Date().toISOString()}`,
  `# Não commitar. Valores Sensitive vazios no pull; este fluxo usa env injetado.`,
];
for (const [k, v] of existing) {
  // Escape mínimo: aspas se tiver espaço/#
  const needsQuote = /[\s#"']/.test(v);
  lines.push(needsQuote ? `${k}="${v.replace(/"/g, '\\"')}"` : `${k}=${v}`);
}
writeFileSync(path, lines.join("\n") + "\n", "utf8");

console.log(
  `sync-env: wrote ${path} · fromProcess=${filled} keptLocal=${kept} stillEmpty=${missing}`
);
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "OPENAI_API_KEY",
  "VAPID_PRIVATE_KEY",
];
for (const k of required) {
  const ok = Boolean(existing.get(k)?.trim());
  console.log(`  ${ok ? "OK" : "MISSING"} ${k}`);
}
process.exit(required.every((k) => existing.get(k)?.trim()) ? 0 : 1);
