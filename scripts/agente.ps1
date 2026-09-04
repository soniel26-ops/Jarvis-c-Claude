# JARVIS · executa um agente pelo Claude Code na sua máquina (Fase 4, opção B). Windows.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\agente.ps1 explorador
param([Parameter(Mandatory=$true)][ValidateSet("explorador","operador","conselheiro")][string]$Agente)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { Write-Host "✘ Claude Code (claude) não encontrado. Instale: npm i -g @anthropic-ai/claude-code ; depois: claude login"; exit 1 }
$mcp = ""; if (Test-Path server\.env) { $l = Select-String -Path server\.env -Pattern '^JARVIS_MCP_PERMITIDOS=(.*)$'; if ($l) { $mcp = $l.Matches[0].Groups[1].Value.Trim('"') } }
$hoje = Get-Date -Format "yyyy-MM-dd"; New-Item -ItemType Directory -Force data\logs, data\briefings | Out-Null
try { git pull --rebase --autostash -q } catch { Write-Host "⚠ git pull falhou; seguindo com a cópia local" }
$prompt = "Você está na raiz do repositório JARVIS ($(Get-Location)). Hoje é $hoje. Você é o agente '$Agente'. Leia o arquivo agents/$Agente.md inteiro e siga-o integralmente: colete o que ele pede usando os conectores disponíveis e grave os arquivos exatamente nos caminhos e formatos que ele indica (data/briefings/$hoje-$Agente.md e os campos de data/mission-data.json que pertencem a você). Não altere nenhum outro arquivo. Se um conector não estiver disponível, escreva INDISPONÍVEL onde couber e registre a falha em alertas. Ao terminar, imprima o relatório final."
$perm = "Read,Write,Edit,Glob,Grep,Bash(ls:*),Bash(cat:*),Bash(date:*)"; if ($mcp) { $perm += ",$mcp" }
Write-Host "→ $Agente · $hoje · ferramentas: $perm"
claude -p $prompt --allowedTools $perm --output-format text 2>&1 | Tee-Object -FilePath "data\logs\$hoje-$Agente.log"
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "sincronizar.ps1")
