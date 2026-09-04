# JARVIS · agenda os agentes e a sincronização no Agendador de Tarefas do Windows. Fase 4.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\agendar.ps1        (instala/atualiza)
#      powershell -ExecutionPolicy Bypass -File scripts\agendar.ps1 -Remover
param([switch]$Remover)
$dir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ps = "powershell.exe"
$tarefas = @(
  @{ Nome="JARVIS Explorador";  Hora="06:00"; Arg="-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dir\scripts\agente.ps1`" explorador" },
  @{ Nome="JARVIS Conselheiro"; Hora="06:20"; Arg="-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dir\scripts\agente.ps1`" conselheiro" },
  @{ Nome="JARVIS Sincronizar"; Hora="06:30"; Arg="-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dir\scripts\sincronizar.ps1`"" }
)
foreach ($t in $tarefas) {
  if ($Remover) { schtasks /Delete /TN $t.Nome /F 2>$null | Out-Null; Write-Host "✔ removida: $($t.Nome)"; continue }
  schtasks /Create /F /TN $t.Nome /SC DAILY /ST $t.Hora /TR "$ps $($t.Arg)" | Out-Null
  Write-Host "✔ agendada: $($t.Nome) às $($t.Hora)"
}
if (-not $Remover) {
  # Operador a cada 3 horas, das 08:00 às 20:00
  schtasks /Create /F /TN "JARVIS Operador" /SC HOURLY /MO 3 /ST 08:00 /ET 20:30 /TR "$ps -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dir\scripts\agente.ps1`" operador" | Out-Null
  Write-Host "✔ agendada: JARVIS Operador a cada 3h (08:00–20:00)"
  Write-Host "`nConfira em: Agendador de Tarefas → Biblioteca. As tarefas rodam só com o computador ligado e você logado."
} else { schtasks /Delete /TN "JARVIS Operador" /F 2>$null | Out-Null; Write-Host "✔ removida: JARVIS Operador" }
