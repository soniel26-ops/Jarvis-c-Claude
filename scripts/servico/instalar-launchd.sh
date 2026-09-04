#!/usr/bin/env bash
# JARVIS · macOS: inicia o servidor no login e o mantém vivo (launchd). Fase 5.
# Uso: ./scripts/servico/instalar-launchd.sh            (instala)
#      ./scripts/servico/instalar-launchd.sh --remover
set -euo pipefail
DIR="$(cd "$(dirname "$0")/../.." && pwd)"
NODE="$(command -v node)"
PLIST="$HOME/Library/LaunchAgents/com.jarvis.server.plist"
if [ "${1:-}" = "--remover" ]; then launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true; rm -f "$PLIST"; echo "✔ serviço removido"; exit 0; fi
mkdir -p "$HOME/Library/LaunchAgents" "$DIR/data/logs"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.jarvis.server</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>server.mjs</string></array>
  <key>WorkingDirectory</key><string>$DIR/server</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/data/logs/jarvis.out.log</string>
  <key>StandardErrorPath</key><string>$DIR/data/logs/jarvis.err.log</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string></dict>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "✔ serviço instalado e iniciado: $PLIST"
echo "  logs: $DIR/data/logs/jarvis.out.log · parar: launchctl bootout gui/$(id -u) $PLIST"
