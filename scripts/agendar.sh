#!/usr/bin/env bash
# JARVIS · agenda os agentes e a sincronização no cron (macOS / Linux). Fase 4.
# Uso: ./scripts/agendar.sh            → instala/atualiza as linhas do JARVIS no crontab
#      ./scripts/agendar.sh --remover  → remove
# Horários (fuso do sistema): Explorador 06:00 · Conselheiro 06:20 · Operador a cada 3h das 08 às 20 · sincronizar 06:30 e 21:00
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
MARCA="# JARVIS"
ATUAL=$(crontab -l 2>/dev/null | grep -v "$MARCA" || true)
if [ "${1:-}" = "--remover" ]; then printf '%s\n' "$ATUAL" | crontab -; echo "✔ linhas do JARVIS removidas do crontab"; exit 0; fi
NOVAS="0 6 * * *   cd $DIR && ./scripts/agente.sh explorador  >> data/logs/cron.log 2>&1 $MARCA
20 6 * * *  cd $DIR && ./scripts/agente.sh conselheiro >> data/logs/cron.log 2>&1 $MARCA
0 8-20/3 * * * cd $DIR && ./scripts/agente.sh operador >> data/logs/cron.log 2>&1 $MARCA
30 6,21 * * * cd $DIR && ./scripts/sincronizar.sh >> data/logs/cron.log 2>&1 $MARCA"
printf '%s\n%s\n' "$ATUAL" "$NOVAS" | sed '/^$/d' | crontab -
echo "✔ crontab atualizado:"; crontab -l | grep "$MARCA"
echo
echo "Observações: no macOS, dê ao cron acesso total ao disco em Ajustes → Privacidade e Segurança → Acesso Total ao Disco (adicione /usr/sbin/cron)."
echo "Se o 'claude' não for encontrado pelo cron, adicione no topo do crontab:  PATH=$PATH"
