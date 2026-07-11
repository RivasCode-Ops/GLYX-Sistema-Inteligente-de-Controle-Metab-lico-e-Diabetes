# Instala dependências e corre lint + build + testes unitários (Vitest).
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run verify
exit $LASTEXITCODE
