#!/usr/bin/env bash
# JARVIS · abre o painel como janela de aplicativo (sem barra de endereço). Fase 5.
URL="http://localhost:${JARVIS_PORT:-8080}/mission-control/"
if [ "$(uname)" = "Darwin" ]; then
  for APP in "Google Chrome" "Microsoft Edge"; do [ -d "/Applications/$APP.app" ] && exec open -na "$APP" --args --app="$URL" --autoplay-policy=no-user-gesture-required; done
else
  for BIN in google-chrome chromium chromium-browser microsoft-edge; do command -v $BIN >/dev/null && exec $BIN --app="$URL" --autoplay-policy=no-user-gesture-required; done
fi
echo "Abra manualmente: $URL"
