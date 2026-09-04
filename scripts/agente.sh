#!/usr/bin/env bash
# JARVIS · executa um agente pelo Claude Code na sua máquina (Fase 4, opção B).
# Uso: ./scripts/agente.sh explorador | operador | conselheiro
# Requer: Claude Code instalado e logado (claude --version) e, para o Explorador/Operador,
# os conectores (RevenueCat, Meta Ads, Gmail, Buffer…) configurados no Claude Code como servidores MCP.
# Ferramentas MCP permitidas: preencha JARVIS_MCP_PERMITIDOS em server/.env, ex.: mcp__revenuecat,mcp__meta-ads
set -euo pipefail
AGENTE=${1:?uso: agente.sh explorador|operador|conselheiro}
cd "$(dirname "$0")/.."
[ -f "agents/$AGENTE.md" ] || { echo "✘ agents/$AGENTE.md não existe"; exit 1; }
command -v claude >/dev/null || { echo "✘ Claude Code (claude) não encontrado. Instale: npm i -g @anthropic-ai/claude-code  e depois: claude login"; exit 1; }
[ -f server/.env ] && JARVIS_MCP_PERMITIDOS=$(grep -E '^JARVIS_MCP_PERMITIDOS=' server/.env | cut -d= -f2- | tr -d '"' || true)
HOJE=$(date +%F); mkdir -p data/logs data/briefings
git pull --rebase --autostash -q 2>/dev/null || echo "⚠ git pull falhou (sem remoto ou sem rede); seguindo com a cópia local"
PROMPT="Você está na raiz do repositório JARVIS ($(pwd)). Hoje é $HOJE. Você é o agente '$AGENTE'.
Leia o arquivo agents/$AGENTE.md inteiro e siga-o integralmente: colete o que ele pede usando os conectores disponíveis e grave os arquivos exatamente nos caminhos e formatos que ele indica (data/briefings/$HOJE-$AGENTE.md e os campos de data/mission-data.json que pertencem a você). Não altere nenhum outro arquivo. Se um conector não estiver disponível, escreva INDISPONÍVEL onde couber e registre a falha em alertas. Ao terminar, imprima o relatório final."
PERMITIDAS="Read,Write,Edit,Glob,Grep,Bash(ls:*),Bash(cat:*),Bash(date:*)${JARVIS_MCP_PERMITIDOS:+,$JARVIS_MCP_PERMITIDOS}"
echo "→ $AGENTE · $HOJE · ferramentas: $PERMITIDAS"
claude -p "$PROMPT" --allowedTools "$PERMITIDAS" --output-format text 2>&1 | tee "data/logs/$HOJE-$AGENTE.log"
./scripts/sincronizar.sh
