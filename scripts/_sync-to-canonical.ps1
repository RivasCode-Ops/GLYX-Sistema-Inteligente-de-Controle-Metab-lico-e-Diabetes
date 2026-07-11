$ErrorActionPreference = "Stop"
$src = "C:\Users\ULTRA\GLYX"
$dst = Join-Path "C:\_PROJETOS" (
  "GLYX " + [char]0x2014 + " Sistema Inteligente de Controle Metab" + [char]0xF3 + "lico e Diabetes"
)
if (!(Test-Path (Join-Path $src "package.json"))) {
  Write-Error "Sem package.json em $src"
  exit 2
}
Write-Host "robocopy -> $dst"
robocopy $src $dst /E /XD node_modules .next .git coverage playwright-report test-results out build .turbo /NFL /NDL /NJH /NP
$code = $LASTEXITCODE
Write-Host "robocopy exit: $code"
if ($code -ge 8) { exit 1 }
exit 0
