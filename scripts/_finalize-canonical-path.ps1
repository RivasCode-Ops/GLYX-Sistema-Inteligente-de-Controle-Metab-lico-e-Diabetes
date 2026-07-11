$ErrorActionPreference = "Stop"
# Travessao U+2014, o agudo em MetabU+00F3lico
$canonicalName = "GLYX " + [char]0x2014 + " Sistema Inteligente de Controle Metab" + [char]0xF3 + "lico e Diabetes"
$canonicalRoot = Join-Path "C:\_PROJETOS" $canonicalName

$withPkg = Get-ChildItem -LiteralPath "C:\_PROJETOS" -Directory -ErrorAction SilentlyContinue |
  Where-Object { Test-Path (Join-Path $_.FullName "package.json") }

if (-not $withPkg -or $withPkg.Count -eq 0) {
  Write-Error "Nenhuma pasta em C:\_PROJETOS com package.json."
  exit 2
}

$src = ($withPkg | Select-Object -First 1).FullName
Write-Host ("Origem: " + $src)

if ($src -eq $canonicalRoot) {
  Write-Host "Ja e o caminho canonico."
  exit 0
}

if (Test-Path -LiteralPath $canonicalRoot) {
  Write-Host ("Destino existe, fundindo: " + $canonicalRoot)
  robocopy $src $canonicalRoot /E /XO /NFL /NDL /NJH /NP
  if ($LASTEXITCODE -ge 8) { throw ("robocopy falhou: " + $LASTEXITCODE) }
  Remove-Item -LiteralPath $src -Recurse -Force
} else {
  Write-Host ("Renomear para: " + $canonicalRoot)
  Rename-Item -LiteralPath $src -NewName $canonicalName
}

Write-Host ("OK: " + $canonicalRoot)
exit 0
