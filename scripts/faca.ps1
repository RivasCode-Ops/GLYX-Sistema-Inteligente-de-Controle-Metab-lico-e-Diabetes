# Atalho: origin Git + npm install + npm run verify (fluxo completo sem subir servidor).
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$root = Split-Path -Parent $here
Set-Location $root

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
      $env:Path = (Split-Path -LiteralPath $exe -Parent) + ";" + $env:Path
      return $true
    }
  }
  return $false
}

Write-Host "=== GLYX faca ===" -ForegroundColor Cyan

if (Ensure-GitInPath) {
  try {
    & (Join-Path $here "configure-git-origin.ps1")
  } catch {
    Write-Warning "configure-git-origin: $_"
  }
} else {
  Write-Warning "Git nao encontrado - a saltar configure-git-origin."
}

& (Join-Path $here "bootstrap.ps1")
