# JARVIS · Windows: inicia o servidor ao fazer logon, em janela oculta (Agendador de Tarefas). Fase 5.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\servico\instalar-servico.ps1          (instala e inicia)
#      powershell -ExecutionPolicy Bypass -File scripts\servico\instalar-servico.ps1 -Remover
param([switch]$Remover)
$dir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$nome = "JARVIS Servidor"
if ($Remover) { schtasks /End /TN $nome 2>$null | Out-Null; schtasks /Delete /TN $nome /F | Out-Null; Write-Host "✔ removido"; exit 0 }
$node = (Get-Command node).Source
$cmd = "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"Set-Location '$dir\server'; & '$node' server.mjs *>> '$dir\data\logs\jarvis.log'`""
New-Item -ItemType Directory -Force "$dir\data\logs" | Out-Null
schtasks /Create /F /TN $nome /SC ONLOGON /RL LIMITED /TR $cmd | Out-Null
schtasks /Run /TN $nome | Out-Null
Write-Host "✔ '$nome' criado (inicia ao fazer logon) e iniciado agora. Log: $dir\data\logs\jarvis.log"
Write-Host "  Painel: http://localhost:8080/mission-control/"
