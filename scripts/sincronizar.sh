#!/usr/bin/env bash
# JARVIS · versiona o que os agentes e o JARVIS escreveram e puxa o que veio de fora (Fases 4 e 6).
# Uso: ./scripts/sincronizar.sh     (seguro para rodar a qualquer hora; só toca em data/ e conhecimento/)
set -uo pipefail
cd "$(dirname "$0")/.."
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "✘ não é um repositório git"; exit 1; }
git add data conhecimento 2>/dev/null
if ! git diff --cached --quiet; then
  git commit -q -m "dados: $(date '+%Y-%m-%d %H:%M') ($(hostname))" && echo "✔ commit dos dados"
else echo "· nada novo para versionar"; fi
if git remote get-url origin >/dev/null 2>&1; then
  git pull --rebase --autostash -q && echo "✔ pull" || echo "⚠ pull falhou (rede? conflito?) — resolva com: git status"
  git push -q 2>/dev/null && echo "✔ push" || echo "⚠ push falhou (sem rede ou sem permissão)"
else echo "· sem remoto configurado; ficou só no histórico local"; fi
