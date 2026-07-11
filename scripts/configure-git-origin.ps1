<#
.SYNOPSIS
  Garante que o remote origin aponta para o repositório GLYX no GitHub.
  Procura git.exe em caminhos comuns se não estiver no PATH.
#>
param(
  [string]$GitOrigin = "https://github.com/RivasCode-Ops/GLYX-Sistema-Inteligente-de-Controle-Metab-lico-e-Diabetes.git"
)
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Ensure-GitInPath {
  if (Get-Command git -ErrorAction SilentlyContinue) { return $true }
  $pf86 = [Environment]::GetFolderPath("ProgramFilesX86")
  $candidates = @(
    (Join-Path $env:ProgramFiles "Git\cmd\git.exe")
  )
  if ($pf86) { $candidates += (Join-Path $pf86 "Git\cmd\git.exe") }
  $candidates += (Join-Path $env:LOCALAPPDATA "Programs\Git\cmd\git.exe")
  foreach ($exe in $candidates) {
    if ($exe -and (Test-Path -LiteralPath $exe)) {
      $gitDir = Split-Path -LiteralPath $exe -Parent
      $env:Path = $gitDir + ";" + $env:Path
      return $true
    }
  }
  return $false
}

if (-not (Ensure-GitInPath)) {
  throw "Git nao encontrado. Instale Git for Windows ou adicione git ao PATH."
}

if (-not (Test-Path (Join-Path $RepoRoot ".git"))) {
  git init
}

$remotes = @(git remote 2>$null)
if ($remotes -contains "origin") {
  git remote set-url origin $GitOrigin
} else {
  git remote add origin $GitOrigin
}
git remote -v
