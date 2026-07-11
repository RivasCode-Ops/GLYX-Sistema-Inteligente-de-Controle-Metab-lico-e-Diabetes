$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$reportPath = Join-Path $ProjectRoot "glyx-npm-report.txt"
$installLog = Join-Path $env:TEMP "glyx-npm-install-$([Guid]::NewGuid().ToString('N')).log"
$verifyLog  = Join-Path $env:TEMP "glyx-npm-verify-$([Guid]::NewGuid().ToString('N')).log"

function LockInfo {
  $lock = Join-Path $ProjectRoot "package-lock.json"
  if (Test-Path $lock) {
    $sz = (Get-Item $lock).Length
    "package-lock.json: sim, ~{0:N1} KB ({1} bytes)" -f ($sz / 1KB), $sz
  } else {
    "package-lock.json: nao"
  }
}

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("GLYX: $ProjectRoot")
$lines.Add("Antes: $(LockInfo)")
$lines.Add("")
$lines.Add("=== npm install ===")

try {
  npm install *>&1 | Tee-Object -FilePath $installLog
  $installExit = $LASTEXITCODE
} catch {
  $installExit = 1
  $_ | Out-File -Append -FilePath $installLog -Encoding utf8
}

$lines.Add("Exit npm install: $installExit")
$lines.Add("(tail install)")
Get-Content $installLog -Tail 40 -ErrorAction SilentlyContinue | ForEach-Object { $lines.Add($_) }
$lines.Add("")
$lines.Add("Depois install: $(LockInfo)")
$lines.Add("")
$lines.Add("=== npm run verify ===")

try {
  npm run verify *>&1 | Tee-Object -FilePath $verifyLog
  $verifyExit = $LASTEXITCODE
} catch {
  $verifyExit = 1
  $_ | Out-File -Append -FilePath $verifyLog -Encoding utf8
}

$lines.Add("Exit npm run verify: $verifyExit")
$lines.Add("(tail verify)")
Get-Content $verifyLog -Tail 40 -ErrorAction SilentlyContinue | ForEach-Object { $lines.Add($_) }
$lines.Add("")
$lines.Add("Final: $(LockInfo)")

$text = $lines -join "`r`n"
$text | Out-File -FilePath $reportPath -Encoding utf8

Write-Host $text
Write-Host ""
Write-Host "Relatorio completo: $reportPath"

if ($installExit -ne 0 -or $verifyExit -ne 0) { exit 1 }
