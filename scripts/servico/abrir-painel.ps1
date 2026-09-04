# JARVIS · abre o painel como janela de aplicativo (sem barra de endereço). Fase 5. Windows.
$url = "http://localhost:8080/mission-control/"
$c = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:ProgramFiles (x86)\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($c) { Start-Process $c "--app=$url --autoplay-policy=no-user-gesture-required" } else { Start-Process $url }
