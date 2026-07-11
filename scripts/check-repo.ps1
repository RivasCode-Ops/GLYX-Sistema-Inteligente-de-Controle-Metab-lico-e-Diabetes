# Valida pasta, remote origin esperado e ferramentas (Git, Node, npm).
$ErrorActionPreference = "Continue"
$ExpectedOrigin = "https://github.com/RivasCode-Ops/GLYX-Sistema-Inteligente-de-Controle-Metab-lico-e-Diabetes.git"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "ROOT: $RepoRoot"

function Ensure-GitInPath {
  if (Get-Command git -ErrorAction SilentlyContinue) { return $true }
  $pf86 = [Environment]::GetFolderPath("ProgramFilesX86")
  $candidates = @((Join-Path $env:ProgramFiles "Git\cmd\git.exe"))
  if ($pf86) { $candidates += (Join-Path $pf86 "Git\cmd\git.exe") }
  $candidates += (Join-Path $env:LOCALAPPDATA "Programs\Git\cmd\git.exe")
  foreach ($exe in $candidates) {
    if ($exe -and (Test-Path -LiteralPath $exe)) {
      $env:Path = (Split-Path -LiteralPath $exe -Parent) + ";" + $env:Path
      return $true
    }
  }
  return $false
}

if (-not (Ensure-GitInPath)) {
  Write-Warning "Git nao encontrado."
} elseif (-not (Test-Path ".git")) {
  Write-Warning "Repositorio nao inicializado (.git ausente). Corra: .\scripts\configure-git-origin.ps1"
} else {
  git remote -v
  $url = git remote get-url origin 2>$null
  if ($url -eq $ExpectedOrigin) {
    Write-Host "origin OK." -ForegroundColor Green
  } else {
    Write-Warning "origin esperado:`n  $ExpectedOrigin`nobtido:`n  $url`nCorra: .\scripts\configure-git-origin.ps1"
  }
}

if (Get-Command node -ErrorAction SilentlyContinue) { Write-Host "node: $(node -v)" }
else { Write-Warning "node nao encontrado." }

if (Get-Command npm -ErrorAction SilentlyContinue) { Write-Host "npm: $(npm -v)" }
else { Write-Warning "npm nao encontrado." }
