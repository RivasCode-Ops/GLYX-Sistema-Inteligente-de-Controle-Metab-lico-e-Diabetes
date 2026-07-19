# Verifica variáveis de ambiente e lista migrations recentes — sem imprimir secrets.
param(
  [string]$EnvFile = ".env.local"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Read-DotEnv([string]$path) {
  $map = @{}
  if (-not (Test-Path -LiteralPath $path)) { return $map }
  Get-Content -LiteralPath $path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $i = $line.IndexOf("=")
    if ($i -lt 1) { return }
    $k = $line.Substring(0, $i).Trim()
    $v = $line.Substring($i + 1).Trim()
    if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    # Pull da Vercel devolve Sensitive como "" — tratar como ausente
    if ([string]::IsNullOrWhiteSpace($v)) { return }
    $map[$k] = $v
  }
  return $map
}

function Has-Value($map, [string]$key) {
  return $map.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace([string]$map[$key])
}

Write-Host "=== GLYX check:prod ===" -ForegroundColor Cyan
Write-Host "Env file: $EnvFile"

$envMap = Read-DotEnv $EnvFile
if ($envMap.Count -eq 0 -and -not (Test-Path -LiteralPath $EnvFile)) {
  Write-Host "FALHA: arquivo $EnvFile nao encontrado." -ForegroundColor Red
  Write-Host "Copie .env.example -> $EnvFile e preencha."
  exit 2
}

$required = @(
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SIGNUP_INVITE_CODE",
  "CRON_SECRET",
  "CGM_CREDENTIALS_SECRET",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT"
)

$recommended = @(
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_SITE_URL",
  "OPS_ALERT_WEBHOOK_URL"
)

$optionalDexcom = @(
  "DEXCOM_CLIENT_ID",
  "DEXCOM_CLIENT_SECRET"
)

$fail = 0
$warn = 0

Write-Host "`n-- Obrigatorias --"
foreach ($k in $required) {
  if (Has-Value $envMap $k) {
    Write-Host "  OK  $k" -ForegroundColor Green
  } else {
    Write-Host "  MISSING  $k" -ForegroundColor Red
    $fail++
  }
}
if ((Has-Value $envMap "KIMI_API_KEY") -or (Has-Value $envMap "OPENAI_API_KEY")) {
  Write-Host "  OK  KIMI_API_KEY" -ForegroundColor Green
} else {
  Write-Host "  MISSING  KIMI_API_KEY" -ForegroundColor Red
  $fail++
}

Write-Host "`n-- Recomendadas --"
foreach ($k in $recommended) {
  if (Has-Value $envMap $k) {
    Write-Host "  OK  $k" -ForegroundColor Green
  } else {
    Write-Host "  WARN  $k" -ForegroundColor Yellow
    $warn++
  }
}

Write-Host "`n-- Dexcom (opcional) --"
$dexOk = ($optionalDexcom | ForEach-Object { Has-Value $envMap $_ }) -notcontains $false
if ($dexOk) {
  Write-Host "  OK  DEXCOM_CLIENT_ID + SECRET" -ForegroundColor Green
  if (-not (Has-Value $envMap "DEXCOM_REDIRECT_URI") -and -not (Has-Value $envMap "NEXT_PUBLIC_SITE_URL")) {
    Write-Host "  WARN  falta DEXCOM_REDIRECT_URI ou NEXT_PUBLIC_SITE_URL" -ForegroundColor Yellow
    $warn++
  }
} else {
  Write-Host "  SKIP  Dexcom nao configurado (ok se so Libre)" -ForegroundColor DarkGray
}

Write-Host "`n-- Consistencia --"
if ((Has-Value $envMap "CRON_SECRET") -and (Has-Value $envMap "CGM_CREDENTIALS_SECRET")) {
  if ($envMap["CRON_SECRET"] -eq $envMap["CGM_CREDENTIALS_SECRET"]) {
    Write-Host "  WARN  CGM_CREDENTIALS_SECRET == CRON_SECRET (prefira chaves distintas)" -ForegroundColor Yellow
    $warn++
  } else {
    Write-Host "  OK  CGM_CREDENTIALS_SECRET distinta do CRON_SECRET" -ForegroundColor Green
  }
}

if ((Has-Value $envMap "SENTRY_DSN") -and (Has-Value $envMap "NEXT_PUBLIC_SENTRY_DSN")) {
  if ($envMap["SENTRY_DSN"] -ne $envMap["NEXT_PUBLIC_SENTRY_DSN"]) {
    Write-Host "  WARN  SENTRY_DSN e NEXT_PUBLIC_SENTRY_DSN diferem" -ForegroundColor Yellow
    $warn++
  } else {
    Write-Host "  OK  Sentry DSN alinhado (server/client)" -ForegroundColor Green
  }
}

Write-Host "`n-- Migrations recentes (conferir no Supabase) --"
$migDir = Join-Path $Root "supabase\migrations"
Get-ChildItem -LiteralPath $migDir -Filter "*.sql" |
  Sort-Object Name |
  Select-Object -Last 5 |
  ForEach-Object { Write-Host ("  " + $_.Name) }

Write-Host "`n-- Checklist manual Auth / cron --" -ForegroundColor Cyan
Write-Host "  [ ] Supabase Auth: Allow new users to sign up = OFF"
Write-Host "  [ ] Site URL + Redirect URLs (/auth/callback) corretos"
Write-Host "  [ ] Funcoes pg_cron: URL Vercel atual + x-cron-secret = CRON_SECRET"
Write-Host "  [ ] Rotacionar secret se ja vazou em migration antiga do git"
Write-Host "  [ ] Deploy Vercel com as mesmas env vars"
Write-Host "  [ ] Smoke: login, /status, export/wipe, sync CGM"
Write-Host "  Guia: docs\PRODUCAO.md"

Write-Host ""
if ($fail -gt 0) {
  Write-Host "RESULTADO: $fail obrigatoria(s) faltando, $warn aviso(s)." -ForegroundColor Red
  exit 1
}
Write-Host "RESULTADO: obrigatorias OK · $warn aviso(s)." -ForegroundColor Green
exit 0
