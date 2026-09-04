# JARVIS · versiona o que os agentes e o JARVIS escreveram e puxa o que veio de fora (Fases 4 e 6). Windows.
Set-Location (Join-Path $PSScriptRoot "..")
git add data conhecimento 2>$null
git diff --cached --quiet; if ($LASTEXITCODE -ne 0) { git commit -q -m "dados: $(Get-Date -Format 'yyyy-MM-dd HH:mm') ($env:COMPUTERNAME)"; Write-Host "✔ commit dos dados" } else { Write-Host "· nada novo para versionar" }
git remote get-url origin 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { git pull --rebase --autostash -q; if ($LASTEXITCODE -eq 0) { Write-Host "✔ pull" } else { Write-Host "⚠ pull falhou" }; git push -q 2>$null; if ($LASTEXITCODE -eq 0) { Write-Host "✔ push" } else { Write-Host "⚠ push falhou" } }
else { Write-Host "· sem remoto configurado" }
