$ErrorActionPreference = "Stop"
$canonicalName = "GLYX " + [char]0x2014 + " Sistema Inteligente de Controle Metab" + [char]0xF3 + "lico e Diabetes"
$canonicalRoot = Join-Path "C:\_PROJETOS" $canonicalName

$candidates = Get-ChildItem -LiteralPath "C:\_PROJETOS" -Directory -ErrorAction SilentlyContinue |
  Where-Object { Test-Path (Join-Path $_.FullName "package.json") }

if (-not $candidates) { exit 0 }

if (-not (Test-Path -LiteralPath $canonicalRoot)) {
  $first = $candidates | Select-Object -First 1
  Write-Host "A renomear para canonico: $canonicalRoot"
  Rename-Item -LiteralPath $first.FullName -NewName $canonicalName
  $candidates = Get-ChildItem -LiteralPath "C:\_PROJETOS" -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName "package.json") }
}

foreach ($d in $candidates) {
  if ($d.FullName -eq $canonicalRoot) { continue }
  Write-Host "A fundir e remover duplicado: $($d.FullName)"
  robocopy $d.FullName $canonicalRoot /E /XO /NFL /NDL /NJH /NP
  if ($LASTEXITCODE -ge 8) { throw "robocopy $($d.Name) falhou" }
  Remove-Item -LiteralPath $d.FullName -Recurse -Force
}

Write-Host "Unico: $canonicalRoot"
exit 0
