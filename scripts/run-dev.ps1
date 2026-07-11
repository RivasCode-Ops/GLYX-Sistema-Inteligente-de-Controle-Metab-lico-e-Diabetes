# Sobe o servidor de desenvolvimento (Turbopack) a partir da raiz do GLYX.
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
npm run dev
