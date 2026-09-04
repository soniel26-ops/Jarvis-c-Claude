# JARVIS · instalador (Windows PowerShell). Fases 0, 1 e 2 do CHECKLIST.md.
# Uso: clique direito → Executar com PowerShell, ou:  powershell -ExecutionPolicy Bypass -File scripts\instalar.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
Write-Host "JARVIS · instalação`n"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "✘ Node.js não encontrado. Instale a versão LTS em https://nodejs.org e rode de novo."; exit 1 }
$maj = [int](node -p "process.versions.node.split('.')[0]")
if ($maj -lt 20) { Write-Host "✘ Node.js $(node --version) é antigo; precisa ser 20 ou mais novo."; exit 1 }
Write-Host "✔ Node.js $(node --version)"
if (Get-Command git -ErrorAction SilentlyContinue) { Write-Host "✔ $(git --version)" } else { Write-Host "⚠ Git não encontrado (necessário para sincronizar dados e agentes)" }
Set-Location server
Write-Host "→ npm install"; npm install --no-fund --no-audit --silent
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "`nCole a sua chave da API do Claude (console.anthropic.com → API Keys)."
  $sec = Read-Host "ANTHROPIC_API_KEY" -AsSecureString
  $chave = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  if ($chave) { (Get-Content .env) -replace '^ANTHROPIC_API_KEY=.*$', "ANTHROPIC_API_KEY=$chave" | Set-Content .env; Write-Host "✔ chave gravada em server\.env" }
  else { Write-Host "⚠ sem chave: o painel vai funcionar em modo local até você preencher server\.env" }
  $nome = Read-Host "Como o JARVIS deve te chamar? [senhor]"; if (-not $nome) { $nome = "senhor" }
  (Get-Content .env) -replace '^JARVIS_NOME_USUARIO=.*$', "JARVIS_NOME_USUARIO=$nome" | Set-Content .env
} else { Write-Host "✔ server\.env já existe (mantido)" }
Write-Host ""
node doctor.mjs
Write-Host "Para iniciar:  cd server; npm start   →  http://localhost:8080/mission-control/"
