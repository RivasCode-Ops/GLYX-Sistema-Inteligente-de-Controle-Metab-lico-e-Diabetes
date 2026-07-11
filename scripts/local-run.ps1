<#
.SYNOPSIS
  Instala dependências, corre validação (lint + build + testes) e inicia `npm run dev`.
.DESCRIPTION
  Se `npm run verify` falhar na primeira vez, remove `.next` e tenta outra vez.
  Saída de install + verify vai para `glyx-local-run.log` via transcript.
  O servidor dev imprime no terminal (Ctrl+C para parar).
#>
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$logPath = Join-Path $ProjectRoot "glyx-local-run.log"

Write-Host "Registo: $logPath" -ForegroundColor Cyan
Write-Host "Node $(node -v) | npm $(npm -v)" -ForegroundColor DarkGray

try {
  Start-Transcript -Path $logPath -Force | Out-Null

  Write-Host "`n=== npm install ===" -ForegroundColor Cyan
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install falhou com código $LASTEXITCODE" }

  function Invoke-VerifyOnce {
    Write-Host "`n=== npm run verify ===" -ForegroundColor Cyan
    npm run verify
    return $LASTEXITCODE
  }

  $code = Invoke-VerifyOnce
  if ($code -ne 0) {
    Write-Host "`nVerify falhou ($code) — a limpar .next e repetir uma vez..." -ForegroundColor Yellow
    $nextDir = Join-Path $ProjectRoot ".next"
    if (Test-Path $nextDir) {
      Remove-Item $nextDir -Recurse -Force -ErrorAction Stop
    }
    $code = Invoke-VerifyOnce
  }
  if ($code -ne 0) { throw "npm run verify falhou com código $code" }

  Write-Host "`nVerify OK." -ForegroundColor Green
}
finally {
  try { Stop-Transcript | Out-Null } catch {}
}

Write-Host "`n=== npm run dev (Ctrl+C para parar) ===" -ForegroundColor Green
npm run dev
