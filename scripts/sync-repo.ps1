<#
.SYNOPSIS
  Copia o código Next.js para esta raiz (opcional), inicializa Git e define o remote origin no GitHub.
  Na raiz canónica: copia por defeito de C:\Users\ULTRA\GLYX. Se executado dentro de ULTRA\GLYX, a cópia é ignorada (origem = destino).
#>
param(
  [string]$Source = "C:\Users\ULTRA\GLYX",
  [switch]$SkipCopy,
  [string]$GitOrigin = "https://github.com/RivasCode-Ops/GLYX-Sistema-Inteligente-de-Controle-Metab-lico-e-Diabetes.git"
)
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

if (-not $SkipCopy) {
  $srcFull = [System.IO.Path]::GetFullPath($Source)
  $dstFull = [System.IO.Path]::GetFullPath($RepoRoot)
  if ($srcFull.TrimEnd("\") -eq $dstFull.TrimEnd("\")) {
    Write-Host "Origem e destino coincidem — cópia ignorada." -ForegroundColor DarkGray
  } else {
    $srcPkg = Join-Path $Source "package.json"
    if (Test-Path $srcPkg) {
      Write-Host "A copiar de`n  $Source`npara`n  $RepoRoot" -ForegroundColor Cyan
      robocopy $Source $RepoRoot /E /XD node_modules .next .git coverage playwright-report test-results out build .turbo `
        /NFL /NDL /NJH /NP /NS /NC
      if ($LASTEXITCODE -ge 8) { throw "robocopy terminou com código $LASTEXITCODE" }
    } else {
      Write-Warning "Sem package.json em $Source — cópia ignorada. Traga o código para esta pasta ou faça git pull do origin."
    }
  }
}

if (-not (Test-Path (Join-Path $RepoRoot "package.json"))) {
  Write-Warning "Ainda não existe package.json na raiz. Após clonar ou copiar o app Next.js, volte a correr sync-repo.ps1 -SkipCopy para só configurar o Git."
}

if (-not (Test-Path (Join-Path $RepoRoot ".git"))) {
  git init
}

$remotes = @(git remote 2>$null)
if ($remotes -contains "origin") {
  git remote set-url origin $GitOrigin
  Write-Host "git remote set-url origin" -ForegroundColor Green
} else {
  git remote add origin $GitOrigin
  Write-Host "git remote add origin" -ForegroundColor Green
}

Write-Host ""
git remote -v
